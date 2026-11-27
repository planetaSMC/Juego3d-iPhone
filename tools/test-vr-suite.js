/* Suite del modo VR BOX PREVIEW (se evalua dentro de la pagina).
   Devuelve un informe JSON. No modifica archivos.

   Cubre: activar/desactivar, dos camaras con parallax real, IPD,
   convergencia, perfiles de pantalla, tamano/separacion, distorsion,
   controles de Windows, restauracion de la camara/renderer y no regresion
   del juego normal.

   Lo que NO se puede probar aca: lentes fisicas, iPhone real, Safari,
   WKWebView. Ver docs/pruebas.md. */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const VR = window.RasmaticVR;
  const G = () => window.RasmaticCore.game;
  const CAM = () => G().camera;
  const R = () => G().renderer;
  const D = () => window.RasmaticGame.debug();
  const SKEY = (k) => (window.RasmaticStore && typeof RasmaticStore.key === 'function')
    ? RasmaticStore.key(k) : k;
  const out = [];
  const ok = (name, cond, data) => {
    console.log('[vr] ' + (cond ? 'ok   ' : 'FAIL ') + name);
    out.push({ name, pass: !!cond, data });
  };
  const info = (name, data) => {
    console.log('[vr] info ' + name);
    out.push({ name, pass: true, data, nota: true });
  };

  const until = async (pred, ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try { if (pred()) return true; } catch (e) { /* reintentar */ }
      await sleep(120);
    }
    return false;
  };
  const frames = async (n) => {
    const f0 = VR.state().stats.frames;
    await until(() => VR.state().stats.frames >= f0 + n, 10000);
    await sleep(60);
  };
  const key = (k, type) => window.dispatchEvent(new KeyboardEvent(type, {
    key: k, bubbles: true, cancelable: true
  }));
  const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const STA = [];
  (function () {
    const ph = window.RasmaticPharmacyApi;
    if (ph && ph.stations) ph.stations.forEach(function (s) {
      STA[s.color] = { x: s.x, z: s.z, drug: s.drug };
    });
  })();
  const tp = (x, z, yaw, pitch) => {
    const g = G();
    g.player.x = x; g.player.z = z;
    if (typeof yaw === 'number') g.player.yaw = yaw;
    if (typeof pitch === 'number') g.player.pitch = pitch;
  };

  function loadImage(url) {
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('no se pudo leer la captura del canvas'));
      im.src = url;
    });
  }

  async function grab() {
    const st = VR.state();
    const url = VR.snapshot();
    if (!url) throw new Error('snapshot vacio');
    const im = await loadImage(url);
    const c = document.createElement('canvas');
    c.width = st.canvas.width;
    c.height = st.canvas.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(im, 0, 0);
    return { st, ctx, c };
  }

  function diffRegions(ctx, a, b) {
    const da = ctx.getImageData(a.x, a.y, a.w, a.h).data;
    const db = ctx.getImageData(b.x, b.y, b.w, b.h).data;
    const n = Math.min(da.length, db.length);
    let diff = 0, sum = 0;
    for (let i = 0; i < n; i += 4) {
      const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
      if (d > 12) diff++;
      sum += d;
    }
    const px = n / 4;
    return { frac: diff / px, mean: sum / (px * 3) };
  }

  function meanRegion(ctx, r) {
    const d = ctx.getImageData(r.x, r.y, r.w, r.h).data;
    let s = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { s += d[i] + d[i + 1] + d[i + 2]; n += 3; }
    return s / n;
  }

  function region(ctx, r) {
    return ctx.getImageData(r.x, r.y, r.w, r.h);
  }

  try {
    /* ---------------- V01: presente y apagado ---------------- */
    const r0 = R();
    const canvas0 = r0.domElement;
    const pr0 = r0.getPixelRatio();
    const vp0 = r0.getViewport(new THREE.Vector4());
    const launch = document.getElementById('vr-launch');
    const launchVisible = launch && getComputedStyle(launch).display !== 'none';
    ok('V01 modulo VR cargado e inactivo',
      !!VR && VR.isActive() === false && VR.isDesktop() === true &&
      !document.body.classList.contains('vr-on') &&
      vp0.x === 0 && vp0.y === 0 &&
      Math.abs(vp0.z - canvas0.width / pr0) <= 1 &&
      Math.abs(vp0.w - canvas0.height / pr0) <= 1 &&
      r0.getScissorTest() === false,
      { active: VR && VR.isActive(), desktop: VR && VR.isDesktop(), launch: launchVisible,
        viewport: [vp0.x, vp0.y, vp0.z, vp0.w], canvas: [canvas0.width, canvas0.height] });

    ok('V01b boton de acceso visible en escritorio', launchVisible === true, { visible: launchVisible });

    /* ---------------- V15: escena V20 (farmacia del HTML) ---------------- */
    const PH = G().pharmacy;
    const v20Scene = !!PH && PH.drugs.length === 15 && PH.shelves.length === 3 &&
      PH.stations.length === 9 && !!PH.machine && PH.machine.boxes.length === 30 &&
      !G().logo.emblem;
    ok('V15 la escena es la farmacia V20, sin restos del almacén',
      v20Scene,
      { farmacia: !!PH, medicamentos: PH && PH.drugs.length,
        estanterias: PH && PH.shelves.length, estaciones: PH && PH.stations.length,
        cajas_maquina: PH && PH.machine.boxes.length,
        estado: D().state });

    /* ---------------- V02: activar ---------------- */
    VR.reset();
    VR.enable();
    const gotFrames = await until(() => VR.state().stats.frames >= 2, 15000);
    const s2 = VR.state();
    ok('V02 activar VR y renderizar dos vistas',
      gotFrames && s2.active === true &&
      document.body.classList.contains('vr-on') &&
      s2.panelOpen === true &&
      s2.eyes.length === 2 &&
      s2.stats.sceneDraws >= 2 &&
      s2.eyes[0].x + s2.eyes[0].w <= s2.eyes[1].x + 1 &&
      s2.eyes[1].x + s2.eyes[1].w <= s2.stage.x + s2.stage.w + 1,
      { frames: s2.stats.frames, draws: s2.stats.sceneDraws,
        eyes: s2.eyes.map((e) => [e.x, e.y, e.w, e.h]), stage: s2.stage,
        activo: s2.active, panel: s2.panelOpen,
        body: document.body.className });

    /* ---------------- V03: camaras y frustums ---------------- */
    await frames(2);
    const s3 = VR.state();
    const e0 = s3.eyes[0], e1 = s3.eyes[1];
    const dEye = dist3(e0.position, e1.position);
    const mid = [(e0.position[0] + e1.position[0]) / 2, (e0.position[1] + e1.position[1]) / 2, (e0.position[2] + e1.position[2]) / 2];
    const dMid = dist3(mid, s3.base);
    const qSame = Math.abs(e0.quaternion[0] - e1.quaternion[0]) < 1e-6 &&
      Math.abs(e0.quaternion[1] - e1.quaternion[1]) < 1e-6 &&
      Math.abs(e0.quaternion[2] - e1.quaternion[2]) < 1e-6 &&
      Math.abs(e0.quaternion[3] - e1.quaternion[3]) < 1e-6;
    ok('V03 dos camaras separadas por el IPD',
      Math.abs(dEye - 0.064) < 0.002 && dMid < 0.001 && qSame,
      { separacion_m: +dEye.toFixed(4), centro_m: +dMid.toFixed(5), misma_orientacion: qSame });

    const p0 = e0.projection[8], p1 = e1.projection[8];
    ok('V03b frustums asimetricos opuestos (off-axis, sin toe-in)',
      Math.abs(p0) > 1e-5 && Math.abs(p1) > 1e-5 && p0 * p1 < 0 && Math.abs(p0 + p1) < 1e-5,
      { izquierda: +p0.toFixed(6), derecha: +p1.toFixed(6) });

    /* ---------------- V04: parallax real (no imagen duplicada) ---------------- */
    tp(30, 20, 0, 0);
    await sleep(300);
    await frames(2);
    const g4 = await grab();
    const diff4 = diffRegions(g4.ctx, g4.st.eyes[0], g4.st.eyes[1]);
    ok('V04 las dos vistas no son la misma imagen',
      diff4.frac > 0.02 && diff4.mean > 1,
      { pixeles_distintos: +(diff4.frac * 100).toFixed(2) + ' %', diferencia_media: +diff4.mean.toFixed(2) });

    /* ---------------- V05: IPD ---------------- */
    VR.set('ipd', 50);
    await frames(2);
    const s50 = VR.state();
    const d50 = dist3(s50.eyes[0].position, s50.eyes[1].position);
    const snap50 = await grab();
    const left50 = region(snap50.ctx, snap50.st.eyes[0]);

    VR.set('ipd', 75);
    await frames(2);
    const s75 = VR.state();
    const d75 = dist3(s75.eyes[0].position, s75.eyes[1].position);
    const snap75 = await grab();
    const left75 = region(snap75.ctx, snap75.st.eyes[0]);

    let ipdPix = 0;
    const nIpd = Math.min(left50.data.length, left75.data.length);
    for (let i = 0; i < nIpd; i += 4) {
      if (Math.abs(left50.data[i] - left75.data[i]) +
          Math.abs(left50.data[i + 1] - left75.data[i + 1]) +
          Math.abs(left50.data[i + 2] - left75.data[i + 2]) > 12) ipdPix++;
    }
    ok('V05 el IPD cambia la separacion y la imagen',
      d75 > d50 && Math.abs((d75 - d50) - 0.025) < 0.002 &&
      ipdPix / (nIpd / 4) > 0.005,
      { d50_mm: +(d50 * 1000).toFixed(1), d75_mm: +(d75 * 1000).toFixed(1),
        pixeles_que_cambian: +((ipdPix / (nIpd / 4)) * 100).toFixed(2) + ' %' });

    /* ---------------- V06: convergencia ---------------- */
    VR.set('ipd', 64);
    VR.set('convergence', 1);
    await frames(2);
    const c1 = VR.state().eyes[0].projection[8];
    VR.set('convergence', 10);
    await frames(2);
    const c10 = VR.state().eyes[0].projection[8];
    const ratio = Math.abs(c1) / Math.abs(c10);
    ok('V06 la convergencia ajusta el off-axis',
      Math.abs(c1) > Math.abs(c10) && ratio > 8 && ratio < 12,
      { conv1: +c1.toFixed(6), conv10: +c10.toFixed(6), ratio: +ratio.toFixed(2) });
    VR.set('convergence', 3);

    /* ---------------- V07: perfiles de pantalla ---------------- */
    const prof = async (name, custom) => {
      VR.set('profile', name);
      if (custom) { VR.set('customW', custom[0]); VR.set('customH', custom[1]); }
      await frames(2);
      return VR.state();
    };
    const pWin = await prof('window');
    const winOk = pWin.stage.w === pWin.canvas.width && pWin.stage.h === pWin.canvas.height;
    const pLand = await prof('iphone-15-landscape');
    const landAspect = pLand.stage.w / pLand.stage.h;
    const landOk = Math.abs(landAspect - 2556 / 1179) < 0.01 &&
      pLand.stage.w <= pLand.canvas.width + 1 && pLand.stage.h <= pLand.canvas.height + 1;
    const pPort = await prof('iphone-15-portrait');
    const portAspect = pPort.stage.w / pPort.stage.h;
    const portOk = Math.abs(portAspect - 1179 / 2556) < 0.01;
    const pCustom = await prof('custom', [1000, 1000]);
    const customOk = Math.abs(pCustom.stage.w / pCustom.stage.h - 1) < 0.01;
    ok('V07 perfiles de pantalla (ventana, iPhone H/V, personalizado)',
      winOk && landOk && portOk && customOk,
      { ventana: [pWin.stage.w, pWin.stage.h], horizontal: +landAspect.toFixed(3),
        vertical: +portAspect.toFixed(3), custom: [pCustom.stage.w, pCustom.stage.h] });

    /* ---------------- V08: tamano y separacion central ---------------- */
    VR.set('profile', 'window');
    VR.set('zoom', 0.8);
    VR.set('gap', 0.05);
    await frames(2);
    const s8 = VR.state();
    const halfW = s8.stage.w / 2;
    const gapPx = Math.round(halfW * 0.05);
    const usable = halfW - gapPx;
    const expW = Math.round(usable * 0.8);
    const expH = Math.round(s8.stage.h * 0.8);
    const gapReal = s8.eyes[1].x - (s8.eyes[0].x + s8.eyes[0].w);
    ok('V08 tamano de imagen y separacion central',
      Math.abs(s8.eyes[0].w - expW) <= 1 && Math.abs(s8.eyes[0].h - expH) <= 1 &&
      gapReal >= gapPx - 2 && s8.eyes[0].x >= s8.stage.x && s8.eyes[1].x + s8.eyes[1].w <= s8.stage.x + s8.stage.w + 1,
      { ojos: [s8.eyes[0].w, s8.eyes[0].h], esperado: [expW, expH], separacion_px: gapReal });

    /* El control del panel tambien actualiza el estado. */
    const ipdInput = document.getElementById('vr-ipd');
    ipdInput.value = '70';
    ipdInput.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(80);
    ok('V08b el control del panel actualiza el ajuste',
      VR.state().settings.ipd === 70,
      { ipd: VR.state().settings.ipd });
    VR.set('ipd', 64);
    VR.set('zoom', 1);
    VR.set('gap', 0);

    /* El HUD debe ocupar el rectangulo completo de cada ojo (1:1, sin
       escalar a la mitad) y quedar dentro del marco de la pantalla simulada.
       Con `per-eye` hay una copia completa en cada ojo y el original queda
       invisible (pero sigue siendo el nodo que actualiza el juego). */
    VR.set('profile', 'iphone-15-landscape');
    await frames(2);
    await sleep(450);
    const s8c = VR.state();
    const pr8c = s8c.canvas.pixelRatio;
    const realHud = document.getElementById('rg-hud');
    const mirrorL = document.getElementById('vr-mirror-hud-l');
    const mirrorR = document.getElementById('vr-mirror-hud-r');
    const realHidden = realHud && getComputedStyle(realHud).opacity === '0';
    const ml = mirrorL ? mirrorL.getBoundingClientRect() : null;
    const mr = mirrorR ? mirrorR.getBoundingClientRect() : null;
    const sx8c = s8c.stage.x / pr8c, sy8c = s8c.stage.y / pr8c;
    const sw8c = s8c.stage.w / pr8c, sh8c = s8c.stage.h / pr8c;
    const eyeL = s8c.eyes[0], eyeR = s8c.eyes[1];
    const copies = !!(mirrorL && mirrorL.querySelector('#rg-time') &&
      mirrorL.querySelector('#rg-score') && mirrorL.querySelector('#rg-left') &&
      mirrorR && mirrorR.querySelector('#rg-time'));
    const eyeBox = (r, e) => !!r &&
      Math.abs(r.left - e.x / pr8c) <= 2 && Math.abs(r.top - e.y / pr8c) <= 2 &&
      Math.abs(r.width - e.w / pr8c) <= 2 && Math.abs(r.height - e.h / pr8c) <= 2;
    const boxed = eyeBox(ml, eyeL) && eyeBox(mr, eyeR);
    const insideEye = (r, box, margin) => !!r && !!box &&
      r.left >= box.left + margin && r.right <= box.right - margin &&
      r.top >= box.top + margin && r.bottom <= box.bottom - margin;
    const scoreR = mirrorL && mirrorL.querySelector('#rg-score').getBoundingClientRect();
    const timeR = mirrorL && mirrorL.querySelector('#rg-time').getBoundingClientRect();
    const safeInside = insideEye(scoreR, ml, 6) && insideEye(timeR, ml, 6);
    const fontOf = (el) => el ? parseFloat(getComputedStyle(el).fontSize) : 0;
    const scoreFont = fontOf(mirrorL && mirrorL.querySelector('.rg-team b'));
    const timeFont = fontOf(mirrorL && mirrorL.querySelector('#rg-time'));
    ok('V08c HUD por ojo 1:1 dentro del area segura',
      s8c.hudMode === 'per-eye' && s8c.mirrors.hud === true && realHidden &&
      copies && boxed && safeInside && scoreFont >= 32 && timeFont >= 30,
      { modo: s8c.hudMode, espejos: s8c.mirrors, original_oculto: realHidden,
        copias: copies, caja_por_ojo: boxed, area_segura: safeInside,
        fuentes: { marcador: scoreFont, reloj: timeFont },
        ojo_izq: ml && [Math.round(ml.left), Math.round(ml.top), Math.round(ml.width), Math.round(ml.height)],
        ojo_der: mr && [Math.round(mr.left), Math.round(mr.top), Math.round(mr.width), Math.round(mr.height)],
        marco: [Math.round(sx8c), Math.round(sy8c), Math.round(sw8c), Math.round(sh8c)] });

    /* La acción de la mira también debe existir por ojo: centrada en cada
       ojo y dentro de su área segura, no solo en un borde. */
    window.RasmaticGame._test.startNow();
    await until(() => D().state === 'playing' && D().request >= 0, 20000);
    window.RasmaticGame._test.aimAtStation(D().request);
    const near8e = await until(() => D().ui.action === 'RECOGER', 12000);
    await sleep(700);
    const s8e = VR.state();
    const actL = document.getElementById('vr-mirror-act-l');
    const actR = document.getElementById('vr-mirror-act-r');
    const realAct = document.getElementById('rg-act');
    const copyL = actL && actL.querySelector('#rg-act');
    const copyR = actR && actR.querySelector('#rg-act');
    const al = copyL ? copyL.getBoundingClientRect() : null;
    const ar = copyR ? copyR.getBoundingClientRect() : null;
    const pr8e = s8e.canvas.pixelRatio;
    const eyeCL = (s8e.eyes[0].x + s8e.eyes[0].w / 2) / pr8e;
    const eyeCR = (s8e.eyes[1].x + s8e.eyes[1].w / 2) / pr8e;
    const centered = !!al && !!ar &&
      Math.abs((al.left + al.width / 2) - eyeCL) <= 2 &&
      Math.abs((ar.left + ar.width / 2) - eyeCR) <= 2;
    const lowerHalf = !!al && !!ar && !!ml && !!mr &&
      al.top > ml.top + ml.height * 0.5 && ar.top > mr.top + mr.height * 0.5;
    const actSafe = insideEye(al, ml, 6) && insideEye(ar, mr, 6);
    const actHidden = realAct && getComputedStyle(realAct).opacity === '0';
    ok('V08e acción de la mira espejada, centrada y dentro del área segura',
      near8e && s8e.mirrors.act === true && centered && lowerHalf && actSafe &&
      actHidden && !!copyL && copyL.textContent === 'RECOGER',
      { aviso: D().ui.action, espejos: s8e.mirrors, centrado: centered,
        mitad_inferior: lowerHalf, area_segura: actSafe,
        original_oculto: actHidden,
        boton_izq: al && [Math.round(al.left), Math.round(al.top), Math.round(al.width), Math.round(al.height)],
        boton_der: ar && [Math.round(ar.left), Math.round(ar.top), Math.round(ar.width), Math.round(ar.height)] });
    /* V26: la personalización del HUD VR se duplica 1:1 en ambos ojos y no
       toca IPD ni convergencia. El perfil normal no altera la vista VR. */
    const UIG = window.RasmaticGame.ui;
    const uiBackup = UIG.state();
    const ipdBefore26 = dist3(VR.state().eyes[0].position, VR.state().eyes[1].position);
    const convBefore26 = VR.state().eyes[0].projection[8];
    UIG.reset('normal', null, { save: false });
    UIG.reset('vr', null, { save: false });
    await frames(2);
    await sleep(350);
    const baseL26 = mirrorL.querySelector('#rg-score').getBoundingClientRect();
    const baseR26 = mirrorR.querySelector('#rg-score').getBoundingClientRect();
    UIG.set('normal', 'score', { scale: 0.6 }, { save: false });
    await frames(2);
    await sleep(350);
    const normalL26 = mirrorL.querySelector('#rg-score').getBoundingClientRect();
    const normalR26 = mirrorR.querySelector('#rg-score').getBoundingClientRect();
    UIG.set('vr', 'score', { scale: 1.3, dx: 10, dy: 8 }, { save: false });
    await frames(2);
    await sleep(400);
    const vrL26 = mirrorL.querySelector('#rg-score').getBoundingClientRect();
    const vrR26 = mirrorR.querySelector('#rg-score').getBoundingClientRect();
    const sameSize26 = Math.abs(vrL26.width - vrR26.width) <= 1 &&
      Math.abs(vrL26.height - vrR26.height) <= 1;
    const relL26 = { x: vrL26.left - ml.left, y: vrL26.top - ml.top };
    const relR26 = { x: vrR26.left - mr.left, y: vrR26.top - mr.top };
    const sameRel26 = Math.abs(relL26.x - relR26.x) <= 1 &&
      Math.abs(relL26.y - relR26.y) <= 1;
    const grew26 = vrL26.width > normalL26.width * 1.2;
    const normalIgnored26 = Math.abs(normalL26.width - baseL26.width) <= 1 &&
      Math.abs(normalR26.width - baseR26.width) <= 1;
    const ipdAfter26 = dist3(VR.state().eyes[0].position, VR.state().eyes[1].position);
    const convAfter26 = VR.state().eyes[0].projection[8];
    const optics26 = Math.abs(ipdAfter26 - ipdBefore26) < 1e-6 &&
      Math.abs(convAfter26 - convBefore26) < 1e-9;
    const safeVr26 = insideEye(vrL26, ml, 4) && insideEye(vrR26, mr, 4);
    ok('V26 personalizacion VR duplicada 1:1 y sin tocar optica',
      sameSize26 && sameRel26 && grew26 && normalIgnored26 && optics26 && safeVr26,
      { tamanos: [Math.round(vrL26.width), Math.round(vrR26.width)],
        relativos: [relL26, relR26], escala_vr: grew26,
        normal_ignorado: normalIgnored26,
        ipd: [+ipdBefore26.toFixed(5), +ipdAfter26.toFixed(5)],
        convergencia: [+convBefore26.toFixed(6), +convAfter26.toFixed(6)],
        area_segura: safeVr26 });
    UIG.setProfile('normal', uiBackup.profiles.normal, { save: false });
    UIG.setProfile('vr', uiBackup.profiles.vr, { save: false });
    await frames(2);
    await sleep(300);

    tp(30, 20, 0, 0);
    await until(() => D().ui.action === '', 8000);

    /* El modo plano sigue disponible para la vista previa de escritorio. */
    VR.set('hudMode', 'flat');
    await frames(2);
    await sleep(450);
    const hudRect = realHud.getBoundingClientRect();
    const hudInside = Math.abs(hudRect.left - sx8c) <= 2 &&
      Math.abs(hudRect.top - sy8c) <= 2 &&
      Math.abs(hudRect.width - sw8c) <= 2 &&
      Math.abs(hudRect.height - sh8c) <= 2;
    ok('V08d HUD plano recortado al marco (vista previa)',
      hudInside && VR.state().mirrors.hud === false,
      { hud: [Math.round(hudRect.left), Math.round(hudRect.top), Math.round(hudRect.width), Math.round(hudRect.height)],
        marco: [Math.round(sx8c), Math.round(sy8c), Math.round(sw8c), Math.round(sh8c)] });
    VR.set('hudMode', 'per-eye');
    VR.set('profile', 'window');
    await frames(2);

    /* ---------------- V09: distorsion ---------------- */
    VR.set('distortion', 0.2);
    await frames(3);
    const s9 = VR.state();
    const rtOn = s9.path === 'rt' && s9.stats.rtFrames > 0;
    const g9 = await grab();
    const mean9 = meanRegion(g9.ctx, g9.st.eyes[0]);
    VR.set('distortion', 0);
    await frames(2);
    const s9b = VR.state();
    const g0 = await grab();
    const mean0 = meanRegion(g0.ctx, g0.st.eyes[0]);
    ok('V09 distorsion de lente aproximada (render target) y vuelta al paso directo',
      rtOn && s9b.path === 'direct' &&
      mean9 > 5 && mean9 < 250 && Math.abs(mean9 - mean0) < 25,
      { rt: rtOn, paso_directo: s9b.path === 'direct',
        brillo_con: +mean9.toFixed(1), brillo_sin: +mean0.toFixed(1) });

    /* ================ calibración avanzada ================ */
    VR.reset();
    await frames(2);
    tp(20, 26, 0, 0);
    await frames(3);

    /* ---------------- V16: cámara ---------------- */
    const s16a = VR.state();
    const eyeA = s16a.eyes[0].position.slice();
    const qA = s16a.eyes[0].quaternion.slice();
    const p5A = s16a.eyes[0].projection[5];

    VR.set('camHeight', 0.5);
    await frames(2);
    const eyeH = VR.state().eyes[0].position.slice();
    VR.set('camHeight', 0);

    VR.set('camDist', 1);
    await frames(2);
    const eyeD = VR.state().eyes[0].position.slice();
    VR.set('camDist', 0);

    VR.set('camPitch', 10);
    await frames(2);
    const qP = VR.state().eyes[0].quaternion.slice();
    VR.set('camPitch', 0);

    VR.set('camZoom', 1.5);
    await frames(2);
    const p5Z = VR.state().eyes[0].projection[5];
    VR.set('camZoom', 1);
    await frames(2);

    ok('V16 cámara: altura, distancia, inclinación y zoom',
      Math.abs((eyeH[1] - eyeA[1]) - 0.5) < 0.03 &&
      Math.abs((eyeD[2] - eyeA[2]) - 1) < 0.05 &&
      Math.abs(qP[0] - qA[0]) > 0.05 &&
      p5Z > p5A * 1.2,
      { altura_m: +(eyeH[1] - eyeA[1]).toFixed(3),
        distancia_m: +(eyeD[2] - eyeA[2]).toFixed(3),
        pitch_q: +qP[0].toFixed(3),
        proyeccion_zoom: +p5Z.toFixed(3), proyeccion_base: +p5A.toFixed(3) });

    /* ---------------- V17: intensidad 3D ---------------- */
    VR.set('depth', 0);
    await frames(2);
    const d0 = dist3(VR.state().eyes[0].position, VR.state().eyes[1].position);
    VR.set('depth', 1.5);
    await frames(2);
    const d15 = dist3(VR.state().eyes[0].position, VR.state().eyes[1].position);
    VR.set('depth', 1);
    await frames(2);
    ok('V17 intensidad 3D escala la separación estéreo',
      d0 < 0.0005 && Math.abs(d15 - 0.096) < 0.002,
      { separacion_0: +d0.toFixed(5), separacion_150: +d15.toFixed(4) });

    /* ---------------- V18: lentes independientes ---------------- */
    const base18 = VR.state();
    VR.set('eyeScaleL', 0.8);
    VR.set('eyeOffXR', 10);
    VR.set('eyeOffYL', 5);
    await frames(2);
    const s18 = VR.state();
    VR.resetGroup('left');
    VR.resetGroup('right');
    await frames(2);
    const back18 = VR.state();
    ok('V18 escala y desplazamiento independientes por ojo',
      s18.eyes[0].w < base18.eyes[0].w * 0.9 &&
      s18.eyes[1].x > base18.eyes[1].x + 20 &&
      s18.eyes[0].y > base18.eyes[0].y + 20 &&
      Math.abs(back18.eyes[0].w - base18.eyes[0].w) <= 1 &&
      Math.abs(back18.eyes[1].x - base18.eyes[1].x) <= 1,
      { ancho_izq: [base18.eyes[0].w, s18.eyes[0].w],
        x_der: [base18.eyes[1].x, s18.eyes[1].x],
        y_izq: [base18.eyes[0].y, s18.eyes[0].y] });

    /* ---------------- V19: pantalla, aspecto y recorte ---------------- */
    VR.set('stageX', 10);
    await frames(2);
    const st19 = VR.state().stage;
    const W19 = VR.state().canvas.width;
    VR.set('stageX', 0);
    VR.set('aspect', 2);
    await frames(2);
    const a19 = VR.state().stage;
    VR.set('aspect', 0);
    VR.set('cropL', 0.1);
    await frames(2);
    const p19 = VR.state().path;
    VR.set('cropL', 0);
    await frames(2);
    const p19b = VR.state().path;
    ok('V19 desplazamiento del conjunto, aspecto y recorte por ojo',
      Math.abs(st19.x - Math.round(W19 * 0.10)) <= 1 &&
      Math.abs(a19.aspect - 2) < 0.02 &&
      p19 === 'rt' && p19b === 'direct',
      { x_conjunto: st19.x, esperado: Math.round(W19 * 0.10),
        aspecto: +a19.aspect.toFixed(3), recorte_rt: p19, sin_recorte: p19b });

    /* ---------------- V20: imagen ---------------- */
    VR.set('profile', 'window');
    await frames(2);
    const g20a = await grab();
    const m20a = meanRegion(g20a.ctx, g20a.st.eyes[0]);
    VR.set('brightness', 1.4);
    await frames(2);
    const s20 = VR.state();
    const g20b = await grab();
    const m20b = meanRegion(g20b.ctx, g20b.st.eyes[0]);
    VR.set('brightness', 1);
    await frames(2);
    const p20 = VR.state().path;
    VR.set('saturation', 0);
    await frames(2);
    const p20b = VR.state().path;
    VR.resetGroup('image');
    await frames(2);
    const p20c = VR.state().path;
    ok('V20 imagen: el brillo cambia de verdad y el neutro vuelve al paso directo',
      s20.path === 'rt' && m20b > m20a + 3 &&
      p20 === 'direct' && p20b === 'rt' && p20c === 'direct',
      { brillo_antes: +m20a.toFixed(1), brillo_despues: +m20b.toFixed(1),
        rt_brillo: s20.path, neutro: p20, saturacion: p20b, restaurado: p20c });

    /* ---------------- V21: modo prueba ---------------- */
    const testChk = document.getElementById('vr-test');
    testChk.checked = true;
    testChk.dispatchEvent(new Event('change', { bubbles: true }));
    await frames(3);
    await sleep(400);
    const s21 = VR.state();
    const bodyTest21 = document.body.classList.contains('vr-test');
    const overlay21 = getComputedStyle(document.getElementById('vr-test-overlay')).display;
    const hud21 = getComputedStyle(document.getElementById('rg-hud')).display;
    const g21 = await grab();
    const m21 = meanRegion(g21.ctx, g21.st.eyes[0]);
    testChk.checked = false;
    testChk.dispatchEvent(new Event('change', { bubbles: true }));
    await frames(3);
    await sleep(400);
    const s21b = VR.state();
    const bodyTest21b = document.body.classList.contains('vr-test');
    ok('V21 modo prueba independiente (cuadrícula, HUD oculto y vuelta)',
      s21.test === true && bodyTest21 &&
      overlay21 !== 'none' && hud21 === 'none' && m21 > 2 &&
      s21.mirrors.hud === false &&
      s21b.test === false && !bodyTest21b &&
      s21b.mirrors.hud === true,
      { prueba: s21.test, body_prueba: bodyTest21, overlay: overlay21, hud: hud21,
        brillo_prueba: +m21.toFixed(1), espejo_hud: s21.mirrors.hud,
        vuelta: s21b.test, body_vuelta: bodyTest21b, espejo_vuelta: s21b.mirrors.hud });

    /* ---------------- V22: perfiles de calibración ---------------- */
    VR.set('fov', 84);
    VR.set('brightness', 1.2);
    const saved22 = VR.saveConfig('prueba-vr');
    const list22 = VR.listConfigs();
    VR.reset();
    const reset22 = VR.state().settings;
    const loaded22 = VR.loadConfig('prueba-vr');
    const load22 = VR.state().settings;
    const json22 = VR.exportConfig();
    VR.reset();
    const imported22 = VR.importConfig(json22);
    const imp22 = VR.state().settings;
    VR.deleteConfig('prueba-vr');
    const deleted22 = VR.listConfigs().indexOf('prueba-vr') < 0;
    ok('V22 guardar, cargar, exportar, importar y borrar perfiles',
      saved22 && list22.indexOf('prueba-vr') >= 0 &&
      Math.abs(reset22.fov - 70) < 0.01 &&
      loaded22 && Math.abs(load22.fov - 84) < 0.01 &&
      Math.abs(load22.brightness - 1.2) < 0.001 &&
      imported22 && Math.abs(imp22.fov - 84) < 0.01 &&
      deleted22,
      { guardado: saved22, lista: list22.length, fov_reset: reset22.fov,
        fov_cargado: load22.fov, brillo_cargado: load22.brightness,
        importado: imported22, borrado: deleted22 });

    /* ---------------- V23: persistencia ---------------- */
    VR.set('ipd', 68);
    VR.set('camHeight', 0.2);
    const raw23 = JSON.parse(localStorage.getItem(SKEY('rasmatic.vr.settings.v2')) || '{}');
    VR.disable();
    VR.enable();
    await frames(2);
    const after23 = VR.state().settings;
    ok('V23 la calibración se guarda y sobrevive a salir/entrar',
      raw23.ipd === 68 && Math.abs(raw23.camHeight - 0.2) < 0.001 &&
      after23.ipd === 68 && Math.abs(after23.camHeight - 0.2) < 0.001,
      { guardado: { ipd: raw23.ipd, altura: raw23.camHeight },
        tras_reentrar: { ipd: after23.ipd, altura: after23.camHeight } });

    /* ---------------- V24: restaurar por categoría ---------------- */
    VR.set('fov', 80);
    VR.set('camDist', 1);
    VR.set('brightness', 1.3);
    VR.resetGroup('cam');
    const s24 = VR.state().settings;
    VR.resetGroup('image');
    const s24b = VR.state().settings;
    ok('V24 restaurar una categoría no toca las demás',
      Math.abs(s24.fov - 70) < 0.01 && Math.abs(s24.camDist) < 0.001 &&
      Math.abs(s24.brightness - 1.3) < 0.001 &&
      Math.abs(s24b.brightness - 1) < 0.001,
      { tras_camara: { fov: s24.fov, distancia: s24.camDist, brillo: s24.brightness },
        tras_imagen: { brillo: s24b.brightness } });

    /* ---------------- V25: controles del panel ---------------- */
    const needIds = ['vr-camHeight', 'vr-depth', 'vr-cropL', 'vr-cropR', 'vr-brightness',
      'vr-test', 'vr-reset-all', 'vr-fov', 'vr-ipd', 'vr-exit', 'vr-cfg-save',
      'vr-ht-enabled', 'vr-ht-inv-x', 'vr-ht-inv-y', 'vr-ht-recenter', 'vr-ht-calibrate'];
    const missingIds = needIds.filter((id) => !document.getElementById(id));
    const tabCount = document.querySelectorAll('#vr-tabs [data-tab]').length;
    const fovInput = document.getElementById('vr-fov');
    fovInput.value = '75';
    fovInput.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(80);
    const fovUI = VR.state().settings.fov;
    VR.set('fov', 70);
    ok('V25 panel completo por categorías y control conectado',
      missingIds.length === 0 && tabCount === 8 && Math.abs(fovUI - 75) < 0.01,
      { faltantes: missingIds, pestañas: tabCount, fov_desde_ui: fovUI });

    VR.reset();
    await frames(2);
    tp(20, 26, 0, 0);

    /* ---------------- V10: controles de Windows ---------------- */
    /* Se espera por frames renderizados, no por milisegundos: con WebGL
       por software el reloj del juego avanza a pocos FPS. */
    if (D().state !== 'playing') window.RasmaticGame._test.startNow();
    tp(20, 26, 0, 0);
    await frames(2);
    const z0 = G().player.z;
    key('w', 'keydown');
    await frames(6);
    key('w', 'keyup');
    await frames(1);
    const zWalk = G().player.z;
    const walk = z0 - zWalk;

    tp(20, 26, 0, 0);
    await frames(2);
    key('Shift', 'keydown');
    key('w', 'keydown');
    await frames(6);
    key('w', 'keyup');
    key('Shift', 'keyup');
    await frames(1);
    const zRun = G().player.z;
    const run = z0 - zRun;
    ok('V10 WASD mueve y Shift corre',
      walk > 0.2 && run > walk * 1.35,
      { caminando: +walk.toFixed(2), corriendo: +run.toFixed(2), ratio: +(run / walk).toFixed(2) });

    /* Espacio en el menú inicia la cuenta regresiva. */
    window.RasmaticGame._test.timeLeft(0.1);
    await until(() => D().state === 'over', 15000);
    window.RasmaticGame.onBack();
    await until(() => D().state === 'menu', 8000);
    key(' ', 'keydown');
    key(' ', 'keyup');
    const started = await until(() => D().state === 'countdown', 5000);
    window.RasmaticGame._test.startNow();
    ok('V10b Espacio inicia la cuenta regresiva',
      started === true && D().state === 'playing',
      { countdown: started, estado: D().state });

    /* Escape sale del modo VR. */
    key('Escape', 'keydown');
    await sleep(300);
    ok('V10c Escape sale del modo VR',
      VR.isActive() === false && !document.body.classList.contains('vr-on'),
      { activo: VR.isActive() });

    /* ---------------- V11: camara y renderer originales ---------------- */
    await sleep(600);
    const r11 = R();
    const canvas11 = r11.domElement;
    const pr11 = r11.getPixelRatio();
    const vp11 = r11.getViewport(new THREE.Vector4());
    const cam11 = CAM();
    const pp11 = G().player;
    const proj11 = cam11.projectionMatrix.elements;
    const camPosOk = Math.abs(cam11.position.x - pp11.x) < 0.05 &&
      Math.abs(cam11.position.z - pp11.z) < 0.05;
    const projOk = Math.abs(proj11[8]) < 1e-6;
    const f0 = VR.state().stats.frames;
    await sleep(900);
    const f1 = VR.state().stats.frames;
    const hudRect11 = document.getElementById('rg-hud').getBoundingClientRect();
    const hudFull = Math.abs(hudRect11.width - innerWidth) <= 2 &&
      Math.abs(hudRect11.height - innerHeight) <= 2;
    ok('V11 al salir se restauran camara, proyeccion y renderer',
      vp11.x === 0 && vp11.y === 0 &&
      Math.abs(vp11.z - canvas11.width / pr11) <= 1 &&
      Math.abs(vp11.w - canvas11.height / pr11) <= 1 &&
      r11.getScissorTest() === false && camPosOk && projOk && f1 === f0 &&
      hudFull && !document.body.classList.contains('vr-hud-off'),
      { viewport: [vp11.x, vp11.y, vp11.z, vp11.w], camara_ok: camPosOk,
        proyeccion_simetrica: projOk, frames_tras_salir: f1 - f0,
        hud_completo: hudFull });

    /* ---------------- V12: no regresion del juego normal ---------------- */
    const hud = document.getElementById('rg-hud');
    const stick = document.getElementById('ras-stick');
    const hudVisible = hud && getComputedStyle(hud).display !== 'none';
    const stickDisplay = stick ? getComputedStyle(stick).display : 'ausente';
    const gameOk = D().state === 'playing' && hudVisible;

    if (D().state !== 'playing') window.RasmaticGame._test.startNow();
    const customer = await until(() => D().request >= 0 && D().customer === true, 45000);
    const req = D().request;
    let takeOk = null, giveOk = null;
    if (customer && req >= 0) {
      window.RasmaticGame._test.aimAtStation(req);
      const nearSta = await until(() => D().ui.action === 'RECOGER', 15000);
      takeOk = false;
      if (nearSta) {
        window.RasmaticGame.interact();
        takeOk = await until(() => D().carrying === req, 8000);
      }
      giveOk = false;
      if (takeOk) {
        const score0 = D().score.player;
        window.RasmaticGame._test.config({ beltSpeed: 24 });
        const placed = window.RasmaticGame._test.placeBeltNow();
        giveOk = placed && await until(() => D().score.player === score0 + 1, 22000);
      }
    }
    ok('V12 el juego normal sigue funcionando despues de VR',
      gameOk && takeOk !== false && giveOk !== false,
      { estado: D().state, hud: hudVisible, joystick: stickDisplay,
        cliente: customer, recoger: takeOk, entregar: giveOk, puntaje: D().score.player });

    /* ---------------- V13: pantalla completa (API) ---------------- */
    let fsOk = false;
    try {
      const p = VR.toggleFullscreen();
      if (p && p.then) await p;
      fsOk = true;
      if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
    } catch (e) { fsOk = false; }
    ok('V13 pantalla completa disponible sin errores',
      fsOk && typeof VR.toggleFullscreen === 'function' && !!document.getElementById('vr-fs'),
      { api: typeof VR.toggleFullscreen, headless: document.fullscreenEnabled });

    /* ---------------- V14: rendimiento (informativo) ---------------- */
    VR.enable();
    await frames(4);
    await sleep(1500);
    const perf = VR.state().stats;
    info('V14 rendimiento medido en este equipo (software WebGL)',
      { ms_ultimo_frame: +perf.lastMs.toFixed(1), ms_promedio: +perf.avgMs.toFixed(1),
        frames: perf.frames, dibujos_escena: perf.sceneDraws, blits: perf.blits });
    VR.disable();

    /* Restaurar ajustes por defecto para las capturas. */
    VR.reset();
  } catch (err) {
    out.push({ name: 'EXCEPCION en la suite VR', pass: false,
      data: { message: String(err && err.message || err), stack: String(err && err.stack || '').slice(0, 600) } });
  }

  const fails = out.filter((x) => !x.pass && !x.nota).length;
  return JSON.stringify({ total: out.length, fails, out });
})();
