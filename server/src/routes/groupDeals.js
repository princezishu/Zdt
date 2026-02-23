import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { createRateLimiter } from '../middleware/rateLimit.js';

const router = Router();

const GROUP_DEAL_STATUSES = [
  'ACTIVE',
  'MIN_REACHED',
  'CONFIRMED',
  'FULL',
  'EXPIRED',
  'PAUSED',
  'CANCELLED',
];
const GROUP_DEAL_UNIT_TYPES = ['2BHK', '3BHK', 'SHOP', 'PLOT'];
const GROUP_DEAL_TYPES = ['FLAT_DISCOUNT', 'PERCENT_DISCOUNT', 'CONFIRM_LATER'];
const GROUP_DEAL_REQUEST_STATUSES = ['NEW', 'APPROVED', 'REJECTED', 'AUTO_CREATED'];
const GROUP_DEAL_SORT_KEYS = ['most_active', 'ending_soon', 'newest'];
const PUBLIC_DEFAULT_STATUSES = ['ACTIVE', 'MIN_REACHED', 'CONFIRMED', 'FULL'];
const GROUP_DEAL_PRIORITY_LABELS = {
  1: 'Apartments (2BHK / 3BHK)',
  2: 'Commercial shops / offices',
  3: 'Plotted layouts',
  4: 'Under-construction projects',
  5: 'Ready-to-move (selective)',
};

const GROUP_DEAL_NOTE =
  'ZDT Properties facilitates group interest and builder connections. ZDT does not collect booking amounts for group deals. Final pricing, unit allocation, and purchase agreements are handled directly between the buyer and the builder after builder confirmation.';

const listQuerySchema = z.object({
  scope: z.enum(['all', 'state']).optional(),
  state_code: z.string().trim().max(20).optional(),
  unit_type: z.enum(GROUP_DEAL_UNIT_TYPES).optional(),
  verified_only: z.string().trim().optional(),
  min_price: z.coerce.number().positive().optional(),
  max_price: z.coerce.number().positive().optional(),
  sort: z.enum(GROUP_DEAL_SORT_KEYS).optional(),
  status: z.enum(GROUP_DEAL_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});

const joinBodySchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(32).optional().default(''),
  email: z.string().trim().email().max(190).optional().or(z.literal('')).default(''),
  unitPreference: z.enum(GROUP_DEAL_UNIT_TYPES),
  consent: z.literal(true),
  allowBuilderContactBeforeCompletion: z.boolean().optional().default(false),
});

const adminCreateBodySchema = z.object({
  propertyId: z.union([z.coerce.number().int().positive(), z.null()]).optional().default(null),
  projectName: z.string().trim().min(2).max(200),
  builderName: z.string().trim().min(2).max(160),
  builderVerified: z.boolean().optional().default(false),
  stateCode: z.string().trim().min(1).max(20),
  stateName: z.string().trim().min(1).max(120),
  cityName: z.string().trim().min(1).max(120),
  unitType: z.enum(GROUP_DEAL_UNIT_TYPES),
  basePrice: z.union([z.coerce.number().positive(), z.null()]).optional().default(null),
  dealType: z.enum(GROUP_DEAL_TYPES),
  discountValue: z.union([z.coerce.number().positive(), z.null()]).optional().default(null),
  minBuyers: z.coerce.number().int().min(2).max(500),
  maxBuyers: z.union([z.coerce.number().int().min(2).max(1000), z.null()]).optional().default(null),
  validUntil: z.string().trim().min(10).max(40),
  builderContactName: z.string().trim().max(120).optional().default(''),
  builderContactPhone: z.string().trim().max(32).optional().default(''),
  builderContactEmail: z.string().trim().email().max(190).optional().or(z.literal('')).default(''),
  notes: z.string().trim().max(1500).optional().default(''),
});

const adminPatchBodySchema = z.object({
  status: z.enum(GROUP_DEAL_STATUSES).optional(),
  builderVerified: z.boolean().optional(),
  dealType: z.enum(GROUP_DEAL_TYPES).optional(),
  basePrice: z.union([z.coerce.number().positive(), z.null()]).optional(),
  discountValue: z.union([z.coerce.number().positive(), z.null()]).optional(),
  minBuyers: z.coerce.number().int().min(2).max(500).optional(),
  maxBuyers: z.union([z.coerce.number().int().min(2).max(1000), z.null()]).optional(),
  validUntil: z.string().trim().min(10).max(40).optional(),
  finalGroupPrice: z.union([z.coerce.number().positive(), z.null()]).optional(),
  finalDiscountNote: z.string().trim().max(3000).optional(),
  bookingProcessSteps: z.string().trim().max(3000).optional(),
  notes: z.string().trim().max(1500).optional(),
});

