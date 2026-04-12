import { apiRequest } from './http';

export type PropertyInteractionAction =
  | 'click'
  | 'save'
  | 'unsave'
  | 'like'
  | 'unlike'
  | 'unlock_phone'
  | 'call_click';

interface TrackPropertyInteractionParams {
  referenceId: string;
  action: PropertyInteractionAction;
  context?: string;
}

export async function trackPropertyInteraction({
  referenceId,
  action,
  context = '',
}: TrackPropertyInteractionParams): Promise<void> {
  const normalizedReference = referenceId.trim();
  if (!normalizedReference) {
    return;
  }

  try {
    await apiRequest<{ ok: boolean }>(
      `/workflow/public/listings/${encodeURIComponent(normalizedReference)}/interaction`,
      {
        method: 'POST',
        body: JSON.stringify({
          action,
          context,
        }),
      }
    );
  } catch {
    // Tracking failures must not interrupt user actions.
  }
}
