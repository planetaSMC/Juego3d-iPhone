/* ============================================================
   RASMATIC V20 · núcleo de la app unificada
   ------------------------------------------------------------
   Construye la escena de farmacia (pharmacy-scene.js) y expone
   window.RasmaticCore con la misma superficie que V19 para que
   game.js, android-bridge.js, ios-bridge.js y vr-preview.js
   sigan funcionando.

   Modos:
     film  -> recorrido guiado por la farmacia
     model -> órbita de la RASMATIC BOT
     place -> primera persona + partida
   ============================================================ */
(function () {
  'use strict';

  var THREE = window.THREE;
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(72, 1, 0.1, 200);
  /* preserveDrawingBuffer: la captura del panel VR y las pruebas leen el
     canvas con toDataURL; sin esto el buffer aparece en negro. */
  var renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.id = 'ras-canvas';
  document.body.insertBefore(renderer.domElement, document.body.firstChild);
  scene.add(camera);

  var PP = { x: 46.8, y: 0, z: 9.4, yaw: Math.PI / 2, pitch: -0.05 };
  var EXT = { mx: 0, my: 0, lx: 0, ly: 0, run: false };
  var keys = {};
  var mode = 'place';
  var paused = false;
  var infoOpen = false;
  var dockOpen = false;
  var last = performance.now();
  var bobTime = 0;
  var filmT = 0;
  var modelRy = 0.6;
  var modelRx = 0.08;
  var modelDist = 18;
  var autoSpin = true;
  var pointers = new Map();
  var pinch0 = 0;
  var pd = null;
  var ready = false;

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  function buildScene() {
    var ph = window.RasmaticPharmacy({
      renderer: renderer, scene: scene, camera: camera, player: PP
    });
    ready = true;
    window.RasmaticPharmacyApi = ph;
    window.__ready = true;
    return ph;
  }

  var ph = buildScene();

  function resize() {
    var w = Math.max(1, window.innerWidth);
    var h = Math.max(1, window.innerHeight);
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  function setMode(next) {
    if (next !== 'film' && next !== 'model' && next !== 'place') return false;
    mode = next;
    document.body.classList.toggle('v20-film', next === 'film');
    document.body.classList.toggle('v20-model', next === 'model');
    document.body.classList.toggle('v20-place', next === 'place');
    document.body.classList.toggle('model', next !== 'film');
    document.body.classList.toggle('place', next === 'place');
    var btn = document.getElementById('v20-mode');
    if (btn) {
      btn.textContent = next === 'film' ? 'MODELO'
        : next === 'model' ? 'EXPLORAR' : 'RECORRIDO';
    }
    if (next === 'place') {
      camera.fov = 72;
      camera.updateProjectionMatrix();
    }
    return true;
  }

  function normKey(e) {
    var k = e.key;
    if (k && k.length === 1) return k.toLowerCase();
    return k;
  }

  window.addEventListener('keydown', function (e) {
    if (document.body.classList.contains('intro')) return;
    var k = normKey(e);
    if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') e.preventDefault();
    keys[k] = true;
    if (k === 'v') setMode(mode === 'place' ? 'film' : (mode === 'film' ? 'model' : 'place'));
    if (k === 'e' && window.RasmaticGame && window.RasmaticGame.interact) window.RasmaticGame.interact();
  }, true);

  window.addEventListener('keyup', function (e) {
    keys[normKey(e)] = false;
  });
  window.addEventListener('blur', function () {
    for (var k in keys) keys[k] = false;
    EXT.mx = EXT.my = EXT.lx = EXT.ly = 0;
    EXT.run = false;
  });

  /* Arrastre de cámara en place/model. */
  renderer.domElement.addEventListener('pointerdown', function (e) {
    if (mode === 'film') return;
    try { renderer.domElement.setPointerCapture(e.pointerId); } catch (err) {}
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (mode === 'model') { pd = { x: e.clientX, y: e.clientY }; autoSpin = false; pinch0 = 0; }
    else pd = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener('pointermove', function (e) {
    if (!pd || !pointers.has(e.pointerId)) return;
    if (mode === 'place') {
      PP.yaw -= (e.clientX - pd.x) * 0.005;
      PP.pitch = clamp(PP.pitch - (e.clientY - pd.y) * 0.004, -1.5, 1.5);
    } else if (mode === 'model') {
      modelRy += (e.clientX - pd.x) * 0.006;
      modelRx = clamp(modelRx + (e.clientY - pd.y) * 0.005, -1.2, 1.2);
    }
    pd = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (name) {
    renderer.domElement.addEventListener(name, function (e) {
      pointers.delete(e.pointerId);
      if (!pointers.size) pd = null;
      pinch0 = 0;
    });
  });
  renderer.domElement.addEventListener('wheel', function (e) {
    if (mode !== 'model') return;
    e.preventDefault();
    modelDist = clamp(modelDist * (1 + e.deltaY * 0.001), 8, 45);
    autoSpin = false;
  }, { passive: false });

  /* Movimiento de primera persona. */
  function updatePlace(dt) {
    var fwd = (keys.w || keys.ArrowUp ? 1 : 0) - (keys.s || keys.ArrowDown ? 1 : 0);
    var str = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
    var turn = (keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0);
    fwd += EXT.my;
    str += EXT.mx;
    turn -= EXT.lx;
    var len = Math.hypot(fwd, str);
    if (len > 1) { fwd /= len; str /= len; }
    PP.yaw += turn * dt * 1.9;
    PP.pitch = clamp(PP.pitch + EXT.ly * dt * 1.6, -1.5, 1.5);
    var run = keys.Shift || EXT.run;
    var speed = (run ? 2 : 1) * 8 * dt;
    var sy = Math.sin(PP.yaw), cy = Math.cos(PP.yaw);
    var nx = PP.x + (-sy * fwd + cy * str) * speed;
    var nz = PP.z + (-cy * fwd - sy * str) * speed;
    if (!ph.blocked(nx, PP.z)) PP.x = nx;
    if (!ph.blocked(PP.x, nz)) PP.z = nz;
    PP.x = clamp(PP.x, ph.bounds.minX, ph.bounds.maxX);
    PP.z = clamp(PP.z, ph.bounds.minZ, ph.bounds.maxZ);
    if (fwd || str) bobTime += dt;
    var bob = (fwd || str) ? Math.sin(bobTime * 10) * 0.055 : 0;
    camera.position.set(PP.x, ph.eye + bob, PP.z);
    camera.rotation.set(PP.pitch, PP.yaw, 0, 'YXZ');
  }

  /* Recorrido guiado: interpola los puntos del HTML. */
  function sampleFilm(t) {
    var pts = ph.filmPath;
    if (!pts || pts.length < 2) return null;
    var u = (t % 1) * (pts.length - 1);
    var i = Math.min(pts.length - 2, Math.floor(u));
    var f = u - i;
    f = f * f * (3 - 2 * f);
    var a = pts[i], b = pts[i + 1];
    var yawA = a.yaw, yawB = b.yaw;
    var dy = Math.atan2(Math.sin(yawB - yawA), Math.cos(yawB - yawA));
    return {
      x: a.x + (b.x - a.x) * f,
      z: a.z + (b.z - a.z) * f,
      yaw: yawA + dy * f,
      pitch: a.pitch + (b.pitch - a.pitch) * f
    };
  }

  function updateFilm(dt) {
    filmT += dt / 28;
    if (filmT > 1) filmT -= 1;
    var p = sampleFilm(filmT);
    if (!p) return;
    camera.position.set(p.x, ph.eye, p.z);
    camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
    camera.fov = 72;
    camera.updateProjectionMatrix();
  }

  function updateModel(dt) {
    if (autoSpin) modelRy += dt * 0.18;
    var target = ph.modelTarget;
    var x = target.x + Math.sin(modelRy) * Math.cos(modelRx) * modelDist;
    var y = target.y + Math.sin(modelRx) * modelDist;
    var z = target.z + Math.cos(modelRy) * Math.cos(modelRx) * modelDist;
    camera.position.set(x, y, z);
    camera.lookAt(target);
    camera.fov = 60;
    camera.updateProjectionMatrix();
  }

  /* Loop. */
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (!paused) {
      ph.update(dt);
      if (mode === 'place') updatePlace(dt);
      else if (mode === 'film') updateFilm(dt);
      else updateModel(dt);
      if (mode === 'place' && window.RasmaticGame && window.RasmaticGame.tick) {
        try { window.RasmaticGame.tick(dt); } catch (e) { /* el juego aún no arrancó */ }
      }
    }
    renderer.render(scene, camera);
  }

  function input(s) {
    if (!s) return;
    EXT.mx = clamp(Number(s.mx) || 0, -1, 1);
    EXT.my = clamp(Number(s.my) || 0, -1, 1);
    EXT.lx = clamp(Number(s.lx) || 0, -1, 1);
    EXT.ly = clamp(Number(s.ly) || 0, -1, 1);
    EXT.run = s.run === true;
  }

  function interact() {
    if (window.RasmaticGame && window.RasmaticGame.interact) return window.RasmaticGame.interact();
    return false;
  }

  function home() {
    PP.x = ph.playerStart.x;
    PP.z = ph.playerStart.z;
    PP.yaw = ph.playerStart.yaw;
    PP.pitch = ph.playerStart.pitch;
    setMode('place');
    if (window.RasmaticGame && window.RasmaticGame.onBack) window.RasmaticGame.onBack();
    return true;
  }

  function closeOverlays() {
    infoOpen = false;
    document.body.classList.remove('info');
    return false;
  }

  function toggleDock() { setDock(!dockOpen); return dockOpen; }
  function setDock(open) {
    dockOpen = !!open;
    document.body.classList.toggle('dockmin', !dockOpen);
    var dock = document.getElementById('v20-dock');
    if (dock) dock.classList.toggle('on', dockOpen);
  }

  function gotoPlace(name) {
    var spots = {
      entrada: { x: 46.8, z: 28, yaw: Math.PI, pitch: -0.02 },
      mostrador: { x: 24, z: 18, yaw: Math.PI * 0.6, pitch: -0.05 },
      estantes: { x: 46.8, z: 9.4, yaw: Math.PI, pitch: -0.02 },
      cinta: { x: 38, z: 18, yaw: Math.PI * 0.75, pitch: -0.08 },
      maquina: { x: 16, z: 14, yaw: Math.PI * 0.6, pitch: 0 },
      aerea: { x: 46.8, z: 20, yaw: Math.PI, pitch: -0.5 }
    };
    var s = spots[name];
    if (!s) return false;
    PP.x = s.x; PP.z = s.z; PP.yaw = s.yaw; PP.pitch = s.pitch;
    setMode('place');
    return true;
  }

  window.RasmaticCore = {
    game: {
      scene: scene, camera: camera, renderer: renderer,
      place: scene, player: PP, machine: ph.machine,
      spec: ph.machine.spec, boxY: function (s) { return s.y; },
      home: ph.machine.home, mats: ph.mats, logo: ph.logo,
      pharmacy: ph, setMode: setMode
    },
    input: input,
    resetInput: function () { input({ mx: 0, my: 0, lx: 0, ly: 0, run: false }); },
    pause: function () { paused = true; },
    resume: function () { paused = false; last = performance.now(); },
    isPaused: function () { return paused; },
    interact: interact,
    home: home,
    closeOverlays: closeOverlays,
    toggleDock: toggleDock,
    setDock: setDock,
    gotoPlace: gotoPlace,
    setMode: setMode,
    getMode: function () { return mode; },
    isReady: function () { return ready; },
    state: function () {
      return {
        mode: mode, ready: ready, infoOpen: infoOpen, paused: paused,
        dockOpen: dockOpen, t: performance.now() / 1000,
        pos: { x: +PP.x.toFixed(3), y: +PP.y.toFixed(3), z: +PP.z.toFixed(3),
          yaw: +PP.yaw.toFixed(3), pitch: +PP.pitch.toFixed(3) }
      };
    }
  };

  document.body.classList.add('v20-place');
  setMode('place');
  requestAnimationFrame(frame);
})();
