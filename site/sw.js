/* Isläge service worker
 * - Appen (sidan) och data/*.json: nätet först, så att nya versioner syns direkt. Cachen används bara offline.
 * - Ikoner och typsnitt: cache först (ändras sällan).
 * - API-anrop: nätet först, senast hämtade svar som reserv offline.
 * Höj VERSION vid större ändringar så att gamla cacher rensas.
 */
const VERSION = 'islage-v7';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== VERSION + '-api').map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const networkFirst = (req, cacheName) => fetch(req).then(res => {
  if (res.ok) { const copy = res.clone(); caches.open(cacheName).then(c => c.put(req, copy)); }
  return res;
}).catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin && url.pathname.startsWith('/api/')) {
    e.respondWith(networkFirst(req, VERSION + '-api'));
    return;
  }
  // själva appen och datafiler: alltid senaste versionen när det finns nät
  if (req.mode === 'navigate' || (url.origin === location.origin && /(\/|\.html|\.json|\.webmanifest)$/.test(url.pathname))) {
    e.respondWith(networkFirst(req, VERSION));
    return;
  }
  // ikoner, typsnitt: cache först
  if (url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    })));
  }
});
