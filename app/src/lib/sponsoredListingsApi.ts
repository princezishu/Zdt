import { apiRequest } from '@/lib/http';

export interface PublicWorkflowListingSummary {
  id: string;
  referenceId: string;
  requestType: string;
  title: string;
  image: string;
  city: string;
  area: string;
  priceLakh: number;
  priceLabel: string;
  areaLabel: string;
  propertyType: string;
  bhk: string;
  mainDoorFacing: string;
  vastuScore: number;
  verified: boolean;
  ownerPhone: string;
  isFeatured: boolean;
  rankingScore: number;
  updatedAt: string | null;
}

export interface SponsoredListingCard {
  id: number;
  sponsorshipId: number;
  propertyRequestId: number;
  billingOrderId: number | null;
  placement: 'portal_home' | 'public_results' | string;
  status: string;
  badgeText: string;
  ctaLabel: string;
  title: string;
  subtitle: string;
  description: string;
  image: string;
  referenceId: string;
  requestType: string;
  city: string;
  locality: string;
  propertyType: string;
  priceLabel: string;
  areaLabel: string;
  rankingScore: number;
  listing: PublicWorkflowListingSummary;
  startsAt: string | null;
  endsAt: string | null;
  sortPriority: number;
}

export interface SponsoredListingsResponse {
  listings: SponsoredListingCard[];
  total: number;
  placement: string;
  filters: {
    placement: string;
    requestType: string;
    city: string;
    locality: string;
    propertyType: string;
    limit: number;
  };
}

export async function getSponsoredListings(input: {
  placement: 'portal_home' | 'public_results';
  requestType?: 'all' | 'sell' | 'rent';
  city?: string;
  locality?: string;
  propertyType?: 'all' | 'Plot' | 'Villa' | 'Flat / Apartment' | 'Commercial';
  limit?: number;
}): Promise<SponsoredListingsResponse> {
  const params = new URLSearchParams();
  params.set('placement', input.placement);
  if (input.requestType) params.set('requestType', input.requestType);
  if (input.city) params.set('city', input.city);
  if (input.locality) params.set('locality', input.locality);
  if (input.propertyType) params.set('propertyType', input.propertyType);
  if (typeof input.limit === 'number') params.set('limit', String(input.limit));

  return apiRequest<SponsoredListingsResponse>(`/workflow/public/sponsored-listings?${params.toString()}`);
}
