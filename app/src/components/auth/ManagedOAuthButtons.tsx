import type { ManagedOAuthProvider } from '@/lib/supabase';
import { getManagedOAuthProviderLabel } from '@/lib/supabase';

interface ManagedOAuthButtonsProps {
  title: string;
  providers?: readonly ManagedOAuthProvider[];
  disabled?: boolean;
  onSelect: (provider: ManagedOAuthProvider) => void;
}

const DEFAULT_PROVIDERS: readonly ManagedOAuthProvider[] = ['google', 'github'];

function ProviderIcon({ provider }: { provider: ManagedOAuthProvider }) {
  if (provider === 'google') {
    return (
      <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24">
        <path
          d="M21.8 12.23c0-.79-.07-1.55-.2-2.27H12v4.3h5.49a4.7 4.7 0 0 1-2.04 3.08v2.56h3.3c1.93-1.77 3.05-4.39 3.05-7.67Z"
          fill="#4285F4"
        />
        <path
          d="M12 22c2.75 0 5.06-.91 6.75-2.47l-3.3-2.56c-.91.61-2.08.97-3.45.97-2.65 0-4.9-1.79-5.7-4.19H2.89v2.65A10 10 0 0 0 12 22Z"
          fill="#34A853"
        />
        <path
          d="M6.3 13.75A5.98 5.98 0 0 1 6 12c0-.61.11-1.2.3-1.75V7.6H2.89A10 10 0 0 0 2 12c0 1.61.38 3.13 1.05 4.4l3.25-2.65Z"
          fill="#FBBC04"
        />
        <path
          d="M12 6.06c1.5 0 2.85.52 3.92 1.54l2.94-2.94C17.05 2.98 14.74 2 12 2a10 10 0 0 0-9.11 5.6l3.41 2.65C7.1 7.85 9.35 6.06 12 6.06Z"
          fill="#EA4335"
        />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5 fill-current"
      viewBox="0 0 24 24"
    >
      <path d="M12 .5A12 12 0 0 0 8.2 23.9c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.5-1.3-1.3-1.7-1.3-1.7-1.1-.8.1-.8.1-.8 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.4-1.3-5.4-5.8 0-1.3.5-2.4 1.2-3.3-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.4 1.2a11.6 11.6 0 0 1 6.2 0c2.3-1.5 3.4-1.2 3.4-1.2.6 1.6.2 2.8.1 3.1.8.9 1.2 2 1.2 3.3 0 4.5-2.8 5.5-5.4 5.8.4.4.8 1.1.8 2.3v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .5Z" />
    </svg>
  );
}

export default function ManagedOAuthButtons({
  title,
  providers = DEFAULT_PROVIDERS,
  disabled = false,
  onSelect,
}: ManagedOAuthButtonsProps) {
  const layoutClassName =
    providers.length > 1 ? 'grid grid-cols-1 gap-3 sm:grid-cols-2' : 'grid grid-cols-1 gap-3';

  return (
    <>
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-brand-gray2" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-3 text-xs uppercase tracking-[0.2em] text-brand-gray3">
            {title}
          </span>
        </div>
      </div>

      <div className={layoutClassName}>
        {providers.map((provider) => {
          const label = getManagedOAuthProviderLabel(provider);
          return (
            <button
              key={provider}
              type="button"
              onClick={() => onSelect(provider)}
              disabled={disabled}
              className="flex items-center justify-center gap-2 rounded-xl border border-brand-gray2 bg-white py-3 text-xs font-semibold text-brand-gray3 transition hover:border-brand-primary hover:text-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ProviderIcon provider={provider} />
              {label}
            </button>
          );
        })}
      </div>
    </>
  );
}
