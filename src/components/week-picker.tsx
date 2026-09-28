"use client";

import { DatePicker } from "@/components/date-picker";
import { addDaysToDateString, getMondayDateString } from "@/lib/dates";

function formatShortWeek(weekStart: string) {
  const end = addDaysToDateString(weekStart, 6);
  const [, startMonth, startDay] = weekStart.split("-");
  const [, endMonth, endDay] = end.split("-");
  return `${Number(startMonth)}/${Number(startDay)}–${Number(endMonth)}/${Number(endDay)}`;
}

export function WeekPicker({ weekStart, currentWeek, onWeekChange, min, max }: {
  weekStart: string;
  currentWeek: string;
  onWeekChange: (weekStart: string) => void;
  min?: string;
  max?: string;
}) {
  return <div className="flex flex-wrap items-center gap-2">
    <DatePicker
      value={weekStart}
      min={min}
      max={max}
      compact
      buttonLabel={formatShortWeek(weekStart)}
      ariaLabel="选择要查看的周"
      onChange={(date) => onWeekChange(getMondayDateString(date))}
    />
    {weekStart !== currentWeek ? <button type="button" className="min-h-9 rounded-xl bg-blue-50 px-3 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300" onClick={() => onWeekChange(currentWeek)}>回到本周</button> : null}
  </div>;
}
