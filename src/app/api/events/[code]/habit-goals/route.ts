import { z } from "zod";

import { getDateStringInTimeZone, isValidDateString } from "@/lib/dates";
import { getHabitPeriodRange, type HabitFrequency, type HabitGoalStatus } from "@/lib/habits";
import { serverError, validationError } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { EventTimeZone } from "@/lib/types";

const identity = z.object({ identityId: z.uuid("身份 ID 不正确") });
const goalFields = {
  title: z.string().trim().min(1, "请输入目标名称").max(60, "目标名称最多 60 个字符"),
  description: z.string().trim().max(160, "目标说明最多 160 个字符").nullable().default(null),
  targetDate: z.string().refine(isValidDateString, "目标日期不正确").nullable().default(null),
  habitIds: z.array(z.uuid("关联习惯不正确")).min(1, "请至少关联一个习惯").max(50),
};
const uniqueHabitIds = <T extends { habitIds: string[] }>(value: T) => ({ ...value, habitIds: [...new Set(value.habitIds)] });
const createSchema = identity.extend(goalFields).transform(uniqueHabitIds);
const updateSchema = identity.extend({ ...goalFields, goalId: z.uuid("目标 ID 不正确") }).transform(uniqueHabitIds);
const statusSchema = identity.extend({
  goalId: z.uuid("目标 ID 不正确"),
  status: z.enum(["active", "paused", "achieved"]),
});
const deleteSchema = identity.extend({ goalId: z.uuid("目标 ID 不正确") });

type GoalRow = {
  id: string;
  title: string;
  description: string | null;
  target_date: string | null;
  status: HabitGoalStatus;
  achieved_at: string | null;
  created_at: string;
};

type HabitRow = {
  id: string;
  frequency: HabitFrequency;
  target_count: number;
  active_from: string | null;
};

async function getContext(code: string, identityId: string) {
  const { data: event, error: eventError } = await supabaseAdmin.from("events")
    .select("id, workspace_kind, status, time_zone").eq("share_code", code).maybeSingle();
  if (eventError || !event) return null;
  const { data: member, error: memberError } = await supabaseAdmin.from("event_members")
    .select("id").eq("event_id", event.id).eq("identity_id", identityId).maybeSingle();
  if (memberError || !member) return null;
  return { event, member };
}

function invalidContext(context: Awaited<ReturnType<typeof getContext>>) {
  if (!context) return Response.json({ error: "事件不存在或你尚未加入" }, { status: 403 });
  if (context.event.workspace_kind !== "habit_tracker") return Response.json({ error: "这里只能管理 Habit Tracker 目标" }, { status: 409 });
  if (context.event.status !== "active") return Response.json({ error: "这个事件已经关闭" }, { status: 409 });
  return null;
}

async function validateHabits(eventId: string, habitIds: string[]) {
  const { data, error } = await supabaseAdmin.from("habits")
    .select("id").eq("event_id", eventId).in("id", habitIds).is("active_from", null);
  return !error && (data?.length ?? 0) === habitIds.length;
}

function mapGoal(row: GoalRow, habitIds: string[]) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    targetDate: row.target_date,
    status: row.status,
    achievedAt: row.achieved_at,
    habitIds,
    actionRate: 0,
    progress: [],
    createdAt: row.created_at,
  };
}

export async function GET(request: Request, route: RouteContext<"/api/events/[code]/habit-goals">) {
  const { code } = await route.params;
  const params = new URL(request.url).searchParams;
  const parsed = identity.safeParse({ identityId: params.get("identityId") });
  if (!parsed.success) return validationError(parsed.error);
  const context = await getContext(code.toUpperCase(), parsed.data.identityId);
  const invalid = invalidContext(context);
  if (invalid || !context) return invalid!;

  const { data: rows, error: goalError } = await supabaseAdmin.from("habit_goals")
    .select("id, title, description, target_date, status, achieved_at, created_at")
    .eq("event_id", context.event.id).order("created_at", { ascending: true });
  if (goalError) return serverError("读取目标失败");
  const goalRows = (rows ?? []) as GoalRow[];
  if (!goalRows.length) return Response.json({ goals: [] });

  const goalIds = goalRows.map((goal) => goal.id);
  const { data: linkRows, error: linkError } = await supabaseAdmin.from("habit_goal_habits")
    .select("goal_id, habit_id").in("goal_id", goalIds);
  if (linkError) return serverError("读取目标关联习惯失败");
  const habitIds = [...new Set((linkRows ?? []).map((link) => link.habit_id))];
  const { data: habitRows, error: habitError } = habitIds.length
    ? await supabaseAdmin.from("habits").select("id, frequency, target_count, active_from").in("id", habitIds)
    : { data: [], error: null };
  if (habitError) return serverError("读取目标习惯失败");

  const today = getDateStringInTimeZone(context.event.time_zone as EventTimeZone);
  const habits = (habitRows ?? []) as HabitRow[];
  const starts = habits.map((habit) => getHabitPeriodRange(today, habit.frequency)[0]);
  const firstDay = starts.sort()[0] ?? today;
  const { data: checkinRows, error: checkinError } = habitIds.length
    ? await supabaseAdmin.from("habit_checkins")
      .select("habit_id, checkin_date, count")
      .eq("member_id", context.member.id).in("habit_id", habitIds)
      .gte("checkin_date", firstDay).lte("checkin_date", today)
    : { data: [], error: null };
  if (checkinError) return serverError("读取目标进度失败");

  const progressByHabit = new Map(habits.map((habit) => {
    const [start, end] = getHabitPeriodRange(today, habit.frequency);
    const completed = (checkinRows ?? [])
      .filter((checkin) => checkin.habit_id === habit.id && checkin.checkin_date >= start && checkin.checkin_date <= end)
      .reduce((sum, checkin) => sum + checkin.count, 0);
    return [habit.id, {
      habitId: habit.id,
      completed,
      target: habit.target_count,
      rate: Math.min(100, Math.round((completed / habit.target_count) * 100)),
    }];
  }));

  const goals = goalRows.map((row) => {
    const linkedIds = (linkRows ?? []).filter((link) => link.goal_id === row.id).map((link) => link.habit_id);
    const progress = linkedIds.flatMap((habitId) => {
      const item = progressByHabit.get(habitId);
      return item ? [item] : [];
    });
    const actionRate = progress.length
      ? Math.round(progress.reduce((sum, item) => sum + item.rate, 0) / progress.length)
      : 0;
    return { ...mapGoal(row, linkedIds), actionRate, progress };
  });
  return Response.json({ goals });
}

