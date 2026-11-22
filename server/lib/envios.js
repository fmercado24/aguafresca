// Envío de cartas de cobranza: por correo (a mano desde una carta emitida, o programado cada día según los días
// de atraso) y por WhatsApp (siempre a mano: se abre WhatsApp con el texto listo y la persona lo envía).
// Cada envío queda registrado, y los que salen, en la ficha del deudor.
import { db, insertar } from '../db.js';
import { confeccionar } from './plantillas.js';
import { leerCanales, enviarCorreo, telefonoWhatsApp, correoListo } from './canales.js';
import { leerConfiguracion, leerSeccion, guardarSeccion } from './configuracion.js';
import { hoy, ahora } from './fechas.js';
import { registrar } from './bitacora.js';
import { avisar, usuariosCon } from './avisos.js';
import { ErrorApp } from './validar.js';

// ---------- Contenido ----------

const ENTIDADES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

/** Texto plano de una carta (para WhatsApp y para la versión de texto del correo). */
export function htmlATexto(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, ' · ')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (e) => ENTIDADES[e])
    .split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Asunto del correo: la línea "Ref.: …" de la carta, o su título. */
function asuntoDe(doc) {
  const ref = htmlATexto(doc.contenido).split('\n').find((l) => /^Ref\.?:/i.test(l));
  return ref ? ref.replace(/^Ref\.?:\s*/i, '') : doc.titulo;
}

function correoDeCarta(doc, empresa) {
  // Los programas de correo no muestran imágenes incrustadas como "data:": la firma va como imagen adjunta.
  const adjuntos = [];
  const contenido = String(doc.contenido).replace(/src="data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)"/g, (_, tipo, datos) => {
    const cid = `firma-${adjuntos.length + 1}@aguafresca`;
    adjuntos.push({ filename: `firma.${tipo === 'image/png' ? 'png' : 'jpg'}`, content: Buffer.from(datos, 'base64'), contentType: tipo, cid });
    return `src="cid:${cid}"`;
  });
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f2;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#1c1917">
<div style="max-width:680px;margin:0 auto;background:#fff;border:1px solid #e7e5e4;border-radius:8px;padding:28px 32px;font-size:14px;line-height:1.55">
<div style="font-weight:bold;font-size:16px;margin-bottom:16px">${empresa.razon_social || ''}</div>
<style>table.tabla-doc{border-collapse:collapse;width:100%;margin:8px 0}table.tabla-doc th,table.tabla-doc td{border:1px solid #d6d3d1;padding:4px 8px;font-size:13px}td.num,th.num{text-align:right}img.firma-digital{display:block;max-height:80px;max-width:240px;margin-top:12px}</style>
${contenido}
</div></body></html>`;
  return { asunto: asuntoDe(doc), html, texto: htmlATexto(doc.contenido), adjuntos };
}

// ---------- Envío de una carta ya emitida ----------

const documentoConCliente = (id) => db.get(
  `SELECT d.*, cl.nombre AS cliente, cl.email AS cliente_email, cl.telefono AS cliente_telefono
     FROM documentos d LEFT JOIN clientes cl ON cl.id = d.cliente_id WHERE d.id = ?`,
  id,
);

/**
 * Envía (o simula, en modo de prueba) una carta de cobranza por un canal. Nunca lanza error por fallas del
 * envío: quedan registradas con estado "error". Con WhatsApp en modo manual devuelve el enlace para abrirlo.
 */
export async function enviarDocumento(documentoId, canal, { usuarioId = null, automatico = false, clave = null } = {}) {
  const doc = documentoConCliente(documentoId);
  if (!doc) throw new ErrorApp('El documento no existe', 404);
  if (doc.tipo !== 'carta_cobranza') throw new ErrorApp('Solo las cartas de cobranza se envían por correo o WhatsApp');
  const canales = leerCanales();
  const r = { canal, destino: '', estado: 'enviado', detalle: '', enlace: null };

  if (canal === 'correo') {
    r.destino = doc.cliente_email ?? '';
    if (!r.destino) Object.assign(r, { estado: 'omitido', detalle: 'El cliente no tiene correo electrónico registrado' });
    else if (canales.modo_prueba) Object.assign(r, { estado: 'simulado', detalle: 'Modo de prueba: el correo no se envió' });
    else if (!correoListo(canales)) Object.assign(r, { estado: 'error', detalle: 'El correo de envío no está configurado (Configuración → Envío de cartas)' });
    else {
      try {
        const id = await enviarCorreo(canales, { para: r.destino, ...correoDeCarta(doc, leerConfiguracion().empresa) });
        r.detalle = id ? `Aceptado por el servidor de correo (${id})` : 'Aceptado por el servidor de correo';
      } catch (e) {
        Object.assign(r, { estado: 'error', detalle: `No se pudo enviar el correo: ${e.message}` });
      }
    }
  } else if (canal === 'whatsapp') {
    r.destino = telefonoWhatsApp(doc.cliente_telefono);
    if (!r.destino) Object.assign(r, { estado: 'omitido', detalle: 'El cliente no tiene un celular válido registrado' });
    // WhatsApp es siempre a mano: no hay envíos programados por WhatsApp.
    else if (automatico) Object.assign(r, { estado: 'omitido', detalle: 'Los envíos programados salen solo por correo' });
    else Object.assign(r, {
      estado: 'manual', detalle: 'Se abrió WhatsApp con el mensaje para enviarlo a mano',
      enlace: `https://wa.me/${r.destino}?text=${encodeURIComponent(htmlATexto(doc.contenido))}`,
    });
  } else {
    throw new ErrorApp('Canal desconocido');
  }

  const id = db.tx(() => {
    const envioId = insertar('envios', {
      venta_id: doc.venta_id, cliente_id: doc.cliente_id, documento_id: doc.id, plantilla_id: doc.plantilla_id,
      canal, destino: r.destino, estado: r.estado, detalle: r.detalle, automatico: automatico ? 1 : 0, clave, usuario_id: usuarioId,
    });
    // En la bitácora de cobranza del deudor quedan las cartas que efectivamente salieron.
    if (r.estado === 'enviado' || r.estado === 'manual') {
      insertar('gestiones', {
        cliente_id: doc.cliente_id, venta_id: doc.venta_id, fecha: hoy(), tipo: canal === 'correo' ? 'email' : 'whatsapp',
        detalle: `${doc.titulo.split(' — ')[0]} enviada por ${canal === 'correo' ? `correo a ${r.destino}` : `WhatsApp al +${r.destino}`}${automatico ? ' (envío programado)' : ''}`,
        usuario_id: usuarioId,
      });
    }
    return envioId;
  });
  return { id, ...r };
}

