import crypto from 'crypto';

const DEFAULT_TRANSACTION_LIMIT = 40;
const REFERRAL_CODE_MAX_LENGTH = 24;
const DEFAULT_RESERVATION_TTL_HOURS = 24;
const MAX_REWARDED_REFERRALS_PER_DEVICE = 1;
const MAX_REWARDED_REFERRALS_PER_IP = 3;

export const DALAL_COIN_RULES = Object.freeze({
  coinName: 'Dalal Coin',
  code: 'DC',
  expiryMonths: 6,
  signupBonus: 10,
  referralBonusForReferrer: 30,
  referralBonusForNewUser: 10,
  firstPurchaseBonus: 30,
  usage: {
    property: {
      coinValueInr: 1,
      maxDiscountPercent: 10,
    },
    subscription: {
      coinValueInr: 2,
      maxDiscountPercent: 40,
    },
    ecommerce: {
      coinValueInr: 1,
      maxDiscountPercent: 10,
    },
  },
  cashback: {
    subscriptionPercent: 2,
    propertyPercent: 5,
    ecommercePercent: 5,
  },
  tiers: [
    { key: 'silver', lifetimeEarnedThreshold: 0, successfulReferralThreshold: 0 },
    { key: 'gold', lifetimeEarnedThreshold: 150, successfulReferralThreshold: 3 },
    { key: 'platinum', lifetimeEarnedThreshold: 500, successfulReferralThreshold: 8 },
  ],
});

function createDalalCoinError(status, message, code = '', metadata = undefined) {
  const error = new Error(message);
  error.status = status;
  if (code) {
    error.code = code;
  }
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    error.metadata = metadata;
  }
  return error;
}

function toSafeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toWholeCoins(value) {
  return Math.max(0, Math.floor(toNumber(value)));
}

function roundCurrency(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
}

function normalizeShortText(value, maxLength = 120) {
  return String(value || '').trim().slice(0, maxLength);
}

export function normalizeReferralCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, REFERRAL_CODE_MAX_LENGTH);
}

function addMonths(date, months) {
  const normalized = new Date(date);
  normalized.setMonth(normalized.getMonth() + months);
  return normalized;
}

