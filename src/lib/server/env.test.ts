import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./env";

const validEnv = {
  NODE_ENV: "production",
  NEXT_PUBLIC_APP_URL: "https://texttoposter.com",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  APIMART_API_KEY: "apimart-key",
  WAFFO_MERCHANT_ID: "merchant-id",
  WAFFO_PRIVATE_KEY: "private-key",
  WAFFO_MONTHLY_PRODUCT_ID: "monthly-product",
  WAFFO_YEARLY_PRODUCT_ID: "yearly-product",
  CRON_SECRET: "c".repeat(32),
  RATE_LIMIT_PEPPER: "p".repeat(32),
} satisfies NodeJS.ProcessEnv;

describe("server environment", () => {
  it("rejects production configuration without private operational secrets", () => {
    const {
      CRON_SECRET: _cron,
      RATE_LIMIT_PEPPER: _pepper,
      ...missing
    } = validEnv;

    expect(() => parseServerEnv(missing)).toThrow();
  });

  it("accepts explicit strong operational secrets", () => {
    expect(parseServerEnv(validEnv).CRON_SECRET).toBe(validEnv.CRON_SECRET);
  });
});
