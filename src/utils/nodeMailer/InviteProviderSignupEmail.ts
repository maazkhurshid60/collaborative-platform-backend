import { transporter } from "./NodeMailer";
import { getFrontendUrl } from "./getFrontendUrl";

export const sendProviderSignupInviteEmail = async (
  toEmail: string,
  invitedByName: string,
  token: string,
) => {
  const signupUrl = `${getFrontendUrl()}/provider-signup?token=${encodeURIComponent(token)}`;

  const htmlContent = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px; border: 1px solid #e5e7eb; border-radius: 12px; color: #1f2937; background-color: #ffffff;">
      <div style="text-align: left; margin-bottom: 32px;">
        <h2 style="font-size: 24px; font-weight: 700; color: #111827; margin: 0;">Special Invitation</h2>
      </div>
      
      <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px;">Hello,</p>
      
      <p style="font-size: 16px; line-height: 1.6; margin-bottom: 32px;">
        <strong>${invitedByName}</strong> has invited you to join <strong>Kolabme</strong>. Our platform makes it easy for you to chat, collaborate, and manage your workflow in one professional space.
      </p>
      
      <div style="text-align: center; margin-bottom: 32px;">
        <a href="${signupUrl}" 
           style="background-color: #0F766E; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          Create Provider Account
        </a>
      </div>
      
      <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 32px;">
        <p style="font-size: 14px; color: #4b5563; margin: 0; line-height: 1.5;">
          <strong>Security Note:</strong> If you weren't expecting this invitation, you can safely ignore this email. Your data remains secure.
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
    subject: "You’ve been invited to join Kolabme",
    html: htmlContent,
  });
};
