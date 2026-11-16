import { esFecha } from './fechas.js';

/** Error esperado (validación, permisos, etc.): el mensaje se muestra tal cual al usuario. */
export class ErrorApp extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje);
    this.estado = estado;
  }
}

const vacio = (v) => v === undefined || v === null || v === '';

const etiquetaDe = (clave) => {
  const t = clave.replaceAll('_', ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Valida `cuerpo` contra un esquema { campo: validador } y devuelve solo los campos declarados. */
export function leer(cuerpo, esquema) {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) throw new ErrorApp('Solicitud inválida');
  const r = {};
  for (const [clave, validador] of Object.entries(esquema)) {
    r[clave] = validador(cuerpo[clave], etiquetaDe(clave));
  }
  return r;
}

export const texto = ({ req = false, max = 500 } = {}) => (v, campo) => {
  if (vacio(v)) {
    if (req) throw new ErrorApp(`${campo}: es obligatorio`);
    return '';
  }
  if (typeof v !== 'string' && typeof v !== 'number') throw new ErrorApp(`${campo}: valor inválido`);
  const s = String(v).trim();
  if (req && !s) throw new ErrorApp(`${campo}: es obligatorio`);
  if (s.length > max) throw new ErrorApp(`${campo}: máximo ${max} caracteres`);
  return s;
};

const numero = (esEntero) => ({ req = false, min = -Infinity, max = Infinity, def = null } = {}) => (v, campo) => {
  if (vacio(v)) {
    if (req) throw new ErrorApp(`${campo}: es obligatorio`);
    return def;
  }
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || (esEntero && !Number.isInteger(n))) {
    throw new ErrorApp(`${campo}: debe ser un número${esEntero ? ' entero' : ''}`);
  }
  if (n < min) throw new ErrorApp(`${campo}: el mínimo es ${min}`);
  if (n > max) throw new ErrorApp(`${campo}: el máximo es ${max}`);
  return n;
};

export const entero = numero(true);
export const decimal = numero(false);

export const fecha = ({ req = false } = {}) => (v, campo) => {
  if (vacio(v)) {
    if (req) throw new ErrorApp(`${campo}: es obligatoria`);
    return null;
  }
  if (!esFecha(v)) throw new ErrorApp(`${campo}: fecha inválida`);
  return v;
};

export const fechaHora = ({ req = false } = {}) => (v, campo) => {
  if (vacio(v)) {
    if (req) throw new ErrorApp(`${campo}: es obligatoria`);
    return null;
  }
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(v) || !esFecha(v.slice(0, 10))) {
    throw new ErrorApp(`${campo}: fecha y hora inválidas`);
  }
  return v;
};

export const opcion = (valores, { req = false, def = valores[0] } = {}) => (v, campo) => {
  if (vacio(v)) {
    if (req) throw new ErrorApp(`${campo}: es obligatorio`);
    return def;
  }
  if (!valores.includes(v)) throw new ErrorApp(`${campo}: valor no permitido`);
  return v;
};

export const booleano = () => (v) => v === true || v === 1 || v === 'true' || v === '1';

/** Identificador numérico tomado de la URL. */
export function idDe(valor) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1) throw new ErrorApp('Identificador inválido', 404);
  return n;
}
