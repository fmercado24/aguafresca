import { sumarMeses } from './fechas.js';
import { ErrorApp } from './validar.js';

// Los montos se manejan siempre en pesos chilenos enteros (sin decimales).

/** Valor de la cuota fija mensual (sistema francés). */
export function calcularCuota(monto, tasaMensualPct, nCuotas) {
  if (!(nCuotas > 0) || !(monto > 0)) return 0;
  const i = tasaMensualPct / 100;
  if (i === 0) return Math.round(monto / nCuotas);
  return Math.round((monto * i) / (1 - Math.pow(1 + i, -nCuotas)));
}

/** Tasa anual equivalente (compuesta) a una tasa mensual, ambas en %. */
export function tasaAnualEquivalente(tasaMensualPct) {
  return (Math.pow(1 + tasaMensualPct / 100, 12) - 1) * 100;
}

/**
 * Tabla de amortización de cuota fija con interés sobre saldo insoluto.
 * La última cuota absorbe la diferencia de redondeo para que el saldo termine en $0.
 */
export function tablaAmortizacion({ monto, tasaMensual, nCuotas, fechaPrimeraCuota }) {
  const i = tasaMensual / 100;
  const cuota = calcularCuota(monto, tasaMensual, nCuotas);
  const filas = [];
  let saldo = monto;
  let totalIntereses = 0;

  for (let k = 1; k <= nCuotas; k++) {
    const interes = Math.round(saldo * i);
    let amortizacion = cuota - interes;
    if (k === nCuotas || amortizacion > saldo) amortizacion = saldo;
    if (amortizacion < 0) amortizacion = 0;
    saldo -= amortizacion;
    totalIntereses += interes;
    filas.push({
      numero: k,
      fecha: fechaPrimeraCuota ? sumarMeses(fechaPrimeraCuota, k - 1) : null,
      cuota: amortizacion + interes,
      interes,
      amortizacion,
      saldo,
    });
  }

  return { cuota, filas, totalIntereses, totalPagar: monto + totalIntereses };
}

/**
 * Tabla a partir de un monto de cuota "cerrado" (por ejemplo $500.000): todas las cuotas son de ese monto
 * y la última es menor, por el saldo que queda. El número de cuotas resulta del cálculo.
 */
export const MAXIMO_CUOTAS = 360;

export function tablaPorCuota({ monto, tasaMensual, cuota, fechaPrimeraCuota }) {
  const i = tasaMensual / 100;
  if (!(cuota > 0)) throw new ErrorApp('Indique el monto de la cuota');
  if (cuota % 1000 !== 0) throw new ErrorApp('El monto de la cuota debe ser múltiplo de $1.000');
  const interesInicial = Math.round(monto * i);
  if (cuota <= interesInicial) {
    throw new ErrorApp(`Una cuota de ${pesos(cuota)} no alcanza a cubrir el interés del primer mes (${pesos(interesInicial)}): aumente la cuota`);
  }
  const filas = [];
  let saldo = monto;
  let totalIntereses = 0;
  for (let k = 1; saldo > 0; k++) {
    if (k > MAXIMO_CUOTAS) throw new ErrorApp(`Con una cuota de ${pesos(cuota)} el crédito tendría más de ${MAXIMO_CUOTAS} cuotas: aumente la cuota`);
    const interes = Math.round(saldo * i);
    const amortizacion = Math.min(saldo, cuota - interes);
    saldo -= amortizacion;
    totalIntereses += interes;
    filas.push({
      numero: k,
      fecha: fechaPrimeraCuota ? sumarMeses(fechaPrimeraCuota, k - 1) : null,
      cuota: amortizacion + interes,
      interes,
      amortizacion,
      saldo,
    });
  }
  return { cuota, filas, totalIntereses, totalPagar: monto + totalIntereses };
}

// ---------- Montos en palabras (para contratos) ----------

const HASTA_29 = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis',
  'veintisiete', 'veintiocho', 'veintinueve'];
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos',
  'setecientos', 'ochocientos', 'novecientos'];

function menorQueMil(n) {
  if (n === 100) return 'cien';
  const resto = n % 100;
  const decenas = resto < 30
    ? HASTA_29[resto]
    : DECENAS[Math.floor(resto / 10)] + (resto % 10 ? ` y ${HASTA_29[resto % 10]}` : '');
  return [CENTENAS[Math.floor(n / 100)], decenas].filter(Boolean).join(' ');
}

// "uno" pierde la "o" delante de un sustantivo: veintiún mil, un millón, treinta y un pesos.
const apocopar = (s) => s.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un');

function menorQueMillon(n) {
  const miles = Math.floor(n / 1000);
  const unidades = n % 1000;
  const textoMiles = miles === 0 ? '' : miles === 1 ? 'mil' : `${apocopar(menorQueMil(miles))} mil`;
  return [textoMiles, menorQueMil(unidades)].filter(Boolean).join(' ');
}

/** 1234567 → 'un millón doscientos treinta y cuatro mil quinientos sesenta y siete' */
export function numeroEnPalabras(n) {
  n = Math.round(Math.abs(Number(n) || 0));
  if (n === 0) return 'cero';
  const millones = Math.floor(n / 1_000_000);
  const resto = n % 1_000_000;
  const textoMillones = millones === 0 ? ''
    : millones === 1 ? 'un millón'
    : `${apocopar(menorQueMillon(millones))} millones`;
  return [textoMillones, menorQueMillon(resto)].filter(Boolean).join(' ');
}

/** 25000000 → 'veinticinco millones de pesos' */
export function montoEnPalabras(n) {
  n = Math.round(Math.abs(Number(n) || 0));
  if (n === 1) return 'un peso';
  const palabras = apocopar(numeroEnPalabras(n));
  const millonesExactos = n >= 1_000_000 && n % 1_000_000 === 0;
  return `${palabras} ${millonesExactos ? 'de pesos' : 'pesos'}`;
}

/** 1234567 → '$1.234.567' */
export function pesos(n) {
  const v = Math.round(Number(n) || 0);
  return `${v < 0 ? '-' : ''}$${String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}
