import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normaliseChatType, normaliseMessageType, toAttachments, toConversation,
  toMembers, toMessage, toReceipt,
} from '../lib/map.mjs';

test('normaliseChatType collapses legacy names', () => {
  assert.equal(normaliseChatType('direct'), 'dm');
  assert.equal(normaliseChatType('private'), 'dm');
  assert.equal(normaliseChatType('group'), 'group');
  assert.equal(normaliseChatType('saved'), 'saved');
  assert.equal(normaliseChatType(null), 'dm');
});

test('normaliseMessageType maps audio to voice and defaults to text', () => {
  assert.equal(normaliseMessageType('audio'), 'voice');
  assert.equal(normaliseMessageType(''), 'text');
  assert.equal(normaliseMessageType('image'), 'image');
});

test('toConversation preserves ids, participants and timestamps', () => {
  const { id, data } = toConversation({
    id: 'chat-1', type: 'group', name: 'Team', avatar: 'a.png',
    participants: ['u1', 'u2'], created_by: 'u1',
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z',
  });
  assert.equal(id, 'chat-1');
  assert.equal(data.type, 'group');
  assert.equal(data.title, 'Team');
  assert.equal(data.photoUrl, 'a.png');
  assert.deepEqual(data.participants, ['u1', 'u2']);
  assert.equal(data.memberCount, 2);
  assert.equal(data.createdAt, Date.parse('2026-01-01T00:00:00.000Z'));
  assert.equal(data.lastMessageAt, Date.parse('2026-01-02T00:00:00.000Z'));
});

test('toMembers assigns owner/admin/member roles', () => {
  const members = toMembers({
    id: 'chat-2', participants: ['u1', 'u2', 'u3'], admins: ['u2'],
    created_by: 'u1', created_at: '2026-02-01T00:00:00.000Z', is_muted: true,
  });
  const roles = Object.fromEntries(members.map(m => [m.userId, m.data.role]));
  assert.deepEqual(roles, { u1: 'owner', u2: 'admin', u3: 'member' });
  assert.equal(members[0].data.notificationPref, 'none');
});

test('toMessage carries reactions and edit/deletion markers', () => {
  const { id, chatId, data } = toMessage({
    id: 'm2', chat_id: 'chat-1', sender_id: 'u2', type: 'image', content: null,
    local_id: 'c-2', reactions: { '👍': ['u1'], '❤️': ['u1', 'u2'] },
    created_at: '2026-01-02T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z',
  });
  assert.equal(id, 'm2');
  assert.equal(chatId, 'chat-1');
  assert.equal(data.clientMessageId, 'c-2');
  assert.equal(data.serverTs, Date.parse('2026-01-02T00:00:00.000Z'));
  assert.equal(data.editedAt, undefined);
  assert.deepEqual(data.reactions.sort((a, b) => a.uid.localeCompare(b.uid)), [
    { uid: 'u1', emoji: '👍' }, { uid: 'u1', emoji: '❤️' }, { uid: 'u2', emoji: '❤️' },
  ]);
});

test('toAttachments expands media_url and media_urls with metadata', () => {
  const attachments = toAttachments({
    id: 'm2', chat_id: 'chat-1', media_url: 'https://cdn.example/x.jpg',
    media_urls: ['https://cdn.example/x.jpg', 'https://cdn.example/y.jpg'],
    metadata: { width: 100, height: 200, mime: 'image/jpeg', size: 1234 },
  });
  assert.equal(attachments.length, 2);
  assert.equal(attachments[0].url, 'https://cdn.example/x.jpg');
  assert.equal(attachments[0].mime, 'image/jpeg');
  assert.equal(attachments[1].url, 'https://cdn.example/y.jpg');
  assert.equal(attachments[1].state, 'ready');
});

test('toReceipt projects a chat read cursor onto a message receipt', () => {
  const receipt = toReceipt({ chat_id: 'chat-1', user_id: 'u2', last_read_message_id: 'm1', last_read_at: '2026-01-02T01:00:00.000Z' });
  assert.deepEqual(receipt, {
    chatId: 'chat-1', messageId: 'm1', userId: 'u2', state: 'read',
    at: Date.parse('2026-01-02T01:00:00.000Z'),
  });
  assert.equal(toReceipt({ chat_id: 'chat-1', user_id: 'u2', last_read_message_id: null }), null);
});
