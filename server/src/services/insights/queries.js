import { pool } from '../../db.js';
import {
  addMonths,
  clearInsightsCache,
  monthStart,
  parseBudgetToRupees,
  roundTo2,
  truncate,
  withCache,
} from './helpers.js';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const NEWS_TTL_MS = 2 * 60 * 1000;
const MARKET_TTL_MS = 5 * 60 * 1000;
const PROJECTS_TTL_MS = 3 * 60 * 1000;

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function toStringOrEmpty(value) {
  if (typeof value === 'string') return value.trim();
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeBoolean(value, fallback = null) {
  if (typeof value === 'boolean') return value;
  const raw = toStringOrEmpty(value).toLowerCase();
  if (!raw) return fallback;
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  return fallback;
}

function normalizeDateOnly(value) {
  const raw = toStringOrEmpty(value);
  if (!raw) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return '';
  return raw;
}

function isUuid(value) {
  return UUID_REGEX.test(toStringOrEmpty(value));
}

function toMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return roundTo2(num);
}

function mapNewsRow(row) {
  return {
    id: row.id,
    sourceId: row.source_id,
    source: row.source_name,
    title: row.title,
    url: row.url,
    imageUrl: row.image_url,
    snippet: row.snippet,
    category: row.category,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    clickCount: Number(row.click_count || 0),
  };
}

function mapMarketRow(row) {
  return {
    city: row.city,
    period: row.period,
    avgPriceSqft: toMoney(row.avg_price_sqft) || 0,
    momChange: toMoney(row.mom_change),
    yoyChange: toMoney(row.yoy_change),
    source: row.source,
    fetchedAt: row.fetched_at,
  };
}

function mapAnnouncementRow(row) {
  const parsedBudget = parseBudgetToRupees(row.price_hint);

  return {
    id: row.id,
    builderSourceId: row.builder_source_id,
    builderName: row.builder_name,
    sourceType: row.source_type,
    sourceUrl: row.source_url,
    title: row.title,
    url: row.url,
    city: row.city,
    locality: row.locality,
    priceHint: row.price_hint,
    priceHintValue: parsedBudget,
    possessionHint: row.possession_hint,
    status: row.status,
    publishedAt: row.published_at,
    createdAt: row.created_at,
  };
}

function buildNewsWhere(filters) {
  const clauses = [];
  const values = [];

  const source = toStringOrEmpty(filters.source);
  if (source) {
    if (isUuid(source)) {
      values.push(source);
      clauses.push(`na.source_id = $${values.length}`);
    } else {
      values.push(`%${source}%`);
      clauses.push(`ns.name ILIKE $${values.length}`);
    }
  }

  const category = toStringOrEmpty(filters.category);
  if (category) {
    values.push(`%${category}%`);
    clauses.push(`COALESCE(na.category, '') ILIKE $${values.length}`);
  }

  const search = toStringOrEmpty(filters.search);
  if (search) {
    values.push(`%${search}%`);
    clauses.push(`(na.title ILIKE $${values.length} OR COALESCE(na.snippet, '') ILIKE $${values.length})`);
  }

  const fromDate = normalizeDateOnly(filters.fromDate);
  if (fromDate) {
    values.push(fromDate);
    clauses.push(`COALESCE(na.published_at, na.created_at) >= $${values.length}::date`);
  }

  const toDate = normalizeDateOnly(filters.toDate);
  if (toDate) {
    values.push(toDate);
    clauses.push(`COALESCE(na.published_at, na.created_at) < ($${values.length}::date + INTERVAL '1 day')`);
  }

  return {
    values,
    whereClause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
  };
}

