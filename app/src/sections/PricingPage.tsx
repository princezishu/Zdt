import { useState } from 'react';
import {
  CheckCircle2,
  Shield,
  Rocket,
  Crown,
  Gem,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Search,
  Home,
  Building2,
} from 'lucide-react';

type AudienceTab = 'buyers' | 'owners' | 'dealers';

interface PlanFeature {
  text: string;
  included: boolean;
}

interface PricingPlan {
  name: string;
  price: string;
  period: string;
  tagline: string;
  features: PlanFeature[];
  highlight?: boolean;
  ctaLabel: string;
  ctaAction: 'register' | 'contact';
  icon: typeof Shield;
  gradient: string;
}

const BUYER_PLANS: PricingPlan[] = [
  {
    name: 'Free',
    price: '₹0',
    period: 'forever',
    tagline: 'Basic property search and discovery.',
    icon: Shield,
    gradient: 'from-slate-500 to-slate-600',
    ctaLabel: 'Get Started Free',
    ctaAction: 'register',
    features: [
      { text: 'Unlimited property search', included: true },
      { text: 'View property details', included: true },
      { text: 'Save up to 5 favorites', included: true },
      { text: 'Basic area information', included: true },
      { text: 'Saved searches & alerts', included: false },
      { text: 'Compare properties side-by-side', included: false },
      { text: 'Area insights & analytics', included: false },
      { text: 'Investment screener', included: false },
    ],
  },
  {
    name: 'Explorer',
    price: '₹299',
    period: 'per month',
    tagline: 'Smart tools for serious homebuyers.',
    icon: Rocket,
    gradient: 'from-blue-500 to-cyan-500',
    ctaLabel: 'Start Explorer Trial',
    ctaAction: 'register',
    features: [
      { text: 'Unlimited property search', included: true },
      { text: 'View property details', included: true },
      { text: 'Unlimited favorites', included: true },
      { text: 'Saved searches & price alerts', included: true },
      { text: 'Compare up to 5 properties', included: true },
      { text: 'Basic area insights', included: true },
      { text: 'Investment screener', included: false },
      { text: 'Legal assist & doc review', included: false },
    ],
  },
  {
    name: 'Premium',
    price: '₹799',
    period: 'per month',
    tagline: 'Full analytical power for strategic buyers.',
    icon: Crown,
    gradient: 'from-amber-500 to-orange-500',
    highlight: true,
    ctaLabel: 'Upgrade to Premium',
    ctaAction: 'contact',
    features: [
      { text: 'Everything in Explorer', included: true },
      { text: 'Advanced area insights & heatmaps', included: true },
      { text: 'Investment screener with ROI projections', included: true },
      { text: 'Unlimited property comparison', included: true },
      { text: 'Legal assist & document review', included: true },
      { text: 'Priority customer support', included: true },
      { text: 'Builder trust score access', included: true },
      { text: 'Early access to new features', included: true },
    ],
  },
];

const OWNER_PLANS: PricingPlan[] = [
  {
    name: 'Free',
    price: '₹0',
    period: 'forever',
    tagline: 'List a few properties to get started.',
    icon: Shield,
    gradient: 'from-slate-500 to-slate-600',
    ctaLabel: 'Start Free',
    ctaAction: 'register',
    features: [
      { text: 'Up to 3 active listings', included: true },
      { text: 'Basic property page', included: true },
      { text: 'Message from buyers', included: true },
      { text: 'CRM lead management', included: false },
      { text: 'Analytics dashboard', included: false },
      { text: 'Listing boost credits', included: false },
      { text: 'Verified badge eligibility', included: false },
      { text: 'API access', included: false },
    ],
  },
  {
    name: 'Pro',
    price: '₹999',
    period: 'per month',
    tagline: 'Essential tools for growing your portfolio.',
    icon: Rocket,
    gradient: 'from-blue-500 to-indigo-500',
    ctaLabel: 'Choose Pro',
    ctaAction: 'register',
    features: [
      { text: 'Up to 25 active listings', included: true },
      { text: 'CRM lead management', included: true },
      { text: 'Analytics dashboard', included: true },
      { text: '5 listing boost credits / month', included: true },
      { text: 'Priority in search results', included: true },
      { text: 'Verified badge eligibility', included: false },
      { text: 'Unlimited listings', included: false },
      { text: 'API access', included: false },
    ],
  },
  {
    name: 'Premium',
    price: '₹2,499',
    period: 'per month',
    tagline: 'Scale with unlimited listings and boosts.',
    icon: Crown,
    gradient: 'from-amber-500 to-orange-500',
    highlight: true,
    ctaLabel: 'Choose Premium',
    ctaAction: 'contact',
    features: [
      { text: 'Unlimited active listings', included: true },
      { text: 'CRM lead management', included: true },
      { text: 'Advanced analytics', included: true },
      { text: '20 listing boost credits / month', included: true },
      { text: 'Verified owner badge', included: true },
      { text: 'Featured listings priority', included: true },
      { text: 'Priority customer support', included: true },
      { text: 'API access', included: false },
    ],
  },
  {
    name: 'Enterprise',
    price: '₹4,999',
    period: 'per month',
    tagline: 'Maximum power for large portfolios.',
    icon: Gem,
    gradient: 'from-purple-500 to-pink-500',
    ctaLabel: 'Contact Sales',
    ctaAction: 'contact',
    features: [
      { text: 'Everything in Premium', included: true },
      { text: 'Unlimited boost credits', included: true },
      { text: 'API access for integrations', included: true },
      { text: 'Dedicated account manager', included: true },
      { text: 'Custom reporting', included: true },
      { text: 'Bulk listing import', included: true },
      { text: 'White-label options', included: true },
      { text: 'Training & onboarding', included: true },
    ],
  },
];

