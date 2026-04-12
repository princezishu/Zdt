import {
  DALAL_COIN_RULES,
  ensureUserReferralCode,
  findUserByReferralCode,
  normalizeReferralCode,
} from './dalalCoin.js';

const DEFAULT_TRANSACTION_LIMIT = 40;
const DEFAULT_HOLD_TTL_HOURS = 24;
const MAX_REWARDED_REFERRALS_PER_DEVICE = 1;

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

function normalizeIpAddress(rawValue) {
  if (!rawValue) {
    return '';
  }
  return String(rawValue).split(',')[0].trim().slice(0, 64);
}

function normalizeSourceType(value) {
  return normalizeShortText(value, 40);
}

function normalizeSourceId(value) {
  return normalizeShortText(value, 120);
}

function addMonths(date, months) {
  const normalized = new Date(date);
  normalized.setMonth(normalized.getMonth() + months);
  return normalized;
}

function tierLabel(tierKey) {
  if (tierKey === 'platinum') return 'Platinum';
  if (tierKey === 'gold') return 'Gold';
  return 'Silver';
}

function parseAllocationJson(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }
      const grantId = Number(entry.grantId || 0);
      const coins = toWholeCoins(entry.coins);
      if (!Number.isFinite(grantId) || grantId <= 0 || coins <= 0) {
        return null;
      }
      return {
        grantId,
        coins,
      };
    })
    .filter(Boolean);
}

async function ensureUserProfileRow(db, userId) {
  await db.query(
    `
      INSERT INTO user_profiles (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO NOTHING
    `,
    [userId]
  );
}

export async function recomputeDalalCoinBalanceCache(db, userId) {
  const rows = await db.query(
    `
      SELECT COALESCE(SUM(remaining_amount), 0)::INT AS balance
      FROM dalal_coin_grants
      WHERE user_id = $1
        AND status = 'confirmed'
        AND remaining_amount > 0
        AND (expires_at IS NULL OR expires_at > NOW())
    `,
    [userId]
  );

  const balance = toWholeCoins(rows.rows[0]?.balance);
  await db.query(
    `
      UPDATE users
      SET dalal_coin_balance = $2,
          dalal_coins = $2
      WHERE id = $1
    `,
    [userId, balance]
  );

  return balance;
}

async function insertDalalCoinTransaction(
  db,
  {
    userId,
    amount,
    type,
    reason,
    grantId = null,
    holdId = null,
    referenceType = '',
    referenceId = '',
    expiresAt = null,
    metadata = {},
  }
) {
  const normalizedAmount = toWholeCoins(amount);
  if (normalizedAmount <= 0) {
    return null;
  }

  const inserted = await db.query(
    `
      INSERT INTO dalal_coin_transactions (
        user_id,
        grant_id,
        hold_id,
        amount,
        remaining_amount,
        type,
        reason,
        reference_type,
        reference_id,
        expires_at,
        status,
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
        $9,
        $10,
        'posted',
        $11::jsonb
      )
      RETURNING *
    `,
    [
      userId,
      grantId,
      holdId,
      normalizedAmount,
      type === 'credit' ? normalizedAmount : 0,
      type,
      normalizeShortText(reason, 80),
      normalizeSourceType(referenceType),
      normalizeSourceId(referenceId),
      expiresAt ? new Date(expiresAt) : null,
      JSON.stringify(toSafeObject(metadata)),
    ]
  );

  return inserted.rows[0] || null;
}

async function syncGrantCreditTransactionRemaining(db, grantId, remainingAmount) {
  await db.query(
    `
      UPDATE dalal_coin_transactions
      SET remaining_amount = $2
      WHERE grant_id = $1
        AND type = 'credit'
    `,
    [grantId, toWholeCoins(remainingAmount)]
  );
}

async function getGrantCreditTransaction(db, grantId) {
  const rows = await db.query(
    `
      SELECT id
      FROM dalal_coin_transactions
      WHERE grant_id = $1
        AND type = 'credit'
      LIMIT 1
    `,
    [grantId]
  );

  return rows.rowCount > 0 ? rows.rows[0] : null;
}

async function findGrantByReasonAndSource(
  db,
  {
    userId,
    reasonCode,
    sourceType = '',
    sourceId = '',
  }
) {
  const rows = await db.query(
    `
      SELECT *
      FROM dalal_coin_grants
      WHERE user_id = $1
        AND reason_code = $2
        AND source_type = $3
        AND source_id = $4
      ORDER BY id DESC
      LIMIT 1
    `,
    [
      userId,
      normalizeShortText(reasonCode, 60),
      normalizeSourceType(sourceType),
      normalizeSourceId(sourceId),
    ]
  );

  return rows.rowCount > 0 ? rows.rows[0] : null;
}

export async function isDalalCoinPhoneVerified(db, userId) {
  const rows = await db.query(
    `
      SELECT p.phone_verified_at
      FROM users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.id = $1
      LIMIT 1
    `,
    [userId]
  );

  if (rows.rowCount === 0) {
    throw createDalalCoinError(404, 'User not found.', 'dalal_coin_user_not_found');
  }

  return Boolean(rows.rows[0]?.phone_verified_at);
}

async function releaseHoldAllocations(db, holdRow) {
  const allocations = parseAllocationJson(holdRow?.allocation_json);
  for (const allocation of allocations) {
    await db.query(
      `
        UPDATE dalal_coin_grants
        SET reserved_amount = GREATEST(reserved_amount - $2, 0),
            updated_at = NOW()
        WHERE id = $1
      `,
      [allocation.grantId, allocation.coins]
    );
  }
}

