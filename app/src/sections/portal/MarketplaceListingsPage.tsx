import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Search, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getPropertiesForCategory,
  type PortalProperty,
  type PortalCategory,
} from '@/lib/portalData';
import { listProjects, type Project } from '@/lib/realtyApi';
import {
  getSponsoredListings,
  type SponsoredListingCard,
} from '@/lib/sponsoredListingsApi';
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

function mapCategoryToSponsoredRequestType(category: PortalCategory): 'all' | 'sell' | 'rent' {
  if (category === 'rent') {
    return 'rent';
  }
  return 'sell';
}

function mapCategoryToSponsoredPropertyType(
  category: PortalCategory
): 'all' | 'Plot' | 'Villa' | 'Flat / Apartment' | 'Commercial' {
  if (category === 'commercial') {
    return 'Commercial';
  }
  if (category === 'plots-land') {
    return 'Plot';
  }
  return 'all';
}

function mapSponsoredCardToPortalProperty(card: SponsoredListingCard): PortalProperty {
  return {
    id: `sponsored-${card.referenceId}`,
    referenceId: card.referenceId,
    title: card.title,
    location: card.locality || card.city || 'Prime Locality',
    city: card.city || '',
    priceLabel: card.priceLabel || 'Price on request',
    priceValue: Math.round(Number(card.listing?.priceLakh || 0) * 100000),
    areaSqft: 0,
    areaLabel: card.areaLabel || 'Area on request',
    bhk: card.listing?.bhk || 'N/A',
    bath: 'N/A',
    parking: 'N/A',
    status: card.badgeText || 'Sponsored',
    verified: Boolean(card.listing?.verified),
    featured: true,
    isNew: false,
    readyToMove: false,
    image: card.image || '/images/property-1.jpg',
    category: categoryFromSponsoredCard(card),
    projectName: card.subtitle || card.title,
    facing: card.listing?.mainDoorFacing || 'NA',
    floor: 'NA',
    description: card.description || card.subtitle || card.title,
    amenities: [],
  };
}

function categoryFromSponsoredCard(card: SponsoredListingCard): PortalCategory {
  if (card.requestType === 'rent') {
    return 'rent';
  }
  if (card.propertyType === 'Commercial') {
    return 'commercial';
  }
  if (card.propertyType === 'Plot') {
    return 'plots-land';
  }
  return 'buy';
}

