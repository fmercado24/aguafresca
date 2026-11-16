import { Router } from 'express';
import { db, actualizar } from '../db.js';
import { requiere } from '../auth.js';
import { entradaConAnterior } from '../lib/bitacora.js';
import { cerrarSolicitudConVenta } from '../lib/solicitudes.js';
import {
  MEDIOS_PAGO, crearVenta, registrarPago, anularPago, editarPago, anularVenta, eliminarVenta, detalleVenta,
  leerTabla, aplicarTabla,
} from '../lib/creditos.js';
import { tablaAmortizacion, tablaPorCuota, tasaAnualEquivalente } from '../lib/finanzas.js';
import { hoy } from '../lib/fechas.js';
import { ErrorApp, leer, texto, entero, decimal, fecha, opcion, booleano, idDe } from '../lib/validar.js';

export const rutasVentas = Router();

const condiciones = {
  precio: entero({ req: true, min: 1 }),
  pie: entero({ min: 0, def: 0 }),
  n_cuotas: entero({ min: 0, max: 360, def: 0 }),
  // Alternativa al número de cuotas: el monto de cada cuota (múltiplo de $1.000); el número de cuotas resulta del cálculo.
  cuota_objetivo: entero({ min: 1000, max: 100_000_000_000 }),
  tasa_mensual: decimal({ min: 0, max: 15, def: 0 }),
  fecha_primera_cuota: fecha(),
};

/** Tabla del saldo a crédito: por número de cuotas (cuota fija calculada) o por monto de cuota. */
export function tablaDelCredito(d, financiado) {
  if (d.cuota_objetivo) {
    return tablaPorCuota({ monto: financiado, tasaMensual: d.tasa_mensual, cuota: d.cuota_objetivo, fechaPrimeraCuota: d.fecha_primera_cuota });
  }
  return tablaAmortizacion({ monto: financiado, tasaMensual: d.tasa_mensual, nCuotas: d.n_cuotas, fechaPrimeraCuota: d.fecha_primera_cuota });
}

/** Simulación de un crédito (sin guardar nada): la usan los formularios de cotización y venta. */
export function simular(d) {
  if (d.pie > d.precio) throw new ErrorApp('El pie no puede ser mayor que el precio');
  const financiado = d.precio - d.pie;
  const t = financiado > 0 && (d.n_cuotas > 0 || d.cuota_objetivo)
    ? tablaDelCredito(d, financiado)
    : { cuota: 0, filas: [], totalIntereses: 0, totalPagar: financiado };
  return {
    precio: d.precio,
    pie: d.pie,
    monto_financiado: financiado,
    n_cuotas: t.filas.length,
    tasa_mensual: d.tasa_mensual,
    tasa_anual: Math.round(tasaAnualEquivalente(d.tasa_mensual) * 100) / 100,
    valor_cuota: t.cuota,
    cuota_objetivo: financiado > 0 && d.cuota_objetivo ? d.cuota_objetivo : null,
    ultima_cuota: t.filas.length ? t.filas[t.filas.length - 1].cuota : 0,
    total_intereses: t.totalIntereses,
    total_credito: t.totalPagar,
    total_operacion: d.pie + t.totalPagar,
    filas: t.filas,
  };
}

rutasVentas.post('/simular', (req, res) => res.json(simular(leer(req.body, condiciones))));

