#!/usr/bin/env node
/**
 * 线上库迁移漂移检查。
 *
 * 线上 schema 不总是通过 supabase CLI 应用（有一部分是直接执行 SQL 落地的），
 * 于是「仓库里有迁移文件、线上却没这一列」这种漂移只能靠人肉发现。
 * 这个脚本把每个迁移文件里声明的表 / 列 / 函数和线上库实际结构做一次比对，
 * 缺什么就报什么，退出码非 0，方便放进 CI 或上线前手动跑一次。
 *
 * 注意：只检查对象是否存在，不检查函数签名 / 约束细节是否与文件一致
 * （例如历史上出现过的 RPC 重载冲突需要单独核对）。
 *
 * 用法：
 *   node scripts/check-prod-schema.mjs
 * 凭据来源（按顺序）：
 *   1. 环境变量 SUPABASE_ACCESS_TOKEN
 *   2. ~/.workbuddy/secrets/credentials.json 里 scope=awesome-ai-poster-generators
 * 目标项目 ref 取自 .env.local 的 NEXT_PUBLIC_SUPABASE_URL。
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readdir } from "node:fs/promises";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const ENV_FILE = join(process.cwd(), ".env.local");
const CREDENTIALS_FILE = join(
  homedir(),
  ".workbuddy",
  "secrets",
  "credentials.json",
);

function readEnvLocal(name) {
  const raw = readFileSync(ENV_FILE, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match && match[1] === name) {
      return match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  return undefined;
}

function projectRef() {
  const url = readEnvLocal("NEXT_PUBLIC_SUPABASE_URL");
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing from .env.local");
  }
  const ref = new URL(url).hostname.split(".")[0];
  if (!ref) {
    throw new Error(`Could not derive the project ref from ${url}`);
  }
  return ref;
}

function accessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) {
    return process.env.SUPABASE_ACCESS_TOKEN.trim();
  }
  try {
    const store = JSON.parse(readFileSync(CREDENTIALS_FILE, "utf8"));
    const token =
      store?.scopes?.["awesome-ai-poster-generators"]?.SUPABASE_ACCESS_TOKEN;
    if (typeof token === "string" && token.length > 0) {
      return token.trim();
    }
  } catch {
    // 没有本地凭据库就走下面的报错
  }
  throw new Error(
    "Set SUPABASE_ACCESS_TOKEN or add it to ~/.workbuddy/secrets/credentials.json",
  );
}

function checksForMigration(file, sql) {
  const checks = [];
  // 先去掉注释：迁移文件里 SQL 前面常有说明性注释，
  // 否则按语句切分后「alter table」不在行首，检查会被整体漏掉。
  const cleaned = sql
    .replace(/^[ \t]*--.*$/gm, "")
    .replace(/[ \t]+--.*$/gm, "");
  // 按语句切分：一个 alter table 可以带多个 add column，
  // 靠「离得最近的那个 alter table」猜表名会张冠李戴（011 就踩过）。
  for (const statement of cleaned.split(";")) {
    const alter = /^\s*alter table\s+(?:if exists\s+)?public\.(\w+)/i.exec(
      statement,
    );
    if (!alter) {
      continue;
    }
    const tableName = alter[1];
    for (const match of statement.matchAll(
      /add column (?:if not exists )?(\w+)/g,
    )) {
      checks.push({
        item: `${file}|column ${tableName}.${match[1]}`,
        sql: `exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name='${tableName}' and c.column_name='${match[1]}')`,
      });
    }
  }
  for (const match of cleaned.matchAll(
    /create table (?:if not exists )?public\.(\w+)/g,
  )) {
    const table = match[1];
    checks.push({
      item: `${file}|table ${table}`,
      sql: `exists(select 1 from information_schema.tables where table_schema='public' and table_name='${table}')`,
    });
  }
  for (const match of cleaned.matchAll(
    /create (?:or replace )?function public\.(\w+)/g,
  )) {
    const fn = match[1];
    checks.push({
      item: `${file}|function ${fn}`,
      sql: `exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='${fn}')`,
    });
  }
  return checks;
}

async function main() {
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const checks = [];
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    checks.push(...checksForMigration(file, sql));
  }
  if (checks.length === 0) {
    console.log("No migration statements to check.");
    return;
  }

  const query = `select item, present from ( ${checks
    .map((check) => `select '${check.item}' as item, ${check.sql} as present`)
    .join(" union all ")} ) t order by present asc, item`;

  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef()}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Supabase management API returned ${response.status}: ${await response.text()}`,
    );
  }

  const rows = await response.json();
  const missing = rows.filter((row) => !row.present);
  console.log(`Checked ${rows.length} migration statements.`);
  if (missing.length === 0) {
    console.log("Production schema matches every migration file.");
    return;
  }
  console.error(`\n${missing.length} statement(s) missing from production:`);
  for (const row of missing) {
    console.error(`  - ${row.item}`);
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
