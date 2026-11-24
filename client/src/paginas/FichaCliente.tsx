import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { CircleCheck, FileText, Mail, MessageCircle, Pencil, Phone, Plus, Printer, Trash2, TriangleAlert } from 'lucide-react';
import { api, useDatos } from '../api';
import { useAvisos, useConfig, useSesion } from '../contexto';
import { FormularioCliente } from '../componentes/FormularioCliente';
import { FormularioGestion, TIPOS_GESTION } from '../componentes/FormularioGestion';
import { Membrete } from '../componentes/Membrete';
import { MEDIOS_PAGO, fecha, fechaRegistro, formatearRut, hora, pesos, plural } from '../formato';
import type { FichaCliente, Gestion } from '../tipos';
import {
  Boton, Carga, Dato, Encabezado, EnlaceBoton, Insignia, InsigniaCotizacion, InsigniaVenta, InsigniaVisita, Par,
  Pestanas, Tabla, Tarjeta, Vacio, num, td, th, useNombreArchivo,
} from '../ui';

type Pestana = 'antecedentes' | 'compras' | 'pagos' | 'cobranza' | 'documentos';

const soloDigitos = (telefono: string) => telefono.replace(/\D/g, '');

export function FichaClientePagina() {
  const { id } = useParams();
  return <Ficha key={id} id={Number(id)} />;
}

