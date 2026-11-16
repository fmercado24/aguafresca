import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Ban, Banknote, Download, FileSignature, FileText, History, Pencil, Printer, Receipt, RotateCcw, Sheet, Trash2, TriangleAlert } from 'lucide-react';
import { api, useDatos } from '../api';
import { useAvisos, useConfig, useSesion } from '../contexto';
import { Membrete } from '../componentes/Membrete';
import { ACCIONES_REGISTRO, ListaCambios, listarCambios } from '../componentes/Cambios';
import { MEDIOS_PAGO, descargarCsv, fecha, fechaHoraRegistro, fechaLarga, fechaRegistro, formatearRut, numero, pesos, plural, porcentaje } from '../formato';
import type { Cuota, EntradaRegistro, Pago, VentaDetalle } from '../tipos';
import {
  AreaTexto, Boton, Campo, Carga, Dato, Encabezado, EnlaceBoton, Entrada, EntradaMonto, InsigniaCuota, InsigniaVenta, Modal, Par,
  Pestanas, Selector, Tabla, Tarjeta, Vacio, num, td, th,
} from '../ui';

const nombreCuota = (c: { tipo: 'pie' | 'cuota'; numero: number }, hayCuotas = true) => (c.tipo === 'pie' ? (hayCuotas ? 'Pie' : 'Contado') : `N° ${c.numero}`);

export function VentaDetallePagina() {
  const { id } = useParams();
  return <Detalle key={id} id={Number(id)} />;
}

// ---------- Registrar pago ----------

/** Explica a qué cuotas se imputará un monto (de la más antigua a la más nueva). */
function describirImputacion(cuotas: Cuota[], monto: number): string {
  let resto = monto;
  const completas: string[] = [];
  let abono = '';
  for (const c of cuotas) {
    if (resto <= 0) break;
    if (c.saldo <= 0) continue;
    if (resto >= c.saldo) {
      completas.push(c.tipo === 'pie' ? 'el pie' : `la cuota ${c.numero}`);
      resto -= c.saldo;
    } else {
      abono = `abona ${pesos(resto)} a ${c.tipo === 'pie' ? 'el pie' : `la cuota ${c.numero}`}`;
      resto = 0;
    }
  }
  if (resto > 0) return 'El monto supera el saldo pendiente de la venta.';
  const partes = [];
  if (completas.length) partes.push(`cubre ${completas.length > 4 ? `${completas.length} cuotas completas (hasta ${completas.at(-1)})` : completas.join(', ')}`);
  if (abono) partes.push(abono);
  return partes.length ? `Este pago ${partes.join(' y ')}.` : '';
}

