import { apiRequest } from './http';

export interface NewsSourceFilter {
  id: string;
  name: string;
  rssUrl: string;
  isActive: boolean;
}

export interface NewsArticle {
  id: string;
  sourceId: string;
  source: string;
  title: string;
  url: string;
  imageUrl: string | null;
  snippet: string | null;
  category: string | null;
  publishedAt: string | null;
  createdAt: string;
  clickCount: number;
}

export interface NewsFeedResponse {
  items: NewsArticle[];
  trending: NewsArticle[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
  filters: {
    sources: NewsSourceFilter[];
    categories: string[];
  };
  lastUpdated: string | null;
  dataSource: string;
}

export interface MarketCitySnapshot {
  city: string;
  period: string;
  avgPriceSqft: number;
  momChange: number | null;
  yoyChange: number | null;
  source: string;
  fetchedAt: string;
}

export interface MarketTopCitiesResponse {
  cities: MarketCitySnapshot[];
  allCities: string[];
  lastUpdated: string | null;
  dataSource: string;
}

export interface MarketTrendResponse {
  city: string;
  trend: MarketCitySnapshot[];
  lastUpdated: string | null;
  dataSource: string;
}

export interface MarketCompareSummary {
  highestPriceCity: MarketCitySnapshot | null;
  fastestGrowthCity: {
    city: string;
    metric: string;
    value: number;
  } | null;
}

export interface MarketCompareResponse {
  cities: string[];
  latest: MarketCitySnapshot[];
  trend: MarketCitySnapshot[];
  series: Array<Record<string, string | number | null>>;
  summary: MarketCompareSummary;
  lastUpdated: string | null;
  dataSource: string;
}

export interface ProjectBuilderFilter {
  id: string;
  builderName: string;
  sourceType: string;
  sourceUrl: string;
  isActive: boolean;
}

export interface ProjectAnnouncement {
  id: string;
  builderSourceId: string;
  builderName: string;
  sourceType: string;
  sourceUrl: string;
  title: string;
  url: string;
  city: string | null;
  locality: string | null;
  priceHint: string | null;
  priceHintValue: number | null;
  possessionHint: string | null;
  status: string;
  publishedAt: string | null;
  createdAt: string;
}

export interface ProjectAnnouncementsResponse {
  announcements: ProjectAnnouncement[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
  filters: {
    builders: ProjectBuilderFilter[];
    cities: string[];
    statuses: string[];
  };
  lastUpdated: string | null;
  dataSource: string;
}

export interface ProjectAnnouncementDetailResponse {
  announcement: ProjectAnnouncement;
  timeline: ProjectAnnouncement[];
  dataSource: string;
}

export interface AdminJobRun {
  id: string;
  jobName: string;
  status: 'success' | 'fail';
  startedAt: string;
  finishedAt: string;
  itemsFetched: number;
  itemsInserted: number;
  error: string | null;
}

export interface AdminNewsSource {
  id: string;
  name: string;
  rssUrl: string;
  isActive: boolean;
  createdAt: string;
  articleCount?: number;
}

export interface AdminBuilderSource {
  id: string;
  builderName: string;
  sourceType: string;
  sourceUrl: string;
  isActive: boolean;
  createdAt: string;
  announcementCount?: number;
}

function buildQuery(params: Record<string, string | number | boolean | null | undefined>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    query.set(key, String(value));
  });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

export async function getInsightsNews(params?: {
  source?: string;
  category?: string;
  search?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}) {
  return apiRequest<NewsFeedResponse>(`/api/insights/news${buildQuery(params || {})}`);
}

export async function trackNewsArticleClick(articleId: string) {
  return apiRequest<{ ok: boolean }>(`/api/insights/news/${articleId}/click`, {
    method: 'POST',
  });
}

export async function getMarketTopCities(limit = 10) {
  return apiRequest<MarketTopCitiesResponse>(`/api/insights/market/top-cities${buildQuery({ limit })}`);
}

export async function getMarketTrend(city: string, limit = 36) {
  return apiRequest<MarketTrendResponse>(`/api/insights/market/trend${buildQuery({ city, limit })}`);
}

export async function getMarketCompare(cities: string[], months = 36) {
  return apiRequest<MarketCompareResponse>(
    `/api/insights/market/compare${buildQuery({ cities: cities.join(','), months })}`
  );
}

export async function getProjectAnnouncements(params?: {
  builder?: string;
  city?: string;
  status?: string;
  search?: string;
  fromDate?: string;
  toDate?: string;
  budgetMin?: number;
  budgetMax?: number;
  limit?: number;
  offset?: number;
}) {
  return apiRequest<ProjectAnnouncementsResponse>(
    `/api/insights/projects/announcements${buildQuery(params || {})}`
  );
}

export async function getProjectAnnouncementDetail(announcementId: string) {
  return apiRequest<ProjectAnnouncementDetailResponse>(
    `/api/insights/projects/announcements/${announcementId}`
  );
}

export async function getAdminInsightsNewsSources(token: string) {
  return apiRequest<{ sources: AdminNewsSource[] }>('/api/admin/insights/news-sources', {}, token);
}

export async function createAdminInsightsNewsSource(
  token: string,
  payload: { name: string; rssUrl: string; isActive?: boolean }
) {
  return apiRequest<{ source: AdminNewsSource }>(
    '/api/admin/insights/news-sources',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token
  );
}

export async function updateAdminInsightsNewsSource(
  token: string,
  id: string,
  payload: { name?: string; rssUrl?: string; isActive?: boolean }
) {
  return apiRequest<{ source: AdminNewsSource }>(
    `/api/admin/insights/news-sources/${id}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    token
  );
}

export async function runAdminNewsRefresh(token: string) {
  return apiRequest<{
    status: 'success' | 'fail';
    itemsFetched: number;
    itemsInserted: number;
    startedAt: string;
    finishedAt: string;
    note?: string;
    errors?: string[];
  }>('/api/admin/insights/run/news', { method: 'POST' }, token);
}

export async function runAdminMarketRefresh(token: string) {
  return apiRequest<{
    status: 'success' | 'fail';
    itemsFetched: number;
    itemsInserted: number;
    startedAt: string;
    finishedAt: string;
    note?: string;
    errors?: string[];
  }>('/api/admin/insights/run/market', { method: 'POST' }, token);
}

export async function getAdminInsightsBuilderSources(token: string) {
  return apiRequest<{ sources: AdminBuilderSource[] }>('/api/admin/insights/builder-sources', {}, token);
}

export async function createAdminInsightsBuilderSource(
  token: string,
  payload: { builderName: string; sourceType?: 'rss'; sourceUrl: string; isActive?: boolean }
) {
  return apiRequest<{ source: AdminBuilderSource }>(
    '/api/admin/insights/builder-sources',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token
  );
}

export async function updateAdminInsightsBuilderSource(
  token: string,
  id: string,
  payload: { builderName?: string; sourceType?: 'rss'; sourceUrl?: string; isActive?: boolean }
) {
  return apiRequest<{ source: AdminBuilderSource }>(
    `/api/admin/insights/builder-sources/${id}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    token
  );
}

export async function runAdminProjectsRefresh(token: string) {
  return apiRequest<{
    status: 'success' | 'fail';
    itemsFetched: number;
    itemsInserted: number;
    startedAt: string;
    finishedAt: string;
    errors?: string[];
  }>('/api/admin/insights/run/projects', { method: 'POST' }, token);
}

export async function getAdminInsightsJobRuns(token: string, limit = 50) {
  return apiRequest<{ runs: AdminJobRun[] }>(
    `/api/admin/insights/job-runs${buildQuery({ limit })}`,
    {},
    token
  );
}
