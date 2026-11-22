import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { BellRing, CircleCheck, Download, ImageUp, KeyRound, Pencil, ShieldCheck, Signature, Trash2, UserRound } from 'lucide-react';
import { api, useDatos } from '../api';
import { useAvisos, useConfig, useSesion } from '../contexto';
import { ACCIONES_REGISTRO, ListaCambios, listarCambios } from '../componentes/Cambios';
import { EnvioDeCartas } from './EnvioCartas';
import { activarPush, desactivarPush, estadoPush, motivoSinPush, type EstadoPush } from '../push';
import { correoValido, descargarCsv, errorTelefono, fechaHoraRegistro, formatearRut, pesos, rutValido } from '../formato';
import type { Config, Cuenta, DatosPersonales, EntradaRegistro, Permiso } from '../tipos';
import {
  AreaTexto, Boton, Campo, Carga, Encabezado, Entrada, EntradaDecimal, EntradaEntero, EntradaMonto, EntradaRut, EntradaTelefono, Insignia, Modal, Pestanas,
  Selector, Tabla, Tarjeta, Vacio, td, th,
} from '../ui';

type Pestana = 'empresa' | 'credito' | 'envios' | 'cuentas' | 'registro' | 'cuenta';

// Una pestaña se muestra si la cuenta tiene alguno de los permisos indicados.
const PESTANAS: { id: Pestana; etiqueta: string; permisos?: Permiso[] }[] = [
  { id: 'empresa', etiqueta: 'Empresa y proyecto', permisos: ['empresa'] },
  { id: 'credito', etiqueta: 'Crédito y cobranza', permisos: ['contabilidad'] },
  { id: 'envios', etiqueta: 'Envío de cartas', permisos: ['empresa', 'contabilidad'] },
  { id: 'cuentas', etiqueta: 'Cuentas', permisos: ['administracion'] },
  { id: 'registro', etiqueta: 'Registro de cambios', permisos: ['administracion', 'registro_duenos'] },
  { id: 'cuenta', etiqueta: 'Mi cuenta' },
];

