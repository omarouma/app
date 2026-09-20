import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./supabaseStorage', () => ({ uploadToSupabaseStorage: vi.fn() }));
vi.mock('@/config/env', () => ({ default: { VITE_CLOUDINARY_CLOUD_NAME: 'configured', VITE_CLOUDINARY_UPLOAD_PRESET: 'configured' } }));
import { uploadToSupabaseStorage } from './supabaseStorage';
import { uploadMediaBlob } from './storage';

describe('conversation media delivery', () => {
  beforeEach(() => vi.resetAllMocks());
  it('rejects failed remote uploads instead of sending a device-local URL', async () => {
    vi.mocked(uploadToSupabaseStorage).mockRejectedValue(new Error('offline'));
    for (const kind of ['chats', 'voice', 'avatars', 'covers']) {
      await expect(uploadMediaBlob(new Blob(['data'], { type: 'audio/webm' }), { userId: 'u1', kind })).rejects.toThrow('Media upload failed');
    }
  });
  it('uses Supabase and unique paths for repeated camera filenames', async () => {
    vi.mocked(uploadToSupabaseStorage).mockResolvedValue('https://example.test/media.jpg');
    const file = new File(['photo'], 'image.jpg', { type: 'image/jpeg' });
    for (let i = 0; i < 2; i++) await uploadMediaBlob(file, { userId: 'u1', kind: 'chats', fileName: file.name });
    const calls = vi.mocked(uploadToSupabaseStorage).mock.calls;
    expect(calls[0][0]).toBe('chat-media');
    expect(calls[0][1]).not.toBe(calls[1][1]);
    expect(calls[0][1]).toMatch(/^messages\/u1\//);
  });
});
