import { apiRequest } from './http';

export type BuildingType = 'residential' | 'commercial' | 'mixed';
export type RentStatus = 'paid' | 'unpaid' | 'not_applicable';
export type PaymentMethod = 'cash' | 'upi' | 'bank';

export interface BuildingSummary {
  id: string;
  name: string;
  address: string;
  type: BuildingType;
  isSold: boolean;
  soldAt: string | null;
  soldNote: string | null;
  createdBy: number;
  createdAt: string;
  totalFloors: number;
  totalRooms: number;
  paidThisMonth: number;
  pendingThisMonth: number;
  totalCollectedThisMonth: number;
  totalPendingAmount: number;
}

export interface RoomPayment {
  id: string | null;
  roomId: string;
  monthKey: string;
  status: RentStatus;
  dueDate: string | null;
  paidDate: string | null;
  amountPaid: number | null;
  penaltyAmount: number;
  paymentMethod: PaymentMethod | null;
  updatedBy: number | null;
  updatedAt: string | null;
}

export interface RoomRecord {
  id: string;
  buildingId: string;
  floorNumber: number;
  roomLabel: string;
  rentAmount: number;
  tenantName: string;
  tenantPhone: string;
  tenantJoinedOn: string | null;
  createdAt: string;
  currentMonthPayment: RoomPayment;
}

export interface CreateBuildingPayload {
  name: string;
  address: string;
  type: BuildingType;
  roomCount?: number;
  floorCount?: number;
  roomsPerFloor?: number;
  defaultRent: number;
  defaultDueDate?: string | null;
}

export interface GenerateRoomsPayload {
  count: number;
  floorNumber: number;
  defaultRent: number;
  defaultDueDate?: string | null;
}

export interface UpdateRoomPayload {
  roomLabel?: string;
  floorNumber?: number;
  rentAmount?: number;
  tenantName?: string;
  tenantPhone?: string;
  tenantJoinedOn?: string | null;
  dueDate?: string | null;
}

export interface MarkPaidPayload {
  monthKey?: string;
  dueDate?: string | null;
  paidDate?: string | null;
  amountPaid?: number;
  paymentMethod?: PaymentMethod;
}

export interface MarkUnpaidPayload {
  monthKey?: string;
  dueDate?: string | null;
}

export interface RoomHistoryItem {
  id: string;
  roomId: string;
  monthKey: string;
  status: RentStatus;
  dueDate: string | null;
  paidDate: string | null;
  amountPaid: number | null;
  penaltyAmount: number;
  paymentMethod: PaymentMethod | null;
  updatedBy: number | null;
  updatedAt: string;
}

export interface DeleteRoomResponse {
  message: string;
  room: {
    id: string;
    buildingId: string;
    floorNumber: number;
    roomLabel: string;
  };
}

export interface BulkDeleteRoomsResponse {
  message: string;
  deletedCount: number;
  deletedRooms: Array<{
    id: string;
    buildingId: string;
    floorNumber: number;
    roomLabel: string;
  }>;
}

export interface UpdateBuildingSoldPayload {
  isSold?: boolean;
  soldNote?: string | null;
}

export interface SendRentAlertPayload {
  monthKey?: string;
  message?: string | null;
  includeOnlyUnpaid?: boolean;
  roomIds?: string[];
}

export async function listApartmentComplexBuildings(
  token: string,
  params?: { month?: string; limit?: number }
): Promise<{ monthKey: string; buildings: BuildingSummary[] }> {
  const search = new URLSearchParams();
  if (params?.month) {
    search.set('month', params.month);
  }
  if (params?.limit) {
    search.set('limit', String(params.limit));
  }
  const suffix = search.toString() ? `?${search.toString()}` : '';
  return apiRequest<{ monthKey: string; buildings: BuildingSummary[] }>(
    `/api/apartment-complex/buildings${suffix}`,
    {},
    token
  );
}

export async function createApartmentBuilding(
  payload: CreateBuildingPayload,
  token: string
): Promise<{ monthKey: string; building: BuildingSummary }> {
  return apiRequest<{ monthKey: string; building: BuildingSummary }>(
    '/api/apartment-complex/buildings',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token
  );
}

