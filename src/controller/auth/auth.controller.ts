import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { clientSchema, loginSchema, providerSchema, superAdminSchema, userSchema } from "../../schema/auth/auth.schema";
import { ApiResponse } from "../../utils/apiResponse";
import { StatusCodes } from "http-status-codes";
import prisma from "../../db/db.config";
import { Role } from "@prisma/client";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { cookiesOptions } from "../../utils/constants";
import { generateResetToken } from "../../utils/generateResetPasswordToken";
import { sendResetPasswordEmail } from "../../utils/nodeMailer/ResetPassword";
import crypto from "crypto";
import { stripe, STRIPE_PRICES } from "../../utils/stripe/stripe";
import { sendApprovalEmail } from "../../utils/nodeMailer/sendApprovalEmail";




const signupApi = asyncHandler(async (req: Request, res: Response) => {
    // 1. Validate User Schema
    const userParsedData = userSchema.safeParse(req.body);
    if (!userParsedData.success) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: userParsedData.error.errors }, "Validation failed")
        );
    }

    const { fullName, gender = "male", age, contactNo, address, status = "active", licenseNo, role, isApprove, country, state, publicKey, privateKey } = userParsedData.data;

    // 2. Check if User (LicenseNo) Exists
    const existingUser = await prisma.user.findFirst({ where: { licenseNo } });
    if (existingUser) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { error: `License Number ${licenseNo} is already registered.` }, "Validation failed")
        );
    }

    // 3. Prepare Role Data & Pre-validate Uniqueness
    let roleData: any = {};
    let createRoleCallback: (startTransaction: any, userId: string) => Promise<any>;

    if (role === Role.client) {
        const clientParsed = clientSchema.safeParse(req.body);
        if (!clientParsed.success) {
            return res.status(StatusCodes.BAD_REQUEST).json(
                new ApiResponse(StatusCodes.BAD_REQUEST, { error: clientParsed.error.errors }, "Validation failed")
            );
        }
        const { isAccountCreatedByOwnClient, email, password } = clientParsed.data;

        // Check duplicate client email
        const existingClient = await prisma.client.findFirst({ where: { email } });
        if (existingClient) {
            return res.status(StatusCodes.CONFLICT).json(
                new ApiResponse(StatusCodes.CONFLICT, { error: `Email: ${email} is already taken.` }, "Validation failed")
            );
        }

        const hashedPassword = await bcrypt.hash(password ?? "", 10);

        createRoleCallback = async (tx, userId) => {
            return await tx.client.create({
                data: { userId, isAccountCreatedByOwnClient, email, password: hashedPassword },
                include: { user: true }
            });
        };

    } else if (role === Role.provider) {
        const providerParsed = providerSchema.safeParse(req.body);
        if (!providerParsed.success) {
            return res.status(StatusCodes.BAD_REQUEST).json(
                new ApiResponse(StatusCodes.BAD_REQUEST, { error: providerParsed.error.errors }, "Validation failed")
            );
        }

        const { department, email, password, inviteToken } = providerParsed.data;

        // Check duplicate provider email
        const existingProvider = await prisma.provider.findFirst({ where: { email } });
        if (existingProvider) {
            return res.status(StatusCodes.CONFLICT).json(
                new ApiResponse(StatusCodes.CONFLICT, { error: `Email: ${email} is already taken.` }, "Validation failed")
            );
        }

        const hashedPassword = await bcrypt.hash(password ?? "", 10);
        roleData = { inviteToken, email }; // Store for post-transaction logic

        createRoleCallback = async (tx, userId) => {
            return await tx.provider.create({
                data: { userId, department, email, password: hashedPassword },
                include: { user: true }
            });
        };

    } else if (role === Role.superadmin) {
        const superAdminParsed = superAdminSchema.safeParse(req.body);
        if (!superAdminParsed.success) {
            return res.status(StatusCodes.BAD_REQUEST).json(
                new ApiResponse(StatusCodes.BAD_REQUEST, { error: superAdminParsed.error.errors }, "Validation failed")
            );
        }

        const { email, password } = superAdminParsed.data;

        // Check duplicate superadmin email
        const existingSuperAdmin = await prisma.superAdmin.findFirst({ where: { email } });
        if (existingSuperAdmin) {
            return res.status(StatusCodes.CONFLICT).json(
                new ApiResponse(StatusCodes.CONFLICT, { error: `Email: ${email} is already taken.` }, "Validation failed")
            );
        }

        const hashedPassword = await bcrypt.hash(password ?? "", 10);

        createRoleCallback = async (tx, userId) => {
            return await tx.superAdmin.create({
                data: { userId, email, password: hashedPassword },
                include: { user: true }
            });
        };
    } else {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "Invalid Role" }, "Validation failed")
        );
    }

    // 4. Atomic Creation Transaction
    const result = await prisma.$transaction(async (tx) => {
        const userData: any = {
            fullName, gender, age, contactNo, address, status, licenseNo, role, isApprove: "pending", country, state, publicKey, privateKey
        };

        // Optional fields
        if (gender !== undefined) userData.gender = gender;
        if (age !== undefined) userData.age = age;
        if (contactNo !== undefined) userData.contactNo = contactNo;
        if (address !== undefined) userData.address = address;
        if (status !== undefined) userData.status = status;

        const userCreated = await tx.user.create({ data: userData });

        const roleCreated = await createRoleCallback(tx, userCreated.id);

        return roleCreated;
    });

    // 5. Post-Transaction Logic (e.g., Invitations for Providers)
    if (role === Role.provider && roleData.inviteToken) {
        try {
            const invitation = await prisma.invitation.findUnique({
                where: { token: roleData.inviteToken, status: "PENDING" }
            });

            if (invitation && invitation.email === roleData.email) {
                const inviterId = invitation.invitedById;
                const newProviderId = result.id;

                const inviter = await prisma.provider.findUnique({ where: { id: inviterId } });

                if (inviter && inviterId !== newProviderId) {
                    const [a, b] = [newProviderId, inviterId].sort();
                    await prisma.chatChannel.upsert({
                        where: {
                            providerAId_providerBId: {
                                providerAId: a,
                                providerBId: b
                            }
                        },
                        update: {},
                        create: {
                            providerAId: a,
                            providerBId: b
                        }
                    });

                    await prisma.invitation.update({
                        where: { id: invitation.id },
                        data: { status: "ACCEPTED" }
                    });

                    console.log(`✅ Automatic chat channel created and invitation accepted for token: ${roleData.inviteToken}`);
                }
            } else {
                console.warn(`⚠️ Invalid, mismatched or already accepted invitation token: ${roleData.inviteToken}`);
            }
        } catch (chatError) {
            console.error("❌ Error during invitation processing:", chatError);
        }
    }

    // 6. Response
    const message = role === Role.client
        ? "Your account has been sent to the super admin for verification. You will receive a verification email once approved, after which you'll be able to log in."
        : "Your account has been created successfully. Please log in to continue.";

    if (result && (result as any).password) {
        delete (result as any).password;
    }

    return res.status(StatusCodes.CREATED).json(
        new ApiResponse(StatusCodes.CREATED, result, message)
    );
});
const updateMeApi = asyncHandler(async (req: Request, res: Response) => {
    const { loginUserId } = req.body;

    if (req.body.age) {
        req.body.age = Number(req.body.age);
    }

    if (req.body.isAccountCreatedByOwnClient) {
        req.body.isAccountCreatedByOwnClient = req.body.isAccountCreatedByOwnClient === "true";
    }

    const files = req.files as {
        profileImage?: Express.Multer.File[];
        eSignature?: Express.Multer.File[];
    };

    const profileImage = files?.profileImage?.[0] as any;;
    const eSignature = files?.eSignature?.[0] as any;


    const existingUser = await prisma.user.findFirst({
        where: { id: loginUserId },
        select: { profileImage: true, role: true }
    });



    if (!existingUser) {
        return res.status(StatusCodes.NOT_FOUND).json(
            new ApiResponse(StatusCodes.NOT_FOUND, { error: "User does not exist." }, "Not Found Error.")
        );
    }

    // let profileImageUpdate: string = "null";
    let profileImageUpdate: string | undefined = undefined;

    if (profileImage) {
        profileImageUpdate = profileImage.location;
    }


    const userParsedData = userSchema.safeParse({
        ...req.body,
        profileImage: profileImageUpdate !== undefined ? profileImageUpdate : existingUser.profileImage
    });

    if (!userParsedData.success) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: userParsedData.error.errors }, "Validation failed")
        );
    }

    const { fullName, gender, age, contactNo, address, status, licenseNo, role, country, state } = userParsedData.data;

    const updatedUser = await prisma.user.update({
        where: { id: loginUserId },
        data: {
            fullName,
            gender,
            age,
            contactNo,
            address,
            status,
            licenseNo,
            role, isApprove: "approve"
            , country, state,
            // Only update profileImage if it was explicitly changed
            ...(profileImageUpdate !== undefined && { profileImage: profileImageUpdate })
        }
    });

    // Handle Client Update
    if (role === Role.client) {

        const clientParsed = clientSchema.safeParse(req.body);
        if (!clientParsed.success) {
            return res.status(StatusCodes.BAD_REQUEST).json(
                new ApiResponse(StatusCodes.BAD_REQUEST, { error: clientParsed.error.errors }, "Validation failed")
            );
        }

        const { email, password } = clientParsed.data;

        const existingClient = await prisma.client.findFirst({
            where: { email, NOT: { userId: loginUserId } }
        });

        if (existingClient) {
            return res.status(StatusCodes.CONFLICT).json(
                new ApiResponse(StatusCodes.CONFLICT, { error: `Email: ${email} is already taken.` }, "Validation failed")
            );
        }

        const updateData: any = {
            email,
        };

        const oldClient = await prisma.client.findFirst({
            where: { userId: loginUserId },
            select: { password: true }
        });

        // if (password && password.trim() !== "") {
        //     updateData.password = await bcrypt.hash(password, 10);
        // } else {
        //     updateData.password = oldClient?.password;
        // }
        // Handle eSignature updates
        const wantsRemove = String(req.body.eSignature).toLowerCase() === "null";

        if (eSignature) {
            updateData.eSignature = eSignature.location;
        } else if (wantsRemove) {
            updateData.eSignature = "null";
        }
        const userId = String(loginUserId);

        const clientUpdate = await prisma.client.update({
            where: { userId },
            data: updateData,
            include: { user: true }
        });


        if (clientUpdate && (clientUpdate as any).password) {
            delete (clientUpdate as any).password;
        }

        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, clientUpdate, "User updated successfully")
        );
    }

    // Handle Provider Update
    else if (role === Role.provider) {
        const providerParsed = providerSchema.safeParse(req.body);
        if (!providerParsed.success) {
            return res.status(StatusCodes.BAD_REQUEST).json(
                new ApiResponse(StatusCodes.BAD_REQUEST, { error: providerParsed.error.errors }, "Validation failed")
            );
        }

        const { email, password, department } = providerParsed.data;

        const existingProvider = await prisma.provider.findFirst({
            where: { email, NOT: { userId: loginUserId } }
        });

        if (existingProvider) {
            return res.status(StatusCodes.CONFLICT).json(
                new ApiResponse(StatusCodes.CONFLICT, { error: `Email: ${email} is already taken.` }, "Validation failed")
            );
        }

        const updateData: any = {
            email,
            department,
        };

        if (password && password.trim() !== "") {
            updateData.password = await bcrypt.hash(password, 10);
        }

        const providerUpdate = await prisma.provider.update({
            where: { userId: loginUserId },
            data: updateData,
            include: { user: true }
        });

        if (providerUpdate && (providerUpdate as any).password) {
            delete (providerUpdate as any).password;
        }

        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, providerUpdate, "User updated successfully")
        );
    }
});

