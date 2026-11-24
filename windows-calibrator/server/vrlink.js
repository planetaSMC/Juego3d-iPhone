'use strict';

/* ============================================================
   RASMATIC · Servidor WebSocket del calibrador
   ------------------------------------------------------------
   Una sola configuracion autoritativa. Windows e iPhone hablan
   con este servidor; el servidor valida, aplica y retransmite
   identificando el origen. Nunca hay dos verdades.
   ============================================================ */

const { WebSocketServer } = require('ws');
const { parseEnvelope, validatePair, validateAuth, validateState, validateAck, MAX_MSG } = require('./protocol');
const { validateCal } = require('./vr-spec');
const { Security, TokenBucket } = require('./security');

const SERVER_NAME = 'rasmatic-vr-calibrator/1.0';
const MAX_CLIENTS = 8;
const MAX_AUTHED = 4;
const MAX_CLIENTS_EXPO = 2;
const MAX_AUTHED_EXPO = 1;
const HANDSHAKE_MS = 8000;

function normalizeIp(ip) {
  return String(ip || '').replace(/^::ffff:/, '').slice(0, 64);
}

class VRLink {
  constructor(opts) {
    this.httpServer = opts.httpServer;
    this.store = opts.store;
    this.spec = opts.spec;
    this.onEvent = opts.onEvent || function () {};
    this.security = new Security({ store: this.store });
    this.clients = new Set();
    this.wss = null;
    this.rev = 1;
    this.nextId = 0;
    this.lastTelemetry = null;
    this.heartbeat = null;
    this.ipMsg = new TokenBucket(120, 240);
  }

  attach() {
    this.wss = new WebSocketServer({
      server: this.httpServer,
      path: '/vr',
      maxPayload: MAX_MSG,
      perMessageDeflate: false,
      clientTracking: false
    });
    this.wss.on('connection', (ws, req) => this.onConnection(ws, req));
    this.wss.on('error', () => {});
    this.heartbeat = setInterval(() => this.pingAll(), 10000);
    if (this.heartbeat.unref) this.heartbeat.unref();
    return this;
  }

  close() {
    clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.security.close();
    for (const s of this.clients) {
      try { s.ws.close(1001, 'server shutdown'); } catch (e) { /* nada */ }
    }
    this.clients.clear();
    if (this.wss) { try { this.wss.close(); } catch (e) { /* nada */ } }
    this.wss = null;
  }

  /* ---------------- conexiones ---------------- */
  onConnection(ws, req) {
    const ip = normalizeIp(req.socket && req.socket.remoteAddress);
    const flags = this.store.flags();
    const maxClients = flags.expo ? MAX_CLIENTS_EXPO : MAX_CLIENTS;
    if (this.clients.size >= maxClients) {
      try { ws.close(1013, 'server busy'); } catch (e) { /* nada */ }
      return;
    }
    if (!this.security.connectBucket.take(ip)) {
      this.security.record('conn_rate', ip, 'demasiadas conexiones');
      try { ws.close(1013, 'slow down'); } catch (e) { /* nada */ }
      return;
    }
    const wait = this.security.authFail.check(ip) || this.security.pairFail.check(ip);
    if (wait) {
      this.security.record('conn_banned', ip, 'IP en espera');
      try { ws.close(1008, 'banned'); } catch (e) { /* nada */ }
      return;
    }

    const s = {
      id: ++this.nextId,
      ws: ws,
      ip: ip,
      authed: false,
      device: null,
      lastSeq: 0,
      errors: 0,
      lastPong: Date.now(),
      bucket: new TokenBucket(40, 80),
      handshake: null
    };
    this.clients.add(s);

    ws.on('pong', () => { s.lastPong = Date.now(); });
    ws.on('message', (data, isBinary) => {
      this.onMessage(s, data, isBinary).catch(() => {
        this.sendError(s, 'internal', 'Error interno', false);
      });
    });
    ws.on('close', () => this.onClose(s));
    ws.on('error', () => { /* se maneja en close */ });

    s.handshake = setTimeout(() => {
      if (!s.authed) {
        this.sendError(s, 'handshake_timeout', 'No se autenticó a tiempo', true);
      }
    }, HANDSHAKE_MS);
    if (s.handshake.unref) s.handshake.unref();

    this.send(s, {
      t: 'hello',
      v: 1,
      server: SERVER_NAME,
      expo: flags.expo,
      lock: flags.lock,
      paired: this.store.devices().length > 0,
      rev: this.rev
    });
    this.notify();
  }

