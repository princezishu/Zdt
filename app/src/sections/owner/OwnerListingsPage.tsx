import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Bolt, Edit3, Eye, PlusCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/http';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { OwnerLockedFeatureCard } from './OwnerAccessStates';
import {
  isOwnerSubscriptionAccessError,
  useOwnerSubscriptionAccess,
} from './OwnerSubscriptionAccess';

interface OwnerListingsPageProps {
  onOpenAddProperty: () => void;
  onOpenEdit: (propertyId: string) => void;
  onOpenDashboard: () => void;
  onOpenSubscription: () => void;
}

interface PropertyListing {
  id: number;
  title: string;
  city: string;
  locality: string;
  price: number | null;
  bedrooms: number | null;
  areaSqft: number | null;
  isVerified: boolean;
  isFeatured: boolean;
  viewCount: number;
  imageUrls: string[];
}

interface OwnerListingsResponse {
  properties: PropertyListing[];
  total: number;
}

interface BoostResponse {
  boostId: number;
  remainingBoostCredits?: number;
}

function formatCurrency(value: number | null): string {
  if (!value || value <= 0) return 'On request';
  return `INR ${Math.round(value).toLocaleString('en-IN')}`;
}

export default function OwnerListingsPage({
  onOpenAddProperty,
  onOpenEdit,
  onOpenDashboard,
  onOpenSubscription,
}: OwnerListingsPageProps) {
  const { access, currentSubscription, loading: accessLoading, refreshAccess } = useOwnerSubscriptionAccess();
  const [properties, setProperties] = useState<PropertyListing[]>([]);
  const [loading, setLoading] = useState(true);

  const loadListings = () => {
    setLoading(true);
    apiRequest<OwnerListingsResponse>('/api/owner/properties')
      .then((response) => setProperties(response.properties || []))
      .catch(() => setProperties([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadListings();
  }, []);

  const handleDelete = async (propertyId: number) => {
    try {
      await apiRequest(`/api/owner/properties/${propertyId}`, { method: 'DELETE' });
      await refreshAccess();
      toast.success('Listing removed');
      loadListings();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to delete listing');
    }
  };

  const handleBoost = async (propertyId: number) => {
    try {
      const response = await apiRequest<BoostResponse>(`/api/owner/boost/${propertyId}`, {
        method: 'POST',
        body: JSON.stringify({
          boostType: 'Top Search Result',
          amountPaid: 2500,
          listingType: 'property',
        }),
      });
      await refreshAccess();
      const creditsLabel =
        typeof response.remainingBoostCredits === 'number'
          ? ` ${response.remainingBoostCredits} boost credits left.`
          : '';
      toast.success(`Boost activated.${creditsLabel}`);
      loadListings();
    } catch (error) {
      if (isOwnerSubscriptionAccessError(error)) {
        await refreshAccess();
      }
      toast.error(error instanceof Error ? error.message : 'Unable to boost listing');
    }
  };

  const canCreate = Boolean(access?.listingQuota.canCreate);
  const canBoost = Boolean(access?.boosts.enabled) && Number(access?.boosts.remainingCredits || 0) > 0;
  const listingSummary = useMemo(() => {
    return properties.reduce(
      (summary, property) => {
        summary.totalViews += Number(property.viewCount || 0);
        if (property.isVerified) summary.verified += 1;
        if (property.isFeatured) summary.featured += 1;
        return summary;
      },
      { totalViews: 0, verified: 0, featured: 0 }
    );
  }, [properties]);

  return (
    <section className="portal-mobile-page min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container portal-mobile-stack space-y-6">
        <div className="portal-mobile-panel flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Owner Listings</p>
            <h1 className="mt-3 text-2xl font-semibold text-slate-900 sm:text-3xl">Sale inventory</h1>
            <p className="mt-2 text-sm text-slate-600">Monitor your active sale listings and promotions.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {access ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700">
                Slots left: <span className="font-semibold">{access.listingQuota.remaining}</span>
                <span className="mx-2 text-blue-300">|</span>
                Boost credits: <span className="font-semibold">{access.boosts.remainingCredits}</span>
              </div>
            ) : null}
            <Button variant="outline" onClick={onOpenDashboard}>
              Back to Dashboard
            </Button>
            <Button
              className="bg-blue-700 text-white hover:bg-blue-800"
              onClick={onOpenAddProperty}
              disabled={accessLoading || !canCreate}
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Property
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ListingSummaryCard title="Live Listings" value={properties.length} hint="Sale inventory currently active" />
          <ListingSummaryCard title="Verified" value={listingSummary.verified} hint="Trust-ready listings" />
          <ListingSummaryCard title="Featured" value={listingSummary.featured} hint="Priority visibility inventory" />
          <ListingSummaryCard title="Portfolio Views" value={listingSummary.totalViews} hint="Total visibility across sale listings" />
        </div>

        {access && !canCreate ? (
          <OwnerLockedFeatureCard
            title="Listing quota reached"
            description="Existing properties stay editable, but new listings need more capacity."
            message={access.listingQuota.message}
            onOpenSubscription={onOpenSubscription}
          />
        ) : null}

        {access && !access.boosts.enabled ? (
          <OwnerLockedFeatureCard
            title="Boosts are locked for this plan"
            description="Promote listings with plan-based boost credits once boosts are enabled."
            message={access.boosts.message}
            onOpenSubscription={onOpenSubscription}
            compact
          />
        ) : null}

        {loading ? (
          <div className="portal-mobile-card rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
            Loading listings...
          </div>
        ) : properties.length === 0 ? (
          <div className="portal-mobile-card rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            No sale listings available. Add a new property to get started with the{' '}
            {currentSubscription?.planName || 'current'} plan.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {properties.map((property) => (
              <article
                key={property.id}
                className="portal-mobile-card overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="relative">
                  <img
                    src={property.imageUrls?.[0] || '/images/property-1.jpg'}
                    alt={property.title}
                    className="h-40 w-full object-cover"
                  />
                  <div className="absolute left-3 top-3 flex gap-2">
                    {property.isVerified && (
                      <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                        <BadgeCheck className="mr-1 h-3.5 w-3.5" />
                        Verified
                      </Badge>
                    )}
                    {property.isFeatured && (
                      <Badge className="bg-amber-500 text-white hover:bg-amber-500">Featured</Badge>
                    )}
                  </div>
                </div>
                <div className="space-y-3 p-4">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">{property.title}</h2>
                    <p className="text-xs text-slate-500">{property.locality || property.city}</p>
                  </div>
                  <div className="portal-mobile-card rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {formatCurrency(property.price)}
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>{property.bedrooms ? `${property.bedrooms} BHK` : 'Studio'}</span>
                    <span>{property.areaSqft ? `${property.areaSqft} sq.ft` : 'Area on request'}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5" />
                      {property.viewCount} views
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                      {property.isFeatured ? 'Priority live' : 'Standard rank'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {property.isVerified ? 'Verification ready' : 'Verification pending'}
                    </span>
                    <Button
                      variant="ghost"
                      className="h-8 text-xs"
                      onClick={() => handleBoost(property.id)}
                      disabled={!canBoost}
                    >
                      <Bolt className="mr-1 h-3.5 w-3.5" />
                      {access?.boosts.enabled ? 'Boost' : 'Locked'}
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="h-9 flex-1 bg-blue-700 text-xs text-white hover:bg-blue-800"
                      onClick={() => onOpenEdit(String(property.id))}
                    >
                      <Edit3 className="mr-1 h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      className="h-9 flex-1 text-xs text-rose-700 hover:bg-rose-50 hover:text-rose-700"
                      onClick={() => handleDelete(property.id)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ListingSummaryCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="portal-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value.toLocaleString('en-IN')}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}
