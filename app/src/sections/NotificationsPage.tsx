import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bell, CheckCircle2, Info, Trash2, XOctagon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  NOTIFICATIONS_CHANGED_EVENT,
  clearNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  readNotifications,
  type NotificationItem,
} from '@/lib/notificationsStore';
import { trackFeatureUsage } from '@/lib/featureUsageApi';

function formatTimestamp(value: string): string {
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

function kindIcon(kind: NotificationItem['kind']) {
  if (kind === 'success') return CheckCircle2;
  if (kind === 'warning') return AlertTriangle;
  if (kind === 'error') return XOctagon;
  return Info;
}

function kindClasses(kind: NotificationItem['kind']): string {
  if (kind === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (kind === 'warning') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (kind === 'error') return 'border-red-200 bg-red-50 text-red-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>(() => readNotifications());

  const sync = useCallback(() => {
    setItems(readNotifications());
  }, []);

  useEffect(() => {
    sync();

    const handleStorage = () => sync();
    const handleChanged = () => sync();

    window.addEventListener('storage', handleStorage);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, handleChanged);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, handleChanged);
    };
  }, [sync]);

  useEffect(() => {
    void trackFeatureUsage({
      featureKey: 'notifications_page_opened',
      context: 'notifications_page',
      view: 'notifications',
    });
  }, []);

  const unreadCount = useMemo(() => items.filter((item) => !item.isRead).length, [items]);

  return (
    <section className="min-h-screen pb-16 pt-28 text-slate-900">
      <div className="page-container zdt-page-stack">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Notifications</p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Your Notification Center</h1>
          <p className="mt-2 text-sm text-slate-600">
            Track important actions like login events, saved searches, and visit requests.
          </p>
        </div>

        <div className="zdt-panel rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
              <Bell className="h-4 w-4 text-blue-700" />
              Unread: {unreadCount} | Total: {items.length}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                className="border-slate-300"
                onClick={() => {
                  markAllNotificationsRead();
                  sync();
                }}
                disabled={items.length === 0 || unreadCount === 0}
              >
                Mark All Read
              </Button>
              <Button
                variant="outline"
                className="border-slate-300 text-red-700 hover:bg-red-50 hover:text-red-700"
                onClick={() => {
                  clearNotifications();
                  sync();
                }}
                disabled={items.length === 0}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Clear All
              </Button>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
              No notifications yet.
            </div>
          ) : (
            <div className="mt-6 grid gap-3">
              {items.map((item) => {
                const Icon = kindIcon(item.kind);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md ${
                      item.isRead ? 'border-slate-200 bg-white' : 'border-blue-200 bg-blue-50/40'
                    }`}
                    onClick={() => {
                      if (!item.isRead) {
                        markNotificationRead(item.id);
                        sync();
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <span className={`mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl border ${kindClasses(item.kind)}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {item.title}
                            {!item.isRead ? (
                              <span className="ml-2 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-700">
                                New
                              </span>
                            ) : null}
                          </p>
                          {item.message ? (
                            <p className="mt-1 text-sm text-slate-600">{item.message}</p>
                          ) : null}
                          <p className="mt-2 text-xs text-slate-500">
                            {formatTimestamp(item.createdAt)}
                            {item.source ? ` | ${item.source}` : ''}
                          </p>
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${item.isRead ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>
                        {item.isRead ? 'Read' : 'Unread'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
