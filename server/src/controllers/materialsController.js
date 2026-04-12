import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { requireAuth, requireMainAdmin, requirePermission } from '../middleware/auth.js';
import { createBillingReceipt, mapBillingOrderRow } from '../services/ownerBilling.js';
import {
  buildRazorpayCheckoutPayload,
  createRazorpayOrder,
  verifyRazorpayCheckoutSignature,
} from '../services/razorpay.js';
import {
  consumeDalalCoinHold,
  createDalalCoinHold,
  getDalalCoinQuoteForUser,
  getDalalCoinWallet,
  handleSuccessfulPaidDalalCoinOrder,
} from '../services/dalalCoinMvp.js';

const router = Router();

const sortValues = ['featured', 'price_asc', 'price_desc', 'delivery_fast'];

const uuidSchema = z.string().uuid();
const stockValues = ['in_stock', 'limited', 'out_of_stock'];
const reuseStatusValues = [
  'submitted',
  'under_review',
  'inspection_required',
  'inspection_not_required',
  'approved',
  'rejected',
  'picked_up',
  'closed',
];
const reuseAdminStatusValues = ['all', ...reuseStatusValues];
const sellerTypeValues = ['homeowner', 'builder', 'developer'];
const reuseMaterialCategoryValues = [
  'Structural & Raw',
  'Doors, Windows & Woodwork',
  'Tiles, Stone & Finishes',
  'Plumbing & Sanitary',
  'Electrical & Utility',
  'Demolition Mix & Salvage',
];

const reuseContactPhoneSchema = z
  .string()
  .trim()
  .min(7)
  .max(40)
  .refine((value) => {
    const digits = value.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 15;
  }, 'Contact phone must be a valid mobile or phone number.');

const reuseApproxQuantitySchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((value) => /\d/.test(value), 'Approximate quantity must include a number and unit.');

const reuseMaterialItemSchema = z.object({
  materialCategory: z.enum(reuseMaterialCategoryValues),
  materialName: z.string().trim().min(2).max(180),
  approxQuantity: reuseApproxQuantitySchema,
});

const listItemsQuerySchema = z.object({
  q: z.string().trim().optional(),
  category: z.string().trim().optional(),
  city: z.string().trim().optional(),
  sort: z.enum(sortValues).optional().default('featured'),
  limit: z.coerce.number().int().min(1).max(1000).optional().default(400),
});

const updatePhotoSchema = z.object({
  imageUrl: z
    .union([z.string().trim().url(), z.literal('')])
    .optional()
    .transform((value) => value || ''),
});

const createItemSchema = z.object({
  itemName: z.string().trim().min(2).max(200),
  category: z.string().trim().min(2).max(120),
  brand: z.string().trim().min(1).max(120),
  unit: z.string().trim().min(1).max(40),
  unitPrice: z.coerce.number().positive(),
  minOrderQty: z.coerce.number().int().min(1).max(100000).optional().default(1),
  deliveryDays: z.coerce.number().int().min(0).max(365).optional().default(2),
  locationCity: z.string().trim().min(2).max(120),
  imageUrl: z
    .union([z.string().trim().url(), z.literal('')])
    .optional()
    .transform((value) => value || ''),
  description: z.string().trim().max(2000).optional().default(''),
  bulkSlab1: z.string().trim().max(120).optional().default(''),
  bulkSlab2: z.string().trim().max(120).optional().default(''),
  stockStatus: z.enum(stockValues).optional().default('in_stock'),
});

const materialCheckoutItemSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(100000),
});

const materialCheckoutCreateSchema = z.object({
  items: z.array(materialCheckoutItemSchema).min(1).max(100),
  contactName: z.string().trim().min(2).max(120),
  contactPhone: reuseContactPhoneSchema,
  contactEmail: z.string().trim().email().max(190).optional().or(z.literal('')),
  shippingCity: z.string().trim().min(2).max(120),
  shippingAddress: z.string().trim().min(5).max(400),
  notes: z.string().trim().max(1000).optional().default(''),
  coinsRequested: z.coerce.number().int().min(0).optional().default(0),
});

const materialCheckoutVerifySchema = z.object({
  billingOrderId: z.coerce.number().int().positive(),
  ecommerceOrderId: z.coerce.number().int().positive(),
  razorpayOrderId: z.string().trim().min(6).max(120),
  razorpayPaymentId: z.string().trim().min(6).max(120),
  razorpaySignature: z.string().trim().min(20).max(255),
});

const materialOrdersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const createReuseRequestCommonSchema = z.object({
  sellerType: z.enum(sellerTypeValues).optional().default('homeowner'),
  locationCity: z.string().trim().min(2).max(120),
  locationAddress: z.string().trim().min(5).max(320),
  description: z.string().trim().max(2000).optional().default(''),
  photoUrls: z.array(z.string().trim().url()).min(1).max(8),
  contactName: z.string().trim().max(120).optional().default(''),
  contactPhone: reuseContactPhoneSchema,
  consentOwnership: z.literal(true),
  consentLegal: z.literal(true),
});

const createReuseRequestSchema = z
  .union([
    createReuseRequestCommonSchema.extend({
      materials: z.array(reuseMaterialItemSchema).min(1).max(8),
    }),
    createReuseRequestCommonSchema.extend({
      materialCategory: z.enum(reuseMaterialCategoryValues),
      materialName: z.string().trim().min(2).max(180),
      approxQuantity: reuseApproxQuantitySchema,
    }),
  ])
  .transform((payload) => {
    if ('materials' in payload) {
      return payload;
    }

    return {
      ...payload,
      materials: [
        {
          materialCategory: payload.materialCategory,
          materialName: payload.materialName,
          approxQuantity: payload.approxQuantity,
        },
      ],
    };
  });

const listMyReuseRequestsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
});

const listAdminReuseRequestsQuerySchema = z.object({
  status: z.enum(reuseAdminStatusValues).optional().default('all'),
  city: z.string().trim().optional(),
  q: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(250),
});

const updateReuseRequestStatusSchema = z.object({
  status: z.enum(reuseStatusValues),
  publicNote: z.string().trim().max(500).optional().default(''),
  internalNote: z.string().trim().max(1000).optional().default(''),
  valuationInr: z.coerce.number().min(0).max(1000000000).optional(),
});

function toNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapItemRow(row) {
  return {
    id: row.id,
    itemCode: row.item_code,
    itemName: row.item_name,
    category: row.category,
    brand: row.brand,
    unit: row.unit,
    unitPrice: toNumber(row.unit_price) || 0,
    minOrderQty: Number(row.min_order_qty || 1),
    deliveryDays: Number(row.delivery_days || 0),
    locationCity: row.location_city,
    imageUrl: row.image_url || null,
    description: row.description || '',
    bulkSlab1: row.bulk_slab_1 || '',
    bulkSlab2: row.bulk_slab_2 || '',
    stockStatus: row.stock_status,
  };
}

function roundCurrency(value) {
  return Math.round(((toNumber(value) || 0) + Number.EPSILON) * 100) / 100;
}

function calculateDeliveryAmount({ subtotal, totalUnits }) {
  const normalizedSubtotal = roundCurrency(subtotal);
  const normalizedUnits = Math.max(0, Number(totalUnits || 0));
  if (normalizedSubtotal >= 20000) {
    return 0;
  }
  return Math.min(1500, Math.max(250, normalizedUnits * 75));
}

