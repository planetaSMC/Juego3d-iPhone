/*
 * Prueba V19 de las dos apps en Chromium:
 *
 *   node tools/test-v19.js [--port 8278] [--shots docs/evidencias/v19] [--keep]
 *
 * - Head Tracking con puente Core Motion simulado (raw/status/bind).
 * - Head Tracking con fallback DeviceOrientationEvent.
 * - Classic sin API de sensores.
 * - Joystick ACTIVADO/DESACTIVADO en las dos.
 * - Persistencia aislada entre rasmatic.* y rasmatic.classic.*.
 * - SBS, V18, mecánicas y mando Bluetooth.
 *
 * NO sustituye un iPhone real ni valida sensores físicos. Ver docs/v19-dos-apps.md.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const suitePath = path.join(__dirname, 'test-v19-suite.js');

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const port = Number(argValue('--port', 8278));
const debugPort = port + 1000;
const shotsDir = argValue('--shots', path.join(root, 'docs', 'evidencias', 'v19'));
const keep = process.argv.includes('--keep');
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

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
  const server = spawn(process.execPath, [path.join(__dirname, 'serve.js'),
    '--port', String(port), '--root', root, '--quiet'], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stderr.on('data', (d) => process.stderr.write('[serve] ' + d));

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rasmatic-v19-'));
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
    '--window-size=390,844',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    'about:blank'
  ];

  let browser = null;
  let cdp = null;
  let exitCode = 0;

  try {
    await waitFor(async () => {
      const res = await fetch('http://127.0.0.1:' + port + '/web/index.html');
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
      if (p.type === 'error') {
        consoleErrors.push(p.args.map((a) => a.value || a.description || '').join(' '));
      }
    });
    cdp.on('Log.entryAdded', (p) => {
      if (p.entry.level === 'error') consoleErrors.push(p.entry.text);
    });

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
      screenWidth: 390, screenHeight: 844
    });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cdp.send('Emulation.setUserAgentOverride', { userAgent: IPHONE_UA, platform: 'iPhone' });

    async function evaluate(expr, awaitPromise) {
      const r = await cdp.send('Runtime.evaluate', {
        expression: expr,
        awaitPromise: !!awaitPromise,
        returnByValue: true,
        timeout: 180000
      });
      if (r.exceptionDetails) {
        throw new Error('evaluate: ' +
          (r.exceptionDetails.exception && r.exceptionDetails.exception.description));
      }
      return r.result && r.result.value;
    }

    async function shot(name) {
      fs.mkdirSync(shotsDir, { recursive: true });
      const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const file = path.join(shotsDir, name);
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      console.log('  captura: ' + path.relative(root, file));
    }

    async function runSuite(url, label) {
      console.log('\n=== ' + label + ' ===');
      await cdp.send('Page.navigate', { url });
      await waitFor(async () => evaluate('window.__ready === true && !!window.RasmaticGame'), 60000,
        'window.__ready en ' + label);
      await sleep(800);
      const suite = fs.readFileSync(suitePath, 'utf8');
      const raw = await evaluate(suite, true);
      const report = JSON.parse(raw);
      for (const item of report.out) {
        console.log((item.pass ? '  ok   ' : '  FAIL ') + item.name);
        if (!item.pass) console.log('        ' + JSON.stringify(item.data));
      }
      console.log('  ' + (report.total - report.fails) + '/' + report.total + ' casos superados.');
      if (report.fails > 0) exitCode = 1;
      return report;
    }

    const base = 'http://127.0.0.1:' + port;

    /* 1. Head Tracking con Core Motion simulado. */
    const nativeStub = `
      window.RasmaticNativeHeadTracking = {
        available: true,
        version: 'test-1.0',
        name: 'Core Motion (simulado)',
        _raw: null,
        _status: null,
        raw: function (y, p, r) { if (this._raw) this._raw(y, p, r); },
        status: function (a, n) { this.available = !!a; if (this._status) this._status(a, n); },
        bind: function (raw, status) { this._raw = raw; this._status = status; },
        _feed: function (y, p, r) { if (this._raw) this._raw(y, p, r); }
      };
    `;
    const injected = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: nativeStub });
    const htNative = await runSuite(base + '/web/index.html', 'Head Tracking · Core Motion simulado');
    await shot('v19-01-head-tracking.png');

    /* 2. Classic sin puente nativo ni head tracking. */
    if (injected && injected.identifier) {
      await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injected.identifier });
    }
    const classic = await runSuite(base + '/web-classic/index.html', 'Classic · sin head tracking');
    await shot('v19-02-classic.png');

    /* 3. Head Tracking con fallback DeviceOrientationEvent. */
    const htWeb = await runSuite(base + '/web/index.html', 'Head Tracking · fallback web');

    /* 4. Persistencia independiente: Classic dejó su clave y HT la suya. */
    const persist = await evaluate(`(function () {
      return {
        app: window.RasmaticApp && window.RasmaticApp.id,
        joystick: window.RasmaticGame && window.RasmaticGame.getJoystick(),
        htKey: localStorage.getItem('rasmatic.joystick'),
        classicKey: localStorage.getItem('rasmatic.classic.joystick')
      };
    })()`, false);
    console.log('\nPersistencia independiente:');
    const persistOk = persist && persist.app === 'headtracking' &&
      persist.joystick === true && persist.htKey === 'on' && persist.classicKey === 'off';
    console.log((persistOk ? '  ok   ' : '  FAIL ') +
      'HT conserva on y Classic conserva off ' + JSON.stringify(persist));
    if (!persistOk) exitCode = 1;

    if (consoleErrors.length) {
      console.log('\nErrores de consola (' + consoleErrors.length + '):');
      for (const e of consoleErrors.slice(0, 20)) console.log('  ! ' + e.split('\n')[0]);
      exitCode = 1;
    } else {
      console.log('\nConsola sin errores.');
    }

    if (htNative.fails || classic.fails || htWeb.fails) exitCode = 1;
  } finally {
    if (cdp) cdp.close();
    if (browser) {
      if (keep) console.log('\nNavegador y servidor siguen abiertos (--keep).');
      else { try { browser.kill(); } catch (e) { /* nada */ } }
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
  console.error('\n[test-v19] ' + err.message);
  process.exit(1);
});
