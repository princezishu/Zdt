import crypto from 'crypto';

const GROUP_DISCOUNT_TYPES = ['NONE', 'FLAT_DISCOUNT', 'PERCENT_DISCOUNT', 'CONFIRM_LATER'];
const AUTO_NOTE_PREFIX = '[AUTO-LISTING]';

function toPositiveIntOrFallback(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  if (normalized <= 0) return fallback;
  return normalized;
}

function toPositiveNumberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeStateCode(value) {
  const raw = normalizeSpace(value).toUpperCase();
  if (!raw) return 'NA';
  if (/^[A-Z]{2,3}$/.test(raw)) return raw;

  const words = raw.split(/[\s-]+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.slice(0, 3);
  }
  return raw.slice(0, 2);
}

function inferUnitTypeFromProperty(propertyType, bedrooms) {
  const type = normalizeSpace(propertyType).toLowerCase();
  if (/(plot|land|plotted)/.test(type)) return 'PLOT';
  if (/(shop|office|commercial|warehouse|retail)/.test(type)) return 'SHOP';
  if (Number(bedrooms || 0) >= 3) return '3BHK';
  return '2BHK';
}

async function generateUniqueDealCode(db, prefix = 'GD-AUTO') {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = `${prefix}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const existing = await db.query(
      `
        SELECT 1
        FROM group_deals
        WHERE deal_code = $1
        LIMIT 1
      `,
      [code]
    );
    if (existing.rowCount === 0) return code;
  }
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

function normalizeDiscountType(rawValue) {
  const normalized = normalizeSpace(rawValue).toUpperCase();
  if (GROUP_DISCOUNT_TYPES.includes(normalized)) return normalized;
  return 'NONE';
}

function normalizeGroupDealNote(value) {
  return String(value || '').trim().slice(0, 500);
}

export function normalizeListingGroupDealConfig(input = {}, fallback = {}) {
  const inventoryFallback = toPositiveIntOrFallback(fallback.groupInventoryCount, 1);
  const groupInventoryCount = toPositiveIntOrFallback(
    input.groupInventoryCount ?? fallback.groupInventoryCount,
    inventoryFallback
  );
  const groupDealEnabled = groupInventoryCount > 1;

  const minBuyersFallback = toPositiveIntOrFallback(fallback.groupDealMinBuyers, 2);
  const groupDealMinBuyers = Math.max(
    2,
    toPositiveIntOrFallback(input.groupDealMinBuyers ?? fallback.groupDealMinBuyers, minBuyersFallback)
  );

  let groupDealMaxBuyers =
    input.groupDealMaxBuyers === null
      ? null
      : toPositiveIntOrFallback(
          input.groupDealMaxBuyers ?? fallback.groupDealMaxBuyers,
          groupInventoryCount
        );
  if (groupDealMaxBuyers !== null && groupDealMaxBuyers < groupDealMinBuyers) {
    groupDealMaxBuyers = groupDealMinBuyers;
  }

  let groupDiscountType = normalizeDiscountType(input.groupDiscountType ?? fallback.groupDiscountType);
  let groupDiscountValue = toPositiveNumberOrNull(
    input.groupDiscountValue ?? fallback.groupDiscountValue
  );

  if (groupDiscountType === 'PERCENT_DISCOUNT' && groupDiscountValue !== null) {
    groupDiscountValue = Math.min(groupDiscountValue, 100);
  }
  if (
    (groupDiscountType === 'FLAT_DISCOUNT' || groupDiscountType === 'PERCENT_DISCOUNT') &&
    groupDiscountValue === null
  ) {
    groupDiscountType = 'CONFIRM_LATER';
  }

  return {
    groupDealEnabled,
    groupInventoryCount,
    groupDealMinBuyers,
    groupDealMaxBuyers,
    groupDiscountType,
    groupDiscountValue,
    groupDealNote: normalizeGroupDealNote(input.groupDealNote ?? fallback.groupDealNote),
  };
}

export function extractGroupDealConfigFromLayout(layoutDetails) {
  const base =
    layoutDetails && typeof layoutDetails === 'object' && !Array.isArray(layoutDetails)
      ? layoutDetails
      : {};
  const rawGroupDeal =
    base.groupDeal && typeof base.groupDeal === 'object' && !Array.isArray(base.groupDeal)
      ? base.groupDeal
      : {};
  return normalizeListingGroupDealConfig(rawGroupDeal);
}

export function mergeLayoutDetailsWithGroupDeal(layoutDetails, groupDealConfig) {
  const base =
    layoutDetails && typeof layoutDetails === 'object' && !Array.isArray(layoutDetails)
      ? { ...layoutDetails }
      : {};

  base.groupDeal = {
    groupDealEnabled: Boolean(groupDealConfig.groupDealEnabled),
    groupInventoryCount: toPositiveIntOrFallback(groupDealConfig.groupInventoryCount, 1),
    groupDealMinBuyers: Math.max(2, toPositiveIntOrFallback(groupDealConfig.groupDealMinBuyers, 2)),
    groupDealMaxBuyers:
      groupDealConfig.groupDealMaxBuyers === null
        ? null
        : toPositiveIntOrFallback(groupDealConfig.groupDealMaxBuyers, 2),
    groupDiscountType: normalizeDiscountType(groupDealConfig.groupDiscountType),
    groupDiscountValue: toPositiveNumberOrNull(groupDealConfig.groupDiscountValue),
    groupDealNote: normalizeGroupDealNote(groupDealConfig.groupDealNote),
  };

  return base;
}

function resolveAutoDealType(groupDealConfig) {
  const candidate = normalizeDiscountType(groupDealConfig.groupDiscountType);
  if (candidate === 'NONE') return 'CONFIRM_LATER';
  if (
    (candidate === 'FLAT_DISCOUNT' || candidate === 'PERCENT_DISCOUNT') &&
    toPositiveNumberOrNull(groupDealConfig.groupDiscountValue) === null
  ) {
    return 'CONFIRM_LATER';
  }
  return candidate;
}

function buildAutoDealNote(groupDealConfig) {
  const suffix = normalizeGroupDealNote(groupDealConfig.groupDealNote);
  if (!suffix) {
    return `${AUTO_NOTE_PREFIX} Auto-created from listing inventory > 1.`;
  }
  return `${AUTO_NOTE_PREFIX} ${suffix}`;
}

export async function syncAutoGroupDealForProperty(db, input) {
  const listingType = normalizeSpace(input.listingType).toLowerCase() || 'sale';
  const groupDealConfig = normalizeListingGroupDealConfig(input.groupDealConfig || {});
  const isEnabled = listingType === 'sale' && groupDealConfig.groupDealEnabled;
  const propertyId = Number(input.propertyId || 0);
  if (!Number.isFinite(propertyId) || propertyId <= 0) {
    return { ok: false, reason: 'invalid_property_id' };
  }

  const existingResult = await db.query(
    `
      SELECT *
      FROM group_deals
      WHERE property_id = $1
        AND notes ILIKE $2
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [propertyId, `${AUTO_NOTE_PREFIX}%`]
  );
  const existing = existingResult.rows[0] || null;

  if (!isEnabled) {
    if (
      existing &&
      ['ACTIVE', 'PAUSED', 'EXPIRED', 'CANCELLED'].includes(String(existing.status || '').toUpperCase()) &&
      Number(existing.joined_buyers_count || 0) === 0
    ) {
      await db.query(
        `
          UPDATE group_deals
          SET status = 'PAUSED',
              notes = $1,
              updated_at = NOW()
          WHERE id = $2
        `,
        [`${AUTO_NOTE_PREFIX} Paused because listing group inventory <= 1.`, Number(existing.id)]
      );
      return { ok: true, action: 'paused', dealCode: existing.deal_code };
    }
    return { ok: true, action: 'skipped' };
  }

  const dealType = resolveAutoDealType(groupDealConfig);
  let discountValue = toPositiveNumberOrNull(groupDealConfig.groupDiscountValue);
  if (dealType === 'CONFIRM_LATER') {
    discountValue = null;
  } else if (dealType === 'PERCENT_DISCOUNT' && discountValue !== null) {
    discountValue = Math.min(discountValue, 100);
  }

  const minBuyers = Math.max(2, toPositiveIntOrFallback(groupDealConfig.groupDealMinBuyers, 2));
  let maxBuyers =
    groupDealConfig.groupDealMaxBuyers === null
      ? toPositiveIntOrFallback(groupDealConfig.groupInventoryCount, minBuyers)
      : toPositiveIntOrFallback(groupDealConfig.groupDealMaxBuyers, minBuyers);
  if (maxBuyers < minBuyers) maxBuyers = minBuyers;

  const stateName = normalizeSpace(input.state) || 'Unknown';
  const cityName = normalizeSpace(input.city) || 'Unknown';
  const projectName = normalizeSpace(input.title) || `Property ${propertyId}`;
  const builderName = normalizeSpace(input.builderName) || 'Seller';
  const builderVerified = Boolean(input.builderVerified);
  const basePrice = toPositiveNumberOrNull(input.basePrice);
  const unitType = inferUnitTypeFromProperty(input.propertyType, input.bedrooms);
  const stateCode = normalizeStateCode(stateName);
  const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const notes = buildAutoDealNote(groupDealConfig);

  if (existing) {
    const existingStatus = String(existing.status || '').toUpperCase();
    const joinedBuyers = Number(existing.joined_buyers_count || 0);
    const lockedStatuses = ['MIN_REACHED', 'CONFIRMED', 'FULL'];
    if (lockedStatuses.includes(existingStatus) && joinedBuyers > 0) {
      return { ok: true, action: 'locked', dealCode: existing.deal_code };
    }

    await db.query(
      `
        UPDATE group_deals
        SET
          project_name = $1,
          builder_name = $2,
          builder_verified = $3,
          state_code = $4,
          state_name = $5,
          city_name = $6,
          unit_type = $7,
          base_price = $8,
          deal_type = $9,
          discount_value = $10,
          min_buyers = $11,
          max_buyers = $12,
          valid_until = $13,
          status = 'ACTIVE',
          notes = $14,
          updated_at = NOW()
        WHERE id = $15
      `,
      [
        projectName,
        builderName,
        builderVerified,
        stateCode,
        stateName,
        cityName,
        unitType,
        basePrice,
        dealType,
        discountValue,
        minBuyers,
        maxBuyers,
        validUntil,
        notes,
        Number(existing.id),
      ]
    );

    return { ok: true, action: 'updated', dealCode: existing.deal_code };
  }

  const dealCode = await generateUniqueDealCode(db);
  await db.query(
    `
      INSERT INTO group_deals (
        deal_code,
        property_id,
        project_name,
        builder_name,
        builder_verified,
        state_code,
        state_name,
        city_name,
        unit_type,
        base_price,
        deal_type,
        discount_value,
        min_buyers,
        max_buyers,
        joined_buyers_count,
        valid_until,
        status,
        notes
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14, 0, $15, 'ACTIVE', $16
      )
    `,
    [
      dealCode,
      propertyId,
      projectName,
      builderName,
      builderVerified,
      stateCode,
      stateName,
      cityName,
      unitType,
      basePrice,
      dealType,
      discountValue,
      minBuyers,
      maxBuyers,
      validUntil,
      notes,
    ]
  );

  return { ok: true, action: 'created', dealCode };
}
