import { apiRequest } from './http';

export type InfraSubscriptionChannel = 'WHATSAPP' | 'EMAIL';

export interface InfraSubscriptionItem {
  id: number;
  state: string;
  district: string;
  city: string;
  channel: InfraSubscriptionChannel;
  contact: string;
  consent: boolean;
  isActive: boolean;
  unsubscribeToken: string | null;
  unsubscribedAt: string | null;
  createdAt: string;
}

export async function createInfraSubscription(payload: {
  state: string;
  district: string;
  city: string;
  channel: InfraSubscriptionChannel;
  contact: string;
}) {
  return apiRequest<{ subscription: InfraSubscriptionItem }>('/api/infra-subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      state: payload.state.trim(),
      district: payload.district.trim(),
      city: payload.city.trim(),
      channel: payload.channel,
      contact: payload.contact.trim(),
    }),
  });
}

export async function unsubscribeInfraSubscription(token: string) {
  return apiRequest<{ ok: boolean; changed: boolean }>('/api/infra-subscriptions/unsubscribe', {
    method: 'POST',
    body: JSON.stringify({ token: token.trim() }),
  });
}

export async function getInfraSubscriptions(
  params: {
    state?: string;
    district?: string;
    city?: string;
    channel?: InfraSubscriptionChannel | '';
    q?: string;
    includeInactive?: boolean;
  },
  adminToken: string
) {
  const query = new URLSearchParams();
  if (params.state?.trim()) query.set('state', params.state.trim());
  if (params.district?.trim()) query.set('district', params.district.trim());
  if (params.city?.trim()) query.set('city', params.city.trim());
  if (params.channel) query.set('channel', params.channel);
  if (params.q?.trim()) query.set('q', params.q.trim());
  if (params.includeInactive) query.set('include_inactive', 'true');

  const suffix = query.toString() ? `?${query.toString()}` : '';
  return apiRequest<{ items: InfraSubscriptionItem[] }>(`/api/infra-subscriptions${suffix}`, {
    headers: {
      'x-admin-token': adminToken,
    },
  });
}

export async function deleteInfraSubscription(id: number, adminToken: string) {
  return apiRequest<{ ok: boolean }>(`/api/infra-subscriptions/${id}`, {
    method: 'DELETE',
    headers: {
      'x-admin-token': adminToken,
    },
  });
}
