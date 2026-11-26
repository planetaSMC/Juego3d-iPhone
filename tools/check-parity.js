/*
 * V19 · Paridad entre RASMATIC VR HEAD TRACKING y RASMATIC VR CLASSIC.
 *
 * Compara web/ y web-classic/ archivo por archivo. Solo se permiten las
 * diferencias documentadas:
 *   - headtracking/ (solo Head Tracking)
 *   - index.html, manifest.webmanifest, sw.js (identidad y variante)
 *   - icons/* (identidad visual)
 *
 * Cualquier diferencia en el núcleo del juego (game.js, android-bridge.js,
 * CSS, modos, fuentes, three.js, VR, red, puente iOS) es un error.
 *
 * Uso: node tools/check-parity.js
 * Sale con código 1 si el núcleo diverge.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const ht = path.join(root, 'web');
const classic = path.join(root, 'web-classic');

let errors = 0;
let checks = 0;
function ok(msg) { checks++; console.log('  ok   ' + msg); }
function bad(msg) { errors++; console.log('  FAIL ' + msg); }
function check(cond, msg) { if (cond) ok(msg); else bad(msg); }

function walk(dir, base, out) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = base ? base + '/' + name : name;
    if (fs.statSync(full).isDirectory()) walk(full, rel, out);
    else out.push(rel);
  }
  return out;
}

function sha(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const ALLOWED_HT_ONLY = [/^headtracking\//];
const ALLOWED_DIFFERENT = [
  /^index\.html$/,
  /^manifest\.webmanifest$/,
  /^sw\.js$/,
  /^icons\//
];

function allowedOnly(rel) { return ALLOWED_HT_ONLY.some((re) => re.test(rel)); }
function allowedDiff(rel) { return ALLOWED_DIFFERENT.some((re) => re.test(rel)); }

console.log('Paridad V19 (núcleo compartido)');
const htFiles = walk(ht, '', []).sort();
const clFiles = walk(classic, '', []).sort();
check(htFiles.length > 20, 'web/ tiene ' + htFiles.length + ' archivos');
check(clFiles.length > 20, 'web-classic/ tiene ' + clFiles.length + ' archivos');

const htSet = new Set(htFiles);
const clSet = new Set(clFiles);

let onlyHt = 0;
for (const rel of htFiles) {
  if (!clSet.has(rel)) {
    if (allowedOnly(rel)) onlyHt++;
    else bad('solo existe en Head Tracking: ' + rel);
  }
}
if (onlyHt) ok('archivos exclusivos de Head Tracking permitidos: ' + onlyHt);

let onlyCl = 0;
for (const rel of clFiles) {
  if (!htSet.has(rel)) {
    if (allowedOnly(rel)) bad('Classic no debe tener ' + rel);
    else { bad('solo existe en Classic: ' + rel); onlyCl++; }
  }
}
if (!onlyCl) ok('Classic no agrega archivos de núcleo');

let same = 0, diffs = 0, unexpected = 0;
for (const rel of htFiles) {
  if (!clSet.has(rel) || allowedOnly(rel)) continue;
  const a = path.join(ht, rel);
  const b = path.join(classic, rel);
  const eq = fs.readFileSync(a).equals(fs.readFileSync(b));
  if (eq) { same++; continue; }
  diffs++;
  if (!allowedDiff(rel)) {
    unexpected++;
    bad('el núcleo difiere: ' + rel);
  }
}
ok('archivos de núcleo idénticos byte a byte: ' + same);
if (diffs) ok('diferencias de identidad permitidas: ' + diffs);

/* ---------------- comprobaciones específicas ---------------- */
function read(p) { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; }

const htIndex = read(path.join(ht, 'index.html'));
const clIndex = read(path.join(classic, 'index.html'));

check(/src="mobile\/game\.js"/.test(htIndex), 'Head Tracking carga mobile/game.js');
check(/src="mobile\/game\.js"/.test(clIndex), 'Classic carga mobile/game.js');
check(/src="headtracking\/head-tracking\.js"/.test(htIndex), 'Head Tracking carga head-tracking.js');
check(!/headtracking\//.test(clIndex), 'Classic no carga headtracking/');
check(!/RasmaticHeadTracking|DeviceOrientationEvent|requestPermission/.test(clIndex),
  'Classic no referencia sensores ni permisos de orientación');
check(/storagePrefix: 'rasmatic\.'/.test(htIndex), 'Head Tracking conserva claves rasmatic.*');
check(/storagePrefix: 'rasmatic\.classic\.'/.test(clIndex), 'Classic usa rasmatic.classic.*');
check(/headTracking: true/.test(htIndex), 'Head Tracking declara headTracking: true');
check(/headTracking: false/.test(clIndex), 'Classic declara headTracking: false');

const coreRefs = [
  'mobile/game.js', 'mobile/modes.js', 'mobile/android-bridge.js',
  'mobile/android-game.css', 'mobile/android-controls.css',
  'ios/ios-bridge.js', 'ios/ios.css',
  'vr/vr-preview.js', 'vr/vr-preview.css',
  'net/vr-link.js', 'net/vr-link.css'
];
for (const ref of coreRefs) {
  check(htIndex.includes(ref) && clIndex.includes(ref), 'ambas apps cargan ' + ref);
}

check(!fs.existsSync(path.join(classic, 'headtracking')),
  'Classic no contiene la carpeta headtracking/');
check(fs.existsSync(path.join(ht, 'headtracking', 'head-tracking.js')),
  'Head Tracking contiene head-tracking.js');

const htIcon = path.join(ht, 'icons', 'icon-192.png');
const clIcon = path.join(classic, 'icons', 'icon-192.png');
check(fs.existsSync(htIcon) && fs.existsSync(clIcon) &&
  sha(htIcon) !== sha(clIcon), 'los iconos de las dos apps son distintos');

const htManifest = JSON.parse(read(path.join(ht, 'manifest.webmanifest')));
const clManifest = JSON.parse(read(path.join(classic, 'manifest.webmanifest')));
check(htManifest.name !== clManifest.name, 'los manifests tienen nombres distintos');
check(htManifest.id !== clManifest.id, 'los manifests tienen id distintos');
check(htManifest.theme_color !== clManifest.theme_color, 'los manifests tienen color distinto');

const htSw = read(path.join(ht, 'sw.js'));
const clSw = read(path.join(classic, 'sw.js'));
check(/const CACHE = 'rasmatic-ht-/.test(htSw), 'cache de Head Tracking propia');
check(/const CACHE = 'rasmatic-classic-/.test(clSw), 'cache de Classic propia');
check(htSw.includes('./headtracking/head-tracking.js') &&
  !clSw.includes('headtracking/'), 'solo Head Tracking precachea headtracking/');

/* El núcleo de juego también se compara directamente. */
for (const rel of ['mobile/game.js', 'mobile/android-bridge.js', 'mobile/android-game.css',
  'mobile/android-controls.css', 'mobile/modes.js', 'three.min.js',
  'vr/vr-preview.js', 'net/vr-link.js', 'ios/ios-bridge.js']) {
  const a = path.join(ht, rel);
  const b = path.join(classic, rel);
  if (fs.existsSync(a) && fs.existsSync(b)) {
    check(fs.readFileSync(a).equals(fs.readFileSync(b)), 'núcleo idéntico: ' + rel);
  }
}

console.log('');
if (errors) {
  console.log('FALLARON ' + errors + ' comprobaciones de ' + checks + '.');
  process.exit(1);
}
console.log('OK: ' + checks + ' comprobaciones de paridad superadas.');
