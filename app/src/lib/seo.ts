export type SeoStructuredData = Record<string, unknown> | Array<Record<string, unknown>>;

export interface SeoConfig {
  title?: string;
  description?: string;
  canonicalPath?: string;
  image?: string;
  type?: string;
  noIndex?: boolean;
  structuredData?: SeoStructuredData;
}

const DEFAULT_TITLE = 'ZDT Realty - Property Portal';
const DEFAULT_DESCRIPTION =
  'ZDT Realty helps buyers, sellers, renters, and investors discover verified property listings across India.';

function getSiteUrl(): string {
  const configured = String(import.meta.env.VITE_SITE_URL || '').trim();
  if (configured) {
    return configured.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/$/, '');
  }
  return '';
}

function toAbsoluteUrl(pathOrUrl: string): string {
  const value = String(pathOrUrl || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;

  const siteUrl = getSiteUrl();
  if (!siteUrl) return value;
  return `${siteUrl}${value.startsWith('/') ? value : `/${value}`}`;
}

function upsertMetaByName(name: string, content: string): void {
  if (typeof document === 'undefined') return;
  let node = document.head.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!node) {
    node = document.createElement('meta');
    node.setAttribute('name', name);
    document.head.appendChild(node);
  }
  node.setAttribute('content', content);
}

function upsertMetaByProperty(property: string, content: string): void {
  if (typeof document === 'undefined') return;
  let node = document.head.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
  if (!node) {
    node = document.createElement('meta');
    node.setAttribute('property', property);
    document.head.appendChild(node);
  }
  node.setAttribute('content', content);
}

function upsertCanonical(href: string): void {
  if (typeof document === 'undefined') return;
  let node = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!node) {
    node = document.createElement('link');
    node.setAttribute('rel', 'canonical');
    document.head.appendChild(node);
  }
  node.setAttribute('href', href);
}

function upsertStructuredData(data: SeoStructuredData): void {
  if (typeof document === 'undefined') return;
  const scriptId = 'zdt-seo-jsonld';
  let node = document.getElementById(scriptId) as HTMLScriptElement | null;
  if (!node) {
    node = document.createElement('script');
    node.id = scriptId;
    node.type = 'application/ld+json';
    document.head.appendChild(node);
  }
  node.text = JSON.stringify(data);
}

export function applySeo(config: SeoConfig): void {
  if (typeof document === 'undefined') return;

  const title = String(config.title || '').trim() || DEFAULT_TITLE;
  const description = String(config.description || '').trim() || DEFAULT_DESCRIPTION;
  const canonicalPath = String(config.canonicalPath || '').trim();
  const absoluteCanonical = canonicalPath
    ? toAbsoluteUrl(canonicalPath)
    : typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}${window.location.search}`
      : '';
  const image = toAbsoluteUrl(config.image || '/images/hero-bg.jpg');
  const type = String(config.type || '').trim() || 'website';

  document.title = title;
  upsertMetaByName('description', description);
  upsertMetaByName('robots', config.noIndex ? 'noindex,nofollow' : 'index,follow');

  if (absoluteCanonical) {
    upsertCanonical(absoluteCanonical);
  }

  upsertMetaByProperty('og:title', title);
  upsertMetaByProperty('og:description', description);
  upsertMetaByProperty('og:type', type);
  if (absoluteCanonical) {
    upsertMetaByProperty('og:url', absoluteCanonical);
  }
  if (image) {
    upsertMetaByProperty('og:image', image);
  }

  upsertMetaByName('twitter:card', 'summary_large_image');
  upsertMetaByName('twitter:title', title);
  upsertMetaByName('twitter:description', description);
  if (image) {
    upsertMetaByName('twitter:image', image);
  }

  if (config.structuredData) {
    upsertStructuredData(config.structuredData);
  }
}

export function buildCanonicalPath(pathname: string, search = ''): string {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const normalizedSearch = search && !search.startsWith('?') ? `?${search}` : search;
  return `${normalizedPath}${normalizedSearch || ''}`;
}
