import crypto from "crypto";

import prisma from "../db/db.config";
import { ApiError } from "../utils/apiError";
import { StatusCodes } from "http-status-codes";
import { Approve } from "../generated/prisma/enums";
import {
  AppointmentStatus,
  AppointmentSessionType,
} from "../generated/prisma/enums";
import { io } from "../socket/socket";
import { emailQueue } from "./EmailQueue";
import logger from "../utils/logger";
import { AvailabilityService } from "./AvailabilityService";
import {
  getLandingSiteUrl,
  getAppSiteUrl,
} from "../utils/nodeMailer/getLandingSiteUrl";
import {
  CALL_JOIN_WINDOW_BEFORE_MINUTES,
  isWithinCallJoinWindow,
  signCallToken,
  verifyCallToken,
} from "../utils/callAuth";
import {
  canUsePremiumFeature,
  canBothPartiesCall,
} from "../utils/subscriptionAccess";

const availabilityService = new AvailabilityService();

// Queueing an email is best-effort — a slow/broken mail provider or a
// momentarily unavailable Redis shouldn't fail the request that triggered it,
// since the underlying DB change (booking/accept/decline) has already committed.
async function queueEmail(jobName: string, data: Record<string, unknown>) {
  if (!emailQueue) {
    logger.warn(
      `[AppointmentService] emailQueue not initialized, skipping ${jobName}`,
    );
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
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "This provider hasn't set up booking yet.",
      );
    }

    const sessionTypeAllowed =
      (data.sessionType === "ONLINE" && profile.offersOnlineSessions) ||
      (data.sessionType === "IN_PERSON" && profile.offersInPersonSessions) ||
      (data.sessionType === "HOME_VISIT" && profile.offersHomeVisits);

    if (!sessionTypeAllowed) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "This provider doesn't offer that session type.",
      );
    }

    const startTime = new Date(data.startTime);
    if (Number.isNaN(startTime.getTime())) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid start time");
    }
    if (startTime.getTime() <= Date.now()) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Appointments can only be scheduled for future dates and times.",
      );
    }
    const endTime = new Date(
      startTime.getTime() + profile.appointmentDurationMinutes * 60000,
    );

    // Re-validate inside a transaction so two guests racing for the same slot
    // can't both succeed — the DB unique constraint on (providerId, startTime)
    // is the last-resort guard if the pre-check below still races.
    const appointment = await prisma.$transaction(async (tx) => {
      const stillAvailable = await availabilityService.isSlotStillAvailable(
        provider.id,
        startTime,
        endTime,
      );
      if (!stillAvailable) {
        throw new ApiError(
          StatusCodes.CONFLICT,
          "This slot is no longer available. Please pick another time.",
        );
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
    io.to(`notification_room_${provider.userId}`).emit(
      "new_notification",
      notification,
    );

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
    const provider = await prisma.provider.findUnique({
      where: { userId: loginUserId },
    });
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

    if (
      !targetProvider ||
      !targetProvider.profile ||
      !targetProvider.profile.isPublished
    ) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Target provider not found");
    }

    if (targetProvider.id === bookingProvider.id) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "You cannot book a session with yourself.",
      );
    }

    const { profile } = targetProvider;
    if (!profile.timezone) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "This provider hasn't set up booking yet.",
      );
    }

    const startTime = new Date(data.startTime);
    if (Number.isNaN(startTime.getTime())) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid start time");
    }
    const endTime = new Date(
      startTime.getTime() + profile.appointmentDurationMinutes * 60000,
    );

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

    io.to(`notification_room_${targetProvider.userId}`).emit(
      "new_notification",
      notification,
    );

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
    let bookingProvider = await prisma.provider.findUnique({
      where: { userId: bookingUserId },
      include: { user: { include: { subscription: true } } },
    });

    if (!bookingProvider) {
      bookingProvider = await prisma.provider.findUnique({
        where: { id: bookingUserId },
        include: { user: { include: { subscription: true } } },
      });
    }

    let bookingClient = null;
    if (!bookingProvider) {
      bookingClient = await prisma.client.findFirst({
        where: { OR: [{ userId: bookingUserId }, { id: bookingUserId }] },
        include: { user: true },
      });
    }

    if (!bookingProvider && !bookingClient) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Caller account not found");
    }

    let targetProvider = await prisma.provider.findUnique({
      where: { id: data.targetProviderId },
      include: { user: { include: { subscription: true } } },
    });

    if (!targetProvider) {
      const profile = await prisma.providerProfile.findUnique({
        where: { slug: data.targetProviderId },
        include: {
          provider: { include: { user: { include: { subscription: true } } } },
        },
      });
      if (profile) {
        targetProvider = profile.provider as any;
      }
    }

    if (!targetProvider) {
      targetProvider = await prisma.provider.findFirst({
        where: { userId: data.targetProviderId },
        include: { user: { include: { subscription: true } } },
      });
    }

    if (!targetProvider) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Target provider not found");
    }

    if (bookingProvider && targetProvider.id === bookingProvider.id) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "You cannot call yourself.");
    }
    if (bookingClient && targetProvider.userId === bookingClient.userId) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "You cannot call yourself.");
    }

    // Calling requires target provider to have active calling access.
    // If caller is also a provider, both must have active/trialing calling access.
    if (bookingProvider && !canUsePremiumFeature(bookingProvider.user.subscription)) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        "Your trial's calling access has ended. Upgrade to keep making calls.",
      );
    }
    if (!canUsePremiumFeature(targetProvider.user.subscription)) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        `${targetProvider.user.fullName || "This provider"}'s trial calling access has ended. Calls require active plan or trial period.`,
      );
    }

    const callerUser = bookingProvider ? bookingProvider.user : bookingClient!.user;
    const isCallerProvider = !!bookingProvider;

    const now = new Date();
    const endTime = new Date(now.getTime() + 60 * 60 * 1000);
    const cancelToken = crypto.randomBytes(32).toString("hex");

    const appointment = await prisma.appointment.create({
      data: {
        providerId: targetProvider.id,
        bookingProviderId: bookingProvider ? bookingProvider.id : null,
        clientId: bookingClient ? bookingClient.id : null,
        startTime: now,
        endTime: endTime,
        sessionType: AppointmentSessionType.ONLINE,
        status: AppointmentStatus.CONFIRMED,
        guestName: callerUser.fullName || "Client",
        guestEmail: callerUser.email,
        guestPhone: callerUser.contactNo || null,
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

    // Log call initiation so it immediately appears in Call History
    try {
      await prisma.appointmentCallLog.create({
        data: {
          appointmentId: appointment.id,
          participantId: isCallerProvider ? bookingUserId : "guest",
          role: isCallerProvider ? "provider" : "guest",
          event: "join",
        },
      });
    } catch (err) {
      logger.error(
        "[AppointmentService] Failed to create initial call log:",
        err,
      );
    }

    const callerToken = signCallToken({
      appointmentId: appointment.id,
      role: isCallerProvider ? "provider" : "guest",
      participantId: isCallerProvider ? bookingUserId : "guest",
    });

    const calleeToken = signCallToken({
      appointmentId: appointment.id,
      role: "provider",
      participantId: targetProvider.userId,
    });

    const modeParam = data.callType === "audio" ? "&audioOnly=true" : "";
    const callerJoinUrl = `${meetingUrl}?token=${callerToken}${modeParam}`;
    const calleeJoinUrl = `${meetingUrl}?token=${calleeToken}${modeParam}`;

    const targetRoom = io.sockets.adapter.rooms.get(
      `notification_room_${targetProvider.userId}`,
    );
    const isTargetOnline = !!(targetRoom && targetRoom.size > 0);

    // Emit real-time ringing event to target provider
    io.to(`notification_room_${targetProvider.userId}`).emit("incoming_call", {
      appointmentId: appointment.id,
      callType: data.callType,
      callerName: callerUser.fullName || "Client",
      callerProfileImage: callerUser.profileImage,
      calleeJoinUrl,
    });

    return { callerJoinUrl, appointmentId: appointment.id, isTargetOnline };
  }

  // Provider-only — own appointments. `status` here reflects CANCELLED as
  // stored, but CONFIRMED-past-endTime is computed as "COMPLETED" for display
  // rather than written anywhere (no cron needed).
  async getMyAppointments(
    loginUserId: string,
    filters: { status?: string; from?: string; to?: string },
  ) {
    const provider = await this.getProviderOrThrow(loginUserId);
    const now = new Date();

    const appointments = await prisma.appointment.findMany({
      where: {
        OR: [{ providerId: provider.id }, { bookingProviderId: provider.id }],
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
        a.status === AppointmentStatus.CONFIRMED && a.endTime < now
          ? "COMPLETED"
          : a.status,
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

  async rescheduleAppointment(
    loginUserId: string,
    appointmentId: string,
    newStartTimeISO: string,
    reason?: string,
  ) {
    const provider = await this.getProviderOrThrow(loginUserId);

    const existing = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        OR: [{ providerId: provider.id }, { bookingProviderId: provider.id }],
      },
      include: { provider: { include: { user: true, profile: true } } },
    });

    if (!existing) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Appointment not found");
    }

    if (
      existing.status === AppointmentStatus.CANCELLED ||
      existing.status === AppointmentStatus.DECLINED
    ) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Cannot reschedule a cancelled or declined appointment.",
      );
    }

    const newStartTime = new Date(newStartTimeISO);
    if (isNaN(newStartTime.getTime())) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Invalid date/time provided.",
      );
    }

    if (newStartTime < new Date()) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "New start time must be in the future.",
      );
    }

    const durationMs =
      existing.endTime.getTime() - existing.startTime.getTime();
    const newEndTime = new Date(newStartTime.getTime() + durationMs);

    const updated = await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        startTime: newStartTime,
        endTime: newEndTime,
      },
    });

    // Send email update to guest
    const isOnline = existing.sessionType === AppointmentSessionType.ONLINE;
    const emailData: Record<string, unknown> = {
      ...this.buildDecisionEmailData(existing.provider, updated),
      reason: reason || "Schedule adjustment by provider",
      cancelUrl: `${getLandingSiteUrl()}/appointments/cancel/${existing.cancelToken}`,
    };

    if (isOnline && existing.meetingUrl) {
      const guestCallToken = signCallToken({
        appointmentId: existing.id,
        role: "guest",
        participantId: "guest",
      });
      emailData.callJoinUrl = `${existing.meetingUrl}?token=${guestCallToken}`;
    }

    await queueEmail("send-booking-rescheduled-email", emailData);

    return updated;
  }

  async acceptAppointment(loginUserId: string, appointmentId: string) {
    const { provider, existing } = await this.getPendingAppointmentOrThrow(
      loginUserId,
      appointmentId,
    );

    const isOnline = existing.sessionType === AppointmentSessionType.ONLINE;
    const meetingRoomId = isOnline ? `call_${existing.id}` : null;
    const baseUrl = existing.bookingProviderId
      ? getAppSiteUrl()
      : getLandingSiteUrl();
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
    const { provider, existing } = await this.getPendingAppointmentOrThrow(
      loginUserId,
      appointmentId,
    );

    // Declining frees the slot immediately, same as cancelling.
    const updated = await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: AppointmentStatus.DECLINED },
    });

    await queueEmail(
      "send-booking-declined-email",
      this.buildDecisionEmailData(provider, existing),
    );

    return updated;
  }

  async resendAppointmentEmail(loginUserId: string, appointmentId: string) {
    const provider = await prisma.provider.findUnique({
      where: { userId: loginUserId },
      include: { user: true, profile: true },
    });
    if (!provider) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Provider not found");
    }

    const appointment = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        OR: [{ providerId: provider.id }, { bookingProviderId: provider.id }],
      },
    });
    if (!appointment) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Appointment not found");
    }

    const isOnline = appointment.sessionType === AppointmentSessionType.ONLINE;
    const baseUrl = appointment.bookingProviderId
      ? getAppSiteUrl()
      : getLandingSiteUrl();
    const meetingUrl =
      appointment.meetingUrl ||
      (isOnline ? `${baseUrl}/call/${appointment.id}` : null);

    const emailData: Record<string, unknown> = {
      ...this.buildDecisionEmailData(provider, appointment),
      cancelUrl: `${getLandingSiteUrl()}/appointments/cancel/${appointment.cancelToken}`,
    };

    if (isOnline && meetingUrl) {
      const guestCallToken = signCallToken({
        appointmentId: appointment.id,
        role: "guest",
        participantId: "guest",
      });
      emailData.callJoinUrl = `${meetingUrl}?token=${guestCallToken}`;
    }

    await queueEmail("send-booking-accepted-email", emailData);

    return { message: "Meeting link email resent successfully." };
  }

  private async getPendingAppointmentOrThrow(
    loginUserId: string,
    appointmentId: string,
  ) {
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
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Only pending requests can be accepted or declined.",
      );
    }

    return { provider, existing };
  }

  private buildDecisionEmailData(
    provider: {
      user: { fullName: string };
      profile: { timezone: string | null } | null;
    },
    appointment: {
      guestName: string;
      guestEmail: string;
      startTime: Date;
      sessionType: AppointmentSessionType;
    },
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
      appointment.status === AppointmentStatus.CONFIRMED &&
      appointment.endTime < now
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

  async cancelByGuestToken(cancelToken: string) {
    const appointment = await prisma.appointment.findUnique({
      where: { cancelToken },
      include: { provider: { include: { user: true } } },
    });

    if (!appointment) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Appointment not found");
    }

    if (
      appointment.status === AppointmentStatus.CANCELLED ||
      appointment.status === AppointmentStatus.DECLINED
    ) {
      return appointment;
    }

    if (
      appointment.status === AppointmentStatus.CONFIRMED &&
      appointment.endTime < new Date()
    ) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "This appointment has already taken place and can't be cancelled.",
      );
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
    io.to(`notification_room_${provider.userId}`).emit(
      "new_notification",
      notification,
    );

    return updated;
  }

  async getProviderCallJoinInfo(loginUserId: string, appointmentId: string) {
    const provider = await this.getProviderOrThrow(loginUserId);

    const appointment = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        OR: [{ providerId: provider.id }, { bookingProviderId: provider.id }],
      },
      include: {
        provider: { include: { user: { include: { subscription: true } } } },
        bookingProvider: {
          include: { user: { include: { subscription: true } } },
        },
      },
    });
    if (!appointment) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Appointment not found");
    }

    // Calling requires BOTH providers to have active/trialing calling access
    // when both sides are providers (bookingProvider is null for guest bookings).
    if (
      !canBothPartiesCall(
        appointment.provider.user.subscription,
        appointment.bookingProvider?.user.subscription,
      )
    ) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        "Calling isn't available — one of the providers' trial calling access has ended. Upgrade to keep making calls.",
      );
    }

    if (
      appointment.sessionType !== AppointmentSessionType.ONLINE ||
      !appointment.meetingUrl
    ) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "This appointment doesn't have a video call set up.",
      );
    }
    if (appointment.status !== AppointmentStatus.CONFIRMED) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "This appointment isn't confirmed.",
      );
    }
    if (!isWithinCallJoinWindow(appointment.startTime, appointment.endTime)) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        `The call link opens ${CALL_JOIN_WINDOW_BEFORE_MINUTES} minutes before the session starts.`,
      );
    }

    const token = signCallToken({
      appointmentId: appointment.id,
      role: "provider",
      participantId: loginUserId,
    });
    const appMeetingUrl = (appointment.meetingUrl || "").replace(
      getLandingSiteUrl(),
      getAppSiteUrl(),
    );
    return {
      joinUrl: `${appMeetingUrl || `${getAppSiteUrl()}/call/${appointment.id}`}?token=${token}`,
    };
  }

  async getAppointmentShareLink(loginUserId: string, appointmentId: string) {
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
    if (appointment.sessionType !== AppointmentSessionType.ONLINE) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "This appointment doesn't have a video call set up.",
      );
    }
    if (appointment.status !== AppointmentStatus.CONFIRMED) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "This appointment isn't confirmed.",
      );
    }

    const token = signCallToken({
      appointmentId: appointment.id,
      role: "guest",
      participantId: "guest",
    });
    const baseUrl = appointment.bookingProviderId
      ? getAppSiteUrl()
      : getLandingSiteUrl();
    const meetingUrl =
      appointment.meetingUrl || `${baseUrl}/call/${appointment.id}`;

    return { shareUrl: `${meetingUrl}?token=${token}` };
  }

  async getPublicCallInfo(token: string) {
    const payload = verifyCallToken(token);
    if (!payload) {
      throw new ApiError(
        StatusCodes.UNAUTHORIZED,
        "This call link is invalid or has expired.",
      );
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: payload.appointmentId },
      include: { provider: { include: { user: true } } },
    });
    if (!appointment) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Appointment not found");
    }
    if (appointment.sessionType !== AppointmentSessionType.ONLINE) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "This isn't an online session.",
      );
    }
    if (appointment.status !== AppointmentStatus.CONFIRMED) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "This appointment isn't confirmed.",
      );
    }

    const canJoinNow = isWithinCallJoinWindow(
      appointment.startTime,
      appointment.endTime,
    );

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

  // Fetch all direct call logs between logged-in user (provider or client) and target provider
  async getDirectCallLogs(loginUserId: string, targetIdentifier: string) {
    let loginProvider = await prisma.provider.findUnique({
      where: { userId: loginUserId },
    });
    if (!loginProvider) {
      loginProvider = await prisma.provider.findUnique({
        where: { id: loginUserId },
      });
    }

    let loginClient = null;
    if (!loginProvider) {
      loginClient = await prisma.client.findFirst({
        where: { OR: [{ userId: loginUserId }, { id: loginUserId }] },
      });
    }

    if (!loginProvider && !loginClient) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Caller account not found");
    }

    let targetProvider = await prisma.provider.findUnique({
      where: { id: targetIdentifier },
      include: { user: true },
    });

    if (!targetProvider) {
      const profile = await prisma.providerProfile.findUnique({
        where: { slug: targetIdentifier },
        include: { provider: { include: { user: true } } },
      });
      if (profile) {
        targetProvider = profile.provider as any;
      }
    }

    if (!targetProvider) {
      targetProvider = await prisma.provider.findFirst({
        where: { userId: targetIdentifier },
        include: { user: true },
      });
    }

    if (!targetProvider) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Target provider not found");
    }

    const whereClause: any = loginProvider
      ? {
          OR: [
            {
              providerId: loginProvider.id,
              bookingProviderId: targetProvider.id,
            },
            {
              providerId: targetProvider.id,
              bookingProviderId: loginProvider.id,
            },
            {
              providerId: loginProvider.id,
              clientId: targetIdentifier,
            },
          ],
        }
      : {
          providerId: targetProvider.id,
          clientId: loginClient!.id,
        };

    const appointments = await prisma.appointment.findMany({
      where: whereClause,
      include: {
        callLogs: {
          orderBy: { occurredAt: "desc" },
        },
        provider: { include: { user: true } },
        bookingProvider: { include: { user: true } },
        client: { include: { user: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return appointments;
  }

  // Fetch all call logs for the logged-in provider or client across all appointments and direct calls
  async getAllMyCallLogs(loginUserId: string) {
    let loginProvider = await prisma.provider.findUnique({
      where: { userId: loginUserId },
    });
    if (!loginProvider) {
      loginProvider = await prisma.provider.findUnique({
        where: { id: loginUserId },
      });
    }

    let loginClient = null;
    if (!loginProvider) {
      loginClient = await prisma.client.findFirst({
        where: { OR: [{ userId: loginUserId }, { id: loginUserId }] },
      });
    }

    if (!loginProvider && !loginClient) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Account not found");
    }

    const whereClause: any = loginProvider
      ? {
          OR: [
            { providerId: loginProvider.id },
            { bookingProviderId: loginProvider.id },
          ],
        }
      : {
          clientId: loginClient!.id,
        };

    const appointments = await prisma.appointment.findMany({
      where: whereClause,
      include: {
        callLogs: {
          orderBy: { occurredAt: "desc" },
        },
        provider: { include: { user: true } },
        bookingProvider: { include: { user: true } },
        client: { include: { user: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return appointments;
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
        data: {
          appointmentId,
          role,
          participantId,
          event,
          connectionMeta: connectionMeta as any,
        },
      });
    } catch (error) {
      logger.error("[AppointmentService] Failed to write call log:", error);
    }
  }

  // Delete a single call log
  async deleteSingleCallLog(loginUserId: string, appointmentId: string) {
    const provider = await this.getProviderOrThrow(loginUserId);

    const appt = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        OR: [{ providerId: provider.id }, { bookingProviderId: provider.id }],
      },
    });
    if (!appt) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Call log not found");
    }

    // Delete appointment (cascades and deletes associated call logs)
    await prisma.appointment.delete({
      where: { id: appointmentId },
    });

    return { message: "Call log deleted successfully" };
  }

  // Bulk delete call logs by appointment IDs
  async bulkDeleteCallLogs(loginUserId: string, appointmentIds: string[]) {
    const provider = await this.getProviderOrThrow(loginUserId);

    const appts = await prisma.appointment.findMany({
      where: {
        id: { in: appointmentIds },
        OR: [{ providerId: provider.id }, { bookingProviderId: provider.id }],
      },
      select: { id: true },
    });

    const validIds = appts.map((a) => a.id);
    if (validIds.length > 0) {
      await prisma.appointment.deleteMany({
        where: { id: { in: validIds } },
      });
    }

    return { message: `${validIds.length} call logs deleted successfully` };
  }

  // Clear all call logs for logged-in provider
  async clearAllCallLogs(loginUserId: string) {
    const provider = await this.getProviderOrThrow(loginUserId);

    const appts = await prisma.appointment.findMany({
      where: {
        OR: [{ providerId: provider.id }, { bookingProviderId: provider.id }],
      },
      select: { id: true },
    });

    const allIds = appts.map((a) => a.id);
    if (allIds.length > 0) {
      await prisma.appointment.deleteMany({
        where: { id: { in: allIds } },
      });
    }

    return { message: "All call logs cleared successfully" };
  }
}
