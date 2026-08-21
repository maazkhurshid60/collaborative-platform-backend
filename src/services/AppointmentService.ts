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
import { getLandingSiteUrl, getAppSiteUrl } from "../utils/nodeMailer/getLandingSiteUrl";
import { CALL_JOIN_WINDOW_BEFORE_MINUTES, isWithinCallJoinWindow, signCallToken, verifyCallToken } from "../utils/callAuth";

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

  // Authenticated Provider-to-Provider booking inside Dashboard / Chat
  async bookProviderAppointment(
    bookingUserId: string,
    data: {
      targetProviderId: string;
      startTime: string;
      sessionType: AppointmentSessionType;
      notes?: string;
    },
  ) {
    const bookingProvider = await prisma.provider.findUnique({
      where: { userId: bookingUserId },
      include: { user: true },
    });
    if (!bookingProvider) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Booking provider not found");
    }

    let targetProvider = await prisma.provider.findUnique({
      where: { id: data.targetProviderId },
      include: { user: true, profile: true },
    });

    if (!targetProvider) {
      const profile = await prisma.providerProfile.findUnique({
        where: { slug: data.targetProviderId },
        include: { provider: { include: { user: true, profile: true } } },
      });
      if (profile) {
        targetProvider = profile.provider as any;
      }
    }

    if (!targetProvider || !targetProvider.profile || !targetProvider.profile.isPublished) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Target provider not found");
    }

    if (targetProvider.id === bookingProvider.id) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "You cannot book a session with yourself.");
    }

    const { profile } = targetProvider;
    if (!profile.timezone) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "This provider hasn't set up booking yet.");
    }

    const startTime = new Date(data.startTime);
    if (Number.isNaN(startTime.getTime())) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid start time");
    }
    const endTime = new Date(startTime.getTime() + profile.appointmentDurationMinutes * 60000);

    const appointment = await prisma.$transaction(async (tx) => {
      const stillAvailable = await availabilityService.isSlotStillAvailable(
        targetProvider.id,
        startTime,
        endTime,
      );

      if (!stillAvailable) {
        throw new ApiError(
          StatusCodes.CONFLICT,
          "This slot is no longer available. Please select another time.",
        );
      }

      const cancelToken = crypto.randomBytes(32).toString("hex");

      return tx.appointment.create({
        data: {
          providerId: targetProvider.id,
          bookingProviderId: bookingProvider.id,
          startTime,
          endTime,
          sessionType: data.sessionType,
          status: AppointmentStatus.PENDING,
          guestName: bookingProvider.user.fullName,
          guestEmail: bookingProvider.user.email,
          guestPhone: bookingProvider.user.contactNo || null,
          notes: data.notes?.trim() || null,
          cancelToken,
        },
      });
    });

    const notification = await prisma.notification.create({
      data: {
        recipientId: targetProvider.userId,
        title: "New Provider Consultation Request",
        message: `${bookingProvider.user.fullName} requested a session for ${formatInTimezone(
          startTime,
          profile.timezone || "UTC",
        )}.`,
        type: "APPOINTMENT_BOOKED",
      },
    });

    io.to(`notification_room_${targetProvider.userId}`).emit("new_notification", notification);

    return appointment;
  }

  // Instant direct calling (Voice or Video) from Chat
  async startInstantCall(
    bookingUserId: string,
    data: {
      targetProviderId: string;
      callType: "audio" | "video";
    },
  ) {
    const bookingProvider = await prisma.provider.findUnique({
      where: { userId: bookingUserId },
      include: { user: true },
    });
    if (!bookingProvider) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Caller provider not found");
    }

    let targetProvider = await prisma.provider.findUnique({
      where: { id: data.targetProviderId },
      include: { user: true },
    });

    if (!targetProvider) {
      const profile = await prisma.providerProfile.findUnique({
        where: { slug: data.targetProviderId },
        include: { provider: { include: { user: true } } },
      });
      if (profile) {
        targetProvider = profile.provider as any;
      }
    }

    if (!targetProvider) {
      targetProvider = await prisma.provider.findFirst({
        where: { userId: data.targetProviderId },
        include: { user: true },
      });
    }

    if (!targetProvider) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Target provider not found");
    }

    if (targetProvider.id === bookingProvider.id) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "You cannot call yourself.");
    }

    const now = new Date();
    const endTime = new Date(now.getTime() + 60 * 60 * 1000);
    const cancelToken = crypto.randomBytes(32).toString("hex");

    const appointment = await prisma.appointment.create({
      data: {
        providerId: targetProvider.id,
        bookingProviderId: bookingProvider.id,
        startTime: now,
        endTime: endTime,
        sessionType: AppointmentSessionType.ONLINE,
        status: AppointmentStatus.CONFIRMED,
        guestName: bookingProvider.user.fullName,
        guestEmail: bookingProvider.user.email,
        guestPhone: bookingProvider.user.contactNo || null,
        notes: `Instant ${data.callType === "audio" ? "Voice" : "Video"} Call`,
        cancelToken,
      },
    });

    const meetingRoomId = `call_${appointment.id}`;
    const meetingUrl = `${getAppSiteUrl()}/call/${appointment.id}`;

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { meetingRoomId, meetingUrl },
    });

    const callerToken = signCallToken({
      appointmentId: appointment.id,
      role: "provider",
      participantId: bookingUserId,
    });

    const calleeToken = signCallToken({
      appointmentId: appointment.id,
      role: "provider",
      participantId: targetProvider.userId,
    });

    const modeParam = data.callType === "audio" ? "&audioOnly=true" : "";
    const callerJoinUrl = `${meetingUrl}?token=${callerToken}${modeParam}`;
    const calleeJoinUrl = `${meetingUrl}?token=${calleeToken}${modeParam}`;

    const targetRoom = io.sockets.adapter.rooms.get(`notification_room_${targetProvider.userId}`);
    const isTargetOnline = !!(targetRoom && targetRoom.size > 0);

    // Emit real-time ringing event to target provider
    io.to(`notification_room_${targetProvider.userId}`).emit("incoming_call", {
      appointmentId: appointment.id,
      callType: data.callType,
      callerName: bookingProvider.user.fullName,
      callerProfileImage: bookingProvider.user.profileImage,
      calleeJoinUrl,
    });

    return { callerJoinUrl, appointmentId: appointment.id, isTargetOnline };
  }

  // Provider-only — own appointments. `status` here reflects CANCELLED as
  // stored, but CONFIRMED-past-endTime is computed as "COMPLETED" for display
  // rather than written anywhere (no cron needed).
  async getMyAppointments(loginUserId: string, filters: { status?: string; from?: string; to?: string }) {
    const provider = await this.getProviderOrThrow(loginUserId);
    const now = new Date();

    const appointments = await prisma.appointment.findMany({
      where: {
        OR: [
          { providerId: provider.id },
          { bookingProviderId: provider.id },
        ],
        ...(filters.from ? { startTime: { gte: new Date(filters.from) } } : {}),
        ...(filters.to ? { startTime: { lte: new Date(filters.to) } } : {}),
      },
      include: {
        provider: { include: { user: true, profile: true } },
        bookingProvider: { include: { user: true, profile: true } },
        client: { include: { user: true } },
      },
      orderBy: { startTime: "desc" },
    });

    const withComputedStatus = appointments.map((a) => ({
      ...a,
      isMyBooking: a.bookingProviderId === provider.id,
      displayStatus:
        a.status === AppointmentStatus.CONFIRMED && a.endTime < now ? "COMPLETED" : a.status,
    }));

    if (!filters.status) return withComputedStatus;
    return withComputedStatus.filter((a) => a.displayStatus === filters.status);
  }

  async cancelMyAppointment(loginUserId: string, appointmentId: string) {
    const provider = await this.getProviderOrThrow(loginUserId);

    const existing = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        OR: [{ providerId: provider.id }, { bookingProviderId: provider.id }],
      },
    });
    if (!existing) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Appointment not found");
    }
    if (existing.status === AppointmentStatus.CANCELLED) {
      return existing;
    }

    return prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: AppointmentStatus.CANCELLED },
    });
  }

  async acceptAppointment(loginUserId: string, appointmentId: string) {
    const { provider, existing } = await this.getPendingAppointmentOrThrow(loginUserId, appointmentId);

    const isOnline = existing.sessionType === AppointmentSessionType.ONLINE;
    const meetingRoomId = isOnline ? `call_${existing.id}` : null;
    const baseUrl = existing.bookingProviderId ? getAppSiteUrl() : getLandingSiteUrl();
    const meetingUrl = isOnline ? `${baseUrl}/call/${existing.id}` : null;

    const updated = await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: AppointmentStatus.CONFIRMED, meetingRoomId, meetingUrl },
    });

    const emailData: Record<string, unknown> = {
      ...this.buildDecisionEmailData(provider, existing),
      cancelUrl: `${getLandingSiteUrl()}/appointments/cancel/${existing.cancelToken}`,
    };

    if (isOnline && meetingUrl) {
      // Dedicated single-purpose join token — never the cancelToken. A leaked
      // cancel link should never double as a way into a live call.
      const guestCallToken = signCallToken({
        appointmentId: existing.id,
        role: "guest",
        participantId: "guest",
      });
      emailData.callJoinUrl = `${meetingUrl}?token=${guestCallToken}`;
    }

    await queueEmail("send-booking-accepted-email", emailData);

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

  // Provider-only. Mints this provider's own call join token — the dashboard's
  // "Join Video Call" button fetches this, then opens the returned URL (which
  // lives on the public landing site, since the guest side has no account).
  async getProviderCallJoinInfo(loginUserId: string, appointmentId: string) {
    const provider = await this.getProviderOrThrow(loginUserId);

    const appointment = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        OR: [{ providerId: provider.id }, { bookingProviderId: provider.id }],
      },
    });
    if (!appointment) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Appointment not found");
    }
    if (appointment.sessionType !== AppointmentSessionType.ONLINE || !appointment.meetingUrl) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "This appointment doesn't have a video call set up.");
    }
    if (appointment.status !== AppointmentStatus.CONFIRMED) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "This appointment isn't confirmed.");
    }
    if (!isWithinCallJoinWindow(appointment.startTime, appointment.endTime)) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        `The call link opens ${CALL_JOIN_WINDOW_BEFORE_MINUTES} minutes before the session starts.`,
      );
    }

    const token = signCallToken({ appointmentId: appointment.id, role: "provider", participantId: loginUserId });
    const appMeetingUrl = (appointment.meetingUrl || "").replace(getLandingSiteUrl(), getAppSiteUrl());
    return { joinUrl: `${appMeetingUrl || `${getAppSiteUrl()}/call/${appointment.id}`}?token=${token}` };
  }

  // Public — no auth. Verifies a call join token (guest or provider) and
  // returns display info for the call page, WITHOUT any TURN credentials —
  // those are only ever issued over the authorized Socket.IO channel, after
  // the stronger join_call check (see socket.ts).
  async getPublicCallInfo(token: string) {
    const payload = verifyCallToken(token);
    if (!payload) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, "This call link is invalid or has expired.");
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: payload.appointmentId },
      include: { provider: { include: { user: true } } },
    });
    if (!appointment) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Appointment not found");
    }
    if (appointment.sessionType !== AppointmentSessionType.ONLINE) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "This isn't an online session.");
    }
    if (appointment.status !== AppointmentStatus.CONFIRMED) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "This appointment isn't confirmed.");
    }

    const canJoinNow = isWithinCallJoinWindow(appointment.startTime, appointment.endTime);

    return {
      appointmentId: appointment.id,
      role: payload.role,
      providerName: appointment.provider.user.fullName,
      guestName: appointment.guestName,
      startTime: appointment.startTime.toISOString(),
      endTime: appointment.endTime.toISOString(),
      canJoinNow,
    };
  }

  // Metadata-only audit trail — never call content, SDP, or media. See socket.ts callers.
  async logCallEvent(
    appointmentId: string,
    role: "guest" | "provider",
    participantId: string,
    event: "join" | "leave" | "expired" | "auth_failed",
    connectionMeta?: Record<string, unknown>,
  ) {
    try {
      await prisma.appointmentCallLog.create({
        data: { appointmentId, role, participantId, event, connectionMeta: connectionMeta as any },
      });
    } catch (error) {
      logger.error("[AppointmentService] Failed to write call log:", error);
    }
  }
}
