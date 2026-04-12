import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { assertListingQuotaAvailable } from '../utils/subscriptions.js';

const router = Router();

const RENTAL_PROPERTY_TYPES = [
  'Apartment',
  'Villa',
  'Plotted',
  'Commercial',
  'Independent House',
  'Studio',
  'Duplex',
  'Shared Room',
];

const FURNISHED_STATUSES = ['unfurnished', 'semi', 'full'];
const TENANT_PREFERENCES = ['family', 'bachelor', 'company', 'students', 'any'];
const RENTAL_MODELS = ['long_term', 'short_term', 'co_living'];

const RENTAL_CACHE_TTL_MS = 60_000;
const rentalsCache = new Map();

function readCache(key) {
  const cached = rentalsCache.get(key);
  if (!cached || cached.expiresAt <= Date.now()) {
    if (cached) rentalsCache.delete(key);
    return null;
  }
  return cached.value;
}

function writeCache(key, value) {
  rentalsCache.set(key, { value, expiresAt: Date.now() + RENTAL_CACHE_TTL_MS });
}

function parseCommaList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => String(entry || '').split(','))
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function toNullableNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toNullableInt(value) {
  const num = toNullableNumber(value);
  if (num === null) return null;
  return Number.isInteger(num) ? num : Math.round(num);
}

