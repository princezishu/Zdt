import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from 'jose';
import { supabaseClient, supabaseConfig, isSupabaseConfigured } from '../config/supabase.js';
import { pool } from '../db.js';

const MANAGED_AUTH_PROVIDER = String(process.env.MANAGED_AUTH_PROVIDER || '').trim().toLowerCase();
const MANAGED_AUTH_AUTO_LINK_BY_EMAIL =
  String(process.env.MANAGED_AUTH_AUTO_LINK_BY_EMAIL || 'false').trim().toLowerCase() === 'true';

let remoteJwks = null;

export class ManagedAuthError extends Error {
  constructor(message, { status = 401, code = 'managed_auth_error' } = {}) {
    super(message);
    this.name = 'ManagedAuthError';
    this.status = status;
    this.code = code;
  }
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email.includes('@') ? email : '';
}

function normalizePhone(value) {
  const phone = String(value || '').trim().replace(/[\s()-]/g, '');
  if (!phone) {
    return '';
  }
  return /^\+?\d{8,15}$/.test(phone) ? phone.slice(0, 32) : '';
}

function toPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value;
}

function buildDisplayName({ email, phone, userMetadata = {} }) {
  const source = toPlainObject(userMetadata);
  const candidates = [
    source.full_name,
    source.name,
    source.display_name,
    source.first_name && source.last_name ? `${source.first_name} ${source.last_name}` : '',
    email ? email.split('@')[0] : '',
    phone,
    'Managed User',
  ];

  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim();
    if (normalized) {
      return normalized.slice(0, 120);
    }
  }

  return 'Managed User';
}

function buildSyntheticEmail(provider, subject) {
  const digest = crypto
    .createHash('sha256')
    .update(`${provider}:${subject}`)
    .digest('hex')
    .slice(0, 20);
  return `${provider}-${digest}@managed.local`;
}

function getSupabaseJwks() {
  if (!remoteJwks) {
    remoteJwks = createRemoteJWKSet(new URL(supabaseConfig.jwtJwksUrl));
  }
  return remoteJwks;
}

function ensureSupabaseConfigured() {
  if (!isSupabaseConfigured()) {
    throw new ManagedAuthError('Supabase Auth is not fully configured on the server.', {
      status: 503,
      code: 'managed_auth_not_configured',
    });
  }
}

function mapSupabaseJwtPayload(payload) {
  const userMetadata = toPlainObject(payload?.user_metadata);
  const email = normalizeEmail(payload?.email);
  const phone = normalizePhone(payload?.phone || userMetadata.phone);
  return {
    provider: 'supabase',
    subject: String(payload?.sub || '').trim(),
    email,
    phone,
    emailVerified: Boolean(payload?.email_confirmed_at || payload?.email_verified),
    name: buildDisplayName({ email, phone, userMetadata }),
    userMetadata,
    appMetadata: toPlainObject(payload?.app_metadata),
    rawClaims: payload,
  };
}

function mapSupabaseUserRecord(userRecord) {
  const userMetadata = toPlainObject(userRecord?.user_metadata);
  const email = normalizeEmail(userRecord?.email);
  const phone = normalizePhone(userRecord?.phone || userMetadata.phone);
  return {
    provider: 'supabase',
    subject: String(userRecord?.id || '').trim(),
    email,
    phone,
    emailVerified: Boolean(userRecord?.email_confirmed_at),
    name: buildDisplayName({ email, phone, userMetadata }),
    userMetadata,
    appMetadata: toPlainObject(userRecord?.app_metadata),
    rawClaims: userRecord,
  };
}

async function fetchSupabaseUser(token) {
  const { data, error } = await supabaseClient.auth.getUser(token);
  if (error) {
    throw new ManagedAuthError(error.message || 'Supabase Auth validation failed.', {
      status: Number(error.status || 503),
      code: typeof error.code === 'string' && error.code ? error.code : 'managed_auth_verification_failed',
    });
  }

  return data?.user || null;
}

