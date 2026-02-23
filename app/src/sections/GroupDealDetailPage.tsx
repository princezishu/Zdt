import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Copy, Loader2, MapPin, Share2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getGroupDealByCode,
  joinGroupDeal,
  type GroupDealItem,
  type GroupDealUnitType,
} from '@/lib/groupDealsApi';

interface GroupDealDetailPageProps {
  dealCode: string;
  onBackToList: () => void;
}

function formatPrice(value: number | null): string {
  if (!value || value <= 0) return 'Price on request';
  if (value >= 10000000) return `INR ${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `INR ${(value / 100000).toFixed(1)} L`;
  return `INR ${Math.round(value).toLocaleString('en-IN')}`;
}

function estimatedGroupPrice(item: GroupDealItem): number | null {
  if (item.finalGroupPrice && item.finalGroupPrice > 0) return item.finalGroupPrice;
  if (!item.basePrice || item.basePrice <= 0) return null;
  if (!item.discountValue || item.discountValue <= 0) return null;
  if (item.dealType === 'FLAT_DISCOUNT') return Math.max(0, item.basePrice - item.discountValue);
  if (item.dealType === 'PERCENT_DISCOUNT') {
    return Math.max(0, item.basePrice * (1 - item.discountValue / 100));
  }
  return null;
}

function benefitLabel(item: GroupDealItem): string {
  if (item.dealType === 'FLAT_DISCOUNT' && item.discountValue) {
    return `${formatPrice(item.discountValue)} off per unit`;
  }
  if (item.dealType === 'PERCENT_DISCOUNT' && item.discountValue) {
    return `${item.discountValue}% off per unit`;
  }
  return 'Group discount available. Final price confirmed by builder when group completes.';
}

function statusClass(status: GroupDealItem['status']) {
  if (status === 'ACTIVE') return 'bg-emerald-100 text-emerald-800 border-emerald-300';
  if (status === 'MIN_REACHED') return 'bg-blue-100 text-blue-800 border-blue-300';
  if (status === 'CONFIRMED') return 'bg-indigo-100 text-indigo-800 border-indigo-300';
  if (status === 'FULL') return 'bg-amber-100 text-amber-800 border-amber-300';
  if (status === 'EXPIRED') return 'bg-slate-200 text-slate-700 border-slate-300';
  if (status === 'CANCELLED') return 'bg-red-100 text-red-800 border-red-300';
  return 'bg-slate-200 text-slate-700 border-slate-300';
}

export default function GroupDealDetailPage({ dealCode, onBackToList }: GroupDealDetailPageProps) {
  const [deal, setDeal] = useState<GroupDealItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [unitPreference, setUnitPreference] = useState<GroupDealUnitType>('2BHK');
  const [allowBuilderContactBeforeCompletion, setAllowBuilderContactBeforeCompletion] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);

  const [joinedMessage, setJoinedMessage] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setJoinedMessage('');

    getGroupDealByCode(dealCode)
      .then((response) => {
        if (!active) return;
        setDeal(response.item);
        setUnitPreference(response.item.unitType);
      })
      .catch((requestError) => {
        if (!active) return;
        setDeal(null);
        setError(requestError instanceof Error ? requestError.message : 'Could not load deal.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [dealCode]);

  const estimatedPrice = useMemo(() => {
    if (!deal) return null;
    return estimatedGroupPrice(deal);
  }, [deal]);

  const handleCopyShare = async () => {
    if (!deal) return;
    const url = `${window.location.origin}/group-deals/${deal.dealCode}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Share link copied');
    } catch {
      toast.error('Could not copy link. Please copy manually.');
    }
  };

  const handleJoinSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!deal) return;
    setError('');
    if (!consentChecked) {
      setError('Please accept the consent statement before joining.');
      return;
    }
    if (!fullName.trim()) {
      setError('Full name is required.');
      return;
    }
    if (!phone.trim() && !email.trim()) {
      setError('Phone or email is required.');
      return;
    }

    try {
      setSubmitting(true);
      const response = await joinGroupDeal(deal.dealCode, {
        fullName: fullName.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        unitPreference,
        consent: true,
        allowBuilderContactBeforeCompletion,
      });
      setDeal(response.item);
      setJoinedMessage(response.message || 'You joined this group deal');
      setFullName('');
      setPhone('');
      setEmail('');
      setConsentChecked(false);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : 'Could not join this deal.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container zdt-page-stack">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" className="h-9" onClick={onBackToList}>
            Back to Group Deals
          </Button>
          {deal ? (
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(deal.status)}`}>
              {deal.status}
            </span>
          ) : null}
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600 shadow-sm">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            Loading group deal...
          </div>
        ) : null}

        {!loading && error && !deal ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="mr-2 inline h-4 w-4" />
            {error}
          </div>
        ) : null}

        {!loading && deal ? (
          <>
            <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Deal Code: {deal.dealCode}
              </p>

              <div className="mt-3 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
                <div className="space-y-4">
                  <div>
                    <h1 className="text-2xl font-bold sm:text-3xl">{deal.projectName}</h1>
                    <p className="mt-2 text-sm text-slate-700">
                      {deal.builderName}{' '}
                      {deal.builderVerified ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <CheckCircle2 className="h-4 w-4" />
                          Verified Builder
                        </span>
                      ) : (
                        <span className="text-amber-700">Builder not verified</span>
                      )}
                    </p>
                    <p className="mt-1 inline-flex items-center gap-1 text-sm text-slate-600">
                      <MapPin className="h-4 w-4 text-slate-400" />
                      {deal.cityName}, {deal.stateName}
                      {deal.stateCode ? ` (${deal.stateCode})` : ''}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Unit Type</p>
                    <p className="mt-1 text-xl font-semibold text-slate-900">{deal.unitType}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">Pricing</p>
                  <div className="mt-3 space-y-2 text-sm">
                    <p className="text-blue-900">
                      Normal price per unit:{' '}
                      <span className="font-semibold">{formatPrice(deal.basePrice)}</span>
                    </p>
                    <p className="text-blue-900">
                      Group benefit: <span className="font-semibold">{benefitLabel(deal)}</span>
                    </p>
                    <p className="text-blue-900">
                      Group price:{' '}
                      <span className="font-semibold">
                        {estimatedPrice
                          ? formatPrice(estimatedPrice)
                          : 'Discount after group completes'}
                      </span>
                    </p>
                    <p className="text-xs text-blue-800">
                      Final pricing confirmed by builder after minimum buyers reached.
                    </p>
                  </div>
                </div>
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Group Requirement & Timeline</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Minimum buyers</p>
                  <p className="mt-1 font-semibold text-slate-900">{deal.minBuyers}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Joined buyers</p>
                  <p className="mt-1 font-semibold text-slate-900">{deal.joinedBuyers}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Max buyers</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {deal.maxBuyers ? deal.maxBuyers : 'No fixed cap'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Closing</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {deal.daysLeft === null
                      ? 'No date'
                      : deal.daysLeft === 0
                        ? 'Today'
                        : `${deal.daysLeft} day(s) left`}
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <p className="mb-2 inline-flex items-center gap-1 text-sm text-slate-700">
                  <Users className="h-4 w-4 text-slate-500" />
                  Progress: {deal.joinedBuyers}/{deal.minBuyers}
                </p>
                <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${deal.progressPercent}%` }}
                  />
                </div>
              </div>
            </article>

            {joinedMessage ? (
              <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-emerald-900">{joinedMessage}</h2>
                <p className="mt-1 text-sm text-emerald-900">
                  Deal code: <span className="font-semibold">{deal.dealCode}</span>
                </p>
                <p className="mt-1 text-sm text-emerald-900">
                  Group progress: {deal.joinedBuyers}/{deal.minBuyers}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCopyShare}
                    className="border-emerald-300 bg-white"
                  >
                    <Share2 className="mr-2 h-4 w-4" />
                    Invite others
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCopyShare}
                    className="border-emerald-300 bg-white"
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy share link
                  </Button>
                </div>
              </article>
            ) : null}

            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Join Group Form</h2>
              <p className="mt-1 text-sm text-slate-600">
                Submit interest now. ZDT will connect buyers with the builder when the group completes.
              </p>

              {!deal.canJoin ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  This deal is currently {deal.status}. New joins are not allowed.
                </div>
              ) : null}

              {error && deal ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="mr-2 inline h-4 w-4" />
                  {error}
                </div>
              ) : null}

              <form onSubmit={handleJoinSubmit} className="mt-4 space-y-3">
                <label className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Full Name</p>
                  <Input
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Enter full name"
                    className="h-11 bg-white"
                    disabled={!deal.canJoin || submitting}
                  />
                </label>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Phone</p>
                    <Input
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder="Phone (optional if email provided)"
                      className="h-11 bg-white"
                      disabled={!deal.canJoin || submitting}
                    />
                  </label>

                  <label className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Email</p>
                    <Input
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="Email (optional if phone provided)"
                      className="h-11 bg-white"
                      disabled={!deal.canJoin || submitting}
                    />
                  </label>
                </div>

                <label className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Unit Preference</p>
                  <select
                    value={unitPreference}
                    onChange={(event) => setUnitPreference(event.target.value as GroupDealUnitType)}
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
                    disabled={!deal.canJoin || submitting}
                  >
                    <option value="2BHK">2BHK</option>
                    <option value="3BHK">3BHK</option>
                    <option value="SHOP">Shop</option>
                    <option value="PLOT">Plot</option>
                  </select>
                </label>

                <label className="inline-flex items-start gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={allowBuilderContactBeforeCompletion}
                    onChange={(event) => setAllowBuilderContactBeforeCompletion(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300"
                    disabled={!deal.canJoin || submitting}
                  />
                  I allow ZDT to share my contact with builder before minimum completion.
                </label>

                <label className="inline-flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={consentChecked}
                    onChange={(event) => setConsentChecked(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300"
                    disabled={!deal.canJoin || submitting}
                    required
                  />
                  <span>
                    I understand this is an interest-based group deal. ZDT will connect me to the builder when the group completes. ZDT does not collect booking money for this deal.
                  </span>
                </label>

                <Button
                  type="submit"
                  className="bg-brand-primary text-white hover:bg-brand-primary-dark"
                  disabled={!deal.canJoin || submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Joining...
                    </>
                  ) : (
                    'Join Group Deal'
                  )}
                </Button>
              </form>
            </article>

            <article className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
              <p className="font-semibold">Important Note</p>
              <p className="mt-1">{deal.mandatoryDisclaimer}</p>
            </article>
          </>
        ) : null}
      </div>
    </section>
  );
}
