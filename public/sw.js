
// Bump this when you want clients to reload on a *real* version change.
// Do NOT couple to cache name alone.
const SW_VERSION = '2.1.0';
const CACHE_NAME = 'gagachat-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
  '/favicon-32x32.png',
  '/logo-192.png',
];

// Install: cache core assets
// Do NOT call skipWaiting() here — only skip waiting when the user explicitly
// triggers an update (SKIP_WAITING message). Calling it unconditionally causes
// the SW to activate on every page load and broadcast SW_VERSION, which triggers
// an infinite reload loop in the client.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
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
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: false });
        for (const client of clients) {
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

  // Never cache API, auth, realtime, or third-party requests
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('cloudinary.com') ||
    url.hostname.includes('googletagmanager.com') ||
    url.hostname.includes('dicebear.com')
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
          return (await caches.match('/offline.html')) || (await caches.match('/index.html'));
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
        return (await caches.match(event.request)) || (await caches.match('/index.html'));
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

// Push notification handler
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    data = { title: event.data?.text() || 'GaGa Chat' };
  }
  const title = data.title || 'GaGa Chat';
  const options = {
    body: data.body || 'You have a new notification',
    icon: data.icon || '/logo-192.png',
    badge: data.badge || '/logo-192.png',
    tag: data.tag || 'default',
    requireInteraction: data.requireInteraction ?? false,
    data: data.data || {},
    actions: data.actions || [],
    vibrate: [200, 100, 200],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const action = event.action;
  
  // Build a safe relative path — never use untrusted external URLs
  let path = '/';
  if (data.chatId) path = `/chat/${encodeURIComponent(data.chatId)}`;
  if (data.userId) path = `/chat/${encodeURIComponent(data.userId)}`;
  if (data.callId) path = `/call`;
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
