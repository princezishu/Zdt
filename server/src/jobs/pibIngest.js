import crypto from 'crypto';
import Parser from 'rss-parser';
import { fetchTextWithRetry } from '../utils/fetchWithRetry.js';

const parser = new Parser({
  timeout: 20000,
  headers: {
    'User-Agent': 'ZDT-InfraBot/1.0 (+https://zdt.example)',
  },
});

const PIB_FEEDS = [
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

function pickGuid(item) {
  return (
    item.guid ||
    item.id ||
    item.link ||
    `${item.title || ''}::${item.pubDate || item.isoDate || ''}`
  );
}

function normalizeHashPart(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function buildContentHash({
  title,
  link,
  summary,
  publishedAt,
}) {
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

export async function runPibIngest(db) {
  for (const feed of PIB_FEEDS) {
    try {
      const xml = await fetchTextWithRetry(feed.url, {
        retries: 4,
        timeoutMs: 25000,
        headers: {
          Accept: 'application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8',
          Referer: 'https://pib.gov.in/',
        },
      });
      const data = await parser.parseString(xml);
      const items = Array.isArray(data.items) ? data.items : [];

      for (const item of items) {
        const guid = String(pickGuid(item) || '').trim();
        const title = String(item.title || '').trim();
        const link = String(item.link || '').trim();

        if (!guid || !title || !link) continue;

        const publishedAtRaw = item.isoDate || item.pubDate || '';
        const publishedAt = publishedAtRaw ? new Date(publishedAtRaw) : null;
        const summary = String(item.contentSnippet || item.content || '').trim().slice(0, 2000);
        const contentHash = buildContentHash({
          title,
          link,
          summary,
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
            feed.sourceKey,
            guid,
            contentHash,
            title,
            link,
            publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
            summary || null,
            JSON.stringify(item),
          ]
        );
      }
    } catch (error) {
      console.error(`[PIB INGEST] Failed for ${feed.sourceKey}:`, error?.message || error);
    }
  }
}
