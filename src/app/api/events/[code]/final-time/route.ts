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

const finalTimeSchema = identitySchema.extend({
  date: z.string().refine(isValidDateString, "日期不正确"),
  startHour: z.number().int().min(10).max(23),
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
    return Response.json({ error: "请先确定最终时间" }, { status: 409 });
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
      { error: "只有事件创建者可以确认最终时间" },
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
  if (
    parsed.data.date < event.start_date ||
    (event.event_type === "one_time" && parsed.data.date > eventEnd) ||
    !isValidEventHour(parsed.data.date, parsed.data.startHour)
  ) {
    return Response.json({ error: "最终时间不在事件范围内" }, { status: 400 });
  }
  if (
    isPastSlot(
      parsed.data.date,
      parsed.data.startHour,
      event.time_zone,
    )
  ) {
    return Response.json({ error: "不能确认已经过去的时间" }, { status: 409 });
  }

  const finalizedAt = new Date().toISOString();
  const { error: updateError } = await supabaseAdmin
    .from("events")
    .update({
      final_date: parsed.data.date,
      final_start_hour: parsed.data.startHour,
      finalized_at: finalizedAt,
    })
    .eq("id", event.id)
    .eq("creator_identity_id", parsed.data.identityId);

  if (updateError) {
    return serverError("确认最终时间失败，请稍后重试");
  }

  try {
    await clearOppositeNotification(event.id, "final_time_cancelled");
    await notifyEventMembers(event, "final_time");
  } catch (error) {
    console.error("Unable to notify members about final time", error);
  }

  return Response.json({
    finalTime: {
      date: parsed.data.date,
      startHour: parsed.data.startHour,
      finalizedAt,
    },
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
      { error: "只有事件创建者可以取消最终时间" },
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
    return serverError("取消最终时间失败，请稍后重试");
  }

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
