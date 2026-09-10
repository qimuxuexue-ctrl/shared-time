import { z } from "zod";

import {
  addDaysToDateString,
  getDateStringInTimeZone,
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

const updateTimeZoneSchema = z.object({
  identityId: z.uuid("身份 ID 不正确"),
  timeZone: z.enum(["Asia/Bangkok", "Asia/Shanghai", "Asia/Tokyo"]),
});

const updateTravelDatesSchema = z.object({
  identityId: z.uuid("身份 ID 不正确"),
  startDate: z.string().refine(isValidDateString, "开始日期不正确"),
  endDate: z.string().refine(isValidDateString, "结束日期不正确"),
}).refine((value) => value.endDate >= value.startDate, {
  message: "结束日期不能早于开始日期",
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
    .select("*")
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

  const currentWeekStart = getMondayDateString(
    getDateStringInTimeZone(event.time_zone),
  );
  const requestedWeekStart = parsed.data.weekStart ?? currentWeekStart;
  const rangeStart =
    event.workspace_kind === "travel_plan"
      ? getMondayDateString(event.start_date)
      : event.start_date;
  const rangeEnd =
    event.workspace_kind === "travel_plan" && event.end_date
      ? getMondayDateString(event.end_date)
      : null;
  const weekStart = requestedWeekStart < rangeStart
    ? rangeStart
    : rangeEnd && requestedWeekStart > rangeEnd
      ? rangeEnd
      : event.event_type === "one_time" && requestedWeekStart > event.start_date
        ? event.start_date
        : requestedWeekStart;

  const weekEnd = addDaysToDateString(weekStart, 6);
  const [
    { data: members, error: membersError },
    { data: slots, error: slotsError },
    { data: notes, error: notesError },
    { data: finalPeriods },
    { data: itinerary, error: itineraryError },
    { data: stays, error: staysError },
    { data: journeys, error: journeysError },
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
      supabaseAdmin
        .from("event_final_periods")
        .select("id, slot_date, start_hour, end_hour")
        .eq("event_id", event.id)
        .order("slot_date", { ascending: true })
        .order("start_hour", { ascending: true }),
      supabaseAdmin
        .from("travel_itinerary_items")
        .select("id, member_id, trip_date, start_hour, end_hour, title, note, place_name, address, latitude, longitude, transport_mode, transport_duration_minutes, transport_note, created_at")
        .eq("event_id", event.id)
        .order("trip_date", { ascending: true })
        .order("start_hour", { ascending: true }),
      supabaseAdmin
        .from("travel_stays")
        .select("id, name, check_in_date, check_out_date, check_in_time, check_out_time, address, hotel_url, note")
        .eq("event_id", event.id)
        .order("check_in_date", { ascending: true }),
      supabaseAdmin
        .from("travel_journeys")
        .select("id, direction, mode, journey_date, departure_time, arrival_time, origin, destination, reference, note")
        .eq("event_id", event.id)
        .order("journey_date", { ascending: true }),
    ]);

  if (membersError || slotsError || notesError || itineraryError || staysError || journeysError) {
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
      endDate: event.end_date ?? null,
      weeksAhead: event.weeks_ahead,
      workspaceKind: event.workspace_kind ?? "share_time",
      eventType: event.event_type,
      timeZone: event.time_zone,
      finalTime:
        event.final_date !== null &&
        event.final_start_hour !== null &&
        event.finalized_at !== null
          ? {
              date: event.final_date,
              startHour: event.final_start_hour,
              finalizedAt: event.finalized_at,
            }
          : null,
      finalPeriods:
        finalPeriods && finalPeriods.length > 0
          ? finalPeriods.map((period) => ({
              id: period.id,
              date: period.slot_date,
              startHour: period.start_hour,
              endHour: period.end_hour,
            }))
          : event.final_date !== null && event.final_start_hour !== null
            ? [
                {
                  date: event.final_date,
                  startHour: event.final_start_hour,
                  endHour: event.final_start_hour + 1,
                },
              ]
            : [],
      finalNote:
        (event as { final_note?: string | null }).final_note?.trim() || null,
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
    itinerary: (itinerary ?? []).flatMap((item) => {
      const author = membersById.get(item.member_id);
      return author
        ? [{
            id: item.id,
            memberId: item.member_id,
            authorTagName: author.tag_name,
            authorTagColor: author.tag_color,
            date: item.trip_date,
            startHour: item.start_hour,
            endHour: item.end_hour,
            title: item.title,
            note: item.note,
            placeName: item.place_name,
            address: item.address,
            latitude: item.latitude,
            longitude: item.longitude,
            transportMode: item.transport_mode ?? null,
            transportDurationMinutes: item.transport_duration_minutes ?? null,
            transportNote: item.transport_note ?? null,
            createdAt: item.created_at,
          }]
        : [];
    }),
    stays: (stays ?? []).map((stay) => ({
      id: stay.id,
      name: stay.name,
      checkInDate: stay.check_in_date,
      checkOutDate: stay.check_out_date,
      checkInTime: stay.check_in_time,
      checkOutTime: stay.check_out_time,
      address: stay.address,
      hotelUrl: stay.hotel_url,
      note: stay.note,
    })),
    journeys: (journeys ?? []).map((journey) => ({
      id: journey.id,
      direction: journey.direction,
      mode: journey.mode,
      date: journey.journey_date,
      departureTime: journey.departure_time,
      arrivalTime: journey.arrival_time,
      origin: journey.origin,
      destination: journey.destination,
      reference: journey.reference,
      note: journey.note,
    })),
    availability: (slots ?? []).map((slot) => ({
      memberId: slot.member_id,
      date: slot.slot_date,
      startHour: slot.start_hour,
    })),
  });
}

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/events/[code]">,
) {
  const { code: rawCode } = await context.params;
  const code = rawCode.trim().toUpperCase();

  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return Response.json({ error: "邀请码格式不正确" }, { status: 400 });
  }

  const payload = await request.json().catch(() => null);
  const timeZoneUpdate = updateTimeZoneSchema.safeParse(payload);
  const travelDatesUpdate = updateTravelDatesSchema.safeParse(payload);

  if (!timeZoneUpdate.success && !travelDatesUpdate.success) {
    return validationError(
      "timeZone" in (payload ?? {}) ? timeZoneUpdate.error : travelDatesUpdate.error,
    );
  }

  const identityId = timeZoneUpdate.success
    ? timeZoneUpdate.data.identityId
    : travelDatesUpdate.success
      ? travelDatesUpdate.data.identityId
      : "";

  const { data: event, error: eventError } = await supabaseAdmin
    .from("events")
    .select("id, creator_identity_id, workspace_kind")
    .eq("share_code", code)
    .maybeSingle<{ id: string; creator_identity_id: string; workspace_kind: string }>();

  if (eventError) {
    return serverError();
  }

  if (!event) {
    return Response.json({ error: "事件不存在或已经删除" }, { status: 404 });
  }

  if (event.creator_identity_id !== identityId) {
    return Response.json(
      { error: "只有事件创建者可以修改事件设置" },
      { status: 403 },
    );
  }

  if (travelDatesUpdate.success) {
    if (event.workspace_kind !== "travel_plan") {
      return Response.json({ error: "只有旅行计划可以修改旅行日期" }, { status: 409 });
    }

    const { data: itinerary, error: itineraryError } = await supabaseAdmin
      .from("travel_itinerary_items")
      .select("trip_date")
      .eq("event_id", event.id);
    if (itineraryError) return serverError();
    const hasOutsideItem = (itinerary ?? []).some(
      (item) => item.trip_date < travelDatesUpdate.data.startDate
        || item.trip_date > travelDatesUpdate.data.endDate,
    );
    if (hasOutsideItem) {
      return Response.json({
        error: "新的日期范围会排除已有行程，请先移动或删除范围外的行程",
      }, { status: 409 });
    }

    const { data: updatedEvent, error: updateError } = await supabaseAdmin
      .from("events")
      .update({
        start_date: travelDatesUpdate.data.startDate,
        end_date: travelDatesUpdate.data.endDate,
      })
      .eq("id", event.id)
      .eq("creator_identity_id", identityId)
      .select("start_date, end_date")
      .single<{ start_date: string; end_date: string }>();
    if (updateError || !updatedEvent) {
      return serverError("修改旅行日期失败，请稍后重试");
    }
    return Response.json({
      startDate: updatedEvent.start_date,
      endDate: updatedEvent.end_date,
    });
  }

  if (!timeZoneUpdate.success) return validationError(timeZoneUpdate.error);

  const { data: updatedEvent, error: updateError } = await supabaseAdmin
    .from("events")
    .update({ time_zone: timeZoneUpdate.data.timeZone })
    .eq("id", event.id)
    .eq("creator_identity_id", identityId)
    .select("time_zone")
    .single<{ time_zone: "Asia/Bangkok" | "Asia/Shanghai" | "Asia/Tokyo" }>();

  if (updateError || !updatedEvent) {
    return serverError("修改时区失败，请稍后重试");
  }

  return Response.json({ timeZone: updatedEvent.time_zone });
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
