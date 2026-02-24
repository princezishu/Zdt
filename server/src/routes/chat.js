import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { hasPermission, requireAuth } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { emitChatMessages } from '../services/chatRealtime.js';

const router = Router();
const CHAT_AUTO_REPLY_MESSAGE =
  "Thank you for contacting ZDT Realty.\nWe've received your message and our team will review it shortly.\nYou can expect a response within 24 hours.";

const conversationListQuerySchema = z.object({
  type: z.enum(['all', 'team_support', 'property_owner', 'builder_company']).default('all'),
});

const openTeamConversationSchema = z.object({
  subject: z.string().trim().max(180).optional().or(z.literal('')),
});

const openOwnerConversationSchema = z.object({
  propertyReference: z.string().trim().min(1).max(80),
  subject: z.string().trim().max(180).optional().or(z.literal('')),
});

const openCompanyConversationSchema = z.object({
  companyId: z.coerce.number().int().positive(),
  subject: z.string().trim().max(180).optional().or(z.literal('')),
});

const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(3000),
  sendAsOwner: z.boolean().optional().default(false),
});

const updateStatusSchema = z.object({
  status: z.enum(['Open', 'Closed']),
});

const updateConversationMetaSchema = z
  .object({
    unread: z.boolean().optional(),
    pinned: z.boolean().optional(),
    starred: z.boolean().optional(),
    blocked: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) =>
      ['unread', 'pinned', 'starred', 'blocked'].some(
        (key) => Object.prototype.hasOwnProperty.call(value, key) && typeof value[key] === 'boolean'
      ),
    {
      message: 'At least one metadata field is required.',
      path: ['metadata'],
    }
  );

const NUMERIC_ID_PATTERN = /^\d+$/;
const UUID_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeIpAddress(rawValue) {
  if (!rawValue) return '';
  return String(rawValue).split(',')[0].trim().slice(0, 64);
}

const chatConversationLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 40,
  message: 'Too many chat conversation requests. Please try again later.',
  keyGenerator: (req) => {
    const ip = normalizeIpAddress(req.ip || req.socket?.remoteAddress);
    const userId = req.user?.id ? `u:${req.user.id}` : `ip:${ip}`;
    const pathKey = String(req.path || '').slice(0, 30);
    return `chat:open:${userId}:${pathKey}`;
  },
});

const chatMessageLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 100,
  message: 'Too many chat messages. Please wait before sending more.',
  keyGenerator: (req) => {
    const ip = normalizeIpAddress(req.ip || req.socket?.remoteAddress);
    const userId = req.user?.id ? `u:${req.user.id}` : `ip:${ip}`;
    const conversationId = String(req.params?.id || '').slice(0, 16) || '-';
    return `chat:message:${userId}:${conversationId}`;
  },
});

async function isSupportTeam(req) {
  if (!req.user?.isMainAdmin) {
    return false;
  }
  return hasPermission(req, 'approve_listing');
}

function parseConversationIdentifier(rawValue) {
  const value = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue || '').trim();
  if (!value) {
    return null;
  }

  if (NUMERIC_ID_PATTERN.test(value)) {
    const numericId = Number(value);
    if (!Number.isSafeInteger(numericId) || numericId <= 0) {
      return null;
    }
    return {
      kind: 'numeric',
      value: numericId,
      token: value,
    };
  }

  if (UUID_ID_PATTERN.test(value)) {
    return {
      kind: 'uuid',
      value: value.toLowerCase(),
      token: value.toLowerCase(),
    };
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

function buildPropertyTitle(row) {
  if (!row.property_type && !row.property_city && !row.property_locality) {
    return null;
  }
  const area = row.property_locality || row.property_city || 'Prime Locality';
  const city = row.property_city || '';
  const type = row.property_type || 'Property';
  return `${type} in ${area}${city ? `, ${city}` : ''}`;
}

function sanitizeConversationMetadata(rawValue) {
  const output = {};
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
    return output;
  }

  if (typeof rawValue.unread === 'boolean') {
    output.unread = rawValue.unread;
  }
  if (typeof rawValue.pinned === 'boolean') {
    output.pinned = rawValue.pinned;
  }
  if (typeof rawValue.starred === 'boolean') {
    output.starred = rawValue.starred;
  }
  if (typeof rawValue.blocked === 'boolean') {
    output.blocked = rawValue.blocked;
  }

  return output;
}

