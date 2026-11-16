import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularCuota, tablaAmortizacion, numeroEnPalabras, montoEnPalabras, pesos, tasaAnualEquivalente } from '../lib/finanzas.js';
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
    // Todas las cuotas son iguales salvo la última, que absorbe el redondeo.
    assert.ok(t.filas.slice(0, -1).every((f) => f.cuota === t.cuota));
    assert.ok(Math.abs(t.filas.at(-1).cuota - t.cuota) <= n);
  }
});

test('tabla de amortización: el interés se calcula sobre el saldo insoluto', () => {
  const t = tablaAmortizacion({ monto: 10_000_000, tasaMensual: 1, nCuotas: 12, fechaPrimeraCuota: '2026-01-31' });
  assert.equal(t.filas[0].interes, 100_000);
  assert.equal(t.filas[0].amortizacion, 788_488);
  assert.equal(t.filas[1].interes, Math.round((10_000_000 - 788_488) * 0.01));
  assert.deepEqual(t.filas.slice(0, 4).map((f) => f.fecha), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
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