export async function POST(request: Request, route: RouteContext<"/api/events/[code]/habit-goals">) {
  const { code } = await route.params;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  const context = await getContext(code.toUpperCase(), parsed.data.identityId);
  const invalid = invalidContext(context);
  if (invalid || !context) return invalid!;
  if (!await validateHabits(context.event.id, parsed.data.habitIds)) {
    return Response.json({ error: "目标只能关联当前事件里的普通习惯" }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin.from("habit_goals").insert({
    event_id: context.event.id,
    title: parsed.data.title,
    description: parsed.data.description || null,
    target_date: parsed.data.targetDate,
  }).select("id, title, description, target_date, status, achieved_at, created_at").single();
  if (error || !data) return serverError("保存目标失败");
  const { error: linkError } = await supabaseAdmin.from("habit_goal_habits")
    .insert(parsed.data.habitIds.map((habitId) => ({ goal_id: data.id, habit_id: habitId })));
  if (linkError) {
    await supabaseAdmin.from("habit_goals").delete().eq("id", data.id);
    return serverError("关联目标习惯失败");
  }
  return Response.json({ goal: mapGoal(data as GoalRow, parsed.data.habitIds) }, { status: 201 });
}

export async function PUT(request: Request, route: RouteContext<"/api/events/[code]/habit-goals">) {
  const { code } = await route.params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  const context = await getContext(code.toUpperCase(), parsed.data.identityId);
  const invalid = invalidContext(context);
  if (invalid || !context) return invalid!;
  if (!await validateHabits(context.event.id, parsed.data.habitIds)) {
    return Response.json({ error: "目标只能关联当前事件里的普通习惯" }, { status: 400 });
  }
  const { data: existing, error: existingError } = await supabaseAdmin.from("habit_goals")
    .select("id").eq("id", parsed.data.goalId).eq("event_id", context.event.id).maybeSingle();
  if (existingError) return serverError("读取目标失败");
  if (!existing) return Response.json({ error: "找不到这个目标" }, { status: 404 });

  const { error: updateError } = await supabaseAdmin.from("habit_goals").update({
    title: parsed.data.title,
    description: parsed.data.description || null,
    target_date: parsed.data.targetDate,
    updated_at: new Date().toISOString(),
  }).eq("id", parsed.data.goalId).eq("event_id", context.event.id);
  if (updateError) return serverError("更新目标失败");
  const { data: currentLinks, error: currentLinkError } = await supabaseAdmin.from("habit_goal_habits")
    .select("habit_id").eq("goal_id", parsed.data.goalId);
  if (currentLinkError) return serverError("读取目标关联习惯失败");
  const currentIds = new Set((currentLinks ?? []).map((link) => link.habit_id));
  const nextIds = new Set(parsed.data.habitIds);
  const additions = parsed.data.habitIds.filter((habitId) => !currentIds.has(habitId));
  const removals = [...currentIds].filter((habitId) => !nextIds.has(habitId));
  if (additions.length) {
    const { error } = await supabaseAdmin.from("habit_goal_habits")
      .insert(additions.map((habitId) => ({ goal_id: parsed.data.goalId, habit_id: habitId })));
    if (error) return serverError("更新目标关联习惯失败");
  }
  if (removals.length) {
    const { error } = await supabaseAdmin.from("habit_goal_habits")
      .delete().eq("goal_id", parsed.data.goalId).in("habit_id", removals);
    if (error) return serverError("更新目标关联习惯失败");
  }
  return Response.json({ ok: true });
}

export async function PATCH(request: Request, route: RouteContext<"/api/events/[code]/habit-goals">) {
  const { code } = await route.params;
  const parsed = statusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  const context = await getContext(code.toUpperCase(), parsed.data.identityId);
  const invalid = invalidContext(context);
  if (invalid || !context) return invalid!;
  const { data, error } = await supabaseAdmin.from("habit_goals").update({
    status: parsed.data.status,
    achieved_at: parsed.data.status === "achieved" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", parsed.data.goalId).eq("event_id", context.event.id).select("id").maybeSingle();
  if (error) return serverError("更新目标状态失败");
  if (!data) return Response.json({ error: "找不到这个目标" }, { status: 404 });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, route: RouteContext<"/api/events/[code]/habit-goals">) {
  const { code } = await route.params;
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  const context = await getContext(code.toUpperCase(), parsed.data.identityId);
  const invalid = invalidContext(context);
  if (invalid || !context) return invalid!;
  const { error, count } = await supabaseAdmin.from("habit_goals").delete({ count: "exact" })
    .eq("id", parsed.data.goalId).eq("event_id", context.event.id);
  if (error) return serverError("删除目标失败");
  if (!count) return Response.json({ error: "找不到这个目标" }, { status: 404 });
  return Response.json({ ok: true });
}
