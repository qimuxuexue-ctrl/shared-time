import { z } from "zod";

import { serverError, validationError } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase/admin";

const wishFields = {
  identityId: z.uuid("身份 ID 不正确"),
  content: z.string().trim().min(1, "写下一件想实现的事吧").max(280, "愿望最多 280 个字符"),
};

const createSchema = z.object(wishFields);
const updateSchema = z.object({ ...wishFields, wishId: z.uuid("愿望 ID 不正确") });
const deleteSchema = z.object({
  identityId: z.uuid("身份 ID 不正确"),
  wishId: z.uuid("愿望 ID 不正确"),
});

async function getContext(code: string, identityId: string) {
  const { data: event, error: eventError } = await supabaseAdmin
    .from("events")
    .select("id, workspace_kind, status")
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

function validateContext(context: Awaited<ReturnType<typeof getContext>>) {
  if (!context) return Response.json({ error: "事件不存在或你尚未加入" }, { status: 403 });
  if (context.event.workspace_kind !== "travel_plan") {
    return Response.json({ error: "只有旅行计划可以添加愿望" }, { status: 409 });
  }
  if (context.event.status !== "active") {
    return Response.json({ error: "这个旅行计划已经关闭" }, { status: 409 });
  }
  return null;
}

function mapWish(wish: Record<string, unknown>, context: NonNullable<Awaited<ReturnType<typeof getContext>>>) {
  return {
    id: wish.id,
    memberId: wish.member_id,
    authorTagName: context.member.tag_name,
    authorTagColor: context.member.tag_color,
    content: wish.content,
    isCurrent: true,
    createdAt: wish.created_at,
    updatedAt: wish.updated_at,
  };
}

export async function POST(request: Request, route: RouteContext<"/api/events/[code]/wishes">) {
  const { code: rawCode } = await route.params;
  const code = rawCode.trim().toUpperCase();
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);

  const context = await getContext(code, parsed.data.identityId);
  const contextError = validateContext(context);
  if (contextError || !context) return contextError!;

  const { data: wish, error } = await supabaseAdmin
    .from("travel_wishes")
    .insert({ event_id: context.event.id, member_id: context.member.id, content: parsed.data.content })
    .select("id, member_id, content, created_at, updated_at")
    .single();
  if (error || !wish) return serverError("暂时没能贴上这张愿望便签，请稍后再试");
  return Response.json({ wish: mapWish(wish, context) }, { status: 201 });
}

export async function PUT(request: Request, route: RouteContext<"/api/events/[code]/wishes">) {
  const { code: rawCode } = await route.params;
  const code = rawCode.trim().toUpperCase();
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);

  const context = await getContext(code, parsed.data.identityId);
  const contextError = validateContext(context);
  if (contextError || !context) return contextError!;

  const { data: wish, error } = await supabaseAdmin
    .from("travel_wishes")
    .update({ content: parsed.data.content })
    .eq("id", parsed.data.wishId)
    .eq("event_id", context.event.id)
    .eq("member_id", context.member.id)
    .select("id, member_id, content, created_at, updated_at")
    .maybeSingle();
  if (error) return serverError("暂时没能更新这张愿望便签，请稍后再试");
  if (!wish) return Response.json({ error: "只能修改自己的愿望" }, { status: 403 });
  return Response.json({ wish: mapWish(wish, context) });
}

export async function DELETE(request: Request, route: RouteContext<"/api/events/[code]/wishes">) {
  const { code: rawCode } = await route.params;
  const code = rawCode.trim().toUpperCase();
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);

  const context = await getContext(code, parsed.data.identityId);
  const contextError = validateContext(context);
  if (contextError || !context) return contextError!;

  const { error, count } = await supabaseAdmin
    .from("travel_wishes")
    .delete({ count: "exact" })
    .eq("id", parsed.data.wishId)
    .eq("event_id", context.event.id)
    .eq("member_id", context.member.id);
  if (error) return serverError("暂时没能取下这张愿望便签，请稍后再试");
  if (!count) return Response.json({ error: "只能删除自己的愿望" }, { status: 403 });
  return Response.json({ ok: true });
}
