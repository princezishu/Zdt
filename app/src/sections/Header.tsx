import { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Building2,
  Compass,
  GitCompareArrows,
  Home,
  Heart,
  Landmark,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  MessageCircle,
  MousePointerClick,
  Settings,
  ShieldCheck,
  TrendingUp,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { clearSession, type UserRole } from '@/lib/session';
import { HelpCircle } from 'lucide-react';
import {
  NOTIFICATIONS_CHANGED_EVENT,
  readNotifications,
} from '@/lib/notificationsStore';

type HeaderUserRole = UserRole | 'owner' | 'agent' | 'builder';
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

const STRATEGIC_MODULE_LINKS: Array<{
  view: StrategicModuleView;
  label: string;
  icon: LucideIcon;
}> = [
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

interface HeaderProps {
  onLogin: () => void;
  onRegister: () => void;
  onHome: () => void;
  onBuy: () => void;
  onRent: () => void;
  onProjects: () => void;
  onConstructWithUs: () => void;
  onBuildingMaterials: () => void;
  onInfrastructure: () => void;
  onGroupDeals: () => void;
  onPostProperty: () => void;
  onOwnerDashboard: () => void;
  onDealersBuilders: () => void;
  onOpenStrategicModule: (view: StrategicModuleView) => void;
  onMessages: () => void;
  onNotifications: () => void;
  onCompare: () => void;
  onDashboard: () => void;
  onTeamDesk: () => void;
  onAdminDesk: () => void;
  onFavorites: () => void;
  onProfile: () => void;
  onPricing: () => void;
  isAuthenticated: boolean;
  userRole: HeaderUserRole | null;
  isMainAdmin: boolean;
  userName?: string;
  isWideLayout?: boolean;
}

function roleLabel(userRole: HeaderUserRole | null, isMainAdmin: boolean): string {
  if (isMainAdmin) return 'Main Admin';
  if (userRole === 'admin') return 'Admin';
  if (userRole === 'team_member') return 'Team Member';
  if (userRole === 'owner') return 'Owner';
  if (userRole === 'agent') return 'Agent';
  if (userRole === 'builder') return 'Builder';
  return 'User';
}

export default function Header({
  onLogin,
  onRegister,
  onHome,
  onBuy,
  onRent,
  onProjects,
  onConstructWithUs,
  onBuildingMaterials,
  onInfrastructure,
  onGroupDeals,
  onPostProperty,
  onOwnerDashboard,
  onDealersBuilders,
  onOpenStrategicModule,
  onMessages,
  onNotifications,
  onCompare,
  onDashboard,
  onTeamDesk,
  onAdminDesk,
  onFavorites,
  onProfile,
  onPricing,
  isAuthenticated,
  userRole,
  isMainAdmin,
  userName,
  isWideLayout = false,
}: HeaderProps) {
  const [isTabletMenuOpen, setIsTabletMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const lastScrollYRef = useRef(0);

  const canSeeTeamDesk = userRole === 'team_member' || (userRole === 'admin' && !isMainAdmin);
  const canSeeAdminDesk = userRole === 'admin' && isMainAdmin;
  const showOwnerPanelEntry = isAuthenticated;
  const mobileMainHubAction = canSeeAdminDesk ? onAdminDesk : canSeeTeamDesk ? onTeamDesk : onDashboard;
  const mobileMainHubLabel = canSeeAdminDesk ? 'Admin Desk' : canSeeTeamDesk ? 'Team Desk' : 'My Dashboard';

  const closeTabletMenuAnd =
    (action: () => void) => () => {
      setIsTabletMenuOpen(false);
      action();
    };

  const closeMobileBottomSheetAnd =
    (action: () => void) => () => {
      setIsMobileMenuOpen(false);
      action();
    };

  const handleMobileLogout = () => {
    clearSession();
    setIsMobileMenuOpen(false);
    setIsTabletMenuOpen(false);
    onLogin();
  };

  useEffect(() => {
    const syncBadges = () => {
      const notifications = readNotifications();
      setUnreadNotifications(notifications.filter((item) => !item.isRead).length);
    };

    syncBadges();

    const handleStorage = () => syncBadges();
    const handleNotificationsChanged = () => syncBadges();
    window.addEventListener('storage', handleStorage);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, handleNotificationsChanged);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, handleNotificationsChanged);
    };
  }, []);

  useEffect(() => {
    const isAnyMenuOpen = isTabletMenuOpen || isMobileMenuOpen;
    const thresholdPx = 12;
    const revealAtTopPx = 40;
    const hideAfterPx = 80;

    lastScrollYRef.current = window.scrollY || 0;
    let ticking = false;

    const update = () => {
      const currentY = window.scrollY || 0;
      const delta = currentY - lastScrollYRef.current;

      // Always reveal near top, and never auto-hide while the mobile menu is open.
      if (isAnyMenuOpen || currentY <= revealAtTopPx) {
        setIsHidden(false);
        lastScrollYRef.current = currentY;
        ticking = false;
        return;
      }

      if (Math.abs(delta) < thresholdPx) {
        ticking = false;
        return;
      }

      if (delta > 0 && currentY > hideAfterPx) {
        setIsHidden(true);
      } else if (delta < 0) {
        setIsHidden(false);
      }

      lastScrollYRef.current = currentY;
      ticking = false;
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, [isMobileMenuOpen, isTabletMenuOpen]);

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return;
    }

    if (!window.matchMedia('(max-width: 768px)').matches) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileMenuOpen]);

  const desktopNavLinks: Array<{
    label: string;
    onClick: () => void;
    visibilityClass?: string;
    accentClass?: string;
  }> =
    [
      { label: 'Buy', onClick: onBuy },
      { label: 'Rent', onClick: onRent },
      { label: 'Sell', onClick: onPostProperty, accentClass: 'zdt-header-pill-highlight' },
      {
        label: 'Construct',
        onClick: onConstructWithUs,
        visibilityClass: 'hidden min-[1450px]:inline-flex',
      },
      {
        label: 'ZDT Circular',
        onClick: onBuildingMaterials,
        visibilityClass: 'hidden min-[1580px]:inline-flex',
      },
      {
        label: 'Builders',
        onClick: onDealersBuilders,
        visibilityClass: 'hidden min-[1750px]:inline-flex',
      },
      { label: 'Projects', onClick: onProjects, visibilityClass: 'hidden min-[1880px]:inline-flex' },
      { label: 'Pricing', onClick: onPricing, visibilityClass: 'hidden min-[1880px]:inline-flex' },
    ];
  const desktopPillButtonClass =
    'zdt-header-pill inline-flex h-10 shrink-0 items-center rounded-[18px] px-4 text-[13px] font-semibold leading-none transition hover:-translate-y-0.5';
  const mobileSheetSectionTitleClass =
    'px-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-brand-primary/75';
  const mobileSheetItemBaseClass =
    'zdt-menu-surface flex w-full items-center gap-2 rounded-xl border px-3.5 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:border-brand-secondary/45 hover:bg-white hover:text-brand-primary';
  const headerIconButtonClass =
    'zdt-header-icon inline-flex items-center justify-center border h-11 w-11 rounded-xl text-slate-700 transition hover:-translate-y-0.5';
  const headerUtilityClusterClass =
    'zdt-header-secondary-cluster flex items-center gap-1.5 rounded-[22px] p-1.5';
  const headerActionClusterClass =
    'zdt-header-action-cluster flex items-center gap-1.5 rounded-2xl p-1.5';
  const headerHubButtonClass =
    'zdt-header-hub inline-flex h-11 shrink-0 items-center gap-2 rounded-[18px] px-4 text-sm font-semibold leading-none transition hover:-translate-y-0.5';
  const headerProfileCardClass =
    'zdt-header-profile-card inline-flex min-w-0 items-center gap-3 rounded-[24px] px-3.5 py-2 text-left transition hover:-translate-y-0.5';
  const quickProfileAction = isAuthenticated ? onProfile : onLogin;
  const quickProfileLabel = isAuthenticated ? 'Profile' : 'Login';
  const desktopIdentityTitle = isAuthenticated ? roleLabel(userRole, isMainAdmin) : 'Guest User';
  const desktopIdentityMeta = isAuthenticated ? userName || 'Verified access' : 'Sign in to continue';

  return (
    <header
      className={`zdt-header-shell fixed left-0 right-0 top-0 z-50 transition-transform duration-300 will-change-transform ${
        isHidden ? '-translate-y-full' : 'translate-y-0'
      }`}
    >
      <div className={`page-container zdt-header-inner py-2.5 sm:py-3 ${isWideLayout ? '!max-w-none' : ''}`}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:gap-3 xl:grid-cols-[minmax(300px,auto)_minmax(0,1fr)_auto] xl:gap-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={quickProfileAction}
              className={`${headerIconButtonClass} min-h-11 min-w-11 items-center justify-center xl:hidden`}
              aria-label={isAuthenticated ? 'Open profile' : 'Login'}
              title={quickProfileLabel}
            >
              <UserRound className="h-4 w-4" />
            </button>
            <div className="flex min-w-0 items-center">
              <button type="button" onClick={onHome} className="flex min-w-0 items-center text-left">
                <img
                  src="/images/logo-wordmark.svg"
                  alt="ZDT Realty"
                  className="block h-14 w-auto object-contain sm:h-16 xl:h-[4.5rem]"
                />
              </button>
            </div>
          </div>

          <div className="hidden min-w-0 overflow-hidden xl:flex xl:justify-center">
            <div className="zdt-header-nav-shell flex min-w-0 items-center gap-1.5 overflow-x-auto px-2 py-1.5 text-sm text-slate-700">
              {desktopNavLinks.map((link) => (
                <button
                  key={link.label}
                  type="button"
                  onClick={link.onClick}
                  className={`${desktopPillButtonClass} ${link.accentClass || ''} ${link.visibilityClass || ''}`.trim()}
                >
                  {link.label}
                </button>
              ))}
            </div>
          </div>

          <div className="hidden items-center gap-1.5 xl:flex">
            {isAuthenticated ? (
              <>
                <div className={headerUtilityClusterClass}>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onNotifications}
                    className={headerIconButtonClass}
                    aria-label="Notifications"
                    title="Notifications"
                  >
                    <span className="relative inline-flex h-5 w-5 items-center justify-center">
                      <Bell className="h-5 w-5" />
                      {unreadNotifications > 0 && (
                        <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                          {unreadNotifications > 99 ? '99+' : unreadNotifications}
                        </span>
                      )}
                    </span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onMessages}
                    className={headerIconButtonClass}
                    aria-label="Messages"
                    title="Messages"
                  >
                    <MessageCircle className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onCompare}
                    className={headerIconButtonClass}
                    aria-label="Compare"
                    title="Compare"
                  >
                    <GitCompareArrows className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onFavorites}
                    className={headerIconButtonClass}
                    aria-label="Favorites"
                    title="Favorites"
                  >
                    <Heart className="h-5 w-5" />
                  </Button>
                </div>
                <button
                  type="button"
                  onClick={onProfile}
                  className={headerProfileCardClass}
                  aria-label="Open profile"
                  title={desktopIdentityTitle}
                >
                  <span className="zdt-header-profile-avatar inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px]">
                    <UserRound className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-primary/65">
                      {desktopIdentityMeta}
                    </span>
                    <span className="block truncate text-sm font-semibold text-slate-900">
                      {desktopIdentityTitle}
                    </span>
                  </span>
                </button>
                <div className={headerActionClusterClass}>
                  <Button
                    variant="ghost"
                    onClick={onDashboard}
                    className={headerHubButtonClass}
                    aria-label="Dashboard"
                    title="Dashboard"
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    Dashboard
                  </Button>
                  {showOwnerPanelEntry && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={onOwnerDashboard}
                      className={headerIconButtonClass}
                      aria-label="Owner Panel"
                      title="Owner Panel"
                    >
                      <Home className="h-5 w-5" />
                    </Button>
                  )}
                  {canSeeTeamDesk && (
                    <Button
                    variant="ghost"
                    size="icon"
                    onClick={onTeamDesk}
                    className={headerIconButtonClass}
                    aria-label="Team Desk"
                    title="Team Desk"
                    >
                      <Users className="h-5 w-5" />
                    </Button>
                  )}
                  {canSeeAdminDesk && (
                    <Button
                    variant="ghost"
                    size="icon"
                    onClick={onAdminDesk}
                    className={headerIconButtonClass}
                    aria-label="Admin Desk"
                    title="Admin Desk"
                    >
                      <ShieldCheck className="h-5 w-5" />
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  onClick={onLogin}
                  className="h-11 rounded-xl px-[18px] text-brand-primary hover:bg-white/70"
                >
                  Login
                </Button>
                <Button onClick={onRegister} className="h-11 rounded-xl px-5 shadow-glow hover:shadow-glow-lg">
                  Register
                </Button>
              </>
            )}
          </div>

          <div className="flex items-center justify-end justify-self-end gap-2 md:hidden">
            <Drawer open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen} modal direction="bottom">
              <DrawerTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className={`${headerIconButtonClass} h-10 w-10`}
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </DrawerTrigger>
              <DrawerContent
                role="dialog"
                aria-modal="true"
                aria-label="Mobile navigation menu"
                className="zdt-menu-surface [&>div:first-child]:hidden max-h-[85dvh] rounded-t-[28px] border p-0 text-slate-900 shadow-2xl safe-bottom"
              >
                <DrawerTitle className="sr-only">Mobile Navigation</DrawerTitle>
                <DrawerDescription className="sr-only">
                  Navigate across dashboard, listings, builder tools, personal pages, and settings.
                </DrawerDescription>

                <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-brand-gold/55" />
                <div className="px-4 pb-4 pt-2">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="zdt-menu-surface min-w-0 flex-1 rounded-2xl border px-3.5 py-3">
                      <p className="truncate text-sm font-semibold text-slate-900">{userName || 'Guest User'}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-brand-primary">
                        {isAuthenticated ? roleLabel(userRole, isMainAdmin) : 'Visitor'}
                      </p>
                    </div>
                    <DrawerClose asChild>
                      <button
                        type="button"
                        className={`${headerIconButtonClass} inline-flex min-h-11 min-w-11 items-center justify-center`}
                        aria-label="Close menu"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </DrawerClose>
                  </div>

                  <div className="max-h-[62dvh] space-y-3 overflow-y-auto pb-1">
                    <div className="space-y-2">
                      <p className={mobileSheetSectionTitleClass}>Primary</p>
                      <button
                        type="button"
                        onClick={closeMobileBottomSheetAnd(mobileMainHubAction)}
                        className={`${mobileSheetItemBaseClass} border-brand-primary/35 bg-brand-gray1 text-brand-primary`}
                      >
                        <LayoutDashboard className="h-4 w-4 shrink-0 text-brand-primary" />
                        <span>{mobileMainHubLabel}</span>
                      </button>
                      <button type="button" onClick={closeMobileBottomSheetAnd(onBuy)} className={mobileSheetItemBaseClass}>
                        <Compass className="h-4 w-4 shrink-0 text-brand-gray3" />
                        <span>Buy Property</span>
                      </button>
                      <button type="button" onClick={closeMobileBottomSheetAnd(onRent)} className={mobileSheetItemBaseClass}>
                        <Building2 className="h-4 w-4 shrink-0 text-brand-gray3" />
                        <span>Rent Property</span>
                      </button>
                      <button type="button" onClick={closeMobileBottomSheetAnd(onPostProperty)} className={mobileSheetItemBaseClass}>
                        <Home className="h-4 w-4 shrink-0 text-brand-gray3" />
                        <span>Sell Property</span>
                      </button>
                      <button type="button" onClick={closeMobileBottomSheetAnd(onProjects)} className={mobileSheetItemBaseClass}>
                        <Landmark className="h-4 w-4 shrink-0 text-brand-gray3" />
                        <span>New Launches</span>
                      </button>
                      <button
                        type="button"
                        onClick={closeMobileBottomSheetAnd(onGroupDeals)}
                        className={`${mobileSheetItemBaseClass} border-brand-primary/35 bg-brand-gray1 text-brand-primary`}
                      >
                        <Users className="h-4 w-4 shrink-0 text-brand-primary" />
                        <span>Group Deals</span>
                      </button>
                    </div>

                    <div className="space-y-2">
                      <p className={mobileSheetSectionTitleClass}>For Builders</p>
                      <button
                        type="button"
                        onClick={closeMobileBottomSheetAnd(onPostProperty)}
                        className={`${mobileSheetItemBaseClass} border-brand-primary/35 bg-brand-gray1 text-brand-primary`}
                      >
                        <Home className="h-4 w-4 shrink-0 text-brand-primary" />
                        <span>Post Property</span>
                      </button>
                      <button
                        type="button"
                        onClick={closeMobileBottomSheetAnd(onDealersBuilders)}
                        className={mobileSheetItemBaseClass}
                      >
                        <BriefcaseBusiness className="h-4 w-4 shrink-0 text-brand-gray3" />
                        <span>Verified Builders</span>
                      </button>
                      <button
                        type="button"
                        onClick={closeMobileBottomSheetAnd(onInfrastructure)}
                        className={mobileSheetItemBaseClass}
                      >
                        <Landmark className="h-4 w-4 shrink-0 text-brand-gray3" />
                        <span>Infrastructure Tracker</span>
                      </button>
                    </div>

                    <div className="space-y-2">
                      <p className={mobileSheetSectionTitleClass}>Strategic Modules</p>
                      {STRATEGIC_MODULE_LINKS.map((item) => (
                        <button
                          key={item.view}
                          type="button"
                          onClick={closeMobileBottomSheetAnd(() => onOpenStrategicModule(item.view))}
                          className={mobileSheetItemBaseClass}
                        >
                          <item.icon className="h-4 w-4 shrink-0 text-brand-gray3" />
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>

                    <div className="space-y-2">
                      <p className={mobileSheetSectionTitleClass}>Personal</p>
                      <button
                        type="button"
                        onClick={closeMobileBottomSheetAnd(onMessages)}
                        className={mobileSheetItemBaseClass}
                      >
                        <MessageCircle className="h-4 w-4 shrink-0 text-brand-gray3" />
                        <span>Messages</span>
                      </button>
                      <button
                        type="button"
                        onClick={closeMobileBottomSheetAnd(onNotifications)}
                        className={mobileSheetItemBaseClass}
                      >
                        <Bell className="h-4 w-4 shrink-0 text-brand-gray3" />
                        <span className="inline-flex items-center gap-2">
                          Notifications
                          {unreadNotifications > 0 && (
                            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                              {unreadNotifications > 99 ? '99+' : unreadNotifications}
                            </span>
                          )}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={closeMobileBottomSheetAnd(onFavorites)}
                        className={mobileSheetItemBaseClass}
                      >
                        <Heart className="h-4 w-4 shrink-0 text-brand-gray3" />
                        <span>Favorites</span>
                      </button>
                    </div>

                    <div className="space-y-2">
                      <p className={mobileSheetSectionTitleClass}>More</p>
                      <button
                        type="button"
                        onClick={closeMobileBottomSheetAnd(onMessages)}
                        className={mobileSheetItemBaseClass}
                      >
                        <HelpCircle className="h-4 w-4 shrink-0 text-brand-gray3" />
                        <span>Help &amp; Support</span>
                      </button>
                      <button
                        type="button"
                        onClick={closeMobileBottomSheetAnd(onProfile)}
                        className={mobileSheetItemBaseClass}
                      >
                        <Settings className="h-4 w-4 shrink-0 text-brand-gray3" />
                        <span>Settings</span>
                      </button>
                      {isAuthenticated ? (
                        <button
                          type="button"
                          onClick={handleMobileLogout}
                          className={mobileSheetItemBaseClass}
                        >
                          <LogOut className="h-4 w-4 shrink-0 text-brand-gray3" />
                          <span>Logout</span>
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={closeMobileBottomSheetAnd(onLogin)}
                            className={`${mobileSheetItemBaseClass} border-brand-primary/35 bg-brand-gray1 text-brand-primary`}
                          >
                            <UserRound className="h-4 w-4 shrink-0 text-brand-primary" />
                            <span>Login</span>
                          </button>
                          <button
                            type="button"
                            onClick={closeMobileBottomSheetAnd(onRegister)}
                            className={`${mobileSheetItemBaseClass} border-brand-primary/35 bg-brand-gray1 text-brand-primary`}
                          >
                            <UserRound className="h-4 w-4 shrink-0 text-brand-primary" />
                            <span>Register</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </DrawerContent>
            </Drawer>
          </div>

          <div className="hidden items-center justify-end gap-1.5 justify-self-end sm:gap-2 md:flex xl:hidden">
            {isAuthenticated ? (
              <>
                <Button
                  variant="outline"
                  onClick={onDashboard}
                  className="zdt-header-pill h-10 rounded-xl"
                >
                  Dashboard
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={onProfile}
                  className={`${headerIconButtonClass} h-10 w-10`}
                  aria-label="Profile"
                  title="Profile"
                >
                  <UserRound className="h-4 w-4" />
                </Button>

                <Sheet open={isTabletMenuOpen} onOpenChange={setIsTabletMenuOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="icon" className={`${headerIconButtonClass} h-10 w-10`}>
                      <Menu className="h-5 w-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="zdt-menu-surface w-[320px] border-l border-slate-200/80">
                    <div className="space-y-5 pt-4">
                      <div className="zdt-menu-surface rounded-2xl border p-4">
                        <p className="text-sm font-semibold text-slate-900">{userName || 'Guest User'}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.16em] text-brand-primary">
                          {roleLabel(userRole, isMainAdmin)}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Button variant="outline" className="w-full justify-start" onClick={closeTabletMenuAnd(onBuy)}>
                          <Compass className="mr-2 h-4 w-4" />
                          Buy
                        </Button>
                        <Button variant="outline" className="w-full justify-start" onClick={closeTabletMenuAnd(onRent)}>
                          <Building2 className="mr-2 h-4 w-4" />
                          Rent
                        </Button>
                        <Button variant="outline" className="w-full justify-start" onClick={closeTabletMenuAnd(onProjects)}>
                          <Landmark className="mr-2 h-4 w-4" />
                          New Projects
                        </Button>
                        <Button variant="outline" className="w-full justify-start" onClick={closeTabletMenuAnd(onInfrastructure)}>
                          <Landmark className="mr-2 h-4 w-4" />
                          Infrastructure Tracker
                        </Button>
                        <Button variant="outline" className="w-full justify-start" onClick={closeTabletMenuAnd(onGroupDeals)}>
                          <Users className="mr-2 h-4 w-4" />
                          Group Deals
                        </Button>
                        <Button variant="outline" className="w-full justify-start" onClick={closeTabletMenuAnd(onPostProperty)}>
                          Post Property
                        </Button>
                        {showOwnerPanelEntry && (
                          <Button variant="outline" className="w-full justify-start" onClick={closeTabletMenuAnd(onOwnerDashboard)}>
                            <Home className="mr-2 h-4 w-4" />
                            Owner Panel
                          </Button>
                        )}
                        <Button variant="outline" className="w-full justify-start" onClick={closeTabletMenuAnd(onDealersBuilders)}>
                          <BriefcaseBusiness className="mr-2 h-4 w-4" />
                          Dealers/Builders
                        </Button>
                        <Button variant="outline" className="w-full justify-start" onClick={closeTabletMenuAnd(onNotifications)}>
                          <Bell className="mr-2 h-4 w-4" />
                          Notifications
                        </Button>
                        <Button variant="outline" className="w-full justify-start" onClick={closeTabletMenuAnd(onMessages)}>
                          <MessageCircle className="mr-2 h-4 w-4" />
                          Messages
                        </Button>
                        <Button variant="outline" className="w-full justify-start" onClick={closeTabletMenuAnd(onFavorites)}>
                          Favorites
                        </Button>
                        <Button variant="outline" className="w-full justify-start" onClick={closeTabletMenuAnd(onProfile)}>
                          Profile
                        </Button>
                        <div className="pt-2">
                          <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-gray3">
                            Strategic Modules
                          </p>
                          <div className="mt-2 grid gap-2">
                            {STRATEGIC_MODULE_LINKS.map((item) => (
                              <Button
                                key={`tablet-${item.view}`}
                                variant="outline"
                                className="w-full justify-start"
                                onClick={closeTabletMenuAnd(() => onOpenStrategicModule(item.view))}
                              >
                                <item.icon className="mr-2 h-4 w-4" />
                                {item.label}
                              </Button>
                            ))}
                          </div>
                        </div>
                        {canSeeTeamDesk && (
                          <Button variant="outline" className="w-full justify-start" onClick={closeTabletMenuAnd(onTeamDesk)}>
                            Team Desk
                          </Button>
                        )}
                        {canSeeAdminDesk && (
                          <Button variant="outline" className="w-full justify-start" onClick={closeTabletMenuAnd(onAdminDesk)}>
                            Admin Desk
                          </Button>
                        )}
                        <div className="pt-3 mt-1 border-t border-slate-200/80">
                          <Button
                            variant="outline"
                            className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => {
                              clearSession();
                              setIsTabletMenuOpen(false);
                              onLogin();
                            }}
                          >
                            <LogOut className="mr-2 h-4 w-4" />
                            Logout
                          </Button>
                        </div>
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={onBuy} className="zdt-header-pill h-10 rounded-xl">
                  Buy
                </Button>
                <Button variant="outline" onClick={onRent} className="zdt-header-pill h-10 rounded-xl">
                  Rent
                </Button>
                <Button variant="outline" onClick={onPostProperty} className="zdt-header-pill h-10 rounded-xl">
                  Sell
                </Button>
                <Button variant="ghost" onClick={onLogin} className="h-10 rounded-xl text-brand-primary hover:bg-white/70">
                  Login
                </Button>
                <Button onClick={onRegister} className="h-10 rounded-xl shadow-glow hover:shadow-glow-lg">
                  Register
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
