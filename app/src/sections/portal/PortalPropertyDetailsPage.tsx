import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  Compass,
  Flag,
  GitCompareArrows,
  MapPin,
  MessageCircle,
  PhoneCall,
  Share2,
  ShieldAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { buildHrefForView } from '@/lib/appRoutes';
import {
  findPropertyByReference,
  getPortalPropertyContact,
  portalProperties,
  portalTrendLocalities,
  type PortalCategory,
} from '@/lib/portalData';
import {
  COMPARE_CHANGED_EVENT,
  isCompared,
  removeComparedListing,
  upsertComparedListing,
} from '@/lib/compareStore';
import { apiRequest } from '@/lib/http';
import { addNotification } from '@/lib/notificationsStore';
import {
  createRecentlyViewedPortalListingFromProperty,
  upsertRecentlyViewedPortalListing,
} from '@/lib/portalBrowsingStore';
import { toast } from 'sonner';
import { PhoneVerificationField } from '../workflow/CommonBlocks';
import PropertyListingCard from './PropertyListingCard';
import { applySeo } from '@/lib/seo';
import { openPhoneDialer } from '@/lib/phone';
import { trackPropertyInteraction } from '@/lib/propertyAnalyticsApi';
import { createListingAssistRequest } from '@/lib/listingAssistApi';
import { readStoredUser } from '@/lib/session';
import { shareLink } from '@/lib/share';

