import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesPhoto, readBounded, uuid } from '../security.mjs';
test('rejects MIME spoofing, executable bytes, empty photos and arbitrary object IDs', () => {
  assert.equal(matchesPhoto(new Uint8Array(12).fill(65), 'image/jpeg'), false);
  assert.equal(matchesPhoto(new Uint8Array([255,216,255]), 'image/jpeg'), false);
  assert.equal(uuid('../other/photo'), false);
  assert.equal(uuid('123e4567-e89b-42d3-a456-426614174000'), true);
});
test('accepts supported photo signatures only with matching MIME', () => {
  const png = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
  assert.equal(matchesPhoto(png, 'image/png'), true);
  assert.equal(matchesPhoto(png, 'image/jpeg'), false);
  assert.equal(matchesPhoto(png, 'text/html'), false);
});
test('aborts a chunked upload above the hard byte limit', async () => {
  let canceled = false;
  const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(7)); c.enqueue(new Uint8Array(7)); }, cancel() { canceled = true; } });
  await assert.rejects(readBounded(body, 10), /PHOTO_TOO_LARGE/);
  assert.equal(canceled, true);
});
test('retains exact bytes across chunk boundaries', async () => {
  const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1,2])); c.enqueue(new Uint8Array([3])); c.close(); } });
  assert.deepEqual(await readBounded(body, 3), new Uint8Array([1,2,3]));
});