export async function releaseExpiredDalalCoinHolds(db, userId = null) {
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
      SELECT *
      FROM dalal_coin_holds
      WHERE ${filters.join(' AND ')}
      ORDER BY expires_at ASC, id ASC
      FOR UPDATE
    `,
    values
  );

  let releasedCount = 0;
  for (const row of rows.rows) {
    await releaseHoldAllocations(db, row);
    await db.query(
      `
        UPDATE dalal_coin_holds
        SET status = 'expired',
            released_at = COALESCE(released_at, NOW()),
            updated_at = NOW()
        WHERE id = $1
      `,
      [row.id]
    );
    releasedCount += 1;
  }

  return {
    releasedCount,
  };
}

export async function expireDalalCoinGrantLots(db, userId = null) {
  const values = [];
  const filters = [
    `status = 'confirmed'`,
    `remaining_amount > 0`,
    `expires_at IS NOT NULL`,
    `expires_at <= NOW()`,
  ];

  if (userId !== null && userId !== undefined) {
    values.push(userId);
    filters.push(`user_id = $${values.length}`);
  }

  const rows = await db.query(
    `
      SELECT *
      FROM dalal_coin_grants
      WHERE ${filters.join(' AND ')}
      ORDER BY expires_at ASC, created_at ASC, id ASC
      FOR UPDATE
    `,
    values
  );

  const affectedUsers = new Set();
  for (const row of rows.rows) {
    const remainingAmount = toWholeCoins(row.remaining_amount);
    if (remainingAmount <= 0) {
      continue;
    }

    await db.query(
      `
        UPDATE dalal_coin_grants
        SET remaining_amount = 0,
            reserved_amount = 0,
            status = 'expired',
            updated_at = NOW()
        WHERE id = $1
      `,
      [row.id]
    );

    await syncGrantCreditTransactionRemaining(db, row.id, 0);
    await insertDalalCoinTransaction(db, {
      userId: Number(row.user_id),
      amount: remainingAmount,
      type: 'debit',
      reason: 'coin_expiry',
      grantId: Number(row.id),
      referenceType: row.source_type || 'grant_expiry',
      referenceId: row.source_id || `${row.id}`,
      metadata: {
        expiredGrantId: Number(row.id),
      },
    });
    affectedUsers.add(Number(row.user_id));
  }

  for (const affectedUserId of affectedUsers) {
    await recomputeDalalCoinBalanceCache(db, affectedUserId);
  }

  return {
    expiredGrantCount: rows.rowCount,
  };
}

export async function runDalalCoinMaintenance(db, userId = null) {
  await releaseExpiredDalalCoinHolds(db, userId);
  await expireDalalCoinGrantLots(db, userId);
}

export async function createDalalCoinGrant(
  db,
  {
    userId,
    amount,
    reasonCode,
    unlockRequirement = 'none',
    sourceType = '',
    sourceId = '',
    metadata = {},
  }
) {
  const normalizedAmount = toWholeCoins(amount);
  if (normalizedAmount <= 0) {
    return null;
  }

  const normalizedUnlockRequirement =
    unlockRequirement === 'phone_verification' || unlockRequirement === 'referred_user_first_paid'
      ? unlockRequirement
      : 'none';
  const status = normalizedUnlockRequirement === 'none' ? 'confirmed' : 'pending';
  const confirmedAt = status === 'confirmed' ? new Date() : null;
  const expiresAt = status === 'confirmed'
    ? addMonths(new Date(), DALAL_COIN_RULES.expiryMonths)
    : null;

  const inserted = await db.query(
    `
      INSERT INTO dalal_coin_grants (
        user_id,
        amount,
        remaining_amount,
        reserved_amount,
        status,
        reason_code,
        unlock_requirement,
        source_type,
        source_id,
        metadata,
        confirmed_at,
        expires_at
      )
      VALUES (
        $1,
        $2,
        $2,
        0,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8::jsonb,
        $9,
        $10
      )
      RETURNING *
    `,
    [
      userId,
      normalizedAmount,
      status,
      normalizeShortText(reasonCode, 60),
      normalizedUnlockRequirement,
      normalizeSourceType(sourceType),
      normalizeSourceId(sourceId),
      JSON.stringify(toSafeObject(metadata)),
      confirmedAt,
      expiresAt,
    ]
  );

  const grant = inserted.rows[0] || null;
  if (grant && status === 'confirmed') {
    await insertDalalCoinTransaction(db, {
      userId,
      grantId: Number(grant.id),
      amount: normalizedAmount,
      type: 'credit',
      reason: grant.reason_code,
      referenceType: grant.source_type,
      referenceId: grant.source_id,
      expiresAt: grant.expires_at,
      metadata: toSafeObject(grant.metadata),
    });
    await recomputeDalalCoinBalanceCache(db, userId);
  }

  return grant;
}

export async function confirmDalalCoinGrant(db, grantId) {
  const rows = await db.query(
    `
      SELECT *
      FROM dalal_coin_grants
      WHERE id = $1
      LIMIT 1
      FOR UPDATE
    `,
    [grantId]
  );

  if (rows.rowCount === 0) {
    throw createDalalCoinError(404, 'Dalal Coin grant not found.', 'dalal_coin_grant_not_found');
  }

  const grant = rows.rows[0];
  if (grant.status === 'confirmed') {
    const existingTransaction = await getGrantCreditTransaction(db, grantId);
    if (!existingTransaction) {
      await insertDalalCoinTransaction(db, {
        userId: Number(grant.user_id),
        grantId: Number(grant.id),
        amount: Number(grant.amount || 0),
        type: 'credit',
        reason: grant.reason_code,
        referenceType: grant.source_type,
        referenceId: grant.source_id,
        expiresAt: grant.expires_at,
      });
    }
    await recomputeDalalCoinBalanceCache(db, Number(grant.user_id));
    return grant;
  }

  const confirmedAt = new Date();
  const expiresAt = grant.expires_at || addMonths(confirmedAt, DALAL_COIN_RULES.expiryMonths);
  const updated = await db.query(
    `
      UPDATE dalal_coin_grants
      SET status = 'confirmed',
          confirmed_at = COALESCE(confirmed_at, $2),
          expires_at = COALESCE(expires_at, $3),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [grantId, confirmedAt, expiresAt]
  );

  const confirmedGrant = updated.rows[0] || grant;
  const existingTransaction = await getGrantCreditTransaction(db, grantId);
  if (!existingTransaction) {
    await insertDalalCoinTransaction(db, {
      userId: Number(confirmedGrant.user_id),
      grantId: Number(confirmedGrant.id),
      amount: Number(confirmedGrant.amount || 0),
      type: 'credit',
      reason: confirmedGrant.reason_code,
      referenceType: confirmedGrant.source_type,
      referenceId: confirmedGrant.source_id,
      expiresAt: confirmedGrant.expires_at,
    });
  }
  await recomputeDalalCoinBalanceCache(db, Number(confirmedGrant.user_id));
  return confirmedGrant;
}