  onClose(s) {
    if (s.handshake) { clearTimeout(s.handshake); s.handshake = null; }
    this.clients.delete(s);
    if (s.device) this.security.record('disconnect', s.ip, s.device.name);
    this.notify();
  }

  pingAll() {
    const now = Date.now();
    for (const s of this.clients) {
      if (now - s.lastPong > 35000) {
        try { s.ws.terminate(); } catch (e) { /* nada */ }
        continue;
      }
      try { s.ws.ping(); } catch (e) { /* nada */ }
    }
    this.ipMsg.prune();
  }

  /* ---------------- mensajes ---------------- */
  async onMessage(s, data, isBinary) {
    if (isBinary) {
      this.sendError(s, 'binary', 'Solo se aceptan mensajes de texto', true);
      return;
    }
    const raw = Buffer.isBuffer(data) ? data.toString('utf8') : String(data || '');
    if (raw.length > MAX_MSG) {
      this.sendError(s, 'too_large', 'Mensaje demasiado grande', true);
      return;
    }
    if (!s.bucket.take('c') || !this.ipMsg.take(s.ip)) {
      this.security.record('msg_rate', s.ip, 'flood de mensajes');
      this.sendError(s, 'rate', 'Demasiados mensajes', true);
      return;
    }
    const env = parseEnvelope(raw);
    if (!env.ok) {
      this.sendError(s, env.code, env.msg, env.code === 'malformed' || env.code === 'too_large');
      return;
    }
    const m = env.msg;
    if (m.seq <= s.lastSeq) {
      this.security.record('replay', s.ip, 'seq repetido');
      this.sendError(s, 'replay', 'Mensaje repetido', true);
      return;
    }
    s.lastSeq = m.seq;

    try {
      switch (m.t) {
        case 'ping': return await this.onPing(s, m);
        case 'pair': return await this.onPair(s, m);
        case 'auth': return await this.onAuth(s, m);
        case 'cal': return await this.onCal(s, m);
        case 'state': return await this.onState(s, m);
        case 'ack': return await this.onAck(s, m);
        default: return this.sendError(s, 'type', 'Tipo desconocido', false);
      }
    } catch (e) {
      this.sendError(s, 'internal', 'Error interno', false);
    }
  }

  onPing(s, m) {
    this.send(s, { t: 'pong', v: 1, time: Date.now(), seq: m.seq });
  }

  async onPair(s, m) {
    if (s.authed) return this.sendError(s, 'already', 'Ya está autenticado', false);
    const v = validatePair(m);
    if (!v.ok) return this.sendError(s, v.code, v.msg, false);
    const r = await this.security.redeemPairing(v.code, v.device, s.ip);
    if (!r.ok) {
      const msg = r.code === 'bad_code' ? 'Código incorrecto'
        : r.code === 'expired' ? 'El código venció'
          : r.code === 'expo' ? 'Modo Expo: no se aceptan vinculaciones'
            : r.code === 'no_pairing' ? 'No hay un código activo en la PC'
              : r.code === 'too_many' ? 'Demasiados intentos'
                : 'No se pudo emparejar';
      this.sendError(s, r.code, msg, r.code === 'banned' || r.code === 'too_many');
      this.notify();
      return;
    }
    this.authenticate(s, r.device, r.token);
  }

