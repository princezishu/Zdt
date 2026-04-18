import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FileCheck2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { LgdLocationAccuracyNote, LgdLocationInput } from '@/components/realty/LgdLocationInput';

export type OwnerListingMode = 'sale' | 'rent';

export interface OwnerPropertyFormState {
  listingMode: OwnerListingMode;
  propertyType: string;
  title: string;
  description: string;
  bhk: string;
  areaSqft: string;
  carpetArea: string;
  facing: string;
  floorNumber: string;
  totalFloors: string;
  state: string;
  city: string;
  locality: string;
  address: string;
  pincode: string;
  latitude: string;
  longitude: string;
  price: string;
  pricePerSqft: string;
  isNegotiable: boolean;
  reraNumber: string;
  possessionStatus: string;
  groupInventoryCount: string;
  groupDealMinBuyers: string;
  groupDealMaxBuyers: string;
  groupDiscountType: 'NONE' | 'FLAT_DISCOUNT' | 'PERCENT_DISCOUNT' | 'CONFIRM_LATER';
  groupDiscountValue: string;
  groupDealNote: string;
  amenities: string[];
  imageFile: File | null;
  imageUrls: string;
  videoUrl: string;
  tourUrl: string;
  monthlyRent: string;
  securityDeposit: string;
  maintenanceCharges: string;
  furnishedStatus: string;
  tenantPreference: string;
  leaseDuration: string;
  availableFrom: string;
  noticePeriod: string;
  houseRules: string;
  petsAllowed: boolean;
  smokingAllowed: boolean;
}

interface OwnerPropertyFormProps {
  mode: 'create' | 'edit';
  initialState?: Partial<OwnerPropertyFormState>;
  onSubmit: (payload: OwnerPropertyFormState) => Promise<void>;
  onCancel: () => void;
}

const defaultState: OwnerPropertyFormState = {
  listingMode: 'sale',
  propertyType: 'Apartment',
  title: '',
  description: '',
  bhk: '',
  areaSqft: '',
  carpetArea: '',
  facing: 'NA',
  floorNumber: '',
  totalFloors: '',
  state: '',
  city: '',
  locality: '',
  address: '',
  pincode: '',
  latitude: '',
  longitude: '',
  price: '',
  pricePerSqft: '',
  isNegotiable: false,
  reraNumber: '',
  possessionStatus: 'ready',
  groupInventoryCount: '1',
  groupDealMinBuyers: '2',
  groupDealMaxBuyers: '',
  groupDiscountType: 'NONE',
  groupDiscountValue: '',
  groupDealNote: '',
  amenities: [],
  imageFile: null,
  imageUrls: '',
  videoUrl: '',
  tourUrl: '',
  monthlyRent: '',
  securityDeposit: '',
  maintenanceCharges: '',
  furnishedStatus: 'unfurnished',
  tenantPreference: 'family',
  leaseDuration: '11 months',
  availableFrom: '',
  noticePeriod: '',
  houseRules: '',
  petsAllowed: false,
  smokingAllowed: false,
};

const amenityOptions = [
  'Lift',
  'Parking',
  'Power Backup',
  'Swimming Pool',
  'Gym',
  'Garden',
  'Smart Home',
  'EV Charging',
];

const steps = [
  { id: 1, title: 'Basic Info' },
  { id: 2, title: 'Location' },
  { id: 3, title: 'Pricing' },
  { id: 4, title: 'Amenities' },
  { id: 5, title: 'Media' },
  { id: 6, title: 'Preview' },
];

function parseCoordinate(value: string, min: number, max: number): number | null {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return null;
  if (numeric < min || numeric > max) return null;
  return Number(numeric.toFixed(7));
}

