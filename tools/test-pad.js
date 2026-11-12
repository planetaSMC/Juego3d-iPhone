/*
 * Prueba el mando nativo GameController y el modo VR en un iPhone simulado.
 *
 *   node tools/test-pad.js [--port 8168] [--shots docs/evidencias] [--keep]
 *
 * El navegador se abre con ventana de iPhone horizontal (844x390), DPR 1 y
 * emulacion tactil, y se inyecta __RASMATIC_NATIVE__ antes de cargar la
 * pagina, exactamente como GameViewController.swift con WKUserScript. Asi se
 * ejercita RasmaticNativeGamepad (el puente que usa la app) y no la Gamepad
 * API de Safari.
 *
 * NO sustituye una prueba con iPhone, mando Bluetooth real, GameController de
 * iOS ni VR Box fisicas: ver docs/pruebas.md.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const suitePath = path.join(__dirname, 'test-pad-suite.js');

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const port = Number(argValue('--port', 8168));
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

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rasmatic-pad-'));
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
    '--window-size=844,390',
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

    /* El marcador que inyecta GameViewController.swift antes de la pagina. */
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: "window.__RASMATIC_NATIVE__ = { app: true, gamepad: true, version: '1.0' };"
    });

    await cdp.send('Emulation.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
        'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      platform: 'iPhone'
    });

    async function layout(width, height) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width, height, deviceScaleFactor: 1, mobile: true,
        screenWidth: width, screenHeight: height
      });
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await sleep(700);
    }

    await layout(844, 390);

    const base = 'http://127.0.0.1:' + port + '/index.html';
    const url = base + '?vr=0';

    async function evaluate(expr) {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      return r.result && r.result.value;
    }

    async function shot(name) {
      const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const file = path.join(shotsDir, name);
      fs.mkdirSync(shotsDir, { recursive: true });
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      console.log('  captura: ' + path.relative(root, file));
    }

    async function boot(label) {
      await waitFor(async () => evaluate(
        'window.__ready === true && !!window.RasmaticGame && !!window.RasmaticNativeGamepad && !!window.RasmaticVR'
      ), 60000, label);
      await sleep(800);
    }

    await cdp.send('Page.navigate', { url });
    console.log('Esperando la escena...');
    await boot('window.__ready + RasmaticNativeGamepad');

    console.log('Ejecutando la suite de mando y VR movil...\n');
    const expression = fs.readFileSync(suitePath, 'utf8');
    const evaluated = await cdp.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true, timeout: 300000
    });

    if (evaluated.exceptionDetails) {
      throw new Error('la suite de mando lanzo una excepcion: ' +
        (evaluated.exceptionDetails.exception && evaluated.exceptionDetails.exception.description));
    }

    const report = JSON.parse(evaluated.result.value);
    for (const item of report.out) {
      console.log((item.pass ? '  ok   ' : '  FAIL ') + item.name);
      if (item.data !== undefined) console.log('        ' + JSON.stringify(item.data));
    }
    console.log('\n' + (report.total - report.fails) + '/' + report.total + ' casos superados.');
    if (report.fails > 0) exitCode = 1;

    /* ---------------- Evidencias ---------------- */
    console.log('\nEvidencias:');
    await evaluate("window.RasmaticNativeGamepad.status(true, 'DualSense Wireless')");
    await sleep(500);
    await shot('pad-01-mando-nativo.png');

    await evaluate('window.RasmaticVR.enable(); window.RasmaticVR.panel(false);');
    await sleep(1000);
    await shot('pad-02-vr-iphone.png');
    await evaluate('window.RasmaticVR.disable()');
    await sleep(300);

    /* ---------------- Aviso de rotacion (vertical) ---------------- */
    console.log('\nAviso de orientacion:');
    await layout(390, 844);
    await evaluate('window.RasmaticVR.enable(); window.RasmaticVR.panel(false);');
    await sleep(800);
    const rot = await evaluate(`(function () {
      var s = window.RasmaticVR.state();
      var el = document.getElementById('vr-rotate');
      return {
        landscape: s.landscape,
        warning: s.rotateWarning,
        shown: !!el && getComputedStyle(el).display !== 'none'
      };
    })()`);
    await shot('pad-03-girar-iphone.png');
    await evaluate("document.getElementById('vr-rotate-ok').click()");
    await sleep(300);
    const dismissed = await evaluate('window.RasmaticVR.state().rotateWarning');
    const rotOk = rot && rot.landscape === false && rot.warning === true &&
      rot.shown === true && dismissed === false;
    console.log((rotOk ? '  ok   ' : '  FAIL ') +
      'en vertical avisa y se puede continuar igual');
    if (!rotOk) exitCode = 1;
    await evaluate('window.RasmaticVR.disable()');

    await layout(844, 390);

    /* ---------------- Menu de pausa en iOS ---------------- */
    console.log('\nMenu de pausa en la app iOS:');
    await cdp.send('Page.navigate', { url });
    await boot('recarga para el menu de pausa');
    await evaluate("window.RasmaticNativeGamepad.status(true, 'Mando Prueba')");
    await sleep(200);
    /* El menu de pausa no forma parte de la partida (el juego lo bloquea a
       proposito); X abre el panel VR. Se comprueba su marcado y la regla
       html.ras-ios que lo hace visible si algun dia se abre. */
    await evaluate(`(function () {
      var p = document.getElementById('ras-pause');
      if (!p) return false;
      p.hidden = false;
      document.body.classList.add('ras-paused');
      return true;
    })()`);
    await sleep(300);
    const pause = await evaluate(`(function () {
      var p = document.getElementById('ras-pause');
      var exit = p && p.querySelector('[data-act="exit"]');
      return {
        open: !!p && !p.hidden && document.body.classList.contains('ras-paused'),
        display: p ? getComputedStyle(p).display : 'sin-menu',
        vr: !!(p && p.querySelector('[data-act="vr"]')),
        exit: exit ? getComputedStyle(exit).display : 'sin-boton'
      };
    })()`);
    const pauseOk = pause && pause.open === true && pause.display === 'flex' &&
      pause.vr === true && pause.exit === 'none';
    console.log((pauseOk ? '  ok   ' : '  FAIL ') +
      'el menu de pausa se ve en iOS, tiene VR BOX y no muestra "Salir"');
    console.log('        ' + JSON.stringify(pause));
    if (!pauseOk) exitCode = 1;
    await evaluate(`(function () {
      var p = document.getElementById('ras-pause');
      p.hidden = true;
      document.body.classList.remove('ras-paused');
      return true;
    })()`);
    await sleep(250);
    const pauseClosed = await evaluate("document.body.classList.contains('ras-paused') === false");
    console.log((pauseClosed ? '  ok   ' : '  FAIL ') + 'se oculta de nuevo sin tocar la partida');
    if (!pauseClosed) exitCode = 1;
    await evaluate("window.RasmaticNativeGamepad.status(false, '')");

    /* ---------------- Acceso directo ?vr=1 ---------------- */
    console.log('\nAcceso directo con ?vr=1:');
    await cdp.send('Page.navigate', { url: base + '?vr=1' });
    await boot('recarga ?vr=1');
    const autoOn = await evaluate(
      'window.RasmaticVR.isActive() === true && ' +
      'document.body.classList.contains("vr-on") && ' +
      'window.RasmaticVR.state().mobile === true'
    );
    console.log((autoOn ? '  ok   ' : '  FAIL ') + 'el modo VR arranca solo en el telefono');
    if (!autoOn) exitCode = 1;

    if (consoleErrors.length) {
      console.log('\nErrores de consola (' + consoleErrors.length + '):');
      for (const e of consoleErrors.slice(0, 20)) console.log('  ! ' + e.split('\n')[0]);
      exitCode = 1;
    } else {
      console.log('\nConsola sin errores.');
    }
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
  console.error('\n[test-pad] ' + err.message);
  process.exit(1);
});
