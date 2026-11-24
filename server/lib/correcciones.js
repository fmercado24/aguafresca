// Correcciones de datos que se aplican UNA sola vez, al iniciar el servidor después de una actualización
// (así llegan también a la base del servidor, sin volver a cargar el Excel). Cada una queda anotada en la
// configuración ("correcciones") y en el registro de cambios; las tablas corregidas se pueden deshacer
// desde el historial de cada venta. Para una corrección nueva, AGREGARLA al final con un id nuevo.
import { db, actualizar } from '../db.js';
import { leerSeccion, guardarSeccion } from './configuracion.js';
import { instantaneaTabla, leerTabla, aplicarTabla, completarMesesRepactados, ultimaCuotaCompleta } from './creditos.js';
import { registrar } from './bitacora.js';
import { leerLoteo } from './loteo.js';
import { avisar, usuariosCon } from './avisos.js';
import { hoy } from './fechas.js';
import { FIRMA_CARTA_ANTERIOR, FIRMA_CARTA_NUEVA, FECHA_CARTA_NUEVA } from './plantillas-base.js';

const ventasVigentes = (condicion = '') => db.all(
  `SELECT v.id, p.numero AS parcela FROM ventas v JOIN parcelas p ON p.id = v.parcela_id
    WHERE v.estado = 'vigente' AND v.monto_financiado > 0 ${condicion} ORDER BY p.numero`,
);
const tablaEditadaAMano = (ventaId) => !!db.get(
  `SELECT 1 FROM bitacora WHERE entidad = 'venta' AND entidad_id = ? AND accion IN ('amortizacion', 'amortizacion_restaurada') AND usuario_id IS NOT NULL`,
  ventaId,
);

/** Aplica una tabla corregida a una venta; si no se puede (p. ej. por los pagos), la deja como estaba. */
function corregirTabla(v, nueva, motivo, omitidas) {
  try {
    aplicarTabla(v.id, leerTabla(nueva), { usuarioId: null, motivo, detalleExtra: 'Corrección automática' });
    return true;
  } catch (e) {
    omitidas.push(`${v.parcela} (${e.message})`);
    return false;
  }
}

// 1. Ventas repactadas cargadas del Excel: los meses en que no se pagó cuota quedaron como saltos de fecha
//    y su interés se había sumado a las cuotas siguientes. Ahora cada uno es una cuota aplazada ($0, el interés
//    se suma a la deuda de capital), igual que en la planilla del contador.
function repactadas() {
  const corregidas = [], omitidas = [];
  for (const v of ventasVigentes("AND v.observaciones LIKE 'Cargada desde el Excel%'")) {
    const nueva = completarMesesRepactados(instantaneaTabla(v.id));
    if (!nueva) continue;
    if (tablaEditadaAMano(v.id)) { omitidas.push(`${v.parcela} (su tabla ya se modificó a mano)`); continue; }
    const n = nueva.cuotas.filter((c) => c.interes + c.amortizacion === 0).length;
    if (corregirTabla(v, nueva, `Meses repactados del Excel como ${n} cuota(s) aplazada(s): se carga solo el interés y aumenta la deuda de capital`, omitidas)) {
      corregidas.push(v.parcela);
    }
  }
  return { corregidas, omitidas, titulo: 'Créditos repactados con cuotas aplazadas' };
}

