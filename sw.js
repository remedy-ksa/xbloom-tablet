// Offline cache: the panel opens without internet (recipes are stored on the tablet).
// VERSION is the one number for a release: scripts/bump.sh writes it here and in every ?v= in index.html.
const VERSION = 45;
const CACHE = 'xbp-v' + VERSION;
const FILES = ['./', 'index.html', 'css/app.css', 'css/fonts.css', 'fonts/baloo-arabic.woff2', 'fonts/baloo-latin.woff2', 'fonts/concert-one-latin.woff2', 'js/protocol.js', 'js/cloud.js', 'js/cap-ble.js', 'js/ble.js', 'js/dots.js', 'js/remedy-recipes.js', 'js/app.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/remedy-mark.svg', 'icons/majnoon.png', 'icons/majnoon-drive.png', 'icons/majnoon-write.png', 'icons/majnoon-run.png',
  'icons/majnoon-sleep.png', 'icons/majnoon-happy.png', 'icons/majnoon-glasses.png', 'icons/icon-192.png', 'icons/icon-512.png'];
const NET_WAIT_MS = 3000;   // "connected but no internet" wifi: fall back to the cache after this long

// One cache entry per file, whatever ?v= the page asked for.
const keyOf = (req) => { const u = new URL(req.url); u.search = ''; return u.href; };
// Only keep real answers from our own site: never a captive-portal page, a redirect or a 404/500.
const goodOwn = (res) => res && res.ok && res.type === 'basic' && !res.redirected;
// Google Fonts come back opaque (no CORS on the stylesheet request); keep those too.
const goodFont = (res) => res && (res.ok || res.type === 'opaque');

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(async (c) => {
    for (const f of FILES) {
      const res = await fetch(new Request(f, { cache: 'reload' }));
      if (!goodOwn(res)) throw new Error('precache ' + f + ' ' + res.status);
      await c.put(keyOf(new Request(f)), res);
    }
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

function fromNetwork(req) {
  const fresh = req.mode === 'navigate' ? new Request(req.url, { cache: 'no-cache' }) : new Request(req, { cache: 'no-cache' });
  return fetch(fresh).then((res) => {
    if (goodOwn(res)) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(keyOf(req), cp)); }
    return res;
  });
}
function fromCache(req) { return caches.match(keyOf(req)).then((r) => r || caches.match(req, { ignoreSearch: true })); }

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.hostname === 'client-api.xbloom.com') return;  // account API always live
  if (url.hostname.includes('fonts.g')) {
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => {
      if (goodFont(res)) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); }
      return res;
    })));
    return;
  }
  if (url.origin !== self.location.origin) return;
  // Network first (so updates arrive), but no longer than NET_WAIT_MS; a late answer still refreshes the cache.
  e.respondWith(new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (!done && r) { done = true; resolve(r); } };
    const net = fromNetwork(req);
    const timer = setTimeout(() => fromCache(req).then(finish), NET_WAIT_MS);
    net.then((res) => {
      clearTimeout(timer);
      if (res.ok) return finish(res);
      return fromCache(req).then((c) => finish(c || res));   // 404/500 from the host: serve the good copy we have
    }).catch(() => { clearTimeout(timer); fromCache(req).then((c) => finish(c || Response.error())); });
  }));
});
