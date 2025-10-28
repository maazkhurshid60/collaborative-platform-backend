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
exports.sendDocumentEmail = void 0;
const NodeMailer_1 = require("./NodeMailer");
const sendDocumentEmail = (toEmail, clientName, providerName) => __awaiter(void 0, void 0, void 0, function* () {
    const htmlContent = `
    <div style="font-family: sans-serif; padding: 20px;">
      <h2>Hello ${clientName},</h2>
      <p><strong>${providerName}</strong> has shared some documents with you.</p>
      <p>Please login to your dashboard to review and sign them.</p>
      <a href="${process.env.NODE_ENV === "DEVELOPMENT" ? process.env.FRONTEND_LOCAL_URL : process.env.FRONTEND_AWS_URL}/signup-with-license/"
         style="display:inline-block; padding:10px 20px; background-color:#0F766E; color:white; border-radius:4px; text-decoration:none;">
         Login to View
      </a>
      <p style="margin-top:20px;">Thanks,<br />Collaborative Platform</p>
    </div>
  `;
    yield NodeMailer_1.transporter.sendMail({
        // from: `"Collaborative Platform" <${process.env.NODE_MAILER_USER}>`,
        from: `"Collaborative Platform" <${process.env.NODE_MAILER_EMAIL}>`,
        to: toEmail,
        subject: "New Documents Shared With You",
        html: htmlContent,
    });
});
exports.sendDocumentEmail = sendDocumentEmail;