const logInApi = asyncHandler(async (req: Request, res: Response) => {
    const parsedLoginData = loginSchema.safeParse(req.body);

    if (!parsedLoginData.success) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: parsedLoginData.error.errors }, "Validation failed")
        );
    }

    const { email, password } = parsedLoginData.data;

    // Check in superadmin table first
    const superAdmin = await prisma.superAdmin.findFirst({
        where: { email },
        include: { user: true },
    });

    if (superAdmin) {
        const isPasswordValid = await bcrypt.compare(password, superAdmin.password);
        if (!isPasswordValid) {
            return res.status(StatusCodes.UNAUTHORIZED).json(
                new ApiResponse(StatusCodes.UNAUTHORIZED, { error: "Incorrect password" }, "Authentication failed")
            );
        }

        const jwtSecret = process.env.JWT_SECRET || "default_secret";
        const token = jwt.sign(
            { userId: superAdmin.user.id, email: superAdmin.email, role: "superadmin" },
            jwtSecret,
            { expiresIn: "45m" }
        );

        if (superAdmin && (superAdmin as any).password) {
            delete (superAdmin as any).password;
        }

        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, { token, user: superAdmin }, "Login successful")
        );
    }

    // Fallback: Check in provider or client
    const user = await prisma.provider.findFirst({
        where: { email },
        include: {
            user: true,
            clientList: {
                select: {
                    client: {
                        select: {
                            user: {
                                select: {
                                    fullName: true
                                }
                            }
                        }
                    }
                }
            }
        }
    }) || await prisma.client.findFirst({
        where: { email },
        include: {
            user: true,
            providerList: true
        }
    });

    if (!user) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: `Email: ${email} not found` }, "Validation failed")
        );
    }

    if (!user.password) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "Password not set for this account" }, "Validation failed")
        );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
        return res.status(StatusCodes.UNAUTHORIZED).json(
            new ApiResponse(StatusCodes.UNAUTHORIZED, { error: "Password is wrong" }, "Authentication failed")
        );
    }

    const role = user?.user?.role;

    const jwtSecret = process.env.JWT_SECRET || "default_secret";
    const token = jwt.sign(
        { userId: user.id, email: user.email, role },
        jwtSecret,
        { expiresIn: "45m" }
    );

    if (user && (user as any).password) {
        delete (user as any).password;
    }

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { token, user }, "Login successful")
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
        new ApiResponse(StatusCodes.OK, { user: updatedUser }, "User blocked successfully")
    );
});

