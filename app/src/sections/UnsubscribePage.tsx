import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { unsubscribeInfraSubscription } from '@/lib/infraSubscriptionsApi';

export default function UnsubscribePage() {
  const token = useMemo(() => {
    const params = new URLSearchParams(
      typeof window !== 'undefined' ? window.location.search : ''
    );
    return String(params.get('token') || '').trim();
  }, []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleUnsubscribe = async () => {
    setError('');
    setMessage('');

    if (!token) {
      setError('Missing token in URL.');
      return;
    }

    try {
      setLoading(true);
      await unsubscribeInfraSubscription(token);
      setMessage('You are unsubscribed. You will no longer receive infrastructure alerts.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not unsubscribe.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container zdt-page-stack">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold sm:text-3xl">Unsubscribe</h1>
          <p className="mt-2 text-sm text-slate-600">
            Stop receiving infrastructure alerts from ZDT Realty.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {!token ? (
            <p className="inline-flex items-center gap-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" />
              Missing token in URL.
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-600">Click below to confirm unsubscribe.</p>
              <Button
                type="button"
                disabled={loading}
                onClick={handleUnsubscribe}
                className="mt-4 h-11 rounded-xl bg-blue-700 px-5 text-white hover:bg-blue-800"
              >
                {loading ? 'Processing...' : 'Unsubscribe'}
              </Button>
            </>
          )}

          {error ? (
            <p className="mt-3 inline-flex items-center gap-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" />
              {error}
            </p>
          ) : null}

          {message ? (
            <p className="mt-3 inline-flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              {message}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
