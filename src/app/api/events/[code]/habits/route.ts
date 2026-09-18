import { z } from "zod";

import { addDaysToDateString, getDateStringInTimeZone, getMondayDateString, isValidDateString } from "@/lib/dates";
import { serverError, validationError } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase/admin";

const identity = z.object({ identityId: z.uuid() });
const habitFields = {
  title: z.string().trim().min(1, "请输入习惯标题").max(60),
  frequency: z.enum(["daily", "weekly", "half_monthly", "monthly"]),
  targetCount: z.number().int().min(1).max(31),
};
const habitSchema = identity.extend(habitFields).refine((value) =>
  value.frequency === "daily" ? value.targetCount <= 10
    : value.frequency === "weekly" ? value.targetCount <= 7
      : value.frequency === "half_monthly" ? value.targetCount <= 13
        : value.targetCount <= 28,
{ message: "目标次数超过该周期的天数" });
const editSchema = habitSchema.safeExtend({ habitId: z.uuid() });
const deleteSchema = identity.extend({ habitId: z.uuid() });
const checkinSchema = identity.extend({
  habitId: z.uuid(),
  date: z.string().refine(isValidDateString, "日期不正确"),
  count: z.number().int().min(0).max(31),
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

function mapHabit(row: { id: string; title: string; frequency: string; target_count: number; created_at: string }) {
  return { id: row.id, title: row.title, frequency: row.frequency, targetCount: row.target_count, createdAt: row.created_at };
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
    .select("id, title, frequency, target_count, created_at")
    .eq("event_id", context.event.id).order("created_at", { ascending: true });
  if (habitError) return serverError("读取习惯失败");
  const habits = (rows ?? []).map(mapHabit);
  if (!habits.length) return Response.json({ habits, checkins: [] });

  const firstDay = getMondayDateString(`${parsed.data.month}-01`);
  const lastDay = addDaysToDateString(firstDay, 41);
  const { data: checkins, error: checkinError } = await supabaseAdmin.from("habit_checkins")
    .select("habit_id, checkin_date, count")
    .eq("member_id", context.member.id)
    .in("habit_id", habits.map((habit) => habit.id))
    .gte("checkin_date", firstDay).lte("checkin_date", lastDay);
  if (checkinError) return serverError("读取打卡记录失败");
  return Response.json({ habits, checkins: (checkins ?? []).map((item) => ({ habitId: item.habit_id, date: item.checkin_date, count: item.count })) });
}

export async function POST(request: Request, route: RouteContext<"/api/events/[code]/habits">) {
  const { code } = await route.params;
  const parsed = habitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  const context = await getContext(code.toUpperCase(), parsed.data.identityId);
  const invalid = invalidContext(context);
  if (invalid || !context) return invalid!;
  const { data, error } = await supabaseAdmin.from("habits")
    .insert({ event_id: context.event.id, title: parsed.data.title, frequency: parsed.data.frequency, target_count: parsed.data.targetCount })
    .select("id, title, frequency, target_count, created_at").single();
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
    .update({ title: parsed.data.title, frequency: parsed.data.frequency, target_count: parsed.data.targetCount })
    .eq("id", parsed.data.habitId).eq("event_id", context.event.id)
    .select("id, title, frequency, target_count, created_at").maybeSingle();
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
  const today = getDateStringInTimeZone(context.event.time_zone);
  if (parsed.data.date < context.event.start_date || parsed.data.date > today) {
    return Response.json({ error: "只能补记事件创建后、今天及之前的打卡" }, { status: 400 });
  }
  const { data: habit, error: habitError } = await supabaseAdmin.from("habits")
    .select("id, frequency, target_count").eq("id", parsed.data.habitId)
    .eq("event_id", context.event.id).maybeSingle();
  if (habitError) return serverError("读取习惯失败");
  if (!habit) return Response.json({ error: "找不到这个习惯" }, { status: 404 });
  const maxCount = habit.frequency === "daily" ? habit.target_count : 1;
  if (parsed.data.count > maxCount) return Response.json({ error: "次数超过每日上限" }, { status: 400 });
  if (parsed.data.count === 0) {
    const { error } = await supabaseAdmin.from("habit_checkins").delete()
      .eq("habit_id", habit.id).eq("member_id", context.member.id).eq("checkin_date", parsed.data.date);
    if (error) return serverError("撤销打卡失败");
  } else {
    const { error } = await supabaseAdmin.from("habit_checkins").upsert({
      habit_id: habit.id, member_id: context.member.id,
      checkin_date: parsed.data.date, count: parsed.data.count,
    }, { onConflict: "habit_id,member_id,checkin_date" });
    if (error) return serverError("打卡失败");
  }
  return Response.json({ habitId: habit.id, date: parsed.data.date, count: parsed.data.count });
}
