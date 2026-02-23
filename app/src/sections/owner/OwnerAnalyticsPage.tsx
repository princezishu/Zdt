import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BarChart3,
  IndianRupee,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  Users,
} from 'lucide-react';
import { apiRequest } from '@/lib/http';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

interface OwnerAnalyticsPageProps {
  onOpenDashboard: () => void;
  onOpenPayments: () => void;
}

interface ConversionMonthlyPoint {
  month: string;
  monthStart: string;
  leads: number;
  closed: number;
  conversionRate: number;
}

interface FunnelPoint {
  stage: string;
  count: number;
}

interface RevenueMonthlyPoint {
  month: string;
  monthStart: string;
  commission: number;
  bookings: number;
  revenue: number;
}

interface RevenueYearlyPoint {
  year: string;
  yearStart: string;
  commission: number;
  bookings: number;
  revenue: number;
}

interface LeadSourcePoint {
  source: string;
  count: number;
}

interface PropertyPerformanceRow {
  listingId: number;
  listingType: 'sale' | 'rental';
  title: string;
  propertyType: string;
  city: string;
  locality: string;
  views: number;
  leads: number;
  siteVisits: number;
  deals: number;
  revenue: number;
}

interface FastestSellingProperty {
  listingId: number;
  title: string;
  city: string;
  locality: string;
  daysToClose: number;
}

interface AgentPerformanceRow {
  agentId: number;
  agentName: string;
  leadsAssigned: number;
  dealsClosed: number;
  revenueGenerated: number;
  avgResponseTimeHours: number;
}

interface CommissionRow {
  id: number;
  propertyId: number;
  propertyTitle: string;
  propertyType: string;
  agentId: number;
  agentName: string;
  commissionPercent: number;
  commissionAmount: number;
  status: 'pending' | 'paid';
  createdAt: string;
}

interface AnalyticsResponse {
  totalListings: number;
  totalRentalListings: number;
  totalViews: number;
  totalLeads: number;
  activeLeads: number;
  closedDeals: number;
  conversionRate: number;
  totalRevenue: number;
  thisMonthRevenue: number;
  earnings: {
    commission: number;
    bookingRevenue: number;
  };
  boostedListings: number;
  pendingApproval: number;
  conversionMonthly: ConversionMonthlyPoint[];
  conversionFunnel: FunnelPoint[];
  revenueMonthly: RevenueMonthlyPoint[];
  revenueYearly: RevenueYearlyPoint[];
  leadSourceBreakdown: LeadSourcePoint[];
  propertyPerformance: PropertyPerformanceRow[];
  performanceHighlights: {
    mostViewedProperty: PropertyPerformanceRow | null;
    fastestSellingProperty: FastestSellingProperty | null;
    highestRevenueProperty: PropertyPerformanceRow | null;
  };
  agentPerformance: AgentPerformanceRow[];
  commissionReport: {
    totalCommission: number;
    rows: CommissionRow[];
  };
}

interface KpiTileProps {
  label: string;
  value: string;
  hint?: string;
}

interface SectionCardProps {
  title: string;
  subtitle: string;
  icon: ReactNode;
  children: ReactNode;
}

const SOURCE_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

function formatCurrency(value: number): string {
  return `INR ${Math.round(value || 0).toLocaleString('en-IN')}`;
}

