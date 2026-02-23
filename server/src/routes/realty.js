import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { hasPermission, requireAuth, requirePermission, requireRole } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';

const router = Router();

const COMPANY_TYPES = ['builder', 'dealer'];
const PROJECT_TYPES = ['Apartment', 'Villa', 'Plotted', 'Commercial'];
const PROJECT_STATUSES = ['Upcoming', 'Under Construction', 'Ready to Move'];
const CONSTRUCTION_OVERALL_STATUSES = [
  'Planning',
  'Approved',
  'Under Construction',
  'Near Completion',
  'Completed',
];
const CONSTRUCTION_UPDATE_APPROVAL_STATUSES = ['pending', 'approved', 'rejected'];
const CONSTRUCTION_MILESTONE_DEFINITIONS = [
  { key: 'land_approvals', label: 'Land & approvals' },
  { key: 'excavation', label: 'Excavation' },
  { key: 'foundation', label: 'Foundation' },
  { key: 'structure_slabs', label: 'Structure / slabs' },
  { key: 'brickwork', label: 'Brickwork' },
  { key: 'electrical_plumbing', label: 'Electrical & plumbing' },
  { key: 'plastering_flooring', label: 'Plastering & flooring' },
  { key: 'finishing', label: 'Finishing' },
  { key: 'handover', label: 'Handover' },
];
const CONSTRUCTION_DISCLOSURE_TEXT =
  'Construction updates are provided by the project developer and verified by ZDT Realty.';
const PROPERTY_TYPES = [
  'Apartment',
  'Villa',
  'Plotted',
  'Commercial',
  'Independent House',
  'Shop',
  'Office',
  'Warehouse',
  'Studio',
  'Duplex',
];
const FURNISHING_TYPES = ['furnished', 'semi_furnished', 'unfurnished', 'na'];
const PROPERTY_PAYMENT_STATUSES = ['paid', 'partial', 'overdue', 'na'];
const PROPERTY_LIST_CACHE_TTL_MS = 60_000;
const propertyListCache = new Map();

function readPropertyListCache(cacheKey) {
  const cached = propertyListCache.get(cacheKey);
  if (!cached || cached.expiresAt <= Date.now()) {
    if (cached) propertyListCache.delete(cacheKey);
    return null;
  }
  return cached.value;
}

function writePropertyListCache(cacheKey, value) {
  propertyListCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + PROPERTY_LIST_CACHE_TTL_MS,
  });
}

const propertyUnitPaymentSchema = z.object({
  monthlyRent: z.union([z.coerce.number().nonnegative(), z.null()]).optional().default(null),
  lastPaymentDate: z.string().trim().max(20).optional().or(z.literal('')).default(''),
  dueAmount: z.union([z.coerce.number().nonnegative(), z.null()]).optional().default(null),
  status: z.enum(PROPERTY_PAYMENT_STATUSES).optional().default('na'),
});

const propertyLayoutUnitSchema = z.object({
  id: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(60),
  sizeSqft: z.union([z.coerce.number().positive(), z.null()]).optional().default(null),
  price: z.union([z.coerce.number().nonnegative(), z.null()]).optional().default(null),
  isOccupied: z.boolean().optional().default(false),
  occupantName: z.string().trim().max(160).optional().default(''),
  payment: propertyUnitPaymentSchema.optional().default({}),
});

const propertyLayoutFloorSchema = z.object({
  floorNumber: z.coerce.number().int().min(0).max(500),
  units: z.array(propertyLayoutUnitSchema).min(1).max(200),
});

const propertyLayoutDetailsSchema = z.object({
  floors: z.array(propertyLayoutFloorSchema).max(500).optional().default([]),
});

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toMilestoneLookupKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const constructionMilestoneLookup = (() => {
  const map = new Map();
  for (const milestone of CONSTRUCTION_MILESTONE_DEFINITIONS) {
    const key = milestone.key;
    const label = milestone.label;
    const slugKey = toMilestoneLookupKey(key);
    const slugLabel = toMilestoneLookupKey(label);
    map.set(key, key);
    map.set(slugKey, key);
    map.set(slugKey.replace(/_/g, ''), key);
    map.set(slugLabel, key);
    map.set(slugLabel.replace(/_/g, ''), key);
    map.set(slugify(label).replace(/-/g, '_'), key);
    map.set(slugify(label).replace(/-/g, ''), key);
  }
  return map;
})();

function normalizeCompanyName(value) {
  return String(value || '')
    .trim()
    .slice(0, 160)
    .replace(/\bdevolpers\b/gi, 'Developers')
    .replace(/\bdevlopers\b/gi, 'Developers')
    .replace(/\bdevolper\b/gi, 'Developer')
    .replace(/\bdevloper\b/gi, 'Developer');
}

