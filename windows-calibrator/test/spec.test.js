'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { loadSpec, buildSpec, validateCal, sanitizeCal, defaultsCal, extractObject } = require('../server/vr-spec');

const GAME_ROOT = path.resolve(__dirname, '..', '..', 'web');
const spec = loadSpec(GAME_ROOT);

test('la spec se extrae del juego real', () => {
  assert.ok(spec.keys.length >= 25);
  assert.ok(spec.groups.cam && spec.groups.stereo && spec.groups.screen);
  assert.strictEqual(spec.tabs.length, 7);
  assert.strictEqual(spec.version, 'vr-cal-2.0');
  assert.strictEqual(spec.defaults.ipd, 64);
  assert.strictEqual(spec.defaults.fov, 70);
  assert.deepStrictEqual(spec.spec.ipd, [50, 75, 1]);
});

test('los defaults de la app coinciden con el juego', () => {
  const d = defaultsCal(spec);
  assert.strictEqual(d.profile, 'window');
  assert.strictEqual(d.hudMode, 'per-eye');
  assert.strictEqual(d.customW, 1920);
  assert.strictEqual(d.customH, 1080);
  assert.strictEqual(d.testMode, false);
  assert.strictEqual(d.convergence, 3);
  assert.strictEqual(d.gap, 0.02);
});

test('validateCal acepta numeros reales dentro de rango', () => {
  const r = validateCal(spec, { ipd: 66, fov: 80, profile: 'vrbox-16-9', guides: true, customW: 1280 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.values.ipd, 66);
  assert.strictEqual(r.values.profile, 'vrbox-16-9');
  assert.strictEqual(r.values.guides, true);
  assert.strictEqual(r.values.customW, 1280);
});

test('validateCal rechaza valores fuera de rango', () => {
  assert.strictEqual(validateCal(spec, { ipd: 999 }).ok, false);
  assert.strictEqual(validateCal(spec, { ipd: 49 }).ok, false);
  assert.strictEqual(validateCal(spec, { fov: -1 }).ok, false);
});

test('validateCal rechaza NaN, Infinity y tipos falsos', () => {
  assert.strictEqual(validateCal(spec, { ipd: NaN }).ok, false);
  assert.strictEqual(validateCal(spec, { ipd: Infinity }).ok, false);
  assert.strictEqual(validateCal(spec, { ipd: '64' }).ok, false);
  assert.strictEqual(validateCal(spec, { guides: 'si' }).ok, false);
  assert.strictEqual(validateCal(spec, { profile: 'inventado' }).ok, false);
  assert.strictEqual(validateCal(spec, { customW: 500.5 }).ok, false);
});

test('validateCal rechaza claves desconocidas y peligrosas', () => {
  assert.strictEqual(validateCal(spec, { ipd: 64, inventado: 1 }).ok, false);
  assert.strictEqual(validateCal(spec, JSON.parse('{"__proto__":1}')).ok, false);
  assert.strictEqual(validateCal(spec, { constructor: 1 }).ok, false);
  assert.strictEqual(validateCal(spec, {}).ok, false);
  assert.strictEqual(validateCal(spec, null).ok, false);
  assert.strictEqual(validateCal(spec, []).ok, false);
});

test('validateCal limita la cantidad de claves', () => {
  const many = {};
  for (let i = 0; i < 70; i++) many['k' + i] = 1;
  assert.strictEqual(validateCal(spec, many).ok, false);
});

test('sanitizeCal recorta en vez de fallar (datos viejos)', () => {
  const s = sanitizeCal(spec, { ipd: 999, fov: NaN, profile: 'malo', guides: 1, customW: 5000 });
  assert.strictEqual(s.ipd, 75);
  assert.strictEqual(s.fov, undefined);
  assert.strictEqual(s.profile, undefined);
  assert.strictEqual(s.guides, undefined);
  assert.strictEqual(s.customW, 4096);
});

test('extractObject ignora llaves dentro de cadenas y comentarios', () => {
  const src = 'var X = { a: "}{", b: 1 /* } */, c: 2 };';
  assert.deepStrictEqual(extractObject(src, 'X'), { a: '}{', b: 1, c: 2 });
});

test('buildSpec falla si el juego no expone la spec', () => {
  assert.throws(() => buildSpec('var OTRAS = {};', 'falso.js'));
});

test('el archivo del juego existe y es la fuente de verdad', () => {
  assert.ok(fs.existsSync(path.join(GAME_ROOT, 'vr', 'vr-preview.js')));
});
