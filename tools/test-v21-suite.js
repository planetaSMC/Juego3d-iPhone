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
  const renderFrames = async (n) => {
    const f0 = G().renderer.info.render.frame;
    await until(() => G().renderer.info.render.frame >= f0 + n, 15000);
  };
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
    const countEl = document.getElementById('v21-count-num');
    const seenCount = [];
    const seenTimes = [];
    const countObs = new MutationObserver(function () {
      seenCount.push(countEl.textContent);
      seenTimes.push(D().time);
    });
    countObs.observe(countEl, { childList: true, characterData: true, subtree: true });
    startBtn.click();
    const cd3 = await until(() => D().state === 'countdown', 3000);
    const num3 = countEl.textContent;
    const frozen0 = D().time;
    const playing = await until(() => D().state === 'playing', 9000);
    countObs.disconnect();
    const seen2 = seenCount.indexOf('2') >= 0;
    const seen1 = seenCount.indexOf('1') >= 0;
    const frozenDuring = seenTimes.length > 0 &&
      seenTimes.every(function (v) { return v === 180; });
    const stillFrozen = frozenDuring ? 180 : -1;
    const countdownOff = !document.getElementById('v21-countdown').classList.contains('on');
    ok('V21-02 INICIAR, cuenta 3-2-1 y reloj congelado',
      cd3 && num3 === '3' && seen2 && seen1 && playing && countdownOff &&
      frozen0 === 180 && stillFrozen === 180 && D().time <= 180.2,
      { num3, seen2, seen1, vistos: seenCount, tiempos: seenTimes,
        estado: D().state, reloj_antes: frozen0, reloj_cuenta: stillFrozen,
        reloj_partida: D().time, overlay: countdownOff });

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
    window.RasmaticGame._test.config({ beltSpeed: 24 });
    const entry = PH().conveyor.entry;
    const scorePlaceBefore = D().score.player;
    const reqPlaceBefore = D().request;
    const reqImgPlaceBefore = document.getElementById('rg-req-img').getAttribute('src');
    const carriedId = D().carryingBox ? D().carryingBox.id : -1;
    tp(entry.x + 1.8, entry.z, 0, 0);
    const nearBelt = await until(() => D().ui.action === 'COLOCAR', 8000);
    const placed = window.RasmaticGame.interact();
    /* Un segundo flanco inmediato no debe agarrar el siguiente medicamento. */
    const doubleTap = window.RasmaticGame.interact();
    const stillEmpty = D().carrying === -1;
    const moving = await until(() => {
      const b = D().belt;
      return b.count === 1 && b.items[0] && b.items[0].s > 0.2 && b.speed > 0;
    }, 6000);
    /* El pedido no debe avanzar al colocar: solo cuando el empleado valida
       al final de la cinta (V21-06). */
    await sleep(600);
    const reqPlaceAfter = D().request;
    const reqImgPlaceAfter = document.getElementById('rg-req-img').getAttribute('src');
    const b1 = D().belt;
    ok('V21-05 colocar en la cinta y transporte real sin cambiar el pedido',
      nearBelt && placed === true && moving && D().carrying === -1 &&
      doubleTap === false && stillEmpty &&
      reqPlaceAfter === reqPlaceBefore && reqImgPlaceAfter === reqImgPlaceBefore &&
      b1.count === 1 && b1.items[0].drug === window.RasmaticGame._test.expectedDrug(reqPlaceBefore) &&
      b1.items[0].id === carriedId,
      { accion: D().ui.action, cinta: b1, llevando: D().carrying,
        doble_toque: doubleTap, id_caja: carriedId,
        pedido_antes: reqPlaceBefore, pedido_despues: reqPlaceAfter,
        imagen_igual: reqImgPlaceAfter === reqImgPlaceBefore });

    /* ---------------- V21-06: empleado valida y entrega ---------------- */
    const score0 = scorePlaceBefore;
    const reqBefore = reqPlaceBefore;
    const delivered = await until(() => D().score.player === score0 + 1, 22000);
    const requestChanged = await until(() => D().request >= 0 && D().request !== reqBefore, 16000);
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
      window.RasmaticGame._test.config({ beltSpeed: 24 });
      const placedWrong = window.RasmaticGame._test.placeBeltNow();
      wrongOk = placedWrong && await until(() => D().stockP[wrong] === stockBefore + 1, 22000);
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
    ok('V21-10 Farmacia RASMATIC, cajas de color sólido y escala humana',
      ph.signs.main === 'FARMACIA RASMATIC' && ph.machineConveyor === false &&
      Math.abs(ph.pharmacist.scale.x - 0.86) < 0.01 &&
      D().clients.every(function (c) { return c.scale >= 0.8 && c.scale <= 0.9; }) &&
      !!box.material && !Array.isArray(box.material) && !box.material.map &&
      !!box.material.color && box.material.color.getHex() !== 0xffffff &&
      distinct >= Math.min(4, uniqueImgs),
      { cartel: ph.signs, cinta_maquina: ph.machineConveyor,
        escala_empleado: +ph.pharmacist.scale.x.toFixed(2),
        escalas_clientes: D().clients.map(function (c) { return c.scale; }),
        imagenes_distintas: distinct,
        material: box.material ? (box.material.map ? 'atlas' : 'color-sólido') : 0,
        color: box.material && box.material.color ? '#' + box.material.color.getHexString() : null });

    /* ---------------- V21-10b: rendimiento desde el arranque ---------------- */
    tp(46.8, 9.4, Math.PI / 2, 0);
    await renderFrames(3);
    const perf = G().renderer.info;
    let allMeshes = 0;
    G().scene.traverse(function (o) { if (o.isMesh) allMeshes++; });
    ok('V21-10b rendimiento con escena, fila y tres clientes',
      perf.render.calls > 150 && perf.render.calls < 1400 &&
      perf.render.triangles > 10000 && perf.render.triangles < 200000 &&
      perf.memory.textures < 80 && allMeshes < 1600,
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
    await renderFrames(3);
    const info = G().renderer.info;
    let meshes = 0;
    G().scene.traverse(function (o) { if (o.isMesh) meshes++; });
    ok('V21-13 rendimiento estable con escena, fila y cinta',
      info.render.calls > 40 && info.render.calls < 1500 &&
      info.render.triangles < 190000 && info.memory.textures < 80 && meshes < 1600,
      { draw_calls: info.render.calls, triangulos: info.render.triangles,
        texturas: info.memory.textures, mallas: meshes });

    /* ---------------- V21-14: cada medicamento es una malla individual ---- */
    const sc = window.RasmaticGame._test.shelfCount();
    const each = G().pharmacy.shelfBoxes.every(function (b, i) {
      return b.isMesh === true && !b.isInstancedMesh &&
        b.userData && b.userData.kind === 'shelf' &&
        b.userData.id === i && typeof b.userData.n === 'number';
    });
    ok('V21-14 todas las cajas de estantería son objetos individuales',
      sc.total >= 300 && sc.uniqueIds === sc.total && sc.meshes === sc.total &&
      sc.stationBoxesSeparate === true && each,
      { estanteria: sc, identidad_unica: each });

    /* ---------------- V21-15: agarre restringido y sin soltura libre ------ */
    window.RasmaticGame._test.startNow();
    await until(() => D().state === 'playing', 5000);
    await until(() => D().clients.length >= 1, 12000);
    /* a) Solo se puede agarrar de las tres estanterías habilitadas. */
    let ai = -1;
    for (let i = 0; i < 140 && ai < 0; i++) {
      const b = G().pharmacy.shelfBoxes[i];
      const u = b && b.userData;
      if (u && u.sh >= 0 && u.accessible === true && b.visible &&
          !u.taken && !u.onBelt && !u.consumed) {
        if (window.RasmaticGame._test.aimAtShelfBox(i)) ai = i;
      }
    }
    const aDrug = ai >= 0 ? G().pharmacy.shelfBoxes[ai].userData.n : -1;
    const grabbed = ai >= 0 ? window.RasmaticGame.interact() : false;
    const held = await until(() => D().carryingDrug === aDrug &&
      D().carryingBox && D().carryingBox.id === ai &&
      D().carryingBox.parent === 'camera' &&
      window.RasmaticGame._test.shelfBox(ai).held === true, 5000);
    /* b) Lejos de la cinta no se suelta: sigue en la mano. */
    window.RasmaticGame._test.teleport(45, 27);
    const noFreeDrop = window.RasmaticGame.interact() === false;
    await sleep(200);
    const stillHeld = D().carrying >= 0 && D().carryingBox &&
      D().carryingBox.drug === aDrug;
    const homeBefore = ai >= 0 ? G().pharmacy.shelfBoxes[ai].userData.home.clone() : null;
    /* c) La cancelación de prueba devuelve la caja a su lugar (no al piso). */
    const released = window.RasmaticGame._test.releaseHeld();
    const backHome = await until(() => {
      const b = window.RasmaticGame._test.shelfBox(ai);
      return b && D().carrying === -1 && b.held === false && b.taken === false &&
        b.visible === true && Math.hypot(b.x - homeBefore.x, b.z - homeBefore.z) < 0.05;
    }, 5000);
    const aimAgain = window.RasmaticGame._test.aimAtShelfBox(ai);
    const regrabbed = aimAgain && window.RasmaticGame.interact();
    const heldAgain = await until(() => D().carryingDrug === aDrug &&
      D().carryingBox && D().carryingBox.id === ai, 5000);
    if (heldAgain) window.RasmaticGame._test.releaseHeld();
    /* d) Una estantería bloqueada no se puede agarrar ni en rango cercano. */
    let bi = -1;
    for (let i = 0; i < 200 && bi < 0; i++) {
      const b = G().pharmacy.shelfBoxes[i];
      const u = b && b.userData;
      if (u && u.sh < 0 && u.accessible === false && b.visible &&
          !u.taken && !u.onBelt && !u.consumed) {
        if (window.RasmaticGame._test.aimAtShelfBox(i)) bi = i;
      }
    }
    const blockedAim = bi >= 0 && D().aim && D().aim.blocked === true;
    const blockedGrab = bi >= 0 ? window.RasmaticGame.interact() : false;
    const blockedOk = bi >= 0 && blockedAim && blockedGrab === false &&
      D().carrying === -1;
    ok('V21-15 solo las 3 estanterías habilitadas, sin soltura libre',
      ai >= 0 && grabbed === true && held && noFreeDrop && stillHeld &&
      released === true && backHome && aimAgain === true && regrabbed === true &&
      heldAgain && blockedOk,
      { indice: ai, medicamento: aDrug, agarrada: grabbed, en_mano: held,
        sin_soltar: noFreeDrop && stillHeld, devuelta: backHome,
        re_agarrada: heldAgain, bloqueada: bi, bloqueada_ok: blockedOk });

    /* ---------------- V21-16: entrega del medicamento exacto ------------- */
    window.RasmaticGame._test.startNow();
    await until(() => D().state === 'playing', 5000);
    await until(() => D().clients.length >= 3 && D().request >= 0, 15000);
    const reqExact = D().request;
    const expected = window.RasmaticGame._test.expectedDrug(reqExact);
    const exactAim = expected >= 0 && window.RasmaticGame._test.aimAtDrug(expected);
    const exactGrab = exactAim && window.RasmaticGame.interact();
    const exactHeld = await until(() => D().carryingDrug === expected, 5000);
    const exactScore0 = D().score.player;
    window.RasmaticGame._test.config({ beltSpeed: 24 });
    const exactPlaced = exactHeld && window.RasmaticGame._test.placeBeltNow();
    const exactDelivered = await until(() => D().score.player === exactScore0 + 1, 24000);
    ok('V21-16 el pedido se valida por medicamento exacto (copia individual)',
      reqExact >= 0 && expected >= 0 && exactAim === true && exactGrab === true &&
      exactHeld && exactPlaced === true && exactDelivered,
      { pedido_color: reqExact, medicamento_esperado: expected,
        agarrado: exactGrab, entregado: exactDelivered,
        puntaje: D().score.player });

    /* ---------------- V21-17: el pedido no cambia al colocar ------------- */
    window.RasmaticGame._test.startNow();
    await until(() => D().state === 'playing', 5000);
    await until(() => D().clients.length >= 3 && D().request >= 0, 15000);
    window.RasmaticGame._test.config({ beltSpeed: 24 });
    const reqStay = D().request;
    const expectedStay = window.RasmaticGame._test.expectedDrug(reqStay);
    const stayAim = window.RasmaticGame._test.aimAtDrug(expectedStay);
    const stayGrab = stayAim && window.RasmaticGame.interact();
    const stayHeld = await until(() => D().carryingDrug === expectedStay, 5000);
    const stayScore0 = D().score.player;
    const stayPlaced = stayHeld && window.RasmaticGame._test.placeBeltNow();
    const stayT0 = Date.now();
    let earlyChange = null;
    let stayedDelivered = false;
    for (let i = 0; i < 220; i++) {
      const d = D();
      if (d.score.player > stayScore0) { stayedDelivered = true; break; }
      if (d.request !== reqStay) {
        earlyChange = { ms: Date.now() - stayT0, request: d.request,
          belt: d.belt, employee: d.employee, score: d.score.player };
        break;
      }
      await sleep(100);
    }
    ok('V21-17 el pedido no cambia hasta que la caja llega al cliente',
      stayAim === true && stayGrab === true && stayHeld && stayPlaced === true &&
      stayedDelivered && earlyChange === null,
      { pedido: reqStay, medicamento: expectedStay, colocado: stayPlaced,
        entregado: stayedDelivered, cambio_anticipado: earlyChange,
        cinta: D().belt, empleado: D().employee });

    /* ---------------- V21-18: el HUD no cambia con la caja en tránsito ----- */
    window.RasmaticGame._test.startNow();
    await until(() => D().state === 'playing', 5000);
    await until(() => D().clients.length >= 3 && D().request >= 0, 15000);
    window.RasmaticGame._test.config({ beltSpeed: 24 });
    const lockReq0 = D().request;
    const lockDrug0 = window.RasmaticGame._test.expectedDrug(lockReq0);
    const lockImg0 = document.getElementById('rg-req-img').getAttribute('src');
    const lockAim = window.RasmaticGame._test.aimAtDrug(lockDrug0);
    const lockGrab = lockAim && window.RasmaticGame.interact();
    const lockHeld = await until(() => D().carryingDrug === lockDrug0, 5000);
    const lockPlaced = lockHeld && window.RasmaticGame._test.placeBeltNow();
    const lockSet = lockPlaced && D().requestLock === lockReq0;
    window.RasmaticGame._test.advanceFront();
    await sleep(250);
    const lockReq1 = D().request;
    const lockImg1 = document.getElementById('rg-req-img').getAttribute('src');
    const heldDisplay = lockImg1 === lockImg0 && D().requestLock === lockReq0 &&
      D().pendingRequest === lockReq1 && lockReq1 !== lockReq0;
    const unlocked = await until(() => D().requestLock === -1, 35000);
    const lockImg2 = document.getElementById('rg-req-img').getAttribute('src');
    const expectedImg = PH().drugImage(window.RasmaticGame._test.expectedDrug(lockReq1));
    ok('V21-18 con una caja en tránsito el HUD conserva el pedido colocado',
      lockAim === true && lockGrab === true && lockHeld && lockPlaced === true &&
      lockSet && heldDisplay && unlocked && lockImg2 === expectedImg,
      { colocado: lockPlaced, pedido_colocado: lockReq0, pedido_nuevo: lockReq1,
        imagen_congelada: lockImg1 === lockImg0, bloqueo: D().requestLock,
        pendiente: D().pendingRequest, desbloqueado: unlocked,
        imagen_final_ok: lockImg2 === expectedImg,
        cinta: D().belt, empleado: D().employee, pedido_actual: D().request,
        llevando: D().carrying, stock: D().stockP });

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
