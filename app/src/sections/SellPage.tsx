import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock3,
  LayoutDashboard,
  Loader2,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/http';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { LgdLocationAccuracyNote, LgdLocationInput } from '@/components/realty/LgdLocationInput';
import { PhoneVerificationField } from './workflow/CommonBlocks';

type SellerRole = 'builder' | 'owner' | 'agent';
type ListingStep = 1 | 2 | 3 | 4 | 5 | 6;
type PropertyType = 'Apartment' | 'Villa' | 'Plot' | 'Commercial';
type SaleMode = 'New' | 'Resale';
type PossessionStatus = 'Ready to Move' | 'Under Construction';
type ContactPreference = 'Call' | 'Message' | 'Call + Message';
type ListingVisibility = 'normal' | 'verified_highlight';
type VisibilityLabel = 'Normal' | 'Verified Highlight';
type FurnishingStatus = 'Unfurnished' | 'Semi-Furnished' | 'Fully Furnished';
type FacingDirection = 'North' | 'East' | 'South' | 'West';
type ApprovalStatus = 'Approved' | 'In Progress' | 'Not Available';

interface SellPageProps {
  onManageListings?: () => void;
  onOpenDashboard?: () => void;
  onOpenLeads?: () => void;
  onOpenAnalytics?: () => void;
  onOpenBuilderPlans?: () => void;
  onOpenBuilderPortal?: () => void;
}

interface SellFormState {
  sellerRole: SellerRole;
  propertyType: PropertyType;
  saleMode: SaleMode;
  state: string;
  district: string;
  city: string;
  locality: string;
  propertyName: string;
  builderProjectName: string;
  unitAvailabilityTotal: string;
  unitAvailabilityOpen: string;
  price: string;
  areaSqft: string;
  bhkOrConfig: string;
  floors: string;
  facing: FacingDirection;
  furnishing: FurnishingStatus;
  possessionStatus: PossessionStatus;
  possessionDate: string;
  constructionUpdate: string;
  images: File[];
  floorPlans: File[];
  video: File | null;
  ownershipDocument: File | null;
  builderDocuments: File[];
  builderLegalName: string;
  reraNumber: string;
  approvalStatus: ApprovalStatus;
  allowGroupDeal: boolean;
  groupDealMinBuyers: string;
  groupDealDiscountRange: string;
  groupDealTerms: string;
  projectLevelGroupDeal: boolean;
  contactName: string;
  contactPhone: string;
  phoneVerificationId: string;
  contactEmail: string;
  contactPreference: ContactPreference;
  hidePhoneUntilVerifiedInterest: boolean;
  listingVisibility: ListingVisibility;
  requireBuyerIntentConfirmation: boolean;
  antiSpamProtection: boolean;
  blockSuspiciousUsers: boolean;
}

const STEP_LABELS: Array<{ step: ListingStep; label: string }> = [
  { step: 1, label: 'Basic Details' },
  { step: 2, label: 'Specifications' },
  { step: 3, label: 'Media Upload' },
  { step: 4, label: 'Legal & Verification' },
  { step: 5, label: 'Group Deal Option' },
  { step: 6, label: 'Contact & Visibility' },
];

const SELLER_OPTIONS: Array<{
  role: SellerRole;
  title: string;
  description: string;
  docs: string;
  verificationLevel: string;
}> = [
  {
    role: 'builder',
    title: 'Builder / Developer',
    description: 'Project-level and unit-level listings with construction updates.',
    docs: 'Company profile, project details, ownership and approval records, RERA (if available).',
    verificationLevel: 'Builder verification + ownership check',
  },
  {
    role: 'owner',
    title: 'Individual Owner',
    description: 'Single-property selling with safe enquiry and contact controls.',
    docs: 'Ownership proof, identity proof, property details and media.',
    verificationLevel: 'Ownership check required',
  },
  {
    role: 'agent',
    title: 'Authorized Agent',
    description: 'Controlled listing mode for approved agents representing owners/builders.',
    docs: 'Authorization letter + owner/builder consent + supporting documents.',
    verificationLevel: 'Authorization + ownership verification',
  },
];

const initialForm: SellFormState = {
  sellerRole: 'builder',
  propertyType: 'Apartment',
  saleMode: 'New',
  state: '',
  district: '',
  city: '',
  locality: '',
  propertyName: '',
  builderProjectName: '',
  unitAvailabilityTotal: '',
  unitAvailabilityOpen: '',
  price: '',
  areaSqft: '',
  bhkOrConfig: '',
  floors: '',
  facing: 'North',
  furnishing: 'Unfurnished',
  possessionStatus: 'Ready to Move',
  possessionDate: '',
  constructionUpdate: '',
  images: [],
  floorPlans: [],
  video: null,
  ownershipDocument: null,
  builderDocuments: [],
  builderLegalName: '',
  reraNumber: '',
  approvalStatus: 'In Progress',
  allowGroupDeal: false,
  groupDealMinBuyers: '5',
  groupDealDiscountRange: '2% - 5%',
  groupDealTerms: '',
  projectLevelGroupDeal: true,
  contactName: '',
  contactPhone: '',
  phoneVerificationId: '',
  contactEmail: '',
  contactPreference: 'Call + Message',
  hidePhoneUntilVerifiedInterest: true,
  listingVisibility: 'normal',
  requireBuyerIntentConfirmation: true,
  antiSpamProtection: true,
  blockSuspiciousUsers: true,
};

