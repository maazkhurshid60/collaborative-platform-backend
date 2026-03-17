import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { clientSchema, loginSchema, providerSchema, superAdminSchema, userSchema } from "../../schema/auth/auth.schema";
import { ApiResponse } from "../../utils/apiResponse";
import { StatusCodes } from "http-status-codes";
import prisma from "../../db/db.config";
import { Role, Gender, Approve } from "../../generated/prisma/enums";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { cookiesOptions } from "../../utils/constants";
import { generateResetToken } from "../../utils/generateResetPasswordToken";
import { sendResetPasswordEmail } from "../../utils/nodeMailer/ResetPassword";
import crypto from "crypto";
import { sendApprovalEmail } from "../../utils/nodeMailer/sendApprovalEmail";
import { sendVerifyEmailLink } from "../../utils/nodeMailer/VerifyEmailLink";
import { AuthService } from "../../services/AuthService";
import { UserService } from "../../services/UserService";
import { SubscriptionService } from "../../services/SubscriptionService";

const authService = new AuthService();
const userService = new UserService();
const subscriptionService = new SubscriptionService();

const signupApi = asyncHandler(async (req: Request, res: Response) => {
    // 1. Validate User Schema
    const userParsedData = userSchema.safeParse(req.body);
    if (!userParsedData.success) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: userParsedData.error.errors }, "Validation failed")
        );
    }

    // 2. Delegate to Service
    const completeUserData = await authService.signup(req.body);

    // Generate Verification Token and start email process
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await prisma.user.update({
        where: { id: completeUserData.user.id },
        data: {
            verifyEmailToken: verifyToken,
            verifyEmailExpires: verifyExpires
        }
    });

    try {
        await sendVerifyEmailLink(completeUserData.user.email, completeUserData.user.fullName, verifyToken);
    } catch (err) {
        console.error("Failed to send verification email during signup:", err);
    }

    const jwtSecret = process.env.JWT_SECRET || "default_secret";
    const token = jwt.sign(
        { userId: completeUserData.user.id, email: completeUserData.user.email, role: completeUserData.user.role },
        jwtSecret,
        { expiresIn: "45m" }
    );

    // Update the returned object so frontend knows it's unverified natively
    const finalUserData = {
        ...completeUserData,
        user: { ...completeUserData.user, isEmailVerified: false }
    };

    return res.status(StatusCodes.CREATED).json(
        new ApiResponse(StatusCodes.CREATED, { token, user: finalUserData }, "User signed up successfully")
    );
});
const updateMeApi = asyncHandler(async (req: Request, res: Response) => {
    const loginUserId = (req as any).user.id;

    if (req.body.age) req.body.age = Number(req.body.age);

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    let profileImageUpdate;
    if (files && files['profileImage'] && files['profileImage'].length > 0) {
        profileImageUpdate = (files['profileImage'][0] as any).location;
    }

    let eSignatureUpdate;
    if (files && files['eSignature'] && files['eSignature'].length > 0) {
        eSignatureUpdate = (files['eSignature'][0] as any).location;
    }

    const updatedUser = await userService.updateMe(loginUserId, {
        ...req.body,
        profileImageUpdate,
        eSignatureUpdate
    });

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, updatedUser, "User updated successfully")
    );
});

const logInApi = asyncHandler(async (req: Request, res: Response) => {
    const parsedLoginData = loginSchema.safeParse(req.body);
    if (!parsedLoginData.success) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: parsedLoginData.error.errors }, "Validation failed")
        );
    }

    const { email, password } = parsedLoginData.data;
    const loggedInUser = await authService.login(email, password);

    const jwtSecret = process.env.JWT_SECRET || "default_secret";
    const token = jwt.sign(
        { userId: loggedInUser.user.id, email: loggedInUser.user.email, role: loggedInUser.user.role },
        jwtSecret,
        { expiresIn: "45m" }
    );

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { token, user: loggedInUser }, "Login successful")
    );
});

const blockUserApi = asyncHandler(async (req: Request, res: Response) => {
    const { blockUserid, loginUserId } = req.body;

    // 1. Check if block user exists
    const isBlockUserExist = await prisma.user.findUnique({ where: { id: blockUserid } });
    if (!isBlockUserExist) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "User to be blocked not found" }, "Validation failed")
        );
    }

    // 2. Get login user (who wants to block someone)
    const loginUser = await prisma.user.findUnique({ where: { id: loginUserId } });
    if (!loginUser) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "Blocking user not found" }, "Validation failed")
        );
    }

    // 3. If already blocked, return early
    if (loginUser.blockedMembers.includes(blockUserid)) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { error: "User is already blocked" }, "Already blocked")
        );
    }

    // 4. Add blockUserid to blockedMembers list
    const updatedBlockedMembers = [...loginUser.blockedMembers, blockUserid];

    // 5. Update user
    const updatedUser = await prisma.user.update({
        where: { id: loginUserId },
        data: {
            blockedMembers: updatedBlockedMembers,
        },
    });

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { success: true }, "User blocked successfully")
    );
});