function buildProjectWhere(filters) {
  const clauses = [];
  const values = [];

  const builder = toStringOrEmpty(filters.builder);
  if (builder) {
    if (isUuid(builder)) {
      values.push(builder);
      clauses.push(`pa.builder_source_id = $${values.length}`);
    } else {
      values.push(`%${builder}%`);
      clauses.push(`bs.builder_name ILIKE $${values.length}`);
    }
  }

  const city = toStringOrEmpty(filters.city);
  if (city) {
    values.push(`%${city}%`);
    clauses.push(`COALESCE(pa.city, '') ILIKE $${values.length}`);
  }

  const status = toStringOrEmpty(filters.status);
  if (status) {
    values.push(status);
    clauses.push(`LOWER(COALESCE(pa.status, 'announcement')) = LOWER($${values.length})`);
  }

  const search = toStringOrEmpty(filters.search);
  if (search) {
    values.push(`%${search}%`);
    clauses.push(`(
      pa.title ILIKE $${values.length}
      OR COALESCE(pa.city, '') ILIKE $${values.length}
      OR COALESCE(pa.locality, '') ILIKE $${values.length}
      OR COALESCE(pa.price_hint, '') ILIKE $${values.length}
      OR COALESCE(pa.possession_hint, '') ILIKE $${values.length}
    )`);
  }

  const fromDate = normalizeDateOnly(filters.fromDate);
  if (fromDate) {
    values.push(fromDate);
    clauses.push(`COALESCE(pa.published_at, pa.created_at) >= $${values.length}::date`);
  }

  const toDate = normalizeDateOnly(filters.toDate);
  if (toDate) {
    values.push(toDate);
    clauses.push(`COALESCE(pa.published_at, pa.created_at) < ($${values.length}::date + INTERVAL '1 day')`);
  }

  return {
    values,
    whereClause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
  };
}

function byPublishedDesc(a, b) {
  return new Date(b.publishedAt || b.createdAt).getTime() - new Date(a.publishedAt || a.createdAt).getTime();
}

export async function listNewsFeed(options = {}) {
  const limit = clampInt(options.limit, 20, 1, 80);
  const offset = clampInt(options.offset, 0, 0, 5000);

  const normalized = {
    source: toStringOrEmpty(options.source),
    category: toStringOrEmpty(options.category),
    search: toStringOrEmpty(options.search),
    fromDate: normalizeDateOnly(options.fromDate),
    toDate: normalizeDateOnly(options.toDate),
    limit,
    offset,
  };

  const cacheKey = `insights:news:feed:${JSON.stringify(normalized)}`;

  return withCache(cacheKey, NEWS_TTL_MS, async () => {
    const filter = buildNewsWhere(normalized);

    const listValues = [...filter.values, limit, offset];
    const listRows = await pool.query(
      `
        SELECT
          na.id,
          na.source_id,
          ns.name AS source_name,
          na.title,
          na.url,
          na.image_url,
          na.snippet,
          na.category,
          na.published_at,
          na.created_at,
          COALESCE(clicks.total_clicks, 0)::INT AS click_count
        FROM news_articles na
        JOIN news_sources ns
          ON ns.id = na.source_id
        LEFT JOIN (
          SELECT article_id, COUNT(*)::INT AS total_clicks
          FROM news_clicks
          GROUP BY article_id
        ) clicks
          ON clicks.article_id = na.id
        ${filter.whereClause}
        ORDER BY COALESCE(na.published_at, na.created_at) DESC
        LIMIT $${filter.values.length + 1}
        OFFSET $${filter.values.length + 2}
      `,
      listValues
    );

    const countRows = await pool.query(
      `
        SELECT COUNT(*)::INT AS total
        FROM news_articles na
        JOIN news_sources ns
          ON ns.id = na.source_id
        ${filter.whereClause}
      `,
      filter.values
    );

    const trendingRows = await pool.query(
      `
        SELECT
          na.id,
          na.source_id,
          ns.name AS source_name,
          na.title,
          na.url,
          na.image_url,
          na.snippet,
          na.category,
          na.published_at,
          na.created_at,
          COUNT(nc.id)::INT AS click_count
        FROM news_articles na
        JOIN news_sources ns
          ON ns.id = na.source_id
        LEFT JOIN news_clicks nc
          ON nc.article_id = na.id
         AND nc.clicked_at >= NOW() - INTERVAL '30 days'
        GROUP BY na.id, ns.name
        ORDER BY click_count DESC, COALESCE(na.published_at, na.created_at) DESC
        LIMIT 6
      `
    );

    const sourceRows = await pool.query(
      `
        SELECT
          id,
          name,
          rss_url,
          is_active,
          created_at
        FROM news_sources
        ORDER BY is_active DESC, name ASC
      `
    );

    const categoryRows = await pool.query(
      `
        SELECT DISTINCT category
        FROM news_articles
        WHERE category IS NOT NULL
          AND category <> ''
        ORDER BY category ASC
        LIMIT 80
      `
    );

    const freshnessRows = await pool.query(
      `
        SELECT
          MAX(COALESCE(published_at, created_at)) AS last_updated
        FROM news_articles
      `
    );

    return {
      items: listRows.rows.map(mapNewsRow),
      trending: trendingRows.rows.map(mapNewsRow),
      pagination: {
        total: Number(countRows.rows[0]?.total || 0),
        limit,
        offset,
      },
      filters: {
        sources: sourceRows.rows.map((row) => ({
          id: row.id,
          name: row.name,
          rssUrl: row.rss_url,
          isActive: Boolean(row.is_active),
        })),
        categories: categoryRows.rows.map((row) => row.category).filter(Boolean),
      },
      lastUpdated: freshnessRows.rows[0]?.last_updated || null,
      dataSource: 'RSS metadata feed (title/snippet/url/thumbnail). Full article remains on publisher site.',
    };
  });
}

