import crypto from 'crypto';
import { z } from 'zod';
import { pool } from '../db.js';
import { buildCloudinaryFolder, uploadToCloudinary } from '../services/cloudinary.js';
import {
  IMAGE_AND_PDF_MIME_TYPES,
  decodeValidatedDataUrl,
} from '../utils/fileValidation.js';

const UNIT_TYPES = ['Flat', 'Room', 'Shop', 'Office'];
const UNIT_CATEGORIES = ['Residential', 'Commercial'];
const LISTING_TYPES = ['Rent', 'Sale', 'Lease'];
const UNIT_STATUSES = ['Available', 'Occupied', 'Maintenance'];
const LAYOUT_UPLOAD_LIMIT_BYTES = 2 * 1024 * 1024;
const NUMERIC_ID_PATTERN = /^\d+$/;
const UUID_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveLayoutResourceType(mimeType) {
  return String(mimeType || '').trim().toLowerCase() === 'application/pdf' ? 'raw' : 'image';
}

function buildLayoutCloudinaryPublicId(baseId, extension, resourceType) {
  const normalizedBaseId = String(baseId || '').trim().replace(/\.[^.]+$/, '');
  const normalizedExtension = String(extension || '').trim().replace(/^\./, '');
  if (resourceType === 'raw' && normalizedExtension) {
    return `${normalizedBaseId}.${normalizedExtension}`;
  }
  return normalizedBaseId;
}

function parseRouteEntityId(rawValue) {
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

function buildDualIdFilter(
  parsedId,
  {
    idColumn = 'id',
    uuidColumn = 'uuid_id',
    parameterIndex = 1,
  } = {}
) {
  if (!parsedId) {
    return null;
  }

  if (parsedId.kind === 'numeric') {
    return {
      clause: `${idColumn} = $${parameterIndex}`,
      values: [parsedId.value],
    };
  }

  return {
    clause: `${uuidColumn} = $${parameterIndex}::uuid`,
    values: [parsedId.value],
  };
}

const selectUnitFields = `
  SELECT
    u.id,
    u.floor_id,
    u.layout_file_id,
    u.unit_number,
    u.unit_type,
    u.category,
    u.listing_type,
    u.area_covered,
    u.rent_amount,
    u.deposit_amount,
    u.maintenance_amount,
    u.sale_price,
    u.lease_amount,
    u.status,
    u.occupied_by_user_id,
    u.created_by_user_id,
    u.notes,
    u.created_at,
    u.updated_at,
    f.floor_number,
    f.floor_name,
    f.building_id,
    p.project_name AS building_name,
    COALESCE(array_remove(array_agg(DISTINCT a.id), NULL), ARRAY[]::BIGINT[]) AS amenity_ids,
    COALESCE(array_remove(array_agg(DISTINCT a.name), NULL), ARRAY[]::TEXT[]) AS amenity_names
  FROM units u
  JOIN floors f
    ON f.id = u.floor_id
  JOIN projects p
    ON p.id = f.building_id
  LEFT JOIN unit_amenities ua
    ON ua.unit_id = u.id
  LEFT JOIN amenities a
    ON a.id = ua.amenity_id
`;

const createFloorSchema = z.object({
  buildingId: z.coerce.number().int().positive(),
  floorNumber: z.coerce.number().int().min(0).max(500),
  floorName: z.string().trim().min(1).max(80).optional(),
});

const uploadLayoutSchema = z.object({
  floorId: z.coerce.number().int().positive(),
  fileDataUrl: z.string().trim().min(30).max(4_000_000),
  originalName: z.string().trim().max(180).optional().default(''),
});

const markerSchema = z.object({
  unitId: z.coerce.number().int().positive(),
  x: z.coerce.number().min(0).max(100),
  y: z.coerce.number().min(0).max(100),
});

const markerPointSchema = z.object({
  x: z.coerce.number().min(0).max(100),
  y: z.coerce.number().min(0).max(100),
});

const unitCreateFields = {
  layoutFileId: z.coerce.number().int().positive().optional().nullable(),
  unitNumber: z.string().trim().min(1).max(50),
  unitType: z.enum(UNIT_TYPES),
  category: z.enum(UNIT_CATEGORIES),
  listingType: z.enum(LISTING_TYPES),
  areaCovered: z.coerce.number().positive(),
  rentAmount: z.coerce.number().nonnegative().optional().nullable(),
  depositAmount: z.coerce.number().nonnegative().optional().nullable(),
  maintenanceAmount: z.coerce.number().nonnegative().optional().nullable(),
  salePrice: z.coerce.number().nonnegative().optional().nullable(),
  leaseAmount: z.coerce.number().nonnegative().optional().nullable(),
  status: z.enum(UNIT_STATUSES).optional().default('Available'),
  occupiedByUserId: z.coerce.number().int().positive().optional().nullable(),
  amenityIds: z.array(z.coerce.number().int().positive()).optional().default([]),
  notes: z.string().trim().max(500).optional().default(''),
  marker: markerPointSchema.optional(),
};

function withCreateUnitBusinessRules(schema) {
  return schema.superRefine((payload, ctx) => {
    if (payload.listingType === 'Rent' && payload.rentAmount == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rentAmount'],
        message: 'Rent units require rent amount.',
      });
    }
    if (payload.listingType === 'Sale' && payload.salePrice == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['salePrice'],
        message: 'Sale units require sale price.',
      });
    }
    if (payload.listingType === 'Lease' && payload.leaseAmount == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['leaseAmount'],
        message: 'Lease units require lease amount.',
      });
    }
    if (payload.status === 'Occupied' && !payload.occupiedByUserId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['occupiedByUserId'],
        message: 'Occupied units must be linked to a tenant.',
      });
    }
  });
}

