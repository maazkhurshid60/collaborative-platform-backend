import { transporter } from "./NodeMailer";
import { getFrontendUrl } from "./getFrontendUrl";

export const sendDocumentEmail = async (
  toEmail: string,
  clientName: string,
  providerName: string,
  clientId: string,
) => {
  const loginUrl = `${getFrontendUrl() || "https://app.kolabme.com"}/documents`;

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Documents Shared With You</title>
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

        .client-info-box {
          background-color: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 32px;
          text-align: center;
        }

        .client-info-text {
          font-size: 15px;
          color: #334155;
          margin: 0 0 8px 0;
        }

        .client-id {
          font-size: 18px;
          font-family: monospace;
          color: #0d9488;
          font-weight: bold;
          margin: 0;
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
            <p class="header-title">Document Sharing</p>
          </div>
          
          <div class="content">
            <h1 class="greeting">New Documents Shared</h1>
            <p class="intro-text">
              Hello <strong>${clientName}</strong>,<br><br>
              <span class="highlight">${providerName}</span> has shared some documents with you on the Kolabme platform.
            </p>
            
            <p class="intro-text">
              Please login to your dashboard to review and sign them.
            </p>

            <div class="client-info-box">
              <p class="client-info-text">If you don't have an account yet, please follow these steps:</p>
              <ul style="text-align: left; font-size: 14px; color: #334155; margin-bottom: 20px;">
                <li><strong>Step 1:</strong> Click the <strong>Login to View</strong> button below and enter your <strong>Client ID</strong>: <span class="client-id">${clientId}</span></li>
                <li><strong>Step 2:</strong> Enter your remaining details to complete the setup.</li>
                <li><strong>Step 3:</strong> Once successful, you will be redirected to the login screen where you can enter your real credentials.</li>
              </ul>
            </div>

            <div class="cta-container">
              <a href="${loginUrl}" class="cta-button">Login to View</a>
            </div>
            
            <p class="intro-text" style="font-size: 15px; margin-bottom: 0;">
              Best regards,<br>
              <strong>The Kolabme Team</strong>
            </p>

            <div style="border-top: 1px solid #f1f5f9; padding-top: 24px; margin-top: 40px;">
              <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0; line-height: 1.5;">
                &copy; ${new Date().getFullYear()} Kolabme. All rights reserved.
              </p>
            </div>
          </div>
        </div>
        
        <div class="footer">
          <p style="margin: 0;">
            This is an automated notification from Kolabme.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: `"Kolabme Platform" <${process.env.NODE_MAILER_EMAIL}>`,

    to: toEmail,
    subject: "New Documents Shared With You",
    html: htmlContent,
  });
};
