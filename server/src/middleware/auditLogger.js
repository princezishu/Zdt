import { pool } from '../db.js';

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  return metadata;
}

function normalizeIpAddress(rawValue) {
  if (!rawValue) return '';
  return String(rawValue).split(',')[0].trim().slice(0, 64);
}

export async function logAuditEvent({
  actorUserId = null,
  actorRole = '',
  actionKey,
  entityType = 'system',
  entityId = null,
  requestReference = null,
  ipAddress = '',
  metadata = {},
}) {
  if (!actionKey) {
    return;
  }

  try {
    await pool.query(
      `
        INSERT INTO activity_logs (
          actor_user_id,
          actor_role,
          action_key,
          entity_type,
          entity_id,
          request_reference,
          ip_address,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      `,
      [
        actorUserId,
        actorRole || '',
        actionKey,
        entityType || 'system',
        entityId,
        requestReference,
        normalizeIpAddress(ipAddress),
        JSON.stringify(sanitizeMetadata(metadata)),
      ]
    );
  } catch (error) {
    // Audit logging must never break request execution.
    console.error('[AUDIT] Failed to write audit event:', error);
  }
}

export function auditLogger({
  actionKey,
  entityType = 'system',
  entityIdResolver = null,
  metadataResolver = null,
}) {
  return (req, res, next) => {
    const startedAt = Date.now();

    res.on('finish', () => {
      if (res.statusCode >= 500) {
        return;
      }

      const actor = req.user || null;
      const resolvedEntityId =
        typeof entityIdResolver === 'function' ? entityIdResolver(req, res) : null;
      const resolvedMetadata =
        typeof metadataResolver === 'function'
          ? metadataResolver(req, res)
          : {
              method: req.method,
              path: req.originalUrl || req.url,
              statusCode: res.statusCode,
              durationMs: Date.now() - startedAt,
            };

      void logAuditEvent({
        actorUserId: actor?.id || null,
        actorRole: actor?.role || '',
        actionKey,
        entityType,
        entityId: resolvedEntityId,
        requestReference: req.body?.referenceId || req.params?.referenceId || null,
        ipAddress: normalizeIpAddress(req.ip || req.socket?.remoteAddress),
        metadata: resolvedMetadata,
      });
    });

    return next();
  };
}
