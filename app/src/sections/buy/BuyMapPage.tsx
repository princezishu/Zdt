import { useEffect, useMemo, useState } from 'react';
import { Map, ArrowLeftRight, ChevronRight } from 'lucide-react';
import { apiRequest } from '@/lib/http';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PropertyCardsSkeleton } from '@/components/loading/PageSkeletons';
import ListingMap from '@/components/maps/ListingMap';
import { applySeo } from '@/lib/seo';

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
  onOpenCompare,
  onOpenSaved,
  onOpenList,
}: BuyMapPageProps) {
  const [properties, setProperties] = useState<MapProperty[]>([]);
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
      properties
        .filter(
          (property) =>
            property.latitude !== null &&
            property.longitude !== null &&
            Number.isFinite(Number(property.latitude)) &&
            Number.isFinite(Number(property.longitude))
        )
        .map((property) => ({
          id: String(property.id),
          latitude: Number(property.latitude),
          longitude: Number(property.longitude),
          title: property.title,
          subtitle: `${property.locality || property.area}, ${property.city}`,
          priceLabel: formatPrice(property.price),
        })),
    [properties]
  );

  const resolvedSelectedId = useMemo(() => {
    if (properties.length === 0) return null;
    if (selectedId && properties.some((property) => String(property.id) === selectedId)) {
      return selectedId;
    }
    return String(properties[0].id);
  }, [properties, selectedId]);

  useEffect(() => {
    applySeo({
      title: 'Property Map View | ZDT Realty',
      description:
        'Browse verified sale listings on an interactive map with synchronized marker and card selection.',
      canonicalPath: '/buy-map',
      type: 'website',
    });
  }, []);

  useEffect(() => {
    let active = true;

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
            <Button variant="outline" className="h-11" onClick={onOpenList}>
              Back to List
            </Button>
            <Button variant="outline" className="h-11" onClick={onOpenCompare}>
              Compare
            </Button>
            <Button variant="outline" className="h-11" onClick={onOpenSaved}>
              Saved
            </Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 text-white">
            <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs">
              <Map className="h-4 w-4" />
              Live map clustering
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
                fallbackDescription="Set VITE_GOOGLE_MAPS_API_KEY to show map markers for sale listings."
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
              <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
                {error}
              </div>
            ) : (
              <div className="space-y-3">
                {properties.map((property) => (
                  <button
                    key={property.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(String(property.id));
                      onOpenDetails(String(property.id));
                    }}
                    className={`flex min-h-11 w-full items-center gap-3 rounded-2xl border bg-white p-3 text-left shadow-sm transition hover:border-blue-300 ${
                      resolvedSelectedId === String(property.id)
                        ? 'border-blue-300 ring-1 ring-blue-200'
                        : 'border-slate-200'
                    }`}
                  >
                    <img
                      src={property.primaryImage || '/images/property-1.jpg'}
                      alt={property.title}
                      className="h-16 w-20 rounded-xl object-cover"
                      loading="lazy"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{property.title}</p>
                      <p className="truncate text-xs text-slate-500">
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
