// Sent to the guest once the provider accepts their request.
export const bookingAcceptedGuestTemplate = `
  <div class="status-icon">&#10003;</div>

  <h1 style="font-size:22px; font-weight:700; margin:0 0 8px; text-align:center;">You're booked, {{guestName}}!</h1>
  <p style="font-size:15px; color:#475569; line-height:1.6; margin:0 auto; text-align:center; max-width:420px;">
    <strong>{{providerName}}</strong> has confirmed your session request.
  </p>

  <div class="info-card">
    <div class="info-row">
      <span class="info-icon">&#128197;</span>
      <span class="info-label">Date &amp; time &nbsp;</span>
      <span class="info-value">{{startTimeFormatted}} ({{timezoneLabel}})</span>
    </div>
    <div class="info-row">
      <span class="info-icon">&#128100;</span>
      <span class="info-label">Provider &nbsp;</span>
      <span class="info-value">{{providerName}}</span>
    </div>
    <div class="info-row">
      <span class="info-icon">&#128203;</span>
      <span class="info-label">Session type &nbsp;</span>
      <span class="info-value">{{sessionType}}</span>
    </div>
  </div>

  {{#if callJoinUrl}}
  <div class="call-box">
    <p class="call-box-title">Your session will be held over video</p>
    <p class="call-box-subtitle">The link opens 10 minutes before your session starts.</p>
    <a href="{{callJoinUrl}}" class="cta-button-full">Join Video Call</a>
  </div>
  {{/if}}

  {{#if cancelUrl}}
  <p class="footer-note">
    Need to reschedule or can't make it? <a href="{{cancelUrl}}">Cancel your appointment</a>
  </p>
  {{/if}}
`;
