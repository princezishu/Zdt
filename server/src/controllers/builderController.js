import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { buildCloudinaryFolder, uploadToCloudinary } from '../services/cloudinary.js';
import { requireNonEmptyEnv } from '../utils/env.js';
import { IMAGE_MIME_TYPES, decodeValidatedDataUrl } from '../utils/fileValidation.js';

const router = express.Router();

const JWT_SECRET = requireNonEmptyEnv('JWT_SECRET');
const { JWT_EXPIRES_IN = '7d' } = process.env;

const COMPANY_USER_LIMIT = 10;
const LOGO_UPLOAD_LIMIT_BYTES = 600 * 1024;
const BANNER_UPLOAD_LIMIT_BYTES = 900 * 1024;
const REALTY_PROJECT_TYPES = ['Apartment', 'Villa', 'Plotted', 'Commercial'];
const REALTY_PROJECT_STATUSES = ['Upcoming', 'Under Construction', 'Ready to Move'];
const NUMERIC_ID_PATTERN = /^\d+$/;
const UUID_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isMainAdmin: Boolean(user.isMainAdmin),
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function normalizeIpAddress(rawValue) {
  if (!rawValue) return '';
  return String(rawValue).split(',')[0].trim().slice(0, 64);
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

function generateCompanyCode() {
  return `COMP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function decodeImageDataUrl(dataUrl) {
  const decoded = decodeValidatedDataUrl(dataUrl, IMAGE_MIME_TYPES);
  if (!decoded) {
    return null;
  }

  return {
    mimeType: decoded.mimeType,
    ext: decoded.extension,
    buffer: decoded.buffer,
  };
}

async function fetchCompanyContext(userId) {
  const rows = await pool.query(
    `
      SELECT
        u.company_id,
        u.company_role,
        c.company_code,
        c.name AS company_name,
        c.company_type,
        c.logo_url
      FROM users u
      JOIN builder_companies c
        ON c.id = u.company_id
      WHERE u.id = $1
        AND u.company_id IS NOT NULL
      LIMIT 1
    `,
    [userId]
  );

  if (rows.rowCount === 0) {
    return null;
  }

  const row = rows.rows[0];
  const role = row.company_role;
  if (role !== 'owner' && role !== 'member') {
    return null;
  }

  const companyId = Number(row.company_id);
  return {
    companyId,
    companyRole: role,
    company: {
      id: companyId,
      code: row.company_code,
      name: row.company_name,
      type: row.company_type,
      logoUrl: row.logo_url || '',
      maxUsers: COMPANY_USER_LIMIT,
    },
  };
}

async function countCompanyUsers(companyId) {
  const countRows = await pool.query(
    'SELECT COUNT(*)::INT AS count FROM users WHERE company_id = $1',
    [companyId]
  );
  return Number(countRows.rows[0]?.count || 0);
}

function clipText(value, maxLength) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().slice(0, maxLength);
}

function normalizeCompanyName(value) {
  return clipText(value, 160)
    .replace(/\bdevolpers\b/gi, 'Developers')
    .replace(/\bdevlopers\b/gi, 'Developers')
    .replace(/\bdevolper\b/gi, 'Developer')
    .replace(/\bdevloper\b/gi, 'Developer');
}

function toNullableNumber(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNullableInt(value) {
  const parsed = toNullableNumber(value);
  if (parsed === null) return null;
  return Number.isInteger(parsed) ? parsed : Math.round(parsed);
}

function toDateOnlyOrNull(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizeImageUrls(details) {
  const imageUrls = [];
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    if (Array.isArray(details.imageUrls)) {
      for (const item of details.imageUrls) {
        if (typeof item !== 'string') continue;
        const next = item.trim();
        if (next) imageUrls.push(next.slice(0, 1000));
      }
    }
    if (typeof details.imageUrl === 'string') {
      const next = details.imageUrl.trim();
      if (next) imageUrls.push(next.slice(0, 1000));
    }
  }
  return [...new Set(imageUrls)].slice(0, 30);
}

function normalizeConfigurations(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return [];
  }
  if (!Array.isArray(details.configurations)) {
    return [];
  }
  const items = [];
  for (const item of details.configurations) {
    if (typeof item !== 'string') continue;
    const next = item.trim().slice(0, 100);
    if (next) items.push(next);
  }
  return [...new Set(items)].slice(0, 40);
}

async function ensureCompanyShadow(db, companyId) {
  await db.query(
    `
      INSERT INTO companies (
        id,
        code,
        name,
        company_type,
        logo_url,
        created_by_user_id,
        created_at,
        updated_at
      )
      SELECT
        bc.id,
        bc.company_code,
        bc.name,
        bc.company_type,
        bc.logo_url,
        bc.created_by_user_id,
        bc.created_at,
        bc.updated_at
      FROM builder_companies bc
      WHERE bc.id = $1
      ON CONFLICT (id)
      DO UPDATE SET
        code = EXCLUDED.code,
        name = EXCLUDED.name,
        company_type = EXCLUDED.company_type,
        logo_url = EXCLUDED.logo_url,
        updated_at = NOW()
    `,
    [companyId]
  );
}

async function createRealtyProjectFromBuilder(db, input) {
  const details =
    input.details && typeof input.details === 'object' && !Array.isArray(input.details)
      ? input.details
      : {};

  const projectType =
    typeof details.projectType === 'string' && REALTY_PROJECT_TYPES.includes(details.projectType)
      ? details.projectType
      : 'Apartment';
  const status =
    typeof details.status === 'string' && REALTY_PROJECT_STATUSES.includes(details.status)
      ? details.status
      : 'Upcoming';

  const city = clipText(input.city || details.city || '', 120);
  const area = clipText(input.location || details.area || '', 160);
  const fullAddressRaw =
    clipText(details.fullAddress || '', 700) ||
    clipText([area, city].filter(Boolean).join(', '), 700) ||
    clipText(input.title || '', 700);

  const insert = await db.query(
    `
      INSERT INTO projects (
        company_id,
        project_name,
        project_type,
        state,
        city,
        area,
        full_address,
        landmark,
        latitude,
        longitude,
        price_min,
        price_max,
        price_per_sqft,
        configurations,
        total_units,
        total_floors,
        total_area,
        possession_date,
        status,
        image_urls,
        brochure_url,
        highlights,
        created_by_user_id
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14::TEXT[],
        $15, $16, $17, $18, $19, $20::TEXT[], $21, $22, $23
      )
      RETURNING id
    `,
    [
      input.companyId,
      clipText(input.title || '', 180),
      projectType,
      clipText(details.state || '', 120),
      city,
      area,
      fullAddressRaw,
      clipText(details.landmark || '', 180),
      toNullableNumber(details.latitude),
      toNullableNumber(details.longitude),
      toNullableNumber(details.priceMin),
      toNullableNumber(details.priceMax),
      toNullableNumber(details.pricePerSqft),
      normalizeConfigurations(details),
      toNullableInt(details.totalUnits),
      toNullableInt(details.totalFloors),
      toNullableNumber(details.totalArea),
      toDateOnlyOrNull(details.possessionDate),
      status,
      normalizeImageUrls(details),
      clipText(details.brochureUrl || '', 1000),
      clipText(details.highlights || input.description || '', 9000),
      input.createdByUserId || null,
    ]
  );

  return Number(insert.rows[0].id);
}

async function syncApprovedBuilderProjectsToRealty(db, companyId, fallbackUserId = null) {
  const pendingRows = await db.query(
    `
      SELECT
        id,
        title,
        city,
        location,
        description,
        details,
        created_by_user_id
      FROM builder_projects
      WHERE company_id = $1
        AND status = 'approved'
        AND public_project_id IS NULL
      ORDER BY approved_at ASC NULLS LAST, created_at ASC
      LIMIT 100
    `,
    [companyId]
  );

  if (pendingRows.rowCount === 0) {
    return 0;
  }

  await ensureCompanyShadow(db, companyId);

  for (const row of pendingRows.rows) {
    const publicProjectId = await createRealtyProjectFromBuilder(db, {
      companyId,
      title: row.title,
      city: row.city,
      location: row.location,
      description: row.description,
      details: row.details || {},
      createdByUserId: row.created_by_user_id ? Number(row.created_by_user_id) : fallbackUserId,
    });
    await db.query(
      'UPDATE builder_projects SET public_project_id = $1 WHERE id = $2 AND public_project_id IS NULL',
      [publicProjectId, Number(row.id)]
    );
  }

  return pendingRows.rowCount;
}

const registerCompanySchema = z.object({
  companyName: z.string().trim().min(2).max(160),
  companyType: z.enum(['dealer', 'builder']).default('builder'),
  ownerName: z.string().trim().min(2).max(120),
  ownerEmail: z.string().email().max(190),
  ownerPassword: z.string().min(8).max(128),
  ownerPhone: z
    .string()
    .trim()
    .min(8)
    .max(32)
    .transform((value) => value.slice(0, 32)),
  deviceId: z.string().max(120).optional(),
});

router.post('/register-company', async (req, res, next) => {
  try {
    const payload = registerCompanySchema.parse(req.body);
    const normalizedCompanyName = normalizeCompanyName(payload.companyName);
    const email = payload.ownerEmail.trim().toLowerCase();
    const deviceId = getClientDeviceId(req, payload);
    const userAgent = (req.get('user-agent') || '').slice(0, 255);
    const ipAddress = normalizeIpAddress(req.headers['x-forwarded-for'] || req.socket?.remoteAddress);

    const existingRows = await pool.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
    if (existingRows.rowCount > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(payload.ownerPassword, 12);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userInsert = await client.query(
        `
          INSERT INTO users (name, email, password_hash, phone, role, account_type, company_role)
          VALUES ($1, $2, $3, $4, 'builder', $5, 'owner')
          RETURNING id, role, account_type, is_main_admin
        `,
        [payload.ownerName, email, passwordHash, payload.ownerPhone, payload.companyType]
      );

      const userId = Number(userInsert.rows[0].id);

      let companyRow = null;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const companyCode = generateCompanyCode();
        try {
          const companyInsert = await client.query(
            `
              INSERT INTO builder_companies (company_code, name, company_type, created_by_user_id)
              VALUES ($1, $2, $3, $4)
              RETURNING id, company_code, name, company_type, logo_url
            `,
            [companyCode, normalizedCompanyName, payload.companyType, userId]
          );
          companyRow = companyInsert.rows[0];
          break;
        } catch (error) {
          const code = error && typeof error === 'object' ? error.code : null;
          if (code === '23505') {
            continue;
          }
          throw error;
        }
      }

      if (!companyRow) {
        throw new Error('Unable to generate a unique company id. Please try again.');
      }

      const companyId = Number(companyRow.id);
      await client.query(
        `
          INSERT INTO companies (
            id,
            code,
            name,
            company_type,
            logo_url,
            created_by_user_id,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
          ON CONFLICT (id)
          DO UPDATE SET
            code = EXCLUDED.code,
            name = EXCLUDED.name,
            company_type = EXCLUDED.company_type,
            logo_url = EXCLUDED.logo_url,
            created_by_user_id = EXCLUDED.created_by_user_id,
            updated_at = NOW()
        `,
        [
          companyId,
          companyRow.company_code,
          companyRow.name,
          companyRow.company_type,
          companyRow.logo_url || '',
          userId,
        ]
      );
      await client.query('UPDATE users SET company_id = $1 WHERE id = $2', [companyId, userId]);

      const user = {
        id: userId,
        name: payload.ownerName,
        email,
        role: userInsert.rows[0].role,
        accountType: userInsert.rows[0].account_type || payload.companyType,
        companyRole: 'owner',
        isMainAdmin: false,
      };

      const token = signToken(user);
      const tokenHash = hashToken(token);

      await client.query(
        `
          INSERT INTO user_sessions (user_id, device_id, token_hash, user_agent, ip_address)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [userId, deviceId, tokenHash, userAgent, ipAddress]
      );

      await client.query('COMMIT');

      return res.status(201).json({
        token,
        user,
        company: {
          id: companyId,
          code: companyRow.company_code,
          name: companyRow.name,
          type: companyRow.company_type,
          logoUrl: companyRow.logo_url || '',
          maxUsers: COMPANY_USER_LIMIT,
        },
        membership: { role: 'owner' },
        userCount: 1,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return next(error);
  }
});

const logoUploadSchema = z.object({
  dataUrl: z.string().trim().min(20).max(2_000_000),
});

router.post('/company/logo', requireAuth, async (req, res, next) => {
  try {
    const ctx = await fetchCompanyContext(req.user.id);
    if (!ctx) {
      return res.status(403).json({ error: 'This account is not linked to a company.' });
    }
    if (ctx.companyRole !== 'owner') {
      return res.status(403).json({ error: 'Only the company owner can update the logo.' });
    }

    const payload = logoUploadSchema.parse(req.body || {});
    const decoded = decodeImageDataUrl(payload.dataUrl);
    if (!decoded) {
      return res.status(400).json({ error: 'Invalid image. Please upload PNG/JPEG/WebP.' });
    }

    if (decoded.buffer.length > LOGO_UPLOAD_LIMIT_BYTES) {
      return res.status(400).json({
        error: `Logo is too large. Please upload an image under ${Math.floor(
          LOGO_UPLOAD_LIMIT_BYTES / 1024
        )} KB.`,
      });
    }

    const uploaded = await uploadToCloudinary(decoded.buffer, {
      folder: buildCloudinaryFolder('company-logos'),
      publicId: `company-${ctx.companyId}-logo`,
      resourceType: 'image',
      overwrite: true,
    });
    const absoluteUrl = uploaded.secureUrl || uploaded.url || '';

    const updateRows = await pool.query(
      `
        UPDATE builder_companies
        SET logo_url = $1
        WHERE id = $2
        RETURNING id, company_code, name, company_type, logo_url
      `,
      [absoluteUrl, ctx.companyId]
    );

    if (updateRows.rowCount === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const row = updateRows.rows[0];
    await pool.query(
      `
        UPDATE companies
        SET logo_url = $1,
            updated_at = NOW()
        WHERE id = $2
      `,
      [row.logo_url || '', ctx.companyId]
    );
    return res.json({
      company: {
        id: Number(row.id),
        code: row.company_code,
        name: row.name,
        type: row.company_type,
        logoUrl: row.logo_url || '',
        maxUsers: COMPANY_USER_LIMIT,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/banners', async (req, res, next) => {
  try {
    const requested = Number(req.query.limit);
    const normalized = Number.isFinite(requested) ? requested : 8;
    const limit = Math.min(Math.max(normalized, 1), 24);

    const rows = await pool.query(
      `
        SELECT
          b.id,
          b.image_url,
          b.title,
          b.subtitle,
          b.link_url,
          b.sort_order,
          b.created_at,
          c.id AS company_id,
          c.company_code,
          c.name AS company_name,
          c.company_type,
          c.logo_url
        FROM builder_company_banners b
        JOIN builder_companies c
          ON c.id = b.company_id
        WHERE b.is_active = TRUE
        ORDER BY b.sort_order ASC, b.created_at DESC
        LIMIT $1
      `,
      [limit]
    );

    return res.json({
      banners: rows.rows.map((row) => ({
        id: Number(row.id),
        imageUrl: row.image_url,
        title: row.title || '',
        subtitle: row.subtitle || '',
        linkUrl: row.link_url || '',
        sortOrder: Number(row.sort_order || 0),
        createdAt: row.created_at,
        company: {
          id: Number(row.company_id),
          code: row.company_code,
          name: row.company_name,
          type: row.company_type,
          logoUrl: row.logo_url || '',
        },
      })),
    });
  } catch (error) {
    return next(error);
  }
});

const createBannerSchema = z.object({
  dataUrl: z.string().trim().min(20).max(3_000_000),
  title: z.string().trim().max(120).optional().or(z.literal('')),
  subtitle: z.string().trim().max(200).optional().or(z.literal('')),
  linkUrl: z.string().trim().max(800).optional().or(z.literal('')),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.coerce.number().int().min(0).max(1000).optional().default(100),
});

router.get('/company/banners', requireAuth, async (req, res, next) => {
  try {
    const ctx = await fetchCompanyContext(req.user.id);
    if (!ctx) {
      return res.status(403).json({ error: 'This account is not linked to a company.' });
    }

    const where = ctx.companyRole === 'owner' ? '' : 'AND is_active = TRUE';

    const rows = await pool.query(
      `
        SELECT
          id,
          image_url,
          title,
          subtitle,
          link_url,
          is_active,
          sort_order,
          created_at,
          updated_at
        FROM builder_company_banners
        WHERE company_id = $1
        ${where}
        ORDER BY sort_order ASC, created_at DESC
      `,
      [ctx.companyId]
    );

    return res.json({
      banners: rows.rows.map((row) => ({
        id: Number(row.id),
        imageUrl: row.image_url,
        title: row.title || '',
        subtitle: row.subtitle || '',
        linkUrl: row.link_url || '',
        isActive: Boolean(row.is_active),
        sortOrder: Number(row.sort_order || 0),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/company/banners', requireAuth, async (req, res, next) => {
  try {
    const ctx = await fetchCompanyContext(req.user.id);
    if (!ctx) {
      return res.status(403).json({ error: 'This account is not linked to a company.' });
    }
    if (ctx.companyRole !== 'owner') {
      return res.status(403).json({ error: 'Only the company owner can add banners.' });
    }

    const payload = createBannerSchema.parse(req.body || {});
    const decoded = decodeImageDataUrl(payload.dataUrl);
    if (!decoded) {
      return res.status(400).json({ error: 'Invalid image. Please upload PNG/JPEG/WebP.' });
    }

    if (decoded.buffer.length > BANNER_UPLOAD_LIMIT_BYTES) {
      return res.status(400).json({
        error: `Banner is too large. Please upload an image under ${Math.floor(
          BANNER_UPLOAD_LIMIT_BYTES / 1024
        )} KB.`,
      });
    }

    const nonce = crypto.randomBytes(4).toString('hex');
    const uploaded = await uploadToCloudinary(decoded.buffer, {
      folder: buildCloudinaryFolder('company-banners'),
      publicId: `banner-${ctx.companyId}-${Date.now()}-${nonce}`,
      resourceType: 'image',
    });
    const absoluteUrl = uploaded.secureUrl || uploaded.url || '';

    const insertRows = await pool.query(
      `
        INSERT INTO builder_company_banners (
          company_id,
          image_url,
          title,
          subtitle,
          link_url,
          is_active,
          sort_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING
          id,
          image_url,
          title,
          subtitle,
          link_url,
          is_active,
          sort_order,
          created_at,
          updated_at
      `,
      [
        ctx.companyId,
        absoluteUrl,
        (payload.title || '').trim(),
        (payload.subtitle || '').trim(),
        (payload.linkUrl || '').trim(),
        Boolean(payload.isActive),
        Number(payload.sortOrder),
      ]
    );

    const row = insertRows.rows[0];
    return res.status(201).json({
      banner: {
        id: Number(row.id),
        imageUrl: row.image_url,
        title: row.title || '',
        subtitle: row.subtitle || '',
        linkUrl: row.link_url || '',
        isActive: Boolean(row.is_active),
        sortOrder: Number(row.sort_order || 0),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    return next(error);
  }
});

const updateBannerSchema = z.object({
  title: z.string().trim().max(120).optional(),
  subtitle: z.string().trim().max(200).optional(),
  linkUrl: z.string().trim().max(800).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(1000).optional(),
});

router.patch('/company/banners/:id', requireAuth, async (req, res, next) => {
  try {
    const ctx = await fetchCompanyContext(req.user.id);
    if (!ctx) {
      return res.status(403).json({ error: 'This account is not linked to a company.' });
    }
    if (ctx.companyRole !== 'owner') {
      return res.status(403).json({ error: 'Only the company owner can update banners.' });
    }

    const bannerIdInput = parseRouteEntityId(req.params.id);
    if (!bannerIdInput) {
      return res.status(400).json({ error: 'Invalid banner id' });
    }

    const payload = updateBannerSchema.parse(req.body || {});
    const updates = [];
    const values = [];

    if (payload.title !== undefined) {
      updates.push(`title = $${values.length + 1}`);
      values.push(payload.title.trim());
    }
    if (payload.subtitle !== undefined) {
      updates.push(`subtitle = $${values.length + 1}`);
      values.push(payload.subtitle.trim());
    }
    if (payload.linkUrl !== undefined) {
      updates.push(`link_url = $${values.length + 1}`);
      values.push(payload.linkUrl.trim());
    }
    if (payload.isActive !== undefined) {
      updates.push(`is_active = $${values.length + 1}`);
      values.push(Boolean(payload.isActive));
    }
    if (payload.sortOrder !== undefined) {
      updates.push(`sort_order = $${values.length + 1}`);
      values.push(Number(payload.sortOrder));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const bannerIdFilter = buildDualIdFilter(bannerIdInput, {
      idColumn: 'id',
      uuidColumn: 'uuid_id',
      parameterIndex: values.length + 1,
    });
    if (!bannerIdFilter) {
      return res.status(400).json({ error: 'Invalid banner id' });
    }
    values.push(...bannerIdFilter.values);
    const companyParamIndex = values.length + 1;
    values.push(ctx.companyId);

    const result = await pool.query(
      `
        UPDATE builder_company_banners
        SET ${updates.join(', ')}
        WHERE ${bannerIdFilter.clause}
          AND company_id = $${companyParamIndex}
        RETURNING
          id,
          image_url,
          title,
          subtitle,
          link_url,
          is_active,
          sort_order,
          created_at,
          updated_at
      `,
      values
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Banner not found' });
    }

    const row = result.rows[0];
    return res.json({
      banner: {
        id: Number(row.id),
        imageUrl: row.image_url,
        title: row.title || '',
        subtitle: row.subtitle || '',
        linkUrl: row.link_url || '',
        isActive: Boolean(row.is_active),
        sortOrder: Number(row.sort_order || 0),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.delete('/company/banners/:id', requireAuth, async (req, res, next) => {
  try {
    const ctx = await fetchCompanyContext(req.user.id);
    if (!ctx) {
      return res.status(403).json({ error: 'This account is not linked to a company.' });
    }
    if (ctx.companyRole !== 'owner') {
      return res.status(403).json({ error: 'Only the company owner can remove banners.' });
    }

    const bannerIdInput = parseRouteEntityId(req.params.id);
    const bannerIdFilter = buildDualIdFilter(bannerIdInput, {
      idColumn: 'id',
      uuidColumn: 'uuid_id',
      parameterIndex: 1,
    });
    if (!bannerIdFilter) {
      return res.status(400).json({ error: 'Invalid banner id' });
    }

    const result = await pool.query(
      `DELETE FROM builder_company_banners WHERE ${bannerIdFilter.clause} AND company_id = $2 RETURNING id`,
      [...bannerIdFilter.values, ctx.companyId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Banner not found' });
    }

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const ctx = await fetchCompanyContext(req.user.id);
    if (!ctx) {
      return res.json({ company: null, membership: null, userCount: 0, maxUsers: COMPANY_USER_LIMIT });
    }

    const userCount = await countCompanyUsers(ctx.companyId);
    return res.json({
      company: ctx.company,
      membership: { role: ctx.companyRole },
      userCount,
      maxUsers: COMPANY_USER_LIMIT,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/company/users', requireAuth, async (req, res, next) => {
  try {
    const ctx = await fetchCompanyContext(req.user.id);
    if (!ctx) {
      return res.status(403).json({ error: 'This account is not linked to a company.' });
    }
    if (ctx.companyRole !== 'owner') {
      return res.status(403).json({ error: 'Only the company owner can manage users.' });
    }

    const rows = await pool.query(
      `
        SELECT id, name, email, phone, company_role, created_at
        FROM users
        WHERE company_id = $1
        ORDER BY
          CASE company_role WHEN 'owner' THEN 0 ELSE 1 END,
          created_at ASC
      `,
      [ctx.companyId]
    );

    const userCount = rows.rowCount;
    return res.json({
      users: rows.rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        email: row.email,
        phone: row.phone || '',
        companyRole: row.company_role,
        createdAt: row.created_at,
      })),
      userCount,
      maxUsers: COMPANY_USER_LIMIT,
    });
  } catch (error) {
    return next(error);
  }
});

const createCompanyUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email().max(190),
  password: z.string().min(8).max(128),
  phone: z
    .string()
    .max(32)
    .optional()
    .transform((value) => (value && value.trim() ? value.trim().slice(0, 32) : null)),
});

router.post('/company/users', requireAuth, async (req, res, next) => {
  try {
    const ctx = await fetchCompanyContext(req.user.id);
    if (!ctx) {
      return res.status(403).json({ error: 'This account is not linked to a company.' });
    }
    if (ctx.companyRole !== 'owner') {
      return res.status(403).json({ error: 'Only the company owner can add users.' });
    }

    const payload = createCompanyUserSchema.parse(req.body);
    const email = payload.email.trim().toLowerCase();

    const currentCount = await countCompanyUsers(ctx.companyId);
    if (currentCount >= COMPANY_USER_LIMIT) {
      return res.status(400).json({ error: `Company user limit reached (maximum ${COMPANY_USER_LIMIT}).` });
    }

    const existingRows = await pool.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
    if (existingRows.rowCount > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(payload.password, 12);
    const insert = await pool.query(
      `
        INSERT INTO users (name, email, password_hash, phone, role, account_type, company_id, company_role)
        VALUES ($1, $2, $3, $4, 'builder', $5, $6, 'member')
        RETURNING id, name, email, phone, company_role, created_at
      `,
      [payload.name, email, passwordHash, payload.phone, ctx.company.type, ctx.companyId]
    );

    const row = insert.rows[0];
    return res.status(201).json({
      user: {
        id: Number(row.id),
        name: row.name,
        email: row.email,
        phone: row.phone || '',
        companyRole: row.company_role,
        createdAt: row.created_at,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.delete('/company/users/:id', requireAuth, async (req, res, next) => {
  try {
    const ctx = await fetchCompanyContext(req.user.id);
    if (!ctx) {
      return res.status(403).json({ error: 'This account is not linked to a company.' });
    }
    if (ctx.companyRole !== 'owner') {
      return res.status(403).json({ error: 'Only the company owner can remove users.' });
    }

    const targetIdInput = parseRouteEntityId(req.params.id);
    const targetIdFilter = buildDualIdFilter(targetIdInput, {
      idColumn: 'id',
      uuidColumn: 'uuid_id',
      parameterIndex: 1,
    });
    if (!targetIdFilter) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const targetRows = await pool.query(
      `
        SELECT id
        FROM users
        WHERE ${targetIdFilter.clause}
          AND company_id = $2
          AND company_role = 'member'
        LIMIT 1
      `,
      [...targetIdFilter.values, ctx.companyId]
    );

    if (targetRows.rowCount === 0) {
      return res.status(404).json({ error: 'Company member not found' });
    }

    const targetId = Number(targetRows.rows[0].id);
    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'Owner cannot remove themselves from the company.' });
    }

    const result = await pool.query(
      `
        UPDATE users
        SET company_id = NULL,
            company_role = NULL
        WHERE id = $1
          AND company_id = $2
          AND company_role = 'member'
        RETURNING id
      `,
      [targetId, ctx.companyId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Company member not found' });
    }

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.get('/company/projects', requireAuth, async (req, res, next) => {
  try {
    const ctx = await fetchCompanyContext(req.user.id);
    if (!ctx) {
      return res.status(403).json({ error: 'This account is not linked to a company.' });
    }

    // Backfill legacy approved builder projects into public realty projects.
    const syncClient = await pool.connect();
    try {
      await syncClient.query('BEGIN');
      await syncApprovedBuilderProjectsToRealty(syncClient, ctx.companyId, req.user.id);
      await syncClient.query('COMMIT');
    } catch (error) {
      await syncClient.query('ROLLBACK');
      throw error;
    } finally {
      syncClient.release();
    }

    const rows = await pool.query(
      `
        SELECT
          p.id,
          p.public_project_id,
          p.title,
          p.city,
          p.location,
          p.description,
          p.details,
          p.status,
          p.created_at,
          p.updated_at,
          p.created_by_user_id,
          u.name AS created_by_name,
          u.email AS created_by_email
        FROM builder_projects p
        LEFT JOIN users u
          ON u.id = p.created_by_user_id
        WHERE p.company_id = $1
        ORDER BY p.created_at DESC
      `,
      [ctx.companyId]
    );

    return res.json({
      projects: rows.rows.map((row) => ({
        id: Number(row.id),
        publicProjectId: row.public_project_id ? Number(row.public_project_id) : null,
        title: row.title,
        city: row.city,
        location: row.location,
        description: row.description,
        details: row.details || {},
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        createdBy: row.created_by_user_id
          ? {
              id: Number(row.created_by_user_id),
              name: row.created_by_name || '',
              email: row.created_by_email || '',
            }
          : null,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

const createProjectSchema = z.object({
  title: z.string().trim().min(2).max(160),
  city: z.string().trim().max(120).optional().default(''),
  location: z.string().trim().max(200).optional().default(''),
  description: z.string().trim().max(4000).optional().default(''),
  details: z.record(z.string(), z.unknown()).optional().default({}),
});

router.post('/company/projects', requireAuth, async (req, res, next) => {
  try {
    const ctx = await fetchCompanyContext(req.user.id);
    if (!ctx) {
      return res.status(403).json({ error: 'This account is not linked to a company.' });
    }

    const payload = createProjectSchema.parse(req.body);

    const status = ctx.companyRole === 'owner' ? 'approved' : 'pending';
    const approvedBy = ctx.companyRole === 'owner' ? req.user.id : null;
    const approvedAt = ctx.companyRole === 'owner' ? new Date() : null;

    const client = await pool.connect();
    let row;
    try {
      await client.query('BEGIN');

      const insert = await client.query(
        `
          INSERT INTO builder_projects (
            company_id,
            title,
            city,
            location,
            description,
            details,
            status,
            created_by_user_id,
            approved_by_user_id,
            approved_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)
          RETURNING
            id,
            title,
            city,
            location,
            description,
            details,
            status,
            created_at,
            updated_at,
            public_project_id,
            created_by_user_id
        `,
        [
          ctx.companyId,
          payload.title,
          payload.city,
          payload.location,
          payload.description,
          JSON.stringify(payload.details || {}),
          status,
          req.user.id,
          approvedBy,
          approvedAt,
        ]
      );

      row = insert.rows[0];

      if (row.status === 'approved' && !row.public_project_id) {
        await ensureCompanyShadow(client, ctx.companyId);
        const publicProjectId = await createRealtyProjectFromBuilder(client, {
          companyId: ctx.companyId,
          title: row.title,
          city: row.city,
          location: row.location,
          description: row.description,
          details: row.details || {},
          createdByUserId: row.created_by_user_id ? Number(row.created_by_user_id) : req.user.id,
        });
        await client.query(
          'UPDATE builder_projects SET public_project_id = $1 WHERE id = $2',
          [publicProjectId, Number(row.id)]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return res.status(201).json({
      project: {
        id: Number(row.id),
        title: row.title,
        city: row.city,
        location: row.location,
        description: row.description,
        details: row.details || {},
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/company/projects/:id/approve', requireAuth, async (req, res, next) => {
  try {
    const ctx = await fetchCompanyContext(req.user.id);
    if (!ctx) {
      return res.status(403).json({ error: 'This account is not linked to a company.' });
    }
    if (ctx.companyRole !== 'owner') {
      return res.status(403).json({ error: 'Only the company owner can approve projects.' });
    }

    const projectIdInput = parseRouteEntityId(req.params.id);
    const projectIdFilter = buildDualIdFilter(projectIdInput, {
      idColumn: 'id',
      uuidColumn: 'uuid_id',
      parameterIndex: 2,
    });
    if (!projectIdFilter) {
      return res.status(400).json({ error: 'Invalid project id' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `
          UPDATE builder_projects
          SET status = 'approved',
              approved_by_user_id = $1,
              approved_at = NOW()
          WHERE ${projectIdFilter.clause}
            AND company_id = $3
            AND status = 'pending'
          RETURNING
            id,
            title,
            city,
            location,
            description,
            details,
            public_project_id,
            created_by_user_id
        `,
        [req.user.id, ...projectIdFilter.values, ctx.companyId]
      );

      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Pending project not found' });
      }

      const row = result.rows[0];
      if (!row.public_project_id) {
        await ensureCompanyShadow(client, ctx.companyId);
        const publicProjectId = await createRealtyProjectFromBuilder(client, {
          companyId: ctx.companyId,
          title: row.title,
          city: row.city,
          location: row.location,
          description: row.description,
          details: row.details || {},
          createdByUserId: row.created_by_user_id ? Number(row.created_by_user_id) : req.user.id,
        });
        await client.query(
          'UPDATE builder_projects SET public_project_id = $1 WHERE id = $2',
          [publicProjectId, Number(row.id)]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.delete('/company/projects/:id', requireAuth, async (req, res, next) => {
  try {
    const ctx = await fetchCompanyContext(req.user.id);
    if (!ctx) {
      return res.status(403).json({ error: 'This account is not linked to a company.' });
    }
    if (ctx.companyRole !== 'owner') {
      return res.status(403).json({ error: 'Only the company owner can remove projects.' });
    }

    const projectIdInput = parseRouteEntityId(req.params.id);
    const projectIdFilter = buildDualIdFilter(projectIdInput, {
      idColumn: 'id',
      uuidColumn: 'uuid_id',
      parameterIndex: 1,
    });
    if (!projectIdFilter) {
      return res.status(400).json({ error: 'Invalid project id' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `
          DELETE FROM builder_projects
          WHERE ${projectIdFilter.clause}
            AND company_id = $2
          RETURNING id, public_project_id
        `,
        [...projectIdFilter.values, ctx.companyId]
      );

      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Project not found' });
      }

      const linkedProjectId = Number(result.rows[0].public_project_id || 0);
      if (linkedProjectId > 0) {
        await client.query(
          'DELETE FROM projects WHERE id = $1 AND company_id = $2',
          [linkedProjectId, ctx.companyId]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

export default router;
