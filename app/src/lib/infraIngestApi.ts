import { API_BASE_URL } from './api';
import { apiRequest } from './http';
import type {
  InfraImpactLevel,
  InfraUpdateCategory,
  InfraVerificationLevel,
} from './infrastructureApi';
import { readOrCreateDeviceId, readToken } from './session';

export type InfraIngestStatus = 'NEW' | 'IGNORED' | 'PUBLISHED';

export interface InfraIngestItem {
  id: number;
  sourceKey: string;
  itemGuid: string;
  title: string;
  link: string;
  publishedAt: string | null;
  summary: string | null;
  status: InfraIngestStatus;
  publishedUpdateId: number | null;
  ignoredReason: string | null;
  createdAt: string;
}

export interface InfraIngestDupeItem {
  id: number;
  projectName: string;
  state: string;
  district: string;
  cities: string[];
  lastUpdated: string;
  sourceUrl: string | null;
}

interface IngestItemsResponse {
  items: InfraIngestItem[];
}

interface IngestPublishSuccessResponse {
  ok: true;
  published_update_id?: number;
  publishedUpdateId?: number;
}

interface IngestPublishErrorResponse {
  error?: string;
  dupes?: unknown;
}

export interface InfraIngestPublishPayload {
  state: string;
  district: string;
  cities: string[];
  category: InfraUpdateCategory;
  impactLevel: InfraImpactLevel;
  authority: string;
  projectType: string;
  statusText: string;
  verificationLevel?: InfraVerificationLevel;
  sourceRef?: string;
  lastUpdated?: string | null;
  force?: boolean;
}

export type InfraIngestPublishResult =
  | { ok: true; publishedUpdateId: number }
  | { ok: false; status: number; error: string; dupes: InfraIngestDupeItem[] };

function buildQuery(params: Record<string, string | null | undefined>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    query.set(key, value);
  });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

function toErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (typeof record.error === 'string' && record.error.trim()) {
      return record.error;
    }
  }
  return `Request failed (${status})`;
}

function toDupeRows(payload: unknown): InfraIngestDupeItem[] {
  if (!payload || typeof payload !== 'object') return [];
  const rows = (payload as { dupes?: unknown }).dupes;
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const record = row as Record<string, unknown>;
      const id = Number(record.id);
      if (!Number.isFinite(id) || id <= 0) return null;
      const cities = Array.isArray(record.cities)
        ? record.cities.map((city) => String(city)).filter(Boolean)
        : [];
      return {
        id,
        projectName: String(record.projectName ?? record.project_name ?? ''),
        state: String(record.state ?? ''),
        district: String(record.district ?? ''),
        cities,
        lastUpdated: String(record.lastUpdated ?? record.last_updated ?? ''),
        sourceUrl:
          record.sourceUrl == null && record.source_url == null
            ? null
            : String(record.sourceUrl ?? record.source_url ?? ''),
      };
    })
    .filter((row): row is InfraIngestDupeItem => Boolean(row));
}

export async function getInfraIngestItems(
  params: { status?: InfraIngestStatus | ''; q?: string },
  adminToken: string
) {
  return apiRequest<IngestItemsResponse>(
    `/api/infra-ingest${buildQuery({
      status: params.status || undefined,
      q: params.q?.trim() || undefined,
    })}`,
    {
      headers: {
        'x-admin-token': adminToken.trim(),
      },
    }
  );
}

export async function ignoreInfraIngestItem(id: number, reason: string, adminToken: string) {
  return apiRequest<{ ok: boolean }>(`/api/infra-ingest/${id}/ignore`, {
    method: 'POST',
    headers: {
      'x-admin-token': adminToken.trim(),
    },
    body: JSON.stringify({
      reason: reason.trim() || undefined,
    }),
  });
}

export async function publishInfraIngestItem(
  id: number,
  payload: InfraIngestPublishPayload,
  adminToken: string
): Promise<InfraIngestPublishResult> {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'x-admin-token': adminToken.trim(),
    'X-Device-Id': readOrCreateDeviceId(),
  });
  const token = readToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}/api/infra-ingest/${id}/publish`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      state: payload.state.trim(),
      district: payload.district.trim(),
      cities: payload.cities.map((city) => city.trim()).filter(Boolean),
      category: payload.category,
      impact_level: payload.impactLevel,
      authority: payload.authority.trim(),
      project_type: payload.projectType.trim(),
      status_text: payload.statusText.trim(),
      verification_level: payload.verificationLevel || undefined,
      source_ref: payload.sourceRef?.trim() || undefined,
      last_updated: payload.lastUpdated?.trim() ? payload.lastUpdated.trim() : null,
      force: payload.force === true,
    }),
  });

  let data: IngestPublishSuccessResponse | IngestPublishErrorResponse = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: toErrorMessage(data, response.status),
      dupes: toDupeRows(data),
    };
  }

  const successData = data as IngestPublishSuccessResponse;
  const publishedUpdateId = Number(
    successData.published_update_id ?? successData.publishedUpdateId ?? 0
  );
  return {
    ok: true,
    publishedUpdateId: Number.isFinite(publishedUpdateId) ? publishedUpdateId : 0,
  };
}
