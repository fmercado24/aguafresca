import { Router } from 'express';
import { db, insertar, actualizar } from '../db.js';
import { requiere } from '../auth.js';
import { registrar } from '../lib/bitacora.js';
import { detalleVenta } from '../lib/creditos.js';
import { hoy } from '../lib/fechas.js';
import { ErrorApp, leer, texto, entero, fecha, opcion, idDe, rut, telefono, correo } from '../lib/validar.js';

export const rutasClientes = Router();

const esquema = {
  rut: rut(),
  nombre: texto({ req: true, max: 160 }),
  fecha_nacimiento: fecha({ pasada: true }),
  nacionalidad: texto({ max: 60 }),
  estado_civil: texto({ max: 60 }),
  profesion: texto({ max: 120 }),
  direccion: texto({ max: 200 }),
  comuna: texto({ max: 80 }),
  ciudad: texto({ max: 80 }),
  region: texto({ max: 80 }),
  telefono: telefono({ movil: true }),
  email: correo(),
  empleador: texto({ max: 160 }),
  cargo: texto({ max: 120 }),
  antiguedad_laboral: texto({ max: 60 }),
  renta_mensual: entero({ min: 0 }),
  antecedentes_comerciales: texto({ max: 5000 }),
  referencias: texto({ max: 5000 }),
  aval_nombre: texto({ max: 160 }),
  aval_rut: rut(),
  aval_telefono: telefono(),
  aval_direccion: texto({ max: 200 }),
  observaciones: texto({ max: 5000 }),
};

// RUT, teléfonos y correo se validan y se guardan con formato (ver lib/validar.js).
const leerCliente = (cuerpo) => leer(cuerpo, esquema);

rutasClientes.get('/clientes', (req, res) => {
  const fechaHoy = hoy();
  res.json(db.all(
    `SELECT cl.id, cl.rut, cl.nombre, cl.telefono, cl.email, cl.comuna,
            (SELECT COUNT(*) FROM ventas v WHERE v.cliente_id = cl.id AND v.estado <> 'anulada') AS n_ventas,
            (SELECT group_concat(p.numero, ', ') FROM ventas v JOIN parcelas p ON p.id = v.parcela_id
              WHERE v.cliente_id = cl.id AND v.estado <> 'anulada') AS parcelas,
            (SELECT COALESCE(SUM(c.monto - c.pagado), 0) FROM cuotas c JOIN ventas v ON v.id = c.venta_id
              WHERE v.cliente_id = cl.id AND v.estado = 'vigente') AS saldo,
            (SELECT COALESCE(SUM(c.monto - c.pagado), 0) FROM cuotas c JOIN ventas v ON v.id = c.venta_id
              WHERE v.cliente_id = cl.id AND v.estado = 'vigente' AND c.pagado < c.monto AND c.fecha_vencimiento < ?) AS atrasado,
            (SELECT COUNT(*) FROM cuotas c JOIN ventas v ON v.id = c.venta_id
              WHERE v.cliente_id = cl.id AND v.estado = 'vigente' AND c.pagado < c.monto AND c.fecha_vencimiento < ?) AS n_atrasadas
       FROM clientes cl
      ORDER BY cl.nombre COLLATE NOCASE`,
    fechaHoy, fechaHoy,
  ));
});

// Ficha completa del cliente/deudor: antecedentes, compras, deuda, pagos, gestiones y documentos.
rutasClientes.get('/clientes/:id', (req, res) => {
  const id = idDe(req.params.id);
  const cliente = db.get('SELECT * FROM clientes WHERE id = ?', id);
  if (!cliente) throw new ErrorApp('El cliente no existe', 404);

  const ventas = db
    .all('SELECT id FROM ventas WHERE cliente_id = ? ORDER BY fecha DESC, id DESC', id)
    .map((v) => detalleVenta(v.id));

  const resumen = { saldo: 0, pagado: 0, atrasado: 0, n_atrasadas: 0, mora_estimada: 0, dias_atraso: 0 };
  for (const v of ventas) {
    if (v.venta.estado === 'anulada') continue;
    resumen.pagado += v.totales.pagado;
    if (v.venta.estado !== 'vigente') continue;
    resumen.saldo += v.totales.saldo;
    resumen.atrasado += v.totales.atrasado;
    resumen.n_atrasadas += v.totales.n_atrasadas;
    resumen.mora_estimada += v.totales.mora_estimada;
    resumen.dias_atraso = Math.max(resumen.dias_atraso, v.totales.dias_atraso);
  }

  res.json({
    cliente,
    resumen,
    ventas: ventas.map(({ venta, parcela, cuotas, pagos, totales }) => ({
      ...venta, parcela: parcela.numero, cuotas, pagos, totales,
    })),
    gestiones: db.all(
      `SELECT g.*, u.nombre AS usuario FROM gestiones g LEFT JOIN usuarios u ON u.id = g.usuario_id
        WHERE g.cliente_id = ? ORDER BY g.fecha DESC, g.id DESC`, id),
    documentos: db.all(
      'SELECT id, tipo, titulo, venta_id, creado_en FROM documentos WHERE cliente_id = ? ORDER BY id DESC', id),
    cotizaciones: db.all(
      `SELECT q.id, q.fecha, q.valida_hasta, q.precio, q.estado, p.numero AS parcela
         FROM cotizaciones q JOIN parcelas p ON p.id = q.parcela_id
        WHERE q.cliente_id = ? ORDER BY q.id DESC`, id),
    visitas: db.all('SELECT id, inicio, estado, notas FROM visitas WHERE cliente_id = ? ORDER BY inicio DESC', id),
  });
});

