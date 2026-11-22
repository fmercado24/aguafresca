import { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { api, mensajeDe } from '../api';
import { useAvisos } from '../contexto';
import { fecha, pesos, plural } from '../formato';
import type { Aplazamiento, VentaDetalle } from '../tipos';
import { AreaTexto, Boton, Campo, EntradaEntero, Modal, Selector } from '../ui';

/**
 * Aplazar cuotas de una venta: esos meses la cuota queda en $0, se carga solo el interés (que aumenta la deuda
 * de capital) y las cuotas siguientes se corren. Antes de guardar se muestra cómo queda el crédito.
 */
export function AplazarCuotas({ d, alCerrar, alGuardar }: { d: VentaDetalle; alCerrar: () => void; alGuardar: () => void }) {
  const avisos = useAvisos();
  // Se aplaza desde una cuota sin pagos (los pagos se imputan en orden, así que todas las siguientes tampoco tienen).
  const elegibles = d.cuotas.filter((c) => c.tipo === 'cuota' && c.monto > 0 && c.pagado === 0);
  const [desde, setDesde] = useState(elegibles[0]?.numero ?? 0);
  const [meses, setMeses] = useState('1');
  const [motivo, setMotivo] = useState('');
  const [vista, setVista] = useState<Aplazamiento | null>(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const n = Number(meses);
  const valido = desde > 0 && Number.isInteger(n) && n >= 1 && n <= 36;

  // Vista previa: se vuelve a calcular al cambiar la cuota o los meses.
  useEffect(() => {
    if (!valido) { setVista(null); return; }
    let vigente = true;
    const t = setTimeout(() => {
      api.post<Aplazamiento>(`/ventas/${d.venta.id}/aplazar`, { desde, meses: n, simular: true })
        .then((r) => { if (vigente) { setVista(r); setError(''); } })
        .catch((e) => { if (vigente) { setVista(null); setError(mensajeDe(e)); } });
    }, 250);
    return () => { vigente = false; clearTimeout(t); };
  }, [d.venta.id, desde, n, valido]);

  async function guardar() {
    if (!valido || !motivo.trim()) return;
    setGuardando(true);
    try {
      await api.post(`/ventas/${d.venta.id}/aplazar`, { desde, meses: n, motivo });
      avisos.ok(`${n === 1 ? 'Cuota aplazada' : `${n} cuotas aplazadas`}. El cambio quedó en el historial y se puede deshacer.`);
      alGuardar();
    } catch (err) {
      avisos.error(err);
    } finally {
      setGuardando(false);
    }
  }

  const reanuda = vista?.cuotas[desde - 1 + n];
  return (
    <Modal
      abierto alCerrar={alCerrar} titulo={`Aplazar cuotas · Parcela ${d.parcela.numero}`}
      pie={<><Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton><Boton icono={CalendarClock} cargando={guardando} disabled={!vista || !motivo.trim()} onClick={guardar}>Aplazar</Boton></>}
    >
      {elegibles.length === 0 ? (
        <p className="text-sm text-stone-600">No hay cuotas sin pagos que se puedan aplazar.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-stone-600">
            Los meses aplazados la cuota queda en <strong>$0</strong>: no se paga, se carga solo el interés del mes y ese interés <strong>aumenta la deuda de capital</strong>.
            Las cuotas siguientes se corren, con su mismo monto, y al final se agregan las que hagan falta.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Desde la cuota">
              <Selector value={desde} onChange={(e) => setDesde(Number(e.target.value))}>
                {elegibles.map((c) => <option key={c.numero} value={c.numero}>N° {c.numero} · vence {fecha(c.fecha_vencimiento)}</option>)}
              </Selector>
            </Campo>
            <Campo etiqueta="Meses que se aplazan">
              <EntradaEntero valor={meses} alCambiar={setMeses} />
            </Campo>
          </div>
          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
          {vista && (
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-800">
              <p>
                {n === 1 ? `La cuota N° ${desde} queda` : `Las cuotas N° ${desde} a N° ${desde + n - 1} quedan`} en $0 y se cargan {pesos(vista.interes_aplazado)} de interés a la deuda.
                {reanuda && <> Los pagos se retoman el {fecha(reanuda.fecha_vencimiento)}.</>}
              </p>
              <p className="mt-1">
                El crédito pasa de {plural(vista.cuotas_antes, 'cuota')} a {plural(vista.cuotas_despues, 'cuota')}
                {vista.ultima_despues && <> y termina el {fecha(vista.ultima_despues)}</>}. Total a pagar en cuotas: {pesos(vista.total_antes)} → <strong>{pesos(vista.total_despues)}</strong>.
              </p>
            </div>
          )}
          <Campo etiqueta="Motivo (queda en el historial de la venta)">
            <AreaTexto rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: el cliente pidió aplazar por cesantía; acordado con el contador." />
          </Campo>
        </div>
      )}
    </Modal>
  );
}
