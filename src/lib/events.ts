import { randomInt } from "node:crypto";

import { getBeijingDateString, getMondayDateString } from "@/lib/dates";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { TAG_COLOR_VALUES } from "@/lib/tag-colors";

const SHARE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type JoinedEvent = {
  id: string;
  share_code: string;
  name: string;
  start_date: string;
  weeks_ahead: number;
  event_type: "one_time" | "ongoing";
  status: "active" | "closed" | "archived";
  creator_identity_id: string;
  created_at: string;
};

type ParticipantRow = {
  id: string;
  event_id: string;
  tag_name: string;
  tag_color: string;
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

  return TAG_COLOR_VALUES[score % TAG_COLOR_VALUES.length];
}

export function isExpiredOneTimeEvent(event: {
  event_type: "one_time" | "ongoing";
  start_date: string;
}) {
  return (
    event.event_type === "one_time" &&
    event.start_date < getMondayDateString(getBeijingDateString())
  );
}

export async function cleanupExpiredOneTimeEvents() {
  const currentWeekStart = getMondayDateString(getBeijingDateString());
  const { error } = await supabaseAdmin
    .from("events")
    .delete()
    .eq("event_type", "one_time")
    .lt("start_date", currentWeekStart);

  if (error) {
    throw new Error("Unable to clean up expired events.");
  }
}

export async function getEventParticipants(eventId: string) {
  const { data, error } = await supabaseAdmin
    .from("event_members")
    .select("id, event_id, tag_name, tag_color")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error("Unable to load event participants.");
  }

  return (data as ParticipantRow[] | null ?? []).map((participant) => ({
    id: participant.id,
    tagName: participant.tag_name,
    tagColor: participant.tag_color,
  }));
}

export async function getIdentityEvents(identityId: string) {
  await cleanupExpiredOneTimeEvents();

  const { data, error } = await supabaseAdmin
    .from("event_members")
    .select(
      "id, tag_name, tag_color, events!inner(id, share_code, name, start_date, weeks_ahead, event_type, status, creator_identity_id, created_at)",
    )
    .eq("identity_id", identityId);

  if (error) {
    throw new Error("Unable to load identity events.");
  }

  const eventIds = (data ?? []).map(
    (membership) => (membership.events as unknown as JoinedEvent).id,
  );
  const participantsByEvent = new Map<string, ParticipantRow[]>();

  if (eventIds.length > 0) {
    const { data: participantRows, error: participantsError } = await supabaseAdmin
      .from("event_members")
      .select("id, event_id, tag_name, tag_color")
      .in("event_id", eventIds)
      .order("created_at", { ascending: true });

    if (participantsError) {
      throw new Error("Unable to load event participants.");
    }

    for (const participant of participantRows as ParticipantRow[] | null ?? []) {
      participantsByEvent.set(participant.event_id, [
        ...(participantsByEvent.get(participant.event_id) ?? []),
        participant,
      ]);
    }
  }

  return (data ?? [])
    .map((membership) => {
      const event = membership.events as unknown as JoinedEvent;
      const participants = (participantsByEvent.get(event.id) ?? []).map(
        (participant) => ({
          id: participant.id,
          tagName: participant.tag_name,
          tagColor: participant.tag_color,
        }),
      );

      return {
        id: event.id,
        shareCode: event.share_code,
        name: event.name,
        startDate: event.start_date,
        weeksAhead: event.weeks_ahead,
        eventType: event.event_type,
        status: event.status,
        createdAt: event.created_at,
        memberId: membership.id,
        tagName: membership.tag_name,
        tagColor: membership.tag_color,
        isCreator: event.creator_identity_id === identityId,
        participantCount: participants.length,
        participants,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
