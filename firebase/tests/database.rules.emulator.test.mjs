import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

// Explicit loopback host and demo project: no production credentials or data.
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-gaga-security-tests',
    database: { host: '127.0.0.1', port: 9000,
      rules: readFileSync(new URL('../../database.rules.json', import.meta.url), 'utf8') },
  });
});
beforeEach(async () => { await env.clearDatabase(); });
after(async () => { if (env) await env.cleanup(); });
const db = uid => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).database();
const presence = { state: 'online', lastChanged: 123456 };

test('anonymous clients cannot read or write presence and status', async () => {
  for (const path of ['presence/alice', 'status/alice']) {
    await assertFails(db().ref(path).once('value'));
    await assertFails(db().ref(path).set(presence));
  }
});

test('presence and status writes and deletion require the owner', async () => {
  for (const path of ['presence/alice', 'status/alice']) {
    await assertSucceeds(db('alice').ref(path).set(presence));
    await assertFails(db('bob').ref(path).set(presence));
    await assertFails(db('bob').ref(path).remove());
    await assertSucceeds(db('alice').ref(path).remove());
  }
});

test('presence rejects invalid states, missing fields and invalid timestamps', async () => {
  for (const value of [{ state: 'away', lastChanged: 1 }, { state: 'online' },
    { lastChanged: 1 }, { state: 'offline', lastChanged: 'yesterday' }]) {
    await assertFails(db('alice').ref('presence/alice').set(value));
  }
  await assertSucceeds(db('alice').ref('presence/alice').set(presence));
  await assertFails(db('alice').ref('presence/alice/state').set('invalid'));
  await assertSucceeds(db('alice').ref('presence/alice').update({ state: 'offline' }));
});

test('authenticated individual reads are allowed but bulk listing is denied', async () => {
  for (const root of ['presence', 'status']) {
    await assertSucceeds(db('alice').ref(`${root}/alice`).set(presence));
    await assertSucceeds(db('bob').ref(`${root}/alice`).once('value'));
    await assertFails(db('bob').ref(root).once('value'));
  }
});

test('disabled transports and unknown paths deny authenticated and anonymous access', async () => {
  for (const uid of [undefined, 'alice']) {
    for (const path of ['typing/chat/alice', 'signaling/call/alice', 'receipts/chat/alice', 'unknown/alice']) {
      await assertFails(db(uid).ref(path).set({ value: true }));
      await assertFails(db(uid).ref(path).once('value'));
    }
    await assertFails(db(uid).ref().once('value'));
  }
});

test('atomic multi-location update cannot overwrite another user', async () => {
  await assertFails(db('alice').ref().update({
    'presence/alice': presence, 'presence/bob': presence,
  }));
  await assertSucceeds(db('alice').ref().update({
    'presence/alice': presence, 'status/alice': presence,
  }));
});
