import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  FileBadge2,
  Loader2,
  MapPinned,
  Search,
  ShieldCheck,
} from 'lucide-react';

import SectionHeader from '@/components/realty/SectionHeader';
import InsightMetricCard from '@/components/realty/InsightMetricCard';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  getBuilderTrustSpotlight,
  getBuilderTrustSummary,
  type BuilderTrustSpotlightItem,
  type BuilderVerificationCaseItem,
  type BuilderVerificationDocumentItem,
  type BuilderTrustSummary,
} from '@/modules/trust/api/verificationApi';
import TrustScoreDial from '@/modules/trust/components/TrustScoreDial';
import VerificationBadge from '@/modules/trust/components/VerificationBadge';

function formatDate(value: string | null) {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not available';
  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatStatusLabel(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function StatusPill({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const className =
    normalized === 'approved'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : normalized === 'rejected'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : 'border-amber-200 bg-amber-50 text-amber-700';

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`.trim()}>
      {formatStatusLabel(value)}
    </span>
  );
}

function CompanyCard({
  company,
  selected,
  onSelect,
}: {
  company: BuilderTrustSpotlightItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-[28px] border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-30px_rgba(15,23,42,0.6)] ${
        selected
          ? 'border-blue-300 bg-blue-50/70 shadow-[0_20px_40px_-34px_rgba(37,99,235,0.55)]'
          : 'border-slate-200 bg-white/80'
      }`.trim()}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold text-slate-900">{company.name}</p>
            <VerificationBadge badge={company.badge} />
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {company.city || 'City pending'}, {company.state || 'India'}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Score</p>
          <p className="text-xl font-bold text-slate-900">{company.trustScore}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-sm text-slate-600">
        <div className="rounded-2xl bg-slate-50 px-3 py-2">Docs {company.approvedDocuments}</div>
        <div className="rounded-2xl bg-slate-50 px-3 py-2">Cases {company.approvedCases}</div>
        <div className="rounded-2xl bg-slate-50 px-3 py-2">Flags {company.openFakeReports}</div>
      </div>
    </button>
  );
}

function CaseList({ items }: { items: BuilderVerificationCaseItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">No verification cases yet.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="rounded-[22px] border border-slate-200 bg-white px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-900">{formatStatusLabel(item.caseType)}</p>
              <p className="text-xs text-slate-500">Created {formatDate(item.createdAt)}</p>
            </div>
            <StatusPill value={item.status} />
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{item.publicNote || item.note}</p>
          {item.sourceAuthorityName ? (
            <p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-blue-700">
              Source: {item.sourceAuthorityName}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function DocumentList({ items }: { items: BuilderVerificationDocumentItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">No verification documents uploaded yet.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="rounded-[22px] border border-slate-200 bg-white px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-900">{formatStatusLabel(item.documentType)}</p>
              <p className="text-xs text-slate-500">Updated {formatDate(item.updatedAt)}</p>
            </div>
            <StatusPill value={item.status} />
          </div>
          {item.notes ? <p className="mt-2 text-sm leading-6 text-slate-600">{item.notes}</p> : null}
        </div>
      ))}
    </div>
  );
}

export default function BuilderTrustPage() {
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [spotlight, setSpotlight] = useState<BuilderTrustSpotlightItem[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [summary, setSummary] = useState<BuilderTrustSummary | null>(null);
  const [recentCases, setRecentCases] = useState<BuilderVerificationCaseItem[]>([]);
  const [recentDocuments, setRecentDocuments] = useState<BuilderVerificationDocumentItem[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;
    setIsLoadingList(true);
    setErrorMessage('');

    void getBuilderTrustSpotlight({
      limit: 10,
      q: query,
      state: stateFilter,
      verifiedOnly,
    })
      .then((items) => {
        if (!active) return;
        setSpotlight(items);
        setSelectedCompanyId((current) => {
          if (current && items.some((item) => item.companyId === current)) {
            return current;
          }
          return items[0]?.companyId ?? null;
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load builder trust data.');
      })
      .finally(() => {
        if (active) setIsLoadingList(false);
      });

    return () => {
      active = false;
    };
  }, [query, stateFilter, verifiedOnly]);

  useEffect(() => {
    if (!selectedCompanyId) {
      setSummary(null);
      setRecentCases([]);
      setRecentDocuments([]);
      return;
    }

    let active = true;
    setIsLoadingSummary(true);

    void getBuilderTrustSummary(selectedCompanyId)
      .then((payload) => {
        if (!active) return;
        setSummary(payload.summary);
        setRecentCases(payload.recentCases);
        setRecentDocuments(payload.recentDocuments);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load builder trust summary.');
      })
      .finally(() => {
        if (active) setIsLoadingSummary(false);
      });

    return () => {
      active = false;
    };
  }, [selectedCompanyId]);

  const trustedCount = spotlight.filter((item) => item.badge.key === 'trusted').length;
  const openFlags = spotlight.reduce((sum, item) => sum + item.openFakeReports, 0);
  const averageScore =
    spotlight.length > 0
      ? Math.round(spotlight.reduce((sum, item) => sum + item.trustScore, 0) / spotlight.length)
      : 0;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_28%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_28%),linear-gradient(180deg,#f8fbff_0%,#ffffff_38%,#eff6ff_100%)]">
      <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-[36px] border border-slate-200/70 bg-white/85 p-6 shadow-[0_28px_80px_-52px_rgba(15,23,42,0.6)] backdrop-blur">
          <SectionHeader
            eyebrow="Trust Layer"
            title="Builder trust is now a real product surface"
            description="Verified builders, live trust scoring, verification case trails, and public confidence signals for the India-first marketplace."
          />

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <InsightMetricCard
              label="Trusted builders"
              value={String(trustedCount)}
              note="Builders that currently clear the strongest trust threshold."
              icon={<ShieldCheck className="h-5 w-5" />}
              tone="emerald"
            />
            <InsightMetricCard
              label="Average score"
              value={String(averageScore)}
              note="Blended from approvals, verification maturity, and open trust flags."
              icon={<BadgeCheck className="h-5 w-5" />}
              tone="blue"
            />
            <InsightMetricCard
              label="Open flags"
              value={String(openFlags)}
              note="Unresolved fake-listing or trust-risk reports across spotlight builders."
              icon={<AlertTriangle className="h-5 w-5" />}
              tone="amber"
            />
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <Card className="border-slate-200/80 bg-white/85 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-xl text-slate-900">Builder trust spotlight</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="pl-10"
                    placeholder="Search builders or locations"
                  />
                </div>
                <Input
                  value={stateFilter}
                  onChange={(event) => setStateFilter(event.target.value)}
                  placeholder="Filter by state"
                />
                <Button
                  type="button"
                  variant={verifiedOnly ? 'default' : 'outline'}
                  onClick={() => setVerifiedOnly((current) => !current)}
                  className="whitespace-nowrap"
                >
                  Verified only
                </Button>
              </div>

              {errorMessage ? (
                <Alert className="border-rose-200 bg-rose-50 text-rose-700">
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              ) : null}

              {isLoadingList ? (
                <div className="flex min-h-[220px] items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-slate-50 text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading trust spotlight...
                </div>
              ) : spotlight.length === 0 ? (
                <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
                  No builders matched the current trust filters.
                </div>
              ) : (
                <div className="space-y-3">
                  {spotlight.map((item) => (
                    <CompanyCard
                      key={item.companyId}
                      company={item}
                      selected={item.companyId === selectedCompanyId}
                      onSelect={() => setSelectedCompanyId(item.companyId)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(239,246,255,0.92))]">
            <CardHeader>
              <CardTitle className="text-xl text-slate-900">Selected trust profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoadingSummary ? (
                <div className="flex min-h-[260px] items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-white text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading trust profile...
                </div>
              ) : !summary ? (
                <div className="rounded-[28px] border border-dashed border-slate-200 bg-white p-8 text-center text-slate-500">
                  Select a builder to inspect verification depth.
                </div>
              ) : (
                <>
                  <div className="rounded-[28px] border border-slate-200 bg-white p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-2xl font-bold text-slate-900">{summary.company.name}</h2>
                          <VerificationBadge badge={summary.badge} />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-600">
                          <span className="inline-flex items-center gap-1.5">
                            <MapPinned className="h-4 w-4 text-blue-600" />
                            {summary.company.city || 'City pending'}, {summary.company.state || 'India'}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Building2 className="h-4 w-4 text-blue-600" />
                            {summary.company.projectCount} projects, {summary.company.propertyCount} properties
                          </span>
                        </div>
                        <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
                          {summary.badge.reason} Last reviewed: {formatDate(summary.metrics.lastReviewedAt)}.
                        </p>
                      </div>
                      <TrustScoreDial score={summary.trustScore} />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Documents</p>
                      <p className="mt-2 text-2xl font-bold text-slate-900">{summary.metrics.approvedDocuments}</p>
                      <p className="mt-2 text-sm text-slate-600">
                        Approved documents, {summary.metrics.pendingDocuments} pending, {summary.metrics.rejectedDocuments} rejected.
                      </p>
                    </div>
                    <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Trust flags</p>
                      <p className="mt-2 text-2xl font-bold text-slate-900">{summary.metrics.openFakeReports}</p>
                      <p className="mt-2 text-sm text-slate-600">
                        Open flags out of {summary.metrics.totalFakeReports} lifetime trust reports.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-2">
                    <div>
                      <div className="mb-3 flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-blue-700" />
                        <p className="text-sm font-semibold text-slate-900">Recent verification cases</p>
                      </div>
                      <CaseList items={recentCases} />
                    </div>
                    <div>
                      <div className="mb-3 flex items-center gap-2">
                        <FileBadge2 className="h-4 w-4 text-blue-700" />
                        <p className="text-sm font-semibold text-slate-900">Recent document reviews</p>
                      </div>
                      <DocumentList items={recentDocuments} />
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
