import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const serviceFilePath = fileURLToPath(import.meta.url);
const servicesDir = path.dirname(serviceFilePath);
const serverRootDir = path.resolve(servicesDir, '..', '..');
const DEFAULT_VILLAGE_DATA_PATH = path.resolve(serverRootDir, 'data', 'village-directory.csv');
const configuredDataPath = String(process.env.INDIA_VILLAGE_DATA_PATH || '').trim();
const VILLAGE_DATA_PATH = configuredDataPath
  ? path.isAbsolute(configuredDataPath)
    ? configuredDataPath
    : path.resolve(serverRootDir, configuredDataPath)
  : DEFAULT_VILLAGE_DATA_PATH;

const directoryCache = {
  dataPath: VILLAGE_DATA_PATH,
  mtimeMs: 0,
  loadedAt: '',
  loadingPromise: null,
  entries: [],
  prefixBuckets: new Map(),
  states: [],
  districtsByState: new Map(),
  subdistrictsByDistrict: new Map(),
  placesBySubdistrict: new Map(),
};

function normalizeForSearch(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      const nextChar = line[index + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  fields.push(current);
  return fields.map((value) => value.trim());
}

function ensureColumnIndexes(headerColumns) {
  const columnIndex = new Map();
  headerColumns.forEach((column, index) => {
    columnIndex.set(column, index);
  });

  const requiredColumns = {
    stateCode: 'State code',
    villageCode: 'Village code',
    villageName: 'Village Name(In English)',
    districtCode: 'District code',
    subdistrictName: 'Subdistrict Name(In English)',
    subdistrictCode: 'Subdistrict code',
    districtName: 'District Name(In English)',
    stateName: 'State Name(In English)',
  };

  const resolvedIndexes = {};
  for (const [key, columnName] of Object.entries(requiredColumns)) {
    const index = columnIndex.get(columnName);
    if (!Number.isInteger(index)) {
      throw new Error(`India village dataset missing column: ${columnName}`);
    }
    resolvedIndexes[key] = index;
  }

  const localbodyCodeIndex = columnIndex.get('Localbody Code');
  const localbodyNameIndex = columnIndex.get('Localbody Name(In English)');
  resolvedIndexes.localbodyCode = Number.isInteger(localbodyCodeIndex) ? localbodyCodeIndex : -1;
  resolvedIndexes.localbodyName = Number.isInteger(localbodyNameIndex) ? localbodyNameIndex : -1;

  return resolvedIndexes;
}

function compareByNameThenCode(a, b) {
  const nameCompare = String(a.name || '').localeCompare(String(b.name || ''));
  if (nameCompare !== 0) return nameCompare;
  return String(a.code || '').localeCompare(String(b.code || ''));
}

function normalizeCode(value) {
  return String(value || '').trim();
}

function applySearchAndLimit(items, q, limit, offset = 0) {
  const clampedLimit = Math.max(1, Math.min(50, Number(limit) || 50));
  const clampedOffset = Math.max(0, Number(offset) || 0);
  const normalizedQuery = normalizeForSearch(q || '');

  if (!normalizedQuery) {
    const pagedItems = items.slice(clampedOffset, clampedOffset + clampedLimit);
    return {
      totalMatched: items.length,
      offset: clampedOffset,
      limit: clampedLimit,
      hasMore: clampedOffset + pagedItems.length < items.length,
      items: pagedItems,
    };
  }

  const matched = items.filter((item) => {
    const searchable = normalizeForSearch(
      `${item.name || ''} ${item.code || ''} ${item.stateName || ''} ${item.districtName || ''} ${item.subdistrictName || ''}`
    );
    return searchable.includes(normalizedQuery);
  });

  const pagedItems = matched.slice(clampedOffset, clampedOffset + clampedLimit);
  return {
    totalMatched: matched.length,
    offset: clampedOffset,
    limit: clampedLimit,
    hasMore: clampedOffset + pagedItems.length < matched.length,
    items: pagedItems,
  };
}

function getPrefixesFromText(text) {
  const prefixes = new Set();
  const tokens = normalizeForSearch(text)
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);

  tokens.forEach((token) => {
    const maxLength = Math.min(3, token.length);
    for (let length = 1; length <= maxLength; length += 1) {
      prefixes.add(`${length}:${token.slice(0, length)}`);
    }
  });

  return prefixes;
}

function addToPrefixBucket(prefixBuckets, prefixKey, entryIndex) {
  const current = prefixBuckets.get(prefixKey);
  if (!current) {
    prefixBuckets.set(prefixKey, [entryIndex]);
    return;
  }
  current.push(entryIndex);
}

