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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { AuthUser } from '@/lib/session';
import {
  getMarketCompare,
  getMarketTopCities,
  type MarketCompareResponse,
  type MarketTopCitiesResponse,
} from '@/lib/insightsApi';
import InsightsTabs from './InsightsTabs';

interface InsightsComparePageProps {
  token: string;
  user: AuthUser | null;
}

const LINE_COLORS = ['#8A7435', '#6A5630', '#B08C42', '#8D745A', '#C49E56'];

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

export default function InsightsComparePage({ token: _token, user: _user }: InsightsComparePageProps) {
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [compareLoading, setCompareLoading] = useState(false);
  const [error, setError] = useState('');

  const [topPayload, setTopPayload] = useState<MarketTopCitiesResponse | null>(null);
  const [comparePayload, setComparePayload] = useState<MarketCompareResponse | null>(null);

  const [monthsInput, setMonthsInput] = useState('36');
  const [selectedCities, setSelectedCities] = useState<string[]>([]);

  const months = useMemo(() => {
    const parsed = Number(monthsInput);
    if (!Number.isFinite(parsed)) return 36;
    return Math.min(Math.max(Math.trunc(parsed), 6), 120);
  }, [monthsInput]);

  const loadOptions = useCallback(async () => {
    try {
      setOptionsLoading(true);
      const response = await getMarketTopCities(20);
      setTopPayload(response);

      if (selectedCities.length === 0) {
        setSelectedCities(response.allCities.slice(0, 2));
      }
    } catch (optionsError) {
      setError(optionsError instanceof Error ? optionsError.message : 'Unable to load city options.');
      setTopPayload(null);
    } finally {
      setOptionsLoading(false);
    }
  }, [selectedCities.length]);

  const loadCompare = useCallback(async () => {
    if (selectedCities.length < 2) {
      setComparePayload(null);
      return;
    }

    try {
      setCompareLoading(true);
      setError('');
      const response = await getMarketCompare(selectedCities, months);
      setComparePayload(response);
    } catch (compareError) {
      setError(compareError instanceof Error ? compareError.message : 'Unable to load compare data.');
      setComparePayload(null);
    } finally {
      setCompareLoading(false);
    }
  }, [months, selectedCities]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    void loadCompare();
  }, [loadCompare]);

  const toggleCity = (city: string) => {
    setSelectedCities((prev) => {
      if (prev.includes(city)) {
        if (prev.length <= 2) return prev;
        return prev.filter((item) => item !== city);
      }
      if (prev.length >= 5) return prev;
      return [...prev, city];
    });
  };

  const latestBarData = useMemo(
    () =>
      (comparePayload?.latest || []).map((item) => ({
        city: item.city,
        avgPriceSqft: item.avgPriceSqft,
        momChange: item.momChange,
      })),
    [comparePayload?.latest]
  );

  const seriesData = comparePayload?.series || [];

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container zdt-page-stack">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">News & Insights</p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">City Price Compare</h1>
          <p className="mt-2 text-sm text-slate-600">
            Compare 2 to 5 cities using grouped price bars, trend lines, and growth highlights.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <Badge variant="secondary">Last updated: {formatDateTime(comparePayload?.lastUpdated || topPayload?.lastUpdated)}</Badge>
            <Badge variant="secondary">Data source: {comparePayload?.dataSource || topPayload?.dataSource || 'Market snapshots'}</Badge>
          </div>
        </div>

        <InsightsTabs active="compare" />

        <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              type="number"
              min={6}
              max={120}
              value={monthsInput}
              onChange={(event) => setMonthsInput(event.target.value.replace(/[^0-9]/g, ''))}
              className="h-11 w-[150px] bg-white"
            />
            <span className="text-sm text-slate-600">Months for trend</span>
            <Button variant="outline" onClick={() => void loadCompare()} disabled={compareLoading || selectedCities.length < 2}>
              Refresh Compare
            </Button>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {(topPayload?.allCities || []).map((city) => {
              const selected = selectedCities.includes(city);
              return (
                <button
                  key={city}
                  type="button"
                  onClick={() => toggleCity(city)}
                  className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                    selected
                      ? 'border-blue-500 bg-blue-50 text-blue-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  {city}
                </button>
              );
            })}
          </div>

          <p className="mt-2 text-xs text-slate-500">Selected: {selectedCities.join(', ') || 'None'}</p>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : null}

        {optionsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : null}

        {selectedCities.length < 2 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
            Select at least 2 cities to compare.
          </div>
        ) : null}

        {selectedCities.length >= 2 ? (
          <>
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Grouped Price Chart</h2>
                <div className="mt-3 h-[320px]">
                  {compareLoading ? (
                    <Skeleton className="h-full w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={latestBarData} margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="city" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(value) => `INR ${Number(value).toLocaleString('en-IN')}`} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(value: number) => formatMoney(Number(value))} />
                        <Legend />
                        <Bar dataKey="avgPriceSqft" name="Avg INR/sqft" fill="#8A7435" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Trend Comparison</h2>
                <div className="mt-3 h-[320px]">
                  {compareLoading ? (
                    <Skeleton className="h-full w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={seriesData} margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(value) => `INR ${Number(value).toLocaleString('en-IN')}`} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(value: number) => formatMoney(Number(value))} />
                        <Legend />
                        {selectedCities.map((cityName, index) => (
                          <Line
                            key={cityName}
                            type="monotone"
                            dataKey={cityName}
                            name={cityName}
                            stroke={LINE_COLORS[index % LINE_COLORS.length]}
                            dot={false}
                            strokeWidth={2.3}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Highest Price City</h3>
                <p className="mt-2 text-xl font-semibold text-slate-900">
                  {comparePayload?.summary.highestPriceCity?.city || '-'}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {formatMoney(comparePayload?.summary.highestPriceCity?.avgPriceSqft || null)}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Fastest Growth</h3>
                <p className="mt-2 text-xl font-semibold text-slate-900">
                  {comparePayload?.summary.fastestGrowthCity?.city || '-'}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {comparePayload?.summary.fastestGrowthCity
                    ? `${comparePayload.summary.fastestGrowthCity.metric}: ${formatPercent(comparePayload.summary.fastestGrowthCity.value)}`
                    : '-'}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Latest Compare Table</h2>
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-[720px] w-full border-collapse bg-white text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="border-b border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">City</th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Avg INR/sqft</th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">MoM %</th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">YoY %</th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Period</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(comparePayload?.latest || []).map((row) => (
                      <tr key={`${row.city}-${row.period}`} className="odd:bg-white even:bg-slate-50/50">
                        <td className="border-b border-slate-200 px-3 py-2 font-medium text-slate-900">{row.city}</td>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-800">{formatMoney(row.avgPriceSqft)}</td>
                        <td className={`border-b border-slate-200 px-3 py-2 ${Number(row.momChange || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                          {formatPercent(row.momChange)}
                        </td>
                        <td className={`border-b border-slate-200 px-3 py-2 ${Number(row.yoyChange || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                          {formatPercent(row.yoyChange)}
                        </td>
                        <td className="border-b border-slate-200 px-3 py-2 text-slate-600">{row.period}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
