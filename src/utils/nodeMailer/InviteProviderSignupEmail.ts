import { transporter } from "./NodeMailer";
import { getFrontendUrl } from "./getFrontendUrl";

export const sendProviderSignupInviteEmail = async (
  toEmail: string,
  invitedByName: string,
  token: string,
) => {
  const signupUrl = `${getFrontendUrl()}/provider-signup?token=${encodeURIComponent(token)}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Kolabme Invitation</title>
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
            <p class="header-title">Provider Invitation</p>
          </div>
          
          <div class="content">
            <p class="intro-text" style="margin-bottom: 24px;">
              Hello,<br><br>
              <span class="highlight">${invitedByName}</span> has invited you to join them on <strong>Kolabme</strong>.
            </p>

            <p class="intro-text" style="margin-bottom: 12px;">
              Kolabme is designed to help healthcare providers collaborate more effectively through:
            </p>

            <ul style="text-align: left; font-size: 16px; color: #475569; line-height: 1.6; margin-bottom: 32px; padding-left: 20px;">
              <li style="margin-bottom: 8px;">Secure communication with other providers.</li>
              <li style="margin-bottom: 8px;">Group conversations with multiple providers.</li>
              <li style="margin-bottom: 8px;">Document sharing with providers and clients for review and signature.</li>
            </ul>
            
            <p class="intro-text" style="text-align: center; margin-bottom: 20px;">
              To get started, create your account:
            </p>

            <div class="cta-container" style="margin: 20px 0;">
              <a href="${signupUrl}" class="cta-button">Create Provider Account</a>
            </div>
            
            <p class="intro-text" style="text-align: center; margin-bottom: 40px;">
              You'll be guided through a quick setup to join your provider network.
            </p>
            
            <p class="intro-text" style="font-size: 15px; margin-bottom: 0;">
              Best regards,<br>
              <strong>The Kolabme Team</strong>
            </p>

            <div style="border-top: 1px solid #f1f5f9; padding-top: 24px; margin-top: 40px;">
              <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0; line-height: 1.5;">
                <strong>Security Note:</strong> If you weren't expecting this invitation, you can safely ignore this email. This is an automated message from <strong>Kolabme</strong>.
              </p>
            </div>
          </div>
        </div>
        
        <div class="footer">
          <p style="margin: 0;">
            &copy; ${new Date().getFullYear()} Kolabme. All rights reserved.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: `"Kolabme Platform" <${process.env.NODE_MAILER_EMAIL}>`,
    to: toEmail,
    subject: "You’ve been invited to join Kolabme",
    html: htmlContent,
  });
};
