import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendInvitationEmail } from "../../utils/nodeMailer/SendInvitationEmail";
import { StatusCodes } from "http-status-codes";
import { ApiResponse } from "../../utils/apiResponse";

const sendInvitationEmailApi = asyncHandler(async (req: Request, res: Response) => {
    const { invitationEmail, providerName, invitationChatLink } = req.body;

    if (!invitationEmail || !providerName) {
        return res.status(400).json({ success: false, message: "Missing email or provider name." });
    }

    try {
        await sendInvitationEmail(invitationEmail, providerName, invitationChatLink);

        return res.status(StatusCodes.OK).json(
            new ApiResponse(StatusCodes.OK, { message: `Invitation email sent to ${invitationEmail}` }, "ok")
        );
    } catch (error) {
        console.error("Email send error:", error);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(
            new ApiResponse(StatusCodes.INTERNAL_SERVER_ERROR, { error: "Verify is email is valid" }, "Internal server error")
        );
    }
});

export { sendInvitationEmailApi };