function formatNumber(value: number): string {
  return Math.round(value || 0).toLocaleString('en-IN');
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function parseDateStart(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = new Date(`${value}T00:00:00`);
  const time = parsed.getTime();
  return Number.isNaN(time) ? null : time;
}

function parseDateEnd(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = new Date(`${value}T23:59:59`);
  const time = parsed.getTime();
  return Number.isNaN(time) ? null : time;
}

export default function OwnerAnalyticsPage({
  onOpenDashboard,
  onOpenPayments,
}: OwnerAnalyticsPageProps) {
  const [stats, setStats] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [commissionStartDate, setCommissionStartDate] = useState('');
  const [commissionEndDate, setCommissionEndDate] = useState('');
  const [commissionAgentId, setCommissionAgentId] = useState('all');
  const [commissionPropertyType, setCommissionPropertyType] = useState('all');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    apiRequest<AnalyticsResponse>('/api/owner/analytics')
      .then((response) => {
        if (!active) return;
        setStats(response);
      })
      .catch((loadError) => {
        if (!active) return;
        setStats(null);
        setError(loadError instanceof Error ? loadError.message : 'Unable to load analytics.');
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const sourceData = useMemo(() => {
    const base = stats?.leadSourceBreakdown || [];
    if (base.length > 0) return base;
    return [
      { source: 'Website form leads', count: 0 },
      { source: 'WhatsApp leads', count: 0 },
      { source: 'Instagram leads', count: 0 },
      { source: 'Facebook Ads', count: 0 },
      { source: 'Direct calls', count: 0 },
    ];
  }, [stats]);

  const commissionRows = useMemo(() => stats?.commissionReport?.rows || [], [stats]);
  const commissionAgentOptions = useMemo(() => {
    const unique = new Map<number, string>();
    commissionRows.forEach((row) => {
      if (!unique.has(row.agentId)) {
        unique.set(row.agentId, row.agentName);
      }
    });
    return Array.from(unique.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [commissionRows]);
  const commissionPropertyTypeOptions = useMemo(() => {
    const unique = new Set<string>();
    commissionRows.forEach((row) => {
      if (row.propertyType) unique.add(row.propertyType);
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [commissionRows]);

  const filteredCommissionRows = useMemo(() => {
    const start = parseDateStart(commissionStartDate);
    const end = parseDateEnd(commissionEndDate);
    return commissionRows.filter((row) => {
      if (commissionAgentId !== 'all' && String(row.agentId) !== commissionAgentId) return false;
      if (commissionPropertyType !== 'all' && row.propertyType !== commissionPropertyType) return false;
      if (start !== null || end !== null) {
        const rowTime = new Date(row.createdAt).getTime();
        if (Number.isNaN(rowTime)) return false;
        if (start !== null && rowTime < start) return false;
        if (end !== null && rowTime > end) return false;
      }
      return true;
    });
  }, [commissionAgentId, commissionEndDate, commissionPropertyType, commissionRows, commissionStartDate]);

  const commissionFilteredTotal = useMemo(
    () => filteredCommissionRows.reduce((sum, row) => sum + Number(row.commissionAmount || 0), 0),
    [filteredCommissionRows]
  );

  const commissionByAgent = useMemo(() => {
    const map = new Map<number, { agentId: number; agentName: string; amount: number }>();
    filteredCommissionRows.forEach((row) => {
      const current = map.get(row.agentId) || {
        agentId: row.agentId,
        agentName: row.agentName,
        amount: 0,
      };
      current.amount += Number(row.commissionAmount || 0);
      map.set(row.agentId, current);
    });
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [filteredCommissionRows]);

  const commissionByProperty = useMemo(() => {
    const map = new Map<number, { propertyId: number; propertyTitle: string; amount: number }>();
    filteredCommissionRows.forEach((row) => {
      const current = map.get(row.propertyId) || {
        propertyId: row.propertyId,
        propertyTitle: row.propertyTitle,
        amount: 0,
      };
      current.amount += Number(row.commissionAmount || 0);
      map.set(row.propertyId, current);
    });
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [filteredCommissionRows]);

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">CRM Analytics</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">
              Revenue, conversion, and performance dashboard
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Full analytics view for lead pipeline, growth, source quality, and commission.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onOpenDashboard}>
              Back to Dashboard
            </Button>
            <Button className="bg-blue-700 text-white hover:bg-blue-800" onClick={onOpenPayments}>
              View Payments
            </Button>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={`kpi-skeleton-${index}`} className="h-28 rounded-2xl bg-slate-200" />
            ))}
          </div>
        ) : null}

        {!loading && stats ? (
          <SectionCard
            title="CRM Analytics"
            subtitle="Single analytics section for lead pipeline, growth, source quality, and commission."
            icon={<BarChart3 className="h-5 w-5 text-blue-600" />}
          >
            <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <KpiTile label="Total Leads" value={formatNumber(stats.totalLeads)} hint="All captured leads" />
              <KpiTile label="Active Leads" value={formatNumber(stats.activeLeads)} hint="Open pipeline leads" />
              <KpiTile label="Closed Deals" value={formatNumber(stats.closedDeals)} hint="Won outcomes" />
              <KpiTile label="Total Revenue" value={formatCurrency(stats.totalRevenue)} hint="Paid commission + bookings" />
              <KpiTile label="This Month Revenue" value={formatCurrency(stats.thisMonthRevenue)} hint="Current month performance" />
              <KpiTile label="Conversion Rate %" value={`${stats.conversionRate.toFixed(1)}%`} hint="Closed / total leads" />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <SectionCard
                title="Sales Conversion Trend"
                subtitle="Monthly leads, closed deals, and conversion percentage."
                icon={<LineChartIcon className="h-5 w-5 text-blue-600" />}
              >
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats.conversionMonthly} margin={{ top: 10, right: 20, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="month" stroke="#64748b" />
                      <YAxis yAxisId="count" stroke="#64748b" />
                      <YAxis yAxisId="rate" orientation="right" unit="%" stroke="#64748b" />
                      <Tooltip />
                      <Legend />
                      <Bar yAxisId="count" dataKey="leads" fill="#93c5fd" name="Leads" radius={[4, 4, 0, 0]} />
                      <Bar yAxisId="count" dataKey="closed" fill="#10b981" name="Closed" radius={[4, 4, 0, 0]} />
                      <Line
                        yAxisId="rate"
                        type="monotone"
                        dataKey="conversionRate"
                        stroke="#1d4ed8"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        name="Conversion %"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>

              <SectionCard
                title="Lead Funnel"
                subtitle="Leads to visits to negotiation to closed."
                icon={<BarChart3 className="h-5 w-5 text-blue-600" />}
              >
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={stats.conversionFunnel}
                      layout="vertical"
                      margin={{ top: 10, right: 20, left: 20, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" stroke="#64748b" />
                      <YAxis type="category" dataKey="stage" stroke="#64748b" width={90} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#0ea5e9" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <SectionCard
                title="Revenue Growth (6 Months)"
                subtitle="Monthly trend for paid commission and confirmed bookings."
                icon={<LineChartIcon className="h-5 w-5 text-indigo-600" />}
              >
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats.revenueMonthly} margin={{ top: 10, right: 20, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="month" stroke="#64748b" />
                      <YAxis stroke="#64748b" />
                      <Tooltip formatter={(value) => formatCurrency(Number(value || 0))} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="revenue"
                        stroke="#4f46e5"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        name="Revenue"
                      />
                      <Line
                        type="monotone"
                        dataKey="commission"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={{ r: 2 }}
                        name="Commission"
                      />
                      <Line
                        type="monotone"
                        dataKey="bookings"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        dot={{ r: 2 }}
                        name="Bookings"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>

              <SectionCard
                title="Revenue Yearly"
                subtitle="Year-wise revenue bars for strategic planning."
                icon={<BarChart3 className="h-5 w-5 text-indigo-600" />}
              >
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.revenueYearly} margin={{ top: 10, right: 20, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="year" stroke="#64748b" />
                      <YAxis stroke="#64748b" />
                      <Tooltip formatter={(value) => formatCurrency(Number(value || 0))} />
                      <Legend />
                      <Bar dataKey="commission" stackId="yearly" fill="#10b981" name="Commission" />
                      <Bar dataKey="bookings" stackId="yearly" fill="#f59e0b" name="Bookings" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>
            </div>

            <SectionCard
              title="Lead Source Analysis"
              subtitle="Know which channels bring better lead volume."
              icon={<PieChartIcon className="h-5 w-5 text-blue-600" />}
            >
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={sourceData}
                        dataKey="count"
                        nameKey="source"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        innerRadius={44}
                        label={({ source, percent }) =>
                          percent && percent > 0 ? `${source}: ${(percent * 100).toFixed(0)}%` : ''
                        }
                      >
                        {sourceData.map((entry, index) => (
                          <Cell key={`source-${entry.source}`} fill={SOURCE_COLORS[index % SOURCE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  {sourceData.map((item, index) => (
                    <div key={item.source} className="flex items-center justify-between text-sm text-slate-700">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: SOURCE_COLORS[index % SOURCE_COLORS.length] }}
                        />
                        {item.source}
                      </span>
                      <span className="font-semibold">{formatNumber(item.count)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Property Performance"
              subtitle="Views, leads, visits, and deals by listing."
              icon={<BarChart3 className="h-5 w-5 text-blue-600" />}
            >
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Most viewed</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {stats.performanceHighlights.mostViewedProperty?.title || 'No data'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Views: {formatNumber(stats.performanceHighlights.mostViewedProperty?.views || 0)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Fastest selling</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {stats.performanceHighlights.fastestSellingProperty?.title || 'No data'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Days to close: {stats.performanceHighlights.fastestSellingProperty?.daysToClose ?? 0}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Highest revenue</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {stats.performanceHighlights.highestRevenueProperty?.title || 'No data'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Revenue: {formatCurrency(stats.performanceHighlights.highestRevenueProperty?.revenue || 0)}
                  </p>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Property</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Views</th>
                      <th className="px-3 py-2">Leads</th>
                      <th className="px-3 py-2">Site Visits</th>
                      <th className="px-3 py-2">Deals</th>
                      <th className="px-3 py-2">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.propertyPerformance.slice(0, 18).map((row) => (
                      <tr key={`${row.listingType}-${row.listingId}`} className="border-b border-slate-100">
                        <td className="px-3 py-2">
                          <p className="font-medium text-slate-900">{row.title}</p>
                          <p className="text-xs text-slate-500">{row.locality || row.city}</p>
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {row.propertyType} ({row.listingType})
                        </td>
                        <td className="px-3 py-2 text-slate-700">{formatNumber(row.views)}</td>
                        <td className="px-3 py-2 text-slate-700">{formatNumber(row.leads)}</td>
                        <td className="px-3 py-2 text-slate-700">{formatNumber(row.siteVisits)}</td>
                        <td className="px-3 py-2 text-slate-700">{formatNumber(row.deals)}</td>
                        <td className="px-3 py-2 font-medium text-slate-900">{formatCurrency(row.revenue)}</td>
                      </tr>
                    ))}
                    {stats.propertyPerformance.length === 0 ? (
                      <tr>
                        <td className="px-3 py-4 text-slate-500" colSpan={7}>
                          No property performance data yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            <SectionCard
              title="Agent Performance Analytics"
              subtitle="Lead load, closures, revenue output, and response speed."
              icon={<Users className="h-5 w-5 text-blue-600" />}
            >
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Agent</th>
                      <th className="px-3 py-2">Leads Assigned</th>
                      <th className="px-3 py-2">Deals Closed</th>
                      <th className="px-3 py-2">Revenue Generated</th>
                      <th className="px-3 py-2">Avg Response Time (hrs)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.agentPerformance.map((row) => (
                      <tr key={row.agentId} className="border-b border-slate-100">
                        <td className="px-3 py-2 font-medium text-slate-900">{row.agentName}</td>
                        <td className="px-3 py-2 text-slate-700">{formatNumber(row.leadsAssigned)}</td>
                        <td className="px-3 py-2 text-slate-700">{formatNumber(row.dealsClosed)}</td>
                        <td className="px-3 py-2 text-slate-700">{formatCurrency(row.revenueGenerated)}</td>
                        <td className="px-3 py-2 text-slate-700">{row.avgResponseTimeHours.toFixed(1)}</td>
                      </tr>
                    ))}
                    {stats.agentPerformance.length === 0 ? (
                      <tr>
                        <td className="px-3 py-4 text-slate-500" colSpan={5}>
                          No agent performance data available.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            <SectionCard
              title="Commission Report"
              subtitle="Filter by date, agent, and property type."
              icon={<IndianRupee className="h-5 w-5 text-blue-600" />}
            >
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Input
                  type="date"
                  value={commissionStartDate}
                  onChange={(event) => setCommissionStartDate(event.target.value)}
                  className="h-10 bg-white"
                />
                <Input
                  type="date"
                  value={commissionEndDate}
                  onChange={(event) => setCommissionEndDate(event.target.value)}
                  className="h-10 bg-white"
                />
                <select
                  value={commissionAgentId}
                  onChange={(event) => setCommissionAgentId(event.target.value)}
                  className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
                >
                  <option value="all">All agents</option>
                  {commissionAgentOptions.map((item) => (
                    <option key={item.id} value={String(item.id)}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <select
                  value={commissionPropertyType}
                  onChange={(event) => setCommissionPropertyType(event.target.value)}
                  className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
                >
                  <option value="all">All property types</option>
                  {commissionPropertyTypeOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Total commission earned</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{formatCurrency(commissionFilteredTotal)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Top agent (filtered)</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {commissionByAgent[0]?.agentName || 'No data'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatCurrency(commissionByAgent[0]?.amount || 0)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Top property (filtered)</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {commissionByProperty[0]?.propertyTitle || 'No data'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatCurrency(commissionByProperty[0]?.amount || 0)}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Commission per agent</p>
                  <div className="mt-2 space-y-1.5 text-sm">
                    {commissionByAgent.slice(0, 8).map((row) => (
                      <div key={row.agentId} className="flex items-center justify-between">
                        <span className="text-slate-700">{row.agentName}</span>
                        <span className="font-semibold text-slate-900">{formatCurrency(row.amount)}</span>
                      </div>
                    ))}
                    {commissionByAgent.length === 0 ? <p className="text-slate-500">No rows</p> : null}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Commission per property</p>
                  <div className="mt-2 space-y-1.5 text-sm">
                    {commissionByProperty.slice(0, 8).map((row) => (
                      <div key={row.propertyId} className="flex items-center justify-between gap-3">
                        <span className="truncate text-slate-700">{row.propertyTitle}</span>
                        <span className="shrink-0 font-semibold text-slate-900">{formatCurrency(row.amount)}</span>
                      </div>
                    ))}
                    {commissionByProperty.length === 0 ? <p className="text-slate-500">No rows</p> : null}
                  </div>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Property</th>
                      <th className="px-3 py-2">Agent</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Commission %</th>
                      <th className="px-3 py-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCommissionRows.slice(0, 40).map((row) => (
                      <tr key={row.id} className="border-b border-slate-100">
                        <td className="px-3 py-2 text-slate-700">{formatDate(row.createdAt)}</td>
                        <td className="px-3 py-2 font-medium text-slate-900">{row.propertyTitle}</td>
                        <td className="px-3 py-2 text-slate-700">{row.agentName}</td>
                        <td className="px-3 py-2 text-slate-700">{row.propertyType}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              row.status === 'paid'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-700">{row.commissionPercent.toFixed(2)}%</td>
                        <td className="px-3 py-2 font-semibold text-slate-900">
                          {formatCurrency(row.commissionAmount)}
                        </td>
                      </tr>
                    ))}
                    {filteredCommissionRows.length === 0 ? (
                      <tr>
                        <td className="px-3 py-4 text-slate-500" colSpan={7}>
                          No commission rows match current filters.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-800">
              <p className="font-semibold">Future enhancement: AI lead score</p>
              <p className="mt-1">
                Add hot/warm/cold scoring from budget match, location match, and engagement frequency.
              </p>
            </div>
            </div>
          </SectionCard>
        ) : null}
      </div>
    </section>
  );
}

function KpiTile({ label, value, hint }: KpiTileProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function SectionCard({ title, subtitle, icon, children }: SectionCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 p-2 text-slate-500">{icon}</span>
      </div>
      {children}
    </div>
  );
}
