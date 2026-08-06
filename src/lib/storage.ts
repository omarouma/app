import env from '@/config/env';

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
  /** Called with a 0–100 progress value during the Cloudinary upload. */
  onProgress?: (percent: number) => void;
};

// ── Cloudinary config ──
const CLOUDINARY_CLOUD_NAME = env.VITE_CLOUDINARY_CLOUD_NAME || '';
const CLOUDINARY_UPLOAD_PRESET = env.VITE_CLOUDINARY_UPLOAD_PRESET || '';

// ── Upload size limits (aligned with Cloudinary free tier) ──
export const MAX_UPLOAD_SIZE = 25 * 1024 * 1024; // 25 MB
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
export const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50 MB
export const MAX_VOICE_SIZE = 5 * 1024 * 1024;  // 5 MB
export type UploadKind = 'chats' | 'voice' | 'avatars' | 'posts' | 'stories' | 'reels';

/** Validates file size against upload limits. Returns null if valid, or an error string. */
export function validateFileSize(file: Blob | File, kind?: string): string | null {
  if (!file || file.size === 0) return 'Cannot upload empty file.';

  // Check kind-specific limits FIRST so the stricter per-kind caps (avatars 10MB,
  // voice 5MB) are enforced before the relaxed global video cap. This ensures a
  // 30MB reel video passes here (50MB video cap) even though the old global 25MB
  // cap would have wrongly rejected it.
  if (kind === 'avatars' && file.size > MAX_IMAGE_SIZE)
    return `Image too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is ${MAX_IMAGE_SIZE / 1024 / 1024}MB.`;
  if (kind === 'voice' && file.size > MAX_VOICE_SIZE)
    return `Voice message too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is ${MAX_VOICE_SIZE / 1024 / 1024}MB.`;
  if ((kind === 'posts' || kind === 'reels') && file.size > MAX_VIDEO_SIZE)
    return `Video too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is ${MAX_VIDEO_SIZE / 1024 / 1024}MB.`;
  // Global cap aligned with the largest allowed upload (videos) so it never
  // rejects a file that a specific kind already permits.
  if (file.size > MAX_VIDEO_SIZE)
    return `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is ${MAX_VIDEO_SIZE / 1024 / 1024}MB.`;
  return null;
}

// ── IndexedDB fallback (preferred over localStorage for binary data) ──
const IDB_DB_NAME = 'gaga_media';
const IDB_STORE_NAME = 'blobs';

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbFallback(file: Blob | File): Promise<string> {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const db = await openIDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
    tx.objectStore(IDB_STORE_NAME).put(
      { blob: file, type: file.type, name: (file as File).name || 'file', createdAt: Date.now() },
      id
    );
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  // Return a synthetic URL that callers can resolve via getIDBBlob if needed
  return `idb://${id}`;
}

