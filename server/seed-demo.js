// Carga DATOS FICTICIOS DE DEMOSTRACIÓN para recorrer el sistema: las parcelas del plano real del loteo
// con precios ficticios, clientes, ventas a crédito en distintas situaciones de pago, cotizaciones y visitas.
// Uso:  npm run seed:demo      (solo sobre una base vacía)
// Para volver a empezar en limpio: detenga el servidor y borre la carpeta data/.
import { db, insertar, actualizar } from './db.js';
import { asegurarUsuarios } from './auth.js';
import { asegurarPlantillasBase } from './rutas/documentos.js';
import { guardarSeccion, leerSeccion } from './lib/configuracion.js';
import { crearVenta, registrarPago } from './lib/creditos.js';
import { importarLoteo } from './lib/loteo.js';
import { informarVenta } from './lib/solicitudes.js';
import { confeccionar } from './lib/plantillas.js';
import { simular } from './rutas/ventas.js';
import { hoy, sumarDias, sumarMeses } from './lib/fechas.js';
import { digitoVerificador } from './lib/rut.js';

if (db.get('SELECT (SELECT COUNT(*) FROM parcelas) + (SELECT COUNT(*) FROM clientes) AS n').n > 0) {
  console.error('La base de datos ya tiene parcelas o clientes: no se cargó la demostración.');
  console.error('Para cargarla sobre una base limpia, detenga el servidor, borre la carpeta "data" y repita.');
  process.exit(1);
}

asegurarUsuarios();
asegurarPlantillasBase();

const HOY = hoy();
const admin = db.get("SELECT id FROM usuarios WHERE usuario = 'admin'").id;
const luis = db.get("SELECT id FROM usuarios WHERE usuario = 'ldiaz'").id;
const patricio = db.get("SELECT id FROM usuarios WHERE usuario = 'pmercado'").id;

