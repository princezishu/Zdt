import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Building2,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  GitCompareArrows,
  Heart,
  Landmark,
  MapPin,
  MessageCircle,
  SearchCheck,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/http';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
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
import {
  COMPARE_CHANGED_EVENT,
  isCompared,
  readComparedListings,
  removeComparedListing,
  upsertComparedListing,
} from '@/lib/compareStore';
import { trackFeatureUsage } from '@/lib/featureUsageApi';
import { readIndiaLocationSelection } from '@/lib/indiaLocationSelection';
import { addSavedSearch } from '@/lib/savedSearchStore';

interface BuyMarketplacePageProps {
  onOpenDetails: (propertyId: string) => void;
  onOpenSaved: () => void;
  onOpenMessages: (propertyReference?: string) => void;
  onOpenCompare?: () => void;
  onOpenSavedSearches?: () => void;
  initialViewMode?: ViewMode;
}

interface MarketplaceProperty {
  id: number;
  title: string;
  state: string;
  city: string;
  area: string;
  locality: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
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
  furnishing: string;
  possessionStatus: string;
  reraNumber: string;
  isVerified: boolean;
  isFeatured: boolean;
  amenities: string[];
  primaryImage: string;
  companyName: string;
  activeGroupDealCode: string;
}

interface MarketplaceResponse {
  properties: MarketplaceProperty[];
  total: number;
}

type SortKey = 'recommended' | 'price_low' | 'price_high' | 'newest' | 'verified' | 'most_viewed';
type ViewMode = 'list' | 'map';
type GeoPoint = { latitude: number; longitude: number };

type FiltersState = {
  state: string;
  district: string;
  city: string;
  locality: string;
  propertyType: string;
  minPriceLakh: number;
  maxPriceLakh: number;
  minAreaSqft: number;
  maxAreaSqft: number;
  status: string;
  bhk: string;
  furnishing: string;
  parking: string;
  facing: string;
  saleType: string;
  groupDealOnly: boolean;
  verifiedBuilderOnly: boolean;
  governmentRefOnly: boolean;
  sort: SortKey;
};

const PROPERTY_TYPE_OPTIONS = [
  'Any',
  'Apartment / Flat',
  'Villa / House',
  'Plot / Land',
  'Commercial Shop',
  'Office Space',
];

const STATUS_OPTIONS = ['Any', 'Ready to Move', 'Under Construction', 'New Launch', 'Resale'];
const BHK_OPTIONS = ['Any', '1', '2', '3', '4', '5+'];
const FURNISHING_OPTIONS = ['Any', 'Full', 'Semi', 'Unfurnished'];
const PARKING_OPTIONS = ['Any', 'Yes', 'No'];
const FACING_OPTIONS = ['Any', 'North', 'East', 'South', 'West', 'North-East', 'North-West', 'South-East', 'South-West'];
const SALE_TYPE_OPTIONS = ['Any', 'New', 'Resale'];
const optionLabel = (value: string, anyLabel: string) => (value === 'Any' ? anyLabel : value);

const DEFAULT_FILTERS: FiltersState = {
  state: '',
  district: '',
  city: '',
  locality: '',
  propertyType: 'Any',
  minPriceLakh: 20,
  maxPriceLakh: 500,
  minAreaSqft: 300,
  maxAreaSqft: 4000,
  status: 'Any',
  bhk: 'Any',
  furnishing: 'Any',
  parking: 'Any',
  facing: 'Any',
  saleType: 'Any',
  groupDealOnly: false,
  verifiedBuilderOnly: false,
  governmentRefOnly: false,
  sort: 'recommended',
};

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'price_low', label: 'Price low to high' },
  { key: 'price_high', label: 'Price high to low' },
  { key: 'newest', label: 'Newest first' },
  { key: 'verified', label: 'Verified first' },
  { key: 'most_viewed', label: 'Most viewed' },
];

function formatPrice(price: number | null): string {
  if (!price || price <= 0) return 'Price on request';
  if (price >= 10000000) return `INR ${(price / 10000000).toFixed(2)} Cr`;
  if (price >= 100000) return `INR ${(price / 100000).toFixed(1)} L`;
  return `INR ${price.toLocaleString('en-IN')}`;
}

