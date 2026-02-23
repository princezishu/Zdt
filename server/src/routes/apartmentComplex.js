import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { sendSmsMessage } from '../services/otpDelivery.js';

const router = Router();

const BUILDING_TYPES = ['residential', 'commercial', 'mixed'];
const PAYMENT_METHODS = ['cash', 'upi', 'bank'];
const STATUS_VALUES = ['paid', 'unpaid', 'not_applicable'];
const monthKeyRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const APP_NAME = process.env.APP_NAME || 'ZDT Realty';
const DEFAULT_LATE_PENALTY_PERCENT = 5;
const latePenaltyPercentCandidate = Number(
  process.env.APARTMENT_RENT_LATE_PENALTY_PERCENT || DEFAULT_LATE_PENALTY_PERCENT
);
const APARTMENT_RENT_LATE_PENALTY_PERCENT = Number.isFinite(latePenaltyPercentCandidate)
  ? Math.min(Math.max(latePenaltyPercentCandidate, 0), 100)
  : DEFAULT_LATE_PENALTY_PERCENT;
const APARTMENT_RENT_LATE_PENALTY_MULTIPLIER = APARTMENT_RENT_LATE_PENALTY_PERCENT / 100;

const uuidSchema = z.string().uuid();
const monthKeySchema = z.string().regex(monthKeyRegex, 'Invalid month_key format. Use YYYY-MM.');
const isoDateSchema = z
  .string()
  .trim()
  .regex(dateRegex, 'Invalid date format. Use YYYY-MM-DD.');

const createBuildingSchema = z
  .object({
    // Allow single-character tower labels like "A" or "B".
    name: z.string().trim().min(1).max(180),
    address: z.string().trim().min(2).max(700),
    type: z.enum(BUILDING_TYPES),
    roomCount: z.coerce.number().int().min(1).max(5000).optional(),
    floorCount: z.coerce.number().int().min(1).max(300).optional(),
    roomsPerFloor: z.coerce.number().int().min(1).max(500).optional(),
    defaultRent: z.coerce.number().positive(),
    defaultDueDate: z
      .union([isoDateSchema, z.literal('')])
      .optional()
      .transform((value) => (value ? value : null)),
  })
  .superRefine((payload, ctx) => {
    const hasFloorFields = payload.floorCount !== undefined || payload.roomsPerFloor !== undefined;

    if (hasFloorFields) {
      if (!payload.floorCount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['floorCount'],
          message: 'floorCount is required when creating rooms floor-wise.',
        });
      }
      if (!payload.roomsPerFloor) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['roomsPerFloor'],
          message: 'roomsPerFloor is required when creating rooms floor-wise.',
        });
      }
      return;
    }

    if (!payload.roomCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['roomCount'],
        message: 'roomCount is required when floor-wise fields are not provided.',
      });
    }
  });

const listBuildingsQuerySchema = z.object({
  month: monthKeySchema.optional(),
  limit: z.coerce.number().int().min(1).max(300).optional().default(100),
});

const buildingDetailsQuerySchema = z.object({
  month: monthKeySchema.optional(),
});

const markBuildingSoldSchema = z.object({
  isSold: z.boolean().optional().default(true),
  soldNote: z
    .union([z.string().trim().max(1000), z.literal('')])
    .optional()
    .transform((value) => (value ? value : null)),
});

const rentAlertSchema = z.object({
  monthKey: monthKeySchema.optional(),
  message: z
    .union([z.string().trim().max(500), z.literal('')])
    .optional()
    .transform((value) => (value ? value : null)),
  includeOnlyUnpaid: z.boolean().optional().default(true),
  roomIds: z.array(uuidSchema).min(1).max(1000).optional(),
});

const generateRoomsSchema = z.object({
  count: z.coerce.number().int().min(1).max(1000),
  floorNumber: z.coerce.number().int().min(1).max(300),
  defaultRent: z.coerce.number().positive(),
  defaultDueDate: z
    .union([isoDateSchema, z.literal('')])
    .optional()
    .transform((value) => (value ? value : null)),
});

const updateRoomSchema = z
  .object({
    roomLabel: z.string().trim().min(1).max(80).optional(),
    floorNumber: z.coerce.number().int().min(1).max(300).optional(),
    rentAmount: z.coerce.number().positive().optional(),
    tenantName: z
      .union([z.string().trim().max(160), z.literal('')])
      .optional()
      .transform((value) => (value === '' ? null : value)),
    tenantPhone: z
      .union([z.string().trim().max(40), z.literal('')])
      .optional()
      .transform((value) => (value === '' ? null : value)),
    tenantJoinedOn: z
      .union([isoDateSchema, z.literal('')])
      .optional()
      .transform((value) => (value ? value : null)),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'Provide at least one room field to update.',
  });

const markPaidSchema = z.object({
  monthKey: monthKeySchema.optional(),
  dueDate: z
    .union([isoDateSchema, z.literal('')])
    .optional()
    .transform((value) => (value ? value : null)),
  paidDate: z
    .union([isoDateSchema, z.literal('')])
    .optional()
    .transform((value) => (value ? value : null)),
  amountPaid: z.coerce.number().positive().optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
});

const markUnpaidSchema = z.object({
  monthKey: monthKeySchema.optional(),
  dueDate: z
    .union([isoDateSchema, z.literal('')])
    .optional()
    .transform((value) => (value ? value : null)),
});

const rentHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(120).optional().default(24),
});

const bulkDeleteRoomsSchema = z.object({
  roomIds: z.array(uuidSchema).min(1).max(1000),
});

function getCurrentMonthKey() {
  const now = new Date();
  const month = `${now.getUTCMonth() + 1}`.padStart(2, '0');
  return `${now.getUTCFullYear()}-${month}`;
}

function getCurrentDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function getDaysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function getDueDayFromDate(value) {
  if (!value) return null;
  if (!dateRegex.test(value)) return null;
  const day = Number(value.slice(8, 10));
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  return day;
}

function getMonthParts(monthKey) {
  if (!monthKeyRegex.test(monthKey || '')) return null;
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  return { year, month };
}

function resolveDueDateForMonth(monthKey, dueDay) {
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) return null;
  const parts = getMonthParts(monthKey);
  if (!parts) return null;
  const day = Math.min(dueDay, getDaysInMonth(parts.year, parts.month));
  const dayText = String(day).padStart(2, '0');
  return `${monthKey}-${dayText}`;
}

function getNextMonthKey(monthKey) {
  const parts = getMonthParts(monthKey);
  if (!parts) return getCurrentMonthKey();
  const nextMonth = parts.month === 12 ? 1 : parts.month + 1;
  const nextYear = parts.month === 12 ? parts.year + 1 : parts.year;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
}

