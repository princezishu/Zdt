import {
  createSupabaseUserDbClient,
  getSupabaseAdminDbClient,
  getSupabasePublicDbClient,
  hasSupabaseAdminCredentials,
} from '../config/supabase.js';
import { pool } from '../db.js';

const PROPERTY_SELECT_COLUMNS = [
  'id',
  'company_id',
  'project_id',
  'title',
  'property_type',
  'listing_type',
  'price',
  'price_per_sqft',
  'rent_per_month',
  'rent_deposit',
  'state',
  'city',
  'area',
  'locality',
  'address',
  'full_address',
  'landmark',
  'latitude',
  'longitude',
  'area_sqft',
  'carpet_area',
  'builtup_area',
  'super_builtup_area',
  'bedrooms',
  'bathrooms',
  'floor_number',
  'total_floors',
  'facing',
  'is_corner',
  'is_vaastu',
  'possession_status',
  'rera_number',
  'furnishing',
  'is_negotiable',
  'is_prelaunch',
  'is_verified',
  'is_featured',
  'view_count',
  'availability_date',
  'image_urls',
  'description',
  'layout_details',
  'posted_by',
  'created_by_user_id',
  'created_at',
  'updated_at',
].join(', ');

const PROPERTY_ME_COLUMNS = [
  'id',
  'name',
  'email',
  'phone',
  'role',
  'company_role',
  'account_type',
  'subscription_tier',
  'is_main_admin',
  'force_password_reset',
  'managed_auth_provider',
  'managed_auth_only',
  'created_at',
].join(', ');

const ACTIVE_GROUP_DEAL_STATUSES = ['ACTIVE', 'MIN_REACHED', 'CONFIRMED', 'FULL'];

export class SupabaseDatabaseError extends Error {
  constructor(message, { status = 500, code = 'supabase_database_error', cause = null } = {}) {
    super(message);
    this.name = 'SupabaseDatabaseError';
    this.status = status;
    this.code = code;
    this.cause = cause;
  }
}

function getReadClient() {
  return getSupabaseAdminDbClient() || getSupabasePublicDbClient();
}

function getWriteClient({ authStrategy = '', accessToken = '' } = {}) {
  if (authStrategy === 'managed' && String(accessToken || '').trim()) {
    return createSupabaseUserDbClient(accessToken);
  }

  return getSupabaseAdminDbClient() || getSupabasePublicDbClient();
}

function assertResult(result, context) {
  if (!result?.error) {
    return result;
  }

  throw new SupabaseDatabaseError(result.error.message || `${context} failed.`, {
    status: Number(result.status || 502),
    code: typeof result.error.code === 'string' && result.error.code ? result.error.code : 'supabase_query_failed',
    cause: result.error,
  });
}

function isMissingSchemaTableError(error, tableName) {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').trim();
  if (code !== 'PGRST205' || !tableName) {
    return false;
  }

  return message.includes(`public.${tableName}`);
}

function readOptionalRows(result, context, { tableName, fallback = [] } = {}) {
  if (!result?.error) {
    return result.data || fallback;
  }

  if (isMissingSchemaTableError(result.error, tableName)) {
    return fallback;
  }

  return assertResult(result, context).data || fallback;
}

