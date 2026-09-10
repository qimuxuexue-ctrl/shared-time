import { z } from "zod";

import { isValidDateString } from "@/lib/dates";
import { serverError, validationError } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase/admin";

const baseSchema = z.object({
  identityId: z.uuid("身份 ID 不正确"),
});

const staySchema = baseSchema.extend({
  kind: z.literal("stay"),
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "请输入住宿名称").max(100),
  checkInDate: z.string().refine(isValidDateString, "入住日期不正确"),
  checkOutDate: z.string().refine(isValidDateString, "退房日期不正确"),
  checkInTime: z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/, "入住时间不正确").default(""),
  checkOutTime: z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/, "退房时间不正确").default(""),
  address: z.string().trim().max(240).default(""),
  hotelUrl: z.string().trim().max(1000, "酒店页面链接过长").refine((value) => !value || /^https?:\/\//i.test(value), "请输入以 http:// 或 https:// 开头的链接").default(""),
  note: z.string().trim().max(300).default(""),
}).refine((value) => value.checkOutDate >= value.checkInDate, {
  message: "退房日期不能早于入住日期",
});

const journeySchema = baseSchema.extend({
  kind: z.literal("journey"),
  id: z.uuid().optional(),
  direction: z.enum(["outbound", "return"]),
  mode: z.string().trim().min(1, "请选择交通方式").max(40),
  date: z.string().refine(isValidDateString, "出行日期不正确"),
  departureTime: z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/, "出发时间不正确"),
  arrivalTime: z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/, "到达时间不正确"),
  origin: z.string().trim().min(1, "请输入出发地").max(100),
  destination: z.string().trim().min(1, "请输入目的地").max(100),
  reference: z.string().trim().max(80).default(""),
  note: z.string().trim().max(240).default(""),
});

const deleteSchema = baseSchema.extend({
  kind: z.enum(["stay", "journey"]),
  id: z.uuid("记录 ID 不正确"),
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
    .select("id")
    .eq("event_id", event.id)
    .eq("identity_id", identityId)
    .maybeSingle();
  if (memberError || !member) return null;
  return { event, member };
}

function contextError(context: Awaited<ReturnType<typeof getContext>>) {
  if (!context) return Response.json({ error: "事件不存在或你尚未加入" }, { status: 403 });
  if (context.event.workspace_kind !== "travel_plan") return Response.json({ error: "只有旅行计划可以使用此功能" }, { status: 409 });
  if (context.event.status !== "active") return Response.json({ error: "这个旅行计划已经关闭" }, { status: 409 });
  return null;
}

function mapStay(row: Record<string, unknown>) {
  return { id: row.id, name: row.name, checkInDate: row.check_in_date, checkOutDate: row.check_out_date, checkInTime: row.check_in_time, checkOutTime: row.check_out_time, address: row.address, hotelUrl: row.hotel_url, note: row.note };
}

function mapJourney(row: Record<string, unknown>) {
  return { id: row.id, direction: row.direction, mode: row.mode, date: row.journey_date, departureTime: row.departure_time, arrivalTime: row.arrival_time, origin: row.origin, destination: row.destination, reference: row.reference, note: row.note };
}

export async function PUT(request: Request, route: RouteContext<"/api/events/[code]/travel-details">) {
  const { code: rawCode } = await route.params;
  const code = rawCode.trim().toUpperCase();
  const payload = await request.json().catch(() => null);
  const parsedStay = staySchema.safeParse(payload);
  const parsedJourney = journeySchema.safeParse(payload);
  if (!parsedStay.success && !parsedJourney.success) return validationError(payload?.kind === "journey" ? parsedJourney.error : parsedStay.error);

  const identityId = parsedJourney.success ? parsedJourney.data.identityId : parsedStay.success ? parsedStay.data.identityId : "";
  const context = await getContext(code, identityId);
  const invalid = contextError(context);
  if (invalid || !context) return invalid!;

  if (parsedStay.success) {
    const data = parsedStay.data;
    if (data.checkInDate < context.event.start_date || data.checkOutDate > context.event.end_date) {
      return Response.json({ error: "住宿日期必须在旅行日期内" }, { status: 400 });
    }
    const values = { event_id: context.event.id, member_id: context.member.id, name: data.name, check_in_date: data.checkInDate, check_out_date: data.checkOutDate, check_in_time: data.checkInTime, check_out_time: data.checkOutTime, address: data.address, hotel_url: data.hotelUrl, note: data.note };
    const query = data.id
      ? supabaseAdmin.from("travel_stays").update(values).eq("id", data.id).eq("event_id", context.event.id)
      : supabaseAdmin.from("travel_stays").insert(values);
    const { data: row, error } = await query.select("*").maybeSingle();
    if (error) return serverError("保存住宿失败，请稍后重试");
    if (!row) return Response.json({ error: "找不到这条住宿" }, { status: 404 });
    return Response.json({ stay: mapStay(row) });
  }

  if (!parsedJourney.success) return validationError(parsedJourney.error);
  const data = parsedJourney.data;
  const values = { event_id: context.event.id, member_id: context.member.id, direction: data.direction, mode: data.mode, journey_date: data.date, departure_time: data.departureTime, arrival_time: data.arrivalTime, origin: data.origin, destination: data.destination, reference: data.reference, note: data.note };
  const { data: row, error } = await supabaseAdmin.from("travel_journeys")
    .upsert(values, { onConflict: "event_id,direction" }).select("*").single();
  if (error || !row) return serverError("保存往返交通失败，请稍后重试");
  return Response.json({ journey: mapJourney(row) });
}

export async function DELETE(request: Request, route: RouteContext<"/api/events/[code]/travel-details">) {
  const { code: rawCode } = await route.params;
  const code = rawCode.trim().toUpperCase();
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  const context = await getContext(code, parsed.data.identityId);
  const invalid = contextError(context);
  if (invalid || !context) return invalid!;
  const table = parsed.data.kind === "stay" ? "travel_stays" : "travel_journeys";
  const { error, count } = await supabaseAdmin.from(table).delete({ count: "exact" }).eq("id", parsed.data.id).eq("event_id", context.event.id);
  if (error) return serverError("删除失败，请稍后重试");
  if (!count) return Response.json({ error: "找不到这条记录" }, { status: 404 });
  return Response.json({ ok: true });
}