function calculatePenaltyAmount(rentAmount) {
  if (!Number.isFinite(rentAmount) || rentAmount <= 0 || APARTMENT_RENT_LATE_PENALTY_MULTIPLIER <= 0) {
    return 0;
  }
  const amount = rentAmount * APARTMENT_RENT_LATE_PENALTY_MULTIPLIER;
  return Math.round(amount * 100) / 100;
}

function shouldApplyPenaltyByDate(referenceDate, dueDate) {
  if (!referenceDate || !dueDate) return false;
  return referenceDate > dueDate;
}

function toNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const converted = Number(value);
  return Number.isFinite(converted) ? converted : null;
}

function cleanPhone(value) {
  if (!value || typeof value !== 'string') return '';
  return value.trim();
}

function formatCurrencyText(value) {
  const amount = toNumber(value) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function applyTemplate(template, variables) {
  if (!template) return '';
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    if (!(key in variables)) return match;
    const value = variables[key];
    return value === null || value === undefined ? '' : String(value);
  });
}

function buildRentAlertMessage({
  template,
  monthKey,
  roomLabel,
  tenantName,
  dueDate,
  payableAmount,
  penaltyAmount,
}) {
  const penaltyText =
    penaltyAmount > 0
      ? `Late penalty ${formatCurrencyText(penaltyAmount)} already added.`
      : 'If payment is delayed after due date, penalty will be added.';
  const fallback = `Rent alert from ${APP_NAME}: ${roomLabel} rent for ${monthKey} is due on ${
    dueDate || 'the due date'
  }. Pay ${formatCurrencyText(payableAmount)}. ${penaltyText}`;

  if (!template) {
    return fallback;
  }

  return applyTemplate(template, {
    app: APP_NAME,
    month: monthKey,
    room: roomLabel,
    tenant: tenantName || 'Tenant',
    dueDate: dueDate || '-',
    amount: formatCurrencyText(payableAmount),
    penalty: formatCurrencyText(penaltyAmount),
  });
}

function mapBuildingWithSummary(row) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    type: row.type,
    isSold: Boolean(row.is_sold),
    soldAt: row.sold_at || null,
    soldNote: row.sold_note || null,
    createdBy: Number(row.created_by),
    createdAt: row.created_at,
    totalFloors: Number(row.total_floors || 0),
    totalRooms: Number(row.total_rooms || 0),
    paidThisMonth: Number(row.paid_this_month || 0),
    pendingThisMonth: Number(row.pending_this_month || 0),
    totalCollectedThisMonth: toNumber(row.total_collected_this_month) || 0,
    totalPendingAmount: toNumber(row.total_pending_amount) || 0,
  };
}

function mapRoomRow(row) {
  const isRentApplicable = Boolean(row.is_rent_applicable);
  const status = row.status || (isRentApplicable ? 'unpaid' : 'not_applicable');
  return {
    id: row.id,
    buildingId: row.building_id,
    floorNumber: Number(row.floor_number || 1),
    roomLabel: row.room_label,
    rentAmount: toNumber(row.rent_amount) || 0,
    tenantName: row.tenant_name || '',
    tenantPhone: row.tenant_phone || '',
    tenantJoinedOn: row.tenant_joined_on || null,
    createdAt: row.created_at,
    currentMonthPayment: {
      id: row.payment_id || null,
      roomId: row.id,
      monthKey: row.month_key,
      status,
      dueDate: row.due_date,
      paidDate: row.paid_date,
      amountPaid: toNumber(row.amount_paid),
      penaltyAmount: toNumber(row.penalty_amount) || 0,
      paymentMethod: row.payment_method,
      updatedBy: row.updated_by == null ? null : Number(row.updated_by),
      updatedAt: row.updated_at || null,
    },
  };
}

function mapPaymentRow(row) {
  return {
    id: row.id,
    roomId: row.room_id,
    monthKey: row.month_key,
    status: row.status,
    dueDate: row.due_date,
    paidDate: row.paid_date,
    amountPaid: toNumber(row.amount_paid),
    penaltyAmount: toNumber(row.penalty_amount) || 0,
    paymentMethod: row.payment_method,
    updatedBy: row.updated_by == null ? null : Number(row.updated_by),
    updatedAt: row.updated_at,
  };
}

function canAccessAllComplexBuildings(user) {
  if (!user) return false;
  if (user.isMainAdmin) return true;

  const role = String(user.role || '').trim();
  if (role === 'admin') {
    return true;
  }

  const roleKeys = Array.isArray(user.roles) ? user.roles : [];
  return roleKeys.includes('admin') || roleKeys.includes('main_admin');
}

function getCreatorScopeUserId(user) {
  if (canAccessAllComplexBuildings(user)) {
    return null;
  }
  return Number(user?.id || 0);
}

function getDueDateSqlForMonth(alias, monthParamRef) {
  return `
    CASE
      WHEN ${alias}.rent_due_day IS NULL THEN NULL
      ELSE (
        to_date(${monthParamRef}::VARCHAR(7) || '-01', 'YYYY-MM-DD')
        + (
          LEAST(
            ${alias}.rent_due_day,
            EXTRACT(
              DAY FROM (
                date_trunc('month', to_date(${monthParamRef}::VARCHAR(7) || '-01', 'YYYY-MM-DD'))
                + INTERVAL '1 month - 1 day'
              )
            )::INT
          ) - 1
        )
      )::DATE
    END
  `;
}

function getRentApplicableSql(alias, monthParamRef) {
  return `${alias}.tenant_joined_on IS NOT NULL AND to_char(${alias}.tenant_joined_on, 'YYYY-MM') <= ${monthParamRef}::VARCHAR(7)`;
}

function toMonthKeyFromDateValue(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return /^\d{4}-\d{2}/.test(trimmed) ? trimmed.slice(0, 7) : null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 7);
  }
  return null;
}

async function ensureMonthlyRows(client, monthKey, updatedBy, options = {}) {
  const dueDateSql = getDueDateSqlForMonth('r', '$1');
  const rentApplicableSql = getRentApplicableSql('r', '$1');
  const values = [monthKey, updatedBy];
  const filters = [];

  if (options.buildingId) {
    values.push(options.buildingId);
    filters.push(`r.building_id = $${values.length}`);
  }
  if (options.roomId) {
    values.push(options.roomId);
    filters.push(`r.id = $${values.length}`);
  }
  if (options.createdByUserId) {
    values.push(options.createdByUserId);
    filters.push(
      `EXISTS (
        SELECT 1
        FROM buildings b
        WHERE b.id = r.building_id
          AND b.created_by = $${values.length}
      )`
    );
  }

  const filterSql = filters.length > 0 ? `AND ${filters.join(' AND ')}` : '';

  await client.query(
    `
      INSERT INTO rent_payments (
        room_id,
        month_key,
        status,
        due_date,
        penalty_amount,
        penalty_applied_at,
        updated_by,
        updated_at
      )
      SELECT
        r.id,
        $1::VARCHAR(7),
        'unpaid',
        ${dueDateSql},
        0,
        NULL,
        $2,
        NOW()
      FROM rooms r
      WHERE NOT EXISTS (
          SELECT 1
          FROM rent_payments rp
          WHERE rp.room_id = r.id
            AND rp.month_key = $1::VARCHAR(7)
        )
        AND (${rentApplicableSql})
        ${filterSql}
    `,
    values
  );
}

