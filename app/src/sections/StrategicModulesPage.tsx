import {
  ArrowRight,
  BarChart3,
  Bell,
  Building2,
  CheckCircle2,
  Compass,
  GitCompareArrows,
  Landmark,
  MapPin,
  MousePointerClick,
  ShieldCheck,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AppView } from '@/lib/views';

type StrategicModuleView =
  | 'area-insights'
  | 'affordability'
  | 'buyer-journey'
  | 'alerts'
  | 'compare-plus'
  | 'builder-trust'
  | 'site-visits'
  | 'legal-assist'
  | 'investment-screener'
  | 'referrals';

interface StrategicModulesPageProps {
  view: StrategicModuleView;
  onNavigate: (view: AppView) => void;
}

interface ModuleMetric {
  label: string;
  value: string;
  helper: string;
}

interface ModulePillar {
  title: string;
  summary: string;
  icon: LucideIcon;
}

interface ModuleAction {
  label: string;
  view: AppView;
  variant?: 'default' | 'outline';
}

interface ModuleConfig {
  title: string;
  subtitle: string;
  eyebrow: string;
  heroClassName: string;
  metrics: ModuleMetric[];
  pillars: ModulePillar[];
  actions: ModuleAction[];
}

const MODULE_NAV_ITEMS: Array<{ view: StrategicModuleView; label: string; icon: LucideIcon }> = [
  { view: 'area-insights', label: 'Area Intelligence', icon: MapPin },
  { view: 'affordability', label: 'Affordability Planner', icon: BarChart3 },
  { view: 'buyer-journey', label: 'Buyer Journey', icon: MousePointerClick },
  { view: 'alerts', label: 'Property Alerts', icon: Bell },
  { view: 'compare-plus', label: 'Compare+', icon: GitCompareArrows },
  { view: 'builder-trust', label: 'Builder Trust', icon: ShieldCheck },
  { view: 'site-visits', label: 'Visit Scheduler', icon: Compass },
  { view: 'legal-assist', label: 'Legal Assist', icon: Landmark },
  { view: 'investment-screener', label: 'Investment Screener', icon: TrendingUp },
  { view: 'referrals', label: 'Referral Rewards', icon: Users },
];

