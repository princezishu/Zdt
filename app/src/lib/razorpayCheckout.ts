export interface RazorpayCheckoutPayload {
  provider: 'razorpay' | string;
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
}

export interface RazorpayCheckoutSuccessPayload {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

type RazorpayFailurePayload = {
  error?: {
    description?: string;
    reason?: string;
    source?: string;
    step?: string;
  };
};

interface RazorpayInstance {
  open: () => void;
  on?: (eventName: string, handler: (payload: RazorpayFailurePayload) => void) => void;
}

interface RazorpayConstructor {
  new (options: Record<string, unknown>): RazorpayInstance;
}

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

export class RazorpayCheckoutCancelledError extends Error {
  code = 'checkout_cancelled';

  constructor(message = 'Payment checkout was cancelled.') {
    super(message);
    this.name = 'RazorpayCheckoutCancelledError';
  }
}

let razorpayScriptPromise: Promise<void> | null = null;

function loadRazorpayScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Razorpay checkout is only available in the browser.'));
  }

  if (window.Razorpay) {
    return Promise.resolve();
  }

  if (razorpayScriptPromise) {
    return razorpayScriptPromise;
  }

  razorpayScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-razorpay-checkout="true"]'
    );

    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener(
        'error',
        () => reject(new Error('Unable to load Razorpay checkout.')),
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.defer = true;
    script.dataset.razorpayCheckout = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Unable to load Razorpay checkout.'));
    document.head.appendChild(script);
  });

  return razorpayScriptPromise;
}

export async function openRazorpayCheckout(
  checkout: RazorpayCheckoutPayload
): Promise<RazorpayCheckoutSuccessPayload> {
  await loadRazorpayScript();

  if (!window.Razorpay) {
    throw new Error('Razorpay checkout is unavailable.');
  }

  const RazorpayConstructor = window.Razorpay;

  return new Promise<RazorpayCheckoutSuccessPayload>((resolve, reject) => {
    let settled = false;

    const settleResolve = (payload: RazorpayCheckoutSuccessPayload) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };

    const settleReject = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const instance = new RazorpayConstructor({
      key: checkout.keyId,
      order_id: checkout.orderId,
      amount: checkout.amount,
      currency: checkout.currency,
      name: checkout.name,
      description: checkout.description || '',
      prefill: {
        name: checkout.prefill?.name || '',
        email: checkout.prefill?.email || '',
        contact: checkout.prefill?.contact || '',
      },
      notes: checkout.notes || {},
      handler: (payload: RazorpayCheckoutSuccessPayload) => {
        settleResolve(payload);
      },
      modal: {
        ondismiss: () => {
          settleReject(new RazorpayCheckoutCancelledError());
        },
      },
    });

    instance.on?.('payment.failed', (payload: RazorpayFailurePayload) => {
      const message =
        payload?.error?.description
        || payload?.error?.reason
        || 'Payment failed. Please try again.';
      settleReject(new Error(message));
    });

    instance.open();
  });
}
