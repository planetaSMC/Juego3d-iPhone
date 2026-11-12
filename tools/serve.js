/*
 * Servidor estatico para probar la version iPhone/PWA.
 *
 *   node tools/serve.js [--port 8080] [--host 0.0.0.0] [--root web] [--quiet]
 *
 * Pensado para abrir el juego desde el iPhone en la misma red Wi-Fi:
 * el script imprime la URL LAN que hay que escribir en Safari.
 *
 * Nota: los service workers solo funcionan en https o en localhost. Al abrir
 * por IP LAN el juego funciona igual, pero sin cache offline; para eso esta
 * la app nativa (ios/) o servir el sitio por https.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const root = path.resolve(argValue('--root', path.join(__dirname, '..', 'web')));
const port = Number(argValue('--port', process.env.PORT || 8080));
const host = argValue('--host', '0.0.0.0');
const quiet = process.argv.includes('--quiet');

const types = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

function log(...args) {
  if (!quiet) console.log(...args);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end('method not allowed');
  }

  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  } catch (e) {
    res.writeHead(400);
    return res.end('bad request');
  }

  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

  const file = path.join(root, urlPath);
  const resolved = path.resolve(file);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    res.writeHead(403);
    return res.end('forbidden');
  }

  fs.readFile(resolved, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT' || err.code === 'EISDIR') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('not found: ' + urlPath);
      }
      res.writeHead(500);
      return res.end('server error');
    }

    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      'Content-Type': types[ext] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-cache',
      // Permite probar el SW desde localhost y evita bloqueos de fuentes.
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff'
    });
    if (req.method === 'HEAD') return res.end();
    res.end(data);
    log(new Date().toISOString().slice(11, 19) + '  ' + req.method + ' ' + urlPath + '  ' + data.length + ' B');
  });
});

server.on('error', (err) => {
  console.error('[serve] ' + err.message);
  process.exit(1);
});

server.listen(port, host, () => {
  console.log('RASMATIC · servidor de pruebas');
  console.log('  carpeta: ' + root);
  console.log('  local  : http://localhost:' + port + '/');
  if (host === '0.0.0.0') {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          console.log('  LAN    : http://' + net.address + ':' + port + '/   (abrir en el iPhone)');
        }
      }
    }
  }
  console.log('');
  console.log('Ctrl+C para detener.');
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
