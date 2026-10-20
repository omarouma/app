/**
 * Integration tests: actual Firebase Firestore Rules engine with mocked users.
 *
 * Requires the local Firestore emulator and a DEMO project (never production):
 *   npm install --prefix firebase --no-audit --no-fund
 *   firebase/node_modules/.bin/firebase emulators:exec \
 *     --project demo-gaga-security-tests --only firestore \
 *     --config firebase.json \
 *     "node --test firebase/tests/firestore.rules.emulator.test.mjs"
 *
 * Test contexts cannot access live Firebase or Supabase resources.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const dir = path.dirname(fileURLToPath(import.meta.url));
const rules = readFileSync(path.resolve(dir, '../../firestore.rules'), 'utf8');
const demoProject = 'demo-gaga-security-tests';

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: demoProject,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules,
    },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
});

after(async () => {
  if (env) await env.cleanup();
});

const client = (uid) => env.authenticatedContext(uid).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();

async function trustedSeed(collectionPath, data) {
  await env.withSecurityRulesDisabled(async (trusted) => {
    await setDoc(doc(trusted.firestore(), collectionPath), data);
  });
}

test('unauthenticated users cannot create profile or conversation', async () => {
  await assertFails(setDoc(doc(anonymous(), 'users/alice'), { name: 'Alice' }));
  await assertFails(setDoc(doc(anonymous(), 'chats/chat-1'), {
    participants: ['alice', 'bob'], type: 'direct',
  }));
});

test('user may create an ordinary own profile, but not another account', async () => {
  await assertSucceeds(setDoc(doc(client('alice'), 'users/alice'), { name: 'Alice' }));
  await assertFails(setDoc(doc(client('alice'), 'users/bob'), { name: 'Forged Bob' }));
});

test('users cannot assert privileged flags on profile creation or later edit', async () => {
  for (const key of ['role', 'admin', 'isAdmin', 'isModerator']) {
    await assertFails(setDoc(doc(client('alice'), 'users/alice'), {
      name: 'Alice', [key]: key === 'role' ? 'administrator' : true,
    }));
  }
  await assertSucceeds(setDoc(doc(client('alice'), 'users/alice'), { name: 'Alice' }));
  await assertFails(updateDoc(doc(client('alice'), 'users/alice'), { isAdmin: true }));
  await assertFails(updateDoc(doc(client('alice'), 'users/alice'), { role: 'admin' }));
});

test('signed-in clients cannot forge a Firebase chat membership document', async () => {
  await assertFails(setDoc(doc(client('alice'), 'chats/invented'), {
    participants: ['alice', 'bob'], type: 'direct',
  }));
  await assertFails(setDoc(doc(client('alice'), 'chats/invented'), {
    participants: ['alice'], type: 'direct',
  }));
});

test('server-provisioned chat is accessible only to its true participants', async () => {
  await trustedSeed('chats/verified', {
    participants: ['alice', 'bob'], type: 'direct', updatedAt: 1,
  });
  const allowed = await assertSucceeds(getDoc(doc(client('alice'), 'chats/verified')));
  assert.equal(allowed.data().type, 'direct');
  await assertSucceeds(getDoc(doc(client('bob'), 'chats/verified')));
  await assertFails(getDoc(doc(client('charlie'), 'chats/verified')));
});

test('message send requires verified chat membership and matching sender', async () => {
  await trustedSeed('chats/verified', {
    participants: ['alice', 'bob'], type: 'direct', updatedAt: 1,
  });
  await assertSucceeds(setDoc(doc(client('alice'), 'chats/verified/messages/msg-1'), {
    senderId: 'alice', type: 'text', text: 'Hello', createdAt: 1,
  }));
  await assertFails(setDoc(doc(client('alice'), 'chats/verified/messages/msg-2'), {
    senderId: 'bob', type: 'text', text: 'Forged', createdAt: 2,
  }));
  await assertFails(setDoc(doc(client('charlie'), 'chats/verified/messages/msg-3'), {
    senderId: 'charlie', type: 'text', text: 'Intrusion', createdAt: 3,
  }));
  await assertFails(getDoc(doc(client('charlie'), 'chats/verified/messages/msg-1')));
  await assertSucceeds(getDoc(doc(client('bob'), 'chats/verified/messages/msg-1')));
});

test('chat member may change preview metadata, never participants or type', async () => {
  await trustedSeed('chats/verified', {
    participants: ['alice', 'bob'], type: 'direct', updatedAt: 1,
  });
  await assertSucceeds(updateDoc(doc(client('alice'), 'chats/verified'), {
    updatedAt: 2,
  }));
  await assertFails(updateDoc(doc(client('alice'), 'chats/verified'), {
    participants: ['alice', 'charlie'],
  }));
  await assertFails(updateDoc(doc(client('alice'), 'chats/verified'), {
    type: 'group',
  }));
  await assertFails(updateDoc(doc(client('charlie'), 'chats/verified'), {
    updatedAt: 3,
  }));
  await assertFails(deleteDoc(doc(client('alice'), 'chats/verified')));
});

test('trusted membership removal denies a removed user without affecting remaining members', async () => {
  await trustedSeed('chats/verified', {
    participants: ['alice', 'bob'], type: 'direct', updatedAt: 1,
  });
  await trustedSeed('chats/verified/messages/older', {
    senderId: 'alice', type: 'text', text: 'Earlier message', createdAt: 1,
  });
  await assertSucceeds(getDoc(doc(client('bob'), 'chats/verified/messages/older')));
  await env.withSecurityRulesDisabled(async trusted => {
    await updateDoc(doc(trusted.firestore(), 'chats/verified'), {
      participants: ['alice'], updatedAt: 2,
    });
  });
  await assertFails(getDoc(doc(client('bob'), 'chats/verified')));
  await assertFails(getDoc(doc(client('bob'), 'chats/verified/messages/older')));
  await assertFails(setDoc(doc(client('bob'), 'chats/verified/messages/unauthorized'), {
    senderId: 'bob', type: 'text', text: 'Not authorized', createdAt: 3,
  }));
  await assertSucceeds(getDoc(doc(client('alice'), 'chats/verified/messages/older')));
});

test('trusted zero-member update denies chat and older messages, including former members', async () => {
  await trustedSeed('chats/verified', {
    participants: ['alice', 'bob'], type: 'group', updatedAt: 1,
  });
  await trustedSeed('chats/verified/messages/older', {
    senderId: 'alice', type: 'text', text: 'Earlier message', createdAt: 1,
  });
  await assertSucceeds(getDoc(doc(client('alice'), 'chats/verified/messages/older')));
  await env.withSecurityRulesDisabled(async trusted => {
    await updateDoc(doc(trusted.firestore(), 'chats/verified'), {
      participants: [], sourceUpdatedAt: '2026-10-20T13:30:00Z', updatedAt: 2,
    });
  });
  for (const uid of ['alice', 'bob']) {
    await assertFails(getDoc(doc(client(uid), 'chats/verified')));
    await assertFails(getDoc(doc(client(uid), 'chats/verified/messages/older')));
    await assertFails(setDoc(doc(client(uid), 'chats/verified/messages/intrusion'), {
      senderId: uid, type: 'text', text: 'Not authorized', createdAt: 3,
    }));
  }
});

test('trusted tombstone revokes access to chat and nested messages for every prior member', async () => {
  await trustedSeed('chats/verified', {
    participants: ['alice', 'bob'], type: 'direct', updatedAt: 1,
  });
  await trustedSeed('chats/verified/messages/older', {
    senderId: 'alice', type: 'text', text: 'Earlier message', createdAt: 1,
  });
  await env.withSecurityRulesDisabled(async trusted => {
    await updateDoc(doc(trusted.firestore(), 'chats/verified'), {
      participants: [], type: 'deleted', mirrorDeleted: true, updatedAt: 2,
    });
  });
  for (const uid of ['alice', 'bob']) {
    await assertFails(getDoc(doc(client(uid), 'chats/verified')));
    await assertFails(getDoc(doc(client(uid), 'chats/verified/messages/older')));
  }
});

test('client cannot forge trusted call or wallet records', async () => {
  await assertFails(setDoc(doc(client('alice'), 'calls/call-1'), {
    initiatorId: 'alice', recipientId: 'bob', participants: ['alice', 'bob'],
  }));
  await assertFails(setDoc(doc(client('alice'), 'users/alice/wallet/main'), {
    coins: 999999,
  }));
});
