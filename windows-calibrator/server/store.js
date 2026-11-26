'use strict';

/* ============================================================
   RASMATIC · Persistencia local del calibrador
   ------------------------------------------------------------
   Todo vive en userData (nunca en el repositorio):
     - calibracion actual
     - perfiles
     - flags (Modo Expo, bloqueo)
     - dispositivos emparejados (solo hash del token)
     - hash del PIN de administracion
     - ultimos eventos de seguridad (sin secretos)
   ============================================================ */

const fs = require('node:fs');
const path = require('node:path');
const { sanitizeCal, defaultsCal, isPlainObject } = require('./vr-spec');

const DEFAULT_PROFILE = 'Predeterminado';
const MAX_PROFILES = 40;
const MAX_LOG = 80;

function cleanName(name) {
  if (typeof name !== 'string') return '';
  return name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 32);
}

function cleanDevice(d) {
  if (!isPlainObject(d)) return null;
  const id = typeof d.id === 'string' ? d.id : '';
  if (!/^[a-f0-9]{16,64}$/i.test(id)) return null;
  const tokenHash = typeof d.tokenHash === 'string' ? d.tokenHash : '';
  if (!/^[a-f0-9]{64}$/i.test(tokenHash)) return null;
  return {
    id: id.toLowerCase(),
    name: cleanName(d.name) || 'iPhone',
    model: cleanName(d.model || '').slice(0, 24),
    tokenHash: tokenHash.toLowerCase(),
    pairedAt: Number.isFinite(Number(d.pairedAt)) ? Number(d.pairedAt) : Date.now(),
    lastSeen: Number.isFinite(Number(d.lastSeen)) ? Number(d.lastSeen) : 0,
    revoked: !!d.revoked
  };
}

class Store {
  constructor(file, spec) {
    this.file = file;
    this.spec = spec;
    this.timer = null;
    this.data = null;
  }