interface PortalPropertyDetailsPageProps {
  referenceId?: string;
  onOpenSimilar: (referenceId?: string) => void;
  onOpenMessages: (
    referenceId?: string,
    draftMessage?: string,
    conversationId?: number | null
  ) => void;
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

function resolveWorkflowCategory(requestType: string): PortalCategory {
  const normalized = requestType.trim().toLowerCase();
  if (normalized.includes('rent')) return 'rent';
  if (normalized.includes('project') || normalized.includes('launch')) return 'projects';
  if (normalized.includes('commercial')) return 'commercial';
  if (normalized.includes('plot') || normalized.includes('land')) return 'plots-land';
  return 'buy';
}

function formatPortalCategoryLabel(value: string): string {
  if (!value) return 'Property';
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeMarketText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function parsePriceLabelToValue(value: string): number {
  const normalized = value.replace(/,/g, '').toLowerCase();
  const match = /(\d+(?:\.\d+)?)/.exec(normalized);
  if (!match) {
    return 0;
  }

  const base = Number(match[1]);
  if (!Number.isFinite(base)) {
    return 0;
  }

  if (/\bcr|crore\b/.test(normalized)) {
    return Math.round(base * 10000000);
  }
  if (/\blakh|lac\b/.test(normalized)) {
    return Math.round(base * 100000);
  }
  return Math.round(base);
}

function parseAreaLabelToSqft(value: string): number {
  const normalized = value.replace(/,/g, '').toLowerCase();
  const match = /(\d+(?:\.\d+)?)/.exec(normalized);
  if (!match) {
    return 0;
  }
  const base = Number(match[1]);
  return Number.isFinite(base) ? Math.round(base) : 0;
}

function formatInr(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return 'Available on request';
  }
  return `INR ${Math.round(value).toLocaleString('en-IN')}`;
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

  useEffect(() => {
    if (portalProperty) {
      upsertRecentlyViewedPortalListing(createRecentlyViewedPortalListingFromProperty(portalProperty));
      return;
    }

    if (!workflowListing) return;
    upsertRecentlyViewedPortalListing({
      referenceId: workflowListing.referenceId,
      title: workflowListing.title,
      city: workflowListing.city,
      location: workflowListing.area,
      priceLabel: workflowListing.priceLabel,
      image: workflowListing.image,
      projectName: workflowListing.propertyType,
      category: resolveWorkflowCategory(workflowListing.requestType),
      status: workflowListing.propertyType || 'Available',
      verified: workflowListing.verified,
      description: `${workflowListing.propertyType} in ${workflowListing.area || workflowListing.city}`.trim(),
      viewedAt: new Date().toISOString(),
    });
  }, [portalProperty, workflowListing]);

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
  const [shareStatus, setShareStatus] = useState('');
  const [contactUnlocked, setContactUnlocked] = useState(false);
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const [assistSubmittingMode, setAssistSubmittingMode] = useState<
    null | 'brochure' | 'loan' | 'price-sheet'
  >(null);

  const displayReference = portalProperty?.referenceId || workflowListing?.referenceId || refKey;
  const displayTitle = portalProperty?.title || workflowListing?.title || 'Property';
  const displayCity = portalProperty?.city || workflowListing?.city || '';
  const displayLocation = portalProperty?.location || workflowListing?.area || '';
  const displayAreaLabel = portalProperty?.areaLabel || workflowListing?.areaLabel || 'Area on request';
  const displayStatus = portalProperty?.status || workflowListing?.propertyType || 'Available';
  const displayCategoryLabel = portalProperty
    ? formatPortalCategoryLabel(portalProperty.category)
    : formatPortalCategoryLabel(resolveWorkflowCategory(workflowListing?.requestType || 'buy'));
  const displayContactRole = useMemo(() => {
    if (portalProperty) {
      return getPortalPropertyContact(portalProperty).role;
    }

    const workflowCategory = resolveWorkflowCategory(workflowListing?.requestType || 'buy');
    if (workflowCategory === 'commercial') return 'Dealer';
    if (workflowCategory === 'projects') return 'Builder';
    return 'Owner';
  }, [portalProperty, workflowListing?.requestType]);
  const displayPublicPhone = useMemo(() => {
    const workflowPhone = workflowListing?.ownerPhone || '';
    const fallbackPhone = portalProperty
      ? getPortalPropertyContact(portalProperty).phone
      : displayContactRole === 'Dealer'
        ? '+91 90000 20002'
        : displayContactRole === 'Builder'
          ? '+91 90000 30003'
          : '+91 90000 10001';
    return workflowPhone && !/hidden|na|not\s*available/i.test(workflowPhone)
      ? workflowPhone
      : fallbackPhone;
  }, [displayContactRole, portalProperty, workflowListing]);
  const displayPriceValue = useMemo(() => {
    if (portalProperty?.priceValue && portalProperty.priceValue > 0) {
      return Number(portalProperty.priceValue);
    }
    return parsePriceLabelToValue(portalProperty?.priceLabel || workflowListing?.priceLabel || '');
  }, [portalProperty?.priceLabel, portalProperty?.priceValue, workflowListing?.priceLabel]);
  const displayAreaSqft = useMemo(() => {
    if (portalProperty?.areaSqft && portalProperty.areaSqft > 0) {
      return Number(portalProperty.areaSqft);
    }
    return parseAreaLabelToSqft(displayAreaLabel);
  }, [displayAreaLabel, portalProperty?.areaSqft]);
  const pricePerSqft = useMemo(() => {
    if (!displayPriceValue || !displayAreaSqft) {
      return 0;
    }
    return Math.round(displayPriceValue / displayAreaSqft);
  }, [displayAreaSqft, displayPriceValue]);
  const estimatedMonthlyEmi = useMemo(() => {
    if (!displayPriceValue || displayPriceValue <= 0) {
      return 0;
    }
    return Math.round(displayPriceValue * 0.0084);
  }, [displayPriceValue]);
  const marketSnapshot = useMemo(() => {
    const locationTokens = [displayLocation, displayCity]
      .map((item) => normalizeMarketText(item))
      .filter(Boolean);

    return (
      portalTrendLocalities.find((item) => {
        const locality = normalizeMarketText(item.locality);
        const city = normalizeMarketText(item.city);
        return locationTokens.some(
          (token) => token.includes(locality) || locality.includes(token) || token.includes(city)
        );
      }) || null
    );
  }, [displayCity, displayLocation]);
  const buyerDecisionCards = useMemo(
    () => [
      {
        label: 'Estimated EMI',
        value:
          estimatedMonthlyEmi > 0
            ? `${formatInr(estimatedMonthlyEmi)} / month`
            : 'Available on request',
        note: 'Indicative financing estimate for faster buyer qualification.',
      },
      {
        label: 'Price / sq.ft',
        value: pricePerSqft > 0 ? `${formatInr(pricePerSqft)} / sq.ft` : 'Available on request',
        note: 'Use this to compare micro-market pricing before a site visit.',
      },
      {
        label: 'Listing Status',
        value: displayStatus,
        note:
          portalProperty?.readyToMove === true
            ? 'Ready inventory usually converts faster into verified visits.'
            : 'Review timeline, payment schedule, and document flow carefully.',
      },
      {
        label: 'Lead Route',
        value: contactUnlocked ? 'Verified contact unlocked' : 'Chat + phone unlock',
        note: 'Brochure, price sheet, loan help, and site visit actions stay tied to one funnel.',
      },
    ],
    [contactUnlocked, displayStatus, estimatedMonthlyEmi, portalProperty?.readyToMove, pricePerSqft]
  );
  const [isComparedListing, setIsComparedListing] = useState(() =>
    displayReference ? isCompared(displayReference) : false
  );

  const comparePayload = useMemo(() => {
    if (portalProperty) {
      return {
        id: String(portalProperty.id),
        referenceId: portalProperty.referenceId,
        title: portalProperty.title,
        image: portalProperty.image,
        city: portalProperty.city,
        area: portalProperty.location,
        priceLabel: portalProperty.priceLabel,
        areaLabel: portalProperty.areaLabel,
        propertyType: portalProperty.category,
        bhk: portalProperty.bhk,
        mainDoorFacing: portalProperty.facing,
        vastuScore: portalProperty.readyToMove ? 84 : 79,
        verified: portalProperty.verified,
        ownerPhone: 'Hidden',
        updatedAt: portalProperty.constructionLastUpdatedAt || '',
      };
    }

    if (workflowListing) {
      return {
        id: workflowListing.id,
        referenceId: workflowListing.referenceId,
        title: workflowListing.title,
        image: workflowListing.image,
        city: workflowListing.city,
        area: workflowListing.area,
        priceLabel: workflowListing.priceLabel,
        areaLabel: workflowListing.areaLabel,
        propertyType: workflowListing.propertyType,
        bhk: workflowListing.bhk,
        mainDoorFacing: workflowListing.mainDoorFacing,
        vastuScore: workflowListing.vastuScore,
        verified: workflowListing.verified,
        ownerPhone: workflowListing.ownerPhone,
        updatedAt: workflowListing.updatedAt,
      };
    }

    return null;
  }, [portalProperty, workflowListing]);

  useEffect(() => {
    setVisitOpen(false);
    setFraudOpen(false);
    setVisitPhoneVerificationId('');
    setFraudPhoneVerificationId('');
    setVisitDate('');
    setVisitTime('');
    setVisitNote('');
    setFraudReason('');
    setContactUnlocked(false);
    setLoginPromptOpen(false);
  }, [displayReference]);

  useEffect(() => {
    const canonicalPath = displayReference
      ? `/property-details/${encodeURIComponent(displayReference)}`
      : '/property-details';
    const locationLabel = portalProperty
      ? `${portalProperty.location}, ${portalProperty.city}`
      : workflowListing
        ? `${workflowListing.area}, ${workflowListing.city}`
        : 'India';
    const priceLabel = portalProperty?.priceLabel || workflowListing?.priceLabel || 'Price on request';

    applySeo({
      title: `${displayTitle} | ZDT Realty`,
      description: `${displayTitle} in ${locationLabel}. ${priceLabel}.`,
      canonicalPath,
      type: 'product',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'Residence',
        name: displayTitle,
        description: `${displayTitle} in ${locationLabel}.`,
        url: canonicalPath,
      },
    });
  }, [displayReference, displayTitle, portalProperty, workflowListing]);

