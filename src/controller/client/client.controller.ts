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
    const { clientId } = req.body
    const isClientExist = await prisma.user.findFirst({ where: { id: clientId } })
    console.log("clientid", isClientExist);

    if (!isClientExist) {
        return res.status(StatusCodes.NOT_FOUND).json(new ApiResponse(StatusCodes.NOT_FOUND, { error: "Client does not exist." }, ""))
    }
    const isClientDeleted = await prisma.user.delete({ where: { id: clientId } })
    if (!isClientDeleted) {
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, { error: "Internal Server Error." }, ""))
    }
    return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, { isClientDeleted }, `${isClientDeleted.fullName} deleted successfully`))
})

const updateClient = asyncHandler(async (req: Request, res: Response) => {
    if (req.body.age) {
        req.body.age = Number(req.body.age);
    }

    if (req.body.isAccountCreatedByOwnClient) {
        req.body.isAccountCreatedByOwnClient = req.body.isAccountCreatedByOwnClient === "true";
    }

    // Validate data
    const clientData = clientSchema.safeParse(req.body);
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
        cnic,
        email,
        password,
        clientId
    } = clientData.data;

    // Hash password only if provided
    let hashedPassword: string | undefined;
    if (password && password.trim() !== "") {
        hashedPassword = await bcrypt.hash(password, 10);
    }

    const isClientExist = await prisma.client.findFirst({ where: { id: clientId } });
    if (!isClientExist) {
        return res.status(StatusCodes.NOT_FOUND).json(
            new ApiResponse(StatusCodes.NOT_FOUND, { error: "Client not found" }, "Not found")
        );
    }

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

    const isCnicExists = await prisma.user.findFirst({
        where: {
            cnic,
            id: { not: isClientExist.userId }
        }
    });
    if (isCnicExists) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { error: `CNIC ${cnic} already taken` }, "Duplicate Error")
        );
    }

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

    let profileImageUrl: string | null = null;
    if (req.file) {
        profileImageUrl = `/uploads/${req.file.filename}`;
    }

    // Conditionally build update object
    const updatedClientData: any = { email };
    if (hashedPassword) {
        updatedClientData.password = hashedPassword;
    }

    const updatedUserData = {
        fullName,
        gender,
        age,
        contactNo,
        address,
        status,
        cnic,
        role: Role.client,
        profileImage: profileImageUrl
    };
    console.log("profile image", updatedUserData);


    const isUserUpdated = await prisma.user.update({
        where: { id: isClientExist.userId },
        data: updatedUserData,
    });

    const isClientUpdated = await prisma.client.update({
        where: { id: clientId },
        data: updatedClientData,
    });

    const updatedData = { ...isUserUpdated, ...isClientUpdated };

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { updatedData }, "Client updated successfully")
    );
});


const getTotalClient = asyncHandler(async (req: Request, res: Response) => {


    const allClient = await prisma.client.findMany({
        include: { user: true, recievedDocument: { include: { provider: { include: { user: true } }, document: true } } }, // Assuming 'user' is related to 'client'
    });

    res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, { totalDocument: allClient.length, providers: allClient }, "All Providers fetched successfully"))

})



