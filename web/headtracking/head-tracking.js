/* ============================================================
   RASMATIC · HEAD TRACKING (V19)
   ------------------------------------------------------------
   Seguimiento real de orientación de la cabeza para la app
   RASMATIC VR HEAD TRACKING.

   Fuentes, en orden de preferencia:
     1. Puente nativo de iOS (Core Motion / CMDeviceMotion).
        Swift inyecta `window.RasmaticNativeHeadTracking` y envía
        yaw/pitch/roll en radianes a 60 Hz. No usa la cámara.
     2. DeviceOrientationEvent (PWA / Android / navegador).
        En iOS 13+ requiere un gesto del usuario para pedir permiso.

   Reglas:
     - No escribe PP.yaw/PP.pitch ni toca el estado del juego.
     - Expone una orientación RELATIVA al punto de recentrado.
     - Suavizado exponencial configurable y sensibilidad ajustable.
     - Si no hay sensores no inventa movimiento: informa el estado.
     - Roll solo se aplica cuando la fuente lo entrega de verdad
       (Core Motion). El fallback web trabaja con yaw + pitch.

   Superficie pública:
     RasmaticHeadTracking.enable() / disable() / toggle()
     .recenter() / .calibrate()
     .setSensitivity(v) / .getSensitivity()
     .setSmoothing(s) / .getSmoothing()
     .orientation() / .state() / .status() / .isEnabled()
     .isApplying() / .onChange(fn) / .debug()
   ============================================================ */
