// Sistema (solo el super administrador): estado de la instalación y respaldos de la base de datos desde la web,
// para no depender de entrar al servidor.
import { Router } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { db } from '../db.js';
import { config } from '../config.js';
import { requiere, PERFILES } from '../auth.js';
import { registrar } from '../lib/bitacora.js';
import { estadoCorrecciones } from '../lib/correcciones.js';
import { ahora } from '../lib/fechas.js';
import { ErrorApp } from '../lib/validar.js';

export const rutasSistema = Router();
rutasSistema.use('/sistema', requiere('sistema'));

const iniciado = new Date(Date.now() - process.uptime() * 1000).toISOString();
const DIR_RESPALDOS = () => path.join(config.dirDatos, 'respaldos');
const rutaBase = () => (config.rutaBD && config.rutaBD !== ':memory:' ? config.rutaBD : path.join(config.dirDatos, 'aguafresca.db'));
const tamano = (archivo) => { try { return fs.statSync(archivo).size; } catch { return 0; } };

/** Versión instalada según git (commit, fecha y mensaje); null si la carpeta no es un repositorio. */
function version() {
  try {
    const [commit, fecha, ...mensaje] = execFileSync('git', ['log', '-1', '--format=%h|%cI|%s'], { cwd: config.raiz, encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] })
      .trim().split('|');
    return { commit, fecha, mensaje: mensaje.join('|') };
  } catch {
    return null;
  }
}

function respaldos() {
  const dir = DIR_RESPALDOS();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => /^[\w.-]+\.db$/.test(f))
    .map((f) => { const st = fs.statSync(path.join(dir, f)); return { archivo: f, bytes: st.size, fecha: st.mtime.toISOString() }; })
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

rutasSistema.get('/sistema/estado', (req, res) => {
  const base = rutaBase();
  const contar = (tabla) => db.get(`SELECT COUNT(*) AS n FROM ${tabla}`).n;
  let disco = null;
  try { const s = fs.statfsSync(config.dirDatos); disco = { libre: s.bavail * s.bsize, total: s.blocks * s.bsize }; } catch { /* sin datos del disco */ }
  res.json({
    version: version(),
    node: process.version,
    iniciado,
    carpeta_datos: config.dirDatos,
    base: {
      bytes: tamano(base) + tamano(`${base}-wal`),
      migracion: db.get('PRAGMA user_version').user_version,
      registros: { parcelas: contar('parcelas'), clientes: contar('clientes'), ventas: contar('ventas'), pagos: contar('pagos'), documentos: contar('documentos') },
    },
    disco,
    cuentas: db.all(
      `SELECT u.usuario, u.nombre, u.rol, u.activo, (SELECT COUNT(*) FROM sesiones s WHERE s.usuario_id = u.id AND s.expira_en > ?) AS sesiones
         FROM usuarios u ORDER BY u.id`,
      Date.now(),
    ).map((u) => ({ ...u, perfil: PERFILES[u.rol] })),
    correcciones: estadoCorrecciones(),
    respaldos: respaldos().slice(0, 10),
  });
});

// Respaldo al momento: copia consistente de la base (aunque el sistema esté en uso) que se descarga.
rutasSistema.get('/sistema/respaldo', (req, res) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'respaldo-'));
  const nombre = `respaldo-aguafresca-${ahora().replace('T', '-').replace(':', '')}.db`;
  const archivo = path.join(tmp, nombre);
  db.exec(`VACUUM INTO '${archivo.replaceAll("'", "''")}'`);
  registrar(req.usuario.id, { accion: 'respaldo_descargado', entidad: 'sistema', detalle: `Respaldo de la base descargado desde la web (${nombre})` });
  res.download(archivo, nombre, () => fs.rmSync(tmp, { recursive: true, force: true }));
});

rutasSistema.get('/sistema/respaldos', (req, res) => res.json(respaldos()));

// Respaldos automáticos (los que se hacen antes de cada actualización).
rutasSistema.get('/sistema/respaldos/:archivo', (req, res) => {
  const { archivo } = req.params;
  if (!/^[\w.-]+\.db$/.test(archivo) || !fs.existsSync(path.join(DIR_RESPALDOS(), archivo))) throw new ErrorApp('No existe ese respaldo', 404);
  registrar(req.usuario.id, { accion: 'respaldo_descargado', entidad: 'sistema', detalle: `Respaldo automático descargado desde la web (${archivo})` });
  res.download(path.join(DIR_RESPALDOS(), archivo), archivo);
});