export default function MarketplaceListingsPage({
  category,
  onOpenDetails,
  onOpenMessages,
  onOpenPostProperty,
}: MarketplaceListingsPageProps) {
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recommended' | 'price-low' | 'price-high'>('recommended');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [readyToMoveOnly, setReadyToMoveOnly] = useState(false);
  const [realtyProjects, setRealtyProjects] = useState<Project[]>([]);
  const [realtyLoading, setRealtyLoading] = useState(false);
  const [realtyError, setRealtyError] = useState('');
  const [sponsoredListings, setSponsoredListings] = useState<SponsoredListingCard[]>([]);

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

  useEffect(() => {
    let active = true;

    getSponsoredListings({
      placement: 'public_results',
      requestType: mapCategoryToSponsoredRequestType(category),
      propertyType: mapCategoryToSponsoredPropertyType(category),
      limit: 6,
    })
      .then((response) => {
        if (!active) return;
        setSponsoredListings(response.listings || []);
      })
      .catch(() => {
        if (!active) return;
        setSponsoredListings([]);
      });

    return () => {
      active = false;
    };
  }, [category]);

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
      if (!text.includes(normalizedQuery)) {
        return false;
      }
      if (verifiedOnly && !item.verified) {
        return false;
      }
      if (featuredOnly && !item.featured) {
        return false;
      }
      if (readyToMoveOnly && !item.readyToMove) {
        return false;
      }
      return true;
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
  }, [
    category,
    featuredOnly,
    mappedRealtyProjects,
    query,
    readyToMoveOnly,
    showRealtyProjects,
    sortBy,
    verifiedOnly,
  ]);
  const listingSummary = useMemo(() => {
    return listings.reduce(
      (summary, item) => {
        if (item.verified) summary.verified += 1;
        if (item.featured) summary.featured += 1;
        if (item.readyToMove) summary.ready += 1;
        return summary;
      },
      { verified: 0, featured: 0, ready: 0 }
    );
  }, [listings]);
  const sponsoredPortalListings = useMemo(
    () => sponsoredListings.map(mapSponsoredCardToPortalProperty),
    [sponsoredListings]
  );

  return (
    <section className="portal-mobile-page pb-16 pt-28 text-slate-900">
      <div className="page-container portal-mobile-stack space-y-5">
        <div className="portal-mobile-panel rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">{meta.subtitle}</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">{meta.title}</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">{meta.description}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MarketplaceSummaryCard title="Live Listings" value={listings.length} hint="Visible inventory for this category" />
          <MarketplaceSummaryCard title="Verified" value={listingSummary.verified} hint="Trust-screened listings" />
          <MarketplaceSummaryCard title="Featured" value={listingSummary.featured} hint="Priority-ranked inventory" />
          <MarketplaceSummaryCard title="Ready Now" value={listingSummary.ready} hint="Ready-to-move opportunities" />
        </div>

        <div className="portal-mobile-panel grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_220px_auto]">
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
              Post Or Upgrade Listing
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 md:col-span-3">
            <button
              type="button"
              onClick={() => setVerifiedOnly((prev) => !prev)}
              className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                verifiedOnly
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-200 hover:text-blue-700'
              }`}
            >
              <BadgeCheck className="mr-1.5 h-3.5 w-3.5" />
              Verified Only
            </button>
            <button
              type="button"
              onClick={() => setFeaturedOnly((prev) => !prev)}
              className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                featuredOnly
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-200 hover:text-blue-700'
              }`}
            >
              <TrendingUp className="mr-1.5 h-3.5 w-3.5" />
              Featured
            </button>
            <button
              type="button"
              onClick={() => setReadyToMoveOnly((prev) => !prev)}
              className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                readyToMoveOnly
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-200 hover:text-blue-700'
              }`}
            >
              Ready To Move
            </button>
          </div>
        </div>

        {sponsoredPortalListings.length > 0 ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Sponsored Listings</h2>
                <p className="text-sm text-slate-600">
                  Paid seller cards shown separately from organic marketplace ordering.
                </p>
              </div>
              <Button variant="outline" className="rounded-xl" onClick={onOpenPostProperty}>
                Sponsor A Listing
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sponsoredPortalListings.map((property) => (
                <PropertyListingCard
                  key={`sponsored-${property.referenceId}`}
                  property={property}
                  onOpenDetails={onOpenDetails}
                  onOpenMessages={onOpenMessages}
                />
              ))}
            </div>
          </section>
        ) : null}

        <div className="portal-mobile-panel rounded-3xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-slate-50 p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Premium Marketplace</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-900">Better trust for buyers. Better visibility for sellers.</h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Verified inventory, lead-protected contact unlocks, priority visibility, and faster visit intent capture.
              </p>
            </div>
            <Button
              onClick={onOpenPostProperty}
              className="h-11 rounded-xl bg-blue-700 px-5 text-white hover:bg-blue-800"
            >
              Promote Your Listing
            </Button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white bg-white/80 p-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">Lead-protected contact flow</p>
              <p className="mt-1">Phone unlocks happen after intent, which protects seller leads.</p>
            </div>
            <div className="rounded-2xl border border-white bg-white/80 p-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">Trust-first discovery</p>
              <p className="mt-1">Verified, featured, and ready inventory gets clearer buyer attention.</p>
            </div>
            <div className="rounded-2xl border border-white bg-white/80 p-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">Seller revenue surfaces</p>
              <p className="mt-1">Priority ranking, featured placement, and richer lead CTAs support monetization.</p>
            </div>
          </div>
        </div>

        {showRealtyProjects && realtyLoading ? (
          <div className="portal-mobile-card rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
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
          <div className="portal-mobile-card rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
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

function MarketplaceSummaryCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="portal-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value.toLocaleString('en-IN')}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}
