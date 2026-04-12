# ZDT Realty Go-Live Runbook (Critical + High)

## Deployment Topology
- Frontend: Vercel (Vite app in `app/`)
- Backend: Render (Node/Express API in `server/`)
- Database: Supabase Postgres (or managed Postgres compatible with existing SQL)

## 1. Environment Mapping
### Frontend (`app/.env`)
- `VITE_API_URL` = public backend URL (for example `https://api.example.com`)
- `VITE_SITE_URL` = public frontend URL (for example `https://www.example.com`)
- `VITE_GOOGLE_MAPS_API_KEY` = Google Maps JavaScript API key
- `VITE_WHATSAPP_NUMBER` = business fallback WhatsApp number in international format
- `VITE_CONSTRUCTION_WHATSAPP_TEXT` = optional prefilled construction message

### Backend (`server/.env`)
- DB: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`
- DB TLS: `DB_SSL=true`, `DB_SSL_REJECT_UNAUTHORIZED=true`, `DB_SSL_CA` (if provider requires CA bundle)
- Auth/security: `JWT_SECRET`, `ADMIN_TOKEN`, `MEDIA_SIGNING_SECRET`
- Transport security: `FORCE_HTTPS=true`, `TRUST_PROXY=<trusted-hop-count>`
- CORS: `CORS_ORIGIN` includes frontend domain(s) and any admin subdomain
- Runtime: `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT=<render-port>`
- Optional integrations: SMTP, Twilio, OpenAI/Gemini keys as needed
- Queue/analytics async path: optional `ENABLE_REDIS_QUEUE=true` plus `REDIS_URL` on Redis `>= 5.0.0` for BullMQ; otherwise analytics runs inline

## 2. Vercel Frontend Deploy
1. Import repo/project path `app/`.
2. Build command: `npm run build`.
3. Output directory: `dist`.
4. Configure frontend env vars from section 1.
5. Deploy and verify:
   - Home, buy, rent, buy-map, rent-map load
   - Canonical buy/rent detail URLs resolve
   - Meta title/description/OG are present in page source

## 3. Render Backend Deploy
1. Import repo/project path `server/`.
2. Start command: `npm start`.
3. Build command (if required by service): `npm install`.
4. Set backend env vars from section 1.
5. Confirm health and connectivity:
   - `GET /health` returns `{ ok: true }`
   - Auth and listing APIs respond normally
6. Confirm middleware behavior:
   - Response compression enabled on eligible payloads
   - Request logs visible via `morgan` (no sensitive body data logged)

## 4. Database and Schema
1. Confirm Supabase/Postgres network access from Render.
2. Run required SQL migrations (if pending in `server/sql/migrations`).
3. Verify baseline tables for auth, listings, rentals, leads, group deals, infra, analytics.
4. Run smoke CRUD checks for:
   - Property list/detail
   - Rental list/detail
   - Lead submissions

## 5. CORS, SSL, and Domain Checks
1. Ensure `CORS_ORIGIN` includes exact frontend origin(s).
2. Ensure TLS is enabled at reverse proxy/load balancer and forwarded protocol headers are preserved.
3. Set backend `TRUST_PROXY` to match proxy hop count (for example `1` behind one proxy).
4. Verify HTTPS certificate status on frontend and backend domains.
5. Validate no mixed-content requests in browser console.
6. Confirm canonical URL host matches `VITE_SITE_URL`.

## 6. Smoke Test Script
Run after both deployments:
1. Frontend pages:
   - `/buy`, `/rent`, `/buy-map`, `/rent-map`
   - Legacy and canonical detail links for buy/rent
2. Conversion flows:
   - WhatsApp CTA opens for listing/detail pages
   - Share button works (`navigator.share` or link-copy fallback)
3. Lead flows:
   - Buy lead submit
   - Rental enquiry submit
4. Access control:
   - Admin route access restricted correctly
   - Auth-protected routes redirect/guard correctly
5. Performance sanity:
   - Route transitions load lazy chunks without runtime errors

## 7. SEO and Analytics Operations
1. Verify `robots.txt` and `sitemap.xml` are live on frontend domain.
2. Submit sitemap to Google Search Console.
3. Confirm indexing health and coverage reports.
4. Configure analytics tags/events (GA or equivalent) for:
   - Listing detail views
   - WhatsApp CTA clicks
   - Share actions
   - Lead submissions

## 8. Post-Deploy Verification Checklist
- [ ] API health green
- [ ] No critical frontend console errors
- [ ] No critical backend exception loops
- [ ] Buy/rent listing pagination still 12 per primary listing page
- [ ] Map pages functional with API key and graceful fallback without key
- [ ] Canonical URL rewrite works from legacy detail URLs
- [ ] WhatsApp fallback behavior works when public listing phone is absent
- [ ] Share fallback copies URL when native share unavailable

## 9. Manual External Tasks (Non-Code)
- [ ] Google My Business optimization and verification
- [ ] Local backlink outreach and listings citations
- [ ] Periodic content publishing cadence for local SEO
- [ ] Review/Search Console monitoring workflow ownership

## 10. Secret Rotation (Production)
1. Rotate `JWT_SECRET`, `ADMIN_TOKEN`, and `MEDIA_SIGNING_SECRET`.
2. Rotate DB credentials (`DB_HOST`/`DB_USER`/`DB_PASS` as required by provider flow).
3. Rotate third-party API keys in use (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `MARKET_API_KEY`, `TWILIO_AUTH_TOKEN`, SMTP app password).
4. Redeploy backend after secret updates and invalidate old credentials/tokens where supported.
5. Confirm auth login, DB connectivity, and key-backed integrations after rotation.
