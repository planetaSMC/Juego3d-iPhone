/* Suite V21 (se ejecuta dentro de la página).
   Cubre menú/cuenta regresiva, mira y contorno, pedido por imagen, cinta
   funcional, fila de clientes, escenario V21, VR y rendimiento. */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const D = () => window.RasmaticGame.debug();
  const G = () => window.RasmaticCore.game;
  const PH = () => window.RasmaticPharmacyApi || (G() && G().pharmacy);
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
  const frames = async (n) => { for (let i = 0; i < n; i++) await sleep(100); };
  const tp = (x, z, yaw, pitch) => {
    const g = G();
    g.player.x = x; g.player.z = z;
    if (typeof yaw === 'number') g.player.yaw = yaw;
    if (typeof pitch === 'number') g.player.pitch = pitch;
  };
  const stationColor = () => {
    const d = D();
    return d.request >= 0 ? d.request : 0;
  };

  try {
    for (let i = 0; i < 140 && (!window.__ready || !window.RasmaticGame || D().state !== 'menu'); i++) {
      await sleep(250);
    }

    /* ---------------- V21-01: menú inicial ---------------- */
    const menu = document.getElementById('v21-start');
    const startBtn = document.getElementById('v21-start-btn');
    ok('V21-01 arranque en menú, sin partida automática',
      D().state === 'menu' && menu && menu.classList.contains('on') &&
      startBtn && startBtn.textContent.trim() === 'INICIAR' &&
      D().time === 180 && !document.getElementById('rg-req').classList.contains('on'),
      { state: D().state, menu: menu && menu.className,
        boton: startBtn && startBtn.textContent, tiempo: D().time });

    /* ---------------- V21-02: cuenta regresiva 3-2-1 ---------------- */
    startBtn.click();
    const cd3 = await until(() => D().state === 'countdown', 3000);
    const num3 = document.getElementById('v21-count-num').textContent;
    const frozen0 = D().time;
    const seen2 = await until(() => document.getElementById('v21-count-num').textContent === '2', 4000);
    const seen1 = await until(() => document.getElementById('v21-count-num').textContent === '1', 5000);
    const stillFrozen = D().time;
    const playing = await until(() => D().state === 'playing', 8000);
    const countdownOff = !document.getElementById('v21-countdown').classList.contains('on');
    ok('V21-02 INICIAR, cuenta 3-2-1 y reloj congelado',
      cd3 && num3 === '3' && seen2 && seen1 && playing && countdownOff &&
      frozen0 === 180 && stillFrozen === 180 && D().time <= 180.2,
      { num3, seen2, seen1, estado: D().state, reloj_antes: frozen0,
        reloj_cuenta: stillFrozen, reloj_partida: D().time, overlay: countdownOff });

    /* ---------------- V21-03: fila y pedido con imagen ---------------- */
    const queueReady = await until(() => D().clients.length >= 3, 20000);
    const q = D().clients.slice().sort(function (a, b) { return a.slot - b.slot; });
    const reqImg = document.getElementById('rg-req-img');
    ok('V21-03 fila de tres clientes y pedido visible como imagen',
      queueReady && q.length >= 3 && q[0].slot === 0 && q[1].slot === 1 &&
      q[2].slot === 2 && q.every(function (c) { return c.state === 'waiting' && c.request >= 0; }) &&
      !!reqImg.getAttribute('src') && reqImg.getAttribute('src').indexOf('data:image/png') === 0 &&
      document.getElementById('rg-req').classList.contains('on') &&
      !document.querySelector('#rg-req .rg-req-txt b'),
      { fila: q, imagen: reqImg.getAttribute('src').slice(0, 24) });

    /* ---------------- V21-04: mira, contorno y sin etiquetas ---------------- */
    const c0 = stationColor();
    window.RasmaticGame._test.aimAtStation(c0);
    const nearAim = await until(() => D().ui.action === 'RECOGER', 8000);
    const aimed = D();
    const outlined = aimed.aim && aimed.aim.visible && aimed.aim.color === c0;
    const noLabels = aimed.stationLabels === 0;
    tp(30, 20, 0, 0);
    const lost = await until(() => D().aim === null, 3000);
    window.RasmaticGame._test.aimAtStation(c0);
    await until(() => D().ui.action === 'RECOGER', 5000);
    const took = window.RasmaticGame.interact();
    const carrying = await until(() => D().carrying === c0, 5000);
    const cleared = D().aim === null;
    ok('V21-04 mira detecta, contorno desaparece al mirar afuera y sin etiquetas',
      nearAim && outlined && noLabels && lost && took === true && carrying && cleared,
      { accion: aimed.ui.action, mira: aimed.aim, etiquetas: aimed.stationLabels,
        contorno_al_salir: lost, llevando: D().carrying, mira_limpia: cleared });

    /* ---------------- V21-05: colocar en la cinta ---------------- */
    window.RasmaticGame._test.config({ beltSpeed: 7 });
    const entry = PH().conveyor.entry;
    tp(entry.x + 1.8, entry.z, 0, 0);
    const nearBelt = await until(() => D().ui.action === 'COLOCAR', 8000);
    const placed = window.RasmaticGame.interact();
    const moving = await until(() => {
      const b = D().belt;
      return b.count === 1 && b.items[0] && b.items[0].s > 0.2 && b.speed > 0;
    }, 6000);
    const b1 = D().belt;
    ok('V21-05 colocar en la cinta y transporte real',
      nearBelt && placed === true && moving && D().carrying === -1,
      { accion: D().ui.action, cinta: b1, llevando: D().carrying });

    /* ---------------- V21-06: empleado valida y entrega ---------------- */
    const score0 = D().score.player;
    const reqBefore = D().request;
    const delivered = await until(() => D().score.player === score0 + 1, 16000);
    const requestChanged = await until(() => D().request >= 0 && D().request !== reqBefore, 12000);
    const afterDelivery = D();
    ok('V21-06 el empleado recoge, valida y entrega al cliente',
      delivered && requestChanged && afterDelivery.belt.count === 0 &&
      afterDelivery.queue.length > 0,
      { puntaje: afterDelivery.score.player, cola: afterDelivery.queue,
        pedido_antes: reqBefore, pedido_ahora: afterDelivery.request,
        cinta: afterDelivery.belt });

    /* ---------------- V21-07: la fila avanza y se repone ---------------- */
    const advanced = await until(() => {
      const d = D();
      return d.request >= 0 && d.clients.length >= 3 && d.queue.length === 3 &&
        d.queue[0].slot === 0 && d.queue[1].slot === 1 && d.queue[2].slot === 2 &&
        d.queue[0].state !== 'receiving';
    }, 15000);
    ok('V21-07 la fila avanza y el siguiente cliente queda activo',
      advanced && D().request >= 0,
      { fila: D().queue, pedido: D().request });

    /* ---------------- V21-08: color equivocado no suma ---------------- */
    const reqWrong = D().request;
    let wrong = -1;
    for (let off = 1; off < 6 && wrong < 0; off++) {
      const cand = (reqWrong + off) % 6;
      window.RasmaticGame._test.aimAtStation(cand);
      await until(() => D().ui.action === 'RECOGER', 5000);
      if (D().ui.action !== 'RECOGER') continue;
      window.RasmaticGame.interact();
      await until(() => D().carrying >= 0, 5000);
      if (D().carrying === cand) wrong = cand;
    }
    let wrongOk = false;
    if (wrong >= 0) {
      const scoreBad = D().score.player;
      const stockBefore = D().stockP[wrong];
      window.RasmaticGame._test.config({ beltSpeed: 7 });
      const placedWrong = window.RasmaticGame._test.placeBeltNow();
      wrongOk = placedWrong && await until(() => D().stockP[wrong] === stockBefore + 1, 16000);
      wrongOk = wrongOk && D().score.player === scoreBad && D().request === reqWrong;
    }
    ok('V21-08 medicamento equivocado no suma y vuelve al stock', wrongOk,
      { equivocado: wrong, pedido: reqWrong, puntaje: D().score.player,
        stock: wrong >= 0 ? D().stockP[wrong] : null });

    /* ---------------- V21-09: dos paquetes sin superponerse ---------------- */
    const a = stationColor();
    const b = (a + 1) % 6;
    window.RasmaticGame._test.config({ beltSpeed: 2.5 });
    window.RasmaticGame._test.aimAtStation(a);
    await until(() => D().ui.action === 'RECOGER', 6000);
    window.RasmaticGame.interact();
    await until(() => D().carrying === a, 5000);
    window.RasmaticGame._test.placeBeltNow();
    await until(() => D().belt.items.length === 1 && D().belt.items[0].s >= 1.9, 6000);
    window.RasmaticGame._test.aimAtStation(b);
    await until(() => D().ui.action === 'RECOGER', 6000);
    window.RasmaticGame.interact();
    await until(() => D().carrying === b, 5000);
    window.RasmaticGame._test.placeBeltNow();
    await sleep(250);
    const two = D().belt;
    let gap = 999;
    for (let i = 0; i < two.items.length; i++) {
      for (let j = i + 1; j < two.items.length; j++) {
        gap = Math.min(gap, Math.abs(two.items[i].s - two.items[j].s));
      }
    }
    ok('V21-09 dos medicamentos en la cinta sin superponerse',
      two.count >= 2 && gap >= 1.4,
      { cinta: two, separacion: +gap.toFixed(2) });

    /* ---------------- V21-10: escenario V21 ---------------- */
    const ph = PH();
    const box = ph.stations[0].box;
    const imgs = {};
    ph.stations.forEach(function (s) { imgs[s.drug] = ph.drugImage(s.drug); });
    const uniqueImgs = Object.keys(imgs).filter(function (k, i, arr) {
      return arr.indexOf(k) === i;
    }).length;
    const imgValues = Object.keys(imgs).map(function (k) { return imgs[k]; });
    const distinct = imgValues.filter(function (v, i) { return imgValues.indexOf(v) === i; }).length;
    ok('V21-10 Farmacia RASMATIC, cajas de color y escala humana',
      ph.signs.main === 'FARMACIA RASMATIC' && ph.machineConveyor === false &&
      Math.abs(ph.pharmacist.scale.x - 0.86) < 0.01 &&
      D().clients.every(function (c) { return c.scale >= 0.8 && c.scale <= 0.9; }) &&
      Array.isArray(box.material) && box.material.length === 6 &&
      !!box.material[4].map && distinct >= Math.min(4, uniqueImgs),
      { cartel: ph.signs, cinta_maquina: ph.machineConveyor,
        escala_empleado: +ph.pharmacist.scale.x.toFixed(2),
        escalas_clientes: D().clients.map(function (c) { return c.scale; }),
        imagenes_distintas: distinct, cajas: box.material.length });

    /* ---------------- V21-10b: rendimiento desde el arranque ---------------- */
    tp(46.8, 9.4, Math.PI / 2, 0);
    await frames(3);
    const perf = G().renderer.info;
    let allMeshes = 0;
    G().scene.traverse(function (o) { if (o.isMesh) allMeshes++; });
    ok('V21-10b rendimiento con escena, fila y tres clientes',
      perf.render.calls > 150 && perf.render.calls < 1400 &&
      perf.render.triangles > 10000 && perf.render.triangles < 200000 &&
      perf.memory.textures < 80 && allMeshes < 1200,
      { draw_calls: perf.render.calls, triangulos: perf.render.triangles,
        texturas: perf.memory.textures, mallas: allMeshes });

    /* ---------------- V21-11: VR, mira por ojo y Head Tracking ---------------- */
    const vr = VR();
    vr.enable();
    await frames(3);
    const aimQ = vr.aimQuaternion ? vr.aimQuaternion() : null;
    const mirror = document.getElementById('vr-mirror-hud-l');
    const vrAim = mirror && mirror.querySelector('#v21-aim');
    const vrHud = vr.state().mirrors.hud;
    ok('V21-11 VR SBS conserva mira por ojo y dirección con Head Tracking',
      !!aimQ && typeof aimQ.x === 'number' && vrHud && !!vrAim &&
      typeof window.RasmaticHeadTracking.getConfig === 'function',
      { hud: vrHud, mira_espejo: !!vrAim, quat: aimQ && [aimQ.x, aimQ.y, aimQ.z, aimQ.w],
        ht: window.RasmaticHeadTracking.getConfig() });

    /* ---------------- V21-12: menú/cuenta también por ojo ---------------- */
    window.RasmaticGame.restart();
    await until(() => D().state === 'countdown', 5000);
    await frames(2);
    const mirror2 = document.getElementById('vr-mirror-hud-l');
    const vrCount = mirror2 && mirror2.querySelector('#v21-countdown');
    ok('V21-12 cuenta regresiva visible en cada ojo de VR',
      vrCount && vrCount.classList.contains('on') &&
      document.getElementById('v21-countdown').classList.contains('on'),
      { en_espejo: !!vrCount, activa: !!(vrCount && vrCount.classList.contains('on')),
        estado: D().state });
    window.RasmaticGame._test.startNow();
    vr.disable();
    await frames(1);

    /* ---------------- V21-13: rendimiento con fila llena ---------------- */
    await until(() => D().clients.length >= 3, 15000);
    tp(30, 20, 0, 0);
    await frames(3);
    const info = G().renderer.info;
    let meshes = 0;
    G().scene.traverse(function (o) { if (o.isMesh) meshes++; });
    ok('V21-13 rendimiento estable con escena, fila y cinta',
      info.render.calls > 100 && info.render.calls < 1300 &&
      info.render.triangles < 190000 && info.memory.textures < 80 && meshes < 1200,
      { draw_calls: info.render.calls, triangulos: info.render.triangles,
        texturas: info.memory.textures, mallas: meshes });

    /* Restaurar un estado limpio. */
    window.RasmaticGame._test.config({ beltSpeed: 3.6 });
    window.RasmaticGame.onBack();
  } catch (e) {
    ok('suite V21 interrumpida', false,
      { error: String(e && e.message), stack: String(e && e.stack).split('\n').slice(0, 4) });
  }

  const fails = out.filter((o) => !o.pass).length;
  return JSON.stringify({ fails, total: out.length, out }, null, 1);
})()
