export type MaterialDeliveryTier = 'heavy' | 'medium';

export const FREE_DELIVERY_THRESHOLD = 5000;
export const BULK_DELIVERY_DISCOUNT_QTY_THRESHOLD = 10;
export const BULK_DELIVERY_DISCOUNT_RATE = 0.5;

interface DeliveryBand {
  maxDistanceKm: number;
  label: string;
  ratePerKm: number;
  minCharge: number;
}

interface DeliveryPolicy {
  label: string;
  basePrice: number;
  defaultCap: number;
  maxPerKm: number;
  bands: DeliveryBand[];
}

const DELIVERY_POLICIES: Record<MaterialDeliveryTier, DeliveryPolicy> = {
  heavy: {
    label: 'Heavy Materials',
    basePrice: 49,
    defaultCap: 1000,
    maxPerKm: 30,
    bands: [
      { maxDistanceKm: 3, label: '0-3 km', ratePerKm: 0, minCharge: 49 },
      { maxDistanceKm: 10, label: '3-10 km', ratePerKm: 15, minCharge: 150 },
      { maxDistanceKm: 20, label: '10-20 km', ratePerKm: 18, minCharge: 300 },
      { maxDistanceKm: 50, label: '20-50 km', ratePerKm: 22, minCharge: 600 },
      { maxDistanceKm: Number.POSITIVE_INFINITY, label: '50+ km', ratePerKm: 25, minCharge: 1200 },
    ],
  },
  medium: {
    label: 'Medium Materials',
    basePrice: 29,
    defaultCap: 500,
    maxPerKm: 20,
    bands: [
      { maxDistanceKm: 3, label: '0-3 km', ratePerKm: 0, minCharge: 29 },
      { maxDistanceKm: 10, label: '3-10 km', ratePerKm: 10, minCharge: 80 },
      { maxDistanceKm: 20, label: '10-20 km', ratePerKm: 12, minCharge: 150 },
      { maxDistanceKm: 50, label: '20-50 km', ratePerKm: 15, minCharge: 300 },
      { maxDistanceKm: Number.POSITIVE_INFINITY, label: '50+ km', ratePerKm: 18, minCharge: 600 },
    ],
  },
};

const HEAVY_CATEGORY_KEYWORDS = [
  'sand',
  'brick',
  'bricks',
  'steel',
  'gravel',
  'aggregate',
  'tmt',
  'rebar',
  'rod',
  'metal',
];

function roundCurrency(value: number): number {
  return Math.max(0, Math.round(value));
}

function normalizeDistanceKm(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

function resolveDeliveryBand(tier: MaterialDeliveryTier, distanceKm: number): DeliveryBand {
  const bands = DELIVERY_POLICIES[tier].bands;
  return bands.find((band) => distanceKm <= band.maxDistanceKm) || bands[bands.length - 1];
}

export function resolveMaterialDeliveryTier(category: string): MaterialDeliveryTier {
  const normalizedCategory = String(category || '').trim().toLowerCase();
  if (HEAVY_CATEGORY_KEYWORDS.some((keyword) => normalizedCategory.includes(keyword))) {
    return 'heavy';
  }
  return 'medium';
}

export interface MaterialDeliveryQuoteInput {
  category: string;
  distanceKm: number;
  orderSubtotal: number;
  quantity?: number;
  applyPromotions?: boolean;
}

export interface MaterialDeliveryQuote {
  tier: MaterialDeliveryTier;
  tierLabel: string;
  distanceKm: number;
  quantity: number;
  orderSubtotal: number;
  bandLabel: string;
  ratePerKm: number;
  basePrice: number;
  defaultCap: number;
  maxPerKm: number;
  minBandCharge: number;
  rawCharge: number;
  cappedCharge: number;
  finalCharge: number;
  capApplied: boolean;
  freeDeliveryApplied: boolean;
  bulkDiscountApplied: boolean;
  savings: number;
  offerLabel: string | null;
}

export function quoteMaterialDelivery(input: MaterialDeliveryQuoteInput): MaterialDeliveryQuote {
  const distanceKm = normalizeDistanceKm(input.distanceKm);
  const quantity = Math.max(1, Math.round(Number(input.quantity || 1)));
  const orderSubtotal = roundCurrency(Number(input.orderSubtotal || 0));
  const tier = resolveMaterialDeliveryTier(input.category);
  const policy = DELIVERY_POLICIES[tier];
  const band = resolveDeliveryBand(tier, distanceKm);

  const rawCharge =
    band.ratePerKm === 0
      ? policy.basePrice
      : roundCurrency(Math.max(policy.basePrice + distanceKm * band.ratePerKm, band.minCharge));
  const cappedCharge = roundCurrency(Math.min(rawCharge, policy.defaultCap));
  const applyPromotions = input.applyPromotions !== false;

  let finalCharge = cappedCharge;
  let freeDeliveryApplied = false;
  let bulkDiscountApplied = false;
  let offerLabel: string | null = null;

  if (applyPromotions && orderSubtotal >= FREE_DELIVERY_THRESHOLD) {
    finalCharge = 0;
    freeDeliveryApplied = true;
    offerLabel = `Free delivery above Rs ${FREE_DELIVERY_THRESHOLD}`;
  } else if (applyPromotions && quantity >= BULK_DELIVERY_DISCOUNT_QTY_THRESHOLD) {
    finalCharge = roundCurrency(cappedCharge * BULK_DELIVERY_DISCOUNT_RATE);
    bulkDiscountApplied = true;
    offerLabel = '50% bulk delivery discount applied';
  } else if (rawCharge > cappedCharge) {
    offerLabel = `Delivery capped at Rs ${policy.defaultCap}`;
  }

  return {
    tier,
    tierLabel: policy.label,
    distanceKm,
    quantity,
    orderSubtotal,
    bandLabel: band.label,
    ratePerKm: band.ratePerKm,
    basePrice: policy.basePrice,
    defaultCap: policy.defaultCap,
    maxPerKm: policy.maxPerKm,
    minBandCharge: band.minCharge,
    rawCharge,
    cappedCharge,
    finalCharge,
    capApplied: rawCharge > cappedCharge,
    freeDeliveryApplied,
    bulkDiscountApplied,
    savings: Math.max(0, rawCharge - finalCharge),
    offerLabel,
  };
}
