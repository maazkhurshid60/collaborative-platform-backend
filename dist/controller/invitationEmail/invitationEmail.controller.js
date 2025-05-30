"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendInvitationEmailApi = void 0;
const asyncHandler_1 = require("../../utils/asyncHandler");
const SendInvitationEmail_1 = require("../../utils/nodeMailer/SendInvitationEmail");
const http_status_codes_1 = require("http-status-codes");
const apiResponse_1 = require("../../utils/apiResponse");
const sendInvitationEmailApi = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { invitationEmail, providerName } = req.body;
    if (!invitationEmail || !providerName) {
        return res.status(400).json({ success: false, message: "Missing email or provider name." });
    }
    try {
        yield (0, SendInvitationEmail_1.sendInvitationEmail)(invitationEmail, providerName);
        return res.status(http_status_codes_1.StatusCodes.OK).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.OK, { message: `Invitation email sent to ${invitationEmail}` }, "ok"));
    }
    catch (error) {
        console.error("Email send error:", error);
        return res.status(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR).json(new apiResponse_1.ApiResponse(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR, { error: "Verify is email is valid" }, "Internal server error"));
    }
}));
exports.sendInvitationEmailApi = sendInvitationEmailApi;
