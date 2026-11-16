import { Router } from 'express';
import { db, insertar, actualizar } from '../db.js';
import { requiere } from '../auth.js';
import { registrar, entradaConAnterior } from '../lib/bitacora.js';
import { CATALOGO, limpiarHtml, confeccionar } from '../lib/plantillas.js';
import { PLANTILLAS_BASE } from '../lib/plantillas-base.js';
import { hoy } from '../lib/fechas.js';
import { ErrorApp, leer, texto, entero, opcion, idDe } from '../lib/validar.js';

export const rutasDocumentos = Router();

const TIPOS = ['carta_cobranza', 'promesa'];
const MAX_HTML = 400_000;

function leerContenido(cuerpo) {
  const html = cuerpo?.contenido;
  if (typeof html !== 'string' || !html.trim()) throw new ErrorApp('El documento está vacío');
  if (html.length > MAX_HTML) throw new ErrorApp('El documento es demasiado extenso');
  return limpiarHtml(html);
}

/** Carga las plantillas de ejemplo si la tabla está vacía (primer arranque). */
export function asegurarPlantillasBase() {
  if (db.get('SELECT COUNT(*) AS n FROM plantillas').n > 0) return;
  for (const p of PLANTILLAS_BASE) insertar('plantillas', { ...p, contenido: limpiarHtml(p.contenido) });
}

// ---------- Plantillas ----------

rutasDocumentos.get('/plantillas', (req, res) => {
  res.json(db.all('SELECT id, tipo, nombre, actualizado_en FROM plantillas ORDER BY tipo, id'));
});

rutasDocumentos.get('/plantillas/variables', (req, res) => {
  res.json(CATALOGO.map((g) => ({
    grupo: g.grupo,
    variables: g.variables.map(([clave, descripcion]) => ({ clave, descripcion })),
  })));
});

rutasDocumentos.get('/plantillas/:id', (req, res) => {
  const p = db.get('SELECT * FROM plantillas WHERE id = ?', idDe(req.params.id));
  if (!p) throw new ErrorApp('La plantilla no existe', 404);
  res.json(p);
});

const esquemaPlantilla = { tipo: opcion(TIPOS, { req: true }), nombre: texto({ req: true, max: 160 }) };

rutasDocumentos.post('/plantillas', requiere('plantillas'), (req, res) => {
  const d = { ...leer(req.body, esquemaPlantilla), contenido: leerContenido(req.body) };
  const id = db.tx(() => {
    const nueva = insertar('plantillas', d);
    registrar(req.usuario.id, { accion: 'plantilla_creada', entidad: 'plantilla', entidadId: nueva, detalle: d.nombre });
    return nueva;
  });
  res.status(201).json({ id });
});

/** Guarda una nueva versión de la plantilla; la anterior queda en el registro para poder restaurarla. */
function guardarVersion(id, d, usuarioId, { accion = 'plantilla_editada', motivo = '' } = {}) {
  db.tx(() => {
    const actual = db.get('SELECT tipo, nombre, contenido FROM plantillas WHERE id = ?', id);
    if (!actual) throw new ErrorApp('La plantilla no existe', 404);
    if (actual.tipo === d.tipo && actual.nombre === d.nombre && actual.contenido === d.contenido) {
      throw new ErrorApp('No hay cambios que guardar');
    }
    actualizar('plantillas', id, { ...d, actualizado_en: `${hoy()} 00:00:00` });
    registrar(usuarioId, {
      accion, entidad: 'plantilla', entidadId: id, motivo, anterior: actual,
      detalle: actual.nombre === d.nombre ? d.nombre : `${actual.nombre} → ${d.nombre}`,
    });
  });
}

rutasDocumentos.put('/plantillas/:id', requiere('plantillas'), (req, res) => {
  guardarVersion(idDe(req.params.id), { ...leer(req.body, esquemaPlantilla), contenido: leerContenido(req.body) }, req.usuario.id);
  res.json({ ok: true });
});

rutasDocumentos.get('/plantillas/:id/versiones', (req, res) => {
  res.json(db.all(
    `SELECT b.id, b.fecha, b.accion, b.detalle, u.nombre AS usuario
       FROM bitacora b LEFT JOIN usuarios u ON u.id = b.usuario_id
      WHERE b.entidad = 'plantilla' AND b.entidad_id = ? AND b.datos_anteriores IS NOT NULL
      ORDER BY b.id DESC LIMIT 50`,
    idDe(req.params.id),
  ));
});

