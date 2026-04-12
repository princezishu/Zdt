import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { requireAuth, requireMainAdmin, requirePermission } from '../middleware/auth.js';

const router = Router();
const adminRouter = Router();

const promotionTypes = ['sponsored_banner', 'popup_ad', 'top_property'];
const uuidSchema = z.string().uuid();

const optionalTimestampSchema = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return new Date(value);
  }
  return value;
}, z.date().nullable());

const optionalUrlSchema = z.union([z.string().trim().url(), z.literal('')]);

const publicQuerySchema = z.object({
  limitPerType: z.coerce.number().int().min(1).max(24).optional().default(8),
});

const adminListQuerySchema = z.object({
  promoType: z.enum(promotionTypes).optional(),
  includeInactive: z.coerce.boolean().optional().default(true),
  limit: z.coerce.number().int().min(1).max(500).optional().default(200),
});

const createPromotionSchema = z
  .object({
    promoType: z.enum(promotionTypes),
    title: z.string().trim().min(2).max(180),
    subtitle: z.string().trim().max(240).optional().default(''),
    description: z.string().trim().max(5000).optional().default(''),
    imageUrl: optionalUrlSchema.optional().default(''),
    linkUrl: optionalUrlSchema.optional().default(''),
    propertyReference: z.string().trim().max(80).optional().default(''),
    ctaLabel: z.string().trim().max(60).optional().default(''),
    badgeText: z.string().trim().max(60).optional().default(''),
    openInNewTab: z.boolean().optional().default(true),
    isActive: z.boolean().optional().default(true),
    sortOrder: z.coerce.number().int().min(0).max(10000).optional().default(100),
    startAt: optionalTimestampSchema.optional().default(null),
    endAt: optionalTimestampSchema.optional().default(null),
  })
  .superRefine((payload, ctx) => {
    if (payload.startAt && payload.endAt && payload.startAt > payload.endAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'startAt cannot be after endAt.',
        path: ['startAt'],
      });
    }
  });

const updatePromotionSchema = z
  .object({
    promoType: z.enum(promotionTypes).optional(),
    title: z.string().trim().min(2).max(180).optional(),
    subtitle: z.string().trim().max(240).optional(),
    description: z.string().trim().max(5000).optional(),
    imageUrl: optionalUrlSchema.optional(),
    linkUrl: optionalUrlSchema.optional(),
    propertyReference: z.string().trim().max(80).optional(),
    ctaLabel: z.string().trim().max(60).optional(),
    badgeText: z.string().trim().max(60).optional(),
    openInNewTab: z.boolean().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.coerce.number().int().min(0).max(10000).optional(),
    startAt: optionalTimestampSchema.optional(),
    endAt: optionalTimestampSchema.optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'Provide at least one field to update.',
  })
  .superRefine((payload, ctx) => {
    if (
      payload.startAt !== undefined &&
      payload.endAt !== undefined &&
      payload.startAt &&
      payload.endAt &&
      payload.startAt > payload.endAt
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'startAt cannot be after endAt.',
        path: ['startAt'],
      });
    }
  });

