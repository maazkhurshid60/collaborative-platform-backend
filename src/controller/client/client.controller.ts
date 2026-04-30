import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import prisma from "../../db/db.config";
import { StatusCodes } from "http-status-codes";
import { ApiResponse } from "../../utils/apiResponse";
import { clientSchema } from "../../schema/client/client.schema";
import { Role, Gender, Approve } from "../../generated/prisma/client";
import { userSchema } from "../../schema/auth/auth.schema";
import bcrypt from "bcrypt";

// ─── Client ID Generator ───────────────────────────────────────────────────────
// Generates a unique client ID in the format: CLT-YYYYMMDD-XXXXXX
// Retries up to 5 times on collision (extremely unlikely with 36-bit hex)
const generateClientId = async (): Promise<string> => {
    const today = new Date();
    const datePart = today.toISOString().slice(0, 10).replace(/-/g, ""); // "20260224"
    for (let attempt = 0; attempt < 5; attempt++) {
        const hexPart = Math.floor(Math.random() * 0xFFFFFF).toString(16).toUpperCase().padStart(6, "0");
        const candidateId = `CLT-${datePart}-${hexPart}`;
        const exists = await prisma.client.findUnique({ where: { clientId: candidateId } });
        if (!exists) return candidateId;
    }
    throw new Error("Failed to generate a unique Client ID after 5 attempts");
};


const getAllClients = asyncHandler(async (req: Request, res: Response) => {
    const { loginUserId } = req.body;

    // 1. Get the login user details
    const loginUser = await prisma.user.findUnique({ where: { id: loginUserId } });
    if (!loginUser) {
        return res.status(StatusCodes.NOT_FOUND).json(
            new ApiResponse(StatusCodes.NOT_FOUND, { error: "User not found" }, "Validation failed")
        );
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Define safe user selection to reuse
    const safeUserSelect = {
        id: true,
        fullName: true,
        profileImage: true,
        gender: true,
        age: true,
        contactNo: true,
        address: true,
        status: true,
        isLicenseValid: true,
        blockedMembers: true,
        createdAt: true,
        updatedAt: true,
        role: true,
        isApprove: true,
        // country: true,
        state: true,
        email: true,
    };

    // Determine visibility/ownership filter
    const { role: loginRole } = (req as any).user;
    let whereClause: any = {};

    if (loginRole === Role.provider) {
        // Dashboard list: Only show clients explicitly linked to this provider
        whereClause = {
            providerList: {
                some: {
                    provider: {
                        userId: loginUserId
                    }
                }
            }
        };
    } else if (loginRole === Role.client) {
        // A client should only see themselves
        whereClause = {
            userId: loginUserId
        };
    }
    // superAdmin sees all by default (empty whereClause)

    // 2. Get clients with user info, documents, and provider list
    const allClients = await prisma.client.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: {
            createdAt: 'desc'  // 👈 Get latest first
        },
        select: {
            id: true,
            clientId: true,
            isAccountCreatedByOwnClient: true,
            eSignature: true,
            clientShowToOthers: true,
            createdByProviderId: true,
            createdAt: true,
            updatedAt: true,
            userId: true,
            user: {
                select: safeUserSelect
            },
            receivedDocument: {
                select: {
                    id: true,
                    eSignature: true,
                    isAgree: true,
                    clientId: true,
                    providerId: true,
                    documentId: true,
                    createdAt: true,
                    updatedAt: true,
                    provider: {
                        select: {
                            id: true,
                            user: {
                                select: safeUserSelect
                            }
                        }
                    },
                    document: true // Assuming document model has no sensitive fields
                }
            },
            providerList: {
                select: {
                    id: true,
                    clientId: true,
                    providerId: true,
                    createdAt: true,
                    updatedAt: true,
                    provider: {
                        select: {
                            id: true,
                            user: {
                                select: safeUserSelect
                            }
                        }
                    }
                }
            }
        }
    });

    // 3. Filter out clients that are blocked by the logged-in user
    let filteredClients = allClients.filter(client =>
        // @ts-ignore
        !loginUser.blockedMembers.includes(client.user.id) &&
        // @ts-ignore
        !client.user.blockedMembers.includes(loginUser.id)
    );

    const totalDocument = filteredClients.length;

    // 4. Return the filtered clients with associated providers
    res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { totalDocument, clients: filteredClients }, "All Clients fetched successfully")
    );
});

