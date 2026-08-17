import crypto from "crypto";

import prisma from "../db/db.config";
import { ApiError } from "../utils/apiError";
import { StatusCodes } from "http-status-codes";
import { Approve } from "../generated/prisma/enums";
import { AppointmentStatus, AppointmentSessionType } from "../generated/prisma/enums";
import { io } from "../socket/socket";
import { emailQueue } from "./EmailQueue";
import logger from "../utils/logger";
import { AvailabilityService } from "./AvailabilityService";
import { getLandingSiteUrl } from "../utils/nodeMailer/getLandingSiteUrl";

const availabilityService = new AvailabilityService();

// Queueing an email is best-effort — a slow/broken mail provider or a
// momentarily unavailable Redis shouldn't fail the request that triggered it,
// since the underlying DB change (booking/accept/decline) has already committed.
async function queueEmail(jobName: string, data: Record<string, unknown>) {
  if (!emailQueue) {
    logger.warn(`[AppointmentService] emailQueue not initialized, skipping ${jobName}`);
    return;
  }
  try {
    await emailQueue.add(jobName, data);
  } catch (error) {
    logger.error(`[AppointmentService] Failed to queue ${jobName}:`, error);
  }
}

const SESSION_TYPE_LABELS: Record<AppointmentSessionType, string> = {
  ONLINE: "Online session",
  IN_PERSON: "In-person session",
  HOME_VISIT: "Home visit",
};

