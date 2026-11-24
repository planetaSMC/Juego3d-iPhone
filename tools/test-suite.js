/* Suite funcional de la version iPhone/PWA (se evalua dentro de la pagina).
   Devuelve un informe JSON con cada caso. No modifica archivos.

   Cubre lo mismo que la suite Android (tools/test-game.js del proyecto
   original) mas los puntos propios de iOS: puente, Gamepad API, meta
   viewport, safe areas y pausa al pasar a segundo plano. */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const D = () => window.RasmaticGame.debug();
  const G = () => window.RasmaticCore.game;
  const tp = (x, z) => { const g = G(); g.player.x = x; g.player.z = z; };
  const STA = [
    { x: -3.85, z: -28 }, { x: 3.85, z: -36 }, { x: -3.85, z: -44 },
    { x: 3.85, z: -52 }, { x: -3.85, z: -60 }, { x: 3.85, z: -68 }
  ];
  const out = [];
  const ok = (name, cond, data) => out.push({ name, pass: !!cond, data });
  const skip = (name, why) => out.push({ name, pass: false, data: { omitido: why } });

  /* El render puede ir a pocos fps (WebGL por software): nunca se espera un
     tiempo fijo, se sondea la condicion. */
  const until = async (pred, ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (pred()) return true;
      await sleep(150);
    }
    return false;
  };

  try {
  /* La escena tarda en construirse: esperar el estado inicial. */
  for (let i = 0; i < 120 && (!window.__ready || !window.RasmaticGame || D().state !== 'idle'); i++) {
    await sleep(250);
  }

  /* T01: arranque y puente iOS */
  const ios = window.RasmaticIOS ? window.RasmaticIOS.debug() : null;
  ok('T01 arranque en idle con puente iOS',
    window.__ready === true && D().state === 'idle' &&
    !!ios && ios.ios === true && ios.version === 'ios-1.1' &&
    document.documentElement.classList.contains('ras-android'),
    { ready: window.__ready, state: D().state, ios });

  /* T02: HUD de la partida */
  const hud = {
    score: !!document.getElementById('rg-score'),
    time: document.getElementById('rg-time') && document.getElementById('rg-time').textContent,
    req: !!document.getElementById('rg-req'),
    act: document.getElementById('rg-act') && document.getElementById('rg-act').textContent
  };
  ok('T02 HUD completo (3:00, marcador, pedido)',
    hud.score && hud.time === '3:00' && hud.req && hud.act === 'JUGAR', hud);

  /* T03: aviso al acercarse al encargado */
  tp(2.0, 27.0);
  await until(() => D().ui.action === 'JUGAR', 10000);
  ok('T03 aviso de interaccion', D().ui.action === 'JUGAR' &&
    D().ui.hint === 'Interactuar para jugar', D().ui);

  /* T04: iniciar partida */
  tp(0, 24.6);
  await until(() => D().ui.action === 'JUGAR', 10000);
  const started = window.RasmaticGame.interact();
  await until(() => D().state === 'playing', 5000);
  ok('T04 inicia la partida', started === true && D().state === 'playing',
    { state: D().state });

  /* T05: primer cliente y color pedido */
  await until(() => D().customer === true && D().request >= 0, 20000);
  ok('T05 cliente y pedido', D().customer === true && D().request >= 0,
    { state: D().state, customer: D().customer, request: D().request, ui: D().ui, time: D().time });

  /* T06: recoger el color pedido (sin punto) */
  const req = D().request;
  if (req < 0) {
    skip('T06 recoger sin sumar', 'no hay pedido activo');
  } else {
  tp(STA[req].x * 0.9, STA[req].z);
  await until(() => D().ui.action === 'RECOGER', 10000);
  const promptTake = D().ui.action;
  const got = window.RasmaticGame.interact();
  await until(() => D().carrying === req, 5000);
  ok('T06 recoger sin sumar', got === true && D().carrying === req &&
    D().score.player === 0 && promptTake === 'RECOGER',
    { prompt: promptTake, carrying: D().carrying, score: D().score.player });
  }

  /* T07: entregar el color correcto */
  tp(-3.6, 24.6);
  await until(() => D().ui.action === 'ENTREGAR', 10000);
  const promptGive = D().ui.action;
  const gave = window.RasmaticGame.interact();
  await until(() => D().score.player === 1, 5000);
  ok('T07 entrega correcta +1', gave === true && D().score.player === 1 &&
    D().carrying === -1 && promptGive === 'ENTREGAR',
    { prompt: promptGive, score: D().score.player });

  /* T08: nuevo cliente tras la entrega */
  await until(() => D().request >= 0 && D().customer === true, 20000);
  ok('T08 nuevo cliente', D().request >= 0 && D().customer === true,
    { request: D().request, customer: D().customer });

  /* T09: entregar un color equivocado no suma */
  const req2 = D().request;
  const wrong = (req2 + 1) % 6;
  tp(STA[wrong].x * 0.9, STA[wrong].z);
  await until(() => D().ui.action === 'RECOGER', 10000);
  window.RasmaticGame.interact();
  await until(() => D().carrying === wrong, 5000);
  const stockBefore = D().stockP[wrong];
  tp(-3.6, 24.6);
  await until(() => D().ui.action === 'ENTREGAR', 10000);
  const bad = window.RasmaticGame.interact();
  await until(() => D().carrying === -1, 5000);
  ok('T09 entrega incorrecta', bad === true && D().score.player === 1 &&
    D().carrying === -1 && D().stockP[wrong] === stockBefore + 1,
    { score: D().score.player, stock: D().stockP[wrong], antes: stockBefore });

  /* T10: doble entrega no duplica */
  const again = window.RasmaticGame.interact();
  await sleep(400);
  ok('T10 sin puntos duplicados', again === false && D().score.player === 1,
    { again, score: D().score.player });

  /* T11: ciclo del bot con el CNC. Se espera a que termine el ciclo en curso
     para que el punto no caiga fuera de la medicion. */
  for (let i = 0; i < 80 && D().bot; i++) await sleep(250);
  await sleep(600);
  const score0 = D().score.bot;
  window.RasmaticGame._test.botNow();
  const t0 = Date.now();
  let sawBox = false, sawPhases = {};
  while (Date.now() - t0 < 40000 && D().score.bot === score0) {
    const d = D();
    if (d.bot) {
      sawPhases[d.bot.phase] = true;
      if (d.cnc.box) sawBox = true;
    }
    await sleep(250);
  }
  const cycle = (Date.now() - t0) / 1000;
  ok('T11 el bot sumo con el CNC', D().score.bot === score0 + 1 && sawBox,
    { scoreBot: D().score.bot, fases: Object.keys(sawPhases), ciclo: +cycle.toFixed(1) });

  /* T12: fin de partida */
  window.RasmaticGame._test.timeLeft(2);
  await until(() => D().state === 'over', 20000);
  await until(() => document.getElementById('rg-end').classList.contains('on'), 5000);
  const endOpen = document.getElementById('rg-end').classList.contains('on');
  const scoreEnd = D().score.player;
  const endText = document.getElementById('rg-end-title').textContent;
  ok('T12 fin sin clientes ni puntos', D().state === 'over' && endOpen &&
    D().customer === false && D().botCustomer === false &&
    D().score.player === scoreEnd && /GANASTE|BOT GANA|EMPATE/.test(endText),
    { state: D().state, endOpen, score: D().score.player, titulo: endText });

  /* T13: volver a jugar */
  const replay = window.RasmaticGame.interact();
  await until(() => D().state === 'playing', 5000);
  const endNow = document.getElementById('rg-end').classList.contains('on');
  ok('T13 revancha', replay === true && D().state === 'playing' &&
    D().score.player === 0 && D().score.bot === 0 && !endNow,
    { state: D().state, score: D().score, endOpen: endNow });

  /* T14: joystick tactil (pointer events reales sobre #ras-stick). */
  tp(0, 30);
  await sleep(400);
  const zb0 = G().player.z;
  const stick = document.getElementById('ras-stick');
  const sr = stick.getBoundingClientRect();
  const scx = sr.left + sr.width / 2, scy = sr.top + sr.height / 2;
  const origStickCap = stick.setPointerCapture;
  stick.setPointerCapture = function () {};
  const se = (type, x, y) => stick.dispatchEvent(new PointerEvent(type, {
    pointerId: 7, clientX: x, clientY: y, bubbles: true, pointerType: 'touch', isPrimary: true
  }));
  se('pointerdown', scx, scy);
  se('pointermove', scx, scy - sr.height * 0.4);
  let zb1 = zb0;
  for (let i = 0; i < 20 && zb1 > zb0 - 0.4; i++) {
    await sleep(250);
    zb1 = G().player.z;
  }
  se('pointerup', scx, scy - sr.height * 0.4);
  stick.setPointerCapture = origStickCap;
  await sleep(300);
  ok('T14 joystick tactil mueve', zb1 < zb0 - 0.4,
    { z0: +zb0.toFixed(2), z1: +zb1.toFixed(2), alto: Math.round(sr.height) });

  /* T15: arrastre de camara cambia el giro */
  const yaw0 = G().player.yaw;
  const cv = document.querySelector('canvas');
  const origCap = cv.setPointerCapture;
  cv.setPointerCapture = function () {};
  const pe = (type, x, y) => cv.dispatchEvent(new PointerEvent(type, {
    pointerId: 1, clientX: x, clientY: y, bubbles: true, pointerType: 'touch', isPrimary: true
  }));
  pe('pointerdown', 200, 500);
  pe('pointermove', 90, 500);
  pe('pointerup', 90, 500);
  cv.setPointerCapture = origCap;
  await sleep(400);
  ok('T15 camara por arrastre', Math.abs(G().player.yaw - yaw0) > 0.2,
    { yaw0: +yaw0.toFixed(2), yaw1: +G().player.yaw.toFixed(2) });

  /* T16: pausa al pasar a segundo plano (mismo camino que usa iOS). */
  window.RasmaticAndroid.onAppPause();
  await sleep(200);
  const pausedAfter = window.RasmaticCore.isPaused();
  window.RasmaticAndroid.onAppResume();
  await sleep(200);
  const pausedAfterResume = window.RasmaticCore.isPaused();
  ok('T16 pausa al pasar a segundo plano', pausedAfter === true && pausedAfterResume === false,
    { pausado: pausedAfter, reanudado: pausedAfterResume });

  /* T17: Gamepad API -> mismo mapeo que Android (A/R1/R2 interactuar,
     L1/L2 correr, sticks mover/mirar). Se inyecta un mando falso. */
  window.RasmaticGame._test.timeLeft(0.4);
  await until(() => D().state === 'over', 15000);
  if (D().state === 'over') window.RasmaticGame.onBack();
  await until(() => D().state === 'idle', 5000);
  const idleState = D().state;

  const buttons = [];
  for (let i = 0; i < 17; i++) buttons.push({ pressed: false, value: 0 });
  const fake = {
    index: 0, id: 'RASMATIC Test Pad', connected: true, mapping: 'standard',
    axes: [0, 0, 0, 0], buttons
  };
  window.__rasFakePad = fake;
  window.dispatchEvent(new Event('touchstart'));

  /* Stick izquierdo arriba -> avance (my = 1). */
  tp(0, 30);
  fake.axes[1] = -1;
  await sleep(500);
  const padState = window.RasmaticInput.debug().pad;
  const zPad0 = G().player.z;
  let zPad1 = zPad0;
  for (let i = 0; i < 12 && zPad1 > zPad0 - 0.3; i++) {
    await sleep(250);
    zPad1 = G().player.z;
  }
  fake.axes[1] = 0;

  /* Gatillo L2 (indice 6) -> correr. */
  buttons[6] = { pressed: true, value: 1 };
  await sleep(300);
  const runOn = window.RasmaticInput.debug().pad.run;
  buttons[6] = { pressed: false, value: 0 };
  await sleep(300);
  const runOff = window.RasmaticInput.debug().pad.run;

  /* El aviso de conexion oculta el joystick tactil (igual que en Android). */
  const padClass = document.body.classList.contains('ras-pad-on');

  /* Boton A (indice 0) -> interactuar. En idle junto al encargado inicia. */
  tp(0, 24.6);
  await sleep(700);
  buttons[0] = { pressed: true, value: 1 };
  await sleep(600);
  const startedByPad = D().state;
  buttons[0] = { pressed: false, value: 0 };
  await sleep(300);

  ok('T17 mando fisico (Gamepad API)', padState.my === 1 && zPad1 < zPad0 - 0.3 &&
    runOn === true && runOff === false && padClass === true &&
    idleState === 'idle' && startedByPad === 'playing',
    { my: padState.my, z0: +zPad0.toFixed(2), z1: +zPad1.toFixed(2),
      runOn, runOff, padClass, idleState, startedByPad });

  window.__rasFakePad = null;

  /* T18: recorte seguro y sin desbordes (safe areas / 100dvh). */
  const de = document.documentElement;
  const body = document.body;
  const overflowX = de.scrollWidth - de.clientWidth;
  const overflowY = de.scrollHeight - de.clientHeight;
  const cRect = cv.getBoundingClientRect();
  ok('T18 escena a pantalla completa sin scroll',
    overflowX <= 1 && overflowY <= 1 &&
    Math.abs(cRect.width - innerWidth) <= 1 && Math.abs(cRect.height - innerHeight) <= 1 &&
    body.getBoundingClientRect().height > 0,
    { overflowX, overflowY, canvas: [Math.round(cRect.width), Math.round(cRect.height)],
      ventana: [innerWidth, innerHeight], bodyH: Math.round(body.getBoundingClientRect().height) });

  /* T19: metadatos de app instalable y ausencia de rutas Android. */
  const viewport = document.querySelector('meta[name="viewport"]').getAttribute('content');
  const appleCapable = document.querySelector('meta[name="apple-mobile-web-app-capable"]');
  const manifestHref = document.querySelector('link[rel="manifest"]');
  const appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
  const badRefs = [...document.querySelectorAll('[src],[href]')]
    .map((e) => e.getAttribute('src') || e.getAttribute('href'))
    .filter((u) => u && u.indexOf('android/') >= 0);
  ok('T19 metadatos iOS y sin rutas android/',
    /viewport-fit=cover/.test(viewport) && /maximum-scale=1/.test(viewport) &&
    !!appleCapable && !!manifestHref && !!appleIcon && badRefs.length === 0,
    { viewport, appleCapable: appleCapable && appleCapable.content,
      manifest: manifestHref && manifestHref.getAttribute('href'),
      icono: appleIcon && appleIcon.getAttribute('href'), badRefs });

  /* T20: el boton "Salir" del menu de pausa no se muestra en iOS
     (no existe forma de cerrar una app por codigo). */
  const exitBtn = document.querySelector('#ras-pause [data-act="exit"]');
  const exitDisplay = exitBtn ? getComputedStyle(exitBtn).display : 'sin-menu';
  ok('T20 sin boton Salir inutil', exitDisplay === 'none' || exitDisplay === 'sin-menu',
    { display: exitDisplay });

  /* T21: service worker (solo aplica bajo http/https; en la app WKWebView
     el esquema rasmatic:// no lo soporta y se omite). */
  let swState = 'no-aplica';
  const swSupported = 'serviceWorker' in navigator && /^https?:$/.test(location.protocol);
  if (swSupported) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      swState = reg ? (reg.active ? 'activo' : (reg.installing ? 'instalando' : 'esperando')) : 'sin-registro';
    } catch (e) {
      swState = 'error: ' + e.message;
    }
  }
  ok('T21 service worker para uso sin conexion', !swSupported || swState === 'activo',
    { soportado: swSupported, estado: swState, protocolo: location.protocol });

  /* T22: dificultad del bot por API y persistencia. */
  const diffBefore = localStorage.getItem('rasmatic.botDifficulty');
  const dset = window.RasmaticGame.setDifficulty('facil');
  const dfacil = window.RasmaticGame.getDifficulty();
  const dsaved = localStorage.getItem('rasmatic.botDifficulty');
  ok('T22 dificultad del bot por API y persistencia',
    dset === 'facil' && dfacil.id === 'facil' && dfacil.interval === 12 &&
    dfacil.speed === 0.75 && dsaved === 'facil',
    { devuelto: dset, estado: dfacil, guardado: dsaved });

  /* T23: panel de opciones real (botón, tres niveles, selección y cierre). */
  const optsBtn = document.getElementById('rg-opts-btn');
  const optsPanel = document.getElementById('rg-opts');
  const diffBtns = optsPanel ? optsPanel.querySelectorAll('[data-diff]') : [];
  if (optsBtn) optsBtn.click();
  const opened = !!(optsPanel && optsPanel.classList.contains('on'));
  const hardBtn = optsPanel && optsPanel.querySelector('[data-diff="dificil"]');
  if (hardBtn) hardBtn.click();
  const dhard = window.RasmaticGame.getDifficulty();
  const marked = !!(hardBtn && hardBtn.classList.contains('on'));
  const okBtn = document.getElementById('rg-opts-ok');
  if (okBtn) okBtn.click();
  const closed = !(optsPanel && optsPanel.classList.contains('on'));
  ok('T23 panel de opciones de dificultad',
    !!optsBtn && diffBtns.length === 3 && opened && dhard.id === 'dificil' &&
    marked && closed,
    { boton: !!optsBtn, opciones: diffBtns.length, abierto: opened,
      elegido: dhard.id, marcado: marked, cerrado: closed });

  /* Restaura la preferencia previa del equipo de prueba. */
  if (diffBefore) window.RasmaticGame.setDifficulty(diffBefore);
  else { window.RasmaticGame.setDifficulty('normal'); localStorage.removeItem('rasmatic.botDifficulty'); }

  } catch (e) {
    ok('suite interrumpida', false, { error: String(e && e.message), stack: String(e && e.stack).split('\n').slice(0, 4) });
  }

  const fails = out.filter((o) => !o.pass).length;
  return JSON.stringify({ fails, total: out.length, out }, null, 1);
})()