export const getClientById = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const { id: loginUserId, role: loginRole } = (req as any).user;

    // 1. Get the login user details
    const loginUser = await prisma.user.findUnique({ where: { id: loginUserId } });
    if (!loginUser) {
        return res.status(StatusCodes.NOT_FOUND).json(
            new ApiResponse(StatusCodes.NOT_FOUND, { error: "User not found" }, "Validation failed")
        );
    }

    const safeUserSelect = {
        id: true,
        fullName: true,
        profileImage: true,
        gender: true,
        age: true,
        contactNo: true,
        address: true,
        status: true,
        isLicenseValid: true,
        blockedMembers: true,
        createdAt: true,
        updatedAt: true,
        role: true,

        isApprove: true,
        // country: true,
        state: true,
        email: true,
    };

    // 2. Fetch the client with necessary includes
    const client = await prisma.client.findUnique({
        where: { id: id as string },
        select: {
            id: true,
            clientId: true,
            isAccountCreatedByOwnClient: true,
            eSignature: true,
            clientShowToOthers: true,
            createdByProviderId: true,
            createdAt: true,
            updatedAt: true,
            userId: true,
            user: {
                select: safeUserSelect
            },
            providerList: {
                select: {
                    id: true,
                    clientId: true,
                    providerId: true,
                    createdAt: true,
                    updatedAt: true,
                    provider: {
                        select: {
                            id: true,
                            user: {
                                select: safeUserSelect
                            }
                        }
                    }
                }
            }
        }
    });

    if (!client) {
        return res.status(StatusCodes.NOT_FOUND).json(
            new ApiResponse(StatusCodes.NOT_FOUND, null, "Client not found")
        );
    }

    // 3. Visibility logic
    let isVisible = false;

    if (loginRole === Role.superAdmin) {
        isVisible = true;
    } else if (loginRole === Role.client) {
        isVisible = client.userId === loginUserId;
    } else if (loginRole === Role.provider) {
        const provider = await prisma.provider.findUnique({ where: { userId: loginUserId } });
        const providerId = provider?.id;

        // @ts-ignore
        const isLinked = (client as any).providerList.some((p: any) => p.providerId === providerId);
        // @ts-ignore
        const isCreator = (client as any).createdByProviderId === providerId;
        // @ts-ignore
        const isPublic = (client as any).clientShowToOthers === true;

        isVisible = isLinked || isCreator || isPublic;
    }

    if (!isVisible) {
        return res.status(StatusCodes.FORBIDDEN).json(
            new ApiResponse(StatusCodes.FORBIDDEN, null, "You do not have permission to view this client profile.")
        );
    }

    // 4. Block check
    // @ts-ignore
    const isBlocked = (loginUser as any).blockedMembers.includes(client.userId) || (client.user as any).blockedMembers.includes(loginUserId);
    if (isBlocked) {
        return res.status(StatusCodes.FORBIDDEN).json(
            new ApiResponse(StatusCodes.FORBIDDEN, null, "Cannot view profile due to block status.")
        );
    }

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { client }, "Client fetched successfully")
    );
});



const deletClient = asyncHandler(async (req: Request, res: Response) => {
    const { clientId } = req.body;

    // 0. Ensure user is authenticated and is a provider
    const user = (req as any).user;

    // 1. Check if client exists
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) {
        return res.status(StatusCodes.NOT_FOUND).json(
            new ApiResponse(StatusCodes.NOT_FOUND, { error: "Client not found." }, "")
        );
    }

    const provider = await prisma.provider.findUnique({
        where: { userId: user.id }
    });

    if (!provider) {
        return res.status(StatusCodes.FORBIDDEN).json(
            new ApiResponse(StatusCodes.FORBIDDEN, { error: "Action allowed for providers only." }, "")
        );
    }

    const link = await prisma.providerOnClient.findFirst({
        where: {
            clientId,
            providerId: provider.id
        }
    });

    if (!link) {
        return res.status(StatusCodes.NOT_FOUND).json(
            new ApiResponse(StatusCodes.NOT_FOUND, { error: "Client is not linked to this provider." }, "")
        );
    }

    // 4. Delete the link only (not the actual client/user)
    await prisma.providerOnClient.delete({
        where: {
            id: link.id
        }
    });

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, null, "Client removed from your list successfully")
    );
});


