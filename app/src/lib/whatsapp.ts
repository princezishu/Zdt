export function normalizePhoneDigits(value: string): string {
  return String(value || '').replace(/\D/g, '');
}

export function resolveDefaultWhatsappNumber(): string {
  const candidates = [
    import.meta.env.VITE_WHATSAPP_NUMBER,
    import.meta.env.VITE_CONSTRUCTION_WHATSAPP_NUMBER,
    import.meta.env.VITE_CONSTRUCT_WHATSAPP_NUMBER,
  ];

  for (const candidate of candidates) {
    const digits = normalizePhoneDigits(String(candidate || ''));
    if (digits.length >= 10) {
      return digits;
    }
  }

  return '';
}

export interface WhatsAppLinkInput {
  phone?: string | null;
  message?: string | null;
}

export function buildWhatsAppLink({ phone, message }: WhatsAppLinkInput): string | null {
  const primary = normalizePhoneDigits(String(phone || ''));
  const fallback = resolveDefaultWhatsappNumber();
  const target = primary.length >= 10 ? primary : fallback;
  if (!target) return null;

  const text = String(message || '').trim();
  if (!text) {
    return `https://wa.me/${target}`;
  }

  return `https://wa.me/${target}?text=${encodeURIComponent(text)}`;
}

export function openWhatsApp(input: WhatsAppLinkInput): boolean {
  const href = buildWhatsAppLink(input);
  if (!href || typeof window === 'undefined') return false;
  window.open(href, '_blank', 'noopener,noreferrer');
  return true;
}
