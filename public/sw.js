/*
 * Hello Beauty – minimaler Service Worker.
 * Cacht NUR statische Dateien (Build-Assets, Schriften, Icons, Bilder) und die Offline-Seite.
 * Seiten (HTML), API-Antworten und alles mit personenbezogenen Daten gehen immer direkt ans Netz.
 */
const VERSION = 'hb-v2';
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = '/offline';

const PRECACHE = [
  OFFLINE_URL,
  '/fonts/hanken-grotesk-latin.woff2',
  '/fonts/gloock-latin.woff2',
  '/brand/monogramm-gold.png',
  '/icons/icon-192.png',
];

/** Nur diese Pfade dürfen in den Cache – alles andere nie. */
const CACHEABLE = /^\/(_next\/static\/|fonts\/|icons\/|brand\/|photos\/|splash\/)/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Seitenaufrufe: immer Netz; nur ohne Verbindung die Offline-Seite (ohne persönliche Daten)
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  if (!CACHEABLE.test(url.pathname)) return;

  // Statische Dateien: Cache zuerst, im Hintergrund auffrischen
  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

/*
 * Web-Push (Teil 4): Der Server schickt verschlüsselt (RFC 8291) ein JSON { title, body, url, tag }.
 * Nur eigene Pfade werden geöffnet – fremde URLs ignoriert der Service Worker.
 */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const url = typeof data.url === 'string' && data.url.startsWith('/') && !data.url.startsWith('//') ? data.url : '/app';
  event.waitUntil(
    self.registration.showNotification(data.title || 'Hello Beauty', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || undefined,
      renotify: !!data.tag,
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/app', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (new URL(client.url).origin === self.location.origin && 'navigate' in client) {
          return client.focus().then(() => client.navigate(target));
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