const adminListQuerySchema = z.object({
  status: z.enum(GROUP_DEAL_STATUSES).optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const groupDealRequestCreateSchema = z.object({
  propertyId: z.coerce.number().int().positive(),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(32).optional().default(''),
  email: z.string().trim().email().max(190).optional().or(z.literal('')).default(''),
  note: z.string().trim().max(1000).optional().default(''),
  consent: z.literal(true),
});

const adminRequestListQuerySchema = z.object({
  status: z.enum(GROUP_DEAL_REQUEST_STATUSES).optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const adminRequestPatchSchema = z.object({
  status: z.enum(['NEW', 'APPROVED', 'REJECTED']),
  adminNote: z.string().trim().max(1500).optional().default(''),
});

const adminApproveCreateFromRequestBodySchema = z.object({
  minBuyers: z.coerce.number().int().min(2).max(500).optional().default(4),
  maxBuyers: z.union([z.coerce.number().int().min(2).max(1000), z.null()]).optional().default(null),
  validDays: z.coerce.number().int().min(3).max(90).optional().default(14),
  unitType: z.enum(GROUP_DEAL_UNIT_TYPES).optional(),
  dealType: z.enum(GROUP_DEAL_TYPES).optional().default('CONFIRM_LATER'),
  discountValue: z.union([z.coerce.number().positive(), z.null()]).optional().default(null),
  builderVerified: z.boolean().optional().default(false),
  adminNote: z.string().trim().max(1500).optional().default(''),
});

const joinRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 12,
  message: 'Too many join attempts. Please wait a few minutes and try again.',
});

const requestRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many group-deal requests. Please wait a few minutes and try again.',
});

