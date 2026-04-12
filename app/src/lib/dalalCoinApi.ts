import { apiRequest } from '@/lib/http';

export type DalalCoinCheckoutKind = 'property' | 'subscription' | 'ecommerce';

export interface DalalCoinWalletSummary {
  userId: number;
  balance: number;
  availableBalance?: number;
  confirmedBalance?: number;
  pendingBalance?: number;
  reservedCoins: number;
  heldCoins?: number;
  spendableCoins: number;
  referralCode: string;
  referredByUserId: number | null;
  phoneVerified?: boolean;
  tier: string;
  tierLabel: string;
  lifetimeEarned: number;
  lifetimeUsed: number;
  nextExpiryAt: string | null;
  expiringSoonCoins: number;
  createdAt: string | null;
}

export interface DalalCoinTransaction {
  id: number;
  amount: number;
  remainingAmount: number;
  type: 'credit' | 'debit' | string;
  reason: string;
  referenceType: string;
  referenceId: string;
  expiresAt: string | null;
  createdAt: string | null;
  metadata: Record<string, unknown>;
}

export interface DalalCoinExpiryBucket {
  expiryDate: string | null;
  amount: number;
}

export interface DalalCoinReferralHistoryRow {
  id: number;
  status: string;
  referralCode: string;
  referredUserName: string;
  referredUserEmail: string;
  qualifyingAction: string;
  qualifyingReferenceId: string;
  rewardedReferrerAmount: number;
  rewardedReferredAmount: number;
  completedAt: string | null;
  createdAt: string | null;
}

export interface DalalCoinReferralsSummary {
  code: string;
  sharePath: string;
  completedCount: number;
  pendingCount: number;
  earnedAsReferrer: number;
  history: DalalCoinReferralHistoryRow[];
}

export interface DalalCoinRewardRules {
  coinName: string;
  coinCode: string;
  expiryMonths: number;
  signupBonus: number;
  referralBonusForReferrer: number;
  referralBonusForNewUser: number;
  firstPurchaseBonus: number;
  cashback: Record<string, unknown>;
  usage: Record<string, unknown>;
  tiers?: Array<Record<string, unknown>>;
}

export interface DalalCoinWalletResponse {
  wallet: DalalCoinWalletSummary;
  transactions: DalalCoinTransaction[];
  expiry: DalalCoinExpiryBucket[];
  referrals: DalalCoinReferralsSummary;
  leaderboard: Array<{ rank: number; userId: number; name: string; successfulReferrals: number }>;
  campaigns: Array<Record<string, unknown>>;
  rewardRules: DalalCoinRewardRules;
}

export interface DalalCoinPreview {
  kind: DalalCoinCheckoutKind;
  baseAmount: number;
  deliveryAmount?: number;
  availableCoins: number;
  reservedCoins: number;
  spendableCoins: number;
  requestedCoins: number;
  coinsApplied: number;
  coinValueInr: number;
  maxDiscountPercent: number;
  maxDiscountValue: number;
  maxCoinsAllowed: number;
  discountValue: number;
  finalAmount: number;
  effectiveDiscountPercent: number;
  discountBand?: string;
  phoneVerified?: boolean;
  lockedReason?: string;
}

export interface DalalCoinPreviewResponse {
  preview: DalalCoinPreview;
  wallet: DalalCoinWalletSummary;
  rewardRules: DalalCoinRewardRules;
}

export interface DalalCoinRewardResult {
  cashbackCoins?: number;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toObject<T extends Record<string, unknown>>(value: unknown): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {} as T;
  }
  return value as T;
}

function buildRewardRules(): DalalCoinRewardRules {
  return {
    coinName: 'Dalal Coin',
    coinCode: 'DC',
    expiryMonths: 6,
    signupBonus: 10,
    referralBonusForReferrer: 30,
    referralBonusForNewUser: 10,
    firstPurchaseBonus: 30,
    cashback: {
      subscriptionPercent: 2,
      ecommercePercent: 5,
    },
    usage: {
      subscription: {
        coinValueInr: 2,
        maxDiscountPercent: 40,
      },
      ecommerce: {
        coinValueInr: 1,
        maxDiscountPercent: 10,
      },
    },
    tiers: [],
  };
}

