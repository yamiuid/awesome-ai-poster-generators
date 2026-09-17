import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAuthContext } from "./auth";

type ClaimssResult = Readonly<{
  data: { claims: Record<string, unknown> } | null;
  error: { name: string; message: string } | null;
}>;

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  getUser: vi.fn(),
  subscription: null as null | { status: string; period_end: string; tier: string },
  packGrantCount: 0,
}));

vi.mock("./supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getClaims: mocks.getClaims,
      getUser: mocks.getUser,
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === "subscriptions" ? mocks.subscription : null,
            error: null,
          }),
          eq: () => ({
            limit: async () => ({
              data: Array.from({ length: mocks.packGrantCount }, (_, i) => ({
                id: `grant-${i}`,
              })),
            }),
          }),
        }),
      }),
    }),
  }),
}));

const claimsResult = (claims: Record<string, unknown> | null, error: ClaimssResult["error"] = null): ClaimssResult => ({
  data: claims ? { claims } : null,
  error,
});

describe("getAuthContext", () => {
  beforeEach(() => {
    mocks.getClaims.mockReset();
    mocks.getUser.mockReset();
    mocks.subscription = null;
    mocks.packGrantCount = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("reads the identity from locally verified JWT claims", async () => {
    mocks.getClaims.mockResolvedValue(
      claimsResult({
        sub: "user-1",
        email: "writer@example.com",
        user_metadata: { avatar_url: "https://img.example/a.png" },
      }),
    );
    mocks.subscription = {
      status: "active",
      period_end: "2099-01-01T00:00:00.000Z",
      tier: "creator",
    };
    mocks.packGrantCount = 1;

    const auth = await getAuthContext();

    expect(auth).toMatchObject({
      userId: "user-1",
      email: "writer@example.com",
      avatarUrl: "https://img.example/a.png",
      isPro: true,
      tier: "creator",
      hasPack: true,
    });
    // 本地验签能过的前提就是不再请求 Auth 服务器
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("treats a missing session as a visitor without asking the auth server", async () => {
    mocks.getClaims.mockResolvedValue(
      claimsResult(null, {
        name: "AuthSessionMissingError",
        message: "Auth session missing!",
      }),
    );

    const auth = await getAuthContext();

    expect(auth.userId).toBeNull();
    expect(auth.subscriptionState).toBe("none");
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("falls back to getUser when claim verification itself fails", async () => {
    mocks.getClaims.mockResolvedValue(
      claimsResult(null, { name: "AuthRetryableFetchError", message: "jwks down" }),
    );
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "user-9",
          email: "fallback@example.com",
          user_metadata: { avatar_url: "https://img.example/b.png" },
        },
      },
      error: null,
    });

    const auth = await getAuthContext();

    expect(auth).toMatchObject({
      userId: "user-9",
      email: "fallback@example.com",
      avatarUrl: "https://img.example/b.png",
    });
    expect(mocks.getUser).toHaveBeenCalled();
  });
});
