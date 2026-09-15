'use strict';
// Static source guards ONLY: they do not compile Kotlin or execute Android views.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const source = name => fs.readFileSync(path.join(__dirname, '../app/src/main/java/app/gagachat/mobile', name), 'utf8');
const main = source('ui/MainActivity.kt');
const service = source('realtime/GaGaService.kt');

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
