import { useMemo, useState } from 'react';
import {
  Clipboard,
  ExternalLink,
  LogOut,
  RefreshCcw,
  Search,
  ShieldCheck,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { API_BASE_URL } from '@/lib/api';
import { apiRequest } from '@/lib/http';
import { readOrCreateDeviceId, type AuthUser } from '@/lib/session';
import { APP_VIEWS, type AppView } from '@/lib/views';

interface DeveloperPageProps {
  token: string;
  user: AuthUser | null;
  onNavigate: (view: AppView) => void;
  onLogout: () => void;
}

function titleCase(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

function accessLabel(view: AppView): { label: string; className: string } {
  const privateViews: AppView[] = [
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
  if (privateViews.includes(view)) {
    return { label: 'Private', className: 'border-blue-200 bg-blue-50 text-blue-700' };
  }
  if (view === 'team-desk') {
    return { label: 'Team', className: 'border-indigo-200 bg-indigo-50 text-indigo-700' };
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
  ];
  if (adminViews.includes(view)) {
    return { label: 'Admin', className: 'border-amber-200 bg-amber-50 text-amber-700' };
  }
  if (
    view === 'login' ||
    view === 'admin-login' ||
    view === 'team-login' ||
    view === 'register' ||
    view === 'forgot-password' ||
    view === 'admin-register' ||
    view === 'team-register'
  ) {
    return { label: 'Auth', className: 'border-slate-200 bg-slate-50 text-slate-700' };
  }
  return { label: 'Public', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
}

async function copyToClipboard(value: string) {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    toast.success('Copied to clipboard');
  } catch {
    toast.error('Copy failed (browser blocked clipboard access)');
  }
}

export default function DeveloperPage({ token, user, onNavigate, onLogout }: DeveloperPageProps) {
  const [isTesting, setIsTesting] = useState(false);
  const deviceId = useMemo(() => readOrCreateDeviceId(), []);
  const isAuthenticated = Boolean(token && user);
  const visibleViews = useMemo(
    () => APP_VIEWS.filter((view) => view !== 'admin-register' && view !== 'team-register'),
    []
  );

  const tokenPreview = useMemo(() => {
    if (!token) return '-';
    if (token.length <= 18) return token;
    return `${token.slice(0, 10)}...${token.slice(-6)}`;
  }, [token]);

  const handleTestAuthMe = async () => {
    setIsTesting(true);
    try {
      const response = await apiRequest<{ user: unknown }>('/auth/me', {}, token);
      toast.success('API OK: /auth/me', {
        description:
          response && typeof response === 'object'
            ? 'Session is valid.'
            : 'Response received.',
      });
    } catch (err) {
      toast.error('API failed: /auth/me', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <main className="pb-16 pt-24 text-slate-900">
      <div className="page-container space-y-6">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-emerald-50" />
            <div className="relative grid gap-5 p-6 lg:grid-cols-[1.3fr_0.7fr] lg:p-8">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
                  Developer Hub
                </p>
                <h1 className="text-3xl font-bold leading-tight text-slate-900 lg:text-4xl">
                  Debug, QA, and navigation shortcuts
                </h1>
                <p className="text-sm text-slate-600">
                  Use this page to verify all screens exist, test API connectivity, and quickly open any view.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white/85 p-4 shadow-sm backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Runtime
                </p>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">API</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(API_BASE_URL)}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700"
                      title="Copy API base URL"
                    >
                      <Clipboard className="h-3.5 w-3.5" />
                      Copy
                    </button>
                  </div>
                  <p className="break-all rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    {API_BASE_URL}
                  </p>

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <span className="text-slate-500">Device ID</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(deviceId)}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700"
                      title="Copy Device ID"
                    >
                      <Clipboard className="h-3.5 w-3.5" />
                      Copy
                    </button>
                  </div>
                  <p className="break-all rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    {deviceId}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Quick Actions</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Common actions while testing the site.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Button
                variant="outline"
                className="h-auto justify-start gap-3 rounded-2xl py-4"
                onClick={() => onNavigate('home')}
              >
                <Search className="h-5 w-5 text-blue-700" />
                <div className="text-left">
                  <p className="text-sm font-semibold">Back to Home</p>
                  <p className="text-xs text-slate-500">Portal landing view</p>
                </div>
              </Button>

              <Button
                variant="outline"
                className="h-auto justify-start gap-3 rounded-2xl py-4"
                onClick={() => onNavigate(isAuthenticated ? 'dashboard' : 'login')}
              >
                <User className="h-5 w-5 text-blue-700" />
                <div className="text-left">
                  <p className="text-sm font-semibold">{isAuthenticated ? 'Open Dashboard' : 'Open Login'}</p>
                  <p className="text-xs text-slate-500">
                    {isAuthenticated ? 'Private views' : 'Sign in required'}
                  </p>
                </div>
              </Button>

              <Button
                variant="outline"
                className="h-auto justify-start gap-3 rounded-2xl py-4"
                onClick={handleTestAuthMe}
                disabled={!token || isTesting}
                title={!token ? 'Login to enable this test' : 'Test /auth/me'}
              >
                <RefreshCcw className="h-5 w-5 text-blue-700" />
                <div className="text-left">
                  <p className="text-sm font-semibold">Test API: /auth/me</p>
                  <p className="text-xs text-slate-500">Validates token and backend reachability</p>
                </div>
              </Button>

              <Button
                variant="outline"
                className="h-auto justify-start gap-3 rounded-2xl py-4"
                onClick={onLogout}
                disabled={!isAuthenticated}
              >
                <LogOut className="h-5 w-5 text-blue-700" />
                <div className="text-left">
                  <p className="text-sm font-semibold">Logout</p>
                  <p className="text-xs text-slate-500">Clears session and returns to Home</p>
                </div>
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">Session</h2>
            <p className="mt-1 text-sm text-slate-600">Current authentication state.</p>

            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Status</span>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    isAuthenticated
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-slate-50 text-slate-700'
                  }`}
                >
                  {isAuthenticated ? 'Authenticated' : 'Guest'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">User</span>
                <span className="font-semibold text-slate-900">{user?.name || '-'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Role</span>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                  <ShieldCheck className="h-3.5 w-3.5 text-blue-700" />
                  {user?.role || '-'}
                </span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500">Token</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(token)}
                    disabled={!token}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    title={!token ? 'No token available' : 'Copy token'}
                  >
                    <Clipboard className="h-3.5 w-3.5" />
                    Copy
                  </button>
                </div>
                <p className="break-all rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  {tokenPreview}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">All Views</h2>
              <p className="text-sm text-slate-600">
                This is the canonical view list. Click any button to verify that page exists and renders.
              </p>
            </div>
            <Button
              variant="outline"
              className="mt-2 w-full rounded-xl sm:mt-0 sm:w-auto"
              onClick={() => copyToClipboard(visibleViews.join(', '))}
            >
              <Clipboard className="mr-2 h-4 w-4" />
              Copy View List
            </Button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleViews.map((view) => {
              const access = accessLabel(view);
              return (
                <div
                  key={view}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{titleCase(view)}</p>
                      <p className="mt-1 font-mono text-xs text-slate-500">{view}</p>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${access.className}`}>
                      {access.label}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <Button className="h-9 flex-1 rounded-xl bg-blue-700 text-white hover:bg-blue-800" onClick={() => onNavigate(view)}>
                      Open
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
