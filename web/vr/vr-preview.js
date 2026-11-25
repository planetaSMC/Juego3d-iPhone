/* ============================================================
   RASMATIC · VR BOX  (Windows y app iOS)
   ------------------------------------------------------------
   Modo estereoscopico real + calibracion completa para usar el
   telefono dentro de unas VR Box.

   Reglas de diseno:
     - NO modifica el juego ni el mapeo de controles.
     - Intercepta renderer.render y, cuando esta apagado, lo llama
       exactamente igual que antes (paso directo).
     - Estereo real: dos frustums asimetricos off-axis (sin toe-in),
       reutilizando la camara del juego (conserva la mano y el HUD).
     - El HUD y los menus se dibujan por ojo (dos copias), para que
       cada lente vea la interfaz completa y no una mitad cortada.
     - El postproceso (distorsion, recorte e imagen) solo se activa
       cuando hace falta: sin ajustes, el camino es directo.

   Superficie publica (para pruebas y consola):
     RasmaticVR.enable() / disable() / toggle()
     RasmaticVR.set(clave, valor) / profile(nombre) / reset()
     RasmaticVR.resetGroup(grupo)
     RasmaticVR.saveConfig(nombre) / loadConfig(nombre) / deleteConfig(nombre)
     RasmaticVR.listConfigs() / exportConfig() / importConfig(texto)
     RasmaticVR.isActive() / isDesktop() / isMobile() / state()
   ============================================================ */
