import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Coins,
  Copy,
  Gift,
  History,
  Loader2,
  LockKeyhole,
  Megaphone,
  Smartphone,
  WalletCards,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  calculateDalalCoinPreview,
  getDalalCoinWallet,
  requestDalalCoinPhoneOtp,
  verifyDalalCoinPhoneOtp,
  type DalalCoinCheckoutKind,
  type DalalCoinPreview,
  type DalalCoinReferralHistoryRow,
  type DalalCoinWalletResponse,
} from '@/lib/dalalCoinApi';
import type { AuthUser } from '@/lib/session';

interface DalalCoinHubPageProps {
  mode: 'wallet' | 'referrals' | 'checkout';
  user: AuthUser | null;
  onOpenWallet: () => void;
  onOpenReferrals: () => void;
  onOpenCheckout: () => void;
  onOpenOwnerSubscription: () => void;
  onOpenBuildingMaterials: () => void;
}

interface CheckoutContextState {
  kind: DalalCoinCheckoutKind;
  amount: number;
  title: string;
}

interface ReferralStatusGroups {
  pendingPhoneVerification: DalalCoinReferralHistoryRow[];
  pendingFirstPaidAction: DalalCoinReferralHistoryRow[];
  completed: DalalCoinReferralHistoryRow[];
  blocked: DalalCoinReferralHistoryRow[];
}