const MODULE_CONFIG: Record<StrategicModuleView, ModuleConfig> = {
  'area-insights': {
    title: 'Area Intelligence',
    subtitle:
      'Understand every locality with trust-ready data on livability, infrastructure, and market movement.',
    eyebrow: 'Location Decision Engine',
    heroClassName: 'from-blue-700 via-blue-600 to-cyan-500',
    metrics: [
      { label: 'Coverage', value: '10,000+ areas', helper: 'Mapped using city and LGD context.' },
      { label: 'Signals', value: '25+ locality factors', helper: 'Safety, schools, commute, and pricing.' },
      { label: 'Refresh Rate', value: 'Daily snapshots', helper: 'Keeps area intelligence current.' },
    ],
    pillars: [
      { title: 'Locality Score', summary: 'Rank neighborhoods by convenience, trust, and long-term value.', icon: MapPin },
      { title: 'Live Infra Signals', summary: 'Track roads, metro links, and civic projects around a locality.', icon: TrendingUp },
      { title: 'Price Micro-Trends', summary: 'See street-level trend movement before making an offer.', icon: BarChart3 },
    ],
    actions: [
      { label: 'Explore Buy Listings', view: 'buy' },
      { label: 'Open Infrastructure Tracker', view: 'infrastructure', variant: 'outline' },
    ],
  },
  affordability: {
    title: 'Affordability Planner',
    subtitle:
      'Plan EMI, down-payment, and cash-flow scenarios before shortlisting properties.',
    eyebrow: 'Smart Finance Guidance',
    heroClassName: 'from-indigo-700 via-blue-600 to-cyan-500',
    metrics: [
      { label: 'Scenarios', value: '50+ plan combinations', helper: 'Budget models from conservative to aggressive.' },
      { label: 'EMI Lens', value: 'Monthly risk band', helper: 'Highlights safer monthly limits.' },
      { label: 'Decision Support', value: 'Rent vs Buy', helper: 'Compares ownership and rental cost curves.' },
    ],
    pillars: [
      { title: 'EMI Simulator', summary: 'Stress-test tenure, rate, and down payment combinations.', icon: BarChart3 },
      { title: 'Eligibility Snapshot', summary: 'Estimate affordable budget range in minutes.', icon: ShieldCheck },
      { title: 'Cash Reserve Safety', summary: 'Protect emergency savings while purchasing.', icon: TrendingUp },
    ],
    actions: [
      { label: 'Start Property Search', view: 'buy' },
      { label: 'Compare Rental Options', view: 'rent', variant: 'outline' },
    ],
  },
  'buyer-journey': {
    title: 'Buyer Journey',
    subtitle:
      'A complete step-by-step flow from discovery to registration, with clear next actions at each stage.',
    eyebrow: 'Process Confidence',
    heroClassName: 'from-violet-700 via-indigo-600 to-blue-500',
    metrics: [
      { label: 'Stages', value: '8 guided steps', helper: 'Search, verify, negotiate, close.' },
      { label: 'Checklist Depth', value: '40+ checkpoints', helper: 'Documents, approvals, and milestones.' },
      { label: 'Tracking', value: 'Status-ready', helper: 'Helps buyers stay on schedule.' },
    ],
    pillars: [
      { title: 'Guided Flow', summary: 'Know exactly what to do next, from first visit to agreement.', icon: MousePointerClick },
      { title: 'Documentation Lane', summary: 'Track required docs and verification completion.', icon: Landmark },
      { title: 'Timeline Planner', summary: 'Avoid delays by mapping tasks and deadlines.', icon: Compass },
    ],
    actions: [
      { label: 'Open Buy Marketplace', view: 'buy' },
      { label: 'See Help Center', view: 'help-center', variant: 'outline' },
    ],
  },
  alerts: {
    title: 'Property Alerts',
    subtitle:
      'Receive instant market triggers for new inventory, price movement, and verification updates.',
    eyebrow: 'Always-On Monitoring',
    heroClassName: 'from-cyan-700 via-blue-600 to-indigo-600',
    metrics: [
      { label: 'Alert Types', value: '10+ signals', helper: 'Price drop, new listing, verification updates.' },
      { label: 'Latency', value: 'Near real-time', helper: 'Fast notifications for active searches.' },
      { label: 'Personalization', value: 'Saved filters', helper: 'Alert exactly by your location and budget.' },
    ],
    pillars: [
      { title: 'Price Drop Alerts', summary: 'Catch negotiation opportunities quickly.', icon: Bell },
      { title: 'Inventory Alerts', summary: 'Get notified when matching properties go live.', icon: TrendingUp },
      { title: 'Trust Alerts', summary: 'Know when builder and listing verification changes.', icon: ShieldCheck },
    ],
    actions: [
      { label: 'Open Notifications', view: 'notifications' },
      { label: 'Manage Saved Searches', view: 'saved-searches', variant: 'outline' },
    ],
  },
  'compare-plus': {
    title: 'Compare+',
    subtitle:
      'Advanced side-by-side analysis for value, trust, access, and long-term growth.',
    eyebrow: 'Decision Accelerator',
    heroClassName: 'from-fuchsia-700 via-indigo-600 to-blue-500',
    metrics: [
      { label: 'Comparison Depth', value: '50+ attributes', helper: 'Price, size, trust, and locality value.' },
      { label: 'Portfolio Lens', value: 'ROI-ready', helper: 'Useful for buyers and investors.' },
      { label: 'Output', value: 'Clear ranking', helper: 'Understand best-fit picks quickly.' },
    ],
    pillars: [
      { title: 'Trust-Weighted Ranking', summary: 'Blend pricing with verification and delivery confidence.', icon: ShieldCheck },
      { title: 'Locality Match', summary: 'Compare commute and amenity access by property.', icon: MapPin },
      { title: 'Outcome Focus', summary: 'Shortlist faster with confidence-backed scoring.', icon: GitCompareArrows },
    ],
    actions: [
      { label: 'Open Compare', view: 'compare' },
      { label: 'Browse Buy Listings', view: 'buy', variant: 'outline' },
    ],
  },
  'builder-trust': {
    title: 'Builder Trust Center',
    subtitle:
      'Transparent builder confidence indicators for delivery, verification, and project quality.',
    eyebrow: 'Builder Intelligence',
    heroClassName: 'from-slate-800 via-indigo-700 to-cyan-500',
    metrics: [
      { label: 'Builder Profiles', value: 'Verified ecosystem', helper: 'Trust-first profile visibility.' },
      { label: 'Confidence Lens', value: 'Delivery-centric', helper: 'Focus on completion reliability.' },
      { label: 'Quality Signals', value: 'Project-level context', helper: 'Consistency and proof indicators.' },
    ],
    pillars: [
      { title: 'Verification First', summary: 'Prioritize verified builders and accountable teams.', icon: ShieldCheck },
      { title: 'Delivery Context', summary: 'Review construction and completion behavior.', icon: Building2 },
      { title: 'Buyer Confidence', summary: 'Reduce risk before commitment.', icon: Users },
    ],
    actions: [
      { label: 'Open Dealers & Builders', view: 'dealers-builders' },
      { label: 'View New Projects', view: 'projects', variant: 'outline' },
    ],
  },
  'site-visits': {
    title: 'Visit Scheduler',
    subtitle:
      'Plan and manage site visits with better coordination, notes, and follow-up actions.',
    eyebrow: 'Field Workflow',
    heroClassName: 'from-emerald-700 via-cyan-600 to-blue-500',
    metrics: [
      { label: 'Scheduling', value: 'Multi-slot ready', helper: 'Coordinate visits across shortlisted properties.' },
      { label: 'Visit Notes', value: 'Structured capture', helper: 'Record what matters during each visit.' },
      { label: 'Follow-up', value: 'Action workflow', helper: 'Convert visits into clear next steps.' },
    ],
    pillars: [
      { title: 'Visit Plan', summary: 'Create a practical route and visit sequence.', icon: Compass },
      { title: 'On-Site Checklist', summary: 'Capture fit, quality, and red flags quickly.', icon: MousePointerClick },
      { title: 'Post-Visit Actions', summary: 'Move to compare, negotiate, or discard with clarity.', icon: ArrowRight },
    ],
    actions: [
      { label: 'Open Messages', view: 'messages' },
      { label: 'Browse Buy Properties', view: 'buy', variant: 'outline' },
    ],
  },
  'legal-assist': {
    title: 'Legal Assist',
    subtitle:
      'A practical legal-readiness lane for paperwork, due diligence, and risk checks.',
    eyebrow: 'Compliance Readiness',
    heroClassName: 'from-slate-900 via-indigo-700 to-fuchsia-600',
    metrics: [
      { label: 'Checklist', value: 'Document-first', helper: 'Title, approvals, and registration readiness.' },
      { label: 'Risk Lens', value: 'Early red flags', helper: 'Surface issues before payment stage.' },
      { label: 'Process Clarity', value: 'Step aligned', helper: 'Know legal dependencies stage by stage.' },
    ],
    pillars: [
      { title: 'Document Checklist', summary: 'Track core legal docs before closing.', icon: Landmark },
      { title: 'Risk Screening', summary: 'Catch common pitfalls early.', icon: ShieldCheck },
      { title: 'Decision Guardrails', summary: 'Avoid rushed commitments with structured checks.', icon: CheckCircle2 },
    ],
    actions: [
      { label: 'Open Buyer Journey', view: 'buyer-journey' },
      { label: 'Contact Support', view: 'contact', variant: 'outline' },
    ],
  },
  'investment-screener': {
    title: 'Investment Screener',
    subtitle:
      'Find high-potential opportunities with yield, trend, and demand-focused filters.',
    eyebrow: 'Investor Toolkit',
    heroClassName: 'from-blue-800 via-indigo-700 to-fuchsia-600',
    metrics: [
      { label: 'Screening Models', value: 'Risk-to-return view', helper: 'Balance upside with downside signals.' },
      { label: 'Focus', value: 'Yield + growth', helper: 'Short-term cash flow and long-term appreciation.' },
      { label: 'Pipeline', value: 'Action-ready', helper: 'Move from screen to shortlist quickly.' },
    ],
    pillars: [
      { title: 'Yield Lens', summary: 'Estimate rental potential by market segment.', icon: TrendingUp },
      { title: 'Growth Map', summary: 'Track future value zones with infra context.', icon: MapPin },
      { title: 'Portfolio Fit', summary: 'Compare opportunities against strategy.', icon: BarChart3 },
    ],
    actions: [
      { label: 'Open Invest', view: 'invest' },
      { label: 'Explore Buy Listings', view: 'buy', variant: 'outline' },
    ],
  },
  referrals: {
    title: 'Referral & Rewards',
    subtitle:
      'A growth loop for sharing verified opportunities and rewarding meaningful referrals.',
    eyebrow: 'Community Growth',
    heroClassName: 'from-purple-700 via-indigo-700 to-blue-500',
    metrics: [
      { label: 'Network Reach', value: 'Invite-ready', helper: 'Share high-trust listings with your network.' },
      { label: 'Tracking', value: 'Transparent status', helper: 'Track referral progress and outcomes.' },
      { label: 'Engagement', value: 'Community first', helper: 'Build repeat participation and trust.' },
    ],
    pillars: [
      { title: 'Referral Pipeline', summary: 'Share listings and monitor conversion stages.', icon: Users },
      { title: 'Reward Visibility', summary: 'Clear status of credited referrals.', icon: TrendingUp },
      { title: 'Quality Loop', summary: 'Encourage verified and high-quality sharing.', icon: ShieldCheck },
    ],
    actions: [
      { label: 'Open Dashboard', view: 'dashboard' },
      { label: 'Browse Listings', view: 'buy', variant: 'outline' },
    ],
  },
};

