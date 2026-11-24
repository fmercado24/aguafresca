import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, MapPin, MessageCircle, Phone, Trash2 } from 'lucide-react';
import { api, useDatos } from '../api';
import { useAvisos, useConfig, useSesion } from '../contexto';
import { coordenadas, enlaceGoogleMaps } from '../componentes/MapaParcelas';
import { correoValido, diaSemana, errorTelefono, fechaConDia, hora, mesLargo, plural, sumarDias, sumarMeses } from '../formato';
import type { ClienteResumen, Cuenta, EstadoVisita, Parcela, Visita } from '../tipos';
import {
  AreaTexto, Boton, Campo, Encabezado, Entrada, ESTADOS_VISITA, InsigniaVisita, Modal, Selector, Tarjeta, Vacio, EntradaTelefono,
} from '../ui';

const DIAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const ESTADOS = Object.keys(ESTADOS_VISITA) as EstadoVisita[];

const estiloVisita = (estado: EstadoVisita) =>
  estado === 'cancelada' ? 'bg-stone-100 text-stone-400 line-through'
    : estado === 'realizada' ? 'bg-stone-100 text-stone-600'
    : estado === 'no_asistio' ? 'bg-amber-50 text-amber-900'
    : estado === 'confirmada' ? 'bg-green-50 text-green-900'
    : 'bg-marca-50 text-marca-900';

// ---------- Formulario ----------

interface Borrador {
  id: number | null;
  fecha: string;
  hora: string;
  duracion_min: number;
  nombre: string;
  telefono: string;
  email: string;
  cliente_id: number | null;
  parcela_ids: number[];
  vendedor_id: number | null;
  estado: EstadoVisita;
  notas: string;
  creado_por: number | null;
  agendada_por: string | null;
}

