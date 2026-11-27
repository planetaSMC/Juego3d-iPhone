/* Suite funcional de la version iPhone/PWA (se evalua dentro de la pagina).
   Devuelve un informe JSON con cada caso. No modifica archivos.

   Cubre lo mismo que la suite Android (tools/test-game.js del proyecto
   original) mas los puntos propios de iOS: puente, Gamepad API, meta
   viewport, safe areas y pausa al pasar a segundo plano. */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const D = () => window.RasmaticGame.debug();
  const G = () => window.RasmaticCore.game;
  /* V19: cada app puede tener un prefijo de almacenamiento distinto. */
  const SKEY = (k) => (window.RasmaticStore && typeof RasmaticStore.key === 'function')
    ? RasmaticStore.key(k) : k;
  const tp = (x, z) => { const g = G(); g.player.x = x; g.player.z = z; };
  /* V20: las estaciones viven en las cajas de las estanterías del HTML. */
  const PH = () => (window.RasmaticPharmacyApi || (G() && G().pharmacy));
  const STA = [];
  function syncStations() {
    STA.length = 0;
    const ph = PH();
    if (!ph || !ph.stations) return;
    ph.stations.forEach(function (s) { STA[s.color] = { x: s.x, z: s.z, drug: s.drug }; });
  }
  syncStations();
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
  for (let i = 0; i < 120 && (!window.__ready || !window.RasmaticGame || D().state !== 'menu'); i++) {
    await sleep(250);
  }

  /* T01: arranque con menú y puente iOS */
  const ios = window.RasmaticIOS ? window.RasmaticIOS.debug() : null;
  ok('T01 arranque con menú y puente iOS',
    window.__ready === true && D().state === 'menu' &&
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

  /* T03: menú de inicio (V21, ya no se arranca en el mostrador). */
  const menuEl = document.getElementById('v21-start');
  const startBtn = document.getElementById('v21-start-btn');
  ok('T03 menú de inicio con INICIAR',
    D().state === 'menu' && menuEl && menuEl.classList.contains('on') &&
    startBtn && startBtn.textContent.trim() === 'INICIAR',
    { state: D().state, menu: menuEl && menuEl.className,
      boton: startBtn && startBtn.textContent });

  /* T04: iniciar con cuenta regresiva y temporizador congelado */
  startBtn.click();
  await until(() => D().state === 'countdown', 3000);
  const cdState = D().state;
  const cdTime = D().time;
  await until(() => D().state === 'playing', 7000);
  ok('T04 INICIAR + cuenta regresiva y partida',
    cdState === 'countdown' && cdTime === 180 && D().state === 'playing',
    { countdown: cdState, tiempo_congelado: cdTime, state: D().state });

  /* T05: primer cliente y color pedido */
  await until(() => D().customer === true && D().request >= 0, 20000);
  ok('T05 cliente y pedido', D().customer === true && D().request >= 0,
    { state: D().state, customer: D().customer, request: D().request, ui: D().ui, time: D().time });

  /* T06: recoger el color pedido (sin punto) */
  const req = D().request;
  if (req < 0) {
    skip('T06 recoger sin sumar', 'no hay pedido activo');
  } else {
  window.RasmaticGame._test.aimAtStation(req);
  await until(() => D().ui.action === 'RECOGER', 10000);
  const promptTake = D().ui.action;
  const aimAt = D().aim;
  const got = window.RasmaticGame.interact();
  await until(() => D().carrying === req, 5000);
  ok('T06 recoger con la mira sin sumar', got === true && D().carrying === req &&
    D().score.player === 0 && promptTake === 'RECOGER' && !!aimAt,
    { prompt: promptTake, carrying: D().carrying, score: D().score.player,
      mira: aimAt });
  }

  /* T07: entregar por la cinta y validar el color correcto */
  window.RasmaticGame._test.config({ beltSpeed: 24 });
  const entry = window.RasmaticPharmacyApi.conveyor.entry;
  tp(entry.x + 1.8, entry.z);
  await until(() => D().ui.action === 'COLOCAR', 8000);
  const promptGive = D().ui.action;
  const gave = window.RasmaticGame.interact();
  await until(() => D().score.player === 1, 16000);
  ok('T07 entrega correcta por cinta +1', gave === true && D().score.player === 1 &&
    D().carrying === -1 && promptGive === 'COLOCAR',
    { prompt: promptGive, score: D().score.player, cinta: D().belt });

  /* T08: nuevo cliente tras la entrega */
  await until(() => D().request >= 0 && D().customer === true, 20000);
  ok('T08 nuevo cliente', D().request >= 0 && D().customer === true,
    { request: D().request, customer: D().customer });

  /* T32: los clientes visibles no se superponen mientras caminan/esperan. */
  let minClientDist = 999;
  const tSep = Date.now();
  while (Date.now() - tSep < 4200) {
    const cs = D().clients;
    for (let i = 0; i < cs.length; i++) {
      for (let j = i + 1; j < cs.length; j++) {
        const d = Math.hypot(cs[i].x - cs[j].x, cs[i].z - cs[j].z);
        if (d < minClientDist) minClientDist = d;
      }
    }
    await sleep(120);
  }
  ok('T32 los clientes no se superponen entre sí', minClientDist >= 0.85,
    { distancia_minima: +minClientDist.toFixed(2), clientes: D().clients.length });


  const req2 = D().request;
  let wrong = -1;
  for (let off = 1; off < D().palette && wrong < 0; off++) {
    const cand = (req2 + off) % D().palette;
    window.RasmaticGame._test.aimAtStation(cand);
    await until(() => D().ui.action === 'RECOGER', 5000);
    if (D().ui.action !== 'RECOGER') continue;
    window.RasmaticGame.interact();
    await until(() => D().carrying >= 0, 5000);
    if (D().carrying === cand) wrong = cand;
  }
  if (wrong < 0) {
    skip('T09 entrega incorrecta', 'no se pudo aislar una caja equivocada');
  } else {
    const stockBefore = D().stockP[wrong];
    const holesBefore = D().shelf.consumed;
    window.RasmaticGame._test.config({ beltSpeed: 24 });
    const placed = window.RasmaticGame._test.placeBeltNow();
    const advanced = await until(() => D().request !== req2, 5000);
    let retried = false, holeKept = false;
    const tw = Date.now();
    while (Date.now() - tw < 22000) {
      const d = D();
      if (d.request === req2 && d.shelf.consumed > holesBefore) {
        retried = true;
        holeKept = d.stockP[wrong] === stockBefore;
        break;
      }
      await sleep(300);
    }
    ok('T09 entrega incorrecta: resta 1, deja hueco y vuelve el pedido',
      placed === true && advanced && retried && holeKept &&
      D().score.player === 0 && D().carrying === -1,
      { score: D().score.player, stock: D().stockP[wrong], antes: stockBefore,
        huecos: D().shelf.consumed, equivocado: wrong, pedido: req2 });
  }

  /* T10: doble entrega no duplica */
  tp(30, 20);
  await sleep(350);
  const again = window.RasmaticGame.interact();
  await sleep(400);
  ok('T10 sin puntos duplicados', again === false && D().score.player === 0,
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
  tp(20, 26);
  G().player.yaw = 0;
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
  await until(() => D().state === 'menu', 5000);
  const idleState = D().state;

  const buttons = [];
  for (let i = 0; i < 17; i++) buttons.push({ pressed: false, value: 0 });
  const fake = {
    index: 0, id: 'RASMATIC Test Pad', connected: true, mapping: 'standard',
    axes: [0, 0, 0, 0], buttons
  };
  window.__rasFakePad = fake;
  window.dispatchEvent(new Event('touchstart'));

  /* A en el menú inicia la cuenta regresiva. */
  buttons[0] = { pressed: true, value: 1 };
  await sleep(500);
  const startedByPad = D().state;
  buttons[0] = { pressed: false, value: 0 };
  await sleep(250);
  window.RasmaticGame._test.startNow();
  await until(() => D().state === 'playing', 5000);

  /* Stick izquierdo arriba -> avance (my = 1). */
  tp(20, 26);
  G().player.yaw = 0;
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

  ok('T17 mando fisico (Gamepad API)', padState.my === 1 && zPad1 < zPad0 - 0.3 &&
    runOn === true && runOff === false && padClass === true &&
    idleState === 'menu' && startedByPad === 'countdown',
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
  const diffBefore = localStorage.getItem(SKEY('rasmatic.botDifficulty'));
  const dset = window.RasmaticGame.setDifficulty('facil');
  const dfacil = window.RasmaticGame.getDifficulty();
  const dsaved = localStorage.getItem(SKEY('rasmatic.botDifficulty'));
  ok('T22 dificultad del bot por API y persistencia',
    dset === 'facil' && dfacil.id === 'facil' && dfacil.interval === 12 &&
    dfacil.speed === 0.75 && dsaved === 'facil',
    { devuelto: dset, estado: dfacil, guardado: dsaved });

  /* T23: panel de opciones real (botón, cuatro niveles, selección y cierre). */
  const optsBtn = document.getElementById('rg-opts-btn');
  const optsPanel = document.getElementById('rg-opts');
  const diffBtns = optsPanel ? optsPanel.querySelectorAll('[data-diff]') : [];
  if (optsBtn) optsBtn.click();
  const opened = !!(optsPanel && optsPanel.classList.contains('on'));
  const hardBtn = optsPanel && optsPanel.querySelector('[data-diff="extremo"]');
  if (hardBtn) hardBtn.click();
  const dhard = window.RasmaticGame.getDifficulty();
  const marked = !!(hardBtn && hardBtn.classList.contains('on'));
  const okBtn = document.getElementById('rg-opts-ok');
  if (okBtn) okBtn.click();
  const closed = !(optsPanel && optsPanel.classList.contains('on'));
  ok('T23 panel de opciones de dificultad',
    !!optsBtn && diffBtns.length === 4 && opened && dhard.id === 'extremo' &&
    dhard.interval === 3.5 && marked && closed,
    { boton: !!optsBtn, opciones: diffBtns.length, abierto: opened,
      elegido: dhard.id, intervalo: dhard.interval, marcado: marked, cerrado: closed });
  window.RasmaticGame.setDifficulty('normal');

  /* T24: acción de la mira centrada, cómoda y sin tapar el joystick. */
  const reqNow = D().request;
  if (reqNow >= 0) window.RasmaticGame._test.aimAtStation(reqNow);
  const nearAct = await until(
    () => ['RECOGER', 'COLOCAR', 'ENTREGAR'].indexOf(D().ui.action) >= 0, 12000);
  await sleep(500);
  /* El mando falso de T17 ya no existe: el joystick tactil debe volver. */
  window.dispatchEvent(new Event('touchstart'));
  await sleep(1000);
  const actEl = document.getElementById('rg-act');
  const actRect = actEl.getBoundingClientRect();
  const actCx = actRect.left + actRect.width / 2;
  const stickEl = document.getElementById('ras-stick');
  const stickRect = stickEl.getBoundingClientRect();
  const stickVisible = getComputedStyle(stickEl).display !== 'none';
  const overlapsStick = stickVisible &&
    !(actRect.right <= stickRect.left || actRect.left >= stickRect.right ||
      actRect.bottom <= stickRect.top || actRect.top >= stickRect.bottom);
  const centered = Math.abs(actCx - innerWidth / 2) <= 1.5;
  const actSafe = actRect.left >= 8 && actRect.right <= innerWidth - 8 &&
    actRect.top >= 8 && actRect.bottom <= innerHeight - 8;
  const touchable = actRect.width >= 120 && actRect.height >= 50;
  ok('T24 acción de la mira centrada, táctil y sin tapar el joystick',
    nearAct && actEl.classList.contains('on') && centered && actSafe &&
    touchable && !overlapsStick,
    { aviso: D().ui.action, centro: +actCx.toFixed(1), ventana: innerWidth,
      caja: [Math.round(actRect.left), Math.round(actRect.top),
             Math.round(actRect.width), Math.round(actRect.height)],
      joystick_visible: stickVisible, solape: overlapsStick });

  /* T25: jerarquia y legibilidad del HUD dentro del area segura. */
  const hudIds = ['rg-score', 'rg-time', 'rg-req', 'rg-carry', 'rg-toast', 'rg-hint'];
  const rectById = (id) => {
    const el = document.getElementById(id);
    return el ? el.getBoundingClientRect() : null;
  };
  const inView = (r, m) => !!r && r.left >= m && r.top >= m &&
    r.right <= innerWidth - m && r.bottom <= innerHeight - m;
  const panelsIn = hudIds.every((id) => {
    const el = document.getElementById(id);
    if (!el) return false;
    if (getComputedStyle(el).display === 'none') return true;
    return inView(rectById(id), 6);
  });
  const scoreB = document.querySelector('#rg-score .rg-team b');
  const reqImg = document.getElementById('rg-req-img');
  const reqImgRect = reqImg ? reqImg.getBoundingClientRect() : null;
  const timeEl = document.getElementById('rg-time');
  const hintEl = document.getElementById('rg-hint');
  const fontPx = (el) => el ? parseFloat(getComputedStyle(el).fontSize) : 0;
  const noClip = (el) => !el || el.scrollWidth <= el.clientWidth + 1;
  const leftCol = document.getElementById('rg-left');
  const reqImgOk = !!reqImgRect && reqImgRect.width >= 60 && reqImgRect.height >= 38 &&
    !!reqImg.getAttribute('src');
  ok('T25 textos legibles, imagen de pedido y área segura',
    !!leftCol && panelsIn && fontPx(scoreB) >= 28 && fontPx(timeEl) >= 26 &&
    reqImgOk && noClip(hintEl),
    { paneles: panelsIn, columna: !!leftCol,
      fuentes: { marcador: fontPx(scoreB), reloj: fontPx(timeEl) },
      pedido_img: reqImgRect && [Math.round(reqImgRect.width), Math.round(reqImgRect.height)],
      tiene_src: !!(reqImg && reqImg.getAttribute('src')),
      pista_sin_corte: noClip(hintEl) });

  /* T26: tamaño individual del HUD por API (panel y tipografía). */
  const uiBefore = window.RasmaticGame.ui.state();
  const uiKeyBefore = localStorage.getItem(SKEY('rasmatic.ui.v1'));
  const scoreEl = document.getElementById('rg-score');
  const pointsEl = document.querySelector('#rg-score .rg-team b');
  window.RasmaticGame.ui.reset('normal', null, { save: false });
  window.RasmaticGame.ui.reset('vr', null, { save: false });
  await sleep(80);
  const scoreRect0 = scoreEl.getBoundingClientRect();
  const pointsFont0 = parseFloat(getComputedStyle(pointsEl).fontSize);
  window.RasmaticGame.ui.set('normal', 'score', { scale: 1.35 }, { save: false });
  window.RasmaticGame.ui.set('normal', 'points', { scale: 1.3 }, { save: false });
  await sleep(80);
  const scoreRect1 = scoreEl.getBoundingClientRect();
  const pointsFont1 = parseFloat(getComputedStyle(pointsEl).fontSize);
  const grewPanel = scoreRect1.width > scoreRect0.width * 1.15 &&
    scoreRect1.height > scoreRect0.height * 1.1;
  const grewFont = pointsFont1 > pointsFont0 * 1.2;
  ok('T26 tamano individual del HUD (escala y tipografia)',
    grewPanel && grewFont,
    { panel: { antes: [Math.round(scoreRect0.width), Math.round(scoreRect0.height)],
               despues: [Math.round(scoreRect1.width), Math.round(scoreRect1.height)] },
      fuente: { antes: +pointsFont0.toFixed(1), despues: +pointsFont1.toFixed(1) } });

  /* T27: posición horizontal/vertical y límites del área visible. */
  window.RasmaticGame.ui.reset('normal', null, { save: false });
  await sleep(60);
  const scoreBase = scoreEl.getBoundingClientRect();
  window.RasmaticGame.ui.set('normal', 'score', { dx: 20, dy: 15 }, { save: false });
  await sleep(60);
  const scoreMoved = scoreEl.getBoundingClientRect();
  const moveX = scoreMoved.left - scoreBase.left;
  const moveY = scoreMoved.top - scoreBase.top;
  const movedOk = Math.abs(moveX - 20) <= 2 && Math.abs(moveY - 15) <= 2;
  window.RasmaticGame.ui.set('normal', 'score', { dx: -40, dy: -40 }, { save: false });
  window.RasmaticGame.ui.set('normal', 'time', { dx: 40, dy: 40 }, { save: false });
  await sleep(80);
  const scoreEdge = scoreEl.getBoundingClientRect();
  const timeEdge = timeEl.getBoundingClientRect();
  const safeOk = scoreEdge.left >= -0.5 && scoreEdge.top >= -0.5 &&
    timeEdge.right <= innerWidth + 0.5 && timeEdge.bottom <= innerHeight + 0.5;
  ok('T27 posicion horizontal/vertical y limite de pantalla',
    movedOk && safeOk,
    { desplazamiento: { x: +moveX.toFixed(1), y: +moveY.toFixed(1) },
      marcador: [Math.round(scoreEdge.left), Math.round(scoreEdge.top)],
      reloj: [Math.round(timeEdge.right), Math.round(timeEdge.bottom)],
      ventana: [innerWidth, innerHeight] });

  /* T28: persistencia versionada y tolerancia a datos inválidos. */
  window.RasmaticGame.ui.set('normal', 'time',
    { scale: 1.2, dx: 8, dy: -6 }, { save: true, apply: true });
  let storedUi = null;
  try { storedUi = JSON.parse(localStorage.getItem(SKEY('rasmatic.ui.v1')) || 'null'); } catch (e) { storedUi = null; }
  const persisted = !!storedUi && storedUi.v === 1 && !!storedUi.profiles &&
    !!storedUi.profiles.normal && !!storedUi.profiles.normal.time &&
    storedUi.profiles.normal.time.scale === 1.2;
  window.RasmaticGame.ui.set('normal', 'time', { scale: 1 }, { save: false });
  const reloadedUi = window.RasmaticGame.ui.load();
  const reloadedOk = reloadedUi.normal.time.scale === 1.2;
  localStorage.setItem(SKEY('rasmatic.ui.v1'),
    '{"v":1,"profiles":{"normal":{"time":{"scale":99,"dx":"x","dy":null}},"vr":null}}');
  const recoveredUi = window.RasmaticGame.ui.load();
  const recoveredOk = recoveredUi.normal.time.scale >= 0.6 &&
    recoveredUi.normal.time.scale <= 1.5 && recoveredUi.normal.time.dx === 0 &&
    recoveredUi.vr.time.scale === 1;
  ok('T28 persistencia versionada y datos invalidos',
    persisted && reloadedOk && recoveredOk,
    { clave: SKEY('rasmatic.ui.v1'), version: storedUi && storedUi.v,
      guardado: storedUi && storedUi.profiles && storedUi.profiles.normal &&
        storedUi.profiles.normal.time && storedUi.profiles.normal.time.scale,
      recargado: reloadedUi.normal.time.scale,
      recuperado: recoveredUi.normal.time });

  /* T29: perfiles normal y VR separados; restauración por elemento y perfil. */
  window.RasmaticGame.ui.reset('normal', null, { save: false });
  window.RasmaticGame.ui.reset('vr', null, { save: false });
  window.RasmaticGame.ui.set('normal', 'score', { scale: 1.25 }, { save: false });
  window.RasmaticGame.ui.set('vr', 'score', { scale: 0.8 }, { save: false });
  const pNormal = window.RasmaticGame.ui.get('normal').score.scale;
  const pVr = window.RasmaticGame.ui.get('vr').score.scale;
  const rootStyle = getComputedStyle(document.documentElement);
  const separate = pNormal === 1.25 && pVr === 0.8 &&
    rootStyle.getPropertyValue('--ui-score-s').trim() === '1.25' &&
    rootStyle.getPropertyValue('--ui-score-sv').trim() === '0.8';
  window.RasmaticGame.ui.reset('normal', 'score', { save: false });
  const afterEl = window.RasmaticGame.ui.get('normal').score.scale;
  const vrStill = window.RasmaticGame.ui.get('vr').score.scale;
  window.RasmaticGame.ui.reset('vr', null, { save: false });
  const vrReset = window.RasmaticGame.ui.get('vr').score.scale;
  ok('T29 perfiles separados y restauracion por elemento/perfil',
    separate && afterEl === 1 && vrStill === 0.8 && vrReset === 1,
    { normal: pNormal, vr: pVr, tras_elemento: afterEl,
      vr_intacto: vrStill, vr_restablecido: vrReset });

  /* T30: aplicar en vivo sin romper partida, joystick ni gamepad. */
  const stateBefore = D().state;
  const scoreBefore = D().score.player;
  const timeBefore = D().time;
  const stickEl2 = document.getElementById('ras-stick');
  const padApi = typeof navigator.getGamepads === 'function';
  window.RasmaticGame.ui.set('normal', 'toast',
    { scale: 1.2, dx: 12, dy: 20 }, { save: false });
  window.RasmaticGame.ui.set('normal', 'hint',
    { scale: 1.1, dy: -10 }, { save: false });
  window.RasmaticGame.ui.set('normal', 'act', { scale: 1.1 }, { save: false });
  await sleep(300);
  const stateAfter = D().state;
  const sceneOk = stateAfter === stateBefore && stateAfter === 'playing' &&
    D().score.player === scoreBefore && D().time <= timeBefore;
  const stickOk = !!stickEl2 && getComputedStyle(stickEl2).display !== 'none';
  const openedUi = window.RasmaticGame.ui.open();
  const uiPanel = document.getElementById('rg-ui');
  const panelVisible = !!uiPanel && uiPanel.classList.contains('on');
  const needBtns = ['rg-ui-apply', 'rg-ui-cancel', 'rg-ui-reset-el',
    'rg-ui-reset-all', 'rg-ui-preview-btn'];
  const panelButtons = needBtns.every((id) => !!document.getElementById(id));
  const previewBtn = document.getElementById('rg-ui-preview-btn');
  if (previewBtn) previewBtn.click();
  const previewOff = !!(uiPanel && uiPanel.classList.contains('no-preview'));
  if (previewBtn) previewBtn.click();
  const previewOnAgain = !(uiPanel && uiPanel.classList.contains('no-preview'));
  const beforeCancel = window.RasmaticGame.ui.get('normal').score.scale;
  const scaleInput = document.getElementById('rg-ui-scale');
  if (scaleInput) {
    scaleInput.value = '140';
    scaleInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const cancelBtn = document.getElementById('rg-ui-cancel');
  if (cancelBtn) cancelBtn.click();
  const afterCancel = window.RasmaticGame.ui.get('normal').score.scale;
  const cancelOk = afterCancel === beforeCancel &&
    !(uiPanel && uiPanel.classList.contains('on'));
  const reopenedUi = window.RasmaticGame.ui.open();
  const vrTab = uiPanel && uiPanel.querySelector('[data-uiprofile="vr"]');
  if (vrTab) vrTab.click();
  const vrTabOn = !!(vrTab && vrTab.classList.contains('on'));
  const applyBtn = document.getElementById('rg-ui-apply');
  if (applyBtn) applyBtn.click();
  const panelClosed = !(uiPanel && uiPanel.classList.contains('on'));
  const sceneStill = D().state === 'playing';
  ok('T30 aplicar en vivo sin romper partida ni controles',
    sceneOk && stickOk && padApi && openedUi && panelVisible && panelButtons &&
    previewOff && previewOnAgain && cancelOk && reopenedUi && vrTabOn &&
    panelClosed && sceneStill,
    { estado: stateAfter, tiempo: D().time, joystick: stickOk,
      gamepad_api: padApi, abierto: openedUi, panel: panelVisible,
      botones: panelButtons, vista_previa: previewOff && previewOnAgain,
      cancelar_descarta: cancelOk, reabierto: reopenedUi,
      pestana_vr: vrTabOn, cerrado: panelClosed, escena: sceneStill });

  /* T31: plataforma detectada y aviso remoto sin indicadores duplicados. */
  const P = window.RasmaticPlatform;
  const platformClass = /ras-platform-(ios|android|windows|mac|other)/.test(
    document.documentElement.className);
  const htBarEl = document.getElementById('ht-bar');
  const remoteWas = document.body.classList.contains('ras-remote-linked');
  const remoteOnRes = P ? P.setRemote(true) : false;
  const remoteOn = remoteOnRes === true &&
    document.body.classList.contains('ras-remote-linked') &&
    (!P.isMobile || !htBarEl || getComputedStyle(htBarEl).display === 'none');
  if (P) P.setRemote(remoteWas);
  const remoteOff = !document.body.classList.contains('ras-remote-linked');
  ok('T31 plataforma correcta y Head Tracking remoto sin duplicados',
    !!P && platformClass && remoteOn && remoteOff,
    { plataforma: P && P.id, movil: P && P.isMobile,
      escritorio: P && P.isDesktop, clase: platformClass,
      ht_remoto: remoteOn, restaurado: remoteOff });


  if (uiKeyBefore === null) {
    localStorage.removeItem(SKEY('rasmatic.ui.v1'));
    window.RasmaticGame.ui.load();
  } else {
    window.RasmaticGame.ui.setProfile('normal', uiBefore.profiles.normal);
    window.RasmaticGame.ui.setProfile('vr', uiBefore.profiles.vr);
  }

  /* Restaura la preferencia previa del equipo de prueba. */
  if (diffBefore) window.RasmaticGame.setDifficulty(diffBefore);
  else { window.RasmaticGame.setDifficulty('normal'); localStorage.removeItem(SKEY('rasmatic.botDifficulty')); }

  } catch (e) {
    ok('suite interrumpida', false, { error: String(e && e.message), stack: String(e && e.stack).split('\n').slice(0, 4) });
  }

  const fails = out.filter((o) => !o.pass).length;
  return JSON.stringify({ fails, total: out.length, out }, null, 1);
})()
