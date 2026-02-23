import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { pool } from '../db.js';

const { JWT_SECRET = '', PERMISSION_CACHE_TTL_MS = '60000' } = process.env;
const permissionCacheTtlMs = Number.isFinite(Number(PERMISSION_CACHE_TTL_MS))
  ? Math.max(5000, Number(PERMISSION_CACHE_TTL_MS))
  : 60_000;
const permissionCache = new Map();
const NUMERIC_ID_PATTERN = /^\d+$/;
const UUID_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const userRows = await pool.query(
      `
        SELECT
          u.id,
          u.name,
          u.email,
          u.role,
          u.account_type,
          u.subscription_tier,
          u.is_main_admin,
          u.is_active,
          u.deactivated_until,
          s.id AS session_id,
          COALESCE(
            ARRAY_REMOVE(
              ARRAY_AGG(DISTINCT ur.role_key) FILTER (WHERE ur.deleted_at IS NULL),
              NULL
            ),
            ARRAY[]::TEXT[]
          ) AS role_keys
        FROM users u
        JOIN user_sessions s
          ON s.user_id = u.id
         AND s.token_hash = $2
         AND s.revoked_at IS NULL
        LEFT JOIN user_roles ur
          ON ur.user_id = u.id
        WHERE u.id = $1
        GROUP BY
          u.id,
          u.name,
          u.email,
          u.role,
          u.account_type,
          u.subscription_tier,
          u.is_main_admin,
          u.is_active,
          u.deactivated_until,
          s.id
        LIMIT 1
      `,
      [payload.id, tokenHash]
    );

    if (userRows.rowCount === 0) {
      return res.status(401).json({ error: 'Invalid session. Please log in again.' });
    }

    const user = userRows.rows[0];
    const roleKeys = resolveUserRoleKeys({
      role: user.role,
      isMainAdmin: Boolean(user.is_main_admin),
      roles: user.role_keys,
    });

    if (!user.is_active) {
      return res.status(403).json({ error: 'Your account is deactivated' });
    }

    if (user.deactivated_until && new Date(user.deactivated_until).getTime() > Date.now()) {
      return res.status(403).json({
        error: `Your account is temporarily deactivated until ${new Date(
          user.deactivated_until
        ).toLocaleString('en-IN')}.`,
      });
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      roles: roleKeys,
      accountType: user.account_type || 'individual',
      subscriptionTier: user.subscription_tier || 'free',
      isMainAdmin: user.is_main_admin,
    };

    await pool.query('UPDATE user_sessions SET last_seen_at = NOW() WHERE id = $1', [user.session_id]);

    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const userRoleKeys = resolveUserRoleKeys(req.user);
    const isAllowed = Boolean(req.user) && userRoleKeys.some((roleKey) => allowedRoles.includes(roleKey));
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
  const userRoleKeys = resolveUserRoleKeys(req.user);
  if (!req.user || (!req.user.isMainAdmin && !userRoleKeys.includes('main_admin'))) {
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

  const rows = await pool.query(
    `
      SELECT
        s.id,
        s.plan_id,
        s.subscription_tier,
        s.features_json,
        s.listing_quota,
        s.boost_credits,
        s.end_date
      FROM subscriptions s
      WHERE s.user_id = $1
        AND s.is_active = TRUE
        AND (s.end_date IS NULL OR s.end_date >= CURRENT_DATE)
      ORDER BY s.updated_at DESC, s.created_at DESC
      LIMIT 1
    `,
    [req.user.id]
  );

  req.activeSubscription = rows.rowCount > 0 ? rows.rows[0] : null;
  return req.activeSubscription;
}

function toFeatureEnabled(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'enabled' || normalized === 'yes';
  }
  return null;
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

      let featureEnabled = null;
      let featureLimit = null;
      const featuresObject =
        activeSubscription.features_json &&
        typeof activeSubscription.features_json === 'object' &&
        !Array.isArray(activeSubscription.features_json)
          ? activeSubscription.features_json
          : {};

      if (Object.prototype.hasOwnProperty.call(featuresObject, normalizedFeature)) {
        featureEnabled = toFeatureEnabled(featuresObject[normalizedFeature]);
      }

      if (featureEnabled === null) {
        const featureRows = await pool.query(
          `
            SELECT is_enabled, limit_value
            FROM plan_features
            WHERE plan_id = $1
              AND feature_key = $2
            LIMIT 1
          `,
          [activeSubscription.plan_id, normalizedFeature]
        );

        if (featureRows.rowCount > 0) {
          featureEnabled = Boolean(featureRows.rows[0].is_enabled);
          featureLimit = featureRows.rows[0].limit_value === null ? null : Number(featureRows.rows[0].limit_value);
        }
      }

      if (!featureEnabled) {
        void logDeniedAccess(req, {
          reason: 'subscription_feature_missing',
          metadata: {
            requiredFeature: normalizedFeature,
            planId: activeSubscription.plan_id,
            subscriptionTier: activeSubscription.subscription_tier,
          },
        });
        return res.status(403).json({
          error: `Your plan does not include ${normalizedFeature}.`,
          missingFeature: normalizedFeature,
          subscriptionTier: activeSubscription.subscription_tier,
          planId: activeSubscription.plan_id,
        });
      }

      if (normalizedFeature === 'boost_listing' && Number(activeSubscription.boost_credits || 0) <= 0) {
        void logDeniedAccess(req, {
          reason: 'subscription_boost_credits_exhausted',
          metadata: {
            requiredFeature: normalizedFeature,
            planId: activeSubscription.plan_id,
            boostCredits: Number(activeSubscription.boost_credits || 0),
          },
        });
        return res.status(403).json({
          error: 'No boost credits left in your active subscription.',
          missingFeature: normalizedFeature,
        });
      }

      req.subscriptionAccess = {
        featureKey: normalizedFeature,
        planId: activeSubscription.plan_id,
        subscriptionTier: activeSubscription.subscription_tier,
        limitValue: featureLimit,
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
