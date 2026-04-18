import { v2 as cloudinary } from 'cloudinary';
import path from 'path';

const CLOUD_NAME = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
const API_KEY = String(process.env.CLOUDINARY_API_KEY || '').trim();
const API_SECRET = String(process.env.CLOUDINARY_API_SECRET || '').trim();
const CLOUDINARY_UPLOAD_FOLDER = String(process.env.CLOUDINARY_UPLOAD_FOLDER || 'zdt')
  .trim()
  .replace(/^\/+|\/+$/g, '');

let configured = false;

function ensureCloudinaryConfigured() {
  if (configured) return;
  if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
    throw new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.');
  }
  cloudinary.config({
    cloud_name: CLOUD_NAME,
    api_key: API_KEY,
    api_secret: API_SECRET,
    secure: true,
  });
  configured = true;
}

export function isCloudinaryEnabled() {
  return Boolean(CLOUD_NAME && API_KEY && API_SECRET);
}

export function buildCloudinaryFolder(...segments) {
  return [CLOUDINARY_UPLOAD_FOLDER, ...segments]
    .map((segment) => String(segment || '').trim().replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
}

/**
 * Upload a buffer to Cloudinary.
 * @param {Buffer} buffer - File buffer
 * @param {object} options
 * @param {string} options.folder - Cloudinary folder (e.g., 'zdt/profile-photos')
 * @param {string} options.publicId - Optional public ID
 * @param {string} options.resourceType - 'image' | 'video' | 'auto' (default: 'auto')
 * @param {string} options.deliveryType - 'upload' | 'authenticated' | 'private' (default: 'upload')
 * @param {boolean} options.overwrite - Whether to overwrite an existing asset (default: true)
 * @returns {Promise<{ url: string, secureUrl: string, publicId: string, bytes: number }>}
 */
export async function uploadToCloudinary(
  buffer,
  {
    folder = buildCloudinaryFolder(),
    publicId,
    resourceType = 'auto',
    deliveryType = 'upload',
    overwrite = true,
  } = {}
) {
  ensureCloudinaryConfigured();

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId || undefined,
        resource_type: resourceType,
        type: deliveryType,
        overwrite,
        invalidate: overwrite,
        unique_filename: false,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({
          url: result.url,
          secureUrl: result.secure_url,
          publicId: result.public_id,
          bytes: result.bytes,
          resourceType: result.resource_type,
          deliveryType: result.type || deliveryType,
        });
      }
    );
    uploadStream.end(buffer);
  });
}

export async function uploadPropertyImageToCloudinary(buffer, publicId) {
  return uploadToCloudinary(buffer, {
    folder: buildCloudinaryFolder('property-images'),
    publicId,
    resourceType: 'image',
  });
}

/**
 * Delete a file from Cloudinary by its public ID.
 */
export async function deleteFromCloudinary(
  publicId,
  { resourceType = 'image', deliveryType = 'upload' } = {}
) {
  ensureCloudinaryConfigured();
  return cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
    type: deliveryType,
    invalidate: true,
  });
}

export function extractCloudinaryAsset(url) {
  const value = String(url || '').trim();
  if (!value) {
    return null;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(value);
  } catch {
    return null;
  }

  if (!/cloudinary\.com$/i.test(parsedUrl.hostname)) {
    return null;
  }

  const segments = parsedUrl.pathname.split('/').filter(Boolean);
  if (segments.length < 5) {
    return null;
  }

  const [cloudName, resourceType, deliveryType, ...rest] = segments;
  if (cloudName !== CLOUD_NAME) {
    return null;
  }
  if (!['image', 'video', 'raw'].includes(resourceType)) {
    return null;
  }
  if (!['upload', 'private', 'authenticated'].includes(deliveryType)) {
    return null;
  }

  const versionIndex = rest.findIndex((segment) => /^v\d+$/.test(segment));
  const publicPath = (versionIndex >= 0 ? rest.slice(versionIndex + 1) : rest).join('/');
  if (!publicPath) {
    return null;
  }

  if (resourceType === 'raw') {
    return {
      cloudName,
      resourceType,
      deliveryType,
      publicId: publicPath,
      format: '',
    };
  }

  const extension = path.posix.extname(publicPath);
  return {
    cloudName,
    resourceType,
    deliveryType,
    publicId: extension ? publicPath.slice(0, -extension.length) : publicPath,
    format: extension ? extension.slice(1) : '',
  };
}

export function resolveCloudinaryUrl(url) {
  const value = String(url || '').trim();
  if (!value) {
    return '';
  }

  const asset = extractCloudinaryAsset(value);
  if (!asset || asset.deliveryType === 'upload') {
    return value;
  }

  if (!isCloudinaryEnabled()) {
    return value;
  }

  ensureCloudinaryConfigured();
  return cloudinary.url(asset.publicId, {
    secure: true,
    sign_url: true,
    type: asset.deliveryType,
    resource_type: asset.resourceType,
    format: asset.resourceType === 'raw' ? undefined : asset.format || undefined,
  });
}

export function resolveCloudinaryStoragePathUrl(storagePath, deliveryType = 'authenticated') {
  const normalizedPath = String(storagePath || '')
    .replace(/\\/g, '/')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  if (!normalizedPath || !isCloudinaryEnabled()) {
    return '';
  }

  const parsedPath = path.posix.parse(normalizedPath);
  if (!parsedPath.name) {
    return '';
  }

  const extension = parsedPath.ext.replace(/^\./, '').toLowerCase();
  const folderSegments = parsedPath.dir ? parsedPath.dir.split('/').filter(Boolean) : [];
  const publicIdBase = buildCloudinaryFolder(...folderSegments, parsedPath.name);
  const resourceType =
    extension === 'pdf'
      ? 'raw'
      : ['mp4', 'webm', 'ogg', 'ogv'].includes(extension)
        ? 'video'
        : 'image';
  const publicId =
    resourceType === 'raw' && extension ? `${publicIdBase}.${extension}` : publicIdBase;

  ensureCloudinaryConfigured();
  return cloudinary.url(publicId, {
    secure: true,
    sign_url: true,
    type: deliveryType,
    resource_type: resourceType,
    format: resourceType === 'raw' ? undefined : extension || undefined,
  });
}

export async function deleteCloudinaryAssetByUrl(url) {
  const asset = extractCloudinaryAsset(url);
  if (!asset) {
    return null;
  }

  return deleteFromCloudinary(asset.publicId, {
    resourceType: asset.resourceType,
    deliveryType: asset.deliveryType,
  });
}
