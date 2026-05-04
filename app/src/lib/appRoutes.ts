import { parseTrailingIdSegment, slugifySegment } from './slug';
import type { AuthUser } from './session';
import type { AppView } from './views';

export interface AppRouteState {
  view: AppView | null;
  companyId: number | null;
  projectId: number | null;
  buyPropertyId: string | null;
  rentalId: string | null;
  propertyReference: string | null;
  groupDealCode: string | null;
  ownerPropertyId: string | null;
  infraPreviewId: string | null;
}

export interface AppHistoryState extends Omit<AppRouteState, 'view'> {
  __zdtSpa: true;
  view: AppView;
}

export interface NavigationOptions {
  companyId?: number | null;
  projectId?: number | null;
  buyPropertyId?: string | null;
  buyPropertySlug?: string | null;
  rentalId?: string | null;
  rentalSlug?: string | null;
  propertyReference?: string | null;
  groupDealCode?: string | null;
  ownerPropertyId?: string | null;
  infraPreviewId?: string | null;
  search?: string | null;
  pushHistory?: boolean;
  smoothScroll?: boolean;
}

export interface ShellVisibility {
  showCompanyPortalWorkspace: boolean;
  showHeader: boolean;
  hideAiChatbot: boolean;
  showPublicFooter: boolean;
  showFloatingWhatsApp: boolean;
}

