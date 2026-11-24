import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { CalendarClock, CalendarX2, CircleAlert, Plus, RotateCcw, Save, Scale, Trash2, TriangleAlert, Wand2 } from 'lucide-react';
import { api, mensajeDe, useDatos } from '../api';
import { useAvisos, useSesion } from '../contexto';
import { fecha, pesos, plural, porcentaje, sumarMeses } from '../formato';
import type { Aplazamiento, Simulacion, VentaDetalle } from '../tipos';
import {
  AreaTexto, Boton, Campo, Cargando, Encabezado, Entrada, EntradaMonto, ErrorCarga, Modal, Selector, Tarjeta, Vacio, num, td, th, EntradaEntero, EntradaDecimal,
} from '../ui';

// Editor libre de la tabla de amortización (administrador y super administrador).
// Cada fila se edita a mano (vencimiento, interés, amortización); la cuota es siempre interés + amortización
// y el saldo insoluto se recalcula solo. Nada se guarda hasta confirmar el resumen de cambios.

interface Fila {
  /** Identidad estable de la fila: las originales usan su número de cuota; las nuevas, números desde 100.000. */
  clave: number;
  fecha: string;
  interes: number;
  amortizacion: number;
}

interface Estado {
  precio: number;
  pie: number;
  fechaPie: string;
  tasa: string;
  filas: Fila[];
}

const NUEVA = 100_000;

/** Cuota aplazada: monto $0; el interés del mes se suma al capital (amortización negativa). */
const esAplazada = (f: Fila) => f.interes > 0 && f.amortizacion === -f.interes;

/** Monto habitual de las cuotas (el más repetido, sin contar las aplazadas). */
function montoRegular(filas: Fila[]) {
  const cuenta = new Map<number, number>();
  for (const f of filas) { const m = f.interes + f.amortizacion; if (m > 0) cuenta.set(m, (cuenta.get(m) ?? 0) + 1); }
  return [...cuenta].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0;
}

function estadoDe(d: VentaDetalle): Estado {
  const pie = d.cuotas.find((c) => c.tipo === 'pie');
  return {
    precio: d.venta.precio,
    pie: d.venta.pie,
    fechaPie: pie?.fecha_vencimiento ?? d.venta.fecha,
    tasa: String(d.venta.tasa_mensual),
    filas: d.cuotas.filter((c) => c.tipo === 'cuota').map((c) => ({ clave: c.numero, fecha: c.fecha_vencimiento, interes: c.interes, amortizacion: c.amortizacion })),
  };
}

function calcular(e: Estado) {
  const financiado = e.precio - e.pie;
  let saldo = financiado;
  const saldos = e.filas.map((f) => (saldo -= f.amortizacion));
  const totalCuotas = e.filas.reduce((s, f) => s + f.interes + f.amortizacion, 0);
  return {
    financiado,
    saldos,
    totalCuotas,
    intereses: e.filas.reduce((s, f) => s + f.interes, 0),
    amortizado: e.filas.reduce((s, f) => s + f.amortizacion, 0),
    saldoFinal: financiado - e.filas.reduce((s, f) => s + f.amortizacion, 0),
    totalPagar: e.pie + totalCuotas,
  };
}

