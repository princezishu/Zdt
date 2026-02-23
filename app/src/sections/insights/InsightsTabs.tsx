interface InsightsTabsProps {
  active: 'news' | 'market' | 'projects' | 'compare';
}

const TABS = [
  { key: 'news', label: 'News', href: '/insights/news' },
  { key: 'market', label: 'Market', href: '/insights/market' },
  { key: 'projects', label: 'Projects', href: '/insights/projects' },
  { key: 'compare', label: 'Compare', href: '/insights/compare' },
] as const;

export default function InsightsTabs({ active }: InsightsTabsProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <a
            key={tab.key}
            href={tab.href}
            className={`inline-flex h-10 items-center rounded-full border px-4 text-sm font-medium transition ${
              tab.key === active
                ? 'border-blue-500 bg-blue-50 text-blue-900'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </a>
        ))}
      </div>
    </div>
  );
}