const numericOnly = (value: string) => value.replace(/\D/g, '');
const isPhoneValid = (value: string) => /^\d{10,15}$/.test(value);

function formatPrice(value: string): string {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return '-';
  return `INR ${Math.round(amount).toLocaleString('en-IN')}`;
}

function toBackendPropertyType(type: PropertyType): 'Plot' | 'Villa' | 'Flat / Apartment' | 'Commercial' {
  if (type === 'Plot') return 'Plot';
  if (type === 'Villa') return 'Villa';
  if (type === 'Apartment') return 'Flat / Apartment';
  return 'Commercial';
}

function toVisibilityLabel(value: ListingVisibility): VisibilityLabel {
  return value === 'verified_highlight' ? 'Verified Highlight' : 'Normal';
}

function renderFileCountLabel(label: string, count: number): string {
  return `${label}: ${count} file${count === 1 ? '' : 's'}`;
}

export default function SellPage({
  onManageListings,
  onOpenDashboard,
  onOpenLeads,
  onOpenAnalytics,
  onOpenBuilderPlans,
  onOpenBuilderPortal,
}: SellPageProps) {
  const [step, setStep] = useState<ListingStep>(1);
  const [form, setForm] = useState<SellFormState>(initialForm);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successReferenceId, setSuccessReferenceId] = useState('');
  const formRef = useRef<HTMLDivElement | null>(null);

  const totalSteps = STEP_LABELS.length;
  const progressPercent = useMemo(
    () => Math.round((step / totalSteps) * 100),
    [step, totalSteps]
  );
  const ownershipCheckStatus = form.ownershipDocument ? 'Verified' : 'In Progress';
  const builderVerifiedStatus =
    form.sellerRole === 'builder' && (form.builderDocuments.length > 0 || form.builderLegalName.trim())
      ? 'Yes'
      : 'Pending';

  const reviewRows = useMemo(
    () => [
      { label: 'Seller Type', value: SELLER_OPTIONS.find((item) => item.role === form.sellerRole)?.title || '-' },
      { label: 'Property Type', value: form.propertyType },
      { label: 'Property Name', value: form.propertyName || '-' },
      {
        label: 'Location',
        value: [form.locality || '-', form.city || '-', form.district || '-', form.state || '-'].join(', '),
      },
      { label: 'Sale Type', value: form.saleMode },
      { label: 'Price', value: formatPrice(form.price) },
      { label: 'Area', value: form.areaSqft ? `${form.areaSqft} sq.ft` : '-' },
      { label: 'Configuration', value: form.bhkOrConfig || '-' },
      {
        label: 'Media',
        value: [
          renderFileCountLabel('Images', form.images.length),
          renderFileCountLabel('Floor Plans', form.floorPlans.length),
          form.video ? 'Video: 1 file' : 'Video: None',
        ].join(' | '),
      },
      {
        label: 'Verification',
        value: `Ownership Check: ${ownershipCheckStatus} | Builder Verified: ${builderVerifiedStatus}`,
      },
      {
        label: 'Group Deal',
        value: form.allowGroupDeal
          ? `Enabled | Min buyers: ${form.groupDealMinBuyers || '-'} | Discount: ${form.groupDealDiscountRange || '-'}`
          : 'Disabled',
      },
      {
        label: 'Visibility',
        value: `${toVisibilityLabel(form.listingVisibility)} | Contact: ${form.contactPreference}`,
      },
    ],
    [builderVerifiedStatus, form, ownershipCheckStatus]
  );

  const updateField = <K extends keyof SellFormState>(field: K, value: SellFormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateFiles = (field: 'images' | 'floorPlans' | 'builderDocuments', files: FileList | null) => {
    updateField(field, Array.from(files ?? []));
  };

  const updateSingleFile = (field: 'ownershipDocument' | 'video', files: FileList | null) => {
    updateField(field, files && files.length > 0 ? files[0] : null);
  };

  const validateStep = (targetStep: ListingStep): boolean => {
    if (targetStep === 1) {
      if (!form.propertyType) {
        setError('Select property type to continue.');
        return false;
      }
      if (!form.state.trim() || !form.district.trim() || !form.city.trim() || !form.locality.trim()) {
        setError('State, district, city, and locality are required.');
        return false;
      }
      if (!form.propertyName.trim() || form.propertyName.trim().length < 4) {
        setError('Add a clear project or property name.');
        return false;
      }
      if (form.sellerRole === 'builder' && !form.builderProjectName.trim()) {
        setError('Builder project name is required for builder listings.');
        return false;
      }
    }

    if (targetStep === 2) {
      const price = Number(form.price || 0);
      const area = Number(form.areaSqft || 0);
      if (!Number.isFinite(price) || price <= 0) {
        setError('Price is required.');
        return false;
      }
      if (!Number.isFinite(area) || area <= 0) {
        setError('Area in sq.ft is required.');
        return false;
      }
      if (!form.bhkOrConfig.trim()) {
        setError('BHK or configuration is required.');
        return false;
      }
      if (!form.floors.trim()) {
        setError('Floor details are required.');
        return false;
      }
      if (form.possessionStatus === 'Under Construction' && !form.possessionDate) {
        setError('Add expected possession date for under-construction listings.');
        return false;
      }
    }

    if (targetStep === 3) {
      if (form.images.length === 0) {
        setError('Upload at least one property image.');
        return false;
      }
    }

    if (targetStep === 4) {
      if (!form.ownershipDocument) {
        setError('Ownership document upload is required.');
        return false;
      }
      if (form.sellerRole === 'builder') {
        if (!form.builderLegalName.trim()) {
          setError('Builder legal name is required for builder listings.');
          return false;
        }
        if (form.builderDocuments.length === 0) {
          setError('Upload at least one builder verification document.');
          return false;
        }
      }
    }

    if (targetStep === 5 && form.allowGroupDeal) {
      const minimumBuyers = Number(form.groupDealMinBuyers || 0);
      if (!Number.isFinite(minimumBuyers) || minimumBuyers < 2) {
        setError('Minimum buyers should be 2 or more when group deal is enabled.');
        return false;
      }
      if (!form.groupDealDiscountRange.trim()) {
        setError('Estimated discount range is required when group deal is enabled.');
        return false;
      }
      if (!form.groupDealTerms.trim()) {
        setError('Add visible group deal terms for buyers.');
        return false;
      }
    }

    if (targetStep === 6) {
      if (!form.contactName.trim()) {
        setError('Contact name is required.');
        return false;
      }
      if (!isPhoneValid(form.contactPhone)) {
        setError('Enter a valid contact phone number.');
        return false;
      }
      if (!form.phoneVerificationId) {
        setError('Phone verification is required before submitting listing.');
        return false;
      }
      if (form.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail)) {
        setError('Enter a valid email address or leave it empty.');
        return false;
      }
    }

    setError('');
    return true;
  };

  const nextStep = () => {
    if (!validateStep(step)) return;
    setStep((prev) => (prev < totalSteps ? ((prev + 1) as ListingStep) : prev));
  };

  const previousStep = () => {
    setError('');
    setStep((prev) => (prev > 1 ? ((prev - 1) as ListingStep) : prev));
  };

  const handleBuilderPortal = () => {
    if (onOpenBuilderPortal) {
      onOpenBuilderPortal();
      return;
    }
    if (onOpenBuilderPlans) {
      onOpenBuilderPlans();
      return;
    }
    window.location.assign('/company-portal');
  };

  const submitListing = async () => {
    for (let currentStep = 1; currentStep <= totalSteps; currentStep += 1) {
      if (!validateStep(currentStep as ListingStep)) {
        setStep(currentStep as ListingStep);
        return;
      }
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await apiRequest<{ referenceId: string }>('/workflow/public/sell', {
        method: 'POST',
        body: JSON.stringify({
          requesterName: form.contactName.trim(),
          phone: form.contactPhone.trim(),
          phoneVerificationId: form.phoneVerificationId,
          email: form.contactEmail.trim() || undefined,
          city: form.city.trim(),
          locality: form.locality.trim(),
          propertyType: toBackendPropertyType(form.propertyType),
          address: [form.propertyName, form.locality, form.city, form.district, form.state]
            .map((item) => String(item || '').trim())
            .filter(Boolean)
            .join(', '),
          mapPin: '',
          pricing: {
            expectedPrice: Number(form.price || 0),
            areaSqft: Number(form.areaSqft || 0),
            listingVisibility: toVisibilityLabel(form.listingVisibility),
            groupDealEnabled: form.allowGroupDeal,
          },
          details: {
            sellerRole: form.sellerRole,
            saleMode: form.saleMode,
            propertyType: form.propertyType,
            location: {
              state: form.state.trim(),
              district: form.district.trim(),
              city: form.city.trim(),
              locality: form.locality.trim(),
            },
            specifications: {
              price: Number(form.price || 0),
              areaSqft: Number(form.areaSqft || 0),
              bhkOrConfig: form.bhkOrConfig.trim(),
              floors: form.floors.trim(),
              facing: form.facing,
              furnishing: form.furnishing,
              possessionStatus: form.possessionStatus,
              possessionDate: form.possessionDate || null,
              constructionUpdate: form.constructionUpdate.trim(),
            },
            media: {
              imageCount: form.images.length,
              floorPlanCount: form.floorPlans.length,
              videoCount: form.video ? 1 : 0,
            },
            legalAndVerification: {
              ownershipDocumentUploaded: Boolean(form.ownershipDocument),
              builderDocumentCount: form.builderDocuments.length,
              builderLegalName: form.builderLegalName.trim(),
              reraNumber: form.reraNumber.trim(),
              approvalStatus: form.approvalStatus,
              ownershipCheckStatus,
              builderVerifiedStatus,
            },
            groupDeal: {
              enabled: form.allowGroupDeal,
              minimumBuyers: form.allowGroupDeal ? Number(form.groupDealMinBuyers || 0) : null,
              estimatedDiscountRange: form.allowGroupDeal ? form.groupDealDiscountRange.trim() : '',
              terms: form.allowGroupDeal ? form.groupDealTerms.trim() : '',
              projectLevelEnabled: form.sellerRole === 'builder' ? form.projectLevelGroupDeal : false,
            },
            contactAndVisibility: {
              contactPreference: form.contactPreference,
              hidePhoneUntilVerifiedInterest: form.hidePhoneUntilVerifiedInterest,
              listingVisibility: toVisibilityLabel(form.listingVisibility),
              requireBuyerIntentConfirmation: form.requireBuyerIntentConfirmation,
              antiSpamProtection: form.antiSpamProtection,
              blockSuspiciousUsers: form.blockSuspiciousUsers,
            },
            builderTools:
              form.sellerRole === 'builder'
                ? {
                    projectName: form.builderProjectName.trim(),
                    totalUnits: Number(form.unitAvailabilityTotal || 0),
                    availableUnits: Number(form.unitAvailabilityOpen || 0),
                    unitAvailabilityTrackerEnabled: true,
                    constructionProgressUpdates: form.constructionUpdate.trim() || 'In Progress',
                    projectGroupDealEnablement: form.projectLevelGroupDeal,
                  }
                : null,
          },
          help: {
            needHelp: false,
            preferredCallTime: 'Morning',
            helpType: 'Just call and guide me',
          },
          draft: false,
        }),
      });

      setSuccessReferenceId(response.referenceId || '');
      toast.success('Listing submitted for verification review.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to submit listing right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetFlow = () => {
    setForm(initialForm);
    setStep(1);
    setSuccessReferenceId('');
    setError('');
  };

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-6">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-blue-950 via-blue-900 to-blue-800 px-6 py-7 text-white">
            <h1 className="text-3xl font-semibold sm:text-4xl">Sell Your Property with Trust and Transparency</h1>
            <p className="mt-2 max-w-3xl text-sm text-blue-100 sm:text-base">
              List your property on a verified platform trusted by genuine buyers and builders.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                className="bg-white text-blue-900 hover:bg-blue-50"
                onClick={() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                List Property
              </Button>
              <Button
                variant="outline"
                className="border-white/30 bg-white/10 text-white hover:bg-white/20"
                onClick={handleBuilderPortal}
              >
                Builder Login / Dashboard
              </Button>
            </div>
          </div>
          <div className="grid gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 text-xs text-slate-700 sm:grid-cols-3">
            <p className="inline-flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-emerald-600" />
              Verified Buyers
            </p>
            <p className="inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Builder Verification
            </p>
            <p className="inline-flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-emerald-600" />
              Transparent Listing Process
            </p>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Who Can Sell</h2>
          <p className="mt-2 text-sm text-slate-600">
            Select listing category before starting. This reduces confusion and helps prevent fake listings.
          </p>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {SELLER_OPTIONS.map((option) => {
              const selected = option.role === form.sellerRole;
              return (
                <button
                  key={option.role}
                  type="button"
                  onClick={() => updateField('sellerRole', option.role)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    selected
                      ? 'border-blue-300 bg-blue-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-900">{option.title}</p>
                  <p className="mt-1 text-xs text-slate-600">{option.description}</p>
                  <p className="mt-3 text-xs text-slate-500">Required documents: {option.docs}</p>
                  <p className="mt-1 text-xs text-slate-500">Verification level: {option.verificationLevel}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div ref={formRef} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Step-by-Step Listing Flow</h2>
              <p className="mt-1 text-sm text-slate-600">
                Complete each step to publish a trusted listing for serious buyers.
              </p>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
              Step {step} of {totalSteps}
            </span>
          </div>
          <Progress value={progressPercent} className="mt-4 h-2 bg-slate-200 [&>[data-slot=progress-indicator]]:bg-blue-700" />
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
            {STEP_LABELS.map((item) => {
              const active = item.step === step;
              return (
                <div
                  key={item.step}
                  className={`rounded-xl border px-3 py-2 text-xs ${
                    active
                      ? 'border-blue-300 bg-blue-50 text-blue-800'
                      : 'border-slate-200 bg-slate-50 text-slate-600'
                  }`}
                >
                  {item.step}. {item.label}
                </div>
              );
            })}
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            {step === 1 && (
              <div className="space-y-4">
                <h3 className="text-base font-semibold text-slate-900">Step 1: Basic Property Details</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select value={form.propertyType} onValueChange={(value: PropertyType) => updateField('propertyType', value)}>
                    <SelectTrigger className="h-11 bg-white">
                      <SelectValue placeholder="Property Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Apartment">Apartment</SelectItem>
                      <SelectItem value="Villa">Villa</SelectItem>
                      <SelectItem value="Plot">Plot</SelectItem>
                      <SelectItem value="Commercial">Commercial</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={form.saleMode} onValueChange={(value: SaleMode) => updateField('saleMode', value)}>
                    <SelectTrigger className="h-11 bg-white">
                      <SelectValue placeholder="New / Resale" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="New">New</SelectItem>
                      <SelectItem value="Resale">Resale</SelectItem>
                    </SelectContent>
                  </Select>
                  <LgdLocationInput
                    value={form.state}
                    onChange={(value) => updateField('state', value)}
                    placeholder="India - State"
                    className="h-11 bg-white"
                    suggestKind="india"
                    indiaValueField="state"
                  />
                  <LgdLocationInput
                    value={form.district}
                    onChange={(value) => updateField('district', value)}
                    placeholder="District"
                    className="h-11 bg-white"
                    suggestKind="india"
                    indiaValueField="district"
                    indiaState={form.state}
                  />
                  <LgdLocationInput
                    value={form.city}
                    onChange={(value) => updateField('city', value)}
                    placeholder="City"
                    className="h-11 bg-white"
                    suggestKind="india"
                    indiaValueField="subdistrict"
                    indiaState={form.state}
                    indiaDistrict={form.district}
                  />
                  <LgdLocationInput
                    value={form.locality}
                    onChange={(value) => updateField('locality', value)}
                    placeholder="Locality"
                    className="h-11 bg-white"
                    suggestKind="india"
                    indiaValueField="village"
                    indiaState={form.state}
                    indiaDistrict={form.district}
                    indiaSubdistrict={form.city}
                  />
                  <Input
                    value={form.propertyName}
                    onChange={(event) => updateField('propertyName', event.target.value)}
                    placeholder="Project / Property Name"
                    className="h-11 bg-white sm:col-span-2"
                  />
                </div>
                {form.sellerRole === 'builder' && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                    <p className="text-sm font-semibold text-blue-900">Builder Project Listing</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <Input
                        value={form.builderProjectName}
                        onChange={(event) => updateField('builderProjectName', event.target.value)}
                        placeholder="Project Name"
                        className="h-10 bg-white"
                      />
                      <Input
                        value={form.unitAvailabilityTotal}
                        onChange={(event) => updateField('unitAvailabilityTotal', numericOnly(event.target.value))}
                        placeholder="Total Units"
                        className="h-10 bg-white"
                      />
                      <Input
                        value={form.unitAvailabilityOpen}
                        onChange={(event) => updateField('unitAvailabilityOpen', numericOnly(event.target.value))}
                        placeholder="Available Units"
                        className="h-10 bg-white"
                      />
                    </div>
                  </div>
                )}
                <LgdLocationAccuracyNote />
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h3 className="text-base font-semibold text-slate-900">Step 2: Property Specifications</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    value={form.price}
                    onChange={(event) => updateField('price', numericOnly(event.target.value))}
                    placeholder="Price (INR)"
                    className="h-11 bg-white"
                  />
                  <Input
                    value={form.areaSqft}
                    onChange={(event) => updateField('areaSqft', numericOnly(event.target.value))}
                    placeholder="Area (sq.ft)"
                    className="h-11 bg-white"
                  />
                  <Input
                    value={form.bhkOrConfig}
                    onChange={(event) => updateField('bhkOrConfig', event.target.value)}
                    placeholder="BHK / Configuration"
                    className="h-11 bg-white"
                  />
                  <Input
                    value={form.floors}
                    onChange={(event) => updateField('floors', event.target.value)}
                    placeholder="Floors"
                    className="h-11 bg-white"
                  />
                  <Select value={form.facing} onValueChange={(value: FacingDirection) => updateField('facing', value)}>
                    <SelectTrigger className="h-11 bg-white">
                      <SelectValue placeholder="Facing" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="North">North</SelectItem>
                      <SelectItem value="East">East</SelectItem>
                      <SelectItem value="South">South</SelectItem>
                      <SelectItem value="West">West</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={form.furnishing} onValueChange={(value: FurnishingStatus) => updateField('furnishing', value)}>
                    <SelectTrigger className="h-11 bg-white">
                      <SelectValue placeholder="Furnishing" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Unfurnished">Unfurnished</SelectItem>
                      <SelectItem value="Semi-Furnished">Semi-Furnished</SelectItem>
                      <SelectItem value="Fully Furnished">Fully Furnished</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={form.possessionStatus}
                    onValueChange={(value: PossessionStatus) => updateField('possessionStatus', value)}
                  >
                    <SelectTrigger className="h-11 bg-white">
                      <SelectValue placeholder="Possession Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Ready to Move">Ready to Move</SelectItem>
                      <SelectItem value="Under Construction">Under Construction</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.possessionStatus === 'Under Construction' ? (
                    <Input
                      type="date"
                      value={form.possessionDate}
                      onChange={(event) => updateField('possessionDate', event.target.value)}
                      className="h-11 bg-white"
                    />
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                      Possession Date: Not required for ready-to-move.
                    </div>
                  )}
                </div>
                {form.sellerRole === 'builder' && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                    <p className="text-sm font-semibold text-blue-900">Builder Construction Update</p>
                    <Textarea
                      value={form.constructionUpdate}
                      onChange={(event) => updateField('constructionUpdate', event.target.value)}
                      placeholder="Add latest construction progress and availability update."
                      className="mt-3 min-h-24 bg-white"
                    />
                  </div>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h3 className="text-base font-semibold text-slate-900">Step 3: Media Upload</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">Property Images</p>
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      className="mt-3 block w-full text-xs"
                      onChange={(event) => updateFiles('images', event.target.files)}
                    />
                    <p className="mt-2 text-xs">{renderFileCountLabel('Images', form.images.length)}</p>
                  </label>
                  <label className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">Floor Plans</p>
                    <input
                      type="file"
                      multiple
                      accept="image/*,.pdf"
                      className="mt-3 block w-full text-xs"
                      onChange={(event) => updateFiles('floorPlans', event.target.files)}
                    />
                    <p className="mt-2 text-xs">{renderFileCountLabel('Floor Plans', form.floorPlans.length)}</p>
                  </label>
                  <label className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">Optional Video</p>
                    <input
                      type="file"
                      accept="video/*"
                      className="mt-3 block w-full text-xs"
                      onChange={(event) => updateSingleFile('video', event.target.files)}
                    />
                    <p className="mt-2 text-xs">{form.video ? 'Video selected' : 'No video uploaded'}</p>
                  </label>
                </div>
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                  <p className="font-semibold">Image Quality Guidelines</p>
                  <ul className="mt-2 space-y-1">
                    <li>Use clear daylight photos with complete room coverage.</li>
                    <li>Avoid heavily edited images and misleading angles.</li>
                    <li>Include front view, interiors, and key amenities.</li>
                  </ul>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <h3 className="text-base font-semibold text-slate-900">Step 4: Legal & Verification Details</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">Ownership Document Upload</p>
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      className="mt-3 block w-full text-xs"
                      onChange={(event) => updateSingleFile('ownershipDocument', event.target.files)}
                    />
                    <p className="mt-2 text-xs">
                      {form.ownershipDocument ? form.ownershipDocument.name : 'No file uploaded'}
                    </p>
                  </label>
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Verification Status
                    </p>
                    <p className="mt-2 text-sm text-slate-800">Ownership Check: {ownershipCheckStatus}</p>
                    <p className="mt-1 text-sm text-slate-800">Builder Verified: {builderVerifiedStatus}</p>
                  </div>
                  {form.sellerRole === 'builder' && (
                    <>
                      <Input
                        value={form.builderLegalName}
                        onChange={(event) => updateField('builderLegalName', event.target.value)}
                        placeholder="Builder legal name"
                        className="h-11 bg-white"
                      />
                      <label className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-700">
                        <p className="font-semibold text-slate-900">Builder Verification Documents</p>
                        <input
                          type="file"
                          multiple
                          accept=".pdf,image/*"
                          className="mt-3 block w-full text-xs"
                          onChange={(event) => updateFiles('builderDocuments', event.target.files)}
                        />
                        <p className="mt-2 text-xs">{renderFileCountLabel('Builder Docs', form.builderDocuments.length)}</p>
                      </label>
                    </>
                  )}
                  <Input
                    value={form.reraNumber}
                    onChange={(event) => updateField('reraNumber', event.target.value.toUpperCase())}
                    placeholder="RERA number (if available)"
                    className="h-11 bg-white"
                  />
                  <Select
                    value={form.approvalStatus}
                    onValueChange={(value: ApprovalStatus) => updateField('approvalStatus', value)}
                  >
                    <SelectTrigger className="h-11 bg-white">
                      <SelectValue placeholder="Approval status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Approved">Approved</SelectItem>
                      <SelectItem value="In Progress">In Progress</SelectItem>
                      <SelectItem value="Not Available">Not Available</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-4">
                <h3 className="text-base font-semibold text-slate-900">Step 5: Group Deal Option (Optional)</h3>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <label className="flex items-center justify-between gap-3 text-sm font-medium text-slate-900">
                    Allow Group Deal
                    <Switch
                      checked={form.allowGroupDeal}
                      onCheckedChange={(checked) => updateField('allowGroupDeal', checked)}
                      className="data-[state=checked]:bg-blue-700"
                    />
                  </label>
                  <p className="mt-2 text-xs text-slate-600">
                    Group deals help attract serious buyers faster.
                  </p>
                </div>
                {form.allowGroupDeal ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      value={form.groupDealMinBuyers}
                      onChange={(event) => updateField('groupDealMinBuyers', numericOnly(event.target.value))}
                      placeholder="Minimum buyers required"
                      className="h-11 bg-white"
                    />
                    <Input
                      value={form.groupDealDiscountRange}
                      onChange={(event) => updateField('groupDealDiscountRange', event.target.value)}
                      placeholder="Estimated discount range (e.g. 3% - 7%)"
                      className="h-11 bg-white"
                    />
                    <Textarea
                      value={form.groupDealTerms}
                      onChange={(event) => updateField('groupDealTerms', event.target.value)}
                      placeholder="Terms visible to buyers"
                      className="min-h-24 bg-white sm:col-span-2"
                    />
                    {form.sellerRole === 'builder' && (
                      <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm sm:col-span-2">
                        Project-level group deal enablement
                        <Checkbox
                          checked={form.projectLevelGroupDeal}
                          onCheckedChange={(value) => updateField('projectLevelGroupDeal', Boolean(value))}
                        />
                      </label>
                    )}
                  </div>
                ) : (
                  <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                    Group deal is disabled for this listing.
                  </p>
                )}
              </div>
            )}

            {step === 6 && (
              <div className="space-y-4">
                <h3 className="text-base font-semibold text-slate-900">Step 6: Contact & Visibility</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    value={form.contactName}
                    onChange={(event) => updateField('contactName', event.target.value)}
                    placeholder="Contact Name"
                    className="h-11 bg-white"
                  />
                  <Input
                    value={form.contactEmail}
                    onChange={(event) => updateField('contactEmail', event.target.value)}
                    placeholder="Email (optional)"
                    className="h-11 bg-white"
                  />
                </div>

                <PhoneVerificationField
                  phone={form.contactPhone}
                  onPhoneChange={(value) => updateField('contactPhone', value)}
                  verifiedToken={form.phoneVerificationId}
                  onVerifiedTokenChange={(value) => updateField('phoneVerificationId', value)}
                  purpose="sell"
                  title="Primary Contact Phone"
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <Select
                    value={form.contactPreference}
                    onValueChange={(value: ContactPreference) => updateField('contactPreference', value)}
                  >
                    <SelectTrigger className="h-11 bg-white">
                      <SelectValue placeholder="Contact preference" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Call">Call</SelectItem>
                      <SelectItem value="Message">Message</SelectItem>
                      <SelectItem value="Call + Message">Call + Message</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={form.listingVisibility}
                    onValueChange={(value: ListingVisibility) => updateField('listingVisibility', value)}
                  >
                    <SelectTrigger className="h-11 bg-white">
                      <SelectValue placeholder="Listing visibility" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="verified_highlight">Verified Highlight (future premium)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                  Hide phone number until buyer interest is verified
                  <Switch
                    checked={form.hidePhoneUntilVerifiedInterest}
                    onCheckedChange={(checked) => updateField('hidePhoneUntilVerifiedInterest', checked)}
                    className="data-[state=checked]:bg-blue-700"
                  />
                </label>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-900">Lead Quality Controls</p>
                  <div className="mt-3 space-y-2 text-sm text-slate-700">
                    <label className="flex items-center justify-between">
                      Buyer intent confirmation required
                      <Checkbox
                        checked={form.requireBuyerIntentConfirmation}
                        onCheckedChange={(value) => updateField('requireBuyerIntentConfirmation', Boolean(value))}
                      />
                    </label>
                    <label className="flex items-center justify-between">
                      Spam filtering enabled
                      <Checkbox
                        checked={form.antiSpamProtection}
                        onCheckedChange={(value) => updateField('antiSpamProtection', Boolean(value))}
                      />
                    </label>
                    <label className="flex items-center justify-between">
                      Allow blocking suspicious users
                      <Checkbox
                        checked={form.blockSuspiciousUsers}
                        onCheckedChange={(value) => updateField('blockSuspiciousUsers', Boolean(value))}
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {reviewRows.map((row) => (
              <div key={row.label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{row.label}</p>
                <p className="mt-1 break-words text-sm font-medium text-slate-900">{row.value}</p>
              </div>
            ))}
          </div>

          {error ? (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
            <Button variant="outline" onClick={previousStep} disabled={step === 1 || isSubmitting}>
              Previous
            </Button>
            <div className="flex flex-wrap gap-2">
              {step < totalSteps ? (
                <Button className="bg-slate-900 text-white hover:bg-slate-800" onClick={nextStep} disabled={isSubmitting}>
                  Next Step
                </Button>
              ) : (
                <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => void submitListing()} disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting
                    </>
                  ) : (
                    'Submit Listing'
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>

        {successReferenceId ? (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
            <h3 className="text-xl font-semibold text-emerald-900">Listing submitted successfully</h3>
            <p className="mt-2 text-sm text-emerald-800">Reference ID: {successReferenceId}</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <Button variant="outline" onClick={() => onManageListings?.()}>
                View listing status
              </Button>
              <Button variant="outline" onClick={() => onOpenLeads?.()}>
                See buyer interest count
              </Button>
              <Button variant="outline" onClick={() => onOpenLeads?.()}>
                Respond to enquiries
              </Button>
              <Button variant="outline" onClick={() => onManageListings?.()}>
                Manage group deals
              </Button>
              <Button variant="outline" onClick={() => onManageListings?.()}>
                Edit or pause listing
              </Button>
              <Button variant="outline" onClick={() => onOpenDashboard?.()}>
                Track verification progress
              </Button>
            </div>
            <Button className="mt-4 bg-slate-900 text-white hover:bg-slate-800" onClick={resetFlow}>
              Submit another listing
            </Button>
          </div>
        ) : null}

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Builder-Specific Features</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <FeatureCard icon={<Building2 className="h-4 w-4 text-blue-700" />} title="Project-level listings" description="List and manage full projects professionally." />
            <FeatureCard icon={<Users className="h-4 w-4 text-blue-700" />} title="Multiple units" description="Add multiple unit types under one project." />
            <FeatureCard icon={<Clock3 className="h-4 w-4 text-blue-700" />} title="Availability tracker" description="Track open inventory and update quickly." />
            <FeatureCard icon={<Sparkles className="h-4 w-4 text-blue-700" />} title="Progress updates" description="Publish clear construction progress to buyers." />
            <FeatureCard icon={<BadgeCheck className="h-4 w-4 text-blue-700" />} title="Project group deals" description="Enable group deal at project level." />
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Verification & Trust System</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <TrustCard
              title="Builder Verification"
              description="ZDT Realty verifies builder identity, company profile, and core listing credibility before publishing."
            />
            <TrustCard
              title="Ownership Checks"
              description="Ownership documents are reviewed to reduce fake or unauthorized listings."
            />
            <TrustCard
              title="What In Progress Means"
              description="In Progress means review is underway and listing is not yet fully verified."
            />
            <TrustCard
              title="Fake Listings Policy"
              description="Suspicious and fake listings are removed to protect genuine buyers and sellers."
            />
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Seller Dashboard Integration</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <DashboardCard title="Listing Status" description="Track pending, verified, or paused states." />
            <DashboardCard title="Buyer Interest" description="See intent-led buyer counts." />
            <DashboardCard title="Enquiries" description="Reply to buyer messages securely." />
            <DashboardCard title="Group Deals" description="Manage participation and terms." />
            <DashboardCard title="Edit / Pause" description="Update details or pause instantly." />
            <DashboardCard title="Verification Track" description="See live verification progress." />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => onOpenDashboard?.()}>
              <LayoutDashboard className="mr-2 h-4 w-4" />
              Open Seller Dashboard
            </Button>
            <Button variant="outline" onClick={() => onOpenAnalytics?.()}>
              Analytics
            </Button>
            <Button variant="outline" onClick={() => onOpenBuilderPlans?.()}>
              Future Builder Plans
            </Button>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Lead Quality Control</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FeatureCard icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} title="Buyer intent checks" description="Interest confirmation before seller contact unlock." />
            <FeatureCard icon={<ShieldCheck className="h-4 w-4 text-emerald-600" />} title="No spam flow" description="Spam controls reduce irrelevant outreach." />
            <FeatureCard icon={<MessageCircle className="h-4 w-4 text-emerald-600" />} title="Enquiry quality signals" description="Rate and monitor enquiry quality internally." />
            <FeatureCard icon={<Users className="h-4 w-4 text-emerald-600" />} title="Suspicious user block" description="Block risky users for safer selling." />
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Scalability & Future Ready</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <TrustCard title="Paid Listings" description="Ready to add monetized listing tiers without changing seller flow." />
            <TrustCard title="Featured Builders" description="Supports priority visibility for verified builder programs." />
            <TrustCard title="Seller Analytics" description="Structured data fields are ready for deeper performance insights." />
            <TrustCard title="CRM Integrations" description="Listing and lead metadata can connect to external CRM systems." />
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Legal & Disclaimer</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            <li>ZDT Realty is a platform and not a property broker.</li>
            <li>Final transactions happen directly between buyers and sellers/builders.</li>
            <li>Verification improves trust and transparency but is not legal advice.</li>
          </ul>
        </div>

        <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
          ZDT Realty is an early-stage startup built with a focus on verified listings and transparent selling.
        </p>
      </div>
    </section>
  );
}

function FeatureCard({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
        {icon}
        {title}
      </p>
      <p className="mt-1 text-xs text-slate-600">{description}</p>
    </div>
  );
}

function TrustCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-xs text-slate-600">{description}</p>
    </div>
  );
}

function DashboardCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-xs text-slate-600">{description}</p>
    </div>
  );
}
