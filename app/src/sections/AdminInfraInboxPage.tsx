import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LgdLocationAccuracyNote, LgdLocationInput } from '@/components/realty/LgdLocationInput';
import {
  getInfraUpdatesMeta,
  getInfraUpdatesMetaAll,
  type InfraImpactLevel,
  type InfraUpdateCategory,
  type InfraVerificationLevel,
} from '@/lib/infrastructureApi';
import {
  getInfraIngestItems,
  ignoreInfraIngestItem,
  publishInfraIngestItem,
  type InfraIngestDupeItem,
  type InfraIngestItem,
  type InfraIngestStatus,
} from '@/lib/infraIngestApi';

const STATUS_OPTIONS: InfraIngestStatus[] = ['NEW', 'PUBLISHED', 'IGNORED'];
const CATEGORIES: Array<{ key: InfraUpdateCategory; label: string }> = [
  { key: 'PROPOSED', label: 'Proposed' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'UNDER_CONSTRUCTION', label: 'Under Construction' },
  { key: 'COMPLETED', label: 'Completed' },
];
const IMPACTS: InfraImpactLevel[] = ['LOW', 'MEDIUM', 'HIGH'];
const VERIFICATIONS: InfraVerificationLevel[] = [
  'PUBLIC_NOTICE',
  'TENDER',
  'OFFICE_CONFIRMED',
  'LOCAL_REPORT',
];

interface PublishForm {
  state: string;
  district: string;
  citiesText: string;
  category: InfraUpdateCategory;
  impactLevel: InfraImpactLevel;
  verificationLevel: InfraVerificationLevel;
  authority: string;
  projectType: string;
  sourceRef: string;
  statusText: string;
  lastUpdated: string;
}

interface MetaAllCache {
  states: string[];
  districts: string[];
  cities: string[];
}

function makePublishForm(): PublishForm {
  return {
    state: '',
    district: '',
    citiesText: '',
    category: 'APPROVED',
    impactLevel: 'MEDIUM',
    verificationLevel: 'PUBLIC_NOTICE',
    authority: 'Government Dept / Agency',
    projectType: 'Infrastructure Update',
    sourceRef: 'PIB',
    statusText: 'Official source update. Please verify project scope and local area mapping before publishing.',
    lastUpdated: '',
  };
}

function formatEnumLabel(value: string): string {
  const normalized = String(value || '').toLowerCase().replace(/_/g, ' ');
  return normalized ? `${normalized[0].toUpperCase()}${normalized.slice(1)}` : '-';
}

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

function classifyIngestText(
  sourceKey: string,
  title: string,
  summary: string | null
): Pick<
  PublishForm,
  'category' | 'impactLevel' | 'projectType' | 'authority' | 'verificationLevel' | 'sourceRef'
