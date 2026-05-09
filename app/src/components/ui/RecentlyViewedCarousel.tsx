import { useCallback, useEffect, useState } from 'react';
import { Clock, ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  getRecentlyViewed,
  clearRecentlyViewed,
  RECENTLY_VIEWED_CHANGED_EVENT,
  type RecentlyViewedItem,
} from '@/lib/recentlyViewed';

interface RecentlyViewedCarouselProps {
  onOpenDetails: (id: string) => void;
}

export default function RecentlyViewedCarousel({ onOpenDetails }: RecentlyViewedCarouselProps) {
  const [items, setItems] = useState<RecentlyViewedItem[]>([]);
  const [scrollIndex, setScrollIndex] = useState(0);

  const refresh = useCallback(() => {
    setItems(getRecentlyViewed());
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener(RECENTLY_VIEWED_CHANGED_EVENT, handler);
    return () => window.removeEventListener(RECENTLY_VIEWED_CHANGED_EVENT, handler);
  }, [refresh]);

  if (items.length === 0) return null;

  const visibleCount = typeof window !== 'undefined' && window.innerWidth >= 1024 ? 4 : 2;
  const canScrollLeft = scrollIndex > 0;
  const canScrollRight = scrollIndex + visibleCount < items.length;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-900">Recently Viewed</h3>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
            {items.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setScrollIndex(Math.max(0, scrollIndex - 1))}
            disabled={!canScrollLeft}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setScrollIndex(Math.min(items.length - visibleCount, scrollIndex + 1))}
            disabled={!canScrollRight}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              clearRecentlyViewed();
              setItems([]);
            }}
            className="ml-1 rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
            title="Clear history"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${visibleCount}, 1fr)` }}>
        {items.slice(scrollIndex, scrollIndex + visibleCount).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onOpenDetails(item.id)}
            className="group rounded-xl border border-slate-200 bg-slate-50 p-2 text-left transition hover:border-slate-300 hover:shadow-sm"
          >
            {item.image && (
              <img
                src={item.image}
                alt={item.title}
                className="h-20 w-full rounded-lg object-cover"
                loading="lazy"
              />
            )}
            <p className="mt-1.5 truncate text-xs font-semibold text-slate-900 group-hover:text-blue-600">
              {item.title}
            </p>
            <p className="truncate text-[11px] text-slate-500">{item.city}</p>
            <p className="text-xs font-semibold text-emerald-700">{item.priceLabel}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
