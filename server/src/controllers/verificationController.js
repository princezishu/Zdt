import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { logAuditEvent } from '../middleware/auditLogger.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { apiCreated, apiOk } from '../utils/apiEnvelope.js';
import {
  buildVerificationBadge,
  computeBuilderTrustScore,
  computePropertyTrustScore,
} from '../modules/verification/scoring.js';

const router = Router();

const CASE_STATUSES = ['pending', 'under_review', 'approved', 'rejected', 'needs_changes'];
const CASE_PRIORITIES = ['low', 'normal', 'high'];
const BUILDER_CASE_TYPES = ['kyc', 'rera', 'project_document', 'ownership', 'banking', 'site_audit'];
const PROPERTY_CASE_TYPES = ['listing_authenticity', 'ownership', 'pricing', 'location', 'rera', 'media'];
const OWNERSHIP_CHECK_STATUSES = ['pending', 'verified', 'failed', 'manual_review'];
const FAKE_REPORT_STATUSES = ['new', 'reviewing', 'resolved', 'rejected'];
const FAKE_REPORT_REASONS = [
  'duplicate_listing',
  'wrong_price',
  'wrong_location',
  'ownership_doubt',
  'scam_behavior',
  'fake_media',
  'other',
];
const FRAUD_ACTION_KEYS = [
  'flag_listing',
  'warn_builder',
  'reject_report',
  'resolve_report',
  'suspend_listing',
  'keep_listing_live',
];

const spotlightQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(24).optional().default(8),
  state: z.string().trim().max(120).optional().default(''),
  q: z.string().trim().max(160).optional().default(''),
  verifiedOnly: z
    .union([z.boolean(), z.string().trim().toLowerCase()])
    .optional()
    .transform((value) => value === true || value === 'true' || value === '1'),
});

const companyIdSchema = z.coerce.number().int().positive();
const propertyIdSchema = z.coerce.number().int().positive();
const caseIdSchema = z.coerce.number().int().positive();
const sourceAuthorityIdSchema = z.coerce.number().int().positive();

const createBuilderCaseSchema = z.object({
  caseType: z.enum(BUILDER_CASE_TYPES),
  priority: z.enum(CASE_PRIORITIES).optional().default('normal'),
  note: z.string().trim().min(8).max(2000),
  sourceAuthorityId: sourceAuthorityIdSchema.optional(),
  sourceReferenceUrl: z.string().trim().url().optional().or(z.literal('')),
  evidence: z.record(z.string(), z.unknown()).optional().default({}),
  expiresAt: z.string().trim().datetime().optional(),
});

const createPropertyCaseSchema = z.object({
  caseType: z.enum(PROPERTY_CASE_TYPES),
  priority: z.enum(CASE_PRIORITIES).optional().default('normal'),
  note: z.string().trim().min(8).max(2000),
  sourceAuthorityId: sourceAuthorityIdSchema.optional(),
  sourceReferenceUrl: z.string().trim().url().optional().or(z.literal('')),
  evidence: z.record(z.string(), z.unknown()).optional().default({}),
  expiresAt: z.string().trim().datetime().optional(),
});

const reviewBuilderCaseSchema = z.object({
  status: z.enum(CASE_STATUSES),
  note: z.string().trim().max(2000).optional().default(''),
  publicNote: z.string().trim().max(300).optional().default(''),
  trustScoreDelta: z.coerce.number().int().min(-25).max(25).optional().default(0),
});

const reviewPropertyCaseSchema = z.object({
  status: z.enum(CASE_STATUSES),
  note: z.string().trim().max(2000).optional().default(''),
  publicNote: z.string().trim().max(300).optional().default(''),
  trustScoreDelta: z.coerce.number().int().min(-25).max(25).optional().default(0),
});

const fakeListingReportSchema = z
  .object({
    propertyId: z.coerce.number().int().positive().optional(),
    companyId: z.coerce.number().int().positive().optional(),
    propertyReference: z.string().trim().max(80).optional().default(''),
    reporterName: z.string().trim().min(2).max(120),
    reporterEmail: z.string().trim().email().max(190).optional().or(z.literal('')).default(''),
    reporterPhone: z.string().trim().max(32).optional().default(''),
    reason: z.enum(FAKE_REPORT_REASONS),
    details: z.string().trim().min(8).max(2000),
    sourceUrl: z.string().trim().url().optional().or(z.literal('')).default(''),
  })
  .refine(
    (value) => Boolean(value.propertyId || value.companyId || value.propertyReference),
    'Provide a property, company, or property reference for the report.'
  );

