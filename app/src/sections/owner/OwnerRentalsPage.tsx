import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, BellRing, Bolt, CalendarDays, Eye, PlusCircle, Receipt, Trash2, User } from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/http';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { OwnerLockedFeatureCard } from './OwnerAccessStates';
import {
  isOwnerSubscriptionAccessError,
  useOwnerSubscriptionAccess,
} from './OwnerSubscriptionAccess';

interface OwnerRentalsPageProps {
  onOpenAddProperty: () => void;
  onOpenDashboard: () => void;
  onOpenDetails: (rentalId: string) => void;
  onOpenSubscription: () => void;
}

type RentStatus = 'pending' | 'partial' | 'paid' | 'overdue';

interface RentalListing {
  id: number;
  title: string;
  city: string;
  locality: string;
  monthly_rent: number | null;
  tracked_monthly_rent: number | null;
  tracked_security_deposit: number | null;
  furnished_status: string;
  available_from: string | null;
  is_verified: boolean;
  view_count: number;
  image_urls: string[];
  tenant_name: string;
  tenant_email: string;
  rent_due_day: number | null;
  total_record_count: number;
  overdue_record_count: number;
  last_rent_month: string | null;
  last_rent_status: RentStatus | null;
  last_received_amount: number | null;
}

interface OwnerRentalsResponse {
  rentals: RentalListing[];
}

interface SendReminderResponse {
  delivered: boolean;
  queued: boolean;
  queueReason: string | null;
}

interface BoostResponse {
  boostId: number;
  remainingBoostCredits?: number;
}

