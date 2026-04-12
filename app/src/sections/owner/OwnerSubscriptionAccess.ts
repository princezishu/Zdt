import { createContext, useContext } from 'react';
import { ApiError } from '@/lib/http';

export interface OwnerSubscriptionPlan {
  planId: string;
  planName: string;
  tier: string;
  monthlyPrice: number;
  yearlyPrice: number;
  listingQuota: number;
  boostCredits: number;
  features: Record<string, boolean | number>;
}

export interface OwnerCurrentSubscription extends OwnerSubscriptionPlan {
  id: number | null;
  subscriptionTier: string;
  startDate: string | null;
  endDate: string | null;
  isFallback: boolean;
}

export interface OwnerSubscriptionUsage {
  properties: number;
  rentals: number;
  activeListings: number;
  listingQuota: number;
  remainingListings: number;
}

export interface OwnerSubscriptionAccess {
  crm: {
    enabled: boolean;
    featureKey: 'crm_access';
    message: string;
  };
  analytics: {
    enabled: boolean;
    featureKey: 'analytics_access';
    message: string;
  };
  boosts: {
    enabled: boolean;
    featureKey: 'boost_listing';
    remainingCredits: number;
    message: string;
  };
  verifiedEligibility: {
    enabled: boolean;
    featureKey: 'verified_eligibility';
    message: string;
  };
  listingQuota: {
    limit: number;
    used: number;
    remaining: number;
    canCreate: boolean;
    message: string;
  };
}

export interface OwnerSubscriptionOverviewResponse {
  currentSubscription: OwnerCurrentSubscription | null;
  usage: OwnerSubscriptionUsage;
  plans: OwnerSubscriptionPlan[];
  access: OwnerSubscriptionAccess;
}

export interface OwnerSubscriptionAccessContextValue {
  overview: OwnerSubscriptionOverviewResponse | null;
  currentSubscription: OwnerCurrentSubscription | null;
  usage: OwnerSubscriptionUsage | null;
  plans: OwnerSubscriptionPlan[];
  access: OwnerSubscriptionAccess | null;
  loading: boolean;
  error: string;
  refreshAccess: () => Promise<OwnerSubscriptionOverviewResponse | null>;
}

export const OwnerSubscriptionAccessContext =
  createContext<OwnerSubscriptionAccessContextValue | null>(null);

export function isOwnerSubscriptionAccessError(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 403) {
    return false;
  }

  const payload =
    error.payload && typeof error.payload === 'object' && !Array.isArray(error.payload)
      ? error.payload
      : null;

  const missingFeature =
    payload && 'missingFeature' in payload && typeof payload.missingFeature === 'string'
      ? payload.missingFeature
      : '';

  const payloadCode =
    payload && 'code' in payload && typeof payload.code === 'string' ? payload.code : '';

  const code = payloadCode || error.code;
  return Boolean(
    missingFeature ||
      [
        'subscription_required',
        'subscription_feature_missing',
        'subscription_boost_credits_exhausted',
        'listing_quota_reached',
        'listing_quota_unavailable',
      ].includes(code)
  );
}

export function useOwnerSubscriptionAccess() {
  const context = useContext(OwnerSubscriptionAccessContext);
  if (!context) {
    throw new Error('useOwnerSubscriptionAccess must be used within OwnerSubscriptionAccessProvider.');
  }
  return context;
}
