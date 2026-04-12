import { API_BASE_URL } from './api';
import { apiRequest } from './http';

export type GroupDealStatus =
  | 'ACTIVE'
  | 'MIN_REACHED'
  | 'CONFIRMED'
  | 'FULL'
  | 'EXPIRED'
  | 'PAUSED'
  | 'CANCELLED';

export type GroupDealUnitType = '2BHK' | '3BHK' | 'SHOP' | 'PLOT';
export type GroupDealType = 'FLAT_DISCOUNT' | 'PERCENT_DISCOUNT' | 'CONFIRM_LATER';
export type GroupDealSortKey = 'most_active' | 'ending_soon' | 'newest';
export type GroupDealLocationScope = 'all' | 'state';
export type GroupDealRequestStatus = 'NEW' | 'APPROVED' | 'REJECTED' | 'AUTO_CREATED';

export interface GroupDealItem {
  id: number;
  dealCode: string;
  propertyId: number | null;
  projectName: string;
  builderName: string;
  builderVerified: boolean;
  stateCode: string;
  stateName: string;
  cityName: string;
  unitType: GroupDealUnitType;
  basePrice: number | null;
  dealType: GroupDealType;
  discountValue: number | null;
  minBuyers: number;
  maxBuyers: number | null;
  joinedBuyers: number;
  validUntil: string;
  status: GroupDealStatus;
  finalGroupPrice: number | null;
  finalDiscountNote: string;
  bookingProcessSteps: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  daysLeft: number | null;
  progressPercent: number;
  canJoin: boolean;
  mandatoryDisclaimer: string;
}

