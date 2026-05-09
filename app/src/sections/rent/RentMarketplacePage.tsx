import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Car,
  ChevronLeft,
  ChevronRight,
  Filter,
  GitCompareArrows,
  Heart,
  MapPin,
  MessageCircle,
  PawPrint,
  PhoneCall,
  SearchCheck,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/http';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { PropertyCardsSkeleton } from '@/components/loading/PageSkeletons';
import EmptyState from '@/components/ui/EmptyState';
import { LgdLocationAccuracyNote, LgdLocationInput } from '@/components/realty/LgdLocationInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Drawer, DrawerClose, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { trackFeatureUsage } from '@/lib/featureUsageApi';
import { SAVED_RENTALS_CHANGED_EVENT, isSavedRental, removeSavedRental, upsertSavedRental } from '@/lib/rentalsSavedStore';
import {
  COMPARE_CHANGED_EVENT,
  isCompared,
  readComparedListings,
  removeComparedListing,
  upsertComparedListing,
} from '@/lib/compareStore';
import { addSavedSearch } from '@/lib/savedSearchStore';
import { applySeo } from '@/lib/seo';
import { openPhoneDialer } from '@/lib/phone';

interface RentMarketplacePageProps {
  onOpenDetails: (propertyId: string) => void;
  onOpenSaved: () => void;
  onOpenMessages: (propertyReference?: string) => void;
  onOpenListProperty: () => void;
  onOpenDashboard?: () => void;
  onOpenOwnerDashboard?: () => void;
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
  preferredTenant?: string;
  parking?: string;
  petsAllowed?: boolean;
  availableFrom: string;
  ownerName?: string;
  builderName?: string;
  companyName?: string;
  publicContactPhone?: string;
  imageUrls?: string[];
  isVerified: boolean;
  primaryImage: string;
}

type SortKey = 'relevance' | 'rent_low' | 'rent_high' | 'newest' | 'immediate';
type ViewMode = 'list' | 'map';
type GeoPoint = { latitude: number; longitude: number };
type AvailabilityFilter = 'Any' | 'Immediate' | 'FromDate';
type BHKFilter = 'Any' | '1' | '2' | '3' | '4+';
type ParkingFilter = 'Any' | 'Yes' | 'No';
type PetsFilter = 'Any' | 'Yes' | 'No';

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
  bhk: BHKFilter;
  availableFrom: string;
  availability: AvailabilityFilter;
  tenantPreference: string;
  furnishing: string;
  parking: ParkingFilter;
  petsAllowed: PetsFilter;
  verifiedOnly: boolean;
  photosOnly: boolean;
  sort: SortKey;
};

const RENT_API_MAX_LIMIT = 60;
const RECENT_RENT_LOCATIONS_KEY = 'zdt_recent_rent_locations';

const defaultFilters = (): FiltersState => {
  return {
    state: '',
    district: '',
    city: '',
    locality: '',
    propertyType: 'Any',
    minRent: 4000,
    maxRent: 150000,
    minDeposit: 0,
    maxDeposit: 500000,
    bhk: 'Any',
    availableFrom: '',
    availability: 'Any',
    tenantPreference: 'Any',
    furnishing: 'Any',
    parking: 'Any',
    petsAllowed: 'Any',
    verifiedOnly: false,
    photosOnly: false,
    sort: 'relevance',
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

function readRecentLocations(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_RENT_LOCATIONS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === 'string').slice(0, 5) : [];
  } catch {
    return [];
  }
}

function saveRecentLocation(label: string): string[] {
  const normalizedLabel = String(label || '').trim();
  if (!normalizedLabel || typeof window === 'undefined') return readRecentLocations();
  const next = [normalizedLabel, ...readRecentLocations().filter((entry) => entry !== normalizedLabel)].slice(0, 5);
  window.localStorage.setItem(RECENT_RENT_LOCATIONS_KEY, JSON.stringify(next));
  return next;
}

