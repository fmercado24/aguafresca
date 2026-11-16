import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { BellRing, Download, HandCoins, Plus, X } from 'lucide-react';
import { api, useDatos } from '../api';
import { useAvisos, useSesion } from '../contexto';
import { descargarCsv, fecha, fechaHoraRegistro, formatearRut, pesos, plural } from '../formato';
import type { SolicitudVenta, VentaResumen } from '../tipos';
import { AreaTexto, Boton, Buscador, Campo, Carga, Encabezado, EnlaceBoton, InsigniaVenta, Modal, Tabla, Tarjeta, Vacio, num, td, th } from '../ui';

// ---------- Ventas que informó el abogado y falta registrar ----------

function VentasInformadas() {
  const avisos = useAvisos();
  const opera = useSesion().puede('operaciones');
  const consulta = useDatos<SolicitudVenta[]>('/solicitudes-venta');
  const [descartando, setDescartando] = useState<SolicitudVenta | null>(null);
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const pendientes = consulta.datos ?? [];
  if (!pendientes.length) return null;

  async function descartar() {
    if (!descartando || !motivo.trim()) return;
    setGuardando(true);
    try {
      await api.post(`/solicitudes-venta/${descartando.id}/descartar`, { motivo });
      avisos.ok('Aviso descartado; se le informó a quien lo envió');
      setDescartando(null);
      setMotivo('');
      consulta.recargar();
    } catch (err) {
      avisos.error(err);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Tarjeta titulo={<span className="flex items-center gap-2"><BellRing className="size-4 text-marca-700" /> Ventas informadas por registrar ({pendientes.length})</span>} className="mb-4" relleno={false}>
      <ul className="divide-y divide-stone-100">
        {pendientes.map((s) => (
          <li key={s.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
            <div className="min-w-56 flex-1 text-sm">
              <div className="font-medium text-stone-900">Parcela {s.parcela} · {s.comprador}</div>
              <div className="text-stone-600">
                {s.n_cuotas > 0 ? `${pesos(s.precio)}: pie ${pesos(s.pie)} y ${s.n_cuotas} cuotas de ${pesos(s.valor_cuota)}` : `${pesos(s.precio)} al contado`}
                {' · '}<Link to={`/cotizaciones/${s.cotizacion_id}`} className="text-marca-700 hover:underline">cotización N° {s.cotizacion_id}</Link>
              </div>
              <div className="text-xs text-stone-500">Informada por {s.informada_por ?? '—'} el {fechaHoraRegistro(s.creado_en)}{s.reservo_parcela ? ' · parcela reservada' : ''}</div>
              {s.notas && <div className="mt-1 text-stone-700">{s.notas}</div>}
            </div>
            {opera && (
              <div className="flex gap-2">
                <EnlaceBoton chico icono={HandCoins} to={`/ventas/nueva?cotizacion=${s.cotizacion_id}`}>Registrar venta</EnlaceBoton>
                <Boton chico variante="fantasma" icono={X} onClick={() => setDescartando(s)}>Descartar</Boton>
              </div>
            )}
          </li>
        ))}
      </ul>
      {descartando && (
        <Modal
          abierto alCerrar={() => setDescartando(null)} titulo={`¿No registrar la venta de la parcela ${descartando.parcela}?`} ancho="sm"
          pie={<><Boton variante="secundario" onClick={() => setDescartando(null)}>Cancelar</Boton><Boton variante="peligro" cargando={guardando} disabled={!motivo.trim()} onClick={descartar}>Descartar aviso</Boton></>}
        >
          <Campo etiqueta="Motivo (se le informa a quien envió el aviso)">
            <AreaTexto rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: el cliente desistió." />
          </Campo>
          {descartando.reservo_parcela ? <p className="mt-2 text-sm text-stone-600">La reserva que hizo el aviso se libera.</p> : null}
        </Modal>
      )}
    </Tarjeta>
  );
}

type Filtro = 'todas' | 'vigentes' | 'atraso' | 'pagadas' | 'anuladas';

const FILTROS: { id: Filtro; etiqueta: string; aplica: (v: VentaResumen) => boolean }[] = [
  { id: 'todas', etiqueta: 'Todas', aplica: () => true },
  { id: 'vigentes', etiqueta: 'Crédito vigente', aplica: (v) => v.estado === 'vigente' },
  { id: 'atraso', etiqueta: 'Con atraso', aplica: (v) => v.estado === 'vigente' && v.n_atrasadas > 0 },
  { id: 'pagadas', etiqueta: 'Pagadas', aplica: (v) => v.estado === 'pagada' },
  { id: 'anuladas', etiqueta: 'Anuladas', aplica: (v) => v.estado === 'anulada' },
];

export function Ventas() {
  const opera = useSesion().puede('operaciones');
  const navegar = useNavigate();
  const consulta = useDatos<VentaResumen[]>('/ventas');
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [busqueda, setBusqueda] = useState('');
  const ventas = consulta.datos ?? [];

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const aplica = FILTROS.find((f) => f.id === filtro)!.aplica;
    return ventas.filter((v) => aplica(v) && (!q || v.cliente.toLowerCase().includes(q) || v.parcela.toLowerCase() === q || v.cliente_rut.includes(q)));
  }, [ventas, filtro, busqueda]);

  const vigentes = ventas.filter((v) => v.estado === 'vigente');

  return (
    <>
      <Encabezado
        titulo="Ventas"
        descripcion={consulta.datos ? `${plural(ventas.filter((v) => v.estado !== 'anulada').length, 'venta')} · ${plural(vigentes.length, 'crédito vigente', 'créditos vigentes')} por ${pesos(vigentes.reduce((s, v) => s + v.saldo, 0))}` : undefined}
      >
        {opera && <EnlaceBoton to="/ventas/nueva" icono={Plus}>Nueva venta</EnlaceBoton>}
      </Encabezado>

      <VentasInformadas />

      <Carga consulta={consulta}>
        {() =>
          ventas.length === 0 ? (
            <Tarjeta>
              <Vacio icono={HandCoins} titulo="Aún no hay ventas" accion={opera && <EnlaceBoton to="/ventas/nueva" icono={Plus}>Registrar la primera venta</EnlaceBoton>}>
                Al registrar una venta a crédito el sistema genera el calendario de cuotas con su tabla de amortización.
              </Vacio>
            </Tarjeta>
          ) : (
            <Tarjeta relleno={false}>
              <div className="flex flex-wrap items-center gap-2 border-b border-stone-100 p-3">
                <Buscador valor={busqueda} alCambiar={setBusqueda} placeholder="Buscar por cliente o número de parcela" className="min-w-56 flex-1" />
                <div className="flex flex-wrap gap-1.5">
                  {FILTROS.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setFiltro(f.id)}
                      aria-pressed={filtro === f.id}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${filtro === f.id ? 'border-stone-800 bg-stone-800 text-white' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'}`}
                    >
                      {f.etiqueta}
                    </button>
                  ))}
                </div>
                <Boton
                  chico variante="secundario" icono={Download}
                  onClick={() => descargarCsv('ventas.csv',
                    ['Parcela', 'Cliente', 'RUT', 'Fecha', 'Precio', 'Pie', 'Saldo a crédito', 'Cuotas', 'Valor cuota', 'Tasa mensual %', 'Cuotas pagadas', 'Pagado', 'Saldo por pagar', 'Atrasado', 'Cuotas atrasadas', 'Estado'],
                    filtradas.map((v) => [v.parcela, v.cliente, formatearRut(v.cliente_rut), v.fecha, v.precio, v.pie, v.monto_financiado, v.n_cuotas, v.valor_cuota, String(v.tasa_mensual).replace('.', ','), v.cuotas_pagadas, v.pagado, v.estado === 'anulada' ? 0 : v.saldo, v.estado === 'vigente' ? v.atrasado : 0, v.estado === 'vigente' ? v.n_atrasadas : 0, v.estado]))}
                >
                  Excel
                </Boton>
              </div>
              {filtradas.length === 0 ? (
                <Vacio titulo="Ninguna venta coincide con el filtro" />
              ) : (
                <Tabla>
                  <thead>
                    <tr>
                      <th className={th}>Parcela</th>
                      <th className={th}>Cliente</th>
                      <th className={`${th} hidden md:table-cell`}>Fecha</th>
                      <th className={`${th} ${num} hidden lg:table-cell`}>Precio</th>
                      <th className={`${th} hidden sm:table-cell`}>Cuotas</th>
                      <th className={`${th} ${num}`}>Saldo por pagar</th>
                      <th className={th}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtradas.map((v) => (
                      <tr key={v.id} className="cursor-pointer hover:bg-stone-50" onClick={() => navegar(`/ventas/${v.id}`)}>
                        <td className={`${td} font-medium`}>
                          <Link to={`/ventas/${v.id}`} onClick={(e) => e.stopPropagation()} className="hover:text-marca-700 hover:underline">{v.parcela}</Link>
                        </td>
                        <td className={td}>
                          <div className="font-medium text-stone-900">{v.cliente}</div>
                          <div className="text-xs text-stone-500 md:hidden">{fecha(v.fecha)}</div>
                        </td>
                        <td className={`${td} hidden whitespace-nowrap md:table-cell`}>{fecha(v.fecha)}</td>
                        <td className={`${td} ${num} hidden lg:table-cell`}>{pesos(v.precio)}</td>
                        <td className={`${td} hidden whitespace-nowrap sm:table-cell`}>
                          {v.n_cuotas > 0 ? <>{v.cuotas_pagadas} de {v.n_cuotas} <span className="text-stone-500">· {pesos(v.valor_cuota)}</span></> : 'Contado'}
                        </td>
                        <td className={`${td} ${num} font-medium`}>{v.estado === 'anulada' ? '—' : pesos(v.saldo)}</td>
                        <td className={td}><InsigniaVenta estado={v.estado} atrasadas={v.n_atrasadas} /></td>
                      </tr>
                    ))}
                  </tbody>
                </Tabla>
              )}
            </Tarjeta>
          )
        }
      </Carga>
    </>
  );
}
