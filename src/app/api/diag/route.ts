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
