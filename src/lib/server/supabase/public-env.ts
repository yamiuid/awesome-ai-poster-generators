import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export function getPublicEnv(): Readonly<{ url: string; anonKey: string }> {
  const values = publicEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env["NEXT_PUBLIC_SUPABASE_URL"],
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
  });
  return {
    url: values.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: values.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}
