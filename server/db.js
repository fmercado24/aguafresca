import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { MIGRACIONES } from './migraciones.js';

fs.mkdirSync(config.dirDatos, { recursive: true });

const sqlite = new DatabaseSync(config.rutaBD || path.join(config.dirDatos, 'aguafresca.db'));
sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

const sentencias = new Map();
function preparar(sql) {
  let s = sentencias.get(sql);
  if (!s) {
    s = sqlite.prepare(sql);
    sentencias.set(sql, s);
  }
  return s;
}

const normalizar = (params) => params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? Number(p) : p));

let enTransaccion = false;

export const db = {
  all: (sql, ...params) => preparar(sql).all(...normalizar(params)),
  get: (sql, ...params) => preparar(sql).get(...normalizar(params)),
  run: (sql, ...params) => preparar(sql).run(...normalizar(params)),
  exec: (sql) => sqlite.exec(sql),

  /** Ejecuta `fn` (síncrona) dentro de una transacción; si lanza, se revierte todo. */
  tx(fn) {
    if (enTransaccion) return fn();
    sqlite.exec('BEGIN IMMEDIATE');
    enTransaccion = true;
    try {
      const r = fn();
      sqlite.exec('COMMIT');
      return r;
    } catch (e) {
      sqlite.exec('ROLLBACK');
      throw e;
    } finally {
      enTransaccion = false;
    }
  },
};

/** INSERT a partir de un objeto. Las claves vienen siempre del código, nunca del usuario. */
export function insertar(tabla, obj) {
  const claves = Object.keys(obj);
  const r = db.run(
    `INSERT INTO ${tabla} (${claves.join(', ')}) VALUES (${claves.map(() => '?').join(', ')})`,
    ...claves.map((k) => obj[k]),
  );
  return Number(r.lastInsertRowid);
}

/** UPDATE por id a partir de un objeto. Devuelve la cantidad de filas modificadas. */
export function actualizar(tabla, id, obj) {
  const claves = Object.keys(obj);
  const r = db.run(
    `UPDATE ${tabla} SET ${claves.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
    ...claves.map((k) => obj[k]),
    id,
  );
  return Number(r.changes);
}

// ---------- Esquema ----------

export function migrar() {
  const actual = db.get('PRAGMA user_version').user_version;
  if (actual >= MIGRACIONES.length) return;
  // Las migraciones que reconstruyen tablas requieren las claves foráneas desactivadas
  // (si no, borrar la tabla vieja dispararía los ON DELETE de las tablas relacionadas).
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    for (let v = actual; v < MIGRACIONES.length; v++) {
      db.tx(() => {
        db.exec(MIGRACIONES[v]);
        const rotas = db.all('PRAGMA foreign_key_check');
        if (rotas.length) throw new Error(`La migración ${v + 1} dejó referencias inválidas: ${JSON.stringify(rotas.slice(0, 3))}`);
        db.exec(`PRAGMA user_version = ${v + 1}`);
      });
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

migrar();
