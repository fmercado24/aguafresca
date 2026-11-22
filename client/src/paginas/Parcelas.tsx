import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  Calculator, CalendarPlus, Download, FileStack, Globe, HandCoins, ImageOff, ImageUp, Layers, LocateFixed, Mail, Map as IconoMapa, MapPin, Pencil,
  PenLine, Phone, Plus, Save, Settings2, Trash2, Undo2, UserRound, X,
} from 'lucide-react';
import { api, useDatos } from '../api';
import { useAvisos, useConfig, useSesion } from '../contexto';
import { COLOR_ESTADO, MapaParcelas, coordenadas, enlaceGoogleMaps, geoALienzo, parcelaEnPunto } from '../componentes/MapaParcelas';
import { FormularioCliente } from '../componentes/FormularioCliente';
import { compararParcela, descargarCsv, formatearRut, numero, pesos, plural, precioLista } from '../formato';
import { ListaCambios, listarCambios } from '../componentes/Cambios';
import type { EstadoParcela, FichaCliente, InfoGoogleEarth, Parcela, Plano, Punto, ResumenLoteo } from '../tipos';
import {
  AreaTexto, Boton, Buscador, Campo, Carga, Encabezado, EnlaceBoton, Entrada, EntradaMonto, ESTADOS_PARCELA, InsigniaParcela, InsigniaVenta, Modal, Par,
  Pestanas, Selector, SelectorOrden, Tabla, Tarjeta, Vacio, claseBoton, num, td, th, EntradaDecimal, useOrden,
} from '../ui';

const ESTADOS: EstadoParcela[] = ['disponible', 'reservada', 'vendida', 'bloqueada'];

// ---------- Formulario de parcela ----------

interface Borrador {
  id: number | null;
  numero: string;
  sector: string;
  superficie_m2: string;
  precio: number | null;
  estado: EstadoParcela;
  rol_sii: string;
  deslindes: string;
  descripcion: string;
  tieneVenta: boolean;
}

const borradorDe = (p?: Parcela): Borrador => ({
  id: p?.id ?? null,
  numero: p?.numero ?? '',
  sector: p?.sector ?? '',
  superficie_m2: p ? String(p.superficie_m2) : '5000',
  precio: p?.precio ?? null,
  estado: p?.estado ?? 'disponible',
  rol_sii: p?.rol_sii ?? '',
  deslindes: p?.deslindes ?? '',
  descripcion: p?.descripcion ?? '',
  tieneVenta: !!p?.venta_id,
});

function FormularioParcela({ inicial, alCerrar, alGuardar }: { inicial: Borrador; alCerrar: () => void; alGuardar: () => void }) {
  const avisos = useAvisos();
  const idForm = useId();
  const [b, setB] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const cambiar = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setB((x) => ({ ...x, [k]: v }));

  async function guardar(e: FormEvent) {
    e.preventDefault();
    // Al editar una parcela existente se confirma lo que cambia (sobre todo el precio de lista).
    if (b.id) {
      const cambios = listarCambios(inicial, b, {
        numero: 'Número', sector: 'Manzana', superficie_m2: 'Superficie (m²)', precio: 'Precio de lista', estado: 'Estado',
        rol_sii: 'Rol de avalúo', deslindes: 'Deslindes', descripcion: 'Descripción',
      }, {
        precio: (v) => pesos(Number(v)),
        superficie_m2: (v) => `${numero(Number(v))} m²`,
        estado: (v) => ESTADOS_PARCELA[v as EstadoParcela].etiqueta,
      });
      if (!cambios.length) return alCerrar();
      if (!(await avisos.confirmar({
        titulo: `¿Guardar los cambios en la parcela ${inicial.numero}?`,
        mensaje: <ListaCambios cambios={cambios} nota="Las cotizaciones y ventas ya registradas conservan su precio." />,
        confirmar: 'Guardar cambios',
      }))) return;
    }
    setGuardando(true);
    try {
      const { id, tieneVenta: _, ...datos } = b;
      if (id) await api.put(`/parcelas/${id}`, datos);
      else await api.post('/parcelas', datos);
      avisos.ok(id ? 'Parcela actualizada' : 'Parcela creada');
      alGuardar();
    } catch (err) {
      avisos.error(err);
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!(await avisos.confirmar({ titulo: `¿Eliminar la parcela ${b.numero}?`, mensaje: 'Esta acción no se puede deshacer.', confirmar: 'Eliminar', peligro: true }))) return;
    try {
      await api.del(`/parcelas/${b.id}`);
      avisos.ok('Parcela eliminada');
      alGuardar();
    } catch (err) {
      avisos.error(err);
    }
  }

  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      titulo={b.id ? `Editar parcela ${inicial.numero}` : 'Nueva parcela'}
      pie={
        <>
          {b.id && <Boton variante="fantasma" icono={Trash2} onClick={eliminar} className="mr-auto text-red-700">Eliminar</Boton>}
          <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
          <Boton type="submit" form={idForm} cargando={guardando}>Guardar</Boton>
        </>
      }
    >
      <form id={idForm} onSubmit={guardar} className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Número o código">
          <Entrada required maxLength={20} value={b.numero} onChange={(e) => cambiar('numero', e.target.value)} autoFocus={!b.id} />
        </Campo>
        <Campo etiqueta="Manzana">
          <Entrada maxLength={80} value={b.sector} onChange={(e) => cambiar('sector', e.target.value)} />
        </Campo>
        <Campo etiqueta="Superficie (m²)">
          <EntradaDecimal required valor={b.superficie_m2} alCambiar={(v) => cambiar('superficie_m2', v)} />
        </Campo>
        <Campo etiqueta="Precio de lista">
          <EntradaMonto required valor={b.precio} alCambiar={(v) => cambiar('precio', v)} />
        </Campo>
        <Campo etiqueta="Estado" ayuda={b.tieneVenta ? 'Tiene una venta registrada: se mantiene como vendida.' : undefined}>
          <Selector value={b.estado} disabled={b.tieneVenta} onChange={(e) => cambiar('estado', e.target.value as EstadoParcela)}>
            {ESTADOS.map((e) => <option key={e} value={e}>{ESTADOS_PARCELA[e].etiqueta}</option>)}
          </Selector>
        </Campo>
        <Campo etiqueta="Rol de avalúo (SII)" ayuda={b.rol_sii && !/^\d{1,6}-\d{1,4}$/.test(b.rol_sii) ? <span className="text-red-700">Formato: número-número, ej.: 1234-56</span> : undefined}>
          <Entrada inputMode="numeric" maxLength={11} placeholder="1234-56" value={b.rol_sii} onChange={(e) => cambiar('rol_sii', e.target.value.replace(/[^\d-]/g, ''))} />
        </Campo>
        <Campo etiqueta="Deslindes" ayuda="Se insertan en la promesa de compraventa." className="col-span-2">
          <AreaTexto value={b.deslindes} onChange={(e) => cambiar('deslindes', e.target.value)} placeholder="Norte: …; Sur: …; Oriente: …; Poniente: …" />
        </Campo>
        <Campo etiqueta="Descripción u observaciones" className="col-span-2">
          <AreaTexto rows={2} value={b.descripcion} onChange={(e) => cambiar('descripcion', e.target.value)} />
        </Campo>
      </form>
    </Modal>
  );
}

