import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  throw new Error("Missing Supabase environment variables.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const tables = [
  "identities",
  "events",
  "event_members",
  "availabilities",
  "event_notes",
];

for (const table of tables) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }

  console.log(`${table}: ${count ?? 0} rows`);
}
