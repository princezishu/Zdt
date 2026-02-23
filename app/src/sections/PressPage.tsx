import { Badge } from '@/components/ui/badge';

const snapshotPoints = [
  'ZDT Realty is a builder-focused real estate platform for Indian local markets.',
  'The platform helps manage listings, improve lead quality, and support transparent discovery.',
  'Current growth approach is local-first, city by city, with reliability and trust as core goals.',
];

const mediaUseLines = [
  'ZDT Realty is building practical digital tools for builders and developers in local Indian markets.',
  'The platform focuses on genuine enquiries, clear listing information, and transparent communication.',
  'The team is operating in an early-stage phase with a long-term trust-first product roadmap.',
];

const pressFocus = [
  'Builder-first product development and adoption in tier-2/tier-3 cities.',
  'Property listing clarity, verification discipline, and trust-building in local ecosystems.',
  'Ground-level learning from selected local markets and early user feedback loops.',
];

export default function PressPage() {
  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Press</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">ZDT Realty Press & Media</h1>
          <p className="mt-3 max-w-4xl text-sm leading-relaxed text-slate-600 sm:text-base">
            This page provides a clear media reference for ZDT Realty. We keep communication factual,
            transparent, and aligned with our early-stage reality.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="secondary">Builder-First</Badge>
            <Badge variant="secondary">Local-First</Badge>
            <Badge variant="secondary">Trust-First</Badge>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Company Snapshot</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              {snapshotPoints.map((point) => (
                <li key={point} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  {point}
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Media Contact</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              For interviews, media questions, and partnership conversations, contact:
            </p>
            <a
              href="mailto:zdtrealty@gmail.com"
              className="mt-3 inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-100"
            >
              zdtrealty@gmail.com
            </a>
            <p className="mt-3 text-xs text-slate-500">
              Please include your publication name, topic focus, and preferred timeline.
            </p>
          </article>
        </div>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Suggested Press Lines</h2>
          <p className="mt-2 text-sm text-slate-600">
            You can use these neutral lines while covering ZDT Realty.
          </p>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            {mediaUseLines.map((line) => (
              <li key={line} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                {line}
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Current Press Focus Areas</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            {pressFocus.map((item) => (
              <li key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}