  onAuth(s, m) {
    if (s.authed) return this.sendError(s, 'already', 'Ya está autenticado', false);
    const v = validateAuth(m);
    if (!v.ok) return this.sendError(s, v.code, v.msg, false);
    const r = this.security.authorize(v.deviceId, v.token, s.ip);
    if (!r.ok) {
      const msg = r.code === 'revoked' ? 'Este equipo fue revocado'
        : r.code === 'bad_token' ? 'Token inválido'
          : r.code === 'banned' ? 'Demasiados intentos; esperá un momento'
            : 'Dispositivo desconocido';
      this.sendError(s, r.code, msg, r.code === 'banned' || r.code === 'bad_token');
      this.notify();
      return;
    }
    this.authenticate(s, r.device, null);
  }

  authenticate(s, device, token) {
    const flags = this.store.flags();
    if (flags.expo && flags.expoDevice && device.id !== flags.expoDevice) {
      this.sendError(s, 'expo_device', 'Modo Expo: este equipo no es el autorizado', true);
      return;
    }
    /* Reconexión del mismo equipo: la sesión vieja se reemplaza en vez de
       ocupar uno de los cupos. */
    for (const other of this.clients) {
      if (other !== s && other.authed && other.device && other.device.id === device.id) {
        try { other.ws.close(1000, 'replaced'); } catch (e) { /* nada */ }
      }
    }
    if (flags.expo && this.authedCount() >= MAX_AUTHED_EXPO) {
      this.sendError(s, 'busy', 'Modo Expo: ya hay un equipo conectado', true);
      return;
    }
    if (!flags.expo && this.authedCount() >= MAX_AUTHED) {
      this.sendError(s, 'busy', 'Demasiados equipos conectados', true);
      return;
    }
    s.authed = true;
    s.device = device;
    if (s.handshake) { clearTimeout(s.handshake); s.handshake = null; }
    const welcome = {
      t: 'welcome',
      v: 1,
      deviceId: device.id,
      cal: this.store.calibration(),
      expo: flags.expo,
      lock: flags.lock,
      rev: this.rev
    };
    if (token) welcome.token = token;
    this.send(s, welcome);
    this.security.record('connect', s.ip, device.name);
    this.notify();
  }

  onCal(s, m) {
    if (!s.authed) return this.sendError(s, 'auth', 'Primero autenticá el equipo', true);
    if (m.origin !== undefined && m.origin !== 'iphone') {
      return this.sendError(s, 'origin', 'Origen inválido', false);
    }
    const flags = this.store.flags();
    if (flags.lock) return this.sendError(s, 'locked', 'Calibración bloqueada desde la PC', false);
    const v = validateCal(this.spec, m.values);
    if (!v.ok) {
      this.countError(s);
      return this.sendError(s, 'bad_cal', v.error, false);
    }
    if (flags.expo && v.values.testMode) {
      return this.sendError(s, 'expo', 'Modo prueba desactivado en Expo', false);
    }
    const values = this.store.setCalibration(v.values);
    this.rev++;
    this.send(s, { t: 'ack', v: 1, rev: this.rev, values: v.values, origin: 'iphone' });
    this.broadcastCal(v.values, 'iphone', s);
    this.notifyCalibration(v.values, 'iphone');
    return true;
  }

  onState(s, m) {
    if (!s.authed) return this.sendError(s, 'auth', 'Primero autenticá el equipo', true);
    const v = validateState(m);
    if (!v.ok) {
      this.countError(s);
      return this.sendError(s, 'bad_state', v.msg, false);
    }
    this.lastTelemetry = {
      at: Date.now(),
      deviceId: s.device.id,
      deviceName: s.device.name,
      player: v.state.player || null,
      game: v.state.game || null
    };
    this.onEvent({ type: 'telemetry', telemetry: this.lastTelemetry });
    return true;
  }

  onAck(s, m) {
    if (!s.authed) return this.sendError(s, 'auth', 'Primero autenticá el equipo', true);
    const v = validateAck(m);
    if (!v.ok) return this.sendError(s, v.code, v.msg, false);
    return true;
  }