async function ensureMonthlyRowsForBuilding(client, buildingId, monthKey, updatedBy) {
  await ensureMonthlyRows(client, monthKey, updatedBy, { buildingId });
}

async function ensureMonthlyRowsForAllBuildings(client, monthKey, updatedBy, options = {}) {
  await ensureMonthlyRows(client, monthKey, updatedBy, options);
}

async function ensureMonthlyRowsForRoom(client, roomId, monthKey, updatedBy) {
  await ensureMonthlyRows(client, monthKey, updatedBy, { roomId });
}

async function applyOverduePenalty(client, updatedBy, options = {}) {
  if (APARTMENT_RENT_LATE_PENALTY_MULTIPLIER <= 0) {
    return;
  }

  const values = [APARTMENT_RENT_LATE_PENALTY_MULTIPLIER, updatedBy];
  const filters = [
    `rp.status = 'unpaid'`,
    `rp.due_date IS NOT NULL`,
    `rp.due_date < CURRENT_DATE`,
    `COALESCE(rp.penalty_amount, 0) <= 0`,
    getRentApplicableSql('r', 'rp.month_key'),
  ];

  if (options.monthKey) {
    values.push(options.monthKey);
    filters.push(`rp.month_key = $${values.length}`);
  }
  if (options.buildingId) {
    values.push(options.buildingId);
    filters.push(`r.building_id = $${values.length}`);
  }
  if (options.roomId) {
    values.push(options.roomId);
    filters.push(`r.id = $${values.length}`);
  }
  if (options.createdByUserId) {
    values.push(options.createdByUserId);
    filters.push(`b.created_by = $${values.length}`);
  }

  await client.query(
    `
      UPDATE rent_payments rp
      SET
        penalty_amount = ROUND((GREATEST(COALESCE(r.rent_amount, 0), 0)::NUMERIC * $1::NUMERIC), 2),
        penalty_applied_at = NOW(),
        updated_by = COALESCE($2::BIGINT, rp.updated_by),
        updated_at = NOW()
      FROM rooms r
      JOIN buildings b
        ON b.id = r.building_id
      WHERE rp.room_id = r.id
        AND ${filters.join('\n        AND ')}
    `,
    values
  );
}

async function fetchBuildingWithSummary(client, buildingId, monthKey, options = {}) {
  const values = [buildingId, monthKey];
  const rentApplicableSql = getRentApplicableSql('r', '$2');
  const ownerFilterSql = options.createdByUserId
    ? (() => {
        values.push(options.createdByUserId);
        return `AND b.created_by = $${values.length}`;
      })()
    : '';

  const rows = await client.query(
    `
      SELECT
        b.id,
        b.name,
        b.address,
        b.type,
        b.is_sold,
        b.sold_at,
        b.sold_note,
        b.created_by,
        b.created_at,
        COUNT(DISTINCT r.floor_number)::INT AS total_floors,
        COUNT(r.id)::INT AS total_rooms,
        COUNT(r.id) FILTER (
          WHERE (${rentApplicableSql}) AND COALESCE(rp.status, 'unpaid') = 'paid'
        )::INT AS paid_this_month,
        COUNT(r.id) FILTER (
          WHERE (${rentApplicableSql}) AND COALESCE(rp.status, 'unpaid') = 'unpaid'
        )::INT AS pending_this_month,
        COALESCE(
          SUM(
            CASE
              WHEN r.id IS NOT NULL
                AND (${rentApplicableSql})
                AND COALESCE(rp.status, 'unpaid') = 'paid'
                THEN COALESCE(rp.amount_paid, COALESCE(r.rent_amount, 0) + COALESCE(rp.penalty_amount, 0), 0)
              ELSE 0
            END
          ),
          0
        )::NUMERIC AS total_collected_this_month,
        COALESCE(
          SUM(
            CASE
              WHEN r.id IS NOT NULL
                AND (${rentApplicableSql})
                AND COALESCE(rp.status, 'unpaid') = 'unpaid'
                THEN GREATEST(
                  COALESCE(r.rent_amount, 0)
                  + COALESCE(rp.penalty_amount, 0)
                  - COALESCE(rp.amount_paid, 0),
                  0
                )
              ELSE 0
            END
          ),
          0
        )::NUMERIC AS total_pending_amount
      FROM buildings b
      LEFT JOIN rooms r
        ON r.building_id = b.id
      LEFT JOIN rent_payments rp
        ON rp.room_id = r.id
        AND rp.month_key = $2
        AND (${rentApplicableSql})
      WHERE b.id = $1
        ${ownerFilterSql}
      GROUP BY b.id
      LIMIT 1
    `,
    values
  );

  if (rows.rowCount === 0) {
    return null;
  }

  return mapBuildingWithSummary(rows.rows[0]);
}

router.use(requireAuth, requirePermission('manage_complex'));

