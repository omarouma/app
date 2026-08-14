import { getSupabase } from './supabase';

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

export async function uploadToSupabaseStorage(
  bucketName: string,
  filePath: string,
  file: File | Blob,
  contentType?: string
): Promise<string> {
  const supabase = getSupabase();

  // Validate file path — must not contain special characters or be empty
  if (!filePath || filePath.trim() === '' || filePath.includes('//')) {
    throw new Error(`[Supabase Storage] Invalid file path: "${filePath}". Path must not be empty or contain consecutive slashes.`);
  }

  const { data, error } = await supabase.storage
    .from(bucketName)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: inferContentType(file, contentType),
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