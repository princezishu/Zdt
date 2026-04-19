# ZDT Realty Frontend

This directory contains the React + TypeScript + Vite frontend for ZDT Realty. It is designed to deploy on Vercel from the `app/` directory of the repository.

## Local commands

```bash
npm install
npm run dev
npm run build
npm test
```

## Vercel deployment

1. Push the repository to GitHub.
2. In Vercel, create a new project and import the GitHub repository.
3. When Vercel asks for the project location, set the Root Directory to `app`.
4. Confirm the build settings:
   - Framework Preset: `Vite`
   - Install Command: `npm install`
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Node.js Version: any version matching `^20.19.0 || >=22.12.0`
5. Add the environment variables from [`app/.env.example`](./.env.example).
6. Click Deploy.
7. If the final production domain changes after the first deploy, update:
   - `VITE_SITE_URL`
   - `VITE_SUPABASE_AUTH_REDIRECT_URL`
   - `VITE_SUPABASE_PASSWORD_RESET_REDIRECT_URL`
8. Redeploy after any environment variable change.

## Environment variables

Required for normal production behavior:

- `VITE_API_URL`: Public backend base URL used by the frontend in production.
- `VITE_SITE_URL`: Public frontend URL used for sitemap generation and canonical tags.

Required when managed auth is enabled:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_AUTH_REDIRECT_URL`
- `VITE_SUPABASE_PASSWORD_RESET_REDIRECT_URL`

Optional integrations and feature flags:

- `VITE_GOOGLE_MAPS_API_KEY`: Enables map markers on buy/rent map pages.
- `VITE_ENABLE_GROUP_DEALS`: Defaults to `true`.
- `VITE_WHATSAPP_NUMBER`: Primary public WhatsApp number.
- `VITE_CONSTRUCTION_WHATSAPP_NUMBER`
- `VITE_CONSTRUCT_WHATSAPP_NUMBER`
- `VITE_CONSTRUCTION_WHATSAPP_TEXT`
- `VITE_SUPPORT_UPI_QR_URL`
- `VITE_API_VERSION_PREFIX`: Defaults to `/api/v1`.

## Post-deploy smoke test

- Verify `/`, `/buy`, `/rent`, `/buy-map`, and `/rent-map` load.
- Verify API-backed pages hit the deployed backend instead of localhost.
- Verify login, OAuth, and password reset flows if Supabase auth is enabled.
- Verify deep links refresh correctly on nested routes.
- Verify Google Maps pages either render normally with a key or show the expected fallback state without one.
- Verify WhatsApp CTA links open the expected number.
