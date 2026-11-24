// Datos personales de los dueños (ldiaz y pmercado). Cada uno los completa en Configuración → Mi cuenta
// y se insertan en los documentos legales: variables {{ldiaz.…}} y {{pmercado.…}}, y la comparecencia
// del representante legal cuando la empresa designa a uno de ellos.
import { db } from '../db.js';
import { formatearRut } from './rut.js';

export const CAMPOS_PERSONALES = {
  nombre_completo: 'Nombre completo',
  rut: 'RUT',
  nacionalidad: 'Nacionalidad',
  estado_civil: 'Estado civil',
  profesion: 'Profesión u oficio',
  cargo: 'Cargo en la empresa',
  direccion: 'Domicilio',
  comuna: 'Comuna',
  ciudad: 'Ciudad',
  telefono: 'Teléfono',
  email: 'Correo electrónico',
};

const vacios = () => Object.fromEntries(Object.keys(CAMPOS_PERSONALES).map((k) => [k, '']));

/** Datos personales guardados de una cuenta (todas las claves, '' si faltan). */
export function datosPersonalesDe(fila) {
  if (!fila) return vacios();
  let guardados = {};
  try { guardados = JSON.parse(fila.datos_personales || '{}'); } catch { /* datos dañados: se ignoran */ }
  return { ...vacios(), ...Object.fromEntries(Object.keys(CAMPOS_PERSONALES).map((k) => [k, String(guardados[k] ?? '')])) };
}

export const datosDeCuenta = (usuario) => datosPersonalesDe(db.get('SELECT datos_personales FROM usuarios WHERE usuario = ?', usuario));

/** Cuántos campos tiene completos (para mostrar el avance). */
export const completos = (d) => Object.keys(CAMPOS_PERSONALES).filter((k) => String(d[k] ?? '').trim()).length;

/** Cuentas que pueden ser designadas representante legal: las de los dueños. */
export const CUENTAS_REPRESENTANTE = ['ldiaz', 'pmercado'];

/**
 * Representante legal que aparece en los documentos. Si la empresa designó a uno de los dueños,
 * sus datos salen de su perfil (y se actualizan solos cuando los cambia); si no, de lo escrito en
 * Empresa y proyecto (solo nombre y RUT).
 */
export function representanteDe(empresa) {
  const cuenta = CUENTAS_REPRESENTANTE.includes(empresa?.representante_cuenta) ? empresa.representante_cuenta : '';
  if (!cuenta) return { ...vacios(), nombre_completo: empresa?.representante ?? '', rut: empresa?.rut_representante ?? '', cuenta: '' };
  return { ...datosDeCuenta(cuenta), cuenta };
}

export const rutLegible = (rut) => (rut ? formatearRut(rut) : '');
