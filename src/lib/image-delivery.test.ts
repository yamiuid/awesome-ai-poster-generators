import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGIN = "https://texttoposter.com";
const SOURCE =
  "https://images.texttoposter.com/u/1/0.png?token=abc";

async function loadHelper(origin?: string): Promise<
  typeof import("./image-delivery")
> {
  vi.resetModules();
  if (origin === undefined) {
    vi.stubEnv("NEXT_PUBLIC_IMAGE_TRANSFORM_ORIGIN", "");
  } else {
    vi.stubEnv("NEXT_PUBLIC_IMAGE_TRANSFORM_ORIGIN", origin);
  }
  return import("./image-delivery");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("posterSrc", () => {
  it("passes the original URL through when no transform origin is configured", async () => {
    const { posterSrc } = await loadHelper();
    expect(posterSrc(SOURCE, 640)).toBe(SOURCE);
  });

  it("wraps remote posters in the Cloudflare resize URL", async () => {
    const { posterSrc } = await loadHelper(ORIGIN);
    expect(posterSrc(SOURCE, 640)).toBe(
      `${ORIGIN}/cdn-cgi/image/width=640,format=auto,quality=82/${encodeURIComponent(SOURCE)}`,
    );
  });

  it("leaves same-origin assets untouched", async () => {
    const { posterSrc } = await loadHelper(ORIGIN);
    expect(posterSrc("/examples/neon-after-dark.webp", 640)).toBe(
      "/examples/neon-after-dark.webp",
    );
  });
});
