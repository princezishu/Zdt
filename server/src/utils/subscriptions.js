import { pool } from '../db.js';

const PLAN_TIER_PRIORITY = {
  free: 0,
  pro: 1,
  premium: 2,
  enterprise: 3,
};

const FEATURE_KEY_ALIASES = {
  listing_quota: ['listing_quota'],
  boost_listing: ['boost_listing'],
  analytics_access: ['analytics_access', 'analyticsAccess'],
  crm_access: ['crm_access', 'crmTools'],
  verified_eligibility: ['verified_eligibility', 'verifiedBadgeEligible'],
};

const LEGACY_ANALYTICS_ENABLED_VALUES = new Set(['standard', 'full', 'advanced']);
const LEGACY_ANALYTICS_DISABLED_VALUES = new Set(['basic', 'disabled', 'none']);
const BOOLEAN_TRUE_VALUES = new Set(['true', '1', 'enabled', 'yes']);
const BOOLEAN_FALSE_VALUES = new Set(['false', '0', 'disabled', 'no']);

function toObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value;
}

function normalizeSubscriptionFeatureKey(featureKey) {
  const normalized = String(featureKey || '').trim();
  if (!normalized) {
    return '';
  }

  const lower = normalized.toLowerCase();
  if (lower === 'listing_quota') {
    return 'listing_quota';
  }
  if (lower === 'boost_listing') {
    return 'boost_listing';
  }
  if (lower === 'analytics_access' || lower === 'analyticsaccess') {
    return 'analytics_access';
  }
  if (lower === 'crm_access' || lower === 'crmtools') {
    return 'crm_access';
  }
  if (lower === 'verified_eligibility' || lower === 'verifiedbadgeeligible') {
    return 'verified_eligibility';
  }

  return normalized;
}

function parseNumericValue(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function parseBooleanLike(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value > 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    if (BOOLEAN_TRUE_VALUES.has(normalized)) {
      return true;
    }
    if (BOOLEAN_FALSE_VALUES.has(normalized)) {
      return false;
    }
  }

  return null;
}

function normalizeFeatureOverrideValue(featureKey, rawValue) {
  const normalizedFeatureKey = normalizeSubscriptionFeatureKey(featureKey);
  if (!normalizedFeatureKey) {
    return rawValue;
  }

  if (normalizedFeatureKey === 'analytics_access' && typeof rawValue === 'string') {
    const normalized = rawValue.trim().toLowerCase();
    if (LEGACY_ANALYTICS_ENABLED_VALUES.has(normalized)) {
      return true;
    }
    if (LEGACY_ANALYTICS_DISABLED_VALUES.has(normalized)) {
      return false;
    }
  }

  if (normalizedFeatureKey === 'listing_quota' || normalizedFeatureKey === 'boost_listing') {
    const numericValue = parseNumericValue(rawValue);
    if (numericValue !== null) {
      return numericValue;
    }
  }

  const booleanValue = parseBooleanLike(rawValue);
  if (booleanValue !== null) {
    return booleanValue;
  }

  return rawValue;
}

export function normalizeSubscriptionFeatures(rawFeatures) {
  const source = toObject(rawFeatures);
  const normalized = {};

  Object.entries(source).forEach(([rawKey, rawValue]) => {
    const featureKey = normalizeSubscriptionFeatureKey(rawKey);
    if (!featureKey) {
      return;
    }
    normalized[featureKey] = normalizeFeatureOverrideValue(featureKey, rawValue);
  });

  return normalized;
}

function normalizeFeatureValue(isEnabled, limitValue) {
  if (!isEnabled) {
    return false;
  }
  if (limitValue === null || limitValue === undefined) {
    return true;
  }
  const normalized = Number(limitValue);
  return Number.isFinite(normalized) ? normalized : true;
}

function mapPlanRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  const baseRow = rows[0];
  const features = {};

  rows.forEach((row) => {
    if (!row.feature_key) {
      return;
    }
    features[row.feature_key] = normalizeFeatureValue(row.is_enabled, row.limit_value);
  });

  return {
    planId: baseRow.plan_id,
    planName: baseRow.plan_name,
    tier: baseRow.tier,
    monthlyPrice: Number(baseRow.monthly_price || 0),
    yearlyPrice: Number(baseRow.yearly_price || 0),
    listingQuota: Number(
      rows.find((row) => row.feature_key === 'listing_quota')?.limit_value || 0
    ),
    boostCredits: Number(
      rows.find((row) => row.feature_key === 'boost_listing')?.limit_value || 0
    ),
    features,
  };
}

function sortPlans(a, b) {
  const tierDelta =
    (PLAN_TIER_PRIORITY[a.tier] ?? Number.MAX_SAFE_INTEGER) -
    (PLAN_TIER_PRIORITY[b.tier] ?? Number.MAX_SAFE_INTEGER);
  if (tierDelta !== 0) {
    return tierDelta;
  }
  return a.monthlyPrice - b.monthlyPrice || a.planName.localeCompare(b.planName);
}

async function fetchPlanRowsByLookup(db, lookupValue, { lookupField = 'name_or_tier' } = {}) {
  if (!lookupValue) {
    return [];
  }

  let whereClause = 'LOWER(sp.plan_name) = LOWER($1) OR LOWER(sp.tier) = LOWER($1) OR LOWER(sp.plan_id) = LOWER($1)';
  if (lookupField === 'plan_id') {
    whereClause = 'sp.plan_id = $1';
  } else if (lookupField === 'tier') {
    whereClause = 'LOWER(sp.tier) = LOWER($1)';
  }

  const rows = await db.query(
    `
      SELECT
        sp.plan_id,
        sp.plan_name,
        sp.tier,
        sp.monthly_price,
        sp.yearly_price,
        pf.feature_key,
        pf.is_enabled,
        pf.limit_value
      FROM subscription_plans sp
      LEFT JOIN plan_features pf
        ON pf.plan_id = sp.plan_id
      WHERE sp.is_active = TRUE
        AND (${whereClause})
      ORDER BY sp.monthly_price ASC, pf.feature_key ASC
    `,
    [lookupValue]
  );

  return rows.rows;
}

export function createSubscriptionError(
  message,
  { status = 403, code = 'subscription_error', metadata = {} } = {}
) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.metadata = metadata;
  return error;
}

export async function listActiveSubscriptionPlans(db = pool) {
  const rows = await db.query(
    `
      SELECT
        sp.plan_id,
        sp.plan_name,
        sp.tier,
        sp.monthly_price,
        sp.yearly_price,
        pf.feature_key,
        pf.is_enabled,
        pf.limit_value
      FROM subscription_plans sp
      LEFT JOIN plan_features pf
        ON pf.plan_id = sp.plan_id
      WHERE sp.is_active = TRUE
      ORDER BY sp.monthly_price ASC, pf.feature_key ASC
    `
  );

  const grouped = new Map();
  rows.rows.forEach((row) => {
    const bucket = grouped.get(row.plan_id) || [];
    bucket.push(row);
    grouped.set(row.plan_id, bucket);
  });

  return Array.from(grouped.values())
    .map((planRows) => mapPlanRows(planRows))
    .filter(Boolean)
    .sort(sortPlans);
}

export async function getSubscriptionPlanByLookup(db = pool, lookupValue) {
  const planRows = await fetchPlanRowsByLookup(db, lookupValue);
  return mapPlanRows(planRows);
}

export async function getSubscriptionPlanById(db = pool, planId) {
  const planRows = await fetchPlanRowsByLookup(db, planId, { lookupField: 'plan_id' });
  return mapPlanRows(planRows);
}

export async function getSubscriptionPlanByTier(db = pool, tier) {
  const planRows = await fetchPlanRowsByLookup(db, tier, { lookupField: 'tier' });
  return mapPlanRows(planRows);
}