const getAllUsersApi = asyncHandler(async (req: Request, res: Response) => {
    const allUsers = await prisma.user.findMany({
        select: {
            id: true,
            fullName: true,
            email: true,
            licenseNo: true,
            age: true,
            contactNo: true,
            address: true,
            country: true,
            state: true,
            profileImage: true,
            isApprove: true,
            role: true,
            createdAt: true,
            client: true,
            provider: true
        }
    })
    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { totalDocument: allUsers.length, user: allUsers }, "User fetched successfully")
    );
})

// const approveValidUser = asyncHandler(async (req: Request, res: Response) => {
//     const { id, name, email } = req.body

//     const isUserExist = await prisma.user.findFirst({ where: { id } })
//     if (!isUserExist) {
//         return res.status(StatusCodes.NOT_FOUND).json(new ApiResponse(StatusCodes.NOT_FOUND, { message: "User doesnot exist." }, "Not Found Error"))
//     }

//     const isUserApproved = await prisma.user.update({
//         where: { id }, data: {
//             isApprove: "approve"
//         }
//     })
//     // await sendVerificationEmail(email, name);


//     if (isUserApproved) {
//         return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, { message: "User approved successfully." }, "Approve"))
//     }

// })


const approveValidUser = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.body;

    const user = await prisma.user.findFirst({
        where: { id },
        include: { client: true, provider: true, superAdmin: true },
    });

    if (!user) {
        return res.status(StatusCodes.NOT_FOUND).json(
            new ApiResponse(StatusCodes.NOT_FOUND, { message: "User does not exist." }, "Not Found Error")
        );
    }

    await prisma.user.update({
        where: { id },
        data: { isApprove: Approve.APPROVED },
    });

    const email = user.email;

    if (email) {
        try {
            // For clients: look up their generated clientId; for providers: use licenseNo
            let clientId: string | null = null;
            if (user.role === Role.client) {
                const clientRecord = await prisma.client.findUnique({ where: { userId: user.id }, select: { clientId: true } });
                clientId = clientRecord?.clientId ?? null;
            }
            await sendApprovalEmail(email, user.fullName, clientId, user.role !== Role.client ? (user.licenseNo ?? undefined) : undefined);
        } catch (err) {
            console.error("Approval email failed:", err);
            // Do not fail approval just because email failed
        }
    }

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { message: "User approved successfully." }, "Approve")
    );
});

const rejectUser = asyncHandler(async (req: Request, res: Response) => {
    const { id, name } = req.body // removed email from destructuring as we get it from DB if needed, or unused.

    const user = await prisma.user.findFirst({ where: { id } })
    if (!user) {
        return res.status(StatusCodes.NOT_FOUND).json(new ApiResponse(StatusCodes.NOT_FOUND, { message: "User doesnot exist." }, "Not Found Error"))
    }

    const isUserApproved = await prisma.user.update({
        where: { id }, data: {
            isApprove: Approve.REJECTED
        }
    })

    // If we need to send email, use user.email
    // await sendVerificationEmail(user.email, name);

    if (isUserApproved) {
        return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, { message: "User rejected successfully." }, "reject"))
    }

})
const restoreUser = asyncHandler(async (req: Request, res: Response) => {
    const { id, name } = req.body

    const user = await prisma.user.findFirst({ where: { id } })
    if (!user) {
        return res.status(StatusCodes.NOT_FOUND).json(new ApiResponse(StatusCodes.NOT_FOUND, { message: "User doesnot exist." }, "Not Found Error"))
    }

    const isUserApproved = await prisma.user.update({
        where: { id }, data: {
            isApprove: Approve.PENDING
        }
    })

    // if email needed, use user.email
    // await sendVerificationEmail(user.email, name);


    if (isUserApproved) {
        return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, { message: "User restored successfully." }, "restore"))
    }

})

const getAllValidUsersApi = asyncHandler(async (req: Request, res: Response) => {
    const allUsers = await prisma.user.findMany({
        where: {
            isApprove: Approve.APPROVED,
            NOT: {
                role: Role.superAdmin
            }
        },
        select: {
            id: true,
            fullName: true,
            email: true,
            licenseNo: true,
            age: true,
            contactNo: true,
            address: true,
            country: true,
            state: true,
            profileImage: true,
            isApprove: true,
            role: true,
            createdAt: true,
            client: true,
            provider: true
        }
    })
    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { totalDocument: allUsers.length, user: allUsers }, "User fetched successfully")
    );
})

