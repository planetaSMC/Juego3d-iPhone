'use strict';

/* ============================================================
   RASMATIC · Especificacion VR compartida
   ------------------------------------------------------------
   La fuente de verdad es el propio modulo del juego
   (web/vr/vr-preview.js). El servidor extrae DEFAULTS, SPEC,
   CTL, GROUPS, TABS y PROFILES para que la app de Windows no
   invente sliders ni limites distintos a los del iPhone.
   ============================================================ */

const fs = require('node:fs');
const path = require('node:path');

const NUMERIC_RE = /^[a-z][a-zA-Z0-9]*$/;

/* Extrae un objeto literal `var NOMBRE = { ... }` respetando cadenas,
   comentarios y anidamiento. No usa eval sobre el archivo completo. */
function extractObject(source, name) {
  const re = new RegExp('var\\s+' + name + '\\s*=\\s*\\{');
  const m = re.exec(source);
  if (!m) return null;
  const start = source.indexOf('{', m.index);
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    const n = source[i + 1];
    if (lineComment) {
      if (c === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (c === '*' && n === '/') { blockComment = false; i++; }
      continue;
    }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '/' && n === '/') { lineComment = true; i++; continue; }
    if (c === '/' && n === '*') { blockComment = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        const block = source.slice(start, i + 1);
        return Function('"use strict"; return (' + block + ');')();
      }
    }
  }
  return null;
}

function extractVersion(source) {
  const m = /var\s+VERSION\s*=\s*(['"])([^'"]+)\1/.exec(source);
  return m ? m[2] : 'unknown';
}

/* Extrae un array literal `var NOMBRE = [ ... ]`. */
function extractArray(source, name) {
  const re = new RegExp('var\\s+' + name + '\\s*=\\s*\\[');
  const m = re.exec(source);
  if (!m) return null;
  const start = source.indexOf('[', m.index);
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    const n = source[i + 1];
    if (lineComment) { if (c === '\n') lineComment = false; continue; }
    if (blockComment) { if (c === '*' && n === '/') { blockComment = false; i++; } continue; }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '/' && n === '/') { lineComment = true; i++; continue; }
    if (c === '/' && n === '*') { blockComment = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) {
        const block = source.slice(start, i + 1);
        return Function('"use strict"; return (' + block + ');')();
      }
    }
  }
  return null;
}

/* Los valores no numericos tambien son calibracion real: perfil de
   pantalla, modo de HUD, guias, viñeta y resolucion personalizada. */
const ENUMS = {
  profile: ['window', 'iphone-15-landscape', 'iphone-15-portrait', 'iphone-13-landscape',
    'iphone-se-landscape', 'vrbox-16-9', 'vrbox-2-1', 'custom'],
  hudMode: ['per-eye', 'flat', 'off']
};
const BOOLS = ['guides', 'vignette', 'testMode'];
const INTS = {
  customW: [320, 4096],
  customH: [320, 4096]
};

function buildSpec(source, sourcePath) {
  const defaults = extractObject(source, 'DEFAULTS');
  const limits = extractObject(source, 'SPEC');
  const controls = extractObject(source, 'CTL');
  const groups = extractObject(source, 'GROUPS');
  const tabs = extractArray(source, 'TABS');
  const profiles = extractObject(source, 'PROFILES');
  if (!defaults || !limits || !controls || !groups) {
    throw new Error('No se pudo leer la especificacion VR de ' + sourcePath);
  }
  const keys = Object.keys(limits).filter((k) => NUMERIC_RE.test(k));
  const cleanLimits = {};
  const cleanDefaults = {};
  for (const k of keys) {
    const l = limits[k];
    if (!Array.isArray(l) || l.length < 3) throw new Error('Limite invalido para ' + k);
    const min = Number(l[0]), max = Number(l[1]), step = Number(l[2]);
    if (![min, max, step].every(Number.isFinite) || min > max || step <= 0) {
      throw new Error('Limite invalido para ' + k);
    }
    cleanLimits[k] = [min, max, step];
    const d = Number(defaults[k]);
    if (!Number.isFinite(d)) throw new Error('Default invalido para ' + k);
    cleanDefaults[k] = Math.min(max, Math.max(min, d));
  }
  return {
    version: extractVersion(source),
    source: sourcePath,
    defaults: cleanDefaults,
    spec: cleanLimits,
    controls,
    groups,
    tabs: Array.isArray(tabs) ? tabs : [],
    profiles: profiles || {},
    enums: ENUMS,
    bools: BOOLS,
    ints: INTS,
    keys
  };
}

