import { apiRequest } from './http';
import { optimizeImageFile, type ImageOptimizeOptions } from './imageUpload';

export type PublicImageUploadPurpose =
  | 'promotion'
  | 'material'
  | 'builder_project'
  | 'realty_project'
  | 'realty_property';

interface UploadImageResponse {
  message: string;
  imageUrl: string;
  purpose: PublicImageUploadPurpose;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl.trim());
  if (!match) {
    throw new Error('Invalid image encoding.');
  }

  const mimeType = match[1];
  const base64 = match[2];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

async function uploadImageFormData(
  token: string,
  purpose: PublicImageUploadPurpose,
  file: Blob,
  filename = 'image.webp'
) {
  const formData = new FormData();
  formData.append('purpose', purpose);
  formData.append('file', file, filename);

  return apiRequest<UploadImageResponse>(
    '/auth/media/upload-image',
    {
      method: 'POST',
      body: formData,
    },
    token
  );
}

export async function uploadImageDataUrl(
  token: string,
  purpose: PublicImageUploadPurpose,
  dataUrl: string
) {
  const blob = dataUrlToBlob(dataUrl);
  const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/jpeg' ? 'jpg' : 'webp';
  return uploadImageFormData(token, purpose, blob, `upload.${ext}`);
}

export async function uploadImageFile(
  token: string,
  purpose: PublicImageUploadPurpose,
  file: File,
  options?: ImageOptimizeOptions
) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.');
  }

  const optimized = await optimizeImageFile(file, options);
  return uploadImageDataUrl(token, purpose, optimized.dataUrl);
}
