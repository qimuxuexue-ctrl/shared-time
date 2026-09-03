import { z } from "zod";

import { serverError, validationError } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase/admin";

const dismissNotificationSchema = z.object({
  identityId: z.uuid("身份 ID 不正确"),
});

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/notifications/[id]">,
) {
  const { id } = await context.params;
  const notificationId = z.uuid().safeParse(id);
  const payload = await request.json().catch(() => null);
  const parsed = dismissNotificationSchema.safeParse(payload);

  if (!notificationId.success) return validationError(notificationId.error);
  if (!parsed.success) return validationError(parsed.error);

  const { error } = await supabaseAdmin
    .from("identity_notifications")
    .delete()
    .eq("id", notificationId.data)
    .eq("identity_id", parsed.data.identityId);

  if (error) {
    return serverError("暂时无法关闭这条动态");
  }

  return Response.json({ ok: true });
}
