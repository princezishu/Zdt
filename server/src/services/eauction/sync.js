import crypto from 'crypto';

const PNB_SOURCE_KEY = 'PNB_EAUCTION';
const IBAPI_SOURCE_KEY = 'IBAPI';
const PNB_LISTING_URL = 'https://pnb.bank.in/EAuction.aspx';
const IBAPI_BASE_URL = 'https://ibapi.in/';
const IBAPI_SEARCH_PAGE_URL = 'https://ibapi.in/Sale_Info_Home.aspx';
const DEFAULT_TIMEOUT_MS = 30000;
const PNB_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

const HTML_ENTITY_MAP = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

const PNB_LOCATION_HINTS = [
  {
    match: /\bKOLKATA\b/i,
    stateName: 'West Bengal',
    districtName: 'Kolkata',
    cityName: 'Kolkata',
  },
  {
    match: /\bAHMEDABAD\b/i,
    stateName: 'Gujarat',
    districtName: 'Ahmedabad',
    cityName: 'Ahmedabad',
  },
  {
    match: /\bCHANDIGARH\b/i,
    stateName: 'Chandigarh',
    districtName: 'Chandigarh',
    cityName: 'Chandigarh',
  },
  {
    match: /\bTRICHY\b/i,
    stateName: 'Tamil Nadu',
    districtName: 'Tiruchirappalli',
    cityName: 'Tiruchirappalli',
  },
  {
    match: /\bANDHRA\b/i,
    stateName: 'Andhra Pradesh',
    districtName: '',
    cityName: 'Vijayawada',
  },
  {
    match: /\bMUMBAI\b/i,
    stateName: 'Maharashtra',
    districtName: 'Mumbai',
    cityName: 'Mumbai',
  },
];

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

const LOCATION_NAME_FIXUPS = new Map([
  ['Andaman & Nicobar Islands', 'Andaman and Nicobar Islands'],
  ['Dadra & Nagar Haveli', 'Dadra and Nagar Haveli'],
  ['Daman & Diu', 'Daman and Diu'],
  ['J& K', 'Jammu and Kashmir'],
  ['Nct Of Delhi', 'Delhi'],
]);

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function decodeHtml(value) {
  return normalizeSpace(
    String(value || '')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code) || 0))
      .replace(/&(amp|lt|gt|quot|nbsp|#39);/g, (match) => HTML_ENTITY_MAP[match] || match)
  );
}

function stripHtml(value) {
  return decodeHtml(
    String(value || '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  );
}

function parseSetCookieHeader(value) {
  return String(value || '')
    .split(/,(?=\s*[^;,]+=)/)
    .map((item) => item.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      redirect: 'manual',
      ...options,
      signal: controller.signal,
      headers: {
        'user-agent': PNB_USER_AGENT,
        ...options.headers,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const response = await fetchWithTimeout(url, options, timeoutMs);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }
  return {
    response,
    text: await response.text(),
  };
}

function parsePortalDate(value) {
  const raw = normalizeSpace(value);
  if (!raw) return null;

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString();
  }

  const match = raw.match(
    /^(\d{1,2})-([A-Za-z]{3})-(\d{4})(?:\s+(\d{1,2}):(\d{2})\s+([AP]M))?$/i
  );
  if (!match) return null;

  const day = Number(match[1]);
  const month = MONTH_INDEX[String(match[2] || '').toLowerCase()];
  const year = Number(match[3]);
  if (!Number.isFinite(day) || month == null || !Number.isFinite(year)) return null;

  let hour = Number(match[4] || 0);
  const minute = Number(match[5] || 0);
  const meridiem = String(match[6] || '').toUpperCase();
  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;

  const utcValue = Date.UTC(year, month, day, hour, minute);
  return new Date(utcValue).toISOString();
}

function parseAuctionDateFromText(value) {
  const raw = normalizeSpace(value);
  if (!raw) return null;

  const token = raw.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/);
  if (!token) return null;

  const day = Number(token[1]);
  const month = Number(token[2]) - 1;
  let year = Number(token[3]);
  if (year < 100) year += 2000;
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  if (month < 0 || month > 11) return null;

  const utcValue = Date.UTC(year, month, day, 0, 0, 0);
  return new Date(utcValue).toISOString();
}

function extractHiddenInputs(html) {
  const fields = {};
  for (const match of String(html || '').matchAll(
    /<input[^>]+type="hidden"[^>]*name="([^"]+)"[^>]*value="([\s\S]*?)"[^>]*>/gi
  )) {
    fields[match[1]] = decodeHtml(match[2]);
  }
  return fields;
}

