const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

export function getBeijingDateString(now = new Date()) {
  return new Date(now.getTime() + BEIJING_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
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
  const isoDay = getIsoDay(dateString);
  return isoDay <= 5
    ? startHour >= 19 && startHour <= 23
    : startHour >= 10 && startHour <= 23;
}

export function isPastSlot(
  dateString: string,
  startHour: number,
  now = new Date(),
) {
  const start = Date.parse(
    `${dateString}T${String(startHour).padStart(2, "0")}:00:00+08:00`,
  );
  return start <= now.getTime();
}
