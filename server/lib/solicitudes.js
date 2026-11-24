// Ventas que informa el usuario (ldiaz): él cierra la venta con el cliente a partir de una cotización, y el administrador
// la registra en el sistema (pie, cuotas, pagos). Mientras tanto la parcela queda reservada, si así lo pidió.
import { db, insertar } from '../db.js';
import { registrar } from './bitacora.js';
import { avisar, usuariosCon, firmaDe } from './avisos.js';
import { pesos } from './finanzas.js';
import { ErrorApp } from './validar.js';

const condicionesDe = (q) => (q.n_cuotas > 0
  ? `${pesos(q.precio)}, pie ${pesos(q.pie)} y ${q.n_cuotas} cuotas de ${pesos(q.valor_cuota)}`
  : `${pesos(q.precio)} al contado`);

const cotizacionCompleta = (id) => db.get(
  `SELECT q.*, p.numero AS parcela, p.estado AS parcela_estado, COALESCE(cl.nombre, q.contacto_nombre) AS comprador
     FROM cotizaciones q JOIN parcelas p ON p.id = q.parcela_id LEFT JOIN clientes cl ON cl.id = q.cliente_id
    WHERE q.id = ?`,
  id,
);

export const solicitudPendiente = (cotizacionId) =>
  db.get("SELECT * FROM solicitudes_venta WHERE cotizacion_id = ? AND estado = 'pendiente' ORDER BY id DESC LIMIT 1", cotizacionId);

export function informarVenta(cotizacionId, { notas = '', reservar = true }, usuario) {
  const q = cotizacionCompleta(cotizacionId);
  if (!q) throw new ErrorApp('La cotización no existe', 404);
  if (q.estado !== 'vigente') throw new ErrorApp('Solo se puede informar la venta de una cotización vigente');
  if (!['disponible', 'reservada'].includes(q.parcela_estado)) throw new ErrorApp(`La parcela ${q.parcela} ya no está disponible`, 409);
  if (solicitudPendiente(cotizacionId)) throw new ErrorApp('Esta venta ya fue informada y está esperando que el administrador la registre', 409);

  return db.tx(() => {
    const reservo = reservar && q.parcela_estado === 'disponible';
    if (reservo) db.run("UPDATE parcelas SET estado = 'reservada' WHERE id = ?", q.parcela_id);
    const id = insertar('solicitudes_venta', { cotizacion_id: q.id, notas, reservo_parcela: reservo ? 1 : 0, creado_por: usuario.id });
    const resumen = `Parcela ${q.parcela} a ${q.comprador}: ${condicionesDe(q)} (cotización N° ${q.id})`;
    registrar(usuario.id, { accion: 'venta_informada', entidad: 'cotizacion', entidadId: q.id, detalle: resumen, motivo: notas });
    avisar(usuariosCon('operaciones', { sinSuperadmin: true }).map((u) => u.id), {
      tipo: 'venta_informada',
      titulo: `Venta por registrar: parcela ${q.parcela}`,
      detalle: `${firmaDe(usuario)} informó la venta a ${q.comprador}: ${condicionesDe(q)}.${notas ? ` ${notas}` : ''}${reservo ? ' La parcela quedó reservada.' : ''}`,
      enlace: `/ventas/nueva?cotizacion=${q.id}`,
      clave: `solicitud:${id}:informada`,
    });
    return { id, reservo };
  });
}

/** Al registrar una venta desde la cotización informada, la solicitud queda cerrada y se avisa a quien la informó. */
export function cerrarSolicitudConVenta(cotizacionId, ventaId, usuario) {
  const s = solicitudPendiente(cotizacionId);
  if (!s) return;
  db.run("UPDATE solicitudes_venta SET estado = 'registrada', venta_id = ?, resuelto_por = ?, resuelto_en = datetime('now') WHERE id = ?", ventaId, usuario.id, s.id);
  const q = cotizacionCompleta(cotizacionId);
  if (s.creado_por && s.creado_por !== usuario.id) {
    avisar([s.creado_por], {
      tipo: 'venta_registrada', titulo: `Venta registrada: parcela ${q.parcela}`,
      detalle: `${firmaDe(usuario)} registró la venta a ${q.comprador} que usted informó.`,
      enlace: `/ventas/${ventaId}`, clave: `solicitud:${s.id}:registrada`,
    });
  }
}

export function descartarSolicitud(id, motivo, usuario) {
  const s = db.get('SELECT * FROM solicitudes_venta WHERE id = ?', id);
  if (!s) throw new ErrorApp('El aviso de venta no existe', 404);
  if (s.estado !== 'pendiente') throw new ErrorApp('Este aviso de venta ya fue resuelto', 409);
  const q = cotizacionCompleta(s.cotizacion_id);
  db.tx(() => {
    db.run("UPDATE solicitudes_venta SET estado = 'descartada', motivo = ?, resuelto_por = ?, resuelto_en = datetime('now') WHERE id = ?", motivo, usuario.id, id);
    // Si la reserva la hizo el aviso, se libera.
    if (s.reservo_parcela && q.parcela_estado === 'reservada') db.run("UPDATE parcelas SET estado = 'disponible' WHERE id = ?", q.parcela_id);
    registrar(usuario.id, { accion: 'venta_informada_descartada', entidad: 'cotizacion', entidadId: q.id, detalle: `Parcela ${q.parcela} a ${q.comprador}`, motivo });
    if (s.creado_por && s.creado_por !== usuario.id) {
      avisar([s.creado_por], {
        tipo: 'venta_descartada', titulo: `Venta no registrada: parcela ${q.parcela}`,
        detalle: `${firmaDe(usuario)} no registró la venta a ${q.comprador}. Motivo: ${motivo}`,
        enlace: `/cotizaciones/${q.id}`, clave: `solicitud:${id}:descartada`,
      });
    }
  });
}

export function listarSolicitudes(estado = 'pendiente') {
  return db.all(
    `SELECT s.id, s.cotizacion_id, s.notas, s.estado, s.reservo_parcela, s.venta_id, s.creado_en, s.resuelto_en, s.motivo,
            q.precio, q.pie, q.n_cuotas, q.valor_cuota, q.parcela_id, p.numero AS parcela, COALESCE(cl.nombre, q.contacto_nombre) AS comprador,
            q.contacto_telefono, uc.nombre AS informada_por, ur.nombre AS resuelta_por
       FROM solicitudes_venta s
       JOIN cotizaciones q ON q.id = s.cotizacion_id
       JOIN parcelas p ON p.id = q.parcela_id
       LEFT JOIN clientes cl ON cl.id = q.cliente_id
       LEFT JOIN usuarios uc ON uc.id = s.creado_por
       LEFT JOIN usuarios ur ON ur.id = s.resuelto_por
      ${estado ? 'WHERE s.estado = ?' : ''}
      ORDER BY s.id DESC LIMIT 200`,
    ...(estado ? [estado] : []),
  );
}
