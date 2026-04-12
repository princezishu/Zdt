import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { getPublicPromotions, type PromotionItem } from '@/lib/promotionsApi';

const DELAY_MS = 5_000;
const STORAGE_KEY = 'zdt_popup_ads_seen';
const EXPIRY_HOURS = 24;

function getSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { ids: string[]; ts: number };
    const ageMs = Date.now() - (parsed.ts || 0);
    if (ageMs > EXPIRY_HOURS * 60 * 60 * 1000) {
      localStorage.removeItem(STORAGE_KEY);
      return new Set();
    }
    return new Set(parsed.ids || []);
  } catch {
    return new Set();
  }
}

function markSeen(id: string) {
  try {
    const existing = getSeenIds();
    existing.add(id);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ids: Array.from(existing), ts: Date.now() })
    );
  } catch {
    // Ignore storage write failures and still close the popup for this session.
  }
}

export default function PopupAdOverlay() {
  const [popup, setPopup] = useState<PromotionItem | null>(null);
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      getPublicPromotions(4)
        .then((res) => {
          const ads = res.promotions.popupAds || [];
          const seen = getSeenIds();
          const unseen = ads.find((ad) => !seen.has(ad.id));
          if (unseen) {
            setPopup(unseen);
            setVisible(true);
          }
        })
        .catch(() => undefined);
    }, DELAY_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => {
      if (popup) markSeen(popup.id);
      setVisible(false);
      setClosing(false);
      setPopup(null);
    }, 300);
  };

  if (!visible || !popup) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-all duration-300 ${
        closing ? 'bg-black/0' : 'bg-black/50 backdrop-blur-sm'
      }`}
      onClick={handleClose}
    >
      <div
        className={`relative w-full max-w-md overflow-hidden rounded-2xl border border-white/20 bg-white shadow-2xl transition-all duration-300 ${
          closing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-3 top-3 z-10 rounded-full bg-black/40 p-1.5 text-white transition-colors hover:bg-black/60"
          aria-label="Close popup"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Image */}
        {popup.imageUrl ? (
          <div className="relative h-48 w-full overflow-hidden bg-gradient-to-br from-blue-500/10 to-indigo-500/10">
            <img
              src={popup.imageUrl}
              alt={popup.title}
              className="h-full w-full object-cover"
            />
            {popup.badgeText ? (
              <span className="absolute left-3 top-3 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-1 text-xs font-bold text-white shadow-lg">
                {popup.badgeText}
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Content */}
        <div className="p-6">
          <h3 className="text-lg font-bold text-slate-900">{popup.title}</h3>
          {popup.subtitle ? (
            <p className="mt-1 text-sm text-slate-600">{popup.subtitle}</p>
          ) : null}
          {popup.description ? (
            <p className="mt-2 text-sm text-slate-500 line-clamp-3">{popup.description}</p>
          ) : null}

          <div className="mt-5 flex items-center gap-3">
            {popup.linkUrl ? (
              <a
                href={popup.linkUrl}
                target={popup.openInNewTab ? '_blank' : '_self'}
                rel={popup.openInNewTab ? 'noopener noreferrer' : undefined}
                onClick={() => {
                  if (popup) markSeen(popup.id);
                }}
                className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-center text-sm font-semibold text-white shadow-lg transition-all hover:shadow-xl"
              >
                {popup.ctaLabel || 'Learn More'}
              </a>
            ) : null}
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