function FormularioPago({ d, alCerrar, alGuardar }: { d: VentaDetalle; alCerrar: () => void; alGuardar: () => void }) {
  const avisos = useAvisos();
  const config = useConfig();
  const idForm = useId();
  const t = d.totales;
  const [fechaPago, setFechaPago] = useState(config.hoy);
  const [monto, setMonto] = useState<number | null>(t.atrasado > 0 ? t.atrasado : t.proxima?.saldo ?? null);
  const [mora, setMora] = useState<number | null>(null);
  const [medio, setMedio] = useState('transferencia');
  const [comprobante, setComprobante] = useState('');
  const [observacion, setObservacion] = useState('');
  const [guardando, setGuardando] = useState(false);

  const atajos = [
    t.proxima && { etiqueta: t.proxima.tipo === 'pie' ? 'Pie' : `Cuota ${t.proxima.numero}`, valor: t.proxima.saldo },
    t.n_atrasadas > 1 && { etiqueta: 'Todo lo atrasado', valor: t.atrasado },
    { etiqueta: 'Saldo total', valor: t.saldo },
  ].filter((a): a is { etiqueta: string; valor: number } => !!a);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      await api.post(`/ventas/${d.venta.id}/pagos`, { fecha: fechaPago, monto, mora: mora ?? 0, medio, comprobante, observacion });
      avisos.ok('Pago registrado');
      alGuardar();
    } catch (err) {
      avisos.error(err);
      setGuardando(false);
    }
  }

  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      titulo={`Registrar pago — Parcela ${d.parcela.numero}`}
      pie={
        <>
          <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
          <Boton type="submit" form={idForm} cargando={guardando}>Registrar pago</Boton>
        </>
      }
    >
      <form id={idForm} onSubmit={guardar} className="grid grid-cols-2 gap-3">
        <Campo
          etiqueta="Monto pagado"
          className="col-span-2"
          ayuda={
            <span className="space-y-1.5">
              <span className="flex flex-wrap gap-1.5">
                {atajos.map((a) => (
                  <button key={a.etiqueta} type="button" onClick={() => setMonto(a.valor)} className="rounded-md border border-stone-300 bg-white px-1.5 py-0.5 text-xs font-medium text-stone-700 hover:bg-stone-50">
                    {a.etiqueta}: {pesos(a.valor)}
                  </button>
                ))}
              </span>
              {monto ? <span className="block text-stone-600">{describirImputacion(d.cuotas, monto)}</span> : null}
            </span>
          }
        >
          <EntradaMonto required autoFocus valor={monto} alCambiar={setMonto} />
        </Campo>
        <Campo etiqueta="Fecha del pago">
          <Entrada type="date" required max={config.hoy} value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
        </Campo>
        <Campo etiqueta="Medio de pago">
          <Selector value={medio} onChange={(e) => setMedio(e.target.value)}>
            {config.medios_pago.map((m) => <option key={m} value={m}>{MEDIOS_PAGO[m] ?? m}</option>)}
          </Selector>
        </Campo>
        <Campo etiqueta="N° de comprobante o transferencia">
          <Entrada maxLength={80} value={comprobante} onChange={(e) => setComprobante(e.target.value)} />
        </Campo>
        <Campo
          etiqueta="Interés por mora cobrado"
          ayuda={t.mora_estimada > 0 ? (
            <button type="button" onClick={() => setMora(t.mora_estimada)} className="text-marca-700 hover:underline">Estimado a hoy: {pesos(t.mora_estimada)}</button>
          ) : 'Opcional. Se suma aparte de las cuotas.'}
        >
          <EntradaMonto valor={mora} alCambiar={setMora} />
        </Campo>
        <Campo etiqueta="Observación" className="col-span-2">
          <Entrada maxLength={500} value={observacion} onChange={(e) => setObservacion(e.target.value)} />
        </Campo>
      </form>
    </Modal>
  );
}

/** Diálogo que pide un motivo antes de anular un pago o una venta. */
function DialogoMotivo({ titulo, mensaje, confirmar, alCerrar, alConfirmar }: {
  titulo: string;
  mensaje: string;
  confirmar: string;
  alCerrar: () => void;
  alConfirmar: (motivo: string) => Promise<void>;
}) {
  const idForm = useId();
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      titulo={titulo}
      ancho="sm"
      pie={
        <>
          <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
          <Boton variante="peligro" type="submit" form={idForm} cargando={enviando}>{confirmar}</Boton>
        </>
      }
    >
      <form
        id={idForm}
        onSubmit={async (e) => {
          e.preventDefault();
          setEnviando(true);
          await alConfirmar(motivo).finally(() => setEnviando(false));
        }}
      >
        <p className="mb-3 text-sm text-stone-600">{mensaje}</p>
        <Campo etiqueta="Motivo">
          <AreaTexto required autoFocus rows={2} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Campo>
      </form>
    </Modal>
  );
}

// ---------- Corregir un pago (contador y super administrador) ----------

