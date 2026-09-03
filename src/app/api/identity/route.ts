import { identityInputSchema, normalizeIdentityKey } from "@/lib/identity";
import { getIdentityHomeData } from "@/lib/events";
import { serverError, validationError } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase/admin";

type IdentityRow = {
  id: string;
  id_key: string;
  display_id: string;
};

async function findIdentity(idKey: string) {
  const { data, error } = await supabaseAdmin
    .from("identities")
    .select("id, id_key, display_id")
    .eq("id_key", idKey)
    .maybeSingle<IdentityRow>();

  if (error) {
    throw error;
  }

  return data;
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = identityInputSchema.safeParse(payload);

  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const displayId = parsed.data.id;
  const idKey = normalizeIdentityKey(displayId);

  try {
    let identity = await findIdentity(idKey);
    let isNew = false;

    if (!identity) {
      const { data, error } = await supabaseAdmin
        .from("identities")
        .insert({ id_key: idKey, display_id: displayId })
        .select("id, id_key, display_id")
        .single<IdentityRow>();

      if (error?.code === "23505") {
        identity = await findIdentity(idKey);
      } else if (error) {
        throw error;
      } else {
        identity = data;
        isNew = true;
      }
    } else {
      await supabaseAdmin
        .from("identities")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", identity.id);
    }

    if (!identity) {
      return serverError();
    }

    const { events, notifications } = await getIdentityHomeData(identity.id);

    return Response.json({
      identity: {
        id: identity.id,
        displayId: identity.display_id,
      },
      isNew,
      events,
      notifications,
    });
  } catch (error) {
    console.error("Identity API error", error);
    return serverError();
  }
}
