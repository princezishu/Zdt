import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  ClipboardList,
  Eye,
  Heart,
  Home,
  MapPin,
  MessageCircle,
  MousePointerClick,
  Search,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/http';
import type { AuthUser } from '@/lib/session';

interface DashboardProps {
  onBackHome: () => void;
  onOpenMessages: () => void;
  onOpenFavorites: () => void;
  onOpenOwnerPanel: () => void;
  user: AuthUser | null;
}

interface DashboardProfilePayload {
  myActivity: {
    buyer: {
      savedProperties: number;
      recentlyViewed: number;
      inquiryHistory: number;
      propertyVisitRequests: number;
      purchaseRequestsStatus: number;
    };
    seller: {
      totalPropertiesAdded: number;
      pendingApproval: number;
      approvedListings: number;
      soldProperties: number;
      totalViews: number;
      totalClicks: number;
      totalSavedLiked: number;
      totalInquiries: number;
      totalChatInquiries: number;
      totalVisitRequests: number;
    };
  };
  analyticsAndPerformance: {
    monthlyListingStats: Array<{ month: string; total: number }>;
    monthlyViewsStats: Array<{ month: string; total: number }>;
    monthlyClicksStats: Array<{ month: string; total: number }>;
    inquiryConversionRate: number;
    clickThroughRate: number;
    saveRate: number;
    summaryLabel: string;
    viewsGraphLabel: string;
  };
  security: {
    loginActivity: Array<{
      id: number;
      actionKey: string;
      createdAt: string;
      entityType?: string;
      requestReference?: string | null;
    }>;
  };
}

function roleLabel(user: AuthUser | null): string {
  if (!user) {
    return 'User';
  }
  if (user.isMainAdmin) {
    return 'Main Admin';
  }
  if (user.role === 'admin') {
    return 'Admin';
  }
  if (user.role === 'team_member') {
    return 'Team Member';
  }
  return 'User';
}

