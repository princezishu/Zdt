import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, QrCode, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createSupportContribution, getSupportProgramConfig } from '@/lib/supportProgramApi';

const MIN_CONTRIBUTION_AMOUNT = 10;
const DEFAULT_UPI_QR_URL = '/images/support-upi-qr.png';
const FALLBACK_UPI_QR_URL = '/images/upi-support-qr-placeholder.svg';

function formatDateLabel(input: string): string {
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function EarlySupportersPage() {
  const [name, setName] = useState('');
  const [amountInput, setAmountInput] = useState(String(MIN_CONTRIBUTION_AMOUNT));
  const [message, setMessage] = useState('');
  const [upiReference, setUpiReference] = useState('');
  const [consentToRecord, setConsentToRecord] = useState(false);
  const [consentToAcknowledge, setConsentToAcknowledge] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [runtimeQrCodeUrl, setRuntimeQrCodeUrl] = useState('');

  const configuredQrCodeUrl = useMemo(() => {
    return String(import.meta.env.VITE_SUPPORT_UPI_QR_URL || '').trim();
  }, []);
  const qrCodeUrl = runtimeQrCodeUrl || configuredQrCodeUrl || DEFAULT_UPI_QR_URL;

  useEffect(() => {
    let isActive = true;

    const loadSupportConfig = async () => {
      try {
        const response = await getSupportProgramConfig();
        if (!isActive) return;
        const resolvedUrl = String(response?.upiQrUrl || '').trim();
        setRuntimeQrCodeUrl(resolvedUrl);
      } catch {
        if (!isActive) return;
        setRuntimeQrCodeUrl('');
      }
    };

    void loadSupportConfig();
    return () => {
      isActive = false;
    };
  }, []);

  const parsedAmount = Number(amountInput);
  const amountError =
    !amountInput.trim() || Number.isNaN(parsedAmount) || parsedAmount < MIN_CONTRIBUTION_AMOUNT
      ? `Amount must be at least Rs ${MIN_CONTRIBUTION_AMOUNT}.`
      : '';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (amountError) {
      setErrorMessage(amountError);
      return;
    }

    if (!upiReference.trim()) {
      setErrorMessage('UPI reference is required to record the contribution.');
      return;
    }

    if (!consentToRecord) {
      setErrorMessage('Please confirm consent to record your support contribution.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await createSupportContribution({
        name: name.trim(),
        amount: parsedAmount,
        message: message.trim(),
        upiReference: upiReference.trim(),
        consentToRecord: true,
        consentToAcknowledge,
      });

      const recordedOn = formatDateLabel(response.contribution.createdAt);
      setSuccessMessage(
        recordedOn
          ? `Support contribution recorded on ${recordedOn}.`
          : 'Support contribution recorded successfully.'
      );
      setName('');
      setAmountInput(String(MIN_CONTRIBUTION_AMOUNT));
      setMessage('');
      setUpiReference('');
      setConsentToRecord(false);
      setConsentToAcknowledge(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to record contribution right now.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container space-y-5">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
            Early Supporters Program
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">
            Voluntary Support Contribution
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            This section is for one-time voluntary support from people who believe in the ZDT
            Realty vision.
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Section Description</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">
              <p>
                ZDT Realty is currently in its early development and pre-revenue stage. We welcome
                voluntary support from individuals who believe in our vision of building a
                transparent, compliant, and technology-driven real estate platform.
              </p>
              <p>
                Support contributions can start from as low as &#8377;10. All supporter names and
                contribution amounts will be securely recorded with the supporter&apos;s consent.
              </p>
              <p>
                Contributions made at this stage are not investments, do not represent equity, and
                do not carry any guaranteed returns.
              </p>
              <p>
                As the platform evolves into a revenue-generating company, early supporters may be
                considered for future recognition or benefits, subject to legal compliance and
                formal agreements.
              </p>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">
                Voluntary Support Contribution
              </p>
              <p className="mt-1 text-xs text-slate-600">
                This is a one-time voluntary contribution. No auto-debit or recurring payments.
              </p>
              <div className="mt-4 flex justify-center rounded-xl border border-slate-200 bg-white p-3">
                <img
                  src={qrCodeUrl}
                  alt="Voluntary Support Contribution UPI QR"
                  className="h-56 w-56 rounded-lg border border-slate-200 object-cover"
                  onError={(event) => {
                    if (event.currentTarget.src.endsWith(DEFAULT_UPI_QR_URL)) {
                      event.currentTarget.src = FALLBACK_UPI_QR_URL;
                      return;
                    }
                    if (event.currentTarget.src.endsWith(FALLBACK_UPI_QR_URL)) {
                      return;
                    }
                    event.currentTarget.src = DEFAULT_UPI_QR_URL;
                  }}
                />
              </div>
              <p className="mt-3 flex items-start gap-2 text-xs text-slate-600">
                <QrCode className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-700" />
                Scan the QR using any UPI app, complete the transfer, then submit the UPI reference
                in the form.
              </p>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Support Submission</h2>
            <p className="mt-1 text-sm text-slate-600">
              Name and message are optional. Amount must be at least &#8377;10.
            </p>

            <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
              <label className="block space-y-1">
                <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                  Name (optional)
                </span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={120}
                  placeholder="Your name"
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                  Amount (&#8377;10 minimum)
                </span>
                <input
                  value={amountInput}
                  onChange={(event) => {
                    const onlyDigits = event.target.value.replace(/[^\d]/g, '');
                    setAmountInput(onlyDigits);
                  }}
                  inputMode="numeric"
                  min={MIN_CONTRIBUTION_AMOUNT}
                  placeholder="10"
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                  UPI Reference
                </span>
                <input
                  value={upiReference}
                  onChange={(event) => setUpiReference(event.target.value)}
                  maxLength={80}
                  placeholder="Enter UPI transaction reference"
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                  Message (optional)
                </span>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  maxLength={2000}
                  rows={3}
                  placeholder="Optional message"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
                />
              </label>

              <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={consentToRecord}
                  onChange={(event) => setConsentToRecord(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-700"
                />
                I consent to securely record my contribution details.
              </label>

              <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={consentToAcknowledge}
                  onChange={(event) => setConsentToAcknowledge(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-700"
                />
                I agree to receive acknowledgement updates from ZDT Realty.
              </label>

              {errorMessage ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {errorMessage}
                </p>
              ) : null}

              {successMessage ? (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {successMessage}
                </p>
              ) : null}

              <Button
                type="submit"
                disabled={isSubmitting}
                className="h-11 w-full rounded-xl bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-70"
              >
                {isSubmitting ? 'Recording...' : 'Record Support Contribution'}
              </Button>
            </form>
          </article>
        </div>

        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <p className="flex items-start gap-2 text-sm font-medium text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            ZDT Realty does not accept public investments, deposits, or guaranteed-return schemes
            at this stage. All contributions are voluntary support only.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
            <p className="flex items-start gap-2 font-medium text-slate-900">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-blue-700" />
              Internal Record Keeping
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Name, amount, date, and UPI reference are recorded internally after consent for
              transparency and audit tracking.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
            <p className="flex items-start gap-2 font-medium text-slate-900">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
              One-Time Flow
            </p>
            <p className="mt-1 text-xs text-slate-600">
              This flow uses only UPI QR support transfer and does not include subscription or
              auto-renewal behavior.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
