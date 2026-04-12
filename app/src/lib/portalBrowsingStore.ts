import type { PortalCategory, PortalProperty } from './portalData';

export interface RecentlyViewedPortalListing {
  referenceId: string;
  title: string;
  city: string;
  location: string;
  priceLabel: string;
  image: string;
  projectName: string;
  category: PortalCategory;
  status: string;
  verified: boolean;
  description: string;
  viewedAt: string;
}

const RECENTLY_VIEWED_PORTAL_KEY = 'zdt_portal_recently_viewed_v1';
const DEFAULT_IMAGE = '/images/property-1.jpg';
const MAX_RECENTLY_VIEWED = 18;
export const RECENTLY_VIEWED_PORTAL_CHANGED_EVENT = 'zdt:portal-recently-viewed-changed';

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function normalizeString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function normalizeCategory(value: unknown): PortalCategory {
  if (
    value === 'buy' ||
    value === 'rent' ||
    value === 'new-launch' ||
    value === 'commercial' ||
    value === 'plots-land' ||
    value === 'projects'
  ) {
    return value;
  }
  return 'buy';
}

function sanitizeListing(raw: unknown): RecentlyViewedPortalListing | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const referenceId = normalizeString(source.referenceId);
  const title = normalizeString(source.title);
  if (!referenceId || !title) return null;

  const viewedAt = normalizeString(source.viewedAt) || new Date().toISOString();

  return {
    referenceId,
    title,
    city: normalizeString(source.city),
    location: normalizeString(source.location),
    priceLabel: normalizeString(source.priceLabel) || 'Price on request',
    image: normalizeString(source.image) || DEFAULT_IMAGE,
    projectName: normalizeString(source.projectName),
    category: normalizeCategory(source.category),
    status: normalizeString(source.status) || 'Available',
    verified: source.verified === true,
    description: normalizeString(source.description),
    viewedAt,
  };
}

function emitRecentlyViewedChanged(items: RecentlyViewedPortalListing[]) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(RECENTLY_VIEWED_PORTAL_CHANGED_EVENT, {
      detail: { count: items.length },
    })
  );
}

function writeRecentlyViewed(items: RecentlyViewedPortalListing[]) {
  if (!canUseStorage()) return;
  const next = items.slice(0, MAX_RECENTLY_VIEWED);
  window.localStorage.setItem(RECENTLY_VIEWED_PORTAL_KEY, JSON.stringify(next));
  emitRecentlyViewedChanged(next);
}

export function readRecentlyViewedPortalListings(): RecentlyViewedPortalListing[] {
  if (!canUseStorage()) return [];
  const raw = window.localStorage.getItem(RECENTLY_VIEWED_PORTAL_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => sanitizeListing(item))
      .filter((item): item is RecentlyViewedPortalListing => Boolean(item))
      .slice(0, MAX_RECENTLY_VIEWED);
  } catch {
    return [];
  }
}

export function upsertRecentlyViewedPortalListing(
  listing: RecentlyViewedPortalListing
): RecentlyViewedPortalListing[] {
  const normalized = sanitizeListing(listing);
  if (!normalized) return readRecentlyViewedPortalListings();

  const existing = readRecentlyViewedPortalListings();
  const next = [
    {
      ...normalized,
      viewedAt: new Date().toISOString(),
    },
    ...existing.filter((item) => item.referenceId !== normalized.referenceId),
  ].slice(0, MAX_RECENTLY_VIEWED);

  writeRecentlyViewed(next);
  return next;
}

export function createRecentlyViewedPortalListingFromProperty(
  property: PortalProperty
): RecentlyViewedPortalListing {
  return {
    referenceId: property.referenceId,
    title: property.title,
    city: property.city,
    location: property.location,
    priceLabel: property.priceLabel,
    image: property.image,
    projectName: property.projectName,
    category: property.category,
    status: property.status,
    verified: property.verified,
    description: property.description,
    viewedAt: new Date().toISOString(),
  };
}
