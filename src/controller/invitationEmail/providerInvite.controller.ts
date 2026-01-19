import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import prisma from "../../db/db.config";
import { StatusCodes } from "http-status-codes";
import { ApiResponse } from "../../utils/apiResponse";
import { sendProviderSignupInviteEmail } from "../../utils/nodeMailer/InviteProviderSignupEmail";

export const inviteProviderSignupApi = asyncHandler(async (req: Request, res: Response) => {
  const { invitationEmail, invitedByUserId } = req.body;

  if (!invitationEmail || !invitedByUserId) {
    return res.status(StatusCodes.BAD_REQUEST).json(
      new ApiResponse(StatusCodes.BAD_REQUEST, null, "invitationEmail and invitedByUserId are required.")
    );
  }

  const inviter = await prisma.provider.findFirst({
    where: { id: invitedByUserId },
    include: { user: true },
  });

  const invitedByName = inviter?.user?.fullName || "A Kolabme user";

  const existingProvider = await prisma.provider.findFirst({
    where: { email: invitationEmail },
  });

  if (existingProvider) {
    return res.status(StatusCodes.CONFLICT).json(
      new ApiResponse(
        StatusCodes.CONFLICT,
        null,
        `This email is already registered as a provider: ${invitationEmail}`
      )
    );
  }

  try {
    await sendProviderSignupInviteEmail(invitationEmail, invitedByName);

    return res.status(StatusCodes.OK).json(
      new ApiResponse(StatusCodes.OK, { message: `Invite email sent to ${invitationEmail}` }, "OK")
    );
  } catch (error) {
    console.error("Invite email send error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(
      new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, null, "Failed to send invite email.")
    );
  }
});
