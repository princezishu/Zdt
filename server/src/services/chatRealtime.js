import crypto from 'crypto';
import { Server } from 'socket.io';
import { pool } from '../db.js';
import { authenticateAccessToken } from '../middleware/auth.js';

const NUMERIC_ID_PATTERN = /^\d+$/;
const UUID_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let chatIo = null;
const onlineUserSockets = new Map();

function parseConversationIdentifier(rawValue) {
  const value = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue || '').trim();
  if (!value) return null;

  if (NUMERIC_ID_PATTERN.test(value)) {
    const numericId = Number(value);
    if (!Number.isSafeInteger(numericId) || numericId <= 0) return null;
    return { kind: 'numeric', value: numericId };
  }

  if (UUID_ID_PATTERN.test(value)) {
    return { kind: 'uuid', value: value.toLowerCase() };
  }

  return null;
}

function buildConversationIdFilter(
  parsedIdentifier,
  {
    idColumn = 'id',
    uuidColumn = 'uuid_id',
    parameterIndex = 1,
  } = {}
) {
  if (!parsedIdentifier) {
    return null;
  }

  if (parsedIdentifier.kind === 'numeric') {
    return {
      clause: `${idColumn} = $${parameterIndex}`,
      values: [parsedIdentifier.value],
    };
  }

  return {
    clause: `${uuidColumn} = $${parameterIndex}::uuid`,
    values: [parsedIdentifier.value],
  };
}

function conversationRoomName(conversationId) {
  return `chat:conversation:${conversationId}`;
}

function userRoomName(userId) {
  return `chat:user:${userId}`;
}

function isFinitePositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function normalizePositiveMessageId(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.trunc(numeric);
}

function markUserOnline(userId, socketId) {
  if (!isFinitePositiveInteger(userId) || !socketId) return;
  const existing = onlineUserSockets.get(userId);
  if (existing) {
    existing.add(socketId);
    return;
  }
  onlineUserSockets.set(userId, new Set([socketId]));
}

function markUserOffline(userId, socketId) {
  if (!isFinitePositiveInteger(userId) || !socketId) return true;
  const existing = onlineUserSockets.get(userId);
  if (!existing) return true;
  existing.delete(socketId);
  if (existing.size === 0) {
    onlineUserSockets.delete(userId);
    return true;
  }
  return false;
}

function isUserOnline(userId) {
  const existing = onlineUserSockets.get(userId);
  return Boolean(existing && existing.size > 0);
}

async function loadLastSeenByUserIds(userIds) {
  const uniqueUserIds = Array.from(
    new Set(
      (Array.isArray(userIds) ? userIds : [])
        .map((value) => Number(value))
        .filter((value) => isFinitePositiveInteger(value))
    )
  );
  if (uniqueUserIds.length === 0) return new Map();

  const rows = await pool.query(
    `
      SELECT
        user_id,
        MAX(last_seen_at) AS last_seen_at
      FROM user_sessions
      WHERE user_id = ANY($1::bigint[])
      GROUP BY user_id
    `,
    [uniqueUserIds]
  );

  const output = new Map();
  rows.rows.forEach((row) => {
    const userId = Number(row.user_id);
    if (!isFinitePositiveInteger(userId)) return;
    output.set(userId, row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null);
  });
  return output;
}

