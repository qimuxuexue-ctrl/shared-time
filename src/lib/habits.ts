import { z } from "zod";

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

const habitDurationSchema = z.union([
  z.literal(10), z.literal(20), z.literal(30), z.literal(60),
  z.literal(90), z.literal(120), z.literal(150),
]).nullable().default(null);

export const habitFieldsSchema = z.object({
  title: z.string().trim().min(1, "请输入习惯标题").max(60),
  frequency: z.enum(["daily", "weekly", "half_monthly", "monthly"]),
  targetCount: z.number().int().min(1).max(31),
  durationMinutes: habitDurationSchema,
}).refine((habit) => habit.targetCount <= (HABIT_FREQUENCIES.find((item) => item.value === habit.frequency)?.max ?? 0), {
  message: "目标次数超过该周期的上限",
});
