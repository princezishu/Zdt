import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BadgeCheck, Heart, GitCompareArrows, ShieldAlert, MapPinned, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import {
  propertyTypeOptions,
  type HelpConfig,
  type PropertyType,
} from '@/lib/workflowStore';
import { trackPropertyInteraction } from '@/lib/propertyAnalyticsApi';
import {
  FAVORITES_CHANGED_EVENT,
  readFavoriteIds,
  upsertFavoriteListing,
  removeFavoriteListing,
} from '@/lib/favoritesStore';
import {
  COMPARE_CHANGED_EVENT,
  readComparedIds,
  removeComparedListing,
  upsertComparedListing,
} from '@/lib/compareStore';
import { addSavedSearch, consumePendingSavedSearch } from '@/lib/savedSearchStore';
import { addNotification } from '@/lib/notificationsStore';
import { apiRequest } from '@/lib/http';
import { PropertyCardsSkeleton } from '@/components/loading/PageSkeletons';
import { LgdLocationAccuracyNote, LgdLocationInput } from '@/components/realty/LgdLocationInput';
import { HelpBox, Hint, PhoneVerificationField, StepProgress, SuccessCard } from './workflow/CommonBlocks';

type BuyStep = 1 | 2 | 3 | 4 | 5;

interface BuyPageProps {
  onViewDetails?: (referenceId?: string) => void;
  onOpenFavorites?: () => void;
  onOpenMessages?: (propertyReference?: string) => void;
}

interface BuyListingCard {
  id: string | number;
  referenceId?: string | number;
  title: string;
  image: string;
  city: string;
  area: string;
  priceLakh: number;
  priceLabel: string;
  areaLabel: string;
  propertyType: PropertyType;
  bhk: string;
  mainDoorFacing: string;
  vastuScore: number;
  verified: boolean;
  ownerPhone: string;
}

interface PublicListingsResponse {
  listings: BuyListingCard[];
  total?: number;
}

const LISTINGS_REFRESH_MS = 30000;

interface BuyFormState {
  propertyType: PropertyType;
  name: string;
  phone: string;
  phoneVerificationId: string;
  city: string;
  area: string;
  preferredFacing: string;
  vastuPreference: string;
  timeline: 'Immediate' | '1 Month' | '3 Months';
  budgetRange: [number, number];
  plotAreaMin: string;
  plotAreaMax: string;
  plotRoadAccess: string;
  plotCorner: string;
  plotFacing: string;
  plotApprovals: string;
  plotLandmark: string;
  villaBhk: string;
  villaBuiltUp: string;
  villaLandArea: string;
  villaFurnishing: string;
  villaParking: string;
  villaAge: string;
  villaGated: string;
  villaAmenities: string;
  flatBhk: string;
  flatCarpetArea: string;
  flatFloorPreference: string;
  flatTotalFloors: string;
  flatFurnishing: string;
  flatSociety: string;
  flatParking: string;
  flatLift: string;
  flatBuildingAge: string;
  commercialType: string;
  commercialArea: string;
  commercialFrontage: string;
  commercialParking: string;
  commercialPowerBackup: string;
  commercialWashroom: string;
  commercialFloorPreference: string;
  shortlistIdea: boolean;
  mapListIdea: boolean;
}

const steps: string[] = [
  'Property Type',
  'Basic Details',
  'Budget',
  'Type Questions',
  'Review & Submit',
];

const initialHelp: HelpConfig = {
  needHelp: false,
  preferredCallTime: 'Morning',
  helpType: 'Just call and guide me',
};

const initialForm: BuyFormState = {
  propertyType: 'Plot',
  name: '',
  phone: '',
  phoneVerificationId: '',
  city: '',
  area: '',
  preferredFacing: 'Any',
  vastuPreference: 'Any',
  timeline: '1 Month',
  budgetRange: [20, 75],
  plotAreaMin: '',
  plotAreaMax: '',
  plotRoadAccess: 'Any',
  plotCorner: 'Any',
  plotFacing: 'Any',
  plotApprovals: 'Any',
  plotLandmark: '',
  villaBhk: '2 BHK',
  villaBuiltUp: '',
  villaLandArea: '',
  villaFurnishing: 'Any',
  villaParking: 'Any',
  villaAge: 'Any',
  villaGated: 'Any',
  villaAmenities: '',
  flatBhk: '2 BHK',
  flatCarpetArea: '',
  flatFloorPreference: 'Any',
  flatTotalFloors: '',
  flatFurnishing: 'Any',
  flatSociety: '',
  flatParking: 'Any',
  flatLift: 'Any',
  flatBuildingAge: 'Any',
  commercialType: 'Office',
  commercialArea: '',
  commercialFrontage: '',
  commercialParking: 'Any',
  commercialPowerBackup: 'Any',
  commercialWashroom: 'Any',
  commercialFloorPreference: 'Any',
  shortlistIdea: true,
  mapListIdea: true,
};

function isPhoneValid(value: string): boolean {
  return /^\d{10,15}$/.test(value);
}

function resolveListingReference(listing: Pick<BuyListingCard, 'id' | 'referenceId'>): string {
  const preferred = listing.referenceId ?? listing.id;
  if (typeof preferred === 'string') {
    return preferred.trim();
  }
  if (typeof preferred === 'number' && Number.isFinite(preferred)) {
    return String(preferred);
  }
  return '';
}

