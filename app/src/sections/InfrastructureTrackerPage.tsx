import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Copy, ExternalLink, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LgdLocationAccuracyNote, LgdLocationInput } from '@/components/realty/LgdLocationInput';
import { getGeoStates } from '@/lib/geoApi';
import {
  getInfraUpdateSourceCheck,
  type InfraSourceCheckResult,
  type InfraUpdateCategory,
} from '@/lib/infrastructureApi';
import { createInfraSubscription, type InfraSubscriptionChannel } from '@/lib/infraSubscriptionsApi';
import { readIndiaLocationSelection } from '@/lib/indiaLocationSelection';
import {
  getTenderIntelligence,
  type TenderIntelligenceItem,
  type TenderIntelligenceSortKey,
  type TenderIntelligenceVerificationLevel,
} from '@/lib/tenderIntelligenceApi';

type CategoryScope = InfraUpdateCategory | 'ALL' | 'FOCUS';
type VerificationScope = 'VERIFIED_ONLY' | 'VERIFIED_AND_SOURCE' | 'ALL';
type LocationScope = 'all' | 'state';
type IntelligenceTabKey =
  | 'government_tenders'
  | 'government_announcements'
  | 'project_awards'
  | 'private_opportunities'
  | 'village_signals';

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

const SORT_OPTIONS: Array<{ key: TenderIntelligenceSortKey; label: string }> = [
  { key: 'smart', label: 'Smart (Verified + Latest)' },
  { key: 'newest', label: 'Newest first' },
  { key: 'impact', label: 'Highest impact first' },
  { key: 'verified', label: 'Most verified first' },
];

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
const RECENTS_KEY = 'infra_tracker_recent_locations_v1';
const MAX_INFRA_DETAILS_PAGES = 6;
const AUTO_REFRESH_INTERVAL_MS = 60 * 1000;
const LIVE_PUBLIC_TABS = new Set<IntelligenceTabKey>([
  'government_tenders',
  'government_announcements',
]);

