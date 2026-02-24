import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Flag,
  Landmark,
  LineChart,
  MapPin,
  MessageCircle,
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
  company?: {
    id: number;
    name: string;
    logoUrl: string;
    isVerified: boolean;
  };
}

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

  const gallery = useMemo(() => {
    if (!property) return [];
    const images = property.imageUrls?.length ? property.imageUrls : [property.primaryImage];
    return images.filter(Boolean);
  }, [property]);

  const emiLabel = useMemo(() => estimateEmi(property?.price || null, emiRate, emiYears), [property?.price, emiRate, emiYears]);

  const groupStatusLabel = useMemo(() => resolveGroupStatusLabel(groupDeal), [groupDeal]);

  const groupProgress = useMemo(() => {
    if (!groupDeal) return 30;
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
  const joinedBuyers = Number(groupDeal?.joinedBuyers || 3);
  const areaSqft = Number(property.areaSqft || property.builtupArea || property.carpetArea || 0);
  const builderVerified = property.company?.isVerified ?? property.isVerified;
  const govRefStatus = property.reraNumber ? 'Available' : 'In Progress';
  const possessionLabel = formatPossessionStatus(property.possessionStatus);
  const constructionProgress =
    possessionLabel === 'Ready to Move'
      ? 100
      : possessionLabel === 'Under Construction'
        ? 62
        : possessionLabel === 'New Launch'
          ? 24
          : 45;

  return (
    <section className="pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" className="h-9" onClick={onBackToBuy}>
            Back to Buy
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-9" onClick={onOpenSaved}>
              Save & Shortlist
            </Button>
            <Button variant="outline" className="h-9" onClick={onOpenCompare}>
              Compare Properties
            </Button>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <img src={activeImage} alt={property.title} className="h-[340px] w-full object-cover sm:h-[420px]" />
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

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
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
                {Boolean(groupDeal?.dealCode) && (
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

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
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

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-slate-900">Property Description</h2>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                {property.description || 'Builder-provided factual description is currently being updated.'}
              </p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">Amenities</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {property.amenities.length > 0 ? (
                  property.amenities.map((amenity) => (
                    <span key={amenity} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">
                      {amenity}
                    </span>
                  ))
                ) : (
                  <>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">Parking</span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">Lift</span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">Security</span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">Power Backup</span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">Water Supply</span>
                  </>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-indigo-200 bg-indigo-50/40 p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">Group Deal Option</h2>
              <p className="mt-2 text-sm text-slate-700">
                This property supports group purchasing. Buyers can join together to request special pricing or benefits, subject to builder approval.
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
                <p className="mt-1 text-xs text-slate-600">{groupProgress}% progress</p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <InfoCard label="Regular Price" value={formatPrice(property.price)} />
                <InfoCard label="Group Deal Pricing" value="Shared on confirmation" />
              </div>

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
                  Start a Group Deal
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
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
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
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
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

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-slate-900">Price Insights</h2>
                <div className="mt-3 grid gap-3 text-sm text-slate-700">
                  <InfoCard label="Average Area Price" value={averageAreaPrice} />
                  <InfoCard label="Nearby Property Prices" value={nearbyPriceRange} />
                  <InfoCard label="Trend Indicator" value={trendLabel} />
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    <LineChart className="mb-1 h-4 w-4 text-slate-500" />
                    Trend is based on available listing history and nearby inventory samples.
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-slate-900">Builder / Seller Profile</h2>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <p><span className="font-medium text-slate-900">Builder:</span> {property.company?.name || property.companyName || 'Builder profile pending'}</p>
                  <p><span className="font-medium text-slate-900">Verification:</span> {builderVerified ? 'Verified' : 'Pending verification'}</p>
                  <p><span className="font-medium text-slate-900">Past Projects:</span> {property.companyPropertyCount || 0}</p>
                </div>
                <div className="mt-3">
                  <Button variant="outline" onClick={() => onOpenMessages(String(property.id))}>
                    <MessageCircle className="mr-2 h-4 w-4" />
                    Contact Seller
                  </Button>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-slate-900">Trust & Verification</h2>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <p><span className="font-medium text-slate-900">Builder Verified:</span> {builderVerified ? 'YES' : 'NO'}</p>
                  <p><span className="font-medium text-slate-900">Ownership Check:</span> In Progress</p>
                  <p><span className="font-medium text-slate-900">Government Reference:</span> {govRefStatus}</p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-rose-200 bg-rose-50/50 p-6 shadow-sm">
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
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-slate-900">Similar Properties</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  {similar.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onOpenSimilar(String(item.id))}
                      className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-left transition hover:border-slate-300"
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
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Pricing</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{formatPrice(property.price)}</p>
              <p className="mt-2 text-sm text-slate-600">{emiLabel}</p>
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
                className="mt-4 w-full bg-slate-900 text-white hover:bg-slate-800"
                onClick={() => onOpenMessages(String(property.id))}
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                Contact Seller
              </Button>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
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

        <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
          ZDT Realty is an independent real estate platform built with transparency and verified listings.
        </p>
      </div>
    </section>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}
