import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ExternalLink, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getInfraUpdateById, type InfraUpdateItem } from '@/lib/infrastructureApi';

interface AdminInfraPreviewPageProps {
  updateId?: string | number | null;
}

function formatEnumLabel(value: string): string {
  const normalized = String(value || '').toLowerCase().replace(/_/g, ' ').trim();
  return normalized ? `${normalized[0].toUpperCase()}${normalized.slice(1)}` : '-';
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toISOString().slice(0, 10);
}

function parseIdFromPathname(pathname: string): number | null {
  const match = /^\/admin\/infra\/preview\/([^/]+)$/.exec(pathname.trim().replace(/\/+$/, ''));
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export default function AdminInfraPreviewPage({ updateId }: AdminInfraPreviewPageProps) {
  const resolvedId = useMemo(() => {
    const direct = Number(updateId);
    if (Number.isInteger(direct) && direct > 0) return direct;
    if (typeof window === 'undefined') return null;
    return parseIdFromPathname(window.location.pathname);
  }, [updateId]);

  const [item, setItem] = useState<InfraUpdateItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!resolvedId) {
        setItem(null);
        setError('Invalid update id.');
        return;
      }

      try {
        setLoading(true);
        setError('');
        const response = await getInfraUpdateById(resolvedId);
        if (!active) return;
        setItem(response.item || null);
      } catch (requestError) {
        if (!active) return;
        setItem(null);
        setError(requestError instanceof Error ? requestError.message : 'Could not load update.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [resolvedId]);

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container zdt-page-stack">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold sm:text-3xl">Admin: Published Update Preview</h1>
          <p className="mt-2 text-sm text-slate-600">
            Verify all public details after publish.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {loading ? (
            <p className="inline-flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading update...
            </p>
          ) : null}

          {error ? (
            <p className="inline-flex items-center gap-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" />
              {error}
            </p>
          ) : null}

          {!loading && !error && item ? (
            <article className="grid gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-slate-900">{item.projectName}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    ID: {item.id} | {item.state} | {item.district}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{formatEnumLabel(item.category)}</Badge>
                  <Badge variant="outline">Impact: {formatEnumLabel(item.impactLevel)}</Badge>
                  <Badge variant="outline">
                    Verified: {formatEnumLabel(item.verificationLevel)}
                  </Badge>
                </div>
              </div>

              <p className="text-sm text-slate-700">
                <span className="font-semibold text-slate-900">Area:</span>{' '}
                {Array.isArray(item.cities) && item.cities.length > 0 ? item.cities.join(', ') : '-'}
              </p>
              <p className="text-sm text-slate-700">
                <span className="font-semibold text-slate-900">Authority:</span> {item.authority}
              </p>
              <p className="text-sm text-slate-700">
                <span className="font-semibold text-slate-900">Project Type:</span> {item.projectType}
              </p>
              <p className="text-sm text-slate-700">
                <span className="font-semibold text-slate-900">Status:</span> {item.statusText}
              </p>
              <p className="text-sm text-slate-700">
                <span className="font-semibold text-slate-900">Source Ref:</span> {item.sourceRef}
              </p>
              <p className="text-sm text-slate-700">
                <span className="font-semibold text-slate-900">Last Updated:</span>{' '}
                {formatDate(item.lastUpdated)}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-xl px-4"
                  onClick={() => {
                    window.location.href = '/admin/infra/inbox';
                  }}
                >
                  Back to Inbox
                </Button>
                {item.sourceUrl ? (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 underline"
                  >
                    View official source
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
              </div>
            </article>
          ) : null}
        </div>
      </div>
    </section>
  );
}
