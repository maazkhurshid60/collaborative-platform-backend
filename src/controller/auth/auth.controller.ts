import { Request, Response } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { StatusCodes } from "http-status-codes";

import { asyncHandler } from "../../utils/asyncHandler";
import { loginSchema, userSchema } from "../../schema/auth/auth.schema";
import { ApiResponse } from "../../utils/apiResponse";
import prisma from "../../db/db.config";

import { cookiesOptions } from "../../utils/constants";
import { generateResetToken } from "../../utils/generateResetPasswordToken";
import { sendResetPasswordEmail } from "../../utils/nodeMailer/ResetPassword";
import { sendVerifyEmailLink } from "../../utils/nodeMailer/VerifyEmailLink";
import { AuthService } from "../../services/AuthService";
import { SubscriptionService } from "../../services/SubscriptionService";
import { AuditLogService } from "../../services/AuditLogService";

const authService = new AuthService();
const subscriptionService = new SubscriptionService();

const signupApi = asyncHandler(async (req: Request, res: Response) => {
  const userParsedData = userSchema.safeParse(req.body);
  if (!userParsedData.success) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(
        new ApiResponse(
          StatusCodes.BAD_REQUEST,
          { error: userParsedData.error.errors },
          "Validation failed",
        ),
      );
  }
  const completeUserData = await authService.signup(req.body);

  const verifyToken = crypto.randomBytes(32).toString("hex");
  const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await prisma.user.update({
    where: { id: completeUserData.user.id },
    data: {
      verifyEmailToken: verifyToken,
      verifyEmailExpires: verifyExpires,
    },
  });

  try {
    await sendVerifyEmailLink(
      completeUserData.user.email,
      completeUserData.user.fullName,
      verifyToken,
    );
  } catch (err) {
    console.error("Failed to send verification email during signup:", err);
  }

  const jwtSecret = process.env.JWT_SECRET || "default_secret";
  const token = jwt.sign(
    {
      userId: completeUserData.user.id,
      email: completeUserData.user.email,
      role: completeUserData.user.role,
    },
    jwtSecret,
    { expiresIn: "45m" },
  );

  // Update the returned object so frontend knows it's unverified natively
  const finalUserData = {
    ...completeUserData,
    user: { ...completeUserData.user, isEmailVerified: false },
  };

  // Audit Log for User Signup
  await AuditLogService.createLog({
    userId: completeUserData.user.id,
    action: "USER SIGNUP",
    resource: "USER",
    resourceId: completeUserData.user.id,
    details: {
      email: completeUserData.user.email,
      role: completeUserData.user.role,
    },
  });

  return res
    .status(StatusCodes.CREATED)
    .json(
      new ApiResponse(
        StatusCodes.CREATED,
        { token, user: finalUserData },
        "User signed up successfully",
      ),
    );
});

const logInApi = asyncHandler(async (req: Request, res: Response) => {
  const parsedLoginData = loginSchema.safeParse(req.body);
  if (!parsedLoginData.success) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(
        new ApiResponse(
          StatusCodes.BAD_REQUEST,
          { error: parsedLoginData.error.errors },
          "Validation failed",
        ),
      );
  }

  const { email, password } = parsedLoginData.data;
  const loggedInUser = await authService.login(email, password);

  // Check for 2FA requirement (Only for providers currently)
  if (
    loggedInUser.user.role === "provider" &&
    loggedInUser.user.isTwoFactorEnabled
  ) {
    return res.status(StatusCodes.OK).json(
      new ApiResponse(
        StatusCodes.OK,
        {
          require2FA: true,
          userId: loggedInUser.user.id,
        },
        "Two-factor authentication required",
      ),
    );
  }

  const jwtSecret = process.env.JWT_SECRET || "default_secret";
  const token = jwt.sign(
    {
      userId: loggedInUser.user.id,
      email: loggedInUser.user.email,
      role: loggedInUser.user.role,
    },
    jwtSecret,
    { expiresIn: "45m" },
  );

  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(
        StatusCodes.OK,
        { token, user: loggedInUser },
        "Login successful",
      ),
    );
});