const getAllUsersApi = asyncHandler(async (req: Request, res: Response) => {
    const allUsers = await prisma.user.findMany({
        select: {
            id: true,
            fullName: true,
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
            client: {
                select: {
                    email: true
                }
            },
            provider: {
                select: {
                    email: true
                }
            }
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
            new ApiResponse(StatusCodes.NOT_FOUND, { message: "User doesnot exist." }, "Not Found Error")
        );
    }

    await prisma.user.update({
        where: { id },
        data: { isApprove: "approve" },
    });

    const email =
        user.client?.email ||
        user.provider?.email ||
        user.superAdmin?.email;

    if (email) {
        try {
            await sendApprovalEmail(email, user.fullName, user.licenseNo);
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
    const { id, name, email } = req.body

    const isUserExist = await prisma.user.findFirst({ where: { id } })
    if (!isUserExist) {
        return res.status(StatusCodes.NOT_FOUND).json(new ApiResponse(StatusCodes.NOT_FOUND, { message: "User doesnot exist." }, "Not Found Error"))
    }

    const isUserApproved = await prisma.user.update({
        where: { id }, data: {
            isApprove: "reject"
        }
    })
    // await sendVerificationEmail(email, name);


    if (isUserApproved) {
        return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, { message: "User rejected successfully." }, "reject"))
    }

})
const restoreUser = asyncHandler(async (req: Request, res: Response) => {
    const { id, name, email } = req.body

    const isUserExist = await prisma.user.findFirst({ where: { id } })
    if (!isUserExist) {
        return res.status(StatusCodes.NOT_FOUND).json(new ApiResponse(StatusCodes.NOT_FOUND, { message: "User doesnot exist." }, "Not Found Error"))
    }

    const isUserApproved = await prisma.user.update({
        where: { id }, data: {
            isApprove: "pending"
        }
    })
    // await sendVerificationEmail(email, name);


    if (isUserApproved) {
        return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, { message: "User restored successfully." }, "restore"))
    }

})

