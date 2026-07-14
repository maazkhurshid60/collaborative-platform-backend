import { transporter } from "./NodeMailer";
import { getFrontendUrl } from "./getFrontendUrl";

export const sendWelcomeClientEmail = async (
  toEmail: string,
  clientName: string,
  clientId: string,
  providerName?: string,
) => {
  const signupUrl = `${getFrontendUrl()}/signup-with-client-id`;

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to Kolabme</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        body {
          margin: 0;
          padding: 0;
          background-color: #f1f5f9;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          -webkit-font-smoothing: antialiased;
        }

        .wrapper {
          width: 100%;
          background-color: #f1f5f9;
          padding-bottom: 40px;
        }

        .main {
          background-color: #ffffff;
          margin: 40px auto;
          width: 100%;
          max-width: 600px;
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12);
        }

        /* ── Header ── */
        .header {
          background: linear-gradient(135deg, #0d9488 0%, #134e4a 100%);
          padding: 0;
          position: relative;
          overflow: hidden;
          text-align: center;
        }

        .header-inner {
          padding: 48px 32px 40px;
          position: relative;
        }

        /* confetti dots */
        .dot { position: absolute; border-radius: 50%; opacity: 0.85; }

        .logo {
          color: #ffffff;
          font-size: 30px;
          font-weight: 800;
          letter-spacing: -0.025em;
          margin-bottom: 20px;
        }
        .emoji-wave {
          font-size: 64px;
          line-height: 1;
          margin-bottom: 16px;
          display: block;
        }

        .header-title {
          color: #ffffff;
          font-size: 28px;
          font-weight: 800;
          margin: 0 0 8px;
          letter-spacing: -0.02em;
        }

        .header-sub {
          color: #99f6e4;
          font-size: 15px;
          font-weight: 500;
          margin: 0;
        }

        /* confetti strip */
        .strip {
          background: rgba(255,255,255,0.12);
          padding: 10px 0;
          font-size: 18px;
          letter-spacing: 6px;
          text-align: center;
        }

        /* ── Body ── */
        .content {
          padding: 48px 40px;
        }

        .greeting {
          font-size: 22px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 16px;
        }

        .body-text {
          font-size: 16px;
          color: #475569;
          line-height: 1.7;
          margin: 0 0 28px;
        }

        /* ── Client ID card ── */
        .id-card {
          background: linear-gradient(135deg, #f0fdfa 0%, #e6fffa 100%);
          border: 1px solid #99f6e4;
          border-left: 5px solid #0d9488;
          border-radius: 14px;
          padding: 24px 28px;
          margin-bottom: 32px;
        }

        .id-label {
          font-size: 11px;
          font-weight: 700;
          color: #0d9488;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin: 0 0 8px;
        }

        .id-value {
          font-family: 'Courier New', Courier, monospace;
          font-size: 20px;
          font-weight: 700;
          color: #0f172a;
          letter-spacing: 0.04em;
          margin: 0 0 8px;
        }

        .id-hint {
          font-size: 13px;
          color: #64748b;
          margin: 0;
          line-height: 1.5;
        }

        /* ── Steps ── */
        .steps-title {
          font-size: 16px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 16px;
        }

        .step {
          display: flex;
          align-items: flex-start;
          margin-bottom: 14px;
        }

        .step-num {
          background: #0d9488;
          color: #ffffff;
          font-size: 12px;
          font-weight: 700;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-right: 12px;
          margin-top: 1px;
        }

        .step-text {
          font-size: 15px;
          color: #334155;
          line-height: 1.6;
        }

        /* ── CTA ── */
        .cta-wrap {
          text-align: center;
          margin: 40px 0 32px;
        }

        .cta-button {
          background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%);
          color: #ffffff !important;
          padding: 18px 56px;
          border-radius: 14px;
          font-size: 16px;
          font-weight: 700;
          text-decoration: none;
          display: inline-block;
          letter-spacing: 0.02em;
          box-shadow: 0 8px 20px rgba(13, 148, 136, 0.35);
        }

        .sign-off {
          font-size: 15px;
          color: #475569;
          line-height: 1.6;
          margin: 0;
        }

        .divider {
          border: none;
          border-top: 1px solid #f1f5f9;
          margin: 36px 0 24px;
        }

        .fine-print {
          font-size: 12px;
          color: #94a3b8;
          text-align: center;
          margin: 0;
          line-height: 1.6;
        }

        /* ── Footer ── */
        .footer {
          margin: 0 auto;
          max-width: 600px;
          padding: 28px 32px;
          text-align: center;
          color: #94a3b8;
          font-size: 12px;
          line-height: 1.6;
        }

        @media (max-width: 600px) {
          .content { padding: 32px 24px; }
          .main { margin: 0; border-radius: 0; }
          .cta-button { padding: 16px 36px; }
        }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="main">

          <!-- Header -->
          <div class="header">
            <div class="header-inner">           
              <div class="logo">Kolabme</div>
              <span class="emoji-wave">👋</span>
              <h1 class="header-title">Welcome to Kolabme!</h1>
              <p class="header-sub">Your account has been created${providerName ? ` by ${providerName}` : ""}</p>
            </div>
          </div>

          <!-- Body -->
          <div class="content">
            <h2 class="greeting">Hello ${clientName},</h2>
            <p class="body-text">
              Welcome to <strong style="color:#0d9488;">Kolabme</strong> — the collaborative platform designed
              to keep you connected with your provider. Your account is ready and waiting for you!
            </p>

            <!-- Client ID Card -->
            <div class="id-card">
              <p class="id-label">Your Client ID</p>
              <p class="id-value">${clientId}</p>
              <p class="id-hint">
                Keep this ID safe — you'll need it to complete your account setup below.
              </p>
            </div>

            <!-- Steps -->
            <p class="steps-title">Here's how to get started:</p>

            <table role="presentation" style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="vertical-align:top;padding-bottom:14px;">
                  <table role="presentation" style="border-collapse:collapse;">
                    <tr>
                      <td style="vertical-align:top;padding-right:12px;padding-top:1px;">
                        <div style="background:#0d9488;color:#fff;font-size:12px;font-weight:700;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;">1</div>
                      </td>
                      <td style="vertical-align:top;">
                        <p style="margin:0;font-size:15px;color:#334155;line-height:1.6;">
                          Click the <strong>Complete Your Account</strong> button below.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="vertical-align:top;padding-bottom:14px;">
                  <table role="presentation" style="border-collapse:collapse;">
                    <tr>
                      <td style="vertical-align:top;padding-right:12px;padding-top:1px;">
                        <div style="background:#0d9488;color:#fff;font-size:12px;font-weight:700;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;">2</div>
                      </td>
                      <td style="vertical-align:top;">
                        <p style="margin:0;font-size:15px;color:#334155;line-height:1.6;">
                          Enter your <strong>Client ID</strong>: <span style="font-family:'Courier New',monospace;font-weight:700;color:#0d9488;">${clientId}</span>
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="vertical-align:top;padding-bottom:14px;">
                  <table role="presentation" style="border-collapse:collapse;">
                    <tr>
                      <td style="vertical-align:top;padding-right:12px;padding-top:1px;">
                        <div style="background:#0d9488;color:#fff;font-size:12px;font-weight:700;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;">3</div>
                      </td>
                      <td style="vertical-align:top;">
                        <p style="margin:0;font-size:15px;color:#334155;line-height:1.6;">
                          Fill in your remaining details to complete your profile setup.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="vertical-align:top;">
                  <table role="presentation" style="border-collapse:collapse;">
                    <tr>
                      <td style="vertical-align:top;padding-right:12px;padding-top:1px;">
                        <div style="background:#0d9488;color:#fff;font-size:12px;font-weight:700;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;">4</div>
                      </td>
                      <td style="vertical-align:top;">
                        <p style="margin:0;font-size:15px;color:#334155;line-height:1.6;">
                          Once setup is done, you can log in and access all documents shared with you.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- CTA -->
            <div class="cta-wrap">
              <a href="${signupUrl}" class="cta-button">Complete Your Account &rarr;</a>
            </div>

            <p class="sign-off">
              If you have any questions, feel free to reach out to your provider.<br><br>
              Warm regards,<br>
              <strong style="color:#0f172a;">The Kolabme Team</strong>
            </p>

            <hr class="divider">
            <p class="fine-print">
              If you did not expect this email, please ignore it.<br>
              This is an automated message from <strong>Kolabme</strong>.
            </p>
          </div>
        </div>

        <div class="footer">
          <p style="margin:0;">&copy; ${new Date().getFullYear()} Kolabme. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: `"Kolabme Platform" <${process.env.NODE_MAILER_EMAIL}>`,
    to: toEmail,
    subject: `👋 Welcome to Kolabme — Complete your account, ${clientName}!`,
    html,
  });
};
