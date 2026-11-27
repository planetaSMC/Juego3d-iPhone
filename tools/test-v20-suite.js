/* Suite V20 (se ejecuta dentro de la página).
   Cubre identidad de app única, escena de farmacia, colisiones, tres modos,
   tres dificultades, joystick opcional, mando externo, Head Tracking y el
   puente de configuración VR que usa Windows. No simula sensores: si no hay
   muestras de Core Motion, solo se comprueba la configuración y el estado. */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const D = () => window.RasmaticGame.debug();
  const G = () => window.RasmaticCore.game;
  const PH = () => window.RasmaticPharmacyApi || (G() && G().pharmacy);
  const HT = () => window.RasmaticHeadTracking;
  const VR = () => window.RasmaticVR;
  const out = [];
  const ok = (name, cond, data) => out.push({ name, pass: !!cond, data });
  const until = async (pred, ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (pred()) return true;
      await sleep(120);
    }
    return false;
  };
  const tp = (x, z, yaw, pitch) => {
    const g = G();
    g.player.x = x; g.player.z = z;
    if (typeof yaw === 'number') g.player.yaw = yaw;
    if (typeof pitch === 'number') g.player.pitch = pitch;
  };
  const frames = async (n) => { for (let i = 0; i < n; i++) await sleep(90); };

  try {
    for (let i = 0; i < 120 && (!window.__ready || !window.RasmaticGame || D().state !== 'idle'); i++) {
      await sleep(250);
    }

    /* ---------------- V20-01: una sola app ---------------- */
    const app = window.RasmaticApp || {};
    const manifest = document.querySelector('link[rel="manifest"]');
    ok('V20-01 identidad única RASMATIC VR',
      app.id === 'v20' && app.name === 'RASMATIC VR' &&
      app.headTracking === true && app.storagePrefix === 'rasmatic.' &&
      document.documentElement.getAttribute('data-app') === 'v20' &&
      !!manifest && document.title.indexOf('RASMATIC') >= 0,
      { app, titulo: document.title, manifest: !!manifest });

    const legacy = ['web-classic', 'RasmaticClassic', 'RasmaticHeadTracking']
      .filter((n) => [...document.querySelectorAll('[src],[href]')]
        .some((e) => (e.getAttribute('src') || e.getAttribute('href') || '').indexOf(n) >= 0));
    ok('V20-02 sin referencias a las dos apps V19',
      legacy.length === 0 && !document.querySelector('script[src*="classic"]'),
      { referencias: legacy });

    /* ---------------- V20-03: escena de farmacia ---------------- */
    const ph = PH();
    const stationGap = (() => {
      let min = 1e9;
      const ss = ph ? ph.stations : [];
      for (let i = 0; i < ss.length; i++) {
        for (let j = i + 1; j < ss.length; j++) {
          min = Math.min(min, Math.hypot(ss[i].x - ss[j].x, ss[i].z - ss[j].z));
        }
      }
      return min;
    })();
    ok('V20-03 escena del HTML: farmacia completa',
      !!ph && ph.drugs.length === 15 && ph.shelves.length === 3 &&
      ph.stations.length === 6 && ph.machine.boxes.length === 30 &&
      ph.shelfBoxes.length >= 300 && Math.abs(ph.counter.x - 21.9) < 0.01 &&
      Math.abs(ph.counter.z - 12.7) < 0.01 && Math.abs(ph.eye - 3.6) < 0.01 &&
      Math.abs(ph.machine.root.position.x - 12.4) < 0.01,
      { medicamentos: ph && ph.drugs.length, estanterias: ph && ph.shelves.length,
        estaciones: ph && ph.stations.length, cajas_maquina: ph && ph.machine.boxes.length,
        cajas_estante: ph && ph.shelfBoxes.length, contador: ph && ph.counter,
        ojo: ph && ph.eye });

    ok('V20-04 seis estaciones separadas y con medicamento real',
      ph && ph.stations.length === 6 && stationGap >= 2.4 &&
      ph.stations.every((s) => s.drug >= 0 && ph.drugs[s.drug] && s.box && s.box.visible),
      { separacion_minima: +stationGap.toFixed(2),
        estaciones: ph && ph.stations.map((s) => ({
          color: s.color, drug: s.drug, nombre: ph.drugs[s.drug].name,
          x: +s.x.toFixed(2), z: +s.z.toFixed(2)
        })) });

    const info = G().renderer.info;
    const sceneMeshes = (() => {
      let n = 0; G().scene.traverse((o) => { if (o.isMesh) n++; }); return n;
    })();
    ok('V20-05 rendimiento del escenario (menos draw calls que el HTML)',
      info.render.calls > 100 && info.render.calls < 1200 &&
      info.render.triangles < 130000 && sceneMeshes > 300 &&
      info.memory.textures >= 8 && info.memory.textures < 80,
      { draw_calls: info.render.calls, triangulos: info.render.triangles,
        mallas: sceneMeshes, texturas: info.memory.textures,
        materiales: 'color sólido sin atlas' });

    /* ---------------- V20-06: colisiones del HTML ---------------- */
    const col = {
      inicio: ph.blocked(46.8, 9.4),
      fuera_izq: ph.blocked(0, 10),
      fuera_der: ph.blocked(54, 10),
      maquina: ph.blocked(12.4, 9.3),
      mostrador: ph.blocked(21.9, 10.3),
      abierto: ph.blocked(30, 20),
      cinta: ph.blocked(40.4, 7.1)
    };
    ok('V20-06 colisiones del HTML (sala, máquina, mostrador, cinta)',
      col.inicio === false && col.fuera_izq === true && col.fuera_der === true &&
      col.maquina === true && col.mostrador === true && col.abierto === false &&
      col.cinta === true, col);

    /* ---------------- V20-07: tres modos ---------------- */
    const core = window.RasmaticCore;
    const modes = [];
    for (const m of ['film', 'model', 'place']) {
      if (m === 'place') tp(46.8, 9.4, Math.PI / 2, -0.05);
      core.setMode(m);
      await frames(3);
      modes.push({
        mode: m, got: core.getMode(),
        body: document.body.classList.contains('v20-' + m),
        cam: [G().camera.position.x, G().camera.position.y, G().camera.position.z]
          .map((v) => +v.toFixed(2))
      });
    }
    const modesOk = modes.every((m) => m.mode === m.got && m.body) &&
      core.setMode('otro') === false && core.getMode() === 'place';
    ok('V20-07 recorrido guiado, modelo y lugar',
      modesOk && modes[0].cam[1] > 3 && modes[1].cam[1] > 3,
      { modos: modes, rechazo_modo_invalido: core.setMode('otro') === false });

    /* ---------------- V20-08: dificultades ---------------- */
    const diffIds = ['facil', 'normal', 'dificil'];
    const diffSeen = [];
    for (const id of diffIds) {
      window.RasmaticGame.setDifficulty(id);
      await frames(1);
      diffSeen.push(window.RasmaticGame.getDifficulty());
    }
    const diffStored = localStorage.getItem(window.RasmaticStore.key('rasmatic.botDifficulty'));
    ok('V20-08 tres dificultades y persistencia',
      diffSeen.length === 3 &&
      diffSeen[0].interval === 12 && diffSeen[0].speed === 0.75 &&
      diffSeen[1].interval === 9 && diffSeen[1].speed === 1 &&
      diffSeen[2].interval === 6 && diffSeen[2].speed === 1.25 &&
      diffStored === 'dificil',
      { dificultades: diffSeen, guardado: diffStored });
    window.RasmaticGame.setDifficulty('normal');

    /* ---------------- V20-09: partida (V21: inicio directo de prueba) ---------------- */
    const started = window.RasmaticGame._test.startNow();
    const playing = await until(() => D().state === 'playing', 8000);
    const customer = await until(() => D().customer === true && D().request >= 0, 20000);
    const req = D().request;
    let take = false, give = false;
    if (customer && req >= 0) {
      window.RasmaticGame._test.aimAtStation(req);
      const near = await until(() => D().ui.action === 'RECOGER', 8000);
      if (near) {
        window.RasmaticGame.interact();
        take = await until(() => D().carrying >= 0, 5000);
      }
      if (take) {
        const s0 = D().score.player;
        window.RasmaticGame._test.config({ beltSpeed: 24 });
        const placed = window.RasmaticGame._test.placeBeltNow();
        give = placed && await until(() => D().score.player === s0 + 1, 22000);
      }
    }
    ok('V20-09 partida: cliente, recoger y entrega por cinta',
      started === true && playing && customer && take && give,
      { estado: D().state, cliente: customer,
        recoger: take, entregar: give, puntaje: D().score.player });
    window.RasmaticGame._test.timeLeft(1);
    const over = await until(() => D().state === 'over', 20000);
    const endOpen = document.getElementById('rg-end').classList.contains('on');
    window.RasmaticGame.onBack();
    await until(() => D().state === 'menu', 5000);
    ok('V20-10 fin de partida y vuelta al menú',
      over && endOpen && D().state === 'menu',
      { fin: over, panel: endOpen, estado: D().state });

    /* ---------------- V20-11: joystick opcional + entrada externa ---------------- */
    window.RasmaticGame._test.startNow();
    await frames(2);
    window.RasmaticGame.setJoystick(false);
    const stick = document.getElementById('ras-stick');
    const stickHidden = getComputedStyle(stick).display === 'none';
    tp(20, 26, 0, 0);
    await frames(2);
    const z0 = G().player.z;
    core.input({ mx: 0, my: 1, lx: 0, ly: 0, run: false });
    await frames(8);
    core.input({ mx: 0, my: 0, lx: 0, ly: 0, run: false });
    const z1 = G().player.z;
    window.RasmaticGame.setJoystick(true);
    const stickBack = getComputedStyle(stick).display !== 'none';
    ok('V20-11 joystick apagado no anula la entrada del mando',
      stickHidden && z1 < z0 - 0.2 && stickBack === true &&
      window.RasmaticGame.getJoystick() === true,
      { joystick_oculto: stickHidden, z: [+z0.toFixed(2), +z1.toFixed(2)],
        joystick_vuelve: stickBack });

    /* ---------------- V20-12: Head Tracking configurable ---------------- */
    const ht = HT();
    const before = ht.getConfig();
    ht.applyConfig({
      enabled: true, sensitivityX: 1.6, sensitivityY: 0.9,
      sensitivityRoll: 1.2, smoothing: 0.2, response: 1.4,
      invertX: true, invertY: false
    });
    const cfg = ht.getConfig();
    const stored = {
      x: localStorage.getItem(window.RasmaticStore.key('rasmatic.ht.sensX')),
      y: localStorage.getItem(window.RasmaticStore.key('rasmatic.ht.sensY')),
      r: localStorage.getItem(window.RasmaticStore.key('rasmatic.ht.sensRoll')),
      sm: localStorage.getItem(window.RasmaticStore.key('rasmatic.ht.smoothing')),
      rs: localStorage.getItem(window.RasmaticStore.key('rasmatic.ht.response')),
      inv: localStorage.getItem(window.RasmaticStore.key('rasmatic.ht.invertX'))
    };
    ok('V20-12 Head Tracking: sensibilidad X/Y/roll, suavizado, respuesta e inversión',
      cfg.enabled === true && cfg.sensitivityX === 1.6 && cfg.sensitivityY === 0.9 &&
      cfg.sensitivityRoll === 1.2 && cfg.smoothing === 0.2 &&
      cfg.response === 1.4 && cfg.invertX === true && cfg.invertY === false &&
      stored.x === '1.6' && stored.y === '0.9' && stored.sm === '0.2' &&
      stored.rs === '1.4' && stored.inv === '1',
      { antes: before, ahora: cfg, guardado: stored });

    const yaw0 = G().player.yaw, x0 = G().player.x, zz0 = G().player.z;
    await frames(4);
    ok('V20-13 Head Tracking no mueve al personaje ni la cámara del juego',
      G().player.x === x0 && G().player.z === zz0 && G().player.yaw === yaw0,
      { posicion: [G().player.x, G().player.z], yaw: G().player.yaw });

    ht.disable();
    ok('V20-14 Head Tracking se apaga y se vuelve a encender',
      ht.getConfig().enabled === false && ht.isEnabled() === false,
      { enabled: ht.getConfig().enabled, estado: ht.status() });

    /* ---------------- V20-15: puente VR / Windows ---------------- */
    const vr = VR();
    const vrApplied = vr.applyCal({
      htEnabled: false, htSensX: 1.75, htSensY: 1.1, htSensRoll: 0.8,
      htSmoothing: 0.18, htResponse: 1.2, htInvertX: false, htInvertY: true,
      htRecenter: 1
    }, 'windows');
    await sleep(120);
    const vrSet = vr.state().settings;
    const htAfterVr = ht.getConfig();
    const vrStored = JSON.parse(localStorage.getItem(window.RasmaticStore.key('rasmatic.vr.settings.v2')) || '{}');
    ok('V20-15 Windows aplica la configuración de Head Tracking en el iPhone',
      vrApplied === true && vrSet.htEnabled === false && vrSet.htSensX === 1.75 &&
      vrSet.htSensY === 1.1 && vrSet.htSensRoll === 0.8 &&
      vrSet.htSmoothing === 0.18 && vrSet.htResponse === 1.2 &&
      vrSet.htInvertY === true && vrSet.htRecenter === 0 &&
      htAfterVr.enabled === false && htAfterVr.sensitivityX === 1.75 &&
      htAfterVr.sensitivityY === 1.1 && htAfterVr.sensitivityRoll === 0.8 &&
      htAfterVr.smoothing === 0.18 && htAfterVr.response === 1.2 &&
      htAfterVr.invertY === true && vrStored.htSensX === 1.75,
      { aplicado: vrApplied, vr: vrSet, ht: htAfterVr,
        guardado: vrStored.htSensX });

    const keep = vr.state().settings.htSensX;
    const bad = vr.applyCal({
      htSensX: 'x', htSensY: null, ipd: 'x', htEnabled: 'si', profile: 'no-existe'
    }, 'windows');
    const keepAfter = vr.state().settings.htSensX;
    ok('V20-16 datos inválidos o incompletos no sobrescriben la configuración',
      bad === false && keepAfter === keep,
      { aplicado: bad, antes: keep, despues: keepAfter });

    /* Persistencia tras salir/entrar del modo VR. */
    vr.enable();
    await frames(2);
    vr.disable();
    await frames(1);
    const persisted = JSON.parse(localStorage.getItem(window.RasmaticStore.key('rasmatic.vr.settings.v2')) || '{}');
    ok('V20-17 la configuración sobrevive a cerrar y abrir VR',
      persisted.htSensX === 1.75 && persisted.htSensY === 1.1 &&
      persisted.htInvertY === true && persisted.htEnabled === false,
      { guardado: { x: persisted.htSensX, y: persisted.htSensY,
        invertY: persisted.htInvertY, enabled: persisted.htEnabled } });

    /* Control local de emergencia: el iPhone puede apagar el HT sin PC. */
    vr.set('htEnabled', true);
    const localOn = vr.state().settings.htEnabled === true;
    vr.set('htEnabled', false);
    const localOff = vr.state().settings.htEnabled === false;
    ok('V20-18 control local de emergencia del Head Tracking',
      localOn && localOff && ht.getConfig().enabled === false,
      { encendido: localOn, apagado: localOff, ht: ht.getConfig().enabled });

    /* Restaurar valores neutros para no dejar el equipo de prueba alterado. */
    vr.reset();
    ht.applyConfig({ enabled: true, sensitivityX: 1, sensitivityY: 1,
      sensitivityRoll: 1, smoothing: 0.12, response: 1,
      invertX: false, invertY: false });
    window.RasmaticGame.setDifficulty('normal');
  } catch (e) {
    ok('suite V20 interrumpida', false,
      { error: String(e && e.message), stack: String(e && e.stack).split('\n').slice(0, 4) });
  }

  const fails = out.filter((o) => !o.pass).length;
  return JSON.stringify({ fails, total: out.length, out }, null, 1);
})()
