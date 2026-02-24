import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bookmark, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { AppView } from '@/lib/views';
import {
  SAVED_SEARCHES_CHANGED_EVENT,
  clearSavedSearches,
  readSavedSearches,
  removeSavedSearch,
  setPendingSavedSearch,
  type SavedSearch,
} from '@/lib/savedSearchStore';
import { addNotification } from '@/lib/notificationsStore';
import { trackFeatureUsage } from '@/lib/featureUsageApi';

interface SavedSearchesPageProps {
  onNavigate: (view: AppView) => void;
}

function formatDate(value: string): string {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SavedSearchesPage({ onNavigate }: SavedSearchesPageProps) {
  const [items, setItems] = useState<SavedSearch[]>(() => readSavedSearches());

  const sync = useCallback(() => {
    setItems(readSavedSearches());
  }, []);

  useEffect(() => {
    sync();

    const handleStorage = () => sync();
    const handleChanged = () => sync();

    window.addEventListener('storage', handleStorage);
    window.addEventListener(SAVED_SEARCHES_CHANGED_EVENT, handleChanged);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(SAVED_SEARCHES_CHANGED_EVENT, handleChanged);
    };
  }, [sync]);

  useEffect(() => {
    void trackFeatureUsage({
      featureKey: 'saved_searches_page_opened',
      context: 'saved_searches_page',
      view: 'saved-searches',
    });
  }, []);

  const countLabel = useMemo(() => `${items.length} saved`, [items.length]);

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container zdt-page-stack">
        <div className="zdt-panel-hero rounded-3xl border p-6 shadow-xl">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Saved Searches</p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Your Search Shortcuts</h1>
          <p className="mt-2 text-sm text-slate-600">
            Save search filters from Buy / Rent / Projects and re-apply them later.
          </p>
        </div>

        <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
              <Bookmark className="h-4 w-4 text-blue-700" />
              {countLabel}
            </div>
            <Button
              variant="outline"
              className="border-slate-300 text-red-700 hover:bg-red-50 hover:text-red-700"
              onClick={() => {
                clearSavedSearches();
                sync();
                toast.success('Saved searches cleared');
                addNotification({
                  title: 'Saved searches cleared',
                  kind: 'info',
                  source: 'search',
                });
              }}
              disabled={items.length === 0}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Clear All
            </Button>
          </div>

          {items.length === 0 ? (
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
              No saved searches yet. Open Buy or Rent pages and click Save Search.
            </div>
          ) : (
            <div className="mt-6 grid gap-3">
              {items.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        View: <span className="font-mono">{item.targetView}</span>
                        {item.createdAt ? ` | Saved: ${formatDate(item.createdAt)}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        className="h-9 rounded-xl bg-blue-700 text-xs text-white hover:bg-blue-800"
                        onClick={() => {
                          setPendingSavedSearch({
                            targetView: item.targetView,
                            criteria: item.criteria,
                            label: item.label,
                          });
                          void trackFeatureUsage({
                            featureKey: 'saved_search_applied',
                            context: 'saved_searches_page',
                            view: 'saved-searches',
                            detail: `target=${item.targetView}`,
                          });
                          toast.success('Search applied', { description: item.label });
                          addNotification({
                            title: 'Saved search applied',
                            message: item.label,
                            kind: 'success',
                            source: 'search',
                            metadata: { view: item.targetView },
                          });
                          onNavigate(item.targetView);
                        }}
                      >
                        <Search className="mr-2 h-4 w-4" />
                        Apply
                      </Button>
                      <Button
                        variant="outline"
                        className="h-9 rounded-xl border-slate-300 text-xs text-red-700 hover:bg-red-50 hover:text-red-700"
                        onClick={() => {
                          removeSavedSearch(item.id);
                          sync();
                          toast.success('Saved search deleted');
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </div>

                  <details className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                      View stored criteria
                    </summary>
                    <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-3 text-[11px] text-slate-700">
                      {JSON.stringify(item.criteria, null, 2)}
                    </pre>
                  </details>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
