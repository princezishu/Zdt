import { useMemo, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Compass,
  Gavel,
  GitCompareArrows,
  Home,
  Landmark,
  LayoutDashboard,
  MapPin,
  Newspaper,
  PackageCheck,
  Paintbrush,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Truck,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

import Button from '@/components/marketing/Button';
import PropertyCard from '@/components/marketing/PropertyCard';
import {
  portalHeroSlides,
  portalProperties,
  portalTrendLocalities,
  type PortalCategory,
} from '@/lib/portalData';
import type { AiServiceKey } from '@/lib/aiServicesApi';
import type { UserRole } from '@/lib/session';

interface PortalHomePageProps {
  isAuthenticated: boolean;
  onOpenLogin: () => void;
  onOpenRegister: () => void;
  onOpenBuy: (filters?: {
    state?: string;
    district?: string;
    city?: string;
    locality?: string;
  }) => void;
  onOpenRent: () => void;
  onOpenNewLaunch: () => void;
  onOpenCommercial: () => void;
  onOpenBuildingMaterials: () => void;
  onOpenPlotsLand: () => void;
  onOpenProjects: () => void;
  onOpenInvest: () => void;
  onOpenAreaInsights: () => void;
  onOpenInfrastructure?: () => void;
  onOpenPostProperty: () => void;
  onOpenConstructWithUs: () => void;
  onOpenEarlySupporters?: () => void;
  onOpenEAuction: () => void;
  onOpenAiServices: (serviceKey?: AiServiceKey) => void;
  onOpenDeveloper: () => void;
  onOpenBuilderTrust: () => void;
  onOpenCompare: () => void;
  onOpenInsightsNews: () => void;
  onOpenInsightsMarket: () => void;
  onOpenInsightsProjects: () => void;
  onOpenInsightsCompare: () => void;
  onOpenNotifications: () => void;
  onOpenSavedSearches: () => void;
  onOpenPropertyDetails: (referenceId?: string) => void;
  onOpenMessages: (referenceId?: string) => void;
  onOpenDashboard: () => void;
  onOpenOwnerListings: () => void;
  onOpenOwnerAnalytics: () => void;
  onOpenOwnerLeads: () => void;
  onOpenFavorites: () => void;
  onOpenDealerCompany: (companyId: number) => void;
  onOpenAdminDesk: () => void;
  onOpenTeamDesk: () => void;
  onOpenLayoutUnits: () => void;
  userName?: string;
  userRole?: UserRole;
}

function roleLabel(role?: UserRole) {
  if (role === 'admin') return 'dealer';
  if (role === 'team_member') return 'team member';
  return 'member';
}

function categoryLabel(value: PortalCategory) {
  if (value === 'new-launch') return 'New Launch';
  if (value === 'plots-land') return 'Plots / Land';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

type FeatureGroupKey = 'live' | 'services' | 'ai' | 'workspace';

interface PlatformFeatureCard {
  key: string;
  title: string;
  description: string;
  group: FeatureGroupKey;
  icon: LucideIcon;
  accent: string;
  status?: string;
  action: (props: PortalHomePageProps) => void;
  quickActions?: Array<{
    label: string;
    action: (props: PortalHomePageProps) => void;
  }>;
}

const platformFeatureGroups: Array<{
  key: FeatureGroupKey;
  title: string;
  subtitle: string;
}> = [
  {
    key: 'live',
    title: 'Live Intelligence',
    subtitle: 'Auctions, news, tenders, and market views restored to the homepage.',
  },
  {
    key: 'services',
    title: 'Build Services',
    subtitle: 'Construction, circular materials, and project support entry points.',
  },
  {
    key: 'ai',
    title: 'AI Design Tools',
    subtitle: 'Home plans, interiors, plot analysis, and construction planning.',
  },
  {
    key: 'workspace',
    title: 'Workspaces',
    subtitle: 'Owner, builder, comparison, and apartment operating tools.',
  },
];

const platformFeatureCards: PlatformFeatureCard[] = [
  {
    key: 'e-auction',
    title: 'Government & Bank Auctions',
    description: 'Bank, government, and public authority auction discovery with official-source checks.',
    group: 'live',
    icon: Gavel,
    accent: 'border-amber-200 bg-amber-50 text-amber-800',
    status: 'Live',
    action: (props) => props.onOpenEAuction(),
  },
  {
    key: 'news',
    title: 'News & Price Updates',
    description: 'Real estate news, market pulse, upcoming projects, and price movement in one place.',
    group: 'live',
    icon: Newspaper,
    accent: 'border-blue-200 bg-blue-50 text-blue-800',
    status: 'Live',
    action: (props) => props.onOpenInsightsNews(),
    quickActions: [
      { label: 'News', action: (props) => props.onOpenInsightsNews() },
      { label: 'Market', action: (props) => props.onOpenInsightsMarket() },
      { label: 'Projects', action: (props) => props.onOpenInsightsProjects() },
      { label: 'Compare', action: (props) => props.onOpenInsightsCompare() },
    ],
  },
  {
    key: 'infra-tenders',
    title: 'Infrastructure & Tenders',
    description: 'Government tender intelligence, public notices, and infrastructure signals.',
    group: 'live',
    icon: Landmark,
    accent: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    status: 'Live',
    action: (props) => (props.onOpenInfrastructure ? props.onOpenInfrastructure() : props.onOpenProjects()),
  },
  {
    key: 'area-intelligence',
    title: 'Area Intelligence',
    description: 'Locality momentum, liveability notes, demand, and growth-corridor context.',
    group: 'live',
    icon: MapPin,
    accent: 'border-cyan-200 bg-cyan-50 text-cyan-800',
    action: (props) => props.onOpenAreaInsights(),
  },
  {
    key: 'invest',
    title: 'Investment Screener',
    description: 'Project-side growth signals and investment-friendly property discovery.',
    group: 'live',
    icon: TrendingUp,
    accent: 'border-teal-200 bg-teal-50 text-teal-800',
    action: (props) => props.onOpenInvest(),
  },
  {
    key: 'construct-with-us',
    title: 'Construct With Us',
    description: 'Connect with trusted construction teams, packages, and project support.',
    group: 'services',
    icon: Wrench,
    accent: 'border-slate-200 bg-slate-100 text-slate-900',
    action: (props) => props.onOpenConstructWithUs(),
  },
  {
    key: 'circular-build',
    title: 'Circular Build Pickup',
    description: 'Submit reusable demolition material for verification, pickup, and reuse.',
    group: 'services',
    icon: Truck,
    accent: 'border-orange-200 bg-orange-50 text-orange-800',
    action: (props) => props.onOpenBuildingMaterials(),
  },
  {
    key: 'materials-marketplace',
    title: 'Materials Marketplace',
    description: 'Browse cement, steel, bricks, tiles, paint, plumbing, and electrical categories.',
    group: 'services',
    icon: PackageCheck,
    accent: 'border-lime-200 bg-lime-50 text-lime-800',
    action: (props) => props.onOpenBuildingMaterials(),
  },
  {
    key: 'ai-plot-polygon',
    title: 'AI Plot Polygon',
    description: 'Analyze plot area, boundary points, setbacks, and map-ready exports.',
    group: 'ai',
    icon: MapPin,
    accent: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    status: 'AI',
    action: (props) => props.onOpenAiServices('plot-polygon'),
  },
  {
    key: 'home-design-ai',
    title: 'Home Design AI',
    description: 'Generate visual house-plan concepts from plot, budget, floors, and style.',
    group: 'ai',
    icon: Home,
    accent: 'border-blue-200 bg-blue-50 text-blue-800',
    status: 'Visual',
    action: (props) => props.onOpenAiServices('home-design'),
  },
  {
    key: 'interior-design-ai',
    title: 'Interior Design AI',
    description: 'Create room designs with furniture, fixtures, color palettes, lighting, and ZDT building-material picks.',
    group: 'ai',
    icon: Paintbrush,
    accent: 'border-rose-200 bg-rose-50 text-rose-800',
    status: 'Visual',
    action: (props) => props.onOpenAiServices('interior-design'),
  },
  {
    key: 'construction-planning-ai',
    title: 'AI Construction Planning',
    description: 'Plan cost bands, timelines, resource needs, and execution checkpoints.',
    group: 'ai',
    icon: Sparkles,
    accent: 'border-violet-200 bg-violet-50 text-violet-800',
    action: (props) => props.onOpenAiServices('construction-planning'),
  },
  {
    key: 'compare',
    title: 'Compare Properties',
    description: 'Shortlist and compare price, area, amenities, readiness, and trust signals.',
    group: 'workspace',
    icon: GitCompareArrows,
    accent: 'border-indigo-200 bg-indigo-50 text-indigo-800',
    action: (props) => props.onOpenCompare(),
  },
  {
    key: 'builder-trust',
    title: 'Builder Trust',
    description: 'Review verified builder profile context and trust-led project signals.',
    group: 'workspace',
    icon: ShieldCheck,
    accent: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    action: (props) => props.onOpenBuilderTrust(),
  },
  {
    key: 'layout-units',
    title: 'Layout Units',
    description: 'Apartment, complex, floor, and unit planning workspace for admin operations.',
    group: 'workspace',
    icon: LayoutDashboard,
    accent: 'border-slate-200 bg-slate-100 text-slate-900',
    action: (props) => props.onOpenLayoutUnits(),
  },
  {
    key: 'owner-workspace',
    title: 'Owner Dashboard',
    description: 'Listings, leads, analytics, messages, and saved buyer intent surfaces.',
    group: 'workspace',
    icon: Users,
    accent: 'border-orange-200 bg-orange-50 text-orange-800',
    action: (props) => props.onOpenOwnerAnalytics(),
  },
];

export default function PortalHomePage(props: PortalHomePageProps) {
  const [query, setQuery] = useState('');
  const hero = portalHeroSlides[0];

  const featuredProperties = useMemo(
    () =>
      portalProperties
        .filter((property) => property.featured || property.verified)
        .slice(0, 8),
    []
  );

  const stats = useMemo(
    () => [
      {
        label: 'Verified listings',
        value: `${portalProperties.filter((property) => property.verified).length}+`,
        detail: 'Buyer-ready inventory',
      },
      {
        label: 'Micro-markets',
        value: `${portalTrendLocalities.length}`,
        detail: 'Tracked for demand',
      },
      {
        label: 'Property types',
        value: `${new Set(portalProperties.map((property) => property.category)).size}`,
        detail: 'Homes, plots, rentals',
      },
      {
        label: 'Ready options',
        value: `${portalProperties.filter((property) => property.readyToMove).length}`,
        detail: 'Move-in friendly picks',
      },
    ],
    []
  );

  const categoryCards = useMemo(
    () => [
      {
        title: 'Buy Property',
        description: 'Apartments, villas, plots, and investment-ready homes.',
        icon: Home,
        action: () => props.onOpenBuy(),
        accent: 'bg-blue-50 text-blue-700',
      },
      {
        title: 'Rent Homes',
        description: 'Ready-to-move rentals for families and professionals.',
        icon: Building2,
        action: props.onOpenRent,
        accent: 'bg-teal-50 text-teal-700',
      },
      {
        title: 'New Launches',
        description: 'Premium builder launches and township inventory.',
        icon: Compass,
        action: props.onOpenNewLaunch,
        accent: 'bg-amber-50 text-amber-700',
      },
      {
        title: 'Commercial',
        description: 'Retail, office, and high-street investment spaces.',
        icon: Landmark,
        action: props.onOpenCommercial,
        accent: 'bg-slate-100 text-slate-800',
      },
      {
        title: 'Plots & Land',
        description: 'Approved layouts and growth-corridor opportunities.',
        icon: MapPin,
        action: props.onOpenPlotsLand,
        accent: 'bg-emerald-50 text-emerald-700',
      },
      {
        title: 'Materials',
        description: 'Circular build pickup and construction supply support.',
        icon: PackageCheck,
        action: props.onOpenBuildingMaterials,
        accent: 'bg-orange-50 text-orange-700',
      },
    ],
    [props]
  );

  const solutionCards = useMemo(
    () => [
      {
        title: 'Trust-led discovery',
        description: 'Clear badges, verified inventory, and contact paths built around serious intent.',
        icon: ShieldCheck,
      },
      {
        title: 'Market intelligence',
        description: 'Locality momentum, infrastructure signals, and buyer demand in one clean view.',
        icon: BarChart3,
      },
      {
        title: 'Seller operating tools',
        description: 'Listing visibility, lead routing, analytics, and owner workflows for growth.',
        icon: Users,
      },
    ],
    []
  );

  const actionCards = useMemo(
    () => [
      {
        title: 'Invest smarter',
        detail: 'Screen projects and growth corridors before shortlisting.',
        icon: TrendingUp,
        action: props.onOpenInvest,
      },
      {
        title: 'Compare quickly',
        detail: 'Review price, area, amenities, and readiness side by side.',
        icon: CheckCircle2,
        action: props.onOpenCompare,
      },
      {
        title: 'Construct with us',
        detail: 'Plan builds with trusted construction and material support.',
        icon: Wrench,
        action: props.onOpenConstructWithUs,
      },
      {
        title: 'Auction opportunities',
        detail: 'Explore government and bank auction inventory.',
        icon: CircleDollarSign,
        action: props.onOpenEAuction,
      },
    ],
    [props]
  );

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      props.onOpenBuy();
      return;
    }

    const [locality, city] = normalizedQuery
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);

    props.onOpenBuy({
      locality: city ? locality : undefined,
      city: city || normalizedQuery,
    });
  };

  const userGreeting = props.isAuthenticated
    ? `Welcome back${props.userName ? `, ${props.userName}` : ''}`
    : 'India-first verified real estate';

  return (
    <main className="min-h-screen bg-[#F8FAFC] pt-20 text-slate-950">
      <section className="border-b border-slate-200/80 bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FAFC_100%)]">
        <div className="page-container grid gap-10 py-8 sm:py-12 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:py-16">
          <div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold uppercase text-blue-700">
              <BadgeCheck className="h-4 w-4" aria-hidden="true" />
              {userGreeting}
            </div>

            <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight text-slate-950 sm:text-5xl lg:text-6xl">
              ZDT Properties
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
              A premium real estate platform for verified homes, rentals, plots, projects, and
              seller growth tools, designed to keep property decisions clear and confident.
            </p>

            <form
              onSubmit={handleSearchSubmit}
              className="mt-7 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_18px_44px_-34px_rgba(15,23,42,0.45)] sm:p-4"
            >
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
                <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-500/15">
                  <Search className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
                  <span className="sr-only">Search by city or locality</span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search city, locality, or project"
                    className="h-11 min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400"
                  />
                </label>
                <Button type="submit" variant="secondary" rightIcon={<ArrowRight className="h-4 w-4" />}>
                  Search
                </Button>
                <Button type="button" variant="outline" onClick={props.onOpenRent}>
                  Rent
                </Button>
              </div>
            </form>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_14px_30px_-26px_rgba(15,23,42,0.35)]"
                >
                  <p className="text-2xl font-semibold text-slate-950">{item.value}</p>
                  <p className="mt-1 text-xs font-semibold uppercase text-slate-500">{item.label}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_24px_54px_-34px_rgba(15,23,42,0.45)]">
              <div className="relative aspect-[4/3]">
                <img src={hero.image} alt={hero.projectName} width={800} height={600} fetchPriority="high" decoding="async" className="h-full w-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/86 via-slate-950/45 to-transparent p-5 text-white sm:p-6">
                  <p className="text-sm font-semibold text-amber-200">{hero.projectName}</p>
                  <h2 className="mt-2 max-w-lg text-2xl font-semibold leading-tight">{hero.headline}</h2>
                  <p className="mt-2 text-sm text-white/78">{hero.details}</p>
                  <Button
                    variant="secondary"
                    className="mt-4"
                    onClick={() => props.onOpenPropertyDetails(featuredProperties[0]?.referenceId)}
                    rightIcon={<ArrowRight className="h-4 w-4" />}
                  >
                    {hero.ctaLabel}
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {['Verified first', 'No clutter', `${roleLabel(props.userRole)} ready`].map((label) => (
                <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <CheckCircle2 className="h-5 w-5 text-teal-600" aria-hidden="true" />
                  <p className="mt-2 text-sm font-semibold text-slate-900">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="page-container py-10 sm:py-14">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-blue-700">Explore</p>
            <h2 className="mt-2 text-3xl font-semibold text-slate-950">Start with what you need</h2>
            <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">
              Clean entry points for the most common property journeys, with predictable navigation
              across mobile, tablet, and desktop.
            </p>
          </div>
          <Button variant="outline" onClick={props.onOpenAreaInsights} rightIcon={<ArrowRight className="h-4 w-4" />}>
            Area Insights
          </Button>
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categoryCards.map((card) => (
            <button
              key={card.title}
              type="button"
              onClick={card.action}
              className="group rounded-xl border border-slate-200 bg-white p-5 text-left shadow-[0_18px_40px_-34px_rgba(15,23,42,0.38)] transition duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_24px_50px_-34px_rgba(15,23,42,0.42)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/35 focus-visible:ring-offset-2"
            >
              <span className={`inline-flex h-11 w-11 items-center justify-center rounded-lg ${card.accent}`}>
                <card.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-slate-950">{card.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{card.description}</p>
              <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-950">
                Explore
                <ArrowRight className="h-4 w-4 transition duration-300 group-hover:translate-x-1" aria-hidden="true" />
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white py-10 sm:py-14">
        <div className="page-container">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase text-blue-700">Feature Hub</p>
              <h2 className="mt-2 text-3xl font-semibold text-slate-950">Auctions, news, AI, and work tools</h2>
              <p className="mt-2 max-w-3xl text-base leading-7 text-slate-600">
                The full platform surface is back on the homepage, including e-auctions,
                news, infrastructure intelligence, design tools, and owner workspaces.
              </p>
            </div>
            <Button variant="secondary" onClick={props.onOpenInsightsNews} rightIcon={<ArrowRight className="h-4 w-4" />}>
              Open News
            </Button>
          </div>

          <div className="mt-8 space-y-8">
            {platformFeatureGroups.map((group) => {
              const items = platformFeatureCards.filter((feature) => feature.group === group.key);

              return (
                <div key={group.key}>
                  <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h3 className="text-xl font-semibold text-slate-950">{group.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{group.subtitle}</p>
                    </div>
                    <span className="text-sm font-semibold text-slate-500">{items.length} modules</span>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {items.map((feature) => {
                      const Icon = feature.icon;

                      return (
                        <article
                          key={feature.key}
                          className="group flex min-h-[230px] flex-col rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.36)] transition duration-300 hover:-translate-y-1 hover:border-slate-300 hover:bg-white hover:shadow-[0_24px_52px_-36px_rgba(15,23,42,0.42)]"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border ${feature.accent}`}>
                              <Icon className="h-5 w-5" aria-hidden="true" />
                            </span>
                            {feature.status ? (
                              <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                                {feature.status}
                              </span>
                            ) : null}
                          </div>

                          <h4 className="mt-4 text-lg font-semibold leading-6 text-slate-950">{feature.title}</h4>
                          <p className="mt-2 text-sm leading-6 text-slate-600">{feature.description}</p>

                          {feature.quickActions ? (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {feature.quickActions.map((quickAction) => (
                                <button
                                  key={quickAction.label}
                                  type="button"
                                  onClick={() => quickAction.action(props)}
                                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
                                >
                                  {quickAction.label}
                                </button>
                              ))}
                            </div>
                          ) : null}

                          <button
                            type="button"
                            onClick={() => feature.action(props)}
                            className="mt-auto inline-flex items-center gap-2 pt-5 text-sm font-semibold text-slate-950 transition group-hover:text-blue-700"
                          >
                            Open
                            <ArrowRight className="h-4 w-4 transition duration-300 group-hover:translate-x-1" aria-hidden="true" />
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white py-10 sm:py-14">
        <div className="page-container">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase text-blue-700">Featured Properties</p>
              <h2 className="mt-2 text-3xl font-semibold text-slate-950">Verified picks across top needs</h2>
              <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">
                Responsive cards scale from one column on mobile to a dense property grid on larger screens.
              </p>
            </div>
            <Button variant="secondary" onClick={() => props.onOpenBuy()} rightIcon={<ArrowRight className="h-4 w-4" />}>
              View All Listings
            </Button>
          </div>

          <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {featuredProperties.map((property) => (
              <PropertyCard
                key={property.id}
                property={property}
                onViewDetails={props.onOpenPropertyDetails}
                onMessage={props.onOpenMessages}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="page-container py-10 sm:py-14">
        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="rounded-xl bg-slate-950 p-6 text-white shadow-[0_24px_58px_-34px_rgba(15,23,42,0.7)] sm:p-8">
            <p className="text-sm font-semibold uppercase text-teal-300">Why ZDT</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight">Premium clarity for every property decision</h2>
            <p className="mt-4 text-base leading-7 text-slate-300">
              ZDT Properties brings discovery, trust, local insight, and owner-side workflows into a
              single real estate experience that feels modern without feeling noisy.
            </p>
            <div className="mt-6 grid gap-3">
              {solutionCards.map((card) => (
                <div key={card.title} className="rounded-xl border border-white/10 bg-white/[0.06] p-4">
                  <card.icon className="h-5 w-5 text-amber-300" aria-hidden="true" />
                  <h3 className="mt-3 text-base font-semibold">{card.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{card.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {actionCards.map((card) => (
              <button
                key={card.title}
                type="button"
                onClick={card.action}
                className="rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_24px_50px_-36px_rgba(15,23,42,0.38)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/35 focus-visible:ring-offset-2"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-slate-900">
                  <card.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-slate-950">{card.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{card.detail}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-[#EEF6F4] py-10 sm:py-14">
        <div className="page-container">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <p className="text-sm font-semibold uppercase text-teal-700">Market Pulse</p>
              <h2 className="mt-2 text-3xl font-semibold text-slate-950">Micro-markets worth watching</h2>
              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-700">
                Use demand, average ticket size, and local trust notes to narrow your search before
                you book visits or compare projects.
              </p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Button variant="primary" onClick={props.onOpenInsightsMarket}>
                  Market Insights
                </Button>
                <Button variant="outline" onClick={props.onOpenInfrastructure}>
                  Infrastructure Tracker
                </Button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {portalTrendLocalities.map((locality) => (
                <button
                  key={locality.id}
                  type="button"
                  onClick={() => props.onOpenBuy(locality.filters)}
                  className="rounded-xl border border-teal-100 bg-white p-5 text-left shadow-[0_18px_38px_-32px_rgba(15,23,42,0.36)] transition duration-300 hover:-translate-y-1 hover:border-teal-200 hover:shadow-[0_22px_48px_-34px_rgba(15,23,42,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/35 focus-visible:ring-offset-2"
                >
                  <p className="text-xs font-semibold uppercase text-teal-700">{locality.demandLabel}</p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-950">
                    {locality.locality}, {locality.city}
                  </h3>
                  <p className="mt-2 text-sm font-semibold text-slate-700">{locality.averageTicket}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{locality.momentum}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="page-container py-10 sm:py-14">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-[0_24px_56px_-38px_rgba(15,23,42,0.42)] sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase text-blue-700">For sellers and builders</p>
              <h2 className="mt-2 text-3xl font-semibold text-slate-950">Turn inventory into a cleaner growth engine</h2>
              <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
                Post verified listings, track leads, manage owner workflows, inspect analytics, and
                give buyers a more trustworthy path from shortlist to site visit.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {['Lead-ready cards', 'Owner analytics', 'Builder visibility', 'Saved searches'].map((item) => (
                  <span
                    key={item}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:w-[360px] lg:grid-cols-1">
              <Button variant="secondary" onClick={props.onOpenPostProperty} rightIcon={<ArrowRight className="h-4 w-4" />}>
                Post Property
              </Button>
              <Button variant="outline" onClick={props.onOpenOwnerAnalytics}>
                Owner Analytics
              </Button>
              <Button variant="outline" onClick={props.onOpenSavedSearches}>
                Saved Searches
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-950 py-10 text-white sm:py-14">
        <div className="page-container grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase text-amber-300">Ready when you are</p>
            <h2 className="mt-2 text-3xl font-semibold">Find, compare, and act with confidence.</h2>
            <p className="mt-3 max-w-2xl text-base leading-7 text-slate-300">
              Browse verified homes now, or create an account to save searches, message owners, and
              build your property shortlist.
            </p>
            <p className="mt-3 text-sm text-slate-400">
              Popular category: {categoryLabel(featuredProperties[0]?.category || 'buy')}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:w-[360px]">
            <Button variant="secondary" onClick={() => props.onOpenBuy()}>
              Buy Property
            </Button>
            {props.isAuthenticated ? (
              <Button variant="outline" onClick={props.onOpenDashboard}>
                Dashboard
              </Button>
            ) : (
              <Button variant="outline" onClick={props.onOpenRegister}>
                Create Account
              </Button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
