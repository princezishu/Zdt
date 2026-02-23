import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  Bolt,
  Home,
  LineChart,
  Users,
} from 'lucide-react';
import { apiRequest } from '@/lib/http';
import { Button } from '@/components/ui/button';

interface OwnerDashboardPageProps {
  onOpenAddProperty: () => void;
  onOpenListings: () => void;
  onOpenLeads: () => void;
  onOpenAnalytics: () => void;
  onOpenSubscriptions: () => void;
}

interface AnalyticsResponse {
  totalListings: number;
  totalRentalListings: number;
  totalViews: number;
  totalLeads: number;
  conversionRate: number;
  earnings: {
    commission: number;
    bookingRevenue: number;
  };
  boostedListings: number;
  pendingApproval: number;
}

function formatCurrency(value: number): string {
  if (!value || value <= 0) return 'INR 0';
  return `INR ${Math.round(value).toLocaleString('en-IN')}`;
}

export default function OwnerDashboardPage({
  onOpenAddProperty,
  onOpenListings,
  onOpenLeads,
  onOpenAnalytics,
  onOpenSubscriptions,
}: OwnerDashboardPageProps) {
  const [stats, setStats] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiRequest<AnalyticsResponse>('/api/owner/analytics')
      .then((response) => {
        if (!active) return;
        setStats(response);
      })
      .catch(() => {
        if (!active) return;
        setStats(null);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const earningsTotal = useMemo(() => {
    if (!stats) return 0;
    return (stats.earnings?.commission || 0) + (stats.earnings?.bookingRevenue || 0);
  }, [stats]);

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-[#0b1b32] via-[#122c3f] to-[#1f3a4b] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-blue-200">Owner Command Center</p>
              <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">Track, monetize, and scale your listings.</h1>
              <p className="mt-2 max-w-2xl text-sm text-blue-100/90">
                A premium workspace to manage sales, rentals, leads, and upgrades in one view.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button className="h-10 rounded-full bg-white/15 text-white hover:bg-white/25" onClick={onOpenListings}>
                <Home className="mr-2 h-4 w-4" />
                Listings
              </Button>
              <Button className="h-10 rounded-full bg-white/15 text-white hover:bg-white/25" onClick={onOpenLeads}>
                <Users className="mr-2 h-4 w-4" />
                Leads
              </Button>
              <Button className="h-10 rounded-full bg-blue-500 text-white hover:bg-blue-400" onClick={onOpenAddProperty}>
                Add Property
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Active Listings" value={stats?.totalListings ?? 0} icon={<Home className="h-5 w-5" />} />
          <StatCard title="Rental Listings" value={stats?.totalRentalListings ?? 0} icon={<Home className="h-5 w-5" />} />
          <StatCard title="Total Views" value={stats?.totalViews ?? 0} icon={<LineChart className="h-5 w-5" />} />
          <StatCard title="Total Leads" value={stats?.totalLeads ?? 0} icon={<Users className="h-5 w-5" />} />
        </div>

        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Performance Snapshot</h2>
                <p className="text-sm text-slate-500">Views, leads, and revenue momentum.</p>
              </div>
              <Button variant="outline" onClick={onOpenAnalytics}>
                View Analytics
              </Button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <MetricCard title="Conversion Rate" value={`${stats?.conversionRate ?? 0}%`} />
              <MetricCard title="Earnings Summary" value={formatCurrency(earningsTotal)} />
              <MetricCard title="Boosted Listings" value={String(stats?.boostedListings ?? 0)} />
            </div>
            <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6">
              <div className="flex items-center gap-3 text-sm text-slate-600">
                <BarChart3 className="h-5 w-5 text-blue-600" />
                Views over time chart placeholder
              </div>
              <div className="mt-4 h-32 w-full rounded-xl bg-gradient-to-r from-blue-200 via-blue-100 to-white" />
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">Revenue Stream</h3>
              <p className="mt-1 text-sm text-slate-500">Subscription + commission blend.</p>
              <div className="mt-4 space-y-3 text-sm text-slate-700">
                <div className="flex items-center justify-between">
                  <span>Commission Earned</span>
                  <span className="font-semibold text-slate-900">
                    {formatCurrency(stats?.earnings?.commission ?? 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Booking Revenue</span>
                  <span className="font-semibold text-slate-900">
                    {formatCurrency(stats?.earnings?.bookingRevenue ?? 0)}
                  </span>
                </div>
              </div>
              <Button className="mt-5 w-full bg-blue-700 text-white hover:bg-blue-800" onClick={onOpenSubscriptions}>
                Manage Subscription
              </Button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Bolt className="h-4 w-4 text-amber-500" />
                Boosted Listings
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Spotlight active: {stats?.boostedListings ?? 0} listings.
              </p>
              <div className="mt-4 h-28 rounded-xl bg-gradient-to-br from-amber-50 via-orange-50 to-white p-4 text-xs text-amber-700">
                Promotion placement chart placeholder
              </div>
            </div>
          </div>
        </div>

        {loading && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            Loading owner analytics...
          </div>
        )}
      </div>
    </section>
  );
}

function StatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{title}</span>
        <span className="text-slate-400">{icon}</span>
      </div>
      <p className="mt-3 text-2xl font-semibold text-slate-900">{value.toLocaleString('en-IN')}</p>
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}
