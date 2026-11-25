/*
 * Genera la version iPhone/PWA de RASMATIC Lugar 3D a partir del juego Android.
 *
 * Reglas:
 *  - Los archivos del juego (JS/CSS/fuentes/three.js) se COPIAN BYTE A BYTE.
 *  - El index.html NO se edita a mano: se lee el de Android y se aplica un
 *    conjunto cerrado de reemplazos. Si alguno no coincide exactamente, el
 *    script falla en vez de producir una copia divergente en silencio.
 *  - La unica diferencia funcional es el renombrado de la carpeta `android/`
 *    a `mobile/` en las 5 referencias del HTML (2 CSS + 3 JS). Ningun JS/CSS
 *    del juego referencia esa ruta internamente.
 *
 * Salidas:
 *  web/                        -> sitio PWA (Safari / "Anadir a pantalla de inicio")
 *  ios/RasmaticLugar3D/www/    -> copia exacta que empaqueta la app WKWebView
 *
 * Uso: node tools/build-ios.js [--source <ruta assets www Android>]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const defaultSource = 'C:/Users/valen/OneDrive/Desktop/Juego3d/android/app/src/main/assets/www';

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const source = path.resolve(argValue('--source') || process.env.RASMATIC_ANDROID_WWW || defaultSource);
const web = path.join(root, 'web');
const iosWww = path.join(root, 'ios', 'RasmaticLugar3D', 'www');

/* El modo VR es una capa propia del proyecto (no viene del APK Android):
   se edita en web/vr/ y el build la referencia y la espeja al bundle iOS. */
const vrFiles = ['vr/vr-preview.js', 'vr/vr-preview.css', 'net/vr-link.js', 'net/vr-link.css'];
for (const rel of vrFiles) {
  if (!fs.existsSync(path.join(web, rel))) fail('falta el archivo del modo VR: web/' + rel);
}

const report = [];

