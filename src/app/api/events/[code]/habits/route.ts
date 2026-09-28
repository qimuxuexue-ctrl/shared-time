import { z } from "zod";

import { addDaysToDateString, getMondayDateString, isValidDateString } from "@/lib/dates";
import { habitFieldsSchema } from "@/lib/habits";
import { serverError, validationError } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase/admin";

const identity = z.object({ identityId: z.uuid() });
const habitSchema = identity.safeExtend(habitFieldsSchema.shape).refine((value) => habitFieldsSchema.safeParse(value).success, { message: "目标次数超过该周期的上限" });
const editSchema = habitSchema.safeExtend({ habitId: z.uuid() });
const deleteSchema = identity.extend({ habitId: z.uuid() });
const checkinSchema = identity.extend({
  habitId: z.uuid(),
  date: z.string().refine(isValidDateString, "日期不正确"),
  count: z.number().int().min(0).max(31),
  startHour: z.number().int().min(10).max(23).nullable().optional(),
});

async function getContext(code: string, identityId: string) {
  const { data: event, error: eventError } = await supabaseAdmin.from("events")
    .select("id, workspace_kind, status, start_date, time_zone")
    .eq("share_code", code).maybeSingle();
  if (eventError || !event) return null;
  const { data: member, error: memberError } = await supabaseAdmin.from("event_members")
    .select("id").eq("event_id", event.id).eq("identity_id", identityId).maybeSingle();
  if (memberError || !member) return null;
  return { event, member };
}

function invalidContext(context: Awaited<ReturnType<typeof getContext>>) {
  if (!context) return Response.json({ error: "事件不存在或你尚未加入" }, { status: 403 });
  if (context.event.workspace_kind !== "habit_tracker") return Response.json({ error: "这里只能管理 Habit Tracker" }, { status: 409 });
  if (context.event.status !== "active") return Response.json({ error: "这个事件已经关闭" }, { status: 409 });
  return null;
}

function mapHabit(row: { id: string; title: string; frequency: string; target_count: number; duration_minutes: number | null; created_at: string }) {
  return { id: row.id, title: row.title, frequency: row.frequency, targetCount: row.target_count, durationMinutes: row.duration_minutes, createdAt: row.created_at };
}

function periodRange(date: string, frequency: string) {
  if (frequency === "daily") return [date, date];
  if (frequency === "weekly") {
    const start = getMondayDateString(date);
    return [start, addDaysToDateString(start, 6)];
  }
  const [year, month, day] = date.split("-").map(Number);
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (frequency === "half_monthly") return day <= 15 ? [`${prefix}01`, `${prefix}15`] : [`${prefix}16`, `${prefix}${lastDay}`];
  return [`${prefix}01`, `${prefix}${lastDay}`];
}

export async function GET(request: Request, route: RouteContext<"/api/events/[code]/habits">) {
  const { code } = await route.params;
  const params = new URL(request.url).searchParams;
  const parsed = identity.extend({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }).safeParse({
    identityId: params.get("identityId"), month: params.get("month"),
  });
  if (!parsed.success) return validationError(parsed.error);
  const context = await getContext(code.toUpperCase(), parsed.data.identityId);
  const invalid = invalidContext(context);
  if (invalid || !context) return invalid!;

  const { data: rows, error: habitError } = await supabaseAdmin.from("habits")
    .select("id, title, frequency, target_count, duration_minutes, created_at")
    .eq("event_id", context.event.id).order("created_at", { ascending: true });
  if (habitError) return serverError("读取习惯失败");
  const habits = (rows ?? []).map(mapHabit);
  if (!habits.length) return Response.json({ habits, checkins: [] });

  const firstDay = getMondayDateString(`${parsed.data.month}-01`);
  const lastDay = addDaysToDateString(firstDay, 41);
  const { data: checkins, error: checkinError } = await supabaseAdmin.from("habit_checkins")
    .select("id, habit_id, checkin_date, start_hour, count")
    .eq("member_id", context.member.id)
    .in("habit_id", habits.map((habit) => habit.id))
    .gte("checkin_date", firstDay).lte("checkin_date", lastDay);
  if (checkinError) return serverError("读取打卡记录失败");
  return Response.json({ habits, checkins: (checkins ?? []).map((item) => ({ id: item.id, habitId: item.habit_id, date: item.checkin_date, startHour: item.start_hour, count: item.count })) });
}

export async function POST(request: Request, route: RouteContext<"/api/events/[code]/habits">) {
  const { code } = await route.params;
  const parsed = habitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  const context = await getContext(code.toUpperCase(), parsed.data.identityId);
  const invalid = invalidContext(context);
  if (invalid || !context) return invalid!;
  const { data, error } = await supabaseAdmin.from("habits")
    .insert({ event_id: context.event.id, title: parsed.data.title, frequency: parsed.data.frequency, target_count: parsed.data.targetCount, duration_minutes: parsed.data.durationMinutes })
    .select("id, title, frequency, target_count, duration_minutes, created_at").single();
  if (error || !data) return serverError("保存习惯失败");
  return Response.json({ habit: mapHabit(data) }, { status: 201 });
}

