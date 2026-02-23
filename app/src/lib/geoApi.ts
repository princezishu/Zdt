import { apiRequest } from './http';

export interface GeoStateItem {
  code: string;
  name: string;
}

export interface GeoDistrictItem {
  code: string;
  name: string;
  stateCode: string;
  stateName: string;
}

export interface GeoSubdistrictItem {
  code: string;
  name: string;
  districtCode: string;
  districtName: string;
  stateCode: string;
  stateName: string;
}

export interface GeoPlaceItem {
  code: string;
  name: string;
  type: string;
  subdistrictCode: string;
  subdistrictName: string;
  districtCode: string;
  districtName: string;
  stateCode: string;
  stateName: string;
}

interface GeoListResponse<TItem> {
  totalMatched: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  items: TItem[];
}

function buildQuery(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    query.set(key, String(value));
  });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

export async function getGeoStates(params?: { q?: string; limit?: number; offset?: number }) {
  return apiRequest<GeoListResponse<GeoStateItem>>(
    `/api/geo/states${buildQuery({
      q: params?.q?.trim() || undefined,
      limit: params?.limit,
      offset: params?.offset,
    })}`
  );
}

export async function getGeoDistricts(params: {
  stateCode: string;
  q?: string;
  limit?: number;
  offset?: number;
}) {
  return apiRequest<GeoListResponse<GeoDistrictItem>>(
    `/api/geo/districts${buildQuery({
      stateCode: params.stateCode.trim(),
      q: params.q?.trim() || undefined,
      limit: params.limit,
      offset: params.offset,
    })}`
  );
}

export async function getGeoSubdistricts(params: {
  districtCode: string;
  q?: string;
  limit?: number;
  offset?: number;
}) {
  return apiRequest<GeoListResponse<GeoSubdistrictItem>>(
    `/api/geo/subdistricts${buildQuery({
      districtCode: params.districtCode.trim(),
      q: params.q?.trim() || undefined,
      limit: params.limit,
      offset: params.offset,
    })}`
  );
}

export async function getGeoPlaces(params: {
  subdistrictCode: string;
  q?: string;
  limit?: number;
  offset?: number;
}) {
  return apiRequest<GeoListResponse<GeoPlaceItem>>(
    `/api/geo/places${buildQuery({
      subdistrictCode: params.subdistrictCode.trim(),
      q: params.q?.trim() || undefined,
      limit: params.limit,
      offset: params.offset,
    })}`
  );
}
