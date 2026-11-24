'use strict';

/* ============================================================
   RASMATIC · Seguridad del enlace PC <-> iPhone
   ------------------------------------------------------------
   - Codigo de emparejamiento temporal (6 digitos, 120 s, un uso).
   - Token de 256 bits; se guarda solo su SHA-256.
   - PIN de administracion opcional con scrypt.
   - Rate limiting, intentos fallidos y bans progresivos.
   - Nunca se registran tokens, codigos ni PIN completos.
   ============================================================ */

const crypto = require('node:crypto');

const PAIR_TTL_MS = 120000;
const PAIR_MAX_ATTEMPTS = 5;
const TOKEN_BYTES = 32;
const PIN_RE = /^\d{4,8}$/;

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function hashToken(token) {
  return sha256('rasmatic-vr-token\0' + String(token || ''));
}

function randomToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

function randomSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (!/^[a-f0-9]+$/i.test(a) || !/^[a-f0-9]+$/i.test(b)) return false;
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/* scrypt solo para el PIN (baja entropia y larga vida). El token de
   256 bits y el codigo efimero usan SHA-256 con sal. */
function scryptHash(secret, salt) {
  const s = salt || randomSalt();
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(secret), s, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, key) => {
      if (err) return reject(err);
      resolve('scrypt$16384$8$1$' + s + '$' + key.toString('hex'));
    });
  });
}

function scryptVerify(secret, stored) {
  return new Promise((resolve) => {
    if (typeof stored !== 'string') return resolve(false);
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return resolve(false);
    const N = Number(parts[1]), r = Number(parts[2]), p = Number(parts[3]);
    if (![N, r, p].every(Number.isFinite) || N < 1024 || N > 65536 || r < 1 || r > 32 || p < 1 || p > 8) {
      return resolve(false);
    }
    const salt = parts[4];
    const expected = parts[5];
    crypto.scrypt(String(secret), salt, 32, { N, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) => {
      if (err) return resolve(false);
      const a = Buffer.from(expected, 'hex');
      if (a.length !== key.length) return resolve(false);
      resolve(crypto.timingSafeEqual(a, key));
    });
  });
}

class TokenBucket {
  constructor(rate, burst) {
    this.rate = rate;
    this.burst = burst;
    this.map = new Map();
  }

  take(key, cost) {
    const now = Date.now();
    const c = cost || 1;
    let b = this.map.get(key);
    if (!b) { b = { tokens: this.burst, at: now }; this.map.set(key, b); }
    b.tokens = Math.min(this.burst, b.tokens + (now - b.at) / 1000 * this.rate);
    b.at = now;
    if (b.tokens < c) return false;
    b.tokens -= c;
    return true;
  }

  prune() {
    const now = Date.now();
    for (const [k, b] of this.map) {
      if (now - b.at > 300000) this.map.delete(k);
    }
  }
}

class FailureTracker {
  constructor(opts) {
    this.limit = opts.limit;
    this.windowMs = opts.windowMs;
    this.banMs = opts.banMs;
    this.maxBanMs = opts.maxBanMs || 600000;
    this.map = new Map();
  }

  check(key) {
    const e = this.map.get(key);
    if (!e) return 0;
    const now = Date.now();
    if (e.banUntil > now) return e.banUntil - now;
    return 0;
  }

  fail(key) {
    const now = Date.now();
    let e = this.map.get(key);
    if (!e || now - e.first > this.windowMs) e = { count: 0, first: now, strikes: 0, banUntil: 0 };
    e.count++;
    if (e.count >= this.limit) {
      e.strikes++;
      const wait = Math.min(this.maxBanMs, this.banMs * Math.pow(2, Math.max(0, e.strikes - 1)));
      e.banUntil = now + wait;
      e.count = 0;
      e.first = now;
    }
    this.map.set(key, e);
    return e.banUntil > now ? e.banUntil - now : 0;
  }

  reset(key) { this.map.delete(key); }

  prune() {
    const now = Date.now();
    for (const [k, e] of this.map) {
      if (e.banUntil < now && now - e.first > this.windowMs * 4) this.map.delete(k);
    }
  }
}

class Security {
  constructor(opts) {
    this.store = opts.store;
    this.pairing = null;
    this.pairFail = new FailureTracker({ limit: PAIR_MAX_ATTEMPTS, windowMs: 60000, banMs: 30000, maxBanMs: 300000 });
    this.authFail = new FailureTracker({ limit: 6, windowMs: 60000, banMs: 30000, maxBanMs: 300000 });
    this.pinFail = new FailureTracker({ limit: 5, windowMs: 300000, banMs: 300000, maxBanMs: 900000 });
    this.pairGen = new TokenBucket(0.5, 3);
    this.connectBucket = new TokenBucket(0.25, 12);
    this.cleanup = setInterval(() => {
      this.pairFail.prune();
      this.authFail.prune();
      this.pinFail.prune();
      this.pairGen.prune();
      this.connectBucket.prune();
    }, 120000);
    if (this.cleanup.unref) this.cleanup.unref();
  }

  close() {
    clearInterval(this.cleanup);
    this.pairing = null;
  }

  /* ---------------- emparejamiento ---------------- */
  createPairing(ttlMs) {
    if (this.store.flags().expo) return { ok: false, code: 'expo' };
    if (!this.pairGen.take('pairing')) return { ok: false, code: 'slow_down' };
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const salt = randomSalt();
    this.pairing = {
      salt,
      hash: sha256(salt + ':' + code),
      expiresAt: Date.now() + (ttlMs || PAIR_TTL_MS),
      attempts: 0,
      used: false
    };
    return { ok: true, code, expiresAt: this.pairing.expiresAt };
  }

