import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import { z } from 'zod';
import { pool } from '../db.js';
import { requireAuth, requireMainAdmin, requirePermission } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { sendEmailMessage, sendOtp } from '../services/otpDelivery.js';

const { JWT_SECRET = '', JWT_EXPIRES_IN = '7d' } = process.env;
const APP_NAME = process.env.APP_NAME || 'ZDT Realty';
const OTP_EXPIRES_MINUTES = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 15;
const MAX_OTP_ATTEMPTS = 5;
const MAX_ACTIVE_DEVICES_PER_ACCOUNT = 2;
const PROFILE_PHOTO_UPLOAD_LIMIT_BYTES = 500 * 1024;
const MAIN_ADMIN_MEDIA_IMAGE_LIMIT_BYTES = 6 * 1024 * 1024;
const MAIN_ADMIN_MEDIA_VIDEO_LIMIT_BYTES = 30 * 1024 * 1024;
const PUBLIC_IMAGE_UPLOAD_LIMIT_BYTES = 2 * 1024 * 1024;
const MEDIA_SIGNED_URL_TTL_SECONDS = Math.max(
  60,
  Number.parseInt(process.env.MEDIA_SIGNED_URL_TTL_SECONDS || '900', 10) || 900
);
const PRIVATE_UPLOADS_ROOT = path.resolve(
  process.env.PRIVATE_UPLOADS_ROOT?.trim() || path.join(process.cwd(), 'private_uploads')
);
const MEDIA_SIGNING_SECRET =
  process.env.MEDIA_SIGNING_SECRET?.trim() ||
  (JWT_SECRET ? `${JWT_SECRET}:media` : 'replace-media-signing-secret');
const PUBLIC_IMAGE_UPLOAD_FOLDERS = {
  promotion: 'promotions',
  material: 'materials',
  builder_project: 'builder-projects',
  realty_project: 'realty-projects',
  realty_property: 'realty-properties',
  owner_kyc: 'owner-kyc',
};
const PUBLIC_IMAGE_UPLOAD_PURPOSES = Object.keys(PUBLIC_IMAGE_UPLOAD_FOLDERS);
const PUBLIC_IMAGE_UPLOAD_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const PUBLIC_OWNER_KYC_UPLOAD_MIME_TYPES = new Set([...PUBLIC_IMAGE_UPLOAD_MIME_TYPES, 'application/pdf']);
const GOVT_ID_KEYS = ['aadhaar', 'pan', 'passport', 'drivingLicense', 'addressProof'];
const GOVT_STATUS_VALUES = ['Not Submitted', 'Pending Verification', 'Verified', 'Rejected'];
const NUMERIC_ID_PATTERN = /^\d+$/;
const UUID_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const router = Router();

const registerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(190),
  password: z.string().min(8).max(128),
  phone: z.string().max(32).optional().or(z.literal('')),
  deviceId: z.string().trim().min(8).max(120).optional(),
});

const loginSchema = z.object({
  email: z.string().email().max(190),
  password: z.string().min(8).max(128),
  role: z.enum(['user', 'team_member', 'admin']).optional(),
  referenceId: z.string().trim().min(3).max(64).optional(),
  registrationNumber: z.string().trim().min(3).max(64).optional(),
  deviceId: z.string().trim().min(8).max(120).optional(),
});

const newsletterSubscribeSchema = z.object({
  email: z.string().email().max(190),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(128),
  newPassword: z.string().min(8).max(128),
});

const logoutAllSchema = z.object({
  keepCurrent: z.boolean().optional().default(false),
});

const deactivateAccountSchema = z.object({
  confirmation: z.string().trim().min(3).max(32),
});

const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(120).default(40),
});

const preferencePropertyTypeSchema = z.enum([
  'Any',
  'Plot',
  'Villa',
  'Flat / Apartment',
  'Commercial',
]);

const profileUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    phone: z.string().trim().min(8).max(32).optional(),
    photoUrl: z.string().trim().max(500).optional().or(z.literal('')),
    city: z.string().trim().max(120).optional().or(z.literal('')),
    state: z.string().trim().max(120).optional().or(z.literal('')),
    country: z.string().trim().max(120).optional().or(z.literal('')),
    twoFactorEnabled: z.boolean().optional(),
    preferences: z
      .object({
        budgetRange: z.string().trim().max(120).optional().or(z.literal('')),
        preferredLocation: z.string().trim().max(120).optional().or(z.literal('')),
        propertyType: preferencePropertyTypeSchema.optional(),
        facingDirection: z.string().trim().max(60).optional().or(z.literal('')),
        furnishedPreference: z.string().trim().max(60).optional().or(z.literal('')),
      })
      .partial()
      .optional(),
    communication: z
      .object({
        emailUpdates: z.boolean().optional(),
        propertyAlerts: z.boolean().optional(),
        adminAnnouncements: z.boolean().optional(),
      })
      .partial()
      .optional(),
    governmentIds: z
      .object({
        aadhaar: z.string().trim().max(24).optional().or(z.literal('')),
        pan: z.string().trim().max(24).optional().or(z.literal('')),
        passport: z.string().trim().max(24).optional().or(z.literal('')),
        drivingLicense: z.string().trim().max(36).optional().or(z.literal('')),
        addressProof: z.string().trim().max(160).optional().or(z.literal('')),
      })
      .partial()
      .optional(),
  })
  .superRefine((payload, ctx) => {
    if (payload.phone) {
      const normalizedPhone = normalizePhone(payload.phone);
      if (!normalizedPhone) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['phone'],
          message: 'Invalid phone number. Use digits with optional leading +.',
        });
      }
    }

    if (payload.governmentIds?.aadhaar) {
      const cleaned = payload.governmentIds.aadhaar.replace(/\D/g, '');
      if (!/^\d{12}$/.test(cleaned)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['governmentIds', 'aadhaar'],
          message: 'Aadhaar must be 12 digits.',
        });
      }
    }

    if (payload.governmentIds?.pan) {
      const cleaned = payload.governmentIds.pan.trim().toUpperCase();
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(cleaned)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['governmentIds', 'pan'],
          message: 'PAN format must be AAAAA9999A.',
        });
      }
    }
  });

function normalizePhone(phone) {
  const cleaned = phone.trim().replace(/[\s()-]/g, '');
  if (!/^\+?\d{8,15}$/.test(cleaned)) {
    return null;
  }
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}

function phoneToDigits(phone) {
  return phone.replace(/\D/g, '');
}

function toObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value;
}

