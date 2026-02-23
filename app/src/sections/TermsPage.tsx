const termsPoints = [
  'All users must provide truthful information while creating profiles and listings.',
  'Property decisions should be completed only after independent legal and financial verification.',
  'ZDT Realty may remove misleading, duplicate, or non-compliant listings to maintain platform quality.',
  'Platform features can evolve during early-stage growth with transparent communication to users.',
];

export default function TermsPage() {
  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Legal</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Terms</h1>
          <p className="mt-3 max-w-4xl text-sm leading-relaxed text-slate-600 sm:text-base">
            Core usage terms for the ZDT Realty platform, focused on fair use and transparent participation.
          </p>
        </div>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Key Terms</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            {termsPoints.map((point) => (
              <li key={point} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                {point}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-500">
            This page is informational and does not replace a full legal terms document.
          </p>
        </article>
      </div>
    </section>
  );
}
