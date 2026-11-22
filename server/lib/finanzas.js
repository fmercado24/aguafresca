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

/** Redondea hacia arriba a un valor "cerrado" de $1.000 (las cuotas nunca llevan pesos sueltos). */
export const valorCerrado = (n) => Math.ceil(n / 1000) * 1000;

export const MAXIMO_CUOTAS = 360;

/**
 * Recalcula interés y amortización de una serie de cuotas de monto conocido a partir de un saldo de capital:
 * - Una cuota de monto 0 es una cuota APLAZADA: ese mes no se paga, se cobra solo el interés y este se suma
 *   al capital (la cuota queda en $0 y la deuda aumenta).
 * - En las demás, el interés del mes se calcula sobre el saldo y el resto de la cuota amortiza capital.
 * - La cuota que alcanza a cubrir el saldo es la última y se cobra COMPLETA: lo que excede al saldo
 *   se cuenta como interés. Las cuotas que vinieran después se descartan.
 * - Si al terminar la serie todavía queda saldo, se agregan cuotas mensuales del último monto (`montoFinal`).
 * Devuelve las filas { fecha, interes, amortizacion, saldo } y el saldo final (0 salvo que no alcance).
 */
export function cuotasDesde({ saldo, tasaMensual, cuotas, montoFinal = null, maximo = 600 }) {
  const i = tasaMensual / 100;
  const filas = [];
  let s = saldo;
  const agregar = (fecha, monto) => {
    const interes = Math.round(s * i);
    if (monto === 0) {
      filas.push({ fecha, interes, amortizacion: -interes, saldo: (s += interes) });
      return;
    }
    if (s + interes <= monto) {
      filas.push({ fecha, interes: monto - s, amortizacion: s, saldo: 0 });
      s = 0;
      return;
    }
    if (monto <= interes) throw new ErrorApp(`Una cuota de ${pesos(monto)} no alcanza a cubrir el interés del mes (${pesos(interes)})`);
    filas.push({ fecha, interes, amortizacion: monto - interes, saldo: (s -= monto - interes) });
  };
  for (const c of cuotas) {
    if (s <= 0) break;
    agregar(c.fecha, c.monto);
  }
  const ultimoMonto = montoFinal ?? [...cuotas].reverse().find((c) => c.monto > 0)?.monto ?? 0;
  // Las cuotas agregadas vencen el mismo día del mes que la última de la serie (sumar mes a mes correría el día: 31 → 28).
  const ancla = filas.at(-1)?.fecha ?? null;
  let agregadas = 0;
  while (s > 0 && ultimoMonto > 0) {
    if (filas.length >= maximo) throw new ErrorApp(`Con cuotas de ${pesos(ultimoMonto)} el crédito tendría más de ${maximo} cuotas: aumente la cuota`);
    agregar(ancla ? sumarMeses(ancla, ++agregadas) : null, ultimoMonto);
  }
  return { filas, saldoFinal: s };
}

/** Cuotas mensuales iguales de un monto cerrado, desde la primera fecha; la última también es completa. */
function tablaCuotaFija({ monto, tasaMensual, cuota, fechaPrimeraCuota }) {
  const interesInicial = Math.round(monto * (tasaMensual / 100));
  if (cuota <= interesInicial) {
    throw new ErrorApp(`Una cuota de ${pesos(cuota)} no alcanza a cubrir el interés del primer mes (${pesos(interesInicial)}): aumente la cuota`);
  }
  const { filas } = cuotasDesde({
    saldo: monto, tasaMensual, montoFinal: cuota, maximo: MAXIMO_CUOTAS,
    cuotas: [{ fecha: fechaPrimeraCuota || null, monto: cuota }],
  });
  if (!fechaPrimeraCuota) for (const f of filas) f.fecha = null;
  const conNumero = filas.map((f, k) => ({ numero: k + 1, fecha: f.fecha, cuota: f.interes + f.amortizacion, interes: f.interes, amortizacion: f.amortizacion, saldo: f.saldo }));
  const totalIntereses = conNumero.reduce((t, f) => t + f.interes, 0);
  return { cuota, filas: conNumero, totalIntereses, totalPagar: monto + totalIntereses };
}

/**
 * Tabla por número de cuotas: la cuota fija del sistema francés se redondea hacia arriba a $1.000
 * (valor cerrado) y todas las cuotas, incluida la última, son de ese monto. Lo que la última cuota
 * excede al saldo se cuenta como interés.
 */
export function tablaAmortizacion({ monto, tasaMensual, nCuotas, fechaPrimeraCuota }) {
  return tablaCuotaFija({ monto, tasaMensual, cuota: valorCerrado(calcularCuota(monto, tasaMensual, nCuotas)), fechaPrimeraCuota });
}

/**
 * Tabla a partir de un monto de cuota cerrado (por ejemplo $500.000): todas las cuotas son de ese monto,
 * incluida la última. El número de cuotas resulta del cálculo.
 */
export function tablaPorCuota({ monto, tasaMensual, cuota, fechaPrimeraCuota }) {
  if (!(cuota > 0)) throw new ErrorApp('Indique el monto de la cuota');
  if (cuota % 1000 !== 0) throw new ErrorApp('El monto de la cuota debe ser múltiplo de $1.000');
  return tablaCuotaFija({ monto, tasaMensual, cuota, fechaPrimeraCuota });
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