// const updateClient = asyncHandler(async (req: Request, res: Response) => {
//     // Convert age to number if provided
//     if (req.body.age) {
//         req.body.age = Number(req.body.age);
//     }

//     // Convert boolean string to actual boolean
//     if (req.body.isAccountCreatedByOwnClient) {
//         req.body.isAccountCreatedByOwnClient = req.body.isAccountCreatedByOwnClient === "true";
//     }

//     // Validate data using Zod schema
//     const clientData = clientSchema.safeParse(req.body);
//     if (!clientData.success) {
//         return res.status(StatusCodes.BAD_REQUEST).json(
//             new ApiResponse(StatusCodes.BAD_REQUEST, { error: clientData.error.errors }, "Validation Failed")
//         );
//     }

//     // Destructure validated data
//     const {
//         fullName,
//         gender,
//         age,
//         contactNo,
//         address,
//         status,
//         licenseNo,
//         email,

//         clientId,
//         clientShowToOthers,
//         state, country
//     } = clientData.data;

//      Hash password only if provided
//     // let hashedPassword: string | undefined;
//     // if (password && password.trim() !== "") {
//     //     hashedPassword = await bcrypt.hash(password, 10);
//     // }

//     // Check if client exists
//     const isClientExist = await prisma.client.findFirst({
//         where: { id: clientId },
//         include: { user: true }
//     });

//     if (!isClientExist) {
//         return res.status(StatusCodes.NOT_FOUND).json(
//             new ApiResponse(StatusCodes.NOT_FOUND, { error: "Client not found" }, "Not found")
//         );
//     }

//     // Check for duplicate email (excluding current client)
//     const isEmailExist = await prisma.client.findFirst({
//         where: {
//             email,
//             id: { not: clientId }
//         }
//     });
//     if (isEmailExist) {
//         return res.status(StatusCodes.CONFLICT).json(
//             new ApiResponse(StatusCodes.CONFLICT, { error: `Email ${email} already taken` }, "Duplicate Error")
//         );
//     }

//     // Check for duplicate licenseNo (excluding current user)
//     const isLicenseNoExists = await prisma.user.findFirst({
//         where: {
//             licenseNo,
//             id: { not: isClientExist.userId }
//         }
//     });
//     if (isLicenseNoExists) {
//         return res.status(StatusCodes.CONFLICT).json(
//             new ApiResponse(StatusCodes.CONFLICT, { error: `License Number ${licenseNo} already taken` }, "Duplicate Error")
//         );
//     }

//     // Check for duplicate full name (excluding current user)
//     const isFullNameExist = await prisma.user.findFirst({
//         where: {
//             fullName,
//             id: { not: isClientExist.userId }
//         }
//     });
//     // Only check for duplicate full name if it was changed
//     if (fullName !== isClientExist.user.fullName) {
//         const isFullNameExist = await prisma.user.findFirst({
//             where: {
//                 fullName,
//                 id: { not: isClientExist.userId }
//             }
//         });

//         if (isFullNameExist) {
//             return res.status(StatusCodes.CONFLICT).json(
//                 new ApiResponse(StatusCodes.CONFLICT, { error: `Full Name ${fullName} already taken` }, "Duplicate Error")
//             );
//         }
//     }

//     const clientShowToOthersBool = clientShowToOthers === "true";

//     // Prepare client update data
//     const updatedClientData: any = { email, clientShowToOthers: clientShowToOthersBool, };
//     // if (hashedPassword) {
//     //     updatedClientData.password = hashedPassword;
//     // }
//     // Prepare user update data
//     const updatedUserData: any = {
//         fullName,
//         gender,
//         age,
//         contactNo,
//         address,
//         status,
//         licenseNo,
//         state, country,
//         isApprove: "approve",
//         role: Role.client
//     };

