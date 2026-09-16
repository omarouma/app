'use strict';
// Static source guards ONLY: they do not compile Kotlin or execute Android views.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const source = name => fs.readFileSync(path.join(__dirname, '../app/src/main/java/app/gagachat/mobile', name), 'utf8');
const main = source('ui/MainActivity.kt');
const service = source('realtime/GaGaService.kt');
const chat = source('ui/ChatActivity.kt');
const outbox = source('realtime/MessageOutboxWorker.kt');
const session = source('prefs/SessionStore.kt');

test('STATIC: enqueue and draft removal use the same durable editor transaction', () => {
  const enqueue = session.split('fun enqueueText(')[1].split('fun pendingTexts()')[0];
  assert.match(enqueue, /putString\("message_outbox",all.toString\(\)\)\s*\.remove\("draft_\$chatId"\)\s*\.commit\(\)/);
});

test('STATIC: outgoing text is durable before composer clear and network send', () => {
  const send = chat.split('private fun sendText()')[1].split('private suspend fun flushOutbox()')[0];
  const persist = send.indexOf('SessionStore.enqueueText');
  assert.ok(persist >= 0 && persist < send.indexOf('input.setText("")'));
  assert.ok(persist < send.indexOf('Api.post'));
  assert.match(send, /SessionStore.removePendingText\(clientId\)/);
  assert.match(send, /CancellationException\) throw e/);
});

test('STATIC: drafts survive screen exit and pending rows survive server refresh', () => {
  assert.match(chat, /input.setText\(SessionStore.draft\(chatId\)\)/);
  assert.match(chat, /SessionStore.saveDraft\(chatId, input.text.toString\(\)\)/);
  assert.match(session, /check\(editor.commit\(\)\)/);
  const history = chat.split('private suspend fun loadMessages()')[1].split('private suspend fun resolvePeer()')[0];
  assert.match(history, /SessionStore.pendingTexts\(chatId\)/);
  assert.match(history, /messages.none \{ it.id == id \}/);
});

test('STATIC: rejected outbox messages remain durable rather than being discarded', () => {
  const workerError = outbox.split('catch (e: Api.ApiError)')[1].split('catch (_: Exception)')[0];
  assert.doesNotMatch(workerError, /removePendingText/);
  assert.match(workerError, /e.status != 408 && e.status != 429/);
  assert.match(workerError, /Result.failure\(\)/);
  assert.match(workerError, /Result.retry\(\)/);
  const flushError = chat.split('private suspend fun flushOutbox()')[1]
    .split('catch(e:Exception)')[1].split('statusView.text=')[0];
  assert.doesNotMatch(flushError, /removePendingText/);
  assert.match(flushError, /MessageOutboxWorker.schedule/);
});

test('STATIC: tab selection uses the owned ScrollView, not a detached page parent', () => {
  assert.doesNotMatch(main, /tabPages\[0\]\.parent/);
  assert.match(main, /tabScroll\.addView\(page\)/);
});
test('STATIC: message/receipt/deletion events fetch current chat rows', () => {
  assert.match(main, /"message", "receipt", "message_deleted" -> lifecycleScope\.launch \{ refreshChats\(\) \}/);
});
test('STATIC: presence events fetch contact state', () => {
  assert.match(main, /"presence" -> lifecycleScope\.launch \{ refreshContacts\(\) \}/);
});
test('STATIC: disabled wallet short-circuits network requests and displays coming soon', () => {
  assert.match(main, /private suspend fun loadWallet\(\) \{\s*if \(!BuildConfig\.WALLET_ENABLED\)/);
  assert.match(main, /wallet_coming_soon_body/);
});
test('STATIC: deletion events reach the chat and main channels', () => {
  assert.match(service, /"receipt", "message_deleted" -> \{[^}]*CallBus\.emit\("chat-"[^}]*CallBus\.emit\("main", j\)/);
});
test('STATIC: incoming message notification is cancelled only for a visible chat', () => {
  assert.match(service, /showMessageNotification\(d\)\s*\} else \{\s*NotifManagerCompat\.cancelForChat\(chatId\)/);
  assert.match(service, /NotifManagerCompat\.registerChat\(chatId, chatId\.hashCode\(\)\)/);
});
