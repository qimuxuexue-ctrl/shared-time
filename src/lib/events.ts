import { randomInt } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabase/admin";

const SHARE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TAG_COLORS = [
  "#3578E5",
  "#E16B5A",
  "#3E9B73",
  "#8B6CCF",
  "#D28A37",
  "#487C9E",
  "#C35E86",
];

type JoinedEvent = {
  id: string;
  share_code: string;
  name: string;
  start_date: string;
  weeks_ahead: number;
  status: "active" | "closed" | "archived";
  creator_identity_id: string;
  created_at: string;
};

export function createShareCode() {
  return Array.from({ length: 6 }, () =>
    SHARE_CODE_ALPHABET[randomInt(SHARE_CODE_ALPHABET.length)],
  ).join("");
}

export function pickTagColor(identityId: string) {
  const score = Array.from(identityId).reduce(
    (sum, character) => sum + character.charCodeAt(0),
    0,
  );

  return TAG_COLORS[score % TAG_COLORS.length];
}

export async function getIdentityEvents(identityId: string) {
  const { data, error } = await supabaseAdmin
    .from("event_members")
    .select(
      "id, tag_name, tag_color, events!inner(id, share_code, name, start_date, weeks_ahead, status, creator_identity_id, created_at)",
    )
    .eq("identity_id", identityId);

  if (error) {
    throw new Error("Unable to load identity events.");
  }

  return (data ?? [])
    .map((membership) => {
      const event = membership.events as unknown as JoinedEvent;

      return {
        id: event.id,
        shareCode: event.share_code,
        name: event.name,
        startDate: event.start_date,
        weeksAhead: event.weeks_ahead,
        status: event.status,
        createdAt: event.created_at,
        memberId: membership.id,
        tagName: membership.tag_name,
        tagColor: membership.tag_color,
        isCreator: event.creator_identity_id === identityId,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
