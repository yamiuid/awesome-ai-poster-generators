import { z } from "zod";

const serverEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  APIMART_API_KEY: z.string().min(1),
  WAFFO_MERCHANT_ID: z.string().min(1),
  WAFFO_PRIVATE_KEY: z.string().min(1),
  WAFFO_MONTHLY_PRODUCT_ID: z.string().min(1),
  WAFFO_YEARLY_PRODUCT_ID: z.string().min(1),
  SUPPORT_EMAIL: z.string().email().default("support@texttoposter.com"),
  CRON_SECRET: z.string().min(16).default("local-development-cron-secret"),
  RATE_LIMIT_PEPPER: z
    .string()
    .min(16)
    .default("local-development-rate-limit-pepper"),
  NEXT_PUBLIC_UMAMI_WEBSITE_ID: z.string().optional(),
  NEXT_PUBLIC_UMAMI_SCRIPT_URL: z.string().url().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  cachedEnv = serverEnvSchema.parse(process.env);
  return cachedEnv;
}