export default function StrategicModulesPage({ view, onNavigate }: StrategicModulesPageProps) {
  const module = MODULE_CONFIG[view];

  return (
    <section className="pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-6">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className={`bg-gradient-to-r px-6 py-7 text-white ${module.heroClassName}`}>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/80">{module.eyebrow}</p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">{module.title}</h1>
            <p className="mt-3 max-w-2xl text-sm text-white/85">{module.subtitle}</p>
          </div>

          <div className="border-t border-slate-200 bg-slate-50/70 px-4 py-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {MODULE_NAV_ITEMS.map((item) => (
                <button
                  key={item.view}
                  type="button"
                  onClick={() => onNavigate(item.view)}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                    item.view === view
                      ? 'border-blue-300 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700'
                  }`}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {module.metrics.map((metric) => (
            <article key={metric.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{metric.label}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{metric.value}</p>
              <p className="mt-2 text-sm text-slate-600">{metric.helper}</p>
            </article>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {module.pillars.map((pillar) => (
            <article key={pillar.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                <pillar.icon className="h-5 w-5" />
              </span>
              <h2 className="mt-4 text-lg font-semibold text-slate-900">{pillar.title}</h2>
              <p className="mt-2 text-sm text-slate-600">{pillar.summary}</p>
            </article>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Next Actions</h2>
              <p className="text-sm text-slate-600">
                Continue with existing platform features directly from this module.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {module.actions.map((action) => (
                <Button
                  key={action.label}
                  type="button"
                  variant={action.variant || 'default'}
                  onClick={() => onNavigate(action.view)}
                >
                  {action.label}
                  {action.variant ? null : <ArrowRight className="h-4 w-4" />}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
