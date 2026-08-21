// Sent to the guest once the provider accepts their request.
export const bookingAcceptedGuestTemplate = `
  <h1 style="font-size:22px; font-weight:700; margin:0 0 12px;">You're booked, {{guestName}}!</h1>
  <p style="font-size:15px; color:#475569; line-height:1.6; margin:0 0 24px;">
    <strong>{{providerName}}</strong> has confirmed your session request.
  </p>

  <div class="detail-row"><span>Date &amp; time</span><strong>{{startTimeFormatted}} ({{timezoneLabel}})</strong></div>
  <div class="detail-row"><span>Session type</span><strong>{{sessionType}}</strong></div>
  <div class="detail-row" style="border-bottom:none;"><span>Provider</span><strong>{{providerName}}</strong></div>

  {{#if cancelUrl}}
  <p style="font-size:13px; color:#64748b; line-height:1.6; margin:24px 0 0;">
    Need to cancel? <a href="{{cancelUrl}}" style="color:#0d9488; font-weight:600;">Cancel your appointment</a>
  </p>
  {{/if}}
`;
