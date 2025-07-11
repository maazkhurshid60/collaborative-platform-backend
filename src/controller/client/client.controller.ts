import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import prisma from "../../db/db.config";
import { StatusCodes } from "http-status-codes";
import { ApiResponse } from "../../utils/apiResponse";
import { clientSchema } from "../../schema/client/client.schema";
import { Role } from "@prisma/client";
import { userSchema } from "../../schema/auth/auth.schema";
import bcrypt from "bcrypt";


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

    // 2. Get all clients with user info, documents, and provider list
    const allClients = await prisma.client.findMany({
        skip,
        take: limit,
        orderBy: {
            createdAt: 'desc'  // 👈 Get latest first
        },
        include: {
            user: true,
            recievedDocument: {
                include: {
                    provider: {
                        include: { user: true }
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
        }
    });

    // 3. Filter out clients that are blocked by the logged-in user
    let filteredClients = allClients.filter(client =>
        !loginUser.blockedMembers.includes(client.user.id) &&
        !client.user.blockedMembers.includes(loginUser.id)
    );

    const totalDocument = filteredClients.length;

    // 4. Return the filtered clients with associated providers
    res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { totalDocument, clients: filteredClients }, "All Clients fetched successfully")
    );
});



const deletClient = asyncHandler(async (req: Request, res: Response) => {
    const { clientId, providerId } = req.body;
    console.log("<<<<<<<<<<<<<<<<<<<<<<<<<<<<>>>>>>>>>>>>>>>>>>>>>>>>>>", clientId, providerId);

    // 1. Check if client exists
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) {
        return res.status(StatusCodes.NOT_FOUND).json(
            new ApiResponse(StatusCodes.NOT_FOUND, { error: "Client not found." }, "")
        );
    }

    // 2. Check if the provider-client relation exists
    const link = await prisma.providerOnClient.findFirst({
        where: {
            clientId,
            providerId
        }
    });

    if (!link) {
        return res.status(StatusCodes.NOT_FOUND).json(
            new ApiResponse(StatusCodes.NOT_FOUND, { error: "Client is not linked to this provider." }, "")
        );
    }

    // 3. Delete the link only (not the actual client/user)
    await prisma.providerOnClient.delete({
        where: {
            id: link.id
        }
    });

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, null, "Client removed from your list successfully")
    );
});


const updateClient = asyncHandler(async (req: Request, res: Response) => {
    // Convert age to number if provided
    if (req.body.age) {
        req.body.age = Number(req.body.age);
    }

    // Convert boolean string to actual boolean
    if (req.body.isAccountCreatedByOwnClient) {
        req.body.isAccountCreatedByOwnClient = req.body.isAccountCreatedByOwnClient === "true";
    }

    // Validate data using Zod schema
    const clientData = clientSchema.safeParse(req.body);
    if (!clientData.success) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: clientData.error.errors }, "Validation Failed")
        );
    }

    // Destructure validated data
    const {
        fullName,
        gender,
        age,
        contactNo,
        address,
        status,
        licenseNo,
        email,
        password,
        clientId,
        clientShowToOthers
    } = clientData.data;

    // Hash password only if provided
    let hashedPassword: string | undefined;
    if (password && password.trim() !== "") {
        hashedPassword = await bcrypt.hash(password, 10);
    }

    // Check if client exists
    const isClientExist = await prisma.client.findFirst({
        where: { id: clientId },
        include: { user: true }
    });

    if (!isClientExist) {
        return res.status(StatusCodes.NOT_FOUND).json(
            new ApiResponse(StatusCodes.NOT_FOUND, { error: "Client not found" }, "Not found")
        );
    }

    // Check for duplicate email (excluding current client)
    const isEmailExist = await prisma.client.findFirst({
        where: {
            email,
            id: { not: clientId }
        }
    });
    if (isEmailExist) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { error: `Email ${email} already taken` }, "Duplicate Error")
        );
    }

    // Check for duplicate licenseNo (excluding current user)
    const isLicenseNoExists = await prisma.user.findFirst({
        where: {
            licenseNo,
            id: { not: isClientExist.userId }
        }
    });
    if (isLicenseNoExists) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { error: `License Number ${licenseNo} already taken` }, "Duplicate Error")
        );
    }
    console.log("client id", clientId, "isClientExist", isClientExist);

    // Check for duplicate full name (excluding current user)
    const isFullNameExist = await prisma.user.findFirst({
        where: {
            fullName,
            id: { not: isClientExist.userId }
        }
    });
    // Only check for duplicate full name if it was changed
    if (fullName !== isClientExist.user.fullName) {
        const isFullNameExist = await prisma.user.findFirst({
            where: {
                fullName,
                id: { not: isClientExist.userId }
            }
        });

        if (isFullNameExist) {
            return res.status(StatusCodes.CONFLICT).json(
                new ApiResponse(StatusCodes.CONFLICT, { error: `Full Name ${fullName} already taken` }, "Duplicate Error")
            );
        }
    }

    const clientShowToOthersBool = clientShowToOthers === "true";

    // Prepare client update data
    const updatedClientData: any = { email, clientShowToOthers: clientShowToOthersBool, };
    if (hashedPassword) {
        updatedClientData.password = hashedPassword;
    }
    // Prepare user update data
    const updatedUserData: any = {
        fullName,
        gender,
        age,
        contactNo,
        address,
        status,
        licenseNo,

        role: Role.client
    };

    // Handle profile image updates
    if (req.file) {
        // New file uploaded - update with new image path
        const file = req.file as Express.Multer.File & { location?: string };
        updatedUserData.profileImage = file?.location;
    } else if (req.body.profileImage === "null") {
        // Explicit removal requested - set to null
        updatedUserData.profileImage = null;
    }
    // If neither case, profileImage won't be included in update (keeps existing)

    // Update user record
    const isUserUpdated = await prisma.user.update({
        where: { id: isClientExist.userId, },

        data: updatedUserData,
    });

    // Update client record
    const isClientUpdated = await prisma.client.update({
        where: { id: clientId },
        data: updatedClientData,
    });

    // Combine updated data for response
    const updatedData = { ...isUserUpdated, ...isClientUpdated };

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { updatedData }, "Client updated successfully")
    );
});


