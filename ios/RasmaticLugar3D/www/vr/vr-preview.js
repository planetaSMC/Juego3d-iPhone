/* ============================================================
   RASMATIC · VR BOX  (Windows y app iOS)
   ------------------------------------------------------------
   Previsualizacion estereoscopica y modo VR real para colocar el
   telefono dentro de unas VR Box.

   Reglas de diseno:
     - NO modifica el juego ni el mapeo de controles.
     - Intercepta renderer.render y, cuando esta apagado, lo llama
       exactamente igual que antes (paso directo).
     - Estereo real: dos frustums asimetricos off-axis (sin toe-in),
       reutilizando la camara del juego (conserva la mano y el HUD).
     - El HUD y los menus se dibujan por ojo (dos copias), para que
       cada lente vea la interfaz completa y no una mitad cortada.

   Superficie publica (para pruebas y consola):
     RasmaticVR.enable() / disable() / toggle()
     RasmaticVR.set(clave, valor) / profile(nombre) / reset()
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

  var VERSION = 'vr-preview-1.1';
  var STORE_KEY = 'rasmatic.vr.settings.v2';
  var LEGACY_KEY = 'rasmatic.vr.settings.v1';
  var FORCE = /[?&]vr=1\b/.test(location.search);
  /* Movil = iPhone/iPad/Android o cualquier pantalla tactil. En la app iOS
     el modo VR debe estar disponible; antes solo se mostraba en escritorio. */
  var MOBILE = navigator.maxTouchPoints > 0 ||
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '') ||
    window.matchMedia('(pointer:coarse)').matches;
  var DESKTOP = !MOBILE;

  var DEFAULTS = {
    ipd: 64,            /* milimetros entre centros de ojos */
    convergence: 3.0,   /* metros: plano de disparidad cero */
    fov: 62,            /* grados verticales (el juego usa 62 en la partida) */
    zoom: 1.0,          /* 0.5..1: tamano de cada imagen dentro de su mitad */
    gap: 0.0,           /* 0..0.1: separacion central extra (fraccion del semiancho) */
    distortion: 0.0,    /* 0..0.3: aproximacion de lente VR Box */
    profile: 'window',
    customW: 1920,
    customH: 1080,
    guides: false,
    /* per-eye: una copia del HUD dentro de cada ojo (VR real).
       flat: una sola copia recortada al marco (vista previa de escritorio).
       off: sin HUD. */
    hudMode: 'per-eye',
    vignette: false
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
    var s = {};
    for (var k in DEFAULTS) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) s[k] = DEFAULTS[k];
    var saved = readStore(STORE_KEY);
    var legacy = saved ? null : readStore(LEGACY_KEY);
    if (saved) {
      for (var q in DEFAULTS) {
        if (Object.prototype.hasOwnProperty.call(saved, q) && typeof saved[q] === typeof DEFAULTS[q]) {
          s[q] = saved[q];
        }
      }
    } else if (legacy) {
      /* v1 guardaba `hud` como booleano. Se conserva la eleccion del usuario. */
      for (var r in DEFAULTS) {
        if (r === 'hudMode') continue;
        if (Object.prototype.hasOwnProperty.call(legacy, r) && typeof legacy[r] === typeof DEFAULTS[r]) {
          s[r] = legacy[r];
        }
      }
      if (legacy.hud === false) s.hudMode = 'off';
      else if (legacy.hud === true) s.hudMode = 'flat';
    }
    return sanitize(s);
  }

  function sanitize(s) {
    s.ipd = clamp(Number(s.ipd) || DEFAULTS.ipd, 50, 75);
    s.convergence = clamp(Number(s.convergence) || DEFAULTS.convergence, 0.5, 10);
    s.fov = clamp(Number(s.fov) || DEFAULTS.fov, 40, 100);
    s.zoom = clamp(Number(s.zoom) || DEFAULTS.zoom, 0.5, 1);
    s.gap = clamp(Number(s.gap) || 0, 0, 0.1);
    s.distortion = clamp(Number(s.distortion) || 0, 0, 0.3);
    if (!PROFILES[s.profile]) s.profile = DEFAULTS.profile;
    s.customW = Math.round(clamp(Number(s.customW) || DEFAULTS.customW, 320, 4096));
    s.customH = Math.round(clamp(Number(s.customH) || DEFAULTS.customH, 320, 4096));
    s.guides = !!s.guides;
    s.hudMode = (s.hudMode === 'per-eye' || s.hudMode === 'flat' || s.hudMode === 'off')
      ? s.hudMode : DEFAULTS.hudMode;
    s.vignette = !!s.vignette;
    return s;
  }

  var settings = loadSettings();
  var active = false;
  var ui = {};
  var stats = { frames: 0, sceneDraws: 0, blits: 0, rtFrames: 0, lastMs: 0, avgMs: 0 };
  var last = { eyes: [], base: null, stage: null, path: 'direct' };
  var rt = null;
  var quad = null;
  var quadMat = null;
  var quadCam = null;
  var quadScene = null;
  var quadBase = null;
  var quadUV = null;
  var quadAspect = 0;
  var quadK = -1;

  /* Copias por ojo del HUD y de los menus. Se crean recien cuando el juego
     ya construyo el original, para que document.getElementById siga
     devolviendo el nodo real (el primero del documento). */
  var mirrors = { hud: null, pause: null, end: null };
  var mirrorSig = { hud: '', pause: '', end: '' };
  var layoutTimer = 0;
  var rotateDismissed = false;

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
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
    return {
      x: Math.floor((W - sw) / 2),
      y: Math.floor((H - sh) / 2),
      w: sw,
      h: sh,
      aspect: sw / sh
    };
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
      { side: 'left', x: lx, y: ey, w: ew, h: eh, aspect: ew / eh },
      { side: 'right', x: rx, y: ey, w: ew, h: eh, aspect: ew / eh }
    ];
  }

  /* ---------------- render estereo ---------------- */
  var origRender = renderer.render;

  function ensureRT(w, h) {
    if (rt && rt.width === w && rt.height === h) return;
    if (rt) rt.dispose();
    rt = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false
    });
    rt.texture.wrapS = THREE.ClampToEdgeWrapping;
    rt.texture.wrapT = THREE.ClampToEdgeWrapping;
    rt.texture.generateMipmaps = false;
    if (quadMat) {
      quadMat.map = rt.texture;
      quadMat.needsUpdate = true;
    }
  }

  function buildQuad() {
    quadBase = new THREE.PlaneGeometry(2, 2, 48, 48);
    quadUV = quadBase.attributes.uv;
    quadMat = new THREE.MeshBasicMaterial({
      map: null, depthTest: false, depthWrite: false
    });
    quad = new THREE.Mesh(quadBase, quadMat);
    quad.frustumCulled = false;
    quad.position.z = -1;
    quadScene = new THREE.Scene();
    quadScene.add(quad);
    quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  }

  /* UVs con distorsion radial: el centro queda igual y los bordes se
     estiran hacia afuera (aproximacion de la lente de las VR Box). */
  function updateQuad(aspect, k) {
    if (!quadUV) return;
    if (Math.abs(aspect - quadAspect) < 1e-6 && Math.abs(k - quadK) < 1e-6) return;
    quadAspect = aspect;
    quadK = k;
    for (var i = 0; i < quadBase.attributes.position.count; i++) {
      var px = quadBase.attributes.position.getX(i);
      var py = quadBase.attributes.position.getY(i);
      var nx = px * aspect;
      var r2 = nx * nx + py * py;
      var s = 1 + k * r2;
      quadUV.setXY(i, 0.5 + px * 0.5 * s, 0.5 + py * 0.5 * s);
    }
    quadUV.needsUpdate = true;
  }

  function renderStereo(scene, camera) {
    var t0 = (window.performance || Date).now();
    var canvas = renderer.domElement;
    var W = canvas.width, H = canvas.height;
    if (!W || !H) return origRender.call(renderer, scene, camera);
    var pr = renderer.getPixelRatio() || 1;

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

    var fovY = settings.fov;
    var ipd = settings.ipd / 1000;
    var conv = Math.max(0.2, settings.convergence);
    var right = new THREE.Vector3(1, 0, 0).applyQuaternion(camQuat);
    var useRT = settings.distortion > 0.001;
    var near = camera.near, far = camera.far;
    var topN = near * Math.tan(fovY * Math.PI / 360);
    var shift = (ipd / 2) * near / conv;
    var drawn = [];

    if (useRT && !quad) buildQuad();

    for (var i = 0; i < 2; i++) {
      var e = eyes[i];
      var sign = i === 0 ? -1 : 1;

      /* Ojo desplazado sobre el eje derecho de la camara, sin girarla
         (off-axis): las dos vistas miran en la misma direccion. */
      camera.position.copy(camPos).addScaledVector(right, sign * ipd / 2);
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
        ensureRT(e.w, e.h);
        renderer.setRenderTarget(rt);
        renderer.setScissorTest(false);
        renderer.setClearColor(0x000000, 1);
        renderer.autoClear = true;
        origRender.call(renderer, scene, camera);

        renderer.setRenderTarget(null);
        renderer.setScissorTest(true);
        renderer.setViewport(vx, vy, vw, vh);
        renderer.setScissor(vx, vy, vw, vh);
        updateQuad(e.aspect, settings.distortion);
        origRender.call(renderer, quadScene, quadCam);
        stats.blits++;
        stats.rtFrames++;
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
      path: useRT ? 'rt' : 'direct'
    };

    /* Barato (una linea de texto) y evita que el panel se quede en
       "Preparando..." cuando la escena renderiza pocos frames por segundo. */
    updateInfo();
    return undefined;
  }

  renderer.render = function (scene, camera) {
    if (!active || arguments.length > 2) return origRender.apply(this, arguments);
    return renderStereo(scene, camera);
  };

  /* ---------------- interfaz ---------------- */
  function buildUI() {
    var launch = document.createElement('button');
    launch.id = 'vr-launch';
    launch.type = 'button';
    launch.title = 'Abrir VR BOX PREVIEW (tecla V)';
    launch.innerHTML = '<span>VR</span> BOX';
    launch.setAttribute('aria-label', 'Abrir VR BOX PREVIEW');
    document.body.appendChild(launch);
    ui.launch = launch;

    var panel = document.createElement('div');
    panel.id = 'vr-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'VR BOX PREVIEW');
    panel.innerHTML =
      '<header><b>VR BOX <span>PREVIEW</span></b><i id="vr-ver"></i>' +
        '<button id="vr-close" type="button" aria-label="Cerrar el panel">✕</button></header>' +
      '<div class="vr-body">' +
        '<label class="vr-field">Perfil de pantalla' +
          '<select id="vr-profile"></select></label>' +
        '<div class="vr-custom" id="vr-custom">' +
          '<label class="vr-field">Ancho (px)<input id="vr-cw" type="number" min="320" max="4096" step="10"></label>' +
          '<label class="vr-field">Alto (px)<input id="vr-ch" type="number" min="320" max="4096" step="10"></label>' +
        '</div>' +
        '<label class="vr-field">IPD <output id="vr-ipd-o"></output>' +
          '<input id="vr-ipd" type="range" min="50" max="75" step="1"></label>' +
        '<label class="vr-field">Convergencia <output id="vr-conv-o"></output>' +
          '<input id="vr-conv" type="range" min="0.5" max="10" step="0.1"></label>' +
        '<label class="vr-field">Campo de visión <output id="vr-fov-o"></output>' +
          '<input id="vr-fov" type="range" min="40" max="100" step="1"></label>' +
        '<label class="vr-field">Tamaño de imagen <output id="vr-zoom-o"></output>' +
          '<input id="vr-zoom" type="range" min="0.5" max="1" step="0.01"></label>' +
        '<label class="vr-field">Separación central <output id="vr-gap-o"></output>' +
          '<input id="vr-gap" type="range" min="0" max="0.1" step="0.005"></label>' +
        '<label class="vr-field">Distorsión de lente <output id="vr-dist-o"></output>' +
          '<input id="vr-dist" type="range" min="0" max="0.3" step="0.01"></label>' +
        '<label class="vr-field">HUD' +
          '<select id="vr-hud-mode">' +
            '<option value="per-eye">Por ojo (VR real)</option>' +
            '<option value="flat">Plano (una sola vez)</option>' +
            '<option value="off">Oculto</option>' +
          '</select></label>' +
        '<div class="vr-checks">' +
          '<label><input type="checkbox" id="vr-guides"> Guías (marco y safe area)</label>' +
          '<label><input type="checkbox" id="vr-vig"> Viñeta de lentes</label>' +
        '</div>' +
        '<button id="vr-toggle" class="vr-primary" type="button">Activar VR</button>' +
        '<div class="vr-actions">' +
          '<button id="vr-fs" type="button">Pantalla completa</button>' +
          '<button id="vr-hide" type="button">Ocultar panel (H)</button>' +
          '<button id="vr-exit" type="button">Salir (Esc)</button>' +
        '</div>' +
        '<p class="vr-info" id="vr-info"></p>' +
        '<p class="vr-note">Estéreo real: dos frustums asimétricos (off-axis) sobre la cámara del juego. ' +
          'El HUD y los menús se dibujan una vez por ojo: cada lente ve la interfaz completa. ' +
          'Con mando conectado se ocultan los controles táctiles; si se desconecta, vuelven.</p>' +
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
      if (!Object.prototype.hasOwnProperty.call(PROFILES, key)) continue;
      var o = document.createElement('option');
      o.value = key;
      o.textContent = PROFILES[key].label;
      sel.appendChild(o);
    }

    ui.profile = sel;
    ui.custom = panel.querySelector('#vr-custom');
    ui.cw = panel.querySelector('#vr-cw');
    ui.ch = panel.querySelector('#vr-ch');
    ui.ipd = panel.querySelector('#vr-ipd');
    ui.conv = panel.querySelector('#vr-conv');
    ui.fov = panel.querySelector('#vr-fov');
    ui.zoom = panel.querySelector('#vr-zoom');
    ui.gap = panel.querySelector('#vr-gap');
    ui.dist = panel.querySelector('#vr-dist');
    ui.guidesChk = panel.querySelector('#vr-guides');
    ui.hudMode = panel.querySelector('#vr-hud-mode');
    ui.vigChk = panel.querySelector('#vr-vig');
    ui.toggle = panel.querySelector('#vr-toggle');
    ui.info = panel.querySelector('#vr-info');
    ui.ver = panel.querySelector('#vr-ver');
    ui.ver.textContent = VERSION;

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

    sel.addEventListener('change', function () { set('profile', sel.value); });
    ui.cw.addEventListener('input', function () { set('customW', ui.cw.value); });
    ui.ch.addEventListener('input', function () { set('customH', ui.ch.value); });
    bindRange(ui.ipd, 'ipd');
    bindRange(ui.conv, 'convergence');
    bindRange(ui.fov, 'fov');
    bindRange(ui.zoom, 'zoom');
    bindRange(ui.gap, 'gap');
    bindRange(ui.dist, 'distortion');
    ui.guidesChk.addEventListener('change', function () { set('guides', ui.guidesChk.checked); });
    ui.hudMode.addEventListener('change', function () { set('hudMode', ui.hudMode.value); });
    ui.vigChk.addEventListener('change', function () { set('vignette', ui.vigChk.checked); });
    ui.toggle.addEventListener('click', function (e) {
      e.preventDefault();
      if (active) disable(); else enable();
    });

    /* Los controles del panel no deben mover al personaje. */
    panel.addEventListener('keydown', function (e) { e.stopPropagation(); });
    panel.addEventListener('pointerdown', function (e) { e.stopPropagation(); });

    /* El boton VR esta disponible tambien en iPhone: es la via de entrada
       al modo y, con el telefono dentro de las VR Box, la salida segura. */
    syncUI();
    addPauseEntry();
  }

  function bindRange(input, key) {
    input.addEventListener('input', function () { set(key, Number(input.value)); });
  }

  function syncUI() {
    if (!ui.panel) return;
    ui.profile.value = settings.profile;
    ui.custom.style.display = settings.profile === 'custom' ? '' : 'none';
    ui.cw.value = settings.customW;
    ui.ch.value = settings.customH;
    ui.ipd.value = settings.ipd;
    ui.conv.value = settings.convergence;
    ui.fov.value = settings.fov;
    ui.zoom.value = settings.zoom;
    ui.gap.value = settings.gap;
    ui.dist.value = settings.distortion;
    ui.guidesChk.checked = settings.guides;
    ui.hudMode.value = settings.hudMode;
    ui.vigChk.checked = settings.vignette;
    ui.panel.querySelector('#vr-ipd-o').textContent = Math.round(settings.ipd) + ' mm';
    ui.panel.querySelector('#vr-conv-o').textContent = settings.convergence.toFixed(1) + ' m';
    ui.panel.querySelector('#vr-fov-o').textContent = Math.round(settings.fov) + '°';
    ui.panel.querySelector('#vr-zoom-o').textContent = Math.round(settings.zoom * 100) + ' %';
    ui.panel.querySelector('#vr-gap-o').textContent = Math.round(settings.gap * 100) + ' %';
    ui.panel.querySelector('#vr-dist-o').textContent = Math.round(settings.distortion * 100) + ' %';
    ui.toggle.textContent = active ? 'Salir de VR' : 'Activar VR';
    ui.toggle.classList.toggle('on', active);
    document.body.classList.toggle('vr-hud-off', active && settings.hudMode === 'off');
    document.body.classList.toggle('vr-hud-mirror', active && settings.hudMode === 'per-eye');
    document.body.classList.toggle('vr-vignette', active && settings.vignette);
    ui.guides.classList.toggle('on', active && settings.guides);
    if (active) {
      updateInfo();
      requestAnimationFrame(layoutOverlays);
    }
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
      'FOV ' + Math.round(settings.fov) + '° · ' +
      (last.path === 'rt' ? 'distorsión activa' : 'sin distorsión');
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

    var perEye = settings.hudMode === 'per-eye';
    var hud = document.getElementById('rg-hud');
    var pause = document.getElementById('ras-pause');
    var end = document.getElementById('rg-end');
    syncMirror('hud', hud, perEye, stage, eyes, pr);
    syncMirror('pause', pause, !!(pause && !pause.hidden), stage, eyes, pr);
    syncMirror('end', end, !!(end && end.classList.contains('on')), stage, eyes, pr);

    placeOverlays(sx, sy, sw, sh, W / pr, H / pr, !perEye);

    /* El boton VR se mueve dentro del ojo izquierdo cuando el modo esta
       activo: es la salida segura y debe verse entero en una lente. */
    if (ui.launch) {
      var lb = ui.launch.getBoundingClientRect();
      ui.launch.style.left = Math.max(0, (eyes[0].x + eyes[0].w / 2) / pr - lb.width / 2) + 'px';
      ui.launch.style.top = ((eyes[0].y + 10) / pr) + 'px';
      ui.launch.style.bottom = 'auto';
    }
    if (ui.panel) {
      ui.panel.style.maxWidth = Math.max(220, Math.min(340, sw - 24)) + 'px';
      ui.panel.style.maxHeight = Math.max(160, sh - 24) + 'px';
      ui.panel.style.top = (sy + 12) + 'px';
      ui.panel.style.right = ((W / pr) - (stage.x + stage.w) / pr + 12) + 'px';
    }
    updateRotate();
  }

  /* ---------------- copias por ojo (HUD y menus) ---------------- */

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

  /* Copia un overlay real dentro de cada ojo. Se clona el nodo completo para
     que las reglas CSS del juego sigan valiendo. El contenedor tiene
     `transform`, y un transform convierte al contenedor en el bloque de
     referencia de los hijos position:fixed: cada copia ocupa exactamente su
     ojo. El original queda invisible pero sigue recibiendo el foco del mando
     y las llamadas .click(). */
  function syncMirror(kind, src, on, stage, eyes, pr) {
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
    var sig = src.innerHTML + '|' + src.className + '|' +
      (src.hasAttribute('hidden') ? '1' : '0') + '|' +
      (src.classList.contains('on') ? '1' : '0');
    if (sig !== mirrorSig[kind]) {
      mirrorSig[kind] = sig;
      for (var i = 0; i < 2; i++) {
        var box = i === 0 ? pair.l : pair.r;
        box.innerHTML = '';
        box.appendChild(src.cloneNode(true));
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
      box2.style.width = (stage.w / pr) + 'px';
      box2.style.height = (stage.h / pr) + 'px';
      box2.style.transform = 'scale(' + s + ')';
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
    /* Esquinas: el botón está anclado a right/bottom de la ventana; se
       desplaza lo que sobra entre la ventana y el marco. */
    var dx = sx + sw - vw;
    var dy = sy + sh - vh;
    if (overlayEls.act) {
      overlayEls.act.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
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
      if (overlayEls.act) overlayEls.act.style.transform = '';
      if (overlayEls.stick) overlayEls.stick.style.transform = '';
    }
    ['hud', 'pause', 'end'].forEach(function (kind) {
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

  function showPanel() {
    if (!ui.panel) return;
    ui.panel.classList.add('on');
    if (ui.launch) ui.launch.classList.add('on');
    syncUI();
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
    if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) return false;
    settings[key] = value;
    settings = sanitize(settings);
    save();
    syncUI();
    return true;
  }

  function profile(name) { return set('profile', name); }

  function reset() {
    settings = sanitize({});
    save();
    syncUI();
    return true;
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
    if (e.defaultPrevented) return;
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
    profile: profile,
    set: set,
    reset: reset,
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
        desktop: DESKTOP,
        mobile: MOBILE,
        forced: FORCE,
        settings: JSON.parse(JSON.stringify(settings)),
        canvas: { width: canvas.width, height: canvas.height, cssW: canvas.width / pr, cssH: canvas.height / pr, pixelRatio: pr },
        stage: last.stage,
        eyes: last.eyes,
        base: last.base,
        path: last.path,
        stats: JSON.parse(JSON.stringify(stats)),
        panelOpen: !!(ui.panel && ui.panel.classList.contains('on')),
        hud: settings.hudMode !== 'off',
        hudMode: settings.hudMode,
        mirrors: {
          hud: !!(mirrors.hud && mirrors.hud.l.classList.contains('on')),
          pause: !!(mirrors.pause && mirrors.pause.l.classList.contains('on')),
          end: !!(mirrors.end && mirrors.end.l.classList.contains('on'))
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
  buildUI();
  if (FORCE) enable();
})();
