import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeCheck,
  Building2,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Copy,
  Filter,
  GitCompareArrows,
  Heart,
  Landmark,
  Loader2,
  MapPin,
  MessageCircle,
  PhoneCall,
  SearchCheck,
  Share2,
  ShieldCheck,
  ShieldQuestion,
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
import { Textarea } from '@/components/ui/textarea';
import { PropertyCardsSkeleton } from '@/components/loading/PageSkeletons';
import EmptyState from '@/components/ui/EmptyState';
import { LgdLocationAccuracyNote, LgdLocationInput } from '@/components/realty/LgdLocationInput';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  FAVORITES_CHANGED_EVENT,
  isFavorite,
  removeFavoriteListing,
  upsertFavoriteListing,
} from '@/lib/favoritesStore';
import {
  COMPARE_CHANGED_EVENT,
  clearComparedListings,
  isCompared,
  readComparedListings,
  removeComparedListing,
  upsertComparedListing,
} from '@/lib/compareStore';
import { trackFeatureUsage } from '@/lib/featureUsageApi';
import { addSavedSearch } from '@/lib/savedSearchStore';
import { applySeo } from '@/lib/seo';
import { openPhoneDialer } from '@/lib/phone';
import { shareOnWhatsApp } from '@/lib/share';
import {
  createGroupDealRequest,
  getGroupDealByCode,
  joinGroupDeal,
  type GroupDealItem,
  type GroupDealUnitType,
} from '@/lib/groupDealsApi';

interface BuyMarketplacePageProps {
  onOpenDetails: (propertyId: string) => void;
  onOpenSaved: () => void;
  onOpenMessages: (propertyReference?: string) => void;
  onOpenCompare?: () => void;
  onOpenSavedSearches?: () => void;
  initialViewMode?: ViewMode;
  groupDealEnabled?: boolean;
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
  availabilityDate: string | null;
  reraNumber: string;
  isVerified: boolean;
  isFeatured: boolean;
  amenities: string[];
  primaryImage: string;
  companyName: string;
  publicContactPhone?: string;
  activeGroupDealCode: string;
  activeGroupDealStatus: string;
  createdAt: string;
}

interface MarketplaceResponse {
  properties: MarketplaceProperty[];
  total: number;
}

type SortKey =
  | 'recommended'
  | 'price_low'
  | 'price_high'
  | 'newest'
  | 'verified'
  | 'most_viewed'
  | 'highest_group_discount';
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
  possessionByMonth: string;
  bhk: string;
  furnishing: string;
  parking: string;
  facing: string;
  saleType: string;
  amenitiesWanted: string[];
  groupDealOnly: boolean;
  verifiedBuilderOnly: boolean;
  governmentRefOnly: boolean;
  sort: SortKey;
};

type RecentLocation = {
  state: string;
  district: string;
  city: string;
  locality: string;
  createdAt: string;
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
const AMENITY_OPTIONS = ['Parking', 'Lift', 'Security', 'Water', 'Power Backup'];
const JOIN_UNIT_OPTIONS: GroupDealUnitType[] = ['2BHK', '3BHK', 'PLOT', 'SHOP'];
const optionLabel = (value: string, anyLabel: string) => (value === 'Any' ? anyLabel : value);
const RECENT_LOCATION_KEY = 'zdt_buy_recent_locations_v1';
const MAX_RECENT_LOCATIONS = 5;

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
  possessionByMonth: '',
  bhk: 'Any',
  furnishing: 'Any',
  parking: 'Any',
  facing: 'Any',
  saleType: 'Any',
  amenitiesWanted: [],
  groupDealOnly: false,
  verifiedBuilderOnly: false,
  governmentRefOnly: false,
  sort: 'recommended',
};

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'recommended', label: 'Relevance' },
  { key: 'price_low', label: 'Price: Low to High' },
  { key: 'price_high', label: 'Price: High to Low' },
  { key: 'newest', label: 'Newest Listings' },
  { key: 'highest_group_discount', label: 'Highest Group Discount' },
  { key: 'verified', label: 'Verified First' },
  { key: 'most_viewed', label: 'Most Viewed' },
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
  return {
    ...DEFAULT_FILTERS,
  };
}

function shouldHydrateFiltersFromUrl(): boolean {
  const navEntries = window.performance.getEntriesByType('navigation');
  const navEntry = navEntries[0] as PerformanceNavigationTiming | undefined;
  return navEntry?.type !== 'reload';
}

function formatRecentLocationLabel(entry: RecentLocation): string {
  return [entry.locality, entry.city, entry.district, entry.state]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join(', ');
}

function loadRecentLocations(): RecentLocation[] {
  try {
    const raw = window.localStorage.getItem(RECENT_LOCATION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        state: String(item?.state || ''),
        district: String(item?.district || ''),
        city: String(item?.city || ''),
        locality: String(item?.locality || ''),
        createdAt: String(item?.createdAt || ''),
      }))
      .filter((item) => Boolean(formatRecentLocationLabel(item)));
  } catch {
    return [];
  }
}

function saveRecentLocations(rows: RecentLocation[]) {
  try {
    window.localStorage.setItem(RECENT_LOCATION_KEY, JSON.stringify(rows.slice(0, MAX_RECENT_LOCATIONS)));
  } catch {
    // Non-blocking for private browsing.
  }
}

