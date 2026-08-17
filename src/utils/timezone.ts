// Minimal IANA-timezone <-> UTC conversion using only Intl (no date library
// dependency). Good enough for slot computation; not meant for exhaustive
// historical-DST-transition correctness.

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 (Sunday) - 6 (Saturday)
}

// The offset (in minutes) such that: localWallClockTime = utcInstant + offset
function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }

  const asIfUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );

  return (asIfUtc - date.getTime()) / 60000;
}

// Given a UTC instant, return the wall-clock date/time as seen in `timeZone`.
export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const offsetMinutes = getTimeZoneOffsetMinutes(date, timeZone);
  const shifted = new Date(date.getTime() + offsetMinutes * 60000);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    weekday: shifted.getUTCDay(),
  };
}

// Given a wall-clock date/time in `timeZone`, return the equivalent UTC instant.
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const asUtcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offsetMinutes = getTimeZoneOffsetMinutes(asUtcGuess, timeZone);
  return new Date(asUtcGuess.getTime() - offsetMinutes * 60000);
}

// Adds `days` calendar days to a plain {year, month, day} tuple using UTC-based
// arithmetic (correct for pure calendar-date math, no timezone involved here).
export function addCalendarDays(
  parts: { year: number; month: number; day: number },
  days: number,
): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function parseHHMM(value: string): { hour: number; minute: number } {
  const [hourStr, minuteStr] = value.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (Number.isNaN(hour) || Number.isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid HH:MM time: ${value}`);
  }
  return { hour, minute };
}

// US timezones only.
export const US_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
] as const;
