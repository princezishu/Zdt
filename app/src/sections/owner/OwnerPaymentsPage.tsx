import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CreditCard, Receipt, TrendingUp, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  getOwnerPayments,
  type OwnerPaymentsResponse,
} from '@/lib/ownerBillingApi';

interface OwnerPaymentsPageProps {
  onOpenDashboard: () => void;
}

function formatCurrency(value: number): string {
  return `INR ${Math.round(value || 0).toLocaleString('en-IN')}`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function statusBadgeClass(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized === 'paid' || normalized === 'active') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (normalized === 'failed' || normalized === 'cancelled' || normalized === 'expired') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  if (normalized === 'authorized' || normalized === 'created') {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  return 'border-slate-200 bg-slate-100 text-slate-700';
}

function SummaryCard({
  title,
  value,
  hint,
  icon,
}: {
  title: string;
  value: string;
  hint: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-blue-700">
          {icon}
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-600">{hint}</p>
    </div>
  );
}

export default function OwnerPaymentsPage({ onOpenDashboard }: OwnerPaymentsPageProps) {
  const [data, setData] = useState<OwnerPaymentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    getOwnerPayments()
      .then((response) => {
        if (!active) return;
        setData(response);
      })
      .catch((loadError) => {
        if (!active) return;
        setData(null);
        setError(loadError instanceof Error ? loadError.message : 'Unable to load payment history.');
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const paidOrders = useMemo(
    () => (data?.orders || []).filter((order) => order.status.trim().toLowerCase() === 'paid'),
    [data]
  );
  const lastPaidOrder = paidOrders[0] || null;
  const totalPaidAmount = paidOrders.reduce((sum, order) => sum + Number(order.amount || 0), 0);

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Owner Payments</p>
            <h1 className="mt-3 text-2xl font-semibold text-slate-900 sm:text-3xl">Billing, orders, and payouts</h1>
            <p className="mt-2 text-sm text-slate-600">
              Review real checkout history, boost charges, and commission records from one place.
            </p>
          </div>
          <Button variant="outline" onClick={onOpenDashboard}>
            Back to Dashboard
          </Button>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="Current Plan"
            value={data?.currentSubscription?.planName || 'Free'}
            hint="The currently active subscription after payment verification."
            icon={<Wallet className="h-5 w-5" />}
          />
          <SummaryCard
            title="Paid Orders"
            value={String(paidOrders.length)}
            hint="Verified subscription and billing orders recorded on your account."
            icon={<Receipt className="h-5 w-5" />}
          />
          <SummaryCard
            title="Total Paid"
            value={formatCurrency(totalPaidAmount)}
            hint="Sum of completed owner billing orders."
            icon={<CreditCard className="h-5 w-5" />}
          />
          <SummaryCard
            title="Checkout"
            value={data?.checkoutConfigured ? 'Ready' : 'Not Configured'}
            hint={
              data?.checkoutConfigured
                ? lastPaidOrder
                  ? `Latest paid order on ${formatDateTime(lastPaidOrder.paidAt || lastPaidOrder.createdAt)}.`
                  : 'Razorpay is configured and ready for seller purchases.'
                : 'Razorpay keys are not configured on the server yet.'
            }
            icon={<TrendingUp className="h-5 w-5" />}
          />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Billing Orders</h2>
              <p className="mt-1 text-sm text-slate-600">
                Verified checkout orders, statuses, and activation progress.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              Loading billing history...
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Created</th>
                    <th className="px-3 py-2">Order</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Payment Ref</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.orders || []).map((order) => (
                    <tr key={order.id} className="border-b border-slate-100">
                      <td className="px-3 py-3 text-slate-600">{formatDateTime(order.createdAt)}</td>
                      <td className="px-3 py-3">
                        <p className="font-medium text-slate-900">
                          {order.relatedPlanName || order.relatedPlanId || order.orderKind}
                        </p>
                        <p className="text-xs text-slate-500">
                          {order.orderKind.replace(/_/g, ' ')} | {order.provider}
                        </p>
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-900">{formatCurrency(order.amount)}</td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(order.status)}`}
                        >
                          {order.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        {order.providerPaymentId || order.providerOrderId || order.providerReceipt || '-'}
                      </td>
                    </tr>
                  ))}
                  {!data?.orders?.length ? (
                    <tr>
                      <td className="px-3 py-5 text-slate-500" colSpan={5}>
                        No billing orders recorded yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Boost History</h2>
            <p className="mt-1 text-sm text-slate-600">Recent boost usage and spend.</p>
            <div className="mt-4 space-y-3">
              {(data?.boostHistory || []).slice(0, 8).map((row) => (
                <div
                  key={row.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {row.boostType} | {row.listingType}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDateTime(row.startDate)} to {formatDateTime(row.endDate)}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-slate-900">{formatCurrency(row.amountPaid)}</p>
                  </div>
                </div>
              ))}
              {!data?.boostHistory?.length ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  No boost records yet.
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Commission History</h2>
            <p className="mt-1 text-sm text-slate-600">Recent commission rows from closed business.</p>
            <div className="mt-4 space-y-3">
              {(data?.commissionHistory || []).slice(0, 8).map((row) => (
                <div
                  key={row.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{row.propertyTitle || `Property #${row.propertyId}`}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDateTime(row.createdAt)} | {row.status}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-slate-900">{formatCurrency(row.commissionAmount)}</p>
                  </div>
                </div>
              ))}
              {!data?.commissionHistory?.length ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  No commission history available yet.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
