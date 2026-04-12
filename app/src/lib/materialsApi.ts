import { apiRequest } from './http';
import type { DalalCoinPreview, DalalCoinRewardResult, DalalCoinWalletSummary } from './dalalCoinApi';
import type { RazorpayCheckoutPayload, RazorpayCheckoutSuccessPayload } from './razorpayCheckout';

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

export interface MaterialCheckoutOrderItem {
  itemId: string;
  itemCode: string;
  itemName: string;
  category: string;
  brand: string;
  unit: string;
  unitPrice: number;
  quantity: number;
  lineSubtotal: number;
  locationCity: string;
}

export interface MaterialEcommerceOrder {
  id: number;
  orderReference: string;
  userId: number;
  billingOrderId: number | null;
  status: string;
  totalAmount: number;
  subtotalAmount: number;
  deliveryAmount: number;
  discountPercent: number;
  coinsUsed: number;
  coinDiscountAmount: number;
  finalAmount: number;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  shippingCity: string;
  shippingAddress: string;
  notes: string;
  orderItems: MaterialCheckoutOrderItem[];
  metadata: Record<string, unknown>;
  paidAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
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

export type CircularBuildStatus =
  | 'submitted'
  | 'under_review'
  | 'inspection_required'
  | 'inspection_not_required'
  | 'approved'
  | 'rejected'
  | 'picked_up'
  | 'closed';

export type CircularBuildSellerType = 'homeowner' | 'builder' | 'developer';

export interface CircularBuildRequestMaterial {
  materialCategory: string;
  materialName: string;
  approxQuantity: string;
}

export interface CircularBuildRequestEvent {
  id: number;
  requestId: string;
  status: CircularBuildStatus;
  statusLabel: string;
  note: string;
  createdByUserId: number | null;
  createdByName: string;
  createdAt: string;
}

export interface CircularBuildRequest {
  id: string;
  requestCode: string;
  sellerType: CircularBuildSellerType;
  materials: CircularBuildRequestMaterial[];
  materialCategory: string;
  materialName: string;
  approxQuantity: string;
  locationCity: string;
  locationAddress: string;
  description: string;
  photoUrls: string[];
  contactName: string;
  contactPhone: string;
  status: CircularBuildStatus;
  statusLabel: string;
  adminPublicNote: string;
  adminInternalNote?: string;
  valuationInr?: number | null;
  submittedByUserId?: number | null;
  submittedByName?: string;
  submittedByEmail?: string;
  pickedUpAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  events: CircularBuildRequestEvent[];
}

export interface CircularBuildRequestsSummary {
  total: number;
  submitted: number;
  underReview: number;
  inspectionRequired: number;
  inspectionNotRequired: number;
  approved: number;
  rejected: number;
  pickedUp: number;
  closed: number;
}

export interface CircularBuildRequestsResponse {
  requests: CircularBuildRequest[];
  summary: CircularBuildRequestsSummary;
}

export interface CreateCircularBuildRequestPayload {
  sellerType?: CircularBuildSellerType;
  materials: CircularBuildRequestMaterial[];
  locationCity: string;
  locationAddress: string;
  description?: string;
  photoUrls: string[];
  contactName?: string;
  contactPhone: string;
  consentOwnership: true;
  consentLegal: true;
}

export interface UpdateCircularBuildRequestStatusPayload {
  status: CircularBuildStatus;
  publicNote?: string;
  internalNote?: string;
  valuationInr?: number;
}

export async function createCircularBuildRequest(
  token: string,
  payload: CreateCircularBuildRequestPayload
) {
  return apiRequest<{ message: string; request: CircularBuildRequest }>(
    '/api/materials/reuse-requests',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token
  );
}

export async function getMyCircularBuildRequests(
  token: string,
  params?: {
    limit?: number;
  }
) {
  return apiRequest<CircularBuildRequestsResponse>(
    `/api/materials/reuse-requests/mine${buildQuery(params || {})}`,
    {},
    token
  );
}

export async function getAdminCircularBuildRequests(
  token: string,
  params?: {
    status?: 'all' | CircularBuildStatus;
    city?: string;
    q?: string;
    limit?: number;
  }
) {
  return apiRequest<CircularBuildRequestsResponse>(
    `/api/materials/admin/reuse-requests${buildQuery(params || {})}`,
    {},
    token
  );
}

export async function updateCircularBuildRequestStatus(
  token: string,
  requestId: string,
  payload: UpdateCircularBuildRequestStatusPayload
) {
  return apiRequest<{ message: string; request: CircularBuildRequest }>(
    `/api/materials/admin/reuse-requests/${requestId}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    token
  );
}

export async function createMaterialsCheckout(
  input: {
    items: Array<{ itemId: string; quantity: number }>;
    contactName: string;
    contactPhone: string;
    contactEmail?: string;
    shippingCity: string;
    shippingAddress: string;
    notes?: string;
    coinsRequested?: number;
  }
) {
  return apiRequest<{
    ecommerceOrder: MaterialEcommerceOrder;
    billingOrder: {
      id: number;
      amount: number;
      status: string;
    };
    dalalCoinQuote: DalalCoinPreview;
    checkout: RazorpayCheckoutPayload;
  }>('/api/materials/checkout/create', {
    method: 'POST',
    body: JSON.stringify({
      items: input.items,
      contactName: input.contactName,
      contactPhone: input.contactPhone,
      contactEmail: input.contactEmail || '',
      shippingCity: input.shippingCity,
      shippingAddress: input.shippingAddress,
      notes: input.notes || '',
      coinsRequested: input.coinsRequested || 0,
    }),
  });
}

export async function verifyMaterialsCheckout(input: {
  billingOrderId: number;
  ecommerceOrderId: number;
  payment: RazorpayCheckoutSuccessPayload;
}) {
  return apiRequest<{
    ok: boolean;
    message: string;
    billingOrder: {
      id: number;
      amount: number;
      status: string;
    };
    ecommerceOrder: MaterialEcommerceOrder;
    dalalCoinRewards?: DalalCoinRewardResult | null;
    wallet?: DalalCoinWalletSummary;
  }>('/api/materials/checkout/verify', {
    method: 'POST',
    body: JSON.stringify({
      billingOrderId: input.billingOrderId,
      ecommerceOrderId: input.ecommerceOrderId,
      razorpayOrderId: input.payment.razorpay_order_id,
      razorpayPaymentId: input.payment.razorpay_payment_id,
      razorpaySignature: input.payment.razorpay_signature,
    }),
  });
}

export async function getMyMaterialsOrders(limit = 20) {
  return apiRequest<{ orders: MaterialEcommerceOrder[] }>(
    `/api/materials/orders/mine${buildQuery({ limit })}`
  );
}
