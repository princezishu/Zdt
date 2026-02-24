import { trackFeatureUsage } from './featureUsageApi';

export type NotificationKind = 'info' | 'success' | 'warning' | 'error';

export interface NotificationItem {
  id: string;
  createdAt: string;
  title: string;
  message: string;
  kind: NotificationKind;
  isRead: boolean;
  source: string;
  metadata: Record<string, string>;
  isTemporary: boolean;
  autoDeleteOnRead: boolean;
  expiresAt: string | null;
}

const NOTIFICATIONS_KEY = 'zdt_notifications';
const MAX_NOTIFICATIONS = 200;
export const NOTIFICATIONS_CHANGED_EVENT = 'zdt:notifications-changed';

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function normalizeString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function normalizeKind(value: unknown): NotificationKind {
  if (value === 'success' || value === 'warning' || value === 'error') return value;
  return 'info';
}

function sanitizeMetadata(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const source = value as Record<string, unknown>;
  const output: Record<string, string> = {};
  Object.entries(source).forEach(([key, raw]) => {
    const k = normalizeString(key);
    if (!k) return;
    const v = normalizeString(raw);
    if (!v) return;
    output[k.slice(0, 64)] = v.slice(0, 240);
  });
  return output;
}

function normalizeExpiresAt(value: unknown): string | null {
  const text = normalizeString(value);
  if (!text) return null;
  const dt = new Date(text);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function sanitizeItem(raw: unknown): NotificationItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const id = normalizeString(source.id);
  const title = normalizeString(source.title);
  if (!id || !title) return null;

  const createdAt = normalizeString(source.createdAt) || new Date().toISOString();

  return {
    id,
    createdAt,
    title: title.slice(0, 160),
    message: normalizeString(source.message).slice(0, 600),
    kind: normalizeKind(source.kind),
    isRead: source.isRead === true,
    source: normalizeString(source.source).slice(0, 40),
    metadata: sanitizeMetadata(source.metadata),
    isTemporary: source.isTemporary === true,
    autoDeleteOnRead: source.autoDeleteOnRead === true,
    expiresAt: normalizeExpiresAt(source.expiresAt),
  };
}

function normalizeNotificationList(items: NotificationItem[]): NotificationItem[] {
  const now = Date.now();
  return items
    .filter((item) => {
      if (item.expiresAt) {
        const expiresAtMs = new Date(item.expiresAt).getTime();
        if (!Number.isNaN(expiresAtMs) && expiresAtMs <= now) {
          return false;
        }
      }
      if (item.autoDeleteOnRead && item.isRead) {
        return false;
      }
      return true;
    })
    .slice(0, MAX_NOTIFICATIONS);
}

function emitNotificationsChanged(items: NotificationItem[]) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(NOTIFICATIONS_CHANGED_EVENT, {
      detail: {
        count: items.length,
        unread: items.filter((item) => !item.isRead).length,
      },
    })
  );
}

function writeNotifications(items: NotificationItem[]) {
  if (!canUseStorage()) return;
  const next = normalizeNotificationList(items);
  window.localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(next));
  emitNotificationsChanged(next);
}

export function readNotifications(): NotificationItem[] {
  if (!canUseStorage()) return [];

  const raw = window.localStorage.getItem(NOTIFICATIONS_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const next = parsed
      .map((item) => sanitizeItem(item))
      .filter((item): item is NotificationItem => Boolean(item))
      .slice(0, MAX_NOTIFICATIONS);

    const normalized = normalizeNotificationList(next);
    if (normalized.length !== next.length) {
      writeNotifications(normalized);
    }
    return normalized;
  } catch {
    return [];
  }
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      // Ignore.
    }
  }
  return `notif-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`;
}

export function addNotification(input: {
  title: string;
  message?: string;
  kind?: NotificationKind;
  source?: string;
  metadata?: Record<string, string>;
  isTemporary?: boolean;
  autoDeleteOnRead?: boolean;
  expiresAt?: string;
}): NotificationItem[] {
  const title = normalizeString(input.title);
  if (!title) return readNotifications();

  const message = normalizeString(input.message);
  const kind = normalizeKind(input.kind);
  const source = normalizeString(input.source);
  const metadata = sanitizeMetadata(input.metadata);
  const isTemporary = input.isTemporary === true;
  const autoDeleteOnRead = input.autoDeleteOnRead === true;
  const expiresAt = normalizeExpiresAt(input.expiresAt);

  const nextItem: NotificationItem = {
    id: generateId(),
    createdAt: new Date().toISOString(),
    title: title.slice(0, 160),
    message: message.slice(0, 600),
    kind,
    isRead: false,
    source: source.slice(0, 40),
    metadata,
    isTemporary,
    autoDeleteOnRead,
    expiresAt,
  };

  const existing = readNotifications();
  const next = [nextItem, ...existing].slice(0, MAX_NOTIFICATIONS);
  writeNotifications(next);
  return next;
}

export function markNotificationRead(id: string): NotificationItem[] {
  const key = normalizeString(id);
  if (!key) return readNotifications();
  const existing = readNotifications();
  const next = existing
    .map((item) => (item.id === key ? { ...item, isRead: true } : item))
    .filter((item) => !(item.id === key && item.autoDeleteOnRead));
  writeNotifications(next);
  void trackFeatureUsage({
    featureKey: 'notification_marked_read',
    context: 'notifications_store',
    view: 'notifications',
    detail: `id=${key}`,
  });
  return next;
}

export function markAllNotificationsRead(): NotificationItem[] {
  const existing = readNotifications();
  const next = existing
    .map((item) => (item.isRead ? item : { ...item, isRead: true }))
    .filter((item) => !item.autoDeleteOnRead);
  writeNotifications(next);
  void trackFeatureUsage({
    featureKey: 'notifications_mark_all_read',
    context: 'notifications_store',
    view: 'notifications',
    detail: `count=${existing.length}`,
  });
  return next;
}

export function clearNotifications() {
  if (!canUseStorage()) return;
  const existingCount = readNotifications().length;
  window.localStorage.removeItem(NOTIFICATIONS_KEY);
  emitNotificationsChanged([]);
  void trackFeatureUsage({
    featureKey: 'notifications_cleared',
    context: 'notifications_store',
    view: 'notifications',
    detail: `count=${existingCount}`,
  });
}

export function getUnreadNotificationCount(): number {
  return readNotifications().filter((item) => !item.isRead).length;
}
