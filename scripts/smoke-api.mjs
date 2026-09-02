import { createClient } from "@supabase/supabase-js";

const baseUrl = process.env.APP_URL ?? "http://localhost:3020";
const testId = `ct-${Date.now()}`;
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  },
);

let identityId;
const otherIdentityIds = [];
let eventId;
let oneTimeEventId;

async function post(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`${path}: ${payload.error ?? response.statusText}`);
  }

  return payload;
}

try {
  const identityResult = await post("/api/identity", { id: testId });
  identityId = identityResult.identity.id;
  console.log("identity: ok");

  const restoredIdentity = await post("/api/identity", { id: testId });
  if (restoredIdentity.identity.id !== identityId || restoredIdentity.isNew) {
    throw new Error("Identity restore returned an unexpected result.");
  }
  console.log("identity restore: ok");

  const createResult = await post("/api/events", {
    identityId,
    name: "Codex test event",
    eventType: "ongoing",
  });
  eventId = createResult.event.id;
  if (createResult.event.eventType !== "ongoing") {
    throw new Error("Event type was not saved.");
  }
  console.log("event create: ok");

  for (const [index, tagName] of ["小林", "Mika", "阿雪"].entries()) {
    const otherIdentity = await post("/api/identity", {
      id: `ctb-${index}-${Date.now()}`,
    });
    otherIdentityIds.push(otherIdentity.identity.id);

    const join = await post("/api/events/join", {
      identityId: otherIdentity.identity.id,
      shareCode: createResult.event.shareCode,
      tagName,
    });
    if (join.alreadyJoined) {
      throw new Error("A new identity was unexpectedly already joined.");
    }
  }
  console.log("three additional members join: ok");

  const earlyWeekday = new Date(`${createResult.event.startDate}T00:00:00Z`);
  earlyWeekday.setUTCDate(earlyWeekday.getUTCDate() + 7);
  const earlyWeekdayDate = earlyWeekday.toISOString().slice(0, 10);
  const earlyHourResponse = await fetch(
    `${baseUrl}/api/events/${createResult.event.shareCode}/availability`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        identityId,
        updates: [
          { date: earlyWeekdayDate, startHour: 10, available: true },
        ],
      }),
    },
  );
  if (!earlyHourResponse.ok) {
    const payload = await earlyHourResponse.json();
    throw new Error(`Weekday 10:00 save failed: ${payload.error ?? earlyHourResponse.statusText}`);
  }
  console.log("weekday 10:00 availability: ok");

  const saveCreatorNote = async (content) => {
    const response = await fetch(
      `${baseUrl}/api/events/${createResult.event.shareCode}/notes`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identityId, content }),
      },
    );
    if (!response.ok) {
      const payload = await response.json();
      throw new Error(`Creator note failed: ${payload.error ?? response.statusText}`);
    }
  };
  await saveCreatorNote("第一次备注");
  await saveCreatorNote("修改后的备注");

  const otherNoteResponse = await fetch(
    `${baseUrl}/api/events/${createResult.event.shareCode}/notes`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        identityId: otherIdentityIds[0],
        content: "其他参与者的备注",
      }),
    },
  );
  if (!otherNoteResponse.ok) {
    throw new Error("Another participant could not save a note.");
  }
  console.log("shared notes create and edit: ok");

  const joinResult = await post("/api/events/join", {
    identityId,
    shareCode: createResult.event.shareCode,
  });
  if (!joinResult.alreadyJoined) {
    throw new Error("Existing membership was not restored.");
  }
  console.log("event rejoin: ok");

  const eventsResponse = await fetch(
    `${baseUrl}/api/events?identityId=${encodeURIComponent(identityId)}`,
  );
  const eventsResult = await eventsResponse.json();
  if (
    !eventsResponse.ok ||
    eventsResult.events.length !== 1 ||
    eventsResult.events[0].participantCount !== 4 ||
    eventsResult.events[0].participants.length !== 4
  ) {
    throw new Error("Event list returned an unexpected result.");
  }
  console.log("event list participant summary: ok");

  const workspaceResponse = await fetch(
    `${baseUrl}/api/events/${createResult.event.shareCode}?identityId=${encodeURIComponent(identityId)}&weekStart=${createResult.event.startDate}`,
  );
  const workspace = await workspaceResponse.json();
  if (
    !workspaceResponse.ok ||
    workspace.members.length !== 4 ||
    workspace.notes.length !== 2 ||
    !workspace.notes.some(
      (note) => note.isCurrent && note.content === "修改后的备注",
    )
  ) {
    throw new Error("Workspace did not return all members.");
  }
  console.log("multi-member workspace and shared notes: ok");

  const deniedDelete = await fetch(
    `${baseUrl}/api/events/${createResult.event.shareCode}`,
    {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identityId: otherIdentityIds[0] }),
    },
  );
  if (deniedDelete.status !== 403) {
    throw new Error("A non-creator was allowed to delete the event.");
  }
  console.log("non-creator delete denied: ok");

  const creatorDelete = await fetch(
    `${baseUrl}/api/events/${createResult.event.shareCode}`,
    {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identityId }),
    },
  );
  if (!creatorDelete.ok) {
    const payload = await creatorDelete.json();
    throw new Error(`Creator delete failed: ${payload.error ?? creatorDelete.statusText}`);
  }

  const { count: remainingMembers } = await supabase
    .from("event_members")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);
  if (remainingMembers !== 0) {
    throw new Error("Event members were not removed by cascade delete.");
  }
  const { count: remainingAvailability } = await supabase
    .from("availabilities")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);
  if (remainingAvailability !== 0) {
    throw new Error("Availability was not removed by cascade delete.");
  }
  const { count: remainingNotes } = await supabase
    .from("event_notes")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);
  if (remainingNotes !== 0) {
    throw new Error("Notes were not removed by cascade delete.");
  }
  eventId = undefined;
  console.log("creator delete and cascade cleanup: ok");

  const oneTimeCreate = await post("/api/events", {
    identityId,
    name: "Expiring one-time event",
    eventType: "one_time",
  });
  oneTimeEventId = oneTimeCreate.event.id;

  const outsideWeekResponse = await fetch(
    `${baseUrl}/api/events/${oneTimeCreate.event.shareCode}/availability`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        identityId,
        updates: [
          { date: earlyWeekdayDate, startHour: 10, available: true },
        ],
      }),
    },
  );
  if (outsideWeekResponse.status !== 400) {
    throw new Error("One-time event accepted a slot outside its week.");
  }

  const expiredDate = new Date(`${oneTimeCreate.event.startDate}T00:00:00Z`);
  expiredDate.setUTCDate(expiredDate.getUTCDate() - 7);
  const { error: expireError } = await supabase
    .from("events")
    .update({ start_date: expiredDate.toISOString().slice(0, 10) })
    .eq("id", oneTimeEventId);
  if (expireError) throw expireError;

  await post("/api/identity", { id: testId });
  const { data: expiredEvent } = await supabase
    .from("events")
    .select("id")
    .eq("id", oneTimeEventId)
    .maybeSingle();
  if (expiredEvent) {
    throw new Error("Expired one-time event was not automatically deleted.");
  }
  oneTimeEventId = undefined;
  console.log("one-time event range and expiry cleanup: ok");
} finally {
  if (eventId) {
    await supabase.from("events").delete().eq("id", eventId);
  }
  if (oneTimeEventId) {
    await supabase.from("events").delete().eq("id", oneTimeEventId);
  }
  if (identityId) {
    await supabase.from("identities").delete().eq("id", identityId);
  }
  for (const otherIdentityId of otherIdentityIds) {
    await supabase.from("identities").delete().eq("id", otherIdentityId);
  }
  console.log("test cleanup: ok");
}