function normalizeAmenityFilters(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  return source
    .map((item) =>
      String(item || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    )
    .filter(Boolean);
}

function toNumberKey(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function loadCompanyRowsFallback(companyIds) {
  if (!Array.isArray(companyIds) || companyIds.length === 0) {
    return [];
  }

  const result = await pool.query(
    `
      SELECT id, name, company_type, logo_url, is_verified
      FROM companies
      WHERE id = ANY($1::BIGINT[])
    `,
    [companyIds]
  );

  return result.rows || [];
}

async function resolveAmenityFilteredPropertyIds(client, amenityFilters) {
  if (!Array.isArray(amenityFilters) || amenityFilters.length === 0) {
    return null;
  }

  const amenityResult = await client.from('amenities').select('id, slug').in('slug', amenityFilters);
  const amenityRows = assertResult(amenityResult, 'loading amenity filters').data || [];
  if (amenityRows.length !== amenityFilters.length) {
    return [];
  }

  const amenityIds = amenityRows
    .map((row) => toNumberKey(row.id))
    .filter((value) => value > 0);
  if (amenityIds.length !== amenityFilters.length) {
    return [];
  }

  const linkResult = await client
    .from('property_amenities')
    .select('property_id, amenity_id')
    .in('amenity_id', amenityIds);
  const linkRows = assertResult(linkResult, 'loading property amenity matches').data || [];

  const matchesByProperty = new Map();
  for (const row of linkRows) {
    const propertyId = toNumberKey(row.property_id);
    const amenityId = toNumberKey(row.amenity_id);
    if (!propertyId || !amenityId) {
      continue;
    }
    if (!matchesByProperty.has(propertyId)) {
      matchesByProperty.set(propertyId, new Set());
    }
    matchesByProperty.get(propertyId).add(amenityId);
  }

  return Array.from(matchesByProperty.entries())
    .filter(([, matchedIds]) => matchedIds.size === amenityIds.length)
    .map(([propertyId]) => propertyId);
}

function applyPropertyFilters(queryBuilder, query, amenityPropertyIds) {
  let builder = queryBuilder;

  if (Array.isArray(amenityPropertyIds)) {
    if (amenityPropertyIds.length === 0) {
      return null;
    }
    builder = builder.in('id', amenityPropertyIds);
  }

  if (query.companyId) {
    builder = builder.eq('company_id', query.companyId);
  }

  if (query.listingType && query.listingType !== 'all') {
    builder = builder.eq('listing_type', query.listingType);
  }

  if (query.city) {
    builder = builder.ilike('city', `%${query.city}%`);
  }

  if (query.locality) {
    builder = builder.or(`locality.ilike.%${query.locality}%,area.ilike.%${query.locality}%`);
  }

  if (query.minPrice !== undefined) {
    builder = builder.gte('price', query.minPrice);
  }

  if (query.maxPrice !== undefined) {
    builder = builder.lte('price', query.maxPrice);
  }

  if (query.minPricePerSqft !== undefined) {
    builder = builder.gte('price_per_sqft', query.minPricePerSqft);
  }

  if (query.maxPricePerSqft !== undefined) {
    builder = builder.lte('price_per_sqft', query.maxPricePerSqft);
  }

  if (query.bhk) {
    const normalizedBhk = String(query.bhk || '').trim().toLowerCase();
    if (normalizedBhk === 'studio') {
      builder = builder.or('property_type.eq.Studio,bedrooms.eq.0');
    } else if (normalizedBhk.includes('+')) {
      const base = Number(normalizedBhk.replace('+', ''));
      if (Number.isFinite(base)) {
        builder = builder.gte('bedrooms', base);
      }
    } else {
      const bhkNumber = Number(normalizedBhk);
      if (Number.isFinite(bhkNumber)) {
        builder = builder.eq('bedrooms', bhkNumber);
      }
    }
  }

  if (query.type) {
    const types = String(query.type || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (types.length > 0) {
      builder = builder.in('property_type', types);
    }
  }

  if (query.facing) {
    builder = builder.ilike('facing', query.facing);
  }

  if (query.corner === 'true') {
    builder = builder.eq('is_corner', true);
  }

  if (query.vastu === 'true') {
    builder = builder.eq('is_vaastu', true);
  }

  if (query.negotiable === 'true') {
    builder = builder.eq('is_negotiable', true);
  }

  if (query.prelaunch === 'true') {
    builder = builder.eq('is_prelaunch', true);
  }

  if (query.verifiedOnly === 'true') {
    builder = builder.eq('is_verified', true);
  }

  if (query.minCarpetArea !== undefined) {
    builder = builder.gte('carpet_area', query.minCarpetArea);
  }

  if (query.maxCarpetArea !== undefined) {
    builder = builder.lte('carpet_area', query.maxCarpetArea);
  }

  if (query.minBuiltupArea !== undefined) {
    builder = builder.gte('builtup_area', query.minBuiltupArea);
  }

  if (query.maxBuiltupArea !== undefined) {
    builder = builder.lte('builtup_area', query.maxBuiltupArea);
  }

  if (query.minSuperBuiltupArea !== undefined) {
    builder = builder.gte('super_builtup_area', query.minSuperBuiltupArea);
  }

  if (query.maxSuperBuiltupArea !== undefined) {
    builder = builder.lte('super_builtup_area', query.maxSuperBuiltupArea);
  }

  return builder;
}

function applyPropertySort(queryBuilder, sort) {
  let builder = queryBuilder;

  if (sort === 'price_low') {
    builder = builder.order('price', { ascending: true, nullsFirst: false });
  } else if (sort === 'price_high') {
    builder = builder.order('price', { ascending: false, nullsFirst: false });
  } else if (sort === 'verified') {
    builder = builder.order('is_verified', { ascending: false });
  } else if (sort === 'most_viewed') {
    builder = builder.order('view_count', { ascending: false });
  } else if (sort === 'recommended') {
    builder = builder.order('is_featured', { ascending: false });
    builder = builder.order('is_verified', { ascending: false });
    builder = builder.order('view_count', { ascending: false });
  }

  builder = builder.order('created_at', { ascending: false });
  return builder;
}

async function enrichPropertyRows(client, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const propertyIds = rows
    .map((row) => toNumberKey(row.id))
    .filter((value) => value > 0);
  const companyIds = Array.from(
    new Set(rows.map((row) => toNumberKey(row.company_id)).filter((value) => value > 0))
  );

  const companyPromise =
    companyIds.length > 0
      ? client
          .from('companies')
          .select('id, name, company_type, logo_url, is_verified')
          .in('id', companyIds)
      : Promise.resolve({ data: [], error: null, status: 200 });

  const propertyAmenityPromise =
    propertyIds.length > 0
      ? client
          .from('property_amenities')
          .select('property_id, amenity_id')
          .in('property_id', propertyIds)
      : Promise.resolve({ data: [], error: null, status: 200 });

  const groupDealPromise =
    propertyIds.length > 0
      ? client
          .from('group_deals')
          .select('property_id, deal_code, status, created_at, id')
          .in('property_id', propertyIds)
          .in('status', ACTIVE_GROUP_DEAL_STATUSES)
          .gte('valid_until', new Date().toISOString())
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
      : Promise.resolve({ data: [], error: null, status: 200 });

  const [companyResult, propertyAmenityResult, groupDealResult] = await Promise.all([
    companyPromise,
    propertyAmenityPromise,
    groupDealPromise,
  ]);

  let companyRows = assertResult(companyResult, 'loading companies').data || [];
  const propertyAmenityRows =
    assertResult(propertyAmenityResult, 'loading property amenities').data || [];
  const groupDealRows = readOptionalRows(groupDealResult, 'loading group deals', {
    tableName: 'group_deals',
  });

  if (companyRows.length < companyIds.length) {
    const knownCompanyIds = new Set(companyRows.map((row) => toNumberKey(row.id)).filter((value) => value > 0));
    const missingCompanyIds = companyIds.filter((companyId) => !knownCompanyIds.has(companyId));
    if (missingCompanyIds.length > 0) {
      companyRows = companyRows.concat(await loadCompanyRowsFallback(missingCompanyIds));
    }
  }

  const amenityIds = Array.from(
    new Set(propertyAmenityRows.map((row) => toNumberKey(row.amenity_id)).filter((value) => value > 0))
  );
  const amenityResult =
    amenityIds.length > 0
      ? await client.from('amenities').select('id, name').in('id', amenityIds)
      : { data: [], error: null, status: 200 };
  const amenityRows = assertResult(amenityResult, 'loading amenity details').data || [];

  const companyMap = new Map(companyRows.map((row) => [toNumberKey(row.id), row]));
  const amenityMap = new Map(amenityRows.map((row) => [toNumberKey(row.id), row]));

  const amenitiesByProperty = new Map();
  for (const row of propertyAmenityRows) {
    const propertyId = toNumberKey(row.property_id);
    const amenityId = toNumberKey(row.amenity_id);
    const amenityRow = amenityMap.get(amenityId);
    if (!propertyId || !amenityRow?.name) {
      continue;
    }
    if (!amenitiesByProperty.has(propertyId)) {
      amenitiesByProperty.set(propertyId, []);
    }
    amenitiesByProperty.get(propertyId).push(amenityRow.name);
  }

  const companyPropertyCountEntries = await Promise.all(
    companyIds.map(async (companyId) => {
      const countResult = await client
        .from('properties')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId);
      assertResult(countResult, `counting properties for company ${companyId}`);
      return [companyId, Number(countResult.count || 0)];
    })
  );
  const companyPropertyCountMap = new Map(companyPropertyCountEntries);

  const activeGroupDealMap = new Map();
  for (const row of groupDealRows) {
    const propertyId = toNumberKey(row.property_id);
    if (!propertyId || activeGroupDealMap.has(propertyId)) {
      continue;
    }
    activeGroupDealMap.set(propertyId, row);
  }

  return rows.map((row) => {
    const propertyId = toNumberKey(row.id);
    const companyId = toNumberKey(row.company_id);
    const companyRow = companyMap.get(companyId);
    const activeGroupDeal = activeGroupDealMap.get(propertyId);

    return {
      ...row,
      company_name: companyRow?.name || '',
      company_type: companyRow?.company_type || '',
      company_logo_url: companyRow?.logo_url || '',
      company_verified: Boolean(companyRow?.is_verified),
      company_property_count: Number(companyPropertyCountMap.get(companyId) || 0),
      active_group_deal_code: activeGroupDeal?.deal_code || '',
      active_group_deal_status: activeGroupDeal?.status || '',
      amenities: amenitiesByProperty.get(propertyId) || [],
    };
  });
}

export async function listPropertiesViaSupabase(query) {
  if (!hasSupabaseAdminCredentials()) {
    return null;
  }

  const client = getReadClient();
  if (!client) {
    return null;
  }

  const normalizedBhk = String(query.bhk || '').trim().toLowerCase();
  if (query.locality && normalizedBhk === 'studio') {
    return null;
  }

  const page = Math.max(1, Number(query.page || 1) || 1);
  const limit = Math.max(1, Number(query.limit || 24) || 24);
  const offset = (page - 1) * limit;
  const amenityFilters = normalizeAmenityFilters(query.amenities);
  const amenityPropertyIds = await resolveAmenityFilteredPropertyIds(client, amenityFilters);

  let builder = client.from('properties').select(PROPERTY_SELECT_COLUMNS, { count: 'exact' });
  builder = applyPropertyFilters(builder, query, amenityPropertyIds);
  if (!builder) {
    return {
      properties: [],
      total: 0,
      page,
      pageSize: limit,
    };
  }

  builder = applyPropertySort(builder, query.sort);
  builder = builder.range(offset, offset + limit - 1);

  const result = await builder;
  const rows = assertResult(result, 'listing properties').data || [];
  const enrichedRows = await enrichPropertyRows(client, rows);

  return {
    properties: enrichedRows,
    total: Number(result.count || 0),
    page,
    pageSize: limit,
  };
}

export async function fetchPropertyDetailsViaSupabase(propertyId, { incrementViewCount = false } = {}) {
  if (!hasSupabaseAdminCredentials()) {
    return null;
  }

  const client = getReadClient();
  if (!client) {
    return null;
  }

  const propertyResult = await client
    .from('properties')
    .select(PROPERTY_SELECT_COLUMNS)
    .eq('id', propertyId)
    .maybeSingle();
  const propertyRow = assertResult(propertyResult, 'loading property').data;
  if (!propertyRow) {
    return {
      property: null,
      priceHistory: [],
    };
  }

  const [enrichedRows, priceHistoryResult] = await Promise.all([
    enrichPropertyRows(client, [propertyRow]),
    client
      .from('property_price_history_market')
      .select('previous_price, next_price, created_at')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false })
      .limit(12),
  ]);

  const priceHistoryRows = assertResult(priceHistoryResult, 'loading property price history').data || [];
  const enrichedRow = enrichedRows[0] || propertyRow;
  const writeClient = getWriteClient();
  if (incrementViewCount && writeClient) {
    const nextViewCount = Number(enrichedRow.view_count || 0) + 1;
    enrichedRow.view_count = nextViewCount;
    await assertResult(
      await writeClient.from('properties').update({ view_count: nextViewCount }).eq('id', propertyId),
      'updating property view count'
    );
  }

  return {
    property: {
      ...enrichedRow,
      company: {
        id: toNumberKey(enrichedRow.company_id),
        name: enrichedRow.company_name || '',
        logoUrl: enrichedRow.company_logo_url || '',
        isVerified: Boolean(enrichedRow.company_verified),
      },
    },
    priceHistory: priceHistoryRows.map((row) => ({
      previousPrice: row.previous_price === null ? null : Number(row.previous_price),
      nextPrice: Number(row.next_price || 0),
      createdAt: row.created_at || null,
    })),
  };
}

