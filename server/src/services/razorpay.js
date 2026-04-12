import crypto from 'crypto';

function readConfigValue(name) {
  return String(process.env[name] || '').trim();
}

export function getRazorpayConfig() {
  const keyId = readConfigValue('RAZORPAY_KEY_ID');
  const keySecret = readConfigValue('RAZORPAY_KEY_SECRET');
  const webhookSecret = readConfigValue('RAZORPAY_WEBHOOK_SECRET');

  return {
    keyId,
    keySecret,
    webhookSecret,
    enabled: Boolean(keyId && keySecret),
    webhookEnabled: Boolean(keyId && keySecret && webhookSecret),
  };
}

export function assertRazorpayConfigured() {
  const config = getRazorpayConfig();
  if (!config.enabled) {
    const error = new Error('Razorpay checkout is not configured on the server.');
    error.status = 503;
    error.code = 'billing_provider_unavailable';
    throw error;
  }
  return config;
}

function buildBasicAuthHeader(keyId, keySecret) {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
}

function toRazorpayAmount(amountInRupees) {
  const normalized = Number(amountInRupees || 0);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return 0;
  }
  return Math.round(normalized * 100);
}

async function callRazorpay(path, { method = 'GET', body } = {}) {
  const config = assertRazorpayConfigured();
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: buildBasicAuthHeader(config.keyId, config.keySecret),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && payload !== null && 'error' in payload
        ? String(payload.error?.description || payload.error?.reason || payload.error?.code || 'Razorpay request failed.')
        : 'Razorpay request failed.';
    const error = new Error(message);
    error.status = response.status;
    error.code = 'billing_provider_error';
    error.payload = payload;
    throw error;
  }

  return payload;
}

export async function createRazorpayOrder({
  amountInRupees,
  currency = 'INR',
  receipt,
  notes = {},
}) {
  const amount = toRazorpayAmount(amountInRupees);
  if (!amount) {
    const error = new Error('Paid checkout amount must be greater than zero.');
    error.status = 400;
    error.code = 'billing_amount_invalid';
    throw error;
  }

  return callRazorpay('/orders', {
    method: 'POST',
    body: {
      amount,
      currency,
      receipt,
      notes,
    },
  });
}

export function verifyRazorpayCheckoutSignature({
  orderId,
  paymentId,
  signature,
}) {
  const config = assertRazorpayConfigured();
  const expectedSignature = crypto
    .createHmac('sha256', config.keySecret)
    .update(`${String(orderId || '').trim()}|${String(paymentId || '').trim()}`)
    .digest('hex');

  const actualSignature = String(signature || '').trim();
  if (!actualSignature || actualSignature.length !== expectedSignature.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(actualSignature)
  );
}

export function verifyRazorpayWebhookSignature(rawBodyBuffer, signature) {
  const config = getRazorpayConfig();
  if (!config.webhookEnabled) {
    const error = new Error('Razorpay webhook secret is not configured.');
    error.status = 503;
    error.code = 'billing_provider_unavailable';
    throw error;
  }

  const payloadBuffer = Buffer.isBuffer(rawBodyBuffer)
    ? rawBodyBuffer
    : Buffer.from(String(rawBodyBuffer || ''), 'utf8');
  const expectedSignature = crypto
    .createHmac('sha256', config.webhookSecret)
    .update(payloadBuffer)
    .digest('hex');

  const actualSignature = String(signature || '').trim();
  if (!actualSignature || actualSignature.length !== expectedSignature.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(actualSignature)
  );
}

export function buildRazorpayCheckoutPayload({
  orderId,
  amountInRupees,
  currency = 'INR',
  description,
  name = 'ZDT Realty',
  prefill = {},
  notes = {},
}) {
  const config = assertRazorpayConfigured();

  return {
    provider: 'razorpay',
    keyId: config.keyId,
    orderId,
    amount: toRazorpayAmount(amountInRupees),
    currency,
    name,
    description,
    prefill: {
      name: String(prefill.name || '').trim(),
      email: String(prefill.email || '').trim(),
      contact: String(prefill.contact || '').trim(),
    },
    notes,
  };
}

export function normalizeRazorpayStatus(eventType, payload = {}) {
  const type = String(eventType || '').trim().toLowerCase();
  const paymentStatus = String(payload.payment?.entity?.status || '').trim().toLowerCase();

  if (type === 'payment.failed') return 'failed';
  if (type === 'payment.authorized' || paymentStatus === 'authorized') return 'authorized';
  if (type === 'payment.captured' || type === 'order.paid' || paymentStatus === 'captured') {
    return 'paid';
  }
  if (paymentStatus === 'failed') return 'failed';
  return 'created';
}

export function toRupeeAmountFromProviderValue(value) {
  const normalized = Number(value || 0);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return 0;
  }
  return Math.round(normalized) / 100;
}
