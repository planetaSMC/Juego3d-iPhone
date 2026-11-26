/*
 * Verifica la estructura de las DOS apps V19 sin macOS/Xcode.
 *
 * Comprueba:
 *  - project.pbxproj: sintaxis, IDs, targets Head Tracking y Classic
 *  - la app heredada RasmaticLugar3D sigue presente (no se reemplaza)
 *  - bundle ids distintos y válidos para instalación simultánea
 *  - Info.plist de cada app: identidad, variante y permisos
 *  - Head Tracking declara NSMotionUsageDescription y compila Core Motion
 *  - Classic NO declara sensores, NO compila HeadTrackingBridge y su web
 *    no referencia headtracking/
 *  - Assets.xcassets: iconos exactos y sin alfa
 *  - web/ y web-classic/: identidad, almacenamiento, manifest y sw.js
 *  - espejos ios/RasmaticHeadTracking/www y ios/RasmaticClassic/www byte a byte
 *  - mandos GameController compartidos
 *  - flujo de GitHub Actions, build-ipa.sh, verify-ipa.js y publish-github.js
 *
 * Uso: node tools/check-xcode.js
 * Sale con código 1 si algo falla.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const ios = path.join(root, 'ios');
const proj = path.join(ios, 'RasmaticLugar3D.xcodeproj', 'project.pbxproj');
const sharedDir = path.join(ios, 'RasmaticLugar3D');

const VARIANTS = [
  {
    id: 'headtracking',
    target: 'RasmaticHeadTracking',
    dir: 'RasmaticHeadTracking',
    bundle: 'com.rasmatic.lugar3d.headtracking',
    web: 'web',
    display: 'RASMATIC HT',
    prefix: 'rasmatic.',
    headTracking: true,
    scheme: 'RasmaticHeadTracking'
  },
  {
    id: 'classic',
    target: 'RasmaticClassic',
    dir: 'RasmaticClassic',
    bundle: 'com.rasmatic.lugar3d.classic',
    web: 'web-classic',
    display: 'RASMATIC CLASSIC',
    prefix: 'rasmatic.classic.',
    headTracking: false,
    scheme: 'RasmaticClassic'
  }
];

let errors = 0;
let checks = 0;
function ok(msg) { checks++; console.log('  ok   ' + msg); }
function bad(msg) { errors++; console.log('  FAIL ' + msg); }
function check(cond, msg) { if (cond) ok(msg); else bad(msg); }
function read(p) { return fs.readFileSync(p, 'utf8'); }
function exists(p) { return fs.existsSync(p); }

/* ---------------- 1. project.pbxproj ---------------- */
console.log('project.pbxproj');
const pbx = exists(proj) ? read(proj) : '';
check(!!pbx, 'existe project.pbxproj');

