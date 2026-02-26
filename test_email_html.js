require('dotenv').config({ path: '.env' });

const token = "some_token";
const htmlContent = `
    <div style="font-family: sans-serif; padding: 20px;">
      <h2>Hello name,</h2>
    <p>Click <a href="${process.env.NODE_ENV === "DEVELOPMENT" ? process.env.FRONTEND_LOCAL_URL : process.env.FRONTEND_AWS_URL}/reset-password/${token}">here</a> to reset your password</p>
     <p><strong>Note:</strong> This link will expire in <strong>1 hour</strong>.</p>
      <p style="margin-top:20px;">Thanks,<br />Kolabme Team</p>
    </div>
  `;

console.log(htmlContent);
