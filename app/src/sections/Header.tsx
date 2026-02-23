import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  BriefcaseBusiness,
  Building2,
  Compass,
  Home,
  Heart,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  X,
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
import {
  NOTIFICATIONS_CHANGED_EVENT,
  readNotifications,
} from '@/lib/notificationsStore';

type HeaderUserRole = UserRole | 'owner' | 'agent' | 'builder';

interface HeaderProps {
  onLogin: () => void;
  onRegister: () => void;
  onHome: () => void;
  onBuy: () => void;
  onRent: () => void;
  onProjects: () => void;
  onInfrastructure: () => void;
  onGroupDeals: () => void;
  onPostProperty: () => void;
  onOwnerDashboard: () => void;
  onDealersBuilders: () => void;
  onMessages: () => void;
  onNotifications: () => void;
  onCompare: () => void;
  onDashboard: () => void;
  onTeamDesk: () => void;
  onAdminDesk: () => void;
  onFavorites: () => void;
  onProfile: () => void;
  isAuthenticated: boolean;
  userRole: HeaderUserRole | null;
  isMainAdmin: boolean;
  userName?: string;
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
  onInfrastructure,
  onGroupDeals,
  onPostProperty,
  onOwnerDashboard,
  onDealersBuilders,
  onMessages,
  onNotifications,
  onCompare: _onCompare,
  onDashboard,
  onTeamDesk,
  onAdminDesk,
  onFavorites,
  onProfile,
  isAuthenticated,
  userRole,
  isMainAdmin,
  userName,
}: HeaderProps) {
  const [isTabletMenuOpen, setIsTabletMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const lastScrollYRef = useRef(0);

  const isTeamMemberOrAdmin = userRole === 'team_member' || userRole === 'admin';
  const isAdmin = userRole === 'admin';
  const showOwnerPanelEntry = isAuthenticated;

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
    window.location.reload();
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

  const desktopNavLinks = [
    { label: 'For Buyers', onClick: onBuy },
    { label: 'For Tenants', onClick: onRent },
    { label: 'For Owners', onClick: onPostProperty },
    { label: 'For Dealers/Builders', onClick: onDealersBuilders },
    { label: 'Infrastructure Tracker', onClick: onInfrastructure },
    { label: 'Group Deals', onClick: onGroupDeals },
  ];
  const desktopPillButtonClass =
    'inline-flex h-11 shrink-0 items-center rounded-full border border-brand-gray2 bg-brand-gray1 px-5 text-sm font-semibold leading-none text-slate-700 transition hover:border-brand-primary/70 hover:text-brand-primary';
  const mobileSheetSectionTitleClass =
    'px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9AA4B2]';
  const mobileSheetItemBaseClass =
    'flex w-full items-center gap-2 rounded-xl border border-[#243452] bg-[#111C33] px-3.5 py-2.5 text-left text-sm font-medium text-[#F8FAFC] transition hover:bg-[#162643]';

  return (
    <header
      className={`fixed left-0 right-0 top-0 z-50 border-b border-brand-gray2/80 bg-white/95 backdrop-blur-lg transition-transform duration-300 will-change-transform ${
        isHidden ? '-translate-y-full' : 'translate-y-0'
      }`}
    >
      <div className="page-container py-2.5 sm:py-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:gap-3 xl:grid-cols-[minmax(260px,auto)_minmax(0,1fr)_auto]">
          <button type="button" onClick={onHome} className="flex min-w-0 items-center text-left">
            <img
              src="/images/logo-wordmark.svg"
              alt="ZDT Realty"
              className="h-10 w-[150px] object-contain sm:h-11 sm:w-[170px] xl:h-14 xl:w-[230px]"
            />
          </button>

          <div className="hidden min-w-0 xl:flex">
            {isAuthenticated ? (
              <div className="flex items-center gap-2 overflow-x-auto pb-0.5 text-sm text-slate-700">
                {desktopNavLinks.map((link) => (
                  <button
                    key={link.label}
                    type="button"
                    onClick={link.onClick}
                    className={desktopPillButtonClass}
                  >
                    {link.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={onProjects}
                  className={desktopPillButtonClass}
                >
                  New Projects
                </button>
              </div>
            ) : null}
          </div>

          <div className="hidden items-center gap-1.5 xl:flex">
            {isAuthenticated ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onNotifications}
                  className="h-11 w-11 rounded-xl text-slate-600 hover:text-brand-primary"
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
                  className="h-11 w-11 rounded-xl text-slate-600 hover:text-brand-primary"
                  aria-label="Messages"
                  title="Messages"
                >
                  <MessageCircle className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onFavorites}
                  className="h-11 w-11 rounded-xl text-slate-600 hover:text-brand-primary"
                  aria-label="Favorites"
                  title="Favorites"
                >
                  <Heart className="h-5 w-5" />
                </Button>
                <span className="inline-flex h-11 items-center rounded-full border border-brand-gray2 bg-brand-gray1 px-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-primary">
                  {roleLabel(userRole, isMainAdmin)}
                </span>
                <div className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onDashboard}
                    className="h-11 w-11 rounded-xl text-slate-600 hover:text-brand-primary"
                    aria-label="Dashboard"
                    title="Dashboard"
                  >
                    <LayoutDashboard className="h-5 w-5" />
                  </Button>
                  {showOwnerPanelEntry && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={onOwnerDashboard}
                      className="h-11 w-11 rounded-xl text-slate-600 hover:text-brand-primary"
                      aria-label="Owner Panel"
                      title="Owner Panel"
                    >
                      <Home className="h-5 w-5" />
                    </Button>
                  )}
                  {isTeamMemberOrAdmin && (
                    <Button
                    variant="ghost"
                    size="icon"
                    onClick={onTeamDesk}
                    className="h-11 w-11 rounded-xl text-slate-600 hover:text-brand-primary"
                    aria-label="Team Desk"
                    title="Team Desk"
                  >
                      <Users className="h-5 w-5" />
                    </Button>
                  )}
                  {isAdmin && (
                    <Button
                    variant="ghost"
                    size="icon"
                    onClick={onAdminDesk}
                    className="h-11 w-11 rounded-xl text-slate-600 hover:text-brand-primary"
                    aria-label="Admin Desk"
                    title="Admin Desk"
                  >
                      <ShieldCheck className="h-5 w-5" />
                    </Button>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={onProfile}
                  className="h-11 w-11 rounded-xl"
                  aria-label="Profile"
                  title="Profile"
                >
                  <UserRound className="h-5 w-5" />
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={onLogin}>
                  Login
                </Button>
                <Button onClick={onRegister} className="bg-brand-primary text-white hover:bg-brand-primary-dark">
                  Register
                </Button>
              </>
            )}
          </div>

          <div className="flex items-center justify-end justify-self-end md:hidden">
            <Drawer open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen} modal direction="bottom">
              <DrawerTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 rounded-xl border-slate-300 bg-white/95"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </DrawerTrigger>
              <DrawerContent
                role="dialog"
                aria-modal="true"
                aria-label="Mobile navigation menu"
                className="[&>div:first-child]:hidden max-h-[85vh] rounded-t-2xl border-0 bg-[#0F172A] p-0 text-[#F8FAFC]"
              >
                <DrawerTitle className="sr-only">Mobile Navigation</DrawerTitle>
                <DrawerDescription className="sr-only">
                  Navigate across dashboard, listings, builder tools, personal pages, and settings.
                </DrawerDescription>

                <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-[#2A3959]" />
                <div className="px-4 pb-4 pt-2">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 rounded-2xl border border-[#243452] bg-[#111C33] px-3.5 py-3">
                      <p className="truncate text-sm font-semibold text-[#F8FAFC]">{userName || 'Guest User'}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[#9AA4B2]">
                        {isAuthenticated ? roleLabel(userRole, isMainAdmin) : 'Visitor'}
                      </p>
                    </div>
                    <DrawerClose asChild>
                      <button
                        type="button"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#243452] bg-[#111C33] text-[#F8FAFC] hover:bg-[#162643]"
                        aria-label="Close menu"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </DrawerClose>
                  </div>

                  <div className="max-h-[62vh] space-y-3 overflow-y-auto pb-1">
                    <div className="space-y-2">
                      <p className={mobileSheetSectionTitleClass}>Primary</p>
                      <button
                        type="button"
                        onClick={closeMobileBottomSheetAnd(onDashboard)}
                        className={`${mobileSheetItemBaseClass} border-l-2 border-l-[#B08D57] bg-[#152542]`}
                      >
                        <LayoutDashboard className="h-4 w-4 shrink-0 text-[#B08D57]" />
                        <span>My Dashboard</span>
                      </button>
                      <button type="button" onClick={closeMobileBottomSheetAnd(onBuy)} className={mobileSheetItemBaseClass}>
                        <Compass className="h-4 w-4 shrink-0 text-[#9AA4B2]" />
                        <span>Buy Property</span>
                      </button>
                      <button type="button" onClick={closeMobileBottomSheetAnd(onRent)} className={mobileSheetItemBaseClass}>
                        <Building2 className="h-4 w-4 shrink-0 text-[#9AA4B2]" />
                        <span>Rent Property</span>
                      </button>
                      <button type="button" onClick={closeMobileBottomSheetAnd(onProjects)} className={mobileSheetItemBaseClass}>
                        <Landmark className="h-4 w-4 shrink-0 text-[#9AA4B2]" />
                        <span>New Launches</span>
                      </button>
                      <button
                        type="button"
                        onClick={closeMobileBottomSheetAnd(onGroupDeals)}
                        className={`${mobileSheetItemBaseClass} border-[#B08D57] text-[#B08D57]`}
                      >
                        <Users className="h-4 w-4 shrink-0 text-[#B08D57]" />
                        <span>Group Deals</span>
                      </button>
                    </div>

                    <div className="space-y-2">
                      <p className={mobileSheetSectionTitleClass}>For Builders</p>
                      <button
                        type="button"
                        onClick={closeMobileBottomSheetAnd(onPostProperty)}
                        className={`${mobileSheetItemBaseClass} border-[#B08D57] text-[#B08D57]`}
                      >
                        <Home className="h-4 w-4 shrink-0 text-[#B08D57]" />
                        <span>Post Property</span>
                      </button>
                      <button
                        type="button"
                        onClick={closeMobileBottomSheetAnd(onDealersBuilders)}
                        className={mobileSheetItemBaseClass}
                      >
                        <BriefcaseBusiness className="h-4 w-4 shrink-0 text-[#9AA4B2]" />
                        <span>Verified Builders</span>
                      </button>
                      <button
                        type="button"
                        onClick={closeMobileBottomSheetAnd(onInfrastructure)}
                        className={mobileSheetItemBaseClass}
                      >
                        <Landmark className="h-4 w-4 shrink-0 text-[#9AA4B2]" />
                        <span>Infrastructure Tracker</span>
                      </button>
                    </div>

                    <div className="space-y-2">
                      <p className={mobileSheetSectionTitleClass}>Personal</p>
                      <button
                        type="button"
                        onClick={closeMobileBottomSheetAnd(onMessages)}
                        className={mobileSheetItemBaseClass}
                      >
                        <MessageCircle className="h-4 w-4 shrink-0 text-[#9AA4B2]" />
                        <span>Messages</span>
                      </button>
                      <button
                        type="button"
                        onClick={closeMobileBottomSheetAnd(onNotifications)}
                        className={mobileSheetItemBaseClass}
                      >
                        <Bell className="h-4 w-4 shrink-0 text-[#9AA4B2]" />
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
                        <Heart className="h-4 w-4 shrink-0 text-[#9AA4B2]" />
                        <span>Favorites</span>
                      </button>
                    </div>

                    <div className="space-y-2">
                      <p className={mobileSheetSectionTitleClass}>Bottom</p>
                      <button
                        type="button"
                        onClick={closeMobileBottomSheetAnd(onMessages)}
                        className={mobileSheetItemBaseClass}
                      >
                        <MessageCircle className="h-4 w-4 shrink-0 text-[#9AA4B2]" />
                        <span>Help &amp; Support</span>
                      </button>
                      <button
                        type="button"
                        onClick={closeMobileBottomSheetAnd(onProfile)}
                        className={mobileSheetItemBaseClass}
                      >
                        <Settings className="h-4 w-4 shrink-0 text-[#9AA4B2]" />
                        <span>Settings</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleMobileLogout}
                        className={mobileSheetItemBaseClass}
                      >
                        <LogOut className="h-4 w-4 shrink-0 text-[#9AA4B2]" />
                        <span>Logout</span>
                      </button>
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
                  className="h-10 rounded-xl"
                >
                  Dashboard
                </Button>

                <Sheet open={isTabletMenuOpen} onOpenChange={setIsTabletMenuOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl">
                      <Menu className="h-5 w-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-[320px]">
                    <div className="space-y-5 pt-4">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
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
                        {isTeamMemberOrAdmin && (
                          <Button variant="outline" className="w-full justify-start" onClick={closeTabletMenuAnd(onTeamDesk)}>
                            Team Desk
                          </Button>
                        )}
                        {isAdmin && (
                          <Button variant="outline" className="w-full justify-start" onClick={closeTabletMenuAnd(onAdminDesk)}>
                            Admin Desk
                          </Button>
                        )}
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={onLogin} className="h-10 rounded-xl">
                  Login
                </Button>
                <Button onClick={onRegister} className="h-10 rounded-xl bg-brand-primary text-white hover:bg-brand-primary-dark">
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