function mapWalletSummary(wallet: Record<string, unknown>): DalalCoinWalletSummary {
  return {
    userId: toNumber(wallet.userId),
    balance: toNumber(wallet.balance),
    availableBalance: toNumber(wallet.availableBalance),
    confirmedBalance: toNumber(wallet.confirmedBalance),
    pendingBalance: toNumber(wallet.pendingBalance),
    reservedCoins: toNumber(wallet.reservedCoins ?? wallet.heldCoins),
    heldCoins: toNumber(wallet.heldCoins ?? wallet.reservedCoins),
    spendableCoins: toNumber(wallet.spendableCoins ?? wallet.availableBalance),
    referralCode: String(wallet.referralCode || ''),
    referredByUserId:
      wallet.referredByUserId === null || wallet.referredByUserId === undefined
        ? null
        : toNumber(wallet.referredByUserId),
    phoneVerified: Boolean(wallet.phoneVerified),
    tier: String(wallet.tier || 'silver'),
    tierLabel: String(wallet.tierLabel || 'Silver'),
    lifetimeEarned: toNumber(wallet.lifetimeEarned),
    lifetimeUsed: toNumber(wallet.lifetimeUsed),
    nextExpiryAt: typeof wallet.nextExpiryAt === 'string' ? wallet.nextExpiryAt : null,
    expiringSoonCoins: toNumber(wallet.expiringSoonCoins),
    createdAt: typeof wallet.createdAt === 'string' ? wallet.createdAt : null,
  };
}

function mapPreview(quote: Record<string, unknown>): DalalCoinPreview {
  return {
    kind: String(quote.kind || 'ecommerce') as DalalCoinCheckoutKind,
    baseAmount: toNumber(quote.baseAmount),
    deliveryAmount: toNumber(quote.deliveryAmount),
    availableCoins: toNumber(quote.availableBalance),
    reservedCoins: toNumber(quote.heldCoins),
    spendableCoins: toNumber(quote.spendableCoins),
    requestedCoins: toNumber(quote.requestedCoins),
    coinsApplied: toNumber(quote.coinsApplied),
    coinValueInr: toNumber(quote.coinValueInr),
    maxDiscountPercent: toNumber(quote.maxDiscountPercent),
    maxDiscountValue: toNumber(quote.maxDiscountValue),
    maxCoinsAllowed: toNumber(quote.maxCoinsAllowed),
    discountValue: toNumber(quote.discountValue),
    finalAmount: toNumber(quote.finalAmount),
    effectiveDiscountPercent: toNumber(quote.effectiveDiscountPercent),
    discountBand:
      String(quote.kind || '') === 'subscription'
        ? 'Subscription saver'
        : 'E-commerce accelerator',
    phoneVerified: Boolean(quote.phoneVerified),
    lockedReason: typeof quote.lockedReason === 'string' ? quote.lockedReason : '',
  };
}

export function calculateDalalCoinPreview(input: {
  kind: DalalCoinCheckoutKind;
  baseAmount: number;
  requestedCoins: number;
  spendableCoins: number;
}): DalalCoinPreview {
  const normalizedKind = input.kind === 'subscription' ? 'subscription' : input.kind === 'ecommerce' ? 'ecommerce' : 'property';
  const baseAmount = Math.max(0, Number(input.baseAmount) || 0);
  const spendableCoins = Math.max(0, Math.floor(Number(input.spendableCoins) || 0));
  const requestedCoins = Math.max(0, Math.floor(Number(input.requestedCoins) || 0));

  const usageRules =
    normalizedKind === 'subscription'
      ? { coinValueInr: 2, maxDiscountPercent: 40, discountBand: 'Subscription saver' }
      : { coinValueInr: 1, maxDiscountPercent: 10, discountBand: 'E-commerce accelerator' };

  const maxDiscountValue = Math.round(baseAmount * (usageRules.maxDiscountPercent / 100) * 100) / 100;
  const maxCoinsAllowed = Math.max(0, Math.floor(maxDiscountValue / usageRules.coinValueInr));
  const coinsApplied = Math.min(requestedCoins, maxCoinsAllowed, spendableCoins);
  const discountValue = Math.round(coinsApplied * usageRules.coinValueInr * 100) / 100;
  const finalAmount = Math.max(0, Math.round((baseAmount - discountValue) * 100) / 100);
  const effectiveDiscountPercent =
    baseAmount > 0 ? Math.round((discountValue / baseAmount) * 10000) / 100 : 0;

  return {
    kind: normalizedKind,
    baseAmount,
    availableCoins: spendableCoins,
    reservedCoins: 0,
    spendableCoins,
    requestedCoins,
    coinsApplied,
    coinValueInr: usageRules.coinValueInr,
    maxDiscountPercent: usageRules.maxDiscountPercent,
    maxDiscountValue,
    maxCoinsAllowed,
    discountValue,
    finalAmount,
    effectiveDiscountPercent,
    discountBand: usageRules.discountBand,
    phoneVerified: true,
    lockedReason: '',
  };
}

