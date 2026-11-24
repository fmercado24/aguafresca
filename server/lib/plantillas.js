import sanitizeHtml from 'sanitize-html';
import { leerConfiguracion, LUGAR_EMISION } from './configuracion.js';
import { detalleVenta } from './creditos.js';
import { db } from '../db.js';
import { hoy, sumarDias, fechaLarga, fechaCorta } from './fechas.js';
import { pesos, montoEnPalabras, numeroEnPalabras } from './finanzas.js';
import { formatearRut } from './rut.js';
import { representanteDe, datosDeCuenta } from './datos-personales.js';
import { ErrorApp } from './validar.js';
import { bloqueFirmaHtml } from './firma.js';

// Las plantillas son HTML simple con variables {{grupo.campo}} que se reemplazan
// por los datos de la empresa, el cliente, la parcela, la venta y la deuda.

export const escapar = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Limpia el HTML que llega desde el editor: solo formato de texto, nada ejecutable. */
export function limpiarHtml(html) {
  return sanitizeHtml(String(html ?? ''), {
    allowedTags: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'div', 'span',
      'blockquote', 'hr', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'img'],
    allowedAttributes: { '*': ['style'], th: ['style', 'colspan', 'rowspan'], td: ['style', 'colspan', 'rowspan'], img: ['src', 'alt'] },
    allowedClasses: {
      table: ['tabla-doc'], td: ['num'], th: ['num'], tr: ['total'], div: ['firmas', 'firma', 'salto-pagina', 'pie-firma'], img: ['firma-digital'],
    },
    // La única imagen permitida es la firma del representante, incrustada en el documento (PNG o JPG).
    allowedSchemesByTag: { img: ['data'] },
    exclusiveFilter: (f) => f.tag === 'img' && !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(f.attribs.src ?? ''),
    allowedStyles: {
      '*': {
        'text-align': [/^(left|right|center|justify)$/],
        'font-weight': [/^(bold|normal|[1-9]00)$/],
        'font-style': [/^(italic|normal)$/],
        'text-decoration': [/^(underline|none)$/],
        'text-decoration-line': [/^(underline|none)$/],
      },
    },
  });
}

// Datos de una persona (representante legal y dueños), en el orden en que suelen ir en una comparecencia.
const DATOS_PERSONA = [
  ['nombre', 'Nombre completo'], ['nacionalidad', 'Nacionalidad'], ['estado_civil', 'Estado civil'], ['profesion', 'Profesión u oficio'],
  ['rut', 'RUT (cédula de identidad)'], ['cargo', 'Cargo en la empresa'], ['domicilio', 'Domicilio'], ['comuna', 'Comuna'], ['ciudad', 'Ciudad'],
  ['telefono', 'Teléfono'], ['email', 'Correo electrónico'],
];
const variablesDePersona = (prefijo) => DATOS_PERSONA.map(([k, d]) => [`${prefijo}.${k}`, d]);

const DATOS_CLIENTE = {
  nombre: 'Nombre', rut: 'RUT', nacionalidad: 'Nacionalidad', estado_civil: 'Estado civil', profesion: 'Profesión u oficio',
  direccion: 'Dirección', comuna: 'Comuna', ciudad: 'Ciudad', telefono: 'Teléfono', email: 'Correo electrónico',
};

