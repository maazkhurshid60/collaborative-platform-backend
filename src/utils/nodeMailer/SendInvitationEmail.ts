import { transporter } from "./NodeMailer";

export const sendInvitationEmail = async (
  toEmail: string,
  providerName: string
) => {
  console.log("Sending Invitation Email:");
  console.log("To:", toEmail);
  console.log("Provider Name:", providerName);

  const htmlContent = `
    <div style="font-family: sans-serif; padding: 20px;">
      <h2>Hello ${toEmail.split("@")[0]},</h2>
      <p><strong>${providerName}</strong> has invited you to join our collaborative platform.</p>
      <p>Click the button below to signin:</p>
      <a href="https://www.collaborateme.com/"
         style="display:inline-block; padding:10px 20px; background-color:#0F766E; color:white; border-radius:4px; text-decoration:none; font-weight:bold;">
         Join Now
      </a>
      <p style="margin-top:20px;">If you didn’t expect this invitation, you can safely ignore this email.</p>
      <p style="margin-top:20px;">Best regards,<br />The Collaborative Platform Team</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"Collaborative Platform" <${process.env.MAIL_USER}>`,
    to: toEmail,
    subject: `${providerName} invited you to join the platform`,
    html: htmlContent,
  });
};
