import { Search, MapPin, SlidersHorizontal, Home } from 'lucide-react';

interface EmptyStateProps {
  /** Main headline */
  title?: string;
  /** Description text */
  description?: string;
  /** Type of empty state — determines the icon shown */
  variant?: 'no-results' | 'no-properties' | 'no-data' | 'error';
  /** Optional CTA button */
  actionLabel?: string;
  /** Handler for the CTA button */
  onAction?: () => void;
  /** Additional class names */
  className?: string;
}

const VARIANT_CONFIG = {
  'no-results': {
    icon: Search,
    defaultTitle: 'No results found',
    defaultDescription: 'Try adjusting your filters or search in a different area.',
    gradient: 'from-blue-50 to-slate-50',
    iconBg: 'bg-blue-100 text-blue-600',
  },
  'no-properties': {
    icon: Home,
    defaultTitle: 'No properties available',
    defaultDescription: 'Check back later or explore other cities and localities.',
    gradient: 'from-indigo-50 to-slate-50',
    iconBg: 'bg-indigo-100 text-indigo-600',
  },
  'no-data': {
    icon: MapPin,
    defaultTitle: 'Nothing here yet',
    defaultDescription: 'Data will appear here once available.',
    gradient: 'from-slate-50 to-white',
    iconBg: 'bg-slate-200 text-slate-500',
  },
  error: {
    icon: SlidersHorizontal,
    defaultTitle: 'Something went wrong',
    defaultDescription: 'Please try refreshing or adjusting your search criteria.',
    gradient: 'from-red-50 to-slate-50',
    iconBg: 'bg-red-100 text-red-600',
  },
} as const;

export default function EmptyState({
  title,
  description,
  variant = 'no-results',
  actionLabel,
  onAction,
  className = '',
}: EmptyStateProps) {
  const config = VARIANT_CONFIG[variant];
  const Icon = config.icon;

  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-gradient-to-b ${config.gradient} px-6 py-12 text-center ${className}`}
    >
      {/* Animated icon container */}
      <div className="relative">
        <div className={`flex h-16 w-16 items-center justify-center rounded-2xl ${config.iconBg} shadow-sm`}>
          <Icon className="h-7 w-7" />
        </div>
        {/* Subtle pulse ring */}
        <div className={`absolute inset-0 rounded-2xl ${config.iconBg} opacity-20 animate-ping`} style={{ animationDuration: '3s' }} />
      </div>

      <h3 className="mt-5 text-lg font-semibold text-slate-900">
        {title || config.defaultTitle}
      </h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
        {description || config.defaultDescription}
      </p>

      {/* Suggestions */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500">
          🏙 Try a different city
        </span>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500">
          🔍 Broaden your filters
        </span>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500">
          📍 Explore nearby areas
        </span>
      </div>

      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-6 rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 active:scale-[0.98]"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
