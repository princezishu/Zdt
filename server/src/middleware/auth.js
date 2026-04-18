import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { pool } from '../db.js';
import {
  authenticateManagedAccessToken,
  authenticateSupabaseAccessToken,
  isManagedAuthEnabled,
  ManagedAuthError,
} from '../services/managedAuth.js';
import { isSupabaseConfigured } from '../config/supabase.js';
import { requireNonEmptyEnv } from '../utils/env.js';
import {
  getCurrentSubscription,
  resolveSubscriptionFeatureAccess,
} from '../utils/subscriptions.js';

const JWT_SECRET = requireNonEmptyEnv('JWT_SECRET');
const { PERMISSION_CACHE_TTL_MS = '60000' } = process.env;
const permissionCacheTtlMs = Number.isFinite(Number(PERMISSION_CACHE_TTL_MS))
  ? Math.max(5000, Number(PERMISSION_CACHE_TTL_MS))
  : 60_000;
const permissionCache = new Map();
const NUMERIC_ID_PATTERN = /^\d+$/;
const UUID_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME?.trim() || 'zdt_auth';

function normalizeIpAddress(rawValue) {
  if (!rawValue) return '';
  return String(rawValue).split(',')[0].trim().slice(0, 64);
}

function getRequestIp(req) {
  return normalizeIpAddress(req.ip || req.socket?.remoteAddress);
}

async function logDeniedAccess(
  req,
  { reason, requiredPermissions = [], missingPermissions = [], requiredRoles = [], metadata = {} } = {}
) {
  try {
    await pool.query(
      `
        INSERT INTO activity_logs (
          actor_user_id,
          actor_role,
          action_key,
          entity_type,
          entity_id,
          request_reference,
          ip_address,
          metadata
        )
        VALUES ($1, $2, 'access_denied', 'security', NULL, $3, $4, $5::jsonb)
      `,
      [
        req.user?.id || null,
        req.user?.role || 'anonymous',
        (req.originalUrl || req.url || '').slice(0, 40),
        getRequestIp(req),
        JSON.stringify({
          reason: reason || 'access_denied',
          method: req.method,
          path: req.originalUrl || req.url || '',
          requiredPermissions: Array.isArray(requiredPermissions) ? requiredPermissions : [],
          missingPermissions: Array.isArray(missingPermissions) ? missingPermissions : [],
          requiredRoles: Array.isArray(requiredRoles) ? requiredRoles : [],
          userRole: req.user?.role || null,
          userRoles: resolveUserRoleKeys(req.user),
          isMainAdmin: Boolean(req.user?.isMainAdmin),
          ...metadata,
        }),
      ]
    );
  } catch (error) {
    console.error('[AUTH] Failed to write access denied log:', error);
  }
}

function readPermissionCache(cacheKey) {
  const cached = permissionCache.get(cacheKey);
  if (!cached || cached.expiresAt <= Date.now()) {
    if (cached) {
      permissionCache.delete(cacheKey);
    }
    return null;
  }
  return cached.permissions;
}

function writePermissionCache(cacheKey, permissions) {
  permissionCache.set(cacheKey, {
    permissions: [...permissions],
    expiresAt: Date.now() + permissionCacheTtlMs,
  });
}

function resolveUserRoleKeys(user) {
  const normalizedSet = new Set();
  const rawRoles = Array.isArray(user?.roles) ? user.roles : [];

  for (const roleKey of rawRoles) {
    const normalizedRole = String(roleKey || '').trim();
    if (!normalizedRole) {
      continue;
    }
    if (normalizedRole === 'main_admin' && !user?.isMainAdmin) {
      continue;
    }
    normalizedSet.add(normalizedRole);
  }

  const directRole = String(user?.role || '').trim();
  if (directRole) {
    normalizedSet.add(directRole);
  }
  if (user?.isMainAdmin) {
    normalizedSet.add('main_admin');
  }

  return Array.from(normalizedSet).sort();
}

export function clearPermissionCache() {
  permissionCache.clear();
}

function parseCookieHeader(rawCookieHeader) {
  const cookieMap = new Map();
  const source = String(rawCookieHeader || '');
  if (!source) {
    return cookieMap;
  }

  const parts = source.split(';');
  for (const part of parts) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }
    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }
    try {
      cookieMap.set(key, decodeURIComponent(value));
    } catch {
      cookieMap.set(key, value);
    }
  }

  return cookieMap;
}

