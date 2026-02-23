export interface FavoriteListing {
  id: string;
  referenceId: string;
  title: string;
  image: string;
  city: string;
  area: string;
  priceLabel: string;
  areaLabel: string;
  propertyType: string;
  bhk: string;
  mainDoorFacing: string;
  vastuScore: number;
  verified: boolean;
  ownerPhone: string;
  isFeatured?: boolean;
  updatedAt?: string;
}

const FAVORITES_KEY = 'zdt_favorite_listings';
const MAX_FAVORITES = 200;
export const FAVORITES_CHANGED_EVENT = 'zdt:favorites-changed';
const DEFAULT_FAVORITE_IMAGE = '/images/property-1.jpg';

function normalizeString(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function sanitizeListing(raw: unknown): FavoriteListing | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const source = raw as Record<string, unknown>;
  const id = normalizeString(source.id);
  const referenceIdRaw = normalizeString(source.referenceId);
  const referenceId = referenceIdRaw || id;
  const title = normalizeString(source.title);
  if (!referenceId || !title) {
    return null;
  }
  return {
    id: id || referenceId,
    referenceId,
    title,
    image: normalizeString(source.image) || DEFAULT_FAVORITE_IMAGE,
    city: typeof source.city === 'string' ? source.city : '',
    area: typeof source.area === 'string' ? source.area : '',
    priceLabel: typeof source.priceLabel === 'string' ? source.priceLabel : 'Price on request',
    areaLabel: typeof source.areaLabel === 'string' ? source.areaLabel : 'Area on request',
    propertyType: typeof source.propertyType === 'string' ? source.propertyType : 'Property',
    bhk: typeof source.bhk === 'string' ? source.bhk : 'N/A',
    mainDoorFacing: typeof source.mainDoorFacing === 'string' ? source.mainDoorFacing : 'NA',
    vastuScore:
      typeof source.vastuScore === 'number' && Number.isFinite(source.vastuScore)
        ? Math.max(0, Math.min(100, Math.round(source.vastuScore)))
        : 0,
    verified: source.verified === true,
    ownerPhone: typeof source.ownerPhone === 'string' ? source.ownerPhone : 'Hidden',
    isFeatured: source.isFeatured === true,
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : '',
  };
}

function emitFavoritesChanged(items: FavoriteListing[]) {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(FAVORITES_CHANGED_EVENT, {
      detail: { count: items.length },
    })
  );
}

function writeFavoriteListings(items: FavoriteListing[]) {
  if (!canUseStorage()) {
    return;
  }
  const next = items.slice(0, MAX_FAVORITES);
  window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  emitFavoritesChanged(next);
}

export function readFavoriteListings(): FavoriteListing[] {
  if (!canUseStorage()) {
    return [];
  }
  const raw = window.localStorage.getItem(FAVORITES_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => sanitizeListing(item))
      .filter((item): item is FavoriteListing => Boolean(item))
      .slice(0, MAX_FAVORITES);
  } catch {
    return [];
  }
}

export function readFavoriteIds(): string[] {
  return readFavoriteListings().map((item) => item.referenceId).filter(Boolean);
}

export function isFavorite(referenceId: string): boolean {
  const key = normalizeString(referenceId);
  if (!key) {
    return false;
  }
  return readFavoriteListings().some((item) => item.referenceId === key);
}

export function upsertFavoriteListing(listing: FavoriteListing): FavoriteListing[] {
  const normalized = sanitizeListing(listing);
  if (!normalized) {
    return readFavoriteListings();
  }
  const existing = readFavoriteListings();
  const withoutCurrent = existing.filter((item) => item.referenceId !== normalized.referenceId);
  const next = [normalized, ...withoutCurrent].slice(0, MAX_FAVORITES);
  writeFavoriteListings(next);
  return next;
}

export function removeFavoriteListing(referenceId: string): FavoriteListing[] {
  const key = normalizeString(referenceId);
  if (!key) {
    return readFavoriteListings();
  }
  const next = readFavoriteListings().filter((item) => item.referenceId !== key);
  writeFavoriteListings(next);
  return next;
}

export function clearFavoriteListings() {
  if (!canUseStorage()) {
    return;
  }
  window.localStorage.removeItem(FAVORITES_KEY);
  emitFavoritesChanged([]);
}
