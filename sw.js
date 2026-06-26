/* Service Worker — caché del app shell para uso offline e instalación PWA. */
const CACHE = 'gmsb-racion-v7';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/lib/supabase.js',
  './js/supabase-config.js',
  './js/feeding-engine.js',
  './js/storage.js',
  './js/auth.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Estrategia "red primero": si hay internet muestra siempre la última versión
// (así las actualizaciones se ven enseguida) y guarda copia en caché; sin
// conexión, responde desde la caché.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
