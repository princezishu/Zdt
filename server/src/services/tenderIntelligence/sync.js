import crypto from 'crypto';

const OFFICIAL_PORTAL_SOURCE_KEYS = new Set([
  'CPPP_EPROCURE',
  'GEM_BIDS',
  'KARNATAKA_KPPP',
  'ETENDERS_GOV',
]);

const INFRA_KEYWORDS = [
  'road',
  'highway',
  'bridge',
  'flyover',
  'bypass',
  'ring road',
  'metro',
  'rail',
  'railway',
  'airport',
  'port',
  'water',
  'sewer',
  'drainage',
  'urban',
  'power',
  'electric',
  'substation',
  'transmission',
  'housing',
  'industrial',
  'logistics',
  'hospital',
  'college',
  'school',
  'expressway',
  'infrastructure',
  'tender',
  'bid',
  'contract',
  'work',
  'construction',
  'maintenance',
  'gati shakti',
  'smart city',
];

const INDIA_STATE_NAMES = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
];

const PORTAL_DATE_TOKEN_REGEX = /\b\d{1,2}-[A-Za-z]{3}-\d{4}(?:\s+\d{1,2}:\d{2}\s+[AP]M)?\b/g;
const MONTH_INDEX = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeLower(value) {
  return normalizeSpace(value).toLowerCase();
}

