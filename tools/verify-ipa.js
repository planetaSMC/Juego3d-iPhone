/*
 * Verifica un .ipa sin necesidad de macOS ni de firmarlo.
 *
 *   node tools/verify-ipa.js dist/RASMATIC-VR-unsigned.ipa --expect com.rasmatic.lugar3d --variant v20
 *
 * Comprueba la estructura real del ZIP (no el nombre del archivo):
 *   - un unico Payload/*.app
 *   - Info.plist con el bundle id esperado
 *   - ejecutable Mach-O (o binario universal) en la raiz de la .app
 *   - el juego completo dentro de www/ (index.html, JS, VR, iOS, three.js)
 *   - todos los recursos locales del index.html presentes
 *   - sin rutas android/ ni basura de macOS
 *
 * No valida la firma de Apple: un .ipa sin firmar es el resultado normal de
 * compilar con CODE_SIGNING_ALLOWED=NO. Si existe _CodeSignature solo se
 * informa, no se da por buena.
 *
 * Tambien se puede importar:
 *   const { verifyIpa } = require('./verify-ipa');
 *   const r = verifyIpa('dist/app.ipa');
 *
 * Sale con codigo 1 si algo falla.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
}

/* ---------------- lectura del ZIP (directorio central) ---------------- */
function readZip(buf) {
  let eocd = -1;
  const min = Math.max(0, buf.length - 66000);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP invalido: no se encontro el fin del directorio central');

  const total = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('ZIP invalido: cabecera central corrupta');
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    entries.set(name, { method, csize, localOff });
    off += 46 + nameLen + extraLen + commentLen;
  }

  return {
    names: [...entries.keys()],
    has(name) { return entries.has(name); },
    read(name) {
      const e = entries.get(name);
      if (!e) return null;
      const nameLen = buf.readUInt16LE(e.localOff + 26);
      const extraLen = buf.readUInt16LE(e.localOff + 28);
      const start = e.localOff + 30 + nameLen + extraLen;
      const data = buf.subarray(start, start + e.csize);
      if (e.method === 0) return data;
      if (e.method === 8) return zlib.inflateRawSync(data);
      throw new Error('compresion ZIP no soportada (' + e.method + ') en ' + name);
    }
  };
}

/* ---------------- Mach-O ---------------- */
const MACHO = new Set([
  0xFEEDFACE, // 32 bits, little endian
  0xFEEDFACF, // 64 bits, little endian
  0xCEFAEDFE, // 32 bits, big endian
  0xCFFAEDFE, // 64 bits, big endian
  0xCAFEBABE, // universal / fat
  0xBEBAFECA  // universal / fat (big endian)
]);

function machoKind(buf) {
  if (!buf || buf.length < 4) return null;
  const magic = buf.readUInt32BE(0);
  if (!MACHO.has(magic)) return null;
  if (magic === 0xCAFEBABE || magic === 0xBEBAFECA) return 'universal';
  return magic === 0xFEEDFACF || magic === 0xCFFAEDFE ? '64 bits' : '32 bits';
}

/* ---------------- Info.plist ---------------- */
function plistString(buf, key) {
  if (!buf) return null;
  const text = buf.toString('utf8');
  const xml = new RegExp('<key>' + key + '</key>\\s*<string>([^<]*)</string>').exec(text);
  if (xml) return xml[1];
  return null;
}

function bufferHas(buf, value) {
  if (!buf || !value) return false;
  return buf.indexOf(Buffer.from(value, 'utf8')) >= 0 ||
    buf.indexOf(Buffer.from(value, 'utf16le')) >= 0;
}