// ---------- Cambio de precio (dueños y super administrador) ----------

function CambioPrecio({ p, alCerrar, alGuardar }: { p: Parcela; alCerrar: () => void; alGuardar: () => void }) {
  const avisos = useAvisos();
  const idForm = useId();
  const [precio, setPrecio] = useState<number | null>(p.precio || null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (precio === null || precio === p.precio) return alCerrar();
    if (!(await avisos.confirmar({
      titulo: `¿Cambiar el precio de la parcela ${p.numero}?`,
      mensaje: <ListaCambios cambios={[{ etiqueta: 'Precio de lista', antes: precioLista(p.precio), despues: pesos(precio) }]} nota="Las cotizaciones y ventas ya registradas conservan su precio. El cambio queda en el registro de cambios." />,
      confirmar: 'Cambiar precio',
    }))) return;
    setGuardando(true);
    try {
      await api.put(`/parcelas/${p.id}/precio`, { precio });
      avisos.ok(`Precio de la parcela ${p.numero} actualizado`);
      alGuardar();
    } catch (err) {
      avisos.error(err);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      titulo={`Precio de la parcela ${p.numero}`}
      ancho="sm"
      pie={
        <>
          <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
          <Boton type="submit" form={idForm} cargando={guardando} disabled={precio === null || precio === p.precio}>Revisar y guardar</Boton>
        </>
      }
    >
      <form id={idForm} onSubmit={guardar} className="space-y-3">
        <p className="text-sm text-stone-600">
          {p.sector} · {numero(p.superficie_m2)} m² · precio actual: <strong>{precioLista(p.precio)}</strong>
        </p>
        <Campo etiqueta="Nuevo precio de lista" ayuda={precio && p.superficie_m2 > 0 ? `Equivale a ${pesos(precio / p.superficie_m2)} por m².` : undefined}>
          <EntradaMonto required valor={precio} alCambiar={setPrecio} autoFocus />
        </Campo>
      </form>
    </Modal>
  );
}

// ---------- Detalle de la parcela seleccionada ----------

function DetalleParcela({ p, alEditar, alCambiar, alCerrar }: { p: Parcela; alEditar: () => void; alCambiar: () => void; alCerrar: () => void }) {
  const { puede } = useSesion();
  const esAdmin = puede('parcelas');
  const cambiaPrecio = puede('precios');
  const opera = puede('operaciones');
  const [enPrecio, setEnPrecio] = useState(false);
  const { plano } = useConfig();
  const avisos = useAvisos();
  const enVenta = p.estado === 'disponible' || p.estado === 'reservada';
  const ubicacion = coordenadas(p, plano);

  async function cambiarEstado(estado: 'disponible' | 'reservada') {
    try {
      await api.post(`/parcelas/${p.id}/estado`, { estado });
      avisos.ok(estado === 'reservada' ? `Parcela ${p.numero} reservada` : `Parcela ${p.numero} disponible nuevamente`);
      alCambiar();
    } catch (err) {
      avisos.error(err);
    }
  }

  return (
    <Tarjeta
      titulo={<span className="flex items-center gap-2">Parcela {p.numero} <InsigniaParcela estado={p.estado} /></span>}
      acciones={
        <>
          {esAdmin && <Boton variante="fantasma" chico icono={Pencil} onClick={alEditar}>Editar parcela</Boton>}
          <button onClick={alCerrar} aria-label="Cerrar detalle" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100"><X className="size-4" /></button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className={`text-2xl font-semibold tracking-tight ${p.precio > 0 ? 'text-stone-900' : 'text-stone-400'}`}>{precioLista(p.precio)}</div>
        {cambiaPrecio && p.estado !== 'vendida' && <Boton chico variante="secundario" icono={Pencil} onClick={() => setEnPrecio(true)}>Cambiar precio</Boton>}
      </div>
      {p.precio === 0 && cambiaPrecio && p.estado !== 'vendida' && (
        <p className="mt-1 text-xs text-stone-500">Fíjelo con “Cambiar precio” o, para varias a la vez, con “Cambios en bloque” en la lista de precios.</p>
      )}
      {p.venta_id && p.cliente_id && <Propietario clienteId={p.cliente_id} ventaId={p.venta_id} alCambiar={alCambiar} />}
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <Par etiqueta="Superficie">{numero(p.superficie_m2)} m²</Par>
        <Par etiqueta="Valor por m²">{p.superficie_m2 > 0 && p.precio > 0 ? pesos(p.precio / p.superficie_m2) : '—'}</Par>
        <Par etiqueta="Manzana">{p.sector}</Par>
        <Par etiqueta="Rol de avalúo">{p.rol_sii}</Par>
      </dl>
      {p.descripcion && <p className="mt-3 text-sm text-stone-600">{p.descripcion}</p>}
      {ubicacion && (
        <a href={enlaceGoogleMaps(ubicacion)} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-marca-700 hover:underline">
          <MapPin className="size-4" /> Ver ubicación en Google Maps
        </a>
      )}
      {p.deslindes && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium text-stone-700">Deslindes</summary>
          <p className="mt-1.5 whitespace-pre-line text-stone-600">{p.deslindes}</p>
        </details>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {enVenta && (
          <>
            {puede('cotizaciones') && <EnlaceBoton chico icono={Calculator} to={`/cotizaciones/nueva?parcela=${p.id}`}>Cotizar</EnlaceBoton>}
            {opera && <EnlaceBoton chico variante="secundario" icono={HandCoins} to={`/ventas/nueva?parcela=${p.id}`}>Vender</EnlaceBoton>}
            <EnlaceBoton chico variante={puede('cotizaciones') ? 'secundario' : 'primario'} icono={CalendarPlus} to={`/visitas?nueva=1&parcela=${p.id}`}>Agendar visita</EnlaceBoton>
            {opera && (
              <Boton chico variante="secundario" onClick={() => cambiarEstado(p.estado === 'disponible' ? 'reservada' : 'disponible')}>
                {p.estado === 'disponible' ? 'Reservar' : 'Quitar reserva'}
              </Boton>
            )}
          </>
        )}
        {p.venta_id && <EnlaceBoton chico variante="secundario" to={`/ventas/${p.venta_id}`}>Ver venta</EnlaceBoton>}
      </div>
      {enPrecio && <CambioPrecio p={p} alCerrar={() => setEnPrecio(false)} alGuardar={() => { setEnPrecio(false); alCambiar(); }} />}
    </Tarjeta>
  );
}

/** Datos del propietario de una parcela vendida, con su situación de pago; se pueden editar ahí mismo. */
function Propietario({ clienteId, ventaId, alCambiar }: { clienteId: number; ventaId: number; alCambiar: () => void }) {
  const { puede } = useSesion();
  const opera = puede('operaciones');
  const completa = !opera && puede('clientes_esenciales');
  const consulta = useDatos<FichaCliente>(`/clientes/${clienteId}`);
  const [editando, setEditando] = useState(false);
  const f = consulta.datos;
  if (!f) return <p className="mt-3 text-sm text-stone-500">{consulta.error ?? 'Cargando datos del propietario…'}</p>;
  const c = f.cliente;
  const venta = f.ventas.find((v) => v.id === ventaId);
  const direccion = [c.direccion, c.comuna, c.ciudad].filter(Boolean).join(', ');
  return (
    <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-stone-500"><UserRound className="size-3.5" />Propietario</div>
          <Link to={`/clientes/${c.id}`} className="font-semibold text-stone-900 hover:text-marca-700 hover:underline">{c.nombre}</Link>
          {c.rut && <div className="text-stone-600">RUT {formatearRut(c.rut)}</div>}
        </div>
        {(opera || completa) && (
          <Boton chico variante="secundario" icono={Pencil} onClick={() => setEditando(true)}>{opera ? 'Editar datos' : 'Completar datos'}</Boton>
        )}
      </div>
      <div className="mt-2 space-y-1 text-stone-700">
        {c.telefono && <a href={`tel:${c.telefono.replace(/\s/g, '')}`} className="flex items-center gap-1.5 text-marca-700 hover:underline"><Phone className="size-3.5" />{c.telefono}</a>}
        {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 break-all text-marca-700 hover:underline"><Mail className="size-3.5" />{c.email}</a>}
        {direccion && <div className="flex items-start gap-1.5"><MapPin className="mt-0.5 size-3.5 shrink-0" />{direccion}</div>}
        {!c.telefono && !c.email && !direccion && <div className="text-stone-500">Sin teléfono, correo ni dirección registrados.</div>}
      </div>
      {venta && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-stone-200 pt-2">
          <InsigniaVenta estado={venta.estado} atrasadas={venta.totales.n_atrasadas} />
          {venta.estado === 'vigente' && <span className="text-stone-600">Saldo por pagar {pesos(venta.totales.saldo)}</span>}
        </div>
      )}
      {editando && (
        <FormularioCliente
          esencial={completa} cliente={c} alCerrar={() => setEditando(false)}
          alGuardar={() => { setEditando(false); consulta.recargar(); alCambiar(); }}
        />
      )}
    </div>
  );
}

// ---------- Mi ubicación (GPS del celular) ----------

/** Sigue la posición del equipo y la lleva al plano georreferenciado. */
function useMiUbicacion(plano: Plano | null) {
  const [activo, setActivo] = useState(false);
  const [pos, setPos] = useState<{ punto: Punto; radio: number; precision: number } | null>(null);
  const [error, setError] = useState('');
  const [clave, setClave] = useState(0);

  useEffect(() => {
    if (!activo) return;
    if (!window.isSecureContext || !('geolocation' in navigator)) {
      setError('La ubicación solo está disponible con el sistema publicado en internet (HTTPS) y en un equipo con GPS.');
      setActivo(false);
      return;
    }
    let primera = true;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const punto = geoALienzo(plano, p.coords.latitude, p.coords.longitude);
        if (!punto) return;
        setPos({ punto, radio: p.coords.accuracy / (plano?.metros_por_unidad || 1), precision: Math.round(p.coords.accuracy) });
        setError('');
        if (primera) { primera = false; setClave((k) => k + 1); }
      },
      (e) => {
        setError(e.code === e.PERMISSION_DENIED
          ? 'El navegador no tiene permiso para usar la ubicación. Actívelo en los ajustes del navegador y vuelva a intentar.'
          : 'No se pudo obtener la ubicación. Intente de nuevo al aire libre.');
        setActivo(false);
        setPos(null);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [activo, plano]);

  return {
    activo, pos, error, clave,
    alternar: () => { setError(''); if (activo) setPos(null); setActivo(!activo); },
  };
}

/** Google Earth en la posición del loteo (sin las parcelas: esas las trae el proyecto). */
const earthEn = (c: { lat: number; lng: number } | null) =>
  c ? `https://earth.google.com/web/@${c.lat.toFixed(6)},${c.lng.toFixed(6)},60a,2500d,35y,0h,0t,0r` : 'https://earth.google.com/web/';

/**
 * Google Earth: el proyecto que tiene importado el enlace de red trae las parcelas al día desde el sistema.
 * Aquí se configura (una sola vez) y se descarga el archivo con los datos de hoy.
 */
function GoogleEarth({ info, alCerrar, alCambiar }: { info: InfoGoogleEarth | null; alCerrar: () => void; alCambiar: () => void }) {
  const { puede } = useSesion();
  const avisos = useAvisos();
  const configura = puede('parcelas') || puede('precios');
  const [vinculo, setVinculo] = useState(info?.proyecto_url ?? '');
  const [ocupado, setOcupado] = useState(false);
  const temporal = !!info && /trycloudflare\.com|localhost|127\.0\.0\.1/.test(info.url_kml);

  async function guardar() {
    setOcupado(true);
    try {
      await api.put('/mapa/google-earth', { proyecto_url: vinculo });
      avisos.ok(vinculo ? 'Listo: el botón "Google Earth" abre ese proyecto' : 'Se quitó el proyecto de Google Earth');
      alCambiar();
    } catch (err) {
      avisos.error(err);
    } finally {
      setOcupado(false);
    }
  }

  async function renovar() {
    if (!(await avisos.confirmar({
      titulo: '¿Renovar la dirección del plano?',
      mensaje: 'Los enlaces ya importados en Google Earth dejan de funcionar (por ejemplo, si alguien que no debe tiene el archivo). Después hay que importar el enlace nuevo.',
      confirmar: 'Renovar', peligro: true,
    }))) return;
    try {
      await api.post('/mapa/google-earth/renovar', {});
      avisos.ok('Dirección renovada: descargue el enlace nuevo e impórtelo en Google Earth');
      alCambiar();
    } catch (err) {
      avisos.error(err);
    }
  }

  const paso = (n: number, titulo: string, contenido: React.ReactNode) => (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-marca-600 text-xs font-semibold text-white">{n}</span>
      <div className="min-w-0 flex-1"><div className="font-medium text-stone-900">{titulo}</div><div className="mt-0.5 space-y-2">{contenido}</div></div>
    </li>
  );

  return (
    <Modal abierto alCerrar={alCerrar} titulo="Ver las parcelas en Google Earth" pie={<Boton variante="secundario" onClick={alCerrar}>Cerrar</Boton>}>
      <div className="space-y-5 text-sm text-stone-700">
        {info?.proyecto_url && (
          <a href={info.proyecto_url} target="_blank" rel="noopener noreferrer" className={`${claseBoton('primario')} w-full`}>
            <Globe className="size-4" />Abrir el proyecto en Google Earth
          </a>
        )}
        <div>
          <div className="mb-2 font-semibold text-stone-900">{info?.proyecto_url ? 'Configuración (ya hecha)' : 'Configurar una sola vez'}</div>
          <p className="mb-3">
            Google Earth no se puede abrir directamente con un archivo: se importa una vez un <strong>enlace</strong> que apunta a este sistema y,
            desde ahí, cada vez que se abre el proyecto trae las parcelas al día (número, estado y precio; sin nombres de compradores).
          </p>
          {configura ? (
            <ol className="space-y-3">
              {paso(1, 'Descargue el enlace', <a href="/api/mapa/google-earth/enlace.kml" download className={claseBoton('secundario', true)}><Download className="size-3.5" />Descargar enlace para Google Earth</a>)}
              {paso(2, 'Impórtelo en Google Earth', (
                <>
                  <p>En Google Earth (en el computador) elija <strong>Nuevo → Importar archivo → Subir desde el dispositivo</strong>, elija el archivo descargado e importe como elementos del mapa.</p>
                  <a href={earthEn(info?.centro ?? null)} target="_blank" rel="noopener noreferrer" className={claseBoton('secundario', true)}><Globe className="size-3.5" />Abrir Google Earth</a>
                </>
              ))}
              {paso(3, 'Pegue aquí el vínculo del proyecto', (
                <>
                  <p>En Google Earth use <strong>Compartir → Copiar vínculo</strong> del proyecto (si lo usarán otras cuentas de Google, compártalo con ellas).</p>
                  <div className="flex gap-2">
                    <Entrada value={vinculo} onChange={(e) => setVinculo(e.target.value)} placeholder="https://earth.google.com/earth/d/…" />
                    <Boton cargando={ocupado} disabled={vinculo.trim() === (info?.proyecto_url ?? '')} onClick={guardar}>Guardar</Boton>
                  </div>
                  <p className="text-xs text-stone-500">Después, el botón “Google Earth” del mapa abre ese proyecto en una pestaña nueva.</p>
                </>
              ))}
            </ol>
          ) : (
            <p className="text-stone-600">Lo configura el contador o el super administrador.</p>
          )}
          {temporal && (
            <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950">
              El sistema usa una dirección temporal de Cloudflare: cuando el servidor se reinicia, la dirección cambia y el enlace importado deja de
              actualizarse. En ese caso repita los pasos 1 y 2. Con un dominio propio esto no pasa.
            </p>
          )}
          {configura && <button type="button" onClick={renovar} className="mt-2 text-xs text-stone-500 underline hover:text-stone-800">Renovar la dirección (anula los enlaces anteriores)</button>}
        </div>
        <div className="border-t border-stone-200 pt-4">
          <div className="mb-1 font-semibold text-stone-900">Archivo con los datos de hoy</div>
          <p className="mb-2">Una copia fija (incluye los compradores) para importar o enviar. No se actualiza sola.</p>
          <a href="/api/mapa/kml" download className={claseBoton('secundario', true)}><Download className="size-3.5" />Descargar archivo</a>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Plano del topógrafo ----------

/** Carga (o vuelve a cargar) los lotes del plano del topógrafo, después de confirmar qué va a pasar. */
function useCargaLoteo(alTerminar: () => void) {
  const avisos = useAvisos();
  const { recargarConfig } = useSesion();
  const [ocupado, setOcupado] = useState(false);

  async function cargar() {
    let r: ResumenLoteo;
    try {
      r = await api.get<ResumenLoteo>('/mapa/loteo');
    } catch (err) {
      return avisos.error(err);
    }
    const hectareas = numero(r.superficie_total / 10_000, 1);
    if (!(await avisos.confirmar({
      titulo: r.existentes ? '¿Actualizar el mapa con el plano del topógrafo?' : `¿Cargar los ${r.lotes} lotes del plano?`,
      mensaje: (
        <div className="space-y-2">
          <p>
            Plano «{r.fuente.dwg}»: {r.lotes} lotes ({hectareas} ha) en {r.sectores.length} manzanas —{' '}
            {r.sectores.map((x) => `${x.letra} (${x.lotes})`).join(', ')}.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {r.nuevas > 0 && <li>Se crearán <strong>{plural(r.nuevas, 'parcela')}</strong> con su superficie, contorno y deslindes, y con <strong>precio por definir</strong>.</li>}
            {r.existentes > 0 && <li>{plural(r.existentes, 'parcela que ya existe', 'parcelas que ya existen')} se ubicarán en el mapa: conservan su precio, estado y demás datos.</li>}
            {r.reemplaza_plano && <li>La imagen de fondo actual se reemplaza por el dibujo del plano.</li>}
            {r.georreferenciado && <li>Cada parcela tendrá un enlace a su ubicación en Google Maps.</li>}
          </ul>
        </div>
      ),
      confirmar: r.existentes ? 'Actualizar mapa' : 'Cargar lotes',
    }))) return;
    setOcupado(true);
    try {
      const res = await api.post<{ creadas: number; ubicadas: number }>('/mapa/loteo');
      await recargarConfig();
      avisos.ok(res.creadas ? `${plural(res.creadas, 'parcela creada', 'parcelas creadas')} desde el plano` : 'Mapa actualizado con el plano');
      alTerminar();
    } catch (err) {
      avisos.error(err);
    } finally {
      setOcupado(false);
    }
  }
  return { cargar, ocupado };
}

// ---------- Herramientas de edición del mapa (administrador) ----------

function leerDimensiones(archivo: File): Promise<{ ancho: number; alto: number }> {
  return new Promise((resolver, rechazar) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolver({ ancho: img.naturalWidth, alto: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      rechazar(new Error('No se pudo leer la imagen'));
    };
    img.src = url;
  });
}

function EdicionMapa({ parcelas, plano, elegida, alElegir, trazo, setTrazo, alCambiar }: {
  parcelas: Parcela[];
  plano: Plano | null;
  elegida: Parcela | null;
  alElegir: (id: number | null) => void;
  trazo: Punto[] | null;
  setTrazo: (t: Punto[] | null) => void;
  alCambiar: () => void;
}) {
  const avisos = useAvisos();
  const { recargarConfig } = useSesion();
  const archivo = useRef<HTMLInputElement>(null);
  const [ocupado, setOcupado] = useState(false);
  const hayContornos = parcelas.some((p) => p.poligono);
  const loteo = useDatos<ResumenLoteo>('/mapa/loteo');
  const carga = useCargaLoteo(() => { loteo.recargar(); alCambiar(); });

  async function subirPlano(f: File | undefined) {
    if (!f) return;
    if (hayContornos && !(await avisos.confirmar({
      titulo: '¿Reemplazar el plano de fondo?',
      mensaje: 'Los contornos ya dibujados conservan su posición. Si el nuevo plano tiene otras proporciones o encuadre, tendrá que volver a dibujarlos.',
      confirmar: 'Reemplazar plano',
    }))) return;
    setOcupado(true);
    try {
      const { ancho, alto } = await leerDimensiones(f);
      await api.subir(`/mapa/plano?ancho=${ancho}&alto=${alto}`, f);
      await recargarConfig();
      avisos.ok('Plano cargado');
    } catch (err) {
      avisos.error(err);
    } finally {
      setOcupado(false);
      if (archivo.current) archivo.current.value = '';
    }
  }

  async function quitarPlano() {
    if (!(await avisos.confirmar({ titulo: '¿Quitar el plano de fondo?', mensaje: 'Los contornos de las parcelas se conservan. El plano del topógrafo se puede volver a cargar cuando quiera.', confirmar: 'Quitar plano', peligro: true }))) return;
    try {
      await api.del('/mapa/plano');
      await recargarConfig();
    } catch (err) {
      avisos.error(err);
    }
  }

  async function guardarContorno(poligono: Punto[] | null) {
    if (!elegida) return;
    setOcupado(true);
    try {
      await api.put(`/parcelas/${elegida.id}/poligono`, { poligono });
      avisos.ok(poligono ? `Contorno de la parcela ${elegida.numero} guardado` : 'Contorno borrado');
      setTrazo(null);
      alCambiar();
    } catch (err) {
      avisos.error(err);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="mb-3 space-y-3 rounded-xl border border-marca-200 bg-marca-50 p-3 text-sm">
      {trazo ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto min-w-48 flex-1 text-stone-700">
            <strong>Parcela {elegida?.numero}:</strong> toque el plano para marcar, en orden, cada vértice del lote ({plural(trazo.length, 'punto')}).
          </p>
          <Boton chico variante="secundario" icono={Undo2} disabled={trazo.length === 0} onClick={() => setTrazo(trazo.slice(0, -1))}>Deshacer</Boton>
          <Boton chico variante="secundario" onClick={() => setTrazo(null)}>Cancelar</Boton>
          <Boton chico icono={Save} disabled={trazo.length < 3} cargando={ocupado} onClick={() => guardarContorno(trazo)}>Guardar contorno</Boton>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <Campo etiqueta="Parcela a ubicar en el mapa" className="min-w-52 flex-1">
              <Selector value={elegida?.id ?? ''} onChange={(e) => alElegir(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Seleccione…</option>
                {parcelas.map((p) => <option key={p.id} value={p.id}>Parcela {p.numero}{p.poligono ? '' : ' — sin contorno'}</option>)}
              </Selector>
            </Campo>
            <Boton icono={PenLine} disabled={!elegida} onClick={() => setTrazo([])}>{elegida?.poligono ? 'Redibujar contorno' : 'Dibujar contorno'}</Boton>
            {elegida?.poligono && <Boton variante="secundario" icono={Trash2} onClick={() => guardarContorno(null)}>Borrar contorno</Boton>}
          </div>
          {loteo.datos && (
            <div className="flex flex-wrap items-center gap-2 border-t border-marca-200 pt-3">
              <span className="mr-auto min-w-48 flex-1 text-stone-600">
                Plano del topógrafo «{loteo.datos.fuente.dwg}» ({loteo.datos.lotes} lotes):{' '}
                {loteo.datos.plano_cargado && loteo.datos.nuevas === 0 ? 'cargado.' : loteo.datos.nuevas > 0 ? `faltan ${plural(loteo.datos.nuevas, 'parcela')} por crear.` : 'no es el fondo actual del mapa.'}
              </span>
              <Boton chico variante="secundario" icono={Layers} cargando={carga.ocupado} onClick={carga.cargar}>
                {loteo.datos.existentes ? 'Actualizar desde el plano' : 'Cargar lotes del plano'}
              </Boton>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 border-t border-marca-200 pt-3">
            <span className="mr-auto text-stone-600">
              {plano?.tipo === 'vectorial' ? 'O, en lugar del plano del topógrafo, una imagen PNG o JPG como fondo.' : `Imagen de fondo: ${plano ? 'cargada' : 'sin imagen'} (PNG o JPG del loteo).`}
            </span>
            <input ref={archivo} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => subirPlano(e.target.files?.[0])} />
            <Boton chico variante="secundario" icono={ImageUp} cargando={ocupado} onClick={() => archivo.current?.click()}>{plano && plano.tipo !== 'vectorial' ? 'Reemplazar imagen' : 'Subir imagen'}</Boton>
            {plano && <Boton chico variante="fantasma" icono={ImageOff} onClick={quitarPlano}>Quitar fondo</Boton>}
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Cambios en bloque (precio de lista, manzana) ----------

type AccionBloque = 'precio_m2' | 'precio' | 'sector';

function CambiosEnBloque({ parcelas, alCerrar, alGuardar }: { parcelas: Parcela[]; alCerrar: () => void; alGuardar: () => void }) {
  const avisos = useAvisos();
  const conSector = useSesion().puede('parcelas');
  const sectores = [...new Set(parcelas.map((p) => p.sector))];
  const [accion, setAccion] = useState<AccionBloque>('precio_m2');
  const [monto, setMonto] = useState<number | null>(null);
  const [sector, setSector] = useState(sectores.length === 1 ? sectores[0] : '');
  const [prefijo, setPrefijo] = useState('');
  const [guardando, setGuardando] = useState(false);

  const deVenta = parcelas.filter((p) => p.estado !== 'vendida');
  const afectadas = accion === 'sector' ? parcelas : deVenta;
  const pref = prefijo.trim().replace(/-+$/, '');
  const nuevo = (p: Parcela) => {
    if (accion === 'precio') return { ...p, precio: monto ?? 0 };
    if (accion === 'precio_m2') return { ...p, precio: Math.round((p.superficie_m2 * (monto ?? 0)) / 1000) * 1000 };
    const corto = p.numero.includes('-') ? p.numero.slice(p.numero.lastIndexOf('-') + 1) : p.numero;
    return { ...p, sector: sector.trim(), numero: pref ? `${pref}-${corto}` : p.numero };
  };
  const filas = afectadas.map((p) => ({ antes: p, despues: nuevo(p) }))
    .filter(({ antes, despues }) => antes.precio !== despues.precio || antes.sector !== despues.sector || antes.numero !== despues.numero);
  const listo = accion === 'sector' ? !!sector.trim() : !!monto;
  const describe = (p: Parcela) => (accion === 'sector' ? `${p.numero} · ${p.sector || 'sin manzana'}` : precioLista(p.precio));

  async function aplicar() {
    if (!listo || filas.length === 0) return;
    const total = filas.reduce((s, f) => s + f.despues.precio, 0);
    if (!(await avisos.confirmar({
      titulo: accion === 'sector' ? `¿Cambiar la manzana de ${plural(filas.length, 'parcela')}?` : `¿Cambiar el precio de lista de ${plural(filas.length, 'parcela')}?`,
      mensaje: (
        <div className="space-y-2">
          <ul className="space-y-0.5 text-sm">
            {filas.slice(0, 6).map(({ antes, despues }) => (
              <li key={antes.id}>
                <span className="font-medium">Parcela {antes.numero}:</span> <span className="text-stone-500 line-through">{describe(antes)}</span> → <strong>{describe(despues)}</strong>
              </li>
            ))}
            {filas.length > 6 && <li className="text-stone-500">… y {plural(filas.length - 6, 'parcela')} más.</li>}
          </ul>
          {accion !== 'sector' && <p>Suma de los nuevos precios de lista: <strong>{pesos(total)}</strong>.</p>}
          <p className="text-stone-500">Las cotizaciones y ventas ya registradas conservan su precio. El cambio queda en el registro de cambios.</p>
        </div>
      ),
      confirmar: 'Aplicar cambios',
    }))) return;
    setGuardando(true);
    try {
      const r = await api.post<{ cambiadas: number; omitidas: number }>('/parcelas/masivo', {
        ids: filas.map((f) => f.antes.id), accion, monto, sector: sector.trim(), prefijo: pref,
      });
      avisos.ok(`${plural(r.cambiadas, 'parcela actualizada', 'parcelas actualizadas')}`);
      alGuardar();
    } catch (err) {
      avisos.error(err);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      titulo={`Cambios en bloque · ${plural(parcelas.length, 'parcela')}`}
      pie={
        <>
          <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
          <Boton disabled={!listo || filas.length === 0} cargando={guardando} onClick={aplicar}>Revisar y aplicar</Boton>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-stone-600">
          Se aplica a las parcelas que muestra la lista con los filtros actuales
          {sectores.length === 1 ? ` (${sectores[0] || 'sin manzana'})` : ''}.
        </p>
        <Pestanas
          opciones={[
            { id: 'precio_m2', etiqueta: 'Precio por m²' }, { id: 'precio', etiqueta: 'Precio fijo' },
            ...(conSector ? [{ id: 'sector', etiqueta: 'Manzana y código' }] : []),
          ]}
          activa={accion}
          alCambiar={(a) => setAccion(a as AccionBloque)}
        />
        {accion === 'sector' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Nombre de la manzana">
              <Entrada maxLength={80} value={sector} onChange={(e) => setSector(e.target.value)} placeholder="Ej.: Manzana 17" />
            </Campo>
            <Campo etiqueta="Prefijo del código (opcional)" ayuda={pref ? `“${parcelas[0]?.numero}” pasará a “${nuevo(parcelas[0]).numero}”.` : 'Vacío: los códigos no cambian.'}>
              <Entrada maxLength={10} value={prefijo} onChange={(e) => setPrefijo(e.target.value.replace(/[^\p{L}\p{N}-]/gu, ''))} placeholder="Ej.: M17" />
            </Campo>
          </div>
        ) : (
          <Campo
            etiqueta={accion === 'precio' ? 'Precio de lista para cada parcela' : 'Valor por m²'}
            ayuda={accion === 'precio_m2' ? 'El precio de cada parcela es su superficie por este valor, redondeado a miles de pesos.' : undefined}
          >
            <EntradaMonto valor={monto} alCambiar={setMonto} />
          </Campo>
        )}
        {accion !== 'sector' && parcelas.length > deVenta.length && (
          <p className="text-sm text-stone-500">{plural(parcelas.length - deVenta.length, 'parcela vendida', 'parcelas vendidas')} no se modifican.</p>
        )}
        {listo && (
          <p className="text-sm text-stone-700">
            {filas.length === 0 ? 'No hay cambios: las parcelas ya tienen esos valores.' : `Cambiarán ${plural(filas.length, 'parcela')}.`}
          </p>
        )}
      </div>
    </Modal>
  );
}

// ---------- Página ----------

const ORDEN_PARCELAS = [
  { id: 'parcela', etiqueta: 'Parcela (manzana y número)', comparar: (a: Parcela, b: Parcela) => compararParcela(a.numero, b.numero) },
  { id: 'precio', etiqueta: 'Precio, de menor a mayor', comparar: (a: Parcela, b: Parcela) => (a.precio || Infinity) - (b.precio || Infinity) || compararParcela(a.numero, b.numero) },
  { id: 'superficie', etiqueta: 'Superficie, de menor a mayor', comparar: (a: Parcela, b: Parcela) => a.superficie_m2 - b.superficie_m2 || compararParcela(a.numero, b.numero) },
] as const;

export function Parcelas() {
  const { puede } = useSesion();
  const esAdmin = puede('parcelas');
  const puedePrecios = puede('precios');
  const [precioDe, setPrecioDe] = useState<Parcela | null>(null);
  const config = useConfig();
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const consulta = useDatos<Parcela[]>('/parcelas');
  const vista = params.get('vista') === 'lista' ? 'lista' : 'mapa';
  const [seleccion, setSeleccion] = useState<number | null>(null);
  const [filtro, setFiltro] = useState<EstadoParcela | null>(null);
  const [sector, setSector] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [enBloque, setEnBloque] = useState(false);
  const loteo = useDatos<ResumenLoteo>(esAdmin ? '/mapa/loteo' : null);
  const cargaLoteo = useCargaLoteo(() => { consulta.recargar(); loteo.recargar(); });
  const [editando, setEditando] = useState<Borrador | null>(null);
  const [edicionMapa, setEdicionMapa] = useState(false);
  const [trazo, setTrazo] = useState<Punto[] | null>(null);
  const [orden, setOrden] = useOrden('parcelas', ORDEN_PARCELAS.map((o) => o.id), 'parcela');
  const [verEarth, setVerEarth] = useState(false);
  const georreferenciado = !!config.plano?.georreferencia;
  const ubicacion = useMiUbicacion(config.plano);
  const earth = useDatos<InfoGoogleEarth>(georreferenciado ? '/mapa/google-earth' : null);
  // Imagen satelital de fondo: se recuerda en cada equipo.
  const [satelite, setSateliteEstado] = useState(() => localStorage.getItem('mapa:satelite') === '1');
  const setSatelite = (v: boolean) => { setSateliteEstado(v); localStorage.setItem('mapa:satelite', v ? '1' : '0'); };

  const parcelas = consulta.datos ?? [];
  // Dónde está quien mira el mapa: la parcela que pisa o, si está fuera del loteo, la más cercana.
  const dondeEstoy = useMemo(() => (ubicacion.pos ? parcelaEnPunto(parcelas, ubicacion.pos.punto) : null), [parcelas, ubicacion.pos]);
  const parcelaAqui = dondeEstoy?.dentro ? dondeEstoy.parcela.id : null;
  useEffect(() => { if (parcelaAqui !== null) setSeleccion(parcelaAqui); }, [parcelaAqui]);
  const elegida = parcelas.find((p) => p.id === seleccion) ?? null;
  const cuenta = useMemo(() => {
    const c: Record<EstadoParcela, number> = { disponible: 0, reservada: 0, vendida: 0, bloqueada: 0 };
    for (const p of parcelas) c[p.estado]++;
    return c;
  }, [parcelas]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return parcelas.filter((p) =>
      (!filtro || p.estado === filtro) && (sector === null || p.sector === sector) &&
      (!q || p.numero.toLowerCase().includes(q) || p.sector.toLowerCase().includes(q) || (p.cliente ?? '').toLowerCase().includes(q)))
      .sort(ORDEN_PARCELAS.find((o) => o.id === orden)!.comparar);
  }, [parcelas, filtro, sector, busqueda, orden]);
  const sectores = useMemo(() => [...new Set(parcelas.map((p) => p.sector))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })), [parcelas]);

  const sinContorno = parcelas.filter((p) => !p.poligono);

  const filtros = (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
      {ESTADOS.map((e) => (
        <button
          key={e}
          onClick={() => setFiltro(filtro === e ? null : e)}
          aria-pressed={filtro === e}
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
            filtro === e ? 'border-stone-800 bg-stone-800 text-white' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
          }`}
        >
          <span className="size-2.5 rounded-xs" style={{ background: COLOR_ESTADO[e] }} />
          {ESTADOS_PARCELA[e].etiqueta}
          <span className="tabular-nums opacity-70">{cuenta[e]}</span>
        </button>
      ))}
      {sectores.length > 1 && (
        <Selector
          aria-label="Filtrar por manzana" value={sector ?? '*'} onChange={(e) => setSector(e.target.value === '*' ? null : e.target.value)}
          className="!w-auto !rounded-full !py-1 !text-xs"
        >
          <option value="*">Todas las manzanas</option>
          {sectores.map((x) => <option key={x} value={x}>{x || 'Sin manzana'} ({parcelas.filter((p) => p.sector === x).length})</option>)}
        </Selector>
      )}
    </div>
  );

  function exportar() {
    descargarCsv(
      'parcelas.csv',
      ['Parcela', 'Manzana', 'Superficie m2', 'Precio', 'Estado', 'Comprador'],
      filtradas.map((p) => [p.numero, p.sector, p.superficie_m2, p.precio || '', ESTADOS_PARCELA[p.estado].etiqueta, p.cliente]),
    );
  }

  return (
    <>
      <Encabezado
        titulo="Parcelas"
        descripcion={consulta.datos ? `${plural(parcelas.length, 'parcela')} · ${plural(cuenta.disponible, 'disponible', 'disponibles')} para la venta` : undefined}
      >
        {esAdmin && <Boton icono={Plus} onClick={() => setEditando(borradorDe())}>Nueva parcela</Boton>}
      </Encabezado>

      <Pestanas
        opciones={[{ id: 'mapa', etiqueta: 'Mapa' }, { id: 'lista', etiqueta: 'Lista de precios' }]}
        activa={vista}
        alCambiar={(v) => setParams(v === 'lista' ? { vista: 'lista' } : {}, { replace: true })}
      />

      <Carga consulta={consulta}>
        {() =>
          parcelas.length === 0 ? (
            <Tarjeta>
              <Vacio
                icono={IconoMapa}
                titulo="Aún no hay parcelas"
                accion={esAdmin && (
                  <div className="flex flex-wrap justify-center gap-2">
                    {loteo.datos && <Boton icono={Layers} cargando={cargaLoteo.ocupado} onClick={cargaLoteo.cargar}>Cargar los {loteo.datos.lotes} lotes del plano</Boton>}
                    <Boton variante={loteo.datos ? 'secundario' : 'primario'} icono={Plus} onClick={() => setEditando(borradorDe())}>Crear una parcela</Boton>
                  </div>
                )}
              >
                {loteo.datos
                  ? `El plano del topógrafo («${loteo.datos.fuente.dwg}») trae ${loteo.datos.lotes} lotes con su contorno, superficie y deslindes. Después se fijan los precios.`
                  : 'Ingrese las parcelas del loteo con su superficie y precio. Luego podrá ubicarlas sobre el plano.'}
              </Vacio>
            </Tarjeta>
          ) : vista === 'mapa' ? (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                {filtros}
                <div className="flex flex-wrap gap-2">
                  {georreferenciado && (
                    <Boton chico variante={ubicacion.activo ? 'primario' : 'secundario'} icono={LocateFixed} onClick={ubicacion.alternar}>
                      {ubicacion.activo ? 'Dejar de seguir mi ubicación' : '¿En qué parcela estoy?'}
                    </Boton>
                  )}
                  {georreferenciado && (
                    <div className="flex">
                      <Boton
                        chico variante="secundario" icono={Globe} className={earth.datos?.proyecto_url ? 'rounded-r-none' : ''}
                        onClick={() => (earth.datos?.proyecto_url ? window.open(earth.datos.proyecto_url, '_blank', 'noopener') : setVerEarth(true))}
                      >
                        Google Earth
                      </Boton>
                      {earth.datos?.proyecto_url && (
                        <Boton chico variante="secundario" icono={Settings2} aria-label="Opciones de Google Earth" title="Opciones de Google Earth" className="-ml-px rounded-l-none" onClick={() => setVerEarth(true)} />
                      )}
                    </div>
                  )}
                  {esAdmin && (
                    <Boton chico variante={edicionMapa ? 'primario' : 'secundario'} icono={PenLine} onClick={() => { setEdicionMapa(!edicionMapa); setTrazo(null); }}>
                      {edicionMapa ? 'Terminar edición' : 'Editar mapa'}
                    </Boton>
                  )}
                </div>
              </div>

              {(ubicacion.activo || ubicacion.error) && (
                <p role="status" className={`mb-3 flex items-start gap-2 rounded-xl border px-4 py-2.5 text-sm ${ubicacion.error ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-blue-200 bg-blue-50 text-blue-950'}`}>
                  <LocateFixed className="mt-0.5 size-4 shrink-0" />
                  <span>
                    {ubicacion.error || (!ubicacion.pos ? 'Buscando su ubicación… (el celular puede pedir permiso para usarla)' : dondeEstoy?.dentro ? (
                      <>Usted está en la <strong>parcela {dondeEstoy.parcela.numero}</strong>{dondeEstoy.parcela.sector ? ` (${dondeEstoy.parcela.sector})` : ''}. Precisión del GPS: ± {ubicacion.pos.precision} m.</>
                    ) : dondeEstoy ? (
                      <>Está fuera de las parcelas: la más cercana es la <strong>{dondeEstoy.parcela.numero}</strong>, a unos {Math.round(dondeEstoy.distancia * (config.plano?.metros_por_unidad ?? 1))} m. Precisión del GPS: ± {ubicacion.pos.precision} m.</>
                    ) : 'Ubicación encontrada.')}
                  </span>
                </p>
              )}

              {edicionMapa && (
                <EdicionMapa
                  parcelas={parcelas} plano={config.plano} elegida={elegida} alElegir={setSeleccion}
                  trazo={trazo} setTrazo={setTrazo} alCambiar={consulta.recargar}
                />
              )}

              <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <div>
                  <MapaParcelas
                    parcelas={parcelas}
                    plano={config.plano}
                    seleccion={seleccion}
                    alSeleccionar={setSeleccion}
                    atenuar={filtro || sector !== null ? (p) => (!!filtro && p.estado !== filtro) || (sector !== null && p.sector !== sector) : undefined}
                    trazo={trazo}
                    alAgregarPunto={trazo ? (p) => setTrazo([...trazo, p]) : undefined}
                    ubicacion={ubicacion.pos}
                    enfocar={ubicacion.pos && ubicacion.clave ? { punto: ubicacion.pos.punto, clave: ubicacion.clave } : null}
                    alUbicarme={georreferenciado && !trazo ? ubicacion.alternar : undefined}
                    ubicando={ubicacion.activo}
                    satelite={satelite && !edicionMapa}
                    alCambiarSatelite={edicionMapa ? undefined : setSatelite}
                  />
                  {sinContorno.length > 0 && (
                    <p className="mt-2 text-xs text-stone-500">
                      {sinContorno.length === parcelas.length ? 'Ninguna parcela está ubicada en el mapa todavía' : `Sin ubicar en el mapa: ${sinContorno.slice(0, 30).map((p) => p.numero).join(', ')}${sinContorno.length > 30 ? '…' : ''}`}
                      {esAdmin ? '. Use “Editar mapa” para subir el plano y dibujar el contorno de cada parcela.' : '.'}
                    </p>
                  )}
                </div>
                {elegida && !trazo ? (
                  <DetalleParcela p={elegida} alEditar={() => setEditando(borradorDe(elegida))} alCambiar={consulta.recargar} alCerrar={() => setSeleccion(null)} />
                ) : (
                  <Tarjeta className="hidden lg:block">
                    <p className="text-sm text-stone-500">Seleccione una parcela en el mapa para ver su valor, cotizarla o agendar una visita.</p>
                  </Tarjeta>
                )}
              </div>
            </>
          ) : (
            <Tarjeta relleno={false}>
              <div className="flex flex-wrap items-center gap-2 border-b border-stone-100 p-3">
                <Buscador valor={busqueda} alCambiar={setBusqueda} placeholder="Buscar por número, manzana o comprador" className="min-w-56 flex-1" />
                {filtros}
                <SelectorOrden valor={orden} alCambiar={setOrden} opciones={ORDEN_PARCELAS.map(({ id, etiqueta }) => ({ id, etiqueta }))} />
                {puedePrecios && filtradas.length > 0 && <Boton chico variante="secundario" icono={FileStack} onClick={() => setEnBloque(true)}>Cambios en bloque</Boton>}
                <Boton chico variante="secundario" icono={Download} onClick={exportar}>Excel</Boton>
              </div>
              {filtradas.length === 0 ? (
                <Vacio titulo="Ninguna parcela coincide con el filtro" />
              ) : (
                <>
                <Tabla>
                  <thead>
                    <tr>
                      <th className={th}>Parcela</th>
                      <th className={`${th} hidden sm:table-cell`}>Manzana</th>
                      <th className={`${th} ${num} hidden sm:table-cell`}>Superficie</th>
                      <th className={`${th} ${num}`}>Precio</th>
                      <th className={`${th} ${num} hidden md:table-cell`}>Valor m²</th>
                      <th className={th}>Estado</th>
                      <th className={`${th} hidden lg:table-cell`}>Comprador</th>
                      <th className={th}><span className="sr-only">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtradas.map((p) => (
                      <tr key={p.id} className="hover:bg-stone-50">
                        <td className={`${td} font-medium`}>
                          {p.numero}
                          <div className="whitespace-nowrap text-xs font-normal text-stone-500 sm:hidden">{numero(p.superficie_m2)} m²</div>
                        </td>
                        <td className={`${td} hidden sm:table-cell`}>{p.sector || '—'}</td>
                        <td className={`${td} ${num} hidden whitespace-nowrap sm:table-cell`}>{numero(p.superficie_m2)} m²</td>
                        <td className={`${td} ${num} ${p.precio > 0 ? 'font-medium' : 'text-stone-400'}`}>{precioLista(p.precio)}</td>
                        <td className={`${td} ${num} hidden md:table-cell`}>{p.superficie_m2 > 0 && p.precio > 0 ? pesos(p.precio / p.superficie_m2) : '—'}</td>
                        <td className={td}><InsigniaParcela estado={p.estado} /></td>
                        <td className={`${td} hidden lg:table-cell`}>
                          {p.venta_id ? <Link to={`/ventas/${p.venta_id}`} className="text-marca-700 hover:underline">{p.cliente}</Link> : '—'}
                        </td>
                        <td className={`${td} whitespace-nowrap text-right`}>
                          {puede('cotizaciones') && (p.estado === 'disponible' || p.estado === 'reservada') && (
                            <Boton chico variante="fantasma" icono={Calculator} onClick={() => navegar(`/cotizaciones/nueva?parcela=${p.id}`)}>Cotizar</Boton>
                          )}
                          {esAdmin && <Boton chico variante="fantasma" icono={Pencil} aria-label={`Editar parcela ${p.numero}`} onClick={() => setEditando(borradorDe(p))} />}
                          {!esAdmin && puedePrecios && <Boton chico variante="fantasma" icono={Pencil} aria-label={`Cambiar precio de la parcela ${p.numero}`} title="Cambiar precio" onClick={() => setPrecioDe(p)} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Tabla>
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-stone-200 px-3 py-2.5 text-sm">
                  <span className="text-stone-500">{plural(filtradas.length, 'parcela')}</span>
                  <span>Suma de precios de lista: <strong className="tabular-nums">{pesos(filtradas.reduce((s, p) => s + p.precio, 0))}</strong></span>
                </div>
                </>
              )}
            </Tarjeta>
          )
        }
      </Carga>

      {verEarth && <GoogleEarth info={earth.datos} alCerrar={() => setVerEarth(false)} alCambiar={earth.recargar} />}

      {precioDe && <CambioPrecio p={precioDe} alCerrar={() => setPrecioDe(null)} alGuardar={() => { setPrecioDe(null); consulta.recargar(); }} />}

      {enBloque && (
        <CambiosEnBloque parcelas={filtradas} alCerrar={() => setEnBloque(false)} alGuardar={() => { setEnBloque(false); consulta.recargar(); }} />
      )}

      {editando && (
        <FormularioParcela
          inicial={editando}
          alCerrar={() => setEditando(null)}
          alGuardar={() => { setEditando(null); consulta.recargar(); }}
        />
      )}
    </>
  );
}