export interface GroupDealListResponse {
  items: GroupDealItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface GroupDealJoinPayload {
  fullName: string;
  phone?: string;
  email?: string;
  unitPreference: GroupDealUnitType;
  consent: true;
  allowBuilderContactBeforeCompletion?: boolean;
}

export interface GroupDealJoinResponse {
  ok: boolean;
  message: string;
  dealCode: string;
  item: GroupDealItem;
  sharePath: string;
}

export interface GroupDealRequestCreatePayload {
  propertyId: number;
  fullName: string;
  phone?: string;
  email?: string;
  note?: string;
  consent: true;
}

export interface GroupDealRequestCreateResponse {
  ok: boolean;
  requestId: number;
  message: string;
}

export interface GroupDealRequestItem {
  id: number;
  propertyId: number;
  propertyTitle: string;
  propertyType: string;
  bedrooms: number | null;
  possessionStatus: string;
  propertyVerified: boolean;
  groupDealPriority: number | null;
  groupDealPriorityLabel: string;
  companyName: string;
  companyType: string;
  companyPropertyCount: number;
  fullName: string;
  phone: string;
  email: string;
  requestNote: string;
  status: GroupDealRequestStatus;
  source: string;
  sourceIp: string;
  createdDealId: number | null;
  createdDealCode: string;
  adminNote: string;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GroupDealRequestListResponse {
  items: GroupDealRequestItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface GroupDealAdminCreatePayload {
  propertyId?: number | null;
  projectName: string;
  builderName: string;
  builderVerified?: boolean;
  stateCode: string;
  stateName: string;
  cityName: string;
  unitType: GroupDealUnitType;
  basePrice?: number | null;
  dealType: GroupDealType;
  discountValue?: number | null;
  minBuyers: number;
  maxBuyers?: number | null;
  validUntil: string;
  builderContactName?: string;
  builderContactPhone?: string;
  builderContactEmail?: string;
  notes?: string;
}

export interface GroupDealAdminPatchPayload {
  status?: GroupDealStatus;
  builderVerified?: boolean;
  dealType?: GroupDealType;
  basePrice?: number | null;
  discountValue?: number | null;
  minBuyers?: number;
  maxBuyers?: number | null;
  validUntil?: string;
  finalGroupPrice?: number | null;
  finalDiscountNote?: string;
  bookingProcessSteps?: string;
  notes?: string;
}

export interface GroupDealJoinAdminItem {
  id: number;
  fullName: string;
  phone: string;
  email: string;
  unitPreference: GroupDealUnitType;
  consent: boolean;
  allowBuilderContactBeforeCompletion: boolean;
  joinStatus: 'JOINED' | 'WITHDRAWN';
  sourceIp: string;
  createdAt: string;
}

function buildQuery(params: Record<string, string | number | boolean | null | undefined>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    query.set(key, String(value));
  });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

export async function getGroupDeals(params?: {
  scope?: GroupDealLocationScope;
  stateCode?: string;
  unitType?: GroupDealUnitType;
  verifiedOnly?: boolean;
  minPrice?: number;
  maxPrice?: number;
  sort?: GroupDealSortKey;
  status?: GroupDealStatus;
  page?: number;
  pageSize?: number;
}) {
  return apiRequest<GroupDealListResponse>(
    `/api/group-deals${buildQuery({
      scope: params?.scope,
      state_code: params?.stateCode,
      unit_type: params?.unitType,
      verified_only: params?.verifiedOnly ? 'true' : undefined,
      min_price: params?.minPrice,
      max_price: params?.maxPrice,
      sort: params?.sort,
      status: params?.status,
      page: params?.page,
      pageSize: params?.pageSize,
    })}`
  );
}

export async function getGroupDealByCode(dealCode: string) {
  return apiRequest<{ item: GroupDealItem }>(
    `/api/group-deals/${encodeURIComponent(String(dealCode || '').trim())}`
  );
}

export async function getPropertyGroupDeal(propertyId: number) {
  return apiRequest<{ item: GroupDealItem | null }>(
    `/api/group-deals/property/${encodeURIComponent(String(propertyId))}`
  );
}

export async function joinGroupDeal(dealCode: string, payload: GroupDealJoinPayload) {
  return apiRequest<GroupDealJoinResponse>(
    `/api/group-deals/${encodeURIComponent(String(dealCode || '').trim())}/join`,
    {
      method: 'POST',
      body: JSON.stringify({
        fullName: payload.fullName.trim(),
        phone: String(payload.phone || '').trim(),
        email: String(payload.email || '').trim(),
        unitPreference: payload.unitPreference,
        consent: true,
        allowBuilderContactBeforeCompletion: Boolean(payload.allowBuilderContactBeforeCompletion),
      }),
    }
  );
}

export async function createGroupDealRequest(payload: GroupDealRequestCreatePayload) {
  return apiRequest<GroupDealRequestCreateResponse>('/api/group-deals/requests', {
    method: 'POST',
    body: JSON.stringify({
      propertyId: Number(payload.propertyId),
      fullName: payload.fullName.trim(),
      phone: String(payload.phone || '').trim(),
      email: String(payload.email || '').trim(),
      note: String(payload.note || '').trim(),
      consent: true,
    }),
  });
}

export async function adminGetGroupDeals(
  _adminToken: string,
  params?: {
    status?: GroupDealStatus;
    q?: string;
    page?: number;
    pageSize?: number;
  }
) {
  return apiRequest<GroupDealListResponse>(
    `/api/group-deals/admin/deals${buildQuery({
      status: params?.status,
      q: params?.q,
      page: params?.page,
      pageSize: params?.pageSize,
    })}`
  );
}

export async function adminGetGroupDealRequests(
  _adminToken: string,
  params?: {
    status?: GroupDealRequestStatus;
    q?: string;
    page?: number;
    pageSize?: number;
  }
) {
  return apiRequest<GroupDealRequestListResponse>(
    `/api/group-deals/admin/requests${buildQuery({
      status: params?.status,
      q: params?.q,
      page: params?.page,
      pageSize: params?.pageSize,
    })}`
  );
}

export async function adminCreateGroupDeal(
  _adminToken: string,
  payload: GroupDealAdminCreatePayload
) {
  return apiRequest<{ item: GroupDealItem }>('/api/group-deals/admin/deals', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function adminUpdateGroupDeal(
  _adminToken: string,
  dealCode: string,
  payload: GroupDealAdminPatchPayload
) {
  return apiRequest<{ item: GroupDealItem }>(
    `/api/group-deals/admin/deals/${encodeURIComponent(String(dealCode || '').trim())}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  );
}

export async function adminUpdateGroupDealRequest(
  _adminToken: string,
  requestId: number,
  payload: {
    status: 'NEW' | 'APPROVED' | 'REJECTED';
    adminNote?: string;
  }
) {
  return apiRequest<{ item: GroupDealRequestItem }>(
    `/api/group-deals/admin/requests/${encodeURIComponent(String(requestId))}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        status: payload.status,
        adminNote: String(payload.adminNote || '').trim(),
      }),
    }
  );
}

export async function adminApproveCreateGroupDealRequest(
  _adminToken: string,
  requestId: number,
  payload?: {
    minBuyers?: number;
    maxBuyers?: number | null;
    validDays?: number;
    unitType?: GroupDealUnitType;
    dealType?: GroupDealType;
    discountValue?: number | null;
    builderVerified?: boolean;
    adminNote?: string;
  }
) {
  return apiRequest<{ message: string; item: GroupDealItem; request: GroupDealRequestItem }>(
    `/api/group-deals/admin/requests/${encodeURIComponent(String(requestId))}/approve-create-draft`,
    {
      method: 'POST',
      body: JSON.stringify({
        minBuyers: payload?.minBuyers,
        maxBuyers: payload?.maxBuyers,
        validDays: payload?.validDays,
        unitType: payload?.unitType,
        dealType: payload?.dealType,
        discountValue: payload?.discountValue,
        builderVerified: payload?.builderVerified,
        adminNote: payload?.adminNote,
      }),
    }
  );
}

export async function adminGetGroupDealJoins(
  _adminToken: string,
  dealCode: string
) {
  return apiRequest<{ dealCode: string; items: GroupDealJoinAdminItem[] }>(
    `/api/group-deals/admin/deals/${encodeURIComponent(String(dealCode || '').trim())}/joins`
  );
}

export async function adminDownloadGroupDealJoinsCsv(
  _adminToken: string,
  dealCode: string
) {
  const response = await fetch(
    `${API_BASE_URL}/api/group-deals/admin/deals/${encodeURIComponent(
      String(dealCode || '').trim()
    )}/joins?format=csv`,
    {
      credentials: 'include',
    }
  );

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data = await response.json();
      if (data && typeof data.error === 'string' && data.error.trim()) {
        message = data.error;
      }
    } catch {
      // Ignore parse failures and return generic error.
    }
    throw new Error(message);
  }

  return response.blob();
}
