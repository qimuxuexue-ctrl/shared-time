import "server-only";

import { createClient } from "@supabase/supabase-js";

import { serverEnv } from "@/lib/env";

export const supabaseAdmin = createClient(
  serverEnv.SUPABASE_URL,
  serverEnv.SUPABASE_SECRET_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);
