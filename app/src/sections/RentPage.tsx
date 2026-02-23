import { useMemo, useState } from 'react';
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

type RentStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

interface RentFormState {
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
  plotRoadWidth: string;
  plotCorner: string;
  plotFacing: string;
  villaBhk: string;
  villaBuiltUpArea: string;
  villaLandArea: string;
  villaFurnished: string;
  villaParking: string;
  villaAge: string;
  villaGated: string;
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
  monthlyRent: string;
  securityDeposit: string;
  maintenance: 'Included' | 'Separate';
  availableFrom: string;
  leaseDuration: string;
  tenantType: 'Family' | 'Bachelor' | 'Both';
  petsAllowed: 'Yes' | 'No';
  preferredFurnishing: 'Unfurnished' | 'Semi-Furnished' | 'Fully Furnished' | 'Any';
  tenantParking: 'Yes' | 'No' | 'Any';
  rules: string;
  vastuMainDoorDirection: string;
  vastuKitchenPlacement: string;
  vastuBedroomDirection: string;
  vastuToiletPlacement: string;
  images: File[];
  videos: File[];
}

const steps: string[] = [
  'Property Type',
  'Owner Details',
  'Location',
  'Type Details',
  'Rent Details',
  'Tenant Preference',
  'Media & Review',
];

const initialHelp: HelpConfig = {
  needHelp: false,
  preferredCallTime: 'Morning',
  helpType: 'Just call and guide me',
};

const initialForm: RentFormState = {
  propertyType: 'Flat / Apartment',
  ownerName: '',
  ownerPhone: '',
  ownerPhoneVerificationId: '',
  ownerEmail: '',
  city: '',
  locality: '',
  address: '',
  mapPin: '',
  plotArea: '',
  plotRoadWidth: '',
  plotCorner: 'No',
  plotFacing: 'North',
  villaBhk: '3 BHK',
  villaBuiltUpArea: '',
  villaLandArea: '',
  villaFurnished: 'Semi-Furnished',
  villaParking: '1',
  villaAge: '1-5 Years',
  villaGated: 'Yes',
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
  monthlyRent: '',
  securityDeposit: '',
  maintenance: 'Included',
  availableFrom: '',
  leaseDuration: 'Long-term',
  tenantType: 'Both',
  petsAllowed: 'No',
  preferredFurnishing: 'Any',
  tenantParking: 'Any',
  rules: '',
  vastuMainDoorDirection: 'East',
  vastuKitchenPlacement: 'South-East',
  vastuBedroomDirection: 'South-West',
  vastuToiletPlacement: 'West',
  images: [],
  videos: [],
};

function isPhoneValid(value: string): boolean {
  return /^\d{10,15}$/.test(value);
}

function calculateVastuScore(form: RentFormState): number {
  let score = 66;
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
  return Math.min(score, 94);
}

