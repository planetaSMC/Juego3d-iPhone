/* Suite V19 (se ejecuta dentro de la página).
   Prueba la app cargada según window.RasmaticApp:
     - identidad, almacenamiento y opciones
     - joystick ACTIVADO/DESACTIVADO y mando Bluetooth intacto
     - V18, mecánicas y SBS
     - Head Tracking (nativo simulado o DeviceOrientation)
     - Classic: ausencia total de sensores
   Devuelve un informe JSON. No modifica archivos. */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  const ok = (name, cond, data) => out.push({ name, pass: !!cond, data });
  const D = () => window.RasmaticGame.debug();
  const G = () => window.RasmaticCore.game;
  const VR = () => window.RasmaticVR;
  const app = window.RasmaticApp || {};
  const HT = window.RasmaticHeadTracking || null;
  const SKEY = (k) => (window.RasmaticStore && typeof RasmaticStore.key === 'function')
    ? RasmaticStore.key(k) : k;

  const until = async (pred, ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try { if (await pred()) return true; } catch (e) { /* reintentar */ }
      await sleep(80);
    }
    return false;
  };

  function fireOrientation(yawRad, pitchRad, rollRad) {
    const native = window.RasmaticNativeHeadTracking;
    if (native && typeof native._feed === 'function') {
      native._feed(yawRad, pitchRad, rollRad);
      return true;
    }
    const DEG = Math.PI / 180;
    const plain = () => {
      try {
        const ev = new Event('deviceorientation');
        Object.defineProperty(ev, 'alpha', { value: yawRad / DEG });
        Object.defineProperty(ev, 'beta', { value: pitchRad / DEG });
        Object.defineProperty(ev, 'gamma', { value: rollRad / DEG });
        Object.defineProperty(ev, 'absolute', { value: true });
        window.dispatchEvent(ev);
        return true;
      } catch (e2) { return false; }
    };
    try {
      const ev = new DeviceOrientationEvent('deviceorientation', {
        alpha: yawRad / DEG,
        beta: pitchRad / DEG,
        gamma: rollRad / DEG,
        absolute: true
      });
      if (ev.alpha === null && ev.beta === null && ev.gamma === null) return plain();
      window.dispatchEvent(ev);
      return true;
    } catch (e) {
      return plain();
    }
  }

  try {
    /* Esperar la escena. */
    for (let i = 0; i < 160 && (!window.__ready || !window.RasmaticGame || D().state !== 'idle'); i++) {
      await sleep(120);
    }

    /* V19-01 identidad y prefijo. */
    ok('V19-01 identidad y prefijo de almacenamiento',
      !!app.id && !!app.name && typeof app.headTracking === 'boolean' &&
      document.documentElement.getAttribute('data-app') === app.id &&
      !!app.storagePrefix && SKEY('rasmatic.joystick') ===
        (app.headTracking ? 'rasmatic.joystick' : 'rasmatic.classic.joystick'),
      { app, key: SKEY('rasmatic.joystick') });

    /* Abrir Opciones (solo en idle). */
    const optsBtn = document.getElementById('rg-opts-btn');
    if (optsBtn) optsBtn.click();
    await sleep(120);
    const optsPanel = document.getElementById('rg-opts');
    const joyBtn = document.getElementById('rg-opt-joy');
    ok('V19-02 opción JOYSTICK presente',
      !!optsPanel && optsPanel.classList.contains('on') && !!joyBtn &&
      joyBtn.getAttribute('role') === 'switch' &&
      /ACTIVADO|DESACTIVADO/.test(joyBtn.textContent),
      { texto: joyBtn && joyBtn.textContent });

    const stick = document.getElementById('ras-stick');
    const stickRect = stick ? stick.getBoundingClientRect() : null;
    if (stick && stickRect) {
      stick.dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: 7, pointerType: 'touch', bubbles: true,
        clientX: stickRect.left + stickRect.width / 2 + 32,
        clientY: stickRect.top + stickRect.height / 2
      }));
      stick.dispatchEvent(new PointerEvent('pointermove', {
        pointerId: 7, pointerType: 'touch', bubbles: true,
        clientX: stickRect.left + stickRect.width / 2 + 32,
        clientY: stickRect.top + stickRect.height / 2
      }));
    }
    await sleep(100);
    const touchOn = window.RasmaticInput ? RasmaticInput.debug().touch : { mx: 0, my: 0 };
    ok('V19-03 joystick activo recibe el toque',
      Math.hypot(touchOn.mx, touchOn.my) > 0.05, touchOn);

    /* Desactivar. */
    if (joyBtn) joyBtn.click();
    await sleep(150);
    const dbgOff = window.RasmaticInput ? RasmaticInput.debug() : null;
    const stickDisp = stick ? getComputedStyle(stick).display : null;
    ok('V19-04 joystick desactivado oculta e ignora entradas',
      window.RasmaticGame.getJoystick() === false &&
      document.body.classList.contains('ras-no-joystick') &&
      stickDisp === 'none' &&
      !!dbgOff && dbgOff.joystick === false &&
      Math.hypot(dbgOff.touch.mx, dbgOff.touch.my) === 0,
      { stickDisp, dbg: dbgOff });

    ok('V19-05 joystick se guarda con la clave de esta app',
      localStorage.getItem(SKEY('rasmatic.joystick')) === 'off',
      { key: SKEY('rasmatic.joystick'),
        value: localStorage.getItem(SKEY('rasmatic.joystick')) });

    /* El mando Bluetooth no se ve afectado: además del estado del puente,
       se comprueba que el personaje se mueva de verdad con el joystick
       táctil desactivado. */
    if (window.RasmaticInput && G()) {
      G().player.x = 0;
      G().player.z = 30;
      await sleep(250);
      const z0 = G().player.z;
      RasmaticInput.gamepad({ mx: 0, my: 1, lx: 0, ly: 0, run: false });
      let z1 = z0;
      for (let i = 0; i < 20 && z1 > z0 - 0.3; i++) {
        await sleep(100);
        z1 = G().player.z;
      }
      const pad = RasmaticInput.debug().pad;
      RasmaticInput.gamepad({ mx: 0, my: 0, lx: 0, ly: 0, run: false });
      await sleep(80);
      ok('V19-06 mando Bluetooth sigue moviendo con joystick off',
        Math.abs(pad.my - 1) < 0.01 && z1 < z0 - 0.3,
        { pad, z0: +z0.toFixed(2), z1: +z1.toFixed(2) });
    } else {
      ok('V19-06 mando Bluetooth sigue moviendo con joystick off', false,
        { error: 'RasmaticInput o RasmaticCore.game no disponible' });
    }

    /* Reactivar. */
    if (joyBtn) joyBtn.click();
    await sleep(150);
    const stickDisp2 = stick ? getComputedStyle(stick).display : null;
    ok('V19-07 joystick activado vuelve al comportamiento actual',
      window.RasmaticGame.getJoystick() === true &&
      !document.body.classList.contains('ras-no-joystick') &&
      stickDisp2 !== 'none' &&
      localStorage.getItem(SKEY('rasmatic.joystick')) === 'on',
      { stickDisp2, value: localStorage.getItem(SKEY('rasmatic.joystick')) });

    /* Cerrar opciones. */
    const okBtn = document.getElementById('rg-opts-ok');
    if (okBtn) okBtn.click();
    await sleep(100);

    /* V18 y mecánicas compartidas. */
    const ui = window.RasmaticGame.ui.state();
    const dbg = D();
    ok('V19-08 personalización V18 y mecánicas intactas',
      ui.version === 1 && !!ui.profiles && !!ui.profiles.normal &&
      dbg.config.duration === 180 && dbg.stockP.length === 6 &&
      !!dbg.cnc && typeof dbg.cnc.x === 'number' &&
      !!window.RasmaticGame.getDifficulty(),
      { ui: ui.version, duration: dbg.config.duration, stock: dbg.stockP.length,
        cnc: dbg.cnc, difficulty: window.RasmaticGame.getDifficulty() });

    /* SBS: dos ojos, HUD duplicado, IPD/convergencia/intensidad. */
    VR().enable();
    await until(() => VR().state().active, 4000);
    await sleep(700);
    const vr0 = VR().state();
    ok('V19-09 SBS con dos ojos, HUD duplicado e IPD/convergencia',
      vr0.active === true && vr0.eyes.length === 2 &&
      vr0.mirrors.hud === true &&
      typeof vr0.settings.ipd === 'number' &&
      typeof vr0.settings.convergence === 'number' &&
      typeof vr0.settings.depth === 'number',
      { active: vr0.active, eyes: vr0.eyes.length, mirrors: vr0.mirrors,
        ipd: vr0.settings && vr0.settings.ipd,
        conv: vr0.settings && vr0.settings.convergence,
        depth: vr0.settings && vr0.settings.depth });

    if (app.headTracking) {
      /* ---------------- Head Tracking ---------------- */
      ok('V19-10 API de head tracking presente',
        !!HT && typeof HT.enable === 'function' && typeof HT.recenter === 'function' &&
        typeof HT.setSensitivity === 'function' && typeof HT.setSmoothing === 'function',
        HT ? HT.debug() : null);

      if (HT) {
        HT.disable();
        await sleep(250);

        /* Base y luego giro/inclinación reales (radianes). */
        fireOrientation(0, 0, 0);
        await HT.enable();
        await sleep(120);
        fireOrientation(0, 0, 0);
        await sleep(100);
        fireOrientation(0.45, 0.22, 0.06);
        await until(() => Math.abs(HT.orientation().yaw) > 0.08, 2500);
        const o1 = HT.orientation();
        ok('V19-11 girar e inclinar mueve la orientación',
          Math.abs(o1.yaw) > 0.08 && Math.abs(o1.pitch) > 0.03 && o1.blend > 0.2,
          { orientation: o1, debug: HT.debug() });

        const vrA = VR().state();
        const qA = vrA.eyes && vrA.eyes[0] ? vrA.eyes[0].quaternion.slice() : null;
        const qB0 = vrA.eyes && vrA.eyes[1] ? vrA.eyes[1].quaternion.slice() : null;
        fireOrientation(0.85, 0.32, 0.12);
        await sleep(700);
        const vrB = VR().state();
        const qB = vrB.eyes && vrB.eyes[0] ? vrB.eyes[0].quaternion.slice() : null;
        const qB1 = vrB.eyes && vrB.eyes[1] ? vrB.eyes[1].quaternion.slice() : null;
        const changed = (a, b) => !!a && !!b && a.some((v, i) => Math.abs(v - b[i]) > 0.0005);
        ok('V19-12 el offset llega al render SBS en los dos ojos',
          changed(qA, qB) && changed(qB0, qB1) &&
          !!vrB.head && vrB.head.lastQuat !== null,
          { qA, qB, qB0, qB1, head: vrB.head });

        /* Recentrar. */
        HT.recenter();
        await until(() => Math.abs(HT.orientation().yaw) < 0.06, 2500);
        const o2 = HT.orientation();
        ok('V19-13 recentrar vuelve al frente',
          Math.abs(o2.yaw) < 0.06 && Math.abs(o2.pitch) < 0.06, o2);

        /* Sensibilidad. */
        HT.setSensitivity(1);
        fireOrientation(0, 0, 0);
        await sleep(80);
        HT.recenter();
        await sleep(80);
        fireOrientation(0.4, 0.2, 0);
        await until(() => Math.abs(HT.orientation().yaw) > 0.3, 3000);
        const y1 = Math.abs(HT.orientation().yaw);
        HT.recenter();
        HT.setSensitivity(2);
        await sleep(80);
        /* Nueva muestra 0,4 rad por encima del nuevo centro: x2 = 0,8. */
        fireOrientation(0.8, 0.4, 0);
        await until(() => Math.abs(HT.orientation().yaw) > 0.6, 3000);
        const y2 = Math.abs(HT.orientation().yaw);
        ok('V19-14 sensibilidad ajustable',
          Math.abs(HT.getSensitivity() - 2) < 0.01 && y2 > y1 * 1.4,
          { y1, y2, sens: HT.getSensitivity() });

        /* Suavizado. */
        HT.setSmoothing(0.3);
        ok('V19-15 suavizado ajustable y persistido',
          Math.abs(HT.getSmoothing() - 0.3) < 0.001 &&
          localStorage.getItem(SKEY('rasmatic.ht.smoothing')) === '0.3',
          { smoothing: HT.getSmoothing(),
            key: SKEY('rasmatic.ht.smoothing'),
            value: localStorage.getItem(SKEY('rasmatic.ht.smoothing')) });

        /* Detección de ausencia de datos (no simula). */
        HT.disable();
        await sleep(250);
        await HT.enable();
        await sleep(2300);
        ok('V19-16 sin datos informa timeout y no inventa movimiento',
          HT.status() === 'timeout' || HT.status() === 'unsupported' ||
          HT.status() === 'denied',
          { status: HT.status(), orientation: HT.orientation() });

        /* Restaurar valores y estado activo. */
        HT.setSensitivity(1);
        HT.setSmoothing(0.12);
        fireOrientation(0, 0, 0);
        await HT.enable();
        await sleep(150);
      }
    } else {
      /* ---------------- Classic ---------------- */
      ok('V19-10 Classic no expone API de head tracking',
        !window.RasmaticHeadTracking && !window.RasmaticNativeHeadTracking &&
        !document.getElementById('ht-bar'),
        { headTracking: !!window.RasmaticHeadTracking,
          native: !!window.RasmaticNativeHeadTracking,
          bar: !!document.getElementById('ht-bar') });

      const scripts = [...document.querySelectorAll('script[src]')].map((s) => s.src);
      ok('V19-11 Classic no carga headtracking/',
        !scripts.some((s) => /headtracking/i.test(s)), { scripts });

      const htRow = document.getElementById('rg-opt-ht-row');
      ok('V19-12 Classic no muestra controles de head tracking',
        !htRow || htRow.hidden, { row: htRow && htRow.outerHTML });

      const vrA = VR().state();
      const qA = vrA.eyes && vrA.eyes[0] ? vrA.eyes[0].quaternion.slice() : null;
      fireOrientation(0.9, 0.4, 0.2);
      await sleep(600);
      const vrB = VR().state();
      const qB = vrB.eyes && vrB.eyes[0] ? vrB.eyes[0].quaternion.slice() : null;
      const same = !!qA && !!qB && qA.every((v, i) => Math.abs(v - qB[i]) < 0.0005);
      ok('V19-13 Classic ignora eventos de orientación',
        same && (!VR().state().head || VR().state().head === null),
        { qA, qB, head: VR().state().head });

      window.RasmaticGame.setJoystick(false);
      await sleep(120);
      ok('V19-14 claves de Classic aisladas de Head Tracking',
        localStorage.getItem('rasmatic.classic.joystick') === 'off' &&
        localStorage.getItem('rasmatic.joystick') === 'on',
        { classic: localStorage.getItem('rasmatic.classic.joystick'),
          ht: localStorage.getItem('rasmatic.joystick') });
    }

    VR().disable();
    await sleep(200);
  } catch (e) {
    ok('V19 excepción no controlada', false, { error: String(e && e.stack || e) });
  }

  return JSON.stringify({
    app: app.id,
    total: out.length,
    fails: out.filter((x) => !x.pass).length,
    out
  });
})();
