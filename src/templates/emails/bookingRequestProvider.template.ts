// Sent to the provider the moment a guest requests a slot — action required.
export const bookingRequestProviderTemplate = `
  <h1 style="font-size:22px; font-weight:700; margin:0 0 12px;">New booking request</h1>
  <p style="font-size:15px; color:#475569; line-height:1.6; margin:0 0 24px;">
    <strong>{{guestName}}</strong> has requested a session with you. Review the details below and accept or decline from your dashboard.
  </p>

  <div class="detail-row"><span>Date &amp; time</span><strong>{{startTimeFormatted}} ({{timezoneLabel}})</strong></div>
  <div class="detail-row"><span>Session type</span><strong>{{sessionType}}</strong></div>
  <div class="detail-row"><span>Guest email</span><strong>{{guestEmail}}</strong></div>
  {{#if guestPhone}}
  <div class="detail-row"><span>Guest phone</span><strong>{{guestPhone}}</strong></div>
  {{/if}}
  {{#if notes}}
  <div class="detail-row" style="border-bottom:none;"><span>Notes</span></div>
  <p style="font-size:14px; color:#334155; white-space:pre-line; margin:4px 0 0;">{{notes}}</p>
  {{/if}}

  <div style="text-align:center; margin-top:32px;">
    <a href="{{dashboardUrl}}" class="cta-button">Review Request</a>
  </div>
`;
