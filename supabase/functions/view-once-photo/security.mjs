export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function matchesPhoto(bytes, mime) {
  if (!bytes || bytes.length < 12 || bytes.length > MAX_PHOTO_BYTES) return false;
  if (mime === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === 'image/png') return [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v);
  if (mime === 'image/webp') return String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
  return false;
}
export async function readBounded(stream, maximum = MAX_PHOTO_BYTES) {
  if (!stream) throw new Error('EMPTY_PHOTO');
  const reader = stream.getReader();
  const parts = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new Error('PHOTO_TOO_LARGE'); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}
