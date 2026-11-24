'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const { tempDir, makeStore, cleanup, resetLimits } = require('./helpers');
const { Security, hashToken, safeEqualHex, TokenBucket } = require('../server/security');

function setup() {
  const dir = tempDir('rasmatic-sec-');
  const { spec, store } = makeStore(dir);
  const security = new Security({ store });
  return { dir, spec, store, security };
}

const DEVICE = { id: 'abcdef0123456789', name: 'iPhone de prueba', model: 'iPhone 15' };

test('el código de emparejamiento se usa una sola vez', async (t) => {
  const { dir, security, store } = setup();
  t.after(() => { security.close(); cleanup(dir); });

  const p = security.createPairing();
  assert.strictEqual(p.ok, true);
  assert.match(p.code, /^\d{6}$/);

  const r = security.redeemPairing(p.code, DEVICE, '192.168.1.50');
  assert.strictEqual(r.ok, true);
  assert.ok(typeof r.token === 'string' && r.token.length >= 40);
  assert.strictEqual(r.device.id, DEVICE.id);

  const again = security.redeemPairing(p.code, DEVICE, '192.168.1.50');
  assert.strictEqual(again.ok, false);
  assert.strictEqual(again.code, 'no_pairing');

  /* El token nunca se guarda en claro. */
  const saved = store.findDevice(DEVICE.id);
  assert.strictEqual(saved.tokenHash, hashToken(r.token));
  assert.notStrictEqual(saved.tokenHash, r.token);
  store.flush();
  const raw = fs.readFileSync(store.file, 'utf8');
  assert.ok(raw.indexOf(r.token) < 0, 'el token no debe aparecer en el archivo');
});

test('un código incorrecto no empareja y cuenta el intento', async (t) => {
  const { dir, security } = setup();
  t.after(() => { security.close(); cleanup(dir); });

  const p = security.createPairing();
  const bad = String((Number(p.code) + 1) % 1000000).padStart(6, '0');
  const r = security.redeemPairing(bad, DEVICE, '10.0.0.9');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'bad_code');
  assert.strictEqual(security.pairing.attempts, 1);

  const ok = security.redeemPairing(p.code, DEVICE, '10.0.0.9');
  assert.strictEqual(ok.ok, true);
});

test('el código vence y no se puede usar', async (t) => {
  const { dir, security } = setup();
  t.after(() => { security.close(); cleanup(dir); });

  const p = security.createPairing(1);
  await new Promise((r) => setTimeout(r, 12));
  const r = security.redeemPairing(p.code, DEVICE, '10.0.0.9');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'expired');
});

test('cinco códigos incorrectos invalidan el emparejamiento', async (t) => {
  const { dir, security } = setup();
  t.after(() => { security.close(); cleanup(dir); });

  const p = security.createPairing();
  let last = null;
  for (let i = 0; i < 5; i++) {
    last = security.redeemPairing('000000', DEVICE, '10.0.0.' + i);
  }
  assert.strictEqual(last.ok, false);
  assert.strictEqual(security.pairing.attempts, 5);
  const r = security.redeemPairing(p.code, DEVICE, '10.0.0.99');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'too_many');
  assert.strictEqual(security.pairing, null);
});

test('authorize valida token, revocación y desconocidos', async (t) => {
  const { dir, security } = setup();
  t.after(() => { security.close(); cleanup(dir); });

  const p = security.createPairing();
  const r = security.redeemPairing(p.code, DEVICE, '10.0.0.5');

  assert.strictEqual(security.authorize(DEVICE.id, r.token, '10.0.0.5').ok, true);
  assert.strictEqual(security.authorize(DEVICE.id, 'x'.repeat(43), '10.0.0.5').ok, false);
  assert.strictEqual(security.authorize('ffffffffffffffff', r.token, '10.0.0.6').ok, false);
  assert.strictEqual(security.authorize(DEVICE.id.toUpperCase(), r.token, '10.0.0.5').ok, true);

  security.revoke(DEVICE.id, '10.0.0.5');
  assert.strictEqual(security.authorize(DEVICE.id, r.token, '10.0.0.5').ok, false);
});

test('los intentos fallidos de autenticación terminan en ban temporal', async (t) => {
  const { dir, security } = setup();
  t.after(() => { security.close(); cleanup(dir); });

  let banned = false;
  for (let i = 0; i < 7; i++) {
    const r = security.authorize('ffffffffffffffff', 'x'.repeat(43), '10.1.1.1');
    if (r.code === 'banned') banned = true;
  }
  assert.strictEqual(banned, true);
  assert.ok(security.authFail.check('10.1.1.1') > 0);
});

test('el PIN de administración usa scrypt y se verifica', async (t) => {
  const { dir, security, store } = setup();
  t.after(() => { security.close(); cleanup(dir); });

  assert.strictEqual(security.hasPin(), false);
  assert.deepStrictEqual(await security.verifyPin('1234'), { ok: true, configured: false });

  assert.strictEqual((await security.setPin('', '123')).ok, false);
  assert.strictEqual((await security.setPin('', '1234')).ok, true);
  assert.strictEqual(security.hasPin(), true);
  assert.match(store.adminPinHash(), /^scrypt\$/);
  assert.ok(store.adminPinHash().indexOf('1234') < 0);

  assert.strictEqual((await security.verifyPin('9999')).ok, false);
  assert.strictEqual((await security.verifyPin('1234')).ok, true);

  assert.strictEqual((await security.setPin('0000', '5678')).ok, false);
  assert.strictEqual((await security.setPin('1234', '5678')).ok, true);
  assert.strictEqual((await security.verifyPin('5678')).ok, true);
});

test('clearPin exige el PIN actual', async (t) => {
  const { dir, security } = setup();
  t.after(() => { security.close(); cleanup(dir); });

  await security.setPin('', '4321');
  assert.strictEqual((await security.clearPin('0000')).ok, false);
  assert.strictEqual((await security.clearPin('4321')).ok, true);
  assert.strictEqual(security.hasPin(), false);
});

test('createPairing se bloquea en Modo Expo', async (t) => {
  const { dir, security, store } = setup();
  t.after(() => { security.close(); cleanup(dir); });

  store.setFlag('expo', true);
  const r = security.createPairing();
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'expo');
});

test('TokenBucket limita ráfagas y recarga', () => {
  const b = new TokenBucket(100, 2);
  assert.strictEqual(b.take('x'), true);
  assert.strictEqual(b.take('x'), true);
  assert.strictEqual(b.take('x'), false);
});

test('safeEqualHex compara sin romperse con entradas raras', () => {
  assert.strictEqual(safeEqualHex('aa', 'aa'), true);
  assert.strictEqual(safeEqualHex('aa', 'ab'), false);
  assert.strictEqual(safeEqualHex('aa', 'aaaa'), false);
  assert.strictEqual(safeEqualHex(null, 'aa'), false);
  assert.strictEqual(safeEqualHex('zz', 'zz'), false);
});

test('resetLimits deja el entorno limpio', async (t) => {
  const { dir, security } = setup();
  t.after(() => { security.close(); cleanup(dir); });
  security.connectBucket.take('1.2.3.4');
  resetLimits({ security });
  assert.strictEqual(security.connectBucket.map.size, 0);
});
