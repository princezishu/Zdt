import { Suspense, useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { apiRequest } from './lib/http';
import {
  clearSession,
  parseApiUser,
  readStoredUser,
  readToken,
  saveSession,
  type AuthUser,
} from './lib/session';
import { RoutePageSkeleton } from './components/loading/PageSkeletons';
import Header from './sections/Header';
import Footer from './sections/Footer';
import PortalHomePage from './sections/portal/PortalHomePage';
import BuildingMaterialsPage from './sections/portal/BuildingMaterialsPage';
import ConstructWithUsPage from './sections/portal/ConstructWithUsPage';
import InfrastructureTrackerPage from './sections/InfrastructureTrackerPage';
import MarketplaceListingsPage from './sections/portal/MarketplaceListingsPage';
import PortalPropertyDetailsPage from './sections/portal/PortalPropertyDetailsPage';
import DeveloperPage from './sections/DeveloperPage';
import BuyPage from './sections/BuyPage';
import SellPage from './sections/SellPage';
import RentPage from './sections/RentPage';
import AddProperty from './sections/AddProperty';
import Login from './sections/Login';
import Register from './sections/Register';
import ForgotPassword from './sections/ForgotPassword';
import Dashboard from './sections/Dashboard';
import ProfilePage from './sections/ProfilePage';
import TeamAdminPage from './sections/TeamAdminPage';
import CareerPage from './sections/CareerPage';
import AdminDeskPage from './sections/AdminDeskPage';
import AboutPage from './sections/AboutPage';
import BlogPage from './sections/BlogPage';
import PressPage from './sections/PressPage';
import HelpCenterPage from './sections/HelpCenterPage';
import ContactPage from './sections/ContactPage';
import FaqPage from './sections/FaqPage';
import PrivacyPage from './sections/PrivacyPage';
import TermsPage from './sections/TermsPage';
import CookiesPage from './sections/CookiesPage';
import SecurityPage from './sections/SecurityPage';
import UnsubscribePage from './sections/UnsubscribePage';
import GroupDealsPage from './sections/GroupDealsPage';
import GroupDealDetailPage from './sections/GroupDealDetailPage';
import AdminGroupDealsPage from './sections/AdminGroupDealsPage';
import AdminInfraAddPage from './sections/AdminInfraAddPage';
import AdminInfraManagePage from './sections/AdminInfraManagePage';
import AdminInfraSubscribersPage from './sections/AdminInfraSubscribersPage';
import AdminInfraInboxPage from './sections/AdminInfraInboxPage';
import AdminInfraPreviewPage from './sections/AdminInfraPreviewPage';
import MessagesPage from './sections/MessagesPage';
import FavoritesPage from './sections/FavoritesPage';
import NotificationsPage from './sections/NotificationsPage';
import ComparePage from './sections/ComparePage';
import SavedSearchesPage from './sections/SavedSearchesPage';
import EAuctionPage from './sections/eauction/EAuctionPage';
import DealersDirectoryPage from './sections/dealers/DealersDirectoryPage';
import CompanyProfilePage from './sections/dealers/CompanyProfilePage';
import NewProjectPage from './sections/dealers/NewProjectPage';
import ProjectDetailsPage from './sections/dealers/ProjectDetailsPage';
import BuyMapPage from './sections/buy/BuyMapPage';
import BuyPropertyDetailsPage from './sections/buy/BuyPropertyDetailsPage';
import RentMapPage from './sections/rent/RentMapPage';
import RentDetailsPage from './sections/rent/RentDetailsPage';
import RentShortTermPage from './sections/rent/RentShortTermPage';
import RentCoLivingPage from './sections/rent/RentCoLivingPage';
import SavedRentalsPage from './sections/rent/SavedRentalsPage';
import FloorDetailPage from './sections/layout-units/FloorDetailPage';
import LayoutUnitBuilderPage from './sections/layout-units/LayoutUnitBuilderPage';
import UnitsListPage from './sections/layout-units/UnitsListPage';
import ApartmentComplexPage from './sections/apartment-complex/ApartmentComplexPage';
import InsightsNewsPage from './sections/insights/InsightsNewsPage';
import InsightsMarketPage from './sections/insights/InsightsMarketPage';
import InsightsProjectsPage from './sections/insights/InsightsProjectsPage';
import InsightsComparePage from './sections/insights/InsightsComparePage';
import EarlySupportersPage from './sections/portal/EarlySupportersPage';
import OwnerDashboardPage from './sections/owner/OwnerDashboardPage';
import OwnerAddPropertyPage from './sections/owner/OwnerAddPropertyPage';
import OwnerEditPropertyPage from './sections/owner/OwnerEditPropertyPage';
import OwnerListingsPage from './sections/owner/OwnerListingsPage';
import OwnerRentalsPage from './sections/owner/OwnerRentalsPage';
import OwnerLeadsPage from './sections/owner/OwnerLeadsPage';
import OwnerAnalyticsPage from './sections/owner/OwnerAnalyticsPage';
import OwnerSubscriptionPage from './sections/owner/OwnerSubscriptionPage';
import OwnerPaymentsPage from './sections/owner/OwnerPaymentsPage';
import OwnerProfilePage from './sections/owner/OwnerProfilePage';
import AIChatbotWidget from './components/realty/AIChatbotWidget';
import type { AppView } from './lib/views';
import { trackPropertyInteraction } from './lib/propertyAnalyticsApi';

interface ViewRouteParams {
  companyId?: number | null;
  projectId?: number | null;
  buyPropertyId?: string | null;
  rentalId?: string | null;
  groupDealCode?: string | null;
  ownerPropertyId?: string | null;
  infraPreviewId?: string | null;
}

interface AppRouteResult {
  view: AppView | null;
  companyId: number | null;
  projectId: number | null;
  buyPropertyId: string | null;
  rentalId: string | null;
  groupDealCode: string | null;
  ownerPropertyId: string | null;
  infraPreviewId: string | null;
}

const EMPTY_ROUTE_PARAMS: Omit<AppRouteResult, 'view'> = {
  companyId: null,
  projectId: null,
  buyPropertyId: null,
  rentalId: null,
  groupDealCode: null,
  ownerPropertyId: null,
  infraPreviewId: null,
};

function decodeRouteSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getDefaultPrivateView(user: AuthUser): AppView {
  if (user.role === 'admin') {
    return 'admin-desk';
  }
  if (user.role === 'team_member') {
    return 'team-desk';
  }
  return 'dashboard';
}

function canAccessView(view: AppView, user: AuthUser | null): boolean {
  const authenticatedViews: AppView[] = [
    'dashboard',
    'add-property',
    'sell-property',
    'rent-property',
    'builder-project-new',
    'profile',
    'messages',
    'favorites',
    'saved',
    'compare',
    'notifications',
    'saved-searches',
    'saved-rentals',
    'owner-dashboard',
    'owner-add-property',
    'owner-edit-property',
    'owner-listings',
    'owner-rentals',
    'owner-leads',
    'owner-analytics',
    'owner-subscription',
    'owner-payments',
    'owner-profile',
  ];
  if (
    authenticatedViews.includes(view)
  ) {
    return Boolean(user);
  }
  if (view === 'team-desk') {
    return Boolean(user && (user.role === 'team_member' || user.role === 'admin'));
  }
  const adminViews: AppView[] = [
    'admin-desk',
    'admin-group-deals',
    'admin-infra-add',
    'admin-infra-manage',
    'admin-infra-subscribers',
    'admin-infra-inbox',
    'admin-infra-preview',
    'layout-units-floor-detail',
    'layout-units-builder',
    'layout-units-list',
    'apartment-complex',
  ];
  if (
    adminViews.includes(view)
  ) {
    return Boolean(user && user.role === 'admin');
  }
  return true;
}

function viewFromPathname(pathname: string): AppRouteResult {
  const normalized = pathname.trim().replace(/\/+$/, '') || '/';
  const companyMatch = /^\/dealers-builders\/(\d+)$/.exec(normalized);
  if (companyMatch) {
    return {
      view: 'dealers-builders-company',
      ...EMPTY_ROUTE_PARAMS,
      companyId: Number(companyMatch[1]),
    };
  }
  const projectMatch = /^\/projects\/(\d+)$/.exec(normalized);
  if (projectMatch) {
    return {
      view: 'project-details',
      ...EMPTY_ROUTE_PARAMS,
      projectId: Number(projectMatch[1]),
    };
  }
  const buyDetailMatch = /^\/buy-details\/([^/]+)$/.exec(normalized);
  if (buyDetailMatch) {
    return {
      view: 'buy-details',
      ...EMPTY_ROUTE_PARAMS,
      buyPropertyId: decodeRouteSegment(buyDetailMatch[1]).trim() || null,
    };
  }
  const rentDetailMatch = /^\/rent-details\/([^/]+)$/.exec(normalized);
  if (rentDetailMatch) {
    return {
      view: 'rent-details',
      ...EMPTY_ROUTE_PARAMS,
      rentalId: decodeRouteSegment(rentDetailMatch[1]).trim() || null,
    };
  }
  const groupDealMatch = /^\/group-deals\/([^/]+)$/.exec(normalized);
  if (groupDealMatch) {
    return {
      view: 'group-deal-details',
      ...EMPTY_ROUTE_PARAMS,
      groupDealCode: decodeRouteSegment(groupDealMatch[1]).trim() || null,
    };
  }
  const ownerEditMatch = /^\/owner\/edit-property\/([^/]+)$/.exec(normalized);
  if (ownerEditMatch) {
    return {
      view: 'owner-edit-property',
      ...EMPTY_ROUTE_PARAMS,
      ownerPropertyId: decodeRouteSegment(ownerEditMatch[1]).trim() || null,
    };
  }
  const infraPreviewMatch = /^\/admin\/infra\/preview\/([^/]+)$/.exec(normalized);
  if (infraPreviewMatch) {
    return {
      view: 'admin-infra-preview',
      ...EMPTY_ROUTE_PARAMS,
      infraPreviewId: decodeRouteSegment(infraPreviewMatch[1]).trim() || null,
    };
  }

  if (normalized === '/e-auction') {
    return { view: 'e-auction', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/dealers-builders') {
    return { view: 'dealers-builders', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/builder/projects/new') {
    return { view: 'builder-project-new', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/projects') {
    return { view: 'projects', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/construct-with-us') {
    return { view: 'construct-with-us', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/early-supporters') {
    return { view: 'early-supporters', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/layout-units') {
    return { view: 'layout-units-floor-detail', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/layout-units/builder') {
    return { view: 'layout-units-builder', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/layout-units/units') {
    return { view: 'layout-units-list', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/apartment-complex') {
    return { view: 'apartment-complex', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/building-materials') {
    return { view: 'building-materials', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/infrastructure' || normalized === '/infrastructure-tracker') {
    return { view: 'infrastructure', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/insights/news') {
    return { view: 'insights-news', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/insights/market') {
    return { view: 'insights-market', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/insights/projects') {
    return { view: 'insights-projects', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/insights/compare') {
    return { view: 'insights-compare', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/add-property') {
    return { view: 'add-property', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/buy') {
    return { view: 'buy', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/rent') {
    return { view: 'rent', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/new-launch') {
    return { view: 'new-launch', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/commercial') {
    return { view: 'commercial', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/plots-land') {
    return { view: 'plots-land', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/sell/add') {
    return { view: 'sell-property', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/rent/add') {
    return { view: 'rent-property', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/about') {
    return { view: 'about', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/blog') {
    return { view: 'blog', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/press') {
    return { view: 'press', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/help-center') {
    return { view: 'help-center', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/contact') {
    return { view: 'contact', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/faq') {
    return { view: 'faq', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/privacy') {
    return { view: 'privacy', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/terms') {
    return { view: 'terms', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/cookies') {
    return { view: 'cookies', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/security') {
    return { view: 'security', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/unsubscribe') {
    return { view: 'unsubscribe', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/buy-map') {
    return { view: 'buy-map', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/buy-details') {
    return { view: 'buy', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/rent-map') {
    return { view: 'rent-map', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/rent-details') {
    return { view: 'rent', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/rent-short-term') {
    return { view: 'rent-short-term', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/rent-co-living') {
    return { view: 'rent-co-living', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/group-deals') {
    return { view: 'group-deals', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/admin/group-deals') {
    return { view: 'admin-group-deals', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/admin/infra/add') {
    return { view: 'admin-infra-add', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/admin/infra/manage') {
    return { view: 'admin-infra-manage', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/admin/infra/subscribers') {
    return { view: 'admin-infra-subscribers', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/admin/infra/inbox') {
    return { view: 'admin-infra-inbox', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/admin/infra/preview') {
    return { view: 'admin-infra-inbox', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/saved-rentals') {
    return { view: 'saved-rentals', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/saved') {
    return { view: 'saved', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/owner/dashboard') {
    return { view: 'owner-dashboard', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/owner/add-property') {
    return { view: 'owner-add-property', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/owner/edit-property') {
    return { view: 'owner-listings', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/owner/listings') {
    return { view: 'owner-listings', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/owner/rentals') {
    return { view: 'owner-rentals', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/owner/leads') {
    return { view: 'owner-leads', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/owner/analytics') {
    return { view: 'owner-analytics', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/owner/subscription') {
    return { view: 'owner-subscription', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/owner/payments') {
    return { view: 'owner-payments', ...EMPTY_ROUTE_PARAMS };
  }
  if (normalized === '/owner/profile') {
    return { view: 'owner-profile', ...EMPTY_ROUTE_PARAMS };
  }

  return { view: null, ...EMPTY_ROUTE_PARAMS };
}

function hrefForView(
  view: AppView,
  options?: ViewRouteParams
): string {
  if (view === 'home') {
    return '/';
  }
  if (view === 'about') {
    return '/about';
  }
  if (view === 'blog') {
    return '/blog';
  }
  if (view === 'press') {
    return '/press';
  }
  if (view === 'help-center') {
    return '/help-center';
  }
  if (view === 'contact') {
    return '/contact';
  }
  if (view === 'faq') {
    return '/faq';
  }
  if (view === 'privacy') {
    return '/privacy';
  }
  if (view === 'terms') {
    return '/terms';
  }
  if (view === 'cookies') {
    return '/cookies';
  }
  if (view === 'security') {
    return '/security';
  }
  if (view === 'unsubscribe') {
    return '/unsubscribe';
  }
  if (view === 'buy') {
    return '/buy';
  }
  if (view === 'rent') {
    return '/rent';
  }
  if (view === 'new-launch') {
    return '/new-launch';
  }
  if (view === 'commercial') {
    return '/commercial';
  }
  if (view === 'plots-land') {
    return '/plots-land';
  }
  if (view === 'e-auction') {
    return '/e-auction';
  }
  if (view === 'buy-map') {
    return '/buy-map';
  }
  if (view === 'buy-details') {
    const buyPropertyId = String(options?.buyPropertyId || '').trim();
    return buyPropertyId ? `/buy-details/${encodeURIComponent(buyPropertyId)}` : '/buy';
  }
  if (view === 'rent-map') {
    return '/rent-map';
  }
  if (view === 'rent-details') {
    const rentalId = String(options?.rentalId || '').trim();
    return rentalId ? `/rent-details/${encodeURIComponent(rentalId)}` : '/rent';
  }
  if (view === 'rent-short-term') {
    return '/rent-short-term';
  }
  if (view === 'rent-co-living') {
    return '/rent-co-living';
  }
  if (view === 'group-deals') {
    return '/group-deals';
  }
  if (view === 'group-deal-details') {
    const dealCode = String(options?.groupDealCode || '').trim();
    return dealCode ? `/group-deals/${encodeURIComponent(dealCode)}` : '/group-deals';
  }
  if (view === 'admin-group-deals') {
    return '/admin/group-deals';
  }
  if (view === 'admin-infra-add') {
    return '/admin/infra/add';
  }
  if (view === 'admin-infra-manage') {
    return '/admin/infra/manage';
  }
  if (view === 'admin-infra-subscribers') {
    return '/admin/infra/subscribers';
  }
  if (view === 'admin-infra-inbox') {
    return '/admin/infra/inbox';
  }
  if (view === 'admin-infra-preview') {
    const infraPreviewId = String(options?.infraPreviewId || '').trim();
    return infraPreviewId
      ? `/admin/infra/preview/${encodeURIComponent(infraPreviewId)}`
      : '/admin/infra/inbox';
  }
  if (view === 'saved-rentals') {
    return '/saved-rentals';
  }
  if (view === 'saved') {
    return '/saved';
  }
  if (view === 'owner-dashboard') {
    return '/owner/dashboard';
  }
  if (view === 'owner-add-property') {
    return '/owner/add-property';
  }
  if (view === 'owner-edit-property') {
    const ownerPropertyId = String(options?.ownerPropertyId || '').trim();
    return ownerPropertyId
      ? `/owner/edit-property/${encodeURIComponent(ownerPropertyId)}`
      : '/owner/listings';
  }
  if (view === 'owner-listings') {
    return '/owner/listings';
  }
  if (view === 'owner-rentals') {
    return '/owner/rentals';
  }
  if (view === 'owner-leads') {
    return '/owner/leads';
  }
  if (view === 'owner-analytics') {
    return '/owner/analytics';
  }
  if (view === 'owner-subscription') {
    return '/owner/subscription';
  }
  if (view === 'owner-payments') {
    return '/owner/payments';
  }
  if (view === 'owner-profile') {
    return '/owner/profile';
  }
  if (view === 'early-supporters') {
    return '/early-supporters';
  }
  if (view === 'dealers-builders') {
    return '/dealers-builders';
  }
  if (view === 'dealers-builders-company') {
    const companyId = Number(options?.companyId || 0);
    return companyId > 0 ? `/dealers-builders/${companyId}` : '/dealers-builders';
  }
  if (view === 'builder-project-new') {
    return '/builder/projects/new';
  }
  if (view === 'project-details') {
    const projectId = Number(options?.projectId || 0);
    return projectId > 0 ? `/projects/${projectId}` : '/projects';
  }
  if (view === 'projects') {
    return '/projects';
  }
  if (view === 'construct-with-us') {
    return '/construct-with-us';
  }
  if (view === 'layout-units-floor-detail') {
    return '/layout-units';
  }
  if (view === 'layout-units-builder') {
    return '/layout-units/builder';
  }
  if (view === 'layout-units-list') {
    return '/layout-units/units';
  }
  if (view === 'apartment-complex') {
    return '/apartment-complex';
  }
  if (view === 'building-materials') {
    return '/building-materials';
  }
  if (view === 'infrastructure') {
    return '/infrastructure';
  }
  if (view === 'insights-news') {
    return '/insights/news';
  }
  if (view === 'insights-market') {
    return '/insights/market';
  }
  if (view === 'insights-projects') {
    return '/insights/projects';
  }
  if (view === 'insights-compare') {
    return '/insights/compare';
  }
  if (view === 'add-property') {
    return '/add-property';
  }
  if (view === 'sell-property') {
    return '/sell/add';
  }
  if (view === 'rent-property') {
    return '/rent/add';
  }
  return '/';
}

function App() {
  const initialRoute = viewFromPathname(window.location.pathname);
  const initialView: AppView = (() => {
    const token = readToken();
    const storedUser = readStoredUser();
    const pathView = initialRoute.view;

    if (pathView) {
      if (canAccessView(pathView, storedUser)) {
        if (pathView === 'builder-project-new') {
          return token ? pathView : 'login';
        }
        return pathView;
      }
      if (token && storedUser) {
        return getDefaultPrivateView(storedUser);
      }
      return token ? 'home' : 'login';
    }

    return token ? 'home' : 'login';
  })();

  const [currentView, setCurrentView] = useState<AppView>(initialView);
  const [isLoaded, setIsLoaded] = useState(false);
  const [authToken, setAuthToken] = useState('');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [backMessage, setBackMessage] = useState('');
  const [messagePageReferenceSeed, setMessagePageReferenceSeed] = useState('');
  const [propertyDetailReference, setPropertyDetailReference] = useState('');
  const [dealerCompanyId, setDealerCompanyId] = useState<number | null>(initialRoute.companyId);
  const [projectPageId, setProjectPageId] = useState<number | null>(initialRoute.projectId);
  const [buyDetailsPropertyId, setBuyDetailsPropertyId] = useState<string | null>(
    initialRoute.buyPropertyId
  );
  const [rentDetailsRentalId, setRentDetailsRentalId] = useState<string | null>(
    initialRoute.rentalId
  );
  const [groupDealCode, setGroupDealCode] = useState<string | null>(initialRoute.groupDealCode);
  const [ownerEditPropertyId, setOwnerEditPropertyId] = useState<string | null>(
    initialRoute.ownerPropertyId
  );
  const [infraPreviewId, setInfraPreviewId] = useState<string | null>(initialRoute.infraPreviewId);
  const [layoutBuildingId, setLayoutBuildingId] = useState<number | null>(null);
  const [layoutFloorId, setLayoutFloorId] = useState<number | null>(null);
  const currentViewRef = useRef<AppView>(initialView);
  const dealerCompanyIdRef = useRef<number | null>(initialRoute.companyId);
  const projectPageIdRef = useRef<number | null>(initialRoute.projectId);
  const buyDetailsPropertyIdRef = useRef<string | null>(initialRoute.buyPropertyId);
  const rentDetailsRentalIdRef = useRef<string | null>(initialRoute.rentalId);
  const groupDealCodeRef = useRef<string | null>(initialRoute.groupDealCode);
  const ownerEditPropertyIdRef = useRef<string | null>(initialRoute.ownerPropertyId);
  const infraPreviewIdRef = useRef<string | null>(initialRoute.infraPreviewId);
  const currentUserRef = useRef<AuthUser | null>(null);
  const backMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitArmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isExitArmedRef = useRef(false);

  const isAuthenticated = Boolean(authToken && currentUser);
  const showHeader = !(
    currentView === 'login' ||
    currentView === 'register' ||
    currentView === 'admin-login' ||
    currentView === 'team-login' ||
    currentView === 'forgot-password'
  );
  const hideFloatingBack =
    currentView === 'login' ||
    currentView === 'register' ||
    currentView === 'admin-login' ||
    currentView === 'team-login';
  const hideAiChatbot =
    currentView === 'login' ||
    currentView === 'register' ||
    currentView === 'admin-login' ||
    currentView === 'team-login' ||
    currentView === 'forgot-password';

  useEffect(() => {
    let active = true;
    setIsLoaded(true);

    const bootstrap = async () => {
      const token = readToken();
      const storedUser = readStoredUser();

      if (!token) {
        if (active) {
          setAuthToken('');
          setCurrentUser(null);
          setCurrentView('login');
        }
        return;
      }

      if (active) {
        setAuthToken(token);
        setCurrentUser(storedUser);
      }

      try {
        const response = await apiRequest<{ user: unknown }>('/auth/me', {}, token);
        const user = parseApiUser(response.user);
        if (!user) {
          throw new Error('Invalid session user payload');
        }

        if (!active) {
          return;
        }
        setAuthToken(token);
        setCurrentUser(user);
        saveSession(token, user);
      } catch {
        if (!active) {
          return;
        }
        clearSession();
        setAuthToken('');
        setCurrentUser(null);
        setCurrentView('login');
      }
    };

    void bootstrap();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    currentViewRef.current = currentView;
  }, [currentView]);

  useEffect(() => {
    dealerCompanyIdRef.current = dealerCompanyId;
  }, [dealerCompanyId]);

  useEffect(() => {
    projectPageIdRef.current = projectPageId;
  }, [projectPageId]);

  useEffect(() => {
    buyDetailsPropertyIdRef.current = buyDetailsPropertyId;
  }, [buyDetailsPropertyId]);

  useEffect(() => {
    rentDetailsRentalIdRef.current = rentDetailsRentalId;
  }, [rentDetailsRentalId]);

  useEffect(() => {
    groupDealCodeRef.current = groupDealCode;
  }, [groupDealCode]);

  useEffect(() => {
    ownerEditPropertyIdRef.current = ownerEditPropertyId;
  }, [ownerEditPropertyId]);

  useEffect(() => {
    infraPreviewIdRef.current = infraPreviewId;
  }, [infraPreviewId]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const showBackMessage = (message: string) => {
    setBackMessage(message);
    if (backMessageTimeoutRef.current) {
      window.clearTimeout(backMessageTimeoutRef.current);
    }
    backMessageTimeoutRef.current = window.setTimeout(() => {
      setBackMessage('');
    }, 2200);
  };

  const goToView = (
    view: AppView,
    options?: ViewRouteParams & {
      pushHistory?: boolean;
      smoothScroll?: boolean;
    }
  ) => {
    const pushHistory = options?.pushHistory ?? true;
    const smoothScroll = options?.smoothScroll ?? true;
    const requestedCompanyId = Number(options?.companyId || 0);
    const requestedProjectId = Number(options?.projectId || 0);
    const requestedBuyPropertyId = String(options?.buyPropertyId || '').trim();
    const requestedRentalId = String(options?.rentalId || '').trim();
    const requestedGroupDealCode = String(options?.groupDealCode || '').trim();
    const requestedOwnerPropertyId = String(options?.ownerPropertyId || '').trim();
    const requestedInfraPreviewId = String(options?.infraPreviewId || '').trim();
    const activeUser = currentUserRef.current;

    if (!canAccessView(view, activeUser)) {
      const fallback = activeUser ? getDefaultPrivateView(activeUser) : 'login';
      if (smoothScroll) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      setCurrentView(fallback);
      setDealerCompanyId(null);
      setProjectPageId(null);
      setBuyDetailsPropertyId(null);
      setRentDetailsRentalId(null);
      setGroupDealCode(null);
      setOwnerEditPropertyId(null);
      setInfraPreviewId(null);
      if (pushHistory) {
        window.history.pushState(
          {
            __zdtSpa: true,
            view: fallback,
            companyId: null,
            projectId: null,
            buyPropertyId: null,
            rentalId: null,
            groupDealCode: null,
            ownerPropertyId: null,
            infraPreviewId: null,
          },
          '',
          hrefForView(fallback)
        );
      }
      return;
    }

    const nextCompanyId =
      view === 'dealers-builders-company'
        ? requestedCompanyId || null
        : view === 'project-details' || view === 'builder-project-new'
          ? requestedCompanyId || dealerCompanyIdRef.current || null
          : null;
    const nextProjectId = view === 'project-details' ? requestedProjectId || null : null;
    const nextBuyPropertyId =
      view === 'buy-details'
        ? requestedBuyPropertyId || buyDetailsPropertyIdRef.current || null
        : null;
    const nextRentalId =
      view === 'rent-details' ? requestedRentalId || rentDetailsRentalIdRef.current || null : null;
    const nextGroupDealCode =
      view === 'group-deal-details'
        ? requestedGroupDealCode || groupDealCodeRef.current || null
        : null;
    const nextOwnerPropertyId =
      view === 'owner-edit-property'
        ? requestedOwnerPropertyId || ownerEditPropertyIdRef.current || null
        : null;
    const nextInfraPreviewId =
      view === 'admin-infra-preview'
        ? requestedInfraPreviewId || infraPreviewIdRef.current || null
        : null;

    if (view === 'dealers-builders-company' && !nextCompanyId) {
      goToView('dealers-builders', { pushHistory, smoothScroll });
      return;
    }
    if (view === 'project-details' && !nextProjectId) {
      goToView('projects', { pushHistory, smoothScroll });
      return;
    }
    if (view === 'buy-details' && !nextBuyPropertyId) {
      goToView('buy', { pushHistory, smoothScroll });
      return;
    }
    if (view === 'rent-details' && !nextRentalId) {
      goToView('rent', { pushHistory, smoothScroll });
      return;
    }
    if (view === 'group-deal-details' && !nextGroupDealCode) {
      goToView('group-deals', { pushHistory, smoothScroll });
      return;
    }
    if (view === 'owner-edit-property' && !nextOwnerPropertyId) {
      goToView('owner-listings', { pushHistory, smoothScroll });
      return;
    }
    if (view === 'admin-infra-preview' && !nextInfraPreviewId) {
      goToView('admin-infra-inbox', { pushHistory, smoothScroll });
      return;
    }

    if (smoothScroll) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setCurrentView(view);
    setDealerCompanyId(nextCompanyId);
    setProjectPageId(nextProjectId);
    setBuyDetailsPropertyId(nextBuyPropertyId);
    setRentDetailsRentalId(nextRentalId);
    setGroupDealCode(nextGroupDealCode);
    setOwnerEditPropertyId(nextOwnerPropertyId);
    setInfraPreviewId(nextInfraPreviewId);
    if (pushHistory) {
      window.history.pushState(
        {
          __zdtSpa: true,
          view,
          companyId: nextCompanyId,
          projectId: nextProjectId,
          buyPropertyId: nextBuyPropertyId,
          rentalId: nextRentalId,
          groupDealCode: nextGroupDealCode,
          ownerPropertyId: nextOwnerPropertyId,
          infraPreviewId: nextInfraPreviewId,
        },
        '',
        hrefForView(view, {
          companyId: nextCompanyId,
          projectId: nextProjectId,
          buyPropertyId: nextBuyPropertyId,
          rentalId: nextRentalId,
          groupDealCode: nextGroupDealCode,
          ownerPropertyId: nextOwnerPropertyId,
          infraPreviewId: nextInfraPreviewId,
        })
      );
    }
  };

  const navigateTo = (view: AppView, options?: ViewRouteParams) => {
    goToView(view, { pushHistory: true, smoothScroll: true, ...options });
  };

  const openMessagesView = (propertyReference?: string) => {
    const reference = propertyReference?.trim() || '';
    if (reference) {
      void trackPropertyInteraction({
        referenceId: reference,
        action: 'click',
        context: 'open_messages',
      });
    }
    setMessagePageReferenceSeed(reference);
    navigateTo('messages');
  };

  const openPropertyDetails = (propertyReference?: string) => {
    const reference = propertyReference?.trim() || '';
    const projectRefMatch = /^PROJECT-(\d+)$/i.exec(reference);
    if (projectRefMatch) {
      openProjectDetailsPage(Number(projectRefMatch[1]));
      return;
    }

    if (reference) {
      void trackPropertyInteraction({
        referenceId: reference,
        action: 'click',
        context: 'open_property_details',
      });
    }

    setPropertyDetailReference(reference);
    navigateTo('property-details');
  };

  const openDealerCompany = (companyId: number) => {
    navigateTo('dealers-builders-company', { companyId });
  };

  const openBuyDetailsPage = (propertyId: string | number) => {
    navigateTo('buy-details', { buyPropertyId: String(propertyId) });
  };

  const openRentDetailsPage = (rentalId: string | number) => {
    navigateTo('rent-details', { rentalId: String(rentalId) });
  };

  const openGroupDealDetailsPage = (dealCode: string) => {
    navigateTo('group-deal-details', { groupDealCode: dealCode });
  };

  const openOwnerEditPropertyPage = (propertyId: string | number) => {
    navigateTo('owner-edit-property', { ownerPropertyId: String(propertyId) });
  };

  const openProjectDetailsPage = (projectId: number, companyId?: number | null) => {
    navigateTo('project-details', {
      projectId,
      companyId: Number(companyId || dealerCompanyIdRef.current || 0) || null,
    });
  };

  const openNewProjectPage = () => {
    navigateTo('builder-project-new', {
      companyId: Number(dealerCompanyIdRef.current || 0) || null,
    });
  };

  const openLayoutUnitsFloorDetail = () => {
    navigateTo('layout-units-floor-detail');
  };

  const openLayoutUnitsBuilder = () => {
    navigateTo('layout-units-builder');
  };

  const openLayoutUnitsList = () => {
    navigateTo('layout-units-list');
  };

  const openApartmentComplex = () => {
    navigateTo('apartment-complex');
  };

  const openBuildingMaterials = () => {
    navigateTo('building-materials');
  };

  const openConstructJourneyOnWhatsApp = () => {
    const configuredNumber = String(
      import.meta.env.VITE_CONSTRUCT_WHATSAPP_NUMBER ||
        import.meta.env.VITE_WHATSAPP_NUMBER ||
        '917676815237'
    ).trim();
    const phoneDigits = configuredNumber.replace(/\D/g, '');

    if (phoneDigits.length >= 10) {
      const prefilledMessage = encodeURIComponent(
        'Hi ZDT Realty, I want to start my construction journey. Please guide me with packages and next steps.'
      );
      const url = `https://wa.me/${phoneDigits}?text=${prefilledMessage}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    navigateTo('add-property');
  };

  const openConstructWithUs = () => {
    navigateTo('construct-with-us');
  };

  const openInsightsNews = () => {
    navigateTo('insights-news');
  };

  const openInsightsMarket = () => {
    navigateTo('insights-market');
  };

  const openInsightsProjects = () => {
    navigateTo('insights-projects');
  };

  const openInsightsCompare = () => {
    navigateTo('insights-compare');
  };

  const updateLayoutSelection = (next: { buildingId: number | null; floorId: number | null }) => {
    setLayoutBuildingId(next.buildingId);
    setLayoutFloorId(next.floorId);
  };

  useEffect(() => {
    const state = window.history.state as { __zdtSpa?: boolean } | null;
    const initialCompanyId =
      initialView === 'dealers-builders-company'
        ? Number(initialRoute.companyId || 0) || null
        : initialView === 'project-details' || initialView === 'builder-project-new'
          ? Number(initialRoute.companyId || 0) || null
          : null;
    const initialProjectId =
      initialView === 'project-details' ? Number(initialRoute.projectId || 0) || null : null;
    const initialBuyPropertyId =
      initialView === 'buy-details' ? String(initialRoute.buyPropertyId || '').trim() || null : null;
    const initialRentalId =
      initialView === 'rent-details' ? String(initialRoute.rentalId || '').trim() || null : null;
    const initialGroupDealCode =
      initialView === 'group-deal-details'
        ? String(initialRoute.groupDealCode || '').trim() || null
        : null;
    const initialOwnerPropertyId =
      initialView === 'owner-edit-property'
        ? String(initialRoute.ownerPropertyId || '').trim() || null
        : null;
    const initialInfraPreviewId =
      initialView === 'admin-infra-preview'
        ? String(initialRoute.infraPreviewId || '').trim() || null
        : null;

    if (!state?.__zdtSpa) {
      window.history.replaceState(
        {
          __zdtSpa: true,
          view: initialView,
          companyId: initialCompanyId,
          projectId: initialProjectId,
          buyPropertyId: initialBuyPropertyId,
          rentalId: initialRentalId,
          groupDealCode: initialGroupDealCode,
          ownerPropertyId: initialOwnerPropertyId,
          infraPreviewId: initialInfraPreviewId,
        },
        '',
        hrefForView(initialView, {
          companyId: initialCompanyId,
          projectId: initialProjectId,
          buyPropertyId: initialBuyPropertyId,
          rentalId: initialRentalId,
          groupDealCode: initialGroupDealCode,
          ownerPropertyId: initialOwnerPropertyId,
          infraPreviewId: initialInfraPreviewId,
        })
      );
    }
    window.history.pushState(
      {
        __zdtSpa: true,
        view: currentViewRef.current,
        companyId: dealerCompanyIdRef.current,
        projectId: projectPageIdRef.current,
        buyPropertyId: buyDetailsPropertyIdRef.current,
        rentalId: rentDetailsRentalIdRef.current,
        groupDealCode: groupDealCodeRef.current,
        ownerPropertyId: ownerEditPropertyIdRef.current,
        infraPreviewId: infraPreviewIdRef.current,
      },
      '',
      hrefForView(currentViewRef.current, {
        companyId: dealerCompanyIdRef.current,
        projectId: projectPageIdRef.current,
        buyPropertyId: buyDetailsPropertyIdRef.current,
        rentalId: rentDetailsRentalIdRef.current,
        groupDealCode: groupDealCodeRef.current,
        ownerPropertyId: ownerEditPropertyIdRef.current,
        infraPreviewId: infraPreviewIdRef.current,
      })
    );

    const handlePopState = (event: PopStateEvent) => {
      const nextState = event.state as
        | {
            __zdtSpa?: boolean;
            view?: AppView;
            companyId?: number | null;
            projectId?: number | null;
            buyPropertyId?: string | null;
            rentalId?: string | null;
            groupDealCode?: string | null;
            ownerPropertyId?: string | null;
            infraPreviewId?: string | null;
          }
        | null;
      if (nextState?.__zdtSpa && nextState.view) {
        goToView(nextState.view, {
          pushHistory: false,
          smoothScroll: true,
          companyId: Number(nextState.companyId || 0) || null,
          projectId: Number(nextState.projectId || 0) || null,
          buyPropertyId: String(nextState.buyPropertyId || '').trim() || null,
          rentalId: String(nextState.rentalId || '').trim() || null,
          groupDealCode: String(nextState.groupDealCode || '').trim() || null,
          ownerPropertyId: String(nextState.ownerPropertyId || '').trim() || null,
          infraPreviewId: String(nextState.infraPreviewId || '').trim() || null,
        });
        return;
      }

      if (currentViewRef.current !== 'home') {
        goToView('home', { pushHistory: false, smoothScroll: true });
        window.history.pushState(
          {
            __zdtSpa: true,
            view: 'home',
            companyId: null,
            projectId: null,
            buyPropertyId: null,
            rentalId: null,
            groupDealCode: null,
            ownerPropertyId: null,
            infraPreviewId: null,
          },
          '',
          hrefForView('home')
        );
        return;
      }

      if (!isExitArmedRef.current) {
        isExitArmedRef.current = true;
        showBackMessage('Press back again to close the website.');
        if (exitArmTimeoutRef.current) {
          window.clearTimeout(exitArmTimeoutRef.current);
        }
        exitArmTimeoutRef.current = window.setTimeout(() => {
          isExitArmedRef.current = false;
        }, 2000);
        window.history.pushState(
          {
            __zdtSpa: true,
            view: 'home',
            companyId: null,
            projectId: null,
            buyPropertyId: null,
            rentalId: null,
            groupDealCode: null,
            ownerPropertyId: null,
            infraPreviewId: null,
          },
          '',
          hrefForView('home')
        );
        return;
      }

      window.removeEventListener('popstate', handlePopState);
      window.history.back();
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (backMessageTimeoutRef.current) {
        window.clearTimeout(backMessageTimeoutRef.current);
      }
      if (exitArmTimeoutRef.current) {
        window.clearTimeout(exitArmTimeoutRef.current);
      }
    };
  }, []);

  const handleLoginSuccess = () => {
    const token = readToken();
    if (!token) {
      clearSession();
      setAuthToken('');
      setCurrentUser(null);
      navigateTo('login');
      return;
    }

    setAuthToken(token);
    void apiRequest<{ user: unknown }>('/auth/me', {}, token)
      .then((response) => {
        const user = parseApiUser(response.user);
        if (!user) {
          throw new Error('Invalid session user payload');
        }
        setCurrentUser(user);
        saveSession(token, user);
        navigateTo(getDefaultPrivateView(user));
      })
      .catch(() => {
        clearSession();
        setAuthToken('');
        setCurrentUser(null);
        navigateTo('login');
      });
  };

  const handleLogout = async () => {
    const token = authToken;
    try {
      if (token) {
        await apiRequest('/auth/logout', { method: 'POST' }, token);
      }
    } catch {
      // Local logout still proceeds even if API revoke fails.
    } finally {
      clearSession();
      setAuthToken('');
      setCurrentUser(null);
      setLayoutBuildingId(null);
      setLayoutFloorId(null);
      navigateTo('login');
    }
  };

  const viewLoader = <RoutePageSkeleton />;

  return (
    <div
      className={`sci-fi min-h-screen font-sans text-slate-900 transition-opacity duration-700 selection:bg-blue-200 selection:text-slate-900 ${
        isLoaded ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="relative z-10 flex min-h-screen flex-col">
        {currentView !== 'home' && !hideFloatingBack && (
          <button
            type="button"
            onClick={() => navigateTo('home')}
            className={`fixed left-4 z-50 inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/95 px-4 py-2 text-sm font-semibold text-slate-700 shadow-md backdrop-blur-md transition hover:bg-white ${
              showHeader ? 'top-32 xl:top-36' : 'top-4'
            }`}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        )}

        {showHeader && (
          <Header
            onLogin={() => navigateTo('login')}
            onRegister={() => navigateTo('register')}
            onHome={() => navigateTo('home')}
            onBuy={() => navigateTo('buy')}
            onRent={() => navigateTo('rent')}
            onProjects={() => navigateTo('projects')}
            onInfrastructure={() => navigateTo('infrastructure')}
            onGroupDeals={() => navigateTo('group-deals')}
            onPostProperty={() => navigateTo('add-property')}
            onOwnerDashboard={() => navigateTo('owner-dashboard')}
            onDealersBuilders={() => navigateTo('dealers-builders')}
            onMessages={() => openMessagesView()}
            onNotifications={() => navigateTo('notifications')}
            onCompare={() => navigateTo('compare')}
            onDashboard={() => navigateTo('dashboard')}
            onTeamDesk={() => navigateTo('team-desk')}
            onAdminDesk={() => navigateTo('admin-desk')}
            onFavorites={() => navigateTo('favorites')}
            onProfile={() => navigateTo('profile')}
            isAuthenticated={isAuthenticated}
            userRole={currentUser?.role || null}
            isMainAdmin={currentUser?.isMainAdmin || false}
            userName={currentUser?.name || ''}
          />
        )}

        {currentView === 'home' && (
          <div className="animate-in fade-in duration-500">
            <Suspense fallback={viewLoader}>
              <PortalHomePage
                isAuthenticated={isAuthenticated}
                onOpenLogin={() => navigateTo('login')}
                onOpenRegister={() => navigateTo('register')}
                onOpenBuy={() => navigateTo('buy')}
                onOpenRent={() => navigateTo('rent')}
                onOpenNewLaunch={() => navigateTo('new-launch')}
                onOpenCommercial={() => navigateTo('commercial')}
                onOpenBuildingMaterials={openBuildingMaterials}
                onOpenPlotsLand={() => navigateTo('plots-land')}
                onOpenProjects={() => navigateTo('projects')}
                onOpenInfrastructure={() => navigateTo('infrastructure')}
                onOpenPostProperty={() => navigateTo('add-property')}
                onOpenConstructWithUs={openConstructWithUs}
                onOpenEarlySupporters={() => navigateTo('early-supporters')}
                onOpenEAuction={() => navigateTo('e-auction')}
                onOpenDeveloper={() => navigateTo('developer')}
                onOpenCompare={() => navigateTo('compare')}
                onOpenInsightsNews={openInsightsNews}
                onOpenInsightsMarket={openInsightsMarket}
                onOpenInsightsProjects={openInsightsProjects}
                onOpenInsightsCompare={openInsightsCompare}
                onOpenNotifications={() => navigateTo('notifications')}
                onOpenSavedSearches={() => navigateTo('saved-searches')}
                onOpenPropertyDetails={openPropertyDetails}
                onOpenMessages={openMessagesView}
                onOpenDashboard={() => navigateTo('dashboard')}
                onOpenFavorites={() => navigateTo('favorites')}
                onOpenDealerCompany={openDealerCompany}
                onOpenAdminDesk={() => navigateTo('admin-desk')}
                onOpenTeamDesk={() => navigateTo('team-desk')}
                onOpenLayoutUnits={openLayoutUnitsFloorDetail}
                onOpenApartmentComplex={openApartmentComplex}
                userName={currentUser?.name}
                userRole={currentUser?.role}
              />
            </Suspense>
            {isAuthenticated ? (
              <Footer
                onOpenAdminLogin={() => navigateTo('admin-login')}
                onOpenAdminRegister={() => navigateTo('admin-register')}
                onOpenTeamLogin={() => navigateTo('team-login')}
                onOpenTeamRegister={() => navigateTo('team-register')}
              />
            ) : null}
          </div>
        )}

        {currentView === 'about' && (
          <Suspense fallback={viewLoader}>
            <AboutPage />
          </Suspense>
        )}

        {currentView === 'blog' && (
          <Suspense fallback={viewLoader}>
            <BlogPage />
          </Suspense>
        )}

        {currentView === 'press' && (
          <Suspense fallback={viewLoader}>
            <PressPage />
          </Suspense>
        )}

        {currentView === 'help-center' && (
          <Suspense fallback={viewLoader}>
            <HelpCenterPage />
          </Suspense>
        )}

        {currentView === 'contact' && (
          <Suspense fallback={viewLoader}>
            <ContactPage />
          </Suspense>
        )}

        {currentView === 'faq' && (
          <Suspense fallback={viewLoader}>
            <FaqPage />
          </Suspense>
        )}

        {currentView === 'privacy' && (
          <Suspense fallback={viewLoader}>
            <PrivacyPage />
          </Suspense>
        )}

        {currentView === 'terms' && (
          <Suspense fallback={viewLoader}>
            <TermsPage />
          </Suspense>
        )}

        {currentView === 'cookies' && (
          <Suspense fallback={viewLoader}>
            <CookiesPage />
          </Suspense>
        )}

        {currentView === 'security' && (
          <Suspense fallback={viewLoader}>
            <SecurityPage />
          </Suspense>
        )}

        {currentView === 'unsubscribe' && (
          <Suspense fallback={viewLoader}>
            <UnsubscribePage />
          </Suspense>
        )}

        {currentView === 'early-supporters' && (
          <Suspense fallback={viewLoader}>
            <EarlySupportersPage />
          </Suspense>
        )}

        {currentView === 'buy' && (
          <Suspense fallback={viewLoader}>
            <BuyPage
              onViewDetails={(referenceId) => openPropertyDetails(referenceId)}
              onOpenFavorites={() => navigateTo('favorites')}
              onOpenMessages={(referenceId) => openMessagesView(referenceId)}
            />
          </Suspense>
        )}

        {currentView === 'buy-map' && (
          <Suspense fallback={viewLoader}>
            <BuyMapPage
              onOpenDetails={(propertyId) => openBuyDetailsPage(propertyId)}
              onOpenCompare={() => navigateTo('compare')}
              onOpenSaved={() => navigateTo('favorites')}
              onOpenList={() => navigateTo('buy')}
            />
          </Suspense>
        )}

        {currentView === 'buy-details' && buyDetailsPropertyId ? (
          <Suspense fallback={viewLoader}>
            <BuyPropertyDetailsPage
              propertyId={buyDetailsPropertyId}
              onBackToBuy={() => navigateTo('buy')}
              onOpenSimilar={(propertyId) => openBuyDetailsPage(propertyId)}
              onOpenCompare={() => navigateTo('compare')}
              onOpenSaved={() => navigateTo('favorites')}
              onOpenMessages={openMessagesView}
              onOpenGroupDeal={openGroupDealDetailsPage}
            />
          </Suspense>
        ) : null}

        {currentView === 'building-materials' && (
          <Suspense fallback={viewLoader}>
            <BuildingMaterialsPage token={authToken} user={currentUser} />
          </Suspense>
        )}

        {currentView === 'infrastructure' && (
          <Suspense fallback={viewLoader}>
            <InfrastructureTrackerPage />
          </Suspense>
        )}

        {currentView === 'construct-with-us' && (
          <Suspense fallback={viewLoader}>
            <ConstructWithUsPage
              onStartJourney={openConstructJourneyOnWhatsApp}
              onOpenProjects={() => navigateTo('projects')}
              onOpenProjectDetails={(projectId) => openProjectDetailsPage(projectId)}
            />
          </Suspense>
        )}

        {(currentView === 'rent' ||
          currentView === 'new-launch' ||
          currentView === 'commercial' ||
          currentView === 'plots-land' ||
          currentView === 'projects') && (
          <Suspense fallback={viewLoader}>
            <MarketplaceListingsPage
              category={currentView}
              onOpenDetails={openPropertyDetails}
              onOpenMessages={openMessagesView}
              onOpenPostProperty={() => navigateTo('add-property')}
            />
          </Suspense>
        )}

        {currentView === 'rent-map' && (
          <Suspense fallback={viewLoader}>
            <RentMapPage
              onOpenDetails={(rentalId) => openRentDetailsPage(rentalId)}
              onOpenSaved={() => navigateTo('saved-rentals')}
              onOpenList={() => navigateTo('rent')}
            />
          </Suspense>
        )}

        {currentView === 'rent-details' && rentDetailsRentalId ? (
          <Suspense fallback={viewLoader}>
            <RentDetailsPage
              rentalId={rentDetailsRentalId}
              onBackToRent={() => navigateTo('rent')}
              onOpenSimilar={(rentalId) => openRentDetailsPage(rentalId)}
              onOpenSaved={() => navigateTo('saved-rentals')}
              onOpenShortTerm={() => navigateTo('rent-short-term')}
              onOpenCoLiving={() => navigateTo('rent-co-living')}
              onOpenMessages={openMessagesView}
            />
          </Suspense>
        ) : null}

        {currentView === 'rent-short-term' && (
          <Suspense fallback={viewLoader}>
            <RentShortTermPage
              onOpenDetails={(rentalId) => openRentDetailsPage(rentalId)}
              onOpenSaved={() => navigateTo('saved-rentals')}
              onOpenMap={() => navigateTo('rent-map')}
              onOpenList={() => navigateTo('rent')}
            />
          </Suspense>
        )}

        {currentView === 'rent-co-living' && (
          <Suspense fallback={viewLoader}>
            <RentCoLivingPage
              onOpenDetails={(rentalId) => openRentDetailsPage(rentalId)}
              onOpenSaved={() => navigateTo('saved-rentals')}
              onOpenMap={() => navigateTo('rent-map')}
              onOpenList={() => navigateTo('rent')}
            />
          </Suspense>
        )}

        {currentView === 'saved-rentals' && (
          <Suspense fallback={viewLoader}>
            <SavedRentalsPage
              onOpenRent={() => navigateTo('rent')}
              onViewDetails={(rentalId) => openRentDetailsPage(rentalId)}
            />
          </Suspense>
        )}

        {currentView === 'add-property' && (
          <Suspense fallback={viewLoader}>
            <AddProperty
              onOpenSell={() => navigateTo('sell-property')}
              onOpenRent={() => navigateTo('rent-property')}
            />
          </Suspense>
        )}

        {currentView === 'sell-property' && (
          <Suspense fallback={viewLoader}>
            <SellPage />
          </Suspense>
        )}

        {currentView === 'rent-property' && (
          <Suspense fallback={viewLoader}>
            <RentPage />
          </Suspense>
        )}

        {currentView === 'property-details' && (
          <Suspense fallback={viewLoader}>
            <PortalPropertyDetailsPage
              referenceId={propertyDetailReference}
              onOpenSimilar={openPropertyDetails}
              onOpenMessages={openMessagesView}
              onOpenPostProperty={() => navigateTo('add-property')}
            />
          </Suspense>
        )}

        {currentView === 'group-deals' && (
          <Suspense fallback={viewLoader}>
            <GroupDealsPage onOpenDeal={openGroupDealDetailsPage} />
          </Suspense>
        )}

        {currentView === 'group-deal-details' && groupDealCode ? (
          <Suspense fallback={viewLoader}>
            <GroupDealDetailPage
              dealCode={groupDealCode}
              onBackToList={() => navigateTo('group-deals')}
            />
          </Suspense>
        ) : null}

        {currentView === 'dealers-builders' && (
          <Suspense fallback={viewLoader}>
            <DealersDirectoryPage onOpenCompany={openDealerCompany} />
          </Suspense>
        )}

        {currentView === 'dealers-builders-company' && dealerCompanyId ? (
          <Suspense fallback={viewLoader}>
            <CompanyProfilePage
              companyId={dealerCompanyId}
              token={authToken}
              user={currentUser}
              onBackDirectory={() => navigateTo('dealers-builders')}
              onOpenProject={(projectId) => openProjectDetailsPage(projectId, dealerCompanyId)}
              onOpenMessages={() => openMessagesView()}
              onOpenNewProject={openNewProjectPage}
            />
          </Suspense>
        ) : null}

        {currentView === 'builder-project-new' && (
          <Suspense fallback={viewLoader}>
            <NewProjectPage
              token={authToken}
              user={currentUser}
              onBack={() => {
                if (dealerCompanyIdRef.current) {
                  navigateTo('dealers-builders-company', { companyId: dealerCompanyIdRef.current });
                  return;
                }
                navigateTo('dealers-builders');
              }}
              onProjectCreated={(projectId) =>
                openProjectDetailsPage(projectId, dealerCompanyIdRef.current)
              }
            />
          </Suspense>
        )}

        {currentView === 'project-details' && projectPageId ? (
          <Suspense fallback={viewLoader}>
            <ProjectDetailsPage
              projectId={projectPageId}
              token={authToken}
              user={currentUser}
              onBack={() => {
                if (dealerCompanyIdRef.current) {
                  navigateTo('dealers-builders-company', { companyId: dealerCompanyIdRef.current });
                  return;
                }
                navigateTo('dealers-builders');
              }}
              onOpenCompany={(companyId) => openDealerCompany(companyId)}
            />
          </Suspense>
        ) : null}

        {currentView === 'career' && (
          <Suspense fallback={viewLoader}>
            <CareerPage />
          </Suspense>
        )}

        {currentView === 'admin-register' && (
          <Suspense fallback={viewLoader}>
            <CareerPage lockedPosition="Admin" />
          </Suspense>
        )}

        {currentView === 'team-register' && (
          <Suspense fallback={viewLoader}>
            <CareerPage lockedPosition="Team Member" />
          </Suspense>
        )}

        {currentView === 'login' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <Login
                onBack={() => navigateTo('home')}
                onSwitchToRegister={() => navigateTo('register')}
                onLoginSuccess={handleLoginSuccess}
              />
            </Suspense>
          </div>
        )}

        {currentView === 'admin-login' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <Login
                onBack={() => navigateTo('home')}
                onSwitchToRegister={() => navigateTo('register')}
                onLoginSuccess={handleLoginSuccess}
              />
            </Suspense>
          </div>
        )}

        {currentView === 'team-login' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <Login
                onBack={() => navigateTo('home')}
                onSwitchToRegister={() => navigateTo('register')}
                onLoginSuccess={handleLoginSuccess}
              />
            </Suspense>
          </div>
        )}

        {currentView === 'register' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <Register onSwitchToLogin={() => navigateTo('login')} />
            </Suspense>
          </div>
        )}

        {currentView === 'forgot-password' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <ForgotPassword onBackToLogin={() => navigateTo('login')} />
            </Suspense>
          </div>
        )}

        {currentView === 'dashboard' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <Dashboard
                onBackHome={() => navigateTo('home')}
                onOpenMessages={() => navigateTo('messages')}
                onOpenFavorites={() => navigateTo('favorites')}
                onOpenOwnerPanel={() => navigateTo('owner-dashboard')}
                user={currentUser}
              />
            </Suspense>
          </div>
        )}

        {currentView === 'owner-dashboard' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <OwnerDashboardPage
                onOpenAddProperty={() => navigateTo('owner-add-property')}
                onOpenListings={() => navigateTo('owner-listings')}
                onOpenLeads={() => navigateTo('owner-leads')}
                onOpenAnalytics={() => navigateTo('owner-analytics')}
                onOpenSubscriptions={() => navigateTo('owner-subscription')}
              />
            </Suspense>
          </div>
        )}

        {currentView === 'owner-add-property' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <OwnerAddPropertyPage
                onBack={() => navigateTo('owner-dashboard')}
                onOpenListings={() => navigateTo('owner-listings')}
                onOpenRentals={() => navigateTo('owner-rentals')}
              />
            </Suspense>
          </div>
        )}

        {currentView === 'owner-edit-property' && ownerEditPropertyId ? (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <OwnerEditPropertyPage
                propertyId={ownerEditPropertyId}
                onBack={() => navigateTo('owner-listings')}
              />
            </Suspense>
          </div>
        ) : null}

        {currentView === 'owner-listings' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <OwnerListingsPage
                onOpenAddProperty={() => navigateTo('owner-add-property')}
                onOpenEdit={(propertyId) => openOwnerEditPropertyPage(propertyId)}
                onOpenDashboard={() => navigateTo('owner-dashboard')}
              />
            </Suspense>
          </div>
        )}

        {currentView === 'owner-rentals' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <OwnerRentalsPage
                onOpenAddProperty={() => navigateTo('owner-add-property')}
                onOpenDashboard={() => navigateTo('owner-dashboard')}
                onOpenDetails={(rentalId) => openRentDetailsPage(rentalId)}
              />
            </Suspense>
          </div>
        )}

        {currentView === 'owner-leads' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <OwnerLeadsPage
                onOpenDashboard={() => navigateTo('owner-dashboard')}
                onOpenListings={() => navigateTo('owner-listings')}
                onOpenRentals={() => navigateTo('owner-rentals')}
              />
            </Suspense>
          </div>
        )}

        {currentView === 'owner-analytics' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <OwnerAnalyticsPage
                onOpenDashboard={() => navigateTo('owner-dashboard')}
                onOpenPayments={() => navigateTo('owner-payments')}
              />
            </Suspense>
          </div>
        )}

        {currentView === 'owner-subscription' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <OwnerSubscriptionPage
                onOpenDashboard={() => navigateTo('owner-dashboard')}
                onOpenPayments={() => navigateTo('owner-payments')}
              />
            </Suspense>
          </div>
        )}

        {currentView === 'owner-payments' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <OwnerPaymentsPage onOpenDashboard={() => navigateTo('owner-dashboard')} />
            </Suspense>
          </div>
        )}

        {currentView === 'owner-profile' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <OwnerProfilePage onOpenDashboard={() => navigateTo('owner-dashboard')} />
            </Suspense>
          </div>
        )}

        {currentView === 'profile' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <ProfilePage
                token={authToken}
                user={currentUser}
                onBackHome={() => navigateTo('home')}
                onLogout={handleLogout}
              />
            </Suspense>
          </div>
        )}

        {currentView === 'messages' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <MessagesPage
                token={authToken}
                user={currentUser}
                initialPropertyReference={messagePageReferenceSeed}
                onConsumeInitialPropertyReference={() => setMessagePageReferenceSeed('')}
              />
            </Suspense>
          </div>
        )}

        {currentView === 'favorites' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <FavoritesPage
                onOpenBuy={() => navigateTo('buy')}
                onViewDetails={(referenceId) => openPropertyDetails(referenceId)}
                onOpenMessages={(referenceId) => openMessagesView(referenceId)}
              />
            </Suspense>
          </div>
        )}

        {currentView === 'saved' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <FavoritesPage
                onOpenBuy={() => navigateTo('buy')}
                onViewDetails={(referenceId) => openPropertyDetails(referenceId)}
                onOpenMessages={(referenceId) => openMessagesView(referenceId)}
              />
            </Suspense>
          </div>
        )}

        {currentView === 'compare' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <ComparePage
                onOpenDetails={openPropertyDetails}
                onOpenMessages={openMessagesView}
              />
            </Suspense>
          </div>
        )}

        {currentView === 'insights-news' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <InsightsNewsPage token={authToken} user={currentUser} />
            </Suspense>
          </div>
        )}

        {currentView === 'insights-market' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <InsightsMarketPage token={authToken} user={currentUser} />
            </Suspense>
          </div>
        )}

        {currentView === 'insights-projects' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <InsightsProjectsPage token={authToken} user={currentUser} />
            </Suspense>
          </div>
        )}

        {currentView === 'insights-compare' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <InsightsComparePage token={authToken} user={currentUser} />
            </Suspense>
          </div>
        )}

        {currentView === 'e-auction' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <EAuctionPage />
            </Suspense>
          </div>
        )}

        {currentView === 'notifications' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <NotificationsPage />
            </Suspense>
          </div>
        )}

        {currentView === 'saved-searches' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <SavedSearchesPage onNavigate={navigateTo} />
            </Suspense>
          </div>
        )}

        {currentView === 'developer' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <DeveloperPage
                token={authToken}
                user={currentUser}
                onNavigate={navigateTo}
                onLogout={handleLogout}
              />
            </Suspense>
          </div>
        )}

        {currentView === 'admin-group-deals' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <AdminGroupDealsPage />
            </Suspense>
          </div>
        )}

        {currentView === 'admin-infra-add' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <AdminInfraAddPage />
            </Suspense>
          </div>
        )}

        {currentView === 'admin-infra-manage' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <AdminInfraManagePage />
            </Suspense>
          </div>
        )}

        {currentView === 'admin-infra-subscribers' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <AdminInfraSubscribersPage />
            </Suspense>
          </div>
        )}

        {currentView === 'admin-infra-inbox' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <AdminInfraInboxPage />
            </Suspense>
          </div>
        )}

        {currentView === 'admin-infra-preview' && infraPreviewId ? (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <AdminInfraPreviewPage updateId={infraPreviewId} />
            </Suspense>
          </div>
        ) : null}

        {currentView === 'team-desk' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <TeamAdminPage token={authToken} user={currentUser} />
            </Suspense>
          </div>
        )}

        {currentView === 'admin-desk' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <AdminDeskPage
                token={authToken}
                user={currentUser}
                onOpenLayoutUnits={openLayoutUnitsFloorDetail}
              />
            </Suspense>
          </div>
        )}

        {currentView === 'layout-units-floor-detail' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <FloorDetailPage
                token={authToken}
                user={currentUser}
                selectedBuildingId={layoutBuildingId}
                selectedFloorId={layoutFloorId}
                onSelectionChange={updateLayoutSelection}
                onOpenFloorDetail={openLayoutUnitsFloorDetail}
                onOpenBuilder={openLayoutUnitsBuilder}
                onOpenUnitsList={openLayoutUnitsList}
              />
            </Suspense>
          </div>
        )}

        {currentView === 'layout-units-builder' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <LayoutUnitBuilderPage
                token={authToken}
                user={currentUser}
                selectedBuildingId={layoutBuildingId}
                selectedFloorId={layoutFloorId}
                onSelectionChange={updateLayoutSelection}
                onOpenFloorDetail={openLayoutUnitsFloorDetail}
                onOpenBuilder={openLayoutUnitsBuilder}
                onOpenUnitsList={openLayoutUnitsList}
              />
            </Suspense>
          </div>
        )}

        {currentView === 'layout-units-list' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <UnitsListPage
                token={authToken}
                user={currentUser}
                selectedBuildingId={layoutBuildingId}
                selectedFloorId={layoutFloorId}
                onSelectionChange={updateLayoutSelection}
                onOpenFloorDetail={openLayoutUnitsFloorDetail}
                onOpenBuilder={openLayoutUnitsBuilder}
                onOpenUnitsList={openLayoutUnitsList}
              />
            </Suspense>
          </div>
        )}

        {currentView === 'apartment-complex' && (
          <div className="animate-in fade-in slide-in-from-bottom-8 min-h-screen duration-500 ease-out">
            <Suspense fallback={viewLoader}>
              <ApartmentComplexPage token={authToken} user={currentUser} />
            </Suspense>
          </div>
        )}

        {backMessage && (
          <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-slate-300 bg-white/95 px-4 py-2 text-sm text-slate-700 shadow-xl backdrop-blur-md">
            {backMessage}
          </div>
        )}

        {!hideAiChatbot ? <AIChatbotWidget /> : null}
      </div>
    </div>
  );
}

export default App;