export async function getDalalCoinWallet(limit = 40): Promise<DalalCoinWalletResponse> {
  const [walletPayload, referralsPayload] = await Promise.all([
    apiRequest<Record<string, unknown>>(`/api/dalal-coins/wallet?limit=${encodeURIComponent(String(limit))}`),
    apiRequest<Record<string, unknown>>('/api/dalal-coins/referrals'),
  ]);

  const wallet = mapWalletSummary(toObject(walletPayload.wallet));
  const expiringLots = Array.isArray(walletPayload.expiringLots) ? walletPayload.expiringLots : [];
  const transactions = Array.isArray(walletPayload.transactions) ? walletPayload.transactions : [];
  const referralsSummary = toObject(referralsPayload.summary);
  const referralRows = Array.isArray(referralsPayload.referrals) ? referralsPayload.referrals : [];

  return {
    wallet,
    transactions: transactions.map((transaction) => {
      const entry = toObject<Record<string, unknown>>(transaction);
      const signedAmount = toNumber(entry.amount);
      return {
        id: toNumber(entry.id),
        amount: Math.abs(signedAmount),
        remainingAmount: 0,
        type: signedAmount >= 0 ? 'credit' : 'debit',
        reason: String(entry.reasonCode || ''),
        referenceType: String(entry.referenceType || ''),
        referenceId: String(entry.referenceId || ''),
        expiresAt: typeof entry.expiresAt === 'string' ? entry.expiresAt : null,
        createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : null,
        metadata: toObject(entry.metadata),
      };
    }),
    expiry: expiringLots.map((lot) => {
      const entry = toObject<Record<string, unknown>>(lot);
      return {
        expiryDate: typeof entry.expiresAt === 'string' ? entry.expiresAt : null,
        amount: toNumber(entry.amount),
      };
    }),
    referrals: {
      code: String(referralsPayload.referralCode || wallet.referralCode || ''),
      sharePath: String(referralsPayload.sharePath || ''),
      completedCount: toNumber(referralsSummary.completedCount),
      pendingCount:
        toNumber(referralsSummary.pendingPhoneVerificationCount)
        + toNumber(referralsSummary.pendingFirstPaidActionCount),
      earnedAsReferrer: toNumber(referralsSummary.earnedCoins),
      history: referralRows.map((row) => {
        const entry = toObject<Record<string, unknown>>(row);
        return {
          id: toNumber(entry.id),
          status: String(entry.status || ''),
          referralCode: String(entry.referralCode || ''),
          referredUserName: String(entry.referredUserName || ''),
          referredUserEmail: String(entry.referredUserEmail || ''),
          qualifyingAction: String(entry.firstPaidOrderType || ''),
          qualifyingReferenceId: String(entry.firstPaidOrderId || ''),
          rewardedReferrerAmount: entry.status === 'completed' ? 30 : 0,
          rewardedReferredAmount: 0,
          completedAt: typeof entry.completedAt === 'string' ? entry.completedAt : null,
          createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : null,
        };
      }),
    },
    leaderboard: [],
    campaigns: [],
    rewardRules: buildRewardRules(),
  };
}

export async function previewDalalCoinUsage(input: {
  kind: DalalCoinCheckoutKind;
  baseAmount: number;
  requestedCoins?: number;
  deliveryAmount?: number;
}): Promise<DalalCoinPreviewResponse> {
  const [quotePayload, walletPayload] = await Promise.all([
    apiRequest<{ quote: Record<string, unknown> }>('/api/dalal-coins/quote', {
      method: 'POST',
      body: JSON.stringify({
        kind: input.kind === 'property' ? 'ecommerce' : input.kind,
        baseAmount: input.baseAmount,
        requestedCoins: input.requestedCoins ?? 0,
        deliveryAmount: input.deliveryAmount ?? 0,
      }),
    }),
    getDalalCoinWallet(10),
  ]);

  return {
    preview: mapPreview(toObject(quotePayload.quote)),
    wallet: walletPayload.wallet,
    rewardRules: walletPayload.rewardRules,
  };
}

export async function requestDalalCoinPhoneOtp(phone: string): Promise<{
  message: string;
  verificationToken: string;
  expiresInMinutes: number;
  delivered: boolean;
  devOtp?: string;
}> {
  return apiRequest('/auth/phone-otp/request', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

export async function verifyDalalCoinPhoneOtp(input: {
  phone: string;
  verificationToken: string;
  otp: string;
}) {
  return apiRequest('/auth/phone-otp/verify', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function createDalalCoinPropertyCheckout(_input: {
  propertyId: number;
  coinsToUse: number;
}) {
  return apiRequest('/api/dalal-coins/checkout/property', {
    method: 'POST',
  });
}

export async function createDalalCoinEcommerceCheckout(_input: {
  items: Array<{ itemId: string; quantity: number }>;
  coinsToUse: number;
}) {
  throw new Error('Use the building materials checkout flow for ecommerce orders.');
}
