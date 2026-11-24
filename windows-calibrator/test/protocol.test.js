'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  parseEnvelope, validatePair, validateAuth, validateState, validateAck, validDevice, MAX_MSG
} = require('../server/protocol');

function env(extra) {
  return JSON.stringify(Object.assign({ v: 1, t: 'ping', seq: 1 }, extra));
}

test('parseEnvelope acepta un mensaje válido', () => {
  const r = parseEnvelope(env({ t: 'ping', time: Date.now() }));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.msg.t, 'ping');
});

test('parseEnvelope rechaza JSON inválido y no-objetos', () => {
  assert.strictEqual(parseEnvelope('{').ok, false);
  assert.strictEqual(parseEnvelope('[]').ok, false);
  assert.strictEqual(parseEnvelope('null').ok, false);
  assert.strictEqual(parseEnvelope('"hola"').ok, false);
  assert.strictEqual(parseEnvelope(42).ok, false);
});

test('parseEnvelope exige versión, tipo y seq', () => {
  assert.strictEqual(parseEnvelope(JSON.stringify({ v: 2, t: 'ping', seq: 1 })).ok, false);
  assert.strictEqual(parseEnvelope(JSON.stringify({ v: 1, t: 'otro', seq: 1 })).ok, false);
  assert.strictEqual(parseEnvelope(JSON.stringify({ v: 1, t: 'ping' })).ok, false);
  assert.strictEqual(parseEnvelope(JSON.stringify({ v: 1, t: 'ping', seq: 0 })).ok, false);
  assert.strictEqual(parseEnvelope(JSON.stringify({ v: 1, t: 'ping', seq: 1.5 })).ok, false);
  assert.strictEqual(parseEnvelope(JSON.stringify({ v: 1, t: 'ping', seq: -3 })).ok, false);
});

test('parseEnvelope rechaza mensajes gigantes', () => {
  const big = 'x'.repeat(MAX_MSG + 10);
  assert.strictEqual(parseEnvelope(big).ok, false);
});

test('validDevice normaliza y limita nombres', () => {
  const d = validDevice({ id: 'ABCDEF0123456789', name: '  iPhone\u0000 de Valen  ', model: 'iPhone 15 Pro Max Extra' });
  assert.strictEqual(d.id, 'abcdef0123456789');
  assert.strictEqual(d.name, 'iPhone de Valen');
  assert.ok(d.model.length <= 24);
  assert.strictEqual(validDevice({ id: 'corto' }), null);
  assert.strictEqual(validDevice({ id: 'zzzzzzzzzzzzzzzz' }), null);
  assert.strictEqual(validDevice(null), null);
});

test('validatePair exige código numérico y dispositivo válido', () => {
  const device = { id: 'abcdef0123456789', name: 'iPhone' };
  assert.strictEqual(validatePair({ code: '123456', device }).ok, true);
  assert.strictEqual(validatePair({ code: '12345a', device }).ok, false);
  assert.strictEqual(validatePair({ code: '123456' }).ok, false);
  assert.strictEqual(validatePair({ code: '123456', device: { id: 'x' } }).ok, false);
});

test('validateAuth exige token y deviceId', () => {
  assert.strictEqual(validateAuth({ token: 'a'.repeat(40), deviceId: 'abcdef0123456789' }).ok, true);
  assert.strictEqual(validateAuth({ token: 'corto', deviceId: 'abcdef0123456789' }).ok, false);
  assert.strictEqual(validateAuth({ token: 'a'.repeat(40), deviceId: 'no' }).ok, false);
  assert.strictEqual(validateAuth({ token: 'a'.repeat(200), deviceId: 'abcdef0123456789' }).ok, false);
});

test('validateState acepta pose y estado del juego', () => {
  const r = validateState({
    player: { x: 1, y: 0, z: -2, yaw: 0.5, pitch: -0.1 },
    game: { state: 'playing', time: 42, request: 2, carrying: 1, score: { player: 3, bot: 1 } }
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.player.z, -2);
  assert.strictEqual(r.state.game.score.bot, 1);
});

test('validateState rechaza NaN, infinitos y valores absurdos', () => {
  assert.strictEqual(validateState({ player: { x: NaN } }).ok, false);
  assert.strictEqual(validateState({ player: { x: Infinity } }).ok, false);
  assert.strictEqual(validateState({ player: { x: 1e9 } }).ok, false);
  assert.strictEqual(validateState({ player: 'x' }).ok, false);
  assert.strictEqual(validateState({}).ok, false);
  assert.strictEqual(validateState({ game: { state: 'x'.repeat(40) } }).ok, false);
  assert.strictEqual(validateState({ game: { request: 999 } }).ok, false);
});

test('validateAck exige rev entero no negativo', () => {
  assert.strictEqual(validateAck({ rev: 0 }).ok, true);
  assert.strictEqual(validateAck({ rev: 12 }).ok, true);
  assert.strictEqual(validateAck({ rev: -1 }).ok, false);
  assert.strictEqual(validateAck({ rev: 1.2 }).ok, false);
  assert.strictEqual(validateAck({}).ok, false);
});
