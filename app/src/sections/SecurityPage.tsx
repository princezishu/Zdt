const securityLayers = [
  {
    title: 'Managed authentication',
    description:
      'Supabase Auth handles sign-in, token issuance, password storage, and OAuth flows. That reduces custom credential risk while the API still verifies tokens server-side before access is granted.',
  },
  {
    title: 'Secure transport by default',
    description:
      'Production traffic is expected over HTTPS, and the backend enforces it. Strict transport and browser headers are applied to reduce downgrade, framing, and content-type abuse risks.',
  },
  {
    title: 'Abuse resistance',
    description:
      'Login, recovery, search, lead, and other public-facing actions are rate limited. Cross-origin access is allowlisted so the API is not left open to arbitrary frontend origins.',
  },
  {
    title: 'Role-aware authorization',
    description:
      'Authentication and authorization stay separate. Local roles, permissions, ownership checks, and account-state rules continue to control what each user can view or change.',
  },
];

const operationalControls = [
  'Supabase access tokens are validated on the backend, and service-role tokens are rejected for end-user authentication.',
  'Security headers include HSTS, a restrictive content security policy, frame denial, no-sniff, and strict referrer controls.',
  'Sensitive API responses are marked no-store to reduce accidental browser or proxy caching.',
  'Request ids, centralized error handling, and monitoring hooks support investigation and incident response.',
];

const userPractices = [
  'Use a strong unique password or a trusted OAuth provider for account access.',
  'Verify listing, ownership, and payment details independently before sending money.',
  'Do not share OTPs, recovery links, or account sessions with anyone.',
  'Report suspicious listings, messages, or account activity through support channels.',
];

export default function SecurityPage() {
  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Legal</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Security</h1>
          <p className="mt-3 max-w-4xl text-sm leading-relaxed text-slate-600 sm:text-base">
            Security is handled as a layered system rather than a single feature. The current platform
            combines managed authentication, enforced HTTPS, strict headers, rate limiting, and
            role-based backend checks to reduce avoidable risk.
          </p>
        </div>

        <article className="rounded-2xl border border-cyan-200 bg-cyan-50/70 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Current Security Approach</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            Authentication is managed through Supabase Auth, while application permissions stay local to
            the API. This lets the platform benefit from mature login and token handling without giving up
            app-specific access control, ownership checks, and moderation workflows.
          </p>
        </article>

        <div className="grid gap-4 md:grid-cols-2">
          {securityLayers.map((item) => (
            <article key={item.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">{item.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{item.description}</p>
            </article>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Operational Controls</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              {operationalControls.map((item) => (
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

        <p className="text-xs text-slate-500">
          This page is informational and summarizes current platform practices. Security controls continue
          to evolve as the product and deployment architecture expand.
        </p>
      </div>
    </section>
  );
}
