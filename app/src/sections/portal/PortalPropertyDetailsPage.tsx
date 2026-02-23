import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  Compass,
  Flag,
  MapPin,
  PhoneCall,
  ShieldAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { findPropertyByReference, portalProperties } from '@/lib/portalData';
import { apiRequest } from '@/lib/http';
import { addNotification } from '@/lib/notificationsStore';
import { toast } from 'sonner';
import { PhoneVerificationField } from '../workflow/CommonBlocks';
import PropertyListingCard from './PropertyListingCard';

interface PortalPropertyDetailsPageProps {
  referenceId?: string;
  onOpenSimilar: (referenceId?: string) => void;
  onOpenMessages: (referenceId?: string) => void;
  onOpenPostProperty: () => void;
}

interface WorkflowPublicListing {
  id: string;
  referenceId: string;
  requestType: string;
  title: string;
  image: string;
  city: string;
  area: string;
  priceLabel: string;
  areaLabel: string;
  propertyType: string;
  bhk: string;
  mainDoorFacing: string;
  vastuScore: number;
  verified: boolean;
  ownerPhone: string;
  updatedAt: string;
}

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function normalizeNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function parseWorkflowListing(raw: unknown): WorkflowPublicListing | null {
  const source = toObject(raw);
  const id = normalizeString(source.id) || normalizeString(source.referenceId);
  const referenceId = normalizeString(source.referenceId) || id;
  const title = normalizeString(source.title);
  if (!referenceId || !title) {
    return null;
  }

  return {
    id: id || referenceId,
    referenceId,
    requestType: normalizeString(source.requestType),
    title,
    image: normalizeString(source.image) || '/images/property-1.jpg',
    city: normalizeString(source.city),
    area: normalizeString(source.area),
    priceLabel: normalizeString(source.priceLabel) || 'Price on request',
    areaLabel: normalizeString(source.areaLabel) || 'Area on request',
    propertyType: normalizeString(source.propertyType) || 'Property',
    bhk: normalizeString(source.bhk) || 'N/A',
    mainDoorFacing: normalizeString(source.mainDoorFacing) || 'NA',
    vastuScore: Math.max(0, Math.min(100, Math.round(normalizeNumber(source.vastuScore)))),
    verified: source.verified === true,
    ownerPhone: normalizeString(source.ownerPhone) || 'Hidden',
    updatedAt: normalizeString(source.updatedAt),
  };
}

