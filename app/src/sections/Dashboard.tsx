import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bell,
  Calculator,
  ClipboardList,
  Coins,
  Eye,
  Gift,
  GitCompareArrows,
  Heart,
  Home,
  MapPin,
  MessageCircle,
  MousePointerClick,
  Plus,
  Search,
  ShieldCheck,
  TrendingUp,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/http';
import type { AuthUser } from '@/lib/session';

interface DashboardProps {
  onBackHome: () => void;
  onOpenMessages: () => void;
  onOpenFavorites: () => void;
  onOpenOwnerPanel: () => void;
  onOpenPostProperty?: () => void;
  onOpenCompare?: () => void;
  onOpenSavedSearches?: () => void;
  onOpenProfile?: () => void;
  onOpenNotifications?: () => void;
  onOpenWallet?: () => void;
  onOpenReferrals?: () => void;
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

export default function Dashboard({
  onBackHome,
  onOpenMessages,
  onOpenFavorites,
  onOpenOwnerPanel,
  onOpenPostProperty,
  onOpenCompare,
  onOpenSavedSearches,
  onOpenProfile,
  onOpenNotifications,
  onOpenWallet,
  onOpenReferrals,
  user,
}: DashboardProps) {
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

  const userWorkspaceModules = [
    {
      title: 'Saved Properties',
      value: buyer.savedProperties,
      detail: 'Your shortlisted buy and rent properties.',
      icon: Heart,
      cta: 'Open Saved',
      onClick: onOpenFavorites,
    },
    {
      title: 'Inquiries & Messages',
      value: buyer.inquiryHistory + seller.totalChatInquiries,
      detail: 'Conversation history and enquiry follow-ups.',
      icon: MessageCircle,
      cta: 'Open Messages',
      onClick: onOpenMessages,
    },
    {
      title: 'My Listings',
      value: seller.totalPropertiesAdded,
      detail: 'Listings you posted or currently manage.',
      icon: Home,
      cta: isOwnerRole ? 'Open Owner Panel' : 'Back Home',
      onClick: isOwnerRole ? onOpenOwnerPanel : onBackHome,
    },
    {
      title: 'Joined Group Deals',
      value: buyer.purchaseRequestsStatus,
      detail: 'Group purchase requests and status updates.',
      icon: ClipboardList,
      cta: 'Track Requests',
      onClick: onOpenMessages,
    },
    {
      title: 'Profile Settings',
      value: 1,
      detail: 'Keep profile, phone, and KYC details up to date.',
      icon: ShieldCheck,
      cta: 'Go Home',
      onClick: onBackHome,
    },
    {
      title: 'Notifications',
      value: buyer.propertyVisitRequests + seller.totalVisitRequests,
      detail: 'Visit alerts and listing response updates.',
      icon: Activity,
      cta: 'Open Inbox',
      onClick: onOpenMessages,
    },
    ...(onOpenWallet
      ? [
          {
            title: 'Dalal Coin Wallet',
            value: 1,
            detail: 'Track spendable coins, pending unlocks, and expiry buckets.',
            icon: Coins,
            cta: 'Open Wallet',
            onClick: onOpenWallet,
          },
        ]
      : []),
    ...(onOpenReferrals
      ? [
          {
            title: 'Referral Rewards',
            value: 1,
            detail: 'Share your code and monitor phone-verification and first-order unlocks.',
            icon: Gift,
            cta: 'Open Referrals',
            onClick: onOpenReferrals,
          },
        ]
      : []),
  ];

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
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {onOpenPostProperty && (
              <Button
                onClick={onOpenPostProperty}
                className="bg-brand-primary hover:bg-brand-primary-dark text-white"
              >
                <Plus className="mr-2 h-4 w-4" />
                Post Property
              </Button>
            )}
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
            {onOpenCompare && (
              <Button
                variant="ghost"
                onClick={onOpenCompare}
                className="border border-brand-gray2 text-brand-gray3 hover:text-brand-primary hover:border-brand-primary"
              >
                <GitCompareArrows className="mr-2 h-4 w-4" />
                Compare
              </Button>
            )}
            {onOpenSavedSearches && (
              <Button
                variant="ghost"
                onClick={onOpenSavedSearches}
                className="border border-brand-gray2 text-brand-gray3 hover:text-brand-primary hover:border-brand-primary"
              >
                <Search className="mr-2 h-4 w-4" />
                Saved Searches
              </Button>
            )}
            {onOpenNotifications && (
              <Button
                variant="ghost"
                onClick={onOpenNotifications}
                className="border border-brand-gray2 text-brand-gray3 hover:text-brand-primary hover:border-brand-primary"
              >
                <Bell className="mr-2 h-4 w-4" />
                Notifications
              </Button>
            )}
            {onOpenProfile && (
              <Button
                variant="ghost"
                onClick={onOpenProfile}
                className="border border-brand-gray2 text-brand-gray3 hover:text-brand-primary hover:border-brand-primary"
              >
                <User className="mr-2 h-4 w-4" />
                Profile
              </Button>
            )}
            {onOpenWallet && (
              <Button
                variant="ghost"
                onClick={onOpenWallet}
                className="border border-brand-gray2 text-brand-gray3 hover:text-brand-primary hover:border-brand-primary"
              >
                <Coins className="mr-2 h-4 w-4" />
                Wallet
              </Button>
            )}
            {onOpenReferrals && (
              <Button
                variant="ghost"
                onClick={onOpenReferrals}
                className="border border-brand-gray2 text-brand-gray3 hover:text-brand-primary hover:border-brand-primary"
              >
                <Gift className="mr-2 h-4 w-4" />
                Referrals
              </Button>
            )}
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

        <div className="mt-6 rounded-2xl border border-brand-gray2 bg-white/90 p-6 shadow-card">
          <h2 className="text-lg font-semibold text-brand-black">User Workspace</h2>
          <p className="mt-1 text-sm text-brand-gray3">
            Core modules for saved properties, messages, listings, group deals, settings, and notifications.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {userWorkspaceModules.map((module) => (
              <article key={module.title} className="rounded-xl border border-brand-gray2/70 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-brand-gray3">{module.title}</p>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                    <module.icon className="h-4 w-4" />
                  </div>
                </div>
                <p className="mt-2 text-2xl font-semibold text-brand-black">{module.value}</p>
                <p className="mt-1 text-xs text-brand-gray3">{module.detail}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={module.onClick}>
                  {module.cta}
                </Button>
              </article>
            ))}
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

        {/* EMI Calculator */}
        <EMICalculator />
      </div>
    </section>
  );
}