> {
  const text = `${title || ''} ${summary || ''}`.toLowerCase();
  const source = String(sourceKey || '').trim().toUpperCase();

  let category: InfraUpdateCategory = 'APPROVED';
  if (
    /\b(completed|inaugurat|dedicat|opened|launched|operation\s*&?\s*maintenance|o\s*&\s*m)\b/.test(
      text
    )
  ) {
    category = 'COMPLETED';
  } else if (/\b(pre[-\s]?construction)\b/.test(text)) {
    category = 'PROPOSED';
  } else if (
    /\b(under construction|construction|work started|groundbreaking|foundation stone|progress)\b/.test(
      text
    )
  ) {
    category = 'UNDER_CONSTRUCTION';
  } else if (/\b(approved|sanctioned|cleared)\b/.test(text)) {
    category = 'APPROVED';
  } else if (/\b(proposed|plan|planning|proposal|dpr|to be|will be)\b/.test(text)) {
    category = 'PROPOSED';
  }

  let impactLevel: InfraImpactLevel = 'MEDIUM';
  if (
    /\b(national|mega|expressway|metro|airport|port|high-speed|corridor|bypass|ring road|flyover|bridge|highway|nh-|bharatmala)\b/.test(
      text
    )
  ) {
    impactLevel = 'HIGH';
  } else if (/\b(minor|small|local|village|panchayat|ward)\b/.test(text)) {
    impactLevel = 'LOW';
  }

  let projectType = 'Infrastructure Update';
  if (/\b(highway|expressway|nh-|road|bridge|flyover|overbridge|bypass|ring road)\b/.test(text)) {
    projectType = 'Road and Highway';
  } else if (/\b(railway|station|train|metro|dfc)\b/.test(text)) {
    projectType = 'Rail and Metro';
  } else if (/\b(airport|runway|aviation)\b/.test(text)) {
    projectType = 'Airport and Aviation';
  } else if (/\b(port|harbour|shipping|waterway)\b/.test(text)) {
    projectType = 'Ports and Waterways';
  } else if (/\b(power|substation|electric|solar|wind|grid)\b/.test(text)) {
    projectType = 'Power and Energy';
  } else if (/\b(water supply|drinking water|pipeline|sewer|drainage|amrut|jal)\b/.test(text)) {
    projectType = 'Water and Urban';
  } else if (/\b(hospital|medical|health)\b/.test(text)) {
    projectType = 'Healthcare';
  } else if (/\b(school|college|university|education)\b/.test(text)) {
    projectType = 'Education';
  }

  let authority = 'Government Dept / Agency';
  if (/\bnhai\b/.test(text)) {
    authority = 'NHAI';
  } else if (/\b(ministry of railways|railway)\b/.test(text)) {
    authority = 'Ministry of Railways';
  } else if (/\b(ministry of road transport|morth)\b/.test(text)) {
    authority = 'MoRTH';
  } else if (/\b(ministry of civil aviation)\b/.test(text)) {
    authority = 'Ministry of Civil Aviation';
  } else if (/\b(ministry of power)\b/.test(text)) {
    authority = 'Ministry of Power';
  }

  let verificationLevel: InfraVerificationLevel = 'PUBLIC_NOTICE';
  if (source.startsWith('ETENDERS') || source.startsWith('EPROCURE')) {
    verificationLevel = 'TENDER';
  } else if (source.startsWith('PPPINDIA') || source.startsWith('PPP')) {
    verificationLevel = 'OFFICE_CONFIRMED';
  } else if (/\b(tender|bid|contract|eprocurement|e-procurement)\b/.test(text)) {
    verificationLevel = 'TENDER';
  } else if (/\b(office confirmed|authority confirmed)\b/.test(text)) {
    verificationLevel = 'OFFICE_CONFIRMED';
  } else if (/\b(local report|field report|site visit)\b/.test(text)) {
    verificationLevel = 'LOCAL_REPORT';
  }

  let sourceRef = 'Official Source';
  if (source.startsWith('PIB')) {
    sourceRef = 'PIB';
  } else if (source.startsWith('ETENDERS')) {
    sourceRef = 'eTenders';
  } else if (source.startsWith('EPROCURE')) {
    sourceRef = 'eProcure';
  } else if (source.startsWith('PPPINDIA') || source.startsWith('PPP')) {
    sourceRef = 'PPP India';
  } else if (source) {
    sourceRef = source;
  }

  return { category, impactLevel, projectType, authority, verificationLevel, sourceRef };
}

