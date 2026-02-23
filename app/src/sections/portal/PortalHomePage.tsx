import { useEffect, useMemo, useState, type ElementType } from 'react';
import {
  ArrowRight,
  BarChart3,
  Bell,
  Box,
  Building2,
  Code2,
  Compass,
  GitCompareArrows,
  Landmark,
  Map,
  MapPin,
  MessageCircle,
  Eye,
  Heart,
  Home,
  MousePointerClick,
  Plus,
  Search,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  continueBrowsingPills,
  portalHeroSlides,
  portalProperties,
  type PortalCategory,
} from '@/lib/portalData';
import { apiRequest } from '@/lib/http';
import {
  getPublicPromotions,
  type PromotionItem,
  type PublicPromotionsResponse,
} from '@/lib/promotionsApi';
import type { UserRole } from '@/lib/session';
import PropertyListingCard from './PropertyListingCard';

interface PortalHomePageProps {
  isAuthenticated: boolean;
  onOpenLogin: () => void;
  onOpenRegister: () => void;
  onOpenBuy: () => void;
  onOpenRent: () => void;
  onOpenNewLaunch: () => void;
  onOpenCommercial: () => void;
  onOpenBuildingMaterials: () => void;
  onOpenPlotsLand: () => void;
  onOpenProjects: () => void;
  onOpenInfrastructure?: () => void;
  onOpenPostProperty: () => void;
  onOpenConstructWithUs: () => void;
  onOpenEarlySupporters?: () => void;
  onOpenEAuction: () => void;
  onOpenDeveloper: () => void;
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
  onOpenFavorites: () => void;
  onOpenDealerCompany: (companyId: number) => void;
  onOpenAdminDesk: () => void;
  onOpenTeamDesk: () => void;
  onOpenLayoutUnits: () => void;
  onOpenApartmentComplex: () => void;
  userName?: string;
  userRole?: UserRole;
}

function userRoleLabel(role?: UserRole): string {
  if (role === 'admin') return 'Dealer';
  if (role === 'team_member') return 'Team';
  return 'Member';
}

interface PublicCompanyBanner {
  id: number;
  imageUrl: string;
  title: string;
  subtitle: string;
  linkUrl: string;
  company: {
    id: number;
    code: string;
    name: string;
    type: string;
    logoUrl: string;
  };
}

interface PropertyAnalyticsSnapshot {
  seller: {
    totalViews: number;
    totalClicks: number;
    totalSavedLiked: number;
    totalInquiries: number;
  };
  buyer: {
    savedProperties: number;
    recentlyViewed: number;
    propertyVisitRequests: number;
  };
  rates: {
    clickThroughRate: number;
    saveRate: number;
    inquiryConversionRate: number;
    summaryLabel: string;
  };
}

function toSafeNumber(value: unknown): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function parsePropertyAnalyticsSnapshot(profile: unknown): PropertyAnalyticsSnapshot | null {
  if (!profile || typeof profile !== 'object') {
    return null;
  }
  const source = profile as Record<string, unknown>;
  const myActivity =
    source.myActivity && typeof source.myActivity === 'object'
      ? (source.myActivity as Record<string, unknown>)
      : {};
  const seller =
    myActivity.seller && typeof myActivity.seller === 'object'
      ? (myActivity.seller as Record<string, unknown>)
      : {};
  const buyer =
    myActivity.buyer && typeof myActivity.buyer === 'object'
      ? (myActivity.buyer as Record<string, unknown>)
      : {};
  const analytics =
    source.analyticsAndPerformance && typeof source.analyticsAndPerformance === 'object'
      ? (source.analyticsAndPerformance as Record<string, unknown>)
      : {};

  return {
    seller: {
      totalViews: toSafeNumber(seller.totalViews),
      totalClicks: toSafeNumber(seller.totalClicks),
      totalSavedLiked: toSafeNumber(seller.totalSavedLiked),
      totalInquiries: toSafeNumber(seller.totalInquiries),
    },
    buyer: {
      savedProperties: toSafeNumber(buyer.savedProperties),
      recentlyViewed: toSafeNumber(buyer.recentlyViewed),
      propertyVisitRequests: toSafeNumber(buyer.propertyVisitRequests),
    },
    rates: {
      clickThroughRate: toSafeNumber(analytics.clickThroughRate),
      saveRate: toSafeNumber(analytics.saveRate),
      inquiryConversionRate: toSafeNumber(analytics.inquiryConversionRate),
      summaryLabel:
        typeof analytics.summaryLabel === 'string' && analytics.summaryLabel.trim()
          ? analytics.summaryLabel
          : 'Live property engagement summary',
    },
  };
}

