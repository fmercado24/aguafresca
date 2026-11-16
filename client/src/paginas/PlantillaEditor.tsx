import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { History, RotateCcw, Save, Trash2 } from 'lucide-react';
import { api, useDatos } from '../api';
import { useAvisos, useSesion } from '../contexto';
import { EditorTexto } from '../componentes/EditorTexto';
import { fechaHoraRegistro } from '../formato';
import type { EntradaRegistro, GrupoVariables, Plantilla, TipoDocumento } from '../tipos';
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCarga, Modal, Selector, Vacio } from '../ui';
import { TIPOS_DOCUMENTO } from './Documentos';

export function PlantillaEditor() {
  const { id } = useParams();
  return <Editor key={id ?? 'nueva'} id={id ? Number(id) : null} />;
}

/** Versiones anteriores de la plantilla, con opción de restaurar (la versión actual también se conserva). */
function Versiones({ id, alCerrar, alRestaurar }: { id: number; alCerrar: () => void; alRestaurar: () => void }) {
  const avisos = useAvisos();
  const versiones = useDatos<EntradaRegistro[]>(`/plantillas/${id}/versiones`);

  async function restaurar(v: EntradaRegistro) {
    if (!(await avisos.confirmar({
      titulo: '¿Restaurar esta versión?',
      mensaje: (
        <>
          La plantilla volverá a quedar como estaba <strong>antes</strong> del cambio del {fechaHoraRegistro(v.fecha)}
          {v.usuario ? ` hecho por ${v.usuario}` : ''}. La versión actual queda guardada aquí mismo, así que también puede deshacer esta restauración.
          Los documentos ya emitidos no cambian.
        </>
      ),
      confirmar: 'Restaurar versión',
    }))) return;
    try {
      await api.post(`/plantillas/${id}/restaurar/${v.id}`);
      avisos.ok('Versión restaurada');
      alRestaurar();
    } catch (err) {
      avisos.error(err);
    }
  }

  const ACCIONES: Record<string, string> = { plantilla_editada: 'Editada', plantilla_restaurada: 'Restaurada' };
  return (
    <Modal abierto alCerrar={alCerrar} titulo="Versiones anteriores" pie={<Boton variante="secundario" onClick={alCerrar}>Cerrar</Boton>}>
      {versiones.datos === null ? <Cargando /> : versiones.datos.length === 0 ? (
        <Vacio icono={History} titulo="Aún no hay versiones anteriores">Cada vez que se guarda la plantilla, la versión reemplazada queda disponible aquí.</Vacio>
      ) : (
        <ul className="divide-y divide-stone-100">
          {versiones.datos.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0 text-sm">
                <div className="font-medium text-stone-900">{ACCIONES[v.accion] ?? 'Cambio'} el {fechaHoraRegistro(v.fecha)}</div>
                <div className="text-xs text-stone-500">{v.usuario ?? 'Sistema'}{v.motivo ? ` · ${v.motivo}` : ''}</div>
              </div>
              <Boton chico variante="secundario" icono={RotateCcw} onClick={() => restaurar(v)}>Volver a la versión previa</Boton>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function Editor({ id }: { id: number | null }) {
  const { puede } = useSesion();
  const editable = puede('plantillas');
  const avisos = useAvisos();
  const navegar = useNavigate();
  const existente = useDatos<Plantilla>(id ? `/plantillas/${id}` : null);
  const variables = useDatos<GrupoVariables[]>('/plantillas/variables');
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoDocumento>('carta_cobranza');
  const [contenido, setContenido] = useState('');
  const [listo, setListo] = useState(!id);
  const [guardando, setGuardando] = useState(false);
  const [viendoVersiones, setViendoVersiones] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (existente.datos && !listo) {
      setNombre(existente.datos.nombre);
      setTipo(existente.datos.tipo);
      setContenido(existente.datos.contenido);
      setListo(true);
      setVersion((v) => v + 1);
    }
  }, [existente.datos, listo]);

  if (existente.error) return <ErrorCarga mensaje={existente.error} />;
  if (!listo) return <Cargando />;

  const original = existente.datos;
  const sinCambios = !!original && original.nombre === nombre && original.tipo === tipo && original.contenido === contenido;

  async function guardar() {
    if (id && !(await avisos.confirmar({
      titulo: `¿Guardar los cambios en “${nombre}”?`,
      mensaje: (
        <>
          Los documentos que se confeccionen desde ahora usarán el texto nuevo; los ya emitidos no cambian.
          La versión actual quedará en “Versiones anteriores” por si necesita volver a ella.
        </>
      ),
      confirmar: 'Guardar plantilla',
    }))) return;
    setGuardando(true);
    try {
      const cuerpo = { nombre, tipo, contenido };
      if (id) await api.put(`/plantillas/${id}`, cuerpo);
      else await api.post('/plantillas', cuerpo);
      avisos.ok('Plantilla guardada');
      navegar('/documentos?vista=plantillas');
    } catch (err) {
      avisos.error(err);
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!(await avisos.confirmar({ titulo: `¿Eliminar la plantilla “${nombre}”?`, mensaje: 'Los documentos ya emitidos con ella se conservan.', confirmar: 'Eliminar', peligro: true }))) return;
    try {
      await api.del(`/plantillas/${id}`);
      avisos.ok('Plantilla eliminada');
      navegar('/documentos?vista=plantillas');
    } catch (err) {
      avisos.error(err);
    }
  }

  return (
    <>
      <Encabezado
        volver={{ a: '/documentos?vista=plantillas', texto: 'Plantillas' }}
        titulo={id ? (editable ? 'Editar plantilla' : nombre) : 'Nueva plantilla'}
        descripcion={editable ? undefined : 'Las plantillas las modifica el abogado o el super administrador.'}
      >
        {editable && (
          <>
            {id && <Boton variante="fantasma" icono={Trash2} onClick={eliminar} aria-label="Eliminar plantilla" />}
            {id && <Boton variante="secundario" icono={History} onClick={() => setViendoVersiones(true)}>Versiones anteriores</Boton>}
            <Boton icono={Save} cargando={guardando} disabled={!nombre.trim() || !contenido.trim() || sinCambios} onClick={guardar}>Guardar plantilla</Boton>
          </>
        )}
      </Encabezado>

      {editable && (
        <div className="mb-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_16rem]">
          <Campo etiqueta="Nombre de la plantilla">
            <Entrada maxLength={160} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Segundo aviso de cobranza" />
          </Campo>
          <Campo etiqueta="Tipo">
            <Selector value={tipo} onChange={(e) => setTipo(e.target.value as TipoDocumento)}>
              {(Object.keys(TIPOS_DOCUMENTO) as TipoDocumento[]).map((t) => <option key={t} value={t}>{TIPOS_DOCUMENTO[t]}</option>)}
            </Selector>
          </Campo>
        </div>
      )}

      {editable && (
        <p className="mb-3 text-sm text-stone-600">
          Los textos entre llaves dobles, como <code className="rounded bg-stone-200 px-1 text-xs">{'{{cliente.nombre}}'}</code>, se reemplazan por los datos de cada
          venta al confeccionar el documento. Use “Insertar dato” para agregarlos.
        </p>
      )}

      <EditorTexto key={version} valorInicial={contenido} alCambiar={setContenido} variables={variables.datos ?? undefined} soloLectura={!editable} />

      {viendoVersiones && id && (
        <Versiones
          id={id}
          alCerrar={() => setViendoVersiones(false)}
          alRestaurar={async () => {
            setViendoVersiones(false);
            try {
              const p = await api.get<Plantilla>(`/plantillas/${id}`);
              setNombre(p.nombre);
              setTipo(p.tipo);
              setContenido(p.contenido);
              setVersion((v) => v + 1);
              existente.recargar();
            } catch (err) {
              avisos.error(err);
            }
          }}
        />
      )}
    </>
  );
}
