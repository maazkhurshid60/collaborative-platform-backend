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