function generateCompanyCode() {
  return `COMP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function toNullableNumber(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toNullableInt(value) {
  const num = toNullableNumber(value);
  if (num === null) return null;
  return Number.isInteger(num) ? num : Math.round(num);
}

function parseCommaList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => String(entry || '').split(','))
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function clampInt(value, min, max, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

function normalizeConstructionOverallStatus(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'Planning';
  const byKey = CONSTRUCTION_OVERALL_STATUSES.find((status) => status.toLowerCase() === raw);
  if (byKey) return byKey;
  if (raw === 'under_construction' || raw === 'under-construction') return 'Under Construction';
  if (raw === 'near_completion' || raw === 'near-completion') return 'Near Completion';
  return 'Planning';
}

function isSupportedConstructionOverallStatusInput(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return false;
  return (
    CONSTRUCTION_OVERALL_STATUSES.some((status) => status.toLowerCase() === raw) ||
    raw === 'under_construction' ||
    raw === 'under-construction' ||
    raw === 'near_completion' ||
    raw === 'near-completion'
  );
}

function normalizeConstructionScheduleStatus(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'on_schedule';
  if (
    raw === 'on_schedule' ||
    raw === 'onschedule' ||
    raw === 'on schedule' ||
    raw === 'on-schedule'
  ) {
    return 'on_schedule';
  }
  if (
    raw === 'slight_delay' ||
    raw === 'slightdelay' ||
    raw === 'slight delay' ||
    raw === 'slight-delay'
  ) {
    return 'slight_delay';
  }
  if (
    raw === 'major_delay' ||
    raw === 'majordelay' ||
    raw === 'major delay' ||
    raw === 'major-delay'
  ) {
    return 'major_delay';
  }
  return 'on_schedule';
}

function isSupportedConstructionScheduleStatusInput(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return false;
  return (
    raw === 'on_schedule' ||
    raw === 'onschedule' ||
    raw === 'on schedule' ||
    raw === 'on-schedule' ||
    raw === 'slight_delay' ||
    raw === 'slightdelay' ||
    raw === 'slight delay' ||
    raw === 'slight-delay' ||
    raw === 'major_delay' ||
    raw === 'majordelay' ||
    raw === 'major delay' ||
    raw === 'major-delay'
  );
}

function formatConstructionScheduleStatus(status) {
  if (status === 'major_delay') return 'Major delay';
  if (status === 'slight_delay') return 'Slight delay';
  return 'On schedule';
}

function normalizeConstructionUpdateApprovalStatus(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (CONSTRUCTION_UPDATE_APPROVAL_STATUSES.includes(raw)) {
    return raw;
  }
  return 'pending';
}

function normalizeConstructionMilestoneStatus(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'upcoming';
  if (raw === 'completed' || raw === 'complete') return 'completed';
  if (
    raw === 'in_progress' ||
    raw === 'inprogress' ||
    raw === 'in progress' ||
    raw === 'in-progress'
  ) {
    return 'in_progress';
  }
  if (raw === 'upcoming') return 'upcoming';
  return 'upcoming';
}

function isSupportedConstructionMilestoneStatusInput(value) {
  const raw = String(value || '').trim().toLowerCase();
  return (
    raw === 'completed' ||
    raw === 'complete' ||
    raw === 'in_progress' ||
    raw === 'inprogress' ||
    raw === 'in progress' ||
    raw === 'in-progress' ||
    raw === 'upcoming'
  );
}

function formatConstructionMilestoneStatus(status) {
  if (status === 'completed') return 'Completed';
  if (status === 'in_progress') return 'In progress';
  return 'Upcoming';
}

function normalizeConstructionDateString(value) {
  if (value === undefined || value === null) return null;
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return raw;
}

function resolveConstructionMilestoneKey(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const lookupKey = toMilestoneLookupKey(raw);
  return constructionMilestoneLookup.get(lookupKey) || constructionMilestoneLookup.get(raw) || null;
}

function buildDefaultConstructionMilestones() {
  return CONSTRUCTION_MILESTONE_DEFINITIONS.map((milestone) => ({
    key: milestone.key,
    label: milestone.label,
    status: 'upcoming',
    statusLabel: 'Upcoming',
    completionDate: null,
  }));
}

function normalizeConstructionMilestones(rawMilestones) {
  const defaults = buildDefaultConstructionMilestones();
  if (!Array.isArray(rawMilestones)) {
    return defaults;
  }

  const byKey = new Map();
  for (const entry of rawMilestones) {
    if (!entry || typeof entry !== 'object') continue;
    const key = resolveConstructionMilestoneKey(entry.key || entry.label || '');
    if (!key) continue;
    const status = normalizeConstructionMilestoneStatus(entry.status);
    const completionDate =
      status === 'completed' ? normalizeConstructionDateString(entry.completionDate) : null;
    byKey.set(key, {
      status,
      completionDate,
    });
  }

  return CONSTRUCTION_MILESTONE_DEFINITIONS.map((milestone) => {
    const value = byKey.get(milestone.key);
    const status = value?.status || 'upcoming';
    return {
      key: milestone.key,
      label: milestone.label,
      status,
      statusLabel: formatConstructionMilestoneStatus(status),
      completionDate: status === 'completed' ? value?.completionDate || null : null,
    };
  });
}

function serializeConstructionMilestones(milestones) {
  return normalizeConstructionMilestones(milestones).map((entry) => ({
    key: entry.key,
    label: entry.label,
    status: entry.status,
    completionDate: entry.completionDate,
  }));
}

function mergeConstructionMilestones(currentMilestones, incomingMilestones) {
  const currentByKey = new Map(
    normalizeConstructionMilestones(currentMilestones).map((entry) => [entry.key, entry])
  );

  if (!Array.isArray(incomingMilestones) || incomingMilestones.length === 0) {
    return normalizeConstructionMilestones(currentMilestones);
  }

  const patchByKey = new Map();
  for (const entry of incomingMilestones) {
    if (!entry || typeof entry !== 'object') continue;
    const key = resolveConstructionMilestoneKey(entry.key || '');
    if (!key) continue;
    patchByKey.set(key, {
      status: normalizeConstructionMilestoneStatus(entry.status),
      completionDate: normalizeConstructionDateString(entry.completionDate),
    });
  }

  return CONSTRUCTION_MILESTONE_DEFINITIONS.map((milestone) => {
    const current = currentByKey.get(milestone.key) || {
      key: milestone.key,
      label: milestone.label,
      status: 'upcoming',
      completionDate: null,
    };
    const patch = patchByKey.get(milestone.key);
    if (!patch) {
      return {
        key: milestone.key,
        label: milestone.label,
        status: normalizeConstructionMilestoneStatus(current.status),
        statusLabel: formatConstructionMilestoneStatus(current.status),
        completionDate:
          normalizeConstructionMilestoneStatus(current.status) === 'completed'
            ? normalizeConstructionDateString(current.completionDate)
            : null,
      };
    }

    const nextStatus = normalizeConstructionMilestoneStatus(patch.status || current.status);
    const fallbackDate = normalizeConstructionDateString(current.completionDate);
    const nextCompletionDate =
      nextStatus === 'completed' ? patch.completionDate || fallbackDate || null : null;

    return {
      key: milestone.key,
      label: milestone.label,
      status: nextStatus,
      statusLabel: formatConstructionMilestoneStatus(nextStatus),
      completionDate: nextCompletionDate,
    };
  });
}

function toConstructionOverallStatusFromProjectStatus(projectStatus) {
  if (projectStatus === 'Ready to Move') return 'Completed';
  if (projectStatus === 'Under Construction') return 'Under Construction';
  return 'Planning';
}

function toProjectStatusFromConstructionOverallStatus(constructionStatus) {
  if (constructionStatus === 'Completed') return 'Ready to Move';
  if (constructionStatus === 'Under Construction' || constructionStatus === 'Near Completion') {
    return 'Under Construction';
  }
  return 'Upcoming';
}

function buildInitialConstructionMilestones(projectStatus, completionDate) {
  const defaults = buildDefaultConstructionMilestones();
  if (projectStatus === 'Ready to Move') {
    const normalizedDate = normalizeConstructionDateString(completionDate);
    return defaults.map((entry) => ({
      ...entry,
      status: 'completed',
      statusLabel: 'Completed',
      completionDate: normalizedDate,
    }));
  }
  if (projectStatus === 'Under Construction') {
    return defaults.map((entry, index) => {
      if (index === 0) {
        return {
          ...entry,
          status: 'completed',
          statusLabel: 'Completed',
          completionDate: null,
        };
      }
      if (index === 1) {
        return {
          ...entry,
          status: 'in_progress',
          statusLabel: 'In progress',
          completionDate: null,
        };
      }
      return entry;
    });
  }
  return defaults;
}

function mapConstructionUpdate(row) {
  const photoUrls = Array.isArray(row.photo_urls) ? row.photo_urls.filter(Boolean) : [];
  const approvalStatus = normalizeConstructionUpdateApprovalStatus(row.approval_status);

  return {
    id: Number(row.id),
    projectId: Number(row.project_id),
    title: row.title,
    description: row.description || '',
    photoUrls,
    approvalStatus,
    reviewNote: row.review_note || '',
    reviewedByUserId: row.reviewed_by_user_id ? Number(row.reviewed_by_user_id) : null,
    reviewedAt: row.reviewed_at || null,
    createdByUserId: row.created_by_user_id ? Number(row.created_by_user_id) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapProjectConstruction(row, options = {}) {
  const overallStatus = normalizeConstructionOverallStatus(row.construction_overall_status);
  const completionPercent = clampInt(row.construction_completion_percent, 0, 100, 0);
  const milestones = normalizeConstructionMilestones(row.construction_milestones);
  const scheduleStatus = normalizeConstructionScheduleStatus(row.construction_schedule_status);
  const latestUpdate = options.latestUpdate || null;
  const updatesCount = Number(options.updatesCount || 0);

  return {
    overallStatus,
    completionPercent,
    milestones,
    lastUpdatedAt: row.construction_last_updated_at || row.updated_at || row.created_at || null,
    estimatedCompletionDate: row.construction_estimated_completion_date || null,
    scheduleStatus,
    scheduleStatusLabel: formatConstructionScheduleStatus(scheduleStatus),
    delayReason: row.construction_delay_reason || '',
    latestUpdate,
    updatesCount,
    disclosure: CONSTRUCTION_DISCLOSURE_TEXT,
  };
}

function isAdminUser(user) {
  if (!user) return false;
  if (user.isMainAdmin) return true;
  const directRole = String(user.role || '').trim();
  if (directRole === 'admin' || directRole === 'main_admin') return true;
  return (
    Array.isArray(user.roles) &&
    (user.roles.includes('admin') || user.roles.includes('main_admin'))
  );
}

async function getCompanyMembership(userId) {
  const rows = await pool.query(
    `
      SELECT
        u.company_id,
        u.company_role,
        bc.company_type
      FROM users u
      LEFT JOIN builder_companies bc
        ON bc.id = u.company_id
      WHERE u.id = $1
      LIMIT 1
    `,
    [userId]
  );

  if (rows.rowCount === 0) {
    return null;
  }

  const row = rows.rows[0];
  const companyId = Number(row.company_id || 0);
  if (!companyId) {
    return null;
  }

  return {
    companyId,
    companyRole: row.company_role || null,
    companyType: row.company_type || null,
  };
}

function canActAsBuilderDealer(membership) {
  if (!membership) return false;
  if (membership.companyRole !== 'owner' && membership.companyRole !== 'member') return false;
  return COMPANY_TYPES.includes(membership.companyType);
}

async function ensureCompanyShadow(companyId) {
  await pool.query(
    `
      INSERT INTO companies (
        id,
        code,
        name,
        company_type,
        logo_url,
        created_by_user_id,
        created_at,
        updated_at
      )
      SELECT
        bc.id,
        bc.company_code,
        bc.name,
        bc.company_type,
        bc.logo_url,
        bc.created_by_user_id,
        bc.created_at,
        bc.updated_at
      FROM builder_companies bc
      WHERE bc.id = $1
      ON CONFLICT (id)
      DO UPDATE SET
        code = EXCLUDED.code,
        name = EXCLUDED.name,
        company_type = EXCLUDED.company_type,
        logo_url = EXCLUDED.logo_url,
        updated_at = NOW()
    `,
    [companyId]
  );
}

function mapCompanySummary(row) {
  return {
    id: Number(row.id),
    code: row.code,
    name: row.name,
    companyType: row.company_type,
    city: row.city || '',
    state: row.state || '',
    area: row.area || '',
    address: row.address || '',
    website: row.website_url || '',
    phone: row.phone || '',
    email: row.email || '',
    reraNumber: row.rera_number || '',
    description: row.description || '',
    serviceAreas: Array.isArray(row.service_areas) ? row.service_areas : [],
    logoUrl: row.logo_url || '',
    bannerUrl: row.banner_url || '',
    coverImage: row.cover_image || row.banner_url || '',
    isVerified: Boolean(row.is_verified),
    verifiedAt: row.verified_at || null,
    projectCount: Number(row.project_count || 0),
    propertyCount: Number(row.property_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapProjectSummary(row) {
  const images = Array.isArray(row.image_urls) ? row.image_urls : [];
  return {
    id: Number(row.id),
    companyId: Number(row.company_id),
    projectName: row.project_name,
    projectType: row.project_type,
    state: row.state,
    city: row.city,
    area: row.area,
    fullAddress: row.full_address,
    landmark: row.landmark || '',
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    priceMin: row.price_min === null ? null : Number(row.price_min),
    priceMax: row.price_max === null ? null : Number(row.price_max),
    pricePerSqft: row.price_per_sqft === null ? null : Number(row.price_per_sqft),
    configurations: Array.isArray(row.configurations) ? row.configurations : [],
    totalUnits: row.total_units === null ? null : Number(row.total_units),
    totalFloors: row.total_floors === null ? null : Number(row.total_floors),
    totalArea: row.total_area === null ? null : Number(row.total_area),
    possessionDate: row.possession_date,
    status: row.status,
    imageUrls: images,
    primaryImage: images[0] || '',
    brochureUrl: row.brochure_url || '',
    highlights: row.highlights || '',
    amenities: Array.isArray(row.amenities) ? row.amenities : [],
    construction: mapProjectConstruction(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPropertySummary(row) {
  const images = Array.isArray(row.image_urls) ? row.image_urls : [];
  const parsedLayout = propertyLayoutDetailsSchema.safeParse(row.layout_details || {});
  return {
    id: Number(row.id),
    companyId: Number(row.company_id),
    projectId: row.project_id === null ? null : Number(row.project_id),
    title: row.title,
    propertyType: row.property_type,
    listingType: row.listing_type,
    price: row.price === null ? null : Number(row.price),
    pricePerSqft: row.price_per_sqft === null ? null : Number(row.price_per_sqft),
    rentPerMonth: row.rent_per_month === null ? null : Number(row.rent_per_month),
    rentDeposit: row.rent_deposit === null ? null : Number(row.rent_deposit),
    state: row.state,
    city: row.city,
    area: row.area,
    locality: row.locality || '',
    address: row.address || '',
    fullAddress: row.full_address,
    landmark: row.landmark || '',
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    areaSqft: row.area_sqft === null ? null : Number(row.area_sqft),
    carpetArea: row.carpet_area === null ? null : Number(row.carpet_area),
    builtupArea: row.builtup_area === null ? null : Number(row.builtup_area),
    superBuiltupArea: row.super_builtup_area === null ? null : Number(row.super_builtup_area),
    bedrooms: row.bedrooms === null ? null : Number(row.bedrooms),
    bhk: row.bedrooms === null ? null : Number(row.bedrooms),
    bathrooms: row.bathrooms === null ? null : Number(row.bathrooms),
    floorNumber: row.floor_number === null ? null : Number(row.floor_number),
    totalFloors: row.total_floors === null ? null : Number(row.total_floors),
    facing: row.facing || 'NA',
    isCorner: Boolean(row.is_corner),
    isVaastu: Boolean(row.is_vaastu),
    possessionStatus: row.possession_status || 'ready',
    reraNumber: row.rera_number || '',
    furnishing: row.furnishing || 'na',
    isNegotiable: Boolean(row.is_negotiable),
    isPrelaunch: Boolean(row.is_prelaunch),
    isVerified: Boolean(row.is_verified),
    isFeatured: Boolean(row.is_featured),
    viewCount: Number(row.view_count || 0),
    availabilityDate: row.availability_date,
    imageUrls: images,
    primaryImage: images[0] || '',
    description: row.description || '',
    layoutDetails: parsedLayout.success ? parsedLayout.data : { floors: [] },
    amenities: Array.isArray(row.amenities) ? row.amenities : [],
    postedBy: row.posted_by ? Number(row.posted_by) : null,
    companyName: row.company_name || '',
    companyType: row.company_type || '',
    companyPropertyCount: Number(row.company_property_count || 0),
    activeGroupDealCode: row.active_group_deal_code || '',
    activeGroupDealStatus: row.active_group_deal_status || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeIpAddress(rawValue) {
  if (!rawValue) return '';
  return String(rawValue).split(',')[0].trim().slice(0, 64);
}

async function writeRealtyAudit({
  req,
  actionKey,
  entityType,
  entityId = null,
  requestReference = null,
  metadata = {},
}) {
  await pool.query(
    `
      INSERT INTO activity_logs (
        actor_user_id,
        actor_role,
        action_key,
        entity_type,
        entity_id,
        request_reference,
        ip_address,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
    `,
    [
      req.user?.id || null,
      req.user?.role || '',
      actionKey,
      entityType,
      entityId,
      requestReference,
      normalizeIpAddress(req.ip || req.socket?.remoteAddress),
      JSON.stringify(metadata || {}),
    ]
  );
}

async function fetchProjectDetails(projectId) {
  const rows = await pool.query(
    `
      SELECT
        p.*,
        c.name AS company_name,
        c.logo_url AS company_logo_url,
        c.is_verified AS company_verified,
        COALESCE(array_remove(array_agg(DISTINCT a.name), NULL), ARRAY[]::TEXT[]) AS amenities
      FROM projects p
      JOIN companies c
        ON c.id = p.company_id
      LEFT JOIN project_amenities pa
        ON pa.project_id = p.id
      LEFT JOIN amenities a
        ON a.id = pa.amenity_id
      WHERE p.id = $1
      GROUP BY p.id, c.name, c.logo_url, c.is_verified
      LIMIT 1
    `,
    [projectId]
  );

  if (rows.rowCount === 0) {
    return null;
  }

  const row = rows.rows[0];
  const [latestUpdateRows, approvedCountRows] = await Promise.all([
    pool.query(
      `
        SELECT
          id,
          project_id,
          title,
          description,
          photo_urls,
          created_by_user_id,
          approval_status,
          review_note,
          reviewed_by_user_id,
          reviewed_at,
          created_at,
          updated_at
        FROM project_construction_updates
        WHERE project_id = $1
          AND approval_status = 'approved'
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [projectId]
    ),
    pool.query(
      `
        SELECT COUNT(*)::INT AS approved_count
        FROM project_construction_updates
        WHERE project_id = $1
          AND approval_status = 'approved'
      `,
      [projectId]
    ),
  ]);

  const approvedCount =
    approvedCountRows.rowCount > 0 ? Number(approvedCountRows.rows[0].approved_count || 0) : 0;
  const latestUpdate =
    latestUpdateRows.rowCount > 0 ? mapConstructionUpdate(latestUpdateRows.rows[0]) : null;
  const projectSummary = mapProjectSummary(row);

  return {
    ...projectSummary,
    construction: mapProjectConstruction(row, {
      latestUpdate,
      updatesCount: approvedCount,
    }),
    company: {
      id: Number(row.company_id),
      name: row.company_name,
      logoUrl: row.company_logo_url || '',
      isVerified: Boolean(row.company_verified),
    },
  };
}

async function fetchPropertyDetails(propertyId) {
  const rows = await pool.query(
    `
      SELECT
        pr.*,
        c.name AS company_name,
        c.logo_url AS company_logo_url,
        c.is_verified AS company_verified,
        COALESCE(array_remove(array_agg(DISTINCT a.name), NULL), ARRAY[]::TEXT[]) AS amenities
      FROM properties pr
      JOIN companies c
        ON c.id = pr.company_id
      LEFT JOIN property_amenities pa
        ON pa.property_id = pr.id
      LEFT JOIN amenities a
        ON a.id = pa.amenity_id
      WHERE pr.id = $1
      GROUP BY pr.id, c.name, c.logo_url, c.is_verified
      LIMIT 1
    `,
    [propertyId]
  );

  if (rows.rowCount === 0) {
    return null;
  }

  const row = rows.rows[0];
  return {
    ...mapPropertySummary(row),
    company: {
      id: Number(row.company_id),
      name: row.company_name,
      logoUrl: row.company_logo_url || '',
      isVerified: Boolean(row.company_verified),
    },
  };
}

function parsePositiveId(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value);
}

async function fetchProjectOwnership(projectId) {
  const rows = await pool.query(
    `
      SELECT id, company_id
      FROM projects
      WHERE id = $1
      LIMIT 1
    `,
    [projectId]
  );

  if (rows.rowCount === 0) {
    return null;
  }

  return {
    projectId: Number(rows.rows[0].id),
    companyId: Number(rows.rows[0].company_id),
  };
}