function shouldIncludePnbRow(row) {
  const haystack = normalizeSpace(
    `${row.office} ${row.title} ${row.fileLabel} ${row.fileName}`.toLowerCase()
  );
  if (!haystack) return false;

  const includesAuctionSignals =
    haystack.includes('auction') ||
    haystack.includes('sale notice') ||
    haystack.includes('immovable propert') ||
    haystack.includes('property for e auction') ||
    haystack.includes('e-auction');
  const excludesNonAuction =
    haystack.includes('hiring of premises') ||
    haystack.includes('premises tender') ||
    haystack.includes('inviting bids for hiring');

  return includesAuctionSignals && !excludesNonAuction;
}

function inferPropertyType(row) {
  const haystack = normalizeSpace(
    `${row.title} ${row.fileLabel} ${row.office}`.toLowerCase()
  );
  if (/(apartment|flat|residential unit)/i.test(haystack)) return 'apartment_flat';
  if (/(land|plot|site|vacant)/i.test(haystack)) return 'plot_land';
  if (/(industrial|factory|mill|rice|plant|warehouse)/i.test(haystack)) return 'industrial';
  if (/(agricultural|farm)/i.test(haystack)) return 'agricultural';
  if (/(commercial|shop|office|showroom|hotel|mall)/i.test(haystack)) return 'commercial';
  if (/(property|properties|immovable|auction)/i.test(haystack)) return 'mixed';
  return 'other';
}

function titleCaseWords(value) {
  const normalized = normalizeSpace(value)
    .toLowerCase()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase());
  return LOCATION_NAME_FIXUPS.get(normalized) || normalized;
}

function titleCaseCompact(value) {
  return titleCaseWords(String(value || '').replace(/[_-]+/g, ' '));
}

