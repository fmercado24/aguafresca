// Avisos push (Web Push): llegan al navegador o al celular aunque el sistema no esté abierto.
// Cada equipo donde una persona activa los avisos queda suscrito; el servidor cifra cada aviso y lo entrega
// al servicio de avisos del navegador (Google, Mozilla, Apple), que lo hace llegar al equipo.
// Las claves del servidor (VAPID) se crean solas la primera vez y se guardan en la base.
import { generateVAPIDKeys, generateRequestDetails } from 'web-push';
import { db } from '../db.js';
import { leerSeccion, guardarSeccion } from './configuracion.js';
import { ErrorApp } from './validar.js';

export function clavesPush() {
  let k = leerSeccion('push');
  if (!k?.publica || !k?.privada) {
    const g = generateVAPIDKeys();
    k = { publica: g.publicKey, privada: g.privateKey };
    guardarSeccion('push', k);
  }
  return k;
}

// Contacto que exige el protocolo para el servicio de avisos: el correo de la empresa, si está.
const asunto = () => {
  const email = leerSeccion('empresa')?.email;
  return email ? `mailto:${email}` : 'mailto:avisos@example.org';
};

/** Valida y guarda la suscripción de un equipo (si el equipo ya estaba suscrito con otra cuenta, pasa a esta). */
export function guardarSuscripcion(usuarioId, suscripcion, equipo = '') {
  const endpoint = String(suscripcion?.endpoint ?? '');
  const { p256dh, auth } = suscripcion?.keys ?? {};
  let url;
  try { url = new URL(endpoint); } catch { throw new ErrorApp('Suscripción de avisos inválida'); }
  // Solo servicios de avisos reales (https); en las pruebas automáticas se permite http local.
  const permitido = url.protocol === 'https:' || (process.env.PUSH_PERMITE_HTTP === '1' && url.protocol === 'http:');
  if (!permitido || endpoint.length > 1000) throw new ErrorApp('Suscripción de avisos inválida');
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || !/^[\w-]{80,100}$/.test(p256dh) || !/^[\w-]{16,40}$/.test(auth)) {
    throw new ErrorApp('Suscripción de avisos inválida');
  }
  db.run(
    `INSERT INTO push_suscripciones (usuario_id, endpoint, p256dh, auth, equipo) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE SET usuario_id = excluded.usuario_id, p256dh = excluded.p256dh, auth = excluded.auth,
                                            equipo = excluded.equipo, fallos = 0`,
    usuarioId, endpoint, p256dh, auth, String(equipo).slice(0, 120),
  );
}

export const quitarSuscripcion = (usuarioId, endpoint) =>
  db.run('DELETE FROM push_suscripciones WHERE usuario_id = ? AND endpoint = ?', usuarioId, String(endpoint ?? '')).changes;

export const suscripcionesDe = (usuarioId) =>
  db.all('SELECT id, equipo, creada_en, ultimo_envio FROM push_suscripciones WHERE usuario_id = ? ORDER BY id', usuarioId);

/** Envía un aviso a todos los equipos de una cuenta. Devuelve cuántos lo aceptaron. Nunca lanza error. */
export async function enviarPush(usuarioId, { titulo, detalle = '', enlace = '/', id = null }) {
  const subs = db.all('SELECT * FROM push_suscripciones WHERE usuario_id = ?', usuarioId);
  if (!subs.length) return 0;
  const k = clavesPush();
  const payload = JSON.stringify({ titulo, detalle, enlace, id });
  let aceptados = 0;
  for (const s of subs) {
    try {
      const pedido = generateRequestDetails(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { vapidDetails: { subject: asunto(), publicKey: k.publica, privateKey: k.privada }, TTL: 24 * 3600, urgency: 'high' },
      );
      const r = await fetch(pedido.endpoint, { method: pedido.method, headers: pedido.headers, body: pedido.body, signal: AbortSignal.timeout(15_000) });
      if (r.status === 404 || r.status === 410) {
        // El equipo anuló la suscripción (desinstaló, borró datos, etc.).
        db.run('DELETE FROM push_suscripciones WHERE id = ?', s.id);
      } else if (!r.ok) {
        db.run('UPDATE push_suscripciones SET fallos = fallos + 1 WHERE id = ?', s.id);
        console.error(`Aviso push: el servicio respondió ${r.status} para la suscripción ${s.id}`);
      } else {
        db.run("UPDATE push_suscripciones SET ultimo_envio = datetime('now'), fallos = 0 WHERE id = ?", s.id);
        aceptados++;
      }
    } catch (e) {
      db.run('UPDATE push_suscripciones SET fallos = fallos + 1 WHERE id = ?', s.id);
      console.error('Aviso push:', e.message);
    }
  }
  return aceptados;
}