export async function recordNewsClick({ articleId, userId = null }) {
  const rows = await pool.query(
    `
      INSERT INTO news_clicks (article_id, user_id, clicked_at)
      SELECT id, $2, NOW()
      FROM news_articles
      WHERE id = $1
      RETURNING id
    `,
    [articleId, userId]
  );

  if (rows.rowCount > 0) {
    clearInsightsCache('insights:news');
    return true;
  }

  return false;
}

export async function listNewsSources() {
  const rows = await pool.query(
    `
      SELECT
        ns.id,
        ns.name,
        ns.rss_url,
        ns.is_active,
        ns.created_at,
        COUNT(na.id)::INT AS article_count
      FROM news_sources ns
      LEFT JOIN news_articles na
        ON na.source_id = ns.id
      GROUP BY ns.id
      ORDER BY ns.is_active DESC, ns.name ASC
    `
  );

  return rows.rows.map((row) => ({
    id: row.id,
    name: row.name,
    rssUrl: row.rss_url,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    articleCount: Number(row.article_count || 0),
  }));
}

export async function createNewsSource(payload) {
  const rows = await pool.query(
    `
      INSERT INTO news_sources (name, rss_url, is_active)
      VALUES ($1, $2, $3)
      RETURNING id, name, rss_url, is_active, created_at
    `,
    [truncate(payload.name, 140), payload.rssUrl, payload.isActive ?? true]
  );

  clearInsightsCache('insights:news');

  return {
    id: rows.rows[0].id,
    name: rows.rows[0].name,
    rssUrl: rows.rows[0].rss_url,
    isActive: Boolean(rows.rows[0].is_active),
    createdAt: rows.rows[0].created_at,
  };
}

export async function updateNewsSource(id, payload) {
  const updates = [];
  const values = [];

  if (payload.name !== undefined) {
    values.push(truncate(payload.name, 140));
    updates.push(`name = $${values.length}`);
  }
  if (payload.rssUrl !== undefined) {
    values.push(payload.rssUrl);
    updates.push(`rss_url = $${values.length}`);
  }
  if (payload.isActive !== undefined) {
    values.push(payload.isActive);
    updates.push(`is_active = $${values.length}`);
  }

  if (updates.length === 0) {
    return null;
  }

  values.push(id);

  const rows = await pool.query(
    `
      UPDATE news_sources
      SET ${updates.join(', ')}
      WHERE id = $${values.length}
      RETURNING id, name, rss_url, is_active, created_at
    `,
    values
  );

  if (rows.rowCount === 0) {
    return null;
  }

  clearInsightsCache('insights:news');

  return {
    id: rows.rows[0].id,
    name: rows.rows[0].name,
    rssUrl: rows.rows[0].rss_url,
    isActive: Boolean(rows.rows[0].is_active),
    createdAt: rows.rows[0].created_at,
  };
}

