import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, ChevronLeft, ChevronRight, GitCompareArrows, Heart, MapPin, MessageCircle, SearchCheck, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/http';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { PropertyCardsSkeleton } from '@/components/loading/PageSkeletons';
import { LgdLocationAccuracyNote, LgdLocationInput } from '@/components/realty/LgdLocationInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { trackFeatureUsage } from '@/lib/featureUsageApi';
import { SAVED_RENTALS_CHANGED_EVENT, isSavedRental, removeSavedRental, upsertSavedRental } from '@/lib/rentalsSavedStore';
import { readIndiaLocationSelection } from '@/lib/indiaLocationSelection';
import {
  COMPARE_CHANGED_EVENT,
  isCompared,
  readComparedListings,
  removeComparedListing,
  upsertComparedListing,
} from '@/lib/compareStore';
import { addSavedSearch } from '@/lib/savedSearchStore';

interface RentMarketplacePageProps {
  onOpenDetails: (propertyId: string) => void;
  onOpenSaved: () => void;
  onOpenMessages: (propertyReference?: string) => void;
  onOpenListProperty: () => void;
  onOpenCompare?: () => void;
  onOpenSavedSearches?: () => void;
  initialViewMode?: ViewMode;
}

interface RentalListing {
  id: number;
  title: string;
  state?: string;
  city: string;
  area?: string;
  locality: string;
  address?: string;
  monthlyRent: number | null;
  securityDeposit: number | null;
  bhk: number | null;
  propertyType?: string;
  carpetArea: number | null;
  builtupArea?: number | null;
  furnishedStatus: string;
  tenantPreference?: string;
  availableFrom: string;
  ownerName?: string;
  builderName?: string;
  companyName?: string;
  imageUrls?: string[];
  isVerified: boolean;
  primaryImage: string;
}

type SortKey = 'recommended' | 'rent_low' | 'rent_high' | 'newest' | 'verified';
type ViewMode = 'list' | 'map';
type GeoPoint = { latitude: number; longitude: number };

type FiltersState = {
  state: string;
  district: string;
  city: string;
  locality: string;
  propertyType: string;
  minRent: number;
  maxRent: number;
  minDeposit: number;
  maxDeposit: number;
  availableFrom: string;
  availability: 'Any' | 'Immediate' | 'Future';
  tenantPreference: string;
  furnishing: string;
  verifiedOnly: boolean;
  photosOnly: boolean;
  sort: SortKey;
};

const RENT_API_MAX_LIMIT = 60;

const defaultFilters = (): FiltersState => {
  const location = readIndiaLocationSelection();
  return {
    state: location?.state || '',
    district: location?.district || '',
    city: location?.place || '',
    locality: location?.subdistrict || '',
    propertyType: 'Any',
    minRent: 4000,
    maxRent: 120000,
    minDeposit: 0,
    maxDeposit: 400000,
    availableFrom: '',
    availability: 'Any',
    tenantPreference: 'Any',
    furnishing: 'Any',
    verifiedOnly: false,
    photosOnly: false,
    sort: 'recommended',
  };
};