//     // Handle profile image updates
//     if (req.file) {
//         // New file uploaded - update with new image path
//         const file = req.file as Express.Multer.File & { location?: string };
//         updatedUserData.profileImage = file?.location;
//     } else if (req.body.profileImage === "null") {
//         // Explicit removal requested - set to null
//         updatedUserData.profileImage = null;
//     }
//     // If neither case, profileImage won't be included in update (keeps existing)

//     // Update user record
//     const isUserUpdated = await prisma.user.update({
//         where: { id: isClientExist.userId, },

//         data: updatedUserData,
//     });

//     // Update client record
//     const isClientUpdated = await prisma.client.update({
//         where: { id: clientId },
//         data: updatedClientData,
//     });

//     // Combine updated data for response
//     const updatedData = { ...isUserUpdated, ...isClientUpdated };

//         retunr res.status(StatusCodes.OK).json(
//         new ApiResponse(StatusCodes.OK, { updatedData }, "Client updated successfully")
//     );
// });

const updateClient = asyncHandler(async (req: Request, res: Response) => {
    // Convert age to number if provided
    if (req.body.age) {
        req.body.age = Number(req.body.age);
    }

    // Validate data using Zod schema
    const clientData = clientSchema.safeParse(req.body); // Assumes clientSchema might still contain 'email'
    if (!clientData.success) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: clientData.error.errors }, "Validation Failed")
        );
    }

    const {
        fullName,
        gender,
        age,
        contactNo,
        address,
        status,
        clientId,
        clientShowToOthers,
        state,
        // country,
        eSignature
    } = clientData.data;


    const isClientExist = await prisma.client.findUnique({
        where: { id: clientId },
        include: { user: true }
    });

    if (!isClientExist) {
        return res.status(StatusCodes.NOT_FOUND).json(
            new ApiResponse(StatusCodes.NOT_FOUND, {}, "Client not found")
        );
    }

    // -- Ownership Check --
    // Only the creator (or a superAdmin) should be able to edit this client.
    const { id: loginUserId, role: loginUserRole } = (req as any).user;
    const requestorProvider = await prisma.provider.findUnique({ where: { userId: loginUserId } });

    if (loginUserRole !== Role.superAdmin && (!requestorProvider || (isClientExist as any).createdByProviderId !== requestorProvider.id)) {
        return res.status(StatusCodes.FORBIDDEN).json(
            new ApiResponse(StatusCodes.FORBIDDEN, {}, "You do not have permission to edit this client. Only the original creator can modify this profile.")
        );
    }
    // -----------------------


    try {
        const [updatedUser, updatedClient] = await prisma.$transaction([
            prisma.user.update({
                where: { id: isClientExist.userId },
                data: {
                    fullName,
                    gender: gender ? gender.toUpperCase() as Gender : undefined,
                    age,
                    contactNo,
                    address,
                    status,
                    state,
                    // country,
                    profileImage: req.file
                        ? (req.file as any).location
                        : req.body.profileImage === "null"
                            ? null
                            : undefined
                },
            }),
            prisma.client.update({
                where: { id: clientId },
                data: {
                    eSignature,
                    clientShowToOthers: clientShowToOthers === "true"
                },
            })
        ]);

        const updatedData = { ...updatedUser, ...updatedClient };

        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, { updatedData }, "Client updated successfully")
        );

    } catch (error) {
        console.error("Failed to update client:", error);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(
            new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, {}, "An error occurred while updating the client.")
        );
    }
});

