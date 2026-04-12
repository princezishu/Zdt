import { apiRequest } from '@/lib/http';

export type ListingAssistType = 'brochure' | 'price_sheet' | 'loan_help';

export interface ListingAssistConversation {
  id: number;
  type: string;
  status: string;
  subject: string;
  propertyReference: string | null;
  propertyTitle: string | null;
  ownerName: string | null;
  requesterUserId: number | null;
  requesterName: string;
  ownerUserId: number | null;
  lastMessagePreview: string;
  lastMessageAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ListingAssistRequestRecord {
  id: number;
  assistType: ListingAssistType;
  routeOwner: 'owner' | 'team_support';
  status: string;
  sourceContext: string;
  notes: string;
  lastRequestedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  reused: boolean;
}

export interface ListingAssistResponse {
  ok: boolean;
  request: ListingAssistRequestRecord | null;
  conversation: ListingAssistConversation | null;
}

export async function createListingAssistRequest(
  referenceId: string,
  input: {
    assistType: ListingAssistType;
    context?: string;
    note?: string;
  }
): Promise<ListingAssistResponse> {
  return apiRequest<ListingAssistResponse>(
    `/workflow/public/listings/${encodeURIComponent(referenceId.trim())}/assist`,
    {
      method: 'POST',
      body: JSON.stringify({
        assistType: input.assistType,
        context: input.context || '',
        note: input.note || '',
      }),
    }
  );
}
