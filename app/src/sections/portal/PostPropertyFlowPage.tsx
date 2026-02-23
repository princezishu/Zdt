import { useMemo, useState } from 'react';
import { LgdLocationAccuracyNote, LgdLocationInput } from '@/components/realty/LgdLocationInput';
import { BadgeCheck, Eye, FileCheck2, HousePlus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PostPropertyFlowPageProps {
  onOpenDetails: () => void;
}

type Step = 1 | 2 | 3 | 4;

interface ListingFormState {
  purpose: 'Sell' | 'Rent';
  propertyType: 'Apartment' | 'Villa' | 'Plot' | 'Commercial';
  title: string;
  city: string;
  locality: string;
  expectedPrice: string;
  areaSqft: string;
  bhk: string;
  bathrooms: string;
  parking: string;
  possession: string;
  description: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  verifyListing: boolean;
}

const steps: Array<{ id: Step; label: string }> = [
  { id: 1, label: 'Basic Info' },
  { id: 2, label: 'Property Specs' },
  { id: 3, label: 'Media & Trust' },
  { id: 4, label: 'Preview & Publish' },
];

const initialForm: ListingFormState = {
  purpose: 'Sell',
  propertyType: 'Apartment',
  title: '',
  city: '',
  locality: '',
  expectedPrice: '',
  areaSqft: '',
  bhk: '',
  bathrooms: '',
  parking: '',
  possession: '',
  description: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  verifyListing: true,
};

export default function PostPropertyFlowPage({ onOpenDetails }: PostPropertyFlowPageProps) {
  const [step, setStep] = useState<Step>(1);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState<ListingFormState>(initialForm);

  const progress = useMemo(() => ((step - 1) / (steps.length - 1)) * 100, [step]);

  const update = <K extends keyof ListingFormState>(key: K, value: ListingFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const next = () => setStep((prev) => Math.min(prev + 1, 4) as Step);
  const previous = () => setStep((prev) => Math.max(prev - 1, 1) as Step);

  const publish = () => {
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <section className="pb-16 pt-28">
        <div className="page-container">
          <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <BadgeCheck className="h-7 w-7" />
            </div>
            <h1 className="mt-4 text-3xl font-bold text-slate-900">Listing Draft Published</h1>
            <p className="mt-2 text-sm text-slate-600">
              Your property is now under moderation. Verified badge review starts within 24 hours.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button onClick={onOpenDetails} className="rounded-xl bg-blue-700 text-white hover:bg-blue-800">
                View Listing Preview
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSubmitted(false);
                  setStep(1);
                  setForm(initialForm);
                }}
                className="rounded-xl border-slate-300"
              >
                Post Another Property
              </Button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-5">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
            Post Property FREE
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">List Your Property In Minutes</h1>
          <p className="mt-2 text-sm text-slate-600">
            Step-by-step flow with preview before publish and optional verification badge.
          </p>
          <div className="mt-4 h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-blue-700 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500 sm:grid-cols-4">
            {steps.map((item) => (
              <div
                key={item.id}
                className={`rounded-lg border px-2 py-1.5 text-center ${
                  step === item.id
                    ? 'border-blue-300 bg-blue-50 font-semibold text-blue-700'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                {item.label}
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            {step === 1 && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-slate-900">Basic Info</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-slate-600">Purpose</span>
                    <select
                      value={form.purpose}
                      onChange={(event) => update('purpose', event.target.value as 'Sell' | 'Rent')}
                      className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-400"
                    >
                      <option>Sell</option>
                      <option>Rent</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-slate-600">Property Type</span>
                    <select
                      value={form.propertyType}
                      onChange={(event) =>
                        update('propertyType', event.target.value as ListingFormState['propertyType'])
                      }
                      className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-400"
                    >
                      <option>Apartment</option>
                      <option>Villa</option>
                      <option>Plot</option>
                      <option>Commercial</option>
                    </select>
                  </label>
                  <label className="space-y-1 sm:col-span-2">
                    <span className="text-xs font-medium text-slate-600">Listing Title</span>
                    <input
                      value={form.title}
                      onChange={(event) => update('title', event.target.value)}
                      className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-400"
                      placeholder="Example: Premium 3 BHK in Whitefield"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-slate-600">City</span>
                    <LgdLocationInput
                      value={form.city}
                      onChange={(value) => update('city', value)}
                      className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-400"
                      suggestKind="india"
                      indiaValueField="village"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-slate-600">Locality</span>
                    <LgdLocationInput
                      value={form.locality}
                      onChange={(value) => update('locality', value)}
                      className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-400"
                      suggestKind="india"
                      indiaValueField="subdistrict"
                    />
                  </label>
                  <div className="sm:col-span-2">
                    <LgdLocationAccuracyNote />
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-slate-900">Property Specs</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-slate-600">Expected Price</span>
                    <input
                      value={form.expectedPrice}
                      onChange={(event) => update('expectedPrice', event.target.value)}
                      className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-400"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-slate-600">Area (sq.ft)</span>
                    <input
                      value={form.areaSqft}
                      onChange={(event) => update('areaSqft', event.target.value)}
                      className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-400"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-slate-600">BHK</span>
                    <input
                      value={form.bhk}
                      onChange={(event) => update('bhk', event.target.value)}
                      className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-400"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-slate-600">Bathrooms</span>
                    <input
                      value={form.bathrooms}
                      onChange={(event) => update('bathrooms', event.target.value)}
                      className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-400"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-slate-600">Parking</span>
                    <input
                      value={form.parking}
                      onChange={(event) => update('parking', event.target.value)}
                      className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-400"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-slate-600">Possession</span>
                    <input
                      value={form.possession}
                      onChange={(event) => update('possession', event.target.value)}
                      className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-400"
                    />
                  </label>
                  <label className="space-y-1 sm:col-span-2">
                    <span className="text-xs font-medium text-slate-600">Description</span>
                    <textarea
                      value={form.description}
                      onChange={(event) => update('description', event.target.value)}
                      className="min-h-28 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-400"
                    />
                  </label>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-slate-900">Media & Trust</h2>
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                  Drag and drop property photos here. (UI placeholder)
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-slate-600">Contact Name</span>
                    <input
                      value={form.contactName}
                      onChange={(event) => update('contactName', event.target.value)}
                      className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-400"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-slate-600">Contact Phone</span>
                    <input
                      value={form.contactPhone}
                      onChange={(event) => update('contactPhone', event.target.value)}
                      className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-400"
                    />
                  </label>
                  <label className="space-y-1 sm:col-span-2">
                    <span className="text-xs font-medium text-slate-600">Contact Email</span>
                    <input
                      value={form.contactEmail}
                      onChange={(event) => update('contactEmail', event.target.value)}
                      className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-400"
                    />
                  </label>
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.verifyListing}
                    onChange={(event) => update('verifyListing', event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Request verified badge review
                </label>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-slate-900">Preview & Publish</h2>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-sm font-semibold text-slate-900">{form.title || 'Property Title'}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {form.locality || 'Locality'}, {form.city || 'City'}
                  </p>
                  <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                    <p>Purpose: {form.purpose}</p>
                    <p>Type: {form.propertyType}</p>
                    <p>Expected Price: {form.expectedPrice || '-'}</p>
                    <p>Area: {form.areaSqft ? `${form.areaSqft} sq.ft` : '-'}</p>
                    <p>BHK: {form.bhk || '-'}</p>
                    <p>Bathrooms: {form.bathrooms || '-'}</p>
                  </div>
                  <p className="mt-3 text-sm text-slate-700">{form.description || 'No description added yet.'}</p>
                </div>
              </div>
            )}

            <div className="mt-6 flex items-center justify-between">
              <Button
                variant="outline"
                onClick={previous}
                disabled={step === 1}
                className="rounded-xl border-slate-300"
              >
                Previous
              </Button>
              {step < 4 ? (
                <Button onClick={next} className="rounded-xl bg-blue-700 text-white hover:bg-blue-800">
                  Next Step
                </Button>
              ) : (
                <Button onClick={publish} className="rounded-xl bg-blue-700 text-white hover:bg-blue-800">
                  Publish Listing
                </Button>
              )}
            </div>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                <HousePlus className="h-4 w-4 text-blue-700" />
                Why list on ZDT Realty
              </p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li className="inline-flex items-start gap-2">
                  <FileCheck2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                  Verified listing support and trust badge.
                </li>
                <li className="inline-flex items-start gap-2">
                  <Eye className="mt-0.5 h-4 w-4 text-blue-700" />
                  Better visibility for serious buyers and tenants.
                </li>
                <li className="inline-flex items-start gap-2">
                  <Sparkles className="mt-0.5 h-4 w-4 text-amber-600" />
                  Premium presentation with curated recommendations.
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
