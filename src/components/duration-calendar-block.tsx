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
  layout = "lanes",
  raised = false,
}: {
  dayIndex: number;
  startHour: number;
  durationMinutes: number;
  laneIndex?: number;
  laneCount?: number;
  layout?: "lanes" | "stack";
  raised?: boolean;
}): CSSProperties {
  const safeLaneCount = Math.max(1, laneCount);
  const safeLaneIndex = Math.min(Math.max(0, laneIndex), safeLaneCount - 1);
  const visualMinutes = Math.max(60, durationMinutes);

  if (layout === "stack") {
    const columnFraction = dayIndex / 7;
    const widthFraction = 1 / 7;
    const visibleDepth = Math.min(safeLaneIndex, 3);
    const stackDepth = Math.min(safeLaneCount - 1, 3);
    const horizontalOffset = visibleDepth * 6;
    const verticalOffset = visibleDepth * 5;

    return {
      top: (startHour - CALENDAR_HOUR_START) * CALENDAR_HOUR_HEIGHT + 6 + verticalOffset,
      height: Math.max(48, visualMinutes / 60 * CALENDAR_HOUR_HEIGHT - 12 - verticalOffset),
      left: `calc(${columnFraction * 100}% + ${CALENDAR_TIME_GUTTER * (1 - columnFraction) + 5 + horizontalOffset}px)`,
      width: `calc(${widthFraction * 100}% - ${CALENDAR_TIME_GUTTER * widthFraction + 10 + stackDepth * 6}px)`,
      zIndex: raised ? 40 : 10 + visibleDepth,
    };
  }

  const columnFraction = (dayIndex + safeLaneIndex / safeLaneCount) / 7;
  const widthFraction = 1 / (7 * safeLaneCount);

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
  layout,
  raised,
  className,
  children,
}: {
  dayIndex: number;
  startHour: number;
  durationMinutes: number;
  laneIndex?: number;
  laneCount?: number;
  layout?: "lanes" | "stack";
  raised?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`absolute z-10 min-w-0 ${className ?? ""}`}
      style={getDurationBlockStyle({ dayIndex, startHour, durationMinutes, laneIndex, laneCount, layout, raised })}
    >
      {children}
    </div>
  );
}