rutasClientes.post('/clientes', requiere('operaciones'), (req, res) => {
  res.status(201).json({ id: insertar('clientes', leerCliente(req.body)) });
});

rutasClientes.put('/clientes/:id', requiere('operaciones'), (req, res) => {
  if (!actualizar('clientes', idDe(req.params.id), leerCliente(req.body))) throw new ErrorApp('El cliente no existe', 404);
  res.json({ ok: true });
});

// Datos esenciales (identificación y domicilio): los necesarios para confeccionar promesas y cartas.
// Los puede completar también el usuario (ldiaz), que no modifica los antecedentes financieros del cliente.
export const ESENCIALES = {
  nombre: 'Nombre', rut: 'RUT', fecha_nacimiento: 'Fecha de nacimiento', nacionalidad: 'Nacionalidad', estado_civil: 'Estado civil',
  profesion: 'Profesión u oficio', direccion: 'Dirección', comuna: 'Comuna', ciudad: 'Ciudad', region: 'Región', telefono: 'Teléfono', email: 'Correo electrónico',
};

rutasClientes.put('/clientes/:id/esenciales', requiere('clientes_esenciales'), (req, res) => {
  const id = idDe(req.params.id);
  const actual = db.get('SELECT * FROM clientes WHERE id = ?', id);
  if (!actual) throw new ErrorApp('El cliente no existe', 404);
  const d = leer(req.body, Object.fromEntries(Object.keys(ESENCIALES).map((k) => [k, esquema[k]])));
  const cambiados = Object.keys(ESENCIALES).filter((k) => String(d[k] ?? '') !== String(actual[k] ?? ''));
  if (!cambiados.length) return res.json({ ok: true, cambios: 0 });
  db.tx(() => {
    actualizar('clientes', id, Object.fromEntries(cambiados.map((k) => [k, d[k]])));
    registrar(req.usuario.id, {
      accion: 'cliente_completado', entidad: 'cliente', entidadId: id,
      detalle: `${d.nombre}: ${cambiados.map((k) => ESENCIALES[k]).join(', ')}`,
    });
  });
  res.json({ ok: true, cambios: cambiados.length });
});

rutasClientes.delete('/clientes/:id', requiere('administracion'), (req, res) => {
  const id = idDe(req.params.id);
  if (db.get('SELECT COUNT(*) AS n FROM ventas WHERE cliente_id = ?', id).n > 0) {
    throw new ErrorApp('No se puede eliminar: el cliente tiene ventas registradas', 409);
  }
  const cliente = db.get('SELECT nombre, rut FROM clientes WHERE id = ?', id);
  if (!cliente) throw new ErrorApp('El cliente no existe', 404);
  db.tx(() => {
    db.run('DELETE FROM clientes WHERE id = ?', id);
    registrar(req.usuario.id, { accion: 'cliente_eliminado', entidad: 'cliente', entidadId: id, detalle: `${cliente.nombre}${cliente.rut ? ` (${cliente.rut})` : ''}` });
  });
  res.json({ ok: true });
});

// ---------- Gestiones de cobranza ----------

const TIPOS_GESTION = ['llamada', 'whatsapp', 'email', 'carta', 'visita', 'compromiso', 'otro'];

rutasClientes.post('/clientes/:id/gestiones', requiere('operaciones'), (req, res) => {
  const clienteId = idDe(req.params.id);
  if (!db.get('SELECT id FROM clientes WHERE id = ?', clienteId)) throw new ErrorApp('El cliente no existe', 404);
  const d = leer(req.body, {
    venta_id: entero({ min: 1 }),
    fecha: fecha({ req: true }),
    tipo: opcion(TIPOS_GESTION),
    detalle: texto({ req: true, max: 3000 }),
    compromiso_fecha: fecha(),
    compromiso_monto: entero({ min: 0 }),
  });
  if (d.venta_id && !db.get('SELECT id FROM ventas WHERE id = ? AND cliente_id = ?', d.venta_id, clienteId)) {
    throw new ErrorApp('La venta indicada no pertenece a este cliente');
  }
  const id = insertar('gestiones', { ...d, cliente_id: clienteId, usuario_id: req.usuario.id });
  res.status(201).json({ id });
});

rutasClientes.delete('/gestiones/:id', requiere('operaciones'), (req, res) => {
  if (!db.run('DELETE FROM gestiones WHERE id = ?', idDe(req.params.id)).changes) throw new ErrorApp('La gestión no existe', 404);
  res.json({ ok: true });
});