const sourceAuthoritySchema = z.object({
  authorityName: z.string().trim().min(2).max(180),
  sourceType: z.enum(['government_portal', 'rera', 'bank_portal', 'municipal', 'court_notice', 'other']),
  sourceUrl: z.string().trim().url().optional().or(z.literal('')).default(''),
  authorityScope: z.string().trim().max(120).optional().default(''),
  verificationWeight: z.coerce.number().int().min(0).max(20).optional().default(5),
});

const reviewFakeListingReportSchema = z.object({
  status: z.enum(FAKE_REPORT_STATUSES),
  actionKey: z.enum(FRAUD_ACTION_KEYS),
  resolutionNote: z.string().trim().min(3).max(1000),
});

function normalizeUrl(value) {
  const text = String(value || '').trim();
  return text || null;
}

function normalizeDateTime(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeIpAddress(rawValue) {
  if (!rawValue) return '';
  return String(rawValue).split(',')[0].trim().slice(0, 64);
}

function formatBuilderCase(row) {
  return {
    id: Number(row.id),
    companyId: Number(row.company_id),
    requestedByUserId: row.requested_by_user_id ? Number(row.requested_by_user_id) : null,
    reviewedByUserId: row.reviewed_by_user_id ? Number(row.reviewed_by_user_id) : null,
    caseType: row.case_type,
    status: row.status,
    priority: row.priority,
    note: row.note || '',
    publicNote: row.public_note || '',
    trustScoreDelta: Number(row.trust_score_delta || 0),
    evidence: row.evidence || {},
    sourceReferenceUrl: row.source_reference_url || '',
    sourceAuthorityId: row.source_authority_id ? Number(row.source_authority_id) : null,
    sourceAuthorityName: row.source_authority_name || '',
    resolvedAt: row.resolved_at || null,
    expiresAt: row.expires_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formatPropertyCase(row) {
  return {
    id: Number(row.id),
    propertyId: Number(row.property_id),
    companyId: row.company_id ? Number(row.company_id) : null,
    requestedByUserId: row.requested_by_user_id ? Number(row.requested_by_user_id) : null,
    reviewedByUserId: row.reviewed_by_user_id ? Number(row.reviewed_by_user_id) : null,
    caseType: row.case_type,
    status: row.status,
    priority: row.priority,
    note: row.note || '',
    publicNote: row.public_note || '',
    trustScoreDelta: Number(row.trust_score_delta || 0),
    evidence: row.evidence || {},
    sourceReferenceUrl: row.source_reference_url || '',
    sourceAuthorityId: row.source_authority_id ? Number(row.source_authority_id) : null,
    sourceAuthorityName: row.source_authority_name || '',
    resolvedAt: row.resolved_at || null,
    expiresAt: row.expires_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formatFakeListingReport(row) {
  return {
    id: Number(row.id),
    propertyId: row.property_id ? Number(row.property_id) : null,
    companyId: row.company_id ? Number(row.company_id) : null,
    propertyReference: row.property_reference || '',
    reporterName: row.reporter_name || '',
    reporterEmail: row.reporter_email || '',
    reporterPhone: row.reporter_phone || '',
    reason: row.reason,
    details: row.details || '',
    status: row.status,
    sourceUrl: row.source_url || '',
    reviewedByUserId: row.reviewed_by_user_id ? Number(row.reviewed_by_user_id) : null,
    resolutionNote: row.resolution_note || '',
    resolvedAt: row.resolved_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function writeVerificationAudit(req, actionKey, entityType, entityId, metadata = {}) {
  await logAuditEvent({
    actorUserId: req.user?.id || null,
    actorRole: req.user?.role || '',
    actionKey,
    entityType,
    entityId,
    requestReference: req.body?.propertyReference || null,
    ipAddress: normalizeIpAddress(req.ip || req.socket?.remoteAddress),
    metadata,
  });
}

async function loadCompanyAccess(companyId, userId) {
  const rows = await pool.query(
    `
      SELECT company_id, company_role
      FROM users
      WHERE id = $1
        AND company_id = $2
      LIMIT 1
    `,
    [userId, companyId]
  );

  if (rows.rowCount === 0) {
    return null;
  }

  return {
    companyId: Number(rows.rows[0].company_id),
    companyRole: rows.rows[0].company_role || '',
  };
}

async function ensureCompanyMembershipOrAdmin(req, res, companyId) {
  if (req.user?.role === 'admin') {
    return true;
  }

  const membership = await loadCompanyAccess(companyId, req.user?.id);
  if (!membership) {
    res.status(403).json({ error: 'Only admin or company members can access this company trust workspace.' });
    return false;
  }

  return true;
}

async function getBuilderSummaryMetrics(companyId) {
  const [companyRows, docsRows, caseRows, fakeRows] = await Promise.all([
    pool.query(
      `
        SELECT
          c.id,
          c.name,
          c.city,
          c.state,
          c.logo_url,
          c.banner_url,
          c.is_verified,
          c.verified_at,
          (
            SELECT COUNT(*)::INT
            FROM projects p
            WHERE p.company_id = c.id
          ) AS project_count,
          (
            SELECT COUNT(*)::INT
            FROM properties pr
            WHERE pr.company_id = c.id
          ) AS property_count
        FROM companies c
        WHERE c.id = $1
        LIMIT 1
      `,
      [companyId]
    ),
    pool.query(
      `
        SELECT
          COUNT(*)::INT AS total_documents,
          COUNT(*) FILTER (WHERE status = 'approved')::INT AS approved_documents,
          COUNT(*) FILTER (WHERE status = 'pending')::INT AS pending_documents,
          COUNT(*) FILTER (WHERE status = 'rejected')::INT AS rejected_documents
        FROM builder_verification_documents
        WHERE company_id = $1
      `,
      [companyId]
    ),
    pool.query(
      `
        SELECT
          COUNT(*)::INT AS total_cases,
          COUNT(*) FILTER (WHERE status = 'approved')::INT AS approved_cases,
          COUNT(*) FILTER (WHERE status IN ('pending', 'under_review', 'needs_changes'))::INT AS pending_cases,
          COUNT(*) FILTER (WHERE status = 'rejected')::INT AS rejected_cases,
          MAX(COALESCE(resolved_at, updated_at, created_at)) AS last_reviewed_at
        FROM builder_verification_cases
        WHERE company_id = $1
      `,
      [companyId]
    ),
    pool.query(
      `
        SELECT
          COUNT(*)::INT AS total_fake_reports,
          COUNT(*) FILTER (WHERE status IN ('new', 'reviewing'))::INT AS open_fake_reports
        FROM fake_listing_reports
        WHERE company_id = $1
      `,
      [companyId]
    ),
  ]);

  if (companyRows.rowCount === 0) {
    return null;
  }

  const company = companyRows.rows[0];
  const docs = docsRows.rows[0] || {};
  const cases = caseRows.rows[0] || {};
  const fake = fakeRows.rows[0] || {};

  const trustScore = computeBuilderTrustScore({
    isVerified: company.is_verified,
    approvedDocuments: docs.approved_documents,
    approvedCases: cases.approved_cases,
    pendingCases: cases.pending_cases,
    rejectedCases: cases.rejected_cases,
    openFakeReports: fake.open_fake_reports,
    projectCount: company.project_count,
    propertyCount: company.property_count,
  });
  const badge = buildVerificationBadge(trustScore, {
    isVerified: company.is_verified,
    openFakeReports: fake.open_fake_reports,
  });

  return {
    company: {
      id: Number(company.id),
      name: company.name,
      city: company.city || '',
      state: company.state || '',
      logoUrl: company.logo_url || '',
      bannerUrl: company.banner_url || '',
      isVerified: Boolean(company.is_verified),
      verifiedAt: company.verified_at || null,
      projectCount: Number(company.project_count || 0),
      propertyCount: Number(company.property_count || 0),
    },
    trustScore,
    badge,
    metrics: {
      totalDocuments: Number(docs.total_documents || 0),
      approvedDocuments: Number(docs.approved_documents || 0),
      pendingDocuments: Number(docs.pending_documents || 0),
      rejectedDocuments: Number(docs.rejected_documents || 0),
      totalCases: Number(cases.total_cases || 0),
      approvedCases: Number(cases.approved_cases || 0),
      pendingCases: Number(cases.pending_cases || 0),
      rejectedCases: Number(cases.rejected_cases || 0),
      totalFakeReports: Number(fake.total_fake_reports || 0),
      openFakeReports: Number(fake.open_fake_reports || 0),
      lastReviewedAt: cases.last_reviewed_at || null,
    },
  };
}

router.get('/builders/spotlight', async (req, res, next) => {
  try {
    const query = spotlightQuerySchema.parse(req.query || {});
    const values = [];
    const where = ['1 = 1'];

    if (query.state) {
      values.push(`%${query.state}%`);
      where.push(`c.state ILIKE $${values.length}`);
    }

    if (query.q) {
      values.push(`%${query.q}%`);
      where.push(`(c.name ILIKE $${values.length} OR COALESCE(c.city, '') ILIKE $${values.length} OR COALESCE(c.state, '') ILIKE $${values.length})`);
    }

    if (query.verifiedOnly) {
      where.push('c.is_verified = TRUE');
    }

    values.push(query.limit);

    const rows = await pool.query(
      `
        SELECT
          c.id,
          c.name,
          c.city,
          c.state,
          c.logo_url,
          c.banner_url,
          c.is_verified,
          c.verified_at,
          (
            SELECT COUNT(*)::INT
            FROM projects p
            WHERE p.company_id = c.id
          ) AS project_count,
          (
            SELECT COUNT(*)::INT
            FROM properties pr
            WHERE pr.company_id = c.id
          ) AS property_count,
          (
            SELECT COUNT(*)::INT
            FROM builder_verification_documents bvd
            WHERE bvd.company_id = c.id
              AND bvd.status = 'approved'
          ) AS approved_documents,
          (
            SELECT COUNT(*)::INT
            FROM builder_verification_cases bvc
            WHERE bvc.company_id = c.id
              AND bvc.status = 'approved'
          ) AS approved_cases,
          (
            SELECT COUNT(*)::INT
            FROM builder_verification_cases bvc
            WHERE bvc.company_id = c.id
              AND bvc.status IN ('pending', 'under_review', 'needs_changes')
          ) AS pending_cases,
          (
            SELECT COUNT(*)::INT
            FROM builder_verification_cases bvc
            WHERE bvc.company_id = c.id
              AND bvc.status = 'rejected'
          ) AS rejected_cases,
          (
            SELECT COUNT(*)::INT
            FROM fake_listing_reports flr
            WHERE flr.company_id = c.id
              AND flr.status IN ('new', 'reviewing')
          ) AS open_fake_reports
        FROM companies c
        WHERE ${where.join(' AND ')}
        ORDER BY c.is_verified DESC, c.updated_at DESC, c.id DESC
        LIMIT $${values.length}
      `,
      values
    );

    const items = rows.rows
      .map((row) => {
        const trustScore = computeBuilderTrustScore({
          isVerified: row.is_verified,
          approvedDocuments: row.approved_documents,
          approvedCases: row.approved_cases,
          pendingCases: row.pending_cases,
          rejectedCases: row.rejected_cases,
          openFakeReports: row.open_fake_reports,
          projectCount: row.project_count,
          propertyCount: row.property_count,
        });
        const badge = buildVerificationBadge(trustScore, {
          isVerified: row.is_verified,
          openFakeReports: row.open_fake_reports,
        });

        return {
          companyId: Number(row.id),
          name: row.name,
          city: row.city || '',
          state: row.state || '',
          logoUrl: row.logo_url || '',
          bannerUrl: row.banner_url || '',
          isVerified: Boolean(row.is_verified),
          verifiedAt: row.verified_at || null,
          projectCount: Number(row.project_count || 0),
          propertyCount: Number(row.property_count || 0),
          approvedDocuments: Number(row.approved_documents || 0),
          approvedCases: Number(row.approved_cases || 0),
          pendingCases: Number(row.pending_cases || 0),
          rejectedCases: Number(row.rejected_cases || 0),
          openFakeReports: Number(row.open_fake_reports || 0),
          trustScore,
          badge,
        };
      })
      .sort((left, right) => right.trustScore - left.trustScore || right.approvedCases - left.approvedCases);

    return res.json(
      apiOk(
        { items },
        {
          limit: query.limit,
          filters: {
            state: query.state,
            q: query.q,
            verifiedOnly: query.verifiedOnly,
          },
        }
      )
    );
  } catch (error) {
    return next(error);
  }
});

router.get('/companies/:companyId/summary', async (req, res, next) => {
  try {
    const companyId = companyIdSchema.parse(req.params.companyId);
    const summary = await getBuilderSummaryMetrics(companyId);

    if (!summary) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const [recentCases, recentDocuments] = await Promise.all([
      pool.query(
        `
          SELECT
            bvc.*,
            gsr.authority_name AS source_authority_name
          FROM builder_verification_cases bvc
          LEFT JOIN govt_source_registry gsr
            ON gsr.id = bvc.source_authority_id
          WHERE bvc.company_id = $1
          ORDER BY bvc.created_at DESC
          LIMIT 8
        `,
        [companyId]
      ),
      pool.query(
        `
          SELECT
            id,
            company_id,
            uploaded_by_user_id,
            reviewed_by_user_id,
            document_type,
            file_url,
            notes,
            status,
            reviewed_at,
            created_at,
            updated_at
          FROM builder_verification_documents
          WHERE company_id = $1
          ORDER BY created_at DESC
          LIMIT 8
        `,
        [companyId]
      ),
    ]);

    return res.json(
      apiOk({
        summary,
        recentCases: recentCases.rows.map(formatBuilderCase),
        recentDocuments: recentDocuments.rows.map((row) => ({
          id: Number(row.id),
          companyId: Number(row.company_id),
          uploadedByUserId: row.uploaded_by_user_id ? Number(row.uploaded_by_user_id) : null,
          reviewedByUserId: row.reviewed_by_user_id ? Number(row.reviewed_by_user_id) : null,
          documentType: row.document_type,
          fileUrl: row.file_url,
          notes: row.notes || '',
          status: row.status,
          reviewedAt: row.reviewed_at || null,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
      })
    );
  } catch (error) {
    return next(error);
  }
});

router.get('/source-authorities', async (req, res, next) => {
  try {
    const rows = await pool.query(
      `
        SELECT
          id,
          authority_name,
          source_type,
          source_url,
          authority_scope,
          verification_weight,
          is_active,
          created_at,
          updated_at
        FROM govt_source_registry
        WHERE is_active = TRUE
        ORDER BY verification_weight DESC, authority_name ASC
      `
    );

    return res.json(
      apiOk({
        items: rows.rows.map((row) => ({
          id: Number(row.id),
          authorityName: row.authority_name,
          sourceType: row.source_type,
          sourceUrl: row.source_url || '',
          authorityScope: row.authority_scope || '',
          verificationWeight: Number(row.verification_weight || 0),
          isActive: Boolean(row.is_active),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
      })
    );
  } catch (error) {
    return next(error);
  }
});

router.get('/properties/:propertyId/summary', async (req, res, next) => {
  try {
    const propertyId = propertyIdSchema.parse(req.params.propertyId);
    const rows = await pool.query(
      `
        SELECT
          p.id,
          p.title,
          p.company_id,
          p.is_verified,
          c.name AS company_name,
          c.is_verified AS company_verified,
          (
            SELECT COUNT(*)::INT
            FROM property_verification_cases pvc
            WHERE pvc.property_id = p.id
              AND pvc.status = 'approved'
          ) AS approved_cases,
          (
            SELECT COUNT(*)::INT
            FROM property_verification_cases pvc
            WHERE pvc.property_id = p.id
              AND pvc.status = 'rejected'
          ) AS rejected_cases,
          (
            SELECT COUNT(*)::INT
            FROM fake_listing_reports flr
            WHERE flr.property_id = p.id
              AND flr.status IN ('new', 'reviewing')
          ) AS open_fake_reports
        FROM properties p
        LEFT JOIN companies c
          ON c.id = p.company_id
        WHERE p.id = $1
        LIMIT 1
      `,
      [propertyId]
    );

    if (rows.rowCount === 0) {
      return res.status(404).json({ error: 'Property not found' });
    }

    const row = rows.rows[0];
    const trustScore = computePropertyTrustScore({
      isVerified: row.is_verified,
      approvedCases: row.approved_cases,
      rejectedCases: row.rejected_cases,
      openFakeReports: row.open_fake_reports,
      companyVerified: row.company_verified,
    });
    const badge = buildVerificationBadge(trustScore, {
      isVerified: row.is_verified,
      openFakeReports: row.open_fake_reports,
    });

    return res.json(
      apiOk({
        property: {
          id: Number(row.id),
          title: row.title,
          companyId: row.company_id ? Number(row.company_id) : null,
          companyName: row.company_name || '',
          isVerified: Boolean(row.is_verified),
          companyVerified: Boolean(row.company_verified),
        },
        trustScore,
        badge,
        metrics: {
          approvedCases: Number(row.approved_cases || 0),
          rejectedCases: Number(row.rejected_cases || 0),
          openFakeReports: Number(row.open_fake_reports || 0),
        },
      })
    );
  } catch (error) {
    return next(error);
  }
});

router.get('/companies/:companyId/cases', requireAuth, async (req, res, next) => {
  try {
    const companyId = companyIdSchema.parse(req.params.companyId);
    const allowed = await ensureCompanyMembershipOrAdmin(req, res, companyId);
    if (!allowed) {
      return;
    }

    const rows = await pool.query(
      `
        SELECT
          bvc.*,
          gsr.authority_name AS source_authority_name
        FROM builder_verification_cases bvc
        LEFT JOIN govt_source_registry gsr
          ON gsr.id = bvc.source_authority_id
        WHERE bvc.company_id = $1
        ORDER BY bvc.created_at DESC
        LIMIT 100
      `,
      [companyId]
    );

    return res.json(apiOk({ items: rows.rows.map(formatBuilderCase) }));
  } catch (error) {
    return next(error);
  }
});

router.post('/companies/:companyId/cases', requireAuth, async (req, res, next) => {
  try {
    const companyId = companyIdSchema.parse(req.params.companyId);
    const allowed = await ensureCompanyMembershipOrAdmin(req, res, companyId);
    if (!allowed) {
      return;
    }

    const payload = createBuilderCaseSchema.parse(req.body || {});
    const rows = await pool.query(
      `
        INSERT INTO builder_verification_cases (
          company_id,
          requested_by_user_id,
          case_type,
          status,
          priority,
          note,
          evidence,
          source_authority_id,
          source_reference_url,
          expires_at
        )
        VALUES ($1, $2, $3, 'pending', $4, $5, $6::jsonb, $7, $8, $9)
        RETURNING *
      `,
      [
        companyId,
        req.user.id,
        payload.caseType,
        payload.priority,
        payload.note,
        JSON.stringify(payload.evidence || {}),
        payload.sourceAuthorityId || null,
        normalizeUrl(payload.sourceReferenceUrl),
        normalizeDateTime(payload.expiresAt),
      ]
    );

    await writeVerificationAudit(req, 'builder_verification_case_created', 'builder_verification_case', Number(rows.rows[0].id), {
      companyId,
      caseType: payload.caseType,
      priority: payload.priority,
    });

    return res.status(201).json(apiCreated({ item: formatBuilderCase(rows.rows[0]) }));
  } catch (error) {
    return next(error);
  }
});

router.post('/properties/:propertyId/cases', requireAuth, async (req, res, next) => {
  try {
    const propertyId = propertyIdSchema.parse(req.params.propertyId);
    const payload = createPropertyCaseSchema.parse(req.body || {});
    const propertyRows = await pool.query(
      `
        SELECT id, company_id
        FROM properties
        WHERE id = $1
        LIMIT 1
      `,
      [propertyId]
    );

    if (propertyRows.rowCount === 0) {
      return res.status(404).json({ error: 'Property not found' });
    }

    const property = propertyRows.rows[0];
    const allowed = await ensureCompanyMembershipOrAdmin(req, res, Number(property.company_id));
    if (!allowed) {
      return;
    }

    const rows = await pool.query(
      `
        INSERT INTO property_verification_cases (
          property_id,
          company_id,
          requested_by_user_id,
          case_type,
          status,
          priority,
          note,
          evidence,
          source_authority_id,
          source_reference_url,
          expires_at
        )
        VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7::jsonb, $8, $9, $10)
        RETURNING *
      `,
      [
        propertyId,
        property.company_id,
        req.user.id,
        payload.caseType,
        payload.priority,
        payload.note,
        JSON.stringify(payload.evidence || {}),
        payload.sourceAuthorityId || null,
        normalizeUrl(payload.sourceReferenceUrl),
        normalizeDateTime(payload.expiresAt),
      ]
    );

    await writeVerificationAudit(req, 'property_verification_case_created', 'property_verification_case', Number(rows.rows[0].id), {
      companyId: Number(property.company_id),
      propertyId,
      caseType: payload.caseType,
      priority: payload.priority,
    });

    return res.status(201).json(apiCreated({ item: formatPropertyCase(rows.rows[0]) }));
  } catch (error) {
    return next(error);
  }
});

router.post('/reports/fake-listings', async (req, res, next) => {
  try {
    const payload = fakeListingReportSchema.parse(req.body || {});
    const rows = await pool.query(
      `
        INSERT INTO fake_listing_reports (
          property_id,
          company_id,
          property_reference,
          reporter_name,
          reporter_email,
          reporter_phone,
          reason,
          details,
          source_url,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new')
        RETURNING *
      `,
      [
        payload.propertyId || null,
        payload.companyId || null,
        payload.propertyReference || '',
        payload.reporterName,
        payload.reporterEmail || '',
        payload.reporterPhone || '',
        payload.reason,
        payload.details,
        normalizeUrl(payload.sourceUrl),
      ]
    );

    return res.status(201).json(apiCreated({ item: formatFakeListingReport(rows.rows[0]) }));
  } catch (error) {
    return next(error);
  }
});

router.get('/admin/queue', requireAuth, requireRole('admin', 'main_admin'), async (req, res, next) => {
  try {
    const [builderCases, propertyCases, fakeReports] = await Promise.all([
      pool.query(
        `
          SELECT
            bvc.*,
            c.name AS company_name,
            gsr.authority_name AS source_authority_name
          FROM builder_verification_cases bvc
          JOIN companies c
            ON c.id = bvc.company_id
          LEFT JOIN govt_source_registry gsr
            ON gsr.id = bvc.source_authority_id
          WHERE bvc.status IN ('pending', 'under_review', 'needs_changes')
          ORDER BY bvc.priority DESC, bvc.created_at ASC
          LIMIT 40
        `
      ),
      pool.query(
        `
          SELECT
            pvc.*,
            p.title AS property_title,
            gsr.authority_name AS source_authority_name
          FROM property_verification_cases pvc
          JOIN properties p
            ON p.id = pvc.property_id
          LEFT JOIN govt_source_registry gsr
            ON gsr.id = pvc.source_authority_id
          WHERE pvc.status IN ('pending', 'under_review', 'needs_changes')
          ORDER BY pvc.priority DESC, pvc.created_at ASC
          LIMIT 40
        `
      ),
      pool.query(
        `
          SELECT *
          FROM fake_listing_reports
          WHERE status IN ('new', 'reviewing')
          ORDER BY created_at ASC
          LIMIT 40
        `
      ),
    ]);

    return res.json(
      apiOk({
        builderCases: builderCases.rows.map((row) => ({
          ...formatBuilderCase(row),
          companyName: row.company_name || '',
        })),
        propertyCases: propertyCases.rows.map((row) => ({
          ...formatPropertyCase(row),
          propertyTitle: row.property_title || '',
        })),
        fakeListingReports: fakeReports.rows.map(formatFakeListingReport),
      })
    );
  } catch (error) {
    return next(error);
  }
});

router.post('/admin/source-authorities', requireAuth, requireRole('admin', 'main_admin'), async (req, res, next) => {
  try {
    const payload = sourceAuthoritySchema.parse(req.body || {});
    const rows = await pool.query(
      `
        INSERT INTO govt_source_registry (
          authority_name,
          source_type,
          source_url,
          authority_scope,
          verification_weight,
          is_active
        )
        VALUES ($1, $2, $3, $4, $5, TRUE)
        RETURNING *
      `,
      [
        payload.authorityName,
        payload.sourceType,
        normalizeUrl(payload.sourceUrl),
        payload.authorityScope || '',
        payload.verificationWeight,
      ]
    );

    await writeVerificationAudit(req, 'govt_source_registered', 'govt_source_registry', Number(rows.rows[0].id), {
      authorityName: payload.authorityName,
      sourceType: payload.sourceType,
    });

    return res.status(201).json(
      apiCreated({
        item: {
          id: Number(rows.rows[0].id),
          authorityName: rows.rows[0].authority_name,
          sourceType: rows.rows[0].source_type,
          sourceUrl: rows.rows[0].source_url || '',
          authorityScope: rows.rows[0].authority_scope || '',
          verificationWeight: Number(rows.rows[0].verification_weight || 0),
          isActive: Boolean(rows.rows[0].is_active),
          createdAt: rows.rows[0].created_at,
          updatedAt: rows.rows[0].updated_at,
        },
      })
    );
  } catch (error) {
    return next(error);
  }
});

router.patch('/builder-cases/:caseId/review', requireAuth, requireRole('admin', 'main_admin'), async (req, res, next) => {
  try {
    const caseId = caseIdSchema.parse(req.params.caseId);
    const payload = reviewBuilderCaseSchema.parse(req.body || {});
    const rows = await pool.query(
      `
        UPDATE builder_verification_cases
        SET status = $1,
            note = CASE WHEN $2 = '' THEN note ELSE $2 END,
            public_note = CASE WHEN $3 = '' THEN public_note ELSE $3 END,
            trust_score_delta = $4,
            reviewed_by_user_id = $5,
            resolved_at = CASE WHEN $1 IN ('approved', 'rejected') THEN NOW() ELSE resolved_at END,
            updated_at = NOW()
        WHERE id = $6
        RETURNING *
      `,
      [payload.status, payload.note, payload.publicNote, payload.trustScoreDelta, req.user.id, caseId]
    );

    if (rows.rowCount === 0) {
      return res.status(404).json({ error: 'Builder verification case not found' });
    }

    await writeVerificationAudit(req, 'builder_verification_case_reviewed', 'builder_verification_case', caseId, {
      status: payload.status,
      trustScoreDelta: payload.trustScoreDelta,
    });

    return res.json(apiOk({ item: formatBuilderCase(rows.rows[0]) }));
  } catch (error) {
    return next(error);
  }
});

router.patch('/property-cases/:caseId/review', requireAuth, requireRole('admin', 'main_admin'), async (req, res, next) => {
  try {
    const caseId = caseIdSchema.parse(req.params.caseId);
    const payload = reviewPropertyCaseSchema.parse(req.body || {});
    const rows = await pool.query(
      `
        UPDATE property_verification_cases
        SET status = $1,
            note = CASE WHEN $2 = '' THEN note ELSE $2 END,
            public_note = CASE WHEN $3 = '' THEN public_note ELSE $3 END,
            trust_score_delta = $4,
            reviewed_by_user_id = $5,
            resolved_at = CASE WHEN $1 IN ('approved', 'rejected') THEN NOW() ELSE resolved_at END,
            updated_at = NOW()
        WHERE id = $6
        RETURNING *
      `,
      [payload.status, payload.note, payload.publicNote, payload.trustScoreDelta, req.user.id, caseId]
    );

    if (rows.rowCount === 0) {
      return res.status(404).json({ error: 'Property verification case not found' });
    }

    if (payload.status === 'approved') {
      await pool.query(
        `
          UPDATE properties
          SET is_verified = TRUE,
              updated_at = NOW()
          WHERE id = $1
        `,
        [rows.rows[0].property_id]
      );
    }

    await writeVerificationAudit(req, 'property_verification_case_reviewed', 'property_verification_case', caseId, {
      status: payload.status,
      trustScoreDelta: payload.trustScoreDelta,
      propertyId: Number(rows.rows[0].property_id),
    });

    return res.json(apiOk({ item: formatPropertyCase(rows.rows[0]) }));
  } catch (error) {
    return next(error);
  }
});

router.patch('/fake-listing-reports/:reportId/review', requireAuth, requireRole('admin', 'main_admin'), async (req, res, next) => {
  try {
    const reportId = caseIdSchema.parse(req.params.reportId);
    const payload = reviewFakeListingReportSchema.parse(req.body || {});
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const reportRows = await client.query(
        `
          UPDATE fake_listing_reports
          SET status = $1,
              reviewed_by_user_id = $2,
              resolution_note = $3,
              resolved_at = CASE WHEN $1 IN ('resolved', 'rejected') THEN NOW() ELSE resolved_at END,
              updated_at = NOW()
          WHERE id = $4
          RETURNING *
        `,
        [payload.status, req.user.id, payload.resolutionNote, reportId]
      );

      if (reportRows.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Fake listing report not found' });
      }

      const report = reportRows.rows[0];

      await client.query(
        `
          INSERT INTO fraud_actions (
            report_id,
            action_key,
            action_note,
            actor_user_id
          )
          VALUES ($1, $2, $3, $4)
        `,
        [reportId, payload.actionKey, payload.resolutionNote, req.user.id]
      );

      if (payload.actionKey === 'flag_listing' || payload.actionKey === 'suspend_listing') {
        await client.query(
          `
            UPDATE properties
            SET is_verified = FALSE,
                updated_at = NOW()
            WHERE id = $1
          `,
          [report.property_id]
        );
      }

      await client.query('COMMIT');

      await writeVerificationAudit(req, 'fake_listing_report_reviewed', 'fake_listing_report', reportId, {
        status: payload.status,
        actionKey: payload.actionKey,
        propertyId: report.property_id ? Number(report.property_id) : null,
      });

      return res.json(apiOk({ item: formatFakeListingReport(report) }));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return next(error);
  }
});

router.post('/ownership-checks', requireAuth, requireRole('admin', 'main_admin'), async (req, res, next) => {
  try {
    const payload = z
      .object({
        propertyId: propertyIdSchema,
        caseId: caseIdSchema.optional(),
        ownerName: z.string().trim().min(2).max(160),
        ownerPhone: z.string().trim().max(32).optional().default(''),
        documentType: z.string().trim().min(2).max(80),
        checkStatus: z.enum(OWNERSHIP_CHECK_STATUSES),
        resultSummary: z.string().trim().max(500).optional().default(''),
        sourceAuthorityId: sourceAuthorityIdSchema.optional(),
      })
      .parse(req.body || {});

    const rows = await pool.query(
      `
        INSERT INTO ownership_verification_checks (
          property_id,
          case_id,
          owner_name,
          owner_phone,
          document_type,
          check_status,
          result_summary,
          source_authority_id,
          checked_by_user_id,
          checked_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        RETURNING *
      `,
      [
        payload.propertyId,
        payload.caseId || null,
        payload.ownerName,
        payload.ownerPhone || '',
        payload.documentType,
        payload.checkStatus,
        payload.resultSummary || '',
        payload.sourceAuthorityId || null,
        req.user.id,
      ]
    );

    await writeVerificationAudit(req, 'ownership_check_recorded', 'ownership_verification_check', Number(rows.rows[0].id), {
      propertyId: payload.propertyId,
      caseId: payload.caseId || null,
      checkStatus: payload.checkStatus,
    });

    return res.status(201).json(
      apiCreated({
        item: {
          id: Number(rows.rows[0].id),
          propertyId: Number(rows.rows[0].property_id),
          caseId: rows.rows[0].case_id ? Number(rows.rows[0].case_id) : null,
          ownerName: rows.rows[0].owner_name,
          ownerPhone: rows.rows[0].owner_phone || '',
          documentType: rows.rows[0].document_type,
          checkStatus: rows.rows[0].check_status,
          resultSummary: rows.rows[0].result_summary || '',
          sourceAuthorityId: rows.rows[0].source_authority_id
            ? Number(rows.rows[0].source_authority_id)
            : null,
          checkedByUserId: rows.rows[0].checked_by_user_id
            ? Number(rows.rows[0].checked_by_user_id)
            : null,
          checkedAt: rows.rows[0].checked_at,
        },
      })
    );
  } catch (error) {
    return next(error);
  }
});

export default router;
