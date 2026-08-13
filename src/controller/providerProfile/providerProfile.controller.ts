import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/apiResponse";
import { ProviderProfileService } from "../../services/ProviderProfileService";

const providerProfileService = new ProviderProfileService();

const getMyProviderProfileApi = asyncHandler(
  async (req: Request, res: Response) => {
    const loginUserId = (req as any).user.id;
    const profile =
      await providerProfileService.getOrCreateForLoginUser(loginUserId);

    return res
      .status(StatusCodes.OK)
      .json(new ApiResponse(StatusCodes.OK, profile, "OK"));
  },
);

const updateMyProviderProfileApi = asyncHandler(
  async (req: Request, res: Response) => {
    const loginUserId = (req as any).user.id;
    const profile = await providerProfileService.updateForLoginUser(
      loginUserId,
      req.body,
    );

    return res
      .status(StatusCodes.OK)
      .json(
        new ApiResponse(
          StatusCodes.OK,
          profile,
          "Profile updated successfully",
        ),
      );
  },
);

const setPublishStatusApi = asyncHandler(
  async (req: Request, res: Response) => {
    const loginUserId = (req as any).user.id;
    const isPublished = !!req.body.isPublished;
    const profile = await providerProfileService.setPublished(
      loginUserId,
      isPublished,
    );

    return res
      .status(StatusCodes.OK)
      .json(
        new ApiResponse(
          StatusCodes.OK,
          profile,
          isPublished ? "Profile published" : "Profile unpublished",
        ),
      );
  },
);

const setVerificationFlagsApi = asyncHandler(
  async (req: Request, res: Response) => {
    const providerId = String(req.params.providerId);
    const { identityVerified, backgroundChecked } = req.body;

    const flags: { identityVerified?: boolean; backgroundChecked?: boolean } =
      {};
    if (identityVerified !== undefined)
      flags.identityVerified = !!identityVerified;
    if (backgroundChecked !== undefined)
      flags.backgroundChecked = !!backgroundChecked;

    const profile = await providerProfileService.setVerificationFlags(
      providerId,
      flags,
    );

    return res
      .status(StatusCodes.OK)
      .json(
        new ApiResponse(StatusCodes.OK, profile, "Verification status updated"),
      );
  },
);

const searchPublicProviderProfilesApi = asyncHandler(
  async (req: Request, res: Response) => {
    const { q, specialty } = req.query;

    const results = await providerProfileService.searchPublished({
      query: q ? String(q) : undefined,
      specialty: specialty ? String(specialty) : undefined,
    });

    return res
      .status(StatusCodes.OK)
      .json(new ApiResponse(StatusCodes.OK, results, "OK"));
  },
);

const getPublicProviderProfileApi = asyncHandler(
  async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const profile = await providerProfileService.getPublicBySlug(slug);

    if (!profile) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json(
          new ApiResponse(StatusCodes.NOT_FOUND, null, "Profile not found"),
        );
    }

    return res
      .status(StatusCodes.OK)
      .json(new ApiResponse(StatusCodes.OK, profile, "OK"));
  },
);

export {
  getMyProviderProfileApi,
  updateMyProviderProfileApi,
  setPublishStatusApi,
  setVerificationFlagsApi,
  searchPublicProviderProfilesApi,
  getPublicProviderProfileApi,
};
