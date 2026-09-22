import { getSupabase } from './supabase';
import env from '@/config/env';

function inferContentType(file: File | Blob, hint?: string): string {
  if (hint) return hint;
  if ((file as File).type) return (file as File).type;
  const name = ((file as File).name || '').toLowerCase();
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.gif')) return 'image/gif';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.mp4')) return 'video/mp4';
  if (name.endsWith('.webm')) return 'video/webm';
  if (name.endsWith('.mp3')) return 'audio/mpeg';
  if (name.endsWith('.ogg')) return 'audio/ogg';
  return 'application/octet-stream';
}

/**
 * Upload a file to Supabase Storage.
 *
 * When `onProgress` is supplied we use XMLHttpRequest against the Storage REST
 * endpoint so we can report REAL upload progress (the supabase-js client has no
 * upload-progress event, which previously left the UI frozen at "0%").
 */
export async function uploadToSupabaseStorage(
  bucketName: string,
  filePath: string,
  file: File | Blob,
  contentType?: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  const supabase = getSupabase();

  // Validate file path — must not contain special characters or be empty
  if (!filePath || filePath.trim() === '' || filePath.includes('//')) {
    throw new Error(`[Supabase Storage] Invalid file path: "${filePath}". Path must not be empty or contain consecutive slashes.`);
  }

  const resolvedType = inferContentType(file, contentType);

  // ── Progress-capable path (XHR) ──────────────────────────────────────────
  if (onProgress) {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const anonKey = env.VITE_SUPABASE_ANON_KEY;
      const baseUrl = env.VITE_SUPABASE_URL;
      const token = accessToken || anonKey;

      const url = `${baseUrl}/storage/v1/object/${bucketName}/${encodeURI(filePath)}`;
      const result = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.setRequestHeader('apikey', anonKey);
        xhr.setRequestHeader('x-upsert', 'true');
        xhr.setRequestHeader('cache-control', 'max-age=3600');
        xhr.setRequestHeader('Content-Type', resolvedType);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && e.total > 0) {
            onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            onProgress(100);
            resolve(filePath);
          } else {
            reject(new Error(`[Supabase Storage] Upload failed (${xhr.status}): ${xhr.responseText?.slice(0, 200) || ''}`));
          }
        };
        xhr.onerror = () => reject(new Error('[Supabase Storage] Network error during upload.'));
        xhr.ontimeout = () => reject(new Error('[Supabase Storage] Upload timed out.'));
        xhr.timeout = 120000;
        xhr.send(file);
      });

      const { data: { publicUrl } } = supabase.storage.from(bucketName).getPublicUrl(result);
      return publicUrl;
    } catch (err) {
      // Fall through to the supabase-js path below so a REST hiccup (e.g. CORS
      // in a WebView) never blocks the upload entirely.
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('Network error') && !msg.includes('timed out')) {
        // A real server-side rejection — surface it directly.
        throw err;
      }
    }
  }

  // ── Standard supabase-js path (no progress) ──────────────────────────────
  const { data, error } = await supabase.storage
    .from(bucketName)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: resolvedType,
    });

  if (error) {
    // Handle specific error cases with helpful guidance
    const errorMsg = error.message || '';
    if (errorMsg.includes('400') || errorMsg.includes('not found') || errorMsg.includes('does not exist')) {
      throw new Error(`[Supabase Storage] Bucket "${bucketName}" not found or not accessible. Create the bucket in Supabase Dashboard → Storage, then retry. Error: ${errorMsg}`);
    }
    if (errorMsg.includes('policy') || errorMsg.includes('permission') || errorMsg.includes('403') || errorMsg.includes('authenticated')) {
      throw new Error(`[Supabase Storage] Permission denied uploading to "${bucketName}/${filePath}". Check RLS policies allow your role. Error: ${errorMsg}`);
    }
    throw new Error(`[Supabase Storage] Upload failed: ${errorMsg}`);
  }

  const { data: { publicUrl } } = supabase.storage
    .from(bucketName)
    .getPublicUrl(data.path);

  return publicUrl;
}

export async function deleteFromSupabaseStorage(
  bucketName: string,
  filePath: string
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.storage.from(bucketName).remove([filePath]);
  if (error) throw new Error(`[Supabase Storage] ${error.message}`);
}
