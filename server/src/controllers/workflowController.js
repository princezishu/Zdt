
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { pool } from '../db.js';
import {
  authenticateAccessToken,
  checkSubscriptionFeature,
  requireAuth,
  requireMainAdmin,
  requireOwnership,
  requirePermission,
} from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import {
  consumeVerifiedPhoneOtp,
  createOtpCode,
  createVerificationToken,
  hashOtp,
} from '../services/phoneVerification.js';
import { sendOtp } from '../services/otpDelivery.js';
import {
  ADMIN_PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  getPasswordPolicyError,
  passwordMinLengthForAccount,
} from '../utils/passwordPolicy.js';

const router = Router();

const HELP_TYPES = ['Just call and guide me', 'Team should add my property for me'];
const CALL_TIMES = ['Morning', 'Afternoon', 'Evening'];
const PHONE_OTP_EXPIRES_MINUTES = 10;
const PHONE_OTP_RESEND_SECONDS = 45;
const MAX_PHONE_OTP_ATTEMPTS = 5;
const SECURITY_QUESTIONS = [
  'What is your place of birth?',
  'What is your birth year?',
  "What is your best friend's name?",
  'Who is your favorite person close to your heart?',
];

const requestBodySchema = z.object({
  requesterName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(32),
  phoneVerificationId: z.string().trim().min(24).max(120),
  email: z.string().trim().email().max(190).optional().or(z.literal('')),
  city: z.string().trim().min(2).max(120),
  locality: z.string().trim().max(160).optional().or(z.literal('')),
  propertyType: z.enum(['Plot', 'Villa', 'Flat / Apartment', 'Commercial']),
  address: z.string().trim().max(500).optional().or(z.literal('')),
  mapPin: z.string().trim().max(240).optional().or(z.literal('')),
  pricing: z.record(z.string(), z.any()).optional().default({}),
  details: z.record(z.string(), z.any()).optional().default({}),
  help: z
    .object({
      needHelp: z.boolean().default(false),
      preferredCallTime: z.enum(['Morning', 'Afternoon', 'Evening']).optional(),
      helpType: z.enum(['Just call and guide me', 'Team should add my property for me']).optional(),
    })
    .optional(),
  draft: z.boolean().optional().default(false),
});

const publicPhoneOtpRequestSchema = z.object({
  phone: z.string().trim().min(8).max(32),
  purpose: z
    .enum(['buy', 'sell', 'rent', 'schedule_visit', 'fraud_report', 'workflow'])
    .optional()
    .default('workflow'),
});

const publicPhoneOtpVerifySchema = z.object({
  phone: z.string().trim().min(8).max(32),
  verificationToken: z.string().trim().min(24).max(120),
  otp: z.string().trim().regex(/^\d{6}$/),
});

const scheduleVisitSchema = z.object({
  propertyReference: z.string().trim().min(4).max(40),
  propertyTitle: z.string().trim().min(3).max(200),
  requesterName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(32),
  phoneVerificationId: z.string().trim().min(24).max(120),
  city: z.string().trim().min(2).max(120),
  preferredDate: z.string().trim().min(8).max(32),
  preferredTime: z.string().trim().min(2).max(60),
  note: z.string().trim().max(1200).optional().or(z.literal('')),
});

const fraudReportSchema = z.object({
  propertyReference: z.string().trim().min(4).max(40),
  reporterName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(32),
  phoneVerificationId: z.string().trim().min(24).max(120),
  reason: z.string().trim().min(10).max(1500),
});

const publicListingsQuerySchema = z.object({
  requestType: z.enum(['all', 'sell', 'rent']).default('sell'),
  city: z.string().trim().max(120).default(''),
  locality: z.string().trim().max(160).default(''),
  propertyType: z
    .enum(['all', 'Plot', 'Villa', 'Flat / Apartment', 'Commercial'])
    .default('all'),
  limit: z.coerce.number().int().min(1).max(60).default(24),
});

const sponsoredListingsQuerySchema = z.object({
  placement: z.enum(['portal_home', 'public_results']).default('public_results'),
  requestType: z.enum(['all', 'sell', 'rent']).default('all'),
  city: z.string().trim().max(120).default(''),
  locality: z.string().trim().max(160).default(''),
  propertyType: z
    .enum(['all', 'Plot', 'Villa', 'Flat / Apartment', 'Commercial'])
    .default('all'),
  limit: z.coerce.number().int().min(1).max(24).default(6),
});

const listingInteractionSchema = z.object({
  action: z.enum(['click', 'save', 'unsave', 'like', 'unlike', 'unlock_phone', 'call_click']),
  context: z.string().trim().max(80).optional().or(z.literal('')),
});

const listingAssistSchema = z.object({
  assistType: z.enum(['brochure', 'price_sheet', 'loan_help']),
  context: z.string().trim().max(80).optional().or(z.literal('')),
  note: z.string().trim().max(800).optional().or(z.literal('')),
});

const listingInteractionActionKey = {
  click: 'property_listing_clicked',
  save: 'property_listing_saved',
  unsave: 'property_listing_unsaved',
  like: 'property_listing_liked',
  unlike: 'property_listing_unliked',
  unlock_phone: 'property_phone_unlocked',
  call_click: 'property_phone_called',
};
const FEATURE_USAGE_WINDOW_DAYS = 30;
const FEATURE_USAGE_ACTION_CATALOG = [
  { key: 'property_listing_viewed', label: 'Property Details Viewed' },
  { key: 'property_listing_clicked', label: 'Property Contact Clicks' },
  { key: 'property_listing_saved', label: 'Save Listing' },
  { key: 'property_listing_liked', label: 'Like Listing' },
  { key: 'schedule_visit_requested', label: 'Schedule Visit Requests' },
  { key: 'fraud_report_submitted', label: 'Fraud Reports' },
  { key: 'property_request_submitted', label: 'Post Property Submissions' },
  { key: 'phone_otp_requested', label: 'Phone OTP Requests' },
  { key: 'phone_otp_verified', label: 'Phone OTP Verifications' },
  { key: 'buy_map_view_opened', label: 'Buy Map Opened' },
  { key: 'rent_map_view_opened', label: 'Rent Map Opened' },
  { key: 'buy_filters_applied', label: 'Buy Filters Applied' },
  { key: 'rent_filters_applied', label: 'Rent Filters Applied' },
  { key: 'compare_page_opened', label: 'Compare Page Opened' },
  { key: 'compare_listing_added', label: 'Compare Listing Added' },
  { key: 'compare_listing_removed', label: 'Compare Listing Removed' },
  { key: 'compare_cleared', label: 'Compare Cleared' },
  { key: 'notifications_page_opened', label: 'Notifications Page Opened' },
  { key: 'notification_marked_read', label: 'Notification Marked Read' },
  { key: 'notifications_mark_all_read', label: 'Notifications Mark All Read' },
  { key: 'notifications_cleared', label: 'Notifications Cleared' },
  { key: 'saved_searches_page_opened', label: 'Saved Searches Page Opened' },
  { key: 'saved_search_applied', label: 'Saved Search Applied' },
  { key: 'saved_search_deleted', label: 'Saved Search Deleted' },
  { key: 'saved_searches_cleared', label: 'Saved Searches Cleared' },
];
const FEATURE_USAGE_ACTION_KEYS = FEATURE_USAGE_ACTION_CATALOG.map((item) => item.key);
const featureUsageTrackSchema = z.object({
  featureKey: z.enum(FEATURE_USAGE_ACTION_KEYS),
  context: z.string().trim().max(80).optional().or(z.literal('')),
  view: z.string().trim().max(80).optional().or(z.literal('')),
  detail: z.string().trim().max(240).optional().or(z.literal('')),
});

const teamQueueQuerySchema = z.object({
  type: z.enum(['all', 'buy', 'sell', 'rent', 'assisted']).default('all'),
  interactionStatus: z
    .enum(['all', 'New', 'Contacted', 'Scheduled', 'Completed'])
    .default('all'),
  listingStatus: z
    .enum(['all', 'Pending', 'Approved', 'Rejected', 'Sold', 'Rented'])
    .default('all'),
});

const teamUpdateSchema = z
  .object({
    interactionStatus: z.enum(['New', 'Contacted', 'Scheduled', 'Completed']).optional(),
    internalNote: z.string().trim().max(2000).optional(),
    detailsPatch: z.record(z.string(), z.any()).optional(),
    assignToSelf: z.boolean().optional(),
  })
  .refine(
    (payload) =>
      Boolean(payload.interactionStatus) ||
      Boolean(payload.internalNote) ||
      Boolean(payload.detailsPatch) ||
      Boolean(payload.assignToSelf),
    { message: 'At least one update field is required' }
  );

const adminListingUpdateSchema = z.object({
  listingStatus: z.enum(['Approved', 'Rejected', 'Sold', 'Rented']),
  note: z.string().trim().max(2000).optional().or(z.literal('')),
});

const adminFakeListingSchema = z.object({
  remove: z.boolean().optional().default(true),
  isFake: z.boolean().optional().default(true),
  note: z.string().trim().max(1000).optional().or(z.literal('')),
});

const adminFeaturedSchema = z.object({
  isFeatured: z.boolean(),
  note: z.string().trim().max(1000).optional().or(z.literal('')),
});

const listingBoostSchema = z.object({
  boostType: z.enum(['city_top', 'category_top', 'homepage_feature', 'urgent_tag']).default('urgent_tag'),
});

const adminAssignTeamSchema = z
  .object({
    teamMemberId: z.coerce.number().int().positive(),
    assignmentType: z
      .enum(['call_user', 'add_property', 'handle_query'])
      .optional()
      .default('call_user'),
    assignmentQuery: z.string().trim().max(2000).optional().or(z.literal('')),
    note: z.string().trim().max(1000).optional().or(z.literal('')),
  })
  .superRefine((payload, ctx) => {
    if (payload.assignmentType === 'handle_query' && !payload.assignmentQuery?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assignmentQuery'],
        message: 'Assignment query is required when task type is handle_query.',
      });
    }
  });

const teamMemberStatusSchema = z.object({
  isActive: z.boolean(),
});

const platformUserStatusSchema = z.object({
  isActive: z.boolean(),
});

const promoteTeamMemberSchema = z.object({
  note: z.string().trim().max(2000).optional().or(z.literal('')),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().trim().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH).optional(),
});

const emergencyControlSchema = z.object({
  disableAdmins: z.boolean().optional().default(false),
  disableTeam: z.boolean().optional().default(false),
  revokeAllSessions: z.boolean().optional().default(true),
});

const careerApplySchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(32),
  email: z.string().trim().email().max(190),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  city: z.string().trim().min(2).max(120),
  position: z
    .enum(['Admin', 'Team Member', 'admin', 'team_member'])
    .transform((value) => (value.toLowerCase() === 'admin' ? 'admin' : 'team_member')),
  securityQuestionOne: z.enum(SECURITY_QUESTIONS),
  securityAnswerOne: z.string().trim().min(2).max(200),
  securityQuestionTwo: z.enum(SECURITY_QUESTIONS),
  securityAnswerTwo: z.string().trim().min(2).max(200),
  aadhaarNumber: z.string().trim().max(24).optional().or(z.literal('')),
  panNumber: z.string().trim().max(24).optional().or(z.literal('')),
  teamSpecialization: z.string().trim().max(120).optional().or(z.literal('')),
  teamPreferredShift: z.string().trim().max(40).optional().or(z.literal('')),
  experience: z.string().trim().max(2000).optional().or(z.literal('')),
  whyHireYou: z.string().trim().min(10).max(3000),
}).superRefine((payload, ctx) => {
  const passwordMinLength =
    payload.position === 'admin' ? ADMIN_PASSWORD_MIN_LENGTH : PASSWORD_MIN_LENGTH;
  const passwordPolicyError = getPasswordPolicyError(payload.password, {
    minLength: passwordMinLength,
  });
  if (passwordPolicyError) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['password'],
      message: passwordPolicyError,
    });
  }

  if (payload.securityQuestionOne === payload.securityQuestionTwo) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['securityQuestionTwo'],
      message: 'Security Question 2 must be different from Security Question 1.',
    });
  }

  if (payload.position === 'admin') {
    const aadhaar = normalizeAadhaar(payload.aadhaarNumber || '');
    if (!aadhaar) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['aadhaarNumber'],
        message: 'Valid Aadhaar number is required for admin applications.',
      });
    }

    const pan = normalizePan(payload.panNumber || '');
    if (!pan) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['panNumber'],
        message: 'Valid PAN number is required for admin applications.',
      });
    }

    return;
  }

  if (!payload.teamSpecialization?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['teamSpecialization'],
      message: 'Team specialization is required for team member applications.',
    });
  }

  if (!payload.teamPreferredShift?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['teamPreferredShift'],
      message: 'Preferred shift is required for team member applications.',
    });
  }
});

const careerReviewSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().trim().max(2000).optional().or(z.literal('')),
});

function normalizePhone(phone) {
  const cleaned = phone.trim().replace(/[\s()-]/g, '');
  if (!/^\+?\d{8,15}$/.test(cleaned)) {
    return null;
  }
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}

function normalizeIpAddress(rawValue) {
  if (!rawValue) return '';
  return String(rawValue).split(',')[0].trim().slice(0, 64);
}

const NUMERIC_ID_PATTERN = /^\d+$/;
const UUID_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isSafeIdentifier(value) {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value);
}

function parseRouteEntityId(rawValue) {
  const value = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue || '').trim();
  if (!value) {
    return null;
  }

  if (NUMERIC_ID_PATTERN.test(value)) {
    const numericId = Number(value);
    if (!Number.isSafeInteger(numericId) || numericId <= 0) {
      return null;
    }
    return {
      kind: 'numeric',
      value: numericId,
      token: value,
    };
  }

  if (UUID_ID_PATTERN.test(value)) {
    return {
      kind: 'uuid',
      value: value.toLowerCase(),
      token: value.toLowerCase(),
    };
  }

  return null;
}

function buildDualIdFilter(
  parsedId,
  {
    idColumn = 'id',
    uuidColumn = 'uuid_id',
    parameterIndex = 1,
  } = {}
) {
  if (!parsedId || !isSafeIdentifier(idColumn) || (uuidColumn && !isSafeIdentifier(uuidColumn))) {
    return null;
  }

  if (parsedId.kind === 'numeric') {
    return {
      clause: `${idColumn} = $${parameterIndex}`,
      values: [parsedId.value],
    };
  }

  if (!uuidColumn) {
    return null;
  }

  return {
    clause: `${uuidColumn} = $${parameterIndex}::uuid`,
    values: [parsedId.value],
  };
}

const TERMINAL_LIFECYCLE_STATUSES = new Set(['archived', 'sold', 'rented']);
const lifecycleTransitionMap = {
  draft: new Set(['pending_review', 'archived']),
  pending_review: new Set(['needs_changes', 'approved', 'flagged', 'suspended', 'archived']),
  needs_changes: new Set(['pending_review', 'suspended', 'archived']),
  approved: new Set(['sold', 'rented', 'flagged', 'suspended', 'archived']),
  flagged: new Set(['pending_review', 'approved', 'suspended', 'archived']),
  suspended: new Set(['pending_review', 'archived']),
  archived: new Set([]),
  sold: new Set([]),
  rented: new Set([]),
};

const listingStatusToLifecycle = {
  Approved: 'approved',
  Rejected: 'needs_changes',
  Sold: 'sold',
  Rented: 'rented',
};

function normalizeLifecycleStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return lifecycleTransitionMap[normalized] ? normalized : 'pending_review';
}

function isLifecycleTransitionAllowed(fromStatus, toStatus) {
  const from = normalizeLifecycleStatus(fromStatus);
  const to = normalizeLifecycleStatus(toStatus);
  if (from === to) {
    return true;
  }
  const allowedTargets = lifecycleTransitionMap[from];
  return Boolean(allowedTargets && allowedTargets.has(to));
}

const listingInteractionLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 180,
  message: 'Too many interaction requests. Please try again shortly.',
  keyGenerator: (req) => {
    const ip = normalizeIpAddress(req.ip || req.socket?.remoteAddress);
    const userKey = req.user?.id ? `u:${req.user.id}` : `ip:${ip}`;
    const referenceId = String(req.params?.referenceId || '').trim().slice(0, 40) || '-';
    return `workflow:interaction:${userKey}:${referenceId}`;
  },
});

const listingAssistLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 36,
  message: 'Too many assist requests. Please try again shortly.',
  keyGenerator: (req) => {
    const ip = normalizeIpAddress(req.ip || req.socket?.remoteAddress);
    const userKey = req.user?.id ? `u:${req.user.id}` : `ip:${ip}`;
    const referenceId = String(req.params?.referenceId || '').trim().slice(0, 40) || '-';
    return `workflow:assist:${userKey}:${referenceId}`;
  },
});

const featureUsageLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 320,
  message: 'Too many feature usage tracking requests. Please try again shortly.',
  keyGenerator: (req) => {
    const ip = normalizeIpAddress(req.ip || req.socket?.remoteAddress);
    const userKey = req.user?.id ? `u:${req.user.id}` : `ip:${ip}`;
    const featureKey =
      req.body && typeof req.body === 'object' && typeof req.body.featureKey === 'string'
        ? req.body.featureKey.trim().slice(0, 80) || '-'
        : '-';
    return `workflow:feature-usage:${userKey}:${featureKey}`;
  },
});

const workflowSubmissionLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 40,
  message: 'Too many listing submissions. Please wait before trying again.',
  keyGenerator: (req) => {
    const ip = normalizeIpAddress(req.ip || req.socket?.remoteAddress);
    const requestType = String(req.path || '').toLowerCase().slice(0, 20);
    return `workflow:submit:${ip}:${requestType}`;
  },
});

const phoneOtpRequestLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: 'Too many OTP requests. Please wait and try again.',
  keyGenerator: (req) => {
    const ip = normalizeIpAddress(req.ip || req.socket?.remoteAddress);
    const phone =
      req.body && typeof req.body === 'object' && typeof req.body.phone === 'string'
        ? normalizePhone(req.body.phone) || req.body.phone.trim()
        : '';
    return `workflow:otp:request:${ip}:${phone || '-'}`;
  },
});

const phoneOtpVerifyLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 35,
  message: 'Too many OTP verification attempts. Please request a new OTP later.',
  keyGenerator: (req) => {
    const ip = normalizeIpAddress(req.ip || req.socket?.remoteAddress);
    const phone =
      req.body && typeof req.body === 'object' && typeof req.body.phone === 'string'
        ? normalizePhone(req.body.phone) || req.body.phone.trim()
        : '';
    return `workflow:otp:verify:${ip}:${phone || '-'}`;
  },
});

const scheduleVisitLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 25,
  message: 'Too many visit requests. Please try again later.',
  keyGenerator: (req) => {
    const ip = normalizeIpAddress(req.ip || req.socket?.remoteAddress);
    const phone =
      req.body && typeof req.body === 'object' && typeof req.body.phone === 'string'
        ? normalizePhone(req.body.phone) || req.body.phone.trim()
        : '';
    return `workflow:schedule:${ip}:${phone || '-'}`;
  },
});

const fraudReportLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: 'Too many fraud reports from this source. Please try again later.',
  keyGenerator: (req) => {
    const ip = normalizeIpAddress(req.ip || req.socket?.remoteAddress);
    const phone =
      req.body && typeof req.body === 'object' && typeof req.body.phone === 'string'
        ? normalizePhone(req.body.phone) || req.body.phone.trim()
        : '';
    return `workflow:fraud:${ip}:${phone || '-'}`;
  },
});

function normalizeAadhaar(value) {
  const cleaned = value.replace(/\D/g, '');
  return /^\d{12}$/.test(cleaned) ? cleaned : null;
}

function normalizePan(value) {
  const cleaned = value.trim().toUpperCase();
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(cleaned) ? cleaned : null;
}

function toNumberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value;
}

function cleanValueText(value) {
  const text = typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
  if (!text || text === 'NA' || text === 'Any') {
    return '';
  }
  return text;
}

function formatPriceLabel(amount, requestType) {
  if (!amount || amount <= 0) {
    return requestType === 'rent' ? 'Price on request / month' : 'Price on request';
  }

  if (requestType === 'rent') {
    return `Rs ${Math.round(amount).toLocaleString('en-IN')}/month`;
  }

  if (amount >= 10000000) {
    return `Rs ${(amount / 10000000).toFixed(2)} Cr`;
  }

  if (amount >= 100000) {
    return `Rs ${(amount / 100000).toFixed(2)} L`;
  }

  return `Rs ${Math.round(amount).toLocaleString('en-IN')}`;
}

function formatAreaLabel(value) {
  const text = cleanValueText(value);
  if (!text) {
    return 'Area on request';
  }
  if (/\b(sq|ft|acre|sqm|yard|yd|meter)\b/i.test(text)) {
    return text;
  }
  if (/^\d+(\.\d+)?$/.test(text)) {
    return `${text} sq.ft`;
  }
  return text;
}

function maskPhoneForPublic(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 4) {
    return 'Hidden';
  }
  const country = digits.length > 10 ? `+${digits.slice(0, digits.length - 10)} ` : '';
  const local = digits.slice(-10);
  return `${country}${local.slice(0, 2)}XXXXXX${local.slice(-2)}`;
}

function pickListingImage(propertyType) {
  if (propertyType === 'Villa') {
    return '/images/property-2.jpg';
  }
  if (propertyType === 'Plot') {
    return '/images/property-3.jpg';
  }
  if (propertyType === 'Commercial') {
    return '/images/property-4.jpg';
  }
  return '/images/property-1.jpg';
}

function getPublicListingArea(details) {
  const detailObject = toObject(details);
  return (
    detailObject.plotArea ||
    detailObject.carpetArea ||
    detailObject.builtUpArea ||
    detailObject.area ||
    detailObject.landArea ||
    ''
  );
}

function getPublicListingFacing(details) {
  const detailObject = toObject(details);
  const vastu = toObject(detailObject.vastu);
  return (
    cleanValueText(vastu.mainDoorDirection) ||
    cleanValueText(detailObject.facing) ||
    cleanValueText(detailObject.plotFacing) ||
    'NA'
  );
}

function getPublicListingBhk(propertyType, details) {
  if (propertyType === 'Plot') {
    return 'N/A';
  }
  if (propertyType === 'Commercial') {
    return cleanValueText(toObject(details).type) || 'Commercial';
  }
  return cleanValueText(toObject(details).bhk) || 'N/A';
}

function serializePublicListing(row) {
  const pricing = toObject(row.pricing);
  const details = toObject(row.details);
  const rawPrice = row.request_type === 'rent' ? pricing.monthlyRent : pricing.expectedPrice;
  const priceAmount = toNumberOrNull(rawPrice) || 0;
  const vastu = toObject(details.vastu);
  const vastuScore = toNumberOrNull(vastu.scorePreview) || 0;
  const areaValue = getPublicListingArea(details);
  const locality = cleanValueText(row.locality) || 'Prime Locality';
  const title = `${row.property_type} in ${locality}, ${row.city}`;

  return {
    id: row.reference_id,
    referenceId: row.reference_id,
    requestType: row.request_type,
    title,
    image: pickListingImage(row.property_type),
    city: row.city,
    area: locality,
    priceLakh: priceAmount > 0 ? Number((priceAmount / 100000).toFixed(2)) : 0,
    priceLabel: formatPriceLabel(priceAmount, row.request_type),
    areaLabel: formatAreaLabel(areaValue),
    propertyType: row.property_type,
    bhk: getPublicListingBhk(row.property_type, details),
    mainDoorFacing: getPublicListingFacing(details),
    vastuScore: Math.max(0, Math.min(100, Math.round(vastuScore))),
    verified: true,
    ownerPhone: maskPhoneForPublic(row.requester_phone),
    isFeatured: Boolean(row.is_featured),
    rankingScore: Number(row.ranking_score || 0),
    updatedAt: row.updated_at,
  };
}

const LISTING_ASSIST_CONFIG = {
  brochure: {
    routeOwner: 'owner',
    actionKey: 'listing_brochure_requested',
    subjectLabel: 'Brochure Request',
    seedMessage: (listing) =>
      `Hi, I would like the brochure, floor plan, and latest details for ${listing.reference_id}.`,
  },
  price_sheet: {
    routeOwner: 'owner',
    actionKey: 'listing_price_sheet_requested',
    subjectLabel: 'Price Sheet Request',
    seedMessage: (listing) =>
      `Hi, please share the latest price sheet, offers, and availability for ${listing.reference_id}.`,
  },
  loan_help: {
    routeOwner: 'team_support',
    actionKey: 'listing_loan_help_requested',
    subjectLabel: 'Loan Help Request',
    seedMessage: (listing) =>
      `Hi, I need loan and EMI guidance for ${listing.reference_id}. Please help me with the next steps.`,
  },
};

function buildChatPropertyTitle(row) {
  if (!row?.property_type && !row?.property_city && !row?.property_locality) {
    return null;
  }
  const area = row.property_locality || row.property_city || 'Prime Locality';
  const city = row.property_city || '';
  const type = row.property_type || 'Property';
  return `${type} in ${area}${city ? `, ${city}` : ''}`;
}

