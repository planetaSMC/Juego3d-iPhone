'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { tempDir, makeStore, cleanup } = require('./helpers');
const { Store, DEFAULT_PROFILE } = require('../server/store');

test('el almacén arranca con los defaults del juego', (t) => {
  const dir = tempDir('rasmatic-store-');
  t.after(() => cleanup(dir));
  const { spec, store } = makeStore(dir);

  assert.strictEqual(store.calibration().ipd, 64);
  assert.strictEqual(store.calibration().profile, 'window');
  assert.strictEqual(store.activeProfile(), DEFAULT_PROFILE);
  assert.ok(store.listProfiles().includes(DEFAULT_PROFILE));
  assert.deepStrictEqual(store.flags(), { expo: false, lock: false, expoDevice: null });
  assert.deepStrictEqual(store.devices(), []);
});

test('guardar, cargar, renombrar, duplicar y borrar perfiles', (t) => {
  const dir = tempDir('rasmatic-store-');
  t.after(() => cleanup(dir));
  const { store } = makeStore(dir);

  assert.strictEqual(store.saveProfile('Casa', { ipd: 68, fov: 90 }).ok, true);
  assert.strictEqual(store.activeProfile(), 'Casa');
  assert.strictEqual(store.calibration().ipd, 68);
  assert.strictEqual(store.listProfiles().includes('Casa'), true);

  store.setCalibration({ ipd: 60 });
  assert.strictEqual(store.loadProfile('Casa').values.ipd, 68);

  assert.strictEqual(store.renameProfile('Casa', 'Living').ok, true);
  assert.strictEqual(store.listProfiles().includes('Casa'), false);
  assert.strictEqual(store.activeProfile(), 'Living');

  assert.strictEqual(store.duplicateProfile('Living', 'Living 2').ok, true);
  assert.strictEqual(store.listProfiles().includes('Living 2'), true);

  assert.strictEqual(store.deleteProfile('Living 2').ok, true);
  assert.strictEqual(store.deleteProfile('Living').ok, true);
  assert.strictEqual(store.activeProfile(), DEFAULT_PROFILE);
  assert.strictEqual(store.calibration().ipd, 64);
});

test('el perfil predeterminado está protegido', (t) => {
  const dir = tempDir('rasmatic-store-');
  t.after(() => cleanup(dir));
  const { store } = makeStore(dir);

  assert.strictEqual(store.deleteProfile(DEFAULT_PROFILE).ok, false);
  assert.strictEqual(store.renameProfile(DEFAULT_PROFILE, 'Otro').ok, false);
  assert.strictEqual(store.duplicateProfile(DEFAULT_PROFILE, DEFAULT_PROFILE).ok, false);
  assert.strictEqual(store.saveProfile('', {}).ok, false);
});

test('restaurar devuelve la calibración de fábrica', (t) => {
  const dir = tempDir('rasmatic-store-');
  t.after(() => cleanup(dir));
  const { store } = makeStore(dir);

  store.saveProfile('Prueba', { ipd: 70, fov: 100 });
  store.setFlag('lock', true);
  const v = store.restoreDefaults();
  assert.strictEqual(v.ipd, 64);
  assert.strictEqual(v.fov, 70);
  assert.strictEqual(store.activeProfile(), DEFAULT_PROFILE);
  /* Restaurar la calibración no cambia los flags de seguridad. */
  assert.strictEqual(store.flags().lock, true);
});

test('los dispositivos se guardan sin token en claro y se pueden revocar', (t) => {
  const dir = tempDir('rasmatic-store-');
  t.after(() => cleanup(dir));
  const { store } = makeStore(dir);
  const hash = 'a'.repeat(64);

  const d = store.upsertDevice({ id: 'ABCDEF0123456789', name: 'iPhone', tokenHash: hash });
  assert.strictEqual(d.id, 'abcdef0123456789');
  assert.strictEqual(store.findDevice('ABCDEF0123456789').name, 'iPhone');
  assert.strictEqual(store.findDevice('abcdef0123456789').tokenHash, hash);

  assert.strictEqual(store.upsertDevice({ id: 'malo', tokenHash: hash }), null);
  assert.strictEqual(store.removeDevice('abcdef0123456789'), true);
  assert.strictEqual(store.removeDevice('abcdef0123456789'), false);
});

test('flags expo, lock y expoDevice', (t) => {
  const dir = tempDir('rasmatic-store-');
  t.after(() => cleanup(dir));
  const { store } = makeStore(dir);

  store.setFlag('expo', true);
  store.setFlag('lock', true);
  store.setFlag('expoDevice', 'ABCDEF0123456789');
  assert.strictEqual(store.flags().expo, true);
  assert.strictEqual(store.flags().lock, true);
  assert.strictEqual(store.flags().expoDevice, 'abcdef0123456789');
  store.setFlag('expoDevice', null);
  assert.strictEqual(store.flags().expoDevice, null);
});

test('el estado persiste y se sanea al recargar', (t) => {
  const dir = tempDir('rasmatic-store-');
  t.after(() => cleanup(dir));
  const { spec, store } = makeStore(dir);

  store.saveProfile('Persistente', { ipd: 72, fov: 95 });
  store.setFlag('lock', true);
  store.upsertDevice({ id: 'abcdef0123456789', name: 'iPhone', tokenHash: 'b'.repeat(64) });
  store.setAdminPinHash('scrypt$x');
  store.flush();

  const file = path.join(dir, 'state.json');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  raw.calibration.ipd = 9999;
  raw.profiles.Persistente.fov = -50;
  raw.devices.push({ id: 'malo', tokenHash: 'x' });
  raw.log.push({ kind: 'test' });
  fs.writeFileSync(file, JSON.stringify(raw));

  const again = new Store(file, spec);
  again.load();
  assert.strictEqual(again.calibration().ipd, 75);
  assert.strictEqual(again.loadProfile('Persistente').values.fov, 40);
  assert.strictEqual(again.flags().lock, true);
  assert.strictEqual(again.devices().length, 1);
  assert.strictEqual(again.adminPinHash(), 'scrypt$x');
});

test('el log se limita y no acepta entradas basura', (t) => {
  const dir = tempDir('rasmatic-store-');
  t.after(() => cleanup(dir));
  const { spec, store } = makeStore(dir);

  for (let i = 0; i < 100; i++) store.addLog({ at: Date.now(), kind: 'k' + i, ip: '', detail: '' });
  assert.strictEqual(store.log().length, 80);
  assert.strictEqual(store.log()[79].kind, 'k99');

  store.flush();
  const raw = JSON.parse(fs.readFileSync(store.file, 'utf8'));
  raw.log.push(null, 'basura', { kind: 5 });
  fs.writeFileSync(store.file, JSON.stringify(raw));
  const again = new Store(store.file, spec);
  again.load();
  assert.ok(again.log().length <= 80);
  assert.strictEqual(again.log().every((e) => typeof e.kind === 'string'), true);
});
