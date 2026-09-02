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
let secondIdentityId;
let eventId;

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
    weeksAhead: 4,
  });
  eventId = createResult.event.id;
  console.log("event create: ok");

  const secondIdentity = await post("/api/identity", {
    id: `ctb-${Date.now()}`,
  });
  secondIdentityId = secondIdentity.identity.id;
  console.log("second identity: ok");

  const secondJoin = await post("/api/events/join", {
    identityId: secondIdentityId,
    shareCode: createResult.event.shareCode,
    tagName: "Second tester",
  });
  if (secondJoin.alreadyJoined) {
    throw new Error("Second identity was unexpectedly already joined.");
  }
  console.log("second member join: ok");

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
  if (!eventsResponse.ok || eventsResult.events.length !== 1) {
    throw new Error("Event list returned an unexpected result.");
  }
  console.log("event list: ok");

  const workspaceResponse = await fetch(
    `${baseUrl}/api/events/${createResult.event.shareCode}?identityId=${encodeURIComponent(identityId)}&weekStart=${createResult.event.startDate}`,
  );
  const workspace = await workspaceResponse.json();
  if (!workspaceResponse.ok || workspace.members.length !== 2) {
    throw new Error("Workspace did not return both members.");
  }
  console.log("multi-member workspace: ok");
} finally {
  if (eventId) {
    await supabase.from("events").delete().eq("id", eventId);
  }
  if (identityId) {
    await supabase.from("identities").delete().eq("id", identityId);
  }
  if (secondIdentityId) {
    await supabase.from("identities").delete().eq("id", secondIdentityId);
  }
  console.log("test cleanup: ok");
}