export async function confirmPendingPhoneVerificationGrants(db, userId) {
  const rows = await db.query(
    `
      SELECT id
      FROM dalal_coin_grants
      WHERE user_id = $1
        AND status = 'pending'
        AND unlock_requirement = 'phone_verification'
      ORDER BY created_at ASC, id ASC
      FOR UPDATE
    `,
    [userId]
  );

  const confirmedGrantIds = [];
  let confirmedCoins = 0;
  for (const row of rows.rows) {
    const grant = await confirmDalalCoinGrant(db, Number(row.id));
    confirmedGrantIds.push(Number(grant.id));
    confirmedCoins += toWholeCoins(grant.amount);
  }

  return {
    confirmedGrantIds,
    confirmedCoins,
  };
}

function quoteDalalCoinUsage({
  kind,
  baseAmount,
  deliveryAmount = 0,
  requestedCoins = undefined,
  availableBalance = 0,
  heldCoins = 0,
}) {
  const normalizedKind = String(kind || '').trim().toLowerCase();
  if (normalizedKind !== 'subscription' && normalizedKind !== 'ecommerce') {
    throw createDalalCoinError(400, 'Unsupported Dalal Coin usage type.', 'dalal_coin_preview_kind_invalid');
  }

  const normalizedBaseAmount = roundCurrency(baseAmount);
  if (normalizedBaseAmount <= 0) {
    throw createDalalCoinError(400, 'Base amount must be greater than zero.', 'dalal_coin_preview_amount_invalid');
  }

  const normalizedDeliveryAmount =
    normalizedKind === 'ecommerce' ? roundCurrency(Math.max(0, deliveryAmount)) : 0;
  const rules =
    normalizedKind === 'subscription'
      ? {
          coinValueInr: DALAL_COIN_RULES.usage.subscription.coinValueInr,
          maxDiscountPercent: DALAL_COIN_RULES.usage.subscription.maxDiscountPercent,
        }
      : {
          coinValueInr: DALAL_COIN_RULES.usage.ecommerce.coinValueInr,
          maxDiscountPercent: DALAL_COIN_RULES.usage.ecommerce.maxDiscountPercent,
        };
  const normalizedAvailableBalance = toWholeCoins(availableBalance);
  const normalizedHeldCoins = toWholeCoins(heldCoins);
  const spendableCoins = Math.max(0, normalizedAvailableBalance - normalizedHeldCoins);
  const maxDiscountValue = roundCurrency((normalizedBaseAmount * rules.maxDiscountPercent) / 100);
  const maxCoinsAllowed = Math.max(0, Math.floor(maxDiscountValue / rules.coinValueInr));
  const requestedProvided =
    requestedCoins !== null && requestedCoins !== undefined && requestedCoins !== '';
  const normalizedRequestedCoins = requestedProvided
    ? toWholeCoins(requestedCoins)
    : Math.min(spendableCoins, maxCoinsAllowed);
  const coinsApplied = Math.min(normalizedRequestedCoins, spendableCoins, maxCoinsAllowed);
  const discountValue = roundCurrency(coinsApplied * rules.coinValueInr);
  const payableAmountBeforeDiscount = roundCurrency(normalizedBaseAmount + normalizedDeliveryAmount);

  return {
    kind: normalizedKind,
    baseAmount: normalizedBaseAmount,
    deliveryAmount: normalizedDeliveryAmount,
    discountableAmount: normalizedBaseAmount,
    payableAmountBeforeDiscount,
    availableBalance: normalizedAvailableBalance,
    heldCoins: normalizedHeldCoins,
    spendableCoins,
    requestedCoins: normalizedRequestedCoins,
    coinsApplied,
    coinValueInr: rules.coinValueInr,
    maxDiscountPercent: rules.maxDiscountPercent,
    maxDiscountValue,
    maxCoinsAllowed,
    discountValue,
    effectiveDiscountPercent:
      normalizedBaseAmount > 0
        ? roundCurrency((discountValue / normalizedBaseAmount) * 100)
        : 0,
    finalAmount: roundCurrency(Math.max(0, payableAmountBeforeDiscount - discountValue)),
  };
}