export async function getIDBBlob(idbUrl: string): Promise<Blob | null> {
  if (!idbUrl.startsWith('idb://')) return null;
  const id = idbUrl.slice(6);
  try {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, 'readonly');
      const req = tx.objectStore(IDB_STORE_NAME).get(id);
      req.onsuccess = () => resolve(req.result?.blob ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

// ── LocalStorage fallback key ──
const LOCAL_STORAGE_KEY = 'gaga_media_fallback';

// Max file size for localStorage fallback (2 MB)
const MAX_FALLBACK_SIZE = 2 * 1024 * 1024;

// Map upload "kind" to the Firebase Storage top-level folder that matches
// storage.rules (e.g. avatars/{userId}/**, posts/{userId}/**). This ensures
// the Firebase fallback upload path is allowed by the rules.
const KIND_TO_STORAGE_ROOT: Record<string, string> = {
  avatars: 'avatars',
  posts: 'posts',
  stories: 'stories',
  reels: 'reels',
  chats: 'messages',
  voice: 'messages',
  marketplace: 'marketplace',
  events: 'events',
  groups: 'groups',
  live: 'live',
};

function buildDynamicFolder(opts: CloudinaryUploadOpts): string {
  const userPart = opts.userId ? String(opts.userId) : 'anonymous';
  const kind = (
    opts.kind
      ? String(opts.kind)
      : opts.folder
        ? String(opts.folder)
        : 'media'
  ).replace(/[^a-zA-Z0-9_-]/g, '');
  // Root folder that matches storage.rules (or 'media' as a safe fallback).
  const root = KIND_TO_STORAGE_ROOT[kind] || 'media';
  return `${root}/${userPart}`;
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
  // Do NOT send api_key from the client — use an unsigned upload preset instead.
  // Sending the API key exposes it to all users. Configure an unsigned preset in Cloudinary.

  const folder = buildDynamicFolder(opts);
  form.append('folder', folder);

// Optional: use filename for better public_id
  if (opts.fileName) {
    form.append('public_id', opts.fileName.replace(/[^a-zA-Z0-9_-]/g, '_'));
  }

  // If a progress callback is provided, use XMLHttpRequest so we can report
  // real upload progress (fetch has no upload progress event). Otherwise keep
  // the lightweight fetch path for callers that don't need progress.
  if (opts.onProgress) {
    return new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadUrl);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) {
          const pct = Math.min(99, Math.round((e.loaded / e.total) * 100));
          opts.onProgress?.(pct);
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText) as { secure_url?: string; url?: string };
            const url = data.secure_url || data.url;
            if (url) {
              opts.onProgress?.(100);
              resolve(url);
              return;
            }
            reject(new Error('Cloudinary upload returned no URL'));
          } catch {
            reject(new Error('Cloudinary upload returned an invalid response'));
          }
        } else {
          reject(new Error(`Cloudinary upload failed: ${xhr.status} ${xhr.responseText}`));
        }
      };
      xhr.onerror = () => reject(new Error('Cloudinary upload network error'));
      xhr.onabort = () => reject(new Error('Cloudinary upload aborted'));
      xhr.send(form);
    });
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

import { uploadToSupabaseStorage } from './supabaseStorage';

// ── Main upload function with fallback ──
async function uploadWithFallback(
  file: Blob | File,
  opts: CloudinaryUploadOpts
): Promise<string> {
  if (!file || file.size === 0) throw new Error('Cannot upload empty file.');

  const errors: string[] = [];

  // 1) Try Cloudinary first — ONLY if actually configured. Empty/bogus keys
  //    previously threw before reaching any fallback, breaking avatar/post
  //    uploads even though Firebase Storage was configured.
  if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_UPLOAD_PRESET) {
    try {
      return await cloudinaryUpload(file, opts);
    } catch (err) {
      errors.push(`Cloudinary: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2) Fall back to Supabase Storage.
  try {
    const folder = buildDynamicFolder(opts);
    const ext = (() => {
      const name = (file as File).name || '';
      const m = name.match(/\.([a-zA-Z0-9]+)$/);
      if (m) return `.${m[1]}`;
      const t = (file as File).type || '';
      if (t.startsWith('image/')) return `.${t.split('/')[1].split(';')[0]}`;
      if (t.startsWith('video/')) return `.${t.split('/')[1].split(';')[0]}`;
      if (t.startsWith('audio/')) return `.${t.split('/')[1].split(';')[0]}`;
      return '';
    })();
    const fileName = opts.fileName
      ? opts.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
      : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    const supabaseUrl = await uploadToSupabaseStorage('media', `${folder}/${fileName}`, file, opts.contentType);
    return supabaseUrl;
  } catch (err) {
    errors.push(`Supabase: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3) Prefer the localStorage base64 fallback for small images FIRST because it
  //    returns a displayable data URL that persists across reloads. The IndexedDB
  //    fallback returns a synthetic `idb://` URL that images can't render directly,
  //    so it is only used as a last resort (e.g. non-image blobs over the 2MB cap).
  if (file.size <= MAX_FALLBACK_SIZE && inferResourceType(file) === 'image') {
    try {
      return await localStorageFallback(file);
    } catch (err) {
      errors.push(`localStorage: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 4) IndexedDB synthetic URL fallback (resolvable via getIDBBlob).
  try {
    return await idbFallback(file);
  } catch (err) {
    errors.push(`IndexedDB: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.error('[storage] all upload paths failed:', errors);
  throw new Error('Media upload failed. Please try again or contact support.');
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
        onProgress?: (percent: number) => void;
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
    onProgress?: (percent: number) => void;
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
      onProgress: opts.onProgress,
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
    onProgress: opts.onProgress,
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