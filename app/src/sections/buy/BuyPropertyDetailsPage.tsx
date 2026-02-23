import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  Download,
  Flag,
  LineChart,
  MapPin,
  PhoneCall,
  PlayCircle,
  Sparkles,
  Users,
  Video,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/http';
import { getPropertyGroupDeal } from '@/lib/groupDealsApi';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
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
  city: string;
  area: string;
  locality: string;
  address: string;
  price: number | null;
  pricePerSqft: number | null;
  bhk: number | null;
  areaSqft: number | null;
  carpetArea: number | null;
  builtupArea: number | null;
  superBuiltupArea: number | null;
  floorNumber: number | null;
  totalFloors: number | null;
  facing: string;
  possessionStatus: string;
  reraNumber: string;
  isVerified: boolean;
  isFeatured: boolean;
  viewCount: number;
  amenities: string[];
  description: string;
  imageUrls: string[];
  primaryImage: string;
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
  properties: Array<{ id: number; title: string; city: string; area: string; primaryImage: string; price: number | null }>;
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

export default function BuyPropertyDetailsPage({
  propertyId,
  onBackToBuy,
  onOpenSimilar,
  onOpenCompare: _onOpenCompare,
  onOpenSaved,
  onOpenMessages,
  onOpenGroupDeal,
}: BuyPropertyDetailsPageProps) {
  const [property, setProperty] = useState<PropertyDetails | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryPoint[]>([]);
  const [similar, setSimilar] = useState<SimilarResponse['properties']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [groupDealCode, setGroupDealCode] = useState('');
  const [groupDealUnitType, setGroupDealUnitType] = useState('');
  const [activeImage, setActiveImage] = useState('');
  const [emiRate, setEmiRate] = useState(0.09);
  const [emiYears, setEmiYears] = useState(20);

  const [visitName, setVisitName] = useState('');
  const [visitPhone, setVisitPhone] = useState('');
  const [visitDate, setVisitDate] = useState('');
  const [visitTime, setVisitTime] = useState('');
  const [visitNote, setVisitNote] = useState('');

  const [offerName, setOfferName] = useState('');
  const [offerPhone, setOfferPhone] = useState('');
  const [offerAmount, setOfferAmount] = useState('');
  const [offerNote, setOfferNote] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    apiRequest<DetailsResponse>(`/api/properties/${propertyId}`)
      .then((response) => {
        if (!active) return;
        setProperty(response.property);
        setPriceHistory(response.priceHistory || []);
        setActiveImage(response.property.primaryImage || response.property.imageUrls?.[0] || '/images/property-1.jpg');
        if (response.property.city) {
          apiRequest<SimilarResponse>(`/api/properties?listingType=sale&city=${encodeURIComponent(response.property.city)}&limit=3`)
            .then((similarResponse) => {
              if (!active) return;
              setSimilar(similarResponse.properties || []);
            })
            .catch(() => {
              if (!active) return;
              setSimilar([]);
            });
        }
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load property');
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
    const propertyNumericId = Number(property?.id || 0);
    if (!propertyNumericId) {
      setGroupDealCode('');
      setGroupDealUnitType('');
      return undefined;
    }

    getPropertyGroupDeal(propertyNumericId)
      .then((response) => {
        if (!active) return;
        if (response.item?.dealCode) {
          setGroupDealCode(response.item.dealCode);
          setGroupDealUnitType(response.item.unitType || '');
        } else {
          setGroupDealCode('');
          setGroupDealUnitType('');
        }
      })
      .catch(() => {
        if (!active) return;
        setGroupDealCode('');
        setGroupDealUnitType('');
      });

    return () => {
      active = false;
    };
  }, [property?.id]);

  const gallery = useMemo(() => {
    if (!property) return [];
    const images = property.imageUrls && property.imageUrls.length > 0 ? property.imageUrls : [property.primaryImage];
    return images.filter(Boolean);
  }, [property]);

  const emiLabel = useMemo(() => {
    if (!property) return 'EMI on request';
    return estimateEmi(property.price, emiRate, emiYears);
  }, [property, emiRate, emiYears]);

  const handleLead = async (type: 'schedule_visit' | 'make_offer' | 'contact_seller' | 'fraud_report') => {
    if (!property) return;
    const payload =
      type === 'schedule_visit'
        ? {
            propertyId: property.id,
            leadType: type,
            name: visitName,
            phone: visitPhone,
            message: `Visit request on ${visitDate} at ${visitTime}. ${visitNote}`,
          }
        : type === 'make_offer'
          ? {
              propertyId: property.id,
              leadType: type,
              name: offerName,
              phone: offerPhone,
              message: `Offer INR ${offerAmount}. ${offerNote}`,
            }
          : {
              propertyId: property.id,
              leadType: type,
              name: offerName || visitName || 'Buyer',
              phone: offerPhone || visitPhone || 'NA',
              message: offerNote || visitNote || 'Request initiated.',
            };

    if (!payload.name.trim() || !payload.phone.trim()) {
      toast.error('Please enter your name and phone.');
      return;
    }

    try {
      await apiRequest('/api/leads', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      toast.success('Request submitted. Our team will connect shortly.');
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : 'Unable to submit request');
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

  return (
    <section className="pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" className="h-9" onClick={onBackToBuy}>
            Back to Buy
          </Button>
          <div className="flex flex-wrap gap-2">
            {groupDealCode && onOpenGroupDeal ? (
              <Button
                variant="outline"
                className="h-9 border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                onClick={() => onOpenGroupDeal(groupDealCode)}
              >
                <Users className="mr-2 h-4 w-4" />
                View Group Deal
              </Button>
            ) : null}
            <Button variant="outline" className="h-9" onClick={onOpenSaved}>
              Saved
            </Button>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <img src={activeImage} alt={property.title} className="h-[360px] w-full object-cover sm:h-[440px]" />
              <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-4">
                {gallery.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setActiveImage(item)}
                    className={`overflow-hidden rounded-xl border ${activeImage === item ? 'border-blue-500' : 'border-slate-200'}`}
                  >
                    <img src={item} alt="Property view" className="h-20 w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                {property.isVerified && (
                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                    <BadgeCheck className="mr-1 h-3.5 w-3.5" />
                    Verified listing
                  </Badge>
                )}
                {property.reraNumber && (
                  <Badge className="bg-slate-900 text-white hover:bg-slate-900">RERA</Badge>
                )}
                {property.isFeatured && (
                  <Badge className="bg-amber-500 text-white hover:bg-amber-500">Hot deal</Badge>
                )}
                {groupDealCode && (
                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                    Group Deal Available{groupDealUnitType ? ` (${groupDealUnitType})` : ''}
                  </Badge>
                )}
              </div>

              <h1 className="mt-4 text-3xl font-bold text-slate-900">{property.title}</h1>
              <p className="mt-2 inline-flex items-center gap-2 text-sm text-slate-600">
                <MapPin className="h-4 w-4 text-slate-400" />
                {property.locality || property.area}, {property.city}
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Area</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {property.areaSqft || property.carpetArea || property.builtupArea || 'On request'} sq.ft
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Configuration</p>
                  <p className="mt-1 font-semibold text-slate-900">{property.bhk ? `${property.bhk} BHK` : 'Studio'}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Facing</p>
                  <p className="mt-1 font-semibold text-slate-900">{property.facing}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Floor</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {property.floorNumber ?? '-'} / {property.totalFloors ?? '-'}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Amenities</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {property.amenities.map((amenity) => (
                      <span
                        key={amenity}
                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600"
                      >
                        {amenity}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-900">AI Insights (Preview)</h3>
                  <div className="mt-3 grid gap-2 text-xs text-slate-600">
                    <p>AI Investment Score: 82/100</p>
                    <p>Rental Yield: 3.4% (projected)</p>
                    <p>Price Appreciation: +8.6% YoY (forecast)</p>
                    <p>Demand Heatmap: High demand zone</p>
                    <p>Match Score: 91% (based on your filters)</p>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-slate-900">Description</h3>
                <p className="mt-2 text-sm text-slate-600">{property.description}</p>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Floor Plan</h3>
                  <div className="mt-3 flex items-center justify-between rounded-xl border border-dashed border-slate-300 p-3 text-xs text-slate-500">
                    Floor plan ready for download
                    <Button size="sm" variant="outline">
                      <Download className="mr-2 h-4 w-4" />
                      Brochure
                    </Button>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Price History</h3>
                  <div className="mt-3 space-y-2">
                    {priceHistory.length === 0 && (
                      <p className="text-xs text-slate-500">No historical price changes available.</p>
                    )}
                    {priceHistory.slice(0, 4).map((point) => (
                      <div key={point.createdAt} className="flex items-center justify-between text-xs text-slate-600">
                        <span>{new Date(point.createdAt).toLocaleDateString('en-IN')}</span>
                        <span>{formatPrice(point.nextPrice)}</span>
                      </div>
                    ))}
                    <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                      <LineChart className="h-4 w-4" />
                      Full graph in analytics module
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-900">EMI Calculator</h3>
                  <p className="mt-2 text-xs text-slate-500">{emiLabel}</p>
                  <div className="mt-3 space-y-3">
                    <div>
                      <p className="text-xs text-slate-500">Interest rate</p>
                      <Slider value={[emiRate * 100]} onValueChange={([value]) => setEmiRate(value / 100)} min={6} max={14} step={0.1} />
                      <p className="mt-1 text-xs text-slate-600">{(emiRate * 100).toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Tenure (years)</p>
                      <Slider value={[emiYears]} onValueChange={([value]) => setEmiYears(value)} min={5} max={30} step={1} />
                      <p className="mt-1 text-xs text-slate-600">{emiYears} years</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Loan Eligibility</h3>
                  <p className="mt-2 text-xs text-slate-500">Instant pre-qualification based on income.</p>
                  <div className="mt-3 grid gap-2">
                    <Input placeholder="Monthly income" />
                    <Input placeholder="Existing EMIs" />
                    <Button variant="outline" className="h-9">Check eligibility</Button>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Location Insights</h3>
                  <div className="mt-3 grid gap-2 text-xs text-slate-600">
                    <p>Travel time to metro: 12 minutes</p>
                    <p>Schools nearby: 5 premium options</p>
                    <p>Hospitals nearby: 3 super-speciality centers</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Media Tour</h3>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 p-2">
                      <PlayCircle className="h-5 w-5" />
                      360 Tour
                    </div>
                    <div className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 p-2">
                      <Video className="h-5 w-5" />
                      Walkthrough
                    </div>
                    <div className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 p-2">
                      <Building2 className="h-5 w-5" />
                      Builder Story
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-end justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Similar Properties</h2>
                  <p className="text-sm text-slate-600">Curated especially for you</p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {similar.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:border-blue-300"
                    onClick={() => onOpenSimilar(String(item.id))}
                  >
                    <img src={item.primaryImage || '/images/property-1.jpg'} alt={item.title} className="h-32 w-full object-cover" />
                    <div className="p-3">
                      <p className="text-sm font-semibold text-slate-900 truncate">{item.title}</p>
                      <p className="text-xs text-slate-500">{item.area}, {item.city}</p>
                      <p className="mt-1 text-sm font-semibold text-blue-900">{formatPrice(item.price)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Price</p>
              <p className="mt-2 text-3xl font-bold text-blue-900">{formatPrice(property.price)}</p>
              <p className="mt-2 text-sm text-slate-600">{property.viewCount} views</p>

              <Button
                className="mt-4 h-11 w-full rounded-xl bg-blue-700 text-white hover:bg-blue-800"
                onClick={() => onOpenMessages(String(property.id))}
              >
                <PhoneCall className="h-4 w-4" />
                Contact Seller
              </Button>
              <p className="mt-2 text-xs text-slate-500">
                Privacy Note: Your contact details are shared only after consent.
              </p>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <h3 className="text-sm font-semibold text-slate-900">Schedule Visit</h3>
                <div className="mt-3 space-y-2">
                  <Input value={visitName} onChange={(e) => setVisitName(e.target.value)} placeholder="Your Name" />
                  <Input value={visitPhone} onChange={(e) => setVisitPhone(e.target.value)} placeholder="Phone" />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
                    <Input type="time" value={visitTime} onChange={(e) => setVisitTime(e.target.value)} />
                  </div>
                  <Textarea value={visitNote} onChange={(e) => setVisitNote(e.target.value)} placeholder="Note" className="min-h-20" />
                  <Button className="h-10 w-full" onClick={() => void handleLead('schedule_visit')}>
                    <CalendarDays className="mr-2 h-4 w-4" />
                    Schedule Visit
                  </Button>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <h3 className="text-sm font-semibold text-slate-900">Make Offer</h3>
                <div className="mt-3 space-y-2">
                  <Input value={offerName} onChange={(e) => setOfferName(e.target.value)} placeholder="Your Name" />
                  <Input value={offerPhone} onChange={(e) => setOfferPhone(e.target.value)} placeholder="Phone" />
                  <Input value={offerAmount} onChange={(e) => setOfferAmount(e.target.value)} placeholder="Offer amount (INR)" />
                  <Textarea value={offerNote} onChange={(e) => setOfferNote(e.target.value)} placeholder="Offer details" className="min-h-20" />
                  <Button className="h-10 w-full" onClick={() => void handleLead('make_offer')}>
                    Submit Offer
                  </Button>
                </div>
              </div>

              <Button
                variant="outline"
                className="mt-4 h-10 w-full border-slate-300 text-rose-700 hover:bg-rose-50 hover:text-rose-700"
                onClick={() => void handleLead('fraud_report')}
              >
                <Flag className="mr-2 h-4 w-4" />
                Report Listing
              </Button>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">Trust & Safety</h3>
              <ul className="mt-3 space-y-3 text-sm text-slate-700">
                <li className="inline-flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                  Verified listing documents are checked by ZDT Realty moderation team.
                </li>
                <li className="inline-flex items-start gap-2">
                  <Sparkles className="mt-0.5 h-4 w-4 text-amber-600" />
                  Price history and AI projections are transparent for every listing.
                </li>
                <li className="inline-flex items-start gap-2">
                  <Flag className="mt-0.5 h-4 w-4 text-rose-600" />
                  Use Report Listing if pricing, images or owner details look suspicious.
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
