import { apiRequest } from '@/lib/http';
import type { DalalCoinPreview, DalalCoinWalletSummary, DalalCoinRewardResult } from '@/lib/dalalCoinApi';
import type {
  OwnerCurrentSubscription,
  OwnerSubscriptionPlan,
} from '@/sections/owner/OwnerSubscriptionAccess';
import type { RazorpayCheckoutPayload, RazorpayCheckoutSuccessPayload } from '@/lib/razorpayCheckout';

export interface OwnerBillingOrder {
  id: number;
  orderKind: 'subscription' | 'sponsored_listing' | string;
  provider: string;
  status: string;
  currencyCode: string;
  amount: number;
  providerOrderId: string;
  providerPaymentId: string;
  providerReceipt: string;
  providerLastEventType: string;
  relatedPlanId: string;
  relatedPlanName: string;
  relatedListingReference: string;
  activatedSubscriptionId: number | null;
  fulfilledEntityType: string;
  fulfilledEntityId: number | null;
  metadata: Record<string, unknown>;
  paidAt: string | null;
  failedAt: string | null;
  expiresAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface OwnerBoostHistoryRow {
  id: number;
  listingType: string;
  boostType: string;
  amountPaid: number;
  startDate: string | null;
  endDate: string | null;
  createdAt: string | null;
}

export interface OwnerCommissionHistoryRow {
  id: number;
  propertyId: number;
  propertyTitle: string;
  commissionAmount: number;
  status: string;
  createdAt: string | null;
}

export interface OwnerPaymentsResponse {
  checkoutConfigured: boolean;
  currentSubscription: OwnerCurrentSubscription | null;
  orders: OwnerBillingOrder[];
  boostHistory: OwnerBoostHistoryRow[];
  commissionHistory: OwnerCommissionHistoryRow[];
}

export interface OwnerSubscriptionCheckoutResponse {
  order: OwnerBillingOrder;
  checkout: RazorpayCheckoutPayload;
  plan: OwnerSubscriptionPlan;
  dalalCoinPreview?: DalalCoinPreview;
  wallet?: DalalCoinWalletSummary;
}

export async function getOwnerPayments(limit = 30): Promise<OwnerPaymentsResponse> {
  return apiRequest<OwnerPaymentsResponse>(`/api/owner/payments?limit=${encodeURIComponent(String(limit))}`);
}

export async function createOwnerSubscriptionCheckout(input: {
  planId?: string;
  planName?: string;
  billingCycle?: 'monthly';
  coinsToUse?: number;
  coinsRequested?: number;
}): Promise<OwnerSubscriptionCheckoutResponse> {
  const requestedCoins = input.coinsRequested ?? input.coinsToUse ?? 0;
  return apiRequest<OwnerSubscriptionCheckoutResponse>('/api/owner/checkout/subscription', {
    method: 'POST',
    body: JSON.stringify({
      planId: input.planId || '',
      planName: input.planName || '',
      billingCycle: input.billingCycle || 'monthly',
      coinsRequested: requestedCoins,
      coinsToUse: requestedCoins,
    }),
  });
}

export async function verifyOwnerSubscriptionCheckout(input: {
  billingOrderId: number;
  payment: RazorpayCheckoutSuccessPayload;
}): Promise<{
  ok: boolean;
  message: string;
  billingOrder: OwnerBillingOrder;
  dalalCoinRewards?: DalalCoinRewardResult | null;
  wallet?: DalalCoinWalletSummary;
}> {
  return apiRequest('/api/owner/checkout/verify', {
    method: 'POST',
    body: JSON.stringify({
      billingOrderId: input.billingOrderId,
      razorpayOrderId: input.payment.razorpay_order_id,
      razorpayPaymentId: input.payment.razorpay_payment_id,
      razorpaySignature: input.payment.razorpay_signature,
    }),
  });
}
