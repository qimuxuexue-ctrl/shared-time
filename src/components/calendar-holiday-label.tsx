import { getHolidayLabel } from "@/lib/holidays";
import type { EventTimeZone } from "@/lib/types";

export function CalendarHolidayLabel({ date, timeZone, muted = false }: {
  date: string;
  timeZone: EventTimeZone;
  muted?: boolean;
}) {
  const label = getHolidayLabel(date, timeZone);
  if (!label) return null;

  return <span
    className={`mt-1.5 inline-flex max-w-full truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-4 ${muted ? "bg-slate-100 text-slate-400" : "bg-rose-50 text-rose-600"}`}
    title={label}
  >
    {label}
  </span>;
}