function buildLiveMapEmbedUrl(locationLabel: string, focusPoint: GeoPoint | null = null): string {
  const query = focusPoint
    ? `${focusPoint.latitude},${focusPoint.longitude}`
    : String(locationLabel || '').trim() || 'India';
  const zoom = focusPoint ? '16' : '12';
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=${zoom}&output=embed`;
}

function isCoordinateInRange(value: number | null, min: number, max: number): boolean {
  if (value === null || value === undefined) return false;
  if (!Number.isFinite(value)) return false;
  return value >= min && value <= max;
}

function getPropertyGeoPoint(property: Pick<MarketplaceProperty, 'latitude' | 'longitude'>): GeoPoint | null {
  if (!isCoordinateInRange(property.latitude, -90, 90)) return null;
  if (!isCoordinateInRange(property.longitude, -180, 180)) return null;
  return {
    latitude: Number(property.latitude),
    longitude: Number(property.longitude),
  };
}

function formatCoordinateValue(value: number): string {
  return value.toFixed(6);
}

function parseCoordinateQuery(value: string): GeoPoint | null {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const parts = normalized.split(/[,\s]+/).filter(Boolean);
  if (parts.length < 2) return null;
  const latitude = Number(parts[0]);
  const longitude = Number(parts[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;
  return {
    latitude: Number(latitude.toFixed(7)),
    longitude: Number(longitude.toFixed(7)),
  };
}

function createDefaultFilters(): FiltersState {
  const locationDefaults = readIndiaLocationSelection();
  return {
    ...DEFAULT_FILTERS,
    state: locationDefaults?.state || '',
    district: locationDefaults?.district || '',
    city: locationDefaults?.place || '',
    locality: locationDefaults?.subdistrict || '',
  };
}

function parseNumber(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseFiltersFromUrl(): FiltersState {
  const base = createDefaultFilters();
  const params = new URLSearchParams(window.location.search);
  return {
    ...base,
    state: params.get('state') || base.state,
    district: params.get('district') || base.district,
    city: params.get('city') || base.city,
    locality: params.get('locality') || base.locality,
    propertyType: params.get('propertyType') || base.propertyType,
    minPriceLakh: parseNumber(params.get('minPriceLakh'), base.minPriceLakh),
    maxPriceLakh: parseNumber(params.get('maxPriceLakh'), base.maxPriceLakh),
    minAreaSqft: parseNumber(params.get('minAreaSqft'), base.minAreaSqft),
    maxAreaSqft: parseNumber(params.get('maxAreaSqft'), base.maxAreaSqft),
    status: params.get('status') || base.status,
    bhk: params.get('bhk') || base.bhk,
    furnishing: params.get('furnishing') || base.furnishing,
    parking: params.get('parking') || base.parking,
    facing: params.get('facing') || base.facing,
    saleType: params.get('saleType') || base.saleType,
    groupDealOnly: params.get('groupDealOnly') === 'true',
    verifiedBuilderOnly: params.get('verifiedBuilderOnly') === 'true',
    governmentRefOnly: params.get('governmentRefOnly') === 'true',
    sort: (params.get('sort') as SortKey) || base.sort,
  };
}

function updateUrl(filters: FiltersState) {
  const params = new URLSearchParams();
  if (filters.state.trim()) params.set('state', filters.state.trim());
  if (filters.district.trim()) params.set('district', filters.district.trim());
  if (filters.city.trim()) params.set('city', filters.city.trim());
  if (filters.locality.trim()) params.set('locality', filters.locality.trim());
  if (filters.propertyType !== 'Any') params.set('propertyType', filters.propertyType);
  if (filters.status !== 'Any') params.set('status', filters.status);
  if (filters.bhk !== 'Any') params.set('bhk', filters.bhk);
  if (filters.furnishing !== 'Any') params.set('furnishing', filters.furnishing);
  if (filters.parking !== 'Any') params.set('parking', filters.parking);
  if (filters.facing !== 'Any') params.set('facing', filters.facing);
  if (filters.saleType !== 'Any') params.set('saleType', filters.saleType);
  if (filters.groupDealOnly) params.set('groupDealOnly', 'true');
  if (filters.verifiedBuilderOnly) params.set('verifiedBuilderOnly', 'true');
  if (filters.governmentRefOnly) params.set('governmentRefOnly', 'true');
  params.set('minPriceLakh', String(filters.minPriceLakh));
  params.set('maxPriceLakh', String(filters.maxPriceLakh));
  params.set('minAreaSqft', String(filters.minAreaSqft));
  params.set('maxAreaSqft', String(filters.maxAreaSqft));
  params.set('sort', filters.sort);
  const nextPath = params.toString() ? `/buy?${params.toString()}` : '/buy';
  window.history.replaceState({ ...(window.history.state || {}), __zdtSpa: true }, '', nextPath);
}

function toApiPriceFromLakh(value: number): number {
  return Math.max(0, Math.round(value * 100000));
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function formatPossessionStatus(value: string): string {
  const normalized = normalizeText(value).replace(/_/g, ' ');
  if (!normalized) return 'Ready to Move';
  if (normalized === 'pre launch') return 'New Launch';
  if (normalized === 'under construction') return 'Under Construction';
  if (normalized === 'ready') return 'Ready to Move';
  if (normalized === 'resale') return 'Resale';
  return normalized
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function resolveAreaSqft(property: MarketplaceProperty): number {
  return Number(property.areaSqft || property.builtupArea || property.carpetArea || property.superBuiltupArea || 0);
}

function hasParkingAmenity(property: MarketplaceProperty): boolean {
  return property.amenities.some((item) => normalizeText(item).includes('parking'));
}

function getApiTypeFilter(propertyType: string): string {
  if (propertyType === 'Apartment / Flat') return 'Apartment,Studio';
  if (propertyType === 'Villa / House') return 'Villa,Independent House,Duplex';
  if (propertyType === 'Plot / Land') return 'Plotted,Plot,Land';
  if (propertyType === 'Commercial Shop') return 'Commercial';
  if (propertyType === 'Office Space') return 'Commercial';
  return '';
}

function matchesPropertyTypeBucket(property: MarketplaceProperty, selected: string): boolean {
  if (selected === 'Any') return true;
  const normalizedType = normalizeText(property.propertyType);
  if (selected === 'Apartment / Flat') return /(apartment|flat|studio)/.test(normalizedType);
  if (selected === 'Villa / House') return /(villa|house|duplex)/.test(normalizedType);
  if (selected === 'Plot / Land') return /(plot|land|plotted)/.test(normalizedType);
  if (selected === 'Commercial Shop') return /(commercial|shop|retail)/.test(normalizedType);
  if (selected === 'Office Space') return /(commercial|office)/.test(normalizedType);
  return true;
}

function matchesStatus(property: MarketplaceProperty, selected: string): boolean {
  if (selected === 'Any') return true;
  const status = formatPossessionStatus(property.possessionStatus);
  return status === selected;
}

function matchesSaleType(property: MarketplaceProperty, selected: string): boolean {
  if (selected === 'Any') return true;
  const status = normalizeText(property.possessionStatus).replace(/_/g, ' ');
  if (selected === 'Resale') return status.includes('resale');
  return !status.includes('resale');
}

function matchesFurnishing(property: MarketplaceProperty, selected: string): boolean {
  if (selected === 'Any') return true;
  const furnishing = normalizeText(property.furnishing);
  if (selected === 'Full') return /(full|furnished)/.test(furnishing);
  if (selected === 'Semi') return /semi/.test(furnishing);
  if (selected === 'Unfurnished') return /(unfurnished|none|na)/.test(furnishing);
  return true;
}

export default function BuyMarketplacePage({
  onOpenDetails,
  onOpenSaved,
  onOpenMessages,
  onOpenCompare,
  onOpenSavedSearches,
  initialViewMode = 'list',
}: BuyMarketplacePageProps) {
  const [filters, setFilters] = useState<FiltersState>(() => parseFiltersFromUrl());
  const [appliedFilters, setAppliedFilters] = useState<FiltersState>(() => parseFiltersFromUrl());
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [properties, setProperties] = useState<MarketplaceProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const [compareCount, setCompareCount] = useState(() => readComparedListings().length);
  const [page, setPage] = useState(1);
  const [selectedMapPropertyId, setSelectedMapPropertyId] = useState<number | null>(null);
  const [manualMapFocusPoint, setManualMapFocusPoint] = useState<GeoPoint | null>(null);
  const [manualMapFocusLabel, setManualMapFocusLabel] = useState('');
  const [manualCoordinateQuery, setManualCoordinateQuery] = useState('');
  const [locatingCurrentPosition, setLocatingCurrentPosition] = useState(false);
  const pageSize = 12;

  useEffect(() => {
    setViewMode(initialViewMode);
  }, [initialViewMode]);

  useEffect(() => {
    if (viewMode !== 'map') return;
    void trackFeatureUsage({
      featureKey: 'buy_map_view_opened',
      context: 'buy_marketplace',
      view: 'buy-map',
    });
  }, [viewMode]);

  useEffect(() => {
    updateUrl(appliedFilters);
  }, [appliedFilters]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    const params = new URLSearchParams();
    params.set('listingType', 'sale');
    params.set('limit', '60');
    params.set('sort', appliedFilters.sort);
    if (appliedFilters.city.trim()) params.set('city', appliedFilters.city.trim());
    if (appliedFilters.locality.trim()) params.set('locality', appliedFilters.locality.trim());
    if (appliedFilters.bhk !== 'Any') params.set('bhk', appliedFilters.bhk);
    if (appliedFilters.facing !== 'Any') params.set('facing', appliedFilters.facing);
    if (appliedFilters.verifiedBuilderOnly) params.set('verifiedOnly', 'true');
    if (appliedFilters.minAreaSqft > 0) params.set('minBuiltupArea', String(appliedFilters.minAreaSqft));
    if (appliedFilters.maxAreaSqft > 0) params.set('maxBuiltupArea', String(appliedFilters.maxAreaSqft));
    params.set('minPrice', String(toApiPriceFromLakh(appliedFilters.minPriceLakh)));
    params.set('maxPrice', String(toApiPriceFromLakh(appliedFilters.maxPriceLakh)));
    const typeFilter = getApiTypeFilter(appliedFilters.propertyType);
    if (typeFilter) params.set('type', typeFilter);

    apiRequest<MarketplaceResponse>(`/api/properties?${params.toString()}`)
      .then((response) => {
        if (!active) return;
        setProperties(response.properties || []);
        setTotal(Number(response.total || 0));
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
  }, [appliedFilters]);

  const filteredProperties = useMemo(() => {
    return properties.filter((property) => {
      const stateText = normalizeText(property.state);
      const cityText = normalizeText(property.city);
      const areaText = normalizeText(property.area);
      const localityText = normalizeText(property.locality);
      const titleText = normalizeText(property.title);

      const matchesState =
        !filters.state.trim() || stateText.includes(normalizeText(filters.state));
      const matchesDistrict =
        !filters.district.trim() ||
        areaText.includes(normalizeText(filters.district)) ||
        localityText.includes(normalizeText(filters.district));
      const matchesCity =
        !filters.city.trim() || cityText.includes(normalizeText(filters.city));
      const matchesLocality =
        !filters.locality.trim() ||
        localityText.includes(normalizeText(filters.locality)) ||
        areaText.includes(normalizeText(filters.locality)) ||
        titleText.includes(normalizeText(filters.locality));
      const matchesType = matchesPropertyTypeBucket(property, filters.propertyType);
      const matchesStatusFilter = matchesStatus(property, filters.status);
      const matchesSale = matchesSaleType(property, filters.saleType);
      const matchesFurnishingFilter = matchesFurnishing(property, filters.furnishing);
      const matchesParkingFilter =
        filters.parking === 'Any'
          ? true
          : filters.parking === 'Yes'
            ? hasParkingAmenity(property)
            : !hasParkingAmenity(property);
      const matchesFacingFilter =
        filters.facing === 'Any' ||
        normalizeText(property.facing) === normalizeText(filters.facing);
      const matchesBhkFilter =
        filters.bhk === 'Any'
          ? true
          : filters.bhk === '5+'
            ? Number(property.bhk || property.bedrooms || 0) >= 5
            : Number(property.bhk || property.bedrooms || 0) === Number(filters.bhk);
      const areaSqft = resolveAreaSqft(property);
      const matchesArea =
        areaSqft <= 0 ||
        (areaSqft >= filters.minAreaSqft && areaSqft <= filters.maxAreaSqft);
      const priceLakh = property.price && property.price > 0 ? property.price / 100000 : 0;
      const matchesBudget =
        priceLakh <= 0 ||
        (priceLakh >= filters.minPriceLakh && priceLakh <= filters.maxPriceLakh);
      const hasGroupDeal = Boolean(String(property.activeGroupDealCode || '').trim());
      const matchesGroupDeal = !filters.groupDealOnly || hasGroupDeal;
      const matchesVerified = !filters.verifiedBuilderOnly || property.isVerified;
      const hasGovReference = Boolean(String(property.reraNumber || '').trim());
      const matchesGov = !filters.governmentRefOnly || hasGovReference;

      return (
        matchesState &&
        matchesDistrict &&
        matchesCity &&
        matchesLocality &&
        matchesType &&
        matchesStatusFilter &&
        matchesSale &&
        matchesFurnishingFilter &&
        matchesParkingFilter &&
        matchesFacingFilter &&
        matchesBhkFilter &&
        matchesArea &&
        matchesBudget &&
        matchesGroupDeal &&
        matchesVerified &&
        matchesGov
      );
    });
  }, [filters, properties]);

  const summary = useMemo(() => {
    const visibleCount = filteredProperties.length.toLocaleString('en-IN');
    const totalCount = total.toLocaleString('en-IN');
    return `${visibleCount} matched listings from ${totalCount} verified market records`;
  }, [filteredProperties.length, total]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredProperties.length / pageSize)),
    [filteredProperties.length, pageSize]
  );

  const pagedProperties = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredProperties.slice(start, start + pageSize);
  }, [filteredProperties, page, pageSize]);

  const showingFrom = filteredProperties.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(filteredProperties.length, page * pageSize);

  const defaultMapFocusLabel = useMemo(() => {
    const parts = [
      filters.locality,
      filters.city,
      filters.district,
      filters.state,
    ]
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
    return parts.join(', ') || 'India';
  }, [
    filters.locality,
    filters.city,
    filters.district,
    filters.state,
  ]);

  const nearbyMapProperties = useMemo(() => {
    const focusTokens = [
      filters.locality,
      filters.city,
      filters.district,
      filters.state,
    ]
      .map((entry) => normalizeText(entry))
      .filter(Boolean);

    if (focusTokens.length === 0) return filteredProperties;

    const scoreProperty = (property: MarketplaceProperty): number => {
      const haystack = normalizeText(
        [property.locality, property.area, property.city, property.state].filter(Boolean).join(' ')
      );
      return focusTokens.reduce((score, token) => (haystack.includes(token) ? score + 1 : score), 0);
    };

    return [...filteredProperties].sort((a, b) => {
      const scoreDiff = scoreProperty(b) - scoreProperty(a);
      if (scoreDiff !== 0) return scoreDiff;
      return Number(b.id) - Number(a.id);
    });
  }, [
    filters.locality,
    filters.city,
    filters.district,
    filters.state,
    filteredProperties,
  ]);

  const mapPropertiesWithCoordinates = useMemo(
    () => nearbyMapProperties.filter((property) => getPropertyGeoPoint(property) !== null),
    [nearbyMapProperties]
  );

  useEffect(() => {
    if (viewMode !== 'map') return;
    if (mapPropertiesWithCoordinates.length === 0) {
      setSelectedMapPropertyId(null);
      return;
    }
    const hasSelected = mapPropertiesWithCoordinates.some((property) => property.id === selectedMapPropertyId);
    if (!hasSelected) {
      setSelectedMapPropertyId(mapPropertiesWithCoordinates[0].id);
    }
  }, [viewMode, mapPropertiesWithCoordinates, selectedMapPropertyId]);

  const selectedMapProperty = useMemo(
    () =>
      mapPropertiesWithCoordinates.find((property) => property.id === selectedMapPropertyId) ||
      mapPropertiesWithCoordinates[0] ||
      null,
    [mapPropertiesWithCoordinates, selectedMapPropertyId]
  );

  const selectedMapPoint = useMemo(
    () => (selectedMapProperty ? getPropertyGeoPoint(selectedMapProperty) : null),
    [selectedMapProperty]
  );

  const effectiveMapPoint = useMemo(
    () => manualMapFocusPoint || selectedMapPoint,
    [manualMapFocusPoint, selectedMapPoint]
  );

  const mapFocusLabel = useMemo(() => {
    if (manualMapFocusPoint) {
      if (manualMapFocusLabel.trim()) return manualMapFocusLabel.trim();
      return `Current location (${formatCoordinateValue(manualMapFocusPoint.latitude)}, ${formatCoordinateValue(manualMapFocusPoint.longitude)})`;
    }
    if (manualMapFocusLabel.trim()) return manualMapFocusLabel.trim();
    if (!selectedMapProperty) return defaultMapFocusLabel;
    const parts = [
      selectedMapProperty.locality,
      selectedMapProperty.area,
      selectedMapProperty.city,
      selectedMapProperty.state,
    ]
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
    return parts.join(', ') || selectedMapProperty.title || defaultMapFocusLabel;
  }, [defaultMapFocusLabel, manualMapFocusLabel, manualMapFocusPoint, selectedMapProperty]);

  const liveMapUrl = useMemo(
    () => buildLiveMapEmbedUrl(mapFocusLabel, effectiveMapPoint),
    [effectiveMapPoint, mapFocusLabel]
  );

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
        setManualCoordinateQuery(
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

  const handleSetMapFocus = () => {
    const query = String(manualCoordinateQuery || '').trim();
    if (!query) {
      toast.error('Enter a place or coordinates to search on map.');
      return;
    }

    const parsed = parseCoordinateQuery(query);
    if (parsed) {
      setManualMapFocusPoint(parsed);
      setManualMapFocusLabel(
        `Manual coordinates (${formatCoordinateValue(parsed.latitude)}, ${formatCoordinateValue(parsed.longitude)})`
      );
      setSelectedMapPropertyId(null);
      toast.success('Map centered to entered coordinates.');
      return;
    }

    setManualMapFocusPoint(null);
    setManualMapFocusLabel(query);
    setSelectedMapPropertyId(null);
    toast.success('Map focused to searched place.');
  };

  const handleApplyFilters = () => {
    if (filters.minPriceLakh > filters.maxPriceLakh) {
      toast.error('Minimum budget cannot be greater than maximum budget.');
      return;
    }
    if (filters.minAreaSqft > filters.maxAreaSqft) {
      toast.error('Minimum area cannot be greater than maximum area.');
      return;
    }
    setAppliedFilters(filters);
    void trackFeatureUsage({
      featureKey: 'buy_filters_applied',
      context: 'buy_marketplace',
      view: viewMode === 'map' ? 'buy-map' : 'buy',
      detail: `city=${filters.city || '-'};locality=${filters.locality || '-'};type=${filters.propertyType};sort=${filters.sort}`,
    });
  };

  const handleResetFilters = () => {
    const reset = createDefaultFilters();
    setFilters(reset);
    setAppliedFilters(reset);
  };

  useEffect(() => {
    setPage(1);
  }, [viewMode, filters]);

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
    if (filters.status !== 'Any') chips.push({ key: 'status', label: filters.status });
    if (filters.bhk !== 'Any') chips.push({ key: 'bhk', label: `${filters.bhk} BHK` });
    if (filters.furnishing !== 'Any') chips.push({ key: 'furnishing', label: filters.furnishing });
    if (filters.parking !== 'Any') chips.push({ key: 'parking', label: `Parking: ${filters.parking}` });
    if (filters.facing !== 'Any') chips.push({ key: 'facing', label: `Facing: ${filters.facing}` });
    if (filters.saleType !== 'Any') chips.push({ key: 'saleType', label: filters.saleType });
    if (filters.groupDealOnly) chips.push({ key: 'groupDealOnly', label: 'Group Deal Only' });
    if (filters.verifiedBuilderOnly) chips.push({ key: 'verifiedBuilderOnly', label: 'Verified Only' });
    if (filters.governmentRefOnly) chips.push({ key: 'governmentRefOnly', label: 'Gov Ref Only' });
    return chips;
  }, [filters]);

  const removeFilterChip = (key: string) => {
    setFilters((prev) => {
      if (key === 'state') return { ...prev, state: '' };
      if (key === 'district') return { ...prev, district: '' };
      if (key === 'city') return { ...prev, city: '' };
      if (key === 'locality') return { ...prev, locality: '' };
      if (key === 'propertyType') return { ...prev, propertyType: DEFAULT_FILTERS.propertyType };
      if (key === 'status') return { ...prev, status: DEFAULT_FILTERS.status };
      if (key === 'bhk') return { ...prev, bhk: DEFAULT_FILTERS.bhk };
      if (key === 'furnishing') return { ...prev, furnishing: DEFAULT_FILTERS.furnishing };
      if (key === 'parking') return { ...prev, parking: DEFAULT_FILTERS.parking };
      if (key === 'facing') return { ...prev, facing: DEFAULT_FILTERS.facing };
      if (key === 'saleType') return { ...prev, saleType: DEFAULT_FILTERS.saleType };
      if (key === 'groupDealOnly') return { ...prev, groupDealOnly: false };
      if (key === 'verifiedBuilderOnly') return { ...prev, verifiedBuilderOnly: false };
      if (key === 'governmentRefOnly') return { ...prev, governmentRefOnly: false };
      return prev;
    });
  };

  const handleSaveSearch = () => {
    const primaryLocation = filters.locality || filters.city || filters.district || filters.state || 'All India';
    const label = `Buy | ${primaryLocation} | ${filters.propertyType === 'Any' ? 'All types' : filters.propertyType}`;
    addSavedSearch({
      label,
      targetView: 'buy',
      criteria: filters,
    });
    void trackFeatureUsage({
      featureKey: 'saved_search_applied',
      context: 'buy_marketplace',
      view: viewMode === 'map' ? 'buy-map' : 'buy',
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
                <h1 className="text-3xl font-semibold">Buy Property</h1>
                <p className="mt-2 text-sm text-slate-200">Verified listings from trusted builders across India</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-xl border border-white/20 bg-white/10 p-1 text-sm">
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className={`rounded-lg px-3 py-1.5 ${viewMode === 'list' ? 'bg-white text-slate-900' : 'text-slate-200'}`}
                  >
                    List
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('map')}
                    className={`rounded-lg px-3 py-1.5 ${viewMode === 'map' ? 'bg-white text-slate-900' : 'text-slate-200'}`}
                  >
                    Map
                  </button>
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

          <div className="px-6 py-5">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Primary Search
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <LgdLocationInput
                value={filters.state}
                onChange={(value) =>
                  setFilters((prev) => ({ ...prev, state: value, district: '', city: '', locality: '' }))
                }
                placeholder="State"
                className="h-11"
                suggestKind="india"
                indiaValueField="state"
              />
              <LgdLocationInput
                value={filters.district}
                onChange={(value) =>
                  setFilters((prev) => ({ ...prev, district: value, city: '', locality: '' }))
                }
                placeholder="District"
                className="h-11"
                suggestKind="india"
                indiaValueField="district"
                indiaState={filters.state}
              />
              <LgdLocationInput
                value={filters.city}
                onChange={(value) => setFilters((prev) => ({ ...prev, city: value, locality: '' }))}
                placeholder="City / Town"
                className="h-11"
                suggestKind="india"
                indiaValueField="subdistrict"
                indiaState={filters.state}
                indiaDistrict={filters.district}
              />
              <LgdLocationInput
                value={filters.locality}
                onChange={(value) => setFilters((prev) => ({ ...prev, locality: value }))}
                placeholder="Locality / Area"
                className="h-11"
                suggestKind="india"
                indiaValueField="village"
                indiaState={filters.state}
                indiaDistrict={filters.district}
                indiaSubdistrict={filters.city}
              />
              <Select
                value={filters.propertyType}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, propertyType: value }))}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Property Type" />
                </SelectTrigger>
                <SelectContent>
                  {PROPERTY_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {optionLabel(option, 'All property types')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Budget: INR {filters.minPriceLakh}L - INR {filters.maxPriceLakh}L
                </p>
                <Slider
                  className="mt-2"
                  min={10}
                  max={2000}
                  step={10}
                  value={[filters.minPriceLakh, filters.maxPriceLakh]}
                  onValueChange={([min, max]) =>
                    setFilters((prev) => ({ ...prev, minPriceLakh: min, maxPriceLakh: max }))
                  }
                />
              </div>
            </div>
            <LgdLocationAccuracyNote className="mt-3" />
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm xl:sticky xl:top-24 xl:self-start">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-slate-900">Smart Filters</h2>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleResetFilters}>
                Reset
              </Button>
              <Button className="bg-slate-900 text-white hover:bg-slate-800" onClick={handleApplyFilters}>
                Apply Filters
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Status</p>
              <Select value={filters.status} onValueChange={(value) => setFilters((prev) => ({ ...prev, status: value }))}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {optionLabel(option, 'All statuses')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">BHK</p>
              <Select value={filters.bhk} onValueChange={(value) => setFilters((prev) => ({ ...prev, bhk: value }))}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="BHK" />
                </SelectTrigger>
                <SelectContent>
                  {BHK_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {optionLabel(option, 'Any BHK')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Furnishing</p>
              <Select
                value={filters.furnishing}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, furnishing: value }))}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Furnishing" />
                </SelectTrigger>
                <SelectContent>
                  {FURNISHING_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {optionLabel(option, 'Any furnishing')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Parking</p>
              <Select value={filters.parking} onValueChange={(value) => setFilters((prev) => ({ ...prev, parking: value }))}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Parking" />
                </SelectTrigger>
                <SelectContent>
                  {PARKING_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {optionLabel(option, 'Any parking')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Facing</p>
              <Select value={filters.facing} onValueChange={(value) => setFilters((prev) => ({ ...prev, facing: value }))}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Facing" />
                </SelectTrigger>
                <SelectContent>
                  {FACING_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {optionLabel(option, 'Any facing')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Sale Type</p>
              <Select value={filters.saleType} onValueChange={(value) => setFilters((prev) => ({ ...prev, saleType: value }))}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Sale Type" />
                </SelectTrigger>
                <SelectContent>
                  {SALE_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {optionLabel(option, 'Any sale type')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Sort</p>
              <Select value={filters.sort} onValueChange={(value: SortKey) => setFilters((prev) => ({ ...prev, sort: value }))}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.key} value={option.key}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Area: {filters.minAreaSqft} - {filters.maxAreaSqft} sq.ft
              </p>
              <Slider
                className="mt-2"
                min={150}
                max={10000}
                step={50}
                value={[filters.minAreaSqft, filters.maxAreaSqft]}
                onValueChange={([min, max]) =>
                  setFilters((prev) => ({ ...prev, minAreaSqft: min, maxAreaSqft: max }))
                }
              />
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <label className="flex min-h-16 items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">
              Group Deal Available
              <Checkbox
                checked={filters.groupDealOnly}
                onCheckedChange={(value) => setFilters((prev) => ({ ...prev, groupDealOnly: Boolean(value) }))}
              />
            </label>
            <label className="flex min-h-16 items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">
              Verified Builder
              <Checkbox
                checked={filters.verifiedBuilderOnly}
                onCheckedChange={(value) =>
                  setFilters((prev) => ({ ...prev, verifiedBuilderOnly: Boolean(value) }))
                }
              />
            </label>
            <label className="flex min-h-16 items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm sm:col-span-2">
              Government Reference Available
              <Checkbox
                checked={filters.governmentRefOnly}
                onCheckedChange={(value) =>
                  setFilters((prev) => ({ ...prev, governmentRefOnly: Boolean(value) }))
                }
              />
            </label>
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
                Saved Properties
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
              <h2 className="text-2xl font-semibold text-slate-900">Property Results</h2>
              <p className="text-sm text-slate-600">{summary}</p>
              {viewMode === 'list' && filteredProperties.length > 0 && (
                <p className="text-xs text-slate-500">
                  Showing {showingFrom}-{showingTo} of {filteredProperties.length}
                </p>
              )}
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Trust-first listing view
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

          {loading ? (
            <PropertyCardsSkeleton />
          ) : error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
          ) : viewMode === 'map' ? (
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
                      value={manualCoordinateQuery}
                      onChange={(event) => setManualCoordinateQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          handleSetMapFocus();
                        }
                      }}
                      placeholder="Search place or Lat, Lng"
                      className="h-8 w-[240px] bg-white text-xs"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-slate-300 bg-white text-xs text-slate-700"
                      onClick={handleSetMapFocus}
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
                <div className="relative">
                  <iframe
                    title={`Buy properties map for ${mapFocusLabel}`}
                    src={liveMapUrl}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    className="h-[520px] w-full border-0"
                  />
                  {mapPropertiesWithCoordinates.length === 0 ? (
                    <div className="pointer-events-none absolute bottom-3 left-3 right-3 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-600 shadow-sm backdrop-blur">
                      Exact map pins are not available for current results. Showing area-level map focus.
                    </div>
                  ) : null}
                  {nearbyMapProperties.length === 0 ? (
                    <div className="pointer-events-none absolute top-3 left-3 right-3 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-600 shadow-sm backdrop-blur">
                      No listings match current filters. Clear filters to see properties here.
                    </div>
                  ) : null}
                </div>
              </div>
              <aside className="max-h-[540px] space-y-3 overflow-auto pr-1">
                <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <p className="text-sm font-semibold text-slate-900">Nearby Properties</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Ranked by selected location filters. Exact coordinates: {mapPropertiesWithCoordinates.length} /{' '}
                    {nearbyMapProperties.length}
                  </p>
                </div>
                {nearbyMapProperties.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
                    No listings match current filters. Clear filters to see properties on map.
                  </div>
                ) : (
                  nearbyMapProperties.map((property) => {
                    const geoPoint = getPropertyGeoPoint(property);
                    const isPinned = selectedMapProperty?.id === property.id;
                    return (
                      <div
                        key={`map-row-${property.id}`}
                        className={`w-full rounded-2xl border bg-white p-3 text-left shadow-sm transition ${
                          isPinned ? 'border-blue-400 ring-1 ring-blue-100' : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{property.title}</p>
                            <p className="text-xs text-slate-500">{property.locality || property.area}, {property.city}</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">{formatPrice(property.price)}</p>
                            <p className="mt-1 text-[11px] text-slate-500">
                              {geoPoint
                                ? `Lat ${formatCoordinateValue(geoPoint.latitude)}, Lng ${formatCoordinateValue(geoPoint.longitude)}`
                                : 'Coordinates not provided'}
                            </p>
                          </div>
                          <MapPin className={`h-4 w-4 ${geoPoint ? 'text-blue-500' : 'text-slate-300'}`} />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant={isPinned ? 'default' : 'outline'}
                            className={isPinned ? 'bg-slate-900 text-white hover:bg-slate-800' : ''}
                          disabled={!geoPoint}
                          onClick={() => {
                            setManualMapFocusPoint(null);
                            setManualMapFocusLabel('');
                            setSelectedMapPropertyId(property.id);
                          }}
                        >
                          {isPinned ? 'Pinned' : 'Show on map'}
                        </Button>
                          <Button size="sm" variant="ghost" onClick={() => onOpenDetails(String(property.id))}>
                            Open details
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </aside>
            </div>
          ) : filteredProperties.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
              No listings match your current filters.
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {pagedProperties.map((property) => (
                  <PropertyCard
                    key={property.id}
                    property={property}
                    onOpenDetails={onOpenDetails}
                    onOpenMessages={onOpenMessages}
                    onOpenCompare={onOpenCompare}
                  />
                ))}
              </div>
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

        <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
          ZDT Realty is an independent real estate platform built with transparency and verified listings.
        </p>
      </div>
    </section>
  );
}

