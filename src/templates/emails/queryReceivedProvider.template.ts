// Sent to the provider the moment a guest submits a query on their public profile.
export const queryReceivedProviderTemplate = `
  <h1 style="font-size:22px; font-weight:700; margin:0 0 12px;">New provider query</h1>
  <p style="font-size:15px; color:#475569; line-height:1.6; margin:0 0 24px;">
    <strong>{{guestName}}</strong> sent you a query through your public profile.
  </p>

  <div class="detail-row"><span>Guest email</span><strong>{{guestEmail}}</strong></div>
  {{#if guestPhone}}
  <div class="detail-row"><span>Guest phone</span><strong>{{guestPhone}}</strong></div>
  {{/if}}

  <div style="margin-top:16px;">
    <p style="font-size:12px; font-weight:600; letter-spacing:0.05em; color:#64748b; text-transform:uppercase; margin:0 0 6px;">Message</p>
    <p style="font-size:14px; color:#334155; white-space:pre-line; margin:0; background:#f8fafc; border-radius:10px; padding:14px;">{{message}}</p>
  </div>

  <div style="text-align:center; margin-top:32px;">
    <a href="{{dashboardUrl}}" class="cta-button">View Query</a>
  </div>
`;
