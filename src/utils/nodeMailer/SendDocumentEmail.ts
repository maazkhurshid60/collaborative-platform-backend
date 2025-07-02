import { transporter } from "./NodeMailer";

export const sendDocumentEmail = async (
  toEmail: string,
  clientName: string,
  providerName: string
) => {
  // ✅ Log the values
  console.log("Sending Document Email:");
  console.log("To:", toEmail);
  console.log("Client Name:", clientName);
  console.log("Provider Name:", providerName);


  const htmlContent = `
    <div style="font-family: sans-serif; padding: 20px;">
      <h2>Hello ${clientName},</h2>
      <p><strong>${providerName}</strong> has shared some documents with you.</p>
      <p>Please login to your dashboard to review and sign them.</p>
      <a href="https://www.collaborateme.com/signup-with-license/"
         style="display:inline-block; padding:10px 20px; background-color:#0F766E; color:white; border-radius:4px; text-decoration:none;">
         Login to View
      </a>
      <p style="margin-top:20px;">Thanks,<br />Collaborative Platform</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"Collaborative Platform" <${process.env.MAIL_USER}>`,
    to: toEmail,
    subject: "New Documents Shared With You",
    html: htmlContent,
  });
};