// Catálogo que se muestra en el editor de plantillas ("Insertar dato").
export const CATALOGO = [
  { grupo: 'General', variables: [
    ['lugar_emision', 'Lugar de emisión de los documentos (Punta Arenas)'],
    ['fecha_hoy', 'Fecha de hoy, en palabras'],
    ['fecha_hoy_corta', 'Fecha de hoy (dd-mm-aaaa)'],
    ['fecha_limite_pago', 'Fecha límite para regularizar (hoy + plazo configurado)'],
  ] },
  { grupo: 'Empresa', variables: [
    ['empresa.razon_social', 'Razón social'],
    ['empresa.rut', 'RUT de la empresa'],
    ['empresa.giro', 'Giro'],
    ['empresa.direccion', 'Dirección'],
    ['empresa.ciudad', 'Ciudad'],
    ['empresa.telefono', 'Teléfono'],
    ['empresa.email', 'Correo electrónico'],
    ['empresa.representante', 'Representante legal'],
    ['empresa.rut_representante', 'RUT del representante legal'],
    ['empresa.datos_bancarios', 'Datos para transferencia'],
    ['firma', 'Firma digital con la leyenda “Soc. de Inv. e Inmob. Agua Fresca SpA” debajo'],
  ] },
  { grupo: 'Representante legal (de sus datos personales si es uno de los dueños)', variables: variablesDePersona('representante') },
  { grupo: 'Cuenta ldiaz (sus datos personales)', variables: variablesDePersona('ldiaz') },
  { grupo: 'Cuenta pmercado (sus datos personales)', variables: variablesDePersona('pmercado') },
  { grupo: 'Proyecto', variables: [
    ['proyecto.nombre', 'Nombre del proyecto'],
    ['proyecto.ubicacion', 'Ubicación'],
    ['proyecto.inscripcion', 'Inscripción en el Conservador de Bienes Raíces'],
  ] },
  { grupo: 'Cliente', variables: [
    ['cliente.nombre', 'Nombre completo'],
    ['cliente.rut', 'RUT'],
    ['cliente.nacionalidad', 'Nacionalidad'],
    ['cliente.estado_civil', 'Estado civil'],
    ['cliente.profesion', 'Profesión u oficio'],
    ['cliente.direccion', 'Dirección'],
    ['cliente.comuna', 'Comuna'],
    ['cliente.ciudad', 'Ciudad'],
    ['cliente.telefono', 'Teléfono'],
    ['cliente.email', 'Correo electrónico'],
  ] },
  { grupo: 'Parcela', variables: [
    ['parcela.numero', 'Número de parcela'],
    ['parcela.manzana', 'Manzana'],
    ['parcela.superficie', 'Superficie en m²'],
    ['parcela.rol', 'Rol de avalúo (SII)'],
    ['parcela.deslindes', 'Deslindes'],
  ] },
  { grupo: 'Venta', variables: [
    ['venta.fecha', 'Fecha de la venta, en palabras'],
    ['venta.precio', 'Precio de venta'],
    ['venta.precio_palabras', 'Precio de venta, en palabras'],
    ['venta.pie', 'Monto del pie'],
    ['venta.pie_palabras', 'Monto del pie, en palabras'],
    ['venta.saldo', 'Saldo de precio a crédito'],
    ['venta.saldo_palabras', 'Saldo de precio a crédito, en palabras'],
    ['venta.n_cuotas', 'Número de cuotas'],
    ['venta.n_cuotas_palabras', 'Número de cuotas, en palabras'],
    ['venta.valor_cuota', 'Valor de la cuota mensual'],
    ['venta.valor_cuota_palabras', 'Valor de la cuota mensual, en palabras'],
    ['venta.tasa_mensual', 'Tasa de interés mensual (%)'],
    ['venta.dia_pago', 'Día de vencimiento de cada mes'],
    ['venta.fecha_primera_cuota', 'Vencimiento de la primera cuota'],
    ['venta.fecha_ultima_cuota', 'Vencimiento de la última cuota'],
    ['tabla_amortizacion', 'Tabla de amortización completa'],
  ] },
  { grupo: 'Deuda', variables: [
    ['deuda.cuotas_atrasadas', 'Cantidad de cuotas atrasadas'],
    ['deuda.monto_atrasado', 'Monto total atrasado'],
    ['deuda.interes_mora', 'Interés por mora estimado'],
    ['deuda.total', 'Total a regularizar (atraso + mora)'],
    ['deuda.dias_atraso', 'Días de atraso de la cuota más antigua'],
    ['deuda.saldo_total', 'Saldo total por pagar del crédito'],
    ['deuda.tasa_mora', 'Tasa de interés por mora mensual (%)'],
    ['tabla_cuotas_atrasadas', 'Tabla con el detalle de cuotas atrasadas'],
  ] },
];

const EN_BLANCO = '____________';
const porcentaje = (n) => String(Math.round((Number(n) || 0) * 100) / 100).replace('.', ',');
const miles = (n) => (Number(n) || 0).toLocaleString('es-CL', { maximumFractionDigits: 2 });
const nombreCuota = (c) => (c.tipo === 'pie' ? 'Pie' : String(c.numero));

