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

  it("defaults poster URL mode to signed", () => {
    expect(parseServerEnv(validEnv).POSTER_URL_MODE).toBe("signed");
  });

  it("accepts explicit public poster URL mode", () => {
    expect(
      parseServerEnv({ ...validEnv, POSTER_URL_MODE: "public" })
        .POSTER_URL_MODE,
    ).toBe("public");
  });

  it("defaults storage provider to supabase", () => {
    expect(parseServerEnv(validEnv).STORAGE_PROVIDER).toBe("supabase");
  });

  it("accepts r2 provider with complete credentials", () => {
    const parsed = parseServerEnv({
      ...validEnv,
      STORAGE_PROVIDER: "r2",
      R2_ACCOUNT_ID: "account-id",
      R2_ACCESS_KEY_ID: "access-key",
      R2_SECRET_ACCESS_KEY: "secret-key",
      R2_BUCKET: "posters",
      R2_PUBLIC_BASE_URL: "https://images.texttoposter.com",
    });
    expect(parsed.STORAGE_PROVIDER).toBe("r2");
    expect(parsed.R2_BUCKET).toBe("posters");
  });

  it("rejects r2 provider without required credentials", () => {
    expect(() =>
      parseServerEnv({ ...validEnv, STORAGE_PROVIDER: "r2" }),
    ).toThrow(/R2_ACCOUNT_ID is required when STORAGE_PROVIDER=r2/);
  });

  it("accepts supabase provider with stray r2 variables", () => {
    const parsed = parseServerEnv({
      ...validEnv,
      R2_ACCOUNT_ID: "account-id",
      R2_PUBLIC_BASE_URL: "https://images.texttoposter.com",
    });
    expect(parsed.STORAGE_PROVIDER).toBe("supabase");
  });
});
