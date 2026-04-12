import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { requireAuth, requireMainAdmin, requirePermission } from '../middleware/auth.js';

const router = Router();
const adminRouter = Router();

const COLLABORATION_TYPES = [
  'sponsored_property',
  'brand_partnership',
  'content_promotion',
  'event_sponsorship',
  'custom',
];

const PACKAGE_TIERS = ['bronze', 'silver', 'gold', 'platinum', 'custom'];

const STATUS_VALUES = ['pending', 'contacted', 'negotiating', 'active', 'completed', 'declined'];

const PACKAGES = [
  {
    tier: 'bronze',
    name: 'Bronze',
    price: '₹4,999',
    duration: '1 month',
    reach: '~5,000 impressions',
    features: [
      'Sidebar banner on listing pages',
      'Mentioned in one newsletter blast',
      'Company logo on partner page',
    ],
  },
  {
    tier: 'silver',
    name: 'Silver',
    price: '₹14,999',
    duration: '3 months',
    reach: '~25,000 impressions',
    features: [
      'Homepage sponsored banner rotation',
      'Featured in two newsletter blasts',
      'Company logo with link on partner page',
      'Social media shoutout (1×)',
    ],
  },
  {
    tier: 'gold',
    name: 'Gold',
    price: '₹34,999',
    duration: '6 months',
    reach: '~80,000 impressions',
    features: [
      'Priority homepage banner placement',
      'Pop-up ad slot (frequency-capped)',
      'Monthly newsletter feature',
      'Dedicated blog article / case study',
      'Social media promotion (monthly)',
      'Lead sharing for matching queries',
    ],
  },
  {
    tier: 'platinum',
    name: 'Platinum',
    price: '₹74,999',
    duration: '12 months',
    reach: '~200,000+ impressions',
    features: [
      'Exclusive homepage takeover banners',
      'Unlimited pop-up ad campaigns',
      'Weekly newsletter spotlight',
      'Co-branded landing page',
      'Priority lead sharing',
      'Quarterly performance report',
      'Dedicated account manager',
      'Custom integrations available',
    ],
  },
];

const inquirySchema = z.object({
  businessName: z.string().trim().min(2).max(160),
  contactName: z.string().trim().max(120).optional().default(''),
  email: z.string().trim().email().max(190),
  phone: z.string().trim().max(32).optional().default(''),
  collaborationType: z.enum(COLLABORATION_TYPES),
  packageTier: z.enum(PACKAGE_TIERS).optional().default('custom'),
  budgetRange: z.string().trim().max(60).optional().default(''),
  description: z.string().trim().max(5000).optional().default(''),
});

const statusUpdateSchema = z.object({
  status: z.enum(STATUS_VALUES),
  adminNotes: z.string().trim().max(2000).optional().default(''),
});

function mapInquiryRow(row) {
  return {
    id: Number(row.id),
    businessName: row.business_name,
    contactName: row.contact_name || '',
    email: row.email,
    phone: row.phone || '',
    collaborationType: row.collaboration_type,
    packageTier: row.package_tier || 'custom',
    budgetRange: row.budget_range || '',
    description: row.description || '',
    status: row.status,
    adminNotes: row.admin_notes || '',
    reviewedByUserId: row.reviewed_by_user_id ? Number(row.reviewed_by_user_id) : null,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeIpAddress(rawValue) {
  if (!rawValue) return '';
  return String(rawValue).split(',')[0].trim().slice(0, 64);
}

// -- Public routes --

router.get('/packages', (_req, res) => {
  return res.json({ packages: PACKAGES });
});

router.post('/inquiries', async (req, res, next) => {
  try {
    const payload = inquirySchema.parse(req.body || {});

    const rows = await pool.query(
      `
        INSERT INTO collaboration_inquiries (
          business_name, contact_name, email, phone,
          collaboration_type, package_tier, budget_range,
          description, submission_ip
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `,
      [
        payload.businessName,
        payload.contactName,
        payload.email,
        payload.phone,
        payload.collaborationType,
        payload.packageTier,
        payload.budgetRange,
        payload.description,
        normalizeIpAddress(req.ip || req.socket?.remoteAddress),
      ]
    );

    return res.status(201).json({
      message: 'Your collaboration inquiry has been submitted. We will contact you shortly!',
      inquiry: mapInquiryRow(rows.rows[0]),
    });
  } catch (error) {
    return next(error);
  }
});

// -- Admin routes --

adminRouter.use(requireAuth, requireMainAdmin);

adminRouter.get('/inquiries', async (req, res, next) => {
  try {
    const statusFilter = String(req.query.status || '').trim().toLowerCase();
    const where = ['1=1'];
    const values = [];

    if (statusFilter && STATUS_VALUES.includes(statusFilter)) {
      values.push(statusFilter);
      where.push(`status = $${values.length}`);
    }

    const rows = await pool.query(
      `
        SELECT * FROM collaboration_inquiries
        WHERE ${where.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT 500
      `,
      values
    );

    return res.json({
      inquiries: rows.rows.map(mapInquiryRow),
      total: rows.rowCount,
    });
  } catch (error) {
    return next(error);
  }
});

adminRouter.put('/inquiries/:id/status', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid inquiry ID.' });
    }

    const payload = statusUpdateSchema.parse(req.body || {});

    const rows = await pool.query(
      `
        UPDATE collaboration_inquiries
        SET status = $1,
            admin_notes = $2,
            reviewed_by_user_id = $3,
            reviewed_at = NOW(),
            updated_at = NOW()
        WHERE id = $4
        RETURNING *
      `,
      [payload.status, payload.adminNotes, req.user.id, id]
    );

    if (rows.rowCount === 0) {
      return res.status(404).json({ error: 'Inquiry not found.' });
    }

    return res.json({
      message: 'Inquiry status updated.',
      inquiry: mapInquiryRow(rows.rows[0]),
    });
  } catch (error) {
    return next(error);
  }
});

router.use('/admin', adminRouter);

export default router;
