import type { CSSProperties, ReactNode } from "react";

export const CALENDAR_HOUR_START = 10;
export const CALENDAR_HOUR_END = 24;
export const CALENDAR_HOUR_HEIGHT = 80;
export const CALENDAR_TIME_GUTTER = 68;

export function getDurationBlockStyle({
  dayIndex,
  startHour,
  durationMinutes,
  laneIndex = 0,
  laneCount = 1,
}: {
  dayIndex: number;
  startHour: number;
  durationMinutes: number;
  laneIndex?: number;
  laneCount?: number;
}): CSSProperties {
  const safeLaneCount = Math.max(1, laneCount);
  const safeLaneIndex = Math.min(Math.max(0, laneIndex), safeLaneCount - 1);
  const columnFraction = (dayIndex + safeLaneIndex / safeLaneCount) / 7;
  const widthFraction = 1 / (7 * safeLaneCount);
  const visualMinutes = Math.max(60, durationMinutes);

  return {
    top: (startHour - CALENDAR_HOUR_START) * CALENDAR_HOUR_HEIGHT + 6,
    height: visualMinutes / 60 * CALENDAR_HOUR_HEIGHT - 12,
    left: `calc(${columnFraction * 100}% + ${CALENDAR_TIME_GUTTER * (1 - columnFraction) + 5}px)`,
    width: `calc(${widthFraction * 100}% - ${CALENDAR_TIME_GUTTER * widthFraction + 10}px)`,
  };
}

export function DurationCalendarBlock({
  dayIndex,
  startHour,
  durationMinutes,
  laneIndex,
  laneCount,
  className,
  children,
}: {
  dayIndex: number;
  startHour: number;
  durationMinutes: number;
  laneIndex?: number;
  laneCount?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`absolute z-10 min-w-0 ${className ?? ""}`}
      style={getDurationBlockStyle({ dayIndex, startHour, durationMinutes, laneIndex, laneCount })}
    >
      {children}
    </div>
  );
}
