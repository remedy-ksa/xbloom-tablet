// Offline cache: the panel opens without internet (recipes are stored on the tablet).
const CACHE = 'xbp-v23';
const FILES = ['./', 'index.html', 'css/app.css', 'js/protocol.js', 'js/cloud.js', 'js/ble.js', 'js/dots.js', 'js/remedy-recipes.js', 'js/app.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/remedy-mark.svg', 'icons/majnoon.png', 'icons/majnoon-drive.png', 'icons/majnoon-write.png', 'icons/majnoon-run.png', 'icons/majnoon-sleep.png', 'icons/majnoon-happy.png', 'icons/majnoon-glasses.png', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.hostname === 'client-api.xbloom.com') return;  // account API always live
  const fonts = url.hostname.includes('fonts.g');
  // network first for our files, skipping the 10-minute HTTP cache (so updates arrive), cache first for fonts
  e.respondWith(
    fonts
      ? caches.match(e.request).then((r) => r || fetch(e.request).then((res) => { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); return res; }))
      : fetch(e.request.mode === 'navigate' ? new Request(e.request.url, { cache: 'no-cache' }) : new Request(e.request, { cache: 'no-cache' })).then((res) => { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); return res; })
          .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
