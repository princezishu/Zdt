import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  Bolt,
  Home,
  LineChart,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import { apiRequest } from '@/lib/http';
import { Button } from '@/components/ui/button';
import { OwnerLockedFeatureCard } from './OwnerAccessStates';
import {
  isOwnerSubscriptionAccessError,
  useOwnerSubscriptionAccess,
} from './OwnerSubscriptionAccess';

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
  interactionTotals: {
    views: number;
    phoneUnlocks: number;
    callClicks: number;
    visitRequests: number;
    premiumCtas: number;
  };
  visibilityPerformance: {
    liveListings: number;
    boostedListings: number;
    activeSponsoredListings: number;
    averageRankingScore: number;
  };
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

function formatMetric(value: number): string {
  return Math.round(value || 0).toLocaleString('en-IN');
}

export default function OwnerDashboardPage({
  onOpenAddProperty,
  onOpenListings,
  onOpenLeads,
  onOpenAnalytics,
  onOpenSubscriptions,
}: OwnerDashboardPageProps) {
  const {
    access,
    currentSubscription,
    usage,
    loading: accessLoading,
    refreshAccess,
  } = useOwnerSubscriptionAccess();
  const [stats, setStats] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (accessLoading) {
      return;
    }

    if (!access?.analytics.enabled) {
      setStats(null);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    apiRequest<AnalyticsResponse>('/api/owner/analytics')
      .then((response) => {
        if (!active) return;
        setStats(response);
      })
      .catch((loadError) => {
        if (!active) return;
        if (isOwnerSubscriptionAccessError(loadError)) {
          void refreshAccess();
          setStats(null);
          return;
        }
        setStats(null);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [access?.analytics.enabled, accessLoading, refreshAccess]);

  const earningsTotal = useMemo(() => {
    if (!stats) return 0;
    return (stats.earnings?.commission || 0) + (stats.earnings?.bookingRevenue || 0);
  }, [stats]);
  const workspaceScore = useMemo(() => {
    let score = 30;
    if (access?.crm.enabled) score += 20;
    if (access?.analytics.enabled) score += 20;
    if (access?.boosts.enabled) score += 15;
    if (access?.verifiedEligibility.enabled) score += 15;
    return Math.min(score, 100);
  }, [access]);
  const growthQueue = useMemo(
    () => [
      {
        title: access?.crm.enabled ? 'Lead follow-up active' : 'Unlock CRM follow-up',
        detail: access?.crm.enabled
          ? 'Use the leads workspace to convert enquiries faster.'
          : access?.crm.message || 'CRM tools unlock with a higher plan.',
      },
      {
        title: access?.boosts.enabled ? 'Use boost credits' : 'Unlock ranking boosts',
        detail: access?.boosts.enabled
          ? `${access?.boosts.remainingCredits || 0} credits available for priority visibility.`
          : access?.boosts.message || 'Boosts improve top-of-search exposure.',
      },
      {
        title: access?.verifiedEligibility.enabled ? 'Push verified trust' : 'Unlock verified eligibility',
        detail: access?.verifiedEligibility.enabled
          ? 'Verified trust helps improve conversion on listing pages.'
          : access?.verifiedEligibility.message || 'Verification becomes available on higher tiers.',
      },
    ],
    [access]
  );

  const canCreate = Boolean(access?.listingQuota.canCreate);
  const analyticsLocked = Boolean(!accessLoading && access && !access.analytics.enabled);
  const crmLocked = Boolean(!accessLoading && access && !access.crm.enabled);
  const nextBestMove = analyticsLocked
    ? access?.analytics.message || 'Upgrade to unlock analytics, CRM visibility, and seller reporting.'
    : stats?.boostedListings
      ? 'Your boosted inventory is already active. Use analytics to move spend toward the listings converting into leads.'
      : 'Turn your strongest listings into premium inventory with boosts, faster response, and verified lead capture.';
  const cockpitCards = [
    {
      title: 'Current Plan',
      value: currentSubscription?.planName || 'Free',
      hint: analyticsLocked ? 'Plan limits are still holding back reporting.' : 'Commercial access follows the active subscription.',
    },
    {
      title: 'Ranking Score',
      value: analyticsLocked ? '--' : (stats?.visibilityPerformance.averageRankingScore || 0).toFixed(2),
      hint: 'Average organic ranking strength across workflow listings.',
    },
    {
      title: 'Phone Unlocks',
      value: formatMetric(stats?.interactionTotals.phoneUnlocks || 0),
      hint: 'Direct contact intent from workflow listings.',
    },
    {
      title: 'Premium CTAs',
      value: formatMetric(stats?.interactionTotals.premiumCtas || 0),
      hint: 'Brochure, price sheet, and loan-help requests.',
    },
  ];
  const revenuePlaybook = [
    {
      title: 'Visibility Engine',
      metric: `${access?.boosts.remainingCredits ?? 0} boost credits`,
      description:
        'Use boosts and premium placement on the listings already attracting serious buyer attention.',
      ctaLabel: 'Manage Listings',
      onClick: onOpenListings,
      icon: <TrendingUp className="h-5 w-5 text-blue-700" />,
    },
    {
      title: 'Lead Discipline',
      metric: `${stats?.totalLeads ?? 0} tracked leads`,
      description:
        'Push buyer enquiries into a tighter funnel with callback, visit scheduling, and faster follow-up.',
      ctaLabel: crmLocked ? 'Unlock CRM' : 'Open Leads',
      onClick: crmLocked ? onOpenSubscriptions : onOpenLeads,
      icon: <Target className="h-5 w-5 text-emerald-600" />,
    },
    {
      title: 'Trust Monetization',
      metric: access?.verifiedEligibility.enabled ? 'Verified eligible' : 'Verification locked',
      description:
        'Verified inventory and analytics-backed reporting are the core ingredients for a premium seller package.',
      ctaLabel: access?.verifiedEligibility.enabled ? 'Open Plans' : 'Upgrade Plan',
      onClick: onOpenSubscriptions,
      icon: <ShieldCheck className="h-5 w-5 text-amber-600" />,
    },
  ];

  return (
    <section className="portal-mobile-page min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container portal-mobile-stack space-y-6">
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
              <Button
                className="h-10 rounded-full bg-white/15 text-white hover:bg-white/25"
                onClick={onOpenLeads}
                disabled={crmLocked}
              >
                <Users className="mr-2 h-4 w-4" />
                {crmLocked ? 'Leads Locked' : 'Leads'}
              </Button>
              <Button
                className="h-10 rounded-full bg-blue-500 text-white hover:bg-blue-400"
                onClick={onOpenAddProperty}
                disabled={!canCreate}
              >
                {canCreate ? 'Add Property' : 'Quota Full'}
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Workspace Score"
            value={workspaceScore}
            valueLabel={`${workspaceScore}/100`}
            icon={<BarChart3 className="h-5 w-5" />}
          />
          <StatCard
            title="Current Plan"
            value={0}
            valueLabel={currentSubscription?.planName || 'Free'}
            icon={<Bolt className="h-5 w-5" />}
          />
          <StatCard
            title="Remaining Slots"
            value={access?.listingQuota.remaining || 0}
            icon={<Home className="h-5 w-5" />}
          />
          <StatCard
            title="Boost Credits"
            value={access?.boosts.remainingCredits || 0}
            icon={<LineChart className="h-5 w-5" />}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="portal-mobile-panel rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Growth Cockpit</h2>
                <p className="mt-1 text-sm text-slate-500">
                  The commercial view of your workspace: plan access, listing efficiency, and next moves.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={analyticsLocked ? onOpenSubscriptions : onOpenAnalytics}
              >
                {analyticsLocked ? 'Unlock Analytics' : 'Open Analytics'}
              </Button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              {cockpitCards.map((card) => (
                <MetricCard key={card.title} title={card.title} value={card.value} hint={card.hint} />
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-[#0f2340] via-[#163252] to-[#1f4462] p-5 text-white shadow-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-blue-200">Next Best Move</p>
            <p className="mt-3 text-xl font-semibold">
              {analyticsLocked ? 'Upgrade the seller stack' : 'Focus on conversion quality'}
            </p>
            <p className="mt-2 text-sm text-blue-100/90">{nextBestMove}</p>
            <Button
              className="mt-5 w-full bg-white/15 text-white hover:bg-white/25"
              onClick={analyticsLocked ? onOpenSubscriptions : onOpenAnalytics}
            >
              {analyticsLocked ? 'Review Plans' : 'Review Performance'}
            </Button>
          </div>
        </div>

        {analyticsLocked && access && usage ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                title="Active Listings"
                value={usage.activeListings}
                icon={<Home className="h-5 w-5" />}
              />
              <StatCard
                title="Remaining Slots"
                value={access.listingQuota.remaining}
                icon={<Home className="h-5 w-5" />}
              />
              <StatCard
                title="Boost Credits"
                value={access.boosts.remainingCredits}
                icon={<Bolt className="h-5 w-5" />}
              />
              <StatCard
                title="Current Plan"
                value={0}
                valueLabel={currentSubscription?.planName || 'Free'}
                icon={<BarChart3 className="h-5 w-5" />}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <OwnerLockedFeatureCard
                title="Analytics is locked"
                description="Revenue, conversion, and performance charts appear here once analytics access is included."
                message={access.analytics.message}
                onOpenSubscription={onOpenSubscriptions}
                compact
              />
              <OwnerLockedFeatureCard
                title="CRM tools are locked"
                description="Lead pipeline actions stay visible here so your team knows what unlocks next."
                message={access.crm.message}
                onOpenSubscription={onOpenSubscriptions}
                compact
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
              <div className="portal-mobile-panel rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Plan Snapshot</h2>
                <p className="mt-1 text-sm text-slate-500">Subscription status, quota, and owner workspace availability.</p>
                <div className="mt-5 grid gap-4 sm:grid-cols-3">
                  <MetricCard
                    title="Plan"
                    value={currentSubscription?.planName || 'Free'}
                    hint={currentSubscription?.isFallback ? 'Fallback access in use' : 'Active subscription'}
                  />
                  <MetricCard
                    title="Listing Quota"
                    value={`${access.listingQuota.used}/${access.listingQuota.limit}`}
                    hint={access.listingQuota.message}
                  />
                  <MetricCard
                    title="Verified Eligibility"
                    value={access.verifiedEligibility.enabled ? 'Included' : 'Locked'}
                    hint={access.verifiedEligibility.message}
                  />
                </div>
              </div>

              <div className="portal-mobile-panel rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-base font-semibold text-slate-900">Upgrade Workspace</h3>
                <p className="mt-1 text-sm text-slate-500">Open subscription plans to unlock analytics, CRM, and more quota.</p>
                <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                  {access.analytics.message}
                </div>
                <Button className="mt-5 w-full bg-blue-700 text-white hover:bg-blue-800" onClick={onOpenSubscriptions}>
                  Manage Subscription
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                title="Live Workflow Listings"
                value={stats?.visibilityPerformance.liveListings ?? 0}
                icon={<Home className="h-5 w-5" />}
              />
              <StatCard
                title="Phone Unlocks"
                value={stats?.interactionTotals.phoneUnlocks ?? 0}
                icon={<Users className="h-5 w-5" />}
              />
              <StatCard
                title="Call Clicks"
                value={stats?.interactionTotals.callClicks ?? 0}
                icon={<LineChart className="h-5 w-5" />}
              />
              <StatCard
                title="Premium CTAs"
                value={stats?.interactionTotals.premiumCtas ?? 0}
                icon={<Target className="h-5 w-5" />}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
              <div className="portal-mobile-panel rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
                  <MetricCard
                    title="Avg Ranking Score"
                    value={(stats?.visibilityPerformance.averageRankingScore || 0).toFixed(2)}
                  />
                  <MetricCard
                    title="Visit Requests"
                    value={String(stats?.interactionTotals.visitRequests ?? 0)}
                  />
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-4">
                  <MetricCard title="Earnings Summary" value={formatCurrency(earningsTotal)} />
                  <MetricCard title="Boosted Listings" value={String(stats?.visibilityPerformance.boostedListings ?? 0)} />
                  <MetricCard title="Sponsored Live" value={String(stats?.visibilityPerformance.activeSponsoredListings ?? 0)} />
                  <MetricCard title="Workflow Views" value={String(stats?.interactionTotals.views ?? 0)} />
                </div>
              </div>

              <div className="space-y-4">
                <div className="portal-mobile-panel rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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

                <div className="portal-mobile-panel rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Bolt className="h-4 w-4 text-amber-500" />
                    Visibility Engine
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    Organic ranking and sponsored delivery now stay separate, so you can read premium spend more clearly.
                  </p>
                  <div className="mt-4 rounded-xl bg-gradient-to-br from-amber-50 via-orange-50 to-white p-4 text-xs text-amber-700">
                    <div className="flex items-center justify-between">
                      <span>Boosted workflow listings</span>
                      <span className="font-semibold text-slate-900">
                        {stats?.visibilityPerformance.boostedListings ?? 0}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span>Active sponsored cards</span>
                      <span className="font-semibold text-slate-900">
                        {stats?.visibilityPerformance.activeSponsoredListings ?? 0}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span>Average ranking score</span>
                      <span className="font-semibold text-slate-900">
                        {(stats?.visibilityPerformance.averageRankingScore || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {(loading || accessLoading) && (
              <div className="portal-mobile-card rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Loading owner analytics...
              </div>
            )}
          </>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          {growthQueue.map((item) => (
            <div
              key={item.title}
              className="portal-mobile-panel rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Growth Queue</p>
              <h2 className="mt-2 text-lg font-semibold text-slate-900">{item.title}</h2>
              <p className="mt-2 text-sm text-slate-600">{item.detail}</p>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Revenue Growth Playbook</h2>
            <p className="mt-1 text-sm text-slate-500">
              The three levers that move this workspace from basic publishing to a premium seller product.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {revenuePlaybook.map((item) => (
              <PlaybookCard
                key={item.title}
                title={item.title}
                metric={item.metric}
                description={item.description}
                ctaLabel={item.ctaLabel}
                onClick={item.onClick}
                icon={item.icon}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function StatCard({
  title,
  value,
  valueLabel,
  icon,
}: {
  title: string;
  value: number;
  valueLabel?: string;
  icon: ReactNode;
}) {
  return (
    <div className="portal-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{title}</span>
        <span className="text-slate-400">{icon}</span>
      </div>
      <p className="mt-3 text-2xl font-semibold text-slate-900">
        {valueLabel || value.toLocaleString('en-IN')}
      </p>
    </div>
  );
}

function MetricCard({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div className="portal-mobile-card rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
      {hint ? <p className="mt-2 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function PlaybookCard({
  title,
  metric,
  description,
  ctaLabel,
  onClick,
  icon,
}: {
  title: string;
  metric: string;
  description: string;
  ctaLabel: string;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <div className="portal-mobile-card rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
          {icon}
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-xs uppercase tracking-wide text-slate-500">{metric}</p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-600">{description}</p>
      <Button variant="outline" className="mt-5 w-full" onClick={onClick}>
        {ctaLabel}
      </Button>
    </div>
  );
}
