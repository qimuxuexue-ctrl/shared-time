import type { EventTimeZone } from "@/lib/types";

const TIME_ZONE_OFFSETS: Record<EventTimeZone, string> = {
  "Asia/Shanghai": "+08:00",
  "Asia/Tokyo": "+09:00",
};

export const EVENT_TIME_ZONE_OPTIONS: Array<{
  value: EventTimeZone;
  label: string;
  shortLabel: string;
}> = [
  {
    value: "Asia/Shanghai",
    label: "北京时间 UTC+8",
    shortLabel: "北京 UTC+8",
  },
  {
    value: "Asia/Tokyo",
    label: "东京时间 UTC+9",
    shortLabel: "东京 UTC+9",
  },
];

export function getEventTimeZoneLabel(
  timeZone: EventTimeZone,
  short = false,
) {
  const option = EVENT_TIME_ZONE_OPTIONS.find(
    (candidate) => candidate.value === timeZone,
  );
  return short ? option?.shortLabel : option?.label;
}

export function getDateStringInTimeZone(
  timeZone: EventTimeZone,
  now = new Date(),
) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const readPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${readPart("year")}-${readPart("month")}-${readPart("day")}`;
}

export function getBeijingDateString(now = new Date()) {
  return getDateStringInTimeZone("Asia/Shanghai", now);
}

export function getMondayDateString(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = date.getUTCDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

export function addDaysToDateString(dateString: string, days: number) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isValidDateString(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.toISOString().slice(0, 10) === value;
}

export function getIsoDay(dateString: string) {
  const day = new Date(`${dateString}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function isValidEventHour(dateString: string, startHour: number) {
  return isValidDateString(dateString) && startHour >= 10 && startHour <= 23;
}

export function isPastSlot(
  dateString: string,
  startHour: number,
  timeZone: EventTimeZone = "Asia/Shanghai",
  now = new Date(),
) {
  const start = Date.parse(
    `${dateString}T${String(startHour).padStart(2, "0")}:00:00${TIME_ZONE_OFFSETS[timeZone]}`,
  );
  return start <= now.getTime();
}
