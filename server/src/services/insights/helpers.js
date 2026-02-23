import { XMLParser } from 'fast-xml-parser';

export const IST_TIMEZONE = 'Asia/Kolkata';
export const REQUEST_TIMEOUT_MS = 18000;
export const REQUEST_GAP_MS = 450;

export const DEFAULT_NEWS_SOURCES = [
  {
    name: 'News18 Real Estate',
    rssUrl: 'https://www.news18.com/commonfeeds/v1/eng/rss/real-estate.xml',
  },
  {
    name: 'Hindustan Times Real Estate',
    rssUrl: 'https://www.hindustantimes.com/feeds/rss/real-estate/rssfeed.xml',
  },
  {
    name: 'The Hindu Property Plus',
    rssUrl: 'https://www.thehindu.com/real-estate/feeder/default.rss',
  },
];

export const DEFAULT_BUILDER_SOURCES = [
  {
    builderName: 'Sobha Realty',
    sourceType: 'rss',
    sourceUrl: 'https://www.sobha.com/blog/feed/',
  },
  {
    builderName: 'Godrej Properties',
    sourceType: 'rss',
    sourceUrl: 'https://www.godrejproperties.com/blog/feed/',
  },
  {
    builderName: 'Brigade Group',
    sourceType: 'rss',
    sourceUrl: 'https://www.brigadegroup.com/blog/feed/',
  },
];

export const CITY_BASELINES = {
  Mumbai: 32000,
  Bengaluru: 11800,
  Delhi: 21000,
  Hyderabad: 8600,
  Chennai: 9800,
  Pune: 8900,
  Kolkata: 8200,
  Ahmedabad: 7300,
  Noida: 12400,
  Gurugram: 14700,
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
});

const CACHE = new Map();

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

export function toText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    if ('#text' in value && typeof value['#text'] === 'string') return value['#text'];
    if ('@_href' in value && typeof value['@_href'] === 'string') return value['@_href'];
    if ('@_url' in value && typeof value['@_url'] === 'string') return value['@_url'];
  }
  return '';
}

