import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';

const router = Router();

const categorySchema = z.enum(['plots', 'apartments', 'complex', 'all']);
const sortSchema = z.enum(['official', 'az', 'newest']);

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

export default router;
