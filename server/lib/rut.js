// Utilidades para el RUT chileno (dígito verificador módulo 11).

export const limpiarRut = (rut) => String(rut ?? '').replace(/[^0-9kK]/g, '').toUpperCase();

export function digitoVerificador(cuerpo) {
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  return resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
}

export function rutValido(rut) {
  const limpio = limpiarRut(rut);
  if (limpio.length < 2) return false;
  const cuerpo = limpio.slice(0, -1);
  if (!/^\d+$/.test(cuerpo)) return false;
  return digitoVerificador(cuerpo) === limpio.slice(-1);
}

/** Forma de almacenamiento: '12345678-9' */
export function normalizarRut(rut) {
  const limpio = limpiarRut(rut);
  if (limpio.length < 2) return '';
  return `${Number(limpio.slice(0, -1))}-${limpio.slice(-1)}`;
}

/** Forma de presentación: '12.345.678-9' */
export function formatearRut(rut) {
  const n = normalizarRut(rut);
  if (!n) return '';
  const [cuerpo, dv] = n.split('-');
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
}
