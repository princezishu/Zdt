export function normalizePhoneForDial(value?: string | null): string {
  const raw = String(value || '').trim();
  if (!raw || /hidden|not\s*available|na/i.test(raw)) {
    return '';
  }

  const hasLeadingPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8) {
    return '';
  }

  return hasLeadingPlus ? `+${digits}` : digits;
}

export function buildPhoneLink(value?: string | null): string | null {
  const normalized = normalizePhoneForDial(value);
  if (!normalized) {
    return null;
  }

  return `tel:${normalized}`;
}

export function openPhoneDialer(value?: string | null): boolean {
  const href = buildPhoneLink(value);
  if (!href || typeof window === 'undefined') {
    return false;
  }

  window.location.href = href;
  return true;
}
