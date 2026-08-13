import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/apiResponse";
import { ProviderQueryService } from "../../services/ProviderQueryService";

const providerQueryService = new ProviderQueryService();

const submitPublicQueryApi = asyncHandler(
  async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const { guestName, guestEmail, guestPhone, message } = req.body;

    // Every field is required — this endpoint can be called directly (not just via the
    // landing page's form), so the landing page's own validation isn't enough on its own.
    if (
      !String(guestName || "").trim() ||
      !String(guestEmail || "").trim() ||
      !String(guestPhone || "").trim() ||
      !String(message || "").trim()
    ) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json(
          new ApiResponse(
            StatusCodes.BAD_REQUEST,
            null,
            "All fields are required.",
          ),
        );
    }

    const query = await providerQueryService.submitPublicQuery(slug, {
      guestName,
      guestEmail,
      guestPhone,
      message,
    });

    return res
      .status(StatusCodes.CREATED)
      .json(
        new ApiResponse(
          StatusCodes.CREATED,
          query,
          "Query submitted successfully",
        ),
      );
  },
);

const getMyQueriesApi = asyncHandler(async (req: Request, res: Response) => {
  const loginUserId = (req as any).user.id;

  const queries = await providerQueryService.getMyQueries(loginUserId);

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, queries, "OK"));
});

const deleteMyQueryApi = asyncHandler(async (req: Request, res: Response) => {
  const loginUserId = (req as any).user.id;
  const queryId = String(req.params.queryId);

  await providerQueryService.deleteMyQuery(loginUserId, queryId);

  return res
    .status(StatusCodes.OK)
    .json(new ApiResponse(StatusCodes.OK, null, "Query deleted successfully"));
});

export { submitPublicQueryApi, getMyQueriesApi, deleteMyQueryApi };