(function () {
  'use strict';

  var THREE = window.THREE;
  var core = window.RasmaticCore;
  if (!THREE || !core || !core.game || !core.game.renderer) {
    if (window.console && console.warn) {
      console.warn('[VR] RasmaticCore.game no esta disponible; el modo VR queda apagado.');
    }
    return;
  }

  var renderer = core.game.renderer;
  var gameCamera = core.game.camera;

  var VERSION = 'vr-cal-2.0';
  var STORE_KEY = 'rasmatic.vr.settings.v2';
  var CFG_KEY = 'rasmatic.vr.profiles.v1';
  var LEGACY_KEY = 'rasmatic.vr.settings.v1';
  var FORCE = /[?&]vr=1\b/.test(location.search);
  /* El calibrador de Windows carga el juego con ?embed=1: usa la API y su
     propio panel, sin el boton flotante ni el panel VR del telefono. */
  var EMBED = /[?&]embed=1\b/.test(location.search);
  /* Movil = iPhone/iPad/Android o cualquier pantalla tactil. En la app iOS
     el modo VR debe estar disponible; antes solo se mostraba en escritorio. */
  var MOBILE = navigator.maxTouchPoints > 0 ||
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '') ||
    window.matchMedia('(pointer:coarse)').matches;
  var DESKTOP = !MOBILE;

  /* ------------------------------------------------------------------
     Ajustes. Todo valor neutro es el que deja la imagen como antes:
     camDist/camHeight/camShift/camPitch 0, depth 1, offsets 0, escala 1,
     imagen 1, nitidez 0, recorte 0.
     ------------------------------------------------------------------ */
  var DEFAULTS = {
    /* Estereo */
    ipd: 64,             /* milimetros entre centros de ojos */
    convergence: 3.0,    /* metros: plano de disparidad cero */
    depth: 1.0,          /* intensidad estereo (0 = plano) */
    /* Camara */
    fov: 70,             /* grados verticales por ojo */
    camZoom: 1.0,        /* zoom optico: 1 = neutro */
    camDist: 0.0,        /* metros: + aleja, - acerca */
    camHeight: 0.0,      /* metros: sube/baja el punto de vista */
    camShiftX: 0.0,      /* metros: corre la camara a izquierda/derecha */
    camShiftY: 0.0,      /* metros: corre la camara arriba/abajo */
    camPitch: 0.0,       /* grados: inclina la vista */
    /* Distribucion de pantalla */
    zoom: 1.0,           /* 0.5..1: tamano de cada imagen en su mitad */
    gap: 0.02,           /* 0..0.1: separacion central (fraccion del semiancho) */
    stageX: 0.0,         /* % del ancho: desplaza el conjunto */
    stageY: 0.0,         /* % del alto: desplaza el conjunto */
    aspect: 0.0,         /* 0 = automatico; otro valor fuerza el marco */
    distortion: 0.0,     /* 0..0.3: aproximacion de lente VR Box */
    profile: 'window',
    customW: 1920,
    customH: 1080,
    /* Lente izquierda / derecha */
    eyeOffXL: 0.0, eyeOffXR: 0.0,   /* % del ancho del ojo */
    eyeOffYL: 0.0, eyeOffYR: 0.0,   /* % del alto del ojo */
    eyeScaleL: 1.0, eyeScaleR: 1.0, /* escala independiente */
    cropL: 0.0, cropR: 0.0,         /* 0..0.25: recorte simetrico de bordes */
    /* Imagen */
    brightness: 1.0,
    contrast: 1.0,
    saturation: 1.0,
    gamma: 1.0,
    sharpness: 0.0,
    /* Interfaz / modo */
    guides: false,
    vignette: false,
    testMode: false,
    /* per-eye: una copia del HUD dentro de cada ojo (VR real).
       flat: una sola copia recortada al marco (vista previa de escritorio).
       off: sin HUD. */
    hudMode: 'per-eye'
  };

  var PROFILES = {
    window: { label: 'Ventana (llenar)', w: 0, h: 0 },
    'iphone-15-landscape': { label: 'iPhone 15 · horizontal', w: 2556, h: 1179 },
    'iphone-15-portrait': { label: 'iPhone 15 · vertical', w: 1179, h: 2556 },
    'iphone-13-landscape': { label: 'iPhone 13 · horizontal', w: 2532, h: 1170 },
    'iphone-se-landscape': { label: 'iPhone SE · horizontal', w: 1334, h: 750 },
    'vrbox-16-9': { label: 'VR Box · 16:9', w: 1920, h: 1080 },
    'vrbox-2-1': { label: 'VR Box · 2:1', w: 2160, h: 1080 },
    custom: { label: 'Personalizado', w: 0, h: 0 }
  };

  /* Limites seguros por parametro: [minimo, maximo, paso]. */
  var SPEC = {
    ipd: [50, 75, 1],
    convergence: [0.5, 10, 0.1],
    depth: [0, 2, 0.01],
    fov: [40, 110, 1],
    camZoom: [0.5, 2, 0.01],
    camDist: [-3, 3, 0.05],
    camHeight: [-1.5, 1.5, 0.02],
    camShiftX: [-0.6, 0.6, 0.01],
    camShiftY: [-0.6, 0.6, 0.01],
    camPitch: [-20, 20, 0.5],
    zoom: [0.5, 1, 0.01],
    gap: [0, 0.1, 0.005],
    stageX: [-25, 25, 0.5],
    stageY: [-25, 25, 0.5],
    aspect: [0, 3, 0.01],
    distortion: [0, 0.3, 0.01],
    eyeOffXL: [-25, 25, 0.5],
    eyeOffXR: [-25, 25, 0.5],
    eyeOffYL: [-25, 25, 0.5],
    eyeOffYR: [-25, 25, 0.5],
    eyeScaleL: [0.6, 1.2, 0.01],
    eyeScaleR: [0.6, 1.2, 0.01],
    cropL: [0, 0.25, 0.005],
    cropR: [0, 0.25, 0.005],
    brightness: [0.5, 1.8, 0.01],
    contrast: [0.5, 1.8, 0.01],
    saturation: [0, 2, 0.01],
    gamma: [0.5, 2.2, 0.01],
    sharpness: [0, 1, 0.01]
  };

  /* Definicion de cada control: etiqueta, limites, formato y ayuda breve. */
  var CTL = {
    fov: { g: 'cam', label: 'Campo de visión (FOV)', min: 40, max: 110, step: 1, dec: 0, suffix: '°',
      help: 'Grados verticales de cada ojo. Más grados = se ve más escenario y todo queda menos “encima”.' },
    camZoom: { g: 'cam', label: 'Zoom de cámara', min: 0.5, max: 2, step: 0.01, dec: 2, suffix: '×',
      help: '1,00 = neutro. Más de 1 acerca la imagen; menos de 1 la aleja.' },
    camDist: { g: 'cam', label: 'Distancia de cámara', min: -3, max: 3, step: 0.05, dec: 2, suffix: ' m',
      help: 'Positivo aleja la cámara (más escenario); negativo la acerca. No mueve al personaje.' },
    camHeight: { g: 'cam', label: 'Altura de cámara', min: -1.5, max: 1.5, step: 0.02, dec: 2, suffix: ' m',
      help: 'Sube o baja el punto de vista sin tocar la posición del jugador.' },
    camShiftX: { g: 'cam', label: 'Posición horizontal', min: -0.6, max: 0.6, step: 0.01, dec: 2, suffix: ' m',
      help: 'Corre la cámara a izquierda/derecha sobre su eje local.' },
    camShiftY: { g: 'cam', label: 'Posición vertical', min: -0.6, max: 0.6, step: 0.01, dec: 2, suffix: ' m',
      help: 'Corre la cámara arriba/abajo sobre su eje local.' },
    camPitch: { g: 'cam', label: 'Inclinación', min: -20, max: 20, step: 0.5, dec: 1, suffix: '°',
      help: 'Inclina la vista arriba/abajo. Es un ajuste fijo: todavía no hay head tracking.' },

    ipd: { g: 'stereo', label: 'IPD virtual', min: 50, max: 75, step: 1, dec: 0, suffix: ' mm',
      help: 'Separación entre los dos ojos virtuales. 64 mm es el promedio adulto.' },
    depth: { g: 'stereo', label: 'Intensidad 3D', min: 0, max: 2, step: 0.01, dec: 2, suffix: '×',
      help: 'Multiplica la separación estéreo y la convergencia. 0 deja una imagen plana.' },
    convergence: { g: 'stereo', label: 'Convergencia', min: 0.5, max: 10, step: 0.1, dec: 1, suffix: ' m',
      help: 'Distancia donde las dos vistas coinciden (disparidad cero).' },

    eyeOffXL: { g: 'left', label: 'Desplazamiento horizontal', min: -25, max: 25, step: 0.5, dec: 1, suffix: ' %',
      help: 'Mueve solo la vista izquierda dentro de su área.' },
    eyeOffYL: { g: 'left', label: 'Desplazamiento vertical', min: -25, max: 25, step: 0.5, dec: 1, suffix: ' %',
      help: 'Sube o baja solo la vista izquierda.' },
    eyeScaleL: { g: 'left', label: 'Escala de la vista', min: 0.6, max: 1.2, step: 0.01, dec: 2, suffix: '×',
      help: 'Tamaño independiente de la imagen izquierda.' },
    cropL: { g: 'left', label: 'Recorte de bordes', min: 0, max: 0.25, step: 0.005, dec: 1, suffix: ' %', mul: 100,
      help: 'Recorta los bordes de la vista izquierda. Útil si la lente tapa una franja.' },

    eyeOffXR: { g: 'right', label: 'Desplazamiento horizontal', min: -25, max: 25, step: 0.5, dec: 1, suffix: ' %',
      help: 'Mueve solo la vista derecha dentro de su área.' },
    eyeOffYR: { g: 'right', label: 'Desplazamiento vertical', min: -25, max: 25, step: 0.5, dec: 1, suffix: ' %',
      help: 'Sube o baja solo la vista derecha.' },
    eyeScaleR: { g: 'right', label: 'Escala de la vista', min: 0.6, max: 1.2, step: 0.01, dec: 2, suffix: '×',
      help: 'Tamaño independiente de la imagen derecha.' },
    cropR: { g: 'right', label: 'Recorte de bordes', min: 0, max: 0.25, step: 0.005, dec: 1, suffix: ' %', mul: 100,
      help: 'Recorta los bordes de la vista derecha. Útil si la lente tapa una franja.' },

    zoom: { g: 'screen', label: 'Tamaño de las dos imágenes', min: 0.5, max: 1, step: 0.01, dec: 0, suffix: ' %', mul: 100,
      help: 'Porcentaje de cada mitad que ocupa la imagen. Menos tamaño deja más aire para las lentes.' },
    gap: { g: 'screen', label: 'Margen central', min: 0, max: 0.1, step: 0.005, dec: 1, suffix: ' %', mul: 100,
      help: 'Franja negra extra en el medio, para que no se junten las dos imágenes.' },
    stageX: { g: 'screen', label: 'Desplazamiento horizontal del conjunto', min: -25, max: 25, step: 0.5, dec: 1, suffix: ' %',
      help: 'Mueve las dos vistas juntas a izquierda/derecha.' },
    stageY: { g: 'screen', label: 'Desplazamiento vertical del conjunto', min: -25, max: 25, step: 0.5, dec: 1, suffix: ' %',
      help: 'Mueve las dos vistas juntas arriba/abajo.' },
    aspect: { g: 'screen', label: 'Relación de aspecto', min: 0, max: 3, step: 0.01, dec: 2, suffix: '',
      help: '0 = automática (la del perfil). Un valor fuerza el marco, por ejemplo 2,00 para 2:1.' },
    distortion: { g: 'screen', label: 'Distorsión de lente', min: 0, max: 0.3, step: 0.01, dec: 0, suffix: ' %', mul: 100,
      help: 'Aproximación radial de la lente de las VR Box. Es una corrección, no una medición exacta.' },

    brightness: { g: 'image', label: 'Brillo', min: 0.5, max: 1.8, step: 0.01, dec: 2, suffix: '×',
      help: 'Multiplica el brillo. 1,00 = neutro.' },
    contrast: { g: 'image', label: 'Contraste', min: 0.5, max: 1.8, step: 0.01, dec: 2, suffix: '×',
      help: 'Separa claros y oscuros. 1,00 = neutro.' },
    saturation: { g: 'image', label: 'Saturación', min: 0, max: 2, step: 0.01, dec: 2, suffix: '×',
      help: '0 = blanco y negro; 1,00 = color original.' },
    gamma: { g: 'image', label: 'Gamma', min: 0.5, max: 2.2, step: 0.01, dec: 2, suffix: '',
      help: 'Corrige los tonos medios. Más de 1 aclara las sombras sin quemar los blancos.' },
    sharpness: { g: 'image', label: 'Nitidez', min: 0, max: 1, step: 0.01, dec: 2, suffix: '',
      help: 'Realce suave de bordes. Valores altos generan halos; 0,15–0,35 suele alcanzar.' }
  };

  var GROUPS = {
    cam: { label: 'Cámara', keys: ['fov', 'camZoom', 'camDist', 'camHeight', 'camShiftX', 'camShiftY', 'camPitch'] },
    stereo: { label: '3D', keys: ['ipd', 'depth', 'convergence'] },
    left: { label: 'Lente izquierda', keys: ['eyeOffXL', 'eyeOffYL', 'eyeScaleL', 'cropL'] },
    right: { label: 'Lente derecha', keys: ['eyeOffXR', 'eyeOffYR', 'eyeScaleR', 'cropR'] },
    screen: { label: 'Pantalla', keys: ['profile', 'customW', 'customH', 'zoom', 'gap', 'stageX', 'stageY',
      'aspect', 'distortion', 'hudMode', 'guides', 'vignette'] },
    image: { label: 'Imagen', keys: ['brightness', 'contrast', 'saturation', 'gamma', 'sharpness'] },
    profiles: { label: 'Perfiles', keys: [] }
  };

  var TABS = [
    ['cam', 'Cámara'], ['stereo', '3D'], ['left', 'Lente izq.'], ['right', 'Lente der.'],
    ['screen', 'Pantalla'], ['image', 'Imagen'], ['profiles', 'Perfiles']
  ];

  /* IDs historicos que usan las pruebas y la documentacion. */
  var IDS = {
    ipd: 'vr-ipd', fov: 'vr-fov', zoom: 'vr-zoom', gap: 'vr-gap',
    convergence: 'vr-conv', distortion: 'vr-dist',
    profile: 'vr-profile', customW: 'vr-cw', customH: 'vr-ch',
    hudMode: 'vr-hud-mode', guides: 'vr-guides', vignette: 'vr-vig'
  };

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function idOf(key) { return IDS[key] || ('vr-' + key); }
  function fmt(key, v) {
    var c = CTL[key];
    if (!c) return String(v);
    if (key === 'aspect') return v < 0.01 ? 'Auto' : v.toFixed(2).replace('.', ',') + ':1';
    var m = c.mul || 1;
    var s = (v * m).toFixed(c.dec || 0);
    if ((c.dec || 0) > 0) s = s.replace('.', ',');
    return s + (c.suffix || '');
  }

  /* ---------------- preferencias ---------------- */
  function readStore(key) {
    try {
      var raw = window.localStorage && localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null; /* modo privado o JSON corrupto */
    }
  }

  function loadSettings() {
    var saved = readStore(STORE_KEY);
    var legacy = saved ? null : readStore(LEGACY_KEY);
    if (saved) return sanitize(saved);
    if (legacy) {
      /* v1 guardaba `hud` como booleano. Se conserva la eleccion del usuario. */
      var s = {};
      for (var r in DEFAULTS) if (has(DEFAULTS, r)) s[r] = legacy[r] !== undefined ? legacy[r] : DEFAULTS[r];
      s.hudMode = legacy.hud === false ? 'off' : (legacy.hud === true ? 'flat' : DEFAULTS.hudMode);
      return sanitize(s);
    }
    return sanitize({});
  }

  function sanitize(src) {
    var s = {}, k;
    for (k in DEFAULTS) if (has(DEFAULTS, k)) s[k] = DEFAULTS[k];
    if (src && typeof src === 'object') {
      for (k in SPEC) {
        if (has(SPEC, k) && src[k] !== undefined) {
          s[k] = clamp(num(src[k], DEFAULTS[k]), SPEC[k][0], SPEC[k][1]);
        }
      }
      if (has(PROFILES, src.profile)) s.profile = src.profile;
      s.customW = Math.round(clamp(num(src.customW, DEFAULTS.customW), 320, 4096));
      s.customH = Math.round(clamp(num(src.customH, DEFAULTS.customH), 320, 4096));
      s.guides = !!src.guides;
      s.vignette = !!src.vignette;
      s.testMode = !!src.testMode;
      if (src.hudMode === 'per-eye' || src.hudMode === 'flat' || src.hudMode === 'off') s.hudMode = src.hudMode;
    }
    return s;
  }

  var settings = loadSettings();
  var active = false;
  var ui = {};
  var stats = { frames: 0, sceneDraws: 0, blits: 0, rtFrames: 0, postFrames: 0, lastMs: 0, avgMs: 0 };
  var last = { eyes: [], base: null, stage: null, path: 'direct', test: false };
  var rts = [null, null];
  var quad = null;
  var quadMat = null;
  var quadCam = null;
  var quadScene = null;
  var testScene = null;
  var testCam = null;

  /* Vista central / diagnostico para el calibrador de Windows. Es un camino
     de render aparte: no activa el estereo ni toca las camaras del telefono. */
  var mono = false;
  var monoView = 'center';           /* center | left | right | sbs */
  var MONO_VIEWS = ['center', 'left', 'right', 'sbs'];
  var locked = false;                /* calibracion bloqueada desde la PC */
  var changeListeners = [];

  /* Copias por ojo del HUD y de los menus. Se crean recien cuando el juego
     ya construyo el original, para que document.getElementById siga
     devolviendo el nodo real (el primero del documento). */
  var mirrors = { hud: null, pause: null, end: null, act: null };
  var mirrorSig = { hud: '', pause: '', end: '', act: '' };
  var layoutTimer = 0;
  var rotateDismissed = false;

  function save() {
    try {
      if (window.localStorage) localStorage.setItem(STORE_KEY, JSON.stringify(settings));
    } catch (e) { /* sin persistencia */ }
  }

  /* ---------------- geometria de la pantalla ---------------- */
  function profileSize() {
    if (settings.profile === 'custom') {
      return { w: settings.customW, h: settings.customH };
    }
    var p = PROFILES[settings.profile];
    return p && p.w ? { w: p.w, h: p.h } : null;
  }

  /* Todo en pixeles del drawing buffer (device px). */
  function computeStage(W, H) {
    var size = profileSize();
    var sw = W, sh = H;
    if (size) {
      var aspect = size.w / size.h;
      sw = Math.min(W, Math.round(H * aspect));
      sh = Math.round(sw / aspect);
      if (sh > H) { sh = H; sw = Math.round(sh * aspect); }
    }
    /* Relacion de aspecto forzada (0 = automatica). */
    if (settings.aspect > 0.01) {
      var a = clamp(settings.aspect, 0.2, 3);
      if (Math.round(sh * a) <= W) sw = Math.round(sh * a);
      else { sw = W; sh = Math.round(W / a); }
    }
    /* Desplazamiento del conjunto, con tope para no perder la imagen. */
    var ox = Math.round(W * settings.stageX / 100);
    var oy = Math.round(H * settings.stageY / 100);
    var x = Math.floor((W - sw) / 2) + ox;
    var y = Math.floor((H - sh) / 2) + oy;
    x = clamp(x, Math.round(-sw * 0.75), Math.round(W - sw * 0.25));
    y = clamp(y, Math.round(-sh * 0.75), Math.round(H - sh * 0.25));
    return { x: x, y: y, w: sw, h: sh, aspect: sw / sh };
  }

  function applyEye(e, scale, offX, offY) {
    if (Math.abs(scale - 1) > 1e-4) {
      var cx = e.x + e.w / 2, cy = e.y + e.h / 2;
      e.w = Math.max(16, Math.round(e.w * scale));
      e.h = Math.max(16, Math.round(e.h * scale));
      e.x = Math.round(cx - e.w / 2);
      e.y = Math.round(cy - e.h / 2);
    }
    if (offX) e.x += Math.round(e.w * offX / 100);
    if (offY) e.y += Math.round(e.h * offY / 100);
    e.aspect = e.w / e.h;
    return e;
  }

  function computeEyes(stage) {
    var halfW = stage.w / 2;
    var gapPx = Math.round(halfW * settings.gap);
    var usable = Math.max(16, halfW - gapPx);
    var ew = Math.max(16, Math.round(usable * settings.zoom));
    var eh = Math.max(16, Math.round(stage.h * settings.zoom));
    var ey = stage.y + Math.round((stage.h - eh) / 2);
    var lx = stage.x + Math.round((halfW - ew) / 2 - gapPx / 2);
    var rx = stage.x + halfW + Math.round((halfW - ew) / 2 + gapPx / 2);
    return [
      applyEye({ side: 'left', x: lx, y: ey, w: ew, h: eh, aspect: ew / eh },
        settings.eyeScaleL, settings.eyeOffXL, settings.eyeOffYL),
      applyEye({ side: 'right', x: rx, y: ey, w: ew, h: eh, aspect: ew / eh },
        settings.eyeScaleR, settings.eyeOffXR, settings.eyeOffYR)
    ];
  }

  /* ---------------- postproceso (RT + shader) ---------------- */
  var origRender = renderer.render;

  function needsRT() {
    return settings.distortion > 0.001 ||
      settings.cropL > 0.001 || settings.cropR > 0.001 ||
      Math.abs(settings.brightness - 1) > 0.001 ||
      Math.abs(settings.contrast - 1) > 0.001 ||
      Math.abs(settings.saturation - 1) > 0.001 ||
      Math.abs(settings.gamma - 1) > 0.001 ||
      settings.sharpness > 0.001;
  }

  /* La vista central es un monitor normal: no lleva distorsion de lente ni
     recorte, solo los ajustes de imagen. */
  function imageNeedsRT() {
    return Math.abs(settings.brightness - 1) > 0.001 ||
      Math.abs(settings.contrast - 1) > 0.001 ||
      Math.abs(settings.saturation - 1) > 0.001 ||
      Math.abs(settings.gamma - 1) > 0.001 ||
      settings.sharpness > 0.001;
  }

  function ensureRT(i, w, h) {
    var t = rts[i];
    if (t && t.width === w && t.height === h) return t;
    if (t) t.dispose();
    t = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false
    });
    t.texture.wrapS = THREE.ClampToEdgeWrapping;
    t.texture.wrapT = THREE.ClampToEdgeWrapping;
    t.texture.generateMipmaps = false;
    rts[i] = t;
    return t;
  }

  var VERT = [
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = uv;',
    '  gl_Position = vec4(position.xy, 0.0, 1.0);',
    '}'
  ].join('\n');

  /* Distorsion radial + recorte + brillo/contraste/saturacion/gamma/nitidez.
     Se aplica por ojo, sobre la imagen ya renderizada en el render target. */
  var FRAG = [
    'precision highp float;',
    'uniform sampler2D tDiffuse;',
    'uniform vec2 uTexel;',
    'uniform float uAspect;',
    'uniform float uK;',
    'uniform float uCrop;',
    'uniform float uBright;',
    'uniform float uContrast;',
    'uniform float uSat;',
    'uniform float uGamma;',
    'uniform float uSharp;',
    'varying vec2 vUv;',
    'vec3 adjust(vec3 c) {',
    '  c *= uBright;',
    '  c = (c - 0.5) * uContrast + 0.5;',
    '  float l = dot(c, vec3(0.299, 0.587, 0.114));',
    '  c = mix(vec3(l), c, uSat);',
    '  c = pow(max(c, vec3(0.0)), vec3(1.0 / max(uGamma, 0.01)));',
    '  return clamp(c, 0.0, 1.0);',
    '}',
    'void main() {',
    '  vec2 uv = vUv;',
    '  uv.x = uCrop + uv.x * (1.0 - 2.0 * uCrop);',
    '  vec2 c = uv - 0.5;',
    '  c.x *= uAspect;',
    '  float r2 = dot(c, c);',
    '  float s = 1.0 + uK * r2;',
    '  vec2 duv = vec2(0.5 + (c.x / uAspect) * s, 0.5 + c.y * s);',
    '  duv = clamp(duv, vec2(0.001), vec2(0.999));',
    '  vec3 col = texture2D(tDiffuse, duv).rgb;',
    '  if (uSharp > 0.001) {',
    '    vec3 blur = texture2D(tDiffuse, duv + vec2(uTexel.x, 0.0)).rgb;',
    '    blur += texture2D(tDiffuse, duv - vec2(uTexel.x, 0.0)).rgb;',
    '    blur += texture2D(tDiffuse, duv + vec2(0.0, uTexel.y)).rgb;',
    '    blur += texture2D(tDiffuse, duv - vec2(0.0, uTexel.y)).rgb;',
    '    blur *= 0.25;',
    '    col += (col - blur) * uSharp * 1.5;',
    '  }',
    '  gl_FragColor = vec4(adjust(col), 1.0);',
    '}'
  ].join('\n');

  function buildQuad() {
    quadMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
        uAspect: { value: 1 },
        uK: { value: 0 },
        uCrop: { value: 0 },
        uBright: { value: 1 },
        uContrast: { value: 1 },
        uSat: { value: 1 },
        uGamma: { value: 1 },
        uSharp: { value: 0 }
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false
    });
    quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat);
    quad.frustumCulled = false;
    quadScene = new THREE.Scene();
    quadScene.add(quad);
    quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  function updateQuad(tex, e, crop, k) {
    var u = quadMat.uniforms;
    u.tDiffuse.value = tex;
    u.uTexel.value.set(1 / Math.max(1, e.w), 1 / Math.max(1, e.h));
    u.uAspect.value = e.aspect;
    u.uK.value = k === undefined ? settings.distortion : k;
    u.uCrop.value = crop || 0;
    u.uBright.value = settings.brightness;
    u.uContrast.value = settings.contrast;
    u.uSat.value = settings.saturation;
    u.uGamma.value = settings.gamma;
    u.uSharp.value = settings.sharpness;
  }

  /* ---------------- escena de prueba ---------------- */
  function makeLabel(text, color) {
    var c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    var q = c.getContext('2d');
    q.clearRect(0, 0, 256, 64);
    q.font = '700 30px system-ui, -apple-system, "Segoe UI", sans-serif';
    q.textAlign = 'center';
    q.textBaseline = 'middle';
    q.fillStyle = color || '#bfe0ff';
    q.fillText(text, 128, 32);
    var tex = new THREE.CanvasTexture(c);
    var spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false
    }));
    spr.scale.set(0.7, 0.175, 1);
    spr.renderOrder = 20;
    return spr;
  }

  function buildTestScene() {
    testScene = new THREE.Scene();
    testScene.background = new THREE.Color(0x050a14);
    testCam = new THREE.PerspectiveCamera(62, 1, 0.05, 200);
    testCam.position.set(0, 0, 0);
    testCam.rotation.set(0, 0, 0);

    var root = new THREE.Group();
    testScene.add(root);
    var mGrid = new THREE.LineBasicMaterial({ color: 0x3f9bff, transparent: true, opacity: 0.85 });
    var mSoft = new THREE.LineBasicMaterial({ color: 0x2a6bb5, transparent: true, opacity: 0.45 });
    var mWarm = new THREE.LineBasicMaterial({ color: 0xffc266, transparent: true, opacity: 0.95 });

    function line(a, b, mat) {
      root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), mat));
    }
    function grid(z, hw, hh, st, mat) {
      var x, y;
      for (x = -hw; x <= hw + 1e-6; x += st) line(new THREE.Vector3(x, -hh, z), new THREE.Vector3(x, hh, z), mat);
      for (y = -hh; y <= hh + 1e-6; y += st) line(new THREE.Vector3(-hw, y, z), new THREE.Vector3(hw, y, z), mat);
    }
    function ring(r, z, mat) {
      var pts = [], i;
      for (i = 0; i <= 48; i++) {
        var a = i / 48 * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, z));
      }
      root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    }

    /* Cuadricula frontal (2,5 m) y otra lejana (5 m). */
    grid(-2.5, 2.2, 1.35, 0.22, mGrid);
    grid(-5.0, 3.2, 1.9, 0.4, mSoft);
    /* Ejes centrales: referencia de simetria. */
    line(new THREE.Vector3(0, -1.35, -2.49), new THREE.Vector3(0, 1.35, -2.49), mWarm);
    line(new THREE.Vector3(-2.2, 0, -2.49), new THREE.Vector3(2.2, 0, -2.49), mWarm);
    ring(0.5, -2.48, mWarm);
    ring(1.0, -2.47, mWarm);

    /* Piso en perspectiva. */
    var z, x;
    for (x = -3; x <= 3 + 1e-6; x += 0.5) line(new THREE.Vector3(x, -1.35, -0.6), new THREE.Vector3(x, -1.35, -8), mSoft);
    for (z = -0.6; z >= -8 - 1e-6; z -= 0.5) line(new THREE.Vector3(-3, -1.35, z), new THREE.Vector3(3, -1.35, z), mSoft);

    /* Objetos a distintas profundidades: el parallax se nota de inmediato. */
    var objs = [
      [-1.1, -0.55, -1.2, 0xff5c5c, '1 m'],
      [1.1, -0.55, -1.8, 0x5cff9d, '1,8 m'],
      [-1.5, 0.45, -3.2, 0x5ca8ff, '3,2 m'],
      [1.5, 0.45, -4.2, 0xffe45c, '4,2 m'],
      [0, 0.95, -6.0, 0xff5ce1, '6 m']
    ];
    var geo = new THREE.BoxGeometry(0.24, 0.24, 0.24);
    objs.forEach(function (o) {
      var mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: o[3] }));
      mesh.position.set(o[0], o[1], o[2]);
      mesh.rotation.y = 0.5;
      root.add(mesh);
      var lab = makeLabel(o[4], '#dcecff');
      lab.position.set(o[0], o[1] + 0.28, o[2]);
      root.add(lab);
    });

    /* Marcas de borde: si se deforman o se recortan, se ven enseguida. */
    var edgeMat = new THREE.MeshBasicMaterial({ color: 0xff8a4a });
    [[-2.1, 1.25], [2.1, 1.25], [-2.1, -1.25], [2.1, -1.25]].forEach(function (p) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), edgeMat);
      m.position.set(p[0], p[1], -2.5);
      root.add(m);
    });

    /* Centro exacto de la vista (cada lente lo ve en su propio centro). */
    var center = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xff3b3b }));
    center.position.set(0, 0, -1.0);
    root.add(center);
    var cl = makeLabel('CENTRO', '#ffb3b3');
    cl.position.set(0, 0.2, -1.0);
    root.add(cl);

    return testScene;
  }

  /* ---------------- render estereo ---------------- */
  function renderStereo(sceneArg, cameraArg) {
    var t0 = (window.performance || Date).now();
    var canvas = renderer.domElement;
    var W = canvas.width, H = canvas.height;
    if (!W || !H) return origRender.call(renderer, sceneArg, cameraArg);
    var pr = renderer.getPixelRatio() || 1;

    var useTest = !!settings.testMode;
    if (useTest && !testScene) buildTestScene();
    var scene = useTest ? testScene : sceneArg;
    var camera = useTest ? testCam : cameraArg;

    var stage = computeStage(W, H);
    var eyes = computeEyes(stage);

    /* Estado de la camara: se restaura al final de cada frame. */
    var camPos = camera.position.clone();
    var camQuat = camera.quaternion.clone();
    var camProj = camera.projectionMatrix.clone();
    var camProjInv = camera.projectionMatrixInverse.clone();

    /* Estado del renderer. */
    var prevRT = renderer.getRenderTarget();
    var prevView = renderer.getViewport(new THREE.Vector4());
    var prevScissor = renderer.getScissor(new THREE.Vector4());
    var prevScissorTest = renderer.getScissorTest();
    var prevAutoClear = renderer.autoClear;
    var prevClear = renderer.getClearColor(new THREE.Color());
    var prevAlpha = renderer.getClearAlpha();

    /* Fondo negro en las franjas que deja el perfil de pantalla. */
    renderer.setRenderTarget(null);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W / pr, H / pr);
    renderer.setClearColor(0x000000, 1);
    renderer.autoClear = true;
    renderer.clear(true, true, true);

    var fovY = clamp(settings.fov / Math.max(0.2, settings.camZoom), 20, 120);
    var ipdM = (settings.ipd / 1000) * settings.depth;
    var conv = Math.max(0.2, settings.convergence);
    var useRT = needsRT();
    var near = camera.near, far = camera.far;
    var topN = near * Math.tan(fovY * Math.PI / 360);
    var shift = (ipdM / 2) * near / conv;
    var drawn = [];

    /* Inclinacion extra fija (no es head tracking). */
    var camQuatEff = camQuat.clone();
    if (Math.abs(settings.camPitch) > 1e-4) {
      var q = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0), settings.camPitch * Math.PI / 180);
      camQuatEff.multiply(q);
    }
    var rightV = new THREE.Vector3(1, 0, 0).applyQuaternion(camQuatEff);
    var upV = new THREE.Vector3(0, 1, 0).applyQuaternion(camQuatEff);
    var fwdV = new THREE.Vector3(0, 0, -1).applyQuaternion(camQuatEff);

    var basePos = camPos.clone();
    if (settings.camDist) basePos.addScaledVector(fwdV, -settings.camDist);
    if (settings.camShiftX) basePos.addScaledVector(rightV, settings.camShiftX);
    if (settings.camShiftY) basePos.addScaledVector(upV, settings.camShiftY);
    if (settings.camHeight) basePos.y += settings.camHeight;

    if (useRT && !quad) buildQuad();

    for (var i = 0; i < 2; i++) {
      var e = eyes[i];
      var sign = i === 0 ? -1 : 1;

      /* Ojo desplazado sobre el eje derecho de la camara, sin girarla
         (off-axis): las dos vistas miran en la misma direccion. */
      camera.position.copy(basePos).addScaledVector(rightV, sign * ipdM / 2);
      camera.quaternion.copy(camQuatEff);
      var rightN = topN * e.aspect;
      camera.projectionMatrix.makePerspective(
        -rightN - sign * shift, rightN - sign * shift,
        topN, -topN, near, far
      );
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      camera.updateMatrixWorld(true);

      var vx = e.x / pr, vy = e.y / pr, vw = e.w / pr, vh = e.h / pr;
      renderer.setScissorTest(true);
      renderer.setViewport(vx, vy, vw, vh);
      renderer.setScissor(vx, vy, vw, vh);

      if (useRT) {
        var target = ensureRT(i, e.w, e.h);
        renderer.setRenderTarget(target);
        renderer.setScissorTest(false);
        renderer.setClearColor(0x000000, 1);
        renderer.autoClear = true;
        origRender.call(renderer, scene, camera);

        renderer.setRenderTarget(null);
        renderer.setScissorTest(true);
        renderer.setViewport(vx, vy, vw, vh);
        renderer.setScissor(vx, vy, vw, vh);
        updateQuad(target.texture, e, i === 0 ? settings.cropL : settings.cropR);
        origRender.call(renderer, quadScene, quadCam);
        stats.blits++;
        stats.rtFrames++;
        stats.postFrames++;
      } else {
        renderer.setRenderTarget(null);
        origRender.call(renderer, scene, camera);
      }

      stats.sceneDraws++;
      drawn.push({
        side: e.side,
        x: e.x, y: e.y, w: e.w, h: e.h, aspect: e.aspect,
        position: [camera.position.x, camera.position.y, camera.position.z],
        quaternion: [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w],
        projection: Array.prototype.slice.call(camera.projectionMatrix.elements)
      });
    }

    /* Restaurar todo: el juego sigue viendo su camara intacta. */
    renderer.setRenderTarget(prevRT || null);
    renderer.setScissorTest(prevScissorTest);
    renderer.setViewport(prevView.x, prevView.y, prevView.z, prevView.w);
    renderer.setScissor(prevScissor.x, prevScissor.y, prevScissor.z, prevScissor.w);
    renderer.autoClear = prevAutoClear;
    renderer.setClearColor(prevClear, prevAlpha);
    camera.position.copy(camPos);
    camera.quaternion.copy(camQuat);
    camera.projectionMatrix.copy(camProj);
    camera.projectionMatrixInverse.copy(camProjInv);
    camera.updateMatrixWorld(true);

    stats.frames++;
    var ms = (window.performance || Date).now() - t0;
    stats.lastMs = ms;
    stats.avgMs = stats.avgMs ? stats.avgMs * 0.9 + ms * 0.1 : ms;
    last = {
      eyes: drawn,
      base: [camPos.x, camPos.y, camPos.z],
      stage: { x: stage.x, y: stage.y, w: stage.w, h: stage.h, aspect: stage.aspect },
      path: useRT ? 'rt' : 'direct',
      test: useTest
    };

    /* Barato (una linea de texto) y evita que el panel se quede en
       "Preparando..." cuando la escena renderiza pocos frames por segundo. */
    updateInfo();
    return undefined;
  }

  /* ---------------- vista central / diagnostico ---------------- */
  /* Rectangulo fiel para un ojo suelto: conserva la relacion de aspecto que
     tiene esa vista en el telefono y la centra con barras negras. */
  function monoEyeRect(W, H, side) {
    var stage = computeStage(W, H);
    var eyes = computeEyes(stage);
    var e = eyes[side === 'right' ? 1 : 0];
    var a = e.w / e.h;
    var w = W, h = Math.round(W / a);
    if (h > H) { h = H; w = Math.round(H * a); }
    return {
      x: Math.floor((W - w) / 2),
      y: Math.floor((H - h) / 2),
      w: Math.max(16, w), h: Math.max(16, h),
      aspect: w / h, side: side
    };
  }

  function renderMono(sceneArg, cameraArg) {
    var t0 = (window.performance || Date).now();
    var canvas = renderer.domElement;
    var W = canvas.width, H = canvas.height;
    if (!W || !H) return origRender.call(renderer, sceneArg, cameraArg);
    var pr = renderer.getPixelRatio() || 1;

    var useTest = !!settings.testMode;
    if (useTest && !testScene) buildTestScene();
    var scene = useTest ? testScene : sceneArg;
    var camera = useTest ? testCam : cameraArg;

    var camPos = camera.position.clone();
    var camQuat = camera.quaternion.clone();
    var camProj = camera.projectionMatrix.clone();
    var camProjInv = camera.projectionMatrixInverse.clone();

    var prevRT = renderer.getRenderTarget();
    var prevView = renderer.getViewport(new THREE.Vector4());
    var prevScissor = renderer.getScissor(new THREE.Vector4());
    var prevScissorTest = renderer.getScissorTest();
    var prevAutoClear = renderer.autoClear;
    var prevClear = renderer.getClearColor(new THREE.Color());
    var prevAlpha = renderer.getClearAlpha();

    renderer.setRenderTarget(null);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W / pr, H / pr);
    renderer.setClearColor(0x000000, 1);
    renderer.autoClear = true;
    renderer.clear(true, true, true);

    var fovY = clamp(settings.fov / Math.max(0.2, settings.camZoom), 20, 120);
    var ipdM = (settings.ipd / 1000) * settings.depth;
    var conv = Math.max(0.2, settings.convergence);
    var useRT = monoView === 'center' ? imageNeedsRT() : needsRT();
    var near = camera.near, far = camera.far;
    var topN = near * Math.tan(fovY * Math.PI / 360);
    var shift = (ipdM / 2) * near / conv;

    var camQuatEff = camQuat.clone();
    if (Math.abs(settings.camPitch) > 1e-4) {
      var q = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0), settings.camPitch * Math.PI / 180);
      camQuatEff.multiply(q);
    }
    var rightV = new THREE.Vector3(1, 0, 0).applyQuaternion(camQuatEff);
    var upV = new THREE.Vector3(0, 1, 0).applyQuaternion(camQuatEff);
    var fwdV = new THREE.Vector3(0, 0, -1).applyQuaternion(camQuatEff);

    var basePos = camPos.clone();
    if (settings.camDist) basePos.addScaledVector(fwdV, -settings.camDist);
    if (settings.camShiftX) basePos.addScaledVector(rightV, settings.camShiftX);
    if (settings.camShiftY) basePos.addScaledVector(upV, settings.camShiftY);
    if (settings.camHeight) basePos.y += settings.camHeight;

    if (useRT && !quad) buildQuad();

    var views;
    if (monoView === 'sbs') {
      var stage = computeStage(W, H);
      var eyes = computeEyes(stage);
      views = [{ e: eyes[0], sign: -1 }, { e: eyes[1], sign: 1 }];
    } else if (monoView === 'left' || monoView === 'right') {
      views = [{ e: monoEyeRect(W, H, monoView), sign: monoView === 'left' ? -1 : 1 }];
    } else {
      views = [{ e: { x: 0, y: 0, w: W, h: H, aspect: W / H, side: 'center' }, sign: 0 }];
    }

    var drawn = [];
    for (var i = 0; i < views.length; i++) {
      var e = views[i].e, sign = views[i].sign;

      camera.position.copy(basePos).addScaledVector(rightV, sign * ipdM / 2);
      camera.quaternion.copy(camQuatEff);
      var rightN = topN * e.aspect;
      camera.projectionMatrix.makePerspective(
        -rightN - sign * shift, rightN - sign * shift,
        topN, -topN, near, far
      );
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      camera.updateMatrixWorld(true);

      var vx = e.x / pr, vy = e.y / pr, vw = e.w / pr, vh = e.h / pr;
      renderer.setScissorTest(true);
      renderer.setViewport(vx, vy, vw, vh);
      renderer.setScissor(vx, vy, vw, vh);

      if (useRT) {
        var target = ensureRT(i, e.w, e.h);
        renderer.setRenderTarget(target);
        renderer.setScissorTest(false);
        renderer.setClearColor(0x000000, 1);
        renderer.autoClear = true;
        origRender.call(renderer, scene, camera);

        renderer.setRenderTarget(null);
        renderer.setScissorTest(true);
        renderer.setViewport(vx, vy, vw, vh);
        renderer.setScissor(vx, vy, vw, vh);
        if (monoView === 'center') updateQuad(target.texture, e, 0, 0);
        else updateQuad(target.texture, e,
          monoView === 'sbs' ? (i === 0 ? settings.cropL : settings.cropR) :
            (monoView === 'left' ? settings.cropL : settings.cropR));
        origRender.call(renderer, quadScene, quadCam);
        stats.blits++;
        stats.rtFrames++;
        stats.postFrames++;
      } else {
        renderer.setRenderTarget(null);
        origRender.call(renderer, scene, camera);
      }

      stats.sceneDraws++;
      drawn.push({
        side: e.side,
        x: e.x, y: e.y, w: e.w, h: e.h, aspect: e.aspect,
        position: [camera.position.x, camera.position.y, camera.position.z],
        quaternion: [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w],
        projection: Array.prototype.slice.call(camera.projectionMatrix.elements)
      });
    }

    renderer.setRenderTarget(prevRT || null);
    renderer.setScissorTest(prevScissorTest);
    renderer.setViewport(prevView.x, prevView.y, prevView.z, prevView.w);
    renderer.setScissor(prevScissor.x, prevScissor.y, prevScissor.z, prevScissor.w);
    renderer.autoClear = prevAutoClear;
    renderer.setClearColor(prevClear, prevAlpha);
    camera.position.copy(camPos);
    camera.quaternion.copy(camQuat);
    camera.projectionMatrix.copy(camProj);
    camera.projectionMatrixInverse.copy(camProjInv);
    camera.updateMatrixWorld(true);

    stats.frames++;
    var ms = (window.performance || Date).now() - t0;
    stats.lastMs = ms;
    stats.avgMs = stats.avgMs ? stats.avgMs * 0.9 + ms * 0.1 : ms;
    last = {
      eyes: drawn,
      base: [camPos.x, camPos.y, camPos.z],
      stage: { x: 0, y: 0, w: W, h: H, aspect: W / H },
      path: useRT ? 'rt' : 'direct',
      test: useTest,
      mono: monoView
    };
    updateInfo();
    return undefined;
  }

  renderer.render = function (scene, camera) {
    if (arguments.length > 2) return origRender.apply(this, arguments);
    if (mono) return renderMono(scene, camera);
    if (!active) return origRender.apply(this, arguments);
    return renderStereo(scene, camera);
  };

  /* ---------------- interfaz ---------------- */
  function controlHTML(key) {
    var c = CTL[key];
    var id = idOf(key), out = id + '-o';
    return '<div class="vr-ctl" data-ctl="' + key + '">' +
      '<div class="vr-ctl-h"><span>' + c.label + '</span><output id="' + out + '">' + fmt(key, settings[key]) + '</output></div>' +
      '<div class="vr-ctl-r">' +
        '<button type="button" class="vr-step" data-dec="' + key + '" aria-label="Disminuir ' + c.label + '">−</button>' +
        '<input id="' + id + '" type="range" min="' + c.min + '" max="' + c.max + '" step="' + c.step + '" value="' + settings[key] + '">' +
        '<button type="button" class="vr-step" data-inc="' + key + '" aria-label="Aumentar ' + c.label + '">+</button>' +
      '</div>' +
      '<small class="vr-help">' + c.help + '</small>' +
    '</div>';
  }

  function resetBtn(group, label) {
    return '<button type="button" class="vr-reset" data-reset="' + group + '">Restaurar ' + label + '</button>';
  }

  function screenHTML() {
    return '<section class="vr-tab-panel" data-panel="screen">' +
      '<label class="vr-field">Perfil de pantalla<select id="vr-profile"></select></label>' +
      '<div class="vr-custom" id="vr-custom">' +
        '<label class="vr-field">Ancho (px)<input id="vr-cw" type="number" min="320" max="4096" step="10"></label>' +
        '<label class="vr-field">Alto (px)<input id="vr-ch" type="number" min="320" max="4096" step="10"></label>' +
      '</div>' +
      controlHTML('zoom') + controlHTML('gap') +
      controlHTML('stageX') + controlHTML('stageY') +
      controlHTML('aspect') + controlHTML('distortion') +
      '<label class="vr-field">HUD' +
        '<select id="vr-hud-mode">' +
          '<option value="per-eye">Por ojo (VR real)</option>' +
          '<option value="flat">Plano (una sola vez)</option>' +
          '<option value="off">Oculto</option>' +
        '</select></label>' +
      '<div class="vr-checks">' +
        '<label><input type="checkbox" id="vr-guides"> Guías (marco y zona segura)</label>' +
        '<label><input type="checkbox" id="vr-vig"> Viñeta de lentes</label>' +
      '</div>' +
      resetBtn('screen', 'Pantalla') +
    '</section>';
  }

  function profilesHTML() {
    return '<section class="vr-tab-panel" data-panel="profiles">' +
      '<div class="vr-card">' +
        '<p class="vr-preset">Perfil activo: <b id="vr-preset-now">Predeterminado</b></p>' +
        '<button type="button" id="vr-preset-default" class="vr-reset">Volver al predeterminado</button>' +
        '<p class="vr-help">Los perfiles guardan todos los valores de calibración en el teléfono. ' +
          'Podés tener uno por cada VR Box o por cada persona.</p>' +
      '</div>' +
      '<div class="vr-card">' +
        '<label class="vr-field">Nombre del perfil' +
          '<input id="vr-cfg-name" type="text" maxlength="24" placeholder="Ej.: VR Box de casa"></label>' +
        '<button type="button" id="vr-cfg-save" class="vr-primary">Guardar perfil</button>' +
        '<label class="vr-field">Perfiles guardados<select id="vr-cfg-list"></select></label>' +
        '<div class="vr-actions">' +
          '<button type="button" id="vr-cfg-load">Cargar</button>' +
          '<button type="button" id="vr-cfg-del">Borrar</button>' +
        '</div>' +
      '</div>' +
      '<div class="vr-card">' +
        '<p class="vr-help">Exportar copia el JSON al portapapeles (si el navegador lo permite) y también lo muestra abajo. ' +
          'Importar acepta ese mismo texto.</p>' +
        '<div class="vr-actions">' +
          '<button type="button" id="vr-cfg-export">Exportar</button>' +
          '<button type="button" id="vr-cfg-import">Importar</button>' +
        '</div>' +
        '<textarea id="vr-cfg-text" rows="4" spellcheck="false" placeholder="Pegá aquí el JSON de calibración..."></textarea>' +
        '<p class="vr-cfg-status" id="vr-cfg-status"></p>' +
      '</div>' +
      '<p class="vr-note">La calibración se guarda sola en <b>localStorage</b> (' + STORE_KEY + '). ' +
        'El head tracking todavía no está implementado: la orientación sigue viniendo del mando Bluetooth.</p>' +
    '</section>';
  }

  function buildUI() {
    var launch = document.createElement('button');
    launch.id = 'vr-launch';
    launch.type = 'button';
    launch.title = 'Abrir calibración VR (tecla V)';
    launch.innerHTML = '<span>VR</span> BOX';
    launch.setAttribute('aria-label', 'Abrir calibración VR');
    document.body.appendChild(launch);
    ui.launch = launch;

    var tabs = TABS.map(function (t, i) {
      return '<button type="button" data-tab="' + t[0] + '"' + (i === 0 ? ' class="on"' : '') + '>' + t[1] + '</button>';
    }).join('');

    var panel = document.createElement('div');
    panel.id = 'vr-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Calibración VR');
    panel.innerHTML =
      '<header><b>VR <span>CALIBRACIÓN</span></b><i id="vr-ver"></i>' +
        '<button id="vr-close" type="button" aria-label="Cerrar el panel">✕</button></header>' +
      '<div id="vr-lock-note" role="status">🔒 Calibración bloqueada desde la PC</div>' +
      '<div class="vr-quick">' +
        '<label class="vr-switch"><input type="checkbox" id="vr-test"><span>Modo prueba</span></label>' +
        '<button id="vr-exit" type="button" class="vr-danger">Salir (Esc)</button>' +
      '</div>' +
      '<nav class="vr-tabs" id="vr-tabs" aria-label="Categorías">' + tabs + '</nav>' +
      '<div class="vr-body">' +
        '<section class="vr-tab-panel on" data-panel="cam">' +
          GROUPS.cam.keys.map(controlHTML).join('') + resetBtn('cam', 'Cámara') +
        '</section>' +
        '<section class="vr-tab-panel" data-panel="stereo">' +
          GROUPS.stereo.keys.map(controlHTML).join('') + resetBtn('stereo', '3D') +
          '<p class="vr-note">La convergencia define dónde coinciden las dos imágenes. ' +
            'La intensidad 3D multiplica el efecto; 0 deja una vista plana.</p>' +
        '</section>' +
        '<section class="vr-tab-panel" data-panel="left">' +
          GROUPS.left.keys.map(controlHTML).join('') + resetBtn('left', 'lente izquierda') +
        '</section>' +
        '<section class="vr-tab-panel" data-panel="right">' +
          GROUPS.right.keys.map(controlHTML).join('') + resetBtn('right', 'lente derecha') +
        '</section>' +
        screenHTML() +
        '<section class="vr-tab-panel" data-panel="image">' +
          GROUPS.image.keys.map(controlHTML).join('') + resetBtn('image', 'Imagen') +
          '<p class="vr-note">Los ajustes de imagen activan el postproceso. Con todo en neutro ' +
            'el modo VR vuelve al camino directo, sin costo extra.</p>' +
        '</section>' +
        profilesHTML() +
      '</div>' +
      '<div class="vr-foot">' +
        '<button id="vr-toggle" class="vr-primary" type="button">Activar VR</button>' +
        '<div class="vr-actions">' +
          '<button id="vr-fs" type="button">Pantalla completa</button>' +
          '<button id="vr-hide" type="button">Ocultar panel (H)</button>' +
          '<button id="vr-reset-all" type="button" class="vr-danger">Restablecer todo</button>' +
        '</div>' +
        '<p class="vr-info" id="vr-info"></p>' +
        '<p class="vr-note">Estéreo real con frustums asimétricos. El HUD y los menús se dibujan ' +
          'una vez por ojo. El movimiento y la cámara siguen saliendo del mando Bluetooth: ' +
          'no hay seguimiento de cabeza en esta versión.</p>' +
      '</div>';
    document.body.appendChild(panel);
    ui.panel = panel;

    var guides = document.createElement('div');
    guides.id = 'vr-guides';
    guides.innerHTML = '<div id="vr-stage-guide"></div><div id="vr-safe"><span>SAFE AREA</span></div>';
    document.body.appendChild(guides);
    ui.guides = guides;
    ui.stageGuide = guides.querySelector('#vr-stage-guide');
    ui.safe = guides.querySelector('#vr-safe');

    var vl = document.createElement('div');
    vl.id = 'vr-vignette-l';
    vl.className = 'vr-vignette';
    var vr = document.createElement('div');
    vr.id = 'vr-vignette-r';
    vr.className = 'vr-vignette';
    document.body.appendChild(vl);
    document.body.appendChild(vr);
    ui.vigL = vl;
    ui.vigR = vr;

    /* Referencias del modo prueba: centro de cada lente y simetria. */
    var test = document.createElement('div');
    test.id = 'vr-test-overlay';
    test.innerHTML =
      '<div class="vr-test-eye" id="vr-test-eye-l"><i></i><b>IZQ</b></div>' +
      '<div class="vr-test-eye" id="vr-test-eye-r"><i></i><b>DER</b></div>' +
      '<div class="vr-test-sym" id="vr-test-sym"></div>';
    document.body.appendChild(test);
    ui.testOverlay = test;
    ui.testEyeL = test.querySelector('#vr-test-eye-l');
    ui.testEyeR = test.querySelector('#vr-test-eye-r');
    ui.testSym = test.querySelector('#vr-test-sym');

    /* Aviso de orientacion: dentro de las VR Box el telefono va horizontal. */
    var rot = document.createElement('div');
    rot.id = 'vr-rotate';
    rot.setAttribute('role', 'status');
    rot.innerHTML =
      '<div class="vr-rotate-card"><b>Girá el iPhone</b>' +
      '<p>Ponelo en horizontal para que las dos lentes vean su imagen completa.</p>' +
      '<button type="button" id="vr-rotate-ok">Continuar así</button></div>';
    document.body.appendChild(rot);
    ui.rotate = rot;
    rot.querySelector('#vr-rotate-ok').addEventListener('click', function (e) {
      e.preventDefault();
      rotateDismissed = true;
      rot.classList.remove('on');
    });

    var sel = panel.querySelector('#vr-profile');
    for (var key in PROFILES) {
      if (!has(PROFILES, key)) continue;
      var o = document.createElement('option');
      o.value = key;
      o.textContent = PROFILES[key].label;
      sel.appendChild(o);
    }

    ui.profile = sel;
    ui.custom = panel.querySelector('#vr-custom');
    ui.cw = panel.querySelector('#vr-cw');
    ui.ch = panel.querySelector('#vr-ch');
    ui.guidesChk = panel.querySelector('#vr-guides');
    ui.hudMode = panel.querySelector('#vr-hud-mode');
    ui.vigChk = panel.querySelector('#vr-vig');
    ui.toggle = panel.querySelector('#vr-toggle');
    ui.info = panel.querySelector('#vr-info');
    ui.ver = panel.querySelector('#vr-ver');
    ui.ver.textContent = VERSION;
    ui.testChk = panel.querySelector('#vr-test');
    ui.presetNow = panel.querySelector('#vr-preset-now');
    ui.cfgName = panel.querySelector('#vr-cfg-name');
    ui.cfgList = panel.querySelector('#vr-cfg-list');
    ui.cfgText = panel.querySelector('#vr-cfg-text');
    ui.cfgStatus = panel.querySelector('#vr-cfg-status');
    ui.tabs = panel.querySelector('#vr-tabs');

    /* Todos los sliders y sus botones de precision. */
    Object.keys(CTL).forEach(function (k) {
      var input = panel.querySelector('#' + idOf(k));
      if (input) {
        input.addEventListener('input', function () { set(k, Number(input.value)); });
      }
      var dec = panel.querySelector('[data-dec="' + k + '"]');
      var inc = panel.querySelector('[data-inc="' + k + '"]');
      if (dec) dec.addEventListener('click', function () { step(k, -1); });
      if (inc) inc.addEventListener('click', function () { step(k, 1); });
    });

    launch.addEventListener('click', function (e) {
      e.preventDefault();
      if (active) togglePanel();
      else enable();
    });

    panel.querySelector('#vr-close').addEventListener('click', function (e) {
      e.preventDefault();
      hidePanel();
    });
    panel.querySelector('#vr-hide').addEventListener('click', function (e) {
      e.preventDefault();
      hidePanel();
    });
    panel.querySelector('#vr-exit').addEventListener('click', function (e) {
      e.preventDefault();
      disable();
    });
    panel.querySelector('#vr-fs').addEventListener('click', function (e) {
      e.preventDefault();
      toggleFullscreen();
    });
    panel.querySelector('#vr-reset-all').addEventListener('click', function (e) {
      e.preventDefault();
      reset();
      setStatus('Se restauraron todos los valores.');
    });
    panel.querySelector('#vr-preset-default').addEventListener('click', function (e) {
      e.preventDefault();
      reset();
      setStatus('Perfil predeterminado restaurado.');
    });

    sel.addEventListener('change', function () { set('profile', sel.value); });
    ui.cw.addEventListener('input', function () { set('customW', ui.cw.value); });
    ui.ch.addEventListener('input', function () { set('customH', ui.ch.value); });
    ui.guidesChk.addEventListener('change', function () { set('guides', ui.guidesChk.checked); });
    ui.hudMode.addEventListener('change', function () { set('hudMode', ui.hudMode.value); });
    ui.vigChk.addEventListener('change', function () { set('vignette', ui.vigChk.checked); });
    ui.testChk.addEventListener('change', function () { set('testMode', ui.testChk.checked); });
    ui.toggle.addEventListener('click', function (e) {
      e.preventDefault();
      if (active) disable(); else enable();
    });

    /* Pestañas. */
    ui.tabs.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-tab]') : null;
      if (!b) return;
      e.preventDefault();
      showTab(b.getAttribute('data-tab'));
    });

    /* Restaurar por categoria. */
    panel.querySelectorAll('[data-reset]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        var g = b.getAttribute('data-reset');
        resetGroup(g);
        setStatus('Se restauró ' + (GROUPS[g] ? GROUPS[g].label : g) + '.');
      });
    });

    /* Perfiles guardados. */
    panel.querySelector('#vr-cfg-save').addEventListener('click', function (e) {
      e.preventDefault();
      var name = ui.cfgName.value;
      if (!saveConfig(name)) { setStatus('Escribí un nombre para guardar.', true); return; }
      ui.cfgName.value = '';
      syncConfigList(name.trim());
      setStatus('Perfil “' + name.trim() + '” guardado.');
    });
    panel.querySelector('#vr-cfg-load').addEventListener('click', function (e) {
      e.preventDefault();
      var name = ui.cfgList.value;
      if (!name) { setStatus('Elegí un perfil guardado.', true); return; }
      if (loadConfig(name)) setStatus('Perfil “' + name + '” cargado.');
      else setStatus('No se pudo cargar ese perfil.', true);
    });
    panel.querySelector('#vr-cfg-del').addEventListener('click', function (e) {
      e.preventDefault();
      var name = ui.cfgList.value;
      if (!name) { setStatus('Elegí un perfil guardado.', true); return; }
      deleteConfig(name);
      syncConfigList();
      setStatus('Perfil “' + name + '” borrado.');
    });
    panel.querySelector('#vr-cfg-export').addEventListener('click', function (e) {
      e.preventDefault();
      var text = exportConfig();
      ui.cfgText.value = text;
      var done = function () { setStatus('Configuración exportada.'); };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, done);
          return;
        }
      } catch (err) { /* sin portapapeles */ }
      done();
    });
    panel.querySelector('#vr-cfg-import').addEventListener('click', function (e) {
      e.preventDefault();
      if (importConfig(ui.cfgText.value)) setStatus('Configuración importada.');
      else setStatus('El texto no es una configuración válida.', true);
    });

    /* Los controles del panel no deben mover al personaje. */
    panel.addEventListener('keydown', function (e) { e.stopPropagation(); });
    panel.addEventListener('pointerdown', function (e) { e.stopPropagation(); });

    syncUI();
    syncConfigList();
    addPauseEntry();
  }

  function showTab(name) {
    if (!ui.panel) return;
    var tabs = ui.panel.querySelectorAll('[data-tab]');
    var panels = ui.panel.querySelectorAll('[data-panel]');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('on', tabs[i].getAttribute('data-tab') === name);
    for (var j = 0; j < panels.length; j++) panels[j].classList.toggle('on', panels[j].getAttribute('data-panel') === name);
    ui.panel.scrollTop = 0;
  }

  function setStatus(text, bad) {
    if (!ui.cfgStatus) return;
    ui.cfgStatus.textContent = text || '';
    ui.cfgStatus.classList.toggle('bad', !!bad);
  }

  function step(key, dir) {
    var c = CTL[key];
    if (!c) return;
    var v = Number(settings[key]) + dir * c.step;
    set(key, Math.round(v / c.step) * c.step);
  }

  function syncUI() {
    if (!ui.panel) return;
    Object.keys(CTL).forEach(function (k) {
      var input = ui.panel.querySelector('#' + idOf(k));
      var out = ui.panel.querySelector('#' + idOf(k) + '-o');
      if (input) input.value = settings[k];
      if (out) out.textContent = fmt(k, settings[k]);
    });
    ui.profile.value = settings.profile;
    ui.custom.style.display = settings.profile === 'custom' ? '' : 'none';
    ui.cw.value = settings.customW;
    ui.ch.value = settings.customH;
    ui.guidesChk.checked = settings.guides;
    ui.hudMode.value = settings.hudMode;
    ui.vigChk.checked = settings.vignette;
    ui.testChk.checked = settings.testMode;
    ui.toggle.textContent = active ? 'Salir de VR' : 'Activar VR';
    ui.toggle.classList.toggle('on', active);
    document.body.classList.toggle('vr-hud-off', active && settings.hudMode === 'off');
    document.body.classList.toggle('vr-hud-mirror', active && settings.hudMode === 'per-eye' && !settings.testMode);
    document.body.classList.toggle('vr-vignette', active && settings.vignette);
    document.body.classList.toggle('vr-test', active && settings.testMode);
    ui.guides.classList.toggle('on', active && (settings.guides || settings.testMode));
    updatePresetLabel();
    if (active) {
      updateInfo();
      requestAnimationFrame(layoutOverlays);
    }
  }

  function changedCount() {
    var n = 0, k;
    for (k in DEFAULTS) {
      if (!has(DEFAULTS, k)) continue;
      if (k === 'testMode' || k === 'guides' || k === 'vignette') continue;
      if (typeof DEFAULTS[k] === 'number') {
        if (Math.abs(settings[k] - DEFAULTS[k]) > 1e-9) n++;
      } else if (settings[k] !== DEFAULTS[k]) n++;
    }
    return n;
  }

  function updatePresetLabel() {
    if (!ui.presetNow) return;
    var n = changedCount();
    ui.presetNow.textContent = n ? 'Personalizado (' + n + ' cambio' + (n === 1 ? '' : 's') + ')' : 'Predeterminado';
  }

  function updateInfo() {
    if (!ui.info) return;
    var st = last.stage;
    var e = last.eyes[0];
    if (!st || !e) { ui.info.textContent = 'Preparando la vista estéreo…'; return; }
    ui.info.textContent =
      'Ojos: ' + Math.round(e.w) + '×' + Math.round(e.h) + ' px · ' +
      'etapa ' + Math.round(st.w) + '×' + Math.round(st.h) + ' · ' +
      'IPD ' + Math.round(settings.ipd) + ' mm · conv ' + settings.convergence.toFixed(1) + ' m · ' +
      'FOV ' + Math.round(settings.fov / Math.max(0.2, settings.camZoom)) + '° · ' +
      (settings.testMode ? 'modo prueba · ' : '') +
      (last.path === 'rt' ? 'postproceso activo' : 'paso directo');
  }

  function layoutOverlays() {
    if (!active) return;
    var canvas = renderer.domElement;
    var W = canvas.width, H = canvas.height;
    if (!W || !H) return;
    var pr = renderer.getPixelRatio() || 1;
    var stage = computeStage(W, H);
    var eyes = computeEyes(stage);
    var sx = stage.x / pr, sy = stage.y / pr, sw = stage.w / pr, sh = stage.h / pr;
    ui.stageGuide.style.left = sx + 'px';
    ui.stageGuide.style.top = sy + 'px';
    ui.stageGuide.style.width = sw + 'px';
    ui.stageGuide.style.height = sh + 'px';
    var ix = sw * 0.04, iy = sh * 0.055;
    ui.safe.style.left = (sx + ix) + 'px';
    ui.safe.style.top = (sy + iy) + 'px';
    ui.safe.style.width = Math.max(0, sw - ix * 2) + 'px';
    ui.safe.style.height = Math.max(0, sh - iy * 2) + 'px';
    var v = [ui.vigL, ui.vigR];
    for (var i = 0; i < 2; i++) {
      v[i].style.left = (eyes[i].x / pr) + 'px';
      v[i].style.top = (eyes[i].y / pr) + 'px';
      v[i].style.width = (eyes[i].w / pr) + 'px';
      v[i].style.height = (eyes[i].h / pr) + 'px';
    }

    /* Modo prueba: centro de cada lente y eje de simetria. */
    var tEyes = [ui.testEyeL, ui.testEyeR];
    for (var t = 0; t < 2; t++) {
      tEyes[t].style.left = (eyes[t].x / pr) + 'px';
      tEyes[t].style.top = (eyes[t].y / pr) + 'px';
      tEyes[t].style.width = (eyes[t].w / pr) + 'px';
      tEyes[t].style.height = (eyes[t].h / pr) + 'px';
    }
    ui.testSym.style.left = (stage.x + stage.w / 2) / pr + 'px';
    ui.testSym.style.top = sy + 'px';
    ui.testSym.style.height = sh + 'px';

    var perEye = settings.hudMode === 'per-eye' && !settings.testMode;
    var hud = document.getElementById('rg-hud');
    var pause = document.getElementById('ras-pause');
    var end = document.getElementById('rg-end');
    var act = document.getElementById('rg-act');
    syncMirror('hud', hud, perEye, stage, eyes, pr, 'eye');
    syncMirror('pause', pause, !!(pause && !pause.hidden), stage, eyes, pr, 'scaled');
    syncMirror('end', end, !!(end && end.classList.contains('on')), stage, eyes, pr, 'eye');
    /* JUGAR / RECOGER / ENTREGAR tambien se dibuja en cada ojo: si queda
       solo el original, aparece unicamente en el borde de un ojo. */
    syncMirror('act', act, !!(act && act.classList.contains('on')), stage, eyes, pr, 'eye');

    placeOverlays(sx, sy, sw, sh, W / pr, H / pr, !perEye && !settings.testMode);

    /* El boton VR se mueve dentro del ojo izquierdo cuando el modo esta
       activo: es la salida segura y debe verse entero en una lente. */
    if (ui.launch) {
      var lb = ui.launch.getBoundingClientRect();
      ui.launch.style.left = Math.max(0, (eyes[0].x + eyes[0].w / 2) / pr - lb.width / 2) + 'px';
      ui.launch.style.top = ((eyes[0].y + 10) / pr) + 'px';
      ui.launch.style.bottom = 'auto';
    }
    if (ui.panel) {
      ui.panel.style.maxWidth = Math.max(260, Math.min(380, sw - 24)) + 'px';
      ui.panel.style.maxHeight = Math.max(180, sh - 24) + 'px';
      ui.panel.style.top = (sy + 12) + 'px';
      ui.panel.style.right = ((W / pr) - (stage.x + stage.w) / pr + 12) + 'px';
    }
    updateRotate();
  }

  /* ---------------- copias por ojo (HUD y menus) ---------------- */

  /* Reenvia un toque hecho sobre una copia al boton real. Las copias existen
     solo para dibujar: el original sigue siendo el nodo que ejecuta el
     juego, asi que se reutiliza su .click(). */
  function forwardTap(e) {
    var t = e.target;
    var btn = t && t.closest ? t.closest('button, [data-act]') : null;
    if (!btn) return;
    var id = btn.id || '';
    var act = btn.getAttribute ? btn.getAttribute('data-act') : '';
    var orig = id ? document.getElementById(id) : null;
    if (!orig || orig === btn) {
      orig = act
        ? document.querySelector('#ras-pause [data-act="' + act + '"], body > [data-act="' + act + '"]')
        : null;
    }
    if (orig && orig !== btn) {
      e.preventDefault();
      e.stopPropagation();
      orig.click();
    }
  }

  function mirrorPair(kind) {
    if (mirrors[kind]) return mirrors[kind];
    var pair = {};
    for (var i = 0; i < 2; i++) {
      var side = i === 0 ? 'l' : 'r';
      var box = document.createElement('div');
      box.className = 'vr-mirror';
      box.id = 'vr-mirror-' + kind + '-' + side;
      box.setAttribute('data-kind', kind);
      box.setAttribute('aria-hidden', 'true');
      box.addEventListener('click', forwardTap);
      document.body.appendChild(box);
      pair[side] = box;
    }
    mirrors[kind] = pair;
    return pair;
  }

  function focusKey(el) {
    if (!el || !el.getAttribute) return '';
    return el.getAttribute('data-act') || el.id || '';
  }

  /* El clon no debe heredar la geometria inline que placeOverlays le puso al
     original en el modo plano: el contenedor del ojo ya define el marco. */
  function stripBoxStyle(el) {
    el.style.left = '';
    el.style.top = '';
    el.style.right = '';
    el.style.bottom = '';
    el.style.width = '';
    el.style.height = '';
    el.style.transform = '';
    el.style.removeProperty('--rg-dx');
    el.style.removeProperty('--rg-dy');
  }

  /* Copia un overlay real dentro de cada ojo. Se clona el nodo completo para
     que las reglas CSS del juego sigan valiendo. El contenedor tiene
     `transform`, y un transform convierte al contenedor en el bloque de
     referencia de los hijos position:fixed: cada copia ocupa exactamente su
     ojo. El original queda invisible pero sigue recibiendo el foco del mando
     y las llamadas .click().
     `mode`:
       'eye'    -> el marco de la copia es el rectangulo del ojo, a 1:1.
       'scaled' -> comportamiento anterior para el menu de pausa. */
  function syncMirror(kind, src, on, stage, eyes, pr, mode) {
    var show = !!(active && on && src);
    if (!show) {
      var old = mirrors[kind];
      if (old) {
        old.l.classList.remove('on');
        old.r.classList.remove('on');
        old.l.innerHTML = '';
        old.r.innerHTML = '';
      }
      mirrorSig[kind] = '';
      document.body.classList.remove('vr-mirror-' + kind);
      return false;
    }
    /* Se crea recien cuando el original existe: asi el original queda antes
       en el documento y document.getElementById sigue devolviendolo a el. */
    var pair = mirrorPair(kind);
    var sig = src.innerHTML + '|' + (src.textContent || '') + '|' + src.className + '|' +
      (src.hasAttribute('hidden') ? '1' : '0') + '|' +
      (src.classList.contains('on') ? '1' : '0');
    if (sig !== mirrorSig[kind]) {
      mirrorSig[kind] = sig;
      for (var i = 0; i < 2; i++) {
        var box = i === 0 ? pair.l : pair.r;
        box.innerHTML = '';
        var copy = src.cloneNode(true);
        stripBoxStyle(copy);
        box.appendChild(copy);
      }
    }
    /* Resaltar el mismo boton que tiene el foco en el original. */
    var key = focusKey(document.activeElement);
    for (var j = 0; j < 2; j++) {
      var b = j === 0 ? pair.l : pair.r;
      b.classList.add('on');
      var items = b.querySelectorAll('[data-act],[id]');
      for (var k = 0; k < items.length; k++) {
        items[k].classList.toggle('vr-focus', !!key && focusKey(items[k]) === key);
      }
    }
    var s = eyes[0].w / stage.w;
    for (var q = 0; q < 2; q++) {
      var box2 = q === 0 ? pair.l : pair.r;
      var e = eyes[q];
      box2.style.left = (e.x / pr) + 'px';
      box2.style.top = (e.y / pr) + 'px';
      if (mode === 'eye') {
        box2.style.width = (e.w / pr) + 'px';
        box2.style.height = (e.h / pr) + 'px';
        /* scale(1) (y no `none`) mantiene el bloque de referencia de los
           hijos position:fixed dentro del ojo. */
        box2.style.transform = 'scale(1)';
      } else {
        box2.style.width = (stage.w / pr) + 'px';
        box2.style.height = (stage.h / pr) + 'px';
        box2.style.transform = 'scale(' + s + ')';
      }
    }
    document.body.classList.add('vr-mirror-' + kind);
    return true;
  }

  function updateRotate() {
    if (!ui.rotate) return;
    var portrait = window.innerHeight > window.innerWidth;
    ui.rotate.classList.toggle('on', !!active && MOBILE && !rotateDismissed && portrait);
  }

  /* El menu de pausa es el unico menu persistente del lobby: ahi se agrega
     la entrada a VR. Se mantiene una sola vez, sin duplicar botones. */
  function addPauseEntry() {
    var pause = document.getElementById('ras-pause');
    if (!pause) return false;
    var card = pause.querySelector('.ras-card');
    if (!card || card.querySelector('[data-act="vr"]')) return false;
    var b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('data-act', 'vr');
    b.textContent = 'VR BOX';
    b.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      enable();
    });
    var help = card.querySelector('.ras-help');
    card.insertBefore(b, help || null);
    return true;
  }

  /* El HUD y los controles táctiles son capas DOM de la "pantalla plana" del
     iPhone. Para que el perfil de pantalla se vea como el teléfono dentro de
     las VR Box, se recortan al marco simulado: el HUD toma el tamaño del
     marco (sus hijos están anclados con position:absolute) y los botones
     flotantes se desplazan con transform sin cambiar su tamaño. */
  var overlayEls = null;

  function placeOverlays(sx, sy, sw, sh, vw, vh, withHud) {
    /* El HUD lo crea game.js al arrancar: con ?vr=1 el modo puede activarse
       antes. Se vuelve a buscar mientras falte alguno. */
    if (!overlayEls || !overlayEls.hud || !overlayEls.act || !overlayEls.stick) {
      overlayEls = {
        hud: document.getElementById('rg-hud'),
        act: document.getElementById('rg-act'),
        stick: document.getElementById('ras-stick')
      };
    }
    var hud = overlayEls.hud;
    if (hud && withHud) {
      hud.style.left = sx + 'px';
      hud.style.top = sy + 'px';
      hud.style.width = sw + 'px';
      hud.style.height = sh + 'px';
      hud.style.right = 'auto';
      hud.style.bottom = 'auto';
    }
    /* JUGAR ahora esta centrado: se desplaza el centro del marco, no la
       esquina derecha. Se usan variables CSS para no pisar el centrado ni
       el estado :active del boton. */
    var dx = sx + sw / 2 - vw / 2;
    var dy = sy + sh - vh;
    if (overlayEls.act) {
      overlayEls.act.style.setProperty('--rg-dx', dx + 'px');
      overlayEls.act.style.setProperty('--rg-dy', dy + 'px');
    }
    if (overlayEls.stick) {
      overlayEls.stick.style.transform = 'translate(' + sx + 'px,' + dy + 'px)';
    }
  }

  function restoreOverlays() {
    if (overlayEls) {
      var hud = overlayEls.hud;
      if (hud) {
        hud.style.left = '';
        hud.style.top = '';
        hud.style.width = '';
        hud.style.height = '';
        hud.style.right = '';
        hud.style.bottom = '';
      }
      if (overlayEls.act) {
        overlayEls.act.style.removeProperty('--rg-dx');
        overlayEls.act.style.removeProperty('--rg-dy');
      }
      if (overlayEls.stick) overlayEls.stick.style.transform = '';
    }
    ['hud', 'pause', 'end', 'act'].forEach(function (kind) {
      var pair = mirrors[kind];
      if (pair) {
        pair.l.classList.remove('on');
        pair.r.classList.remove('on');
        pair.l.innerHTML = '';
        pair.r.innerHTML = '';
      }
      mirrorSig[kind] = '';
      document.body.classList.remove('vr-mirror-' + kind);
    });
    if (ui.launch) {
      ui.launch.style.left = '';
      ui.launch.style.top = '';
      ui.launch.style.bottom = '';
    }
    if (ui.panel) {
      ui.panel.style.maxWidth = '';
      ui.panel.style.maxHeight = '';
      ui.panel.style.top = '';
      ui.panel.style.right = '';
    }
    if (ui.rotate) ui.rotate.classList.remove('on');
  }

  /* ---------------- activar / desactivar ---------------- */
  function enable() {
    if (mono) disableMono();
    if (active) { showPanel(); return true; }
    active = true;
    document.body.classList.add('vr-on');
    addPauseEntry();
    showPanel();
    syncUI();
    /* El HUD puede aparecer despues del primer frame: un intervalo corto
       mantiene copias y geometria al dia sin costo apreciable. */
    if (layoutTimer) clearInterval(layoutTimer);
    layoutTimer = setInterval(layoutOverlays, 250);
    requestAnimationFrame(layoutOverlays);
    return true;
  }

  function disable() {
    if (!active) return false;
    active = false;
    if (layoutTimer) { clearInterval(layoutTimer); layoutTimer = 0; }
    document.body.classList.remove('vr-on');
    document.body.classList.remove('vr-hud-off');
    document.body.classList.remove('vr-hud-mirror');
    document.body.classList.remove('vr-vignette');
    document.body.classList.remove('vr-test');
    ui.panel.classList.remove('on');
    ui.guides.classList.remove('on');
    if (ui.launch) ui.launch.classList.remove('on');
    restoreOverlays();
    syncUI();
    /* Dejar el renderer como estaba (el paso directo vuelve a dibujar una
       sola vista). */
    var canvas = renderer.domElement;
    var pr = renderer.getPixelRatio() || 1;
    renderer.setRenderTarget(null);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, canvas.width / pr, canvas.height / pr);
    renderer.setScissor(0, 0, canvas.width / pr, canvas.height / pr);
    renderer.autoClear = true;
    return true;
  }

  function toggle() { return active ? disable() : enable(); }

  /* ---------------- vista central (calibrador de Windows) ---------------- */
  function restoreViewport() {
    var canvas = renderer.domElement;
    var pr = renderer.getPixelRatio() || 1;
    renderer.setRenderTarget(null);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, canvas.width / pr, canvas.height / pr);
    renderer.setScissor(0, 0, canvas.width / pr, canvas.height / pr);
    renderer.autoClear = true;
  }

  function setMonoView(view) {
    if (MONO_VIEWS.indexOf(view) < 0) return false;
    monoView = view;
    return true;
  }

  function enableMono(view) {
    if (view !== undefined && !setMonoView(view)) return false;
    if (active) disable();
    mono = true;
    document.body.classList.add('vr-mono');
    return true;
  }

  function disableMono() {
    if (!mono) return false;
    mono = false;
    document.body.classList.remove('vr-mono');
    restoreViewport();
    return true;
  }

  function setLocked(v) {
    locked = !!v;
    document.body.classList.toggle('vr-locked', locked);
    return locked;
  }

  function canWrite() { return !locked; }

  function onChange(fn) {
    if (typeof fn !== 'function') return false;
    changeListeners.push(fn);
    return function () {
      var i = changeListeners.indexOf(fn);
      if (i >= 0) changeListeners.splice(i, 1);
    };
  }

  function notifyChange(origin, keys) {
    if (!changeListeners.length) return;
    var ev = {
      origin: origin || 'ui',
      keys: keys ? keys.slice() : null,
      settings: JSON.parse(JSON.stringify(settings))
    };
    for (var i = 0; i < changeListeners.length; i++) {
      try { changeListeners[i](ev); } catch (e) { /* un listener roto no frena el juego */ }
    }
  }

  /* Aplica un bloque de valores ya validados por el servidor. No vuelve a
     notificar como cambio local: evita el eco Windows -> iPhone -> Windows. */
  function applyCal(values, origin) {
    if (!values || typeof values !== 'object') return false;
    var keys = [], k;
    for (k in values) {
      if (!has(DEFAULTS, k)) continue;
      var v = values[k];
      if (has(SPEC, k)) {
        if (typeof v !== 'number' || !isFinite(v)) continue;
        settings[k] = clamp(v, SPEC[k][0], SPEC[k][1]);
        keys.push(k);
      } else if (k === 'profile') {
        if (!has(PROFILES, v)) continue;
        settings.profile = v;
        keys.push(k);
      } else if (k === 'hudMode') {
        if (v !== 'per-eye' && v !== 'flat' && v !== 'off') continue;
        settings.hudMode = v;
        keys.push(k);
      } else if (k === 'customW' || k === 'customH') {
        if (typeof v !== 'number' || !isFinite(v)) continue;
        settings[k] = Math.round(clamp(v, 320, 4096));
        keys.push(k);
      } else if (k === 'guides' || k === 'vignette' || k === 'testMode') {
        if (typeof v !== 'boolean') continue;
        settings[k] = v;
        keys.push(k);
      }
    }
    if (!keys.length) return false;
    settings = sanitize(settings);
    save();
    syncUI();
    notifyChange(origin || 'remote', keys);
    return true;
  }

  function spec() {
    return JSON.parse(JSON.stringify({
      version: VERSION,
      defaults: DEFAULTS,
      spec: SPEC,
      controls: CTL,
      groups: GROUPS,
      tabs: TABS,
      profiles: PROFILES
    }));
  }

  function showPanel() {
    if (!ui.panel) return;
    ui.panel.classList.add('on');
    if (ui.launch) ui.launch.classList.add('on');
    syncUI();
    syncConfigList();
  }

  function hidePanel() {
    if (!ui.panel) return;
    ui.panel.classList.remove('on');
  }

  function togglePanel() {
    if (!ui.panel) return;
    if (ui.panel.classList.contains('on')) hidePanel();
    else showPanel();
  }

  function set(key, value) {
    /* Compatibilidad con la API v1 (hud booleano). */
    if (key === 'hud') {
      key = 'hudMode';
      value = value === false ? 'off' : 'flat';
    }
    if (!has(DEFAULTS, key)) return false;
    if (!canWrite()) return false;
    if (key === 'testMode' || key === 'guides' || key === 'vignette') value = !!value;
    settings[key] = value;
    settings = sanitize(settings);
    save();
    syncUI();
    notifyChange('ui', [key]);
    return true;
  }

  function profile(name) { return set('profile', name); }

  function reset() {
    if (!canWrite()) return false;
    settings = sanitize({});
    save();
    syncUI();
    notifyChange('ui', null);
    return true;
  }

  function resetGroup(name) {
    if (!canWrite()) return false;
    var g = GROUPS[name];
    if (!g || !g.keys.length) return false;
    for (var i = 0; i < g.keys.length; i++) {
      var k = g.keys[i];
      if (has(DEFAULTS, k)) settings[k] = DEFAULTS[k];
    }
    settings = sanitize(settings);
    save();
    syncUI();
    notifyChange('ui', g.keys);
    return true;
  }

  /* ---------------- perfiles de calibracion ---------------- */
  function readConfigs() {
    var o = readStore(CFG_KEY);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  }

  function writeConfigs(o) {
    try {
      if (window.localStorage) localStorage.setItem(CFG_KEY, JSON.stringify(o));
    } catch (e) { /* sin persistencia */ }
  }

  function listConfigs() {
    var o = readConfigs();
    return Object.keys(o).sort(function (a, b) { return a.localeCompare(b); });
  }

  function syncConfigList(selectName) {
    if (!ui.cfgList) return;
    var names = listConfigs();
    var cur = selectName !== undefined ? selectName : ui.cfgList.value;
    ui.cfgList.innerHTML = '';
    var o = document.createElement('option');
    o.value = '';
    o.textContent = names.length ? '— Elegí un perfil —' : '— No hay perfiles guardados —';
    ui.cfgList.appendChild(o);
    names.forEach(function (n) {
      var opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      ui.cfgList.appendChild(opt);
    });
    if (cur && names.indexOf(cur) >= 0) ui.cfgList.value = cur;
  }

  function saveConfig(name) {
    name = String(name || '').trim().slice(0, 24);
    if (!name) return false;
    var o = readConfigs();
    o[name] = JSON.parse(JSON.stringify(settings));
    writeConfigs(o);
    syncConfigList(name);
    return true;
  }

  function loadConfig(name) {
    if (!canWrite()) return false;
    var o = readConfigs();
    if (!name || !o[name]) return false;
    settings = sanitize(o[name]);
    save();
    syncUI();
    notifyChange('ui', null);
    return true;
  }

  function deleteConfig(name) {
    var o = readConfigs();
    if (!name || !has(o, name)) return false;
    delete o[name];
    writeConfigs(o);
    syncConfigList();
    return true;
  }

  function exportConfig() {
    return JSON.stringify({
      app: 'RASMATIC Lugar 3D',
      kind: 'vr-calibration',
      version: VERSION,
      saved: new Date().toISOString(),
      settings: settings
    }, null, 2);
  }

  function importConfig(text) {
    if (!canWrite()) return false;
    try {
      var d = JSON.parse(String(text || ''));
      var src = d && d.settings ? d.settings : d;
      if (!src || typeof src !== 'object') return false;
      settings = sanitize(src);
      save();
      syncUI();
      notifyChange('ui', null);
      return true;
    } catch (e) {
      return false;
    }
  }

  function toggleFullscreen() {
    var p;
    try {
      if (document.fullscreenElement) p = document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) p = document.documentElement.requestFullscreen();
      else return Promise.resolve(false);
      if (p && p.catch) p = p.catch(function () { return false; });
      return p;
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  /* ---------------- controles de Windows ---------------- */
  function isFormTarget(t) {
    return !!(t && t.closest && t.closest('input,select,textarea,button,option'));
  }

  window.addEventListener('keydown', function (e) {
    if (EMBED || e.defaultPrevented) return;
    var key = e.key;
    if (key === 'Escape' && active) {
      e.preventDefault();
      e.stopPropagation();
      disable();
      return;
    }
    if (key === 'v' || key === 'V') {
      if (isFormTarget(e.target)) return;
      e.preventDefault();
      toggle();
      return;
    }
    if (!active) return;
    if (key === 'h' || key === 'H') {
      if (isFormTarget(e.target)) return;
      e.preventDefault();
      togglePanel();
      return;
    }
    if ((key === 't' || key === 'T') && !isFormTarget(e.target)) {
      e.preventDefault();
      set('testMode', !settings.testMode);
      return;
    }
    if (key === ' ' || key === 'Spacebar') {
      if (isFormTarget(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      if (window.RasmaticGame && typeof window.RasmaticGame.interact === 'function') {
        window.RasmaticGame.interact();
      }
    }
  }, true);

  window.addEventListener('resize', function () {
    requestAnimationFrame(layoutOverlays);
    updateRotate();
  });

  /* ---------------- API publica ---------------- */
  window.RasmaticVR = {
    version: VERSION,
    enable: enable,
    disable: disable,
    toggle: toggle,
    isActive: function () { return active; },
    isDesktop: function () { return DESKTOP; },
    isMobile: function () { return MOBILE; },
    /* Vista central / diagnostico para el calibrador de Windows. */
    enableMono: enableMono,
    disableMono: disableMono,
    isMono: function () { return mono; },
    setView: setMonoView,
    view: function () { return monoView; },
    spec: spec,
    applyCal: applyCal,
    setMany: applyCal,
    setLocked: setLocked,
    isLocked: function () { return locked; },
    onChange: onChange,
    profile: profile,
    set: set,
    reset: reset,
    resetGroup: resetGroup,
    saveConfig: saveConfig,
    loadConfig: loadConfig,
    deleteConfig: deleteConfig,
    listConfigs: listConfigs,
    exportConfig: exportConfig,
    importConfig: importConfig,
    toggleFullscreen: toggleFullscreen,
    panel: function (open) {
      if (open === undefined) return togglePanel();
      if (open) showPanel(); else hidePanel();
      return true;
    },
    state: function () {
      var canvas = renderer.domElement;
      var pr = renderer.getPixelRatio() || 1;
      return {
        version: VERSION,
        active: active,
        mono: mono,
        monoView: monoView,
        locked: locked,
        desktop: DESKTOP,
        mobile: MOBILE,
        forced: FORCE,
        settings: JSON.parse(JSON.stringify(settings)),
        preset: changedCount() ? 'custom' : 'default',
        changes: changedCount(),
        configs: listConfigs(),
        canvas: { width: canvas.width, height: canvas.height, cssW: canvas.width / pr, cssH: canvas.height / pr, pixelRatio: pr },
        stage: last.stage,
        eyes: last.eyes,
        base: last.base,
        path: last.path,
        test: last.test,
        stats: JSON.parse(JSON.stringify(stats)),
        panelOpen: !!(ui.panel && ui.panel.classList.contains('on')),
        hud: settings.hudMode !== 'off',
        hudMode: settings.hudMode,
        mirrors: {
          hud: !!(mirrors.hud && mirrors.hud.l.classList.contains('on')),
          pause: !!(mirrors.pause && mirrors.pause.l.classList.contains('on')),
          end: !!(mirrors.end && mirrors.end.l.classList.contains('on')),
          act: !!(mirrors.act && mirrors.act.l.classList.contains('on'))
        },
        landscape: window.innerWidth >= window.innerHeight,
        rotateWarning: !!(ui.rotate && ui.rotate.classList.contains('on')),
        fullscreen: !!document.fullscreenElement
      };
    },
    snapshot: function () {
      try { return renderer.domElement.toDataURL('image/png'); } catch (e) { return null; }
    }
  };

  /* ---------------- arranque ---------------- */
  if (EMBED) document.body.classList.add('ras-embed');
  buildUI();
  if (FORCE) enable();
})();
