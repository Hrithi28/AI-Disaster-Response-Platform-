/* DRP service worker – makes the app open and work with no network.
 *  - App shell (HTML/JS/CSS): network-first, falls back to cache when offline
 *  - Hashed build assets: cache-first
 *  - Offline street map (one .pmtiles file read by byte ranges): a full copy is
 *    cached in the background, and ranges are served from it when there is no signal
 *  - Online map tiles: cache-first (tiles you have viewed stay available offline)
 *  - API GETs: network-first, last good response served offline
 *  - API writes are never cached; the page's outbox queues them instead
 *  - Web Push: shows notifications for new assignments / critical alerts
 */
const VERSION = 'drp-v5';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const TILES = `${VERSION}-tiles`;
const API = `${VERSION}-api`;
const MAPS = `${VERSION}-maps`;
const MAX_TILES = 3000;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/offline-map.json'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cacheName, max) {
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

async function networkFirst(req, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = (await cache.match(req)) || (fallbackUrl && (await caches.match(fallbackUrl)));
    if (hit) return hit;
    return new Response(JSON.stringify({ error: 'offline', offline: true }), { status: 503, headers: { 'content-type': 'application/json' } });
  }
}

async function cacheFirst(req, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') {
      cache.put(req, res.clone());
      if (maxEntries) trim(cacheName, maxEntries);
    }
    return res;
  } catch {
    return new Response('', { status: 504 });
  }
}

// Serve a byte range of a cached full file (HTTP 206), so the offline street map
// keeps working on a phone that has lost its connection to the control room.
async function rangeFromCache(req) {
  const cache = await caches.open(MAPS);
  const full = await cache.match(new URL(req.url).pathname);
  if (!full) return null;
  const buf = await full.arrayBuffer();
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.get('range') || '');
  const start = m ? Number(m[1]) : 0;
  const end = m && m[2] ? Math.min(Number(m[2]), buf.byteLength - 1) : buf.byteLength - 1;
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: { 'content-type': 'application/octet-stream', 'content-range': `bytes ${start}-${end}/${buf.byteLength}`, 'content-length': String(end - start + 1) },
  });
}

let mapCaching = false;
async function cacheFullMap(path) {
  if (mapCaching) return;
  mapCaching = true;
  try {
    const cache = await caches.open(MAPS);
    if (!(await cache.match(path))) {
      const res = await fetch(path);
      if (res.ok) await cache.put(path, res);
    }
  } catch {
    /* try again next time */
  } finally {
    mapCaching = false;
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return; // writes go through the page outbox
  if (url.origin === self.location.origin && url.pathname.endsWith('.pmtiles')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          e.waitUntil(cacheFullMap(url.pathname));
          return res;
        })
        .catch(async () => (await rangeFromCache(req)) || new Response('', { status: 504 })),
    );
    return;
  }
  if (url.origin === self.location.origin && url.pathname.startsWith('/offline/fonts/')) {
    e.respondWith(cacheFirst(req, MAPS));
    return;
  }
  if (url.pathname.startsWith('/socket.io')) return;
  if (/tile|basemaps|cartocdn/.test(url.hostname) || /\/\d+\/\d+\/\d+(@2x)?\.png$/.test(url.pathname)) {
    e.respondWith(cacheFirst(req, TILES, MAX_TILES));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) {
    if (/\/api\/(exports|docs)/.test(url.pathname)) return;
    e.respondWith(networkFirst(req, API));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(cacheFirst(req, ASSETS));
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(networkFirst(req, SHELL, '/index.html'));
    return;
  }
  e.respondWith(networkFirst(req, SHELL));
});

self.addEventListener('push', (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch {
    data = { title: 'DRP', body: e.data && e.data.text() };
  }
  e.waitUntil(
    self.registration.showNotification(data.title || 'DRP alert', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [200, 100, 200],
      data: { url: data.url || '/' },
      tag: data.tag,
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const w = wins.find((c) => c.url.includes(url));
      return w ? w.focus() : self.clients.openWindow(url);
    }),
  );
});
