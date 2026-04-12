import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Crown, Rocket, Shield, TrendingUp, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  calculateDalalCoinPreview,
  getDalalCoinWallet,
  type DalalCoinWalletSummary,
} from '@/lib/dalalCoinApi';
import {
  createOwnerSubscriptionCheckout,
  verifyOwnerSubscriptionCheckout,
} from '@/lib/ownerBillingApi';
import {
  openRazorpayCheckout,
  RazorpayCheckoutCancelledError,
} from '@/lib/razorpayCheckout';
import {
  type OwnerSubscriptionPlan,
  useOwnerSubscriptionAccess,
} from './OwnerSubscriptionAccess';

interface OwnerSubscriptionPageProps {
  onOpenDashboard: () => void;
  onOpenPayments: () => void;
}

const PLAN_COPY: Record<string, string> = {
  free: 'Start with essential publishing access for a smaller portfolio.',
  pro: 'Unlock CRM and analytics tools for a growing sales pipeline.',
  premium: 'Scale faster with higher limits, boosts, and verified eligibility.',
  enterprise: 'For large portfolios that need the highest limits and full access.',
};

const PLAN_OUTCOME_COPY: Record<string, string> = {
  free: 'Good for testing listing flow, but not enough for consistent lead operations.',
  pro: 'Best fit when you need structured follow-up, analytics visibility, and a cleaner sales workflow.',
  premium: 'Designed for owners who want more ranking strength, more capacity, and faster monetization.',
  enterprise: 'Built for portfolio operators who need the strongest access envelope and scale controls.',
};

const PLAN_OUTCOME: Record<string, string> = {
  free: 'Basic publishing without seller growth tooling.',
  pro: 'Best for converting more enquiries with CRM and analytics.',
  premium: 'Best for stronger listing visibility and verification leverage.',
  enterprise: 'Best for large sellers who need maximum reach and control.',
};

function isFeatureEnabled(value: boolean | number | undefined): boolean {
  if (typeof value === 'number') {
    return value > 0;
  }
  return value === true;
}

function formatCurrency(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return 'Free';
  }
  return `INR ${Math.round(value).toLocaleString('en-IN')}`;
}

function getPlanIcon(tier: string) {
  const normalized = tier.trim().toLowerCase();
  if (normalized === 'premium' || normalized === 'enterprise') {
    return <Crown className="h-5 w-5" />;
  }
  if (normalized === 'pro') {
    return <Rocket className="h-5 w-5" />;
  }
  return <Shield className="h-5 w-5" />;
}

function buildPlanHighlights(plan: OwnerSubscriptionPlan): string[] {
  const highlights = [`${plan.listingQuota} active listings`];

  if (isFeatureEnabled(plan.features.boost_listing)) {
    highlights.push(`${plan.boostCredits} boost credits`);
  } else {
    highlights.push('Boosts not included');
  }

  highlights.push(isFeatureEnabled(plan.features.crm_access) ? 'CRM lead management' : 'No CRM lead tools');
  highlights.push(
    isFeatureEnabled(plan.features.analytics_access) ? 'Analytics dashboard access' : 'Analytics locked'
  );

  if (isFeatureEnabled(plan.features.verified_eligibility)) {
    highlights.push('Verified eligibility included');
  }

  return highlights;
}