function parseNumber(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseFiltersFromUrl(): FiltersState {
  const base = createDefaultFilters();
  if (!shouldHydrateFiltersFromUrl()) {
    return base;
  }
  const params = new URLSearchParams(window.location.search);
  const amenitiesFromUrl = String(params.get('amenitiesWanted') || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
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
    possessionByMonth: params.get('possessionByMonth') || base.possessionByMonth,
    bhk: params.get('bhk') || base.bhk,
    furnishing: params.get('furnishing') || base.furnishing,
    parking: params.get('parking') || base.parking,
    facing: params.get('facing') || base.facing,
    saleType: params.get('saleType') || base.saleType,
    amenitiesWanted: amenitiesFromUrl.length > 0 ? amenitiesFromUrl : base.amenitiesWanted,
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
  if (filters.possessionByMonth) params.set('possessionByMonth', filters.possessionByMonth);
  if (filters.bhk !== 'Any') params.set('bhk', filters.bhk);
  if (filters.furnishing !== 'Any') params.set('furnishing', filters.furnishing);
  if (filters.parking !== 'Any') params.set('parking', filters.parking);
  if (filters.facing !== 'Any') params.set('facing', filters.facing);
  if (filters.saleType !== 'Any') params.set('saleType', filters.saleType);
  if (filters.amenitiesWanted.length > 0) params.set('amenitiesWanted', filters.amenitiesWanted.join(','));
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

function mapSortForApi(sort: SortKey): Exclude<SortKey, 'highest_group_discount'> {
  if (sort === 'highest_group_discount') {
    return 'recommended';
  }
  return sort;
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

function matchesAmenities(property: MarketplaceProperty, wanted: string[]): boolean {
  if (wanted.length === 0) return true;
  const normalizedAmenities = property.amenities.map((item) => normalizeText(item));
  return wanted.every((need) => normalizedAmenities.some((item) => item.includes(normalizeText(need))));
}

function matchesPossessionByMonth(property: MarketplaceProperty, possessionByMonth: string): boolean {
  if (!possessionByMonth) return true;
  if (!property.availabilityDate) {
    return formatPossessionStatus(property.possessionStatus) === 'Ready to Move';
  }
  const availableAt = new Date(property.availabilityDate);
  const target = new Date(`${possessionByMonth}-01T00:00:00`);
  if (Number.isNaN(availableAt.getTime()) || Number.isNaN(target.getTime())) return true;
  return availableAt.getTime() <= target.getTime();
}

function formatDateLabel(value?: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatSearchFocusLabel(filters: FiltersState): string {
  const location = [filters.locality, filters.city, filters.district, filters.state]
    .map((item) => item.trim())
    .filter(Boolean)
    .join(', ');
  const type = filters.propertyType === 'Any' ? 'all property types' : filters.propertyType;
  if (!location) return `All India • ${type}`;
  return `${location} • ${type}`;
}

function formatBudgetWindowLabel(filters: FiltersState): string {
  return `INR ${filters.minPriceLakh}L - ${filters.maxPriceLakh}L`;
}

function formatAreaWindowLabel(filters: FiltersState): string {
  return `${filters.minAreaSqft} - ${filters.maxAreaSqft} sq.ft`;
}

function formatTrustModeLabel(filters: FiltersState): string {
  const labels: string[] = [];
  if (filters.verifiedBuilderOnly) labels.push('Verified only');
  if (filters.governmentRefOnly) labels.push('Gov refs');
  if (filters.groupDealOnly) labels.push('Group deals');
  if (labels.length === 0) return 'Open trust mode';
  return labels.join(' • ');
}

function formatResultModeLabel(filters: FiltersState, viewMode: ViewMode): string {
  const sortLabel = SORT_OPTIONS.find((option) => option.key === filters.sort)?.label || 'Relevance';
  return `${sortLabel} • ${viewMode === 'map' ? 'Map view' : 'List view'}`;
}

function computeGroupDiscountPercent(deal: GroupDealItem | null): number {
  if (!deal) return 0;
  const base = Number(deal.basePrice || 0);
  const finalPrice = Number(deal.finalGroupPrice || 0);
  if (base > 0 && finalPrice > 0 && finalPrice < base) {
    return ((base - finalPrice) / base) * 100;
  }
  if (deal.dealType === 'PERCENT_DISCOUNT' && deal.discountValue) {
    return Math.max(0, Number(deal.discountValue));
  }
  if (deal.dealType === 'FLAT_DISCOUNT' && deal.discountValue && base > 0) {
    return (Number(deal.discountValue) / base) * 100;
  }
  return 0;
}

function computeGroupDiscountedRange(deal: GroupDealItem | null): string {
  if (!deal) return 'Builder confirmation pending';
  const base = Number(deal.basePrice || 0);
  if (base <= 0) return 'Builder confirmation pending';
  if (deal.finalGroupPrice && Number(deal.finalGroupPrice) > 0) {
    return formatPrice(Number(deal.finalGroupPrice));
  }

  const progress = Math.max(0.25, Math.min(1, Number(deal.progressPercent || 0) / 100));
  if (deal.dealType === 'PERCENT_DISCOUNT' && deal.discountValue) {
    const maxPct = Number(deal.discountValue);
    const currentPct = maxPct * progress;
    const current = Math.round(base * (1 - currentPct / 100));
    const best = Math.round(base * (1 - maxPct / 100));
    return `${formatPrice(current)} - ${formatPrice(best)}`;
  }
  if (deal.dealType === 'FLAT_DISCOUNT' && deal.discountValue) {
    const maxFlat = Number(deal.discountValue);
    const current = Math.max(0, Math.round(base - maxFlat * progress));
    const best = Math.max(0, Math.round(base - maxFlat));
    return `${formatPrice(current)} - ${formatPrice(best)}`;
  }
  return 'Builder confirmation pending';
}

export default function BuyMarketplacePage({
  onOpenDetails,
  onOpenSaved,
  onOpenMessages,
  onOpenCompare,
  onOpenSavedSearches,
  initialViewMode = 'list',
  groupDealEnabled = true,
}: BuyMarketplacePageProps) {
  const [filters, setFilters] = useState<FiltersState>(() => parseFiltersFromUrl());
  const [appliedFilters, setAppliedFilters] = useState<FiltersState>(() => parseFiltersFromUrl());
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [properties, setProperties] = useState<MarketplaceProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const [compareCount, setCompareCount] = useState(() => readComparedListings().length);
  const [compareListings, setCompareListings] = useState(() => readComparedListings());
  const [page, setPage] = useState(1);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [recentLocations, setRecentLocations] = useState<RecentLocation[]>([]);
  const [groupDealsByCode, setGroupDealsByCode] = useState<Record<string, GroupDealItem | null>>({});
  const [selectedMapPropertyId, setSelectedMapPropertyId] = useState<number | null>(null);
  const [manualMapFocusPoint, setManualMapFocusPoint] = useState<GeoPoint | null>(null);
  const [manualMapFocusLabel, setManualMapFocusLabel] = useState('');
  const [manualCoordinateQuery, setManualCoordinateQuery] = useState('');
  const [locatingCurrentPosition, setLocatingCurrentPosition] = useState(false);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [joinDealCode, setJoinDealCode] = useState('');
  const [joinDealItem, setJoinDealItem] = useState<GroupDealItem | null>(null);
  const [joinName, setJoinName] = useState('');
  const [joinPhone, setJoinPhone] = useState('');
  const [joinEmail, setJoinEmail] = useState('');
  const [joinUnitPreference, setJoinUnitPreference] = useState<GroupDealUnitType>('2BHK');
  const [joinSubmitting, setJoinSubmitting] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createPropertyId, setCreatePropertyId] = useState('');
  const [createTargetBuyers, setCreateTargetBuyers] = useState(5);
  const [createName, setCreateName] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createNote, setCreateNote] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState('');
  const resultsAnchorRef = useRef<HTMLDivElement | null>(null);
  const pageSize = 12;

  useEffect(() => {
    setViewMode(initialViewMode);
  }, [initialViewMode]);

  useEffect(() => {
    setRecentLocations(loadRecentLocations());
  }, []);

  useEffect(() => {
    if (viewMode !== 'map') return;
    void trackFeatureUsage({
      featureKey: 'buy_map_view_opened',
      context: 'buy_marketplace',
      view: 'buy-map',
    });
  }, [viewMode]);

  useEffect(() => {
    const cityLabel = appliedFilters.city.trim();
    const titlePrefix = cityLabel ? `Buy Property in ${cityLabel}` : 'Buy Property';
    const description = cityLabel
      ? `Explore verified sale listings in ${cityLabel} with filters for budget, area, BHK, and possession status.`
      : 'Explore verified sale listings across cities with filters for budget, area, BHK, and possession status.';

    applySeo({
      title: `${titlePrefix} | ZDT Realty`,
      description,
      canonicalPath: `/buy${window.location.search || ''}`,
      type: 'website',
    });
  }, [appliedFilters.city]);

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
    params.set('sort', mapSortForApi(appliedFilters.sort));
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
    if (appliedFilters.amenitiesWanted.length > 0) {
      params.set('amenities', appliedFilters.amenitiesWanted.join(','));
    }

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
        !appliedFilters.state.trim() || stateText.includes(normalizeText(appliedFilters.state));
      const matchesDistrict =
        !appliedFilters.district.trim() ||
        areaText.includes(normalizeText(appliedFilters.district)) ||
        localityText.includes(normalizeText(appliedFilters.district));
      const matchesCity =
        !appliedFilters.city.trim() || cityText.includes(normalizeText(appliedFilters.city));
      const matchesLocality =
        !appliedFilters.locality.trim() ||
        localityText.includes(normalizeText(appliedFilters.locality)) ||
        areaText.includes(normalizeText(appliedFilters.locality)) ||
        titleText.includes(normalizeText(appliedFilters.locality));
      const matchesType = matchesPropertyTypeBucket(property, appliedFilters.propertyType);
      const matchesStatusFilter = matchesStatus(property, appliedFilters.status);
      const matchesPossessionMonth = matchesPossessionByMonth(property, appliedFilters.possessionByMonth);
      const matchesSale = matchesSaleType(property, appliedFilters.saleType);
      const matchesFurnishingFilter = matchesFurnishing(property, appliedFilters.furnishing);
      const matchesParkingFilter =
        appliedFilters.parking === 'Any'
          ? true
          : appliedFilters.parking === 'Yes'
            ? hasParkingAmenity(property)
            : !hasParkingAmenity(property);
      const matchesFacingFilter =
        appliedFilters.facing === 'Any' ||
        normalizeText(property.facing) === normalizeText(appliedFilters.facing);
      const matchesBhkFilter =
        appliedFilters.bhk === 'Any'
          ? true
          : appliedFilters.bhk === '5+'
            ? Number(property.bhk || property.bedrooms || 0) >= 5
            : Number(property.bhk || property.bedrooms || 0) === Number(appliedFilters.bhk);
      const matchesAmenitiesFilter = matchesAmenities(property, appliedFilters.amenitiesWanted);
      const areaSqft = resolveAreaSqft(property);
      const matchesArea =
        areaSqft <= 0 ||
        (areaSqft >= appliedFilters.minAreaSqft && areaSqft <= appliedFilters.maxAreaSqft);
      const priceLakh = property.price && property.price > 0 ? property.price / 100000 : 0;
      const matchesBudget =
        priceLakh <= 0 ||
        (priceLakh >= appliedFilters.minPriceLakh && priceLakh <= appliedFilters.maxPriceLakh);
      const hasGroupDeal = Boolean(String(property.activeGroupDealCode || '').trim());
      const matchesGroupDeal = !appliedFilters.groupDealOnly || hasGroupDeal;
      const matchesVerified = !appliedFilters.verifiedBuilderOnly || property.isVerified;
      const hasGovReference = Boolean(String(property.reraNumber || '').trim());
      const matchesGov = !appliedFilters.governmentRefOnly || hasGovReference;

      return (
        matchesState &&
        matchesDistrict &&
        matchesCity &&
        matchesLocality &&
        matchesType &&
        matchesStatusFilter &&
        matchesPossessionMonth &&
        matchesSale &&
        matchesFurnishingFilter &&
        matchesParkingFilter &&
        matchesFacingFilter &&
        matchesBhkFilter &&
        matchesAmenitiesFilter &&
        matchesArea &&
        matchesBudget &&
        matchesGroupDeal &&
        matchesVerified &&
        matchesGov
      );
    });
  }, [appliedFilters, properties]);

  const sortedProperties = useMemo(() => {
    if (appliedFilters.sort !== 'highest_group_discount') {
      return filteredProperties;
    }
    return [...filteredProperties].sort((a, b) => {
      const aDealCode = String(a.activeGroupDealCode || '').trim();
      const bDealCode = String(b.activeGroupDealCode || '').trim();
      const aDiscount = computeGroupDiscountPercent(groupDealsByCode[aDealCode] || null);
      const bDiscount = computeGroupDiscountPercent(groupDealsByCode[bDealCode] || null);
      return bDiscount - aDiscount;
    });
  }, [appliedFilters.sort, filteredProperties, groupDealsByCode]);

  const summary = useMemo(() => {
    const visibleCount = sortedProperties.length.toLocaleString('en-IN');
    const totalCount = total.toLocaleString('en-IN');
    return `${visibleCount} matched listings from ${totalCount} verified market records`;
  }, [sortedProperties.length, total]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(sortedProperties.length / pageSize)),
    [sortedProperties.length, pageSize]
  );

  const pagedProperties = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedProperties.slice(start, start + pageSize);
  }, [sortedProperties, page, pageSize]);

  const showingFrom = sortedProperties.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(sortedProperties.length, page * pageSize);

  const defaultMapFocusLabel = useMemo(() => {
    const parts = [
      appliedFilters.locality,
      appliedFilters.city,
      appliedFilters.district,
      appliedFilters.state,
    ]
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
    return parts.join(', ') || 'India';
  }, [
    appliedFilters.locality,
    appliedFilters.city,
    appliedFilters.district,
    appliedFilters.state,
  ]);

  const nearbyMapProperties = useMemo(() => {
    const focusTokens = [
      appliedFilters.locality,
      appliedFilters.city,
      appliedFilters.district,
      appliedFilters.state,
    ]
      .map((entry) => normalizeText(entry))
      .filter(Boolean);

    if (focusTokens.length === 0) return sortedProperties;

    const scoreProperty = (property: MarketplaceProperty): number => {
      const haystack = normalizeText(
        [property.locality, property.area, property.city, property.state].filter(Boolean).join(' ')
      );
      return focusTokens.reduce((score, token) => (haystack.includes(token) ? score + 1 : score), 0);
    };

    return [...sortedProperties].sort((a, b) => {
      const scoreDiff = scoreProperty(b) - scoreProperty(a);
      if (scoreDiff !== 0) return scoreDiff;
      return Number(b.id) - Number(a.id);
    });
  }, [
    appliedFilters.locality,
    appliedFilters.city,
    appliedFilters.district,
    appliedFilters.state,
    sortedProperties,
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

  const recordRecentLocation = useCallback((nextFilters: FiltersState) => {
    const next: RecentLocation = {
      state: String(nextFilters.state || '').trim(),
      district: String(nextFilters.district || '').trim(),
      city: String(nextFilters.city || '').trim(),
      locality: String(nextFilters.locality || '').trim(),
      createdAt: new Date().toISOString(),
    };
    const label = formatRecentLocationLabel(next);
    if (!label) return;

    setRecentLocations((prev) => {
      const merged = [
        next,
        ...prev.filter((item) => normalizeText(formatRecentLocationLabel(item)) !== normalizeText(label)),
      ].slice(0, MAX_RECENT_LOCATIONS);
      saveRecentLocations(merged);
      return merged;
    });
  }, []);

  const openJoinGroupDeal = async (dealCode: string) => {
    if (!dealCode) return;
    setJoinDialogOpen(true);
    setJoinDealCode(dealCode);
    const existing = groupDealsByCode[dealCode];
    if (existing !== undefined) {
      setJoinDealItem(existing);
      return;
    }
    setJoinDealItem(null);
    try {
      const response = await getGroupDealByCode(dealCode);
      setJoinDealItem(response.item || null);
      setGroupDealsByCode((prev) => ({ ...prev, [dealCode]: response.item || null }));
    } catch {
      setJoinDealItem(null);
      toast.error('Unable to load group deal details right now.');
    }
  };

  const handleJoinSubmit = async () => {
    if (!joinDealCode) return;
    if (!joinName.trim()) {
      toast.error('Please enter your full name.');
      return;
    }
    try {
      setJoinSubmitting(true);
      await joinGroupDeal(joinDealCode, {
        fullName: joinName.trim(),
        phone: joinPhone.trim(),
        email: joinEmail.trim(),
        unitPreference: joinUnitPreference,
        consent: true,
      });
      toast.success('Group deal interest submitted. Builder confirmation is required.');
      setJoinDialogOpen(false);
      setJoinName('');
      setJoinPhone('');
      setJoinEmail('');
      setJoinUnitPreference('2BHK');
      const latest = await getGroupDealByCode(joinDealCode);
      setGroupDealsByCode((prev) => ({ ...prev, [joinDealCode]: latest.item || null }));
    } catch (joinError) {
      toast.error(joinError instanceof Error ? joinError.message : 'Unable to join group deal');
    } finally {
      setJoinSubmitting(false);
    }
  };

  const handleCreateGroupDeal = async () => {
    const propertyId = Number(createPropertyId || 0);
    if (!propertyId) {
      toast.error('Select a property first.');
      return;
    }
    if (!createName.trim() || !createPhone.trim()) {
      toast.error('Name and phone are required.');
      return;
    }

    const chosenProperty = properties.find((item) => item.id === propertyId);
    if (!chosenProperty) {
      toast.error('Selected property is not available.');
      return;
    }

    const estimatedDiscount = Math.min(15, Math.max(2, Number(createTargetBuyers || 0) * 1.15));
    const noteParts = [
      `Target buyers: ${createTargetBuyers}`,
      `Estimated discount: ${estimatedDiscount.toFixed(1)}%`,
      createNote.trim() || '',
    ].filter(Boolean);

    try {
      setCreateSubmitting(true);
      const response = await createGroupDealRequest({
        propertyId,
        fullName: createName.trim(),
        phone: createPhone.trim(),
        email: createEmail.trim(),
        note: noteParts.join(' | '),
        consent: true,
      });

      const inviteCode = `ZDT-${propertyId}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const inviteLink = `${window.location.origin}/buy?groupInvite=${encodeURIComponent(inviteCode)}&propertyId=${propertyId}`;
      setLastInviteLink(inviteLink);
      try {
        await navigator.clipboard.writeText(inviteLink);
        toast.success('Group deal created and invite link copied.');
      } catch {
        toast.success('Group deal created.');
      }
      toast.message(`Request ID: ${response.requestId}`);
      setCreateDialogOpen(false);
      setCreatePropertyId('');
      setCreateName('');
      setCreatePhone('');
      setCreateEmail('');
      setCreateNote('');
      setCreateTargetBuyers(5);
    } catch (createError) {
      toast.error(createError instanceof Error ? createError.message : 'Unable to create group deal request');
    } finally {
      setCreateSubmitting(false);
    }
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
    recordRecentLocation(filters);
    setMobileFiltersOpen(false);
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
    setMobileFiltersOpen(false);
  };

  useEffect(() => {
    setPage(1);
  }, [viewMode, appliedFilters]);

  useEffect(() => {
    if (page <= totalPages) return;
    setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    const sync = () => {
      const next = readComparedListings();
      setCompareListings(next);
      setCompareCount(next.length);
    };
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

  useEffect(() => {
    if (!groupDealEnabled) return;
    const dealCodes = Array.from(
      new Set(
        sortedProperties
          .map((item) => String(item.activeGroupDealCode || '').trim())
          .filter(Boolean)
      )
    );
    const missingCodes = dealCodes.filter((dealCode) => !(dealCode in groupDealsByCode));
    if (missingCodes.length === 0) return;

    let cancelled = false;
    Promise.all(
      missingCodes.map(async (dealCode) => {
        try {
          const response = await getGroupDealByCode(dealCode);
          return { dealCode, item: response.item || null };
        } catch {
          return { dealCode, item: null };
        }
      })
    ).then((rows) => {
      if (cancelled) return;
      setGroupDealsByCode((prev) => {
        const next = { ...prev };
        rows.forEach((row) => {
          next[row.dealCode] = row.item;
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [groupDealEnabled, sortedProperties, groupDealsByCode]);

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string }> = [];
    if (appliedFilters.state.trim()) chips.push({ key: 'state', label: `State: ${appliedFilters.state.trim()}` });
    if (appliedFilters.district.trim()) chips.push({ key: 'district', label: `District: ${appliedFilters.district.trim()}` });
    if (appliedFilters.city.trim()) chips.push({ key: 'city', label: `City: ${appliedFilters.city.trim()}` });
    if (appliedFilters.locality.trim()) chips.push({ key: 'locality', label: `Locality: ${appliedFilters.locality.trim()}` });
    if (appliedFilters.propertyType !== 'Any') chips.push({ key: 'propertyType', label: appliedFilters.propertyType });
    if (appliedFilters.status !== 'Any') chips.push({ key: 'status', label: appliedFilters.status });
    if (appliedFilters.possessionByMonth) chips.push({ key: 'possessionByMonth', label: `Possession by ${appliedFilters.possessionByMonth}` });
    if (appliedFilters.bhk !== 'Any') chips.push({ key: 'bhk', label: `${appliedFilters.bhk} BHK` });
    if (appliedFilters.furnishing !== 'Any') chips.push({ key: 'furnishing', label: appliedFilters.furnishing });
    if (appliedFilters.parking !== 'Any') chips.push({ key: 'parking', label: `Parking: ${appliedFilters.parking}` });
    if (appliedFilters.facing !== 'Any') chips.push({ key: 'facing', label: `Facing: ${appliedFilters.facing}` });
    if (appliedFilters.saleType !== 'Any') chips.push({ key: 'saleType', label: appliedFilters.saleType });
    if (appliedFilters.amenitiesWanted.length > 0) chips.push({ key: 'amenitiesWanted', label: `Amenities: ${appliedFilters.amenitiesWanted.join(', ')}` });
    if (appliedFilters.groupDealOnly) chips.push({ key: 'groupDealOnly', label: 'Group Deal Only' });
    if (appliedFilters.verifiedBuilderOnly) chips.push({ key: 'verifiedBuilderOnly', label: 'Verified Only' });
    if (appliedFilters.governmentRefOnly) chips.push({ key: 'governmentRefOnly', label: 'Gov Ref Only' });
    return chips;
  }, [appliedFilters]);

  const searchBlueprintCards = useMemo(
    () => [
      {
        key: 'focus',
        label: 'Search Focus',
        value: formatSearchFocusLabel(appliedFilters),
        note:
          activeFilterChips.length > 0
            ? `${activeFilterChips.length} active filters are shaping this search.`
            : 'Primary search is still broad and discovery-oriented.',
        icon: <SearchCheck className="h-4 w-4" />,
      },
      {
        key: 'budget',
        label: 'Budget & Space',
        value: formatBudgetWindowLabel(appliedFilters),
        note: `${formatAreaWindowLabel(appliedFilters)} target footprint`,
        icon: <SlidersHorizontal className="h-4 w-4" />,
      },
      {
        key: 'trust',
        label: 'Trust Mode',
        value: formatTrustModeLabel(appliedFilters),
        note: `${sortedProperties.length.toLocaleString('en-IN')} listings match your current trust filters.`,
        icon: <ShieldCheck className="h-4 w-4" />,
      },
      {
        key: 'result-mode',
        label: 'Result Mode',
        value: formatResultModeLabel(appliedFilters, viewMode),
        note:
          compareCount > 0
            ? `${compareCount} listings are ready in compare tray.`
            : 'No compare shortlist yet. Add listings to review side by side.',
        icon: <GitCompareArrows className="h-4 w-4" />,
      },
    ],
    [activeFilterChips.length, appliedFilters, compareCount, sortedProperties.length, viewMode]
  );

  const compareTraySlotsRemaining = Math.max(0, 4 - compareListings.length);

  const removeFilterChip = (key: string) => {
    const updater = (prev: FiltersState): FiltersState => {
      if (key === 'state') return { ...prev, state: '' };
      if (key === 'district') return { ...prev, district: '' };
      if (key === 'city') return { ...prev, city: '' };
      if (key === 'locality') return { ...prev, locality: '' };
      if (key === 'propertyType') return { ...prev, propertyType: DEFAULT_FILTERS.propertyType };
      if (key === 'status') return { ...prev, status: DEFAULT_FILTERS.status };
      if (key === 'possessionByMonth') return { ...prev, possessionByMonth: DEFAULT_FILTERS.possessionByMonth };
      if (key === 'bhk') return { ...prev, bhk: DEFAULT_FILTERS.bhk };
      if (key === 'furnishing') return { ...prev, furnishing: DEFAULT_FILTERS.furnishing };
      if (key === 'parking') return { ...prev, parking: DEFAULT_FILTERS.parking };
      if (key === 'facing') return { ...prev, facing: DEFAULT_FILTERS.facing };
      if (key === 'saleType') return { ...prev, saleType: DEFAULT_FILTERS.saleType };
      if (key === 'amenitiesWanted') return { ...prev, amenitiesWanted: [] };
      if (key === 'groupDealOnly') return { ...prev, groupDealOnly: false };
      if (key === 'verifiedBuilderOnly') return { ...prev, verifiedBuilderOnly: false };
      if (key === 'governmentRefOnly') return { ...prev, governmentRefOnly: false };
      return prev;
    };
    setFilters(updater);
    setAppliedFilters(updater);
  };

  const handleSaveSearch = () => {
    const primaryLocation = appliedFilters.locality || appliedFilters.city || appliedFilters.district || appliedFilters.state || 'All India';
    const label = `Buy | ${primaryLocation} | ${appliedFilters.propertyType === 'Any' ? 'All types' : appliedFilters.propertyType}`;
    addSavedSearch({
      label,
      targetView: 'buy',
      criteria: appliedFilters,
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
    <section
      className={`portal-mobile-page pt-28 text-slate-900 ${
        compareListings.length > 0 ? 'pb-56 sm:pb-48' : 'pb-16'
      }`}
    >
      <div className="page-container portal-mobile-stack space-y-6">
        <div className="portal-mobile-panel overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-gradient-to-r from-blue-950 via-blue-900 to-blue-800 px-6 py-6 text-white">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <h1 className="text-3xl font-semibold sm:text-4xl">Buy Verified Properties with Confidence</h1>
                <p className="mt-2 text-sm text-blue-100 sm:text-base">
                  Explore trusted properties from verified builders across India. Transparent pricing. Group deals available.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button className="bg-white text-blue-900 hover:bg-blue-50" onClick={() => resultsAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                    Browse Properties
                  </Button>
                  {groupDealEnabled ? (
                    <Button
                      variant="outline"
                      className="border-white/40 bg-white/10 text-white hover:bg-white/20"
                      onClick={() => setCreateDialogOpen(true)}
                    >
                      Create Group Deal
                    </Button>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/60 bg-emerald-100/10 px-2.5 py-1 text-emerald-100">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    Builder Verified
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-blue-200/60 bg-blue-100/10 px-2.5 py-1 text-blue-100">
                    <ShieldQuestion className="h-3.5 w-3.5" />
                    Ownership Check (In Progress / Verified)
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/60 bg-amber-100/10 px-2.5 py-1 text-amber-100">
                    <Landmark className="h-3.5 w-3.5" />
                    Government References (Where Available)
                  </span>
                </div>
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
                placeholder="India - State"
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
                placeholder="City"
                className="h-11"
                suggestKind="india"
                indiaValueField="subdistrict"
                indiaState={filters.state}
                indiaDistrict={filters.district}
              />
              <LgdLocationInput
                value={filters.locality}
                onChange={(value) => setFilters((prev) => ({ ...prev, locality: value }))}
                placeholder="Locality"
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
            {recentLocations.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {recentLocations.map((entry) => (
                  <button
                    key={`${formatRecentLocationLabel(entry)}-${entry.createdAt}`}
                    type="button"
                    onClick={() =>
                      setFilters((prev) => ({
                        ...prev,
                        state: entry.state,
                        district: entry.district,
                        city: entry.city,
                        locality: entry.locality,
                      }))
                    }
                    className="portal-mobile-chip rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 transition hover:border-slate-300"
                  >
                    {formatRecentLocationLabel(entry)}
                  </button>
                ))}
              </div>
            ) : null}
            <LgdLocationAccuracyNote className="mt-3" />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 xl:hidden">
          <Button variant="outline" className="border-slate-300" onClick={handleApplyFilters}>
            Apply Filters
          </Button>
          <Drawer open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen} direction="right">
            <DrawerTrigger asChild>
              <Button variant="outline" className="border-slate-300">
                <Filter className="mr-2 h-4 w-4" />
                Filters
              </Button>
            </DrawerTrigger>
            <DrawerContent className="w-full border-l border-slate-200 bg-white p-0 sm:max-w-sm">
              <DrawerHeader className="border-b border-slate-200">
                <DrawerTitle>Smart Filters</DrawerTitle>
                <DrawerDescription>Flipkart-style quick filters for location, budget, trust, and group deals.</DrawerDescription>
              </DrawerHeader>
              <div className="max-h-[70vh] overflow-auto p-4">
                <div className="space-y-4">
                  <Input
                    type="month"
                    value={filters.possessionByMonth}
                    onChange={(event) => setFilters((prev) => ({ ...prev, possessionByMonth: event.target.value }))}
                    className="h-10"
                    placeholder="Possession by"
                  />
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Amenities</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {AMENITY_OPTIONS.map((amenity) => {
                        const selected = filters.amenitiesWanted.includes(amenity);
                        return (
                          <label key={amenity} className="inline-flex items-center gap-2 text-xs text-slate-700">
                            <Checkbox
                              checked={selected}
                              onCheckedChange={(value) =>
                                setFilters((prev) => ({
                                  ...prev,
                                  amenitiesWanted: value === true
                                    ? Array.from(new Set([...prev.amenitiesWanted, amenity]))
                                    : prev.amenitiesWanted.filter((item) => item !== amenity),
                                }))
                              }
                            />
                            {amenity}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  {groupDealEnabled ? (
                    <label className="flex min-h-12 items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">
                      Group Deal Available
                      <Checkbox
                        checked={filters.groupDealOnly}
                        onCheckedChange={(value) => setFilters((prev) => ({ ...prev, groupDealOnly: value === true }))}
                      />
                    </label>
                  ) : null}
                  <label className="flex min-h-12 items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">
                    Verified Builder
                    <Checkbox
                      checked={filters.verifiedBuilderOnly}
                      onCheckedChange={(value) =>
                        setFilters((prev) => ({ ...prev, verifiedBuilderOnly: Boolean(value) }))
                      }
                    />
                  </label>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 p-4">
                <Button variant="outline" onClick={handleResetFilters}>
                  Reset
                </Button>
                <DrawerClose asChild>
                  <Button className="bg-slate-900 text-white hover:bg-slate-800" onClick={handleApplyFilters}>
                    Apply
                  </Button>
                </DrawerClose>
              </div>
            </DrawerContent>
          </Drawer>
        </div>

        <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm xl:sticky xl:top-24 xl:block xl:self-start">
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Possession By</p>
              <Input
                type="month"
                value={filters.possessionByMonth}
                onChange={(event) => setFilters((prev) => ({ ...prev, possessionByMonth: event.target.value }))}
                className="h-10 bg-white"
              />
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

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Amenities</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {AMENITY_OPTIONS.map((amenity) => {
                  const selected = filters.amenitiesWanted.includes(amenity);
                  return (
                    <label key={amenity} className="inline-flex items-center gap-2 text-xs text-slate-700">
                      <Checkbox
                        checked={selected}
                        onCheckedChange={(value) =>
                          setFilters((prev) => ({
                            ...prev,
                            amenitiesWanted: value === true
                              ? Array.from(new Set([...prev.amenitiesWanted, amenity]))
                              : prev.amenitiesWanted.filter((item) => item !== amenity),
                          }))
                        }
                      />
                      {amenity}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {groupDealEnabled ? (
              <label className="flex min-h-16 items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">
                Group Deal Available
                <Checkbox
                  checked={filters.groupDealOnly}
                  onCheckedChange={(value) => setFilters((prev) => ({ ...prev, groupDealOnly: Boolean(value) }))}
                />
              </label>
            ) : null}
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
              {groupDealEnabled ? (
                <Button variant="outline" onClick={() => setCreateDialogOpen(true)}>
                  <Users className="mr-2 h-4 w-4" />
                  Create Group Deal
                </Button>
              ) : null}
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

        <div ref={resultsAnchorRef} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">Property Results</h2>
              <p className="text-sm text-slate-600">{summary}</p>
              {viewMode === 'list' && sortedProperties.length > 0 && (
                <p className="text-xs text-slate-500">
                  Showing {showingFrom}-{showingTo} of {sortedProperties.length}
                </p>
              )}
            </div>
            <div className="portal-mobile-chip inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Trust-first listing view
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            {searchBlueprintCards.map((card) => (
              <article
                key={card.key}
                className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fbff)] p-4 shadow-sm"
              >
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700">
                  {card.icon}
                </div>
                <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {card.label}
                </p>
                <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-900">{card.value}</p>
                <p className="mt-2 text-xs leading-5 text-slate-600">{card.note}</p>
              </article>
            ))}
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

          {loading ? (
            <PropertyCardsSkeleton />
          ) : error ? (
            <div className="portal-mobile-card rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
          ) : viewMode === 'map' ? (
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
                    <span className="portal-mobile-chip rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-600">
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
                <div className="portal-mobile-card rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <p className="text-sm font-semibold text-slate-900">Nearby Properties</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Ranked by selected location filters. Exact coordinates: {mapPropertiesWithCoordinates.length} /{' '}
                    {nearbyMapProperties.length}
                  </p>
                </div>
                {nearbyMapProperties.length === 0 ? (
                  <div className="portal-mobile-card rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
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
          ) : sortedProperties.length === 0 ? (
            <EmptyState
              variant="no-results"
              title="No properties match your filters"
              description="Adjust your search criteria, try a different city, or reset filters to see all available listings."
              actionLabel="Reset Filters"
              onAction={handleResetFilters}
            />
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {pagedProperties.map((property) => (
                  <PropertyCard
                    key={property.id}
                    property={property}
                    groupDealEnabled={groupDealEnabled}
                    groupDeal={groupDealsByCode[String(property.activeGroupDealCode || '').trim()] || null}
                    onOpenDetails={onOpenDetails}
                    onOpenMessages={onOpenMessages}
                    onOpenCompare={onOpenCompare}
                    onJoinGroupDeal={openJoinGroupDeal}
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

        <div className="portal-mobile-panel rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-base font-semibold text-slate-900">Trust & Transparency</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="portal-mobile-card rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-900">Builder Verified</p>
              <p className="mt-1 text-xs text-slate-600">
                Builder verification confirms identity and core business profile checks.
              </p>
            </div>
            <div className="portal-mobile-card rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-900">Ownership Check - In Progress</p>
              <p className="mt-1 text-xs text-slate-600">
                Ownership status reflects available records. Final legal due diligence is still required before payment.
              </p>
            </div>
            <div className="portal-mobile-card rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-900">Group Deal Legal Clarity</p>
              <p className="mt-1 text-xs text-slate-600">
                Group deals indicate buyer interest. Final pricing and allotment are confirmed by the builder.
              </p>
            </div>
          </div>
        </div>

        <div className="portal-mobile-panel rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-base font-semibold text-slate-900">Dashboard Integration</h3>
          <div className="mt-3 grid gap-2 text-xs text-slate-700 sm:grid-cols-2 xl:grid-cols-4">
            <div className="portal-mobile-card rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="font-semibold">Joined Group Deals</p>
              <p className="mt-1 text-slate-600">Track progress, slots, and builder confirmations.</p>
            </div>
            <div className="portal-mobile-card rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="font-semibold">Property Interest</p>
              <p className="mt-1 text-slate-600">Monitor shortlisted properties and revisit details quickly.</p>
            </div>
            <div className="portal-mobile-card rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="font-semibold">Contact Builders</p>
              <p className="mt-1 text-slate-600">Continue direct conversations with verified builders.</p>
            </div>
            <div className="portal-mobile-card rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="font-semibold">Deal Updates</p>
              <p className="mt-1 text-slate-600">Receive listing and group deal updates transparently.</p>
            </div>
          </div>
        </div>

        <p className="portal-mobile-card rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
          ZDT Realty is an early-stage startup focused on verified listings, transparent pricing, and long-term trust.
        </p>
      </div>

      {compareListings.length > 0 ? (
        <div className="fixed inset-x-3 bottom-3 z-50 sm:inset-x-6 sm:bottom-4">
          <div className="mx-auto w-full max-w-6xl rounded-[28px] border border-slate-200 bg-white/95 p-4 shadow-[0_28px_60px_-30px_rgba(15,23,42,0.4)] backdrop-blur-xl sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700">
                  Sticky Compare Tray
                </p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">
                  {compareListings.length} listing{compareListings.length === 1 ? '' : 's'} ready for side-by-side review
                </h3>
                <p className="mt-1 text-xs text-slate-600">
                  Remove weak options here, then open the compare board when your shortlist is tight.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="border-slate-300"
                  onClick={() => {
                    clearComparedListings();
                    toast.success('Compare tray cleared');
                  }}
                >
                  Clear Tray
                </Button>
                <Button
                  className="bg-slate-900 text-white hover:bg-slate-800"
                  onClick={onOpenCompare}
                  disabled={!onOpenCompare}
                >
                  <GitCompareArrows className="mr-2 h-4 w-4" />
                  Open Compare
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {compareListings.map((item) => (
                <article
                  key={`compare-tray-${item.referenceId}`}
                  className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-16 w-20 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                      <img
                        src={item.image || '/images/property-1.jpg'}
                        alt={item.title}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        {item.city || 'Buy Listing'}
                      </p>
                      <h4 className="line-clamp-2 text-sm font-semibold text-slate-900">{item.title}</h4>
                      <p className="mt-1 truncate text-xs text-slate-600">{item.area}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{item.priceLabel}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      className="border-slate-300"
                      onClick={() => onOpenDetails(item.referenceId)}
                    >
                      Details
                    </Button>
                    <Button
                      variant="outline"
                      className="border-slate-300 text-rose-700 hover:bg-rose-50 hover:text-rose-700"
                      onClick={() => {
                        removeComparedListing(item.referenceId);
                        toast.success('Removed from compare tray');
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </article>
              ))}

              {compareTraySlotsRemaining > 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                  <p className="font-semibold text-slate-900">Add {compareTraySlotsRemaining} more listing{compareTraySlotsRemaining === 1 ? '' : 's'}</p>
                  <p className="mt-1 text-xs leading-5">
                    Use compare on any card to fill the tray up to 4 listings and make decision-making faster.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <Dialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen}>
        <DialogContent className="max-w-lg border border-slate-200 bg-white">
          <DialogHeader>
            <DialogTitle>Join Group Deal</DialogTitle>
            <DialogDescription>
              Join current interest pool. No payment is required at this stage.
            </DialogDescription>
          </DialogHeader>
          {joinDealItem ? (
            <div className="portal-mobile-card rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs text-slate-700">
              <p><span className="font-semibold">Original price:</span> {formatPrice(Number(joinDealItem.basePrice || 0) || null)}</p>
              <p><span className="font-semibold">Discounted range:</span> {computeGroupDiscountedRange(joinDealItem)}</p>
              <p>
                <span className="font-semibold">Participants:</span> {joinDealItem.joinedBuyers} of {joinDealItem.minBuyers}
              </p>
              <p>
                <span className="font-semibold">Remaining slots:</span>{' '}
                {Math.max(0, Number(joinDealItem.minBuyers || 0) - Number(joinDealItem.joinedBuyers || 0))}
              </p>
            </div>
          ) : null}
          <div className="grid gap-2">
            <Input value={joinName} onChange={(event) => setJoinName(event.target.value)} placeholder="Full name" />
            <Input value={joinPhone} onChange={(event) => setJoinPhone(event.target.value)} placeholder="Phone number" />
            <Input value={joinEmail} onChange={(event) => setJoinEmail(event.target.value)} placeholder="Email (optional)" />
            <Select value={joinUnitPreference} onValueChange={(value: GroupDealUnitType) => setJoinUnitPreference(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Unit preference" />
              </SelectTrigger>
              <SelectContent>
                {JOIN_UNIT_OPTIONS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
            Group deals indicate buyer interest. Final pricing and allotment are confirmed by the builder.
          </p>
          <Button className="w-full bg-slate-900 text-white hover:bg-slate-800" onClick={handleJoinSubmit} disabled={joinSubmitting}>
            {joinSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting
              </>
            ) : (
              'Submit Interest'
            )}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl border border-slate-200 bg-white">
          <DialogHeader>
            <DialogTitle>Create Group Deal</DialogTitle>
            <DialogDescription>
              Select property, set target buyers, and generate an invite link.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Select value={createPropertyId} onValueChange={setCreatePropertyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select property" />
                </SelectTrigger>
                <SelectContent>
                  {sortedProperties.slice(0, 40).map((item) => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.title} - {item.city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={2}
                max={25}
                value={String(createTargetBuyers)}
                onChange={(event) =>
                  setCreateTargetBuyers(Math.max(2, Math.min(25, Number(event.target.value || 2))))
                }
                placeholder="Target buyers"
              />
              <Input value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder="Your name" />
              <Input value={createPhone} onChange={(event) => setCreatePhone(event.target.value)} placeholder="Phone number" />
              <Input value={createEmail} onChange={(event) => setCreateEmail(event.target.value)} placeholder="Email (optional)" />
              <Textarea value={createNote} onChange={(event) => setCreateNote(event.target.value)} placeholder="Optional note" className="min-h-20" />
            </div>
            <div className="space-y-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                <p><span className="font-semibold">Estimated discount:</span> {Math.min(15, Math.max(2, createTargetBuyers * 1.15)).toFixed(1)}%</p>
                <p><span className="font-semibold">Participants tracked:</span> 1 / {createTargetBuyers}</p>
                <p className="mt-1">Larger groups may unlock better builder-negotiated pricing.</p>
              </div>
              {lastInviteLink ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                  <p className="font-semibold">Latest invite link</p>
                  <p className="mt-1 break-all">{lastInviteLink}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(lastInviteLink);
                        toast.success('Invite link copied');
                      } catch {
                        toast.error('Unable to copy invite link');
                      }
                    }}
                  >
                    <Copy className="mr-1 h-3.5 w-3.5" />
                    Copy Link
                  </Button>
                </div>
              ) : null}
              <p className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
                Group deals indicate buyer interest. Final pricing and allotment are confirmed by the builder.
              </p>
            </div>
          </div>
          <Button className="w-full bg-slate-900 text-white hover:bg-slate-800" onClick={handleCreateGroupDeal} disabled={createSubmitting}>
            {createSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating
              </>
            ) : (
              'Create Group Deal Request'
            )}
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function PropertyCard({
  property,
  groupDealEnabled,
  groupDeal,
  onOpenDetails,
  onOpenMessages,
  onOpenCompare,
  onJoinGroupDeal,
}: {
  property: MarketplaceProperty;
  groupDealEnabled: boolean;
  groupDeal: GroupDealItem | null;
  onOpenDetails: (propertyId: string) => void;
  onOpenMessages: (propertyReference?: string) => void;
  onOpenCompare?: () => void;
  onJoinGroupDeal: (dealCode: string) => void;
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
  const hasGroupDealAndEnabled = groupDealEnabled && hasGroupDeal;
  const areaSqft = resolveAreaSqft(property);
  const bhkLabel =
    Number(property.bhk || property.bedrooms || 0) > 0
      ? `${property.bhk || property.bedrooms} BHK`
      : property.propertyType;
  const statusLabel = formatPossessionStatus(property.possessionStatus);
  const builderName = property.companyName || 'Verified Builder';
  const ownershipStatus = property.isVerified ? 'Verified' : 'In Progress';
  const availabilityLabel = normalizeText(property.activeGroupDealStatus) === 'full'
    ? 'Limited'
    : normalizeText(property.possessionStatus).includes('sold')
      ? 'Sold'
      : 'Available';
  const availabilityClass =
    availabilityLabel === 'Sold'
      ? 'border-red-200 bg-red-50 text-red-700'
      : availabilityLabel === 'Limited'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700';
  const groupProgress =
    groupDeal
      ? Math.max(
          0,
          Math.min(
            100,
            Number(
              groupDeal.progressPercent ||
                Math.round((Number(groupDeal.joinedBuyers || 0) / Math.max(1, Number(groupDeal.minBuyers || 1))) * 100)
            )
          )
        )
      : 0;

  const handleCallContact = () => {
    const opened = openPhoneDialer(property.publicContactPhone);
    if (!opened) {
      onOpenMessages(referenceId);
      toast.info('Phone number unavailable. Opened in-app chat.');
    }
  };

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
    <article className="portal-mobile-card overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative">
        <img
          src={property.primaryImage || '/images/property-1.jpg'}
          alt={property.title}
          className="h-48 w-full object-cover"
          loading="lazy"
        />
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${availabilityClass}`}>
            {availabilityLabel}
          </span>
          {hasGroupDealAndEnabled && <Badge className="bg-indigo-700 text-white hover:bg-indigo-700">Group Deal Available</Badge>}
          {property.isVerified && (
            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
              <BadgeCheck className="mr-1 h-3.5 w-3.5" />
              Verified Builder
            </Badge>
          )}
        </div>
      </div>

      <div className="space-y-3 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{builderName}</p>
        <h3 className="line-clamp-2 text-base font-semibold text-slate-900">{property.title}</h3>
        <p className="inline-flex items-center gap-1 text-xs text-slate-600">
          <MapPin className="h-3.5 w-3.5 text-slate-500" />
          {property.locality || property.area}, {property.city}
        </p>

        <div>
          <p className="text-lg font-semibold text-slate-900">{formatPrice(property.price)}</p>
          <p className="text-xs text-slate-600">
            {property.pricePerSqft && property.pricePerSqft > 0
              ? `INR ${Math.round(property.pricePerSqft).toLocaleString('en-IN')} / sq.ft`
              : 'Price per sq.ft on request'}
          </p>
        </div>

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
            <span className="portal-mobile-chip inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              Builder Verified
            </span>
          )}
          <span className="portal-mobile-chip inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-700">
            <ShieldCheck className="h-3.5 w-3.5" />
            Ownership: {ownershipStatus}
          </span>
          {hasGovernmentReference && (
            <span className="portal-mobile-chip inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-800">
              <Landmark className="h-3.5 w-3.5" />
              Government Reference
            </span>
          )}
          {hasGroupDealAndEnabled && (
            <span className="portal-mobile-chip inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-indigo-700">
              <Users className="h-3.5 w-3.5" />
              Group Deal
            </span>
          )}
        </div>

        {hasGroupDealAndEnabled && groupDeal && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 text-xs text-slate-700">
            <p><span className="font-semibold">Original Price:</span> {formatPrice(Number(groupDeal.basePrice || 0) || null)}</p>
            <p><span className="font-semibold">Discounted Price Range:</span> {computeGroupDiscountedRange(groupDeal)}</p>
            <p>
              <span className="font-semibold">Participants:</span> {groupDeal.joinedBuyers} of {groupDeal.minBuyers}
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-indigo-100">
              <div className="h-full rounded-full bg-indigo-600" style={{ width: `${groupProgress}%` }} />
            </div>
            <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-600">
              <Clock3 className="h-3.5 w-3.5" />
              {groupDeal.validUntil ? `Time limit: ${formatDateLabel(groupDeal.validUntil)}` : 'No fixed deadline'}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button className="h-11 bg-slate-900 text-white hover:bg-slate-800" onClick={() => onOpenDetails(referenceId)}>
            View Details
          </Button>
          {hasGroupDealAndEnabled ? (
            <Button
              variant="outline"
              className="h-11 border-indigo-300 text-indigo-800 hover:bg-indigo-50 hover:text-indigo-900"
              onClick={() => onJoinGroupDeal(String(property.activeGroupDealCode || '').trim())}
            >
              Join Group Deal
            </Button>
          ) : (
            <Button
              variant="outline"
              className="h-11 w-full min-w-0 border-slate-300"
              onClick={() => onOpenMessages(referenceId)}
            >
              <MessageCircle className="mr-1 h-3.5 w-3.5" />
              Contact Builder
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {hasGroupDealAndEnabled ? (
            <Button
              variant="outline"
              className="h-11 w-full min-w-0 border-slate-300 px-3 text-[13px]"
              onClick={() => onOpenMessages(referenceId)}
            >
              <MessageCircle className="mr-1 h-3.5 w-3.5" />
              Contact Builder
            </Button>
          ) : null}
          <Button
            variant="outline"
            className={`h-11 w-full min-w-0 border-slate-300 px-3 text-[13px] ${
              hasGroupDealAndEnabled ? '' : 'col-span-2'
            }`}
            onClick={handleCallContact}
          >
            <PhoneCall className="mr-1 h-3.5 w-3.5" />
            Call Builder
          </Button>
          <Button
            variant="outline"
            className={`h-11 w-full min-w-0 border-slate-300 px-3 text-[13px] ${compared ? 'text-blue-700' : ''}`}
            onClick={handleCompare}
          >
            <GitCompareArrows className="mr-1 h-3.5 w-3.5" />
            {compared ? 'Compared' : 'Compare'}
          </Button>
          <Button
            variant="outline"
            className={`h-11 w-full min-w-0 border-slate-300 px-3 text-[13px] ${
              hasGroupDealAndEnabled ? 'col-span-2' : ''
            } ${saved ? 'text-rose-600' : ''}`}
            onClick={handleSave}
          >
            <Heart className={`mr-1 h-3.5 w-3.5 ${saved ? 'fill-current' : ''}`} />
            {saved ? 'Saved' : 'Save'}
          </Button>
          <Button
            variant="outline"
            className="h-11 w-full min-w-0 border-green-300 px-3 text-[13px] text-green-700 hover:bg-green-50"
            onClick={() =>
              shareOnWhatsApp({
                title: property.title || 'Property',
                price: formatPrice(property.price),
                location: [property.locality, property.city].filter(Boolean).join(', '),
                url: `${window.location.origin}/buy-details/${encodeURIComponent(String(property.id))}`,
              })
            }
          >
            <Share2 className="mr-1 h-3.5 w-3.5" />
            WhatsApp
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