const DEALER_PLANS: PricingPlan[] = [
  {
    name: 'Free',
    price: '₹0',
    period: 'forever',
    tagline: 'List your company and a few projects.',
    icon: Shield,
    gradient: 'from-slate-500 to-slate-600',
    ctaLabel: 'Get Started',
    ctaAction: 'register',
    features: [
      { text: 'Company profile page', included: true },
      { text: 'Up to 3 projects', included: true },
      { text: 'Basic project details', included: true },
      { text: 'Lead capture tools', included: false },
      { text: 'Featured project boosts', included: false },
      { text: 'Analytics & reporting', included: false },
      { text: 'API / CRM integration', included: false },
      { text: 'Dedicated support', included: false },
    ],
  },
  {
    name: 'Pro',
    price: '₹4,999',
    period: 'per month',
    tagline: 'Full sales toolkit for active developers.',
    icon: Rocket,
    gradient: 'from-blue-600 to-indigo-600',
    highlight: true,
    ctaLabel: 'Choose Pro',
    ctaAction: 'contact',
    features: [
      { text: 'Unlimited projects', included: true },
      { text: 'Lead capture & pipeline tools', included: true },
      { text: 'Featured project boosts', included: true },
      { text: 'Basic analytics', included: true },
      { text: 'Email + notification campaigns', included: true },
      { text: 'Team management (up to 10 seats)', included: true },
      { text: 'API / CRM integration', included: false },
      { text: 'Dedicated support', included: false },
    ],
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: 'contact us',
    tagline: 'For large developers and corporate builders.',
    icon: Gem,
    gradient: 'from-purple-500 to-pink-500',
    ctaLabel: 'Contact Sales',
    ctaAction: 'contact',
    features: [
      { text: 'Everything in Pro', included: true },
      { text: 'API / CRM integration', included: true },
      { text: 'Custom analytics & reporting', included: true },
      { text: 'Dedicated account manager', included: true },
      { text: 'Bulk import / export', included: true },
      { text: 'Priority support & training', included: true },
      { text: 'Co-branded landing pages', included: true },
      { text: 'AI demand heatmaps (beta)', included: true },
    ],
  },
];

const AUDIENCE_TABS: Array<{ id: AudienceTab; label: string; icon: typeof Search }> = [
  { id: 'buyers', label: 'Buyers', icon: Search },
  { id: 'owners', label: 'Property Owners', icon: Home },
  { id: 'dealers', label: 'Dealers / Builders', icon: Building2 },
];


const FAQ_ITEMS = [
  {
    q: 'Can I switch plans later?',
    a: 'Absolutely. You can upgrade or downgrade at any time. Changes take effect from the next billing cycle — no data is lost.',
  },
  {
    q: 'Is there a free trial for paid plans?',
    a: 'Yes — all paid plans come with a 7-day free trial. Cancel before the trial ends and you won\'t be charged.',
  },
  {
    q: 'How does billing work?',
    a: 'Plans are billed monthly. Enterprise plans can be billed annually for a discount. We support UPI, cards, and bank transfer.',
  },
  {
    q: 'What happens if I exceed my listing quota?',
    a: 'You\'ll receive a notification. Existing listings stay live — you simply won\'t be able to add new ones until you upgrade or deactivate some.',
  },
  {
    q: 'Can I request a custom plan?',
    a: 'Of course! Enterprise and custom plans are available. Reach out via the Contact Sales button and we\'ll craft a package for your needs.',
  },
];

function getPlans(tab: AudienceTab): PricingPlan[] {
  if (tab === 'buyers') return BUYER_PLANS;
  if (tab === 'owners') return OWNER_PLANS;
  return DEALER_PLANS;
}

