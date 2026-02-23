import { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { getRoomRentHistory, type RoomHistoryItem } from '@/lib/apartmentComplexApi';

interface RoomHistoryModalProps {
  open: boolean;
  roomId: string;
  roomLabel: string;
  token: string;
  onOpenChange: (open: boolean) => void;
}

function statusBadge(status: RoomHistoryItem['status']) {
  if (status === 'paid') {
    return <Badge className="bg-emerald-600 text-white">Paid</Badge>;
  }
  if (status === 'unpaid') {
    return <Badge className="bg-amber-600 text-white">Pending</Badge>;
  }
  return <Badge className="bg-slate-600 text-white">Not Applicable</Badge>;
}

function formatMonth(value: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value || '');
  if (!match) return value || '-';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const parsed = new Date(year, month - 1, 1);
  if (Number.isNaN(parsed.getTime())) return value || '-';
  return parsed.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function formatDate(value: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN');
}

function formatAmount(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMethod(value: RoomHistoryItem['paymentMethod']): string {
  if (!value) return '-';
  if (value === 'upi') return 'UPI';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function RoomHistoryModal({
  open,
  roomId,
  roomLabel,
  token,
  onOpenChange,
}: RoomHistoryModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<RoomHistoryItem[]>([]);

  useEffect(() => {
    if (!open || !roomId || !token) {
      return;
    }

    let active = true;
    setLoading(true);
    setError('');

    getRoomRentHistory(roomId, token, 36)
      .then((response) => {
        if (!active) return;
        setHistory(Array.isArray(response.history) ? response.history : []);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load room history.');
        setHistory([]);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, roomId, token]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Rent History: {roomLabel}</DialogTitle>
          <DialogDescription>
            Monthly rent status, payment details, and pending dues.
          </DialogDescription>
        </DialogHeader>

        {loading ? <p className="text-sm text-slate-500">Loading rent history...</p> : null}

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}

        {!loading && !error && history.length === 0 ? (
          <p className="text-sm text-slate-600">No history available for this room yet.</p>
        ) : null}

        {!loading && !error && history.length > 0 ? (
          <div className="max-h-[420px] space-y-2 overflow-auto pr-1">
            <div className="sticky top-0 z-10 hidden grid-cols-[1.3fr_0.8fr_1fr_1fr_1.2fr] rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600 md:grid">
              <span>Month</span>
              <span>Status</span>
              <span>Due Date</span>
              <span>Paid Date</span>
              <span>Amount / Method</span>
            </div>
            {history.map((entry) => (
              <article
                key={entry.id}
                className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm md:grid-cols-[1.3fr_0.8fr_1fr_1fr_1.2fr]"
              >
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 md:hidden">Month</p>
                  <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                    <CalendarDays className="h-4 w-4 text-slate-500" />
                    {formatMonth(entry.monthKey)}
                  </div>
                </div>

                <div className="space-y-1 md:space-y-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 md:hidden">Status</p>
                  <div className="flex items-center">{statusBadge(entry.status)}</div>
                </div>

                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 md:hidden">Due Date</p>
                  <p className="text-sm text-slate-700">{formatDate(entry.dueDate)}</p>
                </div>

                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 md:hidden">Paid Date</p>
                  <p className="text-sm text-slate-700">{formatDate(entry.paidDate)}</p>
                </div>

                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 md:hidden">Amount / Method</p>
                  <p className="font-semibold text-slate-900">{formatAmount(entry.amountPaid)}</p>
                  {Number(entry.penaltyAmount || 0) > 0 ? (
                    <p className="text-xs font-semibold text-amber-700">
                      Penalty: {formatAmount(entry.penaltyAmount)}
                    </p>
                  ) : null}
                  <p className="text-xs text-slate-500">{formatMethod(entry.paymentMethod)}</p>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