function parseDateOrNull(value: string): Date | null {
  const date = new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isImmediateAvailability(value: string): boolean {
  const date = parseDateOrNull(value);
  if (!date) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date <= today;
}

function getAvailabilitySortValue(value: string): number {
  const date = parseDateOrNull(value);
  if (!date) return Number.MIN_SAFE_INTEGER;
  return Number(date);
}

function matchesPropertyType(rental: RentalListing, selected: string): boolean {
  if (selected === 'Any') return true;
  const typeText = normalize(rental.propertyType || '');
  if (selected === 'Apartment') return typeText.includes('apartment') || typeText.includes('flat');
  if (selected === 'Independent House') return typeText.includes('independent') || typeText.includes('house') || typeText.includes('villa');
  if (selected === 'PG') return typeText.includes('pg') || typeText.includes('room');
  if (selected === 'Commercial') return typeText.includes('commercial') || typeText.includes('shop') || typeText.includes('office');
  return true;
}

function matchesBhk(rental: RentalListing, selected: BHKFilter): boolean {
  if (selected === 'Any') return true;
  if (rental.bhk === null || rental.bhk === undefined) return true;
  if (selected === '4+') return rental.bhk >= 4;
  return rental.bhk === Number(selected);
}

function matchesTenantPreference(rental: RentalListing, selected: string): boolean {
  if (selected === 'Any') return true;
  const preferenceText = normalize(rental.tenantPreference || rental.preferredTenant || '');
  if (!preferenceText) return true;
  if (selected === 'Anyone') return preferenceText.includes('any') || preferenceText.includes('both');
  return preferenceText.includes(normalize(selected));
}

function matchesParking(rental: RentalListing, selected: ParkingFilter): boolean {
  if (selected === 'Any') return true;
  const parkingText = normalize(rental.parking || '');
  if (!parkingText) return true;
  if (selected === 'Yes') return parkingText.includes('yes') || parkingText.includes('available') || parkingText.includes('covered') || parkingText.includes('open');
  return parkingText.includes('no') || parkingText.includes('none') || parkingText.includes('na');
}

function matchesPets(rental: RentalListing, selected: PetsFilter): boolean {
  if (selected === 'Any') return true;
  if (typeof rental.petsAllowed !== 'boolean') return true;
  return selected === 'Yes' ? rental.petsAllowed : !rental.petsAllowed;
}

function getLocationLabelFromFilters(criteria: FiltersState): string {
  return [criteria.locality, criteria.city, criteria.district, criteria.state]
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .join(', ');
}

function parseRecentLocationLabel(label: string): Partial<FiltersState> {
  const parts = String(label || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (parts.length === 0) return {};
  return {
    locality: parts[0] || '',
    city: parts[1] || '',
    district: parts[2] || '',
    state: parts[3] || '',
  };
}

export default function RentMarketplacePage({
  onOpenDetails,
  onOpenSaved,
  onOpenMessages,
  onOpenListProperty,
  onOpenDashboard,
  onOpenOwnerDashboard,
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
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [recentLocations, setRecentLocations] = useState<string[]>(() => readRecentLocations());
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
    const cityLabel = applied.city.trim();
    const titlePrefix = cityLabel ? `Rent Property in ${cityLabel}` : 'Rent Property';
    const description = cityLabel
      ? `Browse verified rental listings in ${cityLabel} with filters for budget, availability, furnishing, and tenant preference.`
      : 'Browse verified rental listings with filters for budget, availability, furnishing, and tenant preference.';

    applySeo({
      title: `${titlePrefix} | ZDT Realty`,
      description,
      canonicalPath: '/rent',
      type: 'website',
    });
  }, [applied.city]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    const apiSort =
      applied.sort === 'relevance'
        ? 'recommended'
        : applied.sort === 'immediate'
          ? 'newest'
          : applied.sort;
    params.set('limit', String(RENT_API_MAX_LIMIT));
    params.set('sort', apiSort);
    if (applied.state.trim()) params.set('state', applied.state.trim());
    if (applied.district.trim()) params.set('district', applied.district.trim());
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
      const selectedDate = parseDateOrNull(applied.availableFrom);
      const rentalDate = parseDateOrNull(rental.availableFrom);
      const availableByDate = !selectedDate || !rentalDate || rentalDate <= selectedDate;
      const matchesAvailability =
        applied.availability === 'Any'
          ? true
          : applied.availability === 'Immediate'
            ? isImmediateAvailability(rental.availableFrom)
            : availableByDate;

      const minRentOk = !rental.monthlyRent || rental.monthlyRent >= applied.minRent;
      const maxRentOk = !rental.monthlyRent || rental.monthlyRent <= applied.maxRent;
      const minDepOk = !rental.securityDeposit || rental.securityDeposit >= applied.minDeposit;
      const maxDepOk = !rental.securityDeposit || rental.securityDeposit <= applied.maxDeposit;

      return (
        (!applied.state || stateText.includes(normalize(applied.state))) &&
        (!applied.district || districtText.includes(normalize(applied.district))) &&
        (!applied.city || cityText.includes(normalize(applied.city))) &&
        (!applied.locality || localityText.includes(normalize(applied.locality))) &&
        matchesPropertyType(rental, applied.propertyType) &&
        matchesBhk(rental, applied.bhk) &&
        matchesTenantPreference(rental, applied.tenantPreference) &&
        (applied.furnishing === 'Any' || normalize(rental.furnishedStatus).includes(normalize(applied.furnishing.split(' ')[0]))) &&
        matchesAvailability &&
        minRentOk &&
        maxRentOk &&
        minDepOk &&
        maxDepOk &&
        matchesParking(rental, applied.parking) &&
        matchesPets(rental, applied.petsAllowed) &&
        (!applied.verifiedOnly || rental.isVerified) &&
        (!applied.photosOnly || hasPhotos)
      );
    });

    const focusTokens = [applied.locality, applied.city, applied.district, applied.state]
      .map((entry) => normalize(entry))
      .filter(Boolean);
    const scoreRental = (rental: RentalListing) => {
      const haystack = normalize(
        [rental.locality, rental.area, rental.city, rental.state].filter(Boolean).join(' ')
      );
      return focusTokens.reduce((score, token) => (haystack.includes(token) ? score + 1 : score), 0);
    };

    if (applied.sort === 'rent_low') return [...list].sort((a, b) => Number(a.monthlyRent || 0) - Number(b.monthlyRent || 0));
    if (applied.sort === 'rent_high') return [...list].sort((a, b) => Number(b.monthlyRent || 0) - Number(a.monthlyRent || 0));
    if (applied.sort === 'newest') return [...list].sort((a, b) => Number(b.id) - Number(a.id));
    if (applied.sort === 'immediate') {
      return [...list].sort((a, b) => {
        const immediateDiff = Number(isImmediateAvailability(b.availableFrom)) - Number(isImmediateAvailability(a.availableFrom));
        if (immediateDiff !== 0) return immediateDiff;
        return getAvailabilitySortValue(a.availableFrom) - getAvailabilitySortValue(b.availableFrom);
      });
    }
    if (focusTokens.length === 0) return list;
    return [...list].sort((a, b) => {
      const scoreDiff = scoreRental(b) - scoreRental(a);
      if (scoreDiff !== 0) return scoreDiff;
      return Number(b.id) - Number(a.id);
    });
  }, [applied, rentals]);

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
    const parts = [applied.locality, applied.city, applied.district, applied.state]
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
    return parts.join(', ') || 'India';
  }, [applied.locality, applied.city, applied.district, applied.state]);

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
    const focusTokens = [applied.locality, applied.city, applied.district, applied.state]
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
  }, [applied.locality, applied.city, applied.district, applied.state, filtered]);

  const nearbyAreaSuggestions = useMemo(() => {
    const preferredCity = normalize(filters.city || applied.city);
    const counts = new Map<string, number>();
    rentals.forEach((rental) => {
      if (preferredCity && normalize(rental.city) !== preferredCity) return;
      const localityName = String(rental.locality || rental.area || '').trim();
      if (!localityName) return;
      counts.set(localityName, (counts.get(localityName) || 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
      .filter((name) => normalize(name) !== normalize(filters.locality))
      .slice(0, 6);
  }, [applied.city, filters.city, filters.locality, rentals]);

  const applyFilters = (closeMobile = false) => {
    if (filters.minRent > filters.maxRent) return toast.error('Minimum rent cannot be greater than maximum rent.');
    if (filters.minDeposit > filters.maxDeposit) return toast.error('Minimum deposit cannot be greater than maximum deposit.');
    setApplied(filters);
    setPage(1);
    if (closeMobile) setMobileFiltersOpen(false);

    const locationLabel = getLocationLabelFromFilters(filters);
    if (locationLabel) setRecentLocations(saveRecentLocation(locationLabel));

    void trackFeatureUsage({
      featureKey: 'rent_filters_applied',
      context: 'rent_marketplace',
      view: viewMode === 'map' ? 'rent-map' : 'rent',
      detail: `city=${filters.city || '-'};locality=${filters.locality || '-'};type=${filters.propertyType};sort=${filters.sort}`,
    });
  };

  const resetFilters = () => {
    const reset = defaultFilters();
    setFilters(reset);
    setApplied(reset);
    setPage(1);
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
  }, [applied, viewMode]);

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
    const chips: Array<{ key: keyof FiltersState | 'rentBand' | 'depositBand'; label: string }> = [];
    if (applied.state.trim()) chips.push({ key: 'state', label: `State: ${applied.state.trim()}` });
    if (applied.district.trim()) chips.push({ key: 'district', label: `District: ${applied.district.trim()}` });
    if (applied.city.trim()) chips.push({ key: 'city', label: `City: ${applied.city.trim()}` });
    if (applied.locality.trim()) chips.push({ key: 'locality', label: `Locality: ${applied.locality.trim()}` });
    if (applied.propertyType !== 'Any') chips.push({ key: 'propertyType', label: applied.propertyType });
    if (applied.bhk !== 'Any') chips.push({ key: 'bhk', label: `${applied.bhk} BHK` });
    if (applied.availability !== 'Any') chips.push({ key: 'availability', label: `Availability: ${applied.availability}` });
    if (applied.tenantPreference !== 'Any') chips.push({ key: 'tenantPreference', label: `Tenant: ${applied.tenantPreference}` });
    if (applied.furnishing !== 'Any') chips.push({ key: 'furnishing', label: applied.furnishing });
    if (applied.parking !== 'Any') chips.push({ key: 'parking', label: `Parking: ${applied.parking}` });
    if (applied.petsAllowed !== 'Any') chips.push({ key: 'petsAllowed', label: `Pets: ${applied.petsAllowed}` });
    if (applied.verifiedOnly) chips.push({ key: 'verifiedOnly', label: 'Owner Verified' });
    if (applied.photosOnly) chips.push({ key: 'photosOnly', label: 'Photos only' });

    const reset = defaultFilters();
    if (applied.minRent !== reset.minRent || applied.maxRent !== reset.maxRent) {
      chips.push({
        key: 'rentBand',
        label: `Rent: INR ${applied.minRent.toLocaleString('en-IN')} - INR ${applied.maxRent.toLocaleString('en-IN')}`,
      });
    }
    if (applied.minDeposit !== reset.minDeposit || applied.maxDeposit !== reset.maxDeposit) {
      chips.push({
        key: 'depositBand',
        label: `Deposit: INR ${applied.minDeposit.toLocaleString('en-IN')} - INR ${applied.maxDeposit.toLocaleString('en-IN')}`,
      });
    }
    return chips;
  }, [applied]);

  const removeFilterChip = (key: keyof FiltersState | 'rentBand' | 'depositBand') => {
    const reset = defaultFilters();
    setApplied((prev) => {
      if (key === 'rentBand') return { ...prev, minRent: reset.minRent, maxRent: reset.maxRent };
      if (key === 'depositBand') return { ...prev, minDeposit: reset.minDeposit, maxDeposit: reset.maxDeposit };
      if (key === 'state') return { ...prev, state: '' };
      if (key === 'district') return { ...prev, district: '' };
      if (key === 'city') return { ...prev, city: '' };
      if (key === 'locality') return { ...prev, locality: '' };
      if (key === 'propertyType') return { ...prev, propertyType: 'Any' };
      if (key === 'bhk') return { ...prev, bhk: 'Any' };
      if (key === 'availability') return { ...prev, availability: 'Any', availableFrom: '' };
      if (key === 'tenantPreference') return { ...prev, tenantPreference: 'Any' };
      if (key === 'furnishing') return { ...prev, furnishing: 'Any' };
      if (key === 'parking') return { ...prev, parking: 'Any' };
      if (key === 'petsAllowed') return { ...prev, petsAllowed: 'Any' };
      if (key === 'verifiedOnly') return { ...prev, verifiedOnly: false };
      if (key === 'photosOnly') return { ...prev, photosOnly: false };
      return prev;
    });
    setFilters((prev) => {
      if (key === 'rentBand') return { ...prev, minRent: reset.minRent, maxRent: reset.maxRent };
      if (key === 'depositBand') return { ...prev, minDeposit: reset.minDeposit, maxDeposit: reset.maxDeposit };
      if (key === 'state') return { ...prev, state: '' };
      if (key === 'district') return { ...prev, district: '' };
      if (key === 'city') return { ...prev, city: '' };
      if (key === 'locality') return { ...prev, locality: '' };
      if (key === 'propertyType') return { ...prev, propertyType: 'Any' };
      if (key === 'bhk') return { ...prev, bhk: 'Any' };
      if (key === 'availability') return { ...prev, availability: 'Any', availableFrom: '' };
      if (key === 'tenantPreference') return { ...prev, tenantPreference: 'Any' };
      if (key === 'furnishing') return { ...prev, furnishing: 'Any' };
      if (key === 'parking') return { ...prev, parking: 'Any' };
      if (key === 'petsAllowed') return { ...prev, petsAllowed: 'Any' };
      if (key === 'verifiedOnly') return { ...prev, verifiedOnly: false };
      if (key === 'photosOnly') return { ...prev, photosOnly: false };
      return prev;
    });
  };

  const handleSaveSearch = () => {
    const primaryLocation = applied.locality || applied.city || applied.district || applied.state || 'All India';
    const label = `Rent | ${primaryLocation} | ${applied.propertyType === 'Any' ? 'All types' : applied.propertyType}`;
    addSavedSearch({
      label,
      targetView: 'rent',
      criteria: applied,
    });
    void trackFeatureUsage({
      featureKey: 'saved_search_applied',
      context: 'rent_marketplace',
      view: viewMode === 'map' ? 'rent-map' : 'rent',
      detail: label,
    });
    toast.success('Search saved. You can reopen it from Saved Searches.');
  };

  const handleUseRecentLocation = (label: string) => {
    const nextLocation = parseRecentLocationLabel(label);
    setFilters((prev) => ({ ...prev, ...nextLocation }));
  };

  return (
    <section className="portal-mobile-page pb-16 pt-28 text-slate-900">
      <div className="page-container portal-mobile-stack space-y-6">
        <div className="portal-mobile-panel overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-gradient-to-r from-sky-900 via-blue-800 to-sky-700 px-6 py-8 text-white">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <h1 className="text-3xl font-semibold">Find Verified Rental Homes You Can Trust</h1>
                <p className="mt-2 text-sm text-sky-100">Browse genuine rental properties from verified owners and builders. No confusion. No fake listings.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button className="bg-white text-slate-900 hover:bg-slate-100" onClick={() => { setViewMode('list'); applyFilters(); }}>
                  Browse Rentals
                </Button>
                <Button variant="outline" className="border-white/40 bg-white/10 text-white hover:bg-white/20" onClick={onOpenListProperty}>
                  List Property for Rent
                </Button>
              </div>
            </div>
            <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
              <span className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/10 px-3 py-1">
                <BadgeCheck className="h-3.5 w-3.5 text-emerald-200" />
                Owner Verified
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/10 px-3 py-1">
                <UserCheck className="h-3.5 w-3.5 text-emerald-200" />
                Genuine Tenant Leads
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/10 px-3 py-1">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-200" />
                Transparent Rental Process
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="border-white/40 bg-white/10 text-white hover:bg-white/20" onClick={onOpenDashboard} disabled={!onOpenDashboard}>
                Tenant Dashboard
              </Button>
              <Button size="sm" variant="outline" className="border-white/40 bg-white/10 text-white hover:bg-white/20" onClick={onOpenOwnerDashboard} disabled={!onOpenOwnerDashboard}>
                Owner Dashboard
              </Button>
            </div>
          </div>

          <div className="grid gap-3 px-6 py-5 sm:grid-cols-2 xl:grid-cols-4">
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
            <LgdLocationInput value={filters.city} onChange={(value) => setFilters((p) => ({ ...p, city: value }))} placeholder="City" className="h-11" suggestKind="india" indiaValueField="village" />
            <LgdLocationInput value={filters.locality} onChange={(value) => setFilters((p) => ({ ...p, locality: value }))} placeholder="Nearby Area / Locality" className="h-11" suggestKind="india" indiaValueField="subdistrict" />
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Monthly Rent: INR {filters.minRent.toLocaleString('en-IN')} - INR {filters.maxRent.toLocaleString('en-IN')}</p>
              <Slider className="mt-2" min={3000} max={300000} step={500} value={[filters.minRent, filters.maxRent]} onValueChange={([min, max]) => setFilters((p) => ({ ...p, minRent: min, maxRent: max }))} />
            </div>
            <Select value={filters.propertyType} onValueChange={(value) => setFilters((p) => ({ ...p, propertyType: value }))}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Property Type" /></SelectTrigger>
              <SelectContent>
                {['Any', 'Apartment', 'Independent House', 'PG', 'Commercial'].map((v) => (
                  <SelectItem key={v} value={v}>
                    {optionLabel(v, 'All property types')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.sort} onValueChange={(value: SortKey) => setFilters((p) => ({ ...p, sort: value }))}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Sort" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="relevance">Relevance</SelectItem>
                <SelectItem value="rent_low">Rent: Low to High</SelectItem>
                <SelectItem value="rent_high">Rent: High to Low</SelectItem>
                <SelectItem value="newest">Newest Listings</SelectItem>
                <SelectItem value="immediate">Immediate Availability</SelectItem>
              </SelectContent>
            </Select>
            <LgdLocationAccuracyNote className="sm:col-span-2 xl:col-span-4" />

            {nearbyAreaSuggestions.length > 0 && (
              <div className="sm:col-span-2 xl:col-span-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Nearby Areas</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {nearbyAreaSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setFilters((p) => ({ ...p, locality: suggestion }))}
                      className="portal-mobile-chip rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-300"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {recentLocations.length > 0 && (
              <div className="sm:col-span-2 xl:col-span-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Recent Searches</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {recentLocations.map((entry) => (
                    <button
                      key={entry}
                      type="button"
                      onClick={() => handleUseRecentLocation(entry)}
                      className="portal-mobile-chip rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700 transition hover:border-slate-300 hover:bg-white"
                    >
                      {entry}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-4">
              <Button className="bg-slate-900 text-white hover:bg-slate-800" onClick={() => { setViewMode('list'); applyFilters(); }}>Browse Rentals</Button>
              <Button variant="outline" className="border-slate-300" onClick={onOpenListProperty}>List Property for Rent</Button>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm xl:sticky xl:top-24 xl:block xl:self-start">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Smart Filters</h2>
            <SlidersHorizontal className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Security Deposit: INR {filters.minDeposit.toLocaleString('en-IN')} - INR {filters.maxDeposit.toLocaleString('en-IN')}</p>
              <Slider className="mt-2" min={0} max={1000000} step={1000} value={[filters.minDeposit, filters.maxDeposit]} onValueChange={([min, max]) => setFilters((p) => ({ ...p, minDeposit: min, maxDeposit: max }))} />
            </div>
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">BHK</p>
              <Select value={filters.bhk} onValueChange={(value: BHKFilter) => setFilters((p) => ({ ...p, bhk: value }))}>
                <SelectTrigger className="h-10"><SelectValue placeholder="BHK" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Any">Any</SelectItem>
                  <SelectItem value="1">1 BHK</SelectItem>
                  <SelectItem value="2">2 BHK</SelectItem>
                  <SelectItem value="3">3 BHK</SelectItem>
                  <SelectItem value="4+">4+ BHK</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Furnishing</p>
              <Select value={filters.furnishing} onValueChange={(value) => setFilters((p) => ({ ...p, furnishing: value }))}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Furnishing" /></SelectTrigger>
                <SelectContent>
                  {['Any', 'Unfurnished', 'Semi Furnished', 'Fully Furnished'].map((v) => (
                    <SelectItem key={v} value={v}>{optionLabel(v, 'Any furnishing')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Preferred Tenant</p>
              <Select value={filters.tenantPreference} onValueChange={(value) => setFilters((p) => ({ ...p, tenantPreference: value }))}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Preferred Tenant" /></SelectTrigger>
                <SelectContent>
                  {['Any', 'Family', 'Bachelor', 'Anyone'].map((v) => (
                    <SelectItem key={v} value={v}>{optionLabel(v, 'Any tenant')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Parking</p>
              <Select value={filters.parking} onValueChange={(value: ParkingFilter) => setFilters((p) => ({ ...p, parking: value }))}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Parking" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Any">Any</SelectItem>
                  <SelectItem value="Yes">Available</SelectItem>
                  <SelectItem value="No">Not required</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Pets Allowed</p>
              <Select value={filters.petsAllowed} onValueChange={(value: PetsFilter) => setFilters((p) => ({ ...p, petsAllowed: value }))}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Pets Allowed" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Any">Any</SelectItem>
                  <SelectItem value="Yes">Yes</SelectItem>
                  <SelectItem value="No">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Availability</p>
              <Select value={filters.availability} onValueChange={(value: FiltersState['availability']) => setFilters((p) => ({ ...p, availability: value }))}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Availability" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Any">Any</SelectItem>
                  <SelectItem value="Immediate">Immediate</SelectItem>
                  <SelectItem value="FromDate">From date</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Available From</p>
              <Input type="date" value={filters.availableFrom} onChange={(e) => setFilters((p) => ({ ...p, availableFrom: e.target.value }))} className="h-10" />
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">Owner Verified<Checkbox checked={filters.verifiedOnly} onCheckedChange={(v) => setFilters((p) => ({ ...p, verifiedOnly: Boolean(v) }))} /></label>
            <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">Photos available<Checkbox checked={filters.photosOnly} onCheckedChange={(v) => setFilters((p) => ({ ...p, photosOnly: Boolean(v) }))} /></label>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Button variant="outline" onClick={resetFilters}>Reset</Button>
            <Button className="bg-slate-900 text-white hover:bg-slate-800" onClick={() => applyFilters()}>Apply Filters</Button>
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
              <Button variant="outline" onClick={onOpenCompare} disabled={!onOpenCompare}>
                <GitCompareArrows className="mr-2 h-4 w-4" />
                Compare ({compareCount})
              </Button>
              <Button variant="outline" onClick={onOpenDashboard} disabled={!onOpenDashboard}>
                Tenant Dashboard
              </Button>
              <Button variant="outline" onClick={onOpenOwnerDashboard} disabled={!onOpenOwnerDashboard}>
                Owner Dashboard
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
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 text-sm">
              <button type="button" onClick={() => setViewMode('list')} className={`rounded-lg px-3 py-1.5 ${viewMode === 'list' ? 'bg-slate-900 text-white' : 'text-slate-700'}`}>List</button>
              <button type="button" onClick={() => setViewMode('map')} className={`rounded-lg px-3 py-1.5 ${viewMode === 'map' ? 'bg-slate-900 text-white' : 'text-slate-700'}`}>Map</button>
            </div>
            <Drawer open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
              <DrawerTrigger asChild>
                <Button variant="outline" className="xl:hidden">
                  <Filter className="mr-2 h-4 w-4" />
                  Filters & Sort
                </Button>
              </DrawerTrigger>
              <DrawerContent className="max-h-[90vh]">
                <DrawerHeader>
                  <DrawerTitle>Filters & Sort</DrawerTitle>
                </DrawerHeader>
                <div className="space-y-4 overflow-y-auto px-4 pb-6">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Security Deposit: INR {filters.minDeposit.toLocaleString('en-IN')} - INR {filters.maxDeposit.toLocaleString('en-IN')}</p>
                    <Slider className="mt-2" min={0} max={1000000} step={1000} value={[filters.minDeposit, filters.maxDeposit]} onValueChange={([min, max]) => setFilters((p) => ({ ...p, minDeposit: min, maxDeposit: max }))} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">BHK</p>
                      <Select value={filters.bhk} onValueChange={(value: BHKFilter) => setFilters((p) => ({ ...p, bhk: value }))}>
                        <SelectTrigger className="h-10"><SelectValue placeholder="BHK" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Any">Any</SelectItem>
                          <SelectItem value="1">1 BHK</SelectItem>
                          <SelectItem value="2">2 BHK</SelectItem>
                          <SelectItem value="3">3 BHK</SelectItem>
                          <SelectItem value="4+">4+ BHK</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Parking</p>
                      <Select value={filters.parking} onValueChange={(value: ParkingFilter) => setFilters((p) => ({ ...p, parking: value }))}>
                        <SelectTrigger className="h-10"><SelectValue placeholder="Parking" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Any">Any</SelectItem>
                          <SelectItem value="Yes">Available</SelectItem>
                          <SelectItem value="No">Not required</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Pets Allowed</p>
                      <Select value={filters.petsAllowed} onValueChange={(value: PetsFilter) => setFilters((p) => ({ ...p, petsAllowed: value }))}>
                        <SelectTrigger className="h-10"><SelectValue placeholder="Pets Allowed" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Any">Any</SelectItem>
                          <SelectItem value="Yes">Yes</SelectItem>
                          <SelectItem value="No">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Availability</p>
                      <Select value={filters.availability} onValueChange={(value: FiltersState['availability']) => setFilters((p) => ({ ...p, availability: value }))}>
                        <SelectTrigger className="h-10"><SelectValue placeholder="Availability" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Any">Any</SelectItem>
                          <SelectItem value="Immediate">Immediate</SelectItem>
                          <SelectItem value="FromDate">From date</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button variant="outline" onClick={resetFilters}>Reset</Button>
                    <Button className="bg-slate-900 text-white hover:bg-slate-800" onClick={() => applyFilters(true)}>Apply Filters</Button>
                  </div>
                  <DrawerClose asChild>
                    <Button variant="outline">Close</Button>
                  </DrawerClose>
                </div>
              </DrawerContent>
            </Drawer>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Safe communication, no broker pressure
            </div>
          </div>
        </div>
        {activeFilterChips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {activeFilterChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => removeFilterChip(chip.key)}
                className="portal-mobile-chip rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-300"
              >
                {chip.label} x
              </button>
            ))}
          </div>
        )}

        {loading ? <PropertyCardsSkeleton /> : error ? <div className="portal-mobile-card rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : viewMode === 'map' ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="portal-mobile-panel overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
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
              <div className="portal-mobile-card rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">Nearby Rentals</p>
                <p className="mt-1 text-xs text-slate-500">Ranked by selected location filters.</p>
              </div>
              {nearbyRentals.length === 0 ? (
                <div className="portal-mobile-card rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
                  No rentals match current filters. Clear filters to see rentals on map.
                </div>
              ) : (
                nearbyRentals.map((r) => <button key={`map-${r.id}`} type="button" onClick={() => onOpenDetails(String(r.id))} className="portal-mobile-card w-full rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-slate-300"><p className="truncate text-sm font-semibold text-slate-900">{r.title}</p><p className="text-xs text-slate-500">{r.locality || r.city}</p><p className="mt-1 text-sm font-semibold text-slate-900">{fmt(r.monthlyRent, '/mo')}</p></button>)
              )}
            </aside>
          </div>
        ) : filtered.length === 0 ? (
            <EmptyState
              variant="no-results"
              title="No rentals match your filters"
              description="Adjust your search criteria, try a different city or locality, or reset filters to see all available rentals."
              actionLabel="Reset Filters"
              onAction={resetFilters}
            />
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
                <span className="portal-mobile-chip rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
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

        <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-slate-900">Owner Listing Flow (For Rent)</h3>
          <p className="mt-2 text-sm text-slate-600">A guided workflow helps owners and builders list quickly with clear data, privacy controls, and verification checkpoints.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {[
              { step: 'Step 1', title: 'Property Basics', detail: 'Type, location, BHK, and furnishing details.' },
              { step: 'Step 2', title: 'Rental Details', detail: 'Monthly rent, deposit, availability, and maintenance.' },
              { step: 'Step 3', title: 'Tenant Preferences', detail: 'Family/Bachelor/Any, pets, and house rules.' },
              { step: 'Step 4', title: 'Verification', detail: 'Ownership proof and basic ID checks.' },
              { step: 'Step 5', title: 'Contact & Privacy', detail: 'Phone visibility and lead filtering controls.' },
            ].map((item) => (
              <div key={item.title} className="portal-mobile-card rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{item.step}</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{item.title}</p>
                <p className="mt-1 text-xs text-slate-600">{item.detail}</p>
              </div>
            ))}
          </div>
          <Button className="mt-4 bg-slate-900 text-white hover:bg-slate-800" onClick={onOpenListProperty}>
            Start Listing for Rent
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Lead Quality & Safety</h3>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <p className="font-medium text-slate-900">For owners:</p>
              <p>Tenant intent confirmation and limited contact reveal reduce spam and non-serious enquiries.</p>
              <p>Suspicious users can be reported and blocked from further communication.</p>
              <p className="pt-2 font-medium text-slate-900">For tenants:</p>
              <p>Owner Verified badge, clear rent/deposit details, and reporting for fake listings.</p>
              <p>No hidden charges are promoted through listing standards.</p>
            </div>
          </div>
          <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Trust & Transparency</h3>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <p><span className="font-medium text-slate-900">Owner Verified:</span> identity and ownership proof checks are completed for listed owner profiles.</p>
              <p><span className="font-medium text-slate-900">Ownership Check - In Progress:</span> documents are submitted and under validation.</p>
              <p><span className="font-medium text-slate-900">Fake listing controls:</span> suspicious listings are reviewed quickly and removed when required.</p>
              <p><span className="font-medium text-slate-900">Platform role:</span> ZDT Realty is a platform, not a broker. Final rental transactions happen directly between owner and tenant.</p>
            </div>
          </div>
        </div>

        <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Dashboard Integration</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="portal-mobile-card rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Tenant Dashboard</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                <li>Saved rentals and shortlisted homes</li>
                <li>Enquiries sent and response tracking</li>
                <li>Visit status tracking (future)</li>
                <li>Alerts for new matching listings</li>
              </ul>
              <Button variant="outline" className="mt-3" onClick={onOpenDashboard} disabled={!onOpenDashboard}>
                Open Tenant Dashboard
              </Button>
            </div>
            <div className="portal-mobile-card rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Owner Dashboard</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                <li>Active rental listings and edits</li>
                <li>Enquiry management and quality checks</li>
                <li>Edit or pause listing controls</li>
                <li>Verification status and updates</li>
              </ul>
              <Button variant="outline" className="mt-3" onClick={onOpenOwnerDashboard} disabled={!onOpenOwnerDashboard}>
                Open Owner Dashboard
              </Button>
            </div>
          </div>
        </div>

        <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Future-Ready Scalability</h3>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="portal-mobile-chip rounded-full border border-slate-200 bg-slate-50 px-3 py-1">Rental agreements</span>
            <span className="portal-mobile-chip rounded-full border border-slate-200 bg-slate-50 px-3 py-1">Online rent tracking</span>
            <span className="portal-mobile-chip rounded-full border border-slate-200 bg-slate-50 px-3 py-1">Maintenance requests</span>
            <span className="portal-mobile-chip rounded-full border border-slate-200 bg-slate-50 px-3 py-1">Tenant verification upgrades</span>
          </div>
        </div>

        <p className="portal-mobile-card rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">ZDT Realty is an early-stage startup focused on verified rental listings and genuine connections.</p>
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
  const tenantTag = rental.tenantPreference || rental.preferredTenant || 'Anyone';
  const parkingLabel = rental.parking || 'Parking details on request';
  const petsLabel = typeof rental.petsAllowed === 'boolean' ? (rental.petsAllowed ? 'Pets allowed' : 'No pets') : 'Pets policy on request';

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

  const handleCallContact = () => {
    const opened = openPhoneDialer(rental.publicContactPhone);
    if (!opened) {
      onOpenMessages(referenceId);
      toast.info('Phone number unavailable. Opened in-app chat.');
    }
  };

  return (
    <article className="portal-mobile-card overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative">
        <img src={rental.primaryImage || '/images/property-1.jpg'} alt={rental.title} className="h-48 w-full object-cover" loading="lazy" />
        {rental.isVerified ? (
          <Badge className="absolute left-3 top-3 bg-emerald-600 text-white hover:bg-emerald-600"><BadgeCheck className="mr-1 h-3.5 w-3.5" />Owner Verified</Badge>
        ) : (
          <Badge className="absolute left-3 top-3 bg-slate-100 text-slate-700 hover:bg-slate-100">Verification in progress</Badge>
        )}
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
          <p>Availability: {available}</p>
          <p>{ownerName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="portal-mobile-chip inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-700"><UserCheck className="h-3.5 w-3.5 text-sky-700" />Preferred: {tenantTag}</span>
          <span className="portal-mobile-chip inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-700"><Car className="h-3.5 w-3.5 text-slate-500" />{parkingLabel}</span>
          <span className="portal-mobile-chip inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-700"><PawPrint className="h-3.5 w-3.5 text-slate-500" />{petsLabel}</span>
          {rental.isVerified && <span className="portal-mobile-chip inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" />Owner Verified</span>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button className="h-11 w-full min-w-0 bg-slate-900 px-3 text-[13px] text-white hover:bg-slate-800" onClick={() => onOpenDetails(referenceId)}>View Details</Button>
          <Button variant="outline" className="h-11 w-full min-w-0 border-slate-300 px-3 text-[13px]" onClick={() => onOpenMessages(referenceId)}><MessageCircle className="mr-1 h-3.5 w-3.5" />Contact Owner</Button>
          <Button variant="outline" className="h-11 w-full min-w-0 border-slate-300 px-3 text-[13px]" onClick={handleCallContact}><PhoneCall className="mr-1 h-3.5 w-3.5" />Call Owner</Button>
          <Button variant="outline" className={`h-11 w-full min-w-0 border-slate-300 px-3 text-[13px] ${saved ? 'text-rose-600' : ''}`} onClick={toggleSave}><Heart className={`mr-1 h-3.5 w-3.5 ${saved ? 'fill-current' : ''}`} />{saved ? 'Saved' : 'Save'}</Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="outline" className={`h-11 w-full min-w-0 border-slate-300 px-3 text-[13px] ${compared ? 'text-blue-700' : ''}`} onClick={toggleCompare}><GitCompareArrows className="mr-1 h-3.5 w-3.5" />{compared ? 'Compared' : 'Compare'}</Button>
          {compared ? (
            <Button variant="outline" className="h-11 w-full min-w-0 border-blue-200 bg-blue-50 px-3 text-[13px] text-blue-700 hover:bg-blue-100" onClick={onOpenCompare} disabled={!onOpenCompare}>Open Compare</Button>
          ) : (
            <div />
          )}
        </div>
      </div>
    </article>
  );
}