function formatInTimezone(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export class AppointmentService {
  // Public — no auth. Books a slot on a provider's public profile.
  async bookPublicAppointment(
    slug: string,
    data: {
      startTime: string;
      sessionType: AppointmentSessionType;
      guestName: string;
      guestEmail: string;
      guestPhone?: string;
      notes?: string;
    },
  ) {
    const profile = await prisma.providerProfile.findUnique({
      where: { slug },
      include: { provider: { include: { user: true } } },
    });

    if (!profile || !profile.isPublished) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Provider not found");
    }

    const { provider } = profile;
    if (provider.user.isApprove !== Approve.APPROVED) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Provider not found");
    }

    if (!profile.timezone) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "This provider hasn't set up booking yet.");
    }

    const sessionTypeAllowed =
      (data.sessionType === "ONLINE" && profile.offersOnlineSessions) ||
      (data.sessionType === "IN_PERSON" && profile.offersInPersonSessions) ||
      (data.sessionType === "HOME_VISIT" && profile.offersHomeVisits);

    if (!sessionTypeAllowed) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "This provider doesn't offer that session type.");
    }

    const startTime = new Date(data.startTime);
    if (Number.isNaN(startTime.getTime())) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid start time");
    }
    const endTime = new Date(startTime.getTime() + profile.appointmentDurationMinutes * 60000);

    // Re-validate inside a transaction so two guests racing for the same slot
    // can't both succeed — the DB unique constraint on (providerId, startTime)
    // is the last-resort guard if the pre-check below still races.
    const appointment = await prisma.$transaction(async (tx) => {
      const stillAvailable = await availabilityService.isSlotStillAvailable(provider.id, startTime, endTime);
      if (!stillAvailable) {
        throw new ApiError(StatusCodes.CONFLICT, "This slot is no longer available. Please pick another time.");
      }

      return tx.appointment.create({
        data: {
          providerId: provider.id,
          startTime,
          endTime,
          status: AppointmentStatus.PENDING,
          sessionType: data.sessionType,
          guestName: data.guestName,
          guestEmail: data.guestEmail,
          guestPhone: data.guestPhone,
          notes: data.notes,
          cancelToken: crypto.randomUUID(),
        },
      });
    });

    const notification = await prisma.notification.create({
      data: {
        recipientId: provider.userId,
        title: "New Booking Request",
        message: `${data.guestName} requested a session with you.`,
        type: "APPOINTMENT_BOOKED",
      },
    });
    io.to(`notification_room_${provider.userId}`).emit("new_notification", notification);

    await queueEmail("send-booking-request-email", {
      providerName: provider.user.fullName,
      providerEmail: provider.user.email,
      guestName: data.guestName,
      guestEmail: data.guestEmail,
      guestPhone: data.guestPhone,
      notes: data.notes,
      startTimeFormatted: formatInTimezone(startTime, profile.timezone),
      timezoneLabel: profile.timezone,
      sessionType: SESSION_TYPE_LABELS[data.sessionType],
    });

    return appointment;
  }

  private async getProviderOrThrow(loginUserId: string) {
    const provider = await prisma.provider.findUnique({ where: { userId: loginUserId } });
    if (!provider) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Provider not found");
    }
    return provider;
  }

  // Provider-only — own appointments. `status` here reflects CANCELLED as
  // stored, but CONFIRMED-past-endTime is computed as "COMPLETED" for display
  // rather than written anywhere (no cron needed).
  async getMyAppointments(loginUserId: string, filters: { status?: string; from?: string; to?: string }) {
    const provider = await this.getProviderOrThrow(loginUserId);
    const now = new Date();

    const appointments = await prisma.appointment.findMany({
      where: {
        providerId: provider.id,
        ...(filters.from ? { startTime: { gte: new Date(filters.from) } } : {}),
        ...(filters.to ? { startTime: { lte: new Date(filters.to) } } : {}),
      },
      orderBy: { startTime: "desc" },
    });

    const withComputedStatus = appointments.map((a) => ({
      ...a,
      displayStatus:
        a.status === AppointmentStatus.CONFIRMED && a.endTime < now ? "COMPLETED" : a.status,
    }));

    if (!filters.status) return withComputedStatus;
    return withComputedStatus.filter((a) => a.displayStatus === filters.status);
  }

  async cancelMyAppointment(loginUserId: string, appointmentId: string) {
    const provider = await this.getProviderOrThrow(loginUserId);

    const existing = await prisma.appointment.findFirst({
      where: { id: appointmentId, providerId: provider.id },
    });
    if (!existing) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Appointment not found");
    }
    if (existing.status === AppointmentStatus.CANCELLED) {
      return existing;
    }

    // Cancelling frees the slot immediately — computeAvailableSlots only ever
    // considers PENDING/CONFIRMED appointments as booked.
    return prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: AppointmentStatus.CANCELLED },
    });
  }

  async acceptAppointment(loginUserId: string, appointmentId: string) {
    const { provider, existing } = await this.getPendingAppointmentOrThrow(loginUserId, appointmentId);

    const updated = await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: AppointmentStatus.CONFIRMED },
    });

    await queueEmail("send-booking-accepted-email", {
      ...this.buildDecisionEmailData(provider, existing),
      cancelUrl: `${getLandingSiteUrl()}/appointments/cancel/${existing.cancelToken}`,
    });

    return updated;
  }

  async declineAppointment(loginUserId: string, appointmentId: string) {
    const { provider, existing } = await this.getPendingAppointmentOrThrow(loginUserId, appointmentId);

    // Declining frees the slot immediately, same as cancelling.
    const updated = await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: AppointmentStatus.DECLINED },
    });

    await queueEmail("send-booking-declined-email", this.buildDecisionEmailData(provider, existing));

    return updated;
  }

  private async getPendingAppointmentOrThrow(loginUserId: string, appointmentId: string) {
    const provider = await prisma.provider.findUnique({
      where: { userId: loginUserId },
      include: { user: true, profile: true },
    });
    if (!provider) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Provider not found");
    }

    const existing = await prisma.appointment.findFirst({
      where: { id: appointmentId, providerId: provider.id },
    });
    if (!existing) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Appointment not found");
    }
    if (existing.status !== AppointmentStatus.PENDING) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "Only pending requests can be accepted or declined.");
    }

    return { provider, existing };
  }

  private buildDecisionEmailData(
    provider: { user: { fullName: string }; profile: { timezone: string | null } | null },
    appointment: { guestName: string; guestEmail: string; startTime: Date; sessionType: AppointmentSessionType },
  ) {
    const timezone = provider.profile?.timezone || "UTC";
    return {
      providerName: provider.user.fullName,
      guestName: appointment.guestName,
      guestEmail: appointment.guestEmail,
      startTimeFormatted: formatInTimezone(appointment.startTime, timezone),
      timezoneLabel: timezone,
      sessionType: SESSION_TYPE_LABELS[appointment.sessionType],
    };
  }

  // Public — no auth. Lets the landing page's cancel page show the guest what
  // they're about to cancel before they confirm.
  async getPublicAppointmentByToken(cancelToken: string) {
    const appointment = await prisma.appointment.findUnique({
      where: { cancelToken },
      include: { provider: { include: { user: true, profile: true } } },
    });

    if (!appointment) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Appointment not found");
    }

    const timezone = appointment.provider.profile?.timezone || "UTC";
    const now = new Date();
    const displayStatus =
      appointment.status === AppointmentStatus.CONFIRMED && appointment.endTime < now
        ? "COMPLETED"
        : appointment.status;

    return {
      guestName: appointment.guestName,
      providerName: appointment.provider.user.fullName,
      startTimeFormatted: formatInTimezone(appointment.startTime, timezone),
      timezoneLabel: timezone,
      sessionType: SESSION_TYPE_LABELS[appointment.sessionType],
      displayStatus,
      canCancel: displayStatus === "PENDING" || displayStatus === "CONFIRMED",
    };
  }

  // Public — no auth. The guest's self-service cancel, reached via the link in
  // their confirmation email. Identified solely by the unguessable cancelToken.
  async cancelByGuestToken(cancelToken: string) {
    const appointment = await prisma.appointment.findUnique({
      where: { cancelToken },
      include: { provider: { include: { user: true } } },
    });

    if (!appointment) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Appointment not found");
    }

    if (appointment.status === AppointmentStatus.CANCELLED || appointment.status === AppointmentStatus.DECLINED) {
      return appointment;
    }

    if (appointment.status === AppointmentStatus.CONFIRMED && appointment.endTime < new Date()) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "This appointment has already taken place and can't be cancelled.");
    }

    const updated = await prisma.appointment.update({
      where: { cancelToken },
      data: { status: AppointmentStatus.CANCELLED },
    });

    const { provider } = appointment;
    const notification = await prisma.notification.create({
      data: {
        recipientId: provider.userId,
        title: "Appointment Cancelled",
        message: `${appointment.guestName} cancelled their appointment.`,
        type: "APPOINTMENT_CANCELLED",
      },
    });
    io.to(`notification_room_${provider.userId}`).emit("new_notification", notification);

    return updated;
  }
}
