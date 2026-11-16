import { db, insertar } from '../db.js';
import { tablaAmortizacion, pesos } from './finanzas.js';
import { hoy, diasEntre, esFecha } from './fechas.js';
import { ErrorApp } from './validar.js';
import { leerSeccion } from './configuracion.js';
import { registrar, diferencias, describirCambios } from './bitacora.js';

export const MEDIOS_PAGO = ['transferencia', 'deposito', 'efectivo', 'cheque', 'tarjeta', 'otro'];

/**
 * Agrega a una cuota su situación al día de hoy:
 * saldo, estado (pagada | atrasada | parcial | pendiente), días de atraso e interés por mora estimado.
 */
export function decorarCuota(c, fechaHoy, tasaMoraMensual) {
  const saldo = Math.max(0, c.monto - c.pagado);
  let estado = 'pendiente';
  let dias_atraso = 0;
  let mora_estimada = 0;
  if (saldo === 0) {
    estado = 'pagada';
  } else if (c.fecha_vencimiento < fechaHoy) {
    estado = 'atrasada';
    dias_atraso = diasEntre(c.fecha_vencimiento, fechaHoy);
    mora_estimada = Math.round((saldo * (tasaMoraMensual / 100) * dias_atraso) / 30);
  } else if (c.pagado > 0) {
    estado = 'parcial';
  }
  return { ...c, saldo, estado, dias_atraso, mora_estimada };
}

export const tasaMora = () => Number(leerSeccion('credito').tasa_mora_mensual) || 0;

/**
 * Vuelve a imputar todos los pagos vigentes de una venta a sus cuotas, de la más antigua
 * a la más nueva. Se llama después de registrar o anular un pago, de modo que el estado
 * de las cuotas siempre se deduce de los pagos y nunca queda inconsistente.
 */
export function reaplicarPagos(ventaId) {
  db.tx(() => {
    db.run('DELETE FROM pago_cuotas WHERE pago_id IN (SELECT id FROM pagos WHERE venta_id = ?)', ventaId);
    const cuotas = db
      .all('SELECT id, monto FROM cuotas WHERE venta_id = ? ORDER BY numero', ventaId)
      .map((c) => ({ ...c, pagado: 0, fecha_pago: null }));
    const pagos = db.all('SELECT id, fecha, monto FROM pagos WHERE venta_id = ? AND anulado = 0 ORDER BY fecha, id', ventaId);

    let i = 0;
    for (const p of pagos) {
      let resto = p.monto;
      while (resto > 0 && i < cuotas.length) {
        const c = cuotas[i];
        const aplica = Math.min(resto, c.monto - c.pagado);
        if (aplica > 0) {
          c.pagado += aplica;
          resto -= aplica;
          db.run('INSERT INTO pago_cuotas (pago_id, cuota_id, monto) VALUES (?, ?, ?)', p.id, c.id, aplica);
        }
        if (c.pagado >= c.monto) {
          c.fecha_pago = p.fecha;
          i++;
        }
      }
      if (resto > 0) throw new ErrorApp('El monto pagado supera el saldo pendiente de la venta');
    }

    for (const c of cuotas) {
      db.run('UPDATE cuotas SET pagado = ?, fecha_pago = ? WHERE id = ?', c.pagado, c.fecha_pago, c.id);
    }
    const quedaSaldo = cuotas.some((c) => c.pagado < c.monto);
    db.run("UPDATE ventas SET estado = ? WHERE id = ? AND estado <> 'anulada'", quedaSaldo ? 'vigente' : 'pagada', ventaId);
  });
}

/**
 * Crea una venta con su calendario de pagos (pie + cuotas con interés).
 * `d` ya viene validado por la ruta. Devuelve el id de la venta.
 */
