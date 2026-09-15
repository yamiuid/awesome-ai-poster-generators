# 图生图功能（Text to Poster 生图区）实施规划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 生图区左侧面板增加「文生图 / 图生图」模式切换，图生图模式支持上传最多 5 张参考图（JPG/PNG/WebP ≤10MB），随生成请求传给 APIMart 走 image-to-image。

**Architecture:** 后端 `generationRequestSchema` 已支持单张 `referenceImageUrl`（http URL），APIMart `submitGeneration` 已透传 `image_urls`（UrlPipelineModal 网页截图场景在用）。本方案在此基础上：① 新增 `POST /api/uploads/reference` 上传接口（校验 + 存 Supabase/R2 `references/` 前缀，返回可公网访问的 URL）；② schema 扩展为 `referenceImageUrls` 数组（≤5）；③ 前端 poster-studio.tsx 左侧面板加模式切换 + 参考图上传区（复刻参考截图交互：空态大虚线 dropzone → 缩略图 + X 删除 + 小上传格续传）。

**Tech Stack:** Next.js App Route Handler、Supabase Storage（或 R2，沿用 `STORAGE_PROVIDER` 开关）、sharp（魔数/像素校验，按需加载）、zod、next-intl。

---

## 现状盘点（已确认的代码事实）

| 能力 | 现状 | 位置 |
|---|---|---|
| 请求 schema 支持参考图 | ✅ 单张 `referenceImageUrl`（http/https，≤2048） | `src/lib/domain/poster.ts:114` |
| APIMart 图生图 | ✅ `image_urls: [url]` | `src/lib/server/apimart.ts:132` |
| 参考图来源 | 仅 UrlPipelineModal（网页截图 URL） | `src/components/url-pipeline-modal.tsx` |
| 文件上传 API | ❌ 无 | — |
| 左侧面板模式切换/上传 UI | ❌ 无 | `src/components/poster-studio.tsx`（controls 区，约 2484-2629 行） |
| 存储 | Supabase `posters` bucket（或 R2），仅 `uploadPoster(path, buffer)` 且 contentType 硬编码 png | `src/lib/server/storage.ts:202` |
| i18n | en / zh-Hant / ja / es 等，`studio` 命名空间 | `src/i18n/messages.ts` |

---

## Task 1: Schema 扩展为多参考图（后端契约）

**Files:**
- Modify: `src/lib/domain/poster.ts:109-129`
- Test: `src/lib/domain/poster.test.ts`（新建，若已有测试文件则追加）

**改动：**
1. `generationRequestSchema` 新增 `referenceImageUrls`，保留 `referenceImageUrl` 向后兼容：

```ts
referenceImageUrls: z
  .array(
    z
      .string()
      .trim()
      .url()
      .max(2048)
      .refine(
        (value) => value.startsWith("http://") || value.startsWith("https://"),
        "Only http(s) image URLs are supported.",
      ),
  )
  .max(5, "At most 5 reference images.")
  .optional(),
```

2. 新增归一化导出（供 route 层使用，旧字段并入数组）：

```ts
export function normalizeReferenceImages(
  input: z.infer<typeof generationRequestSchema>,
): string[] {
  const urls = new Set<string>([
    ...(input.referenceImageUrls ?? []),
    ...(input.referenceImageUrl ? [input.referenceImageUrl] : []),
  ]);
  return [...urls].slice(0, 5);
}
```

**Step 1:** 写失败测试（合法数组 ≤5 通过；>5 拒绝；非 http URL 拒绝；旧 `referenceImageUrl` 归一化并入）。
**Step 2:** `pnpm vitest run src/lib/domain/poster.test.ts` 确认 FAIL。
**Step 3:** 实现 schema + 归一化函数。
**Step 4:** 重跑测试 PASS。
**Step 5:** Commit: `feat: support up to 5 reference image urls in generation schema`

---

## Task 2: APIMart 透传多图

**Files:**
- Modify: `src/lib/server/apimart.ts:116-140`（`ProviderGenerationRequest` 类型 + submit json）
- Modify: `src/lib/server/generation-create.ts:236`（metadata `hasReferenceImage` → `hasReferenceImage` + `referenceImageCount`）

**改动：** `ProviderGenerationRequest` 增加 `referenceImageUrls?: readonly string[]`；提交体改为：

```ts
...(request.referenceImageUrls?.length
  ? { image_urls: [...request.referenceImageUrls] }
  : {}),
```

`generation-create.ts` 内把 `normalizeReferenceImages(parsed.data)` 的结果同时传给 apimart 请求和 metadata（不落库新列，仅 metadata 记张数；如需长期统计再开 migration，YAGNI）。

