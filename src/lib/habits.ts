import { z } from "zod";

import { addDaysToDateString, getMondayDateString, isValidDateString } from "@/lib/dates";

export const HABIT_FREQUENCIES = [
  { value: "daily", label: "每天", max: 10 },
  { value: "weekly", label: "每周", max: 7 },
  { value: "half_monthly", label: "每半个月", max: 13 },
  { value: "monthly", label: "每月", max: 28 },
] as const;

export type HabitFrequency = (typeof HABIT_FREQUENCIES)[number]["value"];

export const HABIT_DURATION_OPTIONS = [
  { value: 10, label: "10 分钟" },
  { value: 20, label: "20 分钟" },
  { value: 30, label: "30 分钟" },
  { value: 60, label: "1 小时" },
  { value: 90, label: "1.5 小时" },
  { value: 120, label: "2 小时" },
  { value: 150, label: "2.5 小时" },
] as const;

export type HabitDurationMinutes = (typeof HABIT_DURATION_OPTIONS)[number]["value"];

export type HabitGroup = {
  id: string;
  name: string;
  createdAt: string;
};

export type HabitRecord = {
  id: string;
  groupId: string | null;
  title: string;
  frequency: HabitFrequency;
  targetCount: number;
  durationMinutes: HabitDurationMinutes | null;
  activeFrom: string | null;
  activeUntil: string | null;
  createdAt: string;
};

export type HabitCheckin = {
  id: string;
  habitId: string;
  date: string;
  startHour: number | null;
  count: number;
};

export type HabitGoalStatus = "active" | "paused" | "achieved";

export type HabitGoalProgressItem = {
  habitId: string;
  completed: number;
  target: number;
  rate: number;
};

export type HabitGoal = {
  id: string;
  title: string;
  description: string | null;
  targetDate: string | null;
  status: HabitGoalStatus;
  achievedAt: string | null;
  habitIds: string[];
  actionRate: number;
  progress: HabitGoalProgressItem[];
  createdAt: string;
};

export function getHabitPeriodRange(date: string, frequency: HabitFrequency) {
  if (frequency === "daily") return [date, date] as const;
  if (frequency === "weekly") {
    const start = getMondayDateString(date);
    return [start, addDaysToDateString(start, 6)] as const;
  }
  const [year, month, day] = date.split("-").map(Number);
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (frequency === "half_monthly") {
    return day <= 15
      ? [`${prefix}01`, `${prefix}15`] as const
      : [`${prefix}16`, `${prefix}${lastDay}`] as const;
  }
  return [`${prefix}01`, `${prefix}${lastDay}`] as const;
}

const habitDurationSchema = z.union([
  z.literal(10), z.literal(20), z.literal(30), z.literal(60),
  z.literal(90), z.literal(120), z.literal(150),
]).nullable().default(null);

export const habitFieldsSchema = z.object({
  title: z.string().trim().min(1, "请输入习惯标题").max(60),
  frequency: z.enum(["daily", "weekly", "half_monthly", "monthly"]),
  targetCount: z.number().int().min(1).max(31),
  durationMinutes: habitDurationSchema,
  groupId: z.uuid("习惯分组不正确").nullable().default(null),
  activeFrom: z.string().refine(isValidDateString, "开始日期不正确").nullable().default(null),
  activeUntil: z.string().refine(isValidDateString, "结束日期不正确").nullable().default(null),
}).refine((habit) => habit.targetCount <= (HABIT_FREQUENCIES.find((item) => item.value === habit.frequency)?.max ?? 0), {
  message: "目标次数超过该周期的上限",
}).refine((habit) => (
  habit.activeFrom === null && habit.activeUntil === null
) || (
  habit.activeFrom !== null && habit.activeUntil !== null && habit.activeFrom <= habit.activeUntil
), {
  message: "短期习惯需要完整且正确的日期范围",
  path: ["activeUntil"],
}).refine((habit) => habit.activeFrom === null || habit.groupId === null, {
  message: "短期习惯不能加入分组",
  path: ["groupId"],
});
