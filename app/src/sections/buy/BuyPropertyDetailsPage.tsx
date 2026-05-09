import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Flag,
  GitCompareArrows,
  Landmark,
  LineChart,
  MapPin,
  MessageCircle,
  Coins,
  Share2,
  PhoneCall,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/http';
import {
  createGroupDealRequest,
  getPropertyGroupDeal,
  type GroupDealItem,
} from '@/lib/groupDealsApi';
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
import { PropertyCardsSkeleton } from '@/components/loading/PageSkeletons';
import {
  COMPARE_CHANGED_EVENT,
  isCompared,
  removeComparedListing,
  upsertComparedListing,
} from '@/lib/compareStore';
import { applySeo } from '@/lib/seo';
import { buildCanonicalDetailPath } from '@/lib/slug';
import { openPhoneDialer } from '@/lib/phone';
import { shareLink } from '@/lib/share';
import { addRecentlyViewed } from '@/lib/recentlyViewed';
import GalleryLightbox from '@/components/ui/GalleryLightbox';

interface BuyPropertyDetailsPageProps {
  propertyId: string;
  onBackToBuy: () => void;
  onOpenSimilar: (propertyId: string) => void;
  onOpenCompare: () => void;
  onOpenSaved: () => void;
  onOpenMessages: (propertyReference?: string) => void;
  onOpenGroupDeal?: (dealCode: string) => void;
}

interface PropertyDetails {
  id: number;
  title: string;
  state: string;
  city: string;
  area: string;
  locality: string;
  address: string;
  fullAddress?: string;
  price: number | null;
  pricePerSqft: number | null;
  propertyType: string;
  bhk: number | null;
  bedrooms: number | null;
  areaSqft: number | null;
  carpetArea: number | null;
  builtupArea: number | null;
  superBuiltupArea: number | null;
  floorNumber: number | null;
  totalFloors: number | null;
  facing: string;
  furnishing: string;
  possessionStatus: string;
  availabilityDate: string | null;
  reraNumber: string;
  isVerified: boolean;
  amenities: string[];
  description: string;
  imageUrls: string[];
  primaryImage: string;
  companyName: string;
  companyPropertyCount: number;
  publicContactPhone?: string;
  layoutDetails?: {
    floors?: Array<{
      name?: string;
      units?: number;
    }>;
  };
  company?: {
    id: number;
    name: string;
    logoUrl: string;
    isVerified: boolean;
  };
}

const GROUP_DEAL_ENABLED = String(import.meta.env.VITE_ENABLE_GROUP_DEALS || 'true').toLowerCase() !== 'false';

interface PriceHistoryPoint {
  previousPrice: number | null;
  nextPrice: number;
  createdAt: string;
}

interface DetailsResponse {
  property: PropertyDetails;
  priceHistory: PriceHistoryPoint[];
}

interface SimilarResponse {
  properties: Array<{
    id: number;
    title: string;
    city: string;
    area: string;
    primaryImage: string;
    price: number | null;
  }>;
}

function formatPrice(price: number | null): string {
  if (!price || price <= 0) return 'Price on request';
  if (price >= 10000000) return `INR ${(price / 10000000).toFixed(2)} Cr`;
  if (price >= 100000) return `INR ${(price / 100000).toFixed(1)} L`;
  return `INR ${price.toLocaleString('en-IN')}`;
}

function estimateEmi(price: number | null, rate: number, years: number): string {
  if (!price || price <= 0) return 'EMI on request';
  const principal = price;
  const months = years * 12;
  const monthlyRate = rate / 12;
  const emi =
    (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) /
    (Math.pow(1 + monthlyRate, months) - 1);
  if (!Number.isFinite(emi)) return 'EMI on request';
  return `INR ${Math.round(emi).toLocaleString('en-IN')}/mo`;
}

