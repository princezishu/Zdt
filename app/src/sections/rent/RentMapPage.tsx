import { useEffect, useMemo, useState } from 'react';
import { Map, ArrowLeftRight, ChevronRight } from 'lucide-react';
import { apiRequest } from '@/lib/http';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PropertyCardsSkeleton } from '@/components/loading/PageSkeletons';
import ListingMap from '@/components/maps/ListingMap';
import { applySeo } from '@/lib/seo';

interface RentMapPageProps {
  onOpenDetails: (propertyId: string) => void;
  onOpenSaved: () => void;
  onOpenList: () => void;
}

interface MapRental {
  id: number;
  title: string;
  city: string;
  locality: string;
  monthlyRent: number | null;
  primaryImage: string;
  latitude: number | null;
  longitude: number | null;
  isFeatured: boolean;
}

interface MapResponse {
  rentals: MapRental[];
  total: number;
}

function formatRent(value: number | null): string {
  if (!value || value <= 0) return 'Rent on request';
  return `INR ${Math.round(value).toLocaleString('en-IN')}/mo`;
}

export default function RentMapPage({ onOpenDetails, onOpenSaved, onOpenList }: RentMapPageProps) {
  const [rentals, setRentals] = useState<MapRental[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const filterSummary = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const city = params.get('city');
    const bhk = params.get('bhk');
    const type = params.get('type');
    const tags = [city, bhk, type].filter(Boolean).join(' • ');
    return tags || 'All cities • All configurations';
  }, []);

  const mapMarkers = useMemo(
    () =>
      rentals
        .filter(
          (rental) =>
            rental.latitude !== null &&
            rental.longitude !== null &&
            Number.isFinite(Number(rental.latitude)) &&
            Number.isFinite(Number(rental.longitude))
        )
        .map((rental) => ({
          id: String(rental.id),
          latitude: Number(rental.latitude),
          longitude: Number(rental.longitude),
          title: rental.title,
          subtitle: `${rental.locality || rental.city}`,
          priceLabel: formatRent(rental.monthlyRent),
        })),
    [rentals]
  );

  const resolvedSelectedId = useMemo(() => {
    if (rentals.length === 0) return null;
    if (selectedId && rentals.some((rental) => String(rental.id) === selectedId)) {
      return selectedId;
    }
    return String(rentals[0].id);
  }, [rentals, selectedId]);

  useEffect(() => {
    applySeo({
      title: 'Rent Map View | ZDT Realty',
      description:
        'Browse rental listings on an interactive map with synchronized marker and card selection.',
      canonicalPath: '/rent-map',
      type: 'website',
    });
  }, []);

  useEffect(() => {
    let active = true;

    apiRequest<MapResponse>(`/api/rentals?${window.location.search.slice(1)}`)
      .then((response) => {
        if (!active) return;
        setRentals(response.rentals || []);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load rentals');
        setRentals([]);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Rent Map View</h1>
            <p className="text-sm text-slate-600">{filterSummary}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-11" onClick={onOpenList}>
              Back to List
            </Button>
            <Button variant="outline" className="h-11" onClick={onOpenSaved}>
              Saved Rentals
            </Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 text-white">
            <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs">
              <Map className="h-4 w-4" />
              Rental map clustering
            </div>
            <div className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs">
              <ArrowLeftRight className="h-4 w-4" />
              Filters synced
            </div>
            <div className="h-[520px]">
              <ListingMap
                markers={mapMarkers}
                selectedId={resolvedSelectedId}
                onSelect={setSelectedId}
                fallbackTitle="Google Maps integration"
                fallbackDescription="Set VITE_GOOGLE_MAPS_API_KEY to show map markers for rental listings."
              />
            </div>
          </div>

          <aside className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Map Listings</h2>
              <p className="mt-1 text-xs text-slate-500">Tap a card to open full details.</p>
            </div>

            {loading ? (
              <PropertyCardsSkeleton />
            ) : error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</div>
            ) : (
              <div className="space-y-3">
                {rentals.map((rental) => (
                  <button
                    key={rental.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(String(rental.id));
                      onOpenDetails(String(rental.id));
                    }}
                    className={`flex min-h-11 w-full items-center gap-3 rounded-2xl border bg-white p-3 text-left shadow-sm transition hover:border-blue-300 ${
                      resolvedSelectedId === String(rental.id)
                        ? 'border-blue-300 ring-1 ring-blue-200'
                        : 'border-slate-200'
                    }`}
                  >
                    <img
                      src={rental.primaryImage || '/images/property-1.jpg'}
                      alt={rental.title}
                      className="h-16 w-20 rounded-xl object-cover"
                      loading="lazy"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{rental.title}</p>
                      <p className="truncate text-xs text-slate-500">{rental.locality || rental.city}</p>
                      <p className="text-sm font-semibold text-blue-900">{formatRent(rental.monthlyRent)}</p>
                    </div>
                    {rental.isFeatured && (
                      <Badge className="bg-amber-500 text-white hover:bg-amber-500">New</Badge>
                    )}
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </button>
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
