// Loteo del topógrafo: las parcelas y el dibujo del plano, convertidos desde el AutoCAD con
// herramientas/plano/convertir.mjs. Cargarlo crea las parcelas que faltan y deja el plano como fondo del mapa.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, insertar, actualizar } from '../db.js';
import { config } from '../config.js';
import { registrar } from './bitacora.js';
import { leerSeccion, guardarSeccion } from './configuracion.js';

const ARCHIVO = process.env.LOTEO_PATH || path.join(path.dirname(fileURLToPath(import.meta.url)), '../datos/loteo.json');
export const ARCHIVO_FONDO = 'plano-loteo.json';

let cache = null;
export function leerLoteo() {
  if (!fs.existsSync(ARCHIVO)) return null;
  const { mtimeMs } = fs.statSync(ARCHIVO);
  if (!cache || cache.mtimeMs !== mtimeMs) cache = { mtimeMs, datos: JSON.parse(fs.readFileSync(ARCHIVO, 'utf8')) };
  return cache.datos;
}

const parcelaPorNumero = (numero) => db.get('SELECT id, numero, poligono, deslindes, superficie_m2 FROM parcelas WHERE numero = ?', numero);

/** Qué pasaría al cargar el loteo (para confirmarlo antes). */
export function resumenLoteo() {
  const loteo = leerLoteo();
  if (!loteo) return null;
  const existentes = loteo.lotes.filter((l) => parcelaPorNumero(l.codigo));
  const plano = leerSeccion('plano');
  return {
    fuente: loteo.fuente,
    lotes: loteo.lotes.length,
    sectores: loteo.sectores,
    superficie_total: loteo.lotes.reduce((s, l) => s + l.superficie_m2, 0),
    nuevas: loteo.lotes.length - existentes.length,
    existentes: existentes.length,
    georreferenciado: !!loteo.georreferencia,
    plano_cargado: plano?.tipo === 'vectorial' && plano.fuente === loteo.fuente.dwg,
    reemplaza_plano: !!plano?.archivo && plano.tipo !== 'vectorial',
  };
}

/**
 * Crea las parcelas del loteo que no existen (precio por definir) y ubica en el mapa las que ya existen,
 * sin tocar su precio, estado, superficie ni sector. Los deslindes del plano se copian solo si la parcela
 * no tiene deslindes escritos.
 */
export function importarLoteo(usuarioId) {
  const loteo = leerLoteo();
  if (!loteo) return null;
  let creadas = 0, ubicadas = 0, conDeslindes = 0;
  db.tx(() => {
    for (const l of loteo.lotes) {
      const poligono = JSON.stringify(l.poligono);
      const actual = parcelaPorNumero(l.codigo);
      if (!actual) {
        insertar('parcelas', {
          numero: l.codigo, sector: l.sector, superficie_m2: l.superficie_m2, precio: 0, estado: 'disponible',
          deslindes: l.deslindes, descripcion: '', poligono,
        });
        creadas++;
        continue;
      }
      const cambios = {};
      if (actual.poligono !== poligono) cambios.poligono = poligono;
      if (!actual.deslindes.trim() && l.deslindes) { cambios.deslindes = l.deslindes; conDeslindes++; }
      if (!actual.superficie_m2) cambios.superficie_m2 = l.superficie_m2;
      if (Object.keys(cambios).length) { actualizar('parcelas', actual.id, cambios); if (cambios.poligono) ubicadas++; }
    }
    // El dibujo de fondo se guarda como archivo en la carpeta de datos (es grande para la configuración).
    const anterior = leerSeccion('plano');
    if (anterior?.archivo && anterior.archivo !== ARCHIVO_FONDO) fs.rmSync(path.join(config.dirDatos, path.basename(anterior.archivo)), { force: true });
    fs.writeFileSync(path.join(config.dirDatos, ARCHIVO_FONDO), JSON.stringify(loteo.fondo));
    guardarSeccion('plano', {
      archivo: ARCHIVO_FONDO, tipo: 'vectorial', ancho: loteo.ancho, alto: loteo.alto, version: Date.now(),
      fuente: loteo.fuente.dwg, metros_por_unidad: loteo.metros_por_unidad, georreferencia: loteo.georreferencia,
    });
    registrar(usuarioId, {
      accion: 'loteo_cargado', entidad: 'parcela',
      detalle: `Plano "${loteo.fuente.dwg}": ${creadas} parcelas creadas, ${ubicadas} reubicadas en el mapa${conDeslindes ? `, deslindes en ${conDeslindes}` : ''}`,
    });
  });
  return { creadas, ubicadas, total: loteo.lotes.length };
}
