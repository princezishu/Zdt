import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  Bell,
  Box,
  Building2,
  Clock3,
  Compass,
  Eye,
  Flame,
  GitCompareArrows,
  Landmark,
  LayoutDashboard,
  Map,
  MapPin,
  MessageCircle,
  Home,
  PhoneCall,
  Plus,
  Search,
  ShieldCheck,
  Target,
  Truck,
  TrendingUp,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import InsightMetricCard from '@/components/realty/InsightMetricCard';
import RecentVerifiedUpdates from '@/components/realty/RecentVerifiedUpdates';
import SectionHeader from '@/components/realty/SectionHeader';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  continueBrowsingPills,
  getPortalPropertyContact,
  portalHeroSlides,
  portalProperties,
  portalTrendLocalities,
  type PortalCategory,
  type PortalProperty,
} from '@/lib/portalData';
import {
  COMPARE_CHANGED_EVENT,
  readComparedListings,
} from '@/lib/compareStore';
import {
  FAVORITES_CHANGED_EVENT,
  readFavoriteListings,
} from '@/lib/favoritesStore';
import { apiRequest } from '@/lib/http';
import {
  getUnreadNotificationCount,
  NOTIFICATIONS_CHANGED_EVENT,
  readNotifications,
  type NotificationItem,
} from '@/lib/notificationsStore';
import { openPhoneDialer } from '@/lib/phone';
import {
  createRecentlyViewedPortalListingFromProperty,
  RECENTLY_VIEWED_PORTAL_CHANGED_EVENT,
  readRecentlyViewedPortalListings,
  upsertRecentlyViewedPortalListing,
  type RecentlyViewedPortalListing,
} from '@/lib/portalBrowsingStore';
import { trackPropertyInteraction } from '@/lib/propertyAnalyticsApi';
import {
  getPublicPromotions,
  type PromotionItem,
  type PublicPromotionsResponse,
} from '@/lib/promotionsApi';
import {
  getSponsoredListings,
  type SponsoredListingCard,
} from '@/lib/sponsoredListingsApi';
import {
  readSavedSearches,
  SAVED_SEARCHES_CHANGED_EVENT,
} from '@/lib/savedSearchStore';
import type { UserRole } from '@/lib/session';
import PropertyListingCard from './PropertyListingCard';

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

function userRoleLabel(role?: UserRole): string {
  if (role === 'admin') return 'Dealer';
  if (role === 'team_member') return 'Team';
  return 'Member';
}

function popupDismissStorageKey(promotionId: string) {
  return `zdt-promo-popup-dismissed-${promotionId}`;
}

function formatRelativeViewedTime(value: string): string {
  const viewedAt = new Date(value).getTime();
  if (!Number.isFinite(viewedAt)) return 'Viewed recently';

  const deltaMinutes = Math.max(1, Math.round((Date.now() - viewedAt) / (1000 * 60)));
  if (deltaMinutes < 60) return `Viewed ${deltaMinutes}m ago`;
  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) return `Viewed ${deltaHours}h ago`;
  const deltaDays = Math.round(deltaHours / 24);
  return `Viewed ${deltaDays}d ago`;
}

function formatPortalCategoryLabel(value: PortalCategory): string {
  if (value === 'new-launch') return 'New Launch';
  if (value === 'plots-land') return 'Plots / Land';
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function extractCriteriaTokens(criteria: Record<string, unknown>): string[] {
  return Object.values(criteria)
    .flatMap((value) => {
      if (typeof value === 'string') return [value];
      if (typeof value === 'number' && Number.isFinite(value)) return [String(value)];
      if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === 'string');
      }
      return [];
    })
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
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
  group: 'high-impact' | 'service' | 'coming-soon-ai' | 'coming-soon-advance';
  action?: (props: PortalHomePageProps) => void;
  quickActions?: Array<{
    key: string;
    label: string;
    action: (props: PortalHomePageProps) => void;
  }>;
  comingSoon?: boolean;
};

type MobileDealerStat = {
  key: string;
  label: string;
  value: string;
  note: string;
  icon: typeof Search;
  action: (props: PortalHomePageProps) => void;
  cardClassName: string;
  iconClassName: string;
};

type MobileHotLead = {
  id: string;
  referenceId: string;
  requirement: string;
  location: string;
  budget: string;
  note: string;
  urgency: string;
  tag: string;
};

const featureCards: FeatureCard[] = [
  {
    key: 'e-auction-gov-bank',
    title: 'Government & Bank Auctions',
    subtitle: 'Explore verified government and bank auction properties.',
    icon: Landmark,
    group: 'high-impact',
    action: (props) => props.onOpenEAuction(),
  },
  {
    key: 'invest',
    title: 'Invest',
    subtitle: 'Property and project-side growth suggestions for future planning.',
    icon: TrendingUp,
    group: 'high-impact',
    action: (props) => props.onOpenInvest(),
  },
  {
    key: 'area-intelligence',
    title: 'Area Intelligence',
    subtitle: 'Check locality quality, infra signals, and pricing movement before decision.',
    icon: MapPin,
    group: 'high-impact',
    action: (props) => props.onOpenAreaInsights(),
  },
  {
    key: 'infrastructure-tracker',
    title: 'Government Infrastructure Tenders',
    subtitle: 'All news about government tenders and public infrastructure opportunities.',
    icon: MapPin,
    group: 'high-impact',
    action: (props) => {
      if (props.onOpenInfrastructure) {
        props.onOpenInfrastructure();
        return;
      }
      props.onOpenProjects();
    },
  },
  {
    key: 'news-price-updates',
    title: 'Market Insights',
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
    key: 'subscription-plans',
    title: 'Builder Plans',
    subtitle: 'Builder plan tiers for visibility, verification, and lead tools.',
    icon: ShieldCheck,
    group: 'high-impact',
    action: (_props) => {
      window.alert('Builder Plans is in beta testing and free for now.');
    },
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
    title: 'Circular Build Pickup',
    subtitle: 'Submit reusable demolition stock and let ZDT handle verification, pickup, and reuse.',
    icon: Truck,
    group: 'service',
    action: (props) => props.onOpenBuildingMaterials(),
  },
  {
    key: 'materials-marketplace',
    title: 'Materials Marketplace',
    subtitle: 'Shop cement, steel, bricks, tiles, paint, plumbing, electrical & everything builders need.',
    icon: Box,
    group: 'high-impact',
    action: (props) => props.onOpenBuildingMaterials(),
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
    key: 'interior-design-ai',
    title: 'Interior Design AI',
    subtitle: 'Generate room layouts, themes, and furnishing ideas instantly.',
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
  {
    key: 'apartment-complex-management-advance',
    title: 'Apartment / Complex Management Advance',
    subtitle: 'Advanced tools for occupancy, rent tracking, maintenance workflows, and admin operations.',
    icon: LayoutDashboard,
    group: 'coming-soon-advance',
    action: (props) => props.onOpenDeveloper(),
    comingSoon: true,
  },
];

const mobileHotLeads: MobileHotLead[] = [
  {
    id: 'lead-1',
    referenceId: 'ZDT-BUY-101',
    requirement: 'Looking for 2 BHK in Sarjapur',
    location: 'Sarjapur Road, Bangalore',
    budget: 'Rs 80 Lakh - Rs 1 Cr',
    note: 'Needs site visit this weekend and prefers ready-to-move inventory.',
    urgency: 'Hot',
    tag: 'Buyer Ready',
  },
  {
    id: 'lead-2',
    referenceId: 'ZDT-NL-103',
    requirement: 'Premium villa buyer in Whitefield',
    location: 'Whitefield, Bangalore',
    budget: 'Rs 2.2 Cr - Rs 3 Cr',
    note: 'Shortlisting gated communities with clubhouse and quick possession.',
    urgency: 'High Intent',
    tag: 'Call Today',
  },
  {
    id: 'lead-3',
    referenceId: 'ZDT-COM-104',
    requirement: 'Investor wants commercial unit',
    location: 'Indiranagar and Koramangala',
    budget: 'Rs 1.5 Cr - Rs 2.4 Cr',
    note: 'Asking for rental yield potential and high-footfall micro-markets.',
    urgency: 'Fast Moving',
    tag: 'ROI Focused',
  },
];

function resolveSponsoredPortalCategory(card: SponsoredListingCard): PortalCategory {
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
    category: resolveSponsoredPortalCategory(card),
    projectName: card.subtitle || card.title,
    facing: card.listing?.mainDoorFacing || 'NA',
    floor: 'NA',
    description: card.description || card.subtitle || card.title,
    amenities: [],
  };
}

