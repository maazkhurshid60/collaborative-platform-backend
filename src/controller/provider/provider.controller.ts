import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import prisma from "../../db/db.config";
import { StatusCodes } from "http-status-codes";
import { ApiResponse } from "../../utils/apiResponse";
import { Role } from "@prisma/client";
import { providerSchema } from "../../schema/provider/provider.schema";


const getAllUnblockProviders = asyncHandler(async (req: Request, res: Response) => {
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
    const skip = (page - 1) * limit
    const allProviders = await prisma.provider.findMany({
        skip, take: limit, orderBy: {
            createdAt: 'desc'  // 👈 Get latest first
        }, include: {
            user: true, sharedDocument: { include: { document: true, client: { include: { user: true } } } }, clientList: {
                include: {
                    client: {
                        include: { user: true }
                    }
                }
            }
        }
    })
    console.log("all providers", allProviders);
    //Only those providers will be shown which are not blocked by the login user
    const filteredProviders = allProviders.filter(provider => !loginUser.blockedMembers.includes(provider.user.id))
    const totalDocument = filteredProviders.length

    res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, { totalDocument: totalDocument, providers: filteredProviders }, "All Providers fetched successfully"))

})


const getTotalProviders = asyncHandler(async (req: Request, res: Response) => {

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit
    const allProviders = await prisma.provider.findMany({ skip, take: limit, include: { user: true, sharedDocument: { include: { document: true, client: { include: { user: true } } } } } })


    res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, { totalDocument: allProviders.length, providers: allProviders }, "All Providers fetched successfully"))

})

const deletProvider = asyncHandler(async (req: Request, res: Response) => {
    const { providerId } = req.body
    const isProviderExist = await prisma.provider.findFirst({ where: { id: providerId } })
    if (!isProviderExist) {
        return res.status(StatusCodes.NOT_FOUND).json(new ApiResponse(StatusCodes.NOT_FOUND, { error: "Provider does not exist." }, ""))
    }
    const isProviderDeleted = await prisma.provider.delete({ where: { id: providerId } })
    if (!isProviderDeleted) {
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, { error: "Internal Server Error." }, ""))
    }
    return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, { isProviderDeleted }, `${isProviderDeleted.email} deleted successfully`))
})

const updateProvider = asyncHandler(async (req: Request, res: Response) => {

    // Validate data
    const providerData = providerSchema.safeParse(req.body);
    if (!providerData.success) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: providerData.error.errors }, "Validation Failed")
        );
    }

    const { fullName, gender, age, contactNo, address, status, cnic, email, password, providerId, department } = providerData.data;

    const isProviderExist = await prisma.provider.findFirst({ where: { id: providerId } });
    if (!isProviderExist) {
        return res.status(StatusCodes.NOT_FOUND).json(
            new ApiResponse(StatusCodes.NOT_FOUND, { error: "Provider not found" }, "Not found")
        );
    }

    const isEmailExist = await prisma.provider.findFirst({
        where: {
            email,
            id: {
                not: providerId
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
                not: isProviderExist.userId
            }
        }
    });
    if (isCnicExists) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { error: `CNIC ${cnic} already taken` }, "Duplicate Error")
        );
    }

    const isFullNameExist = await prisma.user.findFirst({ where: { fullName, id: { not: isProviderExist.userId } } });
    if (isFullNameExist) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { error: `Full Name ${fullName} already taken` }, "Duplicate Error")
        );
    }

    const updatedproviderData = { email, department };
    const updatedUserData = { fullName, gender, age, contactNo, address, status, cnic, role: Role.provider };


    const isUserUpdated = await prisma.user.update({
        where: { id: isProviderExist.userId },
        data: updatedUserData,
    });
    const isProviderUpdated = await prisma.provider.update({
        where: { id: providerId },
        data: updatedproviderData,
    });
    const updatedData = { ...isUserUpdated, ...isProviderUpdated }
    if (!isProviderUpdated) {
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(
            new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, { error: "Something went wrong. Try later" }, "")
        );
    }

    return res.status(StatusCodes.OK).json(
        new ApiResponse(StatusCodes.OK, { updatedData }, "Provider updated successfully")
    );
});




export { getAllUnblockProviders, deletProvider, updateProvider, getTotalProviders }