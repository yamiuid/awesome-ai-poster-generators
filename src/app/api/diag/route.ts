import { createRequire } from "node:module";
import { NextResponse } from "next/server";

// 临时诊断端点：定位 Vercel 生产环境模块加载失败的问题（修复后删除）
const require = createRequire(import.meta.url);

export async function GET(): Promise<Response> {
  const results: Record<string, string> = {};

  try {
    const sharp = require("sharp");
    results["sharp"] = `OK vips=${sharp.versions?.vips ?? "?"} format=${sharp.format ? "ok" : "?"}`;
  } catch (error) {
    results["sharp"] = `FAIL ${error instanceof Error ? error.message : String(error)}`;
  }

  // 平台二进制包检查（Linux x64）
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  try {
    const sharpPath = require.resolve("sharp");
    results["sharpPath"] = sharpPath;
    const imgDir = path.join(path.dirname(sharpPath), "..", "..", "..", "@img");
    if (fs.existsSync(imgDir)) {
      results["imgDir"] = fs.readdirSync(imgDir).join(", ");
    } else {
      results["imgDir"] = `NOT FOUND at ${imgDir}`;
    }
  } catch (error) {
    results["resolveSharp"] = `FAIL ${error instanceof Error ? error.message : String(error)}`;
  }

  try {
    require("../../../../lib/server/storage");
    results["storage"] = "OK";
  } catch (error) {
    results["storage"] = `FAIL ${error instanceof Error ? error.message : String(error)}`;
  }

  try {
    require("../../../../lib/server/generation-poll");
    results["generationPoll"] = "OK";
  } catch (error) {
    results["generationPoll"] = `FAIL ${error instanceof Error ? error.message : String(error)}`;
  }

  try {
    require("../../../../lib/server/apimart");
    results["apimart"] = "OK";
  } catch (error) {
    results["apimart"] = `FAIL ${error instanceof Error ? error.message : String(error)}`;
  }

  return NextResponse.json(results);
}
