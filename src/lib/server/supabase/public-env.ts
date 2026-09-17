import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  // Cloudflare Turnstile site key；未配置时登录表单退回「不带验证码」的模式
  // （仅适用于 Supabase Auth 侧也关闭了 CAPTCHA 的环境，例如本地联调）。
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1).optional(),
});

export function getPublicEnv(): Readonly<{
  url: string;
  anonKey: string;
  turnstileSiteKey: string | null;
}> {
  const values = publicEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env["NEXT_PUBLIC_SUPABASE_URL"],
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    NEXT_PUBLIC_TURNSTILE_SITE_KEY:
      process.env["NEXT_PUBLIC_TURNSTILE_SITE_KEY"],
  });
  return {
    url: values.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: values.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    turnstileSiteKey: values.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null,
  };
}
