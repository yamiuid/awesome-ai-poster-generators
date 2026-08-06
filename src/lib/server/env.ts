import { z } from "zod";

const serverEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  APIMART_API_KEY: z.string().min(1),
  WAFFO_MERCHANT_ID: z.string().min(1),
  WAFFO_PRIVATE_KEY: z.string().min(1),
  WAFFO_ENVIRONMENT: z.enum(["test", "prod"]).default("prod"),
  WAFFO_MONTHLY_PRODUCT_ID: z.string().min(1),
  WAFFO_YEARLY_PRODUCT_ID: z.string().min(1),
  WAFFO_STUDIO_MONTHLY_PRODUCT_ID: z.string().min(1).optional(),
  WAFFO_STUDIO_YEARLY_PRODUCT_ID: z.string().min(1).optional(),
  SUPPORT_EMAIL: z.string().email().default("support@texttoposter.com"),
  CRON_SECRET: z.string().min(32),
  RATE_LIMIT_PEPPER: z.string().min(32),
  NEXT_PUBLIC_UMAMI_WEBSITE_ID: z.string().optional(),
  NEXT_PUBLIC_UMAMI_SCRIPT_URL: z.string().url().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | undefined;

export function parseServerEnv(env: NodeJS.ProcessEnv): ServerEnv {
  return serverEnvSchema.parse(env);
}

export function getServerEnv(): ServerEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  cachedEnv = parseServerEnv(process.env);
  return cachedEnv;
}

export function isStudioPlanConfigured(): boolean {
  return Boolean(
    process.env["WAFFO_STUDIO_MONTHLY_PRODUCT_ID"] &&
      process.env["WAFFO_STUDIO_YEARLY_PRODUCT_ID"],
  );
}
