import { transporter } from "./NodeMailer";
import { getFrontendUrl } from "./getFrontendUrl";

export const sendProviderSignupInviteEmail = async (
  toEmail: string,
  invitedByName: string,
) => {
  const signupUrl = `${getFrontendUrl()}/provider-signup`;

  const htmlContent = `
    <div style="font-family: sans-serif; padding: 20px;">
      <h2>Hello,</h2>

      <p>${invitedByName} invited you to join Kolabme so you can chat and collaborate on the platform.</p>

      <p>Please click the button below to create your Provider account:</p>

      <a href="${signupUrl}"
         style="display:inline-block; padding:10px 20px; background-color:#0F766E; color:white; border-radius:4px; text-decoration:none; font-weight:bold;">
         Create Provider Account
      </a>

      <p style="margin-top:20px;">If you were not expecting this invitation, you can safely ignore this email.</p>

      <p style="margin-top:20px;">Best regards,<br />Kolabme Platform Team</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"Kolabme Platform" <${process.env.NODE_MAILER_EMAIL}>`,
    to: toEmail,
    subject: "You’ve been invited to join Kolabme",
    html: htmlContent,
  });
};
