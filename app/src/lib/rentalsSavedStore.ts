export interface SavedRental {
  id: string;
  title: string;
  image: string;
  city: string;
  locality: string;
  monthlyRentLabel: string;
  bhk: string;
  furnishedStatus: string;
  availableFrom: string;
}

const SAVED_RENTALS_KEY = 'zdt_saved_rentals';
const MAX_SAVED_RENTALS = 200;
export const SAVED_RENTALS_CHANGED_EVENT = 'zdt:saved-rentals-changed';
const DEFAULT_IMAGE = '/images/property-1.jpg';

function normalizeString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function sanitizeListing(raw: unknown): SavedRental | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const id = normalizeString(source.id);
  const title = normalizeString(source.title);
  if (!id || !title) return null;

  return {
    id,
    title,
    image: normalizeString(source.image) || DEFAULT_IMAGE,
    city: normalizeString(source.city),
    locality: normalizeString(source.locality),
    monthlyRentLabel: normalizeString(source.monthlyRentLabel) || 'Rent on request',
    bhk: normalizeString(source.bhk) || 'N/A',
    furnishedStatus: normalizeString(source.furnishedStatus) || 'unfurnished',
    availableFrom: normalizeString(source.availableFrom) || '',
  };
}

function emitSavedRentals(items: SavedRental[]) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SAVED_RENTALS_CHANGED_EVENT, { detail: { count: items.length } }));
}

function writeSavedRentals(items: SavedRental[]) {
  if (!canUseStorage()) return;
  const next = items.slice(0, MAX_SAVED_RENTALS);
  window.localStorage.setItem(SAVED_RENTALS_KEY, JSON.stringify(next));
  emitSavedRentals(next);
}

export function readSavedRentals(): SavedRental[] {
  if (!canUseStorage()) return [];
  const raw = window.localStorage.getItem(SAVED_RENTALS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => sanitizeListing(item))
      .filter((item): item is SavedRental => Boolean(item))
      .slice(0, MAX_SAVED_RENTALS);
  } catch {
    return [];
  }
}

export function isSavedRental(id: string): boolean {
  const key = normalizeString(id);
  if (!key) return false;
  return readSavedRentals().some((item) => item.id === key);
}

export function upsertSavedRental(rental: SavedRental): SavedRental[] {
  const normalized = sanitizeListing(rental);
  if (!normalized) return readSavedRentals();
  const existing = readSavedRentals();
  const withoutCurrent = existing.filter((item) => item.id !== normalized.id);
  const next = [normalized, ...withoutCurrent].slice(0, MAX_SAVED_RENTALS);
  writeSavedRentals(next);
  return next;
}

export function removeSavedRental(id: string): SavedRental[] {
  const key = normalizeString(id);
  if (!key) return readSavedRentals();
  const next = readSavedRentals().filter((item) => item.id !== key);
  writeSavedRentals(next);
  return next;
}
