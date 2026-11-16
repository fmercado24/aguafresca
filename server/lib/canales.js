// Canales para enviar las cartas de cobranza:
//  - Correo electrónico (SMTP): lo envía el sistema, a mano o en forma programada.
//  - WhatsApp: siempre a mano. El sistema abre WhatsApp (Web, de escritorio o del celular) con el texto de la carta
//    dirigido al celular del cliente, y la persona lo envía desde su propia cuenta. No usa la API pagada de WhatsApp.
// La configuración del correo lleva una contraseña: se guarda aparte y nunca se envía completa al navegador.
import nodemailer from 'nodemailer';
import { leerSeccion, guardarSeccion } from './configuracion.js';

export const CANALES_INICIALES = {
  // Mientras está activo, los correos se registran pero no salen: sirve para probar las reglas sin molestar a los clientes.
  modo_prueba: true,
  correo: { servidor: '', puerto: 587, seguridad: 'starttls', usuario: '', clave: '', remitente: '', responder_a: '' },
};

export function leerCanales() {
  const g = leerSeccion('canales') ?? {};
  return {
    modo_prueba: g.modo_prueba ?? CANALES_INICIALES.modo_prueba,
    correo: { ...CANALES_INICIALES.correo, ...g.correo },
  };
}

export const guardarCanales = (c) => guardarSeccion('canales', c);

/** Lo que puede ver la pantalla: sin la contraseña del correo. */
export function canalesPublicos(c = leerCanales()) {
  const { clave, ...correo } = c.correo;
  return { modo_prueba: c.modo_prueba, correo: { ...correo, tiene_clave: !!clave }, correo_listo: correoListo(c) };
}

export const correoListo = (c) => !!(c.correo.servidor && c.correo.puerto && c.correo.remitente);

export async function enviarCorreo(c, { para, asunto, html, texto }) {
  const k = c.correo;
  const transporte = nodemailer.createTransport({
    host: k.servidor,
    port: Number(k.puerto),
    secure: k.seguridad === 'ssl',
    requireTLS: k.seguridad === 'starttls',
    ignoreTLS: k.seguridad === 'ninguna',
    auth: k.usuario ? { user: k.usuario, pass: k.clave } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  const info = await transporte.sendMail({ from: k.remitente, to: para, replyTo: k.responder_a || undefined, subject: asunto, html, text: texto });
  return info.messageId ?? '';
}

/** Número para WhatsApp: solo dígitos y con código de país (Chile si viene sin él). */
export function telefonoWhatsApp(t) {
  const d = String(t ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 9 && d.startsWith('9')) return `56${d}`;
  if (d.length === 8) return `569${d}`;
  return d.length >= 10 ? d : '';
}