function buildRequirements(form: BuyFormState): Record<string, string | boolean | number> {
  if (form.propertyType === 'Plot') {
    return {
      areaMinSqFt: form.plotAreaMin || 'Any',
      areaMaxSqFt: form.plotAreaMax || 'Any',
      roadAccess: form.plotRoadAccess,
      cornerPlot: form.plotCorner,
      facing: form.plotFacing,
      approvals: form.plotApprovals,
      preferredLandmark: form.plotLandmark || 'Any',
    };
  }
  if (form.propertyType === 'Villa') {
    return {
      bhk: form.villaBhk,
      builtUpArea: form.villaBuiltUp || 'Any',
      landArea: form.villaLandArea || 'Any',
      furnishing: form.villaFurnishing,
      parking: form.villaParking,
      age: form.villaAge,
      gatedCommunity: form.villaGated,
      amenities: form.villaAmenities || 'Any',
    };
  }
  if (form.propertyType === 'Flat / Apartment') {
    return {
      bhk: form.flatBhk,
      carpetArea: form.flatCarpetArea || 'Any',
      floorPreference: form.flatFloorPreference,
      totalFloors: form.flatTotalFloors || 'Any',
      furnishing: form.flatFurnishing,
      societyName: form.flatSociety || 'Any',
      parking: form.flatParking,
      lift: form.flatLift,
      age: form.flatBuildingAge,
    };
  }
  return {
    commercialType: form.commercialType,
    area: form.commercialArea || 'Any',
    frontage: form.commercialFrontage || 'Any',
    parking: form.commercialParking,
    powerBackup: form.commercialPowerBackup,
    washroom: form.commercialWashroom,
    floorPreference: form.commercialFloorPreference,
  };
}

