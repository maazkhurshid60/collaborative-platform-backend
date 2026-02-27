import { transporter } from "./NodeMailer";

export const sendResetPasswordEmail = async (
  toEmail: string,
  name: string,
  token: string,
) => {
  const isDevelopment = process.env.NODE_ENV?.toUpperCase() === "DEVELOPMENT";
  const frontendUrl = isDevelopment
    ? process.env.FRONTEND_LOCAL_URL
    : process.env.FRONTEND_AWS_URL;

  const htmlContent = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px; border: 1px solid #e5e7eb; border-radius: 12px; color: #1f2937; background-color: #ffffff;">
      <div style="text-align: left; margin-bottom: 32px;">
        <h2 style="font-size: 24px; font-weight: 700; color: #111827; margin: 0;">Reset Your Password</h2>
      </div>
      
      <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px;">Hello <strong>${name}</strong>,</p>
      
      <p style="font-size: 16px; line-height: 1.6; margin-bottom: 32px;">
        We received a request to reset your password for your Kolabme account. Click the button below to choose a new one:
      </p>
      
      <div style="text-align: center; margin-bottom: 32px;">
        <a href="${frontendUrl}/reset-password/${token}" 
         style="background-color: #0F766E; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          Reset Password
        </a>
      </div>
      
      <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 32px;">
        <p style="font-size: 14px; color: #4b5563; margin: 0; line-height: 1.5;">
          <strong>Security Note:</strong> This link will expire in <strong>1 hour</strong>. If you did not request a password reset, please ignore this email or contact support if you have concerns.
        </p>
      </div>

      <hr style="border: 0; border-top: 1px solid #e5e7eb; margin-bottom: 32px;" />
      
      <p style="font-size: 15px; color: #6b7280; margin: 0;">
        Best regards,<br />
        <strong>The Kolabme Team</strong>
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: `"Kolabme Platform" <${process.env.NODE_MAILER_EMAIL}>`,
    to: toEmail,
    subject: "Reset Your Password",
    html: htmlContent,
  });
};