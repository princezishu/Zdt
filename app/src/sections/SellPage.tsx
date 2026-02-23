import { useMemo, useState } from 'react';
import { BadgeCheck, Clock3, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import AmenitySelector from '@/components/realty/AmenitySelector';
import { LgdLocationAccuracyNote, LgdLocationInput } from '@/components/realty/LgdLocationInput';
import { DEFAULT_AMENITIES } from '@/lib/amenities';
import {
  type HelpConfig,
  type PropertyType,
} from '@/lib/workflowStore';
import { apiRequest } from '@/lib/http';
import { HelpBox, Hint, PhoneVerificationField, StepProgress, SuccessCard } from './workflow/CommonBlocks';

type SellStep = 1 | 2 | 3 | 4 | 5 | 6;

interface SellFormState {
  propertyType: PropertyType;
  ownerName: string;
  ownerPhone: string;
  ownerPhoneVerificationId: string;
  ownerEmail: string;
  city: string;
  locality: string;
  address: string;
  mapPin: string;
  plotArea: string;
  plotDimensions: string;
  plotRoadWidth: string;
  plotBoundaryWall: string;
  plotCorner: string;
  plotFacing: string;
  plotApprovals: string;
  plotLandmark: string;
  villaBhk: string;
  villaBuiltUpArea: string;
  villaLandArea: string;
  villaFurnished: string;
  villaParking: string;
  villaAge: string;
  villaGated: string;
  villaFacing: string;
  flatBhk: string;
  flatCarpetArea: string;
  flatFloor: string;
  flatTotalFloors: string;
  flatLift: string;
  flatParking: string;
  flatSociety: string;
  flatAge: string;
  flatFurnished: string;
  commercialType: string;
  commercialArea: string;
  commercialFloor: string;
  commercialFrontage: string;
  commercialWashroom: string;
  commercialParking: string;
  commercialPowerBackup: string;
  commercialSuitableFor: string;
  amenities: string[];
  expectedPrice: string;
  reraNumber: string;
  negotiable: 'Yes' | 'No';
  additionalCharges: string;
  vastuMainDoorDirection: string;
  vastuKitchenPlacement: string;
  vastuBedroomDirection: string;
  vastuToiletPlacement: string;
  images: File[];
  videos: File[];
  documents: File[];
}

const steps: string[] = [
  'Property Type',
  'Owner Details',
  'Location',
  'Type Details',
  'Price',
  'Media & Review',
];

const initialHelp: HelpConfig = {
  needHelp: false,
  preferredCallTime: 'Morning',
  helpType: 'Just call and guide me',
};

const initialForm: SellFormState = {
  propertyType: 'Plot',
  ownerName: '',
  ownerPhone: '',
  ownerPhoneVerificationId: '',
  ownerEmail: '',
  city: '',
  locality: '',
  address: '',
  mapPin: '',
  plotArea: '',
  plotDimensions: '',
  plotRoadWidth: '',
  plotBoundaryWall: 'No',
  plotCorner: 'No',
  plotFacing: 'North',
  plotApprovals: 'Any',
  plotLandmark: '',
  villaBhk: '3 BHK',
  villaBuiltUpArea: '',
  villaLandArea: '',
  villaFurnished: 'Semi-Furnished',
  villaParking: '1',
  villaAge: '1-5 Years',
  villaGated: 'Yes',
  villaFacing: 'East',
  flatBhk: '2 BHK',
  flatCarpetArea: '',
  flatFloor: '',
  flatTotalFloors: '',
  flatLift: 'Yes',
  flatParking: 'Yes',
  flatSociety: '',
  flatAge: '1-5 Years',
  flatFurnished: 'Semi-Furnished',
  commercialType: 'Office',
  commercialArea: '',
  commercialFloor: '',
  commercialFrontage: '',
  commercialWashroom: 'Attached',
  commercialParking: 'Yes',
  commercialPowerBackup: 'Yes',
  commercialSuitableFor: '',
  amenities: [],
  expectedPrice: '',
  reraNumber: '',
  negotiable: 'Yes',
  additionalCharges: '',
  vastuMainDoorDirection: 'East',
  vastuKitchenPlacement: 'South-East',
  vastuBedroomDirection: 'South-West',
  vastuToiletPlacement: 'West',
  images: [],
  videos: [],
  documents: [],
};

function isPhoneValid(value: string): boolean {
  return /^\d{10,15}$/.test(value);
}

function calculateVastuScore(form: SellFormState): number {
  let score = 68;
  if (form.vastuMainDoorDirection === 'East' || form.vastuMainDoorDirection === 'North') {
    score += 8;
  }
  if (form.vastuKitchenPlacement === 'South-East') {
    score += 8;
  }
  if (form.vastuBedroomDirection === 'South-West') {
    score += 8;
  }
  if (form.vastuToiletPlacement === 'West' || form.vastuToiletPlacement === 'North-West') {
    score += 6;
  }
  return Math.min(score, 95);
}

function getTypeDetails(form: SellFormState): Record<string, string | boolean | number> {
  if (form.propertyType === 'Plot') {
    return {
      plotArea: form.plotArea || 'NA',
      dimensions: form.plotDimensions || 'NA',
      roadWidth: form.plotRoadWidth || 'NA',
      boundaryWall: form.plotBoundaryWall,
      cornerPlot: form.plotCorner,
      facing: form.plotFacing,
      approvals: form.plotApprovals,
      landmark: form.plotLandmark || 'NA',
    };
  }
  if (form.propertyType === 'Villa') {
    return {
      bhk: form.villaBhk,
      builtUpArea: form.villaBuiltUpArea || 'NA',
      landArea: form.villaLandArea || 'NA',
      furnished: form.villaFurnished,
      parking: form.villaParking,
      age: form.villaAge,
      gatedCommunity: form.villaGated,
      facing: form.villaFacing,
    };
  }
  if (form.propertyType === 'Flat / Apartment') {
    return {
      bhk: form.flatBhk,
      carpetArea: form.flatCarpetArea || 'NA',
      floor: form.flatFloor || 'NA',
      totalFloors: form.flatTotalFloors || 'NA',
      lift: form.flatLift,
      parking: form.flatParking,
      society: form.flatSociety || 'NA',
      age: form.flatAge,
      furnished: form.flatFurnished,
    };
  }
  return {
    type: form.commercialType,
    area: form.commercialArea || 'NA',
    floor: form.commercialFloor || 'NA',
    frontage: form.commercialFrontage || 'NA',
    washroom: form.commercialWashroom,
    parking: form.commercialParking,
    powerBackup: form.commercialPowerBackup,
    suitableFor: form.commercialSuitableFor || 'NA',
  };
}

export default function SellPage() {
  const [step, setStep] = useState<SellStep>(1);
  const [form, setForm] = useState<SellFormState>(initialForm);
  const [help, setHelp] = useState<HelpConfig>(initialHelp);
  const [error, setError] = useState('');
  const [successRef, setSuccessRef] = useState('');
  const [draftRef, setDraftRef] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const assistedListing = help.needHelp && help.helpType === 'Team should add my property for me';
  const vastuScore = calculateVastuScore(form);

  const benefitItems = [
    { icon: BadgeCheck, label: 'Verified Buyers' },
    { icon: Clock3, label: 'Quick Approval' },
    { icon: Sparkles, label: 'Smart Pricing Suggestions' },
    { icon: ShieldCheck, label: 'Secure Transactions' },
  ];

  const reviewRows = useMemo(() => {
    const rows: Array<{ label: string; value: string }> = [
      { label: 'Owner', value: form.ownerName || '-' },
      { label: 'Phone', value: form.ownerPhone || '-' },
      { label: 'Email', value: form.ownerEmail || '-' },
      { label: 'Property Type', value: form.propertyType },
      { label: 'Location', value: `${form.locality || '-'}, ${form.city || '-'}` },
      { label: 'Address', value: form.address || '-' },
      {
        label: 'Expected Price',
        value: form.expectedPrice ? `Rs ${Number(form.expectedPrice).toLocaleString('en-IN')}` : '-',
      },
      { label: 'RERA Number', value: form.reraNumber || '-' },
      { label: 'Negotiable', value: form.negotiable },
      { label: 'Vastu Score Preview', value: `${vastuScore}%` },
      { label: 'Assisted Listing', value: assistedListing ? 'Yes' : 'No' },
    ];
    const details = getTypeDetails(form);
    Object.entries(details).forEach(([key, value]) => {
      rows.push({ label: key, value: String(value) });
    });
    rows.push({
      label: 'Amenities',
      value: form.amenities.length > 0 ? form.amenities.join(', ') : '-',
    });
    rows.push({ label: 'Images', value: `${form.images.length} file(s)` });
    rows.push({ label: 'Videos', value: `${form.videos.length} file(s)` });
    rows.push({ label: 'Documents', value: `${form.documents.length} file(s)` });
    return rows;
  }, [assistedListing, form, vastuScore]);

  const updateField = <K extends keyof SellFormState>(key: K, value: SellFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const openMapPicker = () => {
    const query = encodeURIComponent(`${form.address || ''} ${form.locality || ''} ${form.city || ''}`);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
  };

  const setFiles = (key: 'images' | 'videos' | 'documents', files: FileList | null) => {
    updateField(key, Array.from(files ?? []));
  };

  const validateStep = (): boolean => {
    if (step === 1 && !form.propertyType) {
      setError('Please select property type.');
      return false;
    }
    if (step === 2) {
      if (!form.ownerName.trim()) {
        setError('Owner name is required.');
        return false;
      }
      if (!isPhoneValid(form.ownerPhone)) {
        setError('Owner phone must be a valid number.');
        return false;
      }
      if (!form.ownerPhoneVerificationId) {
        setError('Please verify owner phone using OTP.');
        return false;
      }
    }
    if (step === 3) {
      if (!form.city.trim() || !form.locality.trim()) {
        setError('City and locality are required.');
        return false;
      }
      if (!assistedListing && !form.address.trim()) {
        setError('Address is required unless Assisted Listing is enabled.');
        return false;
      }
    }
    if (step === 4) {
      if (form.amenities.length === 0) {
        setError('Please select at least one amenity.');
        return false;
      }
      if (!assistedListing) {
        if (form.propertyType === 'Plot' && !form.plotArea.trim()) {
          setError('Plot area is required.');
          return false;
        }
        if (form.propertyType === 'Villa' && !form.villaBuiltUpArea.trim()) {
          setError('Villa built-up area is required.');
          return false;
        }
        if (form.propertyType === 'Flat / Apartment' && !form.flatCarpetArea.trim()) {
          setError('Flat carpet area is required.');
          return false;
        }
        if (form.propertyType === 'Commercial' && !form.commercialArea.trim()) {
          setError('Commercial area is required.');
          return false;
        }
      }
    }
    if (step === 5 && !assistedListing && !form.expectedPrice.trim()) {
      setError('Expected price is required.');
      return false;
    }
    setError('');
    return true;
  };

  const next = () => {
    if (!validateStep()) return;
    setStep((prev) => (prev < 6 ? ((prev + 1) as SellStep) : prev));
  };

  const previous = () => {
    setError('');
    setStep((prev) => (prev > 1 ? ((prev - 1) as SellStep) : prev));
  };

  const saveListing = async (stage: 'Draft' | 'Pending Approval') => {
    const minimalReady =
      form.ownerName.trim() &&
      isPhoneValid(form.ownerPhone) &&
      Boolean(form.ownerPhoneVerificationId) &&
      form.city.trim() &&
      form.locality.trim() &&
      form.propertyType;
    if (!minimalReady) {
      setError('Please fill owner name, verified phone, property type, city and locality.');
      return;
    }
    if (form.amenities.length === 0) {
      setError('Please select at least one amenity.');
      return;
    }
    if (stage === 'Pending Approval' && !assistedListing && !form.expectedPrice.trim()) {
      setError('Expected price is required to submit.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await apiRequest<{ referenceId: string }>('/workflow/public/sell', {
        method: 'POST',
        body: JSON.stringify({
          requesterName: form.ownerName.trim(),
          phone: form.ownerPhone,
          phoneVerificationId: form.ownerPhoneVerificationId,
          email: form.ownerEmail.trim() || undefined,
          city: form.city.trim(),
          locality: form.locality.trim(),
          propertyType: form.propertyType,
          address: form.address.trim(),
          mapPin: form.mapPin.trim(),
          pricing: {
            expectedPrice: Number(form.expectedPrice || '0'),
            negotiable: form.negotiable,
            additionalCharges: form.additionalCharges.trim(),
            reraNumber: form.reraNumber.trim(),
          },
          details: assistedListing
            ? {
                amenities: form.amenities,
              }
            : {
                ...getTypeDetails(form),
                amenities: form.amenities,
                vastu: {
                  mainDoorDirection: form.vastuMainDoorDirection,
                  kitchenPlacement: form.vastuKitchenPlacement,
                  bedroomDirection: form.vastuBedroomDirection,
                  toiletPlacement: form.vastuToiletPlacement,
                  scorePreview: vastuScore,
                },
                media: {
                  imageCount: form.images.length,
                  hasVideo: form.videos.length > 0,
                  hasDocuments: form.documents.length > 0,
                },
              },
          help: {
            needHelp: help.needHelp,
            preferredCallTime: help.preferredCallTime,
            helpType: help.helpType,
          },
          draft: stage === 'Draft',
        }),
      });

      if (stage === 'Draft') {
        setDraftRef(response.referenceId);
        setSuccessRef('');
        setForm((prev) => ({ ...prev, ownerPhoneVerificationId: '' }));
      } else {
        setSuccessRef(response.referenceId);
        setDraftRef('');
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save listing');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="min-h-screen pt-28 pb-16 text-slate-900">
      <div className="page-container zdt-page-stack">
        <div className="zdt-panel-hero relative overflow-hidden rounded-3xl border border-white/20 bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 p-6 text-white shadow-2xl">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">ZDT Realty Seller Suite</p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Sell Your Property Faster & Smarter</h1>
          <p className="mt-2 max-w-2xl text-sm text-white/85">
            Professional seller dashboard workflow with fast approval, premium guidance and secure handling.
          </p>
          <Button
            onClick={() => setStep(1)}
            className="mt-4 bg-cyan-400 px-6 text-sm font-semibold text-slate-900 hover:bg-cyan-300"
          >
            Post Property FREE
          </Button>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {benefitItems.map((item) => (
              <div key={item.label} className="rounded-xl border border-cyan-200/40 bg-white/10 px-3 py-2 text-sm">
                <p className="inline-flex items-center gap-2">
                  <item.icon className="h-4 w-4 text-cyan-200" />
                  {item.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="zdt-panel rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          <p className="font-semibold text-slate-900">Listing Status Flow</p>
          <p className="mt-1">Draft to Pending Approval to Approved / Rejected</p>
          <p className="mt-1 text-xs text-slate-500">
            Duplicate property detection, media review, and admin approval are mandatory before publish.
          </p>
        </div>

        <StepProgress
          title="Post Property for Sale"
          subtitle="Simple guided steps. Questions change based on selected property type."
          step={step}
          totalSteps={steps.length}
          steps={steps}
        />

        <div className="zdt-panel rounded-3xl border border-white/20 bg-white/95 p-5 shadow-xl sm:p-6">
          {step === 1 && (
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Choose Property Type</h2>
              <p className="mt-1 text-sm text-slate-600">Only related fields will appear in later steps.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {(['Plot', 'Villa', 'Flat / Apartment', 'Commercial'] as PropertyType[]).map((type) => (
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
                    <p className="mt-1 text-xs text-slate-600">Adaptive form enabled</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Owner Details</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <Input
                    value={form.ownerName}
                    onChange={(event) => updateField('ownerName', event.target.value)}
                    placeholder="Owner Name"
                    className="h-11 bg-white"
                  />
                  <Hint>Example: Mohammed Khan</Hint>
                </div>
                <div className="sm:col-span-2">
                  <PhoneVerificationField
                    phone={form.ownerPhone}
                    onPhoneChange={(value) => updateField('ownerPhone', value)}
                    verifiedToken={form.ownerPhoneVerificationId}
                    onVerifiedTokenChange={(value) => updateField('ownerPhoneVerificationId', value)}
                    purpose="sell"
                    title="Verify owner phone (OTP required)"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    value={form.ownerEmail}
                    onChange={(event) => updateField('ownerEmail', event.target.value)}
                    placeholder="Email (Optional)"
                    className="h-11 bg-white"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Property Type + Location</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <LgdLocationInput
                  value={form.city}
                  onChange={(value) => updateField('city', value)}
                  placeholder="City"
                  className="h-11 bg-white"
                  suggestKind="india"
                  indiaValueField="village"
                />
                <LgdLocationInput
                  value={form.locality}
                  onChange={(value) => updateField('locality', value)}
                  placeholder="Locality"
                  className="h-11 bg-white"
                  suggestKind="india"
                  indiaValueField="subdistrict"
                />
                <Input
                  value={form.address}
                  onChange={(event) => updateField('address', event.target.value)}
                  placeholder="Address"
                  className="h-11 bg-white sm:col-span-2"
                />
                <Input
                  value={form.mapPin}
                  onChange={(event) => updateField('mapPin', event.target.value)}
                  placeholder="Map Pin / Coordinates (Optional)"
                  className="h-11 bg-white sm:col-span-2"
                />
                <div className="sm:col-span-2">
                  <LgdLocationAccuracyNote />
                </div>
              </div>
              <Button variant="outline" className="mt-3 border-slate-300" onClick={openMapPicker}>
                Open Google Map Picker
              </Button>
            </div>
          )}

          {step === 4 && (
            <div>
              <h2 className="text-xl font-semibold text-slate-900">{form.propertyType} Details</h2>
              <p className="mt-1 text-sm text-slate-600">Only fields relevant to selected type are shown.</p>

              {form.propertyType === 'Plot' && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Input
                    value={form.plotArea}
                    onChange={(event) => updateField('plotArea', event.target.value.replace(/\D/g, ''))}
                    placeholder="Plot Area (sq.ft)"
                    className="h-11 bg-white"
                  />
                  <Input
                    value={form.plotDimensions}
                    onChange={(event) => updateField('plotDimensions', event.target.value)}
                    placeholder="Dimensions (optional)"
                    className="h-11 bg-white"
                  />
                  <Input
                    value={form.plotRoadWidth}
                    onChange={(event) => updateField('plotRoadWidth', event.target.value.replace(/\D/g, ''))}
                    placeholder="Road Width (ft)"
                    className="h-11 bg-white"
                  />
                  <Select value={form.plotBoundaryWall} onValueChange={(value) => updateField('plotBoundaryWall', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900"><SelectValue placeholder="Boundary / Wall" /></SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Yes">Boundary / Wall: Yes</SelectItem>
                      <SelectItem value="No">Boundary / Wall: No</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={form.plotCorner} onValueChange={(value) => updateField('plotCorner', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900"><SelectValue placeholder="Corner Plot" /></SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Yes">Corner Plot: Yes</SelectItem>
                      <SelectItem value="No">Corner Plot: No</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={form.plotFacing} onValueChange={(value) => updateField('plotFacing', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900"><SelectValue placeholder="Facing" /></SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="North">North</SelectItem>
                      <SelectItem value="East">East</SelectItem>
                      <SelectItem value="South">South</SelectItem>
                      <SelectItem value="West">West</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={form.plotApprovals} onValueChange={(value) => updateField('plotApprovals', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900"><SelectValue placeholder="Approvals" /></SelectTrigger>
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
                    placeholder="Nearby Landmark"
                    className="h-11 bg-white sm:col-span-2 lg:col-span-3"
                  />
                </div>
              )}

              {form.propertyType === 'Villa' && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Select value={form.villaBhk} onValueChange={(value) => updateField('villaBhk', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900"><SelectValue placeholder="BHK" /></SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="2 BHK">2 BHK</SelectItem>
                      <SelectItem value="3 BHK">3 BHK</SelectItem>
                      <SelectItem value="4 BHK">4 BHK</SelectItem>
                      <SelectItem value="5+ BHK">5+ BHK</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={form.villaBuiltUpArea}
                    onChange={(event) => updateField('villaBuiltUpArea', event.target.value.replace(/\D/g, ''))}
                    placeholder="Built-up Area (sq.ft)"
                    className="h-11 bg-white"
                  />
                  <Input
                    value={form.villaLandArea}
                    onChange={(event) => updateField('villaLandArea', event.target.value.replace(/\D/g, ''))}
                    placeholder="Land Area (sq.ft)"
                    className="h-11 bg-white"
                  />
                  <Select value={form.villaFurnished} onValueChange={(value) => updateField('villaFurnished', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900"><SelectValue placeholder="Furnished" /></SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Unfurnished">Unfurnished</SelectItem>
                      <SelectItem value="Semi-Furnished">Semi-Furnished</SelectItem>
                      <SelectItem value="Fully Furnished">Fully Furnished</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={form.villaParking} onValueChange={(value) => updateField('villaParking', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900"><SelectValue placeholder="Parking" /></SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="1">1 Slot</SelectItem>
                      <SelectItem value="2">2 Slots</SelectItem>
                      <SelectItem value="3+">3+ Slots</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={form.villaAge} onValueChange={(value) => updateField('villaAge', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900"><SelectValue placeholder="Age" /></SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Ready to Move">Ready to Move</SelectItem>
                      <SelectItem value="1-5 Years">1-5 Years</SelectItem>
                      <SelectItem value="5-10 Years">5-10 Years</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={form.villaGated} onValueChange={(value) => updateField('villaGated', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900"><SelectValue placeholder="Gated Community" /></SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Yes">Yes</SelectItem>
                      <SelectItem value="No">No</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={form.villaFacing} onValueChange={(value) => updateField('villaFacing', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900"><SelectValue placeholder="Facing" /></SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="North">North</SelectItem>
                      <SelectItem value="East">East</SelectItem>
                      <SelectItem value="South">South</SelectItem>
                      <SelectItem value="West">West</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {form.propertyType === 'Flat / Apartment' && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Select value={form.flatBhk} onValueChange={(value) => updateField('flatBhk', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900"><SelectValue placeholder="BHK" /></SelectTrigger>
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
                  <Input
                    value={form.flatFloor}
                    onChange={(event) => updateField('flatFloor', event.target.value.replace(/\D/g, ''))}
                    placeholder="Floor"
                    className="h-11 bg-white"
                  />
                  <Input
                    value={form.flatTotalFloors}
                    onChange={(event) => updateField('flatTotalFloors', event.target.value.replace(/\D/g, ''))}
                    placeholder="Total Floors"
                    className="h-11 bg-white"
                  />
                  <Select value={form.flatLift} onValueChange={(value) => updateField('flatLift', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900"><SelectValue placeholder="Lift" /></SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Yes">Lift: Yes</SelectItem>
                      <SelectItem value="No">Lift: No</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={form.flatParking} onValueChange={(value) => updateField('flatParking', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900"><SelectValue placeholder="Parking" /></SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Yes">Parking: Yes</SelectItem>
                      <SelectItem value="No">Parking: No</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={form.flatSociety}
                    onChange={(event) => updateField('flatSociety', event.target.value)}
                    placeholder="Society Name"
                    className="h-11 bg-white"
                  />
                  <Select value={form.flatAge} onValueChange={(value) => updateField('flatAge', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900"><SelectValue placeholder="Age" /></SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="New">New</SelectItem>
                      <SelectItem value="1-5 Years">1-5 Years</SelectItem>
                      <SelectItem value="5+ Years">5+ Years</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={form.flatFurnished} onValueChange={(value) => updateField('flatFurnished', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900"><SelectValue placeholder="Furnished" /></SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Unfurnished">Unfurnished</SelectItem>
                      <SelectItem value="Semi-Furnished">Semi-Furnished</SelectItem>
                      <SelectItem value="Fully Furnished">Fully Furnished</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {form.propertyType === 'Commercial' && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Select value={form.commercialType} onValueChange={(value) => updateField('commercialType', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900"><SelectValue placeholder="Type" /></SelectTrigger>
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
                    value={form.commercialFloor}
                    onChange={(event) => updateField('commercialFloor', event.target.value.replace(/\D/g, ''))}
                    placeholder="Floor"
                    className="h-11 bg-white"
                  />
                  <Input
                    value={form.commercialFrontage}
                    onChange={(event) => updateField('commercialFrontage', event.target.value.replace(/\D/g, ''))}
                    placeholder="Frontage (ft)"
                    className="h-11 bg-white"
                  />
                  <Select value={form.commercialWashroom} onValueChange={(value) => updateField('commercialWashroom', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900"><SelectValue placeholder="Washroom" /></SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Attached">Attached</SelectItem>
                      <SelectItem value="Shared">Shared</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={form.commercialParking} onValueChange={(value) => updateField('commercialParking', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900"><SelectValue placeholder="Parking" /></SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Yes">Yes</SelectItem>
                      <SelectItem value="No">No</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={form.commercialPowerBackup} onValueChange={(value) => updateField('commercialPowerBackup', value)}>
                    <SelectTrigger className="h-11 bg-white text-slate-900"><SelectValue placeholder="Power Backup" /></SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Yes">Yes</SelectItem>
                      <SelectItem value="No">No</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={form.commercialSuitableFor}
                    onChange={(event) => updateField('commercialSuitableFor', event.target.value)}
                    placeholder="Suitable for (office/shop/etc)"
                    className="h-11 bg-white sm:col-span-2 lg:col-span-3"
                  />
                </div>
              )}

              <div className="mt-4">
                <AmenitySelector
                  title="Amenities"
                  options={DEFAULT_AMENITIES}
                  selected={form.amenities}
                  onChange={(next) => updateField('amenities', next)}
                  required
                />
              </div>
            </div>
          )}

          {step === 5 && (
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Price & Vastu Snapshot</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <Input
                    value={form.expectedPrice}
                    onChange={(event) => updateField('expectedPrice', event.target.value.replace(/\D/g, ''))}
                    placeholder="Expected Price (INR)"
                    className="h-11 bg-white"
                  />
                  <Hint>Example: 7500000</Hint>
                </div>
                <Select value={form.negotiable} onValueChange={(value) => updateField('negotiable', value as 'Yes' | 'No')}>
                  <SelectTrigger className="h-11 bg-white text-slate-900"><SelectValue placeholder="Negotiable" /></SelectTrigger>
                  <SelectContent className="bg-white text-slate-900">
                    <SelectItem value="Yes">Negotiable: Yes</SelectItem>
                    <SelectItem value="No">Negotiable: No</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={form.reraNumber}
                  onChange={(event) => updateField('reraNumber', event.target.value.toUpperCase())}
                  placeholder="RERA Number (Optional)"
                  className="h-11 bg-white"
                />
                <Textarea
                  value={form.additionalCharges}
                  onChange={(event) => updateField('additionalCharges', event.target.value)}
                  placeholder="Additional Charges (Optional)"
                  className="min-h-20 bg-white sm:col-span-2"
                />
                <Select
                  value={form.vastuMainDoorDirection}
                  onValueChange={(value) => updateField('vastuMainDoorDirection', value)}
                >
                  <SelectTrigger className="h-11 bg-white text-slate-900">
                    <SelectValue placeholder="Main Door Direction" />
                  </SelectTrigger>
                  <SelectContent className="bg-white text-slate-900">
                    <SelectItem value="North">Main Door: North</SelectItem>
                    <SelectItem value="East">Main Door: East</SelectItem>
                    <SelectItem value="South">Main Door: South</SelectItem>
                    <SelectItem value="West">Main Door: West</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={form.vastuKitchenPlacement}
                  onValueChange={(value) => updateField('vastuKitchenPlacement', value)}
                >
                  <SelectTrigger className="h-11 bg-white text-slate-900">
                    <SelectValue placeholder="Kitchen Placement" />
                  </SelectTrigger>
                  <SelectContent className="bg-white text-slate-900">
                    <SelectItem value="South-East">Kitchen: South-East</SelectItem>
                    <SelectItem value="North-West">Kitchen: North-West</SelectItem>
                    <SelectItem value="East">Kitchen: East</SelectItem>
                    <SelectItem value="Other">Kitchen: Other</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={form.vastuBedroomDirection}
                  onValueChange={(value) => updateField('vastuBedroomDirection', value)}
                >
                  <SelectTrigger className="h-11 bg-white text-slate-900">
                    <SelectValue placeholder="Bedroom Direction" />
                  </SelectTrigger>
                  <SelectContent className="bg-white text-slate-900">
                    <SelectItem value="South-West">Bedroom: South-West</SelectItem>
                    <SelectItem value="West">Bedroom: West</SelectItem>
                    <SelectItem value="North">Bedroom: North</SelectItem>
                    <SelectItem value="Other">Bedroom: Other</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={form.vastuToiletPlacement}
                  onValueChange={(value) => updateField('vastuToiletPlacement', value)}
                >
                  <SelectTrigger className="h-11 bg-white text-slate-900">
                    <SelectValue placeholder="Toilet Placement" />
                  </SelectTrigger>
                  <SelectContent className="bg-white text-slate-900">
                    <SelectItem value="West">Toilet: West</SelectItem>
                    <SelectItem value="North-West">Toilet: North-West</SelectItem>
                    <SelectItem value="South">Toilet: South</SelectItem>
                    <SelectItem value="Other">Toilet: Other</SelectItem>
                  </SelectContent>
                </Select>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 sm:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Vastu Score Preview</p>
                  <p className="mt-1 text-sm font-semibold text-emerald-900">{vastuScore}% compatible</p>
                </div>
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-slate-900">Photos/Videos/Documents + Review</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm">
                  <p className="font-semibold text-slate-900">Property Images</p>
                  <p className="mt-1 text-xs text-slate-600">Drag-drop or browse image files</p>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    className="mt-3 block w-full text-xs"
                    onChange={(event) => setFiles('images', event.target.files)}
                  />
                  <p className="mt-2 text-xs text-slate-700">{form.images.length} file(s)</p>
                </label>

                <label className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm">
                  <p className="font-semibold text-slate-900">Property Video</p>
                  <p className="mt-1 text-xs text-slate-600">Upload one or more videos</p>
                  <input
                    type="file"
                    multiple
                    accept="video/*"
                    className="mt-3 block w-full text-xs"
                    onChange={(event) => setFiles('videos', event.target.files)}
                  />
                  <p className="mt-2 text-xs text-slate-700">{form.videos.length} file(s)</p>
                </label>

                <label className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm">
                  <p className="font-semibold text-slate-900">Documents</p>
                  <p className="mt-1 text-xs text-slate-600">Layout map, approvals, floor plan, etc.</p>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,image/*"
                    className="mt-3 block w-full text-xs"
                    onChange={(event) => setFiles('documents', event.target.files)}
                  />
                  <p className="mt-2 text-xs text-slate-700">{form.documents.length} file(s)</p>
                </label>
              </div>

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

          {draftRef && (
            <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">
              Draft saved. Reference ID: {draftRef}
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
            <div className="flex flex-wrap gap-2">
              {step < 6 && (
                <Button onClick={next} className="bg-blue-700 text-white hover:bg-blue-800">
                  Next Step
                </Button>
              )}
              {step === 6 && (
                <>
                  <Button variant="outline" disabled={isSubmitting} onClick={() => saveListing('Draft')}>
                    Save Draft
                  </Button>
                  <Button disabled={isSubmitting} onClick={() => saveListing('Pending Approval')} className="bg-emerald-600 text-white hover:bg-emerald-700">
                    Submit (Pending Approval)
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
