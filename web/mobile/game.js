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
    pickup: 2.4,        // radio para recoger un medicamento
    deliver: 3.4,       // radio para entregar en el mostrador
    talk: 7.5           // radio para hablar con el encargado
  };

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
  const STATIONS = [
    { c: 0, x: -3.85, z: -28 },
    { c: 1, x:  3.85, z: -36 },
    { c: 2, x: -3.85, z: -44 },
    { c: 3, x:  3.85, z: -52 },
    { c: 4, x: -3.85, z: -60 },
    { c: 5, x:  3.85, z: -68 }
  ];
  const STATION_Y = -1.22;   // sobre la bandeja superior de la góndola

  const SPOT = {
    npc:      { x:  1.1, z:  22.8 },   // delante del logo, visible desde el arranque
    counter:  { x: -3.6, z:  24.6 },   // extremo sur del escritorio de consulta
    customer: { x: -3.6, z:  20.6 },   // a la vista desde el mostrador
    kiosk:    { x:  1.7, z: -80.6 },
    bot:      { x: -2.2, z: -81.0 }
  };

  const K = 0.55;            // escala de los personajes nuevos

  /* ---------------- Estado ---------------- */
  let core = null, G = null;
  let state = 'boot';                 // boot | idle | playing | over
  let failed = false;
  let scoreP = 0, scoreB = 0;
  let stockP = [], stockB = [];
  let carrying = -1, requestP = -1, requestB = -1;
  let matchStart = 0, matchEnd = 0;
  let customerWaitUntil = 0, customerHideAt = 0;
  let nextBotAt = 0, bot = null;
  let lastRaw = 0, pausedAccum = 0;
  let toastToken = 0, backAt = -99;
  let handMesh = null;
  let promptLabel = null, promptCls = '';

  const S = { stations: [], botBoxes: [] };
  const TAGS = [];
  const tmpV = new T.Vector3();
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
  }

  function applyDifficulty(id, save) {
    const key = Object.prototype.hasOwnProperty.call(DIFFICULTY, id) ? id : 'normal';
    const d = DIFFICULTY[key];
    difficulty = key;
    CFG.botInterval = d.interval;
    CFG.botFirst = d.first;
    CFG.botSpeed = d.speed;
    if (save) {
      try { localStorage.setItem(DIFF_KEY, key); } catch (e) { /* modo privado */ }
    }
    paintDifficulty();
    return key;
  }

  function loadDifficulty() {
    let id = 'normal';
    try { id = localStorage.getItem(DIFF_KEY) || 'normal'; } catch (e) { /* nada */ }
    applyDifficulty(id, false);
  }

  function setOptsVisible() {
    if (!nodes.optsBtn) return;
    nodes.optsBtn.hidden = state !== 'idle';
    if (state !== 'idle' && nodes.opts) nodes.opts.classList.remove('on');
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
    try { raw = JSON.parse(localStorage.getItem(UI_KEY) || 'null'); } catch (e) { raw = null; }
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
      localStorage.setItem(UI_KEY, JSON.stringify({ v: UI_VERSION, profiles: uiSaved }));
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
    const M = G.mats;
    const sc = typeof k === 'number' ? k : K;
    const outer = new T.Group();
    const g = new T.Group();
    g.scale.setScalar(sc);
    outer.add(g);

    [-0.5, 0.5].forEach(function (x) {
      addMesh(new T.CylinderGeometry(0.34, 0.3, 3.2, 10), M.dark, x, 1.6, 0, g);
    });
    addMesh(new T.CylinderGeometry(1.05, 1.35, 3.9, 16), coat, 0, 5.15, 0, g);
    /* delantal blanco sobre el uniforme: da lectura de farmacia */
    const apron = addMesh(new T.BoxGeometry(1.5, 2.6, 0.14), M.white, 0, 4.6, 0.98, g);
    apron.rotation.x = -0.06;
    addMesh(new T.CylinderGeometry(0.28, 0.3, 0.6, 12), M.skin, 0, 7.4, 0, g);

    const head = addMesh(new T.SphereGeometry(0.82, 18, 14), M.skin, 0, 8.25, 0, g);
    head.scale.set(0.9, 1.05, 0.9);
    const hair = addMesh(new T.SphereGeometry(0.86, 18, 12), M.hair, 0, 8.45, -0.06, g);
    hair.scale.set(0.92, 0.82, 0.92);

    /* ojos y boca: sin ellos la cabeza se lee como un huevo liso */
    const eyeMat = new T.MeshBasicMaterial({ color: 0x1b2430 });
    [-1, 1].forEach(function (k2) {
      const eye = addMesh(new T.SphereGeometry(0.13, 10, 8), eyeMat, k2 * 0.3, 8.34, 0.66, g);
      eye.scale.set(0.85, 1.15, 0.6);
      const brow = addMesh(new T.BoxGeometry(0.3, 0.05, 0.05), eyeMat, k2 * 0.3, 8.6, 0.66, g);
      brow.rotation.z = k2 * -0.12;
    });
    const mouth = addMesh(new T.BoxGeometry(0.34, 0.06, 0.05), eyeMat, 0, 7.98, 0.68, g);
    mouth.rotation.z = 0.03;

    [-1, 1].forEach(function (k2) {
      const arm = addMesh(new T.CylinderGeometry(0.26, 0.22, 3.4, 10), coat, k2 * 1.15, 5.0, 0.1, g);
      arm.rotation.z = k2 * 0.12;
      addMesh(new T.SphereGeometry(0.3, 10, 8), M.skin, k2 * 1.3, 3.2, 0.15, g);
    });
    outer.userData.inner = g;
    outer.userData.scale = sc;
    return outer;
  }

  /* Altura del cartel justo encima de la cabeza, en unidades de mundo. */
  function headTop(p) { return 9.15 * (p.userData.scale || K); }

  function buildNpc() {
    const g = buildPerson(G.mats.blue, 0.72);
    g.position.set(SPOT.npc.x, G.home.floor, SPOT.npc.z);
    g.rotation.y = 0;                            // de cara al arranque (+z)
    const tag = makeTag(2.3, 0.66);
    tag.spr.position.set(0, headTop(g) + 0.85, 0.45);
    drawTag(tag, { title: 'JUGAR', color: '#2fbf86' });
    g.add(tag.spr);
    G.place.add(g);
    S.npc = { group: g, tag: tag };
  }

  function buildStations() {
    const M = G.mats;
    const glow = glowTexture();
    STATIONS.forEach(function (def) {
      const c = COLORS[def.c];
      const g = new T.Group();
      g.position.set(def.x, STATION_Y, def.z);

      /* Color plano (sin iluminación) para que la caja se lea exactamente
         igual que la muestra del HUD: las luces del almacén lavaban el
         naranja hacia amarillo y el violeta hacia blanco. */
      const mat = new T.MeshBasicMaterial({ color: c.hex });      const box = addMesh(new T.BoxGeometry(0.44, 0.44, 0.4), mat, 0, 0, 0, g);
      const edge = new T.LineSegments(
        new T.EdgesGeometry(new T.BoxGeometry(0.48, 0.48, 0.44)),
        new T.LineBasicMaterial({ color: 0xffffff })
      );
      g.add(edge);

      const halo = new T.Sprite(new T.SpriteMaterial({
        map: glow, color: c.hex, transparent: true,
        blending: T.AdditiveBlending, depthWrite: false, opacity: 0.6
      }));
      halo.scale.set(1.5, 1.5, 1);
      g.add(halo);

      /* El cartel se adelanta hacia la entrada del pasillo y queda por
         encima de la caja: dentro de la estantería lo tapa el marco. */
      const tag = makeTag(2.4, 0.7);
      tag.spr.position.set(0, 0.35, 0.6);
      g.add(tag.spr);

      G.place.add(g);
      S.stations.push({
        def: def, group: g, box: box, mat: mat, halo: halo, tag: tag, edge: edge
      });
    });
    updateStationSigns();
  }

  function updateStationSigns() {
    S.stations.forEach(function (st) {
      const c = COLORS[st.def.c];
      const n = stockP[st.def.c] || 0;
      drawTag(st.tag, {
        color: c.css,
        title: c.name,
        sub: n > 0 ? (n === 1 ? '1 unidad' : n + ' unidades') : 'AGOTADO'
      });
      st.mat.color.setHex(n > 0 ? c.hex : 0x39465a);
      st.box.visible = n > 0;
      st.edge.visible = n > 0;
      st.halo.material.color.setHex(n > 0 ? c.hex : 0x39465a);
    });
  }

  function buildCustomer() {
    const g = buildPerson(G.mats.white, 0.6);
    g.position.set(SPOT.customer.x, G.home.floor, SPOT.customer.z);
    g.rotation.y = 0;                            // mira al jugador (+z)
    const tag = makeTag(3.1, 0.86);
    tag.spr.position.set(0, headTop(g) + 1.15, 0);
    g.add(tag.spr);
    g.visible = false;
    G.place.add(g);
    S.customer = { group: g, tag: tag };
  }

  function buildBotCustomer() {
    const g = buildPerson(G.mats.green, 0.6);
    g.position.set(SPOT.bot.x, G.home.floor, SPOT.bot.z);
    g.rotation.y = Math.PI;                      // mira a la máquina (-z)
    const tag = makeTag(3.1, 0.86);
    tag.spr.position.set(0, headTop(g) + 1.15, 0);
    g.add(tag.spr);
    g.visible = false;
    G.place.add(g);
    S.botCustomer = { group: g, tag: tag };
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

  /* Cajas de color dentro de la máquina: una por medicamento. */
  function buildBotBoxes() {
    const spec = G.spec, boxes = G.machine.boxes;
    const n = spec.length;
    for (let i = 0; i < COLORS.length; i++) {
      const idx = Math.min(n - 1, Math.floor((i + 0.5) * n / COLORS.length));
      const sp = spec[idx], m = boxes[idx];
      if (!sp || !m) continue;
      G.place.attach(m);
      const c = COLORS[i];
      m.material = new T.MeshBasicMaterial({ color: c.hex });
      m.scale.set(1, 1, 1);
      m.rotation.set(0, 0, 0);
      const home = new T.Vector3(
        sp.x,
        G.home.floor + G.boxY(sp),
        G.home.mz + 0.55 - sp.d / 2
      );
      m.position.copy(home);
      m.visible = true;
      S.botBoxes.push({ color: i, spec: sp, mesh: m, home: home });
    }
  }

  function buildHand() {
    handMesh = new T.Mesh(
      new T.BoxGeometry(0.26, 0.26, 0.26),
      new T.MeshBasicMaterial({ color: 0xffffff })
    );
    handMesh.position.set(0.46, -0.4, -1.05);
    handMesh.visible = false;
    G.camera.add(handMesh);
    G.scene.add(G.camera);
  }

  function hideLegacy() {
    /* Los carteles de los personajes originales viven dentro del grupo del
       lugar; se reconocen por su anclaje inferior (center.y ~ 0.02). */
    G.place.traverse(function (o) {
      if (o.isSprite && o.center && o.center.y < 0.2) o.visible = false;
    });
  }

  /* ---------------- Movimiento del CNC ---------------- */
  function setMast(x) { G.machine.mast.position.x = x - G.home.pxOff; }
  function setCar(y) { G.machine.car.position.y = y; }
  function setPad(e) { G.machine.pad.position.z = lerp(G.home.ret, G.home.ext, e) - G.home.zm; }

  function parkMachine() {
    G.machine.root.rotation.y = 0;
    cnc.x = G.home.x;
    cnc.y = G.home.y;
    cnc.e = 0;
    cnc.box = null;
    cnc.spec = null;
    applyCnc();
  }

  function applyCnc() {
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
          '<i class="rg-swatch"></i>' +
          '<div class="rg-req-txt"><small>PEDIDO</small><b>—</b></div>' +
        '</div>' +
        '<div id="rg-carry" class="rg-panel"><i></i><span></span></div>' +
      '</div>' +
      '<div id="rg-time" class="rg-panel">3:00</div>' +
      '<div id="rg-toast" role="status" aria-live="polite"></div>' +
      '<div id="rg-hint" class="rg-panel"></div>';
    document.body.appendChild(hud);

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
    nodes.diffNote = document.getElementById('rg-diff-note');
    nodes.end = end;
    nodes.endTitle = document.getElementById('rg-end-title');
    nodes.endSub = document.getElementById('rg-end-sub');
    nodes.endP = document.getElementById('rg-end-p');
    nodes.endB = document.getElementById('rg-end-b');
    nodes.time = document.getElementById('rg-time');
    nodes.req = document.getElementById('rg-req');
    nodes.swatch = nodes.req.querySelector('.rg-swatch');
    nodes.reqName = nodes.req.querySelector('.rg-req-txt b');
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
    if (c < 0) { nodes.req.classList.remove('on'); return; }
    const col = COLORS[c];
    nodes.req.classList.add('on');
    nodes.swatch.style.background = col.css;
    nodes.swatch.style.color = col.css;
    nodes.reqName.textContent = col.name;
  }

  function setCarry(c) {
    if (!nodes.carry) return;
    if (c < 0) {
      nodes.carry.classList.remove('on');
      if (handMesh) handMesh.visible = false;
      return;
    }
    const col = COLORS[c];
    nodes.carry.classList.add('on');
    nodes.carryDot.style.background = col.css;
    nodes.carryTxt.textContent = 'Llevas: ' + col.name;
    if (handMesh) {
      handMesh.visible = true;
      handMesh.material.color.setHex(col.hex);
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

  function nearestStation() {
    let best = null, bd = 1e9;
    for (let i = 0; i < S.stations.length; i++) {
      const st = S.stations[i];
      const d = dist(G.player.x, G.player.z, st.def.x, st.def.z);
      if (d < CFG.pickup && d < bd) { bd = d; best = st; }
    }
    return best;
  }

  function spawnCustomer() {
    const c = pickColor(stockP, requestP);
    if (c < 0) return;
    requestP = c;
    const col = COLORS[c];
    drawTag(S.customer.tag, {
      color: col.css,
      title: 'PIDE ' + col.name,
      sub: 'Llévalo al mostrador'
    });
    S.customer.group.visible = true;
    S.customer.pop = 0;
    setRequest(c);
  }

  function take(st) {
    const c = st.def.c;
    if (carrying >= 0 || stockP[c] <= 0) return false;
    stockP[c]--;
    carrying = c;
    setCarry(c);
    updateStationSigns();
    toast('Recogiste ' + COLORS[c].name, 'ok');
    return true;
  }

  function deliver() {
    if (carrying < 0) return false;
    const c = carrying;
    if (requestP === c) {
      scoreP++;
      setScore();
      carrying = -1;
      setCarry(-1);
      requestP = -1;
      setRequest(-1);
      drawTag(S.customer.tag, {
        color: '#2fbf86',
        title: '¡GRACIAS!',
        sub: 'Cliente atendido'
      });
      customerHideAt = now() + 0.9;
      customerWaitUntil = now() + 1.7;
      updateStationSigns();
      toast('¡Correcto! +1', 'ok');
      return true;
    }
    stockP[c]++;
    carrying = -1;
    setCarry(-1);
    updateStationSigns();
    toast('Medicamento incorrecto', 'bad');
    return true;
  }

  /* ---------------- Ciclo de partida ---------------- */
  function begin() {
    state = 'playing';
    if (uiEditor && uiEditor.root.classList.contains('on')) uiClose(false);
    scoreP = 0;
    scoreB = 0;
    carrying = -1;
    requestP = -1;
    requestB = -1;
    bot = null;
    resetStocks();
    updateStationSigns();
    setScore();
    setRequest(-1);
    setCarry(-1);

    S.customer.group.visible = false;
    S.customer.pop = 0;
    S.botCustomer.group.visible = false;
    S.botCustomer.pop = 0;
    S.botBoxes.forEach(function (b) {
      b.mesh.visible = true;
      b.mesh.position.copy(b.home);
      b.mesh.scale.set(1, 1, 1);
    });
    S.kiosk.screenMat.color.setHex(0x39d0ff);
    S.npc.tag.spr.visible = false;
    parkMachine();

    matchStart = now();
    matchEnd = matchStart + CFG.duration;
    nextBotAt = matchStart + CFG.botFirst;
    customerWaitUntil = matchStart + 1.2;
    customerHideAt = 0;

    setTime(CFG.duration);
    setHint(null);
    setAction(null, '');
    document.body.classList.add('ras-arena');
    document.body.classList.remove('rg-over');
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
    setRequest(-1);
    setCarry(-1);
    requestP = -1;
    requestB = -1;
    S.customer.group.visible = false;
    S.botCustomer.group.visible = false;
    bot = null;
    parkMachine();
    S.botBoxes.forEach(function (b) {
      b.mesh.visible = true;
      b.mesh.position.copy(b.home);
      b.mesh.scale.set(1, 1, 1);
    });
    S.kiosk.screenMat.color.setHex(0x39d0ff);
    document.body.classList.add('rg-over');

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
    begin();
  }

  /* Volver al vestíbulo sin partida (desde el botón atrás del resultado). */
  function toIdle() {
    state = 'idle';
    scoreP = 0;
    scoreB = 0;
    requestP = -1;
    requestB = -1;
    carrying = -1;
    bot = null;
    setScore();
    setRequest(-1);
    setCarry(-1);
    setTime(CFG.duration);
    resetStocks();
    updateStationSigns();
    S.customer.group.visible = false;
    S.botCustomer.group.visible = false;
    S.npc.tag.spr.visible = true;
    S.kiosk.screenMat.color.setHex(0x39d0ff);
    S.botBoxes.forEach(function (b) {
      b.mesh.visible = true;
      b.mesh.position.copy(b.home);
      b.mesh.scale.set(1, 1, 1);
    });
    parkMachine();
    document.body.classList.remove('rg-over');
    if (nodes.end) nodes.end.classList.remove('on');
    setHint('Acércate al encargado para empezar');
    setAction(null, '');
    setOptsVisible();
  }

  /* ---------------- Acción contextual ---------------- */
  function interact() {
    if (!G || state === 'boot' || failed) return false;
    if (state === 'over') { restart(); return true; }

    if (state === 'idle') {
      if (dist(G.player.x, G.player.z, SPOT.npc.x, SPOT.npc.z) < CFG.talk) {
        begin();
        return true;
      }
      return false;
    }

    if (carrying >= 0) {
      if (dist(G.player.x, G.player.z, SPOT.counter.x, SPOT.counter.z) < CFG.deliver) {
        return deliver();
      }
      return false;
    }

    const st = nearestStation();
    if (st && stockP[st.def.c] > 0) return take(st);
    return false;
  }

  function updatePrompt() {
    if (state === 'idle') {
      const d = dist(G.player.x, G.player.z, SPOT.npc.x, SPOT.npc.z);
      if (d < CFG.talk) {
        setHint('Interactuar para jugar');
        setAction('JUGAR', 'go');
      } else {
        setHint('Acércate al encargado para empezar');
        setAction(null, '');
      }
      return;
    }
    if (state !== 'playing') {
      setHint(null);
      setAction(null, '');
      return;
    }
    if (carrying >= 0) {
      const near = dist(G.player.x, G.player.z, SPOT.counter.x, SPOT.counter.z) < CFG.deliver;
      if (near) {
        setHint(null);
        setAction('ENTREGAR', 'give');
      } else {
        setHint('Llevá ' + COLORS[carrying].name + ' al mostrador');
        setAction(null, '');
      }
      return;
    }
    const st = nearestStation();
    if (st && stockP[st.def.c] > 0) {
      setHint(null);
      setAction('RECOGER', 'take');
    } else if (Math.abs(G.player.z) < 7 && Math.abs(G.player.x) < 11.5) {
      /* El emblema RASMATIC ocupa el centro del vestíbulo: es sólido y hay
         que bordearlo para entrar al pasillo de góndolas. */
      setHint('Rodeá el logo por el costado');
      setAction(null, '');
    } else {
      setHint(null);
      setAction(null, '');
    }
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
    drawTag(S.botCustomer.tag, {
      color: col.css,
      title: 'PIDE ' + col.name,
      sub: 'El bot ya lo busca'
    });
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
          bot.dropFrom = bot.box.mesh.position.clone();
          bot.dropTo = new T.Vector3(
            G.home.x,
            G.home.floor + 0.46 + bot.spec.h / 2,
            G.home.mz + 1.3
          );
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
            G.home.floor + 3.2 * K + 0.4,
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
          drawTag(S.botCustomer.tag, {
            color: '#2fbf86',
            title: '¡ENTREGADO!',
            sub: 'Cliente del bot'
          });
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
          b.mesh.visible = stockB[col] > 0;
          b.mesh.position.copy(b.home);
          b.mesh.scale.set(1, 1, 1);
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

    if (state === 'playing') {
      if (t >= matchEnd) { finish(); return; }
      setTime(matchEnd - t);
      if (requestP < 0 && !S.customer.group.visible && t >= customerWaitUntil) spawnCustomer();
      if (customerHideAt && t >= customerHideAt) {
        customerHideAt = 0;
        S.customer.group.visible = false;
      }
      botUpdate();
    }

    for (let i = 0; i < S.stations.length; i++) {
      const st = S.stations[i];
      if (!st.box.visible) continue;
      st.halo.material.opacity = 0.3 + 0.22 * (0.5 + 0.5 * Math.sin(t * 2.6 + i));
    }
    if (S.customer.group.visible && S.customer.pop < 1) {
      S.customer.pop = Math.min(1, S.customer.pop + dt * 4);
      S.customer.group.scale.setScalar(ease(S.customer.pop));
    }
    if (S.botCustomer.group.visible && S.botCustomer.pop < 1) {
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
      handMesh.position.y = -0.4 + Math.sin(t * 4) * 0.02;
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
      G.machine.root.rotation.y = 0;
      /* La escena original usa 40° verticales, pensado para el recorrido
         cinematográfico. En vertical el campo horizontal queda en ~19° y no
         se ven las dos góndolas del pasillo; 62° deja ~30° horizontales sin
         deformar y permite buscar los colores. */
      G.camera.fov = 62;
      G.camera.updateProjectionMatrix();
      window.RasmaticCNC = true;
      window.RasmaticArena = true;
      /* El logo del vestibulo no se usa en la partida: ocultarlo ya en el
         arranque (no depender de que corra el primer cuadro). */
      if (G.logo && G.logo.set) G.logo.set(false);

      parkMachine();
      buildNpc();
      buildStations();
      buildCustomer();
      buildBotCustomer();
      buildKiosk();
      buildBotBoxes();
      buildHand();
      hideLegacy();
      buildUI();
      loadDifficulty();
      uiLoad();

      resetStocks();
      updateStationSigns();
      setScore();
      setTime(CFG.duration);
      setHint('Acércate al encargado para empezar');

      document.body.classList.add('ras-arena', 'dockmin');
      state = 'idle';
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
    if (state === 'playing') {
      const t = now();
      if (t - backAt < 2.5) return false;   // segundo toque: sale de la app
      backAt = t;
      toast('Tocá atrás otra vez para salir', 'bad');
      return true;
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
      request: requestP,
      requestBot: requestB,
      stockP: stockP.slice(),
      stockB: stockB.slice(),
      bot: bot ? { phase: bot.phase, color: bot.color } : null,
      cnc: { x: +cnc.x.toFixed(2), y: +cnc.y.toFixed(2), e: +cnc.e.toFixed(2), box: !!cnc.box },
      player: G ? { x: +G.player.x.toFixed(2), z: +G.player.z.toFixed(2) } : null,
      customer: !!(S.customer && S.customer.group.visible),
      botCustomer: !!(S.botCustomer && S.botCustomer.group.visible),
      ui: { action: promptLabel, hint: nodes.hint ? nodes.hint._t : null },
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
    setDifficulty: function (id) { return applyDifficulty(id, true); },
    getDifficulty: function () {
      return { id: difficulty, label: DIFFICULTY[difficulty].label,
        interval: CFG.botInterval, first: CFG.botFirst, speed: CFG.botSpeed };
    },
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
      config: function (o) {
        if (!o) return CFG;
        if (typeof o.difficulty === 'string') applyDifficulty(o.difficulty, true);
        if (typeof o.botInterval === 'number') CFG.botInterval = o.botInterval;
        if (typeof o.botFirst === 'number') CFG.botFirst = o.botFirst;
        if (typeof o.botSpeed === 'number' && o.botSpeed > 0) CFG.botSpeed = o.botSpeed;
        if (typeof o.duration === 'number') CFG.duration = o.duration;
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
