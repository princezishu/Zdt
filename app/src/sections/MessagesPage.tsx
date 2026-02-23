import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCheck,
  MessageCircleMore,
  Paperclip,
  Pin,
  Search,
  SendHorizonal,
  ShieldAlert,
  Star,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { API_BASE_URL } from '@/lib/api';
import { apiRequest } from '@/lib/http';
import type { AuthUser } from '@/lib/session';
import { io, type Socket } from 'socket.io-client';

type ConversationType = 'team_support' | 'property_owner' | 'builder_company';
type ConversationStatus = 'Open' | 'Closed';
type SenderRole = 'user' | 'team_member' | 'admin' | 'owner' | 'system';
type InboxTab = 'all' | 'unread' | 'starred';
type MessageReceipt = 'sent' | 'delivered' | 'read';

interface PersistedConversationMeta {
  unread?: boolean;
  pinned?: boolean;
  starred?: boolean;
  blocked?: boolean;
}

interface ConversationMeta {
  unread: boolean;
  pinned: boolean;
  starred: boolean;
  blocked: boolean;
  muted: boolean;
}

interface ConversationSummary {
  id: number;
  type: ConversationType;
  status: ConversationStatus;
  subject: string;
  propertyReference: string | null;
  propertyTitle: string | null;
  ownerName: string | null;
  requesterUserId: number;
  requesterName: string;
  ownerUserId: number | null;
  lastMessagePreview: string;
  lastMessageAt: string | null;
  metadata?: PersistedConversationMeta;
  createdAt: string;
  updatedAt: string;
}

interface ChatMessage {
  id: number;
  conversationId: number;
  senderUserId: number | null;
  senderRole: SenderRole;
  senderName: string;
  body: string;
  createdAt: string;
  isMine: boolean;
}

interface RealtimeChatMessage {
  id: number;
  conversationId: number;
  senderUserId: number | null;
  senderRole: SenderRole;
  senderName: string;
  body: string;
  createdAt: string;
}

interface RealtimeMessageEvent {
  conversationId: number;
  messages: RealtimeChatMessage[];
  at: string;
}

interface RealtimeTypingEvent {
  conversationId: number;
  userId: number;
  userName: string;
  isTyping: boolean;
  at: string;
}

interface RealtimeReadEvent {
  conversationId: number;
  userId: number;
  userName: string;
  lastReadMessageId: number | null;
  at: string;
}

interface RealtimeDeliveredEvent {
  conversationId: number;
  userId: number;
  userName: string;
  lastDeliveredMessageId: number | null;
  at: string;
}

interface RealtimePresenceEvent {
  conversationId: number;
  userId: number;
  userName: string;
  isOnline: boolean;
  lastSeenAt: string | null;
  at: string;
}

interface PersistedReceiptState {
  userId: number | null;
  userName: string;
  lastDeliveredMessageId: number | null;
  lastReadMessageId: number | null;
  deliveredAt: string | null;
  readAt: string | null;
}

interface MessagesPageProps {
  token: string;
  user: AuthUser | null;
  initialPropertyReference?: string;
  initialCompanyId?: number | null;
  initialOpenTeamChat?: boolean;
  onConsumeInitialPropertyReference?: () => void;
  onConsumeInitialCompanyId?: () => void;
  onConsumeInitialOpenTeamChat?: () => void;
}

interface TimelineDivider {
  kind: 'divider';
  key: string;
  label: string;
}

interface TimelineMessage {
  kind: 'message';
  key: string;
  message: ChatMessage;
}

type TimelineItem = TimelineDivider | TimelineMessage;

const STORAGE_KEY = 'zdt:messages:whatsapp-meta:v1';
const TAB_ITEMS: Array<{ value: InboxTab; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'starred', label: 'Starred' },
];

function normalizeSenderRole(rawRole: string | null | undefined): SenderRole {
  if (rawRole === 'team_member' || rawRole === 'admin' || rawRole === 'owner' || rawRole === 'system') {
    return rawRole;
  }
  return 'user';
}

function n(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase();
}

function defaultMeta(): ConversationMeta {
  return {
    unread: false,
    pinned: false,
    starred: false,
    blocked: false,
    muted: false,
  };
}

function readPersistedMeta(value: unknown): PersistedConversationMeta {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const out: PersistedConversationMeta = {};
  if (typeof record.unread === 'boolean') out.unread = record.unread;
  if (typeof record.pinned === 'boolean') out.pinned = record.pinned;
  if (typeof record.starred === 'boolean') out.starred = record.starred;
  if (typeof record.blocked === 'boolean') out.blocked = record.blocked;
  return out;
}

function loadMetaStore(): Record<string, ConversationMeta> {
  if (typeof window === 'undefined') return {};
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const output: Record<string, ConversationMeta> = {};
    Object.entries(parsed).forEach(([key, value]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      const record = value as Record<string, unknown>;
      output[key] = {
        unread: Boolean(record.unread),
        pinned: Boolean(record.pinned),
        starred: Boolean(record.starred),
        blocked: Boolean(record.blocked),
        muted: Boolean(record.muted),
      };
    });
    return output;
  } catch {
    return {};
  }
}

