/// <reference lib="webworker" />

const CACHE_NAME = 'gagachat-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon-32x32.png',
  '/logo-192.png',
];

// Install: cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  // @ts-ignore
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  // @ts-ignore
  self.clients.claim();
});

// Fetch: cache-first strategy for assets
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests and API calls
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;
  
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    }).catch(() => {
      // Fallback for offline
      return caches.match('/index.html');
    })
  );
});

// Push notification handler
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const title = data.title || 'GaGa Chat';
  const options: NotificationOptions = {
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
    // @ts-ignore
    self.registration.showNotification(title, options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const action = event.action;
  
  let url = '/';
  if (data.chatId) url = `/chat/${data.chatId}`;
  if (data.userId) url = `/chat/${data.userId}`;
  if (data.callId) url = `/call`;
  if (data.type === 'friend_request') url = '/add-friends';
  if (data.type === 'timeline') url = '/timeline';
  if (action === 'reply') url = data.chatId ? `/chat/${data.chatId}` : '/';
  if (action === 'dismiss') return;

  event.waitUntil(
    // @ts-ignore
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      if (clients.length > 0) {
        const client = clients[0] as any;
        client.focus();
        client.postMessage({ type: 'NAVIGATE', url });
      } else {
        // @ts-ignore
        self.clients.openWindow(url);
      }
    })
  );
});
