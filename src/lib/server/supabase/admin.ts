import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/server/env";
import type { Database } from "./types";

let adminClient: SupabaseClient<Database> | undefined;

export function createSupabaseAdminClient(): SupabaseClient<Database> {
  if (adminClient) {
    return adminClient;
  }

  const env = getServerEnv();
  adminClient = createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
  return adminClient;
}