function formatUpdatedAt(value: string): string {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function PortalPropertyDetailsPage({
  referenceId,
  onOpenSimilar,
  onOpenMessages,
  onOpenPostProperty,
}: PortalPropertyDetailsPageProps) {
  const refKey = (referenceId || '').trim();

  const portalProperty = useMemo(() => {
    if (!refKey) {
      return portalProperties[0] ?? null;
    }
    return findPropertyByReference(refKey);
  }, [refKey]);

  const [workflowListing, setWorkflowListing] = useState<WorkflowPublicListing | null>(null);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [workflowError, setWorkflowError] = useState('');

  useEffect(() => {
    let active = true;

    if (!refKey || portalProperty) {
      setWorkflowListing(null);
      setWorkflowError('');
      setWorkflowLoading(false);
      return () => {
        active = false;
      };
    }

    setWorkflowLoading(true);
    setWorkflowError('');

    apiRequest<{ listing: unknown }>(`/workflow/public/listings/${encodeURIComponent(refKey)}`)
      .then((response) => {
        if (!active) return;
        const listing = parseWorkflowListing(response.listing);
        if (!listing) {
          throw new Error('Listing not found.');
        }
        setWorkflowListing(listing);
      })
      .catch((error) => {
        if (!active) return;
        setWorkflowListing(null);
        setWorkflowError(error instanceof Error ? error.message : 'Unable to load listing.');
      })
      .finally(() => {
        if (!active) return;
        setWorkflowLoading(false);
      });

    return () => {
      active = false;
    };
  }, [portalProperty, refKey]);

  const [activeImage, setActiveImage] = useState(() => portalProperty?.image || '/images/property-1.jpg');

  useEffect(() => {
    if (portalProperty?.image) {
      setActiveImage(portalProperty.image);
    }
  }, [portalProperty?.image]);

  const gallery = useMemo(() => {
    if (!portalProperty) return [];
    const fallback = ['/images/property-1.jpg', '/images/property-2.jpg', '/images/property-3.jpg'];
    return [portalProperty.image, ...fallback.filter((item) => item !== portalProperty.image)];
  }, [portalProperty]);

  const similar = useMemo(() => {
    if (!portalProperty) {
      return portalProperties.slice(0, 3);
    }
    return portalProperties.filter((item) => item.referenceId !== portalProperty.referenceId).slice(0, 3);
  }, [portalProperty]);

  const [visitOpen, setVisitOpen] = useState(false);
  const [visitName, setVisitName] = useState('');
  const [visitPhone, setVisitPhone] = useState('');
  const [visitPhoneVerificationId, setVisitPhoneVerificationId] = useState('');
  const [visitDate, setVisitDate] = useState('');
  const [visitTime, setVisitTime] = useState('');
  const [visitNote, setVisitNote] = useState('');
  const [isVisitSubmitting, setIsVisitSubmitting] = useState(false);

  const [fraudOpen, setFraudOpen] = useState(false);
  const [fraudReporterName, setFraudReporterName] = useState('');
  const [fraudPhone, setFraudPhone] = useState('');
  const [fraudPhoneVerificationId, setFraudPhoneVerificationId] = useState('');
  const [fraudReason, setFraudReason] = useState('');
  const [isFraudSubmitting, setIsFraudSubmitting] = useState(false);

  const displayReference = portalProperty?.referenceId || workflowListing?.referenceId || refKey;
  const displayTitle = portalProperty?.title || workflowListing?.title || 'Property';
  const displayCity = portalProperty?.city || workflowListing?.city || '';

  useEffect(() => {
    setVisitOpen(false);
    setFraudOpen(false);
    setVisitPhoneVerificationId('');
    setFraudPhoneVerificationId('');
    setVisitDate('');
    setVisitTime('');
    setVisitNote('');
    setFraudReason('');
  }, [displayReference]);

  const submitScheduleVisit = async () => {
    if (!displayReference) {
      toast.error('Missing property reference.');
      return;
    }
    if (!visitName.trim()) {
      toast.error('Enter your name to schedule a visit.');
      return;
    }
    if (!visitPhoneVerificationId) {
      toast.error('Verify your phone before scheduling.');
      return;
    }
    if (!visitDate || !visitTime) {
      toast.error('Select preferred date and time.');
      return;
    }

    setIsVisitSubmitting(true);
    try {
      const response = await apiRequest<{ message: string; referenceId?: string }>(
        '/workflow/public/schedule-visit',
        {
          method: 'POST',
          body: JSON.stringify({
            propertyReference: displayReference,
            propertyTitle: displayTitle,
            requesterName: visitName.trim(),
            phone: visitPhone,
            phoneVerificationId: visitPhoneVerificationId,
            city: displayCity || 'Bangalore',
            preferredDate: visitDate,
            preferredTime: visitTime,
            note: visitNote,
          }),
        }
      );

      toast.success(response.message || 'Visit request created');
      addNotification({
        title: 'Visit request created',
        message: `${displayReference} | ${visitDate} ${visitTime}`,
        kind: 'success',
        source: 'visit',
        metadata: { propertyReference: displayReference },
      });

      setVisitOpen(false);
      setVisitName('');
      setVisitPhone('');
      setVisitPhoneVerificationId('');
      setVisitDate('');
      setVisitTime('');
      setVisitNote('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to schedule visit.');
    } finally {
      setIsVisitSubmitting(false);
    }
  };

  const submitFraudReport = async () => {
    if (!displayReference) {
      toast.error('Missing property reference.');
      return;
    }
    if (!fraudReporterName.trim()) {
      toast.error('Enter your name before reporting.');
      return;
    }
    if (!fraudPhoneVerificationId) {
      toast.error('Verify your phone before reporting.');
      return;
    }
    if (fraudReason.trim().length < 10) {
      toast.error('Please provide more details (min 10 characters).');
      return;
    }

    setIsFraudSubmitting(true);
    try {
      const response = await apiRequest<{ message: string; caseId?: string }>(
        '/workflow/public/report-fraud',
        {
          method: 'POST',
          body: JSON.stringify({
            propertyReference: displayReference,
            reporterName: fraudReporterName.trim(),
            phone: fraudPhone,
            phoneVerificationId: fraudPhoneVerificationId,
            reason: fraudReason.trim(),
          }),
        }
      );

      toast.success(response.message || 'Report submitted', {
        description: response.caseId ? `Case ID: ${response.caseId}` : undefined,
      });
      addNotification({
        title: 'Fraud report submitted',
        message: `${displayReference}${response.caseId ? ` | ${response.caseId}` : ''}`,
        kind: 'warning',
        source: 'safety',
        metadata: { propertyReference: displayReference, caseId: response.caseId || '' },
      });

      setFraudOpen(false);
      setFraudReporterName('');
      setFraudPhone('');
      setFraudPhoneVerificationId('');
      setFraudReason('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to submit report.');
    } finally {
      setIsFraudSubmitting(false);
    }
  };

  if (!portalProperty) {
    return (
      <section className="pb-16 pt-28 text-slate-900">
        <div className="page-container space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Workflow Listing</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">
              {workflowListing?.title || 'Listing details'}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Reference:{' '}
              <span className="font-mono text-slate-700">{displayReference || '-'}</span>
            </p>
          </div>

          {workflowLoading ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-700">
              Loading listing details...
            </div>
          ) : workflowError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
              {workflowError}
            </div>
          ) : !workflowListing ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
              Listing not found.
            </div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-6">
                <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                  <img
                    src={workflowListing.image}
                    alt={workflowListing.title}
                    className="h-[360px] w-full object-cover sm:h-[440px]"
                  />
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-wrap items-center gap-3">
                    {workflowListing.verified && (
                      <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                        <BadgeCheck className="mr-1 h-3.5 w-3.5" />
                        Verified listing
                      </Badge>
                    )}
                    {workflowListing.requestType ? (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                        {workflowListing.requestType}
                      </span>
                    ) : null}
                  </div>

                  <h2 className="mt-4 text-3xl font-bold text-slate-900">{workflowListing.title}</h2>
                  <p className="mt-2 inline-flex items-center gap-2 text-sm text-slate-600">
                    <MapPin className="h-4 w-4 text-slate-400" />
                    {workflowListing.area}, {workflowListing.city}
                  </p>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Area</p>
                      <p className="mt-1 font-semibold text-slate-900">{workflowListing.areaLabel}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Type</p>
                      <p className="mt-1 font-semibold text-slate-900">{workflowListing.propertyType}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">BHK</p>
                      <p className="mt-1 font-semibold text-slate-900">{workflowListing.bhk}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Facing</p>
                      <p className="mt-1 font-semibold text-slate-900">{workflowListing.mainDoorFacing}</p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Vastu Score</p>
                      <p className="mt-1 font-semibold text-slate-900">{workflowListing.vastuScore}%</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Last Updated</p>
                      <p className="mt-1 font-semibold text-slate-900">{formatUpdatedAt(workflowListing.updatedAt)}</p>
                    </div>
                  </div>

                  <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h3 className="text-lg font-semibold text-slate-900">Trust & Safety</h3>
                    <ul className="mt-4 space-y-3 text-sm text-slate-700">
                      <li className="inline-flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                        Verified listing documents are checked by ZDT Realty moderation team.
                      </li>
                      <li className="inline-flex items-start gap-2">
                        <ShieldAlert className="mt-0.5 h-4 w-4 text-amber-600" />
                        Never share OTP, UPI PIN, or payment details directly with unknown contacts.
                      </li>
                      <li className="inline-flex items-start gap-2">
                        <Flag className="mt-0.5 h-4 w-4 text-rose-600" />
                        Use Report Listing if pricing, images or owner details look suspicious.
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Price</p>
                  <p className="mt-2 text-3xl font-bold text-blue-900">{workflowListing.priceLabel}</p>
                  <p className="mt-2 text-sm text-slate-600">{workflowListing.referenceId}</p>

                  <Button
                    className="mt-4 h-11 w-full rounded-xl bg-blue-700 text-white hover:bg-blue-800"
                    onClick={() => onOpenMessages(workflowListing.referenceId)}
                  >
                    <PhoneCall className="h-4 w-4" />
                    Contact Seller
                  </Button>
                  <p className="mt-2 text-xs text-slate-500">
                    Privacy Note: Your contact details are shared only after consent.
                  </p>

                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3 h-10 w-full rounded-xl border-slate-300"
                    onClick={() => setVisitOpen((prev) => !prev)}
                  >
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {visitOpen ? 'Close Visit Form' : 'Schedule Visit'}
                  </Button>
                  {visitOpen && (
                    <div className="mt-3 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <Input value={visitName} onChange={(e) => setVisitName(e.target.value)} placeholder="Your Name" className="h-11 bg-white" />
                      <PhoneVerificationField
                        phone={visitPhone}
                        onPhoneChange={setVisitPhone}
                        verifiedToken={visitPhoneVerificationId}
                        onVerifiedTokenChange={setVisitPhoneVerificationId}
                        purpose="schedule_visit"
                        title="Phone Verification (Schedule Visit)"
                      />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} className="h-11 bg-white" />
                        <Input type="time" value={visitTime} onChange={(e) => setVisitTime(e.target.value)} className="h-11 bg-white" />
                      </div>
                      <Textarea value={visitNote} onChange={(e) => setVisitNote(e.target.value)} placeholder="Note (optional)" className="min-h-20 bg-white text-sm" />
                      <Button
                        type="button"
                        className="h-10 w-full rounded-xl bg-blue-700 text-white hover:bg-blue-800"
                        onClick={() => void submitScheduleVisit()}
                        disabled={isVisitSubmitting}
                      >
                        {isVisitSubmitting ? 'Submitting...' : 'Submit Visit Request'}
                      </Button>
                    </div>
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3 h-10 w-full rounded-xl border-slate-300 text-rose-700 hover:bg-rose-50 hover:text-rose-700"
                    onClick={() => setFraudOpen((prev) => !prev)}
                  >
                    <Flag className="mr-2 h-4 w-4" />
                    {fraudOpen ? 'Close Report Form' : 'Report Listing'}
                  </Button>
                  {fraudOpen && (
                    <div className="mt-3 space-y-3 rounded-2xl border border-red-200 bg-red-50 p-3">
                      <Input value={fraudReporterName} onChange={(e) => setFraudReporterName(e.target.value)} placeholder="Your Name" className="h-11 bg-white" />
                      <PhoneVerificationField
                        phone={fraudPhone}
                        onPhoneChange={setFraudPhone}
                        verifiedToken={fraudPhoneVerificationId}
                        onVerifiedTokenChange={setFraudPhoneVerificationId}
                        purpose="fraud_report"
                        title="Phone Verification (Report Fraud)"
                      />
                      <Textarea value={fraudReason} onChange={(e) => setFraudReason(e.target.value)} placeholder="Describe the issue (min 10 characters)" className="min-h-24 bg-white text-sm" />
                      <Button
                        type="button"
                        className="h-10 w-full rounded-xl bg-red-600 text-white hover:bg-red-700"
                        onClick={() => void submitFraudReport()}
                        disabled={isFraudSubmitting}
                      >
                        {isFraudSubmitting ? 'Submitting...' : 'Submit Report'}
                      </Button>
                    </div>
                  )}
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-900">Post Property FREE</h3>
                  <p className="mt-2 text-sm text-slate-600">
                    Reach premium buyers and tenants with verified listing support.
                  </p>
                  <Button
                    onClick={onOpenPostProperty}
                    className="mt-4 h-10 w-full rounded-xl bg-blue-700 text-white hover:bg-blue-800"
                  >
                    Start Posting
                  </Button>
                </div>
              </aside>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-end justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Similar Properties</h2>
                <p className="text-sm text-slate-600">Curated especially for you</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {similar.map((item) => (
                <PropertyListingCard
                  key={item.id}
                  property={item}
                  onOpenDetails={onOpenSimilar}
                  onOpenMessages={onOpenMessages}
                />
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  const property = portalProperty;

  return (
    <section className="pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-6">
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
                {property.verified && (
                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                    <BadgeCheck className="mr-1 h-3.5 w-3.5" />
                    Verified listing
                  </Badge>
                )}
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {property.status}
                </span>
              </div>

              <h1 className="mt-4 text-3xl font-bold text-slate-900">{property.title}</h1>
              <p className="mt-2 inline-flex items-center gap-2 text-sm text-slate-600">
                <MapPin className="h-4 w-4 text-slate-400" />
                {property.location}, {property.city}
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Area</p>
                  <p className="mt-1 font-semibold text-slate-900">{property.areaLabel}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Configuration</p>
                  <p className="mt-1 font-semibold text-slate-900">{property.bhk}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Facing</p>
                  <p className="mt-1 font-semibold text-slate-900">{property.facing}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Floor</p>
                  <p className="mt-1 font-semibold text-slate-900">{property.floor}</p>
                </div>
              </div>

              <p className="mt-5 text-sm leading-relaxed text-slate-700">{property.description}</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Amenities</h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  {property.amenities.map((amenity) => (
                    <span
                      key={amenity}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700"
                    >
                      {amenity}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Vastu Insights</h2>
                <div className="mt-4 space-y-3">
                  <p className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <Compass className="h-4 w-4 text-slate-500" />
                    Main entrance direction: {property.facing}
                  </p>
                  <p className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <Building2 className="h-4 w-4 text-slate-500" />
                    Suggested living zone: North-East balance
                  </p>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                      <span>Vastu score</span>
                      <span>{property.readyToMove ? 84 : 79}/100</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full bg-blue-700"
                        style={{ width: property.readyToMove ? '84%' : '79%' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Trust & Safety</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-700">
                <li className="inline-flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                  Verified listing documents are checked by ZDT Realty moderation team.
                </li>
                <li className="inline-flex items-start gap-2">
                  <ShieldAlert className="mt-0.5 h-4 w-4 text-amber-600" />
                  Never share OTP, UPI PIN, or payment details directly with unknown contacts.
                </li>
                <li className="inline-flex items-start gap-2">
                  <Flag className="mt-0.5 h-4 w-4 text-rose-600" />
                  Use Report Listing if pricing, images or owner details look suspicious.
                </li>
              </ul>
            </div>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Price</p>
              <p className="mt-2 text-3xl font-bold text-blue-900">{property.priceLabel}</p>
              <p className="mt-2 text-sm text-slate-600">{property.referenceId}</p>

              <Button
                className="mt-4 h-11 w-full rounded-xl bg-blue-700 text-white hover:bg-blue-800"
                onClick={() => onOpenMessages(property.referenceId)}
              >
                <PhoneCall className="h-4 w-4" />
                Contact Seller
              </Button>
              <p className="mt-2 text-xs text-slate-500">
                Privacy Note: Your contact details are shared only after consent.
              </p>

              <Button
                type="button"
                variant="outline"
                className="mt-3 h-10 w-full rounded-xl border-slate-300"
                onClick={() => setVisitOpen((prev) => !prev)}
              >
                <CalendarDays className="mr-2 h-4 w-4" />
                {visitOpen ? 'Close Visit Form' : 'Schedule Visit'}
              </Button>
              {visitOpen && (
                <div className="mt-3 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <Input value={visitName} onChange={(e) => setVisitName(e.target.value)} placeholder="Your Name" className="h-11 bg-white" />
                  <PhoneVerificationField
                    phone={visitPhone}
                    onPhoneChange={setVisitPhone}
                    verifiedToken={visitPhoneVerificationId}
                    onVerifiedTokenChange={setVisitPhoneVerificationId}
                    purpose="schedule_visit"
                    title="Phone Verification (Schedule Visit)"
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} className="h-11 bg-white" />
                    <Input type="time" value={visitTime} onChange={(e) => setVisitTime(e.target.value)} className="h-11 bg-white" />
                  </div>
                  <Textarea value={visitNote} onChange={(e) => setVisitNote(e.target.value)} placeholder="Note (optional)" className="min-h-20 bg-white text-sm" />
                  <Button
                    type="button"
                    className="h-10 w-full rounded-xl bg-blue-700 text-white hover:bg-blue-800"
                    onClick={() => void submitScheduleVisit()}
                    disabled={isVisitSubmitting}
                  >
                    {isVisitSubmitting ? 'Submitting...' : 'Submit Visit Request'}
                  </Button>
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                className="mt-3 h-10 w-full rounded-xl border-slate-300 text-rose-700 hover:bg-rose-50 hover:text-rose-700"
                onClick={() => setFraudOpen((prev) => !prev)}
              >
                <Flag className="mr-2 h-4 w-4" />
                {fraudOpen ? 'Close Report Form' : 'Report Listing'}
              </Button>
              {fraudOpen && (
                <div className="mt-3 space-y-3 rounded-2xl border border-red-200 bg-red-50 p-3">
                  <Input value={fraudReporterName} onChange={(e) => setFraudReporterName(e.target.value)} placeholder="Your Name" className="h-11 bg-white" />
                  <PhoneVerificationField
                    phone={fraudPhone}
                    onPhoneChange={setFraudPhone}
                    verifiedToken={fraudPhoneVerificationId}
                    onVerifiedTokenChange={setFraudPhoneVerificationId}
                    purpose="fraud_report"
                    title="Phone Verification (Report Fraud)"
                  />
                  <Textarea value={fraudReason} onChange={(e) => setFraudReason(e.target.value)} placeholder="Describe the issue (min 10 characters)" className="min-h-24 bg-white text-sm" />
                  <Button
                    type="button"
                    className="h-10 w-full rounded-xl bg-red-600 text-white hover:bg-red-700"
                    onClick={() => void submitFraudReport()}
                    disabled={isFraudSubmitting}
                  >
                    {isFraudSubmitting ? 'Submitting...' : 'Submit Report'}
                  </Button>
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">Post Property FREE</h3>
              <p className="mt-2 text-sm text-slate-600">
                Reach premium buyers and tenants with verified listing support.
              </p>
              <Button
                onClick={onOpenPostProperty}
                className="mt-4 h-10 w-full rounded-xl bg-blue-700 text-white hover:bg-blue-800"
              >
                Start Posting
              </Button>
            </div>
          </aside>
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
              <PropertyListingCard
                key={item.id}
                property={item}
                onOpenDetails={onOpenSimilar}
                onOpenMessages={onOpenMessages}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
