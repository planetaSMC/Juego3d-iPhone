/* Suite del mando nativo GameController y del modo VR en un iPhone
   simulado (se evalua dentro de la pagina). Devuelve un informe JSON.

   Se ejecuta con __RASMATIC_NATIVE__ inyectado antes de cargar la pagina,
   igual que hace GameViewController.swift con WKUserScript. Por eso el
   puente que se prueba es el mismo que usa la app: RasmaticNativeGamepad,
   no la Gamepad API de Safari.

   Cubre:
     - deteccion del puente nativo y Gamepad API apagada
     - aviso "Mando conectado: <nombre>" y badge
     - sticks (mover / camara), gatillo/L1 (correr), cruceta
     - A/R1/R2 interactuar, B/Start atras, X menu, Y inicio, Select dock
     - desconexion / reconexion y restauracion del joystick tactil
     - sin doble entrada (los frames analogicos no disparan acciones)
     - VR movil: estereo, HUD por ojo, aviso de rotacion, controles con
       mando, salida segura y vuelta a la pantalla normal

   Lo que NO se puede probar aca: iPhone real, mandos Bluetooth reales,
   GameController de iOS, Safari/WKWebView ni las lentes fisicas.
   Ver docs/pruebas.md. */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const N = () => window.RasmaticNativeGamepad;
  const VR = window.RasmaticVR;
  const D = () => window.RasmaticGame.debug();
  const G = () => window.RasmaticCore.game;
  const out = [];
  const ok = (name, cond, data) => out.push({ name, pass: !!cond, data });

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
    await until(() => VR.state().stats.frames >= f0 + n, 12000);
    await sleep(80);
  };
  const tp = (x, z, yaw, pitch) => {
    const g = G();
    g.player.x = x; g.player.z = z;
    if (typeof yaw === 'number') g.player.yaw = yaw;
    if (typeof pitch === 'number') g.player.pitch = pitch;
  };
  const badge = () => document.getElementById('ras-pad-badge');
  const toast = () => document.getElementById('ras-pad-toast');
  const padOn = () => document.body.classList.contains('ras-pad-on');
  const stick = () => document.getElementById('ras-stick');
  const runBtn = () => document.getElementById('ras-run');
  const disp = (el) => el ? getComputedStyle(el).display : 'sin-nodo';

  try {
    /* ---------------- P01: puente nativo ---------------- */
    const ios = window.RasmaticIOS ? window.RasmaticIOS.debug() : null;
    ok('P01 puente GameController activo y Gamepad API apagada',
      !!N() && !!ios && ios.native === true && ios.version === 'ios-1.1' &&
      ios.polling === false,
      { puente: !!N(), ios });

    /* ---------------- P02: conexion y aviso ---------------- */
    N().status(true, 'DualSense Wireless');
    await sleep(180);
    ok('P02 aviso "Mando conectado: <nombre>"',
      padOn() === true &&
      toast() && toast().classList.contains('on') &&
      /Mando conectado: DualSense Wireless/.test(toast().textContent),
      { clase: padOn(), toast: toast() && toast().textContent,
        badgeOn: badge() && badge().classList.contains('on'),
        badgeDisplay: disp(badge()), body: document.body.className });

    /* ---------------- P03: Y = inicio / Select = dock ---------------- */
    const originalPress0 = window.RasmaticInput.press;
    const seen = [];
    window.RasmaticInput.press = function (action) {
      seen.push(action);
      return originalPress0.call(this, action);
    };
    const homeSent = N().press('home');
    const dockSent = N().press('dock');
    window.RasmaticInput.press = originalPress0;
    ok('P03 Y y Select llegan al juego como inicio y dock',
      homeSent === true && dockSent === true && seen.join(',') === 'home,dock',
      { inicio: homeSent, dock: dockSent, acciones: seen });

    /* ---------------- P05: A inicia la partida ---------------- */
    tp(21.9, 14.0, 0, 0);
    await until(() => D().ui.action === 'JUGAR', 12000);
    const started = N().press('interact');
    const playing = await until(() => D().state === 'playing', 8000);
    ok('P05 A/R1/R2 interactuan (inicia la partida)',
      started === true && playing === true,
      { accion: started, estado: D().state });

    /* ---------------- P06: stick izquierdo mueve ---------------- */
    tp(20, 26, 0, 0);
    await sleep(150);
    const z0 = D().player.z;
    N().raw('0,1000,0,0,0');
    /* Sondeo en vez de una espera fija: el primer frame tras iniciar la
       partida puede tardar más en algunos equipos. */
    let z1 = z0;
    for (let i = 0; i < 8 && z1 > z0 - 0.25; i++) {
      await sleep(250);
      z1 = D().player.z;
      if (i === 3 && z1 > z0 - 0.25) N().raw('0,1000,0,0,0');
    }
    N().raw('0,0,0,0,0');
    ok('P06 stick izquierdo mueve al personaje',
      z1 < z0 - 0.25,
      { z_antes: z0, z_despues: z1, avance: +(z0 - z1).toFixed(2) });

    /* ---------------- P07: stick derecho gira la camara ---------------- */
    tp(20, 26, 0, 0);
    await sleep(120);
    const yaw0 = G().player.yaw;
    N().raw('0,0,1000,0,0');
    await sleep(600);
    N().raw('0,0,0,0,0');
    const yaw1 = G().player.yaw;
    ok('P07 stick derecho gira la camara',
      yaw1 < yaw0 - 0.12,
      { yaw_antes: +yaw0.toFixed(3), yaw_despues: +yaw1.toFixed(3) });

    /* ---------------- P08: L1/L2 correr ---------------- */
    tp(20, 26, 0, 0);
    await sleep(150);
    const zw0 = D().player.z;
    N().raw('0,1000,0,0,0');
    await sleep(700);
    N().raw('0,0,0,0,0');
    const walk = zw0 - D().player.z;

    tp(20, 26, 0, 0);
    await sleep(150);
    const zr0 = D().player.z;
    N().raw('0,1000,0,0,1');
    await sleep(700);
    N().raw('0,0,0,0,0');
    const run = zr0 - D().player.z;
    ok('P08 L1 mantenido / L2 a fondo corre (2.4x)',
      walk > 0.1 && run > walk * 1.4,
      { caminando: +walk.toFixed(2), corriendo: +run.toFixed(2),
        ratio: +(run / walk).toFixed(2) });

    /* ---------------- P08b: A selecciona, agarra y suelta ---------------- */
    const cGrab = D().request >= 0 ? D().request : 0;
    const aimedPad = window.RasmaticGame._test.aimAtStation(cGrab);
    const grabSent = N().press('interact');
    const grabbedPad = await until(() => D().carrying === cGrab &&
      D().carryingBox && D().carryingBox.parent === 'camera', 5000);
    const dropSent = N().press('interact');
    const droppedPad = await until(() => D().carrying === -1 &&
      D().shelf && D().shelf.dropped >= 1, 5000);
    ok('P08b A selecciona, agarra y suelta la caja apuntada',
      aimedPad === true && grabSent === true && grabbedPad &&
      dropSent === true && droppedPad,
      { color: cGrab, apuntada: aimedPad, agarrada: grabbedPad,
        soltada: droppedPad, estanteria: D().shelf });

    /* ---------------- P08c: lo mismo dentro de VR Box ---------------- */
    const cVr = (cGrab + 2) % 6;
    VR.enable();
    await sleep(350);
    const aimedVr = window.RasmaticGame._test.aimAtStation(cVr);
    const grabVr = N().press('interact');
    const heldVr = await until(() => D().carrying === cVr &&
      D().carryingBox && D().carryingBox.parent === 'camera', 5000);
    const dropVr = N().press('interact');
    const releasedVr = await until(() => D().carrying === -1, 5000);
    VR.disable();
    await sleep(250);
    ok('P08c con VR Box el mando sigue apuntando, agarrando y soltando',
      aimedVr === true && grabVr === true && heldVr &&
      dropVr === true && releasedVr && VR.isActive() === false,
      { color: cVr, apuntada: aimedVr, agarrada: heldVr,
        soltada: releasedVr, vr: VR.isActive() });

    /* ---------------- P09: B/Start = atras ---------------- */
    N().press('pause');
    await until(() => {
      const el = document.getElementById('rg-toast');
      return el && /atr[áa]s/i.test(el.textContent);
    }, 3000);
    const gt = document.getElementById('rg-toast');
    const backToast = gt ? gt.textContent : '';
    ok('P09 B/Start actua como atras en la partida',
      /atr[áa]s/i.test(backToast) && D().state === 'playing',
      { aviso: backToast, estado: D().state });

    /* ---------------- P10: X = menu ---------------- */
    N().press('menu');
    await sleep(160);
    const menu1 = VR.state().panelOpen;
    N().press('menu');
    await sleep(160);
    const menu2 = VR.state().panelOpen;
    ok('P10 X abre y cierra el menu (panel VR)',
      menu1 === true && menu2 === false,
      { abierto: menu1, cerrado: menu2 });

    /* ---------------- P11: frames analogicos no disparan acciones ---------------- */
    const originalPress = window.RasmaticInput.press;
    let presses = 0;
    window.RasmaticInput.press = function (action) {
      presses++;
      return originalPress.call(this, action);
    };
    for (let i = 0; i < 6; i++) N().raw('200,200,100,100,0');
    await sleep(250);
    const pressesAnalog = presses;
    N().press('interact');
    const pressesButton = presses;
    window.RasmaticInput.press = originalPress;
    ok('P11 sin doble entrada: el analogico no dispara acciones',
      pressesAnalog === 0 && pressesButton === 1,
      { tras_frames: pressesAnalog, tras_boton: pressesButton });

    /* ---------------- P12: desconexion ---------------- */
    N().raw('0,0,0,0,0');
    N().status(false, '');
    await sleep(220);
    ok('P12 al desconectar vuelve el joystick tactil',
      padOn() === false &&
      D().state === 'playing' &&
      disp(stick()) !== 'none' &&
      !(badge() && badge().classList.contains('on')),
      { clase: padOn(), stick: disp(stick()), correr: disp(runBtn()),
        body: document.body.className,
        badge: badge() && badge().classList.contains('on'),
        toast: toast() && toast().textContent });

    /* ---------------- P13: reconexion ---------------- */
    N().status(true, 'Xbox Wireless Controller');
    await sleep(220);
    ok('P13 al reconectar se ocultan los controles y vuelve el aviso',
      padOn() === true &&
      disp(stick()) === 'none' &&
      disp(runBtn()) === 'none' &&
      /Xbox Wireless Controller/.test(toast() ? toast().textContent : ''),
      { clase: padOn(), stick: disp(stick()), correr: disp(runBtn()),
        toast: toast() && toast().textContent });

    /* ---------------- P14: Gamepad API no duplica ---------------- */
    window.__rasFakePad = {
      index: 0, id: 'Fake Gamepad', mapping: 'standard', connected: true,
      axes: [1, 0, 0, 0], buttons: []
    };
    window.dispatchEvent(new Event('gamepadconnected'));
    await sleep(300);
    const ios2 = window.RasmaticIOS.debug();
    ok('P14 la Gamepad API no arranca con el puente nativo',
      ios2.polling === false &&
      Math.abs(ios2.pad.mx) < 0.001 &&
      Math.abs(ios2.pad.lx) < 0.001,
      { polling: ios2.polling, pad: ios2.pad });

    /* ================= VR en iPhone simulado ================= */

    /* ---------------- M01: deteccion movil ---------------- */
    const launch = document.getElementById('vr-launch');
    ok('M01 modo VR disponible en el telefono',
      VR.isMobile() === true && VR.isDesktop() === false &&
      launch && disp(launch) !== 'none',
      { movil: VR.isMobile(), escritorio: VR.isDesktop(),
        boton: launch ? disp(launch) : 'sin-boton' });

    /* ---------------- M02: activar desde el boton ---------------- */
    launch.click();
    const vrOn = await until(() => VR.isActive() === true, 5000);
    await frames(2);
    await sleep(500);
    const s2 = VR.state();
    const launchRect = launch.getBoundingClientRect();
    const eye0 = {
      x: s2.eyes[0].x / s2.canvas.pixelRatio,
      y: s2.eyes[0].y / s2.canvas.pixelRatio,
      w: s2.eyes[0].w / s2.canvas.pixelRatio,
      h: s2.eyes[0].h / s2.canvas.pixelRatio
    };
    const launchInEye = launchRect.left >= eye0.x - 2 &&
      launchRect.right <= eye0.x + eye0.w + 2 &&
      launchRect.top >= eye0.y - 2 &&
      launchRect.bottom <= eye0.y + eye0.h + 2;
    ok('M02 el boton activa el modo y la salida queda en el ojo izquierdo',
      vrOn && s2.active === true &&
      document.body.classList.contains('vr-on') &&
      s2.landscape === true && s2.rotateWarning === false &&
      launchInEye,
      { activo: s2.active, horizontal: s2.landscape, aviso: s2.rotateWarning,
        boton: [Math.round(launchRect.left), Math.round(launchRect.top),
          Math.round(launchRect.width), Math.round(launchRect.height)],
        ojo: [Math.round(eye0.x), Math.round(eye0.y), Math.round(eye0.w), Math.round(eye0.h)] });

    VR.panel(false);
    await sleep(300);

    /* ---------------- M03: HUD por ojo ---------------- */
    const realHud = document.getElementById('rg-hud');
    const mL = document.getElementById('vr-mirror-hud-l');
    const mR = document.getElementById('vr-mirror-hud-r');
    const s3 = VR.state();
    const pr = s3.canvas.pixelRatio;
    const eL = { x: s3.eyes[0].x / pr, y: s3.eyes[0].y / pr,
      w: s3.eyes[0].w / pr, h: s3.eyes[0].h / pr };
    const rL = mL && mL.getBoundingClientRect();
    const rR = mR && mR.getBoundingClientRect();
    const copies = !!(mL && mL.querySelector('#rg-time') &&
      mL.querySelector('#rg-score') && mR && mR.querySelector('#rg-time'));
    const inside = !!(rL && rR &&
      rL.width > 10 && Math.abs(rL.width - rR.width) <= 1 &&
      rL.left >= eL.x - 2 && rL.right <= eL.x + eL.w + 2 &&
      rL.top >= eL.y - 2 && rL.bottom <= eL.y + eL.h + 2);
    ok('M03 HUD completo dentro de cada ojo (estereo)',
      s3.hudMode === 'per-eye' && s3.mirrors.hud === true &&
      realHud && getComputedStyle(realHud).opacity === '0' &&
      copies && inside,
      { modo: s3.hudMode, espejos: s3.mirrors, copias: copies,
        ojo: rL && [Math.round(rL.left), Math.round(rL.top),
          Math.round(rL.width), Math.round(rL.height)],
        marco: [Math.round(eL.x), Math.round(eL.y), Math.round(eL.w), Math.round(eL.h)] });

    /* ---------------- M04: con mando se ocultan los controles ---------------- */
    N().status(true, 'DualSense Wireless');
    await sleep(260);
    ok('M04 con mando en VR se ocultan joystick, correr y pausa',
      padOn() === true &&
      disp(stick()) === 'none' &&
      disp(runBtn()) === 'none' &&
      disp(document.getElementById('ras-pause-btn')) === 'none',
      { clase: padOn(), stick: disp(stick()), correr: disp(runBtn()),
        pausa: disp(document.getElementById('ras-pause-btn')) });

    /* ---------------- M05: al desconectar vuelven ---------------- */
    N().status(false, '');
    await sleep(260);
    ok('M05 al desconectar el mando vuelve el joystick tactil',
      padOn() === false &&
      disp(stick()) !== 'none',
      { clase: padOn(), stick: disp(stick()), correr: disp(runBtn()) });

    /* ---------------- M06: salida segura ---------------- */
    launch.click();
    await sleep(220);
    const panelOpen = VR.state().panelOpen;
    document.getElementById('vr-exit').click();
    await sleep(320);
    const s6 = VR.state();
    const hudVisible = realHud && getComputedStyle(realHud).opacity !== '0';
    ok('M06 salida segura desde el panel (sin quedar atrapado)',
      panelOpen === true && s6.active === false &&
      !document.body.classList.contains('vr-on') &&
      s6.mirrors.hud === false && hudVisible === true,
      { panel: panelOpen, activo: s6.active, espejos: s6.mirrors,
        hud_visible: hudVisible });

    /* ---------------- M07: el juego sigue normal ---------------- */
    await sleep(400);
    const s7 = D();
    ok('M07 despues de salir el juego sigue jugandose',
      s7.state === 'playing' &&
      document.body.classList.contains('ras-arena') &&
      disp(stick()) !== 'none',
      { estado: s7.state, stick: disp(stick()), puntaje: s7.score });

    /* ---------------- M08: X abre el panel tambien fuera de VR ---------------- */
    N().press('menu');
    await sleep(180);
    const menuOut1 = VR.state().panelOpen;
    N().press('menu');
    await sleep(180);
    const menuOut2 = VR.state().panelOpen;
    ok('M08 X abre el menu de ajustes VR fuera del modo',
      menuOut1 === true && menuOut2 === false,
      { abierto: menuOut1, cerrado: menuOut2 });

    /* Dejar el estado limpio para el arnes. */
    VR.disable();
    N().raw('0,0,0,0,0');
    N().status(false, '');
    window.__rasFakePad = null;
  } catch (e) {
    ok('suite sin excepciones', false, { error: String(e && e.stack || e) });
  }

  const fails = out.filter((o) => !o.pass).length;
  return JSON.stringify({ total: out.length, fails, out });
})();