const getAllValidUsersApi = asyncHandler(async (req: Request, res: Response) => {
    const allUsers = await prisma.user.findMany({ where: { isApprove: "approve" } })
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
    // Clearing the cookies by setting them to empty with an expiration time in the past
    return res
        .clearCookie("accessToken", cookiesOptions)
        .clearCookie("refreshToken", cookiesOptions)
        .status(200)
        .json(new ApiResponse(StatusCodes.OK, {}, "Logout successful"));
});

const deleteMeAccountApi = asyncHandler(async (req: Request, res: Response) => {
    const { loginUserId } = req.body

    const isUserExist = await prisma.user.findFirst({ where: { id: loginUserId } })

    if (!isUserExist) {
        return res.status(StatusCodes.NOT_FOUND).json(new ApiResponse(StatusCodes.NOT_FOUND, { message: "User doesnot exist." }, "Not Found Error"))
    }


    const isUserDeleted = await prisma.user.delete({ where: { id: loginUserId } })

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { message: "" }, "User deleted successfully")
    );

})
const getMeApi = asyncHandler(async (req: Request, res: Response) => {
    const { loginUserId, role } = req.body

    let getMeDetails
    // Handle Clients
    if (role === Role.client) {
        getMeDetails = await prisma.client.findFirst({ where: { id: loginUserId }, include: { user: true } })
        // getMeDetails = await prisma.client.findFirst({
        //     where: { userId: loginUserId },
        //     include: { user: true }
        // });

        if (getMeDetails && (getMeDetails as any).password) {
            delete (getMeDetails as any).password;
        }

        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, { data: getMeDetails }, "OK")
        );


    }
    // Handle Provider
    else if (role === Role.provider) {
        getMeDetails = await prisma.provider.findFirst({
            where: { id: loginUserId }, include: {
                user: true,
                clientList: {
                    select: {
                        client: {
                            select: {
                                user: {
                                    select: {
                                        fullName: true
                                    }
                                }
                            }
                        }
                    }
                }
            }
        })

        if (getMeDetails && (getMeDetails as any).password) {
            delete (getMeDetails as any).password;
        }

        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, { data: getMeDetails }, "OK")
        );
    }
});
const findByLicenseNo = asyncHandler(async (req: Request, res: Response) => {
    const { licenseNo } = req.body
    if (licenseNo === "") {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { message: " licenseNo isrequired" }, "Validation failed")
        );
    }

    const licenseNoFound = await prisma.user.findFirst({
        where: { licenseNo }, include: { client: true }
    })

    if (licenseNoFound && licenseNoFound.client && (licenseNoFound.client as any).password) {
        delete (licenseNoFound.client as any).password;
    }

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { data: licenseNoFound }, "Record found.")
    );


})

