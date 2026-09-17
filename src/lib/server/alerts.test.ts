import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  webhookUrl: undefined as string | undefined,
}));

vi.mock("./env", () => ({
  getServerEnv: () => ({ ALERT_WEBHOOK_URL: mocks.webhookUrl }),
}));

import { sendAlert } from "./alerts";

describe("sendAlert", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    mocks.webhookUrl = undefined;
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("only logs when no webhook is configured", async () => {
    await sendAlert("generation.poll_exhausted", { generationId: "gen-1" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it("posts a text payload when a webhook is configured", async () => {
    mocks.webhookUrl = "https://hooks.example.com/abc";

    await sendAlert("generation.poll_exhausted", { generationId: "gen-1" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://hooks.example.com/abc",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("generation.poll_exhausted"),
      }),
    );
  });

  it("never lets a delivery failure bubble up", async () => {
    mocks.webhookUrl = "https://hooks.example.com/abc";
    fetchMock.mockRejectedValue(new Error("network down"));

    await expect(
      sendAlert("generation.poll_exhausted", { generationId: "gen-1" }),
    ).resolves.toBeUndefined();
  });
});
