const CACHE = 'velzarytha-pdf-toolkit-v3';
const APP_SHELL = [
  './', './index.html', './css/pdf-toolkit.css', './js/pdf-toolkit.js', './js/office-converter.js',
  './vendor/libpdf.bundle.js', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then((cached) => {
    const network = fetch(event.request).then((response) => {
      if (response && (response.ok || response.type === 'opaque')) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
      return response;
    }).catch(() => cached);
    return cached || network;
  }));
});
