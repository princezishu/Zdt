import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Copy, ExternalLink, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LgdLocationAccuracyNote, LgdLocationInput } from '@/components/realty/LgdLocationInput';
import { getGeoStates } from '@/lib/geoApi';
import {
  getInfraUpdates,
  type InfraSortKey,
  type InfraUpdateCategory,
  type InfraUpdateItem,
  type InfraVerificationLevel,
} from '@/lib/infrastructureApi';
import { createInfraSubscription, type InfraSubscriptionChannel } from '@/lib/infraSubscriptionsApi';
import { readIndiaLocationSelection } from '@/lib/indiaLocationSelection';

type CategoryScope = InfraUpdateCategory | 'ALL' | 'FOCUS';
type VerificationScope = 'VERIFIED_ONLY' | 'VERIFIED_AND_SOURCE' | 'ALL';
type LocationScope = 'all' | 'state';

type RecentLocation =
  | { scope: 'all'; label: 'All India' }
  | { scope: 'state'; stateCode: string; stateName: string; label: string };

interface InfrastructureTrackerPageProps {
  onOpenListProject?: () => void;
  onOpenPartnershipCall?: () => void;
}

const CATEGORY_OPTIONS: Array<{ key: CategoryScope; label: string }> = [
  { key: 'FOCUS', label: 'Approved + Under Construction' },
  { key: 'ALL', label: 'All' },
  { key: 'PROPOSED', label: 'Proposed' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'UNDER_CONSTRUCTION', label: 'Under Construction' },
  { key: 'COMPLETED', label: 'Completed' },
];

const CATEGORY_SECTION_ORDER: InfraUpdateCategory[] = [
  'APPROVED',
  'UNDER_CONSTRUCTION',
  'PROPOSED',
  'COMPLETED',
];

const VERIFICATION_OPTIONS: Array<{ key: VerificationScope; label: string }> = [
  { key: 'VERIFIED_AND_SOURCE', label: 'Verified + Source-only (Default)' },
  { key: 'VERIFIED_ONLY', label: 'Verified only (Tender + Public Notice)' },
  { key: 'ALL', label: 'All public levels' },
];

const SORT_OPTIONS: Array<{ key: InfraSortKey; label: string }> = [
  { key: 'smart', label: 'Smart (Verified + Latest)' },
  { key: 'newest', label: 'Newest first' },
  { key: 'impact', label: 'Highest impact first' },
  { key: 'verified', label: 'Most verified first' },
];

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
const RECENTS_KEY = 'infra_tracker_recent_locations_v1';

