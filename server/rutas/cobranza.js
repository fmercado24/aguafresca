import { Router } from 'express';
import { db } from '../db.js';
import { decorarCuota, tasaMora, desglosePagos } from '../lib/creditos.js';
import { hoy, sumarDias, sumarMeses, esFecha } from '../lib/fechas.js';

export const rutasCobranza = Router();

const CUOTAS_CON_CONTEXTO = `
  SELECT c.*, v.cliente_id, cl.nombre AS cliente, cl.rut, cl.telefono, cl.email, p.numero AS parcela
    FROM cuotas c
    JOIN ventas v ON v.id = c.venta_id
    JOIN clientes cl ON cl.id = v.cliente_id
    JOIN parcelas p ON p.id = v.parcela_id
   WHERE v.estado = 'vigente' AND c.pagado < c.monto`;

const TRAMOS = [
  { tramo: '1 a 30 días', hasta: 30 },
  { tramo: '31 a 60 días', hasta: 60 },
  { tramo: '61 a 90 días', hasta: 90 },
  { tramo: 'Más de 90 días', hasta: Infinity },
];

/** Cuotas atrasadas agrupadas por venta (deudor), con antigüedad de la deuda. */
export function cuotasAtrasadas() {
  const fechaHoy = hoy();
  const mora = tasaMora();
  const cuotas = db
    .all(`${CUOTAS_CON_CONTEXTO} AND c.fecha_vencimiento < ? ORDER BY c.fecha_vencimiento, c.id`, fechaHoy)
    .map((c) => decorarCuota(c, fechaHoy, mora));

  const ultimaGestion = new Map(
    db.all(
      `SELECT cliente_id, fecha, tipo, detalle, compromiso_fecha, compromiso_monto
         FROM (SELECT g.*, ROW_NUMBER() OVER (PARTITION BY cliente_id ORDER BY fecha DESC, id DESC) AS orden FROM gestiones g)
        WHERE orden = 1`,
    ).map((g) => [g.cliente_id, g]),
  );

  const porVenta = new Map();
  const tramos = TRAMOS.map((t) => ({ tramo: t.tramo, monto: 0, n: 0 }));
  const total = { monto: 0, mora_estimada: 0, n_cuotas: 0, n_deudores: 0 };

  for (const c of cuotas) {
    let d = porVenta.get(c.venta_id);
    if (!d) {
      d = {
        venta_id: c.venta_id, cliente_id: c.cliente_id, cliente: c.cliente, rut: c.rut, telefono: c.telefono,
        email: c.email, parcela: c.parcela, n_cuotas: 0, monto: 0, mora_estimada: 0, dias_atraso: 0,
        desde: c.fecha_vencimiento, ultima_gestion: ultimaGestion.get(c.cliente_id) || null, cuotas: [],
      };
      porVenta.set(c.venta_id, d);
    }
    d.n_cuotas++;
    d.monto += c.saldo;
    d.mora_estimada += c.mora_estimada;
    d.dias_atraso = Math.max(d.dias_atraso, c.dias_atraso);
    d.cuotas.push({
      id: c.id, numero: c.numero, tipo: c.tipo, fecha_vencimiento: c.fecha_vencimiento, monto: c.monto,
      pagado: c.pagado, saldo: c.saldo, dias_atraso: c.dias_atraso, mora_estimada: c.mora_estimada,
    });
    const tramo = tramos[TRAMOS.findIndex((t) => c.dias_atraso <= t.hasta)];
    tramo.monto += c.saldo;
    tramo.n++;
    total.monto += c.saldo;
    total.mora_estimada += c.mora_estimada;
    total.n_cuotas++;
  }

  const deudores = [...porVenta.values()].sort((a, b) => b.dias_atraso - a.dias_atraso);
  total.n_deudores = new Set(deudores.map((d) => d.cliente_id)).size;
  return { deudores, tramos, total, tasa_mora_mensual: mora };
}