export function crearVenta(d, usuarioId) {
  return db.tx(() => {
    const parcela = db.get('SELECT id, numero, estado FROM parcelas WHERE id = ?', d.parcela_id);
    if (!parcela) throw new ErrorApp('La parcela no existe', 404);
    if (parcela.estado === 'vendida') throw new ErrorApp(`La parcela ${parcela.numero} ya está vendida`, 409);
    if (parcela.estado === 'bloqueada') throw new ErrorApp(`La parcela ${parcela.numero} está bloqueada para la venta`, 409);
    if (!db.get('SELECT id FROM clientes WHERE id = ?', d.cliente_id)) throw new ErrorApp('El cliente no existe', 404);
    if (d.pie > d.precio) throw new ErrorApp('El pie no puede ser mayor que el precio de venta');

    const financiado = d.precio - d.pie;
    let tabla = { cuota: 0, filas: [] };
    if (financiado > 0) {
      if (!(d.n_cuotas >= 1)) throw new ErrorApp('Indique el número de cuotas para el saldo a crédito');
      if (!d.fecha_primera_cuota) throw new ErrorApp('Indique la fecha de vencimiento de la primera cuota');
      if (d.fecha_primera_cuota < d.fecha) throw new ErrorApp('La primera cuota no puede vencer antes de la fecha de venta');
      tabla = tablaAmortizacion({
        monto: financiado,
        tasaMensual: d.tasa_mensual,
        nCuotas: d.n_cuotas,
        fechaPrimeraCuota: d.fecha_primera_cuota,
      });
    }

    const ventaId = insertar('ventas', {
      parcela_id: d.parcela_id,
      cliente_id: d.cliente_id,
      cotizacion_id: d.cotizacion_id,
      vendedor_id: d.vendedor_id,
      fecha: d.fecha,
      precio: d.precio,
      pie: d.pie,
      monto_financiado: financiado,
      tasa_mensual: financiado > 0 ? d.tasa_mensual : 0,
      n_cuotas: tabla.filas.length,
      valor_cuota: tabla.cuota,
      fecha_primera_cuota: financiado > 0 ? d.fecha_primera_cuota : null,
      observaciones: d.observaciones,
    });

    if (d.pie > 0) {
      insertar('cuotas', {
        venta_id: ventaId, numero: 0, tipo: 'pie', fecha_vencimiento: d.fecha,
        monto: d.pie, interes: 0, amortizacion: d.pie, saldo_insoluto: financiado,
      });
    }
    for (const f of tabla.filas) {
      insertar('cuotas', {
        venta_id: ventaId, numero: f.numero, tipo: 'cuota', fecha_vencimiento: f.fecha,
        monto: f.cuota, interes: f.interes, amortizacion: f.amortizacion, saldo_insoluto: f.saldo,
      });
    }

    db.run("UPDATE parcelas SET estado = 'vendida' WHERE id = ?", d.parcela_id);
    if (d.cotizacion_id) db.run("UPDATE cotizaciones SET estado = 'aceptada' WHERE id = ?", d.cotizacion_id);

    // Pagos iniciales: el pie y, para ventas antiguas que se cargan al sistema, las cuotas ya pagadas.
    const fechaHoy = hoy();
    const cuotasPagadas = Math.min(d.cuotas_pagadas || 0, tabla.filas.length);
    if (d.pie > 0 && (d.pie_pagado || cuotasPagadas > 0)) {
      insertar('pagos', {
        venta_id: ventaId, fecha: d.fecha, monto: d.pie, medio: d.medio_pie || 'transferencia',
        observacion: tabla.filas.length > 0 ? 'Pago del pie' : 'Pago al contado', usuario_id: usuarioId,
      });
    }
    for (const f of tabla.filas.slice(0, cuotasPagadas)) {
      insertar('pagos', {
        venta_id: ventaId, fecha: f.fecha < fechaHoy ? f.fecha : fechaHoy, monto: f.cuota,
        medio: 'otro', observacion: `Carga inicial — cuota ${f.numero}`, usuario_id: usuarioId,
      });
    }
    reaplicarPagos(ventaId);
    return ventaId;
  });
}

export function registrarPago(ventaId, d, usuarioId) {
  return db.tx(() => {
    const venta = db.get('SELECT id, estado FROM ventas WHERE id = ?', ventaId);
    if (!venta) throw new ErrorApp('La venta no existe', 404);
    if (venta.estado === 'anulada') throw new ErrorApp('La venta está anulada; no admite pagos', 409);
    if (d.fecha > hoy()) throw new ErrorApp('La fecha del pago no puede ser futura');
    const { saldo } = db.get('SELECT COALESCE(SUM(monto - pagado), 0) AS saldo FROM cuotas WHERE venta_id = ?', ventaId);
    if (saldo <= 0) throw new ErrorApp('La venta no tiene saldo pendiente', 409);
    if (d.monto > saldo) {
      throw new ErrorApp(`El monto supera el saldo pendiente de la venta ($${saldo.toLocaleString('es-CL')})`);
    }
    const pagoId = insertar('pagos', {
      venta_id: ventaId, fecha: d.fecha, monto: d.monto, mora: d.mora || 0, medio: d.medio,
      comprobante: d.comprobante, observacion: d.observacion, usuario_id: usuarioId,
    });
    reaplicarPagos(ventaId);
    return pagoId;
  });
}