export default function OwnerPropertyForm({
  mode,
  initialState,
  onSubmit,
  onCancel,
}: OwnerPropertyFormProps) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<OwnerPropertyFormState>({ ...defaultState, ...initialState });
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState('');

  const parsedImages = useMemo(
    () =>
      form.imageUrls
        .split(',')
        .map((url) => url.trim())
        .filter(Boolean),
    [form.imageUrls]
  );

  const nextStep = () => setStep((prev) => Math.min(6, prev + 1));
  const prevStep = () => setStep((prev) => Math.max(1, prev - 1));

  const handleSubmit = async () => {
    const latitude = parseCoordinate(form.latitude, -90, 90);
    const longitude = parseCoordinate(form.longitude, -180, 180);
    if (latitude === null || longitude === null) {
      setStep(2);
      setValidationError('Add valid latitude and longitude to publish with exact map location.');
      return;
    }
    setValidationError('');

    setSubmitting(true);
    try {
      await onSubmit({
        ...form,
        latitude: String(latitude),
        longitude: String(longitude),
      });
      toast.success(mode === 'create' ? 'Listing published' : 'Listing updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save listing');
    } finally {
      setSubmitting(false);
    }
  };

  const updateField = <K extends keyof OwnerPropertyFormState>(key: K, value: OwnerPropertyFormState[K]) => {
    if (validationError) {
      setValidationError('');
    }
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Step {step} of 6</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">{steps[step - 1]?.title}</h2>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => toast('Draft saved locally.')}>
            Save Draft
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-6">
        {step === 1 && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">Listing Mode</label>
              <Select
                value={form.listingMode}
                onValueChange={(value: OwnerListingMode) => updateField('listingMode', value)}
              >
                <SelectTrigger className="mt-2 h-10">
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sale">Sell</SelectItem>
                  <SelectItem value="rent">Rent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">Property Type</label>
              <Select value={form.propertyType} onValueChange={(value) => updateField('propertyType', value)}>
                <SelectTrigger className="mt-2 h-10">
                  <SelectValue placeholder="Property type" />
                </SelectTrigger>
                <SelectContent>
                  {['Apartment', 'Villa', 'Independent House', 'Studio', 'Duplex', 'Plot'].map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="lg:col-span-2">
              <label className="text-xs font-semibold uppercase text-slate-500">Listing Title</label>
              <Input
                value={form.title}
                onChange={(event) => updateField('title', event.target.value)}
                className="mt-2 h-10"
                placeholder="Spacious 3BHK with skyline view"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="text-xs font-semibold uppercase text-slate-500">Description</label>
              <Textarea
                value={form.description}
                onChange={(event) => updateField('description', event.target.value)}
                className="mt-2 min-h-28"
                placeholder="Highlight amenities, layout, and special selling points."
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">BHK</label>
              <Input value={form.bhk} onChange={(event) => updateField('bhk', event.target.value)} className="mt-2 h-10" placeholder="3" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">Area (sq.ft)</label>
              <Input value={form.areaSqft} onChange={(event) => updateField('areaSqft', event.target.value)} className="mt-2 h-10" placeholder="1450" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">Carpet Area (sq.ft)</label>
              <Input value={form.carpetArea} onChange={(event) => updateField('carpetArea', event.target.value)} className="mt-2 h-10" placeholder="1050" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">Facing</label>
              <Input value={form.facing} onChange={(event) => updateField('facing', event.target.value)} className="mt-2 h-10" placeholder="East" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">Floor Number</label>
              <Input value={form.floorNumber} onChange={(event) => updateField('floorNumber', event.target.value)} className="mt-2 h-10" placeholder="12" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">Total Floors</label>
              <Input value={form.totalFloors} onChange={(event) => updateField('totalFloors', event.target.value)} className="mt-2 h-10" placeholder="24" />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">State</label>
              <LgdLocationInput
                value={form.state}
                onChange={(value) => updateField('state', value)}
                className="mt-2 h-10"
                placeholder="Maharashtra"
                suggestKind="state"
                indiaValueField="state"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">City</label>
              <LgdLocationInput
                value={form.city}
                onChange={(value) => updateField('city', value)}
                className="mt-2 h-10"
                placeholder="Mumbai"
                suggestKind="india"
                indiaValueField="village"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">Locality</label>
              <LgdLocationInput
                value={form.locality}
                onChange={(value) => updateField('locality', value)}
                className="mt-2 h-10"
                placeholder="Bandra West"
                suggestKind="india"
                indiaValueField="subdistrict"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">Pin Code</label>
              <Input value={form.pincode} onChange={(event) => updateField('pincode', event.target.value)} className="mt-2 h-10" placeholder="400050" />
            </div>
            <div className="lg:col-span-2">
              <label className="text-xs font-semibold uppercase text-slate-500">Address</label>
              <Textarea value={form.address} onChange={(event) => updateField('address', event.target.value)} className="mt-2 min-h-20" placeholder="Street, building, landmark" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">Latitude</label>
              <Input
                value={form.latitude}
                onChange={(event) => updateField('latitude', event.target.value.replace(/[^0-9+.-]/g, ''))}
                className="mt-2 h-10"
                placeholder="19.0760"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">Longitude</label>
              <Input
                value={form.longitude}
                onChange={(event) => updateField('longitude', event.target.value.replace(/[^0-9+.-]/g, ''))}
                className="mt-2 h-10"
                placeholder="72.8777"
              />
            </div>
            <div className="lg:col-span-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Add exact coordinates to pin this listing correctly in map mode.
            </div>
            <div className="lg:col-span-2">
              <LgdLocationAccuracyNote />
            </div>
            {validationError ? (
              <p className="lg:col-span-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                {validationError}
              </p>
            ) : null}
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-4 lg:grid-cols-2">
            {form.listingMode === 'sale' && (
              <>
                <div>
                  <label className="text-xs font-semibold uppercase text-slate-500">Expected Price</label>
                  <Input value={form.price} onChange={(event) => updateField('price', event.target.value)} className="mt-2 h-10" placeholder="1,25,00,000" />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-slate-500">Price per Sqft</label>
                  <Input value={form.pricePerSqft} onChange={(event) => updateField('pricePerSqft', event.target.value)} className="mt-2 h-10" placeholder="8500" />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-slate-500">RERA Number</label>
                  <Input value={form.reraNumber} onChange={(event) => updateField('reraNumber', event.target.value)} className="mt-2 h-10" placeholder="RERA-12345" />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-slate-500">Possession Status</label>
                  <Select value={form.possessionStatus} onValueChange={(value) => updateField('possessionStatus', value)}>
                    <SelectTrigger className="mt-2 h-10">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {['ready', 'under_construction', 'pre_launch'].map((item) => (
                        <SelectItem key={item} value={item}>
                          {item.replace('_', ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm">
                  <Checkbox checked={form.isNegotiable} onCheckedChange={(value) => updateField('isNegotiable', Boolean(value))} />
                  Price is negotiable
                </label>

                <div className="lg:col-span-2 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-800">
                    Group Deal Offer
                  </p>
                  <p className="mt-1 text-xs text-indigo-700">
                    If units available are more than 1, this listing can be grouped for a bulk discount offer.
                  </p>

                  <div className="mt-3 grid gap-3 lg:grid-cols-3">
                    <div>
                      <label className="text-xs font-semibold uppercase text-slate-500">Units Available</label>
                      <Input
                        value={form.groupInventoryCount}
                        onChange={(event) => updateField('groupInventoryCount', event.target.value)}
                        className="mt-2 h-10"
                        placeholder="1"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase text-slate-500">Min Buyers</label>
                      <Input
                        value={form.groupDealMinBuyers}
                        onChange={(event) => updateField('groupDealMinBuyers', event.target.value)}
                        className="mt-2 h-10"
                        placeholder="2"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase text-slate-500">Max Buyers</label>
                      <Input
                        value={form.groupDealMaxBuyers}
                        onChange={(event) => updateField('groupDealMaxBuyers', event.target.value)}
                        className="mt-2 h-10"
                        placeholder="Optional"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase text-slate-500">Discount Type</label>
                      <Select
                        value={form.groupDiscountType}
                        onValueChange={(value: OwnerPropertyFormState['groupDiscountType']) =>
                          updateField('groupDiscountType', value)
                        }
                      >
                        <SelectTrigger className="mt-2 h-10">
                          <SelectValue placeholder="Discount type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NONE">No fixed discount (confirm later)</SelectItem>
                          <SelectItem value="FLAT_DISCOUNT">Flat discount</SelectItem>
                          <SelectItem value="PERCENT_DISCOUNT">Percent discount</SelectItem>
                          <SelectItem value="CONFIRM_LATER">Confirm later</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase text-slate-500">Discount Value</label>
                      <Input
                        value={form.groupDiscountValue}
                        onChange={(event) => updateField('groupDiscountValue', event.target.value)}
                        className="mt-2 h-10"
                        placeholder={form.groupDiscountType === 'PERCENT_DISCOUNT' ? '5' : '500000'}
                        disabled={
                          form.groupDiscountType === 'NONE' || form.groupDiscountType === 'CONFIRM_LATER'
                        }
                      />
                    </div>
                    <div className="lg:col-span-3">
                      <label className="text-xs font-semibold uppercase text-slate-500">Group Deal Note</label>
                      <Textarea
                        value={form.groupDealNote}
                        onChange={(event) => updateField('groupDealNote', event.target.value)}
                        className="mt-2 min-h-20"
                        placeholder="Example: Group price valid for 30 days. Limited inventory."
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {form.listingMode === 'rent' && (
              <>
                <div>
                  <label className="text-xs font-semibold uppercase text-slate-500">Monthly Rent</label>
                  <Input value={form.monthlyRent} onChange={(event) => updateField('monthlyRent', event.target.value)} className="mt-2 h-10" placeholder="45000" />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-slate-500">Security Deposit</label>
                  <Input value={form.securityDeposit} onChange={(event) => updateField('securityDeposit', event.target.value)} className="mt-2 h-10" placeholder="1,00,000" />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-slate-500">Maintenance Charges</label>
                  <Input value={form.maintenanceCharges} onChange={(event) => updateField('maintenanceCharges', event.target.value)} className="mt-2 h-10" placeholder="3500" />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-slate-500">Furnishing Status</label>
                  <Select value={form.furnishedStatus} onValueChange={(value) => updateField('furnishedStatus', value)}>
                    <SelectTrigger className="mt-2 h-10">
                      <SelectValue placeholder="Furnished status" />
                    </SelectTrigger>
                    <SelectContent>
                      {['unfurnished', 'semi', 'full'].map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-slate-500">Tenant Preference</label>
                  <Select value={form.tenantPreference} onValueChange={(value) => updateField('tenantPreference', value)}>
                    <SelectTrigger className="mt-2 h-10">
                      <SelectValue placeholder="Tenant preference" />
                    </SelectTrigger>
                    <SelectContent>
                      {['family', 'bachelor', 'company', 'students', 'any'].map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-slate-500">Lease Duration</label>
                  <Input value={form.leaseDuration} onChange={(event) => updateField('leaseDuration', event.target.value)} className="mt-2 h-10" placeholder="11 months" />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-slate-500">Available From</label>
                  <Input type="date" value={form.availableFrom} onChange={(event) => updateField('availableFrom', event.target.value)} className="mt-2 h-10" />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-slate-500">Notice Period</label>
                  <Input value={form.noticePeriod} onChange={(event) => updateField('noticePeriod', event.target.value)} className="mt-2 h-10" placeholder="2 months" />
                </div>
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm">
                  <Checkbox checked={form.petsAllowed} onCheckedChange={(value) => updateField('petsAllowed', Boolean(value))} />
                  Pets allowed
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm">
                  <Checkbox checked={form.smokingAllowed} onCheckedChange={(value) => updateField('smokingAllowed', Boolean(value))} />
                  Smoking allowed
                </label>
              </>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {amenityOptions.map((amenity) => (
              <label key={amenity} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">
                {amenity}
                <Checkbox
                  checked={form.amenities.includes(amenity)}
                  onCheckedChange={() => {
                    const next = form.amenities.includes(amenity)
                      ? form.amenities.filter((item) => item !== amenity)
                      : [...form.amenities, amenity];
                    updateField('amenities', next);
                  }}
                />
              </label>
            ))}
          </div>
        )}

        {step === 5 && (
          <div className="grid gap-4 lg:grid-cols-2">
            {mode === 'create' ? (
              <div className="lg:col-span-2">
                <label className="text-xs font-semibold uppercase text-slate-500">Upload Primary Image</label>
                <Input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="mt-2 h-10"
                  onChange={(event) => updateField('imageFile', event.target.files?.[0] || null)}
                />
                <p className="mt-2 text-xs text-slate-500">
                  {form.imageFile
                    ? `${form.imageFile.name} will be uploaded to Cloudinary when you publish this listing.`
                    : 'Choose one PNG, JPEG, or WebP image to upload directly with the property.'}
                </p>
              </div>
            ) : null}
            <div className="lg:col-span-2">
              <label className="text-xs font-semibold uppercase text-slate-500">Additional Image URLs (comma separated)</label>
              <Textarea
                value={form.imageUrls}
                onChange={(event) => updateField('imageUrls', event.target.value)}
                className="mt-2 min-h-24"
                placeholder="https://.../image1.jpg, https://.../image2.jpg"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">Video Walkthrough URL</label>
              <Input value={form.videoUrl} onChange={(event) => updateField('videoUrl', event.target.value)} className="mt-2 h-10" placeholder="https://..." />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">360 Tour URL</label>
              <Input value={form.tourUrl} onChange={(event) => updateField('tourUrl', event.target.value)} className="mt-2 h-10" placeholder="https://..." />
            </div>
            <div className="lg:col-span-2 grid gap-2 sm:grid-cols-3">
              {parsedImages.slice(0, 6).map((url) => (
                <img key={url} src={url} alt="Preview" className="h-24 w-full rounded-xl object-cover" />
              ))}
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Listing Preview</h3>
              <p className="mt-2 text-base font-semibold text-slate-900">{form.title || 'Untitled listing'}</p>
              <p className="text-sm text-slate-600">{form.locality || form.city}</p>
              <div className="mt-3 text-sm text-slate-600">
                {form.listingMode === 'sale' ? (
                  <span>Expected price: {form.price || 'On request'}</span>
                ) : (
                  <span>Monthly rent: {form.monthlyRent || 'On request'}</span>
                )}
              </div>
              {form.listingMode === 'sale' && Number(form.groupInventoryCount || 1) > 1 ? (
                <p className="mt-2 text-xs text-indigo-700">
                  Group deal ready: {form.groupInventoryCount} units | Min buyers:{' '}
                  {form.groupDealMinBuyers || '2'}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {form.amenities.slice(0, 6).map((amenity) => (
                  <span key={amenity} className="rounded-full border border-slate-200 bg-white px-3 py-1">
                    {amenity}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">Publishing Checklist</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li className="flex items-center gap-2">
                  <FileCheck2 className="h-4 w-4 text-emerald-600" />
                  Add at least 4 HD images
                </li>
                <li className="flex items-center gap-2">
                  <FileCheck2 className="h-4 w-4 text-emerald-600" />
                  Complete pricing & availability info
                </li>
                <li className="flex items-center gap-2">
                  <FileCheck2 className="h-4 w-4 text-amber-500" />
                  Schedule owner verification
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <Button variant="outline" onClick={prevStep} disabled={step === 1}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        {step < 6 ? (
          <Button className="bg-blue-700 text-white hover:bg-blue-800" onClick={nextStep}>
            Continue
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button className="bg-blue-700 text-white hover:bg-blue-800" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Publishing...' : mode === 'create' ? 'Publish Listing' : 'Update Listing'}
          </Button>
        )}
      </div>
    </div>
  );
}
