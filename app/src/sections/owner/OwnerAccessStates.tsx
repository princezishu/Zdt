import { Lock, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface OwnerLockedActionProps {
  title: string;
  description: string;
  message: string;
  onOpenSubscription?: () => void;
  actionLabel?: string;
}

interface OwnerLockedPageStateProps extends OwnerLockedActionProps {
  eyebrow?: string;
  meta?: string[];
}

interface OwnerLockedFeatureCardProps extends OwnerLockedActionProps {
  compact?: boolean;
}

export function OwnerLockedPageState({
  eyebrow = 'Plan Required',
  title,
  description,
  message,
  meta = [],
  onOpenSubscription,
  actionLabel = 'View Plans',
}: OwnerLockedPageStateProps) {
  return (
    <div className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-xs uppercase tracking-[0.28em] text-amber-600">{eyebrow}</p>
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">{title}</h2>
          <p className="mt-2 text-sm text-slate-600">{description}</p>
          <div className="mt-4 rounded-2xl border border-amber-200 bg-white/80 px-4 py-3 text-sm text-slate-700">
            {message}
          </div>
          {meta.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {meta.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600"
                >
                  {item}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="rounded-3xl border border-amber-200 bg-white p-5 text-slate-700 shadow-sm">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <Lock className="h-5 w-5" />
          </div>
          <p className="mt-4 text-sm font-semibold text-slate-900">Upgrade to unlock this workspace</p>
          <p className="mt-2 max-w-xs text-sm text-slate-600">
            Keep the feature visible for your team, then open subscription plans when you are ready.
          </p>
          <Button
            className="mt-4 bg-blue-700 text-white hover:bg-blue-800"
            onClick={onOpenSubscription}
            disabled={!onOpenSubscription}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {actionLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function OwnerLockedFeatureCard({
  title,
  description,
  message,
  onOpenSubscription,
  actionLabel = 'Upgrade',
  compact = false,
}: OwnerLockedFeatureCardProps) {
  return (
    <div
      className={`rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-5 shadow-sm ${
        compact ? 'h-full' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <Lock className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
      </div>
      <div className="mt-4 rounded-xl border border-amber-200 bg-white/80 px-4 py-3 text-sm text-slate-700">
        {message}
      </div>
      <Button
        variant="outline"
        className="mt-4 border-amber-300 bg-white text-amber-700 hover:bg-amber-50 hover:text-amber-800"
        onClick={onOpenSubscription}
        disabled={!onOpenSubscription}
      >
        {actionLabel}
      </Button>
    </div>
  );
}
