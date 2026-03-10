import { transporter } from "./NodeMailer";
import { getFrontendUrl } from "./getFrontendUrl";

export const sendApprovalEmail = async (toEmail: string, name: string, clientId: string | null, licenseNo?: string) => {
  const signupUrl = `${getFrontendUrl()}/signup-with-client-id`;

  // Determine what identifier to show based on whether this is a client or provider
  const identifierLine = clientId
    ? `<p><strong>Your Client ID:</strong> ${clientId}</p>`
    : licenseNo
      ? `<p><strong>Your License Number:</strong> ${licenseNo}</p>`
      : "";

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Account Approved</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        
        body {
          margin: 0;
          padding: 0;
          background-color: #f1f5f9;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        
        .wrapper {
          width: 100%;
          table-layout: fixed;
          background-color: #f1f5f9;
          padding-bottom: 40px;
        }
        
        .main {
          background-color: #ffffff;
          margin: 40px auto;
          width: 100%;
          max-width: 600px;
          border-spacing: 0;
          color: #1e293b;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
        }
        
        .header {
          background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%);
          padding: 48px 32px;
          text-align: center;
        }
        
        .logo {
          color: #ffffff;
          font-size: 32px;
          font-weight: 800;
          letter-spacing: -0.025em;
          margin-bottom: 8px;
        }
        
        .header-title {
          color: #ccfbf1;
          font-size: 14px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin: 0;
        }
        
        .content {
          padding: 48px 40px;
        }
        
        .greeting {
          font-size: 24px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 16px 0;
        }
        
        .intro-text {
          font-size: 16px;
          color: #475569;
          line-height: 1.6;
          margin: 0 0 32px 0;
        }
        
        .cta-container {
          text-align: center;
          margin: 40px 0;
        }
        
        .cta-button {
          background-color: #0d9488;
          color: #ffffff !important;
          padding: 16px 48px;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 700;
          text-decoration: none;
          display: inline-block;
          box-shadow: 0 4px 6px -1px rgba(13, 148, 136, 0.2);
        }
        
        .footer {
          margin: 0 auto;
          width: 100%;
          max-width: 600px;
          padding: 32px;
          text-align: center;
          color: #64748b;
          font-size: 13px;
          line-height: 1.5;
        }
        
        .highlight {
          color: #0d9488;
          font-weight: 600;
        }

        @media (max-width: 600px) {
          .content { padding: 32px 24px; }
          .main { margin-top: 0; border-radius: 0; }
        }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="main">
          <div class="header">
            <div class="logo">Kolabme</div>
            <p class="header-title">Account Approval</p>
          </div>
          
          <div class="content">
            <h1 class="greeting">Hello ${name},</h1>
            <p class="intro-text">
              Great news! Your account has been approved by the Kolabme team.
            </p>
            
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #14b8a6; border-radius: 12px; padding: 24px; margin-bottom: 32px;">
              <p style="margin:0; font-size: 16px; font-weight: 600; color: #1e293b;">Account Identifier:</p>
              <p style="margin:8px 0 0 0; font-family: monospace; font-size: 15px; color: #0d9488;">
                ${clientId ? `Client ID: ${clientId}` : `License No: ${licenseNo}`}
              </p>
            </div>

            <p class="intro-text">
              Please click the button below to set your password and complete your registration:
            </p>

            <div class="cta-container">
              <a href="${signupUrl}" class="cta-button">Set Password</a>
            </div>
            
            <p class="intro-text" style="font-size: 15px; margin-bottom: 0;">
              Best regards,<br>
              <strong>The Kolabme Team</strong>
            </p>

            <div style="border-top: 1px solid #f1f5f9; padding-top: 24px; margin-top: 40px;">
              <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0; line-height: 1.5;">
                If you did not request this account, please ignore this email. This is an automated message from <strong>Kolabme</strong>.
              </p>
            </div>
          </div>
        </div>
        
        <div class="footer">
          <p style="margin: 0;">
            &copy; ${new Date().getFullYear()} Kolabme Collaborative Platform. All rights reserved.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: `"Kolabme Platform" <${process.env.NODE_MAILER_EMAIL}>`,
    to: toEmail,
    subject: "Your Kolabme account has been approved",
    html: htmlContent,
  });
};