  countError(s) {
    s.errors++;
    if (s.errors > 12) this.sendError(s, 'abuse', 'Demasiados mensajes inválidos', true);
  }

  /* ---------------- acciones desde Windows ---------------- */
  applyFromWindows(values, origin) {
    const flags = this.store.flags();
    if (flags.lock) return { ok: false, code: 'locked', msg: 'Calibración bloqueada' };
    const v = validateCal(this.spec, values);
    if (!v.ok) return { ok: false, code: 'bad_cal', msg: v.error };
    if (flags.expo && v.values.testMode) return { ok: false, code: 'expo', msg: 'Modo prueba desactivado en Expo' };
    this.store.setCalibration(v.values);
    this.rev++;
    this.broadcastCal(v.values, origin || 'windows', null);
    this.notifyCalibration(v.values, origin || 'windows');
    return { ok: true, rev: this.rev, values: v.values, calibration: this.store.calibration() };
  }

  resetCalibration(origin, force) {
    const flags = this.store.flags();
    if (flags.lock && !force) return { ok: false, code: 'locked', msg: 'Calibración bloqueada' };
    const values = this.store.restoreDefaults();
    this.rev++;
    this.broadcastCal(values, origin || 'windows', null);
    this.notifyCalibration(values, origin || 'windows');
    return { ok: true, rev: this.rev, values, calibration: this.store.calibration() };
  }

  setLock(lock) {
    const flags = this.store.setFlag('lock', !!lock);
    for (const s of this.clients) if (s.authed) this.send(s, { t: 'lock', v: 1, lock: flags.lock });
    this.security.record('lock', '', flags.lock ? 'bloqueada' : 'desbloqueada');
    this.notify();
    return { ok: true, lock: flags.lock };
  }

  setExpo(on) {
    if (on) {
      const devices = this.store.devices().filter((d) => !d.revoked);
      if (!devices.length) {
        return { ok: false, code: 'no_device', msg: 'Emparejá un iPhone antes de activar Modo Expo' };
      }
      let target = this.store.flags().expoDevice;
      if (!target || !devices.some((d) => d.id === target)) {
        if (devices.length === 1) {
          target = devices[0].id;
          this.store.setFlag('expoDevice', target);
        } else {
          return { ok: false, code: 'choose_device', msg: 'Elegí el dispositivo que va a usar Expo' };
        }
      }
      this.store.setFlag('expo', true);
      this.store.setFlag('lock', true);
      this.security.cancelPairing();
      const cal = this.store.calibration();
      if (cal.testMode) {
        this.store.setCalibration({ testMode: false });
        this.rev++;
        this.broadcastCal({ testMode: false }, 'windows', null);
      }
      for (const s of this.clients) {
        if (s.authed && (!s.device || s.device.id !== target)) {
          this.send(s, { t: 'revoked', v: 1 });
          try { s.ws.close(1008, 'expo device'); } catch (e) { /* nada */ }
        } else if (!s.authed) {
          try { s.ws.close(1008, 'expo pairing closed'); } catch (e) { /* nada */ }
        }
      }
      for (const s of this.clients) {
        if (s.authed) {
          this.send(s, { t: 'lock', v: 1, lock: true });
          this.send(s, { t: 'expo', v: 1, on: true });
        }
      }
    } else {
      this.store.setFlag('expo', false);
      for (const s of this.clients) if (s.authed) this.send(s, { t: 'expo', v: 1, on: false });
    }
    this.security.record('expo', '', on ? 'activado' : 'desactivado');
    this.notify();
    return { ok: true, expo: !!on, lock: this.store.flags().lock, expoDevice: this.store.flags().expoDevice };
  }