function readCookieValue(req, name) {
  const explicitCookies = req.cookies;
  if (explicitCookies && typeof explicitCookies === 'object' && explicitCookies !== null) {
    const value = explicitCookies[name];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  const parsedCookies = parseCookieHeader(req.headers?.cookie || '');
  const headerValue = parsedCookies.get(name);
  if (typeof headerValue === 'string' && headerValue.trim()) {
    return headerValue.trim();
  }

  return '';
}

function readManagedTokenHeader(req) {
  const headerValue = req.headers?.['x-managed-auth-token'];
  if (Array.isArray(headerValue)) {
    return String(headerValue[0] || '').trim();
  }
  if (typeof headerValue === 'string' && headerValue.trim()) {
    return headerValue.trim();
  }
  return '';
}

export function readAccessTokenFromRequest(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme === 'Bearer' && token) {
    return String(token).trim();
  }

  const managedHeaderToken = readManagedTokenHeader(req);
  if (managedHeaderToken) {
    return managedHeaderToken;
  }

  return readCookieValue(req, AUTH_COOKIE_NAME);
}

function createAuthError(message, { status = 401, code = 'auth_error' } = {}) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.isAuthError = true;
  return error;
}

function hashAccessToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function loadAuthenticatedUserRow(userId, { tokenHash = '' } = {}) {
  const hasSessionHash = typeof tokenHash === 'string' && tokenHash.trim().length > 0;
  const rows = await pool.query(
    `
      SELECT
        u.id,
        u.name,
        u.email,
        u.phone,
        u.role,
        u.account_type,
        u.subscription_tier,
        u.is_main_admin,
        u.is_active,
        u.deactivated_until,
        u.managed_auth_provider,
        u.managed_auth_only,
        ${hasSessionHash ? 's.id AS session_id,' : 'NULL::BIGINT AS session_id,'}
        COALESCE(
          ARRAY_REMOVE(
            ARRAY_AGG(DISTINCT ur.role_key) FILTER (WHERE ur.deleted_at IS NULL),
            NULL
          ),
          ARRAY[]::TEXT[]
        ) AS role_keys
      FROM users u
      ${
        hasSessionHash
          ? `
        JOIN user_sessions s
          ON s.user_id = u.id
         AND s.token_hash = $2
         AND s.revoked_at IS NULL
      `
          : ''
      }
      LEFT JOIN user_roles ur
        ON ur.user_id = u.id
      WHERE u.id = $1
      GROUP BY
        u.id,
        u.name,
        u.email,
        u.phone,
        u.role,
        u.account_type,
        u.subscription_tier,
        u.is_main_admin,
        u.is_active,
        u.deactivated_until,
        u.managed_auth_provider,
        u.managed_auth_only
        ${hasSessionHash ? ', s.id' : ''}
      LIMIT 1
    `,
    hasSessionHash ? [userId, tokenHash] : [userId]
  );

  return rows.rowCount > 0 ? rows.rows[0] : null;
}

function ensureUserCanAuthenticate(userRow) {
  if (!userRow) {
    throw createAuthError('Invalid session. Please log in again.', {
      status: 401,
      code: 'invalid_session',
    });
  }

  if (!userRow.is_active) {
    throw createAuthError('Your account is deactivated', {
      status: 403,
      code: 'account_deactivated',
    });
  }

  if (userRow.deactivated_until && new Date(userRow.deactivated_until).getTime() > Date.now()) {
    throw createAuthError(
      `Your account is temporarily deactivated until ${new Date(
        userRow.deactivated_until
      ).toLocaleString('en-IN')}.`,
      {
        status: 403,
        code: 'account_temporarily_deactivated',
      }
    );
  }
}

function buildAuthenticatedUser(userRow) {
  const normalizedUserId = Number(userRow.id);
  const roleKeys = resolveUserRoleKeys({
    role: userRow.role,
    isMainAdmin: Boolean(userRow.is_main_admin),
    roles: userRow.role_keys,
  });

  return {
    id: Number.isFinite(normalizedUserId) && normalizedUserId > 0 ? normalizedUserId : userRow.id,
    name: userRow.name,
    email: userRow.email,
    phone: userRow.phone || '',
    role: userRow.role,
    roles: roleKeys,
    accountType: userRow.account_type || 'individual',
    subscriptionTier: userRow.subscription_tier || 'free',
    isMainAdmin: Boolean(userRow.is_main_admin),
    managedAuthProvider: userRow.managed_auth_provider || null,
    managedAuthOnly: Boolean(userRow.managed_auth_only),
  };
}

