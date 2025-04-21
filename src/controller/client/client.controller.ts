import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import prisma from "../../db/db.config";
import { StatusCodes } from "http-status-codes";
import { ApiResponse } from "../../utils/apiResponse";
import { clientSchema } from "../../schema/client/client.schema";
import { Role } from "@prisma/client";


const getAllClients = asyncHandler(async (req: Request, res: Response) => {
    const { loginUserId } = req.body;

    // Get the login user details
    const loginUser = await prisma.user.findUnique({ where: { id: loginUserId } });
    if (!loginUser) {
        return res.status(StatusCodes.NOT_FOUND).json(
            new ApiResponse(StatusCodes.NOT_FOUND, { error: "User not found" }, "Validation failed")
        );
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Get all clients with pagination and user data included
    const allClients = await prisma.client.findMany({
        include: { user: true, recievedDocument: { include: { provider: { include: { user: true } }, document: true } } }, // Assuming 'user' is related to 'client'
    });

    // Filter out clients that are blocked by the logged-in user
    let filteredClients = allClients.filter(client => {
        // Make sure you're accessing 'user.id' within each 'client'
        return !loginUser.blockedMembers.includes(client.user.id); // Assuming 'client.user.id' is correct
    });

    filteredClients = filteredClients?.filter(client => !client.user.blockedMembers.includes(loginUser.id))

    const totalDocument = filteredClients.length;

    // Return the filtered clients
    res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { totalDocument, clients: filteredClients }, "All Clients fetched successfully")
    );
});


const deletClient = asyncHandler(async (req: Request, res: Response) => {
    const { clientId } = req.body
    const isClientExist = await prisma.client.findFirst({ where: { id: clientId } })
    if (!isClientExist) {
        return res.status(StatusCodes.NOT_FOUND).json(new ApiResponse(StatusCodes.NOT_FOUND, { error: "Client does not exist." }, ""))
    }
    const isClientDeleted = await prisma.client.delete({ where: { id: clientId } })
    if (!isClientDeleted) {
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, { error: "Internal Server Error." }, ""))
    }
    return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, { isClientDeleted }, `${isClientDeleted.email} deleted successfully`))
})

const updateClient = asyncHandler(async (req: Request, res: Response) => {

    // Validate data
    const clientData = clientSchema.safeParse(req.body);
    if (!clientData.success) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: clientData.error.errors }, "Validation Failed")
        );
    }

    const { fullName, gender, age, contactNo, address, status, cnic, email, password, clientId } = clientData.data;

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

    const updatedClientData = { email };
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




export { getAllClients, deletClient, updateClient }