import { Router } from 'express';
import { db } from '../db.js';
import { requiere, puede } from '../auth.js';
import { registrar } from '../lib/bitacora.js';
import { leerCanales, guardarCanales, canalesPublicos, enviarCorreo, correoListo } from '../lib/canales.js';
import { enviarDocumento, leerReglas, guardarReglas, planCobranza, ejecutarCobranza } from '../lib/envios.js';
import { leerSeccion } from '../lib/configuracion.js';
import { ErrorApp, leer, texto, entero, opcion, booleano, idDe, correo as validarCorreo } from '../lib/validar.js';

export const rutasEnvios = Router();

// ---------- Correo de envío (super administrador) ----------
// WhatsApp no se configura: se envía a mano desde cada carta (se abre WhatsApp con el texto listo).

// Todas las cuentas ven si el correo está listo y si está el modo de prueba; la contraseña no sale nunca.
rutasEnvios.get('/config/canales', (req, res) => {
  const pub = canalesPublicos();
  if (puede(req.usuario, 'empresa')) return res.json(pub);
  res.json({ modo_prueba: pub.modo_prueba, correo_listo: pub.correo_listo });
});

rutasEnvios.put('/config/canales', requiere('empresa'), (req, res) => {
  const actual = leerCanales();
  const correo = leer(req.body?.correo ?? {}, {
    servidor: texto({ max: 200 }),
    puerto: entero({ min: 1, max: 65535, def: 587 }),
    seguridad: opcion(['starttls', 'ssl', 'ninguna']),
    usuario: texto({ max: 200 }),
    clave: texto({ max: 500 }),
    remitente: texto({ max: 200 }),
    responder_a: validarCorreo(),
  });
  // El remitente es un correo o "Nombre <correo>".
  const correoDelRemitente = correo.remitente.match(/<([^>]+)>\s*$/)?.[1] ?? correo.remitente;
  if (correo.remitente && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correoDelRemitente.trim())) throw new ErrorApp('Remitente: use un correo, o Nombre <correo@dominio.cl>');
  // Una contraseña vacía no borra la guardada (la pantalla no la conoce); para borrarla se pide explícitamente.
  if (!correo.clave && !req.body?.borrar_clave_correo) correo.clave = actual.correo.clave;
  const nuevo = { modo_prueba: req.body?.modo_prueba === undefined ? actual.modo_prueba : booleano()(req.body.modo_prueba), correo };
  guardarCanales(nuevo);
  const cambios = [];
  if (nuevo.modo_prueba !== actual.modo_prueba) cambios.push(`Modo de prueba: ${actual.modo_prueba ? 'sí' : 'no'} → ${nuevo.modo_prueba ? 'sí' : 'no'}`);
  for (const k of ['servidor', 'puerto', 'seguridad', 'usuario', 'remitente', 'responder_a']) {
    if (String(actual.correo[k]) !== String(correo[k])) cambios.push(`Correo, ${k.replace('_', ' ')}: ${actual.correo[k] || '(vacío)'} → ${correo[k] || '(vacío)'}`);
  }
  if (actual.correo.clave !== correo.clave) cambios.push('Correo: contraseña cambiada');
  if (cambios.length) registrar(req.usuario.id, { accion: 'canales_envio', entidad: 'config', detalle: cambios.join('; ') });
  res.json(canalesPublicos());
});

/** Envía un correo de prueba real (aunque esté el modo de prueba), para comprobar la configuración. */
rutasEnvios.post('/config/canales/prueba', requiere('empresa'), async (req, res) => {
  const { destino } = leer(req.body, { destino: texto({ req: true, max: 200 }) });
  const c = leerCanales();
  if (!correoListo(c)) throw new ErrorApp('Complete y guarde primero el servidor, el puerto y el remitente');
  const empresa = leerSeccion('empresa');
  try {
    await enviarCorreo(c, {
      para: destino,
      asunto: 'Prueba de envío — sistema de gestión',
      html: `<p>Este es un correo de prueba del sistema de gestión de ${empresa?.razon_social || 'la empresa'}. Si lo recibió, el envío de cartas por correo funciona.</p>`,
      texto: 'Correo de prueba del sistema de gestión: si lo recibió, el envío de cartas por correo funciona.',
    });
  } catch (e) {
    throw new ErrorApp(`No se pudo enviar: ${e.message}`, 502);
  }
  res.json({ ok: true });
});