export function anularPago(pagoId, motivo, usuarioId) {
  return db.tx(() => {
    const pago = db.get('SELECT * FROM pagos WHERE id = ?', pagoId);
    if (!pago) throw new ErrorApp('El pago no existe', 404);
    if (pago.anulado) throw new ErrorApp('El pago ya está anulado', 409);
    db.run('UPDATE pagos SET anulado = 1, motivo_anulacion = ? WHERE id = ?', motivo, pagoId);
    reaplicarPagos(pago.venta_id);
    registrar(usuarioId, {
      accion: 'pago_anulado', entidad: 'venta', entidadId: pago.venta_id, motivo,
      detalle: `Pago N° ${pago.id} del ${pago.fecha} por ${pesos(pago.monto)}`,
    });
    return pago.venta_id;
  });
}

const ETIQUETAS_PAGO = { fecha: 'Fecha', monto: 'Monto', mora: 'Interés por mora', medio: 'Medio de pago', comprobante: 'Comprobante', observacion: 'Observación' };

/** Corrige los datos de un pago ya registrado y vuelve a imputar los pagos de la venta. */
export function editarPago(pagoId, d, motivo, usuarioId) {
  return db.tx(() => {
    const pago = db.get('SELECT * FROM pagos WHERE id = ?', pagoId);
    if (!pago) throw new ErrorApp('El pago no existe', 404);
    if (pago.anulado) throw new ErrorApp('El pago está anulado; no se puede modificar', 409);
    if (d.fecha > hoy()) throw new ErrorApp('La fecha del pago no puede ser futura');
    const { total } = db.get('SELECT COALESCE(SUM(monto), 0) AS total FROM cuotas WHERE venta_id = ?', pago.venta_id);
    const { otros } = db.get('SELECT COALESCE(SUM(monto), 0) AS otros FROM pagos WHERE venta_id = ? AND anulado = 0 AND id <> ?', pago.venta_id, pagoId);
    if (otros + d.monto > total) {
      throw new ErrorApp(`Con ese monto los pagos superan el total de la venta. Máximo para este pago: ${pesos(total - otros)}`);
    }
    const legible = (p) => ({ ...p, monto: pesos(p.monto), mora: pesos(p.mora) });
    const cambios = diferencias(legible(pago), legible(d), ETIQUETAS_PAGO);
    if (!cambios.length) throw new ErrorApp('No hay cambios que guardar');
    db.run(
      'UPDATE pagos SET fecha = ?, monto = ?, mora = ?, medio = ?, comprobante = ?, observacion = ? WHERE id = ?',
      d.fecha, d.monto, d.mora, d.medio, d.comprobante, d.observacion, pagoId,
    );
    reaplicarPagos(pago.venta_id);
    registrar(usuarioId, {
      accion: 'pago_editado', entidad: 'venta', entidadId: pago.venta_id, motivo,
      detalle: `Pago N° ${pago.id}: ${describirCambios(cambios)}`,
    });
    return pago.venta_id;
  });
}

/** Anula la venta: deja de contar como cartera y la parcela vuelve a estar disponible. */
export function anularVenta(ventaId, motivo, usuarioId) {
  db.tx(() => {
    const venta = db.get('SELECT id, parcela_id, estado FROM ventas WHERE id = ?', ventaId);
    if (!venta) throw new ErrorApp('La venta no existe', 404);
    if (venta.estado === 'anulada') throw new ErrorApp('La venta ya está anulada', 409);
    db.run("UPDATE ventas SET estado = 'anulada', motivo_anulacion = ? WHERE id = ?", motivo, ventaId);
    db.run("UPDATE parcelas SET estado = 'disponible' WHERE id = ?", venta.parcela_id);
    registrar(usuarioId, { accion: 'venta_anulada', entidad: 'venta', entidadId: ventaId, motivo, detalle: 'Venta anulada; la parcela queda disponible' });
  });
}

