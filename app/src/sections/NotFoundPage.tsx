import { useEffect } from 'react';
import { applySeo } from '@/lib/seo';
import { Home, Search, ArrowRight, Building2, MapPin, HelpCircle } from 'lucide-react';

interface NotFoundPageProps {
  onOpenHome: () => void;
  onOpenBuy: () => void;
  onOpenRent: () => void;
  onOpenHelpCenter: () => void;
}

export default function NotFoundPage({ onOpenHome, onOpenBuy, onOpenRent, onOpenHelpCenter }: NotFoundPageProps) {
  useEffect(() => {
    applySeo({
      title: 'Page Not Found | ZDT Realty',
      description: 'The page you were looking for could not be found. Browse verified properties or return to the homepage.',
      noIndex: true,
    });
  }, []);

  return (
    <section className="portal-mobile-page flex min-h-screen items-center justify-center pb-16 pt-28 text-slate-900">
      <div className="page-container portal-mobile-stack max-w-2xl text-center">
        {/* Animated 404 */}
        <div className="relative mx-auto mb-8">
          <p className="text-[120px] font-black leading-none text-slate-100 sm:text-[180px]">404</p>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
              <Search className="h-10 w-10 text-slate-400" />
            </div>
          </div>
        </div>

        <h1 className="text-3xl font-semibold text-slate-900">Page Not Found</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-500">
          The page you're looking for may have been moved, removed, or doesn't exist.
          Let us help you find what you need.
        </p>

        {/* Quick actions */}
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onOpenHome}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Home className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Go to Homepage</p>
              <p className="text-xs text-slate-500">Start fresh from the main page</p>
            </div>
            <ArrowRight className="ml-auto h-4 w-4 text-slate-400" />
          </button>

          <button
            type="button"
            onClick={onOpenBuy}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Buy Properties</p>
              <p className="text-xs text-slate-500">Browse verified listings</p>
            </div>
            <ArrowRight className="ml-auto h-4 w-4 text-slate-400" />
          </button>

          <button
            type="button"
            onClick={onOpenRent}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Rent Homes</p>
              <p className="text-xs text-slate-500">Find owner-verified rentals</p>
            </div>
            <ArrowRight className="ml-auto h-4 w-4 text-slate-400" />
          </button>

          <button
            type="button"
            onClick={onOpenHelpCenter}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
              <HelpCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Help Center</p>
              <p className="text-xs text-slate-500">Get support from our team</p>
            </div>
            <ArrowRight className="ml-auto h-4 w-4 text-slate-400" />
          </button>
        </div>

        <p className="mt-8 text-xs text-slate-400">
          If you believe this is an error, please{' '}
          <button type="button" onClick={onOpenHelpCenter} className="text-blue-600 hover:underline">
            contact support
          </button>.
        </p>
      </div>
    </section>
  );
}