async function resolveProjectProgressAccess(req, projectId) {
  const ownership = await fetchProjectOwnership(projectId);
  if (!ownership) {
    return {
      exists: false,
      canManage: false,
      canModerate: false,
      ownership: null,
      membership: null,
    };
  }

  const adminUser = isAdminUser(req.user);
  const canManageCompanyPermission = await hasPermission(req, 'manage_company');
  if (adminUser || canManageCompanyPermission) {
    return {
      exists: true,
      canManage: true,
      canModerate: adminUser,
      ownership,
      membership: null,
    };
  }

  const membership = await getCompanyMembership(req.user.id);
  const canManageProject =
    canActAsBuilderDealer(membership) && Number(membership.companyId) === Number(ownership.companyId);

  return {
    exists: true,
    canManage: canManageProject,
    canModerate: false,
    ownership,
    membership,
  };
}

async function fetchProjectConstructionUpdates(projectId, options = {}) {
  const status = String(options.status || 'approved').trim().toLowerCase();
  const limit = clampInt(options.limit, 1, 300, 120);
  const includeAll = status === 'all';
  const whereParts = ['project_id = $1'];
  const values = [projectId];

  if (!includeAll) {
    const normalizedStatus = normalizeConstructionUpdateApprovalStatus(status);
    values.push(normalizedStatus);
    whereParts.push(`approval_status = $${values.length}`);
  }

  values.push(limit);
  const rows = await pool.query(
    `
      SELECT
        id,
        project_id,
        title,
        description,
        photo_urls,
        created_by_user_id,
        approval_status,
        review_note,
        reviewed_by_user_id,
        reviewed_at,
        created_at,
        updated_at
      FROM project_construction_updates
      WHERE ${whereParts.join(' AND ')}
      ORDER BY created_at DESC, id DESC
      LIMIT $${values.length}
    `,
    values
  );

  return rows.rows.map(mapConstructionUpdate);
}

const listCompaniesQuerySchema = z.object({
  q: z.string().trim().max(120).optional().default(''),
  city: z.string().trim().max(120).optional().default(''),
  verified: z.enum(['all', 'true', 'false']).optional().default('all'),
  limit: z.coerce.number().int().min(1).max(80).optional().default(30),
});

const updateCompanySchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  companyType: z.enum(COMPANY_TYPES).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(120).optional(),
  area: z.string().trim().max(160).optional(),
  address: z.string().trim().max(500).optional(),
  websiteUrl: z.string().trim().max(500).optional().or(z.literal('')),
  phone: z.string().trim().max(32).optional().or(z.literal('')),
  email: z.string().trim().email().max(190).optional().or(z.literal('')),
  reraNumber: z.string().trim().max(80).optional().or(z.literal('')),
  description: z.string().trim().max(5000).optional(),
  serviceAreas: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  logoUrl: z.string().trim().max(1000).optional().or(z.literal('')),
  bannerUrl: z.string().trim().max(1000).optional().or(z.literal('')),
});

const createCompanySchema = updateCompanySchema.extend({
  name: z.string().trim().min(2).max(160),
});

const verifyCompanySchema = z.object({
  isVerified: z.boolean(),
  note: z.string().trim().max(1200).optional().or(z.literal('')),
});

const verificationDocumentUploadSchema = z.object({
  documentType: z
    .enum(['rera_certificate', 'tax_certificate', 'incorporation_certificate', 'government_id', 'other']),
  fileUrl: z.string().trim().url().max(1200),
  notes: z.string().trim().max(1200).optional().or(z.literal('')),
});

const verificationDocumentReviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  note: z.string().trim().max(1200).optional().or(z.literal('')),
});

const createAmenitySchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().max(40).optional().default('general'),
  iconKey: z.string().trim().max(40).optional().default(''),
});