async function verifySupabaseAccessToken(token) {
  ensureSupabaseConfigured();

  let header;
  try {
    header = decodeProtectedHeader(token);
  } catch {
    throw new ManagedAuthError('Managed auth token is malformed.', {
      status: 401,
      code: 'managed_auth_invalid_token',
    });
  }

  const algorithm = String(header?.alg || '').trim().toUpperCase();
  if (algorithm.startsWith('HS')) {
    const userRecord = await fetchSupabaseUser(token);
    const mapped = mapSupabaseUserRecord(userRecord);
    if (!mapped.subject) {
      throw new ManagedAuthError('Managed auth token did not include a subject.', {
        status: 401,
        code: 'managed_auth_invalid_token',
      });
    }
    return mapped;
  }

  const verifyOptions = {
    issuer: supabaseConfig.jwtIssuer,
    clockTolerance: 5,
  };
  if (supabaseConfig.jwtAudience) {
    verifyOptions.audience = supabaseConfig.jwtAudience;
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(token, getSupabaseJwks(), verifyOptions));
  } catch {
    throw new ManagedAuthError('Managed auth token is invalid or expired.', {
      status: 401,
      code: 'managed_auth_invalid_token',
    });
  }

  if (String(payload?.role || '').trim() === 'service_role') {
    throw new ManagedAuthError('Service role tokens are not accepted for user authentication.', {
      status: 403,
      code: 'managed_auth_forbidden_token',
    });
  }

  const mapped = mapSupabaseJwtPayload(payload);
  if (!mapped.subject) {
    throw new ManagedAuthError('Managed auth token did not include a subject.', {
      status: 401,
      code: 'managed_auth_invalid_token',
    });
  }

  return mapped;
}

export function isManagedAuthEnabled() {
  return MANAGED_AUTH_PROVIDER === 'supabase' && isSupabaseConfigured();
}

export function getManagedAuthProvider() {
  return isManagedAuthEnabled() ? MANAGED_AUTH_PROVIDER : '';
}

export async function verifyManagedAccessToken(token) {
  if (!isManagedAuthEnabled()) {
    return null;
  }

  if (MANAGED_AUTH_PROVIDER === 'supabase') {
    return verifySupabaseAccessToken(token);
  }

  throw new ManagedAuthError(`Unsupported managed auth provider: ${MANAGED_AUTH_PROVIDER}`, {
    status: 503,
    code: 'managed_auth_not_supported',
  });
}

async function generateManagedPasswordHash() {
  return bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
}

async function loadLinkedUserForIdentity(client, identity) {
  const rows = await client.query(
    `
      SELECT
        id,
        email,
        name,
        phone,
        managed_auth_provider,
        managed_auth_subject,
        managed_auth_only
      FROM users
      WHERE managed_auth_provider = $1
        AND managed_auth_subject = $2
      LIMIT 1
      FOR UPDATE
    `,
    [identity.provider, identity.subject]
  );

  return rows.rowCount > 0 ? rows.rows[0] : null;
}

async function loadEmailMatchForIdentity(client, email) {
  if (!email) {
    return null;
  }

  const rows = await client.query(
    `
      SELECT
        id,
        email,
        role,
        company_role,
        account_type,
        is_main_admin,
        managed_auth_provider,
        managed_auth_subject,
        managed_auth_only
      FROM users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 2
      FOR UPDATE
    `,
    [email]
  );

  if (rows.rowCount > 1) {
    throw new ManagedAuthError('This email is linked to multiple legacy accounts. Link the account manually.', {
      status: 409,
      code: 'managed_auth_link_required',
    });
  }

  return rows.rowCount > 0 ? rows.rows[0] : null;
}

function isSelfServiceManagedLinkEligible(userRow) {
  const role = String(userRow?.role || '').trim().toLowerCase();
  const accountType = String(userRow?.account_type || 'individual').trim().toLowerCase();
  const companyRole = String(userRow?.company_role || '').trim().toLowerCase();
  return (
    role === 'user' &&
    accountType === 'individual' &&
    !companyRole &&
    !Boolean(userRow?.is_main_admin)
  );
}

