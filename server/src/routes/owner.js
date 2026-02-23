import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { enqueueNotificationDispatch } from '../services/queue/index.js';
import { sendEmailMessage } from '../services/otpDelivery.js';
import {
  extractGroupDealConfigFromLayout,
  mergeLayoutDetailsWithGroupDeal,
  normalizeListingGroupDealConfig,
  syncAutoGroupDealForProperty,
} from '../utils/groupDealAuto.js';

const router = Router();

const OWNER_ROLES = ['owner', 'agent', 'builder', 'admin'];
const OWNER_GROUP_DISCOUNT_TYPES = ['NONE', 'FLAT_DISCOUNT', 'PERCENT_DISCOUNT', 'CONFIRM_LATER'];

const OWNER_PROPERTY_SCHEMA = z.object({
  title: z.string().trim().min(4).max(220),
  description: z.string().trim().max(8000).optional().default(''),
  propertyType: z.string().trim().min(2).max(40),
  bhk: z.coerce.number().int().optional(),
  areaSqft: z.coerce.number().optional(),
  carpetArea: z.coerce.number().optional(),
  facing: z.string().trim().max(20).optional().default('NA'),
  floorNumber: z.coerce.number().int().optional(),
  totalFloors: z.coerce.number().int().optional(),
  state: z.string().trim().max(120).optional().default(''),
  city: z.string().trim().min(2).max(120),
  locality: z.string().trim().max(160).optional().default(''),
  address: z.string().trim().max(1000).optional().default(''),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  price: z.coerce.number().optional(),
  pricePerSqft: z.coerce.number().optional(),
  isNegotiable: z.boolean().optional().default(false),
  reraNumber: z.string().trim().max(80).optional().default(''),
  possessionStatus: z.string().trim().max(40).optional().default('ready'),
  groupInventoryCount: z.coerce.number().int().min(1).max(1000).optional().default(1),
  groupDealMinBuyers: z.coerce.number().int().min(2).max(500).optional().default(2),
  groupDealMaxBuyers: z.union([z.coerce.number().int().min(2).max(1000), z.null()]).optional().default(null),
  groupDiscountType: z.enum(OWNER_GROUP_DISCOUNT_TYPES).optional().default('NONE'),
  groupDiscountValue: z.union([z.coerce.number().positive(), z.null()]).optional().default(null),
  groupDealNote: z.string().trim().max(500).optional().default(''),
  amenities: z.array(z.string().trim().max(80)).optional().default([]),
  imageUrls: z.array(z.string().trim().max(1000)).optional().default([]),
  videoUrl: z.string().trim().max(1200).optional().default(''),
  tourUrl: z.string().trim().max(1200).optional().default(''),
});

const OWNER_PROPERTY_UPDATE_SCHEMA = z.object({
  title: z.string().trim().min(4).max(220).optional(),
  description: z.string().trim().max(8000).optional(),
  propertyType: z.string().trim().min(2).max(40).optional(),
  bhk: z.coerce.number().int().optional(),
  areaSqft: z.coerce.number().optional(),
  carpetArea: z.coerce.number().optional(),
  facing: z.string().trim().max(20).optional(),
  floorNumber: z.coerce.number().int().optional(),
  totalFloors: z.coerce.number().int().optional(),
  state: z.string().trim().max(120).optional(),
  city: z.string().trim().min(2).max(120).optional(),
  locality: z.string().trim().max(160).optional(),
  address: z.string().trim().max(1000).optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  price: z.coerce.number().optional(),
  pricePerSqft: z.coerce.number().optional(),
  isNegotiable: z.boolean().optional(),
  reraNumber: z.string().trim().max(80).optional(),
  possessionStatus: z.string().trim().max(40).optional(),
  groupInventoryCount: z.coerce.number().int().min(1).max(1000).optional(),
  groupDealMinBuyers: z.coerce.number().int().min(2).max(500).optional(),
  groupDealMaxBuyers: z.union([z.coerce.number().int().min(2).max(1000), z.null()]).optional(),
  groupDiscountType: z.enum(OWNER_GROUP_DISCOUNT_TYPES).optional(),
  groupDiscountValue: z.union([z.coerce.number().positive(), z.null()]).optional(),
  groupDealNote: z.string().trim().max(500).optional(),
  amenities: z.array(z.string().trim().max(80)).optional(),
  imageUrls: z.array(z.string().trim().max(1000)).optional(),
  videoUrl: z.string().trim().max(1200).optional(),
  tourUrl: z.string().trim().max(1200).optional(),
});

const OWNER_PROFILE_SCHEMA = z.object({
  displayName: z.string().trim().max(140).optional(),
  profilePhotoUrl: z.string().trim().max(1200).optional(),
  kycDocumentUrl: z.string().trim().max(1200).optional(),
  about: z.string().trim().max(2000).optional(),
  bankName: z.string().trim().max(120).optional(),
  bankAccount: z.string().trim().max(120).optional(),
  bankIfsc: z.string().trim().max(40).optional(),
});

const BOOST_SCHEMA = z.object({
  boostType: z.string().trim().min(2).max(80),
  amountPaid: z.coerce.number().nonnegative().default(0),
  startDate: z.string().trim().max(20).optional(),
  endDate: z.string().trim().max(20).optional(),
  listingType: z.enum(['property', 'rental']).optional().default('property'),
});

const SUBSCRIBE_SCHEMA = z.object({
  planName: z.string().trim().min(2).max(120),
  price: z.coerce.number().nonnegative(),
  startDate: z.string().trim().max(20).optional(),
  endDate: z.string().trim().max(20).optional(),
  provider: z.string().trim().max(60).optional(),
  paymentRef: z.string().trim().max(120).optional(),
});

const LEAD_UPDATE_SCHEMA = z.object({
  leadType: z.enum(['sale', 'rent']),
  status: z.enum(['new', 'contacted', 'closed']).optional(),
  notes: z.string().trim().max(2000).optional(),
});
const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RENT_RECORD_STATUSES = ['pending', 'partial', 'paid', 'overdue'];
const NOTIFICATION_CHANNELS = ['email', 'sms', 'in_app'];

const TENANT_RECORD_UPDATE_SCHEMA = z.object({
  tenantName: z.string().trim().max(140).optional(),
  tenantPhone: z.string().trim().max(32).optional(),
  tenantEmail: z.string().trim().email().max(190).or(z.literal('')).optional(),
  leaseStartDate: z
    .string()
    .trim()
    .regex(DATE_PATTERN, 'leaseStartDate must be YYYY-MM-DD')
    .or(z.literal(''))
    .optional(),
  leaseEndDate: z
    .string()
    .trim()
    .regex(DATE_PATTERN, 'leaseEndDate must be YYYY-MM-DD')
    .or(z.literal(''))
    .optional(),
  monthlyRent: z.union([z.coerce.number().nonnegative(), z.null()]).optional(),
  securityDeposit: z.union([z.coerce.number().nonnegative(), z.null()]).optional(),
  rentDueDay: z.coerce.number().int().min(1).max(31).optional(),
  notifyEnabled: z.boolean().optional(),
  notes: z.string().trim().max(4000).optional(),
});

const RENT_RECORD_CREATE_SCHEMA = z.object({
  monthKey: z.string().trim().regex(MONTH_KEY_PATTERN, 'monthKey must be YYYY-MM'),
  dueDate: z
    .string()
    .trim()
    .regex(DATE_PATTERN, 'dueDate must be YYYY-MM-DD')
    .or(z.literal(''))
    .optional(),
  amountDue: z.union([z.coerce.number().nonnegative(), z.null()]).optional(),
  amountReceived: z.union([z.coerce.number().nonnegative(), z.null()]).optional(),
  receivedOn: z
    .string()
    .trim()
    .regex(DATE_PATTERN, 'receivedOn must be YYYY-MM-DD')
    .or(z.literal(''))
    .optional(),
  status: z.enum(RENT_RECORD_STATUSES).optional(),
  paymentMethod: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(2000).optional(),
  notificationSent: z.boolean().optional(),
});

const RENT_RECORDS_QUERY_SCHEMA = z.object({
  limit: z.coerce.number().int().min(1).max(48).optional().default(12),
});

const REMINDER_SCHEMA = z.object({
  monthKey: z.string().trim().regex(MONTH_KEY_PATTERN, 'monthKey must be YYYY-MM').optional(),
  channel: z.enum(NOTIFICATION_CHANNELS).optional().default('email'),
  subject: z.string().trim().max(200).optional(),
  message: z.string().trim().min(4).max(1600).optional(),
});

function toNullableNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toNullableDate(value) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  return DATE_PATTERN.test(text) ? text : null;
}

async function hasColumn(tableName, columnName) {
  const rows = await pool.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1
    `,
    [tableName, columnName]
  );
  return rows.rowCount > 0;
}

function currentMonthKey() {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}`;
}

function normalizeMonthKey(value) {
  if (!value) return '';
  const normalized = String(value).trim();
  return MONTH_KEY_PATTERN.test(normalized) ? normalized : '';
}

function deriveRentStatus(amountDue, amountReceived, dueDate) {
  const due = Number.isFinite(Number(amountDue)) ? Number(amountDue) : 0;
  const received = Number.isFinite(Number(amountReceived)) ? Number(amountReceived) : 0;
  if (due <= 0) {
    return received > 0 ? 'paid' : 'pending';
  }
  if (received >= due) return 'paid';
  if (received > 0 && received < due) return 'partial';
  if (dueDate) {
    const dueDateTime = new Date(`${dueDate}T00:00:00.000Z`).getTime();
    if (!Number.isNaN(dueDateTime) && dueDateTime < Date.now()) {
      return 'overdue';
    }
  }
  return 'pending';
}

