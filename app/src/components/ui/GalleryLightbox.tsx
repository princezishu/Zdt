import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from 'lucide-react';

interface GalleryLightboxProps {
  images: string[];
  initialIndex?: number;
  open: boolean;
  onClose: () => void;
  altPrefix?: string;
}

export default function GalleryLightbox({
  images,
  initialIndex = 0,
  open,
  onClose,
  altPrefix = 'Property image',
}: GalleryLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);

  const total = images.length;
  const hasPrev = index > 0;
  const hasNext = index < total - 1;

  useEffect(() => {
    if (open) {
      setIndex(initialIndex);
      setZoom(1);
    }
  }, [open, initialIndex]);

  const goPrev = useCallback(() => {
    if (hasPrev) { setIndex((i) => i - 1); setZoom(1); }
  }, [hasPrev]);

  const goNext = useCallback(() => {
    if (hasNext) { setIndex((i) => i + 1); setZoom(1); }
  }, [hasNext]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, goPrev, goNext, onClose]);

  if (!open || total === 0) return null;

  const currentImage = images[index] || images[0];

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Property gallery"
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        aria-label="Close gallery"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Zoom controls */}
      <div className="absolute right-4 top-16 z-10 flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(3, z + 0.5))}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white transition hover:bg-white/20"
          aria-label="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.5, z - 0.5))}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white transition hover:bg-white/20"
          aria-label="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
      </div>

      {/* Counter */}
      <div className="absolute left-4 top-4 z-10 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
        {index + 1} / {total}
      </div>

      {/* Prev */}
      {hasPrev && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          className="absolute left-4 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          aria-label="Previous image"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      {/* Next */}
      {hasNext && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          className="absolute right-4 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          aria-label="Next image"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {/* Main image */}
      <img
        src={currentImage}
        alt={`${altPrefix} ${index + 1}`}
        className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl transition-transform duration-300"
        style={{ transform: `scale(${zoom})` }}
        draggable={false}
      />

      {/* Thumbnail strip */}
      {total > 1 && (
        <div className="absolute bottom-4 left-1/2 z-10 flex max-w-[80vw] -translate-x-1/2 gap-2 overflow-x-auto rounded-2xl bg-black/50 p-2 backdrop-blur">
          {images.map((img, i) => (
            <button
              key={`${img}-${i}`}
              type="button"
              onClick={() => { setIndex(i); setZoom(1); }}
              className={`h-12 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 transition ${
                i === index ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'
              }`}
            >
              <img src={img} alt={`Thumbnail ${i + 1}`} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