export async function createPropertyViaSupabase({
  companyId,
  payload,
  amenityIds,
  userId,
  authStrategy = '',
  accessToken = '',
}) {
  const client = getWriteClient({
    authStrategy,
    accessToken,
  });
  if (!client) {
    return null;
  }

  const companyResult = await client.from('companies').select('id').eq('id', companyId).maybeSingle();
  const companyRow = assertResult(companyResult, 'loading company').data;
  if (!companyRow) {
    throw new SupabaseDatabaseError('Company not found', {
      status: 404,
      code: 'company_not_found',
    });
  }

  if (payload.projectId) {
    const projectResult = await client
      .from('projects')
      .select('id')
      .eq('id', payload.projectId)
      .eq('company_id', companyId)
      .maybeSingle();
    const projectRow = assertResult(projectResult, 'loading project').data;
    if (!projectRow) {
      throw new SupabaseDatabaseError('projectId does not belong to this company', {
        status: 400,
        code: 'invalid_project_company',
      });
    }
  }

  if (amenityIds.length > 0) {
    const amenityResult = await client.from('amenities').select('id').in('id', amenityIds);
    const amenityRows = assertResult(amenityResult, 'loading amenity ids').data || [];
    if (amenityRows.length !== amenityIds.length) {
      throw new SupabaseDatabaseError('One or more amenity ids are invalid', {
        status: 400,
        code: 'invalid_amenity_ids',
      });
    }
  }

  const insertResult = await client
    .from('properties')
    .insert({
      company_id: companyId,
      project_id: payload.projectId || null,
      title: payload.title,
      property_type: payload.propertyType,
      listing_type: payload.listingType,
      price: payload.price ?? null,
      price_per_sqft: payload.pricePerSqft ?? null,
      rent_per_month: payload.rentPerMonth ?? null,
      rent_deposit: payload.rentDeposit ?? null,
      state: payload.state,
      city: payload.city,
      area: payload.area,
      locality: payload.locality || '',
      address: payload.address || '',
      full_address: payload.fullAddress,
      landmark: payload.landmark || '',
      latitude: payload.latitude ?? null,
      longitude: payload.longitude ?? null,
      area_sqft: payload.areaSqft ?? null,
      carpet_area: payload.carpetArea ?? null,
      builtup_area: payload.builtupArea ?? null,
      super_builtup_area: payload.superBuiltupArea ?? null,
      bedrooms: payload.bedrooms ?? null,
      bathrooms: payload.bathrooms ?? null,
      floor_number: payload.floorNumber ?? null,
      total_floors: payload.totalFloors ?? null,
      facing: payload.facing || 'NA',
      is_corner: Boolean(payload.isCorner),
      is_vaastu: Boolean(payload.isVaastu),
      possession_status: payload.possessionStatus || 'ready',
      rera_number: payload.reraNumber || '',
      furnishing: payload.furnishing || 'na',
      is_negotiable: Boolean(payload.isNegotiable),
      is_prelaunch: Boolean(payload.isPrelaunch),
      is_verified: Boolean(payload.isVerified),
      is_featured: Boolean(payload.isFeatured),
      availability_date: payload.availabilityDate || null,
      image_urls: payload.imageUrls || [],
      description: payload.description || '',
      layout_details: payload.layoutDetails || { floors: [] },
      posted_by: userId,
      created_by_user_id: userId,
    })
    .select('id')
    .single();
  const insertedRow = assertResult(insertResult, 'creating property').data;
  const insertedPropertyId = toNumberKey(insertedRow.id);

  try {
    if (amenityIds.length > 0) {
      await assertResult(
        await client.from('property_amenities').insert(
          amenityIds.map((amenityId) => ({
            property_id: insertedPropertyId,
            amenity_id: amenityId,
          }))
        ),
        'creating property amenities'
      );
    }

    const created = await fetchPropertyDetailsViaSupabase(insertedPropertyId);
    if (created?.property) {
      return created.property;
    }

    const fallbackResult = await client
      .from('properties')
      .select(PROPERTY_SELECT_COLUMNS)
      .eq('id', insertedPropertyId)
      .maybeSingle();
    const fallbackRow = assertResult(fallbackResult, 'reloading created property').data;
    if (!fallbackRow) {
      return null;
    }

    const enrichedRows = await enrichPropertyRows(client, [fallbackRow]);
    const enrichedRow = enrichedRows[0] || fallbackRow;
    return {
      ...enrichedRow,
      company: {
        id: toNumberKey(enrichedRow.company_id),
        name: enrichedRow.company_name || '',
        logoUrl: enrichedRow.company_logo_url || '',
        isVerified: Boolean(enrichedRow.company_verified),
      },
    };
  } catch (error) {
    throw new SupabaseDatabaseError(
      'Property was created in Supabase, but follow-up processing failed.',
      {
        status: 502,
        code: 'supabase_partial_write',
        cause: error,
      }
    );
  }
}

export async function fetchAuthMeUserViaSupabase(userId) {
  if (!hasSupabaseAdminCredentials()) {
    return null;
  }

  const client = getWriteClient();
  if (!client) {
    return null;
  }

  const result = await client.from('users').select(PROPERTY_ME_COLUMNS).eq('id', userId).maybeSingle();
  const row = assertResult(result, 'loading authenticated user').data;
  return row || null;
}
