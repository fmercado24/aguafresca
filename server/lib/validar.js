import { esFecha, hoy } from './fechas.js';
import { rutValido, normalizarRut } from './rut.js';

/** Error esperado (validación, permisos, etc.): el mensaje se muestra tal cual al usuario. */
export class ErrorApp extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje);
    this.estado = estado;
  }
}

const vacio = (v) => v === undefined || v === null || v === '';

// Nombre de cada campo en los mensajes de error.
const ETIQUETAS = {
  rut: 'RUT', telefono: 'Teléfono', email: 'Correo electrónico', fecha_nacimiento: 'Fecha de nacimiento',
  aval_rut: 'RUT del aval', aval_telefono: 'Teléfono del aval', aval_nombre: 'Nombre del aval',
  contacto_rut: 'RUT del interesado', contacto_telefono: 'Celular del interesado', contacto_email: 'Correo del interesado',
  contacto_nombre: 'Nombre del interesado', rut_representante: 'RUT del representante', rol_sii: 'Rol de avalúo',
  superficie_m2: 'Superficie', n_cuotas: 'Número de cuotas', cuota_objetivo: 'Monto de la cuota', tasa_mensual: 'Interés mensual',
  tasa_mora_mensual: 'Interés por mora', pie_porcentaje: 'Pie habitual', dias_validez_cotizacion: 'Vigencia de las cotizaciones',
  dias_plazo_carta: 'Plazo de las cartas', precio_lista: 'Precio de lista', fecha_primera_cuota: 'Vencimiento de la primera cuota',
  renta_mensual: 'Renta mensual', compromiso_monto: 'Monto comprometido', compromiso_fecha: 'Fecha del compromiso',
  responder_a: 'Responder a', nombre_completo: 'Nombre completo',
};
const etiquetaDe = (clave) => {
  if (ETIQUETAS[clave]) return ETIQUETAS[clave];
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

export const fecha = ({ req = false, pasada = false } = {}) => (v, campo) => {
  if (vacio(v)) {
    if (req) throw new ErrorApp(`${campo}: es obligatoria`);
    return null;
  }
  if (!esFecha(v) || v < '1900-01-01') throw new ErrorApp(`${campo}: fecha inválida`);
  if (pasada && v > hoy()) throw new ErrorApp(`${campo}: no puede ser posterior a hoy`);
  return v;
};

/** RUT chileno con dígito verificador; se guarda como 12345678-9. */
export const rut = ({ req = false } = {}) => (v, campo) => {
  if (vacio(v)) {
    if (req) throw new ErrorApp(`${campo}: es obligatorio`);
    return '';
  }
  const s = String(v).trim();
  if (/[^0-9kK.\-\s]/.test(s)) throw new ErrorApp(`${campo}: solo puede tener números, puntos, guion y K`);
  if (!rutValido(s)) throw new ErrorApp(`${campo}: no es válido (revise el dígito verificador)`);
  return normalizarRut(s);
};

/**
 * Teléfono chileno de 9 dígitos (con o sin +56) o extranjero con "+" y código de país. Se guarda con formato:
 * +56 9 1234 5678 (celular), +56 2 2345 6789 (Santiago), +56 45 234 5678 (regiones). Con `movil`, exige celular.
 */
export function normalizarTelefono(texto) {
  const s = String(texto ?? '').trim();
  if (!s) return { valor: '', movil: false };
  if (/[^\d+\s()-]/.test(s)) return null;
  let d = s.replace(/\D/g, '');
  if (s.startsWith('+') && !d.startsWith('56')) return d.length >= 8 && d.length <= 15 ? { valor: `+${d}`, movil: true } : null;
  if (d.length === 11 && d.startsWith('56')) d = d.slice(2);
  if (d.length !== 9) return null;
  if (d[0] === '9') return { valor: `+56 9 ${d.slice(1, 5)} ${d.slice(5)}`, movil: true };
  if (d[0] === '2') return { valor: `+56 2 ${d.slice(1, 5)} ${d.slice(5)}`, movil: false };
  if (d[0] === '0' || d[0] === '1') return null;
  return { valor: `+56 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`, movil: false };
}

export const telefono = ({ req = false, movil = false } = {}) => (v, campo) => {
  if (vacio(v)) {
    if (req) throw new ErrorApp(`${campo}: es obligatorio`);
    return '';
  }
  if (typeof v !== 'string' && typeof v !== 'number') throw new ErrorApp(`${campo}: valor inválido`);
  if (/[^\d+\s()-]/.test(String(v).trim())) throw new ErrorApp(`${campo}: solo puede tener números (y el signo + al comienzo)`);
  const t = normalizarTelefono(v);
  if (!t) throw new ErrorApp(`${campo}: no es un número válido. Use 9 dígitos, por ejemplo +56 9 1234 5678`);
  if (movil && !t.movil) throw new ErrorApp(`${campo}: debe ser un celular (9 dígitos que empiezan con 9)`);
  return t.valor;
};

export const correo = ({ req = false } = {}) => (v, campo) => {
  if (vacio(v)) {
    if (req) throw new ErrorApp(`${campo}: es obligatorio`);
    return '';
  }
  const s = String(v).trim().toLowerCase();
  if (s.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) throw new ErrorApp(`${campo}: no es un correo válido (ej.: nombre@dominio.cl)`);
  return s;
};

/** Rol de avalúo del SII: números con guion, por ejemplo 1234-56. */
export const rolSii = () => (v, campo) => {
  if (vacio(v)) return '';
  const s = String(v).trim();
  if (!/^\d{1,6}-\d{1,4}$/.test(s)) throw new ErrorApp(`${campo}: use el formato número-número, por ejemplo 1234-56`);
  return s;
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
