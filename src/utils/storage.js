import { SURL, SKEY, requireAuthToken } from './api';

const SIGNED_URL_TTL = 60 * 60;

function decodeStoragePath(path = '') {
  return path
    .split('/')
    .map(part => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    })
    .join('/');
}

export function parseStorageUrl(fileRef) {
  if (!fileRef || typeof fileRef !== 'string') return null;

  if (fileRef.startsWith('storage://')) {
    const withoutScheme = fileRef.slice('storage://'.length);
    const firstSlash = withoutScheme.indexOf('/');
    if (firstSlash === -1) return null;
    return {
      bucket: withoutScheme.slice(0, firstSlash),
      path: withoutScheme.slice(firstSlash + 1),
    };
  }

  const url = fileRef.split('?')[0];
  const prefixes = [
    '/storage/v1/object/public/',
    '/storage/v1/object/sign/',
    '/storage/v1/object/authenticated/',
    '/storage/v1/object/',
  ];

  for (const prefix of prefixes) {
    const idx = url.indexOf(prefix);
    if (idx === -1) continue;
    const remainder = url.slice(idx + prefix.length);
    const firstSlash = remainder.indexOf('/');
    if (firstSlash === -1) return null;
    return {
      bucket: remainder.slice(0, firstSlash),
      path: decodeStoragePath(remainder.slice(firstSlash + 1)),
    };
  }

  return null;
}

export function getStorageFileName(fileRef) {
  if (!fileRef) return '';
  const parsed = parseStorageUrl(fileRef);
  const rawName = parsed?.path?.split('/').pop() || fileRef.split('?')[0].split('/').pop() || '';
  return rawName.replace(/^\d+-[a-z0-9]+\./i, '');
}

export function isPdfStorageFile(fileRef, fallbackName = '') {
  const name = `${getStorageFileName(fileRef) || fallbackName}`.toLowerCase();
  return name.endsWith('.pdf');
}

export async function getSignedFileUrl(fileRef, expiresIn = SIGNED_URL_TTL) {
  if (!fileRef) return null;
  const parsed = parseStorageUrl(fileRef);
  if (!parsed) return fileRef;

  const token = requireAuthToken();
  const encodedPath = parsed.path.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`${SURL}/storage/v1/object/sign/${parsed.bucket}/${encodedPath}`, {
    method: 'POST',
    headers: {
      apikey: SKEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.message || `Failed to open file (${res.status})`);
  }

  const signedUrl = payload.signedURL || payload.signedUrl;
  if (!signedUrl) {
    throw new Error('Signed URL not returned by storage service.');
  }

  return signedUrl.startsWith('http') ? signedUrl : `${SURL}/storage/v1${signedUrl}`;
}

/**
 * Upload a file (File object or base64 data-URL) to a Supabase Storage bucket.
 * Returns a private storage reference on success, throws on error.
 *
 * @param {string} bucket  - 'invoices' | 'contractor-docs' | 'site-photos'
 * @param {string} path    - e.g. 'project-id/filename.jpg'
 * @param {File|string} file - File object or base64 data-URL string
 * @param {string} [mimeType]
 */
export async function uploadFile(bucket, path, file, mimeType) {
  const token = requireAuthToken();
  let blob;
  if (typeof file === 'string' && file.startsWith('data:')) {
    // Convert base64 data-URL to Blob
    const [header, b64] = file.split(',');
    const mime = mimeType || header.match(/:(.*?);/)?.[1] || 'application/octet-stream';
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    blob = new Blob([bytes], { type: mime });
  } else {
    blob = file;
    mimeType = mimeType || file.type;
  }

  const res = await fetch(`${SURL}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      apikey: SKEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': mimeType || 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: blob,
  });

  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.message || `Upload failed (${res.status})`);
  }

  return `storage://${bucket}/${path}`;
}

/**
 * Delete a file from Supabase Storage by its stored reference.
 */
export async function deleteFile(fileRef) {
  if (!fileRef) return;
  const token = requireAuthToken();
  const target = parseStorageUrl(fileRef);
  if (!target) return;
  const encodedPath = target.path.split('/').map(encodeURIComponent).join('/');
  await fetch(`${SURL}/storage/v1/object/${target.bucket}/${encodedPath}`, {
    method: 'DELETE',
    headers: { apikey: SKEY, Authorization: `Bearer ${token}` },
  });
}

/**
 * Generate a unique storage path for a file.
 */
export function storagePath(prefix, filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}/${ts}-${rand}.${ext}`;
}
