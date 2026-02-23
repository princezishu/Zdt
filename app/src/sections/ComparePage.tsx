import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, GitCompareArrows, MessageCircle, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  COMPARE_CHANGED_EVENT,
  clearComparedListings,
  readComparedListings,
  removeComparedListing,
  type ComparedListing,
} from '@/lib/compareStore';

interface ComparePageProps {
  onOpenDetails: (referenceId?: string) => void;
  onOpenMessages: (referenceId?: string) => void;
}

function formatUpdatedAt(value?: string): string {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function ComparePage({ onOpenDetails, onOpenMessages }: ComparePageProps) {
  const [items, setItems] = useState<ComparedListing[]>(() => readComparedListings());

  const sync = useCallback(() => {
    setItems(readComparedListings());
  }, []);

  useEffect(() => {
    sync();

    const handleStorage = () => sync();
    const handleChanged = () => sync();

    window.addEventListener('storage', handleStorage);
    window.addEventListener(COMPARE_CHANGED_EVENT, handleChanged);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(COMPARE_CHANGED_EVENT, handleChanged);
    };
  }, [sync]);

  const tableRows = useMemo(
    () =>
      [
        { key: 'price', label: 'Price', get: (item: ComparedListing) => item.priceLabel || '-' },
        { key: 'area', label: 'Area', get: (item: ComparedListing) => item.areaLabel || '-' },
        { key: 'city', label: 'City', get: (item: ComparedListing) => item.city || '-' },
        { key: 'locality', label: 'Locality', get: (item: ComparedListing) => item.area || '-' },
        { key: 'type', label: 'Type', get: (item: ComparedListing) => item.propertyType || '-' },
        { key: 'bhk', label: 'BHK', get: (item: ComparedListing) => item.bhk || '-' },
        { key: 'facing', label: 'Facing', get: (item: ComparedListing) => item.mainDoorFacing || '-' },
        { key: 'vastu', label: 'Vastu', get: (item: ComparedListing) => `${item.vastuScore ?? 0}%` },
        { key: 'verified', label: 'Verified', get: (item: ComparedListing) => (item.verified ? 'Yes' : 'No') },
        { key: 'updatedAt', label: 'Updated', get: (item: ComparedListing) => formatUpdatedAt(item.updatedAt) },
      ] as const,
    []
  );

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container zdt-page-stack">
        <div className="zdt-panel-hero rounded-3xl border p-6 shadow-xl">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Compare</p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Compare Properties</h1>
          <p className="mt-2 text-sm text-slate-600">
            Shortlist up to 6 properties and compare key metrics side by side.
          </p>
        </div>

        <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
              <GitCompareArrows className="h-4 w-4 text-blue-700" />
              Compared: {items.length} / 6
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                className="border-slate-300 text-red-700 hover:bg-red-50 hover:text-red-700"
                onClick={() => {
                  clearComparedListings();
                  sync();
                }}
                disabled={items.length === 0}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Clear Compare
              </Button>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
              No properties in compare yet. Use the Compare button on listings.
            </div>
          ) : (
            <>
              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {items.map((item) => (
                  <article key={item.referenceId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="relative">
                      <img
                        src={item.image || '/images/property-1.jpg'}
                        alt={item.title}
                        className="h-44 w-full object-cover"
                        loading="lazy"
                        onError={(event) => {
                          const fallback = '/images/property-1.jpg';
                          if (event.currentTarget.src.endsWith(fallback)) return;
                          event.currentTarget.src = fallback;
                        }}
                      />
                      {item.verified && (
                        <Badge className="absolute left-3 top-3 bg-emerald-600 text-white hover:bg-emerald-600">
                          <BadgeCheck className="mr-1 h-3.5 w-3.5" />
                          Verified
                        </Badge>
                      )}
                      <button
                        type="button"
                        className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-white/90 text-slate-600 shadow-sm transition hover:text-red-600"
                        title="Remove from compare"
                        onClick={() => {
                          removeComparedListing(item.referenceId);
                          sync();
                        }}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="space-y-2 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.referenceId}</p>
                      <h2 className="text-sm font-semibold text-slate-900">{item.title}</h2>
                      <p className="text-sm font-semibold text-blue-800">{item.priceLabel}</p>
                      <p className="text-xs text-slate-600">{item.city}, {item.area}</p>
                      <div className="grid grid-cols-2 gap-2 pt-2">
                        <Button className="h-9 bg-blue-700 text-xs text-white hover:bg-blue-800" onClick={() => onOpenDetails(item.referenceId)}>
                          View Details
                        </Button>
                        <Button variant="outline" className="h-9 text-xs" onClick={() => onOpenMessages(item.referenceId)}>
                          <MessageCircle className="mr-1 h-3.5 w-3.5" />
                          Chat
                        </Button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-[760px] w-full border-collapse bg-white text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="w-[220px] border-b border-slate-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                        Attribute
                      </th>
                      {items.map((item) => (
                        <th
                          key={`head-${item.referenceId}`}
                          className="border-b border-slate-200 px-4 py-3 text-left text-xs font-semibold text-slate-700"
                        >
                          {item.referenceId}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row) => (
                      <tr key={row.key} className="odd:bg-white even:bg-slate-50/40">
                        <td className="border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          {row.label}
                        </td>
                        {items.map((item) => (
                          <td key={`${row.key}-${item.referenceId}`} className="border-b border-slate-200 px-4 py-3 text-slate-800">
                            {row.get(item)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