async function updateLinkedUser(client, userId, identity) {
  await client.query(
    `
      UPDATE users
      SET
        managed_auth_provider = $2,
        managed_auth_subject = $3,
        managed_auth_email_verified = $4,
        managed_auth_last_sign_in_at = NOW(),
        managed_auth_only = CASE
          WHEN managed_auth_provider IS NULL AND managed_auth_subject IS NULL THEN managed_auth_only
          ELSE managed_auth_only
        END
      WHERE id = $1
    `,
    [userId, identity.provider, identity.subject, identity.emailVerified]
  );
}

export async function resolveManagedAuthUser(identity) {
  if (!identity || !identity.subject || !identity.provider) {
    throw new ManagedAuthError('Managed auth identity is incomplete.', {
      status: 401,
      code: 'managed_auth_invalid_token',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existingLinkedUser = await loadLinkedUserForIdentity(client, identity);
    if (existingLinkedUser) {
      await updateLinkedUser(client, existingLinkedUser.id, identity);
      await client.query('COMMIT');
      return {
        localUserId: Number(existingLinkedUser.id),
        authProvider: identity.provider,
        managedAuthOnly: Boolean(existingLinkedUser.managed_auth_only),
        created: false,
        autoLinked: false,
      };
    }

    const emailMatch = await loadEmailMatchForIdentity(client, identity.email);
    if (emailMatch) {
      if (!MANAGED_AUTH_AUTO_LINK_BY_EMAIL || !identity.emailVerified) {
        throw new ManagedAuthError(
          'This managed identity matches an existing legacy account. Link it from a legacy session before using managed auth.',
          {
            status: 409,
            code: 'managed_auth_link_required',
          }
        );
      }

      if (emailMatch.managed_auth_provider && emailMatch.managed_auth_subject) {
        throw new ManagedAuthError('This account is already linked to another managed identity.', {
          status: 409,
          code: 'managed_auth_already_linked',
        });
      }

      await updateLinkedUser(client, emailMatch.id, identity);
      await client.query('COMMIT');
      return {
        localUserId: Number(emailMatch.id),
        authProvider: identity.provider,
        managedAuthOnly: Boolean(emailMatch.managed_auth_only),
        created: false,
        autoLinked: true,
      };
    }

    const nextEmail = identity.email || buildSyntheticEmail(identity.provider, identity.subject);
    const passwordHash = await generateManagedPasswordHash();
    const insertRows = await client.query(
      `
        INSERT INTO users (
          name,
          email,
          password_hash,
          phone,
          role,
          account_type,
          subscription_tier,
          managed_auth_provider,
          managed_auth_subject,
          managed_auth_email_verified,
          managed_auth_only,
          managed_auth_last_sign_in_at
        )
        VALUES ($1, $2, $3, $4, 'user', 'individual', 'free', $5, $6, $7, TRUE, NOW())
        RETURNING id, managed_auth_only
      `,
      [
        buildDisplayName(identity),
        nextEmail,
        passwordHash,
        identity.phone || null,
        identity.provider,
        identity.subject,
        identity.emailVerified,
      ]
    );

    await client.query('COMMIT');
    return {
      localUserId: Number(insertRows.rows[0].id),
      authProvider: identity.provider,
      managedAuthOnly: Boolean(insertRows.rows[0].managed_auth_only),
      created: true,
      autoLinked: false,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function authenticateManagedAccessToken(token) {
  const identity = await verifyManagedAccessToken(token);
  if (!identity) {
    return null;
  }

  const resolution = await resolveManagedAuthUser(identity);
  return {
    ...resolution,
    identity,
  };
}

export async function authenticateSupabaseAccessToken(token) {
  const identity = await verifySupabaseAccessToken(token);
  const resolution = await resolveManagedAuthUser(identity);
  return {
    ...resolution,
    identity,
  };
}

export async function linkManagedIdentityToUser(userId, token) {
  const identity = await verifyManagedAccessToken(token);
  if (!identity) {
    throw new ManagedAuthError('Managed auth is not enabled.', {
      status: 503,
      code: 'managed_auth_not_configured',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userRows = await client.query(
      `
        SELECT
          id,
          managed_auth_provider,
          managed_auth_subject,
          managed_auth_only
        FROM users
        WHERE id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [userId]
    );

    if (userRows.rowCount === 0) {
      throw new ManagedAuthError('User not found.', {
        status: 404,
        code: 'managed_auth_user_not_found',
      });
    }

    const currentUser = userRows.rows[0];
    if (
      currentUser.managed_auth_provider &&
      currentUser.managed_auth_subject &&
      (currentUser.managed_auth_provider !== identity.provider ||
        currentUser.managed_auth_subject !== identity.subject)
    ) {
      throw new ManagedAuthError('This account is already linked to another managed identity.', {
        status: 409,
        code: 'managed_auth_already_linked',
      });
    }

    const existingLinkedUser = await loadLinkedUserForIdentity(client, identity);
    if (existingLinkedUser && Number(existingLinkedUser.id) !== Number(userId)) {
      throw new ManagedAuthError('This managed identity is already linked to another account.', {
        status: 409,
        code: 'managed_auth_identity_in_use',
      });
    }

    await updateLinkedUser(client, userId, identity);
    await client.query('COMMIT');

    return {
      authProvider: identity.provider,
      managedAuthOnly: Boolean(currentUser.managed_auth_only),
      identity,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function linkManagedIdentityToMatchingUserByEmail(token) {
  const identity = await verifyManagedAccessToken(token);
  if (!identity) {
    throw new ManagedAuthError('Managed auth is not enabled.', {
      status: 503,
      code: 'managed_auth_not_configured',
    });
  }

  if (!identity.email) {
    throw new ManagedAuthError('Managed auth account does not include a usable email address.', {
      status: 409,
      code: 'managed_auth_email_required',
    });
  }

  if (!identity.emailVerified) {
    throw new ManagedAuthError('Verify your managed auth email before linking an existing account.', {
      status: 409,
      code: 'managed_auth_email_not_verified',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existingLinkedUser = await loadLinkedUserForIdentity(client, identity);
    if (existingLinkedUser) {
      await updateLinkedUser(client, existingLinkedUser.id, identity);
      await client.query('COMMIT');
      return {
        localUserId: Number(existingLinkedUser.id),
        authProvider: identity.provider,
        managedAuthOnly: Boolean(existingLinkedUser.managed_auth_only),
        identity,
        alreadyLinked: true,
      };
    }

    const emailMatch = await loadEmailMatchForIdentity(client, identity.email);
    if (!emailMatch) {
      throw new ManagedAuthError('No existing account was found for this email address.', {
        status: 404,
        code: 'managed_auth_no_matching_account',
      });
    }

    if (!isSelfServiceManagedLinkEligible(emailMatch)) {
      throw new ManagedAuthError(
        'This account must be linked manually from an existing legacy session or by support.',
        {
          status: 403,
          code: 'managed_auth_self_service_unavailable',
        }
      );
    }

    if (
      emailMatch.managed_auth_provider &&
      emailMatch.managed_auth_subject &&
      (emailMatch.managed_auth_provider !== identity.provider ||
        emailMatch.managed_auth_subject !== identity.subject)
    ) {
      throw new ManagedAuthError('This account is already linked to another managed identity.', {
        status: 409,
        code: 'managed_auth_already_linked',
      });
    }

    await updateLinkedUser(client, emailMatch.id, identity);
    await client.query('COMMIT');

    return {
      localUserId: Number(emailMatch.id),
      authProvider: identity.provider,
      managedAuthOnly: Boolean(emailMatch.managed_auth_only),
      identity,
      alreadyLinked: false,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
