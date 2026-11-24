'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const WebSocket = require('ws');
const { createHttpServer } = require('../server/http');
const { VRLink } = require('../server/vrlink');
const { tempDir, makeStore, cleanup, makeClient, resetLimits, GAME_ROOT } = require('./helpers');

const RENDERER = path.resolve(__dirname, '..', 'renderer');

async function start() {
  const dir = tempDir('rasmatic-link-');
  const { spec, store } = makeStore(dir);
  const http = createHttpServer({ gameRoot: GAME_ROOT, rendererRoot: RENDERER, spec });
  await new Promise((resolve, reject) => {
    http.once('error', reject);
    http.listen(0, '127.0.0.1', resolve);
  });
  const port = http.address().port;
  const events = [];
  const link = new VRLink({
    httpServer: http,
    store,
    spec,
    onEvent: (ev) => events.push(ev)
  }).attach();

  async function connect() {
    link.security.connectBucket.map.clear();
    const c = makeClient(WebSocket, 'ws://127.0.0.1:' + port + '/vr');
    await c.open();
    const hello = await c.next('hello');
    return { c, hello };
  }

  async function pair(device, code) {
    const p = link.security.createPairing();
    assert.strictEqual(p.ok, true);
    const { c } = await connect();
    c.send({ v: 1, t: 'pair', seq: 1, code: code || p.code, device });
    const w = await c.next('welcome');
    return { c, token: w.token, welcome: w };
  }

  async function auth(device, token) {
    const { c } = await connect();
    c.send({ v: 1, t: 'auth', seq: 1, token, deviceId: device.id, device });
    const w = await c.next('welcome');
    return { c, welcome: w };
  }

  async function close() {
    link.close();
    await new Promise((r) => http.close(r));
    cleanup(dir);
  }

  return { dir, spec, store, link, port, events, connect, pair, auth, close };
}

const A = { id: 'aaaaaaaaaaaaaaaa', name: 'iPhone A', model: 'iPhone 15' };
const B = { id: 'bbbbbbbbbbbbbbbb', name: 'iPhone B', model: 'iPhone 13' };

test('hello, emparejamiento y bienvenida con calibración real', async (t) => {
  const s = await start();
  t.after(() => s.close());

  const { c, hello } = await s.connect();
  assert.strictEqual(hello.server, 'rasmatic-vr-calibrator/1.0');
  assert.strictEqual(hello.expo, false);
  assert.strictEqual(hello.paired, false);

  const p = s.link.security.createPairing();
  c.send({ v: 1, t: 'pair', seq: 1, code: p.code, device: A });
  const w = await c.next('welcome');
  assert.strictEqual(w.deviceId, A.id);
  assert.ok(w.token && w.token.length >= 40);
  assert.strictEqual(w.cal.ipd, 64);
  assert.strictEqual(w.cal.profile, 'window');
  assert.strictEqual(w.lock, false);
  assert.strictEqual(s.store.devices().length, 1);
  c.close();
});

test('autenticación con token, sin volver a exponerlo', async (t) => {
  const s = await start();
  t.after(() => s.close());

  const { c, token } = await s.pair(A);
  c.close();

  const { c: c2, welcome } = await s.auth(A, token);
  assert.strictEqual(welcome.deviceId, A.id);
  assert.strictEqual(welcome.token, undefined);
  assert.strictEqual(welcome.cal.ipd, 64);
  c2.close();
});

test('un token inválido es rechazado y desconectado', async (t) => {
  const s = await start();
  t.after(() => s.close());
  await s.pair(A);

  const { c } = await s.connect();
  c.send({ v: 1, t: 'auth', seq: 1, token: 'x'.repeat(43), deviceId: A.id });
  const e = await c.next('error');
  assert.strictEqual(e.code, 'bad_token');
  c.close();
});

test('calibración iPhone -> PC se aplica y retransmite con origen', async (t) => {
  const s = await start();
  t.after(() => s.close());

  const { c: ca, token: ta } = await s.pair(A);
  const { c: cb } = await s.pair(B);
  ca.close();

  const { c: a } = await s.auth(A, ta);

  a.send({ v: 1, t: 'cal', seq: 2, origin: 'iphone', values: { ipd: 66, fov: 82 } });
  const ack = await a.next('ack');
  assert.strictEqual(ack.origin, 'iphone');
  assert.strictEqual(s.store.calibration().ipd, 66);

  const relay = await cb.next('cal');
  assert.strictEqual(relay.origin, 'iphone');
  assert.strictEqual(relay.values.ipd, 66);
  assert.strictEqual(relay.values.fov, 82);

  const ev = s.events.filter((e) => e.type === 'calibration').pop();
  assert.strictEqual(ev.origin, 'iphone');
  a.close();
  cb.close();
});

test('un valor fuera de rango es rechazado sin tocar el estado', async (t) => {
  const s = await start();
  t.after(() => s.close());
  const { c } = await s.pair(A);

  c.send({ v: 1, t: 'cal', seq: 2, origin: 'iphone', values: { ipd: 999 } });
  const e = await c.next('error');
  assert.strictEqual(e.code, 'bad_cal');
  assert.strictEqual(s.store.calibration().ipd, 64);

  c.send({ v: 1, t: 'cal', seq: 3, origin: 'iphone', values: { ipd: NaN } });
  const e2 = await c.next('error');
  assert.strictEqual(e2.code, 'bad_cal');
  c.close();
});

