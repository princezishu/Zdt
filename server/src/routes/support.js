import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
const adminRouter = Router();

const createContributionSchema = z.object({
  name: z.string().trim().max(120).optional().default(''),
  amount: z.coerce.number().int().min(10).max(10000000),
  message: z.string().trim().max(2000).optional().default(''),
  upiReference: z.string().trim().min(6).max(80),
  consentToRecord: z.literal(true),
  consentToAcknowledge: z.boolean().optional().default(false),
});

const adminListQuerySchema = z.object({
  status: z.enum(['all', 'pending', 'verified', 'rejected']).optional().default('all'),
  limit: z.coerce.number().int().min(1).max(500).optional().default(250),
});

const adminUpdateStatusSchema = z.object({
  status: z.enum(['Pending', 'Verified', 'Rejected']),
  verificationNote: z.string().trim().max(500).optional().default(''),
  correctedAmount: z.coerce.number().int().min(10).max(10000000).optional(),
  adminReplyMessage: z.string().trim().max(500).optional().default(''),
});

const submissionLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 12,
  message: 'Too many contribution submissions. Please try again later.',
});

function normalizeSupportQrUrl(rawValue) {
  if (!rawValue) return '';
  const value = String(rawValue).trim();
  if (!value) return '';

  if (/^https?:\/\/\S+$/i.test(value)) {
    return value;
  }

  if (value.startsWith('/')) {
    return value;
  }

  if (/^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/i.test(value)) {
    return value;
  }

  return '';
}

function requestOrigin(req) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const forwardedHost = req.headers['x-forwarded-host'];
  const protocol =
    typeof forwardedProto === 'string' && forwardedProto.trim()
      ? forwardedProto.split(',')[0].trim()
      : req.protocol;
  const host =
    typeof forwardedHost === 'string' && forwardedHost.trim()
      ? forwardedHost.split(',')[0].trim()
      : req.get('host');

  if (!host) return '';
  return `${protocol}://${host}`;
}

function resolveSupportQrUrl(rawValue, req) {
  const normalized = normalizeSupportQrUrl(rawValue);
  if (!normalized) return '';

  if (normalized.startsWith('/')) {
    const origin = requestOrigin(req);
    return origin ? `${origin}${normalized}` : normalized;
  }

  return normalized;
}

function normalizeIpAddress(rawValue) {
  if (!rawValue) return '';
  return String(rawValue).split(',')[0].trim().slice(0, 64);
}