const getTotalClient = asyncHandler(async (req: Request, res: Response) => {
    const userPayload = (req as any).user;

    // Visibility Filter Logic:
    // 1. superAdmin: see everything
    // 2. provider: see and search clients where:
    //    - clientShowToOthers is true (Public)
    //    - OR they are the original creator (even if private/unlinked)
    //    - OR they are currently linked in their list
    // 3. client: see only themselves
    let whereClause: any = {};
    if (userPayload.role === Role.provider) {
        const provider = await prisma.provider.findUnique({ where: { userId: userPayload.id } });
        const providerId = provider?.id;

        whereClause = {
            OR: [
                { clientShowToOthers: true },
                { createdByProviderId: providerId },
                {
                    providerList: {
                        some: {
                            providerId: providerId
                        }
                    }
                }
            ]
        };
    } else if (userPayload.role === Role.client) {
        whereClause = {
            userId: userPayload.id
        };
    }

    const allClient = await prisma.client.findMany({
        where: whereClause,
        include: {
            user: true,
            receivedDocument: {
                include: {
                    provider: {
                        include: {
                            user: {
                                select: {
                                    address: true,
                                    contactNo: true,
                                    fullName: true,
                                    licenseNo: true,
                                    profileImage: true,
                                    role: true,
                                    status: true,
                                    id: true,
                                    age: true,
                                    gender: true,
                                    // country: true,
                                    state: true,
                                    isLicenseValid: true,
                                    blockedMembers: true,
                                    provider: true,
                                    client: true,
                                    receivedNotifications: true,
                                    sentNotifications: true,
                                    superAdmin: true,
                                }
                            }
                        }
                    },
                    document: true
                }
            },
            providerList: {
                include: {
                    provider: {
                        include: { user: true }
                    }
                }
            }
        },
    });

    res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, { totalDocument: allClient.length, clients: allClient }, "All Clients fetched successfully"))
})




const addClient = asyncHandler(async (req: Request, res: Response) => {
    if (req.body.age) req.body.age = Number(req.body.age);
    if (req.body.isAccountCreatedByOwnClient)
        req.body.isAccountCreatedByOwnClient = req.body.isAccountCreatedByOwnClient === "true";

    const userParsed = userSchema.safeParse(req.body);
    if (!userParsed.success) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: userParsed.error.errors }, "Validation failed")
        );
    }

    const role = req.body.role as Role;
    if (role !== Role.client) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: "Role must be client." }, "Validation failed")
        );
    }

    const clientParsed = clientSchema.safeParse(req.body);
    if (!clientParsed.success) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: clientParsed.error.errors }, "Validation failed")
        );
    }

    const {
        fullName,
        gender = "male",
        age,
        contactNo,
        address,
        status = "active",
        isApprove,
        //country,
        state,
    } = userParsed.data;

    const { email, password, providerId, clientShowToOthers, isAccountCreatedByOwnClient } = req.body;

    const normalizedEmail = String(email).trim().toLowerCase();

    const existingUserEmail = await prisma.user.findFirst({ where: { email: normalizedEmail } });

    if (existingUserEmail) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { error: "Email already exists." }, "Email already exists.")
        );
    }

    let profileImageUrl: string | null = null;
    if (req.file) {
        const file = req.file as Express.Multer.File & { location?: string };
        profileImageUrl = file.location ?? null;
    }

    const hashedPassword = await bcrypt.hash(password ?? "", 10);
    const clientShowToOthersBool = String(clientShowToOthers) === "true";

    // Generate a unique clientId before the transaction
    const newClientId = await generateClientId();

    try {
        const result = await prisma.$transaction(async (tx) => {
            const userCreated = await tx.user.create({
                data: {
                    fullName,
                    gender: gender.toUpperCase() as Gender,
                    age,
                    contactNo,
                    address,
                    status,
                    //          country,
                    state,
                    role: Role.client,
                    isApprove: isApprove ? isApprove.toUpperCase() as Approve : Approve.PENDING,
                    profileImage: profileImageUrl,
                    email: normalizedEmail,
                    password: hashedPassword,
                },
            });

            const clientCreated = await tx.client.create({
                data: {
                    userId: userCreated.id,
                    clientId: newClientId,
                    isAccountCreatedByOwnClient,
                    clientShowToOthers: clientShowToOthersBool,
                    createdByProviderId: providerId || null,
                },
                include: { user: true },
            });

            if (providerId) {
                await tx.providerOnClient.create({
                    data: {
                        providerId,
                        clientId: clientCreated.id,
                    },
                });
            }

            return clientCreated;
        });

        return res.status(StatusCodes.CREATED).json(
            new ApiResponse(
                StatusCodes.CREATED,
                result,
                "Client Data has been sent to the super admin for verification. Client will receive a verification email once approved."
            )
        );
    } catch (err: any) {
        if (err?.code === "P2002") {
            return res.status(StatusCodes.CONFLICT).json(
                new ApiResponse(StatusCodes.CONFLICT, { error: "Duplicate value. Please use different credentials." }, "Duplicate value.")
            );
        }

        console.error("addClient transaction error:", err);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(
            new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, { error: "Failed to create client." }, "Internal server error")
        );
    }
});

