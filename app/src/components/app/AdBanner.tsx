import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { getPublicPromotions, type PromotionItem } from '@/lib/promotionsApi';

const ROTATE_INTERVAL_MS = 6_000;
const STORAGE_KEY = 'zdt_ad_banner_dismissed';

export default function AdBanner() {
  const [banners, setBanners] = useState<PromotionItem[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getPublicPromotions(6)
      .then((res) => setBanners(res.promotions.sponsoredBanners || []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (banners.length <= 1 || dismissed) return;

    timerRef.current = setInterval(() => {
      setCurrentIdx((prev) => (prev + 1) % banners.length);
    }, ROTATE_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [banners.length, dismissed]);

  if (dismissed || banners.length === 0) return null;

  const banner = banners[currentIdx];
  if (!banner) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // Ignore storage write failures and keep the dismissal in-memory only.
    }
  };

  const handlePrev = () => {
    setCurrentIdx((prev) => (prev - 1 + banners.length) % banners.length);
  };

  const handleNext = () => {
    setCurrentIdx((prev) => (prev + 1) % banners.length);
  };

  const content = (
    <div className="flex items-center gap-3">
      {banner.imageUrl ? (
        <img
          src={banner.imageUrl}
          alt=""
          className="h-8 w-8 flex-none rounded-lg object-cover"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{banner.title}</p>
        {banner.subtitle ? (
          <p className="truncate text-xs text-white/70">{banner.subtitle}</p>
        ) : null}
      </div>
      {banner.ctaLabel ? (
        <span className="flex-none rounded-lg bg-white/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/30">
          {banner.ctaLabel}
        </span>
      ) : null}
    </div>
  );

  return (
    <div className="relative z-30 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 shadow-md">
      <div className="page-container flex items-center gap-2 py-2">
        {banners.length > 1 ? (
          <button
            type="button"
            onClick={handlePrev}
            className="flex-none rounded-full p-0.5 text-white/60 hover:text-white"
            aria-label="Previous banner"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        ) : null}

        <div className="min-w-0 flex-1">
          {banner.linkUrl ? (
            <a
              href={banner.linkUrl}
              target={banner.openInNewTab ? '_blank' : '_self'}
              rel={banner.openInNewTab ? 'noopener noreferrer' : undefined}
              className="block"
            >
              {content}
            </a>
          ) : (
            content
          )}
        </div>

        {banners.length > 1 ? (
          <>
            <button
              type="button"
              onClick={handleNext}
              className="flex-none rounded-full p-0.5 text-white/60 hover:text-white"
              aria-label="Next banner"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="flex flex-none items-center gap-1">
              {banners.map((_, idx) => (
                <span
                  key={idx}
                  className={`h-1.5 w-1.5 rounded-full transition-colors ${
                    idx === currentIdx ? 'bg-white' : 'bg-white/30'
                  }`}
                />
              ))}
            </div>
          </>
        ) : null}

        <button
          type="button"
          onClick={handleDismiss}
          className="ml-1 flex-none rounded-full p-1 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Dismiss banner"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