export async function PUT(request: Request, route: RouteContext<"/api/events/[code]/habits">) {
  const { code } = await route.params;
  const parsed = editSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  const context = await getContext(code.toUpperCase(), parsed.data.identityId);
  const invalid = invalidContext(context);
  if (invalid || !context) return invalid!;
  const { data, error } = await supabaseAdmin.from("habits")
    .update({ title: parsed.data.title, frequency: parsed.data.frequency, target_count: parsed.data.targetCount, duration_minutes: parsed.data.durationMinutes })
    .eq("id", parsed.data.habitId).eq("event_id", context.event.id)
    .select("id, title, frequency, target_count, duration_minutes, created_at").maybeSingle();
  if (error) return serverError("更新习惯失败");
  if (!data) return Response.json({ error: "找不到这个习惯" }, { status: 404 });
  return Response.json({ habit: mapHabit(data) });
}

export async function DELETE(request: Request, route: RouteContext<"/api/events/[code]/habits">) {
  const { code } = await route.params;
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  const context = await getContext(code.toUpperCase(), parsed.data.identityId);
  const invalid = invalidContext(context);
  if (invalid || !context) return invalid!;
  const { error, count } = await supabaseAdmin.from("habits").delete({ count: "exact" })
    .eq("id", parsed.data.habitId).eq("event_id", context.event.id);
  if (error) return serverError("删除习惯失败");
  if (!count) return Response.json({ error: "找不到这个习惯" }, { status: 404 });
  return Response.json({ ok: true });
}

export async function PATCH(request: Request, route: RouteContext<"/api/events/[code]/habits">) {
  const { code } = await route.params;
  const parsed = checkinSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  const context = await getContext(code.toUpperCase(), parsed.data.identityId);
  const invalid = invalidContext(context);
  if (invalid || !context) return invalid!;
  const { data: habit, error: habitError } = await supabaseAdmin.from("habits")
    .select("id, frequency, target_count, duration_minutes").eq("id", parsed.data.habitId)
    .eq("event_id", context.event.id).maybeSingle();
  if (habitError) return serverError("读取习惯失败");
  if (!habit) return Response.json({ error: "找不到这个习惯" }, { status: 404 });
  const startHour = parsed.data.startHour ?? null;
  const visualMinutes = Math.max(60, habit.duration_minutes ?? 60);
  if (startHour !== null && startHour * 60 + visualMinutes > 24 * 60) {
    return Response.json({ error: "该时长会超出当天范围，请选择更早的开始时间" }, { status: 400 });
  }

  let existingQuery = supabaseAdmin.from("habit_checkins").select("id")
    .eq("habit_id", habit.id).eq("member_id", context.member.id).eq("checkin_date", parsed.data.date);
  existingQuery = startHour === null ? existingQuery.is("start_hour", null) : existingQuery.eq("start_hour", startHour);
  const { data: existing, error: existingError } = await existingQuery.maybeSingle<{ id: string }>();
  if (existingError) return serverError("读取打卡记录失败");

  if (parsed.data.count === 0) {
    if (!existing) return Response.json({ habitId: habit.id, date: parsed.data.date, startHour, count: 0 });
    const { error } = await supabaseAdmin.from("habit_checkins").delete().eq("id", existing.id);
    if (error) return serverError("撤销打卡失败");
  } else {
    if (!existing) {
      const [periodStart, periodEnd] = periodRange(parsed.data.date, habit.frequency);
      const { data: periodRows, error: periodError } = await supabaseAdmin.from("habit_checkins")
        .select("count").eq("habit_id", habit.id).eq("member_id", context.member.id)
        .gte("checkin_date", periodStart).lte("checkin_date", periodEnd);
      if (periodError) return serverError("读取打卡进度失败");
      const completed = (periodRows ?? []).reduce((sum, row) => sum + row.count, 0);
      if (completed >= habit.target_count) return Response.json({ error: "这个周期的目标次数已经完成" }, { status: 400 });
      const { data: inserted, error } = await supabaseAdmin.from("habit_checkins").insert({
        habit_id: habit.id, member_id: context.member.id, checkin_date: parsed.data.date,
        start_hour: startHour, count: 1,
      }).select("id").single();
      if (error || !inserted) return serverError("打卡失败");
      return Response.json({ id: inserted.id, habitId: habit.id, date: parsed.data.date, startHour, count: 1 });
    }
  }
  return Response.json({ id: existing?.id, habitId: habit.id, date: parsed.data.date, startHour, count: parsed.data.count ? 1 : 0 });
}
