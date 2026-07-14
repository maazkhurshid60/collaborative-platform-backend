import { transporter } from "./NodeMailer";
import { getFrontendUrl } from "./getFrontendUrl";

export const sendApprovalEmail = async (
  toEmail: string,
  name: string,
  clientId: string | null,
  licenseNo?: string,
) => {
  const isProvider = !clientId && !!licenseNo;
  const loginUrl = `${getFrontendUrl()}/login`;
  const signupUrl = `${getFrontendUrl()}/signup-with-client-id`;

  const providerHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Account Approved</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        body { margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        .wrapper { width: 100%; background-color: #f1f5f9; padding-bottom: 40px; }
        .main { background-color: #ffffff; margin: 40px auto; width: 100%; max-width: 600px; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.10); }
        .content { padding: 40px 40px 48px; }
        .cta-button { background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%); color: #ffffff !important; padding: 16px 52px; border-radius: 12px; font-size: 16px; font-weight: 700; text-decoration: none; display: inline-block; letter-spacing: 0.02em; }
        .footer { margin: 0 auto; max-width: 600px; padding: 28px 32px; text-align: center; color: #94a3b8; font-size: 12px; line-height: 1.6; }
        @media (max-width: 600px) { .content { padding: 32px 24px; } .main { margin: 0; border-radius: 0; } }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="main">

          <!-- Celebration header -->
          <div style="background: linear-gradient(135deg, #0d9488 0%, #134e4a 100%); padding: 0; position: relative; overflow: hidden; text-align: center;">
            <!-- Confetti dots layer -->
            <div style="padding: 44px 32px 36px; position: relative;">
              <!-- Scattered confetti shapes -->
              <div style="position: absolute; top: 14px; left: 18px; width: 10px; height: 10px; background: #fbbf24; border-radius: 50%; opacity: 0.85;"></div>
              <div style="position: absolute; top: 28px; left: 56px; width: 7px; height: 7px; background: #f472b6; border-radius: 2px; transform: rotate(30deg); opacity: 0.9;"></div>
              <div style="position: absolute; top: 10px; left: 110px; width: 8px; height: 8px; background: #60a5fa; border-radius: 50%; opacity: 0.8;"></div>
              <div style="position: absolute; top: 38px; left: 160px; width: 6px; height: 6px; background: #a78bfa; border-radius: 2px; opacity: 0.9;"></div>
              <div style="position: absolute; top: 12px; right: 100px; width: 9px; height: 9px; background: #fb923c; border-radius: 50%; opacity: 0.85;"></div>
              <div style="position: absolute; top: 30px; right: 50px; width: 7px; height: 7px; background: #34d399; border-radius: 2px; transform: rotate(45deg); opacity: 0.9;"></div>
              <div style="position: absolute; top: 10px; right: 20px; width: 8px; height: 8px; background: #fbbf24; border-radius: 50%; opacity: 0.8;"></div>
              <div style="position: absolute; bottom: 14px; left: 40px; width: 7px; height: 7px; background: #60a5fa; border-radius: 50%; opacity: 0.75;"></div>
              <div style="position: absolute; bottom: 20px; left: 130px; width: 6px; height: 6px; background: #f472b6; border-radius: 2px; opacity: 0.85;"></div>
              <div style="position: absolute; bottom: 10px; right: 80px; width: 8px; height: 8px; background: #a78bfa; border-radius: 50%; opacity: 0.8;"></div>
              <div style="position: absolute; bottom: 22px; right: 30px; width: 7px; height: 7px; background: #fb923c; border-radius: 2px; transform: rotate(20deg); opacity: 0.9;"></div>

              <!-- Logo -->
              <div style="color: #ffffff; font-size: 28px; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 20px; opacity: 0.95;">Kolabme</div>

              <!-- Trophy emoji -->
              <div style="font-size: 72px; line-height: 1; margin-bottom: 16px;">🏆</div>

              <!-- Congratulations text -->
              <h1 style="margin: 0 0 8px; color: #ffffff; font-size: 30px; font-weight: 800; letter-spacing: -0.02em;">Congratulations!</h1>
              <p style="margin: 0; color: #99f6e4; font-size: 15px; font-weight: 500;">Your provider account has been approved</p>
            </div>

            <!-- Celebration ticker strip -->
            <div style="background: rgba(255,255,255,0.12); padding: 10px 0; font-size: 18px; letter-spacing: 6px; text-align: center;">
              🎉 &nbsp; 🎊 &nbsp; ✨ &nbsp; 🎉 &nbsp; 🎊 &nbsp; ✨ &nbsp; 🎉 &nbsp; 🎊 &nbsp; ✨
            </div>
          </div>

          <!-- Body -->
          <div class="content">
            <h2 style="margin: 0 0 12px; font-size: 22px; font-weight: 700; color: #0f172a;">Hello ${name}, welcome aboard! 🎈</h2>
            <p style="margin: 0 0 24px; font-size: 16px; color: #475569; line-height: 1.7;">
              We're thrilled to let you know that your provider account on <strong style="color: #0d9488;">Kolabme</strong> has been
              <strong>reviewed and approved by the admin</strong>. You're all set to start collaborating with your clients!
            </p>

            <!-- License number card -->
            <div style="background: linear-gradient(135deg, #f0fdfa 0%, #e6fffa 100%); border: 1px solid #99f6e4; border-left: 5px solid #0d9488; border-radius: 12px; padding: 20px 24px; margin-bottom: 32px;">
              <p style="margin: 0 0 6px; font-size: 12px; font-weight: 700; color: #0d9488; text-transform: uppercase; letter-spacing: 0.08em;">Your License Number</p>
              <p style="margin: 0; font-family: 'Courier New', monospace; font-size: 18px; font-weight: 700; color: #0f172a; letter-spacing: 0.05em;">${licenseNo}</p>
            </div>

            <p style="margin: 0 0 32px; font-size: 15px; color: #475569; line-height: 1.7;">
              Click the button below to log in to your account and get started:
            </p>

            <!-- CTA -->
            <div style="text-align: center; margin-bottom: 36px;">
              <a href="${loginUrl}" class="cta-button">Login to Your Account &rarr;</a>
            </div>

            <p style="margin: 0 0 0; font-size: 15px; color: #475569; line-height: 1.6;">
              If you have any questions, feel free to reach out to our support team.<br><br>
              Warm regards,<br>
              <strong style="color: #0f172a;">The Kolabme Team</strong>
            </p>

            <!-- Disclaimer -->
            <div style="border-top: 1px solid #f1f5f9; margin-top: 40px; padding-top: 24px;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8; text-align: center; line-height: 1.6;">
                If you did not create this account, please ignore this email.<br>
                This is an automated message from <strong>Kolabme</strong>.
              </p>
            </div>
          </div>
        </div>

        <div class="footer">
          <p style="margin: 0;">&copy; ${new Date().getFullYear()} Kolabme. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const clientHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Account Approved</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body { margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        .wrapper { width: 100%; background-color: #f1f5f9; padding-bottom: 40px; }
        .main { background-color: #ffffff; margin: 40px auto; width: 100%; max-width: 600px; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%); padding: 48px 32px; text-align: center; }
        .content { padding: 48px 40px; }
        .cta-button { background-color: #0d9488; color: #ffffff !important; padding: 16px 48px; border-radius: 12px; font-size: 16px; font-weight: 700; text-decoration: none; display: inline-block; }
        .footer { margin: 0 auto; max-width: 600px; padding: 32px; text-align: center; color: #64748b; font-size: 13px; line-height: 1.5; }
        @media (max-width: 600px) { .content { padding: 32px 24px; } .main { margin: 0; border-radius: 0; } }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="main">
          <div class="header">
            <div style="color: #ffffff; font-size: 32px; font-weight: 800; letter-spacing: -0.025em; margin-bottom: 8px;">Kolabme</div>
            <p style="color: #ccfbf1; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; margin: 0;">Account Approved</p>
          </div>
          <div class="content">
            <h1 style="font-size: 24px; font-weight: 700; color: #0f172a; margin: 0 0 16px;">Hello ${name},</h1>
            <p style="font-size: 16px; color: #475569; line-height: 1.6; margin: 0 0 32px;">
              Great news! Your account has been approved by the Kolabme admin team.
            </p>
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #14b8a6; border-radius: 12px; padding: 24px; margin-bottom: 32px;">
              <p style="margin: 0; font-size: 14px; font-weight: 600; color: #1e293b;">Your Client ID</p>
              <p style="margin: 8px 0 0; font-family: monospace; font-size: 15px; color: #0d9488;">${clientId}</p>
            </div>
            <p style="font-size: 16px; color: #475569; line-height: 1.6; margin: 0 0 32px;">
              Click the button below to set your password and complete your registration:
            </p>
            <div style="text-align: center; margin: 40px 0;">
              <a href="${signupUrl}" class="cta-button">Set Password</a>
            </div>
            <p style="font-size: 15px; color: #475569; margin: 0;">
              Best regards,<br><strong>The Kolabme Team</strong>
            </p>
            <div style="border-top: 1px solid #f1f5f9; padding-top: 24px; margin-top: 40px;">
              <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0; line-height: 1.5;">
                If you did not request this account, please ignore this email. This is an automated message from <strong>Kolabme</strong>.
              </p>
            </div>
          </div>
        </div>
        <div class="footer">
          <p style="margin: 0;">&copy; ${new Date().getFullYear()} Kolabme. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: `"Kolabme Platform" <${process.env.NODE_MAILER_EMAIL}>`,
    to: toEmail,
    subject: isProvider
      ? "🎉 Congratulations! Your Kolabme provider account is approved"
      : "Your Kolabme account has been approved",
    html: isProvider ? providerHtml : clientHtml,
  });
};
