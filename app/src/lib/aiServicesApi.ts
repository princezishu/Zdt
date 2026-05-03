import { apiRequest } from './http';

export type AiServiceKey =
  | 'plot-polygon'
  | 'home-design'
  | 'interior-design'
  | 'construction-planning'
  | 'apartment-management'
  | 'property-valuation'
  | 'document-assistant'
  | 'structural-analysis'
  | 'energy-optimizer'
  | 'neighborhood-analyzer';

export type AiServiceAction =
  | 'analyze'
  | 'generate'
  | 'plan'
  | 'estimate'
  | 'draft';

export interface AiServiceCatalogItem {
  key: AiServiceKey;
  title: string;
  category: string;
  actions: AiServiceAction[];
  stage: string;
  summary: string;
  capabilities: string[];
  inputHints: string[];
}

export interface AiProviderStatusItem {
  key: string;
  configured: boolean;
  model: string;
  region?: string;
}

export interface AiProviderStatus {
  preference: string;
  providers: AiProviderStatusItem[];
}

export interface AiServiceAttachment {
  type?: string;
  name?: string;
  url?: string;
  mimeType?: string;
  text?: string;
}

export interface AiServiceRunInput {
  prompt?: string;
  language?: string;
  inputs?: Record<string, unknown>;
  context?: Record<string, unknown>;
  attachments?: AiServiceAttachment[];
  outputDetail?: 'brief' | 'standard' | 'detailed';
  [key: string]: unknown;
}

export interface AiServiceRunResult {
  summary: string;
  output: Record<string, unknown>;
  assumptions: string[];
  risks: string[];
  nextActions: string[];
  confidence: number;
}

export interface AiServiceRunResponse {
  service: {
    key: AiServiceKey;
    title: string;
    category: string;
    action: AiServiceAction;
    stage: string;
  };
  provider: {
    source: string;
    model: string;
    configured: boolean;
  };
  result: AiServiceRunResult;
  warnings: string[];
  generatedAt: string;
}

export interface AiServicesCatalogResponse {
  services: AiServiceCatalogItem[];
  providerStatus: AiProviderStatus;
}

const defaultActionByService: Record<AiServiceKey, AiServiceAction> = {
  'plot-polygon': 'analyze',
  'home-design': 'generate',
  'interior-design': 'generate',
  'construction-planning': 'plan',
  'apartment-management': 'analyze',
  'property-valuation': 'estimate',
  'document-assistant': 'draft',
  'structural-analysis': 'analyze',
  'energy-optimizer': 'analyze',
  'neighborhood-analyzer': 'analyze',
};

export async function getAiServicesCatalog(): Promise<AiServicesCatalogResponse> {
  return apiRequest<AiServicesCatalogResponse>('/api/ai-services/catalog');
}

export async function getAiService(serviceKey: AiServiceKey): Promise<{
  service: AiServiceCatalogItem;
  providerStatus: AiProviderStatus;
}> {
  return apiRequest(`/api/ai-services/${serviceKey}`);
}

export async function getAiServicesProviderStatus(): Promise<{
  providerStatus: AiProviderStatus;
}> {
  return apiRequest('/api/ai-services/provider-status');
}

export async function runAiService(
  serviceKey: AiServiceKey,
  input: AiServiceRunInput,
  action: AiServiceAction = defaultActionByService[serviceKey]
): Promise<AiServiceRunResponse> {
  return apiRequest<AiServiceRunResponse>(`/api/ai-services/${serviceKey}/${action}`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function analyzePlotPolygon(input: AiServiceRunInput): Promise<AiServiceRunResponse> {
  return runAiService('plot-polygon', input, 'analyze');
}

export function generateHomeDesign(input: AiServiceRunInput): Promise<AiServiceRunResponse> {
  return runAiService('home-design', input, 'generate');
}

export function generateInteriorDesign(input: AiServiceRunInput): Promise<AiServiceRunResponse> {
  return runAiService('interior-design', input, 'generate');
}

export function planConstruction(input: AiServiceRunInput): Promise<AiServiceRunResponse> {
  return runAiService('construction-planning', input, 'plan');
}

export function analyzeApartmentManagement(input: AiServiceRunInput): Promise<AiServiceRunResponse> {
  return runAiService('apartment-management', input, 'analyze');
}

export function estimatePropertyValue(input: AiServiceRunInput): Promise<AiServiceRunResponse> {
  return runAiService('property-valuation', input, 'estimate');
}

export function draftPropertyDocument(input: AiServiceRunInput): Promise<AiServiceRunResponse> {
  return runAiService('document-assistant', input, 'draft');
}

export function analyzeStructuralRisk(input: AiServiceRunInput): Promise<AiServiceRunResponse> {
  return runAiService('structural-analysis', input, 'analyze');
}

export function analyzeEnergyOptimization(input: AiServiceRunInput): Promise<AiServiceRunResponse> {
  return runAiService('energy-optimizer', input, 'analyze');
}

export function analyzeNeighborhood(input: AiServiceRunInput): Promise<AiServiceRunResponse> {
  return runAiService('neighborhood-analyzer', input, 'analyze');
}
