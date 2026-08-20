import { z } from "zod";

const serverEnvSchema = z
  .object({
    NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    APIMART_API_KEY: z.string().min(1),
    // 内容提炼使用的文本模型；APIMart 同一 key 走 OpenAI 兼容 chat/completions
    APIMART_TEXT_MODEL: z.string().min(1).default("gpt-5.4-nano"),
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
    // "signed" = createSignedUrl（默认）；"public" = getPublicUrl（需 posters bucket 设为 public）。
    // 仅 supabase provider 使用；r2 provider 忽略该值。
    POSTER_URL_MODE: z.enum(["signed", "public"]).default("signed"),
    // 海报存储后端："supabase"（默认）或 "r2"（Cloudflare R2，public URL）。
    STORAGE_PROVIDER: z.enum(["supabase", "r2"]).default("supabase"),
    // R2 凭证（仅 STORAGE_PROVIDER=r2 时必填）
    R2_ACCOUNT_ID: z.string().min(1).optional(),
    R2_ACCESS_KEY_ID: z.string().min(1).optional(),
    R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    R2_BUCKET: z.string().min(1).optional(),
    R2_PUBLIC_BASE_URL: z.string().url().optional(), // 无尾斜杠，如 https://images.texttoposter.com
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_PROVIDER !== "r2") {
      return;
    }
    const required = [
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET",
      "R2_PUBLIC_BASE_URL",
    ] as const;
    for (const key of required) {
      if (!env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when STORAGE_PROVIDER=r2`,
        });
      }
    }
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
