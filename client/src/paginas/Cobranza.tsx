import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Banknote, CircleCheck, Download, FileText, NotebookPen, Phone } from 'lucide-react';
import { useDatos } from '../api';
import { useConfig } from '../contexto';
import { FormularioGestion, TIPOS_GESTION } from '../componentes/FormularioGestion';
import { GraficoFlujo } from '../componentes/GraficoFlujo';
import { MEDIOS_PAGO, descargarCsv, fecha, formatearRut, mesLargo, pesos, plural, porcentaje } from '../formato';
import type { Atrasadas, CuotaConContexto, Deudor, Flujo, PagoRecibido } from '../tipos';
import {
  Boton, Campo, Carga, Dato, Encabezado, EnlaceBoton, Entrada, InsigniaCuota, Pestanas, Selector, Tabla, Tarjeta, Vacio, num, td, th,
} from '../ui';

type Vista = 'atrasadas' | 'pendientes' | 'flujo' | 'pagos';

const nombreCuota = (c: { tipo: 'pie' | 'cuota'; numero: number }) => (c.tipo === 'pie' ? 'Pie' : `N° ${c.numero}`);

export function Cobranza() {
  const [params, setParams] = useSearchParams();
  const vista = (['atrasadas', 'pendientes', 'flujo', 'pagos'] as Vista[]).find((v) => v === params.get('vista')) ?? 'atrasadas';

  return (
    <>
      <Encabezado titulo="Cobranza" descripcion="Cuotas atrasadas y pendientes, ingresos futuros y pagos recibidos." />
      <Pestanas
        activa={vista}
        alCambiar={(v) => setParams(v === 'atrasadas' ? {} : { vista: v }, { replace: true })}
        opciones={[
          { id: 'atrasadas', etiqueta: 'Cuotas atrasadas' },
          { id: 'pendientes', etiqueta: 'Cuotas pendientes' },
          { id: 'flujo', etiqueta: 'Flujo de ingresos' },
          { id: 'pagos', etiqueta: 'Pagos recibidos' },
        ]}
      />
      {vista === 'atrasadas' && <VistaAtrasadas />}
      {vista === 'pendientes' && <VistaPendientes />}
      {vista === 'flujo' && <VistaFlujo />}
      {vista === 'pagos' && <VistaPagos />}
    </>
  );
}

// ---------- Cuotas atrasadas, por deudor ----------

