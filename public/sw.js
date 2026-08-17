/* global __APP_VERSION__ */
// SW_VERSION is auto-stamped from package.json via vite.config.ts __APP_VERSION__.
// Bump package.json version on every deploy — clients will reload automatically.
const SW_VERSION = (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.3.0');
const CACHE_NAME = `gagachat-v${SW_VERSION}`;
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
  '/favicon-32x32.png',
  '/logo-192.png',
];

// Install: cache core assets and immediately claim clients on first install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)).then(() => self.skipWaiting()).catch(() => { })
  );
});

// Tell controlled clients the SW version so they can detect real updates.
// Clients gate the reload on a version *change* from a previously-known value,
// so first-load (no stored version) will NOT trigger a reload.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Clean old caches first
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));

      await self.clients.claim();

      // Broadcast version to all controlled clients after claiming
      try {
        const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: false });
        for (const client of allClients) {
          client.postMessage({ type: 'SW_VERSION', version: SW_VERSION });
        }
      } catch {
        // ignore
      }
    })()
  );
});

// Fetch: cache-first for static assets, network-first for everything else
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Never cache API, auth, realtime, third-party, or AdSense requests
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.protocol === 'idb:' ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('cloudinary.com') ||
    url.hostname.includes('googletagmanager.com') ||
    url.hostname.includes('googlesyndication.com') ||
    url.hostname.includes('doubleclick.net') ||
    url.hostname.includes('adtrafficquality.google') ||
    url.hostname.includes('google.com') ||
    url.hostname.includes('youtube.com') ||
    url.hostname.includes('ytimg.com') ||
    url.hostname.includes('images.unsplash.com') ||
    url.hostname.includes('pexels.com') ||
    url.hostname.includes('dicebear.com') ||
    url.hostname.includes('pravatar.cc')
  ) return;

  // Cache-first for static assets (hashed filenames)
  const isStaticAsset = url.pathname.startsWith('/assets/') || url.pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot)$/);

  if (isStaticAsset) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.status === 200 && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      }).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Network-first for HTML/navigation — never serve stale HTML for navigations
  // to avoid old HTML loading new JS chunks (or vice-versa) after a deploy.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200 && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(async () => {
          // Offline fallback: prefer offline.html, then cached index.html
          const offline = await caches.match('/offline.html');
          if (offline) return offline;
          const index = await caches.match('/index.html');
          if (index) return index;
          // Always return a valid Response — never undefined
          return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
        })
    );
    return;
  }

  // Network-first for other same-origin requests
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200 && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        const index = await caches.match('/index.html');
        if (index) return index;
        // Always return a valid Response — never undefined
        return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      })
  );
});

