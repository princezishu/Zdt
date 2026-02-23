import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  CalendarDays,
  Heart,
  MapPin,
  MessageCircle,
  PhoneCall,
  ShieldCheck,
  Sofa,
  Sparkles,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/http';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { PropertyCardsSkeleton } from '@/components/loading/PageSkeletons';
import { LgdLocationAccuracyNote, LgdLocationInput } from '@/components/realty/LgdLocationInput';
import {
  SAVED_RENTALS_CHANGED_EVENT,
  isSavedRental,
  removeSavedRental,
  upsertSavedRental,
} from '@/lib/rentalsSavedStore';
import { readIndiaLocationSelection } from '@/lib/indiaLocationSelection';

interface RentMarketplacePageProps {
  onOpenDetails: (propertyId: string) => void;
  onOpenSaved: () => void;
  onOpenMap: () => void;
  onOpenShortTerm: () => void;
  onOpenCoLiving: () => void;
  onOpenMessages: (propertyReference?: string) => void;
}

interface RentalListing {
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
  amenities: string[];
  isVerified: boolean;
  isFeatured: boolean;
  viewCount: number;
  primaryImage: string;
}

interface RentalsResponse {
  rentals: RentalListing[];
  total: number;
  page: number;
  pageSize: number;
}

type SortKey = 'recommended' | 'rent_low' | 'rent_high' | 'newest' | 'verified';

type FiltersState = {
  city: string;
  locality: string;
  minRent: number;
  maxRent: number;
  minDeposit: number;
  maxDeposit: number;
  bhk: string;
  type: string;
  furnished: string;
  tenants: string;
  availability: string;
  maintenanceIncluded: boolean;
  amenities: string[];
  sort: SortKey;
};

const defaultFilters: FiltersState = {
  city: '',
  locality: '',
  minRent: 5000,
  maxRent: 150000,
  minDeposit: 0,
  maxDeposit: 400000,
  bhk: 'Any',
  type: 'Any',
  furnished: 'Any',
  tenants: 'Any',
  availability: 'Any',
  maintenanceIncluded: false,
  amenities: [],
  sort: 'recommended',
};

function createInitialFilters(): FiltersState {
  const locationDefaults = typeof window !== 'undefined' ? readIndiaLocationSelection() : null;
  return {
    ...defaultFilters,
    city: locationDefaults?.place || '',
    locality: locationDefaults?.subdistrict || '',
  };
}

const amenityOptions = [
  { key: 'lift', label: 'Lift' },
  { key: 'parking', label: 'Parking' },
  { key: 'power-backup', label: 'Power Backup' },
  { key: 'swimming-pool', label: 'Swimming Pool' },
  { key: 'gym', label: 'Gym' },
  { key: 'wifi', label: 'WiFi' },
  { key: 'ac', label: 'AC' },
  { key: 'modular-kitchen', label: 'Modular Kitchen' },
  { key: 'geyser', label: 'Geyser' },
  { key: 'cctv', label: 'CCTV' },
  { key: 'balcony', label: 'Balcony' },
  { key: 'near-metro', label: 'Near Metro' },
  { key: 'near-office-hubs', label: 'Near Office Hubs' },
  { key: 'near-college', label: 'Near College' },
];

const bhkOptions = ['Any', 'Studio', '1', '2', '3', '4', 'Shared Room'];
const typeOptions = ['Any', 'Apartment', 'Villa', 'Independent House', 'Studio', 'Duplex', 'Shared Room'];
const furnishedOptions = ['Any', 'unfurnished', 'semi', 'full'];
const tenantOptions = ['Any', 'family', 'bachelor', 'company', 'students'];
const availabilityOptions = ['Any', 'immediate', '15', '30'];

function formatCurrency(value: number | null, suffix = ''): string {
  if (!value || value <= 0) return 'On request';
  return `INR ${Math.round(value).toLocaleString('en-IN')}${suffix}`;
}

function toDialNumber(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}

