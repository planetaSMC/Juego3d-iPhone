'use strict';

/* ============================================================
   RASMATIC · Servidor HTTP local
   ------------------------------------------------------------
   - Sirve la app y el juego SOLO a loopback (127.0.0.1).
   - El iPhone no descarga nada: usa exclusivamente /vr (WebSocket).
   - Sin listado de directorios, sin metodos de escritura, sin
     traversal, con CSP y cabeceras defensivas.
   ============================================================ */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8'
};

function isLoopback(ip) {
  const s = String(ip || '').replace(/^::ffff:/, '');
  return s === '127.0.0.1' || s === '::1' || s === 'localhost';
}

function safePath(root, rel) {
  let decoded;
  try { decoded = decodeURIComponent(rel); } catch (e) { return null; }
  if (!decoded || decoded.indexOf('\0') >= 0) return null;
  if (decoded.split(/[\\/]/).some((p) => p === '..')) return null;
  const resolved = path.resolve(root, '.' + path.sep + decoded.replace(/^[\\/]+/, ''));
  const rootResolved = path.resolve(root);
  if (resolved !== rootResolved && !resolved.startsWith(rootResolved + path.sep)) return null;
  return resolved;
}

function cspFor(kind) {
  if (kind === 'app') {
    return "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: blob:; font-src 'self'; frame-src 'self'; connect-src 'self'; " +
      "media-src 'self' blob:; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'";
  }
  if (kind === 'game') {
    return "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: blob:; font-src 'self'; connect-src 'self' ws:; " +
      "media-src 'self' blob:; worker-src 'self' blob:; base-uri 'none'; object-src 'none'; frame-ancestors 'self'";
  }
  return "default-src 'none'; frame-ancestors 'none'";
}

function baseHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'SAMEORIGIN',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  };
}

function send(res, status, body, headers) {
  const h = Object.assign(baseHeaders(), headers || {});
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body || ''), 'utf8');
  h['Content-Length'] = buf.length;
  res.writeHead(status, h);
  if (res.req && res.req.method === 'HEAD') res.end();
  else res.end(buf);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), {
    'Content-Type': MIME['.json'],
    'Cache-Control': 'no-store',
    'Content-Security-Policy': cspFor('api')
  });
}

function serveFile(req, res, file, kind, cache) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      send(res, 404, 'No encontrado', {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': cspFor('api')
      });
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const headers = Object.assign(baseHeaders(), {
      'Content-Type': type,
      'Cache-Control': cache || 'no-cache',
      'Content-Security-Policy': cspFor(kind)
    });
    if (ext === '.html') headers['Cache-Control'] = 'no-store';
    if (req.method === 'HEAD') {
      headers['Content-Length'] = st.size;
      res.writeHead(200, headers);
      res.end();
      return;
    }
    const stream = fs.createReadStream(file);
    stream.on('error', () => { try { res.destroy(); } catch (e) { /* nada */ } });
    res.writeHead(200, Object.assign(headers, { 'Content-Length': st.size }));
    stream.pipe(res);
  });
}

function createHttpServer(opts) {
  const gameRoot = path.resolve(opts.gameRoot);
  const rendererRoot = path.resolve(opts.rendererRoot);
  const spec = opts.spec;

  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(res, 405, 'Método no permitido', {
        'Content-Type': 'text/plain; charset=utf-8',
        'Allow': 'GET, HEAD',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': cspFor('api')
      });
      return;
    }
    if (!isLoopback(req.socket.remoteAddress)) {
      send(res, 403, 'Solo acceso local', {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': cspFor('api')
      });
      return;
    }

    let url;
    try { url = new URL(req.url, 'http://127.0.0.1'); } catch (e) { url = null; }
    if (!url) { send(res, 400, 'Pedido inválido', { 'Content-Type': 'text/plain' }); return; }
    const pathname = url.pathname;

    if (pathname === '/api/spec') {
      sendJson(res, 200, {
        version: spec.version,
        defaults: spec.defaults,
        spec: spec.spec,
        controls: spec.controls,
        groups: spec.groups,
        tabs: spec.tabs,
        profiles: spec.profiles,
        enums: spec.enums,
        bools: spec.bools,
        ints: spec.ints,
        keys: spec.keys
      });
      return;
    }
    if (pathname === '/api/health') {
      sendJson(res, 200, { ok: true, version: 1 });
      return;
    }

    let root, rel, kind, cache;
    if (pathname === '/' || pathname === '/index.html') {
      root = rendererRoot; rel = 'index.html'; kind = 'app'; cache = 'no-store';
    } else if (pathname.startsWith('/app/')) {
      root = rendererRoot; rel = pathname.slice('/app/'.length); kind = 'app'; cache = 'no-cache';
    } else if (pathname === '/game' || pathname === '/game/') {
      root = gameRoot; rel = 'index.html'; kind = 'game'; cache = 'no-store';
    } else if (pathname.startsWith('/game/')) {
      root = gameRoot; rel = pathname.slice('/game/'.length); kind = 'game'; cache = 'no-cache';
    } else if (pathname === '/favicon.ico') {
      root = rendererRoot; rel = 'favicon.ico'; kind = 'app'; cache = 'no-cache';
    } else {
      send(res, 404, 'No encontrado', {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': cspFor('api')
      });
      return;
    }

    if (!rel || rel.endsWith('/')) rel += 'index.html';
    const file = safePath(root, rel);
    if (!file) {
      send(res, 403, 'Ruta inválida', { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      return;
    }
    serveFile(req, res, file, kind, cache);
  });

  server.maxConnections = 64;
  server.headersTimeout = 10000;
  server.requestTimeout = 15000;
  server.keepAliveTimeout = 5000;
  return server;
}

module.exports = { createHttpServer, isLoopback, safePath, MIME };
