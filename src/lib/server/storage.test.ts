import { beforeEach, describe, expect, it, vi } from "vitest";
import { getServerEnv } from "./env";
import {
  createPosterUrl,
  deletePoster,
  isPrivateAddress,
  keyToPublicUrl,
  uploadPoster,
} from "./storage";
import { createSupabaseAdminClient } from "./supabase/admin";

vi.mock("./supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("./env", () => ({
  getServerEnv: vi.fn(),
}));

const s3SendMock = vi.fn();
vi.mock("@aws-sdk/client-s3", () => {
  class S3Client {
    send = s3SendMock;
  }
  class PutObjectCommand {
    constructor(public input: unknown) {}
  }
  class DeleteObjectsCommand {
    constructor(public input: unknown) {}
  }
  return { S3Client, PutObjectCommand, DeleteObjectsCommand };
});

const mockedAdmin = vi.mocked(createSupabaseAdminClient);
const mockedEnv = vi.mocked(getServerEnv);

function mockSupabaseProvider(): void {
  mockedEnv.mockReturnValue({
    POSTER_URL_MODE: "signed",
    STORAGE_PROVIDER: "supabase",
  } as never);
}

function mockR2Provider(): void {
  mockedEnv.mockReturnValue({
    STORAGE_PROVIDER: "r2",
    R2_ACCOUNT_ID: "acct",
    R2_ACCESS_KEY_ID: "ak",
    R2_SECRET_ACCESS_KEY: "sk",
    R2_BUCKET: "posters",
    R2_PUBLIC_BASE_URL: "https://images.texttoposter.com/",
  } as never);
}

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

describe("createPosterUrl (supabase provider)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSupabaseProvider();
  });

  it("uses getPublicUrl in public mode", async () => {
    mockedEnv.mockReturnValue({
      POSTER_URL_MODE: "public",
      STORAGE_PROVIDER: "supabase",
    } as never);
    mockedAdmin.mockReturnValue({
      storage: {
        from: () => ({
          getPublicUrl: (path: string) => ({
            data: {
              publicUrl: `https://example.supabase.co/storage/v1/object/public/posters/${path}`,
            },
          }),
          createSignedUrl: vi.fn(),
        }),
      },
    } as never);

    await expect(createPosterUrl("u/1/0.png")).resolves.toBe(
      "https://example.supabase.co/storage/v1/object/public/posters/u/1/0.png",
    );
  });

  it("uses createSignedUrl by default", async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: "https://example.supabase.co/object/sign/…" },
      error: null,
    });
    mockedAdmin.mockReturnValue({
      storage: {
        from: () => ({ createSignedUrl, getPublicUrl: vi.fn() }),
      },
    } as never);

    await expect(createPosterUrl("u/1/0.png")).resolves.toBe(
      "https://example.supabase.co/object/sign/…",
    );
    expect(createSignedUrl).toHaveBeenCalledWith("u/1/0.png", 600);
  });
});

describe("R2 provider", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockR2Provider();
  });

  it("returns a static public URL from createPosterUrl", async () => {
    await expect(createPosterUrl("u/1/0.png")).resolves.toBe(
      "https://images.texttoposter.com/u/1/0.png",
    );
  });

  it("encodes path segments and trims trailing slashes", () => {
    expect(keyToPublicUrl("guest/a b/0.png")).toBe(
      "https://images.texttoposter.com/guest/a%20b/0.png",
    );
    expect(keyToPublicUrl("u/1/0.png")).toBe(
      "https://images.texttoposter.com/u/1/0.png",
    );
  });

  it("uploads with PutObjectCommand and immutable cache headers", async () => {
    s3SendMock.mockResolvedValue({});
    const image = Buffer.from("png-bytes");
    await uploadPoster("u/1/0.png", image);
    expect(s3SendMock).toHaveBeenCalledTimes(1);
    const command = s3SendMock.mock.calls[0]?.[0] as { input?: unknown };
    expect(command.input).toEqual({
      Bucket: "posters",
      Key: "u/1/0.png",
      Body: image,
      ContentType: "image/png",
      CacheControl: "public, max-age=31536000, immutable",
    });
  });

  it("deletes objects in chunks of 1000 keys", async () => {
    s3SendMock.mockResolvedValue({ Errors: [] });
    const keys = Array.from({ length: 1001 }, (_, i) => `u/g${i}/0.png`);
    await deletePoster(keys);
    expect(s3SendMock).toHaveBeenCalledTimes(2);
    const first = s3SendMock.mock.calls[0]?.[0] as { input?: unknown };
    const second = s3SendMock.mock.calls[1]?.[0] as { input?: unknown };
    const firstDelete = first?.input as { Delete: { Objects: unknown[] } };
    const secondDelete = second?.input as { Delete: { Objects: unknown[] } };
    expect(firstDelete.Delete.Objects).toHaveLength(1000);
    expect(secondDelete.Delete.Objects).toHaveLength(1);
  });
});

describe("deletePoster (supabase provider)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSupabaseProvider();
  });

  it("removes the given paths from the posters bucket", async () => {
    const remove = vi.fn().mockResolvedValue({ error: null });
    mockedAdmin.mockReturnValue({
      storage: { from: () => ({ remove }) },
    } as never);
    await deletePoster(["a/0.png", "b/0.png"]);
    expect(remove).toHaveBeenCalledWith(["a/0.png", "b/0.png"]);
  });
});
