/* ============================================================
   RASMATIC Android - puente de entrada y controles tactiles
   ============================================================
   - Joystick analogico (movimiento) + zona tactil de camara original.
   - Boton de correr, pausa y menu de pausa.
   - Recepcion acotada del mando fisico enviada por Kotlin:
       window.RasmaticInput.gamepad({mx,my,lx,ly,run})
       window.RasmaticInput.press('interact'|'pause'|'menu'|'home'|'dock')
       window.RasmaticInput.gamepadStatus(boolean, nombre)
   - Guardado por trozos del video de MediaRecorder via RasmaticNative.
   ============================================================ */
(function () {
  'use strict';

  document.documentElement.classList.add('ras-android');

  const native = window.RasmaticNative || null;
  const touch = { mx: 0, my: 0, run: false };
  const pad = { mx: 0, my: 0, lx: 0, ly: 0, run: false };
  const view = { paused: false, manualPause: false, stickId: null, cx: 0, cy: 0, radius: 1 };
  let core = null;
  let stickEl = null;
  let knobEl = null;
  let runEl = null;
  let pauseEl = null;
  let badgeEl = null;

  const clamp = function (v) { return Math.max(-1, Math.min(1, v)); };
  const num = function (v) { return typeof v === 'number' && isFinite(v) ? clamp(v) : 0; };

  /* En la partida la interfaz no es modal: el joystick siempre responde y el
     menu de destinos ya no existe. */
  function inArena() {
    return document.body.classList.contains('ras-arena');
  }

  /* Solo los paneles que de verdad detienen la experiencia bloquean al
     personaje: bienvenida, pausa y modo juego. El menu de destinos y el panel
     de informacion son no modales en el original (se puede seguir caminando
     con ellos abiertos), asi que tampoco bloquean el mando ni el joystick. */
  function blockingMenu() {
    if (inArena()) return false;
    return (pauseEl && !pauseEl.hidden) ||
      document.body.classList.contains('intro') ||
      document.body.classList.contains('ras-game');
  }

  function dockOpen() {
    if (inArena()) return false;
    return document.body.classList.contains('place') &&
      !document.body.classList.contains('dockmin');
  }

  /* Cualquier panel abierto (modal o no) cancela stick tactil y CORRER. */
  function panelOpen() {
    return blockingMenu() || dockOpen();
  }

  /* Pide a Kotlin que reenvie el estado analogico actual. */
  function requestPadResync() {
    if (!native || typeof native.resyncGamepad !== 'function') return;
    try { native.resyncGamepad(); } catch (e) {}
  }

  function applyInput() {
    if (!core) return;
    /* Prioridad explicita: si el mando fisico mueve su stick, manda el mando;
       si esta en reposo, manda el joystick tactil. Sumarlos duplicaba la
       velocidad y podia producir diagonales inesperadas. */
    const menu = blockingMenu();
    const padActive = Math.hypot(pad.mx, pad.my) > 0.001;
    const running = !menu && (touch.run || pad.run);
    core.input({
      mx: menu ? 0 : (padActive ? pad.mx : touch.mx),
      my: menu ? 0 : (padActive ? pad.my : touch.my),
      lx: menu ? 0 : pad.lx,
      ly: menu ? 0 : pad.ly,
      run: running
    });
    /* El boton refleja el estado real, venga del toque o del gatillo/L1. */
    if (runEl) {
      runEl.classList.toggle('on', running);
      runEl.setAttribute('aria-pressed', running ? 'true' : 'false');
    }
  }

  function resetRunUi() {
    touch.run = false;
    pad.run = false;
    if (runEl) {
      runEl.classList.remove('on');
      runEl.setAttribute('aria-pressed', 'false');
    }
  }

  function resetStick() {
    view.stickId = null;
    touch.mx = 0;
    touch.my = 0;
    if (view.radius) setKnob(0, 0, view.radius);
  }

  function el(tag, attrs, text) {
    const node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    if (text) node.textContent = text;
    return node;
  }

  /* ---------------- Joystick ---------------- */

  function setKnob(dx, dy, radius) {
    if (!knobEl) return;
    knobEl.style.transform = 'translate(' + (dx * radius * 0.62) + 'px,' + (dy * radius * 0.62) + 'px)';
  }

  function updateStick(clientX, clientY) {
    let dx = (clientX - view.cx) / view.radius;
    let dy = (clientY - view.cy) / view.radius;
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    setKnob(dx, dy, view.radius);

    const dead = 0.14;
    const mag = Math.hypot(dx, dy);
    if (mag > dead) {
      const n = (mag - dead) / (1 - dead);
      touch.mx = clamp(dx / mag * n);
      touch.my = clamp(-dy / mag * n); // pantalla: arriba = avanzar
    } else {
      touch.mx = 0;
      touch.my = 0;
    }
    applyInput();
  }

  function releaseStick(ev) {
    if (view.stickId === null || (ev && ev.pointerId !== undefined && ev.pointerId !== view.stickId)) return;
    view.stickId = null;
    touch.mx = 0;
    touch.my = 0;
    setKnob(0, 0, view.radius);
    applyInput();
  }

  function buildTouchUi() {
    const layer = el('div', { id: 'ras-touch' });

    stickEl = el('div', {
      id: 'ras-stick',
      role: 'application',
      'aria-label': 'Joystick de movimiento'
    });
    knobEl = el('div', { id: 'ras-knob' });
    stickEl.appendChild(knobEl);

    stickEl.addEventListener('pointerdown', function (e) {
      if (view.paused || blockingMenu()) return;
      /* Un segundo dedo no debe robar el joystick ya activo. */
      if (view.stickId !== null) return;
      const r = stickEl.getBoundingClientRect();
      view.stickId = e.pointerId;
      view.cx = r.left + r.width / 2;
      view.cy = r.top + r.height / 2;
      view.radius = r.width / 2;
      try { stickEl.setPointerCapture(e.pointerId); } catch (err) {}
      updateStick(e.clientX, e.clientY);
      e.preventDefault();
      e.stopPropagation();
    });
    stickEl.addEventListener('pointermove', function (e) {
      if (e.pointerId !== view.stickId) return;
      updateStick(e.clientX, e.clientY);
      e.preventDefault();
      e.stopPropagation();
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (type) {
      stickEl.addEventListener(type, function (e) {
        releaseStick(e);
        e.preventDefault();
        e.stopPropagation();
      });
    });

    runEl = el('div', {
      id: 'ras-run',
      role: 'button',
      'aria-label': 'Correr',
      'aria-pressed': 'false'
    }, 'CORRER');
    runEl.addEventListener('pointerdown', function (e) {
      touch.run = !touch.run;
      runEl.classList.toggle('on', touch.run);
      runEl.setAttribute('aria-pressed', touch.run ? 'true' : 'false');
      applyInput();
      e.preventDefault();
      e.stopPropagation();
    });

    layer.appendChild(stickEl);
    layer.appendChild(runEl);
    document.body.appendChild(layer);

    const pauseBtn = el('button', {
      id: 'ras-pause-btn',
      type: 'button',
      'aria-label': 'Pausa'
    });
    pauseBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
    pauseBtn.addEventListener('click', function (e) {
      e.preventDefault();
      openPause();
    });
    document.body.appendChild(pauseBtn);

    badgeEl = el('div', { id: 'ras-pad-badge', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(badgeEl);
  }

  /* ---------------- Pausa ---------------- */

  function buildPauseUi() {
    pauseEl = el('div', { id: 'ras-pause', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Pausa' });
    pauseEl.hidden = true;
    pauseEl.innerHTML =
      '<div class="ras-card">' +
        '<h2>PAUSA</h2>' +
        '<p class="ras-sub">RASMATIC · Almacén inteligente</p>' +
        '<button type="button" class="pri" data-act="resume">Continuar</button>' +
        '<button type="button" data-act="home">Volver al inicio</button>' +
        '<button type="button" data-act="exit">Salir</button>' +
        '<p class="ras-help">Mando: stick izq. mover · stick der. cámara · A interactuar<br>' +
        'Táctil: joystick izq. · arrastrá el resto de la pantalla para mirar</p>' +
      '</div>';
    pauseEl.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.getAttribute('data-act');
      if (act === 'resume') {
        setPaused(false, false);
      } else if (act === 'home') {
        setPaused(false, false);
        if (core) core.home();
      } else if (act === 'exit') {
        if (native && native.exitApp) native.exitApp();
        else window.close();
      }
    });
    document.body.appendChild(pauseEl);
  }

  function refreshModeButtons() {
    if (!pauseEl) return;
    const current = window.RasmaticModes ? window.RasmaticModes.current() : 'original';
    pauseEl.querySelectorAll('[data-mode]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-mode') === current);
    });
  }

  function openPause() {
    if (!core || document.body.classList.contains('intro')) return;
    if (inArena()) return;          // la partida no usa el menu de pausa
    /* B / Start / Escape alternan: si ya esta abierto, reanuda. */
    if (view.paused) {
      setPaused(false, false);
      return;
    }
    setPaused(true, true);
  }

  function setPaused(value, manual) {
    if (!core) return;
    view.paused = value;
    if (!value) view.manualPause = false;
    else if (manual) view.manualPause = true;
    if (value) {
      core.pause();
      core.resetInput();
      resetStick();
      /* No se borra el estado del mando: al reanudar se reaplica tal cual.
         Borrarlo hacia que, con el stick quieto, no llegara ningun evento
         nuevo y el personaje quedara sin responder. */
      resetRunUi();
      refreshModeButtons();
    } else {
      if (pauseEl && pauseEl.contains(document.activeElement)) document.activeElement.blur();
      core.resume();
    }
    document.body.classList.toggle('ras-paused', value);
    if (pauseEl) pauseEl.hidden = !value;
    if (value && pauseEl) {
      const b = pauseEl.querySelector('[data-act="resume"]');
      if (b) b.focus({ preventScroll: true });
    }
    /* Al reanudar, ya con el panel cerrado, se reaplica el mando. */
    if (!value) {
      applyInput();
      requestPadResync();
    }
  }

  /* ---------------- Mando fisico ---------------- */

  function gamepadStatus(connected, name) {
    /* Con mando conectado se ocultan los controles tactiles de movimiento:
       el usuario pidio una pantalla mas limpia. */
    document.body.classList.toggle('ras-pad-on', !!connected);
    if (!badgeEl) return;
    if (connected) {
      badgeEl.textContent = '🎮 ' + (name || 'Mando conectado');
      badgeEl.classList.add('on');
    } else {
      badgeEl.classList.remove('on');
      badgeEl.textContent = '';
      pad.mx = 0; pad.my = 0; pad.lx = 0; pad.ly = 0; pad.run = false;
      applyInput();
    }
  }

  function focusables(root) {
    if (!root) return [];
    return Array.from(root.querySelectorAll('button:not([disabled]),[role="button"]'))
      .filter(function (b) { return b.getClientRects().length > 0; });
  }

  function moveFocus(list, delta) {
    if (!list.length) return false;
    let i = list.indexOf(document.activeElement);
    if (i < 0) i = delta > 0 ? -1 : 0;
    i = (i + delta + list.length) % list.length;
    list[i].focus({ preventScroll: true });
    return true;
  }

  function activateFocused(root) {
    let a = document.activeElement;
    if (!a || !root || !root.contains(a)) {
      const list = focusables(root);
      if (!list.length) return false;
      a = list[0];
      a.focus({ preventScroll: true });
    }
    if (typeof a.click !== 'function') return false;
    a.click();
    return true;
  }

  function press(action) {
    /* En la partida solo hay una accion contextual: la tecla A / boton tactil
       interactuan con el encargado, con el medicamento o con el mostrador.
       Pausa, menu y destinos ya no existen. */
    if (inArena()) {
      if (action === 'interact') {
        return !!(window.RasmaticGame && window.RasmaticGame.interact());
      }
      if (action === 'pause' || action === 'menu' || action === 'dock' ||
          action === 'home' ||
          (typeof action === 'string' && action.indexOf('nav') === 0)) {
        return true;
      }
      return false;
    }

    /* Punto de extension: un modo futuro puede interceptar las acciones
       discretas del mando antes que la experiencia original. */
    const mode = window.RasmaticModes && window.RasmaticModes.get
      ? window.RasmaticModes.get(window.RasmaticModes.current())
      : null;
    if (mode && typeof mode.onAction === 'function') {
      try { if (mode.onAction(action)) return true; } catch (e) { console.error('[modes] onAction', e); }
    }
    if (!core) return false;

    const pauseOpen = !!(pauseEl && !pauseEl.hidden);
    const gameOpen = document.body.classList.contains('ras-game');
    const infoOpen = document.body.classList.contains('info');
    const introOpen = document.body.classList.contains('intro');
    const dockIsOpen = dockOpen();

    switch (action) {
      case 'interact':
        /* La bienvenida es modal, pero con mando se tiene que poder empezar:
           sin esto, un usuario con solo mando quedaba trabado ahi. */
        if (introOpen) {
          const b = document.getElementById('goFree') ||
            focusables(document.getElementById('intro'))[0];
          if (b) { b.click(); return true; }
          return false;
        }
        if (pauseOpen) return activateFocused(pauseEl);
        if (gameOpen) return activateFocused(document.getElementById('ras-game'));
        if (infoOpen) { core.closeOverlays(); return true; }
        if (dockIsOpen) {
          const f = document.activeElement;
          if (f && f.closest && f.closest('#dock')) { f.click(); return true; }
          return false;
        }
        return core.interact() !== 'none';

      case 'pause':
        if (pauseOpen) { setPaused(false, false); return true; }
        if (infoOpen) { core.closeOverlays(); return true; }
        openPause();
        return true;

      case 'menu':
      case 'dock':
        if (pauseOpen) { setPaused(false, false); return true; }
        core.toggleDock();
        return true;

      case 'home':
        core.home();
        return true;

      case 'navUp':
      case 'navDown':
      case 'navLeft':
      case 'navRight': {
        const back = (action === 'navUp' || action === 'navLeft') ? -1 : 1;
        if (introOpen) return moveFocus(focusables(document.getElementById('intro')), back);
        if (pauseOpen) return moveFocus(focusables(pauseEl), back);
        if (gameOpen) return moveFocus(focusables(document.getElementById('ras-game')), back);
        if (dockIsOpen) return moveFocus(focusables(document.getElementById('dock')), back);
        return false;
      }

      default:
        return false;
    }
  }

  window.RasmaticInput = {
    gamepad: function (s) {
      if (!s || typeof s !== 'object') return;
      pad.mx = num(s.mx);
      pad.my = num(s.my);
      pad.lx = num(s.lx);
      pad.ly = num(s.ly);
      pad.run = s.run === true;
      applyInput();
    },
    press: press,
    gamepadStatus: gamepadStatus,
    /* Solo lectura, para diagnostico y pruebas automatizadas. */
    debug: function () {
      return {
        touch: { mx: touch.mx, my: touch.my, run: touch.run },
        pad: { mx: pad.mx, my: pad.my, lx: pad.lx, ly: pad.ly, run: pad.run },
        paused: view.paused,
        manualPause: view.manualPause,
        stickId: view.stickId,
        blocking: blockingMenu(),
        dockOpen: dockOpen(),
        resync: !!(native && typeof native.resyncGamepad === 'function')
      };
    }
  };

  /* ---------------- API para Kotlin ---------------- */

  window.RasmaticAndroid = {
    onAppPause: function () {
      if (!core) return;
      view.paused = true;
      core.pause();
      core.resetInput();
      resetStick();
      resetRunUi();
    },
    onAppResume: function () {
      if (!core) return;
      const inGame = window.RasmaticModes && window.RasmaticModes.current() === 'game';
      if (!view.manualPause && !inGame) {
        view.paused = false;
        core.resume();
      }
      applyInput();
      requestPadResync();
    },
    onBack: function () {
      if (!core) return false;
      /* En la partida el boton atras no cierra la app de golpe: primero pide
         confirmacion (o reinicia si la partida ya termino). */
      if (inArena() && window.RasmaticGame && window.RasmaticGame.onBack) {
        return window.RasmaticGame.onBack() === true;
      }
      if (pauseEl && !pauseEl.hidden) {
        setPaused(false, false);
        return true;
      }
      if (document.body.classList.contains('ras-game')) {
        window.RasmaticModes.enter('original');
        return true;
      }
      if (core.closeOverlays()) return true;
      /* Atras con el menu de destinos abierto lo minimiza; antes cerraba la app. */
      if (document.body.classList.contains('place') &&
          !document.body.classList.contains('intro') &&
          !document.body.classList.contains('dockmin')) {
        core.setDock(false);
        return true;
      }
      return false;
    }
  };

  /* ---------------- Grabacion de video ---------------- */

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      const fr = new FileReader();
      fr.onload = function () {
        const s = String(fr.result);
        const i = s.indexOf(',');
        resolve(i >= 0 ? s.slice(i + 1) : '');
      };
      fr.onerror = function () { reject(fr.error || new Error('FileReader')); };
      fr.readAsDataURL(blob);
    });
  }

  window.RasmaticSaveVideo = async function (blob, name) {
    if (!native || !native.beginRecording) return false;
    if (!native.beginRecording(name)) {
      native.toast('No se pudo iniciar el guardado del video');
      return false;
    }
    const CHUNK = 384 * 1024;
    try {
      for (let offset = 0; offset < blob.size; offset += CHUNK) {
        const b64 = await blobToBase64(blob.slice(offset, offset + CHUNK));
        if (!native.appendRecording(b64)) throw new Error('chunk rechazado');
      }
      const path = native.endRecording();
      if (!path) throw new Error('archivo vacio');
      return path;
    } catch (e) {
      console.error('[rec]', e);
      native.abortRecording();
      native.toast('No se pudo guardar el video');
      return false;
    }
  };

  /* ---------------- Sustituto de click en Android ----------------
     Con render pesado el WebView puede tardar >500 ms entre pointerdown y
     pointerup; Chromium lo interpreta como pulsacion larga y NO sintetiza
     click, asi que los menus del HTML original dejaban de responder.
     Aqui se adelanta el click en pointerup y se descarta el click nativo
     tardio para no ejecutar la accion dos veces. */
  function installTapFallback() {
    let down = null;
    let swallowUntil = 0;
    let synthesizing = false;
    const SLOP = 14;

    document.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;
      if (e.target && e.target.closest && e.target.closest('#ras-touch')) return;
      down = { id: e.pointerId, x: e.clientX, y: e.clientY, target: e.target };
    }, true);

    document.addEventListener('pointercancel', function () { down = null; }, true);

    document.addEventListener('pointerup', function (e) {
      const d = down;
      down = null;
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (dx * dx + dy * dy > SLOP * SLOP) return;
      const t = d.target;
      const btn = t && t.closest
        ? t.closest('button,[role="button"],a[href],[data-act],[data-mode],[data-v]')
        : null;
      if (!btn || (btn.closest && btn.closest('#ras-touch'))) return;
      /* El click nativo llegara despues (o no llegara): se adelanta uno. */
      swallowUntil = performance.now() + 2000;
      synthesizing = true;
      try { btn.click(); } finally { synthesizing = false; }
    }, true);

    document.addEventListener('click', function (e) {
      if (synthesizing) return;
      if (e.isTrusted && performance.now() < swallowUntil) {
        swallowUntil = 0;
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    }, true);
  }

  /* El radio del joystick cambia con la orientacion; recentrar el knob. */
  function installResizeGuard() {
    addEventListener('resize', function () {
      if (!stickEl || view.stickId !== null) return;
      const r = stickEl.getBoundingClientRect();
      if (r.width > 0) {
        view.radius = r.width / 2;
        setKnob(0, 0, view.radius);
      }
    });
  }

  /* Al abrir cualquier panel se cancelan el stick tactil y CORRER, para que
     al cerrarlo el personaje no salga corriendo ni desplazandose solo. Al
     cerrarse se reaplica el estado del mando fisico (que no se borra) y se
     pide a Kotlin que lo reenvie, porque un stick quieto no genera eventos. */
  function installMenuGuard() {
    let wasOpen = panelOpen();
    const obs = new MutationObserver(function () {
      const open = panelOpen();
      if (open) {
        resetStick();
        resetRunUi();
        if (core) core.resetInput();
      }
      if (open === wasOpen) return;
      wasOpen = open;
      if (!open) {
        applyInput();
        requestPadResync();
      }
    });
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  /* ---------------- Arranque ---------------- */

  function start() {
    core = window.RasmaticCore;
    if (!core) return;
    buildTouchUi();
    buildPauseUi();
    installTapFallback();
    installResizeGuard();
    installMenuGuard();
    /* En tactil las ayudas de teclado del cartel de bienvenida no aplican. */
    const keys = document.querySelector('#intro .keys');
    if (keys) {
      keys.textContent =
        'Joystick: mover · arrastrá la pantalla: mirar · CORRER: correr · mando: sticks y botones';
    }
    window.RasmaticModes.enter('original');
    window.RasmaticModes.onChange(refreshModeButtons);

    // Al salir de la app, liberar entradas para evitar movimientos fantasma.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) window.RasmaticAndroid.onAppPause();
      else window.RasmaticAndroid.onAppResume();
    });
  }

  if (window.RasmaticCore) {
    start();
  } else {
    let tries = 0;
    const timer = setInterval(function () {
      tries++;
      if (window.RasmaticCore) {
        clearInterval(timer);
        start();
      } else if (tries > 240) {
        clearInterval(timer);
        console.error('[ras] RasmaticCore no disponible');
      }
    }, 25);
  }
})();
