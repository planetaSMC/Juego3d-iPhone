/*
 * Verifica la estructura del proyecto iOS sin necesidad de macOS/Xcode.
 *
 * Comprueba:
 *  - project.pbxproj: sintaxis balanceada, IDs existentes, archivos presentes
 *  - Info.plist: XML valido y claves obligatorias
 *  - Assets.xcassets: cada icono declarado existe, mide lo que dice y el 1024
 *    no tiene canal alfa (requisito de la App Store)
 *  - www/: espejo byte a byte de web/ y todos los recursos del index.html
 *    existen; manifest y precache del service worker apuntan a archivos reales
 *  - scheme: referencia al target correcto
 *  - Swift: el esquema/host de la URL de arranque coincide con el handler
 *  - mando nativo: GamepadBridge.swift, alta en pbxproj, GameController,
 *    zona muerta/gatillo, mapeo de botones y marcador __RASMATIC_NATIVE__
 *  - compilacion: flujo de GitHub Actions, build-ipa.sh, verify-ipa.js
 *
 * Uso: node tools/check-xcode.js
 * Sale con codigo 1 si algo falla.
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
check(pbx && balanced(pbx), 'llaves y parentesis balanceados');

const ids = new Set();
for (const m of pbx.matchAll(/^\t\t([0-9A-F]{24})(?: \/\*[^\n]*\*\/)? = \{/gm)) ids.add(m[1]);
check(ids.size >= 15, 'objetos definidos: ' + ids.size);

const refs = new Set();
for (const m of pbx.matchAll(/\b([0-9A-F]{24})\b/g)) refs.add(m[1]);
const missing = [...refs].filter((id) => !ids.has(id));
check(missing.length === 0, 'todas las referencias apuntan a objetos existentes' +
  (missing.length ? ' (faltan: ' + missing.join(', ') + ')' : ''));

const rootMatch = pbx.match(/rootObject = ([0-9A-F]{24})/);
check(!!rootMatch && ids.has(rootMatch[1]), 'rootObject valido');

check(/productType = "com\.apple\.product-type\.application";/.test(pbx), 'tipo de producto: aplicacion');

const files = [
  'AppDelegate.swift',
  'GameViewController.swift',
  'GamepadBridge.swift',
  'Assets.xcassets',
  'www',
  'Info.plist'
];
for (const f of files) {
  check(exists(path.join(appDir, f)), 'referenciado y presente: RasmaticLugar3D/' + f);
}
check(/lastKnownFileType = folder; path = www;/.test(pbx), 'www es folder reference (se copia entero)');
check(/WebKit\.framework/.test(pbx), 'WebKit.framework enlazado');
check(/IPHONEOS_DEPLOYMENT_TARGET = 15\.0;/.test(pbx), 'deployment target 15.0');
check(/TARGETED_DEVICE_FAMILY = "1,2";/.test(pbx), 'iPhone + iPad');
check(/INFOPLIST_FILE = RasmaticLugar3D\/Info\.plist;/.test(pbx), 'INFOPLIST_FILE configurado');

/* ---------------- 2. Scheme ---------------- */
console.log('Scheme');
const schemePath = path.join(ios, 'RasmaticLugar3D.xcodeproj', 'xcshareddata', 'xcschemes', 'RasmaticLugar3D.xcscheme');
const scheme = exists(schemePath) ? read(schemePath) : '';
check(!!scheme, 'esquema compartido presente');
const targetId = (pbx.match(/\t\t([0-9A-F]{24}) \/\* RasmaticLugar3D \*\/ = \{\n\t\t\tisa = PBXNativeTarget/) || [])[1];
check(!!targetId, 'id del target localizado');
check(!!targetId && scheme.includes('BlueprintIdentifier = "' + targetId + '"'), 'el esquema apunta al target');

/* ---------------- 3. Info.plist ---------------- */
console.log('Info.plist');
const plistPath = path.join(appDir, 'Info.plist');
const plist = exists(plistPath) ? read(plistPath) : '';
check(/^<\?xml/.test(plist) && /<\/plist>\s*$/.test(plist), 'XML completo');

function plistValue(key) {
  const re = new RegExp('<key>' + key + '</key>\\s*<string>([^<]*)</string>');
  const m = plist.match(re);
  return m ? m[1] : null;
}
const requiredStrings = [
  'CFBundleDisplayName',
  'CFBundleIdentifier',
  'CFBundleExecutable',
  'CFBundleShortVersionString',
  'CFBundleVersion'
];
for (const k of requiredStrings) {
  check(plistValue(k) !== null, k + ' = ' + plistValue(k));
}
check(/<key>UIStatusBarHidden<\/key>\s*<true\/>/.test(plist), 'barra de estado oculta');
check(/<key>UIViewControllerBasedStatusBarAppearance<\/key>\s*<false\/>/.test(plist), 'status bar no la maneja el VC');
check(/<key>GCSupportsControllerUserInteraction<\/key>\s*<true\/>/.test(plist), 'mandos soportados (Gamepad API)');
check(/<key>UILaunchScreen<\/key>\s*<dict>/.test(plist), 'pantalla de arranque declarada');
check(/<key>LSRequiresIPhoneOS<\/key>\s*<true\/>/.test(plist), 'LSRequiresIPhoneOS');

const orientBlock = (plist.match(/<key>UISupportedInterfaceOrientations<\/key>\s*<array>([\s\S]*?)<\/array>/) || [])[1] || '';
const validOrientations = [
  'UIInterfaceOrientationPortrait',
  'UIInterfaceOrientationPortraitUpsideDown',
  'UIInterfaceOrientationLandscapeLeft',
  'UIInterfaceOrientationLandscapeRight'
];
const declared = [...orientBlock.matchAll(/<string>([^<]+)<\/string>/g)].map((m) => m[1]);
check(declared.length === 4 && declared.every((o) => validOrientations.includes(o)),
  'orientaciones: ' + declared.join(', '));

/* ---------------- 4. Assets ---------------- */
console.log('Assets.xcassets');
const iconSet = path.join(appDir, 'Assets.xcassets', 'AppIcon.appiconset');
const iconJsonPath = path.join(iconSet, 'Contents.json');
check(exists(iconJsonPath), 'AppIcon.appiconset/Contents.json');

function pngInfo(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 24 || buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    bitDepth: buf[24],
    colorType: buf[25]   // 2 = truecolor, 6 = truecolor+alpha
  };
}

