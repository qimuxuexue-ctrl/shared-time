import { z } from "zod";

import { isValidDateString } from "@/lib/dates";
import { serverError, validationError } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase/admin";

const itemFields = {
  identityId: z.uuid("身份 ID 不正确"),
  date: z.string().refine(isValidDateString, "行程日期不正确"),
  startHour: z.number().int().min(10).max(23),
  endHour: z.number().int().min(11).max(24),
  title: z.string().trim().min(1, "请输入行程标题").max(80, "标题最多 80 个字符"),
  note: z.string().trim().max(300, "备注最多 300 个字符").default(""),
  placeName: z.string().trim().min(1, "请选择地点").max(120),
  address: z.string().trim().max(300).default(""),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
};

const createSchema = z.object(itemFields).refine(
  (value) => value.endHour > value.startHour,
  { message: "结束时间必须晚于开始时间" },
);
const updateSchema = z.object({ itemId: z.uuid("行程 ID 不正确"), ...itemFields }).refine(
  (value) => value.endHour > value.startHour,
  { message: "结束时间必须晚于开始时间" },
);
const deleteSchema = z.object({
  identityId: z.uuid("身份 ID 不正确"),
  itemId: z.uuid("行程 ID 不正确"),
});

const transportSchema = z.object({
  identityId: z.uuid("身份 ID 不正确"),
  itemId: z.uuid("行程 ID 不正确"),
  transportMode: z.string().trim().min(1).max(40).nullable(),
  transportDurationMinutes: z.number().int().min(1).max(1440).nullable(),
  transportNote: z.string().trim().max(160).nullable(),
});

const moveSchema = z.object({
  identityId: z.uuid("身份 ID 不正确"),
  itemId: z.uuid("行程 ID 不正确"),
  date: z.string().refine(isValidDateString, "行程日期不正确"),
  startHour: z.number().int().min(10).max(23),
  endHour: z.number().int().min(11).max(24),
}).refine((value) => value.endHour > value.startHour, {
  message: "结束时间必须晚于开始时间",
});

async function getContext(code: string, identityId: string) {
  const { data: event, error: eventError } = await supabaseAdmin
    .from("events")
    .select("id, workspace_kind, start_date, end_date, status")
    .eq("share_code", code)
    .maybeSingle();
  if (eventError || !event) return null;

  const { data: member, error: memberError } = await supabaseAdmin
    .from("event_members")
    .select("id, tag_name, tag_color")
    .eq("event_id", event.id)
    .eq("identity_id", identityId)
    .maybeSingle();
  if (memberError || !member) return null;
  return { event, member };
}

function validateContext(
  context: Awaited<ReturnType<typeof getContext>>,
  date?: string,
) {
  if (!context) return Response.json({ error: "事件不存在或你尚未加入" }, { status: 403 });
  if (context.event.workspace_kind !== "travel_plan") {
    return Response.json({ error: "只有旅行计划可以添加行程" }, { status: 409 });
  }
  if (context.event.status !== "active") {
    return Response.json({ error: "这个旅行计划已经关闭" }, { status: 409 });
  }
  if (date && (date < context.event.start_date || date > context.event.end_date)) {
    return Response.json({ error: "行程时间必须在旅行日期内" }, { status: 400 });
  }
  return null;
}

function mapItem(item: Record<string, unknown>, context: NonNullable<Awaited<ReturnType<typeof getContext>>>) {
  return {
    id: item.id,
    memberId: item.member_id,
    authorTagName: context.member.tag_name,
    authorTagColor: context.member.tag_color,
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
  };
}

