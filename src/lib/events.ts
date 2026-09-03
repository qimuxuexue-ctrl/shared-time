import { randomInt } from "node:crypto";

import { getBeijingDateString, getMondayDateString } from "@/lib/dates";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { TAG_COLOR_VALUES } from "@/lib/tag-colors";
import type {
  EventUpdateType,
  HomeNotification,
  HomeNotificationType,
} from "@/lib/types";

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

type MembershipRow = {
  id: string;
  tag_name: string;
  tag_color: string;
  events: unknown;
};

type NotificationRow = {
  id: string;
  source_event_id: string;
  event_share_code: string;
  event_name: string;
  notification_type: HomeNotificationType;
  created_at: string;
};

type NotifiableEvent = {
  id: string;
  share_code: string;
  name: string;
};

const ACTIVE_UPDATE_TYPES = new Set<HomeNotificationType>([
  "participant",
  "note",
  "timeline",
]);

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
  const { data: expiredEvents, error: expiredEventsError } = await supabaseAdmin
    .from("events")
    .select("id, share_code, name")
    .eq("event_type", "one_time")
    .lt("start_date", currentWeekStart);

  if (expiredEventsError) {
    throw new Error("Unable to clean up expired events.");
  }

  if (!expiredEvents?.length) return;

  await Promise.all(expiredEvents.map(deleteExpiredEvent));
}

export async function notifyEventMembers(
  event: NotifiableEvent,
  type: HomeNotificationType,
  excludeIdentityId?: string,
) {
  const { data: members, error: membersError } = await supabaseAdmin
    .from("event_members")
    .select("identity_id")
    .eq("event_id", event.id);

  if (membersError) {
    throw new Error("Unable to load notification recipients.");
  }

  const recipientIds = Array.from(
    new Set(
      (members ?? [])
        .map((member) => member.identity_id)
        .filter((identityId) => identityId !== excludeIdentityId),
    ),
  );

  if (!recipientIds.length) return;

  const createdAt = new Date().toISOString();
  const { error } = await supabaseAdmin.from("identity_notifications").upsert(
    recipientIds.map((identityId) => ({
      identity_id: identityId,
      source_event_id: event.id,
      event_share_code: event.share_code,
      event_name: event.name,
      notification_type: type,
      created_at: createdAt,
    })),
    { onConflict: "identity_id,source_event_id,notification_type" },
  );

  if (error) {
    throw new Error("Unable to create event notifications.");
  }
}

export async function deleteExpiredEvent(event: NotifiableEvent) {
  try {
    await notifyEventMembers(event, "event_expired");
  } catch (error) {
    console.error("Unable to notify members about expired event", error);
  }

  const { error } = await supabaseAdmin
    .from("events")
    .delete()
    .eq("id", event.id);

  if (error) {
    throw new Error("Unable to clean up expired event.");
  }
}

async function getIdentityNotifications(identityId: string) {
  const { data, error } = await supabaseAdmin
    .from("identity_notifications")
    .select(
      "id, source_event_id, event_share_code, event_name, notification_type, created_at",
    )
    .eq("identity_id", identityId)
    .order("created_at", { ascending: false });

  if (error) {
    // Keep the site usable until the additive notification migration is run.
    return [] as HomeNotification[];
  }

  return ((data ?? []) as NotificationRow[]).map((notification) => ({
    id: notification.id,
    sourceEventId: notification.source_event_id,
    eventShareCode: notification.event_share_code,
    eventName: notification.event_name,
    type: notification.notification_type,
    createdAt: notification.created_at,
  }));
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

async function getIdentityEvents(identityId: string) {
  const { data, error } = await supabaseAdmin
    .from("event_members")
    .select(
      "id, tag_name, tag_color, events!inner(id, share_code, name, start_date, weeks_ahead, event_type, status, creator_identity_id, created_at)",
    )
    .eq("identity_id", identityId);

  if (error) {
    throw new Error("Unable to load identity events.");
  }

  const memberships = (data ?? []) as MembershipRow[];

  const eventIds = memberships.map(
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

  return memberships
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
        unreadUpdates: [] as EventUpdateType[],
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getIdentityHomeData(identityId: string) {
  await cleanupExpiredOneTimeEvents();

  const [events, notifications] = await Promise.all([
    getIdentityEvents(identityId),
    getIdentityNotifications(identityId),
  ]);
  const updatesByEvent = new Map<string, EventUpdateType[]>();

  for (const notification of notifications) {
    if (!ACTIVE_UPDATE_TYPES.has(notification.type)) continue;
    updatesByEvent.set(notification.sourceEventId, [
      ...(updatesByEvent.get(notification.sourceEventId) ?? []),
      notification.type as EventUpdateType,
    ]);
  }

  return {
    events: events.map((event) => ({
      ...event,
      unreadUpdates: updatesByEvent.get(event.id) ?? [],
    })),
    notifications,
  };
}