export async function getCurrentSubscription(db = pool, userId, { allowFallbackPlan = false } = {}) {
  const rows = await db.query(
    `
      SELECT
        s.id,
        s.plan_id,
        s.subscription_tier,
        s.start_date,
        s.end_date,
        s.features_json,
        s.listing_quota,
        s.boost_credits,
        sp.plan_name,
        sp.monthly_price,
        sp.yearly_price
      FROM subscriptions s
      LEFT JOIN subscription_plans sp
        ON sp.plan_id = s.plan_id
      WHERE s.user_id = $1
        AND s.is_active = TRUE
        AND (s.end_date IS NULL OR s.end_date >= CURRENT_DATE)
      ORDER BY s.updated_at DESC, s.created_at DESC
      LIMIT 1
    `,
    [userId]
  );

  if (rows.rowCount === 0) {
    if (!allowFallbackPlan) {
      return null;
    }

    const userRows = await db.query(
      'SELECT subscription_tier FROM users WHERE id = $1 LIMIT 1',
      [userId]
    );
    const userTier = userRows.rows[0]?.subscription_tier || 'free';
    const fallbackPlan =
      (await getSubscriptionPlanByTier(db, userTier)) ||
      (await getSubscriptionPlanById(db, 'free_plan'));

    if (!fallbackPlan) {
      return null;
    }

    return {
      id: null,
      planId: fallbackPlan.planId,
      planName: fallbackPlan.planName,
      tier: fallbackPlan.tier,
      subscriptionTier: fallbackPlan.tier,
      startDate: null,
      endDate: null,
      features: { ...fallbackPlan.features },
      listingQuota: fallbackPlan.listingQuota,
      boostCredits: fallbackPlan.boostCredits,
      monthlyPrice: fallbackPlan.monthlyPrice,
      yearlyPrice: fallbackPlan.yearlyPrice,
      isFallback: true,
    };
  }

  const row = rows.rows[0];
  const plan = row.plan_id ? await getSubscriptionPlanById(db, row.plan_id) : null;
  const featureOverrides = normalizeSubscriptionFeatures(row.features_json);

  return {
    id: Number(row.id),
    planId: row.plan_id || plan?.planId || null,
    planName: row.plan_name || plan?.planName || row.subscription_tier || 'Free',
    tier: row.subscription_tier || plan?.tier || 'free',
    subscriptionTier: row.subscription_tier || plan?.tier || 'free',
    startDate: row.start_date || null,
    endDate: row.end_date || null,
    features: {
      ...(plan?.features || {}),
      ...featureOverrides,
    },
    listingQuota: Number(row.listing_quota ?? plan?.listingQuota ?? 0),
    boostCredits: Number(row.boost_credits ?? plan?.boostCredits ?? 0),
    monthlyPrice: Number(row.monthly_price ?? plan?.monthlyPrice ?? 0),
    yearlyPrice: Number(row.yearly_price ?? plan?.yearlyPrice ?? 0),
    isFallback: false,
  };
}

export function getSubscriptionFeatureValue(features, featureKey) {
  const normalizedFeatureKey = normalizeSubscriptionFeatureKey(featureKey);
  if (!normalizedFeatureKey) {
    return null;
  }

  const featureObject = toObject(features);
  if (Object.prototype.hasOwnProperty.call(featureObject, normalizedFeatureKey)) {
    return normalizeFeatureOverrideValue(normalizedFeatureKey, featureObject[normalizedFeatureKey]);
  }

  const aliasKeys = FEATURE_KEY_ALIASES[normalizedFeatureKey] || [normalizedFeatureKey];
  for (const aliasKey of aliasKeys) {
    if (Object.prototype.hasOwnProperty.call(featureObject, aliasKey)) {
      return normalizeFeatureOverrideValue(normalizedFeatureKey, featureObject[aliasKey]);
    }
  }

  return null;
}

