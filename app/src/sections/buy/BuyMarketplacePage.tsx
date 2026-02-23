import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  Flame,
  Heart,
  Home,
  Loader2,
  MapPin,
  MessageCircle,
  PhoneCall,
  ShieldCheck,
  Sparkles,
  Trees,
  Zap,
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
  FAVORITES_CHANGED_EVENT,
  isFavorite,
  removeFavoriteListing,
  upsertFavoriteListing,
} from '@/lib/favoritesStore';
import { readIndiaLocationSelection } from '@/lib/indiaLocationSelection';
import { createGroupDealRequest } from '@/lib/groupDealsApi';

interface BuyMarketplacePageProps {
  onOpenDetails: (propertyId: string) => void;
  onOpenSaved: () => void;
  onOpenMap: () => void;
  onOpenMessages: (propertyReference?: string) => void;
  onOpenGroupDeal?: (dealCode: string) => void;
}

interface MarketplaceProperty {
  id: number;
  title: string;
  city: string;
  area: string;
  locality: string;
  address: string;
  price: number | null;
  pricePerSqft: number | null;
  areaSqft: number | null;
  carpetArea: number | null;
  builtupArea: number | null;
  superBuiltupArea: number | null;
  bhk: number | null;
  bedrooms: number | null;
  propertyType: string;
  facing: string;
  isCorner: boolean;
  isVaastu: boolean;
  possessionStatus: string;
  reraNumber: string;
  isVerified: boolean;
  isFeatured: boolean;
  viewCount: number;
  isNegotiable: boolean;
  isPrelaunch: boolean;
  amenities: string[];
  primaryImage: string;
  companyName: string;
  companyType: string;
  companyPropertyCount: number;
  activeGroupDealCode: string;
  activeGroupDealStatus: string;
}

interface MarketplaceResponse {
  properties: MarketplaceProperty[];
  total: number;
  page: number;
  pageSize: number;
}

type SortKey =
  | 'recommended'
  | 'price_low'
  | 'price_high'
  | 'newest'
  | 'verified'
  | 'most_viewed';

type FiltersState = {
  city: string;
  locality: string;
  minPrice: number;
  maxPrice: number;
  minPricePerSqft: number;
  maxPricePerSqft: number;
  bhk: string;
  type: string;
  facing: string;
  corner: boolean;
  vastu: boolean;
  negotiable: boolean;
  prelaunch: boolean;
  verifiedOnly: boolean;
  minCarpetArea: number;
  maxCarpetArea: number;
  minBuiltupArea: number;
  maxBuiltupArea: number;
  amenities: string[];
  sort: SortKey;
};

const defaultFilters: FiltersState = {
  city: '',
  locality: '',
  minPrice: 20,
  maxPrice: 2500,
  minPricePerSqft: 2000,
  maxPricePerSqft: 30000,
  bhk: 'Any',
  type: 'Any',
  facing: 'Any',
  corner: false,
  vastu: false,
  negotiable: false,
  prelaunch: false,
  verifiedOnly: false,
  minCarpetArea: 300,
  maxCarpetArea: 4000,
  minBuiltupArea: 300,
  maxBuiltupArea: 5000,
  amenities: [],
  sort: 'recommended',
};