function FormularioVisita({ inicial, alCerrar, alGuardar }: { inicial: Borrador; alCerrar: () => void; alGuardar: (fecha: string) => void }) {
  const avisos = useAvisos();
  const idForm = useId();
  const parcelas = useDatos<Parcela[]>('/parcelas');
  const clientes = useDatos<ClienteResumen[]>('/clientes');
  const usuarios = useDatos<Cuenta[]>('/usuarios');
  const { usuario, puede } = useSesion();
  // El administrador y el super administrador modifican cualquier visita; el usuario, solo las que agendó (y a su nombre).
  const todas = puede('visitas_todas');
  const soloLectura = !!inicial.id && !todas && inicial.creado_por !== usuario?.id;
  const [b, setB] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const cambiar = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setB((x) => ({ ...x, [k]: v }));

  const ofrecidas = (parcelas.datos ?? []).filter((p) => p.estado === 'disponible' || p.estado === 'reservada' || b.parcela_ids.includes(p.id));

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const errTel = errorTelefono(b.telefono, true);
    if (errTel) return avisos.error(errTel);
    if (!correoValido(b.email)) return avisos.error('Revise el correo electrónico (ej.: nombre@dominio.cl)');
    setGuardando(true);
    try {
      const { id, fecha, hora: h, creado_por: _c, agendada_por: _a, ...resto } = b;
      const cuerpo = { ...resto, inicio: `${fecha}T${h}` };
      if (id) await api.put(`/visitas/${id}`, cuerpo);
      else await api.post('/visitas', cuerpo);
      avisos.ok(id ? 'Visita actualizada' : 'Visita agendada');
      alGuardar(fecha);
    } catch (err) {
      avisos.error(err);
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!(await avisos.confirmar({ titulo: '¿Eliminar esta visita?', confirmar: 'Eliminar', peligro: true }))) return;
    try {
      await api.del(`/visitas/${b.id}`);
      alGuardar(b.fecha);
    } catch (err) {
      avisos.error(err);
    }
  }

  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      titulo={soloLectura ? 'Visita' : b.id ? 'Editar visita' : 'Agendar visita'}
      pie={soloLectura ? <Boton variante="secundario" onClick={alCerrar}>Cerrar</Boton> : (
        <>
          {b.id && <Boton variante="fantasma" icono={Trash2} onClick={eliminar} className="mr-auto text-red-700">Eliminar</Boton>}
          <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
          <Boton type="submit" form={idForm} cargando={guardando}>Guardar</Boton>
        </>
      )}
    >
      {b.agendada_por && (
        <p className="mb-3 rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-700">
          Agendada por <strong>{b.agendada_por}</strong>.
          {soloLectura && ' Solo quien la agendó, el administrador o el super administrador pueden modificarla.'}
        </p>
      )}
      <form id={idForm} onSubmit={guardar}>
      <fieldset disabled={soloLectura} className="grid min-w-0 grid-cols-6 gap-3">
        <Campo etiqueta="Fecha" className="col-span-3 sm:col-span-2">
          <Entrada type="date" required value={b.fecha} onChange={(e) => cambiar('fecha', e.target.value)} />
        </Campo>
        <Campo etiqueta="Hora" className="col-span-3 sm:col-span-2">
          <Entrada type="time" required step={300} value={b.hora} onChange={(e) => cambiar('hora', e.target.value)} />
        </Campo>
        <Campo etiqueta="Duración" className="col-span-6 sm:col-span-2">
          <Selector value={b.duracion_min} onChange={(e) => cambiar('duracion_min', Number(e.target.value))}>
            {[30, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{m < 60 ? `${m} minutos` : m === 60 ? '1 hora' : `${m / 60} horas`.replace('.', ',')}</option>)}
          </Selector>
        </Campo>

        {(clientes.datos?.length ?? 0) > 0 && (
          <Campo etiqueta="Cliente ya registrado (opcional)" className="col-span-6">
            <Selector
              value={b.cliente_id ?? ''}
              onChange={(e) => {
                const c = clientes.datos?.find((x) => x.id === Number(e.target.value));
                setB((x) => ({ ...x, cliente_id: c?.id ?? null, ...(c ? { nombre: c.nombre, telefono: c.telefono, email: c.email } : {}) }));
              }}
            >
              <option value="">No, es un interesado nuevo</option>
              {clientes.datos!.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Selector>
          </Campo>
        )}
        <Campo etiqueta="Nombre del visitante" className="col-span-6">
          <Entrada required maxLength={160} value={b.nombre} onChange={(e) => cambiar('nombre', e.target.value)} />
        </Campo>
        <Campo etiqueta="Celular" className="col-span-3">
          <EntradaTelefono movil valor={b.telefono} alCambiar={(v) => cambiar('telefono', v)} />
        </Campo>
        <Campo etiqueta="Correo electrónico" className="col-span-3">
          <Entrada type="email" maxLength={160} placeholder="nombre@dominio.cl" value={b.email} onChange={(e) => cambiar('email', e.target.value)} />
        </Campo>

        <div className="col-span-6">
          <span className="mb-1 block text-xs font-medium text-stone-600">Parcelas de interés</span>
          <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-stone-200 p-2">
            {ofrecidas.length === 0 && <span className="text-sm text-stone-500">No hay parcelas disponibles.</span>}
            {ofrecidas.map((p) => {
              const marcada = b.parcela_ids.includes(p.id);
              return (
                <button
                  key={p.id} type="button" aria-pressed={marcada}
                  onClick={() => cambiar('parcela_ids', marcada ? b.parcela_ids.filter((x) => x !== p.id) : [...b.parcela_ids, p.id])}
                  className={`min-w-9 rounded-md border px-2 py-1 text-xs font-medium tabular-nums ${marcada ? 'border-marca-600 bg-marca-600 text-white' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'}`}
                >
                  {p.numero}
                </button>
              );
            })}
          </div>
        </div>

        <Campo etiqueta="Atiende" className="col-span-3" ayuda={!todas && !soloLectura ? 'Las visitas que usted agenda quedan a su nombre.' : undefined}>
          {todas ? (
            <Selector value={b.vendedor_id ?? ''} onChange={(e) => cambiar('vendedor_id', e.target.value ? Number(e.target.value) : null)}>
              <option value="">Sin asignar</option>
              {(usuarios.datos ?? []).map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </Selector>
          ) : (
            <Entrada disabled value={(soloLectura ? usuarios.datos?.find((u) => u.id === b.vendedor_id)?.nombre : usuario?.nombre) ?? '—'} />
          )}
        </Campo>
        <Campo etiqueta="Estado" className="col-span-3">
          <Selector value={b.estado} onChange={(e) => cambiar('estado', e.target.value as EstadoVisita)}>
            {ESTADOS.map((e) => <option key={e} value={e}>{ESTADOS_VISITA[e].etiqueta}</option>)}
          </Selector>
        </Campo>
        <Campo etiqueta="Notas" className="col-span-6">
          <AreaTexto rows={2} maxLength={3000} value={b.notas} onChange={(e) => cambiar('notas', e.target.value)} placeholder="Punto de encuentro, qué busca, resultado de la visita…" />
        </Campo>
      </fieldset>
      </form>
    </Modal>
  );
}

// ---------- Calendario ----------