export async function getDalalCoinQuoteForUser(
  db,
  userId,
  {
    kind,
    baseAmount,
    deliveryAmount = 0,
    requestedCoins = undefined,
    excludeHoldId = null,
  }
) {
  await runDalalCoinMaintenance(db, userId);

  const rows = await db.query(
    `
      SELECT
        u.id,
        COALESCE(u.dalal_coin_balance, u.dalal_coins, 0)::INT AS dalal_coin_balance,
        p.phone_verified_at
      FROM users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.id = $1
      LIMIT 1
    `,
    [userId]
  );

  if (rows.rowCount === 0) {
    throw createDalalCoinError(404, 'User not found.', 'dalal_coin_user_not_found');
  }

  const phoneVerified = Boolean(rows.rows[0]?.phone_verified_at);
  const heldCoinsValues = [userId];
  const heldCoinFilters = [
    `user_id = $1`,
    `status = 'active'`,
    `expires_at > NOW()`,
  ];
  if (excludeHoldId !== null && excludeHoldId !== undefined) {
    heldCoinsValues.push(excludeHoldId);
    heldCoinFilters.push(`id <> $${heldCoinsValues.length}`);
  }
  const holdRows = await db.query(
    `
      SELECT COALESCE(SUM(coins_amount), 0)::INT AS total
      FROM dalal_coin_holds
      WHERE ${heldCoinFilters.join(' AND ')}
    `,
    heldCoinsValues
  );

  const preview = quoteDalalCoinUsage({
    kind,
    baseAmount,
    deliveryAmount,
    requestedCoins,
    availableBalance: rows.rows[0]?.dalal_coin_balance,
    heldCoins: holdRows.rows[0]?.total,
  });

  if (!phoneVerified) {
    return {
      ...preview,
      phoneVerified: false,
      lockedReason: 'phone_verification_required',
      lockedCoins: Math.max(0, preview.availableBalance - preview.heldCoins),
      spendableCoins: 0,
      coinsApplied: 0,
      discountValue: 0,
      effectiveDiscountPercent: 0,
      finalAmount: preview.payableAmountBeforeDiscount,
    };
  }

  return {
    ...preview,
    phoneVerified: true,
    lockedReason: '',
    lockedCoins: 0,
  };
}

async function allocateCoinsFromConfirmedGrants(db, userId, coinsNeeded) {
  const normalizedCoinsNeeded = toWholeCoins(coinsNeeded);
  if (normalizedCoinsNeeded <= 0) {
    return [];
  }

  const rows = await db.query(
    `
      SELECT *
      FROM dalal_coin_grants
      WHERE user_id = $1
        AND status = 'confirmed'
        AND remaining_amount > reserved_amount
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY expires_at ASC NULLS LAST, confirmed_at ASC NULLS LAST, created_at ASC, id ASC
      FOR UPDATE
    `,
    [userId]
  );

  let coinsLeft = normalizedCoinsNeeded;
  const allocations = [];

  for (const row of rows.rows) {
    if (coinsLeft <= 0) {
      break;
    }

    const spendableCoins = Math.max(
      0,
      toWholeCoins(row.remaining_amount) - toWholeCoins(row.reserved_amount)
    );
    if (spendableCoins <= 0) {
      continue;
    }

    const allocatedCoins = Math.min(spendableCoins, coinsLeft);
    await db.query(
      `
        UPDATE dalal_coin_grants
        SET reserved_amount = reserved_amount + $2,
            updated_at = NOW()
        WHERE id = $1
      `,
      [row.id, allocatedCoins]
    );

    allocations.push({
      grantId: Number(row.id),
      coins: allocatedCoins,
    });
    coinsLeft -= allocatedCoins;
  }

  if (coinsLeft > 0) {
    throw createDalalCoinError(
      409,
      'Not enough Dalal Coins available to reserve.',
      'dalal_coin_reservation_insufficient'
    );
  }

  return allocations;
}

export async function createDalalCoinHold(
  db,
  {
    userId,
    holdKind,
    baseAmount,
    deliveryAmount = 0,
    requestedCoins = 0,
    billingOrderId = null,
    ecommerceOrderId = null,
    sourceType = '',
    sourceId = '',
    metadata = {},
    expiresAt = null,
  }
) {
  const quote = await getDalalCoinQuoteForUser(db, userId, {
    kind: holdKind,
    baseAmount,
    deliveryAmount,
    requestedCoins,
  });

  const normalizedRequestedCoins = toWholeCoins(requestedCoins);
  if (normalizedRequestedCoins > 0 && !quote.phoneVerified) {
    throw createDalalCoinError(
      403,
      'Phone verification is required before using Dalal Coins.',
      'dalal_coin_phone_verification_required'
    );
  }

  if (normalizedRequestedCoins > 0 && quote.coinsApplied !== normalizedRequestedCoins) {
    throw createDalalCoinError(
      400,
      'Requested Dalal Coin amount exceeds the current limit.',
      'dalal_coin_checkout_limit_exceeded',
      {
        requestedCoins: normalizedRequestedCoins,
        allowedCoins: quote.coinsApplied,
        maxCoinsAllowed: quote.maxCoinsAllowed,
        spendableCoins: quote.spendableCoins,
      }
    );
  }

  if (quote.coinsApplied <= 0) {
    return {
      quote,
      hold: null,
    };
  }

  const allocations = await allocateCoinsFromConfirmedGrants(db, userId, quote.coinsApplied);
  const holdExpiry =
    expiresAt instanceof Date && Number.isFinite(expiresAt.getTime())
      ? expiresAt
      : new Date(Date.now() + DEFAULT_HOLD_TTL_HOURS * 60 * 60 * 1000);
  const inserted = await db.query(
    `
      INSERT INTO dalal_coin_holds (
        user_id,
        hold_kind,
        billing_order_id,
        ecommerce_order_id,
        coins_amount,
        rupee_discount_amount,
        status,
        allocation_json,
        metadata,
        expires_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        'active',
        $7::jsonb,
        $8::jsonb,
        $9
      )
      RETURNING *
    `,
    [
      userId,
      normalizeShortText(holdKind, 24),
      billingOrderId,
      ecommerceOrderId,
      quote.coinsApplied,
      quote.discountValue,
      JSON.stringify(allocations),
      JSON.stringify({
        ...toSafeObject(metadata),
        sourceType: normalizeSourceType(sourceType),
        sourceId: normalizeSourceId(sourceId),
        quote,
      }),
      holdExpiry,
    ]
  );

  return {
    quote,
    hold: inserted.rows[0] || null,
  };
}