const changePasswordApi = asyncHandler(async (req: Request, res: Response) => {
    const { oldPassword,
        newPassword,
        loginUserId, confirmPassword, role } = req.body

    if (oldPassword === "" ||
        newPassword === "") {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { message: "All fields are isrequired" }, "Validation failed")
        );
    }


    if (newPassword !== confirmPassword) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { message: "Confirm and New Password should be matched" }, "Validation failed")
        );
    }


    if (role === Role.provider) {
        const findUser = await prisma.provider.findFirst({ where: { id: loginUserId }, include: { user: true } })

        if (!findUser) {

            return res.status(StatusCodes.BAD_REQUEST).json(
                new ApiResponse(StatusCodes.BAD_REQUEST, { message: " User does not exist." }, "Validation failed")
            );
        }

        const isPasswordMatch = await bcrypt.compare(oldPassword, findUser?.password)
        if (isPasswordMatch) {
            const hashedPassword = await bcrypt.hash(newPassword ?? "", 10);
            const updatePassword = await prisma.provider.update({
                where: { id: loginUserId }, data: {
                    password: hashedPassword

                }
            })

            if (updatePassword) {

                return res.status(StatusCodes.OK).json(
                    new ApiResponse(StatusCodes.OK, { message: "Password has updated successfully" }, "Password has updated successfully")
                );
            }
            else {
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(
                    new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, { message: "Internal Server Error" }, "Internal Server Error")
                );
            }
        }
        else {
            return res.status(StatusCodes.CONFLICT).json(
                new ApiResponse(StatusCodes.CONFLICT, { message: "Password not Matched" }, "Password not Match")
            );
        }


    }

    if (role === Role.client) {
        const findUser = await prisma.client.findFirst({ where: { id: loginUserId }, include: { user: true } })

        if (!findUser) {

            return res.status(StatusCodes.BAD_REQUEST).json(
                new ApiResponse(StatusCodes.BAD_REQUEST, { message: " User does not exist." }, "Validation failed")
            );
        }

        const isPasswordMatch = await bcrypt.compare(
            oldPassword ?? "",
            findUser?.password ?? ""
        ); if (isPasswordMatch) {
            const hashedPassword = await bcrypt.hash(newPassword ?? "", 10);
            const updatePassword = await prisma.client.update({
                where: { id: loginUserId }, data: {
                    password: hashedPassword

                }
            })

            if (updatePassword) {

                return res.status(StatusCodes.OK).json(
                    new ApiResponse(StatusCodes.OK, { message: "Password has updated successfully" }, "Password has updated successfully")
                );
            }
            else {
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(
                    new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, { message: "Internal Server Error" }, "Internal Server Error")
                );
            }
        }
        else {
            return res.status(StatusCodes.CONFLICT).json(
                new ApiResponse(StatusCodes.CONFLICT, { message: "Password not Matched" }, "Password not Match")
            );
        }


    }

})