const addClient = asyncHandler(async (req: Request, res: Response) => {
    // Convert age and boolean from strings to correct types
    if (req.body.age) {
        req.body.age = Number(req.body.age);
    }

    if (req.body.isAccountCreatedByOwnClient) {
        req.body.isAccountCreatedByOwnClient = req.body.isAccountCreatedByOwnClient === "true";
    }
    // 1. Validate user schema
    const userParsedData = userSchema.safeParse(req.body);
    if (!userParsedData.success) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: userParsedData.error.errors }, "Validation failed")
        );
    }

    const { fullName, gender = "male", age, contactNo, address, status = "active", cnic, role } = userParsedData.data;

    // 2. Check for duplicate CNIC
    const existingUser = await prisma.user.findFirst({ where: { cnic } });
    if (existingUser) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { error: `CNIC ${cnic} is already registered.` }, "Validation failed")
        );
    }
    let profileImageUrl: string | null = null;
    if (req.file) {
        profileImageUrl = `/uploads/${req.file.filename}`; // Or full URL if needed
    }
    // 3. Create User
    const userData: any = { fullName, gender, age, contactNo, address, status, cnic, role, profileImage: profileImageUrl };
    const userCreated = await prisma.user.create({ data: userData });

    // 4. Handle Client Signup
    if (role === Role.client) {
        const clientParsed = clientSchema.safeParse(req.body);
        if (!clientParsed.success) {
            return res.status(StatusCodes.BAD_REQUEST).json(
                new ApiResponse(StatusCodes.BAD_REQUEST, { error: clientParsed.error.errors }, "Validation failed")
            );
        }

        const { isAccountCreatedByOwnClient, email, password, providerId } = clientParsed.data;

        // Check for duplicate client email
        const existingClient = await prisma.client.findFirst({ where: { email } });
        if (existingClient) {
            return res.status(StatusCodes.CONFLICT).json(
                new ApiResponse(StatusCodes.CONFLICT, { error: `Email: ${email} is already taken.` }, "Validation failed")
            );
        }

        // Hash password if provided
        const hashedPassword = await bcrypt.hash(password ?? "", 10);

        // 5. Create Client
        const clientCreated = await prisma.client.create({
            data: {
                userId: userCreated.id,
                isAccountCreatedByOwnClient,
                email,
                password: hashedPassword
            },
            include: {
                user: true
            }
        });

        // 6. Link provider to client
        if (providerId) {
            await prisma.providerOnClient.create({
                data: {
                    providerId,
                    clientId: clientCreated?.id
                }
            });
        }

        return res.status(StatusCodes.CREATED).json(
            new ApiResponse(StatusCodes.CREATED, clientCreated, "Client created and linked to provider successfully")
        );
    }

    // 7. If not client role (e.g. provider role), return success
    return res.status(StatusCodes.CREATED).json(
        new ApiResponse(StatusCodes.CREATED, userCreated, "User created successfully")
    );
});



const updateExistingClientOnCNIC = asyncHandler(async (req: Request, res: Response) => {

    // Validate data
    const clientData = clientSchema.safeParse(req.body);
    if (!clientData.success) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: clientData.error.errors }, "Validation Failed")
        );
    }

    const { fullName, gender, age, contactNo, address, status, cnic, email, password, clientId } = clientData.data;
    // Hash password if provided
    const hashedPassword = await bcrypt.hash(password ?? "", 10);
    const isClientExist = await prisma.client.findFirst({ where: { id: clientId } });
    if (!isClientExist) {
        return res.status(StatusCodes.NOT_FOUND).json(
            new ApiResponse(StatusCodes.NOT_FOUND, { error: "Client not found" }, "Not found")
        );
    }

    const isEmailExist = await prisma.client.findFirst({
        where: {
            email,
            id: {
                not: clientId
            }
        }
    });
    if (isEmailExist) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { error: `Email ${email} already taken` }, "Duplicate Error")
        );
    }

    const isCnicExists = await prisma.user.findFirst({
        where: {
            cnic,
            id: {
                not: isClientExist.userId
            }
        }
    });
    if (isCnicExists) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { error: `CNIC ${cnic} already taken` }, "Duplicate Error")
        );
    }

    const isFullNameExist = await prisma.user.findFirst({ where: { fullName, id: { not: isClientExist.userId } } });
    if (isFullNameExist) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { error: `Full Name ${fullName} already taken` }, "Duplicate Error")
        );
    }

    const updatedClientData = { email, password: hashedPassword };
    const updatedUserData = { fullName, gender, age, contactNo, address, status, cnic, role: Role.client };


    const isUserUpdated = await prisma.user.update({
        where: { id: isClientExist.userId },
        data: updatedUserData,
    });
    const isClientUpdated = await prisma.client.update({
        where: { id: clientId },
        data: updatedClientData,
    });
    const updatedData = { ...isUserUpdated, ...isClientUpdated }
    if (!isClientUpdated) {
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(
            new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, { error: "Something went wrong. Try later" }, "")
        );
    }

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { updatedData }, "Client updated successfully")
    );
});



export { getAllClients, deletClient, updateClient, getTotalClient, addClient, updateExistingClientOnCNIC }