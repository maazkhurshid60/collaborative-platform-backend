import { transporter } from "./NodeMailer";

export const sendDocumentEmail = async (
  toEmail: string,
  clientName: string,
  providerName: string,
) => {
  const htmlContent = `
    <div style="font-family: sans-serif; padding: 20px;">
      <h2>Hello ${clientName},</h2>
      <p><strong>${providerName}</strong> has shared some documents with you.</p>
      <p>Please login to your dashboard to review and sign them.</p>
      <a href="${process.env.NODE_ENV === "DEVELOPMENT" ? process.env.FRONTEND_LOCAL_URL : process.env.FRONTEND_AWS_URL}/signup-with-license/"
         style="display:inline-block; padding:10px 20px; background-color:#0F766E; color:white; border-radius:4px; text-decoration:none;">
         Login to View
      </a>
      <p style="margin-top:20px;">Thanks,<br />Kolabme Platform</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"Kolabme Platform" <${process.env.NODE_MAILER_EMAIL}>`,

    to: toEmail,
    subject: "New Documents Shared With You",
    html: htmlContent,
  });
};