router.post('/buildings', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const payload = createBuildingSchema.parse(req.body || {});
    const monthKey = getCurrentMonthKey();
    const defaultDueDay = getDueDayFromDate(payload.defaultDueDate);
    const defaultDueDate = resolveDueDateForMonth(monthKey, defaultDueDay);

    await client.query('BEGIN');

    const buildingInsert = await client.query(
      `
        INSERT INTO buildings (name, address, type, created_by)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `,
      [payload.name, payload.address, payload.type, req.user.id]
    );

    const buildingId = buildingInsert.rows[0].id;
    const floorCount = payload.floorCount || 1;
    const roomsPerFloor = payload.roomsPerFloor || payload.roomCount || 1;
    const totalRoomsToCreate = floorCount * roomsPerFloor;

    await client.query(
      `
        INSERT INTO rooms (building_id, floor_number, room_label, rent_amount, rent_due_day)
        SELECT
          $1,
          floor_idx,
          CONCAT('F', floor_idx, '-R', room_idx),
          $4,
          $5
        FROM generate_series(1, $2) AS floor_idx
        CROSS JOIN generate_series(1, $3) AS room_idx
      `,
      [buildingId, floorCount, roomsPerFloor, payload.defaultRent, defaultDueDay]
    );

    await client.query(
      `
        INSERT INTO rent_payments (
          room_id,
          month_key,
          status,
          due_date,
          penalty_amount,
          penalty_applied_at,
          updated_by,
          updated_at
        )
        SELECT
          r.id,
          $2,
          'unpaid',
          $3,
          0,
          NULL,
          $4,
          NOW()
        FROM rooms r
        WHERE r.building_id = $1
          AND (${getRentApplicableSql('r', '$2')})
        ON CONFLICT (room_id, month_key) DO NOTHING
      `,
      [buildingId, monthKey, defaultDueDate, req.user.id]
    );

    await applyOverduePenalty(client, req.user.id, { monthKey, buildingId });

    const building = await fetchBuildingWithSummary(client, buildingId, monthKey);

    await client.query('COMMIT');

    return res.status(201).json({
      message: `Building created and ${totalRoomsToCreate} rooms generated floor-wise.`,
      monthKey,
      building,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
});

router.get('/buildings', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const query = listBuildingsQuerySchema.parse({
      month: req.query.month,
      limit: req.query.limit,
    });
    const monthKey = query.month || getCurrentMonthKey();
    const creatorScopeUserId = getCreatorScopeUserId(req.user);

    await client.query('BEGIN');

    const scopeOptions = creatorScopeUserId ? { createdByUserId: creatorScopeUserId } : {};
    await ensureMonthlyRowsForAllBuildings(client, monthKey, req.user.id, scopeOptions);
    await applyOverduePenalty(client, req.user.id, { monthKey, ...scopeOptions });

    const queryValues = [monthKey, query.limit];
    const rentApplicableSql = getRentApplicableSql('r', '$1');
    const ownershipWhereSql = creatorScopeUserId
      ? (() => {
          queryValues.push(creatorScopeUserId);
          return `WHERE b.created_by = $${queryValues.length}`;
        })()
      : '';

    const rows = await client.query(
      `
        SELECT
          b.id,
          b.name,
          b.address,
          b.type,
          b.is_sold,
          b.sold_at,
          b.sold_note,
          b.created_by,
          b.created_at,
          COUNT(DISTINCT r.floor_number)::INT AS total_floors,
          COUNT(r.id)::INT AS total_rooms,
          COUNT(r.id) FILTER (
            WHERE (${rentApplicableSql}) AND COALESCE(rp.status, 'unpaid') = 'paid'
          )::INT AS paid_this_month,
          COUNT(r.id) FILTER (
            WHERE (${rentApplicableSql}) AND COALESCE(rp.status, 'unpaid') = 'unpaid'
          )::INT AS pending_this_month,
          COALESCE(
            SUM(
              CASE
                WHEN r.id IS NOT NULL
                  AND (${rentApplicableSql})
                  AND COALESCE(rp.status, 'unpaid') = 'paid'
                  THEN COALESCE(rp.amount_paid, COALESCE(r.rent_amount, 0) + COALESCE(rp.penalty_amount, 0), 0)
                ELSE 0
              END
            ),
            0
          )::NUMERIC AS total_collected_this_month,
          COALESCE(
            SUM(
              CASE
                WHEN r.id IS NOT NULL
                  AND (${rentApplicableSql})
                  AND COALESCE(rp.status, 'unpaid') = 'unpaid'
                  THEN GREATEST(
                    COALESCE(r.rent_amount, 0)
                    + COALESCE(rp.penalty_amount, 0)
                    - COALESCE(rp.amount_paid, 0),
                    0
                  )
                ELSE 0
              END
            ),
            0
          )::NUMERIC AS total_pending_amount
        FROM buildings b
        LEFT JOIN rooms r
          ON r.building_id = b.id
        LEFT JOIN rent_payments rp
          ON rp.room_id = r.id
          AND rp.month_key = $1
          AND (${rentApplicableSql})
        ${ownershipWhereSql}
        GROUP BY b.id
        ORDER BY b.created_at DESC
        LIMIT $2
      `,
      queryValues
    );

    await client.query('COMMIT');

    return res.json({
      monthKey,
      buildings: rows.rows.map(mapBuildingWithSummary),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
});

router.get('/buildings/:id', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const buildingId = uuidSchema.parse(req.params.id);
    const query = buildingDetailsQuerySchema.parse({
      month: req.query.month,
    });
    const monthKey = query.month || getCurrentMonthKey();
    const creatorScopeUserId = getCreatorScopeUserId(req.user);

    await client.query('BEGIN');

    const existsValues = [buildingId];
    const existsOwnerFilter = creatorScopeUserId
      ? (() => {
          existsValues.push(creatorScopeUserId);
          return `AND created_by = $${existsValues.length}`;
        })()
      : '';
    const exists = await client.query(
      `SELECT id FROM buildings WHERE id = $1 ${existsOwnerFilter} LIMIT 1`,
      existsValues
    );
    if (exists.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Building not found' });
    }

    await ensureMonthlyRowsForBuilding(client, buildingId, monthKey, req.user.id);
    await applyOverduePenalty(client, req.user.id, { monthKey, buildingId });

    const building = await fetchBuildingWithSummary(client, buildingId, monthKey, {
      createdByUserId: creatorScopeUserId,
    });
    const roomRentApplicableSql = getRentApplicableSql('r', '$2');

    const roomRows = await client.query(
      `
        SELECT
          r.id,
          r.building_id,
          r.floor_number,
          r.room_label,
          r.rent_amount,
          r.tenant_name,
          r.tenant_phone,
          r.tenant_joined_on,
          (${roomRentApplicableSql}) AS is_rent_applicable,
          r.created_at,
          rp.id AS payment_id,
          COALESCE(rp.month_key, $2::VARCHAR(7)) AS month_key,
          rp.status,
          rp.due_date,
          rp.paid_date,
          rp.amount_paid,
          rp.penalty_amount,
          rp.payment_method,
          rp.updated_by,
          rp.updated_at
        FROM rooms r
        LEFT JOIN rent_payments rp
          ON rp.room_id = r.id
         AND rp.month_key = $2
         AND (${roomRentApplicableSql})
        WHERE r.building_id = $1
        ORDER BY r.floor_number ASC, r.room_label ASC, r.created_at ASC
      `,
      [buildingId, monthKey]
    );

    await client.query('COMMIT');

    return res.json({
      monthKey,
      building,
      rooms: roomRows.rows.map(mapRoomRow),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
});

router.patch('/buildings/:id/sold', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const buildingId = uuidSchema.parse(req.params.id);
    const payload = markBuildingSoldSchema.parse(req.body || {});
    const monthKey = getCurrentMonthKey();
    const creatorScopeUserId = getCreatorScopeUserId(req.user);

    await client.query('BEGIN');

    const updateValues = [buildingId, payload.isSold, payload.soldNote, req.user.id];
    const ownerFilterSql = creatorScopeUserId
      ? (() => {
          updateValues.push(creatorScopeUserId);
          return `AND created_by = $${updateValues.length}`;
        })()
      : '';

    const rows = await client.query(
      `
        UPDATE buildings
        SET
          is_sold = $2,
          sold_at = CASE
            WHEN $2 = TRUE THEN COALESCE(sold_at, NOW())
            ELSE NULL
          END,
          sold_note = CASE
            WHEN $2 = TRUE THEN $3
            ELSE NULL
          END,
          sold_by = CASE
            WHEN $2 = TRUE THEN $4
            ELSE NULL
          END
        WHERE id = $1
          ${ownerFilterSql}
        RETURNING id
      `,
      updateValues
    );

    if (rows.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Building not found' });
    }

    await ensureMonthlyRowsForBuilding(client, buildingId, monthKey, req.user.id);
    await applyOverduePenalty(client, req.user.id, { monthKey, buildingId });

    const building = await fetchBuildingWithSummary(client, buildingId, monthKey, {
      createdByUserId: creatorScopeUserId,
    });

    await client.query('COMMIT');

    return res.json({
      message: payload.isSold ? 'Building marked as sold.' : 'Building sold mark removed.',
      monthKey,
      building,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
});

router.post('/buildings/:id/rent-alert', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const buildingId = uuidSchema.parse(req.params.id);
    const payload = rentAlertSchema.parse(req.body || {});
    const monthKey = payload.monthKey || getCurrentMonthKey();
    const roomIds = payload.roomIds ? Array.from(new Set(payload.roomIds)) : [];
    const creatorScopeUserId = getCreatorScopeUserId(req.user);

    await client.query('BEGIN');

    const buildingLookupValues = [buildingId];
    const buildingOwnerFilterSql = creatorScopeUserId
      ? (() => {
          buildingLookupValues.push(creatorScopeUserId);
          return `AND created_by = $${buildingLookupValues.length}`;
        })()
      : '';

    const buildingRows = await client.query(
      `
        SELECT id, name
        FROM buildings
        WHERE id = $1
          ${buildingOwnerFilterSql}
        LIMIT 1
      `,
      buildingLookupValues
    );
    if (buildingRows.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Building not found' });
    }

    await ensureMonthlyRowsForBuilding(client, buildingId, monthKey, req.user.id);
    await applyOverduePenalty(client, req.user.id, { monthKey, buildingId });
    const rentApplicableSql = getRentApplicableSql('r', '$2');

    const recipientRows = await client.query(
      `
        SELECT
          r.id,
          r.room_label,
          r.tenant_name,
          r.tenant_phone,
          r.rent_amount,
          COALESCE(rp.status, 'unpaid') AS status,
          rp.due_date,
          COALESCE(rp.penalty_amount, 0)::NUMERIC AS penalty_amount
        FROM rooms r
        LEFT JOIN rent_payments rp
          ON rp.room_id = r.id
         AND rp.month_key = $2
         AND (${rentApplicableSql})
        WHERE r.building_id = $1
          AND (${rentApplicableSql})
          AND TRIM(COALESCE(r.tenant_phone, '')) <> ''
          AND ($3::BOOLEAN = FALSE OR COALESCE(rp.status, 'unpaid') = 'unpaid')
          AND (
            COALESCE(array_length($4::UUID[], 1), 0) = 0
            OR r.id = ANY($4::UUID[])
          )
        ORDER BY r.floor_number ASC, r.room_label ASC
      `,
      [buildingId, monthKey, payload.includeOnlyUnpaid, roomIds]
    );

    await client.query('COMMIT');

    if (recipientRows.rowCount === 0) {
      return res.status(400).json({
        error: 'No tenant phone numbers found for alerting with current filters.',
      });
    }

    const delivered = [];
    const failed = [];

    for (const row of recipientRows.rows) {
      const phone = cleanPhone(row.tenant_phone);
      const penaltyAmount = toNumber(row.penalty_amount) || 0;
      const rentAmount = toNumber(row.rent_amount) || 0;
      const payableAmount = rentAmount + penaltyAmount;
      const messageBody = buildRentAlertMessage({
        template: payload.message,
        monthKey,
        roomLabel: row.room_label,
        tenantName: row.tenant_name || '',
        dueDate: row.due_date || '',
        payableAmount,
        penaltyAmount,
      });

      try {
        const sent = await sendSmsMessage({
          to: phone,
          body: messageBody,
          deliveryLabel: 'Apartment rent SMS alert',
        });
        if (!sent) {
          return res.status(503).json({
            error:
              'SMS delivery is not configured. Please set Twilio env values (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER).',
          });
        }
        delivered.push({
          roomId: row.id,
          roomLabel: row.room_label,
          tenantPhone: phone,
        });
      } catch (sendError) {
        failed.push({
          roomId: row.id,
          roomLabel: row.room_label,
          tenantPhone: phone,
          error: sendError instanceof Error ? sendError.message : 'SMS failed',
        });
      }
    }

    return res.json({
      message: `SMS alerts processed for ${recipientRows.rowCount} room(s).`,
      building: {
        id: buildingId,
        name: buildingRows.rows[0].name,
      },
      monthKey,
      deliveredCount: delivered.length,
      failedCount: failed.length,
      delivered,
      failed,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
});

router.post('/buildings/:id/rooms/generate', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const buildingId = uuidSchema.parse(req.params.id);
    const payload = generateRoomsSchema.parse(req.body || {});
    const monthKey = getCurrentMonthKey();
    const defaultDueDay = getDueDayFromDate(payload.defaultDueDate);
    const creatorScopeUserId = getCreatorScopeUserId(req.user);

    await client.query('BEGIN');

    const buildingLookupValues = [buildingId];
    const buildingOwnerFilterSql = creatorScopeUserId
      ? (() => {
          buildingLookupValues.push(creatorScopeUserId);
          return `AND created_by = $${buildingLookupValues.length}`;
        })()
      : '';

    const buildingRows = await client.query(
      `SELECT id FROM buildings WHERE id = $1 ${buildingOwnerFilterSql} LIMIT 1`,
      buildingLookupValues
    );
    if (buildingRows.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Building not found' });
    }

    const existingCountRows = await client.query(
      `
        SELECT COUNT(*)::INT AS total_rooms
        FROM rooms
        WHERE building_id = $1
          AND floor_number = $2
      `,
      [buildingId, payload.floorNumber]
    );
    const existingCount = Number(existingCountRows.rows[0]?.total_rooms || 0);

    const insertedRooms = await client.query(
      `
        WITH seq AS (
          SELECT generate_series(1, $2)::INT AS idx
        )
        INSERT INTO rooms (building_id, floor_number, room_label, rent_amount, rent_due_day)
        SELECT
          $1,
          $3,
          CONCAT('F', $3, '-R', $4 + idx),
          $5,
          $6
        FROM seq
        RETURNING id, floor_number, room_label, rent_amount
      `,
      [buildingId, payload.count, payload.floorNumber, existingCount, payload.defaultRent, defaultDueDay]
    );

    await applyOverduePenalty(client, req.user.id, { monthKey, buildingId });

    await client.query('COMMIT');

    return res.status(201).json({
      message: `${insertedRooms.rowCount} rooms generated on floor ${payload.floorNumber}.`,
      monthKey,
      rooms: insertedRooms.rows.map((row) => ({
        id: row.id,
        floorNumber: Number(row.floor_number || payload.floorNumber),
        roomLabel: row.room_label,
        rentAmount: toNumber(row.rent_amount) || 0,
      })),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
});

router.put('/rooms/:roomId', async (req, res, next) => {
  try {
    const roomId = uuidSchema.parse(req.params.roomId);
    const payload = updateRoomSchema.parse(req.body || {});
    const creatorScopeUserId = getCreatorScopeUserId(req.user);

    const lookupValues = [roomId];
    const lookupOwnerFilterSql = creatorScopeUserId
      ? (() => {
          lookupValues.push(creatorScopeUserId);
          return `AND b.created_by = $${lookupValues.length}`;
        })()
      : '';

    const existingRows = await pool.query(
      `
        SELECT
          r.id,
          r.tenant_name,
          r.tenant_phone,
          r.tenant_joined_on
        FROM rooms r
        JOIN buildings b
          ON b.id = r.building_id
        WHERE r.id = $1
          ${lookupOwnerFilterSql}
        LIMIT 1
      `,
      lookupValues
    );

    if (existingRows.rowCount === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const existing = existingRows.rows[0];
    const nextTenantName = payload.tenantName !== undefined ? payload.tenantName || null : existing.tenant_name;
    const nextTenantPhone = payload.tenantPhone !== undefined ? payload.tenantPhone || null : existing.tenant_phone;
    const hasTenantInfo = Boolean(
      String(nextTenantName || '').trim() || String(nextTenantPhone || '').trim()
    );

    let nextTenantJoinedOn = existing.tenant_joined_on || null;
    if (payload.tenantJoinedOn !== undefined) {
      nextTenantJoinedOn = payload.tenantJoinedOn || null;
    } else if (!hasTenantInfo) {
      nextTenantJoinedOn = null;
    } else if (!nextTenantJoinedOn) {
      nextTenantJoinedOn = getCurrentDateKey();
    }

    const updates = [];
    const values = [];

    if (payload.roomLabel !== undefined) {
      values.push(payload.roomLabel);
      updates.push(`room_label = $${values.length}`);
    }
    if (payload.floorNumber !== undefined) {
      values.push(payload.floorNumber);
      updates.push(`floor_number = $${values.length}`);
    }
    if (payload.rentAmount !== undefined) {
      values.push(payload.rentAmount);
      updates.push(`rent_amount = $${values.length}`);
    }
    if (payload.tenantName !== undefined) {
      values.push(payload.tenantName || null);
      updates.push(`tenant_name = $${values.length}`);
    }
    if (payload.tenantPhone !== undefined) {
      values.push(payload.tenantPhone || null);
      updates.push(`tenant_phone = $${values.length}`);
    }
    values.push(nextTenantJoinedOn || null);
    updates.push(`tenant_joined_on = $${values.length}`);

    const roomIdParamIndex = values.push(roomId);
    const ownerFilterSql = creatorScopeUserId
      ? (() => {
          const ownerParamIndex = values.push(creatorScopeUserId);
          return `AND b.created_by = $${ownerParamIndex}`;
        })()
      : '';

    const rows = await pool.query(
      `
        UPDATE rooms r
        SET ${updates.join(', ')}
        FROM buildings b
        WHERE r.id = $${roomIdParamIndex}
          AND b.id = r.building_id
          ${ownerFilterSql}
        RETURNING
          r.id,
          r.building_id,
          r.floor_number,
          r.room_label,
          r.rent_amount,
          r.tenant_name,
          r.tenant_phone,
          r.tenant_joined_on,
          r.created_at
      `,
      values
    );

    if (rows.rowCount === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const row = rows.rows[0];
    return res.json({
      room: {
        id: row.id,
        buildingId: row.building_id,
        floorNumber: Number(row.floor_number || 1),
        roomLabel: row.room_label,
        rentAmount: toNumber(row.rent_amount) || 0,
        tenantName: row.tenant_name || '',
        tenantPhone: row.tenant_phone || '',
        tenantJoinedOn: row.tenant_joined_on || null,
        createdAt: row.created_at,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.delete('/rooms/:roomId', async (req, res, next) => {
  try {
    const roomId = uuidSchema.parse(req.params.roomId);
    const creatorScopeUserId = getCreatorScopeUserId(req.user);

    const deleteValues = [roomId];
    const ownerFilterSql = creatorScopeUserId
      ? (() => {
          deleteValues.push(creatorScopeUserId);
          return `AND b.created_by = $${deleteValues.length}`;
        })()
      : '';

    const rows = await pool.query(
      `
        DELETE FROM rooms r
        USING buildings b
        WHERE r.id = $1
          AND b.id = r.building_id
          ${ownerFilterSql}
        RETURNING r.id, r.building_id, r.floor_number, r.room_label
      `,
      deleteValues
    );

    if (rows.rowCount === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const row = rows.rows[0];
    return res.json({
      message: 'Room deleted successfully.',
      room: {
        id: row.id,
        buildingId: row.building_id,
        floorNumber: Number(row.floor_number || 1),
        roomLabel: row.room_label,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/rooms/delete-bulk', async (req, res, next) => {
  try {
    const payload = bulkDeleteRoomsSchema.parse(req.body || {});
    const roomIds = Array.from(new Set(payload.roomIds));
    const creatorScopeUserId = getCreatorScopeUserId(req.user);

    const deleteValues = [roomIds];
    const ownerFilterSql = creatorScopeUserId
      ? (() => {
          deleteValues.push(creatorScopeUserId);
          return `AND b.created_by = $${deleteValues.length}`;
        })()
      : '';

    const rows = await pool.query(
      `
        DELETE FROM rooms r
        USING buildings b
        WHERE r.id = ANY($1::UUID[])
          AND b.id = r.building_id
          ${ownerFilterSql}
        RETURNING r.id, r.building_id, r.floor_number, r.room_label
      `,
      deleteValues
    );

    if (rows.rowCount === 0) {
      return res.status(404).json({ error: 'No matching rooms found to delete' });
    }

    return res.json({
      message: `${rows.rowCount} room(s) deleted successfully.`,
      deletedCount: rows.rowCount,
      deletedRooms: rows.rows.map((row) => ({
        id: row.id,
        buildingId: row.building_id,
        floorNumber: Number(row.floor_number || 1),
        roomLabel: row.room_label,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/rooms/:roomId/rent/mark-paid', async (req, res, next) => {
  const client = await pool.connect();
  let startedTx = false;
  try {
    const roomId = uuidSchema.parse(req.params.roomId);
    const payload = markPaidSchema.parse(req.body || {});
    const monthKey = payload.monthKey || getCurrentMonthKey();
    const creatorScopeUserId = getCreatorScopeUserId(req.user);

    await client.query('BEGIN');
    startedTx = true;

    const roomLookupValues = [roomId, monthKey];
    const roomOwnerFilterSql = creatorScopeUserId
      ? (() => {
          roomLookupValues.push(creatorScopeUserId);
          return `AND b.created_by = $${roomLookupValues.length}`;
        })()
      : '';

    const roomRows = await client.query(
      `
        SELECT
          r.id,
          r.rent_amount,
          r.rent_due_day,
          r.tenant_joined_on,
          rp.due_date AS existing_due_date
        FROM rooms r
        JOIN buildings b
          ON b.id = r.building_id
        LEFT JOIN rent_payments rp
          ON rp.room_id = r.id
         AND rp.month_key = $2
        WHERE r.id = $1
          ${roomOwnerFilterSql}
        LIMIT 1
        FOR UPDATE OF r
      `,
      roomLookupValues
    );

    if (roomRows.rowCount === 0) {
      await client.query('ROLLBACK');
      startedTx = false;
      return res.status(404).json({ error: 'Room not found' });
    }

    const room = roomRows.rows[0];
    const joinedMonthKey = toMonthKeyFromDateValue(room.tenant_joined_on);
    if (!joinedMonthKey || monthKey < joinedMonthKey) {
      await client.query('ROLLBACK');
      startedTx = false;
      return res.status(400).json({
        error: `Rent status starts from tenant join month (${joinedMonthKey || 'set join date first'}).`,
      });
    }
    const rentAmount = toNumber(room.rent_amount);
    const amountPaid = payload.amountPaid ?? rentAmount;
    if (!amountPaid || amountPaid <= 0) {
      await client.query('ROLLBACK');
      startedTx = false;
      return res.status(400).json({
        error: 'amountPaid is required and must be greater than zero',
      });
    }

    const existingDueDate = room.existing_due_date || null;
    const requestedDueDay = getDueDayFromDate(payload.dueDate);
    const requestedDueDateForMonth = requestedDueDay
      ? resolveDueDateForMonth(monthKey, requestedDueDay)
      : null;
    const persistedDueDay = toNumber(room.rent_due_day);
    const derivedDueDay = getDueDayFromDate(existingDueDate);
    const effectiveExistingDueDay = persistedDueDay || derivedDueDay;
    const dueDay = requestedDueDay || effectiveExistingDueDay;
    const resolvedDueDate =
      requestedDueDateForMonth || resolveDueDateForMonth(monthKey, dueDay) || existingDueDate;
    const paidDate = payload.paidDate || getCurrentDateKey();
    const paymentMethod = payload.paymentMethod || 'cash';
    const penaltyAmount = shouldApplyPenaltyByDate(paidDate, resolvedDueDate)
      ? calculatePenaltyAmount(rentAmount || 0)
      : 0;

    const dueDayToPersist = requestedDueDay || (!persistedDueDay ? derivedDueDay : null);
    if (dueDayToPersist && dueDayToPersist !== persistedDueDay) {
      await client.query(
        `
          UPDATE rooms
          SET rent_due_day = $2
          WHERE id = $1
        `,
        [roomId, dueDayToPersist]
      );
    }

    const rows = await client.query(
      `
        INSERT INTO rent_payments (
          room_id,
          month_key,
          status,
          due_date,
          paid_date,
          amount_paid,
          penalty_amount,
          penalty_applied_at,
          payment_method,
          updated_by,
          updated_at
        )
        VALUES ($1, $2, 'paid', $3, $4, $5, $6, CASE WHEN $6 > 0 THEN NOW() ELSE NULL END, $7, $8, NOW())
        ON CONFLICT (room_id, month_key)
        DO UPDATE SET
          status = 'paid',
          due_date = COALESCE(EXCLUDED.due_date, rent_payments.due_date),
          paid_date = EXCLUDED.paid_date,
          amount_paid = EXCLUDED.amount_paid,
          penalty_amount = EXCLUDED.penalty_amount,
          penalty_applied_at = CASE
            WHEN EXCLUDED.penalty_amount > 0 THEN COALESCE(rent_payments.penalty_applied_at, NOW())
            ELSE NULL
          END,
          payment_method = EXCLUDED.payment_method,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
        RETURNING id, room_id, month_key, status, due_date, paid_date, amount_paid, penalty_amount, payment_method, updated_by, updated_at
      `,
      [roomId, monthKey, resolvedDueDate, paidDate, amountPaid, penaltyAmount, paymentMethod, req.user.id]
    );

    await ensureMonthlyRowsForRoom(client, roomId, getNextMonthKey(monthKey), req.user.id);

    await client.query('COMMIT');
    startedTx = false;

    return res.json({
      message: 'Rent marked as paid.',
      payment: mapPaymentRow(rows.rows[0]),
    });
  } catch (error) {
    if (startedTx) {
      await client.query('ROLLBACK');
    }
    return next(error);
  } finally {
    client.release();
  }
});

router.post('/rooms/:roomId/rent/mark-unpaid', async (req, res, next) => {
  const client = await pool.connect();
  let startedTx = false;
  try {
    const roomId = uuidSchema.parse(req.params.roomId);
    const payload = markUnpaidSchema.parse(req.body || {});
    const monthKey = payload.monthKey || getCurrentMonthKey();
    const creatorScopeUserId = getCreatorScopeUserId(req.user);

    await client.query('BEGIN');
    startedTx = true;

    const roomLookupValues = [roomId, monthKey];
    const roomOwnerFilterSql = creatorScopeUserId
      ? (() => {
          roomLookupValues.push(creatorScopeUserId);
          return `AND b.created_by = $${roomLookupValues.length}`;
        })()
      : '';

    const roomRows = await client.query(
      `
        SELECT
          r.id,
          r.rent_amount,
          r.rent_due_day,
          r.tenant_joined_on,
          rp.due_date AS existing_due_date
        FROM rooms r
        JOIN buildings b
          ON b.id = r.building_id
        LEFT JOIN rent_payments rp
          ON rp.room_id = r.id
         AND rp.month_key = $2
        WHERE r.id = $1
          ${roomOwnerFilterSql}
        LIMIT 1
        FOR UPDATE OF r
      `,
      roomLookupValues
    );
    if (roomRows.rowCount === 0) {
      await client.query('ROLLBACK');
      startedTx = false;
      return res.status(404).json({ error: 'Room not found' });
    }

    const room = roomRows.rows[0];
    const joinedMonthKey = toMonthKeyFromDateValue(room.tenant_joined_on);
    if (!joinedMonthKey || monthKey < joinedMonthKey) {
      await client.query('ROLLBACK');
      startedTx = false;
      return res.status(400).json({
        error: `Rent status starts from tenant join month (${joinedMonthKey || 'set join date first'}).`,
      });
    }
    const existingDueDate = room.existing_due_date || null;
    const requestedDueDay = getDueDayFromDate(payload.dueDate);
    const requestedDueDateForMonth = requestedDueDay
      ? resolveDueDateForMonth(monthKey, requestedDueDay)
      : null;
    const persistedDueDay = toNumber(room.rent_due_day);
    const derivedDueDay = getDueDayFromDate(existingDueDate);
    const effectiveExistingDueDay = persistedDueDay || derivedDueDay;
    const dueDay = requestedDueDay || effectiveExistingDueDay;
    const resolvedDueDate =
      requestedDueDateForMonth || resolveDueDateForMonth(monthKey, dueDay) || existingDueDate;
    const penaltyAmount = shouldApplyPenaltyByDate(getCurrentDateKey(), resolvedDueDate)
      ? calculatePenaltyAmount(toNumber(room.rent_amount) || 0)
      : 0;

    const dueDayToPersist = requestedDueDay || (!persistedDueDay ? derivedDueDay : null);
    if (dueDayToPersist && dueDayToPersist !== persistedDueDay) {
      await client.query(
        `
          UPDATE rooms
          SET rent_due_day = $2
          WHERE id = $1
        `,
        [roomId, dueDayToPersist]
      );
    }

    const rows = await client.query(
      `
        INSERT INTO rent_payments (
          room_id,
          month_key,
          status,
          due_date,
          paid_date,
          amount_paid,
          penalty_amount,
          penalty_applied_at,
          payment_method,
          updated_by,
          updated_at
        )
        VALUES ($1, $2, 'unpaid', $3, NULL, NULL, $4, CASE WHEN $4 > 0 THEN NOW() ELSE NULL END, NULL, $5, NOW())
        ON CONFLICT (room_id, month_key)
        DO UPDATE SET
          status = 'unpaid',
          due_date = COALESCE(EXCLUDED.due_date, rent_payments.due_date),
          paid_date = NULL,
          amount_paid = NULL,
          penalty_amount = EXCLUDED.penalty_amount,
          penalty_applied_at = CASE
            WHEN EXCLUDED.penalty_amount > 0 THEN COALESCE(rent_payments.penalty_applied_at, NOW())
            ELSE NULL
          END,
          payment_method = NULL,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
        RETURNING id, room_id, month_key, status, due_date, paid_date, amount_paid, penalty_amount, payment_method, updated_by, updated_at
      `,
      [roomId, monthKey, resolvedDueDate, penaltyAmount, req.user.id]
    );

    await ensureMonthlyRowsForRoom(client, roomId, getNextMonthKey(monthKey), req.user.id);

    await client.query('COMMIT');
    startedTx = false;

    return res.json({
      message: 'Rent marked as unpaid.',
      payment: mapPaymentRow(rows.rows[0]),
    });
  } catch (error) {
    if (startedTx) {
      await client.query('ROLLBACK');
    }
    return next(error);
  } finally {
    client.release();
  }
});

router.get('/rooms/:roomId/rent/history', async (req, res, next) => {
  const client = await pool.connect();
  let startedTx = false;
  try {
    const roomId = uuidSchema.parse(req.params.roomId);
    const query = rentHistoryQuerySchema.parse({
      limit: req.query.limit,
    });
    const creatorScopeUserId = getCreatorScopeUserId(req.user);

    await client.query('BEGIN');
    startedTx = true;

    const roomLookupValues = [roomId];
    const roomOwnerFilterSql = creatorScopeUserId
      ? (() => {
          roomLookupValues.push(creatorScopeUserId);
          return `AND b.created_by = $${roomLookupValues.length}`;
        })()
      : '';

    const roomRows = await client.query(
      `
        SELECT r.id, r.room_label, r.building_id, r.floor_number
        FROM rooms r
        JOIN buildings b
          ON b.id = r.building_id
        WHERE r.id = $1
          ${roomOwnerFilterSql}
        LIMIT 1
      `,
      roomLookupValues
    );

    if (roomRows.rowCount === 0) {
      await client.query('ROLLBACK');
      startedTx = false;
      return res.status(404).json({ error: 'Room not found' });
    }

    await ensureMonthlyRowsForRoom(client, roomId, getCurrentMonthKey(), req.user.id);
    await applyOverduePenalty(client, req.user.id, { roomId });

    const paymentRows = await client.query(
      `
        SELECT
          id,
          room_id,
          month_key,
          status,
          due_date,
          paid_date,
          amount_paid,
          penalty_amount,
          payment_method,
          updated_by,
          updated_at
        FROM rent_payments
        WHERE room_id = $1
        ORDER BY month_key DESC
        LIMIT $2
      `,
      [roomId, query.limit]
    );

    await client.query('COMMIT');
    startedTx = false;

    return res.json({
      room: {
        id: roomRows.rows[0].id,
        roomLabel: roomRows.rows[0].room_label,
        buildingId: roomRows.rows[0].building_id,
        floorNumber: Number(roomRows.rows[0].floor_number || 1),
      },
      history: paymentRows.rows.map(mapPaymentRow),
    });
  } catch (error) {
    if (startedTx) {
      await client.query('ROLLBACK');
    }
    return next(error);
  } finally {
    client.release();
  }
});

router.get('/meta', async (req, res) => {
  return res.json({
    buildingTypes: BUILDING_TYPES,
    paymentMethods: PAYMENT_METHODS,
    statuses: STATUS_VALUES,
    monthKeyFormat: 'YYYY-MM',
    latePenaltyPercent: APARTMENT_RENT_LATE_PENALTY_PERCENT,
  });
});

export default router;