function isSubsequence(query, text) {
  if (!query || !text) return false;
  let queryIndex = 0;
  for (let index = 0; index < text.length && queryIndex < query.length; index += 1) {
    if (text[index] === query[queryIndex]) {
      queryIndex += 1;
    }
  }
  return queryIndex === query.length;
}

function scoreEntry(entry, normalizedQuery) {
  let score = 0;
  if (entry.villageNormalized.startsWith(normalizedQuery)) score += 260;
  else if (entry.villageNormalized.includes(normalizedQuery)) score += 190;

  if (entry.subdistrictNormalized.startsWith(normalizedQuery)) score += 160;
  else if (entry.subdistrictNormalized.includes(normalizedQuery)) score += 120;

  if (entry.districtNormalized.startsWith(normalizedQuery)) score += 130;
  else if (entry.districtNormalized.includes(normalizedQuery)) score += 100;

  if (entry.stateNormalized.startsWith(normalizedQuery)) score += 90;
  else if (entry.stateNormalized.includes(normalizedQuery)) score += 70;

  if (entry.searchNormalized.includes(normalizedQuery)) score += 60;
  if (score === 0 && isSubsequence(normalizedQuery, entry.searchNormalized)) {
    score = 45;
  }

  return score;
}

async function loadDirectoryFromDisk(dataPath) {
  if (!fs.existsSync(dataPath)) {
    const error = new Error(
      `India village dataset not found at ${dataPath}. Run: npm run prepare:india-villages`
    );
    error.code = 'INDIA_VILLAGE_DATA_MISSING';
    throw error;
  }

  const stat = fs.statSync(dataPath);
  if (
    directoryCache.entries.length > 0 &&
    directoryCache.mtimeMs === stat.mtimeMs &&
    directoryCache.dataPath === dataPath
  ) {
    return directoryCache;
  }

  const entries = [];
  const prefixBuckets = new Map();
  const statesMap = new Map();
  const districtsByStateBuilders = new Map();
  const subdistrictsByDistrictBuilders = new Map();
  const placesBySubdistrictBuilders = new Map();

  const stream = fs.createReadStream(dataPath, { encoding: 'utf8' });
  const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let lineNumber = 0;
  let columnIndexes = null;
  const villageCodeSeen = new Set();

  for await (const line of reader) {
    if (!line || !line.trim()) {
      continue;
    }

    const columns = parseCsvLine(line);
    if (lineNumber === 0) {
      columnIndexes = ensureColumnIndexes(columns);
      lineNumber += 1;
      continue;
    }
    lineNumber += 1;

    const stateCode = normalizeCode(columns[columnIndexes.stateCode]);
    const districtCode = normalizeCode(columns[columnIndexes.districtCode]);
    const subdistrictCode = normalizeCode(columns[columnIndexes.subdistrictCode]);
    const villageCode = String(columns[columnIndexes.villageCode] || '').trim();
    const village = String(columns[columnIndexes.villageName] || '').trim();
    const localbodyCode =
      columnIndexes.localbodyCode >= 0
        ? String(columns[columnIndexes.localbodyCode] || '').trim()
        : '';
    const localbodyName =
      columnIndexes.localbodyName >= 0
        ? String(columns[columnIndexes.localbodyName] || '').trim()
        : '';
    const subdistrict = String(columns[columnIndexes.subdistrictName] || '').trim();
    const district = String(columns[columnIndexes.districtName] || '').trim();
    const state = String(columns[columnIndexes.stateName] || '').trim();

    if (!village) {
      continue;
    }

    const entryId = villageCode || `row-${lineNumber}`;
    if (villageCode && villageCodeSeen.has(villageCode)) {
      continue;
    }
    if (villageCode) {
      villageCodeSeen.add(villageCode);
    }

    const villageNormalized = normalizeForSearch(village);
    const subdistrictNormalized = normalizeForSearch(subdistrict);
    const districtNormalized = normalizeForSearch(district);
    const stateNormalized = normalizeForSearch(state);
    const searchNormalized = normalizeForSearch(`${village} ${subdistrict} ${district} ${state}`);

    if (!villageNormalized) {
      continue;
    }

    const entry = {
      id: entryId,
      stateCode,
      districtCode,
      subdistrictCode,
      villageCode,
      village,
      subdistrict,
      district,
      state,
      villageNormalized,
      subdistrictNormalized,
      districtNormalized,
      stateNormalized,
      searchNormalized,
    };

    const entryIndex = entries.length;
    entries.push(entry);

    const prefixes = getPrefixesFromText(`${village} ${subdistrict} ${district} ${state}`);
    prefixes.forEach((prefixKey) => {
      addToPrefixBucket(prefixBuckets, prefixKey, entryIndex);
    });

    if (stateCode && state) {
      if (!statesMap.has(stateCode)) {
        statesMap.set(stateCode, {
          code: stateCode,
          name: state,
        });
      }
    }

    if (stateCode && districtCode && district) {
      if (!districtsByStateBuilders.has(stateCode)) {
        districtsByStateBuilders.set(stateCode, new Map());
      }
      const stateDistricts = districtsByStateBuilders.get(stateCode);
      if (!stateDistricts.has(districtCode)) {
        stateDistricts.set(districtCode, {
          code: districtCode,
          name: district,
          stateCode,
          stateName: state,
        });
      }
    }

    if (districtCode && subdistrictCode && subdistrict) {
      if (!subdistrictsByDistrictBuilders.has(districtCode)) {
        subdistrictsByDistrictBuilders.set(districtCode, new Map());
      }
      const districtSubdistricts = subdistrictsByDistrictBuilders.get(districtCode);
      if (!districtSubdistricts.has(subdistrictCode)) {
        districtSubdistricts.set(subdistrictCode, {
          code: subdistrictCode,
          name: subdistrict,
          districtCode,
          districtName: district,
          stateCode,
          stateName: state,
        });
      }
    }

    if (subdistrictCode && villageCode && village) {
      if (!placesBySubdistrictBuilders.has(subdistrictCode)) {
        placesBySubdistrictBuilders.set(subdistrictCode, new Map());
      }
      const subdistrictPlaces = placesBySubdistrictBuilders.get(subdistrictCode);
      if (!subdistrictPlaces.has(villageCode)) {
        subdistrictPlaces.set(villageCode, {
          code: villageCode,
          name: village,
          type: 'VILLAGE',
          subdistrictCode,
          subdistrictName: subdistrict,
          districtCode,
          districtName: district,
          stateCode,
          stateName: state,
        });
      }
    }

    if (subdistrictCode && localbodyCode && localbodyName) {
      if (!placesBySubdistrictBuilders.has(subdistrictCode)) {
        placesBySubdistrictBuilders.set(subdistrictCode, new Map());
      }
      const subdistrictPlaces = placesBySubdistrictBuilders.get(subdistrictCode);
      const localbodyKey = `LB-${localbodyCode}`;
      if (!subdistrictPlaces.has(localbodyKey)) {
        subdistrictPlaces.set(localbodyKey, {
          code: localbodyKey,
          name: localbodyName,
          type: 'CITY_OR_LOCAL_BODY',
          subdistrictCode,
          subdistrictName: subdistrict,
          districtCode,
          districtName: district,
          stateCode,
          stateName: state,
        });
      }
    }
  }

  const states = Array.from(statesMap.values()).sort(compareByNameThenCode);

  const districtsByState = new Map();
  districtsByStateBuilders.forEach((districtMap, stateCode) => {
    const rows = Array.from(districtMap.values()).sort(compareByNameThenCode);
    districtsByState.set(stateCode, rows);
  });

  const subdistrictsByDistrict = new Map();
  subdistrictsByDistrictBuilders.forEach((subdistrictMap, districtCode) => {
    const rows = Array.from(subdistrictMap.values()).sort(compareByNameThenCode);
    subdistrictsByDistrict.set(districtCode, rows);
  });

  const placesBySubdistrict = new Map();
  placesBySubdistrictBuilders.forEach((placeMap, subdistrictCode) => {
    const rows = Array.from(placeMap.values()).sort(compareByNameThenCode);
    placesBySubdistrict.set(subdistrictCode, rows);
  });

  directoryCache.dataPath = dataPath;
  directoryCache.entries = entries;
  directoryCache.prefixBuckets = prefixBuckets;
  directoryCache.states = states;
  directoryCache.districtsByState = districtsByState;
  directoryCache.subdistrictsByDistrict = subdistrictsByDistrict;
  directoryCache.placesBySubdistrict = placesBySubdistrict;
  directoryCache.mtimeMs = stat.mtimeMs;
  directoryCache.loadedAt = new Date().toISOString();
  return directoryCache;
}