/** Confecciona y guarda una carta desde una plantilla, y la envía por los canales indicados. */
export async function enviarCarta({ ventaId, plantillaId, canales, usuarioId = null, automatico = false, clave = null }) {
  const { faltan: _faltan, ...d } = confeccionar(plantillaId, ventaId);
  const documentoId = insertar('documentos', { ...d, usuario_id: usuarioId });
  const envios = [];
  for (const canal of canales) envios.push(await enviarDocumento(documentoId, canal, { usuarioId, automatico, clave }));
  return { documentoId, envios };
}

// ---------- Envío programado ----------

export function leerReglas() {
  const cartas = db.all("SELECT id, nombre FROM plantillas WHERE tipo = 'carta_cobranza' ORDER BY id");
  const g = leerSeccion('cobranza_automatica') ?? {};
  const etapas = Array.isArray(g.etapas) && g.etapas.length
    ? g.etapas
    : [{ dias: 5 }, { dias: 20 }, { dias: 45 }].map((e, i) => ({ ...e, plantilla_id: cartas[i]?.id ?? cartas[0]?.id ?? null }));
  return {
    modo: g.modo === 'automatico' ? 'automatico' : 'manual',
    hora: /^\d{2}:\d{2}$/.test(g.hora ?? '') ? g.hora : '10:00',
    dias_habiles: g.dias_habiles ?? true,
    // Los envíos programados salen solo por correo (WhatsApp se envía a mano desde cada carta).
    canales: ['correo'],
    etapas: etapas.map((e) => ({ dias: Number(e.dias), plantilla_id: e.plantilla_id ?? null })).sort((a, b) => a.dias - b.dias),
    ultima_ejecucion: g.ultima_ejecucion ?? null,
  };
}

export const guardarReglas = (r) => guardarSeccion('cobranza_automatica', r);

/**
 * Qué cartas corresponde enviar hoy (sin enviar nada). A cada deudor se le envía la etapa que corresponde a
 * los días de atraso de su cuota impaga más antigua, una sola vez por etapa; si se pone al día y vuelve a
 * atrasarse con otra cuota, el ciclo parte de nuevo.
 */
