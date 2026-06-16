import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendInvitationEmail } from "../../utils/nodeMailer/SendInvitationEmail";
import { StatusCodes } from "http-status-codes";
import { ApiResponse } from "../../utils/apiResponse";

const sendInvitationEmailApi = asyncHandler(
  async (req: Request, res: Response) => {
    const { invitationEmail, providerName, invitationChatLink } = req.body;

    if (!invitationEmail || !providerName) {
      return res
        .status(400)
        .json({ success: false, message: "Missing email or provider name." });
    }

    await sendInvitationEmail(
      invitationEmail,
      providerName,
      invitationChatLink,
    );

    return res
      .status(StatusCodes.OK)
      .json(
        new ApiResponse(
          StatusCodes.OK,
          { message: `Invitation email sent to ${invitationEmail}` },
          "ok",
        ),
      );
  },
);

export { sendInvitationEmailApi };
