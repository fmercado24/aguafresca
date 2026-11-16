import crypto from 'node:crypto';
import { db, insertar } from './db.js';
import { config } from './config.js';
import { ErrorApp } from './lib/validar.js';

const COOKIE = 'af_sesion';
const DURACION_MS = 30 * 24 * 60 * 60 * 1000;

export function hashPassword(password) {
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, sal, 64);
  return `scrypt$${sal.toString('hex')}$${hash.toString('hex')}`;
}

export function verificarPassword(password, guardado) {
  const [algoritmo, salHex, hashHex] = String(guardado).split('$');
  if (algoritmo !== 'scrypt' || !salHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, 'hex');
  const calculado = crypto.scryptSync(password, Buffer.from(salHex, 'hex'), esperado.length);
  return crypto.timingSafeEqual(calculado, esperado);
}

// En la base solo se guarda el hash del token: una copia de la BD no permite suplantar sesiones.
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

function leerCookie(req, nombre) {
  for (const parte of (req.headers.cookie || '').split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nombre) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return null;
}

const opcionesCookie = (req) => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: config.cookieSegura || req.secure,
  path: '/',
});

export function abrirSesion(req, res, usuarioId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.run('DELETE FROM sesiones WHERE expira_en < ?', Date.now());
  db.run('INSERT INTO sesiones (token_hash, usuario_id, expira_en) VALUES (?, ?, ?)', hashToken(token), usuarioId, Date.now() + DURACION_MS);
  res.cookie(COOKIE, token, { ...opcionesCookie(req), maxAge: DURACION_MS });
}

export function cerrarSesion(req, res) {
  const token = leerCookie(req, COOKIE);
  if (token) db.run('DELETE FROM sesiones WHERE token_hash = ?', hashToken(token));
  res.clearCookie(COOKIE, opcionesCookie(req));
}

/** Cierra las demás sesiones de un usuario (p. ej. al cambiar su contraseña). */
export function cerrarOtrasSesiones(req, usuarioId) {
  const token = leerCookie(req, COOKIE);
  db.run('DELETE FROM sesiones WHERE usuario_id = ? AND token_hash <> ?', usuarioId, token ? hashToken(token) : '');
}

export function autenticar(req, res, next) {
  const token = leerCookie(req, COOKIE);
  const usuario = token && db.get(
    `SELECT u.id, u.usuario, u.nombre, u.rol
       FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = ? AND s.expira_en > ? AND u.activo = 1`,
    hashToken(token),
    Date.now(),
  );
  if (!usuario) throw new ErrorApp('Debe iniciar sesión', 401);
  req.usuario = { ...usuario, permisos: PERMISOS[usuario.rol] ?? [] };
  next();
}

// ---------- Cuentas y permisos ----------
// El sistema tiene exactamente estas tres cuentas. No se crean ni se eliminan desde la aplicación.

export const CUENTAS = [
  { usuario: 'admin', nombre: 'Administrador', rol: 'superadmin' },
  { usuario: 'ldiaz', nombre: 'L. Díaz', rol: 'abogado' },
  { usuario: 'pmercado', nombre: 'P. Mercado', rol: 'contador' },
];

export const PERFILES = { superadmin: 'Super administrador', abogado: 'Abogado', contador: 'Contador' };

// Todas las cuentas tienen las funciones básicas (clientes, ventas, pagos, cotizaciones, visitas,
// confeccionar documentos, reservar parcelas). Además:
//   empresa        datos sensibles de la empresa y el proyecto (RUT, representante, banco, inscripción)
//   parcelas       crear parcelas, cambiar precios, editar el mapa
//   administracion contraseñas y nombres de las cuentas, registro de cambios, eliminar clientes
//   plantillas     modificar las plantillas de documentos legales
//   amortizacion   modificar la tabla de amortización de una venta
//   contabilidad   tasas de interés y mora, corregir o anular pagos, anular ventas
export const PERMISOS = {
  superadmin: ['empresa', 'parcelas', 'administracion', 'plantillas', 'amortizacion', 'contabilidad'],
  abogado: ['plantillas'],
  contador: ['amortizacion', 'contabilidad'],
};