export function Visitas() {
  const { hoy, plano } = useConfig();
  // Para el enlace "Cómo llegar" (solo si el plano está georreferenciado).
  const parcelas = useDatos<Parcela[]>(plano?.georreferencia ? '/parcelas' : null);
  const ubicacionDe = (ids: number[]) => {
    const p = (parcelas.datos ?? []).find((x) => x.id === ids[0]);
    return p ? coordenadas(p, plano) : null;
  };
  const { usuario } = useSesion();
  const [params, setParams] = useSearchParams();
  const [mes, setMes] = useState(hoy.slice(0, 7));
  const [dia, setDia] = useState(hoy);
  const [editando, setEditando] = useState<Borrador | null>(null);

  // Cuadrícula de 6 semanas, de lunes a domingo, que contiene el mes.
  const dias = useMemo(() => {
    const primero = `${mes}-01`;
    const inicio = sumarDias(primero, -((diaSemana(primero) + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => sumarDias(inicio, i));
  }, [mes]);

  const consulta = useDatos<Visita[]>(`/visitas?desde=${dias[0]}&hasta=${dias[41]}`);
  const porDia = useMemo(() => {
    const m = new Map<string, Visita[]>();
    for (const v of consulta.datos ?? []) {
      const f = v.inicio.slice(0, 10);
      m.set(f, [...(m.get(f) ?? []), v]);
    }
    return m;
  }, [consulta.datos]);

  const nueva = (fecha: string, parcelaId?: number): Borrador => ({
    id: null, fecha, hora: '11:00', duracion_min: 60, nombre: '', telefono: '', email: '', cliente_id: null,
    parcela_ids: parcelaId ? [parcelaId] : [], vendedor_id: usuario?.id ?? null, estado: 'programada', notas: '',
    creado_por: null, agendada_por: null,
  });

  // Llegada desde el mapa de parcelas (…/visitas?nueva=1&parcela=ID) o desde un aviso (…/visitas?dia=AAAA-MM-DD).
  useEffect(() => {
    const diaAviso = params.get('dia');
    if (diaAviso && /^\d{4}-\d{2}-\d{2}$/.test(diaAviso)) {
      irA(diaAviso);
      setParams({}, { replace: true });
    } else if (params.get('nueva')) {
      setEditando(nueva(hoy, Number(params.get('parcela')) || undefined));
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const irA = (fecha: string) => {
    setDia(fecha);
    setMes(fecha.slice(0, 7));
  };

  const delDia = porDia.get(dia) ?? [];
  const activasDelMes = (consulta.datos ?? []).filter((v) => v.inicio.startsWith(mes) && v.estado !== 'cancelada').length;

  return (
    <>
      <Encabezado titulo="Visitas" descripcion="Programación de visitas al loteo.">
        <Boton icono={CalendarPlus} onClick={() => setEditando(nueva(dia < hoy ? hoy : dia))}>Agendar visita</Boton>
      </Encabezado>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Tarjeta relleno={false}>
          <div className="flex items-center justify-between gap-2 border-b border-stone-100 px-3 py-2.5">
            <div className="flex items-center gap-1">
              <button onClick={() => setMes(sumarMeses(`${mes}-01`, -1).slice(0, 7))} aria-label="Mes anterior" className="rounded-lg p-1.5 text-stone-600 hover:bg-stone-100"><ChevronLeft className="size-5" /></button>
              <button onClick={() => setMes(sumarMeses(`${mes}-01`, 1).slice(0, 7))} aria-label="Mes siguiente" className="rounded-lg p-1.5 text-stone-600 hover:bg-stone-100"><ChevronRight className="size-5" /></button>
              <h2 className="ml-1 text-sm font-semibold text-stone-900">{mesLargo(mes)}</h2>
              <span className="ml-2 hidden text-xs text-stone-500 sm:inline">{plural(activasDelMes, 'visita')}</span>
            </div>
            <Boton chico variante="secundario" onClick={() => irA(hoy)}>Hoy</Boton>
          </div>

          <div className={`grid grid-cols-7 transition-opacity ${consulta.cargando && consulta.datos ? 'opacity-70' : ''}`}>
            {DIAS.map((d) => <div key={d} className="border-b border-stone-100 py-1.5 text-center text-xs font-medium text-stone-500">{d}</div>)}
            {dias.map((f, i) => {
              const visitas = porDia.get(f) ?? [];
              const fueraDelMes = !f.startsWith(mes);
              const elegido = f === dia;
              return (
                <button
                  key={f}
                  onClick={() => irA(f)}
                  aria-label={`${fechaConDia(f)}: ${plural(visitas.length, 'visita')}`}
                  aria-pressed={elegido}
                  className={`flex min-h-14 flex-col items-stretch gap-0.5 border-b border-stone-100 p-1 text-left align-top transition-colors sm:min-h-24 ${i % 7 !== 6 ? 'border-r' : ''} ${
                    elegido ? 'bg-marca-50 ring-2 ring-inset ring-marca-500' : 'hover:bg-stone-50'
                  } ${fueraDelMes ? 'bg-stone-50/60' : ''}`}
                >
                  <span className={`flex size-6 items-center justify-center self-center rounded-full text-xs tabular-nums sm:self-start ${
                    f === hoy ? 'bg-marca-600 font-semibold text-white' : fueraDelMes ? 'text-stone-400' : 'text-stone-700'
                  }`}>
                    {Number(f.slice(8))}
                  </span>
                  {/* Computador: detalle de cada visita. Celular: solo la cantidad. */}
                  <span className="hidden flex-col gap-0.5 sm:flex">
                    {visitas.slice(0, 3).map((v) => (
                      <span key={v.id} className={`truncate rounded px-1 py-0.5 text-[11px] leading-tight ${estiloVisita(v.estado)}`}>
                        <span className="tabular-nums">{hora(v.inicio)}</span> {v.nombre}
                      </span>
                    ))}
                    {visitas.length > 3 && <span className="px-1 text-[11px] text-stone-500">+{visitas.length - 3} más</span>}
                  </span>
                  {visitas.length > 0 && (
                    <span className="self-center rounded-full bg-marca-600 px-1.5 text-[10px] font-semibold leading-4 text-white sm:hidden">{visitas.length}</span>
                  )}
                </button>
              );
            })}
          </div>
          {consulta.error && <p className="px-4 py-3 text-sm text-red-700" role="alert">{consulta.error}</p>}
        </Tarjeta>

        <Tarjeta
          titulo={<span className="first-letter:uppercase">{fechaConDia(dia)}</span>}
          acciones={<Boton chico variante="secundario" icono={CalendarPlus} onClick={() => setEditando(nueva(dia))}>Agendar</Boton>}
          relleno={false}
        >
          {delDia.length === 0 ? (
            <Vacio icono={CalendarDays} titulo="Sin visitas este día" />
          ) : (
            <ul className="divide-y divide-stone-100">
              {delDia.map((v) => {
                const telefono = v.telefono.replace(/\D/g, '');
                const ubicacion = ubicacionDe(v.parcela_ids);
                return (
                  <li key={v.id} className="px-4 py-3">
                    <button
                      onClick={() => setEditando({
                        id: v.id, fecha: v.inicio.slice(0, 10), hora: hora(v.inicio), duracion_min: v.duracion_min, nombre: v.nombre, telefono: v.telefono,
                        email: v.email, cliente_id: v.cliente_id, parcela_ids: v.parcela_ids, vendedor_id: v.vendedor_id, estado: v.estado, notas: v.notas,
                        creado_por: v.creado_por, agendada_por: v.agendada_por,
                      })}
                      className="block w-full text-left"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold tabular-nums text-stone-900">{hora(v.inicio)} <span className="font-normal text-stone-500">· {v.duracion_min} min</span></div>
                          <div className="truncate text-sm font-medium text-stone-900">{v.nombre}</div>
                        </div>
                        <InsigniaVisita estado={v.estado} />
                      </div>
                      <div className="mt-1 text-xs text-stone-600">
                        {v.parcelas.length > 0 && <div>Parcelas de interés: {v.parcelas.join(', ')}</div>}
                        {v.vendedor && <div>Atiende: {v.vendedor}</div>}
                        {v.agendada_por && <div>Agendada por: {v.agendada_por}</div>}
                        {v.notas && <div className="mt-1 whitespace-pre-line text-stone-700">{v.notas}</div>}
                      </div>
                    </button>
                    {(v.telefono || ubicacion) && (
                      <div className="mt-2 flex flex-wrap gap-3 text-xs">
                        {v.telefono && <a href={`tel:${v.telefono.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 font-medium text-marca-700 hover:underline"><Phone className="size-3.5" />{v.telefono}</a>}
                        {telefono.length >= 9 && (
                          <a href={`https://wa.me/${telefono}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-marca-700 hover:underline"><MessageCircle className="size-3.5" />WhatsApp</a>
                        )}
                        {ubicacion && (
                          <a href={enlaceGoogleMaps(ubicacion)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-marca-700 hover:underline"><MapPin className="size-3.5" />Cómo llegar</a>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Tarjeta>
      </div>

      {editando && (
        <FormularioVisita
          inicial={editando}
          alCerrar={() => setEditando(null)}
          alGuardar={(fecha) => { setEditando(null); irA(fecha); consulta.recargar(); }}
        />
      )}
    </>
  );
}