function mapRental(row) {
  const images = Array.isArray(row.image_urls) ? row.image_urls : [];
  const publicContactPhone = String(row.public_contact_phone || row.phone || '').trim();
  return {
    id: Number(row.id),
    title: row.title,
    description: row.description || '',
    monthlyRent: row.monthly_rent === null ? null : Number(row.monthly_rent),
    securityDeposit: row.security_deposit === null ? null : Number(row.security_deposit),
    maintenanceCharges: row.maintenance_charges === null ? null : Number(row.maintenance_charges),
    maintenanceIncluded: Boolean(row.maintenance_included),
    city: row.city,
    locality: row.locality || '',
    address: row.address || '',
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    propertyType: row.property_type,
    bhk: row.bhk === null ? null : Number(row.bhk),
    carpetArea: row.carpet_area === null ? null : Number(row.carpet_area),
    furnishedStatus: row.furnished_status,
    tenantPreference: row.tenant_preference,
    availableFrom: row.available_from,
    leaseDuration: row.lease_duration,
    noticePeriod: row.notice_period || '',
    parking: row.parking || 'NA',
    ownerName: row.owner_name || '',
    builderName: row.builder_name || '',
    companyName: row.company_name || '',
    publicContactPhone: publicContactPhone || undefined,
    petsAllowed: Boolean(row.pets_allowed),
    smokingAllowed: Boolean(row.smoking_allowed),
    rentalModel: row.rental_model,
    nightlyRate: row.nightly_rate === null ? null : Number(row.nightly_rate),
    weeklyRate: row.weekly_rate === null ? null : Number(row.weekly_rate),
    cleaningFee: row.cleaning_fee === null ? null : Number(row.cleaning_fee),
    serviceFee: row.service_fee === null ? null : Number(row.service_fee),
    seatsAvailable: row.seats_available === null ? null : Number(row.seats_available),
    imageUrls: images,
    primaryImage: images[0] || '',
    virtualTourUrl: row.virtual_tour_url || '',
    postedBy: row.posted_by ? Number(row.posted_by) : null,
    isVerified: Boolean(row.is_verified),
    isFeatured: Boolean(row.is_featured),
    viewCount: Number(row.view_count || 0),
    amenities: Array.isArray(row.amenities) ? row.amenities : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const createRentalSchema = z.object({
  title: z.string().trim().min(4).max(220),
  description: z.string().trim().max(9000).optional().default(''),
  monthlyRent: z.union([z.coerce.number(), z.null()]).optional(),
  securityDeposit: z.union([z.coerce.number(), z.null()]).optional(),
  maintenanceCharges: z.union([z.coerce.number(), z.null()]).optional(),
  maintenanceIncluded: z.boolean().optional().default(false),
  city: z.string().trim().min(2).max(120),
  locality: z.string().trim().max(160).optional().default(''),
  address: z.string().trim().max(1000).optional().default(''),
  latitude: z.union([z.coerce.number(), z.null()]).optional(),
  longitude: z.union([z.coerce.number(), z.null()]).optional(),
  propertyType: z.enum(RENTAL_PROPERTY_TYPES),
  bhk: z.union([z.coerce.number().int(), z.null()]).optional(),
  carpetArea: z.union([z.coerce.number(), z.null()]).optional(),
  furnishedStatus: z.enum(FURNISHED_STATUSES).optional().default('unfurnished'),
  tenantPreference: z.enum(TENANT_PREFERENCES).optional().default('any'),
  availableFrom: z.string().trim().max(20).optional().or(z.literal('')),
  leaseDuration: z.string().trim().max(40).optional().default('11 months'),
  noticePeriod: z.string().trim().max(40).optional().default(''),
  parking: z.string().trim().max(40).optional().default('NA'),
  petsAllowed: z.boolean().optional().default(false),
  smokingAllowed: z.boolean().optional().default(false),
  rentalModel: z.enum(RENTAL_MODELS).optional().default('long_term'),
  nightlyRate: z.union([z.coerce.number(), z.null()]).optional(),
  weeklyRate: z.union([z.coerce.number(), z.null()]).optional(),
  cleaningFee: z.union([z.coerce.number(), z.null()]).optional(),
  serviceFee: z.union([z.coerce.number(), z.null()]).optional(),
  seatsAvailable: z.union([z.coerce.number().int(), z.null()]).optional(),
  imageUrls: z.array(z.string().trim().url().max(1000)).max(30).optional().default([]),
  virtualTourUrl: z.string().trim().url().max(1200).optional().or(z.literal('')),
  amenityIds: z.array(z.coerce.number().int().positive()).optional().default([]),
  isVerified: z.boolean().optional().default(false),
  isFeatured: z.boolean().optional().default(false),
});

const updateRentalSchema = createRentalSchema.partial();

const listRentalsQuerySchema = z.object({
  city: z.string().trim().max(120).optional().default(''),
  minRent: z.coerce.number().nonnegative().optional(),
  maxRent: z.coerce.number().nonnegative().optional(),
  bhk: z.string().trim().max(24).optional().default(''),
  furnished: z.string().trim().max(20).optional().default(''),
  tenants: z.string().trim().max(24).optional().default(''),
  availability: z.string().trim().max(24).optional().default(''),
  type: z.string().trim().max(40).optional().default(''),
  rentalModel: z.enum(RENTAL_MODELS).optional(),
  minDeposit: z.coerce.number().nonnegative().optional(),
  maxDeposit: z.coerce.number().nonnegative().optional(),
  maintenanceIncluded: z.enum(['true', 'false']).optional().default('false'),
  amenities: z.string().trim().max(400).optional().default(''),
  sort: z
    .enum(['recommended', 'rent_low', 'rent_high', 'newest', 'verified'])
    .optional()
    .default('recommended'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(60).optional().default(24),
});

const rentalsSearchLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 140,
  message: 'Too many rental search requests. Please try again shortly.',
});
const leadLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 12, message: 'Too many lead requests.' });
const bookingLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 6, message: 'Too many booking requests.' });

