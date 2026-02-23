import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Bath,
  BedDouble,
  CarFront,
  Heart,
  MapPin,
  MessageCircle,
  PhoneCall,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { PortalProperty } from '@/lib/portalData';
import { toast } from 'sonner';
import {
  FAVORITES_CHANGED_EVENT,
  isFavorite,
  removeFavoriteListing,
  upsertFavoriteListing,
  type FavoriteListing,
} from '@/lib/favoritesStore';
import { addNotification } from '@/lib/notificationsStore';
import { trackPropertyInteraction } from '@/lib/propertyAnalyticsApi';

interface PropertyListingCardProps {
  property: PortalProperty;
  onOpenDetails?: (referenceId?: string) => void;
  onOpenMessages?: (referenceId?: string) => void;
}

function resolveContact(property: PortalProperty): { role: 'Owner' | 'Dealer' | 'Builder'; phone: string } {
  const role =
    property.category === 'commercial'
      ? 'Dealer'
      : property.category === 'projects' || property.category === 'new-launch'
        ? 'Builder'
        : 'Owner';

  if (role === 'Dealer') {
    return { role, phone: '+91 90000 20002' };
  }
  if (role === 'Builder') {
    return { role, phone: '+91 90000 30003' };
  }
  return { role, phone: '+91 90000 10001' };
}

function toDialNumber(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}