async function authenticateLegacyAccessToken(token, { updateSessionLastSeen = true } = {}) {
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw createAuthError('Invalid or expired token', {
      status: 401,
      code: 'invalid_token',
    });
  }

  const userRow = await loadAuthenticatedUserRow(payload.id, {
    tokenHash: hashAccessToken(token),
  });
  ensureUserCanAuthenticate(userRow);

  if (updateSessionLastSeen && userRow.session_id) {
    await pool.query('UPDATE user_sessions SET last_seen_at = NOW() WHERE id = $1', [userRow.session_id]);
  }

  return {
    user: buildAuthenticatedUser(userRow),
    strategy: 'legacy',
    sessionId: userRow.session_id ? Number(userRow.session_id) : null,
    authProvider: userRow.managed_auth_provider || null,
  };
}

async function authenticateManagedToken(token) {
  const managedResult = await authenticateManagedAccessToken(token);
  if (!managedResult) {
    throw createAuthError('Invalid or expired token', {
      status: 401,
      code: 'invalid_token',
    });
  }

  const userRow = await loadAuthenticatedUserRow(managedResult.localUserId);
  if (!userRow) {
    throw createAuthError('Managed auth user could not be resolved locally.', {
      status: 401,
      code: 'managed_auth_user_not_found',
    });
  }

  ensureUserCanAuthenticate(userRow);

  return {
    user: buildAuthenticatedUser(userRow),
    strategy: 'managed',
    sessionId: null,
    authProvider:
      managedResult.authProvider ||
      managedResult.identity?.provider ||
      userRow.managed_auth_provider ||
      null,
    identity: managedResult.identity || null,
  };
}

async function authenticateSupabaseToken(token) {
  const managedResult = await authenticateSupabaseAccessToken(token);
  if (!managedResult) {
    throw createAuthError('Invalid or expired token', {
      status: 401,
      code: 'invalid_token',
    });
  }

  const userRow = await loadAuthenticatedUserRow(managedResult.localUserId);
  if (!userRow) {
    throw createAuthError('Managed auth user could not be resolved locally.', {
      status: 401,
      code: 'managed_auth_user_not_found',
    });
  }

  ensureUserCanAuthenticate(userRow);

  return {
    user: buildAuthenticatedUser(userRow),
    strategy: 'managed',
    sessionId: null,
    authProvider:
      managedResult.authProvider ||
      managedResult.identity?.provider ||
      userRow.managed_auth_provider ||
      'supabase',
    identity: managedResult.identity || null,
  };
}

export async function authenticateAccessToken(token, { updateSessionLastSeen = true } = {}) {
  if (!token) {
    throw createAuthError('Authentication required', {
      status: 401,
      code: 'auth_required',
    });
  }

  let legacyError = null;
  try {
    return await authenticateLegacyAccessToken(token, { updateSessionLastSeen });
  } catch (error) {
    if (!error?.isAuthError) {
      throw error;
    }
    legacyError = error;
  }

  if (isManagedAuthEnabled()) {
    try {
      return await authenticateManagedToken(token);
    } catch (error) {
      if (!(error instanceof ManagedAuthError) && !error?.isAuthError) {
        throw error;
      }

      if (error instanceof ManagedAuthError) {
        if (error.status !== 401 || error.code === 'managed_auth_forbidden_token') {
          throw error;
        }
      } else if (error?.status && error.status !== 401) {
        throw error;
      }
    }
  }

  if (!isManagedAuthEnabled() && isSupabaseConfigured()) {
    try {
      return await authenticateSupabaseToken(token);
    } catch (error) {
      if (!(error instanceof ManagedAuthError) && !error?.isAuthError) {
        throw error;
      }

      if (error instanceof ManagedAuthError) {
        if (error.status !== 401 || error.code === 'managed_auth_forbidden_token') {
          throw error;
        }
      } else if (error?.status && error.status !== 401) {
        throw error;
      }
    }
  }

  throw legacyError || createAuthError('Invalid or expired token', {
    status: 401,
    code: 'invalid_token',
  });
}

