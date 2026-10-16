import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({
  proxied: vi.fn<typeof fetch>(),
  direct: vi.fn<typeof fetch>(),
  createProxiedFetch: vi.fn<() => typeof fetch | undefined>(),
}));

vi.mock("../proxy-fetch", () => ({
  createProxiedFetch: transport.createProxiedFetch,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: vi.fn() }),
}));
vi.mock("./public-env", () => ({
  getPublicEnv: () => ({
    url: "https://supabase.test",
    anonKey: "test-anon-key",
  }),
}));
vi.mock("@/lib/server/env", () => ({
  getServerEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://supabase.test",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
  }),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  const respond = async () =>
    new Response("[]", { headers: { "Content-Type": "application/json" } });
  transport.proxied.mockImplementation(respond);
  transport.direct.mockImplementation(respond);
  vi.stubGlobal("fetch", transport.direct);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Supabase server transport", () => {
  for (const kind of ["server", "admin"] as const) {
    it.each([true, false])(
      `${kind} uses the selected transport when a proxy is configured: %s`,
      async (proxyConfigured) => {
        transport.createProxiedFetch.mockReturnValue(
          proxyConfigured ? transport.proxied : undefined,
        );
        const client =
          kind === "server"
            ? await (await import("./server")).createSupabaseServerClient()
            : (await import("./admin")).createSupabaseAdminClient();

        const result = await client.from("profiles").select("id");

        expect(result.error).toBeNull();
        expect(result.data).toEqual([]);
        expect(
          proxyConfigured ? transport.proxied : transport.direct,
        ).toHaveBeenCalledTimes(1);
        expect(
          proxyConfigured ? transport.direct : transport.proxied,
        ).not.toHaveBeenCalled();
      },
    );
  }
});