const amenityOptions = [
  { key: 'lift', label: 'Lift', icon: <Building2 className="h-3.5 w-3.5" /> },
  { key: 'parking', label: 'Parking', icon: <Home className="h-3.5 w-3.5" /> },
  { key: 'power-backup', label: 'Power Backup', icon: <Zap className="h-3.5 w-3.5" /> },
  { key: 'swimming-pool', label: 'Swimming Pool', icon: <Sparkles className="h-3.5 w-3.5" /> },
  { key: 'gym', label: 'Gym', icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  { key: 'clubhouse', label: 'Clubhouse', icon: <Building2 className="h-3.5 w-3.5" /> },
  { key: 'garden', label: 'Garden', icon: <Trees className="h-3.5 w-3.5" /> },
  { key: 'children-play-area', label: 'Kids Play Area', icon: <Home className="h-3.5 w-3.5" /> },
  { key: 'smart-home', label: 'Smart Home', icon: <Sparkles className="h-3.5 w-3.5" /> },
  { key: 'ev-charging', label: 'EV Charging', icon: <Zap className="h-3.5 w-3.5" /> },
  { key: 'near-metro-bus', label: 'Near Metro', icon: <MapPin className="h-3.5 w-3.5" /> },
  { key: 'near-hospital', label: 'Near Hospital', icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  { key: 'near-school', label: 'Near School', icon: <Building2 className="h-3.5 w-3.5" /> },
];

const propertyTypeOptions = [
  'Any',
  'Apartment',
  'Villa',
  'Plotted',
  'Independent House',
  'Studio',
  'Duplex',
  'Commercial',
];

const bhkOptions = ['Any', 'Studio', '1', '2', '3', '4', '5+'];

const facingOptions = ['Any', 'North', 'East', 'South', 'West', 'North-East', 'North-West', 'South-East', 'South-West'];

const sortOptions: Array<{ key: SortKey; label: string }> = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'price_low', label: 'Price low to high' },
  { key: 'price_high', label: 'Price high to low' },
  { key: 'newest', label: 'Newest first' },
  { key: 'verified', label: 'Verified only' },
  { key: 'most_viewed', label: 'Most viewed' },
];

function formatPrice(price: number | null): string {
  if (!price || price <= 0) return 'Price on request';
  if (price >= 10000000) {
    return `INR ${(price / 10000000).toFixed(2)} Cr`;
  }
  if (price >= 100000) {
    return `INR ${(price / 100000).toFixed(1)} L`;
  }
  return `INR ${price.toLocaleString('en-IN')}`;
}

function estimateEmi(price: number | null): string {
  if (!price || price <= 0) return 'EMI on request';
  const principal = price;
  const annualRate = 0.09;
  const months = 20 * 12;
  const monthlyRate = annualRate / 12;
  const emi =
    (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) /
    (Math.pow(1 + monthlyRate, months) - 1);
  if (!Number.isFinite(emi)) return 'EMI on request';
  return `INR ${Math.round(emi).toLocaleString('en-IN')}/mo`;
}