async function upsertConversationReceipt({
  conversationId,
  userId,
  lastDeliveredMessageId,
  lastReadMessageId,
}) {
  const normalizedConversationId = Number(conversationId);
  const normalizedUserId = Number(userId);
  if (!isFinitePositiveInteger(normalizedConversationId) || !isFinitePositiveInteger(normalizedUserId)) {
    return null;
  }

  const deliveredCandidateId = normalizePositiveMessageId(lastDeliveredMessageId);
  const readCandidateId = normalizePositiveMessageId(lastReadMessageId);
  if (deliveredCandidateId === null && readCandidateId === null) {
    return null;
  }

  const rows = await pool.query(
    `
      WITH incoming AS (
        SELECT
          $1::bigint AS conversation_id,
          $2::bigint AS user_id,
          (
            SELECT m.id
            FROM chat_messages m
            WHERE m.conversation_id = $1
              AND m.id = $3
            LIMIT 1
          ) AS delivered_id,
          (
            SELECT m.id
            FROM chat_messages m
            WHERE m.conversation_id = $1
              AND m.id = $4
            LIMIT 1
          ) AS read_id
      ),
      normalized AS (
        SELECT
          conversation_id,
          user_id,
          CASE
            WHEN delivered_id IS NULL AND read_id IS NULL THEN NULL
            ELSE GREATEST(COALESCE(delivered_id, 0), COALESCE(read_id, 0))::bigint
          END AS merged_delivered_id,
          read_id
        FROM incoming
      )
      INSERT INTO chat_message_receipts (
        conversation_id,
        user_id,
        last_delivered_message_id,
        last_read_message_id,
        delivered_at,
        read_at
      )
      SELECT
        conversation_id,
        user_id,
        merged_delivered_id,
        read_id,
        CASE
          WHEN merged_delivered_id IS NOT NULL THEN NOW()
          ELSE NULL
        END,
        CASE
          WHEN read_id IS NOT NULL THEN NOW()
          ELSE NULL
        END
      FROM normalized
      WHERE merged_delivered_id IS NOT NULL
         OR read_id IS NOT NULL
      ON CONFLICT (conversation_id, user_id)
      DO UPDATE
      SET
        last_delivered_message_id = CASE
          WHEN GREATEST(
            COALESCE(chat_message_receipts.last_delivered_message_id, 0),
            COALESCE(EXCLUDED.last_delivered_message_id, 0),
            COALESCE(EXCLUDED.last_read_message_id, 0)
          ) = 0
            THEN NULL
          ELSE GREATEST(
            COALESCE(chat_message_receipts.last_delivered_message_id, 0),
            COALESCE(EXCLUDED.last_delivered_message_id, 0),
            COALESCE(EXCLUDED.last_read_message_id, 0)
          )
        END,
        last_read_message_id = CASE
          WHEN GREATEST(
            COALESCE(chat_message_receipts.last_read_message_id, 0),
            COALESCE(EXCLUDED.last_read_message_id, 0)
          ) = 0
            THEN NULL
          ELSE GREATEST(
            COALESCE(chat_message_receipts.last_read_message_id, 0),
            COALESCE(EXCLUDED.last_read_message_id, 0)
          )
        END,
        delivered_at = CASE
          WHEN GREATEST(
            COALESCE(EXCLUDED.last_delivered_message_id, 0),
            COALESCE(EXCLUDED.last_read_message_id, 0)
          ) > COALESCE(chat_message_receipts.last_delivered_message_id, 0)
            THEN NOW()
          ELSE chat_message_receipts.delivered_at
        END,
        read_at = CASE
          WHEN COALESCE(EXCLUDED.last_read_message_id, 0) > COALESCE(chat_message_receipts.last_read_message_id, 0)
            THEN NOW()
          ELSE chat_message_receipts.read_at
        END,
        updated_at = NOW()
      RETURNING
        last_delivered_message_id,
        last_read_message_id,
        delivered_at,
        read_at
    `,
    [normalizedConversationId, normalizedUserId, deliveredCandidateId, readCandidateId]
  );

  if (rows.rowCount === 0) return null;

  const receipt = rows.rows[0];
  return {
    lastDeliveredMessageId: receipt.last_delivered_message_id ? Number(receipt.last_delivered_message_id) : null,
    lastReadMessageId: receipt.last_read_message_id ? Number(receipt.last_read_message_id) : null,
    deliveredAt: receipt.delivered_at ? new Date(receipt.delivered_at).toISOString() : null,
    readAt: receipt.read_at ? new Date(receipt.read_at).toISOString() : null,
  };
}

function buildConversationParticipants(conversation) {
  const participants = [];
  const seen = new Set();

  const requesterUserId = Number(conversation?.requester_user_id);
  if (isFinitePositiveInteger(requesterUserId)) {
    const requesterName =
      typeof conversation?.requester_name === 'string' && conversation.requester_name.trim()
        ? conversation.requester_name.trim()
        : 'User';
    participants.push({ userId: requesterUserId, userName: requesterName });
    seen.add(requesterUserId);
  }

  const ownerUserId = Number(conversation?.owner_user_id);
  if (isFinitePositiveInteger(ownerUserId) && !seen.has(ownerUserId)) {
    const ownerName =
      typeof conversation?.owner_user_name === 'string' && conversation.owner_user_name.trim()
        ? conversation.owner_user_name.trim()
        : typeof conversation?.owner_name === 'string' && conversation.owner_name.trim()
          ? conversation.owner_name.trim()
          : 'Owner';
    participants.push({ userId: ownerUserId, userName: ownerName });
    seen.add(ownerUserId);
  }

  return participants;
}

async function emitConversationPresenceSnapshot(socket, conversation, viewerUserId) {
  const conversationId = Number(conversation?.id);
  if (!isFinitePositiveInteger(conversationId)) return;

  const participants = buildConversationParticipants(conversation).filter(
    (participant) => participant.userId !== Number(viewerUserId)
  );
  if (participants.length === 0) return;

  const offlineIds = participants
    .map((participant) => participant.userId)
    .filter((userId) => !isUserOnline(userId));
  const lastSeenByUserId = await loadLastSeenByUserIds(offlineIds);
  const at = new Date().toISOString();

  participants.forEach((participant) => {
    const online = isUserOnline(participant.userId);
    socket.emit('chat:presence', {
      conversationId,
      userId: participant.userId,
      userName: participant.userName,
      isOnline: online,
      lastSeenAt: online ? null : (lastSeenByUserId.get(participant.userId) || null),
      at,
    });
  });
}

