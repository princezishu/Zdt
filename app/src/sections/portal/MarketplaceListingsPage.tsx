import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getPropertiesForCategory,
  type PortalProperty,
  type PortalCategory,
} from '@/lib/portalData';
import { listProjects, type Project } from '@/lib/realtyApi';
import PropertyListingCard from './PropertyListingCard';

interface MarketplaceListingsPageProps {
  category: PortalCategory;
  onOpenDetails: (referenceId?: string) => void;
  onOpenMessages: (referenceId?: string) => void;
  onOpenPostProperty: () => void;
}

const categoryMeta: Record<
  PortalCategory,
  { title: string; subtitle: string; description: string }
> = {
  buy: {
    title: 'Buy Properties',
    subtitle: 'Verified Listings',
    description:
      'Explore premium homes and investment-ready inventory curated for end users and investors.',
  },
  rent: {
    title: 'Rent Properties',
    subtitle: 'Move-In Ready Homes',
    description:
      'Find quality rental homes in top neighborhoods with transparent owner details.',
  },
  'new-launch': {
    title: 'Near By Properties',
    subtitle: 'Recently Added',
    description:
      'Browse recently added nearby properties and new projects from trusted builders.',
  },
  commercial: {
    title: 'Commercial Spaces',
    subtitle: 'High Visibility Assets',
    description:
      'Retail, office and mixed-use opportunities with long-term growth potential.',
  },
  'plots-land': {
    title: 'Plots & Land',
    subtitle: 'Build Your Future',
    description:
      'Curated land parcels in approved layouts and growth corridors.',
  },
  projects: {
    title: 'Projects',
    subtitle: 'Integrated Developments',
    description:
      'Townships, branded residences and institutional-grade project inventory.',
  },
};

function extractProjectSequence(referenceId: string): number {
  const match = /(\d+)/.exec(referenceId);
  if (!match) return 0;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : 0;
}

