export const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
export const IMAGE_AND_PDF_MIME_TYPES = new Set([...IMAGE_MIME_TYPES, 'application/pdf']);
export const PROFILE_MEDIA_MIME_TYPES = new Set([
  ...IMAGE_MIME_TYPES,
  'video/mp4',
  'video/webm',
  'video/ogg',
]);

function hasPrefix(buffer, prefixBytes) {
  if (!Buffer.isBuffer(buffer) || buffer.length < prefixBytes.length) {
    return false;
  }
  return prefixBytes.every((byte, index) => buffer[index] === byte);
}

function includesAscii(buffer, value, start = 0, end = 64) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return false;
  }
  const slice = buffer.subarray(start, Math.min(buffer.length, end));
  return slice.includes(Buffer.from(value, 'ascii'));
}

export function detectFileMetadata(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    return null;
  }

  if (hasPrefix(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mimeType: 'image/png', extension: 'png', mediaType: 'image' };
  }

  if (hasPrefix(buffer, [0xff, 0xd8, 0xff])) {
    return { mimeType: 'image/jpeg', extension: 'jpg', mediaType: 'image' };
  }

  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { mimeType: 'image/webp', extension: 'webp', mediaType: 'image' };
  }

  if (hasPrefix(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return { mimeType: 'application/pdf', extension: 'pdf', mediaType: 'document' };
  }

  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    return { mimeType: 'video/mp4', extension: 'mp4', mediaType: 'video' };
  }

  if (hasPrefix(buffer, [0x1a, 0x45, 0xdf, 0xa3]) && includesAscii(buffer, 'webm', 0, 256)) {
    return { mimeType: 'video/webm', extension: 'webm', mediaType: 'video' };
  }

  if (hasPrefix(buffer, [0x4f, 0x67, 0x67, 0x53])) {
    return { mimeType: 'video/ogg', extension: 'ogv', mediaType: 'video' };
  }

  return null;
}

export function validateBufferMimeType(buffer, allowedMimeTypes, declaredMimeType = '') {
  const detected = detectFileMetadata(buffer);
  if (!detected) {
    return null;
  }

  const normalizedDeclaredMimeType = String(declaredMimeType || '').trim().toLowerCase();
  if (normalizedDeclaredMimeType && detected.mimeType !== normalizedDeclaredMimeType) {
    return null;
  }

  if (allowedMimeTypes instanceof Set && !allowedMimeTypes.has(detected.mimeType)) {
    return null;
  }

  return detected;
}

export function decodeValidatedDataUrl(dataUrl, allowedMimeTypes) {
  if (!dataUrl || typeof dataUrl !== 'string') {
    return null;
  }

  const match = /^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!match) {
    return null;
  }

  const declaredMimeType = String(match[1] || '').trim().toLowerCase();
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) {
    return null;
  }

  const detected = validateBufferMimeType(buffer, allowedMimeTypes, declaredMimeType);
  if (!detected) {
    return null;
  }

  return {
    ...detected,
    buffer,
  };
}

export function writeValidatedFile(targetDir, filename, buffer) {
  void targetDir;
  void filename;
  void buffer;
  throw new Error('Local file storage is disabled. Use cloud media storage instead.');
}
