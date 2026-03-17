import { transporter } from "./NodeMailer";
import { getFrontendUrl } from "./getFrontendUrl";

export const sendSubscriptionSuccessEmail = async (
  toEmail: string,
  name: string,
  planName: string,
  amount: string,
  billingCycle: string,
  nextBillingDate?: string
) => {
  const frontendUrl = getFrontendUrl();
  
  // Format plan display name
  const formattedPlan = `${planName.charAt(0).toUpperCase() + planName.slice(1).toLowerCase()} Plan (${billingCycle.charAt(0).toUpperCase() + billingCycle.slice(1).toLowerCase()})`;

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Subscription Confirmed</title>
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
            <p class="header-title">Subscription Confirmed</p>
          </div>
          
          <div class="content">
            <h1 class="greeting">Subscription Confirmed</h1>
            <p class="intro-text">
              Hello <strong>${name}</strong>,<br><br>
              Great news! Your subscription to the <span class="highlight">${formattedPlan}</span> has been confirmed. Your account is now active with full access to all premium features.
            </p>
            
            <div style="background-color: #f0fdfa; border-left: 4px solid #14b8a6; padding: 20px; border-radius: 0 8px 8px 0; margin-bottom: 40px;">
              <table style="width: 100%; border-spacing: 0;">
                <tr>
                  <td style="font-size: 14px; color: #64748b; padding-bottom: 8px;">Plan</td>
                  <td style="font-size: 14px; color: #0f172a; font-weight: 600; text-align: right; padding-bottom: 8px;">${formattedPlan}</td>
                </tr>
                <tr>
                  <td style="font-size: 14px; color: #64748b; padding-bottom: 8px;">Amount Paid</td>
                  <td style="font-size: 14px; color: #0f172a; font-weight: 600; text-align: right; padding-bottom: 8px;">${amount}</td>
                </tr>
                ${nextBillingDate ? `
                <tr>
                  <td style="font-size: 14px; color: #64748b;">Next Renewal</td>
                  <td style="font-size: 14px; color: #0f172a; font-weight: 600; text-align: right;">${nextBillingDate}</td>
                </tr>
                ` : ''}
              </table>
            </div>

            <div class="cta-container">
              <a href="${frontendUrl}/dashboard" class="cta-button">Go to Dashboard</a>
            </div>
            
            <p class="intro-text" style="font-size: 15px; margin-bottom: 0;">
              Best regards,<br>
              <strong>The Kolabme Team</strong>
            </p>

            <div style="border-top: 1px solid #f1f5f9; padding-top: 24px; margin-top: 40px;">
              <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0; line-height: 1.5;">
                &copy; ${new Date().getFullYear()} Kolabme Collaborative Platform. All rights reserved.
              </p>
            </div>
          </div>
        </div>
        
        <div class="footer">
          <p style="margin: 0;">
            This is an automated subscription confirmation message.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: `"Kolabme Platform" <${process.env.NODE_MAILER_EMAIL}>`,
    to: toEmail,
    subject: `Subscription Confirmed: ${formattedPlan} - Kolabme`,
    html: htmlContent,
  });
};
