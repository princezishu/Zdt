import { apiRequest } from './http';

export type FeatureUsageKey =
  | 'buy_map_view_opened'
  | 'rent_map_view_opened'
  | 'buy_filters_applied'
  | 'rent_filters_applied'
  | 'compare_page_opened'
  | 'compare_listing_added'
  | 'compare_listing_removed'
  | 'compare_cleared'
  | 'notifications_page_opened'
  | 'notification_marked_read'
  | 'notifications_mark_all_read'
  | 'notifications_cleared'
  | 'saved_searches_page_opened'
  | 'saved_search_applied'
  | 'saved_search_deleted'
  | 'saved_searches_cleared';

interface TrackFeatureUsageParams {
  featureKey: FeatureUsageKey;
  context?: string;
  view?: string;
  detail?: string;
}

export async function trackFeatureUsage({
  featureKey,
  context = '',
  view = '',
  detail = '',
}: TrackFeatureUsageParams): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    await apiRequest<{ ok: boolean }>('/workflow/public/feature-usage', {
      method: 'POST',
      body: JSON.stringify({
        featureKey,
        context,
        view,
        detail,
      }),
    });
  } catch {
    // Usage tracking must never block product interactions.
  }
}