export async function requireAuth(req, res, next) {
  const token = readAccessTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required', code: 'auth_required' });
  }

  try {
    const authState = await authenticateAccessToken(token);
    const managedIdentity = authState.identity || null;
    req.user = authState.user;
    req.authToken = token;
    req.authStrategy = authState.strategy;
    req.authProvider = authState.authProvider || authState.user.managedAuthProvider || null;
    req.authSessionId = authState.sessionId;
    req.authIdentity = managedIdentity;
    req.supabaseUser =
      authState.strategy === 'managed' && managedIdentity
        ? {
            ...managedIdentity,
            id: managedIdentity.subject,
            sub: managedIdentity.subject,
          }
        : null;
    req.authenticatedUserId = Number.isFinite(Number(authState.user?.id))
      ? Number(authState.user.id)
      : null;
    return next();
  } catch (error) {
    const status = Number(error?.status || 401);
    const responseBody = {
      error: error?.message || 'Invalid or expired token',
    };

    if (typeof error?.code === 'string' && error.code) {
      responseBody.code = error.code;
    }

    return res.status(status).json(responseBody);
  }
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userRoleKeys = resolveUserRoleKeys(req.user);
    const isAllowed = userRoleKeys.some((roleKey) => allowedRoles.includes(roleKey));
    if (!isAllowed) {
      void logDeniedAccess(req, {
        reason: 'role_mismatch',
        requiredRoles: allowedRoles,
      });
      return res.status(403).json({ error: 'You do not have access to this resource' });
    }

    return next();
  };
}

export const requireRoles = requireRole;

export function requireMainAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const userRoleKeys = resolveUserRoleKeys(req.user);
  if (!req.user.isMainAdmin && !userRoleKeys.includes('main_admin')) {
    void logDeniedAccess(req, {
      reason: 'main_admin_required',
    });
    return res.status(403).json({ error: 'Main admin access required' });
  }

  return next();
}

async function loadPermissionSet(req) {
  if (req.permissionSet instanceof Set) {
    return req.permissionSet;
  }

  if (!req.user) {
    return new Set();
  }

  const roleKeys = resolveUserRoleKeys(req.user);
  const cacheKey = `${roleKeys.join('|') || 'none'}:${req.user.isMainAdmin ? 'main' : 'regular'}`;
  const cachedPermissions = readPermissionCache(cacheKey);
  const permissionSet = new Set(cachedPermissions || []);

  if (!cachedPermissions) {
    const rows = await pool.query(
      `
        SELECT DISTINCT rp.permission_key
        FROM role_permissions rp
        JOIN permissions p
          ON p.permission_key = rp.permission_key
        WHERE rp.role = ANY($1::TEXT[])
          AND rp.deleted_at IS NULL
          AND p.deleted_at IS NULL
          AND (rp.main_admin_only = FALSE OR $2::boolean = TRUE)
      `,
      [roleKeys, req.user.isMainAdmin]
    );

    for (const row of rows.rows) {
      permissionSet.add(String(row.permission_key || ''));
    }

    if (req.user.isMainAdmin) {
      const allRows = await pool.query(
        `
          SELECT permission_key
          FROM permissions
          WHERE deleted_at IS NULL
        `
      );
      for (const row of allRows.rows) {
        permissionSet.add(String(row.permission_key || ''));
      }
    }

    writePermissionCache(cacheKey, permissionSet);
  }

  req.permissionSet = permissionSet;
  return permissionSet;
}

export async function hasPermission(req, permissionKey) {
  const normalizedPermission = String(permissionKey || '').trim();
  if (!req.user || !normalizedPermission) {
    return false;
  }

  const permissionSet = await loadPermissionSet(req);
  return permissionSet.has(normalizedPermission);
}

