import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const { JWT_SECRET = '', JWT_EXPIRES_IN = '7d' } = process.env;

const router = Router();

const registerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(190),
  password: z.string().min(8).max(128),
  phone: z.string().max(32).optional().or(z.literal('')),
});

const loginSchema = z.object({
  email: z.string().email().max(190),
  password: z.string().min(8).max(128),
});

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

router.post('/register', async (req, res, next) => {
  try {
    const payload = registerSchema.parse(req.body);
    const email = payload.email.toLowerCase();

    const existingRows = await pool.query(
      'SELECT id FROM users WHERE email = $1 LIMIT 1',
      [email]
    );

    if (existingRows.rowCount > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(payload.password, 12);

    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash, phone) VALUES ($1, $2, $3, $4) RETURNING id',
      [payload.name.trim(), email, passwordHash, payload.phone || null]
    );

    const user = {
      id: result.rows[0].id,
      name: payload.name.trim(),
      email,
    };

    const token = signToken(user);
    return res.status(201).json({ token, user });
  } catch (error) {
    return next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const payload = loginSchema.parse(req.body);
    const email = payload.email.toLowerCase();

    const rows = await pool.query(
      'SELECT id, name, email, password_hash FROM users WHERE email = $1 LIMIT 1',
      [email]
    );

    if (rows.rowCount === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const userRow = rows.rows[0];
    const ok = await bcrypt.compare(payload.password, userRow.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
    };

    const token = signToken(user);
    return res.json({ token, user });
  } catch (error) {
    return next(error);
  }
});

router.get('/me', requireAuth, async (req, res) => {
  const rows = await pool.query(
    'SELECT id, name, email, phone, created_at FROM users WHERE id = $1 LIMIT 1',
    [req.user.id]
  );

  if (rows.rowCount === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  return res.json({ user: rows.rows[0] });
});

export default router;