export async function listMarketTopCities(options = {}) {
  const limit = clampInt(options.limit, 10, 1, 50);

  return withCache(`insights:market:top:${limit}`, MARKET_TTL_MS, async () => {
    const rows = await pool.query(
      `
        WITH latest_per_city AS (
          SELECT DISTINCT ON (LOWER(city))
            city,
            period,
            avg_price_sqft,
            mom_change,
            yoy_change,
            source,
            fetched_at
          FROM market_city_prices
          ORDER BY LOWER(city), period DESC, fetched_at DESC
        )
        SELECT city, period, avg_price_sqft, mom_change, yoy_change, source, fetched_at
        FROM latest_per_city
        ORDER BY avg_price_sqft DESC
        LIMIT $1
      `,
      [limit]
    );

    const updatedRows = await pool.query(
      `
        SELECT MAX(fetched_at) AS last_updated
        FROM market_city_prices
      `
    );

    const mapped = rows.rows.map(mapMarketRow);
    return {
      cities: mapped,
      allCities: mapped.map((item) => item.city),
      lastUpdated: updatedRows.rows[0]?.last_updated || null,
      dataSource: 'Daily snapshot pipeline (API provider when configured, otherwise simulation with stored history).',
    };
  });
}

export async function listMarketTrend(options = {}) {
  const city = toStringOrEmpty(options.city);
  const limit = clampInt(options.limit, 24, 3, 120);

  if (!city) {
    return {
      city: '',
      trend: [],
      lastUpdated: null,
      dataSource: 'Daily market snapshots',
    };
  }

  const cacheKey = `insights:market:trend:${city.toLowerCase()}:${limit}`;

  return withCache(cacheKey, MARKET_TTL_MS, async () => {
    const rows = await pool.query(
      `
        WITH ranked AS (
          SELECT
            city,
            period,
            avg_price_sqft,
            mom_change,
            yoy_change,
            source,
            fetched_at,
            ROW_NUMBER() OVER (PARTITION BY period ORDER BY fetched_at DESC) AS rn
          FROM market_city_prices
          WHERE LOWER(city) = LOWER($1)
        )
        SELECT city, period, avg_price_sqft, mom_change, yoy_change, source, fetched_at
        FROM ranked
        WHERE rn = 1
        ORDER BY period DESC
        LIMIT $2
      `,
      [city, limit]
    );

    const mapped = rows.rows.map(mapMarketRow).reverse();

    const latest = mapped[mapped.length - 1] || null;

    return {
      city: latest?.city || city,
      trend: mapped,
      lastUpdated: latest?.fetchedAt || null,
      dataSource: latest?.source || 'n/a',
    };
  });
}

