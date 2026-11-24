'use strict';

/* ============================================================
   RASMATIC · VR Calibrator (Electron, proceso principal)
   ------------------------------------------------------------
   - Estado autoritativo en el proceso principal.
   - HTTP local solo loopback para la app y la vista previa.
   - WebSocket LAN para el iPhone.
   - IPC estrecho con el renderer (sin Node en la UI).
   ============================================================ */

const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const QRCode = require('qrcode');

const { Store } = require('../server/store');
const { loadSpec, defaultsCal } = require('../server/vr-spec');
const { createHttpServer } = require('../server/http');
const { VRLink } = require('../server/vrlink');

const SMOKE = process.argv.includes('--smoke');
const DEV = process.argv.includes('--dev');
const DEFAULT_PORT = 8737;
const PORT_TRIES = 12;

/* El smoke test usa un userData limpio para no tocar la configuracion real. */
if (SMOKE) {
  app.setPath('userData', path.join(os.tmpdir(), 'rasmatic-vr-smoke-' + process.pid));
}

const S = {
  win: null,
  http: null,
  link: null,
  store: null,
  spec: null,
  port: 0,
  gameRoot: '',
  rendererRoot: '',
  pairingQr: '',
  startedAt: Date.now()
};

function gameRootPath() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'game');
  return path.resolve(__dirname, '..', '..', 'web');
}

function rendererRootPath() {
  return path.resolve(__dirname, '..', 'renderer');
}

function hostAddresses() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const n of nets[name] || []) {
      const family = typeof n.family === 'string' ? n.family : (n.family === 4 ? 'IPv4' : 'IPv6');
      if (family !== 'IPv4' || n.internal) continue;
      if (/^169\.254\./.test(n.address)) continue;
      out.push({ name: name, address: n.address });
    }
  }
  out.sort((a, b) => a.address.localeCompare(b.address));
  return out;
}

function primaryHost() {
  const hosts = hostAddresses();
  return hosts.length ? hosts[0].address : '127.0.0.1';
}

function sendEvent(ev) {
  if (!S.win || S.win.isDestroyed()) return;
  try { S.win.webContents.send('calibrator:event', ev); } catch (e) { /* ventana cerrada */ }
}

function info() {
  return {
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    port: S.port,
    hosts: hostAddresses(),
    primaryHost: primaryHost(),
    spec: S.spec,
    status: S.link ? S.link.status() : null,
    pairingQr: S.pairingQr,
    userData: app.getPath('userData'),
    startedAt: S.startedAt,
    dev: DEV
  };
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.removeListener('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      resolve(port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '0.0.0.0');
  });
}

async function startServer() {
  S.gameRoot = gameRootPath();
  S.rendererRoot = rendererRootPath();
  S.spec = loadSpec(S.gameRoot);
  S.store = new Store(path.join(app.getPath('userData'), 'state.json'), S.spec);
  S.store.load();

  S.http = createHttpServer({ gameRoot: S.gameRoot, rendererRoot: S.rendererRoot, spec: S.spec });
  let lastErr = null;
  for (let i = 0; i < PORT_TRIES; i++) {
    const port = DEFAULT_PORT + i;
    try {
      await listen(S.http, port);
      S.port = port;
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      if (e.code !== 'EADDRINUSE') break;
    }
  }
  if (!S.port) throw lastErr || new Error('No hay puerto disponible');

  S.link = new VRLink({
    httpServer: S.http,
    store: S.store,
    spec: S.spec,
    onEvent: (ev) => {
      if (ev.type === 'status') sendEvent({ type: 'status', status: ev.status });
      else if (ev.type === 'calibration') {
        sendEvent({ type: 'calibration', rev: ev.rev, origin: ev.origin, values: ev.values, calibration: ev.calibration });
      } else if (ev.type === 'telemetry') {
        sendEvent({ type: 'telemetry', telemetry: ev.telemetry });
      }
    }
  }).attach();

  return S.port;
}

async function requireAdmin(pin) {
  const r = await S.link.security.verifyPin(pin);
  if (r.ok) return { ok: true, configured: r.configured };
  const msg = r.code === 'pin_locked' ? 'Demasiados intentos. Esperá unos minutos.'
    : 'PIN de administración incorrecto';
  return { ok: false, code: r.code, msg: msg };
}

