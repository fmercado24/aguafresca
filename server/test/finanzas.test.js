import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularCuota, tablaAmortizacion, tablaPorCuota, cuotasDesde, numeroEnPalabras, montoEnPalabras, pesos, tasaAnualEquivalente } from '../lib/finanzas.js';
import { aplazarCuotas, completarMesesRepactados, ultimaCuotaCompleta } from '../lib/creditos.js';
import { sumarMeses, sumarDias, diasEntre, esFecha, fechaLarga } from '../lib/fechas.js';
import { rutValido, normalizarRut, formatearRut } from '../lib/rut.js';

test('cuota fija: coincide con la fórmula del sistema francés', () => {
  // $10.000.000 al 1% mensual en 12 cuotas → $888.487,89
  assert.equal(calcularCuota(10_000_000, 1, 12), 888_488);
  assert.equal(calcularCuota(12_000_000, 0, 12), 1_000_000);
  assert.equal(calcularCuota(0, 1, 12), 0);
});

test('tabla de amortización: cuadra el capital y termina en saldo cero', () => {
  for (const [monto, tasa, n] of [[10_000_000, 1, 12], [23_456_789, 1.35, 60], [18_000_000, 0, 36], [7_777_777, 2.5, 7], [1_000_000, 0.8, 120]]) {
    const t = tablaAmortizacion({ monto, tasaMensual: tasa, nCuotas: n, fechaPrimeraCuota: '2026-01-05' });
    assert.equal(t.filas.length, n);
    assert.equal(t.filas.reduce((s, f) => s + f.amortizacion, 0), monto, 'la suma de amortizaciones es el capital');
    assert.equal(t.filas.at(-1).saldo, 0, 'saldo final cero');
    assert.equal(t.filas.reduce((s, f) => s + f.cuota, 0), monto + t.totalIntereses);
    for (const f of t.filas) {
      assert.equal(f.cuota, f.interes + f.amortizacion);
      assert.ok(f.amortizacion >= 0 && f.saldo >= 0);
    }
    // La cuota es un valor cerrado (múltiplo de $1.000) y todas son iguales, incluida la última.
    assert.equal(t.cuota % 1000, 0);
    assert.ok(t.cuota >= calcularCuota(monto, tasa, n));
    assert.ok(t.filas.every((f) => f.cuota === t.cuota));
  }
});

