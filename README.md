# Awesome AI Poster Generators

> A curated list of AI-powered poster makers — turn text into posters in seconds.

## The list

- [**Text to Poster**](https://www.texttoposter.com) — Describe a subject, mood, or words, and get **four poster directions in seconds**. Free to try without login (watermarked 1K previews); Pro unlocks 4K resolution, quality presets, and private history. Built with Next.js, Supabase, and GPT-image. **Our project.**
- [Canva](https://www.canva.com/ai-image-generator/) — All-in-one design platform with AI image generation and poster templates.
- [Ideogram](https://ideogram.ai) — AI image generator known for reliable text rendering, popular for posters and typography.
- [Recraft](https://www.recraft.ai) — AI generation focused on text, brand styles, and vector-style posters.
- [Microsoft Designer](https://designer.microsoft.com) — Free AI design tool with poster, social, and brand templates.

---

## Text to Poster

> **AI Poster Maker — Generate Posters from Text in Seconds**

[**texttoposter.com**](https://www.texttoposter.com)

Turn a written brief into four private poster directions in seconds. Describe the subject, mood, audience, or the words you want to see, and the studio generates four distinct compositions you can compare, keep, and download — no design skills needed.

A paid English-language MVP built with Next.js, Supabase, and GPT-image. Guests can try it free (watermarked 1K previews), while Creator and Studio plans unlock full resolution, high quality, and private history.

---

## Features

- **Text → 4 poster directions** — one brief, four visual readings (movie, minimal, anime, business, vintage, neon)
- **Free tier** — generate without an account, watermarked 1K previews
- **Magic-link & Google sign-in** — email verification-code login with a resend countdown
- **1–4 images per run** — free accounts pick 1–2, Pro unlocks up to 4
- **Quality ladder** — Low / Medium / High (precise) with 1K–4K resolutions
- **Private history** — every generation saved to your account with large previews, full-size lightbox, and one-click download
- **Paid plans** — Creator $9.90/mo and Studio $19.90/mo (annual options), billed through Waffo
- **Credits system** — monthly credit windows with atomic batch charging

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router, Server Components) + React 19 |
| Styling | Custom CSS design system (light theme, paper-like palette) |
| Database & Auth | Supabase (Postgres + RLS, GoTrue PKCE auth, Storage with signed URLs) |
| Image generation | APIMart (`gpt-image`), watermarked via Sharp |
| Payments | Waffo (checkout, webhooks, subscription lifecycle) |
| Language | TypeScript, validated with Zod |
| Quality gates | Biome, Vitest, `tsc --noEmit` |

## Repository layout

```text
src/app/           pages + API routes (auth, generations, checkout, webhooks, cron)
src/components/    studio, history gallery, auth forms, user menu
src/lib/server/    providers (APIMart, Waffo, Supabase), generation pipeline, auth
src/lib/domain/    shared schemas, pricing/credit rules
supabase/migrations/  SQL schema + RPCs (run in filename order)
```

## Local setup

1. Copy `.env.example` to `.env.local` and fill Supabase, APIMart, Waffo, and Umami values.
2. Run the SQL migrations in filename order through `supabase/migrations/003_security_hardening.sql`. Enable Google OAuth and email Magic Link in Supabase Auth. Add `http://localhost:3000/**`, `http://127.0.0.1:3000/**`, and each preview domain's `/**` path to Supabase Auth redirect URLs; OAuth and email sign-in return to the origin where they were requested, including the `next` query.
3. In Waffo Test Mode, create the Creator products (`$9.90/month` and `$79/year`) and the Studio products (`$19.90/month` and `$169/year`). Put their Product IDs in `WAFFO_MONTHLY_PRODUCT_ID`, `WAFFO_YEARLY_PRODUCT_ID`, `WAFFO_STUDIO_MONTHLY_PRODUCT_ID`, and `WAFFO_STUDIO_YEARLY_PRODUCT_ID`. Set `WAFFO_ENVIRONMENT=test` for local or preview deployments. The Store ID is used when configuring products and webhooks in Waffo; checkout only needs the Product IDs.
4. Configure the Test Webhook URL as `https://<your-preview-domain>/api/webhooks/waffo` and the Production Webhook URL as `https://texttoposter.com/api/webhooks/waffo`. Use separate Waffo API keys for test and production.
5. Test with Waffo card `4576750000000110`, then confirm the webhook delivery is accepted and the account shows Pro.
6. Run `pnpm dev`.

The server never trusts checkout redirects or browser-provided prices. Waffo webhooks are verified from the raw request body, and generated images stay in private Supabase Storage behind short-lived signed URLs.

### Subscription lifecycle

- Canceling keeps Pro access until `period_end`; a second cancellation request is safe and does not call Waffo again.
- After the period ends, Billing links back to Pricing so the customer can choose any new plan. A still-canceling subscription cannot create a second checkout.
- `past_due` and stale billing states pause new purchases and route the customer to support to prevent duplicate charges.
- In Waffo Test Mode, verify this sequence: activate a plan, cancel it, confirm the `canceling` message and end date, drive the end/canceled state, start a different plan, then deliver an old-order cancellation event and confirm the new subscription remains active.

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
