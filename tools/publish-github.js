/*
 * Publica este proyecto en GitHub y baja el .ipa compilado en la nube.
 *
 * No usa git: habla con la API de GitHub. Hace, en orden:
 *   1. Verifica el token y crea el repositorio si no existe.
 *   2. Sube todos los archivos (un solo commit en la rama main).
 *   3. Lanza el flujo .github/workflows/ios-ipa.yml (runner macOS).
 *   4. Espera a que termine.
 *   5. Descarga el artefacto y deja el .ipa en dist/.
 *
 * Uso:
 *   node tools/publish-github.js --dry-run
 *   node tools/publish-github.js --token-file C:\ruta\token.txt
 *   node tools/publish-github.js            (lee GITHUB_TOKEN del entorno)
 *
 * Opciones:
 *   --repo <nombre>      nombre del repositorio (por defecto rasmatic-lugar3d)
 *   --private            repositorio privado (por defecto publico)
 *   --no-wait            sube y lanza el flujo, sin esperar el resultado
 *   --dry-run            solo muestra que archivos subiria
 *
 * El token nunca se imprime ni se escribe en disco por este script.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { verifyIpa } = require('./verify-ipa');

const ROOT = path.resolve(__dirname, '..');
const API = 'https://api.github.com';
const WORKFLOW = 'ios-ipa.yml';
const ARTIFACT = 'RasmaticLugar3D-ipa';

/* ---------------- argumentos ---------------- */
const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
}
const REPO = arg('--repo', 'rasmatic-lugar3d');
const PRIVATE = argv.includes('--private');
const DRY = argv.includes('--dry-run');
const WAIT = !argv.includes('--no-wait');
const TOKEN_FILE = arg('--token-file', '');

function readToken() {
  if (TOKEN_FILE) {
    const p = path.resolve(TOKEN_FILE);
    if (!fs.existsSync(p)) throw new Error('No existe el archivo del token: ' + p);
    return fs.readFileSync(p, 'utf8').trim();
  }
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  return '';
}

/* ---------------- utilidades ---------------- */
const IGNORE_DIRS = new Set(['dist', 'build', 'node_modules', '.git']);
const IGNORE_FILES = new Set(['.DS_Store', 'Thumbs.db']);

function collect(dir, base, out) {
  for (const name of fs.readdirSync(dir)) {
    if (IGNORE_DIRS.has(name) || IGNORE_FILES.has(name)) continue;
    const full = path.join(dir, name);
    const rel = base ? base + '/' + name : name;
    const st = fs.statSync(full);
    if (st.isDirectory()) collect(full, rel, out);
    else out.push({ rel, full, size: st.size });
  }
  return out;
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
}

/* ---------------- ZIP de entrada (para verificar el .ipa) ---------------- */
function unzipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP invalido (sin fin de directorio)');
  const total = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let n = 0; n < total; n++) {
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    entries.push({ name, method, csize, localOff });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return {
    names: entries.map((e) => e.name),
    read(name) {
      const e = entries.find((x) => x.name === name);
      if (!e) return null;
      const nameLen = buf.readUInt16LE(e.localOff + 26);
      const extraLen = buf.readUInt16LE(e.localOff + 28);
      const start = e.localOff + 30 + nameLen + extraLen;
      const data = buf.subarray(start, start + e.csize);
      return e.method === 0 ? data : zlib.inflateRawSync(data);
    }
  };
}

/* ---------------- cliente de la API ---------------- */
let TOKEN = '';

