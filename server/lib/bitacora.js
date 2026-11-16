import { db, insertar } from '../db.js';

// Registro de cambios: quién cambió qué, cuándo y por qué. Para los cambios que se pueden
// deshacer (tabla de amortización, plantillas) se guarda además la versión anterior.

export function registrar(usuarioId, { accion, entidad = '', entidadId = null, detalle = '', motivo = '', anterior = null }) {
  return insertar('bitacora', {
    usuario_id: usuarioId ?? null,
    accion,
    entidad,
    entidad_id: entidadId,
    detalle,
    motivo,
    datos_anteriores: anterior === null ? null : JSON.stringify(anterior),
  });
}

export function entradaConAnterior(id, entidad, entidadId) {
  const fila = db.get(
    'SELECT * FROM bitacora WHERE id = ? AND entidad = ? AND entidad_id = ? AND datos_anteriores IS NOT NULL',
    id, entidad, entidadId,
  );
  return fila ? { ...fila, anterior: JSON.parse(fila.datos_anteriores) } : null;
}

const vacio = (v) => v === null || v === undefined || v === '';

/**
 * Compara dos objetos campo por campo y describe lo que cambió.
 * `etiquetas` indica qué campos considerar y con qué nombre mostrarlos.
 */
export function diferencias(antes, despues, etiquetas) {
  const cambios = [];
  for (const [campo, etiqueta] of Object.entries(etiquetas)) {
    const a = antes?.[campo];
    const d = despues?.[campo];
    if ((vacio(a) && vacio(d)) || String(a) === String(d)) continue;
    cambios.push({ campo, etiqueta, antes: vacio(a) ? '' : String(a), despues: vacio(d) ? '' : String(d) });
  }
  return cambios;
}

const recortar = (s) => (s.length > 80 ? `${s.slice(0, 77)}…` : s);

export const describirCambios = (cambios) =>
  cambios.map((c) => `${c.etiqueta}: ${recortar(c.antes || '(vacío)')} → ${recortar(c.despues || '(vacío)')}`).join('; ');
