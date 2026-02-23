export type PropertyType = 'Plot' | 'Villa' | 'Flat / Apartment' | 'Commercial';
export type InteractionStatus = 'New' | 'Contacted' | 'Scheduled' | 'Closed';
export type ListingApprovalStatus = 'Pending Approval' | 'Approved' | 'Rejected';
export type ListingWorkflowStage = 'Draft' | 'Pending Approval' | 'Approved' | 'Rejected';
export type CallTime = 'Morning' | 'Afternoon' | 'Evening';
export type HelpType = 'Just call and guide me' | 'Team should add my property for me';

export interface HelpConfig {
  needHelp: boolean;
  preferredCallTime: CallTime;
  helpType: HelpType;
}

interface BaseRecord {
  id: string;
  referenceId: string;
  createdAt: string;
  propertyType: PropertyType;
  city: string;
  requesterName: string;
  phone: string;
  assistedListing: boolean;
  interactionStatus: InteractionStatus;
  help: HelpConfig;
}

export interface BuyerRequest extends BaseRecord {
  locality: string;
  budgetMin: number;
  budgetMax: number;
  requirements: Record<string, string | boolean | number>;
  shortlistIdea: boolean;
  mapListIdea: boolean;
}

export interface SellListing extends BaseRecord {
  locality: string;
  address: string;
  mapPin: string;
  expectedPrice: number;
  negotiable: 'Yes' | 'No';
  additionalCharges: string;
  details: Record<string, string | boolean | number>;
  media: {
    imageCount: number;
    hasVideo: boolean;
    hasDocuments: boolean;
  };
  workflowStage: ListingWorkflowStage;
  approvalStatus: ListingApprovalStatus;
}

export interface RentListing extends BaseRecord {
  locality: string;
  address: string;
  mapPin: string;
  monthlyRent: number;
  securityDeposit: number;
  maintenance: 'Included' | 'Separate';
  availableFrom: string;
  leaseDuration: string;
  tenantPreference: Record<string, string | boolean | number>;
  details: Record<string, string | boolean | number>;
  media: {
    imageCount: number;
    hasVideo: boolean;
    hasDocuments: boolean;
  };
  workflowStage: ListingWorkflowStage;
  approvalStatus: ListingApprovalStatus;
}

export interface HelpRequest {
  id: string;
  referenceId: string;
  source: 'buy' | 'sell' | 'rent';
  linkedRecordId: string;
  requesterName: string;
  phone: string;
  propertyType: PropertyType;
  preferredCallTime: CallTime;
  helpType: HelpType;
  assistedListing: boolean;
  interactionStatus: InteractionStatus;
  createdAt: string;
  note: string;
}

export interface WorkflowData {
  buyerRequests: BuyerRequest[];
  sellListings: SellListing[];
  rentListings: RentListing[];
  helpRequests: HelpRequest[];
}

const STORAGE_KEY = 'zdt-realty-workflow-v1';

const defaultData: WorkflowData = {
  buyerRequests: [],
  sellListings: [],
  rentListings: [],
  helpRequests: [],
};

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function readWorkflowData(): WorkflowData {
  if (!canUseLocalStorage()) return defaultData;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultData;

  try {
    const parsed = JSON.parse(raw) as WorkflowData;
    return {
      buyerRequests: parsed.buyerRequests ?? [],
      sellListings: parsed.sellListings ?? [],
      rentListings: parsed.rentListings ?? [],
      helpRequests: parsed.helpRequests ?? [],
    };
  } catch {
    return defaultData;
  }
}

export function writeWorkflowData(data: WorkflowData): void {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function createEntityId(prefix: 'buy' | 'sell' | 'rent' | 'help'): string {
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export function createReferenceId(prefix: 'BUY' | 'SEL' | 'REN' | 'HLP'): string {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = `${now.getMonth() + 1}`.padStart(2, '0');
  const d = `${now.getDate()}`.padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${y}${m}${d}-${rand}`;
}

export function pushBuyerRequest(record: BuyerRequest, helpRequest?: HelpRequest): void {
  const data = readWorkflowData();
  data.buyerRequests.unshift(record);
  if (helpRequest) {
    data.helpRequests.unshift(helpRequest);
  }
  writeWorkflowData(data);
}

export function pushSellListing(record: SellListing, helpRequest?: HelpRequest): void {
  const data = readWorkflowData();
  data.sellListings.unshift(record);
  if (helpRequest) {
    data.helpRequests.unshift(helpRequest);
  }
  writeWorkflowData(data);
}

export function pushRentListing(record: RentListing, helpRequest?: HelpRequest): void {
  const data = readWorkflowData();
  data.rentListings.unshift(record);
  if (helpRequest) {
    data.helpRequests.unshift(helpRequest);
  }
  writeWorkflowData(data);
}

export function createHelpRequest(params: {
  source: 'buy' | 'sell' | 'rent';
  linkedRecordId: string;
  requesterName: string;
  phone: string;
  propertyType: PropertyType;
  help: HelpConfig;
}): HelpRequest {
  return {
    id: createEntityId('help'),
    referenceId: createReferenceId('HLP'),
    source: params.source,
    linkedRecordId: params.linkedRecordId,
    requesterName: params.requesterName,
    phone: params.phone,
    propertyType: params.propertyType,
    preferredCallTime: params.help.preferredCallTime,
    helpType: params.help.helpType,
    assistedListing: params.help.helpType === 'Team should add my property for me',
    interactionStatus: 'New',
    createdAt: new Date().toISOString(),
    note:
      params.help.helpType === 'Team should add my property for me'
        ? 'Assisted listing requested. Team should complete listing.'
        : 'Guidance call requested.',
  };
}

export const propertyTypeOptions: PropertyType[] = [
  'Plot',
  'Villa',
  'Flat / Apartment',
  'Commercial',
];

