// Formato de montos, fechas y RUT para Chile. Las fechas viajan como texto 'AAAA-MM-DD'.

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const dos = (n: number) => String(n).padStart(2, '0');
const partes = (iso: string) => iso.slice(0, 10).split('-').map(Number) as [number, number, number];
const armar = (f: Date) => `${f.getUTCFullYear()}-${dos(f.getUTCMonth() + 1)}-${dos(f.getUTCDate())}`;

export const miles = (n: number) => String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** 1234567 → '$1.234.567' */
export function pesos(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n < 0 ? '-' : ''}$${miles(n)}`;
}

/** Precio de lista de una parcela: las recién cargadas desde el plano aún no tienen precio. */
export const precioLista = (precio: number) => (precio > 0 ? pesos(precio) : 'Precio por definir');

/** Para ejes de gráficos: 12500000 → '$12,5 M' */
export function pesosCompacto(n: number): string {
  const abs = Math.abs(n);
  const dec = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');
  if (abs >= 1_000_000) return `$${dec(n / 1_000_000)} M`;
  if (abs >= 1_000) return `$${dec(n / 1_000)} mil`;
  return pesos(n);
}

/** 5000.5 → '5.000,5' */
export function numero(n: number | null | undefined, decimales = 2): string {
  if (n === null || n === undefined) return '—';
  const factor = 10 ** decimales;
  const redondeado = Math.round(Math.abs(n) * factor) / factor;
  const [ent, dec] = String(redondeado).split('.');
  return `${n < 0 ? '-' : ''}${miles(Number(ent))}${dec ? `,${dec}` : ''}`;
}

export const porcentaje = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${numero(n, 2)} %`);

/** '2026-11-11' → '11-11-2026' */
export function fecha(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [a, m, d] = partes(iso);
  return `${dos(d)}-${dos(m)}-${a}`;
}

/** '2026-11-11' → '11 de noviembre de 2026' */
export function fechaLarga(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [a, m, d] = partes(iso);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

/** '2026-11-11' → 'miércoles 11 de noviembre' */
export function fechaConDia(iso: string): string {
  const [a, m, d] = partes(iso);
  return `${DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${d} de ${MESES[m - 1]}`;
}

/** '2026-11' → 'nov 2026' */
export function mesCorto(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return `${MESES[m - 1].slice(0, 3)} ${a}`;
}

/** '2026-11' → 'Noviembre de 2026' */
export function mesLargo(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  const nombre = MESES[m - 1];
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} de ${a}`;
}

export const hora = (fechaHora: string) => fechaHora.slice(11, 16);

/** Fecha de registro que viene de la base ('AAAA-MM-DD HH:MM:SS', UTC) → 'dd-mm-aaaa' */
export const fechaRegistro = (s: string | null | undefined) => (s ? fecha(s.slice(0, 10)) : '—');

/** Fecha y hora de registro (UTC en la base) en la hora de Chile → '16-11-2026 10:42' */
export function fechaHoraRegistro(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(`${s.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return s;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('es-CL', {
      timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}`;
}

export function sumarDias(iso: string, dias: number): string {
  const [a, m, d] = partes(iso);
  return armar(new Date(Date.UTC(a, m - 1, d + dias)));
}

export function sumarMeses(iso: string, meses: number): string {
  const [a, m, d] = partes(iso);
  const total = m - 1 + meses;
  const a2 = a + Math.floor(total / 12);
  const m2 = ((total % 12) + 12) % 12;
  const diasDelMes = new Date(Date.UTC(a2, m2 + 1, 0)).getUTCDate();
  return `${a2}-${dos(m2 + 1)}-${dos(Math.min(d, diasDelMes))}`;
}

export function diaSemana(iso: string): number {
  const [a, m, d] = partes(iso);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

// ---------- RUT ----------

const limpiarRut = (rut: string) => rut.replace(/[^0-9kK]/g, '').toUpperCase();

export function formatearRut(rut: string | null | undefined): string {
  const limpio = limpiarRut(rut ?? '');
  if (limpio.length < 2) return rut ?? '';
  return `${miles(Number(limpio.slice(0, -1)))}-${limpio.slice(-1)}`;
}

export function rutValido(rut: string): boolean {
  const limpio = limpiarRut(rut);
  if (limpio.length < 2 || !/^\d+$/.test(limpio.slice(0, -1))) return false;
  let suma = 0;
  let factor = 2;
  for (let i = limpio.length - 2; i >= 0; i--) {
    suma += Number(limpio[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  return (resto === 11 ? '0' : resto === 10 ? 'K' : String(resto)) === limpio.slice(-1);
}

// ---------- Teléfono ----------

/**
 * Teléfonos chilenos de 9 dígitos (con o sin +56): celulares (9 XXXX XXXX), Santiago (2 XXXX XXXX) y regiones
 * (código de 2 dígitos + 7). Con "+" y otro código de país se acepta como número extranjero.
 * Devuelve el número con formato de presentación (+56 9 1234 5678) o null si no es válido.
 */
export function analizarTelefono(texto: string): { valor: string; movil: boolean } | null {
  const s = texto.trim();
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

/** Mensaje de error de un teléfono, o null si está bien (vacío también está bien). */
export function errorTelefono(texto: string, movil = false): string | null {
  const t = analizarTelefono(texto);
  if (!t) return movil ? 'Celular inválido: 9 dígitos que empiezan con 9 (ej.: +56 9 1234 5678)' : 'Teléfono inválido: 9 dígitos (ej.: +56 9 1234 5678 o +56 2 2345 6789)';
  if (movil && t.valor && !t.movil) return 'Debe ser un celular: 9 dígitos que empiezan con 9';
  return null;
}

export const correoValido = (s: string) => !s.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());

// ---------- Varios ----------

export const plural = (n: number, singular: string, pluralTexto = `${singular}s`) => `${n} ${n === 1 ? singular : pluralTexto}`;

export const MEDIOS_PAGO: Record<string, string> = {
  transferencia: 'Transferencia',
  deposito: 'Depósito',
  efectivo: 'Efectivo',
  cheque: 'Cheque',
  tarjeta: 'Tarjeta',
  otro: 'Otro',
};

/** Descarga un archivo CSV que Excel abre directamente (separador ';' y BOM para los acentos). */
export function descargarCsv(nombre: string, encabezados: string[], filas: (string | number | null | undefined)[][]) {
  const celda = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const texto = [encabezados, ...filas].map((f) => f.map(celda).join(';')).join('\r\n');
  descargar(nombre, new Blob(['﻿', texto], { type: 'text/csv;charset=utf-8' }));
}

export function descargar(nombre: string, contenido: Blob) {
  const url = URL.createObjectURL(contenido);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
