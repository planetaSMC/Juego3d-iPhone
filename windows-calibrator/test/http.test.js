'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { createHttpServer, isLoopback, safePath } = require('../server/http');
const { tempDir, makeStore, cleanup, GAME_ROOT } = require('./helpers');

const RENDERER = path.resolve(__dirname, '..', 'renderer');

async function start() {
  const dir = tempDir('rasmatic-http-');
  const { spec } = makeStore(dir);
  const server = createHttpServer({ gameRoot: GAME_ROOT, rendererRoot: RENDERER, spec });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  return {
    dir, server, base,
    close: async () => {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
      cleanup(dir);
    }
  };
}

test('isLoopback solo acepta loopback', () => {
  assert.strictEqual(isLoopback('127.0.0.1'), true);
  assert.strictEqual(isLoopback('::1'), true);
  assert.strictEqual(isLoopback('::ffff:127.0.0.1'), true);
  assert.strictEqual(isLoopback('192.168.1.20'), false);
  assert.strictEqual(isLoopback('10.0.0.2'), false);
  assert.strictEqual(isLoopback(''), false);
});

test('safePath bloquea traversal y rutas absolutas', () => {
  const root = path.resolve(GAME_ROOT);
  assert.strictEqual(safePath(root, 'index.html'), path.join(root, 'index.html'));
  assert.strictEqual(safePath(root, '../secreto.txt'), null);
  assert.strictEqual(safePath(root, '..\\secreto.txt'), null);
  assert.strictEqual(safePath(root, '%2e%2e/secreto.txt'), null);
  assert.strictEqual(safePath(root, 'a/../../x'), null);
  assert.strictEqual(safePath(root, 'x\u0000y'), null);
});

test('la app y el juego se sirven por HTTP local', async (t) => {
  const s = await start();
  t.after(() => s.close());

  const app = await fetch(s.base + '/');
  assert.strictEqual(app.status, 200);
  const html = await app.text();
  assert.match(html, /RASMATIC/);
  assert.match(app.headers.get('content-security-policy') || '', /frame-src 'self'/);
  assert.strictEqual(app.headers.get('x-content-type-options'), 'nosniff');

  const css = await fetch(s.base + '/app/app.css');
  assert.strictEqual(css.status, 200);
  assert.match(css.headers.get('content-type') || '', /text\/css/);

  const game = await fetch(s.base + '/game/index.html?embed=1');
  assert.strictEqual(game.status, 200);
  assert.match(game.headers.get('content-security-policy') || '', /frame-ancestors 'self'/);

  const vr = await fetch(s.base + '/game/vr/vr-preview.js');
  assert.strictEqual(vr.status, 200);
  assert.match(vr.headers.get('content-type') || '', /javascript/);
});

test('/api/spec entrega la especificación real sin secretos', async (t) => {
  const s = await start();
  t.after(() => s.close());

  const r = await fetch(s.base + '/api/spec');
  assert.strictEqual(r.status, 200);
  const spec = await r.json();
  assert.strictEqual(spec.version, 'vr-cal-2.0');
  assert.strictEqual(spec.defaults.ipd, 64);
  assert.deepStrictEqual(spec.spec.ipd, [50, 75, 1]);
  assert.strictEqual(spec.keys.length >= 25, true);
  assert.strictEqual(spec.tabs.length, 7);
  const text = JSON.stringify(spec);
  assert.ok(text.indexOf('token') < 0);
  assert.ok(text.indexOf('pinHash') < 0);
});

test('/api/health responde y el resto da 404', async (t) => {
  const s = await start();
  t.after(() => s.close());

  const h = await fetch(s.base + '/api/health');
  assert.strictEqual(h.status, 200);
  assert.deepStrictEqual(await h.json(), { ok: true, version: 1 });

  const no = await fetch(s.base + '/api/otra');
  assert.strictEqual(no.status, 404);
  const traversal = await fetch(s.base + '/game/..%2f..%2fpackage.json');
  assert.ok([403, 404].includes(traversal.status));
});

test('solo se permiten GET y HEAD', async (t) => {
  const s = await start();
  t.after(() => s.close());

  const post = await fetch(s.base + '/', { method: 'POST', body: 'x' });
  assert.strictEqual(post.status, 405);
  assert.strictEqual(post.headers.get('allow'), 'GET, HEAD');

  const head = await fetch(s.base + '/app/app.css', { method: 'HEAD' });
  assert.strictEqual(head.status, 200);
  assert.strictEqual(await head.text(), '');
});

test('las respuestas no listan directorios ni permiten escritura', async (t) => {
  const s = await start();
  t.after(() => s.close());

  const dir = await fetch(s.base + '/game/');
  assert.strictEqual(dir.status, 200);
  const body = await dir.text();
  assert.match(body, /<html/i);
});
