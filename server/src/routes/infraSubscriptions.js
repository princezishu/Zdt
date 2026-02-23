import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';

const router = Router();

const CHANNEL_VALUES = ['WHATSAPP', 'EMAIL'];

const createSchema = z.object({
  state: z.string().trim().min(1).max(80),
  district: z.string().trim().min(1).max(120),
  city: z.string().trim().min(1).max(120),
  channel: z.enum(CHANNEL_VALUES),
  contact: z.string().trim().min(6).max(200),
});

const unsubscribeSchema = z.object({
  token: z.string().trim().min(10).max(200),
});

function ensureAdminToken(req, res) {
  const configuredToken = String(process.env.ADMIN_TOKEN || '').trim();
  const incomingToken = req.header('x-admin-token');

  if (!configuredToken || incomingToken !== configuredToken) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }

  return true;
}

function normalizeCreateBody(rawBody) {
  const raw = rawBody && typeof rawBody === 'object' ? rawBody : {};
  return {
    state: raw.state,
    district: raw.district,
    city: raw.city,
    channel: String(raw.channel || '').trim().toUpperCase(),
    contact: String(raw.contact || '').trim(),
  };
}

router.get('/infra-subscriptions', async (req, res, next) => {
  if (!ensureAdminToken(req, res)) return;

  try {
    const city = String(req.query.city || '').trim();
    const channel = String(req.query.channel || '').trim().toUpperCase();
    const q = String(req.query.q || '').trim();
    const state = String(req.query.state || '').trim();
    const district = String(req.query.district || '').trim();
    const includeInactive = String(req.query.include_inactive || '').trim().toLowerCase() === 'true';

    const where = [];
    const values = [];

    if (!includeInactive) {
      where.push(`is_active = TRUE`);
    }

    if (state) {
      values.push(state);
      where.push(`LOWER(state) = LOWER($${values.length})`);
    }

    if (district) {
      values.push(district);
      where.push(`LOWER(district) = LOWER($${values.length})`);
    }

    if (city) {
      values.push(city);
      where.push(`LOWER(city) = LOWER($${values.length})`);
    }

    if (channel) {
      values.push(channel);
      where.push(`channel = $${values.length}`);
    }

    if (q) {
      values.push(`%${q}%`);
      where.push(`contact ILIKE $${values.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const result = await pool.query(
      `
        SELECT
          id,
          state,
          district,
          city,
          channel,
          contact,
          consent,
          is_active AS "isActive",
          unsubscribe_token AS "unsubscribeToken",
          unsubscribed_at AS "unsubscribedAt",
          created_at AS "createdAt"
        FROM infra_subscriptions
        ${whereSql}
        ORDER BY created_at DESC, id DESC
        LIMIT 500
      `,
      values
    );

    return res.json({ items: result.rows });
  } catch (error) {
    return next(error);
  }
});

router.post('/infra-subscriptions', async (req, res, next) => {
  try {
    const payload = createSchema.parse(normalizeCreateBody(req.body));

    if (
      payload.channel === 'EMAIL' &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.contact)
    ) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    if (
      payload.channel === 'WHATSAPP' &&
      !/^[0-9+\s-]{8,20}$/.test(payload.contact)
    ) {
      return res.status(400).json({ error: 'Invalid phone number' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const result = await pool.query(
      `
        INSERT INTO infra_subscriptions (
          state,
          district,
          city,
          channel,
          contact,
          consent,
          is_active,
          unsubscribe_token
        )
        VALUES ($1, $2, $3, $4, $5, TRUE, TRUE, $6)
        RETURNING
          id,
          state,
          district,
          city,
          channel,
          contact,
          consent,
          is_active AS "isActive",
          unsubscribe_token AS "unsubscribeToken",
          unsubscribed_at AS "unsubscribedAt",
          created_at AS "createdAt"
      `,
      [
        payload.state,
        payload.district,
        payload.city,
        payload.channel,
        payload.contact,
        token,
      ]
    );

    return res.status(201).json({ subscription: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.post('/infra-subscriptions/unsubscribe', async (req, res, next) => {
  try {
    const payload = unsubscribeSchema.parse(req.body || {});
    const result = await pool.query(
      `
        UPDATE infra_subscriptions
        SET is_active = FALSE,
            unsubscribed_at = NOW()
        WHERE unsubscribe_token = $1
          AND is_active = TRUE
        RETURNING id
      `,
      [payload.token]
    );

    return res.json({ ok: true, changed: result.rowCount > 0 });
  } catch (error) {
    return next(error);
  }
});

router.delete('/infra-subscriptions/:id', async (req, res, next) => {
  if (!ensureAdminToken(req, res)) return;

  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const result = await pool.query(
      `
        DELETE FROM infra_subscriptions
        WHERE id = $1
        RETURNING id
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Not found' });
    }

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

export default router;
