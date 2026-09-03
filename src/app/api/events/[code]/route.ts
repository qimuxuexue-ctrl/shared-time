import { z } from "zod";

import {
  addDaysToDateString,
  getBeijingDateString,
  getMondayDateString,
  isValidDateString,
} from "@/lib/dates";
import {
  deleteExpiredEvent,
  isExpiredOneTimeEvent,
  notifyEventMembers,
} from "@/lib/events";
import { serverError, validationError } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase/admin";

const querySchema = z.object({
  identityId: z.uuid("身份 ID 不正确"),
  weekStart: z
    .string()
    .refine(isValidDateString, "周起始日期不正确")
    .optional(),
});

const deleteSchema = z.object({
  identityId: z.uuid("身份 ID 不正确"),
});

export async function GET(
  request: Request,
  context: RouteContext<"/api/events/[code]">,
) {
  const { code: rawCode } = await context.params;
  const code = rawCode.trim().toUpperCase();

  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return Response.json({ error: "邀请码格式不正确" }, { status: 400 });
  }

  const searchParams = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    identityId: searchParams.get("identityId"),
    weekStart: searchParams.get("weekStart") ?? undefined,
  });

  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const { data: event, error: eventError } = await supabaseAdmin
    .from("events")
    .select(
      "id, share_code, name, start_date, weeks_ahead, event_type, status, creator_identity_id, created_at",
    )
    .eq("share_code", code)
    .maybeSingle();

  if (eventError) {
    return serverError();
  }

  if (!event) {
    return Response.json({ error: "事件不存在" }, { status: 404 });
  }

  if (isExpiredOneTimeEvent(event)) {
    await deleteExpiredEvent(event);
    return Response.json({ error: "这个一次性事件已经过期" }, { status: 410 });
  }

  const { data: currentMember, error: memberError } = await supabaseAdmin
    .from("event_members")
    .select("id")
    .eq("event_id", event.id)
    .eq("identity_id", parsed.data.identityId)
    .maybeSingle<{ id: string }>();

  if (memberError) {
    return serverError();
  }

  if (!currentMember) {
    return Response.json(
      { error: "你还没有加入这个事件" },
      { status: 403 },
    );
  }

  const currentWeekStart = getMondayDateString(getBeijingDateString());
  const requestedWeekStart = parsed.data.weekStart ?? currentWeekStart;
  const weekStart =
    requestedWeekStart < event.start_date
      ? event.start_date
      : event.event_type === "one_time" && requestedWeekStart > event.start_date
        ? event.start_date
        : requestedWeekStart;

  const weekEnd = addDaysToDateString(weekStart, 6);
  const [
    { data: members, error: membersError },
    { data: slots, error: slotsError },
    { data: notes, error: notesError },
  ] =
    await Promise.all([
      supabaseAdmin
        .from("event_members")
        .select("id, identity_id, tag_name, tag_color")
        .eq("event_id", event.id)
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("availabilities")
        .select("member_id, slot_date, start_hour")
        .eq("event_id", event.id)
        .gte("slot_date", weekStart)
        .lte("slot_date", weekEnd),
      supabaseAdmin
        .from("event_notes")
        .select("id, member_id, content, updated_at")
        .eq("event_id", event.id)
        .order("created_at", { ascending: true }),
    ]);

  if (membersError || slotsError || notesError) {
    return serverError();
  }

  const memberList = members ?? [];
  const membersById = new Map(memberList.map((member) => [member.id, member]));

  return Response.json({
    event: {
      id: event.id,
      shareCode: event.share_code,
      name: event.name,
      startDate: event.start_date,
      weeksAhead: event.weeks_ahead,
      eventType: event.event_type,
      status: event.status,
      createdAt: event.created_at,
      isCreator: event.creator_identity_id === parsed.data.identityId,
    },
    currentMemberId: currentMember.id,
    weekStart,
    members: memberList.map((member) => ({
      id: member.id,
      identityId: member.identity_id,
      tagName: member.tag_name,
      tagColor: member.tag_color,
      isCurrent: member.id === currentMember.id,
    })),
    notes: (notes ?? []).flatMap((note) => {
      const author = membersById.get(note.member_id);
      return author
        ? [
            {
              id: note.id,
              memberId: note.member_id,
              authorTagName: author.tag_name,
              authorTagColor: author.tag_color,
              content: note.content,
              isCurrent: note.member_id === currentMember.id,
              updatedAt: note.updated_at,
            },
          ]
        : [];
    }),
    availability: (slots ?? []).map((slot) => ({
      memberId: slot.member_id,
      date: slot.slot_date,
      startHour: slot.start_hour,
    })),
  });
}

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/events/[code]">,
) {
  const { code: rawCode } = await context.params;
  const code = rawCode.trim().toUpperCase();

  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return Response.json({ error: "邀请码格式不正确" }, { status: 400 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = deleteSchema.safeParse(payload);

  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const { data: event, error: eventError } = await supabaseAdmin
    .from("events")
    .select("id, share_code, name, creator_identity_id")
    .eq("share_code", code)
    .maybeSingle<{
      id: string;
      share_code: string;
      name: string;
      creator_identity_id: string;
    }>();

  if (eventError) {
    return serverError();
  }

  if (!event) {
    return Response.json({ error: "事件不存在或已经删除" }, { status: 404 });
  }

  if (event.creator_identity_id !== parsed.data.identityId) {
    return Response.json(
      { error: "只有事件创建者可以删除这个事件" },
      { status: 403 },
    );
  }

  try {
    await notifyEventMembers(event, "event_deleted");
  } catch (error) {
    console.error("Unable to notify members about deleted event", error);
  }

  const { error: deleteError } = await supabaseAdmin
    .from("events")
    .delete()
    .eq("id", event.id)
    .eq("creator_identity_id", parsed.data.identityId);

  if (deleteError) {
    return serverError("删除事件失败，请稍后重试");
  }

  return Response.json({ ok: true });
}
