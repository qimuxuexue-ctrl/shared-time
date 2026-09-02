import { z } from "zod";

import { isExpiredOneTimeEvent } from "@/lib/events";
import { serverError, validationError } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase/admin";

const noteSchema = z.object({
  identityId: z.uuid("身份 ID 不正确"),
  content: z.string().trim().min(1, "请输入备注内容").max(500, "备注最多 500 个字符"),
});

export async function PUT(
  request: Request,
  context: RouteContext<"/api/events/[code]/notes">,
) {
  const { code: rawCode } = await context.params;
  const code = rawCode.trim().toUpperCase();

  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return Response.json({ error: "邀请码格式不正确" }, { status: 400 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = noteSchema.safeParse(payload);

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
    .select("id, tag_name, tag_color")
    .eq("event_id", event.id)
    .eq("identity_id", parsed.data.identityId)
    .maybeSingle<{ id: string; tag_name: string; tag_color: string }>();

  if (memberError) {
    return serverError();
  }

  if (!member) {
    return Response.json({ error: "你还没有加入这个事件" }, { status: 403 });
  }

  const { data: note, error: noteError } = await supabaseAdmin
    .from("event_notes")
    .upsert(
      {
        event_id: event.id,
        member_id: member.id,
        content: parsed.data.content,
      },
      { onConflict: "event_id,member_id" },
    )
    .select("id, member_id, content, updated_at")
    .single();

  if (noteError || !note) {
    return serverError("保存备注失败");
  }

  return Response.json({
    note: {
      id: note.id,
      memberId: note.member_id,
      authorTagName: member.tag_name,
      authorTagColor: member.tag_color,
      content: note.content,
      isCurrent: true,
      updatedAt: note.updated_at,
    },
  });
}