db.tx(() => {
  // ---------- Parámetros ----------
  guardarSeccion('credito', { ...leerSeccion('credito'), tasa_mensual: 1, tasa_mora_mensual: 1.5 });

  // ---------- Parcelas: las del plano real del loteo, con precios FICTICIOS ----------
  if (!importarLoteo(admin)) throw new Error('No se encontró el plano del loteo (server/datos/loteo.json)');
  const parcelas = Object.fromEntries(db.all('SELECT numero, id FROM parcelas').map((p) => [p.numero, p.id]));
  const PRECIO_M2 = { A: 3600, B: 3800, C: 4000, D: 4000, E: 4200, F: 4200, G: 4400, H: 4400, I: 4600 };
  for (const p of db.all('SELECT id, numero, superficie_m2 FROM parcelas')) {
    const [letra, n] = p.numero.split('-');
    const orillaRio = letra === 'I' && Number(n) >= 74;
    const precio = Math.round((p.superficie_m2 * PRECIO_M2[letra] * (orillaRio ? 1.15 : 1)) / 100_000) * 100_000;
    actualizar('parcelas', p.id, { precio, descripcion: orillaRio ? 'Lote junto al Río Colorado.' : '' });
  }
  for (const n of ['I-20', 'B-5']) actualizar('parcelas', parcelas[n], { estado: 'reservada' });
  actualizar('parcelas', parcelas['I-85'], { estado: 'bloqueada', descripcion: 'Bloqueada mientras se regulariza el acceso (dato de demostración).' });

  // ---------- Clientes ficticios ----------
  const rut = (cuerpo) => `${cuerpo}-${digitoVerificador(String(cuerpo))}`;
  const PERSONAS = [
    ['María José Fuentes Araya', 'casada', 'Contadora auditora', 'Valdivia'],
    ['Rodrigo Andrés Sepúlveda Mora', 'soltero', 'Ingeniero civil', 'Temuco'],
    ['Carolina Paz Riquelme Soto', 'divorciada', 'Enfermera', 'Osorno'],
    ['Juan Pablo Henríquez Vidal', 'casado', 'Comerciante', 'Santiago'],
    ['Patricia Elena Navarro Cid', 'viuda', 'Profesora', 'Puerto Montt'],
    ['Felipe Ignacio Carrasco Leal', 'soltero', 'Técnico electricista', 'La Unión'],
    ['Daniela Fernanda Muñoz Ortiz', 'casada', 'Kinesióloga', 'Concepción'],
    ['Sergio Antonio Bravo Pino', 'casado', 'Transportista', 'Valdivia'],
    ['Camila Antonia Vera Salas', 'soltera', 'Diseñadora', 'Santiago'],
    ['Héctor Manuel Olivares Rey', 'casado', 'Agricultor', 'Río Bueno'],
  ];
  const clientes = PERSONAS.map(([nombre, estado_civil, profesion, comuna], i) =>
    insertar('clientes', {
      nombre,
      rut: rut(10_101_010 + i * 1_010_101),
      nacionalidad: 'chilena',
      estado_civil,
      profesion,
      direccion: `Calle Los Ejemplos ${100 + i * 37}`,
      comuna,
      ciudad: comuna,
      telefono: `+56 9 5550 01${String(i + 10)}`,
      email: `${nombre.split(' ')[0].toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}.${i + 1}@ejemplo.cl`,
      empleador: i % 3 === 0 ? 'Independiente' : `Empresa Ejemplo ${i + 1} Ltda.`,
      cargo: profesion,
      antiguedad_laboral: `${2 + (i % 7)} años`,
      renta_mensual: 1_200_000 + i * 180_000,
      antecedentes_comerciales: i === 5 ? 'Informe comercial con una morosidad menor aclarada (dato de demostración).' : 'Sin protestos ni morosidades informadas (dato de demostración).',
      observaciones: 'Cliente ficticio de demostración.',
    }));

  // ---------- Ventas ----------
  // `vencidas`: cuotas cuyo vencimiento ya pasó; `ultima`: días desde el vencimiento más reciente
  // (negativo = la próxima cuota vence en esos días); `pagadas`: cuotas pagadas.
  function venta({ parcela, cliente, pie, cuotas, tasa, vencidas, ultima, pagadas, piePagado = true, descuento = 0 }) {
    const precio = db.get('SELECT precio FROM parcelas WHERE id = ?', parcelas[parcela]).precio - descuento;
    const montoPie = Math.round((precio * pie) / 100 / 100_000) * 100_000;
    const primera = cuotas ? sumarMeses(sumarDias(HOY, -ultima), -(vencidas - (ultima > 0 ? 1 : 0))) : null;
    const fecha = cuotas ? sumarMeses(primera, -1) : sumarMeses(HOY, -5);
    return crearVenta({
      parcela_id: parcelas[parcela], cliente_id: clientes[cliente], vendedor_id: admin, fecha, precio,
      pie: cuotas ? montoPie : precio, n_cuotas: cuotas, tasa_mensual: tasa, fecha_primera_cuota: primera,
      pie_pagado: piePagado, medio_pie: 'transferencia', cuotas_pagadas: pagadas || 0,
      observaciones: 'Venta ficticia de demostración.',
    }, admin);
  }

  venta({ parcela: 'I-3', cliente: 0, pie: 20, cuotas: 36, tasa: 1, vencidas: 13, ultima: -5, pagadas: 13 });            // al día, vence en 5 días
  venta({ parcela: 'I-7', cliente: 1, pie: 25, cuotas: 24, tasa: 1, vencidas: 9, ultima: 12, pagadas: 8 });              // 1 cuota atrasada
  const v3 = venta({ parcela: 'I-12', cliente: 2, pie: 20, cuotas: 36, tasa: 1.2, vencidas: 11, ultima: 20, pagadas: 8 }); // 3 atrasadas
  const v4 = venta({ parcela: 'I-15', cliente: 3, pie: 30, cuotas: 24, tasa: 1, vencidas: 7, ultima: 3, pagadas: 6 });   // abono parcial
  venta({ parcela: 'B-3', cliente: 4, pie: 100, cuotas: 0, tasa: 0 });                                                  // contado
  const v6 = venta({ parcela: 'I-22', cliente: 5, pie: 15, cuotas: 48, tasa: 1.2, vencidas: 19, ultima: 25, pagadas: 14 }); // 5 atrasadas
  venta({ parcela: 'I-25', cliente: 6, pie: 20, cuotas: 36, tasa: 1, vencidas: 2, ultima: -10, pagadas: 2 });
  venta({ parcela: 'E-2', cliente: 7, pie: 20, cuotas: 60, tasa: 1, vencidas: 0, ultima: -15, pagadas: 0 });
  venta({ parcela: 'I-31', cliente: 0, pie: 20, cuotas: 24, tasa: 1.2, vencidas: 5, ultima: -18, pagadas: 5, descuento: 1_000_000 });
  const v10 = venta({ parcela: 'I-36', cliente: 8, pie: 20, cuotas: 36, tasa: 1, vencidas: 2, ultima: 5, pagadas: 0, piePagado: false }); // pie a medio pagar

  // Venta calculada por monto de cuota: $400.000 cerrados y la última, menor.
  {
    const precio = db.get('SELECT precio FROM parcelas WHERE id = ?', parcelas['I-44']).precio;
    crearVenta({
      parcela_id: parcelas['I-44'], cliente_id: clientes[9], vendedor_id: patricio, fecha: sumarDias(HOY, -20), precio,
      pie: Math.round((precio * 0.2) / 100_000) * 100_000, cuota_objetivo: 400_000, tasa_mensual: 1,
      fecha_primera_cuota: sumarMeses(sumarDias(HOY, -20), 1), pie_pagado: true, medio_pie: 'transferencia',
      observaciones: 'Venta ficticia de demostración: cuotas de $400.000.',
    }, patricio);
  }

  const cuotaDe = (id) => db.get('SELECT valor_cuota, pie, fecha FROM ventas WHERE id = ?', id);
  registrarPago(v4, { fecha: sumarDias(HOY, -1), monto: Math.round(cuotaDe(v4).valor_cuota / 2 / 1000) * 1000, medio: 'transferencia', comprobante: 'TRF-DEMO-104', observacion: 'Abono a la cuota del mes' }, admin);
  registrarPago(v10, { fecha: cuotaDe(v10).fecha, monto: Math.round(cuotaDe(v10).pie / 2), medio: 'deposito', comprobante: 'DEP-DEMO-221', observacion: 'Abono al pie' }, admin);

  // ---------- Gestiones de cobranza ----------
  const gestion = (ventaId, dias, tipo, detalle, extra = {}) => {
    const { cliente_id } = db.get('SELECT cliente_id FROM ventas WHERE id = ?', ventaId);
    insertar('gestiones', { cliente_id, venta_id: ventaId, fecha: sumarDias(HOY, -dias), tipo, detalle, usuario_id: admin, ...extra });
  };
  gestion(v3, 15, 'llamada', 'Se contacta por teléfono. Indica que tuvo un imprevisto y que se pondrá al día.');
  gestion(v3, 9, 'compromiso', 'Se compromete a pagar dos cuotas a fin de mes.', { compromiso_fecha: sumarDias(HOY, 6), compromiso_monto: cuotaDe(v3).valor_cuota * 2 });
  gestion(v6, 40, 'llamada', 'No contesta. Se deja mensaje de voz.');
  gestion(v6, 22, 'whatsapp', 'Se envía recordatorio con el detalle de cuotas atrasadas. Mensaje leído, sin respuesta.');

  const plantillaCarta = db.get("SELECT id FROM plantillas WHERE tipo = 'carta_cobranza' ORDER BY id LIMIT 1 OFFSET 1");
  const { faltan: _faltan, ...carta } = confeccionar(plantillaCarta.id, v6);
  insertar('documentos', { ...carta, usuario_id: admin });
  gestion(v6, 0, 'carta', `Se emitió carta: ${carta.titulo}`);

  // ---------- Cotizaciones ----------
  const cotizar = ({ parcela, cliente, contacto, telefono, dias, pie, cuotas, tasa, descuento = 0 }) => {
    const p = db.get('SELECT precio FROM parcelas WHERE id = ?', parcelas[parcela]);
    const fecha = sumarDias(HOY, -dias);
    const d = {
      precio: p.precio - descuento, pie: Math.round(((p.precio - descuento) * pie) / 100 / 100_000) * 100_000,
      n_cuotas: cuotas, tasa_mensual: tasa, fecha_primera_cuota: sumarMeses(fecha, 1),
    };
    return insertar('cotizaciones', {
      ...d, fecha, valida_hasta: sumarDias(fecha, 15), parcela_id: parcelas[parcela],
      cliente_id: cliente === undefined ? null : clientes[cliente],
      contacto_nombre: contacto, contacto_telefono: telefono, precio_lista: p.precio, descuento,
      valor_cuota: simular(d).valor_cuota, usuario_id: admin,
      observaciones: 'Precio válido para firma de promesa dentro del plazo de vigencia.',
    });
  };
  cotizar({ parcela: 'I-2', contacto: 'Tomás Aguilera (interesado)', telefono: '+56 9 5550 0201', dias: 2, pie: 20, cuotas: 36, tasa: 1 });
  cotizar({ parcela: 'I-9', cliente: 9, contacto: PERSONAS[9][0], telefono: '+56 9 5550 0119', dias: 6, pie: 30, cuotas: 24, tasa: 1, descuento: 500_000 });
  cotizar({ parcela: 'I-14', contacto: 'Familia Castro Lagos (interesados)', telefono: '+56 9 5550 0202', dias: 32, pie: 20, cuotas: 48, tasa: 1.2 });
  // Venta que cerró Luis (abogado) a partir de su cotización y que Patricio (contador) aún debe registrar.
  const cotizacionLuis = cotizar({ parcela: 'E-5', contacto: 'Rosa Vidal Paz', telefono: '+56 9 5550 0306', dias: 1, pie: 25, cuotas: 36, tasa: 1 });
  db.run('UPDATE cotizaciones SET usuario_id = ? WHERE id = ?', luis, cotizacionLuis);
  informarVenta(cotizacionLuis, { notas: 'Firmó hoy la promesa; paga el pie por transferencia el lunes.', reservar: true }, { id: luis, nombre: 'Luis Díaz', rol: 'abogado' });

  // ---------- Visitas ----------
  // Agendadas por Luis (abogado) o Patricio (contador), que además las atienden.
  const visita = (por, dias, hora, nombre, telefono, lotes, estado = 'programada', notas = '') =>
    insertar('visitas', {
      inicio: `${sumarDias(HOY, dias)}T${hora}`, duracion_min: 60, nombre, telefono,
      parcela_ids: JSON.stringify(lotes.map((l) => parcelas[l])), vendedor_id: por, creado_por: por, estado, notas,
    });
  visita(patricio, -7, '11:00', 'Marcela Ibáñez', '+56 9 5550 0301', ['I-2', 'I-4'], 'no_asistio', 'Avisó tarde; pidió reagendar.');
  visita(luis, -3, '16:00', 'Familia Castro Lagos', '+56 9 5550 0202', ['I-14', 'I-16'], 'realizada', 'Les gustó el lote I-14. Evaluarán financiamiento.');
  visita(patricio, 0, '15:30', 'Tomás Aguilera', '+56 9 5550 0201', ['I-2'], 'confirmada', 'Viene con su pareja. Llevar cotización impresa.');
  visita(luis, 1, '10:00', 'Andrea Pizarro', '+56 9 5550 0302', ['I-77', 'I-80', 'I-81'], 'programada', 'Interesada en lotes junto al río.');
  visita(patricio, 1, '15:30', 'Cristóbal Mena', '+56 9 5550 0303', ['A-24', 'A-26']);
  visita(luis, 3, '12:00', PERSONAS[9][0], '+56 9 5550 0119', ['I-9'], 'confirmada', 'Segunda visita; quiere revisar deslindes.');
  visita(patricio, 6, '11:00', 'Valentina Rojas', '+56 9 5550 0304', ['I-33', 'I-34', 'I-35']);
  visita(luis, 9, '16:30', 'Ignacio Paredes', '+56 9 5550 0305', ['I-38']);
});

const resumen = db.get(`SELECT (SELECT COUNT(*) FROM parcelas) AS parcelas, (SELECT COUNT(*) FROM clientes) AS clientes,
  (SELECT COUNT(*) FROM ventas) AS ventas, (SELECT COUNT(*) FROM pagos) AS pagos,
  (SELECT COUNT(*) FROM cotizaciones) AS cotizaciones, (SELECT COUNT(*) FROM visitas) AS visitas`);
console.log('Datos de demostración cargados:', JSON.stringify(resumen));
