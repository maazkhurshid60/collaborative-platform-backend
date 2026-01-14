import { transporter } from "./NodeMailer";
import { getFrontendUrl } from "./getFrontendUrl";

export const sendApprovalEmail = async (toEmail: string, name: string, licenseNo: string) => {
  const signupUrl = `${getFrontendUrl()}/signup-with-license`;

  const htmlContent = `
    <div style="font-family: sans-serif; padding: 20px;">
      <h2>Hello ${name},</h2>
      <p>Your account has been approved by the Kolabme team.</p>
      <p><strong>Your License Number:</strong> ${licenseNo}</p>
      <p>Please click the button below to set your password:</p>
      <a href="${signupUrl}"
         style="display:inline-block; padding:10px 20px; background-color:#0F766E; color:white; border-radius:4px; text-decoration:none; font-weight:bold;">
         Set Password
      </a>
      <p style="margin-top:20px;">After setting your password, you can log in using your email and new password.</p>
      <p style="margin-top:20px;">If you did not request this account, please ignore this email.</p>
      <p style="margin-top:20px;">Best regards,<br />Kolabme Platform Team</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"Kolabme Platform" <${process.env.NODE_MAILER_EMAIL}>`,
    to: toEmail,
    subject: "Your Kolabme account has been approved",
    html: htmlContent,
  });
};
