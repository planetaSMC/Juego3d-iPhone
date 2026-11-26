/*
 * V20 · Genera el sitio PWA y el espejo iOS de RASMATIC VR.
 *
 * A diferencia de V19:
 *  - Hay UNA sola app (RASMATIC VR, com.rasmatic.lugar3d).
 *  - El núcleo web es propio de V20 (`web/index.html`, `web/v20/`,
 *    `web/mobile/game.js`); ya no se copia el index del almacén Android.
 *  - La escena del HTML se mantiene en `web/v20/pharmacy-scene.js`.
 *  - Se genera manifest + service worker y se espeja TODO a
 *    `ios/RasmaticLugar3D/www`.
 *
 * Uso: node tools/build-ios.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const web = path.join(root, 'web');
const iosWww = path.join(root, 'ios', 'RasmaticLugar3D', 'www');

function fail(msg) {
  console.error('[build-ios] ERROR: ' + msg);
  process.exit(1);
}

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function read(rel) { return fs.readFileSync(path.join(web, rel)); }
function exists(rel) { return fs.existsSync(path.join(web, rel)); }

const required = [
  'index.html',
  'three.min.js',
  'mobile/game.js',
  'mobile/modes.js',
  'mobile/android-bridge.js',
  'mobile/android-game.css',
  'mobile/android-controls.css',
  'ios/ios-bridge.js',
  'ios/ios.css',
  'headtracking/head-tracking.js',
  'headtracking/head-tracking.css',
  'vr/vr-preview.js',
  'vr/vr-preview.css',
  'net/vr-link.js',
  'net/vr-link.css',
  'v20/pharmacy-scene.js',
  'v20/pharmacy-core.js',
  'v20/pharmacy.css',
  'fonts/fonts.css',
  'fonts/google-fonts.css'
];
for (const rel of required) {
  if (!exists(rel)) fail('falta web/' + rel);
}
for (const n of [180, 192, 512, 1024]) {
  if (!exists('icons/icon-' + n + '.png')) fail('falta web/icons/icon-' + n + '.png');
}

/* ---------- manifest ---------- */
const manifest = {
  name: 'RASMATIC VR',
  short_name: 'RASMATIC VR',
  description: 'Farmacia 3D RASMATIC con Head Tracking, partida, VR BOX y controles Bluetooth.',
  id: './?app=v20',
  lang: 'es',
  dir: 'ltr',
  start_url: './index.html',
  scope: './',
  display: 'standalone',
  display_override: ['standalone', 'fullscreen'],
  orientation: 'any',
  background_color: '#bcd3c8',
  theme_color: '#0f2a55',
  icons: [
    { src: 'icons/icon-180.png', sizes: '180x180', type: 'image/png' },
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-1024.png', sizes: '1024x1024', type: 'image/png', purpose: 'any maskable' }
  ]
};
fs.writeFileSync(path.join(web, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');

/* ---------- build id ---------- */
const hash = crypto.createHash('sha256');
for (const rel of [
  'index.html', 'mobile/game.js', 'mobile/android-bridge.js',
  'mobile/android-game.css', 'mobile/android-controls.css',
  'v20/pharmacy-scene.js', 'v20/pharmacy-core.js', 'v20/pharmacy.css',
  'headtracking/head-tracking.js', 'vr/vr-preview.js', 'net/vr-link.js'
]) {
  hash.update(read(rel));
}
const buildId = hash.digest('hex').slice(0, 16);

/* ---------- service worker ---------- */
const fonts = fs.readdirSync(path.join(web, 'fonts'))
  .filter((n) => n.endsWith('.woff2')).sort()
  .map((n) => './fonts/' + n);

const precache = [
  './',
  './index.html',
  './manifest.webmanifest',
  './three.min.js',
  './mobile/game.js',
  './mobile/modes.js',
  './mobile/android-bridge.js',
  './mobile/android-game.css',
  './mobile/android-controls.css',
  './ios/ios.css',
  './ios/ios-bridge.js',
  './headtracking/head-tracking.css',
  './headtracking/head-tracking.js',
  './vr/vr-preview.css',
  './vr/vr-preview.js',
  './net/vr-link.css',
  './net/vr-link.js',
  './v20/pharmacy.css',
  './v20/pharmacy-scene.js',
  './v20/pharmacy-core.js',
  './fonts/fonts.css',
  './fonts/google-fonts.css',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-1024.png'
].concat(fonts);

const sw = `/* Generado por tools/build-ios.js (V20) - no editar a mano.
   Build: ${buildId} */
const CACHE = 'rasmatic-v20-${buildId}';
const PRECACHE = ${JSON.stringify(precache, null, 2)};

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
  return request.mode === 'navigate' || /(?:\\/|index\\.html)$/.test(new URL(request.url).pathname);
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
`;
fs.writeFileSync(path.join(web, 'sw.js'), sw);

/* ---------- espejo iOS ---------- */
function mirrorDir(from, to) {
  ensureDir(to);
  for (const name of fs.readdirSync(from)) {
    const src = path.join(from, name);
    const dst = path.join(to, name);
    if (fs.statSync(src).isDirectory()) mirrorDir(src, dst);
    else {
      ensureDir(path.dirname(dst));
      fs.copyFileSync(src, dst);
    }
  }
}
fs.rmSync(iosWww, { recursive: true, force: true });
mirrorDir(web, iosWww);

console.log('RASMATIC VR · build V20');
console.log('  web:  ' + web);
console.log('  iOS:  ' + iosWww);
console.log('  build: ' + buildId);
console.log('  precache: ' + precache.length + ' recursos');