router.get('/', rentalsSearchLimiter, async (req, res, next) => {
  try {
    const query = listRentalsQuerySchema.parse({
      city: req.query.city,
      minRent: req.query.minRent,
      maxRent: req.query.maxRent,
      bhk: req.query.bhk,
      furnished: req.query.furnished,
      tenants: req.query.tenants,
      availability: req.query.availability,
      type: req.query.type,
      rentalModel: req.query.rentalModel,
      minDeposit: req.query.minDeposit,
      maxDeposit: req.query.maxDeposit,
      maintenanceIncluded: req.query.maintenanceIncluded,
      amenities: req.query.amenities,
      sort: req.query.sort,
      page: req.query.page,
      limit: req.query.limit,
    });

    const cacheKey = JSON.stringify(query);
    const cached = readCache(cacheKey);
    if (cached) return res.json(cached);

    const whereParts = ['1 = 1'];
    const values = [];
    const havingParts = [];

    if (query.city) {
      values.push(`%${query.city}%`);
      whereParts.push(`r.city ILIKE $${values.length}`);
    }

    if (query.minRent !== undefined) {
      values.push(query.minRent);
      whereParts.push(`r.monthly_rent >= $${values.length}`);
    }

    if (query.maxRent !== undefined) {
      values.push(query.maxRent);
      whereParts.push(`r.monthly_rent <= $${values.length}`);
    }

    if (query.minDeposit !== undefined) {
      values.push(query.minDeposit);
      whereParts.push(`r.security_deposit >= $${values.length}`);
    }

    if (query.maxDeposit !== undefined) {
      values.push(query.maxDeposit);
      whereParts.push(`r.security_deposit <= $${values.length}`);
    }

    if (query.bhk) {
      const normalizedBhk = query.bhk.trim().toLowerCase();
      if (normalizedBhk === 'studio') {
        whereParts.push(`(r.property_type = 'Studio' OR r.bhk = 0)`);
      } else if (normalizedBhk === 'shared' || normalizedBhk === 'shared room') {
        whereParts.push(`r.property_type = 'Shared Room'`);
      } else if (normalizedBhk.includes('+')) {
        const base = Number(normalizedBhk.replace('+', ''));
        if (Number.isFinite(base)) {
          values.push(base);
          whereParts.push(`r.bhk >= $${values.length}`);
        }
      } else {
        const bhkNumber = Number(normalizedBhk);
        if (Number.isFinite(bhkNumber)) {
          values.push(bhkNumber);
          whereParts.push(`r.bhk = $${values.length}`);
        }
      }
    }

    if (query.furnished) {
      values.push(query.furnished);
      whereParts.push(`r.furnished_status = $${values.length}`);
    }

    if (query.tenants) {
      values.push(query.tenants);
      whereParts.push(`r.tenant_preference = $${values.length}`);
    }

    if (query.availability) {
      const now = new Date();
      let targetDays = 0;
      if (query.availability === '15') targetDays = 15;
      if (query.availability === '30') targetDays = 30;
      if (query.availability === 'immediate') targetDays = 0;
      if (targetDays >= 0) {
        values.push(targetDays);
        whereParts.push(`r.available_from <= (CURRENT_DATE + ($${values.length}::int || ' days')::interval)`);
      }
    }

    if (query.type) {
      const types = parseCommaList(query.type);
      if (types.length > 0) {
        values.push(types);
        whereParts.push(`r.property_type = ANY($${values.length}::TEXT[])`);
      }
    }

    if (query.rentalModel) {
      values.push(query.rentalModel);
      whereParts.push(`r.rental_model = $${values.length}`);
    }

    if (query.maintenanceIncluded === 'true') {
      whereParts.push('r.maintenance_included = TRUE');
    }

    const amenityFilters = parseCommaList(query.amenities)
      .map((item) =>
        String(item || '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
      )
      .filter(Boolean);

    if (amenityFilters.length > 0) {
      values.push(amenityFilters);
      values.push(amenityFilters.length);
      const listIndex = values.length - 1;
      const countIndex = values.length;
      havingParts.push(
        `COUNT(DISTINCT CASE WHEN ra.slug = ANY($${listIndex}::TEXT[]) THEN ra.slug END) = $${countIndex}`
      );
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, query.limit || 24);
    const offset = (page - 1) * limit;

    let orderBy = 'r.created_at DESC';
    if (query.sort === 'rent_low') orderBy = 'r.monthly_rent ASC NULLS LAST';
    if (query.sort === 'rent_high') orderBy = 'r.monthly_rent DESC NULLS LAST';
    if (query.sort === 'newest') orderBy = 'r.created_at DESC';
    if (query.sort === 'verified') orderBy = 'r.is_verified DESC, r.created_at DESC';
    if (query.sort === 'recommended') {
      orderBy = 'r.is_featured DESC, r.is_verified DESC, r.view_count DESC, r.created_at DESC';
    }

    values.push(limit);
    values.push(offset);

    const rows = await pool.query(
      `
        SELECT
          r.*,
          COALESCE(array_remove(array_agg(DISTINCT ra.name), NULL), ARRAY[]::TEXT[]) AS amenities,
          COUNT(*) OVER() AS total_count
        FROM rentals r
        LEFT JOIN rental_property_amenities rpa
          ON rpa.rental_id = r.id
        LEFT JOIN rental_amenities ra
          ON ra.id = rpa.amenity_id
        WHERE ${whereParts.join(' AND ')}
        GROUP BY r.id
        ${havingParts.length > 0 ? `HAVING ${havingParts.join(' AND ')}` : ''}
        ORDER BY ${orderBy}
        LIMIT $${values.length - 1}
        OFFSET $${values.length}
      `,
      values
    );

    const total = rows.rowCount > 0 ? Number(rows.rows[0].total_count || 0) : 0;
    const payload = {
      rentals: rows.rows.map(mapRental),
      total,
      page,
      pageSize: limit,
    };
    writeCache(cacheKey, payload);
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
});

router.post('/', requireAuth, requireRole('owner', 'agent', 'admin'), async (req, res, next) => {
  try {
    const payload = createRentalSchema.parse(req.body || {});
    await assertListingQuotaAvailable(pool, req.user.id);

    const inserted = await pool.query(
      `
        INSERT INTO rentals (
          title,
          description,
          monthly_rent,
          security_deposit,
          maintenance_charges,
          maintenance_included,
          city,
          locality,
          address,
          latitude,
          longitude,
          property_type,
          bhk,
          carpet_area,
          furnished_status,
          tenant_preference,
          available_from,
          lease_duration,
          notice_period,
          parking,
          pets_allowed,
          smoking_allowed,
          rental_model,
          nightly_rate,
          weekly_rate,
          cleaning_fee,
          service_fee,
          seats_available,
          image_urls,
          virtual_tour_url,
          posted_by,
          is_verified,
          is_featured
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33
        )
        RETURNING id
      `,
      [
        payload.title,
        payload.description || '',
        toNullableNumber(payload.monthlyRent),
        toNullableNumber(payload.securityDeposit),
        toNullableNumber(payload.maintenanceCharges),
        Boolean(payload.maintenanceIncluded),
        payload.city,
        payload.locality || '',
        payload.address || '',
        toNullableNumber(payload.latitude),
        toNullableNumber(payload.longitude),
        payload.propertyType,
        toNullableInt(payload.bhk),
        toNullableNumber(payload.carpetArea),
        payload.furnishedStatus || 'unfurnished',
        payload.tenantPreference || 'any',
        payload.availableFrom || null,
        payload.leaseDuration || '11 months',
        payload.noticePeriod || '',
        payload.parking || 'NA',
        Boolean(payload.petsAllowed),
        Boolean(payload.smokingAllowed),
        payload.rentalModel || 'long_term',
        toNullableNumber(payload.nightlyRate),
        toNullableNumber(payload.weeklyRate),
        toNullableNumber(payload.cleaningFee),
        toNullableNumber(payload.serviceFee),
        toNullableInt(payload.seatsAvailable),
        payload.imageUrls || [],
        payload.virtualTourUrl || '',
        req.user.id,
        Boolean(payload.isVerified),
        Boolean(payload.isFeatured),
      ]
    );

    const rentalId = Number(inserted.rows[0].id);
    const amenityIds = [...new Set((payload.amenityIds || []).map((id) => Number(id)).filter((id) => id > 0))];
    if (amenityIds.length > 0) {
      const amenityRows = await pool.query('SELECT id FROM rental_amenities WHERE id = ANY($1::BIGINT[])', [
        amenityIds,
      ]);
      if (amenityRows.rowCount !== amenityIds.length) {
        return res.status(400).json({ error: 'One or more amenity ids are invalid' });
      }
      await pool.query(
        `
          INSERT INTO rental_property_amenities (rental_id, amenity_id)
          SELECT $1, UNNEST($2::BIGINT[])
          ON CONFLICT (rental_id, amenity_id) DO NOTHING
        `,
        [rentalId, amenityIds]
      );
    }

    rentalsCache.clear();
    const rentalRows = await pool.query(
      `
        SELECT r.*, COALESCE(array_remove(array_agg(DISTINCT ra.name), NULL), ARRAY[]::TEXT[]) AS amenities
        FROM rentals r
        LEFT JOIN rental_property_amenities rpa ON rpa.rental_id = r.id
        LEFT JOIN rental_amenities ra ON ra.id = rpa.amenity_id
        WHERE r.id = $1
        GROUP BY r.id
        LIMIT 1
      `,
      [rentalId]
    );

    return res.status(201).json({ rental: mapRental(rentalRows.rows[0]) });
  } catch (error) {
    return next(error);
  }
});

router.post('/saved/:rentalId', requireAuth, async (req, res, next) => {
  try {
    const rentalId = Number(req.params.rentalId);
    if (!Number.isFinite(rentalId) || rentalId <= 0) {
      return res.status(400).json({ error: 'Invalid rental id' });
    }

    await pool.query(
      `INSERT INTO saved_rentals (user_id, rental_id) VALUES ($1, $2) ON CONFLICT (user_id, rental_id) DO NOTHING`,
      [req.user.id, rentalId]
    );

    return res.status(201).json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.delete('/saved/:rentalId', requireAuth, async (req, res, next) => {
  try {
    const rentalId = Number(req.params.rentalId);
    if (!Number.isFinite(rentalId) || rentalId <= 0) {
      return res.status(400).json({ error: 'Invalid rental id' });
    }

    await pool.query('DELETE FROM saved_rentals WHERE user_id = $1 AND rental_id = $2', [req.user.id, rentalId]);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.get('/saved', requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 24, 1), 60);
    const rows = await pool.query(
      `
        SELECT r.*, COALESCE(array_remove(array_agg(DISTINCT ra.name), NULL), ARRAY[]::TEXT[]) AS amenities
        FROM saved_rentals sr
        JOIN rentals r ON r.id = sr.rental_id
        LEFT JOIN rental_property_amenities rpa ON rpa.rental_id = r.id
        LEFT JOIN rental_amenities ra ON ra.id = rpa.amenity_id
        WHERE sr.user_id = $1
        GROUP BY r.id
        ORDER BY sr.created_at DESC
        LIMIT $2
      `,
      [req.user.id, limit]
    );

    return res.json({ rentals: rows.rows.map(mapRental) });
  } catch (error) {
    return next(error);
  }
});

router.post('/leads', leadLimiter, requireAuth, async (req, res, next) => {
  try {
    const payload = z
      .object({
        rentalId: z.coerce.number().int().positive(),
        message: z.string().trim().min(4).max(2000),
      })
      .parse(req.body || {});

    const exists = await pool.query('SELECT id FROM rentals WHERE id = $1 LIMIT 1', [payload.rentalId]);
    if (exists.rowCount === 0) {
      return res.status(404).json({ error: 'Rental not found' });
    }

    const rows = await pool.query(
      `
        INSERT INTO rental_leads (rental_id, user_id, message)
        VALUES ($1, $2, $3)
        RETURNING id, created_at
      `,
      [payload.rentalId, req.user.id, payload.message]
    );

    return res.status(201).json({ ok: true, leadId: rows.rows[0].id, createdAt: rows.rows[0].created_at });
  } catch (error) {
    return next(error);
  }
});

router.post('/book', bookingLimiter, requireAuth, async (req, res, next) => {
  try {
    const payload = z
      .object({
        rentalId: z.coerce.number().int().positive(),
        checkIn: z.string().trim().min(4).max(20),
        checkOut: z.string().trim().min(4).max(20),
        totalPrice: z.coerce.number().nonnegative(),
      })
      .parse(req.body || {});

    const exists = await pool.query('SELECT id, rental_model FROM rentals WHERE id = $1 LIMIT 1', [payload.rentalId]);
    if (exists.rowCount === 0) {
      return res.status(404).json({ error: 'Rental not found' });
    }

    if (exists.rows[0].rental_model !== 'short_term') {
      return res.status(400).json({ error: 'Booking is only available for short-term rentals.' });
    }

    const rows = await pool.query(
      `
        INSERT INTO rental_bookings (rental_id, user_id, check_in, check_out, total_price)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, status, created_at
      `,
      [payload.rentalId, req.user.id, payload.checkIn, payload.checkOut, payload.totalPrice]
    );

    return res.status(201).json({
      ok: true,
      bookingId: rows.rows[0].id,
      status: rows.rows[0].status,
      createdAt: rows.rows[0].created_at,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const rentalId = Number(req.params.id);
    if (!Number.isFinite(rentalId) || rentalId <= 0) {
      return res.status(400).json({ error: 'Invalid rental id' });
    }

    await pool.query(
      `UPDATE rentals SET view_count = COALESCE(view_count, 0) + 1 WHERE id = $1`,
      [rentalId]
    );

    const rows = await pool.query(
      `
        SELECT
          r.*,
          COALESCE(array_remove(array_agg(DISTINCT ra.name), NULL), ARRAY[]::TEXT[]) AS amenities
        FROM rentals r
        LEFT JOIN rental_property_amenities rpa
          ON rpa.rental_id = r.id
        LEFT JOIN rental_amenities ra
          ON ra.id = rpa.amenity_id
        WHERE r.id = $1
        GROUP BY r.id
        LIMIT 1
      `,
      [rentalId]
    );

    if (rows.rowCount === 0) {
      return res.status(404).json({ error: 'Rental not found' });
    }

    return res.json({ rental: mapRental(rows.rows[0]) });
  } catch (error) {
    return next(error);
  }
});

router.put('/:id', requireAuth, requireRole('owner', 'agent', 'admin'), async (req, res, next) => {
  try {
    const rentalId = Number(req.params.id);
    if (!Number.isFinite(rentalId) || rentalId <= 0) {
      return res.status(400).json({ error: 'Invalid rental id' });
    }

    const payload = updateRentalSchema.parse(req.body || {});
    if (!payload || Object.keys(payload).length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    const rows = await pool.query('SELECT posted_by FROM rentals WHERE id = $1 LIMIT 1', [rentalId]);
    if (rows.rowCount === 0) {
      return res.status(404).json({ error: 'Rental not found' });
    }

    const ownerId = rows.rows[0].posted_by;
    if (req.user.role !== 'admin' && ownerId !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to update this rental' });
    }

    const updates = [];
    const values = [];
    const pushUpdate = (column, value) => {
      if (value === undefined) return;
      values.push(value);
      updates.push(`${column} = $${values.length}`);
    };

    pushUpdate('title', payload.title);
    pushUpdate('description', payload.description);
    pushUpdate('monthly_rent', payload.monthlyRent === undefined ? undefined : toNullableNumber(payload.monthlyRent));
    pushUpdate(
      'security_deposit',
      payload.securityDeposit === undefined ? undefined : toNullableNumber(payload.securityDeposit)
    );
    pushUpdate(
      'maintenance_charges',
      payload.maintenanceCharges === undefined ? undefined : toNullableNumber(payload.maintenanceCharges)
    );
    pushUpdate('maintenance_included', payload.maintenanceIncluded);
    pushUpdate('city', payload.city);
    pushUpdate('locality', payload.locality);
    pushUpdate('address', payload.address);
    pushUpdate('latitude', payload.latitude === undefined ? undefined : toNullableNumber(payload.latitude));
    pushUpdate('longitude', payload.longitude === undefined ? undefined : toNullableNumber(payload.longitude));
    pushUpdate('property_type', payload.propertyType);
    pushUpdate('bhk', payload.bhk === undefined ? undefined : toNullableInt(payload.bhk));
    pushUpdate('carpet_area', payload.carpetArea === undefined ? undefined : toNullableNumber(payload.carpetArea));
    pushUpdate('furnished_status', payload.furnishedStatus);
    pushUpdate('tenant_preference', payload.tenantPreference);
    pushUpdate('available_from', payload.availableFrom || null);
    pushUpdate('lease_duration', payload.leaseDuration);
    pushUpdate('notice_period', payload.noticePeriod);
    pushUpdate('parking', payload.parking);
    pushUpdate('pets_allowed', payload.petsAllowed);
    pushUpdate('smoking_allowed', payload.smokingAllowed);
    pushUpdate('rental_model', payload.rentalModel);
    pushUpdate('nightly_rate', payload.nightlyRate === undefined ? undefined : toNullableNumber(payload.nightlyRate));
    pushUpdate('weekly_rate', payload.weeklyRate === undefined ? undefined : toNullableNumber(payload.weeklyRate));
    pushUpdate('cleaning_fee', payload.cleaningFee === undefined ? undefined : toNullableNumber(payload.cleaningFee));
    pushUpdate('service_fee', payload.serviceFee === undefined ? undefined : toNullableNumber(payload.serviceFee));
    pushUpdate('seats_available', payload.seatsAvailable === undefined ? undefined : toNullableInt(payload.seatsAvailable));
    pushUpdate('image_urls', payload.imageUrls);
    pushUpdate('virtual_tour_url', payload.virtualTourUrl);
    pushUpdate('is_verified', payload.isVerified);
    pushUpdate('is_featured', payload.isFeatured);

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    values.push(rentalId);
    await pool.query(
      `UPDATE rentals SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`,
      values
    );

    if (payload.amenityIds) {
      const amenityIds = [...new Set(payload.amenityIds.map((id) => Number(id)).filter((id) => id > 0))];
      await pool.query('DELETE FROM rental_property_amenities WHERE rental_id = $1', [rentalId]);
      if (amenityIds.length > 0) {
        const amenityRows = await pool.query('SELECT id FROM rental_amenities WHERE id = ANY($1::BIGINT[])', [
          amenityIds,
        ]);
        if (amenityRows.rowCount !== amenityIds.length) {
          return res.status(400).json({ error: 'One or more amenity ids are invalid' });
        }
        await pool.query(
          `
            INSERT INTO rental_property_amenities (rental_id, amenity_id)
            SELECT $1, UNNEST($2::BIGINT[])
            ON CONFLICT (rental_id, amenity_id) DO NOTHING
          `,
          [rentalId, amenityIds]
        );
      }
    }

    rentalsCache.clear();
    const refreshed = await pool.query(
      `
        SELECT r.*, COALESCE(array_remove(array_agg(DISTINCT ra.name), NULL), ARRAY[]::TEXT[]) AS amenities
        FROM rentals r
        LEFT JOIN rental_property_amenities rpa ON rpa.rental_id = r.id
        LEFT JOIN rental_amenities ra ON ra.id = rpa.amenity_id
        WHERE r.id = $1
        GROUP BY r.id
        LIMIT 1
      `,
      [rentalId]
    );

    return res.json({ rental: mapRental(refreshed.rows[0]) });
  } catch (error) {
    return next(error);
  }
});

router.delete('/:id', requireAuth, requireRole('owner', 'agent', 'admin'), async (req, res, next) => {
  try {
    const rentalId = Number(req.params.id);
    if (!Number.isFinite(rentalId) || rentalId <= 0) {
      return res.status(400).json({ error: 'Invalid rental id' });
    }

    const rows = await pool.query('SELECT posted_by FROM rentals WHERE id = $1 LIMIT 1', [rentalId]);
    if (rows.rowCount === 0) {
      return res.status(404).json({ error: 'Rental not found' });
    }

    const ownerId = rows.rows[0].posted_by;
    if (req.user.role !== 'admin' && ownerId !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to delete this rental' });
    }

    await pool.query('DELETE FROM rentals WHERE id = $1', [rentalId]);
    rentalsCache.clear();
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.get('/admin/rental-analytics', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const leadRows = await pool.query('SELECT COUNT(*)::INT AS total_leads FROM rental_leads');
    const activeRows = await pool.query(
      `SELECT COUNT(*)::INT AS active_rentals FROM rentals WHERE is_verified = TRUE`
    );
    const bookingRows = await pool.query(
      `SELECT COALESCE(SUM(total_price), 0) AS booking_revenue FROM rental_bookings WHERE status = 'confirmed'`
    );
    const areaRows = await pool.query(
      `
        SELECT city, locality, COUNT(*)::INT AS count
        FROM rentals
        GROUP BY city, locality
        ORDER BY count DESC
        LIMIT 5
      `
    );

    return res.json({
      totalRentalLeads: Number(leadRows.rows[0].total_leads || 0),
      activeRentals: Number(activeRows.rows[0].active_rentals || 0),
      monthlyRevenue: Number(bookingRows.rows[0].booking_revenue || 0),
      bookingRevenue: Number(bookingRows.rows[0].booking_revenue || 0),
      topAreas: areaRows.rows.map((row) => ({
        city: row.city,
        locality: row.locality,
        count: Number(row.count || 0),
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.put('/admin/approve-rental/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const rentalId = Number(req.params.id);
    if (!Number.isFinite(rentalId) || rentalId <= 0) {
      return res.status(400).json({ error: 'Invalid rental id' });
    }

    const rows = await pool.query(
      `UPDATE rentals SET is_verified = TRUE, updated_at = NOW() WHERE id = $1 RETURNING id, is_verified`,
      [rentalId]
    );

    if (rows.rowCount === 0) {
      return res.status(404).json({ error: 'Rental not found' });
    }

    rentalsCache.clear();
    return res.json({ rentalId: Number(rows.rows[0].id), isVerified: Boolean(rows.rows[0].is_verified) });
  } catch (error) {
    return next(error);
  }
});

export default router;
