import { Router } from 'express';
import { db, actualizar } from '../db.js';
import {
  abrirSesion, cerrarSesion, cerrarOtrasSesiones, autenticar, requiere, puede, PERMISOS, PERFILES,
  hashPassword, verificarPassword, validarClave, comprobarIntentos, anotarIntento,
} from '../auth.js';
import { registrar } from '../lib/bitacora.js';
import { ErrorApp, leer, texto, idDe } from '../lib/validar.js';

export const rutasAuth = Router();

const deSesion = (u) => ({ id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol, perfil: PERFILES[u.rol], permisos: PERMISOS[u.rol] ?? [] });

// ---------- Sesión ----------

rutasAuth.post('/auth/login', (req, res) => {
  const { usuario, password } = leer(req.body, { usuario: texto({ req: true, max: 60 }), password: texto({ req: true, max: 200 }) });
  const nombreUsuario = usuario.toLowerCase();
  const clave = `${req.ip}|${nombreUsuario}`;
  comprobarIntentos(clave);
  const u = db.get('SELECT * FROM usuarios WHERE usuario = ? AND activo = 1', nombreUsuario);
  const ok = !!u && verificarPassword(password, u.password_hash);
  anotarIntento(clave, ok);
  if (!ok) throw new ErrorApp('Usuario o contraseña incorrectos', 401);
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

// ---------- Cuentas (son siempre tres; aquí solo se editan) ----------

rutasAuth.get('/usuarios', autenticar, (req, res) => {
  // Todos necesitan la lista para asignar vendedores; el nombre de usuario y el perfil los ve solo el super administrador.
  const filas = db.all('SELECT id, usuario, nombre, rol FROM usuarios WHERE activo = 1 ORDER BY id');
  res.json(puede(req.usuario, 'administracion')
    ? filas.map((u) => ({ ...u, perfil: PERFILES[u.rol] }))
    : filas.map(({ id, nombre }) => ({ id, nombre })));
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
