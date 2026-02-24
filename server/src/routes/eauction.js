import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { requireAuth, requireMainAdmin } from '../middleware/auth.js';

const router = Router();

const categorySchema = z.enum(['plots', 'apartments', 'complex', 'all']);
const sortSchema = z.enum(['official', 'az', 'newest']);
const createCardSchema = z.object({
  name: z.string().trim().min(2).max(180),
  portalUrl: z.string().trim().url().max(2048),
  category: categorySchema.optional().default('all'),
  description: z.string().trim().max(1200).optional().default(''),
  badges: z.array(z.string().trim().min(1).max(40)).max(12).optional().default([]),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.coerce.number().int().min(0).max(10000).optional().default(100),
});

function normalizeCategoryAlias(value) {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  const compact = normalized.replace(/[\s/_-]+/g, '');

  if (compact === 'plot' || compact === 'plots' || compact === 'land' || compact === 'lands') {
    return 'plots';
  }
  if (
    compact === 'apartment' ||
    compact === 'apartments' ||
    compact === 'flat' ||
    compact === 'flats' ||
    compact === 'flatapartment' ||
    compact === 'apartmentflat'
  ) {
    return 'apartments';
  }
  if (compact === 'complex' || compact === 'complexes' || compact === 'commercial') {
    return 'complex';
  }
  if (compact === 'all') {
    return 'all';
  }

  return normalized;
}

function firstQueryValue(value) {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function isSafeHttpUrl(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

router.get('/cards', async (req, res, next) => {
  try {
    const query = z
      .object({
        category: categorySchema.optional().default('all'),
        search: z.string().trim().max(80).optional().default(''),
        sort: sortSchema.optional().default('official'),
      })
      .parse({
        category: normalizeCategoryAlias(firstQueryValue(req.query.category)),
        search: firstQueryValue(req.query.search),
        sort: firstQueryValue(req.query.sort),
      });

    const whereParts = ['is_active = TRUE'];
    const values = [];

    if (query.category !== 'all') {
      values.push(query.category);
      whereParts.push(`(category = $${values.length} OR category = 'all')`);
    }

    if (query.search) {
      values.push(`%${query.search}%`);
      const placeholder = `$${values.length}`;
      whereParts.push(`(name ILIKE ${placeholder} OR description ILIKE ${placeholder})`);
    }

    let orderBy = 'sort_order ASC, name ASC';
    if (query.sort === 'official') {
      orderBy = `('Official' = ANY(badges)) DESC, sort_order ASC, name ASC`;
    } else if (query.sort === 'az') {
      orderBy = 'name ASC, sort_order ASC';
    } else if (query.sort === 'newest') {
      orderBy = 'created_at DESC, sort_order ASC, name ASC';
    }

    const rows = await pool.query(
      `
        SELECT
          id,
          name,
          portal_url,
          category,
          description,
          badges,
          is_active,
          sort_order,
          created_at,
          updated_at
        FROM eauction_sources
        WHERE ${whereParts.join(' AND ')}
        ORDER BY ${orderBy}
      `,
      values
    );

    const cards = rows.rows
      .filter((row) => isSafeHttpUrl(row.portal_url))
      .map((row) => ({
        id: Number(row.id),
        name: String(row.name || ''),
        portalUrl: String(row.portal_url || ''),
        category: String(row.category || 'all'),
        description: String(row.description || ''),
        badges: Array.isArray(row.badges) ? row.badges.map((badge) => String(badge)) : [],
        isActive: Boolean(row.is_active),
        sortOrder: Number(row.sort_order || 100),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

    return res.json({ cards });
  } catch (error) {
    return next(error);
  }
});

router.post('/cards', requireAuth, requireMainAdmin, async (req, res, next) => {
  try {
    const payload = createCardSchema.parse(req.body || {});
    if (!isSafeHttpUrl(payload.portalUrl)) {
      return res.status(400).json({ error: 'Portal URL must be a valid http/https URL.' });
    }

    const badges = Array.from(
      new Set(
        (Array.isArray(payload.badges) ? payload.badges : [])
          .map((item) => String(item || '').trim())
          .filter(Boolean)
      )
    ).slice(0, 12);

    const rows = await pool.query(
      `
        INSERT INTO eauction_sources (
          name,
          portal_url,
          category,
          description,
          badges,
          is_active,
          sort_order
        )
        VALUES ($1, $2, $3, $4, $5::text[], $6, $7)
        RETURNING
          id,
          name,
          portal_url,
          category,
          description,
          badges,
          is_active,
          sort_order,
          created_at,
          updated_at
      `,
      [
        payload.name,
        payload.portalUrl,
        payload.category,
        payload.description || '',
        badges,
        Boolean(payload.isActive),
        payload.sortOrder,
      ]
    );

    const row = rows.rows[0];
    return res.status(201).json({
      card: {
        id: Number(row.id),
        name: String(row.name || ''),
        portalUrl: String(row.portal_url || ''),
        category: String(row.category || 'all'),
        description: String(row.description || ''),
        badges: Array.isArray(row.badges) ? row.badges.map((badge) => String(badge)) : [],
        isActive: Boolean(row.is_active),
        sortOrder: Number(row.sort_order || 100),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      return res.status(409).json({ error: 'This portal URL already exists.' });
    }
    return next(error);
  }
});

router.delete('/cards/:id', requireAuth, requireMainAdmin, async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid card id' });
  }

  try {
    const rows = await pool.query(
      `
        DELETE FROM eauction_sources
        WHERE id = $1
        RETURNING id
      `,
      [id]
    );

    if (rows.rowCount === 0) {
      return res.status(404).json({ error: 'Source not found' });
    }

    return res.json({ deletedId: Number(rows.rows[0].id) });
  } catch (error) {
    return next(error);
  }
});

export default router;
