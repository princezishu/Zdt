import { useState, type ComponentType } from 'react';
import { Building2, ChevronRight, Menu, UserRound, X, type LucideProps } from 'lucide-react';

import Button from '@/components/marketing/Button';
import { cn } from '@/lib/utils';

export interface NavbarItem {
  label: string;
  onClick: () => void;
  icon?: ComponentType<LucideProps>;
  isHighlighted?: boolean;
}

export interface NavbarSection {
  title: string;
  items: NavbarItem[];
}

interface NavbarProps {
  primaryLinks: NavbarItem[];
  menuSections?: NavbarSection[];
  isAuthenticated: boolean;
  userName?: string;
  dashboardLabel?: string;
  onHome: () => void;
  onLogin: () => void;
  onRegister: () => void;
  onDashboard: () => void;
  onPostProperty: () => void;
  onProfile: () => void;
}

export default function Navbar({
  primaryLinks,
  menuSections = [],
  isAuthenticated,
  userName,
  dashboardLabel = 'Dashboard',
  onHome,
  onLogin,
  onRegister,
  onDashboard,
  onPostProperty,
  onProfile,
}: NavbarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const closeAndRun = (action: () => void) => () => {
    setIsOpen(false);
    action();
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-200/80 bg-white/92 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.4)] backdrop-blur-xl">
      <div className="page-container">
        <div className="relative flex h-20 items-center justify-between gap-4">
          <button
            type="button"
            onClick={onHome}
            className="group flex max-w-[calc(100%-64px)] items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/35 focus-visible:ring-offset-2 sm:max-w-none"
            aria-label="Go to ZDT Properties home"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white shadow-[0_14px_26px_-18px_rgba(15,23,42,0.75)]">
              <Building2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-base font-semibold leading-tight text-slate-950 sm:text-lg">
                ZDT Properties
              </span>
              <span className="hidden text-xs font-medium text-slate-500 sm:block">
                Premium verified real estate
              </span>
            </span>
          </button>

          <nav className="hidden min-w-0 items-center gap-1 sm:flex" aria-label="Primary navigation">
            {primaryLinks.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                className={cn(
                  'inline-flex h-10 items-center justify-center rounded-lg px-3 text-sm font-medium text-slate-600 transition duration-300 hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/35 focus-visible:ring-offset-2 lg:px-4',
                  item.isHighlighted && 'bg-amber-50 text-slate-950 hover:bg-amber-100'
                )}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="hidden items-center gap-2 sm:flex">
            {isAuthenticated ? (
              <>
                <Button
                  variant="outline"
                  fluidOnMobile={false}
                  onClick={onProfile}
                  leftIcon={<UserRound className="h-4 w-4" aria-hidden="true" />}
                  className="hidden lg:inline-flex"
                >
                  {userName || 'Profile'}
                </Button>
                <Button
                  variant="secondary"
                  fluidOnMobile={false}
                  onClick={onDashboard}
                  rightIcon={<ChevronRight className="h-4 w-4" aria-hidden="true" />}
                >
                  {dashboardLabel}
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" fluidOnMobile={false} onClick={onLogin}>
                  Login
                </Button>
                <Button variant="secondary" fluidOnMobile={false} onClick={onRegister}>
                  Sign up
                </Button>
              </>
            )}
            <Button variant="primary" fluidOnMobile={false} onClick={onPostProperty}>
              Post Property
            </Button>
          </div>

          <button
            type="button"
            onClick={() => setIsOpen((value) => !value)}
            className="absolute right-0 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-800 shadow-sm transition duration-300 hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/35 focus-visible:ring-offset-2 sm:hidden"
            aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={isOpen}
          >
            {isOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {isOpen ? (
        <div className="border-t border-slate-200 bg-white shadow-[0_24px_40px_-30px_rgba(15,23,42,0.35)] sm:hidden">
          <div className="page-container max-h-[calc(100dvh-80px)] overflow-y-auto py-4">
            <div className="grid gap-2">
              {primaryLinks.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={`mobile-${item.label}`}
                    type="button"
                    onClick={closeAndRun(item.onClick)}
                    className={cn(
                      'flex min-h-12 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-4 text-left text-sm font-medium text-slate-700 transition duration-300 hover:border-slate-300 hover:bg-slate-50',
                      item.isHighlighted && 'border-amber-200 bg-amber-50 text-slate-950'
                    )}
                  >
                    <span className="inline-flex items-center gap-3">
                      {Icon ? <Icon className="h-4 w-4 text-slate-500" aria-hidden="true" /> : null}
                      {item.label}
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  </button>
                );
              })}
            </div>

            {menuSections.map((section) => (
              <div key={section.title} className="mt-5">
                <p className="mb-2 px-1 text-xs font-semibold uppercase text-slate-500">{section.title}</p>
                <div className="grid gap-2">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={`${section.title}-${item.label}`}
                        type="button"
                        onClick={closeAndRun(item.onClick)}
                        className="flex min-h-12 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-4 text-left text-sm font-medium text-slate-700 transition duration-300 hover:border-slate-300 hover:bg-slate-50"
                      >
                        <span className="inline-flex items-center gap-3">
                          {Icon ? <Icon className="h-4 w-4 text-slate-500" aria-hidden="true" /> : null}
                          {item.label}
                        </span>
                        <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="mt-5 grid gap-2">
              {isAuthenticated ? (
                <>
                  <Button variant="secondary" onClick={closeAndRun(onDashboard)}>
                    {dashboardLabel}
                  </Button>
                  <Button variant="outline" onClick={closeAndRun(onProfile)}>
                    {userName || 'Profile'}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="secondary" onClick={closeAndRun(onRegister)}>
                    Sign up
                  </Button>
                  <Button variant="outline" onClick={closeAndRun(onLogin)}>
                    Login
                  </Button>
                </>
              )}
              <Button variant="primary" onClick={closeAndRun(onPostProperty)}>
                Post Property
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