/* ---------------- verificacion ---------------- */
function verifyIpa(file, options) {
  const opts = options || {};
  const log = opts.log || console.log;
  const expected = opts.expect || 'com.rasmatic.lugar3d';
  const variant = opts.variant || null;
  const errors = [];
  const info = {};

  const pass = (msg) => log('  ok   ' + msg);
  const fail = (msg) => { errors.push(msg); log('  FAIL ' + msg); };
  const check = (cond, msg) => { if (cond) pass(msg); else fail(msg); return !!cond; };

  const abs = path.resolve(file);
  log('Verificando ' + abs);
  if (!check(fs.existsSync(abs), 'el archivo existe')) {
    return { ok: false, errors, info };
  }

  const buf = fs.readFileSync(abs);
  info.size = buf.length;
  info.sha256 = sha256(buf);
  check(buf.length > 100 * 1024, 'tamano razonable: ' + buf.length + ' B');

  let zip;
  try {
    zip = readZip(buf);
  } catch (e) {
    fail(e.message);
    return { ok: false, errors, info };
  }
  info.entries = zip.names.length;
  check(zip.names.length > 20, 'ZIP con ' + zip.names.length + ' entradas');

  const apps = [...new Set(zip.names
    .map((n) => /^Payload\/([^/]+\.app)\//.exec(n))
    .filter(Boolean)
    .map((m) => m[1]))];
  check(apps.length === 1, 'un unico Payload/*.app' + (apps.length ? ': ' + apps[0] : ''));
  if (apps.length !== 1) return { ok: false, errors, info };

  const app = apps[0];
  const prefix = 'Payload/' + app + '/';
  info.app = app;
  info.bundlePath = prefix;

  check(!zip.names.some((n) => n.startsWith('__MACOSX/') || n.endsWith('.DS_Store')),
    'sin basura de macOS');

  const infoName = prefix + 'Info.plist';
  const infoBuf = zip.read(infoName);
  check(!!infoBuf, 'Info.plist presente');
  if (infoBuf) {
    info.bundleId = plistString(infoBuf, 'CFBundleIdentifier');
    info.version = plistString(infoBuf, 'CFBundleShortVersionString');
    info.build = plistString(infoBuf, 'CFBundleVersion');
    info.displayName = plistString(infoBuf, 'CFBundleDisplayName');
    info.executable = plistString(infoBuf, 'CFBundleExecutable');
    check(bufferHas(infoBuf, expected),
      'bundle id esperado: ' + expected + (info.bundleId ? ' (' + info.bundleId + ')' : ''));
    if (info.bundleId && info.bundleId.indexOf('$(') >= 0) {
      fail('CFBundleIdentifier sin resolver (' + info.bundleId + '): el Info.plist no lo proceso Xcode');
    }
    if (info.version) pass('version ' + info.version + ' (' + (info.build || '?') + ')');

    /* V19: diferencias de permisos entre las dos apps. */
    const hasMotion = bufferHas(infoBuf, 'NSMotionUsageDescription');
    const hasCamera = bufferHas(infoBuf, 'NSCameraUsageDescription');
    if (variant === 'headtracking' || variant === 'v20') {
      check(hasMotion, 'RASMATIC VR declara NSMotionUsageDescription');
      check(!hasCamera, 'RASMATIC VR no pide cámara');
    } else if (variant === 'classic') {
      check(!hasMotion, 'Classic no declara permisos de movimiento');
      check(!hasCamera, 'Classic no pide cámara');
    }
  }

  /* Ejecutable: el declarado o el primer Mach-O en la raiz de la .app. */
  const rootFiles = zip.names
    .filter((n) => n.startsWith(prefix) && n.indexOf('/', prefix.length) < 0)
    .filter((n) => !n.endsWith('/'));
  let execName = info.executable && rootFiles.includes(prefix + info.executable)
    ? prefix + info.executable : null;
  if (!execName) {
    for (const n of rootFiles) {
      if (machoKind(zip.read(n))) { execName = n; break; }
    }
  }
  check(!!execName, 'ejecutable en la raiz de la .app' +
    (execName ? ': ' + execName.slice(prefix.length) : ''));
  if (execName) {
    const kind = machoKind(zip.read(execName));
    check(!!kind, 'el ejecutable es Mach-O' + (kind ? ' (' + kind + ')' : ''));
    info.executable = execName.slice(prefix.length);
    info.macho = kind;
  }

  const required = [
    'www/index.html',
    'www/three.min.js',
    'www/mobile/game.js',
    'www/mobile/android-bridge.js',
    'www/ios/ios-bridge.js',
    'www/ios/ios.css',
    'www/vr/vr-preview.js',
    'www/vr/vr-preview.css',
    'www/net/vr-link.js',
    'www/manifest.webmanifest'
  ];
  if (variant === 'headtracking') {
    required.push('www/headtracking/head-tracking.js',
      'www/headtracking/head-tracking.css');
  }
  if (variant === 'v20') {
    required.push('www/v20/pharmacy-scene.js', 'www/v20/pharmacy-core.js',
      'www/v20/pharmacy.css', 'www/headtracking/head-tracking.js',
      'www/headtracking/head-tracking.css');
  }
  let missing = 0;
  for (const rel of required) {
    if (!zip.has(prefix + rel)) { fail('falta ' + rel + ' dentro de la .app'); missing++; }
  }
  if (!missing) pass('juego completo dentro de www/ (' + required.length + ' archivos clave)');

  if (variant === 'classic') {
    const htFiles = zip.names.filter((n) => n.startsWith(prefix + 'www/headtracking/'));
    check(htFiles.length === 0, 'Classic no incluye archivos de head tracking');
  }
  if (variant === 'v20') {
    const classic = zip.names.filter((n) => n.startsWith(prefix + 'www/web-classic/'));
    check(classic.length === 0, 'V20 no incluye la app Classic separada');
  }
  if (variant) {
    const indexText = zip.has(prefix + 'www/index.html')
      ? zip.read(prefix + 'www/index.html').toString('utf8') : '';
    if (variant === 'headtracking') {
      check(/storagePrefix: 'rasmatic\.'/.test(indexText) &&
        /headTracking: true/.test(indexText),
        'index.html de Head Tracking con identidad y almacenamiento propios');
    } else if (variant === 'classic') {
      check(/storagePrefix: 'rasmatic\.classic\.'/.test(indexText) &&
        /headTracking: false/.test(indexText),
        'index.html de Classic con almacenamiento aislado');
    } else if (variant === 'v20') {
      check(/id: 'v20'/.test(indexText) && /headTracking: true/.test(indexText) &&
        /storagePrefix: 'rasmatic\.'/.test(indexText),
        'index.html de RASMATIC VR con identidad v20');
      check(/v20\/pharmacy-scene\.js/.test(indexText),
        'index.html carga la escena de farmacia V20');
    }
  }

  const indexBuf = zip.read(prefix + 'www/index.html');
  if (indexBuf) {
    const html = indexBuf.toString('utf8');
    check(!/(src|href)="[^"]*android\//.test(html), 'index.html sin rutas android/');
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((u) => !/^(https?:|data:|#|mailto:)/.test(u))
      .filter((u) => !/['"+$ ]/.test(u))
      .map((u) => u.replace(/^\.\//, '').split(/[?#]/)[0]);
    const unique = [...new Set(refs)];
    const notThere = unique.filter((rel) => !zip.has(prefix + 'www/' + rel));
    check(notThere.length === 0,
      'todos los recursos del index.html estan dentro' +
      (notThere.length ? ' (faltan: ' + notThere.slice(0, 6).join(', ') + ')' : ' (' + unique.length + ')'));
  }

  const signed = zip.names.some((n) => n === prefix + '_CodeSignature/CodeResources');
  info.signed = signed;
  log('  info firma: ' + (signed
    ? 'hay _CodeSignature (no validada por este script)'
    : 'sin firmar (normal al compilar con CODE_SIGNING_ALLOWED=NO)'));

  if (!info.bundleId) info.bundleId = '?';
  log('');
  log('  app: ' + app);
  log('  ejecutable: ' + (info.executable || '?') + ' (' + (info.macho || '?') + ')');
  log('  bundle: ' + (info.bundleId || '?') + '  version: ' + (info.version || '?'));
  log('  tamano: ' + (buf.length / 1048576).toFixed(2) + ' MB  entradas: ' + zip.names.length);
  log('  SHA-256: ' + info.sha256);
  log('');

  if (errors.length) {
    log('FALLARON ' + errors.length + ' comprobaciones.');
    return { ok: false, errors, info };
  }
  log('OK: el .ipa tiene la estructura correcta y el juego completo adentro.');
  return { ok: true, errors, info };
}

module.exports = { verifyIpa, readZip, sha256 };

if (require.main === module) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const i = args.indexOf('--expect');
  const expect = i >= 0 ? args[i + 1] : undefined;
  const vi = args.indexOf('--variant');
  const variant = vi >= 0 ? args[vi + 1] : undefined;
  if (!file) {
    console.error('Uso: node tools/verify-ipa.js <archivo.ipa> [--expect <bundle-id>] [--variant v20|headtracking|classic]');
    process.exit(2);
  }
  try {
    const result = verifyIpa(file, { expect, variant });
    process.exit(result.ok ? 0 : 1);
  } catch (e) {
    console.error('ERROR: ' + e.message);
    process.exit(1);
  }
}
