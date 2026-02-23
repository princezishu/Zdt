export default function ContactPage() {
  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Support</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Contact</h1>
          <p className="mt-3 max-w-4xl text-sm leading-relaxed text-slate-600 sm:text-base">
            For platform support, feedback, media queries, or builder partnerships, reach us through
            the contact channel below.
          </p>
          <a
            href="mailto:zdtrealty@gmail.com"
            className="mt-4 inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-100"
          >
            zdtrealty@gmail.com
          </a>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Before You Contact</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">Include your name and role (builder, buyer, tenant, owner, agent).</li>
            <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">Share your city and a short summary of your request.</li>
            <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">For listing issues, include listing reference ID if available.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
