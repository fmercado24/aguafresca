import { useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { UserPlus, X } from 'lucide-react';
import { api } from '../api';
import { useAvisos } from '../contexto';
import { correoValido, errorTelefono, formatearRut, rutValido } from '../formato';
import type { Cliente, ClienteResumen } from '../tipos';
import { AreaTexto, Boton, Buscador, Campo, Entrada, EntradaMonto, EntradaRut, EntradaTelefono, Modal, Selector } from '../ui';
import { useConfig } from '../contexto';

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

/** Campos que se pueden completar en modo "datos esenciales" (los que piden las promesas y cartas). */
const ESENCIALES = ['nombre', 'rut', 'fecha_nacimiento', 'nacionalidad', 'estado_civil', 'profesion', 'direccion', 'comuna', 'ciudad', 'region', 'telefono', 'email'] as const;

/**
 * Alta o edición de un cliente con todos sus antecedentes. Con `esencial`, solo identificación y domicilio:
 * así el usuario (ldiaz) completa lo que necesita un documento sin tocar los antecedentes financieros.
 */
export function FormularioCliente({ cliente, inicial, alCerrar, alGuardar, esencial = false, faltan }: {
  cliente?: Cliente;
  inicial?: Partial<Datos>;
  alCerrar: () => void;
  alGuardar: (id: number) => void;
  esencial?: boolean;
  /** Datos que pide el documento y faltan (se destacan arriba). */
  faltan?: string[];
}) {
  const avisos = useAvisos();
  const { hoy } = useConfig();
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
    const errTel = errorTelefono(d.telefono, true) ?? errorTelefono(d.aval_telefono);
    if (errTel) return avisos.error(errTel);
    if (!correoValido(d.email)) return avisos.error('Revise el correo electrónico (ej.: nombre@dominio.cl)');
    setGuardando(true);
    try {
      const cuerpo = { ...d, fecha_nacimiento: d.fecha_nacimiento || null };
      if (cliente && esencial) {
        await api.put(`/clientes/${cliente.id}/esenciales`, Object.fromEntries(ESENCIALES.map((k) => [k, cuerpo[k]])));
        avisos.ok('Datos del cliente actualizados');
        alGuardar(cliente.id);
      } else if (cliente) {
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
      titulo={esencial ? `Datos esenciales de ${cliente?.nombre ?? 'el cliente'}` : cliente ? 'Editar ficha del cliente' : 'Nuevo cliente'}
      pie={
        <>
          <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
          <Boton type="submit" form={idForm} cargando={guardando}>Guardar</Boton>
        </>
      }
    >
      <form id={idForm} onSubmit={guardar}>
        {esencial && (
          <p className="mb-4 rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-700">
            Identificación y domicilio, para los documentos legales.{faltan?.length ? <> Faltan para este documento: <strong>{faltan.join(', ')}</strong>.</> : ''}
            {' '}Los antecedentes laborales y financieros los completa el administrador.
          </p>
        )}
        <Seccion titulo="Identificación">
          <Campo etiqueta="Nombre completo" className="col-span-2">{texto('nombre', { required: true, maxLength: 160 })}</Campo>
          <Campo etiqueta="RUT">
            <EntradaRut valor={d.rut} alCambiar={(v) => setD((x) => ({ ...x, rut: v }))} />
          </Campo>
          <Campo etiqueta="Fecha de nacimiento">
            <Entrada type="date" min="1900-01-01" max={hoy} value={d.fecha_nacimiento ?? ''} onChange={(e) => setD((x) => ({ ...x, fecha_nacimiento: e.target.value || null }))} />
          </Campo>
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
          <Campo etiqueta="Celular">
            <EntradaTelefono movil valor={d.telefono} alCambiar={(v) => setD((x) => ({ ...x, telefono: v }))} />
          </Campo>
          <Campo etiqueta="Correo electrónico" ayuda={!correoValido(d.email) ? <span className="text-red-700">Correo inválido (ej.: nombre@dominio.cl)</span> : undefined}>
            {texto('email', { type: 'email', maxLength: 160, placeholder: 'nombre@dominio.cl' })}
          </Campo>
          <Campo etiqueta="Dirección" className="col-span-2">{texto('direccion', { maxLength: 200 })}</Campo>
          <Campo etiqueta="Comuna">{texto('comuna', { maxLength: 80 })}</Campo>
          <Campo etiqueta="Ciudad">{texto('ciudad', { maxLength: 80 })}</Campo>
          <Campo etiqueta="Región" className="col-span-2">{texto('region', { maxLength: 80 })}</Campo>
        </Seccion>

        {!esencial && (<>
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
          <Campo etiqueta="RUT"><EntradaRut valor={d.aval_rut} alCambiar={(v) => setD((x) => ({ ...x, aval_rut: v }))} /></Campo>
          <Campo etiqueta="Teléfono"><EntradaTelefono valor={d.aval_telefono} alCambiar={(v) => setD((x) => ({ ...x, aval_telefono: v }))} /></Campo>
          <Campo etiqueta="Dirección">{texto('aval_direccion', { maxLength: 200 })}</Campo>
        </Seccion>

        <Seccion titulo="Observaciones">
          <Campo etiqueta="Notas internas" className="col-span-2">
            <AreaTexto value={d.observaciones} onChange={(e) => setD((x) => ({ ...x, observaciones: e.target.value }))} />
          </Campo>
        </Seccion>
        </>)}
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
