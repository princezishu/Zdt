export type ImageOptimizeOptions = {
  maxSide?: number;
  mimeType?: 'image/webp' | 'image/jpeg' | 'image/png';
  quality?: number; // Used for lossy formats; ignored by PNG in most browsers.
};

export type CropAreaPixels = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read file'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unable to load image'));
    img.src = dataUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Unable to encode image'));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read encoded image'));
    reader.readAsDataURL(blob);
  });
}

export async function cropAndOptimizeImageSource(
  sourceUrl: string,
  crop: CropAreaPixels,
  { maxSide = 768, mimeType = 'image/webp', quality = 0.86 }: ImageOptimizeOptions = {}
): Promise<{ dataUrl: string; bytes: number; mimeType: string }> {
  const img = await loadImage(sourceUrl);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (!srcW || !srcH) {
    throw new Error('Invalid image dimensions');
  }

  const sx = Math.max(0, Math.min(srcW - 1, Math.round(crop.x)));
  const sy = Math.max(0, Math.min(srcH - 1, Math.round(crop.y)));
  const sw = Math.max(1, Math.min(srcW - sx, Math.round(crop.width)));
  const sh = Math.max(1, Math.min(srcH - sy, Math.round(crop.height)));

  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas is not supported in this browser');
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);

  const blob = await canvasToBlob(canvas, mimeType, quality);
  const dataUrl = await blobToDataUrl(blob);
  return { dataUrl, bytes: blob.size, mimeType };
}

export async function optimizeImageFile(
  file: File,
  { maxSide = 768, mimeType = 'image/webp', quality = 0.86 }: ImageOptimizeOptions = {}
): Promise<{ dataUrl: string; bytes: number; mimeType: string }> {
  const sourceUrl = await readFileAsDataUrl(file);
  const img = await loadImage(sourceUrl);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (!srcW || !srcH) {
    throw new Error('Invalid image dimensions');
  }

  const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas is not supported in this browser');
  }
  ctx.drawImage(img, 0, 0, w, h);

  const blob = await canvasToBlob(canvas, mimeType, quality);
  const dataUrl = await blobToDataUrl(blob);
  return { dataUrl, bytes: blob.size, mimeType };
}