export default function MarketplaceListingsPage({
  category,
  onOpenDetails,
  onOpenMessages,
  onOpenPostProperty,
}: MarketplaceListingsPageProps) {
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recommended' | 'price-low' | 'price-high'>('recommended');
  const [realtyProjects, setRealtyProjects] = useState<Project[]>([]);
  const [realtyLoading, setRealtyLoading] = useState(false);
  const [realtyError, setRealtyError] = useState('');

  const meta = categoryMeta[category];
  const showRealtyProjects = category === 'new-launch' || category === 'projects';

  useEffect(() => {
    let active = true;

    if (!showRealtyProjects) {
      setRealtyProjects([]);
      setRealtyError('');
      setRealtyLoading(false);
      return () => {
        active = false;
      };
    }

    setRealtyLoading(true);
    setRealtyError('');

    listProjects({ status: 'all', limit: 100 })
      .then((rows) => {
        if (!active) return;
        setRealtyProjects(rows);
      })
      .catch((loadError) => {
        if (!active) return;
        setRealtyProjects([]);
        setRealtyError(
          loadError instanceof Error ? loadError.message : 'Unable to load latest builder projects'
        );
      })
      .finally(() => {
        if (!active) return;
        setRealtyLoading(false);
      });

    return () => {
      active = false;
    };
  }, [showRealtyProjects]);

  const mappedRealtyProjects = useMemo<PortalProperty[]>(() => {
    const statusFiltered = realtyProjects.filter((project) => {
      if (category === 'new-launch') {
        return project.status !== 'Ready to Move';
      }
      return true;
    });

    return statusFiltered.map((project) => {
      const priceBase = Number(project.priceMin || project.priceMax || project.pricePerSqft || 0);
      const areaValue = Number(project.totalArea || 0);
      const configurations = project.configurations.filter(Boolean);
      const labelFromConfig =
        configurations.length > 0 ? configurations.slice(0, 2).join(' / ') : project.projectType;
      const constructionStatus = project.construction?.overallStatus || project.status;
      const constructionCompletionPercent =
        typeof project.construction?.completionPercent === 'number'
          ? Math.max(0, Math.min(100, Math.round(project.construction.completionPercent)))
          : null;
      const constructionLastUpdatedAt = project.construction?.lastUpdatedAt || null;

      const priceLabel = (() => {
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
          return `Rs ${Math.round(Number(project.pricePerSqft)).toLocaleString('en-IN')} / sq.ft`;
        }
        return 'Price on request';
      })();

      return {
        id: `realty-project-${project.id}`,
        referenceId: `PROJECT-${project.id}`,
        title: project.projectName,
        location: project.area || project.fullAddress || 'Project location',
        city: project.city || project.state || '',
        priceLabel,
        priceValue: priceBase,
        areaSqft: areaValue,
        areaLabel: areaValue > 0 ? `${Math.round(areaValue).toLocaleString('en-IN')} sq.ft` : 'Area on request',
        bhk: labelFromConfig,
        bath: project.totalFloors ? `${project.totalFloors} Floors` : 'N/A',
        parking: project.totalUnits ? `${project.totalUnits} Units` : 'N/A',
        status: constructionStatus,
        verified: Boolean(project.company?.isVerified),
        featured: project.status === 'Under Construction' || project.status === 'Ready to Move',
        isNew: project.status !== 'Ready to Move',
        readyToMove: project.status === 'Ready to Move',
        image: project.primaryImage || '/images/property-1.jpg',
        category,
        projectName: project.projectName,
        facing: 'NA',
        floor: project.totalFloors ? `G+${project.totalFloors}` : 'NA',
        description: project.highlights || 'Builder project listed on ZDT Realty.',
        amenities: project.amenities || [],
        constructionStatus,
        constructionCompletionPercent,
        constructionLastUpdatedAt,
      };
    });
  }, [category, realtyProjects]);

  const listings = useMemo(() => {
    const source = showRealtyProjects ? mappedRealtyProjects : getPropertiesForCategory(category);
    const normalizedQuery = query.trim().toLowerCase();
    const searched = source.filter((item) => {
      const text = `${item.title} ${item.location} ${item.city} ${item.projectName}`.toLowerCase();
      return text.includes(normalizedQuery);
    });
    const nearByRecentlyAdded =
      category === 'new-launch'
        ? [...searched].sort(
            (a, b) =>
              extractProjectSequence(b.referenceId) - extractProjectSequence(a.referenceId)
          )
        : searched;

    if (sortBy === 'price-low') {
      return [...nearByRecentlyAdded].sort((a, b) => a.priceValue - b.priceValue);
    }
    if (sortBy === 'price-high') {
      return [...nearByRecentlyAdded].sort((a, b) => b.priceValue - a.priceValue);
    }
    return nearByRecentlyAdded;
  }, [category, mappedRealtyProjects, query, showRealtyProjects, sortBy]);

  return (
    <section className="pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-5">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">{meta.subtitle}</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">{meta.title}</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">{meta.description}</p>
        </div>

        <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_220px_auto]">
          <label className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                category === 'new-launch'
                  ? 'Search nearby by city, locality or project'
                  : 'Search by city, project or location'
              }
              className="h-11 w-full border-0 bg-transparent text-sm text-slate-700 outline-none"
            />
          </label>
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as 'recommended' | 'price-low' | 'price-high')}
            className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-blue-400"
          >
            <option value="recommended">
              {category === 'new-launch' ? 'Recently Added' : 'Recommended'}
            </option>
            <option value="price-low">Price: Low To High</option>
            <option value="price-high">Price: High To Low</option>
          </select>
          <div className="flex flex-wrap gap-2 justify-end">
            <Button
              onClick={onOpenPostProperty}
              className="h-11 rounded-xl bg-blue-700 px-5 text-white hover:bg-blue-800"
            >
              Post Property FREE
            </Button>
          </div>
        </div>

        {showRealtyProjects && realtyLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
            {category === 'new-launch'
              ? 'Loading nearby recently added properties...'
              : 'Loading latest builder projects...'}
          </div>
        ) : null}

        {showRealtyProjects && realtyError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
            {realtyError}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {listings.map((property) => (
            <PropertyListingCard
              key={property.id}
              property={property}
              onOpenDetails={onOpenDetails}
              onOpenMessages={onOpenMessages}
            />
          ))}
        </div>

        {listings.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
            {showRealtyProjects && category === 'new-launch'
              ? 'No nearby recently added properties found yet. Add a new project from the Dealers/Builders profile.'
              : showRealtyProjects
                ? 'No builder/dealer projects found yet. Add a new project from the Dealers/Builders profile.'
                : 'No properties match your search right now. Try another city or project keyword.'}
          </div>
        )}
      </div>
    </section>
  );
}
