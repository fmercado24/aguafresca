import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  raiz,
  puerto: Number(process.env.PORT) || 3000,
  // Carpeta donde viven la base de datos y el plano del loteo. Es lo que hay que respaldar.
  dirDatos: path.resolve(process.env.DATA_DIR || path.join(raiz, 'data')),
  rutaBD: process.env.DB_PATH || '',
  zonaHoraria: process.env.TZ_APP || 'America/Santiago',
  // Activar cuando el sistema se publica detrás de HTTPS.
  cookieSegura: process.env.COOKIE_SECURE === 'true',
  confiarProxy: process.env.TRUST_PROXY || '',
  // Contraseñas iniciales de las tres cuentas, solo para el primer arranque.
  // Si no se indican, se generan al azar y se muestran una vez en la consola.
  clavesIniciales: {
    admin: process.env.CLAVE_ADMIN || '',
    ldiaz: process.env.CLAVE_LDIAZ || '',
    pmercado: process.env.CLAVE_PMERCADO || '',
  },
};
