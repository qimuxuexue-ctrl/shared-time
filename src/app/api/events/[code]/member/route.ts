import { z } from "zod";

import { deleteExpiredEvent, isExpiredOneTimeEvent } from "@/lib/events";
import { serverError, validationError } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase/admin";

const updateMemberSchema = z.object({
  identityId: z.uuid("身份 ID 不正确"),
  tagName: z.string().trim().min(1, "请输入 Tag 名称").max(24, "Tag 最多 24 个字符"),
  tagColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Tag 颜色不正确"),
});

export async function PUT(
  request: Request,
  context: RouteContext<"/api/events/[code]/member">,
) {
  const { code: rawCode } = await context.params;
  const code = rawCode.trim().toUpperCase();

  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return Response.json({ error: "邀请码格式不正确" }, { status: 400 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = updateMemberSchema.safeParse(payload);

  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const { data: event, error: eventError } = await supabaseAdmin
    .from("events")
    .select("id, share_code, name, start_date, event_type, time_zone, status")
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

  const { data: updatedMember, error: updateError } = await supabaseAdmin
    .from("event_members")
    .update({
      tag_name: parsed.data.tagName,
      tag_color: parsed.data.tagColor.toUpperCase(),
    })
    .eq("id", member.id)
    .select("id, identity_id, tag_name, tag_color")
    .single();

  if (updateError || !updatedMember) {
    return serverError("保存 Tag 失败");
  }

  return Response.json({
    member: {
      id: updatedMember.id,
      identityId: updatedMember.identity_id,
      tagName: updatedMember.tag_name,
      tagColor: updatedMember.tag_color,
      isCurrent: true,
    },
  });
}
