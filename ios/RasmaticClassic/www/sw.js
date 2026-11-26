/* Generado por tools/build-ios.js - no editar a mano.
   Variante: classic
   Build: c1476918ab3dacc5 */
const CACHE = 'rasmatic-classic-c1476918ab3dacc5';
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./three.min.js",
  "./mobile/game.js",
  "./mobile/modes.js",
  "./mobile/android-bridge.js",
  "./mobile/android-game.css",
  "./mobile/android-controls.css",
  "./ios/ios.css",
  "./ios/ios-bridge.js",
  "./vr/vr-preview.css",
  "./vr/vr-preview.js",
  "./net/vr-link.css",
  "./net/vr-link.js",
  "./fonts/fonts.css",
  "./fonts/google-fonts.css",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-1024.png",
  "./fonts/font01.woff2",
  "./fonts/font02.woff2",
  "./fonts/font03.woff2",
  "./fonts/font04.woff2",
  "./fonts/font05.woff2",
  "./fonts/font06.woff2",
  "./fonts/font07.woff2",
  "./fonts/font08.woff2",
  "./fonts/font09.woff2",
  "./fonts/font10.woff2",
  "./fonts/font11.woff2"
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isNavigation(request) {
  return request.mode === 'navigate' || /(?:\/|index\.html)$/.test(new URL(request.url).pathname);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isNavigation(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
