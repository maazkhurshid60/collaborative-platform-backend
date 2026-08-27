export const bookingRescheduledGuestTemplate = `
  <div class="status-icon" style="background:#FFFBEB; color:#D97706; border: 1px solid #FDE68A;">&#128197;</div>

  <h1 style="font-size:22px; font-weight:700; margin:0 0 8px; text-align:center;">Session Rescheduled</h1>
  <p style="font-size:15px; color:#475569; line-height:1.6; margin:0 auto; text-align:center; max-width:440px;">
    <strong>{{providerName}}</strong> has updated the date and time for your upcoming appointment.
  </p>

  <div class="info-card">
    <div class="info-row">
      <span class="info-icon">&#128197;</span>
      <span class="info-label">New Date &amp; Time &nbsp;</span>
      <span class="info-value" style="color:#0D9488; font-weight:700;">{{startTimeFormatted}} ({{timezoneLabel}})</span>
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
    {{#if reason}}
    <div class="info-row" style="border-top:1px dashed #E2E8F0; padding-top:8px; margin-top:8px;">
      <span class="info-icon">&#128221;</span>
      <span class="info-label">Reason &nbsp;</span>
      <span class="info-value" style="color:#334155; font-style:italic;">"{{reason}}"</span>
    </div>
    {{/if}}
  </div>

  {{#if callJoinUrl}}
  <div class="call-box">
    <p class="call-box-title">Your updated video call link</p>
    <p class="call-box-subtitle">The link opens 10 minutes before your new session time.</p>
    <a href="{{callJoinUrl}}" class="cta-button-full">Join Video Call</a>
  </div>
  {{/if}}

  {{#if cancelUrl}}
  <p class="footer-note">
    Cannot make this new time? <a href="{{cancelUrl}}">Cancel your appointment</a>
  </p>
  {{/if}}
`;
