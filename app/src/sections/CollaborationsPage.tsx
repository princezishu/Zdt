import { useEffect, useState } from 'react';
import {
  Handshake,
  Trophy,
  Crown,
  Gem,
  Star,
  CheckCircle2,
  Send,
  Sparkles,
  Building2,
  Megaphone,
  PenTool,
  CalendarCheck,
  CircleDot,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/http';

interface CollaborationPackage {
  tier: string;
  name: string;
  price: string;
  duration: string;
  reach: string;
  features: string[];
}

const COLLAB_TYPES = [
  { value: 'sponsored_property', label: 'Sponsored Property Listing', icon: Building2 },
  { value: 'brand_partnership', label: 'Brand Partnership', icon: Handshake },
  { value: 'content_promotion', label: 'Content Promotion', icon: PenTool },
  { value: 'event_sponsorship', label: 'Event Sponsorship', icon: CalendarCheck },
  { value: 'custom', label: 'Custom Collaboration', icon: Sparkles },
];

const BUDGET_RANGES = [
  'Under ₹5,000',
  '₹5,000 – ₹15,000',
  '₹15,000 – ₹35,000',
  '₹35,000 – ₹75,000',
  '₹75,000+',
  'Let\'s discuss',
];

function tierGradient(tier: string) {
  switch (tier) {
    case 'bronze':
      return 'from-amber-700 via-yellow-700 to-orange-700';
    case 'silver':
      return 'from-slate-400 via-gray-300 to-slate-500';
    case 'gold':
      return 'from-yellow-400 via-amber-400 to-yellow-500';
    case 'platinum':
      return 'from-indigo-500 via-purple-500 to-pink-500';
    default:
      return 'from-blue-500 to-indigo-600';
  }
}

function tierIcon(tier: string) {
  switch (tier) {
    case 'bronze':
      return <CircleDot className="h-6 w-6" />;
    case 'silver':
      return <Star className="h-6 w-6" />;
    case 'gold':
      return <Crown className="h-6 w-6" />;
    case 'platinum':
      return <Gem className="h-6 w-6" />;
    default:
      return <Trophy className="h-6 w-6" />;
  }
}

export default function CollaborationsPage() {
  const [packages, setPackages] = useState<CollaborationPackage[]>([]);
  const [loading, setLoading] = useState(true);

  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [collaborationType, setCollaborationType] = useState('');
  const [packageTier, setPackageTier] = useState('custom');
  const [budgetRange, setBudgetRange] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiRequest<{ packages: CollaborationPackage[] }>('/api/collaborations/packages')
      .then((res) => setPackages(res.packages || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim() || !email.trim() || !collaborationType) {
      toast.error('Please fill in all required fields.');
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest('/api/collaborations/inquiries', {
        method: 'POST',
        body: JSON.stringify({
          businessName: businessName.trim(),
          contactName: contactName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          collaborationType,
          packageTier,
          budgetRange,
          description: description.trim(),
        }),
      });
      toast.success('Inquiry submitted! We\'ll get back to you within 24 hours.');
      setBusinessName('');
      setContactName('');
      setEmail('');
      setPhone('');
      setCollaborationType('');
      setPackageTier('custom');
      setBudgetRange('');
      setDescription('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit inquiry.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="min-h-screen pb-20 pt-28 text-slate-900">
      {/* Hero */}
      <div className="page-container text-center">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-500/10 to-pink-500/10 px-4 py-1.5 text-sm font-medium text-purple-700">
            <Megaphone className="h-4 w-4" />
            Paid Collaborations
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
            Partner With{' '}
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              ZDT Realty
            </span>
          </h1>
          <p className="mt-4 text-base text-slate-600 sm:text-lg">
            Promote your brand, properties, or services to thousands of active real estate buyers,
            sellers, and investors. Choose a collaboration package or reach out for a custom deal.
          </p>
        </div>
      </div>

      {/* Collaboration Types */}
      <div className="page-container mt-14">
        <h2 className="text-center text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
          Collaboration Types
        </h2>
        <div className="mx-auto mt-6 grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {COLLAB_TYPES.map((ct) => {
            const Icon = ct.icon;
            return (
              <div
                key={ct.value}
                className="flex items-center gap-3 rounded-xl border border-slate-200/60 bg-white/60 px-4 py-3 shadow-sm backdrop-blur-sm transition-all hover:border-blue-300 hover:shadow-md"
              >
                <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/10 to-indigo-500/10 text-blue-600">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-sm font-medium text-slate-800">{ct.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Packages */}
      <div className="page-container mt-16">
        <h2 className="text-center text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
          Collaboration Packages
        </h2>
        <p className="mt-2 text-center text-sm text-slate-500">
          Pick a pre-built package or request a custom plan.
        </p>

        {loading ? (
          <div className="mt-8 text-center text-sm text-slate-500">Loading packages...</div>
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {packages.map((pkg) => (
              <div
                key={pkg.tier}
                className="group relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl"
              >
                <div
                  className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${tierGradient(pkg.tier)}`}
                />
                <div className="p-5 pt-6">
                  <div className="flex items-center gap-2">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${tierGradient(pkg.tier)} text-white`}
                    >
                      {tierIcon(pkg.tier)}
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">{pkg.name}</h3>
                  </div>
                  <p className="mt-3 text-2xl font-extrabold text-slate-900">
                    {pkg.price}
                    <span className="ml-1 text-xs font-normal text-slate-500">/ {pkg.duration}</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{pkg.reach}</p>

                  <ul className="mt-5 space-y-2">
                    {pkg.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-500" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={() => {
                      setPackageTier(pkg.tier);
                      document.getElementById('collab-inquiry-form')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className={`mt-6 w-full rounded-xl bg-gradient-to-r ${tierGradient(pkg.tier)} px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-lg`}
                  >
                    Choose {pkg.name}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inquiry Form */}
      <div className="page-container mt-16" id="collab-inquiry-form">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-2xl border border-slate-200/60 bg-white/80 p-6 shadow-lg backdrop-blur-sm sm:p-8">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
                <Send className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">Submit a Collaboration Inquiry</h2>
              <p className="mt-1 text-sm text-slate-500">
                Tell us about your brand and goals — we'll reply within 24 hours.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Business Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Your Company Ltd."
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Contact Name</label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Phone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 9876543210"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Collaboration Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={collaborationType}
                    onChange={(e) => setCollaborationType(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    required
                  >
                    <option value="">Select type...</option>
                    {COLLAB_TYPES.map((ct) => (
                      <option key={ct.value} value={ct.value}>
                        {ct.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Budget Range</label>
                  <select
                    value={budgetRange}
                    onChange={(e) => setBudgetRange(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="">Select range...</option>
                    {BUDGET_RANGES.map((br) => (
                      <option key={br} value={br}>
                        {br}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {packages.length > 0 ? (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Preferred Package</label>
                  <select
                    value={packageTier}
                    onChange={(e) => setPackageTier(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="custom">Custom / Discuss</option>
                    {packages.map((pkg) => (
                      <option key={pkg.tier} value={pkg.tier}>
                        {pkg.name} — {pkg.price}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Tell us about your goals
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Describe what you'd like to promote, your target audience, and any specific requirements..."
                  className="w-full resize-none rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:from-blue-700 hover:to-indigo-700 hover:shadow-xl disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit Collaboration Inquiry'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
