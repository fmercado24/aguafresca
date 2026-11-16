import { useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { CircleCheck, Download, KeyRound, Pencil, ShieldCheck } from 'lucide-react';
import { api, useDatos } from '../api';
import { useAvisos, useConfig, useSesion } from '../contexto';
import { ACCIONES_REGISTRO, ListaCambios, listarCambios } from '../componentes/Cambios';
import { descargarCsv, fechaHoraRegistro, formatearRut } from '../formato';
import type { Config, Cuenta, EntradaRegistro, Permiso } from '../tipos';
import { AreaTexto, Boton, Campo, Carga, Encabezado, Entrada, Insignia, Modal, Pestanas, Selector, Tabla, Tarjeta, Vacio, td, th } from '../ui';

type Pestana = 'empresa' | 'credito' | 'cuentas' | 'registro' | 'cuenta';

const PESTANAS: { id: Pestana; etiqueta: string; permiso?: Permiso }[] = [
  { id: 'empresa', etiqueta: 'Empresa y proyecto', permiso: 'empresa' },
  { id: 'credito', etiqueta: 'Crédito y cobranza', permiso: 'contabilidad' },
  { id: 'cuentas', etiqueta: 'Cuentas', permiso: 'administracion' },
  { id: 'registro', etiqueta: 'Registro de cambios', permiso: 'administracion' },
  { id: 'cuenta', etiqueta: 'Mi cuenta' },
];

export function Configuracion() {
  const { puede } = useSesion();
  const visibles = PESTANAS.filter((p) => !p.permiso || puede(p.permiso));
  const [pestana, setPestana] = useState<Pestana>(visibles[0].id);

  return (
    <>
      <Encabezado titulo="Configuración" />
      {visibles.length > 1 && <Pestanas activa={pestana} alCambiar={setPestana} opciones={visibles.map(({ id, etiqueta }) => ({ id, etiqueta }))} />}
      {pestana === 'empresa' && <DatosEmpresa />}
      {pestana === 'credito' && <ParametrosCredito />}
      {pestana === 'cuentas' && <Cuentas />}
      {pestana === 'registro' && <Registro />}
      {pestana === 'cuenta' && <MiCuenta />}
    </>
  );
}

function AvisoSensible({ children }: { children: ReactNode }) {
  return (
    <p className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <ShieldCheck className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

// ---------- Datos sensibles de la empresa (super administrador) ----------

const ETIQUETAS_EMPRESA: Partial<Record<keyof Config['empresa'], string>> = {
  razon_social: 'Razón social', rut: 'RUT de la empresa', giro: 'Giro', direccion: 'Dirección', ciudad: 'Ciudad', telefono: 'Teléfono',
  email: 'Correo electrónico', representante: 'Representante legal', rut_representante: 'RUT del representante', datos_bancarios: 'Datos para transferencia',
};
const ETIQUETAS_PROYECTO: Partial<Record<keyof Config['proyecto'], string>> = { nombre: 'Nombre del proyecto', ubicacion: 'Ubicación', inscripcion: 'Inscripción de dominio' };

function DatosEmpresa() {
  const config = useConfig();
  const { recargarConfig } = useSesion();
  const avisos = useAvisos();
  const inicialEmpresa = { ...config.empresa, rut: formatearRut(config.empresa.rut), rut_representante: formatearRut(config.empresa.rut_representante) };
  const [empresa, setEmpresa] = useState(inicialEmpresa);
  const [proyecto, setProyecto] = useState(config.proyecto);
  const [guardando, setGuardando] = useState(false);

  const cambios = [...listarCambios(inicialEmpresa, empresa, ETIQUETAS_EMPRESA), ...listarCambios(config.proyecto, proyecto, ETIQUETAS_PROYECTO)];

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!cambios.length) return avisos.ok('No hay cambios que guardar');
    if (!(await avisos.confirmar({
      titulo: 'Confirmar cambios en los datos de la empresa',
      mensaje: <ListaCambios cambios={cambios} nota="Estos datos se insertan en cotizaciones, cartas y promesas que se emitan desde ahora. Los documentos ya emitidos no cambian." />,
      confirmar: 'Sí, guardar cambios',
    }))) return;
    setGuardando(true);
    try {
      await api.put('/config/empresa', { empresa, proyecto });
      await recargarConfig();
      avisos.ok('Datos de la empresa guardados');
    } catch (err) {
      avisos.error(err);
    } finally {
      setGuardando(false);
    }
  }

  const campo = (k: keyof Config['empresa'], etiqueta: string, props: { className?: string; placeholder?: string; type?: string; required?: boolean } = {}) => {
    const { className, ...resto } = props;
    return (
      <Campo etiqueta={etiqueta} className={className}>
        <Entrada value={empresa[k]} onChange={(e) => setEmpresa({ ...empresa, [k]: e.target.value })} {...resto} />
      </Campo>
    );
  };

  return (
    <form onSubmit={guardar} className="max-w-3xl space-y-4">
      <AvisoSensible>
        Datos sensibles: aparecen en el membrete y en la comparecencia de las promesas de compraventa. Solo el super administrador puede cambiarlos,
        y cada cambio queda en el registro.
      </AvisoSensible>
      <Tarjeta titulo="Empresa">
        <div className="grid gap-3 sm:grid-cols-2">
          {campo('razon_social', 'Razón social', { required: true })}
          {campo('rut', 'RUT de la empresa', { placeholder: '76.123.456-7' })}
          {campo('giro', 'Giro', { className: 'sm:col-span-2' })}
          {campo('direccion', 'Dirección')}
          {campo('ciudad', 'Ciudad')}
          {campo('telefono', 'Teléfono', { type: 'tel' })}
          {campo('email', 'Correo electrónico', { type: 'email' })}
          {campo('representante', 'Representante legal')}
          {campo('rut_representante', 'RUT del representante legal')}
          <Campo etiqueta="Datos para transferencia" ayuda="Banco, tipo y número de cuenta, RUT y correo para comprobantes." className="sm:col-span-2">
            <AreaTexto value={empresa.datos_bancarios} onChange={(e) => setEmpresa({ ...empresa, datos_bancarios: e.target.value })} />
          </Campo>
        </div>
      </Tarjeta>
      <Tarjeta titulo="Proyecto">
        <div className="grid gap-3">
          <Campo etiqueta="Nombre del proyecto">
            <Entrada required value={proyecto.nombre} onChange={(e) => setProyecto({ ...proyecto, nombre: e.target.value })} />
          </Campo>
          <Campo etiqueta="Ubicación" ayuda="Camino, comuna y región.">
            <Entrada value={proyecto.ubicacion} onChange={(e) => setProyecto({ ...proyecto, ubicacion: e.target.value })} />
          </Campo>
          <Campo etiqueta="Inscripción de dominio" ayuda="Fojas, número, año y Conservador de Bienes Raíces.">
            <AreaTexto rows={2} value={proyecto.inscripcion} onChange={(e) => setProyecto({ ...proyecto, inscripcion: e.target.value })} />
          </Campo>
        </div>
      </Tarjeta>
      <BarraGuardar cambios={cambios.length} guardando={guardando} alDescartar={() => { setEmpresa(inicialEmpresa); setProyecto(config.proyecto); }} />
    </form>
  );
}

function BarraGuardar({ cambios, guardando, alDescartar }: { cambios: number; guardando: boolean; alDescartar: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="mr-auto text-sm text-stone-500">{cambios === 0 ? 'Sin cambios pendientes' : cambios === 1 ? '1 campo modificado' : `${cambios} campos modificados`}</span>
      {cambios > 0 && <Boton variante="secundario" onClick={alDescartar}>Descartar</Boton>}
      <Boton type="submit" cargando={guardando} disabled={cambios === 0}>Revisar y guardar</Boton>
    </div>
  );
}

// ---------- Parámetros contables (contador y super administrador) ----------

const ETIQUETAS_CREDITO: Record<keyof Config['credito'], string> = {
  tasa_mensual: 'Interés mensual del crédito (%)', pie_porcentaje: 'Pie habitual (% del precio)', n_cuotas: 'Número de cuotas habitual',
  dias_validez_cotizacion: 'Vigencia de las cotizaciones (días)', tasa_mora_mensual: 'Interés por mora mensual (%)', dias_plazo_carta: 'Plazo en las cartas de cobranza (días)',
};

function ParametrosCredito() {
  const config = useConfig();
  const { recargarConfig } = useSesion();
  const avisos = useAvisos();
  const inicial = useMemo(
    () => Object.fromEntries(Object.entries(config.credito).map(([k, v]) => [k, String(v)])) as Record<keyof Config['credito'], string>,
    [config.credito],
  );
  const [credito, setCredito] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const cambios = listarCambios(inicial, credito, ETIQUETAS_CREDITO).filter((c) => Number(c.antes) !== Number(c.despues));

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!cambios.length) return;
    if (!(await avisos.confirmar({
      titulo: 'Confirmar cambios en los parámetros de crédito',
      mensaje: <ListaCambios cambios={cambios} nota="Se aplican a las cotizaciones, ventas y cálculos de mora desde ahora. Las ventas ya registradas conservan su tabla." />,
      confirmar: 'Sí, guardar cambios',
    }))) return;
    setGuardando(true);
    try {
      await api.put('/config/credito', { credito });
      await recargarConfig();
      avisos.ok('Parámetros guardados');
    } catch (err) {
      avisos.error(err);
    } finally {
      setGuardando(false);
    }
  }

  const campo = (k: keyof Config['credito'], ayuda: string, props: { step?: string; min?: number; max?: number } = {}) => (
    <Campo etiqueta={ETIQUETAS_CREDITO[k]} ayuda={ayuda}>
      <Entrada type="number" inputMode="decimal" min={0} step="any" required value={credito[k]} onChange={(e) => setCredito({ ...credito, [k]: e.target.value })} {...props} />
    </Campo>
  );

  return (
    <form onSubmit={guardar} className="max-w-3xl space-y-4">
      <Tarjeta titulo="Valores propuestos al cotizar y vender">
        <p className="mb-3 text-sm text-stone-600">Son los valores con que parten los formularios; en cada cotización o venta se pueden cambiar.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {campo('tasa_mensual', 'Interés sobre saldo insoluto, cuota fija.', { max: 15 })}
          {campo('pie_porcentaje', 'Se propone redondeado a $100.000.', { max: 100 })}
          {campo('n_cuotas', 'Cuotas mensuales.', { step: '1', min: 1, max: 360 })}
          {campo('dias_validez_cotizacion', 'Plazo de validez que se imprime.', { step: '1', min: 1, max: 365 })}
        </div>
      </Tarjeta>
      <Tarjeta titulo="Cobranza">
        <div className="grid gap-3 sm:grid-cols-2">
          {campo('tasa_mora_mensual', 'Estima la mora de las cuotas atrasadas, proporcional a los días. Con 0 no se calcula.', { max: 15 })}
          {campo('dias_plazo_carta', 'Días que se otorgan desde la fecha de la carta.', { step: '1', min: 1, max: 90 })}
        </div>
        <p className="mt-3 text-xs text-stone-500">Verifique que las tasas pactadas no superen el interés máximo convencional vigente que informa la CMF.</p>
      </Tarjeta>
      <BarraGuardar cambios={cambios.length} guardando={guardando} alDescartar={() => setCredito(inicial)} />
    </form>
  );
}

