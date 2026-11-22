import { useParams } from 'react-router';
import { Printer } from 'lucide-react';
import { useDatos } from '../api';
import { Membrete } from '../componentes/Membrete';
import { PieFirma } from '../componentes/PieFirma';
import { MEDIOS_PAGO, fecha, fechaLarga, formatearRut, pesos, plural } from '../formato';
import type { Recibo } from '../tipos';
import { Boton, Carga, Encabezado } from '../ui';

/** Cuántas cuotas quedan por pagar y de cuál a cuál (lo que el cliente quiere saber al pagar). */
function textoPendientes(p: Recibo['pendientes']) {
  const partes: string[] = [];
  if (p.n === 0) {
    partes.push(p.pie_pendiente > 0 ? 'No quedan cuotas pendientes.' : 'A la fecha de emisión no quedan cuotas pendientes: la parcela está totalmente pagada.');
  } else {
    const rango = p.n === 1 || p.desde === p.hasta ? `la N° ${p.desde}` : `de la N° ${p.desde} a la N° ${p.hasta}`;
    partes.push(`Quedan ${plural(p.n, 'cuota pendiente', 'cuotas pendientes')}: ${rango}${p.aplazadas > 0 ? ` (sin contar ${plural(p.aplazadas, 'cuota aplazada', 'cuotas aplazadas')})` : ''}.`);
    if (p.saldo_primera) partes.push(`La cuota N° ${p.desde} tiene un abono y le faltan ${pesos(p.saldo_primera)}.`);
  }
  if (p.pie_pendiente > 0) partes.push(`Queda pendiente ${pesos(p.pie_pendiente)} del pie.`);
  return partes.join(' ');
}

/** Comprobante imprimible de un pago recibido. */
export function ReciboPagina() {
  const { id } = useParams();
  const consulta = useDatos<Recibo>(`/pagos/${id}`);

  return (
    <Carga consulta={consulta}>
      {(r) => {
        const total = r.pago.monto + r.pago.mora;
        const celda = 'border border-stone-300 px-2 py-1';
        return (
          <>
            <Encabezado volver={{ a: `/ventas/${r.venta.id}`, texto: `Venta parcela ${r.parcela.numero}` }} titulo={`Comprobante de pago N° ${r.pago.id}`}>
              <Boton icono={Printer} onClick={() => window.print()}>Imprimir o guardar PDF</Boton>
            </Encabezado>

            <div className="hoja mx-auto max-w-3xl rounded-xl border border-stone-200 bg-white p-6 text-stone-900 shadow-sm sm:p-10">
              <Membrete titulo="Comprobante de pago" subtitulo={`N° ${r.pago.id}`} />

              {r.pago.anulado ? (
                <p className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
                  PAGO ANULADO{r.pago.motivo_anulacion ? `: ${r.pago.motivo_anulacion}` : ''}
                </p>
              ) : null}

              <div className="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
                <div><span className="text-stone-600">Fecha de pago:</span> {fechaLarga(r.pago.fecha)}</div>
                <div><span className="text-stone-600">Medio de pago:</span> {MEDIOS_PAGO[r.pago.medio] ?? r.pago.medio}{r.pago.comprobante ? ` · ${r.pago.comprobante}` : ''}</div>
                <div><span className="text-stone-600">Recibido de:</span> {r.cliente.nombre}</div>
                <div><span className="text-stone-600">RUT:</span> {formatearRut(r.cliente.rut) || '—'}</div>
                <div><span className="text-stone-600">Por concepto de:</span> Parcela N° {r.parcela.numero}</div>
                <div><span className="text-stone-600">Venta del:</span> {fecha(r.venta.fecha)}</div>
              </div>

              <div className="mt-5 overflow-x-auto print:overflow-visible">
              <table className="w-full border-collapse text-sm tabular-nums">
                <thead>
                  <tr className="bg-stone-100 text-left">
                    <th className={celda}>Detalle</th>
                    <th className={celda}>Vencimiento</th>
                    <th className={`${celda} text-right`}>Valor cuota</th>
                    <th className={`${celda} text-right`}>Monto imputado</th>
                  </tr>
                </thead>
                <tbody>
                  {r.imputaciones.map((i) => (
                    <tr key={i.numero}>
                      <td className={celda}>
                        {i.tipo === 'pie' ? 'Pie' : `Cuota N° ${i.numero}`}
                        {i.monto < i.monto_cuota ? ' (abono)' : ''}
                      </td>
                      <td className={celda}>{fecha(i.fecha_vencimiento)}</td>
                      <td className={`${celda} text-right`}>{pesos(i.monto_cuota)}</td>
                      <td className={`${celda} text-right`}>{pesos(i.monto)}</td>
                    </tr>
                  ))}
                  {r.pago.mora > 0 && (
                    <tr>
                      <td className={celda} colSpan={3}>Interés por mora</td>
                      <td className={`${celda} text-right`}>{pesos(r.pago.mora)}</td>
                    </tr>
                  )}
                  <tr className="font-semibold">
                    <td className={celda} colSpan={3}>Total pagado</td>
                    <td className={`${celda} text-right`}>{pesos(total)}</td>
                  </tr>
                </tbody>
              </table>
              </div>

              {r.pago.observacion && <p className="mt-3 text-sm text-stone-700">Observación: {r.pago.observacion}</p>}
              <p className="mt-3 rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm font-medium text-stone-900">{textoPendientes(r.pendientes)}</p>

              <PieFirma className="mt-12" extra={r.pago.usuario && <div className="mt-1 text-xs text-stone-500">Registrado por {r.pago.usuario}</div>} />
            </div>
          </>
        );
      }}
    </Carga>
  );
}
