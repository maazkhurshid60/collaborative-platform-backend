import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import prisma from "../../db/db.config";
import { StatusCodes } from "http-status-codes";
import { ApiResponse } from "../../utils/apiResponse";
import { sendProviderSignupInviteEmail } from "../../utils/nodeMailer/InviteProviderSignupEmail";
import crypto from "crypto";
export const inviteProviderSignupApi = asyncHandler(async (req: Request, res: Response) => {
  const { invitationEmail, invitedByUserId } = req.body;

  if (!invitationEmail || !invitedByUserId) {
    return res.status(StatusCodes.BAD_REQUEST).json(
      new ApiResponse(StatusCodes.BAD_REQUEST, null, "invitationEmail and invitedByUserId are required.")
    );
  }

  const invitationExists = await prisma.invitation.findFirst({
    where: {
      email: invitationEmail,
      AND: {
        status: "PENDING"
      }
    }
  })

  if (invitationExists) {
    return res.status(StatusCodes.CONFLICT).json(new ApiResponse(StatusCodes.CONFLICT, null, `User is already invited on the platform`))
  }

  // Check if already a provider 
  const existingProvider = await prisma.provider.findFirst({
    where: {
      user: {
        email: invitationEmail,
      }
    }
  })

  if (existingProvider) {
    return res.status(StatusCodes.CONFLICT).json(new ApiResponse(StatusCodes.CONFLICT, null, `This user is already registered on the platform`))
  }

  // 1. Find the inviter provider record to get the correct Provider ID
  const inviter = await prisma.provider.findFirst({
    where: {
      OR: [
        { id: invitedByUserId },
        { userId: invitedByUserId }
      ]
    },
    include: {
      user: {
        select: {
          fullName: true,
          address: true,
          country: true,
          state: true,
          licenseNo: true,
        }
      }
    }
  });

  if (!inviter) {
    return res.status(StatusCodes.NOT_FOUND).json(
      new ApiResponse(StatusCodes.NOT_FOUND, null, "Inviter provider record not found.")
    );
  }

  // 2. Generate a secure token 
  const token = crypto.randomBytes(32).toString("hex");

  await prisma.invitation.create({
    data: {
      token,
      email: invitationEmail,
      invitedById: inviter.id,
    }
  });

  // 3. Send invite email
  const invitedByName = inviter.user.fullName || "A Kolabme User";

  try {
    await sendProviderSignupInviteEmail(invitationEmail, invitedByName, token);

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


