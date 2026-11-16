import { Link, useNavigate, useParams } from 'react-router';
import { Ban, HandCoins, MessageCircle, Pencil, Printer, RotateCcw, Trash2 } from 'lucide-react';
import { api, useDatos } from '../api';
import { useAvisos, useConfig } from '../contexto';
import { Membrete } from '../componentes/Membrete';
import { fecha, fechaLarga, formatearRut, numero, pesos, porcentaje } from '../formato';
import type { CotizacionDetalle } from '../tipos';
import { Boton, Carga, Encabezado, EnlaceBoton, InsigniaCotizacion } from '../ui';

export function CotizacionDetallePagina() {
  const { id } = useParams();
  return <Detalle key={id} id={Number(id)} />;
}

function Detalle({ id }: { id: number }) {
  const { empresa, proyecto } = useConfig();
  const avisos = useAvisos();
  const navegar = useNavigate();
  const consulta = useDatos<CotizacionDetalle>(`/cotizaciones/${id}`);

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
      {({ cotizacion: q, parcela, simulacion: s }) => {
        const contado = s.monto_financiado === 0;
        const sePuedeVender = q.estado === 'vigente' && (parcela.estado === 'disponible' || parcela.estado === 'reservada');
        const resumen = [
          `Cotización N° ${q.id} — ${proyecto.nombre}`,
          `Parcela ${parcela.numero} (${numero(parcela.superficie_m2)} m²)`,
          `Precio: ${pesos(q.precio)}`,
          ...(contado ? ['Pago al contado'] : [`Pie: ${pesos(q.pie)}`, `${s.n_cuotas} cuotas mensuales de ${pesos(s.valor_cuota)}`]),
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
                href={`https://wa.me/${telefono.length >= 9 ? telefono : ''}?text=${encodeURIComponent(resumen)}`}
                target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium text-stone-800 shadow-xs hover:bg-stone-50"
              >
                <MessageCircle className="size-4" />WhatsApp
              </a>
              {sePuedeVender && <EnlaceBoton variante="secundario" icono={HandCoins} to={`/ventas/nueva?cotizacion=${q.id}`}>Convertir en venta</EnlaceBoton>}
              {q.estado !== 'aceptada' && <EnlaceBoton variante="secundario" icono={Pencil} to={`/cotizaciones/${q.id}/editar`}>Editar</EnlaceBoton>}
              {q.estado === 'vigente' && <Boton variante="fantasma" icono={Ban} onClick={() => cambiarEstado('rechazada')}>Marcar rechazada</Boton>}
              {q.estado === 'rechazada' && <Boton variante="fantasma" icono={RotateCcw} onClick={() => cambiarEstado('vigente')}>Reactivar</Boton>}
              {q.estado !== 'aceptada' && <Boton variante="fantasma" icono={Trash2} onClick={eliminar} aria-label="Eliminar cotización" />}
            </Encabezado>

            <div className="hoja mx-auto max-w-3xl rounded-xl border border-stone-200 bg-white p-6 text-stone-900 shadow-sm sm:p-10">
              <Membrete titulo="Cotización" subtitulo={`N° ${String(q.id).padStart(5, '0')} · ${fechaLarga(q.fecha)}`} />

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
                      {fila(`Pie (${numero((q.pie / q.precio) * 100, 1)} % del precio)`, pesos(q.pie))}
                      {fila('Saldo de precio a crédito', pesos(s.monto_financiado))}
                      {fila('Interés', s.tasa_mensual > 0 ? `${porcentaje(s.tasa_mensual)} mensual (${porcentaje(s.tasa_anual)} anual)` : 'Sin interés')}
                      {fila(`${s.n_cuotas} cuotas mensuales de`, pesos(s.valor_cuota), true)}
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

              <div className="mt-10 text-sm">
                <div className="font-medium">{q.usuario ?? empresa.representante}</div>
                <div>{empresa.razon_social}</div>
                <div className="text-stone-600">{[empresa.telefono, empresa.email].filter(Boolean).join(' · ')}</div>
              </div>

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
