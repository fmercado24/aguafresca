import { useEffect, useState } from 'react';
import { api, mensajeDe } from '../api';
import { fecha, numero, pesos, porcentaje } from '../formato';
import type { FilaAmortizacion, Simulacion } from '../tipos';
import { Campo, Entrada, EntradaMonto, Tabla, num, td, th } from '../ui';

// Piezas compartidas por los formularios de cotización y de venta: condiciones del crédito,
// simulación en vivo (la calcula el servidor, única fuente de la fórmula) y tabla de amortización.

export interface Condiciones {
  pie: number | null;
  n_cuotas: string;
  tasa_mensual: string;
  fecha_primera_cuota: string;
}

export function useSimulacion(precio: number | null, c: Condiciones) {
  const [sim, setSim] = useState<Simulacion | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!precio) {
      setSim(null);
      setError(null);
      return;
    }
    let vigente = true;
    const espera = setTimeout(() => {
      api.post<Simulacion>('/simular', {
        precio,
        pie: c.pie ?? 0,
        n_cuotas: c.n_cuotas || 0,
        tasa_mensual: c.tasa_mensual || 0,
        fecha_primera_cuota: c.fecha_primera_cuota || null,
      }).then(
        (s) => vigente && (setSim(s), setError(null)),
        (e) => vigente && setError(mensajeDe(e)),
      );
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [precio, c.pie, c.n_cuotas, c.tasa_mensual, c.fecha_primera_cuota]);

  return { sim, error };
}

export function CamposCredito({ precio, valor, alCambiar }: { precio: number | null; valor: Condiciones; alCambiar: (c: Condiciones) => void }) {
  const cambiar = <K extends keyof Condiciones>(k: K, v: Condiciones[K]) => alCambiar({ ...valor, [k]: v });
  const fraccionPie = precio && valor.pie !== null ? (valor.pie / precio) * 100 : null;
  const tasa = Number(valor.tasa_mensual) || 0;
  const alContado = !!precio && valor.pie === precio;

  return (
    <div className="grid grid-cols-2 gap-3">
      <Campo
        etiqueta="Pie"
        className="col-span-2 sm:col-span-1"
        ayuda={
          <span className="flex flex-wrap items-center gap-1.5">
            {fraccionPie !== null && <span className="mr-1">{numero(fraccionPie, 1)} % del precio.</span>}
            {precio ? [10, 20, 30, 100].map((p) => (
              <button
                key={p} type="button"
                onClick={() => cambiar('pie', Math.round((precio * p) / 100))}
                className="rounded-md border border-stone-300 bg-white px-1.5 py-0.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
              >
                {p === 100 ? 'Contado' : `${p} %`}
              </button>
            )) : null}
          </span>
        }
      >
        <EntradaMonto valor={valor.pie} alCambiar={(v) => cambiar('pie', v)} />
      </Campo>
      <Campo etiqueta="Número de cuotas mensuales" className="col-span-2 sm:col-span-1">
        <Entrada type="number" inputMode="numeric" min={0} max={360} step={1} disabled={alContado} value={alContado ? '' : valor.n_cuotas} onChange={(e) => cambiar('n_cuotas', e.target.value)} />
      </Campo>
      <Campo etiqueta="Interés mensual (%)" ayuda={tasa > 0 ? `Equivale a ${porcentaje((Math.pow(1 + tasa / 100, 12) - 1) * 100)} anual.` : 'Sin interés.'}>
        <Entrada type="number" inputMode="decimal" min={0} max={15} step="0.01" disabled={alContado} value={alContado ? '' : valor.tasa_mensual} onChange={(e) => cambiar('tasa_mensual', e.target.value)} />
      </Campo>
      <Campo etiqueta="Vence la primera cuota">
        <Entrada type="date" disabled={alContado} value={alContado ? '' : valor.fecha_primera_cuota} onChange={(e) => cambiar('fecha_primera_cuota', e.target.value)} />
      </Campo>
    </div>
  );
}

export function TablaAmortizacion({ filas, montoFinanciado }: { filas: FilaAmortizacion[]; montoFinanciado: number }) {
  return (
    <Tabla>
      <thead>
        <tr>
          <th className={th}>N°</th>
          <th className={th}>Vencimiento</th>
          <th className={`${th} ${num}`}>Cuota</th>
          <th className={`${th} ${num}`}>Interés</th>
          <th className={`${th} ${num}`}>Amortización</th>
          <th className={`${th} ${num}`}>Saldo</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.numero}>
            <td className={`${td} py-1.5`}>{f.numero}</td>
            <td className={`${td} whitespace-nowrap py-1.5`}>{fecha(f.fecha)}</td>
            <td className={`${td} ${num} py-1.5 font-medium`}>{pesos(f.cuota)}</td>
            <td className={`${td} ${num} py-1.5`}>{pesos(f.interes)}</td>
            <td className={`${td} ${num} py-1.5`}>{pesos(f.amortizacion)}</td>
            <td className={`${td} ${num} py-1.5`}>{pesos(f.saldo)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="font-semibold">
          <td className={td} colSpan={2}>Total</td>
          <td className={`${td} ${num}`}>{pesos(filas.reduce((s, f) => s + f.cuota, 0))}</td>
          <td className={`${td} ${num}`}>{pesos(filas.reduce((s, f) => s + f.interes, 0))}</td>
          <td className={`${td} ${num}`}>{pesos(montoFinanciado)}</td>
          <td />
        </tr>
      </tfoot>
    </Tabla>
  );
}

/** Resultado de la simulación: cuota destacada, totales y tabla de amortización desplegable. */
export function ResumenSimulacion({ sim, error }: { sim: Simulacion | null; error: string | null }) {
  if (error) return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p>;
  if (!sim) return <p className="text-sm text-stone-500">Seleccione una parcela e indique las condiciones para ver la simulación.</p>;

  const contado = sim.monto_financiado === 0;
  const linea = (etiqueta: string, valor: string, fuerte = false) => (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="text-sm text-stone-600">{etiqueta}</dt>
      <dd className={`tabular-nums ${fuerte ? 'text-base font-semibold text-stone-900' : 'text-sm text-stone-900'}`}>{valor}</dd>
    </div>
  );

  return (
    <div>
      <div className="rounded-lg bg-marca-50 px-4 py-3">
        <div className="text-xs font-medium text-marca-800">{contado ? 'Pago al contado' : `${sim.n_cuotas} cuotas mensuales de`}</div>
        <div className="text-2xl font-semibold tracking-tight text-stone-900">{pesos(contado ? sim.precio : sim.valor_cuota)}</div>
      </div>
      <dl className="mt-3 divide-y divide-stone-100">
        {linea('Precio de venta', pesos(sim.precio))}
        {!contado && linea('Pie', pesos(sim.pie))}
        {!contado && linea('Saldo a crédito', pesos(sim.monto_financiado))}
        {!contado && linea(`Intereses (${porcentaje(sim.tasa_mensual)} mensual)`, pesos(sim.total_intereses))}
        {!contado && linea('Total a pagar', pesos(sim.total_operacion), true)}
      </dl>
      {sim.filas.length > 0 && (
        <details className="mt-3 rounded-lg border border-stone-200">
          <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-marca-700">Ver tabla de amortización</summary>
          <div className="max-h-80 overflow-y-auto border-t border-stone-200">
            <TablaAmortizacion filas={sim.filas} montoFinanciado={sim.monto_financiado} />
          </div>
        </details>
      )}
    </div>
  );
}