function fail(msg) {
  console.error('[build-ios] ERROR: ' + msg);
  process.exit(1);
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyFile(from, to) {
  ensureDir(path.dirname(to));
  fs.copyFileSync(from, to);
  report.push({ kind: 'copy', from: path.relative(root, from), to: path.relative(root, to), bytes: fs.statSync(to).size });
}

function writeFile(to, data) {
  ensureDir(path.dirname(to));
  fs.writeFileSync(to, data);
  report.push({ kind: 'gen', to: path.relative(root, to), bytes: Buffer.byteLength(data) });
}

/* ---------- 0. Origen ---------- */
if (!fs.existsSync(path.join(source, 'index.html'))) {
  fail('no se encontro el index.html de Android en ' + source + '\n' +
       '       pasa --source <ruta> o define RASMATIC_ANDROID_WWW');
}
if (!fs.existsSync(path.join(source, 'android', 'game.js'))) {
  fail('no se encontro android/game.js en ' + source);
}

/* ---------- 1. Copia byte a byte ---------- */
const filesToCopy = [
  ['three.min.js', 'three.min.js'],
  ['android/game.js', 'mobile/game.js'],
  ['android/modes.js', 'mobile/modes.js'],
  ['android/android-bridge.js', 'mobile/android-bridge.js'],
  ['android/android-game.css', 'mobile/android-game.css'],
  ['android/android-controls.css', 'mobile/android-controls.css']
];

for (const [from, to] of filesToCopy) {
  const src = path.join(source, from);
  if (!fs.existsSync(src)) fail('falta el archivo de origen: ' + from);
  copyFile(src, path.join(web, to));
}

// Fuentes: todo el directorio fonts/ (fonts.css + google-fonts.css + woff2).
const fontsDir = path.join(source, 'fonts');
if (!fs.existsSync(fontsDir)) fail('falta el directorio fonts/ en ' + source);
for (const name of fs.readdirSync(fontsDir).sort()) {
  const src = path.join(fontsDir, name);
  if (!fs.statSync(src).isFile()) continue;
  copyFile(src, path.join(web, 'fonts', name));
}

/* ---------- 2. index.html: reemplazos verificables ---------- */
let html = fs.readFileSync(path.join(source, 'index.html'), 'utf8');
const sourceHtmlBytes = Buffer.byteLength(html);
const applied = [];

function replaceOnce(label, from, to) {
  const first = html.indexOf(from);
  if (first < 0) fail('reemplazo no encontrado: ' + label);
  if (html.indexOf(from, first + 1) >= 0) fail('reemplazo con coincidencia multiple: ' + label);
  html = html.slice(0, first) + to + html.slice(first + from.length);
  applied.push(label);
}

// 2.1 Viewport: en iOS se agrega maximum-scale para evitar el zoom de pellizco.
replaceOnce(
  'viewport iOS',
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
  '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">'
);

// 2.2 Metadatos de app instalable + iconos + manifest.
replaceOnce(
  'meta Apple/PWA',
  '<title>RASMATIC · Lugar 3D completo</title>',
  `<title>RASMATIC · Lugar 3D completo</title>
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="RASMATIC">
<meta name="format-detection" content="telephone=no">
<meta name="theme-color" content="#0f2a55">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" sizes="180x180" href="icons/icon-180.png">
<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">
<link rel="icon" type="image/png" sizes="512x512" href="icons/icon-512.png">`
);

// 2.3 Carpeta android/ -> mobile/ (2 hojas de estilo).
replaceOnce(
  'css controls -> mobile',
  '<link rel="stylesheet" href="android/android-controls.css">',
  '<link rel="stylesheet" href="mobile/android-controls.css">'
);
replaceOnce(
  'css game -> mobile + capa iOS',
  '<link rel="stylesheet" href="android/android-game.css">',
  '<link rel="stylesheet" href="mobile/android-game.css">\n<link rel="stylesheet" href="ios/ios.css">\n<link rel="stylesheet" href="vr/vr-preview.css">\n<link rel="stylesheet" href="net/vr-link.css">'
);

// 2.4 Carpeta android/ -> mobile/ (3 scripts) + puente iOS + service worker.
replaceOnce(
  'js modes -> mobile',
  '<script src="android/modes.js"></script>',
  '<script src="mobile/modes.js"></script>'
);
replaceOnce(
  'js bridge -> mobile',
  '<script src="android/android-bridge.js"></script>',
  '<script src="mobile/android-bridge.js"></script>'
);
replaceOnce(
  'js game -> mobile + puente iOS',
  '<script src="android/game.js"></script>',
  `<script src="mobile/game.js"></script>
<script src="ios/ios-bridge.js"></script>
<script src="vr/vr-preview.js"></script>
<script src="net/vr-link.js"></script>
<script>
/* [iOS] Service worker solo bajo http/https (Safari y PWA instalada).
   En la app WKWebView el esquema es rasmatic:// y no existe: se omite.
   En el calibrador de Windows (?embed=1) tambien se omite: el servidor
   local ya entrega los archivos y no queremos cache vieja. */
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) &&
    !/[?&]embed=1\\b/.test(location.search)) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  });
}
</script>`
);

// 2.5 Solo comentario: la ruta citada en el codigo tambien pasa a mobile/.
replaceOnce(
  'comentario ruta mobile',
  'lo maneja android/game.js',
  'lo maneja mobile/game.js'
);

/* ---------- 3. Verificacion del resultado ---------- */
const attrRefs = html.match(/(?:src|href)="[^"]*android\/[^"]*"/g) || [];
if (attrRefs.length) fail('quedaron referencias a android/ en atributos: ' + attrRefs.join(', '));
if (/android\//.test(html)) {
  const bad = html.match(/[^\n]*android\/[^\n]*/g) || [];
  fail('quedaron referencias a android/ en el HTML:\n' + bad.join('\n'));
}
if (!/src="mobile\/game\.js"/.test(html)) fail('el HTML generado no carga mobile/game.js');

/* ---------- 4. Escribir web/index.html ---------- */
writeFile(path.join(web, 'index.html'), html);

/* ---------- 5. manifest.webmanifest ---------- */
const manifest = {
  name: 'RASMATIC · Lugar 3D',
  short_name: 'RASMATIC',
  description: 'Juego 3D de almacen: recorrido, estaciones, CNC y partida de 3 minutos.',
  lang: 'es',
  dir: 'ltr',
  start_url: './index.html',
  scope: './',
  display: 'standalone',
  display_override: ['standalone', 'fullscreen'],
  orientation: 'any',
  background_color: '#a3b2c7',
  theme_color: '#0f2a55',
  icons: [
    { src: 'icons/icon-180.png', sizes: '180x180', type: 'image/png' },
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-1024.png', sizes: '1024x1024', type: 'image/png', purpose: 'any maskable' }
  ]
};
writeFile(path.join(web, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');

/* ---------- 6. sw.js (cache versionada) ---------- */
/* La version incluye el HTML y los archivos de juego/VR: si solo cambia un
   CSS o un JS, la PWA instalada tambien descarta la cache vieja. */
const buildId = crypto.createHash('sha256')
  .update(html)
  .update(fs.readFileSync(path.join(web, 'mobile', 'game.js')))
  .update(fs.readFileSync(path.join(web, 'mobile', 'android-game.css')))
  .update(fs.readFileSync(path.join(web, 'vr', 'vr-preview.js')))
  .update(fs.readFileSync(path.join(web, 'vr', 'vr-preview.css')))
  .digest('hex').slice(0, 16);

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
  './vr/vr-preview.css',
  './vr/vr-preview.js',
  './net/vr-link.css',
  './net/vr-link.js',
  './fonts/fonts.css',
  './fonts/google-fonts.css',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-1024.png'
].concat(
  fs.readdirSync(fontsDir).filter((n) => n.endsWith('.woff2')).sort().map((n) => './fonts/' + n)
);

const sw = `/* Generado por tools/build-ios.js - no editar a mano.
   Build: ${buildId} */
const CACHE = 'rasmatic-${buildId}';
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

  // El documento va a la red primero para recibir actualizaciones; si no hay
  // red, se sirve la copia en cache (offline).
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

  // Recursos versionados por build: cache primero.
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
writeFile(path.join(web, 'sw.js'), sw);

/* ---------- 7. Espejo para la app iOS ---------- */
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
mirrorDir(web, iosWww);

/* ---------- 8. Reporte ---------- */
const sum = (arr) => arr.reduce((a, b) => a + b.bytes, 0);
const copied = report.filter((r) => r.kind === 'copy');
const generated = report.filter((r) => r.kind === 'gen');

console.log('Origen : ' + source);
console.log('Destino: ' + web);
console.log('');
console.log('Copiados byte a byte: ' + copied.length + ' archivos, ' + sum(copied) + ' B');
for (const r of copied) console.log('  ' + r.to + '  (' + r.bytes + ' B)');
console.log('');
console.log('Generados: ' + generated.length + ' archivos, ' + sum(generated) + ' B');
for (const r of generated) console.log('  ' + r.to + '  (' + r.bytes + ' B)');
console.log('');
console.log('index.html: ' + sourceHtmlBytes + ' B (Android) -> ' + Buffer.byteLength(html) + ' B (iOS)');
console.log('Reemplazos aplicados (' + applied.length + '):');
for (const a of applied) console.log('  - ' + a);
console.log('');
console.log('Build id: ' + buildId);
console.log('Espejo iOS: ' + iosWww);