const bulkCreateUnitsSchema = z.object({
  floorId: z.coerce.number().int().positive(),
  units: z
    .array(withCreateUnitBusinessRules(z.object(unitCreateFields)))
    .min(1)
    .max(500),
});

const createUnitSchema = withCreateUnitBusinessRules(
  z.object({
    floorId: z.coerce.number().int().positive(),
    ...unitCreateFields,
  })
);

const updateUnitSchema = z.object({
  layoutFileId: z.coerce.number().int().positive().nullable().optional(),
  unitNumber: z.string().trim().min(1).max(50).optional(),
  unitType: z.enum(UNIT_TYPES).optional(),
  category: z.enum(UNIT_CATEGORIES).optional(),
  listingType: z.enum(LISTING_TYPES).optional(),
  areaCovered: z.coerce.number().positive().optional(),
  rentAmount: z.coerce.number().nonnegative().nullable().optional(),
  depositAmount: z.coerce.number().nonnegative().nullable().optional(),
  maintenanceAmount: z.coerce.number().nonnegative().nullable().optional(),
  salePrice: z.coerce.number().nonnegative().nullable().optional(),
  leaseAmount: z.coerce.number().nonnegative().nullable().optional(),
  status: z.enum(UNIT_STATUSES).optional(),
  occupiedByUserId: z.coerce.number().int().positive().nullable().optional(),
  amenityIds: z.array(z.coerce.number().int().positive()).optional(),
  notes: z.string().trim().max(500).optional(),
  marker: markerPointSchema.optional(),
});

const markerUpsertSchema = z.object({
  markers: z.array(markerSchema).min(1).max(600),
});

const listUnitsQuerySchema = z.object({
  buildingId: z.coerce.number().int().positive().optional(),
  floorId: z.coerce.number().int().positive().optional(),
  status: z.enum(['all', ...UNIT_STATUSES]).optional().default('all'),
  unitType: z.enum(['all', ...UNIT_TYPES]).optional().default('all'),
  category: z.enum(['all', ...UNIT_CATEGORIES]).optional().default('all'),
  listingType: z.enum(['all', ...LISTING_TYPES]).optional().default('all'),
  areaMin: z.coerce.number().nonnegative().optional(),
  areaMax: z.coerce.number().nonnegative().optional(),
  priceMin: z.coerce.number().nonnegative().optional(),
  priceMax: z.coerce.number().nonnegative().optional(),
  q: z.string().trim().max(120).optional().default(''),
  limit: z.coerce.number().int().min(1).max(200).optional().default(80),
});

function decodeLayoutDataUrl(dataUrl) {
  const decoded = decodeValidatedDataUrl(dataUrl, IMAGE_AND_PDF_MIME_TYPES);
  if (!decoded) {
    return null;
  }

  return {
    mimeType: decoded.mimeType,
    extension: decoded.extension,
    fileType: decoded.mimeType === 'application/pdf' ? 'pdf' : 'image',
    buffer: decoded.buffer,
  };
}

function mapLayoutRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    floorId: Number(row.floor_id),
    fileUrl: row.file_url,
    fileType: row.file_type,
    mimeType: row.mime_type,
    fileSizeBytes: Number(row.file_size_bytes || 0),
    originalName: row.original_name || '',
    uploadedByUserId: row.uploaded_by_user_id ? Number(row.uploaded_by_user_id) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapFloorRow(row) {
  return {
    id: Number(row.id),
    buildingId: Number(row.building_id),
    floorNumber: Number(row.floor_number),
    floorName: row.floor_name || '',
    createdByUserId: row.created_by_user_id ? Number(row.created_by_user_id) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    latestLayout: row.layout_file_id
      ? {
          id: Number(row.layout_file_id),
          fileUrl: row.layout_file_url,
          fileType: row.layout_file_type,
          mimeType: row.layout_file_mime,
          createdAt: row.layout_created_at,
        }
      : null,
  };
}