function mapEcommerceOrderRow(row, items = null) {
  const resolvedItems = Array.isArray(items)
    ? items
    : Array.isArray(row.order_items)
      ? row.order_items
      : [];

  return {
    id: Number(row.id),
    orderReference: row.order_reference,
    userId: Number(row.user_id),
    billingOrderId: row.billing_order_id ? Number(row.billing_order_id) : null,
    status: row.status,
    totalAmount: roundCurrency(row.total_amount),
    subtotalAmount: roundCurrency(row.subtotal_amount),
    deliveryAmount: roundCurrency(row.delivery_amount),
    discountPercent: roundCurrency(row.discount_percent),
    coinsUsed: Number(row.coins_used || 0),
    coinDiscountAmount: roundCurrency(row.coin_discount_amount),
    finalAmount: roundCurrency(row.final_amount),
    contactName: row.contact_name || '',
    contactPhone: row.contact_phone || '',
    contactEmail: row.contact_email || '',
    shippingCity: row.shipping_city || '',
    shippingAddress: row.shipping_address || '',
    notes: row.notes || '',
    orderItems: resolvedItems,
    metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {},
    paidAt: row.paid_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildItemCode(itemName) {
  const cleaned = itemName
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  const timestampPart = Date.now().toString(36).toUpperCase().slice(-6);
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `MAT-${cleaned || 'ITEM'}-${timestampPart}${randomPart}`;
}

async function resolveVendorId(city) {
  const cityRows = await pool.query(
    `
      SELECT id
      FROM material_vendors
      WHERE LOWER(city) = LOWER($1)
      ORDER BY is_verified DESC, rating DESC, created_at ASC
      LIMIT 1
    `,
    [city]
  );

  if (cityRows.rowCount > 0) {
    return cityRows.rows[0].id;
  }

  const fallbackRows = await pool.query(
    `
      SELECT id
      FROM material_vendors
      ORDER BY is_verified DESC, rating DESC, created_at ASC
      LIMIT 1
    `
  );

  if (fallbackRows.rowCount > 0) {
    return fallbackRows.rows[0].id;
  }

  return null;
}

function buildReuseRequestCode() {
  const now = new Date();
  const year = String(now.getUTCFullYear()).slice(-2);
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ZCB-${year}${month}-${randomPart}`;
}

function normalizeReuseMaterialEntry(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const materialCategory =
    typeof value.materialCategory === 'string' ? value.materialCategory.trim() : '';
  const materialName = typeof value.materialName === 'string' ? value.materialName.trim() : '';
  const approxQuantity =
    typeof value.approxQuantity === 'string' ? value.approxQuantity.trim() : '';

  if (!materialCategory || !materialName || !approxQuantity) {
    return null;
  }

  return {
    materialCategory,
    materialName,
    approxQuantity,
  };
}

function normalizeReuseMaterials(rawValue, fallbackValue = null) {
  const normalized = (Array.isArray(rawValue) ? rawValue : [])
    .map((item) => normalizeReuseMaterialEntry(item))
    .filter(Boolean)
    .slice(0, 8);

  if (normalized.length > 0) {
    return normalized;
  }

  const fallback = normalizeReuseMaterialEntry(fallbackValue);
  return fallback ? [fallback] : [];
}

function reuseStatusLabel(status) {
  const labels = {
    submitted: 'Submitted',
    under_review: 'Under Review',
    inspection_required: 'Inspection Required',
    inspection_not_required: 'Inspection Not Required',
    approved: 'Approved',
    rejected: 'Rejected',
    picked_up: 'Picked Up',
    closed: 'Closed',
  };
  return labels[status] || 'Submitted';
}

function mapReuseRequestEventRow(row) {
  return {
    id: Number(row.id),
    requestId: row.request_id,
    status: row.status,
    statusLabel: reuseStatusLabel(row.status),
    note: row.note || '',
    createdByUserId: row.created_by_user_id ? Number(row.created_by_user_id) : null,
    createdByName: row.created_by_name || '',
    createdAt: row.created_at,
  };
}

function groupReuseRequestEvents(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const requestId = String(row.request_id || '');
    if (!requestId) {
      continue;
    }
    if (!grouped.has(requestId)) {
      grouped.set(requestId, []);
    }
    grouped.get(requestId).push(mapReuseRequestEventRow(row));
  }
  return grouped;
}

function mapReuseRequestRow(row, eventRows, includeAdminFields = false) {
  const photoUrls = Array.isArray(row.photo_urls)
    ? row.photo_urls
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];
  const materials = normalizeReuseMaterials(row.materials, {
    materialCategory: row.material_category,
    materialName: row.material_name,
    approxQuantity: row.approx_quantity,
  });
  const primaryMaterial = materials[0] || {
    materialCategory: '',
    materialName: '',
    approxQuantity: '',
  };

  const mapped = {
    id: row.id,
    requestCode: row.request_code,
    sellerType: row.seller_type,
    materials,
    materialCategory: primaryMaterial.materialCategory,
    materialName: primaryMaterial.materialName,
    approxQuantity: primaryMaterial.approxQuantity,
    locationCity: row.location_city,
    locationAddress: row.location_address,
    description: row.description || '',
    photoUrls,
    contactName: row.contact_name || '',
    contactPhone: row.contact_phone || '',
    status: row.status,
    statusLabel: reuseStatusLabel(row.status),
    adminPublicNote: row.admin_public_note || '',
    pickedUpAt: row.picked_up_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    events: eventRows || [],
  };

  if (!includeAdminFields) {
    return mapped;
  }

  return {
    ...mapped,
    valuationInr: toNumber(row.valuation_inr),
    adminInternalNote: row.admin_internal_note || '',
    submittedByUserId: row.submitted_by_user_id ? Number(row.submitted_by_user_id) : null,
    submittedByName: row.submitted_by_name || '',
    submittedByEmail: row.submitted_by_email || '',
  };
}

function summarizeReuseRequests(rows) {
  const summary = {
    total: 0,
    submitted: 0,
    underReview: 0,
    inspectionRequired: 0,
    inspectionNotRequired: 0,
    approved: 0,
    rejected: 0,
    pickedUp: 0,
    closed: 0,
  };

  for (const row of rows) {
    summary.total += 1;
    const status = String(row.status || '');
    if (status === 'submitted') summary.submitted += 1;
    if (status === 'under_review') summary.underReview += 1;
    if (status === 'inspection_required') summary.inspectionRequired += 1;
    if (status === 'inspection_not_required') summary.inspectionNotRequired += 1;
    if (status === 'approved') summary.approved += 1;
    if (status === 'rejected') summary.rejected += 1;
    if (status === 'picked_up') summary.pickedUp += 1;
    if (status === 'closed') summary.closed += 1;
  }

  return summary;
}

async function loadReuseRequestEvents(requestIds) {
  if (!Array.isArray(requestIds) || requestIds.length === 0) {
    return new Map();
  }

  const rows = await pool.query(
    `
      SELECT
        e.id,
        e.request_id,
        e.status,
        e.note,
        e.created_by_user_id,
        e.created_at,
        u.name AS created_by_name
      FROM material_reuse_request_events e
      LEFT JOIN users u
        ON u.id = e.created_by_user_id
      WHERE e.request_id = ANY($1::uuid[])
      ORDER BY e.created_at ASC, e.id ASC
    `,
    [requestIds]
  );

  return groupReuseRequestEvents(rows.rows || []);
}

router.get('/items', async (req, res, next) => {
  try {
    const query = listItemsQuerySchema.parse(req.query || {});
    const where = ['1=1'];
    const values = [];

    if (query.category) {
      values.push(query.category);
      where.push(`mi.category = $${values.length}`);
    }

    if (query.city) {
      values.push(query.city);
      where.push(`mi.location_city = $${values.length}`);
    }

    if (query.q) {
      values.push(`%${query.q}%`);
      const parameterRef = `$${values.length}`;
      where.push(`(
        mi.item_name ILIKE ${parameterRef}
        OR mi.brand ILIKE ${parameterRef}
        OR mi.category ILIKE ${parameterRef}
        OR mi.description ILIKE ${parameterRef}
      )`);
    }

    const sortSql =
      query.sort === 'price_asc'
        ? 'mi.unit_price ASC, mi.created_at DESC'
        : query.sort === 'price_desc'
          ? 'mi.unit_price DESC, mi.created_at DESC'
          : query.sort === 'delivery_fast'
            ? 'mi.delivery_days ASC, mi.created_at DESC'
            : 'mi.created_at DESC';

    values.push(query.limit);
    const limitRef = `$${values.length}`;

    const rows = await pool.query(
      `
        SELECT
          mi.id,
          mi.item_code,
          mi.item_name,
          mi.category,
          mi.brand,
          mi.unit,
          mi.unit_price,
          mi.min_order_qty,
          mi.delivery_days,
          mi.location_city,
          mi.image_url,
          mi.description,
          mi.bulk_slab_1,
          mi.bulk_slab_2,
          mi.stock_status
        FROM material_items mi
        WHERE ${where.join(' AND ')}
        ORDER BY ${sortSql}
        LIMIT ${limitRef}
      `,
      values
    );

    const countRows = await pool.query(
      `
        SELECT COUNT(*)::INT AS total
        FROM material_items mi
        WHERE ${where.join(' AND ')}
      `,
      values.slice(0, -1)
    );

    const filterRows = await pool.query(`
      SELECT
        COALESCE(array_agg(DISTINCT mi.category ORDER BY mi.category), '{}') AS categories,
        COALESCE(array_agg(DISTINCT mi.location_city ORDER BY mi.location_city), '{}') AS cities,
        COALESCE(array_agg(DISTINCT mi.brand ORDER BY mi.brand), '{}') AS brands
      FROM material_items mi
    `);

    const lastUpdatedRows = await pool.query('SELECT MAX(created_at) AS last_updated FROM material_items');

    return res.json({
      items: rows.rows.map(mapItemRow),
      filters: {
        categories: filterRows.rows[0]?.categories || [],
        cities: filterRows.rows[0]?.cities || [],
        brands: filterRows.rows[0]?.brands || [],
      },
      pagination: {
        total: Number(countRows.rows[0]?.total || 0),
        limit: query.limit,
      },
      lastUpdated: lastUpdatedRows.rows[0]?.last_updated || null,
      dataSource: 'ZDT Building Materials Catalog',
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/meta', async (req, res, next) => {
  try {
    const rows = await pool.query(`
      SELECT
        COALESCE(array_agg(DISTINCT mi.category ORDER BY mi.category), '{}') AS categories,
        COALESCE(array_agg(DISTINCT mi.location_city ORDER BY mi.location_city), '{}') AS cities,
        COALESCE(array_agg(DISTINCT mi.brand ORDER BY mi.brand), '{}') AS brands
      FROM material_items mi
    `);

    return res.json({
      categories: rows.rows[0]?.categories || [],
      cities: rows.rows[0]?.cities || [],
      brands: rows.rows[0]?.brands || [],
      sortValues,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/checkout/create', requireAuth, async (req, res, next) => {
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    const payload = materialCheckoutCreateSchema.parse(req.body || {});
    const normalizedItems = payload.items.map((item) => ({
      itemId: item.itemId,
      quantity: Number(item.quantity),
    }));
    const itemIds = Array.from(new Set(normalizedItems.map((item) => item.itemId)));

    const itemRows = await client.query(
      `
        SELECT
          id,
          item_code,
          item_name,
          category,
          brand,
          unit,
          unit_price,
          min_order_qty,
          stock_status,
          location_city
        FROM material_items
        WHERE id = ANY($1::uuid[])
      `,
      [itemIds]
    );

    if (itemRows.rowCount !== itemIds.length) {
      return res.status(404).json({ error: 'One or more material items were not found.' });
    }

    const itemMap = new Map(itemRows.rows.map((row) => [row.id, row]));
    let subtotal = 0;
    let totalUnits = 0;
    const orderItems = [];

    for (const requestedItem of normalizedItems) {
      const item = itemMap.get(requestedItem.itemId);
      if (!item) {
        return res.status(404).json({ error: 'One or more material items were not found.' });
      }

      if (String(item.stock_status || '').trim().toLowerCase() === 'out_of_stock') {
        return res.status(400).json({ error: `${item.item_name} is currently out of stock.` });
      }

      if (requestedItem.quantity < Number(item.min_order_qty || 1)) {
        return res.status(400).json({
          error: `${item.item_name} requires a minimum order quantity of ${Number(item.min_order_qty || 1)}.`,
        });
      }

      const lineSubtotal = roundCurrency((toNumber(item.unit_price) || 0) * requestedItem.quantity);
      subtotal = roundCurrency(subtotal + lineSubtotal);
      totalUnits += requestedItem.quantity;
      orderItems.push({
        itemId: item.id,
        itemCode: item.item_code,
        itemName: item.item_name,
        category: item.category,
        brand: item.brand,
        unit: item.unit,
        unitPrice: roundCurrency(item.unit_price),
        quantity: requestedItem.quantity,
        lineSubtotal,
        locationCity: item.location_city || '',
      });
    }

    const deliveryAmount = calculateDeliveryAmount({ subtotal, totalUnits });
    const dalalCoinQuote = await getDalalCoinQuoteForUser(client, req.user.id, {
      kind: 'ecommerce',
      baseAmount: subtotal,
      deliveryAmount,
      requestedCoins: payload.coinsRequested,
    });

    if (payload.coinsRequested > 0 && !dalalCoinQuote.phoneVerified) {
      return res.status(403).json({
        error: 'Phone verification is required before using Dalal Coins.',
      });
    }

    if (payload.coinsRequested > 0 && dalalCoinQuote.coinsApplied !== payload.coinsRequested) {
      return res.status(400).json({
        error: 'Requested Dalal Coins exceed your current ecommerce discount limit.',
        metadata: {
          requestedCoins: payload.coinsRequested,
          allowedCoins: dalalCoinQuote.coinsApplied,
          maxCoinsAllowed: dalalCoinQuote.maxCoinsAllowed,
          spendableCoins: dalalCoinQuote.spendableCoins,
        },
      });
    }

    const receipt = createBillingReceipt({
      prefix: 'MAT',
      userId: req.user.id,
      subject: 'materials',
    });
    const razorpayOrder = await createRazorpayOrder({
      amountInRupees: dalalCoinQuote.finalAmount,
      currency: 'INR',
      receipt,
      notes: {
        orderKind: 'ecommerce',
        userId: String(req.user.id),
        coinsUsed: String(dalalCoinQuote.coinsApplied),
      },
    });

    await client.query('BEGIN');
    transactionStarted = true;

    const billingOrderRows = await client.query(
      `
        INSERT INTO billing_orders (
          user_id,
          order_kind,
          provider,
          status,
          currency_code,
          amount,
          provider_order_id,
          provider_receipt,
          metadata,
          expires_at
        )
        VALUES (
          $1,
          'ecommerce',
          'razorpay',
          'created',
          $2,
          $3,
          $4,
          $5,
          $6::jsonb,
          NOW() + INTERVAL '1 day'
        )
        RETURNING *
      `,
      [
        req.user.id,
        razorpayOrder.currency || 'INR',
        dalalCoinQuote.finalAmount,
        razorpayOrder.id,
        receipt,
        JSON.stringify({
          razorpayOrderStatus: razorpayOrder.status || '',
          dalalCoin: {
            coinsUsed: dalalCoinQuote.coinsApplied,
            baseAmount: dalalCoinQuote.baseAmount,
            deliveryAmount: dalalCoinQuote.deliveryAmount,
            discountValue: dalalCoinQuote.discountValue,
            finalAmount: dalalCoinQuote.finalAmount,
            effectiveDiscountPercent: dalalCoinQuote.effectiveDiscountPercent,
          },
          shipping: {
            contactName: payload.contactName,
            contactPhone: payload.contactPhone,
            contactEmail: payload.contactEmail || '',
            shippingCity: payload.shippingCity,
          },
        }),
      ]
    );

    let billingOrder = billingOrderRows.rows[0];
    const ecommerceOrderRows = await client.query(
      `
        INSERT INTO ecommerce_orders (
          order_reference,
          user_id,
          billing_order_id,
          total_amount,
          subtotal_amount,
          delivery_amount,
          discount_percent,
          coins_used,
          coin_discount_amount,
          final_amount,
          status,
          order_items,
          contact_name,
          contact_phone,
          contact_email,
          shipping_city,
          shipping_address,
          notes,
          metadata
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          'created',
          $11::jsonb,
          $12,
          $13,
          $14,
          $15,
          $16,
          $17,
          $18::jsonb
        )
        RETURNING *
      `,
      [
        receipt,
        req.user.id,
        Number(billingOrder.id),
        roundCurrency(subtotal + deliveryAmount),
        subtotal,
        deliveryAmount,
        dalalCoinQuote.effectiveDiscountPercent,
        dalalCoinQuote.coinsApplied,
        dalalCoinQuote.discountValue,
        dalalCoinQuote.finalAmount,
        JSON.stringify(orderItems),
        payload.contactName,
        payload.contactPhone,
        payload.contactEmail || '',
        payload.shippingCity,
        payload.shippingAddress,
        payload.notes || '',
        JSON.stringify({
          totalUnits,
        }),
      ]
    );

    const ecommerceOrder = ecommerceOrderRows.rows[0];

    await Promise.all(
      orderItems.map((item) =>
        client.query(
          `
            INSERT INTO ecommerce_order_items (
              ecommerce_order_id,
              material_item_id,
              item_code,
              item_name,
              brand,
              unit,
              unit_price,
              quantity,
              line_subtotal
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `,
          [
            Number(ecommerceOrder.id),
            item.itemId,
            item.itemCode,
            item.itemName,
            item.brand,
            item.unit,
            item.unitPrice,
            item.quantity,
            item.lineSubtotal,
          ]
        )
      )
    );

    if (dalalCoinQuote.coinsApplied > 0) {
      const holdResult = await createDalalCoinHold(client, {
        userId: req.user.id,
        holdKind: 'ecommerce',
        baseAmount: subtotal,
        deliveryAmount,
        requestedCoins: payload.coinsRequested,
        billingOrderId: Number(billingOrder.id),
        ecommerceOrderId: Number(ecommerceOrder.id),
        metadata: {
          ecommerceOrderId: Number(ecommerceOrder.id),
          itemCount: orderItems.length,
          totalUnits,
        },
      });

      const updatedBillingOrderRows = await client.query(
        `
          UPDATE billing_orders
          SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
              updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [
          Number(billingOrder.id),
          JSON.stringify({
            dalalCoin: {
              ...(billingOrder.metadata?.dalalCoin || {}),
              holdId: Number(holdResult.hold.id),
              holdExpiresAt: holdResult.hold.expires_at,
            },
          }),
        ]
      );
      billingOrder = updatedBillingOrderRows.rows[0] || billingOrder;
    }

    await client.query('COMMIT');

    return res.status(201).json({
      ecommerceOrder: mapEcommerceOrderRow(ecommerceOrder, orderItems),
      billingOrder: mapBillingOrderRow(billingOrder),
      dalalCoinQuote,
      checkout: buildRazorpayCheckoutPayload({
        orderId: razorpayOrder.id,
        amountInRupees: dalalCoinQuote.finalAmount,
        currency: razorpayOrder.currency || 'INR',
        description: 'Building materials order',
        prefill: {
          name: payload.contactName,
          email: payload.contactEmail || req.user.email || '',
          contact: payload.contactPhone,
        },
        notes: {
          orderKind: 'ecommerce',
          ecommerceOrderId: String(ecommerceOrder.id),
        },
      }),
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK');
    }
    return next(error);
  } finally {
    client.release();
  }
});

