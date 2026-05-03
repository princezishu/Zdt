import { createClient } from '@supabase/supabase-js';

const SUPABASE_PROJECT_URL = String(process.env.SUPABASE_PROJECT_URL || '')
  .trim()
  .replace(/\/+$/, '');
const SUPABASE_JWT_ISSUER =
  String(process.env.SUPABASE_JWT_ISSUER || '').trim() ||
  (SUPABASE_PROJECT_URL ? `${SUPABASE_PROJECT_URL}/auth/v1` : '');
const SUPABASE_JWKS_URL =
  String(process.env.SUPABASE_JWKS_URL || '').trim() ||
  (SUPABASE_JWT_ISSUER ? `${SUPABASE_JWT_ISSUER}/.well-known/jwks.json` : '');
const SUPABASE_JWT_AUDIENCE = String(process.env.SUPABASE_JWT_AUDIENCE || '').trim();
const SUPABASE_ANON_KEY = String(process.env.SUPABASE_ANON_KEY || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

let publicDbClient = null;
let adminDbClient = null;

function createSupabaseConfigError(message, { status = 503, code = 'supabase_config_error' } = {}) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

async function getSupabaseUser(accessToken) {
  if (!SUPABASE_PROJECT_URL || !SUPABASE_JWT_ISSUER) {
    throw createSupabaseConfigError('Supabase Auth is not fully configured on the server.', {
      status: 503,
      code: 'managed_auth_not_configured',
    });
  }

  if (!SUPABASE_ANON_KEY) {
    throw createSupabaseConfigError(
      'Supabase HS256 verification requires SUPABASE_ANON_KEY on the server.',
      {
        status: 503,
        code: 'managed_auth_not_configured',
      }
    );
  }

  const response = await fetch(`${SUPABASE_PROJECT_URL}/auth/v1/user`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY,
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw createSupabaseConfigError('Managed auth token is invalid or expired.', {
      status: 401,
      code: 'managed_auth_invalid_token',
    });
  }

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 180);
    throw createSupabaseConfigError(
      `Supabase Auth validation failed (${response.status}). ${detail}`.trim(),
      {
        status: 503,
        code: 'managed_auth_verification_failed',
      }
    );
  }

  return response.json();
}

function createSupabaseDbClient(apiKey, accessToken = '') {
  if (!SUPABASE_PROJECT_URL || !apiKey) {
    return null;
  }

  const headers = {};
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return createClient(SUPABASE_PROJECT_URL, apiKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    db: {
      schema: 'public',
    },
    global: {
      headers,
    },
  });
}

export const supabaseConfig = Object.freeze({
  projectUrl: SUPABASE_PROJECT_URL,
  jwtIssuer: SUPABASE_JWT_ISSUER,
  jwtJwksUrl: SUPABASE_JWKS_URL,
  jwtAudience: SUPABASE_JWT_AUDIENCE,
  anonKey: SUPABASE_ANON_KEY,
  serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
});

export const supabaseClient = Object.freeze({
  auth: Object.freeze({
    async getUser(accessToken) {
      try {
        const user = await getSupabaseUser(accessToken);
        return {
          data: { user },
          error: null,
        };
      } catch (error) {
        return {
          data: { user: null },
          error,
        };
      }
    },
  }),
});

export function isSupabaseConfigured() {
  // Asymmetric Supabase projects can verify access tokens through JWKS alone.
  // The anon key is only required for HS256 projects that use /auth/v1/user.
  return Boolean(
    supabaseConfig.projectUrl &&
      supabaseConfig.jwtIssuer &&
      supabaseConfig.jwtJwksUrl
  );
}

/**
 * Returns true when the server has enough config to validate Supabase access
 * tokens. HS256 projects still additionally require SUPABASE_ANON_KEY at
 * request time.
 */
export function isSupabaseAuthReady() {
  return isSupabaseConfigured();
}

export function hasSupabaseAdminCredentials() {
  return Boolean(supabaseConfig.projectUrl && supabaseConfig.serviceRoleKey);
}

export function isSupabaseDatabaseConfigured() {
  return Boolean(supabaseConfig.projectUrl && (supabaseConfig.serviceRoleKey || supabaseConfig.anonKey));
}

export function getSupabasePublicDbClient() {
  if (!supabaseConfig.projectUrl || !supabaseConfig.anonKey) {
    return null;
  }

  if (!publicDbClient) {
    publicDbClient = createSupabaseDbClient(supabaseConfig.anonKey);
  }

  return publicDbClient;
}

export function getSupabaseAdminDbClient() {
  if (!supabaseConfig.projectUrl || !supabaseConfig.serviceRoleKey) {
    return null;
  }

  if (!adminDbClient) {
    adminDbClient = createSupabaseDbClient(supabaseConfig.serviceRoleKey);
  }

  return adminDbClient;
}

export function createSupabaseUserDbClient(accessToken) {
  if (!supabaseConfig.projectUrl || !supabaseConfig.anonKey || !String(accessToken || '').trim()) {
    return null;
  }

  return createSupabaseDbClient(supabaseConfig.anonKey, String(accessToken).trim());
}