function Ficha({ id }: { id: number }) {
  const { puede } = useSesion();
  const esAdmin = puede('administracion');
  const opera = puede('operaciones');
  const completa = !opera && puede('clientes_esenciales');
  const avisos = useAvisos();
  const navegar = useNavigate();
  const consulta = useDatos<FichaCliente>(`/clientes/${id}`);
  useNombreArchivo(consulta.datos ? `Ficha - ${consulta.datos.cliente.nombre}` : null);
  const [pestana, setPestana] = useState<Pestana>('compras');
  const [editando, setEditando] = useState(false);
  const [gestionando, setGestionando] = useState(false);

  async function eliminar(nombre: string) {
    if (!(await avisos.confirmar({ titulo: `¿Eliminar a ${nombre}?`, mensaje: 'Se borrarán también sus gestiones y documentos. Esta acción no se puede deshacer.', confirmar: 'Eliminar', peligro: true }))) return;
    try {
      await api.del(`/clientes/${id}`);
      avisos.ok('Cliente eliminado');
      navegar('/clientes');
    } catch (err) {
      avisos.error(err);
    }
  }

  async function borrarGestion(g: Gestion) {
    if (!(await avisos.confirmar({ titulo: '¿Borrar esta gestión?', confirmar: 'Borrar', peligro: true }))) return;
    try {
      await api.del(`/gestiones/${g.id}`);
      consulta.recargar();
    } catch (err) {
      avisos.error(err);
    }
  }

  return (
    <Carga consulta={consulta}>
      {(f) => {
        const c = f.cliente;
        const ventasVigentes = f.ventas.filter((v) => v.estado !== 'anulada');
        const pagos = f.ventas.flatMap((v) => v.pagos.map((p) => ({ ...p, parcela: v.parcela }))).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id);
        const conAtraso = f.ventas.filter((v) => v.estado === 'vigente' && v.totales.n_atrasadas > 0);

        return (
          <>
            <div className="print:hidden">
              <Encabezado
                volver={{ a: '/clientes', texto: 'Clientes' }}
                titulo={c.nombre}
                descripcion={
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>{c.rut ? formatearRut(c.rut) : 'Sin RUT registrado'}</span>
                    {c.telefono && <a href={`tel:${c.telefono.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 text-marca-700 hover:underline"><Phone className="size-3.5" />{c.telefono}</a>}
                    {c.telefono && soloDigitos(c.telefono).length >= 9 && (
                      <a href={`https://wa.me/${soloDigitos(c.telefono)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-marca-700 hover:underline"><MessageCircle className="size-3.5" />WhatsApp</a>
                    )}
                    {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-marca-700 hover:underline"><Mail className="size-3.5" />{c.email}</a>}
                  </span>
                }
              >
                <Boton variante="secundario" icono={Printer} onClick={() => window.print()}>Imprimir ficha</Boton>
                {opera && <Boton variante="secundario" icono={Pencil} onClick={() => setEditando(true)}>Editar</Boton>}
                {completa && <Boton variante="secundario" icono={Pencil} onClick={() => setEditando(true)}>Completar datos</Boton>}
                {esAdmin && f.ventas.length === 0 && <Boton variante="fantasma" icono={Trash2} onClick={() => eliminar(c.nombre)} aria-label="Eliminar cliente" />}
              </Encabezado>

              <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Dato etiqueta="Saldo por pagar" valor={pesos(f.resumen.saldo)} detalle={`${plural(ventasVigentes.length, 'compra')} registradas`} />
                <Dato
                  etiqueta="Monto atrasado"
                  valor={pesos(f.resumen.atrasado)}
                  detalle={
                    f.resumen.n_atrasadas > 0
                      ? <span className="inline-flex items-center gap-1 font-medium text-red-700"><TriangleAlert className="size-3.5" />{plural(f.resumen.n_atrasadas, 'cuota')} · hasta {f.resumen.dias_atraso} días</span>
                      : <span className="inline-flex items-center gap-1 text-green-700"><CircleCheck className="size-3.5" />Sin atrasos</span>
                  }
                />
                <Dato etiqueta="Interés por mora estimado" valor={pesos(f.resumen.mora_estimada)} detalle="A la fecha de hoy" />
                <Dato etiqueta="Pagado a la fecha" valor={pesos(f.resumen.pagado)} detalle={plural(pagos.filter((p) => !p.anulado).length, 'pago')} />
              </div>

              <Pestanas
                activa={pestana}
                alCambiar={setPestana}
                opciones={[
                  { id: 'compras', etiqueta: 'Compras y cuotas', cuenta: f.ventas.length },
                  { id: 'antecedentes', etiqueta: 'Antecedentes' },
                  { id: 'pagos', etiqueta: 'Pagos', cuenta: pagos.length },
                  { id: 'cobranza', etiqueta: 'Cobranza', cuenta: f.gestiones.length },
                  { id: 'documentos', etiqueta: 'Documentos', cuenta: f.documentos.length + f.cotizaciones.length },
                ]}
              />

              {pestana === 'compras' && (
                <div className="space-y-4">
                  {f.ventas.length === 0 && (
                    <Tarjeta>
                      <Vacio titulo="Este cliente aún no tiene compras" accion={opera && <EnlaceBoton to={`/ventas/nueva?cliente=${id}`} icono={Plus}>Registrar venta</EnlaceBoton>} />
                    </Tarjeta>
                  )}
                  {f.ventas.map((v) => {
                    const atrasadas = v.cuotas.filter((q) => q.estado === 'atrasada');
                    return (
                      <Tarjeta
                        key={v.id}
                        titulo={<span className="flex flex-wrap items-center gap-2">Parcela {v.parcela} <InsigniaVenta estado={v.estado} atrasadas={v.totales.n_atrasadas} /></span>}
                        acciones={
                          <>
                            {atrasadas.length > 0 && v.estado === 'vigente' && (
                              <EnlaceBoton chico variante="secundario" icono={FileText} to={`/documentos/nuevo?tipo=carta_cobranza&venta=${v.id}`}>Carta de cobranza</EnlaceBoton>
                            )}
                            <EnlaceBoton chico to={`/ventas/${v.id}`}>Ver venta</EnlaceBoton>
                          </>
                        }
                      >
                        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <Par etiqueta="Fecha de venta">{fecha(v.fecha)}</Par>
                          <Par etiqueta="Precio">{pesos(v.precio)}</Par>
                          <Par etiqueta="Cuotas pagadas">{v.n_cuotas > 0 ? `${v.totales.cuotas_pagadas} de ${v.totales.cuotas_total}` : 'Contado'}</Par>
                          <Par etiqueta="Valor cuota">{v.n_cuotas > 0 ? pesos(v.valor_cuota) : '—'}</Par>
                          <Par etiqueta="Pagado">{pesos(v.totales.pagado)}</Par>
                          <Par etiqueta="Saldo por pagar">{pesos(v.totales.saldo)}</Par>
                          <Par etiqueta="Próximo vencimiento">{v.totales.proxima && v.estado === 'vigente' ? `${fecha(v.totales.proxima.fecha)} · ${pesos(v.totales.proxima.saldo)}` : '—'}</Par>
                          <Par etiqueta="Monto atrasado">{v.estado === 'vigente' && v.totales.atrasado > 0 ? pesos(v.totales.atrasado) : '—'}</Par>
                        </dl>
                        {atrasadas.length > 0 && v.estado === 'vigente' && (
                          <div className="mt-4 rounded-lg border border-red-200">
                            <Tabla>
                              <thead>
                                <tr>
                                  <th className={th}>Cuota atrasada</th>
                                  <th className={th}>Vencimiento</th>
                                  <th className={`${th} ${num}`}>Días</th>
                                  <th className={`${th} ${num}`}>Saldo</th>
                                  <th className={`${th} ${num} hidden sm:table-cell`}>Mora estimada</th>
                                </tr>
                              </thead>
                              <tbody>
                                {atrasadas.map((q) => (
                                  <tr key={q.id}>
                                    <td className={td}>{q.tipo === 'pie' ? 'Pie' : `N° ${q.numero}`}</td>
                                    <td className={td}>{fecha(q.fecha_vencimiento)}</td>
                                    <td className={`${td} ${num}`}>{q.dias_atraso}</td>
                                    <td className={`${td} ${num} font-medium`}>{pesos(q.saldo)}</td>
                                    <td className={`${td} ${num} hidden sm:table-cell`}>{pesos(q.mora_estimada)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </Tabla>
                          </div>
                        )}
                        {v.estado === 'anulada' && v.motivo_anulacion && <p className="mt-3 text-sm text-stone-500">Motivo de anulación: {v.motivo_anulacion}</p>}
                      </Tarjeta>
                    );
                  })}
                  {opera && f.ventas.length > 0 && <EnlaceBoton variante="secundario" icono={Plus} to={`/ventas/nueva?cliente=${id}`}>Registrar otra venta</EnlaceBoton>}
                </div>
              )}

              {pestana === 'antecedentes' && <Antecedentes f={f} />}

              {pestana === 'pagos' && (
                <Tarjeta relleno={false}>
                  {pagos.length === 0 ? <Vacio titulo="Sin pagos registrados" /> : (
                    <Tabla>
                      <thead>
                        <tr>
                          <th className={th}>Fecha</th>
                          <th className={th}>Parcela</th>
                          <th className={`${th} ${num}`}>Monto</th>
                          <th className={`${th} hidden sm:table-cell`}>Imputado a</th>
                          <th className={`${th} hidden md:table-cell`}>Medio</th>
                          <th className={th}><span className="sr-only">Comprobante</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagos.map((p) => (
                          <tr key={p.id} className={p.anulado ? 'text-stone-400 line-through' : ''}>
                            <td className={`${td} whitespace-nowrap`}>{fecha(p.fecha)}</td>
                            <td className={td}>{p.parcela}</td>
                            <td className={`${td} ${num} font-medium`}>{pesos(p.monto + p.mora)}</td>
                            <td className={`${td} hidden sm:table-cell`}>{p.anulado ? 'Anulado' : p.imputado_a}</td>
                            <td className={`${td} hidden md:table-cell`}>{MEDIOS_PAGO[p.medio] ?? p.medio}</td>
                            <td className={`${td} text-right`}>{!p.anulado && <Link to={`/pagos/${p.id}`} className="text-xs font-medium text-marca-700 hover:underline">Comprobante</Link>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Tabla>
                  )}
                </Tarjeta>
              )}

              {pestana === 'cobranza' && (
                <Tarjeta
                  titulo="Bitácora de gestiones de cobranza"
                  acciones={
                    <>
                      {conAtraso.map((v) => (
                        <EnlaceBoton key={v.id} chico variante="secundario" icono={FileText} to={`/documentos/nuevo?tipo=carta_cobranza&venta=${v.id}`}>
                          Carta{conAtraso.length > 1 ? ` parcela ${v.parcela}` : ' de cobranza'}
                        </EnlaceBoton>
                      ))}
                      {opera && <Boton chico icono={Plus} onClick={() => setGestionando(true)}>Registrar gestión</Boton>}
                    </>
                  }
                  relleno={false}
                >
                  {f.gestiones.length === 0 ? (
                    <Vacio titulo="Sin gestiones registradas">Anote aquí cada llamada, mensaje, carta o compromiso de pago para llevar el historial del deudor.</Vacio>
                  ) : (
                    <ul className="divide-y divide-stone-100">
                      {f.gestiones.map((g) => (
                        <li key={g.id} className="flex gap-3 px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                              <span className="font-medium text-stone-900">{fecha(g.fecha)}</span>
                              <Insignia tono={g.tipo === 'compromiso' ? 'ambar' : 'gris'}>{TIPOS_GESTION[g.tipo] ?? g.tipo}</Insignia>
                              {g.usuario && <span>por {g.usuario}</span>}
                            </div>
                            <p className="mt-1 whitespace-pre-line text-sm text-stone-800">{g.detalle}</p>
                            {(g.compromiso_fecha || g.compromiso_monto) && (
                              <p className="mt-1 text-sm text-stone-600">
                                Compromiso: {g.compromiso_monto ? pesos(g.compromiso_monto) : ''}{g.compromiso_fecha ? ` para el ${fecha(g.compromiso_fecha)}` : ''}
                              </p>
                            )}
                          </div>
                          {opera && <button onClick={() => borrarGestion(g)} aria-label="Borrar gestión" className="self-start rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-red-700">
                            <Trash2 className="size-4" />
                          </button>}
                        </li>
                      ))}
                    </ul>
                  )}
                </Tarjeta>
              )}

              {pestana === 'documentos' && (
                <div className="space-y-4">
                  <Tarjeta titulo="Cartas y contratos emitidos" relleno={false}>
                    {f.documentos.length === 0 ? <Vacio titulo="Sin documentos emitidos" /> : (
                      <ul className="divide-y divide-stone-100">
                        {f.documentos.map((d) => (
                          <li key={d.id}>
                            <Link to={`/documentos/${d.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-stone-50">
                              <span className="flex min-w-0 items-center gap-2 text-sm text-stone-900"><FileText className="size-4 shrink-0 text-stone-400" /><span className="truncate">{d.titulo}</span></span>
                              <span className="whitespace-nowrap text-xs text-stone-500">{fechaRegistro(d.creado_en)}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Tarjeta>
                  <Tarjeta titulo="Cotizaciones" relleno={false}>
                    {f.cotizaciones.length === 0 ? <Vacio titulo="Sin cotizaciones" /> : (
                      <ul className="divide-y divide-stone-100">
                        {f.cotizaciones.map((q) => (
                          <li key={q.id}>
                            <Link to={`/cotizaciones/${q.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-stone-50">
                              <span className="text-sm text-stone-900">N° {q.id} · Parcela {q.parcela} · {pesos(q.precio)}</span>
                              <span className="flex items-center gap-2 text-xs text-stone-500">{fecha(q.fecha)} <InsigniaCotizacion estado={q.estado as 'vigente'} /></span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Tarjeta>
                  {f.visitas.length > 0 && (
                    <Tarjeta titulo="Visitas al loteo" relleno={false}>
                      <ul className="divide-y divide-stone-100">
                        {f.visitas.map((v) => (
                          <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                            <span>{fecha(v.inicio)} · {hora(v.inicio)}{v.notas ? ` — ${v.notas}` : ''}</span>
                            <InsigniaVisita estado={v.estado as 'programada'} />
                          </li>
                        ))}
                      </ul>
                    </Tarjeta>
                  )}
                </div>
              )}
            </div>

            <FichaImpresa f={f} />

            {editando && <FormularioCliente esencial={completa} cliente={c} alCerrar={() => setEditando(false)} alGuardar={() => { setEditando(false); consulta.recargar(); }} />}
            {gestionando && (
              <FormularioGestion
                clienteId={id}
                nombre={c.nombre}
                ventas={ventasVigentes.map((v) => ({ id: v.id, parcela: v.parcela }))}
                alCerrar={() => setGestionando(false)}
                alGuardar={() => { setGestionando(false); consulta.recargar(); }}
              />
            )}
          </>
        );
      }}
    </Carga>
  );
}

function Antecedentes({ f }: { f: FichaCliente }) {
  const c = f.cliente;
  const bloque = (titulo: string, contenido: ReactNode) => (
    <Tarjeta titulo={titulo}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">{contenido}</dl>
    </Tarjeta>
  );
  return (
    <div className="space-y-4">
      {bloque('Datos personales', (
        <>
          <Par etiqueta="Nombre completo">{c.nombre}</Par>
          <Par etiqueta="RUT">{formatearRut(c.rut)}</Par>
          <Par etiqueta="Fecha de nacimiento">{c.fecha_nacimiento ? fecha(c.fecha_nacimiento) : ''}</Par>
          <Par etiqueta="Nacionalidad">{c.nacionalidad}</Par>
          <Par etiqueta="Estado civil">{c.estado_civil}</Par>
          <Par etiqueta="Profesión u oficio">{c.profesion}</Par>
          <Par etiqueta="Teléfono">{c.telefono}</Par>
          <Par etiqueta="Correo electrónico">{c.email}</Par>
          <Par etiqueta="Domicilio">{[c.direccion, c.comuna, c.ciudad !== c.comuna && c.ciudad, c.region].filter(Boolean).join(', ')}</Par>
        </>
      ))}
      {bloque('Antecedentes laborales', (
        <>
          <Par etiqueta="Empleador o actividad">{c.empleador}</Par>
          <Par etiqueta="Cargo">{c.cargo}</Par>
          <Par etiqueta="Antigüedad">{c.antiguedad_laboral}</Par>
          <Par etiqueta="Renta mensual líquida">{c.renta_mensual ? pesos(c.renta_mensual) : ''}</Par>
        </>
      ))}
      <Tarjeta titulo="Antecedentes comerciales y referencias">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Par etiqueta="Antecedentes comerciales">{c.antecedentes_comerciales}</Par>
          <Par etiqueta="Referencias">{c.referencias}</Par>
        </dl>
      </Tarjeta>
      {bloque('Aval o codeudor', (
        <>
          <Par etiqueta="Nombre">{c.aval_nombre}</Par>
          <Par etiqueta="RUT">{formatearRut(c.aval_rut)}</Par>
          <Par etiqueta="Teléfono">{c.aval_telefono}</Par>
          <Par etiqueta="Dirección">{c.aval_direccion}</Par>
        </>
      ))}
      <Tarjeta titulo="Observaciones">
        <p className="whitespace-pre-line text-sm text-stone-800">{c.observaciones || '—'}</p>
      </Tarjeta>
    </div>
  );
}

/** Versión para imprimir: toda la ficha en un solo documento. */
function FichaImpresa({ f }: { f: FichaCliente }) {
  const { hoy } = useConfig();
  const c = f.cliente;
  const titulo = (t: string) => <h2 className="mb-2 mt-5 border-b border-stone-400 pb-1 text-sm font-semibold uppercase tracking-wide">{t}</h2>;
  const fila = (etiqueta: string, valor: ReactNode) => (
    <div className="flex gap-2 py-0.5 text-sm"><span className="w-36 shrink-0 text-stone-600">{etiqueta}</span><span className="min-w-0 whitespace-pre-line [overflow-wrap:anywhere]">{valor || '—'}</span></div>
  );
  const celda = 'border border-stone-300 px-2 py-1';
  const ventas = f.ventas.filter((v) => v.estado !== 'anulada');

  return (
    <div className="hidden text-stone-900 print:block">
      <Membrete titulo="Ficha de cliente" fecha={hoy} />
      <h1 className="text-xl font-semibold">{c.nombre}</h1>
      <p className="text-sm text-stone-600">{c.rut ? `RUT ${formatearRut(c.rut)}` : 'Sin RUT registrado'}</p>

      {titulo('Datos personales')}
      <div className="grid grid-cols-2 gap-x-8">
        {fila('Nacionalidad', c.nacionalidad)}
        {fila('Estado civil', c.estado_civil)}
        {fila('Fecha de nacimiento', c.fecha_nacimiento ? fecha(c.fecha_nacimiento) : '')}
        {fila('Profesión u oficio', c.profesion)}
        {fila('Teléfono', c.telefono)}
        {fila('Correo electrónico', c.email)}
      </div>
      {fila('Domicilio', [c.direccion, c.comuna, c.ciudad !== c.comuna && c.ciudad, c.region].filter(Boolean).join(', '))}

      {titulo('Antecedentes laborales y comerciales')}
      <div className="grid grid-cols-2 gap-x-8">
        {fila('Empleador o actividad', c.empleador)}
        {fila('Cargo', c.cargo)}
        {fila('Antigüedad laboral', c.antiguedad_laboral)}
        {fila('Renta mensual líquida', c.renta_mensual ? pesos(c.renta_mensual) : '')}
      </div>
      {fila('Antecedentes comerciales', c.antecedentes_comerciales)}
      {fila('Referencias', c.referencias)}
      {fila('Aval o codeudor', [c.aval_nombre, c.aval_rut && `RUT ${formatearRut(c.aval_rut)}`, c.aval_telefono, c.aval_direccion].filter(Boolean).join(' · '))}
      {fila('Observaciones', c.observaciones)}

      {titulo('Situación de la deuda')}
      <div className="grid grid-cols-2 gap-x-8">
        {fila('Saldo por pagar', pesos(f.resumen.saldo))}
        {fila('Pagado a la fecha', pesos(f.resumen.pagado))}
        {fila('Monto atrasado', `${pesos(f.resumen.atrasado)} (${plural(f.resumen.n_atrasadas, 'cuota')})`)}
        {fila('Interés por mora estimado', pesos(f.resumen.mora_estimada))}
      </div>
      {ventas.length > 0 && (
        <table className="mt-2 w-full border-collapse text-xs">
          <thead>
            <tr className="bg-stone-100 text-left">
              {['Parcela', 'Fecha', 'Precio', 'Cuotas pagadas', 'Valor cuota', 'Saldo', 'Atrasado', 'Días de atraso'].map((h) => <th key={h} className={celda}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {ventas.map((v) => (
              <tr key={v.id}>
                <td className={celda}>{v.parcela}</td>
                <td className={`${celda} whitespace-nowrap`}>{fecha(v.fecha)}</td>
                <td className={`${celda} text-right`}>{pesos(v.precio)}</td>
                <td className={celda}>{v.n_cuotas > 0 ? `${v.totales.cuotas_pagadas} de ${v.totales.cuotas_total}` : 'Contado'}</td>
                <td className={`${celda} text-right`}>{v.n_cuotas > 0 ? pesos(v.valor_cuota) : '—'}</td>
                <td className={`${celda} text-right`}>{pesos(v.totales.saldo)}</td>
                <td className={`${celda} text-right`}>{pesos(v.totales.atrasado)}</td>
                <td className={`${celda} text-right`}>{v.totales.dias_atraso || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {ventas.some((v) => v.totales.n_atrasadas > 0) && (
        <>
          {titulo('Cuotas atrasadas')}
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-stone-100 text-left">
                {['Parcela', 'Cuota', 'Vencimiento', 'Días de atraso', 'Saldo', 'Mora estimada'].map((h) => <th key={h} className={celda}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {ventas.flatMap((v) => v.cuotas.filter((q) => q.estado === 'atrasada').map((q) => (
                <tr key={q.id}>
                  <td className={celda}>{v.parcela}</td>
                  <td className={celda}>{q.tipo === 'pie' ? 'Pie' : q.numero}</td>
                  <td className={celda}>{fecha(q.fecha_vencimiento)}</td>
                  <td className={`${celda} text-right`}>{q.dias_atraso}</td>
                  <td className={`${celda} text-right`}>{pesos(q.saldo)}</td>
                  <td className={`${celda} text-right`}>{pesos(q.mora_estimada)}</td>
                </tr>
              )))}
            </tbody>
          </table>
        </>
      )}

      {f.gestiones.length > 0 && (
        <>
          {titulo('Gestiones de cobranza')}
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-stone-100 text-left">
                {['Fecha', 'Tipo', 'Detalle', 'Compromiso'].map((h) => <th key={h} className={celda}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {f.gestiones.map((g) => (
                <tr key={g.id}>
                  <td className={`${celda} whitespace-nowrap`}>{fecha(g.fecha)}</td>
                  <td className={`${celda} whitespace-nowrap`}>{TIPOS_GESTION[g.tipo] ?? g.tipo}</td>
                  <td className={celda}>{g.detalle}</td>
                  <td className={`${celda} whitespace-nowrap`}>{g.compromiso_monto ? pesos(g.compromiso_monto) : ''}{g.compromiso_fecha ? ` · ${fecha(g.compromiso_fecha)}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
