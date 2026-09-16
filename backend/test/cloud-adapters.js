'use strict';
const assert = require('assert');
const { OssStore } = require('../oss-store');
const { FirebasePush } = require('../firebase-push');

(async () => {
  const calls = [];
  const fakeOss = {
    signatureUrl(key, options) { calls.push({key,options}); return `https://signed.invalid/${key}`; },
    async head(key) { calls.push({head:key}); return {res:{status:200}}; }
  };
  const store = new OssStore({}, fakeOss);
  const ticket = store.uploadTicket('user-1', 'image/jpeg');
  assert.match(ticket.objectKey, /^media\/\d{4}\/\d{2}\/\d{2}\/user-1\/.+\.jpg$/);
  assert.equal(calls[0].options.method, 'PUT');
  assert.equal(calls[0].options.expires, 300);
  await store.exists(ticket.objectKey);
  assert.match(store.downloadUrl(ticket.objectKey), /^https:\/\/signed\.invalid\//);
  assert.equal(calls.at(-1).options.method, 'GET');

  let payload;
  const push = new FirebasePush('', { async sendEachForMulticast(value) { payload=value; return {successCount:1}; } });
  await push.notify(['token-1'], {type:'message',data:{id:'m1',sender_name:'Alice',text:'Hello'}});
  assert.deepEqual(payload.tokens, ['token-1']);
  assert.equal(payload.data.type, 'message');
  assert.equal(payload.data.body, 'Hello');
  assert.equal(payload.notification, undefined);
  payload = null;
  await push.notify(['token-1'], {type:'presence',data:{online:true}});
  assert.equal(payload, null);
  await push.notify(['token-1'], {type:'friend_request',data:{request_id:'r1'}});
  assert.equal(payload.data.type, 'friend_request');
  assert.equal(payload.data.body, 'New friend request');
  await push.notify(['token-1'], {type:'call',data:{call_id:'c1',action:'ring',video:true}});
  assert.equal(payload.notification, undefined);
  assert.equal(payload.data.video, 'true');
  assert.equal(payload.android.ttl, 30000);
  await push.notify(['token-1'], {type:'call',data:{call_id:'c1',action:'cancel'}});
  assert.equal(payload.data.action, 'cancel');
  const checked = new OssStore({}, {async head() {return {res:{headers:{'content-length':'12','content-type':'image/png'}}};}});
  assert.equal(await checked.verifyUpload('x',12,'image/png'), true);
  await assert.rejects(checked.verifyUpload('x',13,'image/png'), {code:'UPLOAD_MISMATCH'});
  await assert.rejects(checked.verifyUpload('x',12,'image/jpeg'), {code:'UPLOAD_MISMATCH'});
  console.log('  PASS OSS signed ticket and download adapter');
  console.log('  PASS Firebase message/call/friend-request push adapter');
})().catch(error => { console.error(error); process.exit(1); });