// ---------- Envío programado (contador y super administrador) ----------

rutasEnvios.get('/cobranza/programacion', (req, res) => {
  const reglas = leerReglas();
  const plantillas = db.all("SELECT id, nombre FROM plantillas WHERE tipo = 'carta_cobranza' ORDER BY id");
  res.json({ ...reglas, plantillas });
});

rutasEnvios.put('/cobranza/programacion', requiere('contabilidad'), (req, res) => {
  const d = leer(req.body, {
    modo: opcion(['manual', 'automatico'], { req: true }),
    hora: texto({ req: true, max: 5 }),
    dias_habiles: booleano(),
  });
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.hora)) throw new ErrorApp('Hora de envío: use el formato HH:MM');
  // Los envíos programados salen solo por correo.
  const canales = ['correo'];
  const etapas = Array.isArray(req.body.etapas) ? req.body.etapas : [];
  if (!etapas.length || etapas.length > 6) throw new ErrorApp('Configure entre 1 y 6 etapas de envío');
  const plantillas = new Set(db.all("SELECT id FROM plantillas WHERE tipo = 'carta_cobranza'").map((p) => p.id));
  const limpias = etapas.map((e, i) => {
    const dias = Number(e?.dias);
    if (!Number.isInteger(dias) || dias < 1 || dias > 365) throw new ErrorApp(`Etapa ${i + 1}: los días de atraso deben ser un número entre 1 y 365`);
    if (!plantillas.has(e?.plantilla_id)) throw new ErrorApp(`Etapa ${i + 1}: elija una carta de cobranza`);
    return { dias, plantilla_id: e.plantilla_id };
  }).sort((a, b) => a.dias - b.dias);
  if (new Set(limpias.map((e) => e.dias)).size !== limpias.length) throw new ErrorApp('Dos etapas no pueden tener los mismos días de atraso');

  const actual = leerReglas();
  const nuevo = { ...(leerSeccion('cobranza_automatica') ?? {}), ...d, canales, etapas: limpias };
  guardarReglas(nuevo);
  const describir = (r) => `${r.modo === 'automatico' ? `automático por correo a las ${r.hora}${r.dias_habiles ? ' (días hábiles)' : ''}` : 'manual'}; etapas: ${r.etapas.map((e) => `${e.dias} días`).join(', ')}`;
  const antes = describir(actual), despues = describir(leerReglas());
  if (antes !== despues) registrar(req.usuario.id, { accion: 'cobranza_programacion', entidad: 'config', detalle: `${antes} → ${despues}` });
  res.json(leerReglas());
});

/** Qué cartas se enviarían hoy con las reglas actuales (no envía nada). */
rutasEnvios.get('/cobranza/plan', (req, res) => res.json(planCobranza()));

rutasEnvios.post('/cobranza/plan/ejecutar', requiere('contabilidad'), async (req, res) => {
  res.json(await ejecutarCobranza({ usuarioId: req.usuario.id }));
});

// ---------- Registro de envíos y envío manual de una carta ----------

rutasEnvios.get('/envios', (req, res) => {
  const filtros = [], valores = [];
  if (req.query.venta_id) { filtros.push('e.venta_id = ?'); valores.push(idDe(req.query.venta_id)); }
  if (req.query.documento_id) { filtros.push('e.documento_id = ?'); valores.push(idDe(req.query.documento_id)); }
  res.json(db.all(
    `SELECT e.*, cl.nombre AS cliente, p.numero AS parcela, pl.nombre AS plantilla, u.nombre AS usuario
       FROM envios e
       LEFT JOIN clientes cl ON cl.id = e.cliente_id
       LEFT JOIN ventas v ON v.id = e.venta_id
       LEFT JOIN parcelas p ON p.id = v.parcela_id
       LEFT JOIN plantillas pl ON pl.id = e.plantilla_id
       LEFT JOIN usuarios u ON u.id = e.usuario_id
      ${filtros.length ? `WHERE ${filtros.join(' AND ')}` : ''}
      ORDER BY e.id DESC LIMIT 300`,
    ...valores,
  ));
});

rutasEnvios.post('/documentos/:id/enviar', requiere('documentos'), async (req, res) => {
  const { canal } = leer(req.body, { canal: opcion(['correo', 'whatsapp'], { req: true }) });
  res.json(await enviarDocumento(idDe(req.params.id), canal, { usuarioId: req.usuario.id }));
});
