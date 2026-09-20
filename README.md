# Awesome AI Poster Generators

> A curated list of AI-powered poster makers — turn text into posters in seconds.

## The list

- [**Text to Poster**](https://texttoposter.com) — Describe a subject, mood, or words (or paste a URL / drop a reference image), and get **up to four poster directions in seconds**. Free to try without login (watermarked previews); Pro unlocks full resolution, quality presets, and private history. Built with Next.js, Supabase, Cloudflare R2, and GPT Image 2.5. **Our project.**
- [Canva](https://www.canva.com/ai-image-generator/) — All-in-one design platform with AI image generation and poster templates.
- [Ideogram](https://ideogram.ai) — AI image generator known for reliable text rendering, popular for posters and typography.
- [Recraft](https://www.recraft.ai) — AI generation focused on text, brand styles, and vector-style posters.
- [Microsoft Designer](https://designer.microsoft.com) — Free AI design tool with poster, social, and brand templates.

---

## Text to Poster

> **AI Poster Maker — Generate Posters from Text, URL, or Reference Image in Seconds**

[**texttoposter.com**](https://texttoposter.com)

Turn a written brief — or any web page — into up to four private poster directions in seconds. Describe the subject, mood, audience, or the words you want to see, paste a URL to analyze, or attach a reference image; the studio generates distinct compositions you can compare, keep, and download — no design skills needed.

A paid English-language MVP built with Next.js, Supabase, Cloudflare R2, and GPT Image 2.5 (via APIMart). Guests can try it free (watermarked previews, 2 lifetime generations, 1 reference image); a free account downloads without a watermark and attaches 2 reference images, while Creator and Studio plans unlock full resolution, high quality, up to 5 reference images, and private history.

### What's inside

- **Three input modes** — write an idea, paste a URL, or attach a reference image (image-to-image).
- **AI Brief assistant** — drop raw text or a link and the assistant extracts a structured brief (headline, subtitle, 3 points, CTA) ready to generate.
- **URL-to-poster pipeline** — paste any page; the server fetches, extracts, understands, and streams a poster brief in six steps.
- **Up to 4 poster directions per run** — pick 1–4 images; free accounts get 1–2, Pro unlocks up to 4.
- **17 visual styles** — Auto, Movie, Minimal, Anime, Business, Vintage, Neon (featured) plus Swiss, Typography, Collage, Photography, Illustration, Surreal, Fashion, Brutalist, Art Deco, Y2K.
- **Flexible formats** — 8 aspect ratios (1:1 → 9:16) and 1K–4K resolutions with Low/Medium/High quality.
- **Free tier without an account** — guests get 2 lifetime watermarked generations, salted & hashed guest key (no raw IP/browser tracking).
- **Magic-link & Google sign-in** — email verification-code login with resend countdown.
- **Private history** — every generation saved to your account with large previews, full-size lightbox, one-click download.
- **Paid plans** — Creator $9.90/mo and Studio $19.90/mo (annual options), billed through Waffo (merchant of record).
- **Credits system** — monthly credit windows with atomic batch charging and a transaction ledger.
- **Prompt safety** — inputs are screened before generation.

### Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router, Server Components, Turbopack) + React 19 |
| Styling | Custom design tokens + Tailwind CSS v4 |
| Database & Auth | Supabase (Postgres + RLS, GoTrue PKCE auth) |
| Image storage | Supabase Storage **or** Cloudflare R2 (S3-compatible) via `STORAGE_PROVIDER` |
| Image generation | APIMart `gpt-image-2.5-flare` (GPT Image 2.5); text model for brief/URL analysis |
| Payments | Waffo (`@waffo/pancake-ts` SDK): checkout, webhooks, subscription lifecycle |
| Watermarking | Sharp (composite + PNG) |
| Language | TypeScript, validated with Zod |
| Quality gates | Biome, Vitest, `tsc --noEmit` |
| Ops | `robots.ts` / `sitemap.ts` SEO, cron maintenance route, SSE progress streaming |

### Repository layout

```text
src/app/[locale]/        localized pages (en / zh-TW / ja / es / ar)
  page.tsx               studio (idea / url / reference image)
  account/               billing, history
  pricing/ login/ checkout/ qa-header-check/
  about/ movie|minimal|anime|business|vintage|neon-poster-maker/   marketing + style landings
src/app/(unlocalized)/   privacy/ terms/ refunds/ ai-policy/   English only, no locale prefix
src/app/global-not-found.tsx   full-document 404 (multiple root layouts)
src/components/site-document.tsx   shared <html>/<body> shell used by both root layouts
src/middleware.ts        locale prefix normalization (as-needed) + session refresh for /account, /checkout
src/app/api/             route handlers
    brief/               AI brief from text or URL
    url/analyze/         streamed URL → poster brief pipeline
    url-preview/         page fetch + extract (cheerio)
    generations/         create / poll / recent / [id] advance / give-up
    checkout/ subscription/cancel/ webhooks/waffo/   billing
    account/status/ cron/maintenance/ diag/sharp/
src/components/          studio, history gallery, auth forms, url pipeline modal
src/lib/server/          providers (APIMart, Waffo, Supabase, R2 storage), generation pipeline, auth, rate-limit, prompt-safety
src/lib/domain/          schemas, pricing/credit rules, styles, brief, url-analyze
supabase/migrations/     SQL migrations (run in filename order)
scripts/                 migrate-posters-to-r2.mjs
```

Marketing and style landing pages are statically prerendered per locale (one HTML per
language, served from the CDN), so a page view no longer costs a server render. Sign-in
state for those pages is resolved in the browser via `/api/account/status`; only
`/account`, `/account/billing`, `/checkout`, `/login` and the API routes render per
request.

### Cloudflare Workers（迁移分支 codex/cloudflare-workers）

应用已能在 Cloudflare Workers 上完整运行（vinext，Cloudflare 目前推荐的 Next.js 路径），
预览环境：`https://text-to-poster.yami198950.workers.dev`。生产域名仍未切换。

- **构建 / 部署**：`pnpm build:vinext` 与 `pnpm deploy:vinext`。后者先带 Workers 开关
  构建、再用 `--skip-build` 部署——`vinext-cloudflare deploy` 默认会自己重建，会丢掉
  那个开关。
- **资源**：应用 Worker `text-to-poster`；边缘缓存服务 `text-to-poster-response-store`
  （配置已切到 `cdnAdapter()`/Workers Cache，该服务保留备用）；定时调度 Worker
  `cloudflare/cron-dispatcher`（两条 cron 触发 `/api/cron/*`，沿用 `CRON_SECRET` 校验）。
- **绑定**：`IMAGES`（Cloudflare Images：水印合成与尺寸读取）、`ASSETS`、
  `RESPONSE_STORE`（备用）。
- **密钥**：`wrangler secret bulk` 推送。**不要推 `APIMART_PROXY` / `HTTPS_PROXY`**——
  那是本地翻墙用的，Workers 上加载不了 undici 的原生 agent（见 `proxy-fetch.ts`）。
- **已知限制**：vinext 的 `/_next/image` 只接受同源相对路径，远程 R2 图片会被 400
  拒绝（其 `parseImageParams` 明确校验 origin），因此 Workers 构建关闭内置优化器、
  图片直出 R2（带宽不计费）。要在 Workers 上恢复 AVIF/WebP 优化，需要自定义
  `next/image` loader + 一个用 Images binding 做变换的路由。
- **本地开发**：`vinext dev` 在 workerd 里跑不了 React 开发模式（`eval()` 受限），
  调试请用 `pnpm build:vinext` + `pnpm start:vinext`。

## Local setup

1. Copy `.env.example` to `.env.local` and fill Supabase, APIMart, Waffo, R2 (optional), and Umami values.
2. Run **every** SQL migration in `supabase/migrations/` in filename order. Enable Google OAuth and email Magic Link in Supabase Auth; add your local and preview origins' `/**` paths to Supabase Auth redirect URLs.
3. Choose storage: set `STORAGE_PROVIDER=supabase` (bucket `posters` public or signed) or `STORAGE_PROVIDER=r2` with `R2_*` credentials and `R2_PUBLIC_BASE_URL`.
4. In Waffo Test Mode create the Creator (`$9.90/month`, `$79/year`) and Studio (`$19.90/month`, `$169/year`) products; put their Product IDs in `WAFFO_*_PRODUCT_ID`. Configure test/production webhook URLs to `/api/webhooks/waffo`. Use separate API keys for test and production. In the Waffo dashboard **Webhook settings, enable `subscription.renewed` and `subscription.recovered`** for both environments — renewed is opt-in, and without it a renewal cannot roll the billing period forward.
5. Test with Waffo card `4576750000000110`, confirm webhook delivery and Pro access.
6. Run `pnpm dev`.

The server never trusts checkout redirects or browser-provided prices. Waffo webhooks are verified from the raw request body, and generated images stay in private storage behind short-lived signed URLs (Supabase) or immutable public URLs (R2).

### Subscription lifecycle

- Canceling keeps Pro access until `period_end`; a second cancellation request is safe and does not call Waffo again.
- After the period ends, Billing links back to Pricing so the customer can choose any new plan. A still-canceling subscription cannot create a second checkout.
- `past_due` and stale billing states pause new purchases and route the customer to support to prevent duplicate charges.
- Since the 2026-09-06 Waffo change, `subscription.payment_succeeded` is a pure payment event: it carries no billing period or order status. Periods arrive on the subscription events (`subscription.activated`, `subscription.renewed`, `subscription.recovered`); when a renewal payment lands without one, the webhook derives the next period from `paymentDate` + the product's billing term so paid access is never left stale.
- In Waffo Test Mode, verify: activate → cancel → confirm `canceling` + end date → drive end/canceled → start a different plan → deliver an old-order cancellation event and confirm the new subscription stays active.

## Verification

```text
pnpm typecheck
pnpm test
pnpm build
```

The APIMart key previously pasted into chat must be revoked before deployment; use only a newly generated key in the environment.

## Build environment

`next build` uses Turbopack workers that reject certain `NODE_OPTIONS` flags. If your shell injects `--use-system-ca` (or similar worker-incompatible flags) into `NODE_OPTIONS`, the build fails with `ERR_WORKER_INVALID_EXEC_ARGV`. Run the build with a clean `NODE_OPTIONS`:

```text
NODE_OPTIONS="" pnpm build          # bash / zsh
NODE_OPTIONS= pnpm build            # Windows Git Bash
$env:NODE_OPTIONS=""; pnpm build   # PowerShell
```

Vercel and other hosted build environments provide their own clean `NODE_OPTIONS`, so production deploys are unaffected. Do not set `NODE_TLS_REJECT_UNAUTHORIZED=0` in any environment that handles real payments — it disables TLS certificate verification.

## Deployment notes

- Production domain: `https://texttoposter.com` (`www` 308-redirects to the bare domain)
- Vercel env must include all keys from `.env.example`; **do not** commit `.env.local`
- Keep `WAFFO_ENVIRONMENT=prod` and a production Waffo API key in production
- Run every migration in `supabase/migrations/` against the remote database before releasing
