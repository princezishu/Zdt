import { apiRequest } from './http';

export type MaterialSort = 'featured' | 'price_asc' | 'price_desc' | 'delivery_fast';

export interface MaterialItem {
  id: string;
  itemCode: string;
  itemName: string;
  category: string;
  brand: string;
  unit: string;
  unitPrice: number;
  minOrderQty: number;
  deliveryDays: number;
  locationCity: string;
  imageUrl: string | null;
  description: string;
  bulkSlab1: string;
  bulkSlab2: string;
  stockStatus: 'in_stock' | 'limited' | 'out_of_stock';
}

export interface MaterialItemsResponse {
  items: MaterialItem[];
  filters: {
    categories: string[];
    cities: string[];
    brands: string[];
  };
  pagination: {
    total: number;
    limit: number;
  };
  lastUpdated: string | null;
  dataSource: string;
}

export interface MaterialMetaResponse {
  categories: string[];
  cities: string[];
  brands: string[];
  sortValues: MaterialSort[];
}

export interface CreateMaterialItemPayload {
  itemName: string;
  category: string;
  brand: string;
  unit: string;
  unitPrice: number;
  minOrderQty?: number;
  deliveryDays?: number;
  locationCity: string;
  imageUrl?: string;
  description?: string;
  bulkSlab1?: string;
  bulkSlab2?: string;
  stockStatus?: 'in_stock' | 'limited' | 'out_of_stock';
}

function buildQuery(params: Record<string, string | number | null | undefined>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    query.set(key, String(value));
  });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

export async function getBuildingMaterials(params?: {
  q?: string;
  category?: string;
  city?: string;
  sort?: MaterialSort;
  limit?: number;
}) {
  return apiRequest<MaterialItemsResponse>(`/api/materials/items${buildQuery(params || {})}`);
}

export async function getBuildingMaterialsMeta() {
  return apiRequest<MaterialMetaResponse>('/api/materials/meta');
}

export async function updateMaterialItemPhoto(
  token: string,
  itemId: string,
  imageUrl: string
) {
  return apiRequest<{ message: string; item: MaterialItem }>(
    `/api/materials/admin/items/${itemId}/photo`,
    {
      method: 'PUT',
      body: JSON.stringify({ imageUrl }),
    },
    token
  );
}

export async function createMaterialItem(
  token: string,
  payload: CreateMaterialItemPayload
) {
  return apiRequest<{ message: string; item: MaterialItem }>(
    '/api/materials/admin/items',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token
  );
}