const fmt = (value: number | null, suffix = '') => (!value || value <= 0 ? 'On request' : `INR ${Math.round(value).toLocaleString('en-IN')}${suffix}`);
const normalize = (value: string) => String(value || '').toLowerCase().trim();
const optionLabel = (value: string, anyLabel: string) => (value === 'Any' ? anyLabel : value);
const buildLiveMapEmbedUrl = (locationLabel: string, focusPoint: GeoPoint | null = null) => {
  const query = focusPoint
    ? `${focusPoint.latitude},${focusPoint.longitude}`
    : String(locationLabel || '').trim() || 'India';
  const zoom = focusPoint ? '16' : '12';
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=${zoom}&output=embed`;
};

function isCoordinateInRange(value: number, min: number, max: number): boolean {
  if (!Number.isFinite(value)) return false;
  return value >= min && value <= max;
}

function parseCoordinateQuery(value: string): GeoPoint | null {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const parts = normalized.split(/[,\s]+/).filter(Boolean);
  if (parts.length < 2) return null;

  const latitude = Number(parts[0]);
  const longitude = Number(parts[1]);
  if (!isCoordinateInRange(latitude, -90, 90)) return null;
  if (!isCoordinateInRange(longitude, -180, 180)) return null;

  return {
    latitude: Number(latitude.toFixed(7)),
    longitude: Number(longitude.toFixed(7)),
  };
}

function formatCoordinateValue(value: number): string {
  return value.toFixed(6);
}

export default function RentMarketplacePage({
  onOpenDetails,
  onOpenSaved,
  onOpenMessages,
  onOpenListProperty,
  onOpenCompare,
  onOpenSavedSearches,
  initialViewMode = 'list',
}: RentMarketplacePageProps) {
  const [filters, setFilters] = useState<FiltersState>(defaultFilters);
  const [applied, setApplied] = useState<FiltersState>(defaultFilters);
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [rentals, setRentals] = useState<RentalListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const [compareCount, setCompareCount] = useState(() => readComparedListings().length);
  const [page, setPage] = useState(1);
  const [manualMapFocusPoint, setManualMapFocusPoint] = useState<GeoPoint | null>(null);
  const [manualMapFocusLabel, setManualMapFocusLabel] = useState('');
  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [locatingCurrentPosition, setLocatingCurrentPosition] = useState(false);
  const pageSize = 12;

  useEffect(() => {
    setViewMode(initialViewMode);
  }, [initialViewMode]);

  useEffect(() => {
    if (viewMode !== 'map') return;
    void trackFeatureUsage({
      featureKey: 'rent_map_view_opened',
      context: 'rent_marketplace',
      view: 'rent-map',
    });
  }, [viewMode]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    params.set('limit', String(RENT_API_MAX_LIMIT));
    params.set('sort', applied.sort);
    if (applied.city.trim()) params.set('city', applied.city.trim());
    if (applied.locality.trim()) params.set('locality', applied.locality.trim());
    params.set('minRent', String(applied.minRent));
    params.set('maxRent', String(applied.maxRent));
    params.set('minDeposit', String(applied.minDeposit));
    params.set('maxDeposit', String(applied.maxDeposit));
    apiRequest<{ rentals: RentalListing[]; total: number }>(`/api/rentals?${params.toString()}`)
      .then((response) => {
        if (!active) return;
        setRentals(response.rentals || []);
        setTotal(Number(response.total || 0));
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load rentals');
        setRentals([]);
        setTotal(0);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [applied]);

  const filtered = useMemo(() => {
    const list = rentals.filter((rental) => {
      const stateText = normalize(rental.state || '');
      const districtText = normalize(rental.area || '');
      const cityText = normalize(rental.city || '');
      const localityText = normalize(rental.locality || rental.address || '');
      const hasPhotos =
        Boolean(String(rental.primaryImage || '').trim()) ||
        (Array.isArray(rental.imageUrls) && rental.imageUrls.length > 0);
      const availableDate = new Date(String(rental.availableFrom || ''));
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isImmediate = Number.isNaN(availableDate.getTime()) || availableDate <= today;

      const matchesAvailability =
        filters.availability === 'Any' ? true : filters.availability === 'Immediate' ? isImmediate : !isImmediate;

      const minRentOk = !rental.monthlyRent || rental.monthlyRent >= filters.minRent;
      const maxRentOk = !rental.monthlyRent || rental.monthlyRent <= filters.maxRent;
      const minDepOk = !rental.securityDeposit || rental.securityDeposit >= filters.minDeposit;
      const maxDepOk = !rental.securityDeposit || rental.securityDeposit <= filters.maxDeposit;

      return (
        (!filters.state || stateText.includes(normalize(filters.state))) &&
        (!filters.district || districtText.includes(normalize(filters.district))) &&
        (!filters.city || cityText.includes(normalize(filters.city))) &&
        (!filters.locality || localityText.includes(normalize(filters.locality))) &&
        (filters.propertyType === 'Any' || normalize(rental.propertyType || '').includes(normalize(filters.propertyType.split(' ')[0]))) &&
        (filters.tenantPreference === 'Any' || normalize(rental.tenantPreference || '').includes(normalize(filters.tenantPreference))) &&
        (filters.furnishing === 'Any' || normalize(rental.furnishedStatus).includes(normalize(filters.furnishing.split(' ')[0]))) &&
        (!filters.availableFrom || !rental.availableFrom || new Date(rental.availableFrom) <= new Date(filters.availableFrom)) &&
        matchesAvailability &&
        minRentOk &&
        maxRentOk &&
        minDepOk &&
        maxDepOk &&
        (!filters.verifiedOnly || rental.isVerified) &&
        (!filters.photosOnly || hasPhotos)
      );
    });

    if (filters.sort === 'rent_low') return [...list].sort((a, b) => Number(a.monthlyRent || 0) - Number(b.monthlyRent || 0));
    if (filters.sort === 'rent_high') return [...list].sort((a, b) => Number(b.monthlyRent || 0) - Number(a.monthlyRent || 0));
    if (filters.sort === 'verified') return [...list].sort((a, b) => Number(Boolean(b.isVerified)) - Number(Boolean(a.isVerified)));
    if (filters.sort === 'newest') return [...list].sort((a, b) => Number(b.id) - Number(a.id));
    return list;
  }, [filters, rentals]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filtered.length / pageSize)),
    [filtered.length, pageSize]
  );

  const pagedRentals = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const showingFrom = filtered.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(filtered.length, page * pageSize);

  const defaultMapFocusLabel = useMemo(() => {
    const parts = [filters.locality, filters.city, filters.district, filters.state]
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
    return parts.join(', ') || 'India';
  }, [filters.locality, filters.city, filters.district, filters.state]);

  const mapFocusLabel = useMemo(() => {
    if (manualMapFocusPoint) {
      if (manualMapFocusLabel.trim()) return manualMapFocusLabel.trim();
      return `Current location (${formatCoordinateValue(manualMapFocusPoint.latitude)}, ${formatCoordinateValue(manualMapFocusPoint.longitude)})`;
    }
    if (manualMapFocusLabel.trim()) return manualMapFocusLabel.trim();
    return defaultMapFocusLabel;
  }, [defaultMapFocusLabel, manualMapFocusLabel, manualMapFocusPoint]);

  const liveMapUrl = useMemo(
    () => buildLiveMapEmbedUrl(mapFocusLabel, manualMapFocusPoint),
    [manualMapFocusPoint, mapFocusLabel]
  );

  const nearbyRentals = useMemo(() => {
    const focusTokens = [filters.locality, filters.city, filters.district, filters.state]
      .map((entry) => normalize(entry))
      .filter(Boolean);

    if (focusTokens.length === 0) return filtered;

    const scoreRental = (rental: RentalListing) => {
      const haystack = normalize(
        [rental.locality, rental.area, rental.city, rental.state].filter(Boolean).join(' ')
      );
      return focusTokens.reduce((score, token) => (haystack.includes(token) ? score + 1 : score), 0);
    };

    return [...filtered].sort((a, b) => {
      const scoreDiff = scoreRental(b) - scoreRental(a);
      if (scoreDiff !== 0) return scoreDiff;
      return Number(b.id) - Number(a.id);
    });
  }, [filters.locality, filters.city, filters.district, filters.state, filtered]);

  const applyFilters = () => {
    if (filters.minRent > filters.maxRent) return toast.error('Minimum rent cannot be greater than maximum rent.');
    if (filters.minDeposit > filters.maxDeposit) return toast.error('Minimum deposit cannot be greater than maximum deposit.');
    setApplied(filters);
    void trackFeatureUsage({
      featureKey: 'rent_filters_applied',
      context: 'rent_marketplace',
      view: viewMode === 'map' ? 'rent-map' : 'rent',
      detail: `city=${filters.city || '-'};locality=${filters.locality || '-'};type=${filters.propertyType};sort=${filters.sort}`,
    });
  };

  const handleUseCurrentLocation = () => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      toast.error('Current location is not supported in this browser.');
      return;
    }
    setLocatingCurrentPosition(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextPoint = {
          latitude: Number(position.coords.latitude),
          longitude: Number(position.coords.longitude),
        };
        setManualMapFocusPoint(nextPoint);
        setManualMapFocusLabel('Current location');
        setMapSearchQuery(
          `${formatCoordinateValue(nextPoint.latitude)}, ${formatCoordinateValue(nextPoint.longitude)}`
        );
        setLocatingCurrentPosition(false);
        toast.success('Map centered to your current location.');
      },
      (geoError) => {
        setLocatingCurrentPosition(false);
        if (geoError.code === 1) {
          toast.error('Location permission denied. Allow location access and try again.');
          return;
        }
        if (geoError.code === 2) {
          toast.error('Unable to detect your location right now.');
          return;
        }
        if (geoError.code === 3) {
          toast.error('Location request timed out. Try again.');
          return;
        }
        toast.error('Could not fetch current location.');
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 60000,
      }
    );
  };

  const handleMapSearch = () => {
    const query = String(mapSearchQuery || '').trim();
    if (!query) {
      toast.error('Enter a place or coordinates to search on map.');
      return;
    }

    const coordinatePoint = parseCoordinateQuery(query);
    if (coordinatePoint) {
      setManualMapFocusPoint(coordinatePoint);
      setManualMapFocusLabel(
        `Manual coordinates (${formatCoordinateValue(coordinatePoint.latitude)}, ${formatCoordinateValue(coordinatePoint.longitude)})`
      );
      toast.success('Map centered to entered coordinates.');
      return;
    }

    setManualMapFocusPoint(null);
    setManualMapFocusLabel(query);
    toast.success('Map focused to searched place.');
  };

  useEffect(() => {
    setPage(1);
  }, [filters, viewMode]);

  useEffect(() => {
    if (page <= totalPages) return;
    setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    const sync = () => setCompareCount(readComparedListings().length);
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== 'zdt_compared_listings') return;
      sync();
    };
    sync();
    window.addEventListener('storage', onStorage);
    window.addEventListener(COMPARE_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(COMPARE_CHANGED_EVENT, sync);
    };
  }, []);

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string }> = [];
    if (filters.state.trim()) chips.push({ key: 'state', label: `State: ${filters.state.trim()}` });
    if (filters.district.trim()) chips.push({ key: 'district', label: `District: ${filters.district.trim()}` });
    if (filters.city.trim()) chips.push({ key: 'city', label: `City: ${filters.city.trim()}` });
    if (filters.locality.trim()) chips.push({ key: 'locality', label: `Locality: ${filters.locality.trim()}` });
    if (filters.propertyType !== 'Any') chips.push({ key: 'propertyType', label: filters.propertyType });
    if (filters.availability !== 'Any') chips.push({ key: 'availability', label: filters.availability });
    if (filters.tenantPreference !== 'Any') chips.push({ key: 'tenantPreference', label: filters.tenantPreference });
    if (filters.furnishing !== 'Any') chips.push({ key: 'furnishing', label: filters.furnishing });
    if (filters.verifiedOnly) chips.push({ key: 'verifiedOnly', label: 'Verified Only' });
    if (filters.photosOnly) chips.push({ key: 'photosOnly', label: 'Photos Only' });
    return chips;
  }, [filters]);

  const removeFilterChip = (key: string) => {
    setFilters((prev) => {
      if (key === 'state') return { ...prev, state: '' };
      if (key === 'district') return { ...prev, district: '' };
      if (key === 'city') return { ...prev, city: '' };
      if (key === 'locality') return { ...prev, locality: '' };
      if (key === 'propertyType') return { ...prev, propertyType: 'Any' };
      if (key === 'availability') return { ...prev, availability: 'Any' };
      if (key === 'tenantPreference') return { ...prev, tenantPreference: 'Any' };
      if (key === 'furnishing') return { ...prev, furnishing: 'Any' };
      if (key === 'verifiedOnly') return { ...prev, verifiedOnly: false };
      if (key === 'photosOnly') return { ...prev, photosOnly: false };
      return prev;
    });
  };

  const handleSaveSearch = () => {
    const primaryLocation = filters.locality || filters.city || filters.district || filters.state || 'All India';
    const label = `Rent | ${primaryLocation} | ${filters.propertyType === 'Any' ? 'All types' : filters.propertyType}`;
    addSavedSearch({
      label,
      targetView: 'rent',
      criteria: filters,
    });
    void trackFeatureUsage({
      featureKey: 'saved_search_applied',
      context: 'rent_marketplace',
      view: viewMode === 'map' ? 'rent-map' : 'rent',
      detail: label,
    });
    toast.success('Search saved. You can reopen it from Saved Searches.');
  };

  return (
    <section className="pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-6">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 px-6 py-6 text-white">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-semibold">Rent Property</h1>
                <p className="mt-2 text-sm text-slate-200">Find verified rental properties with clear terms and genuine owners.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-xl border border-white/20 bg-white/10 p-1 text-sm">
                  <button type="button" onClick={() => setViewMode('list')} className={`rounded-lg px-3 py-1.5 ${viewMode === 'list' ? 'bg-white text-slate-900' : 'text-slate-200'}`}>List</button>
                  <button type="button" onClick={() => setViewMode('map')} className={`rounded-lg px-3 py-1.5 ${viewMode === 'map' ? 'bg-white text-slate-900' : 'text-slate-200'}`}>Map</button>
                </div>
                <Button variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20" onClick={onOpenSaved}>
                  <Heart className="mr-2 h-4 w-4" />
                  Saved
                </Button>
                <Button
                  variant="outline"
                  className="border-white/30 bg-white/10 text-white hover:bg-white/20"
                  onClick={onOpenCompare}
                >
                  <GitCompareArrows className="mr-2 h-4 w-4" />
                  Compare ({compareCount})
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-3 px-6 py-5 sm:grid-cols-2 xl:grid-cols-3">
            <LgdLocationInput
              value={filters.state}
              onChange={(value) => setFilters((p) => ({ ...p, state: value }))}
              placeholder="State"
              className="h-11"
              suggestKind="india"
              indiaValueField="state"
            />
            <LgdLocationInput
              value={filters.district}
              onChange={(value) => setFilters((p) => ({ ...p, district: value }))}
              placeholder="District"
              className="h-11"
              suggestKind="india"
              indiaValueField="district"
            />
            <LgdLocationInput value={filters.city} onChange={(value) => setFilters((p) => ({ ...p, city: value }))} placeholder="City / Town" className="h-11" suggestKind="india" indiaValueField="village" />
            <LgdLocationInput value={filters.locality} onChange={(value) => setFilters((p) => ({ ...p, locality: value }))} placeholder="Area / Locality" className="h-11" suggestKind="india" indiaValueField="subdistrict" />
            <Select value={filters.propertyType} onValueChange={(value) => setFilters((p) => ({ ...p, propertyType: value }))}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Property Type" /></SelectTrigger>
              <SelectContent>
                {['Any', 'Apartment / Flat', 'Independent House', 'Room / PG', 'Commercial Shop', 'Office Space'].map((v) => (
                  <SelectItem key={v} value={v}>
                    {optionLabel(v, 'All property types')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Monthly Rent: INR {filters.minRent.toLocaleString('en-IN')} - INR {filters.maxRent.toLocaleString('en-IN')}</p>
              <Slider className="mt-2" min={3000} max={300000} step={500} value={[filters.minRent, filters.maxRent]} onValueChange={([min, max]) => setFilters((p) => ({ ...p, minRent: min, maxRent: max }))} />
            </div>
            <LgdLocationAccuracyNote className="sm:col-span-2 xl:col-span-3" />
            <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-3">
              <Button className="bg-slate-900 text-white hover:bg-slate-800" onClick={applyFilters}>Find Rental Property</Button>
              <Button variant="outline" className="border-slate-300" onClick={onOpenListProperty}>List Property for Rent</Button>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm xl:sticky xl:top-24 xl:self-start">
          <h2 className="text-xl font-semibold text-slate-900">Smart Filters</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Security Deposit: INR {filters.minDeposit.toLocaleString('en-IN')} - INR {filters.maxDeposit.toLocaleString('en-IN')}</p>
              <Slider className="mt-2" min={0} max={1000000} step={1000} value={[filters.minDeposit, filters.maxDeposit]} onValueChange={([min, max]) => setFilters((p) => ({ ...p, minDeposit: min, maxDeposit: max }))} />
            </div>
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Available From</p>
              <Input type="date" value={filters.availableFrom} onChange={(e) => setFilters((p) => ({ ...p, availableFrom: e.target.value }))} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Availability</p>
              <Select value={filters.availability} onValueChange={(value: FiltersState['availability']) => setFilters((p) => ({ ...p, availability: value }))}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Availability" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Any">Any timeline</SelectItem>
                  <SelectItem value="Immediate">Immediate</SelectItem>
                  <SelectItem value="Future">Future</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Tenant Preference</p>
              <Select value={filters.tenantPreference} onValueChange={(value) => setFilters((p) => ({ ...p, tenantPreference: value }))}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Tenant Preference" /></SelectTrigger>
                <SelectContent>
                  {['Any', 'Family', 'Bachelor', 'Company Lease'].map((v) => (
                    <SelectItem key={v} value={v}>{optionLabel(v, 'Any tenant')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Furnishing</p>
              <Select value={filters.furnishing} onValueChange={(value) => setFilters((p) => ({ ...p, furnishing: value }))}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Furnishing" /></SelectTrigger>
                <SelectContent>
                  {['Any', 'Fully Furnished', 'Semi Furnished', 'Unfurnished'].map((v) => (
                    <SelectItem key={v} value={v}>{optionLabel(v, 'Any furnishing')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Sort</p>
              <Select value={filters.sort} onValueChange={(value: SortKey) => setFilters((p) => ({ ...p, sort: value }))}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Sort" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="recommended">Recommended</SelectItem>
                  <SelectItem value="rent_low">Rent low to high</SelectItem>
                  <SelectItem value="rent_high">Rent high to low</SelectItem>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="verified">Verified first</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">Verified Owner / Builder<Checkbox checked={filters.verifiedOnly} onCheckedChange={(v) => setFilters((p) => ({ ...p, verifiedOnly: Boolean(v) }))} /></label>
            <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">Photos available<Checkbox checked={filters.photosOnly} onCheckedChange={(v) => setFilters((p) => ({ ...p, photosOnly: Boolean(v) }))} /></label>
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={() => { const reset = defaultFilters(); setFilters(reset); setApplied(reset); }}>Reset</Button>
            <Button className="bg-slate-900 text-white hover:bg-slate-800" onClick={applyFilters}>Apply Filters</Button>
          </div>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Quick Actions</p>
            <div className="mt-3 grid gap-2">
              <Button variant="outline" onClick={handleSaveSearch}>
                <SearchCheck className="mr-2 h-4 w-4" />
                Save Search
              </Button>
              {onOpenSavedSearches && (
                <Button variant="outline" onClick={onOpenSavedSearches}>
                  Saved Searches
                </Button>
              )}
              <Button variant="outline" onClick={onOpenSaved}>
                <Heart className="mr-2 h-4 w-4" />
                Saved Rentals
              </Button>
              <Button variant="outline" onClick={onOpenCompare}>
                <GitCompareArrows className="mr-2 h-4 w-4" />
                Open Compare ({compareCount})
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Rental Listings</h2>
            <p className="text-sm text-slate-600">{filtered.length.toLocaleString('en-IN')} matched rentals from {total.toLocaleString('en-IN')} listings</p>
            {viewMode === 'list' && filtered.length > 0 && (
              <p className="text-xs text-slate-500">
                Showing {showingFrom}-{showingTo} of {filtered.length}
              </p>
            )}
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            Safe communication, no broker pressure
          </div>
        </div>
        {activeFilterChips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {activeFilterChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => removeFilterChip(chip.key)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-300"
              >
                {chip.label} x
              </button>
            ))}
          </div>
        )}

        {loading ? <PropertyCardsSkeleton /> : error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : viewMode === 'map' ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div className="inline-flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-brand-gray2 bg-white">
                    <img src="/images/logo-mark.svg" alt="ZDT Realty logo" className="h-4 w-4 object-contain" />
                  </span>
                  <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700">
                    <MapPin className="h-3.5 w-3.5 text-brand-primary" />
                    Live Map Section
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={mapSearchQuery}
                    onChange={(event) => setMapSearchQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        handleMapSearch();
                      }
                    }}
                    placeholder="Search place or Lat, Lng"
                    className="h-8 w-[220px] bg-white text-xs"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 border-slate-300 bg-white text-xs text-slate-700"
                    onClick={handleMapSearch}
                  >
                    Search
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 border-slate-300 bg-white text-xs text-slate-700"
                    onClick={handleUseCurrentLocation}
                    disabled={locatingCurrentPosition}
                  >
                    {locatingCurrentPosition ? 'Locating...' : 'Use current location'}
                  </Button>
                  <span className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-600">
                    Focus: {mapFocusLabel}
                  </span>
                </div>
              </div>
              <iframe
                title={`Rent properties map for ${mapFocusLabel}`}
                src={liveMapUrl}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="h-[520px] w-full border-0"
              />
            </div>
            <aside className="max-h-[520px] space-y-3 overflow-auto pr-1">
              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">Nearby Rentals</p>
                <p className="mt-1 text-xs text-slate-500">Ranked by selected location filters.</p>
              </div>
              {nearbyRentals.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
                  No rentals match current filters. Clear filters to see rentals on map.
                </div>
              ) : (
                nearbyRentals.map((r) => <button key={`map-${r.id}`} type="button" onClick={() => onOpenDetails(String(r.id))} className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-slate-300"><p className="truncate text-sm font-semibold text-slate-900">{r.title}</p><p className="text-xs text-slate-500">{r.locality || r.city}</p><p className="mt-1 text-sm font-semibold text-slate-900">{fmt(r.monthlyRent, '/mo')}</p></button>)
              )}
            </aside>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">No rentals match your selected filters.</div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{pagedRentals.map((rental) => <RentalCard key={rental.id} rental={rental} onOpenDetails={onOpenDetails} onOpenMessages={onOpenMessages} onOpenCompare={onOpenCompare} />)}</div>
            {totalPages > 1 && (
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Prev
                </Button>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                  Page {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
        </div>
        </div>

        <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">ZDT Realty is an independent real estate platform focused on transparent and verified rental listings.</p>
      </div>
    </section>
  );
}

function RentalCard({ rental, onOpenDetails, onOpenMessages, onOpenCompare }: { rental: RentalListing; onOpenDetails: (propertyId: string) => void; onOpenMessages: (propertyReference?: string) => void; onOpenCompare?: () => void; }) {
  const referenceId = String(rental.id);
  const [saved, setSaved] = useState(() => isSavedRental(referenceId));
  const [compared, setCompared] = useState(() => isCompared(referenceId));
  const ownerName = rental.ownerName || rental.builderName || rental.companyName || 'Owner / Builder';
  const available = rental.availableFrom
    ? Number.isNaN(new Date(rental.availableFrom).getTime())
      ? 'Immediate'
      : new Date(rental.availableFrom).toLocaleDateString('en-IN')
    : 'Immediate';
  const area = rental.carpetArea || rental.builtupArea || 0;

  useEffect(() => {
    const sync = () => setSaved(isSavedRental(referenceId));
    const onStorage = (event: StorageEvent) => { if (event.key && event.key !== 'zdt_saved_rentals') return; sync(); };
    sync();
    window.addEventListener('storage', onStorage);
    window.addEventListener(SAVED_RENTALS_CHANGED_EVENT, sync);
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener(SAVED_RENTALS_CHANGED_EVENT, sync); };
  }, [referenceId]);

  useEffect(() => {
    const sync = () => setCompared(isCompared(referenceId));
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== 'zdt_compared_listings') return;
      sync();
    };
    sync();
    window.addEventListener('storage', onStorage);
    window.addEventListener(COMPARE_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(COMPARE_CHANGED_EVENT, sync);
    };
  }, [referenceId]);

  const toggleSave = () => {
    if (saved) {
      removeSavedRental(referenceId);
      setSaved(false);
      toast.success('Removed from saved rentals');
      return;
    }
    upsertSavedRental({
      id: referenceId,
      title: rental.title,
      image: rental.primaryImage || '/images/property-1.jpg',
      city: rental.city,
      locality: rental.locality,
      monthlyRentLabel: fmt(rental.monthlyRent, '/mo'),
      bhk: rental.bhk ? `${rental.bhk} BHK` : rental.propertyType || 'Rental',
      furnishedStatus: rental.furnishedStatus || 'Furnishing on request',
      availableFrom: rental.availableFrom || '',
    });
    setSaved(true);
    toast.success('Saved rental');
  };

  const toggleCompare = () => {
    if (compared) {
      removeComparedListing(referenceId);
      setCompared(false);
      toast.success('Removed from compare');
      return;
    }

    upsertComparedListing({
      id: referenceId,
      referenceId,
      title: rental.title,
      image: rental.primaryImage || '/images/property-1.jpg',
      city: rental.city,
      area: rental.locality || rental.area || '',
      priceLabel: fmt(rental.monthlyRent, '/mo'),
      areaLabel: area > 0 ? `${area} sq.ft` : 'Area on request',
      propertyType: rental.propertyType || 'Rental',
      bhk: rental.bhk ? `${rental.bhk} BHK` : rental.propertyType || 'Rental',
      mainDoorFacing: 'NA',
      vastuScore: 0,
      verified: rental.isVerified,
      ownerPhone: 'Hidden',
      updatedAt: new Date().toISOString(),
    });
    setCompared(true);
    toast.success('Added to compare');
  };

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative">
        <img src={rental.primaryImage || '/images/property-1.jpg'} alt={rental.title} className="h-48 w-full object-cover" loading="lazy" />
        {rental.isVerified && <Badge className="absolute left-3 top-3 bg-emerald-600 text-white hover:bg-emerald-600"><BadgeCheck className="mr-1 h-3.5 w-3.5" />Verified</Badge>}
      </div>
      <div className="space-y-3 p-4">
        <h3 className="line-clamp-2 text-base font-semibold text-slate-900">{rental.title}</h3>
        <p className="inline-flex items-center gap-1 text-xs text-slate-600"><MapPin className="h-3.5 w-3.5 text-slate-500" />{rental.locality || rental.city}</p>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-lg font-semibold text-slate-900">{fmt(rental.monthlyRent, '/mo')}</p>
          <p className="text-xs text-slate-600">Security Deposit: {fmt(rental.securityDeposit)}</p>
        </div>
        <div className="text-xs text-slate-600">
          <p>{area > 0 ? `${area} sq.ft` : 'Area on request'} - {rental.bhk ? `${rental.bhk} BHK` : rental.propertyType || 'Rental'}</p>
          <p>{rental.furnishedStatus || 'Furnishing on request'}</p>
          <p>Available from {available}</p>
          <p>{ownerName}</p>
        </div>
        {rental.isVerified && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" />Verified Owner / Builder</span>}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Button className="h-10 bg-slate-900 text-white hover:bg-slate-800" onClick={() => onOpenDetails(referenceId)}>View Details</Button>
          <Button variant="outline" className="h-10 border-slate-300" onClick={() => onOpenMessages(referenceId)}><MessageCircle className="mr-1 h-3.5 w-3.5" />Contact Owner</Button>
          <Button variant="outline" className={`h-10 border-slate-300 ${compared ? 'text-blue-700' : ''}`} onClick={toggleCompare}><GitCompareArrows className="mr-1 h-3.5 w-3.5" />{compared ? 'Compared' : 'Compare'}</Button>
          <Button variant="outline" className={`h-10 border-slate-300 ${saved ? 'text-rose-600' : ''}`} onClick={toggleSave}><Heart className={`mr-1 h-3.5 w-3.5 ${saved ? 'fill-current' : ''}`} />{saved ? 'Saved' : 'Save'}</Button>
        </div>
        {compared && <button type="button" onClick={onOpenCompare} className="w-full rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:border-blue-300">Open compare board</button>}
      </div>
    </article>
  );
}
