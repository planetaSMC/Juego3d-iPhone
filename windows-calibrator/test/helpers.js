'use strict';

/* Utilidades comunes de las pruebas del calibrador. */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadSpec } = require('../server/vr-spec');
const { Store } = require('../server/store');

const GAME_ROOT = path.resolve(__dirname, '..', '..', 'web');

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix || 'rasmatic-test-'));
}

function makeStore(dir) {
  const spec = loadSpec(GAME_ROOT);
  const store = new Store(path.join(dir || tempDir(), 'state.json'), spec);
  store.load();
  return { spec, store, dir };
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* nada */ }
}

/* Limpia los limitadores para que cada prueba no dependa del orden. */
function resetLimits(link) {
  const s = link.security;
  s.connectBucket.map.clear();
  s.pairGen.map.clear();
  s.pairFail.map.clear();
  s.authFail.map.clear();
  s.pinFail.map.clear();
  s.pairing = null;
}

/* Cliente WebSocket minimo con cola de mensajes y espera por tipo. */
function makeClient(WebSocket, url) {
  const ws = new WebSocket(url);
  const queue = [];
  const waiters = [];
  let closed = false;

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(String(data)); } catch (e) { msg = { t: 'raw', raw: String(data) }; }
    const i = waiters.findIndex((w) => w.match(msg));
    if (i >= 0) {
      const w = waiters.splice(i, 1)[0];
      clearTimeout(w.timer);
      w.resolve(msg);
    } else {
      queue.push(msg);
    }
  });
  ws.on('close', () => { closed = true; });

  function next(match, ms) {
    if (typeof match === 'string') {
      const t = match;
      match = (m) => m.t === t;
    }
    const i = queue.findIndex(match);
    if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const w = { match, resolve };
      w.timer = setTimeout(() => {
        const j = waiters.indexOf(w);
        if (j >= 0) waiters.splice(j, 1);
        reject(new Error('timeout esperando mensaje'));
      }, ms || 4000);
      waiters.push(w);
    });
  }

  function open() {
    return new Promise((resolve, reject) => {
      if (ws.readyState === 1) return resolve();
      ws.once('open', resolve);
      ws.once('error', reject);
    });
  }

  function send(obj) {
    ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
  }

  function close() {
    try { ws.close(); } catch (e) { /* nada */ }
  }

  return {
    ws, open, next, send, close,
    get closed() { return closed; },
    get readyState() { return ws.readyState; }
  };
}

module.exports = { GAME_ROOT, tempDir, makeStore, cleanup, resetLimits, makeClient };