// ---------- Las tres cuentas (super administrador) ----------

const QUE_PUEDE: Record<string, string> = {
  superadmin: 'Todo: datos sensibles de la empresa, precios y mapa de parcelas, cuentas, plantillas legales, tabla de amortización y datos contables.',
  abogado: 'Funciones básicas y modificar las plantillas de documentos legales (promesas y cartas).',
  contador: 'Funciones básicas, modificar la tabla de amortización y los datos contables (tasas, pagos, anulaciones).',
};

function Cuentas() {
  const { usuario: yo } = useSesion();
  const avisos = useAvisos();
  const idForm = useId();
  const consulta = useDatos<Cuenta[]>('/usuarios');
  const [editando, setEditando] = useState<{ cuenta: Cuenta; nombre: string; password: string; repetida: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!editando) return;
    const { cuenta, nombre, password, repetida } = editando;
    if (password && password !== repetida) return avisos.error('Las contraseñas no coinciden');
    const cambios = [
      ...listarCambios({ nombre: cuenta.nombre }, { nombre }, { nombre: 'Nombre' }),
      ...(password ? [{ etiqueta: 'Contraseña', antes: '••••••••', despues: 'nueva contraseña' }] : []),
    ];
    if (!cambios.length) return setEditando(null);
    if (!(await avisos.confirmar({
      titulo: `Confirmar cambios en la cuenta “${cuenta.usuario}”`,
      mensaje: (
        <ListaCambios
          cambios={cambios}
          nota={password && cuenta.id !== yo?.id ? 'Se cerrarán las sesiones abiertas de esta cuenta: tendrá que volver a ingresar con la contraseña nueva.' : undefined}
        />
      ),
      confirmar: 'Sí, guardar',
    }))) return;
    setGuardando(true);
    try {
      await api.put(`/usuarios/${cuenta.id}`, { nombre, password: password || undefined });
      avisos.ok('Cuenta actualizada');
      setEditando(null);
      consulta.recargar();
    } catch (err) {
      avisos.error(err);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <Tarjeta titulo="Cuentas del sistema" relleno={false}>
        <Carga consulta={consulta}>
          {(cuentas) => (
            <ul className="divide-y divide-stone-100">
              {cuentas.map((c) => (
                <li key={c.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-stone-900">{c.nombre}</span>
                      <Insignia tono={c.rol === 'superadmin' ? 'azul' : 'gris'}>{c.perfil}</Insignia>
                      {c.id === yo?.id && <span className="text-xs text-stone-500">(usted)</span>}
                    </div>
                    <div className="mt-0.5 text-sm text-stone-600">Usuario: <code className="rounded bg-stone-100 px-1">{c.usuario}</code></div>
                    <div className="mt-1 text-xs text-stone-500">{QUE_PUEDE[c.rol ?? '']}</div>
                  </div>
                  <Boton chico variante="secundario" icono={Pencil} onClick={() => setEditando({ cuenta: c, nombre: c.nombre, password: '', repetida: '' })}>Editar</Boton>
                </li>
              ))}
            </ul>
          )}
        </Carga>
      </Tarjeta>
      <p className="mt-3 text-sm text-stone-600">
        El sistema tiene siempre estas tres cuentas: no se crean ni se eliminan. Todas tienen las funciones básicas (clientes, ventas, pagos,
        cotizaciones, visitas, confeccionar documentos y reservar parcelas).
      </p>

      {editando && (
        <Modal
          abierto
          alCerrar={() => setEditando(null)}
          titulo={`Cuenta “${editando.cuenta.usuario}”`}
          ancho="sm"
          pie={
            <>
              <Boton variante="secundario" onClick={() => setEditando(null)}>Cancelar</Boton>
              <Boton type="submit" form={idForm} cargando={guardando}>Revisar y guardar</Boton>
            </>
          }
        >
          <form id={idForm} onSubmit={guardar} className="space-y-3">
            <Campo etiqueta="Nombre que se muestra">
              <Entrada required maxLength={120} value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} />
            </Campo>
            <Campo etiqueta="Nueva contraseña" ayuda="Déjela en blanco para no cambiarla. Mínimo 8 caracteres.">
              <Entrada type="password" autoComplete="new-password" minLength={8} value={editando.password} onChange={(e) => setEditando({ ...editando, password: e.target.value })} />
            </Campo>
            {editando.password && (
              <Campo etiqueta="Repita la nueva contraseña">
                <Entrada type="password" autoComplete="new-password" minLength={8} required value={editando.repetida} onChange={(e) => setEditando({ ...editando, repetida: e.target.value })} />
              </Campo>
            )}
          </form>
        </Modal>
      )}
    </div>
  );
}