export function toFeatureEnabled(featureKey, value) {
  const normalizedFeatureKey = normalizeSubscriptionFeatureKey(featureKey);
  if (!normalizedFeatureKey) {
    return null;
  }

  if (normalizedFeatureKey === 'analytics_access' && typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (LEGACY_ANALYTICS_ENABLED_VALUES.has(normalized)) {
      return true;
    }
    if (LEGACY_ANALYTICS_DISABLED_VALUES.has(normalized)) {
      return false;
    }
  }

  const booleanValue = parseBooleanLike(value);
  if (booleanValue !== null) {
    return booleanValue;
  }

  return null;
}

export function resolveSubscriptionFeatureAccess(subscription, featureKey) {
  const normalizedFeatureKey = normalizeSubscriptionFeatureKey(featureKey);
  if (!normalizedFeatureKey) {
    return {
      featureKey: '',
      enabled: false,
      limitValue: null,
      planId: subscription?.planId || null,
      subscriptionTier: subscription?.subscriptionTier || 'free',
    };
  }

  let limitValue = null;
  let enabled = false;
  const features = toObject(subscription?.features);

  if (normalizedFeatureKey === 'listing_quota') {
    limitValue = Number(subscription?.listingQuota || 0);
    enabled = limitValue > 0;
  } else if (normalizedFeatureKey === 'boost_listing') {
    const rawValue = getSubscriptionFeatureValue(features, normalizedFeatureKey);
    limitValue = Number(subscription?.boostCredits || 0);
    enabled = Boolean(toFeatureEnabled(normalizedFeatureKey, rawValue));
  } else {
    const rawValue = getSubscriptionFeatureValue(features, normalizedFeatureKey);
    enabled = Boolean(toFeatureEnabled(normalizedFeatureKey, rawValue));
    const numericValue = parseNumericValue(rawValue);
    limitValue = numericValue;
  }

  return {
    featureKey: normalizedFeatureKey,
    enabled,
    limitValue,
    planId: subscription?.planId || null,
    subscriptionTier: subscription?.subscriptionTier || 'free',
  };
}

export async function getOwnedListingUsage(db = pool, userId) {
  const rows = await db.query(
    `
      SELECT
        (SELECT COUNT(*)::INT FROM properties WHERE posted_by = $1) AS property_count,
        (SELECT COUNT(*)::INT FROM rentals WHERE posted_by = $1) AS rental_count
    `,
    [userId]
  );

  const row = rows.rows[0] || {};
  const properties = Number(row.property_count || 0);
  const rentals = Number(row.rental_count || 0);

  return {
    properties,
    rentals,
    total: properties + rentals,
  };
}

function buildOwnerAccessMessage(featureKey, { subscription, enabled, limitValue, usageTotal = 0 } = {}) {
  const planName = subscription?.planName || 'current';

  if (featureKey === 'crm_access') {
    return enabled
      ? `${planName} includes CRM lead management.`
      : 'Upgrade to Pro or above to unlock CRM lead management.';
  }

  if (featureKey === 'analytics_access') {
    return enabled
      ? `${planName} includes analytics dashboard access.`
      : 'Upgrade to Pro or above to unlock analytics dashboards.';
  }

  if (featureKey === 'verified_eligibility') {
    return enabled
      ? `${planName} includes verified badge eligibility review.`
      : 'Upgrade to Premium or above to become eligible for verified badge review.';
  }

  if (featureKey === 'boost_listing') {
    if (!enabled) {
      return 'Upgrade to Pro or above to unlock listing boosts.';
    }
    if (Number(limitValue || 0) <= 0) {
      return 'All boost credits are used for the current subscription.';
    }
    return `${Number(limitValue || 0)} boost credits available in your active plan.`;
  }

  if (featureKey === 'listing_quota') {
    const limit = Number(limitValue || 0);
    if (limit <= 0) {
      return 'Your current plan does not allow listing publishing.';
    }
    if (usageTotal >= limit) {
      return `Listing quota reached. Your ${planName} plan allows ${limit} active listings.`;
    }
    return `${Math.max(0, limit - usageTotal)} of ${limit} active listing slots are available.`;
  }

  return enabled ? `${planName} includes this feature.` : 'Upgrade your plan to unlock this feature.';
}

