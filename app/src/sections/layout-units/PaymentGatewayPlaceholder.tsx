export default function PaymentGatewayPlaceholder() {
  return (
    <div className="rounded-2xl border border-dashed border-emerald-300 bg-emerald-50 p-4">
      <p className="text-sm font-semibold text-emerald-900">Payment Gateway (Future)</p>
      <p className="mt-1 text-xs text-emerald-800">
        Placeholder for Razorpay/Stripe integration for booking and token payments.
      </p>
      {/* TODO: Add payment intent and gateway webhook integration here. */}
    </div>
  );
}
