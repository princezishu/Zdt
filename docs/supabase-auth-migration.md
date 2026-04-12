# Supabase Auth Migration

This codebase now supports a phased move from custom JWT/password auth to Supabase Auth while keeping the local `users`, `user_roles`, `role_permissions`, and subscription tables as the authorization layer.

## What Changed

- The API now accepts Supabase bearer access tokens in the same places that previously accepted only legacy JWT session tokens.
- Supabase identities are linked to local `users` rows through `managed_auth_provider` + `managed_auth_subject`.
- Local RBAC, subscriptions, activity logs, and ownership checks continue to use the local user id.
- Managed-only accounts are blocked from legacy password reset, password change, and legacy login/OTP session routes.
- The public auth UI now supports Supabase password auth, email magic links, Google OAuth, and GitHub OAuth from the same login/register flow.

## Required Server Env

Set these in the server environment before enabling managed auth:

```env
MANAGED_AUTH_PROVIDER=supabase
MANAGED_AUTH_AUTO_LINK_BY_EMAIL=false
SUPABASE_PROJECT_URL=https://your-project.supabase.co
SUPABASE_JWT_ISSUER=
SUPABASE_JWKS_URL=
SUPABASE_JWT_AUDIENCE=
SUPABASE_ANON_KEY=
```

Notes:

- Leave `MANAGED_AUTH_AUTO_LINK_BY_EMAIL=false` for the first rollout. That avoids accidental takeover of legacy accounts that share an email address.
- `SUPABASE_ANON_KEY` is only required when Supabase access tokens are signed with HS256. For asymmetric JWT projects, JWKS verification is used instead.

## Rollout Order

1. Enable backend trust of Supabase tokens.
   The backend is already prepared for this. Turn on the env vars and deploy.

2. Link existing legacy accounts.
   Have a user sign in with the old flow, obtain a Supabase access token from the new client flow, and call `POST /api/v1/auth/managed/link`.

   For public user accounts that still match by email but the user no longer remembers the old legacy password, the client can call `POST /api/v1/auth/managed/link/recover` from a verified Supabase session. This path only self-links normal public `role='user'` / `account_type='individual'` accounts and will reject admin, team, and company accounts.

3. Move user-facing sign-in/register flows to Supabase.
   After the frontend is ready, stop sending legacy password login requests for migrated users.

4. Keep local RBAC/session tables as the transition layer.
   Authorization, audit logs, subscriptions, and ownership checks should continue to resolve through the local `users.id`.

5. Retire legacy password features after coverage is complete.
   Remove forgot-password, change-password, and custom session issuance only after all active user cohorts have been migrated.

## Frontend Redirects And OAuth Providers

- Enable Google and GitHub in your Supabase Auth provider settings for the project that backs this app.
- Add the login callback URL to the Supabase redirect allow-list for each environment.
- For local development, the default callback is `http://localhost:5173/login`.
- For production, point the callback to your deployed login URL, for example `https://your-domain.com/login`.
- If you want the frontend to force a specific callback URL instead of using `window.location.origin`, set `VITE_SUPABASE_AUTH_REDIRECT_URL` in `app/.env`.

## Linking Flow

Use a legacy-authenticated session for the account that should own the Supabase identity, then call:

```http
POST /api/v1/auth/managed/link
Authorization: Bearer <legacy-jwt>
X-Managed-Auth-Token: <supabase-access-token>
```

You can also send the managed token in JSON as `{ "token": "..." }`.

The server will:

- Verify the Supabase token.
- Reject the link if the managed identity is already attached to another local account.
- Update the local `users` row with the managed auth subject while preserving the existing role and subscription data.

For the self-service recovery path:

```http
POST /api/v1/auth/managed/link/recover
X-Managed-Auth-Token: <supabase-access-token>
Content-Type: application/json

{ "confirmation": "link_existing_account" }
```

The server will only complete that flow when:

- the Supabase email is verified,
- exactly one matching local account exists,
- the matched account is a normal public user account,
- and the managed identity is not already attached to another local account.

## Safety Defaults

- Managed-only accounts cannot use legacy password reset or password change routes.
- If a Supabase identity matches an existing legacy email and auto-linking is disabled, the API returns a link-required error instead of silently merging accounts.
- Service-role Supabase tokens are rejected for end-user authentication.
