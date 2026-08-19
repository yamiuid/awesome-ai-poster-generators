import { existsSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { NextResponse } from "next/server";

// 临时诊断端点，验证后删除
const DIAG_KEY = "diag-7f3a91c2e8d54b60";

function listFiles(dir: string, depth = 0): string[] {
  if (depth > 3 || !existsSync(dir)) {
    return [];
  }
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    const result: string[] = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        result.push(...listFiles(full, depth + 1));
      } else {
        result.push(full);
      }
    }
    return result;
  } catch {
    return [];
  }
}

export async function GET(request: Request): Promise<Response> {
  if (request.headers.get("x-diag-key") !== DIAG_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const require = createRequire(import.meta.url);
  const root = process.cwd();
  const info: Record<string, unknown> = {
    cwd: root,
    node: process.version,
  };

  try {
    const sharpPath = require.resolve("sharp");
    info["sharpResolved"] = sharpPath;
    info["sharpVersion"] = require(
      path.join(path.dirname(sharpPath), "package.json"),
    ).version;
  } catch (error) {
    info["sharpResolved"] = `ERROR: ${(error as Error).message}`;
  }

  const imgDir = path.join(root, "node_modules", "@img");
  info["imgDir"] = imgDir;
  info["imgDirExists"] = existsSync(imgDir);
  info["imgEntries"] = existsSync(imgDir)
    ? readdirSync(imgDir).map((name) => {
        const full = path.join(imgDir, name);
        return { name, dir: statSync(full).isDirectory() };
      })
    : [];

  for (const pkg of ["@img/sharp-linux-x64", "@img/sharp-libvips-linux-x64"]) {
    const dir = path.join(imgDir, pkg);
    info[pkg] = existsSync(dir)
      ? {
          exists: true,
          soFiles: listFiles(dir).filter((file) => file.endsWith(".so")),
          allFiles: listFiles(dir),
        }
      : { exists: false };
  }

  try {
    const sharp = require("sharp");
    info["sharpLoad"] = `OK ${sharp.versions?.vips ?? ""}`;
  } catch (error) {
    info["sharpLoad"] = `ERROR: ${(error as Error).message}`;
  }

  // 与 storage.ts 相同的动态 import 方式
  try {
    const mod = await import("sharp");
    const sharp = mod.default ?? mod;
    info["dynamicImportLoad"] = `OK ${sharp.versions?.vips ?? ""}`;
  } catch (error) {
    info["dynamicImportLoad"] = `ERROR: ${(error as Error).message}`;
  }

  try {
    const resolved = import.meta.resolve?.("sharp");
    info["importMetaResolve"] = resolved ?? "unsupported";
  } catch (error) {
    info["importMetaResolve"] = `ERROR: ${(error as Error).message}`;
  }

  for (const dir of [
    path.join(root, ".next", "server"),
    path.join(root, ".next", "server", "node_modules"),
    path.join(root, ".next", "server", "node_modules", "sharp"),
    path.join(root, ".next", "server", "node_modules", "@img"),
  ]) {
    info[`exists:${dir}`] = existsSync(dir);
  }

  return NextResponse.json(info);
}
