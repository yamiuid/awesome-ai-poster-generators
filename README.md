# Text to Poster

Text to Poster is a paid English-language MVP for turning a written brief into four private poster directions.

## Local setup

1. Copy `.env.example` to `.env.local` and fill Supabase, APIMart, Waffo, and Umami values.
2. Run the SQL migrations in filename order through `supabase/migrations/003_security_hardening.sql`. Enable Google OAuth and email Magic Link in Supabase Auth.
3. In Waffo Test Mode, create the Creator products (`$9.90/month` and `$79/year`) and the Studio products (`$19.90/month` and `$169/year`). Put their Product IDs in `WAFFO_MONTHLY_PRODUCT_ID`, `WAFFO_YEARLY_PRODUCT_ID`, `WAFFO_STUDIO_MONTHLY_PRODUCT_ID`, and `WAFFO_STUDIO_YEARLY_PRODUCT_ID`. Set `WAFFO_ENVIRONMENT=test` for local or preview deployments. The Store ID is used when configuring products and webhooks in Waffo; checkout only needs the Product IDs.
4. Configure the Test Webhook URL as `https://<your-preview-domain>/api/webhooks/waffo` and the Production Webhook URL as `https://texttoposter.com/api/webhooks/waffo`. Use separate Waffo API keys for test and production.
5. Test with Waffo card `4576750000000110`, then confirm the webhook delivery is accepted and the account shows Pro.
6. Run `pnpm dev`.

The server never trusts checkout redirects or browser-provided prices. Waffo webhooks are verified from the raw request body, and generated images stay in private Supabase Storage behind short-lived signed URLs.

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