function toTrimmedString(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function parseRouteEntityId(rawValue) {
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

function buildDualIdFilter(
  parsedId,
  {
    idColumn = 'id',
    uuidColumn = 'uuid_id',
    parameterIndex = 1,
  } = {}
) {
  if (!parsedId) {
    return null;
  }

  if (parsedId.kind === 'numeric') {
    return {
      clause: `${idColumn} = $${parameterIndex}`,
      values: [parsedId.value],
    };
  }

  return {
    clause: `${uuidColumn} = $${parameterIndex}::uuid`,
    values: [parsedId.value],
  };
}

function normalizeAadhaar(value) {
  const digits = value.replace(/\D/g, '');
  if (!/^\d{12}$/.test(digits)) {
    return '';
  }
  return digits;
}

function normalizePan(value) {
  const cleaned = value.trim().toUpperCase();
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(cleaned)) {
    return '';
  }
  return cleaned;
}

function normalizeGovtIdValue(key, value) {
  const cleaned = toTrimmedString(value);
  if (!cleaned) {
    return '';
  }

  if (key === 'aadhaar') {
    return normalizeAadhaar(cleaned);
  }
  if (key === 'pan') {
    return normalizePan(cleaned);
  }

  return cleaned.slice(0, key === 'addressProof' ? 160 : 36);
}

function normalizeGovtStatus(value) {
  if (typeof value !== 'string') {
    return 'Not Submitted';
  }
  return GOVT_STATUS_VALUES.includes(value) ? value : 'Not Submitted';
}

function normalizeGovtStatusForSave(value) {
  const status = normalizeGovtStatus(value);
  if (status === 'Verified' || status === 'Rejected') {
    return 'Pending Verification';
  }
  return status;
}

function maskGovtId(key, value) {
  const text = toTrimmedString(value);
  if (!text) {
    return '';
  }

  if (key === 'aadhaar') {
    const digits = text.replace(/\D/g, '');
    if (digits.length < 4) {
      return '********';
    }
    return `********${digits.slice(-4)}`;
  }

  if (key === 'pan') {
    const cleaned = text.toUpperCase();
    if (cleaned.length !== 10) {
      return '**********';
    }
    return `${cleaned.slice(0, 5)}****${cleaned.slice(-1)}`;
  }

  if (text.length <= 4) {
    return `${text[0] || ''}***`;
  }

  return `${text.slice(0, 2)}****${text.slice(-2)}`;
}

function sanitizePreferences(value) {
  const source = toObject(value);
  const propertyTypeRaw = toTrimmedString(source.propertyType);
  const propertyType = preferencePropertyTypeSchema.safeParse(propertyTypeRaw).success
    ? propertyTypeRaw
    : 'Any';

  return {
    budgetRange: toTrimmedString(source.budgetRange).slice(0, 120),
    preferredLocation: toTrimmedString(source.preferredLocation).slice(0, 120),
    propertyType,
    facingDirection: toTrimmedString(source.facingDirection).slice(0, 60),
    furnishedPreference: toTrimmedString(source.furnishedPreference).slice(0, 60),
  };
}

function sanitizeCommunication(value) {
  const source = toObject(value);
  return {
    emailUpdates: source.emailUpdates !== false,
    propertyAlerts: source.propertyAlerts !== false,
    adminAnnouncements: source.adminAnnouncements !== false,
  };
}

function buildGovernmentSummary(governmentIdsRaw, governmentStatusesRaw) {
  const ids = toObject(governmentIdsRaw);
  const statuses = toObject(governmentStatusesRaw);
  const output = {};
  let trustScore = 20;
  let hasVerified = false;

  GOVT_ID_KEYS.forEach((key) => {
    const rawValue = toTrimmedString(ids[key]);
    const status = rawValue ? normalizeGovtStatus(statuses[key]) : 'Not Submitted';

    if (status === 'Verified') {
      trustScore += 16;
      hasVerified = true;
    } else if (status === 'Pending Verification') {
      trustScore += 6;
    }

    output[key] = {
      status,
      maskedValue: maskGovtId(key, rawValue),
    };
  });

  return {
    ids: output,
    trustScore: Math.min(100, trustScore),
    verifiedBadge: hasVerified,
  };
}

function monthLabelFromDate(date) {
  return new Intl.DateTimeFormat('en-IN', {
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function buildRecentSixMonthSeries(rows) {
  const monthLookup = new Map();
  rows.forEach((entry) => {
    const dt = new Date(entry.month_start);
    monthLookup.set(`${dt.getUTCFullYear()}-${dt.getUTCMonth() + 1}`, Number(entry.total || 0));
  });

  const output = [];
  for (let i = 5; i >= 0; i -= 1) {
    const dt = new Date();
    dt.setUTCDate(1);
    dt.setUTCHours(0, 0, 0, 0);
    dt.setUTCMonth(dt.getUTCMonth() - i);
    const key = `${dt.getUTCFullYear()}-${dt.getUTCMonth() + 1}`;
    output.push({
      month: monthLabelFromDate(dt),
      total: monthLookup.get(key) || 0,
    });
  }

  return output;
}

const phoneSchema = z
  .string()
  .trim()
  .min(8)
  .max(32)
  .refine((value) => normalizePhone(value) !== null, {
    message: 'Invalid phone number. Use digits with optional leading +.',
  });

const forgotPasswordRequestSchema = z
  .union([
    z.object({
      channel: z.literal('email'),
      email: z.string().email().max(190),
    }),
    z.object({
      channel: z.literal('sms'),
      phone: phoneSchema,
    }),
    z.object({
      email: z.string().email().max(190),
    }),
    z.object({
      phone: phoneSchema,
    }),
  ])
  .transform((payload) => {
    if ('channel' in payload) {
      return payload;
    }
    if ('email' in payload) {
      return { channel: 'email', email: payload.email };
    }
    return { channel: 'sms', phone: payload.phone };
  });

const forgotPasswordResetSchema = z
  .union([
    z.object({
      channel: z.literal('email'),
      email: z.string().email().max(190),
      otp: z.string().regex(/^\d{6}$/),
      newPassword: z.string().min(8).max(128),
    }),
    z.object({
      channel: z.literal('sms'),
      phone: phoneSchema,
      otp: z.string().regex(/^\d{6}$/),
      newPassword: z.string().min(8).max(128),
    }),
    z.object({
      email: z.string().email().max(190),
      otp: z.string().regex(/^\d{6}$/),
      newPassword: z.string().min(8).max(128),
    }),
    z.object({
      phone: phoneSchema,
      otp: z.string().regex(/^\d{6}$/),
      newPassword: z.string().min(8).max(128),
    }),
  ])
  .transform((payload) => {
    if ('channel' in payload) {
      return payload;
    }
    if ('email' in payload) {
      return { ...payload, channel: 'email' };
    }
    return { ...payload, channel: 'sms' };
  });

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isMainAdmin: Boolean(user.isMainAdmin),
      // Ensure each login/register issues a unique token even within the same second.
      jti: crypto.randomUUID(),
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function decodeImageDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') {
    return null;
  }

  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!match) {
    return null;
  }

  const mimeType = match[1];
  const b64 = match[2];
  const buffer = Buffer.from(b64, 'base64');
  if (!buffer || buffer.length === 0) {
    return null;
  }

  const ext =
    mimeType === 'image/png'
      ? 'png'
      : mimeType === 'image/jpeg'
        ? 'jpg'
        : 'webp';

  return { mimeType, ext, buffer };
}

function decodeProfileMediaDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') {
    return null;
  }

  const match =
    /^data:((?:image\/(?:png|jpeg|webp))|(?:video\/(?:mp4|webm|ogg)));base64,([A-Za-z0-9+/=]+)$/.exec(
      dataUrl.trim()
    );
  if (!match) {
    return null;
  }

  const mimeType = match[1];
  const b64 = match[2];
  const buffer = Buffer.from(b64, 'base64');
  if (!buffer || buffer.length === 0) {
    return null;
  }

  let ext = 'bin';
  if (mimeType === 'image/png') ext = 'png';
  else if (mimeType === 'image/jpeg') ext = 'jpg';
  else if (mimeType === 'image/webp') ext = 'webp';
  else if (mimeType === 'video/mp4') ext = 'mp4';
  else if (mimeType === 'video/webm') ext = 'webm';
  else if (mimeType === 'video/ogg') ext = 'ogv';

  return {
    mimeType,
    ext,
    mediaType: mimeType.startsWith('video/') ? 'video' : 'image',
    buffer,
  };
}

function mapMainAdminProfileMediaRow(row, req = null) {
  const storageVisibility =
    row.storage_visibility === 'private' || row.storage_visibility === 'public'
      ? row.storage_visibility
      : 'public';
  const storagePath = typeof row.storage_path === 'string' ? row.storage_path : '';
  const resolvedMediaUrl =
    storageVisibility === 'private' && storagePath
      ? buildSignedMediaUrl(req, storagePath)
      : row.media_url || '';

  return {
    id: Number(row.id),
    category: row.category,
    mediaType: row.media_type,
    mimeType: row.mime_type || '',
    mediaUrl: resolvedMediaUrl,
    storageVisibility,
    title: row.title || '',
    description: row.description || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function resolveProfilePhotoUrl(photoUrl, req = null) {
  const value = String(photoUrl || '').trim();
  if (!value) {
    return '';
  }
  if (value.startsWith('private://')) {
    const storagePath = value.slice('private://'.length);
    return buildSignedMediaUrl(req, storagePath);
  }
  return value;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function normalizeIpAddress(rawValue) {
  if (!rawValue) return '';
  return String(rawValue).split(',')[0].trim().slice(0, 64);
}

function isSafePrivateStoragePath(value) {
  const normalized = String(value || '').replace(/\\/g, '/').trim();
  if (!normalized) return false;
  if (normalized.startsWith('/')) return false;
  if (normalized.includes('..')) return false;
  return /^(main-admin-media|profile-photos)\/[a-zA-Z0-9._-]+$/.test(normalized);
}

function ensurePrivateStorageDir(folderName) {
  const resolved = path.resolve(PRIVATE_UPLOADS_ROOT, folderName);
  const root = path.resolve(PRIVATE_UPLOADS_ROOT);
  if (!(resolved === root || resolved.startsWith(`${root}${path.sep}`))) {
    throw new Error('Invalid private storage directory');
  }
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

function ensurePublicUploadDir(folderName) {
  const uploadsRoot = path.resolve(process.cwd(), 'uploads');
  const resolved = path.resolve(uploadsRoot, folderName);
  if (!(resolved === uploadsRoot || resolved.startsWith(`${uploadsRoot}${path.sep}`))) {
    throw new Error('Invalid public storage directory');
  }
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

function resolvePrivateStorageAbsolutePath(storagePath) {
  if (!isSafePrivateStoragePath(storagePath)) {
    return null;
  }
  const normalized = String(storagePath).replace(/\\/g, '/');
  const resolved = path.resolve(PRIVATE_UPLOADS_ROOT, normalized);
  const root = path.resolve(PRIVATE_UPLOADS_ROOT);
  if (!(resolved === root || resolved.startsWith(`${root}${path.sep}`))) {
    return null;
  }
  return resolved;
}

function signMediaAccessToken(storagePath, expiresAtUnix) {
  return crypto
    .createHmac('sha256', MEDIA_SIGNING_SECRET)
    .update(`${storagePath}:${expiresAtUnix}`)
    .digest('hex');
}

function buildSignedMediaUrl(req, storagePath, ttlSeconds = MEDIA_SIGNED_URL_TTL_SECONDS) {
  if (!isSafePrivateStoragePath(storagePath)) {
    return '';
  }
  const expiresAt = Math.floor(Date.now() / 1000) + Math.max(60, Number(ttlSeconds || 0));
  const signature = signMediaAccessToken(storagePath, expiresAt);
  const relative = `/auth/media/signed?path=${encodeURIComponent(storagePath)}&exp=${expiresAt}&sig=${signature}`;
  const host = req?.get?.('host') || '';
  return host ? `${req.protocol}://${host}${relative}` : relative;
}

function secureCompareHex(left, right) {
  const a = Buffer.from(String(left || ''), 'hex');
  const b = Buffer.from(String(right || ''), 'hex');
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function readBearerToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }
  return token;
}

function getClientDeviceId(req, payload) {
  const headerDeviceId = req.get('x-device-id');
  if (headerDeviceId && headerDeviceId.trim()) {
    return headerDeviceId.trim().slice(0, 120);
  }
  if (payload?.deviceId && typeof payload.deviceId === 'string' && payload.deviceId.trim()) {
    return payload.deviceId.trim().slice(0, 120);
  }
  return `legacy-${crypto.randomBytes(12).toString('hex')}`;
}

const loginRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 25,
  message: 'Too many login attempts. Please wait and try again.',
  keyGenerator: (req) => {
    const ip = normalizeIpAddress(req.ip || req.socket?.remoteAddress);
    const email =
      req.body && typeof req.body === 'object' && typeof req.body.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : '';
    return `auth:login:${ip}:${email || '-'}`;
  },
});

const registerRateLimiter = createRateLimiter({
  windowMs: 30 * 60 * 1000,
  max: 10,
  message: 'Too many registration attempts. Please wait and try again.',
  keyGenerator: (req) => {
    const ip = normalizeIpAddress(req.ip || req.socket?.remoteAddress);
    return `auth:register:${ip}`;
  },
});

const newsletterSubscribeLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 8,
  message: 'Too many newsletter requests. Please wait and try again.',
  keyGenerator: (req) => {
    const ip = normalizeIpAddress(req.ip || req.socket?.remoteAddress);
    const email =
      req.body && typeof req.body === 'object' && typeof req.body.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : '';
    return `auth:newsletter:${ip}:${email || '-'}`;
  },
});

const forgotPasswordRequestLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 15,
  message: 'Too many password reset requests. Please wait and try again.',
  keyGenerator: (req) => {
    const ip = normalizeIpAddress(req.ip || req.socket?.remoteAddress);
    const target =
      req.body && typeof req.body === 'object' && typeof req.body.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : req.body && typeof req.body === 'object' && typeof req.body.phone === 'string'
          ? req.body.phone.trim()
          : '';
    return `auth:forgot-request:${ip}:${target || '-'}`;
  },
});

const forgotPasswordResetLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 25,
  message: 'Too many password reset attempts. Please wait and try again.',
  keyGenerator: (req) => {
    const ip = normalizeIpAddress(req.ip || req.socket?.remoteAddress);
    const target =
      req.body && typeof req.body === 'object' && typeof req.body.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : req.body && typeof req.body === 'object' && typeof req.body.phone === 'string'
          ? req.body.phone.trim()
          : '';
    return `auth:forgot-reset:${ip}:${target || '-'}`;
  },
});

async function registerOrRotateSession({
  userId,
  deviceId,
  token,
  userAgent,
  ipAddress,
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);

    const existingDeviceRows = await client.query(
      `
        SELECT id
        FROM user_sessions
        WHERE user_id = $1
          AND device_id = $2
          AND revoked_at IS NULL
        LIMIT 1
      `,
      [userId, deviceId]
    );

    if (existingDeviceRows.rowCount === 0) {
      const activeCountRows = await client.query(
        `
          SELECT COUNT(*)::INT AS active_count
          FROM user_sessions
          WHERE user_id = $1
            AND revoked_at IS NULL
        `,
        [userId]
      );

      const activeCount = Number(activeCountRows.rows[0].active_count || 0);
      if (activeCount >= MAX_ACTIVE_DEVICES_PER_ACCOUNT) {
        await client.query('ROLLBACK');
        return { allowed: false };
      }
    }

    await client.query(
      `
        INSERT INTO user_sessions (
          user_id,
          device_id,
          token_hash,
          user_agent,
          ip_address,
          last_seen_at,
          revoked_at,
          revoked_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, NOW(), NULL, NULL)
        ON CONFLICT (user_id, device_id)
        DO UPDATE
          SET token_hash = EXCLUDED.token_hash,
              user_agent = EXCLUDED.user_agent,
              ip_address = EXCLUDED.ip_address,
              last_seen_at = NOW(),
              revoked_at = NULL,
              revoked_by_user_id = NULL
      `,
      [userId, deviceId, hashToken(token), userAgent.slice(0, 255), ipAddress]
    );

    await client.query('COMMIT');
    return { allowed: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function writeAuthActivity({
  actorUserId,
  actorRole,
  actionKey,
  metadata,
  ipAddress = '',
}) {
  try {
    await pool.query(
      `
        INSERT INTO activity_logs (
          actor_user_id,
          actor_role,
          action_key,
          entity_type,
          entity_id,
          ip_address,
          metadata
        )
        VALUES ($1, $2, $3, 'auth', $1, $4, $5::jsonb)
      `,
      [
        actorUserId ?? null,
        actorRole ?? '',
        actionKey,
        String(ipAddress || '').slice(0, 64),
        JSON.stringify(metadata || {}),
      ]
    );
  } catch {
    // Auth flow should not fail because activity logging failed.
  }
}

async function ensureUserProfileRow(userId) {
  await pool.query(
    `
      INSERT INTO user_profiles (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO NOTHING
    `,
    [userId]
  );
}

async function loadUserProfilePayload(userId, req = null) {
  await ensureUserProfileRow(userId);

  const profileRows = await pool.query(
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
        u.created_at,
        p.photo_url,
        p.city,
        p.state,
        p.country,
        p.preferences,
        p.communication,
        p.government_ids,
        p.government_statuses,
        p.two_factor_enabled
      FROM users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.id = $1
      LIMIT 1
    `,
    [userId]
  );

  if (profileRows.rowCount === 0) {
    return null;
  }

  const row = profileRows.rows[0];
  const preferences = sanitizePreferences(row.preferences);
  const communication = sanitizeCommunication(row.communication);
  const government = buildGovernmentSummary(row.government_ids, row.government_statuses);

  const [
    lastLoginRows,
    activeSessionRows,
    sessionRows,
    activityRows,
    submissionRows,
    monthlyRows,
    passwordRows,
    activitySummaryRows,
    buyerEngagementRows,
    sellerEngagementRows,
    monthlyViewRows,
    monthlyClickRows,
    subscriptionRows,
  ] =
    await Promise.all([
      pool.query(
        `
          SELECT MAX(last_seen_at) AS last_login_at
          FROM user_sessions
          WHERE user_id = $1
        `,
        [userId]
      ),
      pool.query(
        `
          SELECT COUNT(*)::INT AS active_count
          FROM user_sessions
          WHERE user_id = $1
            AND revoked_at IS NULL
        `,
        [userId]
      ),
      pool.query(
        `
          SELECT
            id,
            device_id,
            user_agent,
            ip_address,
            created_at,
            last_seen_at
          FROM user_sessions
          WHERE user_id = $1
            AND revoked_at IS NULL
          ORDER BY last_seen_at DESC
          LIMIT 12
        `,
        [userId]
      ),
      pool.query(
        `
          SELECT
            id,
            action_key,
            entity_type,
            request_reference,
            created_at
          FROM activity_logs
          WHERE actor_user_id = $1
          ORDER BY created_at DESC
          LIMIT 20
        `,
        [userId]
      ),
      pool.query(
        `
          SELECT
            COUNT(*)::INT AS total,
            COUNT(*) FILTER (WHERE request_type = 'buy')::INT AS buy_count,
            COUNT(*) FILTER (WHERE request_type = 'sell')::INT AS sell_count,
            COUNT(*) FILTER (WHERE request_type = 'rent')::INT AS rent_count,
            COUNT(*) FILTER (WHERE listing_status = 'Pending')::INT AS pending_count,
            COUNT(*) FILTER (WHERE listing_status = 'Approved')::INT AS approved_count,
            COUNT(*) FILTER (WHERE listing_status = 'Sold')::INT AS sold_count,
            COUNT(*) FILTER (WHERE listing_status = 'Rented')::INT AS rented_count,
            COUNT(*) FILTER (
              WHERE request_type = 'sell'
                AND created_at >= date_trunc('day', NOW())
            )::INT AS sell_today_count
          FROM property_requests
          WHERE submitted_by_user_id = $1
        `,
        [userId]
      ),
      pool.query(
        `
          SELECT
            date_trunc('month', created_at) AS month_start,
            COUNT(*)::INT AS total
          FROM property_requests
          WHERE submitted_by_user_id = $1
            AND created_at >= date_trunc('month', NOW()) - INTERVAL '5 months'
          GROUP BY date_trunc('month', created_at)
          ORDER BY month_start ASC
        `,
        [userId]
      ),
      pool.query(
        `
          SELECT MAX(created_at) AS password_last_changed_at
          FROM activity_logs
          WHERE actor_user_id = $1
            AND action_key = 'account_password_changed'
        `,
        [userId]
      ),
      pool.query(
        `
          SELECT
            COUNT(*)::INT AS total_actions,
            COUNT(*) FILTER (
              WHERE action_key = 'listing_status_changed'
                AND metadata->>'to' = 'Approved'
            )::INT AS properties_approved,
            COUNT(*) FILTER (
              WHERE action_key = 'listing_status_changed'
                AND metadata->>'to' = 'Rejected'
            )::INT AS properties_rejected,
            COUNT(*) FILTER (
              WHERE action_key IN (
                'team_request_updated',
                'listing_featured_toggled',
                'listing_flag_updated',
                'listing_removed',
                'account_profile_updated'
              )
            )::INT AS edits_made,
            COUNT(DISTINCT entity_id) FILTER (
              WHERE entity_type = 'user'
                AND entity_id IS NOT NULL
            )::INT AS users_handled,
            MAX(created_at) AS last_action_at
          FROM activity_logs
          WHERE actor_user_id = $1
        `,
        [userId]
      ),
      pool.query(
        `
          SELECT
            COUNT(*) FILTER (
              WHERE action_key IN ('property_listing_saved', 'property_listing_liked')
            )::INT AS saved_actions,
            COUNT(*) FILTER (
              WHERE action_key IN ('property_listing_unsaved', 'property_listing_unliked')
            )::INT AS unsaved_actions,
            COUNT(*) FILTER (
              WHERE action_key = 'property_listing_viewed'
                AND created_at >= NOW() - INTERVAL '30 days'
            )::INT AS viewed_last_30_days,
            COUNT(*) FILTER (
              WHERE action_key = 'schedule_visit_requested'
            )::INT AS visit_requests
          FROM activity_logs
          WHERE actor_user_id = $1
        `,
        [userId]
      ),
      pool.query(
        `
          WITH seller_properties AS (
            SELECT id, reference_id
            FROM property_requests
            WHERE submitted_by_user_id = $1
              AND request_type IN ('sell', 'rent')
              AND is_removed = FALSE
          )
          SELECT
            (
              SELECT COUNT(*)::INT
              FROM seller_properties
            ) AS total_properties,
            (
              SELECT COUNT(*)::INT
              FROM activity_logs al
              INNER JOIN seller_properties sp
                ON sp.id = al.entity_id
              WHERE al.entity_type = 'property_request'
                AND al.action_key = 'property_listing_viewed'
            ) AS total_views,
            (
              SELECT COUNT(*)::INT
              FROM activity_logs al
              INNER JOIN seller_properties sp
                ON sp.id = al.entity_id
              WHERE al.entity_type = 'property_request'
                AND al.action_key = 'property_listing_clicked'
            ) AS total_clicks,
            (
              SELECT COUNT(*)::INT
              FROM activity_logs al
              INNER JOIN seller_properties sp
                ON sp.id = al.entity_id
              WHERE al.entity_type = 'property_request'
                AND al.action_key IN ('property_listing_saved', 'property_listing_liked')
            ) AS total_saved_actions,
            (
              SELECT COUNT(*)::INT
              FROM activity_logs al
              INNER JOIN seller_properties sp
                ON sp.id = al.entity_id
              WHERE al.entity_type = 'property_request'
                AND al.action_key IN ('property_listing_unsaved', 'property_listing_unliked')
            ) AS total_unsaved_actions,
            (
              SELECT COUNT(*)::INT
              FROM activity_logs al
              INNER JOIN seller_properties sp
                ON sp.id = al.entity_id
              WHERE al.entity_type = 'property_request'
                AND al.action_key = 'property_listing_viewed'
                AND al.created_at >= NOW() - INTERVAL '30 days'
            ) AS views_last_30_days,
            (
              SELECT COUNT(*)::INT
              FROM activity_logs al
              INNER JOIN seller_properties sp
                ON sp.id = al.entity_id
              WHERE al.entity_type = 'property_request'
                AND al.action_key = 'property_listing_clicked'
                AND al.created_at >= NOW() - INTERVAL '30 days'
            ) AS clicks_last_30_days,
            (
              SELECT COUNT(*)::INT
              FROM property_requests pr
              INNER JOIN seller_properties sp
                ON COALESCE(pr.details->>'propertyReference', '') = sp.reference_id
              WHERE pr.request_type = 'buy'
                AND pr.source = 'detail_schedule'
                AND pr.is_removed = FALSE
            ) AS visit_requests,
            (
              SELECT COUNT(*)::INT
              FROM chat_conversations cc
              INNER JOIN seller_properties sp
                ON cc.property_request_id = sp.id
              WHERE cc.conversation_type = 'property_owner'
            ) AS chat_inquiries
        `,
        [userId]
      ),
      pool.query(
        `
          WITH seller_properties AS (
            SELECT id
            FROM property_requests
            WHERE submitted_by_user_id = $1
              AND request_type IN ('sell', 'rent')
              AND is_removed = FALSE
          )
          SELECT
            date_trunc('month', al.created_at) AS month_start,
            COUNT(*)::INT AS total
          FROM activity_logs al
          INNER JOIN seller_properties sp
            ON sp.id = al.entity_id
          WHERE al.entity_type = 'property_request'
            AND al.action_key = 'property_listing_viewed'
            AND al.created_at >= date_trunc('month', NOW()) - INTERVAL '5 months'
          GROUP BY date_trunc('month', al.created_at)
          ORDER BY month_start ASC
        `,
        [userId]
      ),
      pool.query(
        `
          WITH seller_properties AS (
            SELECT id
            FROM property_requests
            WHERE submitted_by_user_id = $1
              AND request_type IN ('sell', 'rent')
              AND is_removed = FALSE
          )
          SELECT
            date_trunc('month', al.created_at) AS month_start,
            COUNT(*)::INT AS total
          FROM activity_logs al
          INNER JOIN seller_properties sp
            ON sp.id = al.entity_id
          WHERE al.entity_type = 'property_request'
            AND al.action_key = 'property_listing_clicked'
            AND al.created_at >= date_trunc('month', NOW()) - INTERVAL '5 months'
          GROUP BY date_trunc('month', al.created_at)
          ORDER BY month_start ASC
        `,
        [userId]
      ),
      pool.query(
        `
          SELECT
            s.id,
            s.plan_id,
            s.subscription_tier,
            s.end_date,
            s.features_json,
            s.listing_quota,
            s.boost_credits,
            sp.plan_name
          FROM subscriptions s
          LEFT JOIN subscription_plans sp
            ON sp.plan_id = s.plan_id
          WHERE s.user_id = $1
            AND s.is_active = TRUE
            AND (s.end_date IS NULL OR s.end_date >= CURRENT_DATE)
          ORDER BY s.updated_at DESC, s.created_at DESC
          LIMIT 1
        `,
        [userId]
      ),
    ]);

  const submittedStats = submissionRows.rows[0] || {};
  const totalSubmissions = Number(submittedStats.total || 0);
  const approvedSubmissions =
    Number(submittedStats.approved_count || 0) +
    Number(submittedStats.sold_count || 0) +
    Number(submittedStats.rented_count || 0);

  const conversionRate =
    totalSubmissions > 0 ? Number(((approvedSubmissions / totalSubmissions) * 100).toFixed(1)) : 0;

  const monthlyListingStats = buildRecentSixMonthSeries(monthlyRows.rows);
  const monthlyViewsStats = buildRecentSixMonthSeries(monthlyViewRows.rows);
  const monthlyClicksStats = buildRecentSixMonthSeries(monthlyClickRows.rows);

  const activitySummary = activitySummaryRows.rows[0] || {};
  const buyerEngagement = buyerEngagementRows.rows[0] || {};
  const sellerEngagement = sellerEngagementRows.rows[0] || {};
  const subscription = subscriptionRows.rows[0] || null;

  const buyerSavedProperties = Math.max(
    0,
    Number(buyerEngagement.saved_actions || 0) - Number(buyerEngagement.unsaved_actions || 0)
  );
  const buyerRecentlyViewed = Number(buyerEngagement.viewed_last_30_days || 0);
  const buyerVisitRequests = Number(buyerEngagement.visit_requests || 0);

  const sellerTotalViews = Number(sellerEngagement.total_views || 0);
  const sellerTotalClicks = Number(sellerEngagement.total_clicks || 0);
  const sellerTotalSavedLiked = Math.max(
    0,
    Number(sellerEngagement.total_saved_actions || 0) -
      Number(sellerEngagement.total_unsaved_actions || 0)
  );
  const sellerVisitRequests = Number(sellerEngagement.visit_requests || 0);
  const sellerChatInquiries = Number(sellerEngagement.chat_inquiries || 0);
  const sellerTotalInquiries = sellerVisitRequests + sellerChatInquiries;
  const sellerViewsLast30Days = Number(sellerEngagement.views_last_30_days || 0);
  const sellerClicksLast30Days = Number(sellerEngagement.clicks_last_30_days || 0);

  const clickThroughRate =
    sellerTotalViews > 0 ? Number(((sellerTotalClicks / sellerTotalViews) * 100).toFixed(1)) : 0;
  const saveRate =
    sellerTotalClicks > 0 ? Number(((sellerTotalSavedLiked / sellerTotalClicks) * 100).toFixed(1)) : 0;

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || '',
    role: row.role,
    platformRole: row.role,
    accountType: row.account_type || 'individual',
    subscriptionTier: row.subscription_tier || 'free',
    isMainAdmin: Boolean(row.is_main_admin),
    isActive: Boolean(row.is_active),
    deactivatedUntil: row.deactivated_until || null,
    memberSince: row.created_at,
    lastLoginAt: lastLoginRows.rows[0]?.last_login_at || null,
    basicInfo: {
      profilePhotoUrl: resolveProfilePhotoUrl(row.photo_url, req),
      city: row.city || '',
      state: row.state || '',
      country: row.country || 'India',
      emailVerified: true,
      phoneVerified: Boolean(row.phone),
    },
    optionalGovernmentVerification: {
      trustScore: government.trustScore,
      verifiedUserBadge: government.verifiedBadge,
      documents: government.ids,
    },
    security: {
      twoFactorEnabled: Boolean(row.two_factor_enabled),
      passwordLastChangedAt: passwordRows.rows[0]?.password_last_changed_at || null,
      activeDevices: Number(activeSessionRows.rows[0]?.active_count || 0),
      sessions: sessionRows.rows.map((session) => ({
        id: session.id,
        deviceId: session.device_id,
        userAgent: session.user_agent || '',
        ipAddress: session.ip_address || '',
        createdAt: session.created_at,
        lastSeenAt: session.last_seen_at,
      })),
      loginActivity: activityRows.rows.map((entry) => ({
        id: entry.id,
        actionKey: entry.action_key,
        entityType: entry.entity_type,
        requestReference: entry.request_reference,
        createdAt: entry.created_at,
      })),
    },
    activitySummary: {
      totalActions: Number(activitySummary.total_actions || 0),
      propertiesApproved: Number(activitySummary.properties_approved || 0),
      propertiesRejected: Number(activitySummary.properties_rejected || 0),
      editsMade: Number(activitySummary.edits_made || 0),
      usersHandled: Number(activitySummary.users_handled || 0),
      lastActionAt: activitySummary.last_action_at || null,
    },
    myActivity: {
      buyer: {
        savedProperties: buyerSavedProperties,
        recentlyViewed: buyerRecentlyViewed,
        inquiryHistory: Number(submittedStats.buy_count || 0),
        propertyVisitRequests: buyerVisitRequests,
        purchaseRequestsStatus: Number(submittedStats.buy_count || 0),
      },
      seller: {
        totalPropertiesAdded:
          Number(submittedStats.sell_count || 0) + Number(submittedStats.rent_count || 0),
        pendingApproval: Number(submittedStats.pending_count || 0),
        approvedListings: Number(submittedStats.approved_count || 0),
        soldProperties:
          Number(submittedStats.sold_count || 0) + Number(submittedStats.rented_count || 0),
        totalViews: sellerTotalViews,
        totalClicks: sellerTotalClicks,
        totalSavedLiked: sellerTotalSavedLiked,
        totalInquiries: sellerTotalInquiries,
        totalChatInquiries: sellerChatInquiries,
        totalVisitRequests: sellerVisitRequests,
      },
      teamMember: {
        propertiesAddedToday: Number(submittedStats.sell_today_count || 0),
        totalAssistedListings: 0,
        approvalRequestsSent: Number(submittedStats.pending_count || 0),
      },
    },
    analyticsAndPerformance: {
      monthlyListingStats,
      monthlyViewsStats,
      monthlyClicksStats,
      inquiryConversionRate: conversionRate,
      clickThroughRate,
      saveRate,
      earningsOrCommissionOverview: row.role === 'team_member' ? 'Performance-based' : 'Not applicable',
      viewsGraphLabel: 'Based on property detail traffic from recent listing activity',
      summaryLabel: `Last 30 days: ${sellerViewsLast30Days} views, ${sellerClicksLast30Days} clicks`,
    },
    preferences,
    communicationCenter: communication,
    subscriptionAndPremium: {
      currentPlan: subscription?.plan_name || row.subscription_tier || 'free',
      planId: subscription?.plan_id || null,
      planTier: subscription?.subscription_tier || row.subscription_tier || 'free',
      planExpiryDate: subscription?.end_date || null,
      boostCredits: Number(subscription?.boost_credits || 0),
      listingQuota: Number(subscription?.listing_quota || 0),
      features: toObject(subscription?.features_json),
      boostListingEnabled: Number(subscription?.boost_credits || 0) > 0,
    },
  };
}

async function findUserForOtpChannel(payload) {
  if (payload.channel === 'email') {
    const email = payload.email.toLowerCase();
    const userRows = await pool.query(
      'SELECT id, email, phone FROM users WHERE email = $1 LIMIT 1',
      [email]
    );
    return {
      user: userRows.rowCount > 0 ? userRows.rows[0] : null,
      normalizedEmail: email,
    };
  }

  const normalizedPhone = normalizePhone(payload.phone);
  if (!normalizedPhone) {
    return {
      user: null,
      normalizedPhone: null,
      duplicatePhone: false,
    };
  }

  const phoneDigits = phoneToDigits(normalizedPhone);
  const userRows = await pool.query(
    `
      SELECT id, email, phone
      FROM users
      WHERE regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = $1
      LIMIT 2
    `,
    [phoneDigits]
  );

  return {
    user: userRows.rowCount > 0 ? userRows.rows[0] : null,
    normalizedPhone,
    duplicatePhone: userRows.rowCount > 1,
  };
}

router.post('/newsletter/subscribe', newsletterSubscribeLimiter, async (req, res, next) => {
  try {
    const payload = newsletterSubscribeSchema.parse(req.body || {});
    const email = payload.email.trim().toLowerCase();
    const supportEmail = process.env.MAIN_ADMIN_EMAIL?.trim() || process.env.SMTP_USER?.trim() || '';

    const textLines = [
      `Hi,`,
      ``,
      `Thank you for selecting ZDT Realty.`,
      `We are grateful to have you with us.`,
      `Your email (${email}) has been successfully added to our newsletter.`,
      ``,
      supportEmail ? `Need help? Reply to this email or contact ${supportEmail}.` : `Need help? Reply to this email.`,
      ``,
      `- ${APP_NAME} Team`,
    ];

    const html = `
      <p>Hi,</p>
      <p>Thank you for selecting <strong>ZDT Realty</strong>.</p>
      <p>We are grateful to have you with us.</p>
      <p>Your email (<strong>${email}</strong>) has been successfully added to our newsletter.</p>
      <p>${supportEmail ? `Need help? Reply to this email or contact <strong>${supportEmail}</strong>.` : 'Need help? Reply to this email.'}</p>
      <p>- ${APP_NAME} Team</p>
    `;

    let delivered = false;
    try {
      delivered = await sendEmailMessage({
        to: email,
        subject: `Thank you for selecting ${APP_NAME}`,
        text: textLines.join('\n'),
        html,
        deliveryLabel: 'Newsletter email',
      });
    } catch (deliveryError) {
      return res.status(503).json({
        error:
          deliveryError instanceof Error
            ? deliveryError.message
            : 'Unable to send subscription email right now. Please try again.',
      });
    }

    if (!delivered) {
      return res.status(503).json({
        error: 'Email service is not configured yet. Please set SMTP settings on the server.',
      });
    }

    return res.status(201).json({
      message: `Subscription confirmed. A confirmation email was sent to ${email}.`,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/register', registerRateLimiter, async (req, res, next) => {
  try {
    const payload = registerSchema.parse(req.body);
    const email = payload.email.toLowerCase();
    const deviceId = getClientDeviceId(req, payload);
    const normalizedPhone = payload.phone ? normalizePhone(payload.phone) : null;

    if (payload.phone && !normalizedPhone) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    const existingRows = await pool.query(
      'SELECT id FROM users WHERE email = $1 LIMIT 1',
      [email]
    );

    if (existingRows.rowCount > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(payload.password, 12);

    const result = await pool.query(
      `
        INSERT INTO users (name, email, password_hash, phone, role)
        VALUES ($1, $2, $3, $4, 'user')
        RETURNING id, role, account_type, subscription_tier, is_main_admin
      `,
      [payload.name.trim(), email, passwordHash, normalizedPhone]
    );

    const user = {
      id: result.rows[0].id,
      name: payload.name.trim(),
      email,
      role: result.rows[0].role,
      platformRole: result.rows[0].role,
      accountType: result.rows[0].account_type || 'individual',
      subscriptionTier: result.rows[0].subscription_tier || 'free',
      isMainAdmin: result.rows[0].is_main_admin,
    };

    const token = signToken(user);
    await registerOrRotateSession({
      userId: user.id,
      deviceId,
      token,
      userAgent: req.get('user-agent') || '',
      ipAddress: normalizeIpAddress(req.headers['x-forwarded-for'] || req.socket?.remoteAddress),
    });
    await writeAuthActivity({
      actorUserId: user.id,
      actorRole: user.role,
      actionKey: 'account_registered',
      metadata: {
        email: user.email,
      },
      ipAddress: normalizeIpAddress(req.ip || req.socket?.remoteAddress),
    });

    return res.status(201).json({ token, user });
  } catch (error) {
    return next(error);
  }
});

router.post('/login', loginRateLimiter, async (req, res, next) => {
  try {
    const payload = loginSchema.parse(req.body);
    const email = payload.email.toLowerCase();
    const deviceId = getClientDeviceId(req, payload);

    const rows = await pool.query(
      `
        SELECT
          id,
          name,
          email,
          role,
          account_type,
          subscription_tier,
          is_main_admin,
          is_active,
          deactivated_until,
          password_hash
        FROM users
        WHERE email = $1
        LIMIT 1
      `,
      [email]
    );

    if (rows.rowCount === 0) {
      return res.status(401).json({ error: 'Email not registered. Please register first.' });
    }

    const userRow = rows.rows[0];

    const now = Date.now();
    const deactivatedUntil = userRow.deactivated_until
      ? new Date(userRow.deactivated_until).getTime()
      : null;

    // Block access during temporary deactivation window.
    if (deactivatedUntil && deactivatedUntil > now) {
      return res.status(403).json({
        error: `Your account is temporarily deactivated until ${new Date(deactivatedUntil).toLocaleString('en-IN')}.`,
      });
    }

    // If a temporary deactivation has expired, try to automatically reactivate the account.
    if (!userRow.is_active) {
      if (deactivatedUntil && deactivatedUntil <= now) {
        try {
          await pool.query(
            `
              UPDATE users
              SET is_active = TRUE,
                  deactivated_until = NULL
              WHERE id = $1
            `,
            [userRow.id]
          );
          userRow.is_active = true;
          userRow.deactivated_until = null;
        } catch (reactivateError) {
          const code = reactivateError && typeof reactivateError === 'object' ? reactivateError.code : null;
          if (code === 'P0001') {
            return res.status(403).json({
              error:
                'Your account deactivation expired, but seats are currently full. Please contact the Main Admin.',
            });
          }
          return next(reactivateError);
        }
      } else {
        return res.status(403).json({ error: 'Your account is deactivated' });
      }
    }

    const ok = await bcrypt.compare(payload.password, userRow.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (payload.role && userRow.role !== payload.role) {
      return res.status(403).json({
        error: `This login is only for ${payload.role.replace('_', ' ')} accounts.`,
      });
    }

    const requiresCareerCredentials =
      (userRow.role === 'admin' && !userRow.is_main_admin) || userRow.role === 'team_member';
    if (requiresCareerCredentials) {
      const referenceId = payload.referenceId?.trim();
      const registrationNumber = payload.registrationNumber?.trim().toUpperCase();
      const roleLabel = userRow.role === 'team_member' ? 'Team member' : 'Admin';
      const expectedPosition = userRow.role === 'team_member' ? 'team_member' : 'admin';

      if (!referenceId || !registrationNumber) {
        return res.status(400).json({
          error: `${roleLabel} login requires reference ID and registration number.`,
        });
      }

      const proofRows = await pool.query(
        `
          SELECT id
          FROM career_applications
          WHERE created_account_user_id = $1
            AND position = $2
            AND status = 'Approved'
            AND reference_id = $3
            AND UPPER(registration_number) = $4
          LIMIT 1
        `,
        [userRow.id, expectedPosition, referenceId, registrationNumber]
      );

      if (proofRows.rowCount === 0) {
        return res.status(401).json({
          error: `Invalid reference ID or registration number for this ${roleLabel.toLowerCase()} account.`,
        });
      }
    }

    const user = {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      role: userRow.role,
      platformRole: userRow.role,
      accountType: userRow.account_type || 'individual',
      subscriptionTier: userRow.subscription_tier || 'free',
      isMainAdmin: userRow.is_main_admin,
    };

    const token = signToken(user);
    const sessionResult = await registerOrRotateSession({
      userId: user.id,
      deviceId,
      token,
      userAgent: req.get('user-agent') || '',
      ipAddress: normalizeIpAddress(req.headers['x-forwarded-for'] || req.socket?.remoteAddress),
    });

    if (!sessionResult.allowed) {
      return res.status(403).json({
        error:
          'Device login limit reached (maximum 2 devices). Log out from an old device and try again.',
      });
    }
    await writeAuthActivity({
      actorUserId: user.id,
      actorRole: user.role,
      actionKey: 'account_logged_in',
      metadata: {
        deviceId,
      },
      ipAddress: normalizeIpAddress(req.ip || req.socket?.remoteAddress),
    });

    return res.json({ token, user });
  } catch (error) {
    return next(error);
  }
});

router.post('/forgot-password/request', forgotPasswordRequestLimiter, async (req, res, next) => {
  try {
    const payload = forgotPasswordRequestSchema.parse(req.body);
    const lookup = await findUserForOtpChannel(payload);

    if (payload.channel === 'sms' && lookup.duplicatePhone) {
      return res.status(409).json({
        error: 'Phone number is linked to multiple accounts. Please contact support.',
      });
    }

    if (!lookup.user) {
      return res.status(404).json({
        error:
          payload.channel === 'email'
            ? 'Email not registered. Please register first.'
            : 'Phone number not registered. Please register first.',
      });
    }

    const userId = lookup.user.id;
    const existingOtpRows = await pool.query(
      'SELECT created_at FROM password_reset_otps WHERE user_id = $1 LIMIT 1',
      [userId]
    );

    if (existingOtpRows.rowCount > 0) {
      const createdAt = new Date(existingOtpRows.rows[0].created_at);
      const elapsedMs = Date.now() - createdAt.getTime();
      const cooldownMs = OTP_RESEND_COOLDOWN_SECONDS * 1000;

      if (!Number.isNaN(createdAt.getTime()) && elapsedMs < cooldownMs) {
        const retryAfterSeconds = Math.max(1, Math.ceil((cooldownMs - elapsedMs) / 1000));
        return res.status(429).json({
          error: `Please wait ${retryAfterSeconds} seconds before requesting a new OTP.`,
        });
      }
    }

    const otp = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

    await pool.query(
      `
        INSERT INTO password_reset_otps (user_id, otp_hash, expires_at, attempts, created_at)
        VALUES ($1, $2, NOW() + ($3::text || ' minutes')::interval, 0, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
          otp_hash = EXCLUDED.otp_hash,
          expires_at = EXCLUDED.expires_at,
          attempts = 0,
          created_at = NOW()
      `,
      [userId, otpHash, OTP_EXPIRES_MINUTES]
    );

    let delivered = false;
    try {
      delivered = await sendOtp({
        channel: payload.channel,
        email: payload.channel === 'email' ? lookup.user.email : undefined,
        phone: payload.channel === 'sms' ? lookup.normalizedPhone : undefined,
        otp,
        expiresInMinutes: OTP_EXPIRES_MINUTES,
      });
    } catch (deliveryError) {
      await pool.query('DELETE FROM password_reset_otps WHERE user_id = $1', [userId]);
      return res.status(503).json({
        error:
          deliveryError instanceof Error
            ? deliveryError.message
            : 'OTP delivery failed. Please try again.',
      });
    }

    const viaLabel = payload.channel === 'email' ? 'email' : 'SMS';
    const responsePayload = {
      channel: payload.channel,
      message: delivered
        ? `ZDT Realty OTP sent via ${viaLabel}. It will expire in ${OTP_EXPIRES_MINUTES} minutes.`
        : `${viaLabel} delivery is not configured in this environment. Use the dev OTP for testing.`,
    };

    if (process.env.NODE_ENV !== 'production') {
      responsePayload.devOtp = otp;
    }

    return res.json(responsePayload);
  } catch (error) {
    return next(error);
  }
});

router.post('/forgot-password/reset', forgotPasswordResetLimiter, async (req, res, next) => {
  try {
    const payload = forgotPasswordResetSchema.parse(req.body);
    const lookup = await findUserForOtpChannel(payload);

    if (payload.channel === 'sms' && lookup.duplicatePhone) {
      return res.status(409).json({
        error: 'Phone number is linked to multiple accounts. Please contact support.',
      });
    }

    if (!lookup.user) {
      return res.status(404).json({
        error:
          payload.channel === 'email'
            ? 'Email not registered. Please register first.'
            : 'Phone number not registered. Please register first.',
      });
    }

    const userId = lookup.user.id;

    const otpRows = await pool.query(
      'SELECT otp_hash, expires_at, attempts FROM password_reset_otps WHERE user_id = $1 LIMIT 1',
      [userId]
    );

    if (otpRows.rowCount === 0) {
      return res.status(400).json({ error: 'OTP not requested. Request a new OTP first.' });
    }

    const otpRow = otpRows.rows[0];

    if (Number(otpRow.attempts) >= MAX_OTP_ATTEMPTS) {
      await pool.query('DELETE FROM password_reset_otps WHERE user_id = $1', [userId]);
      return res.status(429).json({ error: 'Too many invalid OTP attempts. Request a new OTP.' });
    }

    const expiresAt = new Date(otpRow.expires_at);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
      await pool.query('DELETE FROM password_reset_otps WHERE user_id = $1', [userId]);
      return res.status(400).json({ error: 'OTP expired. Request a new OTP.' });
    }

    const providedOtpHash = crypto.createHash('sha256').update(payload.otp).digest('hex');
    const providedBuffer = Buffer.from(providedOtpHash, 'hex');
    const storedBuffer = Buffer.from(otpRow.otp_hash, 'hex');
    const otpValid =
      providedBuffer.length === storedBuffer.length &&
      crypto.timingSafeEqual(providedBuffer, storedBuffer);

    if (!otpValid) {
      await pool.query(
        'UPDATE password_reset_otps SET attempts = attempts + 1 WHERE user_id = $1',
        [userId]
      );
      return res.status(400).json({ error: 'Invalid OTP.' });
    }

    const passwordHash = await bcrypt.hash(payload.newPassword, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
    await pool.query('DELETE FROM password_reset_otps WHERE user_id = $1', [userId]);

    return res.json({ message: 'Password reset successful. Please log in.' });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    const token = readBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const revokeResult = await pool.query(
      `
        UPDATE user_sessions
        SET revoked_at = NOW(),
            revoked_by_user_id = $1
        WHERE user_id = $1
          AND token_hash = $2
          AND revoked_at IS NULL
      `,
      [req.user.id, hashToken(token)]
    );
    await writeAuthActivity({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      actionKey: 'account_logged_out',
      metadata: {
        revokedSessions: revokeResult.rowCount,
      },
      ipAddress: normalizeIpAddress(req.ip || req.socket?.remoteAddress),
    });

    return res.json({ message: 'Logged out successfully' });
  } catch (error) {
    return next(error);
  }
});

router.get('/sessions', requireAuth, async (req, res, next) => {
  try {
    const token = readBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }
    const currentHash = hashToken(token);

    const sessionRows = await pool.query(
      `
        SELECT
          id,
          device_id,
          user_agent,
          ip_address,
          last_seen_at,
          created_at,
          token_hash
        FROM user_sessions
        WHERE user_id = $1
          AND revoked_at IS NULL
        ORDER BY last_seen_at DESC
      `,
      [req.user.id]
    );

    return res.json({
      sessions: sessionRows.rows.map((row) => ({
        id: row.id,
        deviceId: row.device_id,
        userAgent: row.user_agent || '',
        ipAddress: row.ip_address || '',
        lastSeenAt: row.last_seen_at,
        createdAt: row.created_at,
        isCurrent: row.token_hash === currentHash,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout-all', requireAuth, async (req, res, next) => {
  try {
    const payload = logoutAllSchema.parse(req.body || {});
    const token = readBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }
    const currentHash = hashToken(token);

    const revokeResult = await pool.query(
      `
        UPDATE user_sessions
        SET revoked_at = NOW(),
            revoked_by_user_id = $1
        WHERE user_id = $1
          AND revoked_at IS NULL
          AND ($2::boolean = FALSE OR token_hash <> $3)
      `,
      [req.user.id, payload.keepCurrent, currentHash]
    );

    await writeAuthActivity({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      actionKey: 'account_logout_all_devices',
      metadata: {
        keepCurrent: payload.keepCurrent,
        revokedSessions: revokeResult.rowCount,
      },
      ipAddress: normalizeIpAddress(req.ip || req.socket?.remoteAddress),
    });

    return res.json({
      message: 'Session revoke completed',
      revokedCount: revokeResult.rowCount,
      keepCurrent: payload.keepCurrent,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const payload = changePasswordSchema.parse(req.body);
    if (payload.currentPassword === payload.newPassword) {
      return res.status(400).json({ error: 'New password must be different from current password' });
    }

    const userRows = await pool.query(
      `
        SELECT id, password_hash
        FROM users
        WHERE id = $1
          AND is_active = TRUE
        LIMIT 1
      `,
      [req.user.id]
    );

    if (userRows.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userRow = userRows.rows[0];
    const passwordMatches = await bcrypt.compare(payload.currentPassword, userRow.password_hash);
    if (!passwordMatches) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const nextHash = await bcrypt.hash(payload.newPassword, 12);
    await pool.query(
      `
        UPDATE users
        SET password_hash = $1,
            force_password_reset = FALSE
        WHERE id = $2
      `,
      [nextHash, req.user.id]
    );

    await writeAuthActivity({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      actionKey: 'account_password_changed',
      metadata: {},
      ipAddress: normalizeIpAddress(req.ip || req.socket?.remoteAddress),
    });

    return res.json({ message: 'Password changed successfully' });
  } catch (error) {
    return next(error);
  }
});

router.get('/activity', requireAuth, async (req, res, next) => {
  try {
    const query = activityQuerySchema.parse({
      limit: req.query.limit ?? 40,
    });

    const activityRows = await pool.query(
      `
        SELECT
          id,
          action_key,
          entity_type,
          request_reference,
          created_at,
          metadata
        FROM activity_logs
        WHERE actor_user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [req.user.id, query.limit]
    );

    return res.json({
      entries: activityRows.rows.map((row) => ({
        id: row.id,
        actionKey: row.action_key,
        entityType: row.entity_type,
        requestReference: row.request_reference,
        createdAt: row.created_at,
        metadata: row.metadata || {},
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/deactivate', requireAuth, async (req, res, next) => {
  try {
    const payload = deactivateAccountSchema.parse(req.body);
    if (payload.confirmation.toUpperCase() !== 'DEACTIVATE') {
      return res.status(400).json({ error: "Type 'DEACTIVATE' in confirmation field" });
    }

    await pool.query(
      `
        UPDATE users
        SET is_active = FALSE
        WHERE id = $1
      `,
      [req.user.id]
    );

    const revokeResult = await pool.query(
      `
        UPDATE user_sessions
        SET revoked_at = NOW(),
            revoked_by_user_id = $1
        WHERE user_id = $1
          AND revoked_at IS NULL
      `,
      [req.user.id]
    );

    await writeAuthActivity({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      actionKey: 'account_deactivated',
      metadata: {
        revokedSessions: revokeResult.rowCount,
      },
      ipAddress: normalizeIpAddress(req.ip || req.socket?.remoteAddress),
    });

    return res.json({
      message: 'Account deactivated',
      revokedCount: revokeResult.rowCount,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/profile', requireAuth, async (req, res, next) => {
  try {
    const profile = await loadUserProfilePayload(req.user.id, req);
    if (!profile) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ profile });
  } catch (error) {
    return next(error);
  }
});

const mainAdminProfileMediaUploadSchema = z.object({
  category: z.enum(['new_project', 'construction_done']),
  title: z.string().trim().max(160).optional().or(z.literal('')),
  description: z.string().trim().max(1200).optional().or(z.literal('')),
  dataUrl: z.string().trim().min(20).max(40_000_000),
});

const publicImageUploadBodySchema = z.object({
  purpose: z.enum(PUBLIC_IMAGE_UPLOAD_PURPOSES),
  dataUrl: z.string().trim().min(20).max(12_000_000).optional(),
});

const publicImageUploadMulter = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: PUBLIC_IMAGE_UPLOAD_LIMIT_BYTES,
  },
  fileFilter: (req, file, cb) => {
    const purpose = typeof req.body?.purpose === 'string' ? req.body.purpose : '';
    const allowedTypes =
      purpose === 'owner_kyc' ? PUBLIC_OWNER_KYC_UPLOAD_MIME_TYPES : PUBLIC_IMAGE_UPLOAD_MIME_TYPES;
    if (allowedTypes.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('Invalid image type. Upload PNG/JPEG/WebP.'));
  },
});

const signedMediaQuerySchema = z.object({
  path: z.string().trim().min(6).max(500),
  exp: z.coerce.number().int().positive(),
  sig: z.string().trim().min(20).max(256),
});

router.get('/media/signed', async (req, res, next) => {
  try {
    const query = signedMediaQuerySchema.parse(req.query || {});
    const now = Math.floor(Date.now() / 1000);
    if (query.exp < now) {
      return res.status(410).json({ error: 'Media link expired' });
    }

    if (!isSafePrivateStoragePath(query.path)) {
      return res.status(400).json({ error: 'Invalid media path' });
    }

    const expectedSignature = signMediaAccessToken(query.path, query.exp);
    if (!secureCompareHex(expectedSignature, query.sig)) {
      return res.status(403).json({ error: 'Invalid media signature' });
    }

    const fullPath = resolvePrivateStorageAbsolutePath(query.path);
    if (!fullPath || !fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Media file not found' });
    }

    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.sendFile(fullPath);
  } catch (error) {
    return next(error);
  }
});

router.post('/media/upload-image', requireAuth, (req, res, next) => {
  publicImageUploadMulter.single('file')(req, res, async (uploadError) => {
    try {
      if (uploadError) {
        if (uploadError instanceof multer.MulterError && uploadError.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            error: `Image is too large. Please upload an image under ${Math.floor(
              PUBLIC_IMAGE_UPLOAD_LIMIT_BYTES / 1024
            )} KB.`,
          });
        }
        return res.status(400).json({
          error: uploadError.message || 'Invalid image upload request.',
        });
      }

      const payload = publicImageUploadBodySchema.parse(req.body || {});
      const folder = PUBLIC_IMAGE_UPLOAD_FOLDERS[payload.purpose];
      if (!folder) {
        return res.status(400).json({ error: 'Invalid upload purpose' });
      }

      let mimeType = '';
      let ext = '';
      let buffer = Buffer.alloc(0);

      if (req.file && req.file.buffer && req.file.buffer.length > 0) {
        mimeType = req.file.mimetype;
        const allowedTypes =
          payload.purpose === 'owner_kyc' ? PUBLIC_OWNER_KYC_UPLOAD_MIME_TYPES : PUBLIC_IMAGE_UPLOAD_MIME_TYPES;
        if (!allowedTypes.has(mimeType)) {
          return res.status(400).json({ error: 'Invalid file type. Upload PNG/JPEG/WebP/PDF.' });
        }
        ext =
          mimeType === 'image/png'
            ? 'png'
            : mimeType === 'image/jpeg'
              ? 'jpg'
              : mimeType === 'image/webp'
                ? 'webp'
                : 'pdf';
        buffer = req.file.buffer;
      } else if (payload.dataUrl) {
        const decoded = decodeImageDataUrl(payload.dataUrl);
        if (!decoded) {
          return res.status(400).json({ error: 'Invalid image. Please upload PNG/JPEG/WebP.' });
        }
        mimeType = decoded.mimeType;
        ext = decoded.ext;
        buffer = decoded.buffer;
      } else {
        return res.status(400).json({ error: 'Image file is required.' });
      }

      if (buffer.length > PUBLIC_IMAGE_UPLOAD_LIMIT_BYTES) {
        return res.status(400).json({
          error: `Image is too large. Please upload an image under ${Math.floor(
            PUBLIC_IMAGE_UPLOAD_LIMIT_BYTES / 1024
          )} KB.`,
        });
      }

      const uploadDir = ensurePublicUploadDir(folder);
      const filename = `${payload.purpose}-${req.user.id}-${Date.now()}-${crypto
        .randomBytes(4)
        .toString('hex')}.${ext}`;
      fs.writeFileSync(path.join(uploadDir, filename), buffer);

      const relativePath = `/uploads/${folder}/${filename}`;
      const host = req.get('host') || '';
      const imageUrl = host ? `${req.protocol}://${host}${relativePath}` : relativePath;

      await writeAuthActivity({
        actorUserId: req.user.id,
        actorRole: req.user.role,
        actionKey: 'public_image_uploaded',
        metadata: {
          purpose: payload.purpose,
          mimeType,
          bytes: buffer.length,
        },
        ipAddress: normalizeIpAddress(req.ip || req.socket?.remoteAddress),
      });

      return res.status(201).json({
        message: 'Image uploaded successfully',
        imageUrl,
        purpose: payload.purpose,
      });
    } catch (error) {
      return next(error);
    }
  });
});

router.get(
  '/profile/main-admin-media',
  requireAuth,
  requireMainAdmin,
  requirePermission('manage_media'),
  async (req, res, next) => {
  try {
    const rows = await pool.query(
      `
        SELECT
          id,
          category,
          media_type,
          mime_type,
          media_url,
          storage_path,
          storage_visibility,
          title,
          description,
          created_at,
          updated_at
        FROM main_admin_profile_media
        WHERE user_id = $1
        ORDER BY created_at DESC
      `,
      [req.user.id]
    );

    return res.json({
      items: rows.rows.map((row) => mapMainAdminProfileMediaRow(row, req)),
    });
  } catch (error) {
    return next(error);
  }
  }
);

router.post(
  '/profile/main-admin-media',
  requireAuth,
  requireMainAdmin,
  requirePermission('manage_media'),
  async (req, res, next) => {
  try {
    const payload = mainAdminProfileMediaUploadSchema.parse(req.body || {});
    const decoded = decodeProfileMediaDataUrl(payload.dataUrl);

    if (!decoded) {
      return res.status(400).json({
        error: 'Invalid media format. Upload PNG/JPEG/WebP or MP4/WebM/OGG.',
      });
    }

    const isImage = decoded.mediaType === 'image';
    const maxSizeBytes = isImage
      ? MAIN_ADMIN_MEDIA_IMAGE_LIMIT_BYTES
      : MAIN_ADMIN_MEDIA_VIDEO_LIMIT_BYTES;
    if (decoded.buffer.length > maxSizeBytes) {
      const maxMb = (maxSizeBytes / (1024 * 1024)).toFixed(0);
      return res.status(400).json({
        error: `${isImage ? 'Image' : 'Video'} is too large. Maximum size is ${maxMb} MB.`,
      });
    }

    const uploadDir = ensurePrivateStorageDir('main-admin-media');
    const filename = `main-admin-${req.user.id}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${
      decoded.ext
    }`;
    fs.writeFileSync(path.join(uploadDir, filename), decoded.buffer);
    const storagePath = `main-admin-media/${filename}`;

    const inserted = await pool.query(
      `
        INSERT INTO main_admin_profile_media (
          user_id,
          category,
          media_type,
          mime_type,
          media_url,
          storage_path,
          storage_visibility,
          file_size_bytes,
          title,
          description
        )
        VALUES ($1, $2, $3, $4, '', $5, 'private', $6, $7, $8)
        RETURNING
          id,
          category,
          media_type,
          mime_type,
          media_url,
          storage_path,
          storage_visibility,
          file_size_bytes,
          title,
          description,
          created_at,
          updated_at
      `,
      [
        req.user.id,
        payload.category,
        decoded.mediaType,
        decoded.mimeType,
        storagePath,
        decoded.buffer.length,
        payload.title?.trim() || '',
        payload.description?.trim() || '',
      ]
    );

    await writeAuthActivity({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      actionKey: 'main_admin_profile_media_added',
      metadata: {
        category: payload.category,
        mediaType: decoded.mediaType,
      },
      ipAddress: normalizeIpAddress(req.ip || req.socket?.remoteAddress),
    });

    return res.status(201).json({
      item: mapMainAdminProfileMediaRow(inserted.rows[0], req),
    });
  } catch (error) {
    return next(error);
  }
  }
);

router.delete(
  '/profile/main-admin-media/:id',
  requireAuth,
  requireMainAdmin,
  requirePermission('manage_media'),
  async (req, res, next) => {
    try {
      const mediaIdInput = parseRouteEntityId(req.params.id);
      const mediaIdFilter = buildDualIdFilter(mediaIdInput, {
        idColumn: 'id',
        uuidColumn: 'uuid_id',
        parameterIndex: 1,
      });
      if (!mediaIdFilter) {
        return res.status(400).json({ error: 'Invalid media id' });
      }

      const deletedRows = await pool.query(
        `
          DELETE FROM main_admin_profile_media
          WHERE ${mediaIdFilter.clause}
            AND user_id = $2
          RETURNING id, uuid_id, media_url, storage_path, storage_visibility
        `,
        [...mediaIdFilter.values, req.user.id]
      );

      if (deletedRows.rowCount === 0) {
        return res.status(404).json({ error: 'Media item not found' });
      }

      const deletedRow = deletedRows.rows[0];
      const mediaId = Number(deletedRow.id);
      const privateStoragePath = String(deletedRow.storage_path || '').trim();
      const storageVisibility = String(deletedRow.storage_visibility || '').trim();

      if (storageVisibility === 'private' && privateStoragePath) {
        const fullPrivatePath = resolvePrivateStorageAbsolutePath(privateStoragePath);
        if (fullPrivatePath && fs.existsSync(fullPrivatePath)) {
          try {
            fs.unlinkSync(fullPrivatePath);
          } catch {
            // Ignore file delete failure; db cleanup already succeeded.
          }
        }
      } else {
        const mediaUrl = String(deletedRow.media_url || '');
        let mediaPath = mediaUrl;
        try {
          mediaPath = new URL(mediaUrl).pathname;
        } catch {
          mediaPath = mediaUrl;
        }

        if (mediaPath.startsWith('/uploads/main-admin-media/')) {
          const filename = path.basename(mediaPath);
          if (filename) {
            const fullPath = path.join(process.cwd(), 'uploads', 'main-admin-media', filename);
            if (fs.existsSync(fullPath)) {
              try {
                fs.unlinkSync(fullPath);
              } catch {
                // Ignore file delete failure; db cleanup already succeeded.
              }
            }
          }
        }
      }

      await writeAuthActivity({
        actorUserId: req.user.id,
        actorRole: req.user.role,
        actionKey: 'main_admin_profile_media_deleted',
        metadata: {
          mediaId,
          requestedId: mediaIdInput.token,
        },
        ipAddress: normalizeIpAddress(req.ip || req.socket?.remoteAddress),
      });

      return res.json({ message: 'Media item deleted', id: mediaId });
    } catch (error) {
      return next(error);
    }
  }
);

const profilePhotoUploadSchema = z.object({
  dataUrl: z.string().trim().min(20).max(2_000_000),
});

router.post('/profile/photo-upload', requireAuth, async (req, res, next) => {
  try {
    const payload = profilePhotoUploadSchema.parse(req.body || {});
    await ensureUserProfileRow(req.user.id);

    const decoded = decodeImageDataUrl(payload.dataUrl);
    if (!decoded) {
      return res.status(400).json({ error: 'Invalid image. Please upload PNG/JPEG/WebP.' });
    }

    if (decoded.buffer.length > PROFILE_PHOTO_UPLOAD_LIMIT_BYTES) {
      return res.status(400).json({
        error: `Image is too large. Please upload an image under ${Math.floor(
          PROFILE_PHOTO_UPLOAD_LIMIT_BYTES / 1024
        )} KB.`,
      });
    }

    const uploadDir = ensurePrivateStorageDir('profile-photos');
    const filename = `user-${req.user.id}-${Date.now()}.${decoded.ext}`;
    fs.writeFileSync(path.join(uploadDir, filename), decoded.buffer);
    const storagePath = `profile-photos/${filename}`;
    const storedPhotoRef = `private://${storagePath}`;

    await pool.query('UPDATE user_profiles SET photo_url = $1 WHERE user_id = $2', [
      storedPhotoRef,
      req.user.id,
    ]);

    await writeAuthActivity({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      actionKey: 'account_profile_updated',
      metadata: {
        profilePhotoUpdated: true,
      },
      ipAddress: normalizeIpAddress(req.ip || req.socket?.remoteAddress),
    });

    const profile = await loadUserProfilePayload(req.user.id, req);
    if (!profile) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      message: 'Profile photo updated successfully',
      photoUrl: buildSignedMediaUrl(req, storagePath),
      profile,
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/profile', requireAuth, async (req, res, next) => {
  try {
    const payload = profileUpdateSchema.parse(req.body || {});
    await ensureUserProfileRow(req.user.id);

    const existingRows = await pool.query(
      `
        SELECT
          preferences,
          communication,
          government_ids,
          government_statuses,
          two_factor_enabled,
          photo_url,
          city,
          state,
          country
        FROM user_profiles
        WHERE user_id = $1
        LIMIT 1
      `,
      [req.user.id]
    );

    const existing = existingRows.rowCount > 0 ? existingRows.rows[0] : null;

    if (payload.name !== undefined || payload.phone !== undefined) {
      const updateFields = [];
      const updateValues = [];

      if (payload.name !== undefined) {
        updateFields.push(`name = $${updateValues.length + 1}`);
        updateValues.push(payload.name.trim());
      }

      if (payload.phone !== undefined) {
        const normalizedPhone = normalizePhone(payload.phone);
        if (!normalizedPhone) {
          return res.status(400).json({ error: 'Invalid phone number format' });
        }
        updateFields.push(`phone = $${updateValues.length + 1}`);
        updateValues.push(normalizedPhone);
      }

      if (updateFields.length > 0) {
        updateValues.push(req.user.id);
        await pool.query(
          `
            UPDATE users
            SET ${updateFields.join(', ')}
            WHERE id = $${updateValues.length}
          `,
          updateValues
        );
      }
    }

    const nextPreferences = payload.preferences
      ? sanitizePreferences({ ...toObject(existing?.preferences), ...payload.preferences })
      : sanitizePreferences(existing?.preferences);

    const nextCommunication = payload.communication
      ? sanitizeCommunication({ ...toObject(existing?.communication), ...payload.communication })
      : sanitizeCommunication(existing?.communication);

    const nextGovernmentIds = { ...toObject(existing?.government_ids) };
    const nextGovernmentStatuses = { ...toObject(existing?.government_statuses) };

    if (payload.governmentIds) {
      GOVT_ID_KEYS.forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(payload.governmentIds, key)) {
          return;
        }

        const normalizedValue = normalizeGovtIdValue(key, payload.governmentIds[key] || '');
        const previousValue = toTrimmedString(nextGovernmentIds[key]);

        if (!normalizedValue) {
          nextGovernmentIds[key] = '';
          nextGovernmentStatuses[key] = 'Not Submitted';
          return;
        }

        nextGovernmentIds[key] = normalizedValue;
        if (normalizedValue !== previousValue) {
          nextGovernmentStatuses[key] = 'Pending Verification';
          return;
        }

        const existingStatus = normalizeGovtStatus(nextGovernmentStatuses[key]);
        nextGovernmentStatuses[key] =
          existingStatus === 'Not Submitted'
            ? 'Pending Verification'
            : normalizeGovtStatusForSave(existingStatus);
      });
    }

    const nextTwoFactorEnabled =
      payload.twoFactorEnabled !== undefined
        ? Boolean(payload.twoFactorEnabled)
        : Boolean(existing?.two_factor_enabled);

    await pool.query(
      `
        UPDATE user_profiles
        SET
          photo_url = $1,
          city = $2,
          state = $3,
          country = $4,
          preferences = $5::jsonb,
          communication = $6::jsonb,
          government_ids = $7::jsonb,
          government_statuses = $8::jsonb,
          two_factor_enabled = $9
        WHERE user_id = $10
      `,
      [
        payload.photoUrl !== undefined ? payload.photoUrl.trim() : existing?.photo_url || '',
        payload.city !== undefined ? payload.city.trim() : existing?.city || '',
        payload.state !== undefined ? payload.state.trim() : existing?.state || '',
        payload.country !== undefined ? payload.country.trim() : existing?.country || 'India',
        JSON.stringify(nextPreferences),
        JSON.stringify(nextCommunication),
        JSON.stringify(nextGovernmentIds),
        JSON.stringify(nextGovernmentStatuses),
        nextTwoFactorEnabled,
        req.user.id,
      ]
    );

    await writeAuthActivity({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      actionKey: 'account_profile_updated',
      metadata: {
        hasGovernmentUpdate: Boolean(payload.governmentIds),
        twoFactorEnabled: nextTwoFactorEnabled,
      },
      ipAddress: normalizeIpAddress(req.ip || req.socket?.remoteAddress),
    });

    const profile = await loadUserProfilePayload(req.user.id, req);
    if (!profile) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      message: 'Profile updated successfully',
      profile,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/me', requireAuth, async (req, res) => {
  const rows = await pool.query(
    `
      SELECT
        id,
        name,
        email,
        phone,
        role,
        account_type,
        subscription_tier,
        is_main_admin,
        force_password_reset,
        created_at
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [req.user.id]
  );

  if (rows.rowCount === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  return res.json({ user: rows.rows[0] });
});

export default router;