function formatCurrency(value: number) {
  return `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;
}

function formatDate(value: string | null) {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not scheduled';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatReason(reason: string) {
  return reason
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function parseCheckoutContext(): CheckoutContextState {
  if (typeof window === 'undefined') {
    return { kind: 'subscription', amount: 0, title: '' };
  }

  const params = new URLSearchParams(window.location.search);
  const kindParam = params.get('kind');
  const kind: DalalCoinCheckoutKind =
    kindParam === 'subscription' || kindParam === 'ecommerce' || kindParam === 'property'
      ? kindParam
      : 'subscription';

  return {
    kind,
    amount: Math.max(0, Number(params.get('amount') || 0)),
    title: params.get('title') || '',
  };
}

function groupReferralHistory(rows: DalalCoinReferralHistoryRow[]): ReferralStatusGroups {
  return rows.reduce<ReferralStatusGroups>(
    (groups, row) => {
      if (row.status === 'completed') groups.completed.push(row);
      else if (row.status === 'pending_phone_verification') groups.pendingPhoneVerification.push(row);
      else if (row.status === 'pending_first_paid_action') groups.pendingFirstPaidAction.push(row);
      else groups.blocked.push(row);
      return groups;
    },
    { pendingPhoneVerification: [], pendingFirstPaidAction: [], completed: [], blocked: [] }
  );
}

function ReferralGroup({
  title,
  rows,
  emptyText,
}: {
  title: string;
  rows: DalalCoinReferralHistoryRow[];
  emptyText: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
          {rows.length}
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {rows.length ? rows.map((entry) => (
          <div key={entry.id} className="rounded-2xl border border-slate-200 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-900">
                {entry.referredUserName || entry.referredUserEmail || 'Referred user'}
              </p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                {entry.status.replace(/_/g, ' ')}
              </p>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {entry.rewardedReferrerAmount} DC reward • {formatDate(entry.createdAt)}
            </p>
          </div>
        )) : <p className="text-sm text-slate-500">{emptyText}</p>}
      </div>
    </div>
  );
}

export default function DalalCoinHubPage({
  mode,
  user,
  onOpenWallet,
  onOpenReferrals,
  onOpenCheckout,
  onOpenOwnerSubscription,
  onOpenBuildingMaterials,
}: DalalCoinHubPageProps) {
  const [walletData, setWalletData] = useState<DalalCoinWalletResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [checkoutContext, setCheckoutContext] = useState<CheckoutContextState>(() => parseCheckoutContext());
  const [coinsToUse, setCoinsToUse] = useState('');
  const [otpPhone, setOtpPhone] = useState(user?.phone || '');
  const [otpCode, setOtpCode] = useState('');
  const [otpVerificationToken, setOtpVerificationToken] = useState('');
  const [otpRequesting, setOtpRequesting] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpDevCode, setOtpDevCode] = useState('');

  useEffect(() => {
    setOtpPhone((currentValue) => currentValue || user?.phone || '');
  }, [user?.phone]);

  useEffect(() => {
    if (mode === 'checkout') {
      setCheckoutContext(parseCheckoutContext());
    }
  }, [mode]);

  const loadWallet = async () => {
    try {
      setLoading(true);
      setError('');
      setWalletData(await getDalalCoinWallet(40));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load Dalal Coin wallet.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWallet();
  }, []);

  const activePreview: DalalCoinPreview | null = useMemo(() => {
    if (!walletData || mode !== 'checkout' || checkoutContext.kind === 'property' || checkoutContext.amount <= 0) {
      return null;
    }
    return calculateDalalCoinPreview({
      kind: checkoutContext.kind,
      baseAmount: checkoutContext.amount,
      requestedCoins: Number(coinsToUse || 0),
      spendableCoins: walletData.wallet.spendableCoins,
    });
  }, [checkoutContext.amount, checkoutContext.kind, coinsToUse, mode, walletData]);

  const referralGroups = useMemo(
    () => groupReferralHistory(walletData?.referrals.history || []),
    [walletData?.referrals.history]
  );

  const sharePath = walletData?.referrals.code
    ? walletData.referrals.sharePath || `/register?ref=${encodeURIComponent(walletData.referrals.code)}`
    : '';

  const requestOtp = async () => {
    if (!otpPhone.trim()) {
      toast.error('Enter the phone number you want to verify first.');
      return;
    }
    setOtpRequesting(true);
    try {
      const response = await requestDalalCoinPhoneOtp(otpPhone.trim());
      setOtpVerificationToken(response.verificationToken);
      setOtpDevCode(response.devOtp || '');
      toast.success(response.message);
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : 'Unable to send OTP.');
    } finally {
      setOtpRequesting(false);
    }
  };

  const verifyOtp = async () => {
    if (!otpVerificationToken || !otpCode.trim()) {
      toast.error('Request and enter the OTP first.');
      return;
    }
    setOtpVerifying(true);
    try {
      await verifyDalalCoinPhoneOtp({
        phone: otpPhone.trim(),
        verificationToken: otpVerificationToken,
        otp: otpCode.trim(),
      });
      setOtpCode('');
      setOtpVerificationToken('');
      setOtpDevCode('');
      toast.success('Phone verified successfully.');
      await loadWallet();
    } catch (verifyError) {
      toast.error(verifyError instanceof Error ? verifyError.message : 'Unable to verify OTP.');
    } finally {
      setOtpVerifying(false);
    }
  };

  const copyReferralCode = async () => {
    if (!walletData?.referrals.code) return;
    try {
      await navigator.clipboard.writeText(walletData.referrals.code);
      toast.success('Referral code copied.');
    } catch {
      toast.error('Unable to copy referral code.');
    }
  };

  const shareReferral = async () => {
    if (!walletData?.referrals.code || !sharePath) return;
    const shareLink = `${window.location.origin}${sharePath}`;
    const shareText = `Join me on ZDT Realty and use my Dalal Coin referral code ${walletData.referrals.code}: ${shareLink}`;

    try {
      if (navigator.share) {
        await navigator.share({ title: 'Join with my Dalal Coin referral', text: shareText, url: shareLink });
        return;
      }
      window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank', 'noopener,noreferrer');
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name !== 'AbortError') {
        toast.error(shareError.message);
      }
    }
  };

  return (
    <section className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#ecfeff_40%,#ffffff_100%)] pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-6">
        <div className="rounded-[32px] border border-slate-200 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">Dalal Coin Economy</p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-900 sm:text-4xl">
                Wallet, referrals, and spend controls for a closed-loop startup economy
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Unlock pending rewards with phone OTP verification, then use Dalal Coins on owner subscriptions and building materials checkout.
              </p>
            </div>
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">Spendable Balance</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">
                {walletData ? `${walletData.wallet.spendableCoins} DC` : '...'}
              </p>
              <p className="mt-1 text-xs text-slate-600">Pending unlock: {walletData?.wallet.pendingBalance || 0} DC</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant={mode === 'wallet' ? 'default' : 'outline'} onClick={onOpenWallet}>
              <WalletCards className="mr-2 h-4 w-4" />
              Wallet
            </Button>
            <Button variant={mode === 'referrals' ? 'default' : 'outline'} onClick={onOpenReferrals}>
              <Gift className="mr-2 h-4 w-4" />
              Referrals
            </Button>
            <Button variant={mode === 'checkout' ? 'default' : 'outline'} onClick={onOpenCheckout}>
              <Coins className="mr-2 h-4 w-4" />
              Checkout
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center rounded-3xl border border-slate-200 bg-white p-12 text-slate-500">
            <Loader2 className="mr-3 h-5 w-5 animate-spin" />
            Loading Dalal Coin wallet...
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>
        ) : null}
        {!loading && !error && walletData && !walletData.wallet.phoneVerified ? (
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-white p-3 text-amber-700 shadow-sm">
                  <LockKeyhole className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Wallet Locked For Spend</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-900">Verify your phone to unlock pending rewards</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Signup and referral grants stay pending until this number is OTP verified. Once verified, subscription and materials checkout can use coins immediately.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-slate-900">Phone OTP Verification</h2>
              </div>
              <div className="mt-4 space-y-3">
                <Input inputMode="tel" value={otpPhone} onChange={(event) => setOtpPhone(event.target.value)} placeholder="+91 98765 43210" />
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <Input inputMode="numeric" value={otpCode} onChange={(event) => setOtpCode(event.target.value.replace(/[^\d]/g, ''))} placeholder="Enter OTP" />
                  <Button type="button" variant="outline" disabled={otpRequesting} onClick={() => void requestOtp()}>
                    {otpRequesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Request OTP
                  </Button>
                </div>
                <Button type="button" className="w-full" disabled={otpVerifying || !otpVerificationToken} onClick={() => void verifyOtp()}>
                  {otpVerifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BadgeCheck className="mr-2 h-4 w-4" />}
                  Verify And Unlock Wallet
                </Button>
                {otpDevCode ? (
                  <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-700">
                    Dev OTP: <span className="font-semibold">{otpDevCode}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {!loading && !error && walletData && mode === 'wallet' ? (
          <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Available</p>
                  <p className="mt-2 text-3xl font-semibold text-slate-900">{walletData.wallet.spendableCoins} DC</p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Pending</p>
                  <p className="mt-2 text-3xl font-semibold text-slate-900">{walletData.wallet.pendingBalance || 0} DC</p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Lifetime Earned</p>
                  <p className="mt-2 text-3xl font-semibold text-slate-900">{walletData.wallet.lifetimeEarned} DC</p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Next Expiry</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{formatDate(walletData.wallet.nextExpiryAt)}</p>
                </div>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <h2 className="text-lg font-semibold text-slate-900">Expiry Lots</h2>
                </div>
                <div className="mt-4 space-y-3">
                  {walletData.expiry.length ? walletData.expiry.map((bucket) => (
                    <div key={`${bucket.expiryDate}-${bucket.amount}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-sm font-medium text-slate-900">{bucket.amount} DC</p>
                      <p className="text-xs text-slate-500">Expires {formatDate(bucket.expiryDate)}</p>
                    </div>
                  )) : <p className="text-sm text-slate-500">No active expiry buckets right now.</p>}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-slate-900">Transaction History</h2>
              </div>
              <div className="mt-4 space-y-3">
                {walletData.transactions.length ? walletData.transactions.map((transaction) => (
                  <div key={transaction.id} className="rounded-2xl border border-slate-200 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{formatReason(transaction.reason)}</p>
                      <p className={`text-sm font-semibold ${transaction.type === 'credit' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {transaction.type === 'credit' ? '+' : '-'}{transaction.amount} DC
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDate(transaction.createdAt)} {transaction.expiresAt ? `• Expires ${formatDate(transaction.expiresAt)}` : ''}
                    </p>
                  </div>
                )) : <p className="text-sm text-slate-500">No Dalal Coin activity yet.</p>}
              </div>
            </div>
          </div>
        ) : null}
        {!loading && !error && walletData && mode === 'referrals' ? (
          <>
            <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Referral Code</p>
                    <p className="mt-2 text-3xl font-semibold text-slate-900">{walletData.referrals.code}</p>
                    <p className="mt-2 text-sm text-slate-500">
                      Your friend unlocks after phone verification. Your 30 DC unlocks after their first paid subscription or materials order.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => void copyReferralCode()}>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy
                    </Button>
                    <Button onClick={() => void shareReferral()}>
                      <Megaphone className="mr-2 h-4 w-4" />
                      Share
                    </Button>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Completed</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{referralGroups.completed.length}</p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Pending Phone Verify</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{referralGroups.pendingPhoneVerification.length}</p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Pending First Paid</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{referralGroups.pendingFirstPaidAction.length}</p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Earned As Referrer</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{walletData.referrals.earnedAsReferrer} DC</p>
                </div>
              </div>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <ReferralGroup title="Pending Phone Verification" rows={referralGroups.pendingPhoneVerification} emptyText="No referrals are waiting for phone verification." />
              <ReferralGroup title="Pending First Paid Action" rows={referralGroups.pendingFirstPaidAction} emptyText="No referrals are waiting on a first paid order." />
              <ReferralGroup title="Completed Referrals" rows={referralGroups.completed} emptyText="No completed referral rewards yet." />
              <ReferralGroup title="Blocked Or Flagged" rows={referralGroups.blocked} emptyText="No blocked referrals right now." />
            </div>
          </>
        ) : null}

        {!loading && !error && walletData && mode === 'checkout' ? (
          <div className="grid gap-4 lg:grid-cols-[1fr_0.95fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Checkout Calculator</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                {checkoutContext.kind === 'subscription'
                  ? 'Subscription discount'
                  : checkoutContext.kind === 'ecommerce'
                    ? 'Materials order discount'
                    : 'Property redemption is not live yet'}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                {checkoutContext.kind === 'property'
                  ? 'Property Dalal Coin redemption is intentionally deferred in this MVP.'
                  : checkoutContext.amount > 0
                    ? `Base amount: ${formatCurrency(checkoutContext.amount)}${checkoutContext.title ? ` • ${checkoutContext.title}` : ''}`
                    : 'Use the linked subscription and materials flows for a contextual calculator.'}
              </p>
              {checkoutContext.kind !== 'property' && checkoutContext.amount > 0 ? (
                <>
                  {!walletData.wallet.phoneVerified ? (
                    <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      Verify your phone first if you want to spend Dalal Coins.
                    </div>
                  ) : null}
                  <div className="mt-5 space-y-2">
                    <label className="text-sm font-medium text-slate-700">Dalal Coins to apply</label>
                    <Input value={coinsToUse} onChange={(event) => setCoinsToUse(event.target.value.replace(/[^\d]/g, ''))} placeholder={`Max ${walletData.wallet.spendableCoins} DC available`} />
                  </div>
                  {activePreview ? (
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Coins Applied</p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">{activePreview.coinsApplied} DC</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Discount</p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(activePreview.discountValue)}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Final Amount</p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(activePreview.finalAmount)}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Rule</p>
                        <p className="mt-2 text-base font-semibold text-slate-900">
                          {activePreview.maxDiscountPercent}% max • 1 DC = {formatCurrency(activePreview.coinValueInr)}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
              <div className="mt-5 flex flex-wrap gap-3">
                <Button onClick={onOpenOwnerSubscription}>
                  Subscription Checkout
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button variant="outline" onClick={onOpenBuildingMaterials}>
                  Materials Checkout
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">Wallet Snapshot</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Spendable</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{walletData.wallet.spendableCoins} DC</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Pending Unlock</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{walletData.wallet.pendingBalance || 0} DC</p>
                  </div>
                </div>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">Spend Rules</h3>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <p>Subscriptions: 1 DC = ₹2 and up to 40% of the plan value.</p>
                  <p>Materials: 1 DC = ₹1 and up to 10% of merchandise subtotal.</p>
                  <p>Delivery charges stay outside the Dalal Coin discount on materials checkout.</p>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