self.addEventListener('message', (event) => {
  // Only accept messages from same-origin clients
  if (event.origin && event.origin !== self.location.origin) return;
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Enhanced push notification handler with background calling support
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    data = { title: event.data?.text() || 'GaGa Chat' };
  }

  const title = data.title || 'GaGa Chat';
  const isIncomingCall = data.type === 'incoming_call' || data.notificationType === 'incoming_call';
  const isMessage = data.type === 'message' || data.notificationType === 'message';

  const options = {
    body: data.body || 'You have a new notification',
    icon: data.icon || '/logo-192.png',
    badge: data.badge || '/logo-192.png',
    tag: isIncomingCall ? 'incoming-call' : (data.tag || 'default'),
    requireInteraction: isIncomingCall ? true : (data.requireInteraction ?? false),
    data: data.data || {},
    actions: [],
    vibrate: isIncomingCall ? [200, 100, 200, 100, 200] : [200, 100, 200],
    silent: false,
    // For incoming calls, enable persistent notification and higher priority
    ...(isIncomingCall && {
      priority: 'high',
      actions: [
        { action: 'accept_call', title: 'Accept' },
        { action: 'reject_call', title: 'Decline' },
      ],
    }),
    // For messages, add reply action if applicable
    ...(isMessage && {
      actions: [
        { action: 'reply_message', title: 'Reply' },
        { action: 'mark_read', title: 'Mark as read' },
      ],
    }),
  };

  // Store call data for later retrieval if app is closed
  if (isIncomingCall && data.data?.callId) {
    event.waitUntil(
      (async () => {
        try {
          const db = await new Promise((resolve, reject) => {
            const request = self.indexedDB.open('GaGaChatDB', 1);
            request.onupgradeneeded = () => {
              const store = request.result.createObjectStore('incomingCalls', { keyPath: 'callId' });
              store.createIndex('timestamp', 'timestamp', { unique: false });
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });

          const tx = db.transaction('incomingCalls', 'readwrite');
          tx.objectStore('incomingCalls').put({
            callId: data.data.callId,
            callerId: data.data.callerId,
            callerName: data.data.callerName,
            timestamp: Date.now(),
            notification: options,
          });
        } catch (e) {
          console.error('Failed to store incoming call:', e);
        }
      })()
    );
  }

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Enhanced background sync handler — retries queued messages and handles background calls
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-messages') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        for (const client of clients) {
          client.postMessage({ type: 'SYNC_MESSAGES' });
        }
      }).catch(() => { })
    );
  }
  // Handle background call sync
  if (event.tag === 'sync-incoming-call') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        for (const client of clients) {
          client.postMessage({ type: 'INCOMING_CALL_SYNC' });
        }
      }).catch(() => { })
    );
  }
});

// Enhanced notification click handler with call actions
self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {};
  const action = event.action;
  const isIncomingCall = data.type === 'incoming_call' || event.notification.tag === 'incoming-call';

  // Handle call actions (accept/reject)
  if (action === 'accept_call' && data.callId) {
    event.notification.close();
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        if (clients.length > 0) {
          clients[0].focus();
          clients[0].postMessage({
            type: 'ACCEPT_CALL',
            callId: data.callId,
            callerId: data.callerId,
            callerName: data.callerName,
          });
        } else {
          self.clients.openWindow(`/?callId=${encodeURIComponent(data.callId)}&action=accept`);
        }
      })
    );
    return;
  }

  if (action === 'reject_call' && data.callId) {
    event.notification.close();
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        if (clients.length > 0) {
          clients[0].focus();
          clients[0].postMessage({
            type: 'REJECT_CALL',
            callId: data.callId,
          });
        }
      })
    );
    return;
  }

  // Handle message reply action
  if (action === 'reply_message' && data.chatId) {
    event.notification.close();
    const path = `/chat/${encodeURIComponent(data.chatId)}`;
    const url = new URL(path, self.location.origin).href;
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        if (clients.length > 0) {
          clients[0].focus();
          clients[0].postMessage({ type: 'NAVIGATE', url, action: 'reply' });
        } else {
          self.clients.openWindow(url);
        }
      })
    );
    return;
  }

  // Handle mark as read
  if (action === 'mark_read' && data.chatId) {
    event.notification.close();
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        for (const client of clients) {
          client.postMessage({
            type: 'MARK_MESSAGE_READ',
            chatId: data.chatId,
          });
        }
      }).catch(() => { })
    );
    return;
  }

  // Regular notification click — navigate to appropriate page
  event.notification.close();

  // Build a safe relative path — never use untrusted external URLs
  let path = '/';
  if (data.chatId) path = `/chat/${encodeURIComponent(data.chatId)}`;
  if (data.userId) path = `/chat/${encodeURIComponent(data.userId)}`;
  if (data.callId) path = `/call`;
  if (isIncomingCall && data.callId) path = `/call`;
  if (data.type === 'friend_request') path = '/add-friends';
  if (data.type === 'timeline') path = '/timeline';
  if (action === 'reply') path = data.chatId ? `/chat/${encodeURIComponent(data.chatId)}` : '/';
  if (action === 'dismiss') return;
  const url = new URL(path, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      if (clients.length > 0) {
        const client = clients[0];
        client.focus();
        client.postMessage({ type: 'NAVIGATE', url });
      } else {
        self.clients.openWindow(url);
      }
    })
  );
});
