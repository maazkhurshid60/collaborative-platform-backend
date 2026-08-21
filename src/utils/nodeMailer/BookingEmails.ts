import { transporter } from "./NodeMailer";
import { getFrontendUrl } from "./getFrontendUrl";
import { renderEmail } from "../emailTemplateRenderer";
import { bookingRequestProviderTemplate } from "../../templates/emails/bookingRequestProvider.template";
import { bookingAcceptedGuestTemplate } from "../../templates/emails/bookingAcceptedGuest.template";
import { bookingDeclinedGuestTemplate } from "../../templates/emails/bookingDeclinedGuest.template";

export interface BookingRequestEmailData {
  providerName: string;
  providerEmail: string;
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  notes?: string;
  startTimeFormatted: string;
  timezoneLabel: string;
  sessionType: string;
}

export interface BookingDecisionEmailData {
  providerName: string;
  guestName: string;
  guestEmail: string;
  startTimeFormatted: string;
  timezoneLabel: string;
  sessionType: string;
  cancelUrl?: string;
}

export async function sendBookingRequestEmailToProvider(data: BookingRequestEmailData) {
  const html = renderEmail(
    "booking-request-provider",
    bookingRequestProviderTemplate,
    { ...data, dashboardUrl: `${getFrontendUrl()}/appointments` },
    "New Booking Request",
  );

  await transporter.sendMail({
    from: `"Kolabme Platform" <${process.env.NODE_MAILER_EMAIL}>`,
    to: data.providerEmail,
    subject: `New booking request from ${data.guestName}`,
    html,
  });
}

export async function sendBookingAcceptedEmailToGuest(data: BookingDecisionEmailData) {
  const html = renderEmail(
    "booking-accepted-guest",
    bookingAcceptedGuestTemplate,
    data,
    "Appointment Confirmed",
  );

  await transporter.sendMail({
    from: `"Kolabme Platform" <${process.env.NODE_MAILER_EMAIL}>`,
    to: data.guestEmail,
    subject: `Appointment confirmed with ${data.providerName}`,
    html,
  });
}

export async function sendBookingDeclinedEmailToGuest(data: BookingDecisionEmailData) {
  const html = renderEmail(
    "booking-declined-guest",
    bookingDeclinedGuestTemplate,
    data,
    "Booking Request Declined",
  );

  await transporter.sendMail({
    from: `"Kolabme Platform" <${process.env.NODE_MAILER_EMAIL}>`,
    to: data.guestEmail,
    subject: `Update on your booking request with ${data.providerName}`,
    html,
  });
}
