import { Router } from 'express';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { fetchWithRetry } from '../utils/fetchWithRetry.js';

const router = Router();

const NSE_REALTY_INDEX_URL =
  'https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%20REALTY';
const NSE_QUOTE_URL_BASE = 'https://www.nseindia.com/get-quotes/equity?symbol=';
const CACHE_TTL_MS = 90 * 1000;
const MAX_LIMIT = 10;

const liveSignalsLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 80,
  message: 'Too many live stock-signal requests. Please retry shortly.',
});

const requestHeaders = {
  Accept: 'application/json,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.nseindia.com/',
  Origin: 'https://www.nseindia.com',
};

let cacheEntry = {
  expireAt: 0,
  payload: null,
};

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toPositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function mapRowToSignal(row) {
  const symbol = String(row?.symbol || '').trim().toUpperCase();
  const companyName = String(row?.meta?.companyName || row?.symbol || '').trim();
  const tradedValue = toNumber(row?.totalTradedValue);
  const tradedVolume = toNumber(row?.totalTradedVolume);
  const lastPrice = toNumber(row?.lastPrice);
  const pChange = toNumber(row?.pChange);
  const orderBookCr = Number((tradedValue / 10_000_000).toFixed(2));
  const safeSymbol = encodeURIComponent(symbol);
  const moveText =
    pChange === 0
      ? 'flat'
      : pChange > 0
        ? `up ${pChange.toFixed(2)}%`
        : `down ${Math.abs(pChange).toFixed(2)}%`;

  return {
    id: `nse-${symbol.toLowerCase()}`,
    companyName: companyName || symbol,
    symbol,
    orderBookCr,
    projectCount: 0,
    thesis: `Live order-book activity proxy from NSE traded value. Stock is ${moveText} with volume ${Math.round(
      tradedVolume
    ).toLocaleString('en-IN')}.`,
    sourceLabel: 'Live: NSE NIFTY Realty index traded-value feed',
    sourceUrl: `${NSE_QUOTE_URL_BASE}${safeSymbol}`,
    mode: 'auto',
    marketPrice: Number(lastPrice.toFixed(2)),
    percentChange: Number(pChange.toFixed(2)),
    tradedValueCr: orderBookCr,
    tradedVolume: Math.round(tradedVolume),
  };
}

async function loadLiveRealtySignals() {
  const response = await fetchWithRetry(NSE_REALTY_INDEX_URL, {
    method: 'GET',
    retries: 1,
    timeoutMs: 15000,
    headers: requestHeaders,
  });
  const payload = await response.json().catch(() => ({}));
  const rows = Array.isArray(payload?.data) ? payload.data : [];

  const mapped = rows
    .filter((row) => String(row?.symbol || '').trim().toUpperCase() !== 'NIFTY REALTY')
    .map((row) => mapRowToSignal(row))
    .filter((row) => row.companyName && row.orderBookCr > 0)
    .sort((left, right) => {
      if (right.orderBookCr !== left.orderBookCr) {
        return right.orderBookCr - left.orderBookCr;
      }
      return right.tradedVolume - left.tradedVolume;
    });

  const timestamp = String(payload?.timestamp || '').trim();
  return {
    asOf: timestamp || new Date().toISOString(),
    signals: mapped,
  };
}

router.get('/invest/realty-stock-signals', liveSignalsLimiter, async (req, res, next) => {
  try {
    const limit = Math.min(MAX_LIMIT, toPositiveInteger(req.query.limit, MAX_LIMIT));
    const now = Date.now();

    if (cacheEntry.payload && cacheEntry.expireAt > now) {
      return res.json({
        ...cacheEntry.payload,
        signals: cacheEntry.payload.signals.slice(0, limit),
        stale: false,
      });
    }

    try {
      const live = await loadLiveRealtySignals();
      const payload = {
        asOf: live.asOf,
        source: 'NSE NIFTY REALTY',
        stale: false,
        signals: live.signals.slice(0, MAX_LIMIT),
      };
      cacheEntry = {
        expireAt: now + CACHE_TTL_MS,
        payload,
      };
      return res.json({
        ...payload,
        signals: payload.signals.slice(0, limit),
      });
    } catch (loadError) {
      if (cacheEntry.payload) {
        return res.json({
          ...cacheEntry.payload,
          signals: cacheEntry.payload.signals.slice(0, limit),
          stale: true,
          staleReason:
            loadError instanceof Error
              ? loadError.message
              : 'Live source fetch failed. Serving cached signals.',
        });
      }
      return res.status(502).json({
        error: loadError instanceof Error ? loadError.message : 'Unable to load live stock signals.',
      });
    }
  } catch (error) {
    return next(error);
  }
});

export default router;