export default function RentMarketplacePage({
  onOpenDetails,
  onOpenSaved,
  onOpenMap,
  onOpenShortTerm,
  onOpenCoLiving,
  onOpenMessages,
}: RentMarketplacePageProps) {
  const [filters, setFilters] = useState<FiltersState>(() => createInitialFilters());
  const [applied, setApplied] = useState<FiltersState>(() => createInitialFilters());
  const [rentals, setRentals] = useState<RentalListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [total, setTotal] = useState(0);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    const params = new URLSearchParams();
    if (applied.city) params.set('city', applied.city);
    if (applied.locality) params.set('locality', applied.locality);
    if (applied.bhk !== 'Any') params.set('bhk', applied.bhk);
    if (applied.type !== 'Any') params.set('type', applied.type);
    if (applied.furnished !== 'Any') params.set('furnished', applied.furnished);
    if (applied.tenants !== 'Any') params.set('tenants', applied.tenants);
    if (applied.availability !== 'Any') params.set('availability', applied.availability);
    if (applied.maintenanceIncluded) params.set('maintenanceIncluded', 'true');
    if (applied.amenities.length > 0) params.set('amenities', applied.amenities.join(','));
    params.set('minRent', String(applied.minRent));
    params.set('maxRent', String(applied.maxRent));
    params.set('minDeposit', String(applied.minDeposit));
    params.set('maxDeposit', String(applied.maxDeposit));
    params.set('sort', applied.sort);
    params.set('page', String(page));
    params.set('limit', String(pageSize));

    apiRequest<RentalsResponse>(`/api/rentals?${params.toString()}`)
      .then((response) => {
        if (!active) return;
        setRentals(response.rentals || []);
        setTotal(Number(response.total || 0));
        setPageSize(Number(response.pageSize || pageSize));
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load rentals');
        setRentals([]);
        setTotal(0);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [applied, page, pageSize]);

  const summary = useMemo(() => `${total.toLocaleString('en-IN')} rentals available`, [total]);

  const toggleAmenity = (key: string) => {
    setFilters((prev) => {
      const next = prev.amenities.includes(key)
        ? prev.amenities.filter((item) => item !== key)
        : [...prev.amenities, key];
      return { ...prev, amenities: next };
    });
  };

  return (
    <section className="pb-20 pt-28 text-slate-900">
      <div className="page-container space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-[#0b1220] via-[#111827] to-[#24364b] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-blue-200">ZDT RENTAL HUB</p>
              <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">Premium rentals with flexible tenure.</h1>
              <p className="mt-2 max-w-2xl text-sm text-blue-100">
                Long-term, short-term, and co-living inventory. Verified owners, transparent pricing, and instant apply.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button className="h-10 rounded-full bg-white/10 text-white hover:bg-white/20" onClick={onOpenSaved}>
                <Heart className="mr-2 h-4 w-4" />
                Saved Rentals
              </Button>
              <Button className="h-10 rounded-full bg-white/10 text-white hover:bg-white/20" onClick={onOpenShortTerm}>
                <CalendarDays className="mr-2 h-4 w-4" />
                Short-Term
              </Button>
              <Button className="h-10 rounded-full bg-white/10 text-white hover:bg-white/20" onClick={onOpenCoLiving}>
                <Users className="mr-2 h-4 w-4" />
                Co-Living
              </Button>
              <Button className="h-10 rounded-full bg-blue-500 text-white hover:bg-blue-400" onClick={onOpenMap}>
                <MapPin className="mr-2 h-4 w-4" />
                Map View
              </Button>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-blue-100/80">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1">
              <BadgeCheck className="h-3.5 w-3.5" />
              KYC verified owners
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1">
              <Sparkles className="h-3.5 w-3.5" />
              AI affordability ready
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              Trusted agreements
            </span>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Filters</h2>
                <Button variant="ghost" className="h-8 text-xs" onClick={() => setFilters(defaultFilters)}>
                  Reset
                </Button>
              </div>

              <div className="mt-4 space-y-4 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Location</p>
                  <div className="mt-2 grid gap-2">
                    <LgdLocationInput
                      value={filters.city}
                      onChange={(value) => setFilters((prev) => ({ ...prev, city: value }))}
                      placeholder="City"
                      suggestKind="india"
                      indiaValueField="village"
                    />
                    <LgdLocationInput
                      value={filters.locality}
                      onChange={(value) => setFilters((prev) => ({ ...prev, locality: value }))}
                      placeholder="Locality"
                      suggestKind="india"
                      indiaValueField="subdistrict"
                    />
                    <LgdLocationAccuracyNote />
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Monthly Rent</p>
                  <div className="mt-2 grid gap-3">
                    <Slider
                      value={[filters.minRent, filters.maxRent]}
                      onValueChange={([min, max]) => setFilters((prev) => ({ ...prev, minRent: min, maxRent: max }))}
                      min={3000}
                      max={200000}
                      step={500}
                    />
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{formatCurrency(filters.minRent)}</span>
                      <span>{formatCurrency(filters.maxRent)}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Deposit Range</p>
                  <div className="mt-2 grid gap-3">
                    <Slider
                      value={[filters.minDeposit, filters.maxDeposit]}
                      onValueChange={([min, max]) => setFilters((prev) => ({ ...prev, minDeposit: min, maxDeposit: max }))}
                      min={0}
                      max={800000}
                      step={1000}
                    />
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{formatCurrency(filters.minDeposit)}</span>
                      <span>{formatCurrency(filters.maxDeposit)}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Configuration</p>
                  <div className="mt-2 grid gap-2">
                    <Select value={filters.bhk} onValueChange={(value) => setFilters((prev) => ({ ...prev, bhk: value }))}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="BHK" /></SelectTrigger>
                      <SelectContent>
                        {bhkOptions.map((item) => (
                          <SelectItem key={item} value={item}>{item}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={filters.type} onValueChange={(value) => setFilters((prev) => ({ ...prev, type: value }))}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Type" /></SelectTrigger>
                      <SelectContent>
                        {typeOptions.map((item) => (
                          <SelectItem key={item} value={item}>{item}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Furnishing</p>
                  <Select value={filters.furnished} onValueChange={(value) => setFilters((prev) => ({ ...prev, furnished: value }))}>
                    <SelectTrigger className="mt-2 h-9"><SelectValue placeholder="Furnished" /></SelectTrigger>
                    <SelectContent>
                      {furnishedOptions.map((item) => (
                        <SelectItem key={item} value={item}>{item}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tenant Preference</p>
                  <Select value={filters.tenants} onValueChange={(value) => setFilters((prev) => ({ ...prev, tenants: value }))}>
                    <SelectTrigger className="mt-2 h-9"><SelectValue placeholder="Tenants" /></SelectTrigger>
                    <SelectContent>
                      {tenantOptions.map((item) => (
                        <SelectItem key={item} value={item}>{item}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Availability</p>
                  <Select value={filters.availability} onValueChange={(value) => setFilters((prev) => ({ ...prev, availability: value }))}>
                    <SelectTrigger className="mt-2 h-9"><SelectValue placeholder="Availability" /></SelectTrigger>
                    <SelectContent>
                      {availabilityOptions.map((item) => (
                        <SelectItem key={item} value={item}>{item}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-xs">
                  Maintenance included
                  <Checkbox
                    checked={filters.maintenanceIncluded}
                    onCheckedChange={(value) => setFilters((prev) => ({ ...prev, maintenanceIncluded: Boolean(value) }))}
                  />
                </label>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Amenities</p>
                  <div className="mt-2 grid gap-2">
                    {amenityOptions.map((amenity) => (
                      <label key={amenity.key} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-xs">
                        <span className="inline-flex items-center gap-2 text-slate-700">{amenity.label}</span>
                        <Checkbox checked={filters.amenities.includes(amenity.key)} onCheckedChange={() => toggleAmenity(amenity.key)} />
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sort By</p>
                  <Select value={filters.sort} onValueChange={(value: SortKey) => setFilters((prev) => ({ ...prev, sort: value }))}>
                    <SelectTrigger className="mt-2 h-9"><SelectValue placeholder="Sort by" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recommended">Recommended</SelectItem>
                      <SelectItem value="rent_low">Rent low to high</SelectItem>
                      <SelectItem value="rent_high">Rent high to low</SelectItem>
                      <SelectItem value="newest">Newest</SelectItem>
                      <SelectItem value="verified">Verified only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button className="mt-2 h-10 w-full rounded-xl bg-blue-700 text-white hover:bg-blue-800" onClick={() => { setApplied(filters); setPage(1); }}>
                  Apply Filters
                </Button>
              </div>
            </div>
          </aside>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Rental Listings</h2>
                <p className="text-sm text-slate-600">{summary}</p>
              </div>
              <Button variant="outline" className="h-9" onClick={onOpenMap}>Map View</Button>
            </div>

            {loading ? (
              <PropertyCardsSkeleton />
            ) : error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</div>
            ) : rentals.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
                No rentals match the selected filters.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {rentals.map((rental) => (
                  <RentalCard
                    key={rental.id}
                    rental={rental}
                    onOpenDetails={onOpenDetails}
                    onOpenMessages={onOpenMessages}
                  />
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <Pagination className="pt-4">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        setPage((prev) => Math.max(1, prev - 1));
                      }}
                    />
                  </PaginationItem>
                  {Array.from({ length: Math.min(5, totalPages) }).map((_, index) => {
                    const pageNumber = index + 1;
                    return (
                      <PaginationItem key={`page-${pageNumber}`}>
                        <PaginationLink
                          href="#"
                          isActive={page === pageNumber}
                          onClick={(event) => {
                            event.preventDefault();
                            setPage(pageNumber);
                          }}
                        >
                          {pageNumber}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        setPage((prev) => Math.min(totalPages, prev + 1));
                      }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function RentalCard({
  rental,
  onOpenDetails,
  onOpenMessages,
}: {
  rental: RentalListing;
  onOpenDetails: (propertyId: string) => void;
  onOpenMessages: (propertyReference?: string) => void;
}) {
  const referenceId = String(rental.id);
  const [saved, setSaved] = useState(() => isSavedRental(referenceId));
  const contactPhone = '+91 90000 10001';

  useEffect(() => {
    const sync = () => setSaved(isSavedRental(referenceId));
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === 'zdt_saved_rentals') sync();
    };

    sync();
    window.addEventListener('storage', handleStorage);
    window.addEventListener(SAVED_RENTALS_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(SAVED_RENTALS_CHANGED_EVENT, sync);
    };
  }, [referenceId]);

  const handleSave = () => {
    if (saved) {
      removeSavedRental(referenceId);
      toast.success('Removed from saved rentals');
      setSaved(false);
      return;
    }

    upsertSavedRental({
      id: referenceId,
      title: rental.title,
      image: rental.primaryImage || '/images/property-1.jpg',
      city: rental.city,
      locality: rental.locality,
      monthlyRentLabel: formatCurrency(rental.monthlyRent, '/mo'),
      bhk: rental.bhk ? `${rental.bhk} BHK` : 'Studio',
      furnishedStatus: rental.furnishedStatus,
      availableFrom: rental.availableFrom || '',
    });
    toast.success('Saved rental');
    setSaved(true);
  };

  const amenityIcons = rental.amenities.slice(0, 3);
  const availableLabel = rental.availableFrom ? new Date(rental.availableFrom).toLocaleDateString('en-IN') : 'Immediate';

  return (
    <article className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
      <div className="relative">
        <img src={rental.primaryImage || '/images/property-1.jpg'} alt={rental.title} className="h-44 w-full object-cover" loading="lazy" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          {rental.isVerified && (
            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
              <BadgeCheck className="mr-1 h-3.5 w-3.5" />
              Verified
            </Badge>
          )}
          {rental.isFeatured && (
            <Badge className="bg-amber-500 text-white hover:bg-amber-500">New</Badge>
          )}
        </div>
        <button
          type="button"
          className={`absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border shadow-sm transition ${
            saved
              ? 'border-rose-200 bg-rose-50 text-rose-600'
              : 'border-white/70 bg-white/90 text-slate-600 hover:text-rose-500'
          }`}
          onClick={handleSave}
        >
          <Heart className={`h-4 w-4 ${saved ? 'fill-current' : ''}`} />
        </button>
      </div>

      <div className="space-y-3 p-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{rental.title}</h3>
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500">
            <MapPin className="h-3.5 w-3.5" />
            {rental.locality || rental.city}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-lg font-bold text-slate-900">{formatCurrency(rental.monthlyRent, '/mo')}</p>
          <p className="text-xs text-slate-500">Deposit {formatCurrency(rental.securityDeposit)}</p>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-600">
          <span>{rental.bhk ? `${rental.bhk} BHK` : 'Studio'} • {rental.carpetArea ? `${rental.carpetArea} sq.ft` : 'Area on request'}</span>
          <span className="inline-flex items-center gap-1">
            <Sofa className="h-3.5 w-3.5" />
            {rental.furnishedStatus}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-600">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" />
            Available {availableLabel}
          </span>
          <span>{rental.viewCount} views</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {amenityIcons.map((amenity) => (
            <span key={amenity} className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600">
              {amenity}
            </span>
          ))}
        </div>

        <p className="text-xs text-slate-600">
          Contact Owner: <span className="font-semibold text-slate-900">{contactPhone}</span>
        </p>

        <div className="grid grid-cols-3 gap-2">
          <Button className="h-10 rounded-xl bg-blue-700 text-white hover:bg-blue-800" onClick={() => onOpenDetails(referenceId)}>
            View Details
          </Button>
          <Button asChild variant="outline" className="h-10 rounded-xl border-slate-300">
            <a href={`tel:${toDialNumber(contactPhone)}`}>
              <PhoneCall className="mr-1 h-3.5 w-3.5" />
              Call
            </a>
          </Button>
          <Button variant="outline" className="h-10 rounded-xl border-slate-300" onClick={() => onOpenMessages(referenceId)}>
            <MessageCircle className="mr-1 h-3.5 w-3.5" />
            Message
          </Button>
        </div>
      </div>
    </article>
  );
}

