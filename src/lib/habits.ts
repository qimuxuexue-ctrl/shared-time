import { z } from "zod";

export const HABIT_FREQUENCIES = [
  { value: "daily", label: "每天", max: 10 },
  { value: "weekly", label: "每周", max: 7 },
  { value: "half_monthly", label: "每半个月", max: 13 },
  { value: "monthly", label: "每月", max: 28 },
] as const;

export type HabitFrequency = (typeof HABIT_FREQUENCIES)[number]["value"];

export const habitFieldsSchema = z.object({
  title: z.string().trim().min(1, "请输入习惯标题").max(60),
  frequency: z.enum(["daily", "weekly", "half_monthly", "monthly"]),
  targetCount: z.number().int().min(1).max(31),
}).refine((habit) => habit.targetCount <= (HABIT_FREQUENCIES.find((item) => item.value === habit.frequency)?.max ?? 0), {
  message: "目标次数超过该周期的上限",
});
