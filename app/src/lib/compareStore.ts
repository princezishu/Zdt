export interface ComparedListing {
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
  updatedAt?: string;
}

const COMPARE_KEY = 'zdt_compared_listings';
const MAX_COMPARED = 4;
export const COMPARE_CHANGED_EVENT = 'zdt:compare-changed';
const DEFAULT_IMAGE = '/images/property-1.jpg';

function normalizeString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function sanitizeListing(raw: unknown): ComparedListing | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const id = normalizeString(source.id);
  const referenceIdRaw = normalizeString(source.referenceId);
  const referenceId = referenceIdRaw || id;
  const title = normalizeString(source.title);
  if (!referenceId || !title) return null;

  return {
    id: id || referenceId,
    referenceId,
    title: title.slice(0, 200),
    image: normalizeString(source.image) || DEFAULT_IMAGE,
    city: normalizeString(source.city),
    area: normalizeString(source.area),
    priceLabel: normalizeString(source.priceLabel) || 'Price on request',
    areaLabel: normalizeString(source.areaLabel) || 'Area on request',
    propertyType: normalizeString(source.propertyType) || 'Property',
    bhk: normalizeString(source.bhk) || 'N/A',
    mainDoorFacing: normalizeString(source.mainDoorFacing) || 'NA',
    vastuScore:
      typeof source.vastuScore === 'number' && Number.isFinite(source.vastuScore)
        ? Math.max(0, Math.min(100, Math.round(source.vastuScore)))
        : 0,
    verified: source.verified === true,
    ownerPhone: normalizeString(source.ownerPhone) || 'Hidden',
    updatedAt: normalizeString(source.updatedAt),
  };
}

function emitCompareChanged(items: ComparedListing[]) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(COMPARE_CHANGED_EVENT, {
      detail: { count: items.length },
    })
  );
}

function writeComparedListings(items: ComparedListing[]) {
  if (!canUseStorage()) return;
  const next = items.slice(0, MAX_COMPARED);
  window.localStorage.setItem(COMPARE_KEY, JSON.stringify(next));
  emitCompareChanged(next);
}

export function readComparedListings(): ComparedListing[] {
  if (!canUseStorage()) return [];
  const raw = window.localStorage.getItem(COMPARE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => sanitizeListing(item))
      .filter((item): item is ComparedListing => Boolean(item))
      .slice(0, MAX_COMPARED);
  } catch {
    return [];
  }
}

export function readComparedIds(): string[] {
  return readComparedListings().map((item) => item.referenceId).filter(Boolean);
}

export function isCompared(referenceId: string): boolean {
  const key = normalizeString(referenceId);
  if (!key) return false;
  return readComparedListings().some((item) => item.referenceId === key);
}

export function upsertComparedListing(listing: ComparedListing): ComparedListing[] {
  const normalized = sanitizeListing(listing);
  if (!normalized) return readComparedListings();

  const existing = readComparedListings();
  const withoutCurrent = existing.filter((item) => item.referenceId !== normalized.referenceId);
  const next = [normalized, ...withoutCurrent].slice(0, MAX_COMPARED);
  writeComparedListings(next);
  return next;
}

export function removeComparedListing(referenceId: string): ComparedListing[] {
  const key = normalizeString(referenceId);
  if (!key) return readComparedListings();
  const next = readComparedListings().filter((item) => item.referenceId !== key);
  writeComparedListings(next);
  return next;
}

export function clearComparedListings() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(COMPARE_KEY);
  emitCompareChanged([]);
}
