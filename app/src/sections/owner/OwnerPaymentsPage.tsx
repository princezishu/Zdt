import { CreditCard, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface OwnerPaymentsPageProps {
  onOpenDashboard: () => void;
}

export default function OwnerPaymentsPage({ onOpenDashboard }: OwnerPaymentsPageProps) {
  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Owner Payments</p>
            <h1 className="mt-3 text-2xl font-semibold text-slate-900 sm:text-3xl">Billing & invoices</h1>
            <p className="mt-2 text-sm text-slate-600">Track subscription, boost, and commission payments.</p>
          </div>
          <Button variant="outline" onClick={onOpenDashboard}>
            Back to Dashboard
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <CreditCard className="h-4 w-4 text-blue-600" />
              Payment Methods
            </div>
            <p className="mt-2 text-sm text-slate-600">Stripe / Razorpay integration placeholder.</p>
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
              Add payout bank details and manage auto-invoice settings here.
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Receipt className="h-4 w-4 text-blue-600" />
              Invoice History
            </div>
            <p className="mt-2 text-sm text-slate-600">Upcoming invoices and payment history.</p>
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
              Invoice generation will appear here once payments are configured.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