function VistaAtrasadas() {
  const consulta = useDatos<Atrasadas>('/cobranza/atrasadas');
  const [gestion, setGestion] = useState<Deudor | null>(null);

  return (
    <Carga consulta={consulta}>
      {(a) =>
        a.deudores.length === 0 ? (
          <Tarjeta><Vacio icono={CircleCheck} titulo="No hay cuotas atrasadas">Toda la cartera está al día.</Vacio></Tarjeta>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Dato etiqueta="Total atrasado" valor={pesos(a.total.monto)} detalle={plural(a.total.n_cuotas, 'cuota')} />
              <Dato
                etiqueta="Interés por mora estimado"
                valor={pesos(a.total.mora_estimada)}
                detalle={a.tasa_mora_mensual > 0 ? `${porcentaje(a.tasa_mora_mensual)} mensual, a hoy` : 'Sin tasa de mora configurada'}
              />
              <Dato etiqueta="Deudores con atraso" valor={a.total.n_deudores} />
              <Dato etiqueta="Mayor atraso" valor={`${a.deudores[0].dias_atraso} días`} detalle={a.deudores[0].cliente} />
            </div>

            <Tarjeta titulo="Antigüedad de la deuda atrasada">
              <Antiguedad tramos={a.tramos} />
            </Tarjeta>

            <Tarjeta
              titulo="Deudores"
              relleno={false}
              acciones={
                <Boton
                  chico variante="secundario" icono={Download}
                  onClick={() => descargarCsv('cuotas-atrasadas.csv',
                    ['Cliente', 'RUT', 'Teléfono', 'Correo', 'Parcela', 'Cuota', 'Vencimiento', 'Días de atraso', 'Saldo', 'Mora estimada'],
                    a.deudores.flatMap((d) => d.cuotas.map((c) => [d.cliente, formatearRut(d.rut), d.telefono, d.email, d.parcela, nombreCuota(c), c.fecha_vencimiento, c.dias_atraso, c.saldo, c.mora_estimada])))}
                >
                  Excel
                </Boton>
              }
            >
              <Tabla>
                <thead>
                  <tr>
                    <th className={th}>Deudor</th>
                    <th className={`${th} hidden sm:table-cell`}>Cuotas</th>
                    <th className={`${th} ${num}`}>Atrasado</th>
                    <th className={`${th} ${num}`}>Días</th>
                    <th className={`${th} ${num} hidden lg:table-cell`}>Mora est.</th>
                    <th className={`${th} hidden xl:table-cell`}>Última gestión</th>
                    <th className={th}><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {a.deudores.map((d) => (
                    <tr key={d.venta_id} className="align-top">
                      <td className={td}>
                        <Link to={`/clientes/${d.cliente_id}`} className="font-medium text-stone-900 hover:text-marca-700 hover:underline">{d.cliente}</Link>
                        <div className="flex flex-wrap items-center gap-x-2 text-xs text-stone-500">
                          <Link to={`/ventas/${d.venta_id}`} className="hover:underline">Parcela {d.parcela}</Link>
                          {d.telefono && <a href={`tel:${d.telefono.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 text-marca-700 hover:underline"><Phone className="size-3" />{d.telefono}</a>}
                        </div>
                      </td>
                      <td className={`${td} hidden sm:table-cell`}>
                        {d.n_cuotas} <span className="text-xs text-stone-500">({d.cuotas.slice(0, 4).map(nombreCuota).join(', ')}{d.cuotas.length > 4 ? '…' : ''})</span>
                      </td>
                      <td className={`${td} ${num} font-medium`}>{pesos(d.monto)}</td>
                      <td className={`${td} ${num}`}>{d.dias_atraso}</td>
                      <td className={`${td} ${num} hidden lg:table-cell`}>{pesos(d.mora_estimada)}</td>
                      <td className={`${td} hidden max-w-64 xl:table-cell`}>
                        {d.ultima_gestion ? (
                          <>
                            <div className="text-xs text-stone-500">{fecha(d.ultima_gestion.fecha)} · {TIPOS_GESTION[d.ultima_gestion.tipo] ?? d.ultima_gestion.tipo}</div>
                            <div className="line-clamp-2 text-xs text-stone-700">{d.ultima_gestion.detalle}</div>
                          </>
                        ) : <span className="text-xs text-stone-400">Sin gestiones</span>}
                      </td>
                      <td className={`${td} text-right`}>
                        <div className="flex flex-wrap justify-end gap-1">
                          <Boton chico variante="secundario" icono={NotebookPen} onClick={() => setGestion(d)}>Gestión</Boton>
                          <EnlaceBoton chico variante="secundario" icono={FileText} to={`/documentos/nuevo?tipo=carta_cobranza&venta=${d.venta_id}`}>Carta</EnlaceBoton>
                          <EnlaceBoton chico icono={Banknote} to={`/ventas/${d.venta_id}?pago=1`}>Pago</EnlaceBoton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            </Tarjeta>

            {gestion && (
              <FormularioGestion
                clienteId={gestion.cliente_id} nombre={gestion.cliente} ventaId={gestion.venta_id}
                alCerrar={() => setGestion(null)}
                alGuardar={() => { setGestion(null); consulta.recargar(); }}
              />
            )}
          </div>
        )
      }
    </Carga>
  );
}

/** Barras horizontales de un solo color: monto atrasado por tramo de antigüedad, con el valor al final de cada barra. */
function Antiguedad({ tramos }: { tramos: Atrasadas['tramos'] }) {
  const maximo = Math.max(1, ...tramos.map((t) => t.monto));
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 text-sm">
      {tramos.map((t) => (
        <div key={t.tramo} className="contents">
          <div className="whitespace-nowrap text-stone-600">{t.tramo}</div>
          <div className="h-2.5" title={`${t.tramo}: ${pesos(t.monto)}`}>
            <div className="h-full rounded-r" style={{ width: `${(t.monto / maximo) * 100}%`, minWidth: t.monto > 0 ? 2 : 0, background: 'var(--viz-serie-1)' }} />
          </div>
          <div className="whitespace-nowrap text-right tabular-nums">
            <span className="font-medium text-stone-900">{pesos(t.monto)}</span>
            <span className="ml-2 hidden text-xs text-stone-500 sm:inline">{plural(t.n, 'cuota')}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Cuotas pendientes (por vencer y atrasadas) ----------

function VistaPendientes() {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [estado, setEstado] = useState<'todas' | 'por_vencer' | 'atrasadas'>('todas');
  const consulta = useDatos<CuotaConContexto[]>(`/cobranza/pendientes?desde=${desde}&hasta=${hasta}`);

  const filtradas = useMemo(
    () => (consulta.datos ?? []).filter((c) => estado === 'todas' || (estado === 'atrasadas' ? c.estado === 'atrasada' : c.estado !== 'atrasada')),
    [consulta.datos, estado],
  );
  const total = filtradas.reduce((s, c) => s + c.saldo, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Campo etiqueta="Vencen desde"><Entrada type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></Campo>
        <Campo etiqueta="Hasta"><Entrada type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></Campo>
        <Campo etiqueta="Situación">
          <Selector value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)}>
            <option value="todas">Todas</option>
            <option value="por_vencer">Por vencer</option>
            <option value="atrasadas">Atrasadas</option>
          </Selector>
        </Campo>
        <Boton
          variante="secundario" icono={Download} className="ml-auto"
          onClick={() => descargarCsv('cuotas-pendientes.csv',
            ['Vencimiento', 'Cliente', 'RUT', 'Parcela', 'Cuota', 'Monto', 'Pagado', 'Saldo', 'Situación', 'Días de atraso'],
            filtradas.map((c) => [c.fecha_vencimiento, c.cliente, formatearRut(c.rut), c.parcela, nombreCuota(c), c.monto, c.pagado, c.saldo, c.estado, c.dias_atraso]))}
        >
          Excel
        </Boton>
      </div>

      <Carga consulta={consulta}>
        {() => (
          <Tarjeta titulo={`${plural(filtradas.length, 'cuota')} · ${pesos(total)} por cobrar`} relleno={false}>
            {filtradas.length === 0 ? <Vacio titulo="No hay cuotas pendientes con ese filtro" /> : (
              <div className="max-h-[70dvh] overflow-y-auto">
                <Tabla>
                  <thead className="sticky top-0 bg-white">
                    <tr>
                      <th className={th}>Vencimiento</th>
                      <th className={th}>Cliente</th>
                      <th className={`${th} hidden sm:table-cell`}>Parcela</th>
                      <th className={`${th} hidden sm:table-cell`}>Cuota</th>
                      <th className={`${th} ${num} hidden md:table-cell`}>Monto</th>
                      <th className={`${th} ${num}`}>Saldo</th>
                      <th className={th}>Situación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtradas.map((c) => (
                      <tr key={c.id}>
                        <td className={`${td} whitespace-nowrap py-2`}>{fecha(c.fecha_vencimiento)}</td>
                        <td className={`${td} py-2`}>
                          <Link to={`/ventas/${c.venta_id}`} className="font-medium text-stone-900 hover:text-marca-700 hover:underline">{c.cliente}</Link>
                          <div className="text-xs text-stone-500 sm:hidden">Parcela {c.parcela} · {nombreCuota(c)}</div>
                        </td>
                        <td className={`${td} hidden py-2 sm:table-cell`}>{c.parcela}</td>
                        <td className={`${td} hidden py-2 sm:table-cell`}>{nombreCuota(c)}</td>
                        <td className={`${td} ${num} hidden py-2 md:table-cell`}>{pesos(c.monto)}</td>
                        <td className={`${td} ${num} py-2 font-medium`}>{pesos(c.saldo)}</td>
                        <td className={`${td} py-2`}><InsigniaCuota estado={c.estado} dias={c.dias_atraso} /></td>
                      </tr>
                    ))}
                  </tbody>
                </Tabla>
              </div>
            )}
          </Tarjeta>
        )}
      </Carga>
    </div>
  );
}

// ---------- Flujo de ingresos a futuro ----------

function VistaFlujo() {
  const consulta = useDatos<Flujo>('/cobranza/flujo');
  const [horizonte, setHorizonte] = useState(24);

  return (
    <Carga consulta={consulta}>
      {(f) => {
        const meses = horizonte ? f.meses.slice(0, horizonte) : f.meses;
        const suma = (k: 'capital' | 'interes' | 'total') => meses.reduce((s, m) => s + m[k], 0);
        const despues = f.meses.slice(meses.length).reduce((s, m) => s + m.total, 0);
        let acumulado = 0;
        return (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <Campo etiqueta="Período">
                <Selector value={horizonte} onChange={(e) => setHorizonte(Number(e.target.value))}>
                  <option value={12}>Próximos 12 meses</option>
                  <option value={24}>Próximos 24 meses</option>
                  <option value={36}>Próximos 36 meses</option>
                  <option value={0}>Hasta la última cuota</option>
                </Selector>
              </Campo>
              <Boton
                variante="secundario" icono={Download} className="ml-auto"
                onClick={() => descargarCsv('flujo-de-ingresos.csv', ['Mes', 'Cuotas', 'Capital', 'Interés', 'Total'], meses.map((m) => [m.mes, m.n, m.capital, m.interes, m.total]))}
              >
                Excel
              </Boton>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Dato etiqueta="Ingresos esperados en el período" valor={pesos(suma('total'))} detalle={`${plural(meses.reduce((s, m) => s + m.n, 0), 'cuota')} por vencer`} />
              <Dato etiqueta="Capital" valor={pesos(suma('capital'))} />
              <Dato etiqueta="Intereses" valor={pesos(suma('interes'))} />
              <Dato
                etiqueta="Atrasado por recuperar"
                valor={pesos(f.atrasado.monto)}
                detalle={f.atrasado.n > 0 ? <Link to="/cobranza" className="font-medium text-marca-700 hover:underline">{plural(f.atrasado.n, 'cuota')} ya vencidas (no incluidas)</Link> : 'Sin cuotas vencidas'}
              />
            </div>

            <Tarjeta titulo="Ingresos esperados por mes, según vencimiento de las cuotas">
              {meses.some((m) => m.total > 0) ? <GraficoFlujo meses={meses} /> : <Vacio titulo="Sin cuotas por vencer en el período" />}
              {despues > 0 && <p className="mt-2 text-xs text-stone-500">Después de este período quedan {pesos(despues)} por vencer.</p>}
            </Tarjeta>

            <Tarjeta titulo="Detalle por mes" relleno={false}>
              <Tabla>
                <thead>
                  <tr>
                    <th className={th}>Mes</th>
                    <th className={`${th} ${num}`}>Cuotas</th>
                    <th className={`${th} ${num} hidden sm:table-cell`}>Capital</th>
                    <th className={`${th} ${num} hidden sm:table-cell`}>Interés</th>
                    <th className={`${th} ${num}`}>Total del mes</th>
                    <th className={`${th} ${num} hidden md:table-cell`}>Acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {meses.map((m) => {
                    acumulado += m.total;
                    return (
                      <tr key={m.mes}>
                        <td className={`${td} py-2`}>{mesLargo(m.mes)}{m.mes === f.hoy.slice(0, 7) ? <span className="text-xs text-stone-500"> (desde hoy)</span> : ''}</td>
                        <td className={`${td} ${num} py-2`}>{m.n}</td>
                        <td className={`${td} ${num} hidden py-2 sm:table-cell`}>{pesos(m.capital)}</td>
                        <td className={`${td} ${num} hidden py-2 sm:table-cell`}>{pesos(m.interes)}</td>
                        <td className={`${td} ${num} py-2 font-medium`}>{pesos(m.total)}</td>
                        <td className={`${td} ${num} hidden py-2 md:table-cell`}>{pesos(acumulado)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td className={td}>Total</td>
                    <td className={`${td} ${num}`}>{meses.reduce((s, m) => s + m.n, 0)}</td>
                    <td className={`${td} ${num} hidden sm:table-cell`}>{pesos(suma('capital'))}</td>
                    <td className={`${td} ${num} hidden sm:table-cell`}>{pesos(suma('interes'))}</td>
                    <td className={`${td} ${num}`}>{pesos(suma('total'))}</td>
                    <td className="hidden md:table-cell" />
                  </tr>
                </tfoot>
              </Tabla>
            </Tarjeta>
          </div>
        );
      }}
    </Carga>
  );
}

// ---------- Pagos recibidos ----------

function VistaPagos() {
  const { hoy } = useConfig();
  const [desde, setDesde] = useState(`${hoy.slice(0, 7)}-01`);
  const [hasta, setHasta] = useState(hoy);
  const consulta = useDatos<PagoRecibido[]>(`/cobranza/pagos?desde=${desde}&hasta=${hasta}`);
  const vigentes = (consulta.datos ?? []).filter((p) => !p.anulado);
  const total = vigentes.reduce((s, p) => s + p.monto + p.mora, 0);
  const suma = (k: 'capital' | 'interes' | 'mora') => vigentes.reduce((s, p) => s + p[k], 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Campo etiqueta="Desde"><Entrada type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} /></Campo>
        <Campo etiqueta="Hasta"><Entrada type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} /></Campo>
        <Boton
          variante="secundario" icono={Download} className="ml-auto"
          onClick={() => descargarCsv('pagos-recibidos.csv',
            ['Fecha', 'Cliente', 'Parcela', 'Capital', 'Interés', 'Mora', 'Total', 'Imputado a', 'Medio', 'Comprobante', 'Observación'],
            vigentes.map((p) => [p.fecha, p.cliente, p.parcela, p.capital, p.interes, p.mora, p.monto + p.mora, p.imputado_a, MEDIOS_PAGO[p.medio] ?? p.medio, p.comprobante, p.observacion]))}
        >
          Excel
        </Boton>
      </div>

      <Carga consulta={consulta}>
        {(pagos) => (
          <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Dato etiqueta="Total recibido" valor={pesos(total)} detalle={plural(vigentes.length, 'pago')} />
            <Dato etiqueta="Capital" valor={pesos(suma('capital'))} detalle="Amortización de los créditos y pies" />
            <Dato etiqueta="Intereses" valor={pesos(suma('interes'))} detalle="Interés de las cuotas pagadas" />
            <Dato etiqueta="Mora cobrada" valor={pesos(suma('mora'))} detalle="Interés penal registrado aparte" />
          </div>
          <Tarjeta titulo={`${plural(vigentes.length, 'pago')} · ${pesos(total)} recibidos`} relleno={false}>
            {pagos.length === 0 ? <Vacio titulo="No hay pagos en el período" /> : (
              <Tabla>
                <thead>
                  <tr>
                    <th className={th}>Fecha</th>
                    <th className={th}>Cliente</th>
                    <th className={`${th} ${num}`}>Total</th>
                    <th className={`${th} ${num} hidden md:table-cell`}>Capital</th>
                    <th className={`${th} ${num} hidden md:table-cell`}>Interés</th>
                    <th className={`${th} hidden sm:table-cell`}>Imputado a</th>
                    <th className={`${th} hidden md:table-cell`}>Medio</th>
                    <th className={`${th} hidden lg:table-cell`}>Comprobante</th>
                  </tr>
                </thead>
                <tbody>
                  {pagos.map((p) => (
                    <tr key={p.id} className={p.anulado ? 'text-stone-400 line-through [&_td]:text-stone-400' : ''}>
                      <td className={`${td} whitespace-nowrap py-2`}>{fecha(p.fecha)}</td>
                      <td className={`${td} py-2`}>
                        <Link to={`/ventas/${p.venta_id}`} className="font-medium hover:text-marca-700 hover:underline">{p.cliente}</Link>
                        <div className="text-xs text-stone-500">Parcela {p.parcela}</div>
                      </td>
                      <td className={`${td} ${num} py-2 font-medium`}>{pesos(p.monto + p.mora)}</td>
                      <td className={`${td} ${num} hidden py-2 md:table-cell`}>{p.anulado ? '—' : pesos(p.capital)}</td>
                      <td className={`${td} ${num} hidden py-2 md:table-cell`}>{p.anulado ? '—' : pesos(p.interes)}</td>
                      <td className={`${td} hidden py-2 sm:table-cell`}>{p.anulado ? 'Anulado' : `${p.imputado_a ?? ''}${p.mora > 0 ? ` + mora ${pesos(p.mora)}` : ''}`}</td>
                      <td className={`${td} hidden py-2 md:table-cell`}>{MEDIOS_PAGO[p.medio] ?? p.medio}</td>
                      <td className={`${td} hidden py-2 lg:table-cell`}>{p.comprobante || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            )}
          </Tarjeta>
          </>
        )}
      </Carga>
    </div>
  );
}
