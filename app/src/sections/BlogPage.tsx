import { Badge } from '@/components/ui/badge';
import { LOCAL_BLOG_POSTS } from '@/content/localBlogLibrary';

const publishingAreas = [
  {
    title: 'For Builders',
    description:
      'Practical posts on lead quality, listing quality, documentation clarity, and project presentation for local markets.',
  },
  {
    title: 'For Buyers & Renters',
    description:
      'Verification checklists, local decision guides, and risk-awareness articles written in simple language.',
  },
  {
    title: 'Platform Updates',
    description:
      'Transparent updates on product direction, what is live, what is improving, and what users can expect next.',
  },
];

const editorialPrinciples = [
  'Local-first context over generic national commentary.',
  'No fake data, no inflated claims, and no misleading urgency.',
  'Clear structure: introduction, practical checklist, common mistakes, conclusion.',
  'Trust-first language focused on real decisions for builders and users.',
];

export default function BlogPage() {
  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Blog</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">ZDT Realty Knowledge Hub</h1>
          <p className="mt-3 max-w-4xl text-sm leading-relaxed text-slate-600 sm:text-base">
            Our blog is built to help builders, buyers, and renters make better local property decisions.
            We focus on practical writing for tier-2 and tier-3 markets, with clear guidance and transparent
            communication.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {publishingAreas.map((area) => (
            <article key={area.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">{area.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{area.description}</p>
            </article>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Featured Blog Drafts</h2>
            <p className="mt-2 text-sm text-slate-600">
              Ready-to-publish drafts currently focused on selected local markets.
            </p>
            <div className="mt-4 space-y-3">
              {LOCAL_BLOG_POSTS.map((post) => (
                <article key={post.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline">{post.category}</Badge>
                    <Badge variant="secondary">{post.city}</Badge>
                  </div>
                  <h3 className="mt-2 text-sm font-semibold text-slate-900">{post.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{post.introduction}</p>
                </article>
              ))}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">How We Write</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {editorialPrinciples.map((rule) => (
                  <li key={rule} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    {rule}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Editorial Note</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Every article is written to improve clarity in real estate decisions. We prioritize accuracy,
                transparency, and local usefulness over volume.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
