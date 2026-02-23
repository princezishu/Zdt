import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LgdLocationAccuracyNote, LgdLocationInput } from '@/components/realty/LgdLocationInput';
import {
  createInfraUpdate,
  type InfraImpactLevel,
  type InfraUpdateCategory,
  type InfraVerificationLevel,
} from '@/lib/infrastructureApi';

const CATEGORIES: Array<{ key: InfraUpdateCategory; label: string }> = [
  { key: 'PROPOSED', label: 'Proposed' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'UNDER_CONSTRUCTION', label: 'Under Construction' },
  { key: 'COMPLETED', label: 'Completed' },
];

const IMPACT_LEVELS: InfraImpactLevel[] = ['LOW', 'MEDIUM', 'HIGH'];
const VERIFICATION_LEVELS: InfraVerificationLevel[] = [
  'PUBLIC_NOTICE',
  'TENDER',
  'OFFICE_CONFIRMED',
  'LOCAL_REPORT',
];

const AUTHORITIES = ['Karnataka PWD', 'NHAI', 'MoRTH', 'District Administration', 'Municipal Council'];
const PROJECT_TYPES = [
  'Road Widening',
  'Road Improvement',
  'Bypass / Ring Road',
  'Bridge / Culvert',
  'Junction Improvement',
  'Approach Road Upgrade',
  'Drainage / Civic Works',
  'Street Lighting',
  'Connectivity Proposal',
];

function normalizeCities(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((city) => city.trim())
        .filter(Boolean)
    )
  );
}

function formatEnumLabel(value: string): string {
  const text = value.toLowerCase().replace(/_/g, ' ');
  return `${text[0].toUpperCase()}${text.slice(1)}`;
}