  cancelPairing() {
    this.pairing = null;
  }

  pairingInfo() {
    if (!this.pairing || this.pairing.used) return { active: false, expiresAt: 0, remaining: 0 };
    const remaining = Math.max(0, this.pairing.expiresAt - Date.now());
    if (!remaining) { this.pairing = null; return { active: false, expiresAt: 0, remaining: 0 }; }
    return { active: true, expiresAt: this.pairing.expiresAt, remaining };
  }

  redeemPairing(code, device, ip) {
    if (this.store.flags().expo) return { ok: false, code: 'expo' };
    const wait = this.pairFail.check(ip || '');
    if (wait) return { ok: false, code: 'banned', wait };
    if (!this.pairing || this.pairing.used) return { ok: false, code: 'no_pairing' };
    if (Date.now() > this.pairing.expiresAt) {
      this.pairing = null;
      return { ok: false, code: 'expired' };
    }
    if (this.pairing.attempts >= PAIR_MAX_ATTEMPTS) {
      this.pairing = null;
      return { ok: false, code: 'too_many' };
    }
    this.pairing.attempts++;
    const candidate = sha256(this.pairing.salt + ':' + String(code || ''));
    if (!safeEqualHex(candidate, this.pairing.hash)) {
      const ban = this.pairFail.fail(ip || '');
      this.record('pair_fail', ip, 'código incorrecto');
      return { ok: false, code: 'bad_code', wait: ban };
    }
    this.pairFail.reset(ip || '');
    this.pairing.used = true;
    this.pairing = null;
    const token = randomToken();
    const dev = this.store.upsertDevice({
      id: device.id,
      name: device.name,
      model: device.model,
      tokenHash: hashToken(token),
      pairedAt: Date.now(),
      lastSeen: Date.now(),
      revoked: false
    });
    this.record('pair_ok', ip, dev ? dev.name : 'dispositivo');
    return { ok: true, token, device: dev };
  }

  /* ---------------- autenticacion ---------------- */
  authorize(deviceId, token, ip) {
    const wait = this.authFail.check(ip || '');
    if (wait) return { ok: false, code: 'banned', wait };
    const dev = this.store.findDevice(deviceId);
    if (!dev) {
      this.authFail.fail(ip || '');
      this.record('auth_fail', ip, 'dispositivo desconocido');
      return { ok: false, code: 'unknown_device' };
    }
    if (dev.revoked) return { ok: false, code: 'revoked' };
    if (!safeEqualHex(dev.tokenHash, hashToken(token))) {
      this.authFail.fail(ip || '');
      this.record('auth_fail', ip, 'token inválido');
      return { ok: false, code: 'bad_token' };
    }
    this.authFail.reset(ip || '');
    this.store.touchDevice(dev.id);
    return { ok: true, device: dev };
  }

  revoke(deviceId, ip) {
    const dev = this.store.findDevice(deviceId);
    const ok = this.store.removeDevice(deviceId);
    if (ok) this.record('revoke', ip, dev ? dev.name : 'dispositivo');
    return ok;
  }

  revokeAll(ip) {
    const n = this.store.devices().length;
    this.store.clearDevices();
    this.record('revoke_all', ip, n + ' dispositivo(s)');
    return n;
  }

  /* ---------------- PIN de administracion ---------------- */
  hasPin() { return !!this.store.adminPinHash(); }

  async setPin(currentPin, newPin) {
    if (!PIN_RE.test(String(newPin || ''))) return { ok: false, code: 'pin_format' };
    if (this.hasPin()) {
      const v = await this.verifyPin(currentPin);
      if (!v.ok) return v;
    }
    const hash = await scryptHash(newPin);
    this.store.setAdminPinHash(hash);
    this.record('pin_set', '', 'PIN actualizado');
    return { ok: true };
  }

  async clearPin(currentPin) {
    if (!this.hasPin()) return { ok: true, configured: false };
    const v = await this.verifyPin(currentPin);
    if (!v.ok) return v;
    this.store.setAdminPinHash(null);
    this.record('pin_clear', '', 'PIN eliminado');
    return { ok: true, configured: false };
  }

  async verifyPin(pin) {
    const wait = this.pinFail.check('admin');
    if (wait) return { ok: false, code: 'pin_locked', wait };
    const hash = this.store.adminPinHash();
    if (!hash) return { ok: true, configured: false };
    const ok = await scryptVerify(String(pin || ''), hash);
    if (!ok) {
      const ban = this.pinFail.fail('admin');
      this.record('pin_fail', '', 'PIN incorrecto');
      return { ok: false, code: 'bad_pin', wait: ban };
    }
    this.pinFail.reset('admin');
    return { ok: true, configured: true };
  }

  /* ---------------- utilidades ---------------- */
  record(kind, ip, detail) {
    this.store.addLog({
      at: Date.now(),
      kind: String(kind || 'event').slice(0, 40),
      ip: String(ip || '').slice(0, 64),
      detail: String(detail || '').slice(0, 160)
    });
  }
}

module.exports = {
  Security,
  TokenBucket,
  FailureTracker,
  hashToken,
  randomToken,
  sha256,
  safeEqualHex,
  scryptHash,
  scryptVerify,
  PAIR_TTL_MS
};
