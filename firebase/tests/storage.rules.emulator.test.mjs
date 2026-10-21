import { readFileSync } from 'node:fs';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { ref, uploadBytes, deleteObject, getMetadata } from 'firebase/storage';

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-gaga-security-tests',
    storage: { host: '127.0.0.1', port: 9199,
      rules: readFileSync(new URL('../../storage.rules', import.meta.url), 'utf8') },
  });
});
beforeEach(async () => { await env.clearStorage(); });
after(async () => { if (env) await env.cleanup(); });
const file = (uid, path) => ref((uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).storage(), path);
const upload = (uid, path, contentType = 'image/png', size = 16) =>
  uploadBytes(file(uid, path), new Uint8Array(size), { contentType });

test('owners can upload, replace and delete their avatar and story', async () => {
  for (const path of ['avatars/alice/photo.png', 'status/alice/story.png']) {
    await assertSucceeds(upload('alice', path));
    await assertSucceeds(upload('alice', path));
    await assertSucceeds(deleteObject(file('alice', path)));
  }
});

test('anonymous and other users cannot upload, replace or delete owner media', async () => {
  for (const root of ['avatars', 'status']) {
    const path = `${root}/alice/existing.png`;
    await assertSucceeds(upload('alice', path));
    for (const uid of [undefined, 'bob']) {
      await assertFails(upload(uid, `${root}/alice/new.png`));
      await assertFails(upload(uid, path));
      await assertFails(deleteObject(file(uid, path)));
    }
    await assertSucceeds(getMetadata(file('alice', path)));
  }
});

test('invalid MIME types remain blocked for create and replacement', async () => {
  for (const root of ['avatars', 'status']) {
    const path = `${root}/alice/photo.png`;
    await assertFails(upload('alice', path, 'text/html'));
    await assertSucceeds(upload('alice', path));
    await assertFails(upload('alice', path, 'text/html'));
    await assertSucceeds(deleteObject(file('alice', path)));
  }
});

test('avatar size limit remains enforced', async () => {
  await assertFails(upload('alice', 'avatars/alice/large.png', 'image/png', 10 * 1024 * 1024));
});

test('avatar public reads and story authenticated reads retain their boundaries', async () => {
  await assertSucceeds(upload('alice', 'avatars/alice/photo.png'));
  await assertSucceeds(getMetadata(file(undefined, 'avatars/alice/photo.png')));
  await assertSucceeds(upload('alice', 'status/alice/story.png'));
  await assertFails(getMetadata(file(undefined, 'status/alice/story.png')));
  await assertSucceeds(getMetadata(file('bob', 'status/alice/story.png')));
});

test('unknown paths remain closed', async () => {
  await assertFails(upload('alice', 'unknown/alice/file.png'));
  await assertFails(getMetadata(file('alice', 'unknown/alice/file.png')));
  await assertFails(deleteObject(file('alice', 'unknown/alice/file.png')));
});