function formatDateLabel(value: string | null | undefined): string {
  if (!value) return 'Not updated';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not updated';
  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function PropertyListingCard({
  property,
  onOpenDetails,
  onOpenMessages,
}: PropertyListingCardProps) {
  const [saved, setSaved] = useState(() => isFavorite(property.referenceId));
  const contact = useMemo(() => resolveContact(property), [property]);
  const showConstructionProgress =
    (property.category === 'projects' || property.category === 'new-launch') &&
    typeof property.constructionCompletionPercent === 'number';
  const completionPercent = showConstructionProgress
    ? Math.max(0, Math.min(100, Math.round(property.constructionCompletionPercent || 0)))
    : 0;
  const constructionStatus = property.constructionStatus || property.status;

  const tags = useMemo(() => {
    const next: string[] = [];
    if (property.featured) next.push('Featured');
    if (property.isNew) next.push('New');
    if (property.verified) next.push('Verified');
    return next;
  }, [property.featured, property.isNew, property.verified]);

  useEffect(() => {
    const sync = () => {
      setSaved(isFavorite(property.referenceId));
    };

    const handleStorage = (event: StorageEvent) => {
      if (!event.key) {
        sync();
        return;
      }
      if (event.key !== 'zdt_favorite_listings') {
        return;
      }
      sync();
    };

    sync();
    window.addEventListener('storage', handleStorage);
    window.addEventListener(FAVORITES_CHANGED_EVENT, sync);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(FAVORITES_CHANGED_EVENT, sync);
    };
  }, [property.referenceId]);

  const portalFavoriteSnapshot: FavoriteListing = {
    id: property.id,
    referenceId: property.referenceId,
    title: property.title,
    image: property.image,
    city: property.city,
    area: property.location,
    priceLabel: property.priceLabel,
    areaLabel: property.areaLabel,
    propertyType: property.category,
    bhk: property.bhk,
    mainDoorFacing: property.facing,
    vastuScore: property.readyToMove ? 84 : 79,
    verified: property.verified,
    ownerPhone: 'Hidden',
    isFeatured: property.featured,
    updatedAt: '',
  };

  return (
    <article className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
      <div className="relative">
        <img
          src={property.image}
          alt={property.title}
          className="h-44 w-full object-cover"
          loading="lazy"
        />
        <div className="absolute right-3 top-3 flex flex-col gap-2">
          <button
            type="button"
            aria-label={saved ? 'Remove from favorites' : 'Save to favorites'}
            title={saved ? 'Saved' : 'Save'}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-full border shadow-sm transition ${
              saved
                ? 'border-rose-200 bg-rose-50 text-rose-600'
                : 'border-white/70 bg-white/90 text-slate-600 hover:text-rose-500'
            }`}
            onClick={() => {
              if (saved) {
                removeFavoriteListing(property.referenceId);
                void trackPropertyInteraction({
                  referenceId: property.referenceId,
                  action: 'unsave',
                  context: 'portal_listing_card',
                });
                toast.success('Removed from favorites');
                addNotification({
                  title: 'Removed from favorites',
                  message: property.title,
                  kind: 'info',
                  source: 'favorites',
                  metadata: { referenceId: property.referenceId },
                });
              } else {
                upsertFavoriteListing(portalFavoriteSnapshot);
                void trackPropertyInteraction({
                  referenceId: property.referenceId,
                  action: 'save',
                  context: 'portal_listing_card',
                });
                toast.success('Added to favorites');
                addNotification({
                  title: 'Added to favorites',
                  message: property.title,
                  kind: 'success',
                  source: 'favorites',
                  metadata: { referenceId: property.referenceId },
                });
              }
              setSaved((prev) => !prev);
            }}
          >
            <Heart className={`h-4 w-4 ${saved ? 'fill-current' : ''}`} />
          </button>
        </div>
        {property.verified && (
          <Badge className="absolute left-3 top-3 bg-emerald-600 text-white hover:bg-emerald-600">
            <BadgeCheck className="mr-1 h-3.5 w-3.5" />
            Verified
          </Badge>
        )}
      </div>

      <div className="space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
            >
              {tag}
            </span>
          ))}
        </div>

        <div>
          <h3 className="text-base font-semibold text-slate-900">{property.title}</h3>
          <p className="mt-1 inline-flex items-center gap-1 text-sm text-slate-600">
            <MapPin className="h-3.5 w-3.5" />
            {property.location}, {property.city}
          </p>
        </div>

        <div className="flex items-end justify-between">
          <p className="text-lg font-bold text-blue-900">{property.priceLabel}</p>
          <p className="text-xs text-slate-500">{property.areaLabel}</p>
        </div>

        {showConstructionProgress ? (
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-800">
                {constructionStatus}
              </p>
              <p className="text-xs font-semibold text-blue-900">{completionPercent}% Completed</p>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-blue-100">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-300"
                style={{ width: `${completionPercent}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-blue-900/80">
              Last updated: {formatDateLabel(property.constructionLastUpdatedAt)}
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
          <span className="inline-flex items-center gap-1">
            <BedDouble className="h-3.5 w-3.5 text-slate-500" />
            {property.bhk}
          </span>
          <span className="inline-flex items-center gap-1">
            <Bath className="h-3.5 w-3.5 text-slate-500" />
            {property.bath}
          </span>
          <span className="inline-flex items-center gap-1">
            <CarFront className="h-3.5 w-3.5 text-slate-500" />
            {property.parking}
          </span>
        </div>

        <p className="text-xs text-slate-600">
          Contact {contact.role}: <span className="font-semibold text-slate-900">{contact.phone}</span>
        </p>

        <div className="grid grid-cols-3 gap-2 pt-1">
          <Button
            type="button"
            className="h-10 rounded-xl bg-blue-700 text-white hover:bg-blue-800"
            onClick={() => onOpenDetails?.(property.referenceId)}
          >
            View Details
          </Button>
          <Button asChild type="button" variant="outline" className="h-10 rounded-xl border-slate-300">
            <a href={`tel:${toDialNumber(contact.phone)}`}>
              <PhoneCall className="mr-1 h-3.5 w-3.5" />
              Call
            </a>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-xl border-slate-300"
            onClick={() => onOpenMessages?.(property.referenceId)}
          >
            <MessageCircle className="mr-1 h-3.5 w-3.5" />
            Message
          </Button>
        </div>
      </div>
    </article>
  );
}