export function Configuracion() {
  const { puede } = useSesion();
  const visibles = PESTANAS.filter((p) => !p.permisos || p.permisos.some(puede));
  // Los avisos pueden enlazar a una pestaña (por ejemplo, /configuracion?pestana=registro).
  const [params] = useSearchParams();
  const pedida = visibles.find((p) => p.id === params.get('pestana'))?.id;
  const [pestana, setPestana] = useState<Pestana>(pedida ?? visibles[0].id);

  return (
    <>
      <Encabezado titulo="Configuración" />
      {visibles.length > 1 && <Pestanas activa={pestana} alCambiar={setPestana} opciones={visibles.map(({ id, etiqueta }) => ({ id, etiqueta }))} />}
      {pestana === 'empresa' && <DatosEmpresa />}
      {pestana === 'credito' && <ParametrosCredito />}
      {pestana === 'envios' && <EnvioDeCartas />}
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
  email: 'Correo electrónico', representante: 'Representante legal', rut_representante: 'RUT del representante',
  representante_cuenta: 'Datos del representante', datos_bancarios: 'Datos para transferencia',
};
const origenRepresentante = (cuenta: string) => (cuenta ? `datos personales de ${cuenta}` : 'escritos a mano');
const ETIQUETAS_PROYECTO: Partial<Record<keyof Config['proyecto'], string>> = { nombre: 'Nombre del proyecto', ubicacion: 'Ubicación', inscripcion: 'Inscripción de dominio' };

function DatosEmpresa() {
  const config = useConfig();
  const { recargarConfig } = useSesion();
  const avisos = useAvisos();
  const inicialEmpresa = { ...config.empresa, rut: formatearRut(config.empresa.rut), rut_representante: formatearRut(config.empresa.rut_representante) };
  const [empresa, setEmpresa] = useState(inicialEmpresa);
  const [proyecto, setProyecto] = useState(config.proyecto);
  const [guardando, setGuardando] = useState(false);

  // Dueños que pueden ser representante legal, con el nombre y RUT de sus datos personales.
  const duenos = (useDatos<Cuenta[]>('/usuarios').datos ?? []).filter((c) => c.datos);
  const vinculado = duenos.find((c) => c.usuario === empresa.representante_cuenta);
  const comparable = (e: typeof empresa) => ({ ...e, representante_cuenta: origenRepresentante(e.representante_cuenta) });
  const cambios = [...listarCambios(comparable(inicialEmpresa), comparable(empresa), ETIQUETAS_EMPRESA), ...listarCambios(config.proyecto, proyecto, ETIQUETAS_PROYECTO)];

  function elegirRepresentante(cuenta: Config['empresa']['representante_cuenta']) {
    const d = duenos.find((c) => c.usuario === cuenta)?.datos;
    setEmpresa({ ...empresa, representante_cuenta: cuenta, ...(d ? { representante: d.nombre_completo, rut_representante: formatearRut(d.rut) } : {}) });
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!cambios.length) return avisos.ok('No hay cambios que guardar');
    for (const [r, etq] of [[empresa.rut, 'RUT de la empresa'], [empresa.rut_representante, 'RUT del representante']] as const) {
      if (r.trim() && !rutValido(r)) return avisos.error(`${etq}: revise el dígito verificador`);
    }
    const errTel = errorTelefono(empresa.telefono);
    if (errTel) return avisos.error(errTel);
    if (!correoValido(empresa.email)) return avisos.error('Revise el correo electrónico de la empresa');
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
          <Campo etiqueta="RUT de la empresa"><EntradaRut valor={empresa.rut} alCambiar={(v) => setEmpresa({ ...empresa, rut: v })} placeholder="76.123.456-7" /></Campo>
          {campo('giro', 'Giro', { className: 'sm:col-span-2' })}
          {campo('direccion', 'Dirección')}
          {campo('ciudad', 'Ciudad')}
          <Campo etiqueta="Teléfono"><EntradaTelefono valor={empresa.telefono} alCambiar={(v) => setEmpresa({ ...empresa, telefono: v })} /></Campo>
          {campo('email', 'Correo electrónico', { type: 'email', placeholder: 'contacto@empresa.cl' })}
          <Campo
            etiqueta="¿Quién es el representante legal?" className="sm:col-span-2"
            ayuda={vinculado ? 'Sus datos (nombre, RUT, nacionalidad, estado civil, profesión) salen de lo que él mismo completa en Configuración → Mi cuenta, y se actualizan solos.' : 'Si es uno de los dueños, elíjalo: sus datos personales completarán la comparecencia y la firma de las promesas.'}
          >
            <Selector value={empresa.representante_cuenta} onChange={(e) => elegirRepresentante(e.target.value as Config['empresa']['representante_cuenta'])}>
              <option value="">Otra persona (escribir nombre y RUT)</option>
              {duenos.map((c) => <option key={c.id} value={c.usuario}>{c.nombre} ({c.usuario}) — datos de su perfil</option>)}
            </Selector>
          </Campo>
          {vinculado ? (
            <>
              <Campo etiqueta="Representante legal"><Entrada disabled value={vinculado.datos!.nombre_completo || 'Sin completar'} /></Campo>
              <Campo etiqueta="RUT del representante legal"><Entrada disabled value={formatearRut(vinculado.datos!.rut) || 'Sin completar'} /></Campo>
              {(!vinculado.datos!.nombre_completo || !vinculado.datos!.rut) && (
                <p className="text-sm text-amber-800 sm:col-span-2">
                  {vinculado.usuario} todavía no completa su nombre completo y RUT en “Mis datos personales”: en los documentos saldrán como línea en blanco.
                </p>
              )}
            </>
          ) : (
            <>
              {campo('representante', 'Representante legal')}
              <Campo etiqueta="RUT del representante legal"><EntradaRut valor={empresa.rut_representante} alCambiar={(v) => setEmpresa({ ...empresa, rut_representante: v })} /></Campo>
            </>
          )}
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
      <FirmaRepresentante />
    </form>
  );
}

// ---------- Firma digital del representante legal ----------

/**
 * Prepara la imagen de la firma: la achica (máximo 600 × 240) y vuelve transparente el fondo claro del papel,
 * para que una foto o un escaneo de la firma quede limpio sobre el documento.
 */
