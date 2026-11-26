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
  var SX_KEY = 'rasmatic.ht.sensX';
  var SY_KEY = 'rasmatic.ht.sensY';
  var SR_KEY = 'rasmatic.ht.sensRoll';
  var SMOOTH_KEY = 'rasmatic.ht.smoothing';
  var RESP_KEY = 'rasmatic.ht.response';
  var INVX_KEY = 'rasmatic.ht.invertX';
  var INVY_KEY = 'rasmatic.ht.invertY';
  var DEFAULT_SENS = 1.0;
  var DEFAULT_SMOOTH = 0.12;
  var DEFAULT_RESPONSE = 1.0;
  var MIN_RESPONSE = 0.5;
  var MAX_RESPONSE = 2.0;
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
  var sensitivityX = clamp(readNumber(SX_KEY, readNumber(SEN_KEY, DEFAULT_SENS)), MIN_SENS, MAX_SENS);
  var sensitivityY = clamp(readNumber(SY_KEY, sensitivityX), MIN_SENS, MAX_SENS);
  var sensitivityRoll = clamp(readNumber(SR_KEY, sensitivityX), MIN_SENS, MAX_SENS);
  var smoothing = clamp(readNumber(SMOOTH_KEY, DEFAULT_SMOOTH), MIN_SMOOTH, MAX_SMOOTH);
  var response = clamp(readNumber(RESP_KEY, DEFAULT_RESPONSE), MIN_RESPONSE, MAX_RESPONSE);
  var invertX = readNumber(INVX_KEY, 0) ? true : false;
  var invertY = readNumber(INVY_KEY, 0) ? true : false;

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
      sensitivity: sensitivityX,
      sensitivityX: sensitivityX,
      sensitivityY: sensitivityY,
      sensitivityRoll: sensitivityRoll,
      smoothing: smoothing,
      response: response,
      invertX: invertX,
      invertY: invertY,
      orientation: orientation(),
      samples: samples,
      lastSampleAt: lastSampleAt,
      storage: {
        sensitivity: SEN_KEY, sensitivityX: SX_KEY, sensitivityY: SY_KEY,
        sensitivityRoll: SR_KEY, smoothing: SMOOTH_KEY, response: RESP_KEY,
        invertX: INVX_KEY, invertY: INVY_KEY
      }
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
  function getSensitivity() { return sensitivityX; }
  function getSensitivityX() { return sensitivityX; }
  function getSensitivityY() { return sensitivityY; }
  function getSensitivityRoll() { return sensitivityRoll; }
  function getSmoothing() { return smoothing; }
  function getResponse() { return response; }
  function getConfig() {
    return {
      enabled: enabled, sensitivityX: sensitivityX, sensitivityY: sensitivityY,
      sensitivityRoll: sensitivityRoll, smoothing: smoothing, response: response,
      invertX: invertX, invertY: invertY
    };
  }

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
    targetYaw = wrapPi(rawYaw - baseYaw) * sensitivityX * (invertX ? -1 : 1);
    targetPitch = clamp(rawPitch - basePitch, -PITCH_LIMIT, PITCH_LIMIT) * sensitivityY * (invertY ? -1 : 1);
    targetRoll = clamp(rawRoll - baseRoll, -ROLL_LIMIT, ROLL_LIMIT) * sensitivityRoll;
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
    var tau = smoothing / Math.max(0.1, response);
    var k = 1 - Math.exp(-dt / Math.max(0.01, tau));
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

  function setSensitivityX(v) {
    var n = Number(v);
    if (!isFinite(n)) return sensitivityX;
    sensitivityX = clamp(n, MIN_SENS, MAX_SENS);
    storeSet(SX_KEY, String(Math.round(sensitivityX * 100) / 100));
    storeSet(SEN_KEY, String(Math.round(sensitivityX * 100) / 100));
    recompute(); notify();
    return sensitivityX;
  }
  function setSensitivityY(v) {
    var n = Number(v);
    if (!isFinite(n)) return sensitivityY;
    sensitivityY = clamp(n, MIN_SENS, MAX_SENS);
    storeSet(SY_KEY, String(Math.round(sensitivityY * 100) / 100));
    recompute(); notify();
    return sensitivityY;
  }
  function setSensitivityRoll(v) {
    var n = Number(v);
    if (!isFinite(n)) return sensitivityRoll;
    sensitivityRoll = clamp(n, MIN_SENS, MAX_SENS);
    storeSet(SR_KEY, String(Math.round(sensitivityRoll * 100) / 100));
    recompute(); notify();
    return sensitivityRoll;
  }
  function setSensitivity(v) {
    var n = Number(v);
    if (!isFinite(n)) return sensitivityX;
    setSensitivityX(n); setSensitivityY(n); setSensitivityRoll(n);
    return sensitivityX;
  }

  function setSmoothing(v) {
    var n = Number(v);
    if (!isFinite(n)) return smoothing;
    smoothing = clamp(n, MIN_SMOOTH, MAX_SMOOTH);
    storeSet(SMOOTH_KEY, String(Math.round(smoothing * 100) / 100));
    notify();
    return smoothing;
  }

  function setResponse(v) {
    var n = Number(v);
    if (!isFinite(n)) return response;
    response = clamp(n, MIN_RESPONSE, MAX_RESPONSE);
    storeSet(RESP_KEY, String(Math.round(response * 100) / 100));
    notify();
    return response;
  }

  function setInvert(x, y) {
    if (typeof x === 'boolean') {
      invertX = x;
      storeSet(INVX_KEY, invertX ? '1' : '0');
    }
    if (typeof y === 'boolean') {
      invertY = y;
      storeSet(INVY_KEY, invertY ? '1' : '0');
    }
    recompute(); notify();
  }

  /* Configuración completa enviada por Windows o por la API.
     Acepta un objeto parcial; no borra valores ausentes. */
  function applyConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') return getConfig();
    if (typeof cfg.enabled === 'boolean') {
      if (cfg.enabled && !enabled) enable();
      else if (!cfg.enabled && enabled) disable();
    }
    if (isFinite(Number(cfg.sensitivityX))) setSensitivityX(cfg.sensitivityX);
    if (isFinite(Number(cfg.sensitivityY))) setSensitivityY(cfg.sensitivityY);
    if (isFinite(Number(cfg.sensitivityRoll))) setSensitivityRoll(cfg.sensitivityRoll);
    if (isFinite(Number(cfg.smoothing))) setSmoothing(cfg.smoothing);
    if (isFinite(Number(cfg.response))) setResponse(cfg.response);
    if (typeof cfg.invertX === 'boolean' || typeof cfg.invertY === 'boolean') {
      setInvert(typeof cfg.invertX === 'boolean' ? cfg.invertX : invertX,
        typeof cfg.invertY === 'boolean' ? cfg.invertY : invertY);
    }
    if (cfg.recenter === true || cfg.recenter === 1) recenter();
    if (cfg.calibrate === true || cfg.calibrate === 1) recenter();
    return getConfig();
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
    setSensitivityX: setSensitivityX,
    setSensitivityY: setSensitivityY,
    setSensitivityRoll: setSensitivityRoll,
    getSensitivityX: getSensitivityX,
    getSensitivityY: getSensitivityY,
    getSensitivityRoll: getSensitivityRoll,
    setSmoothing: setSmoothing,
    getSmoothing: getSmoothing,
    setResponse: setResponse,
    getResponse: getResponse,
    setInvert: setInvert,
    applyConfig: applyConfig,
    getConfig: getConfig,
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
        sensitivity: sensitivityX,
        sensitivityX: sensitivityX,
        sensitivityY: sensitivityY,
        sensitivityRoll: sensitivityRoll,
        smoothing: smoothing,
        response: response,
        invertX: invertX,
        invertY: invertY,
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
