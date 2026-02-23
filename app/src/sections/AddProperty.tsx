import { ArrowRight, Building2, KeyRound, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AddPropertyProps {
  onOpenSell: () => void;
  onOpenRent: () => void;
}

export default function AddProperty({ onOpenSell, onOpenRent }: AddPropertyProps) {
  return (
    <section className="min-h-screen pt-28 pb-16">
      <div className="page-container">
        <div className="zdt-panel rounded-3xl border border-white/20 bg-white/95 p-6 shadow-xl sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-blue-700">
            Owner & Agent Flow
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">Add Property</h1>
          <p className="mt-3 max-w-3xl text-sm text-slate-600 sm:text-base">
            Start from a verified flow. Every listing goes through OTP verification, status tracking,
            and admin approval before it goes live.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <article className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700">
                <Building2 className="h-4 w-4" />
                Sell Property
              </p>
              <p className="mt-2 text-sm text-slate-600">
                Add your property details, upload media, and submit for admin approval.
              </p>
              <ul className="mt-4 space-y-2 text-xs text-slate-600">
                <li>OTP owner verification</li>
                <li>Dynamic fields by property type</li>
                <li>Assisted listing option by team</li>
              </ul>
              <Button
                onClick={onOpenSell}
                className="mt-5 w-full bg-brand-primary text-white hover:bg-brand-primary-dark"
              >
                Continue to Sell Form
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </article>

            <article className="rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-50 to-white p-5">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-700">
                <KeyRound className="h-4 w-4" />
                Rent Property
              </p>
              <p className="mt-2 text-sm text-slate-600">
                Submit rental details with tenant preferences and optional assisted listing support.
              </p>
              <ul className="mt-4 space-y-2 text-xs text-slate-600">
                <li>OTP owner verification</li>
                <li>Rent and deposit workflow</li>
                <li>Admin approval before publishing</li>
              </ul>
              <Button onClick={onOpenRent} className="mt-5 w-full bg-cyan-700 text-white hover:bg-cyan-800">
                Continue to Rent Form
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </article>
          </div>

          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <p className="inline-flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4" />
              Listings cannot be published directly
            </p>
            <p className="mt-1">
              Submit from Sell or Rent flow. Status moves as: Draft -&gt; Pending Approval -&gt; Approved.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