function compactText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function includesInfraKeyword(text) {
  const normalized = normalizeLower(text);
  return INFRA_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function isOfficialHost(sourceUrl) {
  const raw = normalizeSpace(sourceUrl);
  if (!raw) return false;

  try {
    const host = new URL(raw).hostname.toLowerCase();
    return (
      host.endsWith('.gov.in') ||
      host.endsWith('.nic.in') ||
      host.includes('.gov.') ||
      host.includes('.nic.') ||
      host.endsWith('gem.gov.in')
    );
  } catch {
    return false;
  }
}

function dateToTimestamp(value) {
  const raw = normalizeSpace(value);
  if (!raw) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00.000Z` : raw;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function mapImpactScore(level) {
  const normalized = normalizeSpace(level).toUpperCase();
  if (normalized === 'HIGH') return 90;
  if (normalized === 'MEDIUM') return 65;
  if (normalized === 'LOW') return 35;
  return 0;
}

function detectSourceType(update) {
  const verificationLevel = normalizeSpace(update?.verificationLevel).toUpperCase();
  const text = normalizeLower(
    `${update?.projectName || ''} ${update?.statusText || ''} ${update?.projectType || ''}`
  );

  if (/\b(award|awarded|contract awarded|letter of acceptance|loa)\b/.test(text)) {
    return 'award';
  }
  if (verificationLevel === 'TENDER' || /\b(tender|bid|e-procurement|eprocurement)\b/.test(text)) {
    return 'government_tender';
  }
  return 'government_notice';
}

function detectSourceKey(update) {
  const sourceRef = normalizeLower(update?.sourceRef);
  const sourceUrl = normalizeLower(update?.sourceUrl);
  const hostKey = compactText(`${sourceRef} ${sourceUrl}`);

  if (
    hostKey.includes('eprocuregovin') ||
    hostKey.includes('cppp') ||
    sourceRef.includes('eprocure')
  ) {
    return 'CPPP_EPROCURE';
  }
  if (hostKey.includes('gemgovin') || sourceRef === 'gem' || sourceRef.includes('government e marketplace')) {
    return 'GEM_BIDS';
  }
  if (hostKey.includes('kpppkarnatakagovin') || sourceRef.includes('kppp')) {
    return 'KARNATAKA_KPPP';
  }
  if (hostKey.includes('pibgovin') || sourceRef === 'pib') {
    return 'PIB_INFRA';
  }
  if (isOfficialHost(update?.sourceUrl)) {
    return 'INFRA_LEGACY_PUBLIC';
  }
  return 'INFRA_LEGACY_PUBLIC';
}

function detectSourceName(sourceKey, sourceRef) {
  if (sourceKey === 'CPPP_EPROCURE') return 'Central Public Procurement Portal (CPPP / eProcure)';
  if (sourceKey === 'GEM_BIDS') return 'Government e Marketplace (GeM) Bids';
  if (sourceKey === 'KARNATAKA_KPPP') return 'Karnataka Public Procurement Portal (KPPP)';
  if (sourceKey === 'PIB_INFRA') return 'Press Information Bureau Infrastructure Announcements';
  return normalizeSpace(sourceRef) || 'Legacy Public Infrastructure Feed';
}

function mapVerificationLevel(update, sourceKey, sourceType) {
  const verificationLevel = normalizeSpace(update?.verificationLevel).toUpperCase();
  const officialHost = isOfficialHost(update?.sourceUrl);

  if (sourceKey === 'PIB_INFRA' || verificationLevel === 'PUBLIC_NOTICE') {
    return 'PUBLIC_NOTICE_PRESS_RELEASE';
  }
  if (OFFICIAL_PORTAL_SOURCE_KEYS.has(sourceKey) || sourceType === 'government_tender') {
    return 'OFFICIAL_PORTAL';
  }
  if (officialHost) {
    return 'OFFICIAL_DEPARTMENT_SITE';
  }
  if (verificationLevel === 'SOURCE_ONLY') {
    return 'UNKNOWN';
  }
  return 'UNKNOWN';
}

function buildRecordHash(update, sourceKey, sourceType) {
  const payload = [
    `infra_update:${update.id}`,
    sourceKey,
    sourceType,
    normalizeLower(update.projectName),
    normalizeLower(update.statusText),
    normalizeLower(update.state),
    normalizeLower(update.district),
    normalizeLower(update.lastUpdated),
    normalizeLower(update.verificationLevel),
  ].join('||');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function buildNormalizedText(update) {
  return normalizeSpace(
    [
      update.projectName,
      update.statusText,
      update.projectType,
      update.authority,
      update.state,
      update.district,
      Array.isArray(update.cities) ? update.cities.join(', ') : '',
    ].join(' | ')
  );
}

function parsePortalDateToken(value) {
  const raw = normalizeSpace(value);
  if (!raw) return null;

  const matched = raw.match(
    /^(\d{1,2})-([A-Za-z]{3})-(\d{4})(?:\s+(\d{1,2}):(\d{2})\s+([AP]M))?$/i
  );
  if (!matched) return null;

  const [, dayText, monthText, yearText, hourText, minuteText, meridiem] = matched;
  const monthIndex = MONTH_INDEX[String(monthText || '').toLowerCase()];
  if (!Number.isInteger(monthIndex)) return null;

  let hours = Number(hourText || 0);
  const minutes = Number(minuteText || 0);
  if (meridiem) {
    const normalizedMeridiem = meridiem.toUpperCase();
    if (normalizedMeridiem === 'PM' && hours < 12) hours += 12;
    if (normalizedMeridiem === 'AM' && hours === 12) hours = 0;
  }

  const parsed = new Date(
    Date.UTC(Number(yearText), monthIndex, Number(dayText), hours, minutes, 0, 0)
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function extractPortalDateTokens(text) {
  return Array.from(new Set(String(text || '').match(PORTAL_DATE_TOKEN_REGEX) || []));
}

function inferStateFromText(text) {
  const normalized = normalizeLower(text);
  if (!normalized) return null;

  const sortedStates = [...INDIA_STATE_NAMES].sort((left, right) => right.length - left.length);
  for (const stateName of sortedStates) {
    if (normalized.includes(normalizeLower(stateName))) {
      return stateName;
    }
  }

  return null;
}

function inferWorkTypeFromText(text) {
  const normalized = normalizeLower(text);
  if (!normalized) return null;
  if (/\b(highway|expressway|bypass|ring road|road widening|road improvement|connector road)\b/.test(normalized)) {
    return 'Road and Highway Works';
  }
  if (/\b(bridge|flyover)\b/.test(normalized)) {
    return 'Bridge and Flyover Works';
  }
  if (/\b(substation|transmission|power|electrical|hvac|air conditioning)\b/.test(normalized)) {
    return 'Power and Electrical Infrastructure';
  }
  if (/\b(water|sewer|sewage|drainage)\b/.test(normalized)) {
    return 'Water and Drainage Infrastructure';
  }
  if (/\b(port|cargo|berth)\b/.test(normalized)) {
    return 'Port and Logistics Infrastructure';
  }
  if (/\b(housing|building|roofing|shed|furnishing|civil work|structural)\b/.test(normalized)) {
    return 'Building and Civil Works';
  }
  if (/\b(maintenance|repair|restoration)\b/.test(normalized)) {
    return 'Maintenance and Repair Works';
  }
  return 'Public Infrastructure Tender';
}

function inferImpactScoreFromText(text) {
  const normalized = normalizeLower(text);
  if (!normalized) return 35;
  if (
    /\b(highway|expressway|airport|port|metro|ring road|bypass|substation|transmission|industrial|logistics|housing|water)\b/.test(
      normalized
    )
  ) {
    return 90;
  }
  if (/\b(road|bridge|electrical|drainage|building|civil|construction|maintenance|repair)\b/.test(normalized)) {
    return 65;
  }
  return 35;
}

function inferTenderStatusFromDates(bidEndAt, openingAt) {
  const now = Date.now();

  if (bidEndAt) {
    const bidEndTime = new Date(bidEndAt).getTime();
    if (!Number.isNaN(bidEndTime)) {
      const diffMs = bidEndTime - now;
      if (diffMs < 0) return 'CLOSED';
      if (diffMs <= 3 * 24 * 60 * 60 * 1000) return 'CLOSING_SOON';
    }
  }

  if (openingAt) {
    const openingTime = new Date(openingAt).getTime();
    if (!Number.isNaN(openingTime)) {
      const diffMs = openingTime - now;
      if (diffMs >= 0 && diffMs <= 3 * 24 * 60 * 60 * 1000) {
        return 'OPENING_SOON';
      }
    }
  }

  return 'LIVE';
}

function getIngestSourceConfig(infraIngestItem) {
  const raw = infraIngestItem?.raw || {};
  const sourceType = normalizeSpace(raw?.sourceType).toUpperCase();

  if (sourceType === 'EPROCURE') {
    return {
      sourceKey: 'CPPP_EPROCURE',
      sourceType: 'government_tender',
      sourceName: 'Central Public Procurement Portal (CPPP / eProcure)',
      registrySourceUrl: 'https://eprocure.gov.in/eprocure/app',
      verificationLevel: 'OFFICIAL_PORTAL',
      collectionMethod: 'html',
      coverageScope: 'national',
      notes: 'Auto-synced from infra_ingest_items national eProcure listings.',
    };
  }

  if (sourceType === 'ETENDERS') {
    return {
      sourceKey: 'ETENDERS_GOV',
      sourceType: 'government_tender',
      sourceName: 'Government eTenders Listings',
      registrySourceUrl: 'https://etenders.gov.in/eprocure/app',
      verificationLevel: 'OFFICIAL_PORTAL',
      collectionMethod: 'html',
      coverageScope: 'national',
      notes: 'Auto-synced from infra_ingest_items eTenders listings.',
    };
  }

  if (sourceType === 'PPP_INDIA') {
    return {
      sourceKey: 'PPP_INDIA_LISTINGS',
      sourceType: 'government_notice',
      sourceName: 'PPP India Infrastructure Listings',
      registrySourceUrl: 'https://www.pppinindia.gov.in/all_infrastructure_projects',
      verificationLevel: 'OFFICIAL_DEPARTMENT_SITE',
      collectionMethod: 'html',
      coverageScope: 'national',
      notes: 'Auto-synced from infra_ingest_items PPP India listings.',
    };
  }

  if (sourceType === 'PIB_RSS') {
    return {
      sourceKey: 'PIB_INFRA',
      sourceType: 'government_notice',
      sourceName: 'Press Information Bureau Infrastructure Announcements',
      registrySourceUrl: 'https://pib.gov.in/',
      verificationLevel: 'PUBLIC_NOTICE_PRESS_RELEASE',
      collectionMethod: 'rss',
      coverageScope: 'national',
      notes: 'Auto-synced from infra_ingest_items PIB RSS feeds.',
    };
  }

  return {
    sourceKey: 'INFRA_LEGACY_PUBLIC',
    sourceType: 'government_notice',
    sourceName: 'Legacy Public Infrastructure Feed',
    registrySourceUrl: 'https://example.invalid/legacy-public-feed',
    verificationLevel: 'UNKNOWN',
    collectionMethod: 'manual',
    coverageScope: 'national',
    notes: 'Auto-synced from infra_ingest_items fallback source.',
  };
}

function extractAuthorityFromIngestText(text, title, fallbackAuthority = '') {
  const normalizedText = normalizeSpace(text);
  if (!normalizedText) return normalizeSpace(fallbackAuthority) || null;

  const withoutLeadingIndex = normalizedText.replace(/^\d+\.\s*/, '');
  const withoutDates = extractPortalDateTokens(withoutLeadingIndex).reduce(
    (current, token) => current.replace(token, ' '),
    withoutLeadingIndex
  );
  const withoutTitle = title ? withoutDates.replace(title, ' ') : withoutDates;
  const normalizedFallback = normalizeSpace(fallbackAuthority);

  const authorityMatch = withoutTitle.match(/(?:\/[^ ]+)+\s+(.+?)\s+--$/);
  if (authorityMatch?.[1]) {
    return normalizeSpace(authorityMatch[1]);
  }

  const tailMatch = withoutTitle.match(/([A-Za-z][A-Za-z0-9&(),.\-\/\s]{4,})\s+--$/);
  if (tailMatch?.[1]) {
    return normalizeSpace(tailMatch[1]);
  }

  return normalizedFallback || null;
}

function cleanAuthorityName(value) {
  const normalized = normalizeSpace(value);
  if (!normalized) return null;

  const strippedPrefix = normalized.replace(
    /^(?:[A-Z0-9][A-Z0-9._/()\-]{4,}\s+)(?=[A-Za-z])/,
    ''
  );
  return normalizeSpace(strippedPrefix) || normalized;
}

function buildInfraIngestSummary({
  sourceType,
  authorityName,
  locationHint,
  publishedToken,
  bidEndToken,
  openingToken,
  fallbackSummary,
}) {
  const parts = [];

  if (authorityName) parts.push(authorityName);
  if (sourceType === 'government_tender') {
    if (publishedToken) parts.push(`Published: ${publishedToken}`);
    if (bidEndToken) parts.push(`Bid closes: ${bidEndToken}`);
    if (openingToken) parts.push(`Bid opens: ${openingToken}`);
  }
  if (locationHint) parts.push(`Location hint: ${locationHint}`);

  const summary = parts.join(' | ');
  if (summary) return summary;
  return normalizeSpace(fallbackSummary).slice(0, 600);
}

async function ensureSource(client, update, sourceKey, sourceType, verificationLevel, options = {}) {
  const sourceName = detectSourceName(sourceKey, update?.sourceRef);
  const sourceUrl = normalizeSpace(update?.sourceUrl) || 'https://example.invalid';
  const collectionMethod = normalizeSpace(options.collectionMethod) || 'manual';
  const coverageScope = normalizeSpace(options.coverageScope) || 'national';
  const notes =
    normalizeSpace(options.notes) || 'Auto-created from existing infra_updates synchronization.';

  const existing = await client.query(
    `
      SELECT id
      FROM tender_intelligence_sources
      WHERE source_key = $1
      LIMIT 1
    `,
    [sourceKey]
  );

  if (existing.rowCount > 0) {
    return Number(existing.rows[0].id);
  }

  const inserted = await client.query(
    `
      INSERT INTO tender_intelligence_sources (
        source_key,
        track,
        source_type,
        source_name,
        source_url,
        collection_method,
        verification_level,
        coverage_scope,
        priority_order,
        refresh_interval_minutes,
        is_active,
        notes
      )
      VALUES (
        $1,
        'government',
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        500,
        60,
        TRUE,
        $8
      )
      RETURNING id
    `,
    [
      sourceKey,
      sourceType,
      sourceName,
      sourceUrl,
      collectionMethod,
      verificationLevel,
      coverageScope,
      notes,
    ]
  );

  return Number(inserted.rows[0].id);
}

function buildRecordPayload(update) {
  const sourceType = detectSourceType(update);
  const sourceKey = detectSourceKey(update);
  const verificationLevel = mapVerificationLevel(update, sourceKey, sourceType);
  const sourceName = detectSourceName(sourceKey, update?.sourceRef);
  const publishedAt = dateToTimestamp(update?.lastUpdated) || dateToTimestamp(update?.createdAt);
  const normalizedText = buildNormalizedText(update);

  return {
    externalId: `infra_update:${update.id}`,
    track: 'government',
    sourceType,
    sourceKey,
    sourceName,
    sourceUrl: normalizeSpace(update?.sourceUrl) || '',
    title: normalizeSpace(update?.projectName) || 'Untitled infrastructure update',
    summary: normalizeSpace(update?.statusText),
    authorityName: normalizeSpace(update?.authority) || null,
    departmentName: normalizeSpace(update?.authority) || null,
    sector: normalizeSpace(update?.projectType) || null,
    workType: normalizeSpace(update?.projectType) || null,
    stateName: normalizeSpace(update?.state) || null,
    districtName: normalizeSpace(update?.district) || null,
    budgetAmount: null,
    emdAmount: null,
    tenderStatus: normalizeSpace(update?.category) || null,
    publishedAt,
    bidEndAt: null,
    openingAt: null,
    documentUrls: normalizeSpace(update?.sourceUrl) ? [normalizeSpace(update.sourceUrl)] : [],
    rawPayload: {
      source_table: 'infra_updates',
      infra_update_id: update.id,
      record: update,
    },
    rawText: normalizeSpace(`${update?.projectName || ''} ${update?.statusText || ''}`),
    normalizedText,
    verificationLevel,
    parserStatus: 'PARSED',
    moderationStatus: 'MANUALLY_APPROVED',
    impactScore: mapImpactScore(update?.impactLevel),
    recordHash: buildRecordHash(update, sourceKey, sourceType),
  };
}

async function insertHistory(client, recordId, eventType, previousStatus, nextStatus, summary, rawPayload) {
  await client.query(
    `
      INSERT INTO tender_intelligence_history (
        record_id,
        event_type,
        previous_status,
        next_status,
        summary,
        raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [
      recordId,
      eventType,
      previousStatus || null,
      nextStatus || null,
      normalizeSpace(summary),
      JSON.stringify(rawPayload || {}),
    ]
  );
}

export async function upsertTenderIntelligenceRecordFromInfraUpdate(client, infraUpdate) {
  if (!infraUpdate || !Number.isInteger(Number(infraUpdate.id))) {
    return { inserted: false, updated: false, skipped: true };
  }

  const payload = buildRecordPayload(infraUpdate);
  const sourceId = await ensureSource(
    client,
    infraUpdate,
    payload.sourceKey,
    payload.sourceType,
    payload.verificationLevel
  );

  const existing = await client.query(
    `
      SELECT
        id,
        source_type AS "sourceType",
        title,
        summary,
        tender_status AS "tenderStatus",
        verification_level AS "verificationLevel"
      FROM tender_intelligence_records
      WHERE external_id = $1
      LIMIT 1
    `,
    [payload.externalId]
  );

  if (existing.rowCount === 0) {
    const inserted = await client.query(
      `
        INSERT INTO tender_intelligence_records (
          source_id,
          track,
          source_type,
          source_name,
          source_url,
          external_id,
          record_hash,
          title,
          summary,
          authority_name,
          department_name,
          sector,
          work_type,
          state_name,
          district_name,
          budget_amount,
          emd_amount,
          tender_status,
          published_at,
          bid_end_at,
          opening_at,
          document_urls,
          raw_payload,
          raw_text,
          normalized_text,
          verification_level,
          parser_status,
          moderation_status,
          impact_score
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          $17,
          $18,
          $19,
          $20,
          $21,
          $22::jsonb,
          $23::jsonb,
          $24,
          $25,
          $26,
          $27,
          $28,
          $29
        )
        RETURNING id
      `,
      [
        sourceId,
        payload.track,
        payload.sourceType,
        payload.sourceName,
        payload.sourceUrl,
        payload.externalId,
        payload.recordHash,
        payload.title,
        payload.summary,
        payload.authorityName,
        payload.departmentName,
        payload.sector,
        payload.workType,
        payload.stateName,
        payload.districtName,
        payload.budgetAmount,
        payload.emdAmount,
        payload.tenderStatus,
        payload.publishedAt,
        payload.bidEndAt,
        payload.openingAt,
        JSON.stringify(payload.documentUrls),
        JSON.stringify(payload.rawPayload),
        payload.rawText,
        payload.normalizedText,
        payload.verificationLevel,
        payload.parserStatus,
        payload.moderationStatus,
        payload.impactScore,
      ]
    );

    const recordId = Number(inserted.rows[0].id);
    await insertHistory(
      client,
      recordId,
      payload.sourceType === 'award' ? 'awarded' : 'published',
      null,
      payload.tenderStatus,
      `Created from infra_updates record ${infraUpdate.id}.`,
      payload.rawPayload
    );
    return { inserted: true, updated: false, recordId };
  }

  const current = existing.rows[0];
  const changed =
    normalizeSpace(current.sourceType) !== payload.sourceType ||
    normalizeSpace(current.title) !== payload.title ||
    normalizeSpace(current.summary) !== payload.summary ||
    normalizeSpace(current.tenderStatus) !== normalizeSpace(payload.tenderStatus) ||
    normalizeSpace(current.verificationLevel) !== payload.verificationLevel;

  await client.query(
    `
      UPDATE tender_intelligence_records
      SET
        source_id = $1,
        track = $2,
        source_type = $3,
        source_name = $4,
        source_url = $5,
        record_hash = $6,
        title = $7,
        summary = $8,
        authority_name = $9,
        department_name = $10,
        sector = $11,
        work_type = $12,
        state_name = $13,
        district_name = $14,
        budget_amount = $15,
        emd_amount = $16,
        tender_status = $17,
        published_at = $18,
        bid_end_at = $19,
        opening_at = $20,
        document_urls = $21::jsonb,
        raw_payload = $22::jsonb,
        raw_text = $23,
        normalized_text = $24,
        verification_level = $25,
        parser_status = $26,
        moderation_status = $27,
        impact_score = $28,
        updated_at = NOW()
      WHERE id = $29
    `,
    [
      sourceId,
      payload.track,
      payload.sourceType,
      payload.sourceName,
      payload.sourceUrl,
      payload.recordHash,
      payload.title,
      payload.summary,
      payload.authorityName,
      payload.departmentName,
      payload.sector,
      payload.workType,
      payload.stateName,
      payload.districtName,
      payload.budgetAmount,
      payload.emdAmount,
      payload.tenderStatus,
      payload.publishedAt,
      payload.bidEndAt,
      payload.openingAt,
      JSON.stringify(payload.documentUrls),
      JSON.stringify(payload.rawPayload),
      payload.rawText,
      payload.normalizedText,
      payload.verificationLevel,
      payload.parserStatus,
      payload.moderationStatus,
      payload.impactScore,
      Number(current.id),
    ]
  );

  if (changed) {
    await insertHistory(
      client,
      Number(current.id),
      payload.sourceType === 'award' && normalizeSpace(current.sourceType) !== 'award' ? 'awarded' : 'status_sync',
      current.tenderStatus,
      payload.tenderStatus,
      `Synchronized changes from infra_updates record ${infraUpdate.id}.`,
      payload.rawPayload
    );
  }

  return { inserted: false, updated: changed, recordId: Number(current.id) };
}

export async function deleteTenderIntelligenceRecordForInfraUpdate(client, infraUpdateId) {
  const externalId = `infra_update:${Number(infraUpdateId)}`;
  const result = await client.query(
    `
      DELETE FROM tender_intelligence_records
      WHERE external_id = $1
      RETURNING id
    `,
    [externalId]
  );

  return { deleted: result.rowCount > 0 };
}

function shouldSyncInfraIngestItem(infraIngestItem) {
  const raw = infraIngestItem?.raw || {};
  const sourceType = normalizeSpace(raw?.sourceType).toUpperCase();
  const text = normalizeSpace(
    `${infraIngestItem?.title || ''} ${infraIngestItem?.summary || ''} ${raw?.rowText || ''}`
  );

  if (sourceType === 'EPROCURE' || sourceType === 'ETENDERS') return true;
  if (sourceType === 'PPP_INDIA') return includesInfraKeyword(text);
  if (sourceType === 'PIB_RSS') return includesInfraKeyword(text);
  return false;
}

function buildRecordPayloadFromInfraIngestItem(infraIngestItem) {
  const raw = infraIngestItem?.raw || {};
  const sourceConfig = getIngestSourceConfig(infraIngestItem);
  const rowText = normalizeSpace(raw?.rowText || infraIngestItem?.summary || '');
  const sourceUrl = normalizeSpace(infraIngestItem?.link) || normalizeSpace(raw?.listingUrl) || sourceConfig.registrySourceUrl;
  const title = normalizeSpace(infraIngestItem?.title) || 'Untitled tender listing';
  const authorityFromExtracted = normalizeSpace(raw?.extracted?.organization || '');
  const authorityName = cleanAuthorityName(
    extractAuthorityFromIngestText(rowText, title, authorityFromExtracted)
  );
  const locationHint = normalizeSpace(raw?.extracted?.location || '');
  const dateTokens = extractPortalDateTokens(`${rowText} ${normalizeSpace(infraIngestItem?.summary)}`);
  const publishedAt = parsePortalDateToken(dateTokens[0]) || dateToTimestamp(infraIngestItem?.publishedAt) || dateToTimestamp(infraIngestItem?.createdAt);
  const bidEndAt = parsePortalDateToken(dateTokens[1]);
  const openingAt = parsePortalDateToken(dateTokens[2]);
  const combinedText = normalizeSpace(`${title} ${rowText} ${locationHint}`);
  const stateName = inferStateFromText(combinedText);
  const workType = inferWorkTypeFromText(combinedText);
  const tenderStatus =
    sourceConfig.sourceType === 'government_tender'
      ? inferTenderStatusFromDates(bidEndAt, openingAt)
      : normalizeSpace(raw?.inferredStage) || 'NOTICE';
  const impactScore = inferImpactScoreFromText(combinedText);
  const normalizedText = normalizeSpace(
    [
      title,
      authorityName,
      workType,
      stateName,
      locationHint,
      rowText,
      infraIngestItem?.summary,
    ].join(' | ')
  );
  const externalKey =
    [
      sourceConfig.sourceKey,
      normalizeLower(title),
      normalizeLower(authorityName),
      bidEndAt || '',
      openingAt || '',
      publishedAt || '',
    ].join('||') ||
    normalizeSpace(String(infraIngestItem?.id));
  const externalKeyHash = crypto.createHash('sha256').update(externalKey).digest('hex').slice(0, 40);
  const externalId = `infra_ingest:${normalizeSpace(infraIngestItem?.sourceKey)}:${externalKeyHash}`;
  const summary = buildInfraIngestSummary({
    sourceType: sourceConfig.sourceType,
    authorityName,
    locationHint,
    publishedToken: dateTokens[0] || '',
    bidEndToken: dateTokens[1] || '',
    openingToken: dateTokens[2] || '',
    fallbackSummary: infraIngestItem?.summary || rowText || title,
  });
  const recordHash = crypto
    .createHash('sha256')
    .update(
      [
        externalId,
        normalizeSpace(infraIngestItem?.contentHash),
        normalizeLower(title),
        normalizeLower(summary),
        normalizeLower(tenderStatus),
      ].join('||')
    )
    .digest('hex');

  return {
    externalId,
    track: 'government',
    sourceType: sourceConfig.sourceType,
    sourceKey: sourceConfig.sourceKey,
    sourceName: sourceConfig.sourceName,
    sourceUrl,
    registrySourceUrl: sourceConfig.registrySourceUrl,
    summary,
    title,
    authorityName: authorityName || null,
    departmentName: authorityName || null,
    sector: workType || null,
    workType: workType || null,
    stateName,
    districtName: null,
    budgetAmount: null,
    emdAmount: null,
    tenderStatus,
    publishedAt,
    bidEndAt,
    openingAt,
    documentUrls: sourceUrl ? [sourceUrl] : [],
    rawPayload: {
      source_table: 'infra_ingest_items',
      infra_ingest_item_id: infraIngestItem.id,
      source_key: infraIngestItem.sourceKey,
      record: infraIngestItem,
    },
    rawText: rowText || normalizeSpace(infraIngestItem?.summary) || title,
    normalizedText,
    verificationLevel: sourceConfig.verificationLevel,
    parserStatus: 'PARSED',
    moderationStatus: 'AUTO_APPROVED',
    impactScore,
    recordHash,
    collectionMethod: sourceConfig.collectionMethod,
    coverageScope: sourceConfig.coverageScope,
    sourceNotes: sourceConfig.notes,
  };
}

export async function upsertTenderIntelligenceRecordFromInfraIngestItem(client, infraIngestItem) {
  if (!infraIngestItem || !Number.isInteger(Number(infraIngestItem.id))) {
    return { inserted: false, updated: false, skipped: true };
  }

  if (!shouldSyncInfraIngestItem(infraIngestItem)) {
    return { inserted: false, updated: false, skipped: true };
  }

  const payload = buildRecordPayloadFromInfraIngestItem(infraIngestItem);
  const sourceId = await ensureSource(
    client,
    {
      sourceRef: payload.sourceName,
      sourceUrl: payload.registrySourceUrl,
    },
    payload.sourceKey,
    payload.sourceType,
    payload.verificationLevel,
    {
      collectionMethod: payload.collectionMethod,
      coverageScope: payload.coverageScope,
      notes: payload.sourceNotes,
    }
  );

  const existing = await client.query(
    `
      SELECT
        id,
        source_type AS "sourceType",
        title,
        summary,
        tender_status AS "tenderStatus",
        verification_level AS "verificationLevel"
      FROM tender_intelligence_records
      WHERE external_id = $1
      LIMIT 1
    `,
    [payload.externalId]
  );

  if (existing.rowCount === 0) {
    const inserted = await client.query(
      `
        INSERT INTO tender_intelligence_records (
          source_id,
          track,
          source_type,
          source_name,
          source_url,
          external_id,
          record_hash,
          title,
          summary,
          authority_name,
          department_name,
          sector,
          work_type,
          state_name,
          district_name,
          budget_amount,
          emd_amount,
          tender_status,
          published_at,
          bid_end_at,
          opening_at,
          document_urls,
          raw_payload,
          raw_text,
          normalized_text,
          verification_level,
          parser_status,
          moderation_status,
          impact_score
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          $17,
          $18,
          $19,
          $20,
          $21,
          $22::jsonb,
          $23::jsonb,
          $24,
          $25,
          $26,
          $27,
          $28,
          $29
        )
        RETURNING id
      `,
      [
        sourceId,
        payload.track,
        payload.sourceType,
        payload.sourceName,
        payload.sourceUrl,
        payload.externalId,
        payload.recordHash,
        payload.title,
        payload.summary,
        payload.authorityName,
        payload.departmentName,
        payload.sector,
        payload.workType,
        payload.stateName,
        payload.districtName,
        payload.budgetAmount,
        payload.emdAmount,
        payload.tenderStatus,
        payload.publishedAt,
        payload.bidEndAt,
        payload.openingAt,
        JSON.stringify(payload.documentUrls),
        JSON.stringify(payload.rawPayload),
        payload.rawText,
        payload.normalizedText,
        payload.verificationLevel,
        payload.parserStatus,
        payload.moderationStatus,
        payload.impactScore,
      ]
    );

    const recordId = Number(inserted.rows[0].id);
    await insertHistory(
      client,
      recordId,
      payload.sourceType === 'government_tender' ? 'published' : 'status_sync',
      null,
      payload.tenderStatus,
      `Created from infra_ingest_items record ${infraIngestItem.id}.`,
      payload.rawPayload
    );
    return { inserted: true, updated: false, recordId };
  }

  const current = existing.rows[0];
  const changed =
    normalizeSpace(current.sourceType) !== payload.sourceType ||
    normalizeSpace(current.title) !== payload.title ||
    normalizeSpace(current.summary) !== payload.summary ||
    normalizeSpace(current.tenderStatus) !== normalizeSpace(payload.tenderStatus) ||
    normalizeSpace(current.verificationLevel) !== payload.verificationLevel;

  await client.query(
    `
      UPDATE tender_intelligence_records
      SET
        source_id = $1,
        track = $2,
        source_type = $3,
        source_name = $4,
        source_url = $5,
        record_hash = $6,
        title = $7,
        summary = $8,
        authority_name = $9,
        department_name = $10,
        sector = $11,
        work_type = $12,
        state_name = $13,
        district_name = $14,
        budget_amount = $15,
        emd_amount = $16,
        tender_status = $17,
        published_at = $18,
        bid_end_at = $19,
        opening_at = $20,
        document_urls = $21::jsonb,
        raw_payload = $22::jsonb,
        raw_text = $23,
        normalized_text = $24,
        verification_level = $25,
        parser_status = $26,
        moderation_status = $27,
        impact_score = $28,
        updated_at = NOW()
      WHERE id = $29
    `,
    [
      sourceId,
      payload.track,
      payload.sourceType,
      payload.sourceName,
      payload.sourceUrl,
      payload.recordHash,
      payload.title,
      payload.summary,
      payload.authorityName,
      payload.departmentName,
      payload.sector,
      payload.workType,
      payload.stateName,
      payload.districtName,
      payload.budgetAmount,
      payload.emdAmount,
      payload.tenderStatus,
      payload.publishedAt,
      payload.bidEndAt,
      payload.openingAt,
      JSON.stringify(payload.documentUrls),
      JSON.stringify(payload.rawPayload),
      payload.rawText,
      payload.normalizedText,
      payload.verificationLevel,
      payload.parserStatus,
      payload.moderationStatus,
      payload.impactScore,
      Number(current.id),
    ]
  );

  if (changed) {
    await insertHistory(
      client,
      Number(current.id),
      'status_sync',
      current.tenderStatus,
      payload.tenderStatus,
      `Synchronized changes from infra_ingest_items record ${infraIngestItem.id}.`,
      payload.rawPayload
    );
  }

  return { inserted: false, updated: changed, recordId: Number(current.id) };
}

export async function runTenderIntelligenceSyncJob(db, options = {}) {
  const limit = Math.max(1, Math.min(50000, Number(options.limit || 10000)));
  const ownClient = typeof db?.connect === 'function';
  const client = ownClient ? await db.connect() : db;

  try {
    if (ownClient) {
      await client.query('BEGIN');
    }

    const result = await client.query(
      `
        SELECT
          id,
          state,
          district,
          cities,
          category,
          project_name AS "projectName",
          authority,
          project_type AS "projectType",
          status_text AS "statusText",
          impact_level AS "impactLevel",
          source_ref AS "sourceRef",
          source_url AS "sourceUrl",
          verification_level AS "verificationLevel",
          last_updated AS "lastUpdated",
          created_at AS "createdAt"
        FROM infra_updates
        ORDER BY id ASC
        LIMIT $1
      `,
      [limit]
    );

    let inserted = 0;
    let updated = 0;
    for (const row of result.rows) {
      const syncResult = await upsertTenderIntelligenceRecordFromInfraUpdate(client, row);
      if (syncResult.inserted) inserted += 1;
      if (syncResult.updated) updated += 1;
    }

    const ingestResult = await client.query(
      `
        SELECT
          id,
          source_key AS "sourceKey",
          item_guid AS "itemGuid",
          content_hash AS "contentHash",
          title,
          link,
          published_at AS "publishedAt",
          summary,
          raw,
          created_at AS "createdAt",
          status
        FROM infra_ingest_items
        WHERE status IN ('NEW', 'PUBLISHED')
        ORDER BY id ASC
        LIMIT $1
      `,
      [limit]
    );

    for (const row of ingestResult.rows) {
      const syncResult = await upsertTenderIntelligenceRecordFromInfraIngestItem(client, row);
      if (syncResult.inserted) inserted += 1;
      if (syncResult.updated) updated += 1;
    }

    const deleteResult = await client.query(
      `
        DELETE FROM tender_intelligence_records tr
        WHERE tr.external_id LIKE 'infra_update:%'
          AND NOT EXISTS (
            SELECT 1
            FROM infra_updates iu
            WHERE CONCAT('infra_update:', iu.id::text) = tr.external_id
          )
      `
    );

    const dedupeResult = await client.query(
      `
        WITH ranked AS (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY
                COALESCE(source_name, ''),
                COALESCE(title, ''),
                COALESCE(bid_end_at::text, ''),
                COALESCE(opening_at::text, ''),
                COALESCE(published_at::text, '')
              ORDER BY id DESC
            ) AS row_number
          FROM tender_intelligence_records
          WHERE external_id LIKE 'infra_ingest:%'
        )
        DELETE FROM tender_intelligence_records tr
        USING ranked
        WHERE tr.id = ranked.id
          AND ranked.row_number > 1
      `
    );

    if (ownClient) {
      await client.query('COMMIT');
    }

    return {
      processed: result.rows.length + ingestResult.rows.length,
      processedInfraUpdates: result.rows.length,
      processedInfraIngestItems: ingestResult.rows.length,
      inserted,
      updated,
      deleted: (deleteResult.rowCount || 0) + (dedupeResult.rowCount || 0),
      deduped: dedupeResult.rowCount || 0,
    };
  } catch (error) {
    if (ownClient) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    if (ownClient) {
      client.release();
    }
  }
}
