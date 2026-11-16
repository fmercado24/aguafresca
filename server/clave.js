// Restablece la contraseña de una de las tres cuentas desde la consola (por ejemplo, si se olvidó).
// Uso:  ./iniciar.sh --clave <usuario>      (pide la nueva contraseña)
//       NUEVA_CLAVE='...' node server/clave.js <usuario>
// Sin NUEVA_CLAVE se genera una al azar y se muestra.
import { db } from './db.js';
import { CUENTAS, PERFILES, hashPassword, validarClave, claveAlAzar } from './auth.js';
import { registrar } from './lib/bitacora.js';

const nombre = (process.argv[2] || '').toLowerCase();
const cuenta = CUENTAS.find((c) => c.usuario === nombre);
if (!cuenta) {
  console.error(`Indique la cuenta: ${CUENTAS.map((c) => c.usuario).join(', ')}`);
  process.exit(1);
}
const u = db.get('SELECT id FROM usuarios WHERE usuario = ?', cuenta.usuario);
if (!u) {
  console.error(`La cuenta "${cuenta.usuario}" aún no existe: inicie el sistema una vez para crearla.`);
  process.exit(1);
}

const elegida = process.env.NUEVA_CLAVE || '';
try {
  if (elegida) validarClave(elegida);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
const clave = elegida || claveAlAzar();

db.tx(() => {
  db.run('UPDATE usuarios SET password_hash = ? WHERE id = ?', hashPassword(clave), u.id);
  db.run('DELETE FROM sesiones WHERE usuario_id = ?', u.id);
  registrar(null, { accion: 'clave_restablecida', entidad: 'usuario', entidadId: u.id, detalle: `Se restableció la contraseña de "${cuenta.usuario}" desde la consola` });
});

console.log(`Contraseña de "${cuenta.usuario}" (${PERFILES[cuenta.rol]}) restablecida.`);
console.log(elegida ? 'Ya puede ingresar con la contraseña que eligió.' : `Nueva contraseña: ${clave}`);