function formatEnumLabel(value: string): string {
  const normalized = String(value || '').toLowerCase().replace(/_/g, ' ');
  if (!normalized) return '-';
  return `${normalized[0].toUpperCase()}${normalized.slice(1)}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toISOString().slice(0, 10);
}

function ageInDays(value: string): number | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function daysAgo(value: string): string {
  const diffDays = ageInDays(value);
  if (diffDays == null) return '';
  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return '1 day ago';
  return `${diffDays} days ago`;
}

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

function parseCsvUpper(value: string | null): string[] {
  return Array.from(
    new Set(
      String(value || '')
        .split(',')
        .map((entry) => entry.trim().toUpperCase())
        .filter(Boolean)
    )
  );
}

function normalizeCategory(params: URLSearchParams): CategoryScope {
  const single = String(params.get('category') || '').trim().toUpperCase();
  if (single && CATEGORY_OPTIONS.some((option) => option.key === single)) return single as CategoryScope;

  const multi = parseCsvUpper(params.get('categories'));
  if (multi.length > 0) {
    if (multi.includes('APPROVED') && multi.includes('UNDER_CONSTRUCTION')) return 'FOCUS';
    if (multi.length === 1 && CATEGORY_OPTIONS.some((option) => option.key === multi[0])) {
      return multi[0] as CategoryScope;
    }
    return 'ALL';
  }

  return 'FOCUS';
}

function normalizeVerification(params: URLSearchParams): VerificationScope {
  const single = String(params.get('verification_level') || '').trim().toUpperCase();
  const multi = parseCsvUpper(params.get('verification_levels'));

  if (single === 'PUBLIC_NOTICE' || single === 'TENDER') return 'VERIFIED_ONLY';
  if (multi.includes('PUBLIC_NOTICE') && multi.includes('TENDER') && multi.includes('SOURCE_ONLY')) {
    return 'VERIFIED_AND_SOURCE';
  }
  if (multi.includes('PUBLIC_NOTICE') && multi.includes('TENDER') && multi.length <= 2) {
    return 'VERIFIED_ONLY';
  }
  if (single || multi.length > 0) return 'ALL';

  return 'VERIFIED_AND_SOURCE';
}
function normalizeScope(params: URLSearchParams): LocationScope {
  const rawScope = String(params.get('scope') || '').trim().toLowerCase();
  if (rawScope === 'state') {
    const state = String(params.get('state') || '').trim();
    const stateCode = String(params.get('state_code') || '').trim();
    return state || stateCode ? 'state' : 'all';
  }
  if (rawScope === 'all') return 'all';
  return 'all';
}

function normalizeSort(value: string | null): InfraSortKey {
  const normalized = String(value || '').trim().toLowerCase();
  if (SORT_OPTIONS.some((option) => option.key === normalized)) return normalized as InfraSortKey;
  return 'smart';
}

function normalizePageSize(value: string | null): number {
  const parsed = parsePositiveInt(value, 20);
  if (PAGE_SIZE_OPTIONS.includes(parsed as (typeof PAGE_SIZE_OPTIONS)[number])) return parsed;
  return 20;
}

function parseRecentLocation(raw: unknown): RecentLocation | null {
  const value = raw as Record<string, unknown>;
  const scope = String(value?.scope || '').trim().toLowerCase();
  if (scope === 'all') return { scope: 'all', label: 'All India' };
  if (scope !== 'state') return null;

  const stateCode = String(value?.stateCode || '').trim();
  const stateName = String(value?.stateName || '').trim();
  if (!stateName) return null;

  return {
    scope: 'state',
    stateCode,
    stateName,
    label: `State: ${stateName}`,
  };
}

function loadRecentLocations(): RecentLocation[] {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const items = parsed
      .map((entry) => parseRecentLocation(entry))
      .filter((entry): entry is RecentLocation => Boolean(entry));
    return items.slice(0, 8);
  } catch {
    return [];
  }
}

function recentLocationKey(item: RecentLocation): string {
  if (item.scope === 'all') return 'all';
  return `state:${item.stateCode.trim().toUpperCase()}|${item.stateName.trim().toLowerCase()}`;
}

function isTopPriority(item: InfraUpdateItem): boolean {
  const verification = String(item.verificationLevel || '').toUpperCase();
  const verified = verification === 'PUBLIC_NOTICE' || verification === 'TENDER';
  const sourceOnly = verification === 'SOURCE_ONLY';
  const impactHigh = String(item.impactLevel || '').toUpperCase() === 'HIGH';
  const ageDays = ageInDays(item.lastUpdated);

  const updatedWithin30Days = ageDays != null && ageDays <= 30;
  const updatedWithin7Days = ageDays != null && ageDays <= 7;

  if (verified && impactHigh) return true;
  if (verified && updatedWithin30Days) return true;
  if (sourceOnly && impactHigh && updatedWithin7Days) return true;
  return false;
}

function getVerificationBadge(level: InfraVerificationLevel) {
  const normalized = String(level || '').toUpperCase();
  if (normalized === 'TENDER') {
    return {
      label: 'Verified: Tender',
      className: 'border-emerald-300 bg-emerald-100 text-emerald-900',
    };
  }
  if (normalized === 'PUBLIC_NOTICE') {
    return {
      label: 'Verified: Public Notice',
      className: 'border-sky-300 bg-sky-100 text-sky-900',
    };
  }
  if (normalized === 'SOURCE_ONLY') {
    return {
      label: 'Source link (Unverified)',
      className: 'border-amber-300 bg-amber-100 text-amber-900',
    };
  }
  return {
    label: `Verified: ${formatEnumLabel(level || 'UNKNOWN')}`,
    className: 'border-slate-300 bg-slate-100 text-slate-800',
  };
}

function SourceLine({ sourceRef, sourceUrl }: { sourceRef: string; sourceUrl: string | null }) {
  const cleanRef = String(sourceRef || '').trim();
  const cleanUrl = String(sourceUrl || '').trim();
  if (!cleanUrl) return <span>{cleanRef || '-'}</span>;

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {cleanRef ? <span>{cleanRef}</span> : null}
      {cleanRef ? <span className="text-slate-400">|</span> : null}
      <a
        href={cleanUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 font-medium text-blue-700 underline"
      >
        View official source
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </span>
  );
}

export default function InfrastructureTrackerPage({
  onOpenListProject,
  onOpenPartnershipCall,
}: InfrastructureTrackerPageProps) {
  const initialParams = useMemo(
    () => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()),
    []
  );
  const defaultLocation = useMemo(
    () => (typeof window !== 'undefined' ? readIndiaLocationSelection() : null),
    []
  );
  const initialScope = useMemo(() => normalizeScope(initialParams), [initialParams]);

  const [locationScope, setLocationScope] = useState<LocationScope>(initialScope);
  const [stateName, setStateName] = useState(() =>
    initialScope === 'state' ? String(initialParams.get('state') || defaultLocation?.state || '').trim() : ''
  );
  const [stateCode, setStateCode] = useState(() =>
    initialScope === 'state' ? String(initialParams.get('state_code') || defaultLocation?.stateCode || '').trim() : ''
  );

  const [category, setCategory] = useState<CategoryScope>(() => normalizeCategory(initialParams));
  const [verificationMode, setVerificationMode] = useState<VerificationScope>(() => normalizeVerification(initialParams));
  const [q, setQ] = useState(() => initialParams.get('q') || '');
  const [sort, setSort] = useState<InfraSortKey>(() => normalizeSort(initialParams.get('sort')));
  const [page, setPage] = useState(() => parsePositiveInt(initialParams.get('page'), 1));
  const [pageSize, setPageSize] = useState(() => normalizePageSize(initialParams.get('pageSize')));

  const [items, setItems] = useState<InfraUpdateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [copyMessage, setCopyMessage] = useState('');

  const [recentLocations, setRecentLocations] = useState<RecentLocation[]>(() =>
    typeof window !== 'undefined' ? loadRecentLocations() : []
  );

  const [subState, setSubState] = useState(
    () => String(initialParams.get('state') || defaultLocation?.state || '').trim()
  );
  const [subDistrict, setSubDistrict] = useState(() => String(defaultLocation?.district || '').trim());
  const [subCity, setSubCity] = useState(() => String(defaultLocation?.place || '').trim());
  const [subChannel, setSubChannel] = useState<InfraSubscriptionChannel>('WHATSAPP');
  const [subContact, setSubContact] = useState('');
  const [subLoading, setSubLoading] = useState(false);
  const [subError, setSubError] = useState('');
  const [subMessage, setSubMessage] = useState('');
  const requestParams = useMemo(() => {
    const categories =
      category === 'FOCUS' ? (['APPROVED', 'UNDER_CONSTRUCTION'] as InfraUpdateCategory[]) : undefined;
    const categoryValue =
      category === 'ALL' || category === 'FOCUS' ? undefined : (category as InfraUpdateCategory);

    const verificationLevels =
      verificationMode === 'VERIFIED_ONLY'
        ? (['PUBLIC_NOTICE', 'TENDER'] as InfraVerificationLevel[])
        : verificationMode === 'VERIFIED_AND_SOURCE'
          ? (['PUBLIC_NOTICE', 'TENDER', 'SOURCE_ONLY'] as InfraVerificationLevel[])
          : undefined;

    return {
      scope: locationScope,
      stateCode: locationScope === 'state' ? stateCode.trim() || undefined : undefined,
      state: locationScope === 'state' ? stateName.trim() || undefined : undefined,
      category: categoryValue,
      categories,
      verificationLevels,
      q: q.trim() || undefined,
      sort,
      page,
      pageSize,
    };
  }, [category, locationScope, page, pageSize, q, sort, stateCode, stateName, verificationMode]);

  const grouped = useMemo(() => {
    if (category !== 'ALL') return null;
    const groups: Record<InfraUpdateCategory, InfraUpdateItem[]> = {
      PROPOSED: [],
      APPROVED: [],
      UNDER_CONSTRUCTION: [],
      COMPLETED: [],
    };
    for (const item of items) {
      if (groups[item.category]) groups[item.category].push(item);
    }
    return groups;
  }, [category, items]);

  const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = total === 0 ? 0 : Math.min(page * pageSize, total);
  const needsStateSelection = locationScope === 'state' && !stateName.trim();

  const saveRecentLocation = (location: RecentLocation) => {
    setRecentLocations((prev) => {
      const deduped = [
        location,
        ...prev.filter((entry) => recentLocationKey(entry) !== recentLocationKey(location)),
      ].slice(0, 8);
      try {
        window.localStorage.setItem(RECENTS_KEY, JSON.stringify(deduped));
      } catch {
        // ignore localStorage errors
      }
      return deduped;
    });
  };

  const applyAllIndiaScope = () => {
    setLocationScope('all');
    setStateName('');
    setStateCode('');
    setPage(1);
    saveRecentLocation({ scope: 'all', label: 'All India' });
  };

  const applyStateScope = (name: string, code = '') => {
    setLocationScope('state');
    setStateName(name);
    setStateCode(code);
    setSubState(name);
    setPage(1);

    const cleanName = String(name || '').trim();
    if (cleanName) {
      saveRecentLocation({
        scope: 'state',
        stateCode: String(code || '').trim(),
        stateName: cleanName,
        label: `State: ${cleanName}`,
      });
    }
  };

  const resetFiltersToAllIndia = () => {
    applyAllIndiaScope();
    setCategory('FOCUS');
    setVerificationMode('VERIFIED_AND_SOURCE');
    setQ('');
    setSort('smart');
    setPageSize(20);
    setPage(1);
  };

  useEffect(() => {
    let active = true;

    if (locationScope !== 'state') {
      return () => {
        active = false;
      };
    }

    const qState = stateName.trim();
    if (!qState || qState.length < 2) {
      setStateCode('');
      return () => {
        active = false;
      };
    }

    const timer = window.setTimeout(async () => {
      try {
        const response = await getGeoStates({ q: qState, limit: 25 });
        if (!active) return;

        const rows = Array.isArray(response.items) ? response.items : [];
        const exact = rows.find(
          (item) => String(item.name || '').trim().toLowerCase() === qState.toLowerCase()
        );

        if (exact && String(exact.code || '').trim()) {
          const resolvedCode = String(exact.code || '').trim();
          setStateCode(resolvedCode);
          saveRecentLocation({
            scope: 'state',
            stateCode: resolvedCode,
            stateName: String(exact.name || qState).trim(),
            label: `State: ${String(exact.name || qState).trim()}`,
          });
        } else {
          setStateCode('');
        }
      } catch {
        if (!active) return;
        setStateCode('');
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [locationScope, stateName]);

  useEffect(() => {
    let active = true;

    if (needsStateSelection) {
      setItems([]);
      setTotal(0);
      setTotalPages(1);
      setError('');
      return () => {
        active = false;
      };
    }

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await getInfraUpdates(requestParams);
        if (!active) return;
        setItems(Array.isArray(response.items) ? response.items : []);
        setTotal(Number(response.total || 0));
        setTotalPages(Math.max(1, Number(response.totalPages || 1)));
      } catch (requestError) {
        if (!active) return;
        setItems([]);
        setTotal(0);
        setTotalPages(1);
        setError(requestError instanceof Error ? requestError.message : 'Could not load updates.');
      } finally {
        if (!active) return;
        setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [needsStateSelection, requestParams]);

  useEffect(() => {
    const params = new URLSearchParams();

    params.set('scope', locationScope);
    if (locationScope === 'state') {
      if (stateName.trim()) params.set('state', stateName.trim());
      if (stateCode.trim()) params.set('state_code', stateCode.trim());
    }

    if (category === 'FOCUS') {
      params.set('categories', 'APPROVED,UNDER_CONSTRUCTION');
    } else if (category !== 'ALL') {
      params.set('category', category);
    }

    if (verificationMode === 'VERIFIED_ONLY') {
      params.set('verification_levels', 'PUBLIC_NOTICE,TENDER');
    } else if (verificationMode === 'VERIFIED_AND_SOURCE') {
      params.set('verification_levels', 'PUBLIC_NOTICE,TENDER,SOURCE_ONLY');
    }

    if (q.trim()) params.set('q', q.trim());

    params.set('sort', sort);
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));

    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`;
    const currentUrl = `${window.location.pathname}${window.location.search}`;

    if (nextUrl !== currentUrl) {
      window.history.replaceState(window.history.state, '', nextUrl);
    }
  }, [category, locationScope, page, pageSize, q, sort, stateCode, stateName, verificationMode]);
  const handleCopyShareLink = async () => {
    setCopyMessage('');
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyMessage('Link copied.');
    } catch {
      setCopyMessage('Could not copy automatically. Copy from the address bar.');
    }
  };

  const submitSubscription = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubError('');
    setSubMessage('');

    if (!subState.trim() || !subDistrict.trim() || !subCity.trim()) {
      setSubError('State, district, and city are required.');
      return;
    }
    if (!subContact.trim()) {
      setSubError('Please enter WhatsApp number or email.');
      return;
    }

    try {
      setSubLoading(true);
      const response = await createInfraSubscription({
        state: subState.trim(),
        district: subDistrict.trim(),
        city: subCity.trim(),
        channel: subChannel,
        contact: subContact.trim(),
      });

      const token = response.subscription?.unsubscribeToken;
      const unsubscribeUrl = token ? `${window.location.origin}/unsubscribe?token=${token}` : '';
      setSubMessage(
        token
          ? `Subscribed! Unsubscribe anytime: ${unsubscribeUrl}`
          : 'Subscribed! We will share updates when new verified items are posted.'
      );
      setSubContact('');
    } catch (requestError) {
      setSubError(requestError instanceof Error ? requestError.message : 'Could not subscribe.');
    } finally {
      setSubLoading(false);
    }
  };

  const renderCard = (item: InfraUpdateItem) => {
    const topPriority = isTopPriority(item);
    const updatedAgo = daysAgo(item.lastUpdated);
    const verificationBadge = getVerificationBadge(item.verificationLevel);

    return (
      <article
        key={item.id}
        className={`rounded-2xl border p-4 shadow-sm transition ${
          topPriority ? 'border-slate-400 bg-slate-50' : 'border-slate-200 bg-white'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{item.projectName}</h3>
            <p className="mt-1 text-xs uppercase tracking-[0.12em] text-slate-500">
              {item.state} | {item.district}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {topPriority ? (
              <Badge className="border-amber-300 bg-amber-100 text-amber-900">Top Priority</Badge>
            ) : null}
            <Badge variant="outline">{formatEnumLabel(item.category)}</Badge>
            <Badge variant="outline">Impact: {formatEnumLabel(item.impactLevel)}</Badge>
            <Badge className={verificationBadge.className}>{verificationBadge.label}</Badge>
          </div>
        </div>

        <p className="mt-3 text-sm text-slate-700">
          <span className="font-semibold text-slate-900">Area Affected:</span>{' '}
          {Array.isArray(item.cities) && item.cities.length > 0 ? item.cities.join(', ') : '-'}
          <span className="mx-2 text-slate-400">|</span>
          <span className="font-semibold text-slate-900">Authority:</span> {item.authority}
          <span className="mx-2 text-slate-400">|</span>
          <span className="font-semibold text-slate-900">Project Type:</span> {item.projectType}
        </p>

        <p className="mt-3 text-sm text-slate-700">{item.statusText}</p>

        <p className="mt-3 text-xs text-slate-600">
          <span className="font-semibold text-slate-800">Source:</span>{' '}
          <SourceLine sourceRef={item.sourceRef} sourceUrl={item.sourceUrl} />
          <span className="mx-2 text-slate-400">|</span>
          <span className="font-semibold text-slate-800">Last Updated:</span> {formatDate(item.lastUpdated)}
          {updatedAgo ? ` (${updatedAgo})` : ''}
        </p>
      </article>
    );
  };

  const emptyMessage =
    verificationMode === 'VERIFIED_ONLY'
      ? 'No projects match your filters. Try including Source-only updates.'
      : 'No projects match your filters.';

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container zdt-page-stack">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold sm:text-3xl">Infrastructure and Development Tracker</h1>
          <p className="mt-2 text-sm text-slate-600">
            Public infrastructure updates for builders and buyers, organized area-wise for better decisions.
          </p>
          <p className="mt-3 text-xs text-slate-500">
            This page compiles publicly available updates from government notices, tenders, and local administrative
            information. We do not guarantee timelines or project execution.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Location Mode</p>
              <select
                value={locationScope}
                onChange={(event) => {
                  const next = event.target.value as LocationScope;
                  if (next === 'all') {
                    applyAllIndiaScope();
                  } else {
                    setLocationScope('state');
                    setPage(1);
                  }
                }}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800"
              >
                <option value="all">All India</option>
                <option value="state">State</option>
              </select>
            </label>

            {locationScope === 'state' ? (
              <label className="space-y-1 xl:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Select State</p>
                <LgdLocationInput
                  value={stateName}
                  onChange={(value) => {
                    setStateName(value);
                    setStateCode('');
                    setSubState(value);
                    setPage(1);
                  }}
                  placeholder="Type state (e.g., Karnataka, Maharashtra)"
                  className="h-11 bg-white"
                  suggestKind="state"
                  indiaValueField="state"
                />
              </label>
            ) : (
              <div className="space-y-1 xl:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Selected Scope</p>
                <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                  Nationwide view is active.
                </div>
              </div>
            )}

            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Verification</p>
              <select
                value={verificationMode}
                onChange={(event) => {
                  setVerificationMode(event.target.value as VerificationScope);
                  setPage(1);
                }}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800"
              >
                {VERIFICATION_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Search</p>
              <Input
                value={q}
                onChange={(event) => {
                  setQ(event.target.value);
                  setPage(1);
                }}
                placeholder='Try: "road widening", "bypass", "bridge", "NH"'
                className="h-11 bg-white"
              />
            </label>
          </div>
          <LgdLocationAccuracyNote className="mt-2" />
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Sort</p>
              <select
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value as InfraSortKey);
                  setPage(1);
                }}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Per Page</p>
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800"
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-xl px-4"
                onClick={resetFiltersToAllIndia}
              >
                Reset to All India
              </Button>
              <Button type="button" variant="outline" className="h-11 rounded-xl px-4" onClick={handleCopyShareLink}>
                <Copy className="h-4 w-4" />
                Copy share link
              </Button>
            </div>
          </div>

          {copyMessage ? <p className="mt-2 text-xs text-slate-600">{copyMessage}</p> : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {CATEGORY_OPTIONS.map((option) => (
              <Button
                key={option.key}
                type="button"
                variant={category === option.key ? 'default' : 'outline'}
                className={`h-10 rounded-full px-4 ${
                  category === option.key ? 'bg-blue-700 text-white hover:bg-blue-800' : ''
                }`}
                onClick={() => {
                  setCategory(option.key);
                  setPage(1);
                }}
              >
                {option.label}
              </Button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Location Scope</p>
            <Button
              type="button"
              variant={locationScope === 'all' ? 'default' : 'outline'}
              className={`h-9 rounded-full px-4 text-xs ${
                locationScope === 'all' ? 'bg-blue-700 text-white hover:bg-blue-800' : ''
              }`}
              onClick={applyAllIndiaScope}
            >
              All India
            </Button>
            <Button
              type="button"
              variant={locationScope === 'state' ? 'default' : 'outline'}
              className={`h-9 rounded-full px-4 text-xs ${
                locationScope === 'state' ? 'bg-blue-700 text-white hover:bg-blue-800' : ''
              }`}
              onClick={() => {
                setLocationScope('state');
                setPage(1);
              }}
            >
              State
            </Button>
            {locationScope === 'all' ? (
              <p className="text-xs text-slate-500">Nationwide view is active.</p>
            ) : (
              <p className="text-xs text-slate-500">
                Current: {stateName.trim() || 'Select a state'}
                {stateCode.trim() ? ` (${stateCode.trim()})` : ''}
              </p>
            )}
          </div>

          {recentLocations.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <p className="text-xs text-slate-500">Recent:</p>
              {recentLocations.map((entry, index) => (
                <Button
                  key={`${recentLocationKey(entry)}-${index}`}
                  type="button"
                  variant="outline"
                  className={`h-8 rounded-full px-3 text-xs ${
                    (entry.scope === 'all' && locationScope === 'all') ||
                    (entry.scope === 'state' &&
                      locationScope === 'state' &&
                      stateName.trim().toLowerCase() === entry.stateName.trim().toLowerCase())
                      ? 'border-slate-500 bg-slate-100'
                      : ''
                  }`}
                  onClick={() => {
                    if (entry.scope === 'all') {
                      applyAllIndiaScope();
                    } else {
                      applyStateScope(entry.stateName, entry.stateCode);
                    }
                  }}
                >
                  {entry.label}
                </Button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
            <p>
              Showing {showingFrom}-{showingTo} of {total}
            </p>
            <p>
              Page {page} of {Math.max(1, totalPages)}
            </p>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl px-4"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
              >
                Prev
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl px-4"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>

            <p className="text-xs text-slate-500">
              Impact legend: Low = internal civic works, Medium = connector roads or widening, High = highways or
              bypass or ring roads.
            </p>
          </div>
        </div>

        <div className="grid gap-3">
          {needsStateSelection ? (
            <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
              Select a state to view state-wise updates, or switch to All India.
            </p>
          ) : null}

          {loading ? (
            <p className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading updates...
            </p>
          ) : null}

          {!loading && error ? (
            <p className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" />
              {error}
            </p>
          ) : null}

          {!needsStateSelection && !loading && !error && items.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">{emptyMessage}</p>
          ) : null}

          {!loading && !error && category !== 'ALL' ? (
            <div className="grid gap-3">{items.map((item) => renderCard(item))}</div>
          ) : null}

          {!loading && !error && category === 'ALL' && grouped ? (
            <div className="grid gap-5">
              {CATEGORY_SECTION_ORDER.map((sectionKey) => (
                <section key={sectionKey} className="grid gap-3">
                  <h2 className="text-lg font-semibold text-slate-900">{formatEnumLabel(sectionKey)}</h2>
                  {grouped[sectionKey].length === 0 ? (
                    <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">No updates.</p>
                  ) : (
                    <div className="grid gap-3">{grouped[sectionKey].map((item) => renderCard(item))}</div>
                  )}
                </section>
              ))}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600 shadow-sm">
          Disclaimer: Information shown here is for awareness and is compiled from public sources and local
          administrative updates. Final approvals, route changes, timelines, and execution depend on government
          authorities. ZDT Realty does not guarantee outcomes or property value changes.
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Get verified infrastructure updates</h3>
          <p className="mt-1 text-sm text-slate-600">
            Subscribe for alerts when new Public Notice or Tender items are added for your area.
          </p>

          <form onSubmit={submitSubscription} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">State</p>
              <Input value={subState} onChange={(event) => setSubState(event.target.value)} placeholder="e.g., Karnataka" className="h-11 bg-white" />
            </label>

            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">District</p>
              <Input value={subDistrict} onChange={(event) => setSubDistrict(event.target.value)} placeholder="e.g., Pune" className="h-11 bg-white" />
            </label>

            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">City</p>
              <Input value={subCity} onChange={(event) => setSubCity(event.target.value)} placeholder="e.g., Surat" className="h-11 bg-white" />
            </label>

            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Channel</p>
              <select
                value={subChannel}
                onChange={(event) => setSubChannel(event.target.value as InfraSubscriptionChannel)}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800"
              >
                <option value="WHATSAPP">WhatsApp</option>
                <option value="EMAIL">Email</option>
              </select>
            </label>

            <label className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                {subChannel === 'WHATSAPP' ? 'WhatsApp Number' : 'Email'}
              </p>
              <Input
                value={subContact}
                onChange={(event) => setSubContact(event.target.value)}
                placeholder={subChannel === 'WHATSAPP' ? '+91 9XXXXXXXXX' : 'name@email.com'}
                className="h-11 bg-white"
              />
            </label>

            <div className="md:col-span-2 xl:col-span-5">
              <Button type="submit" disabled={subLoading} className="h-11 rounded-xl bg-blue-700 px-5 text-white hover:bg-blue-800">
                {subLoading ? 'Saving...' : 'Subscribe'}
              </Button>
            </div>
          </form>

          {subError ? <p className="mt-3 text-sm text-red-700">{subError}</p> : null}
          {subMessage ? <p className="mt-3 text-sm text-emerald-700 break-all">{subMessage}</p> : null}

          <p className="mt-3 text-xs text-slate-500">
            We use your contact only for infrastructure update alerts. You can request removal anytime.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Want to list your project near upcoming development areas?</h3>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              className="h-11 rounded-xl bg-blue-700 px-5 text-white hover:bg-blue-800"
              onClick={onOpenListProject}
            >
              List Your Project with ZDT Realty
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl px-5"
              onClick={onOpenPartnershipCall}
            >
              Request a Partnership Call
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