const addExistingClientToProvider = asyncHandler(async (req: Request, res: Response) => {
    if (req.body.age) req.body.age = Number(req.body.age);
    if (req.body.isAccountCreatedByOwnClient)
        req.body.isAccountCreatedByOwnClient = req.body.isAccountCreatedByOwnClient === "true";
    // 1. Validate user schema
    const userParsedData = userSchema.safeParse({ ...req.body, role: "client" });
    if (!userParsedData.success) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: userParsedData.error.errors }, "Validation failed")
        );
    }

    const { fullName, gender = "male", age, contactNo, address, status = "active", role, isApprove,
        //country, 

        state } = userParsedData.data;
    const { email, password, isAccountCreatedByOwnClient, providerId, clientShowToOthers } = req.body;

    const normalizedEmail = String(email).trim().toLowerCase();
    const hashedPassword = await bcrypt.hash(password ?? "", 10); // Moved up

    let profileImageUrl: string | null = null;
    if (req.file) {
        const file = req.file as Express.Multer.File & { location?: string };
        profileImageUrl = file.location ?? null;
    }

    // Check if a client with this email already exists (client reuse by email)
    const existingUserByEmail = await prisma.user.findFirst({ where: { email: normalizedEmail } });
    if (existingUserByEmail) {

        if (existingUserByEmail?.role !== Role.client) {
            return res.status(StatusCodes.BAD_REQUEST).json(
                new ApiResponse(StatusCodes.BAD_REQUEST, null, "This email is registered but not as a client")
            );
        }

        const existingClient = await prisma.client.findUnique({
            where: { userId: existingUserByEmail.id },
            include: { user: true }
        });

        if (!existingClient) {
            return res.status(StatusCodes.NOT_FOUND).json(
                new ApiResponse(StatusCodes.NOT_FOUND, null, "Client record not found for existing license number")
            );
        }

        // ─── Free-trial gate ───────────────────────────────────────────────
        // Trial providers can only add their OWN newly-created clients.
        // Attaching a client created by another provider is a paid-tier
        // collaboration feature. The frontend already shows a friendly toast
        // before this call, but we guard server-side too because the client
        // can be bypassed.
        //
        // We only enforce this when the existing client was created by a
        // DIFFERENT provider — a trial provider re-adding a client they
        // themselves originally created shouldn't be punished.
        const callingUserId = (req as any).user?.id;
        if (callingUserId && existingClient.createdByProviderId !== providerId) {
            const callerSubscription = await prisma.subscription.findUnique({
                where: { userId: callingUserId },
                select: { status: true },
            });
            if (callerSubscription?.status === "TRIALING") {
                return res.status(StatusCodes.FORBIDDEN).json(
                    new ApiResponse(
                        StatusCodes.FORBIDDEN,
                        null,
                        "Adding another provider's client is a premium feature. Upgrade your plan to collaborate on shared clients."
                    )
                );
            }
        }

        const alreadyLinked = await prisma.providerOnClient.findFirst({
            where: {
                clientId: existingClient.id,
                providerId
            }
        });

        if (alreadyLinked) {
            return res.status(StatusCodes.CONFLICT).json(
                new ApiResponse(StatusCodes.CONFLICT, null, "This provider has already added the client")
            );
        }

        const clientCreated = await prisma.providerOnClient.create({
            data: {
                providerId,
                clientId: existingClient.id
            }
        });
        if (isApprove === "pending") {

            return res.status(StatusCodes.CREATED).json(
                new ApiResponse(StatusCodes.CREATED, clientCreated, "Client Data has been already sent to the super admin for verification. Client will receive a verification email once approved, after which Client will be able to log in.")
            );
        }
        return res.status(StatusCodes.CREATED).json(
            new ApiResponse(StatusCodes.CREATED, existingClient, "Existing client linked to provider successfully")
        );
    }

    // New client — generate a unique Client ID
    const newClientIdForExisting = await generateClientId();

    const userCreated = await prisma.user.create({
        data: {
            fullName,
            gender: gender.toUpperCase() as Gender,
            age,
            contactNo,
            address,
            status,
            role,
            isApprove: isApprove ? isApprove.toUpperCase() as Approve : Approve.PENDING,
            // country,
            state,
            profileImage: profileImageUrl,
            email: normalizedEmail,
            password: hashedPassword
        }
    });

    if (role === Role.client) {

        const clientParsed = clientSchema.safeParse(req.body);
        if (!clientParsed.success) {
            return res.status(StatusCodes.BAD_REQUEST).json(
                new ApiResponse(StatusCodes.BAD_REQUEST, { error: clientParsed.error.errors }, "Validation failed")
            );
        }

        const existingUserEmail = await prisma.user.findFirst({ where: { email: normalizedEmail } });
        if (existingUserEmail) {
            return res.status(StatusCodes.CONFLICT).json(
                new ApiResponse(StatusCodes.CONFLICT, { error: "Email already exists." }, "Email already exists.")
            );
        }

        const clientShowToOthersBool = clientShowToOthers === "true";

        // We need to update user with email/password now because it was optional in schema but required for client login
        // if (userCreated) {
        //     await prisma.user.update({
        //         where: { id: userCreated.id },
        //         data: {
        //             email: normalizedEmail,
        //             password: hashedPassword
        //         }
        //     })
        // }

        const clientCreated = await prisma.client.create({
            data: {
                userId: userCreated.id,
                clientId: newClientIdForExisting,
                isAccountCreatedByOwnClient,
                clientShowToOthers: clientShowToOthersBool,
                createdByProviderId: providerId || null,
            },
            include: {
                user: true
            }
        });

        if (providerId) {
            await prisma.providerOnClient.create({
                data: {
                    providerId,
                    clientId: clientCreated.id
                }
            });
        }

        return res.status(StatusCodes.CREATED).json(
            new ApiResponse(StatusCodes.CREATED, clientCreated, "Client created and linked to provider successfully")
        );
    }

    return res.status(StatusCodes.CREATED).json(
        new ApiResponse(StatusCodes.CREATED, userCreated, "User created successfully")
    );
});



