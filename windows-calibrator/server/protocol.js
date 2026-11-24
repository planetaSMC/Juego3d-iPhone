'use strict';

/* ============================================================
   RASMATIC · Protocolo WebSocket v1
   ------------------------------------------------------------
   Cliente -> servidor:
     { v, t:'pair',  seq, code, device:{id,name,model} }
     { v, t:'auth',  seq, token, deviceId, device? }
     { v, t:'cal',   seq, origin, values:{...} }
     { v, t:'state', seq, player?, game? }        (telemetria)
     { v, t:'ping',  seq, time }
     { v, t:'ack',   seq, rev }
   Servidor -> cliente:
     { t:'hello', v, server, expo, lock, paired, rev }
     { t:'welcome', v, token?, deviceId, cal, expo, lock, rev }
     { t:'cal', v, rev, origin, values }
     { t:'lock', v, lock }
     { t:'expo', v, on }
     { t:'revoked' }
     { t:'pong', v, time }
     { t:'error', v, code, msg }
   ============================================================ */

const MAX_MSG = 16 * 1024;
const V = 1;
const TYPES = new Set(['pair', 'auth', 'cal', 'state', 'ping', 'ack']);

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function isInt(v) {
  return Number.isInteger(v);
}

function str(v, max) {
  return typeof v === 'string' && v.length > 0 && v.length <= max;
}

function parseEnvelope(raw) {
  if (typeof raw !== 'string') return { ok: false, code: 'binary', msg: 'Solo se aceptan mensajes de texto' };
  if (raw.length > MAX_MSG) return { ok: false, code: 'too_large', msg: 'Mensaje demasiado grande' };
  let m;
  try { m = JSON.parse(raw); } catch (e) { return { ok: false, code: 'malformed', msg: 'JSON inválido' }; }
  if (!isPlainObject(m)) return { ok: false, code: 'malformed', msg: 'El mensaje debe ser un objeto' };
  if (m.v !== V) return { ok: false, code: 'version', msg: 'Versión de protocolo no soportada' };
  if (!str(m.t, 16) || !TYPES.has(m.t)) return { ok: false, code: 'type', msg: 'Tipo de mensaje inválido' };
  if (!isInt(m.seq) || m.seq < 1 || m.seq > 0x7fffffff) {
    return { ok: false, code: 'seq', msg: 'seq inválido' };
  }
  return { ok: true, msg: m };
}

function validDevice(d) {
  if (!isPlainObject(d)) return null;
  if (typeof d.id !== 'string' || !/^[a-f0-9]{16,64}$/i.test(d.id)) return null;
  const name = typeof d.name === 'string'
    ? d.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40)
    : 'iPhone';
  const model = typeof d.model === 'string'
    ? d.model.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24)
    : '';
  return { id: d.id.toLowerCase(), name: name || 'iPhone', model };
}

function validatePair(m) {
  if (typeof m.code !== 'string' || !/^\d{4,8}$/.test(m.code)) {
    return { ok: false, code: 'bad_code', msg: 'Código inválido' };
  }
  const device = validDevice(m.device);
  if (!device) return { ok: false, code: 'bad_device', msg: 'Identidad de dispositivo inválida' };
  return { ok: true, code: m.code, device };
}

function validateAuth(m) {
  if (typeof m.token !== 'string' || m.token.length < 20 || m.token.length > 128) {
    return { ok: false, code: 'bad_token', msg: 'Token inválido' };
  }
  if (typeof m.deviceId !== 'string' || !/^[a-f0-9]{16,64}$/i.test(m.deviceId)) {
    return { ok: false, code: 'bad_device', msg: 'Dispositivo inválido' };
  }
  return { ok: true, token: m.token, deviceId: m.deviceId.toLowerCase() };
}

function validateState(m) {
  const out = {};
  if (m.player !== undefined) {
    if (!isPlainObject(m.player)) return { ok: false, code: 'bad_state', msg: 'player inválido' };
    const p = m.player;
    const keys = ['x', 'y', 'z', 'yaw', 'pitch'];
    for (const k of keys) {
      if (p[k] !== undefined && (!isFiniteNumber(p[k]) || Math.abs(p[k]) > 10000)) {
        return { ok: false, code: 'bad_state', msg: 'posición inválida' };
      }
    }
    out.player = {
      x: isFiniteNumber(p.x) ? p.x : 0,
      y: isFiniteNumber(p.y) ? p.y : 0,
      z: isFiniteNumber(p.z) ? p.z : 0,
      yaw: isFiniteNumber(p.yaw) ? p.yaw : 0,
      pitch: isFiniteNumber(p.pitch) ? p.pitch : 0
    };
  }
  if (m.game !== undefined) {
    if (!isPlainObject(m.game)) return { ok: false, code: 'bad_state', msg: 'game inválido' };
    const g = m.game;
    if (g.state !== undefined && (typeof g.state !== 'string' || g.state.length > 20)) {
      return { ok: false, code: 'bad_state', msg: 'estado inválido' };
    }
    if (g.time !== undefined && (!isFiniteNumber(g.time) || g.time < 0 || g.time > 100000)) {
      return { ok: false, code: 'bad_state', msg: 'tiempo inválido' };
    }
    if (g.request !== undefined && (!isInt(g.request) || g.request < -1 || g.request > 64)) {
      return { ok: false, code: 'bad_state', msg: 'pedido inválido' };
    }
    if (g.carrying !== undefined && (!isInt(g.carrying) || g.carrying < -1 || g.carrying > 64)) {
      return { ok: false, code: 'bad_state', msg: 'carga inválida' };
    }
    out.game = {
      state: typeof g.state === 'string' ? g.state : '',
      time: isFiniteNumber(g.time) ? g.time : 0,
      request: isInt(g.request) ? g.request : -1,
      carrying: isInt(g.carrying) ? g.carrying : -1
    };
    if (isPlainObject(g.score)) {
      const pl = isInt(g.score.player) ? Math.max(0, Math.min(100000, g.score.player)) : 0;
      const bo = isInt(g.score.bot) ? Math.max(0, Math.min(100000, g.score.bot)) : 0;
      out.game.score = { player: pl, bot: bo };
    }
  }
  if (!out.player && !out.game) return { ok: false, code: 'bad_state', msg: 'Sin datos de estado' };
  return { ok: true, state: out };
}

function validateAck(m) {
  if (!isInt(m.rev) || m.rev < 0) return { ok: false, code: 'bad_rev', msg: 'rev inválido' };
  return { ok: true, rev: m.rev };
}

module.exports = {
  MAX_MSG,
  V,
  TYPES,
  parseEnvelope,
  validatePair,
  validateAuth,
  validateState,
  validateAck,
  validDevice,
  isPlainObject,
  isFiniteNumber,
  isInt
};
