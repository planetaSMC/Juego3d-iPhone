/*
 * V20 · Ejecuta la suite RASMATIC VR en Chromium (iPhone simulado).
 *
 *   node tools/test-v20.js [--port 8140] [--shots docs/evidencias/v20] [--keep]
 *
 * Comprueba identidad de app única, escena de farmacia, colisiones, tres
 * modos, dificultades, joystick opcional, entrada externa, Head Tracking y el
 * puente de configuración que usa Windows. No sustituye una prueba en iPhone
 * real: ver docs/v20/limitations.md.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const suitePath = path.join(__dirname, 'test-v20-suite.js');

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const port = Number(argValue('--port', 8140));
const debugPort = port + 1000;
const webRoot = path.resolve(argValue('--root', path.join(root, 'web')));
const shotsDir = path.resolve(argValue('--shots', path.join(root, 'docs', 'evidencias', 'v20')));
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
    try { const v = await fn(); if (v) return v; } catch (e) { /* reintento */ }
    if (Date.now() - start > timeoutMs) throw new Error('timeout esperando ' + label);
    await sleep(200);
  }
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const p = this.pending.get(m.id); this.pending.delete(m.id);
        if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
      } else if (m.method) {
        for (const fn of this.handlers.get(m.method) || []) fn(m.params);
      }
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', () => rej(new Error('no se pudo abrir CDP')), { once: true });
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rasmatic-v20-'));
  const server = spawn(process.execPath,
    [path.join(__dirname, 'serve.js'), '--port', String(port), '--root', webRoot, '--quiet'],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  const browser = spawn(browserPath, [
    '--headless=new', '--remote-debugging-port=' + debugPort,
    '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--mute-audio', '--hide-scrollbars',
    '--window-size=390,844', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    'about:blank'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let cdp = null;
  let exitCode = 0;
  try {
    await waitFor(async () => (await fetch('http://127.0.0.1:' + port + '/index.html')).ok,
      15000, 'servidor');
    const target = await waitFor(async () => {
      const list = await (await fetch('http://127.0.0.1:' + debugPort + '/json/list')).json();
      return list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    }, 20000, 'navegador');
    cdp = await CDP.connect(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    const errors = [];
    cdp.on('Runtime.exceptionThrown', (p) => {
      errors.push((p.exceptionDetails.exception && p.exceptionDetails.exception.description) ||
        p.exceptionDetails.text);
    });
    cdp.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error') {
        errors.push(p.args.map((a) => a.value || a.description || '').join(' '));
      }
    });
    cdp.on('Log.entryAdded', (p) => { if (p.entry.level === 'error') errors.push(p.entry.text); });

    const url = 'http://127.0.0.1:' + port + '/index.html';
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
      screenWidth: 390, screenHeight: 844
    });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cdp.send('Page.navigate', { url });
    console.log('Esperando la escena de farmacia...');
    await waitFor(async () => {
      const r = await cdp.send('Runtime.evaluate', {
        expression: 'window.__ready === true && !!window.RasmaticGame && !!window.RasmaticPharmacyApi',
        returnByValue: true
      });
      return r.result.value === true;
    }, 90000, 'escena V20');

    console.log('Ejecutando la suite V20...');
    const suite = fs.readFileSync(suitePath, 'utf8');
    const evaluated = await cdp.send('Runtime.evaluate', {
      expression: suite, awaitPromise: true, returnByValue: true, timeout: 300000
    });
    if (evaluated.exceptionDetails) {
      throw new Error('la suite V20 lanzo una excepcion: ' +
        (evaluated.exceptionDetails.exception && evaluated.exceptionDetails.exception.description));
    }
    const report = JSON.parse(evaluated.result.value);
    for (const item of report.out) {
      console.log((item.pass ? '  ok   ' : '  FAIL ') + item.name);
      if (item.data !== undefined) console.log('        ' + JSON.stringify(item.data));
    }
    console.log('\n' + (report.total - report.fails) + '/' + report.total + ' casos superados.');
    if (report.fails) exitCode = 1;

    /* Evidencias de los tres modos y del panel de Head Tracking. */
    fs.mkdirSync(shotsDir, { recursive: true });
    const shot = async (name) => {
      const data = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const file = path.join(shotsDir, name);
      fs.writeFileSync(file, Buffer.from(data.data, 'base64'));
      console.log('  captura: ' + path.relative(root, file));
    };
    const evaluate = async (expression) => {
      const r = await cdp.send('Runtime.evaluate', {
        expression, returnByValue: true, awaitPromise: true, timeout: 120000
      });
      if (r.exceptionDetails) throw new Error('evaluate: ' + r.exceptionDetails.text);
      return r.result && r.result.value;
    };
    console.log('\nEvidencias:');
    await cdp.send('Page.navigate', { url });
    await waitFor(async () => evaluate('window.__ready === true'), 60000, 'recarga');
    await sleep(1500);
    await shot('v20-place.png');
    await evaluate(`(function(){window.RasmaticCore.setMode('film');return true;})()`);
    await sleep(1400);
    await shot('v20-film.png');
    await evaluate(`(function(){window.RasmaticCore.setMode('model');return true;})()`);
    await sleep(1400);
    await shot('v20-model.png');
    await evaluate(`(function(){
      window.RasmaticCore.setMode('place');
      window.RasmaticVR.panel(true);
      var tab = document.querySelector('#vr-tabs [data-tab="ht"]');
      if (tab) tab.click();
      return true;
    })()`);
    await sleep(900);
    await shot('v20-headtracking-panel.png');

    console.log('\nConsola: ' + (errors.length ? errors.length + ' errores' : 'sin errores'));
    if (errors.length) {
      for (const e of errors) console.log('  ' + e);
      exitCode = 1;
    }
  } finally {
    if (cdp) cdp.close();
    if (!keep) {
      try { browser.kill(); } catch (e) { /* nada */ }
      try { server.kill(); } catch (e) { /* nada */ }
      await sleep(400);
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* nada */ }
    } else {
      console.log('\nNavegador y servidor siguen abiertos (--keep).');
    }
  }
  process.exit(exitCode);
}

main().catch((e) => {
  console.error('\n[test-v20] ' + e.message);
  process.exit(1);
});