function mapTenantRecord(row, fallback = {}) {
  return {
    id: row?.id ? Number(row.id) : null,
    rentalId: row?.rental_id ? Number(row.rental_id) : Number(fallback.rentalId || 0) || null,
    ownerId: row?.owner_id ? Number(row.owner_id) : Number(fallback.ownerId || 0) || null,
    tenantName: row?.tenant_name || '',
    tenantPhone: row?.tenant_phone || '',
    tenantEmail: row?.tenant_email || '',
    leaseStartDate: row?.lease_start_date || fallback.leaseStartDate || null,
    leaseEndDate: row?.lease_end_date || null,
    monthlyRent: row?.monthly_rent === null || row?.monthly_rent === undefined
      ? fallback.monthlyRent ?? null
      : Number(row.monthly_rent),
    securityDeposit: row?.security_deposit === null || row?.security_deposit === undefined
      ? fallback.securityDeposit ?? null
      : Number(row.security_deposit),
    rentDueDay: row?.rent_due_day === null || row?.rent_due_day === undefined ? 5 : Number(row.rent_due_day),
    notifyEnabled: row?.notify_enabled === null || row?.notify_enabled === undefined ? true : Boolean(row.notify_enabled),
    notes: row?.notes || '',
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  };
}

function mapRentRecord(row) {
  return {
    id: Number(row.id),
    tenantRecordId: row.tenant_record_id ? Number(row.tenant_record_id) : null,
    rentalId: Number(row.rental_id),
    ownerId: Number(row.owner_id),
    monthKey: row.month_key,
    dueDate: row.due_date || null,
    amountDue: row.amount_due === null ? null : Number(row.amount_due),
    amountReceived: row.amount_received === null ? null : Number(row.amount_received),
    receivedOn: row.received_on || null,
    status: row.status,
    paymentMethod: row.payment_method || '',
    notes: row.notes || '',
    notificationSent: Boolean(row.notification_sent),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findOwnerRental(rentalId, ownerId) {
  const rows = await pool.query(
    `
      SELECT id, title, monthly_rent, security_deposit, available_from, posted_by
      FROM rentals
      WHERE id = $1
        AND posted_by = $2
      LIMIT 1
    `,
    [rentalId, ownerId]
  );
  if (rows.rowCount === 0) return null;
  return rows.rows[0];
}

async function ensureOwnerProfile(userId) {
  const profileRows = await pool.query('SELECT * FROM owner_profiles WHERE user_id = $1 LIMIT 1', [userId]);
  if (profileRows.rowCount > 0) {
    return profileRows.rows[0];
  }

  const userRows = await pool.query('SELECT name, email FROM users WHERE id = $1 LIMIT 1', [userId]);
  const user = userRows.rows[0] || { name: 'Owner', email: '' };
  const code = `owner-${userId}`;
  const companyRows = await pool.query(
    `
      INSERT INTO companies (code, name, company_type, email, created_by_user_id)
      VALUES ($1, $2, 'owner', $3, $4)
      ON CONFLICT (code)
      DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, updated_at = NOW()
      RETURNING id
    `,
    [code, `${user.name} Properties`, user.email || '', userId]
  );
  const companyId = Number(companyRows.rows[0].id);

  const inserted = await pool.query(
    `
      INSERT INTO owner_profiles (user_id, company_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id) DO UPDATE SET company_id = EXCLUDED.company_id
      RETURNING *
    `,
    [userId, companyId]
  );

  return inserted.rows[0];
}

function mapOwnerProperty(row) {
  const groupDeal = extractGroupDealConfigFromLayout(row.layout_details || {});
  return {
    id: Number(row.id),
    title: row.title,
    description: row.description || '',
    propertyType: row.property_type,
    listingType: row.listing_type,
    price: row.price === null ? null : Number(row.price),
    pricePerSqft: row.price_per_sqft === null ? null : Number(row.price_per_sqft),
    state: row.state || '',
    city: row.city,
    locality: row.locality,
    address: row.address,
    areaSqft: row.area_sqft === null ? null : Number(row.area_sqft),
    carpetArea: row.carpet_area === null ? null : Number(row.carpet_area),
    bedrooms: row.bedrooms,
    floorNumber: row.floor_number,
    totalFloors: row.total_floors,
    facing: row.facing,
    isNegotiable: Boolean(row.is_negotiable),
    reraNumber: row.rera_number,
    possessionStatus: row.possession_status,
    isVerified: Boolean(row.is_verified),
    isFeatured: Boolean(row.is_featured),
    viewCount: Number(row.view_count || 0),
    imageUrls: Array.isArray(row.image_urls) ? row.image_urls : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    layoutDetails: row.layout_details || {},
    groupDeal,
  };
}

router.use(requireAuth, requireRole(...OWNER_ROLES));

router.get('/profile', async (req, res, next) => {
  try {
    const profile = await ensureOwnerProfile(req.user.id);
    const userRows = await pool.query(
      'SELECT name, email, phone, kyc_verified FROM users WHERE id = $1 LIMIT 1',
      [req.user.id]
    );
    const user = userRows.rows[0] || {};

    return res.json({
      profile: {
        id: Number(profile.id),
        userId: Number(profile.user_id),
        companyId: Number(profile.company_id),
        kycVerified: Boolean(profile.kyc_verified),
        rating: profile.rating === null ? null : Number(profile.rating),
        totalListings: Number(profile.total_listings || 0),
        subscriptionPlan: profile.subscription_plan || 'free',
        displayName: profile.display_name || user.name || '',
        profilePhotoUrl: profile.profile_photo_url || '',
        kycDocumentUrl: profile.kyc_document_url || '',
        about: profile.about || '',
        bankName: profile.bank_name || '',
        bankAccount: profile.bank_account || '',
        bankIfsc: profile.bank_ifsc || '',
        email: user.email || '',
        phone: user.phone || '',
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.put('/profile', async (req, res, next) => {
  try {
    const payload = OWNER_PROFILE_SCHEMA.parse(req.body || {});
    await ensureOwnerProfile(req.user.id);

    await pool.query(
      `
        UPDATE owner_profiles
        SET
          display_name = COALESCE($1, display_name),
          profile_photo_url = COALESCE($2, profile_photo_url),
          kyc_document_url = COALESCE($3, kyc_document_url),
          about = COALESCE($4, about),
          bank_name = COALESCE($5, bank_name),
          bank_account = COALESCE($6, bank_account),
          bank_ifsc = COALESCE($7, bank_ifsc),
          updated_at = NOW()
        WHERE user_id = $8
      `,
      [
        payload.displayName ?? null,
        payload.profilePhotoUrl ?? null,
        payload.kycDocumentUrl ?? null,
        payload.about ?? null,
        payload.bankName ?? null,
        payload.bankAccount ?? null,
        payload.bankIfsc ?? null,
        req.user.id,
      ]
    );

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.get('/properties', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 24, 1), 60);
    const offset = (page - 1) * limit;

    const rows = await pool.query(
      `
        SELECT *, COUNT(*) OVER() AS total_count
        FROM properties
        WHERE listing_type = 'sale'
          AND posted_by = $1
        ORDER BY created_at DESC
        LIMIT $2
        OFFSET $3
      `,
      [req.user.id, limit, offset]
    );

    const total = rows.rowCount > 0 ? Number(rows.rows[0].total_count || 0) : 0;
    return res.json({
      properties: rows.rows.map(mapOwnerProperty),
      total,
      page,
      pageSize: limit,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/properties/:id', async (req, res, next) => {
  try {
    const propertyId = Number(req.params.id);
    if (!Number.isFinite(propertyId) || propertyId <= 0) {
      return res.status(400).json({ error: 'Invalid property id' });
    }

    const rows = await pool.query(
      `SELECT * FROM properties WHERE id = $1 AND posted_by = $2 LIMIT 1`,
      [propertyId, req.user.id]
    );

    if (rows.rowCount === 0) {
      return res.status(404).json({ error: 'Property not found' });
    }

    return res.json({ property: mapOwnerProperty(rows.rows[0]) });
  } catch (error) {
    return next(error);
  }
});

router.post('/properties', async (req, res, next) => {
  try {
    const payload = OWNER_PROPERTY_SCHEMA.parse(req.body || {});
    const profile = await ensureOwnerProfile(req.user.id);

    const fullAddress = [payload.address, payload.locality, payload.city].filter(Boolean).join(', ');
    const groupDealConfig = normalizeListingGroupDealConfig(payload);
    const layoutDetails = mergeLayoutDetailsWithGroupDeal({
      amenities: payload.amenities || [],
      media: { videoUrl: payload.videoUrl || '', tourUrl: payload.tourUrl || '' },
    }, groupDealConfig);

    const inserted = await pool.query(
      `
        INSERT INTO properties (
          company_id,
          title,
          property_type,
          listing_type,
          price,
          price_per_sqft,
          state,
          city,
          area,
          locality,
          address,
          full_address,
          latitude,
          longitude,
          area_sqft,
          carpet_area,
          bedrooms,
          floor_number,
          total_floors,
          facing,
          possession_status,
          rera_number,
          is_negotiable,
          image_urls,
          description,
          layout_details,
          posted_by,
          created_by_user_id
        )
        VALUES (
          $1,$2,$3,'sale',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26
        )
        RETURNING *
      `,
      [
        profile.company_id,
        payload.title,
        payload.propertyType,
        toNullableNumber(payload.price),
        toNullableNumber(payload.pricePerSqft),
        payload.state || payload.city,
        payload.city,
        payload.locality || payload.city,
        payload.locality || '',
        payload.address || '',
        fullAddress,
        toNullableNumber(payload.latitude),
        toNullableNumber(payload.longitude),
        toNullableNumber(payload.areaSqft),
        toNullableNumber(payload.carpetArea),
        payload.bhk ?? null,
        payload.floorNumber ?? null,
        payload.totalFloors ?? null,
        payload.facing || 'NA',
        payload.possessionStatus || 'ready',
        payload.reraNumber || '',
        Boolean(payload.isNegotiable),
        payload.imageUrls || [],
        payload.description || '',
        layoutDetails,
        req.user.id,
        req.user.id,
      ]
    );

    const companyRows = await pool.query(
      `
        SELECT name, is_verified
        FROM companies
        WHERE id = $1
        LIMIT 1
      `,
      [Number(profile.company_id)]
    );
    const company = companyRows.rows[0] || { name: 'Seller', is_verified: false };
    await syncAutoGroupDealForProperty(pool, {
      propertyId: Number(inserted.rows[0].id),
      listingType: 'sale',
      title: payload.title,
      state: payload.state || payload.city,
      city: payload.city,
      propertyType: payload.propertyType,
      bedrooms: payload.bhk ?? null,
      basePrice: payload.price ?? null,
      builderName: company.name || 'Seller',
      builderVerified: Boolean(company.is_verified),
      groupDealConfig,
    });

    await pool.query(
      `
        UPDATE owner_profiles
        SET total_listings = COALESCE(total_listings, 0) + 1,
            updated_at = NOW()
        WHERE user_id = $1
      `,
      [req.user.id]
    );

    return res.status(201).json({ property: mapOwnerProperty(inserted.rows[0]) });
  } catch (error) {
    return next(error);
  }
});

router.put('/properties/:id', async (req, res, next) => {
  try {
    const propertyId = Number(req.params.id);
    if (!Number.isFinite(propertyId) || propertyId <= 0) {
      return res.status(400).json({ error: 'Invalid property id' });
    }

    const payload = OWNER_PROPERTY_UPDATE_SCHEMA.parse(req.body || {});
    if (!payload || Object.keys(payload).length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    const rows = await pool.query(
      `
        SELECT
          id,
          title,
          property_type,
          listing_type,
          price,
          state,
          city,
          bedrooms,
          company_id,
          layout_details
        FROM properties
        WHERE id = $1
          AND posted_by = $2
        LIMIT 1
      `,
      [propertyId, req.user.id]
    );
    if (rows.rowCount === 0) {
      return res.status(404).json({ error: 'Property not found' });
    }
    const currentRow = rows.rows[0];

    const updates = [];
    const values = [];
    const pushUpdate = (column, value) => {
      if (value === undefined) return;
      values.push(value);
      updates.push(`${column} = $${values.length}`);
    };

    pushUpdate('title', payload.title);
    pushUpdate('description', payload.description);
    pushUpdate('property_type', payload.propertyType);
    pushUpdate('price', payload.price === undefined ? undefined : toNullableNumber(payload.price));
    pushUpdate('price_per_sqft', payload.pricePerSqft === undefined ? undefined : toNullableNumber(payload.pricePerSqft));
    pushUpdate('city', payload.city);
    pushUpdate('locality', payload.locality);
    pushUpdate('address', payload.address);
    pushUpdate('state', payload.state);
    pushUpdate('area', payload.locality || payload.city);
    pushUpdate('full_address', payload.address || payload.locality || payload.city);
    pushUpdate('latitude', payload.latitude === undefined ? undefined : toNullableNumber(payload.latitude));
    pushUpdate('longitude', payload.longitude === undefined ? undefined : toNullableNumber(payload.longitude));
    pushUpdate('area_sqft', payload.areaSqft === undefined ? undefined : toNullableNumber(payload.areaSqft));
    pushUpdate('carpet_area', payload.carpetArea === undefined ? undefined : toNullableNumber(payload.carpetArea));
    pushUpdate('bedrooms', payload.bhk);
    pushUpdate('floor_number', payload.floorNumber);
    pushUpdate('total_floors', payload.totalFloors);
    pushUpdate('facing', payload.facing);
    pushUpdate('possession_status', payload.possessionStatus);
    pushUpdate('rera_number', payload.reraNumber);
    pushUpdate('is_negotiable', payload.isNegotiable);
    pushUpdate('image_urls', payload.imageUrls);

    const currentLayoutDetails =
      currentRow.layout_details && typeof currentRow.layout_details === 'object' && !Array.isArray(currentRow.layout_details)
        ? currentRow.layout_details
        : {};
    const hasMediaUpdate =
      payload.amenities !== undefined ||
      payload.videoUrl !== undefined ||
      payload.tourUrl !== undefined;
    const hasGroupDealUpdate =
      payload.groupInventoryCount !== undefined ||
      payload.groupDealMinBuyers !== undefined ||
      payload.groupDealMaxBuyers !== undefined ||
      payload.groupDiscountType !== undefined ||
      payload.groupDiscountValue !== undefined ||
      payload.groupDealNote !== undefined;

    let nextGroupDealConfig = extractGroupDealConfigFromLayout(currentLayoutDetails);
    if (hasGroupDealUpdate) {
      nextGroupDealConfig = normalizeListingGroupDealConfig(payload, nextGroupDealConfig);
    }

    if (hasMediaUpdate || hasGroupDealUpdate) {
      const nextLayoutDetails = { ...currentLayoutDetails };

      if (hasMediaUpdate) {
        const currentMedia =
          nextLayoutDetails.media &&
          typeof nextLayoutDetails.media === 'object' &&
          !Array.isArray(nextLayoutDetails.media)
            ? nextLayoutDetails.media
            : {};
        nextLayoutDetails.amenities =
          payload.amenities !== undefined ? payload.amenities : nextLayoutDetails.amenities || [];
        nextLayoutDetails.media = {
          videoUrl:
            payload.videoUrl !== undefined
              ? payload.videoUrl || ''
              : String(currentMedia.videoUrl || ''),
          tourUrl:
            payload.tourUrl !== undefined
              ? payload.tourUrl || ''
              : String(currentMedia.tourUrl || ''),
        };
      }

      const mergedLayoutDetails = mergeLayoutDetailsWithGroupDeal(nextLayoutDetails, nextGroupDealConfig);
      values.push(mergedLayoutDetails);
      updates.push(`layout_details = $${values.length}`);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    values.push(propertyId);
    await pool.query(
      `UPDATE properties SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`,
      values
    );

    const refreshed = await pool.query('SELECT * FROM properties WHERE id = $1 LIMIT 1', [propertyId]);
    const refreshedRow = refreshed.rows[0];
    const companyRows = await pool.query(
      `
        SELECT name, is_verified
        FROM companies
        WHERE id = $1
        LIMIT 1
      `,
      [Number(refreshedRow.company_id || 0)]
    );
    const company = companyRows.rows[0] || { name: 'Seller', is_verified: false };
    const effectiveGroupDealConfig = extractGroupDealConfigFromLayout(refreshedRow.layout_details || {});
    await syncAutoGroupDealForProperty(pool, {
      propertyId: Number(refreshedRow.id),
      listingType: refreshedRow.listing_type || 'sale',
      title: refreshedRow.title,
      state: refreshedRow.state,
      city: refreshedRow.city,
      propertyType: refreshedRow.property_type,
      bedrooms: refreshedRow.bedrooms,
      basePrice: refreshedRow.price,
      builderName: company.name || 'Seller',
      builderVerified: Boolean(company.is_verified),
      groupDealConfig: effectiveGroupDealConfig,
    });

    return res.json({ property: mapOwnerProperty(refreshed.rows[0]) });
  } catch (error) {
    return next(error);
  }
});

router.delete('/properties/:id', async (req, res, next) => {
  try {
    const propertyId = Number(req.params.id);
    if (!Number.isFinite(propertyId) || propertyId <= 0) {
      return res.status(400).json({ error: 'Invalid property id' });
    }

    const rows = await pool.query('DELETE FROM properties WHERE id = $1 AND posted_by = $2 RETURNING id', [
      propertyId,
      req.user.id,
    ]);

    if (rows.rowCount === 0) {
      return res.status(404).json({ error: 'Property not found' });
    }

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.get('/rentals', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 24, 1), 60);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const rows = await pool.query(
      `
        SELECT
          r.*,
          tr.id AS tenant_record_id,
          tr.tenant_name,
          tr.tenant_phone,
          tr.tenant_email,
          tr.lease_start_date,
          tr.lease_end_date,
          tr.rent_due_day,
          tr.notify_enabled,
          tr.notes AS tenant_notes,
          COALESCE(tr.monthly_rent, r.monthly_rent) AS tracked_monthly_rent,
          COALESCE(tr.security_deposit, r.security_deposit) AS tracked_security_deposit,
          COALESCE(pay.total_record_count, 0) AS total_record_count,
          COALESCE(pay.pending_record_count, 0) AS pending_record_count,
          COALESCE(pay.paid_record_count, 0) AS paid_record_count,
          COALESCE(pay.overdue_record_count, 0) AS overdue_record_count,
          pay.last_rent_month,
          pay.last_rent_status,
          pay.last_received_on,
          pay.last_received_amount,
          COUNT(*) OVER() AS total_count
        FROM rentals r
        LEFT JOIN rental_tenant_records tr
          ON tr.rental_id = r.id
         AND tr.owner_id = $1
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*)::INT AS total_record_count,
            COUNT(*) FILTER (WHERE status IN ('pending', 'partial'))::INT AS pending_record_count,
            COUNT(*) FILTER (WHERE status = 'paid')::INT AS paid_record_count,
            COUNT(*) FILTER (WHERE status = 'overdue')::INT AS overdue_record_count,
            (ARRAY_AGG(month_key ORDER BY month_key DESC, created_at DESC))[1] AS last_rent_month,
            (ARRAY_AGG(status ORDER BY month_key DESC, created_at DESC))[1] AS last_rent_status,
            (ARRAY_AGG(received_on ORDER BY month_key DESC, created_at DESC))[1] AS last_received_on,
            (ARRAY_AGG(amount_received ORDER BY month_key DESC, created_at DESC))[1] AS last_received_amount
          FROM rental_payment_records rp
          WHERE rp.rental_id = r.id
            AND rp.owner_id = $1
        ) pay ON TRUE
        WHERE r.posted_by = $1
        ORDER BY r.created_at DESC
        LIMIT $2
        OFFSET $3
      `,
      [req.user.id, limit, offset]
    );

    const total = rows.rowCount > 0 ? Number(rows.rows[0].total_count || 0) : 0;
    const rentals = rows.rows.map((row) => ({
      ...row,
      id: Number(row.id),
      monthly_rent: row.monthly_rent === null ? null : Number(row.monthly_rent),
      security_deposit: row.security_deposit === null ? null : Number(row.security_deposit),
      tracked_monthly_rent: row.tracked_monthly_rent === null ? null : Number(row.tracked_monthly_rent),
      tracked_security_deposit:
        row.tracked_security_deposit === null ? null : Number(row.tracked_security_deposit),
      tenant_record_id: row.tenant_record_id ? Number(row.tenant_record_id) : null,
      rent_due_day: row.rent_due_day === null ? null : Number(row.rent_due_day),
      notify_enabled: row.notify_enabled === null ? null : Boolean(row.notify_enabled),
      total_record_count: Number(row.total_record_count || 0),
      pending_record_count: Number(row.pending_record_count || 0),
      paid_record_count: Number(row.paid_record_count || 0),
      overdue_record_count: Number(row.overdue_record_count || 0),
      last_received_amount: row.last_received_amount === null ? null : Number(row.last_received_amount),
    }));

    return res.json({
      rentals,
      total,
      pageSize: limit,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/rentals/:id/tenant-record', async (req, res, next) => {
  try {
    const rentalId = Number(req.params.id);
    if (!Number.isFinite(rentalId) || rentalId <= 0) {
      return res.status(400).json({ error: 'Invalid rental id' });
    }

    const rental = await findOwnerRental(rentalId, req.user.id);
    if (!rental) {
      return res.status(404).json({ error: 'Rental not found' });
    }

    const tenantRows = await pool.query(
      `
        SELECT *
        FROM rental_tenant_records
        WHERE rental_id = $1
          AND owner_id = $2
        LIMIT 1
      `,
      [rentalId, req.user.id]
    );

    const tenantRecord = mapTenantRecord(tenantRows.rows[0], {
      rentalId,
      ownerId: req.user.id,
      monthlyRent: rental.monthly_rent === null ? null : Number(rental.monthly_rent),
      securityDeposit: rental.security_deposit === null ? null : Number(rental.security_deposit),
      leaseStartDate: rental.available_from || null,
    });

    return res.json({
      rentalId,
      rentalTitle: rental.title,
      tenantRecord,
    });
  } catch (error) {
    return next(error);
  }
});

router.put('/rentals/:id/tenant-record', async (req, res, next) => {
  try {
    const rentalId = Number(req.params.id);
    if (!Number.isFinite(rentalId) || rentalId <= 0) {
      return res.status(400).json({ error: 'Invalid rental id' });
    }

    const payload = TENANT_RECORD_UPDATE_SCHEMA.parse(req.body || {});
    if (!payload || Object.keys(payload).length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    const rental = await findOwnerRental(rentalId, req.user.id);
    if (!rental) {
      return res.status(404).json({ error: 'Rental not found' });
    }

    const existingRows = await pool.query(
      `
        SELECT *
        FROM rental_tenant_records
        WHERE rental_id = $1
          AND owner_id = $2
        LIMIT 1
      `,
      [rentalId, req.user.id]
    );
    const current = existingRows.rows[0] || null;

    const nextTenantName = payload.tenantName ?? current?.tenant_name ?? '';
    const nextTenantPhone = payload.tenantPhone ?? current?.tenant_phone ?? '';
    const nextTenantEmail = payload.tenantEmail ?? current?.tenant_email ?? '';
    const nextLeaseStartDate =
      payload.leaseStartDate !== undefined
        ? toNullableDate(payload.leaseStartDate)
        : toNullableDate(current?.lease_start_date) || toNullableDate(rental.available_from);
    const nextLeaseEndDate =
      payload.leaseEndDate !== undefined ? toNullableDate(payload.leaseEndDate) : toNullableDate(current?.lease_end_date);
    const nextMonthlyRent =
      payload.monthlyRent !== undefined
        ? toNullableNumber(payload.monthlyRent)
        : current?.monthly_rent === null || current?.monthly_rent === undefined
          ? toNullableNumber(rental.monthly_rent)
          : Number(current.monthly_rent);
    const nextSecurityDeposit =
      payload.securityDeposit !== undefined
        ? toNullableNumber(payload.securityDeposit)
        : current?.security_deposit === null || current?.security_deposit === undefined
          ? toNullableNumber(rental.security_deposit)
          : Number(current.security_deposit);
    const nextRentDueDay =
      payload.rentDueDay !== undefined
        ? Number(payload.rentDueDay)
        : current?.rent_due_day === null || current?.rent_due_day === undefined
          ? 5
          : Number(current.rent_due_day);
    const nextNotifyEnabled =
      payload.notifyEnabled !== undefined
        ? Boolean(payload.notifyEnabled)
        : current?.notify_enabled === null || current?.notify_enabled === undefined
          ? true
          : Boolean(current.notify_enabled);
    const nextNotes = payload.notes ?? current?.notes ?? '';

    const upsertedRows = await pool.query(
      `
        INSERT INTO rental_tenant_records (
          rental_id,
          owner_id,
          tenant_name,
          tenant_phone,
          tenant_email,
          lease_start_date,
          lease_end_date,
          monthly_rent,
          security_deposit,
          rent_due_day,
          notify_enabled,
          notes
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (rental_id)
        DO UPDATE SET
          owner_id = EXCLUDED.owner_id,
          tenant_name = EXCLUDED.tenant_name,
          tenant_phone = EXCLUDED.tenant_phone,
          tenant_email = EXCLUDED.tenant_email,
          lease_start_date = EXCLUDED.lease_start_date,
          lease_end_date = EXCLUDED.lease_end_date,
          monthly_rent = EXCLUDED.monthly_rent,
          security_deposit = EXCLUDED.security_deposit,
          rent_due_day = EXCLUDED.rent_due_day,
          notify_enabled = EXCLUDED.notify_enabled,
          notes = EXCLUDED.notes,
          updated_at = NOW()
        RETURNING *
      `,
      [
        rentalId,
        req.user.id,
        nextTenantName,
        nextTenantPhone,
        nextTenantEmail,
        nextLeaseStartDate,
        nextLeaseEndDate,
        nextMonthlyRent,
        nextSecurityDeposit,
        nextRentDueDay,
        nextNotifyEnabled,
        nextNotes,
      ]
    );

    return res.json({
      tenantRecord: mapTenantRecord(upsertedRows.rows[0]),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/rentals/:id/rent-records', async (req, res, next) => {
  try {
    const rentalId = Number(req.params.id);
    if (!Number.isFinite(rentalId) || rentalId <= 0) {
      return res.status(400).json({ error: 'Invalid rental id' });
    }

    const query = RENT_RECORDS_QUERY_SCHEMA.parse({
      limit: req.query.limit,
    });

    const rental = await findOwnerRental(rentalId, req.user.id);
    if (!rental) {
      return res.status(404).json({ error: 'Rental not found' });
    }

    const rows = await pool.query(
      `
        SELECT *
        FROM rental_payment_records
        WHERE rental_id = $1
          AND owner_id = $2
        ORDER BY month_key DESC, created_at DESC
        LIMIT $3
      `,
      [rentalId, req.user.id, query.limit]
    );

    return res.json({
      rentalId,
      records: rows.rows.map(mapRentRecord),
      total: rows.rowCount,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/rentals/:id/rent-records', async (req, res, next) => {
  try {
    const rentalId = Number(req.params.id);
    if (!Number.isFinite(rentalId) || rentalId <= 0) {
      return res.status(400).json({ error: 'Invalid rental id' });
    }

    const payload = RENT_RECORD_CREATE_SCHEMA.parse(req.body || {});
    const rental = await findOwnerRental(rentalId, req.user.id);
    if (!rental) {
      return res.status(404).json({ error: 'Rental not found' });
    }

    const tenantRows = await pool.query(
      `
        SELECT *
        FROM rental_tenant_records
        WHERE rental_id = $1
          AND owner_id = $2
        LIMIT 1
      `,
      [rentalId, req.user.id]
    );
    const tenantRecord = tenantRows.rows[0] || null;

    const monthKey = normalizeMonthKey(payload.monthKey) || currentMonthKey();
    const dueDate = payload.dueDate !== undefined ? toNullableDate(payload.dueDate) : null;
    const amountDue =
      payload.amountDue !== undefined
        ? Number(payload.amountDue || 0)
        : tenantRecord?.monthly_rent === null || tenantRecord?.monthly_rent === undefined
          ? toNullableNumber(rental.monthly_rent) || 0
          : Number(tenantRecord.monthly_rent || 0);
    const amountReceived = payload.amountReceived !== undefined ? Number(payload.amountReceived || 0) : 0;
    const receivedOn = payload.receivedOn !== undefined ? toNullableDate(payload.receivedOn) : null;
    const status = payload.status || deriveRentStatus(amountDue, amountReceived, dueDate);

    const upsertedRows = await pool.query(
      `
        INSERT INTO rental_payment_records (
          tenant_record_id,
          rental_id,
          owner_id,
          month_key,
          due_date,
          amount_due,
          amount_received,
          received_on,
          status,
          payment_method,
          notes,
          notification_sent
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (rental_id, month_key)
        DO UPDATE SET
          tenant_record_id = EXCLUDED.tenant_record_id,
          owner_id = EXCLUDED.owner_id,
          due_date = EXCLUDED.due_date,
          amount_due = EXCLUDED.amount_due,
          amount_received = EXCLUDED.amount_received,
          received_on = EXCLUDED.received_on,
          status = EXCLUDED.status,
          payment_method = EXCLUDED.payment_method,
          notes = EXCLUDED.notes,
          notification_sent = EXCLUDED.notification_sent,
          updated_at = NOW()
        RETURNING *
      `,
      [
        tenantRecord?.id || null,
        rentalId,
        req.user.id,
        monthKey,
        dueDate,
        amountDue,
        amountReceived,
        receivedOn,
        status,
        payload.paymentMethod || 'bank_transfer',
        payload.notes || '',
        payload.notificationSent === true,
      ]
    );

    return res.status(201).json({
      record: mapRentRecord(upsertedRows.rows[0]),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/rentals/:id/send-notification', async (req, res, next) => {
  try {
    const rentalId = Number(req.params.id);
    if (!Number.isFinite(rentalId) || rentalId <= 0) {
      return res.status(400).json({ error: 'Invalid rental id' });
    }

    const payload = REMINDER_SCHEMA.parse(req.body || {});
    const rental = await findOwnerRental(rentalId, req.user.id);
    if (!rental) {
      return res.status(404).json({ error: 'Rental not found' });
    }

    const tenantRows = await pool.query(
      `
        SELECT *
        FROM rental_tenant_records
        WHERE rental_id = $1
          AND owner_id = $2
        LIMIT 1
      `,
      [rentalId, req.user.id]
    );
    const tenantRecord = tenantRows.rows[0] || null;
    const monthKey = payload.monthKey || currentMonthKey();

    if (payload.channel !== 'email') {
      return res.status(400).json({ error: 'Only email reminders are supported right now.' });
    }

    if (!tenantRecord?.tenant_email) {
      return res.status(400).json({ error: 'Tenant email is required before sending a reminder.' });
    }

    const subject = payload.subject || `Rent reminder for ${rental.title} (${monthKey})`;
    const message =
      payload.message ||
      `Hello ${tenantRecord.tenant_name || 'Tenant'}, this is a reminder that rent for ${rental.title} (${monthKey}) is due. Please ignore if already paid.`;

    let delivered = false;
    let providerResponse = '';
    try {
      delivered = await sendEmailMessage({
        to: tenantRecord.tenant_email,
        subject,
        text: message,
        html: `<p>${message}</p>`,
        deliveryLabel: 'Rental reminder',
      });
      if (!delivered) {
        providerResponse = 'SMTP not configured';
      }
    } catch (error) {
      delivered = false;
      providerResponse = error instanceof Error ? error.message : 'Email send failed';
    }

    const queueResult = await enqueueNotificationDispatch({
      ownerId: req.user.id,
      rentalId,
      tenantEmail: tenantRecord.tenant_email,
      subject,
      message,
      monthKey,
      channel: 'email',
    });

    await pool.query(
      `
        INSERT INTO rental_notification_logs (
          rental_id,
          owner_id,
          tenant_record_id,
          month_key,
          channel,
          recipient,
          subject,
          message,
          queued,
          delivered,
          provider_response
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      `,
      [
        rentalId,
        req.user.id,
        tenantRecord.id,
        monthKey,
        'email',
        tenantRecord.tenant_email,
        subject,
        message,
        Boolean(queueResult?.queued),
        Boolean(delivered),
        providerResponse || (queueResult?.reason ? `Queue: ${queueResult.reason}` : ''),
      ]
    );

    if (monthKey) {
      await pool.query(
        `
          UPDATE rental_payment_records
          SET notification_sent = TRUE,
              updated_at = NOW()
          WHERE rental_id = $1
            AND owner_id = $2
            AND month_key = $3
        `,
        [rentalId, req.user.id, monthKey]
      );
    }

    return res.status(201).json({
      ok: true,
      delivered: Boolean(delivered),
      queued: Boolean(queueResult?.queued),
      queueReason: queueResult?.reason || null,
      recipient: tenantRecord.tenant_email,
      monthKey,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/leads', async (req, res, next) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const period = typeof req.query.period === 'string' ? req.query.period.trim() : '';

    const params = [req.user.id];
    const saleWhere = ['p.posted_by = $1'];
    const rentWhere = ['r.posted_by = $1'];

    if (status) {
      params.push(status);
      saleWhere.push(`l.status = $${params.length}`);
      rentWhere.push(`rl.status = $${params.length}`);
    }

    if (period === 'today') {
      saleWhere.push(`l.created_at >= CURRENT_DATE`);
      rentWhere.push(`rl.created_at >= CURRENT_DATE`);
    }

    if (period === 'week') {
      saleWhere.push(`l.created_at >= (CURRENT_DATE - INTERVAL '7 days')`);
      rentWhere.push(`rl.created_at >= (CURRENT_DATE - INTERVAL '7 days')`);
    }

    const saleRows = await pool.query(
      `
        SELECT
          l.id,
          l.message,
          l.status,
          l.notes,
          l.created_at,
          l.updated_at,
          u.name AS lead_name,
          u.email AS lead_email,
          u.phone AS lead_phone,
          p.id AS property_id,
          p.title AS property_title,
          p.city,
          p.locality,
          p.image_urls
        FROM leads l
        JOIN properties p ON p.id = l.property_id
        LEFT JOIN users u ON u.id = l.user_id
        WHERE ${saleWhere.join(' AND ')}
        ORDER BY l.created_at DESC
        LIMIT 200
      `,
      params
    );

    const rentRows = await pool.query(
      `
        SELECT
          rl.id,
          rl.message,
          rl.status,
          rl.notes,
          rl.created_at,
          rl.updated_at,
          u.name AS lead_name,
          u.email AS lead_email,
          u.phone AS lead_phone,
          r.id AS rental_id,
          r.title AS rental_title,
          r.city,
          r.locality,
          r.image_urls
        FROM rental_leads rl
        JOIN rentals r ON r.id = rl.rental_id
        LEFT JOIN users u ON u.id = rl.user_id
        WHERE ${rentWhere.join(' AND ')}
        ORDER BY rl.created_at DESC
        LIMIT 200
      `,
      params
    );

    return res.json({
      leads: [
        ...saleRows.rows.map((row) => ({
          id: Number(row.id),
          leadType: 'sale',
          message: row.message,
          status: row.status || 'new',
          notes: row.notes || '',
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          lead: {
            name: row.lead_name,
            email: row.lead_email,
            phone: row.lead_phone,
          },
          listing: {
            id: Number(row.property_id),
            title: row.property_title,
            city: row.city,
            locality: row.locality,
            image: Array.isArray(row.image_urls) ? row.image_urls[0] : '',
          },
        })),
        ...rentRows.rows.map((row) => ({
          id: Number(row.id),
          leadType: 'rent',
          message: row.message,
          status: row.status || 'new',
          notes: row.notes || '',
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          lead: {
            name: row.lead_name,
            email: row.lead_email,
            phone: row.lead_phone,
          },
          listing: {
            id: Number(row.rental_id),
            title: row.rental_title,
            city: row.city,
            locality: row.locality,
            image: Array.isArray(row.image_urls) ? row.image_urls[0] : '',
          },
        })),
      ],
    });
  } catch (error) {
    return next(error);
  }
});

router.put('/leads/:id', async (req, res, next) => {
  try {
    const leadId = Number(req.params.id);
    if (!Number.isFinite(leadId) || leadId <= 0) {
      return res.status(400).json({ error: 'Invalid lead id' });
    }

    const payload = LEAD_UPDATE_SCHEMA.parse(req.body || {});
    const statusValue = payload.status || null;
    const notesValue = payload.notes || null;

    if (payload.leadType === 'sale') {
      const result = await pool.query(
        `
          UPDATE leads
          SET status = COALESCE($1, status),
              notes = COALESCE($2, notes),
              updated_at = NOW()
          WHERE id = $3
            AND property_id IN (
              SELECT id FROM properties WHERE posted_by = $4
            )
          RETURNING id
        `,
        [statusValue, notesValue, leadId, req.user.id]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Lead not found' });
      }
    } else {
      const result = await pool.query(
        `
          UPDATE rental_leads
          SET status = COALESCE($1, status),
              notes = COALESCE($2, notes),
              updated_at = NOW()
          WHERE id = $3
            AND rental_id IN (
              SELECT id FROM rentals WHERE posted_by = $4
            )
          RETURNING id
        `,
        [statusValue, notesValue, leadId, req.user.id]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Lead not found' });
      }
    }

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.get('/analytics', async (req, res, next) => {
  try {
    const ownerId = Number(req.user.id);
    const [
      listingsRows,
      rentalRows,
      leadStatusRows,
      commissionTotalsRows,
      bookingTotalsRows,
      boostsRows,
      pendingRows,
      conversionMonthlyRows,
      conversionFunnelRows,
      revenueMonthlyRows,
      revenueYearlyRows,
      leadSourceRows,
      propertyPerformanceRows,
      fastestSellingRows,
      agentPerformanceRows,
      commissionReportRows,
    ] = await Promise.all([
      pool.query(
        `
          SELECT COUNT(*)::INT AS total, COALESCE(SUM(view_count), 0) AS views
          FROM properties
          WHERE posted_by = $1
        `,
        [ownerId]
      ),
      pool.query(
        `
          SELECT COUNT(*)::INT AS total, COALESCE(SUM(view_count), 0) AS views
          FROM rentals
          WHERE posted_by = $1
        `,
        [ownerId]
      ),
      pool.query(
        `
          SELECT
            COUNT(*)::INT AS total_leads,
            COUNT(*) FILTER (WHERE status = 'closed')::INT AS closed_leads,
            COUNT(*) FILTER (WHERE status <> 'closed')::INT AS active_leads
          FROM (
            SELECT COALESCE(l.status, 'new') AS status
            FROM leads l
            JOIN properties p ON p.id = l.property_id
            WHERE p.posted_by = $1
            UNION ALL
            SELECT COALESCE(rl.status, 'new') AS status
            FROM rental_leads rl
            JOIN rentals r ON r.id = rl.rental_id
            WHERE r.posted_by = $1
          ) lead_status
        `,
        [ownerId]
      ),
      pool.query(
        `
          SELECT
            COALESCE(SUM(c.commission_amount), 0) AS total_commission,
            COALESCE(SUM(CASE WHEN c.status = 'paid' THEN c.commission_amount ELSE 0 END), 0) AS paid_commission
          FROM commission c
          JOIN properties p ON p.id = c.property_id
          WHERE p.posted_by = $1
        `,
        [ownerId]
      ),
      pool.query(
        `
          SELECT COALESCE(SUM(rb.total_price), 0) AS total_bookings
          FROM rental_bookings rb
          JOIN rentals r ON r.id = rb.rental_id
          WHERE r.posted_by = $1
            AND rb.status = 'confirmed'
        `,
        [ownerId]
      ),
      pool.query(
        `
          SELECT COUNT(*)::INT AS total
          FROM boosts
          WHERE owner_id = $1
        `,
        [ownerId]
      ),
      pool.query(
        `
          SELECT COUNT(*)::INT AS total
          FROM properties
          WHERE posted_by = $1
            AND is_verified = FALSE
        `,
        [ownerId]
      ),
      pool.query(
        `
          WITH months AS (
            SELECT generate_series(
              date_trunc('month', NOW()) - INTERVAL '5 months',
              date_trunc('month', NOW()),
              INTERVAL '1 month'
            )::date AS month_start
          ),
          all_leads AS (
            SELECT l.created_at, COALESCE(l.status, 'new') AS status
            FROM leads l
            JOIN properties p ON p.id = l.property_id
            WHERE p.posted_by = $1
            UNION ALL
            SELECT rl.created_at, COALESCE(rl.status, 'new') AS status
            FROM rental_leads rl
            JOIN rentals r ON r.id = rl.rental_id
            WHERE r.posted_by = $1
          )
          SELECT
            m.month_start,
            COUNT(a.status)::INT AS total_leads,
            COUNT(*) FILTER (WHERE a.status = 'closed')::INT AS closed_leads
          FROM months m
          LEFT JOIN all_leads a
            ON a.created_at >= m.month_start
           AND a.created_at < (m.month_start + INTERVAL '1 month')
          GROUP BY m.month_start
          ORDER BY m.month_start ASC
        `,
        [ownerId]
      ),
      pool.query(
        `
          WITH lead_signals AS (
            SELECT
              1 AS lead_count,
              CASE
                WHEN l.lead_type = 'schedule_visit'
                  OR LOWER(COALESCE(l.message, '')) LIKE '%visit%'
                THEN 1 ELSE 0
              END AS visit_count,
              CASE
                WHEN l.lead_type = 'make_offer'
                  OR LOWER(COALESCE(l.message, '')) LIKE '%offer%'
                  OR LOWER(COALESCE(l.message, '')) LIKE '%negotiat%'
                THEN 1 ELSE 0
              END AS negotiation_count,
              CASE
                WHEN COALESCE(l.status, 'new') = 'closed' THEN 1 ELSE 0
              END AS closed_count
            FROM leads l
            JOIN properties p ON p.id = l.property_id
            WHERE p.posted_by = $1

            UNION ALL

            SELECT
              1 AS lead_count,
              CASE
                WHEN LOWER(COALESCE(rl.message, '')) LIKE '%visit%'
                THEN 1 ELSE 0
              END AS visit_count,
              CASE
                WHEN LOWER(COALESCE(rl.message, '')) LIKE '%offer%'
                  OR LOWER(COALESCE(rl.message, '')) LIKE '%negotiat%'
                THEN 1 ELSE 0
              END AS negotiation_count,
              CASE
                WHEN COALESCE(rl.status, 'new') = 'closed' THEN 1 ELSE 0
              END AS closed_count
            FROM rental_leads rl
            JOIN rentals r ON r.id = rl.rental_id
            WHERE r.posted_by = $1
          )
          SELECT
            COALESCE(SUM(lead_count), 0)::INT AS total_leads,
            COALESCE(SUM(visit_count), 0)::INT AS total_visits,
            COALESCE(SUM(negotiation_count), 0)::INT AS total_negotiations,
            COALESCE(SUM(closed_count), 0)::INT AS total_closed
          FROM lead_signals
        `,
        [ownerId]
      ),
      pool.query(
        `
          WITH months AS (
            SELECT generate_series(
              date_trunc('month', NOW()) - INTERVAL '5 months',
              date_trunc('month', NOW()),
              INTERVAL '1 month'
            )::date AS month_start
          ),
          commission_by_month AS (
            SELECT
              date_trunc('month', c.created_at)::date AS month_start,
              COALESCE(SUM(CASE WHEN c.status = 'paid' THEN c.commission_amount ELSE 0 END), 0) AS commission_revenue
            FROM commission c
            JOIN properties p ON p.id = c.property_id
            WHERE p.posted_by = $1
            GROUP BY 1
          ),
          booking_by_month AS (
            SELECT
              date_trunc('month', rb.created_at)::date AS month_start,
              COALESCE(SUM(rb.total_price), 0) AS booking_revenue
            FROM rental_bookings rb
            JOIN rentals r ON r.id = rb.rental_id
            WHERE r.posted_by = $1
              AND rb.status = 'confirmed'
            GROUP BY 1
          )
          SELECT
            m.month_start,
            COALESCE(cbm.commission_revenue, 0) AS commission_revenue,
            COALESCE(bbm.booking_revenue, 0) AS booking_revenue
          FROM months m
          LEFT JOIN commission_by_month cbm ON cbm.month_start = m.month_start
          LEFT JOIN booking_by_month bbm ON bbm.month_start = m.month_start
          ORDER BY m.month_start ASC
        `,
        [ownerId]
      ),
      pool.query(
        `
          WITH years AS (
            SELECT generate_series(
              date_trunc('year', NOW()) - INTERVAL '3 years',
              date_trunc('year', NOW()),
              INTERVAL '1 year'
            )::date AS year_start
          ),
          commission_by_year AS (
            SELECT
              date_trunc('year', c.created_at)::date AS year_start,
              COALESCE(SUM(CASE WHEN c.status = 'paid' THEN c.commission_amount ELSE 0 END), 0) AS commission_revenue
            FROM commission c
            JOIN properties p ON p.id = c.property_id
            WHERE p.posted_by = $1
            GROUP BY 1
          ),
          booking_by_year AS (
            SELECT
              date_trunc('year', rb.created_at)::date AS year_start,
              COALESCE(SUM(rb.total_price), 0) AS booking_revenue
            FROM rental_bookings rb
            JOIN rentals r ON r.id = rb.rental_id
            WHERE r.posted_by = $1
              AND rb.status = 'confirmed'
            GROUP BY 1
          )
          SELECT
            y.year_start,
            COALESCE(cby.commission_revenue, 0) AS commission_revenue,
            COALESCE(bby.booking_revenue, 0) AS booking_revenue
          FROM years y
          LEFT JOIN commission_by_year cby ON cby.year_start = y.year_start
          LEFT JOIN booking_by_year bby ON bby.year_start = y.year_start
          ORDER BY y.year_start ASC
        `,
        [ownerId]
      ),
      pool.query(
        `
          WITH all_leads AS (
            SELECT LOWER(COALESCE(l.message, '')) AS message
            FROM leads l
            JOIN properties p ON p.id = l.property_id
            WHERE p.posted_by = $1
            UNION ALL
            SELECT LOWER(COALESCE(rl.message, '')) AS message
            FROM rental_leads rl
            JOIN rentals r ON r.id = rl.rental_id
            WHERE r.posted_by = $1
          ),
          source_classified AS (
            SELECT
              CASE
                WHEN message LIKE '%whatsapp%' OR message LIKE '%wa.me%' THEN 'WhatsApp leads'
                WHEN message LIKE '%instagram%' OR message LIKE '%insta%' THEN 'Instagram leads'
                WHEN message LIKE '%facebook%' OR message LIKE '%fb ad%' OR message LIKE '%meta ad%' THEN 'Facebook Ads'
                WHEN message LIKE '%call%' OR message LIKE '%phone%' OR message LIKE '%dial%' THEN 'Direct calls'
                ELSE 'Website form leads'
              END AS source
            FROM all_leads
          )
          SELECT source, COUNT(*)::INT AS total
          FROM source_classified
          GROUP BY source
        `,
        [ownerId]
      ),
      pool.query(
        `
          WITH property_base AS (
            SELECT
              p.id,
              p.title,
              p.property_type,
              p.city,
              p.locality,
              COALESCE(p.view_count, 0)::INT AS views
            FROM properties p
            WHERE p.posted_by = $1
          ),
          property_lead_stats AS (
            SELECT
              l.property_id,
              COUNT(*)::INT AS leads,
              COUNT(*) FILTER (
                WHERE l.lead_type = 'schedule_visit'
                  OR LOWER(COALESCE(l.message, '')) LIKE '%visit%'
              )::INT AS site_visits,
              COUNT(*) FILTER (WHERE COALESCE(l.status, 'new') = 'closed')::INT AS deals
            FROM leads l
            JOIN properties p ON p.id = l.property_id
            WHERE p.posted_by = $1
            GROUP BY l.property_id
          ),
          property_revenue AS (
            SELECT
              c.property_id,
              COALESCE(SUM(CASE WHEN c.status = 'paid' THEN c.commission_amount ELSE 0 END), 0) AS revenue
            FROM commission c
            JOIN properties p ON p.id = c.property_id
            WHERE p.posted_by = $1
            GROUP BY c.property_id
          ),
          rental_base AS (
            SELECT
              r.id,
              r.title,
              r.property_type,
              r.city,
              r.locality,
              COALESCE(r.view_count, 0)::INT AS views
            FROM rentals r
            WHERE r.posted_by = $1
          ),
          rental_lead_stats AS (
            SELECT
              rl.rental_id,
              COUNT(*)::INT AS leads,
              COUNT(*) FILTER (WHERE LOWER(COALESCE(rl.message, '')) LIKE '%visit%')::INT AS site_visits,
              COUNT(*) FILTER (WHERE COALESCE(rl.status, 'new') = 'closed')::INT AS closed_leads
            FROM rental_leads rl
            JOIN rentals r ON r.id = rl.rental_id
            WHERE r.posted_by = $1
            GROUP BY rl.rental_id
          ),
          rental_booking_stats AS (
            SELECT
              rb.rental_id,
              COUNT(*) FILTER (WHERE rb.status = 'confirmed')::INT AS confirmed_bookings,
              COALESCE(SUM(CASE WHEN rb.status = 'confirmed' THEN rb.total_price ELSE 0 END), 0) AS booking_revenue
            FROM rental_bookings rb
            JOIN rentals r ON r.id = rb.rental_id
            WHERE r.posted_by = $1
            GROUP BY rb.rental_id
          ),
          sale_rows AS (
            SELECT
              pb.id AS listing_id,
              'sale'::text AS listing_type,
              pb.title,
              pb.property_type,
              pb.city,
              pb.locality,
              pb.views,
              COALESCE(pls.leads, 0)::INT AS leads,
              COALESCE(pls.site_visits, 0)::INT AS site_visits,
              COALESCE(pls.deals, 0)::INT AS deals,
              COALESCE(pr.revenue, 0) AS revenue
            FROM property_base pb
            LEFT JOIN property_lead_stats pls ON pls.property_id = pb.id
            LEFT JOIN property_revenue pr ON pr.property_id = pb.id
          ),
          rental_rows AS (
            SELECT
              rb.id AS listing_id,
              'rental'::text AS listing_type,
              rb.title,
              rb.property_type,
              rb.city,
              rb.locality,
              rb.views,
              COALESCE(rls.leads, 0)::INT AS leads,
              COALESCE(rls.site_visits, 0)::INT AS site_visits,
              (COALESCE(rls.closed_leads, 0) + COALESCE(rbs.confirmed_bookings, 0))::INT AS deals,
              COALESCE(rbs.booking_revenue, 0) AS revenue
            FROM rental_base rb
            LEFT JOIN rental_lead_stats rls ON rls.rental_id = rb.id
            LEFT JOIN rental_booking_stats rbs ON rbs.rental_id = rb.id
          )
          SELECT
            listing_id,
            listing_type,
            title,
            property_type,
            city,
            locality,
            views,
            leads,
            site_visits,
            deals,
            revenue
          FROM (
            SELECT * FROM sale_rows
            UNION ALL
            SELECT * FROM rental_rows
          ) combined
          ORDER BY views DESC, leads DESC, deals DESC
          LIMIT 100
        `,
        [ownerId]
      ),
      pool.query(
        `
          WITH lead_windows AS (
            SELECT
              p.id,
              p.title,
              p.city,
              p.locality,
              MIN(l.created_at) AS first_lead_at,
              MIN(l.created_at) FILTER (WHERE COALESCE(l.status, 'new') = 'closed') AS first_closed_at
            FROM properties p
            LEFT JOIN leads l ON l.property_id = p.id
            WHERE p.posted_by = $1
            GROUP BY p.id, p.title, p.city, p.locality
          )
          SELECT
            id,
            title,
            city,
            locality,
            EXTRACT(EPOCH FROM (first_closed_at - first_lead_at)) / 86400.0 AS days_to_close
          FROM lead_windows
          WHERE first_lead_at IS NOT NULL
            AND first_closed_at IS NOT NULL
            AND first_closed_at >= first_lead_at
          ORDER BY days_to_close ASC
          LIMIT 1
        `,
        [ownerId]
      ),
      pool.query(
        `
          WITH owner_commission AS (
            SELECT
              c.id,
              c.property_id,
              c.agent_id,
              c.status,
              c.commission_amount,
              c.created_at
            FROM commission c
            JOIN properties p ON p.id = c.property_id
            WHERE p.posted_by = $1
          ),
          property_agent AS (
            SELECT DISTINCT ON (property_id)
              property_id,
              agent_id
            FROM owner_commission
            ORDER BY property_id, created_at DESC, id DESC
          ),
          leads_by_agent AS (
            SELECT
              pa.agent_id,
              COUNT(l.id)::INT AS leads_assigned
            FROM property_agent pa
            LEFT JOIN leads l ON l.property_id = pa.property_id
            GROUP BY pa.agent_id
          ),
          deals_by_agent AS (
            SELECT
              oc.agent_id,
              COUNT(*)::INT AS deals_closed,
              COALESCE(SUM(CASE WHEN oc.status = 'paid' THEN oc.commission_amount ELSE 0 END), 0) AS revenue_generated
            FROM owner_commission oc
            GROUP BY oc.agent_id
          ),
          response_by_agent AS (
            SELECT
              pa.agent_id,
              AVG(
                EXTRACT(EPOCH FROM (close_window.first_close_at - lead_window.first_lead_at)) / 3600.0
              ) AS avg_response_hours
            FROM property_agent pa
            JOIN LATERAL (
              SELECT MIN(l.created_at) AS first_lead_at
              FROM leads l
              WHERE l.property_id = pa.property_id
            ) lead_window ON TRUE
            JOIN LATERAL (
              SELECT MIN(oc.created_at) AS first_close_at
              FROM owner_commission oc
              WHERE oc.property_id = pa.property_id
            ) close_window ON TRUE
            WHERE lead_window.first_lead_at IS NOT NULL
              AND close_window.first_close_at IS NOT NULL
              AND close_window.first_close_at >= lead_window.first_lead_at
            GROUP BY pa.agent_id
          )
          SELECT
            u.id AS agent_id,
            u.name AS agent_name,
            COALESCE(lba.leads_assigned, 0)::INT AS leads_assigned,
            COALESCE(dba.deals_closed, 0)::INT AS deals_closed,
            COALESCE(dba.revenue_generated, 0) AS revenue_generated,
            COALESCE(rba.avg_response_hours, 0) AS avg_response_hours
          FROM users u
          JOIN (SELECT DISTINCT agent_id FROM owner_commission) agents ON agents.agent_id = u.id
          LEFT JOIN leads_by_agent lba ON lba.agent_id = u.id
          LEFT JOIN deals_by_agent dba ON dba.agent_id = u.id
          LEFT JOIN response_by_agent rba ON rba.agent_id = u.id
          ORDER BY dba.revenue_generated DESC NULLS LAST, dba.deals_closed DESC
          LIMIT 20
        `,
        [ownerId]
      ),
      pool.query(
        `
          SELECT
            c.id,
            c.property_id,
            p.title AS property_title,
            p.property_type,
            c.agent_id,
            COALESCE(u.name, 'Unknown Agent') AS agent_name,
            c.commission_percent,
            c.commission_amount,
            c.status,
            c.created_at
          FROM commission c
          JOIN properties p ON p.id = c.property_id
          LEFT JOIN users u ON u.id = c.agent_id
          WHERE p.posted_by = $1
          ORDER BY c.created_at DESC
          LIMIT 400
        `,
        [ownerId]
      ),
    ]);

    const listingsRow = listingsRows.rows[0] || {};
    const rentalsRow = rentalRows.rows[0] || {};
    const leadStatusRow = leadStatusRows.rows[0] || {};
    const commissionTotalsRow = commissionTotalsRows.rows[0] || {};
    const bookingTotalsRow = bookingTotalsRows.rows[0] || {};
    const funnelRow = conversionFunnelRows.rows[0] || {};

    const totalLeads = Number(leadStatusRow.total_leads || 0);
    const activeLeads = Number(leadStatusRow.active_leads || 0);
    const closedDeals = Number(leadStatusRow.closed_leads || 0);
    const conversionRate = totalLeads > 0 ? Math.round((closedDeals / totalLeads) * 1000) / 10 : 0;

    const totalCommission = Number(commissionTotalsRow.total_commission || 0);
    const paidCommission = Number(commissionTotalsRow.paid_commission || 0);
    const bookingRevenue = Number(bookingTotalsRow.total_bookings || 0);

    const conversionMonthly = conversionMonthlyRows.rows.map((row) => {
      const total = Number(row.total_leads || 0);
      const closed = Number(row.closed_leads || 0);
      const ratio = total > 0 ? Math.round((closed / total) * 1000) / 10 : 0;
      const monthDate = new Date(row.month_start);
      const monthLabel = Number.isNaN(monthDate.getTime())
        ? ''
        : monthDate.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      return {
        month: monthLabel,
        monthStart: row.month_start,
        leads: total,
        closed,
        conversionRate: ratio,
      };
    });

    const revenueMonthly = revenueMonthlyRows.rows.map((row) => {
      const commission = Number(row.commission_revenue || 0);
      const bookings = Number(row.booking_revenue || 0);
      const monthDate = new Date(row.month_start);
      const monthLabel = Number.isNaN(monthDate.getTime())
        ? ''
        : monthDate.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      return {
        month: monthLabel,
        monthStart: row.month_start,
        commission,
        bookings,
        revenue: commission + bookings,
      };
    });

    const revenueYearly = revenueYearlyRows.rows.map((row) => {
      const commission = Number(row.commission_revenue || 0);
      const bookings = Number(row.booking_revenue || 0);
      const yearDate = new Date(row.year_start);
      const yearLabel = Number.isNaN(yearDate.getTime())
        ? ''
        : yearDate.toLocaleDateString('en-IN', { year: 'numeric' });
      return {
        year: yearLabel,
        yearStart: row.year_start,
        commission,
        bookings,
        revenue: commission + bookings,
      };
    });

    const totalRevenue = paidCommission + bookingRevenue;
    const thisMonthRevenue = revenueMonthly.length > 0 ? Number(revenueMonthly[revenueMonthly.length - 1].revenue || 0) : 0;

    const sourceOrder = [
      'Website form leads',
      'WhatsApp leads',
      'Instagram leads',
      'Facebook Ads',
      'Direct calls',
    ];
    const sourceMap = new Map();
    leadSourceRows.rows.forEach((row) => {
      sourceMap.set(row.source, Number(row.total || 0));
    });
    const leadSourceBreakdown = sourceOrder.map((source) => ({
      source,
      count: Number(sourceMap.get(source) || 0),
    }));

    const propertyPerformance = propertyPerformanceRows.rows.map((row) => ({
      listingId: Number(row.listing_id),
      listingType: row.listing_type,
      title: row.title,
      propertyType: row.property_type,
      city: row.city,
      locality: row.locality,
      views: Number(row.views || 0),
      leads: Number(row.leads || 0),
      siteVisits: Number(row.site_visits || 0),
      deals: Number(row.deals || 0),
      revenue: Number(row.revenue || 0),
    }));

    const mostViewedProperty = propertyPerformance.reduce((best, item) => {
      if (!best || item.views > best.views) return item;
      return best;
    }, null);
    const highestRevenueProperty = propertyPerformance.reduce((best, item) => {
      if (!best || item.revenue > best.revenue) return item;
      return best;
    }, null);

    const fastestSellingRow = fastestSellingRows.rows[0] || null;
    const fastestSellingProperty = fastestSellingRow
      ? {
          listingId: Number(fastestSellingRow.id),
          title: fastestSellingRow.title,
          city: fastestSellingRow.city,
          locality: fastestSellingRow.locality,
          daysToClose: Math.round(Number(fastestSellingRow.days_to_close || 0) * 10) / 10,
        }
      : null;

    const agentPerformance = agentPerformanceRows.rows.map((row) => ({
      agentId: Number(row.agent_id),
      agentName: row.agent_name,
      leadsAssigned: Number(row.leads_assigned || 0),
      dealsClosed: Number(row.deals_closed || 0),
      revenueGenerated: Number(row.revenue_generated || 0),
      avgResponseTimeHours: Math.round(Number(row.avg_response_hours || 0) * 10) / 10,
    }));

    const commissionDetails = commissionReportRows.rows.map((row) => ({
      id: Number(row.id),
      propertyId: Number(row.property_id),
      propertyTitle: row.property_title,
      propertyType: row.property_type,
      agentId: Number(row.agent_id),
      agentName: row.agent_name,
      commissionPercent: Number(row.commission_percent || 0),
      commissionAmount: Number(row.commission_amount || 0),
      status: row.status,
      createdAt: row.created_at,
    }));

    return res.json({
      totalListings: Number(listingsRow.total || 0),
      totalRentalListings: Number(rentalsRow.total || 0),
      totalViews: Number(listingsRow.views || 0) + Number(rentalsRow.views || 0),
      totalLeads,
      activeLeads,
      closedDeals,
      conversionRate,
      totalRevenue,
      thisMonthRevenue,
      earnings: {
        commission: totalCommission,
        bookingRevenue,
      },
      boostedListings: Number(boostsRows.rows[0]?.total || 0),
      pendingApproval: Number(pendingRows.rows[0]?.total || 0),
      conversionMonthly,
      conversionFunnel: [
        { stage: 'Leads', count: Number(funnelRow.total_leads || totalLeads) },
        { stage: 'Visits', count: Number(funnelRow.total_visits || 0) },
        { stage: 'Negotiation', count: Number(funnelRow.total_negotiations || 0) },
        { stage: 'Closed', count: Number(funnelRow.total_closed || closedDeals) },
      ],
      revenueMonthly,
      revenueYearly,
      leadSourceBreakdown,
      propertyPerformance,
      performanceHighlights: {
        mostViewedProperty,
        fastestSellingProperty,
        highestRevenueProperty,
      },
      agentPerformance,
      commissionReport: {
        totalCommission,
        rows: commissionDetails,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/boost/:id', async (req, res, next) => {
  try {
    const listingId = Number(req.params.id);
    if (!Number.isFinite(listingId) || listingId <= 0) {
      return res.status(400).json({ error: 'Invalid listing id' });
    }

    const payload = BOOST_SCHEMA.parse(req.body || {});
    if (payload.listingType === 'property') {
      const rows = await pool.query('SELECT id FROM properties WHERE id = $1 AND posted_by = $2 LIMIT 1', [
        listingId,
        req.user.id,
      ]);
      if (rows.rowCount === 0) {
        return res.status(404).json({ error: 'Property not found' });
      }
    } else {
      const rows = await pool.query('SELECT id FROM rentals WHERE id = $1 AND posted_by = $2 LIMIT 1', [
        listingId,
        req.user.id,
      ]);
      if (rows.rowCount === 0) {
        return res.status(404).json({ error: 'Rental not found' });
      }
    }

    const inserted = await pool.query(
      `
        INSERT INTO boosts (
          owner_id,
          property_id,
          rental_id,
          listing_type,
          start_date,
          end_date,
          boost_type,
          amount_paid
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `,
      [
        req.user.id,
        payload.listingType === 'property' ? listingId : null,
        payload.listingType === 'rental' ? listingId : null,
        payload.listingType,
        payload.startDate || null,
        payload.endDate || null,
        payload.boostType,
        payload.amountPaid,
      ]
    );

    return res.status(201).json({ boostId: Number(inserted.rows[0].id) });
  } catch (error) {
    return next(error);
  }
});

router.post('/subscribe', async (req, res, next) => {
  try {
    const payload = SUBSCRIBE_SCHEMA.parse(req.body || {});
    await ensureOwnerProfile(req.user.id);

    const hasOwnerId = await hasColumn('subscriptions', 'owner_id');
    let inserted;

    if (hasOwnerId) {
      inserted = await pool.query(
        `
          INSERT INTO subscriptions (owner_id, plan_name, price, start_date, end_date, status, provider, payment_reference)
          VALUES ($1, $2, $3, $4, $5, 'active', $6, $7)
          RETURNING id
        `,
        [
          req.user.id,
          payload.planName,
          payload.price,
          payload.startDate || null,
          payload.endDate || null,
          payload.provider || null,
          payload.paymentRef || null,
        ]
      );
    } else {
      const planLookup = await pool.query(
        `
          SELECT plan_id, tier
          FROM subscription_plans
          WHERE LOWER(plan_name) = LOWER($1)
             OR LOWER(tier) = LOWER($1)
          ORDER BY is_active DESC, monthly_price ASC
          LIMIT 1
        `,
        [payload.planName]
      );

      const planId = planLookup.rowCount > 0 ? planLookup.rows[0].plan_id : 'free_plan';
      const tier = planLookup.rowCount > 0 ? planLookup.rows[0].tier : 'free';

      inserted = await pool.query(
        `
          INSERT INTO subscriptions (
            user_id,
            plan_id,
            subscription_tier,
            start_date,
            end_date,
            features_json,
            listing_quota,
            boost_credits,
            is_active,
            created_by_user_id
          )
          VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5::date, '{}'::jsonb, 10, 0, TRUE, $1)
          RETURNING id
        `,
        [
          req.user.id,
          planId,
          tier,
          payload.startDate || null,
          payload.endDate || null,
        ]
      );
    }

    await pool.query(
      `
        UPDATE owner_profiles
        SET subscription_plan = $1,
            updated_at = NOW()
        WHERE user_id = $2
      `,
      [payload.planName, req.user.id]
    );

    return res.status(201).json({ subscriptionId: Number(inserted.rows[0].id) });
  } catch (error) {
    return next(error);
  }
});

export default router;
