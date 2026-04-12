export function slugifySegment(input: string, fallback = 'listing'): string {
  const normalized = String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || fallback;
}

export function parseTrailingIdSegment(segment: string): string | null {
  const decoded = decodeURIComponent(String(segment || '')).trim();
  if (!decoded) return null;

  if (/^\d+$/.test(decoded)) {
    return decoded;
  }

  const match = /-(\d+)$/.exec(decoded);
  return match ? match[1] : null;
}

export function buildSlugIdSegment(title: string, id: string | number, fallback = 'listing'): string {
  const safeId = String(id || '').trim();
  if (!safeId) return slugifySegment(title, fallback);
  const slug = slugifySegment(title, fallback);
  return `${slug}-${encodeURIComponent(safeId)}`;
}

export function buildCanonicalDetailPath(kind: 'buy' | 'rent', title: string, id: string | number): string {
  const segment = buildSlugIdSegment(title, id, kind === 'buy' ? 'property' : 'rental');
  return `/${kind}/${segment}`;
}
