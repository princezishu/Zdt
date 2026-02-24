
import { useMemo, useState } from 'react';
import { BadgeCheck, Building2, CheckCircle2, Clock3, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { toast } from 'sonner';
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
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/http';
import { LgdLocationAccuracyNote, LgdLocationInput } from '@/components/realty/LgdLocationInput';
import { PhoneVerificationField, StepProgress } from './workflow/CommonBlocks';

type SellStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
type PropertyCategory =
  | 'Apartment / Flat'
  | 'Independent House / Villa'
  | 'Plot / Land'
  | 'Commercial Shop'
  | 'Office Space';

type ContactTime = 'Morning' | 'Afternoon' | 'Evening';

type PropertyStatus = 'Ready to Move' | 'Under Construction' | 'New Launch';

interface SellPageProps {
  onManageListings?: () => void;
  onOpenDashboard?: () => void;
  onOpenLeads?: () => void;
  onOpenAnalytics?: () => void;
  onOpenBuilderPlans?: () => void;
}

interface SellFormState {
  sellerType: 'Builder / Developer' | 'Property Owner' | 'Authorized Agent';
  propertyCategory: PropertyCategory;
  ownerName: string;
  ownerPhone: string;
  ownerPhoneVerificationId: string;
  ownerEmail: string;
  state: string;
  district: string;
  city: string;
  locality: string;
  landmark: string;
  latitude: string;
  longitude: string;
  propertyTitle: string;
  propertyDescription: string;
  totalAreaSqft: string;
  configuration: string;
  floorNumber: string;
  totalFloors: string;
  facingDirection: string;
  furnishingStatus: string;
  parkingAvailability: string;
  expectedPrice: string;
  priceNegotiable: 'Yes' | 'No';
  maintenanceCharges: string;
  propertyStatus: PropertyStatus;
  possessionDate: string;
  constructionStage: string;
  images: File[];
  floorPlans: File[];
  brochures: File[];
  enableGroupDeal: boolean;
  groupDealMinBuyers: string;
  groupDealDurationDays: string;
  groupDealApprovalRequired: 'Yes' | 'No';
  ownershipDeclaration: boolean;
  authorizationDeclaration: boolean;
  builderDetails: string;
  reraNumber: string;
  whatsapp: string;
  preferredContactTime: ContactTime;
}

const steps: string[] = [
  'Property Type',
  'Location Details',
  'Property Details',
  'Pricing Details',
  'Property Status',
  'Upload Media',
  'Group Deal + Verification',
  'Review & Submit',
];

const initialForm: SellFormState = {
  sellerType: 'Builder / Developer',
  propertyCategory: 'Apartment / Flat',
  ownerName: '',
  ownerPhone: '',
  ownerPhoneVerificationId: '',
  ownerEmail: '',
  state: '',
  district: '',
  city: '',
  locality: '',
  landmark: '',
  latitude: '',
  longitude: '',
  propertyTitle: '',
  propertyDescription: '',
  totalAreaSqft: '',
  configuration: '',
  floorNumber: '',
  totalFloors: '',
  facingDirection: 'North',
  furnishingStatus: 'Unfurnished',
  parkingAvailability: 'Yes',
  expectedPrice: '',
  priceNegotiable: 'Yes',
  maintenanceCharges: '',
  propertyStatus: 'Ready to Move',
  possessionDate: '',
  constructionStage: '',
  images: [],
  floorPlans: [],
  brochures: [],
  enableGroupDeal: false,
  groupDealMinBuyers: '5',
  groupDealDurationDays: '30',
  groupDealApprovalRequired: 'Yes',
  ownershipDeclaration: false,
  authorizationDeclaration: false,
  builderDetails: '',
  reraNumber: '',
  whatsapp: '',
  preferredContactTime: 'Morning',
};

function isPhoneValid(value: string): boolean {
  return /^\d{10,15}$/.test(value);
}

function parseCoordinate(value: string, min: number, max: number): number | null {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return null;
  if (numeric < min || numeric > max) return null;
  return Number(numeric.toFixed(7));
}

function toBackendPropertyType(propertyCategory: PropertyCategory): 'Plot' | 'Villa' | 'Flat / Apartment' | 'Commercial' {
  if (propertyCategory === 'Plot / Land') return 'Plot';
  if (propertyCategory === 'Independent House / Villa') return 'Villa';
  if (propertyCategory === 'Apartment / Flat') return 'Flat / Apartment';
  return 'Commercial';
}

function formatPrice(value: string): string {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return '-';
  return `INR ${Math.round(amount).toLocaleString('en-IN')}`;
}

function InfoPill({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
      <Icon className="h-4 w-4 text-slate-600" />
      {label}
    </div>
  );
}

export default function SellPage({
  onManageListings,
  onOpenDashboard,
  onOpenLeads,
  onOpenAnalytics,
  onOpenBuilderPlans,
}: SellPageProps) {
  const [step, setStep] = useState<SellStep>(1);
  const [form, setForm] = useState<SellFormState>(initialForm);
  const [error, setError] = useState('');
  const [successRef, setSuccessRef] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = <K extends keyof SellFormState>(key: K, value: SellFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const setFiles = (key: 'images' | 'floorPlans' | 'brochures', files: FileList | null) => {
    updateField(key, Array.from(files ?? []));
  };

  const reviewRows = useMemo(
    () => [
      { label: 'Seller Type', value: form.sellerType },
      { label: 'Property Category', value: form.propertyCategory },
      { label: 'Property Title', value: form.propertyTitle || '-' },
      {
        label: 'Location',
        value: [form.locality || '-', form.city || '-', form.district || '-', form.state || '-'].join(', '),
      },
      {
        label: 'Coordinates',
        value:
          form.latitude.trim() && form.longitude.trim()
            ? `${form.latitude.trim()}, ${form.longitude.trim()}`
            : '-',
      },
      { label: 'Total Area', value: form.totalAreaSqft ? `${form.totalAreaSqft} sq.ft` : '-' },
      { label: 'Configuration', value: form.configuration || '-' },
      { label: 'Expected Price', value: formatPrice(form.expectedPrice) },
      { label: 'Negotiable', value: form.priceNegotiable },
      { label: 'Maintenance Charges', value: form.maintenanceCharges ? formatPrice(form.maintenanceCharges) : '-' },
      { label: 'Property Status', value: form.propertyStatus },
      {
        label: 'Under Construction Details',
        value:
          form.propertyStatus === 'Under Construction'
            ? `Possession: ${form.possessionDate || '-'} | Stage: ${form.constructionStage || '-'}`
            : 'Not Applicable',
      },
      {
        label: 'Media',
        value: `${form.images.length} image(s), ${form.floorPlans.length} floor plan(s), ${form.brochures.length} brochure(s)`,
      },
      {
        label: 'Group Deal',
        value: form.enableGroupDeal
          ? `Enabled | Min Buyers: ${form.groupDealMinBuyers || '-'} | Duration: ${form.groupDealDurationDays || '-'} days`
          : 'Disabled',
      },
      {
        label: 'Verification',
        value:
          form.ownershipDeclaration && form.authorizationDeclaration
            ? 'Ownership and authorization declared'
            : 'Declarations pending',
      },
      { label: 'RERA Number', value: form.reraNumber || '-' },
      {
        label: 'Contact Preferences',
        value: `Phone: ${form.ownerPhone || '-'} | WhatsApp: ${form.whatsapp || '-'} | ${form.preferredContactTime}`,
      },
    ],
    [form]
  );
  const validateStep = (targetStep: SellStep): boolean => {
    if (targetStep === 1 && !form.propertyCategory) {
      setError('Please select property type.');
      return false;
    }

    if (targetStep === 2) {
      if (!form.state.trim() || !form.district.trim() || !form.city.trim() || !form.locality.trim()) {
        setError('State, district, city, and locality are required.');
        return false;
      }
      const latitude = parseCoordinate(form.latitude, -90, 90);
      const longitude = parseCoordinate(form.longitude, -180, 180);
      if (latitude === null || longitude === null) {
        setError('Add valid latitude and longitude for exact map location.');
        return false;
      }
    }

    if (targetStep === 3) {
      if (!form.propertyTitle.trim() || form.propertyTitle.trim().length < 6) {
        setError('Please add a clear property title.');
        return false;
      }
      if (!form.propertyDescription.trim() || form.propertyDescription.trim().length < 20) {
        setError('Please add a factual property description.');
        return false;
      }
      if (!form.totalAreaSqft.trim()) {
        setError('Total area is required.');
        return false;
      }
      if (!form.configuration.trim()) {
        setError('Configuration/BHK is required.');
        return false;
      }
    }

    if (targetStep === 4) {
      const expectedPrice = Number(form.expectedPrice || 0);
      if (!Number.isFinite(expectedPrice) || expectedPrice <= 0) {
        setError('Expected price is required.');
        return false;
      }
    }

    if (targetStep === 5 && form.propertyStatus === 'Under Construction') {
      if (!form.possessionDate.trim() || !form.constructionStage.trim()) {
        setError('Possession date and construction stage are required for under-construction properties.');
        return false;
      }
    }

    if (targetStep === 6 && form.images.length === 0) {
      setError('Upload at least one property image.');
      return false;
    }

    if (targetStep === 7) {
      if (!form.ownerName.trim()) {
        setError('Seller name is required.');
        return false;
      }
      if (!isPhoneValid(form.ownerPhone)) {
        setError('Please enter a valid phone number.');
        return false;
      }
      if (!form.ownerPhoneVerificationId) {
        setError('Please verify phone with OTP before submit.');
        return false;
      }
      if (!form.ownershipDeclaration || !form.authorizationDeclaration) {
        setError('Please complete ownership and authorization declarations.');
        return false;
      }
    }

    setError('');
    return true;
  };

  const next = () => {
    if (!validateStep(step)) return;
    setStep((prev) => (prev < 8 ? ((prev + 1) as SellStep) : prev));
  };

  const previous = () => {
    setError('');
    setStep((prev) => (prev > 1 ? ((prev - 1) as SellStep) : prev));
  };

  const submitForReview = async () => {
    for (let current = 1; current <= 7; current += 1) {
      if (!validateStep(current as SellStep)) {
        setStep(current as SellStep);
        return;
      }
    }

    setIsSubmitting(true);
    setError('');

    try {
      const latitude = parseCoordinate(form.latitude, -90, 90);
      const longitude = parseCoordinate(form.longitude, -180, 180);
      const response = await apiRequest<{ referenceId: string }>('/workflow/public/sell', {
        method: 'POST',
        body: JSON.stringify({
          requesterName: form.ownerName.trim(),
          phone: form.ownerPhone.trim(),
          phoneVerificationId: form.ownerPhoneVerificationId,
          email: form.ownerEmail.trim() || undefined,
          city: form.city.trim(),
          locality: form.locality.trim(),
          propertyType: toBackendPropertyType(form.propertyCategory),
          address: [form.landmark.trim(), form.locality.trim(), form.city.trim(), form.district.trim(), form.state.trim()]
            .filter(Boolean)
            .join(', '),
          mapPin: latitude !== null && longitude !== null ? `${latitude},${longitude}` : '',
          pricing: {
            expectedPrice: Number(form.expectedPrice || '0'),
            negotiable: form.priceNegotiable,
            additionalCharges: form.maintenanceCharges.trim(),
            noMisleadingPricing: true,
          },
          details: {
            sellerType: form.sellerType,
            propertyCategory: form.propertyCategory,
            location: {
              state: form.state.trim(),
              district: form.district.trim(),
              city: form.city.trim(),
              locality: form.locality.trim(),
              landmark: form.landmark.trim(),
              latitude,
              longitude,
            },
            property: {
              title: form.propertyTitle.trim(),
              description: form.propertyDescription.trim(),
              totalAreaSqft: Number(form.totalAreaSqft || '0'),
              configuration: form.configuration.trim(),
              floorNumber: form.floorNumber.trim(),
              totalFloors: form.totalFloors.trim(),
              facingDirection: form.facingDirection,
              furnishingStatus: form.furnishingStatus,
              parkingAvailability: form.parkingAvailability,
            },
            status: {
              propertyStatus: form.propertyStatus,
              possessionDate: form.possessionDate || null,
              constructionStage: form.constructionStage || '',
            },
            media: {
              imageCount: form.images.length,
              floorPlanCount: form.floorPlans.length,
              brochureCount: form.brochures.length,
            },
            groupDeal: {
              enabled: form.enableGroupDeal,
              minBuyersRequired: form.enableGroupDeal ? Number(form.groupDealMinBuyers || '0') : null,
              availabilityDurationDays: form.enableGroupDeal ? Number(form.groupDealDurationDays || '0') : null,
              approvalRequired: form.enableGroupDeal ? form.groupDealApprovalRequired : 'No',
            },
            verification: {
              ownershipDeclaration: form.ownershipDeclaration,
              authorizationDeclaration: form.authorizationDeclaration,
              builderDetails: form.builderDetails.trim(),
              reraNumber: form.reraNumber.trim(),
            },
            verificationStatus: {
              builderVerified: 'In Progress',
              ownershipCheck: 'In Progress',
              governmentReference: 'In Progress',
            },
            contactPreferences: {
              primaryPhone: form.ownerPhone.trim(),
              whatsapp: form.whatsapp.trim(),
              preferredContactTime: form.preferredContactTime,
              privacyNote: 'Contact details are shared only with interested buyers.',
            },
          },
          help: {
            needHelp: false,
            preferredCallTime: form.preferredContactTime,
            helpType: 'Just call and guide me',
          },
          draft: false,
        }),
      });

      setSuccessRef(response.referenceId);
      toast.success('Property submitted for review.');
      setStep(8);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to submit property for review.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canRenderSuccess = successRef.trim().length > 0;

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-6">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 px-6 py-6 text-white">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-300">Seller Center</p>
            <h1 className="mt-2 text-3xl font-semibold">Sell Your Property</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-200">
              List your property and connect with genuine buyers through a trusted platform.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button className="bg-white text-slate-900 hover:bg-slate-100" onClick={() => setStep(1)}>
                List Property
              </Button>
              <Button
                variant="outline"
                className="border-white/30 bg-white/10 text-white hover:bg-white/20"
                onClick={() => onManageListings?.()}
              >
                Already listed? Manage Listings
              </Button>
            </div>
          </div>

          <div className="grid gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 text-xs text-slate-700 sm:grid-cols-2 xl:grid-cols-4">
            <span className="inline-flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-emerald-600" /> Verified listing process</span>
            <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Genuine lead filters</span>
            <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4 text-emerald-600" /> Structured review workflow</span>
            <span className="inline-flex items-center gap-2"><Sparkles className="h-4 w-4 text-emerald-600" /> Builder and owner friendly</span>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Who can list properties</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <InfoPill icon={Building2} label="Builders & Developers" />
            <InfoPill icon={Users} label="Property Owners" />
            <InfoPill icon={CheckCircle2} label="Authorized Agents (optional, later)" />
          </div>
          <p className="mt-3 text-sm text-slate-600">
            All listings go through a verification process before publishing.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Trust Panel</h2>
            <p className="mt-2 text-sm text-slate-600">
              Listings are reviewed for ownership, contact authenticity, and listing quality before publish.
            </p>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              <li className="inline-flex items-start gap-2"><BadgeCheck className="mt-0.5 h-4 w-4 text-emerald-600" />Ownership declaration is mandatory.</li>
              <li className="inline-flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-600" />Phone verification is required for primary contact.</li>
              <li className="inline-flex items-start gap-2"><Clock3 className="mt-0.5 h-4 w-4 text-emerald-600" />Verification timeline is visible in your dashboard.</li>
            </ul>
          </div>
          <div className="rounded-3xl border border-amber-200 bg-amber-50/70 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-amber-900">Document Submission Info</h2>
            <p className="mt-2 text-sm text-amber-800">
              You can upload supporting documents now or after submission from Manage Listings.
            </p>
            <ul className="mt-3 space-y-2 text-sm text-amber-900">
              <li>Recommended: ownership proof, ID proof, and RERA/project documents (if applicable).</li>
              <li>Accepted formats: image, PDF, and office documents.</li>
              <li>Never share payment screenshots or sensitive banking details in listing notes.</li>
            </ul>
          </div>
        </div>

        <StepProgress
          title="Sell Property Workflow"
          subtitle="Professional, transparent flow from listing to review."
          step={step}
          totalSteps={steps.length}
          steps={steps}
        />

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          {step === 1 && (
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Step 1: Property Type</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <Select value={form.sellerType} onValueChange={(value: SellFormState['sellerType']) => updateField('sellerType', value)}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Who are you" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Builder / Developer">Builder / Developer</SelectItem>
                    <SelectItem value="Property Owner">Property Owner</SelectItem>
                    <SelectItem value="Authorized Agent">Authorized Agent</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={form.propertyCategory} onValueChange={(value: PropertyCategory) => updateField('propertyCategory', value)}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Property type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Apartment / Flat">Apartment / Flat</SelectItem>
                    <SelectItem value="Independent House / Villa">Independent House / Villa</SelectItem>
                    <SelectItem value="Plot / Land">Plot / Land</SelectItem>
                    <SelectItem value="Commercial Shop">Commercial Shop</SelectItem>
                    <SelectItem value="Office Space">Office Space</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Step 2: Location Details</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Input value={form.state} onChange={(event) => updateField('state', event.target.value)} placeholder="State" className="h-11" />
                <Input value={form.district} onChange={(event) => updateField('district', event.target.value)} placeholder="District" className="h-11" />
                <LgdLocationInput
                  value={form.city}
                  onChange={(value) => updateField('city', value)}
                  placeholder="City / Town"
                  className="h-11"
                  suggestKind="india"
                  indiaValueField="village"
                />
                <LgdLocationInput
                  value={form.locality}
                  onChange={(value) => updateField('locality', value)}
                  placeholder="Area / Locality"
                  className="h-11"
                  suggestKind="india"
                  indiaValueField="subdistrict"
                />
                <Input value={form.landmark} onChange={(event) => updateField('landmark', event.target.value)} placeholder="Landmark (optional)" className="h-11 sm:col-span-2" />
                <Input
                  value={form.latitude}
                  onChange={(event) => updateField('latitude', event.target.value.replace(/[^0-9+.-]/g, ''))}
                  placeholder="Latitude (e.g. 19.0760)"
                  className="h-11"
                />
                <Input
                  value={form.longitude}
                  onChange={(event) => updateField('longitude', event.target.value.replace(/[^0-9+.-]/g, ''))}
                  placeholder="Longitude (e.g. 72.8777)"
                  className="h-11"
                />
                <p className="text-xs text-slate-600 sm:col-span-2">
                  Exact coordinates are required to pin your property on the map view.
                </p>
              </div>
              <LgdLocationAccuracyNote className="mt-3" />
            </div>
          )}

          {step === 3 && (
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Step 3: Property Details</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Input value={form.propertyTitle} onChange={(event) => updateField('propertyTitle', event.target.value)} placeholder="Property title" className="h-11 sm:col-span-2" />
                <Textarea
                  value={form.propertyDescription}
                  onChange={(event) => updateField('propertyDescription', event.target.value)}
                  placeholder="Description"
                  className="min-h-24 sm:col-span-2"
                />
                <Input value={form.totalAreaSqft} onChange={(event) => updateField('totalAreaSqft', event.target.value.replace(/\D/g, ''))} placeholder="Total area (sq.ft)" className="h-11" />
                <Input value={form.configuration} onChange={(event) => updateField('configuration', event.target.value)} placeholder="BHK / Configuration" className="h-11" />
                <Input value={form.floorNumber} onChange={(event) => updateField('floorNumber', event.target.value.replace(/\D/g, ''))} placeholder="Floor number" className="h-11" />
                <Input value={form.totalFloors} onChange={(event) => updateField('totalFloors', event.target.value.replace(/\D/g, ''))} placeholder="Total floors" className="h-11" />
                <Select value={form.facingDirection} onValueChange={(value) => updateField('facingDirection', value)}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Facing direction" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="North">North</SelectItem>
                    <SelectItem value="East">East</SelectItem>
                    <SelectItem value="South">South</SelectItem>
                    <SelectItem value="West">West</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={form.furnishingStatus} onValueChange={(value) => updateField('furnishingStatus', value)}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Furnishing status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Unfurnished">Unfurnished</SelectItem>
                    <SelectItem value="Semi-Furnished">Semi-Furnished</SelectItem>
                    <SelectItem value="Fully Furnished">Fully Furnished</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={form.parkingAvailability} onValueChange={(value) => updateField('parkingAvailability', value)}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Parking" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Yes">Yes</SelectItem>
                    <SelectItem value="No">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Step 4: Pricing Details</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Input value={form.expectedPrice} onChange={(event) => updateField('expectedPrice', event.target.value.replace(/\D/g, ''))} placeholder="Expected price" className="h-11" />
                <Select value={form.priceNegotiable} onValueChange={(value: 'Yes' | 'No') => updateField('priceNegotiable', value)}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Price negotiable" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Yes">Yes</SelectItem>
                    <SelectItem value="No">No</SelectItem>
                  </SelectContent>
                </Select>
                <Input value={form.maintenanceCharges} onChange={(event) => updateField('maintenanceCharges', event.target.value.replace(/\D/g, ''))} placeholder="Maintenance charges (if any)" className="h-11 sm:col-span-2" />
              </div>
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                No misleading pricing allowed.
              </p>
            </div>
          )}

          {step === 5 && (
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Step 5: Property Status</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Select value={form.propertyStatus} onValueChange={(value: PropertyStatus) => updateField('propertyStatus', value)}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Property status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ready to Move">Ready to Move</SelectItem>
                    <SelectItem value="Under Construction">Under Construction</SelectItem>
                    <SelectItem value="New Launch">New Launch</SelectItem>
                  </SelectContent>
                </Select>

                {form.propertyStatus === 'Under Construction' && (
                  <>
                    <Input type="date" value={form.possessionDate} onChange={(event) => updateField('possessionDate', event.target.value)} className="h-11" />
                    <Input value={form.constructionStage} onChange={(event) => updateField('constructionStage', event.target.value)} placeholder="Construction stage" className="h-11" />
                  </>
                )}
              </div>
            </div>
          )}
          {step === 6 && (
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Step 6: Upload Media</h3>
              <p className="mt-2 text-sm text-slate-600">Upload clear, real images to attract serious buyers.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <label className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm">
                  <p className="font-semibold text-slate-900">Property images</p>
                  <input type="file" multiple accept="image/*" className="mt-3 block w-full text-xs" onChange={(event) => setFiles('images', event.target.files)} />
                  <p className="mt-2 text-xs text-slate-700">{form.images.length} file(s)</p>
                </label>
                <label className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm">
                  <p className="font-semibold text-slate-900">Floor plan (optional)</p>
                  <input type="file" multiple accept="image/*,.pdf" className="mt-3 block w-full text-xs" onChange={(event) => setFiles('floorPlans', event.target.files)} />
                  <p className="mt-2 text-xs text-slate-700">{form.floorPlans.length} file(s)</p>
                </label>
                <label className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm">
                  <p className="font-semibold text-slate-900">Project brochure (optional)</p>
                  <input type="file" multiple accept="image/*,.pdf,.doc,.docx" className="mt-3 block w-full text-xs" onChange={(event) => setFiles('brochures', event.target.files)} />
                  <p className="mt-2 text-xs text-slate-700">{form.brochures.length} file(s)</p>
                </label>
              </div>
            </div>
          )}

          {step === 7 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-slate-900">Step 7: Group Deal, Verification, and Contact Preferences</h3>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <label className="flex items-center justify-between text-sm font-medium text-slate-900">
                  Enable Group Deal for this property
                  <Checkbox
                    checked={form.enableGroupDeal}
                    onCheckedChange={(value) => updateField('enableGroupDeal', Boolean(value))}
                  />
                </label>
                <p className="mt-2 text-xs text-slate-600">
                  Group deal allows multiple buyers to join together and request special pricing.
                </p>
                {form.enableGroupDeal && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <Input value={form.groupDealMinBuyers} onChange={(event) => updateField('groupDealMinBuyers', event.target.value.replace(/\D/g, ''))} placeholder="Minimum buyers required" className="h-10" />
                    <Input value={form.groupDealDurationDays} onChange={(event) => updateField('groupDealDurationDays', event.target.value.replace(/\D/g, ''))} placeholder="Availability duration (days)" className="h-10" />
                    <Select
                      value={form.groupDealApprovalRequired}
                      onValueChange={(value: 'Yes' | 'No') => updateField('groupDealApprovalRequired', value)}
                    >
                      <SelectTrigger className="h-10"><SelectValue placeholder="Approval required" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Yes">Approval required: Yes</SelectItem>
                        <SelectItem value="No">Approval required: No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h4 className="text-sm font-semibold text-slate-900">Verification Section</h4>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">
                    Ownership confirmation
                    <Checkbox
                      checked={form.ownershipDeclaration}
                      onCheckedChange={(value) => updateField('ownershipDeclaration', Boolean(value))}
                    />
                  </label>
                  <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">
                    Authorization confirmation
                    <Checkbox
                      checked={form.authorizationDeclaration}
                      onCheckedChange={(value) => updateField('authorizationDeclaration', Boolean(value))}
                    />
                  </label>
                  <Input value={form.builderDetails} onChange={(event) => updateField('builderDetails', event.target.value)} placeholder="Builder details (if builder)" className="h-10" />
                  <Input value={form.reraNumber} onChange={(event) => updateField('reraNumber', event.target.value.toUpperCase())} placeholder="RERA number (if applicable)" className="h-10" />
                </div>
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  <p>Builder Verified: In Progress</p>
                  <p>Ownership Check: In Progress</p>
                  <p>Government Reference: In Progress</p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h4 className="text-sm font-semibold text-slate-900">Contact Preferences</h4>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Input value={form.ownerName} onChange={(event) => updateField('ownerName', event.target.value)} placeholder="Contact person name" className="h-10" />
                  <PhoneVerificationField
                    phone={form.ownerPhone}
                    onPhoneChange={(value) => updateField('ownerPhone', value)}
                    verifiedToken={form.ownerPhoneVerificationId}
                    onVerifiedTokenChange={(value) => updateField('ownerPhoneVerificationId', value)}
                    purpose="sell"
                    title="Phone number (primary)"
                  />
                  <Input value={form.whatsapp} onChange={(event) => updateField('whatsapp', event.target.value)} placeholder="WhatsApp (optional)" className="h-10" />
                  <Select value={form.preferredContactTime} onValueChange={(value: ContactTime) => updateField('preferredContactTime', value)}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Preferred contact time" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Morning">Morning</SelectItem>
                      <SelectItem value="Afternoon">Afternoon</SelectItem>
                      <SelectItem value="Evening">Evening</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="mt-2 text-xs text-slate-600">Contact details are shared only with interested buyers.</p>
              </div>
            </div>
          )}

          {step === 8 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-slate-900">Step 8: Review & Submit</h3>
              <p className="text-sm text-slate-600">Review your listing summary and submit for verification review.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {reviewRows.map((row) => (
                  <div key={row.label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">{row.label}</p>
                    <p className="text-sm font-medium text-slate-900 break-words">{row.value}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                Verification notice: Listing is reviewed before publish. Edit any field before final submit.
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>Edit Listing</Button>
                <Button className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={isSubmitting} onClick={() => void submitForReview()}>
                  Submit for Review
                </Button>
              </div>
            </div>
          )}

          {error && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {error}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <Button variant="outline" onClick={previous} disabled={step === 1 || isSubmitting}>
              Previous
            </Button>
            <div className="flex flex-wrap gap-2">
              {step < 8 && (
                <Button onClick={next} disabled={isSubmitting} className="bg-slate-900 text-white hover:bg-slate-800">
                  Next Step
                </Button>
              )}
            </div>
          </div>
        </div>

        {canRenderSuccess && (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
            <h3 className="text-xl font-semibold text-emerald-900">Your property has been submitted and is under review.</h3>
            <p className="mt-2 text-sm text-emerald-800">Reference ID: {successRef}</p>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Button variant="outline" className="justify-start" onClick={() => onManageListings?.()}>
                Edit listing
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => onManageListings?.()}>
                Upload documents
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => onManageListings?.()}>
                Enable / disable group deal
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => onOpenLeads?.()}>
                View buyer enquiries
              </Button>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Button variant="outline" onClick={() => onOpenDashboard?.()}>Seller Dashboard</Button>
              <Button variant="outline" onClick={() => onManageListings?.()}>Manage Listings</Button>
              <Button variant="outline" onClick={() => onOpenAnalytics?.()}>Listing Performance</Button>
              <Button variant="outline" onClick={() => onOpenBuilderPlans?.()}>Upgrade to Builder Plans</Button>
            </div>
          </div>
        )}

        <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
          ZDT Realty is an independent real estate platform. Property information is provided by sellers/builders and published after review. Final transactions occur directly between buyers and sellers.
        </p>
      </div>
    </section>
  );
}
