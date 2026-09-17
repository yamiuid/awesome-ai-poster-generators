import { describe, expect, it } from "vitest";
import {
  emailDomainCandidates,
  parseDisposableDomainList,
} from "./email-blocklist";

describe("parseDisposableDomainList", () => {
  it("keeps one lowercased domain per line and drops noise", () => {
    const parsed = parseDisposableDomainList(
      [
        "# comment",
        "",
        "  UberIP.com  ",
        "necub.com",
        "uberip.com",
        "https://lnovic.com",
        "not a domain",
        "*.wildcard.com",
      ].join("\n"),
    );
    expect(parsed).toEqual(["uberip.com", "necub.com"]);
  });

  it("returns an empty list for an empty payload", () => {
    expect(parseDisposableDomainList("")).toEqual([]);
  });
});

describe("emailDomainCandidates", () => {
  it("walks parent domains but never the bare TLD", () => {
    expect(emailDomainCandidates("a.b@mail.uberip.com")).toEqual([
      "mail.uberip.com",
      "uberip.com",
    ]);
  });

  it("handles plain domains and malformed input", () => {
    expect(emailDomainCandidates("user@gmail.com")).toEqual(["gmail.com"]);
    expect(emailDomainCandidates("not-an-email")).toEqual([]);
    expect(emailDomainCandidates("user@localhost")).toEqual([]);
  });

  it("uses the last @ so display names do not confuse it", () => {
    expect(emailDomainCandidates("weird@name@uberip.com")).toEqual([
      "uberip.com",
    ]);
  });
});