/** Ingresos esperados por mes según las cuotas por vencer (desde hoy en adelante). */
export function flujoFuturo() {
  const fechaHoy = hoy();
  const filas = db.all(
    `SELECT substr(c.fecha_vencimiento, 1, 7) AS mes, COUNT(*) AS n,
            SUM(c.monto - c.pagado) AS total,
            SUM(MAX(0, c.interes - c.pagado)) AS interes
       FROM cuotas c JOIN ventas v ON v.id = c.venta_id
      WHERE v.estado = 'vigente' AND c.pagado < c.monto AND c.fecha_vencimiento >= ?
      GROUP BY mes ORDER BY mes`,
    fechaHoy,
  );
  const porMes = new Map(filas.map((f) => [f.mes, f]));
  const mesActual = fechaHoy.slice(0, 7);
  const ultimo = filas.length ? filas[filas.length - 1].mes : mesActual;

  // Se rellenan los meses sin vencimientos para que la serie sea continua.
  const meses = [];
  for (let i = 0; i < 600; i++) {
    const mes = sumarMeses(`${mesActual}-01`, i).slice(0, 7);
    if (mes > ultimo) break;
    const f = porMes.get(mes);
    meses.push({
      mes,
      n: f?.n ?? 0,
      capital: f ? f.total - f.interes : 0,
      interes: f?.interes ?? 0,
      total: f?.total ?? 0,
    });
  }

  const atrasado = db.get(
    `SELECT COALESCE(SUM(c.monto - c.pagado), 0) AS monto, COUNT(*) AS n
       FROM cuotas c JOIN ventas v ON v.id = c.venta_id
      WHERE v.estado = 'vigente' AND c.pagado < c.monto AND c.fecha_vencimiento < ?`,
    fechaHoy,
  );
  return { hoy: fechaHoy, meses, atrasado };
}

rutasCobranza.get('/cobranza/atrasadas', (req, res) => res.json(cuotasAtrasadas()));

rutasCobranza.get('/cobranza/flujo', (req, res) => res.json(flujoFuturo()));

// Todas las cuotas con saldo (por vencer y atrasadas), opcionalmente acotadas por vencimiento.
rutasCobranza.get('/cobranza/pendientes', (req, res) => {
  const fechaHoy = hoy();
  const mora = tasaMora();
  const desde = esFecha(req.query.desde) ? req.query.desde : '0000-01-01';
  const hasta = esFecha(req.query.hasta) ? req.query.hasta : '9999-12-31';
  res.json(
    db.all(`${CUOTAS_CON_CONTEXTO} AND c.fecha_vencimiento BETWEEN ? AND ? ORDER BY c.fecha_vencimiento, c.id`, desde, hasta)
      .map((c) => decorarCuota(c, fechaHoy, mora)),
  );
});

// Pagos recibidos en un período, con su desglose contable en capital, interés y mora.
rutasCobranza.get('/cobranza/pagos', (req, res) => {
  const fechaHoy = hoy();
  const desde = esFecha(req.query.desde) ? req.query.desde : `${fechaHoy.slice(0, 7)}-01`;
  const hasta = esFecha(req.query.hasta) ? req.query.hasta : fechaHoy;
  const pagos = db.all(
    `SELECT pg.id, pg.venta_id, pg.fecha, pg.monto, pg.mora, pg.medio, pg.comprobante, pg.observacion, pg.anulado,
            cl.id AS cliente_id, cl.nombre AS cliente, p.numero AS parcela,
            (SELECT group_concat(CASE WHEN c.numero = 0 THEN 'Pie' ELSE 'N° ' || c.numero END, ', ')
               FROM pago_cuotas pc JOIN cuotas c ON c.id = pc.cuota_id WHERE pc.pago_id = pg.id) AS imputado_a
       FROM pagos pg
       JOIN ventas v ON v.id = pg.venta_id
       JOIN clientes cl ON cl.id = v.cliente_id
       JOIN parcelas p ON p.id = v.parcela_id
      WHERE pg.fecha BETWEEN ? AND ?
      ORDER BY pg.fecha DESC, pg.id DESC`,
    desde, hasta,
  );
  const desglose = desglosePagos([...new Set(pagos.filter((p) => !p.anulado).map((p) => p.venta_id))]);
  res.json(pagos.map((p) => ({ ...p, ...(p.anulado ? { capital: 0, interes: 0 } : desglose.get(p.id) ?? { capital: p.monto, interes: 0 }) })));
});