function EMICalculator() {
  const [loanAmount, setLoanAmount] = useState(5000000);
  const [interestRate, setInterestRate] = useState(8.5);
  const [tenure, setTenure] = useState(20);

  const emi = useMemo(() => {
    const monthlyRate = interestRate / 12 / 100;
    const months = tenure * 12;
    if (monthlyRate === 0) return loanAmount / months;
    const factor = Math.pow(1 + monthlyRate, months);
    return (loanAmount * monthlyRate * factor) / (factor - 1);
  }, [loanAmount, interestRate, tenure]);

  const totalPayment = emi * tenure * 12;
  const totalInterest = totalPayment - loanAmount;

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);

  return (
    <div className="mt-6 rounded-2xl border border-brand-gray2 bg-white/90 p-6 shadow-card">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
          <Calculator className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-brand-black">EMI Calculator</h2>
          <p className="text-xs text-brand-gray3">Estimate your monthly mortgage payment</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-brand-black">Loan Amount</label>
              <span className="text-sm font-semibold text-brand-primary">{formatCurrency(loanAmount)}</span>
            </div>
            <input
              type="range"
              min={500000}
              max={50000000}
              step={100000}
              value={loanAmount}
              onChange={(e) => setLoanAmount(Number(e.target.value))}
              className="w-full h-2 rounded-full bg-brand-gray2 appearance-none cursor-pointer accent-brand-primary"
            />
            <div className="flex justify-between text-[11px] text-brand-gray3 mt-1">
              <span>₹5L</span>
              <span>₹5Cr</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-brand-black">Interest Rate</label>
              <span className="text-sm font-semibold text-brand-primary">{interestRate}%</span>
            </div>
            <input
              type="range"
              min={5}
              max={20}
              step={0.1}
              value={interestRate}
              onChange={(e) => setInterestRate(Number(e.target.value))}
              className="w-full h-2 rounded-full bg-brand-gray2 appearance-none cursor-pointer accent-brand-primary"
            />
            <div className="flex justify-between text-[11px] text-brand-gray3 mt-1">
              <span>5%</span>
              <span>20%</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-brand-black">Loan Tenure</label>
              <span className="text-sm font-semibold text-brand-primary">{tenure} years</span>
            </div>
            <input
              type="range"
              min={1}
              max={30}
              step={1}
              value={tenure}
              onChange={(e) => setTenure(Number(e.target.value))}
              className="w-full h-2 rounded-full bg-brand-gray2 appearance-none cursor-pointer accent-brand-primary"
            />
            <div className="flex justify-between text-[11px] text-brand-gray3 mt-1">
              <span>1 yr</span>
              <span>30 yrs</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-center">
          <div className="rounded-2xl border border-brand-primary/15 bg-gradient-to-br from-brand-primary/5 to-transparent p-6 text-center">
            <p className="text-xs uppercase tracking-[0.14em] text-brand-gray3 mb-2">Monthly EMI</p>
            <p className="text-3xl font-bold text-brand-primary stat-counter">{formatCurrency(Math.round(emi))}</p>
            <div className="futuristic-divider my-4" />
            <div className="grid grid-cols-2 gap-4 text-left">
              <div>
                <p className="text-[11px] text-brand-gray3 uppercase tracking-wider">Total Payment</p>
                <p className="text-sm font-semibold text-brand-black mt-1">{formatCurrency(Math.round(totalPayment))}</p>
              </div>
              <div>
                <p className="text-[11px] text-brand-gray3 uppercase tracking-wider">Total Interest</p>
                <p className="text-sm font-semibold text-brand-black mt-1">{formatCurrency(Math.round(totalInterest))}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
