/* ============================================================
   RASMATIC iOS - puente de plataforma

   Hace por JavaScript lo que en Android hace Kotlin:
     - mando fisico (Gamepad API) -> RasmaticInput.gamepad / press
     - pausa al pasar a segundo plano (ya la maneja android-bridge.js)
     - detalles de Safari: sin zoom de pellizco, sin menu contextual

   NO modifica el juego: habla con la misma superficie publica que usa
   Android (RasmaticCore.input, RasmaticInput.gamepad/press,
   RasmaticInput.gamepadStatus), asi que el comportamiento es el mismo.
   ============================================================ */
(function () {
  'use strict';

  var root = document.documentElement;
  /* android-bridge.js ya agrego 'ras-android': las hojas de estilo de los
     controles tactiles dependen de esa clase, se mantiene. */
  root.classList.add('ras-ios');

  var DEBUG = /[?&]debug=1\b/.test(location.search);
  var VERSION = 'ios-1.1';

  /* La app nativa inyecta __RASMATIC_NATIVE__ antes de cargar la pagina.
     Con ese marcador se usa el puente GameController de Swift y se apaga la
     Gamepad API: una pulsacion nunca entra dos veces. En Safari/PWA el
     marcador no existe y todo sigue por Gamepad API. */
  var NATIVE = !!(window.__RASMATIC_NATIVE__ && window.__RASMATIC_NATIVE__.gamepad);

  /* ---------------- Detalles de Safari ---------------- */

  /* Zoom de pellizco: iOS ignora user-scalable=no, hay que cancelar el gesto. */
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (name) {
    document.addEventListener(name, function (e) { e.preventDefault(); }, { passive: false });
  });

  /* Dos dedos sobre la escena no deben hacer zoom ni desplazar la pagina. */
  document.addEventListener('touchmove', function (e) {
    if (e.touches && e.touches.length > 1) e.preventDefault();
  }, { passive: false });

  /* Sin menu contextual al mantener pulsado (el juego usa pulsaciones largas). */
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* Sin zoom por doble toque sobre la escena. Se limita al canvas: cancelar
     el touchend sobre un boton tambien cancelaria su click y romperia los
     toques rapidos en RECOGER / ENTREGAR. */
  var lastTouchEnd = 0;
  document.addEventListener('touchend', function (e) {
    var t = e.target;
    if (!t || t.tagName !== 'CANVAS') { lastTouchEnd = 0; return; }
    var now = Date.now();
    if (now - lastTouchEnd <= 320) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });

  /* Safari en modo instalado no siempre dispara resize al cambiar la barra
     de estado; visualViewport lo reporta y el juego ya escucha 'resize'. */
  if (window.visualViewport) {
    var vv = window.visualViewport;
    var lastH = vv.height;
    vv.addEventListener('resize', function () {
      if (Math.abs(vv.height - lastH) < 1) return;
      lastH = vv.height;
      window.dispatchEvent(new Event('resize'));
    });
  }

  /* ---------------- Pantalla encendida ---------------- */

  /* En Android la app usa FLAG_KEEP_SCREEN_ON. En Safari/PWA se pide el mismo
     comportamiento con la Screen Wake Lock API (iOS 16.4+). Si no existe, no
     pasa nada: solo se comporta como cualquier pagina. */
  var wakeLock = null;

  function requestWakeLock() {
    if (!navigator.wakeLock || document.visibilityState !== 'visible') return;
    if (wakeLock) return;
    navigator.wakeLock.request('screen').then(function (lock) {
      wakeLock = lock;
      lock.addEventListener('release', function () { wakeLock = null; });
    }).catch(function () { /* sin permiso o sin soporte */ });
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') requestWakeLock();
  });
  requestWakeLock();

  /* ---------------- Aviso de mando ---------------- */

  var toastEl = null;
  var toastTimer = 0;

  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'ras-pad-toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, 2600);
  }

  /* ---------------- Mando fisico (Gamepad API) ---------------- */

  /* Mismo mapeo que GamepadManager.kt (BUTTON_ACTIONS). Indices del
     "standard gamepad" del W3C. */
  var BUTTON_ACTIONS = {
    0: 'interact',   // A
    5: 'interact',   // R1
    7: 'interact',   // R2 (gatillo derecho)
    1: 'pause',      // B
    9: 'pause',      // Start
    2: 'menu',       // X
    3: 'home',       // Y
    8: 'dock'        // Select / Back
  };

  var DEADZONE = 0.18;   // igual que GamepadManager.DEADZONE
  var TRIGGER_ON = 0.5;  // igual que GamepadManager.TRIGGER_ON

  var pad = { mx: 0, my: 0, lx: 0, ly: 0, run: false };
  var pressed = {};        // estado anterior de cada boton
  var connectedIndex = -1;
  var connectedName = '';
  var rafId = 0;
  var running = false;

  function dead(v) {
    return Math.abs(v) < DEADZONE ? 0 : v;
  }

  function clamp(v, a, b) {
    return v < a ? a : (v > b ? b : v);
  }

  function inArena() {
    return document.body.classList.contains('ras-arena');
  }

  /* B/Start en Android es "pause"; en la partida ese boton no hace nada
     porque el atras real es el boton fisico del telefono. iPhone no tiene
     ese boton, asi que en la partida se reenvia al mismo manejador que usa
     Android para atras (confirmar salida / volver a jugar al terminar). */
  function sendAction(action) {
    if (!window.RasmaticInput || typeof window.RasmaticInput.press !== 'function') return false;
    /* X = menu. En iOS el dock original esta oculto (no existe en la app),
       asi que el menu real es el panel VR: ajustes, activar y salir. */
    if (action === 'menu' && window.RasmaticVR && typeof window.RasmaticVR.panel === 'function') {
      window.RasmaticVR.panel();
      return true;
    }
    if (action === 'pause' && inArena() && window.RasmaticAndroid &&
        typeof window.RasmaticAndroid.onBack === 'function') {
      return window.RasmaticAndroid.onBack() === true;
    }
    return window.RasmaticInput.press(action) === true;
  }

  function readGamepad() {
    /* Gancho de pruebas: permite inyectar un mando sin hardware real. */
    if (window.__rasFakePad) return window.__rasFakePad;
    if (!navigator.getGamepads) return null;
    var list;
    try { list = navigator.getGamepads(); } catch (e) { return null; }
    if (!list) return null;
    var first = null;
    for (var i = 0; i < list.length; i++) {
      var g = list[i];
      if (!g || !g.connected) continue;
      if (i === connectedIndex) return g;
      if (!first) first = g;
    }
    return first;
  }

  function announce(g) {
    if (!g) {
      if (connectedIndex !== -1) {
        connectedIndex = -1;
        connectedName = '';
        pad.mx = pad.my = pad.lx = pad.ly = 0;
        pad.run = false;
        pushInput(true);
        if (window.RasmaticInput && window.RasmaticInput.gamepadStatus) {
          window.RasmaticInput.gamepadStatus(false, '');
        }
        toast('Mando desconectado');
      }
      return;
    }
    if (g.index === connectedIndex) return;
    connectedIndex = g.index;
    connectedName = g.id || 'Mando';
    if (window.RasmaticInput && window.RasmaticInput.gamepadStatus) {
      window.RasmaticInput.gamepadStatus(true, connectedName);
    }
    toast('Mando conectado: ' + connectedName);
  }

  var lastPushed = '';

  function pushInput(force) {
    if (!window.RasmaticInput || typeof window.RasmaticInput.gamepad !== 'function') return;
    var state = {
      mx: +pad.mx.toFixed(3),
      my: +pad.my.toFixed(3),
      lx: +pad.lx.toFixed(3),
      ly: +pad.ly.toFixed(3),
      run: pad.run === true
    };
    var key = state.mx + '|' + state.my + '|' + state.lx + '|' + state.ly + '|' + state.run;
    if (!force && key === lastPushed) return;
    lastPushed = key;
    window.RasmaticInput.gamepad(state);
  }

  function poll() {
    rafId = 0;
    if (!running) return;
    var g = readGamepad();
    announce(g);

    if (g) {
      var ax = g.axes || [];
      var bt = g.buttons || [];

      /* Stick izquierdo: mueve. Stick derecho: mira.
         En el estandar W3C el eje Y crece hacia abajo, por eso se invierte
         (Android hace lo mismo con -AXIS_Y). */
      var mx = dead(ax[0] || 0);
      var my = -dead(ax[1] || 0);
      var lx = dead(ax[2] || 0);
      var ly = -dead(ax[3] || 0);

      /* Cruceta: movimiento digital, igual que en Android (dpadX/dpadY). */
      var dpadX = (bt[15] && bt[15].pressed ? 1 : 0) - (bt[14] && bt[14].pressed ? 1 : 0);
      var dpadY = (bt[12] && bt[12].pressed ? 1 : 0) - (bt[13] && bt[13].pressed ? 1 : 0);
      mx = clamp(mx + dpadX, -1, 1);
      my = clamp(my + dpadY, -1, 1);

      /* Correr: L1 mantenido o gatillo L2 a fondo (Android: L1/L2 y AXIS_Z). */
      var l1 = !!(bt[4] && bt[4].pressed);
      var l2 = !!(bt[6] && (bt[6].pressed || (bt[6].value || 0) >= TRIGGER_ON));
      var run = l1 || l2;

      if (mx !== pad.mx || my !== pad.my || lx !== pad.lx || ly !== pad.ly || run !== pad.run) {
        pad.mx = mx; pad.my = my; pad.lx = lx; pad.ly = ly; pad.run = run;
        pushInput(false);
      }

      /* Botones discretos: se disparan al pasar de suelto a pulsado. */
      for (var idx in BUTTON_ACTIONS) {
        if (!Object.prototype.hasOwnProperty.call(BUTTON_ACTIONS, idx)) continue;
        var b = bt[Number(idx)];
        var down = !!(b && (b.pressed || (b.value || 0) >= TRIGGER_ON));
        if (down && !pressed[idx]) sendAction(BUTTON_ACTIONS[idx]);
        pressed[idx] = down;
      }
    }

    if (DEBUG) updateDebug(g);
    rafId = requestAnimationFrame(poll);
  }

  function startPolling() {
    if (running) return;
    running = true;
    if (!rafId) rafId = requestAnimationFrame(poll);
  }

  function stopPolling() {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    pressed = {};
    pad.mx = pad.my = pad.lx = pad.ly = 0;
    pad.run = false;
    pushInput(true);
  }

  window.addEventListener('gamepadconnected', function (e) {
    if (NATIVE) return;
    if (e.gamepad && e.gamepad.index !== connectedIndex) {
      connectedIndex = -1;   // fuerza el aviso con el nombre real
      announce(e.gamepad);
    }
    startPolling();
  });

  window.addEventListener('gamepaddisconnected', function () {
    if (NATIVE) return;
    connectedIndex = -1;
    connectedName = '';
    announce(null);
  });

  /* iOS entrega los mandos solo tras un toque en la pagina; el bucle arranca
     al primer gesto y sigue vivo mientras la app este visible. */
  if (!NATIVE) {
    ['touchstart', 'pointerdown', 'click'].forEach(function (name) {
      window.addEventListener(name, startPolling, { passive: true });
    });
  }

  document.addEventListener('visibilitychange', function () {
    if (NATIVE) return;
    if (document.hidden) stopPolling();
    else startPolling();
  });

  /* ---------------- Mando nativo (GameController de la app iOS) ---------------- */

  /* Swift llama a estas funciones con el mando ya normalizado (PS4/PS5/Xbox).
     Los valores de los sticks llegan en milesimas enteras para no depender
     del separador decimal del idioma. */
  var nativeConnected = false;

  function nativeStatus(connected, name) {
    var on = connected === true || connected === 1;
    if (!on) {
      if (!nativeConnected) return;
      nativeConnected = false;
      connectedIndex = -1;
      connectedName = '';
      pad.mx = pad.my = pad.lx = pad.ly = 0;
      pad.run = false;
      pushInput(true);
      if (window.RasmaticInput && window.RasmaticInput.gamepadStatus) {
        window.RasmaticInput.gamepadStatus(false, '');
      }
      toast('Mando desconectado');
      return;
    }
    nativeConnected = true;
    connectedIndex = -2;          // distinto de cualquier indice de Gamepad API
    connectedName = String(name || 'Mando');
    if (window.RasmaticInput && window.RasmaticInput.gamepadStatus) {
      window.RasmaticInput.gamepadStatus(true, connectedName);
    }
    toast('Mando conectado: ' + connectedName);
  }

  function nativeRaw(text) {
    if (typeof text !== 'string') return false;
    var p = text.split(',');
    if (p.length < 5) return false;
    var mx = Number(p[0]) / 1000;
    var my = Number(p[1]) / 1000;
    var lx = Number(p[2]) / 1000;
    var ly = Number(p[3]) / 1000;
    if (!isFinite(mx) || !isFinite(my) || !isFinite(lx) || !isFinite(ly)) return false;
    pad.mx = clamp(mx, -1, 1);
    pad.my = clamp(my, -1, 1);
    pad.lx = clamp(lx, -1, 1);
    pad.ly = clamp(ly, -1, 1);
    pad.run = Number(p[4]) === 1;
    pushInput(false);
    return true;
  }

  function nativeUpdate(mx, my, lx, ly, run) {
    var milli = function (v) { return Math.round(Number(v) * 1000) || 0; };
    return nativeRaw([milli(mx), milli(my), milli(lx), milli(ly), run ? 1 : 0].join(','));
  }

  if (NATIVE) {
    window.RasmaticNativeGamepad = {
      raw: nativeRaw,
      update: nativeUpdate,
      press: sendAction,
      status: nativeStatus,
      debug: function () {
        return {
          native: true,
          connected: nativeConnected,
          name: connectedName,
          pad: { mx: pad.mx, my: pad.my, lx: pad.lx, ly: pad.ly, run: pad.run }
        };
      }
    };
  }

  /* ---------------- Diagnostico ---------------- */

  var debugEl = null;

  function updateDebug(g) {
    if (!debugEl) {
      debugEl = document.createElement('div');
      debugEl.id = 'ras-pad-debug';
      document.body.appendChild(debugEl);
    }
    debugEl.textContent = g
      ? ('PAD ' + (g.index + 1) + ' ' + (g.mapping || '?') + '\n' +
         'mx ' + pad.mx.toFixed(2) + '  my ' + pad.my.toFixed(2) + '\n' +
         'lx ' + pad.lx.toFixed(2) + '  ly ' + pad.ly.toFixed(2) + '\n' +
         'run ' + (pad.run ? 'ON' : 'off'))
      : 'PAD sin conectar';
  }

  window.RasmaticIOS = {
    version: VERSION,
    /* Solo lectura: usado por tools/test-web.js y para soporte. */
    debug: function () {
      return {
        version: VERSION,
        ios: root.classList.contains('ras-ios'),
        native: NATIVE,
        nativeConnected: nativeConnected,
        connected: connectedIndex !== -1,
        padIndex: connectedIndex,
        padName: connectedName,
        polling: running,
        pad: { mx: pad.mx, my: pad.my, lx: pad.lx, ly: pad.ly, run: pad.run },
        gamepads: navigator.getGamepads ? navigator.getGamepads().length : -1
      };
    },
    /* Permite a las pruebas inyectar un mando sin hardware real. */
    _sendAction: sendAction,
    _pushInput: pushInput
  };
})();
