import { describe, expect, it } from "vitest";
import {
  isUploadRateLimited,
  referenceExtension,
  sniffImageMime,
} from "./uploads";

function pngBytes(): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
  ]);
}

function jpegBytes(): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
}

function webpBytes(): Uint8Array {
  // RIFF + size(4) + WEBP
  const bytes = new Uint8Array(12);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  return bytes;
}

describe("sniffImageMime", () => {
  it("detects png by magic bytes", () => {
    expect(sniffImageMime(pngBytes())).toBe("image/png");
  });

  it("detects jpeg by magic bytes", () => {
    expect(sniffImageMime(jpegBytes())).toBe("image/jpeg");
  });

  it("detects webp by RIFF + WEBP mark", () => {
    expect(sniffImageMime(webpBytes())).toBe("image/webp");
  });

  it("rejects a RIFF container that is not WEBP", () => {
    const bytes = new Uint8Array(12);
    bytes.set([0x52, 0x49, 0x46, 0x46], 0);
    bytes.set([0x57, 0x41, 0x56, 0x45], 8); // WAVE
    expect(sniffImageMime(bytes)).toBeNull();
  });

  it("returns null for text content with an image content-type", () => {
    const text = new TextEncoder().encode("<html>not an image</html>");
    expect(sniffImageMime(text)).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(sniffImageMime(new Uint8Array())).toBeNull();
  });
});

describe("referenceExtension", () => {
  it("maps mimes to file extensions", () => {
    expect(referenceExtension("image/jpeg")).toBe("jpg");
    expect(referenceExtension("image/png")).toBe("png");
    expect(referenceExtension("image/webp")).toBe("webp");
    expect(referenceExtension("application/zip")).toBe("bin");
  });
});

describe("isUploadRateLimited", () => {
  it("allows up to 10 uploads per minute per actor then blocks", () => {
    const actor = "test-actor-1";
    for (let index = 0; index < 10; index += 1) {
      expect(isUploadRateLimited(actor, 1_000 + index)).toBe(false);
    }
    expect(isUploadRateLimited(actor, 1_050)).toBe(true);
    // 窗口滑过后放行
    expect(isUploadRateLimited(actor, 61_100)).toBe(false);
  });

  it("tracks actors independently", () => {
    expect(isUploadRateLimited("actor-a", 2_000)).toBe(false);
    expect(isUploadRateLimited("actor-b", 2_000)).toBe(false);
  });
});