if (exists(iconJsonPath)) {
  let iconJson = null;
  try { iconJson = JSON.parse(read(iconJsonPath)); } catch (e) { bad('Contents.json no es JSON valido: ' + e.message); }
  if (iconJson) {
    ok('Contents.json parseable (' + iconJson.images.length + ' imagenes)');
    let allOk = true;
    for (const img of iconJson.images) {
      const file = path.join(iconSet, img.filename);
      if (!exists(file)) { bad('falta el icono ' + img.filename); allOk = false; continue; }
      const info = pngInfo(file);
      const point = parseFloat(img.size);
      const scale = parseInt(img.scale, 10);
      const expected = Math.round(point * scale);
      if (!info || info.width !== expected || info.height !== expected) {
        bad(img.filename + ' mide ' + (info ? info.width + 'x' + info.height : '?') + ', se esperaba ' + expected);
        allOk = false;
      }
      if (info && info.colorType !== 2) {
        bad(img.filename + ' tiene canal alfa (colorType ' + info.colorType + '), la App Store lo rechaza');
        allOk = false;
      }
    }
    if (allOk) ok('todos los iconos existen, miden lo declarado y no tienen alfa');

    const marketing = iconJson.images.find((i) => i.size === '1024x1024');
    check(!!marketing && exists(path.join(iconSet, marketing.filename)), 'icono 1024 de App Store');
  }
}