async function newPairing() {
  const r = S.link.newPairing();
  if (!r.ok) {
    const msg = r.code === 'expo' ? 'Modo Expo: las vinculaciones están bloqueadas'
      : r.code === 'slow_down' ? 'Esperá un segundo antes de generar otro código'
        : 'No se pudo generar el código';
    return { ok: false, code: r.code, msg: msg };
  }
  const host = primaryHost();
  const uri = 'rasmatic://pair?h=' + encodeURIComponent(host) + '&p=' + S.port + '&c=' + r.code;
  try {
    S.pairingQr = await QRCode.toDataURL(uri, { margin: 1, width: 220, color: { dark: '#04101f', light: '#eaf5ff' } });
  } catch (e) { S.pairingQr = ''; }
  return { ok: true, code: r.code, expiresAt: r.expiresAt, host: host, port: S.port, qr: S.pairingQr, uri: uri };
}

function registerIpc() {
  ipcMain.handle('app:info', () => info());

  const lockedError = () => ({ ok: false, code: 'locked', msg: 'Calibración bloqueada desde la PC' });

  ipcMain.handle('cal:set', (e, payload) => {
    if (!payload || typeof payload !== 'object') return { ok: false, code: 'bad_request' };
    return S.link.applyFromWindows(payload.values, 'windows');
  });
  ipcMain.handle('cal:reset', () => S.link.resetCalibration('windows'));
  ipcMain.handle('cal:resetKey', (e, key) => {
    if (!key || !Object.prototype.hasOwnProperty.call(S.spec.defaults, key)) {
      return { ok: false, code: 'bad_key' };
    }
    const v = {};
    v[key] = S.spec.defaults[key];
    return S.link.applyFromWindows(v, 'windows');
  });
  ipcMain.handle('cal:resetGroup', (e, p) => {
    const group = p && p.group;
    if (typeof group !== 'string') return { ok: false, code: 'bad_request' };
    const g = S.spec.groups[group];
    if (!g || !Array.isArray(g.keys) || !g.keys.length) return { ok: false, code: 'bad_group' };
    const defs = defaultsCal(S.spec);
    const values = {};
    for (const k of g.keys) {
      if (Object.prototype.hasOwnProperty.call(defs, k)) values[k] = defs[k];
    }
    return S.link.applyFromWindows(values, 'windows');
  });

  ipcMain.handle('profiles:list', () => ({
    ok: true,
    profiles: S.store.listProfiles(),
    active: S.store.activeProfile()
  }));
  ipcMain.handle('profiles:save', (e, p) => {
    if (!p || typeof p !== 'object') return { ok: false, code: 'bad_request' };
    if (S.store.flags().lock) return lockedError();
    const r = S.store.saveProfile(p.name, p.values || S.store.calibration());
    if (r.ok) {
      S.link.rev++;
      S.link.broadcastCal(S.store.calibration(), 'windows', null);
      S.link.notifyCalibration(S.store.calibration(), 'windows');
    }
    return r;
  });
  ipcMain.handle('profiles:load', (e, p) => {
    if (S.store.flags().lock) return lockedError();
    const r = S.store.loadProfile(p && p.name);
    if (!r.ok) return r;
    S.link.rev++;
    S.link.broadcastCal(r.values, 'windows', null);
    S.link.notifyCalibration(r.values, 'windows');
    return r;
  });
  ipcMain.handle('profiles:rename', (e, p) => S.store.renameProfile(p && p.from, p && p.to));
  ipcMain.handle('profiles:duplicate', (e, p) => S.store.duplicateProfile(p && p.from, p && p.to));
  ipcMain.handle('profiles:delete', (e, p) => {
    if (S.store.flags().lock) return lockedError();
    const r = S.store.deleteProfile(p && p.name);
    if (r.ok) {
      S.link.rev++;
      S.link.broadcastCal(S.store.calibration(), 'windows', null);
      S.link.notifyCalibration(S.store.calibration(), 'windows');
    }
    return r;
  });
  ipcMain.handle('profiles:default', () => S.link.resetCalibration('windows'));

  ipcMain.handle('security:status', () => ({ ok: true, status: S.link.status() }));
  ipcMain.handle('security:expo', async (e, p) => {
    const a = await requireAdmin(p && p.pin);
    if (!a.ok) return a;
    return S.link.setExpo(!!(p && p.on));
  });
  ipcMain.handle('security:expoDevice', async (e, p) => {
    const a = await requireAdmin(p && p.pin);
    if (!a.ok) return a;
    return S.link.setExpoDevice(p && p.id);
  });
  ipcMain.handle('security:lock', async (e, p) => {
    const locked = !!(p && p.locked);
    if (!locked) {
      const a = await requireAdmin(p && p.pin);
      if (!a.ok) return a;
    }
    return S.link.setLock(locked);
  });
  ipcMain.handle('security:pairing:new', async (e, p) => {
    const a = await requireAdmin(p && p.pin);
    if (!a.ok) return a;
    return newPairing();
  });
  ipcMain.handle('security:pairing:cancel', () => {
    S.pairingQr = '';
    return S.link.cancelPairing();
  });
  ipcMain.handle('security:revoke', async (e, p) => {
    const a = await requireAdmin(p && p.pin);
    if (!a.ok) return a;
    return S.link.revokeDevice(p && p.id);
  });
  ipcMain.handle('security:closeSessions', async (e, p) => {
    const a = await requireAdmin(p && p.pin);
    if (!a.ok) return a;
    return S.link.closeSessions();
  });
  ipcMain.handle('security:setPin', async (e, p) => S.link.security.setPin(p && p.current, p && p.next));
  ipcMain.handle('security:clearPin', async (e, p) => {
    const a = await requireAdmin(p && p.pin);
    if (!a.ok) return a;
    return S.link.security.clearPin(p && p.pin);
  });
  ipcMain.handle('security:verifyPin', async (e, p) => {
    const r = await S.link.security.verifyPin(p && p.pin);
    return r;
  });
  ipcMain.handle('security:restore', async (e, p) => {
    const a = await requireAdmin(p && p.pin);
    if (!a.ok) return a;
    return S.link.resetCalibration('windows', true);
  });

  ipcMain.handle('window:fullscreen', (e, p) => {
    if (!S.win) return { ok: false };
    const on = !!(p && p.on);
    S.win.setFullScreen(on);
    return { ok: true, fullscreen: S.win.isFullScreen() };
  });
  ipcMain.handle('window:capture', async () => {
    if (!S.win) return { ok: false };
    try {
      const img = await S.win.webContents.capturePage();
      const dir = app.getPath('pictures');
      const file = path.join(dir, 'RASMATIC-VR-' + new Date().toISOString().replace(/[:.]/g, '-') + '.png');
      fs.writeFileSync(file, img.toPNG());
      return { ok: true, file: file };
    } catch (e) {
      return { ok: false, code: 'capture' };
    }
  });
  ipcMain.handle('app:openDataFolder', () => {
    shell.openPath(app.getPath('userData'));
    return { ok: true };
  });
  ipcMain.handle('app:quit', () => { app.quit(); return { ok: true }; });
}

