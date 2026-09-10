import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/apiResponse";
import { ApiError } from "../../utils/apiError";
import { ReviewService } from "../../services/ReviewService";

const reviewService = new ReviewService();

const createReviewApi = asyncHandler(async (req: Request, res: Response) => {
  const loginUserId = (req as any).user.id || (req as any).user?.userId;
  const { appointmentId, rating, comment } = req.body;

  if (!String(appointmentId || "").trim()) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "appointmentId is required.");
  }

  const review = await reviewService.createReview(loginUserId, {
    appointmentId: String(appointmentId),
    rating: Number(rating),
    comment,
  });

  return res
    .status(StatusCodes.CREATED)
    .json(new ApiResponse(StatusCodes.CREATED, review, "Review submitted successfully"));
});

const getProviderReviewsApi = asyncHandler(async (req: Request, res: Response) => {
  const providerId = String(req.params.providerId);
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

  const result = await reviewService.getProviderReviews(providerId, page, limit);
  return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, result, "OK"));
});

const getMyReviewsApi = asyncHandler(async (req: Request, res: Response) => {
  const loginUserId = (req as any).user.id || (req as any).user?.userId;
  const reviews = await reviewService.getMyReviews(loginUserId);
  return res.status(StatusCodes.OK).json(new ApiResponse(StatusCodes.OK, reviews, "OK"));
});

export { createReviewApi, getProviderReviewsApi, getMyReviewsApi };
