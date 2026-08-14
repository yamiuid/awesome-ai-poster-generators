import { describe, expect, it } from "vitest";
import { isPrivateAddress } from "./storage";

describe("provider image address checks", () => {
  it("rejects private, loopback, and reserved addresses", () => {
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("10.0.0.8")).toBe(true);
    expect(isPrivateAddress("192.168.1.4")).toBe(true);
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("2001:db8::1")).toBe(true);
  });

  it("allows a public address", () => {
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false);
  });
});
