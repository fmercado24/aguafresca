import { Router } from 'express';
import { db, actualizar } from '../db.js';
import {
  abrirSesion, cerrarSesion, cerrarOtrasSesiones, autenticar, requiere, puede, PERMISOS, PERFILES, ROLES_DUENOS,
  hashPassword, verificarPassword, validarClave, comprobarIntentos, anotarIntento,
} from '../auth.js';
import { registrar } from '../lib/bitacora.js';
import { ErrorApp, leer, texto, idDe, rut, telefono, correo } from '../lib/validar.js';
import { CAMPOS_PERSONALES, datosPersonalesDe, completos } from '../lib/datos-personales.js';

export const rutasAuth = Router();

const deSesion = (u) => ({ id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol, perfil: PERFILES[u.rol], permisos: PERMISOS[u.rol] ?? [] });

// ---------- Sesión ----------

rutasAuth.post('/auth/login', (req, res) => {
  const { usuario, password } = leer(req.body, { usuario: texto({ req: true, max: 60 }), password: texto({ req: true, max: 200 }) });
  const nombreUsuario = usuario.toLowerCase();
  const clave = `${req.ip}|${nombreUsuario}`;
  comprobarIntentos(clave);
  const u = db.get('SELECT * FROM usuarios WHERE usuario = ?', nombreUsuario);
  const ok = !!u && verificarPassword(password, u.password_hash);
  anotarIntento(clave, ok);
  if (!ok) throw new ErrorApp('Usuario o contraseña incorrectos', 401);
  // Solo quien conoce la contraseña se entera de que la cuenta está bloqueada.
  if (!u.activo) throw new ErrorApp('Esta cuenta está bloqueada. Hable con el super administrador del sistema.', 403);
  abrirSesion(req, res, u.id);
  res.json(deSesion(u));
});

rutasAuth.post('/auth/logout', (req, res) => {
  cerrarSesion(req, res);
  res.json({ ok: true });
});

rutasAuth.get('/auth/yo', autenticar, (req, res) => res.json(deSesion(req.usuario)));

rutasAuth.post('/auth/password', autenticar, (req, res) => {
  const actual = String(req.body?.actual ?? '');
  const nueva = validarClave(req.body?.nueva);
  const u = db.get('SELECT password_hash FROM usuarios WHERE id = ?', req.usuario.id);
  if (!verificarPassword(actual, u.password_hash)) throw new ErrorApp('La contraseña actual no es correcta');
  db.run('UPDATE usuarios SET password_hash = ? WHERE id = ?', hashPassword(nueva), req.usuario.id);
  cerrarOtrasSesiones(req, req.usuario.id);
  registrar(req.usuario.id, { accion: 'clave_cambiada', entidad: 'usuario', entidadId: req.usuario.id, detalle: 'Cambió su propia contraseña' });
  res.json({ ok: true });
});

// ---------- Datos personales de los dueños (cada uno los suyos) ----------

rutasAuth.get('/auth/datos-personales', autenticar, requiere('datos_personales'), (req, res) => {
  res.json(datosPersonalesDe(db.get('SELECT datos_personales FROM usuarios WHERE id = ?', req.usuario.id)));
});

rutasAuth.put('/auth/datos-personales', autenticar, requiere('datos_personales'), (req, res) => {
  const especiales = { rut: rut(), telefono: telefono(), email: correo() };
  const d = leer(req.body, Object.fromEntries(Object.keys(CAMPOS_PERSONALES).map((k) => [k, especiales[k] ?? texto({ max: k === 'direccion' ? 200 : 120 })])));
  const actual = datosPersonalesDe(db.get('SELECT datos_personales FROM usuarios WHERE id = ?', req.usuario.id));
  const cambiados = Object.keys(CAMPOS_PERSONALES).filter((k) => d[k] !== actual[k]);
  if (!cambiados.length) return res.json({ ok: true, cambios: 0 });
  db.tx(() => {
    db.run('UPDATE usuarios SET datos_personales = ? WHERE id = ?', JSON.stringify(d), req.usuario.id);
    // En el registro solo se anota qué campos cambiaron, no los datos personales en sí.
    registrar(req.usuario.id, {
      accion: 'datos_personales', entidad: 'usuario', entidadId: req.usuario.id,
      detalle: `Actualizó sus datos personales: ${cambiados.map((k) => CAMPOS_PERSONALES[k]).join(', ')}`,
    });
  });
  res.json({ ok: true, cambios: cambiados.length });
});

// ---------- Cuentas (son siempre tres; aquí solo se editan) ----------

