import { apiRequest } from '@/lib/http';

export type VerificationTone = 'rose' | 'emerald' | 'blue' | 'amber';

export interface VerificationBadgeData {
  key: string;
  label: string;
  tone: VerificationTone;
  reason: string;
}

export interface BuilderTrustSpotlightItem {
  companyId: number;
  name: string;
  city: string;
  state: string;
  logoUrl: string;
  bannerUrl: string;
  isVerified: boolean;
  verifiedAt: string | null;
  projectCount: number;
  propertyCount: number;
  approvedDocuments: number;
  approvedCases: number;
  pendingCases: number;
  rejectedCases: number;
  openFakeReports: number;
  trustScore: number;
  badge: VerificationBadgeData;
}

export interface BuilderVerificationCaseItem {
  id: number;
  companyId: number;
  requestedByUserId: number | null;
  reviewedByUserId: number | null;
  caseType: string;
  status: string;
  priority: string;
  note: string;
  publicNote: string;
  trustScoreDelta: number;
  evidence: Record<string, unknown>;
  sourceReferenceUrl: string;
  sourceAuthorityId: number | null;
  sourceAuthorityName: string;
  resolvedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BuilderVerificationDocumentItem {
  id: number;
  companyId: number;
  uploadedByUserId: number | null;
  reviewedByUserId: number | null;
  documentType: string;
  fileUrl: string;
  notes: string;
  status: string;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BuilderTrustSummary {
  company: {
    id: number;
    name: string;
    city: string;
    state: string;
    logoUrl: string;
    bannerUrl: string;
    isVerified: boolean;
    verifiedAt: string | null;
    projectCount: number;
    propertyCount: number;
  };
  trustScore: number;
  badge: VerificationBadgeData;
  metrics: {
    totalDocuments: number;
    approvedDocuments: number;
    pendingDocuments: number;
    rejectedDocuments: number;
    totalCases: number;
    approvedCases: number;
    pendingCases: number;
    rejectedCases: number;
    totalFakeReports: number;
    openFakeReports: number;
    lastReviewedAt: string | null;
  };
}

interface SpotlightEnvelope {
  data: {
    items: BuilderTrustSpotlightItem[];
  };
  meta?: {
    limit?: number;
    filters?: {
      state?: string;
      q?: string;
      verifiedOnly?: boolean;
    };
  };
  error: string | null;
}

interface SummaryEnvelope {
  data: {
    summary: BuilderTrustSummary;
    recentCases: BuilderVerificationCaseItem[];
    recentDocuments: BuilderVerificationDocumentItem[];
  };
  error: string | null;
}

export async function getBuilderTrustSpotlight(params?: {
  limit?: number;
  state?: string;
  q?: string;
  verifiedOnly?: boolean;
}) {
  const search = new URLSearchParams();
  if (params?.limit) search.set('limit', String(params.limit));
  if (params?.state) search.set('state', params.state);
  if (params?.q) search.set('q', params.q);
  if (params?.verifiedOnly) search.set('verifiedOnly', 'true');

  const suffix = search.toString() ? `?${search.toString()}` : '';
  const response = await apiRequest<SpotlightEnvelope>(`/api/verification/builders/spotlight${suffix}`);
  return response.data.items;
}

export async function getBuilderTrustSummary(companyId: number) {
  const response = await apiRequest<SummaryEnvelope>(`/api/verification/companies/${companyId}/summary`);
  return response.data;
}