async function api(method, url, body, opts) {
  const options = Object.assign({ method, headers: {} }, opts || {});
  if (TOKEN) options.headers.Authorization = 'Bearer ' + TOKEN;
  options.headers['User-Agent'] = 'rasmatic-publish';
  options.headers.Accept = 'application/vnd.github+json';
  options.headers['X-GitHub-Api-Version'] = '2022-11-28';
  if (body !== undefined && body !== null) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  if (!options.signal) options.signal = AbortSignal.timeout(120000);

  const res = await fetch(url.startsWith('http') ? url : API + url, options);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }

  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || text.slice(0, 200);
    const err = new Error(method + ' ' + url + ' -> ' + res.status + ' ' + msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return { data, headers: res.headers, status: res.status };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function explain(err) {
  if (err.status === 401) {
    return 'El token no es valido o vencio. Genera uno nuevo (fine-grained, con Contents, Actions y Workflows en Read and write).';
  }
  if (err.status === 403) {
    return 'Al token le falta un permiso. Para subir .github/workflows hace falta "Workflows: Read and write"; para leer el artefacto, "Actions: Read and write".';
  }
  if (err.status === 404) {
    return 'No encontrado. Si es el repositorio, puede que el token no tenga acceso a el.';
  }
  if (err.status === 422) {
    return 'GitHub rechazo los datos (422). Suele ser que el repositorio ya existe con otro contenido.';
  }
  return '';
}

/* ---------------- pasos ---------------- */
async function main() {
  const files = collect(ROOT, '', []);
  const totalBytes = files.reduce((a, f) => a + f.size, 0);
  const hasWorkflow = files.some((f) => f.rel === '.github/workflows/' + WORKFLOW);

  console.log('Proyecto: ' + ROOT);
  console.log('Archivos: ' + files.length + '  (' + (totalBytes / 1048576).toFixed(2) + ' MB)');
  console.log('Repositorio destino: ' + REPO + (PRIVATE ? ' (privado)' : ' (publico)'));
  console.log('Flujo: ' + (hasWorkflow ? '.github/workflows/' + WORKFLOW : 'FALTA') + '\n');

  if (DRY) {
    for (const f of files.sort((a, b) => a.rel.localeCompare(b.rel))) {
      console.log('  ' + String(f.size).padStart(8) + '  ' + f.rel);
    }
    console.log('\n(dry-run) No se subio nada.');
    return;
  }

  TOKEN = readToken();
  if (!TOKEN) {
    console.log('Falta el token.');
    console.log('Pasalo con --token-file <ruta> o en la variable GITHUB_TOKEN.');
    process.exit(2);
  }
  if (!hasWorkflow) throw new Error('Falta .github/workflows/' + WORKFLOW);

  /* 1. Usuario y repositorio */
  const me = (await api('GET', '/user')).data;
  console.log('Cuenta: ' + me.login);

  let repo = null;
  try {
    repo = (await api('GET', '/repos/' + me.login + '/' + REPO)).data;
    console.log('El repositorio ya existe: ' + repo.html_url);
  } catch (e) {
    if (e.status !== 404) throw e;
    repo = (await api('POST', '/user/repos', {
      name: REPO,
      private: PRIVATE,
      description: 'RASMATIC - Lugar 3D para iPhone (app iOS con el juego embebido)',
      auto_init: false
    })).data;
    console.log('Repositorio creado: ' + repo.html_url);
  }
  const owner = repo.owner.login;
  const repoApi = '/repos/' + owner + '/' + REPO;

  /* 2. Commit con todos los archivos */
  const blobs = [];
  let done = 0;
  for (const f of files) {
    const content = fs.readFileSync(f.full).toString('base64');
    const blob = (await api('POST', repoApi + '/git/blobs', { content, encoding: 'base64' })).data;
    blobs.push({ path: f.rel, mode: '100644', type: 'blob', sha: blob.sha });
    done++;
    if (done % 20 === 0 || done === files.length) {
      process.stdout.write('\r  subidos ' + done + '/' + files.length + ' archivos');
    }
  }
  process.stdout.write('\n');

  let parentSha = null;
  let baseTree = null;
  try {
    const ref = (await api('GET', repoApi + '/git/ref/heads/main')).data;
    parentSha = ref.object.sha;
    const parent = (await api('GET', repoApi + '/git/commits/' + parentSha)).data;
    baseTree = parent.tree.sha;
    console.log('  rama main existente: se agrega un commit encima');
  } catch (e) {
    if (e.status !== 404 && e.status !== 409) throw e;
    console.log('  rama main vacia: primer commit');
  }

  const tree = (await api('POST', repoApi + '/git/trees', {
    tree: blobs,
    ...(baseTree ? { base_tree: baseTree } : {})
  })).data;

  const commit = (await api('POST', repoApi + '/git/commits', {
    message: 'RASMATIC Lugar 3D para iPhone: app iOS + sitio + herramientas',
    tree: tree.sha,
    parents: parentSha ? [parentSha] : []
  })).data;

  if (parentSha) {
    await api('PATCH', repoApi + '/git/refs/heads/main', { sha: commit.sha, force: true });
  } else {
    await api('POST', repoApi + '/git/refs', { ref: 'refs/heads/main', sha: commit.sha });
    await api('PATCH', repoApi, { default_branch: 'main' });
  }
  console.log('  commit ' + commit.sha.slice(0, 7) + ' en main');

  /* 3. Lanzar el flujo */
  await sleep(3000); // GitHub tarda un instante en indexar el flujo recien subido
  try {
    await api('POST', repoApi + '/actions/workflows/' + WORKFLOW + '/dispatches', { ref: 'main' });
    console.log('  flujo lanzado');
  } catch (e) {
    if (e.status === 404) {
      console.log('  GitHub todavia no ve el flujo; se usa el disparo por push (ya quedo en el commit).');
    } else {
      throw e;
    }
  }

  if (!WAIT) {
    console.log('\nListo. Seguir en: ' + repo.html_url + '/actions');
    return;
  }

  /* 4. Esperar el resultado */
  console.log('\nEsperando la compilacion en macOS (puede tardar 5-12 minutos)...');
  const started = Date.now();
  let run = null;
  while (true) {
    const runs = (await api('GET', repoApi + '/actions/runs?per_page=10')).data.workflow_runs || [];
    const mine = runs.find((r) => r.head_sha === commit.sha && r.path.endsWith(WORKFLOW));
    if (mine) run = mine;
    if (run && run.status === 'completed') break;
    if (Date.now() - started > 25 * 60 * 1000) throw new Error('El flujo no termino en 25 minutos.');
    const mins = Math.round((Date.now() - started) / 60000);
    process.stdout.write('\r  estado: ' + (run ? run.status + '/' + (run.conclusion || '...') : 'buscando') + '  (' + mins + ' min)');
    await sleep(10000);
  }
  process.stdout.write('\n');

  if (run.conclusion !== 'success') {
    console.log('La compilacion fallo (' + run.conclusion + '). Log:');
    const jobs = (await api('GET', repoApi + '/actions/runs/' + run.id + '/jobs')).data.jobs || [];
    for (const job of jobs) {
      for (const step of job.steps || []) {
        if (step.conclusion === 'failure') console.log('  FALLO en: ' + step.name);
      }
    }
    console.log('  Detalle: ' + run.html_url);
    process.exit(1);
  }
  console.log('Compilacion OK.');

  /* 5. Bajar el artefacto */
  const arts = (await api('GET', repoApi + '/actions/runs/' + run.id + '/artifacts')).data.artifacts || [];
  const art = arts.find((a) => a.name === ARTIFACT);
  if (!art) throw new Error('La compilacion termino pero no hay artefacto ' + ARTIFACT);

  // El endpoint devuelve 302 hacia una URL firmada: hay que pedirla sin token.
  const res = await fetch(API + repoApi + '/actions/artifacts/' + art.id + '/zip', {
    headers: { Authorization: 'Bearer ' + TOKEN, 'User-Agent': 'rasmatic-publish' },
    redirect: 'manual',
    signal: AbortSignal.timeout(180000)
  });
  const location = res.headers.get('location');
  if (!location) throw new Error('No se pudo obtener el enlace del artefacto (status ' + res.status + ')');
  const zipRes = await fetch(location, { signal: AbortSignal.timeout(300000) });
  if (!zipRes.ok) throw new Error('Descarga del artefacto fallo: ' + zipRes.status);
  const artZip = Buffer.from(await zipRes.arrayBuffer());
  console.log('Artefacto: ' + (artZip.length / 1048576).toFixed(2) + ' MB');

  /* 6. Extraer el .ipa a dist/ */
  const entries = unzipEntries(artZip);
  const ipaName = entries.names.find((n) => n.endsWith('.ipa'));
  if (!ipaName) throw new Error('El artefacto no contiene ningun .ipa');
  const ipa = entries.read(ipaName);

  const dist = path.join(ROOT, 'dist');
  fs.mkdirSync(dist, { recursive: true });
  const out = path.join(dist, 'RasmaticLugar3D-unsigned.ipa');
  fs.writeFileSync(out, ipa);

  /* 7. Verificar el .ipa con el mismo comprobador que usa el flujo */
  const verified = verifyIpa(out, { log: (line) => console.log(line) });
  if (!verified.ok) throw new Error('El .ipa no paso la verificacion');

  console.log('\nIPA: ' + out);
  console.log('     ' + ipa.length + ' B');
  console.log('     SHA-256 ' + sha256(ipa));
  console.log('     ' + verified.info.entries + ' entradas, juego completo adentro');
  console.log('\nSiguiente paso: instalarlo con Sideloadly/AltStore (docs/instalar-en-iphone.md).');
}

main().catch((e) => {
  console.error('\nERROR: ' + e.message);
  const hint = explain(e);
  if (hint) console.error(hint);
  process.exit(1);
});
