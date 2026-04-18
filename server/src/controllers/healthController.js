import { pingDb } from '../db.js';

export async function getHealthStatus(_req, res) {
  try {
    await pingDb();
    return res.json({ ok: true });
  } catch {
    return res.status(503).json({ ok: false });
  }
}