function loadSpec(gameRoot) {
  const file = path.join(gameRoot, 'vr', 'vr-preview.js');
  const source = fs.readFileSync(file, 'utf8');
  return buildSpec(source, file);
}

/* ---------------- validacion estricta ---------------- */
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_KEYS = 64;

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function round(v) {
  return Math.round(v * 1e6) / 1e6;
}

/* Acepta solo claves reales y valores finitos dentro de rango.
   Devuelve { ok, values, error }. No corrige en silencio: si un
   valor esta mal, se rechaza el mensaje completo. */
function validateCal(spec, values) {
  if (!isPlainObject(values)) return { ok: false, error: 'values debe ser un objeto' };
  const keys = Object.keys(values);
  if (!keys.length) return { ok: false, error: 'values vacio' };
  if (keys.length > MAX_KEYS) return { ok: false, error: 'demasiadas claves' };
  const out = {};
  for (const k of keys) {
    if (FORBIDDEN.has(k)) return { ok: false, error: 'clave prohibida' };
    if (Object.prototype.hasOwnProperty.call(spec.spec, k)) {
      const v = values[k];
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        return { ok: false, error: 'valor no numerico en ' + k };
      }
      const [min, max] = spec.spec[k];
      if (v < min || v > max) return { ok: false, error: k + ' fuera de rango' };
      out[k] = round(v);
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(spec.enums, k)) {
      if (typeof values[k] !== 'string' || spec.enums[k].indexOf(values[k]) < 0) {
        return { ok: false, error: k + ' invalido' };
      }
      out[k] = values[k];
      continue;
    }
    if (spec.bools.indexOf(k) >= 0) {
      if (typeof values[k] !== 'boolean') return { ok: false, error: k + ' debe ser booleano' };
      out[k] = values[k];
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(spec.ints, k)) {
      const v = values[k];
      if (typeof v !== 'number' || !Number.isFinite(v) || Math.round(v) !== v) {
        return { ok: false, error: k + ' debe ser entero' };
      }
      const [min, max] = spec.ints[k];
      if (v < min || v > max) return { ok: false, error: k + ' fuera de rango' };
      out[k] = v;
      continue;
    }
    return { ok: false, error: 'clave desconocida: ' + k };
  }
  return { ok: true, values: out };
}

/* Para datos persistidos o perfiles viejos: recorta en vez de fallar. */
function sanitizeCal(spec, values) {
  const out = {};
  if (!isPlainObject(values)) return out;
  for (const k of spec.keys) {
    const v = Number(values[k]);
    if (!Number.isFinite(v)) continue;
    const [min, max] = spec.spec[k];
    out[k] = round(Math.min(max, Math.max(min, v)));
  }
  for (const k of Object.keys(spec.enums)) {
    if (spec.enums[k].indexOf(values[k]) >= 0) out[k] = values[k];
  }
  for (const k of spec.bools) if (typeof values[k] === 'boolean') out[k] = values[k];
  for (const k of Object.keys(spec.ints)) {
    const v = Number(values[k]);
    if (!Number.isFinite(v)) continue;
    const [min, max] = spec.ints[k];
    out[k] = Math.round(Math.min(max, Math.max(min, v)));
  }
  return out;
}

function defaultsCal(spec) {
  const out = Object.assign({}, spec.defaults);
  out.profile = 'window';
  out.customW = 1920;
  out.customH = 1080;
  out.hudMode = 'per-eye';
  out.guides = false;
  out.vignette = false;
  out.testMode = false;
  return out;
}

module.exports = {
  loadSpec,
  buildSpec,
  extractObject,
  extractArray,
  validateCal,
  sanitizeCal,
  defaultsCal,
  isPlainObject,
  ENUMS,
  BOOLS,
  INTS
};