function balanced(text) {
  const pairs = { '{': '}', '(': ')' };
  const stack = [];
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') { i++; continue; }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === '{' || c === '(') stack.push(pairs[c]);
    else if (c === '}' || c === ')') {
      if (stack.pop() !== c) return false;
    }
  }
  return stack.length === 0 && !inString;
}
check(pbx && balanced(pbx), 'llaves y paréntesis balanceados');

const ids = new Set();
for (const m of pbx.matchAll(/^\t\t([0-9A-F]{24})(?: \/\*[^\n]*\*\/)? = \{/gm)) ids.add(m[1]);
check(ids.size >= 30, 'objetos definidos: ' + ids.size);

const refs = new Set();
for (const m of pbx.matchAll(/\b([0-9A-F]{24})\b/g)) refs.add(m[1]);
const missing = [...refs].filter((id) => !ids.has(id));
check(missing.length === 0, 'todas las referencias apuntan a objetos existentes' +
  (missing.length ? ' (faltan: ' + missing.join(', ') + ')' : ''));

const rootMatch = pbx.match(/rootObject = ([0-9A-F]{24})/);
check(!!rootMatch && ids.has(rootMatch[1]), 'rootObject válido');
check(/productType = "com\.apple\.product-type\.application";/.test(pbx), 'tipo de producto: aplicación');

function targetId(name) {
  const re = new RegExp('\\t\\t([0-9A-F]{24}) \\/\\* ' + name +
    ' \\*\\/ = \\{\\n\\t\\t\\tisa = PBXNativeTarget;');
  const m = pbx.match(re);
  return m ? m[1] : null;
}

function blockFor(id) {
  const re = new RegExp('\\t\\t' + id + ' \\/\\*[^\\n]*\\*\\/ = \\{\\n([\\s\\S]*?)\\n\\t\\t\\};');
  const m = pbx.match(re);
  return m ? m[1] : '';
}

function buildConfigIds(id) {
  const block = blockFor(id);
  const list = (block.match(/buildConfigurationList = ([0-9A-F]{24})/) || [])[1];
  if (!list) return [];
  const listBlock = blockFor(list);
  return [...listBlock.matchAll(/([0-9A-F]{24}) \/\* (Debug|Release) \*\//g)]
    .map((m) => ({ id: m[1], name: m[2] }));
}

function settingIn(id, key) {
  const block = blockFor(id);
  const m = block.match(new RegExp('(?:^|\\n)[\\t ]*' + key + ' = ([^;\\n]+);'));
  return m ? m[1].trim().replace(/^"|"$/g, '') : null;
}

/* La app heredada debe seguir existiendo. */
const legacyId = targetId('RasmaticLugar3D');
check(!!legacyId, 'target heredado RasmaticLugar3D presente');
check(!!legacyId && buildConfigIds(legacyId).every((c) =>
  settingIn(c.id, 'PRODUCT_BUNDLE_IDENTIFIER') === 'com.rasmatic.lugar3d'),
  'la app heredada conserva com.rasmatic.lugar3d');

for (const f of ['AppDelegate.swift', 'GameViewController.swift', 'GamepadBridge.swift',
  'HeadTrackingBridge.swift', 'Assets.xcassets', 'www', 'Info.plist']) {
  check(exists(path.join(sharedDir, f)), 'fuente compartida presente: ' + f);
}

for (const v of VARIANTS) {
  console.log('\nTarget ' + v.target);
  const tid = targetId(v.target);
  check(!!tid, 'target ' + v.target + ' definido');
  if (!tid) continue;

  const block = blockFor(tid);
  check(/productType = "com\.apple\.product-type\.application";/.test(block),
    'producto tipo aplicación');
  check(new RegExp(v.target + '\\.app').test(pbx), 'producto ' + v.target + '.app');

  const configs = buildConfigIds(tid);
  check(configs.length === 2, 'Debug y Release configurados');
  for (const c of configs) {
    check(settingIn(c.id, 'PRODUCT_BUNDLE_IDENTIFIER') === v.bundle,
      c.name + ' bundle ' + v.bundle);
    check(settingIn(c.id, 'INFOPLIST_FILE') === v.dir + '/Info.plist',
      c.name + ' Info.plist propio');
  }
  if (v.headTracking) {
    check(configs.every((c) => /RASMATIC_HEAD_TRACKING/.test(
      settingIn(c.id, 'SWIFT_ACTIVE_COMPILATION_CONDITIONS') || '')),
      'compila con RASMATIC_HEAD_TRACKING');
  } else {
    check(configs.every((c) => !/RASMATIC_HEAD_TRACKING/.test(
      settingIn(c.id, 'SWIFT_ACTIVE_COMPILATION_CONDITIONS') || '')),
      'Classic NO compila con RASMATIC_HEAD_TRACKING');
  }

  const sourcesPhase = (block.match(/buildPhases = \(\n\t\t\t\t([0-9A-F]{24}) \/\* Sources \*\//) || [])[1];
  const sources = sourcesPhase ? blockFor(sourcesPhase) : '';
  check(/AppDelegate\.swift in Sources/.test(sources), 'AppDelegate en Sources');
  check(/GameViewController\.swift in Sources/.test(sources), 'GameViewController en Sources');
  check(/GamepadBridge\.swift in Sources/.test(sources), 'GamepadBridge en Sources');
  if (v.headTracking) {
    check(/HeadTrackingBridge\.swift in Sources/.test(sources), 'HeadTrackingBridge en Sources');
  } else {
    check(!/HeadTrackingBridge\.swift in Sources/.test(sources),
      'Classic NO compila HeadTrackingBridge');
  }

  const resPhase = (block.match(/buildPhases = \(\n[\s\S]*?([0-9A-F]{24}) \/\* Resources \*\//) || [])[1];
  const resources = resPhase ? blockFor(resPhase) : '';
  check(/Assets\.xcassets in Resources/.test(resources), 'Assets en Resources');
  check(/www in Resources/.test(resources), 'www en Resources');

  const appDir = path.join(ios, v.dir);
  const appWww = path.join(appDir, 'www');
  for (const f of ['Info.plist', 'Assets.xcassets', 'www']) {
    check(exists(path.join(appDir, f)), 'presente: ' + v.dir + '/' + f);
  }

  const schemePath = path.join(ios, 'RasmaticLugar3D.xcodeproj', 'xcshareddata', 'xcschemes', v.scheme + '.xcscheme');
  const scheme = exists(schemePath) ? read(schemePath) : '';
  check(!!scheme, 'esquema compartido ' + v.scheme);
  check(scheme.includes('BlueprintIdentifier = "' + tid + '"'), 'el esquema apunta al target');
  check(scheme.includes('BuildableName = "' + v.target + '.app"'), 'el esquema construye ' + v.target + '.app');

  /* ---------------- Info.plist ---------------- */
  console.log('Info.plist ' + v.dir);
  const plistPath = path.join(appDir, 'Info.plist');
  const plist = exists(plistPath) ? read(plistPath) : '';
  check(/^<\?xml/.test(plist) && /<\/plist>\s*$/.test(plist), 'XML completo');
  const val = (key) => {
    const m = plist.match(new RegExp('<key>' + key + '</key>\\s*<string>([^<]*)</string>'));
    return m ? m[1] : null;
  };
  for (const key of ['CFBundleDisplayName', 'CFBundleIdentifier', 'CFBundleExecutable',
    'CFBundleShortVersionString', 'CFBundleVersion', 'RASMATICAppVariant']) {
    check(val(key) !== null, key + ' = ' + val(key));
  }
  check(val('CFBundleDisplayName') === v.display, 'nombre visible ' + v.display);
  check(val('RASMATICAppVariant') === v.id, 'variante declarada ' + v.id);
  check(/<key>RASMATICHeadTracking<\/key>\s*<(true|false)\/>/.test(plist),
    'RASMATICHeadTracking declarado');
  check(new RegExp('<key>RASMATICHeadTracking<\\/key>\\s*<' + v.headTracking + '\\/>').test(plist),
    'RASMATICHeadTracking = ' + v.headTracking);
  check(/<key>UIStatusBarHidden<\/key>\s*<true\/>/.test(plist), 'barra de estado oculta');
  check(/<key>UIViewControllerBasedStatusBarAppearance<\/key>\s*<false\/>/.test(plist),
    'status bar no la maneja el VC');
  check(/<key>GCSupportsControllerUserInteraction<\/key>\s*<true\/>/.test(plist),
    'mandos soportados');
  check(/<key>UILaunchScreen<\/key>\s*<dict>/.test(plist), 'pantalla de arranque');
  check(/<key>LSRequiresIPhoneOS<\/key>\s*<true\/>/.test(plist), 'LSRequiresIPhoneOS');
  check(!/NSCameraUsageDescription/.test(plist), 'no pide cámara');

  const orientBlock = (plist.match(/<key>UISupportedInterfaceOrientations<\/key>\s*<array>([\s\S]*?)<\/array>/) || [])[1] || '';
  const valid = ['UIInterfaceOrientationPortrait', 'UIInterfaceOrientationPortraitUpsideDown',
    'UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight'];
  const declared = [...orientBlock.matchAll(/<string>([^<]+)<\/string>/g)].map((m) => m[1]);
  check(declared.length === 4 && declared.every((o) => valid.includes(o)),
    'las cuatro orientaciones');

  if (v.headTracking) {
    check(/<key>NSMotionUsageDescription<\/key>\s*<string>[^<]+<\/string>/.test(plist),
      'declara NSMotionUsageDescription');
  } else {
    check(!/NSMotionUsageDescription/.test(plist),
      'Classic NO declara permisos de movimiento');
  }

  /* ---------------- Assets ---------------- */
  console.log('Assets.xcassets ' + v.dir);
  const iconSet = path.join(appDir, 'Assets.xcassets', 'AppIcon.appiconset');
  const iconJsonPath = path.join(iconSet, 'Contents.json');
  check(exists(iconJsonPath), 'AppIcon.appiconset/Contents.json');
  function pngInfo(file) {
    const buf = fs.readFileSync(file);
    if (buf.length < 24 || buf.toString('ascii', 12, 16) !== 'IHDR') return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf[25] };
  }
  if (exists(iconJsonPath)) {
    let json = null;
    try { json = JSON.parse(read(iconJsonPath)); } catch (e) { bad('Contents.json inválido: ' + e.message); }
    if (json) {
      let allOk = true;
      for (const img of json.images) {
        const file = path.join(iconSet, img.filename);
        if (!exists(file)) { bad('falta el icono ' + img.filename); allOk = false; continue; }
        const info = pngInfo(file);
        const expected = Math.round(parseFloat(img.size) * parseInt(img.scale, 10));
        if (!info || info.width !== expected || info.height !== expected) {
          bad(img.filename + ' mide ' + (info ? info.width + 'x' + info.height : '?') +
            ', se esperaba ' + expected);
          allOk = false;
        }
        if (info && info.colorType !== 2) {
          bad(img.filename + ' tiene canal alfa (la App Store lo rechaza)');
          allOk = false;
        }
      }
      if (allOk) ok('todos los iconos existen, miden lo declarado y no tienen alfa');
      check(json.images.some((i) => i.size === '1024x1024'), 'icono 1024 de App Store');
    }
  }
  check(exists(path.join(appDir, 'Assets.xcassets', 'Contents.json')), 'Assets.xcassets/Contents.json');
  check(exists(path.join(appDir, 'Assets.xcassets', 'LaunchBackground.colorset', 'Contents.json')),
    'color LaunchBackground');

  /* ---------------- web/ ---------------- */
  console.log(v.web + '/');
  const web = path.join(root, v.web);
  const index = read(path.join(web, 'index.html'));
  check(/src="mobile\/game\.js"/.test(index), 'carga mobile/game.js');
  check(!/(src|href)="[^"]*android\//.test(index), 'sin referencias a android/');
  check(/apple-mobile-web-app-capable/.test(index), 'metadatos de app iOS');
  check(/rel="manifest"/.test(index), 'enlace al manifest');
  check(/ios\/ios-bridge\.js/.test(index), 'puente iOS');
  check(/vr\/vr-preview\.js/.test(index), 'modo VR');
  check(/net\/vr-link\.js/.test(index), 'enlace con Windows');
  check(new RegExp("storagePrefix: '" + v.prefix.replace(/\./g, '\\.') + "'").test(index),
    'prefijo de almacenamiento ' + v.prefix);
  check(new RegExp('headTracking: ' + v.headTracking).test(index),
    'headTracking = ' + v.headTracking);

  if (v.headTracking) {
    check(/headtracking\/head-tracking\.js/.test(index), 'carga head-tracking.js');
    check(/headtracking\/head-tracking\.css/.test(index), 'carga head-tracking.css');
    check(exists(path.join(web, 'headtracking', 'head-tracking.js')), 'head-tracking.js presente');
    check(exists(path.join(web, 'headtracking', 'head-tracking.css')), 'head-tracking.css presente');
  } else {
    check(!/headtracking\//.test(index), 'no carga headtracking/');
    check(!/RasmaticHeadTracking|DeviceOrientationEvent|requestPermission/.test(index),
      'no referencia sensores ni permisos');
    check(!exists(path.join(web, 'headtracking')), 'no contiene headtracking/');
  }

  const localRefs = [...index.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((u) => !/^(https?:|data:|#)/.test(u))
    .filter((u) => !/['"+$ ]/.test(u));
  for (const ref of localRefs) {
    check(exists(path.join(web, ref)), 'recurso presente: ' + ref);
  }

  const manifest = JSON.parse(read(path.join(web, 'manifest.webmanifest')));
  check(manifest.display === 'standalone', 'manifest standalone');
  check(manifest.name.includes(v.id === 'headtracking' ? 'Head Tracking' : 'Classic'),
    'manifest con nombre propio');
  check(manifest.id === './?app=' + v.id, 'manifest id ' + manifest.id);
  check(Array.isArray(manifest.icons) && manifest.icons.length >= 3, 'manifest con iconos');
  for (const icon of manifest.icons) {
    check(exists(path.join(web, icon.src)), 'icono del manifest: ' + icon.src);
  }

  const sw = read(path.join(web, 'sw.js'));
  const cachePrefix = v.id === 'headtracking' ? 'rasmatic-ht-' : 'rasmatic-classic-';
  check(sw.includes("const CACHE = '" + cachePrefix), 'cache ' + cachePrefix);
  const precache = [...sw.matchAll(/"(\.\/[^"]*)"/g)].map((m) => m[1]);
  check(precache.length > 10, 'sw.js precachea ' + precache.length + ' recursos');
  let missingPre = 0;
  for (const rel of precache) {
    if (rel === './') continue;
    if (!exists(path.join(web, rel.replace(/^\.\//, '')))) {
      bad('sw.js precachea un archivo inexistente: ' + rel);
      missingPre++;
    }
  }
  if (!missingPre) ok('todos los recursos del precache existen');
  if (v.headTracking) check(sw.includes('./headtracking/head-tracking.js'),
    'precachea head tracking');
  else check(!sw.includes('headtracking/'), 'Classic no precachea head tracking');

  /* ---------------- espejo iOS ---------------- */
  console.log('Espejo ' + v.dir + '/www');
  function walk(dir, base, out) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const rel = path.join(base, name);
      if (fs.statSync(full).isDirectory()) walk(full, rel, out);
      else out.push(rel);
    }
    return out;
  }
  const webFiles = walk(web, '', []).sort();
  const iosFiles = exists(appWww) ? walk(appWww, '', []).sort() : [];
  check(webFiles.length === iosFiles.length,
    'mismo número de archivos (' + webFiles.length + ' vs ' + iosFiles.length + ')');
  let diffs = 0;
  for (const rel of webFiles) {
    const a = path.join(web, rel);
    const b = path.join(appWww, rel);
    if (!exists(b)) { bad('falta en el bundle: ' + rel); diffs++; continue; }
    if (!fs.readFileSync(a).equals(fs.readFileSync(b))) { bad('distinto: ' + rel); diffs++; }
  }
  if (!diffs) ok('todos los archivos son idénticos byte a byte');
}

/* ---------------- 2. Swift compartido ---------------- */
console.log('\nSwift compartido');
const appSwift = read(path.join(sharedDir, 'AppDelegate.swift'));
const gameSwift = read(path.join(sharedDir, 'GameViewController.swift'));
const bridgeSwift = read(path.join(sharedDir, 'GamepadBridge.swift'));
const headSwift = exists(path.join(sharedDir, 'HeadTrackingBridge.swift'))
  ? read(path.join(sharedDir, 'HeadTrackingBridge.swift')) : '';

check(/@main\s+final class AppDelegate: UIResponder, UIApplicationDelegate/.test(appSwift),
  'AppDelegate con @main');
check(/rootViewController = GameViewController\(\)/.test(appSwift),
  'arranca en GameViewController');
check(/import WebKit/.test(gameSwift), 'GameViewController importa WebKit');
check(/setURLSchemeHandler\(handler, forURLScheme: Self\.scheme\)/.test(gameSwift),
  'registra WKURLSchemeHandler');
const schemeConst = (gameSwift.match(/static let scheme = "([^"]+)"/) || [])[1];
const hostConst = (gameSwift.match(/static let host = "([^"]+)"/) || [])[1];
const startUrl = (gameSwift.match(/static let startURL = URL\(string: "([^"]+)"\)/) || [])[1];
check(!!schemeConst && !!hostConst && startUrl === schemeConst + '://' + hostConst + '/index.html',
  'URL de arranque coincide con el handler');
check(/RASMATICAppVariant/.test(gameSwift) && /RASMATICHeadTracking/.test(gameSwift),
  'lee la variante del Info.plist');
check(/#if RASMATIC_HEAD_TRACKING/.test(gameSwift), 'compilación condicional de Core Motion');
check(/HeadTrackingBridge\(webView: webView\)/.test(gameSwift), 'crea el puente de cabeza');
check(/headTracking\?\.start\(\)/.test(gameSwift) && /headTracking\?\.stop\(\)/.test(gameSwift),
  'arranca y detiene el puente con la pantalla');
check(/__RASMATIC_NATIVE__/.test(gameSwift) && /headTracking:/.test(gameSwift),
  'marcador nativo con variante y head tracking');
check(/RasmaticNativeHeadTracking/.test(gameSwift), 'define el receptor nativo para el JS');

if (headSwift) {
  check(/import CoreMotion/.test(headSwift), 'HeadTrackingBridge importa CoreMotion');
  check(/CMMotionManager/.test(headSwift), 'usa CMMotionManager');
  check(/startDeviceMotionUpdates\(using: frame, to: \.main\)/.test(headSwift) ||
    /startDeviceMotionUpdates/.test(headSwift), 'arranca deviceMotion');
  check(/attitude\.yaw/.test(headSwift) && /attitude\.pitch/.test(headSwift) &&
    /attitude\.roll/.test(headSwift), 'lee yaw, pitch y roll');
  check(/1\.0 \/ 60\.0/.test(headSwift), 'muestrea a 60 Hz');
  check(/RasmaticNativeHeadTracking\.raw/.test(headSwift), 'envía orientación al JS');
  check(/RasmaticNativeHeadTracking\.status/.test(headSwift), 'envía estado al JS');
  check(!/AVCapture|NSCameraUsageDescription/.test(headSwift), 'no usa la cámara');
  check(/isDeviceMotionAvailable/.test(headSwift), 'detecta dispositivos sin sensor');
} else {
  bad('falta HeadTrackingBridge.swift');
}

/* Mando nativo compartido. */
console.log('\nMando nativo (GameController)');
check(/import GameController/.test(bridgeSwift), 'importa GameController');
check(/GCControllerDidConnect/.test(bridgeSwift) && /GCControllerDidDisconnect/.test(bridgeSwift),
  'escucha conexión y desconexión');
check(/deadzone[^=]*= 0\.18/.test(bridgeSwift), 'zona muerta 0.18');
check(/triggerOn[^=]*= 0\.5/.test(bridgeSwift), 'gatillo a fondo 0.5');
check(/RasmaticNativeGamepad.*raw\(/.test(bridgeSwift), 'envía estado analógico');
check(/RasmaticNativeGamepad.*press\(/.test(bridgeSwift), 'envía botones');
check(/RasmaticNativeGamepad.*status\(/.test(bridgeSwift), 'envía conexión');

/* ---------------- 3. Compilación e instalación ---------------- */
console.log('\nCompilación (dos .ipa sin firmar)');
const workflowPath = path.join(root, '.github', 'workflows', 'ios-ipa.yml');
check(exists(workflowPath), 'flujo de GitHub Actions');
const wf = exists(workflowPath) ? read(workflowPath) : '';
check(/runs-on: macos-/.test(wf), 'runner macOS');
check(/tools\/check-xcode\.js/.test(wf), 'comprueba la estructura');
check(/tools\/check-parity\.js/.test(wf), 'comprueba la paridad');
check(/tools\/build-ipa\.sh/.test(wf), 'usa build-ipa.sh');
check(/tools\/verify-ipa\.js/.test(wf), 'verifica los .ipa');
check(/rasmatic-v19-ipas/.test(wf), 'artefacto con las dos apps');
check(/HeadTracking-unsigned\.ipa/.test(wf) && /Classic-unsigned\.ipa/.test(wf),
  'sube los dos .ipa');
check(/--variant headtracking/.test(wf) && /--variant classic/.test(wf),
  'verifica cada variante por separado');

const verifier = path.join(root, 'tools', 'verify-ipa.js');
check(exists(verifier), 'existe tools/verify-ipa.js');
const verifierText = exists(verifier) ? read(verifier) : '';
check(/Mach-O/.test(verifierText) && /CFBundleIdentifier/.test(verifierText),
  'verify-ipa comprueba Mach-O y bundle id');
check(/NSMotionUsageDescription/.test(verifierText) && /--variant/.test(verifierText),
  'verify-ipa comprueba permisos por variante');

const publisher = path.join(root, 'tools', 'publish-github.js');
const publisherText = exists(publisher) ? read(publisher) : '';
check(/require\('\.\/verify-ipa'\)/.test(publisherText), 'publish-github usa el verificador');
check(/rasmatic-v19-ipas/.test(publisherText), 'publish-github descarga el artefacto V19');
check(/com\.rasmatic\.lugar3d\.headtracking/.test(publisherText) &&
  /com\.rasmatic\.lugar3d\.classic/.test(publisherText),
  'publish-github espera los dos bundle ids');

const ipaScript = path.join(root, 'tools', 'build-ipa.sh');
const ipaText = exists(ipaScript) ? read(ipaScript) : '';
check(!!ipaText, 'existe tools/build-ipa.sh');
check(/set -euo pipefail/.test(ipaText), 'aborta ante cualquier error');
check(/CODE_SIGNING_ALLOWED=NO/.test(ipaText), 'compila sin firma');
check(ipaText.indexOf('\r\n') === -1, 'saltos LF (macOS rechaza CRLF)');
check(/RasmaticHeadTracking/.test(ipaText) && /RasmaticClassic/.test(ipaText),
  'compila los dos esquemas');
check(/com\.rasmatic\.lugar3d\.headtracking/.test(ipaText) &&
  /com\.rasmatic\.lugar3d\.classic/.test(ipaText), 'verifica los dos bundle ids');
check(/www\/headtracking\/head-tracking\.js/.test(ipaText),
  'Head Tracking lleva su módulo dentro de la .app');
check(/Classic incluye archivos de head tracking/.test(ipaText),
  'Classic comprueba que NO lleva head tracking');
check(exists(path.join(root, 'docs', 'v19-dos-apps.md')), 'documentación V19');
check(exists(path.join(root, 'docs', 'instalar-en-iphone.md')), 'guía de instalación');

/* ---------------- Resumen ---------------- */
console.log('');
if (errors) {
  console.log('FALLARON ' + errors + ' comprobaciones de ' + checks + '.');
  process.exit(1);
}
console.log('OK: ' + checks + ' comprobaciones superadas.');