(function () {
  'use strict';

  var VERSION = 'ht-1.0';
  var DEG = Math.PI / 180;
  var SEN_KEY = 'rasmatic.ht.sensitivity';
  var SMOOTH_KEY = 'rasmatic.ht.smoothing';
  var DEFAULT_SENS = 1.0;
  var DEFAULT_SMOOTH = 0.12;
  var MIN_SENS = 0.2;
  var MAX_SENS = 2.5;
  var MIN_SMOOTH = 0.03;
  var MAX_SMOOTH = 0.45;
  var PITCH_LIMIT = 1.2;
  var ROLL_LIMIT = 0.7;
  var READY_TIMEOUT = 1800;

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function wrapPi(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function storeGet(key) {
    try {
      var s = window.RasmaticStore;
      if (s && typeof s.getItem === 'function') return s.getItem(key);
      return window.localStorage ? localStorage.getItem(key) : null;
    } catch (e) { return null; }
  }

  function storeSet(key, value) {
    try {
      var s = window.RasmaticStore;
      if (s && typeof s.setItem === 'function') s.setItem(key, value);
      else if (window.localStorage) localStorage.setItem(key, value);
    } catch (e) { /* modo privado */ }
  }

  function readNumber(key, def) {
    var raw = storeGet(key);
    var n = Number(raw);
    return isFinite(n) && raw !== null && raw !== '' ? n : def;
  }

  /* ---------------- fuentes de orientación ---------------- */
  var native = window.RasmaticNativeHeadTracking || null;
  var hasNative = !!(native && (typeof native.raw === 'function' || typeof native.bind === 'function'));
  var webSupported = typeof window.DeviceOrientationEvent !== 'undefined';
  var needsPrompt = !hasNative && webSupported &&
    typeof window.DeviceOrientationEvent.requestPermission === 'function';

  var source = hasNative ? 'native' : (webSupported ? 'web' : 'none');
  var nativeName = hasNative && native.name ? String(native.name) : 'Core Motion';

  /* ---------------- estado ---------------- */
  var sensitivity = clamp(readNumber(SEN_KEY, DEFAULT_SENS), MIN_SENS, MAX_SENS);
  var smoothing = clamp(readNumber(SMOOTH_KEY, DEFAULT_SMOOTH), MIN_SMOOTH, MAX_SMOOTH);

  var status = source === 'none' ? 'unsupported'
    : (source === 'native'
      ? (native.available === false ? 'unsupported' : 'idle')
      : (needsPrompt ? 'needs-permission' : 'idle'));
  var permission = source === 'native' ? 'system'
    : (needsPrompt ? 'unknown' : (webSupported ? 'not-required' : 'unavailable'));

  var enabled = false;
  var webAttached = false;
  var needBase = true;
  var baseReady = false;
  var baseYaw = 0, basePitch = 0, baseRoll = 0;
  var rawYaw = 0, rawPitch = 0, rawRoll = 0;
  var haveRaw = false;
  var targetYaw = 0, targetPitch = 0, targetRoll = 0;
  var yaw = 0, pitch = 0, roll = 0;
  var blend = 0;
  var raf = 0;
  var lastT = 0;
  var lastSampleAt = 0;
  var samples = 0;
  var readyTimer = 0;
  var listeners = [];
  var ui = {};

  function now() {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  function state() {
    return {
      version: VERSION,
      source: source,
      nativeName: nativeName,
      status: status,
      enabled: enabled,
      active: isApplying(),
      permission: permission,
      available: source !== 'none' && status !== 'unsupported',
      sensitivity: sensitivity,
      smoothing: smoothing,
      orientation: orientation(),
      samples: samples,
      lastSampleAt: lastSampleAt,
      storage: { sensitivity: SEN_KEY, smoothing: SMOOTH_KEY }
    };
  }

  function orientation() {
    return {
      yaw: yaw * blend,
      pitch: pitch * blend,
      roll: roll * blend,
      blend: blend,
      active: blend > 0.001
    };
  }

  function isEnabled() { return enabled; }
  function isApplying() { return blend > 0.001; }
  function getSensitivity() { return sensitivity; }
  function getSmoothing() { return smoothing; }

  function notify() {
    var st = state();
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](st); } catch (e) { /* un listener roto no frena el resto */ }
    }
    paint();
  }

  function onChange(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    try { fn(state()); } catch (e) { /* nada */ }
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  function setStatus(next) {
    if (status === next) return;
    status = next;
    notify();
  }

  /* ---------------- cálculo de la orientación ---------------- */
  function recompute() {
    if (!baseReady || !haveRaw) return;
    targetYaw = wrapPi(rawYaw - baseYaw) * sensitivity;
    targetPitch = clamp(rawPitch - basePitch, -PITCH_LIMIT, PITCH_LIMIT) * sensitivity;
    targetRoll = clamp(rawRoll - baseRoll, -ROLL_LIMIT, ROLL_LIMIT) * sensitivity;
  }

  function baseline() {
    baseYaw = rawYaw;
    basePitch = rawPitch;
    baseRoll = rawRoll;
    baseReady = true;
    needBase = false;
    targetYaw = 0;
    targetPitch = 0;
    targetRoll = 0;
  }

  function sample(yawRad, pitchRad, rollRad) {
    rawYaw = wrapPi(yawRad);
    rawPitch = clamp(pitchRad, -Math.PI / 2, Math.PI / 2);
    rawRoll = wrapPi(rollRad || 0);
    haveRaw = true;
    lastSampleAt = now();
    samples++;
    /* Al desactivar se conserva la última muestra, pero no se recalcula el
       objetivo: así el offset se desvanece suavemente hasta cero. */
    if (!enabled) return;
    if (needBase) baseline();
    recompute();
    if (status === 'starting' || status === 'timeout') {
      permission = source === 'native' ? 'granted' : 'granted';
      setStatus('active');
    }
    if (enabled && readyTimer) {
      clearTimeout(readyTimer);
      readyTimer = 0;
    }
  }

  /* ---------------- bucle de suavizado ---------------- */
  function frame(t) {
    if (!lastT) lastT = t;
    var dt = Math.min(0.1, Math.max(0, (t - lastT) / 1000));
    lastT = t;
    var k = 1 - Math.exp(-dt / Math.max(0.01, smoothing));
    yaw += (targetYaw - yaw) * k;
    pitch += (targetPitch - pitch) * k;
    roll += (targetRoll - roll) * k;
    if (enabled) {
      blend += (1 - blend) * k;
      if (blend > 0.999) blend = 1;
    } else {
      blend += (0 - blend) * k;
      if (blend < 0.001) blend = 0;
    }
    if (enabled || blend > 0.001) {
      raf = requestAnimationFrame(frame);
    } else {
      raf = 0;
      lastT = 0;
      yaw = pitch = roll = 0;
    }
  }

  function startLoop() {
    if (raf) return;
    lastT = 0;
    raf = requestAnimationFrame(frame);
  }

  function armReadyTimer() {
    if (readyTimer) clearTimeout(readyTimer);
    readyTimer = setTimeout(function () {
      readyTimer = 0;
      if (!enabled) return;
      if (!haveRaw || now() - lastSampleAt > READY_TIMEOUT) {
        permission = source === 'native' ? 'system' : permission;
        setStatus('timeout');
      }
    }, READY_TIMEOUT + 100);
  }

  /* ---------------- fuente nativa (Core Motion) ---------------- */
  function bindNative() {
    if (!hasNative) return;
    if (typeof native.bind === 'function') {
      native.bind(function (y, p, r) { sample(Number(y) || 0, Number(p) || 0, Number(r) || 0); },
        function (available, name) {
          if (name) nativeName = String(name);
          if (available === false) {
            enabled = false;
            targetYaw = targetPitch = targetRoll = 0;
            setStatus('unsupported');
          } else if (status === 'unsupported' || status === 'timeout') {
            setStatus(enabled ? 'starting' : (needsPrompt ? 'needs-permission' : 'idle'));
            if (enabled) armReadyTimer();
          }
        });
    } else {
      /* Compatibilidad con un puente que solo expone raw/status. */
      native._raw = function (y, p, r) { sample(Number(y) || 0, Number(p) || 0, Number(r) || 0); };
      native._status = function (available, name) {
        if (name) nativeName = String(name);
        if (available === false) { enabled = false; setStatus('unsupported'); }
      };
    }
  }

  /* ---------------- fallback web (DeviceOrientationEvent) ---------------- */
  function onWebOrientation(e) {
    if (!enabled && blend <= 0.001) return;
    var a = e.alpha;
    var b = e.beta;
    var g = e.gamma;
    if (a === null && b === null && g === null) return;
    /* alpha: giro alrededor del eje vertical. beta: inclinación
       adelante/atrás. gamma: inclinación lateral. */
    sample((Number(a) || 0) * DEG, (Number(b) || 0) * DEG, 0);
  }

  function attachWeb() {
    if (webAttached || source !== 'web') return;
    window.addEventListener('deviceorientation', onWebOrientation, true);
    webAttached = true;
  }

  function detachWeb() {
    if (!webAttached) return;
    window.removeEventListener('deviceorientation', onWebOrientation, true);
    webAttached = false;
  }

  function requestWebPermission() {
    if (!needsPrompt) return Promise.resolve(true);
    try {
      var p = window.DeviceOrientationEvent.requestPermission();
      if (p && typeof p.then === 'function') {
        return p.then(function (r) { return r === 'granted'; })
          .catch(function () { return false; });
      }
      return Promise.resolve(p === 'granted');
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  /* ---------------- activar / desactivar ---------------- */
  function enable() {
    if (status === 'unsupported' || source === 'none') {
      setStatus('unsupported');
      return Promise.resolve(false);
    }
    if (enabled) return Promise.resolve(true);
    enabled = true;
    needBase = true;
    baseReady = false;
    if (blend <= 0.001) {
      yaw = pitch = roll = 0;
      targetYaw = targetPitch = targetRoll = 0;
    }
    setStatus('starting');
    startLoop();
    armReadyTimer();

    if (source === 'web') {
      return requestWebPermission().then(function (granted) {
        if (!granted) {
          enabled = false;
          permission = 'denied';
          setStatus('denied');
          startLoop();
          return false;
        }
        permission = 'granted';
        attachWeb();
        return true;
      });
    }
    return Promise.resolve(true);
  }

  function disable() {
    if (!enabled) return false;
    enabled = false;
    targetYaw = targetPitch = targetRoll = 0;
    if (source === 'web') detachWeb();
    if (readyTimer) { clearTimeout(readyTimer); readyTimer = 0; }
    setStatus(source === 'unsupported' ? 'unsupported'
      : (needsPrompt && permission !== 'granted' ? 'needs-permission' : 'idle'));
    startLoop();
    return true;
  }

  function toggle() {
    if (enabled) { disable(); return false; }
    enable();
    return true;
  }

  function recenter() {
    if (!haveRaw) {
      needBase = true;
      baseReady = false;
      return false;
    }
    baseline();
    return true;
  }

  function setSensitivity(v) {
    var n = Number(v);
    if (!isFinite(n)) return sensitivity;
    sensitivity = clamp(n, MIN_SENS, MAX_SENS);
    storeSet(SEN_KEY, String(Math.round(sensitivity * 100) / 100));
    recompute();
    notify();
    return sensitivity;
  }

  function setSmoothing(v) {
    var n = Number(v);
    if (!isFinite(n)) return smoothing;
    smoothing = clamp(n, MIN_SMOOTH, MAX_SMOOTH);
    storeSet(SMOOTH_KEY, String(Math.round(smoothing * 100) / 100));
    notify();
    return smoothing;
  }

  /* ---------------- interfaz flotante ---------------- */
  function buildBar() {
    if (document.getElementById('ht-bar')) return;
    var bar = document.createElement('div');
    bar.id = 'ht-bar';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Head tracking');
    bar.innerHTML =
      '<button id="ht-toggle" type="button" aria-pressed="false">' +
        '<span id="ht-dot" aria-hidden="true"></span><b id="ht-label">HEAD TRACKING</b>' +
      '</button>' +
      '<button id="ht-center" type="button" hidden>⟳ RECENTRAR</button>' +
      '<small id="ht-status" role="status" aria-live="polite"></small>';
    document.body.appendChild(bar);

    ui.bar = bar;
    ui.toggle = bar.querySelector('#ht-toggle');
    ui.label = bar.querySelector('#ht-label');
    ui.center = bar.querySelector('#ht-center');
    ui.status = bar.querySelector('#ht-status');

    ui.toggle.addEventListener('click', function (e) {
      e.preventDefault();
      if (status === 'unsupported') return;
      if (enabled) disable();
      else enable();
    });
    ui.center.addEventListener('click', function (e) {
      e.preventDefault();
      recenter();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'r' && e.key !== 'R') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target;
      if (t && t.closest && t.closest('input,select,textarea,button')) return;
      if (!isApplying()) return;
      e.preventDefault();
      recenter();
    }, true);
  }

  var LABELS = {
    unsupported: 'SIN SENSORES',
    'needs-permission': 'ACTIVAR HT',
    idle: 'ACTIVAR HT',
    starting: 'CONECTANDO…',
    active: 'HT ACTIVO',
    denied: 'PERMISO DENEGADO',
    timeout: 'SIN RESPUESTA',
    paused: 'HT EN PAUSA'
  };

  var DETAILS = {
    unsupported: 'Este dispositivo no tiene sensores de orientación disponibles.',
    'needs-permission': 'Tocá ACTIVAR HT y aceptá el permiso de movimiento.',
    idle: 'Tocá ACTIVAR HT para girar la cámara con la cabeza.',
    starting: 'Esperando datos del sensor…',
    active: 'Giro con la cabeza · R o RECENTRAR vuelve al frente.',
    denied: 'Permiso de movimiento denegado. Activalo en Ajustes del iPhone.',
    timeout: 'No llegaron datos del sensor. Dispositivo incompatible o permiso bloqueado.',
    paused: 'Head tracking en pausa.'
  };

  function paint() {
    if (!ui.bar) return;
    var on = enabled;
    ui.bar.className = 'ht-' + status + (on ? ' ht-on' : '');
    ui.bar.setAttribute('data-source', source);
    ui.label.textContent = LABELS[status] || 'HEAD TRACKING';
    ui.status.textContent = DETAILS[status] || '';
    ui.toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    ui.toggle.disabled = status === 'unsupported';
    ui.toggle.classList.toggle('on', on);
    ui.center.hidden = !isApplying();
  }

  /* ---------------- arranque ---------------- */
  function init() {
    buildBar();
    bindNative();
    paint();
    if (source === 'none') {
      setStatus('unsupported');
      return;
    }
    if (needsPrompt) {
      setStatus('needs-permission');
      return;
    }
    /* En nativo el sensor ya está disponible; en web sin permiso explícito
       se intenta arrancar solo. Si no llegan datos, se informa el timeout. */
    setTimeout(function () {
      if (!enabled && status !== 'unsupported') enable();
    }, 250);
  }

  window.RasmaticHeadTracking = {
    version: VERSION,
    enable: enable,
    disable: disable,
    toggle: toggle,
    recenter: recenter,
    calibrate: recenter,
    setSensitivity: setSensitivity,
    getSensitivity: getSensitivity,
    setSmoothing: setSmoothing,
    getSmoothing: getSmoothing,
    orientation: orientation,
    state: state,
    status: function () { return status; },
    isEnabled: isEnabled,
    isApplying: isApplying,
    onChange: onChange,
    /* Solo lectura / pruebas. Nunca simula movimiento por sí solo. */
    debug: function () {
      return {
        source: source,
        status: status,
        enabled: enabled,
        applying: isApplying(),
        permission: permission,
        nativeName: nativeName,
        haveRaw: haveRaw,
        baseReady: baseReady,
        samples: samples,
        sensitivity: sensitivity,
        smoothing: smoothing,
        orientation: orientation(),
        lastSampleAt: lastSampleAt
      };
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
