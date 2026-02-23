const faqs = [
  {
    q: 'Is ZDT Realty free to use?',
    a: 'Yes. During the current early-stage phase, the platform is free for builders, developers, and users.',
  },
  {
    q: 'Who can list properties on ZDT Realty?',
    a: 'Builders, developers, owners, and authorized real estate professionals can publish listings as per platform guidelines.',
  },
  {
    q: 'How does ZDT Realty improve trust?',
    a: 'We promote clear listing standards, regular updates, and transparent information to reduce misleading or duplicate content.',
  },
  {
    q: 'How can I report a suspicious listing?',
    a: 'Send the listing reference and concern details to our support contact so the team can review it.',
  },
  {
    q: 'Do you guarantee transaction outcomes?',
    a: 'No. ZDT Realty is a discovery and listing platform; users must complete independent legal and financial verification before finalizing deals.',
  },
];

export default function FaqPage() {
  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Support</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Frequently Asked Questions</h1>
          <p className="mt-3 max-w-4xl text-sm leading-relaxed text-slate-600 sm:text-base">
            Quick answers about platform usage, listings, trust, and responsibilities.
          </p>
        </div>

        <div className="space-y-3">
          {faqs.map((item) => (
            <article key={item.q} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">{item.q}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.a}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