const forgotPasswordApi = asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;

    const isProvider = await prisma.provider.findFirst({ where: { email }, include: { user: true } });
    const isClient = await prisma.client.findFirst({ where: { email }, include: { user: true } });

    const account = isProvider || isClient;

    if (!account) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { error: `Email: ${email} is not found.` }, "Validation failed")
        );
    }

    const { token, hashedToken } = generateResetToken();

    const updatedUser = await prisma.user.update({
        where: { id: account.user.id },
        data: {
            resetPasswordToken: hashedToken,
            resetPasswordExpires: new Date(Date.now() + 1000 * 60 * 60), // 1 hour
        },
    });

    const respnse = await sendResetPasswordEmail(email, account.user.fullName, token);
    console.log("_--------------------------");
    console.log("_--------------------------");
    console.log("_--------------------------");
    console.log("_--------------------------");
    console.log("_--------------------------");
    console.log("_--------------------------");
    console.log("_--------------------------");
    console.log("_--------------------------");
    console.log("_--------------------------response", respnse);
    console.log("_--------------------------");
    console.log("_--------------------------");
    console.log("_--------------------------");
    console.log("_--------------------------");
    console.log("_--------------------------");
    console.log("_--------------------------");
    console.log("_--------------------------");
    console.log("_--------------------------");

    return res.status(200).json(
        new ApiResponse(200, { success: true, user: updatedUser }, "Reset link sent successfully")
    );
});


