/*
  Media storage adapter.

  Firebase Storage has a billing issue, so this adapter uploads media to Cloudinary instead.
  If Cloudinary also fails, falls back to a localStorage base64 cache for avatars
  and other small files.

  The rest of the app expects a single function:
    uploadMediaBlob(file, opts) => Promise<string>

  It returns a public HTTPS URL (or a data URL fallback) that can be stored as `mediaUrl` in chat messages.
*/

export type CloudinaryUploadOpts = {
  userId?: string;
  kind?: string; // 'chats' | 'voice' | 'avatars' | 'posts' | 'stories' | 'reels'
  folder?: string;
  fileName?: string;
  contentType?: string;
};

// ── Cloudinary config (env vars preferred, fallback to hardcoded) ──
const CLOUDINARY_CLOUD_NAME =
  import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'gagachat';
const CLOUDINARY_UPLOAD_PRESET =
  import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'gagachat';
// API key must be set via env var — do NOT hardcode here (it ships in the browser bundle)
const CLOUDINARY_API_KEY =
  import.meta.env.VITE_CLOUDINARY_API_KEY || '';

// ── LocalStorage fallback key ──
const LOCAL_STORAGE_KEY = 'gaga_media_fallback';

// Max file size for localStorage fallback (2 MB)
const MAX_FALLBACK_SIZE = 2 * 1024 * 1024;

function buildDynamicFolder(opts: CloudinaryUploadOpts): string {
  const userPart = opts.userId ? String(opts.userId) : 'anonymous';
  const kind = (
    opts.kind
      ? String(opts.kind)
      : opts.folder
        ? String(opts.folder)
        : 'media'
  ).replace(/[^a-zA-Z0-9_-]/g, '');
  return `gagachat/${userPart}/${kind}`;
}

function inferResourceType(file: Blob | File): 'image' | 'video' | 'raw' {
  const name = (file as File).name || '';
  const type = (file as File).type || '';
  const lower = `${name} ${type}`.toLowerCase();
  if (lower.includes('video')) return 'video';
  if (
    type.startsWith('image') ||
    lower.includes('jpg') ||
    lower.includes('png') ||
    lower.includes('jpeg') ||
    lower.includes('gif') ||
    lower.includes('webp')
  ) {
    return 'image';
  }
  return 'raw';
}

// ── Fallback: store as base64 in localStorage ──
async function localStorageFallback(file: Blob | File): Promise<string> {
  if (file.size > MAX_FALLBACK_SIZE) {
    throw new Error(
      'File too large for offline fallback. Max 2MB. Please configure Cloudinary or Firebase Storage.'
    );
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      try {
        const store = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}');
        const id = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        store[id] = {
          dataUrl,
          type: (file as File).type || 'application/octet-stream',
          name: (file as File).name || 'file',
          size: file.size,
          createdAt: Date.now(),
        };
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(store));
        resolve(dataUrl); // Return data URL directly
      } catch {
        reject(new Error('localStorage quota exceeded. Clear storage and try again.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file for fallback'));
    reader.readAsDataURL(file);
  });
}

