// Avisos dentro de la aplicación (la campana): por ahora, de las visitas agendadas, para los dueños
// (abogado y contador). "clave" evita que el mismo aviso se repita.
import { db } from '../db.js';
import { PERMISOS, PERFILES } from '../auth.js';
import { ahora, fechaCorta } from './fechas.js';
import { enviarPush } from './push.js';

const ROLES_CON_AVISOS = Object.keys(PERMISOS).filter((rol) => PERMISOS[rol].includes('avisos_visitas'));

/** "Luis Díaz (Abogado)" */
export const firmaDe = (u) => (u ? `${u.nombre} (${PERFILES[u.rol] ?? u.rol})` : '');

export function avisar(usuarioIds, { tipo, titulo, detalle = '', enlace = '', clave }) {
  for (const id of usuarioIds) {
    const nuevo = db.run(
      'INSERT OR IGNORE INTO notificaciones (usuario_id, tipo, titulo, detalle, enlace, clave) VALUES (?, ?, ?, ?, ?, ?)',
      id, tipo, titulo, detalle, enlace, clave,
    ).changes > 0;
    // Además, aviso push a los equipos donde esa persona activó los avisos. Se envía después de guardar
    // (fuera de la transacción) y solo si el aviso quedó guardado.
    if (nuevo) {
      setImmediate(() => {
        const n = db.get('SELECT id FROM notificaciones WHERE usuario_id = ? AND clave = ?', id, clave);
        if (n) enviarPush(id, { titulo, detalle, enlace: enlace || '/', id: n.id }).catch((e) => console.error('Aviso push:', e.message));
      });
    }
  }
}

/** Cuentas que tienen un permiso (por ejemplo, quienes registran ventas). */
export function usuariosCon(permiso, { sinSuperadmin = false } = {}) {
  const roles = Object.keys(PERMISOS).filter((r) => PERMISOS[r].includes(permiso) && !(sinSuperadmin && r === 'superadmin'));
  if (!roles.length) return [];
  return db.all(`SELECT id, nombre, rol FROM usuarios WHERE activo = 1 AND rol IN (${roles.map(() => '?').join(', ')})`, ...roles);
}

const destinatarios = (exceptoId = null) =>
  db.all(`SELECT id FROM usuarios WHERE activo = 1 AND rol IN (${ROLES_CON_AVISOS.map(() => '?').join(', ')})`, ...ROLES_CON_AVISOS)
    .map((u) => u.id).filter((id) => id !== exceptoId);

const cuando = (inicio) => `${fechaCorta(inicio.slice(0, 10))} a las ${inicio.slice(11, 16)}`;
const parcelasDe = (v) => {
  const ids = JSON.parse(v.parcela_ids || '[]');
  if (!ids.length) return '';
  const numeros = db.all(`SELECT numero FROM parcelas WHERE id IN (${ids.map(() => '?').join(', ')})`, ...ids).map((p) => p.numero);
  return numeros.length ? ` · parcelas ${numeros.join(', ')}` : '';
};
const enlaceVisita = (v) => `/visitas?dia=${v.inicio.slice(0, 10)}`;

/** Avisa a los dueños (salvo a quien hizo el cambio) que se agendó, reprogramó o canceló una visita. */
export function avisarVisita(visita, cambio, actor) {
  const quien = firmaDe(actor);
  const textos = {
    creada: [`Nueva visita: ${cuando(visita.inicio)}`, `${quien} agendó la visita de ${visita.nombre}${parcelasDe(visita)}.`],
    reprogramada: [`Visita reprogramada: ${cuando(visita.inicio)}`, `${quien} cambió la fecha u hora de la visita de ${visita.nombre}.`],
    cancelada: [`Visita cancelada: ${cuando(visita.inicio)}`, `${quien} canceló la visita de ${visita.nombre}.`],
    eliminada: [`Visita eliminada: ${cuando(visita.inicio)}`, `${quien} eliminó la visita de ${visita.nombre}.`],
  };
  const [titulo, detalle] = textos[cambio];
  avisar(destinatarios(actor?.id), {
    tipo: `visita_${cambio}`, titulo, detalle, enlace: enlaceVisita(visita),
    clave: `visita:${visita.id}:${cambio}:${Date.now()}`,
  });
}

/**
 * Recordatorios a los dueños: uno al entrar la visita en las próximas 24 horas y otro una hora antes (una vez por visita
 * y horario). El servidor lo revisa cada minuto, así llegan aunque nadie esté usando el sistema.
 */
export function recordatoriosDeVisitas() {
  const desde = ahora();
  const manana = new Date(`${desde}:00Z`);
  manana.setUTCDate(manana.getUTCDate() + 1);
  const hasta = manana.toISOString().slice(0, 16);
  const visitas = db.all(
    `SELECT vi.*, u.nombre AS atiende FROM visitas vi LEFT JOIN usuarios u ON u.id = vi.vendedor_id
      WHERE vi.inicio >= ? AND vi.inicio <= ? AND vi.estado IN ('programada', 'confirmada')`,
    desde, hasta,
  );
  const ids = destinatarios();
  const enUnaHora = new Date(`${desde}:00Z`);
  enUnaHora.setUTCHours(enUnaHora.getUTCHours() + 1);
  const limitePronto = enUnaHora.toISOString().slice(0, 16);
  for (const v of visitas) {
    const esHoy = v.inicio.slice(0, 10) === desde.slice(0, 10);
    if (v.inicio <= limitePronto) {
      avisar(ids, {
        tipo: 'visita_recordatorio',
        titulo: `Visita a las ${v.inicio.slice(11, 16)}: en menos de una hora`,
        detalle: `${v.nombre}${parcelasDe(v)}${v.atiende ? ` · atiende ${v.atiende}` : ''}.`,
        enlace: enlaceVisita(v),
        clave: `visita:${v.id}:pronto:${v.inicio}`,
      });
    }
    avisar(ids, {
      tipo: 'visita_recordatorio',
      titulo: `Visita ${esHoy ? 'hoy' : 'mañana'} a las ${v.inicio.slice(11, 16)}`,
      detalle: `${v.nombre}${parcelasDe(v)}${v.atiende ? ` · atiende ${v.atiende}` : ''}.`,
      enlace: enlaceVisita(v),
      clave: `visita:${v.id}:recordatorio:${v.inicio}`,
    });
  }
}