test('tabla de amortización: el interés se calcula sobre el saldo insoluto', () => {
  const t = tablaAmortizacion({ monto: 10_000_000, tasaMensual: 1, nCuotas: 12, fechaPrimeraCuota: '2026-01-31' });
  assert.equal(t.cuota, 889_000, '$888.488 redondeado hacia arriba a $1.000');
  assert.equal(t.filas[0].interes, 100_000);
  assert.equal(t.filas[0].amortizacion, 789_000);
  assert.equal(t.filas[1].interes, Math.round((10_000_000 - 789_000) * 0.01));
  assert.deepEqual(t.filas.slice(0, 4).map((f) => f.fecha), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
});

test('la última cuota se cobra completa: lo que excede al saldo es interés', () => {
  const t = tablaPorCuota({ monto: 24_000_000, tasaMensual: 1, cuota: 500_000, fechaPrimeraCuota: '2026-01-10' });
  assert.equal(t.filas.length, 66);
  assert.ok(t.filas.every((f) => f.cuota === 500_000));
  const [penultima, ultima] = t.filas.slice(-2);
  assert.equal(ultima.amortizacion, penultima.saldo);
  assert.equal(ultima.interes, 500_000 - penultima.saldo);
  assert.equal(ultima.saldo, 0);
  assert.equal(t.totalPagar, 66 * 500_000);
});

test('cuota aplazada: cuota $0, se carga solo el interés y aumenta el capital', () => {
  const { filas } = cuotasDesde({ saldo: 10_000_000, tasaMensual: 1, cuotas: [{ fecha: '2026-01-10', monto: 0 }, { fecha: '2026-02-10', monto: 500_000 }] });
  assert.deepEqual(filas[0], { fecha: '2026-01-10', interes: 100_000, amortizacion: -100_000, saldo: 10_100_000 });
  assert.deepEqual(filas[1], { fecha: '2026-02-10', interes: 101_000, amortizacion: 399_000, saldo: 9_701_000 });
  // Sigue con cuotas del último monto hasta pagar el capital; la última, completa.
  assert.equal(filas.at(-1).saldo, 0);
  assert.equal(filas.at(-1).interes + filas.at(-1).amortizacion, 500_000);
  assert.ok(filas.slice(1).every((f) => f.interes + f.amortizacion === 500_000));
  assert.equal(filas.at(-1).fecha, sumarMeses('2026-02-10', filas.length - 2), 'mismo día de cada mes');
});

const tablaDe = (financiado, cuotas, tasa = 1) => ({
  precio: financiado + 1_000_000, pie: 1_000_000, fecha_pie: '2025-12-01', tasa_mensual: tasa,
  cuotas: tablaPorCuota({ monto: financiado, tasaMensual: tasa, cuota: cuotas, fechaPrimeraCuota: '2026-01-10' }).filas
    .map((f) => ({ fecha_vencimiento: f.fecha, interes: f.interes, amortizacion: f.amortizacion })),
});
const saldoFinal = (t) => t.precio - t.pie - t.cuotas.reduce((s, c) => s + c.amortizacion, 0);

test('aplazar cuotas: esos meses quedan en $0 y las siguientes se corren', () => {
  const t = tablaDe(12_000_000, 500_000);
  const n = aplazarCuotas(t, 5, 2);
  assert.deepEqual(n.cuotas.slice(0, 4), t.cuotas.slice(0, 4), 'las anteriores no cambian');
  assert.deepEqual(n.cuotas.slice(4, 6).map((c) => [c.fecha_vencimiento, c.interes + c.amortizacion]), [['2026-05-10', 0], ['2026-06-10', 0]]);
  assert.ok(n.cuotas[4].interes > 0 && n.cuotas[4].amortizacion === -n.cuotas[4].interes);
  assert.equal(n.cuotas[6].fecha_vencimiento, '2026-07-10', 'la cuota 5 pasa a julio');
  assert.equal(saldoFinal(n), 0);
  assert.ok(n.cuotas.slice(6).every((c) => c.interes + c.amortizacion === 500_000), 'mismo monto, también la última');
  assert.ok(n.cuotas.length >= t.cuotas.length + 2);
});

test('meses repactados del Excel: los saltos de fecha pasan a ser cuotas aplazadas', () => {
  const t = tablaDe(12_000_000, 500_000);
  // Como quedó la carga: se saltó marzo y abril, y la última era por el saldo.
  const conSalto = { ...t, cuotas: [...t.cuotas.slice(0, 2), ...t.cuotas.slice(2).map((c) => ({ ...c, fecha_vencimiento: sumarMeses(c.fecha_vencimiento, 2) }))] };
  const n = completarMesesRepactados(conSalto);
  assert.deepEqual(n.cuotas.slice(2, 4).map((c) => [c.fecha_vencimiento, c.interes + c.amortizacion]), [['2026-03-10', 0], ['2026-04-10', 0]]);
  assert.deepEqual(n.cuotas.slice(2, 4).map((c) => c.interes), [Math.round((12_000_000 - t.cuotas[0].amortizacion - t.cuotas[1].amortizacion) * 0.01), n.cuotas[3].interes]);
  assert.equal(saldoFinal(n), 0);
  assert.equal(completarMesesRepactados(n), null, 'ya no quedan saltos');
  assert.equal(completarMesesRepactados(t), null);
});

test('última cuota completa en una tabla guardada', () => {
  const t = tablaDe(12_000_000, 500_000);
  const parcial = { ...t, cuotas: [...t.cuotas.slice(0, -1), { ...t.cuotas.at(-1), interes: 1_000 }] };
  const ultima = parcial.cuotas.at(-1);
  parcial.cuotas[parcial.cuotas.length - 1] = { ...ultima, interes: 1_234, amortizacion: ultima.amortizacion };
  const n = ultimaCuotaCompleta(parcial);
  assert.equal(n.cuotas.at(-1).interes + n.cuotas.at(-1).amortizacion, 500_000);
  assert.equal(saldoFinal(n), 0);
  assert.equal(ultimaCuotaCompleta(n), null);
});

test('tasa anual equivalente', () => {
  assert.equal(Math.round(tasaAnualEquivalente(1) * 100) / 100, 12.68);
  assert.equal(tasaAnualEquivalente(0), 0);
});

test('fechas', () => {
  assert.equal(sumarMeses('2024-01-31', 1), '2024-02-29');
  assert.equal(sumarMeses('2026-11-15', 2), '2027-01-15');
  assert.equal(sumarMeses('2026-03-10', -3), '2025-12-10');
  assert.equal(sumarDias('2026-12-28', 5), '2027-01-02');
  assert.equal(diasEntre('2026-01-01', '2026-03-01'), 59);
  assert.ok(esFecha('2028-02-29'));
  assert.ok(!esFecha('2026-02-30'));
  assert.ok(!esFecha('11-11-2026'));
  assert.equal(fechaLarga('2026-11-11'), '11 de noviembre de 2026');
});

test('montos en palabras', () => {
  const casos = {
    0: 'cero', 1: 'uno', 16: 'dieciséis', 21: 'veintiuno', 30: 'treinta', 31: 'treinta y uno', 100: 'cien',
    101: 'ciento uno', 555: 'quinientos cincuenta y cinco', 1000: 'mil', 1001: 'mil uno', 2000: 'dos mil',
    21_000: 'veintiún mil', 100_000: 'cien mil', 901_000: 'novecientos un mil',
    1_000_000: 'un millón', 2_500_000: 'dos millones quinientos mil',
    21_350_000: 'veintiún millones trescientos cincuenta mil',
    1_234_567: 'un millón doscientos treinta y cuatro mil quinientos sesenta y siete',
    1_000_000_000: 'mil millones',
  };
  for (const [n, esperado] of Object.entries(casos)) assert.equal(numeroEnPalabras(Number(n)), esperado);
  assert.equal(montoEnPalabras(25_000_000), 'veinticinco millones de pesos');
  assert.equal(montoEnPalabras(1_000_000), 'un millón de pesos');
  assert.equal(montoEnPalabras(18_500_000), 'dieciocho millones quinientos mil pesos');
  assert.equal(montoEnPalabras(431_021), 'cuatrocientos treinta y un mil veintiún pesos');
  assert.equal(montoEnPalabras(1), 'un peso');
  assert.equal(pesos(1_234_567), '$1.234.567');
  assert.equal(pesos(0), '$0');
});

test('RUT', () => {
  assert.ok(rutValido('12.345.678-5'));
  assert.ok(rutValido('11111111-1'));
  assert.ok(rutValido('6-k'));
  assert.ok(!rutValido('12.345.678-9'));
  assert.ok(!rutValido(''));
  assert.ok(!rutValido('abc'));
  assert.equal(normalizarRut(' 12.345.678-5 '), '12345678-5');
  assert.equal(formatearRut('123456785'), '12.345.678-5');
});