export async function getApartmentBuildingDetails(
  buildingId: string,
  token: string,
  month?: string
): Promise<{ monthKey: string; building: BuildingSummary; rooms: RoomRecord[] }> {
  const search = new URLSearchParams();
  if (month) {
    search.set('month', month);
  }
  const suffix = search.toString() ? `?${search.toString()}` : '';
  return apiRequest<{ monthKey: string; building: BuildingSummary; rooms: RoomRecord[] }>(
    `/api/apartment-complex/buildings/${buildingId}${suffix}`,
    {},
    token
  );
}

export async function updateApartmentBuildingSold(
  buildingId: string,
  payload: UpdateBuildingSoldPayload,
  token: string
): Promise<{ message: string; monthKey: string; building: BuildingSummary }> {
  return apiRequest<{ message: string; monthKey: string; building: BuildingSummary }>(
    `/api/apartment-complex/buildings/${buildingId}/sold`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    token
  );
}

export async function sendApartmentRentAlert(
  buildingId: string,
  payload: SendRentAlertPayload,
  token: string
): Promise<{
  message: string;
  building: { id: string; name: string };
  monthKey: string;
  deliveredCount: number;
  failedCount: number;
}> {
  return apiRequest<{
    message: string;
    building: { id: string; name: string };
    monthKey: string;
    deliveredCount: number;
    failedCount: number;
  }>(
    `/api/apartment-complex/buildings/${buildingId}/rent-alert`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token
  );
}

export async function generateBuildingRooms(
  buildingId: string,
  payload: GenerateRoomsPayload,
  token: string
): Promise<{
  message: string;
  monthKey: string;
  rooms: Array<{ id: string; floorNumber: number; roomLabel: string; rentAmount: number }>;
}> {
  return apiRequest<{
    message: string;
    monthKey: string;
    rooms: Array<{ id: string; floorNumber: number; roomLabel: string; rentAmount: number }>;
  }>(
    `/api/apartment-complex/buildings/${buildingId}/rooms/generate`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token
  );
}

export async function updateApartmentRoom(
  roomId: string,
  payload: UpdateRoomPayload,
  token: string
): Promise<{ room: Omit<RoomRecord, 'currentMonthPayment'> }> {
  return apiRequest<{ room: Omit<RoomRecord, 'currentMonthPayment'> }>(
    `/api/apartment-complex/rooms/${roomId}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    token
  );
}

export async function deleteApartmentRoom(
  roomId: string,
  token: string
): Promise<DeleteRoomResponse> {
  return apiRequest<DeleteRoomResponse>(
    `/api/apartment-complex/rooms/${roomId}`,
    {
      method: 'DELETE',
    },
    token
  );
}

export async function deleteApartmentRoomsBulk(
  roomIds: string[],
  token: string
): Promise<BulkDeleteRoomsResponse> {
  return apiRequest<BulkDeleteRoomsResponse>(
    '/api/apartment-complex/rooms/delete-bulk',
    {
      method: 'POST',
      body: JSON.stringify({ roomIds }),
    },
    token
  );
}

export async function markRoomPaid(
  roomId: string,
  payload: MarkPaidPayload,
  token: string
): Promise<{ message: string; payment: RoomPayment }> {
  return apiRequest<{ message: string; payment: RoomPayment }>(
    `/api/apartment-complex/rooms/${roomId}/rent/mark-paid`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token
  );
}

export async function markRoomUnpaid(
  roomId: string,
  payload: MarkUnpaidPayload,
  token: string
): Promise<{ message: string; payment: RoomPayment }> {
  return apiRequest<{ message: string; payment: RoomPayment }>(
    `/api/apartment-complex/rooms/${roomId}/rent/mark-unpaid`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token
  );
}

export async function getRoomRentHistory(
  roomId: string,
  token: string,
  limit = 24
): Promise<{
  room: { id: string; roomLabel: string; buildingId: string; floorNumber: number };
  history: RoomHistoryItem[];
}> {
  return apiRequest<{
    room: { id: string; roomLabel: string; buildingId: string; floorNumber: number };
    history: RoomHistoryItem[];
  }>(`/api/apartment-complex/rooms/${roomId}/rent/history?limit=${limit}`, {}, token);
}
