import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import prisma from "../../db/db.config";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/apiResponse";
import { Prisma } from "../../generated/prisma/client";

export const getSuperAdminFirst = asyncHandler(async (_req: Request, res: Response) => {
  const superAdmin = await prisma.superAdmin.findFirst({
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });

  if (!superAdmin) {
    return res.status(StatusCodes.NOT_FOUND).json({
      success: false,
      message: "Super admin not found",
    });
  }

  const { password, ...safe } = superAdmin as any;

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, safe, "OK"));
});

export const getSuperAdminById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const superAdmin = await prisma.superAdmin.findUnique({
    where: { id: id as string },
    include: { user: true },
  });

  if (!superAdmin) {
    return res.status(StatusCodes.NOT_FOUND).json({
      success: false,
      message: "Super admin not found",
    });
  }

  const { password, ...safe } = superAdmin as any;

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, safe, "OK"));
});

export const updateSuperAdminById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const {
    fullName,
    licenseNumber,
    age,
    address,
    country,
    state,
    email,
    contactNo,
    gender,
    profileImage,
  } = req.body;

  const adminData: Prisma.SuperAdminUpdateInput = {};

  const userUpdate: Record<string, any> = {};

  if (fullName !== undefined) userUpdate.fullName = fullName;
  if (licenseNumber !== undefined) userUpdate.licenseNo = licenseNumber;
  if (age !== undefined) userUpdate.age = age;
  if (address !== undefined) userUpdate.address = address;
  if (country !== undefined) userUpdate.country = country;
  if (state !== undefined) userUpdate.state = state;
  if (contactNo !== undefined) userUpdate.contactNo = contactNo;
  if (gender !== undefined) userUpdate.gender = gender;
  if (profileImage !== undefined) userUpdate.profileImage = profileImage;

  if (email !== undefined) userUpdate.email = email;

  if (Object.keys(adminData).length === 0 && Object.keys(userUpdate).length === 0) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: "No fields provided to update",
    });
  }

  if (Object.keys(userUpdate).length > 0) {
    adminData.user = {
      update: userUpdate,
    };
  }

  try {
    const superAdmin = await prisma.superAdmin.update({
      where: { id: id as string },
      data: adminData,
      include: { user: true },
    });

    const { password, ...safe } = superAdmin as any;

    return res
      .status(StatusCodes.OK)
      .json(
        new ApiResponse(
          StatusCodes.OK,
          safe,
          "Super admin updated successfully",
        ),
      );
  } catch (error: any) {
    console.error("updateSuperAdminById error:", error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Super admin not found",
      });
    }

    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: "Failed to update super admin",
      error: error?.message ?? String(error),
    });
  }


});

export const getAllPayments = asyncHandler(async (_req: Request, res: Response) => {
  const payments = await prisma.payment.findMany({
    include: {
      user: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, payments, "Payments fetched successfully"));
});

export const getAllSubscriptions = asyncHandler(async (_req: Request, res: Response) => {
  const subscriptions = await prisma.subscription.findMany({
    include: {
      user: {
        include: {
          payments: {
            orderBy: {
              createdAt: "desc",
            },
            take: 1,
          },
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, subscriptions, "Subscriptions fetched successfully"));
});

export const updateSubscription = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { plan, status, currentPeriodEnd } = req.body;

  const subscription = await prisma.subscription.update({
    where: { id },
    data: {
      plan,
      status,
      currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd) : undefined,
    },
    include: { user: true },
  });

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, subscription, "Subscription updated successfully"));
});

export const deleteSubscription = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;

  await prisma.subscription.delete({
    where: { id },
  });

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, null, "Subscription deleted successfully"));
});

export const getProviderContactInfo = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params.userId as string;

  const provider = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      provider: true,
    },
  });

  if (!provider) {
    return res.status(StatusCodes.NOT_FOUND).json({
      success: false,
      message: "Provider not found",
    });
  }

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, provider, "Provider contact info fetched successfully"));
});

export const getProviderSubscriptionInfo = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params.userId as string;

  const subscription = await prisma.subscription.findUnique({
    where: { userId },
  });

  if (!subscription) {
    return res.status(StatusCodes.NOT_FOUND).json({
      success: false,
      message: "Subscription not found",
    });
  }

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, subscription, "Subscription info fetched successfully"));
});

export const getProviderPaymentHistory = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params.userId as string;

  const payments = await prisma.payment.findMany({
    where: { userId },
    orderBy: {
      createdAt: "desc",
    },
  });

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, payments, "Payment history fetched successfully"));
});