  load() {
    let raw = null;
    try {
      raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (e) { raw = null; }
    const d = isPlainObject(raw) ? raw : {};
    const calibration = Object.assign(defaultsCal(this.spec), sanitizeCal(this.spec, d.calibration));

    const profiles = {};
    if (isPlainObject(d.profiles)) {
      for (const name of Object.keys(d.profiles)) {
        const n = cleanName(name);
        if (!n) continue;
        const p = sanitizeCal(this.spec, d.profiles[name]);
        profiles[n] = Object.assign(defaultsCal(this.spec), p);
      }
    }
    if (!profiles[DEFAULT_PROFILE]) {
      profiles[DEFAULT_PROFILE] = defaultsCal(this.spec);
    }

    const devices = [];
    if (Array.isArray(d.devices)) {
      for (const item of d.devices.slice(0, 16)) {
        const dev = cleanDevice(item);
        if (dev) devices.push(dev);
      }
    }

    this.data = {
      version: 1,
      calibration,
      profiles,
      activeProfile: profiles[cleanName(d.activeProfile)] ? cleanName(d.activeProfile) : DEFAULT_PROFILE,
      flags: {
        expo: !!(d.flags && d.flags.expo),
        lock: !!(d.flags && d.flags.lock),
        expoDevice: (d.flags && typeof d.flags.expoDevice === 'string')
          ? d.flags.expoDevice.toLowerCase()
          : null
      },
      admin: {
        pinHash: d.admin && typeof d.admin.pinHash === 'string' ? d.admin.pinHash : null
      },
      devices,
      log: Array.isArray(d.log)
        ? d.log.slice(-MAX_LOG).filter((e) => isPlainObject(e) && typeof e.kind === 'string').map((e) => ({
          at: Number(e.at) || 0,
          kind: String(e.kind).slice(0, 40),
          ip: String(e.ip || '').slice(0, 64),
          detail: String(e.detail || '').slice(0, 160)
        }))
        : []
    };
    return this.data;
  }

  save() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.saveNow();
    }, 120);
    if (this.timer.unref) this.timer.unref();
  }

  saveNow() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const dir = path.dirname(this.file);
    fs.mkdirSync(dir, { recursive: true });
    const json = JSON.stringify(this.data, null, 2);
    const tmp = this.file + '.tmp';
    try {
      fs.writeFileSync(tmp, json, { mode: 0o600 });
      fs.renameSync(tmp, this.file);
    } catch (e) {
      try { fs.writeFileSync(this.file, json, { mode: 0o600 }); } catch (e2) { /* disco lleno */ }
      try { fs.unlinkSync(tmp); } catch (e3) { /* nada */ }
    }
  }

  flush() { this.saveNow(); }

  /* ---------------- calibracion ---------------- */
  setCalibration(values) {
    this.data.calibration = Object.assign({}, this.data.calibration, values);
    /* V20: recentrar y calibrar son acciones de un solo uso. Se emiten a los
       clientes, pero no quedan guardadas en 1 (si no, cada reconexión
       volvería a recentrar la cabeza). */
    if (this.data.calibration.htRecenter) this.data.calibration.htRecenter = 0;
    if (this.data.calibration.htCalibrate) this.data.calibration.htCalibrate = 0;
    this.save();
    return this.data.calibration;
  }

  calibration() {
    return Object.assign({}, this.data.calibration);
  }

  restoreDefaults() {
    this.data.calibration = defaultsCal(this.spec);
    this.data.activeProfile = DEFAULT_PROFILE;
    this.data.profiles[DEFAULT_PROFILE] = defaultsCal(this.spec);
    this.save();
    return this.data.calibration;
  }

  /* ---------------- perfiles ---------------- */
  listProfiles() {
    return Object.keys(this.data.profiles).sort((a, b) => a.localeCompare(b, 'es'));
  }

  activeProfile() { return this.data.activeProfile; }

  saveProfile(name, values) {
    const n = cleanName(name);
    if (!n) return { ok: false, error: 'nombre vacio' };
    if (Object.keys(this.data.profiles).length >= MAX_PROFILES && !this.data.profiles[n]) {
      return { ok: false, error: 'demasiados perfiles' };
    }
    const base = values ? sanitizeCal(this.spec, values) : this.data.calibration;
    this.data.profiles[n] = Object.assign(defaultsCal(this.spec), base);
    this.data.activeProfile = n;
    this.data.calibration = Object.assign({}, this.data.profiles[n]);
    this.save();
    return { ok: true, name: n };
  }

  loadProfile(name) {
    const n = cleanName(name);
    const p = this.data.profiles[n];
    if (!p) return { ok: false, error: 'perfil inexistente' };
    this.data.activeProfile = n;
    this.data.calibration = Object.assign({}, p);
    this.save();
    return { ok: true, name: n, values: this.calibration() };
  }

  renameProfile(from, to) {
    const a = cleanName(from), b = cleanName(to);
    if (!a || !b) return { ok: false, error: 'nombre invalido' };
    if (!this.data.profiles[a]) return { ok: false, error: 'perfil inexistente' };
    if (a === DEFAULT_PROFILE) return { ok: false, error: 'el perfil predeterminado no se renombra' };
    if (this.data.profiles[b] && b !== a) return { ok: false, error: 'ya existe ese nombre' };
    this.data.profiles[b] = this.data.profiles[a];
    delete this.data.profiles[a];
    if (this.data.activeProfile === a) this.data.activeProfile = b;
    this.save();
    return { ok: true, name: b };
  }

  duplicateProfile(from, to) {
    const a = cleanName(from), b = cleanName(to);
    if (!a || !b) return { ok: false, error: 'nombre invalido' };
    if (!this.data.profiles[a]) return { ok: false, error: 'perfil inexistente' };
    if (this.data.profiles[b]) return { ok: false, error: 'ya existe ese nombre' };
    if (Object.keys(this.data.profiles).length >= MAX_PROFILES) return { ok: false, error: 'demasiados perfiles' };
    this.data.profiles[b] = Object.assign({}, this.data.profiles[a]);
    this.save();
    return { ok: true, name: b };
  }

  deleteProfile(name) {
    const n = cleanName(name);
    if (n === DEFAULT_PROFILE) return { ok: false, error: 'el perfil predeterminado no se elimina' };
    if (!this.data.profiles[n]) return { ok: false, error: 'perfil inexistente' };
    delete this.data.profiles[n];
    if (this.data.activeProfile === n) {
      this.data.activeProfile = DEFAULT_PROFILE;
      this.data.calibration = Object.assign({}, this.data.profiles[DEFAULT_PROFILE]);
    }
    this.save();
    return { ok: true };
  }

  /* ---------------- seguridad ---------------- */
  flags() { return Object.assign({}, this.data.flags); }

  setFlag(name, value) {
    if (name === 'expo' || name === 'lock') {
      this.data.flags[name] = !!value;
      this.save();
    } else if (name === 'expoDevice') {
      this.data.flags.expoDevice = value == null ? null : String(value).toLowerCase();
      this.save();
    }
    return this.flags();
  }

  devices() { return this.data.devices.slice(); }

  findDevice(id) {
    const key = String(id || '').toLowerCase();
    return this.data.devices.find((d) => d.id === key) || null;
  }

  upsertDevice(dev) {
    const clean = cleanDevice(dev);
    if (!clean) return null;
    const i = this.data.devices.findIndex((d) => d.id === clean.id);
    if (i >= 0) this.data.devices[i] = Object.assign({}, this.data.devices[i], clean);
    else this.data.devices.push(clean);
    this.save();
    return clean;
  }

  touchDevice(id) {
    const d = this.findDevice(id);
    if (d) { d.lastSeen = Date.now(); this.save(); }
  }

  removeDevice(id) {
    const key = String(id || '').toLowerCase();
    const before = this.data.devices.length;
    this.data.devices = this.data.devices.filter((d) => d.id !== key);
    this.save();
    return this.data.devices.length !== before;
  }

  clearDevices() {
    this.data.devices = [];
    this.save();
  }

  adminPinHash() { return this.data.admin.pinHash; }

  setAdminPinHash(hash) {
    this.data.admin.pinHash = hash || null;
    this.save();
  }

  addLog(entry) {
    this.data.log.push(entry);
    if (this.data.log.length > MAX_LOG) this.data.log = this.data.log.slice(-MAX_LOG);
    this.save();
  }

  log() { return this.data.log.slice(); }
}

module.exports = { Store, DEFAULT_PROFILE, cleanName };