router.post('/checkout/verify', requireAuth, async (req, res, next) => {
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    const payload = materialCheckoutVerifySchema.parse(req.body || {});
    await client.query('BEGIN');
    transactionStarted = true;

    const billingOrderRows = await client.query(
      `
        SELECT *
        FROM billing_orders
        WHERE id = $1
          AND user_id = $2
        LIMIT 1
        FOR UPDATE
      `,
      [payload.billingOrderId, req.user.id]
    );

    if (billingOrderRows.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Billing order not found.' });
    }

    const billingOrder = billingOrderRows.rows[0];
    if (billingOrder.order_kind !== 'ecommerce') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Billing order is not an ecommerce checkout.' });
    }

    if (
      billingOrder.provider_order_id &&
      String(billingOrder.provider_order_id) !== payload.razorpayOrderId
    ) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Checkout order mismatch.' });
    }

    const signatureVerified = verifyRazorpayCheckoutSignature({
      orderId: payload.razorpayOrderId,
      paymentId: payload.razorpayPaymentId,
      signature: payload.razorpaySignature,
    });
    if (!signatureVerified) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid Razorpay payment signature.' });
    }

    const ecommerceOrderRows = await client.query(
      `
        SELECT *
        FROM ecommerce_orders
        WHERE id = $1
          AND user_id = $2
          AND billing_order_id = $3
        LIMIT 1
        FOR UPDATE
      `,
      [payload.ecommerceOrderId, req.user.id, payload.billingOrderId]
    );

    if (ecommerceOrderRows.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ecommerce order not found.' });
    }

    const ecommerceOrder = ecommerceOrderRows.rows[0];
    const alreadyPaid = String(billingOrder.status || '').trim().toLowerCase() === 'paid';

    const updatedBillingOrderRows = await client.query(
      `
        UPDATE billing_orders
        SET
          status = 'paid',
          provider_payment_id = $2,
          provider_signature = $3,
          provider_last_event_type = 'checkout.verified',
          metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb,
          paid_at = COALESCE(paid_at, NOW()),
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [
        billingOrder.id,
        payload.razorpayPaymentId,
        payload.razorpaySignature,
        JSON.stringify({
          checkoutVerifiedAt: new Date().toISOString(),
        }),
      ]
    );

    const updatedBillingOrder = updatedBillingOrderRows.rows[0] || billingOrder;
    let dalalCoinRewards = null;

    if (!alreadyPaid) {
      const holdId = Number(updatedBillingOrder.metadata?.dalalCoin?.holdId || 0) || null;
      if (holdId) {
        await consumeDalalCoinHold(client, holdId, {
          expectedUserId: req.user.id,
          reasonCode: 'ecommerce_checkout_discount',
          referenceType: 'ecommerce_order',
          referenceId: `${ecommerceOrder.id}`,
          metadata: {
            billingOrderId: Number(updatedBillingOrder.id),
            ecommerceOrderId: Number(ecommerceOrder.id),
          },
        });
      }

      await client.query(
        `
          UPDATE ecommerce_orders
          SET status = 'paid',
              paid_at = COALESCE(paid_at, NOW()),
              updated_at = NOW()
          WHERE id = $1
        `,
        [ecommerceOrder.id]
      );

      dalalCoinRewards = await handleSuccessfulPaidDalalCoinOrder(client, {
        userId: req.user.id,
        orderKind: 'ecommerce',
        orderReference: `${ecommerceOrder.id}`,
        paidAmount: Number(updatedBillingOrder.amount || 0),
        subtotalAmount: Number(ecommerceOrder.subtotal_amount || 0),
        metadata: {
          billingOrderId: Number(updatedBillingOrder.id),
          ecommerceOrderId: Number(ecommerceOrder.id),
        },
      });
    }

    await client.query('COMMIT');

    const wallet = await getDalalCoinWallet(pool, req.user.id, {
      transactionLimit: 10,
    });

    return res.json({
      ok: true,
      message: 'Materials order payment verified.',
      billingOrder: mapBillingOrderRow(updatedBillingOrder),
      ecommerceOrder: mapEcommerceOrderRow({
        ...ecommerceOrder,
        status: 'paid',
        paid_at: new Date().toISOString(),
      }),
      dalalCoinRewards,
      wallet: wallet.wallet,
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK');
    }
    return next(error);
  } finally {
    client.release();
  }
});

router.get('/orders/mine', requireAuth, async (req, res, next) => {
  try {
    const query = materialOrdersQuerySchema.parse(req.query || {});
    const rows = await pool.query(
      `
        SELECT *
        FROM ecommerce_orders
        WHERE user_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2
      `,
      [req.user.id, query.limit]
    );

    return res.json({
      orders: rows.rows.map((row) => mapEcommerceOrderRow(row)),
    });
  } catch (error) {
    return next(error);
  }
});

router.post(
  '/admin/items',
  requireAuth,
  requireMainAdmin,
  requirePermission('manage_material_catalog'),
  async (req, res, next) => {
  try {
    const payload = createItemSchema.parse(req.body || {});
    const vendorId = await resolveVendorId(payload.locationCity);

    if (!vendorId) {
      return res.status(400).json({
        error: 'No material vendor configured. Add at least one vendor first.',
      });
    }

    let createdRow = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const itemCode = buildItemCode(payload.itemName);
      try {
        const rows = await pool.query(
          `
            INSERT INTO material_items (
              item_code,
              vendor_id,
              item_name,
              category,
              brand,
              unit,
              unit_price,
              min_order_qty,
              delivery_days,
              location_city,
              image_url,
              description,
              bulk_slab_1,
              bulk_slab_2,
              stock_status
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
            )
            RETURNING
              id,
              item_code,
              item_name,
              category,
              brand,
              unit,
              unit_price,
              min_order_qty,
              delivery_days,
              location_city,
              image_url,
              description,
              bulk_slab_1,
              bulk_slab_2,
              stock_status
          `,
          [
            itemCode,
            vendorId,
            payload.itemName,
            payload.category,
            payload.brand,
            payload.unit,
            payload.unitPrice,
            payload.minOrderQty,
            payload.deliveryDays,
            payload.locationCity,
            payload.imageUrl,
            payload.description,
            payload.bulkSlab1,
            payload.bulkSlab2,
            payload.stockStatus,
          ]
        );

        if (rows.rowCount > 0) {
          createdRow = rows.rows[0];
          break;
        }
      } catch (insertError) {
        if (insertError?.code === '23505') {
          continue;
        }
        throw insertError;
      }
    }

    if (!createdRow) {
      return res.status(500).json({
        error: 'Unable to generate unique item code. Please try again.',
      });
    }

    return res.status(201).json({
      message: 'Building material added successfully.',
      item: mapItemRow(createdRow),
    });
  } catch (error) {
    return next(error);
  }
  }
);

router.put(
  '/admin/items/:id/photo',
  requireAuth,
  requireMainAdmin,
  requirePermission('manage_material_catalog'),
  async (req, res, next) => {
  try {
    const itemId = uuidSchema.parse(req.params.id);
    const payload = updatePhotoSchema.parse(req.body || {});

    const rows = await pool.query(
      `
        UPDATE material_items
        SET image_url = $1
        WHERE id = $2
        RETURNING
          id,
          item_code,
          item_name,
          category,
          brand,
          unit,
          unit_price,
          min_order_qty,
          delivery_days,
          location_city,
          image_url,
          description,
          bulk_slab_1,
          bulk_slab_2,
          stock_status
      `,
      [payload.imageUrl, itemId]
    );

    if (rows.rowCount === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    return res.json({
      message: payload.imageUrl ? 'Product photo updated.' : 'Product photo removed.',
      item: mapItemRow(rows.rows[0]),
    });
  } catch (error) {
    return next(error);
  }
  }
);

router.post('/reuse-requests', requireAuth, async (req, res, next) => {
  try {
    const payload = createReuseRequestSchema.parse(req.body || {});
    const materials = normalizeReuseMaterials(payload.materials);
    const primaryMaterial = materials[0];
    if (!primaryMaterial) {
      return res.status(400).json({
        error: 'At least one valid material is required.',
      });
    }
    const photoUrls = Array.from(
      new Set(
        (payload.photoUrls || [])
          .map((item) => String(item || '').trim())
          .filter(Boolean)
          .slice(0, 8)
      )
    );

    let createdRow = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const requestCode = buildReuseRequestCode();
      try {
        const rows = await pool.query(
          `
            INSERT INTO material_reuse_requests (
              request_code,
              submitted_by_user_id,
              seller_type,
              material_category,
              material_name,
              approx_quantity,
              materials,
              location_city,
              location_address,
              description,
              photo_urls,
              contact_name,
              contact_phone,
              consent_ownership,
              consent_legal,
              status,
              admin_public_note,
              admin_internal_note
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11::jsonb, $12, $13, $14, $15, 'submitted', '', ''
            )
            RETURNING
              id,
              request_code,
              submitted_by_user_id,
              seller_type,
              material_category,
              material_name,
              approx_quantity,
              materials,
              location_city,
              location_address,
              description,
              photo_urls,
              contact_name,
              contact_phone,
              status,
              admin_public_note,
              valuation_inr,
              picked_up_at,
              closed_at,
              created_at,
              updated_at
          `,
          [
            requestCode,
            req.user?.id || null,
            payload.sellerType,
            primaryMaterial.materialCategory,
            primaryMaterial.materialName,
            primaryMaterial.approxQuantity,
            JSON.stringify(materials),
            payload.locationCity,
            payload.locationAddress,
            payload.description || '',
            JSON.stringify(photoUrls),
            payload.contactName || req.user?.name || '',
            payload.contactPhone,
            true,
            true,
          ]
        );

        if (rows.rowCount > 0) {
          createdRow = rows.rows[0];
          break;
        }
      } catch (insertError) {
        if (insertError?.code === '23505') {
          continue;
        }
        throw insertError;
      }
    }

    if (!createdRow) {
      return res.status(500).json({
        error: 'Unable to create request code. Please retry.',
      });
    }

    await pool.query(
      `
        INSERT INTO material_reuse_request_events (
          request_id,
          status,
          note,
          created_by_user_id
        )
        VALUES ($1, 'submitted', $2, $3)
      `,
      [createdRow.id, 'Request submitted via ZDT Circular Build.', req.user?.id || null]
    );

    const eventsByRequest = await loadReuseRequestEvents([createdRow.id]);

    return res.status(201).json({
      message: 'Submission received. ZDT Circular Build team will review shortly.',
      request: mapReuseRequestRow(
        createdRow,
        eventsByRequest.get(createdRow.id) || [],
        false
      ),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/reuse-requests/mine', requireAuth, async (req, res, next) => {
  try {
    const query = listMyReuseRequestsQuerySchema.parse(req.query || {});

    const rows = await pool.query(
      `
        SELECT
          id,
          request_code,
          submitted_by_user_id,
          seller_type,
          material_category,
          material_name,
          approx_quantity,
          materials,
          location_city,
          location_address,
          description,
          photo_urls,
          contact_name,
          contact_phone,
          status,
          admin_public_note,
          valuation_inr,
          picked_up_at,
          closed_at,
          created_at,
          updated_at
        FROM material_reuse_requests
        WHERE submitted_by_user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [req.user?.id || 0, query.limit]
    );

    const requestIds = rows.rows.map((row) => row.id);
    const eventsByRequest = await loadReuseRequestEvents(requestIds);

    return res.json({
      requests: rows.rows.map((row) =>
        mapReuseRequestRow(
          row,
          eventsByRequest.get(row.id) || [],
          false
        )
      ),
      summary: summarizeReuseRequests(rows.rows),
    });
  } catch (error) {
    return next(error);
  }
});

