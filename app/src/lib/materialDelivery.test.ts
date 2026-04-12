import { describe, expect, it } from 'vitest';
import {
  BULK_DELIVERY_DISCOUNT_QTY_THRESHOLD,
  FREE_DELIVERY_THRESHOLD,
  quoteMaterialDelivery,
  resolveMaterialDeliveryTier,
} from './materialDelivery';

describe('resolveMaterialDeliveryTier', () => {
  it('classifies heavy raw materials as heavy', () => {
    expect(resolveMaterialDeliveryTier('Steel TMT Bars')).toBe('heavy');
    expect(resolveMaterialDeliveryTier('River Sand')).toBe('heavy');
  });

  it('defaults non-heavy categories to medium', () => {
    expect(resolveMaterialDeliveryTier('Cement')).toBe('medium');
    expect(resolveMaterialDeliveryTier('Tiles')).toBe('medium');
  });
});

describe('quoteMaterialDelivery', () => {
  it('applies the default cap for long-distance heavy materials', () => {
    const quote = quoteMaterialDelivery({
      category: 'Steel',
      distanceKm: 60,
      orderSubtotal: 3000,
      quantity: 2,
    });

    expect(quote.tier).toBe('heavy');
    expect(quote.rawCharge).toBeGreaterThan(quote.defaultCap);
    expect(quote.cappedCharge).toBe(1000);
    expect(quote.finalCharge).toBe(1000);
    expect(quote.capApplied).toBe(true);
  });

  it('grants free delivery for orders above the threshold', () => {
    const quote = quoteMaterialDelivery({
      category: 'Cement',
      distanceKm: 18,
      orderSubtotal: FREE_DELIVERY_THRESHOLD,
      quantity: 4,
    });

    expect(quote.freeDeliveryApplied).toBe(true);
    expect(quote.finalCharge).toBe(0);
  });

  it('applies the bulk delivery discount when quantity threshold is reached', () => {
    const quote = quoteMaterialDelivery({
      category: 'Tiles',
      distanceKm: 12,
      orderSubtotal: 4200,
      quantity: BULK_DELIVERY_DISCOUNT_QTY_THRESHOLD,
    });

    expect(quote.bulkDiscountApplied).toBe(true);
    expect(quote.finalCharge).toBe(Math.round(quote.cappedCharge * 0.5));
  });

  it('can disable promotions for order-level cart calculations', () => {
    const quote = quoteMaterialDelivery({
      category: 'Bricks',
      distanceKm: 8,
      orderSubtotal: 8000,
      quantity: 20,
      applyPromotions: false,
    });

    expect(quote.freeDeliveryApplied).toBe(false);
    expect(quote.bulkDiscountApplied).toBe(false);
    expect(quote.finalCharge).toBe(quote.cappedCharge);
  });
});
