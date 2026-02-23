import crypto from 'crypto';
import Parser from 'rss-parser';
import { fetchTextWithRetry } from '../utils/fetchWithRetry.js';

const RSS_PARSER = new Parser({
  timeout: 20000,
  headers: {
    'User-Agent': 'ZDT-InfraBot/1.0 (+https://zdt.example)',
  },
});

const INFRA_KEYWORDS = [
  'road',
  'highway',
  'bridge',
  'flyover',
  'bypass',
  'ring road',
  'metro',
  'rail',
  'railway',
  'airport',
  'port',
  'water',
  'sewer',
  'drainage',
  'urban',
  'power',
  'electric',
  'substation',
  'hospital',
  'college',
  'school',
  'expressway',
  'infrastructure',
  'tender',
  'bid',
  'contract',
  'work',
  'construction',
  'pre-construction',
  'maintenance',
  'gati shakti',
  'cabinet',
];

const DEFAULT_PIB_FEEDS = [
  {
    sourceKey: 'PIB_REG_1',
    url: 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=1',
  },
  {
    sourceKey: 'PIB_REG_2',
    url: 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=2',
  },
  {
    sourceKey: 'PIB_REG_3',
    url: 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3',
  },
];

const DEFAULT_ETENDERS_URLS = ['https://etenders.gov.in/eprocure/app'];
const DEFAULT_EPROCURE_URLS = ['https://eprocure.gov.in/eprocure/app'];
const DEFAULT_PPP_URLS = ['https://www.pppinindia.gov.in/all_infrastructure_projects'];
const DEFAULT_TIMEOUT_MS = 25000;
const DEFAULT_SOURCE_REQUEST_RETRIES = 2;
const DEFAULT_SOURCE_TRANSIENT_COOLDOWN_MINUTES = 30;
const DEFAULT_PIB_REQUEST_RETRIES = 4;
const DEFAULT_PIB_ATTEMPTS_PER_FEED = 3;
const DEFAULT_PIB_ATTEMPT_DELAY_MS = 1500;
const DEFAULT_PIB_FEED_DELAY_MS = 1200;
const DEFAULT_PIB_TRANSIENT_COOLDOWN_MINUTES = 30;
const TRANSIENT_NETWORK_ERROR_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ECONNABORTED',
]);
const pibTransientFeedCooldownUntil = new Map();
const sourceTransientCooldownUntil = new Map();

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeHashPart(value) {
  return normalizeSpace(value).toLowerCase();
}