router.get(
  '/admin/reuse-requests',
  requireAuth,
  requirePermission('manage_material_catalog'),
  async (req, res, next) => {
    try {
      const query = listAdminReuseRequestsQuerySchema.parse(req.query || {});
      const where = ['1=1'];
      const values = [];

      if (query.status && query.status !== 'all') {
        values.push(query.status);
        where.push(`mrr.status = $${values.length}`);
      }

      if (query.city) {
        values.push(`%${query.city}%`);
        where.push(`mrr.location_city ILIKE $${values.length}`);
      }

      if (query.q) {
        values.push(`%${query.q}%`);
        const parameterRef = `$${values.length}`;
        where.push(`(
          mrr.request_code ILIKE ${parameterRef}
          OR mrr.material_name ILIKE ${parameterRef}
          OR mrr.material_category ILIKE ${parameterRef}
          OR mrr.materials::text ILIKE ${parameterRef}
          OR mrr.location_city ILIKE ${parameterRef}
          OR mrr.location_address ILIKE ${parameterRef}
          OR mrr.contact_name ILIKE ${parameterRef}
          OR mrr.contact_phone ILIKE ${parameterRef}
        )`);
      }

      values.push(query.limit);

      const rows = await pool.query(
        `
          SELECT
            mrr.id,
            mrr.request_code,
            mrr.submitted_by_user_id,
            mrr.seller_type,
            mrr.material_category,
            mrr.material_name,
            mrr.approx_quantity,
            mrr.materials,
            mrr.location_city,
            mrr.location_address,
            mrr.description,
            mrr.photo_urls,
            mrr.contact_name,
            mrr.contact_phone,
            mrr.status,
            mrr.admin_public_note,
            mrr.admin_internal_note,
            mrr.valuation_inr,
            mrr.picked_up_at,
            mrr.closed_at,
            mrr.created_at,
            mrr.updated_at,
            u.name AS submitted_by_name,
            u.email AS submitted_by_email
          FROM material_reuse_requests mrr
          LEFT JOIN users u
            ON u.id = mrr.submitted_by_user_id
          WHERE ${where.join(' AND ')}
          ORDER BY
            CASE mrr.status
              WHEN 'submitted' THEN 0
              WHEN 'under_review' THEN 1
              WHEN 'inspection_required' THEN 2
              WHEN 'inspection_not_required' THEN 3
              WHEN 'approved' THEN 4
              WHEN 'picked_up' THEN 5
              WHEN 'closed' THEN 6
              WHEN 'rejected' THEN 7
              ELSE 8
            END,
            mrr.created_at DESC
          LIMIT $${values.length}
        `,
        values
      );

      const requestIds = rows.rows.map((row) => row.id);
      const eventsByRequest = await loadReuseRequestEvents(requestIds);

      return res.json({
        requests: rows.rows.map((row) =>
          mapReuseRequestRow(
            row,
            eventsByRequest.get(row.id) || [],
            true
          )
        ),
        summary: summarizeReuseRequests(rows.rows),
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.patch(
  '/admin/reuse-requests/:id/status',
  requireAuth,
  requirePermission('manage_material_catalog'),
  async (req, res, next) => {
    const client = await pool.connect();
    try {
      const requestId = uuidSchema.parse(req.params.id);
      const payload = updateReuseRequestStatusSchema.parse(req.body || {});

      await client.query('BEGIN');

      const currentRows = await client.query(
        `
          SELECT id, request_code, status
          FROM material_reuse_requests
          WHERE id = $1
          FOR UPDATE
        `,
        [requestId]
      );

      if (currentRows.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Circular build request not found.' });
      }

      const previousStatus = currentRows.rows[0].status;
      const publicNote = payload.publicNote || '';
      const internalNote = payload.internalNote || '';
      const valuationInr = payload.valuationInr;

      const updatedRows = await client.query(
        `
          UPDATE material_reuse_requests
          SET
            status = $1,
            admin_public_note = $2,
            admin_internal_note = $3,
            valuation_inr = COALESCE($4, valuation_inr),
            picked_up_at = CASE
              WHEN $1 = 'picked_up' AND picked_up_at IS NULL THEN NOW()
              ELSE picked_up_at
            END,
            closed_at = CASE
              WHEN $1 = 'closed' AND closed_at IS NULL THEN NOW()
              ELSE closed_at
            END,
            updated_at = NOW()
          WHERE id = $5
          RETURNING
            id,
            request_code,
            submitted_by_user_id,
            seller_type,
            material_category,
            material_name,
            approx_quantity,
            materials,
            location_city,
            location_address,
            description,
            photo_urls,
            contact_name,
            contact_phone,
            status,
            admin_public_note,
            admin_internal_note,
            valuation_inr,
            picked_up_at,
            closed_at,
            created_at,
            updated_at
        `,
        [payload.status, publicNote, internalNote, valuationInr ?? null, requestId]
      );

      const updatedRow = updatedRows.rows[0];

      if (!updatedRow) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Circular build request not found.' });
      }

      if (previousStatus !== payload.status || publicNote) {
        await client.query(
          `
            INSERT INTO material_reuse_request_events (
              request_id,
              status,
              note,
              created_by_user_id
            )
            VALUES ($1, $2, $3, $4)
          `,
          [
            requestId,
            payload.status,
            publicNote || `Status moved to ${reuseStatusLabel(payload.status)}.`,
            req.user?.id || null,
          ]
        );
      }

      await client.query('COMMIT');

      const eventsByRequest = await loadReuseRequestEvents([requestId]);

      return res.json({
        message: `Request ${updatedRow.request_code} updated to ${reuseStatusLabel(payload.status)}.`,
        request: mapReuseRequestRow(
          updatedRow,
          eventsByRequest.get(requestId) || [],
          true
        ),
      });
    } catch (error) {
      await client.query('ROLLBACK');
      return next(error);
    } finally {
      client.release();
    }
  }
);

export default router;