rutasVentas.get('/ventas', (req, res) => {
  const fechaHoy = hoy();
  res.json(db.all(
    `SELECT v.id, v.fecha, v.precio, v.pie, v.monto_financiado, v.n_cuotas, v.valor_cuota, v.tasa_mensual, v.estado,
            p.id AS parcela_id, p.numero AS parcela, cl.id AS cliente_id, cl.nombre AS cliente, cl.rut AS cliente_rut,
            (SELECT COALESCE(SUM(pagado), 0) FROM cuotas c WHERE c.venta_id = v.id) AS pagado,
            (SELECT COALESCE(SUM(monto - pagado), 0) FROM cuotas c WHERE c.venta_id = v.id) AS saldo,
            (SELECT COALESCE(SUM(monto - pagado), 0) FROM cuotas c
              WHERE c.venta_id = v.id AND c.pagado < c.monto AND c.fecha_vencimiento < ?) AS atrasado,
            (SELECT COUNT(*) FROM cuotas c
              WHERE c.venta_id = v.id AND c.pagado < c.monto AND c.fecha_vencimiento < ?) AS n_atrasadas,
            (SELECT COUNT(*) FROM cuotas c WHERE c.venta_id = v.id AND c.tipo = 'cuota' AND c.pagado >= c.monto) AS cuotas_pagadas,
            (SELECT MIN(fecha_vencimiento) FROM cuotas c WHERE c.venta_id = v.id AND c.pagado < c.monto) AS proximo_vencimiento
       FROM ventas v
       JOIN parcelas p ON p.id = v.parcela_id
       JOIN clientes cl ON cl.id = v.cliente_id
      ORDER BY v.fecha DESC, v.id DESC`,
    fechaHoy, fechaHoy,
  ));
});

rutasVentas.get('/ventas/:id', (req, res) => {
  const d = detalleVenta(idDe(req.params.id));
  d.documentos = db.all('SELECT id, tipo, titulo, creado_en FROM documentos WHERE venta_id = ? ORDER BY id DESC', d.venta.id);
  res.json(d);
});

rutasVentas.post('/ventas', requiere('operaciones'), (req, res) => {
  const d = leer(req.body, {
    ...condiciones,
    parcela_id: entero({ req: true, min: 1 }),
    cliente_id: entero({ req: true, min: 1 }),
    cotizacion_id: entero({ min: 1 }),
    vendedor_id: entero({ min: 1 }),
    fecha: fecha({ req: true }),
    observaciones: texto({ max: 3000 }),
    pie_pagado: booleano(),
    medio_pie: opcion(MEDIOS_PAGO),
    cuotas_pagadas: entero({ min: 0, max: 360, def: 0 }),
  });
  const id = db.tx(() => {
    const ventaId = crearVenta(d, req.usuario.id);
    // Si el abogado había informado esta venta, el aviso queda cerrado y se le avisa que ya está registrada.
    if (d.cotizacion_id) cerrarSolicitudConVenta(d.cotizacion_id, ventaId, req.usuario);
    return ventaId;
  });
  res.status(201).json({ id });
});

// Vendedor y observaciones. Las condiciones del crédito se cambian con el editor de la tabla de amortización.
rutasVentas.put('/ventas/:id', requiere('operaciones'), (req, res) => {
  const d = leer(req.body, { vendedor_id: entero({ min: 1 }), observaciones: texto({ max: 3000 }) });
  if (!actualizar('ventas', idDe(req.params.id), d)) throw new ErrorApp('La venta no existe', 404);
  res.json({ ok: true });
});

rutasVentas.post('/ventas/:id/anular', requiere('contabilidad'), (req, res) => {
  const { motivo } = leer(req.body, { motivo: texto({ req: true, max: 500 }) });
  anularVenta(idDe(req.params.id), motivo, req.usuario.id);
  res.json({ ok: true });
});

rutasVentas.delete('/ventas/:id', requiere('contabilidad'), (req, res) => {
  eliminarVenta(idDe(req.params.id), req.usuario.id);
  res.json({ ok: true });
});

// ---------- Tabla de amortización: edición libre (contador y super administrador) ----------

const motivoObligatorio = (cuerpo) => leer(cuerpo, { motivo: texto({ req: true, max: 500 }) }).motivo;

rutasVentas.put('/ventas/:id/amortizacion', requiere('amortizacion'), (req, res) => {
  const motivo = motivoObligatorio(req.body);
  const r = aplicarTabla(idDe(req.params.id), leerTabla(req.body), { usuarioId: req.usuario.id, motivo });
  res.json(r);
});

