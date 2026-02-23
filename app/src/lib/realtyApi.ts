import { apiRequest } from './http';

export interface Amenity {
  id: number;
  name: string;
  slug: string;
  category: string;
  iconKey: string;
}

export interface Company {
  id: number;
  code: string;
  name: string;
  companyType: 'builder' | 'dealer';
  city: string;
  state: string;
  area: string;
  address: string;
  website: string;
  phone: string;
  email: string;
  reraNumber: string;
  description: string;
  serviceAreas: string[];
  logoUrl: string;
  bannerUrl: string;
  coverImage: string;
  isVerified: boolean;
  projectCount: number;
  propertyCount: number;
}

export type ConstructionOverallStatus =
  | 'Planning'
  | 'Approved'
  | 'Under Construction'
  | 'Near Completion'
  | 'Completed';
export type ConstructionScheduleStatus = 'on_schedule' | 'slight_delay' | 'major_delay';
export type ConstructionMilestoneStatus = 'completed' | 'in_progress' | 'upcoming';
export type ConstructionUpdateApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ConstructionMilestone {
  key: string;
  label: string;
  status: ConstructionMilestoneStatus;
  statusLabel: 'Completed' | 'In progress' | 'Upcoming';
  completionDate: string | null;
}

export interface ConstructionUpdate {
  id: number;
  projectId: number;
  title: string;
  description: string;
  photoUrls: string[];
  approvalStatus: ConstructionUpdateApprovalStatus;
  reviewNote: string;
  reviewedByUserId: number | null;
  reviewedAt: string | null;
  createdByUserId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectConstructionSummary {
  overallStatus: ConstructionOverallStatus;
  completionPercent: number;
  milestones: ConstructionMilestone[];
  lastUpdatedAt: string | null;
  estimatedCompletionDate: string | null;
  scheduleStatus: ConstructionScheduleStatus;
  scheduleStatusLabel: 'On schedule' | 'Slight delay' | 'Major delay';
  delayReason: string;
  latestUpdate: ConstructionUpdate | null;
  updatesCount: number;
  disclosure: string;
}

export interface Project {
  id: number;
  companyId: number;
  projectName: string;
  projectType: 'Apartment' | 'Villa' | 'Plotted' | 'Commercial';
  state: string;
  city: string;
  area: string;
  fullAddress: string;
  landmark: string;
  latitude: number | null;
  longitude: number | null;
  priceMin: number | null;
  priceMax: number | null;
  pricePerSqft: number | null;
  configurations: string[];
  totalUnits: number | null;
  totalFloors: number | null;
  totalArea: number | null;
  possessionDate: string | null;
  status: 'Upcoming' | 'Under Construction' | 'Ready to Move';
  imageUrls: string[];
  primaryImage: string;
  brochureUrl: string;
  highlights: string;
  amenities: string[];
  construction: ProjectConstructionSummary;
  company?: {
    id: number;
    name: string;
    logoUrl: string;
    isVerified: boolean;
  };
}

export type PropertyPaymentStatus = 'paid' | 'partial' | 'overdue' | 'na';

export interface PropertyUnitPaymentTrack {
  monthlyRent: number | null;
  lastPaymentDate: string;
  dueAmount: number | null;
  status: PropertyPaymentStatus;
}

export interface PropertyUnitLayout {
  id: string;
  label: string;
  sizeSqft: number | null;
  price: number | null;
  isOccupied: boolean;
  occupantName: string;
  payment: PropertyUnitPaymentTrack;
}

export interface PropertyFloorLayout {
  floorNumber: number;
  units: PropertyUnitLayout[];
}

export interface PropertyLayoutDetails {
  floors: PropertyFloorLayout[];
}

export interface PropertyListing {
  id: number;
  companyId: number;
  projectId: number | null;
  title: string;
  propertyType: string;
  listingType: 'sale' | 'rent';
  price: number | null;
  rentPerMonth: number | null;
  rentDeposit: number | null;
  state: string;
  city: string;
  area: string;
  fullAddress: string;
  landmark: string;
  latitude: number | null;
  longitude: number | null;
  areaSqft: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  furnishing: string;
  availabilityDate: string | null;
  imageUrls: string[];
  primaryImage: string;
  description: string;
  layoutDetails: PropertyLayoutDetails;
  amenities: string[];
  company?: {
    id: number;
    name: string;
    logoUrl: string;
    isVerified: boolean;
  };
}

export interface BuilderMembership {
  company: {
    id: number;
    code: string;
    name: string;
    type: 'builder' | 'dealer';
    logoUrl: string;
    maxUsers: number;
  } | null;
  membership: { role: 'owner' | 'member' } | null;
  userCount: number;
  maxUsers: number;
}

export async function getBuilderMembership(token?: string): Promise<BuilderMembership> {
  return apiRequest<BuilderMembership>('/builder/me', {}, token);
}

export async function listAmenities(): Promise<Amenity[]> {
  const response = await apiRequest<{ amenities: Amenity[] }>('/realty/amenities');
  return response.amenities || [];
}

export async function listCompanies(params?: {
  q?: string;
  city?: string;
  verified?: 'all' | 'true' | 'false';
  limit?: number;
}): Promise<Company[]> {
  const search = new URLSearchParams();
  if (params?.q) search.set('q', params.q);
  if (params?.city) search.set('city', params.city);
  if (params?.verified) search.set('verified', params.verified);
  if (params?.limit) search.set('limit', String(params.limit));
  const suffix = search.toString() ? `?${search.toString()}` : '';
  const response = await apiRequest<{ companies: Company[] }>(`/realty/companies${suffix}`);
  return response.companies || [];
}

export async function getCompany(companyId: number): Promise<Company> {
  const response = await apiRequest<{ company: Company }>(`/realty/companies/${companyId}`);
  return response.company;
}

export async function listCompanyProjects(companyId: number): Promise<Project[]> {
  const response = await apiRequest<{ projects: Project[] }>(`/realty/companies/${companyId}/projects`);
  return response.projects || [];
}

export async function listProjects(params?: {
  companyId?: number;
  status?: 'all' | 'Upcoming' | 'Under Construction' | 'Ready to Move';
  limit?: number;
}): Promise<Project[]> {
  const search = new URLSearchParams();
  if (params?.companyId && Number(params.companyId) > 0) {
    search.set('companyId', String(params.companyId));
  }
  if (params?.status) {
    search.set('status', params.status);
  }
  if (params?.limit) {
    search.set('limit', String(params.limit));
  }
  const suffix = search.toString() ? `?${search.toString()}` : '';
  const response = await apiRequest<{ projects: Project[] }>(`/realty/projects${suffix}`);
  return response.projects || [];
}

export async function listCompanyProperties(companyId: number): Promise<PropertyListing[]> {
  const response = await apiRequest<{ properties: PropertyListing[] }>(
    `/realty/companies/${companyId}/properties`
  );
  return response.properties || [];
}

export interface CreateProjectPayload {
  companyId?: number;
  projectName: string;
  projectType: 'Apartment' | 'Villa' | 'Plotted' | 'Commercial';
  state: string;
  city: string;
  area: string;
  fullAddress: string;
  landmark?: string;
  latitude?: number | null;
  longitude?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  pricePerSqft?: number | null;
  configurations?: string[];
  totalUnits?: number | null;
  totalFloors?: number | null;
  totalArea?: number | null;
  possessionDate?: string;
  status: 'Upcoming' | 'Under Construction' | 'Ready to Move';
  imageUrls?: string[];
  brochureUrl?: string;
  highlights?: string;
  amenityIds?: number[];
}

export async function createProject(payload: CreateProjectPayload, token: string): Promise<Project> {
  const response = await apiRequest<{ project: Project }>(
    '/realty/projects',
    { method: 'POST', body: JSON.stringify(payload) },
    token
  );
  return response.project;
}

export async function getProject(projectId: number): Promise<Project> {
  const response = await apiRequest<{ project: Project }>(`/realty/projects/${projectId}`);
  return response.project;
}

export interface UpdateProjectConstructionPayload {
  overallStatus?: ConstructionOverallStatus;
  completionPercent?: number;
  milestones?: Array<{
    key: string;
    status: ConstructionMilestoneStatus;
    completionDate?: string | null;
  }>;
  estimatedCompletionDate?: string | null;
  scheduleStatus?: ConstructionScheduleStatus;
  delayReason?: string;
}

export async function updateProjectConstruction(
  projectId: number,
  payload: UpdateProjectConstructionPayload,
  token: string
): Promise<Project> {
  const response = await apiRequest<{ project: Project }>(
    `/realty/projects/${projectId}/construction`,
    { method: 'PATCH', body: JSON.stringify(payload) },
    token
  );
  return response.project;
}

export interface CreateProjectConstructionUpdatePayload {
  title: string;
  description?: string;
  photoUrls: string[];
}

export async function createProjectConstructionUpdate(
  projectId: number,
  payload: CreateProjectConstructionUpdatePayload,
  token: string
): Promise<ConstructionUpdate> {
  const response = await apiRequest<{ update: ConstructionUpdate }>(
    `/realty/projects/${projectId}/construction-updates`,
    { method: 'POST', body: JSON.stringify(payload) },
    token
  );
  return response.update;
}

export async function listProjectConstructionUpdates(projectId: number): Promise<ConstructionUpdate[]> {
  const response = await apiRequest<{ updates: ConstructionUpdate[] }>(
    `/realty/projects/${projectId}/construction-updates`
  );
  return response.updates || [];
}

export async function listManageProjectConstructionUpdates(
  projectId: number,
  token: string,
  status: 'all' | ConstructionUpdateApprovalStatus = 'all'
): Promise<{ updates: ConstructionUpdate[]; canModerate: boolean }> {
  const params = new URLSearchParams();
  params.set('status', status);
  const response = await apiRequest<{ updates: ConstructionUpdate[]; canModerate: boolean }>(
    `/realty/projects/${projectId}/construction-updates/manage?${params.toString()}`,
    {},
    token
  );
  return {
    updates: response.updates || [],
    canModerate: Boolean(response.canModerate),
  };
}

export interface ReviewProjectConstructionUpdatePayload {
  decision: 'approved' | 'rejected';
  note?: string;
}

export async function reviewProjectConstructionUpdate(
  projectId: number,
  updateId: number,
  payload: ReviewProjectConstructionUpdatePayload,
  token: string
): Promise<ConstructionUpdate> {
  const response = await apiRequest<{ update: ConstructionUpdate }>(
    `/realty/projects/${projectId}/construction-updates/${updateId}/review`,
    { method: 'PATCH', body: JSON.stringify(payload) },
    token
  );
  return response.update;
}

export interface CreatePropertyPayload {
  companyId?: number;
  projectId?: number;
  title: string;
  propertyType: string;
  listingType: 'sale' | 'rent';
  price?: number | null;
  rentPerMonth?: number | null;
  rentDeposit?: number | null;
  state: string;
  city: string;
  area: string;
  fullAddress: string;
  landmark?: string;
  latitude?: number | null;
  longitude?: number | null;
  areaSqft?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  furnishing?: 'furnished' | 'semi_furnished' | 'unfurnished' | 'na';
  availabilityDate?: string;
  imageUrls?: string[];
  description?: string;
  layoutDetails?: PropertyLayoutDetails;
  amenityIds?: number[];
}

export async function createProperty(payload: CreatePropertyPayload, token: string): Promise<PropertyListing> {
  const response = await apiRequest<{ property: PropertyListing }>(
    '/realty/properties',
    { method: 'POST', body: JSON.stringify(payload) },
    token
  );
  return response.property;
}

export async function getProperty(propertyId: number): Promise<PropertyListing> {
  const response = await apiRequest<{ property: PropertyListing }>(`/realty/properties/${propertyId}`);
  return response.property;
}
