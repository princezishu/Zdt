import { pingDb } from '../db.js';

export async function getHealthStatus(_req, res) {
  // In Cloudflare Workers, the pg TCP connection may not work reliably
  // for a quick ping. Return basic health info and attempt DB ping as
  // optional diagnostic.
  const health = { ok: true, runtime: typeof globalThis.caches !== 'undefined' ? 'cloudflare-worker' : 'node' };

  try {
    await pingDb();
    health.db = 'connected';
  } catch (err) {
    // DB connectivity is not a hard failure for the health check in Workers.
    // The route handlers will report their own DB errors as needed.
    health.db = 'unavailable';
    health.dbError = err.message || 'Connection failed';
  }

  return res.status(200).json(health);
}
