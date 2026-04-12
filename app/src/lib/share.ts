export interface ShareLinkInput {
  title?: string;
  text?: string;
  url: string;
}

export async function shareLink(input: ShareLinkInput): Promise<'native' | 'copied' | 'failed'> {
  if (typeof window === 'undefined') return 'failed';

  const url = String(input.url || '').trim();
  if (!url) return 'failed';

  const payload = {
    title: String(input.title || '').trim() || undefined,
    text: String(input.text || '').trim() || undefined,
    url,
  };

  if (navigator.share) {
    try {
      await navigator.share(payload);
      return 'native';
    } catch {
      // Fall through to clipboard.
    }
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return 'copied';
    } catch {
      return 'failed';
    }
  }

  return 'failed';
}