const diaDelMes = (iso: string, dia: number) => {
  const [a, m] = iso.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${iso.slice(0, 8)}${String(Math.min(dia, ultimo)).padStart(2, '0')}`;
};

export function EditorAmortizacion() {
  const { id } = useParams();
  return <Editor key={id} id={Number(id)} />;
}

function Editor({ id }: { id: number }) {
  const { puede } = useSesion();
  const consulta = useDatos<VentaDetalle>(`/ventas/${id}`);
  if (!puede('amortizacion')) {
    return <ErrorCarga mensaje="La tabla de amortización la modifica el administrador o el super administrador." />;
  }
  if (consulta.datos === null) return consulta.error ? <ErrorCarga mensaje={consulta.error} reintentar={consulta.recargar} /> : <Cargando />;
  if (consulta.datos.venta.estado === 'anulada') return <ErrorCarga mensaje="La venta está anulada: su tabla no se puede modificar." />;
  return <Formulario d={consulta.datos} />;
}

function Formulario({ d }: { d: VentaDetalle }) {
  const avisos = useAvisos();
  const navegar = useNavigate();
  const original = useMemo(() => estadoDe(d), [d]);
  const [e, setE] = useState<Estado>(original);
  const [revisando, setRevisando] = useState(false);
  const siguiente = useRef(NUEVA);

  const c = calcular(e);
  const c0 = useMemo(() => calcular(original), [original]);
  const pagado = d.totales.pagado;
  const porClave = useMemo(() => new Map(original.filas.map((f) => [f.clave, f])), [original]);

  // Qué cambió respecto de la tabla guardada.
  const filasModificadas = e.filas.filter((f) => {
    const o = porClave.get(f.clave);
    return o && (o.fecha !== f.fecha || o.interes !== f.interes || o.amortizacion !== f.amortizacion);
  });
  const filasNuevas = e.filas.filter((f) => !porClave.has(f.clave));
  const clavesActuales = new Set(e.filas.map((f) => f.clave));
  const filasQuitadas = original.filas.filter((f) => !clavesActuales.has(f.clave));
  const condicionesCambiadas = e.precio !== original.precio || e.pie !== original.pie || (e.pie > 0 && e.fechaPie !== original.fechaPie) || Number(e.tasa) !== Number(original.tasa);
  const ordenCambiado = !filasModificadas.length && !filasNuevas.length && !filasQuitadas.length && e.filas.some((f, i) => f.clave !== original.filas[i]?.clave);
  const hayCambios = condicionesCambiadas || filasModificadas.length > 0 || filasNuevas.length > 0 || filasQuitadas.length > 0 || ordenCambiado;

  // Si hay cambios sin guardar, el navegador pide confirmación antes de cerrar o recargar la página.
  useEffect(() => {
    if (!hayCambios) return;
    const avisar = (ev: BeforeUnloadEvent) => ev.preventDefault();
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [hayCambios]);

  // Errores que impiden guardar y advertencias que se pueden aceptar.
  const errores: string[] = [];
  const advertencias: ReactNode[] = [];
  if (e.pie > e.precio) errores.push('El pie no puede ser mayor que el precio de venta.');
  if (c.financiado > 0 && e.filas.length === 0) errores.push('Hay saldo a crédito: la tabla debe tener al menos una cuota.');
  const sinMonto = e.filas.map((f, i) => (f.interes + f.amortizacion <= 0 && !esAplazada(f) ? i + 1 : 0)).filter(Boolean);
  if (sinMonto.length) errores.push(`Cuotas con monto $0: ${sinMonto.join(', ')}. Elimínelas o asígneles un monto.`);
  const sinFecha = e.filas.map((f, i) => (!f.fecha ? i + 1 : 0)).filter(Boolean);
  if (sinFecha.length) errores.push(`Cuotas sin fecha de vencimiento: ${sinFecha.join(', ')}.`);
  if (e.pie > 0 && !e.fechaPie) errores.push('Indique la fecha del pie.');
  if (c.totalPagar < pagado) errores.push(`Los pagos ya registrados (${pesos(pagado)}) superan el total de la tabla (${pesos(c.totalPagar)}).`);
  if (c.saldoFinal !== 0 && e.filas.length > 0) {
    advertencias.push(
      <>El saldo no termina en $0: {c.saldoFinal > 0 ? `quedan ${pesos(c.saldoFinal)} de capital sin cuota que lo cubra` : `se cobran ${pesos(-c.saldoFinal)} de capital de más`}.</>,
    );
  }
  const desordenadas = e.filas.map((f, i) => (i > 0 && f.fecha && e.filas[i - 1].fecha && f.fecha <= e.filas[i - 1].fecha ? i + 1 : 0)).filter(Boolean);
  if (desordenadas.length) advertencias.push(`Vencimientos que no son posteriores a la cuota anterior: ${desordenadas.join(', ')}.`);
  if (e.pie > 0 && e.filas[0]?.fecha && e.filas[0].fecha < e.fechaPie) advertencias.push('La primera cuota vence antes que el pie.');

  // ---------- Edición ----------

  const cambiarFila = (clave: number, cambios: Partial<Fila>) =>
    setE((x) => ({ ...x, filas: x.filas.map((f) => (f.clave === clave ? { ...f, ...cambios } : f)) }));

  function quitarFila(clave: number, n: number) {
    setE((x) => ({ ...x, filas: x.filas.filter((f) => f.clave !== clave) }));
    avisos.ok(`Cuota ${n} quitada. Las siguientes se renumeran.`);
  }

  function agregarCuota() {
    const ultima = e.filas.at(-1);
    const nuevaFecha = ultima?.fecha ? sumarMeses(ultima.fecha, 1) : sumarMeses(e.pie > 0 ? e.fechaPie : d.venta.fecha, 1);
    setE((x) => ({ ...x, filas: [...x.filas, { clave: siguiente.current++, fecha: nuevaFecha, interes: 0, amortizacion: Math.max(0, c.saldoFinal) }] }));
  }

  // La última cuota se cobra completa (el monto habitual): amortiza lo que queda y el resto es interés.
  function cerrarConCuotaCompleta() {
    const ultima = e.filas.at(-1);
    const regular = montoRegular(e.filas);
    if (!ultima || !regular) return;
    const saldoAntes = c.financiado - e.filas.slice(0, -1).reduce((s, f) => s + f.amortizacion, 0);
    if (saldoAntes <= 0) return avisos.error('Antes de la última cuota ya no queda capital: quite la última cuota.');
    if (saldoAntes > regular) return avisos.error(`La última cuota no alcanza: quedan ${pesos(saldoAntes)} de capital. Agregue cuotas al final.`);
    cambiarFila(ultima.clave, { amortizacion: saldoAntes, interes: regular - saldoAntes });
    avisos.ok(`La cuota ${e.filas.length} quedó completa (${pesos(regular)}) y el saldo cierra en $0.`);
  }

  function cerrarSaldo() {
    const ultima = e.filas.at(-1);
    if (!ultima) return;
    const nueva = ultima.amortizacion + c.saldoFinal;
    if (nueva < 0) return avisos.error('La última cuota no alcanza para absorber la diferencia: ajuste las cuotas anteriores.');
    cambiarFila(ultima.clave, { amortizacion: nueva });
    avisos.ok(`La amortización de la cuota ${e.filas.length} quedó en ${pesos(nueva)} y el saldo cierra en $0.`);
  }

  async function descartar() {
    if (!hayCambios) return;
    if (await avisos.confirmar({ titulo: '¿Descartar los cambios?', mensaje: 'La tabla vuelve a como está guardada.', confirmar: 'Descartar', peligro: true })) setE(original);
  }

  async function salir() {
    if (hayCambios && !(await avisos.confirmar({ titulo: '¿Salir sin guardar?', mensaje: 'Los cambios de esta tabla se perderán.', confirmar: 'Salir sin guardar', peligro: true }))) return;
    navegar(`/ventas/${d.venta.id}`);
  }

  const marcar = (f: Fila, campo: keyof Omit<Fila, 'clave'>) => {
    const o = porClave.get(f.clave);
    return !o ? '' : o[campo] !== f[campo] ? 'bg-amber-50 ring-1 ring-amber-400' : '';
  };

  return (
    <>
      <Encabezado
        titulo="Editar tabla de amortización"
        descripcion={<>Parcela {d.parcela.numero} · {d.cliente.nombre} · venta del {fecha(d.venta.fecha)}</>}
      >
        <Boton variante="secundario" onClick={salir}>{hayCambios ? 'Cancelar' : 'Volver a la venta'}</Boton>
        <Boton variante="secundario" icono={RotateCcw} disabled={!hayCambios} onClick={descartar}>Descartar cambios</Boton>
        <Boton icono={Save} disabled={!hayCambios} onClick={() => setRevisando(true)}>Revisar y guardar</Boton>
      </Encabezado>

      <p className="mb-4 flex items-start gap-2 rounded-xl border border-marca-200 bg-marca-50 px-4 py-3 text-sm text-stone-700">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-marca-700" />
        <span>
          Nada se guarda hasta que confirme el resumen. Los pagos ya registrados ({pesos(pagado)}) se vuelven a imputar a la tabla nueva,
          de la cuota más antigua a la más nueva. Cada cambio queda en el historial de la venta y se puede deshacer.
        </span>
      </p>

      {/* Pantallas grandes: tabla a la izquierda y herramientas a la derecha. Más chicas: condiciones, herramientas y tabla,
          una debajo de otra. "contents" hace que Condiciones y Cuotas se ordenen junto a las herramientas con "order". */}
      <div className="flex flex-col gap-4 2xl:grid 2xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:items-start">
        <div className="contents 2xl:block 2xl:min-w-0 2xl:space-y-4">
          <Tarjeta titulo="Condiciones" className="order-1">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Campo etiqueta="Precio de venta">
                <EntradaMonto valor={e.precio} alCambiar={(v) => setE({ ...e, precio: v ?? 0 })} className={e.precio !== original.precio ? 'bg-amber-50' : ''} />
              </Campo>
              <Campo etiqueta="Pie">
                <EntradaMonto valor={e.pie} alCambiar={(v) => setE({ ...e, pie: v ?? 0 })} className={e.pie !== original.pie ? 'bg-amber-50' : ''} />
              </Campo>
              <Campo etiqueta="Fecha del pie">
                <Entrada type="date" disabled={e.pie === 0} value={e.pie === 0 ? '' : e.fechaPie} onChange={(ev) => setE({ ...e, fechaPie: ev.target.value })} />
              </Campo>
              <Campo etiqueta="Tasa mensual (%)" ayuda="Se muestra en la venta y en los documentos.">
                <EntradaDecimal valor={String(e.tasa)} alCambiar={(v) => setE({ ...e, tasa: v })} />
              </Campo>
            </div>
            <p className="mt-3 text-sm text-stone-600">Saldo a crédito: <strong className="tabular-nums text-stone-900">{pesos(c.financiado)}</strong></p>
          </Tarjeta>

          <Tarjeta
            className="order-3 min-w-0"
            relleno={false}
            titulo={`Cuotas (${e.filas.length})`}
            acciones={
              <>
                <Boton chico variante="secundario" icono={Plus} onClick={agregarCuota}>Agregar cuota al final</Boton>
                <Boton chico variante="secundario" icono={Scale} disabled={c.saldoFinal === 0 || !e.filas.length} onClick={cerrarSaldo}>Cerrar saldo en $0</Boton>
                <Boton chico variante="secundario" icono={Scale} disabled={!e.filas.length} onClick={cerrarConCuotaCompleta}>Última cuota completa</Boton>
              </>
            }
          >
            {e.filas.length === 0 ? (
              <Vacio titulo="La tabla no tiene cuotas">{c.financiado > 0 ? 'Agregue cuotas o use “Recalcular” para generarlas.' : 'Venta al contado: no necesita cuotas.'}</Vacio>
            ) : (
              <div className="max-h-[70dvh] overflow-auto">
                <table className="w-full border-collapse [&_tbody_tr]:border-t [&_tbody_tr]:border-stone-100">
                  <thead className="sticky top-0 z-[1] bg-white shadow-[0_1px_0_#e7e5e4]">
                    <tr>
                      <th className={th}>N°</th>
                      <th className={th}>Vencimiento</th>
                      <th className={`${th} ${num}`}>Interés</th>
                      <th className={`${th} ${num}`}>Amortización</th>
                      <th className={`${th} ${num}`}>Cuota</th>
                      <th className={`${th} ${num}`}>Saldo</th>
                      <th className={th}><span className="sr-only">Quitar</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.filas.map((f, i) => {
                      const nueva = !porClave.has(f.clave);
                      const aplazada = esAplazada(f);
                      const pagadoOriginal = d.cuotas.find((q) => q.tipo === 'cuota' && q.numero === f.clave)?.pagado ?? 0;
                      return (
                        <tr key={f.clave} className={nueva ? 'bg-green-50/60' : aplazada ? 'bg-blue-50/50' : ''}>
                          <td className={`${td} py-1.5 tabular-nums`}>
                            {i + 1}
                            {nueva && <div className="text-[10px] font-medium uppercase text-green-800">nueva</div>}
                            {!nueva && f.clave !== i + 1 && <div className="text-[10px] text-stone-500">antes {f.clave}</div>}
                          </td>
                          <td className={`${td} py-1.5`}>
                            <Entrada
                              type="date" aria-label={`Vencimiento cuota ${i + 1}`} value={f.fecha}
                              onChange={(ev) => cambiarFila(f.clave, { fecha: ev.target.value })}
                              className={`!w-40 !py-1 ${marcar(f, 'fecha')}`}
                            />
                          </td>
                          <td className={`${td} py-1.5`}>
                            <EntradaMonto
                              aria-label={`Interés cuota ${i + 1}`} valor={f.interes}
                              alCambiar={(v) => cambiarFila(f.clave, aplazada ? { interes: v ?? 0, amortizacion: -(v ?? 0) } : { interes: v ?? 0 })}
                              className={`!w-36 !py-1 text-right ${marcar(f, 'interes')}`}
                            />
                          </td>
                          <td className={`${td} py-1.5`}>
                            {aplazada ? (
                              <div className="w-36 text-right text-sm leading-tight tabular-nums text-blue-900" title="El interés de la cuota aplazada se suma a la deuda de capital">
                                −{pesos(f.interes)}<div className="text-[11px] text-blue-800/80">suma a la deuda</div>
                              </div>
                            ) : (
                              <EntradaMonto aria-label={`Amortización cuota ${i + 1}`} valor={f.amortizacion} alCambiar={(v) => cambiarFila(f.clave, { amortizacion: v ?? 0 })} className={`!w-36 !py-1 text-right ${marcar(f, 'amortizacion')}`} />
                            )}
                          </td>
                          <td className={`${td} ${num} whitespace-nowrap py-1.5 font-medium`}>
                            {aplazada ? <span className="text-blue-900">$0 · aplazada</span> : pesos(f.interes + f.amortizacion)}
                          </td>
                          <td className={`${td} ${num} whitespace-nowrap py-1.5 ${c.saldos[i] < 0 ? 'text-red-700' : ''}`}>{pesos(c.saldos[i])}</td>
                          <td className={`${td} py-1.5 text-right`}>
                            <button
                              type="button"
                              onClick={() => quitarFila(f.clave, i + 1)}
                              aria-label={`Quitar cuota ${i + 1}`}
                              title={pagadoOriginal > 0 ? 'Tiene pagos: al quitarla, esos pagos se imputan a otras cuotas' : 'Quitar cuota'}
                              className="rounded-lg p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-700"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-white shadow-[0_-1px_0_#e7e5e4]">
                    <tr className="font-semibold">
                      <td className={td} colSpan={2}>Total</td>
                      <td className={`${td} ${num}`}>{pesos(c.intereses)}</td>
                      <td className={`${td} ${num}`}>{pesos(c.amortizado)}</td>
                      <td className={`${td} ${num}`}>{pesos(c.totalCuotas)}</td>
                      <td className={`${td} ${num} ${c.saldoFinal !== 0 ? 'text-amber-800' : ''}`}>{pesos(c.saldoFinal)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Tarjeta>
        </div>

        <div className="order-2 grid grid-cols-1 items-start gap-4 md:grid-cols-2 2xl:sticky 2xl:top-6 2xl:grid-cols-1">
          <div className="md:col-span-2 2xl:col-span-1"><Validacion errores={errores} advertencias={advertencias} /></div>
          <HerramientaRecalcular e={e} setE={setE} financiado={c.financiado} nuevaClave={() => siguiente.current++} />
          <HerramientaAplazar e={e} setE={setE} nuevaClave={() => siguiente.current++} />
          <HerramientaVencimientos e={e} setE={setE} />
        </div>
      </div>

      {revisando && (
        <Revision
          d={d}
          original={original}
          e={e}
          c0={c0}
          c={c}
          errores={errores}
          advertencias={advertencias}
          modificadas={filasModificadas.map((f) => e.filas.indexOf(f) + 1)}
          nuevas={filasNuevas.length}
          quitadas={filasQuitadas.map((f) => f.clave)}
          alCerrar={() => setRevisando(false)}
          alGuardado={() => navegar(`/ventas/${d.venta.id}`, { replace: true })}
        />
      )}
    </>
  );
}

function Validacion({ errores, advertencias }: { errores: string[]; advertencias: ReactNode[] }) {
  if (!errores.length && !advertencias.length) {
    return <p className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">La tabla cuadra: el saldo termina en $0 y no hay problemas.</p>;
  }
  return (
    <div className="space-y-2">
      {errores.map((m) => (
        <p key={m} role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />{m}
        </p>
      ))}
      {advertencias.map((m, i) => (
        <p key={i} className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />{m}
        </p>
      ))}
    </div>
  );
}

// ---------- Herramientas ----------

/** Recalcula con cuota fija (sistema francés) el capital pendiente desde una cuota: renegociar tasa o plazo. */
function HerramientaRecalcular({ e, setE, financiado, nuevaClave }: { e: Estado; setE: (x: Estado) => void; financiado: number; nuevaClave: () => number }) {
  const avisos = useAvisos();
  const [desde, setDesde] = useState(1);
  const [n, setN] = useState('');
  const [tasa, setTasa] = useState(e.tasa);
  const [primera, setPrimera] = useState('');
  const [calculando, setCalculando] = useState(false);
  const desdeValido = Math.min(Math.max(1, desde), e.filas.length + 1);
  const capitalPendiente = financiado - e.filas.slice(0, desdeValido - 1).reduce((s, f) => s + f.amortizacion, 0);
  const restantes = e.filas.length - desdeValido + 1;

  async function recalcular(ev: FormEvent) {
    ev.preventDefault();
    const cuotas = Number(n || restantes);
    if (!(cuotas >= 1)) return avisos.error('Indique cuántas cuotas tendrá el saldo');
    if (capitalPendiente <= 0) return avisos.error('No queda capital pendiente desde esa cuota');
    const fechaPrimera = primera || e.filas[desdeValido - 1]?.fecha || (e.filas.at(-1) ? sumarMeses(e.filas.at(-1)!.fecha, 1) : '');
    if (!fechaPrimera) return avisos.error('Indique la fecha de la primera cuota recalculada');
    if (!(await avisos.confirmar({
      titulo: `¿Recalcular desde la cuota ${desdeValido}?`,
      mensaje: (
        <>
          Se reemplazan {restantes > 0 ? `las cuotas ${desdeValido} a ${e.filas.length}` : 'el final de la tabla'} por {plural(cuotas, 'cuota')} de monto fijo,
          al {porcentaje(Number(tasa) || 0)} mensual, sobre un capital pendiente de {pesos(capitalPendiente)}, venciendo la primera el {fecha(fechaPrimera)}.
          Todavía no se guarda: podrá revisar el resultado.
        </>
      ),
      confirmar: 'Recalcular',
    }))) return;
    setCalculando(true);
    try {
      const sim = await api.post<Simulacion>('/simular', { precio: capitalPendiente, pie: 0, n_cuotas: cuotas, tasa_mensual: Number(tasa) || 0, fecha_primera_cuota: fechaPrimera });
      const reemplazadas = e.filas.slice(desdeValido - 1);
      const nuevas = sim.filas.map((s, k) => ({ clave: reemplazadas[k]?.clave ?? nuevaClave(), fecha: s.fecha!, interes: s.interes, amortizacion: s.amortizacion }));
      setE({ ...e, tasa, filas: [...e.filas.slice(0, desdeValido - 1), ...nuevas] });
      avisos.ok(`Recalculado: ${plural(cuotas, 'cuota')} de ${pesos(sim.valor_cuota)}`);
    } catch (err) {
      avisos.error(mensajeDe(err));
    } finally {
      setCalculando(false);
    }
  }

  return (
    <Tarjeta titulo={<span className="flex items-center gap-2"><Wand2 className="size-4 text-marca-700" />Recalcular desde una cuota</span>}>
      <form onSubmit={recalcular} className="space-y-3">
        <p className="text-xs text-stone-500">Para renegociar: cambia la tasa o el número de cuotas del capital que queda, con cuota fija.</p>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Desde la cuota">
            <EntradaEntero valor={String(desdeValido)} alCambiar={(v) => setDesde(Number(v) || 1)} />
          </Campo>
          <Campo etiqueta="N° de cuotas">
            <EntradaEntero placeholder={String(Math.max(1, restantes))} valor={n} alCambiar={setN} />
          </Campo>
          <Campo etiqueta="Tasa mensual (%)">
            <EntradaDecimal valor={tasa} alCambiar={setTasa} />
          </Campo>
          <Campo etiqueta="Vence la primera">
            <Entrada type="date" value={primera || e.filas[desdeValido - 1]?.fecha || ''} onChange={(ev) => setPrimera(ev.target.value)} />
          </Campo>
        </div>
        <p className="text-sm text-stone-600">Capital pendiente: <strong className="tabular-nums text-stone-900">{pesos(capitalPendiente)}</strong></p>
        <Boton type="submit" variante="secundario" icono={Wand2} cargando={calculando} className="w-full">Recalcular</Boton>
      </form>
    </Tarjeta>
  );
}

/** Aplaza meses desde una cuota: quedan en $0, se carga solo el interés (aumenta la deuda) y las siguientes se corren. */
function HerramientaAplazar({ e, setE, nuevaClave }: { e: Estado; setE: (x: Estado) => void; nuevaClave: () => number }) {
  const avisos = useAvisos();
  const [desde, setDesde] = useState(1);
  const [meses, setMeses] = useState('1');
  const [calculando, setCalculando] = useState(false);
  const desdeValido = Math.min(Math.max(1, desde), Math.max(1, e.filas.length));

  async function aplazar(ev: FormEvent) {
    ev.preventDefault();
    const n = Number(meses);
    if (!(n >= 1 && n <= 36)) return avisos.error('Indique de 1 a 36 meses');
    setCalculando(true);
    try {
      const tabla = {
        precio: e.precio, pie: e.pie, fecha_pie: e.pie > 0 ? e.fechaPie : null, tasa_mensual: Number(e.tasa) || 0,
        cuotas: e.filas.map((f) => ({ fecha_vencimiento: f.fecha, interes: f.interes, amortizacion: f.amortizacion })),
      };
      const r = await api.post<Aplazamiento>('/tabla/aplazar', { tabla, desde: desdeValido, meses: n });
      const k = desdeValido - 1;
      const movidas = e.filas.slice(k);
      const nuevas = r.cuotas.slice(k).map((c, j) => ({
        clave: j < n ? nuevaClave() : movidas[j - n]?.clave ?? nuevaClave(),
        fecha: c.fecha_vencimiento, interes: c.interes, amortizacion: c.amortizacion,
      }));
      setE({ ...e, filas: [...e.filas.slice(0, k), ...nuevas] });
      avisos.ok(`${n === 1 ? 'Cuota aplazada' : `${n} cuotas aplazadas`}: la tabla queda de ${r.cuotas_despues} cuotas. Revise y guarde.`);
    } catch (err) {
      avisos.error(mensajeDe(err));
    } finally {
      setCalculando(false);
    }
  }

  return (
    <Tarjeta titulo={<span className="flex items-center gap-2"><CalendarX2 className="size-4 text-marca-700" />Aplazar cuotas</span>}>
      <form onSubmit={aplazar} className="space-y-3">
        <p className="text-xs text-stone-500">
          Esos meses la cuota queda en $0: se carga solo el interés, que aumenta la deuda de capital. Las cuotas siguientes se corren con su mismo monto.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Desde la cuota"><EntradaEntero valor={String(desdeValido)} alCambiar={(v) => setDesde(Number(v) || 1)} /></Campo>
          <Campo etiqueta="Meses"><EntradaEntero valor={meses} alCambiar={setMeses} /></Campo>
        </div>
        <Boton type="submit" variante="secundario" icono={CalendarX2} cargando={calculando} disabled={!e.filas.length} className="w-full">Aplazar</Boton>
      </form>
    </Tarjeta>
  );
}

/** Posterga los vencimientos o cambia el día de pago desde una cuota en adelante. */
function HerramientaVencimientos({ e, setE }: { e: Estado; setE: (x: Estado) => void }) {
  const avisos = useAvisos();
  const [desde, setDesde] = useState(1);
  const [meses, setMeses] = useState('0');
  const [dia, setDia] = useState('');

  async function aplicar(ev: FormEvent) {
    ev.preventDefault();
    const m = Number(meses) || 0;
    const nuevoDia = dia ? Number(dia) : null;
    if (!m && !nuevoDia) return avisos.error('Indique cuántos meses correr los vencimientos o el nuevo día de pago');
    if (nuevoDia !== null && !(nuevoDia >= 1 && nuevoDia <= 31)) return avisos.error('El día de pago debe estar entre 1 y 31');
    const inicio = Math.min(Math.max(1, desde), e.filas.length);
    const descripcion = [m ? `${m > 0 ? 'postergar' : 'adelantar'} ${plural(Math.abs(m), 'mes', 'meses')}` : '', nuevoDia ? `pasar al día ${nuevoDia} de cada mes` : ''].filter(Boolean).join(' y ');
    if (!(await avisos.confirmar({
      titulo: 'Mover vencimientos',
      mensaje: `Se van a ${descripcion} los vencimientos de las cuotas ${inicio} a ${e.filas.length}. Todavía no se guarda.`,
      confirmar: 'Mover vencimientos',
    }))) return;
    setE({
      ...e,
      filas: e.filas.map((f, i) => {
        if (i < inicio - 1 || !f.fecha) return f;
        let nueva = m ? sumarMeses(f.fecha, m) : f.fecha;
        if (nuevoDia) nueva = diaDelMes(nueva, nuevoDia);
        return { ...f, fecha: nueva };
      }),
    });
  }

  if (!e.filas.length) return null;
  return (
    <Tarjeta titulo={<span className="flex items-center gap-2"><CalendarClock className="size-4 text-marca-700" />Mover vencimientos</span>}>
      <form onSubmit={aplicar} className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <Campo etiqueta="Desde la cuota">
            <EntradaEntero valor={String(desde)} alCambiar={(v) => setDesde(Number(v) || 1)} />
          </Campo>
          <Campo etiqueta="Correr meses">
            <EntradaEntero negativos valor={meses} alCambiar={setMeses} />
          </Campo>
          <Campo etiqueta="Nuevo día">
            <Selector value={dia} onChange={(ev) => setDia(ev.target.value)}>
              <option value="">Igual</option>
              {Array.from({ length: 31 }, (_, k) => <option key={k + 1} value={k + 1}>{k + 1}</option>)}
            </Selector>
          </Campo>
        </div>
        <Boton type="submit" variante="secundario" icono={CalendarClock} className="w-full">Aplicar</Boton>
      </form>
    </Tarjeta>
  );
}

// ---------- Revisión final ----------

function Revision({ d, original, e, c0, c, errores, advertencias, modificadas, nuevas, quitadas, alCerrar, alGuardado }: {
  d: VentaDetalle;
  original: Estado;
  e: Estado;
  c0: ReturnType<typeof calcular>;
  c: ReturnType<typeof calcular>;
  errores: string[];
  advertencias: ReactNode[];
  modificadas: number[];
  nuevas: number;
  quitadas: number[];
  alCerrar: () => void;
  alGuardado: () => void;
}) {
  const avisos = useAvisos();
  const idForm = useId();
  const [motivo, setMotivo] = useState('');
  const [aceptaAdvertencias, setAceptaAdvertencias] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const filas: [string, string, string][] = [
    ['Precio de venta', pesos(original.precio), pesos(e.precio)],
    ['Pie', pesos(original.pie), pesos(e.pie)],
    ['Saldo a crédito', pesos(c0.financiado), pesos(c.financiado)],
    ['Número de cuotas', String(original.filas.length), String(e.filas.length)],
    ['Tasa mensual', porcentaje(Number(original.tasa)), porcentaje(Number(e.tasa) || 0)],
    ['Total de intereses', pesos(c0.intereses), pesos(c.intereses)],
    ['Total a pagar (pie + cuotas)', pesos(c0.totalPagar), pesos(c.totalPagar)],
    ['Saldo final', pesos(c0.saldoFinal), pesos(c.saldoFinal)],
  ];

  async function guardar(ev: FormEvent) {
    ev.preventDefault();
    setGuardando(true);
    try {
      await api.put(`/ventas/${d.venta.id}/amortizacion`, {
        precio: e.precio,
        pie: e.pie,
        fecha_pie: e.pie > 0 ? e.fechaPie : null,
        tasa_mensual: Number(e.tasa) || 0,
        cuotas: e.filas.map((f) => ({ fecha_vencimiento: f.fecha, interes: f.interes, amortizacion: f.amortizacion })),
        motivo,
      });
      avisos.ok('Tabla guardada. Si fue un error, puede deshacerla desde “Historial de cambios” de la venta.');
      alGuardado();
    } catch (err) {
      avisos.error(err);
      setGuardando(false);
    }
  }

  const bloqueado = errores.length > 0 || (advertencias.length > 0 && !aceptaAdvertencias);

  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      ancho="lg"
      titulo="Confirmar cambios en la tabla de amortización"
      pie={
        <>
          <Boton variante="secundario" onClick={alCerrar}>Volver a editar</Boton>
          <Boton type="submit" form={idForm} icono={Save} cargando={guardando} disabled={bloqueado}>Guardar cambios</Boton>
        </>
      }
    >
      <form id={idForm} onSubmit={guardar} className="space-y-4">
        <p className="text-sm text-stone-600">Parcela {d.parcela.numero} · {d.cliente.nombre}</p>
        <div className="overflow-x-auto rounded-lg border border-stone-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-50 text-left text-xs text-stone-500">
                <th className="px-3 py-2 font-medium">Concepto</th>
                <th className="px-3 py-2 text-right font-medium">Antes</th>
                <th className="px-3 py-2 text-right font-medium">Después</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(([concepto, antes, despues]) => (
                <tr key={concepto} className={`border-t border-stone-100 ${antes !== despues ? 'bg-amber-50/70' : ''}`}>
                  <td className="px-3 py-1.5 text-stone-700">{concepto}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-stone-500">{antes}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${antes !== despues ? 'font-semibold text-stone-900' : 'text-stone-700'}`}>{despues}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm text-stone-700">
          {modificadas.length > 0 && <li>Cuotas modificadas: {modificadas.length > 20 ? `${modificadas.length} cuotas` : modificadas.join(', ')}.</li>}
          {nuevas > 0 && <li>{plural(nuevas, 'cuota nueva', 'cuotas nuevas')}.</li>}
          {quitadas.length > 0 && <li>Cuotas quitadas (numeración anterior): {quitadas.join(', ')}.</li>}
          <li>Los pagos registrados ({pesos(d.totales.pagado)}) se vuelven a imputar a la tabla nueva.</li>
        </ul>
        {errores.length > 0 && <Validacion errores={errores} advertencias={[]} />}
        {advertencias.length > 0 && errores.length === 0 && (
          <div className="space-y-2">
            <Validacion errores={[]} advertencias={advertencias} />
            <label className="flex items-start gap-2 text-sm text-stone-800">
              <input type="checkbox" className="mt-0.5 size-4 accent-marca-600" checked={aceptaAdvertencias} onChange={(ev) => setAceptaAdvertencias(ev.target.checked)} />
              Revisé las advertencias y quiero guardar la tabla de todas formas.
            </label>
          </div>
        )}
        <Campo etiqueta="Motivo del cambio (queda registrado en el historial)">
          <AreaTexto required rows={2} maxLength={500} value={motivo} onChange={(ev) => setMotivo(ev.target.value)} placeholder="Ej.: renegociación acordada con el cliente el 15-11; corrección de tasa…" />
        </Campo>
      </form>
    </Modal>
  );
}