function tabla(encabezados, filas, total) {
  const celda = (etq, v, i) => `<${etq}${i > 0 ? ' class="num"' : ''}>${escapar(v)}</${etq}>`;
  return [
    '<table class="tabla-doc"><thead><tr>',
    encabezados.map((h, i) => celda('th', h, i)).join(''),
    '</tr></thead><tbody>',
    filas.map((f) => `<tr>${f.map((v, i) => celda('td', v, i)).join('')}</tr>`).join(''),
    total ? `<tr class="total">${total.map((v, i) => celda('td', v, i)).join('')}</tr>` : '',
    '</tbody></table>',
  ].join('');
}

/**
 * Reúne todos los valores disponibles para una venta. Los textos van escapados;
 * las tablas son HTML generado aquí. Un dato sin completar queda como línea en blanco
 * para llenarlo a mano, en vez de desaparecer silenciosamente del documento.
 */
export function valoresPara(ventaId) {
  const cfg = leerConfiguracion();
  const fechaHoy = hoy();
  const { venta, parcela, cliente, cuotas, totales } = detalleVenta(ventaId);
  const v = {};
  const poner = (clave, valor) => {
    const s = String(valor ?? '').trim();
    v[clave] = s ? escapar(s).replace(/\n/g, '<br>') : EN_BLANCO;
  };

  poner('lugar_emision', LUGAR_EMISION);
  poner('fecha_hoy', fechaLarga(fechaHoy));
  poner('fecha_hoy_corta', fechaCorta(fechaHoy));
  poner('fecha_limite_pago', fechaLarga(sumarDias(fechaHoy, Number(cfg.credito.dias_plazo_carta) || 10)));

  for (const k of ['razon_social', 'giro', 'direccion', 'ciudad', 'telefono', 'email', 'representante', 'datos_bancarios']) {
    poner(`empresa.${k}`, cfg.empresa[k]);
  }
  poner('empresa.rut', formatearRut(cfg.empresa.rut));
  poner('empresa.rut_representante', formatearRut(cfg.empresa.rut_representante));
  v.firma = bloqueFirmaHtml();
  for (const k of ['nombre', 'ubicacion', 'inscripcion']) poner(`proyecto.${k}`, cfg.proyecto[k]);

  // Representante legal y dueños: se completan solos con lo que cada dueño ingresó en "Mis datos personales".
  const persona = (prefijo, d) => {
    for (const [k] of DATOS_PERSONA) {
      const valor = k === 'nombre' ? d.nombre_completo : k === 'rut' ? (d.rut ? formatearRut(d.rut) : '') : k === 'domicilio' ? d.direccion : d[k];
      poner(`${prefijo}.${k}`, valor);
    }
  };
  persona('representante', representanteDe(cfg.empresa));
  persona('ldiaz', datosDeCuenta('ldiaz'));
  persona('pmercado', datosDeCuenta('pmercado'));
  // Nombres anteriores de las mismas variables (cuando los perfiles eran abogado y contador): siguen funcionando.
  persona('abogado', datosDeCuenta('ldiaz'));
  persona('contador', datosDeCuenta('pmercado'));

  for (const k of ['nombre', 'nacionalidad', 'estado_civil', 'profesion', 'direccion', 'comuna', 'ciudad', 'telefono', 'email']) {
    poner(`cliente.${k}`, cliente[k]);
  }
  poner('cliente.rut', formatearRut(cliente.rut));

  poner('parcela.numero', parcela.numero);
  poner('parcela.manzana', parcela.sector);
  poner('parcela.sector', parcela.sector); // nombre anterior de la misma variable
  poner('parcela.superficie', parcela.superficie_m2 ? miles(parcela.superficie_m2) : '');
  poner('parcela.rol', parcela.rol_sii);
  poner('parcela.deslindes', parcela.deslindes);

  const soloCuotas = cuotas.filter((c) => c.tipo === 'cuota');
  const ultima = soloCuotas[soloCuotas.length - 1];
  poner('venta.fecha', fechaLarga(venta.fecha));
  poner('venta.precio', pesos(venta.precio));
  poner('venta.precio_palabras', montoEnPalabras(venta.precio));
  poner('venta.pie', pesos(venta.pie));
  poner('venta.pie_palabras', montoEnPalabras(venta.pie));
  poner('venta.saldo', pesos(venta.monto_financiado));
  poner('venta.saldo_palabras', montoEnPalabras(venta.monto_financiado));
  poner('venta.n_cuotas', venta.n_cuotas);
  poner('venta.n_cuotas_palabras', numeroEnPalabras(venta.n_cuotas));
  poner('venta.valor_cuota', pesos(venta.valor_cuota));
  poner('venta.valor_cuota_palabras', montoEnPalabras(venta.valor_cuota));
  poner('venta.tasa_mensual', porcentaje(venta.tasa_mensual));
  poner('venta.dia_pago', venta.fecha_primera_cuota ? Number(venta.fecha_primera_cuota.slice(8)) : '');
  poner('venta.fecha_primera_cuota', venta.fecha_primera_cuota ? fechaLarga(venta.fecha_primera_cuota) : '');
  poner('venta.fecha_ultima_cuota', ultima ? fechaLarga(ultima.fecha_vencimiento) : '');

  v.tabla_amortizacion = soloCuotas.length
    ? tabla(
        ['N°', 'Vencimiento', 'Cuota', 'Interés', 'Amortización', 'Saldo'],
        soloCuotas.map((c) => [c.numero, fechaCorta(c.fecha_vencimiento), c.estado === 'aplazada' ? 'Aplazada' : pesos(c.monto), pesos(c.interes), pesos(c.amortizacion), pesos(c.saldo_insoluto)]),
        ['Total', '', pesos(soloCuotas.reduce((s, c) => s + c.monto, 0)), pesos(soloCuotas.reduce((s, c) => s + c.interes, 0)), pesos(venta.monto_financiado), ''],
      )
    : '<p>(Venta sin cuotas a crédito)</p>';

  const atrasadas = cuotas.filter((c) => c.estado === 'atrasada');
  const conMora = totales.mora_estimada > 0;
  poner('deuda.cuotas_atrasadas', totales.n_atrasadas);
  poner('deuda.monto_atrasado', pesos(totales.atrasado));
  poner('deuda.interes_mora', pesos(totales.mora_estimada));
  poner('deuda.total', pesos(totales.atrasado + totales.mora_estimada));
  poner('deuda.dias_atraso', totales.dias_atraso);
  poner('deuda.saldo_total', pesos(totales.saldo));
  poner('deuda.tasa_mora', porcentaje(cfg.credito.tasa_mora_mensual));
  v.tabla_cuotas_atrasadas = atrasadas.length
    ? tabla(
        ['Cuota', 'Vencimiento', 'Días de atraso', 'Monto adeudado', ...(conMora ? ['Interés por mora'] : [])],
        atrasadas.map((c) => [nombreCuota(c), fechaCorta(c.fecha_vencimiento), c.dias_atraso, pesos(c.saldo), ...(conMora ? [pesos(c.mora_estimada)] : [])]),
        ['Total', '', '', pesos(totales.atrasado), ...(conMora ? [pesos(totales.mora_estimada)] : [])],
      )
    : '<p>(Sin cuotas atrasadas a la fecha)</p>';

  return { valores: v, venta, parcela, cliente, totales };
}

