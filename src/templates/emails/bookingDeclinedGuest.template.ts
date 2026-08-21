// Sent to the guest if the provider declines their request.
export const bookingDeclinedGuestTemplate = `
  <h1 style="font-size:22px; font-weight:700; margin:0 0 12px;">Update on your booking request</h1>
  <p style="font-size:15px; color:#475569; line-height:1.6; margin:0 0 24px;">
    Unfortunately, <strong>{{providerName}}</strong> isn't able to confirm your requested session. The slot has been released.
  </p>

  <div class="detail-row"><span>Requested date &amp; time</span><strong>{{startTimeFormatted}} ({{timezoneLabel}})</strong></div>
  <div class="detail-row"><span>Session type</span><strong>{{sessionType}}</strong></div>

  <p style="font-size:14px; color:#475569; line-height:1.6; margin:24px 0 0;">
    You're welcome to submit a new request for a different time on {{providerName}}'s profile.
  </p>
`;
