// Prueba de punta a punta de la API, con una base de datos en memoria.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dirTemporal = fs.mkdtempSync(path.join(os.tmpdir(), 'aguafresca-test-'));
process.env.DB_PATH = ':memory:';
process.env.DATA_DIR = dirTemporal;
process.env.CLAVE_ADMIN = 'clave-admin-123';
process.env.CLAVE_LDIAZ = 'clave-abogado-1';
process.env.CLAVE_PMERCADO = 'clave-contador-1';

const { app } = await import('../app.js');
const { hoy, sumarMeses, sumarDias } = await import('../lib/fechas.js');

let servidor;
let base;
const HOY = hoy();

// Venta de prueba: 24 cuotas cuya primera venció hace 5 meses. La cantidad de cuotas ya vencidas
// se calcula (suele ser 5, pero a fin de mes el día de vencimiento puede quedar antes de hoy).
const PRIMERA = sumarMeses(HOY, -5);
const VENCIMIENTOS = Array.from({ length: 24 }, (_, k) => sumarMeses(PRIMERA, k));
const VENCIDAS = VENCIMIENTOS.filter((f) => f < HOY).length;

/** Cliente HTTP mínimo que conserva la cookie de sesión. */
function cliente() {
  let cookie = '';
  return async function pedir(metodo, ruta, cuerpo, extra = {}) {
    const r = await fetch(base + ruta, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', 'X-AF': '1', ...(cookie ? { Cookie: cookie } : {}), ...extra.headers },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const nueva = r.headers.get('set-cookie');
    if (nueva) cookie = nueva.split(';')[0];
    const datos = await r.json().catch(() => null);
    return { estado: r.status, datos };
  };
}

const admin = cliente();     // super administrador
const abogado = cliente();   // ldiaz
const contador = cliente();  // pmercado
const ok = (r, estado = 200) => {
  assert.equal(r.estado, estado, JSON.stringify(r.datos));
  return r.datos;
};

before(async () => {
  servidor = app.listen(0);
  await new Promise((r) => servidor.once('listening', r));
  base = `http://127.0.0.1:${servidor.address().port}/api`;
});

after(() => {
  servidor.close();
  fs.rmSync(dirTemporal, { recursive: true, force: true });
});

test('sesión: exige autenticación y cabecera anti-CSRF', async () => {
  assert.equal((await cliente()('GET', '/parcelas')).estado, 401);
  assert.equal((await admin('POST', '/auth/login', { usuario: 'admin', password: 'incorrecta' })).estado, 401);
  const sinCabecera = await fetch(`${base}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'admin', password: 'clave-admin-123' }),
  });
  assert.equal(sinCabecera.status, 403);
  const u = ok(await admin('POST', '/auth/login', { usuario: 'ADMIN', password: 'clave-admin-123' }));
  assert.equal(u.rol, 'superadmin');
  assert.equal(ok(await admin('GET', '/auth/yo')).usuario, 'admin');
});

test('cuentas: son exactamente tres, cada una con sus permisos', async () => {
  const a = ok(await abogado('POST', '/auth/login', { usuario: 'ldiaz', password: 'clave-abogado-1' }));
  const c = ok(await contador('POST', '/auth/login', { usuario: 'pmercado', password: 'clave-contador-1' }));
  assert.deepEqual([a.rol, c.rol], ['abogado', 'contador']);
  assert.deepEqual(a.permisos, ['plantillas']);
  assert.deepEqual(c.permisos, ['amortizacion', 'contabilidad']);
  assert.ok(ok(await admin('GET', '/auth/yo')).permisos.includes('empresa'));

  const cuentas = ok(await admin('GET', '/usuarios'));
  assert.deepEqual(cuentas.map((x) => x.usuario), ['admin', 'ldiaz', 'pmercado']);
  assert.equal(ok(await abogado('GET', '/usuarios'))[0].usuario, undefined, 'solo el super administrador ve los nombres de usuario');
  assert.equal((await admin('POST', '/usuarios', { nombre: 'Otra', usuario: 'otra', password: 'otra-clave-1' })).estado, 404, 'no se crean cuentas');
  assert.equal((await admin('DELETE', `/usuarios/${cuentas[1].id}`)).estado, 404, 'no se eliminan cuentas');

  // Datos sensibles de la empresa y precios: solo el super administrador.
  const empresa = { empresa: { razon_social: 'Agua Fresca SpA' }, proyecto: { nombre: 'Fundo Entre Ríos' } };
  assert.equal((await abogado('PUT', '/config/empresa', empresa)).estado, 403);
  assert.equal((await contador('PUT', '/config/empresa', empresa)).estado, 403);
  assert.equal((await contador('POST', '/parcelas', { numero: '99', superficie_m2: 5000, precio: 1 })).estado, 403);
  // Parámetros contables: contador y super administrador.
  const credito = { credito: { tasa_mensual: 1, tasa_mora_mensual: 0, n_cuotas: 36, pie_porcentaje: 20, dias_validez_cotizacion: 15, dias_plazo_carta: 10 } };
  assert.equal((await abogado('PUT', '/config/credito', credito)).estado, 403);
  ok(await contador('PUT', '/config/credito', credito));
  // Plantillas: abogado y super administrador.
  assert.equal((await contador('POST', '/plantillas', { tipo: 'promesa', nombre: 'X', contenido: '<p>x</p>' })).estado, 403);
  // Registro de cambios: solo el super administrador.
  assert.equal((await contador('GET', '/bitacora')).estado, 403);

  // El super administrador restablece la contraseña de otra cuenta: se cierran sus sesiones.
  ok(await admin('PUT', `/usuarios/${cuentas[2].id}`, { nombre: 'P. Mercado', password: 'nueva-clave-contador' }));
  assert.equal((await contador('GET', '/auth/yo')).estado, 401);
  ok(await contador('POST', '/auth/login', { usuario: 'pmercado', password: 'nueva-clave-contador' }));
});

let parcelaA, parcelaB, parcelaC, clienteId;

test('parcelas y clientes: alta y validaciones', async () => {
  parcelaA = ok(await admin('POST', '/parcelas', { numero: '1', sector: 'Etapa 1', superficie_m2: 5000, precio: 25_000_000 }), 201).id;
  parcelaB = ok(await admin('POST', '/parcelas', { numero: '2', superficie_m2: 5200.5, precio: 30_000_000 }), 201).id;
  parcelaC = ok(await admin('POST', '/parcelas', { numero: '10', superficie_m2: 5000, precio: 20_000_000 }), 201).id;
  assert.equal((await admin('POST', '/parcelas', { numero: '1', superficie_m2: 1, precio: 1 })).estado, 409);
  assert.equal((await admin('POST', '/parcelas', { numero: '', superficie_m2: 1, precio: 1 })).estado, 400);

  ok(await admin('PUT', `/parcelas/${parcelaA}/poligono`, { poligono: [[0, 0], [100, 0], [100, 80.26], [0, 80]] }));
  assert.equal((await admin('PUT', `/parcelas/${parcelaA}/poligono`, { poligono: [[0, 0], [1, 1]] })).estado, 400);
  const lista = ok(await admin('GET', '/parcelas'));
  assert.deepEqual(lista.map((p) => p.numero), ['1', '2', '10'], 'orden natural por número');
  assert.deepEqual(lista[0].poligono[2], [100, 80.3]);

  assert.equal((await admin('POST', '/clientes', { nombre: 'Ana Pérez', rut: '12.345.678-9' })).estado, 400);
  clienteId = ok(await abogado('POST', '/clientes', { nombre: 'Ana Pérez Soto', rut: '12.345.678-5', comuna: 'Valdivia', email: 'ana@correo.cl' }), 201).id;
  assert.equal((await admin('POST', '/clientes', { nombre: 'Otra Ana', rut: '12345678-5' })).estado, 409);
});

let ventaId;

test('venta a crédito: genera pie + cuotas con interés y marca la parcela como vendida', async () => {
  const sim = ok(await admin('POST', '/simular', { precio: 25_000_000, pie: 5_000_000, n_cuotas: 24, tasa_mensual: 1, fecha_primera_cuota: PRIMERA }));
  assert.equal(sim.monto_financiado, 20_000_000);
  assert.equal(sim.filas.length, 24);
  assert.equal(sim.total_operacion, 25_000_000 + sim.total_intereses);

  // Venta ingresada hace 6 meses, con la primera cuota vencida hace 5 meses.
  const fecha = sumarMeses(HOY, -6);
  ventaId = ok(await abogado('POST', '/ventas', {
    parcela_id: parcelaA, cliente_id: clienteId, fecha, precio: 25_000_000, pie: 5_000_000, n_cuotas: 24,
    tasa_mensual: 1, fecha_primera_cuota: PRIMERA, pie_pagado: true, medio_pie: 'transferencia',
  }), 201).id;

  const d = ok(await admin('GET', `/ventas/${ventaId}`));
  assert.equal(d.cuotas.length, 25);
  assert.equal(d.cuotas[0].tipo, 'pie');
  assert.equal(d.cuotas[0].estado, 'pagada');
  assert.equal(d.venta.valor_cuota, sim.valor_cuota);
  assert.equal(d.cuotas.at(-1).saldo_insoluto, 0);
  assert.equal(d.totales.n_atrasadas, VENCIDAS);
  assert.equal(d.totales.atrasado, sim.valor_cuota * VENCIDAS);
  assert.equal(d.totales.pagado, 5_000_000);
  assert.equal(d.totales.capital_insoluto, 20_000_000);
  assert.equal(d.cuotas[VENCIDAS + 1].estado, 'pendiente', 'una cuota que vence hoy o después no está atrasada');

  const p = ok(await admin('GET', '/parcelas')).find((x) => x.id === parcelaA);
  assert.equal(p.estado, 'vendida');
  assert.equal(p.cliente, 'Ana Pérez Soto');
  assert.equal((await admin('POST', '/ventas', { parcela_id: parcelaA, cliente_id: clienteId, fecha: HOY, precio: 1, pie: 1 })).estado, 409);
  assert.equal((await admin('PUT', `/parcelas/${parcelaA}`, { numero: '1', superficie_m2: 5000, precio: 1, estado: 'disponible' })).estado, 409);
});

test('pagos: se imputan a la cuota más antigua, admiten abonos parciales y anulación', async () => {
  const antes = ok(await admin('GET', `/ventas/${ventaId}`));
  const cuota = antes.venta.valor_cuota;

  // Pago de una cuota y media.
  const pagoId = ok(await abogado('POST', `/ventas/${ventaId}/pagos`, { fecha: HOY, monto: cuota + 100_000, medio: 'transferencia', comprobante: 'TRF-1' }), 201).id;
  let d = ok(await admin('GET', `/ventas/${ventaId}`));
  assert.equal(d.cuotas[1].estado, 'pagada');
  assert.equal(d.cuotas[1].fecha_pago, HOY);
  assert.equal(d.cuotas[2].pagado, 100_000);
  assert.equal(d.cuotas[2].estado, 'atrasada');
  assert.equal(d.totales.n_atrasadas, VENCIDAS - 1);
  assert.equal(d.totales.atrasado, cuota * (VENCIDAS - 1) - 100_000);
  assert.equal(d.pagos[0].imputado_a, 'N° 1, N° 2');

  // Validaciones.
  assert.equal((await admin('POST', `/ventas/${ventaId}/pagos`, { fecha: sumarDias(HOY, 1), monto: 1000 })).estado, 400, 'fecha futura');
  assert.equal((await admin('POST', `/ventas/${ventaId}/pagos`, { fecha: HOY, monto: d.totales.saldo + 1 })).estado, 400, 'supera el saldo');
  assert.equal((await admin('POST', `/ventas/${ventaId}/pagos`, { fecha: HOY, monto: 0 })).estado, 400);

  // Solo contador y super administrador anulan; al anular, las cuotas vuelven a su estado anterior.
  assert.equal((await abogado('POST', `/pagos/${pagoId}/anular`, { motivo: 'error' })).estado, 403);
  ok(await admin('POST', `/pagos/${pagoId}/anular`, { motivo: 'Transferencia rechazada' }));
  d = ok(await admin('GET', `/ventas/${ventaId}`));
  assert.equal(d.totales.n_atrasadas, VENCIDAS);
  assert.equal(d.totales.pagado, 5_000_000);
  assert.equal(d.cuotas[1].fecha_pago, null);

  // Queda una cuota pagada para las pruebas siguientes.
  ok(await abogado('POST', `/ventas/${ventaId}/pagos`, { fecha: HOY, monto: cuota, mora: 5000, medio: 'efectivo' }), 201);
  const recibo = ok(await admin('GET', `/pagos/${ok(await admin('GET', `/ventas/${ventaId}`)).pagos[0].id}`));
  assert.equal(recibo.imputaciones.length, 1);
  assert.equal(recibo.cliente.nombre, 'Ana Pérez Soto');
});

test('cobranza: atrasadas, pendientes, flujo futuro y panel', async () => {
  ok(await admin('PUT', '/config/empresa', {
    empresa: { razon_social: 'Agua Fresca SpA', rut: '76.123.456-0', ciudad: 'Valdivia', representante: 'Rosa Ríos', email: 'cobranza@prueba.cl' },
    proyecto: { nombre: 'Fundo Entre Ríos', ubicacion: 'Los Ríos' },
  }));
  ok(await contador('PUT', '/config/credito', {
    credito: { tasa_mensual: 1, tasa_mora_mensual: 1.5, n_cuotas: 36, pie_porcentaje: 20, dias_validez_cotizacion: 15, dias_plazo_carta: 10 },
  }));

  const venta = ok(await admin('GET', `/ventas/${ventaId}`));
  const cuota = venta.venta.valor_cuota;

  const atr = ok(await admin('GET', '/cobranza/atrasadas'));
  assert.equal(atr.deudores.length, 1);
  assert.equal(atr.deudores[0].n_cuotas, VENCIDAS - 1);
  assert.equal(atr.total.monto, cuota * (VENCIDAS - 1));
  assert.ok(atr.total.mora_estimada > 0, 'con tasa de mora configurada hay interés estimado');
  assert.equal(atr.tramos.reduce((s, t) => s + t.monto, 0), atr.total.monto);
  assert.equal(atr.tramos.reduce((s, t) => s + t.n, 0), VENCIDAS - 1);

  const pend = ok(await admin('GET', '/cobranza/pendientes'));
  assert.equal(pend.length, 23);
  assert.equal(pend.filter((c) => c.estado === 'atrasada').length, VENCIDAS - 1);
  const hasta = sumarMeses(HOY, 2);
  assert.equal(
    ok(await admin('GET', `/cobranza/pendientes?desde=${HOY}&hasta=${hasta}`)).length,
    VENCIMIENTOS.filter((f) => f >= HOY && f <= hasta).length,
  );

  const flujo = ok(await admin('GET', '/cobranza/flujo'));
  assert.equal(flujo.atrasado.monto, cuota * (VENCIDAS - 1));
  assert.equal(flujo.meses[0].mes, HOY.slice(0, 7));
  assert.equal(flujo.meses.reduce((s, m) => s + m.n, 0), 24 - VENCIDAS);
  const totalFuturo = flujo.meses.reduce((s, m) => s + m.total, 0);
  assert.equal(totalFuturo + flujo.atrasado.monto, venta.totales.saldo, 'flujo futuro + atrasado = saldo de la cartera');
  for (const m of flujo.meses) assert.equal(m.capital + m.interes, m.total);
  assert.equal(
    flujo.meses.reduce((s, m) => s + m.capital, 0) + venta.cuotas.filter((c) => c.estado === 'atrasada').reduce((s, c) => s + c.amortizacion, 0),
    venta.totales.capital_insoluto,
  );

  const pagos = ok(await admin('GET', '/cobranza/pagos'));
  assert.ok(pagos.some((p) => p.anulado === 1) && pagos.some((p) => p.mora === 5000));

  const panel = ok(await admin('GET', '/panel'));
  assert.deepEqual([panel.parcelas.total, panel.parcelas.vendida, panel.parcelas.disponible], [3, 1, 2]);
  assert.equal(panel.parcelas.valor_disponible, 50_000_000);
  assert.equal(panel.cartera.por_cobrar, venta.totales.saldo);
  assert.equal(panel.cartera.capital, venta.totales.capital_insoluto);
  assert.equal(panel.cartera.atrasado, cuota * (VENCIDAS - 1));
  assert.equal(panel.cartera.n_deudores_morosos, 1);
  assert.equal(panel.mes.recaudado, cuota + 5000);
  assert.equal(panel.flujo.length, 12);

  const ficha = ok(await admin('GET', `/clientes/${clienteId}`));
  assert.equal(ficha.resumen.n_atrasadas, VENCIDAS - 1);
  assert.equal(ficha.resumen.saldo, venta.totales.saldo);
  assert.equal(ok(await admin('GET', '/clientes'))[0].atrasado, cuota * (VENCIDAS - 1));
});

test('documentos: carta de cobranza y promesa a partir de plantillas', async () => {
  const plantillas = ok(await admin('GET', '/plantillas'));
  assert.equal(plantillas.length, 5);
  const carta = plantillas.find((p) => p.tipo === 'carta_cobranza');
  const promesa = plantillas.find((p) => p.tipo === 'promesa');

  const borrador = ok(await abogado('POST', '/documentos/confeccionar', { plantilla_id: carta.id, venta_id: ventaId }));
  assert.match(borrador.contenido, /Ana Pérez Soto/);
  assert.match(borrador.contenido, /Parcela N° 1/);
  assert.match(borrador.contenido, /<table class="tabla-doc">/);
  assert.match(borrador.contenido, /cobranza@prueba\.cl/);
  assert.doesNotMatch(borrador.contenido, /\{\{/, 'no quedan variables sin reemplazar');

  const docId = ok(await abogado('POST', '/documentos', {
    ...borrador, contenido: `${borrador.contenido}<script>alert(1)</script><p onclick="x()">fin</p>`,
  }), 201).id;
  const doc = ok(await admin('GET', `/documentos/${docId}`));
  assert.doesNotMatch(doc.contenido, /<script|onclick/, 'el HTML guardado queda limpio');
  assert.match(doc.contenido, /<table class="tabla-doc">/);

  const ficha = ok(await admin('GET', `/clientes/${clienteId}`));
  assert.equal(ficha.gestiones[0].tipo, 'carta', 'la carta queda en la bitácora de cobranza');
  assert.equal(ficha.documentos.length, 1);

  const contrato = ok(await admin('POST', '/documentos/confeccionar', { plantilla_id: promesa.id, venta_id: ventaId }));
  assert.match(contrato.contenido, /veinticinco millones de pesos/);
  assert.match(contrato.contenido, /12\.345\.678-5/);
  assert.match(contrato.contenido, /veinticuatro/);
  assert.match(contrato.contenido, /76\.123\.456-0/);
  assert.equal((contrato.contenido.match(/<tr>/g) || []).length, 25, 'encabezado + 24 cuotas en la tabla de desarrollo');

  ok(await admin('POST', `/clientes/${clienteId}/gestiones`, { fecha: HOY, tipo: 'compromiso', detalle: 'Promete pagar el viernes', compromiso_fecha: sumarDias(HOY, 3), compromiso_monto: 500_000 }), 201);
  assert.equal(ok(await admin('GET', '/cobranza/atrasadas')).deudores[0].ultima_gestion.tipo, 'compromiso');
});

test('cotización: simula el crédito y se convierte en venta', async () => {
  const cotId = ok(await abogado('POST', '/cotizaciones', {
    parcela_id: parcelaB, contacto_nombre: 'Luis Rojas', contacto_telefono: '+56 9 1234 5678', fecha: HOY, valida_hasta: sumarDias(HOY, 15),
    precio_lista: 30_000_000, descuento: 1_000_000, pie: 9_000_000, n_cuotas: 36, tasa_mensual: 1.2, fecha_primera_cuota: sumarMeses(HOY, 1),
  }), 201).id;
  const c = ok(await admin('GET', `/cotizaciones/${cotId}`));
  assert.equal(c.cotizacion.precio, 29_000_000);
  assert.equal(c.simulacion.monto_financiado, 20_000_000);
  assert.equal(c.cotizacion.valor_cuota, c.simulacion.valor_cuota);
  assert.equal(c.simulacion.filas.length, 36);
  assert.equal((await admin('POST', '/cotizaciones', { parcela_id: parcelaB, fecha: HOY, valida_hasta: HOY, precio_lista: 1000 })).estado, 400, 'falta el interesado');

  const luis = ok(await admin('POST', '/clientes', { nombre: 'Luis Rojas' }), 201).id;
  const v = ok(await admin('POST', '/ventas', {
    parcela_id: parcelaB, cliente_id: luis, cotizacion_id: cotId, fecha: HOY, precio: 29_000_000, pie: 9_000_000,
    n_cuotas: 36, tasa_mensual: 1.2, fecha_primera_cuota: sumarMeses(HOY, 1),
  }), 201).id;
  const lista = ok(await admin('GET', '/cotizaciones'));
  assert.equal(lista[0].estado, 'aceptada');
  assert.equal(lista[0].venta_id, v);
  assert.equal((await admin('PUT', `/cotizaciones/${cotId}`, {})).estado, 409);

  // El pie no se marcó como pagado: vence hoy, así que está pendiente pero no atrasado.
  const d = ok(await admin('GET', `/ventas/${v}`));
  assert.equal(d.cuotas[0].estado, 'pendiente');
  assert.equal(d.totales.n_atrasadas, 0);
});

test('venta al contado, carga inicial de cuotas pagadas, anulación y eliminación', async () => {
  const cl = ok(await admin('POST', '/clientes', { nombre: 'Carla Contado' }), 201).id;

  // Carga de una venta antigua con 3 cuotas ya pagadas.
  const v = ok(await admin('POST', '/ventas', {
    parcela_id: parcelaC, cliente_id: cl, fecha: sumarMeses(HOY, -4), precio: 20_000_000, pie: 2_000_000, n_cuotas: 10,
    tasa_mensual: 0, fecha_primera_cuota: sumarMeses(HOY, -3), cuotas_pagadas: 3,
  }), 201).id;
  let d = ok(await admin('GET', `/ventas/${v}`));
  assert.equal(d.venta.valor_cuota, 1_800_000);
  assert.equal(d.totales.cuotas_pagadas, 3);
  assert.equal(d.totales.n_atrasadas, 0);
  assert.equal(d.totales.pagado, 2_000_000 + 3 * 1_800_000);

  assert.equal((await abogado('POST', `/ventas/${v}/anular`, { motivo: 'x' })).estado, 403);
  assert.equal((await admin('DELETE', `/ventas/${v}`)).estado, 409, 'no se elimina una venta con pagos');
  ok(await admin('POST', `/ventas/${v}/anular`, { motivo: 'Desistimiento del comprador' }));
  assert.equal(ok(await admin('GET', '/parcelas')).find((p) => p.id === parcelaC).estado, 'disponible');
  assert.equal((await admin('POST', `/ventas/${v}/pagos`, { fecha: HOY, monto: 1000 })).estado, 409);

  // Al contado: un solo pago por el total; la venta queda pagada.
  const contado = ok(await admin('POST', '/ventas', { parcela_id: parcelaC, cliente_id: cl, fecha: HOY, precio: 19_000_000, pie: 19_000_000, pie_pagado: true }), 201).id;
  d = ok(await admin('GET', `/ventas/${contado}`));
  assert.equal(d.venta.estado, 'pagada');
  assert.equal(d.cuotas.length, 1);
  assert.equal(d.totales.saldo, 0);
  assert.equal((await admin('DELETE', `/clientes/${cl}`)).estado, 409);

  // La cartera no incluye ventas anuladas ni pagadas.
  const ventas = ok(await admin('GET', '/ventas'));
  assert.equal(ventas.length, 4);
  assert.equal(ok(await admin('GET', '/panel')).cartera.n_creditos, 2);
});

test('visitas: agenda por rango de fechas', async () => {
  const manana = sumarDias(HOY, 1);
  const id = ok(await abogado('POST', '/visitas', { inicio: `${manana}T11:30`, nombre: 'Familia Soto', telefono: '+56 9 8765 4321', parcela_ids: [parcelaB, parcelaC, 9999] }), 201).id;
  assert.equal((await abogado('POST', '/visitas', { inicio: '2026-13-01T10:00', nombre: 'X' })).estado, 400);
  let lista = ok(await abogado('GET', `/visitas?desde=${HOY}&hasta=${manana}`));
  assert.equal(lista.length, 1);
  assert.deepEqual(lista[0].parcelas, ['2', '10']);
  ok(await abogado('PUT', `/visitas/${id}`, { inicio: `${manana}T12:00`, nombre: 'Familia Soto', estado: 'confirmada', parcela_ids: [parcelaB] }));
  assert.equal(ok(await admin('GET', '/panel')).proximas_visitas[0].estado, 'confirmada');
  assert.equal(ok(await abogado('GET', `/visitas?desde=${sumarDias(HOY, 2)}`)).length, 0);
  ok(await abogado('DELETE', `/visitas/${id}`));
});

const tablaDe = (d) => ({
  precio: d.venta.precio,
  pie: d.venta.pie,
  fecha_pie: d.cuotas.find((c) => c.tipo === 'pie')?.fecha_vencimiento ?? null,
  tasa_mensual: d.venta.tasa_mensual,
  cuotas: d.cuotas.filter((c) => c.tipo === 'cuota').map(({ fecha_vencimiento, interes, amortizacion }) => ({ fecha_vencimiento, interes, amortizacion })),
});

test('tabla de amortización: el contador la modifica, se valida y se puede deshacer', async () => {
  const antes = ok(await admin('GET', `/ventas/${ventaId}`));
  const original = tablaDe(antes);

  assert.equal((await abogado('PUT', `/ventas/${ventaId}/amortizacion`, { ...original, motivo: 'x' })).estado, 403, 'el abogado no puede');
  assert.equal((await contador('PUT', `/ventas/${ventaId}/amortizacion`, original)).estado, 400, 'el motivo es obligatorio');

  // La cuota 10 vence 5 días después y el capital de la última se reparte en dos cuotas.
  const nueva = structuredClone(original);
  nueva.cuotas[9].fecha_vencimiento = sumarDias(nueva.cuotas[9].fecha_vencimiento, 5);
  const ultima = nueva.cuotas.at(-1);
  const mitad = Math.floor(ultima.amortizacion / 2);
  nueva.cuotas.push({ fecha_vencimiento: sumarMeses(ultima.fecha_vencimiento, 1), interes: 0, amortizacion: ultima.amortizacion - mitad });
  ultima.amortizacion = mitad;
  const r = ok(await contador('PUT', `/ventas/${ventaId}/amortizacion`, { ...nueva, motivo: 'Renegociación con el cliente' }));

  const d = ok(await admin('GET', `/ventas/${ventaId}`));
  assert.equal(d.venta.n_cuotas, 25);
  assert.equal(d.cuotas.at(-1).saldo_insoluto, 0, 'el saldo sigue cerrando en cero');
  assert.equal(d.cuotas[10].fecha_vencimiento, nueva.cuotas[9].fecha_vencimiento);
  for (const c of d.cuotas) assert.equal(c.monto, c.interes + c.amortizacion);
  assert.equal(d.totales.pagado, antes.totales.pagado, 'los pagos se vuelven a imputar sin perderse');
  assert.equal(d.cuotas[1].estado, 'pagada');

  // No se puede dejar la tabla por debajo de lo ya pagado, ni con filas inválidas.
  const minima = { ...original, cuotas: [{ fecha_vencimiento: HOY, interes: 0, amortizacion: 1 }], motivo: 'prueba' };
  assert.equal((await contador('PUT', `/ventas/${ventaId}/amortizacion`, minima)).estado, 400);
  const fechaMala = { ...original, cuotas: [{ fecha_vencimiento: '2026-02-30', interes: 1, amortizacion: 1 }], motivo: 'x' };
  assert.equal((await contador('PUT', `/ventas/${ventaId}/amortizacion`, fechaMala)).estado, 400);
  const montoCero = { ...original, cuotas: original.cuotas.map((c, i) => (i === 3 ? { ...c, interes: 0, amortizacion: 0 } : c)), motivo: 'x' };
  assert.equal((await contador('PUT', `/ventas/${ventaId}/amortizacion`, montoCero)).estado, 400);

  // Historial visible para todos; deshacer, solo con permiso.
  const historial = ok(await abogado('GET', `/ventas/${ventaId}/historial`));
  const entrada = historial.find((h) => h.accion === 'amortizacion');
  assert.equal(entrada.id, r.entradaId);
  assert.equal(entrada.motivo, 'Renegociación con el cliente');
  assert.equal(entrada.usuario, 'P. Mercado');
  assert.equal(entrada.restaurable, 1);
  assert.match(entrada.detalle, /Cuotas: 24 → 25/);
  assert.equal((await abogado('POST', `/ventas/${ventaId}/amortizacion/restaurar/${entrada.id}`)).estado, 403);
  ok(await contador('POST', `/ventas/${ventaId}/amortizacion/restaurar/${entrada.id}`));
  const restaurada = ok(await admin('GET', `/ventas/${ventaId}`));
  assert.deepEqual(tablaDe(restaurada), original);
  assert.equal(restaurada.totales.pagado, antes.totales.pagado);
  assert.equal(ok(await admin('GET', `/ventas/${ventaId}/historial`))[0].accion, 'amortizacion_restaurada', 'la restauración también queda registrada');
});

test('pagos: el contador corrige un pago y el informe separa capital e interés', async () => {
  const d = ok(await admin('GET', `/ventas/${ventaId}`));
  const pago = d.pagos.find((p) => !p.anulado && p.mora === 5000);
  const igual = { fecha: pago.fecha, monto: pago.monto, mora: pago.mora, medio: pago.medio, comprobante: pago.comprobante, observacion: pago.observacion };
  assert.equal((await abogado('PUT', `/pagos/${pago.id}`, { ...igual, motivo: 'x' })).estado, 403);
  assert.equal((await contador('PUT', `/pagos/${pago.id}`, { ...igual, motivo: 'sin cambios' })).estado, 400);
  assert.equal((await contador('PUT', `/pagos/${pago.id}`, { ...igual, monto: d.totales.total_a_pagar })).estado, 400, 'motivo obligatorio');
  ok(await contador('PUT', `/pagos/${pago.id}`, { ...igual, monto: pago.monto - 1000, mora: 0, medio: 'transferencia', comprobante: 'TRF-99', motivo: 'Monto mal digitado' }));

  const d2 = ok(await admin('GET', `/ventas/${ventaId}`));
  assert.equal(d2.totales.pagado, d.totales.pagado - 1000);
  assert.equal(d2.pagos.find((p) => p.id === pago.id).comprobante, 'TRF-99');
  assert.equal(d2.cuotas[1].estado, 'atrasada', 'la cuota 1 quedó con $1.000 pendientes');
  const hist = ok(await admin('GET', `/ventas/${ventaId}/historial`));
  assert.match(hist[0].detalle, /Medio de pago: efectivo → transferencia/);
  assert.equal(hist[0].motivo, 'Monto mal digitado');

  const pagos = ok(await admin('GET', `/cobranza/pagos?desde=${sumarMeses(HOY, -12)}&hasta=${HOY}`));
  for (const p of pagos.filter((x) => !x.anulado)) assert.equal(p.capital + p.interes, p.monto, `pago ${p.id}`);
  const delPie = pagos.find((p) => p.venta_id === ventaId && p.monto === 5_000_000);
  assert.deepEqual([delPie.capital, delPie.interes], [5_000_000, 0], 'el pie es todo capital');
  const corregido = pagos.find((p) => p.id === pago.id);
  assert.equal(corregido.interes, d2.cuotas[1].interes, 'dentro de la cuota se cubre primero el interés');
  assert.equal(corregido.capital, pago.monto - 1000 - d2.cuotas[1].interes);
});

test('plantillas: el abogado las modifica y puede volver a una versión anterior', async () => {
  const lista = ok(await abogado('GET', '/plantillas'));
  const p = ok(await abogado('GET', `/plantillas/${lista[0].id}`));
  assert.equal((await abogado('PUT', `/plantillas/${p.id}`, { tipo: p.tipo, nombre: p.nombre, contenido: p.contenido })).estado, 400, 'sin cambios');
  ok(await abogado('PUT', `/plantillas/${p.id}`, { tipo: p.tipo, nombre: p.nombre, contenido: '<p>Texto nuevo</p>' }));
  const versiones = ok(await abogado('GET', `/plantillas/${p.id}/versiones`));
  assert.equal(versiones.length, 1);
  assert.equal(versiones[0].usuario, 'L. Díaz');
  assert.equal((await contador('POST', `/plantillas/${p.id}/restaurar/${versiones[0].id}`)).estado, 403);
  ok(await abogado('POST', `/plantillas/${p.id}/restaurar/${versiones[0].id}`));
  assert.equal(ok(await abogado('GET', `/plantillas/${p.id}`)).contenido, p.contenido);
  assert.equal(ok(await abogado('GET', `/plantillas/${p.id}/versiones`)).length, 2, 'la versión reemplazada también se conserva');
});

test('registro de cambios: el super administrador ve quién cambió qué', async () => {
  const empresa = {
    empresa: { razon_social: 'Agua Fresca SpA', rut: '76.123.456-0', ciudad: 'Valdivia', representante: 'Rosa Ríos Pérez', email: 'cobranza@prueba.cl' },
    proyecto: { nombre: 'Fundo Entre Ríos', ubicacion: 'Los Ríos' },
  };
  assert.equal(ok(await admin('PUT', '/config/empresa', empresa)).cambios, 1);
  const b = ok(await admin('GET', '/bitacora'));
  assert.match(b[0].detalle, /Representante legal: Rosa Ríos → Rosa Ríos Pérez/);
  assert.equal(b[0].cuenta, 'admin');
  const acciones = new Set(b.map((x) => x.accion));
  for (const a of ['config_empresa', 'config_credito', 'amortizacion', 'amortizacion_restaurada', 'pago_anulado', 'pago_editado',
    'venta_anulada', 'plantilla_editada', 'plantilla_restaurada', 'clave_restablecida']) {
    assert.ok(acciones.has(a), `falta en el registro: ${a}`);
  }
  assert.equal(ok(await admin('PUT', '/config/empresa', empresa)).cambios, 0, 'guardar sin cambios no deja registro');
  assert.equal(ok(await admin('GET', '/bitacora')).length, b.length);
});

test('plano del loteo: crea las parcelas del topógrafo y no duplica al volver a cargarlo', async () => {
  assert.equal((await contador('GET', '/mapa/loteo')).estado, 403);
  assert.equal((await abogado('POST', '/mapa/loteo')).estado, 403);
  const resumen = ok(await admin('GET', '/mapa/loteo'));
  assert.equal(resumen.lotes, 185);
  assert.equal(resumen.nuevas, 185);
  assert.equal(resumen.sectores.reduce((s, x) => s + x.lotes, 0), 185);

  const r = ok(await admin('POST', '/mapa/loteo'));
  assert.deepEqual([r.creadas, r.total], [185, 185]);
  const lista = ok(await admin('GET', '/parcelas'));
  const b12 = lista.find((p) => p.numero === 'B-12');
  assert.equal(b12.sector, 'Sector B');
  assert.equal(b12.precio, 0, 'las parcelas del plano parten con precio por definir');
  assert.equal(b12.superficie_m2, 5000);
  assert.ok(b12.poligono.length >= 4);
  assert.match(b12.deslindes, /^Norte: en 40,00 metros con .+; Sur: .+; Oriente: .+; Poniente: en 125,00 metros con Parcela B-13$/);

  // El fondo del mapa pasa a ser el dibujo del plano, georreferenciado; lo ven todas las cuentas.
  const { plano } = ok(await contador('GET', '/config'));
  assert.equal(plano.tipo, 'vectorial');
  assert.ok(plano.georreferencia && plano.metros_por_unidad > 0);
  const fondo = ok(await contador('GET', `/mapa/plano?v=${plano.version}`));
  assert.ok(fondo.capas.deslinde && fondo.capas.rio && fondo.etiquetas.some((e) => /RIO COLORADO/.test(e.s)));

  // Volver a cargarlo no duplica ni pisa el precio ni los deslindes escritos a mano.
  ok(await admin('PUT', `/parcelas/${b12.id}`, { ...b12, precio: 21_000_000, deslindes: 'Escritos por el abogado' }));
  const r2 = ok(await admin('POST', '/mapa/loteo'));
  assert.equal(r2.creadas, 0);
  const b12b = ok(await admin('GET', '/parcelas')).find((p) => p.id === b12.id);
  assert.deepEqual([b12b.precio, b12b.deslindes], [21_000_000, 'Escritos por el abogado']);
  assert.equal(ok(await admin('GET', '/parcelas')).length, lista.length);
});

test('cambios en bloque: precio por m², precio fijo y sector, con confirmación en el registro', async () => {
  const lista = ok(await admin('GET', '/parcelas'));
  const sectorA = lista.filter((p) => p.sector === 'Sector A').map((p) => p.id);
  assert.equal(sectorA.length, 12);
  assert.equal((await contador('POST', '/parcelas/masivo', { ids: sectorA, accion: 'precio_m2', monto: 4000 })).estado, 403);
  assert.equal((await admin('POST', '/parcelas/masivo', { ids: sectorA, accion: 'precio_m2' })).estado, 400);
  assert.equal((await admin('POST', '/parcelas/masivo', { ids: [], accion: 'precio', monto: 1 })).estado, 400);

  assert.equal(ok(await admin('POST', '/parcelas/masivo', { ids: sectorA, accion: 'precio_m2', monto: 4_000 })).cambiadas, 12);
  const a1 = ok(await admin('GET', '/parcelas')).find((p) => p.numero === 'A-1');
  assert.equal(a1.precio, 20_000_000);
  assert.equal(ok(await admin('POST', '/parcelas/masivo', { ids: sectorA, accion: 'precio_m2', monto: 4_000 })).cambiadas, 0);

  // Las vendidas conservan su precio de lista.
  const vendida = lista.find((p) => p.estado === 'vendida');
  const fijo = ok(await admin('POST', '/parcelas/masivo', { ids: [vendida.id, a1.id], accion: 'precio', monto: 30_000_000 }));
  assert.deepEqual([fijo.cambiadas, fijo.omitidas], [1, 1]);
  assert.equal(ok(await admin('GET', '/parcelas')).find((p) => p.id === vendida.id).precio, vendida.precio);

  // Renombrar el sector y el prefijo del código: A-12 → S17-12.
  ok(await admin('POST', '/parcelas/masivo', { ids: sectorA, accion: 'sector', sector: 'Sitio 17', prefijo: 'S17' }));
  const s17 = ok(await admin('GET', '/parcelas')).filter((p) => p.sector === 'Sitio 17');
  assert.equal(s17.length, 12);
  assert.ok(s17.some((p) => p.numero === 'S17-12'));
  // Un prefijo que repetiría códigos existentes se rechaza sin cambiar nada.
  const sectorB = lista.filter((p) => p.sector === 'Sector B').map((p) => p.id);
  assert.equal((await admin('POST', '/parcelas/masivo', { ids: sectorB, accion: 'sector', sector: 'Otro', prefijo: 'S17' })).estado, 409);
  assert.equal(ok(await admin('GET', '/parcelas')).filter((p) => p.sector === 'Sector B').length, 28);

  const b = ok(await admin('GET', '/bitacora'));
  assert.ok(b.some((x) => x.accion === 'parcelas_masivo' && /Precio por m² \$4\.000 en 12 parcelas/.test(x.detalle)));
  assert.ok(b.some((x) => x.accion === 'loteo_cargado'));
});

test('cierre de sesión', async () => {
  ok(await abogado('POST', '/auth/logout'));
  assert.equal((await abogado('GET', '/auth/yo')).estado, 401);
});
