import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LgdLocationAccuracyNote, LgdLocationInput } from '@/components/realty/LgdLocationInput';
import {
  deleteInfraUpdate,
  getInfraUpdates,
  updateInfraUpdate,
  type InfraImpactLevel,
  type InfraUpdateCategory,
  type InfraUpdateItem,
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

const TENDER_MODEL_GROUPS = [
  {
    title: 'Identity and trust',
    fields: ['track', 'source_type', 'source_name', 'source_url', 'external_id', 'verification_level'],
  },
  {
    title: 'Opportunity core',
    fields: ['title', 'summary', 'authority_name', 'department_name', 'sector', 'work_type'],
  },
  {
    title: 'LGD location spine',
    fields: [
      'state_name',
      'district_name',
      'block_name',
      'village_name',
      'lgd_state_code',
      'lgd_district_code',
      'lgd_block_code',
      'lgd_village_code',
    ],
  },
  {
    title: 'Commercial timing',
    fields: ['budget_amount', 'emd_amount', 'tender_status', 'published_at', 'bid_end_at', 'opening_at'],
  },
  {
    title: 'Raw plus scored',
    fields: ['document_urls', 'raw_payload', 'raw_text', 'normalized_text', 'impact_score', 'geo_lat', 'geo_lng'],
  },
] as const;

interface EditDraft {
  state: string;
  district: string;
  cities: string[];
  category: InfraUpdateCategory;
  projectName: string;
  authority: string;
  projectType: string;
  statusText: string;
  impactLevel: InfraImpactLevel;
  sourceRef: string;
  sourceUrl: string;
  verificationLevel: InfraVerificationLevel;
  lastUpdated: string;
}

function makeEmptyEdit(): EditDraft {
  return {
    state: '',
    district: '',
    cities: [],
    category: 'APPROVED',
    projectName: '',
    authority: 'Karnataka PWD',
    projectType: 'Road Improvement',
    statusText: '',
    impactLevel: 'MEDIUM',
    sourceRef: '',
    sourceUrl: '',
    verificationLevel: 'PUBLIC_NOTICE',
    lastUpdated: '',
  };
}

function formatEnumLabel(value: string): string {
  const text = value.toLowerCase().replace(/_/g, ' ');
  return `${text[0].toUpperCase()}${text.slice(1)}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export default function AdminInfraManagePage() {
  const [adminToken, setAdminToken] = useState('session');
  const [stateName, setStateName] = useState('');
  const [district, setDistrict] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<InfraUpdateCategory | ''>('');
  const [verificationFilter, setVerificationFilter] = useState<InfraVerificationLevel | ''>('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<InfraUpdateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [edit, setEdit] = useState<EditDraft>(makeEmptyEdit());
  const [editCityDraft, setEditCityDraft] = useState('');

  const query = useMemo(
    () => ({
      state: stateName.trim(),
      district: district.trim(),
      category: categoryFilter || undefined,
      verificationLevel: verificationFilter || undefined,
      q: search.trim() || undefined,
    }),
    [categoryFilter, district, search, stateName, verificationFilter]
  );

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getInfraUpdates({
        state: query.state || undefined,
        district: query.district || undefined,
        category: query.category,
        verificationLevel: query.verificationLevel,
        q: query.q,
        page: 1,
        pageSize: 50,
        sort: 'newest',
      });
      setItems(Array.isArray(response.items) ? response.items : []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load updates.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  const startEdit = (item: InfraUpdateItem) => {
    setEditingId(item.id);
    setError('');
    setMessage('');
    setEdit({
      state: item.state || '',
      district: item.district || '',
      cities: Array.isArray(item.cities) ? item.cities : [],
      category: item.category || 'APPROVED',
      projectName: item.projectName || '',
      authority: item.authority || 'Karnataka PWD',
      projectType: item.projectType || 'Road Improvement',
      statusText: item.statusText || '',
      impactLevel: item.impactLevel || 'MEDIUM',
      sourceRef: item.sourceRef || '',
      sourceUrl: item.sourceUrl || '',
      verificationLevel:
        item.verificationLevel && item.verificationLevel !== 'UNKNOWN'
          ? item.verificationLevel
          : 'PUBLIC_NOTICE',
      lastUpdated: formatDate(item.lastUpdated),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEdit(makeEmptyEdit());
    setEditCityDraft('');
  };

  const addEditCity = (city: string) => {
    const next = String(city || '').trim();
    if (!next) return;
    setEdit((prev) => {
      if (prev.cities.some((entry) => entry.toLowerCase() === next.toLowerCase())) {
        return prev;
      }
      return { ...prev, cities: [...prev.cities, next] };
    });
    setEditCityDraft('');
  };

  const removeEditCity = (city: string) => {
    const next = String(city || '').trim();
    if (!next) return;
    setEdit((prev) => ({
      ...prev,
      cities: prev.cities.filter((entry) => entry.toLowerCase() !== next.toLowerCase()),
    }));
  };

  const saveEdit = async () => {
    setError('');
    setMessage('');

    
    if (!editingId) return;

    if (!edit.projectName.trim() || !edit.statusText.trim() || !edit.sourceRef.trim()) {
      setError('Project name, status text, and source reference are required.');
      return;
    }
    if (!edit.sourceUrl.trim()) {
      setError('Official source URL is required.');
      return;
    }
    if (edit.cities.length === 0) {
      setError('Select at least one city.');
      return;
    }

    try {
      await updateInfraUpdate(
        editingId,
        {
          state: edit.state,
          district: edit.district,
          cities: edit.cities,
          category: edit.category,
          projectName: edit.projectName,
          authority: edit.authority,
          projectType: edit.projectType,
          statusText: edit.statusText,
          impactLevel: edit.impactLevel,
          sourceRef: edit.sourceRef,
          sourceUrl: edit.sourceUrl.trim(),
          verificationLevel: edit.verificationLevel,
          lastUpdated: edit.lastUpdated.trim() || null,
        },
        adminToken.trim()
      );
      setMessage('Updated successfully.');
      setEditingId(null);
      setEdit(makeEmptyEdit());
      await fetchItems();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not update.');
    }
  };

  const deleteItem = async (id: number) => {
    setError('');
    setMessage('');

    

    const confirmed = window.confirm('Delete this update? This action cannot be undone.');
    if (!confirmed) return;

    try {
      await deleteInfraUpdate(id, adminToken.trim());
      setMessage('Deleted successfully.');
      if (editingId === id) {
        cancelEdit();
      }
      await fetchItems();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not delete.');
    }
  };

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container zdt-page-stack">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold sm:text-3xl">Admin: Manage Infrastructure Updates</h1>
          <p className="mt-2 text-sm text-slate-600">
            Edit and delete updates. Keep all entries factual and traceable to public sources.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <h2 className="text-lg font-semibold text-slate-950">Admin: Normalized Record Model</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Internal reference only. Every public tender or notice should land in this normalized shape before scoring,
            alerts, and downstream review.
          </p>
          <div className="mt-4 grid gap-3 xl:grid-cols-2">
            {TENDER_MODEL_GROUPS.map((group) => (
              <div key={group.title} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-900">{group.title}</p>
                <p className="mt-2 text-xs leading-5 text-slate-600">{group.fields.join(', ')}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="space-y-1 xl:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Admin Token (required for edit/delete)
              </p>
              <Input
                value={adminToken}
                onChange={(event) => setAdminToken(event.target.value)}
                type="password"
                placeholder="Admin session is active"
                className="h-11 bg-white"
              />
            </label>

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

            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Search</p>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder='Try: "bypass", "widening"'
                className="h-11 bg-white"
              />
            </label>
          </div>
          <LgdLocationAccuracyNote className="mt-2" />

          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Category</p>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value as InfraUpdateCategory | '')}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800"
              >
                <option value="">All</option>
                {CATEGORIES.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Verification</p>
              <select
                value={verificationFilter}
                onChange={(event) =>
                  setVerificationFilter(event.target.value as InfraVerificationLevel | '')
                }
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800"
              >
                <option value="">All</option>
                {VERIFICATION_LEVELS.map((value) => (
                  <option key={value} value={value}>
                    {formatEnumLabel(value)}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end">
              <Button
                type="button"
                onClick={() => void fetchItems()}
                variant="outline"
                className="h-11 rounded-xl px-5"
              >
                Refresh
              </Button>
            </div>
          </div>

          {error ? (
            <p className="mt-3 inline-flex items-center gap-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" />
              {error}
            </p>
          ) : null}

          {message ? (
            <p className="mt-3 inline-flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              {message}
            </p>
          ) : null}
        </div>

        {editingId ? (
          <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">Editing update ID: {editingId}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => void saveEdit()}
                  className="h-10 rounded-xl bg-blue-700 px-4 text-white hover:bg-blue-800"
                >
                  Save
                </Button>
                <Button type="button" variant="outline" onClick={cancelEdit} className="h-10 rounded-xl px-4">
                  Cancel
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">State</p>
                <LgdLocationInput
                  value={edit.state}
                  onChange={(value) => setEdit((prev) => ({ ...prev, state: value }))}
                  className="h-11 bg-white"
                  suggestKind="state"
                  indiaValueField="state"
                />
              </label>
              <label className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">District</p>
                <LgdLocationInput
                  value={edit.district}
                  onChange={(value) => setEdit((prev) => ({ ...prev, district: value }))}
                  className="h-11 bg-white"
                  suggestKind="india"
                  indiaValueField="district"
                />
              </label>
            </div>
            <LgdLocationAccuracyNote className="mt-2" />

            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Cities</p>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <LgdLocationInput
                  value={editCityDraft}
                  onChange={setEditCityDraft}
                  placeholder="Type city and add"
                  className="h-11 bg-white"
                  suggestKind="india"
                  indiaValueField="village"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-xl px-4"
                  onClick={() => addEditCity(editCityDraft)}
                >
                  Add city
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {edit.cities.map((city) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => removeEditCity(city)}
                    className="rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
                  >
                    {city} x
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Category</p>
                <select
                  value={edit.category}
                  onChange={(event) =>
                    setEdit((prev) => ({ ...prev, category: event.target.value as InfraUpdateCategory }))
                  }
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
                  value={edit.impactLevel}
                  onChange={(event) =>
                    setEdit((prev) => ({ ...prev, impactLevel: event.target.value as InfraImpactLevel }))
                  }
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800"
                >
                  {IMPACT_LEVELS.map((value) => (
                    <option key={value} value={value}>
                      {formatEnumLabel(value)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 xl:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Verification Level
                </p>
                <select
                  value={edit.verificationLevel}
                  onChange={(event) =>
                    setEdit((prev) => ({
                      ...prev,
                      verificationLevel: event.target.value as InfraVerificationLevel,
                    }))
                  }
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

            <label className="mt-4 block space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Project Name</p>
              <Input
                value={edit.projectName}
                onChange={(event) => setEdit((prev) => ({ ...prev, projectName: event.target.value }))}
                className="h-11 bg-white"
              />
            </label>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Authority</p>
                <select
                  value={edit.authority}
                  onChange={(event) => setEdit((prev) => ({ ...prev, authority: event.target.value }))}
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
                  value={edit.projectType}
                  onChange={(event) => setEdit((prev) => ({ ...prev, projectType: event.target.value }))}
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

            <label className="mt-4 block space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Current Status</p>
              <textarea
                value={edit.statusText}
                onChange={(event) => setEdit((prev) => ({ ...prev, statusText: event.target.value }))}
                className="min-h-[110px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
              />
            </label>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Source Reference</p>
                <Input
                  value={edit.sourceRef}
                  onChange={(event) => setEdit((prev) => ({ ...prev, sourceRef: event.target.value }))}
                  className="h-11 bg-white"
                />
              </label>
              <label className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Source URL (required)
                </p>
                <Input
                  value={edit.sourceUrl}
                  onChange={(event) => setEdit((prev) => ({ ...prev, sourceUrl: event.target.value }))}
                  className="h-11 bg-white"
                />
              </label>
            </div>

            <label className="mt-4 block space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Last Updated (YYYY-MM-DD)
              </p>
              <Input
                value={edit.lastUpdated}
                onChange={(event) => setEdit((prev) => ({ ...prev, lastUpdated: event.target.value }))}
                className="h-11 bg-white"
              />
            </label>
          </div>
        ) : null}

        <div className="grid gap-4">
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
              Loading updates...
            </div>
          ) : null}

          {!loading && items.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
              No updates found for this filter.
            </div>
          ) : null}

          {!loading &&
            items.map((item) => (
              <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-lg font-semibold text-slate-900">{item.projectName}</p>
                    <p className="text-sm text-slate-600">
                      {item.category.replace(/_/g, ' ')} • Impact {formatEnumLabel(item.impactLevel)} • Verified{' '}
                      {formatEnumLabel(item.verificationLevel)}
                    </p>
                    <p className="text-sm text-slate-700">
                      {Array.isArray(item.cities) ? item.cities.join(', ') : '-'} • {item.authority} •{' '}
                      {item.projectType}
                    </p>
                    <p className="text-sm text-slate-700">{item.statusText}</p>
                    <p className="text-xs text-slate-500">
                      Source: {item.sourceRef}
                      {item.sourceUrl ? ` • ${item.sourceUrl}` : ''}
                    </p>
                  </div>

                  <div className="flex min-w-[170px] flex-col gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 justify-start rounded-xl"
                      onClick={() => startEdit(item)}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 justify-start rounded-xl border-red-200 text-red-700 hover:bg-red-50"
                      onClick={() => void deleteItem(item.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                </div>
              </article>
            ))}
        </div>
      </div>
    </section>
  );
}