function serializeAssistConversation(row) {
  return {
    id: Number(row.id),
    type: row.conversation_type,
    status: row.status,
    subject: row.subject || '',
    propertyReference: row.property_reference || null,
    propertyTitle: buildChatPropertyTitle(row),
    ownerName: row.owner_name || null,
    requesterUserId: row.requester_user_id === null ? null : Number(row.requester_user_id),
    requesterName: row.requester_name || 'User',
    ownerUserId: row.owner_user_id === null ? null : Number(row.owner_user_id),
    lastMessagePreview: row.last_message_preview || '',
    lastMessageAt: row.last_message_at,
    metadata: toObject(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadAssistConversation(client, conversationId) {
  const rows = await client.query(
    `
      SELECT
        c.id,
        c.conversation_type,
        c.status,
        c.subject,
        c.requester_user_id,
        c.owner_user_id,
        c.owner_name,
        c.last_message_preview,
        c.last_message_at,
        c.metadata,
        c.created_at,
        c.updated_at,
        pr.reference_id AS property_reference,
        pr.property_type AS property_type,
        pr.city AS property_city,
        pr.locality AS property_locality,
        COALESCE(requester.name, 'User') AS requester_name
      FROM chat_conversations c
      LEFT JOIN property_requests pr
        ON pr.id = c.property_request_id
      LEFT JOIN users requester
        ON requester.id = c.requester_user_id
      WHERE c.id = $1
      LIMIT 1
    `,
    [conversationId]
  );

  return rows.rowCount > 0 ? serializeAssistConversation(rows.rows[0]) : null;
}

async function seedAssistConversationMessage(
  client,
  {
    conversationId,
    senderUserId,
    senderRole,
    senderName,
    body,
  }
) {
  const insertedRows = await client.query(
    `
      INSERT INTO chat_messages (
        conversation_id,
        sender_user_id,
        sender_role,
        sender_name,
        body
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, created_at, body
    `,
    [conversationId, senderUserId, senderRole, senderName, body]
  );

  const insertedMessage = insertedRows.rows[0] || null;
  if (!insertedMessage) {
    return null;
  }

  await client.query(
    `
      UPDATE chat_conversations
      SET
        status = 'Open',
        last_message_preview = LEFT($2, 240),
        last_message_at = $3,
        updated_at = NOW()
      WHERE id = $1
    `,
    [conversationId, insertedMessage.body, insertedMessage.created_at]
  );

  return insertedMessage;
}

function buildSponsoredListing(row) {
  const baseListing = serializePublicListing(row);
  return {
    id: Number(row.id),
    sponsorshipId: Number(row.id),
    propertyRequestId: Number(row.property_request_id),
    billingOrderId: row.billing_order_id === null ? null : Number(row.billing_order_id),
    placement: row.placement,
    status: row.status,
    badgeText: row.badge_text || 'Sponsored',
    ctaLabel: row.cta_label || 'Open Listing',
    title: (row.title_override || '').trim() || baseListing.title,
    subtitle:
      (row.subtitle_override || '').trim()
      || `${baseListing.propertyType} in ${baseListing.area}`,
    description:
      (row.description_override || '').trim()
      || `${baseListing.priceLabel} | ${baseListing.areaLabel} | ${baseListing.bhk}`,
    image: (row.image_url || '').trim() || baseListing.image,
    referenceId: baseListing.referenceId,
    requestType: baseListing.requestType,
    city: baseListing.city,
    locality: baseListing.area,
    propertyType: baseListing.propertyType,
    priceLabel: baseListing.priceLabel,
    areaLabel: baseListing.areaLabel,
    rankingScore: baseListing.rankingScore,
    listing: baseListing,
    startsAt: row.start_at,
    endsAt: row.end_at,
    sortPriority: Number(row.sort_priority || 0),
  };
}

function hashSecurityAnswer(value) {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

function maskAadhaar(value) {
  if (!value || value.length < 4) return null;
  return `********${value.slice(-4)}`;
}

function maskPan(value) {
  if (!value || value.length !== 10) return null;
  return `${value.slice(0, 5)}****${value.slice(-1)}`;
}

function generateReferenceId(prefix) {
  const now = new Date();
  const y = now.getFullYear();
  const m = `${now.getMonth() + 1}`.padStart(2, '0');
  const d = `${now.getDate()}`.padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${y}${m}${d}-${rand}`;
}

function randomChar(source) {
  return source[Math.floor(Math.random() * source.length)];
}

function createRegistrationNumberCandidate() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const numbers = '0123456789';
  const now = new Date();
  const y = `${now.getFullYear()}`.slice(-2);
  const m = `${now.getMonth() + 1}`.padStart(2, '0');
  const d = `${now.getDate()}`.padStart(2, '0');
  const suffix = `${randomChar(letters)}${randomChar(numbers)}${randomChar(letters)}${randomChar(numbers)}${randomChar(letters)}${randomChar(numbers)}`;
  return `ZDT${y}${m}${d}-${suffix}`;
}

async function generateUniqueRegistrationNumber() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = createRegistrationNumberCandidate();
    const existsRows = await pool.query(
      'SELECT 1 FROM career_applications WHERE registration_number = $1 LIMIT 1',
      [candidate]
    );

    if (existsRows.rowCount === 0) {
      return candidate;
    }
  }

  throw new Error('Unable to generate unique registration number');
}

function buildInternalNote(existingNotes, userName, noteText) {
  const stamp = new Date().toISOString();
  const line = `[${stamp}] ${userName}: ${noteText}`;
  if (!existingNotes) {
    return line;
  }
  return `${existingNotes}\n${line}`;
}

function resolveWorkflowStage(requestType, draft) {
  if (requestType === 'buy') {
    return 'Pending Approval';
  }
  return draft ? 'Draft' : 'Pending Approval';
}

function resolveWorkflowStageFromListingStatus(listingStatus) {
  if (listingStatus === 'Rejected') {
    return 'Rejected';
  }
  if (listingStatus === 'Approved' || listingStatus === 'Sold' || listingStatus === 'Rented') {
    return 'Approved';
  }
  return 'Pending Approval';
}

function callTimeFromPreferredTime(preferredTime) {
  const text = preferredTime.toLowerCase();
  if (text.includes('am') || text.includes('morning') || text.includes('09:') || text.includes('10:') || text.includes('11:')) {
    return 'Morning';
  }
  if (text.includes('pm') || text.includes('12:') || text.includes('13:') || text.includes('14:') || text.includes('15:')) {
    return 'Afternoon';
  }
  return 'Evening';
}

async function verifyAndConsumePhoneVerification({
  normalizedPhone,
  phoneVerificationId,
}) {
  return consumeVerifiedPhoneOtp(pool, {
    normalizedPhone,
    phoneVerificationId,
  });
}

async function findDuplicateListing({
  requestType,
  normalizedPhone,
  city,
  locality,
  propertyType,
  address,
}) {
  if (requestType !== 'sell' && requestType !== 'rent') {
    return null;
  }

  const duplicateRows = await pool.query(
    `
      SELECT id, reference_id, created_at
      FROM property_requests
      WHERE request_type = $1
        AND is_removed = FALSE
        AND requester_phone = $2
        AND LOWER(city) = LOWER($3)
        AND LOWER(locality) = LOWER($4)
        AND LOWER(property_type) = LOWER($5)
        AND COALESCE(NULLIF(LOWER(address), ''), '__EMPTY__') = COALESCE(NULLIF(LOWER($6), ''), '__EMPTY__')
        AND created_at >= NOW() - INTERVAL '30 days'
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [requestType, normalizedPhone, city, locality || '', propertyType, address || '']
  );

  if (duplicateRows.rowCount === 0) {
    return null;
  }

  return duplicateRows.rows[0];
}

async function writePropertyHistory({
  propertyRequestId,
  changedByUserId,
  fieldName,
  previousValue,
  nextValue,
  note,
}) {
  await pool.query(
    `
      INSERT INTO property_request_status_history (
        property_request_id,
        changed_by_user_id,
        field_name,
        previous_value,
        next_value,
        note
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      propertyRequestId,
      changedByUserId ?? null,
      fieldName,
      previousValue ?? null,
      nextValue ?? null,
      note ?? null,
    ]
  );
}

async function writeActivityLog({
  actorUserId,
  actorRole,
  actionKey,
  entityType,
  entityId,
  requestReference,
  metadata,
  ipAddress = '',
}) {
  const computedIpAddress = normalizeIpAddress(
    ipAddress ||
      (metadata && typeof metadata === 'object' ? metadata.ipAddress || metadata.ip : '') ||
      ''
  );

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
      actorUserId ?? null,
      actorRole ?? '',
      actionKey,
      entityType,
      entityId ?? null,
      requestReference ?? null,
      computedIpAddress,
      JSON.stringify(metadata || {}),
    ]
  );
}

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractListingPrice(pricing) {
  const source = toObject(pricing);
  const salePrice = toFiniteNumber(source.expectedPrice);
  const rentPrice = toFiniteNumber(source.monthlyRent);
  if (salePrice !== null) return salePrice;
  if (rentPrice !== null) return rentPrice;
  return null;
}

function normalizeRiskSignals(rawValue) {
  const source = toObject(rawValue);
  return {
    duplicate_image_hits: Math.max(0, Number(source.duplicate_image_hits || 0)),
    edit_count: Math.max(0, Number(source.edit_count || 0)),
    ip_mismatch_hits: Math.max(0, Number(source.ip_mismatch_hits || 0)),
    fraud_report_count: Math.max(0, Number(source.fraud_report_count || 0)),
  };
}

function computeRiskScore(signals) {
  const weighted =
    signals.duplicate_image_hits * 30 +
    signals.edit_count * 4 +
    signals.ip_mismatch_hits * 18 +
    signals.fraud_report_count * 25;
  return Math.max(0, Math.min(100, Math.round(weighted)));
}

async function incrementListingRiskSignal({
  propertyRequestId,
  signalKey,
  delta = 1,
  note = '',
}) {
  const allowedSignals = new Set([
    'duplicate_image_hits',
    'edit_count',
    'ip_mismatch_hits',
    'fraud_report_count',
  ]);
  if (!allowedSignals.has(signalKey)) {
    return;
  }

  const currentRows = await pool.query(
    `
      SELECT risk_signals, moderation_notes
      FROM property_requests
      WHERE id = $1
      LIMIT 1
    `,
    [propertyRequestId]
  );

  if (currentRows.rowCount === 0) {
    return;
  }

  const currentSignals = normalizeRiskSignals(currentRows.rows[0].risk_signals);
  currentSignals[signalKey] = Math.max(0, currentSignals[signalKey] + Number(delta || 0));
  const nextRiskScore = computeRiskScore(currentSignals);
  const moderationNotes = currentRows.rows[0].moderation_notes || '';
  const noteLine = note ? `[risk] ${new Date().toISOString()} ${note}` : '';

  await pool.query(
    `
      UPDATE property_requests
      SET risk_signals = $1::jsonb,
          risk_score = $2,
          moderation_notes = CASE
            WHEN $3 = '' THEN moderation_notes
            WHEN COALESCE(moderation_notes, '') = '' THEN $3
            ELSE moderation_notes || E'\n' || $3
          END
      WHERE id = $4
    `,
    [JSON.stringify(currentSignals), nextRiskScore, noteLine, propertyRequestId]
  );

  // Keep legacy moderation notes concise by capping on writes.
  if (moderationNotes.length > 15000) {
    await pool.query(
      `
        UPDATE property_requests
        SET moderation_notes = RIGHT(moderation_notes, 12000)
        WHERE id = $1
      `,
      [propertyRequestId]
    );
  }
}

async function recordListingAnalyticsEvent({
  propertyRequestId,
  actorUserId = null,
  eventType,
  eventValue = null,
  metadata = {},
}) {
  await pool.query(
    `
      INSERT INTO listing_analytics_events (
        property_request_id,
        actor_user_id,
        event_type,
        event_value,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5::jsonb)
    `,
    [
      propertyRequestId,
      actorUserId,
      eventType,
      eventValue,
      JSON.stringify(metadata || {}),
    ]
  );
}

async function recordListingPriceHistoryIfChanged({
  propertyRequestId,
  changedByUserId = null,
  previousPricing,
  nextPricing,
  reason = '',
}) {
  const previousPrice = extractListingPrice(previousPricing);
  const nextPrice = extractListingPrice(nextPricing);

  if (previousPrice === null || nextPrice === null || previousPrice === nextPrice) {
    return false;
  }

  await pool.query(
    `
      INSERT INTO property_price_history (
        property_request_id,
        changed_by_user_id,
        previous_price,
        next_price,
        reason
      )
      VALUES ($1, $2, $3, $4, $5)
    `,
    [propertyRequestId, changedByUserId, previousPrice, nextPrice, reason.slice(0, 160)]
  );

  await recordListingAnalyticsEvent({
    propertyRequestId,
    actorUserId: changedByUserId,
    eventType: 'price_change',
    eventValue: nextPrice,
    metadata: {
      previousPrice,
      nextPrice,
      reason: reason.slice(0, 160),
    },
  });

  return true;
}

async function resolveOptionalUserId(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  try {
    const authState = await authenticateAccessToken(token, {
      updateSessionLastSeen: false,
    });
    return Number(authState.user.id);
  } catch {
    return null;
  }
}

function serializePropertyRequest(row) {
  return {
    id: row.id,
    referenceId: row.reference_id,
    requestType: row.request_type,
    source: row.source,
    requesterName: row.requester_name,
    requesterPhone: row.requester_phone,
    requesterEmail: row.requester_email,
    city: row.city,
    locality: row.locality,
    propertyType: row.property_type,
    address: row.address,
    mapPin: row.map_pin,
    pricing: row.pricing,
    details: row.details,
    needHelp: row.need_help,
    helpType: row.help_type,
    preferredCallTime: row.preferred_call_time,
    assistedListing: row.assisted_listing,
    interactionStatus: row.interaction_status,
    listingStatus: row.listing_status,
    lifecycleStatus: row.lifecycle_status,
    workflowStage: row.workflow_stage,
    moderationNotes: row.moderation_notes || '',
    riskScore: Number(row.risk_score || 0),
    riskSignals: toObject(row.risk_signals),
    isFeatured: row.is_featured,
    internalNotes: row.internal_notes,
    assignedToUserId: row.assigned_to_user_id,
    assignedTaskType: row.assigned_task_type,
    assignedTaskQuery: row.assigned_task_query,
    assignedByAdminId: row.assigned_by_admin_id,
    assignedAt: row.assigned_at,
    createdByTeamMemberId: row.created_by_team_member_id,
    isFake: row.is_fake,
    isRemoved: row.is_removed,
    submissionIp: row.submission_ip || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializePublicRequest(row) {
  return {
    id: row.id,
    referenceId: row.reference_id,
    requestType: row.request_type,
    requesterName: row.requester_name,
    requesterPhone: row.requester_phone,
    city: row.city,
    locality: row.locality,
    propertyType: row.property_type,
    pricing: row.pricing,
    details: row.details,
    needHelp: row.need_help,
    helpType: row.help_type,
    preferredCallTime: row.preferred_call_time,
    assistedListing: row.assisted_listing,
    interactionStatus: row.interaction_status,
    listingStatus: row.listing_status,
    lifecycleStatus: row.lifecycle_status || 'pending_review',
    workflowStage: row.workflow_stage,
    isFeatured: row.is_featured,
    createdAt: row.created_at,
  };
}

router.get('/public/listings', async (req, res, next) => {
  try {
    const parsedQuery = publicListingsQuerySchema.parse({
      requestType: req.query.requestType ?? 'sell',
      city: req.query.city ?? '',
      locality: req.query.locality ?? '',
      propertyType: req.query.propertyType ?? 'all',
      limit: req.query.limit ?? 24,
    });

    const whereParts = [
      'is_removed = FALSE',
      'is_fake = FALSE',
      "listing_status = 'Approved'",
    ];
    const values = [];

    if (parsedQuery.requestType !== 'all') {
      values.push(parsedQuery.requestType);
      whereParts.push(`request_type = $${values.length}`);
    } else {
      whereParts.push("request_type IN ('sell', 'rent')");
    }

    if (parsedQuery.city) {
      values.push(`%${parsedQuery.city}%`);
      whereParts.push(`city ILIKE $${values.length}`);
    }

    if (parsedQuery.locality) {
      values.push(`%${parsedQuery.locality}%`);
      whereParts.push(`locality ILIKE $${values.length}`);
    }

    if (parsedQuery.propertyType !== 'all') {
      values.push(parsedQuery.propertyType);
      whereParts.push(`property_type = $${values.length}`);
    }

    values.push(parsedQuery.limit);

    const listingRows = await pool.query(
      `
        SELECT
          id,
          reference_id,
          request_type,
          requester_phone,
          city,
          locality,
          property_type,
          pricing,
          details,
          is_featured,
          ranking_score,
          updated_at
        FROM property_requests
        WHERE ${whereParts.join(' AND ')}
        ORDER BY ranking_score DESC, updated_at DESC, id DESC
        LIMIT $${values.length}
      `,
      values
    );

    return res.json({
      listings: listingRows.rows.map(serializePublicListing),
      total: listingRows.rowCount,
      filters: parsedQuery,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/public/sponsored-listings', async (req, res, next) => {
  try {
    const parsedQuery = sponsoredListingsQuerySchema.parse({
      placement: req.query.placement ?? 'public_results',
      requestType: req.query.requestType ?? 'all',
      city: req.query.city ?? '',
      locality: req.query.locality ?? '',
      propertyType: req.query.propertyType ?? 'all',
      limit: req.query.limit ?? 6,
    });

    const whereParts = [
      's.status = \'active\'',
      'pr.is_removed = FALSE',
      'pr.is_fake = FALSE',
      "pr.listing_status = 'Approved'",
      '(s.start_at IS NULL OR s.start_at <= NOW())',
      '(s.end_at IS NULL OR s.end_at >= NOW())',
    ];
    const values = [];

    values.push(parsedQuery.placement);
    whereParts.push(`s.placement = $${values.length}`);

    if (parsedQuery.requestType !== 'all') {
      values.push(parsedQuery.requestType);
      whereParts.push(`pr.request_type = $${values.length}`);
      whereParts.push(
        `(COALESCE(NULLIF(LOWER(s.target_request_type), ''), 'all') = 'all' OR LOWER(s.target_request_type) = LOWER($${values.length}))`
      );
    } else {
      whereParts.push("pr.request_type IN ('sell', 'rent')");
    }

    if (parsedQuery.city) {
      values.push(`%${parsedQuery.city}%`);
      whereParts.push(`pr.city ILIKE $${values.length}`);
      whereParts.push(`(COALESCE(NULLIF(s.target_city, ''), '') = '' OR s.target_city ILIKE $${values.length})`);
    }

    if (parsedQuery.locality) {
      values.push(`%${parsedQuery.locality}%`);
      whereParts.push(`pr.locality ILIKE $${values.length}`);
      whereParts.push(
        `(COALESCE(NULLIF(s.target_locality, ''), '') = '' OR s.target_locality ILIKE $${values.length})`
      );
    }

    if (parsedQuery.propertyType !== 'all') {
      values.push(parsedQuery.propertyType);
      whereParts.push(`pr.property_type = $${values.length}`);
      whereParts.push(
        `(COALESCE(NULLIF(s.target_property_type, ''), 'all') = 'all' OR s.target_property_type = $${values.length})`
      );
    }

    values.push(parsedQuery.limit);

    const rows = await pool.query(
      `
        SELECT
          s.*,
          pr.reference_id,
          pr.request_type,
          pr.requester_phone,
          pr.city,
          pr.locality,
          pr.property_type,
          pr.pricing,
          pr.details,
          pr.is_featured,
          pr.ranking_score,
          pr.updated_at
        FROM listing_sponsorships s
        JOIN property_requests pr
          ON pr.id = s.property_request_id
        WHERE ${whereParts.join(' AND ')}
        ORDER BY s.sort_priority ASC, COALESCE(s.start_at, s.created_at) DESC, s.id DESC
        LIMIT $${values.length}
      `,
      values
    );

    return res.json({
      listings: rows.rows.map(buildSponsoredListing),
      total: rows.rowCount,
      placement: parsedQuery.placement,
      filters: parsedQuery,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/public/listings/:referenceId', async (req, res, next) => {
  try {
    const params = z
      .object({ referenceId: z.string().trim().min(4).max(80) })
      .parse(req.params);

    const listingRows = await pool.query(
      `
        SELECT
          id,
          reference_id,
          request_type,
          requester_phone,
          city,
          locality,
          property_type,
          pricing,
          details,
          is_featured,
          ranking_score,
          updated_at
        FROM property_requests
        WHERE reference_id = $1
          AND is_removed = FALSE
          AND is_fake = FALSE
          AND listing_status = 'Approved'
        LIMIT 1
      `,
      [params.referenceId]
    );

    if (listingRows.rowCount === 0) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    const listing = listingRows.rows[0];
    const userId = await resolveOptionalUserId(req);
    try {
      await writeActivityLog({
        actorUserId: userId,
        actorRole: userId ? 'user' : 'public',
        actionKey: 'property_listing_viewed',
        entityType: 'property_request',
        entityId: listing.id,
        requestReference: listing.reference_id,
        metadata: {
          source: 'public_listing_detail',
          ipAddress: normalizeIpAddress(req.ip || req.socket?.remoteAddress),
        },
      });
      await recordListingAnalyticsEvent({
        propertyRequestId: listing.id,
        actorUserId: userId,
        eventType: 'view',
        metadata: {
          source: 'public_listing_detail',
        },
      });
    } catch {
      // Do not fail listing response for analytics issues.
    }

    return res.json({
      listing: serializePublicListing(listing),
    });
  } catch (error) {
    return next(error);
  }
});

router.post(
  '/public/listings/:referenceId/assist',
  requireAuth,
  listingAssistLimiter,
  async (req, res, next) => {
    try {
      const params = z
        .object({ referenceId: z.string().trim().min(4).max(80) })
        .parse(req.params);
      const payload = listingAssistSchema.parse(req.body || {});

      const listingRows = await pool.query(
        `
          SELECT
            id,
            reference_id,
            request_type,
            requester_name,
            city,
            locality,
            property_type,
            pricing,
            details,
            submitted_by_user_id,
            is_removed,
            is_fake,
            listing_status
          FROM property_requests
          WHERE reference_id = $1
            AND is_removed = FALSE
            AND is_fake = FALSE
            AND listing_status = 'Approved'
          LIMIT 1
        `,
        [params.referenceId]
      );

      if (listingRows.rowCount === 0) {
        return res.status(404).json({ error: 'Listing not found' });
      }

      const listing = listingRows.rows[0];
      const assistConfig = LISTING_ASSIST_CONFIG[payload.assistType];
      let routeOwner = assistConfig.routeOwner;
      const ownerUserId = listing.submitted_by_user_id === null ? null : Number(listing.submitted_by_user_id);

      if (routeOwner === 'owner' && (!ownerUserId || ownerUserId <= 0)) {
        routeOwner = 'team_support';
      }

      if (routeOwner === 'owner' && ownerUserId === Number(req.user.id)) {
        return res.status(409).json({ error: 'You already manage this listing.' });
      }

      const subject =
        routeOwner === 'owner'
          ? `Owner Chat - ${listing.reference_id}`
          : `${assistConfig.subjectLabel} - ${listing.reference_id}`;
      const conversationKey =
        routeOwner === 'owner'
          ? `owner:${req.user.id}:${listing.id}`
          : `team:assist:${req.user.id}:${listing.id}`;
      const note = payload.note?.trim() || '';
      const sourceContext = payload.context?.trim() || 'listing_detail';
      const seedMessage = `${assistConfig.seedMessage(listing)}${note ? `\n\nAdditional note: ${note}` : ''}`;

      const client = await pool.connect();
      let assistRequestRow = null;
      let conversationId = null;
      let createdRequest = false;

      try {
        await client.query('BEGIN');

        const conversationRows =
          routeOwner === 'owner'
            ? await client.query(
                `
                  INSERT INTO chat_conversations (
                    conversation_key,
                    conversation_type,
                    status,
                    subject,
                    created_by_user_id,
                    requester_user_id,
                    owner_user_id,
                    owner_name,
                    property_request_id
                  )
                  VALUES ($1, 'property_owner', 'Open', $2, $3, $3, $4, $5, $6)
                  ON CONFLICT (conversation_key)
                  DO UPDATE
                    SET status = 'Open',
                        updated_at = NOW(),
                        owner_user_id = EXCLUDED.owner_user_id,
                        owner_name = EXCLUDED.owner_name,
                        property_request_id = EXCLUDED.property_request_id
                  RETURNING id
                `,
                [
                  conversationKey,
                  subject,
                  req.user.id,
                  ownerUserId,
                  listing.requester_name || 'Property Owner',
                  listing.id,
                ]
              )
            : await client.query(
                `
                  INSERT INTO chat_conversations (
                    conversation_key,
                    conversation_type,
                    status,
                    subject,
                    created_by_user_id,
                    requester_user_id,
                    property_request_id
                  )
                  VALUES ($1, 'team_support', 'Open', $2, $3, $3, $4)
                  ON CONFLICT (conversation_key)
                  DO UPDATE
                    SET status = 'Open',
                        updated_at = NOW(),
                        property_request_id = EXCLUDED.property_request_id,
                        subject = CASE
                          WHEN chat_conversations.subject = '' THEN EXCLUDED.subject
                          ELSE chat_conversations.subject
                        END
                  RETURNING id
                `,
                [conversationKey, subject, req.user.id, listing.id]
              );

        conversationId = Number(conversationRows.rows[0]?.id || 0) || null;
        if (!conversationId) {
          await client.query('ROLLBACK');
          return res.status(500).json({ error: 'Unable to open assist conversation.' });
        }

        const existingAssistRows = await client.query(
          `
            SELECT *
            FROM listing_assist_requests
            WHERE property_request_id = $1
              AND requester_user_id = $2
              AND assist_type = $3
              AND status IN ('open', 'in_progress')
            ORDER BY last_requested_at DESC, id DESC
            LIMIT 1
            FOR UPDATE
          `,
          [listing.id, req.user.id, payload.assistType]
        );

        if (existingAssistRows.rowCount > 0) {
          const existingAssist = existingAssistRows.rows[0];
          const updatedRows = await client.query(
            `
              UPDATE listing_assist_requests
              SET
                chat_conversation_id = COALESCE(chat_conversation_id, $2),
                route_owner = $3,
                source_context = CASE
                  WHEN $4 = '' THEN source_context
                  ELSE $4
                END,
                notes = CASE
                  WHEN $5 = '' THEN notes
                  ELSE $5
                END,
                last_requested_at = NOW(),
                updated_at = NOW()
              WHERE id = $1
              RETURNING *
            `,
            [existingAssist.id, conversationId, routeOwner, sourceContext, note]
          );
          assistRequestRow = updatedRows.rows[0] || existingAssist;
        } else {
          const insertedAssistRows = await client.query(
            `
              INSERT INTO listing_assist_requests (
                property_request_id,
                requester_user_id,
                chat_conversation_id,
                assist_type,
                route_owner,
                status,
                source_context,
                notes
              )
              VALUES ($1, $2, $3, $4, $5, 'open', $6, $7)
              RETURNING *
            `,
            [listing.id, req.user.id, conversationId, payload.assistType, routeOwner, sourceContext, note]
          );
          assistRequestRow = insertedAssistRows.rows[0] || null;
          createdRequest = Boolean(assistRequestRow);
        }

        if (createdRequest) {
          await seedAssistConversationMessage(client, {
            conversationId,
            senderUserId: req.user.id,
            senderRole: req.user.role || 'user',
            senderName: req.user.name || 'User',
            body: seedMessage,
          });
        }

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      const conversation = conversationId ? await loadAssistConversation(pool, conversationId) : null;

      await Promise.allSettled([
        writeActivityLog({
          actorUserId: req.user.id,
          actorRole: req.user.role || 'user',
          actionKey: assistConfig.actionKey,
          entityType: 'property_request',
          entityId: listing.id,
          requestReference: listing.reference_id,
          metadata: {
            assistType: payload.assistType,
            routeOwner,
            source: sourceContext,
            conversationId,
            assistRequestId: assistRequestRow?.id || null,
            requestType: listing.request_type,
            ipAddress: normalizeIpAddress(req.ip || req.socket?.remoteAddress),
          },
        }),
        recordListingAnalyticsEvent({
          propertyRequestId: Number(listing.id),
          actorUserId: Number(req.user.id),
          eventType: 'premium_cta',
          metadata: {
            assistType: payload.assistType,
            routeOwner,
            source: sourceContext,
            conversationId,
            assistRequestId: assistRequestRow?.id || null,
          },
        }),
      ]);

      return res.status(createdRequest ? 201 : 200).json({
        ok: true,
        request: assistRequestRow
          ? {
              id: Number(assistRequestRow.id),
              assistType: assistRequestRow.assist_type,
              routeOwner: assistRequestRow.route_owner,
              status: assistRequestRow.status,
              sourceContext: assistRequestRow.source_context || '',
              notes: assistRequestRow.notes || '',
              lastRequestedAt: assistRequestRow.last_requested_at,
              createdAt: assistRequestRow.created_at,
              updatedAt: assistRequestRow.updated_at,
              reused: !createdRequest,
            }
          : null,
        conversation,
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.post('/public/listings/:referenceId/interaction', listingInteractionLimiter, async (req, res, next) => {
  try {
    const params = z
      .object({ referenceId: z.string().trim().min(4).max(80) })
      .parse(req.params);
    const payload = listingInteractionSchema.parse(req.body);

    const listingRows = await pool.query(
      `
        SELECT id, reference_id
        FROM property_requests
        WHERE reference_id = $1
          AND is_removed = FALSE
          AND is_fake = FALSE
          AND listing_status = 'Approved'
        LIMIT 1
      `,
      [params.referenceId]
    );

    if (listingRows.rowCount === 0) {
      return res.json({ ok: true, tracked: false });
    }

    const listing = listingRows.rows[0];
    const userId = await resolveOptionalUserId(req);
    const actionKey = listingInteractionActionKey[payload.action];
    await writeActivityLog({
      actorUserId: userId,
      actorRole: userId ? 'user' : 'public',
      actionKey,
      entityType: 'property_request',
      entityId: listing.id,
      requestReference: listing.reference_id,
      metadata: {
        source: payload.context || 'public_listing',
        action: payload.action,
        ipAddress: normalizeIpAddress(req.ip || req.socket?.remoteAddress),
      },
    });

    const analyticsEventType =
      payload.action === 'unlock_phone'
        ? 'phone_unlock'
        : payload.action === 'call_click'
          ? 'call_click'
          : payload.action === 'click'
            ? 'contact_click'
            : payload.action === 'save' || payload.action === 'like'
              ? 'save'
              : null;

    if (analyticsEventType) {
      await recordListingAnalyticsEvent({
        propertyRequestId: listing.id,
        actorUserId: userId,
        eventType: analyticsEventType,
        metadata: {
          action: payload.action,
          source: payload.context || 'public_listing',
        },
      });
    }

    return res.json({ ok: true, tracked: true });
  } catch (error) {
    return next(error);
  }
});

router.post('/public/feature-usage', featureUsageLimiter, async (req, res, next) => {
  try {
    const payload = featureUsageTrackSchema.parse(req.body);
    const userId = await resolveOptionalUserId(req);

    await writeActivityLog({
      actorUserId: userId,
      actorRole: userId ? 'user' : 'public',
      actionKey: payload.featureKey,
      entityType: 'feature',
      entityId: null,
      requestReference: null,
      metadata: {
        source: payload.context || payload.view || 'feature_usage',
        context: payload.context || '',
        view: payload.view || '',
        detail: payload.detail || '',
        ipAddress: normalizeIpAddress(req.ip || req.socket?.remoteAddress),
      },
    });

    return res.json({ ok: true, tracked: true });
  } catch (error) {
    return next(error);
  }
});

router.post('/public/phone-otp/request', phoneOtpRequestLimiter, async (req, res, next) => {
  try {
    const payload = publicPhoneOtpRequestSchema.parse(req.body);
    const normalizedPhone = normalizePhone(payload.phone);
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    const recentRows = await pool.query(
      `
        SELECT created_at
        FROM phone_verification_otps
        WHERE phone = $1
          AND purpose = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [normalizedPhone, payload.purpose]
    );

    if (recentRows.rowCount > 0) {
      const lastCreatedAt = new Date(recentRows.rows[0].created_at);
      const waitMs = PHONE_OTP_RESEND_SECONDS * 1000 - (Date.now() - lastCreatedAt.getTime());
      if (waitMs > 0) {
        return res.status(429).json({
          error: `Please wait ${Math.ceil(waitMs / 1000)} seconds before requesting another OTP.`,
        });
      }
    }

    const otp = createOtpCode();
    const verificationToken = createVerificationToken();

    await pool.query(
      `
        INSERT INTO phone_verification_otps (
          phone,
          verification_token,
          otp_hash,
          purpose,
          expires_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          NOW() + ($5::text || ' minutes')::interval
        )
      `,
      [normalizedPhone, verificationToken, hashOtp(otp), payload.purpose, PHONE_OTP_EXPIRES_MINUTES]
    );

    await writeActivityLog({
      actorUserId: null,
      actorRole: 'public',
      actionKey: 'phone_otp_requested',
      entityType: 'phone_verification',
      entityId: null,
      requestReference: null,
      metadata: {
        phone: normalizedPhone,
        purpose: payload.purpose,
      },
    });

    const emailForOtp = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    let delivered = false;
    try {
      if (emailForOtp) {
        delivered = await sendOtp({
          channel: 'email',
          email: emailForOtp,
          otp,
          expiresInMinutes: PHONE_OTP_EXPIRES_MINUTES,
        });
      } else {
        delivered = await sendOtp({
          channel: 'sms',
          phone: normalizedPhone,
          otp,
          expiresInMinutes: PHONE_OTP_EXPIRES_MINUTES,
        });
      }
    } catch (deliveryError) {
      await pool.query('DELETE FROM phone_verification_otps WHERE verification_token = $1', [
        verificationToken,
      ]);
      return res.status(503).json({
        error:
          deliveryError instanceof Error
            ? deliveryError.message
            : 'OTP delivery failed. Please try again.',
      });
    }

    const responsePayload = {
      message: delivered
        ? 'OTP sent successfully'
        : 'SMS delivery is not configured in this environment. Use the dev OTP for testing.',
      verificationToken,
      expiresInMinutes: PHONE_OTP_EXPIRES_MINUTES,
    };

    if (process.env.NODE_ENV !== 'production') {
      responsePayload.devOtp = otp;
    }

    return res.status(201).json(responsePayload);
  } catch (error) {
    return next(error);
  }
});

router.post('/public/phone-otp/verify', phoneOtpVerifyLimiter, async (req, res, next) => {
  try {
    const payload = publicPhoneOtpVerifySchema.parse(req.body);
    const normalizedPhone = normalizePhone(payload.phone);
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    const otpRows = await pool.query(
      `
        SELECT id, otp_hash, attempts, expires_at, verified_at, verification_id, consumed_at
        FROM phone_verification_otps
        WHERE phone = $1
          AND verification_token = $2
        LIMIT 1
      `,
      [normalizedPhone, payload.verificationToken]
    );

    if (otpRows.rowCount === 0) {
      return res.status(404).json({ error: 'OTP request not found. Request OTP again.' });
    }

    const otpRow = otpRows.rows[0];

    if (otpRow.consumed_at) {
      return res.status(409).json({ error: 'This OTP session is already used. Request a new OTP.' });
    }

    const expiresAt = new Date(otpRow.expires_at);
    if (expiresAt.getTime() <= Date.now()) {
      return res.status(410).json({ error: 'OTP expired. Request a new OTP.' });
    }

    if (otpRow.verified_at && otpRow.verification_id) {
      return res.json({
        message: 'Phone already verified',
        verificationId: otpRow.verification_id,
      });
    }

    if (Number(otpRow.attempts) >= MAX_PHONE_OTP_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many invalid OTP attempts. Request a new OTP.' });
    }

    const providedHash = hashOtp(payload.otp);
    const storedBuffer = Buffer.from(otpRow.otp_hash, 'hex');
    const providedBuffer = Buffer.from(providedHash, 'hex');
    const otpValid =
      storedBuffer.length === providedBuffer.length &&
      crypto.timingSafeEqual(storedBuffer, providedBuffer);

    if (!otpValid) {
      await pool.query(
        'UPDATE phone_verification_otps SET attempts = attempts + 1 WHERE id = $1',
        [otpRow.id]
      );
      return res.status(400).json({ error: 'Invalid OTP code' });
    }

    const verificationId = createVerificationToken();
    await pool.query(
      `
        UPDATE phone_verification_otps
        SET verified_at = NOW(),
            verification_id = $1
        WHERE id = $2
      `,
      [verificationId, otpRow.id]
    );

    await writeActivityLog({
      actorUserId: null,
      actorRole: 'public',
      actionKey: 'phone_otp_verified',
      entityType: 'phone_verification',
      entityId: Number(otpRow.id),
      requestReference: null,
      metadata: {
        phone: normalizedPhone,
      },
    });

    return res.json({
      message: 'Phone verified successfully',
      verificationId,
    });
  } catch (error) {
    return next(error);
  }
});

function createPropertySubmissionHandler(requestType, prefix) {
  return async (req, res, next) => {
    try {
      const payload = requestBodySchema.parse(req.body);
      const normalizedPhone = normalizePhone(payload.phone);
      if (!normalizedPhone) {
        return res.status(400).json({ error: 'Invalid phone number format' });
      }

      const verificationResult = await verifyAndConsumePhoneVerification({
        normalizedPhone,
        phoneVerificationId: payload.phoneVerificationId,
      });
      if (!verificationResult.ok) {
        return res.status(400).json({
          error: verificationResult.reason,
        });
      }

      const help = payload.help?.needHelp
        ? {
            needHelp: true,
            helpType: payload.help.helpType || HELP_TYPES[0],
            preferredCallTime: payload.help.preferredCallTime || CALL_TIMES[0],
          }
        : {
            needHelp: false,
            helpType: null,
            preferredCallTime: null,
          };

      const assistedListing =
        help.needHelp && help.helpType === 'Team should add my property for me';
      const userId = await resolveOptionalUserId(req);
      const workflowStage = resolveWorkflowStage(requestType, payload.draft);
      const initialLifecycleStatus =
        payload.draft && requestType !== 'buy' ? 'draft' : 'pending_review';
      const submissionIp = normalizeIpAddress(req.ip || req.socket?.remoteAddress);

      const duplicate = await findDuplicateListing({
        requestType,
        normalizedPhone,
        city: payload.city,
        locality: payload.locality || '',
        propertyType: payload.propertyType,
        address: payload.address || '',
      });

      if (duplicate) {
        return res.status(409).json({
          error: `Duplicate listing detected. Existing reference: ${duplicate.reference_id}`,
        });
      }

      const created = await pool.query(
        `
          INSERT INTO property_requests (
            reference_id,
            request_type,
            source,
            submitted_by_user_id,
            requester_name,
            requester_phone,
            requester_email,
            submission_ip,
            city,
            locality,
            property_type,
            address,
            map_pin,
            pricing,
            details,
            need_help,
            help_type,
            preferred_call_time,
            assisted_listing,
            interaction_status,
            listing_status,
            lifecycle_status,
            workflow_stage
          )
          VALUES (
            $1,
            $2,
            'public',
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13,
            $14,
            $15,
            $16,
            $17,
            $18,
            'New',
            'Pending',
            $19,
            $20
          )
          RETURNING *
        `,
        [
          generateReferenceId(prefix),
          requestType,
          userId,
          payload.requesterName,
          normalizedPhone,
          payload.email ? payload.email.toLowerCase() : null,
          submissionIp,
          payload.city,
          payload.locality || '',
          payload.propertyType,
          payload.address || '',
          payload.mapPin || '',
          payload.pricing,
          payload.details,
          help.needHelp,
          help.helpType,
          help.preferredCallTime,
          assistedListing,
          initialLifecycleStatus,
          workflowStage,
        ]
      );

      const row = created.rows[0];
      await writePropertyHistory({
        propertyRequestId: row.id,
        changedByUserId: userId,
        fieldName: 'interaction_status',
        previousValue: null,
        nextValue: 'New',
        note: 'Public request submitted',
      });
      await writePropertyHistory({
        propertyRequestId: row.id,
        changedByUserId: userId,
        fieldName: 'listing_status',
        previousValue: null,
        nextValue: 'Pending',
        note: 'Waiting for internal review',
      });
      await writePropertyHistory({
        propertyRequestId: row.id,
        changedByUserId: userId,
        fieldName: 'workflow_stage',
        previousValue: null,
        nextValue: workflowStage,
        note:
          workflowStage === 'Draft'
            ? 'Listing saved as draft'
            : 'Workflow initialized as pending approval',
      });
      await writeActivityLog({
        actorUserId: userId,
        actorRole: userId ? 'user' : 'public',
        actionKey: 'property_request_submitted',
        entityType: 'property_request',
        entityId: row.id,
        requestReference: row.reference_id,
        metadata: {
          requestType,
          assistedListing,
          city: row.city,
          propertyType: row.property_type,
          workflowStage,
          draft: payload.draft,
          ipAddress: submissionIp,
        },
      });

      const detailObject = toObject(payload.details);
      const imageList = Array.isArray(detailObject.images)
        ? detailObject.images
            .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
            .filter(Boolean)
            .slice(0, 20)
        : [];

      if (imageList.length > 0) {
        const duplicateImageRows = await pool.query(
          `
            SELECT COUNT(*)::INT AS duplicate_count
            FROM property_requests
            WHERE id <> $1
              AND request_type IN ('sell', 'rent')
              AND COALESCE(details->'images', '[]'::jsonb) ?| $2::text[]
          `,
          [row.id, imageList]
        );

        const duplicateImageCount = Number(duplicateImageRows.rows[0]?.duplicate_count || 0);
        if (duplicateImageCount > 0) {
          await incrementListingRiskSignal({
            propertyRequestId: row.id,
            signalKey: 'duplicate_image_hits',
            delta: Math.min(3, duplicateImageCount),
            note: `Duplicate image overlap detected on submission (matches: ${duplicateImageCount}).`,
          });
        }
      }

      const ipMismatchRows = await pool.query(
        `
          SELECT COUNT(*)::INT AS mismatch_count
          FROM property_requests
          WHERE id <> $1
            AND requester_phone = $2
            AND created_at >= NOW() - INTERVAL '60 days'
            AND submission_ip <> ''
            AND submission_ip <> $3
            AND request_type IN ('sell', 'rent')
        `,
        [row.id, normalizedPhone, submissionIp]
      );

      const ipMismatchCount = Number(ipMismatchRows.rows[0]?.mismatch_count || 0);
      if (ipMismatchCount > 0) {
        await incrementListingRiskSignal({
          propertyRequestId: row.id,
          signalKey: 'ip_mismatch_hits',
          delta: Math.min(3, ipMismatchCount),
          note: `IP mismatch pattern detected for this phone number (matches: ${ipMismatchCount}).`,
        });
      }

      return res.status(201).json({
        message: 'Request submitted successfully',
        referenceId: row.reference_id,
        request: serializePublicRequest(row),
      });
    } catch (error) {
      return next(error);
    }
  };
}

router.post('/public/buy', workflowSubmissionLimiter, createPropertySubmissionHandler('buy', 'BUY'));
router.post('/public/sell', workflowSubmissionLimiter, createPropertySubmissionHandler('sell', 'SEL'));
router.post('/public/rent', workflowSubmissionLimiter, createPropertySubmissionHandler('rent', 'REN'));

router.post('/public/schedule-visit', scheduleVisitLimiter, async (req, res, next) => {
  try {
    const payload = scheduleVisitSchema.parse(req.body);
    const normalizedPhone = normalizePhone(payload.phone);
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    const verificationResult = await verifyAndConsumePhoneVerification({
      normalizedPhone,
      phoneVerificationId: payload.phoneVerificationId,
    });
    if (!verificationResult.ok) {
      return res.status(400).json({ error: verificationResult.reason });
    }

    const propertyRows = await pool.query(
      `
        SELECT id, reference_id, city, locality, property_type
        FROM property_requests
        WHERE reference_id = $1
          AND is_removed = FALSE
        LIMIT 1
      `,
      [payload.propertyReference]
    );

    const property = propertyRows.rowCount > 0 ? propertyRows.rows[0] : null;
    const userId = await resolveOptionalUserId(req);
    const referenceId = generateReferenceId('VIS');

    const resolvedCity = payload.city || property?.city || 'Bangalore';
    const resolvedLocality = property?.locality || '';
    const resolvedPropertyType = property?.property_type || 'Flat / Apartment';

    const createdRows = await pool.query(
      `
        INSERT INTO property_requests (
          reference_id,
          request_type,
          source,
          submitted_by_user_id,
          requester_name,
          requester_phone,
          city,
          locality,
          property_type,
          pricing,
          details,
          need_help,
          help_type,
          preferred_call_time,
          assisted_listing,
          interaction_status,
          listing_status,
          workflow_stage
        )
        VALUES (
          $1,
          'buy',
          'detail_schedule',
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          '{}'::jsonb,
          $8::jsonb,
          TRUE,
          'Just call and guide me',
          $9,
          FALSE,
          'New',
          'Pending',
          'Pending Approval'
        )
        RETURNING *
      `,
      [
        referenceId,
        userId,
        payload.requesterName,
        normalizedPhone,
        resolvedCity,
        resolvedLocality,
        resolvedPropertyType,
        JSON.stringify({
          scheduleVisit: true,
          propertyReference: payload.propertyReference,
          propertyTitle: payload.propertyTitle,
          preferredDate: payload.preferredDate,
          preferredTime: payload.preferredTime,
          note: payload.note || '',
        }),
        callTimeFromPreferredTime(payload.preferredTime),
      ]
    );

    const created = createdRows.rows[0];

    await writePropertyHistory({
      propertyRequestId: created.id,
      changedByUserId: userId,
      fieldName: 'interaction_status',
      previousValue: null,
      nextValue: 'New',
      note: 'Schedule visit requested from property details page',
    });
    await writePropertyHistory({
      propertyRequestId: created.id,
      changedByUserId: userId,
      fieldName: 'workflow_stage',
      previousValue: null,
      nextValue: 'Pending Approval',
      note: 'Visit request queued for team follow-up',
    });
    await writeActivityLog({
      actorUserId: userId,
      actorRole: userId ? 'user' : 'public',
      actionKey: 'schedule_visit_requested',
      entityType: 'property_request',
      entityId: created.id,
      requestReference: created.reference_id,
      metadata: {
        sourcePropertyReference: payload.propertyReference,
        preferredDate: payload.preferredDate,
        preferredTime: payload.preferredTime,
        ipAddress: normalizeIpAddress(req.ip || req.socket?.remoteAddress),
      },
    });

    if (property?.id) {
      await recordListingAnalyticsEvent({
        propertyRequestId: Number(property.id),
        actorUserId: userId,
        eventType: 'visit_request',
        metadata: {
          source: 'detail_schedule',
          visitRequestReference: created.reference_id,
        },
      });
    }

    return res.status(201).json({
      message: 'Site visit request created',
      referenceId: created.reference_id,
      request: serializePublicRequest(created),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/public/report-fraud', fraudReportLimiter, async (req, res, next) => {
  try {
    const payload = fraudReportSchema.parse(req.body);
    const normalizedPhone = normalizePhone(payload.phone);
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    const verificationResult = await verifyAndConsumePhoneVerification({
      normalizedPhone,
      phoneVerificationId: payload.phoneVerificationId,
    });
    if (!verificationResult.ok) {
      return res.status(400).json({ error: verificationResult.reason });
    }

    const requestRows = await pool.query(
      `
        SELECT *
        FROM property_requests
        WHERE reference_id = $1
          AND is_removed = FALSE
        LIMIT 1
      `,
      [payload.propertyReference]
    );

    const noteText = `Fraud report by ${payload.reporterName} (${normalizedPhone}): ${payload.reason}`;
    const caseId = generateReferenceId('FRD');

    if (requestRows.rowCount === 0) {
      await writeActivityLog({
        actorUserId: null,
        actorRole: 'public',
        actionKey: 'fraud_report_submitted',
        entityType: 'property_reference',
        entityId: null,
        requestReference: payload.propertyReference,
        metadata: {
          caseId,
          reporterName: payload.reporterName,
          phone: normalizedPhone,
          reason: payload.reason,
          ipAddress: normalizeIpAddress(req.ip || req.socket?.remoteAddress),
        },
      });

      return res.status(201).json({
        message: 'Fraud report submitted to main review desk',
        caseId,
      });
    }

    const request = requestRows.rows[0];
    const internalNotes = buildInternalNote(request.internal_notes, payload.reporterName, noteText);

    await pool.query(
      `
        UPDATE property_requests
        SET internal_notes = $1,
            lifecycle_status = CASE
              WHEN lifecycle_status IN ('sold', 'rented', 'archived') THEN lifecycle_status
              ELSE 'flagged'
            END
        WHERE id = $2
      `,
      [internalNotes, request.id]
    );

    await writePropertyHistory({
      propertyRequestId: request.id,
      changedByUserId: null,
      fieldName: 'fraud_report',
      previousValue: null,
      nextValue: payload.reason,
      note: `Fraud case ${caseId} submitted by public`,
    });

    await writeActivityLog({
      actorUserId: null,
      actorRole: 'public',
      actionKey: 'fraud_report_submitted',
      entityType: 'property_request',
      entityId: request.id,
      requestReference: request.reference_id,
      metadata: {
        caseId,
        reporterName: payload.reporterName,
        phone: normalizedPhone,
        ipAddress: normalizeIpAddress(req.ip || req.socket?.remoteAddress),
      },
    });

    await incrementListingRiskSignal({
      propertyRequestId: request.id,
      signalKey: 'fraud_report_count',
      delta: 1,
      note: `Fraud report case ${caseId} submitted by public user.`,
    });

    return res.status(201).json({
      message: 'Fraud report submitted to main review desk',
      caseId,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/my/submissions', requireAuth, async (req, res, next) => {
  try {
    const rows = await pool.query(
      `
        SELECT *
        FROM property_requests
        WHERE submitted_by_user_id = $1
          AND is_removed = FALSE
        ORDER BY created_at DESC
      `,
      [req.user.id]
    );

    return res.json({
      requests: rows.rows.map(serializePublicRequest),
    });
  } catch (error) {
    return next(error);
  }
});

router.post(
  '/my/submissions/:id/boost',
  requireAuth,
  requireOwnership({
    tableName: 'property_requests',
    ownerColumn: 'submitted_by_user_id',
    idParam: 'id',
    uuidColumn: 'uuid_id',
  }),
  checkSubscriptionFeature('boost_listing'),
  async (req, res, next) => {
    const requestId = Number(req.ownership?.id?.id);
    if (!Number.isSafeInteger(requestId) || requestId <= 0) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    let payload;
    try {
      payload = listingBoostSchema.parse(req.body || {});
    } catch (error) {
      return next(error);
    }

    const boostWeights = {
      city_top: 35,
      category_top: 24,
      homepage_feature: 42,
      urgent_tag: 16,
    };
    const weightToApply = boostWeights[payload.boostType] || boostWeights.urgent_tag;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const subscriptionRows = await client.query(
        `
          SELECT id, boost_credits
          FROM subscriptions
          WHERE user_id = $1
            AND is_active = TRUE
            AND (end_date IS NULL OR end_date >= CURRENT_DATE)
          ORDER BY updated_at DESC, created_at DESC
          LIMIT 1
          FOR UPDATE
        `,
        [req.user.id]
      );

      if (subscriptionRows.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'No active subscription found.' });
      }

      const subscription = subscriptionRows.rows[0];
      if (Number(subscription.boost_credits || 0) <= 0) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'No boost credits left.' });
      }

      const listingRows = await client.query(
        `
          UPDATE property_requests
          SET boost_weight = COALESCE(boost_weight, 0) + $1
          WHERE id = $2
            AND submitted_by_user_id = $3
            AND deleted_at IS NULL
          RETURNING id, reference_id, boost_weight
        `,
        [weightToApply, requestId, req.user.id]
      );

      if (listingRows.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Listing not found' });
      }

      const subscriptionUpdate = await client.query(
        `
          UPDATE subscriptions
          SET boost_credits = GREATEST(0, boost_credits - 1),
              updated_at = NOW()
          WHERE id = $1
          RETURNING boost_credits
        `,
        [subscription.id]
      );

      await client.query('COMMIT');

      const listing = listingRows.rows[0];
      await recordListingAnalyticsEvent({
        propertyRequestId: Number(listing.id),
        actorUserId: req.user.id,
        eventType: 'conversion',
        eventValue: weightToApply,
        metadata: {
          boostType: payload.boostType,
        },
      });
      await writeActivityLog({
        actorUserId: req.user.id,
        actorRole: req.user.role,
        actionKey: 'listing_boost_applied',
        entityType: 'property_request',
        entityId: Number(listing.id),
        requestReference: listing.reference_id,
        metadata: {
          boostType: payload.boostType,
          weightApplied: weightToApply,
          remainingCredits: Number(subscriptionUpdate.rows[0].boost_credits || 0),
          ipAddress: normalizeIpAddress(req.ip || req.socket?.remoteAddress),
        },
      });
      await writeActivityLog({
        actorUserId: req.user.id,
        actorRole: req.user.role,
        actionKey: 'subscription_updated',
        entityType: 'subscription',
        entityId: Number(subscription.id),
        requestReference: listing.reference_id,
        metadata: {
          reason: 'boost_credit_consumed',
          remainingCredits: Number(subscriptionUpdate.rows[0].boost_credits || 0),
          ipAddress: normalizeIpAddress(req.ip || req.socket?.remoteAddress),
        },
      });

      return res.json({
        message: 'Listing boost applied.',
        listingId: Number(listing.id),
        referenceId: listing.reference_id,
        boostWeight: Number(listing.boost_weight || 0),
        remainingBoostCredits: Number(subscriptionUpdate.rows[0].boost_credits || 0),
      });
    } catch (error) {
      await client.query('ROLLBACK');
      return next(error);
    } finally {
      client.release();
    }
  }
);

router.get('/team/requests', requireAuth, requirePermission('approve_listing'), async (req, res, next) => {
  try {
    const parsedQuery = teamQueueQuerySchema.parse({
      type: req.query.type ?? 'all',
      interactionStatus: req.query.interactionStatus ?? 'all',
      listingStatus: req.query.listingStatus ?? 'all',
    });

    const whereParts = ['is_removed = FALSE'];
    const values = [];

    if (parsedQuery.type === 'assisted') {
      whereParts.push('assisted_listing = TRUE');
    } else if (['buy', 'sell', 'rent'].includes(parsedQuery.type)) {
      values.push(parsedQuery.type);
      whereParts.push(`request_type = $${values.length}`);
    }

    if (parsedQuery.interactionStatus !== 'all') {
      values.push(parsedQuery.interactionStatus);
      whereParts.push(`interaction_status = $${values.length}`);
    }

    if (parsedQuery.listingStatus !== 'all') {
      values.push(parsedQuery.listingStatus);
      whereParts.push(`listing_status = $${values.length}`);
    }

    const queueRows = await pool.query(
      `
        SELECT *
        FROM property_requests
        WHERE ${whereParts.join(' AND ')}
        ORDER BY created_at DESC
      `,
      values
    );

    return res.json({
      requests: queueRows.rows.map(serializePropertyRequest),
    });
  } catch (error) {
    return next(error);
  }
});

router.patch(
  '/team/requests/:id',
  requireAuth,
  requirePermission('approve_listing'),
  async (req, res, next) => {
  try {
    const requestIdInput = parseRouteEntityId(req.params.id);
    const requestIdFilter = buildDualIdFilter(requestIdInput, {
      idColumn: 'id',
      uuidColumn: 'uuid_id',
      parameterIndex: 1,
    });
    if (!requestIdFilter) {
      return res.status(400).json({ error: 'Invalid request id' });
    }

    const payload = teamUpdateSchema.parse(req.body);

    const currentRows = await pool.query(
      `SELECT * FROM property_requests WHERE ${requestIdFilter.clause} AND is_removed = FALSE LIMIT 1`,
      requestIdFilter.values
    );

    if (currentRows.rowCount === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const current = currentRows.rows[0];
    const requestId = Number(current.id);

    if (payload.detailsPatch && !current.assisted_listing) {
      return res.status(400).json({
        error: 'Property details can only be added by team for assisted listings',
      });
    }

    const nextInteractionStatus = payload.interactionStatus || current.interaction_status;
    const nextInternalNotes = payload.internalNote
      ? buildInternalNote(current.internal_notes, req.user.name, payload.internalNote)
      : current.internal_notes;
    const nextDetails = payload.detailsPatch
      ? { ...(current.details || {}), ...payload.detailsPatch }
      : current.details;
    const pricingPatch =
      payload.detailsPatch &&
      typeof payload.detailsPatch === 'object' &&
      !Array.isArray(payload.detailsPatch) &&
      payload.detailsPatch.pricing &&
      typeof payload.detailsPatch.pricing === 'object' &&
      !Array.isArray(payload.detailsPatch.pricing)
        ? payload.detailsPatch.pricing
        : null;
    const nextPricing = pricingPatch
      ? { ...(toObject(current.pricing) || {}), ...pricingPatch }
      : current.pricing;
    const assignedToUserId = payload.assignToSelf ? req.user.id : current.assigned_to_user_id;

    const updatedRows = await pool.query(
      `
        UPDATE property_requests
        SET interaction_status = $1,
            internal_notes = $2,
            details = $3,
            pricing = $4,
            assigned_to_user_id = $5,
            created_by_team_member_id = CASE
              WHEN $6::boolean = TRUE THEN $5
              ELSE created_by_team_member_id
            END
        WHERE id = $7
        RETURNING *
      `,
      [
        nextInteractionStatus,
        nextInternalNotes,
        nextDetails,
        nextPricing,
        assignedToUserId,
        Boolean(payload.detailsPatch),
        requestId,
      ]
    );

    if (pricingPatch) {
      await recordListingPriceHistoryIfChanged({
        propertyRequestId: requestId,
        changedByUserId: req.user.id,
        previousPricing: current.pricing,
        nextPricing,
        reason: 'Team updated pricing via assisted listing flow',
      });
    }

    if (current.interaction_status !== nextInteractionStatus) {
      await writePropertyHistory({
        propertyRequestId: requestId,
        changedByUserId: req.user.id,
        fieldName: 'interaction_status',
        previousValue: current.interaction_status,
        nextValue: nextInteractionStatus,
        note: payload.internalNote || null,
      });
    }

    if (payload.internalNote) {
      await writePropertyHistory({
        propertyRequestId: requestId,
        changedByUserId: req.user.id,
        fieldName: 'internal_note',
        previousValue: null,
        nextValue: payload.internalNote,
        note: 'Team note added',
      });
    }

    if (payload.detailsPatch) {
      await writePropertyHistory({
        propertyRequestId: requestId,
        changedByUserId: req.user.id,
        fieldName: 'details_patch',
        previousValue: null,
        nextValue: JSON.stringify(payload.detailsPatch),
        note: 'Team updated assisted listing details',
      });
    }

    if (payload.assignToSelf && current.assigned_to_user_id !== req.user.id) {
      await writePropertyHistory({
        propertyRequestId: requestId,
        changedByUserId: req.user.id,
        fieldName: 'assigned_to_user',
        previousValue: current.assigned_to_user_id ? String(current.assigned_to_user_id) : null,
        nextValue: String(req.user.id),
        note: 'Assigned to team member',
      });
    }

    if (payload.interactionStatus || payload.internalNote || payload.detailsPatch || payload.assignToSelf) {
      await incrementListingRiskSignal({
        propertyRequestId: requestId,
        signalKey: 'edit_count',
        delta: 1,
        note: `Listing updated by team member ${req.user.id}.`,
      });
    }

    await writeActivityLog({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      actionKey: 'team_request_updated',
      entityType: 'property_request',
      entityId: requestId,
      requestReference: current.reference_id,
      metadata: {
        interactionStatus: nextInteractionStatus,
        addedNote: Boolean(payload.internalNote),
        updatedDetails: Boolean(payload.detailsPatch),
        assignedToSelf: Boolean(payload.assignToSelf),
      },
    });

    return res.json({
      message: 'Request updated',
      request: serializePropertyRequest(updatedRows.rows[0]),
    });
  } catch (error) {
    return next(error);
  }
  }
);
router.patch(
  '/admin/requests/:id/listing-status',
  requireAuth,
  requirePermission('approve_listing'),
  async (req, res, next) => {
  try {
    const requestIdInput = parseRouteEntityId(req.params.id);
    const requestIdFilter = buildDualIdFilter(requestIdInput, {
      idColumn: 'id',
      uuidColumn: 'uuid_id',
      parameterIndex: 1,
    });
    if (!requestIdFilter) {
      return res.status(400).json({ error: 'Invalid request id' });
    }

    const payload = adminListingUpdateSchema.parse(req.body);

    const currentRows = await pool.query(
      `SELECT * FROM property_requests WHERE ${requestIdFilter.clause} AND is_removed = FALSE LIMIT 1`,
      requestIdFilter.values
    );

    if (currentRows.rowCount === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const current = currentRows.rows[0];
    const requestId = Number(current.id);

    if (current.request_type === 'buy') {
      return res.status(400).json({
        error: 'Listing approval status is available only for sell/rent listings',
      });
    }

    const nextInternalNotes = payload.note
      ? buildInternalNote(current.internal_notes, req.user.name, payload.note)
      : current.internal_notes;
    const currentLifecycleStatus = normalizeLifecycleStatus(current.lifecycle_status);
    const targetLifecycleStatus = listingStatusToLifecycle[payload.listingStatus] || currentLifecycleStatus;
    if (!isLifecycleTransitionAllowed(currentLifecycleStatus, targetLifecycleStatus)) {
      return res.status(409).json({
        error: `Invalid listing lifecycle transition: ${currentLifecycleStatus} -> ${targetLifecycleStatus}`,
      });
    }
    const nextWorkflowStage = resolveWorkflowStageFromListingStatus(payload.listingStatus);

    const updatedRows = await pool.query(
      `
        UPDATE property_requests
        SET listing_status = $1,
            internal_notes = $2,
            workflow_stage = $3,
            lifecycle_status = $4
        WHERE id = $5
        RETURNING *
      `,
      [payload.listingStatus, nextInternalNotes, nextWorkflowStage, targetLifecycleStatus, requestId]
    );

    if (current.listing_status !== payload.listingStatus) {
      await writePropertyHistory({
        propertyRequestId: requestId,
        changedByUserId: req.user.id,
        fieldName: 'listing_status',
        previousValue: current.listing_status,
        nextValue: payload.listingStatus,
        note: payload.note || null,
      });
    }

    if (payload.note) {
      await writePropertyHistory({
        propertyRequestId: requestId,
        changedByUserId: req.user.id,
        fieldName: 'internal_note',
        previousValue: null,
        nextValue: payload.note,
        note: 'Admin note added',
      });
    }

    if (current.workflow_stage !== nextWorkflowStage) {
      await writePropertyHistory({
        propertyRequestId: requestId,
        changedByUserId: req.user.id,
        fieldName: 'workflow_stage',
        previousValue: current.workflow_stage,
        nextValue: nextWorkflowStage,
        note: payload.note || null,
      });
    }

    if (currentLifecycleStatus !== targetLifecycleStatus) {
      await writePropertyHistory({
        propertyRequestId: requestId,
        changedByUserId: req.user.id,
        fieldName: 'lifecycle_status',
        previousValue: currentLifecycleStatus,
        nextValue: targetLifecycleStatus,
        note: payload.note || null,
      });
    }

    await incrementListingRiskSignal({
      propertyRequestId: requestId,
      signalKey: 'edit_count',
      delta: 1,
      note: `Listing status changed by admin ${req.user.id}.`,
    });

    await writeActivityLog({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      actionKey: 'listing_status_changed',
      entityType: 'property_request',
      entityId: requestId,
      requestReference: current.reference_id,
      metadata: {
        from: current.listing_status,
        to: payload.listingStatus,
        lifecycleStatusFrom: currentLifecycleStatus,
        lifecycleStatusTo: targetLifecycleStatus,
        workflowStageFrom: current.workflow_stage,
        workflowStageTo: nextWorkflowStage,
        note: payload.note || '',
      },
    });

    return res.json({
      message: 'Listing status updated',
      request: serializePropertyRequest(updatedRows.rows[0]),
    });
  } catch (error) {
    return next(error);
  }
  }
);

router.patch(
  '/admin/requests/:id/flag',
  requireAuth,
  requirePermission('approve_listing'),
  async (req, res, next) => {
  try {
    const requestIdInput = parseRouteEntityId(req.params.id);
    const requestIdFilter = buildDualIdFilter(requestIdInput, {
      idColumn: 'id',
      uuidColumn: 'uuid_id',
      parameterIndex: 1,
    });
    if (!requestIdFilter) {
      return res.status(400).json({ error: 'Invalid request id' });
    }

    const payload = adminFakeListingSchema.parse(req.body);

    const currentRows = await pool.query(
      `SELECT * FROM property_requests WHERE ${requestIdFilter.clause} LIMIT 1`,
      requestIdFilter.values
    );

    if (currentRows.rowCount === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const current = currentRows.rows[0];
    const requestId = Number(current.id);
    const currentLifecycleStatus = normalizeLifecycleStatus(current.lifecycle_status);
    let targetLifecycleStatus = currentLifecycleStatus;
    if (payload.remove) {
      targetLifecycleStatus = 'archived';
    } else if (payload.isFake) {
      targetLifecycleStatus = TERMINAL_LIFECYCLE_STATUSES.has(currentLifecycleStatus)
        ? currentLifecycleStatus
        : 'flagged';
    } else if (currentLifecycleStatus === 'flagged') {
      targetLifecycleStatus = 'pending_review';
    }

    if (!isLifecycleTransitionAllowed(currentLifecycleStatus, targetLifecycleStatus)) {
      return res.status(409).json({
        error: `Invalid listing lifecycle transition: ${currentLifecycleStatus} -> ${targetLifecycleStatus}`,
      });
    }

    const updatedRows = await pool.query(
      `
        UPDATE property_requests
        SET is_fake = $1,
            is_removed = $2,
            internal_notes = $3,
            lifecycle_status = $4
        WHERE id = $5
        RETURNING *
      `,
      [
        payload.isFake,
        payload.remove,
        payload.note
          ? buildInternalNote(current.internal_notes, req.user.name, payload.note)
          : current.internal_notes,
        targetLifecycleStatus,
        requestId,
      ]
    );

    await writePropertyHistory({
      propertyRequestId: requestId,
      changedByUserId: req.user.id,
      fieldName: 'moderation',
      previousValue: JSON.stringify({ isFake: current.is_fake, isRemoved: current.is_removed }),
      nextValue: JSON.stringify({ isFake: payload.isFake, isRemoved: payload.remove }),
      note: payload.note || 'Listing moderation update',
    });
    if (currentLifecycleStatus !== targetLifecycleStatus) {
      await writePropertyHistory({
        propertyRequestId: requestId,
        changedByUserId: req.user.id,
        fieldName: 'lifecycle_status',
        previousValue: currentLifecycleStatus,
        nextValue: targetLifecycleStatus,
        note: payload.note || 'Listing lifecycle updated from moderation',
      });
    }
    await incrementListingRiskSignal({
      propertyRequestId: requestId,
      signalKey: 'edit_count',
      delta: 1,
      note: `Moderation flags updated by admin ${req.user.id}.`,
    });
    await writeActivityLog({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      actionKey: payload.remove ? 'listing_removed' : 'listing_flag_updated',
      entityType: 'property_request',
      entityId: requestId,
      requestReference: current.reference_id,
      metadata: {
        isFake: payload.isFake,
        removed: payload.remove,
        lifecycleStatusFrom: currentLifecycleStatus,
        lifecycleStatusTo: targetLifecycleStatus,
        note: payload.note || '',
      },
    });

    return res.json({
      message: payload.remove ? 'Listing removed from platform' : 'Listing flag updated',
      request: serializePropertyRequest(updatedRows.rows[0]),
    });
  } catch (error) {
    return next(error);
  }
  }
);

router.patch(
  '/admin/requests/:id/assign-team',
  requireAuth,
  requirePermission('assign_team_request'),
  async (req, res, next) => {
  try {
    const requestIdInput = parseRouteEntityId(req.params.id);
    const requestIdFilter = buildDualIdFilter(requestIdInput, {
      idColumn: 'id',
      uuidColumn: 'uuid_id',
      parameterIndex: 1,
    });
    if (!requestIdFilter) {
      return res.status(400).json({ error: 'Invalid request id' });
    }

    const payload = adminAssignTeamSchema.parse(req.body);

    const [requestRows, teamRows] = await Promise.all([
      pool.query(
        `SELECT * FROM property_requests WHERE ${requestIdFilter.clause} AND is_removed = FALSE LIMIT 1`,
        requestIdFilter.values
      ),
      pool.query(
        `
          SELECT id, name, email, is_active
          FROM users
          WHERE id = $1
            AND role = 'team_member'
          LIMIT 1
        `,
        [payload.teamMemberId]
      ),
    ]);

    if (requestRows.rowCount === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (teamRows.rowCount === 0) {
      return res.status(404).json({ error: 'Team member not found' });
    }

    const teamMember = teamRows.rows[0];
    if (!teamMember.is_active) {
      return res.status(400).json({ error: 'Selected team member is not active' });
    }

    const current = requestRows.rows[0];
    const requestId = Number(current.id);
    const assignmentType = payload.assignmentType || 'call_user';
    const assignmentQuery = payload.assignmentQuery?.trim() || '';
    const assignmentTypeLabel =
      assignmentType === 'add_property'
        ? 'Add Property'
        : assignmentType === 'handle_query'
          ? 'Handle Query'
          : 'Call User';
    const noteLine =
      payload.note ||
      `Admin referred this request to team member: ${teamMember.name} (${assignmentTypeLabel})`;
    const nextInternalNotes = buildInternalNote(
      current.internal_notes,
      req.user.name,
      noteLine
    );

    const updatedRows = await pool.query(
      `
        UPDATE property_requests
        SET assigned_to_user_id = $1,
            assigned_task_type = $2,
            assigned_task_query = $3,
            assigned_by_admin_id = $4,
            assigned_at = NOW(),
            internal_notes = $5
        WHERE id = $6
        RETURNING *
      `,
      [
        teamMember.id,
        assignmentType,
        assignmentQuery,
        req.user.id,
        nextInternalNotes,
        requestId,
      ]
    );

    await writePropertyHistory({
      propertyRequestId: requestId,
      changedByUserId: req.user.id,
      fieldName: 'assigned_to_user',
      previousValue: current.assigned_to_user_id ? String(current.assigned_to_user_id) : null,
      nextValue: String(teamMember.id),
      note: `Assigned by admin to ${teamMember.name}`,
    });

    await writePropertyHistory({
      propertyRequestId: requestId,
      changedByUserId: req.user.id,
      fieldName: 'assigned_task',
      previousValue: JSON.stringify({
        assignmentType: current.assigned_task_type || null,
        assignmentQuery: current.assigned_task_query || '',
      }),
      nextValue: JSON.stringify({
        assignmentType,
        assignmentQuery,
      }),
      note: `Task assigned: ${assignmentTypeLabel}`,
    });

    if (payload.note) {
      await writePropertyHistory({
        propertyRequestId: requestId,
        changedByUserId: req.user.id,
        fieldName: 'internal_note',
        previousValue: null,
        nextValue: payload.note,
        note: 'Admin assignment note',
      });
    }

    await incrementListingRiskSignal({
      propertyRequestId: requestId,
      signalKey: 'edit_count',
      delta: 1,
      note: `Team assignment updated by admin ${req.user.id}.`,
    });

    await writeActivityLog({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      actionKey: 'request_assigned_to_team_member',
      entityType: 'property_request',
      entityId: requestId,
      requestReference: current.reference_id,
      metadata: {
        fromTeamUserId: current.assigned_to_user_id,
        toTeamUserId: teamMember.id,
        toTeamName: teamMember.name,
        assignmentType,
        assignmentQuery,
        note: payload.note || '',
      },
    });

    return res.json({
      message: `Request referred to ${teamMember.name} for ${assignmentTypeLabel}`,
      request: serializePropertyRequest(updatedRows.rows[0]),
      assignedTeamMember: {
        id: teamMember.id,
        name: teamMember.name,
        email: teamMember.email,
      },
      assignment: {
        type: assignmentType,
        query: assignmentQuery,
      },
    });
  } catch (error) {
    return next(error);
  }
  }
);

router.patch(
  '/admin/requests/:id/featured',
  requireAuth,
  requireMainAdmin,
  requirePermission('manage_promotions'),
  async (req, res, next) => {
    try {
      const requestIdInput = parseRouteEntityId(req.params.id);
      const requestIdFilter = buildDualIdFilter(requestIdInput, {
        idColumn: 'id',
        uuidColumn: 'uuid_id',
        parameterIndex: 1,
      });
      if (!requestIdFilter) {
        return res.status(400).json({ error: 'Invalid request id' });
      }

      const payload = adminFeaturedSchema.parse(req.body);

      const currentRows = await pool.query(
        `SELECT * FROM property_requests WHERE ${requestIdFilter.clause} AND is_removed = FALSE LIMIT 1`,
        requestIdFilter.values
      );

      if (currentRows.rowCount === 0) {
        return res.status(404).json({ error: 'Request not found' });
      }

      const current = currentRows.rows[0];
      const requestId = Number(current.id);
      if (current.request_type === 'buy') {
        return res.status(400).json({
          error: 'Featured flag is available only for sell/rent listings',
        });
      }

      const nextInternalNotes = payload.note
        ? buildInternalNote(current.internal_notes, req.user.name, payload.note)
        : current.internal_notes;

      const updatedRows = await pool.query(
        `
          UPDATE property_requests
          SET is_featured = $1,
              internal_notes = $2
          WHERE id = $3
          RETURNING *
        `,
        [payload.isFeatured, nextInternalNotes, requestId]
      );

      if (current.is_featured !== payload.isFeatured) {
        await writePropertyHistory({
          propertyRequestId: requestId,
          changedByUserId: req.user.id,
          fieldName: 'is_featured',
          previousValue: String(current.is_featured),
          nextValue: String(payload.isFeatured),
          note: payload.note || null,
        });
      }

      await incrementListingRiskSignal({
        propertyRequestId: requestId,
        signalKey: 'edit_count',
        delta: 1,
        note: `Featured flag toggled by main admin ${req.user.id}.`,
      });

      await writeActivityLog({
        actorUserId: req.user.id,
        actorRole: req.user.role,
        actionKey: 'listing_featured_toggled',
        entityType: 'property_request',
        entityId: requestId,
        requestReference: current.reference_id,
        metadata: {
          featured: payload.isFeatured,
          note: payload.note || '',
        },
      });

      return res.json({
        message: payload.isFeatured ? 'Listing marked as featured' : 'Listing removed from featured',
        request: serializePropertyRequest(updatedRows.rows[0]),
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.get(
  '/admin/overview',
  requireAuth,
  requirePermission('access_risk_dashboard'),
  async (req, res, next) => {
  try {
    const featureUsageKeys = FEATURE_USAGE_ACTION_CATALOG.map((item) => item.key);
    const featureUsageLabels = FEATURE_USAGE_ACTION_CATALOG.map((item) => item.label);
    const [
      requestCounts,
      interactionCounts,
      listingCounts,
      teamCounts,
      adminCount,
      pendingCareers,
      dailyCounts,
      actorBreakdown,
      teamPerformance,
      adminPerformance,
      listingsPerDay,
      featureUsageRows,
      featureUsageSummary,
    ] =
      await Promise.all([
        pool.query(
          `
            SELECT
              COUNT(*) FILTER (WHERE is_removed = FALSE) AS total,
              COUNT(*) FILTER (WHERE request_type = 'buy' AND is_removed = FALSE) AS buy,
              COUNT(*) FILTER (WHERE request_type = 'sell' AND is_removed = FALSE) AS sell,
              COUNT(*) FILTER (WHERE request_type = 'rent' AND is_removed = FALSE) AS rent,
              COUNT(*) FILTER (WHERE assisted_listing = TRUE AND is_removed = FALSE) AS assisted,
              COUNT(*) FILTER (WHERE listing_status = 'Pending' AND request_type IN ('sell', 'rent') AND is_removed = FALSE) AS pending_approval
            FROM property_requests
          `
        ),
        pool.query(
          `
            SELECT interaction_status, COUNT(*)::INT AS count
            FROM property_requests
            WHERE is_removed = FALSE
            GROUP BY interaction_status
          `
        ),
        pool.query(
          `
            SELECT listing_status, COUNT(*)::INT AS count
            FROM property_requests
            WHERE request_type IN ('sell', 'rent')
              AND is_removed = FALSE
            GROUP BY listing_status
          `
        ),
        pool.query(
          `
            SELECT
              COUNT(*) FILTER (WHERE role = 'team_member')::INT AS total_team_members,
              COUNT(*) FILTER (WHERE role = 'team_member' AND is_active = TRUE)::INT AS active_team_members
            FROM users
          `
        ),
        pool.query(
          `
            SELECT COUNT(*)::INT AS admin_count
            FROM users
            WHERE role = 'admin'
              AND is_main_admin = FALSE
          `
        ),
        pool.query(
          `
            SELECT COUNT(*)::INT AS pending_applications
            FROM career_applications
            WHERE status = 'Pending'
          `
        ),
        pool.query(
          `
            SELECT
              COUNT(*) FILTER (WHERE is_removed = FALSE AND created_at::date = CURRENT_DATE) AS properties_added_today,
              COUNT(*) FILTER (WHERE is_removed = FALSE AND created_at >= NOW() - INTERVAL '7 days') AS properties_added_this_week,
              COUNT(*) FILTER (WHERE is_removed = FALSE AND assisted_listing = TRUE) AS assisted_listings_count,
              COUNT(*) FILTER (
                WHERE is_removed = FALSE
                  AND assisted_listing = TRUE
                  AND interaction_status <> 'Completed'
              ) AS active_help_requests,
              COUNT(*) FILTER (
                WHERE is_removed = FALSE
                  AND created_at::date = CURRENT_DATE
                  AND submitted_by_user_id IS NOT NULL
              ) AS user_submitted_today,
              COUNT(*) FILTER (
                WHERE is_removed = FALSE
                  AND created_at::date = CURRENT_DATE
                  AND created_by_team_member_id IS NOT NULL
              ) AS team_added_today
            FROM property_requests
          `
        ),
        pool.query(
          `
            SELECT
              COALESCE(u.id::TEXT, 'public') AS actor_id,
              COALESCE(u.name, 'Public') AS actor_name,
              COALESCE(u.role, 'public') AS actor_role,
              COUNT(*)::INT AS properties_added
            FROM property_requests pr
            LEFT JOIN users u
              ON u.id = COALESCE(pr.created_by_team_member_id, pr.submitted_by_user_id)
            WHERE pr.is_removed = FALSE
              AND pr.created_at >= NOW() - INTERVAL '7 days'
            GROUP BY actor_id, actor_name, actor_role
            ORDER BY properties_added DESC
            LIMIT 25
          `
        ),
        pool.query(
          `
            SELECT
              u.id,
              u.name,
              COUNT(*) FILTER (
                WHERE h.field_name = 'interaction_status'
                  AND h.next_value IN ('Contacted', 'Scheduled', 'Completed')
              )::INT AS calls_handled,
              COUNT(DISTINCT h.property_request_id) FILTER (
                WHERE h.field_name = 'interaction_status'
                  AND h.next_value IN ('Contacted', 'Scheduled', 'Completed')
              )::INT AS assisted_users,
              COUNT(*) FILTER (WHERE h.field_name = 'details_patch')::INT AS listings_added_for_users,
              COUNT(*) FILTER (WHERE h.field_name = 'internal_note')::INT AS notes_added
            FROM users u
            LEFT JOIN property_request_status_history h
              ON h.changed_by_user_id = u.id
             AND h.created_at >= NOW() - INTERVAL '7 days'
            WHERE u.role = 'team_member'
            GROUP BY u.id, u.name
            ORDER BY calls_handled DESC, listings_added_for_users DESC, notes_added DESC
          `
        ),
        pool.query(
          `
            SELECT
              u.id,
              u.name,
              COUNT(*) FILTER (WHERE a.action_key = 'listing_status_changed')::INT AS listing_decisions,
              COUNT(*) FILTER (WHERE a.action_key = 'listing_removed')::INT AS fake_removed,
              COUNT(*) FILTER (WHERE a.action_key = 'listing_featured_toggled')::INT AS featured_updates
            FROM users u
            LEFT JOIN activity_logs a
              ON a.actor_user_id = u.id
             AND a.created_at >= NOW() - INTERVAL '7 days'
            WHERE u.role = 'admin'
            GROUP BY u.id, u.name
            ORDER BY listing_decisions DESC, fake_removed DESC, featured_updates DESC
          `
        ),
        pool.query(
          `
            SELECT
              TO_CHAR(created_at::date, 'YYYY-MM-DD') AS day,
              COUNT(*)::INT AS total
            FROM property_requests
            WHERE is_removed = FALSE
              AND created_at >= CURRENT_DATE - INTERVAL '6 days'
            GROUP BY day
            ORDER BY day ASC
          `
        ),
        pool.query(
          `
            WITH feature_catalog AS (
              SELECT *
              FROM UNNEST($1::text[], $2::text[]) AS f(feature_key, feature_label)
            )
            SELECT
              f.feature_key,
              f.feature_label,
              COUNT(a.id)::INT AS total_events,
              COUNT(
                DISTINCT CASE
                  WHEN a.actor_user_id IS NOT NULL THEN CONCAT('u:', a.actor_user_id::TEXT)
                  WHEN NULLIF(a.ip_address, '') IS NOT NULL THEN CONCAT('ip:', a.ip_address)
                  ELSE NULL
                END
              )::INT AS unique_users
            FROM feature_catalog f
            LEFT JOIN activity_logs a
              ON a.action_key = f.feature_key
             AND a.actor_role IN ('user', 'public')
             AND a.created_at >= NOW() - ($3::INT * INTERVAL '1 day')
            GROUP BY f.feature_key, f.feature_label
            ORDER BY total_events DESC, unique_users DESC, f.feature_label ASC
          `,
          [featureUsageKeys, featureUsageLabels, FEATURE_USAGE_WINDOW_DAYS]
        ),
        pool.query(
          `
            SELECT
              COUNT(*)::INT AS total_events,
              COUNT(
                DISTINCT CASE
                  WHEN actor_user_id IS NOT NULL THEN CONCAT('u:', actor_user_id::TEXT)
                  WHEN NULLIF(ip_address, '') IS NOT NULL THEN CONCAT('ip:', ip_address)
                  ELSE NULL
                END
              )::INT AS unique_users
            FROM activity_logs
            WHERE action_key = ANY($1::text[])
              AND actor_role IN ('user', 'public')
              AND created_at >= NOW() - ($2::INT * INTERVAL '1 day')
          `,
          [featureUsageKeys, FEATURE_USAGE_WINDOW_DAYS]
        ),
      ]);

    const featureUsageFeatures = featureUsageRows.rows.map((row) => ({
      featureKey: row.feature_key,
      featureLabel: row.feature_label,
      totalEvents: Number(row.total_events || 0),
      uniqueUsers: Number(row.unique_users || 0),
    }));

    const leastUsedFeatures = [...featureUsageFeatures]
      .sort(
        (left, right) =>
          left.totalEvents - right.totalEvents ||
          left.uniqueUsers - right.uniqueUsers ||
          left.featureLabel.localeCompare(right.featureLabel)
      )
      .slice(0, 5);

    return res.json({
      requests: {
        total: Number(requestCounts.rows[0].total || 0),
        buy: Number(requestCounts.rows[0].buy || 0),
        sell: Number(requestCounts.rows[0].sell || 0),
        rent: Number(requestCounts.rows[0].rent || 0),
        assisted: Number(requestCounts.rows[0].assisted || 0),
        pendingApproval: Number(requestCounts.rows[0].pending_approval || 0),
      },
      interactionStatus: interactionCounts.rows,
      listingStatus: listingCounts.rows,
      team: {
        totalMembers: Number(teamCounts.rows[0].total_team_members || 0),
        activeMembers: Number(teamCounts.rows[0].active_team_members || 0),
      },
      adminSeats: {
        used: Number(adminCount.rows[0].admin_count || 0),
        max: 2,
      },
      careers: {
        pending: Number(pendingCareers.rows[0].pending_applications || 0),
      },
      dashboard: {
        propertiesAddedToday: Number(dailyCounts.rows[0].properties_added_today || 0),
        propertiesAddedThisWeek: Number(dailyCounts.rows[0].properties_added_this_week || 0),
        assistedListingsCount: Number(dailyCounts.rows[0].assisted_listings_count || 0),
        activeHelpRequests: Number(dailyCounts.rows[0].active_help_requests || 0),
        userSubmittedToday: Number(dailyCounts.rows[0].user_submitted_today || 0),
        teamAddedToday: Number(dailyCounts.rows[0].team_added_today || 0),
      },
      addedByActor: actorBreakdown.rows,
      teamPerformance: teamPerformance.rows,
      adminPerformance: adminPerformance.rows,
      listingsPerDay: listingsPerDay.rows,
      featureUsage: {
        periodDays: FEATURE_USAGE_WINDOW_DAYS,
        totalTrackedFeatures: featureUsageFeatures.length,
        totalEvents: Number(featureUsageSummary.rows[0]?.total_events || 0),
        uniqueUsers: Number(featureUsageSummary.rows[0]?.unique_users || 0),
        features: featureUsageFeatures,
        mostUsed: featureUsageFeatures.slice(0, 5),
        leastUsed: leastUsedFeatures,
      },
    });
  } catch (error) {
    return next(error);
  }
  }
);

router.get(
  '/admin/team-members',
  requireAuth,
  requirePermission('manage_team'),
  async (req, res, next) => {
  try {
    const rows = await pool.query(
      `
        SELECT id, name, email, phone, role, is_active, deactivated_until, created_at
        FROM users
        WHERE role = 'team_member'
        ORDER BY created_at DESC
      `
    );

    return res.json({
      teamMembers: rows.rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        role: row.role,
        isActive: row.is_active,
        deactivatedUntil: row.deactivated_until,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    return next(error);
  }
  }
);

router.patch(
  '/admin/team-members/:id',
  requireAuth,
  requireMainAdmin,
  requirePermission('manage_team'),
  async (req, res, next) => {
  try {
    const teamMemberIdInput = parseRouteEntityId(req.params.id);
    const teamMemberIdFilter = buildDualIdFilter(teamMemberIdInput, {
      idColumn: 'id',
      uuidColumn: 'uuid_id',
      parameterIndex: 2,
    });
    if (!teamMemberIdFilter) {
      return res.status(400).json({ error: 'Invalid team member id' });
    }

    const payload = teamMemberStatusSchema.parse(req.body);

    const updatedRows = await pool.query(
      `
        UPDATE users
        SET is_active = $1,
            deactivated_until = CASE
              WHEN $1 = TRUE THEN NULL
              ELSE NOW() + INTERVAL '3 days'
            END
        WHERE ${teamMemberIdFilter.clause}
          AND role = 'team_member'
        RETURNING id, name, email, phone, role, is_active, deactivated_until, created_at
      `,
      [payload.isActive, ...teamMemberIdFilter.values]
    );

    if (updatedRows.rowCount === 0) {
      return res.status(404).json({ error: 'Team member not found' });
    }

    const teamMemberId = Number(updatedRows.rows[0].id);

    if (!payload.isActive) {
      await pool.query(
        `
          UPDATE user_sessions
          SET revoked_at = NOW(),
              revoked_by_user_id = $1
          WHERE user_id = $2
            AND revoked_at IS NULL
        `,
        [req.user.id, teamMemberId]
      );
    }

    await writeActivityLog({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      actionKey: payload.isActive ? 'team_member_activated' : 'team_member_deactivated',
      entityType: 'user',
      entityId: teamMemberId,
      requestReference: null,
      metadata: {
        role: 'team_member',
        deactivatedUntil: updatedRows.rows[0].deactivated_until,
      },
    });

    return res.json({
      message: payload.isActive
        ? 'Team member activated'
        : 'Team member temporarily deactivated for 3 days',
      teamMember: {
        id: updatedRows.rows[0].id,
        name: updatedRows.rows[0].name,
        email: updatedRows.rows[0].email,
        phone: updatedRows.rows[0].phone,
        role: updatedRows.rows[0].role,
        isActive: updatedRows.rows[0].is_active,
        deactivatedUntil: updatedRows.rows[0].deactivated_until,
        createdAt: updatedRows.rows[0].created_at,
      },
    });
  } catch (error) {
    return next(error);
  }
  }
);

router.get(
  '/admin/platform-users',
  requireAuth,
  requirePermission('manage_users'),
  async (req, res, next) => {
  try {
    const rows = await pool.query(
      `
        SELECT
          u.id,
          u.name,
          u.email,
          u.phone,
          u.role,
          u.is_main_admin,
          u.is_active,
          u.deactivated_until,
          u.created_at,
          COALESCE(sess.active_sessions, 0)::INT AS active_sessions
        FROM users u
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::INT AS active_sessions
          FROM user_sessions s
          WHERE s.user_id = u.id
            AND s.revoked_at IS NULL
        ) sess ON TRUE
        ORDER BY is_main_admin DESC, role ASC, created_at DESC
      `
    );

    return res.json({
      users: rows.rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        role: row.role,
        isMainAdmin: row.is_main_admin,
        isActive: row.is_active,
        deactivatedUntil: row.deactivated_until,
        activeSessions: row.active_sessions,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    return next(error);
  }
  }
);

router.patch(
  '/admin/platform-users/:id',
  requireAuth,
  requireMainAdmin,
  requirePermission('suspend_user'),
  async (req, res, next) => {
  try {
    const userIdInput = parseRouteEntityId(req.params.id);
    const userIdFilter = buildDualIdFilter(userIdInput, {
      idColumn: 'id',
      uuidColumn: 'uuid_id',
      parameterIndex: 1,
    });
    if (!userIdFilter) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const payload = platformUserStatusSchema.parse(req.body);

    const currentRows = await pool.query(
      `SELECT id, role, is_main_admin FROM users WHERE ${userIdFilter.clause} LIMIT 1`,
      userIdFilter.values
    );

    if (currentRows.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const target = currentRows.rows[0];
    const userId = Number(target.id);
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'You cannot change your own active status.' });
    }

    if (target.is_main_admin && payload.isActive === false) {
      return res.status(400).json({ error: 'Main admin cannot be deactivated.' });
    }

    const updatedRows = await pool.query(
      `
        UPDATE users
        SET is_active = $1,
            deactivated_until = CASE
              WHEN $1 = TRUE THEN NULL
              ELSE NOW() + INTERVAL '3 days'
            END
        WHERE id = $2
        RETURNING id, name, email, phone, role, is_main_admin, is_active, deactivated_until, created_at
      `,
      [payload.isActive, userId]
    );

    if (!payload.isActive) {
      await pool.query(
        `
          UPDATE user_sessions
          SET revoked_at = NOW(),
              revoked_by_user_id = $1
          WHERE user_id = $2
            AND revoked_at IS NULL
        `,
        [req.user.id, userId]
      );
    }

    await writeActivityLog({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      actionKey: payload.isActive ? 'account_activated' : 'account_suspended',
      entityType: 'user',
      entityId: userId,
      requestReference: null,
      metadata: {
        role: updatedRows.rows[0].role,
        isMainAdmin: updatedRows.rows[0].is_main_admin,
        deactivatedUntil: updatedRows.rows[0].deactivated_until,
      },
    });

    return res.json({
      message: payload.isActive ? 'User activated' : 'User temporarily deactivated for 3 days',
      user: {
        id: updatedRows.rows[0].id,
        name: updatedRows.rows[0].name,
        email: updatedRows.rows[0].email,
        phone: updatedRows.rows[0].phone,
        role: updatedRows.rows[0].role,
        isMainAdmin: updatedRows.rows[0].is_main_admin,
        isActive: updatedRows.rows[0].is_active,
        deactivatedUntil: updatedRows.rows[0].deactivated_until,
        createdAt: updatedRows.rows[0].created_at,
      },
    });
  } catch (error) {
    return next(error);
  }
  }
);

router.post(
  '/admin/platform-users/:id/revoke-sessions',
  requireAuth,
  requireMainAdmin,
  requirePermission('revoke_sessions'),
  async (req, res, next) => {
  try {
    const userIdInput = parseRouteEntityId(req.params.id);
    const userIdFilter = buildDualIdFilter(userIdInput, {
      idColumn: 'id',
      uuidColumn: 'uuid_id',
      parameterIndex: 1,
    });
    if (!userIdFilter) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const existsRows = await pool.query(
      `SELECT id FROM users WHERE ${userIdFilter.clause} LIMIT 1`,
      userIdFilter.values
    );
    if (existsRows.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const userId = Number(existsRows.rows[0].id);

    const result = await pool.query(
      `
        UPDATE user_sessions
        SET revoked_at = NOW(),
            revoked_by_user_id = $1
        WHERE user_id = $2
          AND revoked_at IS NULL
      `,
      [req.user.id, userId]
    );

    await writeActivityLog({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      actionKey: 'sessions_revoked',
      entityType: 'user',
      entityId: userId,
      requestReference: null,
      metadata: {
        revokedCount: result.rowCount,
      },
    });

    return res.json({
      message: 'Active sessions revoked',
      revokedCount: result.rowCount,
    });
  } catch (error) {
    return next(error);
  }
  }
);

router.post(
  '/main/promote-team/:id',
  requireAuth,
  requireMainAdmin,
  requirePermission('manage_team'),
  async (req, res, next) => {
    const userIdInput = parseRouteEntityId(req.params.id);
    const userIdFilter = buildDualIdFilter(userIdInput, {
      idColumn: 'id',
      uuidColumn: 'uuid_id',
      parameterIndex: 1,
    });
    if (!userIdFilter) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    let payload;
    try {
      payload = promoteTeamMemberSchema.parse(req.body);
    } catch (error) {
      return next(error);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const targetRows = await client.query(
        `
          SELECT id, name, email, role, is_main_admin
          FROM users
          WHERE ${userIdFilter.clause}
          LIMIT 1
          FOR UPDATE
        `,
        userIdFilter.values
      );

      if (targetRows.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'User not found' });
      }

      const target = targetRows.rows[0];
      const userId = Number(target.id);
      if (target.is_main_admin) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Main admin cannot be promoted.' });
      }

      if (target.role === 'admin') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'User is already an admin.' });
      }

      if (target.role !== 'team_member') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Only team members can be promoted to admin.' });
      }

      const adminCountRows = await client.query(
        `
          SELECT COUNT(*)::INT AS admin_count
          FROM users
          WHERE role = 'admin'
            AND is_main_admin = FALSE
        `
      );

      if (Number(adminCountRows.rows[0].admin_count || 0) >= 2) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Admin limit reached (2 of 2).' });
      }

      const updatedRows = await client.query(
        `
          UPDATE users
          SET role = 'admin',
              is_active = TRUE
          WHERE id = $1
          RETURNING id, name, email, role, is_main_admin, is_active
        `,
        [userId]
      );

      await client.query(
        `
          INSERT INTO activity_logs (
            actor_user_id,
            actor_role,
            action_key,
            entity_type,
            entity_id,
            ip_address,
            metadata
          )
          VALUES ($1, $2, 'team_member_promoted_to_admin', 'user', $3, $4, $5::jsonb)
        `,
        [
          req.user.id,
          req.user.role,
          userId,
          normalizeIpAddress(req.ip || req.socket?.remoteAddress),
          JSON.stringify({
            note: payload.note || '',
            targetEmail: updatedRows.rows[0].email,
          }),
        ]
      );

      await client.query('COMMIT');
      return res.json({
        message: 'Team member promoted to admin',
        user: {
          id: updatedRows.rows[0].id,
          name: updatedRows.rows[0].name,
          email: updatedRows.rows[0].email,
          role: updatedRows.rows[0].role,
          isMainAdmin: updatedRows.rows[0].is_main_admin,
          isActive: updatedRows.rows[0].is_active,
        },
      });
    } catch (error) {
      await client.query('ROLLBACK');
      return next(error);
    } finally {
      client.release();
    }
  }
);

router.post(
  '/main/accounts/:id/reset-password',
  requireAuth,
  requireMainAdmin,
  requirePermission('manage_users'),
  async (req, res, next) => {
    const userIdInput = parseRouteEntityId(req.params.id);
    const userIdFilter = buildDualIdFilter(userIdInput, {
      idColumn: 'id',
      uuidColumn: 'uuid_id',
      parameterIndex: 1,
    });
    if (!userIdFilter) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    let payload;
    try {
      payload = resetPasswordSchema.parse(req.body);
    } catch (error) {
      return next(error);
    }

    try {
      const userRows = await pool.query(
        `SELECT id, name, email, role, is_main_admin FROM users WHERE ${userIdFilter.clause} LIMIT 1`,
        userIdFilter.values
      );
      if (userRows.rowCount === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      const userId = Number(userRows.rows[0].id);

      if (payload.newPassword) {
        const passwordPolicyError = getPasswordPolicyError(payload.newPassword, {
          minLength: passwordMinLengthForAccount({
            role: userRows.rows[0].role,
            isMainAdmin: Boolean(userRows.rows[0].is_main_admin),
          }),
        });
        if (passwordPolicyError) {
          return res.status(400).json({ error: passwordPolicyError });
        }
      }

      const nextPassword =
        payload.newPassword || `Temp!${crypto.randomBytes(8).toString('hex')}Aa1`;
      const passwordHash = await bcrypt.hash(nextPassword, 12);

      await pool.query(
        `
          UPDATE users
          SET password_hash = $1,
              force_password_reset = TRUE
          WHERE id = $2
        `,
        [passwordHash, userId]
      );

      await pool.query(
        `
          UPDATE user_sessions
          SET revoked_at = NOW(),
              revoked_by_user_id = $1
          WHERE user_id = $2
            AND revoked_at IS NULL
        `,
        [req.user.id, userId]
      );

      await writeActivityLog({
        actorUserId: req.user.id,
        actorRole: req.user.role,
        actionKey: 'password_reset',
        entityType: 'user',
        entityId: userId,
        requestReference: null,
        metadata: {
          targetEmail: userRows.rows[0].email,
        },
      });

      return res.json({
        message: 'Password reset successfully',
        user: {
          id: userRows.rows[0].id,
          name: userRows.rows[0].name,
          email: userRows.rows[0].email,
        },
        temporaryPassword: nextPassword,
        forcePasswordReset: true,
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.post(
  '/main/system/emergency-control',
  requireAuth,
  requireMainAdmin,
  requirePermission('modify_platform_flags', 'revoke_sessions'),
  async (req, res, next) => {
    let payload;
    try {
      payload = emergencyControlSchema.parse(req.body || {});
    } catch (error) {
      return next(error);
    }

    try {
      let disabledAdmins = 0;
      let disabledTeamMembers = 0;
      let revokedSessions = 0;

      if (payload.disableAdmins) {
        const result = await pool.query(
          `
            UPDATE users
            SET is_active = FALSE
            WHERE role = 'admin'
              AND is_main_admin = FALSE
              AND is_active = TRUE
          `
        );
        disabledAdmins = result.rowCount;
      }

      if (payload.disableTeam) {
        const result = await pool.query(
          `
            UPDATE users
            SET is_active = FALSE
            WHERE role = 'team_member'
              AND is_active = TRUE
          `
        );
        disabledTeamMembers = result.rowCount;
      }

      if (payload.revokeAllSessions) {
        const result = await pool.query(
          `
            UPDATE user_sessions
            SET revoked_at = NOW(),
                revoked_by_user_id = $1
            WHERE revoked_at IS NULL
              AND user_id <> $1
          `,
          [req.user.id]
        );
        revokedSessions = result.rowCount;
      }

      await writeActivityLog({
        actorUserId: req.user.id,
        actorRole: req.user.role,
        actionKey: 'emergency_control_executed',
        entityType: 'system',
        entityId: null,
        requestReference: null,
        metadata: {
          disableAdmins: payload.disableAdmins,
          disableTeam: payload.disableTeam,
          revokeAllSessions: payload.revokeAllSessions,
          disabledAdmins,
          disabledTeamMembers,
          revokedSessions,
        },
      });

      return res.json({
        message: 'Emergency control action completed',
        summary: {
          disabledAdmins,
          disabledTeamMembers,
          revokedSessions,
        },
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.get(
  '/main/activity-log',
  requireAuth,
  requireMainAdmin,
  requirePermission('access_audit_logs'),
  async (req, res, next) => {
    try {
      const requestedLimit = Number(req.query.limit || 100);
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(requestedLimit, 10), 500)
        : 100;

      const rows = await pool.query(
        `
          SELECT
            a.id,
            a.actor_user_id,
            a.actor_role,
            a.action_key,
            a.entity_type,
            a.entity_id,
            a.request_reference,
            a.metadata,
            a.created_at,
            u.name AS actor_name,
            u.email AS actor_email
          FROM activity_logs a
          LEFT JOIN users u
            ON u.id = a.actor_user_id
          ORDER BY a.created_at DESC
          LIMIT $1
        `,
        [limit]
      );

      return res.json({
        entries: rows.rows.map((row) => ({
          id: row.id,
          actorUserId: row.actor_user_id,
          actorName: row.actor_name,
          actorEmail: row.actor_email,
          actorRole: row.actor_role,
          actionKey: row.action_key,
          entityType: row.entity_type,
          entityId: row.entity_id,
          requestReference: row.request_reference,
          metadata: row.metadata,
          createdAt: row.created_at,
        })),
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.post('/careers/apply', async (req, res, next) => {
  try {
    const payload = careerApplySchema.parse(req.body);
    const normalizedPhone = normalizePhone(payload.phone);
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    const email = payload.email.toLowerCase();
    const normalizedAadhaar =
      payload.position === 'admin' ? normalizeAadhaar(payload.aadhaarNumber || '') : null;
    const normalizedPan =
      payload.position === 'admin' ? normalizePan(payload.panNumber || '') : null;
    const securityAnswerOneHash = hashSecurityAnswer(payload.securityAnswerOne);
    const securityAnswerTwoHash = hashSecurityAnswer(payload.securityAnswerTwo);
    const accountPasswordHash = await bcrypt.hash(payload.password, 12);
    const registrationNumber = await generateUniqueRegistrationNumber();

    const createdRows = await pool.query(
      `
        INSERT INTO career_applications (
          reference_id,
          full_name,
          phone,
          email,
          city,
          position,
          registration_number,
          security_question_one,
          security_answer_one_hash,
          security_question_two,
          security_answer_two_hash,
          aadhaar_number,
          pan_number,
          team_specialization,
          team_preferred_shift,
          experience,
          why_hire,
          account_password_hash,
          status
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, 'Pending'
        )
        RETURNING *
      `,
      [
        generateReferenceId('CAR'),
        payload.fullName,
        normalizedPhone,
        email,
        payload.city,
        payload.position,
        registrationNumber,
        payload.securityQuestionOne,
        securityAnswerOneHash,
        payload.securityQuestionTwo,
        securityAnswerTwoHash,
        normalizedAadhaar,
        normalizedPan,
        payload.position === 'team_member' ? payload.teamSpecialization : null,
        payload.position === 'team_member' ? payload.teamPreferredShift : null,
        payload.experience || null,
        payload.whyHireYou,
        accountPasswordHash,
      ]
    );

    const application = createdRows.rows[0];
    await pool.query(
      `
        INSERT INTO career_application_status_history (
          career_application_id,
          changed_by_user_id,
          previous_status,
          next_status,
          note
        )
        VALUES ($1, NULL, NULL, 'Pending', 'Career application submitted')
      `,
      [application.id]
    );
    await writeActivityLog({
      actorUserId: null,
      actorRole: 'public',
      actionKey: 'career_application_submitted',
      entityType: 'career_application',
      entityId: application.id,
      requestReference: application.reference_id,
      metadata: {
        position: application.position,
        email: application.email,
      },
    });

    return res.status(201).json({
      message: 'Application submitted successfully',
      referenceId: application.reference_id,
      registrationNumber: application.registration_number,
      status: application.status,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/careers/availability', async (req, res, next) => {
  try {
    const [adminRows, teamRows] = await Promise.all([
      pool.query(
        `
          SELECT COUNT(*)::INT AS used
          FROM users
          WHERE role = 'admin'
            AND is_main_admin = FALSE
            AND is_active = TRUE
        `
      ),
      pool.query(
        `
          SELECT COUNT(*)::INT AS used
          FROM users
          WHERE role = 'team_member'
            AND is_active = TRUE
        `
      ),
    ]);

    const adminUsed = Number(adminRows.rows[0].used || 0);
    const teamUsed = Number(teamRows.rows[0].used || 0);
    const adminMax = 2;
    const teamMax = 5;

    return res.json({
      adminSeats: {
        used: adminUsed,
        max: adminMax,
        available: Math.max(adminMax - adminUsed, 0),
        isFull: adminUsed >= adminMax,
      },
      teamSeats: {
        used: teamUsed,
        max: teamMax,
        available: Math.max(teamMax - teamUsed, 0),
        isFull: teamUsed >= teamMax,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get(
  '/main/career-applications',
  requireAuth,
  requireMainAdmin,
  requirePermission('manage_users'),
  async (req, res, next) => {
    try {
      const statusFilter = req.query.status;
      const where = [];
      const params = [];

      if (typeof statusFilter === 'string' && ['Pending', 'Approved', 'Rejected', 'Auto-Rejected'].includes(statusFilter)) {
        params.push(statusFilter);
        where.push(`status = $${params.length}`);
      }

      const rows = await pool.query(
        `
          SELECT *
          FROM career_applications
          ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY created_at DESC
        `,
        params
      );

      const adminSeatsRows = await pool.query(
        `
          SELECT COUNT(*)::INT AS used
          FROM users
          WHERE role = 'admin'
            AND is_main_admin = FALSE
        `
      );

      return res.json({
        adminSeats: {
          used: Number(adminSeatsRows.rows[0].used || 0),
          max: 2,
        },
        applications: rows.rows.map((row) => ({
          id: row.id,
          referenceId: row.reference_id,
          fullName: row.full_name,
          phone: row.phone,
          email: row.email,
          city: row.city,
          position: row.position,
          registrationNumber: row.registration_number,
          securityQuestionOne: row.security_question_one,
          securityQuestionTwo: row.security_question_two,
          aadhaarMasked: maskAadhaar(row.aadhaar_number),
          panMasked: maskPan(row.pan_number),
          teamSpecialization: row.team_specialization,
          teamPreferredShift: row.team_preferred_shift,
          experience: row.experience,
          whyHire: row.why_hire,
          status: row.status,
          reviewNote: row.review_note,
          reviewedByUserId: row.reviewed_by_user_id,
          reviewedAt: row.reviewed_at,
          createdAccountUserId: row.created_account_user_id,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.patch(
  '/main/career-applications/:id/review',
  requireAuth,
  requireMainAdmin,
  requirePermission('manage_users'),
  async (req, res, next) => {
    const applicationIdInput = parseRouteEntityId(req.params.id);
    const applicationIdFilter = buildDualIdFilter(applicationIdInput, {
      idColumn: 'id',
      uuidColumn: 'uuid_id',
      parameterIndex: 1,
    });
    if (!applicationIdFilter) {
      return res.status(400).json({ error: 'Invalid application id' });
    }

    let payload;
    try {
      payload = careerReviewSchema.parse(req.body);
    } catch (error) {
      return next(error);
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const appRows = await client.query(
        `SELECT * FROM career_applications WHERE ${applicationIdFilter.clause} FOR UPDATE`,
        applicationIdFilter.values
      );

      if (appRows.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Career application not found' });
      }

      const application = appRows.rows[0];
      const applicationId = Number(application.id);
      if (application.status !== 'Pending') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Application has already been reviewed' });
      }

      const note = payload.note || '';

      if (
        payload.decision === 'approve' &&
        application.position === 'admin' &&
        (!normalizeAadhaar(application.aadhaar_number || '') ||
          !normalizePan(application.pan_number || ''))
      ) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'Admin applications require valid Aadhaar and PAN details before approval.',
        });
      }

      if (
        payload.decision === 'approve' &&
        application.position === 'team_member' &&
        (!application.team_specialization || !application.team_preferred_shift)
      ) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'Team applications require specialization and preferred shift before approval.',
        });
      }

      if (payload.decision === 'reject') {
        await client.query(
          `
            UPDATE career_applications
            SET status = 'Rejected',
                review_note = $1,
                reviewed_by_user_id = $2,
                reviewed_at = NOW()
            WHERE id = $3
          `,
          [note, req.user.id, applicationId]
        );

        await client.query(
          `
            INSERT INTO career_application_status_history (
              career_application_id,
              changed_by_user_id,
              previous_status,
              next_status,
              note
            )
            VALUES ($1, $2, $3, 'Rejected', $4)
          `,
          [applicationId, req.user.id, application.status, note || 'Rejected by main admin']
        );

        await client.query('COMMIT');
        await writeActivityLog({
          actorUserId: req.user.id,
          actorRole: req.user.role,
          actionKey: 'career_application_rejected',
          entityType: 'career_application',
          entityId: applicationId,
          requestReference: application.reference_id,
          metadata: {
            decision: 'reject',
            note: note || '',
          },
        });
        return res.json({
          message: 'Application rejected',
          status: 'Rejected',
        });
      }

      if (application.position === 'admin') {
        const adminCountRows = await client.query(
          `
            SELECT COUNT(*)::INT AS admin_count
            FROM users
            WHERE role = 'admin'
              AND is_main_admin = FALSE
              AND is_active = TRUE
          `
        );

        if (Number(adminCountRows.rows[0].admin_count || 0) >= 2) {
          const autoRejectNote =
            note || 'Auto-rejected: admin account cap reached (2 of 2 already active).';

          await client.query(
            `
              UPDATE career_applications
              SET status = 'Auto-Rejected',
                  review_note = $1,
                  reviewed_by_user_id = $2,
                  reviewed_at = NOW()
              WHERE id = $3
            `,
            [autoRejectNote, req.user.id, applicationId]
          );

          await client.query(
            `
              INSERT INTO career_application_status_history (
                career_application_id,
                changed_by_user_id,
                previous_status,
                next_status,
                note
              )
              VALUES ($1, $2, $3, 'Auto-Rejected', $4)
            `,
            [applicationId, req.user.id, application.status, autoRejectNote]
          );

          await client.query('COMMIT');
          await writeActivityLog({
            actorUserId: req.user.id,
            actorRole: req.user.role,
            actionKey: 'career_application_auto_rejected',
            entityType: 'career_application',
            entityId: applicationId,
            requestReference: application.reference_id,
            metadata: {
              reason: autoRejectNote,
            },
          });
          return res.json({
            message: 'Application auto-rejected because admin limit is already full',
            status: 'Auto-Rejected',
          });
        }
      }

      if (application.position === 'team_member') {
        const teamCountRows = await client.query(
          `
            SELECT COUNT(*)::INT AS team_count
            FROM users
            WHERE role = 'team_member'
              AND is_active = TRUE
          `
        );

        if (Number(teamCountRows.rows[0].team_count || 0) >= 5) {
          const autoRejectNote = note || 'Auto-rejected: team member cap reached (5 of 5 already active).';

          await client.query(
            `
              UPDATE career_applications
              SET status = 'Auto-Rejected',
                  review_note = $1,
                  reviewed_by_user_id = $2,
                  reviewed_at = NOW()
              WHERE id = $3
            `,
            [autoRejectNote, req.user.id, applicationId]
          );

          await client.query(
            `
              INSERT INTO career_application_status_history (
                career_application_id,
                changed_by_user_id,
                previous_status,
                next_status,
                note
              )
              VALUES ($1, $2, $3, 'Auto-Rejected', $4)
            `,
            [applicationId, req.user.id, application.status, autoRejectNote]
          );

          await client.query('COMMIT');
          await writeActivityLog({
            actorUserId: req.user.id,
            actorRole: req.user.role,
            actionKey: 'career_application_auto_rejected',
            entityType: 'career_application',
            entityId: applicationId,
            requestReference: application.reference_id,
            metadata: {
              reason: autoRejectNote,
            },
          });

          return res.json({
            message: 'Application auto-rejected because team member limit is already full',
            status: 'Auto-Rejected',
          });
        }
      }

      const email = application.email.toLowerCase();
      const existingUserRows = await client.query(
        'SELECT id FROM users WHERE email = $1 LIMIT 1',
        [email]
      );

      if (existingUserRows.rowCount > 0) {
        const duplicateNote =
          note || 'Rejected: an account with this email already exists.';

        await client.query(
          `
            UPDATE career_applications
            SET status = 'Rejected',
                review_note = $1,
                reviewed_by_user_id = $2,
                reviewed_at = NOW()
            WHERE id = $3
          `,
          [duplicateNote, req.user.id, applicationId]
        );

        await client.query(
          `
            INSERT INTO career_application_status_history (
              career_application_id,
              changed_by_user_id,
              previous_status,
              next_status,
              note
            )
            VALUES ($1, $2, $3, 'Rejected', $4)
          `,
          [applicationId, req.user.id, application.status, duplicateNote]
        );

        await client.query('COMMIT');
        await writeActivityLog({
          actorUserId: req.user.id,
          actorRole: req.user.role,
          actionKey: 'career_application_rejected',
          entityType: 'career_application',
          entityId: applicationId,
          requestReference: application.reference_id,
          metadata: {
            reason: duplicateNote,
          },
        });
        return res.json({
          message: 'Application rejected because email already exists',
          status: 'Rejected',
        });
      }

      let passwordHash = String(application.account_password_hash || '').trim();
      let temporaryPassword = '';
      if (!passwordHash) {
        temporaryPassword = `Zdt!${crypto.randomBytes(6).toString('hex')}`;
        passwordHash = await bcrypt.hash(temporaryPassword, 12);
      }
      const forcePasswordReset = Boolean(temporaryPassword);

      const createdUserRows = await client.query(
        `
          INSERT INTO users (
            name,
            email,
            password_hash,
            phone,
            role,
            is_main_admin,
            is_active,
            force_password_reset
          )
          VALUES ($1, $2, $3, $4, $5, FALSE, TRUE, $6)
          RETURNING id, role, email, name
        `,
        [
          application.full_name,
          email,
          passwordHash,
          application.phone,
          application.position,
          forcePasswordReset,
        ]
      );

      await client.query(
        `
          UPDATE career_applications
          SET status = 'Approved',
              review_note = $1,
              reviewed_by_user_id = $2,
              reviewed_at = NOW(),
              created_account_user_id = $3
          WHERE id = $4
        `,
        [note, req.user.id, createdUserRows.rows[0].id, applicationId]
      );

      await client.query(
        `
          INSERT INTO career_application_status_history (
            career_application_id,
            changed_by_user_id,
            previous_status,
            next_status,
            note
          )
          VALUES ($1, $2, $3, 'Approved', $4)
        `,
        [applicationId, req.user.id, application.status, note || 'Approved by main admin']
      );

      await client.query('COMMIT');
      await writeActivityLog({
        actorUserId: req.user.id,
        actorRole: req.user.role,
        actionKey: 'career_application_approved',
        entityType: 'career_application',
        entityId: applicationId,
        requestReference: application.reference_id,
        metadata: {
          createdUserId: createdUserRows.rows[0].id,
          createdRole: createdUserRows.rows[0].role,
        },
      });

      return res.json({
        message: temporaryPassword
          ? 'Application approved and account created with temporary password'
          : 'Application approved and account created',
        status: 'Approved',
        account: {
          id: createdUserRows.rows[0].id,
          name: createdUserRows.rows[0].name,
          email: createdUserRows.rows[0].email,
          role: createdUserRows.rows[0].role,
          ...(temporaryPassword ? { temporaryPassword } : {}),
          forcePasswordReset,
        },
      });
    } catch (error) {
      await client.query('ROLLBACK');
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P0001') {
        return res.status(409).json({
          error: typeof error.message === 'string' ? error.message : 'Role limit reached.',
        });
      }
      return next(error);
    } finally {
      client.release();
    }
  }
);

export default router;