export default function OwnerSubscriptionPage({
  onOpenDashboard,
  onOpenPayments,
}: OwnerSubscriptionPageProps) {
  const {
    currentSubscription,
    usage,
    plans,
    access,
    loading,
    error,
    refreshAccess,
  } = useOwnerSubscriptionAccess();
  const [subscribingPlanId, setSubscribingPlanId] = useState('');
  const [wallet, setWallet] = useState<DalalCoinWalletSummary | null>(null);
  const [coinsToUseByPlan, setCoinsToUseByPlan] = useState<Record<string, string>>({});

  const currentPlanId = currentSubscription?.planId || '';
  const planCards = useMemo(() => plans || [], [plans]);
  const recommendedPlan = useMemo(() => {
    if (!planCards.length) return null;
    if (access && usage) {
      if (!access.analytics.enabled || !access.crm.enabled) {
        return planCards.find((plan) => plan.tier === 'pro' || plan.tier === 'premium') || planCards[0];
      }
      if (usage.activeListings >= Math.max(1, usage.listingQuota - 1)) {
        return (
          planCards.find((plan) => plan.tier === 'premium' || plan.tier === 'enterprise') ||
          planCards[planCards.length - 1]
        );
      }
    }
    return planCards.find((plan) => plan.tier === 'pro') || planCards[0];
  }, [access, planCards, usage]);
  const comparisonRows = [
    {
      label: 'Active listings',
      renderValue: (plan: OwnerSubscriptionPlan) => String(plan.listingQuota),
    },
    {
      label: 'Boost credits',
      renderValue: (plan: OwnerSubscriptionPlan) =>
        isFeatureEnabled(plan.features.boost_listing) ? String(plan.boostCredits) : 'Not included',
    },
    {
      label: 'CRM lead tools',
      renderValue: (plan: OwnerSubscriptionPlan) =>
        isFeatureEnabled(plan.features.crm_access) ? 'Included' : 'Locked',
    },
    {
      label: 'Analytics access',
      renderValue: (plan: OwnerSubscriptionPlan) =>
        isFeatureEnabled(plan.features.analytics_access) ? 'Included' : 'Locked',
    },
    {
      label: 'Verified eligibility',
      renderValue: (plan: OwnerSubscriptionPlan) =>
        isFeatureEnabled(plan.features.verified_eligibility) ? 'Included' : 'Locked',
    },
  ];
  const recommendedTier = useMemo(() => {
    const tier = (currentSubscription?.subscriptionTier || 'free').trim().toLowerCase();
    if (tier === 'free') return 'pro';
    if (tier === 'pro') return 'premium';
    if (tier === 'premium') return 'enterprise';
    return '';
  }, [currentSubscription?.subscriptionTier]);
  const upgradeOutcomeCards = useMemo(
    () => [
      {
        key: 'quota',
        title: 'Capacity',
        value: usage ? `${usage.activeListings}/${usage.listingQuota}` : 'Loading',
        note: 'More quota lets you keep revenue inventory live without deleting older stock.',
      },
      {
        key: 'crm',
        title: 'Lead Operations',
        value: access?.crm.enabled ? 'Included' : 'Locked',
        note: access?.crm.message || 'CRM access controls structured follow-up and faster closure.',
      },
      {
        key: 'analytics',
        title: 'Revenue Visibility',
        value: access?.analytics.enabled ? 'Included' : 'Locked',
        note:
          access?.analytics.message ||
          'Analytics makes plan upgrades defendable by tying them to lead and revenue performance.',
      },
    ],
    [access, usage]
  );

  useEffect(() => {
    let cancelled = false;

    const loadWallet = async () => {
      try {
        const response = await getDalalCoinWallet(10);
        if (!cancelled) {
          setWallet(response.wallet);
        }
      } catch {
        if (!cancelled) {
          setWallet(null);
        }
      }
    };

    void loadWallet();

    return () => {
      cancelled = true;
    };
  }, []);

  const subscribe = async (plan: OwnerSubscriptionPlan) => {
    if (Number(plan.monthlyPrice || 0) <= 0) {
      toast.info('Free access does not use paid checkout.');
      return;
    }

    const dalalCoinPreview = calculateDalalCoinPreview({
      kind: 'subscription',
      baseAmount: Number(plan.monthlyPrice || 0),
      requestedCoins: wallet?.phoneVerified === false ? 0 : Number(coinsToUseByPlan[plan.planId] || 0),
      spendableCoins: wallet?.spendableCoins || 0,
    });

    if (dalalCoinPreview.coinsApplied > 0 && wallet?.phoneVerified === false) {
      toast.error('Verify your phone in the Dalal Coin wallet before using coins on subscription checkout.');
      return;
    }

    setSubscribingPlanId(plan.planId);
    try {
      const checkoutResponse = await createOwnerSubscriptionCheckout({
        planId: plan.planId,
        billingCycle: 'monthly',
        coinsRequested: dalalCoinPreview.coinsApplied,
      });

      const payment = await openRazorpayCheckout(checkoutResponse.checkout);
      const verification = await verifyOwnerSubscriptionCheckout({
        billingOrderId: checkoutResponse.order.id,
        payment,
      });

      await refreshAccess();
      if (verification.wallet) {
        setWallet(verification.wallet);
      }
      toast.success(verification.message || `${plan.planName} plan activated.`);
      onOpenPayments();
    } catch (subscribeError) {
      if (subscribeError instanceof RazorpayCheckoutCancelledError) {
        toast.info('Checkout was closed before payment completed.');
      } else {
        toast.error(subscribeError instanceof Error ? subscribeError.message : 'Unable to start paid checkout');
      }
    } finally {
      setSubscribingPlanId('');
    }
  };

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Owner Subscription</p>
            <h1 className="mt-3 text-2xl font-semibold text-slate-900 sm:text-3xl">Plans matched to platform access</h1>
            <p className="mt-2 text-sm text-slate-600">
              Listings, CRM, analytics, and boosts now follow the active plan limits.
            </p>
          </div>
          <Button variant="outline" onClick={onOpenDashboard}>
            Back to Dashboard
          </Button>
        </div>

        {currentSubscription && usage && access ? (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-blue-600">Current Plan</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">{currentSubscription.planName}</h2>
                <p className="mt-2 text-sm text-slate-600">
                  {PLAN_COPY[currentSubscription.subscriptionTier] ||
                    'Your current subscription controls owner feature access.'}
                </p>
              </div>
              <div className="rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm text-slate-700">
                <p>
                  Active listings: <span className="font-semibold">{usage.activeListings}</span> /{' '}
                  <span className="font-semibold">{usage.listingQuota}</span>
                </p>
                <p className="mt-1">
                  Remaining slots: <span className="font-semibold">{access.listingQuota.remaining}</span>
                </p>
                <p className="mt-1">
                  Boost credits: <span className="font-semibold">{access.boosts.remainingCredits}</span>
                </p>
                <p className="mt-1">
                  Portfolio split: <span className="font-semibold">{usage.properties}</span> sale,{' '}
                  <span className="font-semibold">{usage.rentals}</span> rental
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.24em] text-blue-700">Upgrade Outcomes</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-900">
              Plans should map to clear business outcomes
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Subscription only works when owners can see what improves in visibility, lead
              handling, and reporting.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {upgradeOutcomeCards.map((item) => (
                <div key={item.key} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">{item.title}</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{item.value}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-600">{item.note}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#0f172a,#102a43)] p-5 text-white shadow-sm">
            <p className="text-xs uppercase tracking-[0.24em] text-blue-100">Recommended Move</p>
            <h3 className="mt-3 text-xl font-semibold">
              {recommendedTier
                ? `Next sensible upgrade: ${recommendedTier.charAt(0).toUpperCase()}${recommendedTier.slice(1)}`
                : 'You are already on the highest visible tier'}
            </h3>
            <p className="mt-2 text-sm text-blue-100/85">
              Upgrade decisions should be tied to more listings, better lead handling, and stronger
              conversion visibility, not just plan names.
            </p>
            <Button
              className="mt-5 w-full bg-white text-slate-900 hover:bg-blue-50"
              onClick={onOpenPayments}
            >
              Review Billing Flow
            </Button>
            {wallet ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/10 p-4 text-sm text-blue-50">
                <p className="text-[11px] uppercase tracking-[0.18em] text-blue-100">Dalal Coin Wallet</p>
                <p className="mt-2 text-2xl font-semibold text-white">{wallet.spendableCoins} DC</p>
                <p className="mt-1 text-xs text-blue-100/80">
                  Subscription checkout uses 1 DC = ₹2, capped at 40% of the selected plan.
                </p>
                {wallet.phoneVerified === false ? (
                  <div className="mt-3 rounded-xl border border-amber-200/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                    Verify your phone in Dalal Coin Wallet before any subscription discount can be applied.
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {currentSubscription && access ? (
          <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.24em] text-blue-700">Upgrade Logic</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900">
                Pay for visibility, lead tools, and operating speed
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Higher plans should not just add limits. They should improve discovery, follow-up,
                and trust on every listing.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700">
                    Discovery
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">Ranking and boosts</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    Promote serious inventory faster with stronger placement and boost credits.
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                    Lead Flow
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">CRM and enquiry tools</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    Route calls, chat, and visit intent into a cleaner owner follow-up workflow.
                  </p>
                </div>
                <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                    Trust
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">Verified eligibility</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    Stronger plans improve how buyers perceive your listing quality and readiness.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#0f172a,#102a43)] p-5 text-white shadow-sm">
              <p className="text-xs uppercase tracking-[0.24em] text-blue-200">Recommended Path</p>
              <h3 className="mt-2 text-lg font-semibold">
                {currentSubscription.planName === 'Free'
                  ? 'Move to Pro for CRM and analytics'
                  : currentSubscription.planName === 'Pro'
                    ? 'Move to Premium for stronger promotion'
                    : 'Use Enterprise for managed scale'}
              </h3>
              <p className="mt-2 text-sm text-white/80">
                Match your plan to the number of live listings, follow-up intensity, and visibility
                pressure on the marketplace.
              </p>
              <Button className="mt-5 w-full bg-white text-slate-900 hover:bg-slate-100" onClick={onOpenPayments}>
                Review Billing Path
              </Button>
            </div>
          </div>
        ) : null}

        {recommendedPlan ? (
          <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-[#0f2340] via-[#173351] to-[#24506d] p-6 text-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-blue-200">Recommended Next Step</p>
                <h2 className="mt-3 text-2xl font-semibold">{recommendedPlan.planName}</h2>
                <p className="mt-2 max-w-2xl text-sm text-blue-100/90">
                  {PLAN_OUTCOME[recommendedPlan.tier] || 'Upgrade when you need stronger seller capability.'}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
                  <div className="inline-flex items-center gap-2 text-sm font-semibold">
                    <Users className="h-4 w-4" />
                    Lead Control
                  </div>
                  <p className="mt-2 text-sm text-blue-50">
                    {isFeatureEnabled(recommendedPlan.features.crm_access)
                      ? 'CRM workflow included for faster seller follow-up.'
                      : 'CRM remains locked until you move up.'}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
                  <div className="inline-flex items-center gap-2 text-sm font-semibold">
                    <TrendingUp className="h-4 w-4" />
                    Visibility Lift
                  </div>
                  <p className="mt-2 text-sm text-blue-50">
                    {isFeatureEnabled(recommendedPlan.features.boost_listing)
                      ? `${recommendedPlan.boostCredits} boost credits included for stronger listing exposure.`
                      : 'No ranking boosts on this tier.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <PlanSummaryCard title="Active Listings" value={usage?.activeListings || 0} hint="Current portfolio load" />
          <PlanSummaryCard title="Remaining Slots" value={access?.listingQuota.remaining || 0} hint="Capacity before next upgrade" />
          <PlanSummaryCard title="Boost Credits" value={access?.boosts.remainingCredits || 0} hint="Priority visibility inventory" />
          <PlanSummaryCard title="Current Tier" valueLabel={currentSubscription?.planName || 'Free'} hint="Plan controlling workspace access" />
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
            Loading subscription plans...
          </div>
        ) : null}

        {!loading && !error ? (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
            {planCards.map((plan) => {
              const isCurrentPlan = currentPlanId === plan.planId;
              const highlights = buildPlanHighlights(plan);
              const dalalCoinPreview = calculateDalalCoinPreview({
                kind: 'subscription',
                baseAmount: Number(plan.monthlyPrice || 0),
                requestedCoins: wallet?.phoneVerified === false ? 0 : Number(coinsToUseByPlan[plan.planId] || 0),
                spendableCoins: wallet?.spendableCoins || 0,
              });
              const maxCoinInput = Math.min(
                dalalCoinPreview.maxCoinsAllowed,
                wallet?.spendableCoins || 0
              );

              return (
                <div
                  key={plan.planId}
                  className={`rounded-2xl border p-5 shadow-sm ${
                    isCurrentPlan ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      {getPlanIcon(plan.tier)}
                      {plan.planName}
                    </div>
                    {!isCurrentPlan && plan.tier === recommendedTier ? (
                      <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-700">
                        Recommended
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {formatCurrency(plan.monthlyPrice)}
                    <span className="text-xs text-slate-500"> / month</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatCurrency(plan.yearlyPrice)} billed yearly
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    {PLAN_COPY[plan.tier] || 'Plan details based on your subscription features.'}
                  </p>
                  <p className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    {PLAN_OUTCOME[plan.tier] || 'Upgrade unlocks more seller capability.'}
                  </p>
                  {plan.tier === 'pro' ? (
                    <span className="mt-3 inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-blue-700">
                      Most Popular
                    </span>
                  ) : null}
                  <ul className="mt-4 space-y-2 text-sm text-slate-600">
                    {highlights.map((feature) => (
                      <li key={feature} className="inline-flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                    <span className="font-semibold text-slate-900">Business outcome:</span>{' '}
                    {PLAN_OUTCOME_COPY[plan.tier] || 'Plan access scales owner operations and revenue workflow.'}
                  </div>
                  {Number(plan.monthlyPrice || 0) > 0 ? (
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                        Dalal Coin Discount
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        1 DC = ₹2 • max 40% • spendable now {wallet?.spendableCoins || 0} DC
                      </p>
                      {wallet?.phoneVerified === false ? (
                        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <p>Phone verification is required before subscription coins can be applied.</p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <Input
                            className="mt-3 bg-white"
                            inputMode="numeric"
                            placeholder={`Use up to ${maxCoinInput} DC`}
                            value={coinsToUseByPlan[plan.planId] || ''}
                            onChange={(event) =>
                              setCoinsToUseByPlan((currentValue) => ({
                                ...currentValue,
                                [plan.planId]: event.target.value.replace(/[^\d]/g, ''),
                              }))
                            }
                          />
                          <div className="mt-3 rounded-xl border border-white/80 bg-white px-3 py-2 text-xs text-slate-600">
                            <p>
                              Coins applied:{' '}
                              <span className="font-semibold text-slate-900">{dalalCoinPreview.coinsApplied} DC</span>
                            </p>
                            <p>
                              Discount:{' '}
                              <span className="font-semibold text-slate-900">{formatCurrency(dalalCoinPreview.discountValue)}</span>
                            </p>
                            <p>
                              Payable now:{' '}
                              <span className="font-semibold text-slate-900">{formatCurrency(dalalCoinPreview.finalAmount)}</span>
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}
                  <Button
                    className="mt-5 w-full bg-blue-700 text-white hover:bg-blue-800"
                    disabled={
                      isCurrentPlan
                      || subscribingPlanId === plan.planId
                      || Number(plan.monthlyPrice || 0) <= 0
                    }
                    onClick={() => subscribe(plan)}
                  >
                    {isCurrentPlan
                      ? 'Current Plan'
                      : Number(plan.monthlyPrice || 0) <= 0
                        ? 'No Checkout Needed'
                      : subscribingPlanId === plan.planId
                        ? 'Opening Checkout...'
                        : `Choose ${plan.planName}`}
                  </Button>
                </div>
              );
            })}
          </div>
        ) : null}

        {!loading && !error ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">For solo owners</h3>
              <p className="mt-2 text-sm text-slate-600">
                Start with essential listing access, then move up once lead volume and portfolio size
                increase.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">For growth portfolios</h3>
              <p className="mt-2 text-sm text-slate-600">
                Use Pro or Premium when response speed, lead routing, and listing priority start
                affecting conversion.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">For managed scale</h3>
              <p className="mt-2 text-sm text-slate-600">
                Enterprise is for teams that need higher capacity, promotion leverage, and deeper
                owner workspace control.
              </p>
            </div>
          </div>
        ) : null}

        {!loading && !error && planCards.length > 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Plan Comparison</h2>
            <p className="mt-1 text-sm text-slate-500">
              Compare the commercial outcome of each tier before you upgrade.
            </p>
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th className="border-b border-slate-200 px-3 py-3 text-left font-semibold text-slate-500">
                      Capability
                    </th>
                    {planCards.map((plan) => (
                      <th
                        key={plan.planId}
                        className="border-b border-slate-200 px-3 py-3 text-left font-semibold text-slate-900"
                      >
                        {plan.planName}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row) => (
                    <tr key={row.label}>
                      <td className="border-b border-slate-100 px-3 py-3 font-medium text-slate-600">
                        {row.label}
                      </td>
                      {planCards.map((plan) => (
                        <td
                          key={`${row.label}-${plan.planId}`}
                          className="border-b border-slate-100 px-3 py-3 text-slate-900"
                        >
                          {row.renderValue(plan)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PlanSummaryCard({
  title,
  value,
  valueLabel,
  hint,
}: {
  title: string;
  value?: number;
  valueLabel?: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">
        {valueLabel || (value || 0).toLocaleString('en-IN')}
      </p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}