// Deshace un cambio: vuelve a dejar la tabla como estaba antes de esa entrada del registro.
// La tabla vigente queda a su vez guardada, así que la restauración también se puede deshacer.
rutasVentas.post('/ventas/:id/amortizacion/restaurar/:entrada', requiere('amortizacion'), (req, res) => {
  const ventaId = idDe(req.params.id);
  const entrada = entradaConAnterior(idDe(req.params.entrada), 'venta', ventaId);
  if (!entrada || !['amortizacion', 'amortizacion_restaurada'].includes(entrada.accion)) {
    throw new ErrorApp('No se encontró esa versión de la tabla', 404);
  }
  const r = aplicarTabla(ventaId, leerTabla(entrada.anterior), {
    usuarioId: req.usuario.id,
    accion: 'amortizacion_restaurada',
    motivo: `Se restauró la tabla anterior al cambio N° ${entrada.id} (${entrada.fecha.slice(0, 10)})`,
  });
  res.json(r);
});

// Historial de cambios de la venta: tabla de amortización, pagos corregidos o anulados.
rutasVentas.get('/ventas/:id/historial', (req, res) => {
  res.json(db.all(
    `SELECT b.id, b.fecha, b.accion, b.detalle, b.motivo, b.datos_anteriores IS NOT NULL AS restaurable, u.nombre AS usuario
       FROM bitacora b LEFT JOIN usuarios u ON u.id = b.usuario_id
      WHERE b.entidad = 'venta' AND b.entidad_id = ?
      ORDER BY b.id DESC`,
    idDe(req.params.id),
  ));
});

// ---------- Pagos ----------

rutasVentas.post('/ventas/:id/pagos', requiere('operaciones'), (req, res) => {
  const d = leer(req.body, {
    fecha: fecha({ req: true }),
    monto: entero({ req: true, min: 1 }),
    mora: entero({ min: 0, def: 0 }),
    medio: opcion(MEDIOS_PAGO),
    comprobante: texto({ max: 80 }),
    observacion: texto({ max: 500 }),
  });
  res.status(201).json({ id: registrarPago(idDe(req.params.id), d, req.usuario.id) });
});

rutasVentas.post('/pagos/:id/anular', requiere('contabilidad'), (req, res) => {
  const { motivo } = leer(req.body, { motivo: texto({ req: true, max: 500 }) });
  anularPago(idDe(req.params.id), motivo, req.usuario.id);
  res.json({ ok: true });
});

rutasVentas.put('/pagos/:id', requiere('contabilidad'), (req, res) => {
  const d = leer(req.body, {
    fecha: fecha({ req: true }),
    monto: entero({ req: true, min: 1 }),
    mora: entero({ min: 0, def: 0 }),
    medio: opcion(MEDIOS_PAGO),
    comprobante: texto({ max: 80 }),
    observacion: texto({ max: 500 }),
  });
  editarPago(idDe(req.params.id), d, motivoObligatorio(req.body), req.usuario.id);
  res.json({ ok: true });
});

// Datos para imprimir el comprobante de un pago.
rutasVentas.get('/pagos/:id', (req, res) => {
  const pago = db.get(
    `SELECT p.*, u.nombre AS usuario FROM pagos p LEFT JOIN usuarios u ON u.id = p.usuario_id WHERE p.id = ?`,
    idDe(req.params.id),
  );
  if (!pago) throw new ErrorApp('El pago no existe', 404);
  const venta = db.get('SELECT id, fecha, precio, cliente_id, parcela_id FROM ventas WHERE id = ?', pago.venta_id);
  res.json({
    pago,
    venta,
    cliente: db.get('SELECT id, nombre, rut, direccion, comuna FROM clientes WHERE id = ?', venta.cliente_id),
    parcela: db.get('SELECT id, numero FROM parcelas WHERE id = ?', venta.parcela_id),
    imputaciones: db.all(
      `SELECT c.numero, c.tipo, c.fecha_vencimiento, c.monto AS monto_cuota, pc.monto
         FROM pago_cuotas pc JOIN cuotas c ON c.id = pc.cuota_id
        WHERE pc.pago_id = ? ORDER BY c.numero`,
      pago.id,
    ),
    saldo_venta: db.get('SELECT COALESCE(SUM(monto - pagado), 0) AS s FROM cuotas WHERE venta_id = ?', pago.venta_id).s,
  });
});
