import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  HardHat,
  Home,
  ShieldCheck,
  Warehouse,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { listProjects, type Project } from '@/lib/realtyApi';
import { getPublicPromotions, type PromotionItem } from '@/lib/promotionsApi';

interface ConstructWithUsPageProps {
  onStartJourney: () => void;
  onOpenProjects: () => void;
  onOpenProjectDetails?: (projectId: number) => void;
}

const constructionTypes = [
  {
    title: 'Residential Construction',
    subtitle: 'Independent House, Villa, Duplex',
    icon: Home,
    description:
      'Planned for family comfort, smart layouts, and long-term livability with structural reliability.',
  },
  {
    title: 'Commercial Construction',
    subtitle: 'Shops, Offices, Warehouses',
    icon: Warehouse,
    description:
      'Business-focused structures with efficient use of space, compliance awareness, and durable systems.',
  },
  {
    title: 'Apartment / Rental Construction',
    subtitle: 'Multi-unit Buildings for Rental Returns',
    icon: Building2,
    description:
      'Optimized unit mix and practical finishes designed to improve occupancy and rental stability.',
  },
];

const packageCards = [
  {
    name: 'Core Build Model',
    qualityLevel: 'Structure + essential utilities',
    idealUse: 'Best for plot owners prioritizing a strong, reliable base',
  },
  {
    name: 'Standard Finish Model',
    qualityLevel: 'Balanced materials and livable finish',
    idealUse: 'Best for self-use homes with practical quality targets',
  },
  {
    name: 'Premium Finish Model',
    qualityLevel: 'High-spec materials and elevated finish',
    idealUse: 'Best for premium homes and design-focused builds',
  },
];

const scopeOfWork = [
  'Architecture and structural design',
  'Material procurement and vendor coordination',
  'End-to-end construction execution',
  'Electrical and plumbing systems',
  'Quality checks at critical stages',
  'Interior-ready handover',
];

const trustPoints = [
  'Transparent cost breakup visibility',
  'Material brand disclosure before execution',
  'Stage-wise payment concept linked to progress',
  'Defined construction timeline stages',
  'Regular photo/video progress update concept',
];

const smartAssistance = [
  'Plot size based construction suggestions',
  'Budget-based package guidance',
  'Residential vs rental planning support',
  'Optional vastu guidance',
];

const flowSteps = [
  'Requirement discussion and site understanding',
  'Concept plan, scope finalization, and package selection',
  'Drawings, approvals guidance, and BOQ alignment',
  'Execution in stage milestones with supervision',
  'Quality audit, finishing, and handover',
];

const targetAudience = [
  'Plot Owners',
  'First-time Builders',
  'NRIs',
  'Rental Investors',
  'Small Developers',
];

function formatCurrencyRange(project: Project): string {
  const min = Number(project.priceMin || 0);
  const max = Number(project.priceMax || 0);
  if (min > 0 && max > 0) {
    return `Rs ${Math.round(min).toLocaleString('en-IN')} - Rs ${Math.round(max).toLocaleString('en-IN')}`;
  }
  if (max > 0) {
    return `Up to Rs ${Math.round(max).toLocaleString('en-IN')}`;
  }
  if (min > 0) {
    return `From Rs ${Math.round(min).toLocaleString('en-IN')}`;
  }
  if (project.pricePerSqft && Number(project.pricePerSqft) > 0) {
    return `Rs ${Math.round(Number(project.pricePerSqft)).toLocaleString('en-IN')} / sq ft`;
  }
  return 'Price on request';
}

