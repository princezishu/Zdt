import { useEffect, useMemo, useState } from 'react';
import { MapPin, Map, ArrowLeftRight, ChevronRight } from 'lucide-react';
import { apiRequest } from '@/lib/http';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PropertyCardsSkeleton } from '@/components/loading/PageSkeletons';

interface BuyMapPageProps {
  onOpenDetails: (propertyId: string) => void;
  onOpenCompare: () => void;
  onOpenSaved: () => void;
  onOpenList: () => void;
}

interface MapProperty {
  id: number;
  title: string;
  city: string;
  area: string;
  locality: string;
  price: number | null;
  primaryImage: string;
  latitude: number | null;
  longitude: number | null;
  isFeatured: boolean;
}

interface MapResponse {
  properties: MapProperty[];
  total: number;
}

function formatPrice(price: number | null): string {
  if (!price || price <= 0) return 'Price on request';
  if (price >= 10000000) return `INR ${(price / 10000000).toFixed(2)} Cr`;
  if (price >= 100000) return `INR ${(price / 100000).toFixed(1)} L`;
  return `INR ${price.toLocaleString('en-IN')}`;
}

export default function BuyMapPage({
  onOpenDetails,
  onOpenCompare: _onOpenCompare,
  onOpenSaved,
  onOpenList,
}: BuyMapPageProps) {
  const [properties, setProperties] = useState<MapProperty[]>([]);
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

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    apiRequest<MapResponse>(`/api/properties?listingType=sale&${window.location.search.slice(1)}`)
      .then((response) => {
        if (!active) return;
        setProperties(response.properties || []);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load properties');
        setProperties([]);
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
            <h1 className="text-2xl font-semibold text-slate-900">Map View</h1>
            <p className="text-sm text-slate-600">{filterSummary}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-9" onClick={onOpenList}>
              Back to List
            </Button>
            <Button variant="outline" className="h-9" onClick={onOpenSaved}>
              Saved
            </Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 text-white">
            <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs">
              <Map className="h-4 w-4" />
              Live map clustering ready
            </div>
            <div className="absolute right-4 top-4 flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs">
              <ArrowLeftRight className="h-4 w-4" />
              Filters synced
            </div>
            <div className="flex h-[520px] flex-col items-center justify-center gap-3 text-center">
              <MapPin className="h-10 w-10 text-blue-300" />
              <p className="text-lg font-semibold">Google Maps integration</p>
              <p className="max-w-sm text-sm text-white/70">
                Add your Maps API key to enable clustered price markers, draw-on-map search, and travel time layers.
              </p>
              <div className="flex flex-wrap gap-2">
                {properties.slice(0, 6).map((property) => (
                  <span key={property.id} className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs">
                    {formatPrice(property.price)}
                  </span>
                ))}
              </div>
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
              <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
                {error}
              </div>
            ) : (
              <div className="space-y-3">
                {properties.map((property) => (
                  <button
                    key={property.id}
                    type="button"
                    onClick={() => onOpenDetails(String(property.id))}
                    className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-blue-300"
                  >
                    <img
                      src={property.primaryImage || '/images/property-1.jpg'}
                      alt={property.title}
                      className="h-16 w-20 rounded-xl object-cover"
                      loading="lazy"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 truncate">{property.title}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {property.locality || property.area}, {property.city}
                      </p>
                      <p className="text-sm font-semibold text-blue-900">{formatPrice(property.price)}</p>
                    </div>
                    {property.isFeatured && (
                      <Badge className="bg-amber-500 text-white hover:bg-amber-500">Hot</Badge>
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