const unblockUserApi = asyncHandler(async (req: Request, res: Response) => {
    const { blockUserid, loginUserId } = req.body;

    // 1. Check if block user exists
    const isBlockUserExist = await prisma.user.findUnique({ where: { id: blockUserid } });
    if (!isBlockUserExist) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "User to be blocked not found" }, "Validation failed")
        );
    }

    // 2. Get login user (who wants to block someone)
    const loginUser = await prisma.user.findUnique({ where: { id: loginUserId } });
    if (!loginUser) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "Blocking user not found" }, "Validation failed")
        );
    }

    const updatedBlockedMembersList = loginUser.blockedMembers?.filter(data => data !== blockUserid)
    const updatedUser = await prisma.user.update({
        where: { id: loginUserId },
        data: {
            blockedMembers: updatedBlockedMembersList,
        },
    });

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { user: updatedUser }, "User unblocked successfully")
    );
})

const logoutApi = asyncHandler(async (req: Request, res: Response) => {
    // Clearing all possible token variants
    return res
        .clearCookie("accessToken", cookiesOptions)
        .clearCookie("token", cookiesOptions)
        .clearCookie("refreshToken", cookiesOptions)
        .status(200)
        .json(new ApiResponse(StatusCodes.OK, {}, "Logout successful"));
});

const deleteMeAccountApi = asyncHandler(async (req: Request, res: Response) => {
    const loginUserId = (req as any).user.id;
    await userService.deleteMe(loginUserId);
    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, {}, "User deleted successfully")
    );
});
const getMeApi = asyncHandler(async (req: Request, res: Response) => {
    const loginUserId = (req as any).user.id;
    const role = (req as any).user.role;

    const meData = await userService.getMe(loginUserId, role);

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, meData, "OK")
    );
});
const findByLicenseNo = asyncHandler(async (req: Request, res: Response) => {
    // Accept either clientId (for clients) or licenseNo (for providers — legacy)
    let { clientId, licenseNo } = req.body;

    if (clientId) clientId = clientId.trim();
    if (licenseNo) licenseNo = licenseNo.trim();

    if (!clientId && !licenseNo) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "Client ID is required" }, "Validation failed")
        );
    }

    let foundUser: any = null;

    if (clientId) {
        // New flow: clients look up by their auto-generated clientId
        const clientRecord = await prisma.client.findUnique({
            where: { clientId },
            include: {
                user: true
            }
        });

        if (!clientRecord) {
            return res.status(StatusCodes.NOT_FOUND).json(
                new ApiResponse(StatusCodes.NOT_FOUND, { error: "Client ID not found" }, "Record not found")
            );
        }

        // Return in same shape as the old licenseNo response so frontend works
        foundUser = {
            ...clientRecord.user,
            client: { id: clientRecord.id, isAccountCreatedByOwnClient: clientRecord.isAccountCreatedByOwnClient, clientId: clientRecord.clientId }
        };
    } else {
        // Legacy: look up by licenseNo (for providers or old clients)
        foundUser = await prisma.user.findFirst({
            where: { licenseNo },
            include: { client: true }
        });

        if (!foundUser) {
            return res.status(StatusCodes.NOT_FOUND).json(
                new ApiResponse(StatusCodes.NOT_FOUND, { error: "License number not found" }, "Record not found")
            );
        }
    }

    // Remove passwords before returning
    if (foundUser.client && (foundUser.client as any).password) {
        delete (foundUser.client as any).password;
    }
    if (foundUser.password) {
        delete foundUser.password;
    }

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, foundUser, "Record found.")
    );
})

const changePasswordApi = asyncHandler(async (req: Request, res: Response) => {
    const { oldPassword, newPassword, loginUserId, confirmPassword, role } = req.body;

    if (!oldPassword || !newPassword) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { message: "All fields are required" }, "Validation failed")
        );
    }

    if (newPassword !== confirmPassword) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { message: "Confirm and New Password should match" }, "Validation failed")
        );
    }

    // Find User (source of truth for password)
    const user = await prisma.user.findUnique({
        where: { id: loginUserId }
    });

    if (!user) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { message: "User does not exist." }, "Validation failed")
        );
    }

    const isPasswordMatch = await bcrypt.compare(oldPassword, user.password);

    if (isPasswordMatch) {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: loginUserId },
            data: { password: hashedPassword }
        });

        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, { message: "Password has updated successfully" }, "Password has updated successfully")
        );
    } else {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { message: "Password not Matched" }, "Password not Match")
        );
    }
});

