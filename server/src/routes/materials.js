import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { requireAuth, requireMainAdmin, requirePermission } from '../middleware/auth.js';

const router = Router();

const sortValues = ['featured', 'price_asc', 'price_desc', 'delivery_fast'];

const uuidSchema = z.string().uuid();
const stockValues = ['in_stock', 'limited', 'out_of_stock'];

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

export default router;