function isSupportTeamUser(user) {
  return Boolean(user?.isMainAdmin);
}

function normalizeAuthToken(socket) {
  const tokenFromAuth = socket.handshake?.auth?.token;
  if (typeof tokenFromAuth === 'string' && tokenFromAuth.trim()) {
    return tokenFromAuth.trim();
  }

  const header = socket.handshake?.headers?.authorization || '';
  const [scheme, token] = String(header).split(' ');
  if (scheme === 'Bearer' && token) {
    return token.trim();
  }
  return '';
}

async function authenticateSocketUser(token) {
  if (!token) {
    throw new Error('Missing auth token');
  }

  const authState = await authenticateAccessToken(token);
  const user = authState.user;

  return {
    id: Number(user.id),
    name: user.name || 'User',
    email: user.email || '',
    role: user.role || 'user',
    isMainAdmin: Boolean(user.isMainAdmin),
    sessionId: authState.sessionId ? Number(authState.sessionId) : null,
    authStrategy: authState.strategy,
    managedAuthProvider: user.managedAuthProvider || authState.authProvider || null,
  };
}

async function loadConversationForUser(conversationIdInput, user) {
  const parsedConversationId = parseConversationIdentifier(conversationIdInput);
  const conversationFilter = buildConversationIdFilter(parsedConversationId, {
    idColumn: 'c.id',
    uuidColumn: 'c.uuid_id',
    parameterIndex: 1,
  });
  if (!conversationFilter) {
    return null;
  }

  const values = [...conversationFilter.values];
  const filters = [conversationFilter.clause];

  if (!isSupportTeamUser(user)) {
    values.push(user.id);
    filters.push(`(c.requester_user_id = $${values.length} OR c.owner_user_id = $${values.length})`);
  }

  const rows = await pool.query(
    `
      SELECT
        c.id,
        c.requester_user_id,
        c.owner_user_id,
        c.owner_name,
        requester.name AS requester_name,
        owner_user.name AS owner_user_name
      FROM chat_conversations c
      LEFT JOIN users requester
        ON requester.id = c.requester_user_id
      LEFT JOIN users owner_user
        ON owner_user.id = c.owner_user_id
      WHERE ${filters.join(' AND ')}
      LIMIT 1
    `,
    values
  );

  if (rows.rowCount === 0) {
    return null;
  }
  return rows.rows[0];
}