function PropertyCard({
  property,
  onOpenDetails,
  onOpenMessages,
  onOpenCompare,
}: {
  property: MarketplaceProperty;
  onOpenDetails: (propertyId: string) => void;
  onOpenMessages: (propertyReference?: string) => void;
  onOpenCompare?: () => void;
}) {
  const referenceId = String(property.id);
  const [saved, setSaved] = useState(() => isFavorite(referenceId));
  const [compared, setCompared] = useState(() => isCompared(referenceId));

  useEffect(() => {
    const sync = () => setSaved(isFavorite(referenceId));
    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== 'zdt_favorite_listings') return;
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

  useEffect(() => {
    const sync = () => setCompared(isCompared(referenceId));
    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== 'zdt_compared_listings') return;
      sync();
    };
    sync();
    window.addEventListener('storage', handleStorage);
    window.addEventListener(COMPARE_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(COMPARE_CHANGED_EVENT, sync);
    };
  }, [referenceId]);

  const hasGroupDeal = Boolean(String(property.activeGroupDealCode || '').trim());
  const hasGovernmentReference = Boolean(String(property.reraNumber || '').trim());
  const areaSqft = resolveAreaSqft(property);
  const bhkLabel =
    Number(property.bhk || property.bedrooms || 0) > 0
      ? `${property.bhk || property.bedrooms} BHK`
      : property.propertyType;
  const statusLabel = formatPossessionStatus(property.possessionStatus);
  const builderName = property.companyName || 'Verified Builder';

  const handleSave = () => {
    if (saved) {
      removeFavoriteListing(referenceId);
      setSaved(false);
      toast.success('Removed from saved');
      return;
    }

    upsertFavoriteListing({
      id: referenceId,
      referenceId,
      title: property.title,
      image: property.primaryImage || '/images/property-1.jpg',
      city: property.city,
      area: property.locality || property.area,
      priceLabel: formatPrice(property.price),
      areaLabel: areaSqft > 0 ? `${areaSqft} sq.ft` : 'Area on request',
      propertyType: property.propertyType,
      bhk: bhkLabel,
      mainDoorFacing: property.facing || 'NA',
      vastuScore: 80,
      verified: property.isVerified,
      ownerPhone: 'Hidden',
      isFeatured: property.isFeatured,
    });
    setSaved(true);
    toast.success('Saved to shortlist');
  };

  const handleCompare = () => {
    if (compared) {
      removeComparedListing(referenceId);
      setCompared(false);
      toast.success('Removed from compare');
      return;
    }

    upsertComparedListing({
      id: referenceId,
      referenceId,
      title: property.title,
      image: property.primaryImage || '/images/property-1.jpg',
      city: property.city,
      area: property.locality || property.area,
      priceLabel: formatPrice(property.price),
      areaLabel: areaSqft > 0 ? `${areaSqft} sq.ft` : 'Area on request',
      propertyType: property.propertyType,
      bhk: bhkLabel,
      mainDoorFacing: property.facing || 'NA',
      vastuScore: 80,
      verified: property.isVerified,
      ownerPhone: 'Hidden',
      updatedAt: new Date().toISOString(),
    });
    setCompared(true);
    toast.success('Added to compare');
  };

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative">
        <img
          src={property.primaryImage || '/images/property-1.jpg'}
          alt={property.title}
          className="h-48 w-full object-cover"
          loading="lazy"
        />
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          {hasGroupDeal && <Badge className="bg-indigo-700 text-white hover:bg-indigo-700">Group Deal Available</Badge>}
          {property.isVerified && (
            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
              <BadgeCheck className="mr-1 h-3.5 w-3.5" />
              Verified Builder
            </Badge>
          )}
        </div>
      </div>

      <div className="space-y-3 p-4">
        <h3 className="line-clamp-2 text-base font-semibold text-slate-900">{property.title}</h3>
        <p className="inline-flex items-center gap-1 text-xs text-slate-600">
          <MapPin className="h-3.5 w-3.5 text-slate-500" />
          {property.locality || property.area}, {property.city}
        </p>

        <p className="text-lg font-semibold text-slate-900">{formatPrice(property.price)}</p>

        <div className="grid gap-1 text-xs text-slate-600">
          <p>
            {areaSqft > 0 ? `${areaSqft} sq.ft` : 'Area on request'} • {bhkLabel}
          </p>
          <p className="inline-flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            {statusLabel}
          </p>
          <p className="inline-flex items-center gap-1">
            <Building2 className="h-3.5 w-3.5 text-slate-500" />
            {builderName}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-[11px]">
          {property.isVerified && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              Verification Passed
            </span>
          )}
          {hasGovernmentReference && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-800">
              <Landmark className="h-3.5 w-3.5" />
              Government Ref
            </span>
          )}
          {hasGroupDeal && (
            <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-indigo-700">
              <Users className="h-3.5 w-3.5" />
              Group Deal
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Button className="h-10 bg-slate-900 text-white hover:bg-slate-800" onClick={() => onOpenDetails(referenceId)}>
            View Details
          </Button>
          <Button variant="outline" className="h-10 border-slate-300" onClick={() => onOpenMessages(referenceId)}>
            <MessageCircle className="mr-1 h-3.5 w-3.5" />
            Contact Seller
          </Button>
          <Button
            variant="outline"
            className={`h-10 border-slate-300 ${compared ? 'text-blue-700' : ''}`}
            onClick={handleCompare}
          >
            <GitCompareArrows className="mr-1 h-3.5 w-3.5" />
            {compared ? 'Compared' : 'Compare'}
          </Button>
          <Button
            variant="outline"
            className={`h-10 border-slate-300 ${saved ? 'text-rose-600' : ''}`}
            onClick={handleSave}
          >
            <Heart className={`mr-1 h-3.5 w-3.5 ${saved ? 'fill-current' : ''}`} />
            {saved ? 'Saved' : 'Save'}
          </Button>
        </div>
        {compared && (
          <button
            type="button"
            onClick={onOpenCompare}
            className="w-full rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:border-blue-300"
          >
            Open compare board
          </button>
        )}
      </div>
    </article>
  );
}