function pickAmenityIcons(amenities: string[]): Array<{ key: string; label: string; icon: ReactNode }> {
  const normalized = amenities.map((item) => item.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  const picked: Array<{ key: string; label: string; icon: ReactNode }> = [];
  for (const option of amenityOptions) {
    if (normalized.some((value) => value.includes(option.key))) {
      picked.push(option);
    }
    if (picked.length >= 3) break;
  }
  return picked.length > 0 ? picked : amenityOptions.slice(0, 3);
}

function parseNumber(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getMarketplaceContact(property: MarketplaceProperty): {
  role: 'Owner' | 'Dealer' | 'Builder';
  phone: string;
} {
  const type = (property.companyType || '').toLowerCase();
  if (type.includes('builder')) {
    return { role: 'Builder', phone: '+91 90000 30003' };
  }
  if (type.includes('dealer')) {
    return { role: 'Dealer', phone: '+91 90000 20002' };
  }
  return { role: 'Owner', phone: '+91 90000 10001' };
}

function toDialNumber(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}

function normalizeGroupDealText(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
    .replace(/\s+/g, '_');
}

function resolveGroupDealPriorityForProperty(property: MarketplaceProperty): number | null {
  const propertyType = normalizeGroupDealText(property.propertyType);
  const bedrooms = Number(property.bedrooms ?? property.bhk ?? 0);
  const possessionStatus = normalizeGroupDealText(property.possessionStatus);
  const isVerified = Boolean(property.isVerified);

  if (propertyType.includes('apartment') && (bedrooms === 2 || bedrooms === 3)) return 1;
  if (/(commercial|shop|office)/.test(propertyType)) return 2;
  if (/(plot|plotted|land)/.test(propertyType)) return 3;
  if (possessionStatus === 'under_construction') return 4;
  if (['ready', 'ready_to_move', 'resale'].includes(possessionStatus) && isVerified) return 5;
  return null;
}

function getGroupDealPriorityLabel(priority: number | null): string {
  if (priority === 1) return 'Apartments (2BHK / 3BHK)';
  if (priority === 2) return 'Commercial shops / offices';
  if (priority === 3) return 'Plotted layouts';
  if (priority === 4) return 'Under-construction projects';
  if (priority === 5) return 'Ready-to-move (selective)';
  return '';
}

function parseFiltersFromUrl(): FiltersState {
  const params = new URLSearchParams(window.location.search);
  const locationDefaults = readIndiaLocationSelection();
  const amenities = params.get('amenities')?.split(',').map((item) => item.trim()).filter(Boolean) || [];
  return {
    city: params.get('city') || locationDefaults?.place || '',
    locality: params.get('locality') || locationDefaults?.subdistrict || '',
    minPrice: parseNumber(params.get('minPrice'), defaultFilters.minPrice),
    maxPrice: parseNumber(params.get('maxPrice'), defaultFilters.maxPrice),
    minPricePerSqft: parseNumber(params.get('minPricePerSqft'), defaultFilters.minPricePerSqft),
    maxPricePerSqft: parseNumber(params.get('maxPricePerSqft'), defaultFilters.maxPricePerSqft),
    bhk: params.get('bhk') || defaultFilters.bhk,
    type: params.get('type') || defaultFilters.type,
    facing: params.get('facing') || defaultFilters.facing,
    corner: params.get('corner') === 'true',
    vastu: params.get('vastu') === 'true',
    negotiable: params.get('negotiable') === 'true',
    prelaunch: params.get('prelaunch') === 'true',
    verifiedOnly: params.get('verifiedOnly') === 'true',
    minCarpetArea: parseNumber(params.get('minCarpetArea'), defaultFilters.minCarpetArea),
    maxCarpetArea: parseNumber(params.get('maxCarpetArea'), defaultFilters.maxCarpetArea),
    minBuiltupArea: parseNumber(params.get('minBuiltupArea'), defaultFilters.minBuiltupArea),
    maxBuiltupArea: parseNumber(params.get('maxBuiltupArea'), defaultFilters.maxBuiltupArea),
    amenities,
    sort: (params.get('sort') as SortKey) || defaultFilters.sort,
  };
}

function updateUrl(filters: FiltersState, page: number) {
  const params = new URLSearchParams();
  if (filters.city) params.set('city', filters.city);
  if (filters.locality) params.set('locality', filters.locality);
  if (filters.bhk && filters.bhk !== 'Any') params.set('bhk', filters.bhk);
  if (filters.type && filters.type !== 'Any') params.set('type', filters.type);
  if (filters.facing && filters.facing !== 'Any') params.set('facing', filters.facing);
  if (filters.corner) params.set('corner', 'true');
  if (filters.vastu) params.set('vastu', 'true');
  if (filters.negotiable) params.set('negotiable', 'true');
  if (filters.prelaunch) params.set('prelaunch', 'true');
  if (filters.verifiedOnly) params.set('verifiedOnly', 'true');
  if (filters.amenities.length > 0) params.set('amenities', filters.amenities.join(','));
  params.set('minPrice', String(filters.minPrice));
  params.set('maxPrice', String(filters.maxPrice));
  params.set('minPricePerSqft', String(filters.minPricePerSqft));
  params.set('maxPricePerSqft', String(filters.maxPricePerSqft));
  params.set('minCarpetArea', String(filters.minCarpetArea));
  params.set('maxCarpetArea', String(filters.maxCarpetArea));
  params.set('minBuiltupArea', String(filters.minBuiltupArea));
  params.set('maxBuiltupArea', String(filters.maxBuiltupArea));
  params.set('sort', filters.sort);
  params.set('page', String(page));
  const query = params.toString();
  const nextUrl = query ? `/buy?${query}` : '/buy';
  const existingState = window.history.state || {};
  window.history.replaceState({ ...existingState, __zdtSpa: true }, '', nextUrl);
}

export default function BuyMarketplacePage({
  onOpenDetails,
  onOpenSaved,
  onOpenMap,
  onOpenMessages,
  onOpenGroupDeal,
}: BuyMarketplacePageProps) {
  const [filters, setFilters] = useState<FiltersState>(() => parseFiltersFromUrl());
  const [appliedFilters, setAppliedFilters] = useState<FiltersState>(() => parseFiltersFromUrl());
  const [properties, setProperties] = useState<MarketplaceProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(() => parseNumber(new URLSearchParams(window.location.search).get('page'), 1));
  const [pageSize, setPageSize] = useState(24);
  const [total, setTotal] = useState(0);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    updateUrl(appliedFilters, page);
  }, [appliedFilters, page]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    const params = new URLSearchParams();
    params.set('listingType', 'sale');
    if (appliedFilters.city) params.set('city', appliedFilters.city);
    if (appliedFilters.locality) params.set('locality', appliedFilters.locality);
    if (appliedFilters.bhk && appliedFilters.bhk !== 'Any') params.set('bhk', appliedFilters.bhk);
    if (appliedFilters.type && appliedFilters.type !== 'Any') params.set('type', appliedFilters.type);
    if (appliedFilters.facing && appliedFilters.facing !== 'Any') params.set('facing', appliedFilters.facing);
    if (appliedFilters.corner) params.set('corner', 'true');
    if (appliedFilters.vastu) params.set('vastu', 'true');
    if (appliedFilters.negotiable) params.set('negotiable', 'true');
    if (appliedFilters.prelaunch) params.set('prelaunch', 'true');
    if (appliedFilters.verifiedOnly) params.set('verifiedOnly', 'true');
    if (appliedFilters.amenities.length > 0) {
      params.set('amenities', appliedFilters.amenities.join(','));
    }
    params.set('minPrice', String(appliedFilters.minPrice));
    params.set('maxPrice', String(appliedFilters.maxPrice));
    params.set('minPricePerSqft', String(appliedFilters.minPricePerSqft));
    params.set('maxPricePerSqft', String(appliedFilters.maxPricePerSqft));
    params.set('minCarpetArea', String(appliedFilters.minCarpetArea));
    params.set('maxCarpetArea', String(appliedFilters.maxCarpetArea));
    params.set('minBuiltupArea', String(appliedFilters.minBuiltupArea));
    params.set('maxBuiltupArea', String(appliedFilters.maxBuiltupArea));
    params.set('sort', appliedFilters.sort);
    params.set('page', String(page));
    params.set('limit', String(pageSize));

    apiRequest<MarketplaceResponse>(`/api/properties?${params.toString()}`)
      .then((response) => {
        if (!active) return;
        setProperties(response.properties || []);
        setTotal(Number(response.total || 0));
        setPageSize(Number(response.pageSize || pageSize));
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load properties');
        setProperties([]);
        setTotal(0);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [appliedFilters, page, pageSize]);

  const handleApply = () => {
    setAppliedFilters(filters);
    setPage(1);
  };

  const handleAmenityToggle = (key: string) => {
    setFilters((prev) => {
      const next = prev.amenities.includes(key)
        ? prev.amenities.filter((item) => item !== key)
        : [...prev.amenities, key];
      return { ...prev, amenities: next };
    });
  };

  const summary = useMemo(() => {
    return `${total.toLocaleString('en-IN')} listings - Premium verified inventory`;
  }, [total]);
  return (
    <section className="pb-20 pt-28 text-slate-900">
      <div className="page-container space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-[#0f172a] via-[#111827] to-[#1f2937] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-blue-200">ZDT BUY MARKETPLACE</p>
              <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">Discover elite homes with AI-backed clarity.</h1>
              <p className="mt-2 max-w-2xl text-sm text-blue-100">
                Unicorn-grade inventory with verified builders, instant EMI estimates, and transparent pricing history.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                className="h-10 rounded-full bg-white/10 text-white hover:bg-white/20"
                onClick={onOpenSaved}
              >
                <Heart className="mr-2 h-4 w-4" />
                Saved
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
              RERA verified only
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1">
              <Sparkles className="h-3.5 w-3.5" />
              AI investment score ready
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1">
              <Flame className="h-3.5 w-3.5" />
              Featured boosts
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
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Price Range (INR Lakh)</p>
                  <div className="mt-2 grid gap-3">
                    <Slider
                      value={[filters.minPrice, filters.maxPrice]}
                      onValueChange={([min, max]) =>
                        setFilters((prev) => ({ ...prev, minPrice: min, maxPrice: max }))
                      }
                      min={10}
                      max={5000}
                      step={10}
                    />
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{filters.minPrice}L</span>
                      <span>{filters.maxPrice}L</span>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Price per sqft</p>
                  <div className="mt-2 grid gap-3">
                    <Slider
                      value={[filters.minPricePerSqft, filters.maxPricePerSqft]}
                      onValueChange={([min, max]) =>
                        setFilters((prev) => ({ ...prev, minPricePerSqft: min, maxPricePerSqft: max }))
                      }
                      min={1000}
                      max={50000}
                      step={250}
                    />
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{filters.minPricePerSqft}</span>
                      <span>{filters.maxPricePerSqft}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Configuration</p>
                  <div className="mt-2 grid gap-2">
                    <Select value={filters.bhk} onValueChange={(value) => setFilters((prev) => ({ ...prev, bhk: value }))}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="BHK" />
                      </SelectTrigger>
                      <SelectContent>
                        {bhkOptions.map((item) => (
                          <SelectItem key={item} value={item}>
                            {item === 'Any' ? 'Any BHK' : item}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={filters.type}
                      onValueChange={(value) => setFilters((prev) => ({ ...prev, type: value }))}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        {propertyTypeOptions.map((item) => (
                          <SelectItem key={item} value={item}>
                            {item}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Area Range (sq.ft)</p>
                  <div className="mt-2 grid gap-3">
                    <Slider
                      value={[filters.minCarpetArea, filters.maxCarpetArea]}
                      onValueChange={([min, max]) =>
                        setFilters((prev) => ({ ...prev, minCarpetArea: min, maxCarpetArea: max }))
                      }
                      min={200}
                      max={8000}
                      step={50}
                    />
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Carpet {filters.minCarpetArea}</span>
                      <span>{filters.maxCarpetArea}</span>
                    </div>
                    <Slider
                      value={[filters.minBuiltupArea, filters.maxBuiltupArea]}
                      onValueChange={([min, max]) =>
                        setFilters((prev) => ({ ...prev, minBuiltupArea: min, maxBuiltupArea: max }))
                      }
                      min={200}
                      max={10000}
                      step={50}
                    />
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Built-up {filters.minBuiltupArea}</span>
                      <span>{filters.maxBuiltupArea}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Orientation</p>
                  <div className="mt-2 grid gap-2">
                    <Select
                      value={filters.facing}
                      onValueChange={(value) => setFilters((prev) => ({ ...prev, facing: value }))}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Facing" />
                      </SelectTrigger>
                      <SelectContent>
                        {facingOptions.map((item) => (
                          <SelectItem key={item} value={item}>
                            {item}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-xs">
                      Corner property
                      <Checkbox
                        checked={filters.corner}
                        onCheckedChange={(value) => setFilters((prev) => ({ ...prev, corner: Boolean(value) }))}
                      />
                    </label>
                    <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-xs">
                      Vaastu compliant
                      <Checkbox
                        checked={filters.vastu}
                        onCheckedChange={(value) => setFilters((prev) => ({ ...prev, vastu: Boolean(value) }))}
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Amenities</p>
                  <div className="mt-2 grid gap-2">
                    {amenityOptions.map((amenity) => (
                      <label
                        key={amenity.key}
                        className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-xs"
                      >
                        <span className="inline-flex items-center gap-2 text-slate-700">
                          {amenity.icon}
                          {amenity.label}
                        </span>
                        <Checkbox
                          checked={filters.amenities.includes(amenity.key)}
                          onCheckedChange={() => handleAmenityToggle(amenity.key)}
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Deal Tags</p>
                  <div className="mt-2 grid gap-2">
                    <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-xs">
                      Negotiable
                      <Checkbox
                        checked={filters.negotiable}
                        onCheckedChange={(value) => setFilters((prev) => ({ ...prev, negotiable: Boolean(value) }))}
                      />
                    </label>
                    <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-xs">
                      Pre-launch
                      <Checkbox
                        checked={filters.prelaunch}
                        onCheckedChange={(value) => setFilters((prev) => ({ ...prev, prelaunch: Boolean(value) }))}
                      />
                    </label>
                    <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-xs">
                      Verified only
                      <Checkbox
                        checked={filters.verifiedOnly}
                        onCheckedChange={(value) => setFilters((prev) => ({ ...prev, verifiedOnly: Boolean(value) }))}
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sort By</p>
                  <Select
                    value={filters.sort}
                    onValueChange={(value: SortKey) => setFilters((prev) => ({ ...prev, sort: value }))}
                  >
                    <SelectTrigger className="mt-2 h-9">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      {sortOptions.map((option) => (
                        <SelectItem key={option.key} value={option.key}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button className="mt-2 h-10 w-full rounded-xl bg-blue-700 text-white hover:bg-blue-800" onClick={handleApply}>
                  Apply Filters
                </Button>
              </div>
            </div>
          </aside>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Premium Buy Inventory</h2>
                <p className="text-sm text-slate-600">{summary}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="h-9" onClick={onOpenMap}>
                  Map View
                </Button>
              </div>
            </div>

            {loading ? (
              <PropertyCardsSkeleton />
            ) : error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
                {error}
              </div>
            ) : properties.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
                No properties match the selected filters.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {properties.map((property) => (
                  <PropertyCard
                    key={property.id}
                    property={property}
                    onOpenDetails={onOpenDetails}
                    onOpenMessages={onOpenMessages}
                    onOpenGroupDeal={onOpenGroupDeal}
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

function PropertyCard({
  property,
  onOpenDetails,
  onOpenMessages,
  onOpenGroupDeal,
}: {
  property: MarketplaceProperty;
  onOpenDetails: (propertyId: string) => void;
  onOpenMessages: (propertyReference?: string) => void;
  onOpenGroupDeal?: (dealCode: string) => void;
}) {
  const referenceId = String(property.id);
  const [saved, setSaved] = useState(() => isFavorite(referenceId));
  const contact = getMarketplaceContact(property);
  const activeGroupDealCode = String(property.activeGroupDealCode || '').trim();
  const hasActiveGroupDeal = activeGroupDealCode.length > 0;
  const groupDealPriority = resolveGroupDealPriorityForProperty(property);
  const groupDealPriorityLabel = getGroupDealPriorityLabel(groupDealPriority);
  const isGroupDealEligible = groupDealPriority !== null;
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestName, setRequestName] = useState('');
  const [requestPhone, setRequestPhone] = useState('');
  const [requestEmail, setRequestEmail] = useState('');
  const [requestNote, setRequestNote] = useState('');
  const [requestConsent, setRequestConsent] = useState(true);
  const [requestSubmitting, setRequestSubmitting] = useState(false);

  useEffect(() => {
    const sync = () => {
      setSaved(isFavorite(referenceId));
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
  }, [referenceId]);

  const primaryAmenities = pickAmenityIcons(property.amenities);
  const priceLabel = formatPrice(property.price);
  const emiLabel = estimateEmi(property.price);
  const areaLabel = property.areaSqft || property.carpetArea || property.builtupArea;
  const postedBy = property.companyName || (property.companyType ? `Verified ${property.companyType}` : 'ZDT Partner');

  const handleSave = () => {
    if (saved) {
      removeFavoriteListing(referenceId);
      toast.success('Removed from saved');
      setSaved(false);
      return;
    }

    upsertFavoriteListing({
      id: referenceId,
      referenceId,
      title: property.title,
      image: property.primaryImage || '/images/property-1.jpg',
      city: property.city,
      area: property.locality || property.area,
      priceLabel,
      areaLabel: areaLabel ? `${areaLabel} sq.ft` : 'Area on request',
      propertyType: property.propertyType,
      bhk: property.bhk ? `${property.bhk} BHK` : 'N/A',
      mainDoorFacing: property.facing || 'NA',
      vastuScore: property.isVaastu ? 88 : 70,
      verified: property.isVerified,
      ownerPhone: 'Hidden',
      isFeatured: property.isFeatured,
    });
    toast.success('Saved to your shortlist');
    setSaved(true);
  };

  const handleRequestSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!requestName.trim()) {
      toast.error('Please enter your full name.');
      return;
    }
    if (!requestPhone.trim() && !requestEmail.trim()) {
      toast.error('Please enter phone or email.');
      return;
    }
    if (!requestConsent) {
      toast.error('Consent is required to submit request.');
      return;
    }

    try {
      setRequestSubmitting(true);
      const response = await createGroupDealRequest({
        propertyId: Number(property.id),
        fullName: requestName.trim(),
        phone: requestPhone.trim(),
        email: requestEmail.trim(),
        note: requestNote.trim(),
        consent: true,
      });
      toast.success(response.message || 'Group deal request submitted.');
      setShowRequestForm(false);
      setRequestName('');
      setRequestPhone('');
      setRequestEmail('');
      setRequestNote('');
      setRequestConsent(true);
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : 'Could not submit group-deal request.');
    } finally {
      setRequestSubmitting(false);
    }
  };

  return (
    <article className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
      <div className="relative">
        <img
          src={property.primaryImage || '/images/property-1.jpg'}
          alt={property.title}
          className="h-48 w-full object-cover"
          loading="lazy"
        />
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          {property.isVerified && (
            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
              <BadgeCheck className="mr-1 h-3.5 w-3.5" />
              Verified
            </Badge>
          )}
          {hasActiveGroupDeal && (
            <Badge className="bg-blue-700 text-white hover:bg-blue-700">Group Deal Live</Badge>
          )}
          {!hasActiveGroupDeal && isGroupDealEligible && (
            <Badge className="bg-indigo-600 text-white hover:bg-indigo-600">
              Group Deal Priority {groupDealPriority}
            </Badge>
          )}
          {property.reraNumber && (
            <Badge className="bg-slate-900 text-white hover:bg-slate-900">RERA</Badge>
          )}
          {property.isFeatured && (
            <Badge className="bg-amber-500 text-white hover:bg-amber-500">
              <Flame className="mr-1 h-3.5 w-3.5" />
              Hot Deal
            </Badge>
          )}
        </div>
        <div className="absolute right-3 top-3 flex flex-col gap-2">
          <button
            type="button"
            aria-label="Save"
            className={`inline-flex h-9 w-9 items-center justify-center rounded-full border shadow-sm transition ${
              saved
                ? 'border-rose-200 bg-rose-50 text-rose-600'
                : 'border-white/70 bg-white/90 text-slate-600 hover:text-rose-500'
            }`}
            onClick={handleSave}
          >
            <Heart className={`h-4 w-4 ${saved ? 'fill-current' : ''}`} />
          </button>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900">{property.title}</h3>
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500">
              <MapPin className="h-3.5 w-3.5" />
              {property.locality || property.area}, {property.city}
            </p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p>Views</p>
            <p className="font-semibold text-slate-700">{property.viewCount}</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-lg font-bold text-slate-900">{priceLabel}</p>
          <p className="text-xs text-slate-500">{emiLabel}</p>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-600">
          <span>
            {property.bhk ? `${property.bhk} BHK` : 'Studio'} - {areaLabel ? `${areaLabel} sq.ft` : 'Area on request'}
          </span>
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            {property.possessionStatus.replace('_', ' ')}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {primaryAmenities.map((amenity) => (
            <span
              key={amenity.key}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600"
            >
              {amenity.icon}
              {amenity.label}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Posted by {postedBy}</span>
          {property.isVaastu && (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">
              Vaastu+
            </span>
          )}
        </div>

        {!hasActiveGroupDeal && isGroupDealEligible && (
          <p className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-2 text-xs text-indigo-800">
            Eligible for group deal request. Priority {groupDealPriority}: {groupDealPriorityLabel}.
          </p>
        )}

        <p className="text-xs text-slate-600">
          Contact {contact.role}: <span className="font-semibold text-slate-900">{contact.phone}</span>
        </p>

        <div className="grid grid-cols-3 gap-2">
          <Button className="h-10 rounded-xl bg-blue-700 text-white hover:bg-blue-800" onClick={() => onOpenDetails(referenceId)}>
            View Details
          </Button>
          <Button asChild variant="outline" className="h-10 rounded-xl border-slate-300">
            <a href={`tel:${toDialNumber(contact.phone)}`}>
              <PhoneCall className="mr-1 h-3.5 w-3.5" />
              Call
            </a>
          </Button>
          <Button variant="outline" className="h-10 rounded-xl border-slate-300" onClick={() => onOpenMessages(referenceId)}>
            <MessageCircle className="mr-1 h-3.5 w-3.5" />
            Message
          </Button>
        </div>

        {hasActiveGroupDeal && (
          <Button
            className="h-10 w-full rounded-xl bg-indigo-700 text-white hover:bg-indigo-800"
            onClick={() => onOpenGroupDeal?.(activeGroupDealCode)}
          >
            Join Group Deal
          </Button>
        )}
        {!hasActiveGroupDeal && isGroupDealEligible && (
          <>
            {!showRequestForm ? (
              <Button
                variant="outline"
                className="h-10 w-full rounded-xl border-indigo-300 text-indigo-800 hover:bg-indigo-50"
                onClick={() => setShowRequestForm(true)}
              >
                Request Group Deal
              </Button>
            ) : (
              <form
                onSubmit={handleRequestSubmit}
                className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3"
              >
                <input
                  value={requestName}
                  onChange={(event) => setRequestName(event.target.value)}
                  placeholder="Full name"
                  className="h-9 w-full rounded-lg border border-indigo-200 bg-white px-3 text-xs text-slate-800"
                  maxLength={120}
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={requestPhone}
                    onChange={(event) => setRequestPhone(event.target.value)}
                    placeholder="Phone"
                    className="h-9 w-full rounded-lg border border-indigo-200 bg-white px-3 text-xs text-slate-800"
                    maxLength={32}
                  />
                  <input
                    value={requestEmail}
                    onChange={(event) => setRequestEmail(event.target.value)}
                    placeholder="Email"
                    className="h-9 w-full rounded-lg border border-indigo-200 bg-white px-3 text-xs text-slate-800"
                    maxLength={190}
                  />
                </div>
                <textarea
                  value={requestNote}
                  onChange={(event) => setRequestNote(event.target.value)}
                  placeholder="What unit type are you looking for? (optional)"
                  className="min-h-[70px] w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs text-slate-800"
                  maxLength={1000}
                />
                <label className="flex items-start gap-2 text-[11px] text-slate-700">
                  <input
                    type="checkbox"
                    checked={requestConsent}
                    onChange={(event) => setRequestConsent(event.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-indigo-300"
                  />
                  <span>
                    I understand this is an interest-based group deal. ZDT does not collect booking money.
                  </span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="submit"
                    className="h-9 rounded-lg bg-indigo-700 text-xs text-white hover:bg-indigo-800"
                    disabled={requestSubmitting}
                  >
                    {requestSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      'Submit Request'
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 rounded-lg border-indigo-300 text-xs text-indigo-800 hover:bg-indigo-50"
                    onClick={() => setShowRequestForm(false)}
                    disabled={requestSubmitting}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </article>
  );
}