const updateExistingClientOnLicenseNo = asyncHandler(async (req: Request, res: Response) => {
    const clientData = clientSchema.safeParse(req.body);
    if (!clientData.success) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: clientData.error.errors }, "Validation Failed")
        );
    }

    let { fullName, gender, age, contactNo, address, status, email, password, clientId } = clientData.data;

    email = email.trim().toLowerCase();

    const hashedPassword = await bcrypt.hash(password ?? "", 10);

    const isClientExist = await prisma.client.findFirst({
        where: {
            OR: [
                { id: clientId },
                { clientId: clientId }
            ]
        },
        include: { user: true }
    });
    if (!isClientExist) {
        return res.status(StatusCodes.NOT_FOUND).json(
            new ApiResponse(StatusCodes.NOT_FOUND, { error: "Client not found" }, "Not found")
        );
    }

    if (email !== isClientExist.user.email?.trim().toLowerCase()) { // Check user email
        const isEmailExist = await prisma.user.findFirst({ // Check User model
            where: {
                email: email,
                id: {
                    not: isClientExist.userId,
                },
            },
        });


        if (isEmailExist) {
            return res.status(StatusCodes.CONFLICT).json(
                new ApiResponse(StatusCodes.CONFLICT, { error: `Email ${email} already taken by another client` }, "Duplicate Email")
            );
        }
    }


    // licenseNo is not used for clients — clientId is auto-generated and read-only


    // Update USER (no licenseNo — clientId is read-only and stored on Client model)
    await prisma.user.update({
        where: { id: isClientExist.userId },
        data: {
            fullName,
            gender: gender ? gender.toUpperCase() as Gender : undefined,
            age,
            contactNo,
            address,
            status,
            email,
            password: hashedPassword
        }
    });

    // No Client update needed for email/password. 

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, null, "Account Updated Successfully")
    );


});




export {
    getAllClients,
    deletClient,
    updateClient,
    getTotalClient,
    addClient,
    updateExistingClientOnLicenseNo,
    addExistingClientToProvider
}