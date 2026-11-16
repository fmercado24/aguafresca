import { useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { UserPlus, X } from 'lucide-react';
import { api } from '../api';
import { useAvisos } from '../contexto';
import { formatearRut, rutValido } from '../formato';
import type { Cliente, ClienteResumen } from '../tipos';
import { AreaTexto, Boton, Buscador, Campo, Entrada, EntradaMonto, Modal, Selector } from '../ui';

type Datos = Omit<Cliente, 'id' | 'creado_en'>;

const VACIO: Datos = {
  rut: '', nombre: '', fecha_nacimiento: null, nacionalidad: 'chilena', estado_civil: '', profesion: '', direccion: '', comuna: '',
  ciudad: '', region: '', telefono: '', email: '', empleador: '', cargo: '', antiguedad_laboral: '', renta_mensual: null,
  antecedentes_comerciales: '', referencias: '', aval_nombre: '', aval_rut: '', aval_telefono: '', aval_direccion: '', observaciones: '',
};

const ESTADOS_CIVILES = ['soltero(a)', 'casado(a)', 'conviviente civil', 'divorciado(a)', 'viudo(a)', 'separado(a)'];

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="mb-5 last:mb-0">
      <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">{titulo}</legend>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </fieldset>
  );
}

/** Alta o edición de un cliente con todos sus antecedentes. */
export function FormularioCliente({ cliente, inicial, alCerrar, alGuardar }: {
  cliente?: Cliente;
  inicial?: Partial<Datos>;
  alCerrar: () => void;
  alGuardar: (id: number) => void;
}) {
  const avisos = useAvisos();
  const idForm = useId();
  const [d, setD] = useState<Datos>(() => {
    if (!cliente) return { ...VACIO, ...inicial };
    const { id: _id, creado_en: _creado, ...resto } = cliente;
    return { ...resto, rut: formatearRut(resto.rut), aval_rut: formatearRut(resto.aval_rut) };
  });
  const [guardando, setGuardando] = useState(false);
  const texto = (k: keyof Datos, props: { type?: string; maxLength?: number; placeholder?: string; required?: boolean } = {}) => (
    <Entrada value={(d[k] as string | null) ?? ''} onChange={(e) => setD((x) => ({ ...x, [k]: e.target.value }))} {...props} />
  );
  const rutMalo = (v: string) => v.trim() !== '' && !rutValido(v);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (rutMalo(d.rut) || rutMalo(d.aval_rut)) return avisos.error('Revise el RUT: el dígito verificador no coincide');
    setGuardando(true);
    try {
      const cuerpo = { ...d, fecha_nacimiento: d.fecha_nacimiento || null };
      if (cliente) {
        await api.put(`/clientes/${cliente.id}`, cuerpo);
        avisos.ok('Ficha actualizada');
        alGuardar(cliente.id);
      } else {
        const { id } = await api.post('/clientes', cuerpo);
        avisos.ok('Cliente creado');
        alGuardar(id);
      }
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
      ancho="lg"
      titulo={cliente ? 'Editar ficha del cliente' : 'Nuevo cliente'}
      pie={
        <>
          <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
          <Boton type="submit" form={idForm} cargando={guardando}>Guardar</Boton>
        </>
      }
    >
      <form id={idForm} onSubmit={guardar}>
        <Seccion titulo="Identificación">
          <Campo etiqueta="Nombre completo" className="col-span-2">{texto('nombre', { required: true, maxLength: 160 })}</Campo>
          <Campo etiqueta="RUT" ayuda={rutMalo(d.rut) ? <span className="text-red-700">RUT inválido</span> : undefined}>
            <Entrada value={d.rut} onChange={(e) => setD((x) => ({ ...x, rut: e.target.value }))} onBlur={() => rutValido(d.rut) && setD((x) => ({ ...x, rut: formatearRut(x.rut) }))} placeholder="12.345.678-9" maxLength={15} />
          </Campo>
          <Campo etiqueta="Fecha de nacimiento">{texto('fecha_nacimiento', { type: 'date' })}</Campo>
          <Campo etiqueta="Nacionalidad">{texto('nacionalidad', { maxLength: 60 })}</Campo>
          <Campo etiqueta="Estado civil">
            <Selector value={d.estado_civil} onChange={(e) => setD((x) => ({ ...x, estado_civil: e.target.value }))}>
              <option value="">—</option>
              {[...new Set([...ESTADOS_CIVILES, d.estado_civil].filter(Boolean))].map((o) => <option key={o}>{o}</option>)}
            </Selector>
          </Campo>
          <Campo etiqueta="Profesión u oficio" className="col-span-2">{texto('profesion', { maxLength: 120 })}</Campo>
        </Seccion>

        <Seccion titulo="Contacto y domicilio">
          <Campo etiqueta="Teléfono">{texto('telefono', { type: 'tel', maxLength: 40, placeholder: '+56 9 …' })}</Campo>
          <Campo etiqueta="Correo electrónico">{texto('email', { type: 'email', maxLength: 160 })}</Campo>
          <Campo etiqueta="Dirección" className="col-span-2">{texto('direccion', { maxLength: 200 })}</Campo>
          <Campo etiqueta="Comuna">{texto('comuna', { maxLength: 80 })}</Campo>
          <Campo etiqueta="Ciudad">{texto('ciudad', { maxLength: 80 })}</Campo>
          <Campo etiqueta="Región" className="col-span-2">{texto('region', { maxLength: 80 })}</Campo>
        </Seccion>

        <Seccion titulo="Antecedentes laborales">
          <Campo etiqueta="Empleador o actividad">{texto('empleador', { maxLength: 160 })}</Campo>
          <Campo etiqueta="Cargo">{texto('cargo', { maxLength: 120 })}</Campo>
          <Campo etiqueta="Antigüedad laboral">{texto('antiguedad_laboral', { maxLength: 60, placeholder: 'Ej.: 4 años' })}</Campo>
          <Campo etiqueta="Renta mensual líquida">
            <EntradaMonto valor={d.renta_mensual} alCambiar={(v) => setD((x) => ({ ...x, renta_mensual: v }))} />
          </Campo>
        </Seccion>

        <Seccion titulo="Antecedentes comerciales y referencias">
          <Campo etiqueta="Antecedentes comerciales" ayuda="Informe comercial, protestos, morosidades, otros créditos." className="col-span-2">
            <AreaTexto value={d.antecedentes_comerciales} onChange={(e) => setD((x) => ({ ...x, antecedentes_comerciales: e.target.value }))} />
          </Campo>
          <Campo etiqueta="Referencias personales o comerciales" className="col-span-2">
            <AreaTexto value={d.referencias} onChange={(e) => setD((x) => ({ ...x, referencias: e.target.value }))} placeholder="Nombre, relación y teléfono" />
          </Campo>
        </Seccion>

        <Seccion titulo="Aval o codeudor (opcional)">
          <Campo etiqueta="Nombre">{texto('aval_nombre', { maxLength: 160 })}</Campo>
          <Campo etiqueta="RUT" ayuda={rutMalo(d.aval_rut) ? <span className="text-red-700">RUT inválido</span> : undefined}>{texto('aval_rut', { maxLength: 15 })}</Campo>
          <Campo etiqueta="Teléfono">{texto('aval_telefono', { type: 'tel', maxLength: 40 })}</Campo>
          <Campo etiqueta="Dirección">{texto('aval_direccion', { maxLength: 200 })}</Campo>
        </Seccion>

        <Seccion titulo="Observaciones">
          <Campo etiqueta="Notas internas" className="col-span-2">
            <AreaTexto value={d.observaciones} onChange={(e) => setD((x) => ({ ...x, observaciones: e.target.value }))} />
          </Campo>
        </Seccion>
      </form>
    </Modal>
  );
}