export default function ConstructWithUsPage({
  onStartJourney,
  onOpenProjects,
  onOpenProjectDetails,
}: ConstructWithUsPageProps) {
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectError, setProjectError] = useState('');
  const [promotionBanners, setPromotionBanners] = useState<PromotionItem[]>([]);
  const [promotionTopProperties, setPromotionTopProperties] = useState<PromotionItem[]>([]);

  useEffect(() => {
    let active = true;

    setLoadingProjects(true);
    setProjectError('');

    listProjects({ status: 'all', limit: 100 })
      .then((projects) => {
        if (!active) return;
        setRecentProjects(projects || []);
      })
      .catch((error) => {
        if (!active) return;
        setRecentProjects([]);
        setProjectError(error instanceof Error ? error.message : 'Unable to load recent projects.');
      })
      .finally(() => {
        if (!active) return;
        setLoadingProjects(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    getPublicPromotions(12)
      .then((response) => {
        if (!active) return;
        setPromotionBanners(response.promotions.sponsoredBanners || []);
        setPromotionTopProperties(response.promotions.topListedProperties || []);
      })
      .catch(() => {
        if (!active) return;
        setPromotionBanners([]);
        setPromotionTopProperties([]);
      });

    return () => {
      active = false;
    };
  }, []);

  const showcasedProjects = useMemo(
    () =>
      recentProjects
        .filter((project) => project.status === 'Ready to Move' || project.status === 'Under Construction')
        .slice(0, 6),
    [recentProjects]
  );

  const adminAddedProjects = useMemo(
    () =>
      promotionTopProperties
        .map((promo) => {
          const ref = (promo.propertyReference || '').trim();
          const match = /^PROJECT-(\d+)$/i.exec(ref);
          const projectId = match ? Number(match[1]) : 0;
          const project =
            projectId > 0 ? recentProjects.find((item) => item.id === projectId) || null : null;

          return {
            promo,
            project,
          };
        })
        .slice(0, 8),
    [promotionTopProperties, recentProjects]
  );

  const openPromotionLink = (promotion: PromotionItem) => {
    const link = (promotion.linkUrl || '').trim();
    if (!link) return;

    if (promotion.openInNewTab) {
      window.open(link, '_blank', 'noopener,noreferrer');
      return;
    }

    window.location.href = link;
  };

  return (
    <section className="min-h-screen pt-28 pb-16 text-slate-900">
      <div className="page-container zdt-page-stack">
        <div className="zdt-panel-hero rounded-3xl border border-white/20 bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 p-6 text-white shadow-2xl">
          <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Construct With Us</p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">
            From Empty Plot to Ready Building, Managed End-to-End
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-white/85">
            ZDT Realty handles construction planning, procurement, execution, and handover with one
            accountable coordination team, so you build with clarity and control.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={onStartJourney}
              className="h-11 rounded-xl bg-white px-5 text-slate-900 hover:bg-slate-100"
            >
              Start Construction Journey
            </Button>
            <Button
              variant="outline"
              onClick={onOpenProjects}
              className="h-11 rounded-xl border-white/30 bg-white/10 text-white hover:bg-white/20"
            >
              View Ongoing & Delivered Projects
            </Button>
          </div>
        </div>

        {promotionBanners.length > 0 ? (
          <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-end justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">Sponsored Advertisements</h2>
                <p className="text-sm text-slate-600">
                  Campaigns managed by Main Admin for construction services and offers.
                </p>
              </div>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {promotionBanners.map((promotion) => (
                <button
                  key={promotion.id}
                  type="button"
                  onClick={() => openPromotionLink(promotion)}
                  className="group relative w-[320px] shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 text-left"
                >
                  <img
                    src={promotion.imageUrl || '/images/property-2.jpg'}
                    alt={promotion.title}
                    className="h-40 w-full object-cover"
                    loading="lazy"
                    onError={(event) => {
                      const fallback = '/images/property-2.jpg';
                      if (event.currentTarget.src.endsWith(fallback)) return;
                      event.currentTarget.src = fallback;
                    }}
                  />
                  <div className="space-y-1 p-3">
                    <p className="font-semibold text-slate-900 line-clamp-1">{promotion.title}</p>
                    <p className="text-xs text-slate-600 line-clamp-2">
                      {promotion.subtitle || promotion.description || 'Sponsored advertisement'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase text-slate-500">Single Point Coordination</p>
            <p className="mt-1 text-sm text-slate-700">
              One accountable team manages design to handover.
            </p>
          </div>
          <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase text-slate-500">Package-Based Execution</p>
            <p className="mt-1 text-sm text-slate-700">
              Clear package options aligned to budget and quality.
            </p>
          </div>
          <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase text-slate-500">Transparent Tracking</p>
            <p className="mt-1 text-sm text-slate-700">
              Stage-level updates, payment clarity, and quality checkpoints.
            </p>
          </div>
        </div>

        <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-lg font-semibold">Construction Types</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {constructionTypes.map((type) => (
              <article key={type.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                  <type.icon className="h-5 w-5" />
                </div>
                <p className="mt-3 font-semibold text-slate-900">{type.title}</p>
                <p className="mt-1 text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
                  {type.subtitle}
                </p>
                <p className="mt-2 text-sm text-slate-600">{type.description}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-lg font-semibold">Construction Service Models</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {packageCards.map((pkg) => (
              <article key={pkg.name} className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                <p className="text-base font-semibold text-slate-900">{pkg.name}</p>
                <p className="text-sm text-slate-700">
                  <span className="font-medium">Quality:</span> {pkg.qualityLevel}
                </p>
                <p className="text-sm text-slate-700">
                  <span className="font-medium">Ideal for:</span> {pkg.idealUse}
                </p>
              </article>
            ))}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <h2 className="text-lg font-semibold">Scope of Work</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {scopeOfWork.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-slate-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <h2 className="text-lg font-semibold">Transparency & Trust</h2>
            <ul className="space-y-2">
              {trustPoints.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-slate-700">
                  <ClipboardCheck className="mt-0.5 h-4 w-4 text-blue-700" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <h2 className="text-lg font-semibold">Smart Assistance</h2>
            <ul className="space-y-2">
              {smartAssistance.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-slate-700">
                  <Compass className="mt-0.5 h-4 w-4 text-indigo-700" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              AI-based construction planning: <span className="font-semibold">Coming Soon</span>
            </div>
          </div>

          <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <h2 className="text-lg font-semibold">Quality, Safety, Compliance & Support</h2>
            <div className="space-y-2 text-sm text-slate-700">
              <p className="flex items-start gap-2">
                <HardHat className="mt-0.5 h-4 w-4 text-emerald-700" />
                Engineer supervision with stage-level quality checkpoints.
              </p>
              <p className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-700" />
                Structural warranty concept and core safety standards.
              </p>
              <p className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-700" />
                Basic plan approval guidance and local regulation awareness.
              </p>
              <p className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-700" />
                Non-legal advisory support for documentation readiness.
              </p>
            </div>
          </div>
        </div>

        <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-lg font-semibold">Step-by-Step Construction Flow</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {flowSteps.map((step, index) => (
              <article key={step} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-blue-700">
                  Step {index + 1}
                </p>
                <p className="mt-1 text-sm text-slate-700">{step}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-lg font-semibold">Who This Is For</h2>
          <div className="flex flex-wrap gap-2">
            {targetAudience.map((audience) => (
              <span
                key={audience}
                className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-sm text-slate-700"
              >
                {audience}
              </span>
            ))}
          </div>
        </div>

        <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Main Admin Added Project Highlights</h2>
              <p className="text-sm text-slate-600">
                Curated projects and promoted listings selected by Main Admin.
              </p>
            </div>
          </div>

          {adminAddedProjects.length === 0 ? (
            <p className="text-sm text-slate-600">
              No admin-added project highlights yet.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {adminAddedProjects.map(({ promo, project }) => (
                <article key={promo.id} className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                  <img
                    src={project?.primaryImage || promo.imageUrl || '/images/property-3.jpg'}
                    alt={project?.projectName || promo.title}
                    className="h-40 w-full object-cover"
                    loading="lazy"
                    onError={(event) => {
                      const fallback = '/images/property-3.jpg';
                      if (event.currentTarget.src.endsWith(fallback)) return;
                      event.currentTarget.src = fallback;
                    }}
                  />
                  <div className="space-y-2 p-4">
                    <p className="font-semibold text-slate-900">
                      {project?.projectName || promo.title}
                    </p>
                    <p className="text-xs uppercase tracking-[0.08em] text-slate-500">
                      {project ? `${project.status} | ${project.city}` : 'Promoted Listing'}
                    </p>
                    <p className="text-sm text-slate-700">
                      {project
                        ? `${project.projectType} | ${formatCurrencyRange(project)}`
                        : promo.subtitle || promo.description || 'Admin promoted project'}
                    </p>
                    <div className="flex gap-2">
                      {project && onOpenProjectDetails ? (
                        <Button size="sm" variant="outline" onClick={() => onOpenProjectDetails(project.id)}>
                          Open Project
                        </Button>
                      ) : null}
                      {promo.linkUrl ? (
                        <Button size="sm" variant="outline" onClick={() => openPromotionLink(promo)}>
                          Open Link
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Recent Projects We Built</h2>
              <p className="text-sm text-slate-600">
                Snapshot of recent work from our projects portfolio.
              </p>
            </div>
            <Button variant="outline" onClick={onOpenProjects}>
              View All Projects
            </Button>
          </div>

          {loadingProjects ? <p className="text-sm text-slate-600">Loading recent projects...</p> : null}
          {projectError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {projectError}
            </p>
          ) : null}
          {!loadingProjects && !projectError && showcasedProjects.length === 0 ? (
            <p className="text-sm text-slate-600">Recent project details will be published here shortly.</p>
          ) : null}

          {showcasedProjects.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {showcasedProjects.map((project) => (
                <article key={project.id} className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                  <img
                    src={project.primaryImage || '/images/property-1.jpg'}
                    alt={project.projectName}
                    className="h-40 w-full object-cover"
                    loading="lazy"
                    onError={(event) => {
                      const fallback = '/images/property-1.jpg';
                      if (event.currentTarget.src.endsWith(fallback)) return;
                      event.currentTarget.src = fallback;
                    }}
                  />
                  <div className="space-y-2 p-4">
                    <p className="font-semibold text-slate-900">{project.projectName}</p>
                    <p className="text-xs uppercase tracking-[0.08em] text-slate-500">
                      {project.status} | {project.city}
                    </p>
                    <p className="text-sm text-slate-700">
                      {project.projectType} | {formatCurrencyRange(project)}
                    </p>
                    {onOpenProjectDetails ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onOpenProjectDetails(project.id)}
                      >
                        Open Project
                      </Button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </div>

        <div className="zdt-panel rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <h2 className="text-lg font-semibold text-slate-900">Build with Clarity, Not Confusion</h2>
          <p className="mt-1 text-sm text-slate-700">
            Get a structured construction journey with clear package options, visible milestones,
            and accountable execution from ZDT Realty.
          </p>
          <Button
            onClick={onStartJourney}
            className="mt-4 h-11 rounded-xl bg-blue-700 px-5 text-white hover:bg-blue-800"
          >
            Start Construction Journey
          </Button>
        </div>
      </div>
    </section>
  );
}
