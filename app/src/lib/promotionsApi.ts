import { apiRequest } from './http';

export type PromotionType = 'sponsored_banner' | 'popup_ad' | 'top_property';

export interface PromotionItem {
  id: string;
  promoType: PromotionType;
  title: string;
  subtitle: string;
  description: string;
  imageUrl: string;
  linkUrl: string;
  propertyReference: string;
  ctaLabel: string;
  badgeText: string;
  openInNewTab: boolean;
  isActive: boolean;
  sortOrder: number;
  startAt: string | null;
  endAt: string | null;
  createdByUserId: number | null;
  updatedByUserId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicPromotionsResponse {
  promotions: {
    sponsoredBanners: PromotionItem[];
    popupAds: PromotionItem[];
    topListedProperties: PromotionItem[];
  };
  lastUpdated: string | null;
  dataSource: string;
}

export interface AdminPromotionsResponse {
  items: PromotionItem[];
}

export interface UpsertPromotionPayload {
  promoType: PromotionType;
  title: string;
  subtitle?: string;
  description?: string;
  imageUrl?: string;
  linkUrl?: string;
  propertyReference?: string;
  ctaLabel?: string;
  badgeText?: string;
  openInNewTab?: boolean;
  isActive?: boolean;
  sortOrder?: number;
  startAt?: string | null;
  endAt?: string | null;
}

export interface UpdatePromotionPayload {
  promoType?: PromotionType;
  title?: string;
  subtitle?: string;
  description?: string;
  imageUrl?: string;
  linkUrl?: string;
  propertyReference?: string;
  ctaLabel?: string;
  badgeText?: string;
  openInNewTab?: boolean;
  isActive?: boolean;
  sortOrder?: number;
  startAt?: string | null;
  endAt?: string | null;
}

function buildQuery(params: Record<string, string | number | boolean | null | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    query.set(key, String(value));
  });
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
}

export async function getPublicPromotions(limitPerType = 8) {
  return apiRequest<PublicPromotionsResponse>(
    `/api/promotions/public${buildQuery({ limitPerType })}`
  );
}

export async function getAdminPromotions(
  token: string,
  params?: {
    promoType?: PromotionType;
    includeInactive?: boolean;
    limit?: number;
  }
) {
  return apiRequest<AdminPromotionsResponse>(
    `/api/promotions/admin/items${buildQuery(params || {})}`,
    {},
    token
  );
}

export async function createAdminPromotion(token: string, payload: UpsertPromotionPayload) {
  return apiRequest<{ message: string; item: PromotionItem }>(
    '/api/promotions/admin/items',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token
  );
}

export async function updateAdminPromotion(
  token: string,
  promotionId: string,
  payload: UpdatePromotionPayload
) {
  return apiRequest<{ message: string; item: PromotionItem }>(
    `/api/promotions/admin/items/${promotionId}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    token
  );
}

export async function deleteAdminPromotion(token: string, promotionId: string) {
  return apiRequest<{ message: string; ok: boolean }>(
    `/api/promotions/admin/items/${promotionId}`,
    {
      method: 'DELETE',
    },
    token
  );
}