function norm(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findBestMatch(text: string, candidates: string[]): string {
  const haystack = ` ${norm(text)} `;
  let best = '';
  let bestScore = 0;

  for (const candidate of candidates) {
    const needle = norm(candidate);
    if (!needle) continue;
    const matched = haystack.includes(` ${needle} `);
    if (!matched) continue;
    if (needle.length > bestScore) {
      best = candidate;
      bestScore = needle.length;
    }
  }
  return best;
}

function findManyMatches(text: string, candidates: string[], maxItems = 6): string[] {
  const haystack = ` ${norm(text)} `;
  const hits: Array<{ value: string; score: number }> = [];

  for (const candidate of candidates) {
    const needle = norm(candidate);
    if (!needle) continue;
    if (!haystack.includes(` ${needle} `)) continue;
    hits.push({ value: candidate, score: needle.length });
  }

  hits.sort((left, right) => right.score - left.score);
  return hits.slice(0, maxItems).map((entry) => entry.value);
}

function parseCitiesText(value: string): string[] {
  return Array.from(
    new Set(
      String(value || '')
        .split(',')
        .map((city) => city.trim())
        .filter(Boolean)
    )
  );
}

export default function AdminInfraInboxPage() {
  const [adminToken, setAdminToken] = useState('');
  const [status, setStatus] = useState<InfraIngestStatus>('NEW');
  const [q, setQ] = useState('');

  const [items, setItems] = useState<InfraIngestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [lastPublishedId, setLastPublishedId] = useState<number | null>(null);

  const [publishId, setPublishId] = useState<number | null>(null);
  const [form, setForm] = useState<PublishForm>(makePublishForm());
  const [dupeWarn, setDupeWarn] = useState<{
    message: string;
    dupes: InfraIngestDupeItem[];
  } | null>(null);

  const [stateSug, setStateSug] = useState<string[]>([]);
  const [districtSug, setDistrictSug] = useState<string[]>([]);
  const [citySug, setCitySug] = useState<string[]>([]);

  const [metaAll, setMetaAll] = useState<MetaAllCache>({
    states: [],
    districts: [],
    cities: [],
  });
  const [metaAllLoaded, setMetaAllLoaded] = useState(false);

  const currentPublishItem = useMemo(
    () => items.find((item) => item.id === publishId) || null,
    [items, publishId]
  );

  const matchedCitiesFromDb = useMemo(() => {
    if (!currentPublishItem) return [];
    if (metaAll.cities.length === 0) return [];
    return findManyMatches(
      `${currentPublishItem.title || ''} ${currentPublishItem.summary || ''}`,
      metaAll.cities,
      8
    );
  }, [currentPublishItem, metaAll.cities]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setMessage('');

    if (!adminToken.trim()) {
      setItems([]);
      setLoading(false);
      return;
    }

    try {
      const response = await getInfraIngestItems(
        {
          status,
          q: q.trim() || undefined,
        },
        adminToken.trim()
      );
      setItems(Array.isArray(response.items) ? response.items : []);
    } catch (requestError) {
      setItems([]);
      setError(requestError instanceof Error ? requestError.message : 'Could not load inbox.');
    } finally {
      setLoading(false);
    }
  }, [adminToken, q, status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!publishId) return undefined;

    let active = true;
    const loadMeta = async () => {
      try {
        const queryText = String(form.citiesText || form.district || form.state || '')
          .trim()
          .slice(0, 40);
        const response = await getInfraUpdatesMeta({
          state: form.state.trim() || undefined,
          district: form.district.trim() || undefined,
          q: queryText || undefined,
        });
        if (!active) return;
        setStateSug(Array.isArray(response.states) ? response.states : []);
        setDistrictSug(Array.isArray(response.districts) ? response.districts : []);
        setCitySug(Array.isArray(response.cities) ? response.cities : []);
      } catch {
        if (!active) return;
        setStateSug([]);
        setDistrictSug([]);
        setCitySug([]);
      }
    };

    void loadMeta();
    return () => {
      active = false;
    };
  }, [form.citiesText, form.district, form.state, publishId]);

  useEffect(() => {
    if (!publishId || !adminToken.trim() || metaAllLoaded) return undefined;

    let active = true;
    const loadMetaAll = async () => {
      try {
        const response = await getInfraUpdatesMetaAll(adminToken.trim());
        if (!active) return;
        setMetaAll({
          states: Array.isArray(response.states) ? response.states : [],
          districts: Array.isArray(response.districts) ? response.districts : [],
          cities: Array.isArray(response.cities) ? response.cities : [],
        });
        setMetaAllLoaded(true);
      } catch {
        if (!active) return;
        setMetaAllLoaded(false);
      }
    };

    void loadMetaAll();
    return () => {
      active = false;
    };
  }, [adminToken, metaAllLoaded, publishId]);

  useEffect(() => {
    if (!publishId || !metaAllLoaded || !currentPublishItem) return;

    const hasMappedPlaces =
      form.state.trim() || form.district.trim() || form.citiesText.trim();
    if (hasMappedPlaces) return;

    const blob = `${currentPublishItem.title || ''} ${currentPublishItem.summary || ''}`;
    const stateGuess = findBestMatch(blob, metaAll.states);
    const districtGuess = findBestMatch(blob, metaAll.districts);
    const cityGuess = findManyMatches(blob, metaAll.cities, 4);

    setForm((prev) => ({
      ...prev,
      state: stateGuess || prev.state,
      district: districtGuess || prev.district,
      citiesText: cityGuess.length > 0 ? cityGuess.join(', ') : prev.citiesText,
    }));
  }, [
    currentPublishItem,
    form.citiesText,
    form.district,
    form.state,
    metaAll.cities,
    metaAll.districts,
    metaAll.states,
    metaAllLoaded,
    publishId,
  ]);

  const openPublish = (item: InfraIngestItem) => {
    setError('');
    setMessage('');
    setDupeWarn(null);
    setLastPublishedId(null);
    setPublishId(item.id);

    const guessed = classifyIngestText(item.sourceKey, item.title, item.summary);
    const blob = `${item.title || ''} ${item.summary || ''}`;
    const stateGuess = metaAll.states.length > 0 ? findBestMatch(blob, metaAll.states) : '';
    const districtGuess =
      metaAll.districts.length > 0 ? findBestMatch(blob, metaAll.districts) : '';
    const cityGuesses = metaAll.cities.length > 0 ? findManyMatches(blob, metaAll.cities, 4) : [];

    setForm({
      state: stateGuess || '',
      district: districtGuess || '',
      citiesText: cityGuesses.join(', '),
      category: guessed.category,
      impactLevel: guessed.impactLevel,
      verificationLevel: guessed.verificationLevel,
      authority: guessed.authority,
      projectType: guessed.projectType,
      sourceRef: guessed.sourceRef,
      statusText:
        'Official source update. Please verify project scope and local area mapping before publishing.',
      lastUpdated: item.publishedAt ? String(item.publishedAt).slice(0, 10) : '',
    });
  };

  const closePublish = () => {
    setPublishId(null);
    setForm(makePublishForm());
    setDupeWarn(null);
    setStateSug([]);
    setDistrictSug([]);
    setCitySug([]);
  };

  const addCityToForm = (city: string) => {
    const value = String(city || '').trim();
    if (!value) return;

    setForm((prev) => {
      const existing = parseCitiesText(prev.citiesText).map((entry) => entry.toLowerCase());
      if (existing.includes(value.toLowerCase())) {
        return prev;
      }
      const nextText = prev.citiesText.trim() ? `${prev.citiesText.trim()}, ${value}` : value;
      return { ...prev, citiesText: nextText };
    });
  };

  const ignoreItem = async (id: number) => {
    setError('');
    setMessage('');

    if (!adminToken.trim()) {
      setError('Admin token required.');
      return;
    }

    const reason = window.prompt('Ignore reason (optional):') || '';
    try {
      await ignoreInfraIngestItem(id, reason, adminToken.trim());
      setMessage('Ignored.');
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not ignore item.');
    }
  };

  const publishNow = async (force = false) => {
    setError('');
    setMessage('');

    if (!adminToken.trim()) {
      setError('Admin token required.');
      return;
    }
    if (!publishId) return;

    const cities = parseCitiesText(form.citiesText);
    if (!form.state.trim() || !form.district.trim() || cities.length === 0) {
      setError('State, district, and at least one city are required.');
      return;
    }
    if (!form.authority.trim() || !form.projectType.trim() || !form.statusText.trim()) {
      setError('Authority, project type, and status text are required.');
      return;
    }
    if (!form.sourceRef.trim()) {
      setError('Source reference is required.');
      return;
    }

    const result = await publishInfraIngestItem(
      publishId,
      {
        state: form.state,
        district: form.district,
        cities,
        category: form.category,
        impactLevel: form.impactLevel,
        authority: form.authority,
        projectType: form.projectType,
        statusText: form.statusText,
        verificationLevel: form.verificationLevel,
        sourceRef: form.sourceRef,
        lastUpdated: form.lastUpdated.trim() || null,
        force,
      },
      adminToken.trim()
    );

    if (!result.ok) {
      if (result.status === 409) {
        setDupeWarn({
          message: result.error || 'Possible duplicate detected',
          dupes: result.dupes,
        });
        return;
      }
      setError(result.error || 'Could not publish item.');
      return;
    }

    setDupeWarn(null);
    setLastPublishedId(result.publishedUpdateId > 0 ? result.publishedUpdateId : null);
    setMessage(`Published. Update ID: ${result.publishedUpdateId}`);
    closePublish();
    await load();
  };

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container zdt-page-stack">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold sm:text-3xl">Admin: Infra Inbox (Automation)</h1>
          <p className="mt-2 text-sm text-slate-600">
            Auto-collected items land here. Publish only after mapping state, district, and cities correctly.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1 xl:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Admin Token</p>
              <Input
                value={adminToken}
                onChange={(event) => setAdminToken(event.target.value)}
                type="password"
                placeholder="Enter ADMIN_TOKEN"
                className="h-11 bg-white"
              />
            </label>

            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Status</p>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as InfraIngestStatus)}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Search</p>
              <Input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="title / summary / link"
                className="h-11 bg-white"
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" className="h-10 rounded-xl px-4" onClick={() => void load()}>
              Refresh
            </Button>
            {lastPublishedId ? (
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl px-4"
                onClick={() => {
                  window.location.href = `/admin/infra/preview/${lastPublishedId}`;
                }}
              >
                Open published item
              </Button>
            ) : null}
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
          </div>
        </div>

        {publishId ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">Publish inbox item ID: {publishId}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="h-10 rounded-xl bg-blue-700 px-4 text-white hover:bg-blue-800"
                  onClick={() => void publishNow(false)}
                >
                  Publish
                </Button>
                <Button type="button" variant="outline" className="h-10 rounded-xl px-4" onClick={closePublish}>
                  Cancel
                </Button>
              </div>
            </div>

            {dupeWarn ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-semibold text-red-700">{dupeWarn.message}</p>
                <p className="mt-1 text-xs text-red-700/90">
                  Similar updates were found for the same area and timeframe. Review and publish only if this item is
                  genuinely new.
                </p>
                <div className="mt-3 grid gap-2">
                  {dupeWarn.dupes.map((dupe) => (
                    <article key={dupe.id} className="rounded-lg border border-red-200 bg-white p-3">
                      <p className="text-sm font-semibold text-slate-900">{dupe.projectName}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {dupe.state} | {dupe.district} | {dupe.cities.join(', ') || '-'}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        Updated: {String(dupe.lastUpdated || '').slice(0, 10)} | ID: {dupe.id}
                      </p>
                      {dupe.sourceUrl ? (
                        <a
                          href={dupe.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700 underline"
                        >
                          Open source
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </article>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className="h-10 rounded-xl bg-blue-700 px-4 text-white hover:bg-blue-800"
                    onClick={() => void publishNow(true)}
                  >
                    Publish anyway
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-xl px-4"
                    onClick={() => setDupeWarn(null)}
                  >
                    Cancel warning
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">State</p>
                <LgdLocationInput
                  value={form.state}
                  onChange={(value) => setForm((prev) => ({ ...prev, state: value }))}
                  placeholder="Type state (e.g., Maharashtra)"
                  className="h-11 bg-white"
                  suggestKind="state"
                  indiaValueField="state"
                />
              </label>

              <label className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">District</p>
                <LgdLocationInput
                  value={form.district}
                  onChange={(value) => setForm((prev) => ({ ...prev, district: value }))}
                  placeholder="Type district (e.g., Pune)"
                  className="h-11 bg-white"
                  suggestKind="india"
                  indiaValueField="district"
                />
              </label>
            </div>
            <LgdLocationAccuracyNote className="mt-2" />

            {metaAllLoaded ? (
              <p className="mt-2 text-xs text-slate-500">
                Auto-suggested places are matched from source text against your existing tracker DB values.
              </p>
            ) : null}

            <label className="mt-4 block space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Cities (comma separated)
              </p>
              <Input
                value={form.citiesText}
                onChange={(event) => setForm((prev) => ({ ...prev, citiesText: event.target.value }))}
                list="inbox-city-suggestions"
                placeholder="Type cities (comma separated): Pune, Pimpri-Chinchwad"
                className="h-11 bg-white"
              />
            </label>

            {citySug.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-xs text-slate-500">Suggested cities:</p>
                {citySug.slice(0, 8).map((cityName) => (
                  <Button
                    key={cityName}
                    type="button"
                    variant="outline"
                    className="h-8 rounded-full px-3 text-xs"
                    onClick={() => addCityToForm(cityName)}
                  >
                    + {cityName}
                  </Button>
                ))}
              </div>
            ) : null}

            {matchedCitiesFromDb.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-xs text-slate-500">Matched cities (from DB):</p>
                {matchedCitiesFromDb.map((cityName) => (
                  <Button
                    key={cityName}
                    type="button"
                    variant="outline"
                    className="h-8 rounded-full px-3 text-xs"
                    onClick={() => addCityToForm(cityName)}
                  >
                    + {cityName}
                  </Button>
                ))}
              </div>
            ) : null}

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Category</p>
                <select
                  value={form.category}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, category: event.target.value as InfraUpdateCategory }))
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
                  value={form.impactLevel}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, impactLevel: event.target.value as InfraImpactLevel }))
                  }
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800"
                >
                  {IMPACTS.map((option) => (
                    <option key={option} value={option}>
                      {formatEnumLabel(option)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Verification</p>
                <select
                  value={form.verificationLevel}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      verificationLevel: event.target.value as InfraVerificationLevel,
                    }))
                  }
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800"
                >
                  {VERIFICATIONS.map((option) => (
                    <option key={option} value={option}>
                      {formatEnumLabel(option)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Authority</p>
                <Input
                  value={form.authority}
                  onChange={(event) => setForm((prev) => ({ ...prev, authority: event.target.value }))}
                  className="h-11 bg-white"
                />
              </label>

              <label className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Project Type</p>
                <Input
                  value={form.projectType}
                  onChange={(event) => setForm((prev) => ({ ...prev, projectType: event.target.value }))}
                  className="h-11 bg-white"
                />
              </label>

              <label className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Source Ref</p>
                <Input
                  value={form.sourceRef}
                  onChange={(event) => setForm((prev) => ({ ...prev, sourceRef: event.target.value }))}
                  className="h-11 bg-white"
                />
              </label>
            </div>

            <label className="mt-4 block space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Status Text</p>
              <textarea
                value={form.statusText}
                onChange={(event) => setForm((prev) => ({ ...prev, statusText: event.target.value }))}
                className="min-h-[110px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
              />
            </label>

            <label className="mt-4 block space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Last Updated (YYYY-MM-DD)
              </p>
              <Input
                value={form.lastUpdated}
                onChange={(event) => setForm((prev) => ({ ...prev, lastUpdated: event.target.value }))}
                className="h-11 bg-white"
              />
            </label>

            <p className="mt-3 text-xs text-slate-500">
              Verification and source reference are auto-suggested from source type and text. Always verify before
              publishing.
            </p>
          </div>
        ) : null}

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {loading ? <p className="text-sm text-slate-600">Loading...</p> : null}
          {!loading && adminToken.trim() ? (
            <p className="text-sm text-slate-600">
              Items shown: <strong>{items.length}</strong>
            </p>
          ) : null}

          <div className="mt-3 grid gap-3">
            {!loading &&
              items.map((item) => (
                <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-lg font-semibold text-slate-900">{item.title}</p>
                      <p className="text-xs text-slate-600">
                        Status: <strong>{item.status}</strong> | Published: {formatDateTime(item.publishedAt)}
                        {item.sourceKey ? ` | Source: ${item.sourceKey}` : ''}
                        {item.publishedUpdateId ? ` | Update ID: ${item.publishedUpdateId}` : ''}
                      </p>
                      {item.summary ? <p className="text-sm text-slate-700">{item.summary}</p> : null}
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 underline"
                      >
                        Open source
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>

                    {item.status === 'NEW' ? (
                      <div className="flex min-w-[170px] flex-col gap-2">
                        <Button
                          type="button"
                          className="h-10 rounded-xl bg-blue-700 px-4 text-white hover:bg-blue-800"
                          onClick={() => openPublish(item)}
                        >
                          Publish
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 rounded-xl px-4"
                          onClick={() => void ignoreItem(item.id)}
                        >
                          Ignore
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  {item.ignoredReason ? (
                    <p className="mt-3 text-xs text-slate-500">Ignored reason: {item.ignoredReason}</p>
                  ) : null}
                </article>
              ))}

            {!loading && adminToken.trim() && items.length === 0 ? (
              <p className="text-sm text-slate-500">No items found.</p>
            ) : null}
          </div>
        </div>

        <datalist id="inbox-state-suggestions">
          {stateSug.map((entry) => (
            <option key={entry} value={entry} />
          ))}
        </datalist>
        <datalist id="inbox-district-suggestions">
          {districtSug.map((entry) => (
            <option key={entry} value={entry} />
          ))}
        </datalist>
        <datalist id="inbox-city-suggestions">
          {citySug.map((entry) => (
            <option key={entry} value={entry} />
          ))}
        </datalist>
      </div>
    </section>
  );
}
