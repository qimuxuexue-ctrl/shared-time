import { z } from "zod";

import {
  addDaysToDateString,
  isPastSlot,
  isValidDateString,
  isValidEventHour,
} from "@/lib/dates";
import { isExpiredOneTimeEvent } from "@/lib/events";
import { serverError, validationError } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase/admin";

const updateAvailabilitySchema = z.object({
  identityId: z.uuid("身份 ID 不正确"),
  updates: z
    .array(
      z.object({
        date: z.string().refine(isValidDateString, "日期不正确"),
        startHour: z.number().int().min(0).max(23),
        available: z.boolean(),
      }),
    )
    .min(1)
    .max(100),
});

export async function PUT(
  request: Request,
  context: RouteContext<"/api/events/[code]/availability">,
) {
  const { code: rawCode } = await context.params;
  const code = rawCode.trim().toUpperCase();

  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return Response.json({ error: "邀请码格式不正确" }, { status: 400 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = updateAvailabilitySchema.safeParse(payload);

  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const { data: event, error: eventError } = await supabaseAdmin
    .from("events")
    .select("id, start_date, event_type, status")
    .eq("share_code", code)
    .maybeSingle();

  if (eventError) {
    return serverError();
  }

  if (!event) {
    return Response.json({ error: "事件不存在" }, { status: 404 });
  }

  if (isExpiredOneTimeEvent(event)) {
    await supabaseAdmin.from("events").delete().eq("id", event.id);
    return Response.json({ error: "这个一次性事件已经过期" }, { status: 410 });
  }

  if (event.status !== "active") {
    return Response.json({ error: "这个事件已经关闭" }, { status: 409 });
  }

  const { data: member, error: memberError } = await supabaseAdmin
    .from("event_members")
    .select("id")
    .eq("event_id", event.id)
    .eq("identity_id", parsed.data.identityId)
    .maybeSingle<{ id: string }>();

  if (memberError) {
    return serverError();
  }

  if (!member) {
    return Response.json({ error: "你还没有加入这个事件" }, { status: 403 });
  }

  const oneTimeEventEnd = addDaysToDateString(event.start_date, 6);

  for (const update of parsed.data.updates) {
    if (
      update.date < event.start_date ||
      (event.event_type === "one_time" && update.date > oneTimeEventEnd) ||
      !isValidEventHour(update.date, update.startHour)
    ) {
      return Response.json({ error: "包含无效的时间格" }, { status: 400 });
    }

    if (isPastSlot(update.date, update.startHour)) {
      return Response.json({ error: "过去的时间不能修改" }, { status: 409 });
    }
  }

  const additions = parsed.data.updates.filter((update) => update.available);
  const removals = parsed.data.updates.filter((update) => !update.available);

  if (additions.length > 0) {
    const { error } = await supabaseAdmin.from("availabilities").upsert(
      additions.map((update) => ({
        event_id: event.id,
        member_id: member.id,
        slot_date: update.date,
        start_hour: update.startHour,
      })),
      { onConflict: "member_id,slot_date,start_hour" },
    );

    if (error) {
      return serverError("保存空闲时间失败");
    }
  }

  if (removals.length > 0) {
    const results = await Promise.all(
      removals.map((update) =>
        supabaseAdmin
          .from("availabilities")
          .delete()
          .eq("member_id", member.id)
          .eq("slot_date", update.date)
          .eq("start_hour", update.startHour),
      ),
    );

    if (results.some((result) => result.error)) {
      return serverError("保存空闲时间失败");
    }
  }

  return Response.json({ ok: true });
}
