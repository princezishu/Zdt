import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { AuthUser } from '@/lib/session';
import {
  createAdminInsightsBuilderSource,
  getAdminInsightsBuilderSources,
  getAdminInsightsJobRuns,
  getProjectAnnouncementDetail,
  getProjectAnnouncements,
  runAdminProjectsRefresh,
  updateAdminInsightsBuilderSource,
  type AdminBuilderSource,
  type AdminJobRun,
  type ProjectAnnouncement,
  type ProjectAnnouncementDetailResponse,
  type ProjectAnnouncementsResponse,
} from '@/lib/insightsApi';
import InsightsTabs from './InsightsTabs';

interface InsightsProjectsPageProps {
  token: string;
  user: AuthUser | null;
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatBudget(value: number | null | undefined) {
  if (!value || !Number.isFinite(value)) return '-';
  return `?${Number(value).toLocaleString('en-IN')}`;
}

export default function InsightsProjectsPage({ token, user }: InsightsProjectsPageProps) {
  const isAdmin = Boolean(token && user?.role === 'admin');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState<ProjectAnnouncementsResponse | null>(null);

  const [builder, setBuilder] = useState('');
  const [city, setCity] = useState('');
  const [status, setStatus] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [budgetMinInput, setBudgetMinInput] = useState('');
  const [budgetMaxInput, setBudgetMaxInput] = useState('');
  const [offset, setOffset] = useState(0);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailPayload, setDetailPayload] = useState<ProjectAnnouncementDetailResponse | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminSavingId, setAdminSavingId] = useState('');
  const [adminSources, setAdminSources] = useState<AdminBuilderSource[]>([]);
  const [adminRuns, setAdminRuns] = useState<AdminJobRun[]>([]);

  const [newBuilderName, setNewBuilderName] = useState('');
  const [newBuilderUrl, setNewBuilderUrl] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setOffset(0);
    }, 260);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const budgetMin = useMemo(() => {
    const value = Number(budgetMinInput);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }, [budgetMinInput]);

  const budgetMax = useMemo(() => {
    const value = Number(budgetMaxInput);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }, [budgetMaxInput]);

  const loadAnnouncements = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await getProjectAnnouncements({
        builder,
        city,
        status,
        search,
        budgetMin,
        budgetMax,
        limit: 20,
        offset,
      });
      setPayload(response);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load project announcements.');
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [builder, budgetMax, budgetMin, city, offset, search, status]);

  const loadAdminPanel = useCallback(async () => {
    if (!isAdmin) {
      setAdminSources([]);
      setAdminRuns([]);
      return;
    }

    try {
      setAdminLoading(true);
      const [sourcesResponse, runsResponse] = await Promise.all([
        getAdminInsightsBuilderSources(token),
        getAdminInsightsJobRuns(token, 12),
      ]);

      setAdminSources(sourcesResponse.sources || []);
      setAdminRuns((runsResponse.runs || []).filter((item) => item.jobName.includes('projects')));
    } catch {
      // keep admin area non-blocking
    } finally {
      setAdminLoading(false);
    }
  }, [isAdmin, token]);

  useEffect(() => {
    void loadAnnouncements();
  }, [loadAnnouncements]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadAdminPanel();
  }, [isAdmin, loadAdminPanel]);

  const pagination = payload?.pagination;
  const pageNumber = useMemo(() => {
    if (!pagination) return 1;
    return Math.floor(pagination.offset / pagination.limit) + 1;
  }, [pagination]);

  const totalPages = useMemo(() => {
    if (!pagination) return 1;
    return Math.max(1, Math.ceil(pagination.total / pagination.limit));
  }, [pagination]);

  const announcements = payload?.announcements || [];

  const openDetail = async (announcement: ProjectAnnouncement) => {
    try {
      setDetailOpen(true);
      setDetailLoading(true);
      const response = await getProjectAnnouncementDetail(announcement.id);
      setDetailPayload(response);
    } catch (detailError) {
      toast.error(detailError instanceof Error ? detailError.message : 'Unable to load detail.');
      setDetailPayload(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleBuilderSource = async (sourceRow: AdminBuilderSource) => {
    if (!isAdmin) return;
    try {
      setAdminSavingId(sourceRow.id);
      await updateAdminInsightsBuilderSource(token, sourceRow.id, {
        isActive: !sourceRow.isActive,
      });
      toast.success(`Builder source ${!sourceRow.isActive ? 'activated' : 'paused'}.`);
      await Promise.all([loadAdminPanel(), loadAnnouncements()]);
    } catch (toggleError) {
      toast.error(toggleError instanceof Error ? toggleError.message : 'Unable to update source.');
    } finally {
      setAdminSavingId('');
    }
  };

  const addBuilderSource = async () => {
    if (!isAdmin) return;

    if (!newBuilderName.trim()) {
      toast.error('Builder name is required.');
      return;
    }
    if (!newBuilderUrl.trim()) {
      toast.error('Source URL is required.');
      return;
    }

    try {
      setAdminSavingId('create-builder-source');
      await createAdminInsightsBuilderSource(token, {
        builderName: newBuilderName.trim(),
        sourceType: 'rss',
        sourceUrl: newBuilderUrl.trim(),
        isActive: true,
      });
      setNewBuilderName('');
      setNewBuilderUrl('');
      toast.success('Builder source added.');
      await Promise.all([loadAdminPanel(), loadAnnouncements()]);
    } catch (createError) {
      toast.error(createError instanceof Error ? createError.message : 'Unable to add builder source.');
    } finally {
      setAdminSavingId('');
    }
  };

  const runProjectsJob = async () => {
    if (!isAdmin) return;
    try {
      setRefreshing(true);
      const response = await runAdminProjectsRefresh(token);
      if (response.status === 'success') {
        toast.success(`Projects job completed. Inserted ${response.itemsInserted} announcements.`);
      } else {
        toast.error('Projects job failed.');
      }
      await Promise.all([loadAdminPanel(), loadAnnouncements()]);
    } catch (runError) {
      toast.error(runError instanceof Error ? runError.message : 'Unable to run projects job.');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container zdt-page-stack">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">News & Insights</p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Upcoming Project Announcements</h1>
          <p className="mt-2 text-sm text-slate-600">
            Daily RSS ingestion from builder announcement sources with auto extraction for city, pricing hints, and possession hints.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <Badge variant="secondary">Last updated: {formatDateTime(payload?.lastUpdated)}</Badge>
            <Badge variant="secondary">Data source: {payload?.dataSource || 'Builder feeds'}</Badge>
          </div>
        </div>

        <InsightsTabs active="projects" />

        <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search announcement"
              className="h-11 bg-white xl:col-span-2"
            />
            <select
              value={builder}
              onChange={(event) => {
                setBuilder(event.target.value);
                setOffset(0);
              }}
              className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
            >
              <option value="">All builders</option>
              {(payload?.filters.builders || []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.builderName}
                </option>
              ))}
            </select>
            <select
              value={city}
              onChange={(event) => {
                setCity(event.target.value);
                setOffset(0);
              }}
              className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
            >
              <option value="">All cities</option>
              {(payload?.filters.cities || []).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setOffset(0);
              }}
              className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
            >
              <option value="">All status</option>
              {(payload?.filters.statuses || []).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <Input
              type="number"
              min={0}
              value={budgetMinInput}
              onChange={(event) => {
                setBudgetMinInput(event.target.value.replace(/[^0-9]/g, ''));
                setOffset(0);
              }}
              placeholder="Budget min"
              className="h-11 bg-white"
            />
            <Input
              type="number"
              min={0}
              value={budgetMaxInput}
              onChange={(event) => {
                setBudgetMaxInput(event.target.value.replace(/[^0-9]/g, ''));
                setOffset(0);
              }}
              placeholder="Budget max"
              className="h-11 bg-white"
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void loadAnnouncements()} disabled={loading}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              {loading ? 'Refreshing...' : 'Refresh'}
            </Button>
            {isAdmin ? (
              <Button onClick={() => void runProjectsJob()} disabled={refreshing}>
                {refreshing ? 'Running job...' : 'Run Projects Job (Admin)'}
              </Button>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : null}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={`proj-skeleton-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="mt-2 h-4 w-1/2" />
                <Skeleton className="mt-4 h-4 w-full" />
                <Skeleton className="mt-2 h-4 w-4/5" />
                <Skeleton className="mt-3 h-9 w-full" />
              </div>
            ))}
          </div>
        ) : null}

        {!loading && announcements.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
            No announcements found for the selected filters.
          </div>
        ) : null}

        {!loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {announcements.map((item) => (
              <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <Badge variant="outline">{item.builderName}</Badge>
                  <Badge variant="secondary">{item.status}</Badge>
                </div>
                <h2 className="mt-3 text-base font-semibold text-slate-900">{item.title}</h2>
                <p className="mt-2 text-sm text-slate-600">
                  {item.city || 'Unknown city'}
                  {item.locality ? `, ${item.locality}` : ''}
                </p>

                <div className="mt-3 space-y-1 text-xs text-slate-500">
                  <p>Price hint: {item.priceHint || '-'}</p>
                  <p>Budget value: {formatBudget(item.priceHintValue)}</p>
                  <p>Possession: {item.possessionHint || '-'}</p>
                  <p>Published: {formatDateTime(item.publishedAt || item.createdAt)}</p>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => void openDetail(item)}>
                    View Details
                  </Button>
                  <Button size="sm" onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}>
                    Open Source
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {pagination ? (
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 text-sm">
            <p className="text-slate-600">
              Page {pageNumber} of {totalPages} ({pagination.total} announcements)
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOffset((prev) => Math.max(0, prev - pagination.limit))}
                disabled={pagination.offset === 0 || loading}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOffset((prev) => prev + pagination.limit)}
                disabled={pagination.offset + pagination.limit >= pagination.total || loading}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}

        {isAdmin ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Admin Backup Tools</h3>
              <Button variant="ghost" size="sm" onClick={() => void loadAdminPanel()} disabled={adminLoading}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Reload
              </Button>
            </div>

            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Add Builder Source</p>
                <Input
                  value={newBuilderName}
                  onChange={(event) => setNewBuilderName(event.target.value)}
                  placeholder="Builder name"
                  className="mt-2 h-9 bg-white"
                />
                <Input
                  value={newBuilderUrl}
                  onChange={(event) => setNewBuilderUrl(event.target.value)}
                  placeholder="https://builder.com/feed"
                  className="mt-2 h-9 bg-white"
                />
                <Button
                  className="mt-2"
                  size="sm"
                  onClick={() => void addBuilderSource()}
                  disabled={adminSavingId === 'create-builder-source'}
                >
                  Add Source
                </Button>

                <div className="mt-3 space-y-2">
                  {adminSources.map((row) => (
                    <div key={row.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{row.builderName}</p>
                        <p className="text-xs text-slate-500">{row.announcementCount ?? 0} announcements</p>
                      </div>
                      <Button
                        size="sm"
                        variant={row.isActive ? 'outline' : 'default'}
                        onClick={() => void toggleBuilderSource(row)}
                        disabled={adminSavingId === row.id}
                      >
                        {row.isActive ? 'Pause' : 'Activate'}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Recent Project Jobs</p>
                <div className="mt-2 space-y-2">
                  {adminRuns.slice(0, 8).map((run) => (
                    <div key={run.id} className="rounded-lg border border-slate-200 bg-white p-2 text-xs">
                      <p className="font-semibold text-slate-900">
                        {run.jobName} - {run.status}
                      </p>
                      <p className="text-slate-500">{formatDateTime(run.finishedAt)}</p>
                      <p className="text-slate-600">
                        fetched {run.itemsFetched}, inserted {run.itemsInserted}
                      </p>
                    </div>
                  ))}
                  {adminRuns.length === 0 ? (
                    <p className="text-xs text-slate-500">No projects job runs yet.</p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{detailPayload?.announcement.title || 'Announcement Detail'}</DialogTitle>
            <DialogDescription>
              {detailPayload?.announcement.builderName || '-'} |{' '}
              {formatDateTime(detailPayload?.announcement.publishedAt || detailPayload?.announcement.createdAt)}
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={`detail-skeleton-${index}`} className="h-8 w-full" />
              ))}
            </div>
          ) : detailPayload ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <p>City: {detailPayload.announcement.city || '-'}</p>
                <p>Locality: {detailPayload.announcement.locality || '-'}</p>
                <p>Price hint: {detailPayload.announcement.priceHint || '-'}</p>
                <p>Possession hint: {detailPayload.announcement.possessionHint || '-'}</p>
                <p>Status: {detailPayload.announcement.status}</p>
                <p className="mt-1 text-xs text-slate-500">Data source: {detailPayload.dataSource}</p>
              </div>

              <div className="max-h-[340px] space-y-2 overflow-auto rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Announcement Timeline</p>
                {detailPayload.timeline.map((item) => (
                  <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <p className="text-sm font-medium text-slate-900">{item.title}</p>
                    <p className="text-xs text-slate-500">{formatDateTime(item.publishedAt || item.createdAt)}</p>
                    <p className="mt-1 text-xs text-slate-600">{item.city || '-'} {item.locality ? `| ${item.locality}` : ''}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}
                    >
                      Open Source
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-600">Detail unavailable.</p>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