// ---------- Panel de inicio ----------

rutasCobranza.get('/panel', (req, res) => {
  const fechaHoy = hoy();
  const mes = fechaHoy.slice(0, 7);

  const parcelas = { total: 0, disponible: 0, reservada: 0, vendida: 0, bloqueada: 0, valor_disponible: 0 };
  for (const f of db.all('SELECT estado, COUNT(*) AS n, COALESCE(SUM(precio), 0) AS valor FROM parcelas GROUP BY estado')) {
    parcelas[f.estado] = f.n;
    parcelas.total += f.n;
    if (f.estado === 'disponible') parcelas.valor_disponible = f.valor;
  }

  const cartera = db.get(
    `SELECT COALESCE(SUM(c.monto - c.pagado), 0) AS por_cobrar,
            COALESCE(SUM(MIN(c.amortizacion, c.monto - c.pagado)), 0) AS capital,
            COUNT(DISTINCT v.id) AS n_creditos
       FROM cuotas c JOIN ventas v ON v.id = c.venta_id
      WHERE v.estado = 'vigente' AND c.pagado < c.monto`,
  );
  const atraso = db.get(
    `SELECT COALESCE(SUM(c.monto - c.pagado), 0) AS monto, COUNT(*) AS n_cuotas, COUNT(DISTINCT v.cliente_id) AS n_deudores
       FROM cuotas c JOIN ventas v ON v.id = c.venta_id
      WHERE v.estado = 'vigente' AND c.pagado < c.monto AND c.fecha_vencimiento < ?`,
    fechaHoy,
  );
  const recaudado = db.get(
    `SELECT COALESCE(SUM(monto + mora), 0) AS monto, COUNT(*) AS n FROM pagos WHERE anulado = 0 AND substr(fecha, 1, 7) = ?`,
    mes,
  );
  const cuotasDelMes = db.get(
    `SELECT COALESCE(SUM(c.monto), 0) AS monto, COALESCE(SUM(c.pagado), 0) AS pagado, COUNT(*) AS n
       FROM cuotas c JOIN ventas v ON v.id = c.venta_id
      WHERE v.estado <> 'anulada' AND substr(c.fecha_vencimiento, 1, 7) = ?`,
    mes,
  );
  const ventasDelMes = db.get(
    `SELECT COUNT(*) AS n, COALESCE(SUM(precio), 0) AS monto FROM ventas WHERE estado <> 'anulada' AND substr(fecha, 1, 7) = ?`,
    mes,
  );

  res.json({
    hoy: fechaHoy,
    parcelas,
    cartera: { ...cartera, atrasado: atraso.monto, n_cuotas_atrasadas: atraso.n_cuotas, n_deudores_morosos: atraso.n_deudores },
    mes: { recaudado: recaudado.monto, n_pagos: recaudado.n, cuotas: cuotasDelMes, ventas: ventasDelMes },
    proximos_vencimientos: db.all(
      `${CUOTAS_CON_CONTEXTO} AND c.fecha_vencimiento BETWEEN ? AND ? ORDER BY c.fecha_vencimiento, c.id LIMIT 8`,
      fechaHoy, sumarDias(fechaHoy, 7),
    ).map((c) => decorarCuota(c, fechaHoy, 0)),
    proximas_visitas: db.all(
      `SELECT vi.id, vi.inicio, vi.nombre, vi.telefono, vi.estado, u.nombre AS vendedor
         FROM visitas vi LEFT JOIN usuarios u ON u.id = vi.vendedor_id
        WHERE vi.inicio >= ? AND vi.estado IN ('programada', 'confirmada')
        ORDER BY vi.inicio LIMIT 6`,
      fechaHoy,
    ),
    flujo: flujoFuturo().meses.slice(0, 12),
  });
});