function popupDismissStorageKey(promotionId: string) {
  return `zdt-promo-popup-dismissed-${promotionId}`;
}

const discoverCards: Array<{
  key: PortalCategory;
  title: string;
  subtitle: string;
  icon: typeof Search;
  action: (props: PortalHomePageProps) => void;
}> = [
  {
    key: 'buy',
    title: 'Buy',
    subtitle: 'Homes & investments',
    icon: Search,
    action: (props) => props.onOpenBuy(),
  },
  {
    key: 'rent',
    title: 'Rent',
    subtitle: 'Ready-to-move spaces',
    icon: Building2,
    action: (props) => props.onOpenRent(),
  },
  {
    key: 'projects',
    title: 'Projects',
    subtitle: 'Townships & launches',
    icon: Compass,
    action: (props) => props.onOpenProjects(),
  },
  {
    key: 'commercial',
    title: 'Commercial',
    subtitle: 'Retail & offices',
    icon: Landmark,
    action: (props) => props.onOpenCommercial(),
  },
];

type FeatureCard = {
  key: string;
  title: string;
  subtitle: string;
  icon: typeof Search;
  group: 'high-impact' | 'service' | 'coming-soon-ai';
  action?: (props: PortalHomePageProps) => void;
  quickActions?: Array<{
    key: string;
    label: string;
    action: (props: PortalHomePageProps) => void;
  }>;
  comingSoon?: boolean;
};

