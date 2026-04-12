import { pool } from '../../db.js';

function toIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function resolveAggregationDate(inputDate) {
  const normalized = toIsoDate(inputDate);
  if (normalized) return normalized;
  return new Date().toISOString().slice(0, 10);
}

export async function aggregateListingAnalyticsDay(inputDate) {
  const dayDate = resolveAggregationDate(inputDate);

  const propertyDaily = await pool.query(
    `
      WITH daily_events AS (
        SELECT
          e.property_request_id,
          COUNT(*) FILTER (WHERE e.event_type = 'view')::INT AS views_count,
          COUNT(*) FILTER (WHERE e.event_type = 'save')::INT AS saves_count,
          COUNT(*) FILTER (
            WHERE e.event_type = 'contact_click'
              AND COALESCE(e.metadata->>'action', '') NOT IN ('unlock_phone', 'call_click')
          )::INT AS contact_clicks_count,
          COUNT(*) FILTER (
            WHERE e.event_type = 'phone_unlock'
              OR (e.event_type = 'contact_click' AND COALESCE(e.metadata->>'action', '') = 'unlock_phone')
          )::INT AS phone_unlocks_count,
          COUNT(*) FILTER (
            WHERE e.event_type = 'call_click'
              OR (e.event_type = 'contact_click' AND COALESCE(e.metadata->>'action', '') = 'call_click')
          )::INT AS call_clicks_count,
          COUNT(*) FILTER (WHERE e.event_type = 'visit_request')::INT AS visit_requests_count,
          COUNT(*) FILTER (WHERE e.event_type = 'premium_cta')::INT AS premium_cta_count,
          COUNT(*) FILTER (
            WHERE e.event_type = 'premium_cta'
              AND COALESCE(e.metadata->>'assistType', '') = 'brochure'
          )::INT AS brochure_requests_count,
          COUNT(*) FILTER (
            WHERE e.event_type = 'premium_cta'
              AND COALESCE(e.metadata->>'assistType', '') = 'price_sheet'
          )::INT AS price_sheet_requests_count,
          COUNT(*) FILTER (
            WHERE e.event_type = 'premium_cta'
              AND COALESCE(e.metadata->>'assistType', '') = 'loan_help'
          )::INT AS loan_help_requests_count,
          COUNT(*) FILTER (WHERE e.event_type = 'conversion')::INT AS conversions_count,
          COUNT(*) FILTER (WHERE e.event_type = 'price_change')::INT AS price_changes_count,
          AVG(e.event_value) FILTER (WHERE e.event_type = 'price_change') AS average_price
        FROM listing_analytics_events e
        WHERE e.created_at >= $1::date
          AND e.created_at < ($1::date + INTERVAL '1 day')
        GROUP BY e.property_request_id
      )
      INSERT INTO property_analytics_daily (
        property_request_id,
        day_date,
        views_count,
        saves_count,
        contact_clicks_count,
        phone_unlocks_count,
        call_clicks_count,
        visit_requests_count,
        premium_cta_count,
        brochure_requests_count,
        price_sheet_requests_count,
        loan_help_requests_count,
        conversions_count,
        price_changes_count,
        conversion_ratio,
        average_price
      )
      SELECT
        d.property_request_id,
        $1::date,
        d.views_count,
        d.saves_count,
        d.contact_clicks_count,
        d.phone_unlocks_count,
        d.call_clicks_count,
        d.visit_requests_count,
        d.premium_cta_count,
        d.brochure_requests_count,
        d.price_sheet_requests_count,
        d.loan_help_requests_count,
        d.conversions_count,
        d.price_changes_count,
        CASE
          WHEN d.views_count > 0
            THEN ROUND((d.visit_requests_count::numeric * 100.0) / d.views_count::numeric, 2)
          ELSE 0
        END AS conversion_ratio,
        d.average_price
      FROM daily_events d
      ON CONFLICT (property_request_id, day_date)
      DO UPDATE SET
        views_count = EXCLUDED.views_count,
        saves_count = EXCLUDED.saves_count,
        contact_clicks_count = EXCLUDED.contact_clicks_count,
        phone_unlocks_count = EXCLUDED.phone_unlocks_count,
        call_clicks_count = EXCLUDED.call_clicks_count,
        visit_requests_count = EXCLUDED.visit_requests_count,
        premium_cta_count = EXCLUDED.premium_cta_count,
        brochure_requests_count = EXCLUDED.brochure_requests_count,
        price_sheet_requests_count = EXCLUDED.price_sheet_requests_count,
        loan_help_requests_count = EXCLUDED.loan_help_requests_count,
        conversions_count = EXCLUDED.conversions_count,
        price_changes_count = EXCLUDED.price_changes_count,
        conversion_ratio = EXCLUDED.conversion_ratio,
        average_price = EXCLUDED.average_price,
        updated_at = NOW()
      RETURNING id
    `,
    [dayDate]
  );

  const userDaily = await pool.query(
    `
      WITH user_listing_stats AS (
        SELECT
          pr.submitted_by_user_id AS user_id,
          COUNT(*)::INT AS listings_created
        FROM property_requests pr
        WHERE pr.submitted_by_user_id IS NOT NULL
          AND pr.created_at >= $1::date
          AND pr.created_at < ($1::date + INTERVAL '1 day')
        GROUP BY pr.submitted_by_user_id
      ),
      user_event_stats AS (
        SELECT
          pr.submitted_by_user_id AS user_id,
          COUNT(*) FILTER (WHERE e.event_type = 'view')::INT AS total_views,
          COUNT(*) FILTER (WHERE e.event_type = 'save')::INT AS total_saves,
          COUNT(*) FILTER (
            WHERE e.event_type IN ('contact_click', 'phone_unlock', 'call_click', 'premium_cta', 'visit_request')
              OR (e.event_type = 'contact_click' AND COALESCE(e.metadata->>'action', '') IN ('unlock_phone', 'call_click'))
          )::INT AS total_contacts
        FROM listing_analytics_events e
        INNER JOIN property_requests pr
          ON pr.id = e.property_request_id
        WHERE pr.submitted_by_user_id IS NOT NULL
          AND e.created_at >= $1::date
          AND e.created_at < ($1::date + INTERVAL '1 day')
        GROUP BY pr.submitted_by_user_id
      ),
      merged AS (
        SELECT
          COALESCE(ls.user_id, es.user_id) AS user_id,
          COALESCE(ls.listings_created, 0) AS listings_created,
          COALESCE(es.total_views, 0) AS total_views,
          COALESCE(es.total_saves, 0) AS total_saves,
          COALESCE(es.total_contacts, 0) AS total_contacts
        FROM user_listing_stats ls
        FULL OUTER JOIN user_event_stats es
          ON es.user_id = ls.user_id
      )
      INSERT INTO user_analytics (
        user_id,
        day_date,
        listings_created,
        total_views,
        total_saves,
        total_contacts
      )
      SELECT
        m.user_id,
        $1::date,
        m.listings_created,
        m.total_views,
        m.total_saves,
        m.total_contacts
      FROM merged m
      WHERE m.user_id IS NOT NULL
      ON CONFLICT (user_id, day_date)
      DO UPDATE SET
        listings_created = EXCLUDED.listings_created,
        total_views = EXCLUDED.total_views,
        total_saves = EXCLUDED.total_saves,
        total_contacts = EXCLUDED.total_contacts,
        updated_at = NOW()
      RETURNING id
    `,
    [dayDate]
  );

  const leadDaily = await pool.query(
    `
      WITH lead_stats AS (
        SELECT
          e.property_request_id,
          COUNT(*) FILTER (
            WHERE e.event_type IN ('contact_click', 'phone_unlock', 'call_click', 'premium_cta')
              OR (e.event_type = 'contact_click' AND COALESCE(e.metadata->>'action', '') IN ('unlock_phone', 'call_click'))
          )::INT AS leads_generated,
          COUNT(*) FILTER (WHERE e.event_type = 'visit_request')::INT AS visit_requests,
          COUNT(*) FILTER (WHERE e.event_type = 'conversion')::INT AS conversions
        FROM listing_analytics_events e
        WHERE e.created_at >= $1::date
          AND e.created_at < ($1::date + INTERVAL '1 day')
        GROUP BY e.property_request_id
      )
      INSERT INTO lead_analytics (
        property_request_id,
        day_date,
        leads_generated,
        lead_to_visit_ratio,
        lead_to_sale_ratio
      )
      SELECT
        l.property_request_id,
        $1::date,
        l.leads_generated,
        CASE
          WHEN l.leads_generated > 0
            THEN ROUND((l.visit_requests::numeric * 100.0) / l.leads_generated::numeric, 2)
          ELSE 0
        END AS lead_to_visit_ratio,
        CASE
          WHEN l.leads_generated > 0
            THEN ROUND((l.conversions::numeric * 100.0) / l.leads_generated::numeric, 2)
          ELSE 0
        END AS lead_to_sale_ratio
      FROM lead_stats l
      ON CONFLICT (property_request_id, day_date)
      DO UPDATE SET
        leads_generated = EXCLUDED.leads_generated,
        lead_to_visit_ratio = EXCLUDED.lead_to_visit_ratio,
        lead_to_sale_ratio = EXCLUDED.lead_to_sale_ratio,
        updated_at = NOW()
      RETURNING id
    `,
    [dayDate]
  );

  return {
    dayDate,
    propertyRows: propertyDaily.rowCount,
    userRows: userDaily.rowCount,
    leadRows: leadDaily.rowCount,
  };
}

export async function runAnalyticsAggregationJob(inputDate) {
  return aggregateListingAnalyticsDay(inputDate);
}

let analyticsSchedulerHandle = null;
let analyticsSchedulerRunning = false;

export function startPropertyAnalyticsScheduler({
  intervalMs = 60 * 60 * 1000,
  onTick,
} = {}) {
  if (analyticsSchedulerHandle) {
    return analyticsSchedulerHandle;
  }

  const runner = async () => {
    if (analyticsSchedulerRunning) return;
    analyticsSchedulerRunning = true;
    try {
      if (typeof onTick === 'function') {
        await onTick();
      } else {
        await runAnalyticsAggregationJob();
      }
    } catch (error) {
      console.error('[ANALYTICS] Aggregation job failed:', error);
    } finally {
      analyticsSchedulerRunning = false;
    }
  };

  void runner();
  analyticsSchedulerHandle = setInterval(runner, Math.max(60_000, Number(intervalMs) || 60 * 60 * 1000));
  return analyticsSchedulerHandle;
}
