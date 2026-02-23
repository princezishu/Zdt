import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, CalendarDays, Heart, MapPin, Search, Sofa, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/http';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  SAVED_RENTALS_CHANGED_EVENT,
  readSavedRentals,
  removeSavedRental,
  upsertSavedRental,
  type SavedRental,
} from '@/lib/rentalsSavedStore';

interface SavedRentalsPageProps {
  onOpenRent: () => void;
  onViewDetails: (rentalId: string) => void;
}

interface ApiRental {
  id: number;
  title: string;
  city: string;
  locality: string;
  monthlyRent: number | null;
  securityDeposit: number | null;
  bhk: number | null;
  carpetArea: number | null;
  furnishedStatus: string;
  availableFrom: string;
  primaryImage: string;
  isVerified: boolean;
  viewCount: number;
}

interface SavedRentalsResponse {
  rentals: ApiRental[];
}

type SavedRentalView = {
  id: string;
  title: string;
  image: string;
  city: string;
  locality: string;
  monthlyRentLabel: string;
  depositLabel: string;
  bhkLabel: string;
  furnishedStatus: string;
  availableFrom: string;
  isVerified: boolean;
  viewCount: number;
};

function formatCurrency(value: number | null, suffix = ''): string {
  if (!value || value <= 0) return 'On request';
  return `INR ${Math.round(value).toLocaleString('en-IN')}${suffix}`;
}

function mapApiRental(item: ApiRental): SavedRentalView {
  const available = item.availableFrom
    ? new Date(item.availableFrom).toLocaleDateString('en-IN')
    : 'Immediate';
  return {
    id: String(item.id),
    title: item.title,
    image: item.primaryImage || '/images/property-1.jpg',
    city: item.city,
    locality: item.locality,
    monthlyRentLabel: formatCurrency(item.monthlyRent, '/mo'),
    depositLabel: formatCurrency(item.securityDeposit),
    bhkLabel: item.bhk ? `${item.bhk} BHK` : 'Studio',
    furnishedStatus: item.furnishedStatus || 'unfurnished',
    availableFrom: available,
    isVerified: Boolean(item.isVerified),
    viewCount: Number(item.viewCount || 0),
  };
}

function mapLocalRental(item: SavedRental): SavedRentalView {
  return {
    id: item.id,
    title: item.title,
    image: item.image || '/images/property-1.jpg',
    city: item.city,
    locality: item.locality,
    monthlyRentLabel: item.monthlyRentLabel || 'Rent on request',
    depositLabel: 'Deposit on request',
    bhkLabel: item.bhk || 'N/A',
    furnishedStatus: item.furnishedStatus || 'unfurnished',
    availableFrom: item.availableFrom || 'Immediate',
    isVerified: false,
    viewCount: 0,
  };
}