  useEffect(() => {
    const sync = () => {
      setIsComparedListing(displayReference ? isCompared(displayReference) : false);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== 'zdt_compared_listings') {
        return;
      }
      sync();
    };

    sync();
    window.addEventListener('storage', handleStorage);
    window.addEventListener(COMPARE_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(COMPARE_CHANGED_EVENT, sync);
    };
  }, [displayReference]);

  const toggleCompare = () => {
    if (!displayReference || !comparePayload) {
      toast.error('Unable to add this property to compare.');
      return;
    }

    if (isComparedListing) {
      removeComparedListing(displayReference);
      setIsComparedListing(false);
      toast.success('Removed from compare');
      return;
    }

    upsertComparedListing(comparePayload);
    setIsComparedListing(true);
    toast.success('Added to compare');
  };

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

  const handleLeadAssist = async (mode: 'brochure' | 'loan' | 'price-sheet') => {
    if (!displayReference) {
      toast.error('Missing property reference.');
      return;
    }

    const currentUser = readStoredUser();
    if (!currentUser) {
      setLoginPromptOpen(true);
      return;
    }

    const assistType =
      mode === 'brochure'
        ? 'brochure'
        : mode === 'price-sheet'
          ? 'price_sheet'
          : 'loan_help';

    setAssistSubmittingMode(mode);
    try {
      const response = await createListingAssistRequest(displayReference, {
        assistType,
        context: 'portal_property_details',
      });

      onOpenMessages(
        displayReference,
        '',
        response.conversation?.id && response.conversation.id > 0 ? response.conversation.id : null
      );

      if (mode === 'brochure') {
        toast.success('Brochure request sent. Opening the seller conversation.');
      } else if (mode === 'price-sheet') {
        toast.success('Price sheet request sent. Opening the seller conversation.');
      } else {
        toast.success('Loan help request sent. Opening support conversation.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to start this assist workflow.');
    } finally {
      setAssistSubmittingMode(null);
    }
  };

  const handleCallContact = () => {
    if (!displayReference) {
      toast.error('Missing property reference.');
      return;
    }

    if (!contactUnlocked) {
      const currentUser = readStoredUser();
      if (!currentUser) {
        setLoginPromptOpen(true);
        return;
      }

      if (!displayPublicPhone) {
        onOpenMessages(displayReference);
        toast.info('Phone number unavailable. Opened in-app chat.');
        return;
      }

      setContactUnlocked(true);
      void trackPropertyInteraction({
        referenceId: displayReference,
        action: 'unlock_phone',
        context: 'portal_property_details',
      });
      toast.success('Seller number unlocked');
      return;
    }

    void trackPropertyInteraction({
      referenceId: displayReference,
      action: 'call_click',
      context: 'portal_property_details',
    });
    const opened = openPhoneDialer(displayPublicPhone);

    if (!opened) {
      onOpenMessages(displayReference);
      toast.info('Phone number unavailable. Opened in-app chat.');
    }
  };

  const handleShareListing = async () => {
    const url = `${window.location.origin}/property-details/${encodeURIComponent(
      displayReference || displayTitle
    )}`;
    const result = await shareLink({
      title: displayTitle,
      text: `Check this listing on ZDT Realty: ${displayTitle}`,
      url,
    });

    if (result === 'copied') {
      setShareStatus('Link copied');
      toast.success('Listing link copied.');
      return;
    }
    if (result === 'native') {
      setShareStatus('Shared');
      return;
    }
    setShareStatus('Share failed');
    toast.error('Unable to share this listing right now.');
  };

  const loginPromptDialog = (
    <Dialog open={loginPromptOpen} onOpenChange={setLoginPromptOpen}>
      <DialogContent className="max-w-md border border-slate-200 bg-white">
        <DialogHeader>
          <DialogTitle className="text-slate-900">Login to unlock the contact</DialogTitle>
          <DialogDescription className="text-sm text-slate-600">
            Sign in to reveal the {displayContactRole.toLowerCase()} phone number and keep this
            enquiry tracked as a verified lead.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-3 text-sm text-blue-900">
          <p className="font-semibold">{displayTitle}</p>
          <p className="mt-1 text-xs text-blue-900/80">
            {displayCity || 'India'} • {displayReference || 'Reference pending'}
          </p>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="rounded-xl border-slate-300"
            onClick={() => {
              setLoginPromptOpen(false);
              if (displayReference) {
                onOpenMessages(displayReference);
              }
            }}
          >
            Continue In Chat
          </Button>
          <Button
            type="button"
            className="rounded-xl bg-blue-700 text-white hover:bg-blue-800"
            onClick={() => {
              window.location.assign(buildHrefForView('login'));
            }}
          >
            Login To Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (!portalProperty) {
    return (
      <section className="portal-mobile-page pb-16 pt-28 text-slate-900">
        <div className="page-container portal-mobile-stack space-y-6">
          <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
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
                <div className="portal-mobile-panel overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                  <img
                    src={workflowListing.image}
                    alt={workflowListing.title}
                    className="h-[360px] w-full object-cover sm:h-[440px]"
                  />
                </div>

                <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-wrap items-center gap-3">
                    {workflowListing.verified && (
                      <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                        <BadgeCheck className="mr-1 h-3.5 w-3.5" />
                        Verified listing
                      </Badge>
                    )}
                    {workflowListing.requestType ? (
                      <span className="portal-mobile-chip rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
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
                    <div className="portal-mobile-card rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Area</p>
                      <p className="mt-1 font-semibold text-slate-900">{workflowListing.areaLabel}</p>
                    </div>
                    <div className="portal-mobile-card rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Type</p>
                      <p className="mt-1 font-semibold text-slate-900">{workflowListing.propertyType}</p>
                    </div>
                    <div className="portal-mobile-card rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">BHK</p>
                      <p className="mt-1 font-semibold text-slate-900">{workflowListing.bhk}</p>
                    </div>
                    <div className="portal-mobile-card rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Facing</p>
                      <p className="mt-1 font-semibold text-slate-900">{workflowListing.mainDoorFacing}</p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="portal-mobile-card rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Vastu Score</p>
                      <p className="mt-1 font-semibold text-slate-900">{workflowListing.vastuScore}%</p>
                    </div>
                    <div className="portal-mobile-card rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Last Updated</p>
                      <p className="mt-1 font-semibold text-slate-900">{formatUpdatedAt(workflowListing.updatedAt)}</p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 lg:grid-cols-3">
                    <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700">
                        Buyer Fit
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {workflowListing.requestType || 'Verified listing'}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        Best for buyers who want visible trust signals and a direct route into site-visit follow-up.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                        Lead Protection
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        Controlled contact access
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        Keep enquiry quality high by unlocking contact after login and using chat as the safer fallback.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                        Response Window
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        Call, chat, or schedule
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        Use the visit form for serious intent and chat for brochure, price, or loan assistance.
                      </p>
                    </div>
                  </div>

                  <div className="portal-mobile-panel mt-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
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

                  <div className="grid gap-6 lg:grid-cols-2">
                    <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                      <h3 className="text-lg font-semibold text-slate-900">Buyer Decision Kit</h3>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {buyerDecisionCards.map((item) => (
                          <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs uppercase tracking-wide text-slate-500">{item.label}</p>
                            <p className="mt-2 text-lg font-semibold text-slate-900">{item.value}</p>
                            <p className="mt-2 text-xs leading-5 text-slate-500">{item.note}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                      <h3 className="text-lg font-semibold text-slate-900">Micro-market Snapshot</h3>
                      {marketSnapshot ? (
                        <div className="mt-4 space-y-3">
                          <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                            <p className="text-xs uppercase tracking-[0.18em] text-blue-700">
                              {marketSnapshot.demandLabel}
                            </p>
                            <p className="mt-2 text-lg font-semibold text-slate-900">
                              {marketSnapshot.locality}, {marketSnapshot.city}
                            </p>
                            <p className="mt-2 text-sm text-slate-700">{marketSnapshot.momentum}</p>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <p className="text-xs uppercase tracking-wide text-slate-500">Average Ticket</p>
                              <p className="mt-2 text-base font-semibold text-slate-900">
                                {marketSnapshot.averageTicket}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <p className="text-xs uppercase tracking-wide text-slate-500">Trust Note</p>
                              <p className="mt-2 text-sm font-medium text-slate-900">
                                {marketSnapshot.trustNote}
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                          <p className="font-semibold text-slate-900">
                            {displayLocation || displayCity || 'This micro-market'}
                          </p>
                          <p className="mt-2">
                            Compare price per sq.ft, verified status, and visit readiness to validate
                            this {displayCategoryLabel.toLowerCase()} opportunity before the next step.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
                <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Price</p>
                  <p className="mt-2 text-3xl font-bold text-blue-900">{workflowListing.priceLabel}</p>
                  <p className="mt-2 text-sm text-slate-600">{workflowListing.referenceId}</p>

                  <Button
                    className="mt-4 h-11 w-full rounded-xl bg-blue-700 text-white hover:bg-blue-800"
                    onClick={() => onOpenMessages(workflowListing.referenceId)}
                  >
                    <MessageCircle className="h-4 w-4" />
                    Message Seller
                  </Button>
                  <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    Contact {displayContactRole}:{' '}
                    <span className="font-semibold text-slate-900">
                      {contactUnlocked ? displayPublicPhone || 'Unavailable' : 'Hidden until login'}
                    </span>
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3 h-11 w-full rounded-xl border-slate-300"
                    onClick={handleCallContact}
                  >
                    <PhoneCall className="mr-2 h-4 w-4" />
                    {contactUnlocked ? 'Call Seller' : 'Show Number'}
                  </Button>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 rounded-xl border-slate-300"
                      disabled={assistSubmittingMode !== null}
                      onClick={() => handleLeadAssist('brochure')}
                    >
                      {assistSubmittingMode === 'brochure' ? 'Opening...' : 'Request Brochure'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 rounded-xl border-slate-300"
                      disabled={assistSubmittingMode !== null}
                      onClick={() => handleLeadAssist('loan')}
                    >
                      {assistSubmittingMode === 'loan' ? 'Opening...' : 'Loan Help'}
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3 h-11 w-full rounded-xl border-slate-300"
                    onClick={() => void handleShareListing()}
                  >
                    <Share2 className="mr-2 h-4 w-4" />
                    {shareStatus || 'Share Listing'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className={`mt-3 h-10 w-full rounded-xl border-slate-300 ${
                      isComparedListing
                        ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100'
                        : ''
                    }`}
                    onClick={toggleCompare}
                  >
                    <GitCompareArrows className="mr-2 h-4 w-4" />
                    {isComparedListing ? 'Added to Compare' : 'Add to Compare'}
                  </Button>
                  <p className="mt-2 text-xs text-slate-500">
                    Privacy note: phone unlocks and calls are tracked as verified lead actions.
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

                <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-900">Seller Growth Upgrade</h3>
                  <p className="mt-2 text-sm text-slate-600">
                    Promote listings, unlock verified lead tracking, and package premium visibility
                    for faster response.
                  </p>
                  <Button
                    onClick={onOpenPostProperty}
                    className="mt-4 h-10 w-full rounded-xl bg-blue-700 text-white hover:bg-blue-800"
                  >
                    List And Upgrade
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
          {loginPromptDialog}
        </div>
      </section>
    );
  }

  const property = portalProperty;

  return (
    <section className="portal-mobile-page pb-16 pt-28 text-slate-900">
      <div className="page-container portal-mobile-stack space-y-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <div className="portal-mobile-panel overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
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

            <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                {property.verified && (
                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                    <BadgeCheck className="mr-1 h-3.5 w-3.5" />
                    Verified listing
                  </Badge>
                )}
                <span className="portal-mobile-chip rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {property.status}
                </span>
              </div>

              <h1 className="mt-4 text-3xl font-bold text-slate-900">{property.title}</h1>
              <p className="mt-2 inline-flex items-center gap-2 text-sm text-slate-600">
                <MapPin className="h-4 w-4 text-slate-400" />
                {property.location}, {property.city}
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="portal-mobile-card rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Area</p>
                  <p className="mt-1 font-semibold text-slate-900">{property.areaLabel}</p>
                </div>
                <div className="portal-mobile-card rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Configuration</p>
                  <p className="mt-1 font-semibold text-slate-900">{property.bhk}</p>
                </div>
                <div className="portal-mobile-card rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Facing</p>
                  <p className="mt-1 font-semibold text-slate-900">{property.facing}</p>
                </div>
                <div className="portal-mobile-card rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Floor</p>
                  <p className="mt-1 font-semibold text-slate-900">{property.floor}</p>
                </div>
              </div>

              <p className="mt-5 text-sm leading-relaxed text-slate-700">{property.description}</p>

              <div className="mt-5 grid gap-3 lg:grid-cols-3">
                <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700">
                    Buyer Fit
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {property.readyToMove ? 'Ready-to-move preference' : property.status}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    Strong for buyers who want verified stock, direct contact control, and easier shortlisting.
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                    Lead Protection
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    Verified enquiry flow
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    Unlock contact as a logged-in user and keep visits, comparison, and chat tied to a cleaner funnel.
                  </p>
                </div>
                <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                    Demand Signal
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {property.featured ? 'Featured inventory' : 'Market-ready listing'}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    Compare this listing, ask for brochure support, and use visit requests to move toward a final decision.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Amenities</h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  {property.amenities.map((amenity) => (
                    <span
                      key={amenity}
                      className="portal-mobile-chip rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700"
                    >
                      {amenity}
                    </span>
                  ))}
                </div>
              </div>

              <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
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

            <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
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

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Buyer Advantage</h2>
                <ul className="mt-4 space-y-3 text-sm text-slate-700">
                  <li className="inline-flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                    Verified listing backed by trust and moderation checks.
                  </li>
                  <li className="inline-flex items-start gap-2">
                    <CalendarDays className="mt-0.5 h-4 w-4 text-blue-700" />
                    Schedule visits directly from this page with verified phone flow.
                  </li>
                  <li className="inline-flex items-start gap-2">
                    <MessageCircle className="mt-0.5 h-4 w-4 text-blue-700" />
                    Request brochure, price sheet, and seller clarifications in chat.
                  </li>
                </ul>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-900">Investment Snapshot</h2>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {buyerDecisionCards.map((item) => (
                      <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs uppercase tracking-wide text-slate-500">{item.label}</p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">{item.value}</p>
                        <p className="mt-2 text-xs leading-5 text-slate-500">{item.note}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-900">Micro-market Snapshot</h2>
                  {marketSnapshot ? (
                    <div className="mt-4 space-y-3">
                      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-blue-700">
                          {marketSnapshot.demandLabel}
                        </p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">
                          {marketSnapshot.locality}, {marketSnapshot.city}
                        </p>
                        <p className="mt-2 text-sm text-slate-700">{marketSnapshot.momentum}</p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-xs uppercase tracking-wide text-slate-500">Average Ticket</p>
                          <p className="mt-2 text-base font-semibold text-slate-900">
                            {marketSnapshot.averageTicket}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-xs uppercase tracking-wide text-slate-500">Trust Note</p>
                          <p className="mt-2 text-sm font-medium text-slate-900">
                            {marketSnapshot.trustNote}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                      <p className="font-semibold text-slate-900">
                        {displayLocation || displayCity || 'This micro-market'}
                      </p>
                      <p className="mt-2">
                        Compare price per sq.ft, verified status, and visit readiness to validate
                        this {displayCategoryLabel.toLowerCase()} opportunity before you negotiate.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Price</p>
              <p className="mt-2 text-3xl font-bold text-blue-900">{property.priceLabel}</p>
              <p className="mt-2 text-sm text-slate-600">{property.referenceId}</p>

              <Button
                className="mt-4 h-11 w-full rounded-xl bg-blue-700 text-white hover:bg-blue-800"
                onClick={() => onOpenMessages(property.referenceId)}
              >
                <MessageCircle className="h-4 w-4" />
                Message Seller
              </Button>
              <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Contact {displayContactRole}:{' '}
                <span className="font-semibold text-slate-900">
                  {contactUnlocked ? displayPublicPhone || 'Unavailable' : 'Hidden until login'}
                </span>
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-3 h-11 w-full rounded-xl border-slate-300"
                onClick={handleCallContact}
              >
                <PhoneCall className="mr-2 h-4 w-4" />
                {contactUnlocked ? 'Call Seller' : 'Show Number'}
              </Button>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-xl border-slate-300"
                  disabled={assistSubmittingMode !== null}
                  onClick={() => handleLeadAssist('brochure')}
                >
                  {assistSubmittingMode === 'brochure' ? 'Opening...' : 'Request Brochure'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-xl border-slate-300"
                  disabled={assistSubmittingMode !== null}
                  onClick={() => handleLeadAssist('price-sheet')}
                >
                  {assistSubmittingMode === 'price-sheet' ? 'Opening...' : 'Price Sheet'}
                </Button>
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-3 h-10 w-full rounded-xl border-slate-300"
                disabled={assistSubmittingMode !== null}
                onClick={() => handleLeadAssist('loan')}
              >
                {assistSubmittingMode === 'loan' ? 'Opening...' : 'Loan & EMI Support'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="mt-3 h-11 w-full rounded-xl border-slate-300"
                onClick={() => void handleShareListing()}
              >
                <Share2 className="mr-2 h-4 w-4" />
                {shareStatus || 'Share Listing'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className={`mt-3 h-10 w-full rounded-xl border-slate-300 ${
                  isComparedListing
                    ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100'
                    : ''
                }`}
                onClick={toggleCompare}
              >
                <GitCompareArrows className="mr-2 h-4 w-4" />
                {isComparedListing ? 'Added to Compare' : 'Add to Compare'}
              </Button>
              <p className="mt-2 text-xs text-slate-500">
                Privacy note: phone unlocks and calls are tracked as verified lead actions.
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

            <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">Seller Growth Upgrade</h3>
              <p className="mt-2 text-sm text-slate-600">
                Promote listings, unlock verified lead tracking, and package premium visibility
                for faster response.
              </p>
              <Button
                onClick={onOpenPostProperty}
                className="mt-4 h-10 w-full rounded-xl bg-blue-700 text-white hover:bg-blue-800"
              >
                List And Upgrade
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
        {loginPromptDialog}
      </div>
    </section>
  );
}
