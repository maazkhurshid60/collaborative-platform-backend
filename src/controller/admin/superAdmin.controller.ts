import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import prisma from "../../db/db.config";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/apiResponse";
import { Prisma } from "@prisma/client";

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
    where: { id },
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
  } = req.body;

  const adminData: Prisma.SuperAdminUpdateInput = {};

  const userUpdate: Record<string, any> = {};

  if (fullName !== undefined) userUpdate.fullName = fullName;
  if (licenseNumber !== undefined) userUpdate.licenseNo = licenseNumber;
  if (age !== undefined) userUpdate.age = age;
  if (address !== undefined) userUpdate.address = address;
  if (country !== undefined) userUpdate.country = country;
  if (state !== undefined) userUpdate.state = state;

  if (email !== undefined) {
    adminData.email = email;
  }

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
      where: { id },
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