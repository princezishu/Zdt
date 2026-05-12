import fs from 'node:fs';
import path from 'node:path';

function normalizeUrlCandidate(value, { assumeHttps = false } = {}) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return '';
  }

  const withoutTrailingSlash = trimmed.replace(/\/+$/, '');
  if (/^https?:\/\//i.test(withoutTrailingSlash)) {
    return withoutTrailingSlash;
  }

  if (assumeHttps) {
    return `https://${withoutTrailingSlash}`;
  }

  return withoutTrailingSlash;
}

const siteUrl = (
  normalizeUrlCandidate(process.env.VITE_SITE_URL) ||
  normalizeUrlCandidate(process.env.VERCEL_PROJECT_PRODUCTION_URL, { assumeHttps: true }) ||
  normalizeUrlCandidate(process.env.VERCEL_URL, { assumeHttps: true }) ||
  'https://zdtrealty.vercel.app'
).replace(/\/$/, '');
const outputPath = path.resolve(process.cwd(), 'public', 'sitemap.xml');

const staticPaths = [
  '/',
  '/buy',
  '/rent',
  '/buy-map',
  '/rent-map',
  '/property-details',
  '/new-launch',
  '/commercial',
  '/plots-land',
  '/projects',
  '/invest',
  '/ai-services',
  '/group-deals',
  '/construct-with-us',
  '/building-materials',
  '/infrastructure',
  '/about',
  '/contact',
  '/help-center',
  '/blog',
  '/faq',
  '/privacy',
  '/terms',
  '/cookies',
  '/security',
  '/career',
  '/e-auction',
  '/emi-calculator',
  '/pricing',
  '/sell-property',
  '/insights-news',
];

function mapPriority(pathname) {
  if (pathname === '/') return '1.0';
  if (pathname === '/buy' || pathname === '/rent') return '0.9';
  if (pathname.includes('details')) return '0.85';
  return '0.7';
}

const now = new Date().toISOString();
const uniquePaths = Array.from(new Set(staticPaths));

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  uniquePaths
    .map((pathname) => {
      const loc = `${siteUrl}${pathname}`;
      return [
        '  <url>',
        `    <loc>${loc}</loc>`,
        `    <lastmod>${now}</lastmod>`,
        '    <changefreq>daily</changefreq>',
        `    <priority>${mapPriority(pathname)}</priority>`,
        '  </url>',
      ].join('\n');
    })
    .join('\n') +
  '\n</urlset>\n';

fs.writeFileSync(outputPath, xml, 'utf8');
console.log(`Generated sitemap: ${outputPath}`);