export async function releaseDalalCoinHold(db, holdId, { expectedUserId = null } = {}) {
  if (!holdId) {
    return null;
  }

  const rows = await db.query(
    `
      SELECT *
      FROM dalal_coin_holds
      WHERE id = $1
      LIMIT 1
      FOR UPDATE
    `,
    [holdId]
  );

  if (rows.rowCount === 0) {
    return null;
  }

  const hold = rows.rows[0];
  if (expectedUserId && Number(hold.user_id) !== Number(expectedUserId)) {
    throw createDalalCoinError(404, 'Dalal Coin hold not found.', 'dalal_coin_hold_not_found');
  }

  if (hold.status !== 'active') {
    return hold;
  }

  await releaseHoldAllocations(db, hold);
  const updated = await db.query(
    `
      UPDATE dalal_coin_holds
      SET status = 'released',
          released_at = COALESCE(released_at, NOW()),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [holdId]
  );

  return updated.rows[0] || hold;
}

export async function consumeDalalCoinHold(
  db,
  holdId,
  {
    expectedUserId = null,
    reasonCode,
    referenceType = '',
    referenceId = '',
    metadata = {},
  }
) {
  if (!holdId) {
    return {
      hold: null,
      transaction: null,
      alreadyConsumed: false,
      coinsSpent: 0,
    };
  }

  const rows = await db.query(
    `
      SELECT *
      FROM dalal_coin_holds
      WHERE id = $1
      LIMIT 1
      FOR UPDATE
    `,
    [holdId]
  );

  if (rows.rowCount === 0) {
    throw createDalalCoinError(404, 'Dalal Coin hold not found.', 'dalal_coin_hold_not_found');
  }

  const hold = rows.rows[0];
  if (expectedUserId && Number(hold.user_id) !== Number(expectedUserId)) {
    throw createDalalCoinError(404, 'Dalal Coin hold not found.', 'dalal_coin_hold_not_found');
  }

  if (hold.status === 'consumed') {
    return {
      hold,
      transaction: null,
      alreadyConsumed: true,
      coinsSpent: toWholeCoins(hold.coins_amount),
    };
  }

  if (hold.status !== 'active') {
    throw createDalalCoinError(
      409,
      'Dalal Coin hold is no longer active.',
      'dalal_coin_hold_inactive'
    );
  }

  if (hold.expires_at && new Date(hold.expires_at).getTime() <= Date.now()) {
    await releaseDalalCoinHold(db, holdId, {
      expectedUserId,
    });
    throw createDalalCoinError(409, 'Dalal Coin hold has expired.', 'dalal_coin_hold_expired');
  }

  const allocations = parseAllocationJson(hold.allocation_json);
  let totalSpent = 0;

  for (const allocation of allocations) {
    const grantRows = await db.query(
      `
        SELECT *
        FROM dalal_coin_grants
        WHERE id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [allocation.grantId]
    );

    if (grantRows.rowCount === 0) {
      continue;
    }

    const grant = grantRows.rows[0];
    const spendAmount = Math.min(
      allocation.coins,
      toWholeCoins(grant.reserved_amount),
      toWholeCoins(grant.remaining_amount)
    );
    if (spendAmount <= 0) {
      continue;
    }

    const updated = await db.query(
      `
        UPDATE dalal_coin_grants
        SET remaining_amount = GREATEST(remaining_amount - $2, 0),
            reserved_amount = GREATEST(reserved_amount - $2, 0),
            updated_at = NOW()
        WHERE id = $1
        RETURNING remaining_amount
      `,
      [allocation.grantId, spendAmount]
    );

    totalSpent += spendAmount;
    await syncGrantCreditTransactionRemaining(
      db,
      allocation.grantId,
      updated.rows[0]?.remaining_amount || 0
    );
  }

  if (totalSpent <= 0) {
    throw createDalalCoinError(409, 'Dalal Coin hold could not be consumed.', 'dalal_coin_hold_empty');
  }

  const transaction = await insertDalalCoinTransaction(db, {
    userId: Number(hold.user_id),
    holdId: Number(hold.id),
    amount: totalSpent,
    type: 'debit',
    reason: normalizeShortText(reasonCode, 80) || 'wallet_spend',
    referenceType,
    referenceId,
    metadata: {
      ...toSafeObject(metadata),
      holdId: Number(hold.id),
      allocations,
    },
  });

  const updatedHoldRows = await db.query(
    `
      UPDATE dalal_coin_holds
      SET status = 'consumed',
          consumed_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [holdId]
  );

  await recomputeDalalCoinBalanceCache(db, Number(hold.user_id));

  return {
    hold: updatedHoldRows.rows[0] || hold,
    transaction,
    alreadyConsumed: false,
    coinsSpent: totalSpent,
  };
}

async function createGrantIfMissing(
  db,
  {
    userId,
    amount,
    reasonCode,
    unlockRequirement = 'none',
    sourceType = '',
    sourceId = '',
    metadata = {},
  }
) {
  const existingGrant = await findGrantByReasonAndSource(db, {
    userId,
    reasonCode,
    sourceType,
    sourceId,
  });
  if (existingGrant) {
    return existingGrant;
  }

  return createDalalCoinGrant(db, {
    userId,
    amount,
    reasonCode,
    unlockRequirement,
    sourceType,
    sourceId,
    metadata,
  });
}

async function finalizeUserReferralAfterFirstPaid(db, referralRow) {
  const referrerUserId = Number(referralRow.referrer_user_id);
  const referralId = Number(referralRow.id);
  const referrerVerified = await isDalalCoinPhoneVerified(db, referrerUserId);
  const referrerGrant = await findGrantByReasonAndSource(db, {
    userId: referrerUserId,
    reasonCode: 'referral_referrer_bonus',
    sourceType: 'user_referral',
    sourceId: `${referralId}`,
  });

  if (referrerGrant && referrerGrant.status === 'pending') {
    if (referrerVerified) {
      await confirmDalalCoinGrant(db, Number(referrerGrant.id));
      await db.query(
        `
          UPDATE user_referrals
          SET status = 'completed',
              completed_at = COALESCE(completed_at, NOW()),
              updated_at = NOW()
          WHERE id = $1
        `,
        [referralId]
      );
      return 'completed';
    }

    await db.query(
      `
        UPDATE dalal_coin_grants
        SET unlock_requirement = 'phone_verification',
            updated_at = NOW()
        WHERE id = $1
      `,
      [referrerGrant.id]
    );
    await db.query(
      `
        UPDATE user_referrals
        SET status = 'pending_phone_verification',
            updated_at = NOW()
        WHERE id = $1
      `,
      [referralId]
    );
    return 'pending_phone_verification';
  }

  await db.query(
    `
      UPDATE user_referrals
      SET status = 'completed',
          completed_at = COALESCE(completed_at, NOW()),
          updated_at = NOW()
      WHERE id = $1
    `,
    [referralId]
  );
  return 'completed';
}

export async function registerDalalCoinSignup(
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

  await createGrantIfMissing(db, {
    userId,
    amount: DALAL_COIN_RULES.signupBonus,
    reasonCode: 'signup_bonus',
    unlockRequirement: 'phone_verification',
    sourceType: 'auth_signup',
    sourceId: `${userId}`,
  });

  const normalizedReferralCode = normalizeReferralCode(referralCode);
  if (!normalizedReferralCode) {
    return {
      personalReferralCode,
      referral: null,
    };
  }

  const referrer = await findUserByReferralCode(db, normalizedReferralCode);
  if (!referrer) {
    throw createDalalCoinError(400, 'Referral code is invalid.', 'dalal_coin_referral_invalid');
  }

  if (Number(referrer.id) === Number(userId)) {
    throw createDalalCoinError(400, 'You cannot refer yourself.', 'dalal_coin_referral_self');
  }

  const normalizedDeviceId = normalizeShortText(deviceId, 120);
  const normalizedIpAddress = normalizeIpAddress(ipAddress);
  let blockedReason = '';

  if (normalizedDeviceId) {
    const deviceRows = await db.query(
      `
        SELECT COUNT(*)::INT AS total
        FROM user_referrals
        WHERE signup_device_id = $1
          AND status <> 'blocked'
      `,
      [normalizedDeviceId]
    );

    if (toWholeCoins(deviceRows.rows[0]?.total) >= MAX_REWARDED_REFERRALS_PER_DEVICE) {
      blockedReason = 'duplicate_device';
    }
  }

  const ipRows = normalizedIpAddress
    ? await db.query(
        `
          SELECT COUNT(*)::INT AS total
          FROM user_referrals
          WHERE signup_ip_address = $1
            AND status <> 'blocked'
        `,
        [normalizedIpAddress]
      )
    : { rows: [{ total: 0 }] };

  await db.query(
    `
      UPDATE users
      SET referred_by_user_id = $2,
          referred_by = $2
      WHERE id = $1
    `,
    [userId, referrer.id]
  );

  const referralRows = await db.query(
    `
      INSERT INTO user_referrals (
        referrer_user_id,
        referred_user_id,
        referral_code,
        signup_device_id,
        signup_ip_address,
        status,
        blocked_reason,
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
        $8::jsonb
      )
      ON CONFLICT (referred_user_id)
      DO UPDATE SET
        referral_code = EXCLUDED.referral_code,
        signup_device_id = EXCLUDED.signup_device_id,
        signup_ip_address = EXCLUDED.signup_ip_address,
        status = EXCLUDED.status,
        blocked_reason = EXCLUDED.blocked_reason,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING *
    `,
    [
      referrer.id,
      userId,
      normalizedReferralCode,
      normalizedDeviceId,
      normalizedIpAddress,
      blockedReason ? 'blocked' : 'pending_phone_verification',
      blockedReason,
      JSON.stringify({
        riskSignals: {
          rewardedIpReferrals: toWholeCoins(ipRows.rows[0]?.total),
        },
      }),
    ]
  );

  const referralRow = referralRows.rows[0] || null;
  if (referralRow && referralRow.status !== 'blocked') {
    await createGrantIfMissing(db, {
      userId,
      amount: DALAL_COIN_RULES.referralBonusForNewUser,
      reasonCode: 'referral_new_user_bonus',
      unlockRequirement: 'phone_verification',
      sourceType: 'user_referral',
      sourceId: `${referralRow.id}`,
    });

    await createGrantIfMissing(db, {
      userId: Number(referralRow.referrer_user_id),
      amount: DALAL_COIN_RULES.referralBonusForReferrer,
      reasonCode: 'referral_referrer_bonus',
      unlockRequirement: 'referred_user_first_paid',
      sourceType: 'user_referral',
      sourceId: `${referralRow.id}`,
    });
  }

  return {
    personalReferralCode,
    referral: referralRow
      ? {
          id: Number(referralRow.id),
          status: referralRow.status,
          blockedReason: referralRow.blocked_reason || '',
          referrerUserId: Number(referralRow.referrer_user_id),
        }
      : null,
  };
}

export async function markDalalCoinPhoneVerified(
  db,
  {
    userId,
    phone = '',
  }
) {
  await ensureUserProfileRow(db, userId);

  const normalizedPhone = normalizeShortText(phone, 32);
  await db.query(
    `
      UPDATE users
      SET phone = CASE
            WHEN $2 <> '' THEN $2
            ELSE phone
          END
      WHERE id = $1
    `,
    [userId, normalizedPhone]
  );

  await db.query(
    `
      UPDATE user_profiles
      SET phone_verified_at = COALESCE(phone_verified_at, NOW()),
          updated_at = NOW()
      WHERE user_id = $1
    `,
    [userId]
  );

  const unlocked = await confirmPendingPhoneVerificationGrants(db, userId);
  const referredRows = await db.query(
    `
      SELECT *
      FROM user_referrals
      WHERE referred_user_id = $1
        AND status <> 'blocked'
      ORDER BY created_at ASC, id ASC
      FOR UPDATE
    `,
    [userId]
  );

  for (const referralRow of referredRows.rows) {
    const firstPaidOrderId = normalizeSourceId(referralRow.first_paid_order_id);
    if (firstPaidOrderId) {
      await finalizeUserReferralAfterFirstPaid(db, referralRow);
      continue;
    }

    await db.query(
      `
        UPDATE user_referrals
        SET status = 'pending_first_paid_action',
            updated_at = NOW()
        WHERE id = $1
      `,
      [referralRow.id]
    );
  }

  return {
    phoneVerified: true,
    unlocked,
  };
}

function computeCashbackCoinsForOrder({ orderKind, paidAmount, subtotalAmount = null }) {
  const normalizedKind = String(orderKind || '').trim().toLowerCase();
  if (normalizedKind === 'subscription') {
    return Math.max(
      0,
      Math.floor(
        (roundCurrency(paidAmount) * (DALAL_COIN_RULES.cashback.subscriptionPercent / 100))
        / DALAL_COIN_RULES.usage.subscription.coinValueInr
      )
    );
  }

  const cashbackBase = subtotalAmount === null || subtotalAmount === undefined
    ? roundCurrency(paidAmount)
    : roundCurrency(subtotalAmount);
  return Math.max(
    0,
    Math.floor(cashbackBase * (DALAL_COIN_RULES.cashback.ecommercePercent / 100))
  );
}

export async function handleSuccessfulPaidDalalCoinOrder(
  db,
  {
    userId,
    orderKind,
    orderReference,
    paidAmount,
    subtotalAmount = null,
    metadata = {},
  }
) {
  const normalizedOrderKind = normalizeSourceType(orderKind);
  const normalizedOrderReference = normalizeSourceId(orderReference);
  const phoneVerified = await isDalalCoinPhoneVerified(db, userId);

  await createGrantIfMissing(db, {
    userId,
    amount: DALAL_COIN_RULES.firstPurchaseBonus,
    reasonCode: 'first_purchase_bonus',
    unlockRequirement: phoneVerified ? 'none' : 'phone_verification',
    sourceType: normalizedOrderKind,
    sourceId: normalizedOrderReference,
    metadata,
  });

  const cashbackCoins = computeCashbackCoinsForOrder({
    orderKind: normalizedOrderKind,
    paidAmount,
    subtotalAmount,
  });
  if (cashbackCoins > 0) {
    await createGrantIfMissing(db, {
      userId,
      amount: cashbackCoins,
      reasonCode: 'cashback_reward',
      unlockRequirement: phoneVerified ? 'none' : 'phone_verification',
      sourceType: normalizedOrderKind,
      sourceId: normalizedOrderReference,
      metadata: {
        ...toSafeObject(metadata),
        paidAmount: roundCurrency(paidAmount),
        subtotalAmount: subtotalAmount === null ? null : roundCurrency(subtotalAmount),
      },
    });
  }

  const referralRows = await db.query(
    `
      SELECT *
      FROM user_referrals
      WHERE referred_user_id = $1
        AND status <> 'blocked'
      ORDER BY created_at ASC, id ASC
      LIMIT 1
      FOR UPDATE
    `,
    [userId]
  );

  if (referralRows.rowCount > 0) {
    const referralRow = referralRows.rows[0];
    await db.query(
      `
        UPDATE user_referrals
        SET first_paid_order_type = COALESCE(NULLIF(first_paid_order_type, ''), $2),
            first_paid_order_id = COALESCE(NULLIF(first_paid_order_id, ''), $3),
            updated_at = NOW()
        WHERE id = $1
      `,
      [referralRow.id, normalizedOrderKind, normalizedOrderReference]
    );

    await finalizeUserReferralAfterFirstPaid(db, {
      ...referralRow,
      first_paid_order_type: normalizedOrderKind,
      first_paid_order_id: normalizedOrderReference,
    });
  }

  return {
    cashbackCoins,
  };
}

function mapWalletTransaction(row) {
  const absoluteAmount = toWholeCoins(row.amount);
  return {
    id: Number(row.id),
    amount: row.type === 'credit' ? absoluteAmount : -absoluteAmount,
    absoluteAmount,
    direction: row.type === 'credit' ? 'credit' : 'debit',
    reasonCode: row.reason,
    referenceType: row.reference_type || '',
    referenceId: row.reference_id || '',
    grantId: row.grant_id ? Number(row.grant_id) : null,
    holdId: row.hold_id ? Number(row.hold_id) : null,
    expiresAt: row.expires_at || null,
    createdAt: row.created_at,
    metadata: toSafeObject(row.metadata),
  };
}

export async function getDalalCoinWallet(db, userId, { transactionLimit = DEFAULT_TRANSACTION_LIMIT } = {}) {
  await runDalalCoinMaintenance(db, userId);

  const userRows = await db.query(
    `
      SELECT
        u.id,
        u.name,
        u.email,
        u.referral_code,
        u.referred_by_user_id,
        u.referred_by,
        COALESCE(u.dalal_coin_balance, u.dalal_coins, 0)::INT AS dalal_coin_balance,
        COALESCE(u.dalal_coin_tier, 'silver') AS dalal_coin_tier,
        u.created_at,
        p.phone_verified_at
      FROM users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.id = $1
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
  const pendingRows = await db.query(
    `
      SELECT COALESCE(SUM(amount), 0)::INT AS total
      FROM dalal_coin_grants
      WHERE user_id = $1
        AND status = 'pending'
    `,
    [userId]
  );
  const expiringRows = await db.query(
    `
      SELECT id, reason_code, remaining_amount, expires_at
      FROM dalal_coin_grants
      WHERE user_id = $1
        AND status = 'confirmed'
        AND remaining_amount > 0
        AND expires_at IS NOT NULL
        AND expires_at > NOW()
      ORDER BY expires_at ASC, created_at ASC
      LIMIT 8
    `,
    [userId]
  );
  const transactionRows = await db.query(
    `
      SELECT *
      FROM dalal_coin_transactions
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2
    `,
    [userId, Math.max(1, Math.min(100, Number(transactionLimit) || DEFAULT_TRANSACTION_LIMIT))]
  );
  const analyticsRows = await db.query(
    `
      SELECT
        COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0)::INT AS total_earned,
        COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0)::INT AS total_used
      FROM dalal_coin_transactions
      WHERE user_id = $1
    `,
    [userId]
  );
  const holdRows = await db.query(
    `
      SELECT COALESCE(SUM(coins_amount), 0)::INT AS total
      FROM dalal_coin_holds
      WHERE user_id = $1
        AND status = 'active'
        AND expires_at > NOW()
    `,
    [userId]
  );

  const balance = toWholeCoins(userRow.dalal_coin_balance);
  const heldCoins = toWholeCoins(holdRows.rows[0]?.total);
  const pendingBalance = toWholeCoins(pendingRows.rows[0]?.total);
  const availableBalance = Math.max(0, balance - heldCoins);

  return {
    wallet: {
      userId: Number(userRow.id),
      balance,
      availableBalance,
      confirmedBalance: balance,
      pendingBalance,
      reservedCoins: heldCoins,
      heldCoins,
      spendableCoins: availableBalance,
      referralCode,
      referredByUserId:
        userRow.referred_by_user_id === null
          ? userRow.referred_by === null
            ? null
            : Number(userRow.referred_by)
          : Number(userRow.referred_by_user_id),
      phoneVerified: Boolean(userRow.phone_verified_at),
      tier: userRow.dalal_coin_tier || 'silver',
      tierLabel: tierLabel(userRow.dalal_coin_tier || 'silver'),
      lifetimeEarned: toWholeCoins(analyticsRows.rows[0]?.total_earned),
      lifetimeUsed: toWholeCoins(analyticsRows.rows[0]?.total_used),
      nextExpiryAt: expiringRows.rows[0]?.expires_at || null,
      expiringSoonCoins: expiringRows.rows.reduce(
        (sum, row) => sum + toWholeCoins(row.remaining_amount),
        0
      ),
      createdAt: userRow.created_at,
    },
    expiringLots: expiringRows.rows.map((row) => ({
      grantId: Number(row.id),
      reasonCode: row.reason_code,
      amount: toWholeCoins(row.remaining_amount),
      expiresAt: row.expires_at,
    })),
    transactions: transactionRows.rows.map(mapWalletTransaction),
  };
}

