const whatWeDoPoints = [
  'List, manage, and promote residential, commercial, and rental properties in a structured format.',
  'Help builders update project details daily and receive direct enquiries from interested buyers and tenants.',
  'Enable users to discover properties by location, budget, and type through a clean, easy-to-use interface.',
];

const whyWeExistPoints = [
  'Builders often struggle with limited digital visibility and poor-quality leads.',
  'Buyers and tenants frequently face outdated listings and unclear property information.',
  'ZDT Realty bridges this gap with a builder-first platform focused on clarity, trust, and reliable lead flow.',
];

const differentiators = [
  'Builder-first design built around practical property management needs.',
  'Local-market focus instead of one-size-fits-all generic listing experiences.',
  'Daily listing updates and clear property presentation for better decision-making.',
  'Direct lead access so builders can engage with interested users faster.',
];

const trustPractices = [
  'Clear listing guidelines for publishers and professionals.',
  'Continuous effort to reduce fake, misleading, and duplicate listings.',
  'Strong focus on transparent, up-to-date property information.',
];

const audience = [
  'Builders and real estate developers',
  'Property owners and real estate agents',
  'Home buyers and tenants',
];

export default function AboutPage() {
  return (
    <section className="zdt-public-page relative overflow-hidden pb-16 pt-28 text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.14),_transparent_56%)]" />

      <div className="page-container relative z-10 space-y-8">
        <div className="zdt-public-hero rounded-3xl p-8 sm:p-10">
          <p className="zdt-public-kicker text-xs font-semibold">About ZDT Realty</p>
          <h1 className="brand-serif mt-3 text-3xl font-bold leading-tight sm:text-4xl">Built for Trust in Indian Real Estate</h1>
          <p className="mt-4 max-w-4xl text-base leading-relaxed text-slate-600">
            ZDT Realty is a modern real estate listing and management platform built primarily for builders and
            real estate developers in India. We help builders manage listings, generate genuine leads, and maintain
            a professional digital presence while making property discovery easier for buyers and renters.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <article className="zdt-public-card rounded-3xl p-7">
            <h2 className="text-xl font-semibold text-slate-900">What We Do</h2>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600">
              {whatWeDoPoints.map((point) => (
                <li key={point} className="zdt-public-muted-card rounded-xl p-3">
                  {point}
                </li>
              ))}
            </ul>
          </article>

          <article className="zdt-public-card rounded-3xl p-7">
            <h2 className="text-xl font-semibold text-slate-900">Why ZDT Realty Exists</h2>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600">
              {whyWeExistPoints.map((point) => (
                <li key={point} className="zdt-public-muted-card rounded-xl p-3">
                  {point}
                </li>
              ))}
            </ul>
          </article>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <article className="zdt-public-card rounded-3xl p-7">
            <h2 className="text-xl font-semibold text-slate-900">Our Mission</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              To empower builders with simple and reliable tools to manage properties and generate genuine leads,
              while giving users transparent and up-to-date real estate information.
            </p>
          </article>

          <article className="zdt-public-card rounded-3xl p-7">
            <h2 className="text-xl font-semibold text-slate-900">Our Vision</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              To build a trusted, local-first real estate ecosystem where builders, developers, buyers, and tenants
              connect through technology, transparency, and long-term trust.
            </p>
          </article>
        </div>

        <article className="zdt-public-card rounded-3xl p-7">
          <h2 className="text-xl font-semibold text-slate-900">What Makes ZDT Realty Different</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {differentiators.map((item) => (
              <div key={item} className="zdt-public-muted-card rounded-xl p-3 text-sm text-slate-600">
                {item}
              </div>
            ))}
          </div>
        </article>

        <div className="grid gap-6 lg:grid-cols-2">
          <article className="zdt-public-card rounded-3xl p-7">
            <h2 className="text-xl font-semibold text-slate-900">Free to Use (Early-Stage Platform)</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              ZDT Realty is currently free for builders, developers, and users, with no subscription fees at this
              stage. We have intentionally kept the platform free in the early phase to support easy digital adoption
              and collect practical feedback.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Optional paid plans may be introduced later with advanced features, and any changes will be communicated
              clearly and transparently.
            </p>
          </article>

          <article className="zdt-public-card rounded-3xl p-7">
            <h2 className="text-xl font-semibold text-slate-900">Trust and Transparency</h2>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600">
              {trustPractices.map((practice) => (
                <li key={practice} className="zdt-public-muted-card rounded-xl p-3">
                  {practice}
                </li>
              ))}
            </ul>
          </article>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <article className="zdt-public-card rounded-3xl p-7">
            <h2 className="text-xl font-semibold text-slate-900">Who We Serve</h2>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              {audience.map((group) => (
                <li key={group} className="zdt-public-muted-card rounded-lg px-3 py-2">
                  {group}
                </li>
              ))}
            </ul>
          </article>

          <article className="zdt-public-card rounded-3xl p-7">
            <h2 className="text-xl font-semibold text-slate-900">About the Founder</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              ZDT Realty was founded by Mohammad Zahir D. Tahsildar with the vision of creating a builder-focused
              platform that improves how properties are managed, presented, and discovered in India. The product is
              being developed with a long-term mindset centered on trust, usability, and steady growth.
            </p>
          </article>
        </div>

        <article className="zdt-public-card rounded-3xl p-7">
          <h2 className="text-xl font-semibold text-slate-900">A Growing Startup Built with Community Support</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            ZDT Realty is an early-stage startup built with limited resources and a strong belief in long-term value.
            Support from builders, developers, and early users plays a direct role in shaping the platform.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            By listing genuine properties, generating real enquiries, and sharing feedback, our community helps us
            improve quality and grow responsibly.
          </p>
        </article>

        <div className="grid gap-6 lg:grid-cols-2">
          <article className="zdt-public-card rounded-3xl p-7">
            <h2 className="text-xl font-semibold text-slate-900">Growth and Expansion</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              We currently follow a local-first approach, building strong relationships with builders in selected
              markets. Expansion is planned gradually, city by city, while maintaining platform quality, reliability,
              and trust.
            </p>
          </article>

          <article className="zdt-public-card rounded-3xl p-7">
            <h2 className="text-xl font-semibold text-slate-900">Contact and Support</h2>
            <p className="mt-3 text-sm text-slate-600">For queries, feedback, or builder partnerships:</p>
            <a
              href="mailto:zdtrealty@gmail.com"
              className="zdt-mail-chip mt-3 inline-flex rounded-full px-4 py-2 text-sm font-semibold transition hover:-translate-y-0.5"
            >
              zdtrealty@gmail.com
            </a>
          </article>
        </div>

        <article className="zdt-public-band rounded-3xl p-7">
          <h2 className="text-xl font-semibold text-slate-900">Closing Statement</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            ZDT Realty is built to support builders and real estate professionals with better tools, better visibility,
            and stronger trust. We are committed to growing responsibly and delivering real value to the Indian real
            estate ecosystem.
          </p>
        </article>
      </div>
    </section>
  );
}
