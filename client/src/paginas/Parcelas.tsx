import { useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  Calculator, CalendarPlus, Download, FileStack, HandCoins, ImageOff, ImageUp, Layers, Map as IconoMapa, MapPin, Pencil, PenLine, Plus, Save,
  Trash2, Undo2, X,
} from 'lucide-react';
import { api, useDatos } from '../api';
import { useAvisos, useConfig, useSesion } from '../contexto';
import { COLOR_ESTADO, MapaParcelas, coordenadas, enlaceGoogleMaps } from '../componentes/MapaParcelas';
import { descargarCsv, numero, pesos, plural, precioLista } from '../formato';
import { ListaCambios, listarCambios } from '../componentes/Cambios';
import type { EstadoParcela, Parcela, Plano, Punto, ResumenLoteo } from '../tipos';
import {
  AreaTexto, Boton, Buscador, Campo, Carga, Encabezado, EnlaceBoton, Entrada, EntradaMonto, ESTADOS_PARCELA, InsigniaParcela, Modal,
  Par, Pestanas, Selector, Tabla, Tarjeta, Vacio, num, td, th,
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
        numero: 'Número', sector: 'Sector', superficie_m2: 'Superficie (m²)', precio: 'Precio de lista', estado: 'Estado',
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
        <Campo etiqueta="Sector o etapa">
          <Entrada maxLength={80} value={b.sector} onChange={(e) => cambiar('sector', e.target.value)} />
        </Campo>
        <Campo etiqueta="Superficie (m²)">
          <Entrada type="number" inputMode="decimal" min={0} step="any" required value={b.superficie_m2} onChange={(e) => cambiar('superficie_m2', e.target.value)} />
        </Campo>
        <Campo etiqueta="Precio de lista">
          <EntradaMonto required valor={b.precio} alCambiar={(v) => cambiar('precio', v)} />
        </Campo>
        <Campo etiqueta="Estado" ayuda={b.tieneVenta ? 'Tiene una venta registrada: se mantiene como vendida.' : undefined}>
          <Selector value={b.estado} disabled={b.tieneVenta} onChange={(e) => cambiar('estado', e.target.value as EstadoParcela)}>
            {ESTADOS.map((e) => <option key={e} value={e}>{ESTADOS_PARCELA[e].etiqueta}</option>)}
          </Selector>
        </Campo>
        <Campo etiqueta="Rol de avalúo (SII)">
          <Entrada maxLength={40} value={b.rol_sii} onChange={(e) => cambiar('rol_sii', e.target.value)} />
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

// ---------- Detalle de la parcela seleccionada ----------

function DetalleParcela({ p, alEditar, alCambiar, alCerrar }: { p: Parcela; alEditar: () => void; alCambiar: () => void; alCerrar: () => void }) {
  const esAdmin = useSesion().puede('parcelas');
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
          {esAdmin && <Boton variante="fantasma" chico icono={Pencil} onClick={alEditar}>Editar</Boton>}
          <button onClick={alCerrar} aria-label="Cerrar detalle" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100"><X className="size-4" /></button>
        </>
      }
    >
      <div className={`text-2xl font-semibold tracking-tight ${p.precio > 0 ? 'text-stone-900' : 'text-stone-400'}`}>{precioLista(p.precio)}</div>
      {p.precio === 0 && esAdmin && (
        <p className="mt-1 text-xs text-stone-500">Fíjelo con “Editar” o, para varias a la vez, con “Cambios en bloque” en la lista de precios.</p>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <Par etiqueta="Superficie">{numero(p.superficie_m2)} m²</Par>
        <Par etiqueta="Valor por m²">{p.superficie_m2 > 0 && p.precio > 0 ? pesos(p.precio / p.superficie_m2) : '—'}</Par>
        <Par etiqueta="Sector">{p.sector}</Par>
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
      {p.venta_id && (
        <p className="mt-3 text-sm text-stone-600">
          Vendida a <Link to={`/clientes/${p.cliente_id}`} className="font-medium text-marca-700 hover:underline">{p.cliente}</Link>.
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {enVenta && (
          <>
            <EnlaceBoton chico icono={Calculator} to={`/cotizaciones/nueva?parcela=${p.id}`}>Cotizar</EnlaceBoton>
            <EnlaceBoton chico variante="secundario" icono={HandCoins} to={`/ventas/nueva?parcela=${p.id}`}>Vender</EnlaceBoton>
            <EnlaceBoton chico variante="secundario" icono={CalendarPlus} to={`/visitas?nueva=1&parcela=${p.id}`}>Agendar visita</EnlaceBoton>
            <Boton chico variante="secundario" onClick={() => cambiarEstado(p.estado === 'disponible' ? 'reservada' : 'disponible')}>
              {p.estado === 'disponible' ? 'Reservar' : 'Quitar reserva'}
            </Boton>
          </>
        )}
        {p.venta_id && <EnlaceBoton chico variante="secundario" to={`/ventas/${p.venta_id}`}>Ver venta</EnlaceBoton>}
      </div>
    </Tarjeta>
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
            Plano «{r.fuente.dwg}»: {r.lotes} lotes ({hectareas} ha) en {r.sectores.length} sectores —{' '}
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

// ---------- Cambios en bloque (precio de lista, sector) ----------

type AccionBloque = 'precio_m2' | 'precio' | 'sector';

function CambiosEnBloque({ parcelas, alCerrar, alGuardar }: { parcelas: Parcela[]; alCerrar: () => void; alGuardar: () => void }) {
  const avisos = useAvisos();
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
  const describe = (p: Parcela) => (accion === 'sector' ? `${p.numero} · ${p.sector || 'sin sector'}` : precioLista(p.precio));

  async function aplicar() {
    if (!listo || filas.length === 0) return;
    const total = filas.reduce((s, f) => s + f.despues.precio, 0);
    if (!(await avisos.confirmar({
      titulo: accion === 'sector' ? `¿Cambiar el sector de ${plural(filas.length, 'parcela')}?` : `¿Cambiar el precio de lista de ${plural(filas.length, 'parcela')}?`,
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
          {sectores.length === 1 ? ` (${sectores[0] || 'sin sector'})` : ''}.
        </p>
        <Pestanas
          opciones={[{ id: 'precio_m2', etiqueta: 'Precio por m²' }, { id: 'precio', etiqueta: 'Precio fijo' }, { id: 'sector', etiqueta: 'Sector y código' }]}
          activa={accion}
          alCambiar={(a) => setAccion(a as AccionBloque)}
        />
        {accion === 'sector' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Nombre del sector">
              <Entrada maxLength={80} value={sector} onChange={(e) => setSector(e.target.value)} placeholder="Ej.: Sitio 17" />
            </Campo>
            <Campo etiqueta="Prefijo del código (opcional)" ayuda={pref ? `“${parcelas[0]?.numero}” pasará a “${nuevo(parcelas[0]).numero}”.` : 'Vacío: los códigos no cambian.'}>
              <Entrada maxLength={10} value={prefijo} onChange={(e) => setPrefijo(e.target.value.replace(/[^\p{L}\p{N}-]/gu, ''))} placeholder="Ej.: S17" />
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

export function Parcelas() {
  const esAdmin = useSesion().puede('parcelas');
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

  const parcelas = consulta.datos ?? [];
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
      (!q || p.numero.toLowerCase().includes(q) || p.sector.toLowerCase().includes(q) || (p.cliente ?? '').toLowerCase().includes(q)));
  }, [parcelas, filtro, sector, busqueda]);
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
          aria-label="Filtrar por sector" value={sector ?? '*'} onChange={(e) => setSector(e.target.value === '*' ? null : e.target.value)}
          className="!w-auto !rounded-full !py-1 !text-xs"
        >
          <option value="*">Todos los sectores</option>
          {sectores.map((x) => <option key={x} value={x}>{x || 'Sin sector'} ({parcelas.filter((p) => p.sector === x).length})</option>)}
        </Selector>
      )}
    </div>
  );

  function exportar() {
    descargarCsv(
      'parcelas.csv',
      ['Parcela', 'Sector', 'Superficie m2', 'Precio', 'Estado', 'Comprador'],
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
                {esAdmin && (
                  <Boton chico variante={edicionMapa ? 'primario' : 'secundario'} icono={PenLine} onClick={() => { setEdicionMapa(!edicionMapa); setTrazo(null); }}>
                    {edicionMapa ? 'Terminar edición' : 'Editar mapa'}
                  </Boton>
                )}
              </div>

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
                <Buscador valor={busqueda} alCambiar={setBusqueda} placeholder="Buscar por número, sector o comprador" className="min-w-56 flex-1" />
                {filtros}
                {esAdmin && filtradas.length > 0 && <Boton chico variante="secundario" icono={FileStack} onClick={() => setEnBloque(true)}>Cambios en bloque</Boton>}
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
                      <th className={`${th} hidden sm:table-cell`}>Sector</th>
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
                          {(p.estado === 'disponible' || p.estado === 'reservada') && (
                            <Boton chico variante="fantasma" icono={Calculator} onClick={() => navegar(`/cotizaciones/nueva?parcela=${p.id}`)}>Cotizar</Boton>
                          )}
                          {esAdmin && <Boton chico variante="fantasma" icono={Pencil} aria-label={`Editar parcela ${p.numero}`} onClick={() => setEditando(borradorDe(p))} />}
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
