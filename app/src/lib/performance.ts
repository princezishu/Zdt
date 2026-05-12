/**
 * Debounce utility for search/filter inputs.
 * Prevents excessive API calls on rapid user input.
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delayMs = 300
): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const debounced = ((...args: unknown[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delayMs);
  }) as T & { cancel: () => void };

  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return debounced;
}

/**
 * Simple in-memory cache with TTL for API responses.
 * Implements stale-while-revalidate pattern.
 */
interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
  staleAt: number;
  expireAt: number;
}

const apiCache = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): { data: T; isStale: boolean } | null {
  const entry = apiCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;

  const now = Date.now();
  if (now > entry.expireAt) {
    apiCache.delete(key);
    return null;
  }

  return {
    data: entry.data,
    isStale: now > entry.staleAt,
  };
}

export function setCache<T>(
  key: string,
  data: T,
  { freshMs = 30_000, staleMs = 120_000 }: { freshMs?: number; staleMs?: number } = {}
): void {
  const now = Date.now();
  apiCache.set(key, {
    data,
    fetchedAt: now,
    staleAt: now + freshMs,
    expireAt: now + staleMs,
  });
}

export function invalidateCache(keyPrefix?: string): void {
  if (!keyPrefix) {
    apiCache.clear();
    return;
  }
  for (const key of apiCache.keys()) {
    if (key.startsWith(keyPrefix)) {
      apiCache.delete(key);
    }
  }
}

/**
 * Cloudinary URL optimization — append format auto and quality auto.
 */
export function optimizeCloudinaryUrl(url: string): string {
  if (!url || typeof url !== 'string') return url;
  if (!url.includes('cloudinary.com')) return url;
  if (url.includes('f_auto') || url.includes('q_auto')) return url;

  // Insert f_auto,q_auto into the transformation chain
  const uploadIndex = url.indexOf('/upload/');
  if (uploadIndex === -1) return url;

  const insertAt = uploadIndex + '/upload/'.length;
  return `${url.slice(0, insertAt)}f_auto,q_auto/${url.slice(insertAt)}`;
}