function FormularioEditarPago({ pago, alCerrar, alGuardar }: { pago: Pago; alCerrar: () => void; alGuardar: () => void }) {
  const avisos = useAvisos();
  const config = useConfig();
  const idForm = useId();
  const original = { fecha: pago.fecha, monto: pago.monto, mora: pago.mora, medio: pago.medio, comprobante: pago.comprobante, observacion: pago.observacion };
  const [d, setD] = useState(original);
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const cambios = listarCambios(original, d, {
      fecha: 'Fecha', monto: 'Monto', mora: 'Interés por mora', medio: 'Medio de pago', comprobante: 'Comprobante', observacion: 'Observación',
    }, {
      fecha: (v) => fecha(String(v)), monto: (v) => pesos(Number(v)), mora: (v) => pesos(Number(v)), medio: (v) => MEDIOS_PAGO[String(v)] ?? String(v),
    });
    if (!cambios.length) return avisos.error('No hay cambios que guardar');
    if (!(await avisos.confirmar({
      titulo: `¿Corregir el pago N° ${pago.id}?`,
      mensaje: <ListaCambios cambios={cambios} nota="Los pagos de la venta se vuelven a imputar a las cuotas. El cambio y su motivo quedan en el historial de la venta." />,
      confirmar: 'Sí, corregir pago',
    }))) return;
    setGuardando(true);
    try {
      await api.put(`/pagos/${pago.id}`, { ...d, motivo });
      avisos.ok('Pago corregido');
      alGuardar();
    } catch (err) {
      avisos.error(err);
      setGuardando(false);
    }
  }

  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      titulo={`Corregir pago N° ${pago.id}`}
      pie={
        <>
          <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
          <Boton type="submit" form={idForm} cargando={guardando}>Revisar y guardar</Boton>
        </>
      }
    >
      <form id={idForm} onSubmit={guardar} className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Monto pagado" className="col-span-2 sm:col-span-1">
          <EntradaMonto required valor={d.monto} alCambiar={(v) => setD({ ...d, monto: v ?? 0 })} />
        </Campo>
        <Campo etiqueta="Fecha del pago" className="col-span-2 sm:col-span-1">
          <Entrada type="date" required max={config.hoy} value={d.fecha} onChange={(e) => setD({ ...d, fecha: e.target.value })} />
        </Campo>
        <Campo etiqueta="Medio de pago">
          <Selector value={d.medio} onChange={(e) => setD({ ...d, medio: e.target.value })}>
            {config.medios_pago.map((m) => <option key={m} value={m}>{MEDIOS_PAGO[m] ?? m}</option>)}
          </Selector>
        </Campo>
        <Campo etiqueta="Interés por mora cobrado">
          <EntradaMonto valor={d.mora} alCambiar={(v) => setD({ ...d, mora: v ?? 0 })} />
        </Campo>
        <Campo etiqueta="N° de comprobante o transferencia" className="col-span-2">
          <Entrada maxLength={80} value={d.comprobante} onChange={(e) => setD({ ...d, comprobante: e.target.value })} />
        </Campo>
        <Campo etiqueta="Observación" className="col-span-2">
          <Entrada maxLength={500} value={d.observacion} onChange={(e) => setD({ ...d, observacion: e.target.value })} />
        </Campo>
        <Campo etiqueta="Motivo de la corrección (queda registrado)" className="col-span-2">
          <AreaTexto required rows={2} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: monto mal digitado, la transferencia fue de otro día…" />
        </Campo>
      </form>
    </Modal>
  );
}

// ---------- Historial de cambios de la venta ----------

const RESTAURABLES = ['amortizacion', 'amortizacion_restaurada'];

