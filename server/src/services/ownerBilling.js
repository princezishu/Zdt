import { pool } from '../db.js';

function toObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value;
}

async function hasColumn(db, tableName, columnName) {
  const rows = await db.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1
    `,
    [tableName, columnName]
  );
  return rows.rowCount > 0;
}

export function createBillingReceipt({ prefix, userId, subject }) {
  const safePrefix = String(prefix || 'ORD').trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || 'ORD';
  const safeSubject = String(subject || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 18);
  const parts = [
    safePrefix,
    `U${Number(userId) || 0}`,
    safeSubject || 'ITEM',
    `${Date.now()}`,
  ];
  return parts.join('-').slice(0, 120);
}

export function mapBillingOrderRow(row) {
  const metadata = toObject(row.metadata);
  return {
    id: Number(row.id),
    orderKind: row.order_kind,
    provider: row.provider,
    status: row.status,
    amount: Number(row.amount || 0),
    currencyCode: row.currency_code || 'INR',
    providerOrderId: row.provider_order_id || '',
    providerPaymentId: row.provider_payment_id || '',
    providerReceipt: row.provider_receipt || '',
    providerLastEventType: row.provider_last_event_type || '',
    relatedPlanId: row.related_plan_id || '',
    relatedPlanName: row.related_plan_name || '',
    relatedListingReference: row.related_listing_reference || '',
    activatedSubscriptionId: row.activated_subscription_id ? Number(row.activated_subscription_id) : null,
    fulfilledEntityType: row.fulfilled_entity_type || '',
    fulfilledEntityId: row.fulfilled_entity_id === null ? null : Number(row.fulfilled_entity_id),
    metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    paidAt: row.paid_at,
    failedAt: row.failed_at,
    expiresAt: row.expires_at,
  };
}

async function ensureOwnerProfileRow(db, userId) {
  await db.query(
    `
      INSERT INTO owner_profiles (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO NOTHING
    `,
    [userId]
  );
}

export async function activatePaidSubscriptionOrder(
  db,
  {
    userId,
    plan,
    billingOrderId = null,
    paymentReference = '',
    provider = 'razorpay',
    coinsUsed = 0,
    finalPrice = null,
  }
) {
  await ensureOwnerProfileRow(db, userId);
  const normalizedProvider = String(provider || '').trim().slice(0, 60);
  const normalizedPaymentReference = String(paymentReference || '').trim().slice(0, 120);
  const normalizedCoinsUsed = Math.max(0, Math.floor(Number(coinsUsed) || 0));
  const normalizedFinalPrice =
    finalPrice === null || finalPrice === undefined || finalPrice === ''
      ? null
      : Number(finalPrice);

  const legacyOwnerSubscriptionSchema = await hasColumn(db, 'subscriptions', 'owner_id');

  let subscriptionId = null;

  if (legacyOwnerSubscriptionSchema) {
    await db.query(
      `
        UPDATE subscriptions
        SET status = 'cancelled',
            end_date = COALESCE(end_date, CURRENT_DATE)
        WHERE owner_id = $1
          AND COALESCE(status, 'active') = 'active'
      `,
      [userId]
    );

    const inserted = await db.query(
      `
        INSERT INTO subscriptions (
          owner_id,
          plan_name,
          price,
          coins_used,
          final_price,
          start_date,
          end_date,
          status,
          provider,
          payment_reference
        )
        VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, NULL, 'active', $6, $7)
        RETURNING id
      `,
      [
        userId,
        plan.planName,
        Number(plan.monthlyPrice || 0),
        normalizedCoinsUsed,
        normalizedFinalPrice,
        normalizedProvider,
        normalizedPaymentReference,
      ]
    );
    subscriptionId = Number(inserted.rows[0]?.id || 0) || null;
  } else {
    const featuresJson = Object.fromEntries(
      Object.entries(plan.features || {}).map(([featureKey, value]) => [
        featureKey,
        typeof value === 'number' ? Number(value) : Boolean(value),
      ])
    );

    await db.query(
      `
        UPDATE subscriptions
        SET is_active = FALSE,
            status = 'cancelled',
            end_date = COALESCE(end_date, CURRENT_DATE),
            updated_at = NOW()
        WHERE user_id = $1
          AND is_active = TRUE
      `,
      [userId]
    );

    const inserted = await db.query(
      `
        INSERT INTO subscriptions (
          user_id,
          plan_id,
          subscription_tier,
          start_date,
          end_date,
          features_json,
          listing_quota,
          boost_credits,
          coins_used,
          final_price,
          is_active,
          created_by_user_id,
          status,
          provider,
          payment_reference
        )
        VALUES ($1, $2, $3, CURRENT_DATE, NULL, $4::jsonb, $5, $6, $7, $8, TRUE, $1, 'active', $9, $10)
        RETURNING id
      `,
      [
        userId,
        plan.planId,
        plan.tier,
        JSON.stringify(featuresJson),
        Number(plan.listingQuota || 0),
        Number(plan.boostCredits || 0),
        normalizedCoinsUsed,
        normalizedFinalPrice,
        normalizedProvider,
        normalizedPaymentReference,
      ]
    );
    subscriptionId = Number(inserted.rows[0]?.id || 0) || null;
  }

  await db.query(
    `
      UPDATE users
      SET subscription_tier = $1
      WHERE id = $2
    `,
    [plan.tier, userId]
  );

  await db.query(
    `
      UPDATE owner_profiles
      SET subscription_plan = $1,
          updated_at = NOW()
      WHERE user_id = $2
    `,
    [plan.planName, userId]
  );

  if (billingOrderId) {
    await db.query(
      `
        UPDATE billing_orders
        SET related_plan_id = $2,
            related_plan_name = $3,
            activated_subscription_id = $4,
            fulfilled_entity_type = 'subscription',
            fulfilled_entity_id = $4,
            updated_at = NOW()
        WHERE id = $1
      `,
      [billingOrderId, plan.planId, plan.planName, subscriptionId]
    );
  }

  return subscriptionId;
}

export async function listOwnerBillingOrders(db = pool, userId, { limit = 50 } = {}) {
  const rows = await db.query(
    `
      SELECT
        bo.*
      FROM billing_orders bo
      WHERE bo.user_id = $1
      ORDER BY bo.created_at DESC, bo.id DESC
      LIMIT $2
    `,
    [userId, Math.min(Math.max(Number(limit) || 50, 1), 200)]
  );

  return rows.rows.map(mapBillingOrderRow);
}
