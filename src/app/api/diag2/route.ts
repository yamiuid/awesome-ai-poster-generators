import { NextResponse } from "next/server";
import { parseServerEnv } from "@/lib/server/env";
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin";
import { getPublicEnv } from "@/lib/server/supabase/public-env";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";

type DiagResult = {
  ok: boolean;
  value?: unknown;
  error?: string;
};

function check(name: string, fn: () => unknown): Record<string, DiagResult> {
  try {
    return { [name]: { ok: true, value: fn() } };
  } catch (error) {
    return {
      [name]: {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export async function GET(): Promise<NextResponse> {
  const results: Record<string, unknown> = {};

  // 1. 全部服务端 env 是否可解析
  Object.assign(results, check("parseServerEnv", () => {
    const env = parseServerEnv(process.env);
    return Object.keys(env).sort();
  }));

  Object.assign(results, check("getPublicEnv", () => {
    const env = getPublicEnv();
    return { url: env.url, anonKeyLen: env.anonKey.length };
  }));

  Object.assign(results, check("createSupabaseAdminClient", () => {
    const client = createSupabaseAdminClient();
    return { created: Boolean(client), url: client["supabaseUrl"] ?? "?" };
  }));

  // 2. 模拟 /account 渲染链
  results["serverClient"] = await (async () => {
    try {
      const client = await createSupabaseServerClient();
      return { ok: true, value: "created" };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  })();

  results["getUser"] = await (async () => {
    try {
      const client = await createSupabaseServerClient();
      const { data, error } = await client.auth.getUser();
      if (error) {
        return { ok: false, error: `getUser error: ${error.message}` };
      }
      return {
        ok: true,
        value: { id: data.user?.id, email: data.user?.email },
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  })();

  results["storageSign"] = await (async () => {
    try {
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin.storage
        .from("posters")
        .createSignedUrl(
          "d452cd5a-da61-4a36-be48-9ecc19e3d3ec/43287e00-70a5-4243-9668-13534cdb9237/0.png",
          600,
        );
      if (error) {
        return { ok: false, error: `sign error: ${error.message}` };
      }
      return { ok: true, value: "signed" };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  })();

  return NextResponse.json(results);
}
