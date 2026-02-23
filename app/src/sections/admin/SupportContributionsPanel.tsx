import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, RefreshCcw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getAdminSupportContributions,
  updateSupportContributionStatus,
  type SupportContributionRecord,
} from '@/lib/supportProgramApi';
import type { AuthUser } from '@/lib/session';

interface SupportContributionsPanelProps {
  token: string;
  user: AuthUser | null;
  onActionMessage?: (message: string) => void;
  onActionError?: (message: string) => void;
}

type SupportFilter = 'all' | 'pending' | 'verified' | 'rejected';

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusBadgeClass(status: string) {
  if (status === 'Verified') {
    return 'border-emerald-300 bg-emerald-50 text-emerald-700';
  }
  if (status === 'Rejected') {
    return 'border-red-300 bg-red-50 text-red-700';
  }
  return 'border-amber-300 bg-amber-50 text-amber-700';
}

export default function SupportContributionsPanel({
  token,
  user,
  onActionMessage,
  onActionError,
}: SupportContributionsPanelProps) {
  const isAdmin = Boolean(token && user?.role === 'admin');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState(0);
  const [filter, setFilter] = useState<SupportFilter>('all');
  const [items, setItems] = useState<SupportContributionRecord[]>([]);
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
  const [correctedAmounts, setCorrectedAmounts] = useState<Record<number, string>>({});
  const [replyMessages, setReplyMessages] = useState<Record<number, string>>({});

  const loadItems = useCallback(async () => {
    if (!isAdmin) {
      setItems([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');
      const response = await getAdminSupportContributions(token, {
        status: filter,
        limit: 300,
      });
      setItems(response.contributions || []);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : 'Unable to load support contributions.';
      setError(message);
      onActionError?.(message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filter, isAdmin, onActionError, token]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const reviewItem = async (item: SupportContributionRecord, status: 'Pending' | 'Verified' | 'Rejected') => {
    if (!isAdmin) return;

    const note = (reviewNotes[item.id] ?? item.verificationNote ?? '').trim();
    const correctedAmountRaw = (correctedAmounts[item.id] ?? '').trim();
    const replyMessage = (replyMessages[item.id] ?? item.adminReplyMessage ?? '').trim();

    let correctedAmountValue: number | undefined;
    if (correctedAmountRaw) {
      const parsedCorrectedAmount = Number(correctedAmountRaw);
      if (!Number.isFinite(parsedCorrectedAmount) || parsedCorrectedAmount < 10) {
        setError('Corrected amount must be at least Rs 10.');
        return;
      }
      correctedAmountValue = Math.round(parsedCorrectedAmount);
    }

    try {
      setSavingId(item.id);
      setError('');
      const response = await updateSupportContributionStatus(token, item.id, {
        status,
        verificationNote: note,
        correctedAmount: correctedAmountValue,
        adminReplyMessage: replyMessage,
      });
      onActionMessage?.(response.message);
      await loadItems();
    } catch (reviewError) {
      const message =
        reviewError instanceof Error ? reviewError.message : 'Unable to update contribution status.';
      setError(message);
      onActionError?.(message);
    } finally {
      setSavingId(0);
    }
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <section className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Support Contribution Verification</h2>
          <p className="text-sm text-slate-600">
            Check UPI transaction in PhonePe, then mark each record as Verified or Rejected.
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as SupportFilter)}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
          <Button variant="outline" onClick={() => void loadItems()} disabled={loading || savingId > 0}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      {loading ? <p className="text-sm text-slate-600">Loading support contributions...</p> : null}

      {!loading && items.length === 0 ? (
        <p className="text-sm text-slate-600">No support contributions found for selected filter.</p>
      ) : null}

      {!loading && items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item) => {
            const status = item.verificationStatus || 'Pending';
            const noteValue = reviewNotes[item.id] ?? item.verificationNote ?? '';
            const reportedAmount = Number(item.reportedAmount || item.amount || 0);
            const finalAmount = Number(item.amount || 0);
            const hasAmountCorrection = reportedAmount > 0 && finalAmount > 0 && reportedAmount !== finalAmount;
            const correctedAmountValue =
              correctedAmounts[item.id] ?? String(finalAmount > 0 ? finalAmount : reportedAmount || '');
            const replyValue = replyMessages[item.id] ?? item.adminReplyMessage ?? '';
            const isSaving = savingId === item.id;

            return (
              <article key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {item.name?.trim() ? item.name : 'Anonymous Supporter'}
                    </p>
                    <p className="text-xs text-slate-600">
                      Reported: Rs {reportedAmount.toLocaleString('en-IN')} | Final: Rs{' '}
                      {finalAmount.toLocaleString('en-IN')} | UPI Ref: {item.upiReference || '-'}
                    </p>
                    <p className="text-xs text-slate-500">
                      Submitted: {formatDateTime(item.createdAt)}
                      {item.submittedIp ? ` | IP: ${item.submittedIp}` : ''}
                    </p>
                    {hasAmountCorrection ? (
                      <p className="text-xs font-semibold text-amber-700">
                        Amount corrected by admin from Rs {reportedAmount.toLocaleString('en-IN')} to Rs{' '}
                        {finalAmount.toLocaleString('en-IN')}.
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusBadgeClass(status)}`}
                  >
                    {status}
                  </span>
                </div>

                {item.message?.trim() ? (
                  <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                    {item.message}
                  </p>
                ) : null}

                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={correctedAmountValue}
                    onChange={(event) =>
                      setCorrectedAmounts((prev) => ({
                        ...prev,
                        [item.id]: event.target.value.replace(/[^\d]/g, ''),
                      }))
                    }
                    inputMode="numeric"
                    placeholder="Corrected amount (if needed)"
                    className="h-10 bg-white"
                  />
                  <Input
                    value={replyValue}
                    onChange={(event) =>
                      setReplyMessages((prev) => ({ ...prev, [item.id]: event.target.value }))
                    }
                    maxLength={500}
                    placeholder="Reply (example: Thank you for your support contribution.)"
                    className="h-10 bg-white"
                  />
                </div>

                <Input
                  value={noteValue}
                  onChange={(event) =>
                    setReviewNotes((prev) => ({ ...prev, [item.id]: event.target.value }))
                  }
                  maxLength={500}
                  placeholder="Verification note (optional)"
                  className="h-10 bg-white"
                />

                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => void reviewItem(item, 'Verified')}
                    disabled={isSaving || status === 'Verified'}
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {isSaving && status !== 'Verified' ? 'Saving...' : 'Mark Verified'}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => void reviewItem(item, 'Rejected')}
                    disabled={isSaving || status === 'Rejected'}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    {isSaving && status !== 'Rejected' ? 'Saving...' : 'Mark Rejected'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void reviewItem(item, 'Pending')}
                    disabled={isSaving || status === 'Pending'}
                  >
                    Move To Pending
                  </Button>
                </div>

                <p className="text-xs text-slate-600">
                  Reviewed by: {item.verifiedByName || '-'} | Reviewed at: {formatDateTime(item.verifiedAt)}
                </p>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