function serializeConversation(row) {
  return {
    id: row.id,
    type: row.conversation_type,
    status: row.status,
    subject: row.subject,
    propertyReference: row.property_reference || null,
    propertyTitle: buildPropertyTitle(row),
    ownerName: row.owner_name || null,
    requesterUserId: row.requester_user_id,
    requesterName: row.requester_name || 'User',
    ownerUserId: row.owner_user_id || null,
    lastMessagePreview: row.last_message_preview || '',
    lastMessageAt: row.last_message_at,
    metadata: sanitizeConversationMetadata(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeMessage(row, userId) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderUserId: row.sender_user_id,
    senderRole: row.sender_role,
    senderName: row.sender_name,
    body: row.body,
    createdAt: row.created_at,
    isMine: Number(row.sender_user_id) === Number(userId),
  };
}

function serializeRealtimeMessage(row) {
  return {
    id: Number(row.id),
    conversationId: Number(row.conversation_id),
    senderUserId: row.sender_user_id === null ? null : Number(row.sender_user_id),
    senderRole: row.sender_role,
    senderName: row.sender_name,
    body: row.body,
    createdAt: row.created_at,
  };
}

function normalizeIsoTimestamp(value) {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

async function loadConversationReceiptStateForViewer(conversationId, viewerUserId) {
  const rows = await pool.query(
    `
      SELECT
        r.user_id,
        COALESCE(u.name, 'User') AS user_name,
        r.last_delivered_message_id,
        r.last_read_message_id,
        r.delivered_at,
        r.read_at
      FROM chat_message_receipts r
      LEFT JOIN users u
        ON u.id = r.user_id
      WHERE r.conversation_id = $1
        AND r.user_id <> $2
      ORDER BY
        COALESCE(r.read_at, r.delivered_at, r.updated_at, r.created_at) DESC,
        r.id DESC
      LIMIT 1
    `,
    [conversationId, viewerUserId]
  );

  if (rows.rowCount === 0) return null;
  const row = rows.rows[0];
  return {
    userId: row.user_id ? Number(row.user_id) : null,
    userName: row.user_name || 'User',
    lastDeliveredMessageId: row.last_delivered_message_id ? Number(row.last_delivered_message_id) : null,
    lastReadMessageId: row.last_read_message_id ? Number(row.last_read_message_id) : null,
    deliveredAt: normalizeIsoTimestamp(row.delivered_at),
    readAt: normalizeIsoTimestamp(row.read_at),
  };
}

async function writeChatActivity({
  actorUserId,
  actorRole,
  actionKey,
  entityId,
  requestReference,
  metadata,
}) {
  await pool.query(
    `
      INSERT INTO activity_logs (
        actor_user_id,
        actor_role,
        action_key,
        entity_type,
        entity_id,
        request_reference,
        metadata
      )
      VALUES ($1, $2, $3, 'chat', $4, $5, $6::jsonb)
    `,
    [
      actorUserId ?? null,
      actorRole ?? '',
      actionKey,
      entityId ?? null,
      requestReference ?? null,
      JSON.stringify(metadata || {}),
    ]
  );
}

async function loadConversationById(conversationIdInput, user, supportTeamAccess = false) {
  const parsedConversationId =
    conversationIdInput &&
    typeof conversationIdInput === 'object' &&
    (conversationIdInput.kind === 'numeric' || conversationIdInput.kind === 'uuid')
      ? conversationIdInput
      : parseConversationIdentifier(conversationIdInput);
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

  if (!supportTeamAccess) {
    values.push(user.id);
    filters.push(`(c.requester_user_id = $${values.length} OR c.owner_user_id = $${values.length})`);
  }

  const rows = await pool.query(
    `
      SELECT
        c.id,
        c.conversation_type,
        c.status,
        c.subject,
        c.requester_user_id,
        c.owner_user_id,
        c.owner_name,
        c.property_request_id,
        c.last_message_preview,
        c.last_message_at,
        c.metadata,
        c.created_at,
        c.updated_at,
        pr.reference_id AS property_reference,
        pr.property_type,
        pr.city AS property_city,
        pr.locality AS property_locality,
        requester.name AS requester_name
      FROM chat_conversations c
      LEFT JOIN property_requests pr
        ON pr.id = c.property_request_id
      LEFT JOIN users requester
        ON requester.id = c.requester_user_id
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

router.get('/conversations', requireAuth, async (req, res, next) => {
  try {
    const supportTeamAccess = await isSupportTeam(req);
    const query = conversationListQuerySchema.parse({
      type: req.query.type ?? 'all',
    });

    const values = [];
    const filters = [];

    if (query.type !== 'all') {
      values.push(query.type);
      filters.push(`c.conversation_type = $${values.length}`);
    }

    if (!supportTeamAccess) {
      values.push(req.user.id);
      filters.push(`(c.requester_user_id = $${values.length} OR c.owner_user_id = $${values.length})`);
    }

    const rows = await pool.query(
      `
        SELECT
          c.id,
          c.conversation_type,
          c.status,
          c.subject,
          c.requester_user_id,
          c.owner_user_id,
          c.owner_name,
          c.property_request_id,
          c.last_message_preview,
          c.last_message_at,
          c.metadata,
          c.created_at,
          c.updated_at,
          pr.reference_id AS property_reference,
          pr.property_type,
          pr.city AS property_city,
          pr.locality AS property_locality,
          requester.name AS requester_name
        FROM chat_conversations c
        LEFT JOIN property_requests pr
          ON pr.id = c.property_request_id
        LEFT JOIN users requester
          ON requester.id = c.requester_user_id
        ${filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : ''}
        ORDER BY COALESCE(c.last_message_at, c.updated_at) DESC, c.id DESC
        LIMIT 200
      `,
      values
    );

    return res.json({
      conversations: rows.rows.map((row) => serializeConversation(row)),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/conversations/team', requireAuth, chatConversationLimiter, async (req, res, next) => {
  try {
    const payload = openTeamConversationSchema.parse(req.body || {});
    const subject = payload.subject?.trim() || 'General Team Support';
    const conversationKey = `team:${req.user.id}`;

    const rows = await pool.query(
      `
        INSERT INTO chat_conversations (
          conversation_key,
          conversation_type,
          status,
          subject,
          created_by_user_id,
          requester_user_id
        )
        VALUES ($1, 'team_support', 'Open', $2, $3, $3)
        ON CONFLICT (conversation_key)
        DO UPDATE
          SET status = 'Open',
              updated_at = NOW(),
              subject = CASE
                WHEN chat_conversations.subject = '' THEN EXCLUDED.subject
                ELSE chat_conversations.subject
              END
        RETURNING id
      `,
      [conversationKey, subject, req.user.id]
    );

    const conversationId = Number(rows.rows[0].id);
    const conversation = await loadConversationById(conversationId, req.user);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation unavailable' });
    }

    await writeChatActivity({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      actionKey: 'chat_team_conversation_opened',
      entityId: conversationId,
      requestReference: null,
      metadata: {},
    });

    return res.status(201).json({
      conversation: serializeConversation(conversation),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/conversations/owner', requireAuth, chatConversationLimiter, async (req, res, next) => {
  try {
    const payload = openOwnerConversationSchema.parse(req.body || {});
    const propertyReference = payload.propertyReference.trim();

    const propertyRows = await pool.query(
      `
        SELECT
          id,
          reference_id,
          request_type,
          property_type,
          city,
          locality,
          requester_name,
          submitted_by_user_id,
          is_removed,
          is_fake
        FROM property_requests
        WHERE UPPER(reference_id) = UPPER($1)
          AND request_type IN ('sell', 'rent')
        LIMIT 1
      `,
      [propertyReference]
    );

    if (propertyRows.rowCount > 0) {
      const property = propertyRows.rows[0];
      if (property.is_removed || property.is_fake) {
        return res.status(404).json({ error: 'Property is not available for chat' });
      }

      const subject = payload.subject?.trim() || `Owner Chat - ${property.reference_id}`;
      const conversationKey = `owner:${req.user.id}:${property.id}`;

      const rows = await pool.query(
        `
          INSERT INTO chat_conversations (
            conversation_key,
            conversation_type,
            status,
            subject,
            created_by_user_id,
            requester_user_id,
            owner_user_id,
            owner_name,
            property_request_id
          )
          VALUES ($1, 'property_owner', 'Open', $2, $3, $3, $4, $5, $6)
          ON CONFLICT (conversation_key)
          DO UPDATE
            SET status = 'Open',
                updated_at = NOW(),
                owner_user_id = EXCLUDED.owner_user_id,
                owner_name = EXCLUDED.owner_name,
                property_request_id = EXCLUDED.property_request_id
          RETURNING id
        `,
        [
          conversationKey,
          subject,
          req.user.id,
          property.submitted_by_user_id ?? null,
          property.requester_name || 'Property Owner',
          property.id,
        ]
      );

      const conversationId = Number(rows.rows[0].id);
      const conversation = await loadConversationById(conversationId, req.user);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation unavailable' });
      }

      await writeChatActivity({
        actorUserId: req.user.id,
        actorRole: req.user.role,
        actionKey: 'chat_owner_conversation_opened',
        entityId: conversationId,
        requestReference: property.reference_id,
        metadata: {
          propertyReference: property.reference_id,
        },
      });

      return res.status(201).json({
        conversation: serializeConversation(conversation),
      });
    }

    if (!NUMERIC_ID_PATTERN.test(propertyReference)) {
      return res.status(404).json({ error: 'Property reference not found' });
    }

    const listingId = Number(propertyReference);
    if (!Number.isSafeInteger(listingId) || listingId <= 0) {
      return res.status(400).json({ error: 'Invalid property reference' });
    }

    const propertyListingRows = await pool.query(
      `
        SELECT
          p.id,
          p.title,
          p.posted_by AS owner_user_id,
          owner_user.name AS owner_name
        FROM properties p
        LEFT JOIN users owner_user
          ON owner_user.id = p.posted_by
        WHERE p.id = $1
        LIMIT 1
      `,
      [listingId]
    );

    const rentalListingRows = propertyListingRows.rowCount
      ? { rowCount: 0, rows: [] }
      : await pool.query(
          `
            SELECT
              r.id,
              r.title,
              r.posted_by AS owner_user_id,
              owner_user.name AS owner_name
            FROM rentals r
            LEFT JOIN users owner_user
              ON owner_user.id = r.posted_by
            WHERE r.id = $1
            LIMIT 1
          `,
          [listingId]
        );

    let listingType = '';
    let listingTitle = '';
    let ownerUserId = null;
    let ownerName = '';
    let conversationKey = '';
    let requestReference = '';

    if (propertyListingRows.rowCount > 0) {
      const listing = propertyListingRows.rows[0];
      listingType = 'property';
      listingTitle = String(listing.title || '').trim();
      ownerUserId = listing.owner_user_id === null ? null : Number(listing.owner_user_id);
      ownerName = String(listing.owner_name || '').trim();
      conversationKey = `owner_property:${req.user.id}:${listing.id}`;
      requestReference = `PROPERTY-${listing.id}`;
    } else if (rentalListingRows.rowCount > 0) {
      const listing = rentalListingRows.rows[0];
      listingType = 'rental';
      listingTitle = String(listing.title || '').trim();
      ownerUserId = listing.owner_user_id === null ? null : Number(listing.owner_user_id);
      ownerName = String(listing.owner_name || '').trim();
      conversationKey = `owner_rental:${req.user.id}:${listing.id}`;
      requestReference = `RENTAL-${listing.id}`;
    } else {
      return res.status(404).json({ error: 'Property reference not found' });
    }

    if (!ownerUserId || ownerUserId <= 0) {
      return res.status(409).json({ error: 'Owner chat is not available right now' });
    }
    if (ownerUserId === Number(req.user.id)) {
      return res.status(409).json({ error: 'You cannot open owner chat for your own listing' });
    }

    const listingLabel = listingType === 'rental' ? 'Rental' : 'Property';
    const subject =
      payload.subject?.trim() || `Owner Chat - ${listingLabel} #${listingId}${listingTitle ? ` (${listingTitle})` : ''}`;

    const rows = await pool.query(
      `
        INSERT INTO chat_conversations (
          conversation_key,
          conversation_type,
          status,
          subject,
          created_by_user_id,
          requester_user_id,
          owner_user_id,
          owner_name,
          property_request_id
        )
        VALUES ($1, 'property_owner', 'Open', $2, $3, $3, $4, $5, NULL)
        ON CONFLICT (conversation_key)
        DO UPDATE
          SET status = 'Open',
              updated_at = NOW(),
              owner_user_id = EXCLUDED.owner_user_id,
              owner_name = EXCLUDED.owner_name
        RETURNING id
      `,
      [conversationKey, subject, req.user.id, ownerUserId, ownerName || 'Property Owner']
    );

    const conversationId = Number(rows.rows[0].id);
    const conversation = await loadConversationById(conversationId, req.user);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation unavailable' });
    }

    await writeChatActivity({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      actionKey: 'chat_owner_conversation_opened',
      entityId: conversationId,
      requestReference,
      metadata: {
        source: 'listing',
        listingType,
        listingId,
      },
    });

    return res.status(201).json({
      conversation: serializeConversation(conversation),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/conversations/company', requireAuth, chatConversationLimiter, async (req, res, next) => {
  try {
    const payload = openCompanyConversationSchema.parse(req.body || {});

    const companyRows = await pool.query(
      `
        SELECT
          c.id,
          c.name,
          c.company_type,
          COALESCE(c.created_by_user_id, owner_user.id) AS owner_user_id
        FROM companies c
        LEFT JOIN LATERAL (
          SELECT u.id
          FROM users u
          WHERE u.company_id = c.id
            AND u.company_role = 'owner'
          ORDER BY u.id ASC
          LIMIT 1
        ) owner_user ON TRUE
        WHERE c.id = $1
        LIMIT 1
      `,
      [payload.companyId]
    );

    if (companyRows.rowCount === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const company = companyRows.rows[0];
    if (!company.owner_user_id) {
      return res.status(409).json({ error: 'Company chat is not available right now' });
    }

    const companyLabel = company.company_type === 'dealer' ? 'Dealer' : 'Builder';
    const subject = payload.subject?.trim() || `${companyLabel} Chat - ${company.name}`;
    const conversationKey = `company:${req.user.id}:${company.id}`;

    const rows = await pool.query(
      `
        INSERT INTO chat_conversations (
          conversation_key,
          conversation_type,
          status,
          subject,
          created_by_user_id,
          requester_user_id,
          owner_user_id,
          owner_name
        )
        VALUES ($1, 'builder_company', 'Open', $2, $3, $3, $4, $5)
        ON CONFLICT (conversation_key)
        DO UPDATE
          SET status = 'Open',
              updated_at = NOW(),
              owner_user_id = EXCLUDED.owner_user_id,
              owner_name = EXCLUDED.owner_name,
              subject = CASE
                WHEN chat_conversations.subject = '' THEN EXCLUDED.subject
                ELSE chat_conversations.subject
              END
        RETURNING id
      `,
      [conversationKey, subject, req.user.id, company.owner_user_id, company.name]
    );

    const conversationId = Number(rows.rows[0].id);
    const conversation = await loadConversationById(conversationId, req.user);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation unavailable' });
    }

    await writeChatActivity({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      actionKey: 'chat_company_conversation_opened',
      entityId: conversationId,
      requestReference: null,
      metadata: {
        companyId: Number(company.id),
        companyName: company.name,
      },
    });

    return res.status(201).json({
      conversation: serializeConversation(conversation),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/conversations/:id/messages', requireAuth, async (req, res, next) => {
  const parsedConversationId = parseConversationIdentifier(req.params.id);
  if (!parsedConversationId) {
    return res.status(400).json({ error: 'Invalid conversation id' });
  }

  try {
    const supportTeamAccess = await isSupportTeam(req);
    const conversation = await loadConversationById(parsedConversationId, req.user, supportTeamAccess);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    const conversationId = Number(conversation.id);

    const messageRows = await pool.query(
      `
        SELECT
          id,
          conversation_id,
          sender_user_id,
          sender_role,
          sender_name,
          body,
          created_at
        FROM chat_messages
        WHERE conversation_id = $1
        ORDER BY created_at ASC, id ASC
        LIMIT 600
      `,
      [conversationId]
    );
    const receipt = await loadConversationReceiptStateForViewer(conversationId, req.user.id);

    return res.json({
      conversation: serializeConversation(conversation),
      messages: messageRows.rows.map((row) => serializeMessage(row, req.user.id)),
      receipt,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/conversations/:id/messages', requireAuth, chatMessageLimiter, async (req, res, next) => {
  const parsedConversationId = parseConversationIdentifier(req.params.id);
  if (!parsedConversationId) {
    return res.status(400).json({ error: 'Invalid conversation id' });
  }

  let payload;
  try {
    payload = sendMessageSchema.parse(req.body || {});
  } catch (error) {
    return next(error);
  }

  try {
    const supportTeamAccess = await isSupportTeam(req);
    const conversation = await loadConversationById(parsedConversationId, req.user, supportTeamAccess);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    const conversationId = Number(conversation.id);

    let senderRole = req.user.role;
    let senderName = req.user.name;

    if (supportTeamAccess && payload.sendAsOwner) {
      senderRole = 'owner';
      senderName = conversation.owner_name || 'Owner Desk';
    } else if (
      conversation.owner_user_id &&
      Number(conversation.owner_user_id) === Number(req.user.id) &&
      Number(conversation.requester_user_id) !== Number(req.user.id)
    ) {
      senderRole = 'owner';
    }

    const messageRows = await pool.query(
      `
        INSERT INTO chat_messages (
          conversation_id,
          sender_user_id,
          sender_role,
          sender_name,
          body
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING
          id,
          conversation_id,
          sender_user_id,
          sender_role,
          sender_name,
          body,
          created_at
      `,
      [conversationId, req.user.id, senderRole, senderName, payload.body]
    );
    const insertedMessageRow = messageRows.rows[0];
    if (!insertedMessageRow) {
      return res.status(500).json({ error: 'Unable to send message' });
    }
    emitChatMessages(conversationId, [serializeRealtimeMessage(insertedMessageRow)]);

    let autoReplyRow = null;

    const shouldSendAutoReply =
      conversation.conversation_type !== 'team_support'
      && Number(conversation.requester_user_id) === Number(req.user.id)
      && Number(conversation.owner_user_id || 0) !== Number(req.user.id);

    if (shouldSendAutoReply) {
      const existingAutoReply = await pool.query(
        `
          SELECT 1
          FROM chat_messages
          WHERE conversation_id = $1
            AND sender_role = 'system'
          LIMIT 1
        `,
        [conversationId]
      );

      if (existingAutoReply.rowCount === 0) {
        const insertedAutoReply = await pool.query(
          `
            INSERT INTO chat_messages (
              conversation_id,
              sender_user_id,
              sender_role,
              sender_name,
              body
            )
            VALUES ($1, NULL, 'system', 'ZDT Realty Auto Reply', $2)
            RETURNING
              id,
              conversation_id,
              sender_user_id,
              sender_role,
              sender_name,
              body,
              created_at
          `,
          [conversationId, CHAT_AUTO_REPLY_MESSAGE]
        );
        autoReplyRow = insertedAutoReply.rows[0] || null;
        if (autoReplyRow) {
          emitChatMessages(conversationId, [serializeRealtimeMessage(autoReplyRow)]);
        }
      }
    }

    const latestBody = autoReplyRow?.body || payload.body;
    const latestAt = autoReplyRow?.created_at || insertedMessageRow.created_at;

    await pool.query(
      `
        UPDATE chat_conversations
        SET
          status = 'Open',
          last_message_preview = LEFT($2, 240),
          last_message_at = $3
        WHERE id = $1
      `,
      [conversationId, latestBody, latestAt]
    );

    const serializedMessage = serializeMessage(insertedMessageRow, req.user.id);
    const serializedAutoReply = autoReplyRow ? serializeMessage(autoReplyRow, req.user.id) : null;

    void (async () => {
      try {
        await writeChatActivity({
          actorUserId: req.user.id,
          actorRole: req.user.role,
          actionKey: 'chat_message_sent',
          entityId: conversationId,
          requestReference: conversation.property_reference || null,
          metadata: {
            sendAsOwner: Boolean(supportTeamAccess && payload.sendAsOwner),
            senderRole,
          },
        });

        if (autoReplyRow) {
          await writeChatActivity({
            actorUserId: null,
            actorRole: 'system',
            actionKey: 'chat_auto_reply_sent',
            entityId: conversationId,
            requestReference: conversation.property_reference || null,
            metadata: {
              trigger: 'requester_message',
            },
          });
        }
      } catch (logError) {
        console.error('Failed to persist chat activity log:', logError);
      }
    })();

    return res.status(201).json({
      message: serializedMessage,
      autoReply: serializedAutoReply,
    });
  } catch (error) {
    return next(error);
  }
});

router.delete('/conversations/:id/messages/:messageId', requireAuth, async (req, res, next) => {
  const parsedConversationId = parseConversationIdentifier(req.params.id);
  if (!parsedConversationId) {
    return res.status(400).json({ error: 'Invalid conversation id' });
  }

  const messageId = Number(req.params.messageId);
  if (!Number.isSafeInteger(messageId) || messageId <= 0) {
    return res.status(400).json({ error: 'Invalid message id' });
  }

  try {
    const supportTeamAccess = await isSupportTeam(req);
    const conversation = await loadConversationById(parsedConversationId, req.user, supportTeamAccess);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    const conversationId = Number(conversation.id);

    const existingMessageRows = await pool.query(
      `
        SELECT
          id,
          conversation_id,
          sender_user_id,
          sender_role,
          sender_name,
          body,
          created_at
        FROM chat_messages
        WHERE id = $1
          AND conversation_id = $2
        LIMIT 1
      `,
      [messageId, conversationId]
    );

    if (existingMessageRows.rowCount === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const existingMessage = existingMessageRows.rows[0];
    const isOwnMessage =
      existingMessage.sender_user_id !== null &&
      Number(existingMessage.sender_user_id) === Number(req.user.id);
    if (!supportTeamAccess && !isOwnMessage) {
      return res.status(403).json({ error: 'You can only delete your own messages' });
    }

    await pool.query(
      `
        DELETE FROM chat_messages
        WHERE id = $1
          AND conversation_id = $2
      `,
      [messageId, conversationId]
    );

    const latestRows = await pool.query(
      `
        SELECT
          body,
          created_at
        FROM chat_messages
        WHERE conversation_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
      [conversationId]
    );
    const latestMessage = latestRows.rows[0] || null;

    await pool.query(
      `
        UPDATE chat_conversations
        SET
          last_message_preview = $2,
          last_message_at = $3
        WHERE id = $1
      `,
      [
        conversationId,
        latestMessage?.body ? String(latestMessage.body).slice(0, 240) : '',
        latestMessage?.created_at || null,
      ]
    );

    const updated = await loadConversationById(conversationId, req.user, supportTeamAccess);
    if (!updated) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    await writeChatActivity({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      actionKey: 'chat_message_deleted',
      entityId: conversationId,
      requestReference: updated.property_reference || null,
      metadata: {
        messageId,
        senderUserId:
          existingMessage.sender_user_id === null ? null : Number(existingMessage.sender_user_id),
        senderRole: existingMessage.sender_role || '',
      },
    });

    return res.json({
      deletedMessageId: messageId,
      conversation: serializeConversation(updated),
    });
  } catch (error) {
    return next(error);
  }
});

router.delete('/conversations/:id', requireAuth, async (req, res, next) => {
  const parsedConversationId = parseConversationIdentifier(req.params.id);
  if (!parsedConversationId) {
    return res.status(400).json({ error: 'Invalid conversation id' });
  }

  try {
    const supportTeamAccess = await isSupportTeam(req);
    const conversation = await loadConversationById(parsedConversationId, req.user, supportTeamAccess);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    const conversationId = Number(conversation.id);

    await pool.query(
      `
        DELETE FROM chat_conversations
        WHERE id = $1
      `,
      [conversationId]
    );

    await writeChatActivity({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      actionKey: 'chat_conversation_deleted',
      entityId: conversationId,
      requestReference: conversation.property_reference || null,
      metadata: {
        conversationType: conversation.conversation_type || '',
      },
    });

    return res.json({
      deletedConversationId: conversationId,
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/conversations/:id/meta', requireAuth, async (req, res, next) => {
  const parsedConversationId = parseConversationIdentifier(req.params.id);
  if (!parsedConversationId) {
    return res.status(400).json({ error: 'Invalid conversation id' });
  }

  let payload;
  try {
    payload = updateConversationMetaSchema.parse(req.body || {});
  } catch (error) {
    return next(error);
  }

  const patch = {};
  if (typeof payload.unread === 'boolean') patch.unread = payload.unread;
  if (typeof payload.pinned === 'boolean') patch.pinned = payload.pinned;
  if (typeof payload.starred === 'boolean') patch.starred = payload.starred;
  if (typeof payload.blocked === 'boolean') patch.blocked = payload.blocked;
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'No valid metadata fields provided' });
  }

  try {
    const supportTeamAccess = await isSupportTeam(req);
    const conversation = await loadConversationById(parsedConversationId, req.user, supportTeamAccess);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    const conversationId = Number(conversation.id);
    const currentMetadata = sanitizeConversationMetadata(conversation.metadata);
    const nextMetadata = {
      ...currentMetadata,
      ...patch,
    };

    await pool.query(
      `
        UPDATE chat_conversations
        SET metadata = $2::jsonb
        WHERE id = $1
      `,
      [conversationId, JSON.stringify(nextMetadata)]
    );

    const updated = await loadConversationById(conversationId, req.user, supportTeamAccess);
    if (!updated) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    await writeChatActivity({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      actionKey: 'chat_conversation_metadata_updated',
      entityId: conversationId,
      requestReference: updated.property_reference || null,
      metadata: {
        fields: Object.keys(patch),
      },
    });

    return res.json({
      conversation: serializeConversation(updated),
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/conversations/:id/status', requireAuth, async (req, res, next) => {
  const parsedConversationId = parseConversationIdentifier(req.params.id);
  if (!parsedConversationId) {
    return res.status(400).json({ error: 'Invalid conversation id' });
  }

  let payload;
  try {
    payload = updateStatusSchema.parse(req.body || {});
  } catch (error) {
    return next(error);
  }

  try {
    const supportTeamAccess = await isSupportTeam(req);
    const conversation = await loadConversationById(parsedConversationId, req.user, supportTeamAccess);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    const conversationId = Number(conversation.id);

    await pool.query(
      `
        UPDATE chat_conversations
        SET status = $2
        WHERE id = $1
      `,
      [conversationId, payload.status]
    );

    const updated = await loadConversationById(conversationId, req.user, supportTeamAccess);
    if (!updated) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    await writeChatActivity({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      actionKey: 'chat_conversation_status_changed',
      entityId: conversationId,
      requestReference: updated.property_reference || null,
      metadata: {
        status: payload.status,
      },
    });

    return res.json({
      conversation: serializeConversation(updated),
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