const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toNumberOrZero(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatCurrency(value: number | null, suffix = ''): string {
  if (value === null || !Number.isFinite(value) || value <= 0) return `INR 0${suffix}`;
  return `INR ${Math.round(value).toLocaleString('en-IN')}${suffix}`;
}

function formatDate(value: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN');
}

function formatMonth(value: string | null): string {
  if (!value || !MONTH_KEY_PATTERN.test(value)) return value || '-';
  const [year, month] = value.split('-').map((part) => Number(part));
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function statusClasses(status: RentStatus | null): string {
  if (status === 'paid') return 'bg-emerald-100 text-emerald-700';
  if (status === 'partial') return 'bg-amber-100 text-amber-700';
  if (status === 'overdue') return 'bg-rose-100 text-rose-700';
  return 'bg-slate-100 text-slate-700';
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}`;
}

export default function OwnerRentalsPage({
  onOpenAddProperty,
  onOpenDashboard,
  onOpenDetails,
  onOpenSubscription,
}: OwnerRentalsPageProps) {
  const { access, loading: accessLoading, refreshAccess } = useOwnerSubscriptionAccess();
  const [rentals, setRentals] = useState<RentalListing[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRentals = useCallback(() => {
    setLoading(true);
    apiRequest<OwnerRentalsResponse>('/api/owner/rentals')
      .then((response) => setRentals(response.rentals || []))
      .catch(() => setRentals([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadRentals();
  }, [loadRentals]);

  const totalOverdue = useMemo(
    () => rentals.reduce((sum, rental) => sum + toNumberOrZero(rental.overdue_record_count), 0),
    [rentals]
  );
  const canCreate = Boolean(access?.listingQuota.canCreate);
  const canBoost = Boolean(access?.boosts.enabled) && Number(access?.boosts.remainingCredits || 0) > 0;

  const handleBoost = async (rentalId: number) => {
    try {
      const response = await apiRequest<BoostResponse>(`/api/owner/boost/${rentalId}`, {
        method: 'POST',
        body: JSON.stringify({
          boostType: 'Area Spotlight',
          amountPaid: 1800,
          listingType: 'rental',
        }),
      });
      await refreshAccess();
      const creditsLabel =
        typeof response.remainingBoostCredits === 'number'
          ? ` ${response.remainingBoostCredits} boost credits left.`
          : '';
      toast.success(`Rental boosted.${creditsLabel}`);
      loadRentals();
    } catch (error) {
      if (isOwnerSubscriptionAccessError(error)) {
        await refreshAccess();
      }
      toast.error(error instanceof Error ? error.message : 'Unable to boost rental');
    }
  };

  const handleDelete = async (rentalId: number) => {
    try {
      await apiRequest(`/api/rentals/${rentalId}`, { method: 'DELETE' });
      await refreshAccess();
      toast.success('Rental removed');
      loadRentals();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to delete rental');
    }
  };

  const handleUpdateTenantRecord = async (rental: RentalListing) => {
    const tenantName = window.prompt('Tenant name', rental.tenant_name || '');
    if (tenantName === null) return;
    const tenantPhone = window.prompt('Tenant phone', '');
    if (tenantPhone === null) return;
    const tenantEmail = window.prompt('Tenant email', rental.tenant_email || '');
    if (tenantEmail === null) return;
    const leaseStartDate = window.prompt('Lease start date (YYYY-MM-DD)', rental.available_from || '');
    if (leaseStartDate === null) return;
    const monthlyRentText = window.prompt(
      'Monthly rent',
      String(toNumberOrNull(rental.tracked_monthly_rent ?? rental.monthly_rent) ?? '')
    );
    if (monthlyRentText === null) return;
    const securityDepositText = window.prompt(
      'Security deposit',
      String(toNumberOrNull(rental.tracked_security_deposit) ?? '')
    );
    if (securityDepositText === null) return;
    const dueDayText = window.prompt('Rent due day (1-31)', String(rental.rent_due_day || 5));
    if (dueDayText === null) return;

    const monthlyRent = monthlyRentText.trim() ? Number(monthlyRentText) : null;
    const securityDeposit = securityDepositText.trim() ? Number(securityDepositText) : null;
    const dueDay = Number(dueDayText);

    if ((monthlyRentText.trim() && !Number.isFinite(monthlyRent)) || (monthlyRent !== null && monthlyRent < 0)) {
      toast.error('Monthly rent must be a valid non-negative number');
      return;
    }
    if (
      (securityDepositText.trim() && !Number.isFinite(securityDeposit)) ||
      (securityDeposit !== null && securityDeposit < 0)
    ) {
      toast.error('Security deposit must be a valid non-negative number');
      return;
    }
    if (!Number.isFinite(dueDay) || dueDay < 1 || dueDay > 31) {
      toast.error('Due day must be between 1 and 31');
      return;
    }

    try {
      await apiRequest(`/api/owner/rentals/${rental.id}/tenant-record`, {
        method: 'PUT',
        body: JSON.stringify({
          tenantName: tenantName.trim(),
          tenantPhone: tenantPhone.trim(),
          tenantEmail: tenantEmail.trim(),
          leaseStartDate: leaseStartDate.trim(),
          monthlyRent,
          securityDeposit,
          rentDueDay: dueDay,
        }),
      });
      toast.success('Tenant record saved');
      loadRentals();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save tenant record');
    }
  };

  const handleAddRentRecord = async (rental: RentalListing) => {
    const monthKey = window.prompt('Month key (YYYY-MM)', currentMonthKey());
    if (!monthKey) return;
    if (!MONTH_KEY_PATTERN.test(monthKey.trim())) {
      toast.error('Month must be in YYYY-MM format');
      return;
    }
    const amountDueText = window.prompt(
      'Amount due',
      String(toNumberOrNull(rental.tracked_monthly_rent ?? rental.monthly_rent) ?? '')
    );
    if (amountDueText === null) return;
    const amountReceivedText = window.prompt('Amount received', '0');
    if (amountReceivedText === null) return;
    const receivedOn = window.prompt('Received on (YYYY-MM-DD or empty)', '');
    if (receivedOn === null) return;

    const amountDue = amountDueText.trim() ? Number(amountDueText) : null;
    const amountReceived = amountReceivedText.trim() ? Number(amountReceivedText) : null;

    if ((amountDueText.trim() && !Number.isFinite(amountDue)) || (amountDue !== null && amountDue < 0)) {
      toast.error('Amount due must be a valid non-negative number');
      return;
    }
    if (
      (amountReceivedText.trim() && !Number.isFinite(amountReceived)) ||
      (amountReceived !== null && amountReceived < 0)
    ) {
      toast.error('Amount received must be a valid non-negative number');
      return;
    }

    try {
      await apiRequest(`/api/owner/rentals/${rental.id}/rent-records`, {
        method: 'POST',
        body: JSON.stringify({
          monthKey: monthKey.trim(),
          amountDue,
          amountReceived,
          receivedOn: receivedOn.trim(),
        }),
      });
      toast.success('Rent record saved');
      loadRentals();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save rent record');
    }
  };

  const handleSendReminder = async (rental: RentalListing) => {
    const monthKey = window.prompt('Reminder month (YYYY-MM)', currentMonthKey());
    if (monthKey === null) return;
    if (monthKey.trim() && !MONTH_KEY_PATTERN.test(monthKey.trim())) {
      toast.error('Month must be in YYYY-MM format');
      return;
    }
    const message = window.prompt(
      'Reminder message',
      `Hello, this is a reminder for rent payment of ${rental.title} (${monthKey || currentMonthKey()}).`
    );
    if (message === null) return;

    try {
      const response = await apiRequest<SendReminderResponse>(`/api/owner/rentals/${rental.id}/send-notification`, {
        method: 'POST',
        body: JSON.stringify({
          monthKey: monthKey.trim(),
          message: message.trim(),
        }),
      });
      if (response.delivered) {
        toast.success('Reminder sent to tenant');
      } else if (response.queued) {
        toast.success('Reminder queued');
      } else {
        toast.warning(response.queueReason || 'Reminder could not be delivered now');
      }
      loadRentals();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to send reminder');
    }
  };

  return (
    <section className="portal-mobile-page min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container portal-mobile-stack space-y-6">
        <div className="portal-mobile-panel flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Owner Rentals</p>
            <h1 className="mt-3 text-2xl font-semibold text-slate-900 sm:text-3xl">Rental inventory</h1>
            <p className="mt-2 text-sm text-slate-600">
              Manage rentals, tenant record, rent received, deposit, and reminders.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="portal-mobile-card rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              Overdue records: <span className="font-semibold">{totalOverdue}</span>
            </div>
            {access ? (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                Slots left: <span className="font-semibold">{access.listingQuota.remaining}</span>
                <span className="mx-2 text-blue-300">|</span>
                Boost credits: <span className="font-semibold">{access.boosts.remainingCredits}</span>
              </div>
            ) : null}
            <Button variant="outline" onClick={onOpenDashboard}>
              Back to Dashboard
            </Button>
            <Button
              className="bg-blue-700 text-white hover:bg-blue-800"
              onClick={onOpenAddProperty}
              disabled={accessLoading || !canCreate}
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Rental
            </Button>
          </div>
        </div>

        {access && !canCreate ? (
          <OwnerLockedFeatureCard
            title="Rental publishing is paused"
            description="Existing rentals stay manageable, but new entries need available listing quota."
            message={access.listingQuota.message}
            onOpenSubscription={onOpenSubscription}
          />
        ) : null}

        {access && !access.boosts.enabled ? (
          <OwnerLockedFeatureCard
            title="Rental boosts are locked"
            description="Upgrade the plan when you want spotlight placement for rental inventory."
            message={access.boosts.message}
            onOpenSubscription={onOpenSubscription}
            compact
          />
        ) : null}

        {loading || accessLoading || !access ? (
          <div className="portal-mobile-card rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
            Loading rentals...
          </div>
        ) : rentals.length === 0 ? (
          <div className="portal-mobile-card rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            No rentals available. Add a rental listing to get started.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rentals.map((rental) => (
              <article key={rental.id} className="portal-mobile-card overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="relative">
                  <img
                    src={rental.image_urls?.[0] || '/images/property-1.jpg'}
                    alt={rental.title}
                    className="h-40 w-full object-cover"
                  />
                  {rental.is_verified && (
                    <Badge className="absolute left-3 top-3 bg-emerald-600 text-white hover:bg-emerald-600">
                      <BadgeCheck className="mr-1 h-3.5 w-3.5" />
                      Verified
                    </Badge>
                  )}
                </div>
                <div className="space-y-3 p-4">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">{rental.title}</h2>
                    <p className="text-xs text-slate-500">{rental.locality || rental.city}</p>
                  </div>
                  <div className="portal-mobile-card rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {formatCurrency(toNumberOrNull(rental.tracked_monthly_rent ?? rental.monthly_rent), ' / month')}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <Receipt className="h-3.5 w-3.5" />
                        Records {toNumberOrZero(rental.total_record_count)}
                      </span>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-rose-50 px-2 py-1 text-rose-700">
                      Overdue {toNumberOrZero(rental.overdue_record_count)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3.5 w-3.5" />
                      {rental.tenant_name || 'No tenant assigned'}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {rental.available_from ? formatDate(rental.available_from) : 'Immediate'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className={`rounded-full px-2 py-1 font-medium ${statusClasses(rental.last_rent_status)}`}>
                      Last {rental.last_rent_status || 'pending'} ({formatMonth(rental.last_rent_month)})
                    </span>
                    <span className="text-slate-500">{formatCurrency(toNumberOrNull(rental.last_received_amount))}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5" />
                      {toNumberOrZero(rental.view_count)} views
                    </span>
                    <Button
                      variant="ghost"
                      className="h-8 text-xs"
                      onClick={() => handleBoost(rental.id)}
                      disabled={!canBoost}
                    >
                      <Bolt className="mr-1 h-3.5 w-3.5" />
                      {access.boosts.enabled ? 'Boost' : 'Locked'}
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button className="h-9 bg-blue-700 text-xs text-white hover:bg-blue-800" onClick={() => onOpenDetails(String(rental.id))}>
                      View
                    </Button>
                    <Button
                      variant="outline"
                      className="h-9 text-xs text-rose-700 hover:bg-rose-50 hover:text-rose-700"
                      onClick={() => handleDelete(rental.id)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Button variant="outline" className="h-9 text-xs" onClick={() => handleUpdateTenantRecord(rental)}>
                      Tenant
                    </Button>
                    <Button variant="outline" className="h-9 text-xs" onClick={() => handleAddRentRecord(rental)}>
                      Rent
                    </Button>
                    <Button variant="outline" className="h-9 text-xs" onClick={() => handleSendReminder(rental)}>
                      <BellRing className="mr-1 h-3.5 w-3.5" />
                      Notify
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