const AUTHENTICATED_VIEWS: AppView[] = [
  'dashboard',
  'builder-project-new',
  'profile',
  'messages',
  'favorites',
  'saved',
  'compare',
  'notifications',
  'saved-searches',
  'saved-rentals',
  'wallet',
  'referrals',
  'checkout',
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

const ADMIN_VIEWS: AppView[] = [
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
];

const AUTH_SHELL_VIEWS = new Set<AppView>([
  'login',
  'register',
  'admin-login',
  'team-login',
  'forgot-password',
]);

const FLOATING_WHATSAPP_VIEWS = new Set<AppView>([
  'buy',
  'buy-map',
  'buy-details',
  'rent',
  'rent-map',
  'rent-details',
  'new-launch',
  'commercial',
  'plots-land',
  'projects',
  'property-details',
]);

export const EMPTY_ROUTE_STATE: Omit<AppRouteState, 'view'> = {
  companyId: null,
  projectId: null,
  buyPropertyId: null,
  rentalId: null,
  propertyReference: null,
  groupDealCode: null,
  ownerPropertyId: null,
  infraPreviewId: null,
};

function withRouteState(
  view: AppView | null,
  values?: Partial<Omit<AppRouteState, 'view'>>
): AppRouteState {
  return {
    view,
    ...EMPTY_ROUTE_STATE,
    ...values,
  };
}

function decodeRouteSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeSearchSuffix(value?: string | null): string {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.startsWith('?') ? text : `?${text}`;
}

export function getDefaultPrivateView(user: AuthUser): AppView {
  if (user.role === 'admin') {
    return 'admin-desk';
  }
  if (user.role === 'team_member') {
    return 'team-desk';
  }
  return 'dashboard';
}

export function canAccessView(view: AppView, user: AuthUser | null): boolean {
  if (AUTHENTICATED_VIEWS.includes(view)) {
    return Boolean(user);
  }
  if (view === 'team-desk') {
    return Boolean(user && (user.role === 'team_member' || user.role === 'admin'));
  }
  if (ADMIN_VIEWS.includes(view)) {
    return Boolean(user && user.role === 'admin');
  }
  return true;
}

export function getShellVisibility(view: AppView, isAuthenticated: boolean): ShellVisibility {
  const showCompanyPortalWorkspace = view === 'company-portal' && isAuthenticated;
  const showHeader = !AUTH_SHELL_VIEWS.has(view) && !showCompanyPortalWorkspace;
  const hideAiChatbot = AUTH_SHELL_VIEWS.has(view) || showCompanyPortalWorkspace;

  return {
    showCompanyPortalWorkspace,
    showHeader,
    hideAiChatbot,
    showPublicFooter: showHeader && view === 'home',
    showFloatingWhatsApp: FLOATING_WHATSAPP_VIEWS.has(view),
  };
}

export function parsePathToRoute(pathname: string): AppRouteState {
  const normalized = pathname.trim().replace(/\/+$/, '') || '/';
  const canonicalBuyMatch = /^\/buy\/([^/]+)$/.exec(normalized);
  if (canonicalBuyMatch) {
    const buyPropertyId = parseTrailingIdSegment(canonicalBuyMatch[1]);
    if (buyPropertyId) {
      return withRouteState('buy-details', { buyPropertyId });
    }
  }

  const canonicalRentMatch = /^\/rent\/([^/]+)$/.exec(normalized);
  if (canonicalRentMatch) {
    const rentalId = parseTrailingIdSegment(canonicalRentMatch[1]);
    if (rentalId) {
      return withRouteState('rent-details', { rentalId });
    }
  }

  const companyMatch = /^\/dealers-builders\/(\d+)$/.exec(normalized);
  if (companyMatch) {
    return withRouteState('dealers-builders-company', {
      companyId: Number(companyMatch[1]),
    });
  }

  const projectMatch = /^\/projects\/(\d+)$/.exec(normalized);
  if (projectMatch) {
    return withRouteState('project-details', {
      projectId: Number(projectMatch[1]),
    });
  }

  const buyDetailMatch = /^\/buy-details\/([^/]+)$/.exec(normalized);
  if (buyDetailMatch) {
    return withRouteState('buy-details', {
      buyPropertyId: decodeRouteSegment(buyDetailMatch[1]).trim() || null,
    });
  }

  const rentDetailMatch = /^\/rent-details\/([^/]+)$/.exec(normalized);
  if (rentDetailMatch) {
    return withRouteState('rent-details', {
      rentalId: decodeRouteSegment(rentDetailMatch[1]).trim() || null,
    });
  }

  const propertyDetailMatch = /^\/property-details\/([^/]+)$/.exec(normalized);
  if (propertyDetailMatch) {
    return withRouteState('property-details', {
      propertyReference: decodeRouteSegment(propertyDetailMatch[1]).trim() || null,
    });
  }

  const groupDealMatch = /^\/group-deals\/([^/]+)$/.exec(normalized);
  if (groupDealMatch) {
    return withRouteState('group-deal-details', {
      groupDealCode: decodeRouteSegment(groupDealMatch[1]).trim() || null,
    });
  }

  const ownerEditMatch = /^\/owner\/edit-property\/([^/]+)$/.exec(normalized);
  if (ownerEditMatch) {
    return withRouteState('owner-edit-property', {
      ownerPropertyId: decodeRouteSegment(ownerEditMatch[1]).trim() || null,
    });
  }

  const infraPreviewMatch = /^\/admin\/infra\/preview\/([^/]+)$/.exec(normalized);
  if (infraPreviewMatch) {
    return withRouteState('admin-infra-preview', {
      infraPreviewId: decodeRouteSegment(infraPreviewMatch[1]).trim() || null,
    });
  }

  if (normalized === '/e-auction') return withRouteState('e-auction');
  if (normalized === '/dealers-builders') return withRouteState('dealers-builders');
  if (normalized === '/company/login') return withRouteState('company-login');
  if (normalized === '/company/register') return withRouteState('company-register');
  if (normalized === '/company-portal' || normalized === '/dealers-builders/portal') {
    return withRouteState('company-portal');
  }
  if (normalized === '/builder/projects/new') return withRouteState('builder-project-new');
  if (normalized === '/projects') return withRouteState('projects');
  if (normalized === '/invest') return withRouteState('invest');
  if (normalized === '/ai-services') return withRouteState('ai-services');
  if (normalized === '/construct-with-us') return withRouteState('construct-with-us');
  if (normalized === '/early-supporters') return withRouteState('early-supporters');
  if (normalized === '/layout-units') return withRouteState('layout-units-floor-detail');
  if (normalized === '/layout-units/builder') return withRouteState('layout-units-builder');
  if (normalized === '/layout-units/units') return withRouteState('layout-units-list');
  if (normalized === '/building-materials') return withRouteState('building-materials');
  if (normalized === '/infrastructure' || normalized === '/infrastructure-tracker') {
    return withRouteState('infrastructure');
  }
  if (normalized === '/insights/news') return withRouteState('insights-news');
  if (normalized === '/insights/market') return withRouteState('insights-market');
  if (normalized === '/insights/projects') return withRouteState('insights-projects');
  if (normalized === '/insights/compare') return withRouteState('insights-compare');
  if (normalized === '/add-property') return withRouteState('add-property');
  if (normalized === '/buy') return withRouteState('buy');
  if (normalized === '/rent') return withRouteState('rent');
  if (normalized === '/new-launch') return withRouteState('new-launch');
  if (normalized === '/commercial') return withRouteState('commercial');
  if (normalized === '/plots-land') return withRouteState('plots-land');
  if (normalized === '/sell' || normalized === '/sell/add') return withRouteState('sell-property');
  if (normalized === '/rent/add') return withRouteState('rent-property');
  if (normalized === '/about') return withRouteState('about');
  if (normalized === '/blog') return withRouteState('blog');
  if (normalized === '/press') return withRouteState('press');
  if (normalized === '/help-center') return withRouteState('help-center');
  if (normalized === '/contact') return withRouteState('contact');
  if (normalized === '/faq') return withRouteState('faq');
  if (normalized === '/privacy') return withRouteState('privacy');
  if (normalized === '/terms') return withRouteState('terms');
  if (normalized === '/cookies') return withRouteState('cookies');
  if (normalized === '/security') return withRouteState('security');
  if (normalized === '/career') return withRouteState('career');
  if (normalized === '/unsubscribe') return withRouteState('unsubscribe');
  if (normalized === '/buy-map') return withRouteState('buy-map');
  if (normalized === '/buy-details') return withRouteState('buy');
  if (normalized === '/rent-map') return withRouteState('rent-map');
  if (normalized === '/rent-details') return withRouteState('rent');
  if (normalized === '/property-details') return withRouteState('property-details');
  if (normalized === '/rent-short-term') return withRouteState('rent-short-term');
  if (normalized === '/rent-co-living') return withRouteState('rent-co-living');
  if (normalized === '/group-deals') return withRouteState('group-deals');
  if (normalized === '/admin/group-deals') return withRouteState('admin-group-deals');
  if (normalized === '/admin/infra/add') return withRouteState('admin-infra-add');
  if (normalized === '/admin/infra/manage') return withRouteState('admin-infra-manage');
  if (normalized === '/admin/infra/subscribers') return withRouteState('admin-infra-subscribers');
  if (normalized === '/admin/infra/inbox') return withRouteState('admin-infra-inbox');
  if (normalized === '/admin/infra/preview') return withRouteState('admin-infra-inbox');
  if (normalized === '/saved-rentals') return withRouteState('saved-rentals');
  if (normalized === '/saved') return withRouteState('saved');
  if (normalized === '/owner/dashboard') return withRouteState('owner-dashboard');
  if (normalized === '/owner/add-property') return withRouteState('owner-add-property');
  if (normalized === '/owner/edit-property') return withRouteState('owner-listings');
  if (normalized === '/owner/listings') return withRouteState('owner-listings');
  if (normalized === '/owner/rentals') return withRouteState('owner-rentals');
  if (normalized === '/owner/leads') return withRouteState('owner-leads');
  if (normalized === '/owner/analytics') return withRouteState('owner-analytics');
  if (normalized === '/owner/subscription') return withRouteState('owner-subscription');
  if (normalized === '/owner/payments') return withRouteState('owner-payments');
  if (normalized === '/owner/profile') return withRouteState('owner-profile');
  if (normalized === '/dashboard') return withRouteState('dashboard');
  if (normalized === '/profile') return withRouteState('profile');
  if (normalized === '/messages') return withRouteState('messages');
  if (normalized === '/favorites') return withRouteState('favorites');
  if (normalized === '/compare') return withRouteState('compare');
  if (normalized === '/notifications') return withRouteState('notifications');
  if (normalized === '/saved-searches') return withRouteState('saved-searches');
  if (normalized === '/developer') return withRouteState('developer');
  if (normalized === '/login') return withRouteState('login');
  if (normalized === '/register') return withRouteState('register');
  if (normalized === '/forgot-password') return withRouteState('forgot-password');
  if (normalized === '/admin/login') return withRouteState('admin-login');
  if (normalized === '/team/login') return withRouteState('team-login');
  if (normalized === '/admin/register') return withRouteState('admin-register');
  if (normalized === '/team/register') return withRouteState('team-register');
  if (normalized === '/admin-desk') return withRouteState('admin-desk');
  if (normalized === '/team-desk') return withRouteState('team-desk');
  if (normalized === '/area-insights') return withRouteState('area-insights');
  if (normalized === '/affordability') return withRouteState('affordability');
  if (normalized === '/buyer-journey') return withRouteState('buyer-journey');
  if (normalized === '/alerts') return withRouteState('alerts');
  if (normalized === '/compare-plus') return withRouteState('compare-plus');
  if (normalized === '/builder-trust') return withRouteState('builder-trust');
  if (normalized === '/site-visits') return withRouteState('site-visits');
  if (normalized === '/legal-assist') return withRouteState('legal-assist');
  if (normalized === '/investment-screener') return withRouteState('investment-screener');
  if (normalized === '/wallet') return withRouteState('wallet');
  if (normalized === '/referrals') return withRouteState('referrals');
  if (normalized === '/checkout') return withRouteState('checkout');
  if (normalized === '/pricing') return withRouteState('pricing');
  if (normalized === '/collaborations') return withRouteState('collaborations');

  return withRouteState(null);
}

export function buildHrefForView(view: AppView, options?: NavigationOptions): string {
  if (view === 'home') return '/';
  if (view === 'about') return '/about';
  if (view === 'blog') return '/blog';
  if (view === 'press') return '/press';
  if (view === 'help-center') return '/help-center';
  if (view === 'contact') return '/contact';
  if (view === 'faq') return '/faq';
  if (view === 'privacy') return '/privacy';
  if (view === 'terms') return '/terms';
  if (view === 'cookies') return '/cookies';
  if (view === 'security') return '/security';
  if (view === 'career') return '/career';
  if (view === 'pricing') return '/pricing';
  if (view === 'collaborations') return '/collaborations';
  if (view === 'unsubscribe') return '/unsubscribe';
  if (view === 'buy') return `/buy${normalizeSearchSuffix(options?.search)}`;
  if (view === 'rent') return '/rent';
  if (view === 'new-launch') return '/new-launch';
  if (view === 'commercial') return '/commercial';
  if (view === 'plots-land') return '/plots-land';
  if (view === 'e-auction') return '/e-auction';
  if (view === 'buy-map') return '/buy-map';
  if (view === 'buy-details') {
    const buyPropertyId = String(options?.buyPropertyId || '').trim();
    const buyPropertySlug = String(options?.buyPropertySlug || '').trim();
    return buyPropertyId
      ? buyPropertySlug
        ? `/buy/${slugifySegment(buyPropertySlug, 'property')}-${encodeURIComponent(buyPropertyId)}`
        : `/buy-details/${encodeURIComponent(buyPropertyId)}`
      : '/buy';
  }
  if (view === 'rent-map') return '/rent-map';
  if (view === 'rent-details') {
    const rentalId = String(options?.rentalId || '').trim();
    const rentalSlug = String(options?.rentalSlug || '').trim();
    return rentalId
      ? rentalSlug
        ? `/rent/${slugifySegment(rentalSlug, 'rental')}-${encodeURIComponent(rentalId)}`
        : `/rent-details/${encodeURIComponent(rentalId)}`
      : '/rent';
  }
  if (view === 'rent-short-term') return '/rent-short-term';
  if (view === 'rent-co-living') return '/rent-co-living';
  if (view === 'group-deals') return '/group-deals';
  if (view === 'group-deal-details') {
    const groupDealCode = String(options?.groupDealCode || '').trim();
    return groupDealCode ? `/group-deals/${encodeURIComponent(groupDealCode)}` : '/group-deals';
  }
  if (view === 'admin-group-deals') return '/admin/group-deals';
  if (view === 'admin-infra-add') return '/admin/infra/add';
  if (view === 'admin-infra-manage') return '/admin/infra/manage';
  if (view === 'admin-infra-subscribers') return '/admin/infra/subscribers';
  if (view === 'admin-infra-inbox') return '/admin/infra/inbox';
  if (view === 'admin-infra-preview') {
    const infraPreviewId = String(options?.infraPreviewId || '').trim();
    return infraPreviewId
      ? `/admin/infra/preview/${encodeURIComponent(infraPreviewId)}`
      : '/admin/infra/inbox';
  }
  if (view === 'saved-rentals') return '/saved-rentals';
  if (view === 'saved') return '/saved';
  if (view === 'owner-dashboard') return '/owner/dashboard';
  if (view === 'owner-add-property') return '/owner/add-property';
  if (view === 'owner-edit-property') {
    const ownerPropertyId = String(options?.ownerPropertyId || '').trim();
    return ownerPropertyId
      ? `/owner/edit-property/${encodeURIComponent(ownerPropertyId)}`
      : '/owner/listings';
  }
  if (view === 'owner-listings') return '/owner/listings';
  if (view === 'owner-rentals') return '/owner/rentals';
  if (view === 'owner-leads') return '/owner/leads';
  if (view === 'owner-analytics') return '/owner/analytics';
  if (view === 'owner-subscription') return '/owner/subscription';
  if (view === 'owner-payments') return '/owner/payments';
  if (view === 'owner-profile') return '/owner/profile';
  if (view === 'dashboard') return '/dashboard';
  if (view === 'profile') return '/profile';
  if (view === 'messages') return '/messages';
  if (view === 'favorites') return '/favorites';
  if (view === 'compare') return '/compare';
  if (view === 'notifications') return '/notifications';
  if (view === 'saved-searches') return '/saved-searches';
  if (view === 'developer') return '/developer';
  if (view === 'login') return `/login${normalizeSearchSuffix(options?.search)}`;
  if (view === 'register') return `/register${normalizeSearchSuffix(options?.search)}`;
  if (view === 'forgot-password') return `/forgot-password${normalizeSearchSuffix(options?.search)}`;
  if (view === 'admin-login') return '/admin/login';
  if (view === 'team-login') return '/team/login';
  if (view === 'admin-register') return '/admin/register';
  if (view === 'team-register') return '/team/register';
  if (view === 'admin-desk') return '/admin-desk';
  if (view === 'team-desk') return '/team-desk';
  if (view === 'area-insights') return '/area-insights';
  if (view === 'affordability') return '/affordability';
  if (view === 'buyer-journey') return '/buyer-journey';
  if (view === 'alerts') return '/alerts';
  if (view === 'compare-plus') return '/compare-plus';
  if (view === 'builder-trust') return '/builder-trust';
  if (view === 'site-visits') return '/site-visits';
  if (view === 'legal-assist') return '/legal-assist';
  if (view === 'investment-screener') return '/investment-screener';
  if (view === 'wallet') return '/wallet';
  if (view === 'referrals') return '/referrals';
  if (view === 'checkout') return `/checkout${normalizeSearchSuffix(options?.search)}`;
  if (view === 'early-supporters') return '/early-supporters';
  if (view === 'dealers-builders') return '/dealers-builders';
  if (view === 'company-login') return '/company/login';
  if (view === 'company-register') return '/company/register';
  if (view === 'company-portal') return '/company-portal';
  if (view === 'dealers-builders-company') {
    const companyId = Number(options?.companyId || 0);
    return companyId > 0 ? `/dealers-builders/${companyId}` : '/dealers-builders';
  }
  if (view === 'builder-project-new') return '/builder/projects/new';
  if (view === 'project-details') {
    const projectId = Number(options?.projectId || 0);
    return projectId > 0 ? `/projects/${projectId}` : '/projects';
  }
  if (view === 'projects') return '/projects';
  if (view === 'invest') return '/invest';
  if (view === 'ai-services') return `/ai-services${normalizeSearchSuffix(options?.search)}`;
  if (view === 'construct-with-us') return '/construct-with-us';
  if (view === 'layout-units-floor-detail') return '/layout-units';
  if (view === 'layout-units-builder') return '/layout-units/builder';
  if (view === 'layout-units-list') return '/layout-units/units';
  if (view === 'building-materials') return `/building-materials${normalizeSearchSuffix(options?.search)}`;
  if (view === 'infrastructure') return '/infrastructure';
  if (view === 'insights-news') return '/insights/news';
  if (view === 'insights-market') return '/insights/market';
  if (view === 'insights-projects') return '/insights/projects';
  if (view === 'insights-compare') return '/insights/compare';
  if (view === 'add-property') return '/add-property';
  if (view === 'sell-property') return '/sell';
  if (view === 'rent-property') return '/rent/add';
  if (view === 'property-details') {
    const propertyReference = String(options?.propertyReference || '').trim();
    return propertyReference
      ? `/property-details/${encodeURIComponent(propertyReference)}`
      : '/property-details';
  }
  return '/';
}