export async function PATCH(request: Request, route: RouteContext<"/api/events/[code]/itinerary">) {
  const { code: rawCode } = await route.params;
  const code = rawCode.trim().toUpperCase();
  const payload = await request.json().catch(() => null);
  const transportUpdate = transportSchema.safeParse(payload);
  const moveUpdate = moveSchema.safeParse(payload);
  if (!transportUpdate.success && !moveUpdate.success) {
    return validationError("date" in (payload ?? {}) ? moveUpdate.error : transportUpdate.error);
  }
  const identityId = moveUpdate.success
    ? moveUpdate.data.identityId
    : transportUpdate.success
      ? transportUpdate.data.identityId
      : "";

  const context = await getContext(code, identityId);
  const contextError = validateContext(context, moveUpdate.success ? moveUpdate.data.date : undefined);
  if (contextError || !context) return contextError!;

  if (moveUpdate.success) {
    const { data: item, error } = await supabaseAdmin
      .from("travel_itinerary_items")
      .update({
        trip_date: moveUpdate.data.date,
        start_hour: moveUpdate.data.startHour,
        end_hour: moveUpdate.data.endHour,
      })
      .eq("id", moveUpdate.data.itemId)
      .eq("event_id", context.event.id)
      .select("id, trip_date, start_hour, end_hour")
      .maybeSingle();
    if (error) return serverError("移动行程失败，请稍后重试");
    if (!item) return Response.json({ error: "找不到这条行程" }, { status: 404 });
    return Response.json({
      itemId: item.id,
      date: item.trip_date,
      startHour: item.start_hour,
      endHour: item.end_hour,
    });
  }

  if (!transportUpdate.success) return validationError(transportUpdate.error);

  const { data: item, error } = await supabaseAdmin
    .from("travel_itinerary_items")
    .update({
      transport_mode: transportUpdate.data.transportMode,
      transport_duration_minutes: transportUpdate.data.transportDurationMinutes,
      transport_note: transportUpdate.data.transportNote,
    })
    .eq("id", transportUpdate.data.itemId)
    .eq("event_id", context.event.id)
    .select("id, transport_mode, transport_duration_minutes, transport_note")
    .maybeSingle();
  if (error) return serverError("保存交通信息失败，请稍后重试");
  if (!item) return Response.json({ error: "找不到这条行程" }, { status: 404 });
  return Response.json({
    itemId: item.id,
    transportMode: item.transport_mode ?? null,
    transportDurationMinutes: item.transport_duration_minutes ?? null,
    transportNote: item.transport_note ?? null,
  });
}

export async function POST(request: Request, route: RouteContext<"/api/events/[code]/itinerary">) {
  const { code: rawCode } = await route.params;
  const code = rawCode.trim().toUpperCase();
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);

  const context = await getContext(code, parsed.data.identityId);
  const contextError = validateContext(context, parsed.data.date);
  if (contextError || !context) return contextError!;

  const { data: item, error } = await supabaseAdmin
    .from("travel_itinerary_items")
    .insert({
      event_id: context.event.id,
      member_id: context.member.id,
      trip_date: parsed.data.date,
      start_hour: parsed.data.startHour,
      end_hour: parsed.data.endHour,
      title: parsed.data.title,
      note: parsed.data.note,
      place_name: parsed.data.placeName,
      address: parsed.data.address,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
    })
    .select("*")
    .single();
  if (error || !item) return serverError("保存行程失败，请稍后重试");
  return Response.json({ item: mapItem(item, context) }, { status: 201 });
}

export async function PUT(request: Request, route: RouteContext<"/api/events/[code]/itinerary">) {
  const { code: rawCode } = await route.params;
  const code = rawCode.trim().toUpperCase();
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);

  const context = await getContext(code, parsed.data.identityId);
  const contextError = validateContext(context, parsed.data.date);
  if (contextError || !context) return contextError!;

  const { data: item, error } = await supabaseAdmin
    .from("travel_itinerary_items")
    .update({
      member_id: context.member.id,
      trip_date: parsed.data.date,
      start_hour: parsed.data.startHour,
      end_hour: parsed.data.endHour,
      title: parsed.data.title,
      note: parsed.data.note,
      place_name: parsed.data.placeName,
      address: parsed.data.address,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
    })
    .eq("id", parsed.data.itemId)
    .eq("event_id", context.event.id)
    .select("*")
    .maybeSingle();
  if (error) return serverError("更新行程失败，请稍后重试");
  if (!item) return Response.json({ error: "找不到这条行程" }, { status: 404 });
  return Response.json({ item: mapItem(item, context) });
}

export async function DELETE(request: Request, route: RouteContext<"/api/events/[code]/itinerary">) {
  const { code: rawCode } = await route.params;
  const code = rawCode.trim().toUpperCase();
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);

  const context = await getContext(code, parsed.data.identityId);
  const contextError = validateContext(context);
  if (contextError || !context) return contextError!;

  const { error, count } = await supabaseAdmin
    .from("travel_itinerary_items")
    .delete({ count: "exact" })
    .eq("id", parsed.data.itemId)
    .eq("event_id", context.event.id);
  if (error) return serverError("删除行程失败，请稍后重试");
  if (!count) return Response.json({ error: "找不到这条行程" }, { status: 404 });
  return Response.json({ ok: true });
}
