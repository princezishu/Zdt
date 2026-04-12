import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { RefreshCcw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import type { AuthUser } from '@/lib/session';
import {
  getAdminInsightsJobRuns,
  getMarketPlacePrice,
  getMarketTopCities,
  getMarketTrend,
  runAdminMarketRefresh,
  type AdminJobRun,
  type MarketPlacePriceResponse,
  type MarketTopCitiesResponse,
  type MarketTrendResponse,
} from '@/lib/insightsApi';

const AUTO_REFRESH_INTERVAL_MS = 180000;

interface InsightsMarketPageProps {
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

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return `INR ${Number(value).toLocaleString('en-IN')}`;
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatSqftPriceInr(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return `INR ${Number(value).toLocaleString('en-IN')} / sqft`;
}

function formatSqftPriceUsd(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return `USD ${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })} / sqft`;
}

function formatBasisLabel(value: MarketPlacePriceResponse['estimate']['basis']) {
  if (value === 'matched_city_snapshot') return 'Matched city snapshot';
  if (value === 'country_adjusted_estimate') return 'Country-adjusted estimate';
  return 'Global baseline estimate';
}

function formatPriceTypeLabel(value?: MarketPlacePriceResponse['estimate']['priceType']) {
  return value === 'market_snapshot' ? 'Market Snapshot' : 'Predicted';
}

export default function InsightsMarketPage({ token, user }: InsightsMarketPageProps) {
  const isAdmin = Boolean(token && user?.role === 'admin');

  const [loadingTop, setLoadingTop] = useState(true);
  const [loadingTrend, setLoadingTrend] = useState(true);
  const [error, setError] = useState('');

  const [topPayload, setTopPayload] = useState<MarketTopCitiesResponse | null>(null);
  const [trendPayload, setTrendPayload] = useState<MarketTrendResponse | null>(null);

  const [selectedCity, setSelectedCity] = useState('');
  const [trendLimitInput, setTrendLimitInput] = useState('36');

  const [refreshing, setRefreshing] = useState(false);
  const [adminRuns, setAdminRuns] = useState<AdminJobRun[]>([]);
  const [placeInput, setPlaceInput] = useState('');
  const [placeLookupLoading, setPlaceLookupLoading] = useState(false);
  const [placeLookupResult, setPlaceLookupResult] = useState<MarketPlacePriceResponse | null>(null);
  const [placeLookupError, setPlaceLookupError] = useState('');

  const trendLimit = useMemo(() => {
    const parsed = Number(trendLimitInput);
    if (!Number.isFinite(parsed)) return 36;
    return Math.min(Math.max(Math.trunc(parsed), 6), 120);
  }, [trendLimitInput]);

  const loadTop = useCallback(async () => {
    try {
      setLoadingTop(true);
      setError('');
      const response = await getMarketTopCities(12);
      setTopPayload(response);

      if (!selectedCity && response.cities.length > 0) {
        setSelectedCity(response.cities[0].city);
      } else if (selectedCity && !response.cities.some((row) => row.city === selectedCity)) {
        setSelectedCity(response.cities[0]?.city || '');
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load market data.');
      setTopPayload(null);
    } finally {
      setLoadingTop(false);
    }
  }, [selectedCity]);

  const loadTrend = useCallback(async () => {
    if (!selectedCity) {
      setTrendPayload(null);
      setLoadingTrend(false);
      return;
    }

    try {
      setLoadingTrend(true);
      const response = await getMarketTrend(selectedCity, trendLimit);
      setTrendPayload(response);
    } catch (trendError) {
      setError(trendError instanceof Error ? trendError.message : 'Unable to load market trend.');
      setTrendPayload(null);
    } finally {
      setLoadingTrend(false);
    }
  }, [selectedCity, trendLimit]);

  const loadAdminRuns = useCallback(async () => {
    if (!isAdmin) {
      setAdminRuns([]);
      return;
    }

    try {
      const response = await getAdminInsightsJobRuns(token, 12);
      setAdminRuns((response.runs || []).filter((item) => item.jobName.includes('market')));
    } catch {
      // Keep panel non-blocking.
    }
  }, [isAdmin, token]);

  useEffect(() => {
    void loadTop();
  }, [loadTop]);

  useEffect(() => {
    void loadTrend();
  }, [loadTrend]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadAdminRuns();
  }, [isAdmin, loadAdminRuns]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void Promise.all([loadTop(), loadTrend(), isAdmin ? loadAdminRuns() : Promise.resolve()]);
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [isAdmin, loadAdminRuns, loadTop, loadTrend]);

  const runManualRefresh = async () => {
    if (!isAdmin) return;
    try {
      setRefreshing(true);
      const response = await runAdminMarketRefresh(token);
      if (response.status === 'success') {
        toast.success(`Market job completed. Updated ${response.itemsInserted} snapshots.`);
      } else {
        toast.error('Market job failed.');
      }
      await Promise.all([loadTop(), loadTrend(), loadAdminRuns()]);
    } catch (refreshError) {
      toast.error(refreshError instanceof Error ? refreshError.message : 'Unable to run market refresh job.');
    } finally {
      setRefreshing(false);
    }
  };

  const runPlaceLookup = useCallback(
    async (rawPlace?: string) => {
      const place = (rawPlace ?? placeInput).trim();
      if (place.length < 2) {
        setPlaceLookupError('Enter at least 2 characters.');
        return;
      }

      try {
        setPlaceLookupLoading(true);
        setPlaceLookupError('');
        const response = await getMarketPlacePrice(place);
        setPlaceLookupResult(response);
      } catch (lookupError) {
        setPlaceLookupResult(null);
        setPlaceLookupError(
          lookupError instanceof Error
            ? lookupError.message
            : 'Unable to fetch land price for this place right now.'
        );
      } finally {
        setPlaceLookupLoading(false);
      }
    },
    [placeInput]
  );

  const topCities = topPayload?.cities || [];
  const trend = trendPayload?.trend || [];

  const marketUpdatedAt = trendPayload?.lastUpdated || topPayload?.lastUpdated || null;

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container zdt-page-stack">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Area Intelligence</p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Market Price Tracker</h1>
          <p className="mt-2 text-sm text-slate-600">
            Locality-focused market intelligence with pricing movement, city trends, and infrastructure-linked signals.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <Badge variant="secondary">Last updated: {formatDateTime(marketUpdatedAt)}</Badge>
            <Badge variant="secondary">Data source: {trendPayload?.dataSource || topPayload?.dataSource || 'Market pipeline'}</Badge>
            <Badge variant="secondary">Auto refresh: every 3 min</Badge>
          </div>
        </div>

        <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedCity}
                onChange={(event) => setSelectedCity(event.target.value)}
                className="h-11 min-w-[180px] rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
              >
                {(topPayload?.allCities || []).map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={6}
                  max={120}
                  value={trendLimitInput}
                  onChange={(event) => setTrendLimitInput(event.target.value.replace(/[^0-9]/g, ''))}
                  className="h-11 w-[140px] bg-white"
                />
                <span className="text-xs text-slate-500">Months</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void loadTop()} disabled={loadingTop || loadingTrend}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
              {isAdmin ? (
                <Button onClick={() => void runManualRefresh()} disabled={refreshing}>
                  {refreshing ? 'Running job...' : 'Run Market Job (Admin)'}
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                Global Land Price Finder
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Search any location in the world and get an estimated land price per square foot.
              </p>
            </div>
            {placeLookupResult?.estimate?.confidence ? (
              <Badge variant="secondary">Confidence: {placeLookupResult.estimate.confidence}</Badge>
            ) : null}
          </div>

          <form
            className="mt-3 flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void runPlaceLookup();
            }}
          >
            <Input
              value={placeInput}
              onChange={(event) => setPlaceInput(event.target.value)}
              placeholder="Try: Dubai Marina, Paris, London, New York, Tokyo"
              className="h-11 min-w-[280px] flex-1 bg-white"
            />
            <Button type="submit" disabled={placeLookupLoading}>
              <Search className="mr-2 h-4 w-4" />
              {placeLookupLoading ? 'Searching...' : 'Search'}
            </Button>
          </form>

          {placeLookupError ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {placeLookupError}
            </div>
          ) : null}

          {placeLookupResult ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              {(() => {
                const currentPlotInr =
                  placeLookupResult.estimate.plotLandPricePerSqftInr ??
                  placeLookupResult.estimate.landPricePerSqftInr;
                const currentPlotUsd =
                  placeLookupResult.estimate.plotLandPricePerSqftUsd ??
                  placeLookupResult.estimate.landPricePerSqftUsd;
                const projectedInr =
                  placeLookupResult.estimate.projected12MonthPricePerSqftInr ?? currentPlotInr;
                const projectedUsd =
                  placeLookupResult.estimate.projected12MonthPricePerSqftUsd ?? currentPlotUsd;
                const projectedPct = placeLookupResult.estimate.projected12MonthChangePct;
                const isPredicted =
                  placeLookupResult.estimate.isPredicted ??
                  placeLookupResult.estimate.priceType !== 'market_snapshot';
                const caption =
                  placeLookupResult.estimate.caption ||
                  (isPredicted
                    ? 'Predicted value. Actual plot prices may differ.'
                    : 'Market snapshot value. Local actual prices can still differ.');
                return (
                  <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Resolved place</p>
                  <p className="mt-1 text-base font-semibold text-slate-900">{placeLookupResult.resolvedPlace}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {placeLookupResult.location.city || 'Unknown city'}
                    {placeLookupResult.location.country ? `, ${placeLookupResult.location.country}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Current plot land price</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">
                    {formatSqftPriceInr(currentPlotInr)}
                  </p>
                  <p className="text-xs text-slate-600">
                    {formatSqftPriceUsd(currentPlotUsd)}
                  </p>
                </div>
              </div>

              <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
                <p>
                  <span className="font-semibold text-slate-700">Price type:</span>{' '}
                  {formatPriceTypeLabel(placeLookupResult.estimate.priceType)}
                </p>
                <p>
                  <span className="font-semibold text-slate-700">Projected (12m):</span>{' '}
                  {formatSqftPriceInr(projectedInr)}
                  {Number.isFinite(projectedPct) ? ` (${projectedPct! >= 0 ? '+' : ''}${Number(projectedPct).toFixed(2)}%)` : ''}
                </p>
                <p>
                  <span className="font-semibold text-slate-700">Projected USD:</span>{' '}
                  {formatSqftPriceUsd(projectedUsd)}
                </p>
                <p>
                  <span className="font-semibold text-slate-700">Basis:</span>{' '}
                  {formatBasisLabel(placeLookupResult.estimate.basis)}
                </p>
                <p>
                  <span className="font-semibold text-slate-700">Matched city:</span>{' '}
                  {placeLookupResult.estimate.matchedCity || '-'}
                </p>
                <p>
                  <span className="font-semibold text-slate-700">Country multiplier:</span>{' '}
                  {placeLookupResult.estimate.countryMultiplier}
                </p>
                <p>
                  <span className="font-semibold text-slate-700">Updated:</span>{' '}
                  {formatDateTime(placeLookupResult.lastUpdated)}
                </p>
              </div>
              <p
                className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                  isPredicted
                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                    : 'border-blue-200 bg-blue-50 text-blue-800'
                }`}
              >
                {caption}
              </p>
                  </>
                );
              })()}
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Top Cities by Avg INR/sqft</h2>
            <div className="mt-3 h-[320px]">
              {loadingTop ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topCities} margin={{ top: 10, right: 14, left: 0, bottom: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="city" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis tickFormatter={(value) => `INR ${Number(value).toLocaleString('en-IN')}`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: number) => formatMoney(Number(value))} />
                    <Bar dataKey="avgPriceSqft" fill="#8A7435" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">City Trend (Monthly)</h2>
            <div className="mt-3 h-[320px]">
              {loadingTrend ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 10, right: 14, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(value) => `INR ${Number(value).toLocaleString('en-IN')}`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: number) => formatMoney(Number(value))} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="avgPriceSqft"
                      name={`${selectedCity || 'City'} Avg INR/sqft`}
                      stroke="#0f766e"
                      strokeWidth={2.5}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Snapshot Table</h2>
          {loadingTop ? (
            <div className="mt-3 space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={`tbl-${index}`} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-[760px] w-full border-collapse bg-white text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="border-b border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">City</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Avg INR/sqft</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">MoM %</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">YoY %</th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {topCities.map((row) => (
                    <tr key={`${row.city}-${row.period}`} className="odd:bg-white even:bg-slate-50/50">
                      <td className="border-b border-slate-200 px-3 py-2 font-medium text-slate-900">{row.city}</td>
                      <td className="border-b border-slate-200 px-3 py-2 text-slate-800">{formatMoney(row.avgPriceSqft)}</td>
                      <td className={`border-b border-slate-200 px-3 py-2 ${Number(row.momChange || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {formatPercent(row.momChange)}
                      </td>
                      <td className={`border-b border-slate-200 px-3 py-2 ${Number(row.yoyChange || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {formatPercent(row.yoyChange)}
                      </td>
                      <td className="border-b border-slate-200 px-3 py-2 text-slate-600">{formatDateTime(row.fetchedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {isAdmin ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Admin Job Runs</h2>
            <div className="mt-3 space-y-2">
              {adminRuns.slice(0, 8).map((run) => (
                <div key={run.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                  <p className="font-semibold text-slate-900">
                    {run.jobName} - {run.status}
                  </p>
                  <p className="text-slate-500">{formatDateTime(run.finishedAt)}</p>
                  <p className="text-slate-600">
                    fetched {run.itemsFetched}, inserted {run.itemsInserted}
                  </p>
                  {run.error ? <p className="mt-1 text-red-700">{run.error}</p> : null}
                </div>
              ))}
              {adminRuns.length === 0 ? (
                <p className="text-sm text-slate-500">No market job runs yet.</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
