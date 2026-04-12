# ZDT Realty Website Audit Status (Critical + High)

## Scope
- Round: Critical + High checklist items only
- Date: 2026-03-04
- Status labels:
  - `Done`: Implemented and wired in current codebase
  - `Partial`: Implemented with constraints or pending external dependency
  - `Missing`: Not implemented in this round

## Retained Existing Coverage
| Checklist Item | Status | Evidence |
|---|---|---|
| Auth hashing / JWT / request validation / rate limiting | Done | `server/src/routes/auth.js`, `server/src/middleware/rateLimit.js`, `server/src/index.js` |
| Pagination and listing indexing patterns | Done | `server/src/routes/realty.js`, `server/src/routes/rentals.js` |
| Admin dashboard and operational modules | Done | `app/src/sections/AdminDeskPage.tsx`, related admin sections |
| Saved / compare / gallery / filtering | Done | `app/src/lib/favoritesStore.ts`, `app/src/lib/compareStore.ts`, buy/rent marketplace sections |

## Critical + High Matrix
| Area | Requirement | Status | Evidence |
|---|---|---|---|
| SEO | SEO utility and dynamic metadata/OG/canonical | Done | `app/src/lib/seo.ts`, detail and listing page integrations |
| SEO | Canonical slug routing `/buy/<slug>-<id>`, `/rent/<slug>-<id>` with legacy compatibility | Done | `app/src/lib/slug.ts`, `app/src/App.tsx`, detail canonicalization effects |
| SEO | `robots.txt` + sitemap generation + build integration | Done | `app/public/robots.txt`, `app/scripts/generate-sitemap.mjs`, `app/package.json` |
| SEO | Property JSON-LD on detail pages | Done | `app/src/sections/buy/BuyPropertyDetailsPage.tsx`, `app/src/sections/rent/RentDetailsPage.tsx`, `app/src/sections/portal/PortalPropertyDetailsPage.tsx` |
| Maps | Real Google Maps in Buy and Rent map pages with marker sync | Done | `app/src/components/maps/ListingMap.tsx`, `app/src/sections/buy/BuyMapPage.tsx`, `app/src/sections/rent/RentMapPage.tsx` |
| Maps | Graceful no-key fallback | Done | `app/src/components/maps/ListingMap.tsx` |
| Conversion | WhatsApp helper + privacy-first fallback logic | Done | `app/src/lib/whatsapp.ts`, buy/rent/portal listing/detail integrations |
| Conversion | Share action with native + clipboard fallback | Done | `app/src/lib/share.ts`, buy/rent/portal detail pages |
| Mobile UX | 44x44 minimum touch target in key custom controls | Done | `app/src/sections/Header.tsx`, buy/rent detail and listing action groups |
| Mobile UX | iOS input zoom safety (16px+) | Done | `app/src/components/ui/input.tsx` |
| Mobile UX | Floating WhatsApp quick action, dismissible, scoped to browsing/detail views | Done | `app/src/components/realty/FloatingWhatsAppButton.tsx`, `app/src/App.tsx` |
| Performance | Route-level code splitting with `React.lazy` | Done | `app/src/App.tsx` |
| Backend hardening | Compression middleware | Done | `server/src/index.js`, `server/package.json` |
| Backend hardening | Request logging middleware (`morgan`) | Done | `server/src/index.js`, `server/package.json` |
| Backend hardening | Keep cache behavior and pagination defaults | Done | Existing cache/pagination code preserved in route handlers |
| Config hygiene | Sanitized env examples + normalized frontend WhatsApp env naming | Done | `server/.env.example`, `app/.env.example`, `app/src/App.tsx` |
| Config hygiene | Add env vars for maps, site URL, fallback WhatsApp | Done | `app/.env.example`, `app/src/lib/seo.ts`, `app/src/lib/whatsapp.ts` |
| API contract | Optional public contact field only where present | Done | `server/src/routes/realty.js`, `server/src/routes/rentals.js` |
| Ops | Production runbook for deploy/verify/manual tasks | Done | `docs/go-live-critical-high.md` |

## Deferred (Out of Scope This Round)
- Mobile bottom tab bar
- Recently viewed sidebar polish
- Google My Business execution
- Local backlink campaign execution
