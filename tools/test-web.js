/*
 * Ejecuta la suite funcional de la version iPhone/PWA en un navegador
 * Chromium real, simulando un iPhone (390x844, DPR 3, tactil).
 *
 *   node tools/test-web.js [--port 8137] [--shots docs/evidencias] [--keep]
 *
 * Requiere un Chrome/Edge instalado. Busca, en orden:
 *   $env:CHROME_PATH, Chrome, Edge.
 *
 * Esto NO sustituye una prueba en Safari/iPhone real: verifica la logica del
 * juego y del puente iOS en un motor Chromium. Lo que solo puede probarse en
 * un iPhone (fuentes reales, safe areas del notch, Gamepad API de Safari,
 * instalacion como PWA, WKWebView) queda listado en docs/pruebas.md.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const suitePath = path.join(__dirname, 'test-suite.js');

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const port = Number(argValue('--port', 8137));
const debugPort = port + 1000;
const shotsDir = argValue('--shots', path.join(root, 'docs', 'evidencias'));
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
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
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

  close() {
    try { this.ws.close(); } catch (e) { /* nada */ }
  }
}

/* ---------------- Arranque ---------------- */
async function main() {
  const browserPath = findBrowser();
  const server = spawn(process.execPath, [path.join(__dirname, 'serve.js'), '--port', String(port), '--quiet'], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stderr.on('data', (d) => process.stderr.write('[serve] ' + d));

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rasmatic-web-'));
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
      if (p.type === 'error') {
        consoleErrors.push(p.args.map((a) => a.value || a.description || '').join(' '));
      }
    });
    cdp.on('Log.entryAdded', (p) => {
      if (p.entry.level === 'error') consoleErrors.push(p.entry.text);
    });

    /* DPR 1 durante las pruebas: con WebGL por software, 1170x2532 px hacen
       que el render baje a ~1 fps y el reloj de la partida se congele. La
       densidad real de un iPhone (3x) se usa luego para las capturas. */
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
      screenWidth: 390, screenHeight: 844
    });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cdp.send('Emulation.setUserAgentOverride', { userAgent: IPHONE_UA, platform: 'iPhone' });

    const url = 'http://127.0.0.1:' + port + '/index.html';
    await cdp.send('Page.navigate', { url });

    console.log('Esperando la escena...');
    await waitFor(async () => {
      const r = await cdp.send('Runtime.evaluate', {
        expression: 'window.__ready === true && !!window.RasmaticGame',
        returnByValue: true
      });
      return r.result && r.result.value === true;
    }, 60000, 'window.__ready');

    console.log('Ejecutando la suite (puede tardar ~1 min por el ciclo del CNC)...\n');
    const expression = fs.readFileSync(suitePath, 'utf8');
    const evaluated = await cdp.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      timeout: 240000
    });

    if (evaluated.exceptionDetails) {
      throw new Error('la suite lanzo una excepcion: ' +
        (evaluated.exceptionDetails.exception && evaluated.exceptionDetails.exception.description));
    }

    const report = JSON.parse(evaluated.result.value);
    for (const item of report.out) {
      console.log((item.pass ? '  ok   ' : '  FAIL ') + item.name);
      if (!item.pass) console.log('        ' + JSON.stringify(item.data));
    }
    console.log('\n' + (report.total - report.fails) + '/' + report.total + ' casos superados.');

    /* ---------------- Evidencias ---------------- */
    fs.mkdirSync(shotsDir, { recursive: true });

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

    console.log('\nEvidencias:');
    /* Capturas a 2x (nitidez suficiente y el render por software sigue
       avanzando a un ritmo utilizable). */
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
      screenWidth: 390, screenHeight: 844
    });
    await cdp.send('Page.navigate', { url });
    await waitFor(async () => evaluate('window.__ready === true'), 60000, 'recarga');
    await sleep(2500);
    await shot('ios-01-inicio.png');

    /* Panel de personalización de interfaz (V18): se abre desde Opciones. */
    await evaluate('document.getElementById("rg-opts-btn").click()');
    await sleep(350);
    await evaluate('document.getElementById("rg-opts-ui").click()');
    await sleep(650);
    await shot('ui-02-personalizacion.png');
    await evaluate('(function(){var c=document.querySelector("#rg-ui .rg-ui-card");' +
      'if(c)c.scrollTop=c.scrollHeight;return true;})()');
    await sleep(400);
    await shot('ui-03-personalizacion-vr.png');
    await evaluate('window.RasmaticGame.ui.close(false)');
    await sleep(250);

    await evaluate('(function(){var g=window.RasmaticCore.game;' +
      'g.player.x=0;g.player.z=24.6;return true;})()');
    await waitFor(async () => (await evaluate('window.RasmaticGame.debug().ui.action')) === 'JUGAR', 20000, 'aviso JUGAR');
    await sleep(500);
    await shot('ui-01-jugar.png');
    await evaluate('window.RasmaticGame.interact()');
    await waitFor(async () => (await evaluate('window.RasmaticGame.debug().state')) === 'playing', 20000, 'partida');
    /* Espera al primer cliente: la captura muestra la partida en curso. */
    await waitFor(async () => (await evaluate('window.RasmaticGame.debug().customer')) === true, 60000, 'primer cliente');
    /* Ir a la estación del color pedido: la captura muestra el aviso RECOGER
       con el pedido en el HUD. */
    await evaluate(`(function(){
      var d = window.RasmaticGame.debug();
      var sta = [ {x:-3.85,z:-28},{x:3.85,z:-36},{x:-3.85,z:-44},
                  {x:3.85,z:-52},{x:-3.85,z:-60},{x:3.85,z:-68} ];
      var s = sta[Math.max(0, d.request)];
      var g = window.RasmaticCore.game;
      g.player.x = s.x * 0.9; g.player.z = s.z;
      return true;
    })()`);
    await waitFor(async () => (await evaluate('window.RasmaticGame.debug().ui.action')) === 'RECOGER', 30000, 'aviso RECOGER');
    await sleep(600);
    await shot('ios-02-partida.png');

    await evaluate('window.RasmaticGame._test.timeLeft(1)');
    await waitFor(async () => (await evaluate('window.RasmaticGame.debug().state')) === 'over', 20000, 'fin de partida');
    await sleep(1200);
    await shot('ios-03-final.png');

    /* Rotacion: Android usa fullSensor, iOS admite las cuatro orientaciones.
       Se comprueba que en horizontal la escena sigue a pantalla completa y
       que JUGAR queda centrado, comodo y sin tapar el joystick. */
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 844, height: 390, deviceScaleFactor: 2, mobile: true,
      screenWidth: 844, screenHeight: 390
    });
    await cdp.send('Page.navigate', { url });
    await waitFor(async () => evaluate('window.__ready === true'), 60000, 'horizontal');
    await sleep(1500);
    await evaluate('(function(){var g=window.RasmaticCore.game;' +
      'g.player.x=0;g.player.z=24.6;return true;})()');
    await waitFor(async () => (await evaluate('window.RasmaticGame.debug().ui.action')) === 'JUGAR', 20000, 'JUGAR horizontal');
    await sleep(500);
    const land = await evaluate(`(function(){
      var de = document.documentElement, cv = document.querySelector('canvas');
      var r = cv.getBoundingClientRect();
      var a = document.getElementById('rg-act').getBoundingClientRect();
      var s = document.getElementById('ras-stick').getBoundingClientRect();
      var sc = document.getElementById('rg-score').getBoundingClientRect();
      var ti = document.getElementById('rg-time').getBoundingClientRect();
      return { ox: de.scrollWidth - de.clientWidth, oy: de.scrollHeight - de.clientHeight,
               w: Math.round(r.width), h: Math.round(r.height),
               iw: innerWidth, ih: innerHeight,
               act: { left: a.left, top: a.top, right: a.right, bottom: a.bottom,
                      w: a.width, h: a.height, cx: a.left + a.width / 2 },
               stick: { left: s.left, top: s.top, right: s.right, bottom: s.bottom,
                        visible: getComputedStyle(document.getElementById('ras-stick')).display !== 'none' },
               hud: { scoreLeft: sc.left, scoreRight: sc.right,
                      timeLeft: ti.left, timeRight: ti.right } };
    })()`);
    const landOk = land && land.ox <= 1 && land.oy <= 1 &&
      Math.abs(land.w - land.iw) <= 1 && Math.abs(land.h - land.ih) <= 1;
    console.log((landOk ? '  ok   ' : '  FAIL ') + 'horizontal a pantalla completa ' + JSON.stringify(land));
    const actLandOk = land && Math.abs(land.act.cx - land.iw / 2) <= 1.5 &&
      land.act.left >= 8 && land.act.right <= land.iw - 8 &&
      land.act.top >= 8 && land.act.bottom <= land.ih - 8 &&
      land.act.w >= 120 && land.act.h >= 50;
    const stickGap = !land || !land.stick.visible ||
      !(land.act.right > land.stick.left && land.act.left < land.stick.right &&
        land.act.bottom > land.stick.top && land.act.top < land.stick.bottom);
    const hudLandOk = land && land.hud.scoreLeft >= 8 &&
      land.hud.timeRight <= land.iw - 8 &&
      land.hud.timeLeft > land.hud.scoreRight;
    console.log((actLandOk && stickGap && hudLandOk ? '  ok   ' : '  FAIL ') +
      'JUGAR centrado y HUD sin solapes en horizontal ' +
      JSON.stringify({ act: land && land.act, stick: land && land.stick, hud: land && land.hud }));
    if (!landOk || !actLandOk || !stickGap || !hudLandOk) exitCode = 1;
    await shot('ios-04-horizontal.png');

    if (consoleErrors.length) {
      console.log('\nErrores de consola (' + consoleErrors.length + '):');
      for (const e of consoleErrors.slice(0, 20)) console.log('  ! ' + e.split('\n')[0]);
      exitCode = 1;
    } else {
      console.log('\nConsola sin errores.');
    }

    if (report.fails > 0) exitCode = 1;

    /* ---------------- Sin conexion (PWA) ---------------- */
    console.log('\nPrueba sin conexion:');
    const swActive = await evaluate(
      "(async () => { const r = await navigator.serviceWorker.getRegistration();" +
      " return !!(r && r.active); })()");
    if (!swActive) {
      console.log('  omitida: el service worker no esta activo');
    } else {
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', {
        offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0
      });
      await cdp.send('Page.navigate', { url });
      const offlineReady = await waitFor(async () => evaluate('window.__ready === true'), 45000, 'recarga sin red')
        .then(() => true).catch(() => false);
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1
      });
      console.log((offlineReady ? '  ok   ' : '  FAIL ') +
        'la app carga sin conexion desde el service worker');
      if (!offlineReady) exitCode = 1;
    }
  } finally {
    if (cdp) cdp.close();
    if (browser) {
      if (keep) {
        console.log('\nNavegador y servidor siguen abiertos (--keep).');
      } else {
        try { browser.kill(); } catch (e) { /* nada */ }
      }
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
  console.error('\n[test-web] ' + err.message);
  process.exit(1);
});
