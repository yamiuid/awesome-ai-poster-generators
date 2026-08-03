# Text to Poster

Text to Poster is a paid English-language MVP for turning a written brief into four private poster directions.

## Local setup

1. Copy `.env.example` to `.env.local` and fill Supabase, APIMart, Waffo, and Umami values.
2. Run the SQL in `supabase/migrations/001_initial.sql` in a Supabase project. Enable Google OAuth and email Magic Link in Supabase Auth.
3. Create the two Waffo subscription products (`$9.90/month` and `$59/year`) and configure the webhook URL as `/api/webhooks/waffo`.
4. Run `pnpm dev`.

The server never trusts checkout redirects or browser-provided prices. Waffo webhooks are verified from the raw request body, and generated images stay in private Supabase Storage behind short-lived signed URLs.

## Verification

```text
pnpm typecheck
pnpm test
pnpm build
```

The APIMart key previously pasted into chat must be revoked before deployment; use only a newly generated key in the environment.

