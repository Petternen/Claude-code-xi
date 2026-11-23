// Offline-støtte: appen vises fra lager med en gang og oppdateres i bakgrunnen.
// Prislisten hentes alltid fra nett først, så prisene er ferske når det finnes dekning.
const CACHE = 'prisgjett-v3';
const BILDER = 'prisgjett-bilder';
const MAKS_BILDER = 48; // nettlesere regner bilder fra andre domener som store, så hold antallet nede
const SKALL = [
  './', 'index.html', 'app.css', 'temaer.css', 'app.js', 'temaer.js', 'fx.js', 'manifest.webmanifest', 'data/produkter.json',
  'ikoner/ikon.svg', 'ikoner/ikon-192.png', 'ikoner/ikon-512.png', 'ikoner/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SKALL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== BILDER).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function nettForst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res.ok) { cache.put(req, res.clone()); return res; }
    return (await cache.match(req, { ignoreSearch: true })) || res;
  } catch {
    return (await cache.match(req, { ignoreSearch: true })) || Response.error();
  }
}

async function lagerForst(req, navn, maks, ignorerSok = false) {
  const cache = await caches.open(navn);
  const hit = await cache.match(req, { ignoreSearch: ignorerSok });
  const nett = fetch(req).then(async res => {
    if (res && (res.ok || res.type === 'opaque')) {
      await cache.put(req, res.clone());
      if (maks) { const k = await cache.keys(); for (const x of k.slice(0, Math.max(0, k.length - maks))) await cache.delete(x); }
    }
    return res;
  }).catch(() => hit || Response.error());
  return hit || nett;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith(url.pathname.endsWith('/data/produkter.json') ? nettForst(req) : lagerForst(req, CACHE, 0, true));
  } else if (/(^|\.)pji\.nu$/.test(url.hostname)) {
    e.respondWith(lagerForst(req, BILDER, MAKS_BILDER));
  } else if (/fonts\.(googleapis|gstatic)\.com$|fontshare\.com$/.test(url.hostname)) {
    e.respondWith(lagerForst(req, CACHE));
  }
});
