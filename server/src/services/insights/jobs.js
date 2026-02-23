import cron from 'node-cron';
import { pool } from '../../db.js';
import {
  IST_TIMEZONE,
  REQUEST_GAP_MS,
  CITY_BASELINES,
  DEFAULT_BUILDER_SOURCES,
  DEFAULT_NEWS_SOURCES,
  addMonths,
  clearInsightsCache,
  extractCityFromText,
  extractLocalityFromText,
  extractPossessionHint,
  extractPriceHint,
  fetchTextWithTimeout,
  monthStart,
  normalizeUrl,
  parseRssItems,
  roundTo2,
  runWithRetry,
  sleep,
  truncate,
} from './helpers.js';

let schedulerStarted = false;
const schedulerTasks = [];

async function logJobRun({
  jobName,
  status,
  startedAt,
  finishedAt,
  itemsFetched,
  itemsInserted,
  error,
}) {
  await pool.query(
    `
      INSERT INTO job_runs (
        job_name,
        status,
        started_at,
        finished_at,
        items_fetched,
        items_inserted,
        error
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      jobName,
      status,
      startedAt,
      finishedAt,
      Number(itemsFetched || 0),
      Number(itemsInserted || 0),
      error || null,
    ]
  );
}

function createSimulatedMarketRows() {
  const rows = [];
  const currentMonth = monthStart(new Date());
  const startMonth = addMonths(currentMonth, -23);

  const cityNames = Object.keys(CITY_BASELINES);
  for (const city of cityNames) {
    const base = CITY_BASELINES[city];
    const cityFactor = (city.length % 7) * 0.0009;

    const generated = [];
    for (let i = 0; i < 24; i += 1) {
      const period = addMonths(startMonth, i);
      const trend = 1 + i * (0.0036 + cityFactor);
      const seasonality = 1 + Math.sin(i / 3 + city.length) * 0.01;
      const avgPrice = Math.max(2500, base * trend * seasonality);
      generated.push({
        city,
        period: period.toISOString().slice(0, 10),
        avgPriceSqft: roundTo2(avgPrice),
      });
    }

    for (let i = 0; i < generated.length; i += 1) {
      const item = generated[i];
      const prevMonth = generated[i - 1]?.avgPriceSqft || null;
      const prevYear = generated[i - 12]?.avgPriceSqft || null;

      const mom =
        prevMonth && prevMonth > 0
          ? roundTo2(((item.avgPriceSqft - prevMonth) / prevMonth) * 100)
          : null;
      const yoy =
        prevYear && prevYear > 0
          ? roundTo2(((item.avgPriceSqft - prevYear) / prevYear) * 100)
          : null;

      rows.push({
        city: item.city,
        period: item.period,
        avgPriceSqft: item.avgPriceSqft,
        momChange: mom,
        yoyChange: yoy,
        source: 'simulation',
      });
    }
  }

  return rows;
}

async function fetchProviderMarketRows() {
  const provider = String(process.env.MARKET_API_PROVIDER || '').trim().toLowerCase();
  const apiKey = String(process.env.MARKET_API_KEY || '').trim();
  const endpoint = String(process.env.MARKET_API_URL || '').trim();

  if (!provider || !apiKey || !endpoint) {
    return null;
  }

  const response = await runWithRetry(
    async () => {
      const apiResponse = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      });

      if (!apiResponse.ok) {
        throw new Error(`Market API HTTP ${apiResponse.status}`);
      }

      return apiResponse.json();
    },
    { maxAttempts: 3, baseDelayMs: 900 }
  );

  const list = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];
  const rows = [];

  for (const entry of list) {
    const city = truncate(entry.city || entry.name, 80);
    const avgPriceSqft = roundTo2(entry.avg_price_sqft || entry.avgPriceSqft || entry.price);
    const periodDate = monthStart(entry.period || entry.date || new Date());

    if (!city || !avgPriceSqft) continue;

    rows.push({
      city,
      period: periodDate.toISOString().slice(0, 10),
      avgPriceSqft,
      momChange: roundTo2(entry.mom_change || entry.momChange || null),
      yoyChange: roundTo2(entry.yoy_change || entry.yoyChange || null),
      source: provider,
    });
  }

  return rows.length > 0 ? rows : null;
}

async function upsertMarketRows(rows) {
  let insertedCount = 0;

  for (const row of rows) {
    const result = await pool.query(
      `
        INSERT INTO market_city_prices (
          city,
          period,
          avg_price_sqft,
          mom_change,
          yoy_change,
          source,
          fetched_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (city, period, source)
        DO UPDATE SET
          avg_price_sqft = EXCLUDED.avg_price_sqft,
          mom_change = EXCLUDED.mom_change,
          yoy_change = EXCLUDED.yoy_change,
          fetched_at = NOW()
        RETURNING id
      `,
      [row.city, row.period, row.avgPriceSqft, row.momChange, row.yoyChange, row.source]
    );

    insertedCount += result.rowCount;
  }

  return insertedCount;
}

export async function ensureInsightsSourceSeeds() {
  for (const source of DEFAULT_NEWS_SOURCES) {
    await pool.query(
      `
        INSERT INTO news_sources (name, rss_url, is_active)
        VALUES ($1, $2, TRUE)
        ON CONFLICT (rss_url) DO NOTHING
      `,
      [source.name, source.rssUrl]
    );
  }

  for (const source of DEFAULT_BUILDER_SOURCES) {
    await pool.query(
      `
        INSERT INTO builder_sources (builder_name, source_type, source_url, is_active)
        VALUES ($1, $2, $3, TRUE)
        ON CONFLICT (source_url) DO NOTHING
      `,
      [source.builderName, source.sourceType, source.sourceUrl]
    );
  }
}

export async function runNewsIngestJob(options = {}) {
  const startedAt = new Date();
  let itemsFetched = 0;
  let itemsInserted = 0;
  const sourceErrors = [];

  try {
    const sourceRows = await pool.query(
      `
        SELECT id, name, rss_url
        FROM news_sources
        WHERE is_active = TRUE
        ORDER BY created_at ASC
      `
    );

    const seenUrls = new Set();

    for (let index = 0; index < sourceRows.rows.length; index += 1) {
      const source = sourceRows.rows[index];
      if (index > 0) {
        await sleep(REQUEST_GAP_MS);
      }

      try {
        const xml = await runWithRetry(() => fetchTextWithTimeout(source.rss_url), {
          maxAttempts: 3,
          baseDelayMs: 900,
        });

        const items = parseRssItems(xml).slice(0, 80);
        itemsFetched += items.length;

        for (const item of items) {
          const url = normalizeUrl(item.url);
          if (!url || seenUrls.has(url)) {
            continue;
          }
          seenUrls.add(url);

          const inserted = await pool.query(
            `
              INSERT INTO news_articles (
                source_id,
                title,
                url,
                image_url,
                snippet,
                category,
                published_at,
                created_at
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
              ON CONFLICT (url) DO NOTHING
              RETURNING id
            `,
            [
              source.id,
              truncate(item.title, 260),
              url,
              item.imageUrl,
              truncate(item.snippet, 420),
              item.category,
              item.publishedAt || new Date().toISOString(),
            ]
          );

          itemsInserted += inserted.rowCount;
        }
      } catch (error) {
        sourceErrors.push(`${source.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    const finishedAt = new Date();
    const isHardFailure = sourceRows.rowCount > 0 && sourceErrors.length === sourceRows.rowCount;
    const status = isHardFailure ? 'fail' : 'success';

    await logJobRun({
      jobName: options.jobName || 'news_ingest_job',
      status,
      startedAt,
      finishedAt,
      itemsFetched,
      itemsInserted,
      error: sourceErrors.length > 0 ? sourceErrors.join(' | ') : null,
    });

    clearInsightsCache('insights:news');

    return {
      status,
      itemsFetched,
      itemsInserted,
      errors: sourceErrors,
      startedAt,
      finishedAt,
    };
  } catch (error) {
    const finishedAt = new Date();
    await logJobRun({
      jobName: options.jobName || 'news_ingest_job',
      status: 'fail',
      startedAt,
      finishedAt,
      itemsFetched,
      itemsInserted,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      status: 'fail',
      itemsFetched,
      itemsInserted,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
      startedAt,
      finishedAt,
    };
  }
}

export async function runMarketDataJob(options = {}) {
  const startedAt = new Date();
  let itemsFetched = 0;
  let itemsInserted = 0;
  let errorNote = null;

  try {
    let rows = null;
    try {
      rows = await fetchProviderMarketRows();
    } catch (error) {
      errorNote = `Provider unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }

    if (!rows) {
      rows = createSimulatedMarketRows();
      if (!errorNote) {
        errorNote = 'Simulation mode used (provider/key missing or unavailable).';
      }
    }

    itemsFetched = rows.length;
    itemsInserted = await upsertMarketRows(rows);

    const finishedAt = new Date();
    await logJobRun({
      jobName: options.jobName || 'market_data_job',
      status: 'success',
      startedAt,
      finishedAt,
      itemsFetched,
      itemsInserted,
      error: errorNote,
    });

    clearInsightsCache('insights:market');

    return {
      status: 'success',
      itemsFetched,
      itemsInserted,
      startedAt,
      finishedAt,
      note: errorNote,
    };
  } catch (error) {
    const finishedAt = new Date();
    await logJobRun({
      jobName: options.jobName || 'market_data_job',
      status: 'fail',
      startedAt,
      finishedAt,
      itemsFetched,
      itemsInserted,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      status: 'fail',
      itemsFetched,
      itemsInserted,
      startedAt,
      finishedAt,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

export async function runUpcomingProjectsJob(options = {}) {
  const startedAt = new Date();
  let itemsFetched = 0;
  let itemsInserted = 0;
  const sourceErrors = [];

  try {
    const sourceRows = await pool.query(
      `
        SELECT id, builder_name, source_type, source_url
        FROM builder_sources
        WHERE is_active = TRUE
        ORDER BY created_at ASC
      `
    );

    const seenUrls = new Set();

    for (let index = 0; index < sourceRows.rows.length; index += 1) {
      const source = sourceRows.rows[index];
      if (source.source_type !== 'rss') {
        continue;
      }

      if (index > 0) {
        await sleep(REQUEST_GAP_MS);
      }

      try {
        const xml = await runWithRetry(() => fetchTextWithTimeout(source.source_url), {
          maxAttempts: 3,
          baseDelayMs: 900,
        });

        const items = parseRssItems(xml).slice(0, 80);
        itemsFetched += items.length;

        for (const item of items) {
          const url = normalizeUrl(item.url);
          if (!url || seenUrls.has(url)) {
            continue;
          }
          seenUrls.add(url);

          const combinedText = `${item.title || ''} ${item.snippet || ''}`;
          const city = extractCityFromText(combinedText);
          const locality = extractLocalityFromText(combinedText);
          const priceHint = extractPriceHint(combinedText);
          const possessionHint = extractPossessionHint(combinedText);

          const inserted = await pool.query(
            `
              INSERT INTO project_announcements (
                builder_source_id,
                title,
                url,
                city,
                locality,
                price_hint,
                possession_hint,
                status,
                published_at,
                created_at
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, 'announcement', $8, NOW())
              ON CONFLICT (url) DO NOTHING
              RETURNING id
            `,
            [
              source.id,
              truncate(item.title, 260),
              url,
              city || null,
              locality || null,
              priceHint || null,
              possessionHint || null,
              item.publishedAt || null,
            ]
          );

          itemsInserted += inserted.rowCount;
        }
      } catch (error) {
        sourceErrors.push(
          `${source.builder_name}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    const finishedAt = new Date();
    const isHardFailure = sourceRows.rowCount > 0 && sourceErrors.length === sourceRows.rowCount;
    const status = isHardFailure ? 'fail' : 'success';

    await logJobRun({
      jobName: options.jobName || 'upcoming_projects_job',
      status,
      startedAt,
      finishedAt,
      itemsFetched,
      itemsInserted,
      error: sourceErrors.length > 0 ? sourceErrors.join(' | ') : null,
    });

    clearInsightsCache('insights:projects');

    return {
      status,
      itemsFetched,
      itemsInserted,
      startedAt,
      finishedAt,
      errors: sourceErrors,
    };
  } catch (error) {
    const finishedAt = new Date();
    await logJobRun({
      jobName: options.jobName || 'upcoming_projects_job',
      status: 'fail',
      startedAt,
      finishedAt,
      itemsFetched,
      itemsInserted,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      status: 'fail',
      itemsFetched,
      itemsInserted,
      startedAt,
      finishedAt,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

export function startInsightsScheduler() {
  if (schedulerStarted) {
    return;
  }

  schedulerStarted = true;

  const schedule = (jobName, expression, fn) => {
    const task = cron.schedule(
      expression,
      () => {
        void fn({ jobName }).catch((error) => {
          console.error(`[Insights] ${jobName} failed:`, error);
        });
      },
      { timezone: IST_TIMEZONE }
    );

    schedulerTasks.push(task);
  };

  schedule('news_ingest_job', '0 */2 * * *', runNewsIngestJob);
  schedule('market_data_job', '0 3 * * *', runMarketDataJob);
  schedule('upcoming_projects_job', '0 4 * * *', runUpcomingProjectsJob);

  setTimeout(() => {
    void runNewsIngestJob({ jobName: 'news_ingest_job_startup' });
  }, 4000);
  setTimeout(() => {
    void runMarketDataJob({ jobName: 'market_data_job_startup' });
  }, 10000);
  setTimeout(() => {
    void runUpcomingProjectsJob({ jobName: 'upcoming_projects_job_startup' });
  }, 16000);

  console.log('[Insights] Scheduler started (news every 2h, market 03:00 IST, projects 04:00 IST).');
}

export function stopInsightsScheduler() {
  for (const task of schedulerTasks) {
    task.stop();
  }
  schedulerTasks.length = 0;
  schedulerStarted = false;
}

