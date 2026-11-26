/*
 * Genera las DOS versiones iPhone/PWA de RASMATIC Lugar 3D (V19):
 *
 *   Head Tracking -> web/                 + ios/RasmaticHeadTracking/www
 *   Classic       -> web-classic/         + ios/RasmaticClassic/www
 *
 * Reglas:
 *  - El núcleo del juego se copia BYTE A BYTE desde el proyecto Android.
 *  - El index.html NO se edita a mano: se lee el de Android y se aplican
 *    reemplazos cerrados. Si alguno no coincide, el script falla.
 *  - Cada variante recibe su propio window.RasmaticApp, prefijo de
 *    almacenamiento, manifest, service worker, iconos e identidad.
 *  - Head Tracking agrega headtracking/ (JS + CSS). Classic no lo incluye
 *    ni referencia APIs de sensores.
 *  - La app heredada RasmaticLugar3D NO se toca: queda como respaldo V18.
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

const VARIANTS = [
  {
    id: 'headtracking',
    web: path.join(root, 'web'),
    ios: path.join(root, 'ios', 'RasmaticHeadTracking', 'www'),
    title: 'RASMATIC · VR HEAD TRACKING',
    name: 'RASMATIC · VR Head Tracking',
    short: 'RASMATIC HT',
    display: 'RASMATIC HT',
    storagePrefix: 'rasmatic.',
    headTracking: true,
    icons: path.join(root, 'web', 'icons'),
    theme: '#0f2a55',
    background: '#a3b2c7',
    cachePrefix: 'rasmatic-ht'
  },
  {
    id: 'classic',
    web: path.join(root, 'web-classic'),
    ios: path.join(root, 'ios', 'RasmaticClassic', 'www'),
    title: 'RASMATIC · VR CLASSIC',
    name: 'RASMATIC · VR Classic',
    short: 'RASMATIC CLASSIC',
    display: 'RASMATIC CLASSIC',
    storagePrefix: 'rasmatic.classic.',
    headTracking: false,
    icons: path.join(root, 'assets', 'icons-classic'),
    theme: '#7a4a12',
    background: '#c9b79c',
    cachePrefix: 'rasmatic-classic'
  }
];

function fail(msg) {
  console.error('[build-ios] ERROR: ' + msg);
  process.exit(1);
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

let report = [];

function copyFile(from, to) {
  ensureDir(path.dirname(to));
  fs.copyFileSync(from, to);
  report.push({ kind: 'copy', to: path.relative(root, to), bytes: fs.statSync(to).size });
}

function writeFile(to, data) {
  ensureDir(path.dirname(to));
  fs.writeFileSync(to, data);
  report.push({ kind: 'gen', to: path.relative(root, to), bytes: Buffer.byteLength(data) });
}

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

function freshDir(p) {
  fs.rmSync(p, { recursive: true, force: true });
  ensureDir(p);
}

/* ---------- 0. Origen y archivos propios ---------- */
if (!fs.existsSync(path.join(source, 'index.html'))) {
  fail('no se encontro el index.html de Android en ' + source +
       '\n       pasa --source <ruta> o define RASMATIC_ANDROID_WWW');
}
if (!fs.existsSync(path.join(source, 'android', 'game.js'))) {
  fail('no se encontro android/game.js en ' + source);
}

const projectFiles = [
  'ios/ios-bridge.js', 'ios/ios.css',
  'vr/vr-preview.js', 'vr/vr-preview.css',
  'net/vr-link.js', 'net/vr-link.css',
  'headtracking/head-tracking.js', 'headtracking/head-tracking.css'
];
for (const rel of projectFiles) {
  if (!fs.existsSync(path.join(root, 'web', rel))) {
    fail('falta el archivo propio del proyecto: web/' + rel);
  }
}
for (const v of VARIANTS) {
  if (!fs.existsSync(v.icons)) {
    fail('faltan los iconos de ' + v.id + ': ' + path.relative(root, v.icons) +
         '\n       ejecuta tools/make-icons.ps1 antes de build-ios.js');
  }
  const pngs = fs.readdirSync(v.icons).filter((n) => /^icon-\d+\.png$/.test(n));
  if (pngs.length < 4) fail('iconos incompletos en ' + path.relative(root, v.icons));
}

