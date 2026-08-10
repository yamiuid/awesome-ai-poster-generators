import { describe, expect, it } from "vitest";
import { authRedirectUrl } from "./login-form";

describe("authRedirectUrl", () => {
  it("keeps magic-link callbacks on the current test origin", () => {
    expect(
      authRedirectUrl(
        "http://127.0.0.1:3000",
        "/auth/callback?next=%2Fpricing",
      ),
    ).toBe("http://127.0.0.1:3000/auth/callback?next=%2Fpricing");
  });
});
