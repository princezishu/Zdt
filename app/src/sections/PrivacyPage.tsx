const privacyPoints = [
  'We collect only the information needed to operate accounts, listings, and support workflows.',
  'Listing and enquiry data is used to improve service quality and platform reliability.',
  'We do not intentionally publish private personal data beyond what is required for listing communication.',
  'Users are responsible for sharing only accurate and lawful information.',
];

export default function PrivacyPage() {
  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Legal</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Privacy</h1>
          <p className="mt-3 max-w-4xl text-sm leading-relaxed text-slate-600 sm:text-base">
            ZDT Realty follows a transparency-first approach to data usage and handling. This is a high-level
            overview for users and partners.
          </p>
        </div>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Privacy Highlights</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            {privacyPoints.map((point) => (
              <li key={point} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                {point}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-500">
            This page is informational and does not replace a formal legal privacy policy document.
          </p>
        </article>
      </div>
    </section>
  );
}
