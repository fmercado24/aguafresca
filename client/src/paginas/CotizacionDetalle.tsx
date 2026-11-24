import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Ban, BellRing, CircleCheck, HandCoins, MessageCircle, Pencil, Printer, RotateCcw, Trash2, TriangleAlert } from 'lucide-react';
import { api, useDatos } from '../api';
import { useAvisos, useConfig, useSesion } from '../contexto';
import { Membrete } from '../componentes/Membrete';
import { PieFirma } from '../componentes/PieFirma';
import { fecha, fechaHoraRegistro, fechaLarga, formatearRut, numero, pesos, porcentaje } from '../formato';
import type { CotizacionDetalle } from '../tipos';
import { enlaceWhatsApp } from '../whatsapp';
import { AreaTexto, Boton, Carga, Casilla, Campo, Encabezado, EnlaceBoton, InsigniaCotizacion, Modal, useNombreArchivo } from '../ui';

// ---------- Aviso de venta al administrador (usuario) ----------

/** El usuario (ldiaz) cierra la venta con el cliente y la informa: el administrador recibe el aviso y la registra. */
function InformarVenta({ id, parcelaDisponible, alInformar }: { id: number; parcelaDisponible: boolean; alInformar: () => void }) {
  const avisos = useAvisos();
  const [abierto, setAbierto] = useState(false);
  const [notas, setNotas] = useState('');
  const [reservar, setReservar] = useState(true);
  const [enviando, setEnviando] = useState(false);

  async function informar() {
    setEnviando(true);
    try {
      await api.post(`/cotizaciones/${id}/informar-venta`, { notas, reservar });
      avisos.ok('Venta informada: el administrador recibió el aviso para registrarla');
      setAbierto(false);
      alInformar();
    } catch (err) {
      avisos.error(err);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Boton icono={BellRing} onClick={() => setAbierto(true)}>Informar venta al administrador</Boton>
      {abierto && (
        <Modal
          abierto alCerrar={() => setAbierto(false)} titulo="Informar la venta al administrador" ancho="sm"
          pie={<><Boton variante="secundario" onClick={() => setAbierto(false)}>Cancelar</Boton><Boton icono={BellRing} cargando={enviando} onClick={informar}>Informar venta</Boton></>}
        >
          <div className="space-y-3 text-sm">
            <p className="text-stone-700">
              El administrador recibirá un aviso con los datos de esta cotización (parcela, comprador, precio y forma de pago) para registrar la venta.
              Usted no registra pagos ni cuotas.
            </p>
            <Campo etiqueta="Notas para el administrador (opcional)">
              <AreaTexto rows={3} maxLength={2000} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej.: firmó hoy; paga el pie por transferencia el lunes." />
            </Campo>
            {parcelaDisponible && (
              <Casilla checked={reservar} onChange={(e) => setReservar(e.target.checked)} etiqueta="Reservar la parcela mientras el administrador registra la venta" />
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

function EstadoSolicitud({ s }: { s: NonNullable<CotizacionDetalle['solicitud']> }) {
  if (s.estado === 'pendiente') {
    return (
      <div className="no-imprimir mx-auto mb-4 flex max-w-3xl items-start gap-2 rounded-xl border border-marca-200 bg-marca-50 px-4 py-3 text-sm text-marca-900">
        <BellRing className="mt-0.5 size-4 shrink-0" />
        <div>
          <strong>Venta informada al administrador</strong> por {s.informada_por ?? '—'} el {fechaHoraRegistro(s.creado_en)}: espera que la registre.
          {s.reservo_parcela ? ' La parcela quedó reservada.' : ''}
          {s.notas && <div className="mt-1 text-marca-800">Notas: {s.notas}</div>}
        </div>
      </div>
    );
  }
  if (s.estado === 'registrada') {
    return (
      <div className="no-imprimir mx-auto mb-4 flex max-w-3xl items-start gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
        <CircleCheck className="mt-0.5 size-4 shrink-0" />
        <div>
          Venta informada por {s.informada_por ?? '—'} y registrada por {s.resuelta_por ?? '—'}{s.resuelto_en ? ` el ${fechaHoraRegistro(s.resuelto_en)}` : ''}.
          {s.venta_id && <> <Link to={`/ventas/${s.venta_id}`} className="font-medium underline">Ver la venta</Link>.</>}
        </div>
      </div>
    );
  }
  return (
    <div className="no-imprimir mx-auto mb-4 flex max-w-3xl items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <div>La venta informada no se registró ({s.resuelta_por ?? '—'}{s.resuelto_en ? `, ${fechaHoraRegistro(s.resuelto_en)}` : ''}). Motivo: {s.motivo}</div>
    </div>
  );
}

export function CotizacionDetallePagina() {
  const { id } = useParams();
  return <Detalle key={id} id={Number(id)} />;
}

function Detalle({ id }: { id: number }) {
  const { puede } = useSesion();
  const opera = puede('operaciones');
  const cotiza = puede('cotizaciones');
  const informa = puede('informar_ventas');
  const { empresa, proyecto } = useConfig();
  const avisos = useAvisos();
  const navegar = useNavigate();
  const consulta = useDatos<CotizacionDetalle>(`/cotizaciones/${id}`);
  useNombreArchivo(consulta.datos ? `Cotización - ${consulta.datos.cotizacion.contacto_nombre}` : null);

  async function cambiarEstado(estado: 'vigente' | 'rechazada') {
    try {
      await api.post(`/cotizaciones/${id}/estado`, { estado });
      consulta.recargar();
    } catch (err) {
      avisos.error(err);
    }
  }

  async function eliminar() {
    if (!(await avisos.confirmar({ titulo: `¿Eliminar la cotización N° ${id}?`, confirmar: 'Eliminar', peligro: true }))) return;
    try {
      await api.del(`/cotizaciones/${id}`);
      avisos.ok('Cotización eliminada');
      navegar('/cotizaciones');
    } catch (err) {
      avisos.error(err);
    }
  }

  return (
    <Carga consulta={consulta}>
      {({ cotizacion: q, parcela, simulacion: s, solicitud }) => {
        const contado = s.monto_financiado === 0;
        const sePuedeVender = q.estado === 'vigente' && (parcela.estado === 'disponible' || parcela.estado === 'reservada');
        // Mientras el administrador no registre la venta informada, la cotización no se modifica.
        const informada = solicitud?.estado === 'pendiente';
        const editable = cotiza && !informada;
        // Crédito por monto de cuota: todas iguales y la última menor.
        const ultimaMenor = !contado && !!s.cuota_objetivo && s.n_cuotas > 1 && s.ultima_cuota !== s.valor_cuota;
        const cuotasIguales = ultimaMenor ? s.n_cuotas - 1 : s.n_cuotas;
        const resumen = [
          `Cotización N° ${q.id} — ${proyecto.nombre}`,
          `Parcela ${parcela.numero} (${numero(parcela.superficie_m2)} m²)`,
          `Precio: ${pesos(q.precio)}`,
          ...(contado ? ['Pago al contado'] : [`Pie: ${pesos(q.pie)}`, `${cuotasIguales} cuotas mensuales de ${pesos(s.valor_cuota)}${ultimaMenor ? ` y una última de ${pesos(s.ultima_cuota)}` : ''}`]),
          `Válida hasta el ${fecha(q.valida_hasta)}`,
          empresa.razon_social,
        ].join('\n');
        const telefono = q.contacto_telefono.replace(/\D/g, '');
        const fila = (etiqueta: string, valor: string, fuerte = false) => (
          <tr className={fuerte ? 'font-semibold' : ''}>
            <td className="border border-stone-300 px-3 py-1.5">{etiqueta}</td>
            <td className="border border-stone-300 px-3 py-1.5 text-right tabular-nums">{valor}</td>
          </tr>
        );

        return (
          <>
            <Encabezado
              volver={{ a: '/cotizaciones', texto: 'Cotizaciones' }}
              titulo={<span className="flex flex-wrap items-center gap-2">Cotización N° {q.id} <InsigniaCotizacion estado={q.estado} vencida={q.vencida} /></span>}
              descripcion={q.venta_id ? <>Dio origen a una <Link to={`/ventas/${q.venta_id}`} className="font-medium text-marca-700 hover:underline">venta</Link>.</> : undefined}
            >
              <Boton icono={Printer} onClick={() => window.print()}>Imprimir o guardar PDF</Boton>
              <a
                href={enlaceWhatsApp(telefono.length >= 9 ? telefono : '', resumen)}
                target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium text-stone-800 shadow-xs hover:bg-stone-50"
              >
                <MessageCircle className="size-4" />WhatsApp
              </a>
              {opera && sePuedeVender && <EnlaceBoton variante={informada ? 'primario' : 'secundario'} icono={HandCoins} to={`/ventas/nueva?cotizacion=${q.id}`}>{informada ? 'Registrar la venta informada' : 'Convertir en venta'}</EnlaceBoton>}
              {informa && !opera && sePuedeVender && !informada && <InformarVenta id={q.id} parcelaDisponible={parcela.estado === 'disponible'} alInformar={consulta.recargar} />}
              {editable && q.estado !== 'aceptada' && <EnlaceBoton variante="secundario" icono={Pencil} to={`/cotizaciones/${q.id}/editar`}>Editar</EnlaceBoton>}
              {editable && q.estado === 'vigente' && <Boton variante="fantasma" icono={Ban} onClick={() => cambiarEstado('rechazada')}>Marcar rechazada</Boton>}
              {editable && q.estado === 'rechazada' && <Boton variante="fantasma" icono={RotateCcw} onClick={() => cambiarEstado('vigente')}>Reactivar</Boton>}
              {editable && q.estado !== 'aceptada' && <Boton variante="fantasma" icono={Trash2} onClick={eliminar} aria-label="Eliminar cotización" />}
            </Encabezado>

            {solicitud && <EstadoSolicitud s={solicitud} />}

            <div className="hoja mx-auto max-w-3xl rounded-xl border border-stone-200 bg-white p-6 text-stone-900 shadow-sm sm:p-10">
              <Membrete titulo="Cotización" subtitulo={`N° ${String(q.id).padStart(5, '0')}`} fecha={q.fecha} />

              <div className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Señor(a)</div>
                  <div className="font-medium">{q.contacto_nombre}</div>
                  {q.contacto_rut && <div>RUT {formatearRut(q.contacto_rut)}</div>}
                  {q.contacto_telefono && <div>{q.contacto_telefono}</div>}
                  {q.contacto_email && <div>{q.contacto_email}</div>}
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Propiedad cotizada</div>
                  <div className="font-medium">Parcela N° {parcela.numero} — {proyecto.nombre}</div>
                  <div>Superficie aproximada: {numero(parcela.superficie_m2)} m²</div>
                  {parcela.sector && <div>{parcela.sector}</div>}
                  {parcela.rol_sii && <div>Rol de avalúo {parcela.rol_sii}</div>}
                  {proyecto.ubicacion && <div>{proyecto.ubicacion}</div>}
                </div>
              </div>

              <table className="mt-6 w-full border-collapse text-sm">
                <tbody>
                  {q.descuento > 0 && fila('Precio de lista', pesos(q.precio_lista))}
                  {q.descuento > 0 && fila('Descuento', `- ${pesos(q.descuento)}`)}
                  {fila('Precio de venta', pesos(q.precio), true)}
                  {contado ? fila('Forma de pago', 'Al contado') : (
                    <>
                      {fila('Pie', pesos(q.pie))}
                      {fila('Saldo de precio a crédito', pesos(s.monto_financiado))}
                      {fila('Interés', s.tasa_mensual > 0 ? `${porcentaje(s.tasa_mensual)} mensual (${porcentaje(s.tasa_anual)} anual)` : 'Sin interés')}
                      {fila(`${cuotasIguales} cuotas mensuales de`, pesos(s.valor_cuota), true)}
                      {ultimaMenor && fila('Última cuota', pesos(s.ultima_cuota))}
                      {fila('Total de intereses', pesos(s.total_intereses))}
                      {fila('Total a pagar (pie + cuotas)', pesos(s.total_operacion))}
                    </>
                  )}
                </tbody>
              </table>

              {q.observaciones && <p className="mt-4 whitespace-pre-line text-sm">{q.observaciones}</p>}
              <p className="mt-4 text-sm">
                Cotización válida hasta el <strong>{fechaLarga(q.valida_hasta)}</strong>, sujeta a la disponibilidad de la parcela a la fecha de firma de la promesa de compraventa.
              </p>

              <PieFirma className="mt-10" />
              {/* Quién cotizó: solo en pantalla, no en la cotización impresa */}
              {q.usuario && <p className="mt-4 text-right text-xs text-stone-500 print:hidden">Cotización hecha por {q.usuario}</p>}

              {s.filas.length > 0 && (
                <div className="mt-8 break-before-page">
                  <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">Tabla de amortización referencial</h2>
                  <div className="overflow-x-auto print:overflow-visible">
                  <table className="w-full border-collapse text-xs tabular-nums">
                    <thead>
                      <tr className="bg-stone-100">
                        {['N°', 'Vencimiento', 'Cuota', 'Interés', 'Amortización', 'Saldo'].map((h, i) => (
                          <th key={h} className={`border border-stone-300 px-2 py-1 ${i > 1 ? 'text-right' : 'text-left'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {s.filas.map((f) => (
                        <tr key={f.numero}>
                          <td className="border border-stone-300 px-2 py-0.5">{f.numero}</td>
                          <td className="border border-stone-300 px-2 py-0.5">{fecha(f.fecha)}</td>
                          <td className="border border-stone-300 px-2 py-0.5 text-right">{pesos(f.cuota)}</td>
                          <td className="border border-stone-300 px-2 py-0.5 text-right">{pesos(f.interes)}</td>
                          <td className="border border-stone-300 px-2 py-0.5 text-right">{pesos(f.amortizacion)}</td>
                          <td className="border border-stone-300 px-2 py-0.5 text-right">{pesos(f.saldo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                  <p className="mt-2 text-xs text-stone-600">Las fechas de vencimiento son referenciales y se fijan en definitiva al firmar la promesa de compraventa.</p>
                </div>
              )}
            </div>
          </>
        );
      }}
    </Carga>
  );
}
