import { transporter } from "./NodeMailer";

export const sendShareChatEmail = async (
  toEmail: string,
  senderName: string,
  chatLink: string,
  chatType: 'individual' | 'group',
  chatName?: string
) => {
  const isGroup = chatType === 'group';
  const subject = isGroup
    ? `${senderName} shared the group chat "${chatName}" with you`
    : `${senderName} shared a chat with you`;

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
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
          margin: 0 auto;
          width: 100%;
          max-width: 600px;
          border-spacing: 0;
          color: #1e293b;
          border-radius: 16px;
          overflow: hidden;
          margin-top: 40px;
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
          text-decoration: none;
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
        
        .chat-card {
          background-color: #f8fafc;
          border: 1px solid #e2e8f0;
          border-left: 4px solid #14b8a6;
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 32px;
        }
        
        .chat-type {
          display: inline-block;
          background-color: #ccfbf1;
          color: #0f766e;
          font-size: 11px;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 9999px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 12px;
        }
        
        .chat-name {
          font-size: 18px;
          font-weight: 700;
          color: #1e293b;
          margin: 0;
          line-height: 1.4;
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
          transition: all 0.2s ease;
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
        
        .footer strong {
          color: #475569;
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
            <p class="header-title">Secure Chat Invitation</p>
          </div>
          
          <div class="content">
            <h1 class="greeting">New Chat Shared</h1>
            <p class="intro-text">
              <span class="highlight">${senderName}</span> has invited you to join a conversation on <strong>Kolabme</strong>. Use the link below to securely access the chat history and join the discussion.
            </p>
            
            <div class="chat-card">
              <span class="chat-type">${isGroup ? 'Group Conversation' : 'Direct Conversation'}</span>
              <p class="chat-name">${isGroup ? chatName : `Chat with ${senderName}`}</p>
            </div>
            
            <p class="intro-text" style="font-size: 15px; margin-bottom: 40px;">
              You can view all past messages and participate in real-time. If you don't have an account, you can continue as a guest or sign up to save your progress.
            </p>
            
            <div class="cta-container">
              <a href="${chatLink}" class="cta-button">Join Conversation</a>
            </div>
            
            <p style="font-size: 14px; color: #94a3b8; text-align: center; margin-bottom: 30px;">
              Button not working? <a href="${chatLink}" style="color: #0d9488; text-decoration: none;">Click here to open link</a>
            </p>

            <div style="border-top: 1px solid #f1f5f9; padding-top: 24px; margin-top: 24px;">
              <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0; line-height: 1.5;">
                This is an automated invitation from <strong>Kolabme Collaborative Platform</strong>. If you weren't expecting this, you can safely ignore this email.
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

  return await transporter.sendMail({
    from: `"Kolabme Platform" <${process.env.NODE_MAILER_EMAIL}>`,
    to: toEmail,
    subject: subject,
    html: htmlContent,
  });
};
