import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Heart, MapPin, MessageCircle, Search, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  FAVORITES_CHANGED_EVENT,
  readFavoriteListings,
  removeFavoriteListing,
  type FavoriteListing,
} from '@/lib/favoritesStore';
import { trackPropertyInteraction } from '@/lib/propertyAnalyticsApi';

interface FavoritesPageProps {
  onOpenBuy: () => void;
  onViewDetails?: (referenceId?: string) => void;
  onOpenMessages?: (propertyReference?: string) => void;
}

export default function FavoritesPage({
  onOpenBuy,
  onViewDetails,
  onOpenMessages,
}: FavoritesPageProps) {
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState<FavoriteListing[]>(() => readFavoriteListings());

  const syncFavorites = useCallback(() => {
    setFavorites(readFavoriteListings());
  }, []);

  useEffect(() => {
    syncFavorites();

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== 'zdt_favorite_listings') {
        return;
      }
      syncFavorites();
    };

    const handleFavoritesChanged = () => {
      syncFavorites();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      syncFavorites();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(FAVORITES_CHANGED_EVENT, handleFavoritesChanged);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(FAVORITES_CHANGED_EVENT, handleFavoritesChanged);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [syncFavorites]);

  const filteredFavorites = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) {
      return favorites;
    }
    return favorites.filter((item) =>
      `${item.title} ${item.city} ${item.area} ${item.propertyType}`
        .toLowerCase()
        .includes(text)
    );
  }, [favorites, query]);

  const removeItem = (referenceId: string) => {
    const next = removeFavoriteListing(referenceId);
    void trackPropertyInteraction({
      referenceId,
      action: 'unsave',
      context: 'favorites_page',
    });
    setFavorites(next);
  };

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container zdt-page-stack">
        <div className="zdt-panel-hero rounded-3xl border p-6 shadow-xl">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">My Favorites</p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Your Saved Listings</h1>
          <p className="mt-2 text-sm text-slate-600">
            Keep your shortlisted properties in one place and open chat with owners quickly.
          </p>
        </div>

        <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative min-w-[250px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search favorites by location, title, type..."
                className="h-11 pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                Saved: {favorites.length}
              </span>
              <Button variant="outline" onClick={onOpenBuy}>
                Explore More
              </Button>
            </div>
          </div>

          {favorites.length === 0 && (
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
              No favorites saved yet. Go to Buy page and tap <span className="font-semibold">Save</span> on listings.
            </div>
          )}

          {favorites.length > 0 && filteredFavorites.length === 0 && (
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
              No favorites match your current search.
            </div>
          )}

          {filteredFavorites.length > 0 && (
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {filteredFavorites.map((listing) => (
                <article
                  key={listing.referenceId}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                >
                  <div className="relative">
                    <img
                      src={listing.image || '/images/property-1.jpg'}
                      alt={listing.title}
                      className="h-40 w-full object-cover"
                      loading="lazy"
                      onError={(event) => {
                        const fallback = '/images/property-1.jpg';
                        if (event.currentTarget.src.endsWith(fallback)) {
                          return;
                        }
                        event.currentTarget.src = fallback;
                      }}
                    />
                    {listing.verified && (
                      <Badge className="absolute left-3 top-3 bg-emerald-600 text-white hover:bg-emerald-600">
                        <BadgeCheck className="mr-1 h-3.5 w-3.5" />
                        Verified
                      </Badge>
                    )}
                    <Badge className="absolute right-3 top-3 bg-blue-700 text-white hover:bg-blue-700">
                      Vastu {listing.vastuScore}%
                    </Badge>
                  </div>
                  <div className="space-y-2 p-4">
                    <p className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
                      <Heart className="h-3.5 w-3.5 fill-red-500 text-red-500" />
                      {listing.referenceId}
                    </p>
                    <h2 className="text-sm font-semibold text-slate-900">{listing.title}</h2>
                    <p className="text-sm font-semibold text-blue-800">{listing.priceLabel}</p>
                    <p className="text-xs text-slate-600">{listing.areaLabel}</p>
                    <p className="inline-flex items-center gap-1 text-xs text-slate-600">
                      <MapPin className="h-3.5 w-3.5" />
                      {listing.city}, {listing.area}
                    </p>
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <Button
                        type="button"
                        className="h-9 bg-blue-700 text-xs text-white hover:bg-blue-800"
                        onClick={() => onViewDetails?.(listing.referenceId)}
                      >
                        View
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 text-xs"
                        onClick={() => onOpenMessages?.(listing.referenceId)}
                      >
                        <MessageCircle className="mr-1 h-3.5 w-3.5" />
                        Chat
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="col-span-2 h-9 text-xs text-red-700 hover:bg-red-50 hover:text-red-700"
                        onClick={() => removeItem(listing.referenceId)}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Remove Favorite
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
