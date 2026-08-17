import prisma from "../db/db.config";
import { ApiError } from "../utils/apiError";
import { StatusCodes } from "http-status-codes";
import { AppointmentStatus } from "../generated/prisma/enums";
import { addCalendarDays, getZonedParts, parseHHMM, zonedTimeToUtc, US_TIMEZONES } from "../utils/timezone";
import { ProviderProfileService } from "./ProviderProfileService";

const providerProfileService = new ProviderProfileService();

const MAX_ADVANCE_BOOKING_DAYS = 60;
const MIN_LEAD_TIME_MINUTES = 120;

interface Interval {
  start: Date;
  end: Date;
}

function subtractIntervals(base: Interval, blocked: Interval[]): Interval[] {
  let remaining: Interval[] = [base];

  for (const block of blocked) {
    const next: Interval[] = [];

    for (const window of remaining) {
      const noOverlap = block.end <= window.start || block.start >= window.end;
      if (noOverlap) {
        next.push(window);
        continue;
      }

      if (block.start > window.start) {
        next.push({ start: window.start, end: new Date(Math.min(block.start.getTime(), window.end.getTime())) });
      }
      if (block.end < window.end) {
        next.push({ start: new Date(Math.max(block.end.getTime(), window.start.getTime())), end: window.end });
      }
    }

    remaining = next.filter((w) => w.end.getTime() > w.start.getTime());
  }

  return remaining;
}

function sliceIntoSlots(windows: Interval[], durationMinutes: number): Interval[] {
  const durationMs = durationMinutes * 60000;
  const slots: Interval[] = [];

  for (const window of windows) {
    let cursor = window.start.getTime();
    while (cursor + durationMs <= window.end.getTime()) {
      slots.push({ start: new Date(cursor), end: new Date(cursor + durationMs) });
      cursor += durationMs;
    }
  }

  return slots;
}