export async function getDalalCoinReferrals(db, userId) {
  const userRows = await db.query(
    `
      SELECT id, name, email
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
  const summaryRows = await db.query(
    `
      SELECT
        COUNT(*) FILTER (WHERE status = 'completed')::INT AS completed_count,
        COUNT(*) FILTER (WHERE status = 'pending_phone_verification')::INT AS pending_phone_verification_count,
        COUNT(*) FILTER (WHERE status = 'pending_first_paid_action')::INT AS pending_first_paid_action_count,
        COUNT(*) FILTER (WHERE status = 'blocked')::INT AS blocked_count
      FROM user_referrals
      WHERE referrer_user_id = $1
    `,
    [userId]
  );
  const earningsRows = await db.query(
    `
      SELECT COALESCE(SUM(amount), 0)::INT AS total
      FROM dalal_coin_transactions
      WHERE user_id = $1
        AND type = 'credit'
        AND reason = 'referral_referrer_bonus'
    `,
    [userId]
  );
  const referralRows = await db.query(
    `
      SELECT
        r.*,
        u.name AS referred_user_name,
        u.email AS referred_user_email
      FROM user_referrals r
      JOIN users u
        ON u.id = r.referred_user_id
      WHERE r.referrer_user_id = $1
      ORDER BY r.created_at DESC, r.id DESC
    `,
    [userId]
  );

  return {
    referralCode,
    sharePath: `/register?ref=${encodeURIComponent(referralCode)}`,
    summary: {
      completedCount: toWholeCoins(summaryRows.rows[0]?.completed_count),
      pendingPhoneVerificationCount: toWholeCoins(
        summaryRows.rows[0]?.pending_phone_verification_count
      ),
      pendingFirstPaidActionCount: toWholeCoins(
        summaryRows.rows[0]?.pending_first_paid_action_count
      ),
      blockedCount: toWholeCoins(summaryRows.rows[0]?.blocked_count),
      earnedCoins: toWholeCoins(earningsRows.rows[0]?.total),
    },
    referrals: referralRows.rows.map((row) => ({
      id: Number(row.id),
      status: row.status,
      blockedReason: row.blocked_reason || '',
      referralCode: row.referral_code,
      referredUserName: row.referred_user_name || '',
      referredUserEmail: row.referred_user_email || '',
      firstPaidOrderType: row.first_paid_order_type || '',
      firstPaidOrderId: row.first_paid_order_id || '',
      completedAt: row.completed_at,
      createdAt: row.created_at,
      metadata: toSafeObject(row.metadata),
    })),
  };
}
