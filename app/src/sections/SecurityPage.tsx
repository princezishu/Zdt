const securityPractices = [
  'Role-based access controls for platform operations and admin actions.',
  'Session and authentication controls to reduce unauthorized access risk.',
  'Ongoing monitoring and moderation to reduce fake or misleading listings.',
  'Continuous improvements in safeguards as the platform scales.',
];

const userPractices = [
  'Use strong passwords and avoid sharing account access.',
  'Verify listing and document details before making payments.',
  'Report suspicious listings or behavior through support channels.',
];

export default function SecurityPage() {
  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Legal</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Security</h1>
          <p className="mt-3 max-w-4xl text-sm leading-relaxed text-slate-600 sm:text-base">
            Security is treated as an ongoing responsibility at ZDT Realty. We focus on practical controls,
            transparent operations, and continuous improvement.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Platform Practices</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              {securityPractices.map((item) => (
                <li key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">User Best Practices</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              {userPractices.map((item) => (
                <li key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
          </article>
        </div>
      </div>
    </section>
  );
}
