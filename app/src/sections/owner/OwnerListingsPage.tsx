import { useEffect, useState } from 'react';
import { BadgeCheck, Bolt, Edit3, Eye, PlusCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/http';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface OwnerListingsPageProps {
  onOpenAddProperty: () => void;
  onOpenEdit: (propertyId: string) => void;
  onOpenDashboard: () => void;
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

function formatCurrency(value: number | null): string {
  if (!value || value <= 0) return 'On request';
  return `INR ${Math.round(value).toLocaleString('en-IN')}`;
}

export default function OwnerListingsPage({
  onOpenAddProperty,
  onOpenEdit,
  onOpenDashboard,
}: OwnerListingsPageProps) {
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
      toast.success('Listing removed');
      loadListings();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to delete listing');
    }
  };

  const handleBoost = async (propertyId: number) => {
    try {
      await apiRequest(`/api/owner/boost/${propertyId}`, {
        method: 'POST',
        body: JSON.stringify({
          boostType: 'Top Search Result',
          amountPaid: 2500,
          listingType: 'property',
        }),
      });
      toast.success('Boost activated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to boost listing');
    }
  };

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Owner Listings</p>
            <h1 className="mt-3 text-2xl font-semibold text-slate-900 sm:text-3xl">Sale inventory</h1>
            <p className="mt-2 text-sm text-slate-600">Monitor your active sale listings and promotions.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={onOpenDashboard}>
              Back to Dashboard
            </Button>
            <Button className="bg-blue-700 text-white hover:bg-blue-800" onClick={onOpenAddProperty}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Property
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
            Loading listings...
          </div>
        ) : properties.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            No sale listings available. Add a new property to get started.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {properties.map((property) => (
              <article key={property.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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
                    <p className="text-xs text-slate-500">
                      {property.locality || property.city}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
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
                    <Button variant="ghost" className="h-8 text-xs" onClick={() => handleBoost(property.id)}>
                      <Bolt className="mr-1 h-3.5 w-3.5" />
                      Boost
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button className="h-9 flex-1 bg-blue-700 text-xs text-white hover:bg-blue-800" onClick={() => onOpenEdit(String(property.id))}>
                      <Edit3 className="mr-1 h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button variant="outline" className="h-9 flex-1 text-xs text-rose-700 hover:bg-rose-50 hover:text-rose-700" onClick={() => handleDelete(property.id)}>
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
