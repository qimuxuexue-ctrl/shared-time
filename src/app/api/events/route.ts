import { z } from "zod";

import {
  getDateStringInTimeZone,
  getMondayDateString,
  isValidDateString,
} from "@/lib/dates";
import {
  createShareCode,
  getIdentityHomeData,
  pickTagColor,
} from "@/lib/events";
import { serverError, validationError } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase/admin";

const identityIdSchema = z.uuid("身份 ID 不正确");

const createEventSchema = z
  .object({
    identityId: identityIdSchema,
    name: z.string().trim().min(1, "请输入事件名称").max(80),
    tagName: z.string().trim().min(1).max(24).optional(),
    workspaceKind: z.enum(["share_time", "travel_plan"]).default("share_time"),
    eventType: z.enum(["one_time", "ongoing"]).default("one_time"),
    startDate: z.string().refine(isValidDateString, "开始日期不正确").optional(),
    endDate: z.string().refine(isValidDateString, "结束日期不正确").optional(),
    timeZone: z.enum(["Asia/Bangkok", "Asia/Shanghai", "Asia/Tokyo"]).default("Asia/Shanghai"),
  })
  .superRefine((value, context) => {
    if (value.workspaceKind !== "travel_plan") return;
    if (!value.startDate || !value.endDate) {
      context.addIssue({ code: "custom", message: "请选择完整的旅行日期" });
    } else if (value.endDate < value.startDate) {
      context.addIssue({ code: "custom", message: "结束日期不能早于开始日期" });
    }
  });

export async function GET(request: Request) {
  const identityId = new URL(request.url).searchParams.get("identityId");
  const parsed = identityIdSchema.safeParse(identityId);

  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    const homeData = await getIdentityHomeData(parsed.data);
    return Response.json(homeData);
  } catch {
    return serverError();
  }
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = createEventSchema.safeParse(payload);

  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const { identityId, name, workspaceKind, timeZone } = parsed.data;
  const { data: identity, error: identityError } = await supabaseAdmin
    .from("identities")
    .select("id, display_id")
    .eq("id", identityId)
    .maybeSingle<{ id: string; display_id: string }>();

  if (identityError) {
    return serverError();
  }

  if (!identity) {
    return Response.json({ error: "找不到这个身份" }, { status: 404 });
  }

  const startDate =
    workspaceKind === "travel_plan"
      ? parsed.data.startDate!
      : getMondayDateString(getDateStringInTimeZone(timeZone));
  const endDate = workspaceKind === "travel_plan" ? parsed.data.endDate! : null;
  const eventType = workspaceKind === "travel_plan" ? "ongoing" : parsed.data.eventType;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const shareCode = createShareCode();
    const { data: event, error: eventError } = await supabaseAdmin
      .from("events")
      .insert({
        share_code: shareCode,
        name,
        creator_identity_id: identityId,
        start_date: startDate,
        weeks_ahead: 1,
        workspace_kind: workspaceKind,
        end_date: endDate,
        event_type: eventType,
        time_zone: timeZone,
      })
      .select(
        "id, share_code, name, start_date, end_date, weeks_ahead, workspace_kind, event_type, time_zone, final_date, final_start_hour, finalized_at, status, creator_identity_id, created_at",
      )
      .single();

    if (eventError?.code === "23505") {
      continue;
    }

    if (eventError || !event) {
      return serverError("创建事件失败，请稍后重试");
    }

    const { data: member, error: memberError } = await supabaseAdmin
      .from("event_members")
      .insert({
        event_id: event.id,
        identity_id: identityId,
        tag_name: parsed.data.tagName ?? identity.display_id,
        tag_color: pickTagColor(identityId),
      })
      .select("id, tag_name, tag_color")
      .single();

    if (memberError || !member) {
      await supabaseAdmin.from("events").delete().eq("id", event.id);
      return serverError("创建事件失败，请稍后重试");
    }

    return Response.json(
      {
        event: {
          id: event.id,
          shareCode: event.share_code,
          name: event.name,
          startDate: event.start_date,
          endDate: event.end_date,
          weeksAhead: event.weeks_ahead,
          workspaceKind: event.workspace_kind,
          eventType: event.event_type,
          timeZone: event.time_zone,
          finalTime: null,
          status: event.status,
          createdAt: event.created_at,
          memberId: member.id,
          tagName: member.tag_name,
          tagColor: member.tag_color,
          isCreator: true,
          participantCount: 1,
          participants: [
            {
              id: member.id,
              tagName: member.tag_name,
              tagColor: member.tag_color,
            },
          ],
          unreadUpdates: [],
        },
      },
      { status: 201 },
    );
  }

  return serverError("无法生成邀请码，请重试");
}
