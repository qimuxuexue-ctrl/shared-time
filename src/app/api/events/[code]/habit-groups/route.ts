import { z } from "zod";

import { serverError, validationError } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase/admin";

const identity = z.object({ identityId: z.uuid("身份 ID 不正确") });
const createSchema = identity.extend({ name: z.string().trim().min(1, "请输入分组名称").max(40, "分组名称最多 40 个字符") });
const updateSchema = createSchema.extend({ groupId: z.uuid("分组 ID 不正确") });
const deleteSchema = identity.extend({ groupId: z.uuid("分组 ID 不正确") });

async function getContext(code: string, identityId: string) {
  const { data: event, error: eventError } = await supabaseAdmin.from("events")
    .select("id, workspace_kind, status").eq("share_code", code).maybeSingle();
  if (eventError || !event) return null;
  const { data: member, error: memberError } = await supabaseAdmin.from("event_members")
    .select("id").eq("event_id", event.id).eq("identity_id", identityId).maybeSingle();
  if (memberError || !member) return null;
  return { event, member };
}

function invalidContext(context: Awaited<ReturnType<typeof getContext>>) {
  if (!context) return Response.json({ error: "事件不存在或你尚未加入" }, { status: 403 });
  if (context.event.workspace_kind !== "habit_tracker") return Response.json({ error: "这里只能管理 Habit Tracker 分组" }, { status: 409 });
  if (context.event.status !== "active") return Response.json({ error: "这个事件已经关闭" }, { status: 409 });
  return null;
}

function mapGroup(group: { id: string; name: string; created_at: string }) {
  return { id: group.id, name: group.name, createdAt: group.created_at };
}

function groupError(error: { code?: string } | null, fallback: string) {
  if (error?.code === "23505") return Response.json({ error: "已经有同名分组了" }, { status: 409 });
  return serverError(fallback);
}

export async function POST(request: Request, route: RouteContext<"/api/events/[code]/habit-groups">) {
  const { code } = await route.params;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  const context = await getContext(code.toUpperCase(), parsed.data.identityId);
  const invalid = invalidContext(context);
  if (invalid || !context) return invalid!;
  const { data, error } = await supabaseAdmin.from("habit_groups")
    .insert({ event_id: context.event.id, name: parsed.data.name })
    .select("id, name, created_at").single();
  if (error || !data) return groupError(error, "保存习惯分组失败");
  return Response.json({ group: mapGroup(data) }, { status: 201 });
}

export async function PUT(request: Request, route: RouteContext<"/api/events/[code]/habit-groups">) {
  const { code } = await route.params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  const context = await getContext(code.toUpperCase(), parsed.data.identityId);
  const invalid = invalidContext(context);
  if (invalid || !context) return invalid!;
  const { data, error } = await supabaseAdmin.from("habit_groups")
    .update({ name: parsed.data.name })
    .eq("id", parsed.data.groupId).eq("event_id", context.event.id)
    .select("id, name, created_at").maybeSingle();
  if (error) return groupError(error, "更新习惯分组失败");
  if (!data) return Response.json({ error: "找不到这个习惯分组" }, { status: 404 });
  return Response.json({ group: mapGroup(data) });
}

export async function DELETE(request: Request, route: RouteContext<"/api/events/[code]/habit-groups">) {
  const { code } = await route.params;
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  const context = await getContext(code.toUpperCase(), parsed.data.identityId);
  const invalid = invalidContext(context);
  if (invalid || !context) return invalid!;
  const { error, count } = await supabaseAdmin.from("habit_groups").delete({ count: "exact" })
    .eq("id", parsed.data.groupId).eq("event_id", context.event.id);
  if (error) return serverError("删除习惯分组失败");
  if (!count) return Response.json({ error: "找不到这个习惯分组" }, { status: 404 });
  return Response.json({ ok: true });
}