function mapUnitRow(row) {
  return {
    id: Number(row.id),
    floorId: Number(row.floor_id),
    buildingId: Number(row.building_id),
    buildingName: row.building_name,
    floorNumber: Number(row.floor_number),
    floorName: row.floor_name || '',
    layoutFileId: row.layout_file_id ? Number(row.layout_file_id) : null,
    unitNumber: row.unit_number,
    unitType: row.unit_type,
    category: row.category,
    listingType: row.listing_type,
    areaCovered: Number(row.area_covered || 0),
    rentAmount: row.rent_amount == null ? null : Number(row.rent_amount),
    depositAmount: row.deposit_amount == null ? null : Number(row.deposit_amount),
    maintenanceAmount: row.maintenance_amount == null ? null : Number(row.maintenance_amount),
    salePrice: row.sale_price == null ? null : Number(row.sale_price),
    leaseAmount: row.lease_amount == null ? null : Number(row.lease_amount),
    status: row.status,
    occupiedByUserId: row.occupied_by_user_id ? Number(row.occupied_by_user_id) : null,
    createdByUserId: row.created_by_user_id ? Number(row.created_by_user_id) : null,
    amenityIds: Array.isArray(row.amenity_ids) ? row.amenity_ids.map((id) => Number(id)) : [],
    amenities: Array.isArray(row.amenity_names) ? row.amenity_names : [],
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function assertFloorExists(floorId) {
  const floorRows = await pool.query('SELECT id, building_id FROM floors WHERE id = $1 LIMIT 1', [floorId]);
  if (floorRows.rowCount === 0) {
    return null;
  }
  return {
    id: Number(floorRows.rows[0].id),
    buildingId: Number(floorRows.rows[0].building_id),
  };
}

async function assertBuildingExists(buildingId) {
  const rows = await pool.query('SELECT id FROM projects WHERE id = $1 LIMIT 1', [buildingId]);
  return rows.rowCount > 0;
}

async function assertAmenityIds(amenityIds) {
  if (!amenityIds.length) {
    return true;
  }
  const result = await pool.query('SELECT id FROM amenities WHERE id = ANY($1::BIGINT[])', [amenityIds]);
  return result.rowCount === amenityIds.length;
}

async function assertOccupantUser(userId) {
  if (!userId) {
    return true;
  }
  const result = await pool.query('SELECT id FROM users WHERE id = $1 LIMIT 1', [userId]);
  return result.rowCount > 0;
}

function resolveUnitValidationPayload(base, patch) {
  const pick = (key) =>
    Object.prototype.hasOwnProperty.call(patch, key) ? patch[key] : base[key];

  return {
    listingType: pick('listingType'),
    rentAmount: pick('rentAmount'),
    salePrice: pick('salePrice'),
    leaseAmount: pick('leaseAmount'),
    status: pick('status'),
    occupiedByUserId: pick('occupiedByUserId'),
  };
}

function validateBusinessRules(payload) {
  if (payload.listingType === 'Rent' && payload.rentAmount == null) {
    return 'Rent units require rent amount.';
  }
  if (payload.listingType === 'Sale' && payload.salePrice == null) {
    return 'Sale units require sale price.';
  }
  if (payload.listingType === 'Lease' && payload.leaseAmount == null) {
    return 'Lease units require lease amount.';
  }
  if (payload.status === 'Occupied' && !payload.occupiedByUserId) {
    return 'Occupied units must be linked to tenant.';
  }
  return '';
}

async function fetchUnitById(unitId) {
  const rows = await pool.query(
    `
      ${selectUnitFields}
      WHERE u.id = $1
      GROUP BY
        u.id,
        f.floor_number,
        f.floor_name,
        f.building_id,
        p.project_name
      LIMIT 1
    `,
    [unitId]
  );

  if (rows.rowCount === 0) {
    return null;
  }
  return mapUnitRow(rows.rows[0]);
}

async function fetchUnitByRouteId(parsedUnitId) {
  const unitIdFilter = buildDualIdFilter(parsedUnitId, {
    idColumn: 'u.id',
    uuidColumn: 'u.uuid_id',
    parameterIndex: 1,
  });
  if (!unitIdFilter) {
    return null;
  }

  const rows = await pool.query(
    `
      ${selectUnitFields}
      WHERE ${unitIdFilter.clause}
      GROUP BY
        u.id,
        f.floor_number,
        f.floor_name,
        f.building_id,
        p.project_name
      LIMIT 1
    `,
    unitIdFilter.values
  );

  if (rows.rowCount === 0) {
    return null;
  }
  return mapUnitRow(rows.rows[0]);
}

async function fetchUnitsByIds(unitIds) {
  if (!unitIds.length) {
    return [];
  }

  const rows = await pool.query(
    `
      ${selectUnitFields}
      WHERE u.id = ANY($1::BIGINT[])
      GROUP BY
        u.id,
        f.floor_number,
        f.floor_name,
        f.building_id,
        p.project_name
      ORDER BY array_position($1::BIGINT[], u.id)
    `,
    [unitIds]
  );
  return rows.rows.map(mapUnitRow);
}

export async function listBuildings(req, res, next) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 120, 1), 300);
    const rows = await pool.query(
      `
        SELECT
          p.id,
          p.project_name,
          p.city,
          p.area,
          p.total_floors,
          p.total_units,
          c.id AS company_id,
          c.name AS company_name
        FROM projects p
        LEFT JOIN companies c
          ON c.id = p.company_id
        ORDER BY p.project_name ASC
        LIMIT $1
      `,
      [limit]
    );

    return res.json({
      buildings: rows.rows.map((row) => ({
        id: Number(row.id),
        name: row.project_name,
        city: row.city || '',
        area: row.area || '',
        totalFloors: row.total_floors == null ? null : Number(row.total_floors),
        totalUnits: row.total_units == null ? null : Number(row.total_units),
        company: row.company_id
          ? {
              id: Number(row.company_id),
              name: row.company_name || '',
            }
          : null,
      })),
    });
  } catch (error) {
    return next(error);
  }
}