/** Buscador para elegir un cliente existente o crear uno nuevo sin salir del formulario. */
export function SelectorCliente({ clientes, valor, alCambiar, alCrear, sugerido }: {
  clientes: ClienteResumen[];
  valor: number | null;
  alCambiar: (id: number | null) => void;
  /** Se llama cuando se creó un cliente nuevo (para recargar la lista). */
  alCrear: (id: number) => void;
  sugerido?: Partial<Datos>;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [creando, setCreando] = useState(false);
  const elegido = clientes.find((c) => c.id === valor);

  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return [];
    const qRut = q.replace(/[^0-9k]/g, '');
    return clientes
      .filter((c) => c.nombre.toLowerCase().includes(q) || (qRut.length >= 3 && c.rut.replace('-', '').toLowerCase().includes(qRut)))
      .slice(0, 6);
  }, [clientes, busqueda]);

  return (
    <div>
      {elegido ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-stone-300 bg-stone-50 px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-stone-900">{elegido.nombre}</div>
            <div className="text-xs text-stone-500">{elegido.rut ? formatearRut(elegido.rut) : 'Sin RUT registrado'}</div>
          </div>
          <button type="button" onClick={() => alCambiar(null)} aria-label="Cambiar cliente" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-200">
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <Buscador valor={busqueda} alCambiar={setBusqueda} placeholder="Buscar cliente por nombre o RUT" className="flex-1" />
            <Boton variante="secundario" icono={UserPlus} onClick={() => setCreando(true)}>Nuevo</Boton>
          </div>
          {busqueda.trim() !== '' && (
            <ul className="mt-1 overflow-hidden rounded-lg border border-stone-200 bg-white">
              {resultados.map((c) => (
                <li key={c.id} className="border-t border-stone-100 first:border-t-0">
                  <button type="button" onClick={() => { alCambiar(c.id); setBusqueda(''); }} className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-stone-50">
                    <span className="font-medium text-stone-900">{c.nombre}</span>
                    <span className="text-xs text-stone-500">{formatearRut(c.rut)}</span>
                  </button>
                </li>
              ))}
              {resultados.length === 0 && <li className="px-3 py-2 text-sm text-stone-500">Sin resultados. Puede crearlo con “Nuevo”.</li>}
            </ul>
          )}
        </>
      )}
      {creando && (
        <FormularioCliente
          inicial={{ ...sugerido, ...(busqueda.trim() && !/\d{3}/.test(busqueda) ? { nombre: busqueda.trim() } : {}) }}
          alCerrar={() => setCreando(false)}
          alGuardar={(id) => { setCreando(false); setBusqueda(''); alCrear(id); }}
        />
      )}
    </div>
  );
}
