import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import prisma from "../../db/db.config";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/apiResponse";

// GET /api/v1/super-admin/first  (NO AUTH)
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

  const { password, ...safe } = superAdmin;

  return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, safe, "OK"));
});

// GET /api/v1/super-admin/:id  (NO AUTH)
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

  const { password, ...safe } = superAdmin;

  return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, safe, "OK"));
});
