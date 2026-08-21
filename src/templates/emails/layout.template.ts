// Shared Handlebars shell every booking-related email renders into.
// {{{body}}} is triple-braced so the already-rendered inner-template HTML
// isn't re-escaped.
export const emailLayoutTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{title}}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    body { margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .wrapper { width: 100%; background-color: #f1f5f9; padding-bottom: 40px; }
    .main { background-color: #ffffff; margin: 40px auto; width: 100%; max-width: 600px; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05); }
    .header { background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%); padding: 40px 32px; text-align: center; }
    .logo { color: #ffffff; font-size: 28px; font-weight: 800; letter-spacing: -0.025em; }
    .content { padding: 40px; color: #1e293b; }
    .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
    .cta-button { background-color: #0d9488; color: #ffffff !important; padding: 14px 40px; border-radius: 10px; font-size: 15px; font-weight: 700; text-decoration: none; display: inline-block; }
    .footer { margin: 0 auto; max-width: 600px; padding: 24px; text-align: center; color: #64748b; font-size: 12px; }
    .status-icon { width: 56px; height: 56px; line-height: 56px; border-radius: 50%; background-color: #ecfdf5; color: #0d9488; font-size: 26px; font-weight: 700; text-align: center; margin: 0 auto 20px; }
    .info-card { background-color: #f8fafc; border: 1px solid #eef2f6; border-radius: 12px; padding: 6px 20px; margin: 24px 0; }
    .info-row { display: flex; align-items: center; gap: 12px; padding: 14px 0; border-bottom: 1px solid #eef2f6; font-size: 14px; }
    .info-row:last-child { border-bottom: none; }
    .info-row .info-icon { width: 20px; text-align: center; font-size: 15px; }
    .info-row .info-label { color: #64748b; flex: 1; }
    .info-row .info-value { color: #0f172a; font-weight: 600; text-align: right; }
    .call-box { background: linear-gradient(135deg, #f0fdfa 0%, #ecfdf5 100%); border: 1px solid #ccfbf1; border-radius: 14px; padding: 28px 24px; margin: 28px 0 0; text-align: center; }
    .call-box-title { font-size: 15px; font-weight: 700; color: #0f172a; margin: 0 0 4px; }
    .call-box-subtitle { font-size: 13px; color: #64748b; margin: 0 0 18px; }
    .cta-button-full { background-color: #0d9488; color: #ffffff !important; padding: 14px 0; border-radius: 10px; font-size: 15px; font-weight: 700; text-decoration: none; display: block; width: 100%; box-sizing: border-box; }
    .footer-note { font-size: 13px; color: #64748b; text-align: center; margin: 28px 0 0; padding-top: 20px; border-top: 1px solid #f1f5f9; }
    .footer-note a { color: #0d9488; font-weight: 600; text-decoration: none; }
    @media (max-width: 600px) { .content { padding: 28px 24px; } .main { margin-top: 0; border-radius: 0; } }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="main">
      <div class="header"><div class="logo">Kolabme</div></div>
      <div class="content">{{{body}}}</div>
    </div>
    <div class="footer">&copy; {{year}} Kolabme. All rights reserved.</div>
  </div>
</body>
</html>
`;