const QUIEN_PUEDE = {
  empresa: 'el super administrador',
  parcelas: 'el super administrador',
  administracion: 'el super administrador',
  plantillas: 'el abogado o el super administrador',
  amortizacion: 'el contador o el super administrador',
  contabilidad: 'el contador o el super administrador',
};

export const puede = (usuario, permiso) => !!usuario && (PERMISOS[usuario.rol] ?? []).includes(permiso);

/** Middleware: deja pasar solo a las cuentas que tienen el permiso indicado. */
export function requiere(permiso) {
  if (!QUIEN_PUEDE[permiso]) throw new Error(`Permiso desconocido: ${permiso}`);
  return (req, res, next) => {
    if (!puede(req.usuario, permiso)) throw new ErrorApp(`Esta acción solo la puede realizar ${QUIEN_PUEDE[permiso]}`, 403);
    next();
  };
}

/**
 * Las operaciones que modifican datos deben traer la cabecera X-AF, que un formulario
 * de otro sitio no puede enviar. Complementa a la cookie SameSite contra ataques CSRF.
 */
export function exigirCabecera(req, res, next) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('x-af') !== '1') {
    throw new ErrorApp('Solicitud no permitida', 403);
  }
  next();
}

// Freno simple a intentos de adivinar contraseñas: 8 fallos → 15 minutos de espera.
const intentos = new Map();
const MAX_INTENTOS = 8;
const BLOQUEO_MS = 15 * 60 * 1000;

export function comprobarIntentos(clave) {
  const r = intentos.get(clave);
  if (r && r.n >= MAX_INTENTOS && Date.now() < r.hasta) {
    throw new ErrorApp('Demasiados intentos fallidos. Espere 15 minutos e intente de nuevo.', 429);
  }
}

export function anotarIntento(clave, exito) {
  if (exito) return void intentos.delete(clave);
  const r = intentos.get(clave);
  const vigente = r && Date.now() < r.hasta;
  intentos.set(clave, { n: vigente ? r.n + 1 : 1, hasta: Date.now() + BLOQUEO_MS });
  if (intentos.size > 5000) intentos.clear();
}

export const claveAlAzar = () => crypto.randomBytes(9).toString('base64url');

export function validarClave(p) {
  if (typeof p !== 'string' || p.length < 8) throw new ErrorApp('La contraseña debe tener al menos 8 caracteres');
  if (p.length > 200) throw new ErrorApp('La contraseña es demasiado larga');
  return p;
}

/**
 * Crea las cuentas fijas que falten (primer arranque, o una base anterior a este esquema)
 * y muestra en la consola sus contraseñas iniciales.
 */
export function asegurarUsuarios() {
  const creadas = [];
  for (const c of CUENTAS) {
    const existente = db.get('SELECT id, rol FROM usuarios WHERE usuario = ?', c.usuario);
    if (existente) {
      if (existente.rol !== c.rol) db.run('UPDATE usuarios SET rol = ? WHERE id = ?', c.rol, existente.id);
      continue;
    }
    const elegida = config.clavesIniciales[c.usuario];
    if (elegida) validarClave(elegida);
    const clave = elegida || claveAlAzar();
    insertar('usuarios', { usuario: c.usuario, nombre: c.nombre, rol: c.rol, password_hash: hashPassword(clave) });
    creadas.push({ ...c, clave: elegida ? '(la que usted eligió)' : clave });
  }
  if (!creadas.length) return;
  const ancho = Math.max(...creadas.map((c) => c.usuario.length));
  console.log('\n────────────────────────────────────────────────────────────');
  console.log(' Cuentas creadas (anote las contraseñas: se muestran solo esta vez)');
  for (const c of creadas) console.log(`   ${c.usuario.padEnd(ancho)}  ${PERFILES[c.rol].padEnd(20)}  ${c.clave}`);
  console.log(' Cada persona puede cambiar la suya en Configuración → Mi cuenta.');
  console.log('────────────────────────────────────────────────────────────\n');
}