export default function Dashboard({ onBackHome, onOpenMessages, onOpenFavorites, onOpenOwnerPanel, user }: DashboardProps) {
  const userDisplayName = user?.name || 'User';
  const accessLabel = roleLabel(user);
  const isOwnerRole = Boolean(user && ['owner', 'agent', 'builder', 'admin'].includes(user.role));
  const [profile, setProfile] = useState<DashboardProfilePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError('');

    apiRequest<{ profile: DashboardProfilePayload }>('/auth/profile')
      .then((response) => {
        if (!active) return;
        setProfile(response.profile);
      })
      .catch((loadError) => {
        if (!active) return;
        setProfile(null);
        setError(loadError instanceof Error ? loadError.message : 'Unable to load analytics');
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const seller = profile?.myActivity.seller || {
    totalPropertiesAdded: 0,
    pendingApproval: 0,
    approvedListings: 0,
    soldProperties: 0,
    totalViews: 0,
    totalClicks: 0,
    totalSavedLiked: 0,
    totalInquiries: 0,
    totalChatInquiries: 0,
    totalVisitRequests: 0,
  };

  const buyer = profile?.myActivity.buyer || {
    savedProperties: 0,
    recentlyViewed: 0,
    inquiryHistory: 0,
    propertyVisitRequests: 0,
    purchaseRequestsStatus: 0,
  };

  const analytics = profile?.analyticsAndPerformance || {
    monthlyListingStats: [],
    monthlyViewsStats: [],
    monthlyClicksStats: [],
    inquiryConversionRate: 0,
    clickThroughRate: 0,
    saveRate: 0,
    summaryLabel: 'Live property engagement summary',
    viewsGraphLabel: 'Property activity overview',
  };

  const keyMetrics = [
    { label: 'Property Views', value: String(seller.totalViews), icon: Eye },
    { label: 'Property Clicks', value: String(seller.totalClicks), icon: MousePointerClick },
    { label: 'Saved / Liked', value: String(seller.totalSavedLiked), icon: Heart },
    { label: 'Total Inquiries', value: String(seller.totalInquiries), icon: ClipboardList },
  ];

  const monthlyViewsMax = useMemo(
    () => Math.max(1, ...analytics.monthlyViewsStats.map((item) => Number(item.total || 0))),
    [analytics.monthlyViewsStats]
  );
  const monthlyClicksMax = useMemo(
    () => Math.max(1, ...analytics.monthlyClicksStats.map((item) => Number(item.total || 0))),
    [analytics.monthlyClicksStats]
  );
  const monthlyListingsMax = useMemo(
    () => Math.max(1, ...analytics.monthlyListingStats.map((item) => Number(item.total || 0))),
    [analytics.monthlyListingStats]
  );

  return (
    <section className="relative min-h-screen w-full overflow-hidden bg-white pt-24">
      <div className="absolute inset-0 section-glow opacity-95" />
      <div className="absolute inset-0 futuristic-grid opacity-20" />
      <div className="absolute -top-20 -right-20 h-[320px] w-[320px] rounded-full bg-brand-secondary/15 blur-3xl" />
      <div className="absolute -bottom-24 -left-24 h-[420px] w-[420px] rounded-full bg-brand-primary/10 blur-3xl" />

      <div className="relative page-container py-10">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-gray2 bg-white/80 p-6 shadow-card">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-primary text-white">
              <Home className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-brand-gray3">Welcome back</p>
              <h1 className="text-2xl font-semibold text-brand-black">{userDisplayName} Analytics</h1>
              <p className="mt-1 inline-flex items-center gap-1 rounded-full border border-brand-gray2 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-primary">
                <ShieldCheck className="h-3.5 w-3.5" />
                {accessLabel}
              </p>
              <p className="mt-2 text-xs text-brand-gray3">
                {loading ? 'Loading analytics...' : analytics.summaryLabel}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="ghost"
              className="border border-brand-gray2 text-brand-gray3 hover:text-brand-primary hover:border-brand-primary"
            >
              <Search className="mr-2 h-4 w-4" />
              New Search
            </Button>
            <Button
              variant="ghost"
              onClick={onOpenMessages}
              className="border border-brand-gray2 text-brand-gray3 hover:text-brand-primary hover:border-brand-primary"
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              Messages
            </Button>
            <Button
              variant="ghost"
              onClick={onOpenFavorites}
              className="border border-brand-gray2 text-brand-gray3 hover:text-brand-primary hover:border-brand-primary"
            >
              <Heart className="mr-2 h-4 w-4" />
              Favorites
            </Button>
            {isOwnerRole && (
              <Button
                variant="ghost"
                onClick={onOpenOwnerPanel}
                className="border border-brand-gray2 text-brand-gray3 hover:text-brand-primary hover:border-brand-primary"
              >
                <Home className="mr-2 h-4 w-4" />
                Owner Panel
              </Button>
            )}
            <Button
              className="bg-brand-primary hover:bg-brand-primary-dark text-white"
            >
              <MapPin className="mr-2 h-4 w-4" />
              Analytics
            </Button>
            <Button
              variant="ghost"
              onClick={onBackHome}
              className="border border-brand-gray2 text-brand-gray3 hover:text-brand-primary hover:border-brand-primary"
            >
              Back to Home
            </Button>
          </div>
        </div>

        {error ? (
          <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-gray3">Key Property Metrics</p>
        </div>

        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {keyMetrics.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-brand-gray2 bg-white/90 p-5 shadow-card-hover neon-card"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-brand-gray3">
                    {stat.label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-brand-black">
                    {stat.value}
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-secondary/15 text-brand-primary">
                  <stat.icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-brand-gray2 bg-white/90 p-4 shadow-card">
            <p className="text-xs uppercase tracking-[0.16em] text-brand-gray3">Click Through Rate</p>
            <p className="mt-2 text-xl font-semibold text-brand-black">{analytics.clickThroughRate.toFixed(1)}%</p>
          </div>
          <div className="rounded-2xl border border-brand-gray2 bg-white/90 p-4 shadow-card">
            <p className="text-xs uppercase tracking-[0.16em] text-brand-gray3">Save Rate</p>
            <p className="mt-2 text-xl font-semibold text-brand-black">{analytics.saveRate.toFixed(1)}%</p>
          </div>
          <div className="rounded-2xl border border-brand-gray2 bg-white/90 p-4 shadow-card">
            <p className="text-xs uppercase tracking-[0.16em] text-brand-gray3">Inquiry Conversion</p>
            <p className="mt-2 text-xl font-semibold text-brand-black">
              {analytics.inquiryConversionRate.toFixed(1)}%
            </p>
          </div>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-brand-gray2 bg-white/90 p-6 shadow-card">
            <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-brand-black">
              <BarChart3 className="h-5 w-5 text-brand-primary" />
              Monthly Views
            </h2>
            <p className="mt-1 text-xs text-brand-gray3">{analytics.viewsGraphLabel}</p>
            <div className="mt-4 space-y-3">
              {analytics.monthlyViewsStats.map((item) => (
                <div key={`views-${item.month}`}>
                  <div className="flex items-center justify-between text-xs text-brand-gray3">
                    <span>{item.month}</span>
                    <span>{item.total}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-brand-gray2">
                    <div
                      className="h-full rounded-full bg-brand-primary"
                      style={{
                        width: `${Math.min(100, Math.round((Number(item.total || 0) / monthlyViewsMax) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-brand-gray2 bg-white/90 p-6 shadow-card">
            <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-brand-black">
              <Activity className="h-5 w-5 text-brand-primary" />
              Monthly Clicks
            </h2>
            <div className="mt-4 space-y-3">
              {analytics.monthlyClicksStats.map((item) => (
                <div key={`clicks-${item.month}`}>
                  <div className="flex items-center justify-between text-xs text-brand-gray3">
                    <span>{item.month}</span>
                    <span>{item.total}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-brand-gray2">
                    <div
                      className="h-full rounded-full bg-brand-secondary"
                      style={{
                        width: `${Math.min(100, Math.round((Number(item.total || 0) / monthlyClicksMax) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-brand-gray2 bg-white/90 p-6 shadow-card">
            <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-brand-black">
              <TrendingUp className="h-5 w-5 text-brand-primary" />
              Monthly Listings
            </h2>
            <div className="mt-4 space-y-3">
              {analytics.monthlyListingStats.map((item) => (
                <div key={`listings-${item.month}`}>
                  <div className="flex items-center justify-between text-xs text-brand-gray3">
                    <span>{item.month}</span>
                    <span>{item.total}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-brand-gray2">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{
                        width: `${Math.min(100, Math.round((Number(item.total || 0) / monthlyListingsMax) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-brand-gray2 bg-white/90 p-6 shadow-card">
            <h2 className="text-lg font-semibold text-brand-black">Seller Details</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-brand-gray2/70 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-brand-gray3">Total Properties Added</p>
                <p className="mt-1 text-xl font-semibold text-brand-black">{seller.totalPropertiesAdded}</p>
              </div>
              <div className="rounded-xl border border-brand-gray2/70 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-brand-gray3">Pending Approval</p>
                <p className="mt-1 text-xl font-semibold text-brand-black">{seller.pendingApproval}</p>
              </div>
              <div className="rounded-xl border border-brand-gray2/70 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-brand-gray3">Approved Listings</p>
                <p className="mt-1 text-xl font-semibold text-brand-black">{seller.approvedListings}</p>
              </div>
              <div className="rounded-xl border border-brand-gray2/70 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-brand-gray3">Sold / Rented</p>
                <p className="mt-1 text-xl font-semibold text-brand-black">{seller.soldProperties}</p>
              </div>
              <div className="rounded-xl border border-brand-gray2/70 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-brand-gray3">Chat Inquiries</p>
                <p className="mt-1 text-xl font-semibold text-brand-black">{seller.totalChatInquiries}</p>
              </div>
              <div className="rounded-xl border border-brand-gray2/70 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-brand-gray3">Visit Requests</p>
                <p className="mt-1 text-xl font-semibold text-brand-black">{seller.totalVisitRequests}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-brand-gray2 bg-white/90 p-6 shadow-card">
            <h2 className="text-lg font-semibold text-brand-black">Buyer Details</h2>
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-brand-gray2/70 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-brand-gray3">Saved Properties</p>
                <p className="mt-1 text-xl font-semibold text-brand-black">{buyer.savedProperties}</p>
              </div>
              <div className="rounded-xl border border-brand-gray2/70 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-brand-gray3">Recently Viewed (30 days)</p>
                <p className="mt-1 text-xl font-semibold text-brand-black">{buyer.recentlyViewed}</p>
              </div>
              <div className="rounded-xl border border-brand-gray2/70 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-brand-gray3">Visit Requests</p>
                <p className="mt-1 text-xl font-semibold text-brand-black">{buyer.propertyVisitRequests}</p>
              </div>
              <div className="rounded-xl border border-brand-gray2/70 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-brand-gray3">Purchase Requests</p>
                <p className="mt-1 text-xl font-semibold text-brand-black">{buyer.purchaseRequestsStatus}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-brand-gray2 bg-white/90 p-6 shadow-card">
            <h2 className="text-lg font-semibold text-brand-black">Actions</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button variant="ghost" onClick={onOpenMessages} className="border border-brand-gray2">
                <MessageCircle className="mr-2 h-4 w-4" />
                Open Messages
              </Button>
              <Button variant="ghost" onClick={onOpenFavorites} className="border border-brand-gray2">
                <Heart className="mr-2 h-4 w-4" />
                Open Favorites
              </Button>
              <Button variant="ghost" onClick={onBackHome} className="border border-brand-gray2">
                Back to Home
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-brand-gray2 bg-white/90 p-6 shadow-card">
            <h2 className="text-lg font-semibold text-brand-black">Summary</h2>
            <div className="mt-4 rounded-xl border border-brand-gray2/70 bg-white p-4">
              <p className="text-sm text-brand-gray3">{analytics.summaryLabel}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