const forgotPasswordApi = asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;

    const user = await prisma.user.findFirst({ where: { email } });

    if (!user) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { error: `Email: ${email} is not found.` }, "Validation failed")
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

    return res.status(200).json(
        new ApiResponse(200, { success: true }, "Reset link sent successfully")
    );
});


const resetPasswordApi = asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.params;
    const { newPassword } = req.body;

    const hashedToken = crypto.createHash("sha256").update(token as string).digest("hex");

    const user = await prisma.user.findFirst({
        where: {
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { gt: new Date() },
        },
    });

    if (!user) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "Invalid or expired token" }, "Token invalid")
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

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { message: "Password reset successful" }, "Success")
    );
});


const startTrialApi = asyncHandler(async (req: Request, res: Response) => {
    const { newProviderId, invitedById } = req.body;

    if (!newProviderId) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, null, "newProviderId is required.")
        );
    }

    await subscriptionService.startTrial(newProviderId, invitedById);

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { message: "Trial started successfully." }, "OK")
    );
});

const verifyInvitationToken = asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.body;
    if (!token) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, null, "Token is required.")
        );
    }
    const invitation = await prisma.invitation.findUnique({
        where: {
            token: token
        },
        include: {
            invitedBy: {
                select: {
                    user: {
                        select: {
                            fullName: true,
                            address: true,
                            country: true,
                            state: true,
                            licenseNo: true
                        }
                    }
                }
            }
        }
    })

    if (!invitation || invitation.status !== "PENDING") {
        return res.status(StatusCodes.NOT_FOUND).json(
            new ApiResponse(StatusCodes.NOT_FOUND, null, "Invalid or expired token.")
        )
    }

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, {
            email: invitation.email,
            invitedByName: invitation.invitedBy.user.fullName,
        }, "OK")
    )
})

// Check if email or license number already exists (called before navigating to plan selection)
const checkEmailExistsApi = asyncHandler(async (req: Request, res: Response) => {
    const { email, licenseNo } = req.body;

    if (!email) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "Email is required" }, "Validation failed")
        );
    }

    const existingEmail = await prisma.user.findUnique({
        where: { email }
    });

    if (existingEmail) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { exists: true, field: 'Email' }, "Email already registered")
        );
    }

    if (licenseNo) {
        const existingLicense = await prisma.user.findFirst({
            where: { licenseNo }
        });

        if (existingLicense) {
            return res.status(StatusCodes.CONFLICT).json(
                new ApiResponse(StatusCodes.CONFLICT, { exists: true, field: 'License Number' }, "License Number already registered")
            );
        }
    }

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { exists: false }, "Available")
    );
});

const verifyEmailApi = asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.params;

    if (!token) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "Token is required" }, "Validation failed")
        );
    }

    const user = await prisma.user.findFirst({
        where: { verifyEmailToken: token as string }
    });

    if (!user) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "Invalid verification token" }, "Token invalid")
        );
    }
    if (user.isEmailVerified) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "Email already verified" }, "Email already verified")
        );
    }

    if (user.verifyEmailExpires && user.verifyEmailExpires < new Date()) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "Token expired. Please request a new verification link." }, "Token expired")
        );
    }

    await prisma.user.update({
        where: { id: user.id },
        data: {
            isEmailVerified: true,
            verifyEmailToken: null,
            verifyEmailExpires: null,
        }
    });

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { success: true }, "Email verified successfully")
    );
});

const resendVerificationEmailApi = asyncHandler(async (req: Request, res: Response) => {
    const loginUserId = (req as any).user.id;

    const user = await prisma.user.findUnique({ where: { id: loginUserId } });

    if (!user) {
        return res.status(StatusCodes.NOT_FOUND).json(
            new ApiResponse(StatusCodes.NOT_FOUND, { error: "User not found" }, "Not found")
        );
    }

    if (user.isEmailVerified) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "Email is already verified" }, "Already verified")
        );
    }

    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await prisma.user.update({
        where: { id: loginUserId },
        data: {
            verifyEmailToken: verifyToken,
            verifyEmailExpires: verifyExpires
        }
    });

    try {
        await sendVerifyEmailLink(user.email, user.fullName, verifyToken);
    } catch (err) {
        console.error("Failed to resend verification email:", err);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(
            new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, { error: "Failed to send email" }, "Server error")
        );
    }

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { success: true }, "Verification email sent successfully")
    );
});


export {
    signupApi, logInApi, blockUserApi, unblockUserApi, logoutApi, updateMeApi, deleteMeAccountApi, approveValidUser, rejectUser, restoreUser,
    getMeApi, getAllUsersApi, findByLicenseNo, changePasswordApi, forgotPasswordApi, resetPasswordApi, getAllValidUsersApi, startTrialApi, verifyInvitationToken,
    checkEmailExistsApi, verifyEmailApi, resendVerificationEmailApi
};