/** Elimina por completo una venta ingresada por error. Solo si no tiene pagos vigentes. */
export function eliminarVenta(ventaId, usuarioId) {
  db.tx(() => {
    const venta = db.get(
      `SELECT v.id, v.parcela_id, v.estado, v.fecha, v.precio, p.numero AS parcela, c.nombre AS cliente
         FROM ventas v JOIN parcelas p ON p.id = v.parcela_id JOIN clientes c ON c.id = v.cliente_id WHERE v.id = ?`,
      ventaId,
    );
    if (!venta) throw new ErrorApp('La venta no existe', 404);
    const { n } = db.get('SELECT COUNT(*) AS n FROM pagos WHERE venta_id = ? AND anulado = 0', ventaId);
    if (n > 0) throw new ErrorApp('La venta tiene pagos registrados. Anule los pagos o anule la venta en lugar de eliminarla.', 409);
    db.run('DELETE FROM ventas WHERE id = ?', ventaId);
    if (venta.estado !== 'anulada') db.run("UPDATE parcelas SET estado = 'disponible' WHERE id = ?", venta.parcela_id);
    registrar(usuarioId, {
      accion: 'venta_eliminada', entidad: 'venta', entidadId: ventaId,
      detalle: `Venta de la parcela ${venta.parcela} a ${venta.cliente} (${venta.fecha}, ${pesos(venta.precio)}) eliminada por error de ingreso`,
    });
  });
}

// ---------- Edición de la tabla de amortización ----------

/** Estado actual de la tabla de una venta, en la misma forma que recibe aplicarTabla. */
export function instantaneaTabla(ventaId) {
  const v = db.get('SELECT precio, pie, tasa_mensual FROM ventas WHERE id = ?', ventaId);
  const cuotas = db.all('SELECT numero, tipo, fecha_vencimiento, interes, amortizacion FROM cuotas WHERE venta_id = ? ORDER BY numero', ventaId);
  const pie = cuotas.find((c) => c.tipo === 'pie');
  return {
    precio: v.precio,
    pie: v.pie,
    fecha_pie: pie?.fecha_vencimiento ?? null,
    tasa_mensual: v.tasa_mensual,
    cuotas: cuotas.filter((c) => c.tipo === 'cuota').map((c) => ({ fecha_vencimiento: c.fecha_vencimiento, interes: c.interes, amortizacion: c.amortizacion })),
  };
}

const entero = (v, campo, min = 0) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > 100_000_000_000) throw new ErrorApp(`${campo}: valor inválido`);
  return n;
};

/** Valida una tabla recibida desde el editor. El monto de cada cuota es siempre interés + amortización. */
export function leerTabla(cuerpo) {
  if (!cuerpo || typeof cuerpo !== 'object') throw new ErrorApp('Solicitud inválida');
  const precio = entero(cuerpo.precio, 'Precio de venta', 1);
  const pie = entero(cuerpo.pie ?? 0, 'Pie');
  if (pie > precio) throw new ErrorApp('El pie no puede ser mayor que el precio de venta');
  const fecha_pie = pie > 0 ? cuerpo.fecha_pie : null;
  if (pie > 0 && !esFecha(fecha_pie)) throw new ErrorApp('Indique la fecha del pie');
  const tasa = Number(cuerpo.tasa_mensual ?? 0);
  if (!Number.isFinite(tasa) || tasa < 0 || tasa > 15) throw new ErrorApp('Tasa de interés mensual: valor inválido');
  if (!Array.isArray(cuerpo.cuotas) || cuerpo.cuotas.length > 600) throw new ErrorApp('Lista de cuotas inválida');
  const cuotas = cuerpo.cuotas.map((c, i) => {
    const n = i + 1;
    if (!c || !esFecha(c.fecha_vencimiento)) throw new ErrorApp(`Cuota ${n}: fecha de vencimiento inválida`);
    const interes = entero(c.interes, `Cuota ${n}, interés`);
    const amortizacion = entero(c.amortizacion, `Cuota ${n}, amortización`);
    if (interes + amortizacion <= 0) throw new ErrorApp(`Cuota ${n}: el monto debe ser mayor que cero`);
    return { fecha_vencimiento: c.fecha_vencimiento, interes, amortizacion };
  });
  if (precio - pie > 0 && cuotas.length === 0) throw new ErrorApp('Hay saldo a crédito: la tabla debe tener al menos una cuota');
  return { precio, pie, fecha_pie, tasa_mensual: Math.round(tasa * 10000) / 10000, cuotas };
}

const valorMasFrecuente = (valores) => {
  const cuenta = new Map();
  for (const v of valores) cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0;
};

function resumenTabla(t) {
  const montos = t.cuotas.map((c) => c.interes + c.amortizacion);
  const amortizado = t.cuotas.reduce((s, c) => s + c.amortizacion, 0);
  return {
    precio: t.precio,
    pie: t.pie,
    financiado: t.precio - t.pie,
    n: t.cuotas.length,
    intereses: t.cuotas.reduce((s, c) => s + c.interes, 0),
    total: t.pie + montos.reduce((s, m) => s + m, 0),
    saldo_final: t.precio - t.pie - amortizado,
  };
}

