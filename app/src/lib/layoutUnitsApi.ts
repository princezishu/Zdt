import { apiRequest } from './http';

export type UnitType = 'Flat' | 'Room' | 'Shop' | 'Office';
export type UnitCategory = 'Residential' | 'Commercial';
export type UnitListingType = 'Rent' | 'Sale' | 'Lease';
export type UnitStatus = 'Available' | 'Occupied' | 'Maintenance';

export interface LayoutBuilding {
  id: number;
  name: string;
  city: string;
  area: string;
  totalFloors: number | null;
  totalUnits: number | null;
  company: {
    id: number;
    name: string;
  } | null;
}

export interface LayoutFile {
  id: number;
  floorId: number;
  fileUrl: string;
  fileType: 'image' | 'pdf';
  mimeType: string;
  fileSizeBytes: number;
  originalName: string;
  uploadedByUserId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface LayoutFloor {
  id: number;
  buildingId: number;
  floorNumber: number;
  floorName: string;
  createdByUserId: number | null;
  createdAt: string;
  updatedAt: string;
  latestLayout: {
    id: number;
    fileUrl: string;
    fileType: 'image' | 'pdf';
    mimeType: string;
    createdAt: string;
  } | null;
}

export interface UnitRecord {
  id: number;
  floorId: number;
  buildingId: number;
  buildingName: string;
  floorNumber: number;
  floorName: string;
  layoutFileId: number | null;
  unitNumber: string;
  unitType: UnitType;
  category: UnitCategory;
  listingType: UnitListingType;
  areaCovered: number;
  rentAmount: number | null;
  depositAmount: number | null;
  maintenanceAmount: number | null;
  salePrice: number | null;
  leaseAmount: number | null;
  status: UnitStatus;
  occupiedByUserId: number | null;
  createdByUserId: number | null;
  amenityIds: number[];
  amenities: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface LayoutMarker {
  id: number;
  floorId: number;
  unitId: number;
  x: number;
  y: number;
  unitNumber: string;
  unitType: UnitType;
  status: UnitStatus;
  createdAt: string;
  updatedAt: string;
}

export interface UnitPayload {
  floorId: number;
  layoutFileId?: number | null;
  unitNumber: string;
  unitType: UnitType;
  category: UnitCategory;
  listingType: UnitListingType;
  areaCovered: number;
  rentAmount?: number | null;
  depositAmount?: number | null;
  maintenanceAmount?: number | null;
  salePrice?: number | null;
  leaseAmount?: number | null;
  status?: UnitStatus;
  occupiedByUserId?: number | null;
  amenityIds?: number[];
  notes?: string;
  marker?: {
    x: number;
    y: number;
  };
}

export interface UnitUpdatePayload {
  layoutFileId?: number | null;
  unitNumber?: string;
  unitType?: UnitType;
  category?: UnitCategory;
  listingType?: UnitListingType;
  areaCovered?: number;
  rentAmount?: number | null;
  depositAmount?: number | null;
  maintenanceAmount?: number | null;
  salePrice?: number | null;
  leaseAmount?: number | null;
  status?: UnitStatus;
  occupiedByUserId?: number | null;
  amenityIds?: number[];
  notes?: string;
  marker?: {
    x: number;
    y: number;
  };
}

export async function listLayoutBuildings(token: string): Promise<LayoutBuilding[]> {
  const response = await apiRequest<{ buildings: LayoutBuilding[] }>('/api/buildings', {}, token);
  return response.buildings || [];
}

export async function listFloorsByBuilding(buildingId: number, token: string): Promise<LayoutFloor[]> {
  const response = await apiRequest<{ floors: LayoutFloor[] }>(
    `/api/floors?buildingId=${buildingId}`,
    {},
    token
  );
  return response.floors || [];
}

export async function createFloor(payload: {
  buildingId: number;
  floorNumber: number;
  floorName?: string;
}, token: string): Promise<LayoutFloor> {
  const response = await apiRequest<{ floor: LayoutFloor }>(
    '/api/floors',
    { method: 'POST', body: JSON.stringify(payload) },
    token
  );
  return response.floor;
}

export async function uploadFloorLayout(payload: {
  floorId: number;
  fileDataUrl: string;
  originalName?: string;
}, token: string): Promise<LayoutFile> {
  const response = await apiRequest<{ layout: LayoutFile }>(
    '/api/layout/upload',
    { method: 'POST', body: JSON.stringify(payload) },
    token
  );
  return response.layout;
}

export async function getLatestFloorLayout(floorId: number, token: string): Promise<LayoutFile | null> {
  const response = await apiRequest<{ layout: LayoutFile | null }>(`/api/layout/${floorId}/latest`, {}, token);
  return response.layout || null;
}

export async function listUnits(params: {
  buildingId?: number | null;
  floorId?: number | null;
  status?: 'all' | UnitStatus;
  unitType?: 'all' | UnitType;
  category?: 'all' | UnitCategory;
  listingType?: 'all' | UnitListingType;
  areaMin?: number | null;
  areaMax?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  q?: string;
  limit?: number;
}, token: string): Promise<UnitRecord[]> {
  const search = new URLSearchParams();
  if (params.buildingId && params.buildingId > 0) search.set('buildingId', String(params.buildingId));
  if (params.floorId && params.floorId > 0) search.set('floorId', String(params.floorId));
  if (params.status) search.set('status', params.status);
  if (params.unitType) search.set('unitType', params.unitType);
  if (params.category) search.set('category', params.category);
  if (params.listingType) search.set('listingType', params.listingType);
  if (params.areaMin != null) search.set('areaMin', String(params.areaMin));
  if (params.areaMax != null) search.set('areaMax', String(params.areaMax));
  if (params.priceMin != null) search.set('priceMin', String(params.priceMin));
  if (params.priceMax != null) search.set('priceMax', String(params.priceMax));
  if (params.q && params.q.trim()) search.set('q', params.q.trim());
  if (params.limit) search.set('limit', String(params.limit));

  const suffix = search.toString() ? `?${search.toString()}` : '';
  const response = await apiRequest<{ units: UnitRecord[] }>(`/api/units${suffix}`, {}, token);
  return response.units || [];
}

export async function createUnit(payload: UnitPayload, token: string): Promise<UnitRecord> {
  const response = await apiRequest<{ unit: UnitRecord }>(
    '/api/units',
    { method: 'POST', body: JSON.stringify(payload) },
    token
  );
  return response.unit;
}

export async function createUnitsBulk(payload: {
  floorId: number;
  units: Array<Omit<UnitPayload, 'floorId'>>;
}, token: string): Promise<UnitRecord[]> {
  const response = await apiRequest<{ units: UnitRecord[] }>(
    '/api/units/bulk',
    { method: 'POST', body: JSON.stringify(payload) },
    token
  );
  return response.units || [];
}

export async function updateUnit(unitId: number, payload: UnitUpdatePayload, token: string): Promise<UnitRecord> {
  const response = await apiRequest<{ unit: UnitRecord }>(
    `/api/units/${unitId}`,
    { method: 'PUT', body: JSON.stringify(payload) },
    token
  );
  return response.unit;
}

export async function upsertLayoutMarkers(payload: {
  floorId: number;
  markers: Array<{
    unitId: number;
    x: number;
    y: number;
  }>;
}, token: string): Promise<LayoutMarker[]> {
  const response = await apiRequest<{ markers: LayoutMarker[] }>(
    `/api/layout/${payload.floorId}/markers`,
    { method: 'POST', body: JSON.stringify({ markers: payload.markers }) },
    token
  );
  return response.markers || [];
}

export async function listLayoutMarkers(floorId: number, token: string): Promise<LayoutMarker[]> {
  const response = await apiRequest<{ markers: LayoutMarker[] }>(`/api/layout/${floorId}/markers`, {}, token);
  return response.markers || [];
}