async function prepararFirma(archivo: File): Promise<string> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error('No se pudo leer la imagen'));
      i.src = url;
    });
    const k = Math.min(1, 600 / img.width, 240 / img.height);
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.max(1, Math.round(img.width * k));
    lienzo.height = Math.max(1, Math.round(img.height * k));
    const ctx = lienzo.getContext('2d')!;
    ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    const datos = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
    const p = datos.data;
    for (let i = 0; i < p.length; i += 4) {
      const brillo = (p[i] + p[i + 1] + p[i + 2]) / 3;
      if (brillo > 215) p[i + 3] = 0;
      else if (brillo > 170) p[i + 3] = Math.round(p[i + 3] * ((215 - brillo) / 45));
    }
    ctx.putImageData(datos, 0, 0);
    return lienzo.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Carga o quita la firma del representante legal (va en comprobantes, cotizaciones, estados de cuenta y cartas). */
export function FirmaRepresentante() {
  const { firma, empresa } = useConfig();
  const { recargarConfig } = useSesion();
  const avisos = useAvisos();
  const [ocupado, setOcupado] = useState(false);
  const idArchivo = useId();

  async function subir(archivo: File | undefined) {
    if (!archivo) return;
    if (!/^image\/(png|jpeg)$/.test(archivo.type)) return avisos.error('Use una imagen PNG o JPG');
    setOcupado(true);
    try {
      await api.put('/config/firma', { imagen: await prepararFirma(archivo) });
      await recargarConfig();
      avisos.ok('Firma cargada: ya aparece en los documentos que se emitan');
    } catch (err) {
      avisos.error(err);
    } finally {
      setOcupado(false);
    }
  }

  async function quitar() {
    if (!(await avisos.confirmar({ titulo: '¿Quitar la firma?', mensaje: 'Los documentos que se emitan desde ahora saldrán con la línea para firmar a mano. Las cartas ya emitidas conservan la firma.', confirmar: 'Quitar firma', peligro: true }))) return;
    setOcupado(true);
    try {
      await api.del('/config/firma');
      await recargarConfig();
      avisos.ok('Firma quitada');
    } catch (err) {
      avisos.error(err);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Tarjeta titulo={<span className="flex items-center gap-2"><Signature className="size-4 text-marca-700" />Firma digital del representante legal</span>}>
      <p className="text-sm text-stone-600">
        Sale en el pie de firma de los comprobantes de pago, las cotizaciones, los estados de cuenta y las cartas de cobranza, junto al nombre y RUT de
        {empresa.representante ? ` ${empresa.representante}` : 'l representante legal'}. Firme en una hoja blanca, sáquele una foto o escanéela y recórtela
        dejando solo la firma: el fondo blanco se quita solo.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <div className="flex h-24 w-64 items-center justify-center rounded-lg border border-dashed border-stone-300 bg-white">
          {firma ? <img src={`/api/config/firma?v=${firma.version}`} alt="Firma del representante legal" className="max-h-20 max-w-60" /> : <span className="text-xs text-stone-400">Sin firma cargada</span>}
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={idArchivo} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium text-stone-800 shadow-xs hover:bg-stone-50 ${ocupado ? 'pointer-events-none opacity-50' : ''}`}>
            <ImageUp className="size-4" />{firma ? 'Reemplazar firma' : 'Subir imagen de la firma'}
          </label>
          <input id={idArchivo} type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => { subir(e.target.files?.[0]); e.target.value = ''; }} />
          {firma && <Boton type="button" variante="fantasma" icono={Trash2} disabled={ocupado} onClick={quitar}>Quitar firma</Boton>}
        </div>
      </div>
    </Tarjeta>
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
  tasa_mensual: 'Interés mensual del crédito (%)', pie_monto: 'Pie habitual ($)', n_cuotas: 'Número de cuotas habitual',
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
  // (Los montos en pesos se comparan ya formateados: "$3.000.000" no es un número, así que siempre cuentan si cambiaron.)
  const cambios = listarCambios(inicial, credito, ETIQUETAS_CREDITO, { pie_monto: (v) => pesos(Number(v)) })
    .filter((c) => Number(c.antes) !== Number(c.despues));

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

  // Números sin letras: enteros (cuotas y días) o con coma decimal (tasas y porcentaje del pie).
  const ENTEROS: (keyof Config['credito'])[] = ['n_cuotas', 'dias_validez_cotizacion', 'dias_plazo_carta'];
  const campo = (k: keyof Config['credito'], ayuda: string, _props: { step?: string; min?: number; max?: number } = {}) => (
    <Campo etiqueta={ETIQUETAS_CREDITO[k]} ayuda={ayuda}>
      {ENTEROS.includes(k)
        ? <EntradaEntero required valor={credito[k]} alCambiar={(v) => setCredito({ ...credito, [k]: v })} />
        : <EntradaDecimal required valor={credito[k]} alCambiar={(v) => setCredito({ ...credito, [k]: v })} />}
    </Campo>
  );

  return (
    <form onSubmit={guardar} className="max-w-3xl space-y-4">
      <Tarjeta titulo="Valores propuestos al cotizar y vender">
        <p className="mb-3 text-sm text-stone-600">Son los valores con que parten los formularios; en cada cotización o venta se pueden cambiar.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {campo('tasa_mensual', 'Interés sobre saldo insoluto, cuota fija.', { max: 15 })}
          <Campo etiqueta={ETIQUETAS_CREDITO.pie_monto} ayuda="Monto en pesos que se propone como pie. Si el precio es menor, el pie es el precio.">
            <EntradaMonto valor={Number(credito.pie_monto) || null} alCambiar={(v) => setCredito({ ...credito, pie_monto: String(v ?? 0) })} />
          </Campo>
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
  superadmin: 'Todo: datos sensibles de la empresa, correo de envío de cartas, precios y mapa de parcelas, cuentas, registro de cambios completo, plantillas legales, tabla de amortización y datos contables.',
  abogado: 'Dueño. Ve toda la información (ventas, deudas, cobranza, ingresos) sin registrar nada de dinero. Cotiza e informa al contador las ventas que cierra; completa los datos esenciales de los clientes; agenda visitas a su nombre; trabaja los documentos legales (plantillas, promesas y cartas) y ve el registro de cambios de los dueños.',
  contador: 'Dueño. Clientes, cotizaciones, ventas y pagos; tabla de amortización, datos contables, precios de las parcelas y envío programado de cartas. Ve el registro de cambios de los dueños.',
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
                    {c.datos && (
                      <div className={`mt-1 text-xs ${c.datos.completos === c.datos.total ? 'text-green-800' : 'text-amber-800'}`}>
                        Datos personales para documentos: {c.datos.completos} de {c.datos.total} completos (los ingresa {c.usuario} en Mi cuenta).
                      </div>
                    )}
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
  const { puede, usuario } = useSesion();
  const todo = puede('administracion');
  const consulta = useDatos<EntradaRegistro[]>('/bitacora?limite=500');
  const [filtro, setFiltro] = useState('');
  const [quien, setQuien] = useState('');

  return (
    <Carga consulta={consulta}>
      {(entradas) => {
        const presentes = [...new Set(entradas.map((e) => e.accion))];
        const personas = [...new Set(entradas.map((e) => e.cuenta ?? ''))];
        const filtradas = entradas.filter((e) => (!filtro || e.accion === filtro) && (!quien || (e.cuenta ?? '') === quien));
        return (
          <>
          {!todo && (
            <p className="mb-3 text-sm text-stone-600">
              Aquí aparecen los cambios que hacen las cuentas de los dueños (ldiaz y pmercado): precios, plantillas, tablas de amortización,
              pagos, tasas y datos personales.
            </p>
          )}
          <Tarjeta
            relleno={false}
            titulo={todo ? 'Últimos cambios sensibles' : 'Cambios hechos por los dueños'}
            acciones={
              <>
                <Selector value={quien} onChange={(e) => setQuien(e.target.value)} className="!w-auto !py-1 !text-xs" aria-label="Quién">
                  <option value="">Todas las personas</option>
                  {personas.map((c) => <option key={c} value={c}>{c === usuario?.usuario ? `Solo los míos (${c})` : c || 'Consola'}</option>)}
                </Selector>
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
                        <td className={`${td} whitespace-nowrap`}>{e.usuario ?? <span className="text-stone-500">{e.accion === 'cobranza_enviada' ? 'Sistema (programado)' : 'Consola'}</span>}</td>
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
          </>
        );
      }}
    </Carga>
  );
}

// ---------- Mi cuenta (todas) ----------

function MiCuenta() {
  const { usuario, salir, puede } = useSesion();
  const config = useConfig();
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

  const conDatos = puede('datos_personales');
  // El dueño designado representante legal carga su propia firma.
  const esRepresentante = !puede('empresa') && config.empresa.representante_cuenta === usuario?.usuario;
  const columna = (
    <div className="space-y-4">
      {esRepresentante && <FirmaRepresentante />}
      {puede('avisos_visitas') && <AvisosEnEsteEquipo />}
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

  if (!conDatos) return <div className="max-w-md">{columna}</div>;
  return (
    <div className="grid max-w-5xl items-start gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      {columna}
      <MisDatosPersonales />
    </div>
  );
}

// ---------- Avisos push en este equipo ----------

function AvisosEnEsteEquipo() {
  const avisos = useAvisos();
  const equipos = useDatos<{ id: number; equipo: string; creada_en: string; ultimo_envio: string | null }[]>('/push/suscripciones');
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => { estadoPush().then(setEstado).catch(() => setEstado('no_soportado')); }, []);

  async function cambiar(activar: boolean) {
    setOcupado(true);
    try {
      const e = activar ? await activarPush() : await desactivarPush();
      setEstado(e);
      if (activar && e === 'bloqueado') avisos.error('El navegador bloqueó los avisos: permítalos en los permisos del sitio (el candado junto a la dirección).');
      else if (activar && e === 'activo') avisos.ok('Avisos activados en este equipo');
      else if (!activar) avisos.ok('Este equipo ya no recibirá avisos');
      equipos.recargar();
    } catch (err) {
      avisos.error(err);
    } finally {
      setOcupado(false);
    }
  }

  async function probar() {
    setOcupado(true);
    try {
      const r = await api.post<{ enviados: number }>('/push/prueba');
      if (r.enviados) avisos.ok(`Aviso de prueba enviado a ${r.enviados === 1 ? 'su equipo' : `sus ${r.enviados} equipos`}: debería aparecer en unos segundos.`);
      else avisos.error('No se pudo entregar el aviso: active los avisos de nuevo en este equipo.');
      equipos.recargar();
    } catch (err) {
      avisos.error(err);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Tarjeta titulo={<span className="flex items-center gap-2"><BellRing className="size-4" /> Avisos en este equipo</span>}>
      <p className="text-sm text-stone-600">
        Reciba los avisos de visitas y ventas como notificación del computador o del celular, aunque el sistema esté cerrado.
        Se activan en cada equipo por separado.
      </p>
      <div className="mt-3 text-sm">
        {estado === 'activo' && <p className="font-medium text-green-800">Activados en este equipo.</p>}
        {estado === 'inactivo' && <p className="text-stone-700">Desactivados en este equipo.</p>}
        {estado === 'bloqueado' && <p className="text-amber-800">El navegador los bloqueó: permítalos en los permisos del sitio (el candado junto a la dirección) y vuelva a intentar.</p>}
        {(estado === 'no_soportado' || estado === 'requiere_app') && <p className="text-amber-800">{motivoSinPush()}</p>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {(estado === 'inactivo' || estado === 'bloqueado') && <Boton chico icono={BellRing} cargando={ocupado} onClick={() => cambiar(true)}>Activar avisos</Boton>}
        {estado === 'activo' && (
          <>
            <Boton chico variante="secundario" cargando={ocupado} onClick={probar}>Enviar aviso de prueba</Boton>
            <Boton chico variante="fantasma" disabled={ocupado} onClick={() => cambiar(false)}>Desactivar</Boton>
          </>
        )}
      </div>
      {(equipos.datos?.length ?? 0) > 0 && (
        <p className="mt-3 text-xs text-stone-500">
          Equipos con avisos activos: {equipos.datos!.map((e) => e.equipo || 'equipo').join(', ')}.
        </p>
      )}
    </Tarjeta>
  );
}

// ---------- Datos personales de los dueños (para los documentos legales) ----------

const ETIQUETAS_PERSONALES: Record<keyof DatosPersonales, string> = {
  nombre_completo: 'Nombre completo', rut: 'RUT', nacionalidad: 'Nacionalidad', estado_civil: 'Estado civil', profesion: 'Profesión u oficio',
  cargo: 'Cargo en la empresa', direccion: 'Domicilio', comuna: 'Comuna', ciudad: 'Ciudad', telefono: 'Teléfono', email: 'Correo electrónico',
};
const ESTADOS_CIVILES = ['soltero', 'soltera', 'casado', 'casada', 'conviviente civil', 'divorciado', 'divorciada', 'viudo', 'viuda', 'separado', 'separada'];

function MisDatosPersonales() {
  const consulta = useDatos<DatosPersonales>('/auth/datos-personales');
  return <Carga consulta={consulta}>{(d) => <FormularioDatosPersonales guardados={d} alGuardar={consulta.recargar} />}</Carga>;
}

function FormularioDatosPersonales({ guardados, alGuardar }: { guardados: DatosPersonales; alGuardar: () => void }) {
  const { usuario, recargarConfig } = useSesion();
  const config = useConfig();
  const avisos = useAvisos();
  const idLista = useId();
  const inicial = { ...guardados, rut: formatearRut(guardados.rut) };
  const [d, setD] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const cambios = listarCambios(inicial, d, ETIQUETAS_PERSONALES);
  const prefijo = usuario?.rol === 'abogado' ? 'abogado' : 'contador';
  const esRepresentante = config.empresa.representante_cuenta === usuario?.usuario;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!cambios.length) return;
    if (d.rut && !rutValido(d.rut)) return avisos.error('El RUT no es válido: revise el dígito verificador');
    const errTel = errorTelefono(d.telefono);
    if (errTel) return avisos.error(errTel);
    if (!correoValido(d.email)) return avisos.error('Revise el correo electrónico (ej.: nombre@dominio.cl)');
    if (!(await avisos.confirmar({
      titulo: 'Confirmar cambios en sus datos personales',
      mensaje: (
        <ListaCambios
          cambios={cambios}
          nota={`Se usarán en los documentos que se confeccionen desde ahora${esRepresentante ? ', incluida la comparecencia de las promesas, porque usted es el representante legal' : ''}. Los documentos ya emitidos no cambian.`}
        />
      ),
      confirmar: 'Sí, guardar',
    }))) return;
    setGuardando(true);
    try {
      await api.put('/auth/datos-personales', d);
      await recargarConfig();
      avisos.ok('Datos personales guardados');
      alGuardar();
    } catch (err) {
      avisos.error(err);
    } finally {
      setGuardando(false);
    }
  }

  const campo = (k: keyof DatosPersonales, props: { className?: string; placeholder?: string; type?: string; list?: string; autoComplete?: string } = {}) => {
    const { className, ...resto } = props;
    return (
      <Campo etiqueta={ETIQUETAS_PERSONALES[k]} className={className}>
        <Entrada maxLength={k === 'direccion' ? 200 : 120} value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} {...resto} />
      </Campo>
    );
  };

  return (
    <form onSubmit={guardar} className="space-y-4">
      <Tarjeta titulo={<span className="flex items-center gap-2"><UserRound className="size-4" /> Mis datos personales</span>}>
        <p className="mb-3 text-sm text-stone-600">
          Se usan para completar solos los documentos legales: en las plantillas son los datos {`{{${prefijo}.nombre}}`}, {`{{${prefijo}.rut}}`}, etc.
          {esRepresentante
            ? ' Además, la empresa lo designó representante legal: estos datos completan la comparecencia y la firma de las promesas de compraventa.'
            : ' Si la empresa lo designa representante legal, también completarán la comparecencia de las promesas.'}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {campo('nombre_completo', { className: 'sm:col-span-2', placeholder: 'Nombres y apellidos, como en la cédula de identidad', autoComplete: 'name' })}
          <Campo etiqueta={ETIQUETAS_PERSONALES.rut}><EntradaRut valor={d.rut} alCambiar={(v) => setD({ ...d, rut: v })} /></Campo>
          {campo('nacionalidad', { placeholder: 'chilena' })}
          {campo('estado_civil', { list: idLista })}
          {campo('profesion')}
          {campo('cargo', { placeholder: 'Ej.: socio, gerente general' })}
          <Campo etiqueta={ETIQUETAS_PERSONALES.telefono}><EntradaTelefono valor={d.telefono} alCambiar={(v) => setD({ ...d, telefono: v })} /></Campo>
          {campo('direccion', { className: 'sm:col-span-2', placeholder: 'Calle, número, depto.', autoComplete: 'street-address' })}
          {campo('comuna')}
          {campo('ciudad')}
          {campo('email', { type: 'email', className: 'sm:col-span-2', autoComplete: 'email' })}
        </div>
        <datalist id={idLista}>{ESTADOS_CIVILES.map((x) => <option key={x} value={x} />)}</datalist>
      </Tarjeta>
      <BarraGuardar cambios={cambios.length} guardando={guardando} alDescartar={() => setD(inicial)} />
    </form>
  );
}
