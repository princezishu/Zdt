import type { ReactNode } from 'react';

type InsightMetricTone = 'blue' | 'emerald' | 'amber' | 'slate';

interface InsightMetricCardProps {
  label: string;
  value: string;
  note: string;
  icon: ReactNode;
  tone?: InsightMetricTone;
}

const TONE_CLASS_MAP: Record<InsightMetricTone, string> = {
  blue: 'border-blue-200 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_42%),linear-gradient(180deg,#ffffff,#eef5ff)]',
  emerald:
    'border-emerald-200 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_42%),linear-gradient(180deg,#ffffff,#ecfdf5)]',
  amber:
    'border-amber-200 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.18),transparent_42%),linear-gradient(180deg,#ffffff,#fff7ed)]',
  slate:
    'border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(148,163,184,0.12),transparent_42%),linear-gradient(180deg,#ffffff,#f8fafc)]',
};

export default function InsightMetricCard({
  label,
  value,
  note,
  icon,
  tone = 'blue',
}: InsightMetricCardProps) {
  return (
    <article
      className={`portal-mobile-card min-h-[148px] rounded-[26px] border p-4 shadow-[0_18px_42px_-32px_rgba(15,23,42,0.35)] ${TONE_CLASS_MAP[tone]}`.trim()}
    >
      <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/70 bg-white/90 text-blue-700 shadow-sm">
        {icon}
      </div>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-[28px] font-bold leading-none text-slate-900">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-600">{note}</p>
    </article>
  );
}