export function initializeChatRealtime(httpServer, { isOriginAllowed } = {}) {
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || typeof isOriginAllowed !== 'function' || isOriginAllowed(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`CORS blocked for origin: ${origin}`));
      },
      credentials: true,
    },
  });

  chatIo = io;

  io.use(async (socket, next) => {
    try {
      const token = normalizeAuthToken(socket);
      const user = await authenticateSocketUser(token);
      socket.data.user = user;
      return next();
    } catch (error) {
      return next(new Error(error instanceof Error ? error.message : 'Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    const joinedConversationIds = new Set();
    markUserOnline(user.id, socket.id);

    socket.join(userRoomName(user.id));

    const joinConversation = async (
      conversationIdInput,
      {
        emitPresenceSnapshot = false,
        broadcastOnlinePresence = false,
      } = {}
    ) => {
      const conversation = await loadConversationForUser(conversationIdInput, user);
      if (!conversation) return null;

      const conversationId = Number(conversation.id);
      const roomName = conversationRoomName(conversationId);
      const alreadyJoined = joinedConversationIds.has(conversationId);

      if (!alreadyJoined) {
        socket.join(roomName);
        joinedConversationIds.add(conversationId);
      }

      if (emitPresenceSnapshot) {
        await emitConversationPresenceSnapshot(socket, conversation, user.id);
      }

      if (broadcastOnlinePresence && !alreadyJoined) {
        socket.to(roomName).emit('chat:presence', {
          conversationId,
          userId: user.id,
          userName: user.name,
          isOnline: true,
          lastSeenAt: null,
          at: new Date().toISOString(),
        });
      }

      return conversationId;
    };

    socket.on('chat:join', async (payload = {}, ack) => {
      try {
        const conversationId = await joinConversation(payload?.conversationId, {
          emitPresenceSnapshot: true,
          broadcastOnlinePresence: true,
        });
        if (!conversationId) {
          if (typeof ack === 'function') ack({ ok: false, error: 'Conversation unavailable' });
          return;
        }
        if (typeof ack === 'function') ack({ ok: true, conversationId });
      } catch (error) {
        if (typeof ack === 'function') {
          ack({ ok: false, error: error instanceof Error ? error.message : 'Unable to join chat' });
        }
      }
    });

    socket.on('chat:leave', (payload = {}) => {
      const conversationId = Number(payload?.conversationId);
      if (!Number.isFinite(conversationId) || conversationId <= 0) return;
      socket.leave(conversationRoomName(conversationId));
      joinedConversationIds.delete(conversationId);
    });

    socket.on('chat:typing', async (payload = {}) => {
      const rawConversationId = payload?.conversationId;
      let conversationId = Number(rawConversationId);
      if (!Number.isFinite(conversationId) || conversationId <= 0) return;

      if (!joinedConversationIds.has(conversationId)) {
        const joinedId = await joinConversation(rawConversationId);
        if (!joinedId) return;
        conversationId = joinedId;
      }

      socket.to(conversationRoomName(conversationId)).emit('chat:typing', {
        conversationId,
        userId: user.id,
        userName: user.name,
        isTyping: Boolean(payload?.isTyping),
        at: new Date().toISOString(),
      });
    });

    socket.on('chat:delivered', async (payload = {}) => {
      const rawConversationId = payload?.conversationId;
      let conversationId = Number(rawConversationId);
      if (!Number.isFinite(conversationId) || conversationId <= 0) return;

      if (!joinedConversationIds.has(conversationId)) {
        const joinedId = await joinConversation(rawConversationId);
        if (!joinedId) return;
        conversationId = joinedId;
      }

      let lastDeliveredMessageId = normalizePositiveMessageId(payload?.lastDeliveredMessageId);
      try {
        const receiptState = await upsertConversationReceipt({
          conversationId,
          userId: user.id,
          lastDeliveredMessageId: payload?.lastDeliveredMessageId,
          lastReadMessageId: null,
        });
        if (receiptState) {
          lastDeliveredMessageId = receiptState.lastDeliveredMessageId;
        }
      } catch {
        // Keep realtime delivery acknowledgements flowing even if DB write fails.
      }

      socket.to(conversationRoomName(conversationId)).emit('chat:delivered', {
        conversationId,
        userId: user.id,
        userName: user.name,
        lastDeliveredMessageId,
        at: new Date().toISOString(),
      });
    });

    socket.on('chat:read', async (payload = {}) => {
      const rawConversationId = payload?.conversationId;
      let conversationId = Number(rawConversationId);
      if (!Number.isFinite(conversationId) || conversationId <= 0) return;

      if (!joinedConversationIds.has(conversationId)) {
        const joinedId = await joinConversation(rawConversationId);
        if (!joinedId) return;
        conversationId = joinedId;
      }

      let lastReadMessageId = normalizePositiveMessageId(payload?.lastReadMessageId);
      try {
        const receiptState = await upsertConversationReceipt({
          conversationId,
          userId: user.id,
          lastDeliveredMessageId: payload?.lastReadMessageId,
          lastReadMessageId: payload?.lastReadMessageId,
        });
        if (receiptState) {
          lastReadMessageId = receiptState.lastReadMessageId;
        }
      } catch {
        // Keep realtime read acknowledgements flowing even if DB write fails.
      }

      socket.to(conversationRoomName(conversationId)).emit('chat:read', {
        conversationId,
        userId: user.id,
        userName: user.name,
        lastReadMessageId,
        at: new Date().toISOString(),
      });
    });

    socket.on('disconnect', async () => {
      const nowIso = new Date().toISOString();
      const userWentOffline = markUserOffline(user.id, socket.id);

      if (isFinitePositiveInteger(user.sessionId)) {
        try {
          await pool.query('UPDATE user_sessions SET last_seen_at = $2 WHERE id = $1', [user.sessionId, nowIso]);
        } catch {
          // Best effort only; failed updates should not break socket cleanup.
        }
      }

      if (!userWentOffline) {
        joinedConversationIds.clear();
        return;
      }

      joinedConversationIds.forEach((conversationId) => {
        socket.to(conversationRoomName(conversationId)).emit('chat:presence', {
          conversationId,
          userId: user.id,
          userName: user.name,
          isOnline: false,
          lastSeenAt: nowIso,
          at: nowIso,
        });
      });

      joinedConversationIds.clear();
    });
  });

  return io;
}

export function emitChatMessages(conversationId, messages) {
  if (!chatIo) return;
  const normalizedConversationId = Number(conversationId);
  if (!Number.isFinite(normalizedConversationId) || normalizedConversationId <= 0) return;
  if (!Array.isArray(messages) || messages.length === 0) return;
  chatIo.to(conversationRoomName(normalizedConversationId)).emit('chat:message', {
    conversationId: normalizedConversationId,
    messages,
    at: new Date().toISOString(),
  });
}