const logoutApi = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;

  if (userId) {
    await AuditLogService.createLog({
      userId,
      action: "LOGOUT",
      resource: "AUTH",
      details: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Clearing all possible token variants
  return res
    .clearCookie("accessToken", cookiesOptions)
    .clearCookie("token", cookiesOptions)
    .clearCookie("refreshToken", cookiesOptions)
    .status(200)
    .json(new ApiResponse(StatusCodes.OK, {}, "Logout successful"));
});

const changePasswordApi = asyncHandler(async (req: Request, res: Response) => {
  const { oldPassword, newPassword, loginUserId, confirmPassword, role } =
    req.body;

  if (!oldPassword || !newPassword) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(
        new ApiResponse(
          StatusCodes.BAD_REQUEST,
          { message: "All fields are required" },
          "Validation failed",
        ),
      );
  }

  if (newPassword !== confirmPassword) {
    return res
      .status(StatusCodes.CONFLICT)
      .json(
        new ApiResponse(
          StatusCodes.CONFLICT,
          { message: "Confirm and New Password should match" },
          "Validation failed",
        ),
      );
  }

  // Find User (source of truth for password)
  const user = await prisma.user.findUnique({
    where: { id: loginUserId },
  });

  if (!user) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(
        new ApiResponse(
          StatusCodes.BAD_REQUEST,
          { message: "User does not exist." },
          "Validation failed",
        ),
      );
  }

  const isPasswordMatch = await bcrypt.compare(oldPassword, user.password);

  if (isPasswordMatch) {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: loginUserId },
      data: { password: hashedPassword },
    });

    // Audit Log for Password Change
    await AuditLogService.createLog({
      userId: loginUserId,
      action: "CHANGE PASSWORD",
      resource: "USER",
      resourceId: loginUserId,
      details: { message: "User changed their password" },
    });

    return res
      .status(StatusCodes.OK)
      .json(
        new ApiResponse(
          StatusCodes.OK,
          { message: "Password has updated successfully" },
          "Password has updated successfully",
        ),
      );
  } else {
    return res
      .status(StatusCodes.CONFLICT)
      .json(
        new ApiResponse(
          StatusCodes.CONFLICT,
          { message: "Password not Matched" },
          "Password not Match",
        ),
      );
  }
});

const forgotPasswordApi = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;

  const user = await prisma.user.findFirst({ where: { email } });

  if (!user) {
    return res
      .status(StatusCodes.CONFLICT)
      .json(
        new ApiResponse(
          StatusCodes.CONFLICT,
          { error: `Email: ${email} is not found.` },
          "Validation failed",
        ),
      );
  }

  const { token, hashedToken } = generateResetToken();

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      resetPasswordToken: hashedToken,
      resetPasswordExpires: new Date(Date.now() + 1000 * 60 * 60), // 1 hour
    },
  });

  try {
    await sendResetPasswordEmail(email, user.fullName, token);
  } catch (err) {
    console.error("Failed to send reset email");
  }

  // Audit Log for Password Reset Request
  await AuditLogService.createLog({
    userId: user.id,
    action: "REQUEST PASSWORD RESET",
    resource: "USER",
    resourceId: user.id,
    details: { email },
  });

  return res
    .status(200)
    .json(
      new ApiResponse(200, { success: true }, "Reset link sent successfully"),
    );
});

const resetPasswordApi = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.params;
  const { newPassword } = req.body;

  const hashedToken = crypto
    .createHash("sha256")
    .update(token as string)
    .digest("hex");

  const user = await prisma.user.findFirst({
    where: {
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { gt: new Date() },
    },
  });

  if (!user) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(
        new ApiResponse(
          StatusCodes.BAD_REQUEST,
          { error: "Invalid or expired token" },
          "Token invalid",
        ),
      );
  }

  const hashedNewPassword = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedNewPassword,
      resetPasswordToken: null,
      resetPasswordExpires: null,
    },
  });

  // Audit Log for Password Reset
  await AuditLogService.createLog({
    userId: user.id,
    action: "RESET PASSWORD",
    resource: "USER",
    resourceId: user.id,
    details: { message: "User reset their password" },
  });

  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(
        StatusCodes.OK,
        { message: "Password reset successful" },
        "Success",
      ),
    );
});

const startTrialApi = asyncHandler(async (req: Request, res: Response) => {
  const { newProviderId, invitedById } = req.body;

  if (!newProviderId) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(
        new ApiResponse(
          StatusCodes.BAD_REQUEST,
          null,
          "newProviderId is required.",
        ),
      );
  }

  await subscriptionService.startTrial(newProviderId, invitedById);

  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(
        StatusCodes.OK,
        { message: "Trial started successfully." },
        "OK",
      ),
    );
});

const verifyInvitationToken = asyncHandler(
  async (req: Request, res: Response) => {
    const { token } = req.body;
    if (!token) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json(
          new ApiResponse(StatusCodes.BAD_REQUEST, null, "Token is required."),
        );
    }
    const invitation = await prisma.invitation.findUnique({
      where: {
        token: token,
      },
      include: {
        invitedBy: {
          select: {
            user: {
              select: {
                fullName: true,
                address: true,
                // country: true,
                state: true,
                licenseNo: true,
              },
            },
          },
        },
      },
    });

    if (!invitation || invitation.status !== "PENDING") {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json(
          new ApiResponse(
            StatusCodes.NOT_FOUND,
            null,
            "Invalid or expired token.",
          ),
        );
    }

    return res.status(StatusCodes.OK).json(
      new ApiResponse(
        StatusCodes.OK,
        {
          email: invitation.email,
          invitedByName: invitation.invitedBy.user.fullName,
        },
        "OK",
      ),
    );
  },
);

