import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Save, TriangleAlert, UserPen, Wand2 } from 'lucide-react';
import { api, useDatos } from '../api';
import { useAvisos, useSesion } from '../contexto';
import { EditorTexto } from '../componentes/EditorTexto';
import { FormularioCliente } from '../componentes/FormularioCliente';
import { plural } from '../formato';
import type { Borrador, Cliente, FichaCliente, PlantillaResumen, TipoDocumento, VentaResumen } from '../tipos';
import { Boton, Campo, Cargando, Encabezado, Entrada, Selector, Tarjeta } from '../ui';
import { TIPOS_DOCUMENTO } from './Documentos';

/** Confección de una carta o promesa: se elige venta y plantilla, se revisa el texto y se guarda. */
export function DocumentoNuevo() {
  const avisos = useAvisos();
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const ventas = useDatos<VentaResumen[]>('/ventas');
  const plantillas = useDatos<PlantillaResumen[]>('/plantillas');

  const [tipo, setTipo] = useState<TipoDocumento>(params.get('tipo') === 'promesa' ? 'promesa' : 'carta_cobranza');
  const [ventaId, setVentaId] = useState<number | null>(Number(params.get('venta')) || null);
  const [plantillaId, setPlantillaId] = useState<number | null>(null);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [version, setVersion] = useState(0);
  const [titulo, setTitulo] = useState('');
  const [contenido, setContenido] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const { puede } = useSesion();
  // Completar los datos del cliente que el documento necesita (identificación y domicilio).
  const [completando, setCompletando] = useState<Cliente | null>(null);

  const delTipo = (plantillas.datos ?? []).filter((p) => p.tipo === tipo);

  // Al cambiar el tipo se propone la primera plantilla de ese tipo.
  useEffect(() => {
    if (!delTipo.some((p) => p.id === plantillaId)) setPlantillaId(delTipo[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, plantillas.datos]);

  if (!ventas.datos || !plantillas.datos) return <Cargando />;

  // Para cartas se listan primero las ventas con cuotas atrasadas.
  const elegibles = ventas.datos
    .filter((v) => v.estado !== 'anulada' && (tipo === 'promesa' || v.estado === 'vigente' || v.id === ventaId))
    .sort((a, b) => (tipo === 'carta_cobranza' ? b.n_atrasadas - a.n_atrasadas : 0));
  const venta = ventas.datos.find((v) => v.id === ventaId);

  async function confeccionar(forzar = false) {
    if (!ventaId || !plantillaId) return avisos.error('Seleccione la venta y la plantilla');
    if (!forzar && borrador && contenido !== borrador.contenido && !(await avisos.confirmar({
      titulo: '¿Volver a confeccionar?', mensaje: 'Se perderán los cambios que hizo en el texto.', confirmar: 'Confeccionar de nuevo',
    }))) return;
    setOcupado(true);
    try {
      const b = await api.post<Borrador>('/documentos/confeccionar', { plantilla_id: plantillaId, venta_id: ventaId });
      setBorrador(b);
      setTitulo(b.titulo);
      setContenido(b.contenido);
      setVersion((n) => n + 1);
    } catch (err) {
      avisos.error(err);
    } finally {
      setOcupado(false);
    }
  }

  async function completarCliente() {
    if (!borrador) return;
    try {
      setCompletando((await api.get<FichaCliente>(`/clientes/${borrador.cliente_id}`)).cliente);
    } catch (err) {
      avisos.error(err);
    }
  }

  async function guardar() {
    if (!borrador) return;
    setOcupado(true);
    try {
      const { id } = await api.post('/documentos', { ...borrador, titulo, contenido });
      avisos.ok(borrador.tipo === 'carta_cobranza' ? 'Carta guardada y anotada en la bitácora del deudor' : 'Documento guardado');
      navegar(`/documentos/${id}`, { replace: true });
    } catch (err) {
      avisos.error(err);
      setOcupado(false);
    }
  }

  return (
    <>
      <Encabezado volver={{ a: '/documentos', texto: 'Documentos' }} titulo="Confeccionar documento" />

      <Tarjeta className="mb-4">
        <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[15rem_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Campo etiqueta="Tipo de documento">
            <Selector value={tipo} onChange={(e) => setTipo(e.target.value as TipoDocumento)}>
              {(Object.keys(TIPOS_DOCUMENTO) as TipoDocumento[]).map((t) => <option key={t} value={t}>{TIPOS_DOCUMENTO[t]}</option>)}
            </Selector>
          </Campo>
          <Campo etiqueta="Venta">
            <Selector value={ventaId ?? ''} onChange={(e) => setVentaId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Seleccione…</option>
              {elegibles.map((v) => (
                <option key={v.id} value={v.id}>
                  Parcela {v.parcela} — {v.cliente}{v.estado === 'vigente' && v.n_atrasadas > 0 ? ` (${plural(v.n_atrasadas, 'cuota atrasada', 'cuotas atrasadas')})` : ''}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Plantilla">
            <Selector value={plantillaId ?? ''} onChange={(e) => setPlantillaId(e.target.value ? Number(e.target.value) : null)}>
              {delTipo.length === 0 && <option value="">No hay plantillas de este tipo</option>}
              {delTipo.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </Selector>
          </Campo>
          <Boton icono={Wand2} variante={borrador ? 'secundario' : 'primario'} cargando={ocupado && !borrador} onClick={() => confeccionar()}>
            {borrador ? 'Confeccionar de nuevo' : 'Confeccionar'}
          </Boton>
        </div>
        {tipo === 'carta_cobranza' && venta && venta.n_atrasadas === 0 && (
          <p className="mt-3 text-sm text-amber-800">Esta venta no tiene cuotas atrasadas a la fecha: la carta saldrá sin detalle de deuda.</p>
        )}
      </Tarjeta>

      {borrador && (
        <div className="space-y-3">
          <Campo etiqueta="Título (para identificarlo en el sistema; no se imprime)">
            <Entrada maxLength={250} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </Campo>
          {(borrador.faltan?.length ?? 0) > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <TriangleAlert className="size-4 shrink-0" />
              <span className="min-w-56 flex-1">
                Faltan datos del cliente para este documento: <strong>{borrador.faltan!.join(', ')}</strong>. Saldrán como línea en blanco.
              </span>
              {puede('clientes_esenciales') && <Boton chico variante="secundario" icono={UserPen} onClick={completarCliente}>Completar datos del cliente</Boton>}
            </div>
          )}
          <p className="text-sm text-stone-600">
            Revise y ajuste el texto. Las líneas en blanco (____) y los corchetes [ ] marcan datos por completar.
          </p>
          <EditorTexto key={version} valorInicial={borrador.contenido} alCambiar={setContenido} />
          <div className="flex justify-end gap-2">
            <Boton variante="secundario" onClick={() => navegar(-1)}>Cancelar</Boton>
            <Boton icono={Save} cargando={ocupado} disabled={!titulo.trim()} onClick={guardar}>Guardar documento</Boton>
          </div>
        </div>
      )}

      {completando && (
        <FormularioCliente
          esencial cliente={completando} faltan={borrador?.faltan}
          alCerrar={() => setCompletando(null)}
          // Con los datos completos se vuelve a confeccionar el documento.
          alGuardar={() => { setCompletando(null); confeccionar(true); }}
        />
      )}
    </>
  );
}