const INTELLIGENCE_TABS: Array<{
  key: IntelligenceTabKey;
  label: string;
  track: 'Government Track' | 'Private Track';
  availability: 'Live now' | 'Next phase' | 'Phase 4';
  description: string;
  focus: string;
  trustPolicy: string;
}> = [
  {
    key: 'government_tenders',
    label: 'Government Tenders',
    track: 'Government Track',
    availability: 'Live now',
    description:
      'Official tender discovery and monitoring for infrastructure, urban development, and real-estate-adjacent works.',
    focus:
      'Backbone sources: CPPP/eProcure, Karnataka KPPP, and other official procurement pages.',
    trustPolicy:
      'Only official or source-linked public records belong here. Corrigenda, status changes, and source URLs stay attached.',
  },
  {
    key: 'government_announcements',
    label: 'Government Announcements',
    track: 'Government Track',
    availability: 'Live now',
    description:
      'Press releases, approvals, and public notices that signal future development and infrastructure movement.',
    focus:
      'PIB, department releases, and official public-notice style updates that affect land, roads, water, or urban growth.',
    trustPolicy:
      'Announcements are labeled separately from tenders so users can distinguish policy signal from procurement action.',
  },
  {
    key: 'project_awards',
    label: 'Project Awards',
    track: 'Government Track',
    availability: 'Next phase',
    description:
      'Awarded contracts and downstream status changes so users can see when a tender starts converting into execution.',
    focus:
      'Published award notices, contractor selection, and contract progression history.',
    trustPolicy:
      'Awards will only be shown when the source clearly identifies the award event or status transition.',
  },
  {
    key: 'private_opportunities',
    label: 'Private Opportunities',
    track: 'Private Track',
    availability: 'Phase 4',
    description:
      'Commercial procurement and builder-side opportunity tracking kept fully separate from government trust labels.',
    focus:
      'Company procurement pages, builder/vendor networks, and market-sourced feeds.',
    trustPolicy:
      'Private records are never shown as government verified. They carry explicit market-source labeling and separate review rules.',
  },
  {
    key: 'village_signals',
    label: 'Village/Area Development Signals',
    track: 'Government Track',
    availability: 'Next phase',
    description:
      'LGD-linked area intelligence for village, block, and district level development discovery.',
    focus:
      'Village mapping, area comparison, and location normalization for infra-relevant signals.',
    trustPolicy:
      'Location names are not trusted by text alone. LGD codes are the backbone for precise area mapping.',
  },
];

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

  if (
    single === 'PUBLIC_NOTICE' ||
    single === 'TENDER' ||
    single === 'OFFICIAL_PORTAL' ||
    single === 'PUBLIC_NOTICE_PRESS_RELEASE'
  ) {
    return 'VERIFIED_ONLY';
  }
  if (
    (multi.includes('PUBLIC_NOTICE') && multi.includes('TENDER') && multi.includes('SOURCE_ONLY')) ||
    (multi.includes('OFFICIAL_PORTAL') &&
      multi.includes('PUBLIC_NOTICE_PRESS_RELEASE') &&
      multi.includes('OFFICIAL_DEPARTMENT_SITE'))
  ) {
    return 'VERIFIED_AND_SOURCE';
  }
  if (
    (multi.includes('PUBLIC_NOTICE') && multi.includes('TENDER') && multi.length <= 2) ||
    (multi.includes('OFFICIAL_PORTAL') &&
      multi.includes('PUBLIC_NOTICE_PRESS_RELEASE') &&
      !multi.includes('OFFICIAL_DEPARTMENT_SITE'))
  ) {
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

function normalizeSort(value: string | null): TenderIntelligenceSortKey {
  const normalized = String(value || '').trim().toLowerCase();
  if (SORT_OPTIONS.some((option) => option.key === normalized)) return normalized as TenderIntelligenceSortKey;
  return 'smart';
}

function normalizePageSize(value: string | null): number {
  const parsed = parsePositiveInt(value, 20);
  if (PAGE_SIZE_OPTIONS.includes(parsed as (typeof PAGE_SIZE_OPTIONS)[number])) return parsed;
  return 20;
}

function toInfraCategory(value: string | null | undefined): InfraUpdateCategory | null {
  const normalized = String(value || '').trim().toUpperCase();
  if (
    normalized === 'PROPOSED' ||
    normalized === 'APPROVED' ||
    normalized === 'UNDER_CONSTRUCTION' ||
    normalized === 'COMPLETED'
  ) {
    return normalized;
  }
  return null;
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

function isTopPriority(item: TenderIntelligenceItem): boolean {
  const verification = String(item.verificationLevel || '').toUpperCase();
  const verified =
    verification === 'OFFICIAL_PORTAL' ||
    verification === 'OFFICIAL_DEPARTMENT_SITE' ||
    verification === 'PUBLIC_NOTICE_PRESS_RELEASE';
  const sourceLinked = verification === 'UNKNOWN';
  const impactHigh = String(item.impactLevel || '').toUpperCase() === 'HIGH';
  const ageDays = ageInDays(item.lastUpdated);

  const updatedWithin30Days = ageDays != null && ageDays <= 30;
  const updatedWithin7Days = ageDays != null && ageDays <= 7;

  if (verified && impactHigh) return true;
  if (verified && updatedWithin30Days) return true;
  if (sourceLinked && impactHigh && updatedWithin7Days) return true;
  return false;
}

function getVerificationBadge(level: TenderIntelligenceVerificationLevel) {
  const normalized = String(level || '').toUpperCase();
  if (normalized === 'OFFICIAL_PORTAL') {
    return {
      label: 'Official Portal',
      className: 'border-emerald-300 bg-emerald-100 text-emerald-900',
    };
  }
  if (normalized === 'OFFICIAL_DEPARTMENT_SITE') {
    return {
      label: 'Official Department Site',
      className: 'border-sky-300 bg-sky-100 text-sky-900',
    };
  }
  if (normalized === 'PUBLIC_NOTICE_PRESS_RELEASE') {
    return {
      label: 'Public Notice / Press Release',
      className: 'border-indigo-300 bg-indigo-100 text-indigo-900',
    };
  }
  if (normalized === 'MARKET_SOURCE') {
    return {
      label: 'Market Source',
      className: 'border-amber-300 bg-amber-100 text-amber-900',
    };
  }
  return {
    label: 'Source-linked / Needs review',
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

type SourceCheck = {
  label: string;
  className: string;
  note: string;
};

type LiveSourceCheckState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; result: InfraSourceCheckResult }
  | { status: 'error'; message: string };

function tokenizeForMatch(value: string): string[] {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function compactToken(value: string): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function summarizeProject(item: TenderIntelligenceItem): string {
  const locationParts = [
    ...(Array.isArray(item.cities) ? item.cities : []),
    item.villageName,
    item.blockName,
    item.district,
    item.state,
  ]
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
  const impactedCities = locationParts.length > 0 ? Array.from(new Set(locationParts)).join(', ') : '-';
  const potentialBoomAreas =
    locationParts.length > 0
      ? Array.from(new Set(locationParts)).slice(0, 3).join(', ')
      : [item.district, item.state].filter(Boolean).join(', ');
  const categoryLabel = formatEnumLabel(item.category || item.tenderStatus || 'UNKNOWN').toLowerCase();
  const impactLabel = formatEnumLabel(item.impactLevel).toLowerCase();
  const boomSignal =
    item.impactLevel === 'HIGH' ? 'strong' : item.impactLevel === 'MEDIUM' ? 'moderate' : 'early';

  return `${item.projectName} is an ${categoryLabel} ${item.projectType.toLowerCase()} record led by ${item.authority} around ${impactedCities}. Current update: ${item.statusText} Impact is marked ${impactLabel}. Potential price-boom areas after this project: ${potentialBoomAreas || 'local project influence zone'}. Price-boom signal is ${boomSignal}.`;
}

function getLiveSourceCheckBadgeClass(status: InfraSourceCheckResult['status']): string {
  if (status === 'likely_correct') return 'border-emerald-300 bg-emerald-100 text-emerald-900';
  if (status === 'needs_review') return 'border-amber-300 bg-amber-100 text-amber-900';
  if (status === 'weak_match') return 'border-orange-300 bg-orange-100 text-orange-900';
  if (status === 'blocked_private_host' || status === 'invalid_url') {
    return 'border-rose-300 bg-rose-100 text-rose-900';
  }
  return 'border-slate-300 bg-slate-100 text-slate-800';
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getSourceCheck(item: TenderIntelligenceItem): SourceCheck {
  const sourceUrl = String(item.sourceUrl || '').trim();
  if (!sourceUrl) {
    return {
      label: 'Source check: Missing link',
      className: 'border-rose-300 bg-rose-100 text-rose-900',
      note: 'No source URL is attached. Please verify this update manually.',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    return {
      label: 'Source check: Invalid URL',
      className: 'border-rose-300 bg-rose-100 text-rose-900',
      note: 'Source URL format is invalid. Please fix or confirm with authority.',
    };
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    return {
      label: 'Source check: Invalid protocol',
      className: 'border-rose-300 bg-rose-100 text-rose-900',
      note: 'Source link must use http or https.',
    };
  }

  const host = parsed.hostname.toLowerCase();
  const hostToken = compactToken(host);
  const authorityTokens = tokenizeForMatch(item.authority);
  const sourceRefTokens = tokenizeForMatch(item.sourceRef);

  const looksOfficialHost =
    host.endsWith('.gov.in') ||
    host.endsWith('.nic.in') ||
    host.includes('.gov.') ||
    host.includes('.nic.');
  const hostMatchesAuthority = authorityTokens.some((token) => hostToken.includes(compactToken(token)));
  const hostMatchesSourceRef = sourceRefTokens.some((token) => hostToken.includes(compactToken(token)));

  if (looksOfficialHost || hostMatchesAuthority || hostMatchesSourceRef) {
    return {
      label: 'Source check: Looks correct',
      className: 'border-emerald-300 bg-emerald-100 text-emerald-900',
      note: `Link format is valid and host (${host}) appears consistent with source/authority.`,
    };
  }

  return {
    label: 'Source check: Needs manual review',
    className: 'border-amber-300 bg-amber-100 text-amber-900',
    note: `Link format is valid, but host (${host}) does not clearly match authority/source name.`,
  };
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

  const [category, setCategory] = useState<CategoryScope>(() => {
    const normalized = normalizeCategory(initialParams);
    if (initialScope === 'state' && normalized === 'FOCUS') {
      return 'ALL';
    }
    return normalized;
  });
  const [verificationMode, setVerificationMode] = useState<VerificationScope>(() => normalizeVerification(initialParams));
  const [q, setQ] = useState(() => initialParams.get('q') || '');
const [sort, setSort] = useState<TenderIntelligenceSortKey>(() => normalizeSort(initialParams.get('sort')));
  const [page, setPage] = useState(() =>
    Math.min(MAX_INFRA_DETAILS_PAGES, parsePositiveInt(initialParams.get('page'), 1))
  );
  const [pageSize, setPageSize] = useState(() => normalizePageSize(initialParams.get('pageSize')));
  const [activeTab, setActiveTab] = useState<IntelligenceTabKey>(() => {
    const raw = String(initialParams.get('tab') || '').trim();
    return INTELLIGENCE_TABS.some((tab) => tab.key === raw)
      ? (raw as IntelligenceTabKey)
      : 'government_tenders';
  });

  const [items, setItems] = useState<TenderIntelligenceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [copyMessage, setCopyMessage] = useState('');

  const [recentLocations, setRecentLocations] = useState<RecentLocation[]>(() =>
    typeof window !== 'undefined' ? loadRecentLocations() : []
  );

  const [subState, setSubState] = useState('');
  const [subDistrict, setSubDistrict] = useState('');
  const [subCity, setSubCity] = useState('');
  const [subChannel, setSubChannel] = useState<InfraSubscriptionChannel>('WHATSAPP');
  const [subContact, setSubContact] = useState('');
  const [subLoading, setSubLoading] = useState(false);
  const [subError, setSubError] = useState('');
  const [subMessage, setSubMessage] = useState('');
  const [briefInfoOpenById, setBriefInfoOpenById] = useState<Record<number, boolean>>({});
  const [liveSourceCheckById, setLiveSourceCheckById] = useState<Record<number, LiveSourceCheckState>>({});
  const [pagesCapped, setPagesCapped] = useState(false);
  const [autoRefreshTick, setAutoRefreshTick] = useState(0);
  const effectivePage = Math.min(MAX_INFRA_DETAILS_PAGES, page);
  const activeTabMeta = useMemo(
    () => INTELLIGENCE_TABS.find((item) => item.key === activeTab) || INTELLIGENCE_TABS[0],
    [activeTab]
  );
  const isTenderTab = activeTab === 'government_tenders';
  const showLivePublicFeed = LIVE_PUBLIC_TABS.has(activeTab);
  const requestParams = useMemo(() => {
    const sourceTypes =
      activeTab === 'government_tenders'
        ? (['government_tender'] as const)
        : activeTab === 'government_announcements'
          ? (['government_notice'] as const)
          : undefined;
    const categories =
      !isTenderTab && category === 'FOCUS'
        ? (['APPROVED', 'UNDER_CONSTRUCTION'] as InfraUpdateCategory[])
        : undefined;
    const categoryValue =
      isTenderTab || category === 'ALL' || category === 'FOCUS'
        ? undefined
        : (category as InfraUpdateCategory);

    const verificationLevels =
      verificationMode === 'VERIFIED_ONLY'
        ? (['OFFICIAL_PORTAL', 'PUBLIC_NOTICE_PRESS_RELEASE'] as TenderIntelligenceVerificationLevel[])
        : verificationMode === 'VERIFIED_AND_SOURCE'
          ? ([
              'OFFICIAL_PORTAL',
              'PUBLIC_NOTICE_PRESS_RELEASE',
              'OFFICIAL_DEPARTMENT_SITE',
              'UNKNOWN',
            ] as TenderIntelligenceVerificationLevel[])
          : undefined;

    return {
      scope: locationScope,
      track: 'government' as const,
      state: locationScope === 'state' ? stateName.trim() || undefined : undefined,
      district: undefined,
      category: categoryValue,
      categories,
      sourceTypes: sourceTypes ? [...sourceTypes] : undefined,
      verificationLevels,
      q: q.trim() || undefined,
      sort,
      page: effectivePage,
      pageSize,
    };
  }, [activeTab, category, effectivePage, isTenderTab, locationScope, pageSize, q, sort, stateName, verificationMode]);

  const grouped = useMemo(() => {
    if (isTenderTab) return null;
    if (category !== 'ALL') return null;
    const groups: Record<InfraUpdateCategory, TenderIntelligenceItem[]> = {
      PROPOSED: [],
      APPROVED: [],
      UNDER_CONSTRUCTION: [],
      COMPLETED: [],
    };
    for (const item of items) {
      const itemCategory = toInfraCategory(item.category);
      if (itemCategory) {
        groups[itemCategory].push(item);
      }
    }
    return groups;
  }, [category, isTenderTab, items]);

  const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = total === 0 ? 0 : Math.min(page * pageSize, total);
  const needsStateSelection = locationScope === 'state' && !stateName.trim();
  const shouldShowPagination =
    !needsStateSelection && !loading && !error && total > 0 && totalPages > 1;
  const pageButtons = useMemo(() => {
    const maxPage = Math.min(MAX_INFRA_DETAILS_PAGES, Math.max(1, totalPages));
    const start = Math.max(1, Math.min(page - 2, maxPage - 5));
    const end = Math.min(maxPage, start + 5);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [page, totalPages]);
  const liveSummary = useMemo(() => {
    const verifiedCount = items.filter((item) =>
      ['OFFICIAL_PORTAL', 'OFFICIAL_DEPARTMENT_SITE', 'PUBLIC_NOTICE_PRESS_RELEASE'].includes(
        String(item.verificationLevel || '').toUpperCase()
      )
    ).length;
    const highImpactCount = items.filter((item) => String(item.impactLevel || '').toUpperCase() === 'HIGH').length;
    const newestItem = [...items]
      .filter((item) => !Number.isNaN(new Date(item.lastUpdated).getTime()))
      .sort((left, right) => new Date(right.lastUpdated).getTime() - new Date(left.lastUpdated).getTime())[0];

    return {
      visibleCount: items.length,
      verifiedCount,
      highImpactCount,
      newestLabel: newestItem ? formatDate(newestItem.lastUpdated) : 'No live records yet',
    };
  }, [items]);
  const scopeLabel =
    locationScope === 'state'
      ? `${stateName.trim() || 'Selected state'}${stateCode.trim() ? ` (${stateCode.trim()})` : ''}`
      : 'All India';

  useEffect(() => {
    if (isTenderTab && category !== 'ALL') {
      setCategory('ALL');
    }
  }, [category, isTenderTab]);

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
    setCategory('ALL');
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
    setCategory(isTenderTab ? 'ALL' : 'FOCUS');
    setVerificationMode('VERIFIED_AND_SOURCE');
    setQ('');
    setSort('smart');
    setPageSize(20);
    setPage(1);
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      setAutoRefreshTick((current) => current + 1);
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

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

    if (!showLivePublicFeed) {
      setItems([]);
      setTotal(0);
      setTotalPages(1);
      setPagesCapped(false);
      setError('');
      setLoading(false);
      return () => {
        active = false;
      };
    }

    if (needsStateSelection) {
      setItems([]);
      setTotal(0);
      setTotalPages(1);
      setPagesCapped(false);
      setError('');
      return () => {
        active = false;
      };
    }

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await getTenderIntelligence(requestParams);
        if (!active) return;
        const serverTotal = Number(response.total || 0);
        const serverTotalPages = Math.max(1, Number(response.totalPages || 1));
        const cappedPages = Math.min(MAX_INFRA_DETAILS_PAGES, serverTotalPages);
        setTotal(serverTotal);
        setTotalPages(cappedPages);
        setPagesCapped(serverTotalPages > MAX_INFRA_DETAILS_PAGES);
        if (page > cappedPages) {
          setPage(cappedPages);
          return;
        }
        setItems(Array.isArray(response.items) ? response.items : []);
      } catch (requestError) {
        if (!active) return;
        setItems([]);
        setTotal(0);
        setTotalPages(1);
        setPagesCapped(false);
        setError(requestError instanceof Error ? requestError.message : 'Could not load updates.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [autoRefreshTick, needsStateSelection, page, requestParams, showLivePublicFeed]);

  useEffect(() => {
    const params = new URLSearchParams();

    params.set('tab', activeTab);
    params.set('scope', locationScope);
    if (locationScope === 'state') {
      if (stateName.trim()) params.set('state', stateName.trim());
      if (stateCode.trim()) params.set('state_code', stateCode.trim());
    }

    if (!isTenderTab && category === 'FOCUS') {
      params.set('categories', 'APPROVED,UNDER_CONSTRUCTION');
    } else if (!isTenderTab && category !== 'ALL') {
      params.set('category', category);
    }

    if (verificationMode === 'VERIFIED_ONLY') {
      params.set('verification_levels', 'OFFICIAL_PORTAL,PUBLIC_NOTICE_PRESS_RELEASE');
    } else if (verificationMode === 'VERIFIED_AND_SOURCE') {
      params.set(
        'verification_levels',
        'OFFICIAL_PORTAL,PUBLIC_NOTICE_PRESS_RELEASE,OFFICIAL_DEPARTMENT_SITE,UNKNOWN'
      );
    }

    if (q.trim()) params.set('q', q.trim());

    params.set('sort', sort);
    params.set('page', String(effectivePage));
    params.set('pageSize', String(pageSize));

    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`;
    const currentUrl = `${window.location.pathname}${window.location.search}`;

    if (nextUrl !== currentUrl) {
      window.history.replaceState(window.history.state, '', nextUrl);
    }
  }, [activeTab, category, effectivePage, isTenderTab, locationScope, pageSize, q, sort, stateCode, stateName, verificationMode]);
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

  const requestLiveSourceCheck = async (item: TenderIntelligenceItem) => {
    const recordId = Number(item.id);
    const legacyUpdateId = Number(item.legacyUpdateId || 0);

    setLiveSourceCheckById((prev) => ({
      ...prev,
      [recordId]: { status: 'loading' },
    }));

    if (!legacyUpdateId) {
      setLiveSourceCheckById((prev) => ({
        ...prev,
        [recordId]: {
          status: 'error',
          message: 'Live source check is available only for synced legacy public records right now.',
        },
      }));
      return;
    }

    try {
      const result = await getInfraUpdateSourceCheck(legacyUpdateId);
      setLiveSourceCheckById((prev) => ({
        ...prev,
        [recordId]: { status: 'ready', result },
      }));
    } catch (requestError) {
      setLiveSourceCheckById((prev) => ({
        ...prev,
        [recordId]: {
          status: 'error',
          message: requestError instanceof Error ? requestError.message : 'Unable to run live source check right now.',
        },
      }));
    }
  };

  const toggleBriefInfo = (item: TenderIntelligenceItem) => {
    const itemId = Number(item.id);
    const currentlyOpen = Boolean(briefInfoOpenById[itemId]);
    const nextOpen = !currentlyOpen;

    setBriefInfoOpenById((prev) => ({
      ...prev,
      [itemId]: nextOpen,
    }));

    if (!nextOpen) return;

    const existing = liveSourceCheckById[itemId];
    if (existing && (existing.status === 'loading' || existing.status === 'ready')) return;
    void requestLiveSourceCheck(item);
  };

  const renderCard = (item: TenderIntelligenceItem) => {
    const topPriority = isTopPriority(item);
    const updatedAgo = daysAgo(item.lastUpdated);
    const verificationBadge = getVerificationBadge(item.verificationLevel);
    const sourceCheck = getSourceCheck(item);
    const isTenderRecord = item.sourceType === 'government_tender';
    const locationDetails = Array.from(
      new Set([
        ...(Array.isArray(item.cities) ? item.cities : []),
        item.villageName,
        item.blockName,
        item.district,
        item.state,
      ])
    )
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
    const isBriefInfoOpen = Boolean(briefInfoOpenById[item.id]);
    const liveSourceState = liveSourceCheckById[item.id] || { status: 'idle' as const };
    const showQuickCheckFallback = liveSourceState.status !== 'ready';

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
          <span className="font-semibold text-slate-900">{isTenderRecord ? 'Location:' : 'Area Affected:'}</span>{' '}
          {locationDetails.length > 0 ? locationDetails.join(', ') : 'National feed / location mapping pending'}
          <span className="mx-2 text-slate-400">|</span>
          <span className="font-semibold text-slate-900">Authority:</span> {item.authority}
          <span className="mx-2 text-slate-400">|</span>
          <span className="font-semibold text-slate-900">Project Type:</span> {item.projectType}
        </p>

        <p className="mt-2 text-sm text-slate-700">
          <span className="font-semibold text-slate-900">{isTenderRecord ? 'Published:' : 'Budget:'}</span>{' '}
          {isTenderRecord
            ? item.publishedAt
              ? formatDateTime(item.publishedAt)
              : formatDateTime(item.lastUpdated)
            : item.budgetAmount != null
              ? `INR ${Number(item.budgetAmount).toLocaleString('en-IN')}`
              : 'Not disclosed'}
          <span className="mx-2 text-slate-400">|</span>
          <span className="font-semibold text-slate-900">Bid Close:</span>{' '}
          {item.bidEndAt ? formatDate(item.bidEndAt) : '-'}
          <span className="mx-2 text-slate-400">|</span>
          <span className="font-semibold text-slate-900">Opening:</span>{' '}
          {item.openingAt ? formatDateTime(item.openingAt) : '-'}
        </p>

        <p className="mt-3 text-sm text-slate-700">{item.statusText}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => toggleBriefInfo(item)}
          >
            {isBriefInfoOpen ? 'Hide Brief Info' : 'Brief Info'}
          </Button>
        </div>

        {isBriefInfoOpen ? (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Brief Info</p>
            <p className="mt-2 text-sm text-slate-700">{summarizeProject(item)}</p>

            <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                Source Verification
              </p>

              {liveSourceState.status === 'loading' ? (
                <p className="mt-2 text-xs text-slate-600">Running live source check...</p>
              ) : null}

              {liveSourceState.status === 'ready' ? (
                <div className="mt-2 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={getLiveSourceCheckBadgeClass(liveSourceState.result.status)}>
                      {liveSourceState.result.label}
                    </Badge>
                    <span className="text-xs text-slate-500">
                      Checked: {formatDateTime(liveSourceState.result.checkedAt)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">{liveSourceState.result.note}</p>
                  <p className="text-xs text-slate-500">
                    Host: {liveSourceState.result.host || '-'}
                    {liveSourceState.result.httpStatus ? ` | HTTP ${liveSourceState.result.httpStatus}` : ''}
                  </p>
                </div>
              ) : null}

              {liveSourceState.status === 'error' ? (
                <p className="mt-2 text-xs text-amber-800">
                  Live source check unavailable: {liveSourceState.message}
                </p>
              ) : null}

              {showQuickCheckFallback ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge className={sourceCheck.className}>{sourceCheck.label}</Badge>
                  <p className="text-xs text-slate-600">{sourceCheck.note}</p>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

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
    isTenderTab && locationScope === 'state'
      ? 'No mapped tenders match this state yet. Switch to All India or search by project/location keywords.'
      : verificationMode === 'VERIFIED_ONLY'
      ? 'No projects match your filters. Try including Source-only updates.'
      : 'No projects match your filters.';

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container zdt-page-stack">
        <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.12),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(15,23,42,0.08),_transparent_24%),linear-gradient(180deg,_#ffffff_0%,_#f8fbff_100%)] p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-slate-900 bg-slate-900 text-white">ZDT Intelligence</Badge>
                <Badge variant="outline">One product, two tracks</Badge>
                <Badge variant="outline">Government live first</Badge>
                <Badge variant="outline">Auto updates daily</Badge>
              </div>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                ZDT Infrastructure & Tender Intelligence
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-700 sm:text-base">
                This is not a giant crawler. It is one intelligence product with a government track and a private
                opportunities track, built on normalized records, LGD-backed location mapping, trust badges, and
                disciplined source rollout.
              </p>
              <p className="mt-3 text-xs leading-5 text-slate-500 sm:text-sm">
                National official tender coverage is live from the central procurement feed, and the tracker refreshes
                automatically every day while continuing to expand source-by-source for stronger state-level mapping and richer details.
              </p>
            </div>

            <div className="grid min-w-[280px] flex-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white/90 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Scope</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{scopeLabel}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Current browse lens for the live public feed. Latest live update: {liveSummary.newestLabel}.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/90 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Visible Records</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{liveSummary.visibleCount}</p>
                <p className="mt-1 text-xs text-slate-500">Records currently loaded on this page.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/90 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Verified Public</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{liveSummary.verifiedCount}</p>
                <p className="mt-1 text-xs text-slate-500">Tender or public-notice records in the current result set.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/90 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">High Impact</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{liveSummary.highImpactCount}</p>
                <p className="mt-1 text-xs text-slate-500">High-impact records in the current result set.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {INTELLIGENCE_TABS.map((tab) => (
              <Button
                key={tab.key}
                type="button"
                variant={activeTab === tab.key ? 'default' : 'outline'}
                className={`h-10 rounded-full px-4 ${
                  activeTab === tab.key ? 'bg-slate-950 text-white hover:bg-slate-900' : ''
                }`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </Button>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{activeTabMeta.track}</Badge>
              <Badge className="border-slate-200 bg-white text-slate-900">{activeTabMeta.availability}</Badge>
            </div>
            <h2 className="mt-3 text-xl font-semibold text-slate-950">{activeTabMeta.label}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">{activeTabMeta.description}</p>
            {showLivePublicFeed ? (
              <p className="mt-3 text-sm leading-6 text-slate-700">
                Browse the live public feed below with filters for location, verification level, keywords, and sort.
              </p>
            ) : (
              <p className="mt-3 text-sm leading-6 text-slate-700">
                This tab is not public-live yet. The working live tracker below is limited to government tenders and
                government announcements for now.
              </p>
            )}
          </div>
        </div>

        {showLivePublicFeed ? (
          <>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-950">Live Government Feed</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                This live section now shows the official public feed for tenders and announcements. Central CPPP /
                eProcure coverage is live across India, with automatic daily refresh and richer state-level normalization continuing behind it.
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
                    setCategory('ALL');
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
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Trust Filter</p>
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
                placeholder='Try: "road widening", "housing", "drainage", "industrial park"'
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
                  setSort(event.target.value as TenderIntelligenceSortKey);
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

          {!isTenderTab ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <p className="w-full text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Project Stage</p>
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
          ) : (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Tender view is showing the live official feed. Use state scope, search, trust filter, and sort to narrow results.
            </div>
          )}

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

            {shouldShowPagination ? (
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
                {pageButtons.map((pageNumber) => (
                  <Button
                    key={`infra-page-${pageNumber}`}
                    type="button"
                    variant={pageNumber === page ? 'default' : 'outline'}
                    className="h-10 rounded-xl px-4"
                    onClick={() => setPage(pageNumber)}
                  >
                    {pageNumber}
                  </Button>
                ))}
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

              <div className="text-right">
                {pagesCapped ? (
                  <p className="text-xs text-slate-500">Showing first 6 pages for faster browsing.</p>
                ) : null}
                <p className="text-xs text-slate-500">
                  Impact legend: Low = internal civic works, Medium = connector roads or widening, High = highways or
                  bypass or ring roads.
                </p>
              </div>
            </div>
              </div>
            ) : null}

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

              {!loading && !error && (isTenderTab || category !== 'ALL') ? (
                <div className="grid gap-3">{items.map((item) => renderCard(item))}</div>
              ) : null}

              {!loading && !error && !isTenderTab && category === 'ALL' && grouped ? (
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
          </>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-950">{activeTabMeta.label}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              This track is not public-live yet. We are keeping the page focused on working feeds instead of showing
              placeholder intelligence.
            </p>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Current rule</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">{activeTabMeta.trustPolicy}</p>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">
            {showLivePublicFeed ? 'Get government intelligence alerts' : `Get alerts for ${activeTabMeta.label}`}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {showLivePublicFeed
              ? 'Subscribe for alerts when verified tender or public-notice items are added for your area.'
              : 'Register your area so we can notify you as this track comes online in your coverage zone.'}
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
          <h3 className="text-lg font-semibold text-slate-900">
            Want to position your project around upcoming development activity?
          </h3>
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
