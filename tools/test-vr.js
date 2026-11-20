/*
 * Prueba el modo VR BOX PREVIEW en un navegador Chromium real, con ventana
 * de escritorio (1280x720, DPR 1, sin emulacion tactil).
 *
 *   node tools/test-vr.js [--port 8138] [--shots docs/evidencias] [--keep]
 *
 * Comprueba: activar/desactivar, dos camaras con parallax real, IPD,
 * convergencia, perfiles de pantalla, tamano/separacion, distorsion,
 * controles de Windows (WASD, Shift, Espacio, Escape, mouse) y que el juego
 * normal siga funcionando despues de salir de VR.
 *
 * NO sustituye una prueba con iPhone, VR Box fisicas ni Safari: ver
 * docs/vr-box-preview.md y docs/pruebas.md.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const suitePath = path.join(__dirname, 'test-vr-suite.js');

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const port = Number(argValue('--port', 8138));
const debugPort = port + 1000;
const shotsDir = argValue('--shots', path.join(root, 'docs', 'evidencias'));
const keep = process.argv.includes('--keep');

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium'
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error('No se encontro Chrome/Edge. Define CHROME_PATH.');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeoutMs, label) {
  const start = Date.now();
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) { /* reintentar */ }
    if (Date.now() - start > timeoutMs) throw new Error('timeout esperando ' + label);
    await sleep(250);
  }
}

/* ---------------- CDP minimo ---------------- */
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.method + ': ' + msg.error.message));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.handlers.get(msg.method) || []) fn(msg.params);
      }
    });
  }

  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error('no se pudo conectar a ' + url)), { once: true });
    });
    return new CDP(ws);
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }

  close() { try { this.ws.close(); } catch (e) { /* nada */ } }
}