async function cloudinaryUpload(
  file: Blob | File,
  opts: CloudinaryUploadOpts
): Promise<string> {
  const resourceType = inferResourceType(file);
  const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`;

  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  form.append('api_key', CLOUDINARY_API_KEY);

  const folder = buildDynamicFolder(opts);
  form.append('folder', folder);

  // Optional: use filename for better public_id
  if (opts.fileName) {
    form.append('public_id', opts.fileName.replace(/[^a-zA-Z0-9_-]/g, '_'));
  }

  const res = await fetch(uploadUrl, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Cloudinary upload failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    secure_url?: string;
    url?: string;
  };

  return (
    data.secure_url ||
    data.url ||
    (() => {
      throw new Error('Cloudinary upload returned no URL');
    })()
  );
}

import { uploadToFirebaseStorage, getFirebaseStorage } from './firebase';

// ── Main upload function with fallback ──
async function uploadWithFallback(
  file: Blob | File,
  opts: CloudinaryUploadOpts
): Promise<string> {
  try {
    // Try Cloudinary first
    const url = await cloudinaryUpload(file, opts);
    return url;
  } catch (err: unknown) {
    const msg = (err as Error)?.message || '';
    console.warn('[Storage] Cloudinary upload failed:', msg);

    // If it's a 401 / 403 auth error, suggest env var config
    if (msg.includes('401') || msg.includes('403') || msg.includes('Unknown API key')) {
      console.warn('[Storage] Cloudinary authentication failed. Check VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET in .env');
    }

    // Try Firebase Storage fallback
    try {
      const fbStorage = getFirebaseStorage();
      if (fbStorage) {
        const folder = buildDynamicFolder(opts);
        const fileName = opts.fileName || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const filePath = `${folder}/${fileName}`;
        const firebaseUrl = await uploadToFirebaseStorage(filePath, file, opts.contentType);
        console.log('[Storage] Firebase Storage upload succeeded');
        return firebaseUrl;
      }
    } catch (fbErr: unknown) {
      console.warn('[Storage] Firebase Storage fallback failed:', (fbErr as Error)?.message || fbErr);
    }

    // Try localStorage fallback for small files (avatars, images)
    if (
      file.size <= MAX_FALLBACK_SIZE &&
      inferResourceType(file) === 'image'
    ) {
      console.warn('[Storage] Falling back to localStorage base64 for file');
      return localStorageFallback(file);
    }

    // Re-throw for large files that can't be stored locally
    throw new Error(
      `${msg}\n\nStorage fallback unavailable. Please configure Cloudinary (VITE_CLOUDINARY_CLOUD_NAME, VITE_CLOUDINARY_UPLOAD_PRESET) or Firebase Storage.`
    );
  }
}

// ── App-compatible export ──
// The app calls it in an object-style form:
//   uploadMediaBlob({ kind, chatId, file, mimeType })
// But some older code may call it positionally:
//   uploadMediaBlob(file, opts)
export async function uploadMediaBlob(
  arg1:
    | (Blob | File)
    | {
        userId?: string;
        kind?: string;
        chatId?: string;
        folder?: string;
        fileName?: string;
        mimeType?: string;
        contentType?: string;
        file: Blob | File;
      },
  arg2: {
    userId?: string;
    kind?: string;
    chatId?: string;
    folder?: string;
    fileName?: string;
    mimeType?: string;
    contentType?: string;
  } = {}
): Promise<string> {
  // Object-style
  if (typeof arg1 === 'object' && 'file' in arg1) {
    const opts = arg1;
    return uploadWithFallback(opts.file, {
      userId: opts.userId,
      kind: opts.kind,
      folder: opts.folder,
      fileName: opts.fileName,
      contentType: opts.contentType || opts.mimeType,
    });
  }

  // Positional-style
  const file = arg1 as Blob | File;
  const opts = arg2;
  return uploadWithFallback(file, {
    userId: opts.userId,
    kind: opts.kind,
    folder: opts.folder,
    fileName: opts.fileName,
    contentType: opts.contentType || opts.mimeType,
  });
}

// ── Helper to clear old fallback entries (call periodically) ──
export function cleanupMediaFallback(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000) {
  try {
    const store = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}');
    const now = Date.now();
    let changed = false;
    for (const [id, entry] of Object.entries(store)) {
      const e = entry as { createdAt?: number };
      if (e.createdAt && now - e.createdAt > maxAgeMs) {
        delete store[id];
        changed = true;
      }
    }
    if (changed) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(store));
    }
  } catch {
    /* noop */
  }
}

// ── Check if localStorage fallback has data for a URL ──
export function isLocalStorageUrl(url: string): boolean {
  return url.startsWith('data:');
}
