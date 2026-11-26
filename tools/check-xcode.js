/*
 * V20 · Verifica la app única RASMATIC VR sin macOS/Xcode.
 *
 * Comprueba:
 *  - un solo target RasmaticVR, bundle com.rasmatic.lugar3d
 *  - Head Tracking (Core Motion) compilado en el target
 *  - Info.plist, iconos, permisos, esquema
 *  - web/index.html + v20/pharmacy-scene.js + v20/pharmacy-core.js + game.js
 *  - manifest, sw.js, headtracking, VR y red
 *  - espejo ios/RasmaticLugar3D/www byte a byte
 *  - build-ipa.sh, workflow y verify-ipa para una sola app
 *
 * Uso: node tools/check-xcode.js
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const ios = path.join(root, 'ios');
const proj = path.join(ios, 'RasmaticLugar3D.xcodeproj', 'project.pbxproj');
const appDir = path.join(ios, 'RasmaticLugar3D');
const web = path.join(root, 'web');
const iosWww = path.join(appDir, 'www');

let errors = 0;
let checks = 0;
function ok(msg) { checks++; console.log('  ok   ' + msg); }
function bad(msg) { errors++; console.log('  FAIL ' + msg); }
function check(cond, msg) { if (cond) ok(msg); else bad(msg); }
function read(p) { return fs.readFileSync(p, 'utf8'); }
function exists(p) { return fs.existsSync(p); }

/* ---------------- 1. pbxproj ---------------- */
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
    else if (c === '}' || c === ')') { if (stack.pop() !== c) return false; }
  }
  return stack.length === 0 && !inString;
}
check(pbx && balanced(pbx), 'llaves y paréntesis balanceados');
const ids = new Set();
for (const m of pbx.matchAll(/^\t\t([0-9A-F]{24})(?: \/\*[^\n]*\*\/)? = \{/gm)) ids.add(m[1]);
check(ids.size >= 15, 'objetos definidos: ' + ids.size);
const refs = new Set();
for (const m of pbx.matchAll(/\b([0-9A-F]{24})\b/g)) refs.add(m[1]);
const missing = [...refs].filter((id) => !ids.has(id));
check(missing.length === 0, 'todas las referencias existen' + (missing.length ? ' (faltan ' + missing.join(', ') + ')' : ''));
check(/rootObject = ([0-9A-F]{24})/.test(pbx), 'rootObject definido');
check(/productType = "com\.apple\.product-type\.application";/.test(pbx), 'producto aplicación');

function blockFor(id) {
  const re = new RegExp('\\t\\t' + id + ' \\/\\*[^\\n]*\\*\\/ = \\{\\n([\\s\\S]*?)\\n\\t\\t\\};');
  const m = pbx.match(re);
  return m ? m[1] : '';
}
function settingIn(id, key) {
  const b = blockFor(id);
  const m = b.match(new RegExp('(?:^|\\n)[\\t ]*' + key + ' = ([^;\\n]+);'));
  return m ? m[1].trim().replace(/^"|"$/g, '') : null;
}
const targetId = (pbx.match(/\t\t([0-9A-F]{24}) \/\* RasmaticVR \*\/ = \{\n\t\t\tisa = PBXNativeTarget/) || [])[1];
check(!!targetId, 'target RasmaticVR único');
const targetCount = (pbx.match(/isa = PBXNativeTarget;/g) || []).length;
check(targetCount === 1, 'exactamente un target (' + targetCount + ')');
check(/RasmaticVR\.app/.test(pbx), 'producto RasmaticVR.app');
check(/PRODUCT_BUNDLE_IDENTIFIER = com\.rasmatic\.lugar3d;/.test(pbx), 'bundle com.rasmatic.lugar3d');
check(/INFOPLIST_FILE = RasmaticLugar3D\/Info\.plist;/.test(pbx), 'Info.plist de la app');
check(/SWIFT_ACTIVE_COMPILATION_CONDITIONS = "RASMATIC_HEAD_TRACKING \$\(inherited\)"/.test(pbx),
  'compila Head Tracking (RASMATIC_HEAD_TRACKING)');
const sourcesPhase = (blockFor(targetId).match(/buildPhases = \(\n\t\t\t\t([0-9A-F]{24}) \/\* Sources \*\//) || [])[1];
const sources = sourcesPhase ? blockFor(sourcesPhase) : '';
for (const f of ['AppDelegate.swift', 'GameViewController.swift', 'GamepadBridge.swift', 'HeadTrackingBridge.swift']) {
  check(sources.includes(f + ' in Sources'), f + ' en Sources');
}
check(/Assets\.xcassets in Resources/.test(pbx) && /www in Resources/.test(pbx), 'Assets y www en Resources');
check(/WebKit\.framework/.test(pbx), 'WebKit enlazado');
check(/IPHONEOS_DEPLOYMENT_TARGET = 15\.0;/.test(pbx), 'deployment target 15.0');
check(/TARGETED_DEVICE_FAMILY = "1,2";/.test(pbx), 'iPhone + iPad');

/* ---------------- 2. Scheme ---------------- */
console.log('Scheme');
const schemePath = path.join(ios, 'RasmaticLugar3D.xcodeproj', 'xcshareddata', 'xcschemes', 'RasmaticVR.xcscheme');
const scheme = exists(schemePath) ? read(schemePath) : '';
check(!!scheme, 'esquema RasmaticVR');
check(!!targetId && scheme.includes('BlueprintIdentifier = "' + targetId + '"'), 'el esquema apunta al target');
check(scheme.includes('BuildableName = "RasmaticVR.app"'), 'el esquema construye RasmaticVR.app');
check(!exists(path.join(ios, 'RasmaticLugar3D.xcodeproj', 'xcshareddata', 'xcschemes', 'RasmaticClassic.xcscheme')),
  'no queda el esquema Classic');
check(!exists(path.join(ios, 'RasmaticLugar3D.xcodeproj', 'xcshareddata', 'xcschemes', 'RasmaticHeadTracking.xcscheme')),
  'no queda el esquema Head Tracking separado');

/* ---------------- 3. Info.plist ---------------- */
console.log('Info.plist');
const plistPath = path.join(appDir, 'Info.plist');
const plist = exists(plistPath) ? read(plistPath) : '';
check(/^<\?xml/.test(plist) && /<\/plist>\s*$/.test(plist), 'XML completo');
function plistValue(key) {
  const m = plist.match(new RegExp('<key>' + key + '</key>\\s*<string>([^<]*)</string>'));
  return m ? m[1] : null;
}
for (const k of ['CFBundleDisplayName', 'CFBundleIdentifier', 'CFBundleExecutable',
  'CFBundleShortVersionString', 'CFBundleVersion', 'RASMATICAppVariant']) {
  check(plistValue(k) !== null, k + ' = ' + plistValue(k));
}
check(plistValue('CFBundleDisplayName') === 'RASMATIC VR', 'nombre visible RASMATIC VR');
check(plistValue('RASMATICAppVariant') === 'v20', 'variante v20');
check(/<key>RASMATICHeadTracking<\/key>\s*<true\/>/.test(plist), 'Head Tracking declarado');
check(/<key>NSMotionUsageDescription<\/key>\s*<string>[^<]+<\/string>/.test(plist), 'NSMotionUsageDescription');
check(!/NSCameraUsageDescription/.test(plist), 'no pide cámara');
check(/<key>UIStatusBarHidden<\/key>\s*<true\/>/.test(plist), 'barra de estado oculta');
check(/<key>GCSupportsControllerUserInteraction<\/key>\s*<true\/>/.test(plist), 'mandos soportados');
check(/<key>UILaunchScreen<\/key>\s*<dict>/.test(plist), 'pantalla de arranque');
const orientBlock = (plist.match(/<key>UISupportedInterfaceOrientations<\/key>\s*<array>([\s\S]*?)<\/array>/) || [])[1] || '';
const valid = ['UIInterfaceOrientationPortrait', 'UIInterfaceOrientationPortraitUpsideDown',
  'UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight'];
const declared = [...orientBlock.matchAll(/<string>([^<]+)<\/string>/g)].map((m) => m[1]);
check(declared.length === 4 && declared.every((o) => valid.includes(o)), 'las cuatro orientaciones');

/* ---------------- 4. Assets ---------------- */
console.log('Assets.xcassets');
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
      if (!exists(file)) { bad('falta ' + img.filename); allOk = false; continue; }
      const info = pngInfo(file);
      const expected = Math.round(parseFloat(img.size) * parseInt(img.scale, 10));
      if (!info || info.width !== expected || info.height !== expected) {
        bad(img.filename + ' mide ' + (info ? info.width + 'x' + info.height : '?') + ', esperado ' + expected);
        allOk = false;
      }
      if (info && info.colorType !== 2) {
        bad(img.filename + ' tiene canal alfa');
        allOk = false;
      }
    }
    if (allOk) ok('iconos exactos y sin alfa');
    check(json.images.some((i) => i.size === '1024x1024'), 'icono 1024 de App Store');
  }
}
check(exists(path.join(appDir, 'Assets.xcassets', 'Contents.json')), 'Assets.xcassets/Contents.json');
check(exists(path.join(appDir, 'Assets.xcassets', 'LaunchBackground.colorset', 'Contents.json')),
  'color LaunchBackground');

/* ---------------- 5. Swift ---------------- */
console.log('Swift');
const appSwift = read(path.join(appDir, 'AppDelegate.swift'));
const gameSwift = read(path.join(appDir, 'GameViewController.swift'));
const bridgeSwift = read(path.join(appDir, 'GamepadBridge.swift'));
const headSwift = exists(path.join(appDir, 'HeadTrackingBridge.swift')) ? read(path.join(appDir, 'HeadTrackingBridge.swift')) : '';
check(/@main\s+final class AppDelegate: UIResponder, UIApplicationDelegate/.test(appSwift), 'AppDelegate @main');
check(/rootViewController = GameViewController\(\)/.test(appSwift), 'arranca en GameViewController');
check(/import WebKit/.test(gameSwift), 'GameViewController importa WebKit');
check(/setURLSchemeHandler\(handler, forURLScheme: Self\.scheme\)/.test(gameSwift), 'WKURLSchemeHandler');
check(/RASMATICAppVariant/.test(gameSwift) && /RASMATICHeadTracking/.test(gameSwift), 'lee variante del plist');
check(/#if RASMATIC_HEAD_TRACKING/.test(gameSwift), 'compilación condicional de Core Motion');
check(/HeadTrackingBridge\(webView: webView\)/.test(gameSwift), 'crea el puente de cabeza');
check(/headTracking\?\.start\(\)/.test(gameSwift) && /headTracking\?\.stop\(\)/.test(gameSwift), 'arranca/detiene el puente');
check(/RasmaticNativeHeadTracking/.test(gameSwift), 'receptor nativo para el JS');
if (headSwift) {
  check(/import CoreMotion/.test(headSwift), 'HeadTrackingBridge importa CoreMotion');
  check(/CMMotionManager/.test(headSwift), 'CMMotionManager');
  check(/startDeviceMotionUpdates/.test(headSwift), 'deviceMotion');
  check(/attitude\.yaw/.test(headSwift) && /attitude\.pitch/.test(headSwift) && /attitude\.roll/.test(headSwift), 'yaw/pitch/roll');
  check(/1\.0 \/ 60\.0/.test(headSwift), '60 Hz');
  check(/RasmaticNativeHeadTracking\.raw/.test(headSwift) && /RasmaticNativeHeadTracking\.status/.test(headSwift), 'envía raw/status');
  check(/isDeviceMotionAvailable/.test(headSwift), 'detecta sensor ausente');
  check(/availableAttitudeReferenceFrames\(\)/.test(headSwift), 'consulta marcos de referencia disponibles');
  check(!/\.xArbitrary(?!Z|Corrected)/.test(headSwift), 'sin el valor inválido .xArbitrary');
  check(/\.xArbitraryZVertical/.test(headSwift) &&
    /\.xArbitraryCorrectedZVertical/.test(headSwift) &&
    /\.xMagneticNorthZVertical/.test(headSwift) &&
    /\.xTrueNorthZVertical/.test(headSwift), 'solo marcos de referencia reales');
  check(/referenceFrame|selectReferenceFrame/.test(headSwift) &&
    /Sin marco de referencia/.test(headSwift), 'maneja la ausencia de marco');
  check(!/AVCapture/.test(headSwift), 'no usa cámara');
} else bad('falta HeadTrackingBridge.swift');
check(/import GameController/.test(bridgeSwift), 'GameController');
check(/RasmaticNativeGamepad.*raw\(/.test(bridgeSwift), 'mando raw');
check(/RasmaticNativeGamepad.*press\(/.test(bridgeSwift), 'mando press');
check(/RasmaticNativeGamepad.*status\(/.test(bridgeSwift), 'mando status');
check(/deadzone[^=]*= 0\.18/.test(bridgeSwift), 'zona muerta 0.18');
check(/triggerOn[^=]*= 0\.5/.test(bridgeSwift), 'gatillo 0.5');

/* ---------------- 6. web/ ---------------- */
console.log('web/');
const index = read(path.join(web, 'index.html'));
check(/id: 'v20'/.test(index) && /headTracking: true/.test(index), 'identidad v20 con Head Tracking');
check(/storagePrefix: 'rasmatic\.'/.test(index), 'prefijo rasmatic.*');
check(/v20\/pharmacy-scene\.js/.test(index), 'carga pharmacy-scene.js');
check(/v20\/pharmacy-core\.js/.test(index), 'carga pharmacy-core.js');
check(/v21\/v21\.css/.test(index), 'carga v21.css');
check(/mobile\/game\.js/.test(index), 'carga game.js');
check(/headtracking\/head-tracking\.js/.test(index), 'carga head-tracking.js');
check(/vr\/vr-preview\.js/.test(index) && /net\/vr-link\.js/.test(index), 'carga VR y enlace Windows');
check(!/(src|href)="[^"]*android\//.test(index), 'sin rutas android/');
check(/manifest\.webmanifest/.test(index), 'enlace al manifest');

for (const rel of ['v20/pharmacy-scene.js', 'v20/pharmacy-core.js', 'v20/pharmacy.css', 'v21/v21.css',
  'three.min.js', 'mobile/game.js', 'headtracking/head-tracking.js']) {
  check(exists(path.join(web, rel)), 'existe web/' + rel);
}
const sceneJs = read(path.join(web, 'v20', 'pharmacy-scene.js'));
check(/RasmaticPharmacy/.test(sceneJs), 'expone RasmaticPharmacy');
check(/blocked\(x, z\)/.test(sceneJs), 'colisiones del HTML');
check(/RASMATIC BOT/.test(sceneJs) || /machine/.test(sceneJs), 'máquina RASMATIC BOT');
check(/shelfBoxes/.test(sceneJs) && !/mergeShelfBoxes/.test(sceneJs) &&
  /userData=\{\s*[\s\S]*?id:SB\.length/.test(sceneJs), 'cajas individuales');
check(/FARMACIA RASMATIC/.test(sceneJs) && !/FARMACIA 16 HORAS/.test(sceneJs),
  'cartel Farmacia RASMATIC sin 16 horas');
check(/conveyor\s*=\s*\{/.test(sceneJs) && /drugImage/.test(sceneJs),
  'cinta funcional y miniatura de medicamento');
const coreJs = read(path.join(web, 'v20', 'pharmacy-core.js'));
check(/window\.RasmaticCore/.test(coreJs), 'expone RasmaticCore');
check(/film/.test(coreJs) && /model/.test(coreJs) && /place/.test(coreJs), 'tres modos');
check(/RasmaticGame\.tick/.test(coreJs), 'llama a game.tick');
const gameJs = read(path.join(web, 'mobile', 'game.js'));
check(/RasmaticPharmacyApi/.test(gameJs), 'game.js usa la farmacia');
check(/COLOR_DRUGS/.test(gameJs), 'mapeo de medicamentos');
check(/machine\.api/.test(gameJs), 'adaptador CNC');
check(/rasmatic\.joystick/.test(gameJs), 'joystick opcional');
check(/v21-start-btn/.test(gameJs) && /startCountdown/.test(gameJs), 'menú y cuenta V21');
check(/placeOnBelt/.test(gameJs) && /updateBelt/.test(gameJs), 'cinta funcional V21');
check(/aim\.target/.test(gameJs) && /aim\.outline/.test(gameJs), 'mira y contorno V21');
check(/S\.queue/.test(gameJs) && /spawnClient/.test(gameJs), 'fila de clientes V21');
const vrJs = read(path.join(web, 'vr', 'vr-preview.js'));
check(/aimQuaternion/.test(vrJs), 'mira con Head Tracking en VR');
check(/rasmatic\.ht\.sensitivity/.test(read(path.join(web, 'headtracking', 'head-tracking.js'))), 'sensibilidad HT');

const manifest = JSON.parse(read(path.join(web, 'manifest.webmanifest')));
check(manifest.name === 'RASMATIC VR', 'manifest RASMATIC VR');
check(manifest.id === './?app=v20', 'manifest id v20');
check(Array.isArray(manifest.icons) && manifest.icons.length >= 3, 'manifest con iconos');
for (const icon of manifest.icons) check(exists(path.join(web, icon.src)), 'icono ' + icon.src);

const sw = read(path.join(web, 'sw.js'));
check(/const CACHE = 'rasmatic-v21-/.test(sw), 'cache rasmatic-v21-');
const precache = [...sw.matchAll(/"(\.\/[^"]*)"/g)].map((m) => m[1]);
check(precache.length > 10, 'precache ' + precache.length + ' recursos');
let missingPre = 0;
for (const rel of precache) {
  if (rel === './') continue;
  if (!exists(path.join(web, rel.replace(/^\.\//, '')))) { bad('precache inexistente: ' + rel); missingPre++; }
}
if (!missingPre) ok('precache completo');
check(precache.some((r) => r.includes('pharmacy-scene.js')), 'precache de la escena V20');

/* ---------------- 7. Espejo ---------------- */
console.log('Espejo ios/RasmaticLugar3D/www');
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
const iosFiles = exists(iosWww) ? walk(iosWww, '', []).sort() : [];
check(webFiles.length === iosFiles.length, 'mismo número de archivos (' + webFiles.length + ' vs ' + iosFiles.length + ')');
let diffs = 0;
for (const rel of webFiles) {
  const a = path.join(web, rel);
  const b = path.join(iosWww, rel);
  if (!exists(b)) { bad('falta en bundle: ' + rel); diffs++; continue; }
  if (!fs.readFileSync(a).equals(fs.readFileSync(b))) { bad('distinto: ' + rel); diffs++; }
}
if (!diffs) ok('espejo idéntico byte a byte');

/* ---------------- 8. Compilación ---------------- */
console.log('Compilación');
const wfPath = path.join(root, '.github', 'workflows', 'ios-ipa.yml');
check(exists(wfPath), 'workflow');
const wf = exists(wfPath) ? read(wfPath) : '';
check(/runs-on: macos-/.test(wf), 'runner macOS');
check(/check-xcode\.js/.test(wf), 'check-xcode en CI');
check(/build-ipa\.sh/.test(wf), 'build-ipa.sh en CI');
check(/verify-ipa\.js/.test(wf), 'verify-ipa en CI');
check(/rasmatic-v21-ipa/.test(wf), 'artefacto V21');
check(/RasmaticVR/.test(wf), 'esquema RasmaticVR');

const wfWinPath = path.join(root, '.github', 'workflows', 'windows-calibrator.yml');
const wfWin = exists(wfWinPath) ? read(wfWinPath) : '';
check(!!wfWin, 'workflow Windows');
check(/runs-on: windows-latest/.test(wfWin), 'runner Windows');
check(/npm ci/.test(wfWin) && /npm test/.test(wfWin), 'instala y prueba el calibrador');
check(/npm run dist/.test(wfWin), 'compila instalador NSIS');
check(/rasmatic-windows-calibrator/.test(wfWin), 'artefacto Windows');
const pkgWin = JSON.parse(read(path.join(root, 'windows-calibrator', 'package.json')));
check(pkgWin.build && pkgWin.build.appId === 'com.rasmatic.vrcalibrator', 'appId del calibrador');
check(pkgWin.scripts && /electron-builder --win nsis/.test(pkgWin.scripts.dist), 'script dist NSIS');
check(Array.isArray(pkgWin.build.win.target) &&
  pkgWin.build.win.target.some((t) => t.target === 'nsis'), 'target NSIS');

const ipaPath = path.join(root, 'tools', 'build-ipa.sh');
const ipa = exists(ipaPath) ? read(ipaPath) : '';
check(/set -euo pipefail/.test(ipa), 'build-ipa aborta ante error');
check(/CODE_SIGNING_ALLOWED=NO/.test(ipa), 'sin firma');
check(ipa.indexOf('\r\n') === -1, 'LF');
check(/RasmaticVR/.test(ipa), 'compila RasmaticVR');
check(/com\.rasmatic\.lugar3d/.test(ipa), 'bundle com.rasmatic.lugar3d');
check(/www\/v20\/pharmacy-scene\.js/.test(ipa), 'verifica la escena V20 dentro de la app');

const verifier = exists(path.join(root, 'tools', 'verify-ipa.js')) ? read(path.join(root, 'tools', 'verify-ipa.js')) : '';
check(/Mach-O/.test(verifier) && /CFBundleIdentifier/.test(verifier), 'verify-ipa Mach-O y bundle');
check(/pharmacy-scene\.js/.test(verifier), 'verify-ipa comprueba la escena V20');
check(/NSMotionUsageDescription/.test(verifier), 'verify-ipa comprueba sensores');

for (const doc of ['README.md', 'rea-architecture.md', 'rea-mechanics.md', 'rea-assets.md',
  'rea-game-modes.md', 'rea-integration-plan.md', 'windows-headtracking-config.md',
  'testing-report.md', 'limitations.md']) {
  check(exists(path.join(root, 'docs', 'v20', doc)), 'docs/v20/' + doc);
}
for (const doc of ['README.md', 'aim-and-queue.md', 'conveyor-delivery.md',
  'start-menu.md', 'testing-report.md', 'limitations.md']) {
  check(exists(path.join(root, 'docs', 'v21', doc)), 'docs/v21/' + doc);
}
check(exists(path.join(root, 'docs', 'instalar-en-iphone.md')), 'guía de instalación');

console.log('');
if (errors) {
  console.log('FALLARON ' + errors + ' comprobaciones de ' + checks + '.');
  process.exit(1);
}
console.log('OK: ' + checks + ' comprobaciones superadas.');