export default function PricingPage() {
  const [activeTab, setActiveTab] = useState<AudienceTab>('buyers');
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(null);
  const plans = getPlans(activeTab);

  const handleCta = (plan: PricingPlan) => {
    if (plan.ctaAction === 'contact') {
      const phoneDigits = String(
        import.meta.env.VITE_WHATSAPP_NUMBER || ''
      ).trim().replace(/\D/g, '');
      if (phoneDigits.length >= 10) {
        window.open(
          `https://wa.me/${phoneDigits}?text=${encodeURIComponent(
            `Hi ZDT Realty, I'm interested in the ${plan.name} plan for ${activeTab}. Please share more details.`
          )}`,
          '_blank',
          'noopener,noreferrer'
        );
        return;
      }
      window.location.hash = '/contact';
    } else {
      window.location.hash = '/register';
    }
  };

  return (
    <section className="min-h-screen pb-20 pt-28 text-slate-900">
      {/* Hero */}
      <div className="page-container text-center">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-500/10 to-indigo-500/10 px-4 py-1.5 text-sm font-medium text-blue-700">
            <Sparkles className="h-4 w-4" />
            Pricing & Plans
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
            Plans That Grow{' '}
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              With You
            </span>
          </h1>
          <p className="mt-4 text-base text-slate-600 sm:text-lg">
            Whether you're buying your first home, managing a rental portfolio, or running a
            construction empire — we've got a plan that fits.
          </p>
        </div>
      </div>

      {/* Audience Tabs */}
      <div className="page-container mt-10">
        <div className="mx-auto flex max-w-lg overflow-hidden rounded-2xl border border-slate-200/60 bg-white/60 shadow-sm backdrop-blur-sm">
          {AUDIENCE_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-1 items-center justify-center gap-2 px-3 py-3 text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-inner'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Plan Cards */}
      <div className="page-container mt-10">
        <div
          className={`mx-auto grid gap-5 ${
            plans.length <= 3
              ? 'max-w-4xl md:grid-cols-3'
              : 'max-w-5xl md:grid-cols-2 xl:grid-cols-4'
          }`}
        >
          {plans.map((plan) => {
            const Icon = plan.icon;
            return (
              <div
                key={plan.name}
                className={`relative overflow-hidden rounded-2xl border shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl ${
                  plan.highlight
                    ? 'border-blue-300 bg-white ring-2 ring-blue-100'
                    : 'border-slate-200/60 bg-white'
                }`}
              >
                {plan.highlight ? (
                  <div className="absolute inset-x-0 top-0 bg-gradient-to-r from-blue-600 to-indigo-600 py-1 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-white">
                    Most Popular
                  </div>
                ) : null}

                <div className={`p-5 ${plan.highlight ? 'pt-8' : 'pt-5'}`}>
                  <div className="flex items-center gap-2">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${plan.gradient} text-white`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
                  </div>
                  <p className="mt-3 text-2xl font-extrabold text-slate-900">
                    {plan.price}
                    <span className="ml-1 text-xs font-normal text-slate-500">/ {plan.period}</span>
                  </p>
                  <p className="mt-1 text-sm text-slate-500">{plan.tagline}</p>

                  <ul className="mt-5 space-y-2.5">
                    {plan.features.map((f) => (
                      <li
                        key={f.text}
                        className={`flex items-start gap-2 text-sm ${
                          f.included ? 'text-slate-700' : 'text-slate-400 line-through'
                        }`}
                      >
                        <CheckCircle2
                          className={`mt-0.5 h-4 w-4 flex-none ${
                            f.included ? 'text-emerald-500' : 'text-slate-300'
                          }`}
                        />
                        {f.text}
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={() => handleCta(plan)}
                    className={`mt-6 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                      plan.highlight
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg hover:shadow-xl'
                        : 'border border-slate-300 bg-white text-slate-900 hover:border-blue-400 hover:bg-blue-50'
                    }`}
                  >
                    {plan.ctaLabel}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* FAQ */}
      <div className="page-container mt-20">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-center text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            Frequently Asked Questions
          </h2>
          <div className="mt-6 space-y-3">
            {FAQ_ITEMS.map((item, idx) => {
              const isOpen = openFaqIdx === idx;
              return (
                <div
                  key={idx}
                  className="overflow-hidden rounded-xl border border-slate-200/60 bg-white/80 shadow-sm backdrop-blur-sm"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaqIdx(isOpen ? null : idx)}
                    className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50"
                  >
                    {item.q}
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4 flex-none text-slate-500" />
                    ) : (
                      <ChevronDown className="h-4 w-4 flex-none text-slate-500" />
                    )}
                  </button>
                  {isOpen ? (
                    <div className="border-t border-slate-100 px-5 py-3 text-sm text-slate-600">
                      {item.a}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="page-container mt-16 text-center">
        <div className="mx-auto max-w-xl rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-10 text-white shadow-xl">
          <h2 className="text-xl font-bold sm:text-2xl">Need a custom plan?</h2>
          <p className="mt-2 text-sm text-blue-100">
            Our team can craft a package tailored to your exact needs — no matter the scale.
          </p>
          <button
            type="button"
            onClick={() => {
              const phoneDigits = String(
                import.meta.env.VITE_WHATSAPP_NUMBER || ''
              ).trim().replace(/\D/g, '');
              if (phoneDigits.length >= 10) {
                window.open(
                  `https://wa.me/${phoneDigits}?text=${encodeURIComponent(
                    'Hi ZDT Realty, I need a custom subscription plan. Please share details.'
                  )}`,
                  '_blank',
                  'noopener,noreferrer'
                );
                return;
              }
              window.location.hash = '/contact';
            }}
            className="mt-5 rounded-xl bg-white px-8 py-3 text-sm font-semibold text-blue-700 shadow-lg transition-all hover:bg-blue-50 hover:shadow-xl"
          >
            Contact Sales
          </button>
        </div>
      </div>
    </section>
  );
}
