const STORAGE_KEY = 'zdt_recently_viewed';
const MAX_ITEMS = 20;
const CHANGED_EVENT = 'zdt_recently_viewed_changed';

export interface RecentlyViewedItem {
  id: string;
  title: string;
  image: string;
  city: string;
  area: string;
  priceLabel: string;
  propertyType: string;
  viewedAt: string;
}

function readItems(): RecentlyViewedItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeItems(items: RecentlyViewedItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
    window.dispatchEvent(new CustomEvent(CHANGED_EVENT));
  } catch {
    /* storage full */
  }
}

export function addRecentlyViewed(item: Omit<RecentlyViewedItem, 'viewedAt'>): void {
  const items = readItems().filter((existing) => existing.id !== item.id);
  items.unshift({ ...item, viewedAt: new Date().toISOString() });
  writeItems(items);
}

export function getRecentlyViewed(): RecentlyViewedItem[] {
  return readItems();
}

export function clearRecentlyViewed(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(CHANGED_EVENT));
  } catch {
    /* noop */
  }
}

export { CHANGED_EVENT as RECENTLY_VIEWED_CHANGED_EVENT };
