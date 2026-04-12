import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { apiRequest } from '@/lib/http';
import {
  OwnerSubscriptionAccessContext,
  type OwnerSubscriptionAccessContextValue,
  type OwnerSubscriptionOverviewResponse,
} from './OwnerSubscriptionAccess';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to load subscription access.';
}

export function OwnerSubscriptionAccessProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [overview, setOverview] = useState<OwnerSubscriptionOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const overviewRef = useRef<OwnerSubscriptionOverviewResponse | null>(null);

  const refreshAccess = useCallback(async () => {
    const shouldShowLoading = !overviewRef.current;
    if (shouldShowLoading) {
      setLoading(true);
    }
    setError('');

    try {
      const response = await apiRequest<OwnerSubscriptionOverviewResponse>('/api/owner/subscription');
      overviewRef.current = response;
      setOverview(response);
      return response;
    } catch (loadError) {
      if (!overviewRef.current) {
        setOverview(null);
      }
      setError(getErrorMessage(loadError));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAccess();
  }, [refreshAccess]);

  const value = useMemo<OwnerSubscriptionAccessContextValue>(
    () => ({
      overview,
      currentSubscription: overview?.currentSubscription || null,
      usage: overview?.usage || null,
      plans: overview?.plans || [],
      access: overview?.access || null,
      loading,
      error,
      refreshAccess,
    }),
    [error, loading, overview, refreshAccess]
  );

  return (
    <OwnerSubscriptionAccessContext.Provider value={value}>
      {children}
    </OwnerSubscriptionAccessContext.Provider>
  );
}