async function main() {
  const browserPath = findBrowser();
  const server = spawn(process.execPath, [path.join(__dirname, 'serve.js'), '--port', String(port), '--quiet'], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stderr.on('data', (d) => process.stderr.write('[serve] ' + d));

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rasmatic-vr-'));
  const args = [
    '--headless=new',
    '--remote-debugging-port=' + debugPort,
    '--user-data-dir=' + profile,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--mute-audio',
    '--hide-scrollbars',
    '--window-size=1280,720',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    'about:blank'
  ];

  let browser = null;
  let cdp = null;
  let exitCode = 0;

  try {
    await waitFor(async () => {
      const res = await fetch('http://127.0.0.1:' + port + '/index.html');
      return res.ok;
    }, 15000, 'el servidor local');

    browser = spawn(browserPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    browser.stderr.on('data', (d) => {
      const text = String(d);
      if (/ERROR|FATAL/i.test(text)) process.stderr.write('[chrome] ' + text);
    });

    const target = await waitFor(async () => {
      const list = await (await fetch('http://127.0.0.1:' + debugPort + '/json/list')).json();
      return list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    }, 20000, 'el navegador');

    cdp = await CDP.connect(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');

    const consoleErrors = [];
    cdp.on('Runtime.exceptionThrown', (p) => {
      const d = p.exceptionDetails;
      consoleErrors.push((d.exception && d.exception.description) || d.text);
    });
    cdp.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error') consoleErrors.push(p.args.map((a) => a.value || a.description || '').join(' '));
    });
    cdp.on('Log.entryAdded', (p) => {
      if (p.entry.level === 'error') consoleErrors.push(p.entry.text);
    });

    /* Escritorio, DPR 1: el render por software necesita pixeles acotados
       para que la partida avance a un ritmo utilizable. */
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 720, deviceScaleFactor: 1, mobile: false,
      screenWidth: 1280, screenHeight: 720
    });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });

    const base = 'http://127.0.0.1:' + port + '/index.html';
    const url = base + '?vr=0';

    async function evaluate(expr) {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      return r.result && r.result.value;
    }

    async function shot(name) {
      const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const file = path.join(shotsDir, name);
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      console.log('  captura: ' + path.relative(root, file));
    }

    await cdp.send('Page.navigate', { url });
    console.log('Esperando la escena...');
    await waitFor(async () => evaluate(
      'window.__ready === true && !!window.RasmaticGame && !!window.RasmaticVR'
    ), 60000, 'window.__ready + RasmaticVR');

    console.log('Ejecutando la suite VR (puede tardar ~1 min)...\n');
    const expression = fs.readFileSync(suitePath, 'utf8');
    const evaluated = await cdp.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true, timeout: 300000
    });

    if (evaluated.exceptionDetails) {
      throw new Error('la suite VR lanzo una excepcion: ' +
        (evaluated.exceptionDetails.exception && evaluated.exceptionDetails.exception.description));
    }

    const report = JSON.parse(evaluated.result.value);
    for (const item of report.out) {
      console.log((item.pass ? '  ok   ' : '  FAIL ') + item.name);
      if (item.data !== undefined) console.log('        ' + JSON.stringify(item.data));
    }
    console.log('\n' + (report.total - report.fails) + '/' + report.total + ' casos superados.');

    /* ---------------- Mouse (evento confiable de CDP) ---------------- */
    console.log('\nControl de camara con el mouse:');
    await evaluate(`(function(){
      var g = window.RasmaticCore.game;
      g.player.x = 0; g.player.z = 30; g.player.yaw = 0; g.player.pitch = 0;
      window.RasmaticVR.enable();
      return true;
    })()`);
    await sleep(900);
    const yaw0 = await evaluate('window.RasmaticCore.game.player.yaw');
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 480, y: 380, button: 'left', buttons: 1, clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 640, y: 380, button: 'left', buttons: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 380, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(500);
    const yaw1 = await evaluate('window.RasmaticCore.game.player.yaw');
    const mouseOk = Math.abs(yaw1 - yaw0) > 0.2;
    console.log((mouseOk ? '  ok   ' : '  FAIL ') + 'mouse gira la camara' +
      ' (yaw ' + Number(yaw0).toFixed(3) + ' -> ' + Number(yaw1).toFixed(3) + ')');
    if (!mouseOk) exitCode = 1;
    await evaluate('window.RasmaticVR.disable()');

    /* ---------------- Evidencias ---------------- */
    fs.mkdirSync(shotsDir, { recursive: true });
    console.log('\nEvidencias:');
    await cdp.send('Page.navigate', { url });
    await waitFor(async () => evaluate('window.__ready === true && !!window.RasmaticGame'), 60000, 'recarga');
    await sleep(1200);

    /* Partida en curso. La captura se toma en el centro del pasillo para que
       la vista sea simetrica y se pueda comparar plana vs. estereo. */
    await evaluate(`(function(){
      var g = window.RasmaticCore.game;
      g.player.x = 0; g.player.z = 24.6; g.player.yaw = 0; g.player.pitch = 0;
      return true;
    })()`);
    await waitFor(async () => (await evaluate('window.RasmaticGame.debug().ui.action')) === 'JUGAR', 20000, 'aviso JUGAR');
    await evaluate('window.RasmaticGame.interact()');
    await waitFor(async () => (await evaluate('window.RasmaticGame.debug().state')) === 'playing', 20000, 'partida');
    await waitFor(async () => (await evaluate('window.RasmaticGame.debug().customer')) === true, 60000, 'primer cliente');
    await evaluate(`(function(){
      var g = window.RasmaticCore.game;
      g.player.x = 0; g.player.z = -26; g.player.yaw = 0; g.player.pitch = 0;
      return true;
    })()`);
    await sleep(900);
    await shot('vr-01-normal.png');

    await evaluate('window.RasmaticVR.enable()');
    await sleep(900);
    await evaluate('window.RasmaticVR.panel(false)');
    await sleep(700);
    await shot('vr-02-vr-box.png');

    await evaluate(`(function(){
      var v = window.RasmaticVR;
      v.set('profile', 'iphone-15-landscape');
      v.set('guides', true);
      v.panel(false);
      return v.state().stage;
    })()`);
    await sleep(1200);
    await shot('vr-03-vr-iphone.png');

    await evaluate(`(function(){
      var v = window.RasmaticVR;
      v.set('guides', false);
      v.set('distortion', 0.2);
      return true;
    })()`);
    await sleep(1200);
    await shot('vr-04-distortion.png');

    await evaluate(`(function(){
      var v = window.RasmaticVR;
      v.set('distortion', 0);
      v.set('profile', 'iphone-15-portrait');
      v.set('guides', true);
      return true;
    })()`);
    await sleep(1200);
    await shot('vr-05-portrait.png');

    /* Panel de ajustes (el que se abre con V o con el boton VR BOX). */
    await evaluate(`(function(){
      var v = window.RasmaticVR;
      v.set('guides', false);
      v.set('profile', 'window');
      v.panel(true);
      return true;
    })()`);
    await sleep(1200);
    await shot('vr-06-panel.png');

    /* Modo prueba: cuadricula, centros de lente y referencias de simetria. */
    await evaluate(`(function(){
      var v = window.RasmaticVR;
      v.set('testMode', true);
      v.panel(false);
      return true;
    })()`);
    await sleep(1400);
    await shot('vr-07-test-mode.png');
    await evaluate(`(function(){
      var v = window.RasmaticVR;
      v.set('testMode', false);
      v.disable();
      return true;
    })()`);

    /* ---------------- Acceso directo ?vr=1 ---------------- */
    console.log('\nAcceso directo con ?vr=1:');
    await cdp.send('Page.navigate', { url: base + '?vr=1' });
    await waitFor(async () => evaluate('window.__ready === true && !!window.RasmaticVR'), 60000, 'recarga ?vr=1');
    await sleep(1200);
    const autoOn = await evaluate('window.RasmaticVR.isActive() === true && document.body.classList.contains("vr-on")');
    console.log((autoOn ? '  ok   ' : '  FAIL ') + 'el modo VR arranca solo con ?vr=1');
    if (!autoOn) exitCode = 1;

    if (consoleErrors.length) {
      console.log('\nErrores de consola (' + consoleErrors.length + '):');
      for (const e of consoleErrors.slice(0, 20)) console.log('  ! ' + e.split('\n')[0]);
      exitCode = 1;
    } else {
      console.log('\nConsola sin errores.');
    }

    if (report.fails > 0) exitCode = 1;
  } finally {
    if (cdp) cdp.close();
    if (browser) {
      if (keep) console.log('\nNavegador y servidor siguen abiertos (--keep).');
      else try { browser.kill(); } catch (e) { /* nada */ }
    }
    if (!keep) {
      try { server.kill(); } catch (e) { /* nada */ }
      await sleep(500);
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* nada */ }
    }
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error('\n[test-vr] ' + err.message);
  process.exit(1);
});