const featureCards: FeatureCard[] = [
  {
    key: 'e-auction-gov-bank',
    title: 'e-Auction (Gov/Bank)',
    subtitle: 'Explore verified government and bank auction properties.',
    icon: Landmark,
    group: 'high-impact',
    action: (props) => props.onOpenEAuction(),
  },
  {
    key: 'invest',
    title: 'Invest',
    subtitle: 'Find high-return property investment opportunities.',
    icon: TrendingUp,
    group: 'high-impact',
    action: (props) => props.onOpenProjects(),
  },
  {
    key: 'infrastructure-tracker',
    title: 'Infrastructure Tracker',
    subtitle: 'Track verified road, civic, and development updates across India.',
    icon: MapPin,
    group: 'high-impact',
    action: (props) => props.onOpenInfrastructure?.() || props.onOpenProjects(),
  },
  {
    key: 'apartments-complex',
    title: 'Apartments and Complex',
    subtitle: 'Manage your apartment or complex using our management.',
    icon: Building2,
    group: 'high-impact',
    action: (props) => props.onOpenApartmentComplex(),
  },
  {
    key: 'news-price-updates',
    title: 'News and Price Updates',
    subtitle: 'All insights in one place: news feed, city prices, upcoming projects, and compare trends.',
    icon: Bell,
    group: 'high-impact',
    action: (props) => props.onOpenInsightsNews(),
    quickActions: [
      {
        key: 'insights-news',
        label: 'News Feed',
        action: (props) => props.onOpenInsightsNews(),
      },
      {
        key: 'insights-market',
        label: 'Market',
        action: (props) => props.onOpenInsightsMarket(),
      },
      {
        key: 'insights-projects',
        label: 'Projects',
        action: (props) => props.onOpenInsightsProjects(),
      },
      {
        key: 'insights-compare',
        label: 'Compare',
        action: (props) => props.onOpenInsightsCompare(),
      },
    ],
  },
  {
    key: 'analytics',
    title: 'Analytics',
    subtitle: 'Price trends, demand heatmap, area performance.',
    icon: BarChart3,
    group: 'high-impact',
    action: (props) => props.onOpenDashboard(),
  },
  {
    key: 'subscription-plans',
    title: 'Subscription Plans',
    subtitle: 'Premium visibility, verified badge, faster approvals.',
    icon: ShieldCheck,
    group: 'high-impact',
    action: (props) => props.onOpenDashboard(),
  },
  {
    key: 'construct-with-us',
    title: 'Construct With Us',
    subtitle: 'Connect with trusted builders and construction teams.',
    icon: Compass,
    group: 'service',
    action: (props) => props.onOpenConstructWithUs(),
  },
  {
    key: 'building-materials',
    title: 'Building Materials',
    subtitle: 'Buy materials from verified suppliers (cement, steel, tiles).',
    icon: Box,
    group: 'service',
    action: (props) => props.onOpenBuildingMaterials(),
  },
  {
    key: 'feedback-system',
    title: 'Feedback System',
    subtitle: 'Ratings and reviews for properties, agents and builders.',
    icon: MessageCircle,
    group: 'service',
    action: (props) => props.onOpenMessages(),
  },
  {
    key: 'saved-searches',
    title: 'Saved Searches',
    subtitle: 'Save filters and re-apply searches instantly.',
    icon: Search,
    group: 'service',
    action: (props) => props.onOpenSavedSearches(),
  },
  {
    key: 'compare-properties',
    title: 'Compare Properties',
    subtitle: 'Side-by-side comparison of shortlisted listings.',
    icon: GitCompareArrows,
    group: 'service',
    action: (props) => props.onOpenCompare(),
  },
  {
    key: 'developer-hub',
    title: 'Developer Hub',
    subtitle: 'Verify pages, test API, and access QA shortcuts.',
    icon: Code2,
    group: 'service',
    action: (props) => props.onOpenDeveloper(),
  },
  {
    key: 'ai-plot-polygon',
    title: 'AI Plot Polygon',
    subtitle: 'Upload layout to auto-draw boundary on map.',
    icon: Map,
    group: 'coming-soon-ai',
    action: (props) => props.onOpenDeveloper(),
    comingSoon: true,
  },
  {
    key: 'home-design-ai',
    title: 'Home Design AI',
    subtitle: 'AI-generated house plans and design options.',
    icon: Home,
    group: 'coming-soon-ai',
    action: (props) => props.onOpenDeveloper(),
    comingSoon: true,
  },
  {
    key: 'ai-construction-planning',
    title: 'AI-Based Construction Planning',
    subtitle: 'Smart planning for cost, timeline, and execution workflows.',
    icon: Compass,
    group: 'coming-soon-ai',
    action: (props) => props.onOpenDeveloper(),
    comingSoon: true,
  },
];

