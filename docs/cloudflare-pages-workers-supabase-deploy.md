# Vercel + Cloudflare Workers + Supabase Deployment

This repo can now be deployed with:

- Frontend: Vercel (`app/`)
- Backend: Cloudflare Workers (`server/`)
- Database: Supabase Postgres
- Auth: Supabase Auth
- AI services: Amazon Bedrock through the Cloudflare Worker

## Frontend: Vercel

Create a Vercel project with:

- Root directory: `app`
- Build command: `npm run build`
- Output directory: `dist`

Set the frontend environment variables from [`app/.env.example`](../app/.env.example), especially:

- `VITE_API_URL=https://api.example.com`
- `VITE_SITE_URL=https://your-project.vercel.app`
- `VITE_SUPABASE_URL=https://<project-ref>.supabase.co`
- `VITE_SUPABASE_ANON_KEY=<supabase-anon-key>`
- `VITE_SUPABASE_AUTH_REDIRECT_URL=https://your-project.vercel.app/login`
- `VITE_SUPABASE_PASSWORD_RESET_REDIRECT_URL=https://your-project.vercel.app/forgot-password?recovery=1`
- `VITE_ENABLE_REALTIME_CHAT=false`

For the new AI Services dashboard, the frontend only needs `VITE_API_URL` to point at the deployed Cloudflare Worker. Never put Bedrock, Supabase service-role, JWT, admin, or database secrets in Vercel frontend variables.

SPA routing on Vercel is handled by [`app/vercel.json`](../app/vercel.json).

Vercel can also expose `VERCEL_PROJECT_PRODUCTION_URL` and `VERCEL_URL` during builds. The sitemap script can use those as a fallback, but production should still set `VITE_SITE_URL` explicitly so canonical URLs always point at the right domain.

## Backend: Cloudflare Workers

The Worker entry is [`server/src/worker.js`](../server/src/worker.js) and the Wrangler config is [`server/wrangler.jsonc`](../server/wrangler.jsonc).

Set Worker secrets/vars from [`server/.env.example`](../server/.env.example), especially:

- `SUPABASE_DB_POOLER_URL` or `DATABASE_URL`
- `JWT_SECRET`
- `ADMIN_TOKEN`
- `MEDIA_SIGNING_SECRET`
- `MANAGED_AUTH_PROVIDER=supabase`
- `SUPABASE_PROJECT_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FRONTEND_URL=https://your-project.vercel.app`
- `CORS_ALLOWED_ORIGIN_PATTERNS=https://your-project-git-*.vercel.app`
- `AI_SERVICES_PROVIDER=bedrock`
- `AWS_BEDROCK_REGION=ap-south-1`
- `AWS_BEDROCK_MODEL_ID=global.amazon.nova-2-lite-v1:0`
- `AWS_BEARER_TOKEN_BEDROCK=<bedrock-api-key>` as a Worker secret

Recommended deploy flow:

```powershell
cd server
npx wrangler secret put SUPABASE_DB_POOLER_URL
npx wrangler secret put JWT_SECRET
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put MEDIA_SIGNING_SECRET
npx wrangler secret put SUPABASE_PROJECT_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put AWS_BEARER_TOKEN_BEDROCK
npx wrangler deploy
```

Use the Supabase pooler connection string for `SUPABASE_DB_POOLER_URL`.

After deploy, smoke test:

```powershell
$api = "https://api.your-domain.com"
Invoke-RestMethod "$api/api/ai-services/provider-status"
$body = @{ outputDetail = "brief"; inputs = @{ plotAreaSqft = 1500; bedrooms = 3; floors = 2 } } | ConvertTo-Json -Depth 5
Invoke-RestMethod -Method Post "$api/api/ai-services/home-design/generate" -ContentType "application/json" -Body $body
```

The response should show `provider.source` as `bedrock`.

## Supabase

In Supabase:

1. Create the project.
2. Enable the auth providers you want (email/password, magic link, Google, GitHub).
3. Add your Vercel URLs to the Auth redirect allow-list.
4. Copy the Project URL, anon key, service role key, and pooler connection string into Vercel and Cloudflare.

Typical redirect URLs:

- `https://your-project.vercel.app/login`
- `https://your-project.vercel.app/forgot-password?recovery=1`
- `https://your-project-git-feature-name-your-team.vercel.app/login`
- `https://your-project-git-feature-name-your-team.vercel.app/forgot-password?recovery=1`
- `https://your-custom-domain.com/login`
- `https://your-custom-domain.com/forgot-password?recovery=1`

Local setup order:

```powershell
cd app
npm install
cd ..\\server
npm install
npm run schema:supabase
```

Then deploy backend first with Wrangler, confirm `https://api.your-domain.com/health`, and only then point the Vercel frontend at that API URL.

## Production update order

Use this order when pushing new website features:

1. Run database migrations or `npm run schema:supabase` from `server/` against Supabase.
2. Deploy the Cloudflare Worker backend with `npx wrangler deploy`.
3. Confirm health and AI endpoints from the public Worker URL.
4. Set/confirm Vercel production env vars, especially `VITE_API_URL`.
5. Redeploy the Vercel frontend from the latest Git commit.
6. Confirm `/ai-services`, login, register, and one protected dashboard route on the live domain.

## Worker cron triggers

The Worker config includes UTC cron triggers that match the app's current India-time defaults:

- `*/15 * * * *`: maintenance sweep + optional analytics
- `0 */6 * * *`: infra ingest every 6 hours
- `45 0 * * *`: tender refresh at 06:15 IST
- `15 1 * * *`: e-auction refresh at 06:45 IST
- `45 3 * * *`: apartment reminder job at 09:15 IST

If you change the business schedule, update both the Wrangler cron list and the related env values for documentation consistency.

## Realtime chat note

`VITE_ENABLE_REALTIME_CHAT=false` is intentional for the Cloudflare Worker deployment path. The chat pages still work through normal HTTP requests plus polling, but live typing/presence/read receipts are not enabled in the Worker entry yet.

To restore full realtime behavior on Cloudflare, the next step is to move chat sockets/presence to Durable Objects or another Worker-native realtime layer.