export async function listFloors(req, res, next) {
  try {
    const buildingId = req.query.buildingId ? Number(req.query.buildingId) : null;
    if (buildingId !== null && (!Number.isFinite(buildingId) || buildingId <= 0)) {
      return res.status(400).json({ error: 'Invalid building id' });
    }

    const rows = await pool.query(
      `
        SELECT
          f.id,
          f.building_id,
          f.floor_number,
          f.floor_name,
          f.created_by_user_id,
          f.created_at,
          f.updated_at,
          lf.id AS layout_file_id,
          lf.file_url AS layout_file_url,
          lf.file_type AS layout_file_type,
          lf.mime_type AS layout_file_mime,
          lf.created_at AS layout_created_at
        FROM floors f
        LEFT JOIN LATERAL (
          SELECT id, file_url, file_type, mime_type, created_at
          FROM layout_files
          WHERE floor_id = f.id
          ORDER BY created_at DESC
          LIMIT 1
        ) lf ON TRUE
        WHERE ($1::BIGINT IS NULL OR f.building_id = $1)
        ORDER BY f.floor_number ASC, f.created_at ASC
      `,
      [buildingId]
    );

    return res.json({
      floors: rows.rows.map(mapFloorRow),
    });
  } catch (error) {
    return next(error);
  }
}

export async function createFloor(req, res, next) {
  try {
    const payload = createFloorSchema.parse(req.body || {});
    const buildingExists = await assertBuildingExists(payload.buildingId);
    if (!buildingExists) {
      return res.status(404).json({ error: 'Building not found' });
    }

    const floorName =
      payload.floorName && payload.floorName.trim()
        ? payload.floorName.trim()
        : `Floor ${payload.floorNumber}`;

    try {
      const rows = await pool.query(
        `
          INSERT INTO floors (building_id, floor_number, floor_name, created_by_user_id)
          VALUES ($1, $2, $3, $4)
          RETURNING id, building_id, floor_number, floor_name, created_by_user_id, created_at, updated_at
        `,
        [payload.buildingId, payload.floorNumber, floorName, req.user.id]
      );
      return res.status(201).json({
        floor: mapFloorRow(rows.rows[0]),
      });
    } catch (error) {
      if (error && typeof error === 'object' && error.code === '23505') {
        return res.status(409).json({ error: 'Floor number must be unique per building.' });
      }
      throw error;
    }
  } catch (error) {
    return next(error);
  }
}

export async function uploadLayout(req, res, next) {
  try {
    const payload = uploadLayoutSchema.parse(req.body || {});
    const floor = await assertFloorExists(payload.floorId);
    if (!floor) {
      return res.status(404).json({ error: 'Floor not found' });
    }

    const decoded = decodeLayoutDataUrl(payload.fileDataUrl);
    if (!decoded) {
      return res.status(400).json({ error: 'Only PNG/JPG/PDF data URL uploads are supported.' });
    }
    if (decoded.buffer.length > LAYOUT_UPLOAD_LIMIT_BYTES) {
      return res.status(400).json({
        error: `Layout file is too large. Upload under ${Math.floor(
          LAYOUT_UPLOAD_LIMIT_BYTES / 1024
        )} KB.`,
      });
    }

    const nonce = crypto.randomBytes(4).toString('hex');
    const resourceType = resolveLayoutResourceType(decoded.mimeType);
    const uploaded = await uploadToCloudinary(decoded.buffer, {
      folder: buildCloudinaryFolder('layout-files'),
      publicId: buildLayoutCloudinaryPublicId(
        `layout-floor-${payload.floorId}-${Date.now()}-${nonce}`,
        decoded.extension,
        resourceType
      ),
      resourceType,
    });
    const absoluteUrl = uploaded.secureUrl || uploaded.url || '';

    const rows = await pool.query(
      `
        INSERT INTO layout_files (
          floor_id,
          file_url,
          file_type,
          mime_type,
          file_size_bytes,
          original_name,
          uploaded_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `,
      [
        payload.floorId,
        absoluteUrl,
        decoded.fileType,
        decoded.mimeType,
        decoded.buffer.length,
        payload.originalName || '',
        req.user.id,
      ]
    );

    return res.status(201).json({
      layout: mapLayoutRow(rows.rows[0]),
    });
  } catch (error) {
    return next(error);
  }
}