function buildReferralCodeSeed(seedText) {
  const cleaned = String(seedText || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
  return cleaned || 'DALAL';
}

function buildReferralCode(seedText, userId) {
  const base = buildReferralCodeSeed(seedText);
  const userSegment = `U${Math.max(1, Number(userId) || 0)}`.slice(0, 6);
  const randomSegment = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${base}${userSegment}${randomSegment}`.slice(0, REFERRAL_CODE_MAX_LENGTH);
}

function buildRewardRulesResponse() {
  return {
    coinName: DALAL_COIN_RULES.coinName,
    coinCode: DALAL_COIN_RULES.code,
    expiryMonths: DALAL_COIN_RULES.expiryMonths,
    signupBonus: DALAL_COIN_RULES.signupBonus,
    referralBonusForReferrer: DALAL_COIN_RULES.referralBonusForReferrer,
    referralBonusForNewUser: DALAL_COIN_RULES.referralBonusForNewUser,
    firstPurchaseBonus: DALAL_COIN_RULES.firstPurchaseBonus,
    cashback: DALAL_COIN_RULES.cashback,
    usage: DALAL_COIN_RULES.usage,
    tiers: DALAL_COIN_RULES.tiers,
  };
}

function resolveTier({ lifetimeEarned, successfulReferrals }) {
  const normalizedLifetimeEarned = toWholeCoins(lifetimeEarned);
  const normalizedSuccessfulReferrals = toWholeCoins(successfulReferrals);

  if (
    normalizedLifetimeEarned >= DALAL_COIN_RULES.tiers[2].lifetimeEarnedThreshold
    || normalizedSuccessfulReferrals >= DALAL_COIN_RULES.tiers[2].successfulReferralThreshold
  ) {
    return 'platinum';
  }

  if (
    normalizedLifetimeEarned >= DALAL_COIN_RULES.tiers[1].lifetimeEarnedThreshold
    || normalizedSuccessfulReferrals >= DALAL_COIN_RULES.tiers[1].successfulReferralThreshold
  ) {
    return 'gold';
  }

  return 'silver';
}

function tierLabel(tierKey) {
  if (tierKey === 'platinum') return 'Platinum';
  if (tierKey === 'gold') return 'Gold';
  return 'Silver';
}

function normalizeReferenceId(referenceId) {
  return normalizeShortText(referenceId, 120);
}

function normalizeContextId(contextId) {
  return normalizeShortText(contextId, 120);
}

function calculateEcommerceDiscountPercent(baseAmount) {
  const normalizedBaseAmount = toNumber(baseAmount);
  if (normalizedBaseAmount <= 0) {
    return 10;
  }
  return DALAL_COIN_RULES.usage.ecommerce.maxDiscountPercent;
}

function resolveUsageRules(kind, baseAmount) {
  if (kind === 'subscription') {
    return {
      coinValueInr: DALAL_COIN_RULES.usage.subscription.coinValueInr,
      maxDiscountPercent: DALAL_COIN_RULES.usage.subscription.maxDiscountPercent,
      discountBand: 'Subscription saver',
    };
  }

  if (kind === 'property') {
    return {
      coinValueInr: DALAL_COIN_RULES.usage.property.coinValueInr,
      maxDiscountPercent: DALAL_COIN_RULES.usage.property.maxDiscountPercent,
      discountBand: 'Property booster',
    };
  }

  return {
    coinValueInr: DALAL_COIN_RULES.usage.ecommerce.coinValueInr,
    maxDiscountPercent: calculateEcommerceDiscountPercent(baseAmount),
    discountBand: 'E-commerce accelerator',
  };
}

function calculateCashbackCoins({ orderKind, netAmount }) {
  const normalizedNetAmount = toNumber(netAmount);
  if (normalizedNetAmount <= 0) {
    return 0;
  }

  if (orderKind === 'subscription') {
    return Math.max(
      0,
      Math.floor(
        (normalizedNetAmount * (DALAL_COIN_RULES.cashback.subscriptionPercent / 100))
        / DALAL_COIN_RULES.usage.subscription.coinValueInr
      )
    );
  }

  if (orderKind === 'property') {
    return Math.max(1, Math.floor(normalizedNetAmount * (DALAL_COIN_RULES.cashback.propertyPercent / 100)));
  }

  return Math.max(
    0,
    Math.floor(normalizedNetAmount * (DALAL_COIN_RULES.cashback.ecommercePercent / 100))
  );
}

function mapCampaignRow(row) {
  return {
    id: Number(row.id),
    campaignCode: row.campaign_code,
    title: row.title,
    description: row.description || '',
    rewardMultiplier: toNumber(row.reward_multiplier) || 1,
    extraBonusCoins: toWholeCoins(row.extra_bonus_coins),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isActive: Boolean(row.is_active),
  };
}

async function listActiveCampaigns(db) {
  const rows = await db.query(
    `
      SELECT
        id,
        campaign_code,
        title,
        description,
        reward_multiplier,
        extra_bonus_coins,
        starts_at,
        ends_at,
        is_active
      FROM dalal_coin_campaigns
      WHERE is_active = TRUE
        AND starts_at <= NOW()
        AND (ends_at IS NULL OR ends_at >= NOW())
      ORDER BY reward_multiplier DESC, extra_bonus_coins DESC, starts_at ASC
    `
  );

  return rows.rows.map(mapCampaignRow);
}

async function resolveCampaignAdjustedReward(db, baseCoins) {
  const normalizedBaseCoins = toWholeCoins(baseCoins);
  if (normalizedBaseCoins <= 0) {
    return {
      finalCoins: 0,
      activeCampaigns: [],
    };
  }

  const activeCampaigns = await listActiveCampaigns(db);
  if (activeCampaigns.length === 0) {
    return {
      finalCoins: normalizedBaseCoins,
      activeCampaigns,
    };
  }

  const highestMultiplier = Math.max(
    1,
    ...activeCampaigns.map((campaign) => toNumber(campaign.rewardMultiplier) || 1)
  );
  const highestBonus = Math.max(
    0,
    ...activeCampaigns.map((campaign) => toWholeCoins(campaign.extraBonusCoins))
  );

  return {
    finalCoins: Math.max(normalizedBaseCoins, Math.floor(normalizedBaseCoins * highestMultiplier) + highestBonus),
    activeCampaigns,
  };
}

async function getLifetimeEarned(db, userId) {
  const rows = await db.query(
    `
      SELECT COALESCE(SUM(amount), 0)::INT AS total
      FROM dalal_coin_transactions
      WHERE user_id = $1
        AND type = 'credit'
    `,
    [userId]
  );
  return toWholeCoins(rows.rows[0]?.total);
}

async function getSuccessfulReferralCount(db, userId) {
  const rows = await db.query(
    `
      SELECT COUNT(*)::INT AS total
      FROM dalal_coin_referrals
      WHERE referrer_user_id = $1
        AND status = 'completed'
    `,
    [userId]
  );
  return toWholeCoins(rows.rows[0]?.total);
}

async function refreshDalalCoinTier(db, userId) {
  const [lifetimeEarned, successfulReferrals] = await Promise.all([
    getLifetimeEarned(db, userId),
    getSuccessfulReferralCount(db, userId),
  ]);

  const nextTier = resolveTier({
    lifetimeEarned,
    successfulReferrals,
  });

  await db.query(
    `
      UPDATE users
      SET dalal_coin_tier = $2
      WHERE id = $1
    `,
    [userId, nextTier]
  );

  return {
    tier: nextTier,
    lifetimeEarned,
    successfulReferrals,
  };
}

export async function ensureUserReferralCode(db, userId, { seedText = '' } = {}) {
  const existingRows = await db.query(
    `
      SELECT referral_code
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [userId]
  );

  if (existingRows.rowCount === 0) {
    throw createDalalCoinError(404, 'User not found.', 'dalal_coin_user_not_found');
  }

  const existingCode = normalizeReferralCode(existingRows.rows[0]?.referral_code);
  if (existingCode) {
    return existingCode;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const referralCode = buildReferralCode(seedText, userId);
    let updatedRows;
    try {
      updatedRows = await db.query(
        `
          UPDATE users
          SET referral_code = $2
          WHERE id = $1
            AND (referral_code IS NULL OR referral_code = '')
          RETURNING referral_code
        `,
        [userId, referralCode]
      );
    } catch (error) {
      if (error?.code === '23505') {
        continue;
      }
      throw error;
    }

    if (updatedRows.rowCount > 0) {
      return normalizeReferralCode(updatedRows.rows[0]?.referral_code);
    }

    const checkRows = await db.query(
      `
        SELECT referral_code
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [userId]
    );
    const currentCode = normalizeReferralCode(checkRows.rows[0]?.referral_code);
    if (currentCode) {
      return currentCode;
    }
  }

  throw createDalalCoinError(500, 'Unable to generate referral code.', 'dalal_coin_referral_code_failed');
}

export async function findUserByReferralCode(db, referralCode) {
  const normalizedCode = normalizeReferralCode(referralCode);
  if (!normalizedCode) {
    return null;
  }

  const rows = await db.query(
    `
      SELECT
        id,
        name,
        email,
        referral_code
      FROM users
      WHERE referral_code = $1
      LIMIT 1
    `,
    [normalizedCode]
  );

  if (rows.rowCount === 0) {
    return null;
  }

  return {
    id: Number(rows.rows[0].id),
    name: rows.rows[0].name,
    email: rows.rows[0].email,
    referralCode: rows.rows[0].referral_code,
  };
}

export async function releaseExpiredDalalCoinReservations(db, userId = null) {
  const values = [];
  const filters = [
    `status = 'active'`,
    `expires_at <= NOW()`,
  ];

  if (userId !== null && userId !== undefined) {
    values.push(userId);
    filters.push(`user_id = $${values.length}`);
  }

  const rows = await db.query(
    `
      UPDATE dalal_coin_reservations
      SET status = 'expired',
          released_at = COALESCE(released_at, NOW())
      WHERE ${filters.join(' AND ')}
      RETURNING id
    `,
    values
  );

  return {
    expiredReservationCount: rows.rowCount,
  };
}

export async function getReservedDalalCoins(db, userId, { excludeReservationId = null } = {}) {
  const values = [userId];
  const filters = [
    `user_id = $1`,
    `status = 'active'`,
    `expires_at > NOW()`,
  ];

  if (excludeReservationId !== null && excludeReservationId !== undefined) {
    values.push(excludeReservationId);
    filters.push(`id <> $${values.length}`);
  }

  const rows = await db.query(
    `
      SELECT COALESCE(SUM(amount), 0)::INT AS total
      FROM dalal_coin_reservations
      WHERE ${filters.join(' AND ')}
    `,
    values
  );

  return toWholeCoins(rows.rows[0]?.total);
}

export async function expireDalalCoins(db, userId) {
  const expiredCredits = await db.query(
    `
      SELECT id, remaining_amount
      FROM dalal_coin_transactions
      WHERE user_id = $1
        AND type = 'credit'
        AND remaining_amount > 0
        AND expires_at IS NOT NULL
        AND expires_at <= NOW()
      ORDER BY expires_at ASC, created_at ASC
      FOR UPDATE
    `,
    [userId]
  );

  if (expiredCredits.rowCount === 0) {
    return {
      expiredCoins: 0,
    };
  }

  const expiredCoins = expiredCredits.rows.reduce(
    (sum, row) => sum + toWholeCoins(row.remaining_amount),
    0
  );

  await db.query(
    `
      UPDATE dalal_coin_transactions
      SET remaining_amount = 0
      WHERE id = ANY($1::BIGINT[])
    `,
    [expiredCredits.rows.map((row) => Number(row.id))]
  );

  await db.query(
    `
      INSERT INTO dalal_coin_transactions (
        user_id,
        amount,
        remaining_amount,
        type,
        reason,
        reference_type,
        reference_id,
        metadata
      )
      VALUES (
        $1,
        $2,
        0,
        'debit',
        'coin_expiry',
        'expiry',
        '',
        $3::jsonb
      )
    `,
    [
      userId,
      expiredCoins,
      JSON.stringify({
        expiredCreditIds: expiredCredits.rows.map((row) => Number(row.id)),
      }),
    ]
  );

  await db.query(
    `
      UPDATE users
      SET dalal_coins = GREATEST(COALESCE(dalal_coins, 0) - $2, 0)
      WHERE id = $1
    `,
    [userId, expiredCoins]
  );

  return {
    expiredCoins,
  };
}

export function previewDalalCoinUsage({
  kind,
  baseAmount,
  requestedCoins,
  availableCoins,
  reservedCoins,
}) {
  const normalizedKind = String(kind || '').trim().toLowerCase();
  if (!['property', 'subscription', 'ecommerce'].includes(normalizedKind)) {
    throw createDalalCoinError(400, 'Unsupported Dalal Coin usage type.', 'dalal_coin_preview_kind_invalid');
  }

  const normalizedBaseAmount = roundCurrency(baseAmount);
  if (normalizedBaseAmount <= 0) {
    throw createDalalCoinError(400, 'Base amount must be greater than zero.', 'dalal_coin_preview_amount_invalid');
  }

  const rules = resolveUsageRules(normalizedKind, normalizedBaseAmount);
  const normalizedAvailableCoins = toWholeCoins(availableCoins);
  const normalizedReservedCoins = toWholeCoins(reservedCoins);
  const spendableCoins = Math.max(0, normalizedAvailableCoins - normalizedReservedCoins);
  const maxDiscountValue = roundCurrency((normalizedBaseAmount * rules.maxDiscountPercent) / 100);
  const maxCoinsAllowed = Math.max(0, Math.floor(maxDiscountValue / rules.coinValueInr));
  const requestedCoinsProvided = requestedCoins !== null && requestedCoins !== undefined && requestedCoins !== '';
  const normalizedRequestedCoins = requestedCoinsProvided
    ? toWholeCoins(requestedCoins)
    : maxCoinsAllowed;
  const coinsApplied = Math.min(normalizedRequestedCoins, maxCoinsAllowed, spendableCoins);
  const discountValue = roundCurrency(coinsApplied * rules.coinValueInr);
  const finalAmount = roundCurrency(Math.max(0, normalizedBaseAmount - discountValue));
  const effectiveDiscountPercent =
    normalizedBaseAmount > 0
      ? roundCurrency((discountValue / normalizedBaseAmount) * 100)
      : 0;

  return {
    kind: normalizedKind,
    baseAmount: normalizedBaseAmount,
    availableCoins: normalizedAvailableCoins,
    reservedCoins: normalizedReservedCoins,
    spendableCoins,
    requestedCoins: normalizedRequestedCoins,
    coinsApplied,
    coinValueInr: rules.coinValueInr,
    maxDiscountPercent: rules.maxDiscountPercent,
    maxDiscountValue,
    maxCoinsAllowed,
    discountValue,
    finalAmount,
    effectiveDiscountPercent,
    discountBand: rules.discountBand,
  };
}

export async function getDalalCoinPreviewForUser(
  db,
  userId,
  {
    kind,
    baseAmount,
    requestedCoins = undefined,
    excludeReservationId = null,
  }
) {
  await releaseExpiredDalalCoinReservations(db, userId);
  await expireDalalCoins(db, userId);

  const balanceRows = await db.query(
    `
      SELECT COALESCE(dalal_coins, 0)::INT AS dalal_coins
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [userId]
  );

  if (balanceRows.rowCount === 0) {
    throw createDalalCoinError(404, 'User not found.', 'dalal_coin_user_not_found');
  }

  const availableCoins = toWholeCoins(balanceRows.rows[0]?.dalal_coins);
  const reservedCoins = await getReservedDalalCoins(db, userId, {
    excludeReservationId,
  });

  return previewDalalCoinUsage({
    kind,
    baseAmount,
    requestedCoins,
    availableCoins,
    reservedCoins,
  });
}

export async function creditDalalCoins(
  db,
  {
    userId,
    amount,
    reason,
    referenceType = '',
    referenceId = '',
    expiresAt = addMonths(new Date(), DALAL_COIN_RULES.expiryMonths),
    metadata = {},
  }
) {
  const normalizedAmount = toWholeCoins(amount);
  if (normalizedAmount <= 0) {
    return null;
  }

  const normalizedReason = normalizeShortText(reason, 80) || 'manual_credit';
  const expiresAtValue = expiresAt ? new Date(expiresAt) : null;

  const inserted = await db.query(
    `
      INSERT INTO dalal_coin_transactions (
        user_id,
        amount,
        remaining_amount,
        type,
        reason,
        reference_type,
        reference_id,
        expires_at,
        metadata
      )
      VALUES (
        $1,
        $2,
        $2,
        'credit',
        $3,
        $4,
        $5,
        $6,
        $7::jsonb
      )
      RETURNING *
    `,
    [
      userId,
      normalizedAmount,
      normalizedReason,
      normalizeShortText(referenceType, 40),
      normalizeReferenceId(referenceId),
      expiresAtValue,
      JSON.stringify(toSafeObject(metadata)),
    ]
  );

  await db.query(
    `
      UPDATE users
      SET dalal_coins = COALESCE(dalal_coins, 0) + $2
      WHERE id = $1
    `,
    [userId, normalizedAmount]
  );

  await refreshDalalCoinTier(db, userId);
  return inserted.rows[0] || null;
}

export async function debitDalalCoins(
  db,
  {
    userId,
    amount,
    reason,
    referenceType = '',
    referenceId = '',
    metadata = {},
    allowReservedCoins = false,
  }
) {
  const normalizedAmount = toWholeCoins(amount);
  if (normalizedAmount <= 0) {
    return {
      amount: 0,
      balanceAfter: null,
      transaction: null,
    };
  }

  await expireDalalCoins(db, userId);

  const userRows = await db.query(
    `
      SELECT COALESCE(dalal_coins, 0)::INT AS dalal_coins
      FROM users
      WHERE id = $1
      LIMIT 1
      FOR UPDATE
    `,
    [userId]
  );

  if (userRows.rowCount === 0) {
    throw createDalalCoinError(404, 'User not found.', 'dalal_coin_user_not_found');
  }

  const currentBalance = toWholeCoins(userRows.rows[0]?.dalal_coins);
  const reservedCoins = allowReservedCoins ? 0 : await getReservedDalalCoins(db, userId);
  const spendableCoins = Math.max(0, currentBalance - reservedCoins);

  if (spendableCoins < normalizedAmount) {
    throw createDalalCoinError(409, 'Not enough Dalal Coins available.', 'dalal_coin_insufficient_balance', {
      currentBalance,
      reservedCoins,
      spendableCoins,
      requestedCoins: normalizedAmount,
    });
  }

  const creditRows = await db.query(
    `
      SELECT id, remaining_amount
      FROM dalal_coin_transactions
      WHERE user_id = $1
        AND type = 'credit'
        AND remaining_amount > 0
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY expires_at ASC NULLS LAST, created_at ASC
      FOR UPDATE
    `,
    [userId]
  );

  let coinsLeftToConsume = normalizedAmount;
  const consumedCredits = [];

  for (const row of creditRows.rows) {
    if (coinsLeftToConsume <= 0) {
      break;
    }

    const remainingAmount = toWholeCoins(row.remaining_amount);
    if (remainingAmount <= 0) {
      continue;
    }

    const consumeAmount = Math.min(remainingAmount, coinsLeftToConsume);
    await db.query(
      `
        UPDATE dalal_coin_transactions
        SET remaining_amount = GREATEST(remaining_amount - $2, 0)
        WHERE id = $1
      `,
      [Number(row.id), consumeAmount]
    );

    consumedCredits.push({
      creditTransactionId: Number(row.id),
      amount: consumeAmount,
    });
    coinsLeftToConsume -= consumeAmount;
  }

  if (coinsLeftToConsume > 0) {
    throw createDalalCoinError(409, 'Dalal Coin wallet is out of sync. Please try again.', 'dalal_coin_credit_mismatch');
  }

  const inserted = await db.query(
    `
      INSERT INTO dalal_coin_transactions (
        user_id,
        amount,
        remaining_amount,
        type,
        reason,
        reference_type,
        reference_id,
        metadata
      )
      VALUES (
        $1,
        $2,
        0,
        'debit',
        $3,
        $4,
        $5,
        $6::jsonb
      )
      RETURNING *
    `,
    [
      userId,
      normalizedAmount,
      normalizeShortText(reason, 80) || 'manual_debit',
      normalizeShortText(referenceType, 40),
      normalizeReferenceId(referenceId),
      JSON.stringify({
        ...toSafeObject(metadata),
        consumedCredits,
      }),
    ]
  );

  const updatedRows = await db.query(
    `
      UPDATE users
      SET dalal_coins = GREATEST(COALESCE(dalal_coins, 0) - $2, 0)
      WHERE id = $1
      RETURNING COALESCE(dalal_coins, 0)::INT AS dalal_coins
    `,
    [userId, normalizedAmount]
  );

  return {
    amount: normalizedAmount,
    balanceAfter: toWholeCoins(updatedRows.rows[0]?.dalal_coins),
    transaction: inserted.rows[0] || null,
  };
}

export async function createDalalCoinReservation(
  db,
  {
    userId,
    amount,
    contextType,
    contextId = '',
    metadata = {},
    expiresAt = null,
  }
) {
  const normalizedAmount = toWholeCoins(amount);
  if (normalizedAmount <= 0) {
    return null;
  }

  await releaseExpiredDalalCoinReservations(db, userId);

  const userRows = await db.query(
    `
      SELECT COALESCE(dalal_coins, 0)::INT AS dalal_coins
      FROM users
      WHERE id = $1
      LIMIT 1
      FOR UPDATE
    `,
    [userId]
  );

  if (userRows.rowCount === 0) {
    throw createDalalCoinError(404, 'User not found.', 'dalal_coin_user_not_found');
  }

  const availableCoins = toWholeCoins(userRows.rows[0]?.dalal_coins);
  const reservedCoins = await getReservedDalalCoins(db, userId);
  const spendableCoins = Math.max(0, availableCoins - reservedCoins);

  if (spendableCoins < normalizedAmount) {
    throw createDalalCoinError(409, 'Not enough Dalal Coins available to reserve.', 'dalal_coin_reservation_insufficient', {
      availableCoins,
      reservedCoins,
      spendableCoins,
      requestedCoins: normalizedAmount,
    });
  }

  const expiry = expiresAt instanceof Date && Number.isFinite(expiresAt.getTime())
    ? expiresAt
    : new Date(Date.now() + DEFAULT_RESERVATION_TTL_HOURS * 60 * 60 * 1000);

  const inserted = await db.query(
    `
      INSERT INTO dalal_coin_reservations (
        user_id,
        amount,
        context_type,
        context_id,
        status,
        metadata,
        expires_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        'active',
        $5::jsonb,
        $6
      )
      RETURNING *
    `,
    [
      userId,
      normalizedAmount,
      normalizeShortText(contextType, 40) || 'generic',
      normalizeContextId(contextId),
      JSON.stringify(toSafeObject(metadata)),
      expiry,
    ]
  );

  return inserted.rows[0] || null;
}

export async function releaseDalalCoinReservation(
  db,
  {
    reservationId,
    userId,
  }
) {
  const rows = await db.query(
    `
      UPDATE dalal_coin_reservations
      SET status = 'released',
          released_at = COALESCE(released_at, NOW())
      WHERE id = $1
        AND user_id = $2
        AND status = 'active'
      RETURNING *
    `,
    [reservationId, userId]
  );

  return rows.rows[0] || null;
}

export async function releaseDalalCoinReservationsForContext(
  db,
  {
    userId,
    contextType,
    excludeReservationId = null,
  }
) {
  const values = [userId, normalizeShortText(contextType, 40)];
  const filters = [
    `user_id = $1`,
    `context_type = $2`,
    `status = 'active'`,
  ];

  if (excludeReservationId !== null && excludeReservationId !== undefined) {
    values.push(excludeReservationId);
    filters.push(`id <> $${values.length}`);
  }

  const rows = await db.query(
    `
      UPDATE dalal_coin_reservations
      SET status = 'released',
          released_at = COALESCE(released_at, NOW())
      WHERE ${filters.join(' AND ')}
      RETURNING id
    `,
    values
  );

  return {
    releasedReservationCount: rows.rowCount,
  };
}

export async function consumeDalalCoinReservation(
  db,
  {
    reservationId,
    userId,
    reason,
    referenceType = '',
    referenceId = '',
    metadata = {},
  }
) {
  if (!reservationId) {
    return {
      amount: 0,
      reservation: null,
      transaction: null,
      alreadyConsumed: false,
    };
  }

  await releaseExpiredDalalCoinReservations(db, userId);

  const rows = await db.query(
    `
      SELECT *
      FROM dalal_coin_reservations
      WHERE id = $1
        AND user_id = $2
      LIMIT 1
      FOR UPDATE
    `,
    [reservationId, userId]
  );

  if (rows.rowCount === 0) {
    throw createDalalCoinError(404, 'Dalal Coin reservation not found.', 'dalal_coin_reservation_missing');
  }

  const reservation = rows.rows[0];
  const reservationStatus = String(reservation.status || '').trim().toLowerCase();

  if (reservationStatus === 'consumed') {
    return {
      amount: toWholeCoins(reservation.amount),
      reservation,
      transaction: null,
      alreadyConsumed: true,
    };
  }

  if (reservationStatus !== 'active') {
    throw createDalalCoinError(409, 'Dalal Coin reservation is no longer active.', 'dalal_coin_reservation_inactive');
  }

  if (reservation.expires_at && new Date(reservation.expires_at).getTime() <= Date.now()) {
    await db.query(
      `
        UPDATE dalal_coin_reservations
        SET status = 'expired',
            released_at = COALESCE(released_at, NOW())
        WHERE id = $1
      `,
      [reservationId]
    );
    throw createDalalCoinError(409, 'Dalal Coin reservation has expired.', 'dalal_coin_reservation_expired');
  }

  const debitResult = await debitDalalCoins(db, {
    userId,
    amount: reservation.amount,
    reason,
    referenceType,
    referenceId,
    metadata: {
      ...toSafeObject(metadata),
      reservationId: Number(reservation.id),
      reservationContextType: reservation.context_type || '',
      reservationContextId: reservation.context_id || '',
    },
    allowReservedCoins: true,
  });

  const updatedRows = await db.query(
    `
      UPDATE dalal_coin_reservations
      SET status = 'consumed',
          consumed_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [reservationId]
  );

  return {
    amount: debitResult.amount,
    reservation: updatedRows.rows[0] || reservation,
    transaction: debitResult.transaction,
    alreadyConsumed: false,
  };
}

export async function handleDalalCoinSignup(
  db,
  {
    userId,
    userName = '',
    email = '',
    referralCode = '',
    deviceId = '',
    ipAddress = '',
  }
) {
  const personalReferralCode = await ensureUserReferralCode(db, userId, {
    seedText: `${userName}${email}`,
  });

  const signupReward = await resolveCampaignAdjustedReward(db, DALAL_COIN_RULES.signupBonus);
  await creditDalalCoins(db, {
    userId,
    amount: signupReward.finalCoins,
    reason: 'signup_bonus',
    referenceType: 'auth_signup',
    referenceId: `${userId}`,
    metadata: {
      activeCampaigns: signupReward.activeCampaigns,
    },
  });

  const normalizedIncomingReferralCode = normalizeReferralCode(referralCode);
  if (!normalizedIncomingReferralCode) {
    return {
      referralCode: personalReferralCode,
      referralStatus: null,
      referredByUserId: null,
    };
  }

  const referrer = await findUserByReferralCode(db, normalizedIncomingReferralCode);
  if (!referrer) {
    throw createDalalCoinError(400, 'Referral code is invalid.', 'dalal_coin_referral_invalid');
  }

  if (Number(referrer.id) === Number(userId)) {
    throw createDalalCoinError(400, 'You cannot refer yourself.', 'dalal_coin_referral_self');
  }

  await db.query(
    `
      UPDATE users
      SET referred_by = $2
      WHERE id = $1
    `,
    [userId, referrer.id]
  );

  let referralStatus = 'pending_first_action';
  const normalizedDeviceId = normalizeShortText(deviceId, 120);
  const normalizedIpAddress = normalizeShortText(ipAddress, 120);

  if (normalizedDeviceId) {
    const deviceRows = await db.query(
      `
        SELECT COUNT(*)::INT AS total
        FROM dalal_coin_referrals
        WHERE referred_device_id = $1
          AND status IN ('pending_first_action', 'completed')
      `,
      [normalizedDeviceId]
    );
    if (toWholeCoins(deviceRows.rows[0]?.total) >= MAX_REWARDED_REFERRALS_PER_DEVICE) {
      referralStatus = 'blocked_device_limit';
    }
  }

  if (referralStatus === 'pending_first_action' && normalizedIpAddress) {
    const ipRows = await db.query(
      `
        SELECT COUNT(*)::INT AS total
        FROM dalal_coin_referrals
        WHERE referred_ip_address = $1
          AND status IN ('pending_first_action', 'completed')
      `,
      [normalizedIpAddress]
    );
    if (toWholeCoins(ipRows.rows[0]?.total) >= MAX_REWARDED_REFERRALS_PER_IP) {
      referralStatus = 'blocked_ip_limit';
    }
  }

  await db.query(
    `
      INSERT INTO dalal_coin_referrals (
        referrer_user_id,
        referred_user_id,
        referral_code,
        status,
        referred_device_id,
        referred_ip_address,
        rewarded_referrer_amount,
        rewarded_referred_amount,
        metadata
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9::jsonb
      )
      ON CONFLICT (referred_user_id) DO NOTHING
    `,
    [
      referrer.id,
      userId,
      normalizedIncomingReferralCode,
      referralStatus,
      normalizedDeviceId,
      normalizedIpAddress,
      referralStatus === 'pending_first_action' ? DALAL_COIN_RULES.referralBonusForReferrer : 0,
      referralStatus === 'pending_first_action' ? DALAL_COIN_RULES.referralBonusForNewUser : 0,
      JSON.stringify({
        antiFraud: {
          maxRewardedReferralsPerDevice: MAX_REWARDED_REFERRALS_PER_DEVICE,
          maxRewardedReferralsPerIp: MAX_REWARDED_REFERRALS_PER_IP,
        },
      }),
    ]
  );

  return {
    referralCode: personalReferralCode,
    referralStatus,
    referredByUserId: Number(referrer.id),
  };
}

export async function applyQualifiedDalalCoinRewards(
  db,
  {
    userId,
    orderKind,
    referenceId,
    netAmount,
    metadata = {},
  }
) {
  const normalizedOrderKind = String(orderKind || '').trim().toLowerCase();
  const normalizedReferenceId = normalizeReferenceId(referenceId);
  const normalizedNetAmount = roundCurrency(netAmount);

  const result = {
    firstPurchaseBonusCoins: 0,
    cashbackCoins: 0,
    unlockedReferral: false,
    referralBonusForReferrer: 0,
    referralBonusForNewUser: 0,
  };

  const firstPurchaseRows = await db.query(
    `
      SELECT id
      FROM dalal_coin_transactions
      WHERE user_id = $1
        AND reason = 'first_purchase_bonus'
      LIMIT 1
    `,
    [userId]
  );

  if (firstPurchaseRows.rowCount === 0) {
    const firstPurchaseReward = await resolveCampaignAdjustedReward(
      db,
      DALAL_COIN_RULES.firstPurchaseBonus
    );
    await creditDalalCoins(db, {
      userId,
      amount: firstPurchaseReward.finalCoins,
      reason: 'first_purchase_bonus',
      referenceType: normalizedOrderKind,
      referenceId: normalizedReferenceId,
      metadata: {
        ...toSafeObject(metadata),
        activeCampaigns: firstPurchaseReward.activeCampaigns,
      },
    });
    result.firstPurchaseBonusCoins = firstPurchaseReward.finalCoins;
  }

  const referralRows = await db.query(
    `
      SELECT *
      FROM dalal_coin_referrals
      WHERE referred_user_id = $1
        AND status = 'pending_first_action'
      LIMIT 1
      FOR UPDATE
    `,
    [userId]
  );

  if (referralRows.rowCount > 0) {
    const referral = referralRows.rows[0];
    const referrerReward = await resolveCampaignAdjustedReward(
      db,
      DALAL_COIN_RULES.referralBonusForReferrer
    );
    const referredReward = await resolveCampaignAdjustedReward(
      db,
      DALAL_COIN_RULES.referralBonusForNewUser
    );

    await creditDalalCoins(db, {
      userId: Number(referral.referrer_user_id),
      amount: referrerReward.finalCoins,
      reason: 'referral_bonus_referrer',
      referenceType: normalizedOrderKind,
      referenceId: normalizedReferenceId,
      metadata: {
        referredUserId: userId,
        activeCampaigns: referrerReward.activeCampaigns,
      },
    });

    await creditDalalCoins(db, {
      userId,
      amount: referredReward.finalCoins,
      reason: 'referral_bonus_referred',
      referenceType: normalizedOrderKind,
      referenceId: normalizedReferenceId,
      metadata: {
        referrerUserId: Number(referral.referrer_user_id),
        activeCampaigns: referredReward.activeCampaigns,
      },
    });

    await db.query(
      `
        UPDATE dalal_coin_referrals
        SET status = 'completed',
            qualifying_action = $2,
            qualifying_reference_id = $3,
            rewarded_referrer_amount = $4,
            rewarded_referred_amount = $5,
            completed_at = NOW()
        WHERE id = $1
      `,
      [
        Number(referral.id),
        normalizedOrderKind,
        normalizedReferenceId,
        referrerReward.finalCoins,
        referredReward.finalCoins,
      ]
    );

    result.unlockedReferral = true;
    result.referralBonusForReferrer = referrerReward.finalCoins;
    result.referralBonusForNewUser = referredReward.finalCoins;
  }

  const cashbackCoins = calculateCashbackCoins({
    orderKind: normalizedOrderKind,
    netAmount: normalizedNetAmount,
  });

  if (cashbackCoins > 0) {
    const cashbackReward = await resolveCampaignAdjustedReward(db, cashbackCoins);
    await creditDalalCoins(db, {
      userId,
      amount: cashbackReward.finalCoins,
      reason: 'cashback_reward',
      referenceType: normalizedOrderKind,
      referenceId: normalizedReferenceId,
      metadata: {
        ...toSafeObject(metadata),
        netAmount: normalizedNetAmount,
        activeCampaigns: cashbackReward.activeCampaigns,
      },
    });
    result.cashbackCoins = cashbackReward.finalCoins;
  }

  await refreshDalalCoinTier(db, userId);
  return result;
}

function mapTransactionRow(row) {
  const metadata = toSafeObject(row.metadata);
  return {
    id: Number(row.id),
    amount: toWholeCoins(row.amount),
    remainingAmount: toWholeCoins(row.remaining_amount),
    type: row.type,
    reason: row.reason,
    referenceType: row.reference_type || '',
    referenceId: row.reference_id || '',
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    metadata,
  };
}

export async function getDalalCoinWallet(
  db,
  userId,
  {
    transactionLimit = DEFAULT_TRANSACTION_LIMIT,
  } = {}
) {
  await releaseExpiredDalalCoinReservations(db, userId);
  await expireDalalCoins(db, userId);

  const userRows = await db.query(
    `
      SELECT
        id,
        name,
        email,
        referral_code,
        referred_by,
        COALESCE(dalal_coins, 0)::INT AS dalal_coins,
        COALESCE(dalal_coin_tier, 'silver') AS dalal_coin_tier,
        created_at
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [userId]
  );

  if (userRows.rowCount === 0) {
    throw createDalalCoinError(404, 'User not found.', 'dalal_coin_user_not_found');
  }

  const userRow = userRows.rows[0];
  const referralCode = await ensureUserReferralCode(db, userId, {
    seedText: `${userRow.name}${userRow.email}`,
  });

  const [reservedCoins, analyticsRows, transactionRows, expiringRows, referralSummaryRows, referralRows, leaderboardRows, activeCampaigns, tierStats] = await Promise.all([
    getReservedDalalCoins(db, userId),
    db.query(
      `
        SELECT
          COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0)::INT AS total_earned,
          COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0)::INT AS total_used
        FROM dalal_coin_transactions
        WHERE user_id = $1
      `,
      [userId]
    ),
    db.query(
      `
        SELECT *
        FROM dalal_coin_transactions
        WHERE user_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2
      `,
      [userId, Math.max(1, Math.min(100, Number(transactionLimit) || DEFAULT_TRANSACTION_LIMIT))]
    ),
    db.query(
      `
        SELECT
          DATE(expires_at) AS expiry_date,
          COALESCE(SUM(remaining_amount), 0)::INT AS amount
        FROM dalal_coin_transactions
        WHERE user_id = $1
          AND type = 'credit'
          AND remaining_amount > 0
          AND expires_at IS NOT NULL
        GROUP BY DATE(expires_at)
        ORDER BY expiry_date ASC
        LIMIT 12
      `,
      [userId]
    ),
    db.query(
      `
        SELECT
          COUNT(*) FILTER (WHERE status = 'completed')::INT AS completed_count,
          COUNT(*) FILTER (WHERE status = 'pending_first_action')::INT AS pending_count,
          COALESCE(SUM(rewarded_referrer_amount) FILTER (WHERE status = 'completed'), 0)::INT AS earned_as_referrer
        FROM dalal_coin_referrals
        WHERE referrer_user_id = $1
      `,
      [userId]
    ),
    db.query(
      `
        SELECT
          r.id,
          r.status,
          r.referral_code,
          r.qualifying_action,
          r.qualifying_reference_id,
          r.rewarded_referrer_amount,
          r.rewarded_referred_amount,
          r.completed_at,
          r.created_at,
          u.name AS referred_user_name,
          u.email AS referred_user_email
        FROM dalal_coin_referrals r
        JOIN users u
          ON u.id = r.referred_user_id
        WHERE r.referrer_user_id = $1
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT 20
      `,
      [userId]
    ),
    db.query(
      `
        SELECT
          r.referrer_user_id,
          u.name,
          COUNT(*)::INT AS successful_referrals
        FROM dalal_coin_referrals r
        JOIN users u
          ON u.id = r.referrer_user_id
        WHERE r.status = 'completed'
        GROUP BY r.referrer_user_id, u.name
        ORDER BY successful_referrals DESC, u.name ASC
        LIMIT 10
      `
    ),
    listActiveCampaigns(db),
    refreshDalalCoinTier(db, userId),
  ]);

  const totalEarned = toWholeCoins(analyticsRows.rows[0]?.total_earned);
  const totalUsed = toWholeCoins(analyticsRows.rows[0]?.total_used);
  const balance = toWholeCoins(userRow.dalal_coins);
  const spendableCoins = Math.max(0, balance - reservedCoins);
  const nextExpiry = expiringRows.rows[0]?.expiry_date || null;
  const expiringSoonCoins = expiringRows.rows.reduce(
    (sum, row) => sum + toWholeCoins(row.amount),
    0
  );

  return {
    wallet: {
      userId: Number(userRow.id),
      balance,
      reservedCoins,
      spendableCoins,
      referralCode,
      referredByUserId: userRow.referred_by === null ? null : Number(userRow.referred_by),
      tier: tierStats.tier || userRow.dalal_coin_tier || 'silver',
      tierLabel: tierLabel(tierStats.tier || userRow.dalal_coin_tier || 'silver'),
      lifetimeEarned: totalEarned,
      lifetimeUsed: totalUsed,
      nextExpiryAt: nextExpiry,
      expiringSoonCoins,
      createdAt: userRow.created_at,
    },
    transactions: transactionRows.rows.map(mapTransactionRow),
    expiry: expiringRows.rows.map((row) => ({
      expiryDate: row.expiry_date,
      amount: toWholeCoins(row.amount),
    })),
    referrals: {
      code: referralCode,
      sharePath: `/register?ref=${encodeURIComponent(referralCode)}`,
      completedCount: toWholeCoins(referralSummaryRows.rows[0]?.completed_count),
      pendingCount: toWholeCoins(referralSummaryRows.rows[0]?.pending_count),
      earnedAsReferrer: toWholeCoins(referralSummaryRows.rows[0]?.earned_as_referrer),
      history: referralRows.rows.map((row) => ({
        id: Number(row.id),
        status: row.status,
        referralCode: row.referral_code,
        referredUserName: row.referred_user_name,
        referredUserEmail: row.referred_user_email,
        qualifyingAction: row.qualifying_action || '',
        qualifyingReferenceId: row.qualifying_reference_id || '',
        rewardedReferrerAmount: toWholeCoins(row.rewarded_referrer_amount),
        rewardedReferredAmount: toWholeCoins(row.rewarded_referred_amount),
        completedAt: row.completed_at,
        createdAt: row.created_at,
      })),
    },
    leaderboard: leaderboardRows.rows.map((row, index) => ({
      rank: index + 1,
      userId: Number(row.referrer_user_id),
      name: row.name,
      successfulReferrals: toWholeCoins(row.successful_referrals),
    })),
    campaigns: activeCampaigns,
    rewardRules: buildRewardRulesResponse(),
  };
}