function parseCsvList(value) {
  return Array.from(
    new Set(
      String(value || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function parseBooleanFlag(value, fallback = false) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (!normalized) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function formatIngestError(error) {
  const message = normalizeSpace(error?.message || String(error || 'Unknown error'));
  const code = normalizeSpace(error?.cause?.code || error?.code || '');
  const causeMessage = normalizeSpace(error?.cause?.message || '');
  const details = [];
  if (code) {
    details.push(`code=${code}`);
  }
  if (causeMessage && causeMessage !== message) {
    details.push(`cause=${causeMessage}`);
  }
  return details.length > 0 ? `${message} (${details.join(', ')})` : message;
}

function isTransientNetworkError(error) {
  const status = Number(error?.status || error?.cause?.status || 0);
  if ([408, 425, 429, 500, 502, 503, 504].includes(status)) {
    return true;
  }

  const code = normalizeSpace(error?.code || '').toUpperCase();
  const causeCode = normalizeSpace(error?.cause?.code || '').toUpperCase();
  if (TRANSIENT_NETWORK_ERROR_CODES.has(code) || TRANSIENT_NETWORK_ERROR_CODES.has(causeCode)) {
    return true;
  }

  const message = normalizeHashPart(
    `${error?.message || ''} ${error?.cause?.message || ''} ${error?.name || ''}`
  );

  return (
    message.includes('econnreset') ||
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('fetch failed') ||
    message.includes('socket hang up') ||
    message.includes('aborterror')
  );
}

function buildSourceCooldownKey(sourceType, sourceKey) {
  return `${normalizeSpace(sourceType).toUpperCase()}::${normalizeSpace(sourceKey).toUpperCase()}`;
}

function getSourceCooldownRemainingMs(sourceType, sourceKey) {
  const key = buildSourceCooldownKey(sourceType, sourceKey);
  const until = Number(sourceTransientCooldownUntil.get(key) || 0);
  return until - Date.now();
}

function setSourceCooldown(sourceType, sourceKey, cooldownMs) {
  const key = buildSourceCooldownKey(sourceType, sourceKey);
  if (cooldownMs <= 0) {
    sourceTransientCooldownUntil.delete(key);
    return;
  }
  sourceTransientCooldownUntil.set(key, Date.now() + cooldownMs);
}

function clearSourceCooldown(sourceType, sourceKey) {
  const key = buildSourceCooldownKey(sourceType, sourceKey);
  sourceTransientCooldownUntil.delete(key);
}

function summarizeSourceFetchError(error) {
  const candidateErrors = Array.isArray(error?.sourceCandidateErrors)
    ? error.sourceCandidateErrors.map((entry) => normalizeSpace(entry)).filter(Boolean)
    : [];
  if (candidateErrors.length > 0) {
    return candidateErrors.join(' | ');
  }
  return formatIngestError(error);
}

async function fetchFromSourceWithFallback({
  sourceKey,
  listingUrl,
  fallbackUrls = [],
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retries = DEFAULT_SOURCE_REQUEST_RETRIES,
  verboseIngestLogs = false,
}) {
  const urlCandidates = Array.from(
    new Set([listingUrl, ...fallbackUrls].map((entry) => normalizeSpace(entry)).filter(Boolean))
  );

  let lastError = null;
  const candidateErrors = [];

  for (let candidateIndex = 0; candidateIndex < urlCandidates.length; candidateIndex += 1) {
    const candidateUrl = urlCandidates[candidateIndex];
    try {
      const html = await safeFetchText(candidateUrl, timeoutMs, retries);
      return { html, resolvedUrl: candidateUrl };
    } catch (error) {
      lastError = error;
      candidateErrors.push(`${candidateUrl} => ${formatIngestError(error)}`);

      const hasMoreCandidates = candidateIndex < urlCandidates.length - 1;
      if (hasMoreCandidates && verboseIngestLogs) {
        console.warn(
          `[INFRA INGEST] ${sourceKey} primary URL failed. Trying fallback URL (${candidateIndex + 1}/${urlCandidates.length}).`
        );
      }
    }
  }

  const failure = lastError || new Error(`No source URL available for ${sourceKey}`);
  failure.sourceCandidateErrors = candidateErrors;
  throw failure;
}

function parseFeedList(value) {
  const entries = parseCsvList(value);
  if (entries.length === 0) {
    return [...DEFAULT_PIB_FEEDS];
  }

  return entries
    .map((entry, index) => {
      const [rawKey, rawUrl] = entry.includes('|') ? entry.split('|', 2) : ['', entry];
      const url = String(rawUrl || '').trim();
      if (!url) return null;
      const sourceKey = normalizeSpace(rawKey) || `PIB_CUSTOM_${index + 1}`;
      return { sourceKey, url };
    })
    .filter((entry) => Boolean(entry));
}

function parseSourceList(value, fallbackUrls, defaultPrefix) {
  const rawValue = String(value || '').trim();
  if (rawValue && ['DISABLED', 'NONE', 'OFF', 'FALSE', '0'].includes(rawValue.toUpperCase())) {
    return [];
  }

  const entries = parseCsvList(value);
  const resolvedEntries = entries.length > 0 ? entries : fallbackUrls;

  return resolvedEntries
    .map((entry, index) => {
      const [rawKey, rawUrl] = entry.includes('|') ? entry.split('|', 2) : ['', entry];
      const url = normalizeSpace(rawUrl);
      if (!url) return null;
      const sourceKey = normalizeSpace(rawKey) || `${defaultPrefix}_${index + 1}`;
      return { sourceKey, url };
    })
    .filter((item) => Boolean(item));
}

function stripTags(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickGuid(item) {
  return (
    item.guid ||
    item.id ||
    item.link ||
    `${item.title || ''}::${item.pubDate || item.isoDate || ''}`
  );
}

function buildContentHash({ title, link, summary, publishedAt }) {
  const normalizedPublishedDate =
    publishedAt instanceof Date && !Number.isNaN(publishedAt.getTime())
      ? publishedAt.toISOString().slice(0, 10)
      : '';

  const payload = [
    normalizeHashPart(title),
    normalizeHashPart(link),
    normalizeHashPart(String(summary || '').slice(0, 1000)),
    normalizedPublishedDate,
  ].join('||');

  return crypto.createHash('sha256').update(payload).digest('hex');
}

function withAbsoluteUrl(baseUrl, candidate) {
  const value = String(candidate || '').trim();
  if (!value) return '';
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function includesInfraKeyword(text) {
  const normalized = normalizeHashPart(text);
  return INFRA_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function extractPattern(text, regex) {
  const matched = String(text || '').match(regex);
  return matched?.[1] ? normalizeSpace(matched[1]) : '';
}

function extractTenderFields(text) {
  const normalized = normalizeSpace(text);
  return {
    organization: extractPattern(
      normalized,
      /\b(?:organisation|organization|authority|department|dept)\s*[:\-]\s*([^|.;,\n]{3,120})/i
    ),
    classification: extractPattern(
      normalized,
      /\b(?:classification|work type|tender category|category)\s*[:\-]\s*([^|.;,\n]{3,120})/i
    ),
    location: extractPattern(
      normalized,
      /\b(?:location|state|district|city|place)\s*[:\-]\s*([^|.;,\n]{3,120})/i
    ),
    closingDate: extractPattern(
      normalized,
      /\b(?:closing date|bid submission end date|bid due date|submission end)\s*[:\-]\s*([^|.;,\n]{3,80})/i
    ),
  };
}

function buildSummaryFromFields(fields, fallbackText) {
  const parts = [];
  if (fields.organization) parts.push(`Org: ${fields.organization}`);
  if (fields.classification) parts.push(`Class: ${fields.classification}`);
  if (fields.location) parts.push(`Location: ${fields.location}`);
  if (fields.closingDate) parts.push(`Closing: ${fields.closingDate}`);

  if (parts.length > 0) {
    return parts.join(' | ');
  }

  return normalizeSpace(fallbackText).slice(0, 600);
}

function parseDateForIngest(value) {
  const raw = normalizeSpace(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseFilterSet(value) {
  return new Set(
    parseCsvList(value)
      .map((entry) => normalizeHashPart(entry))
      .filter(Boolean)
  );
}

function matchesFilter(haystack, filters) {
  if (!filters || filters.size === 0) return true;
  const normalizedHaystack = normalizeHashPart(haystack);
  for (const filter of filters) {
    if (normalizedHaystack.includes(filter)) {
      return true;
    }
  }
  return false;
}

function matchesClosingDateFilter(dateText, fromDateText) {
  const from = normalizeSpace(fromDateText);
  if (!from) return true;
  const parsedFrom = parseDateForIngest(from);
  if (!parsedFrom) return true;
  const parsedDate = parseDateForIngest(dateText);
  if (!parsedDate) return true;
  return parsedDate.getTime() >= parsedFrom.getTime();
}

async function safeFetchText(url, timeoutMs = DEFAULT_TIMEOUT_MS, retries = DEFAULT_SOURCE_REQUEST_RETRIES) {
  return fetchTextWithRetry(url, {
    retries,
    timeoutMs,
    headers: {
      'User-Agent': 'ZDT-InfraBot/1.0 (+https://zdt.example)',
      Accept: 'text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.8',
    },
  });
}

async function insertIngestItem(db, payload) {
  const publishedAt = payload.publishedAt instanceof Date && !Number.isNaN(payload.publishedAt.getTime())
    ? payload.publishedAt
    : null;
  const contentHash = buildContentHash({
    title: payload.title,
    link: payload.link,
    summary: payload.summary,
    publishedAt,
  });

  await db.query(
    `
      INSERT INTO infra_ingest_items
        (source_key, item_guid, content_hash, title, link, published_at, summary, raw, status)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'NEW')
      ON CONFLICT DO NOTHING
    `,
    [
      payload.sourceKey,
      payload.itemGuid,
      contentHash,
      payload.title,
      payload.link,
      publishedAt,
      payload.summary || null,
      JSON.stringify(payload.raw || {}),
    ]
  );
}

async function discoverPibFeeds() {
  const configuredFeeds = parseFeedList(process.env.INFRA_PIB_RSS_FEEDS);
  const deduped = new Map();

  configuredFeeds.forEach((feed) => {
    const url = normalizeSpace(feed.url);
    if (!url) return;
    const sourceKey = normalizeSpace(feed.sourceKey);
    if (!sourceKey) return;
    deduped.set(url, { sourceKey, url });
  });

  const maxFeeds = Math.max(1, Math.min(60, Number(process.env.INFRA_PIB_MAX_FEEDS || 20)));
  return Array.from(deduped.values()).slice(0, maxFeeds);
}

async function ingestPibFeeds(db) {
  const feeds = await discoverPibFeeds();
  const requestRetries = clampNumber(
    process.env.INFRA_PIB_REQUEST_RETRIES,
    DEFAULT_PIB_REQUEST_RETRIES,
    1,
    8
  );
  const requestTimeoutMs = clampNumber(
    process.env.INFRA_PIB_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
    10000,
    90000
  );
  const attemptsPerFeed = clampNumber(
    process.env.INFRA_PIB_ATTEMPTS_PER_FEED,
    DEFAULT_PIB_ATTEMPTS_PER_FEED,
    1,
    6
  );
  const attemptDelayMs = clampNumber(
    process.env.INFRA_PIB_ATTEMPT_DELAY_MS,
    DEFAULT_PIB_ATTEMPT_DELAY_MS,
    250,
    15000
  );
  const feedDelayMs = clampNumber(
    process.env.INFRA_PIB_FEED_DELAY_MS,
    DEFAULT_PIB_FEED_DELAY_MS,
    0,
    30000
  );
  const logRetryAttempts = parseBooleanFlag(process.env.INFRA_PIB_LOG_RETRIES, false);
  const transientCooldownMinutes = clampNumber(
    process.env.INFRA_PIB_TRANSIENT_COOLDOWN_MINUTES,
    DEFAULT_PIB_TRANSIENT_COOLDOWN_MINUTES,
    0,
    240
  );
  const transientCooldownMs = Math.max(0, Math.round(transientCooldownMinutes * 60 * 1000));

  for (let feedIndex = 0; feedIndex < feeds.length; feedIndex += 1) {
    const feed = feeds[feedIndex];
    const cooldownUntilMs = Number(pibTransientFeedCooldownUntil.get(feed.sourceKey) || 0);
    if (cooldownUntilMs > Date.now()) {
      if (logRetryAttempts) {
        const remainingSeconds = Math.max(1, Math.ceil((cooldownUntilMs - Date.now()) / 1000));
        console.warn(
          `[INFRA INGEST] PIB feed cooldown active (${feed.sourceKey}), skipping for ${remainingSeconds}s.`
        );
      }
      continue;
    }

    let parsed = null;

    for (let attempt = 1; attempt <= attemptsPerFeed; attempt += 1) {
      try {
        const xml = await fetchTextWithRetry(feed.url, {
          retries: requestRetries,
          timeoutMs: requestTimeoutMs,
          headers: {
            Accept: 'application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8',
            Referer: 'https://pib.gov.in/',
          },
        });
        parsed = await RSS_PARSER.parseString(xml);
        break;
      } catch (error) {
        const message = formatIngestError(error);
        const isLastAttempt = attempt === attemptsPerFeed;
        if (isLastAttempt) {
          if (isTransientNetworkError(error)) {
            if (transientCooldownMs > 0) {
              pibTransientFeedCooldownUntil.set(feed.sourceKey, Date.now() + transientCooldownMs);
            }
            console.warn(
              `[INFRA INGEST] PIB feed temporarily unreachable (${feed.sourceKey}) after ${attemptsPerFeed} attempt(s): ${message}. Skipping for now.`
            );
          } else {
            console.error(`[INFRA INGEST] PIB feed failed (${feed.sourceKey}): ${message}`);
          }
        } else {
          const waitMs = attemptDelayMs * attempt;
          if (logRetryAttempts) {
            console.warn(
              `[INFRA INGEST] PIB feed attempt ${attempt}/${attemptsPerFeed} failed (${feed.sourceKey}): ${message}. Retrying in ${waitMs}ms.`
            );
          }
          await sleep(waitMs);
        }
      }
    }

    if (!parsed) {
      continue;
    }
    pibTransientFeedCooldownUntil.delete(feed.sourceKey);

    const items = Array.isArray(parsed.items) ? parsed.items : [];

    for (const item of items) {
      const itemGuid = normalizeSpace(pickGuid(item));
      const title = normalizeSpace(item.title);
      const link = normalizeSpace(item.link);
      if (!itemGuid || !title || !link) continue;

      const publishedAt = parseDateForIngest(item.isoDate || item.pubDate || '');
      const summary = normalizeSpace(item.contentSnippet || item.content || '').slice(0, 2000);

      await insertIngestItem(db, {
        sourceKey: feed.sourceKey,
        itemGuid,
        title,
        link,
        publishedAt,
        summary,
        raw: {
          sourceType: 'PIB_RSS',
          feedUrl: feed.url,
          feedTitle: parsed.title || '',
          item,
        },
      });
    }

    const isLastFeed = feedIndex === feeds.length - 1;
    if (!isLastFeed && feedDelayMs > 0) {
      await sleep(feedDelayMs);
    }
  }
}

function extractRowsFromHtml(html) {
  const rows = [];
  const raw = String(html || '');

  const trRegex = /<tr[\s\S]*?<\/tr>/gi;
  let trMatch = trRegex.exec(raw);
  while (trMatch) {
    rows.push(trMatch[0]);
    trMatch = trRegex.exec(raw);
  }

  if (rows.length > 0) return rows;

  const liRegex = /<li[\s\S]*?<\/li>/gi;
  let liMatch = liRegex.exec(raw);
  while (liMatch) {
    rows.push(liMatch[0]);
    liMatch = liRegex.exec(raw);
  }

  return rows;
}

function extractFirstAnchor(rowHtml, baseUrl) {
  const anchorRegex = /<a[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i;
  const matched = String(rowHtml || '').match(anchorRegex);
  if (!matched) return { link: '', text: '' };

  return {
    link: withAbsoluteUrl(baseUrl, matched[1]),
    text: stripTags(matched[2]),
  };
}

function buildEtenderItemGuid(sourceKey, link, title, fallbackText) {
  return normalizeSpace(link) || `${sourceKey}::${normalizeSpace(title)}::${normalizeSpace(fallbackText).slice(0, 120)}`;
}

async function ingestTenderListings(db, sourceType, sources) {
  const verboseIngestLogs = parseBooleanFlag(process.env.INFRA_INGEST_VERBOSE, false);
  const sourceRequestRetries = clampNumber(
    process.env.INFRA_SOURCE_REQUEST_RETRIES,
    DEFAULT_SOURCE_REQUEST_RETRIES,
    0,
    8
  );
  const sourceTimeoutMs = clampNumber(
    process.env.INFRA_SOURCE_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
    5000,
    90000
  );
  const sourceTransientCooldownMinutes = clampNumber(
    process.env.INFRA_SOURCE_TRANSIENT_COOLDOWN_MINUTES,
    DEFAULT_SOURCE_TRANSIENT_COOLDOWN_MINUTES,
    0,
    240
  );
  const sourceTransientCooldownMs = Math.round(sourceTransientCooldownMinutes * 60 * 1000);
  const fallbackUrls =
    sourceType === 'ETENDERS'
      ? DEFAULT_ETENDERS_URLS
      : sourceType === 'EPROCURE'
        ? DEFAULT_EPROCURE_URLS
        : [];

  const orgFilters = parseFilterSet(process.env.INFRA_INGEST_ORG_FILTERS);
  const classFilters = parseFilterSet(process.env.INFRA_INGEST_CLASS_FILTERS);
  const locationFilters = parseFilterSet(process.env.INFRA_INGEST_LOCATION_FILTERS);
  const closingDateFrom = process.env.INFRA_INGEST_CLOSING_DATE_FROM || '';
  const maxItemsPerSource = Math.max(
    20,
    Math.min(500, Number(process.env.INFRA_INGEST_MAX_ITEMS_PER_SOURCE || 200))
  );

  for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
    const source = sources[sourceIndex];
    const listingUrl = normalizeSpace(source?.url);
    const sourceKey = normalizeSpace(source?.sourceKey) || `${sourceType}_${sourceIndex + 1}`;
    if (!listingUrl) continue;

    const cooldownRemainingMs = getSourceCooldownRemainingMs(sourceType, sourceKey);
    if (cooldownRemainingMs > 0) {
      if (verboseIngestLogs) {
        const remainingSeconds = Math.max(1, Math.ceil(cooldownRemainingMs / 1000));
        console.log(
          `[INFRA INGEST] ${sourceKey} cooldown active, skipping for ${remainingSeconds}s.`
        );
      }
      continue;
    }

    try {
      const { html, resolvedUrl } = await fetchFromSourceWithFallback({
        sourceKey,
        listingUrl,
        fallbackUrls,
        timeoutMs: sourceTimeoutMs,
        retries: sourceRequestRetries,
        verboseIngestLogs,
      });
      if (verboseIngestLogs && resolvedUrl !== listingUrl) {
        console.log(`[INFRA INGEST] ${sourceKey} using fallback URL: ${resolvedUrl}`);
      }

      const rows = extractRowsFromHtml(html);
      let insertedForSource = 0;

      for (const rowHtml of rows) {
        if (insertedForSource >= maxItemsPerSource) break;

        const rowText = stripTags(rowHtml);
        if (!rowText || rowText.length < 20) continue;
        if (!includesInfraKeyword(rowText)) continue;

        const anchor = extractFirstAnchor(rowHtml, listingUrl);
        const title = normalizeSpace(anchor.text || rowText.slice(0, 180));
        const link = normalizeSpace(anchor.link || listingUrl);
        if (!title || !link) continue;

        const fields = extractTenderFields(rowText);
        const summary = buildSummaryFromFields(fields, rowText);

        if (!matchesFilter(`${fields.organization} ${rowText}`, orgFilters)) continue;
        if (!matchesFilter(`${fields.classification} ${rowText}`, classFilters)) continue;
        if (!matchesFilter(`${fields.location} ${rowText}`, locationFilters)) continue;
        if (!matchesClosingDateFilter(fields.closingDate, closingDateFrom)) continue;

        const itemGuid = buildEtenderItemGuid(sourceKey, link, title, summary);

        await insertIngestItem(db, {
          sourceKey,
          itemGuid,
          title,
          link,
          publishedAt: null,
          summary: summary.slice(0, 2000),
          raw: {
            sourceType,
            listingUrl: resolvedUrl,
            requestedListingUrl: listingUrl,
            extracted: fields,
            rowText: rowText.slice(0, 4000),
          },
        });

        insertedForSource += 1;
      }

      clearSourceCooldown(sourceType, sourceKey);
    } catch (error) {
      const message = summarizeSourceFetchError(error);
      if (isTransientNetworkError(error)) {
        if (sourceTransientCooldownMs > 0) {
          setSourceCooldown(sourceType, sourceKey, sourceTransientCooldownMs);
          console.warn(
            `[INFRA INGEST] ${sourceKey} temporarily unreachable: ${message}. Cooling down for ${sourceTransientCooldownMinutes} minute(s).`
          );
        } else {
          console.warn(`[INFRA INGEST] ${sourceKey} transient source failure: ${message}`);
        }
      } else {
        console.warn(`[INFRA INGEST] ${sourceKey} source skipped: ${message}`);
      }
    }
  }
}

function inferPppStage(text) {
  const normalized = normalizeHashPart(text);
  if (!normalized) return '';
  if (normalized.includes('pre construction') || normalized.includes('pre-construction')) {
    return 'Pre-construction';
  }
  if (normalized.includes('under construction')) {
    return 'Under construction';
  }
  if (normalized.includes('operation') && normalized.includes('maintenance')) {
    return 'Operation & maintenance';
  }
  if (normalized.includes('completed')) {
    return 'Completed';
  }
  return '';
}

function buildPppSummary(rowText) {
  const stage = inferPppStage(rowText);
  const prefix = stage ? `PPP India stage: ${stage}. ` : 'PPP India listed infrastructure project. ';
  return `${prefix}${normalizeSpace(rowText).slice(0, 520)}`.trim();
}

function buildPppItemGuid(sourceKey, rowIndex, link, title, rowText) {
  const linkKey = normalizeSpace(link);
  if (linkKey) return `${sourceKey}::${linkKey}`;
  const hashInput = `${normalizeHashPart(title)}||${normalizeHashPart(rowText)}`;
  const digest = crypto.createHash('sha256').update(hashInput).digest('hex').slice(0, 24);
  return `${sourceKey}::ROW${rowIndex + 1}::${digest}`;
}

async function ingestPppListings(db, sources) {
  const verboseIngestLogs = parseBooleanFlag(process.env.INFRA_INGEST_VERBOSE, false);
  const sourceRequestRetries = clampNumber(
    process.env.INFRA_SOURCE_REQUEST_RETRIES,
    DEFAULT_SOURCE_REQUEST_RETRIES,
    0,
    8
  );
  const sourceTimeoutMs = clampNumber(
    process.env.INFRA_SOURCE_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
    5000,
    90000
  );
  const sourceTransientCooldownMinutes = clampNumber(
    process.env.INFRA_SOURCE_TRANSIENT_COOLDOWN_MINUTES,
    DEFAULT_SOURCE_TRANSIENT_COOLDOWN_MINUTES,
    0,
    240
  );
  const sourceTransientCooldownMs = Math.round(sourceTransientCooldownMinutes * 60 * 1000);
  const fallbackUrls = DEFAULT_PPP_URLS;

  const locationFilters = parseFilterSet(process.env.INFRA_INGEST_LOCATION_FILTERS);
  const maxItemsPerSource = Math.max(
    20,
    Math.min(500, Number(process.env.INFRA_INGEST_MAX_ITEMS_PER_SOURCE || 200))
  );

  for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
    const source = sources[sourceIndex];
    const listingUrl = normalizeSpace(source?.url);
    const sourceKey = normalizeSpace(source?.sourceKey) || `PPPINDIA_${sourceIndex + 1}`;
    if (!listingUrl) continue;

    const cooldownRemainingMs = getSourceCooldownRemainingMs('PPP_INDIA', sourceKey);
    if (cooldownRemainingMs > 0) {
      if (verboseIngestLogs) {
        const remainingSeconds = Math.max(1, Math.ceil(cooldownRemainingMs / 1000));
        console.log(
          `[INFRA INGEST] ${sourceKey} cooldown active, skipping for ${remainingSeconds}s.`
        );
      }
      continue;
    }

    try {
      const { html, resolvedUrl } = await fetchFromSourceWithFallback({
        sourceKey,
        listingUrl,
        fallbackUrls,
        timeoutMs: sourceTimeoutMs,
        retries: sourceRequestRetries,
        verboseIngestLogs,
      });
      if (verboseIngestLogs && resolvedUrl !== listingUrl) {
        console.log(`[INFRA INGEST] ${sourceKey} using fallback URL: ${resolvedUrl}`);
      }

      const rows = extractRowsFromHtml(html);
      let insertedForSource = 0;

      for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        if (insertedForSource >= maxItemsPerSource) break;

        const rowHtml = rows[rowIndex];
        const rowText = stripTags(rowHtml);
        if (!rowText || rowText.length < 20) continue;
        if (
          !includesInfraKeyword(rowText) &&
          !/\b(pre[-\s]?construction|under construction|operation|maintenance|ppp)\b/i.test(rowText)
        ) {
          continue;
        }
        if (!matchesFilter(rowText, locationFilters)) continue;

        const anchor = extractFirstAnchor(rowHtml, listingUrl);
        const title = normalizeSpace(anchor.text || rowText.split('|')[0] || rowText).slice(0, 200);
        const link = normalizeSpace(anchor.link || listingUrl);
        if (!title) continue;

        const summary = buildPppSummary(rowText).slice(0, 2000);
        const itemGuid = buildPppItemGuid(sourceKey, rowIndex, link, title, rowText);

        await insertIngestItem(db, {
          sourceKey,
          itemGuid,
          title,
          link: link || listingUrl,
          publishedAt: null,
          summary,
          raw: {
            sourceType: 'PPP_INDIA',
            listingUrl: resolvedUrl,
            requestedListingUrl: listingUrl,
            inferredStage: inferPppStage(rowText),
            rowText: rowText.slice(0, 4000),
          },
        });
        insertedForSource += 1;
      }

      clearSourceCooldown('PPP_INDIA', sourceKey);
    } catch (error) {
      const message = summarizeSourceFetchError(error);
      if (isTransientNetworkError(error)) {
        if (sourceTransientCooldownMs > 0) {
          setSourceCooldown('PPP_INDIA', sourceKey, sourceTransientCooldownMs);
          console.warn(
            `[INFRA INGEST] ${sourceKey} temporarily unreachable: ${message}. Cooling down for ${sourceTransientCooldownMinutes} minute(s).`
          );
        } else {
          console.warn(`[INFRA INGEST] ${sourceKey} transient source failure: ${message}`);
        }
      } else {
        console.warn(`[INFRA INGEST] ${sourceKey} source skipped: ${message}`);
      }
    }
  }
}

export async function runInfraIngestJob(db) {
  await ingestPibFeeds(db);

  const enableTenderSources = parseBooleanFlag(process.env.INFRA_ENABLE_TENDER_SOURCES, false);
  const verboseIngestLogs = parseBooleanFlag(process.env.INFRA_INGEST_VERBOSE, false);

  if (enableTenderSources) {
    const etendersSources = parseSourceList(
      process.env.INFRA_ETENDERS_URLS,
      DEFAULT_ETENDERS_URLS,
      'ETENDERS'
    );
    const eprocureSources = parseSourceList(
      process.env.INFRA_EPROCURE_URLS,
      DEFAULT_EPROCURE_URLS,
      'EPROCURE'
    );

    if (etendersSources.length > 0) {
      await ingestTenderListings(db, 'ETENDERS', etendersSources);
    } else if (verboseIngestLogs) {
      console.log('[INFRA INGEST] eTenders sources disabled by configuration.');
    }

    if (eprocureSources.length > 0) {
      await ingestTenderListings(db, 'EPROCURE', eprocureSources);
    } else if (verboseIngestLogs) {
      console.log('[INFRA INGEST] eProcure sources disabled by configuration.');
    }
  } else {
    console.log('[INFRA INGEST] eTenders/eProcure ingestion disabled (set INFRA_ENABLE_TENDER_SOURCES=true to enable).');
  }

  const pppSources = parseSourceList(process.env.INFRA_PPP_URLS, DEFAULT_PPP_URLS, 'PPPINDIA');

  await ingestPppListings(db, pppSources);
}