function ensureAdminToken(req, res) {
  const configuredToken = String(process.env.ADMIN_TOKEN || '').trim();
  const incomingToken = String(req.header('x-admin-token') || '').trim();
  if (!configuredToken || incomingToken !== configuredToken) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

function normalizePhone(value) {
  return String(value || '').replace(/[^\d]/g, '').slice(0, 16);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase().slice(0, 190);
}

function normalizeIpAddress(rawValue) {
  if (!rawValue) return '';
  return String(rawValue).split(',')[0].trim().slice(0, 64);
}

function parseBooleanQuery(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function parseDateOrNull(value) {
  const parsed = new Date(String(value || '').trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeStateCode(value) {
  const raw = normalizeSpace(value).toUpperCase();
  if (!raw) return 'NA';
  if (/^[A-Z]{2,3}$/.test(raw)) return raw;

  const words = raw.split(/[\s-]+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.slice(0, 3);
  }
  return raw.slice(0, 2);
}

function inferUnitTypeFromProperty(propertyType, bedrooms) {
  const type = normalizeSpace(propertyType).toLowerCase();
  if (/(plot|land|plotted)/.test(type)) return 'PLOT';
  if (/(shop|office|commercial|warehouse|retail)/.test(type)) return 'SHOP';
  if (Number(bedrooms || 0) >= 3) return '3BHK';
  return '2BHK';
}

function normalizePossessionStatus(value) {
  return normalizeSpace(value).toLowerCase().replace(/-/g, '_').replace(/\s+/g, '_');
}

function resolveGroupDealPriority(propertyRow) {
  const propertyType = normalizeSpace(propertyRow?.property_type).toLowerCase();
  const bedrooms = Number(propertyRow?.bedrooms || 0);
  const possessionStatus = normalizePossessionStatus(propertyRow?.possession_status);
  const isVerified = Boolean(propertyRow?.is_verified);

  const isApartmentPriority = propertyType.includes('apartment') && (bedrooms === 2 || bedrooms === 3);
  if (isApartmentPriority) return 1;

  const isCommercialPriority = /(commercial|shop|office)/.test(propertyType);
  if (isCommercialPriority) return 2;

  const isPlottedPriority = /(plot|plotted|land)/.test(propertyType);
  if (isPlottedPriority) return 3;

  const isUnderConstructionPriority = possessionStatus === 'under_construction';
  if (isUnderConstructionPriority) return 4;

  const isReadyToMove = ['ready', 'ready_to_move', 'resale'].includes(possessionStatus);
  if (isReadyToMove && isVerified) return 5;

  return null;
}

function getGroupDealPriorityLabel(priority) {
  return GROUP_DEAL_PRIORITY_LABELS[priority] || '';
}

function isPropertyEligibleForGroupDealRequest(propertyRow) {
  return resolveGroupDealPriority(propertyRow) !== null;
}

function computeDaysLeft(validUntil) {
  const timestamp = new Date(validUntil).getTime();
  if (!Number.isFinite(timestamp)) return null;
  const diffMs = timestamp - Date.now();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function computeProgressPercent(joinedBuyers, minBuyers) {
  const safeJoined = Number.isFinite(Number(joinedBuyers)) ? Number(joinedBuyers) : 0;
  const safeMin = Number.isFinite(Number(minBuyers)) ? Number(minBuyers) : 0;
  if (safeMin <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((safeJoined / safeMin) * 100)));
}

function isJoinableStatus(status) {
  return String(status || '').trim().toUpperCase() === 'ACTIVE';
}

function mapDealRow(row) {
  const joinedBuyers = Number(row.joined_buyers_count || 0);
  const minBuyers = Number(row.min_buyers || 0);
  const maxBuyers = row.max_buyers === null ? null : Number(row.max_buyers);
  const daysLeft = computeDaysLeft(row.valid_until);
  const status = String(row.status || '').trim().toUpperCase();
  const maxReached = maxBuyers !== null && joinedBuyers >= maxBuyers;
  const canJoin = isJoinableStatus(status) && (daysLeft === null || daysLeft > 0) && !maxReached;

  return {
    id: Number(row.id),
    dealCode: row.deal_code,
    propertyId: row.property_id === null ? null : Number(row.property_id),
    projectName: row.project_name,
    builderName: row.builder_name,
    builderVerified: Boolean(row.builder_verified),
    stateCode: row.state_code,
    stateName: row.state_name,
    cityName: row.city_name,
    unitType: row.unit_type,
    basePrice: row.base_price === null ? null : Number(row.base_price),
    dealType: row.deal_type,
    discountValue: row.discount_value === null ? null : Number(row.discount_value),
    minBuyers,
    maxBuyers,
    joinedBuyers,
    validUntil: row.valid_until,
    status,
    finalGroupPrice: row.final_group_price === null ? null : Number(row.final_group_price),
    finalDiscountNote: row.final_discount_note || '',
    bookingProcessSteps: row.booking_process_steps || '',
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    daysLeft,
    progressPercent: computeProgressPercent(joinedBuyers, minBuyers),
    canJoin,
    mandatoryDisclaimer: GROUP_DEAL_NOTE,
  };
}

function mapRequestRow(row) {
  const groupDealPriority = resolveGroupDealPriority(row);
  return {
    id: Number(row.id),
    propertyId: Number(row.property_id),
    propertyTitle: row.property_title || '',
    propertyType: row.property_type || '',
    bedrooms: row.bedrooms === null ? null : Number(row.bedrooms),
    possessionStatus: row.possession_status || '',
    propertyVerified: Boolean(row.is_verified),
    groupDealPriority,
    groupDealPriorityLabel: getGroupDealPriorityLabel(groupDealPriority),
    companyName: row.company_name || '',
    companyType: row.company_type || '',
    companyPropertyCount: Number(row.company_property_count || 0),
    fullName: row.full_name || '',
    phone: row.phone || '',
    email: row.email || '',
    requestNote: row.request_note || '',
    status: row.status || 'NEW',
    source: row.source || 'property_card',
    sourceIp: row.source_ip || '',
    createdDealId: row.created_deal_id === null ? null : Number(row.created_deal_id),
    createdDealCode: row.created_deal_code || '',
    adminNote: row.admin_note || '',
    reviewedAt: row.reviewed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function fetchGroupDealRequestById(db, requestId, options = {}) {
  const forUpdate = Boolean(options.forUpdate);
  const result = await db.query(
    `
      SELECT
        gdr.*,
        pr.title AS property_title,
        pr.property_type,
        pr.bedrooms,
        pr.possession_status,
        pr.is_verified,
        pr.price,
        pr.city,
        pr.state,
        pr.company_id,
        c.name AS company_name,
        c.company_type AS company_type,
        (
          SELECT COUNT(*)::INT
          FROM properties pr_company
          WHERE pr_company.company_id = pr.company_id
        ) AS company_property_count,
        gd.deal_code AS created_deal_code
      FROM group_deal_requests gdr
      JOIN properties pr
        ON pr.id = gdr.property_id
      LEFT JOIN companies c
        ON c.id = pr.company_id
      LEFT JOIN group_deals gd
        ON gd.id = gdr.created_deal_id
      WHERE gdr.id = $1
      ${forUpdate ? 'FOR UPDATE OF gdr' : ''}
      LIMIT 1
    `,
    [requestId]
  );
  if (result.rowCount === 0) return null;
  return result.rows[0];
}

async function markExpiredDeals() {
  await pool.query(
    `
      UPDATE group_deals
      SET status = 'EXPIRED',
          updated_at = NOW()
      WHERE status IN ('ACTIVE', 'MIN_REACHED')
        AND valid_until < NOW()
    `
  );
}

async function generateUniqueDealCode(client) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const randomPart = crypto.randomBytes(2).toString('hex').toUpperCase();
    const code = `GD-${datePart}-${randomPart}`;
    const exists = await client.query(
      `
        SELECT id
        FROM group_deals
        WHERE deal_code = $1
        LIMIT 1
      `,
      [code]
    );
    if (exists.rowCount === 0) {
      return code;
    }
  }
  throw new Error('Could not generate unique deal code');
}

function validateDealTypeDiscountRules({ dealType, discountValue }) {
  if (dealType === 'CONFIRM_LATER') {
    return null;
  }

  if (!Number.isFinite(Number(discountValue)) || Number(discountValue) <= 0) {
    return 'Discount value is required for flat/percentage discount deals.';
  }

  if (dealType === 'PERCENT_DISCOUNT' && Number(discountValue) > 100) {
    return 'Percentage discount cannot exceed 100.';
  }

  return null;
}

function buildCsvValue(value) {
  const normalized = String(value ?? '');
  if (/[",\n\r]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

router.get('/group-deals/admin/deals', async (req, res, next) => {
  if (!ensureAdminToken(req, res)) return;

  try {
    await markExpiredDeals();
    const query = adminListQuerySchema.parse(req.query || {});
    const page = query.page;
    const pageSize = query.pageSize;
    const offset = (page - 1) * pageSize;

    const where = [];
    const values = [];

    if (query.status) {
      values.push(query.status);
      where.push(`gd.status = $${values.length}`);
    }

    if (query.q) {
      values.push(`%${query.q}%`);
      where.push(`(gd.project_name ILIKE $${values.length} OR gd.builder_name ILIKE $${values.length} OR gd.deal_code ILIKE $${values.length})`);
    }

    values.push(pageSize);
    const limitIndex = values.length;
    values.push(offset);
    const offsetIndex = values.length;

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const result = await pool.query(
      `
        SELECT
          gd.*,
          COUNT(*) OVER()::int AS total_count
        FROM group_deals gd
        ${whereSql}
        ORDER BY gd.created_at DESC, gd.id DESC
        LIMIT $${limitIndex}
        OFFSET $${offsetIndex}
      `,
      values
    );

    const total = Number(result.rows[0]?.total_count || 0);
    return res.json({
      items: result.rows.map((row) => mapDealRow(row)),
      page,
      pageSize,
      total,
      totalPages: total > 0 ? Math.ceil(total / pageSize) : 0,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/group-deals/admin/deals/:dealCode/joins', async (req, res, next) => {
  if (!ensureAdminToken(req, res)) return;

  try {
    const dealCode = String(req.params.dealCode || '').trim().toUpperCase();
    if (!dealCode) {
      return res.status(400).json({ error: 'Invalid deal code' });
    }

    const dealResult = await pool.query(
      `
        SELECT id, deal_code
        FROM group_deals
        WHERE deal_code = $1
        LIMIT 1
      `,
      [dealCode]
    );

    if (dealResult.rowCount === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const dealId = dealResult.rows[0].id;
    const joinsResult = await pool.query(
      `
        SELECT
          id,
          full_name,
          phone,
          email,
          unit_preference,
          consent,
          allow_builder_contact_before_completion,
          join_status,
          source_ip,
          created_at
        FROM group_deal_joins
        WHERE deal_id = $1
        ORDER BY created_at DESC, id DESC
      `,
      [dealId]
    );

    const format = String(req.query.format || '').trim().toLowerCase();
    if (format === 'csv') {
      const header = [
        'join_id',
        'full_name',
        'phone',
        'email',
        'unit_preference',
        'consent',
        'allow_builder_contact_before_completion',
        'join_status',
        'source_ip',
        'created_at',
      ];
      const rows = joinsResult.rows.map((row) => [
        row.id,
        row.full_name,
        row.phone,
        row.email,
        row.unit_preference,
        row.consent ? 'true' : 'false',
        row.allow_builder_contact_before_completion ? 'true' : 'false',
        row.join_status,
        row.source_ip,
        row.created_at,
      ]);
      const csv = [header, ...rows]
        .map((line) => line.map((cell) => buildCsvValue(cell)).join(','))
        .join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${dealCode.toLowerCase()}-joined-buyers.csv"`
      );
      return res.send(csv);
    }

    return res.json({
      dealCode,
      items: joinsResult.rows.map((row) => ({
        id: Number(row.id),
        fullName: row.full_name,
        phone: row.phone,
        email: row.email,
        unitPreference: row.unit_preference,
        consent: Boolean(row.consent),
        allowBuilderContactBeforeCompletion: Boolean(row.allow_builder_contact_before_completion),
        joinStatus: row.join_status,
        sourceIp: row.source_ip,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/group-deals/admin/deals', async (req, res, next) => {
  if (!ensureAdminToken(req, res)) return;

  const client = await pool.connect();
  try {
    const payload = adminCreateBodySchema.parse(req.body || {});

    if (payload.maxBuyers !== null && payload.maxBuyers < payload.minBuyers) {
      return res.status(400).json({ error: 'Max buyers must be greater than or equal to min buyers.' });
    }

    const validUntil = parseDateOrNull(payload.validUntil);
    if (!validUntil) {
      return res.status(400).json({ error: 'validUntil must be a valid date-time.' });
    }
    if (validUntil.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'validUntil must be in the future.' });
    }

    const discountRuleError = validateDealTypeDiscountRules({
      dealType: payload.dealType,
      discountValue: payload.discountValue,
    });
    if (discountRuleError) {
      return res.status(400).json({ error: discountRuleError });
    }

    await client.query('BEGIN');
    const dealCode = await generateUniqueDealCode(client);

    const insertResult = await client.query(
      `
        INSERT INTO group_deals (
          deal_code,
          property_id,
          project_name,
          builder_name,
          builder_verified,
          builder_contact_name,
          builder_contact_phone,
          builder_contact_email,
          state_code,
          state_name,
          city_name,
          unit_type,
          base_price,
          deal_type,
          discount_value,
          min_buyers,
          max_buyers,
          joined_buyers_count,
          valid_until,
          status,
          notes
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15, $16, $17, 0, $18, 'ACTIVE', $19
        )
        RETURNING *
      `,
      [
        dealCode,
        payload.propertyId,
        payload.projectName,
        payload.builderName,
        payload.builderVerified,
        payload.builderContactName,
        normalizePhone(payload.builderContactPhone),
        normalizeEmail(payload.builderContactEmail),
        payload.stateCode.toUpperCase(),
        payload.stateName,
        payload.cityName,
        payload.unitType,
        payload.basePrice,
        payload.dealType,
        payload.discountValue,
        payload.minBuyers,
        payload.maxBuyers,
        validUntil.toISOString(),
        payload.notes,
      ]
    );

    await client.query('COMMIT');
    return res.status(201).json({ item: mapDealRow(insertResult.rows[0]) });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
});

router.patch('/group-deals/admin/deals/:dealCode', async (req, res, next) => {
  if (!ensureAdminToken(req, res)) return;

  try {
    const dealCode = String(req.params.dealCode || '').trim().toUpperCase();
    if (!dealCode) {
      return res.status(400).json({ error: 'Invalid deal code' });
    }

    const payload = adminPatchBodySchema.parse(req.body || {});
    const updates = [];
    const values = [];

    const pushUpdate = (column, value) => {
      values.push(value);
      updates.push(`${column} = $${values.length}`);
    };

    if (payload.status !== undefined) pushUpdate('status', payload.status);
    if (payload.builderVerified !== undefined) pushUpdate('builder_verified', payload.builderVerified);
    if (payload.dealType !== undefined) pushUpdate('deal_type', payload.dealType);
    if (payload.basePrice !== undefined) pushUpdate('base_price', payload.basePrice);
    if (payload.discountValue !== undefined) pushUpdate('discount_value', payload.discountValue);
    if (payload.minBuyers !== undefined) pushUpdate('min_buyers', payload.minBuyers);
    if (payload.maxBuyers !== undefined) pushUpdate('max_buyers', payload.maxBuyers);
    if (payload.finalGroupPrice !== undefined) pushUpdate('final_group_price', payload.finalGroupPrice);
    if (payload.finalDiscountNote !== undefined) pushUpdate('final_discount_note', payload.finalDiscountNote);
    if (payload.bookingProcessSteps !== undefined) {
      pushUpdate('booking_process_steps', payload.bookingProcessSteps);
    }
    if (payload.notes !== undefined) pushUpdate('notes', payload.notes);

    if (payload.validUntil !== undefined) {
      const validUntil = parseDateOrNull(payload.validUntil);
      if (!validUntil) {
        return res.status(400).json({ error: 'validUntil must be a valid date-time.' });
      }
      pushUpdate('valid_until', validUntil.toISOString());
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    if (payload.status === 'CONFIRMED') {
      updates.push(`terms_confirmed_at = NOW()`);
    }

    values.push(dealCode);
    const result = await pool.query(
      `
        UPDATE group_deals
        SET ${updates.join(', ')}
        WHERE deal_code = $${values.length}
        RETURNING *
      `,
      values
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const row = result.rows[0];
    const discountRuleError = validateDealTypeDiscountRules({
      dealType: row.deal_type,
      discountValue: row.discount_value,
    });
    if (discountRuleError) {
      return res.status(400).json({ error: discountRuleError });
    }
    if (
      row.max_buyers !== null &&
      Number(row.max_buyers) < Number(row.min_buyers || 0)
    ) {
      return res.status(400).json({ error: 'Max buyers cannot be less than min buyers.' });
    }

    return res.json({ item: mapDealRow(row) });
  } catch (error) {
    return next(error);
  }
});

router.post('/group-deals/requests', requestRateLimiter, async (req, res, next) => {
  try {
    const payload = groupDealRequestCreateSchema.parse(req.body || {});
    const normalizedPhone = normalizePhone(payload.phone);
    const normalizedEmail = normalizeEmail(payload.email);

    if (!normalizedPhone && !normalizedEmail) {
      return res.status(400).json({ error: 'Phone or email is required.' });
    }
    if (normalizedPhone && normalizedPhone.length < 8) {
      return res.status(400).json({ error: 'Phone number looks invalid.' });
    }

    const propertyRows = await pool.query(
      `
        SELECT
          pr.id,
          pr.title,
          pr.property_type,
          pr.bedrooms,
          pr.possession_status,
          pr.is_verified,
          pr.price,
          pr.city,
          pr.state,
          pr.company_id,
          c.name AS company_name,
          c.company_type,
          (
            SELECT COUNT(*)::INT
            FROM properties pr_company
            WHERE pr_company.company_id = pr.company_id
          ) AS company_property_count
        FROM properties pr
        LEFT JOIN companies c
          ON c.id = pr.company_id
        WHERE pr.id = $1
        LIMIT 1
      `,
      [payload.propertyId]
    );

    if (propertyRows.rowCount === 0) {
      return res.status(404).json({ error: 'Property not found.' });
    }

    const propertyRow = propertyRows.rows[0];
    const priority = resolveGroupDealPriority(propertyRow);
    if (!isPropertyEligibleForGroupDealRequest(propertyRow)) {
      return res.status(400).json({
        error:
          'This property is not in the current group-deal priority set.',
      });
    }

    const inserted = await pool.query(
      `
        INSERT INTO group_deal_requests (
          property_id,
          full_name,
          phone,
          email,
          normalized_phone,
          normalized_email,
          consent,
          request_note,
          status,
          source,
          source_ip
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, TRUE, $7, 'NEW', 'property_card', $8
        )
        RETURNING id, created_at
      `,
      [
        payload.propertyId,
        payload.fullName.trim(),
        payload.phone.trim(),
        payload.email.trim(),
        normalizedPhone,
        normalizedEmail,
        payload.note.trim(),
        normalizeIpAddress(req.ip || req.socket?.remoteAddress),
      ]
    );

    return res.status(201).json({
      ok: true,
      requestId: Number(inserted.rows[0].id),
      message: `Group deal request submitted (Priority ${priority}: ${getGroupDealPriorityLabel(priority)}). Admin review is pending.`,
    });
  } catch (error) {
    if (error?.code === '23505') {
      return res.status(409).json({
        error: 'You already submitted a request for this property. Please wait for admin review.',
      });
    }
    return next(error);
  }
});

router.get('/group-deals/admin/requests', async (req, res, next) => {
  if (!ensureAdminToken(req, res)) return;

  try {
    const query = adminRequestListQuerySchema.parse(req.query || {});
    const page = query.page;
    const pageSize = query.pageSize;
    const offset = (page - 1) * pageSize;

    const where = [];
    const values = [];

    if (query.status) {
      values.push(query.status);
      where.push(`gdr.status = $${values.length}`);
    }

    if (query.q) {
      values.push(`%${query.q}%`);
      where.push(
        `(gdr.full_name ILIKE $${values.length} OR gdr.phone ILIKE $${values.length} OR gdr.email ILIKE $${values.length} OR pr.title ILIKE $${values.length} OR COALESCE(c.name, '') ILIKE $${values.length})`
      );
    }

    values.push(pageSize);
    const limitIndex = values.length;
    values.push(offset);
    const offsetIndex = values.length;

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const result = await pool.query(
      `
        SELECT
          gdr.*,
          pr.title AS property_title,
          pr.property_type,
          pr.bedrooms,
          pr.possession_status,
          pr.is_verified,
          CASE
            WHEN LOWER(COALESCE(pr.property_type, '')) LIKE '%apartment%'
              AND COALESCE(pr.bedrooms, 0) IN (2, 3)
              THEN 1
            WHEN LOWER(COALESCE(pr.property_type, '')) ~ '(commercial|shop|office)'
              THEN 2
            WHEN LOWER(COALESCE(pr.property_type, '')) ~ '(plot|plotted|land)'
              THEN 3
            WHEN LOWER(REPLACE(REPLACE(COALESCE(pr.possession_status, ''), '-', '_'), ' ', '_')) = 'under_construction'
              THEN 4
            WHEN LOWER(REPLACE(REPLACE(COALESCE(pr.possession_status, ''), '-', '_'), ' ', '_')) IN ('ready', 'ready_to_move', 'resale')
              AND COALESCE(pr.is_verified, FALSE) = TRUE
              THEN 5
            ELSE 99
          END AS property_group_deal_priority,
          c.name AS company_name,
          c.company_type AS company_type,
          (
            SELECT COUNT(*)::INT
            FROM properties pr_company
            WHERE pr_company.company_id = pr.company_id
          ) AS company_property_count,
          gd.deal_code AS created_deal_code,
          COUNT(*) OVER()::INT AS total_count
        FROM group_deal_requests gdr
        JOIN properties pr
          ON pr.id = gdr.property_id
        LEFT JOIN companies c
          ON c.id = pr.company_id
        LEFT JOIN group_deals gd
          ON gd.id = gdr.created_deal_id
        ${whereSql}
        ORDER BY property_group_deal_priority ASC, gdr.created_at DESC, gdr.id DESC
        LIMIT $${limitIndex}
        OFFSET $${offsetIndex}
      `,
      values
    );

    const total = Number(result.rows[0]?.total_count || 0);
    return res.json({
      items: result.rows.map((row) => mapRequestRow(row)),
      page,
      pageSize,
      total,
      totalPages: total > 0 ? Math.ceil(total / pageSize) : 0,
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/group-deals/admin/requests/:requestId', async (req, res, next) => {
  if (!ensureAdminToken(req, res)) return;

  try {
    const requestId = Number(req.params.requestId);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return res.status(400).json({ error: 'Invalid request id' });
    }

    const payload = adminRequestPatchSchema.parse(req.body || {});

    const result = await pool.query(
      `
        UPDATE group_deal_requests
        SET
          status = $1,
          admin_note = $2,
          reviewed_at = CASE WHEN $1 = 'NEW' THEN NULL ELSE NOW() END
        WHERE id = $3
        RETURNING id
      `,
      [payload.status, payload.adminNote.trim(), requestId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const row = await fetchGroupDealRequestById(pool, requestId);
    return res.json({ item: mapRequestRow(row) });
  } catch (error) {
    return next(error);
  }
});

router.post('/group-deals/admin/requests/:requestId/approve-create-draft', async (req, res, next) => {
  if (!ensureAdminToken(req, res)) return;

  const client = await pool.connect();
  try {
    const requestId = Number(req.params.requestId);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return res.status(400).json({ error: 'Invalid request id' });
    }

    const payload = adminApproveCreateFromRequestBodySchema.parse(req.body || {});
    if (payload.maxBuyers !== null && payload.maxBuyers < payload.minBuyers) {
      return res.status(400).json({ error: 'Max buyers must be greater than or equal to min buyers.' });
    }
    const discountRuleError = validateDealTypeDiscountRules({
      dealType: payload.dealType,
      discountValue: payload.discountValue,
    });
    if (discountRuleError) {
      return res.status(400).json({ error: discountRuleError });
    }

    await client.query('BEGIN');
    const requestRow = await fetchGroupDealRequestById(client, requestId, { forUpdate: true });

    if (!requestRow) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Request not found' });
    }

    if (!isPropertyEligibleForGroupDealRequest(requestRow)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error:
          'This property is no longer in the configured group-deal priority set.',
      });
    }

    if (String(requestRow.status || '').toUpperCase() === 'REJECTED') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Rejected requests cannot be auto-created.' });
    }

    if (requestRow.created_deal_id) {
      const existingDeal = await client.query(
        `
          SELECT *
          FROM group_deals
          WHERE id = $1
          LIMIT 1
        `,
        [requestRow.created_deal_id]
      );
      await client.query('COMMIT');
      if (existingDeal.rowCount > 0) {
        return res.json({
          message: 'Draft deal already exists for this request.',
          item: mapDealRow(existingDeal.rows[0]),
          request: mapRequestRow(requestRow),
        });
      }
    }

    const stateName = normalizeSpace(requestRow.state) || 'Unknown';
    const stateCode = normalizeStateCode(stateName);
    const cityName = normalizeSpace(requestRow.city) || 'Unknown';
    const projectName = normalizeSpace(requestRow.property_title) || `Property ${requestRow.property_id}`;
    const builderName = normalizeSpace(requestRow.company_name) || 'Seller';
    const basePrice = Number(requestRow.price || 0) > 0 ? Number(requestRow.price) : null;
    const validUntil = new Date(Date.now() + payload.validDays * 24 * 60 * 60 * 1000).toISOString();
    const unitType =
      payload.unitType ||
      inferUnitTypeFromProperty(requestRow.property_type, requestRow.bedrooms);
    const dealCode = await generateUniqueDealCode(client);

    const insertDealResult = await client.query(
      `
        INSERT INTO group_deals (
          deal_code,
          property_id,
          project_name,
          builder_name,
          builder_verified,
          state_code,
          state_name,
          city_name,
          unit_type,
          base_price,
          deal_type,
          discount_value,
          min_buyers,
          max_buyers,
          joined_buyers_count,
          valid_until,
          status,
          notes
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, 0, $15, 'PAUSED', $16
        )
        RETURNING *
      `,
      [
        dealCode,
        requestRow.property_id,
        projectName,
        builderName,
        payload.builderVerified,
        stateCode,
        stateName,
        cityName,
        unitType,
        basePrice,
        payload.dealType,
        payload.discountValue,
        payload.minBuyers,
        payload.maxBuyers,
        validUntil,
        `Auto-created from request #${requestId}. ${payload.adminNote}`.trim(),
      ]
    );

    const createdDeal = insertDealResult.rows[0];

    await client.query(
      `
        UPDATE group_deal_requests
        SET
          status = 'AUTO_CREATED',
          created_deal_id = $1,
          reviewed_at = NOW(),
          admin_note = $2
        WHERE id = $3
      `,
      [createdDeal.id, payload.adminNote.trim(), requestId]
    );

    const updatedRequestRow = await fetchGroupDealRequestById(client, requestId);
    await client.query('COMMIT');

    return res.status(201).json({
      message: 'Draft group deal created from request. Review and activate it from admin deals.',
      item: mapDealRow(createdDeal),
      request: mapRequestRow(updatedRequestRow),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
});

router.get('/group-deals/property/:propertyId', async (req, res, next) => {
  try {
    await markExpiredDeals();
    const propertyId = Number(req.params.propertyId);
    if (!Number.isInteger(propertyId) || propertyId <= 0) {
      return res.status(400).json({ error: 'Invalid property id' });
    }

    const result = await pool.query(
      `
        SELECT *
        FROM group_deals
        WHERE property_id = $1
          AND status = ANY($2::text[])
          AND valid_until >= NOW()
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
      [propertyId, PUBLIC_DEFAULT_STATUSES]
    );

    if (result.rowCount === 0) {
      return res.json({ item: null });
    }

    return res.json({ item: mapDealRow(result.rows[0]) });
  } catch (error) {
    return next(error);
  }
});

router.get('/group-deals/:dealCode', async (req, res, next) => {
  try {
    await markExpiredDeals();
    const dealCode = String(req.params.dealCode || '').trim().toUpperCase();
    if (!dealCode) {
      return res.status(400).json({ error: 'Invalid deal code' });
    }

    const result = await pool.query(
      `
        SELECT *
        FROM group_deals
        WHERE deal_code = $1
        LIMIT 1
      `,
      [dealCode]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const row = result.rows[0];
    const status = String(row.status || '').trim().toUpperCase();
    if (status === 'PAUSED') {
      return res.status(404).json({ error: 'Deal not found' });
    }

    return res.json({ item: mapDealRow(row) });
  } catch (error) {
    return next(error);
  }
});

router.post('/group-deals/:dealCode/join', joinRateLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await markExpiredDeals();
    const dealCode = String(req.params.dealCode || '').trim().toUpperCase();
    if (!dealCode) {
      return res.status(400).json({ error: 'Invalid deal code' });
    }

    const payload = joinBodySchema.parse(req.body || {});
    const normalizedPhone = normalizePhone(payload.phone);
    const normalizedEmail = normalizeEmail(payload.email);
    if (!normalizedPhone && !normalizedEmail) {
      return res.status(400).json({ error: 'Phone or email is required.' });
    }
    if (normalizedPhone && normalizedPhone.length < 8) {
      return res.status(400).json({ error: 'Phone number looks invalid.' });
    }

    await client.query('BEGIN');

    const dealResult = await client.query(
      `
        SELECT *
        FROM group_deals
        WHERE deal_code = $1
        FOR UPDATE
      `,
      [dealCode]
    );

    if (dealResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Deal not found' });
    }

    const deal = dealResult.rows[0];
    const status = String(deal.status || '').trim().toUpperCase();
    if (status !== 'ACTIVE') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `This deal is currently ${status}. Joining is closed.` });
    }

    const nowMs = Date.now();
    const validUntilMs = new Date(deal.valid_until).getTime();
    if (Number.isFinite(validUntilMs) && validUntilMs < nowMs) {
      await client.query(
        `
          UPDATE group_deals
          SET status = 'EXPIRED',
              updated_at = NOW()
          WHERE id = $1
        `,
        [deal.id]
      );
      await client.query('COMMIT');
      return res.status(409).json({ error: 'This deal has expired.' });
    }

    const maxBuyers = deal.max_buyers === null ? null : Number(deal.max_buyers);
    const joinedCount = Number(deal.joined_buyers_count || 0);
    if (maxBuyers !== null && joinedCount >= maxBuyers) {
      await client.query(
        `
          UPDATE group_deals
          SET status = 'FULL',
              updated_at = NOW()
          WHERE id = $1
        `,
        [deal.id]
      );
      await client.query('COMMIT');
      return res.status(409).json({ error: 'This deal is full.' });
    }

    if (normalizedPhone) {
      const phoneConflict = await client.query(
        `
          SELECT id
          FROM group_deal_joins
          WHERE deal_id = $1
            AND normalized_phone = $2
            AND join_status = 'JOINED'
          LIMIT 1
        `,
        [deal.id, normalizedPhone]
      );
      if (phoneConflict.rowCount > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This phone number is already joined for this deal.' });
      }
    }

    if (normalizedEmail) {
      const emailConflict = await client.query(
        `
          SELECT id
          FROM group_deal_joins
          WHERE deal_id = $1
            AND normalized_email = $2
            AND join_status = 'JOINED'
          LIMIT 1
        `,
        [deal.id, normalizedEmail]
      );
      if (emailConflict.rowCount > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This email is already joined for this deal.' });
      }
    }

    await client.query(
      `
        INSERT INTO group_deal_joins (
          deal_id,
          full_name,
          phone,
          email,
          normalized_phone,
          normalized_email,
          unit_preference,
          consent,
          allow_builder_contact_before_completion,
          join_status,
          source_ip
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8, 'JOINED', $9)
      `,
      [
        deal.id,
        payload.fullName,
        normalizedPhone,
        normalizedEmail,
        normalizedPhone,
        normalizedEmail,
        payload.unitPreference,
        payload.allowBuilderContactBeforeCompletion,
        normalizeIpAddress(req.ip || req.socket?.remoteAddress),
      ]
    );

    const incrementResult = await client.query(
      `
        UPDATE group_deals
        SET joined_buyers_count = joined_buyers_count + 1,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [deal.id]
    );

    let finalDealRow = incrementResult.rows[0];
    const nextJoined = Number(finalDealRow.joined_buyers_count || 0);
    const minBuyers = Number(finalDealRow.min_buyers || 0);
    const nextMaxBuyers = finalDealRow.max_buyers === null ? null : Number(finalDealRow.max_buyers);

    let nextStatus = 'ACTIVE';
    if (nextMaxBuyers !== null && nextJoined >= nextMaxBuyers) {
      nextStatus = 'FULL';
    } else if (nextJoined >= minBuyers) {
      nextStatus = 'MIN_REACHED';
    }

    if (nextStatus !== String(finalDealRow.status || '').trim().toUpperCase()) {
      const statusUpdateResult = await client.query(
        `
          UPDATE group_deals
          SET status = $2,
              terms_confirmed_at = CASE WHEN $2 = 'CONFIRMED' THEN NOW() ELSE terms_confirmed_at END,
              updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [deal.id, nextStatus]
      );
      finalDealRow = statusUpdateResult.rows[0];
    }

    await client.query('COMMIT');

    if (String(finalDealRow.status || '').trim().toUpperCase() === 'MIN_REACHED') {
      console.log(
        `[GROUP DEALS] Minimum reached for ${finalDealRow.deal_code}. Notify builder + joined buyers.`
      );
    }

    return res.status(201).json({
      ok: true,
      message: 'You joined this group deal',
      dealCode: finalDealRow.deal_code,
      item: mapDealRow(finalDealRow),
      sharePath: `/group-deals/${finalDealRow.deal_code}`,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error?.code === '23505') {
      return res.status(409).json({ error: 'You have already joined this deal.' });
    }
    return next(error);
  } finally {
    client.release();
  }
});

router.get('/group-deals', async (req, res, next) => {
  try {
    await markExpiredDeals();
    const query = listQuerySchema.parse(req.query || {});
    const page = query.page;
    const pageSize = query.pageSize;
    const offset = (page - 1) * pageSize;
    const scope = String(query.scope || 'all').trim().toLowerCase();
    const stateCode = String(query.state_code || '').trim().toUpperCase();
    const sort = String(query.sort || 'most_active').trim().toLowerCase();
    const verifiedOnly = parseBooleanQuery(query.verified_only);

    const where = [];
    const values = [];

    if (query.status) {
      values.push(query.status);
      where.push(`gd.status = $${values.length}`);
    } else {
      values.push(PUBLIC_DEFAULT_STATUSES);
      where.push(`gd.status = ANY($${values.length}::text[])`);
    }

    if (scope === 'state' && stateCode) {
      values.push(stateCode);
      where.push(`gd.state_code = $${values.length}`);
    }

    if (query.unit_type) {
      values.push(query.unit_type);
      where.push(`gd.unit_type = $${values.length}`);
    }

    if (verifiedOnly) {
      where.push(`gd.builder_verified = TRUE`);
    }

    if (query.min_price !== undefined) {
      values.push(query.min_price);
      where.push(`COALESCE(gd.final_group_price, gd.base_price, 0) >= $${values.length}`);
    }

    if (query.max_price !== undefined) {
      values.push(query.max_price);
      where.push(`COALESCE(gd.final_group_price, gd.base_price, 0) <= $${values.length}`);
    }

    values.push(pageSize);
    const limitIndex = values.length;
    values.push(offset);
    const offsetIndex = values.length;

    let orderBy = 'gd.joined_buyers_count DESC, gd.created_at DESC, gd.id DESC';
    if (sort === 'ending_soon') {
      orderBy = 'gd.valid_until ASC, gd.created_at DESC, gd.id DESC';
    } else if (sort === 'newest') {
      orderBy = 'gd.created_at DESC, gd.id DESC';
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const result = await pool.query(
      `
        SELECT
          gd.*,
          COUNT(*) OVER()::int AS total_count
        FROM group_deals gd
        ${whereSql}
        ORDER BY ${orderBy}
        LIMIT $${limitIndex}
        OFFSET $${offsetIndex}
      `,
      values
    );

    const total = Number(result.rows[0]?.total_count || 0);
    return res.json({
      items: result.rows.map((row) => mapDealRow(row)),
      page,
      pageSize,
      total,
      totalPages: total > 0 ? Math.ceil(total / pageSize) : 0,
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
