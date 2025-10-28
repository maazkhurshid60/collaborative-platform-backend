import { transporter } from "./NodeMailer";

export const sendInvitationEmail = async (
  toEmail: string,
  providerName: string,
  invitationChatLink: string
) => {

  const htmlContent = `
    <div style="font-family: sans-serif; padding: 20px;">
      <h2>Hello ${toEmail.split("@")[0]},</h2>
      <p><strong>${providerName}</strong> has invited you to join new group.</p>
      <p>Click the button below to Join the Chat:</p>
      <a href="${invitationChatLink}/"

         style="display:inline-block; padding:10px 20px; background-color:#0F766E; color:white; border-radius:4px; text-decoration:none; font-weight:bold;">
         Join Now
      </a>
            
        <p style="margin-top:20px;">If you didn’t expect this invitation, you can safely ignore this email.</p>
      <p style="margin-top:20px;">Best regards,<br />The Collaborative Platform Team</p>
    </div>
  `;

  await transporter.sendMail({
    // from: `"Collaborative Platform" <${process.env.NODE_MAILER_USER}>`,
    from: `"Collaborative Platform" <${process.env.NODE_MAILER_EMAIL}>`,
    to: toEmail,
    subject: `${providerName} invited you to join the platform`,
    html: htmlContent,
  });
};




// <a href="${process.env.NODE_ENV === "DEVELOPMENT" ? process.env.FRONTEND_LOCAL_URL : process.env.FRONTEND_AWS_URL}/"
//  <p><strong>${providerName}</strong> has invited you to join our collaborative platform.</p>
//       <p>Click the button below to Join the Chat:</p>
// <a href="${invitationChatLink}/"

//    style="display:inline-block; padding:10px 20px; background-color:#0F766E; color:white; border-radius:4px; text-decoration:none; font-weight:bold;">
//    Join Now
// </a>