function getTypeDetails(form: RentFormState): Record<string, string | boolean | number> {
  if (form.propertyType === 'Plot') {
    return {
      plotArea: form.plotArea || 'NA',
      roadWidth: form.plotRoadWidth || 'NA',
      cornerPlot: form.plotCorner,
      facing: form.plotFacing,
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

export default function RentPage() {
  const [step, setStep] = useState<RentStep>(1);
  const [form, setForm] = useState<RentFormState>(initialForm);
  const [help, setHelp] = useState<HelpConfig>(initialHelp);
  const [error, setError] = useState('');
  const [successRef, setSuccessRef] = useState('');
  const [draftRef, setDraftRef] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const assistedListing = help.needHelp && help.helpType === 'Team should add my property for me';
  const vastuScore = calculateVastuScore(form);

  const reviewRows = useMemo(() => {
    const rows: Array<{ label: string; value: string }> = [
      { label: 'Owner', value: form.ownerName || '-' },
      { label: 'Phone', value: form.ownerPhone || '-' },
      { label: 'Property Type', value: form.propertyType },
      { label: 'Location', value: `${form.locality || '-'}, ${form.city || '-'}` },
      {
        label: 'Monthly Rent',
        value: form.monthlyRent ? `Rs ${Number(form.monthlyRent).toLocaleString('en-IN')}` : '-',
      },
      {
        label: 'Security Deposit',
        value: form.securityDeposit ? `Rs ${Number(form.securityDeposit).toLocaleString('en-IN')}` : '-',
      },
      { label: 'Maintenance', value: form.maintenance },
      { label: 'Available From', value: form.availableFrom || '-' },
      { label: 'Lease Duration', value: form.leaseDuration },
      { label: 'Tenant Type', value: form.tenantType },
      { label: 'Pets Allowed', value: form.petsAllowed },
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
    return rows;
  }, [assistedListing, form, vastuScore]);

  const updateField = <K extends keyof RentFormState>(key: K, value: RentFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const setFiles = (key: 'images' | 'videos', files: FileList | null) => {
    updateField(key, Array.from(files ?? []));
  };

  const openMapPicker = () => {
    const query = encodeURIComponent(`${form.address || ''} ${form.locality || ''} ${form.city || ''}`);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
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
        setError('Owner phone must be valid.');
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
    if (step === 5 && !assistedListing && !form.monthlyRent.trim()) {
      setError('Monthly rent is required.');
      return false;
    }
    setError('');
    return true;
  };

  const next = () => {
    if (!validateStep()) return;
    setStep((prev) => (prev < 7 ? ((prev + 1) as RentStep) : prev));
  };

  const previous = () => {
    setError('');
    setStep((prev) => (prev > 1 ? ((prev - 1) as RentStep) : prev));
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
    if (stage === 'Pending Approval' && !assistedListing && !form.monthlyRent.trim()) {
      setError('Monthly rent is required to submit.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await apiRequest<{ referenceId: string }>('/workflow/public/rent', {
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
            monthlyRent: Number(form.monthlyRent || '0'),
            securityDeposit: Number(form.securityDeposit || '0'),
            maintenance: form.maintenance,
            availableFrom: form.availableFrom || null,
            leaseDuration: form.leaseDuration,
          },
          details: assistedListing
            ? {
                amenities: form.amenities,
              }
            : {
                ...getTypeDetails(form),
                amenities: form.amenities,
                tenantPreference: {
                  tenantType: form.tenantType,
                  petsAllowed: form.petsAllowed,
                  preferredFurnishing: form.preferredFurnishing,
                  parking: form.tenantParking,
                  rules: form.rules || 'NA',
                },
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
                  hasDocuments: false,
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
      setError(saveError instanceof Error ? saveError.message : 'Unable to save rent listing');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="min-h-screen pt-28 pb-16 text-slate-900">
      <div className="page-container zdt-page-stack">
        <StepProgress
          title="Post Property for Rent"
          subtitle="Simple rent-first workflow with adaptive questions and quick support."
          step={step}
          totalSteps={steps.length}
          steps={steps}
        />

        <div className="zdt-panel rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          <p className="font-semibold text-slate-900">Listing Status Flow</p>
          <p className="mt-1">Draft to Pending Approval to Approved</p>
          <p className="mt-1 text-xs text-slate-500">
            Assisted listings are routed to Team first and then to Admin for approval.
          </p>
        </div>

        <div className="zdt-panel rounded-3xl border border-white/20 bg-white/95 p-5 shadow-xl sm:p-6">
          {step === 1 && (
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Choose Property Type</h2>
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
                    <p className="mt-1 text-xs text-slate-600">Adaptive fields enabled</p>
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
                  <Hint>Example: Asha Verma</Hint>
                </div>
                <div className="sm:col-span-2">
                  <PhoneVerificationField
                    phone={form.ownerPhone}
                    onPhoneChange={(value) => updateField('ownerPhone', value)}
                    verifiedToken={form.ownerPhoneVerificationId}
                    onVerifiedTokenChange={(value) => updateField('ownerPhoneVerificationId', value)}
                    purpose="rent"
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

              {form.propertyType === 'Plot' && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Input
                    value={form.plotArea}
                    onChange={(event) => updateField('plotArea', event.target.value.replace(/\D/g, ''))}
                    placeholder="Plot Area (sq.ft)"
                    className="h-11 bg-white"
                  />
                  <Input
                    value={form.plotRoadWidth}
                    onChange={(event) => updateField('plotRoadWidth', event.target.value.replace(/\D/g, ''))}
                    placeholder="Road Width (ft)"
                    className="h-11 bg-white"
                  />
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
                </div>
              )}

              {form.propertyType === 'Villa' && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                    placeholder="Built-up Area"
                    className="h-11 bg-white"
                  />
                  <Input
                    value={form.villaLandArea}
                    onChange={(event) => updateField('villaLandArea', event.target.value.replace(/\D/g, ''))}
                    placeholder="Land Area"
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
                </div>
              )}

              {form.propertyType === 'Flat / Apartment' && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                    placeholder="Carpet Area"
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
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                    placeholder="Area"
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
                    placeholder="Frontage"
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
                    placeholder="Suitable For"
                    className="h-11 bg-white"
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
              <h2 className="text-xl font-semibold text-slate-900">Rent Details</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <Input
                    value={form.monthlyRent}
                    onChange={(event) => updateField('monthlyRent', event.target.value.replace(/\D/g, ''))}
                    placeholder="Monthly Rent"
                    className="h-11 bg-white"
                  />
                  <Hint>Example: 25000</Hint>
                </div>
                <Input
                  value={form.securityDeposit}
                  onChange={(event) => updateField('securityDeposit', event.target.value.replace(/\D/g, ''))}
                  placeholder="Security Deposit"
                  className="h-11 bg-white"
                />
                <Select value={form.maintenance} onValueChange={(value) => updateField('maintenance', value as 'Included' | 'Separate')}>
                  <SelectTrigger className="h-11 bg-white text-slate-900"><SelectValue placeholder="Maintenance" /></SelectTrigger>
                  <SelectContent className="bg-white text-slate-900">
                    <SelectItem value="Included">Included</SelectItem>
                    <SelectItem value="Separate">Separate</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={form.availableFrom}
                  onChange={(event) => updateField('availableFrom', event.target.value)}
                  className="h-11 bg-white"
                />
                <Select value={form.leaseDuration} onValueChange={(value) => updateField('leaseDuration', value)}>
                  <SelectTrigger className="h-11 bg-white text-slate-900"><SelectValue placeholder="Lease Duration" /></SelectTrigger>
                  <SelectContent className="bg-white text-slate-900">
                    <SelectItem value="Short-term">Short-term</SelectItem>
                    <SelectItem value="Long-term">Long-term</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {step === 6 && (
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Tenant Preference</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Select value={form.tenantType} onValueChange={(value) => updateField('tenantType', value as 'Family' | 'Bachelor' | 'Both')}>
                  <SelectTrigger className="h-11 bg-white text-slate-900"><SelectValue placeholder="Family/Bachelor" /></SelectTrigger>
                  <SelectContent className="bg-white text-slate-900">
                    <SelectItem value="Family">Family</SelectItem>
                    <SelectItem value="Bachelor">Bachelor</SelectItem>
                    <SelectItem value="Both">Both</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={form.petsAllowed} onValueChange={(value) => updateField('petsAllowed', value as 'Yes' | 'No')}>
                  <SelectTrigger className="h-11 bg-white text-slate-900"><SelectValue placeholder="Pets Allowed" /></SelectTrigger>
                  <SelectContent className="bg-white text-slate-900">
                    <SelectItem value="Yes">Yes</SelectItem>
                    <SelectItem value="No">No</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={form.preferredFurnishing}
                  onValueChange={(value) =>
                    updateField('preferredFurnishing', value as 'Unfurnished' | 'Semi-Furnished' | 'Fully Furnished' | 'Any')
                  }
                >
                  <SelectTrigger className="h-11 bg-white text-slate-900"><SelectValue placeholder="Furnishing" /></SelectTrigger>
                  <SelectContent className="bg-white text-slate-900">
                    <SelectItem value="Any">Any</SelectItem>
                    <SelectItem value="Unfurnished">Unfurnished</SelectItem>
                    <SelectItem value="Semi-Furnished">Semi-Furnished</SelectItem>
                    <SelectItem value="Fully Furnished">Fully Furnished</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={form.tenantParking} onValueChange={(value) => updateField('tenantParking', value as 'Yes' | 'No' | 'Any')}>
                  <SelectTrigger className="h-11 bg-white text-slate-900"><SelectValue placeholder="Parking Required" /></SelectTrigger>
                  <SelectContent className="bg-white text-slate-900">
                    <SelectItem value="Any">Any</SelectItem>
                    <SelectItem value="Yes">Yes</SelectItem>
                    <SelectItem value="No">No</SelectItem>
                  </SelectContent>
                </Select>
                <Textarea
                  value={form.rules}
                  onChange={(event) => updateField('rules', event.target.value)}
                  placeholder="Rules (Optional)"
                  className="min-h-20 bg-white sm:col-span-2"
                />
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 sm:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    Optional Premium: Vastu Section
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Select
                      value={form.vastuMainDoorDirection}
                      onValueChange={(value) => updateField('vastuMainDoorDirection', value)}
                    >
                      <SelectTrigger className="h-10 bg-white text-slate-900">
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
                      <SelectTrigger className="h-10 bg-white text-slate-900">
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
                      <SelectTrigger className="h-10 bg-white text-slate-900">
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
                      <SelectTrigger className="h-10 bg-white text-slate-900">
                        <SelectValue placeholder="Toilet Placement" />
                      </SelectTrigger>
                      <SelectContent className="bg-white text-slate-900">
                        <SelectItem value="West">Toilet: West</SelectItem>
                        <SelectItem value="North-West">Toilet: North-West</SelectItem>
                        <SelectItem value="South">Toilet: South</SelectItem>
                        <SelectItem value="Other">Toilet: Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-emerald-800">
                    Vastu Score Preview: {vastuScore}%
                  </p>
                </div>
              </div>
            </div>
          )}

          {step === 7 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-slate-900">Photos/Videos + Review</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm">
                  <p className="font-semibold text-slate-900">Property Images</p>
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
                  <p className="font-semibold text-slate-900">Property Videos</p>
                  <input
                    type="file"
                    multiple
                    accept="video/*"
                    className="mt-3 block w-full text-xs"
                    onChange={(event) => setFiles('videos', event.target.files)}
                  />
                  <p className="mt-2 text-xs text-slate-700">{form.videos.length} file(s)</p>
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
              {step < 7 && (
                <Button onClick={next} className="bg-blue-700 text-white hover:bg-blue-800">
                  Next Step
                </Button>
              )}
              {step === 7 && (
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
