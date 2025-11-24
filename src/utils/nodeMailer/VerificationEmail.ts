import { transporter } from "./NodeMailer";

export const sendVerificationEmail = async (
  toEmail: string,
  name: string,
) => {



  const htmlContent = `
    <div style="font-family: sans-serif; padding: 20px;">
      <h2>Hello ${name},</h2>
  <p>Your account has been verified successfully.</p>
    <p>Please click <a href="${process.env.NODE_ENV === "DEVELOPMENT" ? process.env.FRONTEND_LOCAL_URL : process.env.FRONTEND_AWS_URL}/signup-with-license/">here</a> to set your password.</p>
    <p>Once you've set your password, you can log in using your email and the new password.</p>
  
    <p style="margin-top:20px;">Thanks,<br />Kolabme Platform</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"Kolabme Platform" <${process.env.NODE_MAILER_EMAIL}>`,
    to: toEmail,
    subject: "Account Verified",
    html: htmlContent,
  });
};