// Vuelve a la versión que tenía la plantilla antes del cambio indicado (la actual también queda guardada).
rutasDocumentos.post('/plantillas/:id/restaurar/:entrada', requiere('plantillas'), (req, res) => {
  const id = idDe(req.params.id);
  const entrada = entradaConAnterior(idDe(req.params.entrada), 'plantilla', id);
  if (!entrada) throw new ErrorApp('No se encontró esa versión de la plantilla', 404);
  const { tipo, nombre, contenido } = entrada.anterior;
  guardarVersion(id, { tipo, nombre, contenido: limpiarHtml(contenido) }, req.usuario.id, {
    accion: 'plantilla_restaurada', motivo: `Versión anterior al cambio N° ${entrada.id} (${entrada.fecha.slice(0, 10)})`,
  });
  res.json({ ok: true });
});

rutasDocumentos.delete('/plantillas/:id', requiere('plantillas'), (req, res) => {
  const id = idDe(req.params.id);
  const actual = db.get('SELECT tipo, nombre, contenido FROM plantillas WHERE id = ?', id);
  if (!actual) throw new ErrorApp('La plantilla no existe', 404);
  db.tx(() => {
    db.run('DELETE FROM plantillas WHERE id = ?', id);
    registrar(req.usuario.id, { accion: 'plantilla_eliminada', entidad: 'plantilla', entidadId: id, detalle: actual.nombre, anterior: actual });
  });
  res.json({ ok: true });
});

// ---------- Documentos emitidos ----------

// Confecciona el borrador (plantilla + datos de la venta) sin guardarlo, para revisarlo y ajustarlo.
rutasDocumentos.post('/documentos/confeccionar', (req, res) => {
  const d = leer(req.body, { plantilla_id: entero({ req: true, min: 1 }), venta_id: entero({ req: true, min: 1 }) });
  res.json(confeccionar(d.plantilla_id, d.venta_id));
});

rutasDocumentos.get('/documentos', (req, res) => {
  res.json(db.all(
    `SELECT d.id, d.tipo, d.titulo, d.venta_id, d.cliente_id, d.creado_en, cl.nombre AS cliente, p.numero AS parcela, u.nombre AS usuario
       FROM documentos d
       LEFT JOIN clientes cl ON cl.id = d.cliente_id
       LEFT JOIN ventas v ON v.id = d.venta_id
       LEFT JOIN parcelas p ON p.id = v.parcela_id
       LEFT JOIN usuarios u ON u.id = d.usuario_id
      ORDER BY d.id DESC`,
  ));
});

rutasDocumentos.get('/documentos/:id', (req, res) => {
  const d = db.get(
    `SELECT d.*, cl.nombre AS cliente, cl.email AS cliente_email FROM documentos d LEFT JOIN clientes cl ON cl.id = d.cliente_id WHERE d.id = ?`,
    idDe(req.params.id),
  );
  if (!d) throw new ErrorApp('El documento no existe', 404);
  res.json(d);
});

rutasDocumentos.post('/documentos', (req, res) => {
  const d = leer(req.body, {
    tipo: opcion(TIPOS, { req: true }),
    titulo: texto({ req: true, max: 250 }),
    plantilla_id: entero({ min: 1 }),
    venta_id: entero({ req: true, min: 1 }),
  });
  const venta = db.get('SELECT id, cliente_id FROM ventas WHERE id = ?', d.venta_id);
  if (!venta) throw new ErrorApp('La venta no existe', 404);
  if (d.plantilla_id && !db.get('SELECT id FROM plantillas WHERE id = ?', d.plantilla_id)) d.plantilla_id = null;

  const id = db.tx(() => {
    const docId = insertar('documentos', {
      ...d, contenido: leerContenido(req.body), cliente_id: venta.cliente_id, usuario_id: req.usuario.id,
    });
    // Toda carta emitida queda anotada en la bitácora de cobranza del deudor.
    if (d.tipo === 'carta_cobranza') {
      insertar('gestiones', {
        cliente_id: venta.cliente_id, venta_id: venta.id, fecha: hoy(), tipo: 'carta',
        detalle: `Se emitió carta: ${d.titulo}`, usuario_id: req.usuario.id,
      });
    }
    return docId;
  });
  res.status(201).json({ id });
});

rutasDocumentos.put('/documentos/:id', (req, res) => {
  const d = leer(req.body, { titulo: texto({ req: true, max: 250 }) });
  if (!actualizar('documentos', idDe(req.params.id), { ...d, contenido: leerContenido(req.body) })) {
    throw new ErrorApp('El documento no existe', 404);
  }
  res.json({ ok: true });
});

rutasDocumentos.delete('/documentos/:id', (req, res) => {
  if (!db.run('DELETE FROM documentos WHERE id = ?', idDe(req.params.id)).changes) throw new ErrorApp('El documento no existe', 404);
  res.json({ ok: true });
});