export default function BuyPage({ onViewDetails, onOpenFavorites, onOpenMessages }: BuyPageProps) {
  const [step, setStep] = useState<BuyStep>(1);
  const [form, setForm] = useState<BuyFormState>(initialForm);
  const [help, setHelp] = useState<HelpConfig>(initialHelp);
  const [buyListings, setBuyListings] = useState<BuyListingCard[]>([]);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [listingsError, setListingsError] = useState('');
  const [liveListingsCount, setLiveListingsCount] = useState(0);
  const [lastListingsSyncAt, setLastListingsSyncAt] = useState('');
  const [error, setError] = useState('');
  const [successRef, setSuccessRef] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchLocation, setSearchLocation] = useState('');
  const [searchPropertyType, setSearchPropertyType] = useState<PropertyType | 'Any'>('Any');
  const [searchFacing, setSearchFacing] = useState('Any');
  const [searchBhk, setSearchBhk] = useState('Any');
  const [searchVastu, setSearchVastu] = useState<'Any' | 'Yes' | 'No'>('Any');
  const [searchBudget, setSearchBudget] = useState<[number, number]>([30, 350]);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [savedListings, setSavedListings] = useState<string[]>(() => readFavoriteIds());
  const [comparedListings, setComparedListings] = useState<string[]>(() => readComparedIds());
  const [contactPhone, setContactPhone] = useState('');
  const [contactVerificationToken, setContactVerificationToken] = useState('');
  const [fraudReason, setFraudReason] = useState('');
  const [activeFraudReportId, setActiveFraudReportId] = useState('');
  const [fraudReportMessage, setFraudReportMessage] = useState('');
  const listingsFetchInFlightRef = useRef(false);

  const assistedListing = help.needHelp && help.helpType === 'Team should add my property for me';
  const [budgetMin, budgetMax] = form.budgetRange;
  const [searchBudgetMin, searchBudgetMax] = searchBudget;

  useEffect(() => {
    const pending = consumePendingSavedSearch('buy');
    if (!pending) {
      return;
    }

    const criteria = pending.criteria || {};
    const location =
      criteria && typeof criteria === 'object' && 'searchLocation' in criteria && typeof criteria.searchLocation === 'string'
        ? criteria.searchLocation
        : '';
    const propertyType =
      criteria && typeof criteria === 'object' && 'searchPropertyType' in criteria && typeof criteria.searchPropertyType === 'string'
        ? criteria.searchPropertyType
        : '';
    const facing =
      criteria && typeof criteria === 'object' && 'searchFacing' in criteria && typeof criteria.searchFacing === 'string'
        ? criteria.searchFacing
        : '';
    const bhk =
      criteria && typeof criteria === 'object' && 'searchBhk' in criteria && typeof criteria.searchBhk === 'string'
        ? criteria.searchBhk
        : '';
    const vastu =
      criteria && typeof criteria === 'object' && 'searchVastu' in criteria && typeof criteria.searchVastu === 'string'
        ? criteria.searchVastu
        : '';
    const budget =
      criteria && typeof criteria === 'object' && 'searchBudget' in criteria && Array.isArray(criteria.searchBudget)
        ? criteria.searchBudget
        : null;

    if (location) setSearchLocation(location);
    if (propertyType) setSearchPropertyType(propertyType as PropertyType | 'Any');
    if (facing) setSearchFacing(facing);
    if (bhk) setSearchBhk(bhk);
    if (vastu === 'Any' || vastu === 'Yes' || vastu === 'No') {
      setSearchVastu(vastu);
    }
    if (budget && budget.length === 2) {
      const min = typeof budget[0] === 'number' && Number.isFinite(budget[0]) ? budget[0] : 30;
      const max = typeof budget[1] === 'number' && Number.isFinite(budget[1]) ? budget[1] : 350;
      setSearchBudget([min, max]);
    }

    toast.success('Saved search applied', {
      description: pending.label || undefined,
    });
  }, []);

  const syncSavedListings = useCallback(() => {
    setSavedListings(readFavoriteIds());
  }, []);

  useEffect(() => {
    syncSavedListings();

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== 'zdt_favorite_listings') {
        return;
      }
      syncSavedListings();
    };

    const handleFavoritesChanged = () => {
      syncSavedListings();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(FAVORITES_CHANGED_EVENT, handleFavoritesChanged);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(FAVORITES_CHANGED_EVENT, handleFavoritesChanged);
    };
  }, [syncSavedListings]);

  const syncComparedListings = useCallback(() => {
    setComparedListings(readComparedIds());
  }, []);

  useEffect(() => {
    syncComparedListings();

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== 'zdt_compared_listings') {
        return;
      }
      syncComparedListings();
    };

    const handleCompareChanged = () => {
      syncComparedListings();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(COMPARE_CHANGED_EVENT, handleCompareChanged);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(COMPARE_CHANGED_EVENT, handleCompareChanged);
    };
  }, [syncComparedListings]);

  const loadListings = useCallback(async (showLoader: boolean) => {
    if (listingsFetchInFlightRef.current) {
      return;
    }

    listingsFetchInFlightRef.current = true;

    if (showLoader) {
      setListingsLoading(true);
      setListingsError('');
    }

    try {
      const response = await apiRequest<PublicListingsResponse>(
        '/workflow/public/listings?requestType=sell&limit=48'
      );
      const listings = response.listings || [];
      setBuyListings(listings);
      setLiveListingsCount(Number(response.total ?? listings.length));
      setLastListingsSyncAt(
        new Date().toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
      if (showLoader) {
        setListingsError('');
      }
    } catch (loadError) {
      if (showLoader) {
        setListingsError(
          loadError instanceof Error ? loadError.message : 'Unable to load approved listings'
        );
        setBuyListings([]);
        setLiveListingsCount(0);
      }
    } finally {
      listingsFetchInFlightRef.current = false;
      if (showLoader) {
        setListingsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadListings(true);

    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      void loadListings(false);
    }, LISTINGS_REFRESH_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      void loadListings(false);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(refreshTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadListings]);

  const reviewRows = useMemo(() => {
    const base: Array<{ label: string; value: string }> = [
      { label: 'Name', value: form.name || '-' },
      { label: 'Phone', value: form.phone || '-' },
      { label: 'City', value: form.city || '-' },
      { label: 'Area', value: form.area || '-' },
      { label: 'Property Type', value: form.propertyType },
      { label: 'Preferred Facing', value: form.preferredFacing },
      { label: 'Vastu Preference', value: form.vastuPreference },
      { label: 'Timeline', value: form.timeline },
      { label: 'Budget', value: `Rs ${budgetMin}L - Rs ${budgetMax}L` },
      { label: 'Assisted Listing', value: assistedListing ? 'Yes' : 'No' },
    ];
    const requirements = buildRequirements(form);
    Object.entries(requirements).forEach(([label, value]) => {
      base.push({ label, value: String(value) });
    });
    return base;
  }, [assistedListing, budgetMax, budgetMin, form]);

  const filteredListings = useMemo(() => {
    return buyListings.filter((listing) => {
      const matchesLocation =
        !searchLocation.trim() ||
        listing.city.toLowerCase().includes(searchLocation.trim().toLowerCase()) ||
        listing.area.toLowerCase().includes(searchLocation.trim().toLowerCase());
      const matchesType = searchPropertyType === 'Any' || listing.propertyType === searchPropertyType;
      const matchesFacing = searchFacing === 'Any' || listing.mainDoorFacing === searchFacing;
      const matchesBhk = searchBhk === 'Any' || listing.bhk === searchBhk;
      const matchesBudget =
        listing.priceLakh <= 0
          ? true
          : listing.priceLakh >= searchBudgetMin && listing.priceLakh <= searchBudgetMax;
      const matchesVastu =
        searchVastu === 'Any'
          ? true
          : searchVastu === 'Yes'
            ? listing.vastuScore >= 75
            : listing.vastuScore < 75;
      return (
        matchesLocation &&
        matchesType &&
        matchesFacing &&
        matchesBhk &&
        matchesBudget &&
        matchesVastu
      );
    });
  }, [
    buyListings,
    searchBhk,
    searchBudgetMax,
    searchBudgetMin,
    searchFacing,
    searchLocation,
    searchPropertyType,
    searchVastu,
  ]);

  const updateField = <K extends keyof BuyFormState>(key: K, value: BuyFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const validateCurrentStep = (): boolean => {
    if (step === 1 && !form.propertyType) {
      setError('Please choose property type.');
      return false;
    }
    if (step === 2) {
      if (!form.name.trim()) {
        setError('Please enter your name.');
        return false;
      }
      if (!isPhoneValid(form.phone)) {
        setError('Phone number must be 10 digits.');
        return false;
      }
      if (!form.city.trim()) {
        setError('Please enter city.');
        return false;
      }
      if (!form.phoneVerificationId) {
        setError('Please verify your phone using OTP.');
        return false;
      }
    }
    if (step === 3 && budgetMin > budgetMax) {
      setError('Budget min cannot be greater than budget max.');
      return false;
    }
    if (step === 4 && !assistedListing) {
      if (form.propertyType === 'Plot' && !form.plotAreaMin && !form.plotAreaMax) {
        setError('Please add plot area range.');
        return false;
      }
      if (form.propertyType === 'Villa' && !form.villaBuiltUp.trim()) {
        setError('Please add built-up area for villa.');
        return false;
      }
      if (form.propertyType === 'Flat / Apartment' && !form.flatCarpetArea.trim()) {
        setError('Please add carpet area for flat/apartment.');
        return false;
      }
      if (form.propertyType === 'Commercial' && !form.commercialArea.trim()) {
        setError('Please add area for commercial requirement.');
        return false;
      }
    }

    setError('');
    return true;
  };

  const next = () => {
    if (!validateCurrentStep()) return;
    setStep((prev) => Math.min(prev + 1, 5) as BuyStep);
  };

  const previous = () => {
    setError('');
    setStep((prev) => Math.max(prev - 1, 1) as BuyStep);
  };

  const toggleSavedListing = (listing: BuyListingCard) => {
    const referenceId = resolveListingReference(listing);
    if (!referenceId) {
      return;
    }

    setSavedListings((previousSaved) => {
      if (previousSaved.includes(referenceId)) {
        removeFavoriteListing(referenceId);
        void trackPropertyInteraction({
          referenceId,
          action: 'unsave',
          context: 'buy_listing_card',
        });
        return previousSaved.filter((itemId) => itemId !== referenceId);
      }

      upsertFavoriteListing({
        id: referenceId,
        referenceId,
        title: listing.title,
        image: listing.image || '/images/property-1.jpg',
        city: listing.city,
        area: listing.area,
        priceLabel: listing.priceLabel,
        areaLabel: listing.areaLabel,
        propertyType: listing.propertyType,
        bhk: listing.bhk,
        mainDoorFacing: listing.mainDoorFacing,
        vastuScore: listing.vastuScore,
        verified: listing.verified,
        ownerPhone: listing.ownerPhone,
      });
      void trackPropertyInteraction({
        referenceId,
        action: 'save',
        context: 'buy_listing_card',
      });
      return [...new Set([...previousSaved, referenceId])];
    });
  };

  const toggleComparedListing = (listing: BuyListingCard) => {
    const referenceId = String(listing.referenceId || listing.id).trim();
    if (!referenceId) {
      return;
    }

    if (comparedListings.includes(referenceId)) {
      const next = removeComparedListing(referenceId);
      setComparedListings(next.map((item) => item.referenceId));
      toast.success('Removed from compare');
      addNotification({
        title: 'Removed from compare',
        message: listing.title,
        kind: 'info',
        source: 'compare',
        metadata: { referenceId },
      });
      return;
    }

    const next = upsertComparedListing({
      id: referenceId,
      referenceId,
      title: listing.title,
      image: listing.image || '/images/property-1.jpg',
      city: listing.city,
      area: listing.area,
      priceLabel: listing.priceLabel,
      areaLabel: listing.areaLabel,
      propertyType: listing.propertyType,
      bhk: listing.bhk,
      mainDoorFacing: listing.mainDoorFacing,
      vastuScore: listing.vastuScore,
      verified: listing.verified,
      ownerPhone: listing.ownerPhone,
      updatedAt: '',
    });

    setComparedListings(next.map((item) => item.referenceId));
    toast.success('Added to compare');
    addNotification({
      title: 'Added to compare',
      message: listing.title,
      kind: 'success',
      source: 'compare',
      metadata: { referenceId },
    });
  };

  const submitFraudReport = async (propertyReference: string) => {
    if (!contactVerificationToken) {
      setFraudReportMessage('Verify your phone before reporting fraud.');
      return;
    }
    if (!fraudReason.trim()) {
      setFraudReportMessage('Please provide a fraud reason.');
      return;
    }
    setFraudReportMessage('');
    try {
      const response = await apiRequest<{ caseId: string; message: string }>('/workflow/public/report-fraud', {
        method: 'POST',
        body: JSON.stringify({
          propertyReference,
          reporterName: form.name.trim() || 'Buyer User',
          phone: contactPhone,
          phoneVerificationId: contactVerificationToken,
          reason: fraudReason.trim(),
        }),
      });
      setFraudReportMessage(`${response.message}. Case ID: ${response.caseId}`);
      setActiveFraudReportId('');
      setFraudReason('');
      setContactVerificationToken('');
    } catch (submitError) {
      setFraudReportMessage(
        submitError instanceof Error ? submitError.message : 'Unable to submit fraud report.'
      );
    }
  };

  const submit = async () => {
    const minimalReady =
      form.name.trim() &&
      isPhoneValid(form.phone) &&
      Boolean(form.phoneVerificationId) &&
      form.city.trim() &&
      form.propertyType;
    if (!minimalReady) {
      setError('For assisted listing, complete name, verified phone, city and property type.');
      return;
    }
    if (!assistedListing && !validateCurrentStep()) {
      return;
    }

    setIsSubmitting(true);
    setError('');
    setSuccessRef('');

    try {
      const response = await apiRequest<{ referenceId: string }>('/workflow/public/buy', {
        method: 'POST',
        body: JSON.stringify({
          requesterName: form.name.trim(),
          phone: form.phone,
          phoneVerificationId: form.phoneVerificationId,
          city: form.city.trim(),
          locality: form.area.trim(),
          propertyType: form.propertyType,
          pricing: {
            budgetMin: budgetMin * 100000,
            budgetMax: budgetMax * 100000,
          },
          details: assistedListing
            ? {}
            : {
                ...buildRequirements(form),
                preferredFacing: form.preferredFacing,
                vastuPreference: form.vastuPreference,
                timeline: form.timeline,
                shortlistIdea: form.shortlistIdea,
                mapListIdea: form.mapListIdea,
              },
          help: {
            needHelp: help.needHelp,
            preferredCallTime: help.preferredCallTime,
            helpType: help.helpType,
          },
        }),
      });

      setSuccessRef(response.referenceId);
      setForm((prev) => ({ ...prev, phoneVerificationId: '' }));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to submit request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="min-h-screen pt-28 pb-16 text-slate-900">
      <div className="page-container zdt-page-stack">
        <div className="zdt-panel-hero rounded-3xl border border-white/20 bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 p-6 text-white shadow-2xl">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Buy Page</p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Find Verified Properties Faster</h1>
          <p className="mt-2 max-w-2xl text-sm text-white/85">
            Smart filters, Vastu-first discovery, compare tools, and assisted support in one flow.
          </p>
        </div>

        <div className="zdt-panel rounded-3xl border border-white/20 bg-white/95 p-5 shadow-xl sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-slate-900">Smart Search</h2>
            <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-sm">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`rounded-lg px-3 py-1.5 ${viewMode === 'list' ? 'bg-white shadow-sm' : 'text-slate-600'}`}
              >
                List View
              </button>
              <button
                type="button"
                onClick={() => setViewMode('map')}
                className={`rounded-lg px-3 py-1.5 ${viewMode === 'map' ? 'bg-white shadow-sm' : 'text-slate-600'}`}
              >
                Map View
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <LgdLocationInput
              value={searchLocation}
              onChange={setSearchLocation}
              placeholder="Location (City / Area)"
              className="h-11 bg-white"
              suggestKind="india"
              indiaValueField="village"
            />
            <Select value={searchPropertyType} onValueChange={(value) => setSearchPropertyType(value as PropertyType | 'Any')}>
              <SelectTrigger className="h-11 bg-white text-slate-900">
                <SelectValue placeholder="Property Type" />
              </SelectTrigger>
              <SelectContent className="bg-white text-slate-900">
                <SelectItem value="Any">Property Type: Any</SelectItem>
                {propertyTypeOptions.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={searchBhk} onValueChange={setSearchBhk}>
              <SelectTrigger className="h-11 bg-white text-slate-900">
                <SelectValue placeholder="BHK" />
              </SelectTrigger>
              <SelectContent className="bg-white text-slate-900">
                <SelectItem value="Any">BHK: Any</SelectItem>
                <SelectItem value="1 BHK">1 BHK</SelectItem>
                <SelectItem value="2 BHK">2 BHK</SelectItem>
                <SelectItem value="3 BHK">3 BHK</SelectItem>
                <SelectItem value="4 BHK">4 BHK</SelectItem>
                <SelectItem value="Office">Commercial</SelectItem>
              </SelectContent>
            </Select>
            <Select value={searchFacing} onValueChange={setSearchFacing}>
              <SelectTrigger className="h-11 bg-white text-slate-900">
                <SelectValue placeholder="Facing Direction" />
              </SelectTrigger>
              <SelectContent className="bg-white text-slate-900">
                <SelectItem value="Any">Facing: Any</SelectItem>
                <SelectItem value="North">North</SelectItem>
                <SelectItem value="East">East</SelectItem>
                <SelectItem value="South">South</SelectItem>
                <SelectItem value="West">West</SelectItem>
                <SelectItem value="North-East">North-East</SelectItem>
              </SelectContent>
            </Select>
            <Select value={searchVastu} onValueChange={(value) => setSearchVastu(value as 'Any' | 'Yes' | 'No')}>
              <SelectTrigger className="h-11 bg-white text-slate-900">
                <SelectValue placeholder="Vastu Compliant" />
              </SelectTrigger>
              <SelectContent className="bg-white text-slate-900">
                <SelectItem value="Any">Vastu: Any</SelectItem>
                <SelectItem value="Yes">Vastu: Yes</SelectItem>
                <SelectItem value="No">Vastu: No</SelectItem>
              </SelectContent>
            </Select>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 sm:col-span-2 xl:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Budget Range: Rs {searchBudgetMin}L - Rs {searchBudgetMax}L
              </p>
              <Slider
                min={20}
                max={500}
                step={5}
                value={[searchBudgetMin, searchBudgetMax]}
                onValueChange={(value) => setSearchBudget([value[0], value[1]])}
                className="mt-3"
              />
            </div>
          </div>
          <LgdLocationAccuracyNote className="mt-2" />

          {viewMode === 'map' && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="inline-flex items-center gap-2 font-semibold text-slate-900">
                <MapPinned className="h-4 w-4 text-blue-700" />
                Map View (Interactive map layer ready for future pin integration)
              </p>
            </div>
          )}
        </div>

        <div className="zdt-panel rounded-3xl border border-white/20 bg-white/95 p-5 shadow-xl sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Approved Properties</h2>
              <p className="text-sm text-slate-600">
                Live listings appear here only after admin approval.
              </p>
              <p className="text-xs text-slate-500">Auto-refreshes every 30 seconds.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                Live: {liveListingsCount}
              </span>
              {lastListingsSyncAt && (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                  Last Sync: {lastListingsSyncAt}
                </span>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => void loadListings(true)}
                className="border-slate-300"
              >
                Refresh Now
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const locationLabel = searchLocation.trim();
                  const typeLabel = searchPropertyType === 'Any' ? '' : String(searchPropertyType);
                  const label = [
                    'Buy',
                    locationLabel ? `in ${locationLabel}` : '',
                    typeLabel,
                    `Rs ${searchBudgetMin}L-${searchBudgetMax}L`,
                  ]
                    .filter(Boolean)
                    .join(' ');

                  addSavedSearch({
                    label,
                    targetView: 'buy',
                    criteria: {
                      searchLocation,
                      searchPropertyType,
                      searchFacing,
                      searchBhk,
                      searchVastu,
                      searchBudget,
                    },
                  });

                  toast.success('Search saved');
                  addNotification({
                    title: 'Saved search created',
                    message: label,
                    kind: 'success',
                    source: 'search',
                    metadata: { view: 'buy' },
                  });
                }}
                className="border-slate-300"
              >
                Save Search
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenFavorites?.()}
                className="border-slate-300"
              >
                View Favorites
              </Button>
            </div>
          </div>

          <div className="mt-4">
            <PhoneVerificationField
              phone={contactPhone}
              onPhoneChange={setContactPhone}
              verifiedToken={contactVerificationToken}
              onVerifiedTokenChange={setContactVerificationToken}
              purpose="workflow"
              title="Verify Phone To Unlock Owner Contact"
            />
            {fraudReportMessage && (
              <p className="mt-2 text-xs font-medium text-slate-700">{fraudReportMessage}</p>
            )}
            {listingsError && (
              <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                {listingsError}
              </p>
            )}
          </div>

          {listingsLoading ? (
            <PropertyCardsSkeleton count={8} />
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {!listingsError && buyListings.length === 0 && (
                <div className="md:col-span-2 xl:col-span-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  No approved sell listings yet. Submit from Sell page, then Admin must approve for visibility here.
                </div>
              )}
              {!listingsError && buyListings.length > 0 && filteredListings.length === 0 && (
                <div className="md:col-span-2 xl:col-span-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  No listings match your current filters. Adjust location, budget or property type.
                </div>
              )}
              {filteredListings.map((listing) => {
                const listingReference = resolveListingReference(listing) || listing.title;
                return (
                <div key={listingReference} className="zdt-panel h-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="relative">
                    <img src={listing.image} alt={listing.title} className="h-40 w-full object-cover" />
                    {listing.verified && (
                      <Badge className="absolute left-3 top-3 bg-emerald-600 text-white hover:bg-emerald-600">
                        <BadgeCheck className="mr-1 h-3.5 w-3.5" />
                        Verified
                      </Badge>
                    )}
                    <Badge className="absolute right-3 top-3 bg-blue-700 text-white hover:bg-blue-700">
                      Vastu {listing.vastuScore}%
                    </Badge>
                  </div>
                  <div className="flex h-full flex-col space-y-2 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{listingReference}</p>
                    <p className="text-sm font-semibold text-slate-900">{listing.title}</p>
                    <p className="text-sm font-semibold text-blue-800">{listing.priceLabel}</p>
                    <p className="text-xs text-slate-600">{listing.areaLabel}</p>
                    <p className="text-xs text-slate-600">{listing.city}, {listing.area}</p>
                    <p className="text-xs text-slate-700">Main Door Facing: {listing.mainDoorFacing}</p>
                    <p className="text-xs text-slate-700">
                      Owner Contact:{' '}
                      {contactVerificationToken ? listing.ownerPhone : 'Hidden until phone verification'}
                    </p>
                    <div className="mt-auto grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 border-slate-300 text-xs"
                        onClick={() => toggleSavedListing(listing)}
                      >
                        <Heart className={`mr-1 h-3.5 w-3.5 ${savedListings.includes(listingReference) ? 'fill-current text-red-500' : ''}`} />
                        Save
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className={`h-9 border-slate-300 text-xs ${
                          comparedListings.includes(listingReference) ? 'border-blue-300 bg-blue-50 text-blue-800' : ''
                        }`}
                        onClick={() => toggleComparedListing(listing)}
                      >
                        <GitCompareArrows className="mr-1 h-3.5 w-3.5" />
                        Compare
                      </Button>
                      <Button
                        type="button"
                        className="h-9 bg-blue-700 text-xs text-white hover:bg-blue-800"
                        onClick={() => onViewDetails?.(listingReference)}
                      >
                        View Details
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 text-xs"
                        onClick={() => onOpenMessages?.(listingReference)}
                      >
                        <MessageCircle className="mr-1 h-3.5 w-3.5" />
                        Chat
                      </Button>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 w-full text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() =>
                        setActiveFraudReportId(activeFraudReportId === listingReference ? '' : listingReference)
                      }
                    >
                      <ShieldAlert className="mr-1 h-3.5 w-3.5" />
                      Report Fraud
                    </Button>
                    {activeFraudReportId === listingReference && (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-2">
                        <Textarea
                          value={fraudReason}
                          onChange={(event) => setFraudReason(event.target.value)}
                          placeholder="Describe suspicious behavior"
                          className="min-h-16 bg-white text-xs"
                        />
                        <Button
                          type="button"
                          className="mt-2 h-8 w-full bg-red-600 text-xs text-white hover:bg-red-700"
                          onClick={() => submitFraudReport(listingReference)}
                        >
                          Submit Fraud Report
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )})}
            </div>
          )}
        </div>

        <div className="hidden">
        <StepProgress
          title="Buyer Requirement Form"
          subtitle="Short guided steps. We ask only what matters for your selected property type."
          step={step}
          totalSteps={steps.length}
          steps={steps}
        />

        <div className="zdt-panel rounded-3xl border border-white/20 bg-white/95 p-5 shadow-xl sm:p-6">
          {step === 1 && (
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Choose Property Type</h2>
              <p className="mt-1 text-sm text-slate-600">Start here. Next questions will adapt automatically.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {propertyTypeOptions.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => updateField('propertyType', type)}
                    className={`rounded-2xl border px-4 py-4 text-left transition ${
                      form.propertyType === type
                        ? 'border-blue-600 bg-blue-50 text-blue-900'
                        : 'border-slate-200 bg-white hover:border-blue-300'
                    }`}
                  >
                    <p className="font-semibold">{type}</p>
                    <p className="mt-1 text-xs text-slate-600">We will show only related fields.</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Basic Details</h2>
              <p className="mt-1 text-sm text-slate-600">So our team can connect with you quickly.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <Input
                    value={form.name}
                    onChange={(event) => updateField('name', event.target.value)}
                    placeholder="Full Name"
                    className="h-11 bg-white"
                  />
                  <Hint>Example: Rahim Shaikh</Hint>
                </div>
                <div className="sm:col-span-2">
                  <PhoneVerificationField
                    phone={form.phone}
                    onPhoneChange={(value) => updateField('phone', value)}
                    verifiedToken={form.phoneVerificationId}
                    onVerifiedTokenChange={(value) => updateField('phoneVerificationId', value)}
                    purpose="buy"
                    title="Phone verification required before we share contacts"
                  />
                </div>
                <div>
                  <LgdLocationInput
                    value={form.city}
                    onChange={(value) => updateField('city', value)}
                    placeholder="City"
                    className="h-11 bg-white"
                    suggestKind="india"
                    indiaValueField="village"
                  />
                  <Hint>Example: Bengaluru</Hint>
                </div>
                <div>
                  <LgdLocationInput
                    value={form.area}
                    onChange={(value) => updateField('area', value)}
                    placeholder="Area / Locality"
                    className="h-11 bg-white"
                    suggestKind="india"
                    indiaValueField="subdistrict"
                  />
                  <Hint>Example: Whitefield</Hint>
                </div>
                <div className="sm:col-span-2">
                  <LgdLocationAccuracyNote />
                </div>
                <Select value={form.preferredFacing} onValueChange={(value) => updateField('preferredFacing', value)}>
                  <SelectTrigger className="h-11 bg-white text-slate-900">
                    <SelectValue placeholder="Preferred Facing" />
                  </SelectTrigger>
                  <SelectContent className="bg-white text-slate-900">
                    <SelectItem value="Any">Facing: Any</SelectItem>
                    <SelectItem value="North">North</SelectItem>
                    <SelectItem value="East">East</SelectItem>
                    <SelectItem value="South">South</SelectItem>
                    <SelectItem value="West">West</SelectItem>
                    <SelectItem value="North-East">North-East</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={form.vastuPreference} onValueChange={(value) => updateField('vastuPreference', value)}>
                  <SelectTrigger className="h-11 bg-white text-slate-900">
                    <SelectValue placeholder="Vastu Preference" />
                  </SelectTrigger>
                  <SelectContent className="bg-white text-slate-900">
                    <SelectItem value="Any">Vastu: Any</SelectItem>
                    <SelectItem value="Yes">Vastu Required</SelectItem>
                    <SelectItem value="No">Not Required</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={form.timeline} onValueChange={(value) => updateField('timeline', value as 'Immediate' | '1 Month' | '3 Months')}>
                  <SelectTrigger className="h-11 bg-white text-slate-900">
                    <SelectValue placeholder="Purchase Timeline" />
                  </SelectTrigger>
                  <SelectContent className="bg-white text-slate-900">
                    <SelectItem value="Immediate">Immediate</SelectItem>
                    <SelectItem value="1 Month">Within 1 Month</SelectItem>
                    <SelectItem value="3 Months">Within 3 Months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Set Budget Range</h2>
              <p className="mt-1 text-sm text-slate-600">Use slider to avoid extra typing.</p>
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">
                  Budget: Rs {budgetMin}L to Rs {budgetMax}L
                </p>
                <Slider
                  min={5}
                  max={500}
                  step={5}
                  value={[budgetMin, budgetMax]}
                  onValueChange={(value) => updateField('budgetRange', [value[0], value[1]])}
                  className="mt-4"
                />
                <Hint>Budget Max example: Rs 75,00,000</Hint>
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                {form.propertyType} Requirements
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Only relevant questions are shown for {form.propertyType}.
              </p>

              {form.propertyType === 'Plot' && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Input
                    value={form.plotAreaMin}
                    onChange={(event) => updateField('plotAreaMin', event.target.value.replace(/\D/g, ''))}
                    placeholder="Plot Area Min (sq.ft)"
                    className="h-11 bg-white"
                  />
                  <Input
                    value={form.plotAreaMax}
                    onChange={(event) => updateField('plotAreaMax', event.target.value.replace(/\D/g, ''))}
                    placeholder="Plot Area Max (sq.ft)"
                    className="h-11 bg-white"
                  />
                  <Select value={form.plotRoadAccess} onValueChange={(value) => updateField('plotRoadAccess', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900">
                      <SelectValue placeholder="Road Access" />
                    </SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Any">Road Access: Any</SelectItem>
                      <SelectItem value="30ft+">30ft+</SelectItem>
                      <SelectItem value="40ft+">40ft+</SelectItem>
                      <SelectItem value="60ft+">60ft+</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={form.plotCorner} onValueChange={(value) => updateField('plotCorner', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900">
                      <SelectValue placeholder="Corner Plot" />
                    </SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Any">Corner Plot: Any</SelectItem>
                      <SelectItem value="Yes">Yes</SelectItem>
                      <SelectItem value="No">No</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={form.plotFacing} onValueChange={(value) => updateField('plotFacing', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900">
                      <SelectValue placeholder="Facing" />
                    </SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Any">Facing: Any</SelectItem>
                      <SelectItem value="North">North</SelectItem>
                      <SelectItem value="East">East</SelectItem>
                      <SelectItem value="South">South</SelectItem>
                      <SelectItem value="West">West</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={form.plotApprovals} onValueChange={(value) => updateField('plotApprovals', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900">
                      <SelectValue placeholder="Approvals" />
                    </SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Any">Approvals: Any</SelectItem>
                      <SelectItem value="RERA">RERA</SelectItem>
                      <SelectItem value="NA">NA</SelectItem>
                      <SelectItem value="RERA + NA">RERA + NA</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={form.plotLandmark}
                    onChange={(event) => updateField('plotLandmark', event.target.value)}
                    placeholder="Preferred Locality / Landmark"
                    className="h-11 bg-white sm:col-span-2 lg:col-span-3"
                  />
                </div>
              )}

              {form.propertyType === 'Villa' && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Select value={form.villaBhk} onValueChange={(value) => updateField('villaBhk', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900">
                      <SelectValue placeholder="BHK" />
                    </SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="2 BHK">2 BHK</SelectItem>
                      <SelectItem value="3 BHK">3 BHK</SelectItem>
                      <SelectItem value="4 BHK">4 BHK</SelectItem>
                      <SelectItem value="5+ BHK">5+ BHK</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={form.villaBuiltUp}
                    onChange={(event) => updateField('villaBuiltUp', event.target.value.replace(/\D/g, ''))}
                    placeholder="Built-up Area (sq.ft)"
                    className="h-11 bg-white"
                  />
                  <Input
                    value={form.villaLandArea}
                    onChange={(event) => updateField('villaLandArea', event.target.value.replace(/\D/g, ''))}
                    placeholder="Land Area (sq.ft)"
                    className="h-11 bg-white"
                  />
                  <Select value={form.villaFurnishing} onValueChange={(value) => updateField('villaFurnishing', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900">
                      <SelectValue placeholder="Furnished" />
                    </SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Any">Furnished: Any</SelectItem>
                      <SelectItem value="Unfurnished">Unfurnished</SelectItem>
                      <SelectItem value="Semi-Furnished">Semi-Furnished</SelectItem>
                      <SelectItem value="Fully Furnished">Fully Furnished</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={form.villaParking} onValueChange={(value) => updateField('villaParking', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900">
                      <SelectValue placeholder="Parking" />
                    </SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Any">Parking: Any</SelectItem>
                      <SelectItem value="1">1 Slot</SelectItem>
                      <SelectItem value="2">2 Slots</SelectItem>
                      <SelectItem value="3+">3+ Slots</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={form.villaAge} onValueChange={(value) => updateField('villaAge', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900">
                      <SelectValue placeholder="Age" />
                    </SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Any">Age: Any</SelectItem>
                      <SelectItem value="Ready to Move">Ready to Move</SelectItem>
                      <SelectItem value="1-5 Years">1-5 Years</SelectItem>
                      <SelectItem value="5-10 Years">5-10 Years</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={form.villaGated} onValueChange={(value) => updateField('villaGated', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900">
                      <SelectValue placeholder="Gated Community" />
                    </SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Any">Gated Community: Any</SelectItem>
                      <SelectItem value="Yes">Yes</SelectItem>
                      <SelectItem value="No">No</SelectItem>
                    </SelectContent>
                  </Select>
                  <Textarea
                    value={form.villaAmenities}
                    onChange={(event) => updateField('villaAmenities', event.target.value)}
                    placeholder="Amenities (pool, gym, clubhouse...)"
                    className="min-h-20 bg-white sm:col-span-2 lg:col-span-3"
                  />
                </div>
              )}

              {form.propertyType === 'Flat / Apartment' && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Select value={form.flatBhk} onValueChange={(value) => updateField('flatBhk', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900">
                      <SelectValue placeholder="BHK" />
                    </SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="1 BHK">1 BHK</SelectItem>
                      <SelectItem value="2 BHK">2 BHK</SelectItem>
                      <SelectItem value="3 BHK">3 BHK</SelectItem>
                      <SelectItem value="4+ BHK">4+ BHK</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={form.flatCarpetArea}
                    onChange={(event) => updateField('flatCarpetArea', event.target.value.replace(/\D/g, ''))}
                    placeholder="Carpet Area (sq.ft)"
                    className="h-11 bg-white"
                  />
                  <Select value={form.flatFloorPreference} onValueChange={(value) => updateField('flatFloorPreference', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900">
                      <SelectValue placeholder="Floor Preference" />
                    </SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Any">Any Floor</SelectItem>
                      <SelectItem value="Lower">Lower Floors</SelectItem>
                      <SelectItem value="Middle">Middle Floors</SelectItem>
                      <SelectItem value="Higher">Higher Floors</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={form.flatTotalFloors}
                    onChange={(event) => updateField('flatTotalFloors', event.target.value.replace(/\D/g, ''))}
                    placeholder="Total Floors"
                    className="h-11 bg-white"
                  />
                  <Select value={form.flatFurnishing} onValueChange={(value) => updateField('flatFurnishing', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900">
                      <SelectValue placeholder="Furnished" />
                    </SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Any">Furnished: Any</SelectItem>
                      <SelectItem value="Unfurnished">Unfurnished</SelectItem>
                      <SelectItem value="Semi-Furnished">Semi-Furnished</SelectItem>
                      <SelectItem value="Fully Furnished">Fully Furnished</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={form.flatSociety}
                    onChange={(event) => updateField('flatSociety', event.target.value)}
                    placeholder="Society Name"
                    className="h-11 bg-white"
                  />
                  <Select value={form.flatParking} onValueChange={(value) => updateField('flatParking', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900">
                      <SelectValue placeholder="Parking" />
                    </SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Any">Parking: Any</SelectItem>
                      <SelectItem value="Yes">Yes</SelectItem>
                      <SelectItem value="No">No</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={form.flatLift} onValueChange={(value) => updateField('flatLift', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900">
                      <SelectValue placeholder="Lift" />
                    </SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Any">Lift: Any</SelectItem>
                      <SelectItem value="Yes">Yes</SelectItem>
                      <SelectItem value="No">No</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={form.flatBuildingAge} onValueChange={(value) => updateField('flatBuildingAge', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900">
                      <SelectValue placeholder="Age of Building" />
                    </SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Any">Age: Any</SelectItem>
                      <SelectItem value="New">New</SelectItem>
                      <SelectItem value="1-5 Years">1-5 Years</SelectItem>
                      <SelectItem value="5+ Years">5+ Years</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {form.propertyType === 'Commercial' && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Select value={form.commercialType} onValueChange={(value) => updateField('commercialType', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900">
                      <SelectValue placeholder="Commercial Type" />
                    </SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Shop">Shop</SelectItem>
                      <SelectItem value="Office">Office</SelectItem>
                      <SelectItem value="Warehouse">Warehouse</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={form.commercialArea}
                    onChange={(event) => updateField('commercialArea', event.target.value.replace(/\D/g, ''))}
                    placeholder="Area (sq.ft)"
                    className="h-11 bg-white"
                  />
                  <Input
                    value={form.commercialFrontage}
                    onChange={(event) => updateField('commercialFrontage', event.target.value.replace(/\D/g, ''))}
                    placeholder="Frontage (ft)"
                    className="h-11 bg-white"
                  />
                  <Select value={form.commercialParking} onValueChange={(value) => updateField('commercialParking', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900">
                      <SelectValue placeholder="Parking" />
                    </SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Any">Parking: Any</SelectItem>
                      <SelectItem value="Yes">Yes</SelectItem>
                      <SelectItem value="No">No</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={form.commercialPowerBackup} onValueChange={(value) => updateField('commercialPowerBackup', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900">
                      <SelectValue placeholder="Power Backup" />
                    </SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Any">Power Backup: Any</SelectItem>
                      <SelectItem value="Yes">Yes</SelectItem>
                      <SelectItem value="No">No</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={form.commercialWashroom} onValueChange={(value) => updateField('commercialWashroom', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900">
                      <SelectValue placeholder="Washroom" />
                    </SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Any">Washroom: Any</SelectItem>
                      <SelectItem value="Attached">Attached</SelectItem>
                      <SelectItem value="Shared">Shared</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={form.commercialFloorPreference}
                    onValueChange={(value) => updateField('commercialFloorPreference', value)}
                  >
                    <SelectTrigger className="h-11 bg-white text-slate-900">
                      <SelectValue placeholder="Floor Preference" />
                    </SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Any">Any Floor</SelectItem>
                      <SelectItem value="Ground">Ground</SelectItem>
                      <SelectItem value="Low">Low Floor</SelectItem>
                      <SelectItem value="High">High Floor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-slate-900">Review & Submit</h2>
              <p className="text-sm text-slate-600">
                Check details once. If Assisted Listing is enabled, basic details are enough.
              </p>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  {reviewRows.map((row) => (
                    <div key={row.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-slate-500">{row.label}</p>
                      <p className="text-sm font-medium text-slate-900 break-words">{row.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm">
                  Save/Shortlist feature idea
                  <input
                    type="checkbox"
                    checked={form.shortlistIdea}
                    onChange={(event) => updateField('shortlistIdea', event.target.checked)}
                  />
                </label>
                <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm">
                  Map view / List view option idea
                  <input
                    type="checkbox"
                    checked={form.mapListIdea}
                    onChange={(event) => updateField('mapListIdea', event.target.checked)}
                  />
                </label>
              </div>
            </div>
          )}

          <div className="mt-6">
            <HelpBox help={help} onChange={setHelp} />
          </div>

          {error && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {error}
            </p>
          )}

          {successRef && (
            <div className="mt-4">
              <SuccessCard referenceId={successRef} assistedListing={assistedListing} />
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <Button variant="outline" onClick={previous} disabled={step === 1}>
              Previous
            </Button>
            {step < 5 ? (
              <Button onClick={next} className="bg-blue-700 text-white hover:bg-blue-800">
                Next Step
              </Button>
            ) : (
              <Button onClick={submit} disabled={isSubmitting} className="bg-emerald-600 text-white hover:bg-emerald-700">
                Submit Buyer Requirement
              </Button>
            )}
          </div>
        </div>
        </div>
      </div>
    </section>
  );
}
