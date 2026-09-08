import { z } from "zod";

import { serverError, validationError } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase/admin";

const presenceSchema = z.object({
  identityId: z.uuid("身份 ID 不正确"),
});

export async function POST(
  request: Request,
  context: RouteContext<"/api/events/[code]/presence">,
) {
  const { code: rawCode } = await context.params;
  const code = rawCode.trim().toUpperCase();
  const payload = await request.json().catch(() => null);
  const parsed = presenceSchema.safeParse(payload);

  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return Response.json({ error: "邀请码格式不正确" }, { status: 400 });
  }
  if (!parsed.success) return validationError(parsed.error);

  const { data: event, error: eventError } = await supabaseAdmin
    .from("events")
    .select("id")
    .eq("share_code", code)
    .maybeSingle<{ id: string }>();

  if (eventError) return serverError();
  if (!event) return Response.json({ error: "事件不存在" }, { status: 404 });

  const now = new Date();
  const { data: currentMember, error: updateError } = await supabaseAdmin
    .from("event_members")
    .update({ last_viewed_at: now.toISOString() })
    .eq("event_id", event.id)
    .eq("identity_id", parsed.data.identityId)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (updateError) return serverError();
  if (!currentMember) {
    return Response.json({ error: "你还没有加入这个事件" }, { status: 403 });
  }

  const activeSince = new Date(now.getTime() - 45_000).toISOString();
  const { data: members, error: membersError } = await supabaseAdmin
    .from("event_members")
    .select("id, tag_name, tag_color")
    .eq("event_id", event.id)
    .gte("last_viewed_at", activeSince)
    .order("last_viewed_at", { ascending: false });

  if (membersError) return serverError();

  return Response.json({
    members: (members ?? []).map((member) => ({
      id: member.id,
      tagName: member.tag_name,
      tagColor: member.tag_color,
    })),
  });
}
