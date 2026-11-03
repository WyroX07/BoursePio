// Cache hors-ligne (appareil de la banque) : réseau d'abord pour avoir les mises à jour, cache si pas de réseau.
const CACHE = 'boursepio-v3';
const FILES = ['./', 'index.html', 'css/app.css', 'js/data.js', 'js/common.js', 'js/sync.js', 'js/engine.js', 'js/host.js', 'js/screens.js',
  'vendor/qrcode.js', 'vendor/mqtt.min.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request, {ignoreSearch: true}))
  );
});