function mapPromotionRow(row) {
  return {
    id: row.id,
    promoType: row.promo_type,
    title: row.title,
    subtitle: row.subtitle || '',
    description: row.description || '',
    imageUrl: row.image_url || '',
    linkUrl: row.link_url || '',
    propertyReference: row.property_reference || '',
    ctaLabel: row.cta_label || '',
    badgeText: row.badge_text || '',
    openInNewTab: Boolean(row.open_in_new_tab),
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order || 0),
    startAt: row.start_at,
    endAt: row.end_at,
    createdByUserId: row.created_by_user_id ? Number(row.created_by_user_id) : null,
    updatedByUserId: row.updated_by_user_id ? Number(row.updated_by_user_id) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeIpAddress(rawValue) {
  if (!rawValue) return '';
  return String(rawValue).split(',')[0].trim().slice(0, 64);
}

async function writePromotionAudit({
  req,
  actionKey,
  entityId = null,
  requestReference = null,
  metadata = {},
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
        ip_address,
        metadata
      )
      VALUES ($1, $2, $3, 'promotion', $4, $5, $6, $7::jsonb)
    `,
    [
      req.user?.id || null,
      req.user?.role || '',
      actionKey,
      entityId,
      requestReference,
      normalizeIpAddress(req.ip || req.socket?.remoteAddress),
      JSON.stringify(metadata || {}),
    ]
  );
}

router.get('/public', async (req, res, next) => {
  try {
    const query = publicQuerySchema.parse(req.query || {});
    const rows = await pool.query(
      `
        SELECT
          id,
          promo_type,
          title,
          subtitle,
          description,
          image_url,
          link_url,
          property_reference,
          cta_label,
          badge_text,
          open_in_new_tab,
          is_active,
          sort_order,
          start_at,
          end_at,
          created_at,
          updated_at
        FROM site_promotions
        WHERE is_active = TRUE
          AND (start_at IS NULL OR start_at <= NOW())
          AND (end_at IS NULL OR end_at >= NOW())
        ORDER BY
          CASE promo_type
            WHEN 'sponsored_banner' THEN 1
            WHEN 'popup_ad' THEN 2
            ELSE 3
          END,
          sort_order ASC,
          created_at DESC
      `
    );

    const grouped = {
      sponsoredBanners: [],
      popupAds: [],
      topListedProperties: [],
    };

    for (const row of rows.rows) {
      const mapped = mapPromotionRow(row);
      if (
        mapped.promoType === 'sponsored_banner' &&
        grouped.sponsoredBanners.length < query.limitPerType
      ) {
        grouped.sponsoredBanners.push(mapped);
      } else if (mapped.promoType === 'popup_ad' && grouped.popupAds.length < query.limitPerType) {
        grouped.popupAds.push(mapped);
      } else if (
        mapped.promoType === 'top_property' &&
        grouped.topListedProperties.length < query.limitPerType
      ) {
        grouped.topListedProperties.push(mapped);
      }
    }

    const latestRows = await pool.query(
      `
        SELECT MAX(updated_at) AS last_updated
        FROM site_promotions
        WHERE is_active = TRUE
          AND (start_at IS NULL OR start_at <= NOW())
          AND (end_at IS NULL OR end_at >= NOW())
      `
    );

    return res.json({
      promotions: grouped,
      lastUpdated: latestRows.rows[0]?.last_updated || null,
      dataSource: 'ZDT Main Admin Promotions',
    });
  } catch (error) {
    return next(error);
  }
});

adminRouter.use(
  requireAuth,
  requireMainAdmin,
  requirePermission('manage_promotions')
);

adminRouter.get('/items', async (req, res, next) => {
  try {
    const query = adminListQuerySchema.parse(req.query || {});
    const where = ['1=1'];
    const values = [];

    if (query.promoType) {
      values.push(query.promoType);
      where.push(`promo_type = $${values.length}`);
    }

    if (!query.includeInactive) {
      where.push('is_active = TRUE');
    }

    values.push(query.limit);

    const rows = await pool.query(
      `
        SELECT
          id,
          promo_type,
          title,
          subtitle,
          description,
          image_url,
          link_url,
          property_reference,
          cta_label,
          badge_text,
          open_in_new_tab,
          is_active,
          sort_order,
          start_at,
          end_at,
          created_by_user_id,
          updated_by_user_id,
          created_at,
          updated_at
        FROM site_promotions
        WHERE ${where.join(' AND ')}
        ORDER BY
          CASE promo_type
            WHEN 'sponsored_banner' THEN 1
            WHEN 'popup_ad' THEN 2
            ELSE 3
          END,
          sort_order ASC,
          updated_at DESC
        LIMIT $${values.length}
      `,
      values
    );

    return res.json({
      items: rows.rows.map(mapPromotionRow),
    });
  } catch (error) {
    return next(error);
  }
});

adminRouter.post('/items', async (req, res, next) => {
  try {
    const payload = createPromotionSchema.parse(req.body || {});

    const rows = await pool.query(
      `
        INSERT INTO site_promotions (
          promo_type,
          title,
          subtitle,
          description,
          image_url,
          link_url,
          property_reference,
          cta_label,
          badge_text,
          open_in_new_tab,
          is_active,
          sort_order,
          start_at,
          end_at,
          created_by_user_id,
          updated_by_user_id
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
        )
        RETURNING
          id,
          promo_type,
          title,
          subtitle,
          description,
          image_url,
          link_url,
          property_reference,
          cta_label,
          badge_text,
          open_in_new_tab,
          is_active,
          sort_order,
          start_at,
          end_at,
          created_by_user_id,
          updated_by_user_id,
          created_at,
          updated_at
      `,
      [
        payload.promoType,
        payload.title,
        payload.subtitle,
        payload.description,
        payload.imageUrl,
        payload.linkUrl,
        payload.propertyReference,
        payload.ctaLabel,
        payload.badgeText,
        payload.openInNewTab,
        payload.isActive,
        payload.sortOrder,
        payload.startAt,
        payload.endAt,
        req.user.id,
        req.user.id,
      ]
    );

    await writePromotionAudit({
      req,
      actionKey: 'promotion_created',
      entityId: rows.rows[0]?.id || null,
      requestReference: payload.propertyReference || null,
      metadata: {
        promoType: payload.promoType,
        title: payload.title,
      },
    });

    return res.status(201).json({
      message: 'Promotion added successfully.',
      item: mapPromotionRow(rows.rows[0]),
    });
  } catch (error) {
    return next(error);
  }
});

adminRouter.put('/items/:id', async (req, res, next) => {
  try {
    const id = uuidSchema.parse(req.params.id);
    const payload = updatePromotionSchema.parse(req.body || {});
    const updates = [];
    const values = [];

    if (payload.promoType !== undefined) {
      values.push(payload.promoType);
      updates.push(`promo_type = $${values.length}`);
    }
    if (payload.title !== undefined) {
      values.push(payload.title);
      updates.push(`title = $${values.length}`);
    }
    if (payload.subtitle !== undefined) {
      values.push(payload.subtitle);
      updates.push(`subtitle = $${values.length}`);
    }
    if (payload.description !== undefined) {
      values.push(payload.description);
      updates.push(`description = $${values.length}`);
    }
    if (payload.imageUrl !== undefined) {
      values.push(payload.imageUrl);
      updates.push(`image_url = $${values.length}`);
    }
    if (payload.linkUrl !== undefined) {
      values.push(payload.linkUrl);
      updates.push(`link_url = $${values.length}`);
    }
    if (payload.propertyReference !== undefined) {
      values.push(payload.propertyReference);
      updates.push(`property_reference = $${values.length}`);
    }
    if (payload.ctaLabel !== undefined) {
      values.push(payload.ctaLabel);
      updates.push(`cta_label = $${values.length}`);
    }
    if (payload.badgeText !== undefined) {
      values.push(payload.badgeText);
      updates.push(`badge_text = $${values.length}`);
    }
    if (payload.openInNewTab !== undefined) {
      values.push(payload.openInNewTab);
      updates.push(`open_in_new_tab = $${values.length}`);
    }
    if (payload.isActive !== undefined) {
      values.push(payload.isActive);
      updates.push(`is_active = $${values.length}`);
    }
    if (payload.sortOrder !== undefined) {
      values.push(payload.sortOrder);
      updates.push(`sort_order = $${values.length}`);
    }
    if (payload.startAt !== undefined) {
      values.push(payload.startAt);
      updates.push(`start_at = $${values.length}`);
    }
    if (payload.endAt !== undefined) {
      values.push(payload.endAt);
      updates.push(`end_at = $${values.length}`);
    }

    values.push(req.user.id);
    updates.push(`updated_by_user_id = $${values.length}`);

    values.push(id);

    const rows = await pool.query(
      `
        UPDATE site_promotions
        SET ${updates.join(', ')}
        WHERE id = $${values.length}
        RETURNING
          id,
          promo_type,
          title,
          subtitle,
          description,
          image_url,
          link_url,
          property_reference,
          cta_label,
          badge_text,
          open_in_new_tab,
          is_active,
          sort_order,
          start_at,
          end_at,
          created_by_user_id,
          updated_by_user_id,
          created_at,
          updated_at
      `,
      values
    );

    if (rows.rowCount === 0) {
      return res.status(404).json({ error: 'Promotion not found.' });
    }

    await writePromotionAudit({
      req,
      actionKey: 'promotion_updated',
      entityId: rows.rows[0]?.id || null,
      requestReference: rows.rows[0]?.property_reference || null,
      metadata: {
        updates: Object.keys(payload),
      },
    });

    return res.json({
      message: 'Promotion updated successfully.',
      item: mapPromotionRow(rows.rows[0]),
    });
  } catch (error) {
    return next(error);
  }
});

adminRouter.delete('/items/:id', async (req, res, next) => {
  try {
    const id = uuidSchema.parse(req.params.id);
    const rows = await pool.query('DELETE FROM site_promotions WHERE id = $1 RETURNING id', [id]);

    if (rows.rowCount === 0) {
      return res.status(404).json({ error: 'Promotion not found.' });
    }

    await writePromotionAudit({
      req,
      actionKey: 'promotion_deleted',
      entityId: rows.rows[0]?.id || null,
      requestReference: null,
      metadata: {},
    });

    return res.json({
      message: 'Promotion removed successfully.',
      ok: true,
    });
  } catch (error) {
    return next(error);
  }
});

router.use('/admin', adminRouter);

export default router;
