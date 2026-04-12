import { useMemo, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { openWhatsApp, resolveDefaultWhatsappNumber } from '@/lib/whatsapp';

const DISMISS_KEY = 'zdt_whatsapp_quick_action_dismissed_v1';

interface FloatingWhatsAppButtonProps {
  visible?: boolean;
  contextTitle?: string;
}

function readDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(DISMISS_KEY) === '1';
}

export default function FloatingWhatsAppButton({
  visible = true,
  contextTitle = 'Need help with a listing? Chat on WhatsApp.',
}: FloatingWhatsAppButtonProps) {
  const [dismissed, setDismissed] = useState(() => readDismissed());
  const fallbackNumber = useMemo(() => resolveDefaultWhatsappNumber(), []);

  if (!visible || dismissed || !fallbackNumber) {
    return null;
  }

  return (
    <div className="fixed bottom-20 right-4 z-[70] flex max-w-[280px] flex-col items-end gap-2 sm:bottom-24 sm:right-6">
      <div className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-lg">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-slate-900">WhatsApp Support</p>
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            onClick={() => {
              setDismissed(true);
              if (typeof window !== 'undefined') {
                window.localStorage.setItem(DISMISS_KEY, '1');
              }
            }}
            aria-label="Dismiss WhatsApp help"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1">{contextTitle}</p>
      </div>

      <Button
        type="button"
        className="min-h-11 rounded-full bg-emerald-600 px-4 text-white hover:bg-emerald-700"
        onClick={() => {
          void openWhatsApp({
            message:
              'Hi ZDT Realty, I am browsing property listings and need assistance with next steps.',
          });
        }}
      >
        <MessageCircle className="mr-2 h-4 w-4" />
        Chat on WhatsApp
      </Button>
    </div>
  );
}