async function ensureVillageDirectoryLoaded() {
  if (directoryCache.loadingPromise) {
    return directoryCache.loadingPromise;
  }

  directoryCache.loadingPromise = loadDirectoryFromDisk(VILLAGE_DATA_PATH).finally(() => {
    directoryCache.loadingPromise = null;
  });
  return directoryCache.loadingPromise;
}

function resolveCandidateIndexes(prefixBuckets, query) {
  const q = normalizeForSearch(query);
  if (!q) return [];

  if (q.length >= 3) {
    const bucket = prefixBuckets.get(`3:${q.slice(0, 3)}`);
    if (bucket && bucket.length > 0) {
      return bucket;
    }
  }
  if (q.length >= 2) {
    const bucket = prefixBuckets.get(`2:${q.slice(0, 2)}`);
    if (bucket && bucket.length > 0) {
      return bucket;
    }
  }

  const bucket = prefixBuckets.get(`1:${q.slice(0, 1)}`);
  if (bucket && bucket.length > 0) {
    return bucket;
  }

  return [];
}

export async function suggestIndiaVillages({ query, limit = 80 }) {
  const normalizedQuery = normalizeForSearch(query);
  if (!normalizedQuery) {
    return { suggestions: [], totalMatched: 0 };
  }

  const cache = await ensureVillageDirectoryLoaded();
  const clampedLimit = Math.max(1, Math.min(200, Number(limit) || 80));
  const candidates = resolveCandidateIndexes(cache.prefixBuckets, normalizedQuery);
  const candidateIndexes =
    candidates.length > 0 ? candidates : cache.entries.map((_, index) => index);

  const scored = [];
  for (let i = 0; i < candidateIndexes.length; i += 1) {
    const entry = cache.entries[candidateIndexes[i]];
    const score = scoreEntry(entry, normalizedQuery);
    if (score <= 0) continue;
    scored.push({ entry, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const villageCompare = a.entry.village.localeCompare(b.entry.village);
    if (villageCompare !== 0) return villageCompare;
    const districtCompare = a.entry.district.localeCompare(b.entry.district);
    if (districtCompare !== 0) return districtCompare;
    return a.entry.state.localeCompare(b.entry.state);
  });

  return {
    totalMatched: scored.length,
    suggestions: scored.slice(0, clampedLimit).map(({ entry }) => ({
      id: entry.id,
      villageCode: entry.villageCode,
      village: entry.village,
      subdistrict: entry.subdistrict,
      district: entry.district,
      state: entry.state,
      label: [entry.village, entry.subdistrict, entry.district, entry.state]
        .filter(Boolean)
        .join(', '),
    })),
  };
}

export function getIndiaVillageDirectoryStatus() {
  const datasetExists = fs.existsSync(VILLAGE_DATA_PATH);
  return {
    datasetPath: VILLAGE_DATA_PATH,
    datasetExists,
    loaded: directoryCache.entries.length > 0,
    loadedAt: directoryCache.loadedAt || null,
    villageCount: directoryCache.entries.length,
    stateCount: directoryCache.states.length,
  };
}

export async function listIndiaStates({ q = '', limit = 50, offset = 0 } = {}) {
  const cache = await ensureVillageDirectoryLoaded();
  return applySearchAndLimit(cache.states, q, limit, offset);
}

export async function listIndiaDistricts({ stateCode, q = '', limit = 50, offset = 0 }) {
  const normalizedStateCode = normalizeCode(stateCode);
  if (!normalizedStateCode) {
    return applySearchAndLimit([], q, limit, offset);
  }

  const cache = await ensureVillageDirectoryLoaded();
  const rows = cache.districtsByState.get(normalizedStateCode) || [];
  return applySearchAndLimit(rows, q, limit, offset);
}

export async function listIndiaSubdistricts({ districtCode, q = '', limit = 50, offset = 0 }) {
  const normalizedDistrictCode = normalizeCode(districtCode);
  if (!normalizedDistrictCode) {
    return applySearchAndLimit([], q, limit, offset);
  }

  const cache = await ensureVillageDirectoryLoaded();
  const rows = cache.subdistrictsByDistrict.get(normalizedDistrictCode) || [];
  return applySearchAndLimit(rows, q, limit, offset);
}

export async function listIndiaPlaces({ subdistrictCode, q = '', limit = 50, offset = 0 }) {
  const normalizedSubdistrictCode = normalizeCode(subdistrictCode);
  if (!normalizedSubdistrictCode) {
    return applySearchAndLimit([], q, limit, offset);
  }

  const cache = await ensureVillageDirectoryLoaded();
  const rows = cache.placesBySubdistrict.get(normalizedSubdistrictCode) || [];
  return applySearchAndLimit(rows, q, limit, offset);
}