export default function PortalHomePage(props: PortalHomePageProps) {
  const [heroIndex, setHeroIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [locationStatus, setLocationStatus] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [companyBanners, setCompanyBanners] = useState<PublicCompanyBanner[]>([]);
  const [sitePromotions, setSitePromotions] = useState<PublicPromotionsResponse | null>(null);
  const [activePopupPromotion, setActivePopupPromotion] = useState<PromotionItem | null>(null);
  const [propertyAnalytics, setPropertyAnalytics] = useState<PropertyAnalyticsSnapshot | null>(null);
  const [isPropertyAnalyticsLoading, setIsPropertyAnalyticsLoading] = useState(false);

  const normalizeAdminPart = (value: string) =>
    value
      .replace(/\s+taluk\b/i, '')
      .replace(/\s+taluka\b/i, '')
      .replace(/\s+district\b/i, '')
      .trim();

  const hero = portalHeroSlides[heroIndex];
  const featuredListings = useMemo(
    () => portalProperties.filter((item) => item.featured).slice(0, 6),
    []
  );
  const sponsoredPromotions = sitePromotions?.promotions.sponsoredBanners || [];
  const promotedTopProperties = useMemo(
    () =>
      (sitePromotions?.promotions.topListedProperties || []).map((promotion) => {
        const ref = promotion.propertyReference.trim().toLowerCase();
        const property =
          ref
            ? portalProperties.find((item) => item.referenceId.toLowerCase() === ref) || null
            : null;
        return { promotion, property };
      }),
    [sitePromotions]
  );

  const quickResults = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) {
      return portalProperties.slice(0, 4);
    }
    return portalProperties
      .filter((item) =>
        `${item.title} ${item.location} ${item.city} ${item.projectName}`
          .toLowerCase()
          .includes(text)
      )
      .slice(0, 4);
  }, [query]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % portalHeroSlides.length);
    }, 4500);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    apiRequest<{ banners: PublicCompanyBanner[] }>('/builder/banners?limit=8')
      .then((response) => {
        if (!active) return;
        setCompanyBanners(Array.isArray(response.banners) ? response.banners : []);
      })
      .catch(() => {
        if (!active) return;
        setCompanyBanners([]);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    getPublicPromotions(8)
      .then((response) => {
        if (!active) return;
        setSitePromotions(response);

        const nextPopup = (response.promotions.popupAds || []).find((promotion) => {
          try {
            return !window.sessionStorage.getItem(popupDismissStorageKey(promotion.id));
          } catch {
            return true;
          }
        });

        setActivePopupPromotion(nextPopup || null);
      })
      .catch(() => {
        if (!active) return;
        setSitePromotions(null);
        setActivePopupPromotion(null);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!props.isAuthenticated) {
      setPropertyAnalytics(null);
      setIsPropertyAnalyticsLoading(false);
      return () => {
        active = false;
      };
    }

    setIsPropertyAnalyticsLoading(true);
    apiRequest<{ profile: unknown }>('/auth/profile')
      .then((response) => {
        if (!active) return;
        setPropertyAnalytics(parsePropertyAnalyticsSnapshot(response.profile));
      })
      .catch(() => {
        if (!active) return;
        setPropertyAnalytics(null);
      })
      .finally(() => {
        if (!active) return;
        setIsPropertyAnalyticsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [props.isAuthenticated]);

  const openPromotionLink = (promotion: PromotionItem) => {
    const link = promotion.linkUrl?.trim();
    if (!link) return;

    if (promotion.openInNewTab) {
      window.open(link, '_blank', 'noopener,noreferrer');
      return;
    }

    window.location.href = link;
  };

  const dismissActivePopup = () => {
    if (!activePopupPromotion) return;
    try {
      window.sessionStorage.setItem(popupDismissStorageKey(activePopupPromotion.id), '1');
    } catch {
      // Ignore storage failures in privacy mode.
    }
    setActivePopupPromotion(null);
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus('Location is not supported in this browser.');
      return;
    }

    setIsLocating(true);
    setLocationStatus('');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;

        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=14&addressdetails=1&accept-language=en`
          );
          if (!response.ok) {
            throw new Error('Reverse geocoding failed.');
          }

          const data = (await response.json()) as {
            address?: Record<string, string>;
          };
          const address = data.address ?? {};
          const locality = normalizeAdminPart(
            address.village || address.hamlet || address.suburb || address.city || address.town || ''
          );
          const district = normalizeAdminPart(
            address.state_district || address.district || address.county || ''
          );
          const state = normalizeAdminPart(address.state || address.province || '');
          const parts = [locality, district, state].filter(Boolean);
          const uniqueParts = parts.filter(
            (part, index) =>
              parts.findIndex((currentPart) => currentPart.toLowerCase() === part.toLowerCase()) === index
          );
          const placeName = uniqueParts.length > 0 ? uniqueParts.join(', ') : '';
          if (placeName) {
            setQuery(placeName);
            setLocationStatus(`Location detected (accuracy +/-${Math.round(accuracy)}m).`);
          } else {
            setQuery(`Lat ${latitude.toFixed(5)}, Lng ${longitude.toFixed(5)}`);
            setLocationStatus('Could not detect place name. Using coordinates.');
          }
        } catch {
          setQuery(`Lat ${latitude.toFixed(5)}, Lng ${longitude.toFixed(5)}`);
          setLocationStatus('Could not resolve location name. Using coordinates.');
        } finally {
          setIsLocating(false);
        }
      },
      (error) => {
        setIsLocating(false);
        if (error.code === error.PERMISSION_DENIED) {
          setLocationStatus('Location permission denied.');
          return;
        }
        setLocationStatus('Unable to fetch current location. Try again.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const renderFeatureFlashCard = (feature: FeatureCard, options?: { subdued?: boolean }) => {
    const isAnalytics = feature.key === 'analytics';
    const isSubdued = options?.subdued ?? false;
    const cardClass = isSubdued
      ? 'rounded-2xl border border-slate-200 bg-slate-100 p-4 text-left opacity-85 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md'
      : 'rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-white hover:shadow-md';
    const subtitle =
      isAnalytics && propertyAnalytics?.rates.summaryLabel
        ? propertyAnalytics.rates.summaryLabel
        : feature.subtitle;
    const hasPrimaryAction = Boolean(feature.action);

    return (
      <article key={feature.key} className={cardClass}>
        <button
          type="button"
          onClick={() => feature.action?.(props)}
          disabled={!hasPrimaryAction}
          className="w-full text-left disabled:cursor-default"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
              <feature.icon className="h-5 w-5" />
            </div>
            {feature.comingSoon ? (
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                Coming Soon
              </span>
            ) : null}
          </div>
          <h3 className="mt-3 text-base font-semibold text-slate-900">{feature.title}</h3>
          <p className="mt-1 text-xs text-slate-600">{subtitle}</p>
        </button>

        {feature.quickActions && feature.quickActions.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {feature.quickActions.map((quickAction) => (
              <button
                key={quickAction.key}
                type="button"
                onClick={() => quickAction.action(props)}
                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
              >
                {quickAction.label}
              </button>
            ))}
          </div>
        ) : null}

        {isAnalytics ? (
          isPropertyAnalyticsLoading ? (
            <p className="mt-3 text-xs text-slate-500">Loading analytics...</p>
          ) : propertyAnalytics ? (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-slate-200 bg-white px-2 py-1.5">
                  <p className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                    <Eye className="h-3.5 w-3.5 text-blue-700" />
                    Views
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-900">
                    {propertyAnalytics.seller.totalViews}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-2 py-1.5">
                  <p className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                    <MousePointerClick className="h-3.5 w-3.5 text-blue-700" />
                    Clicks
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-900">
                    {propertyAnalytics.seller.totalClicks}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-2 py-1.5">
                  <p className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                    <Heart className="h-3.5 w-3.5 text-blue-700" />
                    Saved/Liked
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-900">
                    {propertyAnalytics.seller.totalSavedLiked}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-2 py-1.5">
                  <p className="text-[11px] font-medium text-slate-500">Inquiries</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-900">
                    {propertyAnalytics.seller.totalInquiries}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-slate-600">
                <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">
                  CTR {propertyAnalytics.rates.clickThroughRate.toFixed(1)}%
                </span>
                <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">
                  Save {propertyAnalytics.rates.saveRate.toFixed(1)}%
                </span>
                <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">
                  Conv {propertyAnalytics.rates.inquiryConversionRate.toFixed(1)}%
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-slate-600">
                <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">
                  My saved {propertyAnalytics.buyer.savedProperties}
                </span>
                <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">
                  Viewed 30d {propertyAnalytics.buyer.recentlyViewed}
                </span>
                <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">
                  Visit req {propertyAnalytics.buyer.propertyVisitRequests}
                </span>
              </div>
              <Button
                type="button"
                onClick={() => feature.action?.(props)}
                className="mt-3 h-9 w-full rounded-xl bg-blue-700 text-xs text-white hover:bg-blue-800"
              >
                View All Details
              </Button>
            </>
          ) : (
            <>
              <p className="mt-3 text-xs text-slate-500">
                Analytics data will appear after property activity is tracked.
              </p>
              <Button
                type="button"
                onClick={() => feature.action?.(props)}
                className="mt-3 h-9 w-full rounded-xl bg-blue-700 text-xs text-white hover:bg-blue-800"
              >
                View All Details
              </Button>
            </>
          )
        ) : null}
      </article>
    );
  };

  return (
    <main className="pb-16 pt-24 text-slate-900 xl:pt-40">
      <div className="page-container space-y-6">
        <section className="mx-auto w-full max-w-[1320px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="grid items-stretch gap-4 lg:grid-cols-[1.08fr_0.92fr] lg:gap-0">
            <div className="flex h-full flex-col gap-4 p-4 sm:gap-6 sm:p-6 lg:justify-center lg:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
                Welcome {props.userName ? `${props.userName} (${userRoleLabel(props.userRole)})` : 'to ZDT Realty'}
              </p>
              <h1 className="text-3xl font-bold leading-tight text-slate-900 lg:text-4xl">
                {hero.headline}
              </h1>
              <p className="text-sm text-slate-600">{hero.details}</p>

              <div className="flex flex-wrap items-center gap-3">
                {props.isAuthenticated ? (
                  <>
                    <Button
                      onClick={() => props.onOpenProjects()}
                      className="h-12 rounded-xl bg-blue-700 px-5 text-white hover:bg-blue-800"
                    >
                      {hero.ctaLabel}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                    <Button variant="outline" className="h-12 rounded-xl px-5" onClick={props.onOpenPostProperty}>
                      <Plus className="mr-2 h-4 w-4" />
                      Post Property
                    </Button>
                    <Button variant="outline" className="h-12 rounded-xl px-5" onClick={() => props.onOpenMessages()}>
                      <MessageCircle className="mr-2 h-4 w-4" />
                      Open Messages
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      onClick={props.onOpenLogin}
                      className="h-12 rounded-xl bg-blue-700 px-5 text-white hover:bg-blue-800"
                    >
                      Login
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                    <Button variant="outline" className="h-12 rounded-xl px-5" onClick={props.onOpenRegister}>
                      Register
                    </Button>
                  </>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {continueBrowsingPills.map((pill) => (
                  <span
                    key={pill}
                    className="inline-flex h-8 items-center rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-600"
                  >
                    {pill}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative min-h-[260px] overflow-hidden rounded-2xl border border-slate-200 sm:min-h-[320px] lg:min-h-full lg:rounded-none lg:border-0">
              <img src={hero.image} alt={hero.projectName} className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/45 to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 rounded-xl bg-white/92 p-3 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Featured Project</p>
                <p className="text-sm font-semibold text-slate-900">{hero.projectName}</p>
              </div>
            </div>
          </div>
        </section>

        {sponsoredPromotions.length > 0 ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Main Sponsored Ads</h2>
                <p className="text-sm text-slate-600">
                  Promotions managed by main admin for featured listings and campaigns.
                </p>
              </div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
                Sponsored
              </p>
            </div>

            <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
              {sponsoredPromotions.map((promotion) => {
                const Wrapper: ElementType = promotion.linkUrl ? 'button' : 'div';

                return (
                  <Wrapper
                    key={promotion.id}
                    type={promotion.linkUrl ? 'button' : undefined}
                    onClick={promotion.linkUrl ? () => openPromotionLink(promotion) : undefined}
                    className="group relative w-[320px] shrink-0 overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    <div className="relative w-full bg-slate-100" style={{ aspectRatio: '16 / 9' }}>
                      <img
                        src={promotion.imageUrl || '/images/property-1.jpg'}
                        alt={promotion.title}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        onError={(event) => {
                          const fallback = '/images/property-1.jpg';
                          if (event.currentTarget.src.endsWith(fallback)) return;
                          event.currentTarget.src = fallback;
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/20 to-transparent" />
                      <div className="absolute bottom-3 left-3 right-3 space-y-1">
                        <p className="text-sm font-semibold text-white line-clamp-1">{promotion.title}</p>
                        {promotion.subtitle ? (
                          <p className="text-xs text-white/85 line-clamp-2">{promotion.subtitle}</p>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 p-4">
                      <div>
                        {promotion.badgeText ? (
                          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-blue-700">
                            {promotion.badgeText}
                          </p>
                        ) : null}
                        <p className="text-xs text-slate-600 line-clamp-2">
                          {promotion.description || 'Featured sponsored campaign.'}
                        </p>
                      </div>
                      {promotion.ctaLabel || promotion.linkUrl ? (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-blue-700 transition group-hover:border-blue-300">
                          {promotion.ctaLabel || 'Open'}
                        </span>
                      ) : null}
                    </div>
                  </Wrapper>
                );
              })}
            </div>
          </section>
        ) : null}

        {companyBanners.length > 0 ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Sponsored Banners</h2>
                <p className="text-sm text-slate-600">Developer and dealer promotions on ZDT Realty.</p>
              </div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
                Featured
              </p>
            </div>

            <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
              {companyBanners.map((banner) => {
                const hasCompanyProfile =
                  Number.isFinite(banner.company.id) && Number(banner.company.id) > 0;
                const openBannerDestination = () => {
                  if (hasCompanyProfile) {
                    props.onOpenDealerCompany(Number(banner.company.id));
                    return;
                  }
                  if (banner.linkUrl) {
                    window.open(banner.linkUrl, '_blank', 'noopener,noreferrer');
                  }
                };
                const hasDestination = hasCompanyProfile || Boolean(banner.linkUrl);
                const bannerContent = (
                  <>
                    <div className="relative w-full bg-slate-100" style={{ aspectRatio: '16 / 9' }}>
                      <img
                        src={banner.imageUrl}
                        alt={banner.title || `${banner.company.name} banner`}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/65 via-slate-950/10 to-transparent" />
                      <div className="absolute bottom-3 left-3 right-3 space-y-1">
                        {banner.title ? (
                          <p className="text-sm font-semibold text-white line-clamp-1">{banner.title}</p>
                        ) : null}
                        {banner.subtitle ? (
                          <p className="text-xs text-white/85 line-clamp-2">{banner.subtitle}</p>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
                          {banner.company.logoUrl ? (
                            <img
                              src={banner.company.logoUrl}
                              alt={`${banner.company.name} logo`}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <Landmark className="h-5 w-5 text-slate-500" aria-hidden="true" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900 line-clamp-1">{banner.company.name}</p>
                          <p className="text-xs text-slate-500">{banner.company.type}</p>
                        </div>
                      </div>

                      {hasDestination ? (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-blue-700 transition group-hover:border-blue-300">
                          View Profile
                        </span>
                      ) : null}
                    </div>
                  </>
                );

                if (hasDestination) {
                  return (
                    <button
                      key={banner.id}
                      type="button"
                      onClick={openBannerDestination}
                      className="group relative w-[320px] shrink-0 overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                    >
                      {bannerContent}
                    </button>
                  );
                }

                return (
                  <div
                    key={banner.id}
                    className="group relative w-[320px] shrink-0 overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    {bannerContent}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {promotedTopProperties.length > 0 ? (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Top Listed Properties</h2>
                <p className="text-sm text-slate-600">
                  Main-admin curated property highlights for priority visibility.
                </p>
              </div>
              <Button variant="outline" className="rounded-xl" onClick={props.onOpenBuy}>
                Explore More
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {promotedTopProperties.map(({ promotion, property }) => {
                if (property) {
                  return (
                    <PropertyListingCard
                      key={promotion.id}
                      property={property}
                      onOpenDetails={props.onOpenPropertyDetails}
                      onOpenMessages={props.onOpenMessages}
                    />
                  );
                }

                return (
                  <article
                    key={promotion.id}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                  >
                    <img
                      src={promotion.imageUrl || '/images/property-3.jpg'}
                      alt={promotion.title}
                      className="h-44 w-full object-cover"
                      loading="lazy"
                      onError={(event) => {
                        const fallback = '/images/property-3.jpg';
                        if (event.currentTarget.src.endsWith(fallback)) return;
                        event.currentTarget.src = fallback;
                      }}
                    />
                    <div className="space-y-3 p-4">
                      {promotion.badgeText ? (
                        <span className="inline-flex rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                          {promotion.badgeText}
                        </span>
                      ) : null}
                      <h3 className="text-base font-semibold text-slate-900">{promotion.title}</h3>
                      <p className="text-sm text-slate-600">
                        {promotion.subtitle || promotion.description || 'Top listed property promotion.'}
                      </p>
                      <div className="pt-1">
                        <Button
                          type="button"
                          onClick={() => openPromotionLink(promotion)}
                          className="h-10 rounded-xl bg-blue-700 text-white hover:bg-blue-800"
                          disabled={!promotion.linkUrl}
                        >
                          {promotion.ctaLabel || 'Open Listing'}
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {props.isAuthenticated ? (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {discoverCards.map((card) => (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => card.action(props)}
                  className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                    <card.icon className="h-5 w-5" />
                  </div>
                  <h2 className="mt-4 text-lg font-semibold text-slate-900">{card.title}</h2>
                  <p className="mt-1 text-sm text-slate-600">{card.subtitle}</p>
                </button>
              ))}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4">
                <h2 className="text-2xl font-bold text-slate-900">Feature Cards</h2>
                <p className="text-sm text-slate-600">
                  High-impact cards, service cards, and upcoming AI features.
                </p>
              </div>

              <div className="space-y-6">
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
                    High-impact flash cards
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {featureCards
                      .filter((feature) => feature.group === 'high-impact')
                      .map((feature) => renderFeatureFlashCard(feature))}
                  </div>
                </div>

                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
                    Service flash cards
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {featureCards
                      .filter((feature) => feature.group === 'service')
                      .map((feature) => renderFeatureFlashCard(feature))}
                  </div>
                </div>

                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
                    Coming Soon AI
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {featureCards
                      .filter((feature) => feature.group === 'coming-soon-ai')
                      .map((feature) => renderFeatureFlashCard(feature, { subdued: true }))}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search by project, city, locality..."
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-blue-400"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="rounded-xl" onClick={props.onOpenNewLaunch}>
                    New Launch
                  </Button>
                  <Button variant="outline" className="rounded-xl" onClick={props.onOpenPlotsLand}>
                    Plots/Land
                  </Button>
                  <Button variant="outline" className="rounded-xl" onClick={props.onOpenCommercial}>
                    Commercial
                  </Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  disabled={isLocating}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  {isLocating ? 'Detecting location...' : 'Use my current location'}
                </button>
                {locationStatus ? <p className="text-xs text-slate-600">{locationStatus}</p> : null}
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Featured Listings</h2>
                  <p className="text-sm text-slate-600">Verified picks curated for your activity.</p>
                </div>
                <Button variant="outline" className="rounded-xl" onClick={props.onOpenBuy}>
                  View all
                </Button>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {featuredListings.map((property) => (
                  <PropertyListingCard
                    key={property.id}
                    property={property}
                    onOpenDetails={props.onOpenPropertyDetails}
                    onOpenMessages={props.onOpenMessages}
                  />
                ))}
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-xl font-bold text-slate-900">Quick Search Results</h3>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {quickResults.map((property) => (
                  <PropertyListingCard
                    key={`quick-${property.id}`}
                    property={property}
                    onOpenDetails={props.onOpenPropertyDetails}
                    onOpenMessages={props.onOpenMessages}
                  />
                ))}
              </div>
            </section>
          </>
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-2xl font-bold text-slate-900">Login to continue</h2>
            <p className="mt-1 text-sm text-slate-600">
              Please login or register to see listings, feature cards, dashboard access, and messaging.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                onClick={props.onOpenLogin}
                className="rounded-xl bg-blue-700 px-5 text-white hover:bg-blue-800"
              >
                Login
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button variant="outline" className="rounded-xl" onClick={props.onOpenRegister}>
                Register
              </Button>
            </div>
          </section>
        )}
      </div>

      <Dialog
        open={Boolean(activePopupPromotion)}
        onOpenChange={(open) => {
          if (!open) {
            dismissActivePopup();
          }
        }}
      >
        <DialogContent className="max-w-xl border border-slate-200 bg-white p-0 overflow-hidden">
          {activePopupPromotion ? (
            <div className="space-y-4">
              <div className="relative h-52 w-full bg-slate-100">
                <img
                  src={activePopupPromotion.imageUrl || '/images/property-2.jpg'}
                  alt={activePopupPromotion.title}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  onError={(event) => {
                    const fallback = '/images/property-2.jpg';
                    if (event.currentTarget.src.endsWith(fallback)) return;
                    event.currentTarget.src = fallback;
                  }}
                />
              </div>

              <div className="px-5 pb-5">
                <DialogHeader>
                  <DialogTitle className="text-xl text-slate-900">{activePopupPromotion.title}</DialogTitle>
                  <DialogDescription className="text-sm text-slate-600">
                    {activePopupPromotion.subtitle ||
                      activePopupPromotion.description ||
                      'Featured promotion from ZDT Realty main admin.'}
                  </DialogDescription>
                </DialogHeader>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
                      openPromotionLink(activePopupPromotion);
                      dismissActivePopup();
                    }}
                    disabled={!activePopupPromotion.linkUrl}
                    className="bg-blue-700 text-white hover:bg-blue-800"
                  >
                    {activePopupPromotion.ctaLabel || 'Explore Offer'}
                  </Button>
                  <Button variant="outline" onClick={dismissActivePopup}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}