function mapContributionRow(row) {
  return {
    id: Number(row.id),
    name: row.supporter_name || '',
    amount: Number(row.amount_inr || 0),
    reportedAmount: Number(row.reported_amount_inr || row.amount_inr || 0),
    message: row.message || '',
    upiReference: row.upi_reference || '',
    consentToRecord: Boolean(row.consent_to_record),
    consentToAcknowledge: Boolean(row.consent_to_acknowledge),
    submittedIp: row.submitted_ip || '',
    verificationStatus: row.verification_status || 'Pending',
    verificationNote: row.verification_note || '',
    adminReplyMessage: row.admin_reply_message || '',
    verifiedByUserId: row.verified_by_user_id ? Number(row.verified_by_user_id) : null,
    verifiedByName: row.verified_by_name || '',
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get('/config', (req, res) => {
  const upiQrUrl = resolveSupportQrUrl(process.env.SUPPORT_UPI_QR_URL, req);
  return res.json({ upiQrUrl });
});

router.post('/contributions', submissionLimiter, async (req, res, next) => {
  try {
    const payload = createContributionSchema.parse(req.body || {});
    const normalizedUpiReference = payload.upiReference.trim();
    const submissionIp = normalizeIpAddress(req.ip || req.socket?.remoteAddress);

    const existing = await pool.query(
      `
        SELECT id
        FROM support_contributions
        WHERE lower(trim(upi_reference)) = lower(trim($1))
        LIMIT 1
      `,
      [normalizedUpiReference]
    );

    if (existing.rowCount > 0) {
      return res.status(409).json({
        error: 'This UPI reference is already recorded.',
      });
    }

    const inserted = await pool.query(
      `
        INSERT INTO support_contributions (
          supporter_name,
          amount_inr,
          reported_amount_inr,
          message,
          upi_reference,
          consent_to_record,
          consent_to_acknowledge,
          submitted_ip,
          verification_status,
          admin_reply_message
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Pending', '')
        RETURNING
          id,
          supporter_name,
          amount_inr,
          reported_amount_inr,
          message,
          upi_reference,
          consent_to_record,
          consent_to_acknowledge,
          submitted_ip,
          verification_status,
          verification_note,
          admin_reply_message,
          verified_by_user_id,
          verified_at,
          created_at,
          updated_at,
          ''::TEXT AS verified_by_name
      `,
      [
        payload.name || '',
        payload.amount,
        payload.amount,
        payload.message || '',
        normalizedUpiReference,
        true,
        Boolean(payload.consentToAcknowledge),
        submissionIp,
      ]
    );

    const contribution = inserted.rows[0];
    return res.status(201).json({
      message: 'Support contribution recorded successfully.',
      contribution: mapContributionRow(contribution),
    });
  } catch (error) {
    return next(error);
  }
});

adminRouter.use(requireAuth, requireRole('admin', 'main_admin'));

adminRouter.get('/contributions', async (req, res, next) => {
  try {
    const query = adminListQuerySchema.parse(req.query || {});
    const where = ['1 = 1'];
    const values = [];

    if (query.status !== 'all') {
      const statusMap = {
        pending: 'Pending',
        verified: 'Verified',
        rejected: 'Rejected',
      };
      values.push(statusMap[query.status]);
      where.push(`sc.verification_status = $${values.length}`);
    }

    values.push(query.limit);

    const rows = await pool.query(
      `
        SELECT
          sc.id,
          sc.supporter_name,
          sc.amount_inr,
          sc.reported_amount_inr,
          sc.message,
          sc.upi_reference,
          sc.consent_to_record,
          sc.consent_to_acknowledge,
          sc.submitted_ip,
          sc.verification_status,
          sc.verification_note,
          sc.admin_reply_message,
          sc.verified_by_user_id,
          verifier.name AS verified_by_name,
          sc.verified_at,
          sc.created_at,
          sc.updated_at
        FROM support_contributions sc
        LEFT JOIN users verifier
          ON verifier.id = sc.verified_by_user_id
        WHERE ${where.join(' AND ')}
        ORDER BY
          CASE sc.verification_status
            WHEN 'Pending' THEN 0
            WHEN 'Rejected' THEN 1
            ELSE 2
          END,
          sc.created_at DESC
        LIMIT $${values.length}
      `,
      values
    );

    return res.json({
      contributions: rows.rows.map(mapContributionRow),
    });
  } catch (error) {
    return next(error);
  }
});

adminRouter.patch('/contributions/:id/status', async (req, res, next) => {
  try {
    const contributionId = Number(req.params.id);
    if (!Number.isFinite(contributionId) || contributionId <= 0) {
      return res.status(400).json({ error: 'Invalid contribution id' });
    }

    const payload = adminUpdateStatusSchema.parse(req.body || {});
    const note = payload.verificationNote || '';
    const correctedAmount = payload.correctedAmount ?? null;
    const adminReplyMessage = (payload.adminReplyMessage || '').trim()
      || (payload.status === 'Verified' ? 'Thank you for your support contribution.' : '');
    const actorUserId = req.user?.id || null;

    const rows = await pool.query(
      `
        UPDATE support_contributions
        SET
          verification_status = $1,
          verification_note = $2,
          amount_inr = COALESCE($3, amount_inr),
          admin_reply_message = $4,
          verified_by_user_id = CASE WHEN $1 = 'Pending' THEN NULL ELSE $5 END,
          verified_at = CASE WHEN $1 = 'Pending' THEN NULL ELSE NOW() END,
          updated_at = NOW()
        WHERE id = $6
        RETURNING
          id,
          supporter_name,
          amount_inr,
          reported_amount_inr,
          message,
          upi_reference,
          consent_to_record,
          consent_to_acknowledge,
          submitted_ip,
          verification_status,
          verification_note,
          admin_reply_message,
          verified_by_user_id,
          verified_at,
          created_at,
          updated_at
      `,
      [payload.status, note, correctedAmount, adminReplyMessage, actorUserId, contributionId]
    );

    if (rows.rowCount === 0) {
      return res.status(404).json({ error: 'Contribution not found.' });
    }

    const verifiedByName =
      payload.status === 'Pending'
        ? ''
        : typeof req.user?.name === 'string'
          ? req.user.name
          : '';

    const mapped = mapContributionRow({
      ...rows.rows[0],
      verified_by_name: verifiedByName,
    });

    return res.json({
      message: `Contribution #${contributionId} marked as ${payload.status}.`,
      contribution: mapped,
    });
  } catch (error) {
    return next(error);
  }
});

router.use('/admin', adminRouter);

export default router;
