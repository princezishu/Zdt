import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, RefreshCcw, Rss } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { AuthUser } from '@/lib/session';
import {
  createAdminInsightsNewsSource,
  getAdminInsightsJobRuns,
  getAdminInsightsNewsSources,
  getInsightsNews,
  runAdminNewsRefresh,
  trackNewsArticleClick,
  updateAdminInsightsNewsSource,
  type AdminJobRun,
  type AdminNewsSource,
  type NewsArticle,
  type NewsFeedResponse,
} from '@/lib/insightsApi';
import InsightsTabs from './InsightsTabs';

interface InsightsNewsPageProps {
  token: string;
  user: AuthUser | null;
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
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

function openNewsArticle(article: NewsArticle) {
  void trackNewsArticleClick(article.id).catch(() => {
    // Click tracking should not block outbound navigation.
  });
  window.open(article.url, '_blank', 'noopener,noreferrer');
}

export default function InsightsNewsPage({ token, user }: InsightsNewsPageProps) {
  const isAdmin = Boolean(token && user?.role === 'admin');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState<NewsFeedResponse | null>(null);

  const [source, setSource] = useState('');
  const [category, setCategory] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [offset, setOffset] = useState(0);

  const [adminSources, setAdminSources] = useState<AdminNewsSource[]>([]);
  const [adminRuns, setAdminRuns] = useState<AdminJobRun[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminSavingId, setAdminSavingId] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setOffset(0);
    }, 260);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadNews = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await getInsightsNews({
        source,
        category,
        search,
        fromDate,
        toDate,
        limit: 20,
        offset,
      });
      setPayload(response);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load insights news.');
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [category, fromDate, offset, search, source, toDate]);

  const loadAdminPanel = useCallback(async () => {
    if (!isAdmin) {
      setAdminSources([]);
      setAdminRuns([]);
      return;
    }

    try {
      setAdminLoading(true);
      const [sourceResponse, runsResponse] = await Promise.all([
        getAdminInsightsNewsSources(token),
        getAdminInsightsJobRuns(token, 12),
      ]);
      setAdminSources(sourceResponse.sources || []);
      setAdminRuns((runsResponse.runs || []).filter((item) => item.jobName.includes('news')));
    } catch (panelError) {
      toast.error(panelError instanceof Error ? panelError.message : 'Unable to load admin tools.');
    } finally {
      setAdminLoading(false);
    }
  }, [isAdmin, token]);

  useEffect(() => {
    void loadNews();
  }, [loadNews]);

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

  const toggleAdminSource = async (sourceRow: AdminNewsSource) => {
    if (!isAdmin) return;
    try {
      setAdminSavingId(sourceRow.id);
      await updateAdminInsightsNewsSource(token, sourceRow.id, {
        isActive: !sourceRow.isActive,
      });
      toast.success(`Source ${!sourceRow.isActive ? 'activated' : 'paused'}.`);
      await Promise.all([loadAdminPanel(), loadNews()]);
    } catch (toggleError) {
      toast.error(toggleError instanceof Error ? toggleError.message : 'Unable to update source status.');
    } finally {
      setAdminSavingId('');
    }
  };

  const addAdminSource = async () => {
    if (!isAdmin) return;

    if (!newSourceName.trim()) {
      toast.error('Source name is required.');
      return;
    }
    if (!newSourceUrl.trim()) {
      toast.error('RSS URL is required.');
      return;
    }

    try {
      setAdminSavingId('create-source');
      await createAdminInsightsNewsSource(token, {
        name: newSourceName.trim(),
        rssUrl: newSourceUrl.trim(),
        isActive: true,
      });
      setNewSourceName('');
      setNewSourceUrl('');
      toast.success('News source added.');
      await Promise.all([loadAdminPanel(), loadNews()]);
    } catch (createError) {
      toast.error(createError instanceof Error ? createError.message : 'Unable to add news source.');
    } finally {
      setAdminSavingId('');
    }
  };

  const runManualRefresh = async () => {
    if (!isAdmin) return;
    try {
      setRefreshing(true);
      const result = await runAdminNewsRefresh(token);
      if (result.status === 'success') {
        toast.success(`News refreshed. Inserted ${result.itemsInserted} items.`);
      } else {
        toast.error('News refresh job failed.');
      }
      await Promise.all([loadAdminPanel(), loadNews()]);
    } catch (refreshError) {
      toast.error(refreshError instanceof Error ? refreshError.message : 'Unable to run manual refresh.');
    } finally {
      setRefreshing(false);
    }
  };

  const articles = payload?.items || [];
  const trending = payload?.trending || [];

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container zdt-page-stack">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">News & Insights</p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Real Estate News Feed</h1>
          <p className="mt-2 text-sm text-slate-600">
            Live RSS ingestion every 2 hours. We store metadata only and always link back to the original publisher.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <Badge variant="secondary">Last updated: {formatDateTime(payload?.lastUpdated)}</Badge>
            <Badge variant="secondary">Data source: {payload?.dataSource || 'RSS feeds'}</Badge>
          </div>
        </div>

        <InsightsTabs active="news" visible={['news', 'projects', 'compare']} />

        <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search title or snippet"
              className="h-11 bg-white xl:col-span-2"
            />
            <select
              value={source}
              onChange={(event) => {
                setSource(event.target.value);
                setOffset(0);
              }}
              className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
            >
              <option value="">All sources</option>
              {(payload?.filters.sources || []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setOffset(0);
              }}
              className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
            >
              <option value="">All categories</option>
              {(payload?.filters.categories || []).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <Input
              type="date"
              value={fromDate}
              onChange={(event) => {
                setFromDate(event.target.value);
                setOffset(0);
              }}
              className="h-11 bg-white"
            />
            <Input
              type="date"
              value={toDate}
              onChange={(event) => {
                setToDate(event.target.value);
                setOffset(0);
              }}
              className="h-11 bg-white"
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => void loadNews()} disabled={loading}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              {loading ? 'Refreshing...' : 'Refresh'}
            </Button>

            {isAdmin ? (
              <Button onClick={() => void runManualRefresh()} disabled={refreshing}>
                {refreshing ? 'Running job...' : 'Run News Job (Admin)'}
              </Button>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={`news-skeleton-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <Skeleton className="h-36 w-full rounded-xl" />
                    <Skeleton className="mt-3 h-4 w-1/3" />
                    <Skeleton className="mt-2 h-5 w-full" />
                    <Skeleton className="mt-2 h-4 w-full" />
                    <Skeleton className="mt-1 h-4 w-4/5" />
                  </div>
                ))}
              </div>
            ) : null}

            {!loading && articles.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
                No news found for the selected filters.
              </div>
            ) : null}

            {!loading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {articles.map((article) => (
                  <article key={article.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                      <img
                        src={article.imageUrl || '/images/property-2.jpg'}
                        alt={article.title}
                        className="h-40 w-full object-cover"
                        loading="lazy"
                        onError={(event) => {
                          const fallback = '/images/property-2.jpg';
                          if (event.currentTarget.src.endsWith(fallback)) return;
                          event.currentTarget.src = fallback;
                        }}
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <Badge variant="outline">{article.source}</Badge>
                      <span>{formatDate(article.publishedAt || article.createdAt)}</span>
                      {article.category ? <Badge variant="secondary">{article.category}</Badge> : null}
                    </div>

                    <h2 className="mt-3 text-base font-semibold text-slate-900">{article.title}</h2>
                    <p className="mt-2 line-clamp-3 text-sm text-slate-600">{article.snippet || 'No summary available.'}</p>

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-500">Clicks: {article.clickCount}</span>
                      <Button size="sm" onClick={() => openNewsArticle(article)}>
                        Read Full Article
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
                  Page {pageNumber} of {totalPages} ({pagination.total} articles)
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
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Trending</h3>
              <div className="mt-3 space-y-3">
                {(trending || []).map((item) => (
                  <button
                    key={`trend-${item.id}`}
                    type="button"
                    onClick={() => openNewsArticle(item)}
                    className="w-full rounded-xl border border-slate-200 p-3 text-left transition hover:border-blue-300 hover:bg-blue-50/40"
                  >
                    <p className="text-xs text-slate-500">{item.source}</p>
                    <p className="mt-1 text-sm font-medium text-slate-900 line-clamp-2">{item.title}</p>
                    <p className="mt-1 text-xs text-slate-500">Clicks: {item.clickCount}</p>
                  </button>
                ))}
                {trending.length === 0 ? (
                  <p className="text-sm text-slate-500">No trending stories yet.</p>
                ) : null}
              </div>
            </div>

            {isAdmin ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Admin Tools</h3>
                  <Button variant="ghost" size="sm" onClick={() => void loadAdminPanel()} disabled={adminLoading}>
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    Reload
                  </Button>
                </div>

                <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Add RSS Source</p>
                  <Input
                    value={newSourceName}
                    onChange={(event) => setNewSourceName(event.target.value)}
                    placeholder="Source name"
                    className="h-9 bg-white"
                  />
                  <Input
                    value={newSourceUrl}
                    onChange={(event) => setNewSourceUrl(event.target.value)}
                    placeholder="https://example.com/feed.xml"
                    className="h-9 bg-white"
                  />
                  <Button
                    size="sm"
                    onClick={() => void addAdminSource()}
                    disabled={adminSavingId === 'create-source'}
                  >
                    <Rss className="mr-2 h-4 w-4" />
                    Add Source
                  </Button>
                </div>

                <div className="mt-3 space-y-2">
                  {adminSources.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{item.name}</p>
                        <p className="text-xs text-slate-500">{item.articleCount ?? 0} articles</p>
                      </div>
                      <Button
                        size="sm"
                        variant={item.isActive ? 'outline' : 'default'}
                        onClick={() => void toggleAdminSource(item)}
                        disabled={adminSavingId === item.id}
                      >
                        {item.isActive ? 'Pause' : 'Activate'}
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Recent Job Runs</p>
                  <div className="mt-2 space-y-2">
                    {adminRuns.slice(0, 6).map((run) => (
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
                      <p className="text-xs text-slate-500">No news jobs recorded yet.</p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </section>
  );
}
