/* ============================================================
   RASMATIC · VR Calibrator (Windows)
   ------------------------------------------------------------
   La interfaz no guarda estado propio: todo pasa por el proceso
   principal, que es la única fuente de verdad. El iframe ejecuta
   el mismo juego con la vista central (?embed=1) y recibe los
   valores por la API RasmaticVR.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  function api(channel, payload) {
    if (!window.calibrator || typeof window.calibrator.invoke !== 'function') {
      return Promise.resolve({ ok: false, code: 'no_bridge', msg: 'Sin puente con el proceso principal' });
    }
    return window.calibrator.invoke(channel, payload);
  }

  var S = {
    info: null,
    spec: null,
    status: null,
    cal: {},
    profiles: [],
    activeProfile: '',
    pairing: null,
    telemetry: null,
    telemetryAt: 0,
    gameReady: false,
    frameWin: null,
    view: 'center',
    paused: false,
    hudOff: false,
    pending: {},
    pendingTimer: 0,
    dragging: false,
    draggingKey: '',
    lastStats: null,
    fps: 0,
    lastStatusSig: '',
    lastLocalInput: 0,
    fsAddedMax: false,
    booted: false
  };

  /* ---------------- formato ---------------- */
  function fmt(key, v) {
    var c = S.spec && S.spec.controls ? S.spec.controls[key] : null;
    if (!c) return String(v);
    if (key === 'aspect') {
      return Number(v) < 0.01 ? 'Auto' : Number(v).toFixed(2).replace('.', ',') + ':1';
    }
    var mul = c.mul || 1;
    var s = (Number(v) * mul).toFixed(c.dec || 0);
    if ((c.dec || 0) > 0) s = s.replace('.', ',');
    return s + (c.suffix || '');
  }

  function fmtTime(ts) {
    var d = new Date(Number(ts) || 0);
    return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function fmtAgo(ts) {
    var t = Number(ts) || 0;
    if (!t) return 'nunca';
    var d = Math.max(0, Date.now() - t);
    if (d < 60000) return 'hace ' + Math.max(1, Math.round(d / 1000)) + ' s';
    if (d < 3600000) return 'hace ' + Math.round(d / 60000) + ' min';
    if (d < 86400000) return 'hace ' + Math.round(d / 3600000) + ' h';
    return 'hace ' + Math.round(d / 86400000) + ' d';
  }

  function isLocked() { return !!(S.status && S.status.lock); }
  function hasPin() { return !!(S.status && S.status.hasPin); }

  function defaultsFromSpec() {
    var o = {};
    if (S.spec && S.spec.defaults) {
      Object.keys(S.spec.defaults).forEach(function (k) { o[k] = S.spec.defaults[k]; });
    }
    o.profile = 'window';
    o.customW = 1920;
    o.customH = 1080;
    o.hudMode = 'per-eye';
    o.guides = false;
    o.vignette = false;
    o.testMode = false;
    return o;
  }

  /* ---------------- avisos ---------------- */
  var toastTimer = 0;
  function toast(msg, kind) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = String(msg || '');
    el.className = 'on' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = ''; }, 3800);
  }

  /* ---------------- modal ---------------- */
  var modalState = null;

  function openModal(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      if (modalState) {
        try { modalState.resolve({ ok: false }); } catch (e) { /* nada */ }
      }
      modalState = { resolve: resolve, needPin: !!opts.needPin, input: !!opts.input };
      $('#modal-title').textContent = opts.title || 'Confirmar';
      $('#modal-text').textContent = opts.text || '';
      var field = $('#modal-field');
      var input = $('#modal-input');
      var show = !!(opts.input || opts.needPin);
      field.hidden = !show;
      $('#modal-field-label').textContent = opts.needPin
        ? 'PIN de administración'
        : (opts.inputLabel || 'Valor');
      input.type = opts.needPin ? 'password' : (opts.inputType || 'text');
      input.inputMode = opts.needPin ? 'numeric' : (opts.inputMode || 'text');
      input.maxLength = opts.maxLength || 32;
      input.value = opts.inputValue || '';
      var ok = $('#modal-ok');
      ok.textContent = opts.okText || 'Confirmar';
      ok.classList.toggle('danger', !!opts.danger);
      $('#modal').hidden = false;
      setTimeout(function () {
        if (show) { input.focus(); input.select(); } else ok.focus();
      }, 40);
    });
  }

  function closeModal(result) {
    var st = modalState;
    modalState = null;
    $('#modal').hidden = true;
    if (st) st.resolve(result || { ok: false });
  }

  function modalAccept() {
    if (!modalState) return;
    var input = $('#modal-input');
    var value = input.value.trim();
    if (modalState.needPin && !value) {
      input.focus();
      toast('Escribí el PIN de administración', 'bad');
      return;
    }
    closeModal({
      ok: true,
      pin: modalState.needPin ? value : undefined,
      value: value
    });
  }

  /* ---------------- calibración ---------------- */
  function renderGroups() {
    var wrap = $('#groups');
    if (!wrap || !S.spec) return;
    wrap.innerHTML = '';
    var tabs = S.spec.tabs || [];
    tabs.forEach(function (t) {
      var key = t[0];
      var label = t[1];
      if (key === 'profiles') return;
      var g = S.spec.groups && S.spec.groups[key];
      if (!g || !g.keys || !g.keys.length) return;

      var box = document.createElement('section');
      box.className = 'group';
      box.dataset.group = key;
      var head = document.createElement('header');
      head.innerHTML = '<h3>' + esc(label) + '</h3><span class="chev">▾</span>';
      head.addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        box.classList.toggle('collapsed');
      });
      var body = document.createElement('div');
      body.className = 'group-body';

      g.keys.forEach(function (k) {
        if (k === 'customW') {
          var cs = document.createElement('div');
          cs.id = 'custom-size';
          cs.appendChild(numberControl('customW', 'Ancho (px)', 320, 4096));
          cs.appendChild(numberControl('customH', 'Alto (px)', 320, 4096));
          body.appendChild(cs);
          return;
        }
        if (k === 'customH') return;
        var node = controlFor(k);
        if (node) body.appendChild(node);
      });

      var reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'wide';
      reset.textContent = 'Restaurar ' + String(label).toLowerCase();
      reset.dataset.act = 'reset-group';
      reset.dataset.group = key;
      body.appendChild(reset);

      box.appendChild(head);
      box.appendChild(body);
      wrap.appendChild(box);
    });

    if (S.spec.bools && S.spec.bools.indexOf('testMode') >= 0) {
      var diag = document.createElement('section');
      diag.className = 'group';
      var dhead = document.createElement('header');
      dhead.innerHTML = '<h3>Diagnóstico</h3><span class="chev">▾</span>';
      var dbody = document.createElement('div');
      dbody.className = 'group-body';
      dbody.appendChild(checkControl('testMode', 'Modo prueba',
        'Escena de referencia para comprobar la vista. Se desactiva en Modo Expo.'));
      dhead.addEventListener('click', function () { diag.classList.toggle('collapsed'); });
      diag.appendChild(dhead);
      diag.appendChild(dbody);
      wrap.appendChild(diag);
    }

    toggleCustom();
  }

  function controlFor(key) {
    if (S.spec.spec && S.spec.spec[key]) return sliderControl(key);
    if (key === 'profile') {
      var opts = Object.keys(S.spec.profiles || {}).map(function (k) {
        return { value: k, label: (S.spec.profiles[k] && S.spec.profiles[k].label) || k };
      });
      return selectControl(key, opts);
    }
    if (key === 'hudMode') {
      return selectControl(key, [
        { value: 'per-eye', label: 'Por ojo (VR real)' },
        { value: 'flat', label: 'Plano (una sola vez)' },
        { value: 'off', label: 'Oculto' }
      ]);
    }
    if (key === 'guides') return checkControl(key, 'Guías (marco y zona segura)');
    if (key === 'vignette') return checkControl(key, 'Viñeta de lentes');
    return null;
  }

  function sliderControl(key) {
    var c = (S.spec.controls && S.spec.controls[key]) || {};
    var lim = S.spec.spec[key];
    if (!lim) return null;
    var v = Number(S.cal[key]);
    if (!isFinite(v)) v = lim[0];
    var box = document.createElement('div');
    box.className = 'ctl';
    box.innerHTML =
      '<div class="ctl-head"><label for="cal-' + key + '">' + esc(c.label || key) + '</label>' +
      '<output id="cal-' + key + '-o">' + esc(fmt(key, v)) + '</output></div>' +
      '<input id="cal-' + key + '" data-key="' + key + '" type="range" min="' + lim[0] +
      '" max="' + lim[1] + '" step="' + lim[2] + '" value="' + v + '">' +
      (c.help ? '<p class="ctl-help">' + esc(c.help) + '</p>' : '');
    var input = box.querySelector('input');
    input.addEventListener('input', function () {
      onControl(key, Number(input.value));
    });
    input.addEventListener('pointerdown', function () {
      S.dragging = true;
      S.draggingKey = key;
    });
    input.addEventListener('change', function () {
      S.dragging = false;
      S.draggingKey = '';
      syncInputs();
    });
    input.addEventListener('dblclick', function () {
      if (isLocked()) return;
      var d = S.spec.defaults[key];
      if (typeof d === 'number') {
        input.value = d;
        onControl(key, d);
      }
    });
    return box;
  }

  function selectControl(key, options) {
    var c = (S.spec.controls && S.spec.controls[key]) || {};
    var label = key === 'profile' ? 'Perfil de pantalla'
      : key === 'hudMode' ? 'HUD'
        : (c.label || key);
    var box = document.createElement('label');
    box.className = 'field';
    var span = document.createElement('span');
    span.textContent = label;
    var sel = document.createElement('select');
    sel.id = 'cal-' + key;
    options.forEach(function (o) {
      var op = document.createElement('option');
      op.value = o.value;
      op.textContent = o.label;
      sel.appendChild(op);
    });
    sel.value = S.cal[key];
    sel.addEventListener('change', function () { onControl(key, sel.value); });
    box.appendChild(span);
    box.appendChild(sel);
    return box;
  }

  function checkControl(key, label, help) {
    var box = document.createElement('label');
    box.className = 'check';
    var input = document.createElement('input');
    input.type = 'checkbox';
    input.id = 'cal-' + key;
    input.checked = !!S.cal[key];
    input.addEventListener('change', function () { onControl(key, input.checked); });
    var span = document.createElement('span');
    span.textContent = label;
    if (help) {
      var small = document.createElement('small');
      small.textContent = help;
      span.appendChild(small);
    }
    box.appendChild(input);
    box.appendChild(span);
    return box;
  }

  function numberControl(key, label, min, max) {
    var box = document.createElement('label');
    box.className = 'field';
    var span = document.createElement('span');
    span.textContent = label;
    var input = document.createElement('input');
    input.type = 'number';
    input.id = 'cal-' + key;
    input.min = String(min);
    input.max = String(max);
    input.step = '10';
    input.value = String(S.cal[key] || '');
    input.addEventListener('change', function () { onControl(key, Number(input.value)); });
    box.appendChild(span);
    box.appendChild(input);
    return box;
  }

  function toggleCustom() {
    var cs = $('#custom-size');
    if (cs) cs.style.display = S.cal.profile === 'custom' ? '' : 'none';
  }

  /* ---------------- sincronizar controles ---------------- */
  function setInput(key, value) {
    var input = document.getElementById('cal-' + key);
    if (!input) return;
    if (input.type === 'range' || input.type === 'number') {
      if (!(S.dragging && S.draggingKey === key)) input.value = value;
      var out = document.getElementById('cal-' + key + '-o');
      if (out) out.textContent = fmt(key, value);
    } else if (input.type === 'checkbox') {
      input.checked = !!value;
    } else {
      input.value = value;
    }
    if (key === 'profile') toggleCustom();
  }

  function syncInputs() {
    Object.keys(S.cal).forEach(function (k) { setInput(k, S.cal[k]); });
  }

  /* ---------------- cambios de calibración ---------------- */
  function onControl(key, value) {
    if (isLocked()) {
      toast('Calibración bloqueada desde la PC', 'bad');
      syncInputs();
      return;
    }
    if (S.spec.bools.indexOf(key) >= 0) value = !!value;
    if (key === 'customW' || key === 'customH') {
      var lim = S.spec.ints[key] || [320, 4096];
      value = Math.round(clamp(Number(value) || lim[0], lim[0], lim[1]));
    }
    if (key === 'profile' && !(S.spec.profiles && S.spec.profiles[value])) return;
    if (key === 'hudMode' && ['per-eye', 'flat', 'off'].indexOf(value) < 0) return;

    S.cal[key] = value;
    optimistic(key, value);
    queueSend(key, value);
    if (key === 'profile') toggleCustom();
    updateHudButton();
  }

  function optimistic(key, value) {
    if (!S.gameReady || !S.frameWin) return;
    try {
      var v = {};
      v[key] = value;
      S.frameWin.RasmaticVR.applyCal(v, 'windows');
    } catch (e) { /* la vista sigue andando */ }
  }

  function queueSend(key, value) {
    S.pending[key] = value;
    if (S.pendingTimer) return;
    S.pendingTimer = setTimeout(flushSend, 90);
  }

  function flushSend() {
    S.pendingTimer = 0;
    var values = S.pending;
    S.pending = {};
    if (!Object.keys(values).length) return;
    api('cal:set', { values: values }).then(function (r) {
      if (!r || !r.ok) {
        handleError(r, 'No se pudo aplicar el cambio');
        refreshStatus();
      }
    });
  }

  function handleError(r, fallback) {
    var msg = (r && (r.msg || r.code)) || fallback || 'Error';
    if (r && r.code === 'locked') msg = 'Calibración bloqueada desde la PC';
    if (r && r.code === 'bad_pin') msg = 'PIN incorrecto';
    if (r && r.code === 'pin_locked') msg = 'Demasiados intentos de PIN. Esperá unos minutos.';
    toast(String(msg).slice(0, 180), 'bad');
  }

  /* ---------------- estado del servidor ---------------- */
  function applyStatus(status) {
    if (!status) return;
    S.status = status;
    if (status.calibration) S.cal = Object.assign({}, S.cal, status.calibration);
    if (status.expo && S.pairing) S.pairing = null;
    if (S.pairing && status.pairing && !status.pairing.active) S.pairing = null;
    renderPills();
    renderLock();
    updateHudButton();
    var sig = statusSig(status);
    if (sig !== S.lastStatusSig) {
      S.lastStatusSig = sig;
      renderSecuritySummary();
      renderExpo();
      renderPairing();
      renderDevices();
      renderPin();
      renderLog();
      renderConnectInfo();
    }
    if (S.gameReady) {
      try { S.frameWin.RasmaticVR.setLocked(!!status.lock); } catch (e) { /* nada */ }
    }
    if (!S.dragging && !S.pendingTimer) syncInputs();
  }

  function statusSig(status) {
    return JSON.stringify({
      expo: status.expo,
      lock: status.lock,
      expoDevice: status.expoDevice,
      hasPin: status.hasPin,
      authed: status.authed,
      clients: status.clients,
      pairing: status.pairing ? [status.pairing.active, status.pairing.expiresAt] : null,
      devices: (status.devices || []).map(function (d) {
        return [d.id, d.name, d.model, d.online, d.pairedAt, d.lastSeen];
      }),
      log: (status.log || []).length ? [status.log.length, status.log[0].at] : [0, 0]
    });
  }

  function renderPills() {
    var st = S.status || {};
    var conn = $('#conn-pill');
    var text = $('#conn-text');
    var online = (st.devices || []).filter(function (d) { return d.online; });
    if (conn) {
      conn.classList.toggle('on', (st.authed || 0) > 0);
      conn.classList.toggle('warn', (st.authed || 0) === 0 && (st.devices || []).length > 0);
      if (text) {
        text.textContent = (st.authed || 0) > 0
          ? (online.length ? online[0].name : 'iPhone conectado')
          : ((st.devices || []).length ? 'Sin conexión' : 'Sin iPhone');
      }
    }
    var expo = $('#expo-pill');
    if (expo) expo.classList.toggle('on', !!st.expo);
    var lock = $('#lock-pill');
    if (lock) {
      lock.classList.toggle('warn', !!st.lock);
      lock.classList.toggle('on', !st.lock);
    }
    var lt = $('#lock-text');
    if (lt) lt.textContent = st.lock ? 'CALIBRACIÓN BLOQUEADA' : 'CALIBRACIÓN DESBLOQUEADA';
  }

  function renderLock() {
    var locked = isLocked();
    var banner = $('#lock-banner');
    if (banner) banner.hidden = !locked;
    $$('#groups input, #groups select, #groups button').forEach(function (n) {
      n.disabled = locked;
    });
    ['#prof-save', '#prof-restore'].forEach(function (sel) {
      var n = $(sel);
      if (n) n.disabled = locked;
    });
    $$('#prof-list [data-act="prof-load"], #prof-list [data-act="prof-del"]').forEach(function (n) {
      n.disabled = locked;
    });
    var reset = $('#btn-reset-all');
    if (reset) reset.disabled = locked;
    document.body.classList.toggle('cal-locked', locked);
  }

  function onCalibration(ev) {
    if (!ev) return;
    if (ev.calibration) S.cal = Object.assign({}, S.cal, ev.calibration);
    if (ev.values) {
      if (S.gameReady) {
        try { S.frameWin.RasmaticVR.applyCal(ev.values, 'remote'); } catch (e) { /* nada */ }
      }
      Object.keys(ev.values).forEach(function (k) { setInput(k, ev.values[k]); });
    }
    if (ev.origin === 'iphone') {
      var n = ev.values ? Object.keys(ev.values).length : 0;
      setStatusLine('iPhone actualizó ' + n + ' parámetro' + (n === 1 ? '' : 's') + ' · rev ' + (ev.rev || ''));
    }
    if (!S.dragging && !S.pendingTimer) syncInputs();
    updateHudButton();
  }

  function onTelemetry(t) {
    if (!t) return;
    S.telemetry = t;
    S.telemetryAt = Date.now();
    var el = $('#stage-telemetry');
    var p = t.player;
    if (p && el) {
      el.textContent = 'iPhone · x ' + Number(p.x).toFixed(2) + '  z ' + Number(p.z).toFixed(2) +
        (t.game && t.game.state ? ' · ' + t.game.state : '');
    } else if (el) {
      el.textContent = 'iPhone conectado · sin pose';
    }
    if (p && S.gameReady && Date.now() - S.lastLocalInput > 1800) {
      try {
        var pp = S.frameWin.RasmaticCore.game.player;
        if (pp) {
          pp.x = Number(p.x) || 0;
          pp.y = Number(p.y) || 0;
          pp.z = Number(p.z) || 0;
          pp.yaw = Number(p.yaw) || 0;
          pp.pitch = Number(p.pitch) || 0;
        }
      } catch (e) { /* nada */ }
    }
  }

  function setStatusLine(text) {
    var el = $('#status-text');
    if (el) el.textContent = text;
  }

  /* ---------------- perfiles ---------------- */
  function renderProfilesPanel() {
    var p = $('#panel-profiles');
    if (!p) return;
    p.innerHTML =
      '<div class="card"><h3>Perfil activo</h3>' +
        '<div id="prof-active" class="kv"><span>Nombre</span><b>—</b></div>' +
        '<button class="wide" type="button" id="prof-restore">Restaurar predeterminado</button>' +
        '<p class="fine">Restaurar vuelve a los valores de fábrica del juego y activa el perfil Predeterminado.</p>' +
      '</div>' +
      '<div class="card"><h3>Guardar la calibración actual</h3>' +
        '<label class="field"><span>Nombre del perfil</span>' +
          '<input id="prof-name" type="text" maxlength="32" placeholder="Ej.: VR Box de casa"></label>' +
        '<button class="wide pri" type="button" id="prof-save">Guardar perfil</button>' +
      '</div>' +
      '<div class="card"><h3>Perfiles guardados</h3><div id="prof-list"></div></div>';
    var save = $('#prof-save');
    if (save) save.addEventListener('click', saveProfile);
    var restore = $('#prof-restore');
    if (restore) restore.addEventListener('click', function () { restoreDefaults(false); });
    loadProfiles();
  }

  function loadProfiles() {
    api('profiles:list').then(function (r) {
      if (r && r.ok) {
        S.profiles = r.profiles || [];
        S.activeProfile = r.active || '';
        renderProfilesList();
      }
    });
  }

  function renderProfilesList() {
    var el = $('#prof-list');
    if (!el) return;
    var active = $('#prof-active');
    if (active) active.innerHTML = '<span>Nombre</span><b>' + esc(S.activeProfile || '—') + '</b>';
    if (!S.profiles.length) {
      el.innerHTML = '<p>No hay perfiles guardados.</p>';
      return;
    }
    el.innerHTML = S.profiles.map(function (name) {
      var on = name === S.activeProfile;
      return '<div class="profile-item' + (on ? ' on' : '') + '">' +
        '<div class="name"><b>' + esc(name) + '</b><small>' +
          (on ? 'Perfil activo' : 'Guardado') + '</small></div>' +
        (on ? '<span class="tag">ACTIVO</span>' : '') +
        '<button class="mini-btn" type="button" data-act="prof-load" data-name="' + esc(name) + '">Cargar</button>' +
        '<button class="mini-btn" type="button" data-act="prof-rename" data-name="' + esc(name) + '">Renombrar</button>' +
        '<button class="mini-btn" type="button" data-act="prof-dup" data-name="' + esc(name) + '">Duplicar</button>' +
        '<button class="mini-btn danger" type="button" data-act="prof-del" data-name="' + esc(name) + '">Eliminar</button>' +
      '</div>';
    }).join('');
    renderLock();
  }

  /* ---------------- seguridad ---------------- */
  function renderSecurityPanel() {
    var p = $('#panel-security');
    if (!p) return;
    p.innerHTML =
      '<div id="sec-summary" class="card"></div>' +
      '<div class="card"><h3>Modo Expo</h3><div id="sec-expo"></div></div>' +
      '<div class="card"><h3>Emparejamiento</h3><div id="sec-pairing"></div></div>' +
      '<div class="card"><h3>Dispositivos autorizados</h3><div id="sec-devices"></div>' +
        '<button class="wide" type="button" data-act="close-sessions">Cerrar todas las sesiones</button></div>' +
      '<div class="card"><h3>Bloqueo de calibración</h3><div id="sec-lock"></div></div>' +
      '<div class="card"><h3>PIN de administración</h3><div id="sec-pin"></div></div>' +
      '<div class="card"><h3>Eventos recientes</h3><div id="sec-log" class="log"></div></div>' +
      '<div class="card"><h3>Restaurar</h3>' +
        '<p>Vuelve a los valores predeterminados del juego. Requiere PIN si está configurado.</p>' +
        '<button class="wide danger-soft" type="button" data-act="restore">Restaurar calibración predeterminada</button></div>';
  }

  function renderSecuritySummary() {
    var st = S.status || {};
    var el = $('#sec-summary');
    if (!el) return;
    var devices = (st.devices || []).length;
    var conn = (st.authed || 0) > 0 ? 'Conectado' : (devices ? 'Sin conexión' : 'Sin iPhone');
    el.innerHTML =
      '<div class="kv"><span>Enlace</span><b class="' + ((st.authed || 0) > 0 ? 'good' : 'warn') + '">' + conn + '</b></div>' +
      '<div class="kv"><span>Equipos emparejados</span><b>' + devices + '</b></div>' +
      '<div class="kv"><span>Sesiones activas</span><b>' + (st.authed || 0) + '</b></div>' +
      '<div class="kv"><span>Modo Expo</span><b class="' + (st.expo ? 'warn' : '') + '">' + (st.expo ? 'Activo' : 'Inactivo') + '</b></div>' +
      '<div class="kv"><span>Calibración</span><b class="' + (st.lock ? 'warn' : 'good') + '">' + (st.lock ? 'Bloqueada' : 'Desbloqueada') + '</b></div>' +
      '<div class="kv"><span>PIN de administración</span><b class="' + (st.hasPin ? 'good' : 'bad') + '">' + (st.hasPin ? 'Configurado' : 'Sin configurar') + '</b></div>';
  }

  function renderExpo() {
    var st = S.status || {};
    var el = $('#sec-expo');
    if (!el) return;
    var devices = (st.devices || []).filter(function (d) { return !d.revoked; });
    var html = '';
    if (st.expo) {
      var target = devices.filter(function (d) { return d.id === st.expoDevice; })[0];
      html += '<div class="banner lock-banner"><b>MODO EXPO ACTIVO</b>Vinculaciones bloqueadas. Solo ' +
        esc(target ? target.name : 'el dispositivo elegido') +
        ' puede conectarse. La calibración está bloqueada.</div>';
      html += '<button class="wide danger-soft" type="button" data-act="expo-off">Desactivar Modo Expo</button>';
    } else {
      if (!devices.length) {
        html += '<div class="banner bad-banner"><b>SIN DISPOSITIVO</b>Emparejá un iPhone antes de activar Modo Expo.</div>';
      } else {
        if (devices.length > 1) {
          html += '<label class="field"><span>Dispositivo de Expo</span><select id="expo-device">' +
            '<option value="">Elegí un dispositivo…</option>' +
            devices.map(function (d) {
              return '<option value="' + esc(d.id) + '"' + (d.id === st.expoDevice ? ' selected' : '') + '>' +
                esc(d.name) + (d.online ? ' · conectado' : '') + '</option>';
            }).join('') +
            '</select></label>';
          html += '<button class="wide" type="button" data-act="expo-device">Usar este dispositivo en Expo</button>';
        } else {
          html += '<div class="kv"><span>Dispositivo de Expo</span><b>' + esc(devices[0].name) + '</b></div>';
        }
        html += '<button class="wide pri" type="button" data-act="expo-on">Activar Modo Expo</button>';
      }
      html += '<p class="fine">Expo bloquea vinculaciones nuevas, limita la conexión a un solo equipo y activa el bloqueo de calibración. El juego y el Bluetooth siguen funcionando.</p>';
    }
    el.innerHTML = html;
  }

  function pairingHtml() {
    var st = S.status || {};
    if (st.expo) {
      return '<div class="banner info-banner"><b>MODO EXPO</b>Las vinculaciones nuevas están bloqueadas.</div>';
    }
    if (S.pairing) {
      var left = Math.max(0, Math.ceil((S.pairing.expiresAt - Date.now()) / 1000));
      var host = S.pairing.host || (S.info && S.info.primaryHost) || '';
      var port = S.pairing.port || (S.info && S.info.port) || '';
      return '<div class="code-big"><b>' + esc(S.pairing.code) + '</b>' +
          '<small>vence en <span class="pair-left">' + left + '</span> s</small></div>' +
        (S.pairing.qr ? '<div class="qr"><img alt="QR de emparejamiento" src="' + esc(S.pairing.qr) + '"></div>' : '') +
        '<div class="kv"><span>PC</span><b>' + esc(host) + ':' + esc(port) + '</b></div>' +
        '<button class="wide" type="button" data-act="pair-cancel">Cancelar código</button>' +
        '<p class="fine">En el iPhone abrí <b>PC</b>, escribí la IP, el puerto y este código. El código es de un solo uso y vence solo.</p>';
    }
    return '<p>Generá un código temporal para vincular el iPhone. El código vence en 2 minutos y solo sirve una vez.</p>' +
      '<button class="wide pri" type="button" data-act="pair-new">Generar código de emparejamiento</button>' +
      '<p class="fine">El emparejamiento se hace desde esta PC. El iPhone nunca recibe configuración por Internet: todo pasa por la red Wi-Fi local.</p>';
  }

  function renderPairing() {
    var html = pairingHtml();
    ['#sec-pairing', '#conn-pairing'].forEach(function (sel) {
      var el = $(sel);
      if (el) el.innerHTML = html;
    });
  }

  function renderDevices() {
    var st = S.status || {};
    var el = $('#sec-devices');
    if (!el) return;
    var devices = st.devices || [];
    if (!devices.length) {
      el.innerHTML = '<p>Ningún iPhone emparejado.</p>';
      return;
    }
    el.innerHTML = devices.map(function (d) {
      var online = !!d.online;
      var expo = st.expoDevice === d.id;
      return '<div class="device-item">' +
        '<div class="name"><b>' + esc(d.name) + '</b><small>' +
          esc(d.model || 'iPhone') + ' · ' + (online ? 'conectado' : 'último: ' + fmtAgo(d.lastSeen)) +
        '</small></div>' +
        (expo ? '<span class="tag on">EXPO</span>' : '') +
        (online ? '<span class="tag on">ON</span>' : '') +
        '<button class="mini-btn" type="button" data-act="expo-device-id" data-id="' + esc(d.id) + '">Expo</button>' +
        '<button class="mini-btn danger" type="button" data-act="revoke" data-id="' + esc(d.id) + '" data-name="' + esc(d.name) + '">Revocar</button>' +
      '</div>';
    }).join('');
  }

  function renderPin() {
    var st = S.status || {};
    var el = $('#sec-pin');
    if (!el) return;
    if (st.hasPin) {
      el.innerHTML = '<div class="kv"><span>Estado</span><b class="good">PIN configurado</b></div>' +
        '<p>Las acciones críticas (desbloquear, desactivar Expo, revocar, restaurar) piden este PIN.</p>' +
        '<div class="row"><button class="wide" type="button" data-act="pin-set">Cambiar PIN</button>' +
        '<button class="wide danger-soft" type="button" data-act="pin-clear">Quitar PIN</button></div>';
    } else {
      el.innerHTML = '<div class="banner lock-banner"><b>SIN PIN</b>Recomendado: configurá un PIN para que nadie en esta PC pueda desbloquear o revocar equipos.</div>' +
        '<button class="wide pri" type="button" data-act="pin-set">Configurar PIN</button>';
    }
  }

  function renderLog() {
    var el = $('#sec-log');
    if (!el) return;
    var log = (S.status && S.status.log) || [];
    if (!log.length) {
      el.innerHTML = '<div class="log-item"><span class="detail">Sin eventos.</span></div>';
      return;
    }
    var bad = {
      pair_fail: 1, auth_fail: 1, conn_rate: 1, conn_banned: 1, msg_rate: 1,
      replay: 1, pin_fail: 1, revoke: 1, close_sessions: 1
    };
    el.innerHTML = log.map(function (e) {
      return '<div class="log-item"><time>' + fmtTime(e.at) + '</time>' +
        '<span class="kind' + (bad[e.kind] ? ' bad' : '') + '">' + esc(e.kind) + '</span>' +
        '<span class="detail">' + esc((e.ip ? e.ip + ' · ' : '') + (e.detail || '')) + '</span></div>';
    }).join('');
  }

  /* ---------------- conexión ---------------- */
  function renderConnectPanel() {
    var p = $('#panel-connect');
    if (!p) return;
    p.innerHTML =
      '<div class="card"><h3>Dirección de la PC</h3><div id="conn-hosts" class="hosts"></div>' +
        '<div class="kv"><span>Puerto</span><b id="conn-port">—</b></div>' +
        '<div class="kv"><span>WebSocket</span><b id="conn-ws">—</b></div>' +
        '<p class="fine">El iPhone tiene que estar en la misma red Wi-Fi. Si no conecta, permití la app en el Firewall de Windows.</p></div>' +
      '<div class="card"><h3>Código de emparejamiento</h3><div id="conn-pairing"></div></div>' +
      '<div class="card"><h3>Cómo conectar el iPhone</h3>' +
        '<p>1. Abrí el juego en el iPhone.<br>2. Tocá el botón <b>PC</b>.<br>3. Escribí la IP y el puerto de esta pantalla.<br>4. Escribí el código temporal.<br>5. Tocá <b>Conectar</b>.</p>' +
        '<p>La calibración es una sola: lo que cambies en la PC o en el iPhone se aplica en los dos. El juego y el mando Bluetooth no dependen de esta conexión.</p></div>' +
      '<div class="card"><h3>Aplicación</h3><div id="conn-info"></div>' +
        '<div class="row"><button class="wide" type="button" data-act="open-data">Abrir carpeta de datos</button>' +
        '<button class="wide" type="button" data-act="refresh">Actualizar estado</button></div></div>';
  }

  function renderConnectInfo() {
    var info = S.info || {};
    var hosts = info.hosts || [];
    var el = $('#conn-hosts');
    if (el) {
      el.innerHTML = hosts.length
        ? hosts.map(function (h) {
          return '<button class="host-chip" type="button" data-act="copy" data-text="' + esc(h.address) + '">' +
            esc(h.name) + ' · ' + esc(h.address) + '</button>';
        }).join('')
        : '<span class="fine">Sin red local detectada. Conectá la PC al Wi-Fi.</span>';
    }
    var port = $('#conn-port');
    if (port) port.textContent = info.port || '—';
    var ws = $('#conn-ws');
    if (ws) ws.textContent = hosts.length
      ? 'ws://' + hosts[0].address + ':' + info.port + '/vr'
      : 'ws://127.0.0.1:' + info.port + '/vr';
    var box = $('#conn-info');
    if (box) {
      box.innerHTML =
        '<div class="kv"><span>Versión</span><b>' + esc(info.version || '') + '</b></div>' +
        '<div class="kv"><span>Electron</span><b>' + esc(info.electron || '') + '</b></div>' +
        '<div class="kv"><span>Spec VR</span><b>' + esc((info.spec && info.spec.version) || '') + '</b></div>' +
        '<div class="kv"><span>Datos</span><b style="max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' +
          esc(info.userData || '') + '">' + esc(info.userData || '') + '</b></div>';
    }
  }

  function copyText(text) {
    if (!text) return;
    function done() { toast('Copiado: ' + text, 'good'); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('No se pudo copiar', 'bad'); }
      ta.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  /* ---------------- acciones ---------------- */
  async function setExpo(on) {
    var st = S.status || {};
    var devices = (st.devices || []).filter(function (d) { return !d.revoked; });
    if (on && !devices.length) { toast('Emparejá un iPhone antes de activar Modo Expo', 'bad'); return; }
    if (on && devices.length > 1 && !st.expoDevice) {
      var sel = $('#expo-device');
      if (!sel || !sel.value) { toast('Elegí el dispositivo que va a usar Expo', 'bad'); return; }
    }
    var r = await openModal({
      title: on ? 'Activar Modo Expo' : 'Desactivar Modo Expo',
      text: on
        ? 'Se bloquean las vinculaciones nuevas, se activa el bloqueo de calibración y solo el dispositivo elegido podrá conectarse. El juego y el Bluetooth siguen funcionando.'
        : 'Se vuelven a permitir vinculaciones nuevas. El bloqueo de calibración actual se mantiene hasta que lo desbloquees.',
      needPin: hasPin(),
      okText: on ? 'Activar Expo' : 'Desactivar',
      danger: !on
    });
    if (!r || !r.ok) return;
    var res = await api('security:expo', { on: on, pin: r.pin });
    if (!res || !res.ok) { handleError(res); return; }
    toast(on ? 'Modo Expo activado' : 'Modo Expo desactivado', 'good');
    refreshStatus();
  }

  async function selectExpoDevice(id) {
    if (!id) { toast('Elegí un dispositivo', 'bad'); return; }
    var r = await openModal({
      title: 'Dispositivo de Expo',
      text: 'Solo este equipo podrá conectarse mientras el Modo Expo esté activo. Si hay otra sesión abierta, se cierra.',
      needPin: hasPin(),
      okText: 'Usar en Expo'
    });
    if (!r || !r.ok) return;
    var res = await api('security:expoDevice', { id: id, pin: r.pin });
    if (!res || !res.ok) { handleError(res); return; }
    toast('Dispositivo de Expo actualizado', 'good');
    refreshStatus();
  }

  async function setLock(locked) {
    var r = await openModal({
      title: locked ? 'Bloquear calibración' : 'Desbloquear calibración',
      text: locked
        ? 'Los sliders de la PC y del iPhone quedan bloqueados. Los valores actuales se mantienen y el juego sigue funcionando.'
        : 'Solo el administrador de Windows puede desbloquear. Se pide el PIN si está configurado.',
      needPin: !locked && hasPin(),
      okText: locked ? 'Bloquear' : 'Desbloquear',
      danger: !locked
    });
    if (!r || !r.ok) return;
    var res = await api('security:lock', { locked: locked, pin: r.pin });
    if (!res || !res.ok) { handleError(res); return; }
    toast(locked ? 'Calibración bloqueada' : 'Calibración desbloqueada', 'good');
    refreshStatus();
  }

  async function newPairing() {
    var r = await openModal({
      title: 'Generar código de emparejamiento',
      text: 'El código es temporal (2 minutos), de un solo uso, y solo funciona en la red Wi-Fi local. Mostralo únicamente a quien va a usar el iPhone.',
      needPin: hasPin(),
      okText: 'Generar código'
    });
    if (!r || !r.ok) return;
    var res = await api('security:pairing:new', { pin: r.pin });
    if (!res || !res.ok) { handleError(res); return; }
    S.pairing = {
      code: res.code,
      expiresAt: res.expiresAt,
      host: res.host,
      port: res.port,
      qr: res.qr,
      uri: res.uri
    };
    renderPairing();
    toast('Código generado: ' + res.code, 'good');
    refreshStatus();
  }

  function cancelPairing() {
    api('security:pairing:cancel').then(function () {
      S.pairing = null;
      renderPairing();
      toast('Código cancelado');
      refreshStatus();
    });
  }

  async function revokeDevice(id, name) {
    var r = await openModal({
      title: 'Revocar equipo',
      text: 'Se borra el token de "' + (name || 'este equipo') + '". Para volver a conectarse va a necesitar un código nuevo.',
      needPin: hasPin(),
      okText: 'Revocar',
      danger: true
    });
    if (!r || !r.ok) return;
    var res = await api('security:revoke', { id: id, pin: r.pin });
    if (!res || !res.ok) { handleError(res); return; }
    toast('Equipo revocado', 'good');
    refreshStatus();
  }

  async function closeSessions() {
    var r = await openModal({
      title: 'Cerrar todas las sesiones',
      text: 'Se desconectan los iPhone conectados. El juego sigue funcionando y la calibración se mantiene. Para reconectar, el equipo autorizado se autentica solo.',
      needPin: hasPin(),
      okText: 'Cerrar sesiones',
      danger: true
    });
    if (!r || !r.ok) return;
    var res = await api('security:closeSessions', { pin: r.pin });
    if (!res || !res.ok) { handleError(res); return; }
    toast('Sesiones cerradas: ' + (res.closed || 0), 'good');
    refreshStatus();
  }

  async function setPinFlow() {
    var current = '';
    if (hasPin()) {
      var a = await openModal({
        title: 'PIN actual',
        text: 'Escribí el PIN de administración actual.',
        needPin: true,
        okText: 'Continuar'
      });
      if (!a || !a.ok) return;
      current = a.pin;
    }
    var b = await openModal({
      title: hasPin() ? 'Nuevo PIN' : 'Configurar PIN',
      text: 'Elegí un PIN de 4 a 8 dígitos. Se usa para desbloquear la calibración y para las acciones críticas.',
      input: true, inputLabel: 'Nuevo PIN', inputType: 'password',
      inputMode: 'numeric', maxLength: 8, okText: 'Continuar'
    });
    if (!b || !b.ok) return;
    var next = String(b.value || '').trim();
    if (!/^\d{4,8}$/.test(next)) { toast('El PIN debe tener de 4 a 8 dígitos', 'bad'); return; }
    var c = await openModal({
      title: 'Repetir PIN',
      text: 'Escribí otra vez el PIN para confirmarlo.',
      input: true, inputLabel: 'Repetir PIN', inputType: 'password',
      inputMode: 'numeric', maxLength: 8, okText: 'Guardar'
    });
    if (!c || !c.ok) return;
    if (String(c.value || '').trim() !== next) { toast('Los PIN no coinciden', 'bad'); return; }
    var res = await api('security:setPin', { current: current, next: next });
    if (!res || !res.ok) { handleError(res); return; }
    toast('PIN actualizado', 'good');
    refreshStatus();
  }

  async function clearPinFlow() {
    var r = await openModal({
      title: 'Quitar PIN',
      text: 'Sin PIN, cualquier persona con acceso a esta PC puede desbloquear la calibración y revocar equipos. ¿Quitar el PIN?',
      needPin: true,
      okText: 'Quitar PIN',
      danger: true
    });
    if (!r || !r.ok) return;
    var res = await api('security:clearPin', { pin: r.pin });
    if (!res || !res.ok) { handleError(res); return; }
    toast('PIN eliminado', 'good');
    refreshStatus();
  }

  async function restoreDefaults(force) {
    if (force) {
      var r = await openModal({
        title: 'Restaurar calibración',
        text: 'Vuelve a los valores predeterminados del juego aunque la calibración esté bloqueada. Esta acción requiere administrador.',
        needPin: hasPin(),
        okText: 'Restaurar',
        danger: true
      });
      if (!r || !r.ok) return;
      var res = await api('security:restore', { pin: r.pin });
      if (!res || !res.ok) { handleError(res); return; }
      if (res.calibration) S.cal = Object.assign({}, S.cal, res.calibration);
      if (res.values && S.gameReady) {
        try { S.frameWin.RasmaticVR.applyCal(res.values, 'remote'); } catch (e) { /* nada */ }
      }
      syncInputs();
      toast('Calibración restaurada', 'good');
      loadProfiles();
      refreshStatus();
      return;
    }
    var c = await openModal({
      title: 'Restaurar toda la calibración',
      text: 'Se pierden los ajustes actuales de la PC y del iPhone. Los perfiles guardados no se borran.',
      okText: 'Restaurar',
      danger: true
    });
    if (!c || !c.ok) return;
    var out = await api('cal:reset');
    if (!out || !out.ok) { handleError(out); return; }
    if (out.calibration) S.cal = Object.assign({}, S.cal, out.calibration);
    if (out.values && S.gameReady) {
      try { S.frameWin.RasmaticVR.applyCal(out.values, 'remote'); } catch (e) { /* nada */ }
    }
    syncInputs();
    toast('Calibración restaurada', 'good');
    refreshStatus();
  }

  async function saveProfile() {
    if (isLocked()) { toast('Calibración bloqueada desde la PC', 'bad'); return; }
    var input = $('#prof-name');
    var name = input ? input.value.trim() : '';
    if (!name) {
      toast('Escribí un nombre para el perfil', 'bad');
      if (input) input.focus();
      return;
    }
    var res = await api('profiles:save', { name: name, values: S.cal });
    if (!res || !res.ok) { handleError(res); return; }
    if (input) input.value = '';
    toast('Perfil guardado: ' + res.name, 'good');
    loadProfiles();
    refreshStatus();
  }

  async function loadProfile(name) {
    if (isLocked()) { toast('Calibración bloqueada desde la PC', 'bad'); return; }
    var res = await api('profiles:load', { name: name });
    if (!res || !res.ok) { handleError(res); return; }
    if (res.values) {
      S.cal = Object.assign({}, S.cal, res.values);
      if (S.gameReady) {
        try { S.frameWin.RasmaticVR.applyCal(res.values, 'remote'); } catch (e) { /* nada */ }
      }
      syncInputs();
    }
    toast('Perfil cargado: ' + name, 'good');
    loadProfiles();
    refreshStatus();
  }

  async function renameProfile(name) {
    var r = await openModal({
      title: 'Renombrar perfil',
      text: 'Nuevo nombre para "' + name + '".',
      input: true, inputLabel: 'Nombre', inputValue: name, maxLength: 32, okText: 'Renombrar'
    });
    if (!r || !r.ok) return;
    var to = String(r.value || '').trim();
    if (!to || to === name) return;
    var res = await api('profiles:rename', { from: name, to: to });
    if (!res || !res.ok) { handleError(res); return; }
    toast('Perfil renombrado', 'good');
    loadProfiles();
  }

  async function duplicateProfile(name) {
    var r = await openModal({
      title: 'Duplicar perfil',
      text: 'Se crea una copia de "' + name + '".',
      input: true, inputLabel: 'Nombre de la copia', inputValue: name + ' copia',
      maxLength: 32, okText: 'Duplicar'
    });
    if (!r || !r.ok) return;
    var to = String(r.value || '').trim();
    if (!to) return;
    var res = await api('profiles:duplicate', { from: name, to: to });
    if (!res || !res.ok) { handleError(res); return; }
    toast('Perfil duplicado', 'good');
    loadProfiles();
  }

  async function deleteProfile(name) {
    if (isLocked()) { toast('Calibración bloqueada desde la PC', 'bad'); return; }
    var r = await openModal({
      title: 'Eliminar perfil',
      text: 'Se elimina "' + name + '". Esta acción no se puede deshacer.',
      okText: 'Eliminar',
      danger: true
    });
    if (!r || !r.ok) return;
    var res = await api('profiles:delete', { name: name });
    if (!res || !res.ok) { handleError(res); return; }
    toast('Perfil eliminado', 'good');
    loadProfiles();
    refreshStatus();
  }

  function resetGroup(group) {
    if (isLocked()) { toast('Calibración bloqueada desde la PC', 'bad'); return; }
    api('cal:resetGroup', { group: group }).then(function (res) {
      if (!res || !res.ok) { handleError(res); return; }
      if (res.calibration) S.cal = Object.assign({}, S.cal, res.calibration);
      if (res.values && S.gameReady) {
        try { S.frameWin.RasmaticVR.applyCal(res.values, 'remote'); } catch (e) { /* nada */ }
      }
      syncInputs();
      toast('Grupo restaurado', 'good');
      refreshStatus();
    });
  }

  function refreshStatus() {
    api('security:status').then(function (r) {
      if (r && r.ok) applyStatus(r.status);
    });
  }

  /* ---------------- juego ---------------- */
  function attachGame() {
    var f = $('#game');
    if (!f) return;
    var tries = 0;

    function tryAttach() {
      if (S.gameReady) return;
      tries++;
      var w = null;
      try { w = f.contentWindow; } catch (e) { w = null; }
      if (!w || !w.RasmaticVR || !w.RasmaticCore || w.__ready !== true) {
        if (tries < 240) setTimeout(tryAttach, 250);
        else setStatusLine('La vista previa no terminó de cargar');
        return;
      }
      S.frameWin = w;
      S.gameReady = true;
      try {
        w.RasmaticVR.enableMono(S.view);
        w.RasmaticVR.applyCal(S.cal, 'remote');
        w.RasmaticVR.setLocked(isLocked());
        w.RasmaticVR.onChange(function (ev) {
          if (!ev || ev.origin !== 'ui' || isLocked()) return;
          var keys = ev.keys || (ev.settings ? Object.keys(ev.settings) : []);
          keys.forEach(function (k) {
            if (!ev.settings || ev.settings[k] === undefined) return;
            var v = ev.settings[k];
            if (typeof v !== 'number' && typeof v !== 'string' && typeof v !== 'boolean') return;
            S.cal[k] = v;
            queueSend(k, v);
          });
        });
      } catch (e) {
        S.gameReady = false;
        setTimeout(tryAttach, 500);
        return;
      }
      try {
        w.document.addEventListener('keydown', function (e) {
          S.lastLocalInput = Date.now();
          if (e.key === 'Escape' || e.key === 'F11') {
            e.preventDefault();
            window.dispatchEvent(new KeyboardEvent('keydown', { key: e.key }));
          }
        }, true);
        w.document.addEventListener('pointerdown', function () {
          S.lastLocalInput = Date.now();
        }, true);
      } catch (e) { /* nada */ }
      updateHudButton();
      var hint = $('#preview-hint');
      if (hint) setTimeout(function () { hint.classList.add('off'); }, 9000);
      setStatusLine('Vista previa lista · VR ' + (w.RasmaticVR.version || ''));
    }

    f.addEventListener('load', tryAttach);
    tryAttach();
  }

  function setView(view) {
    if (['center', 'left', 'right', 'sbs'].indexOf(view) < 0) return;
    S.view = view;
    if (S.gameReady) {
      try { S.frameWin.RasmaticVR.setView(view); } catch (e) { /* nada */ }
    }
    $$('#view-switch button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.view === view);
    });
    var badge = $('#stage-badge');
    if (badge) {
      badge.textContent = view === 'center' ? 'CENTRAL'
        : view === 'left' ? 'OJO IZQ.'
          : view === 'right' ? 'OJO DER.' : 'SBS';
    }
  }

  function updateHudButton() {
    var off = S.cal && S.cal.hudMode === 'off';
    var btn = $('#btn-hud');
    if (btn) {
      btn.textContent = off ? 'HUD off' : 'HUD';
      btn.classList.toggle('on', off);
    }
    previewHud(!off);
  }

  function previewHud(on) {
    if (!S.gameReady || !S.frameWin) return;
    try {
      var doc = S.frameWin.document;
      var style = doc.getElementById('cal-hud-style');
      if (!style) {
        style = doc.createElement('style');
        style.id = 'cal-hud-style';
        (doc.head || doc.documentElement).appendChild(style);
      }
      style.textContent = on ? ''
        : '.hud,#rg-req,#rg-score,#rg-time,#rg-hint,#rg-action{opacity:0!important;pointer-events:none!important}';
    } catch (e) { /* nada */ }
  }

  function toggleHud() {
    if (isLocked()) { toast('Calibración bloqueada desde la PC', 'bad'); return; }
    var next = S.cal.hudMode === 'off' ? 'per-eye' : 'off';
    onControl('hudMode', next);
    updateHudButton();
  }

  function togglePause() {
    S.paused = !S.paused;
    if (S.gameReady) {
      try {
        if (S.paused) S.frameWin.RasmaticCore.pause();
        else S.frameWin.RasmaticCore.resume();
      } catch (e) { /* nada */ }
    }
    var btn = $('#btn-pause');
    if (btn) {
      btn.textContent = S.paused ? 'Reanudar' : 'Pausar';
      btn.classList.toggle('on', S.paused);
    }
  }

  function setFullscreen(on) {
    api('window:fullscreen', { on: on }).then(function (r) {
      if (r && r.ok) setFullscreenUI(!!r.fullscreen);
    });
  }

  function setFullscreenUI(on) {
    document.body.classList.toggle('fs', !!on);
    var btn = $('#btn-fullscreen');
    if (btn) btn.classList.toggle('on', !!on);
    if (on) {
      if (!document.body.classList.contains('stage-max')) {
        document.body.classList.add('stage-max');
        S.fsAddedMax = true;
      }
    } else if (S.fsAddedMax) {
      document.body.classList.remove('stage-max');
      S.fsAddedMax = false;
    }
  }

  function toggleStageMax() {
    document.body.classList.toggle('stage-max');
    var btn = $('#btn-expand');
    if (btn) btn.classList.toggle('on', document.body.classList.contains('stage-max'));
  }

  function capture() {
    api('window:capture').then(function (r) {
      if (r && r.ok) toast('Captura guardada: ' + r.file, 'good');
      else toast('No se pudo guardar la captura', 'bad');
    });
  }

  async function quitApp() {
    var r = await openModal({
      title: 'Salir de RASMATIC',
      text: 'El juego del iPhone sigue funcionando. Al volver a abrir la app, la calibración y los equipos emparejados se conservan.',
      okText: 'Salir',
      danger: true
    });
    if (!r || !r.ok) return;
    api('app:quit');
  }

  /* ---------------- sondeo ---------------- */
  function pollStats() {
    if (!S.gameReady) return;
    var st = null;
    try { st = S.frameWin.RasmaticVR.state(); } catch (e) { return; }
    var now = performance.now();
    if (S.lastStats && now > S.lastStats.t) {
      var df = (st.stats.frames || 0) - S.lastStats.frames;
      var dt = (now - S.lastStats.t) / 1000;
      if (dt > 0.15) S.fps = Math.max(0, Math.round(df / dt));
    }
    S.lastStats = { t: now, frames: st.stats.frames || 0 };
    var fps = $('#stage-fps');
    if (fps) fps.textContent = S.fps + ' FPS';
    var res = $('#stage-res');
    if (res) res.textContent = Math.round(st.canvas.cssW) + '×' + Math.round(st.canvas.cssH);
    var tel = $('#stage-telemetry');
    if (tel && (!S.telemetry || Date.now() - S.telemetryAt > 5000)) {
      tel.textContent = (S.status && S.status.authed > 0)
        ? 'iPhone conectado · sin telemetría'
        : 'Sin telemetría del iPhone';
    }
  }

  function pollPairing() {
    if (!S.pairing) return;
    var left = Math.ceil((S.pairing.expiresAt - Date.now()) / 1000);
    if (left <= 0) {
      S.pairing = null;
      renderPairing();
      toast('El código de emparejamiento venció', 'bad');
      refreshStatus();
      return;
    }
    $$('.pair-left').forEach(function (n) { n.textContent = String(left); });
  }

  /* ---------------- eventos ---------------- */
  function onEvent(ev) {
    if (!ev || !ev.type) return;
    if (ev.type === 'status') applyStatus(ev.status);
    else if (ev.type === 'calibration') onCalibration(ev);
    else if (ev.type === 'telemetry') onTelemetry(ev.telemetry);
    else if (ev.type === 'fullscreen') setFullscreenUI(ev.on);
  }

  /* ---------------- enlaces de interfaz ---------------- */
  function bind() {
    function selectTab(name) {
      $$('#tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === name); });
      $$('.panel').forEach(function (p) { p.classList.toggle('on', p.dataset.panel === name); });
      if (name === 'profiles') loadProfiles();
      if (name === 'security') refreshStatus();
    }

    $$('#tabs button').forEach(function (btn) {
      btn.addEventListener('click', function () { selectTab(btn.dataset.tab); });
    });
    var conn = $('#conn-pill');
    if (conn) conn.addEventListener('click', function () { selectTab('connect'); });
    var expo = $('#expo-pill');
    if (expo) expo.addEventListener('click', function () { selectTab('security'); });
    var lock = $('#lock-pill');
    if (lock) lock.addEventListener('click', function () { selectTab('security'); });

    $$('#view-switch button').forEach(function (b) {
      b.addEventListener('click', function () { setView(b.dataset.view); });
    });
    var hud = $('#btn-hud');
    if (hud) hud.addEventListener('click', toggleHud);
    var pause = $('#btn-pause');
    if (pause) pause.addEventListener('click', togglePause);
    var cap = $('#btn-capture');
    if (cap) cap.addEventListener('click', capture);
    var full = $('#btn-fullscreen');
    if (full) full.addEventListener('click', function () {
      setFullscreen(!document.body.classList.contains('fs'));
    });
    var expand = $('#btn-expand');
    if (expand) expand.addEventListener('click', toggleStageMax);
    var quit = $('#btn-quit');
    if (quit) quit.addEventListener('click', quitApp);
    var sec = $('#btn-security');
    if (sec) sec.addEventListener('click', function () { selectTab('security'); });
    var resetAll = $('#btn-reset-all');
    if (resetAll) resetAll.addEventListener('click', function () { restoreDefaults(false); });

    var ok = $('#modal-ok');
    if (ok) ok.addEventListener('click', modalAccept);
    var cancel = $('#modal-cancel');
    if (cancel) cancel.addEventListener('click', function () { closeModal({ ok: false }); });
    var input = $('#modal-input');
    if (input) input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); modalAccept(); }
    });
    var modal = $('#modal');
    if (modal) modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal({ ok: false });
    });

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.dataset.act;
      if (act === 'pair-new') { e.preventDefault(); newPairing(); }
      else if (act === 'pair-cancel') { e.preventDefault(); cancelPairing(); }
      else if (act === 'expo-on') { e.preventDefault(); setExpo(true); }
      else if (act === 'expo-off') { e.preventDefault(); setExpo(false); }
      else if (act === 'expo-device') {
        e.preventDefault();
        var sel = $('#expo-device');
        selectExpoDevice(sel && sel.value);
      } else if (act === 'expo-device-id') {
        e.preventDefault();
        selectExpoDevice(btn.dataset.id);
      } else if (act === 'lock-on') { e.preventDefault(); setLock(true); }
      else if (act === 'lock-off') { e.preventDefault(); setLock(false); }
      else if (act === 'revoke') { e.preventDefault(); revokeDevice(btn.dataset.id, btn.dataset.name); }
      else if (act === 'close-sessions') { e.preventDefault(); closeSessions(); }
      else if (act === 'pin-set') { e.preventDefault(); setPinFlow(); }
      else if (act === 'pin-clear') { e.preventDefault(); clearPinFlow(); }
      else if (act === 'restore') { e.preventDefault(); restoreDefaults(true); }
      else if (act === 'reset-group') { e.preventDefault(); resetGroup(btn.dataset.group); }
      else if (act === 'prof-load') { e.preventDefault(); loadProfile(btn.dataset.name); }
      else if (act === 'prof-rename') { e.preventDefault(); renameProfile(btn.dataset.name); }
      else if (act === 'prof-dup') { e.preventDefault(); duplicateProfile(btn.dataset.name); }
      else if (act === 'prof-del') { e.preventDefault(); deleteProfile(btn.dataset.name); }
      else if (act === 'copy') { e.preventDefault(); copyText(btn.dataset.text); }
      else if (act === 'open-data') { e.preventDefault(); api('app:openDataFolder'); }
      else if (act === 'refresh') { e.preventDefault(); refreshStatus(); loadProfiles(); }
    });

    document.addEventListener('pointerup', function () {
      if (S.dragging) {
        S.dragging = false;
        S.draggingKey = '';
        syncInputs();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (modal && !modal.hidden) { closeModal({ ok: false }); e.preventDefault(); return; }
        if (document.body.classList.contains('fs')) { setFullscreen(false); e.preventDefault(); return; }
        if (document.body.classList.contains('stage-max')) { toggleStageMax(); e.preventDefault(); }
      } else if (e.key === 'F11') {
        e.preventDefault();
        setFullscreen(!document.body.classList.contains('fs'));
      }
    });
  }

  /* ---------------- arranque ---------------- */
  async function boot() {
    bind();
    renderProfilesPanel();
    renderSecurityPanel();
    renderConnectPanel();

    var info = null;
    try { info = await api('app:info'); } catch (e) { info = null; }
    if (!info || !info.spec) {
      setStatusLine('No se pudo iniciar el calibrador');
      toast('No se pudo leer la especificación VR del juego', 'bad');
      return;
    }
    S.info = info;
    S.spec = info.spec;
    S.status = info.status || null;
    S.cal = (S.status && S.status.calibration)
      ? Object.assign({}, S.status.calibration)
      : defaultsFromSpec();

    renderGroups();
    applyStatus(S.status);
    syncInputs();
    renderConnectInfo();
    renderPairing();
    loadProfiles();

    if (window.calibrator && typeof window.calibrator.onEvent === 'function') {
      window.calibrator.onEvent(onEvent);
    }
    attachGame();
    setInterval(pollStats, 600);
    setInterval(pollPairing, 500);
    setStatusLine('Listo · ' + (info.primaryHost || '127.0.0.1') + ':' + info.port);
    S.booted = true;
  }

  boot();
})();