export default function SavedRentalsPage({ onOpenRent, onViewDetails }: SavedRentalsPageProps) {
  const [query, setQuery] = useState('');
  const [saved, setSaved] = useState<SavedRentalView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadLocal = useCallback(() => {
    const localSaved = readSavedRentals().map(mapLocalRental);
    setSaved(localSaved);
  }, []);

  const syncFromApi = useCallback(async () => {
    try {
      const response = await apiRequest<SavedRentalsResponse>('/api/rentals/saved');
      const mapped = (response.rentals || []).map(mapApiRental);
      mapped.forEach((item) =>
        upsertSavedRental({
          id: item.id,
          title: item.title,
          image: item.image,
          city: item.city,
          locality: item.locality,
          monthlyRentLabel: item.monthlyRentLabel,
          bhk: item.bhkLabel,
          furnishedStatus: item.furnishedStatus,
          availableFrom: item.availableFrom,
        })
      );
      setSaved(mapped);
      setError('');
    } catch (loadError) {
      loadLocal();
      setError(loadError instanceof Error ? loadError.message : 'Unable to load saved rentals.');
    } finally {
      setLoading(false);
    }
  }, [loadLocal]);

  useEffect(() => {
    let active = true;
    setLoading(true);

    syncFromApi().finally(() => {
      if (!active) return;
      setLoading(false);
    });

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== 'zdt_saved_rentals') return;
      loadLocal();
    };

    const handleSavedChanged = () => loadLocal();

    window.addEventListener('storage', handleStorage);
    window.addEventListener(SAVED_RENTALS_CHANGED_EVENT, handleSavedChanged);

    return () => {
      active = false;
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(SAVED_RENTALS_CHANGED_EVENT, handleSavedChanged);
    };
  }, [loadLocal, syncFromApi]);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return saved;
    return saved.filter((item) =>
      `${item.title} ${item.city} ${item.locality} ${item.bhkLabel}`
        .toLowerCase()
        .includes(text)
    );
  }, [query, saved]);

  const handleRemove = async (rentalId: string) => {
    removeSavedRental(rentalId);
    setSaved((prev) => prev.filter((item) => item.id !== rentalId));
    try {
      await apiRequest(`/api/rentals/saved/${rentalId}`, { method: 'DELETE' });
    } catch {
      // ignore API failure, local save already updated
    }
    toast.success('Removed from saved rentals');
  };

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container zdt-page-stack">
        <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-[#0b1220] via-[#111827] to-[#24364b] p-6 text-white shadow-xl">
          <p className="text-xs uppercase tracking-[0.28em] text-blue-200">Saved Rentals</p>
          <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">Your rental shortlist, ready to tour.</h1>
          <p className="mt-2 max-w-2xl text-sm text-blue-100/90">
            Track visit-ready homes, send owner inquiries, and move fast when a match appears.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search saved rentals by title or locality..."
                className="h-11 pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                Saved: {saved.length}
              </span>
              <Button variant="outline" onClick={onOpenRent}>
                Browse Rentals
              </Button>
            </div>
          </div>

          {loading && (
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
              Loading saved rentals...
            </div>
          )}

          {!loading && error && (
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
              {error} Showing locally saved rentals.
            </div>
          )}

          {!loading && saved.length === 0 && (
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
              No saved rentals yet. Tap the heart icon on listings to add them here.
            </div>
          )}

          {!loading && saved.length > 0 && filtered.length === 0 && (
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
              No saved rentals match your search.
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((item) => (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-lg"
                >
                  <div className="relative">
                    <img
                      src={item.image}
                      alt={item.title}
                      className="h-40 w-full object-cover"
                      loading="lazy"
                      onError={(event) => {
                        const fallback = '/images/property-1.jpg';
                        if (event.currentTarget.src.endsWith(fallback)) return;
                        event.currentTarget.src = fallback;
                      }}
                    />
                    {item.isVerified && (
                      <Badge className="absolute left-3 top-3 bg-emerald-600 text-white hover:bg-emerald-600">
                        <BadgeCheck className="mr-1 h-3.5 w-3.5" />
                        Verified
                      </Badge>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemove(item.id)}
                      className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-white/90 text-rose-600 shadow-sm transition hover:bg-rose-50"
                      aria-label="Remove saved rental"
                    >
                      <Heart className="h-4 w-4 fill-current" />
                    </button>
                  </div>
                  <div className="space-y-2 p-4">
                    <h2 className="text-sm font-semibold text-slate-900">{item.title}</h2>
                    <p className="inline-flex items-center gap-1 text-xs text-slate-500">
                      <MapPin className="h-3.5 w-3.5" />
                      {item.locality || item.city}
                    </p>
                    <p className="text-base font-semibold text-blue-900">{item.monthlyRentLabel}</p>
                    <p className="text-xs text-slate-500">Deposit {item.depositLabel}</p>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                      <span>{item.bhkLabel}</span>
                      <span className="inline-flex items-center gap-1">
                        <Sofa className="h-3.5 w-3.5" />
                        {item.furnishedStatus}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {item.availableFrom}
                      </span>
                      {item.viewCount > 0 && <span>{item.viewCount} views</span>}
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <Button
                        type="button"
                        className="h-9 bg-blue-700 text-xs text-white hover:bg-blue-800"
                        onClick={() => onViewDetails(item.id)}
                      >
                        View Details
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 text-xs text-rose-700 hover:bg-rose-50 hover:text-rose-700"
                        onClick={() => handleRemove(item.id)}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Remove
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
