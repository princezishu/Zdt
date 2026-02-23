const cookieTypes = [
  {
    name: 'Essential Cookies',
    note: 'Required for basic site and session functionality.',
  },
  {
    name: 'Preference Cookies',
    note: 'Help remember useful settings for smoother experience.',
  },
  {
    name: 'Analytics Cookies',
    note: 'Support aggregated usage understanding and platform improvement.',
  },
];

export default function CookiesPage() {
  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Legal</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Cookies</h1>
          <p className="mt-3 max-w-4xl text-sm leading-relaxed text-slate-600 sm:text-base">
            Cookie usage is designed to keep core platform functions stable while helping us improve the experience.
          </p>
        </div>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Cookie Categories</h2>
          <div className="mt-3 space-y-2 text-sm text-slate-600">
            {cookieTypes.map((item) => (
              <div key={item.name} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="font-medium text-slate-900">{item.name}</p>
                <p className="mt-1">{item.note}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">
            This page is informational and does not replace a complete legal cookie policy.
          </p>
        </article>
      </div>
    </section>
  );
}