function createWindow() {
  const icon = path.join(__dirname, '..', 'build', 'icon.ico');
  S.win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1060,
    minHeight: 660,
    show: false,
    backgroundColor: '#050d1a',
    title: 'RASMATIC · VR Calibrator',
    icon: fs.existsSync(icon) ? icon : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: DEV || SMOKE,
      spellcheck: false,
      backgroundThrottling: true
    }
  });
  S.win.setMenuBarVisibility(false);

  const base = 'http://127.0.0.1:' + S.port + '/';
  S.win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  S.win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(base)) e.preventDefault();
  });
  S.win.webContents.session.setPermissionRequestHandler((wc, permission, cb) => cb(false));
  S.win.webContents.session.setPermissionCheckHandler(() => false);

  S.win.once('ready-to-show', () => { S.win.show(); });
  S.win.on('enter-full-screen', () => sendEvent({ type: 'fullscreen', on: true }));
  S.win.on('leave-full-screen', () => sendEvent({ type: 'fullscreen', on: false }));
  S.win.on('close', () => { if (S.store) S.store.flush(); });
  S.win.on('closed', () => { S.win = null; });

  S.win.loadURL(base + (SMOKE ? '?smoke=1' : ''));
  if (SMOKE) {
    S.win.webContents.once('did-finish-load', () => setTimeout(runSmoke, 900));
  }
  if (DEV) S.win.webContents.openDevTools({ mode: 'detach' });
}

