# Text to Poster

Text to Poster is a paid English-language MVP for turning a written brief into four private poster directions.

## Local setup

1. Copy `.env.example` to `.env.local` and fill Supabase, APIMart, Waffo, and Umami values.
2. Run the SQL in `supabase/migrations/001_initial.sql` in a Supabase project. Enable Google OAuth and email Magic Link in Supabase Auth.
3. In Waffo Test Mode, create the two subscription products (`$9.90/month` and `$59/year`) and put their Product IDs in `WAFFO_MONTHLY_PRODUCT_ID` and `WAFFO_YEARLY_PRODUCT_ID`. Set `WAFFO_ENVIRONMENT=test` for local or preview deployments. The Store ID is used when configuring products and webhooks in Waffo; checkout only needs the Product IDs.
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