function formatPossessionStatus(value: string): string {
  const normalized = String(value || '').trim().toLowerCase().replace(/_/g, ' ');
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

function resolveGroupStatusLabel(groupDeal: GroupDealItem | null): 'Open' | 'Filling Fast' | 'Closed' {
  if (!groupDeal) return 'Open';
  if (['FULL', 'EXPIRED', 'PAUSED', 'CANCELLED'].includes(groupDeal.status)) return 'Closed';
  if (groupDeal.progressPercent >= 70 || groupDeal.status === 'MIN_REACHED') return 'Filling Fast';
  return 'Open';
}

function formatGroupDiscountedRange(groupDeal: GroupDealItem | null): string {
  if (!groupDeal) return 'Builder confirmation pending';
  const base = Number(groupDeal.basePrice || 0);
  if (base <= 0) return 'Builder confirmation pending';
  if (groupDeal.finalGroupPrice && Number(groupDeal.finalGroupPrice) > 0) {
    return formatPrice(Number(groupDeal.finalGroupPrice));
  }
  const progress = Math.max(0.25, Math.min(1, Number(groupDeal.progressPercent || 0) / 100));
  if (groupDeal.dealType === 'PERCENT_DISCOUNT' && groupDeal.discountValue) {
    const maxPct = Number(groupDeal.discountValue);
    const currentPct = maxPct * progress;
    const current = Math.round(base * (1 - currentPct / 100));
    const best = Math.round(base * (1 - maxPct / 100));
    return `${formatPrice(current)} - ${formatPrice(best)}`;
  }
  if (groupDeal.dealType === 'FLAT_DISCOUNT' && groupDeal.discountValue) {
    const maxFlat = Number(groupDeal.discountValue);
    const current = Math.max(0, Math.round(base - maxFlat * progress));
    const best = Math.max(0, Math.round(base - maxFlat));
    return `${formatPrice(current)} - ${formatPrice(best)}`;
  }
  return 'Builder confirmation pending';
}

export default function BuyPropertyDetailsPage({
  propertyId,
  onBackToBuy,
  onOpenSimilar,
  onOpenCompare,
  onOpenSaved,
  onOpenMessages,
  onOpenGroupDeal,
}: BuyPropertyDetailsPageProps) {
  const [property, setProperty] = useState<PropertyDetails | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryPoint[]>([]);
  const [similar, setSimilar] = useState<SimilarResponse['properties']>([]);
  const [groupDeal, setGroupDeal] = useState<GroupDealItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeImage, setActiveImage] = useState('');
  const [emiRate, setEmiRate] = useState(0.09);
  const [emiYears, setEmiYears] = useState(20);
  const [groupFormName, setGroupFormName] = useState('');
  const [groupFormPhone, setGroupFormPhone] = useState('');
  const [groupFormCity, setGroupFormCity] = useState('');
  const [groupFormIntent, setGroupFormIntent] = useState<'Buy now' | 'Interested'>('Interested');
  const [groupFormSubmitting, setGroupFormSubmitting] = useState(false);
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerCity, setBuyerCity] = useState('');
  const [visitDate, setVisitDate] = useState('');
  const [visitTime, setVisitTime] = useState('');
  const [buyerNote, setBuyerNote] = useState('');
  const [reportReason, setReportReason] = useState('fake_listing');
  const [reportDetails, setReportDetails] = useState('');
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const [isComparedListing, setIsComparedListing] = useState(false);
  const [shareStatus, setShareStatus] = useState('');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    apiRequest<DetailsResponse>(`/api/properties/${propertyId}`)
      .then((response) => {
        if (!active) return;
        setProperty(response.property);
        setPriceHistory(response.priceHistory || []);
        const image = response.property.primaryImage || response.property.imageUrls?.[0] || '/images/property-1.jpg';
        setActiveImage(image);

        // Track recently viewed
        addRecentlyViewed({
          id: String(response.property.id),
          title: response.property.title,
          image,
          city: response.property.city,
          area: response.property.locality || response.property.area,
          priceLabel: formatPrice(response.property.price),
          propertyType: response.property.propertyType,
        });
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load property details');
        setProperty(null);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [propertyId]);

  useEffect(() => {
    let active = true;
    if (!property?.id) {
      setGroupDeal(null);
      return undefined;
    }

    getPropertyGroupDeal(property.id)
      .then((response) => {
        if (!active) return;
        setGroupDeal(response.item || null);
      })
      .catch(() => {
        if (!active) return;
        setGroupDeal(null);
      });

    return () => {
      active = false;
    };
  }, [property?.id]);

  useEffect(() => {
    if (!property?.id) {
      setIsComparedListing(false);
      return undefined;
    }

    const referenceId = String(property.id);
    const sync = () => setIsComparedListing(isCompared(referenceId));
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
  }, [property?.id]);

  useEffect(() => {
    let active = true;
    if (!property?.city) {
      setSimilar([]);
      return undefined;
    }

    apiRequest<SimilarResponse>(`/api/properties?listingType=sale&city=${encodeURIComponent(property.city)}&limit=3`)
      .then((response) => {
        if (!active) return;
        setSimilar(response.properties || []);
      })
      .catch(() => {
        if (!active) return;
        setSimilar([]);
      });

    return () => {
      active = false;
    };
  }, [property?.city]);

  const canonicalPath = useMemo(() => {
    if (!property?.id) return '';
    return buildCanonicalDetailPath('buy', property.title, property.id);
  }, [property?.id, property?.title]);

  useEffect(() => {
    if (!property) return;

    applySeo({
      title: `${property.title} | Buy Property in ${property.city} | ZDT Realty`,
      description:
        property.description?.trim() ||
        `${property.propertyType} in ${property.locality || property.area}, ${property.city}. Price: ${formatPrice(
          property.price
        )}.`,
      canonicalPath: canonicalPath || undefined,
      type: 'product',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'Residence',
        name: property.title,
        description: property.description || '',
        url: canonicalPath || window.location.pathname,
        address: {
          '@type': 'PostalAddress',
          addressLocality: property.locality || property.area,
          addressRegion: property.city,
          streetAddress: property.fullAddress || property.address || '',
        },
        offers: property.price
          ? {
              '@type': 'Offer',
              priceCurrency: 'INR',
              price: Number(property.price),
              availability: 'https://schema.org/InStock',
            }
          : undefined,
      },
    });

    if (canonicalPath && window.location.pathname !== canonicalPath) {
      const current = window.history.state || {};
      window.history.replaceState(current, '', canonicalPath);
    }
  }, [canonicalPath, property]);

  const gallery = useMemo(() => {
    if (!property) return [];
    const images = property.imageUrls?.length ? property.imageUrls : [property.primaryImage];
    return images.filter(Boolean);
  }, [property]);

  const emiLabel = useMemo(() => estimateEmi(property?.price || null, emiRate, emiYears), [property?.price, emiRate, emiYears]);

  const groupStatusLabel = useMemo(() => resolveGroupStatusLabel(groupDeal), [groupDeal]);

  const groupProgress = useMemo(() => {
    if (!groupDeal) return 0;
    const derived = Math.round((Number(groupDeal.joinedBuyers || 0) / Math.max(1, Number(groupDeal.minBuyers || 1))) * 100);
    return Math.max(0, Math.min(100, Number(groupDeal.progressPercent || derived)));
  }, [groupDeal]);

  const averageAreaPrice = useMemo(() => {
    if (!property?.pricePerSqft || property.pricePerSqft <= 0) return 'Not available';
    return `INR ${Math.round(property.pricePerSqft).toLocaleString('en-IN')} / sq.ft`;
  }, [property?.pricePerSqft]);

  const nearbyPriceRange = useMemo(() => {
    const prices = similar.map((item) => Number(item.price || 0)).filter((value) => value > 0);
    if (prices.length === 0) return 'Not enough nearby data';
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return `${formatPrice(min)} - ${formatPrice(max)}`;
  }, [similar]);

  const trendLabel = useMemo(() => {
    if (priceHistory.length < 2) return 'Stable';
    const latest = Number(priceHistory[0].nextPrice || 0);
    const oldest = Number(priceHistory[priceHistory.length - 1].nextPrice || 0);
    if (latest <= 0 || oldest <= 0) return 'Stable';
    const change = ((latest - oldest) / oldest) * 100;
    if (change > 1) return `Upward (${change.toFixed(1)}%)`;
    if (change < -1) return `Softening (${Math.abs(change).toFixed(1)}%)`;
    return 'Stable';
  }, [priceHistory]);

  const floorPlanSummary = useMemo(() => {
    const floors = Array.isArray(property?.layoutDetails?.floors) ? property.layoutDetails?.floors || [] : [];
    if (floors.length === 0) return [];
    return floors.slice(0, 6).map((item, index) => ({
      name: String(item?.name || `Floor ${index + 1}`),
      units: Number(item?.units || 0),
    }));
  }, [property?.layoutDetails]);

  const pricingBreakdown = useMemo(() => {
    const base = Number(property?.price || 0);
    if (base <= 0) {
      return {
        base: 'On request',
        registration: 'On request',
        total: 'On request',
      };
    }
    const registrationEstimate = Math.round(base * 0.07);
    const totalEstimate = base + registrationEstimate;
    return {
      base: formatPrice(base),
      registration: formatPrice(registrationEstimate),
      total: formatPrice(totalEstimate),
    };
  }, [property?.price]);

  const handleBuyerLead = async (mode: 'callback' | 'visit' | 'enquiry' | 'report') => {
    if (!property) return;
    if (!buyerName.trim() || !buyerPhone.trim()) {
      toast.error('Please enter your name and phone number first.');
      return;
    }

    let leadType: 'general' | 'schedule_visit' | 'contact_seller' | 'fraud_report' = 'general';
    let message = buyerNote.trim();

    if (mode === 'callback') {
      leadType = 'contact_seller';
      message = `Call back requested. City: ${buyerCity || 'NA'}.`;
    } else if (mode === 'visit') {
      leadType = 'schedule_visit';
      message = `Site visit requested on ${visitDate || 'TBD'} at ${visitTime || 'TBD'}. City: ${buyerCity || 'NA'}.`;
    } else if (mode === 'report') {
      leadType = 'fraud_report';
      message = `Reason: ${reportReason}. Details: ${reportDetails || 'NA'}.`;
    } else {
      leadType = 'general';
      message = message || 'Buyer enquiry submitted for more project details.';
    }

    if (message.trim().length < 4) {
      toast.error('Please provide a little more detail in your message.');
      return;
    }

    try {
      setLeadSubmitting(true);
      await apiRequest('/api/leads', {
        method: 'POST',
        body: JSON.stringify({
          propertyId: property.id,
          leadType,
          name: buyerName.trim(),
          phone: buyerPhone.trim(),
          message: message.trim(),
        }),
      });
      toast.success('Request submitted successfully.');
      if (mode === 'report') {
        setReportDetails('');
      }
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : 'Unable to submit request');
    } finally {
      setLeadSubmitting(false);
    }
  };

  const handleGroupDealSubmit = async () => {
    if (!property) return;
    if (!groupFormName.trim() || !groupFormPhone.trim() || !groupFormCity.trim()) {
      toast.error('Please fill Name, Phone number, and City.');
      return;
    }

    try {
      setGroupFormSubmitting(true);
      await createGroupDealRequest({
        propertyId: property.id,
        fullName: groupFormName.trim(),
        phone: groupFormPhone.trim(),
        note: `City: ${groupFormCity.trim()} | Intent: ${groupFormIntent}`,
        consent: true,
      });
      toast.success('Group deal interest sent. Builder confirmation is required.');
      setGroupFormName('');
      setGroupFormPhone('');
      setGroupFormCity('');
      setGroupFormIntent('Interested');
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : 'Unable to submit group deal request');
    } finally {
      setGroupFormSubmitting(false);
    }
  };

  const handleInviteBuyers = async () => {
    if (!property) return;
    const text = `Group deal option available for ${property.title}. Join with me on ZDT Realty.`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Invite message copied');
    } catch {
      toast.message(text);
    }
  };

  if (loading) {
    return (
      <section className="pb-16 pt-28">
        <div className="page-container">
          <PropertyCardsSkeleton />
        </div>
      </section>
    );
  }

  if (!property || error) {
    return (
      <section className="pb-16 pt-28">
        <div className="page-container">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            {error || 'Property not found.'}
          </div>
          <Button className="mt-4" onClick={onBackToBuy}>
            Back to Buy
          </Button>
        </div>
      </section>
    );
  }

  const minBuyers = Number(groupDeal?.minBuyers || 5);
  const joinedBuyers = Number(groupDeal?.joinedBuyers || 0);
  const areaSqft = Number(property.areaSqft || property.builtupArea || property.carpetArea || 0);
  const builderVerified = property.company?.isVerified ?? property.isVerified;
  const ownershipCheckStatus = builderVerified ? 'Verified' : 'In Progress';
  const govRefStatus = property.reraNumber ? 'Available' : 'In Progress';
  const possessionLabel = formatPossessionStatus(property.possessionStatus);
  const compareReferenceId = String(property.id);
  const compareBhkLabel =
    property.bhk || property.bedrooms
      ? `${property.bhk || property.bedrooms} BHK`
      : property.propertyType;
  const constructionProgress =
    possessionLabel === 'Ready to Move'
      ? 100
      : possessionLabel === 'Under Construction'
        ? 62
        : possessionLabel === 'New Launch'
          ? 24
          : 45;

  const toggleCompare = () => {
    if (isComparedListing) {
      removeComparedListing(compareReferenceId);
      setIsComparedListing(false);
      toast.success('Removed from compare');
      return;
    }

    upsertComparedListing({
      id: compareReferenceId,
      referenceId: compareReferenceId,
      title: property.title,
      image: property.primaryImage || '/images/property-1.jpg',
      city: property.city,
      area: property.locality || property.area,
      priceLabel: formatPrice(property.price),
      areaLabel: areaSqft > 0 ? `${areaSqft} sq.ft` : 'Area on request',
      propertyType: property.propertyType,
      bhk: compareBhkLabel,
      mainDoorFacing: property.facing || 'NA',
      vastuScore: 80,
      verified: property.isVerified,
      ownerPhone: 'Hidden',
      updatedAt: new Date().toISOString(),
    });
    setIsComparedListing(true);
    toast.success('Added to compare');
  };

  const handleCallContact = () => {
    const opened = openPhoneDialer(property.publicContactPhone);
    if (!opened) {
      onOpenMessages(String(property.id));
      toast.info('Phone number unavailable. Opened in-app chat.');
    }
  };

  const handleShareListing = async () => {
    const absoluteUrl = `${window.location.origin}${canonicalPath || window.location.pathname}`;
    const result = await shareLink({
      title: property.title,
      text: `Check this property in ${property.city}: ${property.title}`,
      url: absoluteUrl,
    });

    if (result === 'copied') {
      setShareStatus('Link copied');
      toast.success('Listing link copied to clipboard.');
      return;
    }
    if (result === 'native') {
      setShareStatus('Shared');
      return;
    }
    setShareStatus('Share failed');
    toast.error('Unable to share this listing right now.');
  };

  return (
    <section className="portal-mobile-page pb-16 pt-28 text-slate-900">
      <div className="page-container portal-mobile-stack space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" className="h-11" onClick={onBackToBuy}>
            Back to Buy
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-11" onClick={onOpenSaved}>
              Save & Shortlist
            </Button>
            <Button variant="outline" className="h-11" onClick={() => void handleShareListing()}>
              <Share2 className="mr-2 h-4 w-4" />
              {shareStatus || 'Share'}
            </Button>
            <Button
              variant="outline"
              className={`h-11 ${isComparedListing ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100' : ''}`}
              onClick={toggleCompare}
            >
              <GitCompareArrows className="mr-2 h-4 w-4" />
              {isComparedListing ? 'Added to Compare' : 'Add to Compare'}
            </Button>
            <Button variant="outline" className="h-11" onClick={onOpenCompare}>Open Compare</Button>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <div className="portal-mobile-panel overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <img
                src={activeImage}
                alt={property.title}
                className="h-[340px] w-full cursor-pointer object-cover sm:h-[420px]"
                onClick={() => { setLightboxIndex(gallery.indexOf(activeImage)); setLightboxOpen(true); }}
              />
              <div className="grid grid-cols-4 gap-2 p-3">
                {gallery.map((image) => (
                  <button
                    key={image}
                    type="button"
                    onClick={() => setActiveImage(image)}
                    className={`overflow-hidden rounded-xl border ${activeImage === image ? 'border-slate-900' : 'border-slate-200'}`}
                  >
                    <img src={image} alt="Property view" className="h-20 w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-slate-900 text-white hover:bg-slate-900">Buy Property</Badge>
                {builderVerified && (
                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                    <BadgeCheck className="mr-1 h-3.5 w-3.5" />
                    Verified Builder
                  </Badge>
                )}
                {Boolean(property.reraNumber) && (
                  <Badge className="bg-amber-600 text-white hover:bg-amber-600">
                    <Landmark className="mr-1 h-3.5 w-3.5" />
                    Government Reference
                  </Badge>
                )}
                {GROUP_DEAL_ENABLED && Boolean(groupDeal?.dealCode) && (
                  <Badge className="bg-indigo-700 text-white hover:bg-indigo-700">Group Deal Available</Badge>
                )}
              </div>

              <h1 className="mt-4 text-3xl font-semibold text-slate-900">{property.title}</h1>
              <p className="mt-2 inline-flex items-center gap-2 text-sm text-slate-600">
                <MapPin className="h-4 w-4 text-slate-500" />
                {property.locality || property.area}, {property.city}, {property.state}
              </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <InfoCard label="Price" value={formatPrice(property.price)} />
                  <InfoCard label="Area" value={areaSqft > 0 ? `${areaSqft} sq.ft` : 'On request'} />
                <InfoCard
                  label="Configuration"
                  value={property.bhk || property.bedrooms ? `${property.bhk || property.bedrooms} BHK` : property.propertyType}
                />
                <InfoCard label="Floor Details" value={`${property.floorNumber ?? '-'} / ${property.totalFloors ?? '-'}`} />
                <InfoCard label="Possession Status" value={formatPossessionStatus(property.possessionStatus)} />
                <InfoCard
                  label="Possession Date"
                  value={property.availabilityDate ? new Date(property.availabilityDate).toLocaleDateString('en-IN') : 'On request'}
                />
                  <InfoCard label="RERA Number" value={property.reraNumber || 'Not Provided'} />
                </div>
              </div>

              <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-slate-900">Construction Progress</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Current stage: {possessionLabel}. Progress reflects builder updates and available listing records.
                </p>
                <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-brand-secondary" style={{ width: `${constructionProgress}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                  <span>Launch</span>
                  <span>{constructionProgress}% complete</span>
                  <span>Handover</span>
                </div>
              </div>

              <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-slate-900">Property Description</h2>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                {property.description || 'Builder-provided factual description is currently being updated.'}
              </p>
            </div>

            <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">Amenities</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {property.amenities.length > 0 ? (
                  property.amenities.map((amenity) => (
                    <span key={amenity} className="portal-mobile-chip rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">
                      {amenity}
                    </span>
                  ))
                ) : (
                  <>
                    <span className="portal-mobile-chip rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">Parking</span>
                    <span className="portal-mobile-chip rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">Lift</span>
                    <span className="portal-mobile-chip rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">Security</span>
                    <span className="portal-mobile-chip rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">Power Backup</span>
                    <span className="portal-mobile-chip rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">Water Supply</span>
                  </>
                )}
              </div>
            </div>

            <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">Floor Plans</h2>
              {floorPlanSummary.length > 0 ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {floorPlanSummary.map((floor, index) => (
                    <div key={`${floor.name}-${index}`} className="portal-mobile-card rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-sm font-semibold text-slate-900">{floor.name}</p>
                      <p className="mt-1 text-xs text-slate-600">Units on this floor: {floor.units || 'Not shared'}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="portal-mobile-card mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  Detailed floor plans are being updated by the builder.
                </div>
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-slate-900">Legal & Approval Information</h2>
                <div className="mt-3 grid gap-3 text-sm text-slate-700">
                  <InfoCard label="RERA / Government Reference" value={property.reraNumber || 'In Progress'} />
                  <InfoCard label="Ownership Check" value={ownershipCheckStatus} />
                  <InfoCard label="Local Approval Records" value={govRefStatus} />
                </div>
                <p className="mt-3 text-xs text-slate-600">
                  Ownership Check - In Progress means primary records are still being reconciled and final due diligence remains buyer responsibility.
                </p>
              </div>

              <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-slate-900">Pricing Breakdown</h2>
                <div className="mt-3 grid gap-3 text-sm text-slate-700">
                  <InfoCard label="Base Property Price" value={pricingBreakdown.base} />
                  <InfoCard label="Registration & Statutory Estimate" value={pricingBreakdown.registration} />
                  <InfoCard label="Estimated Total Outlay" value={pricingBreakdown.total} />
                </div>
                <p className="mt-3 text-xs text-slate-600">
                  Registration and statutory amounts are estimates and can vary by state rules and agreement value.
                </p>
              </div>
            </div>

            {GROUP_DEAL_ENABLED ? (
              <div className="portal-mobile-panel rounded-3xl border border-indigo-200 bg-indigo-50/40 p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-slate-900">Group Deal Option</h2>
                <p className="mt-2 text-sm text-slate-700">
                  This property supports group purchasing. Discount can improve as more buyers join, with final pricing confirmed by the builder.
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <InfoCard label="Minimum Buyers Required" value={String(minBuyers)} />
                  <InfoCard label="Current Interested Buyers" value={String(joinedBuyers)} />
                  <InfoCard label="Group Status" value={groupStatusLabel} />
                </div>

                <div className="mt-4">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-indigo-100">
                    <div className="h-full rounded-full bg-indigo-600" style={{ width: `${groupProgress}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{joinedBuyers} of {minBuyers} joined ({groupProgress}% progress)</p>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <InfoCard label="Regular Price" value={formatPrice(property.price)} />
                  <InfoCard label="Discounted Price Range" value={formatGroupDiscountedRange(groupDeal)} />
                </div>
                {groupDeal?.validUntil ? (
                  <p className="mt-2 inline-flex items-center gap-2 text-xs text-slate-600">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Optional time limit: {new Date(groupDeal.validUntil).toLocaleDateString('en-IN')}
                  </p>
                ) : null}

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <Button
                    className="bg-indigo-700 text-white hover:bg-indigo-800"
                    onClick={() => {
                      if (groupDeal?.dealCode && onOpenGroupDeal) {
                        onOpenGroupDeal(groupDeal.dealCode);
                      } else {
                        void handleGroupDealSubmit();
                      }
                    }}
                    disabled={groupFormSubmitting}
                  >
                    Join Group Deal
                  </Button>
                  <Button variant="outline" className="border-indigo-300 text-indigo-800" onClick={() => void handleGroupDealSubmit()} disabled={groupFormSubmitting}>
                    Create Group Deal
                  </Button>
                  <Button variant="outline" className="border-indigo-300 text-indigo-800" onClick={() => void handleInviteBuyers()}>
                    Invite Buyers
                  </Button>
                </div>

                <div className="mt-4 rounded-2xl border border-indigo-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Join Form</h3>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <Input value={groupFormName} onChange={(event) => setGroupFormName(event.target.value)} placeholder="Name" />
                    <Input value={groupFormPhone} onChange={(event) => setGroupFormPhone(event.target.value)} placeholder="Phone number" />
                    <Input value={groupFormCity} onChange={(event) => setGroupFormCity(event.target.value)} placeholder="City" />
                    <Select
                      value={groupFormIntent}
                      onValueChange={(value: 'Buy now' | 'Interested') => setGroupFormIntent(value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Intent" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Buy now">Buy now</SelectItem>
                        <SelectItem value="Interested">Interested</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="mt-2 text-xs text-slate-600">No payment is collected at this stage.</p>
                  <p className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
                    Group deals indicate buyer interest. Final pricing and allotment are confirmed by the builder.
                  </p>
                </div>
              </div>
            ) : null}

            <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">Individual Buy Option</h2>
              <p className="mt-2 text-sm text-slate-600">Request call back, schedule site visit, or send direct enquiry.</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Input value={buyerName} onChange={(event) => setBuyerName(event.target.value)} placeholder="Your name" />
                <Input value={buyerPhone} onChange={(event) => setBuyerPhone(event.target.value)} placeholder="Phone number" />
                <Input value={buyerCity} onChange={(event) => setBuyerCity(event.target.value)} placeholder="City" />
                <Input type="date" value={visitDate} onChange={(event) => setVisitDate(event.target.value)} />
                <Input type="time" value={visitTime} onChange={(event) => setVisitTime(event.target.value)} />
                <Textarea value={buyerNote} onChange={(event) => setBuyerNote(event.target.value)} placeholder="Send enquiry" className="min-h-24" />
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <Button onClick={() => void handleBuyerLead('callback')} disabled={leadSubmitting}>
                  Request Call Back
                </Button>
                <Button variant="outline" onClick={() => void handleBuyerLead('visit')} disabled={leadSubmitting}>
                  <CalendarDays className="mr-2 h-4 w-4" />
                  Schedule Site Visit
                </Button>
                <Button variant="outline" onClick={() => void handleBuyerLead('enquiry')} disabled={leadSubmitting}>
                  Send Enquiry
                </Button>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-slate-900">Location & Connectivity</h2>
                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  <p className="font-medium text-slate-900">Map View</p>
                  <p className="mt-1">{property.locality || property.area}, {property.city}, {property.state}</p>
                </div>
                <ul className="mt-3 space-y-2 text-sm text-slate-700">
                  <li>Schools: Nearby community and private schools</li>
                  <li>Hospitals: Multi-speciality hospitals within local drive range</li>
                  <li>Main roads: Direct connector roads and arterial access</li>
                  <li>Transport: City bus and shared mobility availability</li>
                </ul>
              </div>

              <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-slate-900">Price Insights</h2>
                <div className="mt-3 grid gap-3 text-sm text-slate-700">
                  <InfoCard label="Average Area Price" value={averageAreaPrice} />
                  <InfoCard label="Nearby Property Prices" value={nearbyPriceRange} />
                  <InfoCard label="Trend Indicator" value={trendLabel} />
                  <div className="portal-mobile-card rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    <LineChart className="mb-1 h-4 w-4 text-slate-500" />
                    Trend is based on available listing history and nearby inventory samples.
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-slate-900">Builder Profile</h2>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <p><span className="font-medium text-slate-900">Builder:</span> {property.company?.name || property.companyName || 'Builder profile pending'}</p>
                  <p><span className="font-medium text-slate-900">Verification:</span> {builderVerified ? 'Verified' : 'Pending verification'}</p>
                  <p><span className="font-medium text-slate-900">Past Projects:</span> {property.companyPropertyCount || 0}</p>
                </div>
                <div className="mt-3">
                  <Button variant="outline" onClick={() => onOpenMessages(String(property.id))}>
                    <MessageCircle className="mr-2 h-4 w-4" />
                    Contact Builder
                  </Button>
                </div>
              </div>

              <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-slate-900">Trust & Verification</h2>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <p><span className="font-medium text-slate-900">Builder Verified:</span> {builderVerified ? 'YES' : 'NO'}</p>
                  <p><span className="font-medium text-slate-900">Ownership Check:</span> {ownershipCheckStatus}</p>
                  <p><span className="font-medium text-slate-900">Government Reference:</span> {govRefStatus}</p>
                </div>
              </div>
            </div>

            <div className="portal-mobile-panel rounded-3xl border border-rose-200 bg-rose-50/50 p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">User Safety & Transparency</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Select value={reportReason} onValueChange={setReportReason}>
                  <SelectTrigger>
                    <SelectValue placeholder="Reason" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fake_listing">Fake listing</SelectItem>
                    <SelectItem value="incorrect_price">Incorrect price</SelectItem>
                    <SelectItem value="already_sold">Already sold</SelectItem>
                  </SelectContent>
                </Select>
                <Textarea
                  value={reportDetails}
                  onChange={(event) => setReportDetails(event.target.value)}
                  placeholder="Add details (optional)"
                  className="min-h-24"
                />
              </div>
              <Button
                variant="outline"
                className="mt-3 border-rose-300 text-rose-700 hover:bg-rose-100 hover:text-rose-700"
                onClick={() => void handleBuyerLead('report')}
                disabled={leadSubmitting}
              >
                <Flag className="mr-2 h-4 w-4" />
                Report Listing
              </Button>
              <p className="mt-3 text-xs text-slate-600">
                ZDT Realty is an independent real estate platform. Listings are provided by builders and owners. Group deal pricing is subject to builder confirmation.
              </p>
            </div>

            {similar.length > 0 && (
              <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-slate-900">Similar Properties</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  {similar.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onOpenSimilar(String(item.id))}
                      className="portal-mobile-card overflow-hidden rounded-2xl border border-slate-200 bg-white text-left transition hover:border-slate-300"
                    >
                      <img src={item.primaryImage || '/images/property-1.jpg'} alt={item.title} className="h-28 w-full object-cover" />
                      <div className="p-3">
                        <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
                        <p className="text-xs text-slate-600">{item.area}, {item.city}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{formatPrice(item.price)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Pricing</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{formatPrice(property.price)}</p>
              <p className="mt-2 text-sm text-slate-600">{emiLabel}</p>
              <div className="portal-mobile-card mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                <p><span className="font-semibold">Base price:</span> {pricingBreakdown.base}</p>
                <p><span className="font-semibold">Registration est.:</span> {pricingBreakdown.registration}</p>
                <p><span className="font-semibold">Total est.:</span> {pricingBreakdown.total}</p>
              </div>
              <div className="mt-3 space-y-3">
                <div>
                  <p className="text-xs text-slate-500">Interest rate</p>
                  <Slider value={[emiRate * 100]} onValueChange={([value]) => setEmiRate(value / 100)} min={6} max={14} step={0.1} />
                  <p className="mt-1 text-xs text-slate-600">{(emiRate * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Tenure</p>
                  <Slider value={[emiYears]} onValueChange={([value]) => setEmiYears(value)} min={5} max={30} step={1} />
                  <p className="mt-1 text-xs text-slate-600">{emiYears} years</p>
                </div>
              </div>
              <Button
                variant="outline"
                className="mt-4 w-full border-emerald-200 text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900"
                onClick={() => {
                  const checkoutUrl = `/checkout?kind=property&propertyId=${encodeURIComponent(String(property.id))}&amount=${encodeURIComponent(String(property.price || 0))}&title=${encodeURIComponent(property.title || '')}`;
                  window.location.assign(checkoutUrl);
                }}
              >
                <Coins className="mr-2 h-4 w-4" />
                Use Dalal Coin
              </Button>
              <Button
                className="mt-4 w-full bg-slate-900 text-white hover:bg-slate-800"
                onClick={() => onOpenMessages(String(property.id))}
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                Contact Builder
              </Button>
              <Button
                variant="outline"
                className="mt-2 w-full"
                onClick={handleCallContact}
              >
                <PhoneCall className="mr-2 h-4 w-4" />
                Call Builder
              </Button>
              {GROUP_DEAL_ENABLED ? (
                <Button
                  variant="outline"
                  className="mt-2 w-full border-indigo-300 text-indigo-800 hover:bg-indigo-50 hover:text-indigo-900"
                  onClick={() => {
                    if (groupDeal?.dealCode && onOpenGroupDeal) {
                      onOpenGroupDeal(groupDeal.dealCode);
                    } else {
                      void handleGroupDealSubmit();
                    }
                  }}
                  disabled={groupFormSubmitting}
                >
                  {groupDeal?.dealCode ? 'Join Group Deal' : 'Create Group Deal'}
                </Button>
              ) : null}
            </div>

            <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">Trust Checklist</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                <li className="inline-flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                  Verify identity, ownership chain, and legal records.
                </li>
                <li className="inline-flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-600" />
                  Complete site visit before transfer or token.
                </li>
                <li className="inline-flex items-start gap-2">
                  <Users className="mt-0.5 h-4 w-4 text-emerald-600" />
                  Group deal terms require builder confirmation.
                </li>
              </ul>
            </div>
          </aside>
        </div>

        <p className="portal-mobile-card rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
          ZDT Realty is an independent real estate platform built with transparency and verified listings.
        </p>
      </div>

      <GalleryLightbox
        images={gallery}
        initialIndex={lightboxIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        altPrefix={property.title}
      />
    </section>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="portal-mobile-card rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}