export function planCobranza(reglas = leerReglas()) {
  const fechaHoy = hoy();
  const plantillas = new Map(db.all('SELECT id, nombre FROM plantillas').map((p) => [p.id, p.nombre]));
  const atrasadas = db.all(
    `SELECT v.id AS venta_id, cl.id AS cliente_id, cl.nombre AS cliente, cl.email, cl.telefono, p.numero AS parcela,
            c.id AS cuota_id, c.fecha_vencimiento,
            (SELECT COALESCE(SUM(monto - pagado), 0) FROM cuotas x WHERE x.venta_id = v.id AND x.pagado < x.monto AND x.fecha_vencimiento < ?) AS atrasado
       FROM ventas v
       JOIN clientes cl ON cl.id = v.cliente_id
       JOIN parcelas p ON p.id = v.parcela_id
       JOIN cuotas c ON c.id = (SELECT id FROM cuotas y WHERE y.venta_id = v.id AND y.pagado < y.monto AND y.fecha_vencimiento < ?
                                ORDER BY y.fecha_vencimiento, y.numero LIMIT 1)
      WHERE v.estado = 'vigente'
      ORDER BY c.fecha_vencimiento`,
    fechaHoy, fechaHoy,
  );
  const plan = [];
  for (const a of atrasadas) {
    const dias = Math.round((Date.parse(fechaHoy) - Date.parse(a.fecha_vencimiento)) / 86_400_000);
    let etapa = -1;
    reglas.etapas.forEach((e, i) => { if (dias >= e.dias && e.plantilla_id) etapa = i; });
    if (etapa < 0) continue;
    const clave = `auto:${a.venta_id}:${a.cuota_id}:${etapa}`;
    const yaEnviada = db.get("SELECT id FROM envios WHERE clave = ? AND estado IN ('enviado', 'simulado') LIMIT 1", clave);
    if (yaEnviada) continue;
    const plantillaId = reglas.etapas[etapa].plantilla_id;
    plan.push({
      venta_id: a.venta_id, cliente_id: a.cliente_id, cliente: a.cliente, parcela: a.parcela, dias_atraso: dias, atrasado: a.atrasado,
      etapa: etapa + 1, plantilla_id: plantillaId, plantilla: plantillas.get(plantillaId) ?? '(plantilla eliminada)', clave,
      destinos: reglas.canales.map((canal) => ({ canal, destino: canal === 'correo' ? a.email || null : telefonoWhatsApp(a.telefono) || null })),
    });
  }
  return plan;
}

/** Envía las cartas que correspondan hoy. Lo usa el envío programado y el botón "Enviar ahora". */
export async function ejecutarCobranza({ usuarioId = null } = {}) {
  const reglas = leerReglas();
  const plan = planCobranza(reglas);
  const resumen = { cartas: 0, enviado: 0, simulado: 0, error: 0, omitido: 0 };
  for (const p of plan) {
    try {
      const r = await enviarCarta({ ventaId: p.venta_id, plantillaId: p.plantilla_id, canales: reglas.canales, usuarioId, automatico: true, clave: p.clave });
      resumen.cartas++;
      for (const e of r.envios) resumen[e.estado] = (resumen[e.estado] ?? 0) + 1;
    } catch (e) {
      resumen.error++;
      console.error(`Envío programado: no se pudo preparar la carta de la venta ${p.venta_id}:`, e.message);
    }
  }
  const detalle = plan.length
    ? `${resumen.cartas} cartas: ${resumen.enviado} enviadas, ${resumen.simulado} simuladas (modo de prueba), ${resumen.error} con error, ${resumen.omitido} omitidas`
    : 'No había cartas que enviar';
  db.tx(() => {
    registrar(usuarioId, { accion: 'cobranza_enviada', entidad: 'cobranza', detalle });
    if (plan.length) {
      avisar(usuariosCon('contabilidad').map((u) => u.id), {
        tipo: 'cobranza', titulo: 'Cartas de cobranza enviadas', detalle: `${detalle}.`, enlace: '/cobranza?vista=envios', clave: `cobranza:${Date.now()}`,
      });
    }
  });
  return { ...resumen, detalle };
}

/** Lo llama un temporizador del servidor: envía una vez al día, a la hora configurada. */
export async function revisarProgramacion() {
  const reglas = leerReglas();
  if (reglas.modo !== 'automatico') return null;
  const [fechaHoy, hora] = ahora().split('T');
  if (hora < reglas.hora || reglas.ultima_ejecucion === fechaHoy) return null;
  const diaSemana = new Date(`${fechaHoy}T12:00:00Z`).getUTCDay();
  if (reglas.dias_habiles && (diaSemana === 0 || diaSemana === 6)) return null;
  guardarReglas({ ...(leerSeccion('cobranza_automatica') ?? {}), ultima_ejecucion: fechaHoy });
  return ejecutarCobranza();
}
