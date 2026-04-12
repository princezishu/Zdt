import type { ReactNode } from 'react';

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export default function SectionHeader({
  eyebrow = '',
  title,
  description = '',
  action = null,
  className = '',
}: SectionHeaderProps) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-3 ${className}`.trim()}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className="portal-mobile-kicker text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
