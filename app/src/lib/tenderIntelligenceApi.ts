import { apiRequest } from './http';

export type TenderIntelligenceSourceType =
  | 'government_tender'
  | 'government_notice'
  | 'award'
  | 'private_opportunity'
  | 'village_signal';

export type TenderIntelligenceTrack = 'government' | 'private';
export type TenderIntelligenceImpactLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type TenderIntelligenceVerificationLevel =
  | 'OFFICIAL_PORTAL'
  | 'OFFICIAL_DEPARTMENT_SITE'
  | 'PUBLIC_NOTICE_PRESS_RELEASE'
  | 'MARKET_SOURCE'
  | 'UNKNOWN';
export type TenderIntelligenceSortKey = 'smart' | 'newest' | 'impact' | 'verified' | 'budget';

export interface TenderIntelligenceItem {
  id: number;
  track: TenderIntelligenceTrack;
  sourceType: TenderIntelligenceSourceType;
  sourceName: string;
  sourceUrl: string | null;
  externalId: string | null;
  legacyUpdateId: number | null;
  projectName: string;
  statusText: string;
  authority: string;
  projectType: string;
  category: string;
  impactLevel: TenderIntelligenceImpactLevel;
  sourceRef: string;
  verificationLevel: TenderIntelligenceVerificationLevel;
  lastUpdated: string;
  state: string;
  district: string;
  blockName: string;
  villageName: string;
  lgdStateCode: string;
  lgdDistrictCode: string;
  lgdBlockCode: string;
  lgdVillageCode: string;
  cities: string[];
  budgetAmount: number | null;
  emdAmount: number | null;
  tenderStatus: string | null;
  publishedAt: string | null;
  bidEndAt: string | null;
  openingAt: string | null;
  documentUrls: string[];
  impactScore: number;
}

export interface TenderIntelligenceResponse {
  items: TenderIntelligenceItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
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

export async function getTenderIntelligence(params?: {
  scope?: 'all' | 'state';
  track?: TenderIntelligenceTrack;
  state?: string;
  district?: string;
  category?: string;
  categories?: string[];
  sourceType?: TenderIntelligenceSourceType;
  sourceTypes?: TenderIntelligenceSourceType[];
  verificationLevel?: TenderIntelligenceVerificationLevel;
  verificationLevels?: TenderIntelligenceVerificationLevel[];
  q?: string;
  sort?: TenderIntelligenceSortKey;
  page?: number;
  pageSize?: number;
}) {
  return apiRequest<TenderIntelligenceResponse>(
    `/api/tender-intelligence${buildQuery({
      scope: params?.scope,
      track: params?.track,
      state: params?.state,
      district: params?.district,
      category: params?.category,
      categories:
        Array.isArray(params?.categories) && params.categories.length > 0
          ? params.categories.join(',')
          : undefined,
      source_type: params?.sourceType,
      source_types:
        Array.isArray(params?.sourceTypes) && params.sourceTypes.length > 0
          ? params.sourceTypes.join(',')
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

export async function getRecentTenderIntelligence(params?: {
  state?: string;
  district?: string;
  city?: string;
  limit?: number;
}) {
  return apiRequest<{ items: TenderIntelligenceItem[] }>(
    `/api/tender-intelligence/recent${buildQuery({
      state: params?.state,
      district: params?.district,
      city: params?.city,
      limit: params?.limit,
    })}`
  );
}
