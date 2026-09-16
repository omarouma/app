'use strict';
const fs = require('node:fs');

class FirebasePush {
  constructor(serviceAccountJson, injectedMessaging = null) {
    this.ready = false;
    if (injectedMessaging) {
      this.messaging = injectedMessaging;
      this.ready = true;
      return;
    }
    if (!serviceAccountJson && process.env.FIREBASE_SERVICE_ACCOUNT_FILE) {
      serviceAccountJson = fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_FILE, 'utf8');
    }
    if (!serviceAccountJson || /^(set[-_]|replace|change)/i.test(serviceAccountJson)) return;
    const admin = require('firebase-admin');
    const serviceAccount = JSON.parse(serviceAccountJson);
    if (process.env.FIREBASE_PROJECT_ID && serviceAccount.project_id !== process.env.FIREBASE_PROJECT_ID) {
      throw new Error('Firebase credential project does not match FIREBASE_PROJECT_ID');
    }
    this.messaging = (admin.apps.length ? admin.app() : admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    })).messaging();
    this.ready = true;
  }

  async notify(tokens, event) {
    if (!this.ready || !tokens.length || !['message','call','friend_request'].includes(event.type)) return;
    const data = Object.fromEntries(Object.entries({ type:event.type, ...event.data })
      .filter(([,value]) => value != null).map(([key,value]) => [key, String(value)]));
    const title = event.type === 'call' ? 'Incoming GaGa Chat call' : (event.data.sender_name || 'GaGa Chat');
    const body = event.type === 'call' ? 'Tap to answer' :
      (event.type === 'friend_request' ? (event.data.action === 'accepted' ? 'Friend request accepted' : 'New friend request') :
        (event.data.text || 'New attachment'));
    const message = { tokens:tokens.slice(0,500), data,
      android:{priority:'high', ...(event.type === 'call' ? {ttl:30000, directBootOk:false} : {})} };
    // Calls must be data-only: Android can deliver them to the app's call
    // handler instead of letting the OS display an unanswerable generic card.
    if (event.type !== 'call') Object.assign(message.data, {title,body});
    return this.messaging.sendEachForMulticast(message);
  }
}
module.exports = { FirebasePush };
