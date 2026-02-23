import { apiRequest } from './http';

export type InfraUpdateCategory =
  | 'PROPOSED'
  | 'APPROVED'
  | 'UNDER_CONSTRUCTION'
  | 'COMPLETED';

export type InfraImpactLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type InfraVerificationLevel =
  | 'PUBLIC_NOTICE'
  | 'TENDER'
  | 'SOURCE_ONLY'
  | 'OFFICE_CONFIRMED'
  | 'LOCAL_REPORT'
  | 'UNKNOWN';
export type InfraSortKey = 'smart' | 'newest' | 'impact' | 'verified';
export type InfraLocationScope = 'all' | 'state';

export interface InfraUpdateItem {
  id: number;
  state: string;
  district: string;
  cities: string[];
  category: InfraUpdateCategory;
  projectName: string;
  authority: string;
  projectType: string;
  statusText: string;
  impactLevel: InfraImpactLevel;
  sourceRef: string;
  sourceUrl: string | null;
  verificationLevel: InfraVerificationLevel;
  lastUpdated: string;
  createdAt: string;
}

export interface InfraUpdatesResponse {
  items: InfraUpdateItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface InfraUpdatesMetaResponse {
  states: string[];
  districts: string[];
  cities: string[];
}

function buildQuery(params: Record<string, string | number | null | undefined>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    query.set(key, String(value));
  });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

function trimOrNull(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

export async function getInfraUpdates(params?: {
  scope?: InfraLocationScope;
  stateCode?: string;
  state?: string;
  district?: string;
  city?: string;
  category?: InfraUpdateCategory;
  categories?: InfraUpdateCategory[];
  verificationLevel?: InfraVerificationLevel;
  verificationLevels?: InfraVerificationLevel[];
  q?: string;
  sort?: InfraSortKey;
  page?: number;
  pageSize?: number;
}) {
  return apiRequest<InfraUpdatesResponse>(
    `/api/infra-updates${buildQuery({
      scope: params?.scope,
      state_code: params?.stateCode,
      state: params?.state,
      district: params?.district,
      city: params?.city,
      category: params?.category,
      categories:
        Array.isArray(params?.categories) && params.categories.length > 0
          ? params.categories.join(',')
          : undefined,
      verification_level: params?.verificationLevel,
      verification_levels:
        Array.isArray(params?.verificationLevels) && params.verificationLevels.length > 0
          ? params.verificationLevels.join(',')
          : undefined,
      q: params?.q,
      sort: params?.sort,
      page: params?.page,
      pageSize: params?.pageSize,
    })}`
  );
}

export async function getInfraUpdatesMeta(params?: {
  state?: string;
  district?: string;
  q?: string;
}) {
  return apiRequest<InfraUpdatesMetaResponse>(
    `/api/infra-updates/meta${buildQuery({
      state: params?.state,
      district: params?.district,
      q: params?.q,
    })}`
  );
}

export async function getInfraUpdatesMetaAll(adminToken: string) {
  return apiRequest<InfraUpdatesMetaResponse>('/api/infra-updates/meta-all', {
    headers: {
      'x-admin-token': adminToken.trim(),
    },
  });
}

export async function getRecentVerifiedUpdates(params?: {
  state?: string;
  district?: string;
  city?: string;
  limit?: number;
}) {
  return apiRequest<{ items: InfraUpdateItem[] }>(
    `/api/infra-updates/recent${buildQuery({
      state: params?.state,
      district: params?.district,
      city: params?.city,
      limit: params?.limit,
    })}`
  );
}

export async function getInfraUpdateById(id: number) {
  return apiRequest<{ item: InfraUpdateItem }>(`/api/infra-updates/by-id/${id}`);
}

export interface InfraUpdateWritePayload {
  state: string;
  district: string;
  cities: string[];
  category: InfraUpdateCategory;
  projectName: string;
  authority: string;
  projectType: string;
  statusText: string;
  impactLevel: InfraImpactLevel;
  sourceRef: string;
  sourceUrl: string;
  verificationLevel: InfraVerificationLevel;
  lastUpdated?: string | null;
}

export interface InfraUpdatePatchPayload {
  state?: string;
  district?: string;
  cities?: string[];
  category?: InfraUpdateCategory;
  projectName?: string;
  authority?: string;
  projectType?: string;
  statusText?: string;
  impactLevel?: InfraImpactLevel;
  sourceRef?: string;
  sourceUrl?: string;
  verificationLevel?: InfraVerificationLevel;
  lastUpdated?: string | null;
}

export async function createInfraUpdate(payload: InfraUpdateWritePayload, adminToken: string) {
  return apiRequest<{ item: InfraUpdateItem }>('/api/infra-updates', {
    method: 'POST',
    headers: {
      'x-admin-token': adminToken,
    },
    body: JSON.stringify({
      state: payload.state.trim(),
      district: payload.district.trim(),
      cities: payload.cities.map((city) => city.trim()).filter(Boolean),
      category: payload.category,
      project_name: payload.projectName.trim(),
      authority: payload.authority.trim(),
      project_type: payload.projectType.trim(),
      status_text: payload.statusText.trim(),
      impact_level: payload.impactLevel,
      source_ref: payload.sourceRef.trim(),
      source_url: payload.sourceUrl.trim(),
      verification_level: payload.verificationLevel,
      last_updated: trimOrNull(payload.lastUpdated ?? null),
    }),
  });
}

export async function updateInfraUpdate(
  id: number,
  payload: InfraUpdatePatchPayload,
  adminToken: string
) {
  const body: Record<string, unknown> = {};

  if (payload.state !== undefined) body.state = payload.state.trim();
  if (payload.district !== undefined) body.district = payload.district.trim();
  if (payload.cities !== undefined) {
    body.cities = payload.cities.map((city) => city.trim()).filter(Boolean);
  }
  if (payload.category !== undefined) body.category = payload.category;
  if (payload.projectName !== undefined) body.project_name = payload.projectName.trim();
  if (payload.authority !== undefined) body.authority = payload.authority.trim();
  if (payload.projectType !== undefined) body.project_type = payload.projectType.trim();
  if (payload.statusText !== undefined) body.status_text = payload.statusText.trim();
  if (payload.impactLevel !== undefined) body.impact_level = payload.impactLevel;
  if (payload.sourceRef !== undefined) body.source_ref = payload.sourceRef.trim();
  if (payload.sourceUrl !== undefined) body.source_url = payload.sourceUrl.trim();
  if (payload.verificationLevel !== undefined) body.verification_level = payload.verificationLevel;
  if (payload.lastUpdated !== undefined) body.last_updated = trimOrNull(payload.lastUpdated);

  return apiRequest<{ item: InfraUpdateItem }>(`/api/infra-updates/${id}`, {
    method: 'PUT',
    headers: {
      'x-admin-token': adminToken,
    },
    body: JSON.stringify(body),
  });
}

export async function deleteInfraUpdate(id: number, adminToken: string) {
  return apiRequest<{ ok: boolean }>(`/api/infra-updates/${id}`, {
    method: 'DELETE',
    headers: {
      'x-admin-token': adminToken,
    },
  });
}