function parseMoneyAmount(value) {
  const raw = normalizeSpace(value).replace(/,/g, '');
  if (!raw || raw.toUpperCase() === 'NA' || raw.toUpperCase() === 'N.A.') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeMoneyDisplay(value) {
  const amount = parseMoneyAmount(value);
  if (amount == null) return '';
  return amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatMoneyDisplayWithPrefix(value) {
  const amount = parseMoneyAmount(value);
  if (amount == null) return '';
  return `Rs ${amount.toLocaleString('en-IN', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function parseHtmlAnchorText(value) {
  return stripHtml(value).replace(/\s+/g, ' ').trim();
}

function ibapiMethodUrl(methodName) {
  return `${IBAPI_SEARCH_PAGE_URL}/${String(methodName || '').replace(/^\/+/, '')}`;
}

function extractIbapiPropertyId(value) {
  const direct = normalizeSpace(value);
  const anchorMatch = String(value || '').match(/>([^<]+)</);
  return normalizeSpace(anchorMatch?.[1] || direct);
}

function mapIbapiPropertyType(value) {
  const normalized = normalizeSpace(value).toUpperCase();
  if (!normalized) return 'other';
  if (normalized.includes('COMMERCIAL')) return 'commercial';
  if (normalized.includes('INDUSTRIAL')) return 'industrial';
  if (normalized.includes('AGRICULTURAL')) return 'agricultural';
  if (normalized.includes('LAND') || normalized.includes('PLOT')) return 'plot_land';
  if (normalized.includes('RESIDENTIAL')) return 'apartment_flat';
  if (normalized.includes('MIXED')) return 'mixed';
  return 'other';
}

function buildIbapiSummary(row, propertyId) {
  const bank = titleCaseCompact(row['Bank Name']);
  const property = titleCaseCompact(row.Property);
  const location = [row.City, row.District, row.State]
    .map((item) => titleCaseCompact(item))
    .filter(Boolean)
    .join(', ');
  const dateText =
    parsePortalDate(row['Auction End Date & Time']) || parsePortalDate(row['Auction Start Date & Time']);

  return normalizeSpace(
    `Official IBAPI listing for ${bank}. ` +
      `${property || 'Auction property'} ${propertyId ? `(${propertyId}) ` : ''}` +
      `${location ? `in ${location} ` : ''}` +
      `is published on the official IBAPI search portal. ` +
      `Review the official property page before registration, EMD payment, or bidding${
        dateText
          ? ` around ${new Date(dateText).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}.`
          : '.'
      }`
  );
}

async function callJsonMethod(url, payload, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const response = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=UTF-8',
        'x-requested-with': 'XMLHttpRequest',
        accept: 'application/json, text/javascript, */*; q=0.01',
        referer: IBAPI_SEARCH_PAGE_URL,
      },
      body: JSON.stringify(payload),
    },
    timeoutMs
  );

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  return response.json();
}

function inferLocation(row) {
  const result = {
    stateName: '',
    districtName: '',
    cityName: '',
    propertyLocation: normalizeSpace(row.office),
  };

  for (const hint of PNB_LOCATION_HINTS) {
    if (hint.match.test(row.office) || hint.match.test(row.title) || hint.match.test(row.fileLabel)) {
      result.stateName = hint.stateName;
      result.districtName = hint.districtName;
      result.cityName = hint.cityName;
      break;
    }
  }

  const branchMatch = normalizeSpace(`${row.title} ${row.fileLabel}`).match(
    /\bIN\s+([A-Z][A-Z\s.-]+?)\s+BRANCH\b/i
  );
  if (branchMatch && !result.cityName) {
    result.cityName = titleCaseWords(branchMatch[1]);
  }

  const districtMatch = normalizeSpace(`${row.title} ${row.fileLabel}`).match(
    /\b([A-Z][A-Z\s.-]+?)\s+DIST(?:RICT)?\b/i
  );
  if (districtMatch) {
    result.districtName = titleCaseWords(districtMatch[1]);
  }

  if (!result.cityName && result.districtName) {
    result.cityName = result.districtName;
  }

  return result;
}

function buildSummary(row, auctionDateIso) {
  const office = normalizeSpace(row.office);
  const fileLabel = normalizeSpace(row.fileLabel);
  const auctionDateText = auctionDateIso
    ? new Date(auctionDateIso).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : 'the official notice date';

  return normalizeSpace(
    `Official Punjab National Bank sale notice from ${office}. ` +
      `${fileLabel || row.title || 'Auction notice'} is listed on the official PNB e-auction page. ` +
      `Review the official notice PDF before registration, EMD payment, or bidding for the auction around ${auctionDateText}.`
  );
}

function makeListingKey(input) {
  const digest = crypto.createHash('sha1').update(String(input || '')).digest('hex').slice(0, 20);
  return `PNB_SYNC_${digest}`.toUpperCase();
}

function extractPnbRows(html) {
  const rows = [];
  const pattern =
    /<tr><td style="width:20px"><span id="ContentPlaceHolder1_rptGrid_lblpagid_(\d+)">(\d+)<\/span><\/td>\s*<td style="width:50px"><span id="ContentPlaceHolder1_rptGrid_Label3_\1">([\s\S]*?)<\/span><\/td>\s*<td class="stqcpdf">([\s\S]*?)<\/td>\s*<\/tr>/gi;

  for (const match of String(html || '').matchAll(pattern)) {
    const index = String(match[1] || '');
    const detailsBlock = match[4] || '';
    const event = detailsBlock.match(
      /javascript:__doPostBack\(&#39;([^&#]+)&#39;,&#39;([^&#]*)&#39;\)/i
    );
    rows.push({
      index,
      office: stripHtml(match[3]),
      title: stripHtml(
        detailsBlock.match(
          /<a id="ContentPlaceHolder1_rptGrid_lbtnTenderTitle_[^"]+"[^>]*>([\s\S]*?)<\/a>/i
        )?.[1] || ''
      ),
      publishDateText: stripHtml(
        detailsBlock.match(/Publish Date\s*:\s*<b>([^<]+)<\/b>/i)?.[1] || ''
      ),
      endDateText: stripHtml(detailsBlock.match(/End Date\s*:?\s*<b>([^<]+)<\/b>/i)?.[1] || ''),
      fileName: stripHtml(
        detailsBlock.match(
          /id="ContentPlaceHolder1_rptGrid_fileName_[^"]+"[^>]*>([^<]+)<\/span>/i
        )?.[1] || ''
      ),
      fileLabel: stripHtml(detailsBlock.match(/File Name:\s*<b>([^<]+)<\/b>/i)?.[1] || ''),
      eventTarget: decodeHtml(event?.[1] || ''),
      eventArgument: decodeHtml(event?.[2] || ''),
    });
  }

  return rows;
}

async function resolvePnbNoticeUrl(cookieHeader, hiddenFields, row) {
  if (!row?.eventTarget) return '';

  const body = new URLSearchParams({
    ...hiddenFields,
    __EVENTTARGET: row.eventTarget,
    __EVENTARGUMENT: row.eventArgument || '',
  });

  const response = await fetchWithTimeout(
    PNB_LISTING_URL,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookieHeader,
        origin: 'https://pnb.bank.in',
        referer: PNB_LISTING_URL,
      },
      body,
    },
    DEFAULT_TIMEOUT_MS
  );

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    return location ? new URL(location, PNB_LISTING_URL).toString() : '';
  }

  if (response.ok && String(response.headers.get('content-type') || '').includes('application/pdf')) {
    return response.url;
  }

  return '';
}

async function syncPnbListings(pool) {
  const sourceResult = await pool.query(
    `
      SELECT id, source_type, authority_name, source_domain, official_listing_url
      FROM eauction_sources
      WHERE source_key = $1
        AND is_active = TRUE
      LIMIT 1
    `,
    [PNB_SOURCE_KEY]
  );

  const source = sourceResult.rows[0];
  if (!source?.id) {
    return {
      processed: 0,
      inserted: 0,
      updated: 0,
      deactivated: 0,
      skipped: 1,
      errors: [`${PNB_SOURCE_KEY} source is missing.`],
    };
  }

  const { response, text } = await fetchText(source.official_listing_url || PNB_LISTING_URL, {
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-IN,en;q=0.9',
      referer: source.official_listing_url || PNB_LISTING_URL,
    },
  });
  const cookieHeader = parseSetCookieHeader(response.headers.get('set-cookie'));
  const hiddenFields = extractHiddenInputs(text);
  const allRows = extractPnbRows(text);
  const candidateRows = allRows.filter(shouldIncludePnbRow);

  if (!candidateRows.length) {
    throw new Error('PNB sync could not find auction rows on the official page.');
  }

  const listings = [];
  const errors = [];

  for (let index = 0; index < candidateRows.length; index += 1) {
    const row = candidateRows[index];
    let noticePdfUrl = '';
    try {
      noticePdfUrl = await resolvePnbNoticeUrl(cookieHeader, hiddenFields, row);
    } catch (error) {
      errors.push(
        `Failed to resolve PNB notice URL for row ${row.index}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }

    const location = inferLocation(row);
    const auctionDate =
      parseAuctionDateFromText(`${row.title} ${row.fileLabel}`) ||
      parsePortalDate(row.endDateText) ||
      null;
    const listingKey = makeListingKey(noticePdfUrl || `${row.eventTarget}|${row.fileName}|${row.title}`);
    const externalId = noticePdfUrl
      ? `PNB_NOTICE:${makeListingKey(noticePdfUrl)}`
      : `PNB_ROW:${makeListingKey(`${row.eventTarget}|${row.fileName}`)}`;

    listings.push({
      listingKey,
      externalId,
      title: row.title || row.fileLabel || `PNB auction notice ${Number(index) + 1}`,
      summary: buildSummary(row, auctionDate),
      propertyType: inferPropertyType(row),
      bankAuthorityName: String(source.authority_name || 'Punjab National Bank'),
      sourceType: String(source.source_type || 'bank'),
      officialListingUrl: String(source.official_listing_url || PNB_LISTING_URL),
      officialDetailUrl: '',
      noticePdfUrl,
      sourceDomain: String(source.source_domain || 'pnb.bank.in'),
      loginRequired: false,
      bidderRegistrationRequired: true,
      emdMentioned: true,
      reservePriceAmount: null,
      reservePriceDisplay: '',
      emdAmount: null,
      emdDisplay: '',
      auctionDate,
      inspectionDate: null,
      stateName: location.stateName,
      districtName: location.districtName,
      cityName: location.cityName,
      propertyLocation: location.propertyLocation,
      domainStatus: 'verified',
      sortOrder: (index + 1) * 10,
    });
  }

  const uniqueListings = Array.from(
    new Map(listings.map((item) => [item.listingKey, item])).values()
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let inserted = 0;
    let updated = 0;
    const activeKeys = [];

    for (const listing of uniqueListings) {
      const upsertResult = await client.query(
        `
          INSERT INTO eauction_listings (
            listing_key,
            source_id,
            external_id,
            title,
            summary,
            property_type,
            bank_authority_name,
            source_type,
            official_listing_url,
            official_detail_url,
            notice_pdf_url,
            source_domain,
            login_required,
            bidder_registration_required,
            emd_mentioned,
            reserve_price_amount,
            reserve_price_display,
            emd_amount,
            emd_display,
            auction_date,
            inspection_date,
            state_name,
            district_name,
            city_name,
            property_location,
            domain_status,
            last_checked_at,
            is_active,
            sort_order
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
            $22,
            $23,
            $24,
            $25,
            $26,
            NOW(),
            TRUE,
            $27
          )
          ON CONFLICT (listing_key) WHERE listing_key IS NOT NULL DO UPDATE
          SET
            source_id = EXCLUDED.source_id,
            external_id = EXCLUDED.external_id,
            title = EXCLUDED.title,
            summary = EXCLUDED.summary,
            property_type = EXCLUDED.property_type,
            bank_authority_name = EXCLUDED.bank_authority_name,
            source_type = EXCLUDED.source_type,
            official_listing_url = EXCLUDED.official_listing_url,
            official_detail_url = EXCLUDED.official_detail_url,
            notice_pdf_url = EXCLUDED.notice_pdf_url,
            source_domain = EXCLUDED.source_domain,
            login_required = EXCLUDED.login_required,
            bidder_registration_required = EXCLUDED.bidder_registration_required,
            emd_mentioned = EXCLUDED.emd_mentioned,
            reserve_price_amount = EXCLUDED.reserve_price_amount,
            reserve_price_display = EXCLUDED.reserve_price_display,
            emd_amount = EXCLUDED.emd_amount,
            emd_display = EXCLUDED.emd_display,
            auction_date = EXCLUDED.auction_date,
            inspection_date = EXCLUDED.inspection_date,
            state_name = EXCLUDED.state_name,
            district_name = EXCLUDED.district_name,
            city_name = EXCLUDED.city_name,
            property_location = EXCLUDED.property_location,
            domain_status = EXCLUDED.domain_status,
            last_checked_at = NOW(),
            is_active = TRUE,
            sort_order = EXCLUDED.sort_order
          RETURNING (xmax = 0) AS inserted_row
        `,
        [
          listing.listingKey,
          source.id,
          listing.externalId,
          listing.title,
          listing.summary,
          listing.propertyType,
          listing.bankAuthorityName,
          listing.sourceType,
          listing.officialListingUrl,
          listing.officialDetailUrl,
          listing.noticePdfUrl,
          listing.sourceDomain,
          listing.loginRequired,
          listing.bidderRegistrationRequired,
          listing.emdMentioned,
          listing.reservePriceAmount,
          listing.reservePriceDisplay,
          listing.emdAmount,
          listing.emdDisplay,
          listing.auctionDate,
          listing.inspectionDate,
          listing.stateName,
          listing.districtName,
          listing.cityName,
          listing.propertyLocation,
          listing.domainStatus,
          listing.sortOrder,
        ]
      );

      if (upsertResult.rows[0]?.inserted_row) inserted += 1;
      else updated += 1;
      activeKeys.push(listing.listingKey);
    }

    const deactivateResult = await client.query(
      `
        UPDATE eauction_listings
        SET
          is_active = FALSE,
          last_checked_at = NOW()
        WHERE source_id = $1
          AND (listing_key LIKE 'PNB_SYNC_%' OR external_id ILIKE 'pnb-%')
          AND NOT (listing_key = ANY($2::text[]))
      `,
      [source.id, activeKeys]
    );

    await client.query(
      `
        UPDATE eauction_sources
        SET
          last_checked_at = NOW(),
          domain_status = 'verified'
        WHERE id = $1
      `,
      [source.id]
    );

    await client.query('COMMIT');

    return {
      processed: uniqueListings.length,
      inserted,
      updated,
      deactivated: Number(deactivateResult.rowCount || 0),
      skipped: 0,
      errors,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function syncIbapiListings(pool) {
  const sourceResult = await pool.query(
    `
      SELECT id, source_type, authority_name, source_domain, official_listing_url
      FROM eauction_sources
      WHERE source_key = $1
        AND is_active = TRUE
      LIMIT 1
    `,
    [IBAPI_SOURCE_KEY]
  );

  const source = sourceResult.rows[0];
  if (!source?.id) {
    return {
      processed: 0,
      inserted: 0,
      updated: 0,
      deactivated: 0,
      skipped: 1,
      errors: [`${IBAPI_SOURCE_KEY} source is missing.`],
    };
  }

  const stateJson = await callJsonMethod(
    ibapiMethodUrl('fill_DropDownList_State'),
    { key_val_state: [] },
    45000
  );
  const states = Array.isArray(stateJson?.d) ? stateJson.d : [];
  if (!states.length) {
    throw new Error('IBAPI sync could not load the official state directory.');
  }

  const listingsByKey = new Map();
  const errors = [];

  for (const state of states) {
    const stateCode = normalizeSpace(state?.id);
    const stateName = titleCaseWords(state?.name);
    if (!stateCode) continue;

    try {
      const searchJson = await callJsonMethod(
        ibapiMethodUrl('Button_search_Click'),
        { key_val: [['State', `'${stateCode}'`]] },
        45000
      );
      const rows = searchJson?.d ? JSON.parse(searchJson.d) : [];

      for (const row of rows) {
        const propertyId = extractIbapiPropertyId(row['Property ID']);
        if (!propertyId) continue;

        const reserveAmount = parseMoneyAmount(row['Reserve Price (Rs)']);
        const emdAmount = parseMoneyAmount(row['EMD (Rs)']);
        const auctionDate =
          parsePortalDate(row['Auction End Date & Time']) ||
          parsePortalDate(row['Auction Start Date & Time']) ||
          null;
        const cityName = titleCaseWords(row.City);
        const districtName = titleCaseWords(row.District);
        const listingKey = `IBAPI_${propertyId.toUpperCase()}`;
        const officialDetailUrl = `${IBAPI_SEARCH_PAGE_URL}?prop=${encodeURIComponent(propertyId)}`;

        listingsByKey.set(listingKey, {
          listingKey,
          externalId: propertyId.toUpperCase(),
          title: `${titleCaseCompact(row.Property) || 'Auction'} Property ${propertyId.toUpperCase()}`,
          summary: buildIbapiSummary(row, propertyId.toUpperCase()),
          propertyType: mapIbapiPropertyType(row.Property),
          bankAuthorityName: titleCaseCompact(row['Bank Name']) || String(source.authority_name || 'IBAPI'),
          sourceType: String(source.source_type || 'common_portal'),
          officialListingUrl: String(source.official_listing_url || IBAPI_SEARCH_PAGE_URL),
          officialDetailUrl,
          noticePdfUrl: '',
          sourceDomain: String(source.source_domain || 'ibapi.in'),
          loginRequired: false,
          bidderRegistrationRequired: true,
          emdMentioned: emdAmount != null || Boolean(normalizeMoneyDisplay(row['EMD (Rs)'])),
          reservePriceAmount: reserveAmount,
          reservePriceDisplay: formatMoneyDisplayWithPrefix(row['Reserve Price (Rs)']),
          emdAmount,
          emdDisplay: formatMoneyDisplayWithPrefix(row['EMD (Rs)']),
          auctionDate,
          inspectionDate: null,
          stateName: stateName || titleCaseWords(row.State),
          districtName,
          cityName,
          propertyLocation: [cityName, districtName, stateName || titleCaseWords(row.State)]
            .filter(Boolean)
            .join(', '),
          domainStatus: 'verified',
          sortOrder: 100,
        });
      }
    } catch (error) {
      errors.push(
        `Failed to sync IBAPI state ${stateCode}${stateName ? ` (${stateName})` : ''}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  if (!listingsByKey.size) {
    throw new Error('IBAPI sync did not return any active property rows.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let inserted = 0;
    let updated = 0;
    const activeKeys = [];

    for (const listing of listingsByKey.values()) {
      const upsertResult = await client.query(
        `
          INSERT INTO eauction_listings (
            listing_key,
            source_id,
            external_id,
            title,
            summary,
            property_type,
            bank_authority_name,
            source_type,
            official_listing_url,
            official_detail_url,
            notice_pdf_url,
            source_domain,
            login_required,
            bidder_registration_required,
            emd_mentioned,
            reserve_price_amount,
            reserve_price_display,
            emd_amount,
            emd_display,
            auction_date,
            inspection_date,
            state_name,
            district_name,
            city_name,
            property_location,
            domain_status,
            last_checked_at,
            is_active,
            sort_order
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
            $22,
            $23,
            $24,
            $25,
            $26,
            NOW(),
            TRUE,
            $27
          )
          ON CONFLICT (listing_key) WHERE listing_key IS NOT NULL DO UPDATE
          SET
            source_id = EXCLUDED.source_id,
            external_id = EXCLUDED.external_id,
            title = EXCLUDED.title,
            summary = EXCLUDED.summary,
            property_type = EXCLUDED.property_type,
            bank_authority_name = EXCLUDED.bank_authority_name,
            source_type = EXCLUDED.source_type,
            official_listing_url = EXCLUDED.official_listing_url,
            official_detail_url = EXCLUDED.official_detail_url,
            notice_pdf_url = COALESCE(NULLIF(EXCLUDED.notice_pdf_url, ''), eauction_listings.notice_pdf_url),
            source_domain = EXCLUDED.source_domain,
            login_required = EXCLUDED.login_required,
            bidder_registration_required = EXCLUDED.bidder_registration_required,
            emd_mentioned = EXCLUDED.emd_mentioned,
            reserve_price_amount = EXCLUDED.reserve_price_amount,
            reserve_price_display = EXCLUDED.reserve_price_display,
            emd_amount = EXCLUDED.emd_amount,
            emd_display = EXCLUDED.emd_display,
            auction_date = EXCLUDED.auction_date,
            inspection_date = EXCLUDED.inspection_date,
            state_name = EXCLUDED.state_name,
            district_name = EXCLUDED.district_name,
            city_name = EXCLUDED.city_name,
            property_location = EXCLUDED.property_location,
            domain_status = EXCLUDED.domain_status,
            last_checked_at = NOW(),
            is_active = TRUE,
            sort_order = EXCLUDED.sort_order
          RETURNING (xmax = 0) AS inserted_row
        `,
        [
          listing.listingKey,
          source.id,
          listing.externalId,
          listing.title,
          listing.summary,
          listing.propertyType,
          listing.bankAuthorityName,
          listing.sourceType,
          listing.officialListingUrl,
          listing.officialDetailUrl,
          listing.noticePdfUrl,
          listing.sourceDomain,
          listing.loginRequired,
          listing.bidderRegistrationRequired,
          listing.emdMentioned,
          listing.reservePriceAmount,
          listing.reservePriceDisplay,
          listing.emdAmount,
          listing.emdDisplay,
          listing.auctionDate,
          listing.inspectionDate,
          listing.stateName,
          listing.districtName,
          listing.cityName,
          listing.propertyLocation,
          listing.domainStatus,
          listing.sortOrder,
        ]
      );

      if (upsertResult.rows[0]?.inserted_row) inserted += 1;
      else updated += 1;
      activeKeys.push(listing.listingKey);
    }

    const deactivateResult = await client.query(
      `
        UPDATE eauction_listings
        SET
          is_active = FALSE,
          last_checked_at = NOW()
        WHERE source_id = $1
          AND listing_key LIKE 'IBAPI_%'
          AND NOT (listing_key = ANY($2::text[]))
      `,
      [source.id, activeKeys]
    );

    await client.query(
      `
        UPDATE eauction_sources
        SET
          last_checked_at = NOW(),
          domain_status = 'verified'
        WHERE id = $1
      `,
      [source.id]
    );

    await client.query('COMMIT');

    return {
      processed: listingsByKey.size,
      inserted,
      updated,
      deactivated: Number(deactivateResult.rowCount || 0),
      skipped: 0,
      errors,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function refreshOfficialSourceDirectory(pool, skipSourceKeys = new Set()) {
  const result = await pool.query(
    `
      SELECT id, source_key, official_listing_url
      FROM eauction_sources
      WHERE is_active = TRUE
    `
  );

  let checked = 0;
  let healthy = 0;

  for (const row of result.rows) {
    const sourceKey = String(row.source_key || '');
    if (skipSourceKeys.has(sourceKey)) continue;

    const url = normalizeSpace(row.official_listing_url);
    if (!url) continue;

    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: 'GET',
          headers: {
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'accept-language': 'en-IN,en;q=0.9',
            referer: url,
          },
        },
        20000
      );

      await response.body?.cancel();
      checked += 1;

      const healthyStatus = response.status < 500 && response.status !== 404;
      if (healthyStatus) healthy += 1;

      await pool.query(
        `
          UPDATE eauction_sources
          SET
            last_checked_at = NOW(),
            domain_status = $2
          WHERE id = $1
        `,
        [row.id, healthyStatus ? 'verified' : 'review_required']
      );
    } catch {
      // Keep the previous state when a transient request failure occurs.
    }
  }

  return { checked, healthy };
}

export async function runEAuctionSyncJob(pool) {
  const jobResults = [];
  const aggregatedErrors = [];

  for (const job of [syncIbapiListings, syncPnbListings]) {
    try {
      jobResults.push(await job(pool));
    } catch (error) {
      aggregatedErrors.push(error instanceof Error ? error.message : 'Unknown e-auction sync error.');
    }
  }

  const sources = await refreshOfficialSourceDirectory(pool, new Set([IBAPI_SOURCE_KEY, PNB_SOURCE_KEY]));
  const totals = jobResults.reduce(
    (accumulator, item) => ({
      processed: accumulator.processed + Number(item.processed || 0),
      inserted: accumulator.inserted + Number(item.inserted || 0),
      updated: accumulator.updated + Number(item.updated || 0),
      deactivated: accumulator.deactivated + Number(item.deactivated || 0),
      skipped: accumulator.skipped + Number(item.skipped || 0),
      errors: [...accumulator.errors, ...(Array.isArray(item.errors) ? item.errors : [])],
    }),
    { processed: 0, inserted: 0, updated: 0, deactivated: 0, skipped: 0, errors: [] }
  );

  return {
    sourcesChecked: sources.checked,
    sourcesHealthy: sources.healthy,
    processed: totals.processed,
    inserted: totals.inserted,
    updated: totals.updated,
    deactivated: totals.deactivated,
    skipped: totals.skipped,
    errors: [...totals.errors, ...aggregatedErrors],
  };
}