const getTotalClient = asyncHandler(async (req: Request, res: Response) => {


    const allClient = await prisma.client.findMany({
        include: {
            user: true, recievedDocument: { include: { provider: { include: { user: true } }, document: true } }, providerList: {
                include: {
                    provider: {
                        include: { user: true }
                    }
                }
            }
        }, // Assuming 'user' is related to 'client'
    });

    res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, { totalDocument: allClient.length, clients: allClient }, "All Clients fetched successfully"))

})



const addClient = asyncHandler(async (req: Request, res: Response) => {
    if (req.body.age) req.body.age = Number(req.body.age);
    if (req.body.isAccountCreatedByOwnClient)
        req.body.isAccountCreatedByOwnClient = req.body.isAccountCreatedByOwnClient === "true";

    // 1. Validate user schema
    const userParsedData = userSchema.safeParse(req.body);
    if (!userParsedData.success) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: userParsedData.error.errors }, "Validation failed")
        );
    }

    const { fullName, gender = "male", age, contactNo, address, status = "active", licenseNo, role } = userParsedData.data;
    const { email, password, isAccountCreatedByOwnClient, providerId, clientShowToOthers } = req.body;

    let profileImageUrl: string | null = null;
    if (req.file) {
        const file = req.file as Express.Multer.File & { location?: string };
        profileImageUrl = file.location ?? null;
    }


    // 2. Check if user with licenseNo already exists
    const existingUser = await prisma.user.findFirst({ where: { licenseNo } });
    console.log("><<<<<<<<<<<<<<<<<<<", existingUser);

    if (existingUser) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, null, "This license number is already registered")
        );

    }
    console.log("><<<<<<<<<<<<<<<<<<<360");

    // 3. Proceed to create new user
    const userCreated = await prisma.user.create({
        data: {
            fullName,
            gender,
            age,
            contactNo,
            address,
            status,
            licenseNo,
            role,

            profileImage: profileImageUrl
        }
    });
    console.log("><<<<<<<<<<<<<<<<<<<377", userCreated);

    // 4. If role is client, create client and link provider
    if (role === Role.client) {
        console.log("><<<<<<<<<<<<<<<<<<<381", role);

        const clientParsed = clientSchema.safeParse(req.body);
        if (!clientParsed.success) {
            return res.status(StatusCodes.BAD_REQUEST).json(
                new ApiResponse(StatusCodes.BAD_REQUEST, { error: clientParsed.error.errors }, "Validation failed")
            );
        }

        // Check for duplicate client email
        const existingClientEmail = await prisma.client.findFirst({ where: { email } });
        if (existingClientEmail) {
            return res.status(StatusCodes.CONFLICT).json(
                new ApiResponse(StatusCodes.CONFLICT, { error: `Email: ${email} is already taken.` }, "Validation failed")
            );
        }

        const hashedPassword = await bcrypt.hash(password ?? "", 10);
        console.log("data add client", "email", email, " password", password, "isAccountCreatedByOwnClient", isAccountCreatedByOwnClient, "clientShowToOthers", clientShowToOthers, "fullName", fullName, "gender", gender, "age", age, "contactNo", contactNo, "address", address, "status", status, "licenseNo", licenseNo, "role", role);
        const clientShowToOthersBool = clientShowToOthers === "true";
        console.log("<<<<<<<<<<<<<<<<<<<clientShowToOthersBool>>>>>>>>>>>>>>>>>>>>", clientShowToOthersBool, "typeof clientShowToOthersBool", typeof clientShowToOthersBool);

        const clientCreated = await prisma.client.create({
            data: {
                userId: userCreated.id,
                isAccountCreatedByOwnClient,
                clientShowToOthers: clientShowToOthersBool,
                email,
                password: hashedPassword
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

    // 5. If role is not client
    return res.status(StatusCodes.CREATED).json(
        new ApiResponse(StatusCodes.CREATED, userCreated, "User created successfully")
    );
});


const addExistingClientToProvider = asyncHandler(async (req: Request, res: Response) => {
    if (req.body.age) req.body.age = Number(req.body.age);
    if (req.body.isAccountCreatedByOwnClient)
        req.body.isAccountCreatedByOwnClient = req.body.isAccountCreatedByOwnClient === "true";

    // 1. Validate user schema
    const userParsedData = userSchema.safeParse(req.body);
    if (!userParsedData.success) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: userParsedData.error.errors }, "Validation failed")
        );
    }

    const { fullName, gender = "male", age, contactNo, address, status = "active", licenseNo, role } = userParsedData.data;
    const { email, password, isAccountCreatedByOwnClient, providerId, clientShowToOthers } = req.body;

    let profileImageUrl: string | null = null;
    if (req.file) {
        const file = req.file as Express.Multer.File & { location?: string };
        profileImageUrl = file.location ?? null;
    }


    // 2. Check if user with licenseNo already exists
    const existingUser = await prisma.user.findFirst({ where: { licenseNo } });
    console.log("><<<<<<<<<<<<<<<<<<<", existingUser);

    if (existingUser) {

        // Ensure the role is 'client'
        if (existingUser?.role !== Role.client) {
            return res.status(StatusCodes.BAD_REQUEST).json(
                new ApiResponse(StatusCodes.BAD_REQUEST, null, "This license number is registered but not as a client")
            );
        }

        // Fetch existing client by userId
        const existingClient = await prisma.client.findUnique({
            where: { userId: existingUser.id }
        });

        if (!existingClient) {
            return res.status(StatusCodes.NOT_FOUND).json(
                new ApiResponse(StatusCodes.NOT_FOUND, null, "Client record not found for existing license number")
            );
        }

        // Check if already linked to the same provider
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

        // Link existing client to current provider
        await prisma.providerOnClient.create({
            data: {
                providerId,
                clientId: existingClient.id
            }
        });

        return res.status(StatusCodes.CREATED).json(
            new ApiResponse(StatusCodes.CREATED, existingClient, "Existing client linked to provider successfully")
        );
    }
    console.log("><<<<<<<<<<<<<<<<<<<360");

    // 3. Proceed to create new user
    const userCreated = await prisma.user.create({
        data: {
            fullName,
            gender,
            age,
            contactNo,
            address,
            status,
            licenseNo,
            role,

            profileImage: profileImageUrl
        }
    });
    console.log("><<<<<<<<<<<<<<<<<<<377", userCreated);

    // 4. If role is client, create client and link provider
    if (role === Role.client) {
        console.log("><<<<<<<<<<<<<<<<<<<381", role);

        const clientParsed = clientSchema.safeParse(req.body);
        if (!clientParsed.success) {
            return res.status(StatusCodes.BAD_REQUEST).json(
                new ApiResponse(StatusCodes.BAD_REQUEST, { error: clientParsed.error.errors }, "Validation failed")
            );
        }

        // Check for duplicate client email
        const existingClientEmail = await prisma.client.findFirst({ where: { email } });
        if (existingClientEmail) {
            return res.status(StatusCodes.CONFLICT).json(
                new ApiResponse(StatusCodes.CONFLICT, { error: `Email: ${email} is already taken.` }, "Validation failed")
            );
        }

        const hashedPassword = await bcrypt.hash(password ?? "", 10);
        console.log("data add client", "email", email, " password", password, "isAccountCreatedByOwnClient", isAccountCreatedByOwnClient, "clientShowToOthers", clientShowToOthers, "fullName", fullName, "gender", gender, "age", age, "contactNo", contactNo, "address", address, "status", status, "licenseNo", licenseNo, "role", role);
        const clientShowToOthersBool = clientShowToOthers === "true";
        console.log("<<<<<<<<<<<<<<<<<<<clientShowToOthersBool>>>>>>>>>>>>>>>>>>>>", clientShowToOthersBool, "typeof clientShowToOthersBool", typeof clientShowToOthersBool);

        const clientCreated = await prisma.client.create({
            data: {
                userId: userCreated.id,
                isAccountCreatedByOwnClient,
                clientShowToOthers: clientShowToOthersBool,
                email,
                password: hashedPassword
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

    // 5. If role is not client
    return res.status(StatusCodes.CREATED).json(
        new ApiResponse(StatusCodes.CREATED, userCreated, "User created successfully")
    );
});



//logined provider can add existing client(not present in logined provider list) by just one add button click without entering record manually
const updateExistingClientOnLicenseNo = asyncHandler(async (req: Request, res: Response) => {
    // Validate data
    const clientData = clientSchema.safeParse(req.body);
    if (!clientData.success) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: clientData.error.errors }, "Validation Failed")
        );
    }

    let { fullName, gender, age, contactNo, address, status, licenseNo, email, password, clientId } = clientData.data;

    // Normalize email
    email = email.trim().toLowerCase();

    // Hash password if provided
    const hashedPassword = await bcrypt.hash(password ?? "", 10);

    // Check if client exists
    const isClientExist = await prisma.client.findFirst({ where: { id: clientId } });
    if (!isClientExist) {
        return res.status(StatusCodes.NOT_FOUND).json(
            new ApiResponse(StatusCodes.NOT_FOUND, { error: "Client not found" }, "Not found")
        );
    }

    // Check for duplicate email only if it's being changed
    if (email !== isClientExist.email.trim().toLowerCase()) {
        const isEmailExist = await prisma.client.findFirst({
            where: {
                email: email, // the new email
                id: {
                    not: clientId, // ensure it doesn’t belong to the same client
                },
            },
        });


        if (isEmailExist) {
            return res.status(StatusCodes.CONFLICT).json(
                new ApiResponse(StatusCodes.CONFLICT, { error: `Email ${email} already taken by another client` }, "Duplicate Email")
            );
        }
    }


    // Check for duplicate licenseNo
    const isLicenseNoExists = await prisma.user.findFirst({
        where: {
            licenseNo,
            id: {
                not: isClientExist.userId
            }
        }
    });
    if (isLicenseNoExists) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { error: `license number ${licenseNo} already taken` }, "Duplicate Error")
        );
    }

    // Check for duplicate Full Name
    const isFullNameExist = await prisma.user.findFirst({
        where: {
            fullName,
            id: {
                not: isClientExist.userId
            }
        }
    });


    if (isFullNameExist) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { error: `Full Name ${fullName} already taken` }, "Duplicate Error")
        );
    }

    // Prepare update data
    const updatedClientData = {
        email,
        password: hashedPassword,
    };

    const updatedUserData = {
        fullName,
        gender,
        age,
        contactNo,
        address,
        status,
        licenseNo,
        role: Role.client,
    };
    // Update user and client
    const isUserUpdated = await prisma.user.update({
        where: { id: isClientExist.userId },
        data: updatedUserData,
    });

    const isClientUpdated = await prisma.client.update({
        where: { id: clientId },
        data: updatedClientData,
    });

    if (!isClientUpdated) {
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(
            new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, { error: "Something went wrong. Try later" }, "")
        );
    }

    const updatedData = {
        ...isUserUpdated,
        ...isClientUpdated,
    };

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { updatedData }, "Client updated successfully")
    );
});




export { getAllClients, deletClient, updateClient, getTotalClient, addClient, updateExistingClientOnLicenseNo, addExistingClientToProvider }