function configScript(v) {
  return `<script>
/* V19 · identidad y almacenamiento de esta aplicacion.
   ${v.headTracking
    ? 'Head Tracking conserva las claves historicas rasmatic.*.'
    : 'Classic usa rasmatic.classic.* para no mezclar preferencias.'} */
window.RasmaticApp = Object.freeze({
  id: '${v.id}',
  name: '${v.name}',
  shortName: '${v.short}',
  displayName: '${v.display}',
  headTracking: ${v.headTracking},
  storagePrefix: '${v.storagePrefix}',
  version: 'v19'
});
document.documentElement.setAttribute('data-app', '${v.id}');
(function () {
  var prefix = '${v.storagePrefix}';
  var base = 'rasmatic.';
  function mapKey(key) {
    key = String(key);
    if (prefix && key.indexOf(prefix) === 0) return key;
    if (prefix && key.indexOf(base) === 0) return prefix + key.slice(base.length);
    return prefix ? prefix + key : key;
  }
  window.RasmaticStore = {
    prefix: prefix,
    mapKey: mapKey,
    key: function (k) { return mapKey(k); },
    getItem: function (k) {
      try { return window.localStorage.getItem(mapKey(k)); } catch (e) { return null; }
    },
    setItem: function (k, v) {
      try { window.localStorage.setItem(mapKey(k), v); } catch (e) { /* modo privado */ }
    },
    removeItem: function (k) {
      try { window.localStorage.removeItem(mapKey(k)); } catch (e) { /* nada */ }
    }
  };
})();
</script>`;
}