export function requirePermission(...requiredPermissions) {
  const normalized = requiredPermissions
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (normalized.length === 0) {
      return next();
    }

    try {
      const permissionSet = await loadPermissionSet(req);
      const missing = normalized.filter((permission) => !permissionSet.has(permission));
      if (missing.length > 0) {
        void logDeniedAccess(req, {
          reason: 'missing_permission',
          requiredPermissions: normalized,
          missingPermissions: missing,
        });
        return res.status(403).json({
          error: 'You do not have permission for this action',
          missingPermissions: missing,
        });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

async function loadActiveSubscription(req) {
  if (req.activeSubscription !== undefined) {
    return req.activeSubscription;
  }

  if (!req.user) {
    req.activeSubscription = null;
    return null;
  }

  req.activeSubscription = await getCurrentSubscription(pool, req.user.id, {
    allowFallbackPlan: true,
  });
  return req.activeSubscription;
}

export function checkSubscriptionFeature(featureKey) {
  const normalizedFeature = String(featureKey || '').trim();

  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!normalizedFeature) {
      return next();
    }

    try {
      const activeSubscription = await loadActiveSubscription(req);
      if (!activeSubscription) {
        void logDeniedAccess(req, {
          reason: 'subscription_required',
          metadata: {
            requiredFeature: normalizedFeature,
          },
        });
        return res.status(403).json({
          error: 'No active subscription found for this account.',
          missingFeature: normalizedFeature,
        });
      }

      const featureAccess = resolveSubscriptionFeatureAccess(activeSubscription, normalizedFeature);

      if (!featureAccess.enabled) {
        void logDeniedAccess(req, {
          reason: 'subscription_feature_missing',
          metadata: {
            requiredFeature: normalizedFeature,
            planId: activeSubscription.planId,
            subscriptionTier: activeSubscription.subscriptionTier,
          },
        });
        return res.status(403).json({
          error: `Your plan does not include ${normalizedFeature}.`,
          code: 'subscription_feature_missing',
          missingFeature: normalizedFeature,
          subscriptionTier: activeSubscription.subscriptionTier,
          planId: activeSubscription.planId,
        });
      }

      if (normalizedFeature === 'boost_listing' && Number(activeSubscription.boostCredits || 0) <= 0) {
        void logDeniedAccess(req, {
          reason: 'subscription_boost_credits_exhausted',
          metadata: {
            requiredFeature: normalizedFeature,
            planId: activeSubscription.planId,
            boostCredits: Number(activeSubscription.boostCredits || 0),
          },
        });
        return res.status(403).json({
          error: 'No boost credits left in your active subscription.',
          code: 'subscription_boost_credits_exhausted',
          missingFeature: normalizedFeature,
        });
      }

      req.subscriptionAccess = {
        featureKey: normalizedFeature,
        planId: activeSubscription.planId,
        subscriptionTier: activeSubscription.subscriptionTier,
        limitValue: featureAccess.limitValue,
      };
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function isSafeIdentifier(value) {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value);
}

function parseOwnershipResourceId(rawValue) {
  const value = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue || '').trim();
  if (!value) {
    return null;
  }

  if (NUMERIC_ID_PATTERN.test(value)) {
    const numericId = Number(value);
    if (!Number.isSafeInteger(numericId) || numericId <= 0) {
      return null;
    }
    return {
      kind: 'numeric',
      value: numericId,
      token: value,
    };
  }

  if (UUID_ID_PATTERN.test(value)) {
    return {
      kind: 'uuid',
      value: value.toLowerCase(),
      token: value.toLowerCase(),
    };
  }

  return null;
}

export function requireOwnership({
  tableName,
  ownerColumn = 'submitted_by_user_id',
  idColumn = 'id',
  uuidColumn = null,
  idParam = 'id',
  includeSoftDeleted = false,
}) {
  if (
    !isSafeIdentifier(tableName) ||
    !isSafeIdentifier(ownerColumn) ||
    !isSafeIdentifier(idColumn) ||
    (uuidColumn && !isSafeIdentifier(uuidColumn))
  ) {
    throw new Error('Invalid ownership middleware configuration');
  }

  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const rawResourceId = req.params[idParam];
    if (!rawResourceId) {
      return res.status(400).json({ error: 'Missing resource id for ownership check' });
    }

    const parsedResourceId = parseOwnershipResourceId(rawResourceId);
    if (!parsedResourceId) {
      return res.status(400).json({ error: 'Invalid resource id' });
    }

    try {
      const idFilterClause =
        parsedResourceId.kind === 'numeric'
          ? `${idColumn} = $1`
          : uuidColumn
            ? `${uuidColumn} = $1::uuid`
            : null;

      if (!idFilterClause) {
        return res.status(400).json({ error: 'Invalid resource id' });
      }

      const rows = await pool.query(
        `
          SELECT ${idColumn} AS id
            ${uuidColumn ? `, ${uuidColumn} AS uuid_id` : ''}
          FROM ${tableName}
          WHERE ${idFilterClause}
            AND ${ownerColumn} = $2
            ${includeSoftDeleted ? '' : 'AND deleted_at IS NULL'}
          LIMIT 1
        `,
        [parsedResourceId.value, req.user.id]
      );

      if (rows.rowCount === 0) {
        void logDeniedAccess(req, {
          reason: 'ownership_check_failed',
          metadata: {
            tableName,
            ownerColumn,
            idColumn,
            resourceId: parsedResourceId.token,
            idKind: parsedResourceId.kind,
          },
        });
        return res.status(403).json({ error: 'You do not own this resource' });
      }

      if (!req.ownership) {
        req.ownership = {};
      }
      req.ownership[idParam] = {
        id: rows.rows[0].id,
        uuidId: uuidColumn ? rows.rows[0].uuid_id || null : null,
        requestedId: parsedResourceId.token,
      };

      return next();
    } catch (error) {
      return next(error);
    }
  };
}
