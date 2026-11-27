/* ============================================================
   RASMATIC · Enlace con el calibrador de Windows
   ------------------------------------------------------------
   Cliente WebSocket del juego. Se carga solo en el telefono
   (o con ?vrlink=1) y agrega un boton "PC" con su panel.

   Reglas:
     - No toca el render, las camaras ni el Bluetooth.
     - La calibracion sigue siendo la del juego (RasmaticVR).
     - El servidor es la unica fuente de verdad: la PC valida,
       aplica y retransmite. El telefono no reenvia lo que recibe.
     - Sin Internet ni servicios externos: solo Wi-Fi local.
     - El token se guarda en localStorage; nunca se muestra.
   ============================================================ */
(function () {
  'use strict';

  var EMBED = /[?&]embed=1\b/.test(location.search);
  var FORCE = /[?&]vrlink=1\b/.test(location.search);
  var MOBILE = navigator.maxTouchPoints > 0 ||
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '') ||
    window.matchMedia('(pointer:coarse)').matches;
  if (EMBED || (!MOBILE && !FORCE)) return;

  var vr = window.RasmaticVR;
  if (!vr) return;

  var STORE = 'rasmatic.vr.link.v1';
  var DEFAULT_PORT = 8737;
  var MAX_BACKOFF = 30000;
  var TELEMETRY_MS = 1000;

  var S = {
    ws: null,
    seq: 0,
    status: 'off',          /* off | connecting | handshake | linked | error */
    host: '',
    port: DEFAULT_PORT,
    code: '',
    token: '',
    deviceId: '',
    deviceName: '',
    paired: false,
    expo: false,
    locked: false,
    rev: 0,
    lastError: '',
    retry: 0,
    retryTimer: 0,
    pingTimer: 0,
    stateTimer: 0,
    lastPong: 0,
    sendTimer: 0,
    pending: {},
    intentional: false
  };

  /* ---------------- almacenamiento ---------------- */
  function loadStore() {
    try {
      var s = window.RasmaticStore;
      var raw = s && typeof s.getItem === 'function'
        ? s.getItem(STORE)
        : localStorage.getItem(STORE);
      var o = raw ? JSON.parse(raw) : null;
      if (!o || typeof o !== 'object') return;
      if (typeof o.token === 'string') S.token = o.token;
      if (typeof o.deviceId === 'string') S.deviceId = o.deviceId;
      if (typeof o.host === 'string') S.host = o.host;
      if (typeof o.port === 'number' && o.port > 0 && o.port < 65536) S.port = o.port;
      if (typeof o.deviceName === 'string') S.deviceName = o.deviceName;
    } catch (e) { /* modo privado */ }
  }

  function saveStore() {
    try {
      var s = window.RasmaticStore;
      var value = JSON.stringify({
        token: S.token,
        deviceId: S.deviceId,
        host: S.host,
        port: S.port,
        deviceName: S.deviceName
      });
      if (s && typeof s.setItem === 'function') s.setItem(STORE, value);
      else localStorage.setItem(STORE, value);
    } catch (e) { /* sin persistencia */ }
  }

  function uid() {
    try {
      var a = new Uint8Array(16);
      (window.crypto || window.msCrypto).getRandomValues(a);
      var s = '';
      for (var i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2);
      return s;
    } catch (e) {
      return 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    }
  }

  loadStore();
  if (!S.deviceId) { S.deviceId = uid(); saveStore(); }
  if (!S.deviceName) {
    S.deviceName = window.RasmaticPlatform
      ? window.RasmaticPlatform.label
      : (/iPhone|iPad/i.test(navigator.userAgent || '') ? 'iPhone' : 'Dispositivo');
    saveStore();
  }

  /* ---------------- interfaz ---------------- */
  var ui = {};

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function buildUI() {
    var launch = el('button', {
      id: 'vrlink-launch', type: 'button',
      'aria-label': 'Conectar con la PC',
      title: 'Conectar con el calibrador de Windows'
    });
    launch.innerHTML = '<span class="dot"></span>PC';
    launch.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      togglePanel();
    });
    document.body.appendChild(launch);
    ui.launch = launch;

    var panel = el('div', { id: 'vrlink-panel', role: 'dialog', 'aria-label': 'Conexión con la PC' });
    panel.innerHTML =
      '<header><b>PC <span>CALIBRADOR</span></b>' +
        '<button type="button" id="vrlink-close" aria-label="Cerrar">✕</button></header>' +
      '<div class="vrlink-body">' +
        '<div id="vrlink-status" class="vrlink-status" role="status" aria-live="polite">Desconectado</div>' +
        '<div id="vrlink-lock" class="vrlink-lock" hidden>🔒 Calibración bloqueada desde la PC</div>' +
        '<div id="vrlink-expo" class="vrlink-expo" hidden>Modo Expo activo: no se aceptan vinculaciones nuevas</div>' +
        '<label class="vrlink-field">IP o nombre de la PC' +
          '<input id="vrlink-host" type="text" inputmode="url" autocomplete="off" spellcheck="false" placeholder="192.168.1.50"></label>' +
        '<label class="vrlink-field">Puerto' +
          '<input id="vrlink-port" type="number" min="1" max="65535" step="1" value="' + DEFAULT_PORT + '"></label>' +
        '<label class="vrlink-field" id="vrlink-code-row">Código de la PC' +
          '<input id="vrlink-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="123456"></label>' +
        '<div class="vrlink-actions">' +
          '<button type="button" id="vrlink-connect" class="pri">Conectar</button>' +
          '<button type="button" id="vrlink-disconnect">Desconectar</button>' +
        '</div>' +
        '<button type="button" id="vrlink-forget" class="ghost">Olvidar este equipo</button>' +
        '<p class="vrlink-help">Abrí el calibrador en la PC, mirá la IP y el código, y escribilos acá. ' +
          'Los dos equipos tienen que estar en la misma red Wi-Fi (o en el hotspot de la PC). ' +
          'El juego y el mando Bluetooth siguen funcionando aunque la PC se desconecte.</p>' +
      '</div>';
    document.body.appendChild(panel);
    ui.panel = panel;

    ui.status = panel.querySelector('#vrlink-status');
    ui.lock = panel.querySelector('#vrlink-lock');
    ui.expo = panel.querySelector('#vrlink-expo');
    ui.host = panel.querySelector('#vrlink-host');
    ui.port = panel.querySelector('#vrlink-port');
    ui.code = panel.querySelector('#vrlink-code');
    ui.codeRow = panel.querySelector('#vrlink-code-row');
    ui.connect = panel.querySelector('#vrlink-connect');
    ui.disconnect = panel.querySelector('#vrlink-disconnect');
    ui.forget = panel.querySelector('#vrlink-forget');

    ui.host.value = S.host || '';
    ui.port.value = String(S.port || DEFAULT_PORT);

    panel.querySelector('#vrlink-close').addEventListener('click', function (e) {
      e.preventDefault();
      hidePanel();
    });
    ui.connect.addEventListener('click', function (e) {
      e.preventDefault();
      readForm();
      S.retry = 0;
      connect();
    });
    ui.disconnect.addEventListener('click', function (e) {
      e.preventDefault();
      disconnect(true);
    });
    ui.forget.addEventListener('click', function (e) {
      e.preventDefault();
      if (!window.confirm('¿Olvidar este equipo? Vas a tener que emparejarlo de nuevo con un código.')) return;
      S.token = '';
      S.paired = false;
      saveStore();
      disconnect(true);
      paint();
    });
    panel.addEventListener('click', function (e) { e.stopPropagation(); });
    panel.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  }

  function readForm() {
    S.host = String(ui.host.value || '').trim().slice(0, 120);
    var p = parseInt(ui.port.value, 10);
    S.port = (p > 0 && p < 65536) ? p : DEFAULT_PORT;
    S.code = String(ui.code.value || '').replace(/\D/g, '').slice(0, 8);
    saveStore();
  }

  function showPanel() {
    if (!ui.panel) return;
    if (vr && typeof vr.panel === 'function') vr.panel(false);
    ui.panel.classList.add('on');
    paint();
    setTimeout(function () { try { ui.host.focus(); } catch (e) {} }, 60);
  }

  function hidePanel() {
    if (ui.panel) ui.panel.classList.remove('on');
  }

  function togglePanel() {
    if (!ui.panel) return;
    if (ui.panel.classList.contains('on')) hidePanel();
    else showPanel();
  }

  function setStatus(text, bad) {
    S.lastError = bad ? text : '';
    if (!ui.status) return;
    ui.status.textContent = text;
    ui.status.classList.toggle('bad', !!bad);
    ui.status.classList.toggle('ok', S.status === 'linked' && !bad);
  }

  function paint() {
    if (!ui.status) return;
    var txt, bad = false;
    if (S.status === 'linked') txt = 'Conectado' + (S.paired ? ' · equipo autorizado' : '');
    else if (S.status === 'connecting') txt = 'Conectando…';
    else if (S.status === 'handshake') txt = 'Verificando…';
    else if (S.status === 'error') { txt = S.lastError || 'Error de conexión'; bad = true; }
    else txt = S.paired ? 'Desconectado (equipo autorizado)' : 'Desconectado';
    setStatus(txt, bad);
    if (ui.lock) ui.lock.hidden = !S.locked;
    if (ui.expo) ui.expo.hidden = !S.expo;
    if (ui.codeRow) ui.codeRow.hidden = !!S.token;
    if (ui.connect) ui.connect.textContent = S.status === 'linked' ? 'Reconectar' : 'Conectar';
    if (ui.launch) {
      ui.launch.classList.toggle('linked', S.status === 'linked');
      ui.launch.classList.toggle('locked', !!S.locked);
      ui.launch.title = S.status === 'linked'
        ? 'Conectado al calibrador de Windows' + (S.locked ? ' · calibración bloqueada' : '')
        : 'Conectar con el calibrador de Windows';
    }
    document.body.classList.toggle('vr-locked', !!S.locked);
    /* V21.2: avisar a la interfaz que Windows controla el Head Tracking.
       iOS oculta así la barra local duplicada. */
    var linked = S.status === 'linked';
    if (window.RasmaticPlatform && typeof window.RasmaticPlatform.setRemote === 'function') {
      window.RasmaticPlatform.setRemote(linked);
    } else {
      document.body.classList.toggle('ras-remote-linked', linked);
    }
  }

  /* ---------------- protocolo ---------------- */
  function send(msg) {
    if (!S.ws || S.ws.readyState !== 1) return false;
    msg.v = 1;
    msg.seq = ++S.seq;
    try {
      S.ws.send(JSON.stringify(msg));
      return true;
    } catch (e) {
      return false;
    }
  }

  function connect() {
    if (S.ws && (S.ws.readyState === 0 || S.ws.readyState === 1)) return;
    if (!S.host) {
      S.status = 'error';
      setStatus('Escribí la IP de la PC', true);
      paint();
      return;
    }
    clearTimeout(S.retryTimer);
    S.intentional = false;
    S.status = 'connecting';
    paint();

    var url = 'ws://' + S.host + ':' + S.port + '/vr';
    var ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      S.status = 'error';
      setStatus('Dirección inválida', true);
      paint();
      return;
    }
    S.ws = ws;
    S.seq = 0;

    ws.onopen = function () {
      S.status = 'handshake';
      S.lastPong = Date.now();
      paint();
      /* El servidor manda hello; si no llega, reintentamos. */
      setTimeout(function () {
        if (S.status === 'handshake' && S.ws === ws) {
          setStatus('La PC no respondió', true);
          try { ws.close(); } catch (e) {}
        }
      }, 6000);
    };

    ws.onmessage = function (ev) {
      if (S.ws !== ws) return;
      var m;
      try { m = JSON.parse(String(ev.data || '')); } catch (e) { return; }
      if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
      onMessage(m);
    };

    ws.onerror = function () {
      if (S.ws !== ws) return;
      S.status = 'error';
      setStatus('No se pudo conectar. Revisá la IP, el puerto y el Wi-Fi.', true);
      paint();
    };

    ws.onclose = function () {
      if (S.ws !== ws) return;
      S.ws = null;
      stopTimers();
      if (S.status !== 'error') S.status = 'off';
      paint();
      if (!S.intentional && S.token) scheduleRetry();
    };
  }

  function disconnect(manual) {
    S.intentional = !!manual;
    clearTimeout(S.retryTimer);
    stopTimers();
    if (S.ws) {
      try { S.ws.close(1000, 'manual'); } catch (e) {}
      S.ws = null;
    }
    S.status = 'off';
    paint();
  }

  function scheduleRetry() {
    clearTimeout(S.retryTimer);
    S.retry = Math.min(S.retry + 1, 6);
    var base = Math.min(MAX_BACKOFF, 1000 * Math.pow(2, S.retry - 1));
    var wait = Math.round(base * (0.8 + Math.random() * 0.4));
    S.status = 'off';
    setStatus('Reconectando en ' + Math.round(wait / 1000) + ' s…', false);
    S.retryTimer = setTimeout(function () {
      if (!S.intentional && S.token) connect();
    }, wait);
  }

  function stopTimers() {
    clearInterval(S.pingTimer);
    clearInterval(S.stateTimer);
    clearTimeout(S.sendTimer);
    S.pingTimer = 0;
    S.stateTimer = 0;
    S.sendTimer = 0;
    S.pending = {};
  }

  function startTimers() {
    stopTimers();
    S.pingTimer = setInterval(function () {
      if (!S.ws || S.ws.readyState !== 1) return;
      if (Date.now() - S.lastPong > 25000) {
        try { S.ws.close(4000, 'timeout'); } catch (e) {}
        return;
      }
      send({ t: 'ping', time: Date.now() });
    }, 10000);
    S.stateTimer = setInterval(sendTelemetry, TELEMETRY_MS);
  }

  function applyCal(values) {
    if (!values || typeof values !== 'object') return;
    if (vr && typeof vr.applyCal === 'function') vr.applyCal(values, 'remote');
  }

  function onMessage(m) {
    if (m.t === 'hello') {
      if (S.token) send({ t: 'auth', token: S.token, deviceId: S.deviceId, device: deviceInfo() });
      else if (S.code) send({ t: 'pair', code: S.code, device: deviceInfo() });
      else {
        S.status = 'error';
        setStatus('Escribí el código que muestra la PC', true);
        paint();
      }
      return;
    }

    if (m.t === 'welcome') {
      if (typeof m.token === 'string' && m.token) {
        S.token = m.token;
        saveStore();
      }
      S.paired = true;
      S.status = 'linked';
      S.expo = !!m.expo;
      S.locked = !!m.lock;
      if (typeof m.rev === 'number') S.rev = m.rev;
      if (vr) vr.setLocked(S.locked);
      applyCal(m.cal);
      S.retry = 0;
      S.code = '';
      if (ui.code) ui.code.value = '';
      if (ui.codeRow) ui.codeRow.hidden = true;
      startTimers();
      setStatus('Conectado · equipo autorizado', false);
      paint();
      sendTelemetry();
      return;
    }

    if (m.t === 'cal') {
      if (typeof m.rev === 'number') {
        if (m.rev <= S.rev) return;
        S.rev = m.rev;
      }
      applyCal(m.values || m.cal);
      if (m.rev) send({ t: 'ack', rev: m.rev });
      return;
    }

    if (m.t === 'lock') {
      S.locked = !!m.lock;
      if (vr) vr.setLocked(S.locked);
      paint();
      return;
    }

    if (m.t === 'expo') {
      S.expo = !!m.on;
      paint();
      return;
    }

    if (m.t === 'pong') {
      S.lastPong = Date.now();
      return;
    }

    if (m.t === 'revoked') {
      S.token = '';
      S.paired = false;
      saveStore();
      S.intentional = true;
      disconnect(true);
      S.status = 'error';
      setStatus('La PC revocó este equipo. Volvé a emparejarlo con un código.', true);
      paint();
      return;
    }

    if (m.t === 'error') {
      var code = String(m.code || '');
      if (code === 'bad_token' || code === 'revoked') {
        S.token = '';
        S.paired = false;
        saveStore();
      }
      S.status = 'error';
      setStatus(m.msg ? String(m.msg).slice(0, 160) : 'La PC rechazó la conexión.', true);
      paint();
      return;
    }
  }

  function deviceInfo() {
    return {
      id: S.deviceId,
      name: S.deviceName.slice(0, 40),
      model: window.RasmaticPlatform
        ? window.RasmaticPlatform.label
        : String((navigator.userAgent || '').match(/iPhone|iPad|Android/) || [''])[0]
    };
  }

  function sendTelemetry() {
    if (S.status !== 'linked' || !S.ws || S.ws.readyState !== 1) return;
    var player = null, game = null;
    try {
      var core = window.RasmaticCore;
      var pp = core && core.game && core.game.player;
      if (pp) player = {
        x: +Number(pp.x).toFixed(3),
        y: +Number(pp.y).toFixed(3),
        z: +Number(pp.z).toFixed(3),
        yaw: +Number(pp.yaw).toFixed(4),
        pitch: +Number(pp.pitch).toFixed(4)
      };
    } catch (e) { player = null; }
    try {
      var dbg = window.RasmaticGame && window.RasmaticGame.debug ? window.RasmaticGame.debug() : null;
      if (dbg) game = {
        state: String(dbg.state || ''),
        time: +Number(dbg.time || 0).toFixed(1),
        score: dbg.score ? { player: +dbg.score.player || 0, bot: +dbg.score.bot || 0 } : null,
        request: typeof dbg.request === 'number' ? dbg.request : -1,
        carrying: typeof dbg.carrying === 'number' ? dbg.carrying : -1
      };
    } catch (e) { game = null; }
    send({ t: 'state', player: player, game: game });
  }

  /* ---------------- cambios locales ---------------- */
  function flushChanges() {
    S.sendTimer = 0;
    if (S.status !== 'linked' || S.locked) { S.pending = {}; return; }
    var keys = Object.keys(S.pending);
    if (!keys.length) return;
    var values = {};
    for (var i = 0; i < keys.length; i++) values[keys[i]] = S.pending[keys[i]];
    S.pending = {};
    send({ t: 'cal', origin: 'iphone', values: values });
  }

  function queueChange(keys) {
    if (S.status !== 'linked' || S.locked) return;
    var settings = vr.state().settings;
    if (!keys) keys = Object.keys(settings);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (typeof settings[k] === 'number') S.pending[k] = settings[k];
    }
    if (!S.sendTimer) S.sendTimer = setTimeout(flushChanges, 90);
  }

  if (typeof vr.onChange === 'function') {
    vr.onChange(function (ev) {
      if (!ev || ev.origin === 'remote') return;
      queueChange(ev.keys);
    });
  }

  /* ---------------- arranque ---------------- */
  buildUI();
  paint();
  if (S.token && S.host) setTimeout(connect, 1200);

  window.RasmaticVRLink = {
    version: 1,
    state: function () {
      return {
        status: S.status,
        paired: S.paired,
        expo: S.expo,
        locked: S.locked,
        host: S.host,
        port: S.port,
        deviceId: S.deviceId,
        rev: S.rev
      };
    },
    connect: function (host, port, code) {
      if (host) S.host = String(host).slice(0, 120);
      if (port) S.port = parseInt(port, 10) || DEFAULT_PORT;
      if (code) S.code = String(code).replace(/\D/g, '').slice(0, 8);
      saveStore();
      connect();
      return true;
    },
    disconnect: function () { disconnect(true); return true; },
    panel: function (open) {
      if (open === undefined) return togglePanel();
      if (open) showPanel(); else hidePanel();
      return true;
    }
  };
})();