/**
 * Reemplaza el calendario de pagos de una venta por la tabla indicada (ya validada con leerTabla)
 * y vuelve a imputar los pagos. Guarda la tabla anterior en el registro de cambios para poder deshacer.
 */
export function aplicarTabla(ventaId, t, { usuarioId, motivo, accion = 'amortizacion', detalleExtra = '' }) {
  return db.tx(() => {
    const venta = db.get('SELECT id, estado FROM ventas WHERE id = ?', ventaId);
    if (!venta) throw new ErrorApp('La venta no existe', 404);
    if (venta.estado === 'anulada') throw new ErrorApp('La venta está anulada; su tabla no se puede modificar', 409);

    const anterior = instantaneaTabla(ventaId);
    const r0 = resumenTabla(anterior);
    const r1 = resumenTabla(t);
    const { pagado } = db.get('SELECT COALESCE(SUM(monto), 0) AS pagado FROM pagos WHERE venta_id = ? AND anulado = 0', ventaId);
    if (r1.total < pagado) {
      throw new ErrorApp(`Los pagos ya registrados (${pesos(pagado)}) superan el total de la nueva tabla (${pesos(r1.total)}). Ajuste la tabla o corrija los pagos primero.`);
    }

    const financiado = t.precio - t.pie;
    db.run('DELETE FROM cuotas WHERE venta_id = ?', ventaId);
    if (t.pie > 0) {
      insertar('cuotas', {
        venta_id: ventaId, numero: 0, tipo: 'pie', fecha_vencimiento: t.fecha_pie,
        monto: t.pie, interes: 0, amortizacion: t.pie, saldo_insoluto: financiado,
      });
    }
    let saldo = financiado;
    t.cuotas.forEach((c, i) => {
      saldo -= c.amortizacion;
      insertar('cuotas', {
        venta_id: ventaId, numero: i + 1, tipo: 'cuota', fecha_vencimiento: c.fecha_vencimiento,
        monto: c.interes + c.amortizacion, interes: c.interes, amortizacion: c.amortizacion, saldo_insoluto: saldo,
      });
    });
    db.run(
      `UPDATE ventas SET precio = ?, pie = ?, monto_financiado = ?, tasa_mensual = ?, n_cuotas = ?, valor_cuota = ?, fecha_primera_cuota = ?
        WHERE id = ?`,
      t.precio, t.pie, financiado, t.cuotas.length ? t.tasa_mensual : 0, t.cuotas.length,
      valorMasFrecuente(t.cuotas.map((c) => c.interes + c.amortizacion)), t.cuotas[0]?.fecha_vencimiento ?? null, ventaId,
    );
    reaplicarPagos(ventaId);

    const partes = [];
    const comparar = (etiqueta, a, b, fmt = pesos) => a !== b && partes.push(`${etiqueta}: ${fmt(a)} → ${fmt(b)}`);
    comparar('Precio', r0.precio, r1.precio);
    comparar('Pie', r0.pie, r1.pie);
    comparar('Cuotas', r0.n, r1.n, String);
    comparar('Intereses', r0.intereses, r1.intereses);
    comparar('Total a pagar', r0.total, r1.total);
    comparar('Saldo final', r0.saldo_final, r1.saldo_final);
    comparar('Tasa mensual', anterior.tasa_mensual, t.tasa_mensual, (x) => `${String(x).replace('.', ',')} %`);
    const filasCambiadas = t.cuotas.filter((c, i) => {
      const a = anterior.cuotas[i];
      return !a || a.fecha_vencimiento !== c.fecha_vencimiento || a.interes !== c.interes || a.amortizacion !== c.amortizacion;
    }).length + Math.max(0, anterior.cuotas.length - t.cuotas.length);
    if (filasCambiadas) partes.push(`${filasCambiadas} cuota(s) modificadas`);
    if (anterior.fecha_pie !== t.fecha_pie && t.pie > 0 && r0.pie > 0) partes.push(`Fecha del pie: ${anterior.fecha_pie} → ${t.fecha_pie}`);

    const entradaId = registrar(usuarioId, {
      accion, entidad: 'venta', entidadId: ventaId, motivo,
      detalle: [detalleExtra, partes.join('; ') || 'Sin diferencias en los totales'].filter(Boolean).join(' — '),
      anterior,
    });
    return { entradaId, resumen: r1 };
  });
}