// ---------- Registro de cambios (super administrador) ----------

function enlaceDe(e: EntradaRegistro): string | null {
  if (!e.entidad_id) return null;
  if (e.entidad === 'venta' && e.accion !== 'venta_eliminada') return `/ventas/${e.entidad_id}`;
  if (e.entidad === 'plantilla' && e.accion !== 'plantilla_eliminada') return `/plantillas/${e.entidad_id}`;
  if (e.entidad === 'parcela' && e.accion !== 'parcela_eliminada') return '/parcelas?vista=lista';
  return null;
}

function Registro() {
  const consulta = useDatos<EntradaRegistro[]>('/bitacora?limite=500');
  const [filtro, setFiltro] = useState('');

  return (
    <Carga consulta={consulta}>
      {(entradas) => {
        const presentes = [...new Set(entradas.map((e) => e.accion))];
        const filtradas = entradas.filter((e) => !filtro || e.accion === filtro);
        return (
          <Tarjeta
            relleno={false}
            titulo="Últimos cambios sensibles"
            acciones={
              <>
                <Selector value={filtro} onChange={(e) => setFiltro(e.target.value)} className="!w-auto !py-1 !text-xs" aria-label="Tipo de cambio">
                  <option value="">Todos los tipos</option>
                  {presentes.map((a) => <option key={a} value={a}>{ACCIONES_REGISTRO[a] ?? a}</option>)}
                </Selector>
                <Boton
                  chico variante="secundario" icono={Download}
                  onClick={() => descargarCsv('registro-de-cambios.csv', ['Fecha', 'Cuenta', 'Cambio', 'Detalle', 'Motivo'],
                    filtradas.map((e) => [fechaHoraRegistro(e.fecha), e.cuenta ?? 'consola', ACCIONES_REGISTRO[e.accion] ?? e.accion, e.detalle, e.motivo]))}
                >
                  Excel
                </Boton>
              </>
            }
          >
            {filtradas.length === 0 ? (
              <Vacio titulo="Sin cambios registrados">Aquí aparecerá cada cambio en datos sensibles, plantillas, tablas de amortización y pagos.</Vacio>
            ) : (
              <Tabla>
                <thead>
                  <tr>
                    <th className={th}>Fecha</th>
                    <th className={th}>Quién</th>
                    <th className={th}>Cambio</th>
                    <th className={`${th} hidden md:table-cell`}>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((e) => {
                    const enlace = enlaceDe(e);
                    return (
                      <tr key={e.id} className="align-top">
                        <td className={`${td} whitespace-nowrap tabular-nums`}>{fechaHoraRegistro(e.fecha)}</td>
                        <td className={`${td} whitespace-nowrap`}>{e.usuario ?? <span className="text-stone-500">Consola</span>}</td>
                        <td className={td}>
                          {enlace ? <Link to={enlace} className="font-medium text-marca-700 hover:underline">{ACCIONES_REGISTRO[e.accion] ?? e.accion}</Link> : <span className="font-medium">{ACCIONES_REGISTRO[e.accion] ?? e.accion}</span>}
                          <div className="mt-0.5 text-xs text-stone-600 md:hidden">{e.detalle}</div>
                          {e.motivo && <div className="mt-0.5 text-xs text-stone-500 md:hidden">Motivo: {e.motivo}</div>}
                        </td>
                        <td className={`${td} hidden max-w-xl md:table-cell`}>
                          <div className="break-words text-stone-700">{e.detalle}</div>
                          {e.motivo && <div className="mt-0.5 text-xs text-stone-500">Motivo: {e.motivo}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Tabla>
            )}
          </Tarjeta>
        );
      }}
    </Carga>
  );
}

// ---------- Mi cuenta (todas) ----------

function MiCuenta() {
  const { usuario, salir } = useSesion();
  const avisos = useAvisos();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function cambiar(e: FormEvent) {
    e.preventDefault();
    if (nueva !== repetida) return avisos.error('Las contraseñas nuevas no coinciden');
    if (!(await avisos.confirmar({ titulo: '¿Cambiar su contraseña?', mensaje: 'Se cerrarán sus sesiones abiertas en otros equipos.', confirmar: 'Cambiar contraseña' }))) return;
    setGuardando(true);
    try {
      await api.post('/auth/password', { actual, nueva });
      avisos.ok('Contraseña actualizada');
      setActual('');
      setNueva('');
      setRepetida('');
    } catch (err) {
      avisos.error(err);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="max-w-md space-y-4">
      <Tarjeta titulo="Mi cuenta">
        <div className="text-sm font-medium text-stone-900">{usuario?.nombre}</div>
        <div className="text-sm text-stone-600">Usuario: <code className="rounded bg-stone-100 px-1">{usuario?.usuario}</code></div>
        <div className="mt-2"><Insignia tono="azul" icono={CircleCheck}>{usuario?.perfil}</Insignia></div>
        <p className="mt-2 text-xs text-stone-500">{QUE_PUEDE[usuario?.rol ?? '']}</p>
        <Boton variante="secundario" className="mt-4" onClick={salir}>Cerrar sesión</Boton>
      </Tarjeta>
      <Tarjeta titulo="Cambiar contraseña">
        <form onSubmit={cambiar} className="space-y-3">
          <Campo etiqueta="Contraseña actual"><Entrada type="password" autoComplete="current-password" required value={actual} onChange={(e) => setActual(e.target.value)} /></Campo>
          <Campo etiqueta="Nueva contraseña" ayuda="Mínimo 8 caracteres."><Entrada type="password" autoComplete="new-password" required minLength={8} value={nueva} onChange={(e) => setNueva(e.target.value)} /></Campo>
          <Campo etiqueta="Repita la nueva contraseña"><Entrada type="password" autoComplete="new-password" required minLength={8} value={repetida} onChange={(e) => setRepetida(e.target.value)} /></Campo>
          <Boton type="submit" icono={KeyRound} cargando={guardando}>Cambiar contraseña</Boton>
        </form>
      </Tarjeta>
    </div>
  );
}