export function stripHtml(input) {
  return toText(input)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(input, max = 350) {
  const text = toText(input).trim();
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}...`;
}

export function normalizeUrl(rawUrl) {
  const value = toText(rawUrl).trim();
  if (!value) return '';
  try {
    const parsed = new URL(value);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '';
  }
}

export function parseDateSafe(value) {
  const raw = toText(value).trim();
  if (!raw) return null;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function extractImage(item) {
  const mediaContent = toArray(item['media:content']);
  for (const entry of mediaContent) {
    if (entry && typeof entry === 'object' && typeof entry['@_url'] === 'string') {
      return entry['@_url'];
    }
  }

  const mediaThumb = toArray(item['media:thumbnail']);
  for (const entry of mediaThumb) {
    if (entry && typeof entry === 'object' && typeof entry['@_url'] === 'string') {
      return entry['@_url'];
    }
  }

  const enclosure = item.enclosure;
  if (enclosure && typeof enclosure === 'object' && typeof enclosure['@_url'] === 'string') {
    return enclosure['@_url'];
  }

  return '';
}

export function parseRssItems(xmlText) {
  const payload = parser.parse(xmlText || '');

  if (payload?.rss?.channel) {
    const channel = payload.rss.channel;
    const rawItems = toArray(channel.item);

    return rawItems
      .map((item) => {
        const title = truncate(stripHtml(item.title), 260);
        const url = normalizeUrl(item.link || item.guid);
        const description = truncate(stripHtml(item.description || item['content:encoded']), 420);
        const category = truncate(toText(toArray(item.category)[0]), 80);
        const publishedAt = parseDateSafe(item.pubDate || item.published || item.updated);
        const imageUrl = extractImage(item);

        return {
          title,
          url,
          snippet: description,
          category: category || null,
          publishedAt,
          imageUrl: imageUrl || null,
        };
      })
      .filter((item) => item.url && item.title);
  }

  if (payload?.feed) {
    const feed = payload.feed;
    const rawEntries = toArray(feed.entry);

    return rawEntries
      .map((entry) => {
        const links = toArray(entry.link);
        const selectedLink =
          links.find((link) => link?.['@_rel'] === 'alternate' && link?.['@_href']) || links[0];

        const title = truncate(stripHtml(entry.title), 260);
        const url = normalizeUrl(selectedLink?.['@_href'] || selectedLink);
        const description = truncate(stripHtml(entry.summary || entry.content), 420);
        const categoryNode = toArray(entry.category)[0];
        const category = truncate(categoryNode?.['@_term'] || categoryNode, 80);
        const publishedAt = parseDateSafe(entry.published || entry.updated);

        return {
          title,
          url,
          snippet: description,
          category: category || null,
          publishedAt,
          imageUrl: null,
        };
      })
      .filter((item) => item.url && item.title);
  }

  return [];
}

export async function fetchTextWithTimeout(url, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'en-IN,en;q=0.9',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function runWithRetry(task, options = {}) {
  const maxAttempts = Number(options.maxAttempts || 3);
  const baseDelayMs = Number(options.baseDelayMs || 700);

  let attempt = 0;
  while (attempt < maxAttempts) {
    try {
      return await task();
    } catch (error) {
      attempt += 1;
      if (attempt >= maxAttempts) {
        throw error;
      }
      const backoff = baseDelayMs * Math.pow(2, attempt - 1);
      await sleep(backoff);
    }
  }

  throw new Error('Retry loop exhausted unexpectedly');
}

function cacheGet(key) {
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (hit.expireAt <= Date.now()) {
    CACHE.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key, value, ttlMs) {
  CACHE.set(key, {
    value,
    expireAt: Date.now() + ttlMs,
  });
}

export async function withCache(key, ttlMs, loader) {
  const cached = cacheGet(key);
  if (cached !== null) return cached;
  const value = await loader();
  cacheSet(key, value, ttlMs);
  return value;
}

export function clearInsightsCache(prefix = '') {
  if (!prefix) {
    CACHE.clear();
    return;
  }

  for (const key of CACHE.keys()) {
    if (key.startsWith(prefix)) {
      CACHE.delete(key);
    }
  }
}

export function parseBudgetToRupees(value) {
  const text = toText(value).toLowerCase();
  if (!text) return null;

  const cleaned = text.replace(/,/g, '');
  const match = cleaned.match(/(\d+(?:\.\d+)?)\s*(crore|cr|lakh|lac|lk|million|m|k)?/i);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;

  const unit = (match[2] || '').toLowerCase();
  if (unit === 'crore' || unit === 'cr') return amount * 10000000;
  if (unit === 'lakh' || unit === 'lac' || unit === 'lk') return amount * 100000;
  if (unit === 'million' || unit === 'm') return amount * 1000000;
  if (unit === 'k') return amount * 1000;

  return amount;
}

export function extractCityFromText(value) {
  const text = toText(value).toLowerCase();
  if (!text) return '';

  const cityNames = Object.keys(CITY_BASELINES);
  for (const city of cityNames) {
    if (text.includes(city.toLowerCase())) {
      return city;
    }
  }

  return '';
}

export function extractLocalityFromText(value) {
  const text = toText(value);
  if (!text) return '';

  const match = text.match(/(?:in|at)\s+([A-Za-z][A-Za-z\s]{2,40})(?:,|\.|\||-|$)/i);
  if (!match) return '';
  return truncate(match[1].trim(), 80);
}

export function extractPriceHint(value) {
  const text = toText(value);
  if (!text) return '';

  const match = text.match(
    /(?:\u20B9|Rs\.?|INR)\s?[0-9][0-9,]*(?:\.\d+)?\s?(?:Crore|Cr|Lakh|Lac|L|K|Million|M)?/i
  );
  if (!match) return '';
  return truncate(match[0], 90);
}

export function extractPossessionHint(value) {
  const text = toText(value);
  if (!text) return '';

  const match = text.match(
    /(possession[^.,;]{0,80}|ready to move|launch(?:ed)?[^.,;]{0,80}|handover[^.,;]{0,80})/i
  );
  if (!match) return '';
  return truncate(match[0], 120);
}

export function monthStart(dateValue) {
  const date = new Date(dateValue);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function addMonths(dateValue, months) {
  const date = new Date(dateValue);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

export function roundTo2(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric * 100) / 100;
}