export class AvailabilityService {
  private async getProviderOrThrow(loginUserId: string) {
    const provider = await prisma.provider.findUnique({ where: { userId: loginUserId } });
    if (!provider) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Provider not found");
    }
    return provider;
  }

  // Provider — full weekly schedule, replace-all semantics (one row per day for v1).
  async getMyWeeklyAvailability(loginUserId: string) {
    const provider = await this.getProviderOrThrow(loginUserId);
    return prisma.providerAvailability.findMany({
      where: { providerId: provider.id },
      orderBy: { dayOfWeek: "asc" },
    });
  }

  async setMyWeeklyAvailability(
    loginUserId: string,
    days: { dayOfWeek: number; startTime: string; endTime: string }[],
  ) {
    const provider = await this.getProviderOrThrow(loginUserId);

    for (const day of days) {
      if (day.dayOfWeek < 0 || day.dayOfWeek > 6) {
        throw new ApiError(StatusCodes.BAD_REQUEST, "dayOfWeek must be between 0 and 6");
      }
      const start = parseHHMM(day.startTime);
      const end = parseHHMM(day.endTime);
      if (end.hour * 60 + end.minute <= start.hour * 60 + start.minute) {
        throw new ApiError(StatusCodes.BAD_REQUEST, "endTime must be after startTime");
      }
    }

    return prisma.$transaction(async (tx) => {
      await tx.providerAvailability.deleteMany({ where: { providerId: provider.id } });
      if (days.length === 0) return [];
      return tx.providerAvailability.createManyAndReturn({
        data: days.map((d) => ({
          providerId: provider.id,
          dayOfWeek: d.dayOfWeek,
          startTime: d.startTime,
          endTime: d.endTime,
        })),
      });
    });
  }

  async getMyBookingSettings(loginUserId: string) {
    const provider = await this.getProviderOrThrow(loginUserId);
    const profile = await prisma.providerProfile.findUnique({ where: { providerId: provider.id } });
    return {
      timezone: profile?.timezone ?? null,
      appointmentDurationMinutes: profile?.appointmentDurationMinutes ?? 50,
      bufferMinutes: profile?.bufferMinutes ?? 0,
    };
  }

  async setMyBookingSettings(
    loginUserId: string,
    settings: { timezone?: string; appointmentDurationMinutes?: number; bufferMinutes?: number },
  ) {
    const provider = await this.getProviderOrThrow(loginUserId);

    const data: Record<string, unknown> = {};
    if (settings.timezone !== undefined) {
      if (!(US_TIMEZONES as readonly string[]).includes(settings.timezone)) {
        throw new ApiError(StatusCodes.BAD_REQUEST, "Please select a valid US timezone");
      }
      data.timezone = settings.timezone;
    }
    if (settings.appointmentDurationMinutes !== undefined) {
      if (settings.appointmentDurationMinutes < 5 || settings.appointmentDurationMinutes > 480) {
        throw new ApiError(StatusCodes.BAD_REQUEST, "Session length must be between 5 and 480 minutes");
      }
      data.appointmentDurationMinutes = settings.appointmentDurationMinutes;
    }
    if (settings.bufferMinutes !== undefined) {
      if (settings.bufferMinutes < 0 || settings.bufferMinutes > 120) {
        throw new ApiError(StatusCodes.BAD_REQUEST, "Buffer must be between 0 and 120 minutes");
      }
      data.bufferMinutes = settings.bufferMinutes;
    }

    // Ensures a ProviderProfile row exists (with a proper generated slug) before
    // writing booking settings onto it.
    await providerProfileService.getOrCreateForLoginUser(loginUserId);

    return prisma.providerProfile.update({
      where: { providerId: provider.id },
      data,
    });
  }

  async getMyTimeOff(loginUserId: string) {
    const provider = await this.getProviderOrThrow(loginUserId);
    return prisma.providerTimeOff.findMany({
      where: { providerId: provider.id },
      orderBy: { startDate: "asc" },
    });
  }

  async addMyTimeOff(loginUserId: string, data: { startDate: string; endDate: string; reason?: string }) {
    const provider = await this.getProviderOrThrow(loginUserId);

    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid date range");
    }

    return prisma.providerTimeOff.create({
      data: { providerId: provider.id, startDate, endDate, reason: data.reason },
    });
  }

  async removeMyTimeOff(loginUserId: string, timeOffId: string) {
    const provider = await this.getProviderOrThrow(loginUserId);

    const existing = await prisma.providerTimeOff.findFirst({
      where: { id: timeOffId, providerId: provider.id },
    });
    if (!existing) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Time off entry not found");
    }

    return prisma.providerTimeOff.delete({ where: { id: timeOffId } });
  }

  // Public — computes bookable slots for a provider between `from` and `to`
  // (both UTC instants) from weekly availability minus time off minus existing
  // confirmed appointments (+ buffer). Nothing is stored; recomputed each call.
  async computeAvailableSlots(providerId: string, from: Date, to: Date) {
    const [profile, weeklyAvailability, timeOff, appointments] = await Promise.all([
      prisma.providerProfile.findUnique({ where: { providerId } }),
      prisma.providerAvailability.findMany({ where: { providerId } }),
      prisma.providerTimeOff.findMany({ where: { providerId } }),
      prisma.appointment.findMany({
        where: {
          providerId,
          // A PENDING request tentatively holds the slot too, so it can't be
          // double-booked while the provider is still deciding.
          status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
          startTime: { lt: to },
          endTime: { gt: from },
        },
      }),
    ]);

    if (!profile?.timezone || weeklyAvailability.length === 0) {
      return { timezone: profile?.timezone ?? null, slots: [] as { startTime: string; endTime: string }[] };
    }

    const timezone = profile.timezone;
    const durationMinutes = profile.appointmentDurationMinutes;
    const bufferMs = profile.bufferMinutes * 60000;

    const now = new Date();
    const earliestBookable = new Date(now.getTime() + MIN_LEAD_TIME_MINUTES * 60000);
    const latestBookable = new Date(now.getTime() + MAX_ADVANCE_BOOKING_DAYS * 24 * 60 * 60000);

    const rangeStart = from > earliestBookable ? from : earliestBookable;
    const rangeEnd = to < latestBookable ? to : latestBookable;
    if (rangeEnd <= rangeStart) {
      return { timezone, slots: [] };
    }

    const availabilityByDay = new Map(weeklyAvailability.map((a) => [a.dayOfWeek, a]));

    const timeOffIntervals: Interval[] = timeOff.map((t) => ({ start: t.startDate, end: t.endDate }));
    const bookedIntervals: Interval[] = appointments.map((a) => ({
      start: new Date(a.startTime.getTime() - bufferMs),
      end: new Date(a.endTime.getTime() + bufferMs),
    }));

    const allSlots: Interval[] = [];

    const initialParts = getZonedParts(rangeStart, timezone);
    let cursorParts: { year: number; month: number; day: number } = initialParts;
    let guard = 0;
    // Bound the loop generously; MAX_ADVANCE_BOOKING_DAYS already caps range width.
    while (guard <= MAX_ADVANCE_BOOKING_DAYS + 2) {
      guard += 1;

      const dayStartUtc = zonedTimeToUtc(cursorParts.year, cursorParts.month, cursorParts.day, 0, 0, timezone);
      if (dayStartUtc >= rangeEnd) break;

      const weekday = getZonedParts(dayStartUtc, timezone).weekday;
      const dayRule = availabilityByDay.get(weekday);

      if (dayRule) {
        const start = parseHHMM(dayRule.startTime);
        const end = parseHHMM(dayRule.endTime);
        const windowStart = zonedTimeToUtc(cursorParts.year, cursorParts.month, cursorParts.day, start.hour, start.minute, timezone);
        const windowEnd = zonedTimeToUtc(cursorParts.year, cursorParts.month, cursorParts.day, end.hour, end.minute, timezone);

        const clampedStart = windowStart < rangeStart ? rangeStart : windowStart;
        const clampedEnd = windowEnd > rangeEnd ? rangeEnd : windowEnd;

        if (clampedEnd > clampedStart) {
          const openWindows = subtractIntervals({ start: clampedStart, end: clampedEnd }, [
            ...timeOffIntervals,
            ...bookedIntervals,
          ]);
          allSlots.push(...sliceIntoSlots(openWindows, durationMinutes));
        }
      }

      cursorParts = addCalendarDays(cursorParts, 1);
    }

    allSlots.sort((a, b) => a.start.getTime() - b.start.getTime());

    return {
      timezone,
      slots: allSlots.map((s) => ({ startTime: s.start.toISOString(), endTime: s.end.toISOString() })),
    };
  }

  async isSlotStillAvailable(providerId: string, startTime: Date, endTime: Date) {
    const { slots } = await this.computeAvailableSlots(providerId, startTime, endTime);
    return slots.some((s) => s.startTime === startTime.toISOString() && s.endTime === endTime.toISOString());
  }
}