// Check if email or license number already exists (called before navigating to plan selection)
const checkEmailExistsApi = asyncHandler(
  async (req: Request, res: Response) => {
    const { email, licenseNo } = req.body;

    if (!email) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json(
          new ApiResponse(
            StatusCodes.BAD_REQUEST,
            { error: "Email is required" },
            "Validation failed",
          ),
        );
    }

    const existingEmail = await prisma.user.findUnique({
      where: { email },
    });

    if (existingEmail) {
      return res
        .status(StatusCodes.CONFLICT)
        .json(
          new ApiResponse(
            StatusCodes.CONFLICT,
            { exists: true, field: "Email" },
            "Email already registered",
          ),
        );
    }

    if (licenseNo) {
      const existingLicense = await prisma.user.findFirst({
        where: { licenseNo },
      });

      if (existingLicense) {
        return res
          .status(StatusCodes.CONFLICT)
          .json(
            new ApiResponse(
              StatusCodes.CONFLICT,
              { exists: true, field: "License Number" },
              "License Number already registered",
            ),
          );
      }
    }

    return res
      .status(StatusCodes.OK)
      .json(new ApiResponse(StatusCodes.OK, { exists: false }, "Available"));
  },
);

const verifyEmailApi = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.params;

  if (!token) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(
        new ApiResponse(
          StatusCodes.BAD_REQUEST,
          { error: "Token is required" },
          "Validation failed",
        ),
      );
  }

  const user = await prisma.user.findFirst({
    where: { verifyEmailToken: token as string },
  });

  if (!user) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(
        new ApiResponse(
          StatusCodes.BAD_REQUEST,
          { error: "Invalid verification token" },
          "Token invalid",
        ),
      );
  }
  if (user.isEmailVerified) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(
        new ApiResponse(
          StatusCodes.BAD_REQUEST,
          { error: "Email already verified" },
          "Email already verified",
        ),
      );
  }

  if (user.verifyEmailExpires && user.verifyEmailExpires < new Date()) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(
        new ApiResponse(
          StatusCodes.BAD_REQUEST,
          { error: "Token expired. Please request a new verification link." },
          "Token expired",
        ),
      );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      isEmailVerified: true,
      verifyEmailToken: null,
      verifyEmailExpires: null,
    },
  });

  // Audit Log for Email Verification
  await AuditLogService.createLog({
    userId: user.id,
    action: "VERIFY EMAIL",
    resource: "USER",
    resourceId: user.id,
    details: { message: "User verified their email address" },
  });

  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(
        StatusCodes.OK,
        { success: true },
        "Email verified successfully.",
      ),
    );
});

const resendVerificationEmailApi = asyncHandler(
  async (req: Request, res: Response) => {
    const loginUserId = (req as any).user.id;

    const user = await prisma.user.findUnique({ where: { id: loginUserId } });

    if (!user) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json(
          new ApiResponse(
            StatusCodes.NOT_FOUND,
            { error: "User not found" },
            "Not found",
          ),
        );
    }
    if (user.isEmailVerified) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json(
          new ApiResponse(
            StatusCodes.BAD_REQUEST,
            { error: "Email is already verified" },
            "Already verified",
          ),
        );
    }

    const verifyToken = crypto.randomBytes(32).toString("hex");
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await prisma.user.update({
      where: { id: loginUserId },
      data: {
        verifyEmailToken: verifyToken,
        verifyEmailExpires: verifyExpires,
      },
    });

    try {
      await sendVerifyEmailLink(user.email, user.fullName, verifyToken);
    } catch (err) {
      console.error("Failed to resend verification email:", err);
      return res
        .status(StatusCodes.INTERNAL_SERVER_ERROR)
        .json(
          new ApiResponse(
            StatusCodes.INTERNAL_SERVER_ERROR,
            { error: "Failed to send email" },
            "Server error",
          ),
        );
    }

    return res
      .status(StatusCodes.OK)
      .json(
        new ApiResponse(
          StatusCodes.OK,
          { success: true },
          "We've sent a new verification link to your email address. It will expire in 24 hours.",
        ),
      );
  },
);

export {
  signupApi,
  logInApi,
  logoutApi,
  changePasswordApi,
  forgotPasswordApi,
  resetPasswordApi,
  startTrialApi,
  verifyInvitationToken,
  checkEmailExistsApi,
  verifyEmailApi,
  resendVerificationEmailApi,
};
