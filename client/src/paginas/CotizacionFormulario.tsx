import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { api, useDatos } from '../api';
import { useAvisos, useConfig } from '../contexto';
import { CamposCredito, ResumenSimulacion, useSimulacion, type Condiciones, plazoDe } from '../componentes/Credito';
import { SelectorCliente } from '../componentes/FormularioCliente';
import { correoValido, errorTelefono, formatearRut, numero, pesos, rutValido, sumarDias, sumarMeses, precioLista as textoPrecio } from '../formato';
import type { ClienteResumen, CotizacionDetalle, Parcela } from '../tipos';
import {
  AreaTexto, Boton, Campo, Cargando, Encabezado, EnlaceBoton, Entrada, EntradaMonto, Selector, Tarjeta, EntradaRut, EntradaTelefono,
} from '../ui';

/** Alta y edición de una cotización, con simulación del crédito en vivo. */
export function CotizacionFormulario() {
  const { id } = useParams();
  return <Formulario key={id ?? 'nueva'} id={id ? Number(id) : null} />;
}

function Formulario({ id }: { id: number | null }) {
  const config = useConfig();
  const avisos = useAvisos();
  const navegar = useNavigate();
  const [params] = useSearchParams();

  const parcelas = useDatos<Parcela[]>('/parcelas');
  const clientes = useDatos<ClienteResumen[]>('/clientes');
  const existente = useDatos<CotizacionDetalle>(id ? `/cotizaciones/${id}` : null);

  const [parcelaId, setParcelaId] = useState<number | null>(Number(params.get('parcela')) || null);
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [contacto, setContacto] = useState({ nombre: '', rut: '', telefono: '', email: '' });
  const [fecha, setFecha] = useState(config.hoy);
  const [validaHasta, setValidaHasta] = useState(sumarDias(config.hoy, config.credito.dias_validez_cotizacion));
  const [precioLista, setPrecioLista] = useState<number | null>(null);
  const [descuento, setDescuento] = useState<number | null>(null);
  const [cond, setCond] = useState<Condiciones>({
    pie: null,
    modo: 'cuotas',
    cuota_objetivo: null,
    n_cuotas: String(config.credito.n_cuotas),
    tasa_mensual: String(config.credito.tasa_mensual),
    fecha_primera_cuota: sumarMeses(config.hoy, 1),
  });
  const [observaciones, setObservaciones] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [precargado, setPrecargado] = useState(false);

  const precio = precioLista ? Math.max(0, precioLista - (descuento ?? 0)) : null;
  const { sim, error } = useSimulacion(precio, cond);
  const parcela = parcelas.datos?.find((p) => p.id === parcelaId) ?? null;
  const pieSugerido = (monto: number) => Math.round((monto * config.credito.pie_porcentaje) / 100 / 100_000) * 100_000;

  function elegirParcela(nuevaId: number | null) {
    setParcelaId(nuevaId);
    const p = parcelas.datos?.find((x) => x.id === nuevaId);
    if (p) {
      setPrecioLista(p.precio);
      setCond((c) => ({ ...c, pie: pieSugerido(p.precio - (descuento ?? 0)) }));
    }
  }

  function elegirCliente(nuevoId: number | null, lista = clientes.datos) {
    setClienteId(nuevoId);
    const c = lista?.find((x) => x.id === nuevoId);
    if (c) setContacto({ nombre: c.nombre, rut: formatearRut(c.rut), telefono: c.telefono, email: c.email });
  }

  useEffect(() => {
    if (precargado || !parcelas.datos) return;
    if (id) {
      if (!existente.datos) return;
      const q = existente.datos.cotizacion;
      setParcelaId(q.parcela_id);
      setClienteId(q.cliente_id);
      setContacto({ nombre: q.contacto_nombre, rut: formatearRut(q.contacto_rut), telefono: q.contacto_telefono, email: q.contacto_email });
      setFecha(q.fecha);
      setValidaHasta(q.valida_hasta);
      setPrecioLista(q.precio_lista);
      setDescuento(q.descuento || null);
      setCond({ pie: q.pie, modo: q.cuota_objetivo ? 'monto' : 'cuotas', cuota_objetivo: q.cuota_objetivo ?? null, n_cuotas: String(q.n_cuotas || ''), tasa_mensual: String(q.tasa_mensual), fecha_primera_cuota: q.fecha_primera_cuota ?? '' });
      setObservaciones(q.observaciones);
    } else if (parcelaId) {
      elegirParcela(parcelaId);
    }
    setPrecargado(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcelas.datos, existente.datos]);

  if (!parcelas.datos || !clientes.datos || (id && !existente.datos)) return <Cargando />;

  const elegibles = parcelas.datos.filter((p) => p.estado === 'disponible' || p.estado === 'reservada' || p.id === parcelaId);
  const financiado = sim?.monto_financiado ?? 0;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!parcelaId) return avisos.error('Seleccione la parcela');
    if (contacto.rut.trim() && !rutValido(contacto.rut)) return avisos.error('Revise el RUT del interesado: el dígito verificador no coincide');
    const errTel = errorTelefono(contacto.telefono, true);
    if (errTel) return avisos.error(errTel);
    if (!correoValido(contacto.email)) return avisos.error('Revise el correo del interesado (ej.: nombre@dominio.cl)');
    // La forma de pago se toma de la simulación: si aún se está calculando, se espera.
    if (error) return avisos.error(error);
    if (!sim || sim.precio !== precio) return avisos.error('Espere un momento: se está calculando el crédito');
    setGuardando(true);
    const cuerpo = {
      parcela_id: parcelaId,
      cliente_id: clienteId,
      contacto_nombre: contacto.nombre,
      contacto_rut: contacto.rut,
      contacto_telefono: contacto.telefono,
      contacto_email: contacto.email,
      fecha,
      valida_hasta: validaHasta,
      precio_lista: precioLista,
      descuento: descuento ?? 0,
      pie: cond.pie ?? 0,
      ...(financiado > 0 ? plazoDe(cond) : { n_cuotas: 0, cuota_objetivo: null }),
      tasa_mensual: financiado > 0 ? cond.tasa_mensual : 0,
      fecha_primera_cuota: financiado > 0 ? cond.fecha_primera_cuota || null : null,
      observaciones,
    };
    try {
      const destino = id ? (await api.put(`/cotizaciones/${id}`, cuerpo), id) : (await api.post('/cotizaciones', cuerpo)).id;
      avisos.ok(id ? 'Cotización actualizada' : 'Cotización creada');
      navegar(`/cotizaciones/${destino}`, { replace: true });
    } catch (err) {
      avisos.error(err);
      setGuardando(false);
    }
  }

  return (
    <>
      <Encabezado
        volver={id ? { a: `/cotizaciones/${id}`, texto: `Cotización N° ${id}` } : { a: '/cotizaciones', texto: 'Cotizaciones' }}
        titulo={id ? `Editar cotización N° ${id}` : 'Nueva cotización'}
      />
      <form onSubmit={guardar} className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-4">
          <Tarjeta titulo="Interesado">
            <div className="space-y-3">
              <div>
                <span className="mb-1 block text-xs font-medium text-stone-600">Cliente ya registrado (opcional)</span>
                <SelectorCliente
                  clientes={clientes.datos}
                  valor={clienteId}
                  alCambiar={(v) => elegirCliente(v)}
                  alCrear={(nuevo) => {
                    clientes.recargar();
                    setClienteId(nuevo);
                    api.get<ClienteResumen[]>('/clientes').then((lista) => elegirCliente(nuevo, lista)).catch(() => undefined);
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Campo etiqueta="Nombre" className="col-span-2 sm:col-span-1">
                  <Entrada required maxLength={160} value={contacto.nombre} onChange={(e) => setContacto({ ...contacto, nombre: e.target.value })} />
                </Campo>
                <Campo etiqueta="RUT (opcional)" className="col-span-2 sm:col-span-1">
                  <EntradaRut valor={contacto.rut} alCambiar={(v) => setContacto({ ...contacto, rut: v })} />
                </Campo>
                <Campo etiqueta="Celular">
                  <EntradaTelefono movil valor={contacto.telefono} alCambiar={(v) => setContacto({ ...contacto, telefono: v })} />
                </Campo>
                <Campo etiqueta="Correo electrónico">
                  <Entrada type="email" maxLength={160} placeholder="nombre@dominio.cl" value={contacto.email} onChange={(e) => setContacto({ ...contacto, email: e.target.value })} />
                </Campo>
              </div>
            </div>
          </Tarjeta>

          <Tarjeta titulo="Parcela y precio">
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Parcela" className="col-span-2" ayuda={parcela ? `${numero(parcela.superficie_m2)} m²${parcela.sector ? ` · ${parcela.sector}` : ''}${parcela.estado === 'reservada' ? ' · actualmente reservada' : ''}` : undefined}>
                <Selector required value={parcelaId ?? ''} onChange={(e) => elegirParcela(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Seleccione una parcela…</option>
                  {elegibles.map((p) => <option key={p.id} value={p.id}>Parcela {p.numero} — {textoPrecio(p.precio)}</option>)}
                </Selector>
              </Campo>
              <Campo etiqueta="Precio de lista">
                <EntradaMonto required valor={precioLista} alCambiar={setPrecioLista} />
              </Campo>
              <Campo etiqueta="Descuento" ayuda={precio !== null && (descuento ?? 0) > 0 ? `Precio final: ${pesos(precio)}` : undefined}>
                <EntradaMonto valor={descuento} alCambiar={setDescuento} />
              </Campo>
            </div>
          </Tarjeta>

          <Tarjeta titulo="Forma de pago">
            <CamposCredito precio={precio} valor={cond} alCambiar={setCond} />
          </Tarjeta>

          <Tarjeta titulo="Vigencia y observaciones">
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Fecha de la cotización">
                <Entrada type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </Campo>
              <Campo etiqueta="Válida hasta">
                <Entrada type="date" required min={fecha} value={validaHasta} onChange={(e) => setValidaHasta(e.target.value)} />
              </Campo>
              <Campo etiqueta="Observaciones (se imprimen en la cotización)" className="col-span-2">
                <AreaTexto value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
              </Campo>
            </div>
          </Tarjeta>
        </div>

        <div className="space-y-4 lg:sticky lg:top-6">
          <Tarjeta titulo="Simulación">
            <ResumenSimulacion sim={sim} error={error} />
          </Tarjeta>
          <div className="flex justify-end gap-2">
            <EnlaceBoton variante="secundario" to={id ? `/cotizaciones/${id}` : '/cotizaciones'}>Cancelar</EnlaceBoton>
            <Boton type="submit" cargando={guardando} disabled={!!error}>Guardar cotización</Boton>
          </div>
        </div>
      </form>
    </>
  );
}