export async function getOwnerSubscriptionAccess(
  db = pool,
  userId,
  { subscription: providedSubscription = null, usage: providedUsage = null } = {}
) {
  const [currentSubscription, usage] = await Promise.all([
    providedSubscription || getCurrentSubscription(db, userId, { allowFallbackPlan: true }),
    providedUsage || getOwnedListingUsage(db, userId),
  ]);

  const listingQuotaFeature = resolveSubscriptionFeatureAccess(currentSubscription, 'listing_quota');
  const boostFeature = resolveSubscriptionFeatureAccess(currentSubscription, 'boost_listing');
  const crmFeature = resolveSubscriptionFeatureAccess(currentSubscription, 'crm_access');
  const analyticsFeature = resolveSubscriptionFeatureAccess(currentSubscription, 'analytics_access');
  const verifiedEligibilityFeature = resolveSubscriptionFeatureAccess(
    currentSubscription,
    'verified_eligibility'
  );

  const listingLimit = Number(listingQuotaFeature.limitValue || 0);
  const listingUsed = Number(usage?.total || 0);
  const listingRemaining = listingLimit > 0 ? Math.max(0, listingLimit - listingUsed) : 0;
  const boostCredits = boostFeature.enabled ? Number(currentSubscription?.boostCredits || 0) : 0;

  return {
    currentSubscription,
    usage,
    access: {
      crm: {
        enabled: crmFeature.enabled,
        featureKey: 'crm_access',
        message: buildOwnerAccessMessage('crm_access', {
          subscription: currentSubscription,
          enabled: crmFeature.enabled,
        }),
      },
      analytics: {
        enabled: analyticsFeature.enabled,
        featureKey: 'analytics_access',
        message: buildOwnerAccessMessage('analytics_access', {
          subscription: currentSubscription,
          enabled: analyticsFeature.enabled,
        }),
      },
      boosts: {
        enabled: boostFeature.enabled,
        featureKey: 'boost_listing',
        remainingCredits: boostCredits,
        message: buildOwnerAccessMessage('boost_listing', {
          subscription: currentSubscription,
          enabled: boostFeature.enabled,
          limitValue: boostCredits,
        }),
      },
      verifiedEligibility: {
        enabled: verifiedEligibilityFeature.enabled,
        featureKey: 'verified_eligibility',
        message: buildOwnerAccessMessage('verified_eligibility', {
          subscription: currentSubscription,
          enabled: verifiedEligibilityFeature.enabled,
        }),
      },
      listingQuota: {
        limit: listingLimit,
        used: listingUsed,
        remaining: listingRemaining,
        canCreate: listingLimit > 0 && listingUsed < listingLimit,
        message: buildOwnerAccessMessage('listing_quota', {
          subscription: currentSubscription,
          enabled: listingQuotaFeature.enabled,
          limitValue: listingLimit,
          usageTotal: listingUsed,
        }),
      },
    },
  };
}

export async function assertListingQuotaAvailable(db = pool, userId) {
  const { currentSubscription: subscription, usage, access } = await getOwnerSubscriptionAccess(db, userId);

  if (access.listingQuota.limit <= 0) {
    throw createSubscriptionError(access.listingQuota.message, {
      code: 'listing_quota_unavailable',
      metadata: {
        planId: subscription?.planId || null,
        subscriptionTier: subscription?.subscriptionTier || 'free',
        listingQuota: access.listingQuota.limit,
        activeListings: usage.total,
      },
    });
  }

  if (!access.listingQuota.canCreate) {
    throw createSubscriptionError(
      access.listingQuota.message,
      {
        code: 'listing_quota_reached',
        metadata: {
          planId: subscription?.planId || null,
          subscriptionTier: subscription?.subscriptionTier || 'free',
          listingQuota: access.listingQuota.limit,
          activeListings: usage.total,
        },
      }
    );
  }

  return {
    subscription,
    usage,
    listingQuota: access.listingQuota.limit,
    remainingListings: access.listingQuota.remaining,
  };
}