// 2. La última cuota se cobra completa (el monto habitual de la cuota), no por el saldo que quedaba.
function ultimasCuotas() {
  const corregidas = [], omitidas = [];
  for (const v of ventasVigentes()) {
    const t = instantaneaTabla(v.id);
    const nueva = ultimaCuotaCompleta(t);
    if (!nueva) continue;
    const antes = t.cuotas.at(-1);
    const despues = nueva.cuotas.at(-1);
    const motivo = `La última cuota se cobra completa: ${pesosCortos(antes.interes + antes.amortizacion)} → ${pesosCortos(despues.interes + despues.amortizacion)}`;
    if (corregirTabla(v, nueva, motivo, omitidas)) corregidas.push(v.parcela);
  }
  return { corregidas, omitidas, titulo: 'Última cuota completa' };
}
const pesosCortos = (n) => `$${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

// 3. Plano: la fila del norte del bloque doble es la manzana H y la fila junto a la C es G-1 a G-9
//    (antes estaban al revés). Cada parcela conserva su código, precio, estado y venta; cambian su
//    ubicación en el mapa, su superficie y sus deslindes. Lo que se haya escrito a mano no se toca.
const otraLetra = (codigo) => codigo.replace(/^([GH])-([1-9])$/, (_, l, n) => `${l === 'G' ? 'H' : 'G'}-${n}`);
const otraLetraEnTexto = (t) => t.replace(/Parcela ([GH])-([1-9])(?!\d)/g, (_, l, n) => `Parcela ${l === 'G' ? 'H' : 'G'}-${n}`);

function planoGH() {
  const loteo = leerLoteo();
  const corregidas = [], omitidas = [];
  if (!loteo) return { corregidas, omitidas, titulo: 'Ubicación de las manzanas G y H' };
  const lote = new Map(loteo.lotes.map((l) => [l.codigo, l]));
  // Solo si la base todavía tiene la ubicación anterior: la G-1 está donde el plano nuevo pone la H-1.
  const g1 = db.get("SELECT poligono FROM parcelas WHERE numero = 'G-1'");
  if (!g1 || !lote.has('H-1') || g1.poligono !== JSON.stringify(lote.get('H-1').poligono)) return { corregidas, omitidas, titulo: '' };
  for (const l of loteo.lotes) {
    const p = db.get('SELECT id, poligono, superficie_m2, deslindes FROM parcelas WHERE numero = ?', l.codigo);
    const anterior = lote.get(otraLetra(l.codigo)); // lo que el plano anterior decía de esta parcela
    if (!p || !anterior) continue;
    const cambios = {};
    if (anterior !== l) {
      if (p.poligono === JSON.stringify(anterior.poligono)) cambios.poligono = JSON.stringify(l.poligono);
      if (p.superficie_m2 === anterior.superficie_m2) cambios.superficie_m2 = l.superficie_m2;
      else if (p.superficie_m2 !== l.superficie_m2) omitidas.push(`${l.codigo}: superficie escrita a mano (${p.superficie_m2} m²); según el plano son ${l.superficie_m2} m²`);
    }
    const deslindesAnteriores = otraLetraEnTexto(anterior.deslindes);
    if (deslindesAnteriores !== l.deslindes) {
      if (p.deslindes === deslindesAnteriores) cambios.deslindes = l.deslindes;
      else if (p.deslindes !== l.deslindes) omitidas.push(`${l.codigo}: deslindes escritos a mano; revíselos`);
    }
    if (Object.keys(cambios).length) {
      actualizar('parcelas', p.id, cambios);
      corregidas.push(l.codigo);
    }
  }
  if (corregidas.length) {
    registrar(null, {
      accion: 'datos_corregidos', entidad: 'parcela',
      detalle: `Plano: la fila norte del bloque doble es la manzana H y la fila junto a la C es G-1 a G-9. Ubicación, superficie o deslindes actualizados en ${corregidas.join(', ')}`,
    });
  }
  return { corregidas, omitidas, titulo: 'Ubicación de las manzanas G y H' };
}

// 4. Las cartas de cobranza llevan siempre el pie de firma del representante legal con su firma digital
//    ({{firma}}). Las plantillas con el pie anterior lo cambian; a las modificadas se les agrega al final.
function firmaEnCartas() {
  const corregidas = [], omitidas = [];
  for (const p of db.all("SELECT id, tipo, nombre, contenido FROM plantillas WHERE tipo = 'carta_cobranza' ORDER BY id")) {
    if (/\{\{\s*firma\s*\}\}/.test(p.contenido)) continue;
    const contenido = p.contenido.includes(FIRMA_CARTA_ANTERIOR)
      ? p.contenido.replace(FIRMA_CARTA_ANTERIOR, FIRMA_CARTA_NUEVA)
      : `${p.contenido}\n{{firma}}`;
    actualizar('plantillas', p.id, { contenido, actualizado_en: `${hoy()} 00:00:00` });
    registrar(null, {
      accion: 'plantilla_editada', entidad: 'plantilla', entidadId: p.id, anterior: p, detalle: p.nombre,
      motivo: 'Corrección automática: la carta lleva el pie de firma del representante legal con su firma digital',
    });
    corregidas.push(p.nombre);
  }
  return { corregidas, omitidas, titulo: 'Pie de firma en las cartas de cobranza' };
}

// 5. El encabezado de los documentos dice siempre "Punta Arenas, <fecha>" (antes usaba la ciudad de la empresa, que
//    si estaba vacía salía como una línea en blanco). A una carta sin línea de lugar y fecha se le agrega al comienzo.
function lugarEnDocumentos() {
  const corregidas = [], omitidas = [];
  for (const p of db.all('SELECT id, tipo, nombre, contenido FROM plantillas ORDER BY id')) {
    let contenido = p.contenido
      .replace(/\{\{\s*empresa\.ciudad\s*\}\},\s*\{\{\s*fecha_hoy\s*\}\}/g, '{{lugar_emision}}, {{fecha_hoy}}')
      .replace(/En \{\{\s*empresa\.ciudad\s*\}\}, a \{\{\s*fecha_hoy\s*\}\}/g, 'En {{lugar_emision}}, a {{fecha_hoy}}');
    if (p.tipo === 'carta_cobranza' && !/\{\{\s*lugar_emision\s*\}\}/.test(contenido)) contenido = `${FECHA_CARTA_NUEVA}\n${contenido}`;
    if (contenido === p.contenido) continue;
    actualizar('plantillas', p.id, { contenido, actualizado_en: `${hoy()} 00:00:00` });
    registrar(null, {
      accion: 'plantilla_editada', entidad: 'plantilla', entidadId: p.id, anterior: p, detalle: p.nombre,
      motivo: 'Corrección automática: el encabezado dice siempre "Punta Arenas" junto a la fecha',
    });
    corregidas.push(p.nombre);
  }
  return { corregidas, omitidas, titulo: 'Punta Arenas en el encabezado de los documentos' };
}

// 6. Bajo la firma de las cartas va solo la leyenda de la empresa: se quita la línea de teléfono y correo que la seguía.
function soloLeyendaBajoLaFirma() {
  const corregidas = [];
  const contacto = /(\{\{\s*firma\s*\}\})\s*<p>\{\{\s*empresa\.telefono\s*\}\} · \{\{\s*empresa\.email\s*\}\}<\/p>/g;
  for (const p of db.all("SELECT id, tipo, nombre, contenido FROM plantillas WHERE tipo = 'carta_cobranza' ORDER BY id")) {
    const contenido = p.contenido.replace(contacto, '$1');
    if (contenido === p.contenido) continue;
    actualizar('plantillas', p.id, { contenido, actualizado_en: `${hoy()} 00:00:00` });
    registrar(null, {
      accion: 'plantilla_editada', entidad: 'plantilla', entidadId: p.id, anterior: p, detalle: p.nombre,
      motivo: 'Corrección automática: bajo la firma va solo "Soc. de Inv. e Inmob. Agua Fresca SpA"',
    });
    corregidas.push(p.nombre);
  }
  return { corregidas, omitidas: [], titulo: 'Solo la leyenda de la empresa bajo la firma' };
}

const CORRECCIONES = [
  { id: '2026-11-21-repactadas', titulo: 'Créditos repactados con cuotas aplazadas', aplicar: repactadas },
  { id: '2026-11-21-ultima-cuota', titulo: 'Última cuota completa en los créditos vigentes', aplicar: ultimasCuotas },
  { id: '2026-11-21-plano-g-h', titulo: 'Ubicación de las manzanas G y H en el mapa', aplicar: planoGH },
  { id: '2026-11-21-firma-cartas', titulo: 'Pie de firma en las cartas de cobranza', aplicar: firmaEnCartas },
  { id: '2026-11-24-lugar-emision', titulo: 'Punta Arenas en el encabezado de los documentos', aplicar: lugarEnDocumentos },
  { id: '2026-11-25-leyenda-firma', titulo: 'Solo la leyenda de la empresa bajo la firma', aplicar: soloLeyendaBajoLaFirma },
];

/** Correcciones conocidas y si ya se aplicaron en esta base (para la pantalla Sistema). */
export function estadoCorrecciones() {
  const hechas = new Set(leerSeccion('correcciones')?.aplicadas ?? []);
  return CORRECCIONES.map(({ id, titulo }) => ({ id, titulo, aplicada: hechas.has(id) }));
}

/** Aplica las correcciones pendientes. Devuelve un resumen de cada una que cambió algo. */
export function aplicarCorrecciones() {
  const hechas = new Set(leerSeccion('correcciones')?.aplicadas ?? []);
  const resumen = [];
  for (const c of CORRECCIONES) {
    if (hechas.has(c.id)) continue;
    const r = db.tx(() => {
      const r = c.aplicar();
      hechas.add(c.id);
      guardarSeccion('correcciones', { aplicadas: [...hechas] });
      return r;
    });
    if (r.corregidas.length || r.omitidas.length) resumen.push(r);
  }
  if (!resumen.length) return resumen;
  const detalle = resumen.map((r) => `${r.titulo}: ${r.corregidas.join(', ') || 'ninguna'}${r.omitidas.length ? `. Sin corregir: ${r.omitidas.join('; ')}` : ''}`).join(' · ');
  registrar(null, { accion: 'datos_corregidos', detalle });
  // Aviso al administrador y al super administrador, que son quienes revisan las tablas.
  const ids = usuariosCon('amortizacion').map((u) => u.id);
  avisar(ids, {
    tipo: 'sistema', titulo: 'Se corrigieron datos al actualizar el sistema', detalle: detalle.slice(0, 900),
    enlace: '/configuracion?pestana=registro', clave: `correcciones-${resumen.map((r) => r.titulo).join('|')}-${Date.now()}`,
  });
  return resumen;
}
