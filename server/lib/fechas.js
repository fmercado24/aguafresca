import { config } from '../config.js';

// Todas las fechas se manejan como texto ISO 'AAAA-MM-DD' (sin hora), para evitar
// desfases por zona horaria. Las comparaciones de texto equivalen a comparar fechas.

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const dos = (n) => String(n).padStart(2, '0');
const armar = (a, m, d) => `${a}-${dos(m)}-${dos(d)}`;
const partes = (iso) => iso.split('-').map(Number);

/** Fecha de hoy en la zona horaria de la empresa. */
export function hoy() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: config.zonaHoraria, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export function esFecha(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [a, m, d] = partes(s);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

/**
 * Suma meses conservando el día de vencimiento. Si el mes destino no tiene ese día
 * (p. ej. 31 → febrero) se usa el último día del mes.
 */
export function sumarMeses(iso, meses) {
  const [a, m, d] = partes(iso);
  const total = m - 1 + meses;
  const a2 = a + Math.floor(total / 12);
  const m2 = ((total % 12) + 12) % 12;
  const diasDelMes = new Date(Date.UTC(a2, m2 + 1, 0)).getUTCDate();
  return armar(a2, m2 + 1, Math.min(d, diasDelMes));
}

export function sumarDias(iso, dias) {
  const [a, m, d] = partes(iso);
  const f = new Date(Date.UTC(a, m - 1, d + dias));
  return armar(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate());
}

/** Días transcurridos desde `desde` hasta `hasta` (positivo si `hasta` es posterior). */
export function diasEntre(desde, hasta) {
  const [a1, m1, d1] = partes(desde);
  const [a2, m2, d2] = partes(hasta);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

/** '2026-11-11' → '11 de noviembre de 2026' */
export function fechaLarga(iso) {
  if (!esFecha(iso)) return '';
  const [a, m, d] = partes(iso);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

/** '2026-11-11' → '11-11-2026' */
export function fechaCorta(iso) {
  if (!esFecha(iso)) return '';
  const [a, m, d] = partes(iso);
  return `${dos(d)}-${dos(m)}-${a}`;
}
