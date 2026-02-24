import { APP_VIEWS, type AppView } from './views';
import { trackFeatureUsage } from './featureUsageApi';

export interface SavedSearch {
  id: string;
  createdAt: string;
  label: string;
  targetView: AppView;
  criteria: Record<string, unknown>;
}

const SAVED_SEARCHES_KEY = 'zdt_saved_searches';
const PENDING_SAVED_SEARCH_KEY = 'zdt_pending_saved_search';
const MAX_SAVED_SEARCHES = 50;
export const SAVED_SEARCHES_CHANGED_EVENT = 'zdt:saved-searches-changed';

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function normalizeString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function isAppView(value: unknown): value is AppView {
  return typeof value === 'string' && (APP_VIEWS as readonly string[]).includes(value);
}

function sanitizeCriteria(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function sanitizeSearch(raw: unknown): SavedSearch | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const id = normalizeString(source.id);
  const label = normalizeString(source.label);
  const targetView = source.targetView;
  if (!id || !label || !isAppView(targetView)) return null;

  const createdAt = normalizeString(source.createdAt) || new Date().toISOString();
  return {
    id,
    createdAt,
    label: label.slice(0, 140),
    targetView,
    criteria: sanitizeCriteria(source.criteria),
  };
}

function emitSavedSearchesChanged(items: SavedSearch[]) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(SAVED_SEARCHES_CHANGED_EVENT, {
      detail: { count: items.length },
    })
  );
}

function writeSavedSearches(items: SavedSearch[]) {
  if (!canUseStorage()) return;
  const next = items.slice(0, MAX_SAVED_SEARCHES);
  window.localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(next));
  emitSavedSearchesChanged(next);
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      // Ignore.
    }
  }
  return `search-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`;
}

export function readSavedSearches(): SavedSearch[] {
  if (!canUseStorage()) return [];
  const raw = window.localStorage.getItem(SAVED_SEARCHES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => sanitizeSearch(item))
      .filter((item): item is SavedSearch => Boolean(item))
      .slice(0, MAX_SAVED_SEARCHES);
  } catch {
    return [];
  }
}

export function addSavedSearch(input: {
  label: string;
  targetView: AppView;
  criteria: Record<string, unknown>;
}): SavedSearch[] {
  const label = normalizeString(input.label);
  if (!label) return readSavedSearches();

  const nextSearch: SavedSearch = {
    id: generateId(),
    createdAt: new Date().toISOString(),
    label: label.slice(0, 140),
    targetView: input.targetView,
    criteria: sanitizeCriteria(input.criteria),
  };

  const existing = readSavedSearches();
  const next = [nextSearch, ...existing].slice(0, MAX_SAVED_SEARCHES);
  writeSavedSearches(next);
  return next;
}

export function removeSavedSearch(id: string): SavedSearch[] {
  const key = normalizeString(id);
  if (!key) return readSavedSearches();
  const next = readSavedSearches().filter((item) => item.id !== key);
  writeSavedSearches(next);
  void trackFeatureUsage({
    featureKey: 'saved_search_deleted',
    context: 'saved_search_store',
    view: 'saved-searches',
    detail: `id=${key}`,
  });
  return next;
}

export function clearSavedSearches() {
  if (!canUseStorage()) return;
  const existingCount = readSavedSearches().length;
  window.localStorage.removeItem(SAVED_SEARCHES_KEY);
  emitSavedSearchesChanged([]);
  void trackFeatureUsage({
    featureKey: 'saved_searches_cleared',
    context: 'saved_search_store',
    view: 'saved-searches',
    detail: `count=${existingCount}`,
  });
}

export function setPendingSavedSearch(payload: {
  targetView: AppView;
  criteria: Record<string, unknown>;
  label?: string;
}) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(
    PENDING_SAVED_SEARCH_KEY,
    JSON.stringify({
      targetView: payload.targetView,
      criteria: sanitizeCriteria(payload.criteria),
      label: normalizeString(payload.label).slice(0, 140),
      createdAt: new Date().toISOString(),
    })
  );
}

export function consumePendingSavedSearch(
  targetView: AppView
): { criteria: Record<string, unknown>; label: string } | null {
  if (!canUseStorage()) return null;
  const raw = window.localStorage.getItem(PENDING_SAVED_SEARCH_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.targetView !== targetView) return null;
    const criteria = sanitizeCriteria(parsed.criteria);
    const label = normalizeString(parsed.label);
    window.localStorage.removeItem(PENDING_SAVED_SEARCH_KEY);
    return { criteria, label };
  } catch {
    return null;
  }
}