export default function PortalHomePage(props: PortalHomePageProps) {
  const [heroIndex, setHeroIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [locationStatus, setLocationStatus] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [recentlyViewed, setRecentlyViewed] = useState<RecentlyViewedPortalListing[]>(() =>
    readRecentlyViewedPortalListings()
  );
  const [savedSearches, setSavedSearches] = useState(() => readSavedSearches());
  const [favoriteListings, setFavoriteListings] = useState(() => readFavoriteListings());
  const [compareCount, setCompareCount] = useState(() => readComparedListings().length);
  const [recentNotifications, setRecentNotifications] = useState<NotificationItem[]>(() =>
    readNotifications().slice(0, 3)
  );
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(() =>
    getUnreadNotificationCount()
  );
  const [sitePromotions, setSitePromotions] = useState<PublicPromotionsResponse | null>(null);
  const [sponsoredListings, setSponsoredListings] = useState<SponsoredListingCard[]>([]);
  const [activePopupPromotion, setActivePopupPromotion] = useState<PromotionItem | null>(null);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<'bug' | 'difficulty' | 'suggestion' | 'other'>('bug');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackContext, setFeedbackContext] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [showFeedbackHint, setShowFeedbackHint] = useState(true);

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
  const sponsoredPortalProperties = useMemo(
    () => sponsoredListings.map(mapSponsoredCardToPortalProperty),
    [sponsoredListings]
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
  const searchSuggestions = useMemo(() => {
    const text = query.trim();
    if (!text) {
      return [];
    }
    return quickResults.slice(0, 4);
  }, [quickResults, query]);
  const mobileCardShellClass =
    'portal-mobile-card group overflow-hidden rounded-[26px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.14),transparent_40%),linear-gradient(180deg,#ffffff,#f8fbff)] text-left shadow-[0_18px_42px_-32px_rgba(15,23,42,0.35)] transition duration-300 active:scale-[0.99] sm:hover:-translate-y-1 sm:hover:border-blue-200 sm:hover:shadow-[0_28px_60px_-36px_rgba(15,23,42,0.34)]';
  const mobileCardIconClass =
    'portal-mobile-highlight-ring inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-100 bg-white/90 text-blue-700 shadow-sm transition duration-300 group-hover:border-blue-200 group-hover:bg-white';
  const mobileCardArrowClass =
    'portal-mobile-highlight-ring inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-blue-700 shadow-sm transition duration-300 group-hover:translate-x-0.5 group-hover:border-blue-200 group-hover:bg-blue-50 group-active:bg-blue-50';
  const activeListingCount = portalProperties.length;
  const verifiedListingCount = portalProperties.filter((item) => item.verified).length;
  const readyToMoveCount = portalProperties.filter((item) => item.readyToMove).length;
  const trackedMicroMarketCount = new Set(
    portalProperties.map((item) => `${item.city.toLowerCase()}::${item.location.toLowerCase()}`)
  ).size;
  const marketWatchCount = portalProperties.filter(
    (item) => item.category === 'projects' || item.category === 'new-launch'
  ).length;
  const recentCitySignals = useMemo(
    () =>
      Array.from(
        new Set(
          recentlyViewed
            .map((item) => item.city.trim())
            .filter(Boolean)
            .map((item) => item.toLowerCase())
        )
      ),
    [recentlyViewed]
  );
  const recentCategorySignals = useMemo(
    () => Array.from(new Set(recentlyViewed.map((item) => item.category))),
    [recentlyViewed]
  );
  const savedSearchTokens = useMemo(
    () =>
      savedSearches.flatMap((search) =>
        extractCriteriaTokens(search.criteria as Record<string, unknown>)
      ),
    [savedSearches]
  );
  const favoriteCitySignals = useMemo(
    () =>
      Array.from(
        new Set(
          favoriteListings
            .map((item) => item.city.trim())
            .filter(Boolean)
            .map((item) => item.toLowerCase())
        )
      ),
    [favoriteListings]
  );
  const recentlyViewedSet = useMemo(
    () => new Set(recentlyViewed.map((item) => item.referenceId.toLowerCase())),
    [recentlyViewed]
  );
  const trustCounters = useMemo(
    () => [
      {
        key: 'live-listings',
        label: 'Live inventory',
        value: `${activeListingCount}`,
        note: `${trackedMicroMarketCount} tracked micro-markets across active listings.`,
        tone: 'blue' as const,
        icon: <Home className="h-5 w-5" />,
      },
      {
        key: 'verified-inventory',
        label: 'Verified now',
        value: `${verifiedListingCount}`,
        note: 'Trust-screened listings with higher buyer confidence.',
        tone: 'emerald' as const,
        icon: <ShieldCheck className="h-5 w-5" />,
      },
      {
        key: 'ready-inventory',
        label: 'Ready to move',
        value: `${readyToMoveCount}`,
        note: 'Inventory you can shortlist for immediate action.',
        tone: 'amber' as const,
        icon: <Clock3 className="h-5 w-5" />,
      },
      {
        key: 'growth-corridors',
        label: 'Growth watch',
        value: `${marketWatchCount}`,
        note: 'Projects and new launches concentrated in expansion corridors.',
        tone: 'slate' as const,
        icon: <TrendingUp className="h-5 w-5" />,
      },
    ],
    [activeListingCount, marketWatchCount, readyToMoveCount, trackedMicroMarketCount, verifiedListingCount]
  );
  const recommendationContext = useMemo(() => {
    const parts: string[] = [];
    if (recentlyViewed.length > 0) parts.push(`${recentlyViewed.length} recent views`);
    if (savedSearches.length > 0) parts.push(`${savedSearches.length} saved searches`);
    if (favoriteListings.length > 0) parts.push(`${favoriteListings.length} favorites`);
    if (parts.length === 0) {
      return 'Verified picks curated from current platform momentum.';
    }
    return `Built from ${parts.join(', ')} and trust-screened inventory.`;
  }, [favoriteListings.length, recentlyViewed.length, savedSearches.length]);
  const sellerWorkspaceCards = useMemo(
    () => [
      {
        key: 'owner-dashboard',
        title: 'Owner Dashboard',
        subtitle: 'Track plan access, portfolio health, and monetization progress.',
        icon: LayoutDashboard,
        action: props.onOpenDashboard,
      },
      {
        key: 'owner-listings',
        title: 'Manage Listings',
        subtitle: 'Control sale inventory, boosts, and visibility from one place.',
        icon: Home,
        action: props.onOpenOwnerListings,
      },
      {
        key: 'owner-leads',
        title: 'Lead Desk',
        subtitle: 'Work buyer intent, calls, and follow-ups from a central queue.',
        icon: Users,
        action: props.onOpenOwnerLeads,
      },
      {
        key: 'owner-analytics',
        title: 'Performance Analytics',
        subtitle: 'See views, leads, conversion, and revenue momentum.',
        icon: TrendingUp,
        action: props.onOpenOwnerAnalytics,
      },
    ],
    [props.onOpenDashboard, props.onOpenOwnerAnalytics, props.onOpenOwnerLeads, props.onOpenOwnerListings]
  );
  const commandCenterCards = useMemo(
    () => [
      {
        key: 'favorites',
        label: 'Favorites',
        value: favoriteListings.length,
        note:
          favoriteListings.length > 0
            ? `${favoriteListings[0]?.city || 'Shortlist'} is still your strongest saved cluster.`
            : 'Start building a shortlist from verified listings.',
        icon: <Home className="h-5 w-5" />,
        action: props.onOpenFavorites,
        ctaLabel: 'Open Favorites',
      },
      {
        key: 'saved-searches',
        label: 'Saved Searches',
        value: savedSearches.length,
        note:
          savedSearches.length > 0
            ? `${savedSearches[0]?.label || 'Your top shortcut'} is ready to reuse.`
            : 'Save filters to turn the marketplace into a faster workflow.',
        icon: <Search className="h-5 w-5" />,
        action: props.onOpenSavedSearches,
        ctaLabel: 'Manage Searches',
      },
      {
        key: 'compare',
        label: 'Compare Tray',
        value: compareCount,
        note:
          compareCount > 0
            ? `${compareCount} listings are waiting in your decision tray.`
            : 'Add properties to compare pricing, size, and trust signals side by side.',
        icon: <GitCompareArrows className="h-5 w-5" />,
        action: props.onOpenCompare,
        ctaLabel: 'Open Compare',
      },
      {
        key: 'alerts',
        label: 'Unread Alerts',
        value: unreadNotificationCount,
        note:
          unreadNotificationCount > 0
            ? 'Fresh actions and reminder signals are waiting for review.'
            : 'Notification center is clear right now.',
        icon: <Bell className="h-5 w-5" />,
        action: props.onOpenNotifications,
        ctaLabel: 'Open Alerts',
      },
    ],
    [
      compareCount,
      favoriteListings,
      props.onOpenCompare,
      props.onOpenFavorites,
      props.onOpenNotifications,
      props.onOpenSavedSearches,
      savedSearches,
      unreadNotificationCount,
    ]
  );
  const advancedToolCards = useMemo(
    () => [
      {
        key: 'compare-suite',
        title: 'Compare live decisions',
        value: compareCount > 0 ? `${compareCount} active` : 'Compare ready',
        description:
          compareCount > 0
            ? 'Your decision tray is already holding listings for side-by-side review.'
            : 'Use compare to line up price, size, trust signals, and next actions before calling.',
        icon: <GitCompareArrows className="h-5 w-5" />,
        ctaLabel: 'Open Compare',
        action: props.onOpenCompare,
      },
      {
        key: 'search-memory',
        title: 'Reuse buyer intent',
        value: savedSearches.length > 0 ? `${savedSearches.length} saved` : 'No saved filters',
        description:
          savedSearches.length > 0
            ? 'Saved filters are ready to reopen across buy, rent, and project discovery.'
            : 'Turn search behaviour into a repeatable workflow with saved filters.',
        icon: <Search className="h-5 w-5" />,
        ctaLabel: 'Saved Searches',
        action: props.onOpenSavedSearches,
      },
      {
        key: 'area-intelligence',
        title: 'Watch locality movement',
        value: `${portalTrendLocalities.length} tracked`,
        description:
          'Use growth-corridor and locality signals before you shortlist or schedule site visits.',
        icon: <Compass className="h-5 w-5" />,
        ctaLabel: 'Open Insights',
        action: props.onOpenAreaInsights,
      },
      {
        key: 'seller-revenue',
        title: 'Seller revenue workspace',
        value: props.isAuthenticated ? 'Owner tools live' : 'Login required',
        description: props.isAuthenticated
          ? 'Owner analytics, listing control, and lead monetization are available from one workspace.'
          : 'Login to access seller analytics, premium visibility tools, and lead operations.',
        icon: <LayoutDashboard className="h-5 w-5" />,
        ctaLabel: props.isAuthenticated ? 'Owner Analytics' : 'Login',
        action: props.isAuthenticated ? props.onOpenOwnerAnalytics : props.onOpenLogin,
      },
    ],
    [
      compareCount,
      props.isAuthenticated,
      props.onOpenAreaInsights,
      props.onOpenCompare,
      props.onOpenLogin,
      props.onOpenOwnerAnalytics,
      props.onOpenSavedSearches,
      savedSearches.length,
    ]
  );
  const recommendedListings = useMemo(() => {
    const searchText = savedSearchTokens.join(' ');

    return portalProperties
      .map((property) => {
        let score = 0;
        const reasons: string[] = [];
        const propertyText = `${property.title} ${property.location} ${property.city} ${property.projectName}`.toLowerCase();

        if (property.verified) {
          score += 2;
          reasons.push('Verified inventory');
        }
        if (property.readyToMove) {
          score += 1;
          reasons.push('Ready-to-move option');
        }
        if (recentCitySignals.includes(property.city.toLowerCase())) {
          score += 4;
          reasons.push(`Matches your recent ${property.city} browsing`);
        }
        if (recentCategorySignals.includes(property.category)) {
          score += 3;
          reasons.push(`Aligned with ${formatPortalCategoryLabel(property.category)} interest`);
        }
        if (favoriteCitySignals.includes(property.city.toLowerCase())) {
          score += 3;
          reasons.push('Similar to your saved shortlist');
        }
        if (
          searchText &&
          savedSearchTokens.some((token) => token.length > 2 && propertyText.includes(token))
        ) {
          score += 5;
          reasons.push('Matches your saved search filters');
        }
        if (props.userRole === 'admin' && (property.category === 'projects' || property.category === 'new-launch')) {
          score += 2;
          reasons.push('Strong builder-side opportunity');
        }
        if (props.userRole === 'team_member' && property.featured) {
          score += 1;
          reasons.push('Featured for faster follow-up');
        }

        return {
          property,
          score,
          reasons: reasons.slice(0, 2),
        };
      })
      .filter((item) => !recentlyViewedSet.has(item.property.referenceId.toLowerCase()))
      .sort((left, right) => right.score - left.score || Number(right.property.featured) - Number(left.property.featured))
      .slice(0, 4);
  }, [
    favoriteCitySignals,
    props.userRole,
    recentCategorySignals,
    recentCitySignals,
    recentlyViewedSet,
    savedSearchTokens,
  ]);
  const marketFocusCards = useMemo(
    () => [
      {
        key: 'verified',
        title: 'Verified supply is leading',
        note: `${verifiedListingCount}/${activeListingCount} live listings are trust-screened right now.`,
        ctaLabel: 'Explore Buy',
        action: () => props.onOpenBuy(),
      },
      {
        key: 'ready',
        title: 'Ready inventory remains active',
        note: `${readyToMoveCount} listings can move buyers from search to site-visit quickly.`,
        ctaLabel: 'Open Projects',
        action: () => props.onOpenProjects(),
      },
      {
        key: 'infra',
        title: 'Growth corridors need monitoring',
        note: `${portalTrendLocalities.length} locality watch zones line up with current project momentum.`,
        ctaLabel: props.onOpenInfrastructure ? 'Track Infra' : 'Open Insights',
        action: () => {
          if (props.onOpenInfrastructure) {
            props.onOpenInfrastructure();
            return;
          }
          props.onOpenInsightsMarket();
        },
      },
    ],
    [
      activeListingCount,
      props,
      readyToMoveCount,
      verifiedListingCount,
    ]
  );
  const mobileDealerStats: MobileDealerStat[] = [
    {
      key: 'views-today',
      label: 'Views today',
      value: `${activeListingCount * 18}+`,
      note: 'Featured inventory is pulling fresh eyeballs.',
      icon: Eye,
      action: (homeProps) => homeProps.onOpenOwnerAnalytics(),
      cardClassName:
        'border-blue-200 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.2),transparent_42%),linear-gradient(180deg,#ffffff,#eef5ff)]',
      iconClassName: 'bg-blue-600 text-white shadow-[0_18px_30px_-22px_rgba(37,99,235,0.8)]',
    },
    {
      key: 'messages',
      label: 'Messages',
      value: `${Math.max(verifiedListingCount + 2, 9)}`,
      note: 'Buyer replies are waiting for a fast follow-up.',
      icon: MessageCircle,
      action: (homeProps) => homeProps.onOpenMessages(),
      cardClassName:
        'border-cyan-200 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_42%),linear-gradient(180deg,#ffffff,#ecfeff)]',
      iconClassName: 'bg-cyan-500 text-white shadow-[0_18px_30px_-22px_rgba(6,182,212,0.8)]',
    },
    {
      key: 'leads',
      label: 'Leads',
      value: `${featuredListings.length * 2 + 3}`,
      note: 'High-intent buyers are active in your target zones.',
      icon: Users,
      action: (homeProps) => homeProps.onOpenOwnerLeads(),
      cardClassName:
        'border-orange-200 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.18),transparent_42%),linear-gradient(180deg,#ffffff,#fff7ed)]',
      iconClassName: 'bg-orange-500 text-white shadow-[0_18px_30px_-22px_rgba(249,115,22,0.8)]',
    },
    {
      key: 'active-listings',
      label: 'Active listings',
      value: `${activeListingCount}`,
      note: `${readyToMoveCount} ready to move and ${verifiedListingCount} verified live.`,
      icon: Home,
      action: (homeProps) => homeProps.onOpenOwnerListings(),
      cardClassName:
        'border-emerald-200 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_42%),linear-gradient(180deg,#ffffff,#ecfdf5)]',
      iconClassName: 'bg-emerald-500 text-white shadow-[0_18px_30px_-22px_rgba(16,185,129,0.8)]',
    },
  ];

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

    getSponsoredListings({ placement: 'portal_home', limit: 6 })
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
  }, []);

  useEffect(() => {
    if (!props.isAuthenticated) {
      setFeedbackDialogOpen(false);
      return;
    }
    if (!feedbackContext.trim() && typeof window !== 'undefined') {
      setFeedbackContext(window.location.pathname || '/');
    }
  }, [feedbackContext, props.isAuthenticated]);

  useEffect(() => {
    const syncRecentlyViewed = () => setRecentlyViewed(readRecentlyViewedPortalListings());
    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== 'zdt_portal_recently_viewed_v1') return;
      syncRecentlyViewed();
    };

    syncRecentlyViewed();
    window.addEventListener('storage', handleStorage);
    window.addEventListener(RECENTLY_VIEWED_PORTAL_CHANGED_EVENT, syncRecentlyViewed);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(RECENTLY_VIEWED_PORTAL_CHANGED_EVENT, syncRecentlyViewed);
    };
  }, []);

  useEffect(() => {
    const syncSavedSearches = () => setSavedSearches(readSavedSearches());
    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== 'zdt_saved_searches') return;
      syncSavedSearches();
    };

    syncSavedSearches();
    window.addEventListener('storage', handleStorage);
    window.addEventListener(SAVED_SEARCHES_CHANGED_EVENT, syncSavedSearches);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(SAVED_SEARCHES_CHANGED_EVENT, syncSavedSearches);
    };
  }, []);

  useEffect(() => {
    const syncFavorites = () => setFavoriteListings(readFavoriteListings());
    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== 'zdt_favorite_listings') return;
      syncFavorites();
    };

    syncFavorites();
    window.addEventListener('storage', handleStorage);
    window.addEventListener(FAVORITES_CHANGED_EVENT, syncFavorites);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(FAVORITES_CHANGED_EVENT, syncFavorites);
    };
  }, []);

  useEffect(() => {
    const syncCompare = () => setCompareCount(readComparedListings().length);
    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== 'zdt_compared_listings') return;
      syncCompare();
    };

    syncCompare();
    window.addEventListener('storage', handleStorage);
    window.addEventListener(COMPARE_CHANGED_EVENT, syncCompare);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(COMPARE_CHANGED_EVENT, syncCompare);
    };
  }, []);

  useEffect(() => {
    const syncNotifications = () => {
      setRecentNotifications(readNotifications().slice(0, 3));
      setUnreadNotificationCount(getUnreadNotificationCount());
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== 'zdt_notifications') return;
      syncNotifications();
    };

    syncNotifications();
    window.addEventListener('storage', handleStorage);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, syncNotifications);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, syncNotifications);
    };
  }, []);

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

  const openFeedbackDialog = () => {
    if (typeof window !== 'undefined' && !feedbackContext.trim()) {
      setFeedbackContext(window.location.pathname || '/');
    }
    setShowFeedbackHint(false);
    setFeedbackDialogOpen(true);
  };

  const submitFeedback = async () => {
    const message = feedbackMessage.trim();
    if (message.length < 10) {
      toast.error('Please add at least 10 characters of feedback.');
      return;
    }

    setIsSubmittingFeedback(true);
    try {
      const opened = await apiRequest<{ conversation?: { id?: number } }>(
        '/chat/conversations/team',
        {
          method: 'POST',
          body: JSON.stringify({ subject: 'Product Feedback' }),
        }
      );
      const conversationId = Number(opened.conversation?.id || 0);
      if (!Number.isInteger(conversationId) || conversationId <= 0) {
        throw new Error('Unable to open feedback channel right now.');
      }

      const payload = [
        `Feedback type: ${feedbackType}`,
        feedbackContext.trim() ? `Page: ${feedbackContext.trim()}` : '',
        props.userName ? `User: ${props.userName}` : '',
        '',
        message,
      ]
        .filter(Boolean)
        .join('\n');

      await apiRequest(`/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body: payload }),
      });

      setFeedbackDialogOpen(false);
      setFeedbackType('bug');
      setFeedbackMessage('');
      if (typeof window !== 'undefined') {
        setFeedbackContext(window.location.pathname || '/');
      }
      toast.success('Feedback submitted. Thank you.');
    } catch (submitError) {
      toast.error(
        submitError instanceof Error
          ? submitError.message
          : 'Unable to submit feedback right now.'
      );
    } finally {
      setIsSubmittingFeedback(false);
    }
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

  const handleContinueBrowsingPillClick = (pill: string) => {
    const label = String(pill || '').trim();
    if (!label) return;

    if (/^buy in /i.test(label)) {
      const location = label.replace(/^buy in /i, '').trim();
      const directionalMatch = /^(.+?)\s+(east|west|north|south)$/i.exec(location);
      if (directionalMatch) {
        props.onOpenBuy({
          city: directionalMatch[1].trim(),
          locality: directionalMatch[2].trim(),
        });
        return;
      }
      props.onOpenBuy({ city: location });
      return;
    }

    if (/^explore /i.test(label)) {
      const location = label.replace(/^explore /i, '').trim();
      if (location && location.toLowerCase() !== 'new city') {
        setQuery(location);
      }
      props.onOpenAreaInsights();
      return;
    }

    setQuery(label);
  };

  const handleSmartSearch = () => {
    const text = query.trim();
    if (!text) {
      props.onOpenBuy();
      return;
    }

    const normalized = text.toLowerCase();
    const localityMatch = portalProperties.find((item) => item.location.toLowerCase().includes(normalized));
    if (localityMatch) {
      props.onOpenBuy({
        city: localityMatch.city,
        locality: localityMatch.location,
      });
      return;
    }

    const cityMatch = portalProperties.find((item) => item.city.toLowerCase().includes(normalized));
    if (cityMatch) {
      props.onOpenBuy({ city: cityMatch.city });
      return;
    }

    props.onOpenBuy();
  };

  const handleSearchSuggestionSelect = (property: PortalProperty) => {
    setQuery(property.title);
    upsertRecentlyViewedPortalListing(createRecentlyViewedPortalListingFromProperty(property));
    void trackPropertyInteraction({
      referenceId: property.referenceId,
      action: 'click',
      context: 'portal_home_search_suggestion',
    });
    props.onOpenPropertyDetails(property.referenceId);
  };

  const openPropertyDetails = (property: PortalProperty, context = 'portal_home') => {
    upsertRecentlyViewedPortalListing(createRecentlyViewedPortalListingFromProperty(property));
    void trackPropertyInteraction({
      referenceId: property.referenceId,
      action: 'click',
      context,
    });
    props.onOpenPropertyDetails(property.referenceId);
  };

  const openRecentlyViewedDetails = (item: RecentlyViewedPortalListing) => {
    upsertRecentlyViewedPortalListing(item);
    props.onOpenPropertyDetails(item.referenceId);
  };

  const renderRecentActivityCard = (item: RecentlyViewedPortalListing) => (
    <article
      key={`recently-viewed-${item.referenceId}`}
      className={`${mobileCardShellClass} min-h-[204px] p-4`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-14 w-16 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <img src={item.image} alt={item.title} className="h-full w-full object-cover" loading="lazy" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              {formatPortalCategoryLabel(item.category)}
            </p>
            <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">{item.title}</h3>
          </div>
        </div>
        <span className={mobileCardArrowClass}>
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {item.verified ? (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
            Verified
          </span>
        ) : null}
        <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-700">
          {formatRelativeViewedTime(item.viewedAt)}
        </span>
      </div>

      <p className="mt-3 inline-flex items-center gap-1 text-xs text-slate-600">
        <MapPin className="h-3.5 w-3.5 text-blue-700" />
        {item.location}, {item.city}
      </p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{item.description}</p>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-bold text-slate-900">{item.priceLabel}</p>
          <p className="truncate text-[11px] text-slate-500">{item.projectName || 'Recently opened listing'}</p>
        </div>
        <Button
          type="button"
          className="h-9 rounded-full bg-blue-700 px-3 text-[11px] text-white hover:bg-blue-800"
          onClick={() => openRecentlyViewedDetails(item)}
        >
          Reopen
        </Button>
      </div>
    </article>
  );

  const renderRecommendedCard = (property: PortalProperty, reasons: string[]) => (
    <div key={`recommended-${property.referenceId}`} className="w-[320px] shrink-0 space-y-3 sm:w-[340px]">
      <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-700">Why this matches</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {reasons.length > 0 ? (
            reasons.map((reason) => (
              <span
                key={`${property.referenceId}-${reason}`}
                className="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-blue-700"
              >
                {reason}
              </span>
            ))
          ) : (
            <span className="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-blue-700">
              Platform momentum pick
            </span>
          )}
        </div>
      </div>
      <PropertyListingCard
        property={property}
        onOpenDetails={() => openPropertyDetails(property, 'portal_home_recommended')}
        onOpenMessages={props.onOpenMessages}
      />
    </div>
  );

  const renderFeatureFlashCard = (
    feature: FeatureCard,
    options?: { subdued?: boolean; compact?: boolean }
  ) => {
    const isSubdued = options?.subdued ?? false;
    const isCompact = options?.compact ?? false;
    const hasQuickActions = Boolean(feature.quickActions && feature.quickActions.length > 0);
    const sizeClass = isCompact
      ? hasQuickActions
        ? 'h-full min-h-[188px]'
        : 'h-full min-h-[168px]'
      : hasQuickActions
        ? 'h-full min-h-[220px]'
        : feature.group === 'high-impact'
          ? 'h-full min-h-[192px]'
          : 'h-full min-h-[168px]';
    const densityClass = isCompact ? 'p-4' : feature.group === 'service' ? 'p-4 lg:p-5' : 'p-4 lg:p-5';
    const toneClass = isSubdued
      ? 'border-slate-200 bg-[linear-gradient(180deg,#fbfdff,#ffffff)] opacity-85'
      : feature.group === 'high-impact'
        ? 'border-blue-100 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_38%),linear-gradient(180deg,#ffffff,#f7fbff)]'
        : feature.group === 'coming-soon-ai'
          ? 'border-amber-200 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.18),transparent_32%),linear-gradient(180deg,#fffaf0,#ffffff)]'
          : 'border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_40%),linear-gradient(180deg,#ffffff,#f8fbff)]';
    const cardClass = `${mobileCardShellClass} ${sizeClass} ${densityClass} ${toneClass}`;
    const hasPrimaryAction = Boolean(feature.action);

    return (
      <article
        key={feature.key}
        className={`${cardClass} ${hasPrimaryAction ? 'cursor-pointer' : ''}`.trim()}
        role={hasPrimaryAction ? 'button' : undefined}
        tabIndex={hasPrimaryAction ? 0 : undefined}
        onClick={() => feature.action?.(props)}
        onKeyDown={(event) => {
          if (!hasPrimaryAction) return;
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          feature.action?.(props);
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className={mobileCardIconClass}>
            <feature.icon className="h-5 w-5" />
          </div>
          {feature.comingSoon ? (
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">
              Coming Soon
            </span>
          ) : hasPrimaryAction ? (
            <span className={mobileCardArrowClass}>
              <ArrowRight className="h-4 w-4" />
            </span>
          ) : null}
        </div>
        <h3 className={`${isCompact ? 'mt-3 text-[15px]' : 'mt-3 text-base'} font-semibold leading-snug text-slate-900`}>
          {feature.title}
        </h3>
        <p className={`${isCompact ? 'mt-1.5 text-[12px] leading-5' : 'mt-1 text-xs'} ${isCompact ? 'line-clamp-3' : ''} text-slate-600`}>
          {feature.subtitle}
        </p>

        {feature.quickActions && feature.quickActions.length > 0 ? (
          <div className={`${isCompact ? 'mt-3 gap-1.5' : 'mt-3 gap-2'} flex flex-wrap`}>
            {feature.quickActions.map((quickAction) => (
              <button
                key={quickAction.key}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  quickAction.action(props);
                }}
                className={`portal-mobile-chip ${isCompact ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1 text-xs'} rounded-full border border-slate-300 bg-white font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700`}
              >
                {quickAction.label}
              </button>
            ))}
          </div>
        ) : null}
      </article>
    );
  };

  const renderFeatureGroupCards = (
    group: FeatureCard['group'],
    options?: { subdued?: boolean }
  ) => {
    const items = featureCards.filter((feature) => feature.group === group);

    return (
      <>
        <div className="grid grid-cols-2 gap-3 sm:hidden">
          {items.map((feature) => (
            <div key={`mobile-${feature.key}`}>
              {renderFeatureFlashCard(feature, { ...options, compact: true })}
            </div>
          ))}
        </div>
        <div className="hidden gap-3 sm:grid sm:grid-cols-2 xl:grid-cols-3">
          {items.map((feature) => renderFeatureFlashCard(feature, options))}
        </div>
      </>
    );
  };

  const renderMobileFeaturedCarouselCard = (property: PortalProperty) => {
    const highlights = [
      property.bhk,
      property.areaLabel,
      property.readyToMove ? 'Ready to Move' : property.status,
    ].filter(Boolean);

    return (
      <article
        key={`mobile-featured-${property.id}`}
        className={`w-[82vw] max-w-[306px] shrink-0 snap-start p-3.5 ${mobileCardShellClass}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm">
            <img
              src={property.image}
              alt={property.title}
              className="h-[78px] w-[104px] object-cover"
              loading="lazy"
            />
          </div>
          <span className={mobileCardArrowClass}>
            <ArrowRight className="h-4 w-4" />
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {property.verified ? (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
              Verified
            </span>
          ) : null}
          {property.isNew ? (
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-blue-700">
              New
            </span>
          ) : null}
        </div>

        <div className="mt-3">
          <h3 className="line-clamp-2 text-[17px] font-semibold leading-snug text-slate-900">{property.title}</h3>
          <p className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-[12px] text-slate-600">
            <MapPin className="h-3.5 w-3.5 text-blue-700" />
            {property.location}, {property.city}
          </p>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {highlights.map((item) => (
            <span
              key={`${property.id}-${item}`}
              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-700"
            >
              {item}
            </span>
          ))}
        </div>

        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-bold text-slate-900">{property.priceLabel}</p>
            <p className="mt-0.5 truncate text-[11px] font-medium text-slate-600">{property.projectName}</p>
          </div>
          <Button
            type="button"
            className="h-9 rounded-full bg-blue-700 px-3 text-[11px] text-white hover:bg-blue-800"
            onClick={() => openPropertyDetails(property, 'portal_home_mobile_featured')}
          >
            View
          </Button>
        </div>

        <p className="mt-2 line-clamp-1 text-[12px] leading-5 text-slate-600">{property.description}</p>
      </article>
    );
  };

  const renderMobilePromotionCard = (promotion: PromotionItem) => {
    return (
      <article
        key={`mobile-promotion-${promotion.id}`}
        className={`w-[82vw] max-w-[306px] shrink-0 snap-start p-3.5 ${mobileCardShellClass}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm">
            <img
              src={promotion.imageUrl || '/images/property-3.jpg'}
              alt={promotion.title}
              className="h-[78px] w-[104px] object-cover"
              loading="lazy"
              onError={(event) => {
                const fallback = '/images/property-3.jpg';
                if (event.currentTarget.src.endsWith(fallback)) return;
                event.currentTarget.src = fallback;
              }}
            />
          </div>
          <span className={mobileCardArrowClass}>
            <ArrowRight className="h-4 w-4" />
          </span>
        </div>

        {promotion.badgeText ? (
          <div className="mt-3">
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-700">
              {promotion.badgeText}
            </span>
          </div>
        ) : null}

        <h3 className="mt-3 line-clamp-2 text-[17px] font-semibold leading-snug text-slate-900">
          {promotion.title}
        </h3>
        <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-slate-600">
          {promotion.subtitle || promotion.description || 'Top listed property promotion.'}
        </p>

        <div className="mt-4">
          <Button
            type="button"
            onClick={() => openPromotionLink(promotion)}
            className="h-9 rounded-full bg-blue-700 px-3 text-[11px] text-white hover:bg-blue-800"
            disabled={!promotion.linkUrl}
          >
            {promotion.ctaLabel || 'Open'}
          </Button>
        </div>
      </article>
    );
  };

  const renderMobileDiscoverCard = (card: (typeof discoverCards)[number]) => (
    <button
      key={`mobile-discover-${card.key}`}
      type="button"
      onClick={() => card.action(props)}
      className={`${mobileCardShellClass} p-4`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={mobileCardIconClass}>
          <card.icon className="h-5 w-5" />
        </div>
        <span className={mobileCardArrowClass}>
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
      <h2 className="mt-4 text-[17px] font-semibold leading-snug text-slate-900">{card.title}</h2>
      <p className="mt-1.5 text-[12px] leading-5 text-slate-600">{card.subtitle}</p>
    </button>
  );

  const renderMarketSnapshotSection = () => (
    <section className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
      <div className="portal-mobile-panel rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fbff)] p-5 shadow-sm sm:p-6">
        <SectionHeader
          eyebrow="Trending Localities"
          title="Micro-markets buyers keep circling back to"
          description="Strong trust, active search intent, and current platform activity make these areas worth a closer look."
        />

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {portalTrendLocalities.map((locality) => (
            <button
              key={locality.id}
              type="button"
              onClick={() => props.onOpenBuy(locality.filters)}
              className={`${mobileCardShellClass} h-full min-h-[204px] p-4 text-left`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className={mobileCardIconClass}>
                  <Target className="h-5 w-5" />
                </div>
                <span className={mobileCardArrowClass}>
                  <ArrowUpRight className="h-4 w-4" />
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-700">
                  {locality.demandLabel}
                </span>
              </div>

              <h3 className="mt-3 text-lg font-semibold text-slate-900">
                {locality.locality}, {locality.city}
              </h3>
              <p className="mt-1 text-sm font-semibold text-slate-900">{locality.averageTicket}</p>
              <p className="mt-2 text-xs leading-5 text-slate-600">{locality.momentum}</p>
              <p className="mt-3 text-[11px] font-medium text-slate-500">{locality.trustNote}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <section className="portal-mobile-panel rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fbff)] p-5 shadow-sm sm:p-6">
          <SectionHeader
            eyebrow="Market Watch"
            title="Signals worth checking today"
            description="A compact view of supply quality, ready inventory, and infra-linked watch zones."
          />

          <div className="mt-5 grid gap-3">
            {marketFocusCards.map((card) => (
              <button
                key={card.key}
                type="button"
                onClick={card.action}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{card.title}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{card.note}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-700">
                    {card.ctaLabel}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <RecentVerifiedUpdates limit={4} />
      </div>
    </section>
  );

  return (
    <main className="portal-mobile-page pb-32 pt-20 text-slate-900 sm:pb-16 sm:pt-24 xl:pt-24">
      <div className="portal-mobile-stack page-container !max-w-none space-y-4 sm:space-y-6">
        <section className="sticky top-[72px] z-30 sm:hidden">
          <div className="portal-mobile-panel rounded-[28px] border border-slate-200/90 bg-white/92 p-3 shadow-[0_22px_46px_-32px_rgba(15,23,42,0.38)] backdrop-blur-xl">
            <p className="portal-mobile-kicker mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">
              Smart Search
            </p>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleSmartSearch();
                    }
                  }}
                  placeholder="Search by location, project, builder"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:bg-white"
                />
              </div>
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={isLocating}
                className="portal-mobile-chip inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                aria-label="Use current location"
              >
                <MapPin className="h-4 w-4" />
              </button>
              <Button
                type="button"
                onClick={handleSmartSearch}
                className="h-12 rounded-2xl bg-blue-700 px-4 text-white hover:bg-blue-800"
              >
                Go
              </Button>
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => props.onOpenBuy()}
                className="portal-mobile-chip rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-700"
              >
                Buy
              </button>
              <button
                type="button"
                onClick={() => props.onOpenProjects()}
                className="portal-mobile-chip rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-700"
              >
                Projects
              </button>
              <button
                type="button"
                onClick={() => props.onOpenRent()}
                className="portal-mobile-chip rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-700"
              >
                Rent
              </button>
            </div>

            {locationStatus ? <p className="mt-2 text-xs text-slate-600">{locationStatus}</p> : null}

            {searchSuggestions.length > 0 ? (
              <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {searchSuggestions.map((property) => (
                  <button
                    key={`search-suggestion-${property.id}`}
                    type="button"
                    onClick={() => handleSearchSuggestionSelect(property)}
                    className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-3 text-left last:border-b-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{property.title}</p>
                      <p className="truncate text-xs text-slate-600">
                        {property.projectName} · {property.location}, {property.city}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] font-semibold text-blue-700">{property.priceLabel}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleSmartSearch}
                  className="flex w-full items-center justify-between bg-slate-50 px-3 py-3 text-left"
                >
                  <span className="text-sm font-semibold text-slate-900">Search all matching listings</span>
                  <ArrowRight className="h-4 w-4 text-blue-700" />
                </button>
              </div>
            ) : null}
          </div>
        </section>

        <section className="portal-mobile-panel w-full overflow-hidden rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fbff)] shadow-[0_18px_42px_-32px_rgba(15,23,42,0.3)] sm:rounded-3xl sm:bg-white sm:shadow-sm">
          <div className="grid items-stretch gap-3 lg:grid-cols-[1.08fr_0.92fr] lg:gap-0">
            <div className="flex h-full flex-col gap-3 p-4 sm:gap-6 sm:p-6 lg:justify-center lg:p-8">
              <div className="flex flex-wrap items-center gap-2">
                <p className="portal-mobile-kicker text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-700 sm:text-xs sm:tracking-[0.2em]">
                  Welcome {props.userName ? `${props.userName} (${userRoleLabel(props.userRole)})` : 'to ZDT Realty'}
                </p>
                <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700 sm:hidden">
                  {hero.projectName}
                </span>
              </div>
              <h1 className="max-w-[14ch] text-[26px] font-bold leading-[1.08] text-slate-900 sm:text-3xl sm:leading-tight lg:text-4xl">
                {hero.headline}
              </h1>
              <p className="max-w-xl text-[13px] leading-5 text-slate-600 sm:text-sm sm:leading-6">
                {hero.details}
              </p>

              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
                {props.isAuthenticated ? (
                  <>
                    <Button
                      onClick={() => props.onOpenProjects()}
                      className="col-span-2 h-11 rounded-2xl bg-blue-700 px-4 text-white hover:bg-blue-800 sm:h-12 sm:rounded-xl sm:px-5"
                    >
                      {hero.ctaLabel}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11 rounded-2xl px-3 text-sm sm:h-12 sm:rounded-xl sm:px-5"
                      onClick={props.onOpenPostProperty}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Post Property
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11 rounded-2xl px-3 text-sm sm:h-12 sm:rounded-xl sm:px-5"
                      onClick={() => props.onOpenMessages()}
                    >
                      <MessageCircle className="mr-2 h-4 w-4" />
                      Open Messages
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      onClick={props.onOpenLogin}
                      className="h-11 rounded-2xl bg-blue-700 px-4 text-white hover:bg-blue-800 sm:h-12 sm:rounded-xl sm:px-5"
                    >
                      Login
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11 rounded-2xl px-4 sm:h-12 sm:rounded-xl sm:px-5"
                      onClick={props.onOpenRegister}
                    >
                      Register
                    </Button>
                  </>
                )}
              </div>

              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {continueBrowsingPills.map((pill) => (
                  <button
                    key={pill}
                    type="button"
                    onClick={() => handleContinueBrowsingPillClick(pill)}
                    className="portal-mobile-chip inline-flex h-8 shrink-0 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                  >
                    {pill}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative min-h-[172px] overflow-hidden rounded-[24px] border border-slate-200 sm:min-h-[320px] sm:rounded-2xl lg:min-h-full lg:rounded-none lg:border-0">
              <img src={hero.image} alt={hero.projectName} className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/45 to-transparent" />
              <div className="absolute left-3 top-3 sm:hidden">
                <span className="inline-flex rounded-full border border-white/25 bg-slate-950/35 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur">
                  Featured Project
                </span>
              </div>
              <div className="absolute bottom-3 left-3 right-3 rounded-2xl bg-white/92 p-2.5 backdrop-blur sm:bottom-4 sm:left-4 sm:right-4 sm:rounded-xl sm:p-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500 sm:text-xs sm:tracking-[0.18em]">
                  Featured Project
                </p>
                <p className="text-sm font-semibold text-slate-900">{hero.projectName}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-3 sm:space-y-4">
          <SectionHeader
            eyebrow="Trust Pulse"
            title="A richer snapshot of what is live right now"
            description="Platform trust, verified inventory, and growth-corridor momentum in one quick read."
            action={
              <Button variant="outline" className="rounded-xl" onClick={() => props.onOpenBuy()}>
                Open Marketplace
              </Button>
            }
          />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {trustCounters.map((counter) => (
              <InsightMetricCard
                key={counter.key}
                label={counter.label}
                value={counter.value}
                note={counter.note}
                tone={counter.tone}
                icon={counter.icon}
              />
            ))}
          </div>
        </section>

        {recentlyViewed.length > 0 ? (
          <section className="space-y-3 sm:space-y-4">
            <SectionHeader
              eyebrow="Recently Viewed"
              title="Pick up where you left off"
              description="Your last opened properties stay here so you can return without starting the search again."
              action={
                <Button variant="outline" className="rounded-xl" onClick={() => props.onOpenBuy()}>
                  Browse More
                </Button>
              }
            />

            <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {recentlyViewed.slice(0, 4).map((item) => renderRecentActivityCard(item))}
            </div>
          </section>
        ) : null}

        <section className="space-y-3 sm:space-y-4">
          <SectionHeader
            eyebrow="Recommended"
            title="Recommended for you"
            description={recommendationContext}
            action={
              props.isAuthenticated ? (
                <Button variant="outline" className="rounded-xl" onClick={props.onOpenSavedSearches}>
                  Tune Saved Searches
                </Button>
              ) : (
                <Button variant="outline" className="rounded-xl" onClick={() => props.onOpenBuy()}>
                  Explore More Picks
                </Button>
              )
            }
          />

          <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {recommendedListings.map((item) => renderRecommendedCard(item.property, item.reasons))}
          </div>
        </section>

        <section className="space-y-3 sm:space-y-4">
          <SectionHeader
            eyebrow="Advanced Toolkit"
            title="Move faster with buyer and seller control tools"
            description="Compare, saved-intent memory, locality intelligence, and seller monetization should stay close to the browsing flow."
          />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {advancedToolCards.map((card) => (
              <button
                key={card.key}
                type="button"
                onClick={card.action}
                className="portal-mobile-card rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-blue-700">
                    {card.icon}
                  </div>
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-700">
                    {card.ctaLabel}
                  </span>
                </div>
                <p className="mt-4 text-sm font-semibold text-slate-900">{card.title}</p>
                <p className="mt-2 text-[28px] font-bold leading-none text-slate-900">{card.value}</p>
                <p className="mt-3 text-xs leading-5 text-slate-600">{card.description}</p>
              </button>
            ))}
          </div>
        </section>

        {props.isAuthenticated ? (
          <section className="space-y-4">
            <SectionHeader
              eyebrow="Action Center"
              title="Your decision workspace"
              description="A personalized control layer for saved intent, shortlisted listings, and fast next actions."
            />

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {commandCenterCards.map((card) => (
                <button
                  key={card.key}
                  type="button"
                  onClick={card.action}
                  className={`${mobileCardShellClass} min-h-[188px] p-4 text-left`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className={mobileCardIconClass}>{card.icon}</div>
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-700">
                      {card.ctaLabel}
                    </span>
                  </div>
                  <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {card.label}
                  </p>
                  <p className="mt-1 text-[30px] font-bold leading-none text-slate-900">{card.value}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-600">{card.note}</p>
                </button>
              ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
              <div className="portal-mobile-panel rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fbff)] p-5 shadow-sm">
                <SectionHeader
                  eyebrow="Search Shortcuts"
                  title="Saved search memory"
                  description="Your saved filters are becoming a workflow. Reopen or refine them anytime."
                />

                {savedSearches.length > 0 ? (
                  <div className="mt-5 grid gap-3">
                    {savedSearches.slice(0, 3).map((search) => (
                      <button
                        key={search.id}
                        type="button"
                        onClick={props.onOpenSavedSearches}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{search.label}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {formatPortalCategoryLabel(
                                search.targetView === 'rent' ? 'rent' : 'buy'
                              )}{' '}
                              workflow
                            </p>
                          </div>
                          <ArrowRight className="h-4 w-4 text-blue-700" />
                        </div>
                        <p className="mt-3 text-xs leading-5 text-slate-600">
                          Saved on{' '}
                          {new Date(search.createdAt).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                          . Open your saved-search workspace to apply or edit this shortcut.
                        </p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                    No saved searches yet. Save filters from Buy or Rent to create a shortcut system here.
                  </div>
                )}
              </div>

              <div className="portal-mobile-panel rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fbff)] p-5 shadow-sm">
                <SectionHeader
                  eyebrow="Alert Feed"
                  title="What needs your attention"
                  description="Recent reminders and activity signals from your notification center."
                />

                {recentNotifications.length > 0 ? (
                  <div className="mt-5 grid gap-3">
                    {recentNotifications.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={props.onOpenNotifications}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                            <p className="mt-1 text-xs leading-5 text-slate-600">{item.message || 'Open notifications to review the full update.'}</p>
                          </div>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                              item.isRead
                                ? 'border border-slate-200 bg-slate-50 text-slate-500'
                                : 'border border-blue-200 bg-blue-50 text-blue-700'
                            }`}
                          >
                            {item.isRead ? 'Read' : 'Unread'}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                    No alerts yet. Saved searches, favorites, and marketplace actions will start showing up here.
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : null}

        {props.isAuthenticated ? (
          <section className="space-y-3 sm:space-y-4">
            <SectionHeader
              eyebrow="Dealer Pulse"
              title="Quick stats that push deals"
              action={
                <button
                  type="button"
                  onClick={props.onOpenDashboard}
                  className="portal-mobile-chip rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700"
                >
                  Open Dashboard
                </button>
              }
            />

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {mobileDealerStats.map((stat) => (
                <button
                  key={stat.key}
                  type="button"
                  onClick={() => stat.action(props)}
                  aria-label={`Open ${stat.label}`}
                  className={`${mobileCardShellClass} min-h-[156px] p-4 sm:min-h-[176px]`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className={mobileCardIconClass}>
                      <stat.icon className="h-5 w-5" />
                    </div>
                    <span className={mobileCardArrowClass}>
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                  <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {stat.label}
                  </p>
                  <p className="mt-1 text-[28px] font-bold leading-none text-slate-900">{stat.value}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-600">{stat.note}</p>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section className="space-y-2.5 sm:hidden">
          <div className="flex items-end justify-between">
            <div>
              <p className="portal-mobile-kicker text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">
                Featured Listings
              </p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">Swipe-ready deal picks</h2>
            </div>
            <span className="portal-mobile-chip rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-700">
              Swipe
            </span>
          </div>

          <div className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {featuredListings.map((property) => renderMobileFeaturedCarouselCard(property))}
          </div>
        </section>

        {props.isAuthenticated ? (
          <section>
            <div className="portal-mobile-panel portal-mobile-panel-warm overflow-hidden rounded-[30px] border border-orange-200 bg-[radial-gradient(circle_at_top_right,rgba(251,146,60,0.18),transparent_34%),linear-gradient(180deg,#fffaf5,#ffffff)] p-4 shadow-[0_24px_50px_-34px_rgba(249,115,22,0.45)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="portal-mobile-kicker text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-600">
                    Hot Buyer Leads
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">Lead alerts that create urgency</h2>
                  <p className="mt-1 text-sm leading-5 text-slate-600">
                    High-intent demand signals you can call back right now.
                  </p>
                </div>
                <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-[0_18px_32px_-22px_rgba(249,115,22,0.8)]">
                  <Flame className="h-5 w-5" />
                </div>
              </div>

              <div className="-mx-1 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {mobileHotLeads.map((lead) => {
                  const contact = getPortalPropertyContact(lead.referenceId);

                  return (
                    <article
                      key={lead.id}
                      className={`w-[82vw] max-w-[306px] shrink-0 snap-start p-4 sm:w-auto sm:max-w-none sm:shrink sm:min-h-[260px] ${mobileCardShellClass}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className={mobileCardIconClass}>
                          <Flame className="h-5 w-5" />
                        </div>
                        <span className={mobileCardArrowClass}>
                          <ArrowRight className="h-4 w-4" />
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-orange-700">
                          {lead.tag}
                        </span>
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                          {lead.urgency}
                        </span>
                      </div>

                      <h3 className="mt-3 text-[17px] font-semibold leading-snug text-slate-900">
                        {lead.requirement}
                      </h3>
                      <p className="mt-1 text-[12px] leading-5 text-slate-600">{lead.note}</p>

                      <div className="mt-3 space-y-2">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                            Location
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">{lead.location}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                            Budget
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">{lead.budget}</p>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          onClick={() => {
                            const opened = openPhoneDialer(contact.phone);
                            if (!opened) {
                              props.onOpenMessages(lead.referenceId);
                              toast.info('Phone number unavailable. Opened in-app chat.');
                            }
                          }}
                          className="h-10 rounded-full bg-slate-900 text-white hover:bg-slate-800"
                        >
                          <PhoneCall className="mr-2 h-4 w-4" />
                          Call
                        </Button>
                        <button
                          type="button"
                          onClick={() => props.onOpenMessages(lead.referenceId)}
                          className="inline-flex h-10 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
                        >
                          <MessageCircle className="mr-2 h-4 w-4 text-blue-700" />
                          Message
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        ) : null}

        {sponsoredPortalProperties.length > 0 ? (
          <section className="space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Sponsored Listings</h2>
                <p className="text-sm text-slate-600">
                  Paid seller placements. Kept separate from organic ranking and admin promotions.
                </p>
              </div>
              <Button variant="outline" className="rounded-xl" onClick={() => props.onOpenBuy()}>
                Explore Market
              </Button>
            </div>

            <div className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2 sm:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {sponsoredPortalProperties.map((property) => renderMobileFeaturedCarouselCard(property))}
            </div>

            <div className="hidden gap-4 md:grid-cols-2 xl:grid-cols-3 sm:grid">
              {sponsoredPortalProperties.map((property) => (
                <PropertyListingCard
                  key={`sponsored-${property.referenceId}`}
                  property={property}
                  onOpenDetails={() => openPropertyDetails(property, 'portal_home_sponsored')}
                  onOpenMessages={props.onOpenMessages}
                />
              ))}
            </div>
          </section>
        ) : null}

        {promotedTopProperties.length > 0 ? (
          <section className="space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Top Listed Properties</h2>
                <p className="text-sm text-slate-600">
                  Main-admin curated property highlights for priority visibility.
                </p>
              </div>
              <Button variant="outline" className="rounded-xl" onClick={() => props.onOpenBuy()}>
                Explore More
              </Button>
            </div>

            <div className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2 sm:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {promotedTopProperties.map(({ promotion, property }) =>
                property ? renderMobileFeaturedCarouselCard(property) : renderMobilePromotionCard(promotion)
              )}
            </div>

            <div className="hidden gap-4 md:grid-cols-2 xl:grid-cols-3 sm:grid">
              {promotedTopProperties.map(({ promotion, property }) => {
                if (property) {
                  return (
                    <PropertyListingCard
                      key={promotion.id}
                      property={property}
                      onOpenDetails={() => openPropertyDetails(property, 'portal_home_promoted')}
                      onOpenMessages={props.onOpenMessages}
                    />
                  );
                }

                return (
                  <article
                    key={promotion.id}
                    className="portal-mobile-card overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
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
            <section className="sm:hidden">
              <div className="grid grid-cols-2 gap-3">
                {discoverCards.map((card) => renderMobileDiscoverCard(card))}
              </div>
            </section>

            <section className="hidden gap-4 md:grid-cols-2 xl:grid-cols-4 sm:grid">
              {discoverCards.map((card) => (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => card.action(props)}
                  className={`${mobileCardShellClass} h-full p-5`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className={mobileCardIconClass}>
                      <card.icon className="h-5 w-5" />
                    </div>
                    <span className={mobileCardArrowClass}>
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                  <h2 className="mt-4 text-lg font-semibold text-slate-900">{card.title}</h2>
                  <p className="mt-1 text-sm text-slate-600">{card.subtitle}</p>
                </button>
              ))}
            </section>

            <section className="portal-mobile-panel hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fbff)] p-4 shadow-sm sm:block sm:p-5">
              <div className="mb-4">
                <p className="portal-mobile-kicker text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">
                  Smart Search
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">Search by project, city, or locality</h2>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search by project, city, locality..."
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white/90 pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:bg-white"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="portal-mobile-chip rounded-full" onClick={props.onOpenNewLaunch}>
                    New Launch
                  </Button>
                  <Button variant="outline" className="portal-mobile-chip rounded-full" onClick={props.onOpenPlotsLand}>
                    Plots/Land
                  </Button>
                  <Button variant="outline" className="portal-mobile-chip rounded-full" onClick={props.onOpenCommercial}>
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

            <section className="portal-mobile-panel space-y-3 rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-blue-50/45 to-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">Quick Search Results</h3>
                <span className="portal-mobile-chip rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  {quickResults.length} Picks
                </span>
              </div>
              <div className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2 sm:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {quickResults.map((property) => renderMobileFeaturedCarouselCard(property))}
              </div>
              <div className="relative hidden sm:block">
                <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-slate-50/95 via-slate-50/70 to-transparent" />
                <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-slate-50/95 via-slate-50/70 to-transparent" />
                <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {quickResults.map((property) => (
                    <div key={`quick-${property.id}`} className="w-[282px] shrink-0 snap-start sm:w-[320px] xl:w-[340px]">
                      <PropertyListingCard
                        property={property}
                        onOpenDetails={() => openPropertyDetails(property, 'portal_home_quick_results')}
                        onOpenMessages={props.onOpenMessages}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="portal-mobile-panel rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fbff)] p-4 shadow-sm sm:p-5">
              <div className="mb-4">
                <p className="portal-mobile-kicker text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">
                  Seller Growth Hub
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">Run the business side of your inventory</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Owner tools for listings, leads, analytics, and subscription-driven visibility.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {sellerWorkspaceCards.map((card) => (
                  <button
                    key={card.key}
                    type="button"
                    onClick={card.action}
                    className={`${mobileCardShellClass} h-full p-5`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className={mobileCardIconClass}>
                        <card.icon className="h-5 w-5" />
                      </div>
                      <span className={mobileCardArrowClass}>
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-slate-900">{card.title}</h3>
                    <p className="mt-1 text-sm text-slate-600">{card.subtitle}</p>
                  </button>
                ))}
              </div>
            </section>

            <section className="hidden space-y-3 rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-blue-50/45 to-white p-4 shadow-sm sm:block">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Featured Listings</h2>
                  <p className="text-sm text-slate-600">Verified picks curated for your activity.</p>
                </div>
                <Button variant="outline" className="rounded-xl" onClick={() => props.onOpenBuy()}>
                  View all
                </Button>
              </div>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-slate-50/95 via-slate-50/70 to-transparent" />
                <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-slate-50/95 via-slate-50/70 to-transparent" />
                <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {featuredListings.map((property) => (
                    <div key={property.id} className="w-[292px] shrink-0 snap-start sm:w-[330px] xl:w-[350px]">
                      <PropertyListingCard
                        property={property}
                        onOpenDetails={() => openPropertyDetails(property, 'portal_home_featured')}
                        onOpenMessages={props.onOpenMessages}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f7fbff)] p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                    Platform Advantage
                  </p>
                  <h2 className="mt-2 text-2xl font-bold text-slate-900">
                    Built for cleaner buyer intent and stronger seller outcomes
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm text-slate-600">
                    Advanced marketplaces do more than list properties. They improve trust,
                    protect leads, and create visible upgrade paths for serious sellers.
                  </p>
                </div>
                <Button variant="outline" className="rounded-xl" onClick={props.onOpenOwnerAnalytics}>
                  Open Owner Analytics
                </Button>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                  <div className="inline-flex rounded-full border border-blue-200 bg-white p-2 text-blue-700">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-slate-900">Lead-Protected Contact</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Contact reveal, chat-first enquiry, and visit intent capture improve seller lead
                    quality instead of leaking raw phone numbers.
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                  <div className="inline-flex rounded-full border border-emerald-200 bg-white p-2 text-emerald-700">
                    <Users className="h-4 w-4" />
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-slate-900">Owner Workspace Value</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Listings, leads, boosts, and analytics should feel like one premium operating
                    system, not disconnected pages.
                  </p>
                </div>
                <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                  <div className="inline-flex rounded-full border border-amber-200 bg-white p-2 text-amber-700">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-slate-900">Revenue Surfaces</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Featured placement, verified trust, and better seller tools turn visibility into a
                    commercial product instead of a free listing utility.
                  </p>
                </div>
              </div>
            </section>

            <section className="portal-mobile-panel w-full rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fbff)] p-4 shadow-sm sm:p-5">
              <div className="mb-4 sm:mb-5">
                <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">Feature Cards</h2>
                <p className="mt-1 text-xs text-slate-600 sm:text-sm">
                  High-impact cards, service cards, and upcoming website features.
                </p>
              </div>

              <div className="space-y-5 sm:space-y-6">
                <div>
                  <p className="portal-mobile-kicker mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700 sm:text-xs sm:tracking-[0.2em]">
                    High-impact flash cards
                  </p>
                  {renderFeatureGroupCards('high-impact')}
                </div>

                <div>
                  <p className="portal-mobile-kicker mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700 sm:text-xs sm:tracking-[0.2em]">
                    Service flash cards
                  </p>
                  {renderFeatureGroupCards('service')}
                </div>

                <div>
                  <p className="portal-mobile-kicker mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700 sm:text-xs sm:tracking-[0.2em]">
                    Coming Soon AI
                  </p>
                  {renderFeatureGroupCards('coming-soon-ai', { subdued: true })}
                </div>

                <div>
                  <p className="portal-mobile-kicker mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700 sm:text-xs sm:tracking-[0.2em]">
                    Coming Soon on Our Website
                  </p>
                  {renderFeatureGroupCards('coming-soon-advance', { subdued: true })}
                </div>
              </div>
            </section>

            {renderMarketSnapshotSection()}
          </>
        ) : (
          <section className="portal-mobile-panel rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fbff)] p-5 shadow-sm sm:p-6">
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

      <div className="fixed inset-x-3 bottom-3 z-[60] sm:hidden">
        <div className="portal-mobile-nav grid grid-cols-4 gap-2 rounded-[28px] border border-slate-200/90 bg-white/95 p-2 shadow-[0_24px_50px_-32px_rgba(15,23,42,0.45)] backdrop-blur-xl">
          <button
            type="button"
            onClick={props.onOpenPostProperty}
            className="portal-mobile-nav-button-primary flex min-h-[60px] flex-col items-center justify-center rounded-[22px] bg-blue-700 px-2 text-center text-white shadow-sm"
          >
            <Plus className="h-4 w-4" />
            <span className="mt-1 text-[11px] font-semibold">Post</span>
          </button>
          <button
            type="button"
            onClick={() => props.onOpenMessages()}
            className="portal-mobile-nav-button flex min-h-[60px] flex-col items-center justify-center rounded-[22px] border border-slate-200 bg-slate-50 px-2 text-center text-slate-700"
          >
            <MessageCircle className="h-4 w-4 text-blue-700" />
            <span className="mt-1 text-[11px] font-semibold">Messages</span>
          </button>
          <button
            type="button"
            onClick={props.onOpenOwnerLeads}
            className="portal-mobile-nav-button flex min-h-[60px] flex-col items-center justify-center rounded-[22px] border border-slate-200 bg-slate-50 px-2 text-center text-slate-700"
          >
            <PhoneCall className="h-4 w-4 text-blue-700" />
            <span className="mt-1 text-[11px] font-semibold">Call Leads</span>
          </button>
          <button
            type="button"
            onClick={props.onOpenDashboard}
            className="portal-mobile-nav-button flex min-h-[60px] flex-col items-center justify-center rounded-[22px] border border-slate-200 bg-slate-50 px-2 text-center text-slate-700"
          >
            <LayoutDashboard className="h-4 w-4 text-blue-700" />
            <span className="mt-1 text-[11px] font-semibold">Dashboard</span>
          </button>
        </div>
      </div>

      {props.isAuthenticated ? (
        <div className="hidden max-w-[280px] flex-col items-end gap-2 sm:fixed sm:bottom-28 sm:right-6 sm:z-50 sm:flex">
          {showFeedbackHint ? (
            <div className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-lg">
              <p className="font-semibold text-slate-900">Help us improve</p>
              <p className="mt-1">Found any bug or difficulty? Tell us what you do not like.</p>
              <button
                type="button"
                onClick={() => setShowFeedbackHint(false)}
                className="mt-2 text-[11px] font-semibold text-blue-700 hover:text-blue-800"
              >
                Dismiss
              </button>
            </div>
          ) : null}
          <Button
            type="button"
            onClick={openFeedbackDialog}
            className="h-10 rounded-full bg-blue-700 px-3.5 text-sm text-white shadow-lg hover:bg-blue-800 sm:h-11 sm:px-4"
          >
            <MessageCircle className="mr-2 h-4 w-4" />
            Feedback
          </Button>
        </div>
      ) : null}

      <Dialog open={feedbackDialogOpen} onOpenChange={setFeedbackDialogOpen}>
        <DialogContent className="max-w-lg border border-slate-200 bg-white">
          <DialogHeader>
            <DialogTitle className="text-slate-900">Share feedback</DialogTitle>
            <DialogDescription className="text-sm text-slate-600">
              Tell us about bugs, difficulty, or anything you want improved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Feedback type
              </label>
              <select
                value={feedbackType}
                onChange={(event) =>
                  setFeedbackType(event.target.value as 'bug' | 'difficulty' | 'suggestion' | 'other')
                }
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400"
              >
                <option value="bug">Bug report</option>
                <option value="difficulty">Difficulty in flow</option>
                <option value="suggestion">Improvement suggestion</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Page / context
              </label>
              <input
                value={feedbackContext}
                onChange={(event) => setFeedbackContext(event.target.value)}
                placeholder="/home"
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                What should we improve?
              </label>
              <Textarea
                value={feedbackMessage}
                onChange={(event) => setFeedbackMessage(event.target.value)}
                placeholder="Tell us what did not work, what you did not like, or what should improve."
                className="min-h-28"
              />
              <p className="text-xs text-slate-500">Minimum 10 characters.</p>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setFeedbackDialogOpen(false)}
                disabled={isSubmittingFeedback}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void submitFeedback()}
                disabled={isSubmittingFeedback}
                className="bg-blue-700 text-white hover:bg-blue-800"
              >
                {isSubmittingFeedback ? 'Submitting...' : 'Submit feedback'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
