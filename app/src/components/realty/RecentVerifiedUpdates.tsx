import { useEffect, useMemo, useState } from 'react';
import { getRecentVerifiedUpdates, type InfraUpdateItem } from '@/lib/infrastructureApi';

interface RecentVerifiedUpdatesProps {
  stateName?: string;
  district?: string;
  city?: string;
  limit?: number;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function RecentVerifiedUpdates({
  stateName = '',
  district = '',
  city = '',
  limit = 5,
}: RecentVerifiedUpdatesProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState<InfraUpdateItem[]>([]);

  const query = useMemo(
    () => ({
      state: stateName.trim() || undefined,
      district: district.trim() || undefined,
      city: city.trim() || undefined,
      limit,
    }),
    [city, district, limit, stateName]
  );

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await getRecentVerifiedUpdates(query);
        if (!active) return;
        setItems(Array.isArray(response.items) ? response.items : []);
      } catch (requestError) {
        if (!active) return;
        setItems([]);
        setError(requestError instanceof Error ? requestError.message : 'Could not load recent updates.');
      } finally {
        if (!active) return;
        setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [query]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-lg font-semibold text-slate-900">Recent Verified Updates</p>
      <p className="mt-1 text-sm text-slate-600">Public Notice and Tender updates (most trustworthy).</p>

      {loading ? <p className="mt-4 text-sm text-slate-500">Loading...</p> : null}
      {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
      {!loading && !error && items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No verified updates yet.</p>
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <div className="mt-4 grid gap-3">
          {items.map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-900">{item.projectName}</p>
              <p className="mt-1 text-xs text-slate-600">
                {item.state} | {item.district} |{' '}
                {Array.isArray(item.cities) && item.cities.length > 0 ? item.cities.join(', ') : '-'}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {item.verificationLevel.replace(/_/g, ' ')} | {item.category.replace(/_/g, ' ')} | Impact:{' '}
                {item.impactLevel}
              </p>
              <p className="mt-1 text-xs text-slate-500">Updated: {formatDate(item.lastUpdated)}</p>
              {item.sourceUrl ? (
                <p className="mt-1 text-xs">
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-700 underline"
                  >
                    View official source
                  </a>
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      <p className="mt-4 text-sm">
        <a href="/infrastructure" className="font-semibold text-blue-700 underline">
          Open full tracker
        </a>
      </p>
    </section>
  );
}
