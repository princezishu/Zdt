export default function HelpCenterPage() {
  const sections = [
    {
      title: 'Getting Started',
      points: [
        'Create your account and complete your profile details.',
        'Use clear property titles, real images, and accurate pricing.',
        'Keep availability status updated to avoid low-quality enquiries.',
      ],
    },
    {
      title: 'For Builders & Developers',
      points: [
        'Publish separate listings for each project or inventory type.',
        'Respond quickly to genuine enquiries to improve conversion.',
        'Use transparent documentation details to build local trust.',
      ],
    },
    {
      title: 'For Buyers & Tenants',
      points: [
        'Shortlist properties using location, budget, and listing details.',
        'Verify legal and approval documents before commitment.',
        'Use written confirmations for key terms and timelines.',
      ],
    },
  ];

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Support</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Help Center</h1>
          <p className="mt-3 max-w-4xl text-sm leading-relaxed text-slate-600 sm:text-base">
            Practical guidance for using ZDT Realty effectively, with a focus on clear listings,
            transparent communication, and local trust in real estate transactions.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {sections.map((section) => (
            <article key={section.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">{section.title}</h2>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {section.points.map((point) => (
                  <li key={point} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    {point}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
