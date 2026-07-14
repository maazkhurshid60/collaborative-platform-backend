import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import prisma from "../../db/db.config";
import { StatusCodes } from "http-status-codes";
import { ApiResponse } from "../../utils/apiResponse";
import { Role } from "../../generated/prisma/enums";
import { providerSchema } from "../../schema/provider/provider.schema";
import { SubscriptionService } from "../../services/SubscriptionService";


const getAllUnblockProviders = asyncHandler(async (req: Request, res: Response) => {
    const { loginUserId } = req.body;

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
        skip,
        take: limit,
        orderBy: {
            createdAt: 'desc'  // 👈 Get latest first
        },
        select: {
            id: true,
            speciality: true,
            createdAt: true,
            updatedAt: true,
            user: {
                select: {
                    id: true,
                    email: true,
                    fullName: true,
                    profileImage: true,
                    gender: true,
                    age: true,
                    contactNo: true,
                    address: true,
                    status: true,
                    licenseNo: true,
                    role: true,
                    isApprove: true,
                    //           country: true,
                    state: true,
                    blockedMembers: true,
                }
            },
            clientList: {
                select: {
                    client: {
                        select: {
                            clientShowToOthers: true,
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
    const filteredProviders = allProviders.filter(provider => !loginUser.blockedMembers.includes(provider.user.id) && provider.user.id !== loginUserId)
    const totalDocument = filteredProviders.length

    res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, { totalDocument: totalDocument, providers: filteredProviders }, "All Providers fetched successfully"))

})


const getTotalProviders = asyncHandler(async (req: Request, res: Response) => {

    const allProviders = await prisma.provider.findMany({
        take: 1000,
        select: {
            id: true,
            speciality: true,
            createdAt: true,
            updatedAt: true,
            user: {
                select: {
                    id: true,
                    email: true,
                    fullName: true,
                    profileImage: true,
                    gender: true,
                    age: true,
                    contactNo: true,
                    address: true,
                    status: true,
                    licenseNo: true,
                    role: true,
                    isApprove: true,
                    //         country: true,
                    state: true,
                    blockedMembers: true,
                }
            },
            clientList: {
                select: {
                    client: {
                        select: {
                            clientShowToOthers: true,
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


    res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, { totalDocument: allProviders.length, providers: allProviders }, "All Providers fetched successfully"))

})

const deletProvider = asyncHandler(async (req: Request, res: Response) => {
    const { providerId } = req.body
    const isProviderExist = await prisma.provider.findFirst({
        where: { id: providerId },
        include: { user: true }
    })
    if (!isProviderExist) {
        return res.status(StatusCodes.NOT_FOUND).json(new ApiResponse(StatusCodes.NOT_FOUND, { error: "Provider does not exist." }, ""))
    }

    try {
        const subscriptionService = new SubscriptionService();
        await subscriptionService.cancelStripeSubscription(isProviderExist.userId);
    } catch (error) {
        console.error("Failed to safely cancel stripe sub during account delete", error);
    }

    const isProviderDeleted = await prisma.provider.delete({ where: { id: providerId } })
    if (!isProviderDeleted) {
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, { error: "Internal Server Error." }, ""))
    }
    return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, { isProviderDeleted }, `${isProviderExist.user.email} deleted successfully`))
})

const updateProvider = asyncHandler(async (req: Request, res: Response) => {

    const ageVal = req.body.age ? Number(req.body.age) : undefined;
    const providerData = providerSchema.safeParse({ ...req.body, age: ageVal });
    if (!providerData.success) {
        return res.status(StatusCodes.BAD_REQUEST).json(
            new ApiResponse(StatusCodes.BAD_REQUEST, { error: providerData.error.errors }, "Validation Failed")
        );
    }

    const { fullName, gender, age, contactNo, address, status, licenseNo, email, providerId, speciality } = providerData.data;

    const isProviderExist = await prisma.provider.findFirst({ where: { id: providerId } });
    if (!isProviderExist) {
        return res.status(StatusCodes.NOT_FOUND).json(
            new ApiResponse(StatusCodes.NOT_FOUND, { error: "Provider not found" }, "Not found")
        );
    }

    const isEmailExist = await prisma.user.findFirst({
        where: {
            email,
            id: {
                not: isProviderExist.userId
            }
        }
    });
    if (isEmailExist) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { error: `Email ${email} already taken` }, "Duplicate Error")
        );
    }

    const isLicenseNoExists = await prisma.user.findFirst({
        where: {
            licenseNo,
            id: {
                not: isProviderExist.userId
            }
        }
    });
    if (isLicenseNoExists) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { error: `License Number ${licenseNo} already taken` }, "Duplicate Error")
        );
    }

    const isFullNameExist = await prisma.user.findFirst({ where: { fullName, id: { not: isProviderExist.userId } } });
    if (isFullNameExist) {
        return res.status(StatusCodes.CONFLICT).json(
            new ApiResponse(StatusCodes.CONFLICT, { error: `Full Name ${fullName} already taken` }, "Duplicate Error")
        );
    }

    const updatedproviderData = { speciality };
    const updatedUserData: any = { fullName, email, gender, age, contactNo, address, status, licenseNo, role: Role.provider };

    if (req.file) {
        updatedUserData.profileImage = (req.file as any).location;
    } else if (req.body.profileImage === "null") {
        updatedUserData.profileImage = null;
    }


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