**验证：** `pnpm vitest run`（apimart 若有 payload 测试则更新断言 `image_urls` 为数组）→ Commit: `feat: pass multiple reference images to apimart`

---

## Task 3: 参考图上传接口 `POST /api/uploads/reference`

**Files:**
- Create: `src/app/api/uploads/reference/route.ts`
- Create: `src/lib/server/uploads.ts`（校验工具）
- Modify: `src/lib/server/storage.ts`（通用化上传 + 取 URL）
- Test: `src/lib/server/uploads.test.ts`

### 3.1 storage.ts 通用化

新增（不动现有 `uploadPoster`，避免波及生成链路）：

```ts
export async function uploadReference(
  path: string,
  image: Buffer,
  contentType: string,
): Promise<void> {
  if (getServerEnv().STORAGE_PROVIDER === "r2") {
    await getS3Client().send(new PutObjectCommand({
      Bucket: getServerEnv().R2_BUCKET, Key: path, Body: image,
      ContentType: contentType, CacheControl: "public, max-age=31536000, immutable",
    }));
    return;
  }
  const { error } = await createSupabaseAdminClient()
    .storage.from("posters")
    .upload(path, image, { contentType, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(`Could not persist reference image: ${error.message}`);
}

// 参考图 URL：R2 → keyToPublicUrl；Supabase → POSTER_URL_MODE=public ? getPublicUrl : createSignedUrl(3600)
export async function createReferenceUrl(path: string): Promise<string> { ... }
```

⚠️ 注意：signed URL 有效期给 3600s（`createPosterUrl` 的 600s 是给即时下载用的；参考图在提交生成时立即被 APIMart 拉取，1 小时足够）。生产当前 `POSTER_URL_MODE=public`，直接 publicUrl，最省心。

### 3.2 uploads.ts 校验

```ts
export const REFERENCE_MAX_BYTES = 10 * 1024 * 1024;
export const REFERENCE_MAX_PIXELS = 24_000_000; // 约 6000x4000
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

// 1) 魔数嗅探（不信任 Content-Type）：jpeg FF D8 FF / png 89 50 4E 47 / webp RIFF....WEBP
export function sniffImageMime(bytes: Uint8Array): string | null;
// 2) sharp 读 metadata 校验像素总量（按需 import，参照 storage.ts:178 的懒加载模式）
export async function assertReferenceImage(bytes: Buffer): Promise<string>; // returns mime
```

### 3.3 route.ts

```
POST /api/uploads/reference
- multipart/form-data, field "file"
- 鉴权：复用 getAuthContext() + getGuestIdentity()（与 /api/generations 同源身份，guest 也允许上传——其生成本就限 2 次，滥用面可控）
- 路径：references/{actorId}/{crypto.randomUUID()}.{ext}   ← path 全部服务端生成，无用户可控字符串
- 简单内存限速：同一 actor 60s 内最多 10 次（Map<actor, timestamps[]>；serverless 每实例独立，MVP 够用）
- 200: { url }；400: INVALID_REFERENCE_FILE（类型/大小/像素）；429: UPLOAD_RATE_LIMITED；500: UPLOAD_FAILED
```

**Step 1:** uploads.ts 测试（魔数嗅探各格式 + 伪造 content-type 拒绝）→ FAIL → 实现 → PASS。
**Step 2:** 实现 route + storage 扩展。
**Step 3:** `tsc --noEmit` + `biome check` + `vitest run`。
**Step 4:** Commit: `feat: reference image upload api`

---

## Task 4: 前端 UI（核心交互）

**Files:**
- Modify: `src/components/poster-studio.tsx`（controls 区 + 新组件）
- Modify: `src/app/globals.css`（`.studio-controls` 相关样式所在文件；以全局搜 `.studio-controls` / `.prompt-field` 确认）

### 4.1 状态与数据流

```ts
type GenerationMode = "text" | "image";
const [mode, setMode] = useState<GenerationMode>("text");
const [referenceImages, setReferenceImages] = useState<
  ReadonlyArray<{ id: string; url: string; previewUrl: string }>
>([]);
const [uploading, setUploading] = useState(false);
```

- `previewUrl` 用本地 `URL.createObjectURL(file)` 秒显缩略图，上传成功后替换为服务端 URL 并 revoke objectURL；失败则移除并报错。
- 切回 text 模式**不清空**已传参考图（用户误切可找回）；仅 `resetStudio()` 时清空。

### 4.2 UI 结构（controls 区顶部，参考截图交互）