const assetsJson = path.join(appDir, 'Assets.xcassets', 'Contents.json');
check(exists(assetsJson) && !!JSON.parse(read(assetsJson)).info, 'Assets.xcassets/Contents.json valido');
const launchColor = path.join(appDir, 'Assets.xcassets', 'LaunchBackground.colorset', 'Contents.json');
check(exists(launchColor), 'color LaunchBackground (fondo de arranque)');

/* ---------------- 5. Swift ---------------- */
console.log('Swift');
const appSwift = read(path.join(appDir, 'AppDelegate.swift'));
const gameSwift = read(path.join(appDir, 'GameViewController.swift'));

check(/@main\s+final class AppDelegate: UIResponder, UIApplicationDelegate/.test(appSwift), 'AppDelegate con @main');
check(/rootViewController = GameViewController\(\)/.test(appSwift), 'arranca en GameViewController');

check(/import WebKit/.test(gameSwift), 'GameViewController importa WebKit');
check(/setURLSchemeHandler\(handler, forURLScheme: Self\.scheme\)/.test(gameSwift), 'registra WKURLSchemeHandler');
const schemeConst = (gameSwift.match(/static let scheme = "([^"]+)"/) || [])[1];
const hostConst = (gameSwift.match(/static let host = "([^"]+)"/) || [])[1];
const startUrl = (gameSwift.match(/static let startURL = URL\(string: "([^"]+)"\)/) || [])[1];
check(!!schemeConst && !!hostConst && startUrl === schemeConst + '://' + hostConst + '/index.html',
  'URL de arranque coincide con el handler: ' + startUrl);
check(/bundleRoot\(\)/.test(gameSwift), 'sirve los archivos del bundle');
check(!/loadFileURL/.test(gameSwift), 'no usa file:// (evita bloqueos de fuentes/CORS)');
check(/Content-Type/.test(gameSwift) && /woff2/.test(gameSwift), 'MIME de fuentes woff2');
check(/\.\.\//.test(gameSwift) === false || /hasPrefix\(root\.path/.test(gameSwift), 'limita el acceso a www/');

function swiftBalanced(src) {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inString) {
      if (c === '\\') { i++; continue; }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '{') depth++;
    else if (c === '}') depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}
check(swiftBalanced(appSwift), 'AppDelegate.swift con llaves balanceadas');
check(swiftBalanced(gameSwift), 'GameViewController.swift con llaves balanceadas');

/* ---------------- 5b. Mando nativo (GameController) ---------------- */
console.log('Mando nativo (GameController)');
const bridgePath = path.join(appDir, 'GamepadBridge.swift');
const bridgeSwift = exists(bridgePath) ? read(bridgePath) : '';
check(!!bridgeSwift, 'GamepadBridge.swift presente');
check(/GamepadBridge\.swift in Sources/.test(pbx) &&
  /1A000000000000000000001C/.test(pbx) &&
  /1A000000000000000000001D/.test(pbx),
  'GamepadBridge.swift dado de alta en project.pbxproj');
check(/1A000000000000000000001D \/\* GamepadBridge\.swift in Sources \*\/,/.test(pbx),
  'GamepadBridge.swift incluido en la fase Sources');

if (bridgeSwift) {
  check(/import GameController/.test(bridgeSwift), 'importa GameController');
  check(/GCControllerDidConnect/.test(bridgeSwift) && /GCControllerDidDisconnect/.test(bridgeSwift),
    'escucha conexion y desconexion de mandos');
  check(/Timer\(timeInterval: 1\.0 \/ 60\.0/.test(bridgeSwift) || /Timer\(timeInterval: 1\.0\/60\.0/.test(bridgeSwift),
    'sondeo a 60 Hz');
  check(/deadzone[^=]*= 0\.18/.test(bridgeSwift), 'zona muerta 0.18 (igual que Android)');
  check(/triggerOn[^=]*= 0\.5/.test(bridgeSwift), 'gatillo a fondo 0.5 (igual que Android)');
  check(/RasmaticNativeGamepad.*raw\(/.test(bridgeSwift), 'envia el estado analogico a RasmaticNativeGamepad.raw');
  check(/RasmaticNativeGamepad.*press\(/.test(bridgeSwift), 'envia botones a RasmaticNativeGamepad.press');
  check(/RasmaticNativeGamepad.*status\(/.test(bridgeSwift), 'envia conexion a RasmaticNativeGamepad.status');
  check(/vendorName/.test(bridgeSwift), 'usa el nombre real del mando');
  check(/leftShoulder/.test(bridgeSwift) && /leftTrigger/.test(bridgeSwift),
    'L1 mantenido y L2 a fondo para correr');
  check(/dpad\./.test(bridgeSwift), 'cruceta sumada al stick izquierdo');
  check(/buttonA/.test(bridgeSwift) && /buttonB/.test(bridgeSwift) &&
    /buttonX/.test(bridgeSwift) && /buttonY/.test(bridgeSwift) &&
    /buttonMenu/.test(bridgeSwift) && /buttonOptions/.test(bridgeSwift),
    'botones A/B/X/Y/Menu/Options mapeados');
  check(swiftBalanced(bridgeSwift), 'GamepadBridge.swift con llaves balanceadas');
}

check(/WKUserScript\(source: native, injectionTime: \.atDocumentStart/.test(gameSwift),
  'inyecta el marcador nativo antes de cargar la pagina');
check(/__RASMATIC_NATIVE__/.test(gameSwift) && /gamepad: true/.test(gameSwift),
  'marcador __RASMATIC_NATIVE__ con gamepad');
check(/GamepadBridge\(webView: webView\)/.test(gameSwift), 'crea el puente con el WKWebView');
check(/gamepad\?\.start\(\)/.test(gameSwift) && /gamepad\?\.stop\(\)/.test(gameSwift),
  'arranca y detiene el puente con la pantalla');
check(/gamepad\?\.webViewDidLoad\(\)/.test(gameSwift), 'reenvia el estado al terminar de cargar');

/* ---------------- 6. web/ ---------------- */
console.log('web/');
const indexHtml = read(path.join(web, 'index.html'));
check(/src="mobile\/game\.js"/.test(indexHtml), 'index.html carga mobile/game.js');
check(!/(src|href)="[^"]*android\//.test(indexHtml), 'sin referencias a android/');
check(/apple-mobile-web-app-capable/.test(indexHtml), 'metadatos de app iOS');
check(/rel="manifest"/.test(indexHtml), 'enlace al manifest');
check(/ios\/ios-bridge\.js/.test(indexHtml), 'puente iOS incluido');
check(/vr\/vr-preview\.js/.test(indexHtml), 'modo VR BOX incluido');
check(/vr\/vr-preview\.css/.test(indexHtml), 'estilos del modo VR incluidos');
check(/net\/vr-link\.js/.test(indexHtml), 'enlace con el calibrador de Windows incluido');
check(/net\/vr-link\.css/.test(indexHtml), 'estilos del enlace con Windows incluidos');
check(indexHtml.indexOf('vr/vr-preview.js') > 0 &&
  indexHtml.indexOf('net/vr-link.js') > indexHtml.indexOf('vr/vr-preview.js'),
  'orden de scripts: modo VR antes del enlace con Windows');
check(indexHtml.indexOf('ios/ios-bridge.js') > 0 &&
  indexHtml.indexOf('vr/vr-preview.js') > indexHtml.indexOf('ios/ios-bridge.js'),
  'orden de scripts: puente iOS antes del modo VR');

const localRefs = [...indexHtml.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((u) => !/^(https?:|data:|#)/.test(u))
  // El HTML tambien tiene atributos construidos en JavaScript
  // (src="'+IMG[k]+'"), que no son rutas de archivo.
  .filter((u) => !/['"+$ ]/.test(u));
for (const ref of localRefs) {
  check(exists(path.join(web, ref)), 'recurso presente: ' + ref);
}

const manifest = JSON.parse(read(path.join(web, 'manifest.webmanifest')));
check(manifest.display === 'standalone', 'manifest display standalone');
check(Array.isArray(manifest.icons) && manifest.icons.length >= 3, 'manifest con iconos');
for (const icon of manifest.icons) {
  check(exists(path.join(web, icon.src)), 'icono del manifest: ' + icon.src);
}

const sw = read(path.join(web, 'sw.js'));
const precache = [...sw.matchAll(/"(\.\/[^"]*)"/g)].map((m) => m[1]);
check(precache.length > 10, 'sw.js precachea ' + precache.length + ' recursos');
let missingPre = 0;
for (const rel of precache) {
  if (rel === './') continue;
  if (!exists(path.join(web, rel.replace(/^\.\//, '')))) { bad('sw.js precachea un archivo inexistente: ' + rel); missingPre++; }
}
if (!missingPre) ok('todos los recursos del precache existen');

/* ---------------- 7. Espejo iOS ---------------- */
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
check(webFiles.length === iosFiles.length, 'mismo numero de archivos (' + webFiles.length + ' vs ' + iosFiles.length + ')');
let diffs = 0;
for (const rel of webFiles) {
  const a = path.join(web, rel);
  const b = path.join(iosWww, rel);
  if (!exists(b)) { bad('falta en el bundle: ' + rel); diffs++; continue; }
  if (!fs.readFileSync(a).equals(fs.readFileSync(b))) { bad('distinto: ' + rel); diffs++; }
}
if (!diffs) ok('todos los archivos son identicos byte a byte');

/* ---------------- 8. Compilacion e instalacion ---------------- */
console.log('Compilacion (ipa sin firmar)');
const workflow = path.join(root, '.github', 'workflows', 'ios-ipa.yml');
check(exists(workflow), 'flujo de GitHub Actions: .github/workflows/ios-ipa.yml');
const wf = exists(workflow) ? read(workflow) : '';
check(/runs-on: macos-/.test(wf), 'compila en un runner macOS de la nube');
check(/tools\/check-xcode\.js/.test(wf), 'el flujo comprueba el proyecto antes de compilar');
check(/tools\/build-ipa\.sh/.test(wf), 'el flujo usa tools/build-ipa.sh');
check(/tools\/verify-ipa\.js/.test(wf), 'el flujo verifica la estructura del .ipa');
check(/upload-artifact/.test(wf) && /dist\/\*\.ipa/.test(wf), 'deja el .ipa como artefacto descargable');

const verifier = path.join(root, 'tools', 'verify-ipa.js');
check(exists(verifier), 'existe tools/verify-ipa.js');
const verifierText = exists(verifier) ? read(verifier) : '';
check(/Mach-O/.test(verifierText) && /CFBundleIdentifier/.test(verifierText) &&
  /www\/vr\/vr-preview\.js/.test(verifierText),
  'verify-ipa comprueba Mach-O, bundle id y el juego completo');

const publisher = path.join(root, 'tools', 'publish-github.js');
const publisherText = exists(publisher) ? read(publisher) : '';
check(/require\('\.\/verify-ipa'\)/.test(publisherText), 'publish-github usa el mismo verificador');

const ipaScript = path.join(root, 'tools', 'build-ipa.sh');
const ipaText = exists(ipaScript) ? read(ipaScript) : '';
check(!!ipaText, 'existe tools/build-ipa.sh');
check(/set -euo pipefail/.test(ipaText), 'build-ipa.sh aborta ante cualquier error');
check(/CODE_SIGNING_ALLOWED=NO/.test(ipaText), 'compila sin firma (la pone quien instala)');
check(ipaText.indexOf('\r\n') === -1, 'build-ipa.sh con saltos LF (macOS rechaza CRLF)');
check(/www\/index\.html/.test(ipaText), 'verifica que el juego viaje dentro de la .app');
check(exists(path.join(root, 'docs', 'instalar-en-iphone.md')), 'guia de instalacion: docs/instalar-en-iphone.md');

/* ---------------- Resumen ---------------- */
console.log('');
if (errors) {
  console.log('FALLARON ' + errors + ' comprobaciones de ' + checks + '.');
  process.exit(1);
}
console.log('OK: ' + checks + ' comprobaciones superadas.');