function HistorialVenta({ entradas, puedeRestaurar, alRestaurar }: { entradas: EntradaRegistro[]; puedeRestaurar: boolean; alRestaurar: (e: EntradaRegistro) => void }) {
  if (entradas.length === 0) {
    return <Vacio icono={History} titulo="Sin cambios registrados">Aquí quedan los cambios a la tabla de amortización y las correcciones o anulaciones de pagos, con quién los hizo y por qué.</Vacio>;
  }
  return (
    <ul className="divide-y divide-stone-100">
      {entradas.map((e) => (
        <li key={e.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 text-xs text-stone-500">
              <span className="font-medium text-stone-900">{ACCIONES_REGISTRO[e.accion] ?? e.accion}</span>
              <span>{fechaHoraRegistro(e.fecha)}</span>
              <span>· {e.usuario ?? 'Sistema'}</span>
            </div>
            <p className="mt-1 break-words text-sm text-stone-700">{e.detalle}</p>
            {e.motivo && <p className="mt-0.5 text-sm text-stone-500">Motivo: {e.motivo}</p>}
          </div>
          {puedeRestaurar && e.restaurable && RESTAURABLES.includes(e.accion) ? (
            <Boton chico variante="secundario" icono={RotateCcw} onClick={() => alRestaurar(e)}>Deshacer este cambio</Boton>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function exportarTabla(d: VentaDetalle) {
  const nombre = (c: Cuota) => (c.tipo === 'pie' ? (d.venta.n_cuotas > 0 ? 'Pie' : 'Contado') : String(c.numero));
  descargarCsv(
    `tabla-amortizacion-parcela-${d.parcela.numero}.csv`,
    ['Cuota', 'Vencimiento', 'Monto', 'Interés', 'Amortización', 'Saldo insoluto', 'Pagado', 'Saldo de la cuota', 'Estado', 'Fecha de pago'],
    d.cuotas.map((c) => [nombre(c), c.fecha_vencimiento, c.monto, c.interes, c.amortizacion, c.saldo_insoluto, c.pagado, c.saldo, c.estado, c.fecha_pago]),
  );
}

// ---------- Página ----------

function Detalle({ id }: { id: number }) {
  const { puede } = useSesion();
  const contable = puede('contabilidad');
  const editaTabla = puede('amortizacion');
  const opera = puede('operaciones');
  const avisos = useAvisos();
  const config = useConfig();
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const consulta = useDatos<VentaDetalle>(`/ventas/${id}`);
  const historial = useDatos<EntradaRegistro[]>(`/ventas/${id}/historial`);
  const [pestana, setPestana] = useState<'cuotas' | 'pagos' | 'documentos' | 'historial'>(params.get('ver') === 'historial' ? 'historial' : 'cuotas');
  const [pagando, setPagando] = useState(false);
  const [editandoPago, setEditandoPago] = useState<Pago | null>(null);
  const [anulandoPago, setAnulandoPago] = useState<Pago | null>(null);
  const [anulandoVenta, setAnulandoVenta] = useState(false);

  // Permite llegar desde otra pantalla directo al registro de pago (…?pago=1).
  useEffect(() => {
    if (params.get('pago') && opera && consulta.datos?.venta.estado === 'vigente') {
      setPagando(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams, consulta.datos, opera]);

  const recargarTodo = () => {
    consulta.recargar();
    historial.recargar();
  };

  async function restaurar(e: EntradaRegistro) {
    if (!(await avisos.confirmar({
      titulo: '¿Deshacer este cambio en la tabla?',
      mensaje: (
        <>
          La tabla de amortización volverá a quedar exactamente como estaba <strong>antes</strong> del cambio del {fechaHoraRegistro(e.fecha)}
          {e.usuario ? ` hecho por ${e.usuario}` : ''}. Los pagos se vuelven a imputar. La tabla actual queda guardada en el historial,
          así que esta acción también se puede deshacer.
        </>
      ),
      confirmar: 'Sí, deshacer el cambio',
    }))) return;
    try {
      await api.post(`/ventas/${id}/amortizacion/restaurar/${e.id}`);
      avisos.ok('Tabla restaurada');
      recargarTodo();
    } catch (err) {
      avisos.error(err);
    }
  }

  async function eliminar() {
    if (!(await avisos.confirmar({ titulo: '¿Eliminar esta venta?', mensaje: 'Se borra por completo, como si nunca se hubiera ingresado, y la parcela vuelve a estar disponible. Úselo solo para corregir un error de ingreso.', confirmar: 'Eliminar venta', peligro: true }))) return;
    try {
      await api.del(`/ventas/${id}`);
      avisos.ok('Venta eliminada');
      navegar('/ventas');
    } catch (err) {
      avisos.error(err);
    }
  }

  return (
    <Carga consulta={consulta}>
      {(d) => contenido(d)}
    </Carga>
  );

  // Función común (no un componente): así los diálogos conservan su estado entre renderizados.
  function contenido(d: VentaDetalle) {
    const { venta: v, parcela, cliente, cuotas, pagos, totales: t } = d;
    const hayCuotas = v.n_cuotas > 0;
    const vigente = v.estado === 'vigente';
    const sinPagos = pagos.every((p) => p.anulado);
    const avance = t.total_a_pagar > 0 ? t.pagado / t.total_a_pagar : 0;

    return (
      <>
        <div className="print:hidden">
          <Encabezado
            volver={{ a: '/ventas', texto: 'Ventas' }}
            titulo={<span className="flex flex-wrap items-center gap-2">Parcela {parcela.numero} <InsigniaVenta estado={v.estado} atrasadas={t.n_atrasadas} /></span>}
            descripcion={
              <>
                <Link to={`/clientes/${cliente.id}`} className="font-medium text-marca-700 hover:underline">{cliente.nombre}</Link>
                {cliente.rut && ` · ${formatearRut(cliente.rut)}`} · venta del {fecha(v.fecha)}
              </>
            }
          >
            {vigente && opera && <Boton icono={Banknote} onClick={() => setPagando(true)}>Registrar pago</Boton>}
            {v.estado !== 'anulada' && <EnlaceBoton variante="secundario" icono={FileSignature} to={`/documentos/nuevo?tipo=promesa&venta=${id}`}>Promesa</EnlaceBoton>}
            {vigente && t.n_atrasadas > 0 && <EnlaceBoton variante="secundario" icono={FileText} to={`/documentos/nuevo?tipo=carta_cobranza&venta=${id}`}>Carta de cobranza</EnlaceBoton>}
            {editaTabla && v.estado !== 'anulada' && <EnlaceBoton variante="secundario" icono={Sheet} to={`/ventas/${id}/tabla`}>Editar tabla</EnlaceBoton>}
            <Boton variante="secundario" icono={Printer} onClick={() => window.print()}>Imprimir</Boton>
          </Encabezado>

          {v.estado === 'anulada' && (
            <p className="mb-4 flex items-start gap-2 rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm text-stone-700">
              <Ban className="mt-0.5 size-4 shrink-0" />
              <span>Venta anulada{v.motivo_anulacion ? `: ${v.motivo_anulacion}` : ''}. Sus cuotas ya no cuentan como cartera por cobrar.</span>
            </p>
          )}

          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Dato etiqueta="Precio de venta" valor={pesos(v.precio)} detalle={hayCuotas ? `Pie ${pesos(v.pie)} · crédito ${pesos(v.monto_financiado)}` : 'Venta al contado'} />
            <Dato
              etiqueta="Pagado"
              valor={pesos(t.pagado)}
              detalle={hayCuotas ? `${t.cuotas_pagadas} de ${t.cuotas_total} cuotas · ${Math.round(avance * 100)} % del total` : undefined}
            />
            <Dato etiqueta="Saldo por pagar" valor={pesos(v.estado === 'anulada' ? 0 : t.saldo)} detalle={hayCuotas && vigente ? `Capital insoluto ${pesos(t.capital_insoluto)}` : undefined} />
            <Dato
              etiqueta="Monto atrasado"
              valor={pesos(vigente ? t.atrasado : 0)}
              detalle={
                vigente && t.n_atrasadas > 0
                  ? <span className="inline-flex items-center gap-1 font-medium text-red-700"><TriangleAlert className="size-3.5" />{plural(t.n_atrasadas, 'cuota')} · {t.dias_atraso} días{t.mora_estimada > 0 ? ` · mora ${pesos(t.mora_estimada)}` : ''}</span>
                  : vigente && t.proxima ? `Próximo vencimiento: ${fecha(t.proxima.fecha)}` : undefined
              }
            />
          </div>

          <Tarjeta titulo="Condiciones de la venta" className="mb-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <Par etiqueta="Parcela">{parcela.numero}{parcela.sector ? ` · ${parcela.sector}` : ''} · {numero(parcela.superficie_m2)} m²</Par>
              <Par etiqueta="Forma de pago">{hayCuotas ? `${v.n_cuotas} cuotas de ${pesos(v.valor_cuota)}` : 'Contado'}</Par>
              <Par etiqueta="Interés">{hayCuotas ? `${porcentaje(v.tasa_mensual)} mensual` : '—'}</Par>
              <Par etiqueta="Intereses del crédito">{hayCuotas ? pesos(t.intereses_totales) : '—'}</Par>
              <Par etiqueta="Primera cuota">{v.fecha_primera_cuota ? fecha(v.fecha_primera_cuota) : '—'}</Par>
              <Par etiqueta="Última cuota">{hayCuotas ? fecha(cuotas.at(-1)!.fecha_vencimiento) : '—'}</Par>
              <Par etiqueta="Vendedor">{v.vendedor}</Par>
              <Par etiqueta="Observaciones">{v.observaciones}</Par>
            </dl>
          </Tarjeta>

          <Pestanas
            activa={pestana}
            alCambiar={setPestana}
            opciones={[
              { id: 'cuotas', etiqueta: hayCuotas ? 'Tabla de amortización' : 'Calendario de pago' },
              { id: 'pagos', etiqueta: 'Pagos', cuenta: pagos.length },
              { id: 'documentos', etiqueta: 'Documentos', cuenta: d.documentos.length },
              { id: 'historial', etiqueta: 'Historial de cambios', cuenta: historial.datos?.length ?? 0 },
            ]}
          />

          {pestana === 'cuotas' && (
            <Tarjeta
              relleno={false}
              titulo={hayCuotas ? `${v.n_cuotas} cuotas · ${porcentaje(v.tasa_mensual)} mensual` : 'Pago al contado'}
              acciones={
                <>
                  <Boton chico variante="secundario" icono={Download} onClick={() => exportarTabla(d)}>Excel</Boton>
                  {editaTabla && v.estado !== 'anulada' && <EnlaceBoton chico icono={Sheet} to={`/ventas/${id}/tabla`}>Editar tabla</EnlaceBoton>}
                </>
              }
            >
              <Tabla>
                <thead>
                  <tr>
                    <th className={th}>Cuota</th>
                    <th className={th}>Vencimiento</th>
                    <th className={`${th} ${num}`}>Monto</th>
                    <th className={`${th} ${num} hidden md:table-cell`}>Interés</th>
                    <th className={`${th} ${num} hidden md:table-cell`}>Amortización</th>
                    <th className={`${th} ${num} hidden lg:table-cell`}>Saldo insoluto</th>
                    <th className={`${th} ${num} hidden sm:table-cell`}>Pagado</th>
                    <th className={th}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {cuotas.map((c) => (
                    <tr key={c.id} className={c.estado === 'atrasada' && vigente ? 'bg-red-50/50' : ''}>
                      <td className={`${td} py-2 font-medium`}>{nombreCuota(c, hayCuotas)}</td>
                      <td className={`${td} whitespace-nowrap py-2`}>{fecha(c.fecha_vencimiento)}</td>
                      <td className={`${td} ${num} py-2 font-medium`}>{pesos(c.monto)}</td>
                      <td className={`${td} ${num} hidden py-2 md:table-cell`}>{c.tipo === 'cuota' ? pesos(c.interes) : '—'}</td>
                      <td className={`${td} ${num} hidden py-2 md:table-cell`}>{pesos(c.amortizacion)}</td>
                      <td className={`${td} ${num} hidden py-2 lg:table-cell`}>{pesos(c.saldo_insoluto)}</td>
                      <td className={`${td} ${num} hidden py-2 sm:table-cell`}>{c.pagado > 0 ? pesos(c.pagado) : '—'}</td>
                      <td className={`${td} py-2`}>
                        {v.estado === 'anulada' && c.estado !== 'pagada' ? <span className="text-xs text-stone-400">Sin efecto</span> : <InsigniaCuota estado={c.estado} dias={c.dias_atraso} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td className={td} colSpan={2}>Total</td>
                    <td className={`${td} ${num}`}>{pesos(t.total_a_pagar)}</td>
                    <td className={`${td} ${num} hidden md:table-cell`}>{pesos(t.intereses_totales)}</td>
                    <td className={`${td} ${num} hidden md:table-cell`}>{pesos(v.precio)}</td>
                    <td className="hidden lg:table-cell" />
                    <td className={`${td} ${num} hidden sm:table-cell`}>{pesos(t.pagado)}</td>
                    <td />
                  </tr>
                </tfoot>
              </Tabla>
            </Tarjeta>
          )}

          {pestana === 'pagos' && (
            <Tarjeta relleno={false}>
              {pagos.length === 0 ? (
                <Vacio icono={Receipt} titulo="Sin pagos registrados" accion={vigente && opera && <Boton icono={Banknote} onClick={() => setPagando(true)}>Registrar pago</Boton>} />
              ) : (
                <Tabla>
                  <thead>
                    <tr>
                      <th className={th}>Fecha</th>
                      <th className={`${th} ${num}`}>Monto</th>
                      <th className={`${th} ${num} hidden sm:table-cell`}>Mora</th>
                      <th className={th}>Imputado a</th>
                      <th className={`${th} hidden md:table-cell`}>Medio</th>
                      <th className={`${th} hidden lg:table-cell`}>Comprobante</th>
                      <th className={th}><span className="sr-only">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagos.map((p) => (
                      <tr key={p.id} className={p.anulado ? 'text-stone-400' : ''}>
                        <td className={`${td} whitespace-nowrap ${p.anulado ? 'text-stone-400 line-through' : ''}`}>{fecha(p.fecha)}</td>
                        <td className={`${td} ${num} font-medium ${p.anulado ? 'text-stone-400 line-through' : ''}`}>{pesos(p.monto)}</td>
                        <td className={`${td} ${num} hidden sm:table-cell ${p.anulado ? 'text-stone-400' : ''}`}>{p.mora > 0 ? pesos(p.mora) : '—'}</td>
                        <td className={`${td} ${p.anulado ? 'text-stone-400' : ''}`}>
                          {p.anulado ? `Anulado: ${p.motivo_anulacion}` : p.imputado_a}
                          {p.observacion && <div className="text-xs text-stone-500">{p.observacion}</div>}
                        </td>
                        <td className={`${td} hidden md:table-cell ${p.anulado ? 'text-stone-400' : ''}`}>{MEDIOS_PAGO[p.medio] ?? p.medio}</td>
                        <td className={`${td} hidden lg:table-cell ${p.anulado ? 'text-stone-400' : ''}`}>{p.comprobante || '—'}</td>
                        <td className={`${td} whitespace-nowrap text-right`}>
                          {!p.anulado && (
                            <>
                              <EnlaceBoton chico variante="fantasma" icono={Receipt} to={`/pagos/${p.id}`}>Comprobante</EnlaceBoton>
                              {contable && <Boton chico variante="fantasma" icono={Pencil} onClick={() => setEditandoPago(p)} aria-label="Corregir pago" title="Corregir pago" />}
                              {contable && <Boton chico variante="fantasma" icono={Ban} onClick={() => setAnulandoPago(p)} aria-label="Anular pago" title="Anular pago" />}
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Tabla>
              )}
            </Tarjeta>
          )}

          {pestana === 'documentos' && (
            <Tarjeta relleno={false}>
              {d.documentos.length === 0 ? (
                <Vacio icono={FileText} titulo="Sin documentos emitidos para esta venta">Use los botones “Promesa” o “Carta de cobranza” para confeccionarlos a partir de las plantillas.</Vacio>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {d.documentos.map((doc) => (
                    <li key={doc.id}>
                      <Link to={`/documentos/${doc.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-stone-50">
                        <span className="flex min-w-0 items-center gap-2 text-sm text-stone-900"><FileText className="size-4 shrink-0 text-stone-400" /><span className="truncate">{doc.titulo}</span></span>
                        <span className="whitespace-nowrap text-xs text-stone-500">{fechaRegistro(doc.creado_en)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>
          )}

          {pestana === 'historial' && (
            <Tarjeta relleno={false}>
              <Carga consulta={historial}>
                {(entradas) => <HistorialVenta entradas={entradas} puedeRestaurar={editaTabla && v.estado !== 'anulada'} alRestaurar={restaurar} />}
              </Carga>
            </Tarjeta>
          )}

          {contable && (
            <div className="mt-6 flex flex-wrap gap-2 border-t border-stone-200 pt-4">
              {v.estado !== 'anulada' && <Boton variante="fantasma" icono={Ban} className="text-red-700" onClick={() => setAnulandoVenta(true)}>Anular venta</Boton>}
              {sinPagos && <Boton variante="fantasma" icono={Trash2} className="text-red-700" onClick={eliminar}>Eliminar venta ingresada por error</Boton>}
            </div>
          )}
        </div>

        {/* Versión impresa: estado de cuenta con la tabla completa */}
        <div className="hidden text-stone-900 print:block">
          <Membrete titulo={hayCuotas ? 'Tabla de amortización' : 'Estado de cuenta'} subtitulo={`Emitida el ${fechaLarga(config.hoy)}`} />
          <div className="mb-4 grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
            <div><span className="text-stone-600">Cliente:</span> {cliente.nombre}</div>
            <div><span className="text-stone-600">RUT:</span> {formatearRut(cliente.rut) || '—'}</div>
            <div><span className="text-stone-600">Parcela:</span> N° {parcela.numero} · {numero(parcela.superficie_m2)} m²</div>
            <div><span className="text-stone-600">Fecha de venta:</span> {fecha(v.fecha)}</div>
            <div><span className="text-stone-600">Precio de venta:</span> {pesos(v.precio)}</div>
            <div><span className="text-stone-600">Pie:</span> {pesos(v.pie)}</div>
            {hayCuotas && <div><span className="text-stone-600">Saldo a crédito:</span> {pesos(v.monto_financiado)}</div>}
            {hayCuotas && <div><span className="text-stone-600">Condiciones:</span> {v.n_cuotas} cuotas de {pesos(v.valor_cuota)} · {porcentaje(v.tasa_mensual)} mensual</div>}
            <div><span className="text-stone-600">Pagado a la fecha:</span> {pesos(t.pagado)}</div>
            <div><span className="text-stone-600">Saldo por pagar:</span> {pesos(t.saldo)}</div>
          </div>
          <table className="w-full border-collapse text-xs tabular-nums">
            <thead>
              <tr className="bg-stone-100">
                {['Cuota', 'Vencimiento', 'Monto', 'Interés', 'Amortización', 'Saldo insoluto', 'Pagado', 'Situación'].map((h, i) => (
                  <th key={h} className={`whitespace-nowrap border border-stone-300 px-2 py-1 ${i >= 2 && i <= 6 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cuotas.map((c) => (
                <tr key={c.id}>
                  <td className="border border-stone-300 px-2 py-0.5">{nombreCuota(c, hayCuotas)}</td>
                  <td className="whitespace-nowrap border border-stone-300 px-2 py-0.5">{fecha(c.fecha_vencimiento)}</td>
                  <td className="border border-stone-300 px-2 py-0.5 text-right">{pesos(c.monto)}</td>
                  <td className="border border-stone-300 px-2 py-0.5 text-right">{pesos(c.interes)}</td>
                  <td className="border border-stone-300 px-2 py-0.5 text-right">{pesos(c.amortizacion)}</td>
                  <td className="border border-stone-300 px-2 py-0.5 text-right">{pesos(c.saldo_insoluto)}</td>
                  <td className="border border-stone-300 px-2 py-0.5 text-right">{c.pagado > 0 ? pesos(c.pagado) : ''}</td>
                  <td className="whitespace-nowrap border border-stone-300 px-2 py-0.5">
                    {c.estado === 'pagada' ? `Pagada ${fecha(c.fecha_pago)}` : c.estado === 'atrasada' ? `Atrasada (${c.dias_atraso} días)` : c.estado === 'parcial' ? 'Abono parcial' : 'Por vencer'}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="border border-stone-300 px-2 py-1" colSpan={2}>Total</td>
                <td className="border border-stone-300 px-2 py-1 text-right">{pesos(t.total_a_pagar)}</td>
                <td className="border border-stone-300 px-2 py-1 text-right">{pesos(t.intereses_totales)}</td>
                <td className="border border-stone-300 px-2 py-1 text-right">{pesos(v.precio)}</td>
                <td className="border border-stone-300 px-2 py-1" />
                <td className="border border-stone-300 px-2 py-1 text-right">{pesos(t.pagado)}</td>
                <td className="border border-stone-300 px-2 py-1" />
              </tr>
            </tbody>
          </table>
        </div>

        {pagando && <FormularioPago d={d} alCerrar={() => setPagando(false)} alGuardar={() => { setPagando(false); setPestana('pagos'); consulta.recargar(); }} />}
        {editandoPago && <FormularioEditarPago pago={editandoPago} alCerrar={() => setEditandoPago(null)} alGuardar={() => { setEditandoPago(null); recargarTodo(); }} />}
        {anulandoPago && (
          <DialogoMotivo
            titulo={`Anular pago de ${pesos(anulandoPago.monto)}`}
            mensaje="El pago queda sin efecto y las cuotas que cubría vuelven a figurar como pendientes. El registro se conserva en el historial."
            confirmar="Anular pago"
            alCerrar={() => setAnulandoPago(null)}
            alConfirmar={async (motivo) => {
              try {
                await api.post(`/pagos/${anulandoPago.id}/anular`, { motivo });
                avisos.ok('Pago anulado');
                setAnulandoPago(null);
                recargarTodo();
              } catch (err) {
                avisos.error(err);
              }
            }}
          />
        )}
        {anulandoVenta && (
          <DialogoMotivo
            titulo="Anular venta"
            mensaje="La venta deja de contar como cartera por cobrar y la parcela vuelve a quedar disponible. Los pagos recibidos se conservan en el historial; una eventual devolución se gestiona fuera del sistema."
            confirmar="Anular venta"
            alCerrar={() => setAnulandoVenta(false)}
            alConfirmar={async (motivo) => {
              try {
                await api.post(`/ventas/${id}/anular`, { motivo });
                avisos.ok('Venta anulada');
                setAnulandoVenta(false);
                recargarTodo();
              } catch (err) {
                avisos.error(err);
              }
            }}
          />
        )}
      </>
    );
  }
}
