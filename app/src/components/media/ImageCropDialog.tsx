import { useEffect, useMemo, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { cropAndOptimizeImageSource, type CropAreaPixels, type ImageOptimizeOptions } from '@/lib/imageUpload';

type ImageCropDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  src: string;
  aspect: number;
  outputOptions?: ImageOptimizeOptions;
  maxBytes?: number;
  onCancel: () => void;
  onCropped: (result: { dataUrl: string; bytes: number; mimeType: string }) => void;
};

export default function ImageCropDialog({
  open,
  title,
  description,
  src,
  aspect,
  outputOptions,
  maxBytes,
  onCancel,
  onCropped,
}: ImageCropDialogProps) {
  const normalizedOutput = useMemo<ImageOptimizeOptions>(() => {
    return {
      maxSide: outputOptions?.maxSide ?? 768,
      mimeType: outputOptions?.mimeType ?? 'image/webp',
      quality: outputOptions?.quality ?? 0.86,
    };
  }, [outputOptions?.maxSide, outputOptions?.mimeType, outputOptions?.quality]);

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setSubmitting(false);
      setError('');
      return;
    }

    setError('');
    setSubmitting(false);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
  }, [open, src, aspect]);

  const handleConfirm = async () => {
    if (!src) return;
    if (!croppedAreaPixels) {
      setError('Please select a crop area.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const result = await cropAndOptimizeImageSource(src, croppedAreaPixels as CropAreaPixels, normalizedOutput);
      if (maxBytes && result.bytes > maxBytes) {
        const kb = Math.round(result.bytes / 1024);
        setError(`Image is still too large (${kb}KB). Try zooming in more or choose a smaller image.`);
        setSubmitting(false);
        return;
      }
      onCropped(result);
    } catch (cropError) {
      setError(cropError instanceof Error ? cropError.message : 'Unable to crop image');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-[780px]" showCloseButton={!submitting}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="relative h-[340px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
          {src ? (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_croppedArea: Area, croppedPixels: Area) =>
                setCroppedAreaPixels(croppedPixels)
              }
              showGrid
            />
          ) : null}
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
            <span>Zoom</span>
            <span>{Math.round(zoom * 100)}%</span>
          </div>
          <Slider
            value={[zoom]}
            onValueChange={(value) => setZoom(value[0] ?? 1)}
            min={1}
            max={3}
            step={0.01}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={submitting || !src}>
            {submitting ? 'Saving...' : 'Use Image'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