export default function AdminInfraAddPage() {
  const [adminToken, setAdminToken] = useState('');
  const [stateName, setStateName] = useState('');
  const [district, setDistrict] = useState('');
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [cityDraft, setCityDraft] = useState('');
  const [extraCitiesText, setExtraCitiesText] = useState('');
  const [category, setCategory] = useState<InfraUpdateCategory>('APPROVED');
  const [projectName, setProjectName] = useState('');
  const [authority, setAuthority] = useState('Karnataka PWD');
  const [projectType, setProjectType] = useState('Road Improvement');
  const [statusText, setStatusText] = useState('');
  const [impactLevel, setImpactLevel] = useState<InfraImpactLevel>('MEDIUM');
  const [verificationLevel, setVerificationLevel] = useState<InfraVerificationLevel>('TENDER');
  const [sourceRef, setSourceRef] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const allCities = useMemo(
    () => Array.from(new Set([...selectedCities, ...normalizeCities(extraCitiesText)])),
    [extraCitiesText, selectedCities]
  );

  const addCity = (city: string) => {
    const next = String(city || '').trim();
    if (!next) return;
    setSelectedCities((prev) => {
      if (prev.some((entry) => entry.toLowerCase() === next.toLowerCase())) {
        return prev;
      }
      return [...prev, next];
    });
    setCityDraft('');
  };

  const removeCity = (city: string) => {
    const next = String(city || '').trim();
    if (!next) return;
    setSelectedCities((prev) => prev.filter((entry) => entry.toLowerCase() !== next.toLowerCase()));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!adminToken.trim()) {
      setError('Admin token is required.');
      return;
    }
    if (!projectName.trim()) {
      setError('Project name is required.');
      return;
    }
    if (!statusText.trim()) {
      setError('Current status is required.');
      return;
    }
    if (!sourceRef.trim()) {
      setError('Source reference is required.');
      return;
    }
    if (!sourceUrl.trim()) {
      setError('Official source URL is required.');
      return;
    }
    if (allCities.length === 0) {
      setError('Select at least one city.');
      return;
    }

    try {
      setLoading(true);
      await createInfraUpdate(
        {
          state: stateName,
          district,
          cities: allCities,
          category,
          projectName,
          authority,
          projectType,
          statusText,
          impactLevel,
          sourceRef,
          sourceUrl: sourceUrl.trim(),
          verificationLevel,
          lastUpdated: lastUpdated.trim() || null,
        },
        adminToken.trim()
      );

      setMessage('Saved. The update is now visible on the public tracker.');
      setProjectName('');
      setStatusText('');
      setSourceRef('');
      setSourceUrl('');
      setLastUpdated('');
      setVerificationLevel('TENDER');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not save update.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container zdt-page-stack">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold sm:text-3xl">Admin: Add Infrastructure Update</h1>
          <p className="mt-2 text-sm text-slate-600">
            Publish public infrastructure updates. Use tender notices, public notices, or official office confirmations.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="grid gap-4">
            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Admin Token (required)
              </p>
              <Input
                value={adminToken}
                onChange={(event) => setAdminToken(event.target.value)}
                type="password"
                placeholder="Enter ADMIN_TOKEN"
                className="h-11 bg-white"
              />
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">State</p>
                <LgdLocationInput
                  value={stateName}
                  onChange={setStateName}
                  className="h-11 bg-white"
                  suggestKind="state"
                  indiaValueField="state"
                />
              </label>

              <label className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">District</p>
                <LgdLocationInput
                  value={district}
                  onChange={setDistrict}
                  className="h-11 bg-white"
                  suggestKind="india"
                  indiaValueField="district"
                />
              </label>
            </div>
            <LgdLocationAccuracyNote />

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Cities</p>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <LgdLocationInput
                  value={cityDraft}
                  onChange={setCityDraft}
                  placeholder="Type city and add"
                  className="h-11 bg-white"
                  suggestKind="india"
                  indiaValueField="village"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-xl px-4"
                  onClick={() => addCity(cityDraft)}
                >
                  Add city
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedCities.map((city) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => removeCity(city)}
                    className="rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
                  >
                    {city} x
                  </button>
                ))}
              </div>
              <Input
                value={extraCitiesText}
                onChange={(event) => setExtraCitiesText(event.target.value)}
                placeholder="Add multiple cities (comma separated)"
                className="h-11 bg-white"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <label className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Category</p>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as InfraUpdateCategory)}
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800"
                >
                  {CATEGORIES.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Impact</p>
                <select
                  value={impactLevel}
                  onChange={(event) => setImpactLevel(event.target.value as InfraImpactLevel)}
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800"
                >
                  {IMPACT_LEVELS.map((value) => (
                    <option key={value} value={value}>
                      {formatEnumLabel(value)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 lg:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Verification Level
                </p>
                <select
                  value={verificationLevel}
                  onChange={(event) => setVerificationLevel(event.target.value as InfraVerificationLevel)}
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800"
                >
                  {VERIFICATION_LEVELS.map((value) => (
                    <option key={value} value={value}>
                      {formatEnumLabel(value)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Project Name</p>
              <Input
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="Example: Ring Road Expansion Phase 2"
                className="h-11 bg-white"
              />
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Authority</p>
                <select
                  value={authority}
                  onChange={(event) => setAuthority(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800"
                >
                  {AUTHORITIES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Project Type</p>
                <select
                  value={projectType}
                  onChange={(event) => setProjectType(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800"
                >
                  {PROJECT_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Current Status</p>
              <textarea
                value={statusText}
                onChange={(event) => setStatusText(event.target.value)}
                placeholder="Example: Tender process initiated; survey and estimation completed."
                className="min-h-[110px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
              />
            </label>

            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Source Reference</p>
              <Input
                value={sourceRef}
                onChange={(event) => setSourceRef(event.target.value)}
                placeholder="Example: PWD Tender Notice #1234 (public)"
                className="h-11 bg-white"
              />
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Source URL (required)
                </p>
                <Input
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="https://official-notice-link"
                  className="h-11 bg-white"
                />
              </label>

              <label className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Last Updated (optional)
                </p>
                <Input
                  value={lastUpdated}
                  onChange={(event) => setLastUpdated(event.target.value)}
                  placeholder="YYYY-MM-DD"
                  className="h-11 bg-white"
                />
              </label>
            </div>

            {error ? (
              <p className="inline-flex items-center gap-2 text-sm text-red-700">
                <AlertCircle className="h-4 w-4" />
                {error}
              </p>
            ) : null}

            {message ? (
              <p className="inline-flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                {message}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="submit"
                disabled={loading}
                className="h-11 rounded-xl bg-blue-700 px-5 text-white hover:bg-blue-800"
              >
                {loading ? 'Saving...' : 'Publish Update'}
              </Button>
              <p className="text-xs text-slate-500">
                Safety tip: only post updates that are tender/notice-based or officially confirmed.
              </p>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
