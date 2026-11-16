import { Link } from 'react-router';
import { CalendarDays, CircleCheck, Phone, TriangleAlert } from 'lucide-react';
import { useDatos } from '../api';
import { useSesion } from '../contexto';
import { GraficoFlujo } from '../componentes/GraficoFlujo';
import { fecha, fechaConDia, hora, mesLargo, pesos, plural } from '../formato';
import type { Panel as DatosPanel } from '../tipos';
import { Carga, Dato, Encabezado, InsigniaVisita, Tarjeta, Vacio } from '../ui';

const SEGMENTOS = [
  { clave: 'disponible', etiqueta: 'Disponibles', color: 'var(--mapa-disponible)' },
  { clave: 'reservada', etiqueta: 'Reservadas', color: 'var(--mapa-reservada)' },
  { clave: 'vendida', etiqueta: 'Vendidas', color: 'var(--mapa-vendida)' },
  { clave: 'bloqueada', etiqueta: 'No disponibles', color: 'var(--mapa-bloqueada)' },
] as const;

function Inventario({ p }: { p: DatosPanel['parcelas'] }) {
  return (
    <div>
      {/* Barra segmentada delgada: las cifras van en la lista de abajo */}
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={SEGMENTOS.map((s) => `${s.etiqueta}: ${p[s.clave]}`).join(', ')}>
        {SEGMENTOS.filter((s) => p[s.clave] > 0).map((s) => (
          <div key={s.clave} style={{ flexGrow: p[s.clave], background: s.color }} />
        ))}
        {p.total === 0 && <div className="grow bg-stone-200" />}
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {SEGMENTOS.map((s) => (
          <li key={s.clave} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-stone-600"><span className="size-2.5 rounded-xs" style={{ background: s.color }} />{s.etiqueta}</span>
            <span className="font-medium tabular-nums text-stone-900">{p[s.clave]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Medidor({ pagado, total }: { pagado: number; total: number }) {
  const fraccion = total > 0 ? Math.min(1, pagado / total) : 0;
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--viz-serie-1-suave)' }} role="img" aria-label={`Pagado ${Math.round(fraccion * 100)} %`}>
        <div className="h-full rounded-full" style={{ width: `${fraccion * 100}%`, background: 'var(--viz-serie-1)' }} />
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2 text-sm">
        <span className="text-stone-600"><span className="font-medium text-stone-900">{pesos(pagado)}</span> pagado</span>
        <span className="text-stone-500">de {pesos(total)}</span>
      </div>
    </div>
  );
}

export function Panel() {
  const { usuario } = useSesion();
  const consulta = useDatos<DatosPanel>('/panel');

  return (
    <>
      <Encabezado titulo={`Hola, ${usuario?.nombre ?? ''}`} descripcion={consulta.datos ? `Resumen al ${fechaConDia(consulta.datos.hoy)}` : undefined} />
      <Carga consulta={consulta}>
        {(d) => (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Dato
                etiqueta="Parcelas disponibles"
                valor={d.parcelas.disponible}
                detalle={<>de {d.parcelas.total} · {pesos(d.parcelas.valor_disponible)} en lista</>}
              />
              <Dato
                etiqueta="Por cobrar"
                valor={pesos(d.cartera.por_cobrar)}
                detalle={<>{plural(d.cartera.n_creditos, 'crédito vigente', 'créditos vigentes')} · capital {pesos(d.cartera.capital)}</>}
              />
              <Dato
                etiqueta="Cuotas atrasadas"
                valor={pesos(d.cartera.atrasado)}
                detalle={
                  d.cartera.n_cuotas_atrasadas > 0 ? (
                    <Link to="/cobranza" className="inline-flex items-center gap-1 font-medium text-red-700 hover:underline">
                      <TriangleAlert className="size-3.5" />
                      {plural(d.cartera.n_cuotas_atrasadas, 'cuota')} · {plural(d.cartera.n_deudores_morosos, 'deudor', 'deudores')}
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-green-700"><CircleCheck className="size-3.5" />Toda la cartera al día</span>
                  )
                }
              />
              <Dato
                etiqueta="Recaudado este mes"
                valor={pesos(d.mes.recaudado)}
                detalle={<>{plural(d.mes.n_pagos, 'pago')} · {plural(d.mes.ventas.n, 'venta nueva', 'ventas nuevas')}</>}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Tarjeta
                className="lg:col-span-2"
                titulo="Ingresos esperados, próximos 12 meses"
                acciones={<Link to="/cobranza?vista=flujo" className="text-xs font-medium text-marca-700 hover:underline">Ver detalle</Link>}
              >
                {d.flujo.some((m) => m.total > 0) ? (
                  <GraficoFlujo meses={d.flujo} />
                ) : (
                  <Vacio titulo="Sin cuotas por vencer">Cuando registre ventas a crédito, aquí verá los ingresos proyectados mes a mes.</Vacio>
                )}
              </Tarjeta>

              <div className="space-y-4">
                <Tarjeta titulo="Parcelas" acciones={<Link to="/parcelas" className="text-xs font-medium text-marca-700 hover:underline">Ver mapa</Link>}>
                  <Inventario p={d.parcelas} />
                </Tarjeta>
                <Tarjeta titulo={`Cuotas que vencen en ${mesLargo(d.hoy.slice(0, 7)).split(' ')[0].toLowerCase()}`}>
                  {d.mes.cuotas.n > 0 ? (
                    <Medidor pagado={d.mes.cuotas.pagado} total={d.mes.cuotas.monto} />
                  ) : (
                    <p className="text-sm text-stone-500">No hay cuotas con vencimiento este mes.</p>
                  )}
                </Tarjeta>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Tarjeta titulo="Vencen en los próximos 7 días" relleno={false}>
                {d.proximos_vencimientos.length === 0 ? (
                  <p className="p-4 text-sm text-stone-500">No hay cuotas por vencer esta semana.</p>
                ) : (
                  <ul className="divide-y divide-stone-100">
                    {d.proximos_vencimientos.map((c) => (
                      <li key={c.id}>
                        <Link to={`/ventas/${c.venta_id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-stone-50">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-stone-900">{c.cliente}</div>
                            <div className="text-xs text-stone-500">Parcela {c.parcela} · {c.tipo === 'pie' ? 'Pie' : `Cuota ${c.numero}`} · vence {fecha(c.fecha_vencimiento)}</div>
                          </div>
                          <div className="text-sm font-medium tabular-nums text-stone-900">{pesos(c.saldo)}</div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Tarjeta>

              <Tarjeta titulo="Próximas visitas" relleno={false} acciones={<Link to="/visitas" className="text-xs font-medium text-marca-700 hover:underline">Ver calendario</Link>}>
                {d.proximas_visitas.length === 0 ? (
                  <Vacio icono={CalendarDays} titulo="Sin visitas programadas" />
                ) : (
                  <ul className="divide-y divide-stone-100">
                    {d.proximas_visitas.map((v) => (
                      <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-stone-900">{v.nombre}</div>
                          <div className="flex flex-wrap items-center gap-x-2 text-xs text-stone-500">
                            <span className="first-letter:uppercase">{fechaConDia(v.inicio)} · {hora(v.inicio)}</span>
                            {v.telefono && (
                              <a href={`tel:${v.telefono.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 text-marca-700 hover:underline">
                                <Phone className="size-3" />{v.telefono}
                              </a>
                            )}
                          </div>
                        </div>
                        <InsigniaVisita estado={v.estado} />
                      </li>
                    ))}
                  </ul>
                )}
              </Tarjeta>
            </div>
          </div>
        )}
      </Carga>
    </>
  );
}