/** Reemplaza las {{variables}}. Las que no existen se dejan visibles para que el usuario las note. */
export function combinar(html, valores) {
  return String(html).replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (original, clave) =>
    Object.hasOwn(valores, clave) ? valores[clave] : original);
}

/** Confecciona (sin guardar) un documento a partir de una plantilla y una venta. */
export function confeccionar(plantillaId, ventaId) {
  const plantilla = db.get('SELECT * FROM plantillas WHERE id = ?', plantillaId);
  if (!plantilla) throw new ErrorApp('La plantilla no existe', 404);
  const { valores, parcela, cliente, venta } = valoresPara(ventaId);
  // Datos del cliente que usa la plantilla y no están completos: se avisan para completarlos antes de imprimir.
  const faltan = Object.entries(DATOS_CLIENTE)
    .filter(([k]) => new RegExp(`\\{\\{\\s*cliente\\.${k}\\s*\\}\\}`).test(plantilla.contenido) && !String(cliente[k] ?? '').trim())
    .map(([, etiqueta]) => etiqueta);
  return {
    faltan,
    tipo: plantilla.tipo,
    plantilla_id: plantilla.id,
    venta_id: venta.id,
    cliente_id: cliente.id,
    titulo: `${plantilla.nombre} — ${cliente.nombre} (Parcela ${parcela.numero})`,
    contenido: combinar(plantilla.contenido, valores),
  };
}