const resetPasswordApi = asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.params;
    const { newPassword } = req.body;

    const hashedToken = crypto.createHash("sha256").update(token as string).digest("hex");

    const user = await prisma.user.findFirst({
        where: {
            resetPasswordToken: hashedToken,
            resetPasswordExpires: {
                gt: new Date(),
            },
        },
        include: { provider: true, client: true },
    });

    if (!user) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "Invalid or expired token" }, "Token invalid")
        );
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    if (user.provider) {
        await prisma.provider.update({
            where: { id: user.provider.id },
            data: {
                password: hashedNewPassword,
                user: {
                    update: {
                        resetPasswordToken: null,
                        resetPasswordExpires: null,
                    },
                },
            },
        });
    } else if (user.client) {
        await prisma.client.update({
            where: { id: user.client.id },
            data: {
                password: hashedNewPassword,
                user: {
                    update: {
                        resetPasswordToken: null,
                        resetPasswordExpires: null,
                    },
                },
            },
        });
    }

    return res.status(200).json(
        new ApiResponse(200, { success: true }, "Password has been reset successfully")
    );
});

const startTrialApi = asyncHandler(async (req: Request, res: Response) => {
    const { newProviderId, invitedById } = req.body;

    if (!newProviderId) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, null, "newProviderId is required.")
        );
    }

    try {
        const provider = await prisma.provider.findUnique({
            where: { id: newProviderId },
            include: { user: true }
        });

        if (!provider) {
            return res.status(StatusCodes.NOT_FOUND).json(
                new ApiResponse(StatusCodes.NOT_FOUND, null, "Provider not found.")
            );
        }

        // 1. Create or retrieve Stripe Customer
        let stripeCustomerId: string;
        const customer = await stripe.customers.create({
            email: provider.email,
            name: provider.user.fullName,
            metadata: { userId: provider.user.id }
        });
        stripeCustomerId = customer.id;

        // 2. Create Stripe trial subscription
        const stripeSubscription = await stripe.subscriptions.create({
            customer: stripeCustomerId,
            items: [{ price: STRIPE_PRICES.STANDARD.MONTHLY }],
            trial_period_days: 14,
            metadata: { userId: provider.user.id }
        });

        // 3. Create Subscription in DB
        await prisma.subscription.create({
            data: {
                userId: provider.user.id,
                stripeCustomerId: stripeCustomerId,
                stripeSubscriptionId: stripeSubscription.id,
                plan: "STANDARD",
                status: "TRIALING",
                trailStart: new Date(),
                // trailEnd: new Date(stripeSubscription.current_period_end * 1000),
                // currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000)
            }
        });

        // 4. Handle Invited Chat Initialization
        if (invitedById) {
            const [a, b] = [newProviderId, invitedById].sort();
            const existingChannel = await prisma.chatChannel.findFirst({
                where: { providerAId: a, providerBId: b }
            });

            if (!existingChannel) {
                await prisma.chatChannel.create({
                    data: {
                        providerAId: a,
                        providerBId: b,
                        isPinned: true
                    }
                });
            } else {
                await prisma.chatChannel.update({
                    where: { id: existingChannel.id },
                    data: { isPinned: true }
                });
            }
        }

        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, { message: "Trial started successfully." }, "OK")
        );
    } catch (error) {
        console.error("Start trial error:", error);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(
            new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, null, "Failed to start trial.")
        );
    }
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


export {
    signupApi, logInApi, blockUserApi, unblockUserApi, logoutApi, updateMeApi, deleteMeAccountApi, approveValidUser, rejectUser, restoreUser,
    getMeApi, getAllUsersApi, findByLicenseNo, changePasswordApi, forgotPasswordApi, resetPasswordApi, getAllValidUsersApi, startTrialApi, verifyInvitationToken
};
