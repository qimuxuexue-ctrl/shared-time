import { z } from "zod";

import {
  addDaysToDateString,
  isPastSlot,
  isValidDateString,
  isValidEventHour,
} from "@/lib/dates";
import {
  deleteExpiredEvent,
  isExpiredOneTimeEvent,
  notifyEventMembers,
} from "@/lib/events";
import { serverError, validationError } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase/admin";

const identitySchema = z.object({
  identityId: z.uuid("身份 ID 不正确"),
});

const finalPeriodSchema = z.object({
  date: z.string().refine(isValidDateString, "日期不正确"),
  startHour: z.number().int().min(10).max(23),
  endHour: z.number().int().min(11).max(24),
}).refine((period) => period.endHour > period.startHour, {
  message: "结束时间必须晚于开始时间",
});

const finalTimeSchema = identitySchema.extend({
  periods: z.array(finalPeriodSchema).min(1).max(20),
});

const finalNoteSchema = identitySchema.extend({
  content: z.string().trim().max(300, "补充说明不能超过 300 字"),
});

type EventRow = {
  id: string;
  share_code: string;
  name: string;
  creator_identity_id: string;
  start_date: string;
  event_type: "one_time" | "ongoing";
  time_zone: "Asia/Shanghai" | "Asia/Tokyo";
  final_date: string | null;
  status: "active" | "closed" | "archived";
};

