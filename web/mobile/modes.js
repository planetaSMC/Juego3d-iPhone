/* ============================================================
   RASMATIC - registro de experiencias
   ============================================================
   El proyecto Android es ahora un juego de almacén. Este registro
   conserva la API mínima que usa android-bridge.js (current / get /
   register / enter) sin paneles reservados ni modos vacíos.
   ============================================================ */
(function () {
  'use strict';

  const registry = new Map();
  const listeners = new Set();
  let currentId = null;

  function notify() {
    const info = {
      id: currentId,
      label: currentId && registry.get(currentId) ? registry.get(currentId).label : null
    };
    listeners.forEach(function (fn) {
      try { fn(info); } catch (e) { console.error('[modes]', e); }
    });
  }

  const api = {
    register: function (def) {
      if (!def || typeof def.id !== 'string' || !def.id) {
        throw new Error('[modes] definicion invalida');
      }
      registry.set(def.id, def);
      return api;
    },
    list: function () {
      return Array.from(registry.values()).map(function (d) {
        return { id: d.id, label: d.label || d.id, description: d.description || '' };
      });
    },
    get: function (id) { return registry.get(id) || null; },
    current: function () { return currentId; },
    enter: function (id) {
      if (!registry.has(id)) return false;
      if (currentId === id) return true;
      const prev = currentId ? registry.get(currentId) : null;
      if (prev && typeof prev.exit === 'function') {
        try { prev.exit(); } catch (e) { console.error('[modes] exit', e); }
      }
      currentId = id;
      const next = registry.get(id);
      if (typeof next.enter === 'function') {
        try { next.enter(); } catch (e) { console.error('[modes] enter', e); }
      }
      notify();
      return true;
    },
    onChange: function (fn) {
      if (typeof fn === 'function') listeners.add(fn);
      return function () { listeners.delete(fn); };
    }
  };

  /* La escena y el juego comparten experiencia: un único modo activo. */
  api.register({
    id: 'original',
    label: 'Almacén',
    description: 'Juego de almacén inteligente sobre la escena RASMATIC.',
    enter: function () {
      document.body.classList.remove('ras-game');
      if (window.RasmaticCore) window.RasmaticCore.resume();
    },
    exit: function () {}
  });

  window.RasmaticModes = api;
  api.enter('original');
})();
