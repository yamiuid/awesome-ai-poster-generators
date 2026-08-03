import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getPublicEnv } from "./public-env";
import type { Database } from "./types";

export async function createSupabaseServerClient(): Promise<
  SupabaseClient<Database>
> {
  const cookieStore = await cookies();
  const publicEnv = getPublicEnv();

  return createServerClient<Database>(publicEnv.url, publicEnv.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(values) {
        try {
          for (const { name, value, options } of values) {
            cookieStore.set(name, value, options);
          }
        } catch (error) {
          if (!(error instanceof Error)) {
            throw new Error("Failed to write Supabase cookies");
          }
        }
      },
    },
  });
}
