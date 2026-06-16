import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { asyncHandler } from "./asyncHandler";

export const notFound = asyncHandler(async (req: Request, res: Response) => {
  res.status(StatusCodes.NOT_FOUND).json({
    success: false,
    message: `Route not found: ${req.originalUrl}`,
  });
});