test('la calibración bloqueada rechaza cambios del iPhone', async (t) => {
  const s = await start();
  t.after(() => s.close());
  const { c } = await s.pair(A);

  s.link.setLock(true);
  const lockMsg = await c.next('lock');
  assert.strictEqual(lockMsg.lock, true);

  c.send({ v: 1, t: 'cal', seq: 2, origin: 'iphone', values: { ipd: 70 } });
  const e = await c.next('error');
  assert.strictEqual(e.code, 'locked');
  assert.strictEqual(s.store.calibration().ipd, 64);

  const w = s.link.applyFromWindows({ ipd: 71 }, 'windows');
  assert.strictEqual(w.ok, false);
  assert.strictEqual(w.code, 'locked');

  s.link.setLock(false);
  c.close();
});

test('replay de seq cierra la conexión', async (t) => {
  const s = await start();
  t.after(() => s.close());
  const { c } = await s.pair(A);

  c.send({ v: 1, t: 'ping', seq: 2, time: Date.now() });
  await c.next('pong');
  c.send({ v: 1, t: 'ping', seq: 2, time: Date.now() });
  const e = await c.next('error');
  assert.strictEqual(e.code, 'replay');
  await new Promise((r) => setTimeout(r, 80));
  assert.strictEqual(c.closed, true);
});

test('mensajes malformados y gigantes son rechazados', async (t) => {
  const s = await start();
  t.after(() => s.close());
  const { c } = await s.pair(A);

  c.send('{ esto no es json');
  const e = await c.next('error');
  assert.strictEqual(e.code, 'malformed');
  await new Promise((r) => setTimeout(r, 80));
  assert.strictEqual(c.closed, true);

  /* ws corta la conexión al superar maxPayload (16 KB). */
  const { c: big } = await s.connect();
  big.send(JSON.stringify({ v: 1, t: 'cal', seq: 1, values: { ipd: 64 }, relleno: 'x'.repeat(20000) }));
  await new Promise((r) => setTimeout(r, 250));
  assert.strictEqual(big.closed, true);
});

test('Modo Expo exige un dispositivo designado y bloquea el resto', async (t) => {
  const s = await start();
  t.after(() => s.close());

  const { c: ca, token: ta } = await s.pair(A);
  const { c: cb, token: tb } = await s.pair(B);
  ca.close();
  cb.close();

  /* Sin designar, con dos equipos, Expo pide elegir. */
  const noChoice = s.link.setExpo(true);
  assert.strictEqual(noChoice.ok, false);
  assert.strictEqual(noChoice.code, 'choose_device');

  const choose = s.link.setExpoDevice(A.id);
  assert.strictEqual(choose.ok, true);
  const on = s.link.setExpo(true);
  assert.strictEqual(on.ok, true);
  assert.strictEqual(on.expo, true);
  assert.strictEqual(s.store.flags().lock, true);

  const { c: a } = await s.auth(A, ta);
  const { c: b } = await s.connect();
  b.send({ v: 1, t: 'auth', seq: 1, token: tb, deviceId: B.id });
  const e = await b.next('error');
  assert.strictEqual(e.code, 'expo_device');

  const p = s.link.security.createPairing();
  assert.strictEqual(p.ok, false);
  assert.strictEqual(p.code, 'expo');

  const off = s.link.setExpo(false);
  assert.strictEqual(off.ok, true);
  a.close();
  b.close();
});

test('revocar el dispositivo de Expo apaga Expo y limpia la designación', async (t) => {
  const s = await start();
  t.after(() => s.close());

  const { c, token } = await s.pair(A);
  c.close();
  s.link.setExpoDevice(A.id);
  s.link.setExpo(true);
  const { c: live } = await s.auth(A, token);

  const r = s.link.revokeDevice(A.id);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(s.store.flags().expo, false);
  assert.strictEqual(s.store.flags().expoDevice, null);
  const rev = await live.next('revoked');
  assert.strictEqual(rev.t, 'revoked');
  live.close();
});

test('cerrar sesiones no borra la calibración', async (t) => {
  const s = await start();
  t.after(() => s.close());
  const { c } = await s.pair(A);
  s.link.applyFromWindows({ ipd: 67 }, 'windows');

  const r = s.link.closeSessions();
  assert.ok(r.closed >= 1);
  assert.strictEqual(s.store.calibration().ipd, 67);
  c.close();
});

test('telemetría válida se reenvía y la inválida se rechaza', async (t) => {
  const s = await start();
  t.after(() => s.close());
  const { c } = await s.pair(A);

  c.send({ v: 1, t: 'state', seq: 2, player: { x: 1, y: 0, z: 2, yaw: 0.3, pitch: 0 } });
  await new Promise((r) => setTimeout(r, 60));
  const ev = s.events.filter((e) => e.type === 'telemetry').pop();
  assert.ok(ev);
  assert.strictEqual(ev.telemetry.player.z, 2);

  c.send({ v: 1, t: 'state', seq: 3, player: { x: Infinity } });
  const e = await c.next('error');
  assert.strictEqual(e.code, 'bad_state');
  c.close();
});

test('reconexión del mismo equipo reemplaza la sesión anterior', async (t) => {
  const s = await start();
  t.after(() => s.close());
  const { c: first, token } = await s.pair(A);

  const { c: second } = await s.auth(A, token);
  await new Promise((r) => setTimeout(r, 100));
  assert.strictEqual(first.closed, true);
  assert.strictEqual(second.closed, false);
  second.close();
});

test('la designación de Expo rechaza equipos desconocidos', async (t) => {
  const s = await start();
  t.after(() => s.close());
  const { c } = await s.pair(A);
  c.close();

  const r = s.link.setExpoDevice('ffffffffffffffff');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'unknown_device');
});
