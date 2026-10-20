// Infinity service worker: makes the site installable and keeps the page shell available offline.
// Network-first, so new movies in movies.js show up immediately whenever you're online.
// Videos / Google Drive requests are never touched.
const CACHE = 'infinity-shell-v3';
const SHELL = ['./', 'index.html', 'css/style.css', 'js/app.js', 'movies.js', 'icon.svg', 'manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.indexOf('/stream/') === 0) return;   // never cache the video proxy          // let Drive / CDN requests go straight through
  if (req.headers.has('range')) return;                // never interfere with video range requests
  e.respondWith(
    fetch(req).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('index.html')))
  );
});
