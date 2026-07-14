import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import crypto from "crypto";
import speakeasy from "speakeasy";
import jwt from "jsonwebtoken";
import qrcode from "qrcode";

import prisma from "../../db/db.config";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/apiResponse";
import { AuthService } from "../../services/AuthService";

export const generate2FA = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    return res
      .status(StatusCodes.NOT_FOUND)
      .json(new ApiResponse(StatusCodes.NOT_FOUND, null, "User not found"));
  }

  // Generate a secret
  const secret = speakeasy.generateSecret({ name: `KolabMe (${user.email})` });

  // Save secret temporarily in db (not enabled yet)
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorSecret: secret.base32 },
  });

  const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url || "");

  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(
        StatusCodes.OK,
        { qrCodeUrl, secret: secret.base32 },
        "2FA secret generated successfully",
      ),
    );
});

export const enable2FA = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { token } = req.body;

  if (!token) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(
        new ApiResponse(StatusCodes.BAD_REQUEST, null, "Token is required"),
      );
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user || !user.twoFactorSecret) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(
        new ApiResponse(StatusCodes.BAD_REQUEST, null, "2FA not initiated"),
      );
  }

  const isValid = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: "base32",
    token: token,
  });

  if (!isValid) {
    return res
      .status(StatusCodes.UNAUTHORIZED)
      .json(
        new ApiResponse(StatusCodes.UNAUTHORIZED, null, "Invalid 2FA token"),
      );
  }
  // Generate 5 recovery codes
  const recoveryCodes = Array.from({ length: 5 }, () =>
    crypto.randomBytes(4).toString("hex"),
  );

  await prisma.user.update({
    where: { id: userId },
    data: {
      isTwoFactorEnabled: true,
      twoFactorRecoveryCodes: recoveryCodes,
    },
  });

  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(
        StatusCodes.OK,
        { recoveryCodes },
        "2FA enabled successfully",
      ),
    );
});

export const verify2FA = asyncHandler(async (req: Request, res: Response) => {
  const { userId, token, isRecoveryCode } = req.body;

  if (!userId || !token) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(
        new ApiResponse(
          StatusCodes.BAD_REQUEST,
          null,
          "User ID and token are required",
        ),
      );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      client: true,
      provider: true,
      superAdmin: true,
    },
  });

  if (!user || !user.isTwoFactorEnabled) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(
        new ApiResponse(
          StatusCodes.BAD_REQUEST,
          null,
          "2FA is not enabled for this user",
        ),
      );
  }

  let isValid = false;

  if (isRecoveryCode) {
    if (user.twoFactorRecoveryCodes.includes(token)) {
      isValid = true;
      // Remove the used recovery code
      await prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorRecoveryCodes: {
            set: user.twoFactorRecoveryCodes.filter((c) => c !== token),
          },
        },
      });
    }
  } else {
    isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret!,
      encoding: "base32",
      token: token,
    });
  }

  if (!isValid) {
    return res
      .status(StatusCodes.UNAUTHORIZED)
      .json(
        new ApiResponse(
          StatusCodes.UNAUTHORIZED,
          null,
          "Invalid token or recovery code",
        ),
      );
  }

  const jwtSecret = process.env.JWT_SECRET || "default_secret";
  const authToken = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
    },
    jwtSecret,
    { expiresIn: "45m" },
  );

  const authService = new AuthService();
  const completeUserData = await authService.getCompleteUserData(
    user.id,
    user.role,
  );

  return res
    .status(StatusCodes.OK)
    .json(
      new ApiResponse(
        StatusCodes.OK,
        { token: authToken, user: completeUserData },
        "2FA verified successfully",
      ),
    );
});

export const disable2FA = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { token, isRecoveryCode } = req.body;

  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user || !user.isTwoFactorEnabled) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(
        new ApiResponse(StatusCodes.BAD_REQUEST, null, "2FA is not enabled"),
      );
  }

  // Verify the token before disabling
  if (!token) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json(
        new ApiResponse(
          StatusCodes.BAD_REQUEST,
          null,
          "2FA token required to disable",
        ),
      );
  }

  let isValid = false;

  if (isRecoveryCode) {
    if (user.twoFactorRecoveryCodes.includes(token)) {
      isValid = true;
    }
  } else {
    isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret!,
      encoding: "base32",
      token: token,
    });
  }

  if (!isValid) {
    return res
      .status(StatusCodes.UNAUTHORIZED)
      .json(
        new ApiResponse(
          StatusCodes.UNAUTHORIZED,
          null,
          "Invalid token or recovery code",
        ),
      );
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      isTwoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorRecoveryCodes: [],
    },
  });

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, null, "2FA disabled successfully"));
});