export async function getLatestLayout(req, res, next) {
  try {
    const floorId = Number(req.params.floorId);
    if (!Number.isFinite(floorId) || floorId <= 0) {
      return res.status(400).json({ error: 'Invalid floor id' });
    }

    const floor = await assertFloorExists(floorId);
    if (!floor) {
      return res.status(404).json({ error: 'Floor not found' });
    }

    const rows = await pool.query(
      `
        SELECT *
        FROM layout_files
        WHERE floor_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [floorId]
    );

    return res.json({
      layout: rows.rowCount > 0 ? mapLayoutRow(rows.rows[0]) : null,
    });
  } catch (error) {
    return next(error);
  }
}

export async function createUnit(req, res, next) {
  try {
    const payload = createUnitSchema.parse(req.body || {});
    const floor = await assertFloorExists(payload.floorId);
    if (!floor) {
      return res.status(404).json({ error: 'Floor not found' });
    }

    const amenityIds = [...new Set((payload.amenityIds || []).map((id) => Number(id)).filter((id) => id > 0))];
    const hasValidAmenities = await assertAmenityIds(amenityIds);
    if (!hasValidAmenities) {
      return res.status(400).json({ error: 'Amenities must be from predefined list.' });
    }
    const hasValidTenant = await assertOccupantUser(payload.occupiedByUserId || null);
    if (!hasValidTenant) {
      return res.status(400).json({ error: 'Occupied units must be linked to a valid tenant.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const insert = await client.query(
        `
          INSERT INTO units (
            floor_id,
            layout_file_id,
            unit_number,
            unit_type,
            category,
            listing_type,
            area_covered,
            rent_amount,
            deposit_amount,
            maintenance_amount,
            sale_price,
            lease_amount,
            status,
            occupied_by_user_id,
            created_by_user_id,
            notes
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13, $14, $15, $16
          )
          RETURNING id
        `,
        [
          payload.floorId,
          payload.layoutFileId || null,
          payload.unitNumber,
          payload.unitType,
          payload.category,
          payload.listingType,
          payload.areaCovered,
          payload.rentAmount ?? null,
          payload.depositAmount ?? null,
          payload.maintenanceAmount ?? null,
          payload.salePrice ?? null,
          payload.leaseAmount ?? null,
          payload.status || 'Available',
          payload.occupiedByUserId ?? null,
          req.user.id,
          payload.notes || '',
        ]
      );

      const unitId = Number(insert.rows[0].id);
      if (amenityIds.length > 0) {
        await client.query(
          `
            INSERT INTO unit_amenities (unit_id, amenity_id)
            SELECT $1, UNNEST($2::BIGINT[])
            ON CONFLICT (unit_id, amenity_id) DO NOTHING
          `,
          [unitId, amenityIds]
        );
      }

      if (payload.marker) {
        await client.query(
          `
            INSERT INTO layout_markers (floor_id, unit_id, marker_x, marker_y, created_by_user_id)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (floor_id, unit_id)
            DO UPDATE SET
              marker_x = EXCLUDED.marker_x,
              marker_y = EXCLUDED.marker_y,
              updated_at = NOW()
          `,
          [payload.floorId, unitId, payload.marker.x, payload.marker.y, req.user.id]
        );
      }

      await client.query('COMMIT');
      const unit = await fetchUnitById(unitId);
      return res.status(201).json({ unit });
    } catch (error) {
      await client.query('ROLLBACK');
      if (error && typeof error === 'object' && error.code === '23505') {
        return res.status(409).json({ error: 'Unit number must be unique per floor.' });
      }
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return next(error);
  }
}

export async function bulkCreateUnits(req, res, next) {
  try {
    const payload = bulkCreateUnitsSchema.parse(req.body || {});
    const floor = await assertFloorExists(payload.floorId);
    if (!floor) {
      return res.status(404).json({ error: 'Floor not found' });
    }

    const unitNumbers = payload.units.map((unit) => unit.unitNumber.trim());
    const duplicatesInPayload = new Set();
    const seen = new Set();
    for (const number of unitNumbers) {
      const key = number.toLowerCase();
      if (seen.has(key)) {
        duplicatesInPayload.add(number);
      }
      seen.add(key);
    }
    if (duplicatesInPayload.size > 0) {
      return res.status(400).json({
        error: `Duplicate unit numbers in payload: ${Array.from(duplicatesInPayload).join(', ')}`,
      });
    }

    const existingRows = await pool.query(
      'SELECT unit_number FROM units WHERE floor_id = $1 AND unit_number = ANY($2::TEXT[])',
      [payload.floorId, unitNumbers]
    );
    if (existingRows.rowCount > 0) {
      return res.status(409).json({
        error: `Unit numbers already exist on this floor: ${existingRows.rows
          .map((row) => row.unit_number)
          .join(', ')}`,
      });
    }

    const allAmenityIds = [
      ...new Set(
        payload.units
          .flatMap((unit) => unit.amenityIds || [])
          .map((id) => Number(id))
          .filter((id) => id > 0)
      ),
    ];
    const hasValidAmenities = await assertAmenityIds(allAmenityIds);
    if (!hasValidAmenities) {
      return res.status(400).json({ error: 'Amenities must be from predefined list.' });
    }

    const occupiedTenantIds = [
      ...new Set(
        payload.units
          .map((unit) => (unit.occupiedByUserId ? Number(unit.occupiedByUserId) : 0))
          .filter((id) => id > 0)
      ),
    ];
    for (const tenantId of occupiedTenantIds) {
      const hasValidTenant = await assertOccupantUser(tenantId);
      if (!hasValidTenant) {
        return res.status(400).json({ error: 'Occupied units must be linked to a valid tenant.' });
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const createdIds = [];

      for (const unitPayload of payload.units) {
        const insert = await client.query(
          `
            INSERT INTO units (
              floor_id,
              layout_file_id,
              unit_number,
              unit_type,
              category,
              listing_type,
              area_covered,
              rent_amount,
              deposit_amount,
              maintenance_amount,
              sale_price,
              lease_amount,
              status,
              occupied_by_user_id,
              created_by_user_id,
              notes
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8,
              $9, $10, $11, $12, $13, $14, $15, $16
            )
            RETURNING id
          `,
          [
            payload.floorId,
            unitPayload.layoutFileId || null,
            unitPayload.unitNumber,
            unitPayload.unitType,
            unitPayload.category,
            unitPayload.listingType,
            unitPayload.areaCovered,
            unitPayload.rentAmount ?? null,
            unitPayload.depositAmount ?? null,
            unitPayload.maintenanceAmount ?? null,
            unitPayload.salePrice ?? null,
            unitPayload.leaseAmount ?? null,
            unitPayload.status || 'Available',
            unitPayload.occupiedByUserId ?? null,
            req.user.id,
            unitPayload.notes || '',
          ]
        );

        const unitId = Number(insert.rows[0].id);
        createdIds.push(unitId);

        const amenityIds = [...new Set((unitPayload.amenityIds || []).map((id) => Number(id)).filter((id) => id > 0))];
        if (amenityIds.length > 0) {
          await client.query(
            `
              INSERT INTO unit_amenities (unit_id, amenity_id)
              SELECT $1, UNNEST($2::BIGINT[])
              ON CONFLICT (unit_id, amenity_id) DO NOTHING
            `,
            [unitId, amenityIds]
          );
        }

        if (unitPayload.marker) {
          await client.query(
            `
              INSERT INTO layout_markers (floor_id, unit_id, marker_x, marker_y, created_by_user_id)
              VALUES ($1, $2, $3, $4, $5)
              ON CONFLICT (floor_id, unit_id)
              DO UPDATE SET
                marker_x = EXCLUDED.marker_x,
                marker_y = EXCLUDED.marker_y,
                updated_at = NOW()
            `,
            [payload.floorId, unitId, unitPayload.marker.x, unitPayload.marker.y, req.user.id]
          );
        }
      }

      await client.query('COMMIT');
      const units = await fetchUnitsByIds(createdIds);
      return res.status(201).json({ units });
    } catch (error) {
      await client.query('ROLLBACK');
      if (error && typeof error === 'object' && error.code === '23505') {
        return res.status(409).json({ error: 'Unit number must be unique per floor.' });
      }
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return next(error);
  }
}

export async function updateUnit(req, res, next) {
  try {
    const unitIdInput = parseRouteEntityId(req.params.id);
    if (!unitIdInput) {
      return res.status(400).json({ error: 'Invalid unit id' });
    }

    const payload = updateUnitSchema.parse(req.body || {});
    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const current = await fetchUnitByRouteId(unitIdInput);
    if (!current) {
      return res.status(404).json({ error: 'Unit not found' });
    }
    const unitId = Number(current.id);

    const businessValidation = validateBusinessRules(resolveUnitValidationPayload(current, payload));
    if (businessValidation) {
      return res.status(400).json({ error: businessValidation });
    }

    if (payload.occupiedByUserId) {
      const hasValidTenant = await assertOccupantUser(payload.occupiedByUserId);
      if (!hasValidTenant) {
        return res.status(400).json({ error: 'Occupied units must be linked to a valid tenant.' });
      }
    }
    if (Array.isArray(payload.amenityIds)) {
      const amenityIds = [...new Set(payload.amenityIds.map((id) => Number(id)).filter((id) => id > 0))];
      const hasValidAmenities = await assertAmenityIds(amenityIds);
      if (!hasValidAmenities) {
        return res.status(400).json({ error: 'Amenities must be from predefined list.' });
      }
    }

    const updates = [];
    const values = [];
    const pushUpdate = (column, value) => {
      updates.push(`${column} = $${values.length + 1}`);
      values.push(value);
    };

    if (payload.layoutFileId !== undefined) pushUpdate('layout_file_id', payload.layoutFileId);
    if (payload.unitNumber !== undefined) pushUpdate('unit_number', payload.unitNumber);
    if (payload.unitType !== undefined) pushUpdate('unit_type', payload.unitType);
    if (payload.category !== undefined) pushUpdate('category', payload.category);
    if (payload.listingType !== undefined) pushUpdate('listing_type', payload.listingType);
    if (payload.areaCovered !== undefined) pushUpdate('area_covered', payload.areaCovered);
    if (payload.rentAmount !== undefined) pushUpdate('rent_amount', payload.rentAmount);
    if (payload.depositAmount !== undefined) pushUpdate('deposit_amount', payload.depositAmount);
    if (payload.maintenanceAmount !== undefined) pushUpdate('maintenance_amount', payload.maintenanceAmount);
    if (payload.salePrice !== undefined) pushUpdate('sale_price', payload.salePrice);
    if (payload.leaseAmount !== undefined) pushUpdate('lease_amount', payload.leaseAmount);
    if (payload.status !== undefined) pushUpdate('status', payload.status);
    if (payload.occupiedByUserId !== undefined) pushUpdate('occupied_by_user_id', payload.occupiedByUserId);
    if (payload.notes !== undefined) pushUpdate('notes', payload.notes || '');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (updates.length > 0) {
        values.push(unitId);
        await client.query(
          `
            UPDATE units
            SET ${updates.join(', ')}, updated_at = NOW()
            WHERE id = $${values.length}
          `,
          values
        );
      }

      if (Array.isArray(payload.amenityIds)) {
        const amenityIds = [...new Set(payload.amenityIds.map((id) => Number(id)).filter((id) => id > 0))];
        await client.query('DELETE FROM unit_amenities WHERE unit_id = $1', [unitId]);
        if (amenityIds.length > 0) {
          await client.query(
            `
              INSERT INTO unit_amenities (unit_id, amenity_id)
              SELECT $1, UNNEST($2::BIGINT[])
              ON CONFLICT (unit_id, amenity_id) DO NOTHING
            `,
            [unitId, amenityIds]
          );
        }
      }

      if (payload.marker) {
        await client.query(
          `
            INSERT INTO layout_markers (floor_id, unit_id, marker_x, marker_y, created_by_user_id)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (floor_id, unit_id)
            DO UPDATE SET
              marker_x = EXCLUDED.marker_x,
              marker_y = EXCLUDED.marker_y,
              updated_at = NOW()
          `,
          [current.floorId, unitId, payload.marker.x, payload.marker.y, req.user.id]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      if (error && typeof error === 'object' && error.code === '23505') {
        return res.status(409).json({ error: 'Unit number must be unique per floor.' });
      }
      throw error;
    } finally {
      client.release();
    }

    const updated = await fetchUnitById(unitId);
    return res.json({ unit: updated });
  } catch (error) {
    return next(error);
  }
}

export async function listUnits(req, res, next) {
  try {
    const query = listUnitsQuerySchema.parse({
      buildingId: req.query.buildingId,
      floorId: req.query.floorId,
      status: req.query.status,
      unitType: req.query.unitType,
      category: req.query.category,
      listingType: req.query.listingType,
      areaMin: req.query.areaMin,
      areaMax: req.query.areaMax,
      priceMin: req.query.priceMin,
      priceMax: req.query.priceMax,
      q: req.query.q,
      limit: req.query.limit,
    });

    if (query.areaMin !== undefined && query.areaMax !== undefined && query.areaMin > query.areaMax) {
      return res.status(400).json({ error: 'areaMin cannot be greater than areaMax' });
    }
    if (query.priceMin !== undefined && query.priceMax !== undefined && query.priceMin > query.priceMax) {
      return res.status(400).json({ error: 'priceMin cannot be greater than priceMax' });
    }

    const where = ['1 = 1'];
    const values = [];
    const priceExpr =
      "CASE u.listing_type WHEN 'Rent' THEN COALESCE(u.rent_amount, 0) WHEN 'Sale' THEN COALESCE(u.sale_price, 0) ELSE COALESCE(u.lease_amount, 0) END";

    if (query.buildingId) {
      values.push(query.buildingId);
      where.push(`f.building_id = $${values.length}`);
    }
    if (query.floorId) {
      values.push(query.floorId);
      where.push(`u.floor_id = $${values.length}`);
    }
    if (query.status !== 'all') {
      values.push(query.status);
      where.push(`u.status = $${values.length}`);
    }
    if (query.unitType !== 'all') {
      values.push(query.unitType);
      where.push(`u.unit_type = $${values.length}`);
    }
    if (query.category !== 'all') {
      values.push(query.category);
      where.push(`u.category = $${values.length}`);
    }
    if (query.listingType !== 'all') {
      values.push(query.listingType);
      where.push(`u.listing_type = $${values.length}`);
    }
    if (query.areaMin !== undefined) {
      values.push(query.areaMin);
      where.push(`u.area_covered >= $${values.length}`);
    }
    if (query.areaMax !== undefined) {
      values.push(query.areaMax);
      where.push(`u.area_covered <= $${values.length}`);
    }
    if (query.priceMin !== undefined) {
      values.push(query.priceMin);
      where.push(`${priceExpr} >= $${values.length}`);
    }
    if (query.priceMax !== undefined) {
      values.push(query.priceMax);
      where.push(`${priceExpr} <= $${values.length}`);
    }
    if (query.q) {
      values.push(`%${query.q}%`);
      where.push(
        `(u.unit_number ILIKE $${values.length} OR p.project_name ILIKE $${values.length} OR f.floor_name ILIKE $${values.length})`
      );
    }

    values.push(query.limit);
    const rows = await pool.query(
      `
        ${selectUnitFields}
        WHERE ${where.join(' AND ')}
        GROUP BY
          u.id,
          f.floor_number,
          f.floor_name,
          f.building_id,
          p.project_name
        ORDER BY u.updated_at DESC, u.id DESC
        LIMIT $${values.length}
      `,
      values
    );

    return res.json({
      units: rows.rows.map(mapUnitRow),
    });
  } catch (error) {
    return next(error);
  }
}

export async function upsertLayoutMarkers(req, res, next) {
  try {
    const floorId = Number(req.params.floorId);
    if (!Number.isFinite(floorId) || floorId <= 0) {
      return res.status(400).json({ error: 'Invalid floor id' });
    }

    const floor = await assertFloorExists(floorId);
    if (!floor) {
      return res.status(404).json({ error: 'Floor not found' });
    }

    const payload = markerUpsertSchema.parse(req.body || {});
    const unitIds = payload.markers.map((marker) => marker.unitId);
    const units = await pool.query(
      'SELECT id FROM units WHERE floor_id = $1 AND id = ANY($2::BIGINT[])',
      [floorId, unitIds]
    );
    if (units.rowCount !== unitIds.length) {
      return res.status(400).json({ error: 'Every marker must map to a unit on the selected floor.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const marker of payload.markers) {
        await client.query(
          `
            INSERT INTO layout_markers (floor_id, unit_id, marker_x, marker_y, created_by_user_id)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (floor_id, unit_id)
            DO UPDATE SET
              marker_x = EXCLUDED.marker_x,
              marker_y = EXCLUDED.marker_y,
              updated_at = NOW()
          `,
          [floorId, marker.unitId, marker.x, marker.y, req.user.id]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const result = await pool.query(
      `
        SELECT
          lm.id,
          lm.floor_id,
          lm.unit_id,
          lm.marker_x,
          lm.marker_y,
          lm.created_at,
          lm.updated_at,
          u.unit_number,
          u.unit_type,
          u.status
        FROM layout_markers lm
        JOIN units u
          ON u.id = lm.unit_id
        WHERE lm.floor_id = $1
        ORDER BY u.unit_number ASC
      `,
      [floorId]
    );

    return res.status(201).json({
      markers: result.rows.map((row) => ({
        id: Number(row.id),
        floorId: Number(row.floor_id),
        unitId: Number(row.unit_id),
        x: Number(row.marker_x),
        y: Number(row.marker_y),
        unitNumber: row.unit_number,
        unitType: row.unit_type,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    return next(error);
  }
}

export async function listLayoutMarkers(req, res, next) {
  try {
    const floorId = Number(req.params.floorId);
    if (!Number.isFinite(floorId) || floorId <= 0) {
      return res.status(400).json({ error: 'Invalid floor id' });
    }

    const floor = await assertFloorExists(floorId);
    if (!floor) {
      return res.status(404).json({ error: 'Floor not found' });
    }

    const result = await pool.query(
      `
        SELECT
          lm.id,
          lm.floor_id,
          lm.unit_id,
          lm.marker_x,
          lm.marker_y,
          lm.created_at,
          lm.updated_at,
          u.unit_number,
          u.unit_type,
          u.status
        FROM layout_markers lm
        JOIN units u
          ON u.id = lm.unit_id
        WHERE lm.floor_id = $1
        ORDER BY u.unit_number ASC
      `,
      [floorId]
    );

    return res.json({
      markers: result.rows.map((row) => ({
        id: Number(row.id),
        floorId: Number(row.floor_id),
        unitId: Number(row.unit_id),
        x: Number(row.marker_x),
        y: Number(row.marker_y),
        unitNumber: row.unit_number,
        unitType: row.unit_type,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    return next(error);
  }
}
