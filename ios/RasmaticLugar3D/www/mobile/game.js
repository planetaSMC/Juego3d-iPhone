/* ============================================================
   RASMATIC · Juego de almacén inteligente (Android)
   ------------------------------------------------------------
   Convierte la escena existente en una partida corta:
   el jugador busca medicamentos por color en las góndolas y los
   entrega en el mostrador mientras un bot atiende con el CNC.

   Se apoya en RasmaticCore.game (expuesto por el parche del HTML):
   escena, cámara, máquina, estanterías y materiales originales.
   No crea una escena nueva ni modifica el HTML de referencia.
   ============================================================ */
(function () {
  'use strict';

  const T = window.THREE;
  if (!T) { console.error('[juego] three.js no disponible'); return; }

  /* ---------------- Configuración ajustable ---------------- */
  const CFG = {
    duration: 180,      // duración de la partida (s)
    botInterval: 9,     // espera entre ciclos del bot (s)
    botFirst: 3.5,      // primer ciclo del bot (s)
    botSpeed: 1,        // multiplicador de velocidad del bot
    stock: 8,           // unidades por color y por lado
    pickup: 2.4,        // radio de respaldo para recoger
    deliver: 3.4,       // radio histórico (V20)
    talk: 7.5,          // radio histórico (V20)
    /* V21 */
    aimRange: 16,       // alcance del rayo de la mira
    aimTake: 5.6,       // distancia máxima para recoger con la mira
    beltSpeed: 3.6,     // unidades/s de la cinta de entrega
    beltSpacing: 1.5,   // separación mínima entre paquetes
    beltEntryRadius: 3.4,
    queueSize: 3
  };

  /* Fila de clientes frente al mostrador. */
  const QUEUE = [
    { x: 21.9, z: 15.5 },
    { x: 24.4, z: 16.9 },
    { x: 26.9, z: 18.3 }
  ];
  const CLIENT_ENTRY = { x: 28.5, z: 21.0 };
  const CLIENT_EXIT = { x: 24.5, z: 21.0 };

  /* Dificultad del bot: intervalo entre clientes, primer ciclo y
     velocidad de los movimientos. «Normal» ya es más lento que el
     valor histórico (6 s) para que la partida sea más justa. */
  const DIFF_KEY = 'rasmatic.botDifficulty';
  const DIFFICULTY = {
    facil: { label: 'Fácil', interval: 12, first: 4.0, speed: 0.75,
      note: 'El bot atiende cada 12 s y se mueve más lento.' },
    normal: { label: 'Normal', interval: 9, first: 3.5, speed: 1,
      note: 'El bot atiende cada 9 s.' },
    dificil: { label: 'Difícil', interval: 6, first: 2.5, speed: 1.25,
      note: 'El bot atiende cada 6 s y se mueve más rápido.' }
  };
  let difficulty = 'normal';

  /* ---------------- Almacenamiento por aplicacion (V19) ----------------
     La app Head Tracking conserva las claves historicas `rasmatic.*`.
     La app Classic usa `rasmatic.classic.*` para que las dos puedan
     convivir en el mismo origen (PWA) sin mezclar preferencias. */
  function storeGet(key) {
    try {
      const s = window.RasmaticStore;
      if (s && typeof s.getItem === 'function') return s.getItem(key);
      return localStorage.getItem(key);
    } catch (e) { return null; }
  }
  function storeSet(key, value) {
    try {
      const s = window.RasmaticStore;
      if (s && typeof s.setItem === 'function') s.setItem(key, value);
      else localStorage.setItem(key, value);
    } catch (e) { /* modo privado */ }
  }

  /* ---------------- Joystick tactil opcional (V19) ----------------
     Desactivado: se oculta el joystick visual y se ignoran sus entradas.
     El mando Bluetooth, la camara y la interaccion siguen funcionando. */
  const JOY_KEY = 'rasmatic.joystick';
  let joystickOn = true;

  function paintJoystick() {
    const b = nodes.joyBtn;
    if (b) {
      b.classList.toggle('on', joystickOn);
      b.setAttribute('aria-checked', joystickOn ? 'true' : 'false');
      const t = b.querySelector('b');
      if (t) t.textContent = joystickOn ? 'ACTIVADO' : 'DESACTIVADO';
    }
    document.body.classList.toggle('ras-no-joystick', !joystickOn);
  }

  function applyJoystick(on, save) {
    joystickOn = on !== false;
    if (save) storeSet(JOY_KEY, joystickOn ? 'on' : 'off');
    paintJoystick();
    try {
      document.dispatchEvent(new CustomEvent('rasmatic:joystick', {
        detail: { enabled: joystickOn }
      }));
    } catch (e) { /* navegadores sin CustomEvent */ }
    return joystickOn;
  }

  function loadJoystick() {
    let raw = 'on';
    try { raw = storeGet(JOY_KEY) || 'on'; } catch (e) { /* nada */ }
    applyJoystick(raw !== 'off', false);
  }

  function paintHeadTracking(st) {
    const b = nodes.htBtn;
    if (!b) return;
    const on = !!(st && st.enabled);
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
    const t = b.querySelector('b');
    if (t) t.textContent = on ? 'ACTIVADO' : 'DESACTIVADO';
    if (nodes.htCenter) nodes.htCenter.hidden = !on;
    if (nodes.htSens) {
      const s = st && typeof st.sensitivity === 'number' ? st.sensitivity : 1;
      nodes.htSens.value = s;
      if (nodes.htSensOut) nodes.htSensOut.textContent = s.toFixed(1).replace('.', ',') + '×';
    }
    if (nodes.htSmooth) {
      const m = st && typeof st.smoothing === 'number' ? st.smoothing : 0.12;
      nodes.htSmooth.value = m;
      if (nodes.htSmoothOut) nodes.htSmoothOut.textContent = m.toFixed(2).replace('.', ',') + ' s';
    }
  }

  /* ---------------- Personalización de la interfaz (V18) ----------------
     Cada elemento del HUD tiene su propio tamaño, desplazamiento y, cuando
     corresponde, peso/contraste/fondo. Se guardan dos perfiles (normal y VR)
     en localStorage con versión, y se aplican como variables CSS: cambiar un
     valor no reinicia la escena ni toca la partida. */
  const UI_KEY = 'rasmatic.ui.v1';
  const UI_VERSION = 1;
  const UI_ELEMENTS = [
    { id: 'score',  label: 'Marcador', weight: false, bg: true,  bgDefault: 0.86 },
    { id: 'points', label: 'Puntaje', weight: true,  bg: false, bgDefault: 0 },
    { id: 'time',   label: 'Reloj y temporizador', weight: true, bg: true, bgDefault: 0.86 },
    { id: 'req',    label: 'Información del pedido', weight: false, bg: true, bgDefault: 0.86 },
    { id: 'med',    label: 'Nombre del medicamento', weight: true, bg: false, bgDefault: 0 },
    { id: 'carry',  label: 'Lo que llevás', weight: true, bg: true, bgDefault: 0.86 },
    { id: 'toast',  label: 'Mensajes y notificaciones', weight: true, bg: true, bgDefault: 0.92 },
    { id: 'hint',   label: 'Indicaciones y pistas', weight: true, bg: true, bgDefault: 0.86 },
    { id: 'act',    label: 'Botones JUGAR / RECOGER / ENTREGAR', weight: true, bg: false, bgDefault: 0 },
    { id: 'end',    label: 'Resultado de la partida', weight: true, bg: true, bgDefault: 0.92 }
  ];
  const UI_META = {};
  UI_ELEMENTS.forEach(function (e) { UI_META[e.id] = e; });
  const UI_WEIGHTS = [0, 400, 500, 600, 700, 800, 900];
  const UI_SCALE_MIN = 0.6, UI_SCALE_MAX = 1.5;
  const UI_OFFSET = 40;
  let uiSaved = null;
  let uiDraft = null;
  let uiEditProfile = 'normal';
  let uiSelId = 'score';
  let uiPreviewOn = true;
  let uiEditor = null;

  const COLORS = [
    { id: 'rojo',     name: 'ROJO',     css: '#e8453c', hex: 0xe8453c },
    { id: 'azul',     name: 'AZUL',     css: '#2f7bff', hex: 0x2f7bff },
    { id: 'verde',    name: 'VERDE',    css: '#22a06b', hex: 0x22a06b },
    { id: 'amarillo', name: 'AMARILLO', css: '#f2c63a', hex: 0xf2c63a },
    { id: 'violeta',  name: 'VIOLETA',  css: '#8a6fe0', hex: 0x8a6fe0 },
    { id: 'naranja',  name: 'NARANJA',  css: '#f08a3c', hex: 0xf08a3c }
  ];

  /* Estaciones sobre las góndolas del pasillo central (caras al pasillo).
     La caja asoma 0,15 por delante de la cara de la góndola (|x| = 4.0) para
     que se vea desde el pasillo: dentro de la estantería el marco la tapa. */
  /* V20: las estaciones se llenan desde las cajas de las estanterías del HTML.
     El orden de COLOR_DRUGS coincide con pharmacy-scene.js. */
  const STATIONS = [];
  const COLOR_DRUGS = [1, 0, 6, 5, 4, 2];

  const SPOT = {
    npc:      { x: 21.9, z: 10.3 },   // farmacéutico detrás del mostrador HTML
    counter:  { x: 21.9, z: 14.6 },   // frente del mostrador, zona de entrega
    customer: { x: 21.9, z: 16.0 },   // cliente del mostrador
    kiosk:    { x: 16.4, z: 11.8 },   // terminal junto a la RASMATIC BOT
    bot:      { x: 14.0, z: 19.5 }    // detrás de la ventanilla del bot
  };

  const K = 0.55;            // escala de los personajes nuevos

  /* ---------------- Estado ---------------- */
  let core = null, G = null;
  let state = 'boot';                 // boot | menu | countdown | playing | over
  let failed = false;
  let scoreP = 0, scoreB = 0;
  let stockP = [], stockB = [];
  let carrying = -1, requestP = -1, requestB = -1;
  /* V21.1: se lleva la caja real, no solo un color. carryingDrug y
     carryingBox permiten validar y manipular cada medicamento por separado. */
  let carryingDrug = -1, carryingBox = null, carryingFromStock = false;
  /* Posición de la caja real en la mano. Se mantiene dentro del frustum
     vertical (390x844) y del horizontal; no tapa la mira ni el pedido. */
  const HAND_POS = { x: 0.08, y: -0.4, z: -1.6 };
  const HAND_ROT = { x: -0.12, y: -0.32, z: 0.1 };
  const HAND_SCALE = 0.5;
  let matchStart = 0, matchEnd = 0;
  let customerWaitUntil = 0, customerHideAt = 0;
  let nextBotAt = 0, bot = null;
  let lastRaw = 0, pausedAccum = 0;
  let toastToken = 0, backAt = -99;
  let handMesh = null;
  let promptLabel = null, promptCls = '';

  /* V21: menú, cuenta regresiva, mira, cinta y fila. */
  let countdownAt = 0, countdownStep = 0;
  let pendingSpawns = [];
  let releaseAt = 0;
  let employee = null;
  const belt = { items: [], seq: 0, speed: 0 };
  const aim = { target: null, nextAt: 0, outline: null };
  const raycaster = new T.Raycaster();
  const aimDir = new T.Vector3();
  const aimOrigin = new T.Vector3();
  const aimQuat = new T.Quaternion();
  const aimBox = new T.Box3();

  const S = { stations: [], botBoxes: [], clients: [], queue: [], leaving: [], beltPool: [] };
  const TAGS = [];
  const tmpV = new T.Vector3();
  const tmpQ = new T.Quaternion();
  const nodes = {};
  const cnc = { x: 0, y: 0, e: 0, box: null, spec: null };

  /* Reloj de partida: se congela si la app se detiene (pausa/segundo plano). */
  function now() { return (performance.now() - pausedAccum) / 1000; }

  const clamp01 = function (v) { return v < 0 ? 0 : (v > 1 ? 1 : v); };
  const ease = function (u) { u = clamp01(u); return u * u * (3 - 2 * u); };
  const lerp = function (a, b, u) { return a + (b - a) * u; };
  const dist = function (ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); };

  /* ---------------- Dificultad del bot ---------------- */
  function botTime(sec) { return sec / (CFG.botSpeed || 1); }

  function paintDifficulty() {
    if (!nodes.opts) return;
    const d = DIFFICULTY[difficulty];
    const btns = nodes.opts.querySelectorAll('[data-diff]');
    for (let i = 0; i < btns.length; i++) {
      const on = btns[i].dataset.diff === difficulty;
      btns[i].classList.toggle('on', on);
      btns[i].setAttribute('aria-checked', on ? 'true' : 'false');
    }
    if (nodes.diffNote) nodes.diffNote.textContent = d.note;
    if (nodes.start) {
      const mbtns = nodes.start.querySelectorAll('[data-menu-diff]');
      for (let j = 0; j < mbtns.length; j++) {
        mbtns[j].classList.toggle('on', mbtns[j].dataset.menuDiff === difficulty);
      }
    }
  }

  function applyDifficulty(id, save) {
    const key = Object.prototype.hasOwnProperty.call(DIFFICULTY, id) ? id : 'normal';
    const d = DIFFICULTY[key];
    difficulty = key;
    CFG.botInterval = d.interval;
    CFG.botFirst = d.first;
    CFG.botSpeed = d.speed;
    if (save) storeSet(DIFF_KEY, key);
    paintDifficulty();
    return key;
  }

  function loadDifficulty() {
    let id = 'normal';
    try { id = storeGet(DIFF_KEY) || 'normal'; } catch (e) { /* nada */ }
    applyDifficulty(id, false);
  }

  function setOptsVisible() {
    if (!nodes.optsBtn) return;
    nodes.optsBtn.hidden = state !== 'menu';
    if (state !== 'menu' && nodes.opts) nodes.opts.classList.remove('on');
  }

  function openOpts() {
    if (!nodes.opts) return;
    paintDifficulty();
    nodes.opts.classList.add('on');
  }

  function closeOpts() {
    if (nodes.opts) nodes.opts.classList.remove('on');
  }

  /* ---------------- Personalización: datos y perfiles ---------------- */
  function uiClone(o) { return JSON.parse(JSON.stringify(o)); }

  function uiNum(v, lo, hi, def) {
    v = Number(v);
    if (!isFinite(v)) return def;
    return Math.min(hi, Math.max(lo, v));
  }

  function uiDefaultElement() {
    return { scale: 1, dx: 0, dy: 0, weight: 0, contrast: 1, bg: null };
  }

  function uiDefaultProfile() {
    const p = {};
    UI_ELEMENTS.forEach(function (e) { p[e.id] = uiDefaultElement(); });
    return p;
  }

  function uiNormalizeElement(id, raw) {
    const d = uiDefaultElement();
    if (!raw || typeof raw !== 'object') return d;
    d.scale = Math.round(uiNum(raw.scale, UI_SCALE_MIN, UI_SCALE_MAX, 1) * 100) / 100;
    d.dx = Math.round(uiNum(raw.dx, -UI_OFFSET, UI_OFFSET, 0));
    d.dy = Math.round(uiNum(raw.dy, -UI_OFFSET, UI_OFFSET, 0));
    d.contrast = Math.round(uiNum(raw.contrast, 0.8, 1.4, 1) * 100) / 100;
    const w = Number(raw.weight);
    d.weight = UI_WEIGHTS.indexOf(w) >= 0 ? w : 0;
    if (raw.bg === null || raw.bg === undefined || raw.bg === '') d.bg = null;
    else d.bg = Math.round(uiNum(raw.bg, 0, 1, UI_META[id].bgDefault) * 100) / 100;
    return d;
  }

  function uiNormalizeProfile(raw) {
    const p = uiDefaultProfile();
    if (!raw || typeof raw !== 'object') return p;
    UI_ELEMENTS.forEach(function (e) {
      if (raw[e.id]) p[e.id] = uiNormalizeElement(e.id, raw[e.id]);
    });
    return p;
  }

  function uiRead() {
    let raw = null;
    try { raw = JSON.parse(storeGet(UI_KEY) || 'null'); } catch (e) { raw = null; }
    if (!raw || typeof raw !== 'object' || !raw.profiles) {
      return { normal: uiDefaultProfile(), vr: uiDefaultProfile() };
    }
    /* v1 se acepta tal cual; versiones futuras se leen por campos conocidos
       y cualquier valor inválido vuelve al predeterminado. */
    return {
      normal: uiNormalizeProfile(raw.profiles.normal),
      vr: uiNormalizeProfile(raw.profiles.vr)
    };
  }

  function uiWrite() {
    if (!uiSaved) return false;
    try {
      storeSet(UI_KEY, JSON.stringify({ v: UI_VERSION, profiles: uiSaved }));
      return true;
    } catch (e) {
      return false;   /* modo privado: queda aplicado en memoria */
    }
  }

  function uiApplyProfile(profile, vr) {
    const data = uiSaved[profile];
    const root = document.documentElement;
    const sfx = vr ? 'v' : '';
    UI_ELEMENTS.forEach(function (e) {
      const v = data[e.id];
      root.style.setProperty('--ui-' + e.id + '-s' + sfx, String(v.scale));
      root.style.setProperty('--ui-' + e.id + '-x' + sfx, v.dx + 'px');
      root.style.setProperty('--ui-' + e.id + '-y' + sfx, v.dy + 'px');
      if (v.contrast !== 1) root.style.setProperty('--ui-' + e.id + '-c' + sfx, String(v.contrast));
      else root.style.removeProperty('--ui-' + e.id + '-c' + sfx);
      if (v.weight) root.style.setProperty('--ui-' + e.id + '-w' + sfx, String(v.weight));
      else root.style.removeProperty('--ui-' + e.id + '-w' + sfx);
      if (v.bg !== null) root.style.setProperty('--ui-' + e.id + '-b' + sfx, String(v.bg));
      else root.style.removeProperty('--ui-' + e.id + '-b' + sfx);
    });
  }

  function uiApplyAll() {
    if (!uiSaved) uiSaved = uiRead();
    uiApplyProfile('normal', false);
    uiApplyProfile('vr', true);
  }

  function uiLoad() {
    uiSaved = uiRead();
    uiApplyAll();
    return uiSaved;
  }

  function uiCommit(profile, data, opts) {
    const p = profile === 'vr' ? 'vr' : 'normal';
    if (!uiSaved) uiSaved = uiRead();
    uiSaved[p] = uiNormalizeProfile(data);
    if (!opts || opts.save !== false) uiWrite();
    if (!opts || opts.apply !== false) uiApplyAll();
    return uiClone(uiSaved[p]);
  }

  /* ---------------- Personalización: vista previa y panel ---------------- */
  function uiPreviewScene() {
    return '<div class="rg-ui-pv-el" data-ui="score">JUGADOR <b data-ui="points">3</b><small> · BOT 1</small></div>' +
      '<div class="rg-ui-pv-el" data-ui="time">2:41</div>' +
      '<div class="rg-ui-pv-el" data-ui="req">PEDIDO <b data-ui="med">VERDE</b></div>' +
      '<div class="rg-ui-pv-el" data-ui="carry">LLEVÁS AZUL</div>' +
      '<div class="rg-ui-pv-el" data-ui="toast">¡A atender clientes!</div>' +
      '<div class="rg-ui-pv-el" data-ui="hint">Acércate al encargado</div>' +
      '<div class="rg-ui-pv-el" data-ui="act">JUGAR</div>';
  }

  function buildUIEditor() {
    if (document.getElementById('rg-ui')) return;
    const root = document.createElement('div');
    root.id = 'rg-ui';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Personalización de interfaz');
    const scene = uiPreviewScene();
    root.innerHTML =
      '<div class="rg-ui-card">' +
        '<div class="rg-ui-head">' +
          '<h2>PERSONALIZACIÓN DE INTERFAZ</h2>' +
          '<button type="button" class="rg-ui-x" id="rg-ui-close" aria-label="Cerrar">✕</button>' +
        '</div>' +
        '<p class="rg-ui-sub">Ajustá tamaño y posición de los textos de la partida. La vista previa muestra los dos modos; los cambios se aplican al confirmar.</p>' +
        '<div class="rg-ui-profiles" role="tablist" aria-label="Perfil">' +
          '<button type="button" role="tab" data-uiprofile="normal">PANTALLA NORMAL</button>' +
          '<button type="button" role="tab" data-uiprofile="vr">VR / SBS</button>' +
        '</div>' +
        '<p class="rg-ui-note">El perfil predeterminado de fábrica se recupera con RESTABLECER TODO.</p>' +
        '<label class="rg-ui-select-row"><span>ELEMENTO</span><select id="rg-ui-el"></select></label>' +
        '<div class="rg-ui-controls">' +
          '<div class="rg-ui-row">' +
            '<span class="rg-ui-label">Tamaño <b id="rg-ui-scale-val">100%</b></span>' +
            '<div class="rg-ui-btns">' +
              '<button type="button" data-step="scale" data-dir="-1" aria-label="Reducir">−</button>' +
              '<input type="range" id="rg-ui-scale" min="60" max="150" step="5" aria-label="Tamaño">' +
              '<button type="button" data-step="scale" data-dir="1" aria-label="Aumentar">+</button>' +
            '</div>' +
          '</div>' +
          '<div class="rg-ui-row">' +
            '<span class="rg-ui-label">Horizontal <b id="rg-ui-dx-val">0 px</b></span>' +
            '<div class="rg-ui-btns">' +
              '<button type="button" data-step="dx" data-dir="-1" aria-label="Izquierda">◀</button>' +
              '<input type="range" id="rg-ui-dx" min="-40" max="40" step="2" aria-label="Posición horizontal">' +
              '<button type="button" data-step="dx" data-dir="1" aria-label="Derecha">▶</button>' +
              '<button type="button" class="rg-ui-center" data-center="dx">CENTRAR</button>' +
            '</div>' +
          '</div>' +
          '<div class="rg-ui-row">' +
            '<span class="rg-ui-label">Vertical <b id="rg-ui-dy-val">0 px</b></span>' +
            '<div class="rg-ui-btns">' +
              '<button type="button" data-step="dy" data-dir="-1" aria-label="Arriba">▲</button>' +
              '<input type="range" id="rg-ui-dy" min="-40" max="40" step="2" aria-label="Posición vertical">' +
              '<button type="button" data-step="dy" data-dir="1" aria-label="Abajo">▼</button>' +
              '<button type="button" class="rg-ui-center" data-center="dy">CENTRAR</button>' +
            '</div>' +
          '</div>' +
          '<div class="rg-ui-row" data-row="weight">' +
            '<span class="rg-ui-label">Grosor de fuente</span>' +
            '<select id="rg-ui-weight">' +
              '<option value="0">Automático</option>' +
              '<option value="400">Fina (400)</option>' +
              '<option value="600">Media (600)</option>' +
              '<option value="700">Fuerte (700)</option>' +
              '<option value="800">Muy fuerte (800)</option>' +
              '<option value="900">Máxima (900)</option>' +
            '</select>' +
          '</div>' +
          '<div class="rg-ui-row" data-row="contrast">' +
            '<span class="rg-ui-label">Contraste <b id="rg-ui-contrast-val">100%</b></span>' +
            '<input type="range" id="rg-ui-contrast" min="80" max="140" step="5" aria-label="Contraste">' +
          '</div>' +
          '<div class="rg-ui-row" data-row="bg">' +
            '<span class="rg-ui-label">Fondo <b id="rg-ui-bg-val">86%</b></span>' +
            '<input type="range" id="rg-ui-bg" min="0" max="100" step="5" aria-label="Opacidad del fondo">' +
          '</div>' +
        '</div>' +
        '<div class="rg-ui-previews" id="rg-ui-previews">' +
          '<div class="rg-ui-prev-box"><span>PANTALLA NORMAL</span>' +
            '<div class="rg-ui-pv-frame rg-ui-pv-normal" id="rg-ui-prev-normal">' + scene + '</div>' +
          '</div>' +
          '<div class="rg-ui-prev-box"><span>VR / SBS</span>' +
            '<div class="rg-ui-pv-frame rg-ui-pv-sbs" id="rg-ui-prev-vr">' +
              '<div class="rg-ui-pv-eye">' + scene + '</div>' +
              '<div class="rg-ui-pv-eye">' + scene + '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="rg-ui-actions">' +
          '<button type="button" class="rg-ui-ghost" id="rg-ui-reset-el">RESTABLECER ELEMENTO</button>' +
          '<button type="button" class="rg-ui-ghost" id="rg-ui-reset-all">RESTABLECER TODO</button>' +
          '<button type="button" class="rg-ui-ghost" id="rg-ui-preview-btn">VISTA PREVIA: SÍ</button>' +
          '<button type="button" class="rg-ui-cancel" id="rg-ui-cancel">CANCELAR</button>' +
          '<button type="button" class="rg-ui-apply" id="rg-ui-apply">APLICAR</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);

    const q = function (sel) { return root.querySelector(sel); };
    uiEditor = {
      root: root,
      el: q('#rg-ui-el'),
      scale: q('#rg-ui-scale'),
      dx: q('#rg-ui-dx'),
      dy: q('#rg-ui-dy'),
      weight: q('#rg-ui-weight'),
      contrast: q('#rg-ui-contrast'),
      bg: q('#rg-ui-bg'),
      scaleVal: q('#rg-ui-scale-val'),
      dxVal: q('#rg-ui-dx-val'),
      dyVal: q('#rg-ui-dy-val'),
      contrastVal: q('#rg-ui-contrast-val'),
      bgVal: q('#rg-ui-bg-val'),
      prevNormal: q('#rg-ui-prev-normal'),
      prevVr: q('#rg-ui-prev-vr'),
      previewBtn: q('#rg-ui-preview-btn')
    };

    UI_ELEMENTS.forEach(function (e) {
      const o = document.createElement('option');
      o.value = e.id;
      o.textContent = e.label;
      uiEditor.el.appendChild(o);
    });

    uiEditor.el.addEventListener('change', function () {
      uiSelId = uiEditor.el.value;
      uiSyncControls();
    });

    root.addEventListener('input', function (ev) {
      const t = ev.target;
      if (t === uiEditor.scale) uiSetDraft({ scale: Number(t.value) / 100 });
      else if (t === uiEditor.dx) uiSetDraft({ dx: Number(t.value) });
      else if (t === uiEditor.dy) uiSetDraft({ dy: Number(t.value) });
      else if (t === uiEditor.contrast) uiSetDraft({ contrast: Number(t.value) / 100 });
      else if (t === uiEditor.bg) uiSetDraft({ bg: Number(t.value) / 100 });
    });

    uiEditor.weight.addEventListener('change', function () {
      uiSetDraft({ weight: Number(uiEditor.weight.value) });
    });

    root.addEventListener('click', function (ev) {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.uiprofile) {
        uiEditProfile = b.dataset.uiprofile === 'vr' ? 'vr' : 'normal';
        uiSyncControls();
        return;
      }
      if (b.dataset.step) {
        const prop = b.dataset.step;
        const dir = Number(b.dataset.dir) || 1;
        const cfg = uiDraft[uiEditProfile][uiSelId];
        if (prop === 'scale') uiSetDraft({ scale: cfg.scale + dir * 0.05 });
        else uiSetDraft({ [prop]: cfg[prop] + dir * 4 });
        return;
      }
      if (b.dataset.center) {
        uiSetDraft({ [b.dataset.center]: 0 });
        return;
      }
      if (b.id === 'rg-ui-close' || b.id === 'rg-ui-cancel') { uiClose(true); return; }
      if (b.id === 'rg-ui-apply') { uiApplyDraft(); return; }
      if (b.id === 'rg-ui-reset-el') {
        uiDraft[uiEditProfile][uiSelId] = uiDefaultElement();
        uiSyncControls();
        uiPaintPreview();
        return;
      }
      if (b.id === 'rg-ui-reset-all') {
        uiDraft[uiEditProfile] = uiDefaultProfile();
        uiSyncControls();
        uiPaintPreview();
        return;
      }
      if (b.id === 'rg-ui-preview-btn') {
        uiPreviewOn = !uiPreviewOn;
        uiSyncControls();
        return;
      }
    });
  }

  function uiSetDraft(patch) {
    if (!uiDraft) return;
    const cur = uiDraft[uiEditProfile][uiSelId];
    Object.keys(patch).forEach(function (k) { cur[k] = patch[k]; });
    uiDraft[uiEditProfile][uiSelId] = uiNormalizeElement(uiSelId, cur);
    uiSyncControls();
    uiPaintPreview();
  }

  function uiSyncControls() {
    if (!uiEditor || !uiDraft) return;
    const cfg = uiDraft[uiEditProfile][uiSelId];
    const meta = UI_META[uiSelId];
    const setVal = function (input, value) { if (input) input.value = String(value); };
    setVal(uiEditor.scale, Math.round(cfg.scale * 100));
    setVal(uiEditor.dx, cfg.dx);
    setVal(uiEditor.dy, cfg.dy);
    setVal(uiEditor.contrast, Math.round(cfg.contrast * 100));
    const bg = cfg.bg === null ? meta.bgDefault : cfg.bg;
    setVal(uiEditor.bg, Math.round(bg * 100));
    if (uiEditor.weight) uiEditor.weight.value = String(cfg.weight);
    uiEditor.scaleVal.textContent = Math.round(cfg.scale * 100) + '%';
    uiEditor.dxVal.textContent = (cfg.dx > 0 ? '+' : '') + cfg.dx + ' px';
    uiEditor.dyVal.textContent = (cfg.dy > 0 ? '+' : '') + cfg.dy + ' px';
    uiEditor.contrastVal.textContent = Math.round(cfg.contrast * 100) + '%';
    uiEditor.bgVal.textContent = Math.round(bg * 100) + '%';
    uiEditor.el.value = uiSelId;
    const tabs = uiEditor.root.querySelectorAll('[data-uiprofile]');
    for (let i = 0; i < tabs.length; i++) {
      const on = tabs[i].dataset.uiprofile === uiEditProfile;
      tabs[i].classList.toggle('on', on);
      tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
    const wRow = uiEditor.root.querySelector('[data-row="weight"]');
    wRow.classList.toggle('off', !meta.weight);
    uiEditor.weight.disabled = !meta.weight;
    const bRow = uiEditor.root.querySelector('[data-row="bg"]');
    bRow.classList.toggle('off', !meta.bg);
    uiEditor.bg.disabled = !meta.bg;
    uiEditor.previewBtn.textContent = 'VISTA PREVIA: ' + (uiPreviewOn ? 'SÍ' : 'NO');
    uiEditor.root.classList.toggle('no-preview', !uiPreviewOn);
  }

  function uiPaintPreview() {
    if (!uiEditor || !uiDraft) return;
    const paint = function (scope, profile, k) {
      if (!scope) return;
      const list = scope.querySelectorAll('[data-ui]');
      for (let i = 0; i < list.length; i++) {
        const el = list[i];
        const id = el.getAttribute('data-ui');
        const meta = UI_META[id];
        if (!meta) continue;
        const cfg = profile[id] || uiDefaultElement();
        const dx = cfg.dx * k, dy = cfg.dy * k;
        const centered = id === 'toast' || id === 'hint' || id === 'act';
        el.style.transform = (centered
          ? 'translate(calc(-50% + ' + dx + 'px), ' + dy + 'px)'
          : 'translate(' + dx + 'px, ' + dy + 'px)') +
          ' scale(' + cfg.scale + ')';
        el.style.filter = 'contrast(' + cfg.contrast + ')';
        el.style.fontWeight = meta.weight && cfg.weight ? String(cfg.weight) : '';
        if (meta.bg) {
          const b = cfg.bg === null ? meta.bgDefault : cfg.bg;
          el.style.backgroundColor = 'rgba(8,22,46,' + b + ')';
        } else {
          el.style.backgroundColor = '';
        }
      }
    };
    const nw = uiEditor.prevNormal ? uiEditor.prevNormal.clientWidth : 92;
    paint(uiEditor.prevNormal, uiDraft.normal, nw / 390);
    const eye = uiEditor.prevVr ? uiEditor.prevVr.querySelector('.rg-ui-pv-eye') : null;
    paint(uiEditor.prevVr, uiDraft.vr, (eye ? eye.clientWidth : 95) / 422);
  }

  function uiOpen() {
    if (!document.getElementById('rg-ui')) buildUIEditor();
    if (!uiEditor) return false;
    if (uiEditor.root.classList.contains('on')) return true;
    if (!uiSaved) uiSaved = uiRead();
    uiDraft = uiClone(uiSaved);
    uiEditProfile = document.body.classList.contains('vr-on') ? 'vr' : 'normal';
    uiSelId = 'score';
    uiPreviewOn = true;
    closeOpts();
    uiEditor.root.classList.add('on');
    uiSyncControls();
    uiPaintPreview();
    return true;
  }

  function uiClose(back) {
    if (uiEditor) uiEditor.root.classList.remove('on');
    uiDraft = null;
    if (back && state === 'idle') openOpts();
    return true;
  }

  function uiApplyDraft() {
    if (!uiDraft) return false;
    uiSaved = {
      normal: uiNormalizeProfile(uiDraft.normal),
      vr: uiNormalizeProfile(uiDraft.vr)
    };
    uiWrite();
    uiApplyAll();
    uiClose(true);
    toast('Interfaz actualizada', 'ok');
    return true;
  }

  const uiApi = {
    elements: function () {
      return UI_ELEMENTS.map(function (e) {
        return { id: e.id, label: e.label, weight: e.weight, bg: e.bg };
      });
    },
    state: function () {
      if (!uiSaved) uiSaved = uiRead();
      return {
        version: UI_VERSION,
        active: document.body.classList.contains('vr-on') ? 'vr' : 'normal',
        profiles: uiClone(uiSaved)
      };
    },
    get: function (profile) {
      if (!uiSaved) uiSaved = uiRead();
      return uiClone(uiSaved[profile === 'vr' ? 'vr' : 'normal']);
    },
    set: function (profile, id, patch, opts) {
      if (!UI_META[id]) return false;
      const base = uiApi.get(profile);
      base[id] = Object.assign({}, base[id], patch || {});
      uiCommit(profile, base, opts);
      return true;
    },
    setProfile: function (profile, data, opts) {
      uiCommit(profile, data, opts);
      return true;
    },
    reset: function (profile, id, opts) {
      const base = uiApi.get(profile);
      if (id && UI_META[id]) {
        base[id] = uiDefaultElement();
      } else {
        const def = uiDefaultProfile();
        Object.keys(def).forEach(function (k) { base[k] = def[k]; });
      }
      uiCommit(profile, base, opts);
      return true;
    },
    load: function () {
      uiLoad();
      return uiClone(uiSaved);
    },
    open: function () { return uiOpen(); },
    close: function (back) { return uiClose(!!back); }
  };

  /* ---------------- Etiquetas 3D ---------------- */
  function makeTag(w, h) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = Math.max(64, Math.round(512 * h / w));
    const q = c.getContext('2d');
    const tex = new T.CanvasTexture(c);
    tex.anisotropy = 4;
    const spr = new T.Sprite(new T.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false, fog: false
    }));
    spr.scale.set(w, h, 1);
    spr.renderOrder = 16;
    const tag = { spr: spr, c: c, q: q, tex: tex, w: w, h: h };
    TAGS.push(tag);
    return tag;
  }

  function drawTag(tag, o) {
    const c = tag.c, q = tag.q, W = c.width, H = c.height;
    q.clearRect(0, 0, W, H);
    const pad = 7, r = 26;
    q.beginPath();
    q.moveTo(pad + r, pad);
    q.arcTo(W - pad, pad, W - pad, H - pad, r);
    q.arcTo(W - pad, H - pad, pad, H - pad, r);
    q.arcTo(pad, H - pad, pad, pad, r);
    q.arcTo(pad, pad, W - pad, pad, r);
    q.closePath();
    q.fillStyle = 'rgba(7, 20, 42, .9)';
    q.fill();
    q.lineWidth = 5;
    q.strokeStyle = o.color || 'rgba(255,255,255,.45)';
    q.stroke();

    let x = 30;
    if (o.color) {
      q.beginPath();
      q.arc(74, H / 2, 31, 0, 6.2832);
      q.fillStyle = o.color;
      q.fill();
      q.lineWidth = 5;
      q.strokeStyle = 'rgba(255,255,255,.92)';
      q.stroke();
      x = 122;
    }
    const font = function (px, w) {
      return w + ' ' + px + 'px "Exo 2", system-ui, sans-serif';
    };
    q.textAlign = 'left';
    q.textBaseline = 'middle';
    q.fillStyle = '#fff';
    let fs = o.sub ? 44 : 50;
    const room = W - x - 24;
    q.font = font(fs, '800');
    while (fs > 20 && q.measureText(o.title).width > room) {
      fs -= 2;
      q.font = font(fs, '800');
    }
    q.fillText(o.title, x, o.sub ? H / 2 - 15 : H / 2 + 1);
    if (o.sub) {
      q.fillStyle = 'rgba(255,255,255,.76)';
      q.font = font(27, '600');
      q.fillText(o.sub, x, H / 2 + 27);
    }
    tag.tex.needsUpdate = true;
  }

  function glowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const q = c.getContext('2d');
    const g = q.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,.9)');
    g.addColorStop(0.35, 'rgba(255,255,255,.28)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    q.fillStyle = g;
    q.fillRect(0, 0, 128, 128);
    return new T.CanvasTexture(c);
  }

  /* ---------------- Piezas 3D ---------------- */
  function addMesh(geo, mat, x, y, z, parent) {
    const m = new T.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  /* Persona a escala reducida (el escenario está construido a escala
     "modelo": el jugador mide 6.2 unidades). Devuelve un grupo externo sin
     escala para colgar carteles en unidades de mundo.

     k   escala del cuerpo (1 = 9.1 unidades de alto)
     El rostro mira hacia +z, igual que el arranque del jugador. */
  function buildPerson(coat, k) {
    const ph = G.pharmacy;
    const sc = (typeof k === 'number' ? k : K) * 1.05;
    const isCoat = coat === G.mats.white;
    const isGreen = coat === G.mats.green;
    const shirt = isGreen ? 0x1fa070 : (isCoat ? 0xf4f8f6 : 0x1f5fd0);
    const v = isCoat ? 12 : (isGreen ? 4 : 0);
    const inner = ph.makePerson(shirt, 0x2b1b12, 0xf1cfae, v,
      isCoat ? { white: true, low: true } : { low: true });
    inner.scale.setScalar(sc);
    const outer = new T.Group();
    outer.add(inner);
    outer.userData.inner = inner;
    outer.userData.scale = sc;
    return outer;
  }

  /* Altura del cartel justo encima de la cabeza, en unidades de mundo. */
  function headTop(p) { return 5.1 * (p.userData.scale || K); }

  function buildNpc() {
    /* El farmacéutico del HTML (AT) ya está en la escena; se usa tal cual. */
    const g = G.pharmacy.pharmacist;
    g.visible = true;
    g.rotation.y = 0;                            // de cara al mostrador (+z)
    S.npc = { group: g, p: g.userData.p || {}, head: g.userData.H || null, tag: null };
  }

  function drugName(idx) {
    const ph = G && G.pharmacy ? G.pharmacy : window.RasmaticPharmacyApi;
    if (ph && ph.drugs && ph.drugs[idx]) return ph.drugs[idx].name.toUpperCase();
    return 'MEDICAMENTO';
  }

  function drugLabel(c) {
    const st = stationForColor(c);
    return drugName(st ? st.drug : COLOR_DRUGS[c]);
  }

  function stationForColor(c) {
    const ph = G && G.pharmacy ? G.pharmacy : window.RasmaticPharmacyApi;
    return ph && ph.stations ? ph.stations.filter(function (s) { return s.color === c; })[0] : null;
  }

  function stationForBox(box) {
    for (let i = 0; i < S.stations.length; i++) {
      if (S.stations[i].box === box) return S.stations[i];
    }
    return null;
  }

  function boxColor(box) {
    const st = stationForBox(box);
    if (st) return st.def.c;
    const n = box && box.userData ? box.userData.n : -1;
    if (G && G.pharmacy && typeof G.pharmacy.drugColor === 'function') {
      return G.pharmacy.drugColor(n);
    }
    return ((n % COLORS.length) + COLORS.length) % COLORS.length;
  }

  function targetDrug(t) {
    if (!t) return -1;
    if (typeof t.drug === 'number' && t.drug >= 0) return t.drug;
    if (t.box && t.box.userData && typeof t.box.userData.n === 'number') {
      return t.box.userData.n;
    }
    return t.pharmacy ? t.pharmacy.drug : COLOR_DRUGS[t.def.c];
  }

  function targetAvailable(t) {
    if (!t || !t.box) return false;
    if (t.box.userData && t.box.userData.consumed) return false;
    const st = stationForBox(t.box);
    if (st && !t.box.userData.taken && (stockP[st.def.c] || 0) <= 0) return false;
    return true;
  }

  function buildStations() {
    const ph = G.pharmacy;
    S.stations.length = 0;
    STATIONS.length = 0;
    ph.stations.forEach(function (s) {
      const box = s.box;
      box.visible = true;
      box.userData.taken = false;
      box.userData.dropped = false;
      box.userData.onBelt = false;
      box.userData.held = false;
      box.userData.consumed = false;
      box.userData.stationColor = s.color;
      STATIONS.push({ c: s.color, x: s.x, z: s.z });
      S.stations.push({
        def: { c: s.color, x: s.x, z: s.z }, group: box, box: box,
        mat: null, edge: null, pharmacy: s, drug: s.drug
      });
    });
    updateStationSigns();
  }

  function updateStationSigns() {
    /* V21: sin etiquetas flotantes. La caja se muestra u oculta según stock;
       la selección se comunica solo con el contorno de la mira.
       V21.1: una caja tomada, en la mano, tirada o en la cinta sigue visible
       aunque su stock sea 0; solo se oculta al ser entregada (consumed). */
    S.stations.forEach(function (st) {
      const n = stockP[st.def.c] || 0;
      const u = (st.box && st.box.userData) || {};
      const visible = !u.consumed && (n > 0 || u.taken || u.dropped || u.onBelt || u.held);
      if (st.box) st.box.visible = visible;
      if (st.edge) st.edge.visible = visible;
    });
  }

  const CLIENT_SHIRTS = [0x1f5fd0, 0x1fa070, 0xe8453c, 0xf2c63a, 0x7c3aed, 0x0891b2];
  const CLIENT_HAIRS = [0x2b1b12, 0x3b2616, 0x2f5a45, 0x5a3a22, 0x6b4423, 0x1a1210];
  const CLIENT_SKINS = [0xf1cfae, 0xe8b88c, 0xc99467, 0x8d5a3a, 0xf0c9a0, 0xd9a06b];

  function buildClients() {
    S.clients.length = 0;
    S.queue.length = 0;
    S.leaving.length = 0;
    for (let i = 0; i < 6; i++) {
      const inner = G.pharmacy.makePerson(
        CLIENT_SHIRTS[i % CLIENT_SHIRTS.length],
        CLIENT_HAIRS[i % CLIENT_HAIRS.length],
        CLIENT_SKINS[i % CLIENT_SKINS.length],
        2 + i,
        { low: true }
      );
      const scale = 0.82 + (i % 3) * 0.02;
      inner.scale.setScalar(scale);
      const group = new T.Group();
      group.add(inner);
      group.visible = false;
      group.userData.scale = scale;
      G.place.add(group);
      S.clients.push({
        group: group, inner: inner, p: inner.userData.p, head: inner.userData.H,
        variant: i, phase: 0, request: -1, slot: -1, state: 'hidden',
        speed: 0, reactAt: 0, badAt: 0, pop: 1
      });
    }
    S.botCustomer = null;
  }

  function buildBotCustomer() {
    const g = buildPerson(G.mats.green, 0.82);
    g.position.set(SPOT.bot.x, G.home.floor, SPOT.bot.z);
    g.rotation.y = Math.PI;                      // mira a la máquina (-z)
    g.visible = false;
    G.place.add(g);
    S.botCustomer = { group: g, tag: null, pop: 0 };
  }

  function buildKiosk() {
    const M = G.mats;
    const g = new T.Group();
    g.position.set(SPOT.kiosk.x, G.home.floor, SPOT.kiosk.z);

    addMesh(new T.BoxGeometry(1.0, 0.28, 1.0), M.dark, 0, 0.14, 0, g);
    addMesh(new T.CylinderGeometry(0.22, 0.28, 3.5, 12), M.alu, 0, 2.0, 0, g);

    const head = new T.Group();
    head.position.set(0, 3.9, 0);
    head.rotation.y = -0.5;                      // pantalla hacia el pasillo
    g.add(head);
    addMesh(new T.BoxGeometry(1.6, 1.0, 0.16), M.dark, 0, 0, 0, head);
    const screenMat = new T.MeshBasicMaterial({ color: 0x39d0ff });
    addMesh(new T.PlaneGeometry(1.38, 0.78), screenMat, 0, 0, 0.1, head);

    const arm = new T.Group();
    arm.position.set(0.62, 2.9, 0.15);
    g.add(arm);
    addMesh(new T.CylinderGeometry(0.09, 0.09, 1.5, 8), M.alu, 0, 0.75, 0, arm);
    const fore = addMesh(new T.CylinderGeometry(0.07, 0.07, 1.3, 8), M.alu, 0, 1.5, 0.45, arm);
    fore.rotation.x = 1.0;
    addMesh(new T.SphereGeometry(0.14, 10, 8), M.blue, 0, 1.55, 1.05, arm);

    const tag = makeTag(2.8, 0.8);
    tag.spr.position.set(0, 6.2, 0);
    drawTag(tag, { title: 'BOT · CNC', color: '#ffc46b' });
    g.add(tag.spr);

    G.place.add(g);
    S.kiosk = { group: g, screenMat: screenMat, arm: arm, tag: tag };
  }

  /* Cajas de la RASMATIC BOT: se usan las cajas reales del HTML (MB), que ya
     tienen la textura y el medicamento. No se repintan ni se reparentan. */
  function buildBotBoxes() {
    const spec = G.spec;
    for (let i = 0; i < COLORS.length; i++) {
      const st = G.pharmacy.stations.filter(function (x) { return x.color === i; })[0];
      const d = st ? st.drug : COLOR_DRUGS[i];
      let sp = spec.filter(function (s) { return s.drug === d; })[0];
      if (!sp) sp = spec[i];
      if (!sp || !sp.mesh) continue;
      const m = sp.mesh;
      m.visible = true;
      m.scale.set(1, 1, 1);
      m.rotation.set(0, 0, 0);
      m.position.copy(m.userData && m.userData.home ? m.userData.home : m.position);
      S.botBoxes.push({ color: i, spec: sp, mesh: m, home: m.position.clone() });
    }
  }

  function buildHand() {
    /* V21: el jugador lleva una caja de medicamento real, no un cubo de color. */
    handMesh = new T.Mesh(
      G.pharmacy.drugGeometry(0.9, 0.75, 0.4),
      new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 })
    );
    handMesh.position.set(0.55, -0.52, -1.25);
    handMesh.rotation.set(-0.12, -0.35, 0.1);
    handMesh.visible = false;
    G.camera.add(handMesh);
    G.scene.add(G.camera);
  }

  function hideLegacy() {
    /* V20: la escena del almacén ya no existe; no hay carteles legacy que
       ocultar. Se conserva la función por compatibilidad con el arranque. */
  }

  /* ============================================================
     V21 · FILA DE CLIENTES
     ============================================================ */
  function pickClientColor() {
    const used = S.queue.map(function (q) { return q.request; });
    const avail = [];
    for (let i = 0; i < COLORS.length; i++) {
      if (stockP[i] > 0 && used.indexOf(i) < 0) avail.push(i);
    }
    if (!avail.length) {
      for (let j = 0; j < COLORS.length; j++) if (stockP[j] > 0) avail.push(j);
    }
    if (!avail.length) return -1;
    return avail[Math.floor(Math.random() * avail.length)];
  }

  function spawnClient(initial) {
    if (S.queue.length >= CFG.queueSize) return false;
    const free = S.clients.filter(function (c) { return c.state === 'hidden'; })[0];
    if (!free) return false;
    const c = pickClientColor();
    if (c < 0) return false;
    free.request = c;
    free.slot = S.queue.length;
    free.state = initial ? 'waiting' : 'walking';
    free.phase = Math.random() * Math.PI * 2;
    free.pop = 0;
    free.badAt = 0;
    free.reactAt = 0;
    free.group.visible = true;
    free.group.scale.setScalar(1);
    if (initial) {
      const q = QUEUE[free.slot];
      free.group.position.set(q.x, 0, q.z);
      free.group.rotation.y = Math.PI;
    } else {
      free.group.position.set(
        CLIENT_ENTRY.x + (free.variant % 2) * 0.7,
        0,
        CLIENT_ENTRY.z + (free.variant % 3) * 0.45
      );
      free.group.rotation.y = Math.PI;
    }
    S.queue.push(free);
    if (S.queue.length === 1) {
      requestP = c;
      setRequest(c);
    }
    return true;
  }

  function releaseFront() {
    if (!S.queue.length) return;
    const front = S.queue.shift();
    front.slot = -1;
    front.state = 'leaving';
    front.leaveAt = now();
    if (S.leaving.indexOf(front) < 0) S.leaving.push(front);
    for (let i = 0; i < S.queue.length; i++) S.queue[i].slot = i;
    const next = S.queue[0];
    requestP = next ? next.request : -1;
    setRequest(requestP);
    pendingSpawns.push({ at: now() + 0.8, initial: false });
  }

  function resetClients() {
    S.queue.length = 0;
    S.leaving.length = 0;
    pendingSpawns = [];
    requestP = -1;
    for (let i = 0; i < S.clients.length; i++) {
      const c = S.clients[i];
      c.state = 'hidden';
      c.slot = -1;
      c.request = -1;
      c.group.visible = false;
      c.group.position.set(0, 0, 0);
      c.group.scale.setScalar(1);
    }
    setRequest(-1);
  }

  function animateClient(c, t, moving) {
    const p = c.p;
    if (!p) return;
    const ph = c.phase;
    if (c.state === 'receiving') {
      const u = clamp01((t - c.reactAt) / 0.55);
      const lift = Math.sin(u * Math.PI);
      if (p.al) p.al.rotation.x = -1.15 * ease(u);
      if (p.ar) p.ar.rotation.x = -1.15 * ease(u);
      if (c.head) c.head.rotation.x = -0.12 * lift;
      c.inner.position.y = Math.abs(Math.sin(u * Math.PI)) * 0.12;
      return;
    }
    if (moving) {
      const sw = Math.sin(t * 7 + ph) * 0.55;
      if (p.l) p.l.rotation.x = sw;
      if (p.r) p.r.rotation.x = -sw;
      if (p.al) p.al.rotation.x = -sw * 0.65;
      if (p.ar) p.ar.rotation.x = sw * 0.65;
      if (c.head) c.head.rotation.y = Math.sin(t * 2 + ph) * 0.05;
      c.inner.position.y = Math.abs(Math.sin(t * 7 + ph)) * 0.05;
      return;
    }
    const bad = c.badAt && t - c.badAt < 0.9;
    if (p.l) p.l.rotation.x *= 0.82;
    if (p.r) p.r.rotation.x *= 0.82;
    if (p.al) p.al.rotation.x = 0.05 + Math.sin(t * 1.6 + ph) * 0.045;
    if (p.ar) p.ar.rotation.x = 0.05 + Math.sin(t * 1.6 + ph + 1.7) * 0.045;
    if (c.head) {
      c.head.rotation.y = bad
        ? Math.sin(t * 22) * 0.3
        : Math.sin(t * 0.8 + ph) * 0.14;
      c.head.rotation.x = bad ? 0 : Math.sin(t * 1.1 + ph) * 0.025;
    }
    c.inner.position.y = Math.sin(t * 2 + ph) * 0.012;
  }

  function updateClients(dt, t) {
    for (let i = 0; i < S.clients.length; i++) {
      const c = S.clients[i];
      if (c.state === 'hidden') continue;
      if (c.state === 'walking' || c.state === 'leaving') {
        const target = c.state === 'walking' ? QUEUE[c.slot] : CLIENT_EXIT;
        const dx = target.x - c.group.position.x;
        const dz = target.z - c.group.position.z;
        const d = Math.hypot(dx, dz);
        const speed = c.state === 'walking' ? 2.3 : 2.5;
        const moving = d > 0.06;
        if (moving) {
          const step = Math.min(d, speed * dt);
          c.group.position.x += dx / d * step;
          c.group.position.z += dz / d * step;
          c.group.rotation.y = Math.atan2(dx, dz);
        } else if (c.state === 'walking') {
          c.group.position.x = target.x;
          c.group.position.z = target.z;
          c.group.rotation.y = Math.PI;
          c.state = 'waiting';
        } else {
          c.state = 'hidden';
          c.group.visible = false;
          const li = S.leaving.indexOf(c);
          if (li >= 0) S.leaving.splice(li, 1);
          continue;
        }
        animateClient(c, t, moving);
      } else if (c.state === 'waiting' || c.state === 'receiving') {
        c.group.rotation.y = Math.PI;
        animateClient(c, t, false);
        if (c.state === 'receiving' && t - c.reactAt > 1.2) {
          /* La salida la dispara releaseFront al cumplirse releaseAt. */
        }
      }
    }
  }

  /* ============================================================
     V21 · CINTA DE ENTREGA + EMPLEADO
     ============================================================ */
  function buildBeltPool() {
    const geo = G.pharmacy.drugGeometry(1.15, 0.95, 0.5);
    for (let i = 0; i < 4; i++) {
      const mesh = new T.Mesh(geo, new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
      mesh.visible = false;
      G.place.add(mesh);
      S.beltPool.push(mesh);
    }
    belt.path = G.pharmacy.conveyor.path;
    belt.total = 0;
    belt.segs = [];
    for (let i = 0; i < belt.path.length - 1; i++) {
      const a = belt.path[i], b = belt.path[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      belt.segs.push({ a: a, b: b, len: len, from: belt.total });
      belt.total += len;
    }
    belt.speed = 0;
  }

  function sampleBelt(s) {
    const total = belt.total || 0.001;
    const q = Math.max(0, Math.min(total, s));
    for (let i = 0; i < belt.segs.length; i++) {
      const seg = belt.segs[i];
      if (q <= seg.from + seg.len || i === belt.segs.length - 1) {
        const u = seg.len > 0.0001 ? (q - seg.from) / seg.len : 0;
        const x = lerp(seg.a.x, seg.b.x, u);
        const y = lerp(seg.a.y, seg.b.y, u);
        const z = lerp(seg.a.z, seg.b.z, u);
        const yaw = Math.atan2(seg.b.x - seg.a.x, seg.b.z - seg.a.z);
        return { x: x, y: y, z: z, yaw: yaw };
      }
    }
    const last = belt.path[belt.path.length - 1];
    return { x: last.x, y: last.y, z: last.z, yaw: Math.PI / 2 };
  }

  function stationDrug(color) {
    const st = S.stations.filter(function (s) { return s.def.c === color; })[0];
    return st && st.pharmacy ? st.pharmacy.drug : COLOR_DRUGS[color];
  }

  function nearBeltEntry() {
    const e = G.pharmacy.conveyor.entry;
    return dist(G.player.x, G.player.z, e.x, e.z) <= CFG.beltEntryRadius;
  }

  function placeOnBelt() {
    if (carrying < 0) return false;
    if (!nearBeltEntry()) return false;
    for (let i = 0; i < belt.items.length; i++) {
      if (belt.items[i].s < CFG.beltSpacing * 1.2) {
        toast('La cinta está ocupada', 'bad');
        return false;
      }
    }
    const color = carrying;
    const drug = carryingDrug >= 0 ? carryingDrug : stationDrug(color);
    let mesh = carryingBox;
    if (mesh) {
      if (mesh.parent !== G.place) G.place.attach(mesh);
      const p0 = sampleBelt(0);
      mesh.position.set(p0.x, p0.y + 0.48, p0.z);
      mesh.rotation.set(0, p0.yaw, 0);
      mesh.scale.set(1, 1, 1);
      mesh.visible = true;
      mesh.userData.held = false;
      mesh.userData.dropped = false;
      mesh.userData.onBelt = true;
    } else {
      /* Respaldo: si no hay caja real (por ejemplo, una partida restaurada
         desde una prueba antigua), se usa una caja del pool. */
      mesh = S.beltPool.filter(function (m) { return !m.visible; })[0];
      if (!mesh) {
        toast('La cinta está llena', 'bad');
        return false;
      }
      mesh.material = G.pharmacy.drugKit(G.pharmacy.drugs[drug]).m;
      mesh.visible = true;
      mesh.scale.set(1, 1, 1);
    }
    const item = {
      color: color, drug: drug, mesh: mesh, s: 0, held: false,
      fromStock: !!carryingFromStock
    };
    belt.items.push(item);
    clearCarrying();
    setCarry(-1);
    updateStationSigns();
    toast('Medicamento en la cinta', 'ok');
    return true;
  }

  function clearCarrying() {
    carrying = -1;
    carryingDrug = -1;
    carryingBox = null;
    carryingFromStock = false;
  }

  function returnBoxHome(box) {
    if (!box) return;
    const u = box.userData || {};
    if (!u.home) return;
    if (box.parent !== G.place) G.place.attach(box);
    box.position.copy(u.home);
    if (u.q) box.quaternion.copy(u.q);
    else box.rotation.set(0, u.ry || 0, 0);
    box.scale.set(1, 1, 1);
    box.visible = true;
    u.taken = false;
    u.dropped = false;
    u.onBelt = false;
    u.held = false;
    u.consumed = false;
  }

  function dropCarried() {
    const box = carryingBox;
    if (!box) return false;
    if (!G || !G.player) return false;
    const p = G.player;
    const b = G.pharmacy.bounds;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    let x = p.x + fx * 1.45;
    let z = p.z + fz * 1.45;
    if (b) {
      x = Math.max(b.minX + 0.7, Math.min(b.maxX - 0.7, x));
      z = Math.max(b.minZ + 0.7, Math.min(b.maxZ - 0.7, z));
    }
    if (box.parent !== G.place) G.place.attach(box);
    box.position.set(x, (G.home && G.home.floor ? G.home.floor : 0) + 0.5, z);
    box.rotation.set(0, p.yaw + Math.PI, 0);
    box.scale.set(1, 1, 1);
    box.visible = true;
    box.userData.held = false;
    box.userData.dropped = true;
    box.userData.onBelt = false;
    clearCarrying();
    setCarry(-1);
    updateStationSigns();
    toast('Soltaste ' + drugName(box.userData.n), 'ok');
    clearAim();
    return true;
  }

  function resetShelfBoxes() {
    if (G && G.pharmacy && typeof G.pharmacy.resetShelfBoxes === 'function') {
      G.pharmacy.resetShelfBoxes();
    }
    clearCarrying();
  }

  function updateBelt(dt, t) {
    const speed = belt.items.length && state === 'playing' ? CFG.beltSpeed : 0;
    belt.speed = speed;
    if (G.pharmacy.conveyor && G.pharmacy.conveyor.setSpeed) {
      G.pharmacy.conveyor.setSpeed(speed);
    }
    const list = belt.items.slice().sort(function (a, b) { return b.s - a.s; });
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      const ahead = i > 0 ? list[i - 1] : null;
      const max = ahead ? Math.max(0, ahead.s - CFG.beltSpacing) : belt.total;
      it.s = Math.min(max, it.s + speed * dt);
      const p = sampleBelt(it.s);
      it.mesh.position.set(p.x, p.y + 0.48, p.z);
      it.mesh.rotation.y = p.yaw;
    }
  }

  function updateEmployee(dt, t) {
    const p = S.npc && S.npc.p;
    const head = S.npc && S.npc.head;
    if (!p) return;

    if (!employee) {
      if (p.al) p.al.rotation.x = 0.05 + Math.sin(t * 1.25) * 0.05;
      if (p.ar) p.ar.rotation.x = 0.05 + Math.sin(t * 1.25 + 1.4) * 0.05;
      if (p.al) p.al.rotation.z = 0;
      if (p.ar) p.ar.rotation.z = 0;
      if (head) {
        head.rotation.y = Math.sin(t * 0.65) * 0.1;
        head.rotation.x = Math.sin(t * 0.9) * 0.02;
      }
      if (state !== 'playing' || !S.queue.length || requestP < 0) return;
      let ready = null;
      for (let i = 0; i < belt.items.length; i++) {
        const it = belt.items[i];
        if (it.s >= belt.total - 0.01 && (!ready || it.s > ready.s)) ready = it;
      }
      if (!ready) return;
      belt.items.splice(belt.items.indexOf(ready), 1);
      employee = {
        phase: 'pickup', t0: t, item: ready,
        from: ready.mesh.position.clone(),
        hand: new T.Vector3(23.6, 2.72, 12.45),
        client: S.queue[0]
      };
      return;
    }

    if (employee.phase === 'return') {
      if (t - employee.t0 >= 0.45) {
        if (p.al) p.al.rotation.z = 0;
        if (p.ar) p.ar.rotation.z = 0;
        employee = null;
      }
      return;
    }

    const item = employee.item;
    if (!item) { employee = null; return; }
    if (p.al) p.al.rotation.x = -0.95;
    if (p.ar) { p.ar.rotation.x = -1.25; p.ar.rotation.z = -0.35; }
    if (head) head.rotation.y = -0.12;

    if (employee.phase === 'pickup') {
      const u = clamp01((t - employee.t0) / 0.55);
      item.mesh.position.lerpVectors(employee.from, employee.hand, ease(u));
      item.mesh.position.y += Math.sin(u * Math.PI) * 0.25;
      item.mesh.rotation.y = lerp(item.mesh.rotation.y, Math.PI / 2, u);
      if (u >= 1) {
        employee.phase = 'handoff';
        employee.t0 = t;
        employee.handFrom = employee.hand.clone();
        const client = S.queue[0] || employee.client;
        employee.handTo = new T.Vector3(client ? client.group.position.x : 21.9, 2.35,
          (client ? client.group.position.z : 15.5) - 0.35);
      }
      return;
    }

    if (employee.phase === 'handoff') {
      const u = clamp01((t - employee.t0) / 0.7);
      item.mesh.position.lerpVectors(employee.handFrom, employee.handTo, ease(u));
      item.mesh.position.y += Math.sin(u * Math.PI) * 0.18;
      if (u >= 1) {
        item.mesh.visible = false;
        resolveBeltDelivery(item);
        employee = { phase: 'return', t0: t, item: null };
      }
      return;
    }

  }

  function returnFailedItem(item) {
    if (!item) return;
    if (item.fromStock) stockP[item.color] = (stockP[item.color] || 0) + 1;
    if (item.mesh && item.mesh.userData && item.mesh.userData.kind === 'shelf') {
      returnBoxHome(item.mesh);
    } else if (item.mesh) {
      item.mesh.visible = false;
      if (item.mesh.parent === G.place) G.place.remove(item.mesh);
      if (S.beltPool.indexOf(item.mesh) < 0 && item.mesh.userData) {
        item.mesh.userData.consumed = false;
      }
    }
    updateStationSigns();
  }

  function resolveBeltDelivery(item) {
    const client = S.queue[0];
    if (!client || requestP < 0) {
      returnFailedItem(item);
      toast('No hay cliente para ese pedido', 'bad');
      return;
    }
    /* V21.1: se valida el medicamento exacto, no solo su color. Así una caja
       de otra presentación no cuenta aunque comparta categoría. */
    const expected = stationDrug(client.request);
    if (item.drug === expected) {
      scoreP++;
      setScore();
      requestP = -1;
      setRequest(-1);
      client.state = 'receiving';
      client.reactAt = now();
      releaseAt = now() + 1.0;
      if (item.mesh) {
        const station = stationForBox(item.mesh);
        if (station && (stockP[item.color] || 0) > 0) {
          /* Quedan unidades de esta estación: la caja vuelve a su lugar como
             una unidad nueva (el stock ya se descontó al tomarla). */
          returnBoxHome(item.mesh);
        } else {
          item.mesh.visible = false;
          item.mesh.userData.onBelt = false;
          item.mesh.userData.consumed = true;
        }
      }
      updateStationSigns();
      toast('¡Correcto! +1', 'ok');
    } else {
      returnFailedItem(item);
      client.badAt = now();
      toast('Medicamento incorrecto', 'bad');
    }
  }

  /* ============================================================
     V21 · MIRA Y CONTORNO
     ============================================================ */
  function buildAim() {
    const geo = new T.BoxGeometry(1.15, 0.95, 0.5);
    const shell = new T.Mesh(geo, new T.MeshBasicMaterial({
      color: 0xffe14d, side: T.BackSide, transparent: true,
      opacity: 0.38, depthWrite: false
    }));
    shell.scale.set(1.08, 1.08, 1.08);
    const lines = new T.LineSegments(
      new T.EdgesGeometry(geo),
      new T.LineBasicMaterial({ color: 0xfff3a0, transparent: true, opacity: 0.95 })
    );
    const group = new T.Group();
    group.add(shell);
    group.add(lines);
    group.visible = false;
    G.place.add(group);
    aim.outline = group;
    aim.shell = shell;
    aim.lines = lines;
  }

  function clearAim() {
    aim.target = null;
    aim.drug = -1;
    aim.hitDistance = 0;
    if (aim.outline) aim.outline.visible = false;
  }

  function aimTargetFor(box) {
    if (!box) return null;
    const st = stationForBox(box);
    const drug = box.userData ? box.userData.n : -1;
    if (st) {
      st.drug = drug;
      return st;
    }
    const p = new T.Vector3();
    box.getWorldPosition(p);
    return {
      def: { c: boxColor(box), x: p.x, z: p.z }, group: box, box: box,
      mat: null, edge: null, pharmacy: null, drug: drug
    };
  }

  function updateAim(t) {
    if (t < aim.nextAt) return;
    aim.nextAt = t + 0.1;
    if (!G || state !== 'playing' || core.getMode() !== 'place') {
      clearAim();
      return;
    }
    const cam = G.camera;
    aimOrigin.copy(cam.position);
    if (window.RasmaticVR && typeof window.RasmaticVR.aimQuaternion === 'function') {
      aimQuat.copy(window.RasmaticVR.aimQuaternion());
    } else {
      aimQuat.copy(cam.quaternion);
    }
    aimDir.set(0, 0, -1).applyQuaternion(aimQuat).normalize();
    raycaster.set(aimOrigin, aimDir);
    raycaster.far = CFG.aimRange;
    /* V21.1: todas las cajas de las estanterías son candidatas individuales.
       Se excluyen solo las que están en la mano, en la cinta o ya entregadas. */
    const objects = [];
    const boxes = G.pharmacy.shelfBoxes || [];
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      const u = b.userData || {};
      if (b.visible && !u.held && !u.onBelt && !u.consumed) objects.push(b);
    }
    const hits = raycaster.intersectObjects(objects, false);
    if (!hits.length) { clearAim(); return; }
    const target = aimTargetFor(hits[0].object);
    if (!target) { clearAim(); return; }
    aim.target = target;
    aim.drug = targetDrug(target);
    aim.hitDistance = hits[0].distance;
    target.box.getWorldPosition(tmpV);
    target.box.getWorldQuaternion(tmpQ);
    aim.outline.position.copy(tmpV);
    aim.outline.quaternion.copy(tmpQ);
    aim.outline.scale.setScalar(1.02);
    aim.outline.visible = true;
    aim.shell.material.opacity = 0.3 + 0.16 * (0.5 + 0.5 * Math.sin(t * 6));
    aim.lines.material.opacity = 0.7 + 0.25 * (0.5 + 0.5 * Math.sin(t * 6 + 1));
  }

  /* ============================================================
     V21 · MENÚ Y CUENTA REGRESIVA
     ============================================================ */
  function showMenu(on) {
    if (!nodes.start) return;
    nodes.start.classList.toggle('on', !!on);
    if (nodes.hud) {
      nodes.hud.classList.toggle('v21-menu-open', !!on);
      if (on) nodes.hud.classList.remove('v21-countdown-open');
    }
    if (on) {
      if (nodes.countdown) nodes.countdown.classList.remove('on');
      state = 'menu';
      clearAim();
      setRequest(-1);
      setCarry(-1);
      setAction(null, '');
      setHint(null);
      setTime(CFG.duration);
      setOptsVisible();
      paintDifficulty();
    }
  }

  function setCountdownNumber(n) {
    if (!nodes.countNum || !nodes.countdown) return;
    nodes.countNum.textContent = String(n);
    nodes.countdown.classList.remove('tick');
    void nodes.countdown.offsetWidth;
    nodes.countdown.classList.add('tick');
  }

  function startCountdown() {
    if (state !== 'menu') return false;
    state = 'countdown';
    countdownAt = now();
    countdownStep = 3;
    if (nodes.start) nodes.start.classList.remove('on');
    if (nodes.countdown) nodes.countdown.classList.add('on');
    if (nodes.hud) {
      nodes.hud.classList.remove('v21-menu-open');
      nodes.hud.classList.add('v21-countdown-open');
    }
    clearAim();
    setRequest(-1);
    setCarry(-1);
    setAction(null, '');
    setHint(null);
    setTime(CFG.duration);
    setOptsVisible();
    setCountdownNumber(3);
    return true;
  }

  function updateCountdown(t) {
    const elapsed = t - countdownAt;
    const n = 3 - Math.floor(elapsed);
    if (n <= 0) { begin(); return; }
    if (n !== countdownStep) {
      countdownStep = n;
      setCountdownNumber(n);
    }
  }

  /* ---------------- Movimiento del CNC ---------------- */
  function setMast(x) {
    if (G.machine.api) G.machine.api.setMast(x);
    else G.machine.mast.position.x = x - G.home.pxOff;
  }
  function setCar(y) {
    if (G.machine.api) G.machine.api.setCar(y);
    else G.machine.car.position.y = y;
  }
  function setPad(e) {
    if (G.machine.api) G.machine.api.setPad(e);
    else G.machine.pad.position.z = lerp(G.home.ret, G.home.ext, e) - G.home.zm;
  }

  function parkMachine() {
    if (G.machine.baseRotation !== undefined) G.machine.root.rotation.y = G.machine.baseRotation;
    cnc.x = G.home.x;
    cnc.y = G.home.y;
    cnc.e = 0;
    cnc.box = null;
    cnc.spec = null;
    applyCnc();
  }

  function applyCnc() {
    if (G.machine.api) { G.machine.api.apply(cnc); return; }
    setMast(cnc.x);
    setCar(cnc.y);
    setPad(cnc.e);
    if (cnc.box && cnc.spec) {
      cnc.box.position.set(
        cnc.x,
        G.home.floor + cnc.y,
        G.home.mz + lerp(G.home.ret, G.home.ext, cnc.e) - 0.04 - cnc.spec.d / 2
      );
    }
  }

  /* ---------------- Interfaz ---------------- */
  function buildUI() {
    if (document.getElementById('rg-hud')) return;

    const hud = document.createElement('div');
    hud.id = 'rg-hud';
    hud.innerHTML =
      '<div id="rg-left">' +
        '<div id="rg-score" class="rg-panel">' +
          '<div class="rg-team rg-p"><span>JUGADOR</span><b>0</b></div>' +
          '<i class="rg-sep"></i>' +
          '<div class="rg-team rg-b"><span>BOT</span><b>0</b></div>' +
        '</div>' +
        '<div id="rg-req" class="rg-panel">' +
          '<div class="rg-req-imgwrap"><img id="rg-req-img" alt="Medicamento solicitado"></div>' +
          '<div class="rg-req-txt"><small>PEDIDO</small></div>' +
        '</div>' +
        '<div id="rg-carry" class="rg-panel"><i></i><span></span></div>' +
      '</div>' +
      '<div id="rg-time" class="rg-panel">3:00</div>' +
      '<div id="rg-toast" role="status" aria-live="polite"></div>' +
      '<div id="rg-hint" class="rg-panel"></div>' +
      '<div id="v21-aim" aria-hidden="true"><i></i></div>' +
      '<div id="v21-start" class="v21-menu" role="dialog" aria-label="Menú de inicio">' +
        '<div class="v21-menu-card">' +
          '<div class="v21-menu-brand">RASMATIC <span>VR</span></div>' +
          '<h1>FARMACIA VIRTUAL</h1>' +
          '<p>Apuntá con la mira, recogé el medicamento y colocalo en la cinta. El empleado se encarga del resto.</p>' +
          '<div class="v21-menu-diff" role="radiogroup" aria-label="Dificultad">' +
            '<span>DIFICULTAD</span>' +
            '<button type="button" data-menu-diff="facil">Fácil</button>' +
            '<button type="button" data-menu-diff="normal">Normal</button>' +
            '<button type="button" data-menu-diff="dificil">Difícil</button>' +
          '</div>' +
          '<button id="v21-start-btn" type="button">INICIAR</button>' +
          '<small>3 modos · 3 dificultades · VR BOX</small>' +
        '</div>' +
      '</div>' +
      '<div id="v21-countdown" aria-live="assertive"><span id="v21-count-num">3</span></div>';
    document.body.appendChild(hud);
    nodes.hud = hud;

    nodes.start = document.getElementById('v21-start');
    nodes.startBtn = document.getElementById('v21-start-btn');
    nodes.countdown = document.getElementById('v21-countdown');
    nodes.countNum = document.getElementById('v21-count-num');
    if (nodes.startBtn) {
      nodes.startBtn.addEventListener('click', function (e) {
        e.preventDefault();
        startCountdown();
      });
    }
    if (nodes.start) {
      nodes.start.addEventListener('click', function (e) {
        const b = e.target.closest('[data-menu-diff]');
        if (!b) return;
        e.preventDefault();
        applyDifficulty(b.dataset.menuDiff, true);
      });
    }

    const act = document.createElement('button');
    act.id = 'rg-act';
    act.type = 'button';
    act.textContent = 'JUGAR';
    act.addEventListener('click', function (e) {
      e.preventDefault();
      interact();
    });
    document.body.appendChild(act);

    const optsBtn = document.createElement('button');
    optsBtn.id = 'rg-opts-btn';
    optsBtn.type = 'button';
    optsBtn.title = 'Opciones';
    optsBtn.setAttribute('aria-label', 'Opciones de dificultad');
    optsBtn.setAttribute('aria-haspopup', 'dialog');
    optsBtn.textContent = '⚙';
    optsBtn.addEventListener('click', function (e) {
      e.preventDefault();
      if (nodes.opts && nodes.opts.classList.contains('on')) closeOpts();
      else openOpts();
    });
    document.body.appendChild(optsBtn);

    const opts = document.createElement('div');
    opts.id = 'rg-opts';
    opts.setAttribute('role', 'dialog');
    opts.setAttribute('aria-label', 'Dificultad del bot');
    opts.innerHTML =
      '<div class="rg-opts-card">' +
        '<h2>DIFICULTAD DEL BOT</h2>' +
        '<p class="rg-opts-sub">El bot atiende clientes solo. Elegí qué tan rápido juega.</p>' +
        '<div class="rg-diff" role="radiogroup" aria-label="Dificultad">' +
          '<button type="button" role="radio" data-diff="facil">' +
            '<b>Fácil</b><small>Lento</small>' +
          '</button>' +
          '<button type="button" role="radio" data-diff="normal">' +
            '<b>Normal</b><small>Equilibrado</small>' +
          '</button>' +
          '<button type="button" role="radio" data-diff="dificil">' +
            '<b>Difícil</b><small>Rápido</small>' +
          '</button>' +
        '</div>' +
        '<p class="rg-opts-note" id="rg-diff-note"></p>' +
        '<div class="rg-opt-row">' +
          '<span>JOYSTICK</span>' +
          '<button type="button" class="rg-switch" id="rg-opt-joy" role="switch" aria-checked="true"><b>ACTIVADO</b></button>' +
        '</div>' +
        '<div class="rg-opt-row" id="rg-opt-ht-row" hidden>' +
          '<span>HEAD TRACKING</span>' +
          '<button type="button" class="rg-switch" id="rg-opt-ht" role="switch" aria-checked="false"><b>DESACTIVADO</b></button>' +
        '</div>' +
        '<label class="rg-opt-slider" id="rg-opt-ht-sens-row" hidden>' +
          '<span>SENSIBILIDAD</span>' +
          '<input type="range" id="rg-opt-ht-sens" min="0.2" max="2.5" step="0.1" value="1">' +
          '<output id="rg-opt-ht-sens-o">1.0×</output>' +
        '</label>' +
        '<label class="rg-opt-slider" id="rg-opt-ht-smooth-row" hidden>' +
          '<span>SUAVIZADO</span>' +
          '<input type="range" id="rg-opt-ht-smooth" min="0.03" max="0.45" step="0.01" value="0.12">' +
          '<output id="rg-opt-ht-smooth-o">0.12 s</output>' +
        '</label>' +
        '<button type="button" class="rg-opts-center" id="rg-opt-center" hidden>RECENTRAR VISTA</button>' +
        '<button type="button" class="rg-opts-ui" id="rg-opts-ui">PERSONALIZACIÓN DE INTERFAZ</button>' +
        '<button type="button" class="rg-opts-ok" id="rg-opts-ok">LISTO</button>' +
      '</div>';
    document.body.appendChild(opts);
    opts.addEventListener('click', function (e) {
      const b = e.target.closest('[data-diff]');
      if (b) {
        applyDifficulty(b.dataset.diff, true);
        return;
      }
      if (e.target === opts) closeOpts();
    });
    opts.querySelector('#rg-opts-ok').addEventListener('click', function (e) {
      e.preventDefault();
      closeOpts();
    });
    opts.querySelector('#rg-opts-ui').addEventListener('click', function (e) {
      e.preventDefault();
      uiOpen();
    });

    /* V19: joystick opcional en las dos apps. */
    const joyBtn = opts.querySelector('#rg-opt-joy');
    joyBtn.addEventListener('click', function (e) {
      e.preventDefault();
      applyJoystick(!joystickOn, true);
    });

    /* V19: el bloque de Head Tracking solo existe en la app que lo incluye. */
    const htRow = opts.querySelector('#rg-opt-ht-row');
    const htBtn = opts.querySelector('#rg-opt-ht');
    const htCenter = opts.querySelector('#rg-opt-center');
    const htSensRow = opts.querySelector('#rg-opt-ht-sens-row');
    const htSens = opts.querySelector('#rg-opt-ht-sens');
    const htSensOut = opts.querySelector('#rg-opt-ht-sens-o');
    const htSmoothRow = opts.querySelector('#rg-opt-ht-smooth-row');
    const htSmooth = opts.querySelector('#rg-opt-ht-smooth');
    const htSmoothOut = opts.querySelector('#rg-opt-ht-smooth-o');
    const ht = window.RasmaticHeadTracking || null;
    if (ht) {
      htRow.hidden = false;
      htSensRow.hidden = false;
      htSmoothRow.hidden = false;
      htBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (ht.isEnabled()) ht.disable();
        else ht.enable();
      });
      htCenter.addEventListener('click', function (e) {
        e.preventDefault();
        ht.recenter();
      });
      htSens.addEventListener('input', function () {
        ht.setSensitivity(Number(htSens.value));
      });
      htSmooth.addEventListener('input', function () {
        ht.setSmoothing(Number(htSmooth.value));
      });
      nodes.htBtn = htBtn;
      nodes.htCenter = htCenter;
      nodes.htSens = htSens;
      nodes.htSensOut = htSensOut;
      nodes.htSmooth = htSmooth;
      nodes.htSmoothOut = htSmoothOut;
      if (typeof ht.onChange === 'function') ht.onChange(paintHeadTracking);
      paintHeadTracking(ht.state());
    }

    const end = document.createElement('div');
    end.id = 'rg-end';
    end.setAttribute('role', 'dialog');
    end.setAttribute('aria-modal', 'true');
    end.setAttribute('aria-label', 'Resultado de la partida');
    end.innerHTML =
      '<div class="rg-card">' +
        '<h2 id="rg-end-title">¡GANASTE!</h2>' +
        '<p class="rg-sub" id="rg-end-sub">Clientes atendidos</p>' +
        '<div class="rg-final">' +
          '<div class="rg-fp"><span>JUGADOR</span><b id="rg-end-p">0</b></div>' +
          '<div class="rg-fb"><span>BOT</span><b id="rg-end-b">0</b></div>' +
        '</div>' +
        '<button type="button" id="rg-again">VOLVER A JUGAR</button>' +
      '</div>';
    document.body.appendChild(end);
    end.querySelector('#rg-again').addEventListener('click', function (e) {
      e.preventDefault();
      restart();
    });

    nodes.hud = hud;
    nodes.act = act;
    nodes.optsBtn = optsBtn;
    nodes.opts = opts;
    nodes.joyBtn = joyBtn;
    nodes.htRow = htRow;
    nodes.htBtn = htBtn;
    nodes.htCenter = htCenter;
    nodes.diffNote = document.getElementById('rg-diff-note');
    nodes.end = end;
    nodes.endTitle = document.getElementById('rg-end-title');
    nodes.endSub = document.getElementById('rg-end-sub');
    nodes.endP = document.getElementById('rg-end-p');
    nodes.endB = document.getElementById('rg-end-b');
    nodes.time = document.getElementById('rg-time');
    nodes.req = document.getElementById('rg-req');
    nodes.reqImg = document.getElementById('rg-req-img');
    nodes.carry = document.getElementById('rg-carry');
    nodes.carryDot = nodes.carry.querySelector('i');
    nodes.carryTxt = nodes.carry.querySelector('span');
    nodes.toast = document.getElementById('rg-toast');
    nodes.hint = document.getElementById('rg-hint');
    nodes.sp = hud.querySelector('.rg-p b');
    nodes.sb = hud.querySelector('.rg-b b');

    buildUIEditor();
  }

  function setScore() {
    if (!nodes.sp) return;
    if (nodes.sp.textContent !== String(scoreP)) nodes.sp.textContent = scoreP;
    if (nodes.sb.textContent !== String(scoreB)) nodes.sb.textContent = scoreB;
  }

  function setTime(sec) {
    if (!nodes.time) return;
    const s = Math.max(0, Math.ceil(sec));
    const txt = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    if (nodes.time.textContent !== txt) nodes.time.textContent = txt;
    nodes.time.classList.toggle('low', s <= 30);
  }

  function setRequest(c) {
    if (!nodes.req) return;
    if (c < 0) {
      nodes.req.classList.remove('on');
      return;
    }
    const col = COLORS[c];
    const ph = G && G.pharmacy ? G.pharmacy : window.RasmaticPharmacyApi;
    const st = ph && ph.stations ? ph.stations.filter(function (s) { return s.color === c; })[0] : null;
    const drug = st ? st.drug : COLOR_DRUGS[c];
    const src = ph && ph.drugImage ? ph.drugImage(drug) : '';
    if (nodes.reqImg && src && nodes.reqImg.getAttribute('src') !== src) {
      nodes.reqImg.setAttribute('src', src);
    }
    nodes.req.style.setProperty('--v21-req-color', col.css);
    nodes.req.classList.add('on');
    nodes.req.classList.remove('pop');
    void nodes.req.offsetWidth;
    nodes.req.classList.add('pop');
  }

  function setCarry(c, drug) {
    if (!nodes.carry) return;
    if (c < 0) {
      nodes.carry.classList.remove('on');
      if (handMesh) handMesh.visible = false;
      return;
    }
    const col = COLORS[c] || COLORS[0];
    const idx = (typeof drug === 'number' && drug >= 0) ? drug : stationDrug(c);
    nodes.carry.classList.add('on');
    nodes.carryDot.style.background = col.css;
    nodes.carryTxt.textContent = 'Llevas: ' + drugName(idx);
    if (handMesh) {
      /* Normalmente se lleva la caja real (carryingBox). El cubo de mano es
         solo un respaldo si la escena no expone la malla. */
      handMesh.visible = !carryingBox;
      if (!carryingBox) {
        const ph = G && G.pharmacy ? G.pharmacy : window.RasmaticPharmacyApi;
        if (ph && ph.drugKit && ph.drugs && ph.drugs[idx]) {
          handMesh.material = ph.drugKit(ph.drugs[idx]).m;
          handMesh.scale.set(0.78, 0.78, 0.78);
        }
      }
    }
  }

  function toast(msg, kind) {
    if (!nodes.toast) return;
    const tok = ++toastToken;
    nodes.toast.textContent = msg;
    nodes.toast.className = 'on' + (kind ? ' ' + kind : '');
    setTimeout(function () {
      if (tok === toastToken) nodes.toast.className = '';
    }, 1600);
  }

  function setHint(text) {
    if (!nodes.hint) return;
    if (nodes.hint._t === text) return;
    nodes.hint._t = text;
    if (text) {
      nodes.hint.textContent = text;
      nodes.hint.classList.add('on');
    } else {
      nodes.hint.classList.remove('on');
    }
  }

  function setAction(label, cls) {
    if (!nodes.act) return;
    if (label === promptLabel && cls === promptCls) return;
    promptLabel = label;
    promptCls = cls;
    if (!label) {
      nodes.act.className = '';
      return;
    }
    nodes.act.textContent = label;
    nodes.act.className = 'on' + (cls ? ' ' + cls : '');
  }

  /* ---------------- Medicamentos y clientes ---------------- */
  function resetStocks() {
    stockP = COLORS.map(function () { return CFG.stock; });
    stockB = COLORS.map(function () { return CFG.stock; });
  }

  function pickColor(stock, last) {
    const avail = [];
    for (let i = 0; i < COLORS.length; i++) if (stock[i] > 0) avail.push(i);
    if (!avail.length) return -1;
    let pick = avail[Math.floor(Math.random() * avail.length)];
    if (avail.length > 1 && pick === last) {
      pick = avail[(avail.indexOf(pick) + 1) % avail.length];
    }
    return pick;
  }

  function take(target) {
    if (!target || !target.box) return false;
    const box = target.box;
    if (carrying >= 0 || carryingBox) return false;
    const st = stationForBox(box);
    const wasTaken = !!(box.userData && box.userData.taken);
    let c;
    let fromStock = false;
    if (st) {
      c = st.def.c;
      if (!wasTaken) {
        if ((stockP[c] || 0) <= 0) return false;
        stockP[c]--;
        fromStock = true;
      } else {
        fromStock = true;   // ya había descontado stock al tomarla antes
      }
      box.userData.stationColor = c;
    } else {
      c = boxColor(box);
    }
    box.userData.taken = true;
    box.userData.dropped = false;
    box.userData.onBelt = false;
    box.userData.held = true;
    carrying = c;
    carryingDrug = box.userData.n;
    carryingBox = box;
    carryingFromStock = fromStock;

    /* La caja real se sujeta delante de la cámara. En VR SBS la cámara se
       desplaza por ojo y la caja la acompaña, por lo que se ve en ambos ojos. */
    G.camera.attach(box);
    box.position.set(HAND_POS.x, HAND_POS.y, HAND_POS.z);
    box.rotation.set(HAND_ROT.x, HAND_ROT.y, HAND_ROT.z);
    box.scale.setScalar(HAND_SCALE);
    box.visible = true;

    setCarry(c, carryingDrug);
    updateStationSigns();
    clearAim();
    toast('Recogiste ' + drugName(carryingDrug), 'ok');
    return true;
  }

  /* ---------------- Ciclo de partida ---------------- */
  function begin() {
    state = 'playing';
    matchStart = now();
    matchEnd = matchStart + CFG.duration;
    if (uiEditor && uiEditor.root.classList.contains('on')) uiClose(false);
    scoreP = 0;
    scoreB = 0;
    resetShelfBoxes();
    requestP = -1;
    requestB = -1;
    bot = null;
    resetStocks();
    updateStationSigns();
    setScore();
    setRequest(-1);
    setCarry(-1);

    resetClients();
    belt.items.length = 0;
    belt.speed = 0;
    if (G.pharmacy.conveyor && G.pharmacy.conveyor.setSpeed) {
      G.pharmacy.conveyor.setSpeed(0);
    }
    S.beltPool.forEach(function (m) { m.visible = false; });
    employee = null;
    releaseAt = 0;

    if (S.botCustomer) {
      S.botCustomer.group.visible = false;
      S.botCustomer.pop = 0;
    }
    S.botBoxes.forEach(function (b) {
      if (b.mesh.parent !== G.machine.root) G.machine.root.add(b.mesh);
      b.mesh.visible = true;
      b.mesh.position.copy(b.home);
      b.mesh.scale.set(1, 1, 1);
      b.mesh.rotation.set(0, 0, 0);
    });
    S.kiosk.screenMat.color.setHex(0x39d0ff);
    parkMachine();

    matchStart = now();
    matchEnd = matchStart + CFG.duration;
    nextBotAt = matchStart + CFG.botFirst;
    pendingSpawns = [
      { at: matchStart + 0.2, initial: true },
      { at: matchStart + 1.0, initial: true },
      { at: matchStart + 1.8, initial: true }
    ];

    setTime(CFG.duration);
    setHint(null);
    setAction(null, '');
    clearAim();
    document.body.classList.add('ras-arena');
    document.body.classList.remove('rg-over');
    if (nodes.start) nodes.start.classList.remove('on');
    if (nodes.countdown) nodes.countdown.classList.remove('on');
    if (nodes.hud) nodes.hud.classList.remove('v21-menu-open', 'v21-countdown-open');
    if (nodes.end) nodes.end.classList.remove('on');
    setOptsVisible();
    toast('¡A atender clientes!', 'ok');
  }

  function finish() {
    state = 'over';
    if (uiEditor && uiEditor.root.classList.contains('on')) uiClose(false);
    setTime(0);
    setAction(null, '');
    setHint(null);
    resetShelfBoxes();
    setRequest(-1);
    setCarry(-1);
    requestP = -1;
    requestB = -1;
    clearAim();
    resetClients();
    belt.items.length = 0;
    belt.speed = 0;
    if (G.pharmacy.conveyor && G.pharmacy.conveyor.setSpeed) {
      G.pharmacy.conveyor.setSpeed(0);
    }
    S.beltPool.forEach(function (m) { m.visible = false; });
    employee = null;
    releaseAt = 0;
    if (S.botCustomer) S.botCustomer.group.visible = false;
    bot = null;
    parkMachine();
    S.botBoxes.forEach(function (b) {
      if (b.mesh.parent !== G.machine.root) G.machine.root.add(b.mesh);
      b.mesh.visible = true;
      b.mesh.position.copy(b.home);
      b.mesh.scale.set(1, 1, 1);
      b.mesh.rotation.set(0, 0, 0);
    });
    S.kiosk.screenMat.color.setHex(0x39d0ff);
    document.body.classList.add('rg-over');
    if (nodes.hud) nodes.hud.classList.remove('v21-menu-open', 'v21-countdown-open');

    const win = scoreP > scoreB, lose = scoreP < scoreB;
    nodes.endTitle.className = win ? 'win' : (lose ? 'lose' : 'tie');
    nodes.endTitle.textContent = win ? '¡GANASTE!' : (lose ? 'EL BOT GANA' : 'EMPATE');
    nodes.endSub.textContent = win
      ? 'Atendiste más clientes que el almacén automatizado.'
      : (lose ? 'El bot atendió más clientes esta vez.'
              : 'Los dos atendieron la misma cantidad de clientes.');
    nodes.endP.textContent = scoreP;
    nodes.endB.textContent = scoreB;
    nodes.end.classList.add('on');
    setOptsVisible();
  }

  function restart() {
    if (nodes.end) nodes.end.classList.remove('on');
    document.body.classList.remove('rg-over');
    state = 'menu';
    showMenu(true);
    startCountdown();
  }

  /* Volver al menú principal (desde el botón atrás del resultado). */
  function toIdle() {
    scoreP = 0;
    scoreB = 0;
    requestP = -1;
    requestB = -1;
    resetShelfBoxes();
    bot = null;
    clearAim();
    resetClients();
    belt.items.length = 0;
    belt.speed = 0;
    if (G.pharmacy.conveyor && G.pharmacy.conveyor.setSpeed) {
      G.pharmacy.conveyor.setSpeed(0);
    }
    S.beltPool.forEach(function (m) { m.visible = false; });
    employee = null;
    releaseAt = 0;
    setScore();
    setRequest(-1);
    setCarry(-1);
    setTime(CFG.duration);
    resetStocks();
    updateStationSigns();
    if (S.botCustomer) S.botCustomer.group.visible = false;
    S.kiosk.screenMat.color.setHex(0x39d0ff);
    S.botBoxes.forEach(function (b) {
      if (b.mesh.parent !== G.machine.root) G.machine.root.add(b.mesh);
      b.mesh.visible = true;
      b.mesh.position.copy(b.home);
      b.mesh.scale.set(1, 1, 1);
      b.mesh.rotation.set(0, 0, 0);
    });
    parkMachine();
    document.body.classList.remove('rg-over');
    if (nodes.end) nodes.end.classList.remove('on');
    showMenu(true);
    setAction(null, '');
  }

  /* ---------------- Acción contextual ---------------- */
  function interact() {
    if (!G || state === 'boot' || failed) return false;
    if (state === 'over') { restart(); return true; }
    if (state === 'menu') return startCountdown();
    if (state !== 'playing') return false;

    if (carrying >= 0 || carryingBox) {
      if (nearBeltEntry()) return placeOnBelt();
      return dropCarried();
    }

    const st = aim.target;
    if (st && aim.hitDistance <= CFG.aimTake && targetAvailable(st)) {
      return take(st);
    }
    return false;
  }

  function updatePrompt() {
    if (state === 'menu' || state === 'countdown' || state === 'over') {
      setHint(null);
      setAction(null, '');
      return;
    }
    if (state !== 'playing') {
      setHint(null);
      setAction(null, '');
      return;
    }
    if (carrying >= 0 || carryingBox) {
      if (nearBeltEntry()) {
        setHint('Colocá el medicamento en la cinta');
        setAction('COLOCAR', 'give');
      } else {
        setHint('Soltá el medicamento enfrente');
        setAction('SOLTAR', 'give');
      }
      return;
    }
    const st = aim.target;
    if (st) {
      if (aim.hitDistance <= CFG.aimTake && targetAvailable(st)) {
        setHint('Medicamento: ' + drugName(aim.drug));
        setAction('RECOGER', 'take');
      } else {
        setHint('Acercate al medicamento');
        setAction(null, '');
      }
      return;
    }
    setHint('Apuntá a una caja con la mira');
    setAction(null, '');
  }

  /* ---------------- Bot + CNC ---------------- */
  function botBegin() {
    const c = pickColor(stockB, requestB);
    if (c < 0) { nextBotAt = now() + 2; return; }
    const box = S.botBoxes.filter(function (b) { return b.color === c; })[0];
    if (!box) { nextBotAt = now() + 2; return; }

    requestB = c;
    const col = COLORS[c];
    bot = {
      phase: 'press', t0: now(), dur: botTime(0.8), color: c, box: box, spec: box.spec,
      fromX: cnc.x, fromY: cnc.y, toX: 0, toY: 0,
      dropFrom: null, dropTo: null, flyFrom: null, flyTo: null
    };
    S.kiosk.screenMat.color.setHex(col.hex);
    S.botCustomer.group.visible = true;
    S.botCustomer.pop = 0;
    box.mesh.visible = true;
    box.mesh.position.copy(box.home);
    box.mesh.scale.set(1, 1, 1);
  }

  function botUpdate() {
    if (state !== 'playing') return;
    const t = now();
    if (!bot) {
      if (t >= nextBotAt) botBegin();
      return;
    }
    const u = clamp01((t - bot.t0) / bot.dur);

    switch (bot.phase) {
      case 'press':
        if (u >= 1) {
          bot.phase = 'toPick';
          bot.t0 = t;
          bot.fromX = cnc.x;
          bot.fromY = cnc.y;
          bot.toX = bot.spec.x;
          bot.toY = G.boxY(bot.spec);
          bot.dur = botTime(Math.max(0.7, Math.min(2.2,
            0.55 + Math.abs(bot.toX - bot.fromX) / 4 +
            Math.abs(bot.toY - bot.fromY) / 3)));
        }
        break;

      case 'toPick':
        cnc.x = lerp(bot.fromX, bot.toX, ease(u));
        cnc.y = lerp(bot.fromY, bot.toY, ease(u));
        applyCnc();
        if (u >= 1) { bot.phase = 'extend'; bot.t0 = t; bot.dur = botTime(0.45); }
        break;

      case 'extend':
        cnc.e = ease(u);
        applyCnc();
        if (u >= 1) { bot.phase = 'grab'; bot.t0 = t; bot.dur = botTime(0.28); }
        break;

      case 'grab':
        cnc.y = bot.toY + 0.18 * ease(u);
        cnc.box = bot.box.mesh;
        cnc.spec = bot.spec;
        applyCnc();
        if (u >= 1) { bot.phase = 'retract'; bot.t0 = t; bot.dur = botTime(0.45); }
        break;

      case 'retract':
        cnc.e = 1 - ease(u);
        applyCnc();
        if (u >= 1) {
          bot.phase = 'toHome';
          bot.t0 = t;
          bot.dur = botTime(1.1);
          bot.fromX = cnc.x;
          bot.fromY = cnc.y;
        }
        break;

      case 'toHome':
        cnc.x = lerp(bot.fromX, G.home.x, ease(u));
        cnc.y = lerp(bot.fromY, G.home.y, ease(u));
        applyCnc();
        if (u >= 1) {
          bot.phase = 'drop';
          bot.t0 = t;
          bot.dur = botTime(0.55);
          /* La caja sale de la máquina y aparece en la ventanilla del bot. */
          if (G.machine.api && G.machine.api.deliver) G.machine.api.deliver(bot.box.mesh);
          else if (bot.box.mesh.parent !== G.place) G.place.attach(bot.box.mesh);
          bot.dropFrom = bot.box.mesh.position.clone();
          bot.dropTo = new T.Vector3(SPOT.bot.x, 1.55, SPOT.bot.z);
        }
        break;

      case 'drop':
        bot.box.mesh.position.lerpVectors(bot.dropFrom, bot.dropTo, ease(u));
        bot.box.mesh.scale.setScalar(1 - 0.25 * ease(u));
        if (u >= 1) {
          cnc.box = null;
          cnc.spec = null;
          bot.phase = 'fly';
          bot.t0 = t;
          bot.dur = botTime(0.9);
          bot.flyFrom = bot.box.mesh.position.clone();
          bot.flyTo = new T.Vector3(
            SPOT.bot.x,
            3.1,
            SPOT.bot.z
          );
        }
        break;

      case 'fly':
        bot.box.mesh.position.lerpVectors(bot.flyFrom, bot.flyTo, u);
        bot.box.mesh.position.y += Math.sin(u * Math.PI) * 1.4;
        bot.box.mesh.scale.setScalar(0.75 - 0.35 * u);
        if (u >= 1) {
          bot.box.mesh.visible = false;
          scoreB++;
          setScore();
          stockB[bot.color]--;
          toast('El bot atendió un cliente', 'bad');
          bot.phase = 'done';
          bot.t0 = t;
          bot.dur = botTime(0.9);
        }
        break;

      case 'done':
        if (u >= 1) {
          const b = bot.box, col = bot.color;
          S.botCustomer.group.visible = false;
          S.kiosk.screenMat.color.setHex(0x39d0ff);
          if (b.mesh.parent !== G.machine.root) G.machine.root.add(b.mesh);
          b.mesh.visible = stockB[col] > 0;
          b.mesh.position.copy(b.home);
          b.mesh.scale.set(1, 1, 1);
          b.mesh.rotation.set(0, 0, 0);
          parkMachine();
          bot = null;
          requestB = -1;
          nextBotAt = now() + CFG.botInterval;
        }
        break;
    }
  }

  /* ---------------- Cuadro ---------------- */
  function tick(dt) {
    if (!G || state === 'boot' || failed) return;

    const raw = performance.now();
    if (lastRaw && raw - lastRaw > 1200) pausedAccum += raw - lastRaw - 100;
    lastRaw = raw;

    const t = now();

    /* El encargado es sólido: sin esto se lo atraviesa al caminar hacia las
       góndolas y queda como un error visible. */
    if (S.npc) {
      const dx = G.player.x - SPOT.npc.x, dz = G.player.z - SPOT.npc.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.0001 && d < 1.15) {
        G.player.x = SPOT.npc.x + dx / d * 1.15;
        G.player.z = SPOT.npc.z + dz / d * 1.15;
      }
    }

    if (state === 'countdown') {
      updateCountdown(t);
      if (state !== 'countdown') { updatePrompt(); return; }
    }

    if (state === 'playing') {
      if (t >= matchEnd) { finish(); return; }
      setTime(matchEnd - t);
      while (pendingSpawns.length && t >= pendingSpawns[0].at &&
             S.queue.length < CFG.queueSize) {
        const job = pendingSpawns.shift();
        if (!spawnClient(job.initial)) {
          pendingSpawns.unshift({ at: t + 0.6, initial: job.initial });
          break;
        }
      }
      if (releaseAt && t >= releaseAt) {
        releaseAt = 0;
        releaseFront();
      }
      botUpdate();
    }

    updateClients(dt, t);
    updateBelt(dt, t);
    updateEmployee(dt, t);
    updateAim(t);

    for (let i = 0; i < S.clients.length; i++) {
      const c = S.clients[i];
      if (c.state !== 'hidden' && c.pop < 1) {
        c.pop = Math.min(1, c.pop + dt * 4);
        c.group.scale.setScalar(ease(c.pop));
      }
    }
    if (S.botCustomer && S.botCustomer.group.visible && S.botCustomer.pop < 1) {
      S.botCustomer.pop = Math.min(1, S.botCustomer.pop + dt * 4);
      S.botCustomer.group.scale.setScalar(ease(S.botCustomer.pop));
    }
    if (bot && bot.phase === 'press') {
      const u = clamp01((t - bot.t0) / bot.dur);
      S.kiosk.arm.rotation.x = -0.4 * Math.sin(u * Math.PI * 2);
    } else if (S.kiosk) {
      S.kiosk.arm.rotation.x *= 0.9;
    }
    if (handMesh && handMesh.visible) {
      handMesh.position.y = -0.52 + Math.sin(t * 4) * 0.02;
      handMesh.rotation.z = 0.1 + Math.sin(t * 3.1) * 0.02;
    }

    /* Los carteles mantienen un tamano aparente constante: en vertical el
       campo de vision horizontal es muy angosto y un cartel fijo taparia
       media pantalla al acercarse. */
    const cp = G.camera.position;
    for (let k = 0; k < TAGS.length; k++) {
      const tg = TAGS[k];
      tg.spr.getWorldPosition(tmpV);
      const d = cp.distanceTo(tmpV);
      /* Tope de tamaño: a partir de ~13 m el cartel deja de crecer y se
         reduce con la distancia, para que las etiquetas lejanas no se
         apilen en el centro del pasillo. */
      const m = Math.max(0.1, Math.min(1.2, d / 11));
      tg.spr.scale.set(tg.w * m, tg.h * m, 1);
    }

    updatePrompt();
  }

  /* ---------------- Arranque ---------------- */
  function boot() {
    if (state !== 'boot' || failed) return state !== 'boot';
    core = window.RasmaticCore;
    if (!core || !core.game) return false;
    G = core.game;
    try {
      if (G.machine.baseRotation !== undefined) G.machine.root.rotation.y = G.machine.baseRotation;
      /* La farmacia del HTML usa 72° verticales; es el mismo campo que la
         escena de referencia y funciona en vertical y horizontal. */
      G.camera.fov = 72;
      G.camera.updateProjectionMatrix();
      window.RasmaticCNC = true;
      window.RasmaticArena = true;
      /* El logo del vestibulo no se usa en la partida: ocultarlo ya en el
         arranque (no depender de que corra el primer cuadro). */
      if (G.logo && G.logo.set) G.logo.set(false);

      parkMachine();
      buildNpc();
      buildStations();
      buildClients();
      buildBotCustomer();
      buildKiosk();
      buildBotBoxes();
      buildHand();
      buildBeltPool();
      buildAim();
      hideLegacy();
      buildUI();
      loadDifficulty();
      loadJoystick();
      uiLoad();

      resetShelfBoxes();
      resetStocks();
      updateStationSigns();
      resetClients();
      setScore();
      setTime(CFG.duration);
      setHint(null);
      if (G.pharmacy.conveyor && G.pharmacy.conveyor.setSpeed) {
        G.pharmacy.conveyor.setSpeed(0);
      }

      document.body.classList.add('ras-arena', 'dockmin');
      state = 'menu';
      showMenu(true);
      setOptsVisible();
      console.log('[juego] listo · ' + COLORS.length + ' medicamentos · ' +
        CFG.duration + ' s');
    } catch (e) {
      failed = true;
      console.error('[juego] no se pudo iniciar', e);
    }
    return state !== 'boot';
  }

  function onBack() {
    if (!G || state === 'boot' || failed) return false;
    if (state === 'over') { toIdle(); return true; }
    if (state === 'countdown') {
      state = 'menu';
      showMenu(true);
      return true;
    }
    if (state === 'playing') {
      const t = now();
      if (t - backAt < 2.5) return false;   // segundo toque: sale de la app
      backAt = t;
      toast('Tocá atrás otra vez para salir', 'bad');
      return true;
    }
    return false;
  }

  /* Solo pruebas: coloca al jugador alrededor de una caja concreta y apunta
     la mira a esa caja (comprueba que el rayo realmente la alcanza). */
  function aimAtBoxDebug(box) {
    if (!G || state !== 'playing' || !box) return false;
    const dirs = [
      [0, 2.6], [0, -2.6], [2.6, 0], [-2.6, 0],
      [1.9, 1.9], [-1.9, 1.9], [1.9, -1.9], [-1.9, -1.9],
      [0, 3.4], [0, -3.4], [3.4, 0], [-3.4, 0]
    ];
    const wp = new T.Vector3();
    box.getWorldPosition(wp);
    for (let i = 0; i < dirs.length; i++) {
      const px = wp.x + dirs[i][0];
      const pz = wp.z + dirs[i][1];
      if (G.pharmacy.blocked(px, pz)) continue;
      G.player.x = px;
      G.player.z = pz;
      const dx = wp.x - G.player.x;
      const dz = wp.z - G.player.z;
      const dy = wp.y - (G.pharmacy.eye || 3.6);
      G.player.yaw = Math.atan2(-dx, -dz);
      G.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      /* Sincroniza la cámara ya mismo: updateAim usa cam.position/quaternion. */
      G.camera.position.set(G.player.x, (G.pharmacy.eye || 3.6), G.player.z);
      G.camera.rotation.set(G.player.pitch, G.player.yaw, 0, 'YXZ');
      G.camera.updateMatrixWorld(true);
      aim.nextAt = 0;
      updateAim(now());
      if (aim.target && aim.target.box === box && aim.hitDistance <= CFG.aimTake) {
        return true;
      }
    }
    return false;
  }

  function debug() {
    const t = now();
    return {
      state: state,
      score: { player: scoreP, bot: scoreB },
      time: state === 'playing' ? Math.max(0, matchEnd - t)
        : (state === 'over' ? 0 : CFG.duration),
      carrying: carrying,
      carryingDrug: carryingDrug,
      carryingBox: carryingBox ? {
        id: carryingBox.userData.id, drug: carryingBox.userData.n,
        parent: carryingBox.parent === (G && G.camera) ? 'camera' : 'scene'
      } : null,
      request: requestP,
      requestBot: requestB,
      stockP: stockP.slice(),
      stockB: stockB.slice(),
      bot: bot ? { phase: bot.phase, color: bot.color } : null,
      cnc: { x: +cnc.x.toFixed(2), y: +cnc.y.toFixed(2), e: +cnc.e.toFixed(2), box: !!cnc.box },
      player: G ? { x: +G.player.x.toFixed(2), z: +G.player.z.toFixed(2) } : null,
      customer: S.queue.length > 0,
      queue: S.queue.map(function (q) {
        return { request: q.request, slot: q.slot, state: q.state,
          x: +q.group.position.x.toFixed(2), z: +q.group.position.z.toFixed(2) };
      }),
      aim: aim.target ? {
        color: aim.target.def.c, drug: aim.drug,
        id: aim.target.box ? aim.target.box.userData.id : -1,
        name: drugName(aim.drug),
        distance: +aim.hitDistance.toFixed(2),
        visible: !!(aim.outline && aim.outline.visible)
      } : null,
      shelf: G && G.pharmacy && G.pharmacy.shelfBoxes ? {
        total: G.pharmacy.shelfBoxes.length,
        independent: G.pharmacy.shelfBoxes.filter(function (b) {
          return b.isMesh === true && b.userData && b.userData.kind === 'shelf';
        }).length,
        dropped: G.pharmacy.shelfBoxes.filter(function (b) { return b.userData.dropped; }).length,
        held: G.pharmacy.shelfBoxes.filter(function (b) { return b.userData.held; }).length,
        onBelt: G.pharmacy.shelfBoxes.filter(function (b) { return b.userData.onBelt; }).length
      } : null,
      belt: {
        count: belt.items.length, speed: +belt.speed.toFixed(2),
        total: +(belt.total || 0).toFixed(2),
        entry: nearBeltEntry(),
        items: belt.items.map(function (it) {
          return { color: it.color, s: +it.s.toFixed(2) };
        })
      },
      employee: employee ? employee.phase : null,
      countdown: state === 'countdown' ? Math.max(0, 3 - (now() - countdownAt)) : 0,
      stationLabels: S.stations.filter(function (st) { return !!st.tag; }).length,
      clients: S.clients.filter(function (c) { return c.state !== 'hidden'; }).map(function (c) {
        return { request: c.request, slot: c.slot, state: c.state,
          scale: +(c.group.userData.scale || 1).toFixed(2) };
      }),
      botCustomer: !!(S.botCustomer && S.botCustomer.group.visible),
      ui: { action: promptLabel, hint: nodes.hint ? nodes.hint._t : null },
      app: window.RasmaticApp ? window.RasmaticApp.id : null,
      joystick: joystickOn,
      config: { duration: CFG.duration, botInterval: CFG.botInterval,
        botFirst: CFG.botFirst, botSpeed: CFG.botSpeed, difficulty: difficulty }
    };
  }

  window.RasmaticGame = {
    tick: tick,
    boot: boot,
    interact: interact,
    onBack: onBack,
    restart: restart,
    debug: debug,
    isInputLocked: function () { return state === 'menu' || state === 'countdown'; },
    setDifficulty: function (id) { return applyDifficulty(id, true); },
    getDifficulty: function () {
      return { id: difficulty, label: DIFFICULTY[difficulty].label,
        interval: CFG.botInterval, first: CFG.botFirst, speed: CFG.botSpeed };
    },
    /* V19: joystick tactil opcional. El mando Bluetooth no se toca. */
    setJoystick: function (on) { return applyJoystick(on, true); },
    getJoystick: function () { return joystickOn; },
    ui: uiApi,
    /* Solo para pruebas automatizadas por CDP. */
    _test: {
      teleport: function (x, z) {
        if (!G) return false;
        G.player.x = x;
        G.player.z = z;
        return true;
      },
      timeLeft: function (s) {
        if (state !== 'playing') return false;
        matchEnd = now() + Math.max(0, s);
        return true;
      },
      request: function (c) {
        if (state !== 'playing' || c < 0 || c >= COLORS.length) return false;
        requestP = c;
        setRequest(c);
        return true;
      },
      botNow: function () {
        nextBotAt = now();
        return true;
      },
      startNow: function () {
        state = 'menu';
        showMenu(false);
        begin();
        return state === 'playing';
      },
      aimAtBox: function (box) { return aimAtBoxDebug(box); },
      aimAtStation: function (color) {
        const st = S.stations.filter(function (s) { return s.def.c === color; })[0];
        return !!st && aimAtBoxDebug(st.box);
      },
      aimAtShelfBox: function (index) {
        const boxes = G && G.pharmacy ? G.pharmacy.shelfBoxes : [];
        return !!(boxes && boxes[index]) && aimAtBoxDebug(boxes[index]);
      },
      aimAtDrug: function (drug) {
        const boxes = G && G.pharmacy ? G.pharmacy.shelfBoxes : [];
        for (let i = 0; i < boxes.length; i++) {
          const b = boxes[i];
          const u = b.userData || {};
          if (u.n === drug && b.visible && !u.taken && !u.onBelt && !u.consumed) {
            if (aimAtBoxDebug(b)) return true;
          }
        }
        return false;
      },
      grabShelfBox: function (index) {
        if (!this.aimAtShelfBox(index)) return false;
        if (!this.interact || typeof window.RasmaticGame.interact !== 'function') return false;
        return window.RasmaticGame.interact();
      },
      releaseHeld: function () { return dropCarried(); },
      shelfBox: function (index) {
        const boxes = G && G.pharmacy ? G.pharmacy.shelfBoxes : [];
        const b = boxes && boxes[index];
        if (!b) return null;
        const u = b.userData || {};
        return {
          id: u.id, drug: u.n, name: drugName(u.n), visible: b.visible === true,
          held: !!u.held, dropped: !!u.dropped, onBelt: !!u.onBelt,
          consumed: !!u.consumed, taken: !!u.taken,
          parent: b.parent === (G && G.camera) ? 'camera' : 'scene',
          x: +b.position.x.toFixed(2), y: +b.position.y.toFixed(2), z: +b.position.z.toFixed(2)
        };
      },
      shelfCount: function () {
        const boxes = G && G.pharmacy ? G.pharmacy.shelfBoxes : [];
        return {
          total: boxes.length,
          uniqueIds: new Set(boxes.map(function (b) { return b.userData && b.userData.id; })).size,
          meshes: boxes.filter(function (b) { return b.isMesh === true; }).length,
          stationBoxesSeparate: S.stations.every(function (s) {
            return boxes.indexOf(s.box) >= 0 && s.box.parent !== undefined;
          })
        };
      },
      expectedDrug: function (color) { return stationDrug(color); },
      placeBeltNow: function () {
        if (!G || state !== 'playing' || (carrying < 0 && !carryingBox)) return false;
        G.player.x = G.pharmacy.conveyor.entry.x + 1.8;
        G.player.z = G.pharmacy.conveyor.entry.z;
        return placeOnBelt();
      },
      config: function (o) {
        if (!o) return CFG;
        if (typeof o.difficulty === 'string') applyDifficulty(o.difficulty, true);
        if (typeof o.botInterval === 'number') CFG.botInterval = o.botInterval;
        if (typeof o.botFirst === 'number') CFG.botFirst = o.botFirst;
        if (typeof o.botSpeed === 'number' && o.botSpeed > 0) CFG.botSpeed = o.botSpeed;
        if (typeof o.duration === 'number') CFG.duration = o.duration;
        if (typeof o.beltSpeed === 'number' && o.beltSpeed > 0) CFG.beltSpeed = o.beltSpeed;
        if (typeof o.beltSpacing === 'number' && o.beltSpacing > 0) CFG.beltSpacing = o.beltSpacing;
        return CFG;
      }
    }
  };

  /* Espera a que la escena original termine de construirse. */
  let tries = 0;
  (function wait() {
    if (boot() || failed) return;
    if (++tries > 600) { console.error('[juego] la escena no estuvo lista'); return; }
    setTimeout(wait, 100);
  })();
})();