export async function listMarketCompare(options = {}) {
  const rawCities = Array.isArray(options.cities) ? options.cities : [];
  const cities = Array.from(
    new Set(
      rawCities
        .map((value) => toStringOrEmpty(value))
        .filter(Boolean)
        .slice(0, 5)
    )
  );

  const months = clampInt(options.months, 24, 6, 120);
  if (cities.length < 2) {
    return {
      cities,
      latest: [],
      trend: [],
      series: [],
      summary: {
        highestPriceCity: null,
        fastestGrowthCity: null,
      },
      lastUpdated: null,
      dataSource: 'Daily market snapshots',
    };
  }

  const cacheKey = `insights:market:compare:${JSON.stringify({ cities: cities.map((c) => c.toLowerCase()), months })}`;

  return withCache(cacheKey, MARKET_TTL_MS, async () => {
    const minPeriod = addMonths(monthStart(new Date()), -(months - 1)).toISOString().slice(0, 10);
    const normalizedCities = cities.map((item) => item.toLowerCase());

    const rows = await pool.query(
      `
        WITH ranked AS (
          SELECT
            city,
            period,
            avg_price_sqft,
            mom_change,
            yoy_change,
            source,
            fetched_at,
            ROW_NUMBER() OVER (
              PARTITION BY LOWER(city), period
              ORDER BY fetched_at DESC
            ) AS rn
          FROM market_city_prices
          WHERE LOWER(city) = ANY($1::text[])
            AND period >= $2::date
        )
        SELECT city, period, avg_price_sqft, mom_change, yoy_change, source, fetched_at
        FROM ranked
        WHERE rn = 1
        ORDER BY period ASC, city ASC
      `,
      [normalizedCities, minPeriod]
    );

    const mapped = rows.rows.map(mapMarketRow);

    const latestByCity = new Map();
    const periodSeries = new Map();

    for (const row of mapped) {
      latestByCity.set(row.city.toLowerCase(), row);
      const key = row.period;
      if (!periodSeries.has(key)) {
        periodSeries.set(key, { period: key });
      }
      const bucket = periodSeries.get(key);
      bucket[row.city] = row.avgPriceSqft;
    }

    const latest = Array.from(latestByCity.values()).sort((a, b) => b.avgPriceSqft - a.avgPriceSqft);

    const highestPriceCity = latest[0] || null;
    const growthCandidates = latest
      .map((row) => {
        if (row.momChange !== null) {
          return { city: row.city, metric: 'MoM', value: row.momChange };
        }
        if (row.yoyChange !== null) {
          return { city: row.city, metric: 'YoY', value: row.yoyChange };
        }
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => b.value - a.value);

    return {
      cities,
      latest,
      trend: mapped,
      series: Array.from(periodSeries.values()).sort((a, b) => String(a.period).localeCompare(String(b.period))),
      summary: {
        highestPriceCity,
        fastestGrowthCity: growthCandidates[0] || null,
      },
      lastUpdated: latest.reduce((latestTs, row) => {
        const ts = new Date(row.fetchedAt || 0).getTime();
        return ts > latestTs ? ts : latestTs;
      }, 0)
        ? new Date(
            latest.reduce((latestTs, row) => {
              const ts = new Date(row.fetchedAt || 0).getTime();
              return ts > latestTs ? ts : latestTs;
            }, 0)
          ).toISOString()
        : null,
      dataSource: 'Market city daily snapshots (provider or simulation fallback).',
    };
  });
}

export async function listProjectAnnouncements(options = {}) {
  const limit = clampInt(options.limit, 20, 1, 100);
  const offset = clampInt(options.offset, 0, 0, 5000);

  const normalized = {
    builder: toStringOrEmpty(options.builder),
    city: toStringOrEmpty(options.city),
    status: toStringOrEmpty(options.status),
    search: toStringOrEmpty(options.search),
    fromDate: normalizeDateOnly(options.fromDate),
    toDate: normalizeDateOnly(options.toDate),
    budgetMin: Number.isFinite(Number(options.budgetMin)) ? Number(options.budgetMin) : null,
    budgetMax: Number.isFinite(Number(options.budgetMax)) ? Number(options.budgetMax) : null,
    limit,
    offset,
  };

  const cacheKey = `insights:projects:list:${JSON.stringify(normalized)}`;

  return withCache(cacheKey, PROJECTS_TTL_MS, async () => {
    const filter = buildProjectWhere(normalized);

    const hasBudgetFilter =
      (normalized.budgetMin !== null && normalized.budgetMin > 0) ||
      (normalized.budgetMax !== null && normalized.budgetMax > 0);

    const listLimit = hasBudgetFilter
      ? Math.min(normalized.offset + normalized.limit + 1200, 2000)
      : normalized.limit;
    const listOffset = hasBudgetFilter ? 0 : normalized.offset;

    const listValues = [...filter.values, listLimit, listOffset];

    const listRows = await pool.query(
      `
        SELECT
          pa.id,
          pa.builder_source_id,
          pa.title,
          pa.url,
          pa.city,
          pa.locality,
          pa.price_hint,
          pa.possession_hint,
          pa.status,
          pa.published_at,
          pa.created_at,
          bs.builder_name,
          bs.source_type,
          bs.source_url
        FROM project_announcements pa
        JOIN builder_sources bs
          ON bs.id = pa.builder_source_id
        ${filter.whereClause}
        ORDER BY COALESCE(pa.published_at, pa.created_at) DESC, pa.created_at DESC
        LIMIT $${filter.values.length + 1}
        OFFSET $${filter.values.length + 2}
      `,
      listValues
    );

    const mapped = listRows.rows.map(mapAnnouncementRow).sort(byPublishedDesc);

    const budgetFiltered = mapped.filter((item) => {
      if (normalized.budgetMin !== null && normalized.budgetMin > 0) {
        if (item.priceHintValue === null || item.priceHintValue < normalized.budgetMin) {
          return false;
        }
      }

      if (normalized.budgetMax !== null && normalized.budgetMax > 0) {
        if (item.priceHintValue === null || item.priceHintValue > normalized.budgetMax) {
          return false;
        }
      }

      return true;
    });

    const paged = hasBudgetFilter
      ? budgetFiltered.slice(normalized.offset, normalized.offset + normalized.limit)
      : budgetFiltered;

    const countRows = hasBudgetFilter
      ? [{ total: budgetFiltered.length }]
      : (
          await pool.query(
            `
              SELECT COUNT(*)::INT AS total
              FROM project_announcements pa
              JOIN builder_sources bs
                ON bs.id = pa.builder_source_id
              ${filter.whereClause}
            `,
            filter.values
          )
        ).rows;

    const builderRows = await pool.query(
      `
        SELECT id, builder_name, source_type, source_url, is_active
        FROM builder_sources
        ORDER BY is_active DESC, builder_name ASC
      `
    );

    const cityRows = await pool.query(
      `
        SELECT DISTINCT city
        FROM project_announcements
        WHERE city IS NOT NULL
          AND city <> ''
        ORDER BY city ASC
        LIMIT 120
      `
    );

    const statusRows = await pool.query(
      `
        SELECT DISTINCT status
        FROM project_announcements
        WHERE status IS NOT NULL
          AND status <> ''
        ORDER BY status ASC
      `
    );

    const updatedRows = await pool.query(
      `
        SELECT MAX(COALESCE(published_at, created_at)) AS last_updated
        FROM project_announcements
      `
    );

    return {
      announcements: paged,
      pagination: {
        total: Number(countRows[0]?.total || 0),
        limit: normalized.limit,
        offset: normalized.offset,
      },
      filters: {
        builders: builderRows.rows.map((row) => ({
          id: row.id,
          builderName: row.builder_name,
          sourceType: row.source_type,
          sourceUrl: row.source_url,
          isActive: Boolean(row.is_active),
        })),
        cities: cityRows.rows.map((row) => row.city).filter(Boolean),
        statuses: statusRows.rows.map((row) => row.status).filter(Boolean),
      },
      lastUpdated: updatedRows.rows[0]?.last_updated || null,
      dataSource: 'Builder announcement feeds (RSS metadata + extracted hints).',
    };
  });
}

export async function getProjectAnnouncementById(id) {
  return withCache(`insights:projects:detail:${id}`, PROJECTS_TTL_MS, async () => {
    const rows = await pool.query(
      `
        SELECT
          pa.id,
          pa.builder_source_id,
          pa.title,
          pa.url,
          pa.city,
          pa.locality,
          pa.price_hint,
          pa.possession_hint,
          pa.status,
          pa.published_at,
          pa.created_at,
          bs.builder_name,
          bs.source_type,
          bs.source_url
        FROM project_announcements pa
        JOIN builder_sources bs
          ON bs.id = pa.builder_source_id
        WHERE pa.id = $1
        LIMIT 1
      `,
      [id]
    );

    if (rows.rowCount === 0) {
      return null;
    }

    const announcement = mapAnnouncementRow(rows.rows[0]);

    const timelineRows = await pool.query(
      `
        SELECT
          pa.id,
          pa.builder_source_id,
          pa.title,
          pa.url,
          pa.city,
          pa.locality,
          pa.price_hint,
          pa.possession_hint,
          pa.status,
          pa.published_at,
          pa.created_at,
          bs.builder_name,
          bs.source_type,
          bs.source_url
        FROM project_announcements pa
        JOIN builder_sources bs
          ON bs.id = pa.builder_source_id
        WHERE pa.builder_source_id = $1
        ORDER BY COALESCE(pa.published_at, pa.created_at) DESC, pa.created_at DESC
        LIMIT 24
      `,
      [announcement.builderSourceId]
    );

    return {
      announcement,
      timeline: timelineRows.rows.map(mapAnnouncementRow),
      dataSource: 'Builder announcement feed metadata.',
    };
  });
}

export async function listBuilderSources() {
  const rows = await pool.query(
    `
      SELECT
        bs.id,
        bs.builder_name,
        bs.source_type,
        bs.source_url,
        bs.is_active,
        bs.created_at,
        COUNT(pa.id)::INT AS announcement_count
      FROM builder_sources bs
      LEFT JOIN project_announcements pa
        ON pa.builder_source_id = bs.id
      GROUP BY bs.id
      ORDER BY bs.is_active DESC, bs.builder_name ASC
    `
  );

  return rows.rows.map((row) => ({
    id: row.id,
    builderName: row.builder_name,
    sourceType: row.source_type,
    sourceUrl: row.source_url,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    announcementCount: Number(row.announcement_count || 0),
  }));
}

export async function createBuilderSource(payload) {
  const rows = await pool.query(
    `
      INSERT INTO builder_sources (builder_name, source_type, source_url, is_active)
      VALUES ($1, $2, $3, $4)
      RETURNING id, builder_name, source_type, source_url, is_active, created_at
    `,
    [truncate(payload.builderName, 160), payload.sourceType || 'rss', payload.sourceUrl, payload.isActive ?? true]
  );

  clearInsightsCache('insights:projects');

  return {
    id: rows.rows[0].id,
    builderName: rows.rows[0].builder_name,
    sourceType: rows.rows[0].source_type,
    sourceUrl: rows.rows[0].source_url,
    isActive: Boolean(rows.rows[0].is_active),
    createdAt: rows.rows[0].created_at,
  };
}

export async function updateBuilderSource(id, payload) {
  const updates = [];
  const values = [];

  if (payload.builderName !== undefined) {
    values.push(truncate(payload.builderName, 160));
    updates.push(`builder_name = $${values.length}`);
  }
  if (payload.sourceType !== undefined) {
    values.push(payload.sourceType);
    updates.push(`source_type = $${values.length}`);
  }
  if (payload.sourceUrl !== undefined) {
    values.push(payload.sourceUrl);
    updates.push(`source_url = $${values.length}`);
  }
  if (payload.isActive !== undefined) {
    values.push(payload.isActive);
    updates.push(`is_active = $${values.length}`);
  }

  if (updates.length === 0) {
    return null;
  }

  values.push(id);

  const rows = await pool.query(
    `
      UPDATE builder_sources
      SET ${updates.join(', ')}
      WHERE id = $${values.length}
      RETURNING id, builder_name, source_type, source_url, is_active, created_at
    `,
    values
  );

  if (rows.rowCount === 0) {
    return null;
  }

  clearInsightsCache('insights:projects');

  return {
    id: rows.rows[0].id,
    builderName: rows.rows[0].builder_name,
    sourceType: rows.rows[0].source_type,
    sourceUrl: rows.rows[0].source_url,
    isActive: Boolean(rows.rows[0].is_active),
    createdAt: rows.rows[0].created_at,
  };
}

export async function listJobRuns(options = {}) {
  const limit = clampInt(options.limit, 50, 1, 300);

  const rows = await pool.query(
    `
      SELECT
        id,
        job_name,
        status,
        started_at,
        finished_at,
        items_fetched,
        items_inserted,
        error
      FROM job_runs
      ORDER BY started_at DESC
      LIMIT $1
    `,
    [limit]
  );

  return rows.rows.map((row) => ({
    id: row.id,
    jobName: row.job_name,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    itemsFetched: Number(row.items_fetched || 0),
    itemsInserted: Number(row.items_inserted || 0),
    error: row.error,
  }));
}

export function normalizeSourcePayload(raw) {
  return {
    name: truncate(toStringOrEmpty(raw?.name), 140),
    rssUrl: toStringOrEmpty(raw?.rssUrl || raw?.rss_url),
    isActive: normalizeBoolean(raw?.isActive ?? raw?.is_active, true),
  };
}

export function normalizeBuilderSourcePayload(raw) {
  return {
    builderName: truncate(toStringOrEmpty(raw?.builderName || raw?.builder_name), 160),
    sourceType: truncate(toStringOrEmpty(raw?.sourceType || raw?.source_type || 'rss').toLowerCase(), 20),
    sourceUrl: toStringOrEmpty(raw?.sourceUrl || raw?.source_url),
    isActive: normalizeBoolean(raw?.isActive ?? raw?.is_active, true),
  };
}