rutasAuth.get('/usuarios', autenticar, (req, res) => {
  // Todos necesitan la lista para asignar vendedores; el nombre de usuario y el perfil los ve solo el super administrador,
  // que además ve el nombre completo y el RUT de los dueños (para designar al representante legal).
  // El super administrador ve también las cuentas bloqueadas y cuántas sesiones tiene abiertas cada una.
  const admin = puede(req.usuario, 'administracion');
  const filas = db.all(
    `SELECT u.id, u.usuario, u.nombre, u.rol, u.activo, u.datos_personales,
            (SELECT COUNT(*) FROM sesiones s WHERE s.usuario_id = u.id AND s.expira_en > ?) AS sesiones
       FROM usuarios u ${admin ? '' : 'WHERE u.activo = 1'} ORDER BY u.id`,
    Date.now(),
  );
  res.json(admin
    ? filas.map(({ datos_personales, ...u }) => {
        if (!ROLES_DUENOS.includes(u.rol)) return { ...u, perfil: PERFILES[u.rol] };
        const d = datosPersonalesDe({ datos_personales });
        return {
          ...u, perfil: PERFILES[u.rol],
          datos: { nombre_completo: d.nombre_completo, rut: d.rut, completos: completos(d), total: Object.keys(CAMPOS_PERSONALES).length },
        };
      })
    : filas.map(({ id, nombre }) => ({ id, nombre })));
});

// Bloquear o reactivar la cuenta de un dueño: bloqueada no puede ingresar y se cierran sus sesiones.
rutasAuth.post('/usuarios/:id/bloqueo', autenticar, requiere('administracion'), (req, res) => {
  const id = idDe(req.params.id);
  const activo = req.body?.activo;
  if (typeof activo !== 'boolean') throw new ErrorApp('Indique si la cuenta queda activa o bloqueada');
  const u = db.get('SELECT id, usuario, rol, activo FROM usuarios WHERE id = ?', id);
  if (!u) throw new ErrorApp('La cuenta no existe', 404);
  if (u.rol === 'superadmin' || id === req.usuario.id) throw new ErrorApp('La cuenta del super administrador no se puede bloquear', 409);
  db.tx(() => {
    db.run('UPDATE usuarios SET activo = ? WHERE id = ?', activo ? 1 : 0, id);
    if (!activo) db.run('DELETE FROM sesiones WHERE usuario_id = ?', id);
    registrar(req.usuario.id, {
      accion: activo ? 'cuenta_reactivada' : 'cuenta_bloqueada', entidad: 'usuario', entidadId: id,
      detalle: activo ? `Cuenta "${u.usuario}" reactivada` : `Cuenta "${u.usuario}" bloqueada: no puede ingresar y se cerraron sus sesiones`,
    });
  });
  res.json({ ok: true });
});

// Cierra todas las sesiones abiertas de una cuenta (por ejemplo, si quedó abierta en un equipo perdido).
rutasAuth.post('/usuarios/:id/cerrar-sesiones', autenticar, requiere('administracion'), (req, res) => {
  const id = idDe(req.params.id);
  const u = db.get('SELECT id, usuario FROM usuarios WHERE id = ?', id);
  if (!u) throw new ErrorApp('La cuenta no existe', 404);
  const cerradas = db.tx(() => {
    const n = id === req.usuario.id ? cerrarOtrasSesiones(req, id) : Number(db.run('DELETE FROM sesiones WHERE usuario_id = ?', id).changes);
    registrar(req.usuario.id, { accion: 'sesiones_cerradas', entidad: 'usuario', entidadId: id, detalle: `Se cerraron las sesiones abiertas de "${u.usuario}"` });
    return n;
  });
  res.json({ ok: true, cerradas: cerradas ?? 0 });
});

rutasAuth.put('/usuarios/:id', autenticar, requiere('administracion'), (req, res) => {
  const id = idDe(req.params.id);
  const { nombre } = leer(req.body, { nombre: texto({ req: true, max: 120 }) });
  const actual = db.get('SELECT id, usuario, nombre FROM usuarios WHERE id = ?', id);
  if (!actual) throw new ErrorApp('La cuenta no existe', 404);

  const cambios = { nombre };
  const nuevaClave = req.body?.password ? validarClave(req.body.password) : null;
  if (nuevaClave) cambios.password_hash = hashPassword(nuevaClave);

  db.tx(() => {
    actualizar('usuarios', id, cambios);
    if (nombre !== actual.nombre) {
      registrar(req.usuario.id, { accion: 'usuario_editado', entidad: 'usuario', entidadId: id, detalle: `Nombre de "${actual.usuario}": ${actual.nombre} → ${nombre}` });
    }
    if (nuevaClave) {
      registrar(req.usuario.id, { accion: 'clave_restablecida', entidad: 'usuario', entidadId: id, detalle: `Se restableció la contraseña de "${actual.usuario}"` });
    }
  });
  // Al cambiar la contraseña de otra persona se cierran sus sesiones abiertas.
  if (nuevaClave) {
    if (id === req.usuario.id) cerrarOtrasSesiones(req, id);
    else db.run('DELETE FROM sesiones WHERE usuario_id = ?', id);
  }
  res.json({ ok: true });
});