```
[模式切换 segmented]  文生图 | 图生图        ← role="tablist" 或 radiogroup，复用 .studio-tab 样式基调
mode === "image" 时插入：
  参考图 ................................. n/5
  ┌─ 虚线框（.reference-dropzone）───────┐
  │ n=0: 图标 + 「选择或拖拽参考图」      │  ← 点击触发 hidden <input type="file" multiple accept="image/jpeg,image/png,image/webp">
  │       JPG、PNG 或 WebP，最大 10MB    │     拖拽：onDragOver preventDefault + onDrop 取 dataTransfer.files
  │ n≥1: [缩略图+X]… [小上传格]          │  ← 缩略图 96px 方格，X 悬停白色圆钮；满 5 张隐藏上传格
  └──────────────────────────────────────┘
  描述 textarea → placeholder 切换为「描述你想修改的内容」（i18n key: describeEditPrompt）
```

- 校验失败（类型/大小）前端即时 toast/行内错误（复用 `.error-message`），不发请求。
- 上传中：上传格显示 `LoaderCircle` 旋转；同 `{ timeout: 30_000 }` POST FormData 到 `/api/uploads/reference`。
- 追踪：`track("reference_image_added")` / `track("generation_started_image_mode")`。

### 4.3 generate() 接入

- `mode === "image"`：提交前校验 `referenceImages.length >= 1`（为 0 时 setError，不弹升级窗）；payload 带 `referenceImageUrls: referenceImages.map(r => r.url)`，`inputType` 维持现有 detect 逻辑。
- `mode === "text"`：行为与现状完全一致（不带参考图字段）。
- 积分估算 `batchCreditCost` 不变（默认同价，见开放问题 Q3）。

### 4.4 样式要点

- 虚线 dropzone：`border: 1.5px dashed var(--border)`、圆角与 `.prompt-field` 一致、hover/focus-within 高亮；深浅色主题都走 CSS 变量。
- 单层卡片、线性 Lucide 图标（`ImagePlus`/`Upload`/`X`），禁 emoji。

**Commit:** `feat: studio image-to-poster mode with reference upload ui`

---

## Task 5: i18n 文案（全部 locale）

**Files:** `src/i18n/messages.ts`（`studio` 命名空间，en/zh-Hant/ja/es 全量补齐，缺一 locale 会 build 报错）

新增 key：`modeTextToPoster`（Text → Poster / 文生图）、`modeImageToPoster`（Image → Poster / 图生图）、`referenceImages`（Reference images / 参考图）、`dropzoneTitle`、`dropzoneHint`、`describeEditPrompt`、`uploadFailed`、`fileTooLarge`、`fileTypeUnsupported`、`tooManyReferences`、`needReferenceImage`。

**Commit:** `feat: i18n strings for image-to-poster mode`

---

## Task 6: 参考图生命周期清理

**Files:** `src/app/api/cron/maintenance/route.ts`（现有 cron 已清理过期 posters）

- 清理逻辑扩到 `references/` 前缀：删除超过 30 天的参考图（生成只用当次，无保留价值；与 posters 保留策略对齐即可）。
- R2 分支同 prefix 列举删除。

**Commit:** `chore: purge stale reference images in maintenance cron`

---

## Task 7: 全量验证 + 冒烟

1. `pnpm tsc --noEmit` && `pnpm biome check .` && `pnpm vitest run`
2. 本地 dev（8787 端口，`NODE_OPTIONS="--use-env-proxy"` 启动，见项目 memory）：
   - 文生图回归：不传参考图正常生成
   - 图生图：上传 jpg/png/webp 各一、拖拽、删除、满 5 张、10MB 超限拒绝、非图片拒绝
   - UrlPipelineModal 回归：网页截图路径（旧 `referenceImageUrl` 字段）仍可用
   - guest / free / pro 三种身份各点一次 Generate
3. **只 commit + push，不触发 Vercel 部署**（用户既定规则）。

---

## 开放问题（默认按推荐值实施，可改）

| # | 问题 | 推荐 |
|---|---|---|
| Q1 | 参考图数量上限 | **5 张**（对齐参考截图 0/5；APIMart `image_urls` 本身是数组） |
| Q2 | 游客是否可上传 | **允许**（guest 生成本来限 2 次，上传配额随之收敛） |
| Q3 | 图生图积分定价 | **与文生图同价起步**，观察 APIMart 成本后再调（截图产品是 2→3 积分） |
| Q4 | 图生图模式下「艺术方向」下拉 | **保留**（模型可融合风格），默认 auto |
