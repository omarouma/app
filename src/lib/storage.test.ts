import { describe, expect, it } from 'vitest';
import { validateFileSize } from './storage';

describe('storage', () => {
    describe('validateFileSize', () => {
        it('rejects empty files', () => {
            const emptyFile = new Blob([], { type: 'image/png' });
            const error = validateFileSize(emptyFile, 'avatars');
            expect(error).toBeTruthy();
            expect(error).toMatch(/empty/i);
        });

        it('allows avatar images within the 10MB limit', () => {
            const validAvatar = new Blob(['x'.repeat(5 * 1024 * 1024)], { type: 'image/png' });
            const error = validateFileSize(validAvatar, 'avatars');
            expect(error).toBeNull();
        });

        it('rejects avatar images exceeding 10MB', () => {
            const oversizedAvatar = new Blob(['x'.repeat(11 * 1024 * 1024)], { type: 'image/png' });
            const error = validateFileSize(oversizedAvatar, 'avatars');
            expect(error).toBeTruthy();
            expect(error).toMatch(/too large/i);
        });

        it('allows voice messages within the 5MB limit', () => {
            const validVoice = new Blob(['x'.repeat(4 * 1024 * 1024)], { type: 'audio/mp3' });
            const error = validateFileSize(validVoice, 'voice');
            expect(error).toBeNull();
        });

        it('rejects voice messages exceeding 5MB', () => {
            const oversizedVoice = new Blob(['x'.repeat(6 * 1024 * 1024)], { type: 'audio/mp3' });
            const error = validateFileSize(oversizedVoice, 'voice');
            expect(error).toBeTruthy();
            expect(error).toMatch(/too large/i);
        });

        it('allows videos within the 50MB limit', () => {
            const validVideo = new Blob(['x'.repeat(40 * 1024 * 1024)], { type: 'video/mp4' });
            const error = validateFileSize(validVideo, 'posts');
            expect(error).toBeNull();
        });

        it('rejects videos exceeding 50MB', () => {
            const oversizedVideo = new Blob(['x'.repeat(60 * 1024 * 1024)], { type: 'video/mp4' });
            const error = validateFileSize(oversizedVideo, 'posts');
            expect(error).toBeTruthy();
            expect(error).toMatch(/too large/i);
        });

        it('prioritizes kind-specific limits over global limits', () => {
            // A 30MB file would fail the old 25MB global cap but passes the 50MB video cap
            const video = new Blob(['x'.repeat(30 * 1024 * 1024)], { type: 'video/mp4' });
            const error = validateFileSize(video, 'reels');
            expect(error).toBeNull();
        });

        it('applies the 50MB global cap for files without a specific kind', () => {
            const file = new Blob(['x'.repeat(60 * 1024 * 1024)], { type: 'application/octet-stream' });
            const error = validateFileSize(file);
            expect(error).toBeTruthy();
            expect(error).toMatch(/too large/i);
        });
    });


});