router.get('/amenities', async (req, res, next) => {
  try {
    const rows = await pool.query(
      `
        SELECT id, name, slug, category, icon_key, created_at
        FROM amenities
        ORDER BY name ASC
      `
    );

    return res.json({
      amenities: rows.rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        slug: row.slug,
        category: row.category,
        iconKey: row.icon_key || '',
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.post(
  '/amenities',
  requireAuth,
  requirePermission('approve_listing'),
  async (req, res, next) => {
  try {
    const payload = createAmenitySchema.parse(req.body || {});
    const slug = slugify(payload.name);
    if (!slug) {
      return res.status(400).json({ error: 'Invalid amenity name' });
    }

    const rows = await pool.query(
      `
        INSERT INTO amenities (name, slug, category, icon_key)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (slug)
        DO UPDATE SET
          name = EXCLUDED.name,
          category = EXCLUDED.category,
          icon_key = EXCLUDED.icon_key
        RETURNING id, name, slug, category, icon_key, created_at
      `,
      [payload.name, slug, payload.category, payload.iconKey]
    );

    const row = rows.rows[0];
    return res.status(201).json({
      amenity: {
        id: Number(row.id),
        name: row.name,
        slug: row.slug,
        category: row.category,
        iconKey: row.icon_key || '',
        createdAt: row.created_at,
      },
    });
  } catch (error) {
    return next(error);
  }
  }
);

router.get('/companies', async (req, res, next) => {
  try {
    const query = listCompaniesQuerySchema.parse({
      q: req.query.q,
      city: req.query.city,
      verified: req.query.verified,
      limit: req.query.limit,
    });

    const whereParts = ['1 = 1'];
    const values = [];

    if (query.q) {
      values.push(`%${query.q}%`);
      whereParts.push(`(c.name ILIKE $${values.length} OR c.description ILIKE $${values.length})`);
    }

    if (query.city) {
      values.push(query.city);
      whereParts.push(`c.city ILIKE $${values.length}`);
    }

    if (query.verified === 'true') {
      whereParts.push('c.is_verified = TRUE');
    } else if (query.verified === 'false') {
      whereParts.push('c.is_verified = FALSE');
    }

    values.push(query.limit);

    const rows = await pool.query(
      `
        SELECT
          c.*,
          COALESCE(b.image_url, c.banner_url, '') AS cover_image,
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
        LEFT JOIN LATERAL (
          SELECT image_url
          FROM builder_company_banners b
          WHERE b.company_id = c.id
            AND b.is_active = TRUE
          ORDER BY b.sort_order ASC, b.created_at DESC
          LIMIT 1
        ) b ON TRUE
        WHERE ${whereParts.join(' AND ')}
        ORDER BY c.is_verified DESC, c.updated_at DESC
        LIMIT $${values.length}
      `,
      values
    );

    return res.json({
      companies: rows.rows.map(mapCompanySummary),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/companies/:companyId', async (req, res, next) => {
  try {
    const companyId = Number(req.params.companyId);
    if (!Number.isFinite(companyId) || companyId <= 0) {
      return res.status(400).json({ error: 'Invalid company id' });
    }

    const rows = await pool.query(
      `
        SELECT
          c.*,
          COALESCE(b.image_url, c.banner_url, '') AS cover_image,
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
        LEFT JOIN LATERAL (
          SELECT image_url
          FROM builder_company_banners b
          WHERE b.company_id = c.id
            AND b.is_active = TRUE
          ORDER BY b.sort_order ASC, b.created_at DESC
          LIMIT 1
        ) b ON TRUE
        WHERE c.id = $1
        LIMIT 1
      `,
      [companyId]
    );

    if (rows.rowCount === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    return res.json({
      company: mapCompanySummary(rows.rows[0]),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/companies', requireAuth, async (req, res, next) => {
  try {
    const payload = createCompanySchema.parse(req.body || {});
    const normalizedCompanyName = normalizeCompanyName(payload.name);
    const membership = await getCompanyMembership(req.user.id);

    if (membership?.companyId) {
      return res.status(409).json({ error: 'User is already linked to a company' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let builderRow = null;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const companyCode = generateCompanyCode();
        try {
          const inserted = await client.query(
            `
              INSERT INTO builder_companies (
                company_code,
                name,
                company_type,
                logo_url,
                created_by_user_id
              )
              VALUES ($1, $2, $3, $4, $5)
              RETURNING id, company_code, name, company_type, logo_url
            `,
            [
              companyCode,
              normalizedCompanyName,
              payload.companyType || 'builder',
              payload.logoUrl || '',
              req.user.id,
            ]
          );
          builderRow = inserted.rows[0];
          break;
        } catch (error) {
          if (error && typeof error === 'object' && error.code === '23505') {
            continue;
          }
          throw error;
        }
      }

      if (!builderRow) {
        throw new Error('Unable to create company code. Please retry.');
      }

      const companyId = Number(builderRow.id);
      await client.query(
        `
          INSERT INTO companies (
            id,
            code,
            name,
            company_type,
            city,
            state,
            area,
            address,
            website_url,
            phone,
            email,
            rera_number,
            description,
            service_areas,
            logo_url,
            banner_url,
            created_by_user_id
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13, $14::TEXT[], $15, $16, $17
          )
        `,
        [
          companyId,
          builderRow.company_code,
          normalizedCompanyName,
          payload.companyType || 'builder',
          payload.city || '',
          payload.state || '',
          payload.area || '',
          payload.address || '',
          payload.websiteUrl || '',
          payload.phone || '',
          payload.email || '',
          payload.reraNumber || '',
          payload.description || '',
          payload.serviceAreas || [],
          payload.logoUrl || '',
          payload.bannerUrl || '',
          req.user.id,
        ]
      );

      await client.query(
        `
          UPDATE users
          SET company_id = $1,
              company_role = 'owner'
          WHERE id = $2
        `,
        [companyId, req.user.id]
      );

      await client.query('COMMIT');

      const created = await pool.query(
        `
          SELECT
            c.*,
            ''::TEXT AS cover_image,
            0::INT AS project_count,
            0::INT AS property_count
          FROM companies c
          WHERE c.id = $1
          LIMIT 1
        `,
        [companyId]
      );

      return res.status(201).json({
        company: mapCompanySummary(created.rows[0]),
      });
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

router.patch('/companies/:companyId', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.params.companyId);
    if (!Number.isFinite(companyId) || companyId <= 0) {
      return res.status(400).json({ error: 'Invalid company id' });
    }

    const payload = updateCompanySchema.parse(req.body || {});
    const normalizedCompanyName = payload.name !== undefined ? normalizeCompanyName(payload.name) : undefined;
    const membership = await getCompanyMembership(req.user.id);
    const canManageCompany = await hasPermission(req, 'manage_company');
    const isOwner = membership?.companyId === companyId && membership.companyRole === 'owner';

    if (!canManageCompany && !isOwner) {
      return res.status(403).json({ error: 'Only admin or company owner can update company profile' });
    }

    const updates = [];
    const values = [];

    const pushUpdate = (column, value) => {
      updates.push(`${column} = $${values.length + 1}`);
      values.push(value);
    };

    if (normalizedCompanyName !== undefined) pushUpdate('name', normalizedCompanyName);
    if (payload.companyType !== undefined) pushUpdate('company_type', payload.companyType);
    if (payload.city !== undefined) pushUpdate('city', payload.city);
    if (payload.state !== undefined) pushUpdate('state', payload.state);
    if (payload.area !== undefined) pushUpdate('area', payload.area);
    if (payload.address !== undefined) pushUpdate('address', payload.address);
    if (payload.websiteUrl !== undefined) pushUpdate('website_url', payload.websiteUrl);
    if (payload.phone !== undefined) pushUpdate('phone', payload.phone);
    if (payload.email !== undefined) pushUpdate('email', payload.email);
    if (payload.reraNumber !== undefined) pushUpdate('rera_number', payload.reraNumber);
    if (payload.description !== undefined) pushUpdate('description', payload.description);
    if (payload.serviceAreas !== undefined) pushUpdate('service_areas', payload.serviceAreas);
    if (payload.logoUrl !== undefined) pushUpdate('logo_url', payload.logoUrl);
    if (payload.bannerUrl !== undefined) pushUpdate('banner_url', payload.bannerUrl);

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(companyId);
    const rows = await pool.query(
      `
        UPDATE companies
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${values.length}
        RETURNING *
      `,
      values
    );

    if (rows.rowCount === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const base = rows.rows[0];

    const builderUpdates = [];
    const builderValues = [];
    const pushBuilderUpdate = (column, value) => {
      builderUpdates.push(`${column} = $${builderValues.length + 1}`);
      builderValues.push(value);
    };

    if (normalizedCompanyName !== undefined) pushBuilderUpdate('name', normalizedCompanyName);
    if (payload.companyType !== undefined) pushBuilderUpdate('company_type', payload.companyType);
    if (payload.logoUrl !== undefined) pushBuilderUpdate('logo_url', payload.logoUrl);

    if (builderUpdates.length > 0) {
      builderValues.push(companyId);
      await pool.query(
        `
          UPDATE builder_companies
          SET ${builderUpdates.join(', ')}, updated_at = NOW()
          WHERE id = $${builderValues.length}
        `,
        builderValues
      );
    }

    return res.json({
      company: {
        ...mapCompanySummary({
          ...base,
          cover_image: base.banner_url || '',
          project_count: 0,
          property_count: 0,
        }),
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/companies/:companyId/verification-documents', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.params.companyId);
    if (!Number.isFinite(companyId) || companyId <= 0) {
      return res.status(400).json({ error: 'Invalid company id' });
    }

    const membership = await getCompanyMembership(req.user.id);
    const canManageCompany = await hasPermission(req, 'manage_company');
    const isCompanyMember =
      membership?.companyId === companyId &&
      (membership.companyRole === 'owner' || membership.companyRole === 'member');

    if (!canManageCompany && !isCompanyMember) {
      return res.status(403).json({ error: 'Only admin or company members can view verification documents' });
    }

    const rows = await pool.query(
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
      `,
      [companyId]
    );

    return res.json({
      documents: rows.rows.map((row) => ({
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
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/companies/:companyId/verification-documents', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.params.companyId);
    if (!Number.isFinite(companyId) || companyId <= 0) {
      return res.status(400).json({ error: 'Invalid company id' });
    }

    const membership = await getCompanyMembership(req.user.id);
    const canManageCompany = await hasPermission(req, 'manage_company');
    const isCompanyMember =
      membership?.companyId === companyId &&
      (membership.companyRole === 'owner' || membership.companyRole === 'member');

    if (!canManageCompany && !isCompanyMember) {
      return res.status(403).json({ error: 'Only admin or company members can upload verification documents' });
    }

    const payload = verificationDocumentUploadSchema.parse(req.body || {});
    const companyRows = await pool.query('SELECT id FROM companies WHERE id = $1 LIMIT 1', [companyId]);
    if (companyRows.rowCount === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const rows = await pool.query(
      `
        INSERT INTO builder_verification_documents (
          company_id,
          uploaded_by_user_id,
          document_type,
          file_url,
          notes,
          status
        )
        VALUES ($1, $2, $3, $4, $5, 'pending')
        RETURNING
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
      `,
      [companyId, req.user.id, payload.documentType, payload.fileUrl, payload.notes || '']
    );

    const doc = rows.rows[0];
    await writeRealtyAudit({
      req,
      actionKey: 'builder_document_uploaded',
      entityType: 'builder_verification_document',
      entityId: Number(doc.id),
      requestReference: null,
      metadata: {
        companyId: Number(doc.company_id),
        documentType: doc.document_type,
      },
    });
    return res.status(201).json({
      document: {
        id: Number(doc.id),
        companyId: Number(doc.company_id),
        uploadedByUserId: doc.uploaded_by_user_id ? Number(doc.uploaded_by_user_id) : null,
        reviewedByUserId: doc.reviewed_by_user_id ? Number(doc.reviewed_by_user_id) : null,
        documentType: doc.document_type,
        fileUrl: doc.file_url,
        notes: doc.notes || '',
        status: doc.status,
        reviewedAt: doc.reviewed_at || null,
        createdAt: doc.created_at,
        updatedAt: doc.updated_at,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.patch(
  '/verification-documents/:documentId/review',
  requireAuth,
  requirePermission('verify_builder'),
  async (req, res, next) => {
    try {
      const documentId = Number(req.params.documentId);
      if (!Number.isFinite(documentId) || documentId <= 0) {
        return res.status(400).json({ error: 'Invalid document id' });
      }

      const payload = verificationDocumentReviewSchema.parse(req.body || {});
      const rows = await pool.query(
        `
          UPDATE builder_verification_documents
          SET status = $1,
              notes = CASE
                WHEN $2 = '' THEN notes
                WHEN notes = '' THEN $2
                ELSE notes || E'\n' || $2
              END,
              reviewed_by_user_id = $3,
              reviewed_at = NOW(),
              updated_at = NOW()
          WHERE id = $4
          RETURNING
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
        `,
        [payload.status, payload.note || '', req.user.id, documentId]
      );

      if (rows.rowCount === 0) {
        return res.status(404).json({ error: 'Verification document not found' });
      }

      const doc = rows.rows[0];
      await writeRealtyAudit({
        req,
        actionKey: payload.status === 'approved' ? 'builder_document_approved' : 'builder_document_rejected',
        entityType: 'builder_verification_document',
        entityId: Number(doc.id),
        requestReference: null,
        metadata: {
          companyId: Number(doc.company_id),
          documentType: doc.document_type,
          note: payload.note || '',
        },
      });
      return res.json({
        document: {
          id: Number(doc.id),
          companyId: Number(doc.company_id),
          uploadedByUserId: doc.uploaded_by_user_id ? Number(doc.uploaded_by_user_id) : null,
          reviewedByUserId: doc.reviewed_by_user_id ? Number(doc.reviewed_by_user_id) : null,
          documentType: doc.document_type,
          fileUrl: doc.file_url,
          notes: doc.notes || '',
          status: doc.status,
          reviewedAt: doc.reviewed_at || null,
          createdAt: doc.created_at,
          updatedAt: doc.updated_at,
        },
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.patch(
  '/companies/:companyId/verify',
  requireAuth,
  requirePermission('approve_company'),
  requirePermission('verify_builder'),
  async (req, res, next) => {
  try {
    const companyId = Number(req.params.companyId);
    if (!Number.isFinite(companyId) || companyId <= 0) {
      return res.status(400).json({ error: 'Invalid company id' });
    }

    const payload = verifyCompanySchema.parse(req.body || {});
    const rows = await pool.query(
      `
        UPDATE companies
        SET is_verified = $1,
            verified_at = CASE WHEN $1 = TRUE THEN NOW() ELSE NULL END,
            verified_by_user_id = CASE WHEN $1 = TRUE THEN $2 ELSE NULL END,
            updated_at = NOW()
        WHERE id = $3
        RETURNING id, is_verified, verified_at, verified_by_user_id
      `,
      [payload.isVerified, req.user.id, companyId]
    );

    if (rows.rowCount === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    await writeRealtyAudit({
      req,
      actionKey: payload.isVerified ? 'builder_verified' : 'builder_unverified',
      entityType: 'company',
      entityId: Number(rows.rows[0].id),
      metadata: {
        note: payload.note || '',
      },
    });

    return res.json({
      company: {
        id: Number(rows.rows[0].id),
        isVerified: Boolean(rows.rows[0].is_verified),
        verifiedAt: rows.rows[0].verified_at || null,
        verifiedByUserId: rows.rows[0].verified_by_user_id
          ? Number(rows.rows[0].verified_by_user_id)
          : null,
      },
    });
  } catch (error) {
    return next(error);
  }
  }
);

const createProjectSchema = z
  .object({
    companyId: z.coerce.number().int().positive().optional(),
    projectName: z.string().trim().min(2).max(180),
    projectType: z.enum(PROJECT_TYPES),
    state: z.string().trim().min(2).max(120),
    city: z.string().trim().min(2).max(120),
    area: z.string().trim().min(2).max(160),
    fullAddress: z.string().trim().min(4).max(700),
    landmark: z.string().trim().max(180).optional().default(''),
    latitude: z.union([z.coerce.number(), z.null()]).optional(),
    longitude: z.union([z.coerce.number(), z.null()]).optional(),
    priceMin: z.union([z.coerce.number(), z.null()]).optional(),
    priceMax: z.union([z.coerce.number(), z.null()]).optional(),
    pricePerSqft: z.union([z.coerce.number(), z.null()]).optional(),
    configurations: z.array(z.string().trim().min(1).max(100)).max(40).optional().default([]),
    totalUnits: z.union([z.coerce.number().int(), z.null()]).optional(),
    totalFloors: z.union([z.coerce.number().int(), z.null()]).optional(),
    totalArea: z.union([z.coerce.number(), z.null()]).optional(),
    possessionDate: z.string().trim().max(20).optional().or(z.literal('')),
    status: z.enum(PROJECT_STATUSES),
    imageUrls: z.array(z.string().trim().url().max(1000)).max(30).optional().default([]),
    brochureUrl: z.string().trim().url().max(1000).optional().or(z.literal('')),
    highlights: z.string().trim().max(9000).optional().default(''),
    amenityIds: z.array(z.coerce.number().int().positive()).optional().default([]),
  })
  .superRefine((payload, ctx) => {
    const min = toNullableNumber(payload.priceMin);
    const max = toNullableNumber(payload.priceMax);
    if (min !== null && min < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['priceMin'],
        message: 'priceMin must be greater than or equal to 0',
      });
    }
    if (max !== null && max < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['priceMax'],
        message: 'priceMax must be greater than or equal to 0',
      });
    }
    if (min !== null && max !== null && max < min) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['priceMax'],
        message: 'priceMax must be greater than or equal to priceMin',
      });
    }
  });

const listProjectsQuerySchema = z.object({
  companyId: z.coerce.number().int().positive().optional(),
  status: z.enum(['all', ...PROJECT_STATUSES]).optional().default('all'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(40),
});

const listProjectConstructionUpdatesQuerySchema = z.object({
  status: z.enum(['all', ...CONSTRUCTION_UPDATE_APPROVAL_STATUSES]).optional().default('approved'),
  limit: z.coerce.number().int().min(1).max(300).optional().default(120),
});

const updateProjectConstructionMilestoneSchema = z.object({
  key: z.string().trim().min(1).max(120),
  status: z.string().trim().min(1).max(40),
  completionDate: z.string().trim().max(20).optional().or(z.literal('')).or(z.null()),
});

const updateProjectConstructionSchema = z
  .object({
    overallStatus: z.string().trim().min(2).max(40).optional(),
    completionPercent: z.coerce.number().int().min(0).max(100).optional(),
    milestones: z.array(updateProjectConstructionMilestoneSchema).max(30).optional(),
    estimatedCompletionDate: z.string().trim().max(20).optional().or(z.literal('')).or(z.null()),
    scheduleStatus: z.string().trim().max(40).optional(),
    delayReason: z.string().trim().max(900).optional(),
  })
  .superRefine((payload, ctx) => {
    if (
      payload.overallStatus === undefined &&
      payload.completionPercent === undefined &&
      payload.milestones === undefined &&
      payload.estimatedCompletionDate === undefined &&
      payload.scheduleStatus === undefined &&
      payload.delayReason === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one construction field must be provided',
      });
    }
  });

const createProjectConstructionUpdateSchema = z.object({
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().max(600).optional().default(''),
  photoUrls: z.array(z.string().trim().url().max(1000)).min(3).max(6),
});

const reviewProjectConstructionUpdateSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  note: z.string().trim().max(900).optional().default(''),
});

router.get('/companies/:companyId/projects', async (req, res, next) => {
  try {
    const companyId = Number(req.params.companyId);
    if (!Number.isFinite(companyId) || companyId <= 0) {
      return res.status(400).json({ error: 'Invalid company id' });
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const rows = await pool.query(
      `
        SELECT
          p.*,
          COALESCE(array_remove(array_agg(DISTINCT a.name), NULL), ARRAY[]::TEXT[]) AS amenities
        FROM projects p
        LEFT JOIN project_amenities pa
          ON pa.project_id = p.id
        LEFT JOIN amenities a
          ON a.id = pa.amenity_id
        WHERE p.company_id = $1
        GROUP BY p.id
        ORDER BY p.created_at DESC
        LIMIT $2
      `,
      [companyId, limit]
    );

    return res.json({
      projects: rows.rows.map(mapProjectSummary),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/projects', async (req, res, next) => {
  try {
    const query = listProjectsQuerySchema.parse({
      companyId: req.query.companyId,
      status: req.query.status,
      limit: req.query.limit,
    });

    const whereParts = ['1 = 1'];
    const values = [];

    if (query.companyId) {
      values.push(query.companyId);
      whereParts.push(`p.company_id = $${values.length}`);
    }

    if (query.status !== 'all') {
      values.push(query.status);
      whereParts.push(`p.status = $${values.length}`);
    }

    values.push(query.limit);
    const rows = await pool.query(
      `
        SELECT
          p.*,
          COALESCE(array_remove(array_agg(DISTINCT a.name), NULL), ARRAY[]::TEXT[]) AS amenities
        FROM projects p
        LEFT JOIN project_amenities pa
          ON pa.project_id = p.id
        LEFT JOIN amenities a
          ON a.id = pa.amenity_id
        WHERE ${whereParts.join(' AND ')}
        GROUP BY p.id
        ORDER BY p.created_at DESC
        LIMIT $${values.length}
      `,
      values
    );

    return res.json({
      projects: rows.rows.map(mapProjectSummary),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/projects/:projectId', async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    if (!Number.isFinite(projectId) || projectId <= 0) {
      return res.status(400).json({ error: 'Invalid project id' });
    }

    const project = await fetchProjectDetails(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    return res.json({ project });
  } catch (error) {
    return next(error);
  }
});

router.get('/projects/:projectId/construction-updates', async (req, res, next) => {
  try {
    const projectId = parsePositiveId(req.params.projectId);
    if (!projectId) {
      return res.status(400).json({ error: 'Invalid project id' });
    }

    const ownership = await fetchProjectOwnership(projectId);
    if (!ownership) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const query = listProjectConstructionUpdatesQuerySchema.parse({
      status: 'approved',
      limit: req.query.limit,
    });

    const updates = await fetchProjectConstructionUpdates(projectId, {
      status: query.status,
      limit: query.limit,
    });

    return res.json({ updates });
  } catch (error) {
    return next(error);
  }
});

router.get('/projects/:projectId/construction-updates/manage', requireAuth, async (req, res, next) => {
  try {
    const projectId = parsePositiveId(req.params.projectId);
    if (!projectId) {
      return res.status(400).json({ error: 'Invalid project id' });
    }

    const access = await resolveProjectProgressAccess(req, projectId);
    if (!access.exists) {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (!access.canManage) {
      return res.status(403).json({ error: 'You do not have access to manage this project' });
    }

    const query = listProjectConstructionUpdatesQuerySchema.parse({
      status: req.query.status || 'all',
      limit: req.query.limit,
    });

    const updates = await fetchProjectConstructionUpdates(projectId, {
      status: query.status,
      limit: query.limit,
    });

    return res.json({
      updates,
      canModerate: access.canModerate,
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/projects/:projectId/construction', requireAuth, async (req, res, next) => {
  try {
    const projectId = parsePositiveId(req.params.projectId);
    if (!projectId) {
      return res.status(400).json({ error: 'Invalid project id' });
    }

    const payload = updateProjectConstructionSchema.parse(req.body || {});
    const access = await resolveProjectProgressAccess(req, projectId);
    if (!access.exists) {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (!access.canManage) {
      return res.status(403).json({ error: 'Only project builder/developer can update progress' });
    }

    if (payload.overallStatus !== undefined && !isSupportedConstructionOverallStatusInput(payload.overallStatus)) {
      return res.status(400).json({ error: 'Invalid overall construction status' });
    }
    if (payload.scheduleStatus !== undefined && !isSupportedConstructionScheduleStatusInput(payload.scheduleStatus)) {
      return res.status(400).json({ error: 'Invalid construction schedule status' });
    }
    if (
      payload.estimatedCompletionDate !== undefined &&
      payload.estimatedCompletionDate !== null &&
      String(payload.estimatedCompletionDate).trim() !== '' &&
      !normalizeConstructionDateString(payload.estimatedCompletionDate)
    ) {
      return res.status(400).json({ error: 'estimatedCompletionDate must be in YYYY-MM-DD format' });
    }
    if (payload.milestones && payload.milestones.length > 0) {
      const invalidMilestone = payload.milestones.find(
        (milestone) =>
          !resolveConstructionMilestoneKey(milestone.key) ||
          !isSupportedConstructionMilestoneStatusInput(milestone.status)
      );
      if (invalidMilestone) {
        return res.status(400).json({ error: 'Invalid milestone key or status' });
      }
      const invalidMilestoneDate = payload.milestones.find((milestone) => {
        if (milestone.completionDate === undefined || milestone.completionDate === null) return false;
        const raw = String(milestone.completionDate || '').trim();
        if (!raw) return false;
        return !normalizeConstructionDateString(raw);
      });
      if (invalidMilestoneDate) {
        return res
          .status(400)
          .json({ error: 'milestone completionDate must be in YYYY-MM-DD format' });
      }
    }

    const currentRows = await pool.query(
      `
        SELECT
          id,
          company_id,
          construction_overall_status,
          construction_completion_percent,
          construction_milestones,
          construction_estimated_completion_date,
          construction_schedule_status,
          construction_delay_reason
        FROM projects
        WHERE id = $1
        LIMIT 1
      `,
      [projectId]
    );

    if (currentRows.rowCount === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const current = currentRows.rows[0];
    const nextOverallStatus = normalizeConstructionOverallStatus(
      payload.overallStatus ?? current.construction_overall_status
    );
    const nextCompletionPercent =
      payload.completionPercent === undefined
        ? clampInt(current.construction_completion_percent, 0, 100, 0)
        : clampInt(payload.completionPercent, 0, 100, 0);
    const nextMilestones = mergeConstructionMilestones(
      current.construction_milestones,
      payload.milestones || []
    );
    const nextEstimatedCompletionDate =
      payload.estimatedCompletionDate === undefined
        ? normalizeConstructionDateString(current.construction_estimated_completion_date)
        : normalizeConstructionDateString(payload.estimatedCompletionDate);
    const nextScheduleStatus = normalizeConstructionScheduleStatus(
      payload.scheduleStatus ?? current.construction_schedule_status
    );
    const nextDelayReason =
      payload.delayReason === undefined
        ? String(current.construction_delay_reason || '').trim()
        : String(payload.delayReason || '').trim();

    if (nextScheduleStatus !== 'on_schedule' && !nextDelayReason) {
      return res
        .status(400)
        .json({ error: 'Delay reason is required when schedule status indicates delay' });
    }

    const mappedProjectStatus = toProjectStatusFromConstructionOverallStatus(nextOverallStatus);

    await pool.query(
      `
        UPDATE projects
        SET
          construction_overall_status = $2,
          construction_completion_percent = $3,
          construction_milestones = $4::jsonb,
          construction_estimated_completion_date = $5,
          construction_schedule_status = $6,
          construction_delay_reason = $7,
          construction_last_updated_at = NOW(),
          status = $8
        WHERE id = $1
      `,
      [
        projectId,
        nextOverallStatus,
        nextCompletionPercent,
        JSON.stringify(serializeConstructionMilestones(nextMilestones)),
        nextEstimatedCompletionDate,
        nextScheduleStatus,
        nextScheduleStatus === 'on_schedule' ? '' : nextDelayReason,
        mappedProjectStatus,
      ]
    );

    await writeRealtyAudit({
      req,
      actionKey: 'construction_progress_updated',
      entityType: 'project',
      entityId: projectId,
      metadata: {
        overallStatus: nextOverallStatus,
        completionPercent: nextCompletionPercent,
      },
    });

    const project = await fetchProjectDetails(projectId);
    return res.json({ project });
  } catch (error) {
    return next(error);
  }
});

router.post('/projects/:projectId/construction-updates', requireAuth, async (req, res, next) => {
  try {
    const projectId = parsePositiveId(req.params.projectId);
    if (!projectId) {
      return res.status(400).json({ error: 'Invalid project id' });
    }

    const payload = createProjectConstructionUpdateSchema.parse(req.body || {});
    const access = await resolveProjectProgressAccess(req, projectId);
    if (!access.exists) {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (!access.canManage) {
      return res.status(403).json({ error: 'Only project builder/developer can add progress updates' });
    }

    const inserted = await pool.query(
      `
        INSERT INTO project_construction_updates (
          project_id,
          title,
          description,
          photo_urls,
          created_by_user_id,
          approval_status
        )
        VALUES ($1, $2, $3, $4::TEXT[], $5, 'pending')
        RETURNING
          id,
          project_id,
          title,
          description,
          photo_urls,
          created_by_user_id,
          approval_status,
          review_note,
          reviewed_by_user_id,
          reviewed_at,
          created_at,
          updated_at
      `,
      [projectId, payload.title, payload.description || '', payload.photoUrls, req.user.id]
    );

    await pool.query(
      `
        UPDATE projects
        SET
          construction_last_updated_at = NOW(),
          construction_overall_status = CASE
            WHEN construction_overall_status IN ('Planning', 'Approved') THEN 'Under Construction'
            ELSE construction_overall_status
          END,
          status = CASE
            WHEN status = 'Upcoming' THEN 'Under Construction'
            ELSE status
          END
        WHERE id = $1
      `,
      [projectId]
    );

    await writeRealtyAudit({
      req,
      actionKey: 'construction_update_added',
      entityType: 'project',
      entityId: projectId,
      metadata: {
        title: payload.title,
        photoCount: payload.photoUrls.length,
      },
    });

    return res.status(201).json({
      update: mapConstructionUpdate(inserted.rows[0]),
      moderation: {
        status: 'pending',
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.patch(
  '/projects/:projectId/construction-updates/:updateId/review',
  requireAuth,
  requireRole('admin', 'main_admin'),
  async (req, res, next) => {
    try {
      const projectId = parsePositiveId(req.params.projectId);
      const updateId = parsePositiveId(req.params.updateId);
      if (!projectId || !updateId) {
        return res.status(400).json({ error: 'Invalid project or update id' });
      }

      const payload = reviewProjectConstructionUpdateSchema.parse(req.body || {});
      const currentRows = await pool.query(
        `
          SELECT id
          FROM project_construction_updates
          WHERE id = $1
            AND project_id = $2
          LIMIT 1
        `,
        [updateId, projectId]
      );

      if (currentRows.rowCount === 0) {
        return res.status(404).json({ error: 'Construction update not found' });
      }

      const reviewed = await pool.query(
        `
          UPDATE project_construction_updates
          SET
            approval_status = $3,
            review_note = $4,
            reviewed_by_user_id = $5,
            reviewed_at = NOW()
          WHERE id = $1
            AND project_id = $2
          RETURNING
            id,
            project_id,
            title,
            description,
            photo_urls,
            created_by_user_id,
            approval_status,
            review_note,
            reviewed_by_user_id,
            reviewed_at,
            created_at,
            updated_at
        `,
        [updateId, projectId, payload.decision, payload.note || '', req.user.id]
      );

      await pool.query(
        `
          UPDATE projects
          SET construction_last_updated_at = NOW()
          WHERE id = $1
        `,
        [projectId]
      );

      await writeRealtyAudit({
        req,
        actionKey:
          payload.decision === 'approved'
            ? 'construction_update_approved'
            : 'construction_update_rejected',
        entityType: 'project',
        entityId: projectId,
        metadata: {
          updateId,
          note: payload.note || '',
        },
      });

      return res.json({
        update: mapConstructionUpdate(reviewed.rows[0]),
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.post('/projects', requireAuth, async (req, res, next) => {
  try {
    const payload = createProjectSchema.parse(req.body || {});
    const membership = await getCompanyMembership(req.user.id);
    const canManageCompany = await hasPermission(req, 'manage_company');

    if (!canActAsBuilderDealer(membership) && !canManageCompany) {
      return res.status(403).json({ error: 'Only builder/dealer accounts can create projects' });
    }

    const companyId = payload.companyId || membership?.companyId;
    if (!companyId) {
      return res.status(400).json({ error: 'companyId is required' });
    }

    if (!canManageCompany && membership?.companyId !== companyId) {
      return res.status(403).json({ error: 'Project can only be added to your own company' });
    }

    await ensureCompanyShadow(companyId);
    const exists = await pool.query('SELECT id FROM companies WHERE id = $1 LIMIT 1', [companyId]);
    if (exists.rowCount === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const amenityIds = [...new Set((payload.amenityIds || []).map((id) => Number(id)).filter((id) => id > 0))];
    if (amenityIds.length > 0) {
      const amenityRows = await pool.query(
        'SELECT id FROM amenities WHERE id = ANY($1::BIGINT[])',
        [amenityIds]
      );
      if (amenityRows.rowCount !== amenityIds.length) {
        return res.status(400).json({ error: 'One or more amenity ids are invalid' });
      }
    }

    const initialConstructionOverallStatus = toConstructionOverallStatusFromProjectStatus(payload.status);
    const initialConstructionCompletionPercent =
      payload.status === 'Ready to Move' ? 100 : payload.status === 'Under Construction' ? 15 : 0;
    const initialConstructionMilestones = serializeConstructionMilestones(
      buildInitialConstructionMilestones(payload.status, payload.possessionDate || null)
    );

    const inserted = await pool.query(
      `
        INSERT INTO projects (
          company_id,
          project_name,
          project_type,
          state,
          city,
          area,
          full_address,
          landmark,
          latitude,
          longitude,
          price_min,
          price_max,
          price_per_sqft,
          configurations,
          total_units,
          total_floors,
          total_area,
          possession_date,
          status,
          image_urls,
          brochure_url,
          highlights,
          construction_overall_status,
          construction_completion_percent,
          construction_milestones,
          construction_last_updated_at,
          construction_schedule_status,
          construction_delay_reason,
          created_by_user_id
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14::TEXT[],
          $15, $16, $17, $18, $19, $20::TEXT[], $21, $22, $23, $24, $25::jsonb, NOW(), $26, $27, $28
        )
        RETURNING id
      `,
      [
        companyId,
        payload.projectName,
        payload.projectType,
        payload.state,
        payload.city,
        payload.area,
        payload.fullAddress,
        payload.landmark || '',
        toNullableNumber(payload.latitude),
        toNullableNumber(payload.longitude),
        toNullableNumber(payload.priceMin),
        toNullableNumber(payload.priceMax),
        toNullableNumber(payload.pricePerSqft),
        payload.configurations || [],
        toNullableInt(payload.totalUnits),
        toNullableInt(payload.totalFloors),
        toNullableNumber(payload.totalArea),
        payload.possessionDate || null,
        payload.status,
        payload.imageUrls || [],
        payload.brochureUrl || '',
        payload.highlights || '',
        initialConstructionOverallStatus,
        initialConstructionCompletionPercent,
        JSON.stringify(initialConstructionMilestones),
        'on_schedule',
        '',
        req.user.id,
      ]
    );

    const projectId = Number(inserted.rows[0].id);
    if (amenityIds.length > 0) {
      await pool.query(
        `
          INSERT INTO project_amenities (project_id, amenity_id)
          SELECT $1, UNNEST($2::BIGINT[])
          ON CONFLICT (project_id, amenity_id) DO NOTHING
        `,
        [projectId, amenityIds]
      );
    }

    const project = await fetchProjectDetails(projectId);
    return res.status(201).json({ project });
  } catch (error) {
    return next(error);
  }
});

const createPropertySchema = z
  .object({
    companyId: z.coerce.number().int().positive().optional(),
    projectId: z.coerce.number().int().positive().optional(),
    title: z.string().trim().min(4).max(220),
    propertyType: z.enum(PROPERTY_TYPES),
    listingType: z.enum(['sale', 'rent']),
    price: z.union([z.coerce.number(), z.null()]).optional(),
    pricePerSqft: z.union([z.coerce.number(), z.null()]).optional(),
    rentPerMonth: z.union([z.coerce.number(), z.null()]).optional(),
    rentDeposit: z.union([z.coerce.number(), z.null()]).optional(),
    state: z.string().trim().min(2).max(120),
    city: z.string().trim().min(2).max(120),
    area: z.string().trim().min(2).max(160),
    locality: z.string().trim().max(160).optional().default(''),
    address: z.string().trim().max(1000).optional().default(''),
    fullAddress: z.string().trim().min(4).max(700),
    landmark: z.string().trim().max(180).optional().default(''),
    latitude: z.union([z.coerce.number(), z.null()]).optional(),
    longitude: z.union([z.coerce.number(), z.null()]).optional(),
    areaSqft: z.union([z.coerce.number(), z.null()]).optional(),
    carpetArea: z.union([z.coerce.number(), z.null()]).optional(),
    builtupArea: z.union([z.coerce.number(), z.null()]).optional(),
    superBuiltupArea: z.union([z.coerce.number(), z.null()]).optional(),
    bedrooms: z.union([z.coerce.number().int(), z.null()]).optional(),
    bathrooms: z.union([z.coerce.number().int(), z.null()]).optional(),
    floorNumber: z.union([z.coerce.number().int(), z.null()]).optional(),
    totalFloors: z.union([z.coerce.number().int(), z.null()]).optional(),
    facing: z.string().trim().max(20).optional().default('NA'),
    isCorner: z.boolean().optional().default(false),
    isVaastu: z.boolean().optional().default(false),
    possessionStatus: z
      .enum(['ready', 'under_construction', 'pre_launch', 'resale'])
      .optional()
      .default('ready'),
    reraNumber: z.string().trim().max(80).optional().default(''),
    furnishing: z.enum(FURNISHING_TYPES).optional().default('na'),
    isNegotiable: z.boolean().optional().default(false),
    isPrelaunch: z.boolean().optional().default(false),
    isVerified: z.boolean().optional().default(false),
    isFeatured: z.boolean().optional().default(false),
    availabilityDate: z.string().trim().max(20).optional().or(z.literal('')),
    imageUrls: z.array(z.string().trim().url().max(1000)).max(30).optional().default([]),
    description: z.string().trim().max(9000).optional().default(''),
    layoutDetails: propertyLayoutDetailsSchema.optional().default({ floors: [] }),
    amenityIds: z.array(z.coerce.number().int().positive()).optional().default([]),
  })
  .superRefine((payload, ctx) => {
    const salePrice = toNullableNumber(payload.price);
    const rentPerMonth = toNullableNumber(payload.rentPerMonth);
    if (payload.listingType === 'sale' && salePrice === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['price'],
        message: 'Sale listing requires price',
      });
    }
    if (payload.listingType === 'rent' && rentPerMonth === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rentPerMonth'],
        message: 'Rent listing requires rentPerMonth',
      });
    }
    if (
      (payload.propertyType === 'Apartment' || payload.propertyType === 'Commercial') &&
      (!payload.layoutDetails || payload.layoutDetails.floors.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['layoutDetails'],
        message: 'Apartment/Commercial listings require floor and unit block details',
      });
    }
  });

const updatePropertySchema = z.object({
  title: z.string().trim().min(4).max(220).optional(),
  propertyType: z.enum(PROPERTY_TYPES).optional(),
  listingType: z.enum(['sale', 'rent']).optional(),
  price: z.union([z.coerce.number(), z.null()]).optional(),
  pricePerSqft: z.union([z.coerce.number(), z.null()]).optional(),
  rentPerMonth: z.union([z.coerce.number(), z.null()]).optional(),
  rentDeposit: z.union([z.coerce.number(), z.null()]).optional(),
  state: z.string().trim().min(2).max(120).optional(),
  city: z.string().trim().min(2).max(120).optional(),
  area: z.string().trim().min(2).max(160).optional(),
  locality: z.string().trim().max(160).optional(),
  address: z.string().trim().max(1000).optional(),
  fullAddress: z.string().trim().min(4).max(700).optional(),
  landmark: z.string().trim().max(180).optional(),
  latitude: z.union([z.coerce.number(), z.null()]).optional(),
  longitude: z.union([z.coerce.number(), z.null()]).optional(),
  areaSqft: z.union([z.coerce.number(), z.null()]).optional(),
  carpetArea: z.union([z.coerce.number(), z.null()]).optional(),
  builtupArea: z.union([z.coerce.number(), z.null()]).optional(),
  superBuiltupArea: z.union([z.coerce.number(), z.null()]).optional(),
  bedrooms: z.union([z.coerce.number().int(), z.null()]).optional(),
  bathrooms: z.union([z.coerce.number().int(), z.null()]).optional(),
  floorNumber: z.union([z.coerce.number().int(), z.null()]).optional(),
  totalFloors: z.union([z.coerce.number().int(), z.null()]).optional(),
  facing: z.string().trim().max(20).optional(),
  isCorner: z.boolean().optional(),
  isVaastu: z.boolean().optional(),
  possessionStatus: z.enum(['ready', 'under_construction', 'pre_launch', 'resale']).optional(),
  reraNumber: z.string().trim().max(80).optional(),
  furnishing: z.enum(FURNISHING_TYPES).optional(),
  isNegotiable: z.boolean().optional(),
  isPrelaunch: z.boolean().optional(),
  isVerified: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  availabilityDate: z.string().trim().max(20).optional().or(z.literal('')),
  imageUrls: z.array(z.string().trim().url().max(1000)).max(30).optional(),
  description: z.string().trim().max(9000).optional(),
  layoutDetails: propertyLayoutDetailsSchema.optional(),
  amenityIds: z.array(z.coerce.number().int().positive()).optional(),
});

const createLeadSchema = z.object({
  propertyId: z.coerce.number().int().positive(),
  leadType: z
    .enum(['general', 'schedule_visit', 'contact_seller', 'make_offer', 'fraud_report'])
    .optional()
    .default('general'),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(32),
  email: z.string().trim().email().max(190).optional().or(z.literal('')),
  message: z.string().trim().min(4).max(2000),
});

const leadSubmissionLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 12,
  message: 'Too many lead submissions. Please try again later.',
});

const listPropertiesQuerySchema = z.object({
  companyId: z.coerce.number().int().positive().optional(),
  listingType: z.enum(['all', 'sale', 'rent']).optional().default('all'),
  city: z.string().trim().max(120).optional().default(''),
  locality: z.string().trim().max(160).optional().default(''),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  minPricePerSqft: z.coerce.number().nonnegative().optional(),
  maxPricePerSqft: z.coerce.number().nonnegative().optional(),
  bhk: z.string().trim().max(24).optional().default(''),
  type: z.string().trim().max(40).optional().default(''),
  facing: z.string().trim().max(20).optional().default(''),
  corner: z.enum(['true', 'false']).optional().default('false'),
  vastu: z.enum(['true', 'false']).optional().default('false'),
  amenities: z.string().trim().max(400).optional().default(''),
  negotiable: z.enum(['true', 'false']).optional().default('false'),
  prelaunch: z.enum(['true', 'false']).optional().default('false'),
  verifiedOnly: z.enum(['true', 'false']).optional().default('false'),
  minCarpetArea: z.coerce.number().nonnegative().optional(),
  maxCarpetArea: z.coerce.number().nonnegative().optional(),
  minBuiltupArea: z.coerce.number().nonnegative().optional(),
  maxBuiltupArea: z.coerce.number().nonnegative().optional(),
  minSuperBuiltupArea: z.coerce.number().nonnegative().optional(),
  maxSuperBuiltupArea: z.coerce.number().nonnegative().optional(),
  sort: z
    .enum(['recommended', 'price_low', 'price_high', 'newest', 'verified', 'most_viewed'])
    .optional()
    .default('recommended'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(60).optional().default(24),
});

router.get('/companies/:companyId/properties', async (req, res, next) => {
  try {
    const companyId = Number(req.params.companyId);
    if (!Number.isFinite(companyId) || companyId <= 0) {
      return res.status(400).json({ error: 'Invalid company id' });
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || 60, 1), 120);
    const rows = await pool.query(
      `
        SELECT
          pr.*,
          COALESCE(array_remove(array_agg(DISTINCT a.name), NULL), ARRAY[]::TEXT[]) AS amenities
        FROM properties pr
        LEFT JOIN property_amenities pa
          ON pa.property_id = pr.id
        LEFT JOIN amenities a
          ON a.id = pa.amenity_id
        WHERE pr.company_id = $1
        GROUP BY pr.id
        ORDER BY pr.created_at DESC
        LIMIT $2
      `,
      [companyId, limit]
    );

    return res.json({
      properties: rows.rows.map(mapPropertySummary),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/properties', async (req, res, next) => {
  try {
    const query = listPropertiesQuerySchema.parse({
      companyId: req.query.companyId,
      listingType: req.query.listingType,
      city: req.query.city,
      locality: req.query.locality,
      minPrice: req.query.minPrice,
      maxPrice: req.query.maxPrice,
      minPricePerSqft: req.query.minPricePerSqft,
      maxPricePerSqft: req.query.maxPricePerSqft,
      bhk: req.query.bhk,
      type: req.query.type,
      facing: req.query.facing,
      corner: req.query.corner,
      vastu: req.query.vastu,
      amenities: req.query.amenities,
      negotiable: req.query.negotiable,
      prelaunch: req.query.prelaunch,
      verifiedOnly: req.query.verifiedOnly,
      minCarpetArea: req.query.minCarpetArea,
      maxCarpetArea: req.query.maxCarpetArea,
      minBuiltupArea: req.query.minBuiltupArea,
      maxBuiltupArea: req.query.maxBuiltupArea,
      minSuperBuiltupArea: req.query.minSuperBuiltupArea,
      maxSuperBuiltupArea: req.query.maxSuperBuiltupArea,
      sort: req.query.sort,
      page: req.query.page,
      limit: req.query.limit,
    });

    const cacheKey = JSON.stringify(query);
    const cached = readPropertyListCache(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const whereParts = ['1 = 1'];
    const values = [];
    const havingParts = [];

    const amenityFilters = parseCommaList(query.amenities)
      .map((item) =>
        String(item || '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
      )
      .filter(Boolean);

    if (query.companyId) {
      values.push(query.companyId);
      whereParts.push(`pr.company_id = $${values.length}`);
    }

    if (query.listingType !== 'all') {
      values.push(query.listingType);
      whereParts.push(`pr.listing_type = $${values.length}`);
    }

    if (query.city) {
      values.push(`%${query.city}%`);
      whereParts.push(`pr.city ILIKE $${values.length}`);
    }

    if (query.locality) {
      values.push(`%${query.locality}%`);
      whereParts.push(`(pr.locality ILIKE $${values.length} OR pr.area ILIKE $${values.length})`);
    }

    if (query.minPrice !== undefined) {
      values.push(query.minPrice);
      whereParts.push(`pr.price >= $${values.length}`);
    }

    if (query.maxPrice !== undefined) {
      values.push(query.maxPrice);
      whereParts.push(`pr.price <= $${values.length}`);
    }

    if (query.minPricePerSqft !== undefined) {
      values.push(query.minPricePerSqft);
      whereParts.push(`pr.price_per_sqft >= $${values.length}`);
    }

    if (query.maxPricePerSqft !== undefined) {
      values.push(query.maxPricePerSqft);
      whereParts.push(`pr.price_per_sqft <= $${values.length}`);
    }

    if (query.bhk) {
      const normalizedBhk = query.bhk.trim().toLowerCase();
      if (normalizedBhk === 'studio') {
        whereParts.push(`(pr.property_type = 'Studio' OR pr.bedrooms = 0)`);
      } else if (normalizedBhk.includes('+')) {
        const base = Number(normalizedBhk.replace('+', ''));
        if (Number.isFinite(base)) {
          values.push(base);
          whereParts.push(`pr.bedrooms >= $${values.length}`);
        }
      } else {
        const bhkNumber = Number(normalizedBhk);
        if (Number.isFinite(bhkNumber)) {
          values.push(bhkNumber);
          whereParts.push(`pr.bedrooms = $${values.length}`);
        }
      }
    }

    if (query.type) {
      const types = parseCommaList(query.type)
        .map((value) => value.trim())
        .filter(Boolean);
      if (types.length > 0) {
        values.push(types);
        whereParts.push(`pr.property_type = ANY($${values.length}::TEXT[])`);
      }
    }

    if (query.facing) {
      values.push(query.facing);
      whereParts.push(`pr.facing ILIKE $${values.length}`);
    }

    if (query.corner === 'true') {
      whereParts.push('pr.is_corner = TRUE');
    }

    if (query.vastu === 'true') {
      whereParts.push('pr.is_vaastu = TRUE');
    }

    if (query.negotiable === 'true') {
      whereParts.push('pr.is_negotiable = TRUE');
    }

    if (query.prelaunch === 'true') {
      whereParts.push('pr.is_prelaunch = TRUE');
    }

    if (query.verifiedOnly === 'true') {
      whereParts.push('pr.is_verified = TRUE');
    }

    if (query.minCarpetArea !== undefined) {
      values.push(query.minCarpetArea);
      whereParts.push(`pr.carpet_area >= $${values.length}`);
    }

    if (query.maxCarpetArea !== undefined) {
      values.push(query.maxCarpetArea);
      whereParts.push(`pr.carpet_area <= $${values.length}`);
    }

    if (query.minBuiltupArea !== undefined) {
      values.push(query.minBuiltupArea);
      whereParts.push(`pr.builtup_area >= $${values.length}`);
    }

    if (query.maxBuiltupArea !== undefined) {
      values.push(query.maxBuiltupArea);
      whereParts.push(`pr.builtup_area <= $${values.length}`);
    }

    if (query.minSuperBuiltupArea !== undefined) {
      values.push(query.minSuperBuiltupArea);
      whereParts.push(`pr.super_builtup_area >= $${values.length}`);
    }

    if (query.maxSuperBuiltupArea !== undefined) {
      values.push(query.maxSuperBuiltupArea);
      whereParts.push(`pr.super_builtup_area <= $${values.length}`);
    }

    if (amenityFilters.length > 0) {
      values.push(amenityFilters);
      values.push(amenityFilters.length);
      const amenityListIndex = values.length - 1;
      const amenityCountIndex = values.length;
      havingParts.push(
        `COUNT(DISTINCT CASE WHEN a.slug = ANY($${amenityListIndex}::TEXT[]) THEN a.slug END) = $${amenityCountIndex}`
      );
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, query.limit || 24);
    const offset = (page - 1) * limit;

    let orderBy = 'pr.created_at DESC';
    if (query.sort === 'price_low') {
      orderBy = 'pr.price ASC NULLS LAST';
    } else if (query.sort === 'price_high') {
      orderBy = 'pr.price DESC NULLS LAST';
    } else if (query.sort === 'newest') {
      orderBy = 'pr.created_at DESC';
    } else if (query.sort === 'verified') {
      orderBy = 'pr.is_verified DESC, pr.created_at DESC';
    } else if (query.sort === 'most_viewed') {
      orderBy = 'pr.view_count DESC, pr.created_at DESC';
    } else if (query.sort === 'recommended') {
      orderBy = 'pr.is_featured DESC, pr.is_verified DESC, pr.view_count DESC, pr.created_at DESC';
    }

    values.push(limit);
    values.push(offset);
    const rows = await pool.query(
      `
        SELECT
          pr.*,
          c.name AS company_name,
          c.company_type AS company_type,
          (
            SELECT COUNT(*)::INT
            FROM properties pr_company
            WHERE pr_company.company_id = pr.company_id
          ) AS company_property_count,
          (
            SELECT gd.deal_code
            FROM group_deals gd
            WHERE gd.property_id = pr.id
              AND gd.status IN ('ACTIVE', 'MIN_REACHED', 'CONFIRMED', 'FULL')
              AND gd.valid_until >= NOW()
            ORDER BY gd.created_at DESC, gd.id DESC
            LIMIT 1
          ) AS active_group_deal_code,
          (
            SELECT gd.status
            FROM group_deals gd
            WHERE gd.property_id = pr.id
              AND gd.status IN ('ACTIVE', 'MIN_REACHED', 'CONFIRMED', 'FULL')
              AND gd.valid_until >= NOW()
            ORDER BY gd.created_at DESC, gd.id DESC
            LIMIT 1
          ) AS active_group_deal_status,
          COALESCE(array_remove(array_agg(DISTINCT a.name), NULL), ARRAY[]::TEXT[]) AS amenities,
          COUNT(*) OVER() AS total_count
        FROM properties pr
        JOIN companies c
          ON c.id = pr.company_id
        LEFT JOIN property_amenities pa
          ON pa.property_id = pr.id
        LEFT JOIN amenities a
          ON a.id = pa.amenity_id
        WHERE ${whereParts.join(' AND ')}
        GROUP BY pr.id, c.name, c.company_type
        ${havingParts.length > 0 ? `HAVING ${havingParts.join(' AND ')}` : ''}
        ORDER BY ${orderBy}
        LIMIT $${values.length - 1}
        OFFSET $${values.length}
      `,
      values
    );

    const total = rows.rowCount > 0 ? Number(rows.rows[0].total_count || 0) : 0;

    const payload = {
      properties: rows.rows.map(mapPropertySummary),
      total,
      page,
      pageSize: limit,
    };
    writePropertyListCache(cacheKey, payload);
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
});

router.get('/properties/:propertyId', async (req, res, next) => {
  try {
    const propertyId = Number(req.params.propertyId);
    if (!Number.isFinite(propertyId) || propertyId <= 0) {
      return res.status(400).json({ error: 'Invalid property id' });
    }

    await pool.query(
      `
        UPDATE properties
        SET view_count = COALESCE(view_count, 0) + 1
        WHERE id = $1
      `,
      [propertyId]
    );

    const property = await fetchPropertyDetails(propertyId);
    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    const priceRows = await pool.query(
      `
        SELECT previous_price, next_price, created_at
        FROM property_price_history_market
        WHERE property_id = $1
        ORDER BY created_at DESC
        LIMIT 12
      `,
      [propertyId]
    );

    return res.json({
      property,
      priceHistory: priceRows.rows.map((row) => ({
        previousPrice: row.previous_price === null ? null : Number(row.previous_price),
        nextPrice: Number(row.next_price || 0),
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/properties', requireAuth, async (req, res, next) => {
  try {
    const payload = createPropertySchema.parse(req.body || {});
    const membership = await getCompanyMembership(req.user.id);
    const canManageCompany = await hasPermission(req, 'manage_company');

    if (!canActAsBuilderDealer(membership) && !canManageCompany) {
      return res.status(403).json({ error: 'Only builder/dealer accounts can create properties' });
    }

    const companyId = payload.companyId || membership?.companyId;
    if (!companyId) {
      return res.status(400).json({ error: 'companyId is required' });
    }

    if (!canManageCompany && membership?.companyId !== companyId) {
      return res.status(403).json({ error: 'Property can only be added to your own company' });
    }

    await ensureCompanyShadow(companyId);
    const companyRows = await pool.query('SELECT id FROM companies WHERE id = $1 LIMIT 1', [companyId]);
    if (companyRows.rowCount === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    if (payload.projectId) {
      const projectRows = await pool.query(
        'SELECT id FROM projects WHERE id = $1 AND company_id = $2 LIMIT 1',
        [payload.projectId, companyId]
      );
      if (projectRows.rowCount === 0) {
        return res.status(400).json({ error: 'projectId does not belong to this company' });
      }
    }

    const amenityIds = [...new Set((payload.amenityIds || []).map((id) => Number(id)).filter((id) => id > 0))];
    if (amenityIds.length > 0) {
      const amenityRows = await pool.query(
        'SELECT id FROM amenities WHERE id = ANY($1::BIGINT[])',
        [amenityIds]
      );
      if (amenityRows.rowCount !== amenityIds.length) {
        return res.status(400).json({ error: 'One or more amenity ids are invalid' });
      }
    }

    const inserted = await pool.query(
      `
        INSERT INTO properties (
          company_id,
          project_id,
          title,
          property_type,
          listing_type,
          price,
          price_per_sqft,
          rent_per_month,
          rent_deposit,
          state,
          city,
          area,
          locality,
          address,
          full_address,
          landmark,
          latitude,
          longitude,
          area_sqft,
          carpet_area,
          builtup_area,
          super_builtup_area,
          bedrooms,
          bathrooms,
          floor_number,
          total_floors,
          facing,
          is_corner,
          is_vaastu,
          possession_status,
          rera_number,
          furnishing,
          is_negotiable,
          is_prelaunch,
          is_verified,
          is_featured,
          availability_date,
          image_urls,
          description,
          layout_details,
          posted_by,
          created_by_user_id
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21, $22, $23, $24,
          $25, $26, $27, $28, $29, $30, $31, $32,
          $33, $34, $35, $36::TEXT[], $37, $38::jsonb, $39, $40
        )
        RETURNING id
      `,
      [
        companyId,
        payload.projectId || null,
        payload.title,
        payload.propertyType,
        payload.listingType,
        toNullableNumber(payload.price),
        toNullableNumber(payload.pricePerSqft),
        toNullableNumber(payload.rentPerMonth),
        toNullableNumber(payload.rentDeposit),
        payload.state,
        payload.city,
        payload.area,
        payload.locality || '',
        payload.address || '',
        payload.fullAddress,
        payload.landmark || '',
        toNullableNumber(payload.latitude),
        toNullableNumber(payload.longitude),
        toNullableNumber(payload.areaSqft),
        toNullableNumber(payload.carpetArea),
        toNullableNumber(payload.builtupArea),
        toNullableNumber(payload.superBuiltupArea),
        toNullableInt(payload.bedrooms),
        toNullableInt(payload.bathrooms),
        toNullableInt(payload.floorNumber),
        toNullableInt(payload.totalFloors),
        payload.facing || 'NA',
        Boolean(payload.isCorner),
        Boolean(payload.isVaastu),
        payload.possessionStatus || 'ready',
        payload.reraNumber || '',
        payload.furnishing || 'na',
        Boolean(payload.isNegotiable),
        Boolean(payload.isPrelaunch),
        Boolean(payload.isVerified),
        Boolean(payload.isFeatured),
        payload.availabilityDate || null,
        payload.imageUrls || [],
        payload.description || '',
        JSON.stringify(payload.layoutDetails || { floors: [] }),
        req.user.id,
        req.user.id,
      ]
    );

    const propertyId = Number(inserted.rows[0].id);
    if (amenityIds.length > 0) {
      await pool.query(
        `
          INSERT INTO property_amenities (property_id, amenity_id)
          SELECT $1, UNNEST($2::BIGINT[])
          ON CONFLICT (property_id, amenity_id) DO NOTHING
        `,
        [propertyId, amenityIds]
      );
    }

    const property = await fetchPropertyDetails(propertyId);
    propertyListCache.clear();
    return res.status(201).json({ property });
  } catch (error) {
    return next(error);
  }
});

router.put('/properties/:propertyId', requireAuth, async (req, res, next) => {
  try {
    const propertyId = Number(req.params.propertyId);
    if (!Number.isFinite(propertyId) || propertyId <= 0) {
      return res.status(400).json({ error: 'Invalid property id' });
    }

    const payload = updatePropertySchema.parse(req.body || {});
    if (!payload || Object.keys(payload).length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    const canManageCompany = await hasPermission(req, 'manage_company');
    const ownerRows = await pool.query(
      `
        SELECT created_by_user_id, price
        FROM properties
        WHERE id = $1
        LIMIT 1
      `,
      [propertyId]
    );

    if (ownerRows.rowCount === 0) {
      return res.status(404).json({ error: 'Property not found' });
    }

    const ownerId = ownerRows.rows[0].created_by_user_id;
    if (!canManageCompany && ownerId !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to update this property' });
    }

    const updates = [];
    const values = [];
    const pushUpdate = (column, value) => {
      if (value === undefined) return;
      values.push(value);
      updates.push(`${column} = $${values.length}`);
    };

    pushUpdate('title', payload.title);
    pushUpdate('property_type', payload.propertyType);
    pushUpdate('listing_type', payload.listingType);
    pushUpdate('price', payload.price === undefined ? undefined : toNullableNumber(payload.price));
    pushUpdate('price_per_sqft', payload.pricePerSqft === undefined ? undefined : toNullableNumber(payload.pricePerSqft));
    pushUpdate('rent_per_month', payload.rentPerMonth === undefined ? undefined : toNullableNumber(payload.rentPerMonth));
    pushUpdate('rent_deposit', payload.rentDeposit === undefined ? undefined : toNullableNumber(payload.rentDeposit));
    pushUpdate('state', payload.state);
    pushUpdate('city', payload.city);
    pushUpdate('area', payload.area);
    pushUpdate('locality', payload.locality);
    pushUpdate('address', payload.address);
    pushUpdate('full_address', payload.fullAddress);
    pushUpdate('landmark', payload.landmark);
    pushUpdate('latitude', payload.latitude === undefined ? undefined : toNullableNumber(payload.latitude));
    pushUpdate('longitude', payload.longitude === undefined ? undefined : toNullableNumber(payload.longitude));
    pushUpdate('area_sqft', payload.areaSqft === undefined ? undefined : toNullableNumber(payload.areaSqft));
    pushUpdate('carpet_area', payload.carpetArea === undefined ? undefined : toNullableNumber(payload.carpetArea));
    pushUpdate('builtup_area', payload.builtupArea === undefined ? undefined : toNullableNumber(payload.builtupArea));
    pushUpdate(
      'super_builtup_area',
      payload.superBuiltupArea === undefined ? undefined : toNullableNumber(payload.superBuiltupArea)
    );
    pushUpdate('bedrooms', payload.bedrooms === undefined ? undefined : toNullableInt(payload.bedrooms));
    pushUpdate('bathrooms', payload.bathrooms === undefined ? undefined : toNullableInt(payload.bathrooms));
    pushUpdate('floor_number', payload.floorNumber === undefined ? undefined : toNullableInt(payload.floorNumber));
    pushUpdate('total_floors', payload.totalFloors === undefined ? undefined : toNullableInt(payload.totalFloors));
    pushUpdate('facing', payload.facing);
    pushUpdate('is_corner', payload.isCorner);
    pushUpdate('is_vaastu', payload.isVaastu);
    pushUpdate('possession_status', payload.possessionStatus);
    pushUpdate('rera_number', payload.reraNumber);
    pushUpdate('furnishing', payload.furnishing);
    pushUpdate('is_negotiable', payload.isNegotiable);
    pushUpdate('is_prelaunch', payload.isPrelaunch);
    pushUpdate('is_verified', payload.isVerified);
    pushUpdate('is_featured', payload.isFeatured);
    pushUpdate('availability_date', payload.availabilityDate || null);
    pushUpdate('image_urls', payload.imageUrls);
    pushUpdate('description', payload.description);
    if (payload.layoutDetails !== undefined) {
      pushUpdate('layout_details', JSON.stringify(payload.layoutDetails));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    values.push(propertyId);
    const updateQuery = `
      UPDATE properties
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${values.length}
      RETURNING id, price
    `;
    const updateRows = await pool.query(updateQuery, values);

    if (payload.amenityIds) {
      const amenityIds = [...new Set(payload.amenityIds.map((id) => Number(id)).filter((id) => id > 0))];
      await pool.query('DELETE FROM property_amenities WHERE property_id = $1', [propertyId]);
      if (amenityIds.length > 0) {
        const amenityRows = await pool.query(
          'SELECT id FROM amenities WHERE id = ANY($1::BIGINT[])',
          [amenityIds]
        );
        if (amenityRows.rowCount !== amenityIds.length) {
          return res.status(400).json({ error: 'One or more amenity ids are invalid' });
        }
        await pool.query(
          `
            INSERT INTO property_amenities (property_id, amenity_id)
            SELECT $1, UNNEST($2::BIGINT[])
            ON CONFLICT (property_id, amenity_id) DO NOTHING
          `,
          [propertyId, amenityIds]
        );
      }
    }

    if (payload.price !== undefined) {
      const previousPrice = ownerRows.rows[0].price === null ? null : Number(ownerRows.rows[0].price);
      const nextPrice = payload.price === null ? null : Number(payload.price);
      if (nextPrice !== null && nextPrice !== previousPrice) {
        await pool.query(
          `
            INSERT INTO property_price_history_market (
              property_id,
              changed_by_user_id,
              previous_price,
              next_price,
              reason
            )
            VALUES ($1, $2, $3, $4, $5)
          `,
          [
            propertyId,
            req.user.id,
            previousPrice,
            nextPrice,
            payload.isFeatured ? 'featured_update' : 'price_update',
          ]
        );
      }
    }

    const property = await fetchPropertyDetails(propertyId);
    propertyListCache.clear();
    return res.json({ property });
  } catch (error) {
    return next(error);
  }
});

router.delete('/properties/:propertyId', requireAuth, async (req, res, next) => {
  try {
    const propertyId = Number(req.params.propertyId);
    if (!Number.isFinite(propertyId) || propertyId <= 0) {
      return res.status(400).json({ error: 'Invalid property id' });
    }

    const canManageCompany = await hasPermission(req, 'manage_company');
    const ownerRows = await pool.query(
      `SELECT created_by_user_id FROM properties WHERE id = $1 LIMIT 1`,
      [propertyId]
    );

    if (ownerRows.rowCount === 0) {
      return res.status(404).json({ error: 'Property not found' });
    }

    const ownerId = ownerRows.rows[0].created_by_user_id;
    if (!canManageCompany && ownerId !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to delete this property' });
    }

    await pool.query('DELETE FROM properties WHERE id = $1', [propertyId]);
    propertyListCache.clear();
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.post('/saved/:propertyId', requireAuth, async (req, res, next) => {
  try {
    const propertyId = Number(req.params.propertyId);
    if (!Number.isFinite(propertyId) || propertyId <= 0) {
      return res.status(400).json({ error: 'Invalid property id' });
    }

    await pool.query(
      `
        INSERT INTO saved_properties (user_id, property_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, property_id) DO NOTHING
      `,
      [req.user.id, propertyId]
    );

    return res.status(201).json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.delete('/saved/:propertyId', requireAuth, async (req, res, next) => {
  try {
    const propertyId = Number(req.params.propertyId);
    if (!Number.isFinite(propertyId) || propertyId <= 0) {
      return res.status(400).json({ error: 'Invalid property id' });
    }

    await pool.query(
      `
        DELETE FROM saved_properties
        WHERE user_id = $1 AND property_id = $2
      `,
      [req.user.id, propertyId]
    );

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.get('/saved', requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 24, 1), 60);
    const rows = await pool.query(
      `
        SELECT
          pr.*,
          COALESCE(array_remove(array_agg(DISTINCT a.name), NULL), ARRAY[]::TEXT[]) AS amenities
        FROM saved_properties sp
        JOIN properties pr
          ON pr.id = sp.property_id
        LEFT JOIN property_amenities pa
          ON pa.property_id = pr.id
        LEFT JOIN amenities a
          ON a.id = pa.amenity_id
        WHERE sp.user_id = $1
        GROUP BY pr.id
        ORDER BY sp.created_at DESC
        LIMIT $2
      `,
      [req.user.id, limit]
    );

    return res.json({
      properties: rows.rows.map(mapPropertySummary),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/leads', leadSubmissionLimiter, async (req, res, next) => {
  try {
    const payload = createLeadSchema.parse(req.body || {});
    const userId = req.user?.id || null;

    const exists = await pool.query('SELECT id FROM properties WHERE id = $1 LIMIT 1', [
      payload.propertyId,
    ]);
    if (exists.rowCount === 0) {
      return res.status(404).json({ error: 'Property not found' });
    }

    const rows = await pool.query(
      `
        INSERT INTO leads (
          property_id,
          user_id,
          lead_type,
          requester_name,
          requester_phone,
          requester_email,
          message
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, created_at
      `,
      [
        payload.propertyId,
        userId,
        payload.leadType,
        payload.name,
        payload.phone,
        payload.email || '',
        payload.message,
      ]
    );

    return res.status(201).json({
      ok: true,
      leadId: rows.rows[0]?.id || null,
      createdAt: rows.rows[0]?.created_at || null,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/admin/analytics', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const revenueRows = await pool.query(
      `
        SELECT
          COALESCE(SUM(CASE WHEN c.status = 'paid' THEN c.commission_amount ELSE 0 END), 0) AS commission_revenue,
          COALESCE(SUM(CASE WHEN lp.status = 'active' THEN lp.amount ELSE 0 END), 0) AS promotion_revenue,
          COALESCE(SUM(CASE WHEN c.status = 'pending' THEN c.commission_amount ELSE 0 END), 0) AS commission_pending
        FROM commission c
        FULL OUTER JOIN listing_promotions lp
          ON lp.property_id = c.property_id
      `
    );

    const topAgentsRows = await pool.query(
      `
        SELECT
          u.id,
          u.name,
          COALESCE(SUM(c.commission_amount), 0) AS total_commission,
          COUNT(*)::INT AS deals
        FROM commission c
        JOIN users u
          ON u.id = c.agent_id
        GROUP BY u.id, u.name
        ORDER BY total_commission DESC
        LIMIT 5
      `
    );

    const mostViewedRows = await pool.query(
      `
        SELECT id, title, city, area, view_count
        FROM properties
        ORDER BY view_count DESC, created_at DESC
        LIMIT 6
      `
    );

    const revenueRow = revenueRows.rows[0] || {};
    const totalRevenue =
      Number(revenueRow.commission_revenue || 0) + Number(revenueRow.promotion_revenue || 0);

    return res.json({
      revenue: {
        total: totalRevenue,
        commissionRevenue: Number(revenueRow.commission_revenue || 0),
        promotionRevenue: Number(revenueRow.promotion_revenue || 0),
      },
      commissionPending: Number(revenueRow.commission_pending || 0),
      topAgents: topAgentsRows.rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        totalCommission: Number(row.total_commission || 0),
        deals: Number(row.deals || 0),
      })),
      mostViewedProperties: mostViewedRows.rows.map((row) => ({
        id: Number(row.id),
        title: row.title,
        city: row.city,
        area: row.area,
        viewCount: Number(row.view_count || 0),
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/admin/commission', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const rows = await pool.query(
      `
        SELECT
          c.*,
          p.title AS property_title,
          u.name AS agent_name
        FROM commission c
        JOIN properties p
          ON p.id = c.property_id
        JOIN users u
          ON u.id = c.agent_id
        ORDER BY c.created_at DESC
        LIMIT 120
      `
    );

    return res.json({
      commissions: rows.rows.map((row) => ({
        id: Number(row.id),
        propertyId: Number(row.property_id),
        propertyTitle: row.property_title,
        agentId: Number(row.agent_id),
        agentName: row.agent_name,
        commissionPercent: Number(row.commission_percent || 0),
        commissionAmount: Number(row.commission_amount || 0),
        status: row.status,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.put('/admin/approve/:propertyId', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const propertyId = Number(req.params.propertyId);
    if (!Number.isFinite(propertyId) || propertyId <= 0) {
      return res.status(400).json({ error: 'Invalid property id' });
    }

    const rows = await pool.query(
      `
        UPDATE properties
        SET is_verified = TRUE, updated_at = NOW()
        WHERE id = $1
        RETURNING id, is_verified
      `,
      [propertyId]
    );

    if (rows.rowCount === 0) {
      return res.status(404).json({ error: 'Property not found' });
    }

    propertyListCache.clear();
    return res.json({
      propertyId: Number(rows.rows[0].id),
      isVerified: Boolean(rows.rows[0].is_verified),
  });

router.put('/admin/reject/:propertyId', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const propertyId = Number(req.params.propertyId);
    if (!Number.isFinite(propertyId) || propertyId <= 0) {
      return res.status(400).json({ error: 'Invalid property id' });
    }

    const rows = await pool.query(
      `
        UPDATE properties
        SET is_verified = FALSE,
            is_featured = FALSE,
            updated_at = NOW()
        WHERE id = $1
        RETURNING id, is_verified
      `,
      [propertyId]
    );

    if (rows.rowCount === 0) {
      return res.status(404).json({ error: 'Property not found' });
    }

    propertyListCache.clear();
    return res.json({
      propertyId: Number(rows.rows[0].id),
      isVerified: Boolean(rows.rows[0].is_verified),
  });

router.put('/admin/promote-owner/:userId', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const rows = await pool.query(
      `
        UPDATE users
        SET role = 'owner'
        WHERE id = $1
        RETURNING id, name, email, role
      `,
      [userId]
    );

    if (rows.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userRow = rows.rows[0];
    const ownerName = userRow.name || 'Owner';
    const ownerEmail = userRow.email || '';
    const companyCode = `owner-${userId}`;

    const companyRows = await pool.query(
      `
        INSERT INTO companies (code, name, company_type, email, created_by_user_id)
        VALUES ($1, $2, 'owner', $3, $4)
        ON CONFLICT (code)
        DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, updated_at = NOW()
        RETURNING id
      `,
      [companyCode, `${ownerName} Properties`, ownerEmail, userId]
    );

    const companyId = Number(companyRows.rows[0].id);
    await pool.query(
      `
        INSERT INTO owner_profiles (user_id, company_id, display_name, subscription_plan)
        VALUES ($1, $2, $3, 'free')
        ON CONFLICT (user_id)
        DO UPDATE SET company_id = EXCLUDED.company_id, display_name = EXCLUDED.display_name, updated_at = NOW()
      `,
      [userId, companyId, ownerName]
    );

    return res.json({ user: rows.rows[0] });
  } catch (error) {
    return next(error);
  }
});
  } catch (error) {
    return next(error);
  }
});
  } catch (error) {
    return next(error);
  }
});

export default router;
