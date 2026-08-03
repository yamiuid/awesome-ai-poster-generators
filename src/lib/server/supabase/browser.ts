import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/server/supabase/public-env";
import type { Database } from "@/lib/server/supabase/types";

let browserClient: SupabaseClient<Database> | undefined;

export function createSupabaseBrowserClient(): SupabaseClient<Database> {
  if (browserClient) {
    return browserClient;
  }

  const publicEnv = getPublicEnv();
  browserClient = createBrowserClient<Database>(
    publicEnv.url,
    publicEnv.anonKey,
  );
  return browserClient;
}
