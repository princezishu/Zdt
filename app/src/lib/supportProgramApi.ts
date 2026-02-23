import { apiRequest } from './http';

export interface CreateSupportContributionPayload {
  name?: string;
  amount: number;
  message?: string;
  upiReference: string;
  consentToRecord: true;
  consentToAcknowledge?: boolean;
}

export interface SupportContributionRecord {
  id: number;
  name: string;
  amount: number;
  reportedAmount?: number;
  message?: string;
  upiReference: string;
  consentToRecord?: boolean;
  consentToAcknowledge?: boolean;
  submittedIp?: string;
  verificationStatus?: 'Pending' | 'Verified' | 'Rejected';
  verificationNote?: string;
  adminReplyMessage?: string;
  verifiedByUserId?: number | null;
  verifiedByName?: string;
  verifiedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateSupportContributionResponse {
  message: string;
  contribution: SupportContributionRecord;
}

export interface SupportProgramConfigResponse {
  upiQrUrl: string;
}

export async function getSupportProgramConfig() {
  return apiRequest<SupportProgramConfigResponse>('/api/support/config');
}

export async function createSupportContribution(payload: CreateSupportContributionPayload) {
  return apiRequest<CreateSupportContributionResponse>('/api/support/contributions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface AdminSupportContributionsResponse {
  contributions: SupportContributionRecord[];
}

export interface UpdateSupportContributionStatusPayload {
  status: 'Pending' | 'Verified' | 'Rejected';
  verificationNote?: string;
  correctedAmount?: number;
  adminReplyMessage?: string;
}

export async function getAdminSupportContributions(
  token: string,
  params?: {
    status?: 'all' | 'pending' | 'verified' | 'rejected';
    limit?: number;
  }
) {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.limit) query.set('limit', String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : '';

  return apiRequest<AdminSupportContributionsResponse>(
    `/api/support/admin/contributions${suffix}`,
    {},
    token
  );
}

export async function updateSupportContributionStatus(
  token: string,
  contributionId: number,
  payload: UpdateSupportContributionStatusPayload
) {
  return apiRequest<{ message: string; contribution: SupportContributionRecord }>(
    `/api/support/admin/contributions/${contributionId}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    token
  );
}
