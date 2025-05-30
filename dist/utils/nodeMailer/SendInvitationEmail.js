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
exports.sendInvitationEmail = void 0;
const NodeMailer_1 = require("./NodeMailer");
const sendInvitationEmail = (toEmail, providerName) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("Sending Invitation Email:");
    console.log("To:", toEmail);
    console.log("Provider Name:", providerName);
    const htmlContent = `
    <div style="font-family: sans-serif; padding: 20px;">
      <h2>Hello ${toEmail.split("@")[0]},</h2>
      <p><strong>${providerName}</strong> has invited you to join our collaborative platform.</p>
      <p>Click the button below to signin:</p>
      <a href="https://collaborative-platform-frontend.vercel.app/"
         style="display:inline-block; padding:10px 20px; background-color:#0F766E; color:white; border-radius:4px; text-decoration:none; font-weight:bold;">
         Join Now
      </a>
      <p style="margin-top:20px;">If you didn’t expect this invitation, you can safely ignore this email.</p>
      <p style="margin-top:20px;">Best regards,<br />The Collaborative Platform Team</p>
    </div>
  `;
    yield NodeMailer_1.transporter.sendMail({
        from: `"Collaborative Platform" <${process.env.MAIL_USER}>`,
        to: toEmail,
        subject: `${providerName} invited you to join the platform`,
        html: htmlContent,
    });
});
exports.sendInvitationEmail = sendInvitationEmail;