function buildVariant(v) {
  report = [];

  /* La carpeta Classic es 100% generada. La carpeta web/ (HT) contiene
     archivos propios del proyecto y se actualiza en el lugar. */
  if (!v.headTracking) freshDir(v.web);
  else {
    ensureDir(v.web);
    for (const rel of ['index.html', 'manifest.webmanifest', 'sw.js']) {
      try { fs.rmSync(path.join(v.web, rel), { force: true }); } catch (e) { /* nada */ }
    }
  }

  /* ---------- 1. Copia byte a byte del nucleo ---------- */
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
    copyFile(src, path.join(v.web, to));
  }

  const fontsDir = path.join(source, 'fonts');
  if (!fs.existsSync(fontsDir)) fail('falta el directorio fonts/ en ' + source);
  for (const name of fs.readdirSync(fontsDir).sort()) {
    const src = path.join(fontsDir, name);
    if (!fs.statSync(src).isFile()) continue;
    copyFile(src, path.join(v.web, 'fonts', name));
  }

  /* ---------- 2. Archivos propios del proyecto ---------- */
  const own = ['ios/ios-bridge.js', 'ios/ios.css', 'vr/vr-preview.js', 'vr/vr-preview.css',
    'net/vr-link.js', 'net/vr-link.css'];
  if (v.headTracking) own.push('headtracking/head-tracking.js', 'headtracking/head-tracking.css');
  for (const rel of own) {
    const from = path.join(root, 'web', rel);
    const to = path.join(v.web, rel);
    if (from === to) continue;
    copyFile(from, to);
  }

  /* ---------- 3. Iconos ---------- */
  for (const name of fs.readdirSync(v.icons)) {
    const from = path.join(v.icons, name);
    const to = path.join(v.web, 'icons', name);
    if (!fs.statSync(from).isFile() || from === to) continue;
    copyFile(from, to);
  }

  /* ---------- 4. index.html: reemplazos verificables ---------- */
  let html = fs.readFileSync(path.join(source, 'index.html'), 'utf8');
  const sourceHtmlBytes = Buffer.byteLength(html);
  const applied = [];

  function replaceOnce(label, from, to) {
    const first = html.indexOf(from);
    if (first < 0) fail('[' + v.id + '] reemplazo no encontrado: ' + label);
    if (html.indexOf(from, first + 1) >= 0) fail('[' + v.id + '] reemplazo multiple: ' + label);
    html = html.slice(0, first) + to + html.slice(first + from.length);
    applied.push(label);
  }

  replaceOnce(
    'viewport iOS',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">'
  );

  replaceOnce(
    'meta Apple/PWA',
    '<title>RASMATIC · Lugar 3D completo</title>',
    `<title>${v.title}</title>
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="${v.display}">
<meta name="application-name" content="${v.display}">
<meta name="format-detection" content="telephone=no">
<meta name="theme-color" content="${v.theme}">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" sizes="180x180" href="icons/icon-180.png">
<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">
<link rel="icon" type="image/png" sizes="512x512" href="icons/icon-512.png">`
  );

  replaceOnce(
    'css controls -> mobile',
    '<link rel="stylesheet" href="android/android-controls.css">',
    '<link rel="stylesheet" href="mobile/android-controls.css">'
  );
  replaceOnce(
    'css game -> mobile + capas iOS/VR',
    '<link rel="stylesheet" href="android/android-game.css">',
    '<link rel="stylesheet" href="mobile/android-game.css">\n' +
    '<link rel="stylesheet" href="ios/ios.css">\n' +
    (v.headTracking ? '<link rel="stylesheet" href="headtracking/head-tracking.css">\n' : '') +
    '<link rel="stylesheet" href="vr/vr-preview.css">\n' +
    '<link rel="stylesheet" href="net/vr-link.css">'
  );

  replaceOnce(
    'js modes -> mobile + config',
    '<script src="android/modes.js"></script>',
    configScript(v) + '\n<script src="mobile/modes.js"></script>'
  );
  replaceOnce(
    'js bridge -> mobile',
    '<script src="android/android-bridge.js"></script>',
    '<script src="mobile/android-bridge.js"></script>'
  );
  replaceOnce(
    'js game -> mobile + capas iOS/VR',
    '<script src="android/game.js"></script>',
    `<script src="mobile/game.js"></script>
<script src="ios/ios-bridge.js"></script>
${v.headTracking ? '<script src="headtracking/head-tracking.js"></script>\n' : ''}<script src="vr/vr-preview.js"></script>
<script src="net/vr-link.js"></script>
<script>
/* [iOS] Service worker solo bajo http/https (Safari y PWA instalada).
   En la app WKWebView el esquema es rasmatic:// y no existe: se omite.
   En el calibrador de Windows (?embed=1) tambien se omite. */
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) &&
    !/[?&]embed=1\\b/.test(location.search)) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  });
}
</script>`
  );

  replaceOnce(
    'comentario ruta mobile',
    'lo maneja android/game.js',
    'lo maneja mobile/game.js'
  );

  /* ---------- 5. Verificacion del HTML ---------- */
  const attrRefs = html.match(/(?:src|href)="[^"]*android\/[^"]*"/g) || [];
  if (attrRefs.length) fail('[' + v.id + '] quedaron referencias a android/: ' + attrRefs.join(', '));
  if (/android\//.test(html)) {
    const bad = html.match(/[^\n]*android\/[^\n]*/g) || [];
    fail('[' + v.id + '] referencias a android/:\n' + bad.join('\n'));
  }
  if (!/src="mobile\/game\.js"/.test(html)) fail('[' + v.id + '] no carga mobile/game.js');
  if (!html.includes("storagePrefix: '" + v.storagePrefix + "'")) fail('[' + v.id + '] falta el prefijo de almacenamiento');
  if (v.headTracking) {
    if (!/src="headtracking\/head-tracking\.js"/.test(html)) fail('HT sin head-tracking.js');
    if (!/href="headtracking\/head-tracking\.css"/.test(html)) fail('HT sin head-tracking.css');
  } else {
    if (/headtracking\//.test(html)) fail('Classic no debe cargar headtracking/');
    if (/RasmaticHeadTracking|DeviceOrientationEvent/.test(html)) fail('Classic no debe referenciar sensores');
  }

  writeFile(path.join(v.web, 'index.html'), html);

  /* ---------- 6. manifest.webmanifest ---------- */
  const manifest = {
    name: v.name,
    short_name: v.short,
    description: v.headTracking
      ? 'RASMATIC Lugar 3D con seguimiento real de cabeza y modo VR BOX.'
      : 'RASMATIC Lugar 3D en su versión clásica, sin seguimiento de cabeza.',
    id: './?app=' + v.id,
    lang: 'es',
    dir: 'ltr',
    start_url: './index.html',
    scope: './',
    display: 'standalone',
    display_override: ['standalone', 'fullscreen'],
    orientation: 'any',
    background_color: v.background,
    theme_color: v.theme,
    icons: [
      { src: 'icons/icon-180.png', sizes: '180x180', type: 'image/png' },
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-1024.png', sizes: '1024x1024', type: 'image/png', purpose: 'any maskable' }
    ]
  };
  writeFile(path.join(v.web, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');

  /* ---------- 7. sw.js ---------- */
  const hash = crypto.createHash('sha256')
    .update(v.id)
    .update(html)
    .update(fs.readFileSync(path.join(v.web, 'mobile', 'game.js')))
    .update(fs.readFileSync(path.join(v.web, 'mobile', 'android-bridge.js')))
    .update(fs.readFileSync(path.join(v.web, 'mobile', 'modes.js')))
    .update(fs.readFileSync(path.join(v.web, 'mobile', 'android-game.css')))
    .update(fs.readFileSync(path.join(v.web, 'mobile', 'android-controls.css')))
    .update(fs.readFileSync(path.join(v.web, 'ios', 'ios-bridge.js')))
    .update(fs.readFileSync(path.join(v.web, 'ios', 'ios.css')))
    .update(fs.readFileSync(path.join(v.web, 'vr', 'vr-preview.js')))
    .update(fs.readFileSync(path.join(v.web, 'vr', 'vr-preview.css')))
    .update(fs.readFileSync(path.join(v.web, 'net', 'vr-link.js')))
    .update(fs.readFileSync(path.join(v.web, 'net', 'vr-link.css')));
  if (v.headTracking) {
    hash.update(fs.readFileSync(path.join(v.web, 'headtracking', 'head-tracking.js')))
      .update(fs.readFileSync(path.join(v.web, 'headtracking', 'head-tracking.css')));
  }
  const buildId = hash.digest('hex').slice(0, 16);

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
  ].concat(v.headTracking
    ? ['./headtracking/head-tracking.css', './headtracking/head-tracking.js']
    : []
  ).concat(
    fs.readdirSync(fontsDir).filter((n) => n.endsWith('.woff2')).sort().map((n) => './fonts/' + n)
  );

  const sw = `/* Generado por tools/build-ios.js - no editar a mano.
   Variante: ${v.id}
   Build: ${buildId} */
const CACHE = '${v.cachePrefix}-${buildId}';
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
  writeFile(path.join(v.web, 'sw.js'), sw);

  /* ---------- 8. Espejo para la app iOS ---------- */
  freshDir(v.ios);
  mirrorDir(v.web, v.ios);

  /* ---------- 9. Reporte ---------- */
  const sum = (arr) => arr.reduce((a, b) => a + b.bytes, 0);
  const copied = report.filter((r) => r.kind === 'copy');
  const generated = report.filter((r) => r.kind === 'gen');

  console.log('============================================================');
  console.log('Variante: ' + v.id + '  (' + v.display + ')');
  console.log('Destino : ' + path.relative(root, v.web));
  console.log('Espejo  : ' + path.relative(root, v.ios));
  console.log('Prefijo : ' + v.storagePrefix);
  console.log('Copiados byte a byte: ' + copied.length + ' archivos, ' + sum(copied) + ' B');
  console.log('Generados: ' + generated.length + ' archivos, ' + sum(generated) + ' B');
  console.log('index.html: ' + sourceHtmlBytes + ' B (Android) -> ' + Buffer.byteLength(html) + ' B (iOS)');
  console.log('Build id: ' + buildId);
  console.log('');

  return { id: v.id, web: v.web, ios: v.ios, buildId: buildId, bytes: Buffer.byteLength(html) };
}

const results = VARIANTS.map(buildVariant);

console.log('============================================================');
console.log('Listo. Dos variantes generadas:');
for (const r of results) {
  console.log('  ' + r.id.padEnd(12) + ' build ' + r.buildId + '  ' +
    path.relative(root, r.web) + ' -> ' + path.relative(root, r.ios));
}
