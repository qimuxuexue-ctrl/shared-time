import { z } from "zod";

import { pickTagColor } from "@/lib/events";
import { serverError, validationError } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase/admin";

const joinEventSchema = z.object({
  identityId: z.uuid("身份 ID 不正确"),
  shareCode: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]{6}$/, "请输入 6 位邀请码")),
  tagName: z.string().trim().min(1).max(24).optional(),
});

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = joinEventSchema.safeParse(payload);

  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const { identityId, shareCode } = parsed.data;

  const [{ data: identity, error: identityError }, { data: event, error: eventError }] =
    await Promise.all([
      supabaseAdmin
        .from("identities")
        .select("id, display_id")
        .eq("id", identityId)
        .maybeSingle<{ id: string; display_id: string }>(),
      supabaseAdmin
        .from("events")
        .select(
          "id, share_code, name, start_date, weeks_ahead, status, creator_identity_id, created_at",
        )
        .eq("share_code", shareCode)
        .maybeSingle(),
    ]);

  if (identityError || eventError) {
    return serverError();
  }

  if (!identity) {
    return Response.json({ error: "找不到这个身份" }, { status: 404 });
  }

  if (!event) {
    return Response.json({ error: "邀请码不存在" }, { status: 404 });
  }

  const { data: existingMember, error: existingMemberError } = await supabaseAdmin
    .from("event_members")
    .select("id, tag_name, tag_color")
    .eq("event_id", event.id)
    .eq("identity_id", identityId)
    .maybeSingle();

  if (existingMemberError) {
    return serverError();
  }

  if (existingMember) {
    return Response.json({
      event: {
        id: event.id,
        shareCode: event.share_code,
        name: event.name,
        startDate: event.start_date,
        weeksAhead: event.weeks_ahead,
        status: event.status,
        createdAt: event.created_at,
        memberId: existingMember.id,
        tagName: existingMember.tag_name,
        tagColor: existingMember.tag_color,
        isCreator: event.creator_identity_id === identityId,
      },
      alreadyJoined: true,
    });
  }

  if (event.status !== "active") {
    return Response.json({ error: "这个事件已经停止加入" }, { status: 409 });
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
    return serverError("加入事件失败，请稍后重试");
  }

  return Response.json(
    {
      event: {
        id: event.id,
        shareCode: event.share_code,
        name: event.name,
        startDate: event.start_date,
        weeksAhead: event.weeks_ahead,
        status: event.status,
        createdAt: event.created_at,
        memberId: member.id,
        tagName: member.tag_name,
        tagColor: member.tag_color,
        isCreator: event.creator_identity_id === identityId,
      },
      alreadyJoined: false,
    },
    { status: 201 },
  );
}