  setExpoDevice(id) {
    const key = String(id || '').toLowerCase();
    const dev = this.store.findDevice(key);
    if (!dev || dev.revoked) return { ok: false, code: 'unknown_device', msg: 'Ese equipo no está emparejado' };
    this.store.setFlag('expoDevice', key);
    if (this.store.flags().expo) {
      for (const s of this.clients) {
        if (s.authed && (!s.device || s.device.id !== key)) {
          this.send(s, { t: 'revoked', v: 1 });
          try { s.ws.close(1008, 'expo device'); } catch (e) { /* nada */ }
        }
      }
    }
    this.security.record('expo_device', '', dev.name);
    this.notify();
    return { ok: true, expoDevice: key };
  }

  newPairing() {
    const r = this.security.createPairing();
    if (!r.ok) return r;
    this.notify();
    return r;
  }

  cancelPairing() {
    this.security.cancelPairing();
    this.notify();
    return { ok: true };
  }

  revokeDevice(id) {
    const dev = this.store.findDevice(id);
    const ok = this.security.revoke(id, '');
    if (ok) {
      const key = String(id).toLowerCase();
      if (this.store.flags().expoDevice === key) {
        this.store.setFlag('expoDevice', null);
        this.store.setFlag('expo', false);
      }
      for (const s of this.clients) {
        if (s.device && s.device.id === key) {
          this.send(s, { t: 'revoked', v: 1 });
          try { s.ws.close(1008, 'revoked'); } catch (e) { /* nada */ }
        }
      }
    }
    this.notify();
    return { ok, name: dev ? dev.name : '' };
  }

  closeSessions() {
    let n = 0;
    for (const s of this.clients) {
      if (s.authed) {
        n++;
        try { s.ws.close(1000, 'admin'); } catch (e) { /* nada */ }
      }
    }
    this.security.record('close_sessions', '', n + ' sesión(es)');
    this.notify();
    return { ok: true, closed: n };
  }

  /* ---------------- estado ---------------- */
  authedCount() {
    let n = 0;
    for (const s of this.clients) if (s.authed) n++;
    return n;
  }

  status() {
    const flags = this.store.flags();
    const devices = this.store.devices().map((d) => ({
      id: d.id,
      name: d.name,
      model: d.model,
      pairedAt: d.pairedAt,
      lastSeen: d.lastSeen,
      revoked: d.revoked,
      online: Array.from(this.clients).some((s) => s.device && s.device.id === d.id)
    }));
    return {
      rev: this.rev,
      expo: flags.expo,
      lock: flags.lock,
      expoDevice: flags.expoDevice || null,
      clients: this.clients.size,
      authed: this.authedCount(),
      devices,
      pairing: this.security.pairingInfo(),
      hasPin: this.security.hasPin(),
      calibration: this.store.calibration(),
      telemetry: this.lastTelemetry,
      log: this.store.log().slice(-30).reverse()
    };
  }

  /* ---------------- envio ---------------- */
  send(s, msg) {
    if (!s || !s.ws || s.ws.readyState !== 1) return false;
    try {
      s.ws.send(JSON.stringify(msg));
      return true;
    } catch (e) {
      return false;
    }
  }

  sendError(s, code, msg, close) {
    this.send(s, { t: 'error', v: 1, code: String(code || 'error'), msg: String(msg || 'Error') });
    if (close) {
      try { s.ws.close(1008, String(code || 'error').slice(0, 100)); } catch (e) { /* nada */ }
    }
  }

  broadcastCal(values, origin, except) {
    for (const s of this.clients) {
      if (s === except || !s.authed) continue;
      this.send(s, { t: 'cal', v: 1, rev: this.rev, origin: origin, values: values });
    }
  }

  notifyCalibration(values, origin) {
    this.onEvent({
      type: 'calibration',
      rev: this.rev,
      origin: origin,
      values: values,
      calibration: this.store.calibration()
    });
    this.notify();
  }

  notify() {
    this.onEvent({ type: 'status', status: this.status() });
  }
}

module.exports = { VRLink, SERVER_NAME, normalizeIp };