function fmtClock(value: string | null): string {
  if (!value) return '--:--';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '--:--';
  return dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function fmtListTime(value: string | null): string {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  const now = new Date();
  const sameDay = dt.toDateString() === now.toDateString();
  if (sameDay) {
    return dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function fmtDateDivider(value: string): string {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return 'Unknown day';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  const diffDays = Math.round((today.getTime() - target.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function conversationTypeLabel(type: ConversationType): string {
  if (type === 'property_owner') return 'Owner Chat';
  if (type === 'builder_company') return 'Builder Chat';
  return 'Team Chat';
}

function conversationSubtitle(conversation: ConversationSummary): string {
  if (conversation.propertyTitle && conversation.propertyReference) {
    return `${conversation.propertyTitle} | ${conversation.propertyReference}`;
  }
  return (
    conversation.propertyTitle ||
    conversation.propertyReference ||
    conversation.ownerName ||
    conversation.subject ||
    'General conversation'
  );
}

function conversationDisplayName(
  conversation: ConversationSummary,
  currentUserId: number | null | undefined
): string {
  const viewerId = Number(currentUserId || 0);
  const requesterId = Number(conversation.requesterUserId || 0);
  const ownerId = Number(conversation.ownerUserId || 0);
  const requesterName = (conversation.requesterName || '').trim();
  const ownerName = (conversation.ownerName || '').trim();

  if (viewerId > 0) {
    if (viewerId === requesterId && ownerName) return ownerName;
    if (viewerId === ownerId && requesterName) return requesterName;
  }

  if (conversation.type === 'team_support') return 'Support Team';
  return ownerName || requesterName || 'User';
}

function conversationPresence(
  conversation: ConversationSummary,
  meta: ConversationMeta,
  presence: { isOnline: boolean; lastSeenAt: string | null } | null
): string {
  if (meta.blocked) return 'Blocked';
  if (conversation.status === 'Closed') return 'Conversation closed';

  if (presence?.isOnline) return 'Online';
  if (presence?.lastSeenAt) {
    const dt = new Date(presence.lastSeenAt);
    if (!Number.isNaN(dt.getTime())) {
      const diffMinutes = Math.floor((Date.now() - dt.getTime()) / 60000);
      if (diffMinutes <= 1) return 'Last seen just now';
      if (diffMinutes < 60) return `Last seen ${diffMinutes}m ago`;
      return `Last seen ${fmtListTime(presence.lastSeenAt)}`;
    }
  }

  const stamp = conversation.lastMessageAt || conversation.updatedAt;
  if (!stamp) return 'Start chatting';
  const dt = new Date(stamp);
  if (Number.isNaN(dt.getTime())) return 'Start chatting';
  const diffMinutes = Math.floor((Date.now() - dt.getTime()) / 60000);
  if (diffMinutes <= 2) return 'Online';
  if (diffMinutes < 60) return `Last seen ${diffMinutes}m ago`;
  return `Last seen ${fmtListTime(stamp)}`;
}

function messageSenderLabel(message: ChatMessage): string {
  if (message.isMine) return 'You';
  const name = (message.senderName || '').trim();
  if (name) return name;
  if (message.senderRole === 'system') return 'System';
  if (message.senderRole === 'owner') return 'Owner';
  if (message.senderRole === 'admin' || message.senderRole === 'team_member') return 'Support Team';
  return 'User';
}

export default function MessagesPage({
  token,
  user,
  initialPropertyReference,
  initialCompanyId,
  initialOpenTeamChat,
  onConsumeInitialPropertyReference,
  onConsumeInitialCompanyId,
  onConsumeInitialOpenTeamChat,
}: MessagesPageProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [metaStore, setMetaStore] = useState<Record<string, ConversationMeta>>(() => loadMetaStore());

  const [tab, setTab] = useState<InboxTab>('all');
  const [search, setSearch] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [sendAsOwner, setSendAsOwner] = useState(false);

  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [socketConnected, setSocketConnected] = useState(false);
  const [typingByConversation, setTypingByConversation] = useState<Record<number, { userName: string; at: string }>>({});
  const [deliveredByConversation, setDeliveredByConversation] = useState<
    Record<number, { lastDeliveredMessageId: number | null; at: string; userName: string }>
  >({});
  const [readByConversation, setReadByConversation] = useState<
    Record<number, { lastReadMessageId: number | null; at: string; userName: string }>
  >({});
  const [presenceByConversation, setPresenceByConversation] = useState<
    Record<number, { userId: number; userName: string; isOnline: boolean; lastSeenAt: string | null; at: string }>
  >({});

  const stampRef = useRef<Record<number, string>>({});
  const preferredConversationIdRef = useRef<number | null>(null);
  const preferredConversationUntilRef = useRef<number>(0);
  const messagesScrollerRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const joinedConversationIdsRef = useRef<Set<number>>(new Set());
  const joinRetryTimersRef = useRef<Record<number, number>>({});
  const typingDebounceRef = useRef<number | null>(null);
  const previousTypingConversationRef = useRef<number | null>(null);
  const temporaryMessageIdRef = useRef<number>(-1);

  const rows = useMemo(
    () =>
      conversations.map((conversation) => {
        const localMeta = metaStore[String(conversation.id)] || defaultMeta();
        const serverMeta = readPersistedMeta(conversation.metadata);
        const meta: ConversationMeta = {
          ...defaultMeta(),
          ...localMeta,
          ...serverMeta,
          muted: localMeta.muted,
        };
        return { conversation, meta };
      }),
    [conversations, metaStore]
  );

  const activeRow = useMemo(
    () => rows.find((row) => row.conversation.id === activeConversationId) || null,
    [activeConversationId, rows]
  );
  const activeConversation = activeRow?.conversation || null;
  const activeMeta = activeRow?.meta || null;
  const activeTypingState = activeConversationId ? typingByConversation[activeConversationId] : null;
  const activePresenceState = activeConversationId ? presenceByConversation[activeConversationId] : null;
  const activeConversationDisplayName = activeConversation
    ? conversationDisplayName(activeConversation, user?.id)
    : 'User';

  const unreadCount = useMemo(() => rows.filter((row) => row.meta.unread).length, [rows]);

  const filteredRows = useMemo(() => {
    const q = n(search);
    return rows
      .filter(({ conversation, meta }) => {
        if (tab === 'unread' && !meta.unread) return false;
        if (tab === 'starred' && !meta.starred) return false;
        if (!q) return true;
        const haystack = [
          conversation.requesterName,
          conversation.ownerName || '',
          conversation.subject,
          conversation.lastMessagePreview,
          conversation.propertyReference || '',
          conversation.propertyTitle || '',
          conversationTypeLabel(conversation.type),
          meta.blocked ? 'blocked spam' : '',
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => {
        if (a.meta.pinned !== b.meta.pinned) return a.meta.pinned ? -1 : 1;
        if (a.meta.unread !== b.meta.unread) return a.meta.unread ? -1 : 1;
        const aStamp = a.conversation.lastMessageAt || a.conversation.updatedAt || '';
        const bStamp = b.conversation.lastMessageAt || b.conversation.updatedAt || '';
        return bStamp.localeCompare(aStamp);
      });
  }, [rows, search, tab]);

  const messageReceipts = useMemo<Record<number, MessageReceipt>>(() => {
    const result: Record<number, MessageReceipt> = {};
    messages.forEach((item) => {
      if (!item.isMine) return;
      result[item.id] = 'sent';
    });

    let incomingSeenAfter = false;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const item = messages[index];
      if (!item.isMine) {
        incomingSeenAfter = true;
        continue;
      }
      if (incomingSeenAfter) {
        result[item.id] = 'read';
      }
    }

    if (activeConversationId) {
      const deliveredState = deliveredByConversation[activeConversationId];
      if (deliveredState) {
        messages.forEach((item) => {
          if (!item.isMine) return;
          if (result[item.id] === 'read') return;
          if (
            deliveredState.lastDeliveredMessageId === null ||
            item.id <= deliveredState.lastDeliveredMessageId
          ) {
            result[item.id] = 'delivered';
          }
        });
      }

      const readState = readByConversation[activeConversationId];
      if (readState) {
        messages.forEach((item) => {
          if (!item.isMine) return;
          if (readState.lastReadMessageId === null || item.id <= readState.lastReadMessageId) {
            result[item.id] = 'read';
          }
        });
      }
    }

    return result;
  }, [activeConversationId, deliveredByConversation, messages, readByConversation]);

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    let previousDivider = '';
    messages.forEach((message) => {
      const label = fmtDateDivider(message.createdAt);
      if (label !== previousDivider) {
        items.push({
          kind: 'divider',
          key: `divider-${message.id}`,
          label,
        });
        previousDivider = label;
      }
      items.push({
        kind: 'message',
        key: `message-${message.id}`,
        message,
      });
    });
    return items;
  }, [messages]);

  const updateLocalMeta = useCallback(
    (conversationId: number, updater: (current: ConversationMeta) => ConversationMeta) => {
      setMetaStore((previous) => {
        const key = String(conversationId);
        const current = previous[key] || defaultMeta();
        return { ...previous, [key]: updater(current) };
      });
    },
    []
  );

  const appendRealtimeMessages = useCallback(
    (conversationId: number, incomingMessages: RealtimeChatMessage[]) => {
      if (!Array.isArray(incomingMessages) || incomingMessages.length === 0) return;

      const mapped: ChatMessage[] = incomingMessages
        .filter((item) => Number(item?.id) > 0)
        .map((item) => ({
          id: Number(item.id),
          conversationId: Number(item.conversationId || conversationId),
          senderUserId: item.senderUserId === null ? null : Number(item.senderUserId),
          senderRole: item.senderRole,
          senderName: item.senderName || 'User',
          body: item.body || '',
          createdAt: item.createdAt,
          isMine:
            item.senderUserId !== null &&
            Number(item.senderUserId) > 0 &&
            Number(item.senderUserId) === Number(user?.id),
        }));
      if (mapped.length === 0) return;
      const hasIncomingFromOtherUser = mapped.some((item) => !item.isMine);

      const latest = mapped[mapped.length - 1];
      setConversations((previous) =>
        previous.map((item) =>
          item.id === conversationId
            ? {
                ...item,
                status: 'Open',
                lastMessagePreview: latest.body.slice(0, 240),
                lastMessageAt: latest.createdAt,
                updatedAt: latest.createdAt,
              }
            : item
        )
      );

      if (activeConversationId === conversationId) {
        setMessages((previous) => {
          const dedupe = new Map<number, ChatMessage>();
          previous.forEach((item) => dedupe.set(item.id, item));
          mapped.forEach((item) => dedupe.set(item.id, item));
          return Array.from(dedupe.values()).sort((a, b) => {
            const timeCompare = String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
            if (timeCompare !== 0) return timeCompare;
            return a.id - b.id;
          });
        });
      } else {
        updateLocalMeta(conversationId, (meta) => ({ ...meta, unread: true }));
      }

      if (hasIncomingFromOtherUser) {
        setTypingByConversation((previous) => {
          if (!previous[conversationId]) return previous;
          const next = { ...previous };
          delete next[conversationId];
          return next;
        });

        const lastIncomingMessage = [...mapped].reverse().find((item) => !item.isMine);
        const socket = socketRef.current;
        if (lastIncomingMessage && socket?.connected) {
          socket.emit('chat:delivered', {
            conversationId,
            lastDeliveredMessageId: lastIncomingMessage.id,
          });
        }
      }
    },
    [activeConversationId, updateLocalMeta, user?.id]
  );

  const patchConversationMeta = useCallback(
    async (conversationId: number, patchInput: Partial<ConversationMeta>): Promise<boolean> => {
      if (!token) return false;
      const patch: PersistedConversationMeta = {};
      if (typeof patchInput.unread === 'boolean') patch.unread = patchInput.unread;
      if (typeof patchInput.pinned === 'boolean') patch.pinned = patchInput.pinned;
      if (typeof patchInput.starred === 'boolean') patch.starred = patchInput.starred;
      if (typeof patchInput.blocked === 'boolean') patch.blocked = patchInput.blocked;

      if (Object.keys(patch).length === 0) return true;

      try {
        const resp = await apiRequest<{ conversation: ConversationSummary }>(
          `/chat/conversations/${conversationId}/meta`,
          { method: 'PATCH', body: JSON.stringify(patch) },
          token
        );
        setConversations((previous) =>
          previous.map((item) => (item.id === resp.conversation.id ? resp.conversation : item))
        );
        const serverMeta = readPersistedMeta(resp.conversation.metadata);
        setMetaStore((previous) => {
          const key = String(conversationId);
          const current = previous[key] || defaultMeta();
          return {
            ...previous,
            [key]: {
              ...current,
              ...serverMeta,
            },
          };
        });
        setError('');
        return true;
      } catch (patchError) {
        setError(patchError instanceof Error ? patchError.message : 'Unable to update conversation metadata');
        return false;
      }
    },
    [token]
  );

  const rememberPreferredConversation = useCallback((conversationId: number) => {
    preferredConversationIdRef.current = conversationId;
    preferredConversationUntilRef.current = Date.now() + 15_000;
  }, []);

  const loadConversations = useCallback(async () => {
    if (!token) return;
    setLoadingConversations(true);
    try {
      const resp = await apiRequest<{ conversations: ConversationSummary[] }>('/chat/conversations', {}, token);
      const items = resp.conversations || [];
      const nextStamp: Record<number, string> = {};

      setMetaStore((previous) => {
        let changed = false;
        const next = { ...previous };

        items.forEach((item) => {
          const key = String(item.id);
          const incomingStamp = item.lastMessageAt || item.updatedAt || '';
          nextStamp[item.id] = incomingStamp;

          const existing = next[key] || defaultMeta();
          const serverMeta = readPersistedMeta(item.metadata);
          let mergedMeta: ConversationMeta = {
            ...defaultMeta(),
            ...existing,
            ...serverMeta,
            muted: existing.muted,
          };

          const previousStamp = stampRef.current[item.id] || '';
          if (
            previousStamp &&
            previousStamp !== incomingStamp &&
            item.id !== activeConversationId &&
            !mergedMeta.unread
          ) {
            mergedMeta = { ...mergedMeta, unread: true };
          }

          if (
            !next[key] ||
            mergedMeta.unread !== existing.unread ||
            mergedMeta.pinned !== existing.pinned ||
            mergedMeta.starred !== existing.starred ||
            mergedMeta.blocked !== existing.blocked ||
            mergedMeta.muted !== existing.muted
          ) {
            next[key] = mergedMeta;
            changed = true;
          }
        });

        return changed ? next : previous;
      });

      stampRef.current = nextStamp;
      setConversations(items);

      if (items.length === 0) {
        setActiveConversationId(null);
      } else {
        const preferredId = preferredConversationIdRef.current;
        const preferredIsUsable =
          preferredId !== null &&
          Date.now() < preferredConversationUntilRef.current &&
          items.some((item) => item.id === preferredId);
        if (preferredIsUsable && preferredId !== null) {
          setActiveConversationId(preferredId);
          preferredConversationIdRef.current = null;
          preferredConversationUntilRef.current = 0;
        } else if (!items.some((item) => item.id === activeConversationId)) {
          setActiveConversationId(items[0].id);
        }
      }

      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load conversations');
    } finally {
      setLoadingConversations(false);
    }
  }, [activeConversationId, token]);

  const loadMessages = useCallback(
    async (conversationId: number) => {
      if (!token) return;
      setLoadingMessages(true);
      try {
        const resp = await apiRequest<{ messages: ChatMessage[]; receipt?: PersistedReceiptState | null }>(
          `/chat/conversations/${conversationId}/messages`,
          {},
          token
        );
        setMessages(resp.messages || []);

        const receipt = resp.receipt || null;
        const normalizedReadMessageId =
          receipt && Number.isFinite(Number(receipt.lastReadMessageId)) && Number(receipt.lastReadMessageId) > 0
            ? Number(receipt.lastReadMessageId)
            : null;
        const normalizedDeliveredMessageId =
          receipt &&
          Number.isFinite(Number(receipt.lastDeliveredMessageId)) &&
          Number(receipt.lastDeliveredMessageId) > 0
            ? Number(receipt.lastDeliveredMessageId)
            : null;
        const derivedDeliveredMessageId =
          normalizedReadMessageId !== null
            ? Math.max(normalizedDeliveredMessageId || 0, normalizedReadMessageId)
            : normalizedDeliveredMessageId;

        if (derivedDeliveredMessageId !== null) {
          setDeliveredByConversation((previous) => ({
            ...previous,
            [conversationId]: {
              lastDeliveredMessageId: derivedDeliveredMessageId,
              at: receipt?.deliveredAt || receipt?.readAt || new Date().toISOString(),
              userName: receipt?.userName || 'User',
            },
          }));
        } else {
          setDeliveredByConversation((previous) => {
            if (!previous[conversationId]) return previous;
            const next = { ...previous };
            delete next[conversationId];
            return next;
          });
        }

        if (normalizedReadMessageId !== null) {
          setReadByConversation((previous) => ({
            ...previous,
            [conversationId]: {
              lastReadMessageId: normalizedReadMessageId,
              at: receipt?.readAt || new Date().toISOString(),
              userName: receipt?.userName || 'User',
            },
          }));
        } else {
          setReadByConversation((previous) => {
            if (!previous[conversationId]) return previous;
            const next = { ...previous };
            delete next[conversationId];
            return next;
          });
        }

        setError('');
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load messages');
      } finally {
        setLoadingMessages(false);
      }
    },
    [token]
  );

  const openTeamConversation = useCallback(async () => {
    if (!token) return;
    setSending(true);
    try {
      const resp = await apiRequest<{ conversation: ConversationSummary }>(
        '/chat/conversations/team',
        { method: 'POST', body: JSON.stringify({}) },
        token
      );
      const created = resp.conversation;
      setConversations((previous) => [created, ...previous.filter((item) => item.id !== created.id)]);
      rememberPreferredConversation(created.id);
      setActiveConversationId(created.id);
      setInfo('Team chat opened.');
      setError('');
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Unable to open team chat');
    } finally {
      setSending(false);
    }
  }, [rememberPreferredConversation, token]);

  const openOwnerConversation = useCallback(
    async (referenceArg?: string) => {
      if (!token) return;
      const reference = (referenceArg || '').trim();
      if (!reference) {
        setError('Enter property reference ID.');
        return;
      }
      setSending(true);
      try {
        const resp = await apiRequest<{ conversation: ConversationSummary }>(
          '/chat/conversations/owner',
          { method: 'POST', body: JSON.stringify({ propertyReference: reference }) },
          token
        );
        const created = resp.conversation;
        setConversations((previous) => [created, ...previous.filter((item) => item.id !== created.id)]);
        rememberPreferredConversation(created.id);
        setActiveConversationId(created.id);
        setInfo(`Owner chat opened for ${created.propertyReference || reference}.`);
        setError('');
      } catch (openError) {
        setError(openError instanceof Error ? openError.message : 'Unable to open owner chat');
      } finally {
        setSending(false);
      }
    },
    [rememberPreferredConversation, token]
  );

  const openCompanyConversation = useCallback(
    async (companyIdArg?: number) => {
      if (!token) return;
      const candidateId = Number(companyIdArg);
      if (!Number.isInteger(candidateId) || candidateId <= 0) {
        setError('Enter a valid company ID.');
        return;
      }
      setSending(true);
      try {
        const resp = await apiRequest<{ conversation: ConversationSummary }>(
          '/chat/conversations/company',
          { method: 'POST', body: JSON.stringify({ companyId: candidateId }) },
          token
        );
        const created = resp.conversation;
        setConversations((previous) => [created, ...previous.filter((item) => item.id !== created.id)]);
        rememberPreferredConversation(created.id);
        setActiveConversationId(created.id);
        setInfo(`Builder chat opened for ${created.ownerName || 'company'}.`);
        setError('');
      } catch (openError) {
        setError(openError instanceof Error ? openError.message : 'Unable to open builder chat');
      } finally {
        setSending(false);
      }
    },
    [rememberPreferredConversation, token]
  );

  const sendMessage = useCallback(async () => {
    if (!token || !activeConversationId || !activeConversation || !activeMeta) return;
    if (activeConversation.status === 'Closed') {
      setInfo('Conversation is closed. Reopen to send a message.');
      return;
    }
    if (activeMeta.blocked) {
      setInfo('This conversation is blocked. Unblock before sending.');
      return;
    }

    const body = messageInput.trim();
    if (!body && attachments.length === 0) return;

    const attachmentBlock =
      attachments.length > 0 ? attachments.map((file) => `[Attachment] ${file.name}`).join('\n') : '';
    const fullBody = [body, attachmentBlock].filter(Boolean).join('\n\n');
    const optimisticMessageId = temporaryMessageIdRef.current;
    temporaryMessageIdRef.current -= 1;

    const optimisticSenderRole: SenderRole =
      (user?.role === 'admin' || user?.role === 'team_member') &&
      activeConversation.type === 'property_owner' &&
      sendAsOwner
        ? 'owner'
        : normalizeSenderRole(user?.role);

    const optimisticMessage: ChatMessage = {
      id: optimisticMessageId,
      conversationId: activeConversationId,
      senderUserId: Number(user?.id || 0) > 0 ? Number(user?.id) : null,
      senderRole: optimisticSenderRole,
      senderName:
        optimisticSenderRole === 'owner'
          ? activeConversation.ownerName || 'Owner Desk'
          : (user?.name || 'You'),
      body: fullBody,
      createdAt: new Date().toISOString(),
      isMine: true,
    };

    const draftText = messageInput;
    const draftAttachments = attachments;

    setMessages((previous) => {
      const dedupe = new Map<number, ChatMessage>();
      previous.forEach((item) => dedupe.set(item.id, item));
      dedupe.set(optimisticMessage.id, optimisticMessage);
      return Array.from(dedupe.values()).sort((a, b) => {
        const timeCompare = String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
        if (timeCompare !== 0) return timeCompare;
        return a.id - b.id;
      });
    });
    updateLocalMeta(activeConversationId, (current) => ({ ...current, unread: false }));
    setMessageInput('');
    setAttachments([]);
    if (typingDebounceRef.current) {
      window.clearTimeout(typingDebounceRef.current);
      typingDebounceRef.current = null;
    }
    socketRef.current?.emit('chat:typing', { conversationId: activeConversationId, isTyping: false });
    setError('');

    setSending(true);
    try {
      const resp = await apiRequest<{ message: ChatMessage; autoReply?: ChatMessage | null }>(
        `/chat/conversations/${activeConversationId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            body: fullBody,
            sendAsOwner:
              (user?.role === 'admin' || user?.role === 'team_member') && activeConversation.type === 'property_owner'
                ? sendAsOwner
                : false,
          }),
        },
        token
      );

      const appended = resp.autoReply ? [resp.message, resp.autoReply] : [resp.message];
      const latest = appended[appended.length - 1];

      setMessages((previous) => {
        const dedupe = new Map<number, ChatMessage>();
        previous
          .filter((item) => item.id !== optimisticMessageId)
          .forEach((item) => dedupe.set(item.id, item));
        appended.forEach((item) => dedupe.set(item.id, item));
        return Array.from(dedupe.values()).sort((a, b) => {
          const timeCompare = String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
          if (timeCompare !== 0) return timeCompare;
          return a.id - b.id;
        });
      });
      setConversations((previous) =>
        previous.map((item) =>
          item.id === activeConversationId
            ? {
                ...item,
                status: 'Open',
                lastMessagePreview: latest.body.slice(0, 240),
                lastMessageAt: latest.createdAt,
                updatedAt: latest.createdAt,
              }
            : item
        )
      );
      setInfo(resp.autoReply ? 'Message sent. Auto reply delivered.' : 'Message sent.');
    } catch (sendError) {
      setMessages((previous) => previous.filter((item) => item.id !== optimisticMessageId));
      setMessageInput(draftText);
      setAttachments(draftAttachments);
      setError(sendError instanceof Error ? sendError.message : 'Unable to send message');
    } finally {
      setSending(false);
    }
  }, [
    activeConversation,
    activeConversationId,
    activeMeta,
    attachments,
    messageInput,
    sendAsOwner,
    token,
    updateLocalMeta,
    user?.id,
    user?.name,
    user?.role,
  ]);

  const selectConversation = useCallback(
    (conversationId: number) => {
      setActiveConversationId(conversationId);
      const current = metaStore[String(conversationId)] || defaultMeta();
      if (!current.unread) return;
      updateLocalMeta(conversationId, (meta) => ({ ...meta, unread: false }));
      void patchConversationMeta(conversationId, { unread: false });
    },
    [metaStore, patchConversationMeta, updateLocalMeta]
  );

  const togglePinned = useCallback(async () => {
    if (!activeConversationId || !activeMeta) return;
    const nextPinned = !activeMeta.pinned;
    updateLocalMeta(activeConversationId, (meta) => ({ ...meta, pinned: nextPinned }));
    const ok = await patchConversationMeta(activeConversationId, { pinned: nextPinned });
    if (ok) {
      setInfo(nextPinned ? 'Conversation pinned.' : 'Conversation unpinned.');
    }
  }, [activeConversationId, activeMeta, patchConversationMeta, updateLocalMeta]);

  const toggleStarred = useCallback(async () => {
    if (!activeConversationId || !activeMeta) return;
    const nextStarred = !activeMeta.starred;
    updateLocalMeta(activeConversationId, (meta) => ({ ...meta, starred: nextStarred }));
    const ok = await patchConversationMeta(activeConversationId, { starred: nextStarred });
    if (ok) {
      setInfo(nextStarred ? 'Conversation starred.' : 'Conversation unstarred.');
    }
  }, [activeConversationId, activeMeta, patchConversationMeta, updateLocalMeta]);

  const toggleBlocked = useCallback(async () => {
    if (!activeConversationId || !activeMeta) return;
    const nextBlocked = !activeMeta.blocked;
    updateLocalMeta(activeConversationId, (meta) => ({ ...meta, blocked: nextBlocked, unread: false }));
    const ok = await patchConversationMeta(activeConversationId, { blocked: nextBlocked, unread: false });
    if (ok) {
      setInfo(nextBlocked ? 'Conversation blocked.' : 'Conversation unblocked.');
    }
  }, [activeConversationId, activeMeta, patchConversationMeta, updateLocalMeta]);

  const markUnread = useCallback(async () => {
    if (!activeConversationId) return;
    updateLocalMeta(activeConversationId, (meta) => ({ ...meta, unread: true }));
    const ok = await patchConversationMeta(activeConversationId, { unread: true });
    if (ok) {
      setInfo('Conversation marked unread.');
    }
  }, [activeConversationId, patchConversationMeta, updateLocalMeta]);

  const toggleMuted = useCallback(() => {
    if (!activeConversationId) return;
    updateLocalMeta(activeConversationId, (meta) => ({ ...meta, muted: !meta.muted }));
  }, [activeConversationId, updateLocalMeta]);

  const onComposerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'Enter' || event.shiftKey) return;
      event.preventDefault();
      void sendMessage();
    },
    [sendMessage]
  );

  useEffect(() => {
    if (!token || !user) return;

    const socket = io(API_BASE_URL, {
      auth: { token },
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 400,
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    const handleConnect = () => {
      setSocketConnected(true);
    };
    const handleDisconnect = () => {
      setSocketConnected(false);
      joinedConversationIdsRef.current.clear();
      Object.values(joinRetryTimersRef.current).forEach((timerId) => window.clearTimeout(timerId));
      joinRetryTimersRef.current = {};
      setTypingByConversation({});
      setPresenceByConversation({});
    };
    const handleRealtimeMessage = (event: RealtimeMessageEvent) => {
      const conversationId = Number(event?.conversationId);
      if (!Number.isFinite(conversationId) || conversationId <= 0) return;
      appendRealtimeMessages(conversationId, event?.messages || []);
    };
    const handleTyping = (event: RealtimeTypingEvent) => {
      const conversationId = Number(event?.conversationId);
      if (!Number.isFinite(conversationId) || conversationId <= 0) return;
      if (Number(event.userId) === Number(user.id)) return;
      if (event.isTyping) {
        setTypingByConversation((previous) => ({
          ...previous,
          [conversationId]: {
            userName: event.userName || 'User',
            at: event.at || new Date().toISOString(),
          },
        }));
        return;
      }
      setTypingByConversation((previous) => {
        const next = { ...previous };
        delete next[conversationId];
        return next;
      });
    };
    const handleRead = (event: RealtimeReadEvent) => {
      const conversationId = Number(event?.conversationId);
      if (!Number.isFinite(conversationId) || conversationId <= 0) return;
      if (Number(event.userId) === Number(user.id)) return;
      setReadByConversation((previous) => ({
        ...previous,
        [conversationId]: {
          lastReadMessageId:
            Number.isFinite(Number(event.lastReadMessageId)) && Number(event.lastReadMessageId) > 0
              ? Number(event.lastReadMessageId)
              : null,
          at: event.at || new Date().toISOString(),
          userName: event.userName || 'User',
        },
      }));
    };
    const handleDelivered = (event: RealtimeDeliveredEvent) => {
      const conversationId = Number(event?.conversationId);
      if (!Number.isFinite(conversationId) || conversationId <= 0) return;
      if (Number(event.userId) === Number(user.id)) return;
      setDeliveredByConversation((previous) => ({
        ...previous,
        [conversationId]: {
          lastDeliveredMessageId:
            Number.isFinite(Number(event.lastDeliveredMessageId)) && Number(event.lastDeliveredMessageId) > 0
              ? Number(event.lastDeliveredMessageId)
              : null,
          at: event.at || new Date().toISOString(),
          userName: event.userName || 'User',
        },
      }));
    };
    const handlePresence = (event: RealtimePresenceEvent) => {
      const conversationId = Number(event?.conversationId);
      if (!Number.isFinite(conversationId) || conversationId <= 0) return;
      const presenceUserId = Number(event?.userId);
      if (!Number.isFinite(presenceUserId) || presenceUserId <= 0) return;
      if (presenceUserId === Number(user.id)) return;

      setPresenceByConversation((previous) => ({
        ...previous,
        [conversationId]: {
          userId: presenceUserId,
          userName: event.userName || 'User',
          isOnline: Boolean(event.isOnline),
          lastSeenAt: event.isOnline ? null : (event.lastSeenAt || null),
          at: event.at || new Date().toISOString(),
        },
      }));
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('chat:message', handleRealtimeMessage);
    socket.on('chat:typing', handleTyping);
    socket.on('chat:read', handleRead);
    socket.on('chat:delivered', handleDelivered);
    socket.on('chat:presence', handlePresence);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('chat:message', handleRealtimeMessage);
      socket.off('chat:typing', handleTyping);
      socket.off('chat:read', handleRead);
      socket.off('chat:delivered', handleDelivered);
      socket.off('chat:presence', handlePresence);
      socket.disconnect();
      socketRef.current = null;
      joinedConversationIdsRef.current.clear();
      Object.values(joinRetryTimersRef.current).forEach((timerId) => window.clearTimeout(timerId));
      joinRetryTimersRef.current = {};
      setSocketConnected(false);
    };
  }, [token, user, appendRealtimeMessages]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !socketConnected) return;

    const nextIds = new Set(conversations.map((item) => Number(item.id)).filter((id) => Number.isFinite(id) && id > 0));
    const joinedIds = joinedConversationIdsRef.current;
    const joinRetryTimers = joinRetryTimersRef.current;

    const clearJoinRetryTimer = (conversationId: number) => {
      const timerId = joinRetryTimers[conversationId];
      if (!timerId) return;
      window.clearTimeout(timerId);
      delete joinRetryTimers[conversationId];
    };

    const joinConversationWithRetry = (conversationId: number, attempt: number) => {
      if (joinedIds.has(conversationId)) {
        clearJoinRetryTimer(conversationId);
        return;
      }

      socket.emit('chat:join', { conversationId }, (ack: { ok?: boolean; conversationId?: number }) => {
        if (ack?.ok) {
          clearJoinRetryTimer(conversationId);
          joinedIds.add(conversationId);
          return;
        }

        if (attempt >= 3) {
          clearJoinRetryTimer(conversationId);
          return;
        }

        clearJoinRetryTimer(conversationId);
        joinRetryTimers[conversationId] = window.setTimeout(() => {
          delete joinRetryTimers[conversationId];
          if (!socketRef.current?.connected) return;
          joinConversationWithRetry(conversationId, attempt + 1);
        }, 450 * (attempt + 1));
      });
    };

    Array.from(joinedIds).forEach((conversationId) => {
      if (nextIds.has(conversationId)) return;
      socket.emit('chat:leave', { conversationId });
      joinedIds.delete(conversationId);
      clearJoinRetryTimer(conversationId);
    });

    nextIds.forEach((conversationId) => {
      if (joinedIds.has(conversationId)) return;
      joinConversationWithRetry(conversationId, 0);
    });
  }, [conversations, socketConnected]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !socketConnected || !activeConversationId) return;
    const lastIncomingMessage = [...messages].reverse().find((item) => !item.isMine);
    if (!lastIncomingMessage) return;
    socket.emit('chat:read', {
      conversationId: activeConversationId,
      lastReadMessageId: lastIncomingMessage.id,
    });
  }, [activeConversationId, messages, socketConnected]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !socketConnected) return;

    const previousConversationId = previousTypingConversationRef.current;
    if (
      previousConversationId &&
      previousConversationId !== activeConversationId &&
      Number.isFinite(previousConversationId)
    ) {
      socket.emit('chat:typing', { conversationId: previousConversationId, isTyping: false });
    }

    if (!activeConversationId) {
      previousTypingConversationRef.current = null;
      return;
    }

    previousTypingConversationRef.current = activeConversationId;
    const isTyping = messageInput.trim().length > 0;
    socket.emit('chat:typing', { conversationId: activeConversationId, isTyping });

    if (typingDebounceRef.current) {
      window.clearTimeout(typingDebounceRef.current);
      typingDebounceRef.current = null;
    }

    if (isTyping) {
      typingDebounceRef.current = window.setTimeout(() => {
        socket.emit('chat:typing', { conversationId: activeConversationId, isTyping: false });
      }, 1200);
    }

    return () => {
      if (typingDebounceRef.current) {
        window.clearTimeout(typingDebounceRef.current);
        typingDebounceRef.current = null;
      }
    };
  }, [activeConversationId, messageInput, socketConnected]);

  useEffect(() => {
    if (!token || !user) return;
    void loadConversations();
  }, [loadConversations, token, user]);

  useEffect(() => {
    if (!activeConversationId || !token) {
      setMessages([]);
      return;
    }
    void loadMessages(activeConversationId);
  }, [activeConversationId, loadMessages, token]);

  useEffect(() => {
    if (!activeConversationId) return;
    const current = metaStore[String(activeConversationId)] || defaultMeta();
    if (!current.unread) return;
    updateLocalMeta(activeConversationId, (meta) => ({ ...meta, unread: false }));
    void patchConversationMeta(activeConversationId, { unread: false });
  }, [activeConversationId, metaStore, patchConversationMeta, updateLocalMeta]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(metaStore));
  }, [metaStore]);

  useEffect(() => {
    if (!token) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void loadConversations();
      if (activeConversationId) {
        void loadMessages(activeConversationId);
      }
    }, 20000);
    return () => window.clearInterval(interval);
  }, [activeConversationId, loadConversations, loadMessages, token]);

  useEffect(() => {
    if (!token || !user || !initialPropertyReference) return;
    void openOwnerConversation(initialPropertyReference);
    onConsumeInitialPropertyReference?.();
  }, [
    initialPropertyReference,
    onConsumeInitialPropertyReference,
    openOwnerConversation,
    token,
    user,
  ]);

  useEffect(() => {
    if (!token || !user || !initialCompanyId || initialCompanyId <= 0) return;
    void openCompanyConversation(initialCompanyId);
    onConsumeInitialCompanyId?.();
  }, [initialCompanyId, onConsumeInitialCompanyId, openCompanyConversation, token, user]);

  useEffect(() => {
    if (!token || !user || !initialOpenTeamChat) return;
    void openTeamConversation();
    onConsumeInitialOpenTeamChat?.();
  }, [initialOpenTeamChat, onConsumeInitialOpenTeamChat, openTeamConversation, token, user]);

  useEffect(() => {
    const scroller = messagesScrollerRef.current;
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, [messages, sending]);

  if (!user) {
    return (
      <section className="min-h-screen pb-16 pt-28">
        <div className="page-container rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
          Login required to access messenger.
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-screen overflow-x-hidden pb-10 pt-24 text-slate-900">
      <div className="page-container space-y-3">
        <div className="rounded-3xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-cyan-50 p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">Messaging</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">Messages</h1>
            <Badge variant="outline" className="border-emerald-200 bg-white text-emerald-700">
              {unreadCount} unread
            </Badge>
          </div>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {info && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {info}
          </div>
        )}

        <div className="grid min-w-0 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="grid gap-2">
              <Button
                onClick={() => void openTeamConversation()}
                disabled={sending}
                className="h-10 justify-start bg-emerald-700 text-white hover:bg-emerald-800"
              >
                <Users className="mr-1.5 h-4 w-4" />
                New Team Chat
              </Button>
            </div>

            <div className="mt-3 space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search chats"
                  className="h-10 bg-white pl-9"
                />
              </div>

              <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
                {TAB_ITEMS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setTab(item.value)}
                    className={`h-8 rounded-lg text-xs font-medium transition ${
                      tab === item.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 max-h-[68vh] space-y-1.5 overflow-y-auto pr-1">
              {loadingConversations &&
                Array.from({ length: 7 }).map((_, index) => <Skeleton key={`chat-skeleton-${index}`} className="h-20 bg-slate-200" />)}
              {!loadingConversations && filteredRows.length === 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  No conversations found.
                </div>
              )}

              {!loadingConversations &&
                filteredRows.map(({ conversation, meta }) => {
                  const stamp = conversation.lastMessageAt || conversation.updatedAt;
                  const displayName = conversationDisplayName(conversation, user?.id);
                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => selectConversation(conversation.id)}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        activeConversationId === conversation.id
                          ? 'border-emerald-300 bg-emerald-50'
                          : 'border-slate-200 bg-white hover:border-emerald-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-200 to-cyan-200 text-sm font-semibold text-emerald-900">
                          {(displayName || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
                            <span className="text-[11px] text-slate-500">{fmtListTime(stamp)}</span>
                          </div>
                          <p className="truncate text-[11px] text-slate-500">{conversationTypeLabel(conversation.type)}</p>
                          <p className="mt-0.5 truncate text-xs text-slate-700">
                            {conversation.lastMessagePreview || 'No messages yet.'}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {meta.pinned && (
                              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-600">
                                <Pin className="mr-1 h-3 w-3" />
                                Pinned
                              </span>
                            )}
                            {meta.starred && (
                              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
                                <Star className="mr-1 h-3 w-3" />
                                Starred
                              </span>
                            )}
                            {meta.blocked && (
                              <span className="rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] text-red-700">
                                Blocked
                              </span>
                            )}
                            {conversation.status === 'Closed' && (
                              <span className="rounded-full border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                                Closed
                              </span>
                            )}
                            {meta.unread && (
                              <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                New
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
            </div>
          </aside>

          <section className="min-w-0 flex min-h-[72vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {!activeConversation || !activeMeta ? (
              <div className="flex min-h-[72vh] flex-col items-center justify-center gap-2 p-6 text-center">
                <MessageCircleMore className="h-12 w-12 text-slate-300" />
                <p className="text-sm text-slate-600">Select a chat to start messaging.</p>
              </div>
            ) : (
              <>
                <div className="border-b border-slate-200 bg-white px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-200 to-cyan-200 text-sm font-semibold text-emerald-900">
                        {(activeConversationDisplayName || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h2 className="truncate text-lg font-semibold text-slate-900">{activeConversationDisplayName}</h2>
                        <p className="truncate text-xs text-slate-500">
                          {activeTypingState
                            ? `${activeTypingState.userName} is typing...`
                            : conversationPresence(activeConversation, activeMeta, activePresenceState)}
                        </p>
                        <p className="truncate text-[11px] text-slate-500">{conversationSubtitle(activeConversation)}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <Button variant="outline" size="sm" className="h-8" onClick={() => void markUnread()}>
                        Mark unread
                      </Button>
                      <Button variant="outline" size="sm" className="h-8" onClick={() => void togglePinned()}>
                        {activeMeta.pinned ? 'Unpin' : 'Pin'}
                      </Button>
                      <Button variant="outline" size="sm" className="h-8" onClick={() => void toggleStarred()}>
                        {activeMeta.starred ? 'Unstar' : 'Star'}
                      </Button>
                      <Button variant="outline" size="sm" className="h-8" onClick={toggleMuted}>
                        {activeMeta.muted ? 'Unmute' : 'Mute'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 border-red-200 text-red-700 hover:bg-red-50"
                        onClick={() => void toggleBlocked()}
                      >
                        {activeMeta.blocked ? 'Unblock' : 'Block'}
                      </Button>
                    </div>
                  </div>
                </div>

                <div
                  ref={messagesScrollerRef}
                  className="flex-1 overflow-x-hidden overflow-y-auto bg-[#efeae2] bg-[radial-gradient(circle_at_1px_1px,rgba(16,185,129,0.16)_1px,transparent_0)] [background-size:24px_24px] px-3 py-4 sm:px-4"
                >
                  {loadingMessages &&
                    Array.from({ length: 6 }).map((_, index) => (
                      <Skeleton key={`message-skeleton-${index}`} className="mb-2 h-16 w-[78%] bg-slate-200" />
                    ))}
                  {!loadingMessages && messages.length === 0 && (
                    <div className="mx-auto w-fit rounded-full border border-slate-300 bg-white/80 px-3 py-1 text-xs text-slate-600">
                      No messages yet.
                    </div>
                  )}

                  {!loadingMessages &&
                    timeline.map((item) => {
                      if (item.kind === 'divider') {
                        return (
                          <div key={item.key} className="mb-2 flex justify-center">
                            <span className="rounded-full border border-slate-300 bg-white/80 px-2.5 py-1 text-[10px] text-slate-600">
                              {item.label}
                            </span>
                          </div>
                        );
                      }

                      const message = item.message;
                      const receipt = messageReceipts[message.id] || 'sent';
                      const bubbleTone = message.isMine ? 'bg-[#d9fdd3] rounded-br-md' : 'bg-white rounded-bl-md';
                      return (
                        <div key={item.key} className={`mb-2 flex ${message.isMine ? 'justify-end' : 'justify-start'}`}>
                          <article className={`max-w-[86%] rounded-2xl px-3 py-2 shadow-sm ${bubbleTone}`}>
                            <p className="mb-0.5 text-[11px] font-medium text-slate-600">{messageSenderLabel(message)}</p>
                            <p className="whitespace-pre-wrap break-words text-sm text-slate-900">{message.body}</p>
                            <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-500">
                              <span>{fmtClock(message.createdAt)}</span>
                              {message.isMine && (
                                receipt === 'sent' ? (
                                  <Check className="h-3.5 w-3.5 text-slate-400" />
                                ) : (
                                  <CheckCheck
                                    className={`h-3.5 w-3.5 ${
                                      receipt === 'read' ? 'text-sky-500' : 'text-slate-400'
                                    }`}
                                  />
                                )
                              )}
                            </div>
                          </article>
                        </div>
                      );
                    })}

                  {activeTypingState && (
                    <div className="mt-2 flex justify-start">
                      <div className="rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                        {activeTypingState.userName} is typing...
                      </div>
                    </div>
                  )}

                  {sending && (
                    <div className="mt-2 flex justify-start">
                      <div className="rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                        sending...
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-200 bg-white px-3 py-3">
                  {attachments.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {attachments.map((file, index) => (
                        <span
                          key={`${file.name}-${index}`}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                        >
                          {file.name}
                          <button
                            type="button"
                            onClick={() => setAttachments((previous) => previous.filter((_, fileIndex) => fileIndex !== index))}
                            className="text-slate-500 hover:text-slate-900"
                          >
                            x
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-end gap-2">
                    <div className="flex min-w-0 flex-1 items-end gap-2 rounded-3xl border border-slate-300 bg-white px-2 py-1.5 shadow-sm">
                      <label className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-600 hover:bg-slate-100">
                        <Paperclip className="h-4 w-4" />
                        <span className="sr-only">Attach files</span>
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          onChange={(event) => {
                            const selected = Array.from(event.target.files || []);
                            if (selected.length > 0) {
                              setAttachments((previous) => [...previous, ...selected].slice(0, 6));
                            }
                            event.target.value = '';
                          }}
                        />
                      </label>

                      <Textarea
                        value={messageInput}
                        onChange={(event) => setMessageInput(event.target.value)}
                        onKeyDown={onComposerKeyDown}
                        placeholder="Type a message"
                        rows={1}
                        className="min-h-[34px] max-h-28 flex-1 resize-none border-0 bg-transparent px-1 py-1 text-sm shadow-none focus-visible:ring-0"
                      />
                    </div>

                    <Button
                      onClick={() => void sendMessage()}
                      disabled={
                        sending ||
                        activeConversation.status === 'Closed' ||
                        activeMeta.blocked ||
                        (!messageInput.trim() && attachments.length === 0)
                      }
                      className="h-11 w-11 shrink-0 rounded-full bg-emerald-700 p-0 text-white hover:bg-emerald-800"
                    >
                      <SendHorizonal className="h-4 w-4" />
                      <span className="sr-only">Send</span>
                    </Button>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                    {(user.role === 'admin' || user.role === 'team_member') && activeConversation.type === 'property_owner' && (
                      <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={sendAsOwner}
                          onChange={(event) => setSendAsOwner(event.target.checked)}
                        />
                        Send as Owner Desk
                      </label>
                    )}
                  </div>

                  {activeMeta.blocked && (
                    <p className="mt-2 inline-flex items-center gap-1 text-xs text-red-700">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      Conversation is blocked. Unblock to send messages.
                    </p>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
