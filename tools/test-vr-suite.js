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
  const out = [];
  const ok = (name, cond, data) => out.push({ name, pass: !!cond, data });
  const info = (name, data) => out.push({ name, pass: true, data, nota: true });

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
  const STA = [
    { x: -3.85, z: -28 }, { x: 3.85, z: -36 }, { x: -3.85, z: -44 },
    { x: 3.85, z: -52 }, { x: -3.85, z: -60 }, { x: 3.85, z: -68 }
  ];
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
    tp(0, -20, 0, 0);
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

    /* El HUD y los menus deben quedar dentro del marco de la pantalla
       simulada. Con `per-eye` hay una copia completa en cada ojo y el
       original queda invisible (pero sigue siendo el nodo que actualiza el
       juego). */
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
    const copies = !!(mirrorL && mirrorL.querySelector('#rg-time') &&
      mirrorL.querySelector('#rg-score') &&
      mirrorR && mirrorR.querySelector('#rg-time'));
    const inside = !!(ml && mr &&
      ml.width > 10 && Math.abs(ml.width - mr.width) <= 1 &&
      ml.left >= sx8c - 2 && ml.right <= mr.left + 1 &&
      mr.right <= sx8c + sw8c + 2 &&
      ml.top >= sy8c - 2 && ml.bottom <= sy8c + sh8c + 2);
    ok('V08c HUD por ojo dentro del marco de la pantalla simulada',
      s8c.hudMode === 'per-eye' && s8c.mirrors.hud === true && realHidden &&
      copies && inside,
      { modo: s8c.hudMode, espejos: s8c.mirrors, original_oculto: realHidden,
        copias: copies,
        ojo_izq: ml && [Math.round(ml.left), Math.round(ml.top), Math.round(ml.width), Math.round(ml.height)],
        ojo_der: mr && [Math.round(mr.left), Math.round(mr.top), Math.round(mr.width), Math.round(mr.height)],
        marco: [Math.round(sx8c), Math.round(sy8c), Math.round(sw8c), Math.round(sh8c)] });

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

    /* ---------------- V10: controles de Windows ---------------- */
    /* Se espera por frames renderizados, no por milisegundos: con WebGL
       por software el reloj del juego avanza a pocos FPS. */
    tp(0, 30, 0, 0);
    await frames(2);
    const z0 = G().player.z;
    key('w', 'keydown');
    await frames(6);
    key('w', 'keyup');
    await frames(1);
    const zWalk = G().player.z;
    const walk = z0 - zWalk;

    tp(0, 30, 0, 0);
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

    /* Espacio interactua: en idle, junto al encargado, inicia la partida. */
    tp(0, 24.6, 0, 0);
    const nearNpc = await until(() => D().ui.action === 'JUGAR', 12000);
    key(' ', 'keydown');
    key(' ', 'keyup');
    const started = await until(() => D().state === 'playing', 12000);
    ok('V10b Espacio interactua (JUGAR)',
      nearNpc && started === true,
      { aviso: nearNpc, estado: D().state });

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

    const customer = await until(() => D().request >= 0 && D().customer === true, 45000);
    const req = D().request;
    let takeOk = null, giveOk = null;
    if (customer && req >= 0) {
      tp(STA[req].x * 0.9, STA[req].z);
      const nearSta = await until(() => D().ui.action === 'RECOGER', 15000);
      takeOk = false;
      if (nearSta) {
        window.RasmaticGame.interact();
        takeOk = await until(() => D().carrying === req, 8000);
      }
      giveOk = false;
      if (takeOk) {
        const score0 = D().score.player;
        tp(-3.6, 24.6);
        const nearCounter = await until(() => D().ui.action === 'ENTREGAR', 15000);
        if (nearCounter) {
          window.RasmaticGame.interact();
          giveOk = await until(() => D().score.player === score0 + 1, 8000);
        }
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