/* ---------------- smoke test real de la app ---------------- */
async function runSmoke() {
  const timeout = setTimeout(() => {
    console.log('SMOKE_FAIL: timeout');
    app.exit(1);
  }, 60000);
  try {
    const checks = [];
    const js = (code) => S.win.webContents.executeJavaScript(code, true);
    await new Promise((resolve) => {
      if (S.win.webContents.isLoading()) S.win.webContents.once('did-finish-load', resolve);
      else resolve();
    });
    checks.push(['app cargada', await js("!!document.querySelector('#game')")]);
    checks.push(['spec con claves', await js("!!(window.calibrator && window.calibrator.info)")]);
    const ready = await js(`new Promise(function (resolve) {
      var t0 = Date.now();
      (function wait() {
        var f = document.getElementById('game');
        try {
          if (f && f.contentWindow && f.contentWindow.RasmaticVR && f.contentWindow.RasmaticVR.isMono()) return resolve(true);
        } catch (e) {}
        if (Date.now() - t0 > 25000) return resolve(false);
        setTimeout(wait, 200);
      })();
    })`);
    checks.push(['juego cargado y vista central activa', ready]);
    const info = await js('window.calibrator.info()');
    checks.push(['spec recibida', !!(info && info.spec && info.spec.keys && info.spec.keys.length >= 20)]);
    checks.push(['servidor en puerto', !!(info && info.port > 0)]);
    const sliders = await js("document.querySelectorAll('input[type=range][data-key]').length");
    checks.push(['sliders reales', sliders >= 20]);
    const view = await js(`(function(){
      var f = document.getElementById('game');
      f.contentWindow.RasmaticVR.setView('sbs');
      var a = f.contentWindow.RasmaticVR.view();
      f.contentWindow.RasmaticVR.setView('center');
      var b = f.contentWindow.RasmaticVR.view();
      return a === 'sbs' && b === 'center';
    })()`);
    checks.push(['vistas de diagnóstico', view]);
    const pair = await js('window.calibrator.invoke("security:pairing:new")');
    checks.push(['código de emparejamiento', !!(pair && pair.ok && /^\d{6}$/.test(pair.code))]);
    const profile = await js('window.calibrator.invoke("profiles:save", { name: "SMOKE", values: { ipd: 66 } })');
    checks.push(['guardar perfil', !!(profile && profile.ok)]);
    const load = await js('window.calibrator.invoke("profiles:load", { name: "SMOKE" })');
    checks.push(['cargar perfil', !!(load && load.ok)]);
    await js('window.calibrator.invoke("profiles:delete", { name: "SMOKE" })');
    const lock = await js('window.calibrator.invoke("security:lock", { locked: true })');
    checks.push(['bloqueo de calibración', !!(lock && lock.ok && lock.lock === true)]);
    const unlock = await js('window.calibrator.invoke("security:lock", { locked: false })');
    checks.push(['desbloqueo sin PIN', !!(unlock && unlock.ok)]);
    const bad = await js('window.calibrator.invoke("cal:set", { values: { ipd: 999 } })');
    checks.push(['valor fuera de rango rechazado', !!(bad && bad.ok === false)]);
    const ok = await js('window.calibrator.invoke("cal:set", { values: { ipd: 64 } })');
    checks.push(['valor válido aplicado', !!(ok && ok.ok === true)]);

    let fail = 0;
    for (const [name, pass] of checks) {
      console.log((pass ? 'SMOKE_OK ' : 'SMOKE_FAIL ') + name);
      if (!pass) fail++;
    }
    clearTimeout(timeout);
    if (fail) { app.exit(1); return; }
    console.log('SMOKE_RESULT PASS ' + checks.length);
    app.exit(0);
  } catch (e) {
    clearTimeout(timeout);
    console.log('SMOKE_FAIL: ' + (e && e.message ? e.message : e));
    app.exit(1);
  }
}

/* ---------------- ciclo de vida ---------------- */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (S.win) { if (S.win.isMinimized()) S.win.restore(); S.win.focus(); }
  });

  app.commandLine.appendSwitch('force-color-profile', 'srgb');
  app.setAppUserModelId('com.rasmatic.vrcalibrator');

  app.whenReady().then(async () => {
    try {
      await startServer();
      registerIpc();
      createWindow();
    } catch (e) {
      console.error('[main] no se pudo iniciar: ' + (e && e.message ? e.message : e));
      app.exit(1);
    }
  });

  app.on('before-quit', () => {
    if (S.store) S.store.flush();
    if (S.link) S.link.close();
    if (S.http) { try { S.http.close(); } catch (e) { /* nada */ } }
  });

  app.on('window-all-closed', () => app.quit());
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && S.port) createWindow();
  });
}
