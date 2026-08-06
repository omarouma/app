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

  const { data, error } = await supabase.storage
    .from(bucketName)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: inferContentType(file, contentType),
    });

  if (error) throw new Error(`[Supabase Storage] ${error.message}`);

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