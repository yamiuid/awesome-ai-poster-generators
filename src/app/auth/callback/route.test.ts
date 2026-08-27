import { describe, expect, it } from "vitest";
import { GET } from "./route";

async function redirectLocation(url: string): Promise<string | null> {
  const response = await GET(new Request(url));
  return response.headers.get("location");
}

describe("auth callback", () => {
  it("returns direct sign-ins to the home page", async () => {
    await expect(
      redirectLocation("http://127.0.0.1:3000/auth/callback"),
    ).resolves.toBe("http://127.0.0.1:3000/");
  });

  it("preserves safe in-app destinations", async () => {
    await expect(
      redirectLocation("http://127.0.0.1:3000/auth/callback?next=%2Fpricing"),
    ).resolves.toBe("http://127.0.0.1:3000/pricing");
  });
});