async function getEvent(code: string) {
  return supabaseAdmin
    .from("events")
    .select(
      "id, share_code, name, creator_identity_id, start_date, event_type, time_zone, final_date, status",
    )
    .eq("share_code", code)
    .maybeSingle<EventRow>();
}

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/events/[code]/final-time">,
) {
  const { code: rawCode } = await context.params;
  const code = rawCode.trim().toUpperCase();

  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return Response.json({ error: "邀请码格式不正确" }, { status: 400 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = finalNoteSchema.safeParse(payload);

  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const { data: event, error: eventError } = await getEvent(code);

  if (eventError) return serverError();
  if (!event) {
    return Response.json({ error: "事件不存在或已经删除" }, { status: 404 });
  }
  if (event.creator_identity_id !== parsed.data.identityId) {
    return Response.json(
      { error: "只有事件创建者可以修改最终安排说明" },
      { status: 403 },
    );
  }
  if (!event.final_date) {
    return Response.json({ error: "请先确定时间方案" }, { status: 409 });
  }
  if (event.status !== "active") {
    return Response.json({ error: "这个事件已经关闭" }, { status: 409 });
  }

  const finalNote = parsed.data.content || null;
  const { error: updateError } = await supabaseAdmin
    .from("events")
    .update({ final_note: finalNote })
    .eq("id", event.id)
    .eq("creator_identity_id", parsed.data.identityId);

  if (updateError) {
    return serverError("保存补充说明失败，请确认数据库更新已完成");
  }

  return Response.json({ finalNote });
}

async function clearOppositeNotification(
  eventId: string,
  type: "final_time" | "final_time_cancelled",
) {
  await supabaseAdmin
    .from("identity_notifications")
    .delete()
    .eq("source_event_id", eventId)
    .eq("notification_type", type);
}

export async function PUT(
  request: Request,
  context: RouteContext<"/api/events/[code]/final-time">,
) {
  const { code: rawCode } = await context.params;
  const code = rawCode.trim().toUpperCase();

  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return Response.json({ error: "邀请码格式不正确" }, { status: 400 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = finalTimeSchema.safeParse(payload);

  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const { data: event, error: eventError } = await getEvent(code);

  if (eventError) return serverError();
  if (!event) {
    return Response.json({ error: "事件不存在或已经删除" }, { status: 404 });
  }
  if (event.creator_identity_id !== parsed.data.identityId) {
    return Response.json(
      { error: "只有事件创建者可以确认时间方案" },
      { status: 403 },
    );
  }
  if (isExpiredOneTimeEvent(event)) {
    await deleteExpiredEvent(event);
    return Response.json({ error: "这个一次性事件已经过期" }, { status: 410 });
  }
  if (event.status !== "active") {
    return Response.json({ error: "这个事件已经关闭" }, { status: 409 });
  }

  const eventEnd = addDaysToDateString(event.start_date, 6);
  const sortedPeriods = [...parsed.data.periods].sort(
    (first, second) =>
      first.date.localeCompare(second.date) ||
      first.startHour - second.startHour ||
      first.endHour - second.endHour,
  );
  const normalizedPeriods: typeof sortedPeriods = [];

  for (const period of sortedPeriods) {
    const validHours = Array.from(
      { length: period.endHour - period.startHour },
      (_, index) => period.startHour + index,
    ).every((hour) => isValidEventHour(period.date, hour));
    if (
      period.date < event.start_date ||
      (event.event_type === "one_time" && period.date > eventEnd) ||
      !validHours
    ) {
      return Response.json(
        { error: "最终时间段不在事件范围内" },
        { status: 400 },
      );
    }
    if (isPastSlot(period.date, period.startHour, event.time_zone)) {
      return Response.json(
        { error: "不能确认已经过去的时间" },
        { status: 409 },
      );
    }

    const previous = normalizedPeriods.at(-1);
    if (
      previous &&
      previous.date === period.date &&
      period.startHour <= previous.endHour
    ) {
      previous.endHour = Math.max(previous.endHour, period.endHour);
    } else {
      normalizedPeriods.push({ ...period });
    }
  }

  const finalizedAt = new Date().toISOString();
  const { error: deletePeriodsError } = await supabaseAdmin
    .from("event_final_periods")
    .delete()
    .eq("event_id", event.id);

  if (deletePeriodsError) {
    return serverError("保存时间方案失败，请确认数据库更新已完成");
  }

  const { data: savedPeriods, error: insertPeriodsError } = await supabaseAdmin
    .from("event_final_periods")
    .insert(
      normalizedPeriods.map((period) => ({
        event_id: event.id,
        slot_date: period.date,
        start_hour: period.startHour,
        end_hour: period.endHour,
      })),
    )
    .select("id, slot_date, start_hour, end_hour");

  if (insertPeriodsError || !savedPeriods) {
    return serverError("保存时间方案失败，请稍后重试");
  }

  const firstPeriod = normalizedPeriods[0];
  const { error: updateError } = await supabaseAdmin
    .from("events")
    .update({
      final_date: firstPeriod.date,
      final_start_hour: firstPeriod.startHour,
      finalized_at: finalizedAt,
    })
    .eq("id", event.id)
    .eq("creator_identity_id", parsed.data.identityId);

  if (updateError) {
    return serverError("保存时间方案失败，请稍后重试");
  }

  try {
    await clearOppositeNotification(event.id, "final_time_cancelled");
    await notifyEventMembers(event, "final_time");
  } catch (error) {
    console.error("Unable to notify members about final time", error);
  }

  return Response.json({
    finalTime: {
      date: firstPeriod.date,
      startHour: firstPeriod.startHour,
      finalizedAt,
    },
    finalPeriods: savedPeriods
      .map((period) => ({
        id: period.id,
        date: period.slot_date,
        startHour: period.start_hour,
        endHour: period.end_hour,
      }))
      .sort(
        (first, second) =>
          first.date.localeCompare(second.date) ||
          first.startHour - second.startHour,
      ),
  });
}

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/events/[code]/final-time">,
) {
  const { code: rawCode } = await context.params;
  const code = rawCode.trim().toUpperCase();

  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return Response.json({ error: "邀请码格式不正确" }, { status: 400 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = identitySchema.safeParse(payload);

  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const { data: event, error: eventError } = await getEvent(code);

  if (eventError) return serverError();
  if (!event) {
    return Response.json({ error: "事件不存在或已经删除" }, { status: 404 });
  }
  if (event.creator_identity_id !== parsed.data.identityId) {
    return Response.json(
      { error: "只有事件创建者可以取消时间方案" },
      { status: 403 },
    );
  }

  const { error: updateError } = await supabaseAdmin
    .from("events")
    .update({
      final_date: null,
      final_start_hour: null,
      finalized_at: null,
    })
    .eq("id", event.id)
    .eq("creator_identity_id", parsed.data.identityId);

  if (updateError) {
    return serverError("取消时间方案失败，请稍后重试");
  }

  await supabaseAdmin
    .from("event_final_periods")
    .delete()
    .eq("event_id", event.id);

  await supabaseAdmin
    .from("events")
    .update({ final_note: null })
    .eq("id", event.id)
    .eq("creator_identity_id", parsed.data.identityId);

  try {
    await clearOppositeNotification(event.id, "final_time");
    await notifyEventMembers(event, "final_time_cancelled");
  } catch (error) {
    console.error("Unable to notify members about cancelled final time", error);
  }

  return Response.json({ ok: true });
}
