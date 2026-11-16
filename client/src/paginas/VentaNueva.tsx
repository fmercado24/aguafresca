import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { api, useDatos } from '../api';
import { useAvisos, useConfig, useSesion } from '../contexto';
import { CamposCredito, ResumenSimulacion, useSimulacion, type Condiciones, plazoDe } from '../componentes/Credito';
import { SelectorCliente } from '../componentes/FormularioCliente';
import { MEDIOS_PAGO, numero, pesos, sumarMeses, precioLista } from '../formato';
import type { ClienteResumen, CotizacionDetalle, Cuenta, Parcela } from '../tipos';
import {
  AreaTexto, Boton, Campo, Cargando, Casilla, Encabezado, EnlaceBoton, Entrada, EntradaMonto, Selector, Tarjeta, EntradaEntero,
} from '../ui';

export function VentaNueva() {
  const config = useConfig();
  const { usuario } = useSesion();
  const avisos = useAvisos();
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const cotizacionId = Number(params.get('cotizacion')) || null;

  const parcelas = useDatos<Parcela[]>('/parcelas');
  const clientes = useDatos<ClienteResumen[]>('/clientes');
  const usuarios = useDatos<Cuenta[]>('/usuarios');
  const cotizacion = useDatos<CotizacionDetalle>(cotizacionId ? `/cotizaciones/${cotizacionId}` : null);

  const [parcelaId, setParcelaId] = useState<number | null>(Number(params.get('parcela')) || null);
  const [clienteId, setClienteId] = useState<number | null>(Number(params.get('cliente')) || null);
  const [fecha, setFecha] = useState(config.hoy);
  const [precio, setPrecio] = useState<number | null>(null);
  const [cond, setCond] = useState<Condiciones>({
    pie: null,
    modo: 'cuotas',
    cuota_objetivo: null,
    n_cuotas: String(config.credito.n_cuotas),
    tasa_mensual: String(config.credito.tasa_mensual),
    fecha_primera_cuota: sumarMeses(config.hoy, 1),
  });
  const [vendedorId, setVendedorId] = useState<number | null>(usuario?.id ?? null);
  const [observaciones, setObservaciones] = useState('');
  const [piePagado, setPiePagado] = useState(true);
  const [medioPie, setMedioPie] = useState('transferencia');
  const [ventaAntigua, setVentaAntigua] = useState(false);
  const [cuotasPagadas, setCuotasPagadas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [precargado, setPrecargado] = useState(false);

  const parcela = parcelas.datos?.find((p) => p.id === parcelaId) ?? null;
  const { sim, error } = useSimulacion(precio, cond);

  const pieSugerido = (monto: number) => Math.round((monto * config.credito.pie_porcentaje) / 100 / 100_000) * 100_000;

  // Al elegir la parcela se proponen su precio de lista y el pie habitual.
  function elegirParcela(id: number | null) {
    setParcelaId(id);
    const p = parcelas.datos?.find((x) => x.id === id);
    if (p) {
      setPrecio(p.precio);
      setCond((c) => ({ ...c, pie: pieSugerido(p.precio) }));
    }
  }

  // Precarga: desde una cotización aceptada, o desde la parcela indicada en el enlace.
  useEffect(() => {
    if (precargado || !parcelas.datos) return;
    if (cotizacionId) {
      if (!cotizacion.datos) return;
      const q = cotizacion.datos.cotizacion;
      setParcelaId(q.parcela_id);
      if (q.cliente_id) setClienteId(q.cliente_id);
      setPrecio(q.precio);
      setCond({
        pie: q.pie,
        n_cuotas: String(q.n_cuotas || ''),
        modo: q.cuota_objetivo ? 'monto' : 'cuotas',
        cuota_objetivo: q.cuota_objetivo ?? null,
        tasa_mensual: String(q.tasa_mensual),
        fecha_primera_cuota: q.fecha_primera_cuota && q.fecha_primera_cuota > config.hoy ? q.fecha_primera_cuota : sumarMeses(config.hoy, 1),
      });
      setObservaciones(`Según cotización N° ${q.id}.`);
    } else if (parcelaId) {
      elegirParcela(parcelaId);
    }
    setPrecargado(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcelas.datos, cotizacion.datos]);

  if (!parcelas.datos || !clientes.datos || (cotizacionId && !cotizacion.datos)) return <Cargando />;

  const disponibles = parcelas.datos.filter((p) => p.estado === 'disponible' || p.estado === 'reservada' || p.id === parcelaId);
  const contacto = cotizacion.datos?.cotizacion;
  const financiado = sim?.monto_financiado ?? 0;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!parcelaId) return avisos.error('Seleccione la parcela');
    if (!clienteId) return avisos.error('Seleccione o cree el cliente comprador');
    if (!precio) return avisos.error('Indique el precio de venta');
    // La forma de pago se toma de la simulación: si aún se está calculando, se espera.
    if (error) return avisos.error(error);
    if (!sim || sim.precio !== precio) return avisos.error('Espere un momento: se está calculando el crédito');
    setGuardando(true);
    try {
      const { id } = await api.post('/ventas', {
        parcela_id: parcelaId,
        cliente_id: clienteId,
        cotizacion_id: cotizacionId,
        vendedor_id: vendedorId,
        fecha,
        precio,
        pie: cond.pie ?? 0,
        ...(financiado > 0 ? plazoDe(cond) : { n_cuotas: 0, cuota_objetivo: null }),
        tasa_mensual: financiado > 0 ? cond.tasa_mensual : 0,
        fecha_primera_cuota: financiado > 0 ? cond.fecha_primera_cuota : null,
        observaciones,
        pie_pagado: piePagado,
        medio_pie: medioPie,
        cuotas_pagadas: ventaAntigua ? cuotasPagadas || 0 : 0,
      });
      avisos.ok('Venta registrada');
      navegar(`/ventas/${id}`, { replace: true });
    } catch (err) {
      avisos.error(err);
      setGuardando(false);
    }
  }

  return (
    <>
      <Encabezado
        volver={{ a: '/ventas', texto: 'Ventas' }}
        titulo="Nueva venta"
        descripcion={contacto ? `A partir de la cotización N° ${contacto.id} para ${contacto.contacto_nombre}` : 'Al guardar se genera el calendario de cuotas con su tabla de amortización.'}
      />
      {cotizacion.datos?.solicitud?.estado === 'pendiente' && (
        <p className="mb-4 rounded-xl border border-marca-200 bg-marca-50 px-4 py-3 text-sm text-marca-900">
          <strong>Venta informada por {cotizacion.datos.solicitud.informada_por}.</strong> Revise el comprador y la forma de pago, y regístrela:
          al guardar se le avisará que quedó registrada.
          {cotizacion.datos.solicitud.notas && <span className="mt-1 block">Notas: {cotizacion.datos.solicitud.notas}</span>}
        </p>
      )}
      <form onSubmit={guardar} className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-4">
          <Tarjeta titulo="Parcela y comprador">
            <div className="space-y-3">
              <Campo etiqueta="Parcela" ayuda={parcela ? `${numero(parcela.superficie_m2)} m² · precio de lista ${parcela.precio > 0 ? pesos(parcela.precio) : 'por definir'}${parcela.estado === 'reservada' ? ' · actualmente reservada' : ''}` : undefined}>
                <Selector required value={parcelaId ?? ''} onChange={(e) => elegirParcela(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Seleccione una parcela disponible…</option>
                  {disponibles.map((p) => <option key={p.id} value={p.id}>Parcela {p.numero}{p.sector ? ` · ${p.sector}` : ''} — {precioLista(p.precio)}</option>)}
                </Selector>
              </Campo>
              <div>
                <span className="mb-1 block text-xs font-medium text-stone-600">Comprador</span>
                <SelectorCliente
                  clientes={clientes.datos}
                  valor={clienteId}
                  alCambiar={setClienteId}
                  alCrear={(id) => { clientes.recargar(); setClienteId(id); }}
                  sugerido={contacto && !contacto.cliente_id ? { nombre: contacto.contacto_nombre, rut: contacto.contacto_rut, telefono: contacto.contacto_telefono, email: contacto.contacto_email } : undefined}
                />
              </div>
            </div>
          </Tarjeta>

          <Tarjeta titulo="Precio y forma de pago">
            <div className="mb-3 grid grid-cols-2 gap-3">
              <Campo etiqueta="Fecha de la venta">
                <Entrada
                  type="date" required value={fecha}
                  onChange={(e) => {
                    const nueva = e.target.value;
                    // La primera cuota acompaña a la fecha de venta mientras no se haya ajustado a mano.
                    setCond((c) => (c.fecha_primera_cuota === sumarMeses(fecha, 1) && nueva ? { ...c, fecha_primera_cuota: sumarMeses(nueva, 1) } : c));
                    setFecha(nueva);
                  }}
                />
              </Campo>
              <Campo etiqueta="Precio de venta">
                <EntradaMonto required valor={precio} alCambiar={setPrecio} />
              </Campo>
            </div>
            <CamposCredito precio={precio} valor={cond} alCambiar={setCond} />
          </Tarjeta>

          <Tarjeta titulo="Pagos ya recibidos">
            <div className="space-y-3">
              {(cond.pie ?? 0) > 0 && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Casilla
                    checked={piePagado} onChange={(e) => setPiePagado(e.target.checked)}
                    etiqueta={financiado > 0 ? `El pie de ${pesos(cond.pie)} ya fue pagado` : `El pago al contado de ${pesos(cond.pie)} ya fue recibido`}
                  />
                  {piePagado && (
                    <Selector value={medioPie} onChange={(e) => setMedioPie(e.target.value)} className="!w-auto" aria-label="Medio de pago del pie">
                      {config.medios_pago.map((m) => <option key={m} value={m}>{MEDIOS_PAGO[m] ?? m}</option>)}
                    </Selector>
                  )}
                </div>
              )}
              {financiado > 0 && (
                <>
                  <Casilla
                    checked={ventaAntigua} onChange={(e) => setVentaAntigua(e.target.checked)}
                    etiqueta="Es una venta anterior que estoy cargando al sistema y ya tiene cuotas pagadas"
                  />
                  {ventaAntigua && (
                    <Campo etiqueta="Cantidad de cuotas ya pagadas" ayuda="Se registrará un pago por cada una, en su fecha de vencimiento. Después podrá corregirlos en la venta." className="max-w-xs">
                      <EntradaEntero valor={String(cuotasPagadas)} alCambiar={(v) => setCuotasPagadas(v)} />
                    </Campo>
                  )}
                </>
              )}
              {(cond.pie ?? 0) === 0 && financiado === 0 && <p className="text-sm text-stone-500">Indique primero el precio y la forma de pago.</p>}
            </div>
          </Tarjeta>

          <Tarjeta titulo="Otros datos">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Vendedor">
                <Selector value={vendedorId ?? ''} onChange={(e) => setVendedorId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Sin asignar</option>
                  {(usuarios.datos ?? []).map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                </Selector>
              </Campo>
              <Campo etiqueta="Observaciones" className="sm:col-span-2">
                <AreaTexto rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
              </Campo>
            </div>
          </Tarjeta>
        </div>

        <div className="space-y-4 lg:sticky lg:top-6">
          <Tarjeta titulo="Simulación del crédito">
            <ResumenSimulacion sim={sim} error={error} />
          </Tarjeta>
          <div className="flex justify-end gap-2">
            <EnlaceBoton variante="secundario" to="/ventas">Cancelar</EnlaceBoton>
            <Boton type="submit" cargando={guardando} disabled={!!error}>Registrar venta</Boton>
          </div>
        </div>
      </form>
    </>
  );
}
