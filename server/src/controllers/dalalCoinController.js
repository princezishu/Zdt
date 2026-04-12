import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import {
  DALAL_COIN_RULES,
} from '../services/dalalCoin.js';
import {
  getDalalCoinQuoteForUser,
  getDalalCoinReferrals,
  getDalalCoinWallet,
} from '../services/dalalCoinMvp.js';

const router = Router();

const walletQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(40),
});

const quoteSchema = z.object({
  kind: z.enum(['subscription', 'ecommerce']),
  baseAmount: z.coerce.number().positive(),
  deliveryAmount: z.coerce.number().min(0).optional().default(0),
  requestedCoins: z.coerce.number().int().min(0).optional(),
});

router.use(requireAuth);

router.get('/wallet', async (req, res, next) => {
  try {
    const query = walletQuerySchema.parse(req.query || {});
    const wallet = await getDalalCoinWallet(pool, req.user.id, {
      transactionLimit: query.limit,
    });

    return res.json({
      ...wallet,
      rewardRules: {
        coinName: DALAL_COIN_RULES.coinName,
        coinCode: DALAL_COIN_RULES.code,
        expiryMonths: DALAL_COIN_RULES.expiryMonths,
        signupBonus: DALAL_COIN_RULES.signupBonus,
        referralBonusForReferrer: DALAL_COIN_RULES.referralBonusForReferrer,
        referralBonusForNewUser: DALAL_COIN_RULES.referralBonusForNewUser,
        firstPurchaseBonus: DALAL_COIN_RULES.firstPurchaseBonus,
        usage: {
          subscription: DALAL_COIN_RULES.usage.subscription,
          ecommerce: DALAL_COIN_RULES.usage.ecommerce,
        },
        cashback: {
          subscriptionPercent: DALAL_COIN_RULES.cashback.subscriptionPercent,
          ecommercePercent: DALAL_COIN_RULES.cashback.ecommercePercent,
        },
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/referrals', async (req, res, next) => {
  try {
    const referrals = await getDalalCoinReferrals(pool, req.user.id);
    return res.json(referrals);
  } catch (error) {
    return next(error);
  }
});

router.post('/quote', async (req, res, next) => {
  try {
    const payload = quoteSchema.parse(req.body || {});
    const quote = await getDalalCoinQuoteForUser(pool, req.user.id, {
      kind: payload.kind,
      baseAmount: payload.baseAmount,
      deliveryAmount: payload.deliveryAmount,
      requestedCoins: payload.requestedCoins,
    });
    return res.json({
      quote,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/preview', async (req, res, next) => {
  try {
    const payload = quoteSchema.parse(req.body || {});
    const quote = await getDalalCoinQuoteForUser(pool, req.user.id, {
      kind: payload.kind,
      baseAmount: payload.baseAmount,
      deliveryAmount: payload.deliveryAmount,
      requestedCoins: payload.requestedCoins,
    });
    const wallet = await getDalalCoinWallet(pool, req.user.id, {
      transactionLimit: 8,
    });

    return res.json({
      quote,
      wallet: wallet.wallet,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/checkout/property', async (_req, res) => {
  return res.status(410).json({
    error: 'Property Dalal Coin checkout is not part of the current MVP.',
  });
});

export default router;