// ---------- Desglose contable de los pagos ----------

/**
 * Separa cada pago en capital e interés. Dentro de cada cuota, lo pagado cubre primero
 * el interés y luego el capital (el mismo criterio que usa el saldo de capital insoluto).
 * Devuelve un Map pago_id → { capital, interes }.
 */
export function desglosePagos(ventaIds) {
  const resultado = new Map();
  if (!ventaIds.length) return resultado;
  const marcas = ventaIds.map(() => '?').join(', ');
  const filas = db.all(
    `SELECT pc.pago_id, pc.cuota_id, pc.monto, c.interes
       FROM pago_cuotas pc
       JOIN cuotas c ON c.id = pc.cuota_id
       JOIN pagos p ON p.id = pc.pago_id
      WHERE c.venta_id IN (${marcas})
      ORDER BY c.id, p.fecha, p.id`,
    ...ventaIds,
  );
  const interesCubierto = new Map();
  for (const f of filas) {
    const yaCubierto = interesCubierto.get(f.cuota_id) ?? 0;
    const interes = Math.min(f.monto, Math.max(0, f.interes - yaCubierto));
    interesCubierto.set(f.cuota_id, yaCubierto + interes);
    const r = resultado.get(f.pago_id) ?? { capital: 0, interes: 0 };
    r.interes += interes;
    r.capital += f.monto - interes;
    resultado.set(f.pago_id, r);
  }
  return resultado;
}

/** Totales de una venta a partir de sus cuotas ya decoradas. */
export function totalesDe(cuotas) {
  const t = {
    total_a_pagar: 0, pagado: 0, saldo: 0, capital_insoluto: 0, intereses_totales: 0,
    atrasado: 0, n_atrasadas: 0, mora_estimada: 0, dias_atraso: 0,
    cuotas_total: 0, cuotas_pagadas: 0, proxima: null,
  };
  for (const c of cuotas) {
    t.total_a_pagar += c.monto;
    t.pagado += c.pagado;
    t.saldo += c.saldo;
    t.intereses_totales += c.interes;
    // Un pago parcial cubre primero el interés de la cuota y después el capital.
    t.capital_insoluto += Math.min(c.amortizacion, c.saldo);
    if (c.tipo === 'cuota') {
      t.cuotas_total++;
      if (c.estado === 'pagada') t.cuotas_pagadas++;
    }
    if (c.estado === 'atrasada') {
      t.atrasado += c.saldo;
      t.n_atrasadas++;
      t.mora_estimada += c.mora_estimada;
      t.dias_atraso = Math.max(t.dias_atraso, c.dias_atraso);
    }
    if (!t.proxima && c.saldo > 0) {
      t.proxima = { numero: c.numero, tipo: c.tipo, fecha: c.fecha_vencimiento, saldo: c.saldo, estado: c.estado };
    }
  }
  return t;
}

/** Venta completa: datos, parcela, cliente, cuotas con su situación, pagos y totales. */
export function detalleVenta(ventaId) {
  const venta = db.get(
    `SELECT v.*, u.nombre AS vendedor
       FROM ventas v LEFT JOIN usuarios u ON u.id = v.vendedor_id
      WHERE v.id = ?`,
    ventaId,
  );
  if (!venta) throw new ErrorApp('La venta no existe', 404);
  const fechaHoy = hoy();
  const mora = tasaMora();
  const cuotas = db
    .all('SELECT * FROM cuotas WHERE venta_id = ? ORDER BY numero', ventaId)
    .map((c) => decorarCuota(c, fechaHoy, venta.estado === 'anulada' ? 0 : mora));
  const pagos = db.all(
    `SELECT p.*, u.nombre AS usuario,
            (SELECT group_concat(CASE WHEN c.numero = 0 THEN 'Pie' ELSE 'N° ' || c.numero END, ', ')
               FROM pago_cuotas pc JOIN cuotas c ON c.id = pc.cuota_id
              WHERE pc.pago_id = p.id) AS imputado_a
       FROM pagos p LEFT JOIN usuarios u ON u.id = p.usuario_id
      WHERE p.venta_id = ?
      ORDER BY p.fecha DESC, p.id DESC`,
    ventaId,
  );
  return {
    venta,
    parcela: db.get('SELECT * FROM parcelas WHERE id = ?', venta.parcela_id),
    cliente: db.get('SELECT * FROM clientes WHERE id = ?', venta.cliente_id),
    cuotas,
    pagos,
    totales: totalesDe(cuotas),
  };
}
