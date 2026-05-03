import {
  ArrowUpRight,
  Bath,
  BedDouble,
  CarFront,
  Heart,
  MapPin,
  MessageCircle,
  ShieldCheck,
} from 'lucide-react';

import Button from '@/components/marketing/Button';
import type { PortalProperty } from '@/lib/portalData';

interface PropertyCardProps {
  property: PortalProperty;
  onViewDetails: (referenceId: string) => void;
  onMessage: (referenceId: string) => void;
}

export default function PropertyCard({ property, onViewDetails, onMessage }: PropertyCardProps) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_18px_40px_-32px_rgba(15,23,42,0.38)] transition duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_24px_52px_-34px_rgba(15,23,42,0.45)]">
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        <img
          src={property.image}
          alt={property.title}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          {property.verified ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1 text-xs font-medium text-white shadow-sm">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Verified
            </span>
          ) : null}
          {property.isNew ? (
            <span className="rounded-lg bg-amber-400 px-2.5 py-1 text-xs font-medium text-slate-950 shadow-sm">
              New
            </span>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Save property"
          className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/70 bg-white/92 text-slate-700 shadow-sm transition duration-300 hover:bg-white hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/35 focus-visible:ring-offset-2"
        >
          <Heart className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-blue-700">{property.status}</p>
            <h3 className="mt-1 line-clamp-2 text-lg font-semibold leading-6 text-slate-950">
              {property.title}
            </h3>
          </div>
          <p className="shrink-0 text-right text-lg font-semibold text-slate-950">{property.priceLabel}</p>
        </div>

        <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-600">
          <MapPin className="h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
          <span className="truncate">
            {property.location}, {property.city}
          </span>
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs font-medium text-slate-700">
          <span className="flex min-w-0 items-center gap-1.5">
            <BedDouble className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
            <span className="truncate">{property.bhk}</span>
          </span>
          <span className="flex min-w-0 items-center gap-1.5">
            <Bath className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
            <span className="truncate">{property.bath}</span>
          </span>
          <span className="flex min-w-0 items-center gap-1.5">
            <CarFront className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
            <span className="truncate">{property.parking}</span>
          </span>
        </div>

        <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">{property.description}</p>

        <div className="mt-auto grid gap-2 pt-5 sm:grid-cols-2">
          <Button
            variant="primary"
            onClick={() => onViewDetails(property.referenceId)}
            rightIcon={<ArrowUpRight className="h-4 w-4" aria-hidden="true" />}
          >
            View Details
          </Button>
          <Button
            variant="outline"
            onClick={() => onMessage(property.referenceId)}
            leftIcon={<MessageCircle className="h-4 w-4" aria-hidden="true" />}
          >
            Message
          </Button>
        </div>
      </div>
    </article>
  );
}
