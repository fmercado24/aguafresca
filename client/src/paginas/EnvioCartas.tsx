import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { FlaskConical, Mail, MessageCircle, Plus, Send, Trash2 } from 'lucide-react';
import { api, useDatos } from '../api';
import { useAvisos, useSesion } from '../contexto';
import { ListaCambios, type Cambio } from '../componentes/Cambios';
import { ESTADOS_ENVIO, nombreCanal } from '../componentes/EnvioCarta';
import { descargarCsv, fechaHoraRegistro, pesos, plural } from '../formato';
import type { Canales, Envio, EnvioPlaneado, ProgramacionCobranza } from '../tipos';
import {
  Boton, Campo, Carga, Casilla, Entrada, Insignia, Selector, Tabla, Tarjeta, Vacio, num, td, th, EntradaEntero,
} from '../ui';

// Cartas de cobranza por correo (a mano o programadas) y WhatsApp (siempre a mano, sin costo):
//  - Configuración → Envío de cartas: programación y correo de envío con su contraseña (administrador y super administrador).
//  - Cobranza → Envíos: lo que saldría hoy, "Enviar ahora" y el registro de todo lo enviado.

// ---------- Programación de los envíos (administrador y super administrador) ----------

type Etapa = { dias: string; plantilla_id: number | null };

function describirProgramacion(p: { modo: string; hora: string; dias_habiles: boolean; etapas: { dias: number | string; plantilla_id: number | null }[] }, nombres: Map<number, string>) {
  return {
    modo: p.modo === 'automatico' ? `Automático por correo, a las ${p.hora}${p.dias_habiles ? ', de lunes a viernes' : ', todos los días'}` : 'Manual',
    etapas: p.etapas.map((e) => `${e.dias} días: ${e.plantilla_id ? nombres.get(e.plantilla_id) ?? '?' : '(sin carta)'}`).join('\n'),
  };
}

function Programacion({ inicial, editable, alGuardar }: { inicial: ProgramacionCobranza; editable: boolean; alGuardar: () => void }) {
  const avisos = useAvisos();
  const [p, setP] = useState({
    modo: inicial.modo, hora: inicial.hora, dias_habiles: inicial.dias_habiles,
    etapas: inicial.etapas.map((e) => ({ dias: String(e.dias), plantilla_id: e.plantilla_id })) as Etapa[],
  });
  const [guardando, setGuardando] = useState(false);
  const nombres = new Map(inicial.plantillas.map((x) => [x.id, x.nombre]));
  const antes = describirProgramacion(inicial, nombres);
  const despues = describirProgramacion(p, nombres);
  const cambios: Cambio[] = (['modo', 'etapas'] as const)
    .filter((k) => antes[k] !== despues[k])
    .map((k) => ({ etiqueta: { modo: 'Envío', etapas: 'Etapas' }[k], antes: antes[k], despues: despues[k] }));

  const cambiarEtapa = (i: number, e: Partial<Etapa>) => setP({ ...p, etapas: p.etapas.map((x, k) => (k === i ? { ...x, ...e } : x)) });

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!cambios.length) return;
    if (!(await avisos.confirmar({
      titulo: 'Confirmar el envío de cartas de cobranza',
      mensaje: (
        <ListaCambios
          cambios={cambios}
          nota={p.modo === 'automatico' ? 'Desde ahora el sistema enviará solo, cada día, las cartas que correspondan. Revise en Cobranza → Envíos qué saldría hoy.' : undefined}
        />
      ),
      confirmar: 'Sí, guardar',
    }))) return;
    setGuardando(true);
    try {
      await api.put('/cobranza/programacion', { ...p, etapas: p.etapas.map((x) => ({ dias: Number(x.dias), plantilla_id: x.plantilla_id })) });
      avisos.ok('Envío de cartas guardado');
      alGuardar();
    } catch (err) {
      avisos.error(err);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar}>
      <Tarjeta titulo="Cartas de cobranza: ¿a mano o programadas?">
        <fieldset disabled={!editable} className="min-w-0 space-y-4">
          {!editable && <p className="text-sm text-stone-500">Esta programación la define el administrador o el super administrador.</p>}
          <div className="space-y-2">
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name="modo" className="mt-1" checked={p.modo === 'manual'} onChange={() => setP({ ...p, modo: 'manual' })} />
              <span><strong>Manual.</strong> Cada carta se envía a mano: desde la carta emitida (por correo o WhatsApp) o desde Cobranza → Envío de cartas (“Enviar ahora”, por correo).</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name="modo" className="mt-1" checked={p.modo === 'automatico'} onChange={() => setP({ ...p, modo: 'automatico' })} />
              <span><strong>Automática por correo.</strong> El sistema revisa cada día los atrasos y envía por correo la carta que corresponda a cada deudor. WhatsApp no se programa: se envía a mano.</span>
            </label>
          </div>
          {p.modo === 'automatico' && (
            <div className="flex flex-wrap items-end gap-3">
              <Campo etiqueta="Hora de envío"><Entrada type="time" required value={p.hora} onChange={(e) => setP({ ...p, hora: e.target.value })} /></Campo>
              <Casilla checked={p.dias_habiles} onChange={(e) => setP({ ...p, dias_habiles: e.target.checked })} etiqueta="Solo de lunes a viernes" className="pb-2" />
            </div>
          )}
          <div>
            <span className="mb-1 block text-xs font-medium text-stone-600">Etapas: qué carta se envía según los días de atraso de la cuota impaga más antigua</span>
            <ul className="space-y-2">
              {p.etapas.map((e, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-stone-600">Desde</span>
                  <EntradaEntero required aria-label={`Días de atraso, etapa ${i + 1}`} valor={e.dias} alCambiar={(v) => cambiarEtapa(i, { dias: v })} className="!w-20" />
                  <span className="text-stone-600">días de atraso:</span>
                  <Selector aria-label={`Carta de la etapa ${i + 1}`} value={e.plantilla_id ?? ''} onChange={(x) => cambiarEtapa(i, { plantilla_id: Number(x.target.value) || null })} className="!w-auto min-w-56 flex-1">
                    <option value="">Elegir carta…</option>
                    {inicial.plantillas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                  </Selector>
                  {p.etapas.length > 1 && (
                    <button type="button" onClick={() => setP({ ...p, etapas: p.etapas.filter((_, k) => k !== i) })} aria-label={`Quitar etapa ${i + 1}`} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-red-700">
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {p.etapas.length < 6 && editable && (
              <Boton chico variante="fantasma" icono={Plus} className="mt-1" onClick={() => setP({ ...p, etapas: [...p.etapas, { dias: '', plantilla_id: null }] })}>Agregar etapa</Boton>
            )}
            <p className="mt-2 text-xs text-stone-500">
              Cada etapa se envía una sola vez a cada deudor. Si se pone al día y luego vuelve a atrasarse, el ciclo parte de nuevo.
              Las cartas se toman de Documentos → Plantillas.
            </p>
          </div>
          {editable && (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-stone-100 pt-3">
              <span className="mr-auto text-sm text-stone-500">{cambios.length ? 'Hay cambios sin guardar' : 'Sin cambios pendientes'}</span>
              <Boton type="submit" cargando={guardando} disabled={!cambios.length}>Revisar y guardar</Boton>
            </div>
          )}
        </fieldset>
      </Tarjeta>
    </form>
  );
}

// ---------- Correo de envío (super administrador) y WhatsApp a mano ----------

const SEGURIDAD = { starttls: 'STARTTLS (puerto 587)', ssl: 'SSL/TLS (puerto 465)', ninguna: 'Sin cifrar (no recomendado)' };

function CorreoFormulario({ inicial, alGuardar }: { inicial: Canales; alGuardar: () => void }) {
  const avisos = useAvisos();
  const c0 = inicial.correo!;
  const [prueba, setPrueba] = useState(inicial.modo_prueba);
  const [correo, setCorreo] = useState({ servidor: c0.servidor, puerto: String(c0.puerto), seguridad: c0.seguridad, usuario: c0.usuario, clave: '', remitente: c0.remitente, responder_a: c0.responder_a });
  const [destino, setDestino] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);

  const cambios: Cambio[] = [];
  if (prueba !== inicial.modo_prueba) cambios.push({ etiqueta: 'Modo de prueba', antes: inicial.modo_prueba ? 'activo' : 'desactivado', despues: prueba ? 'activo (los correos no salen)' : 'desactivado: los correos se envían de verdad' });
  for (const [k, etq] of [['servidor', 'Servidor de correo'], ['puerto', 'Puerto'], ['seguridad', 'Seguridad'], ['usuario', 'Usuario'], ['remitente', 'Remitente'], ['responder_a', 'Responder a']] as const) {
    if (String(c0[k]) !== String(correo[k])) cambios.push({ etiqueta: etq, antes: String(c0[k] ?? ''), despues: String(correo[k]) });
  }
  if (correo.clave) cambios.push({ etiqueta: 'Contraseña del correo', antes: c0.tiene_clave ? '••••••' : '', despues: 'nueva contraseña' });

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!cambios.length) return;
    if (!(await avisos.confirmar({
      titulo: 'Confirmar cambios en el correo de envío',
      mensaje: <ListaCambios cambios={cambios} nota={!prueba && inicial.modo_prueba ? 'Al desactivar el modo de prueba, las cartas por correo (manuales y programadas) les llegarán a los clientes.' : undefined} />,
      confirmar: 'Sí, guardar',
    }))) return;
    setGuardando(true);
    try {
      await api.put('/config/canales', { modo_prueba: prueba, correo: { ...correo, puerto: Number(correo.puerto) } });
      avisos.ok('Correo de envío guardado');
      setCorreo((x) => ({ ...x, clave: '' }));
      alGuardar();
    } catch (err) {
      avisos.error(err);
    } finally {
      setGuardando(false);
    }
  }

  async function probar() {
    if (!destino.trim()) return avisos.error('Escriba un correo para la prueba');
    setProbando(true);
    try {
      await api.post('/config/canales/prueba', { destino });
      avisos.ok(`Correo de prueba enviado a ${destino}`);
    } catch (err) {
      avisos.error(err);
    } finally {
      setProbando(false);
    }
  }

  const campoCorreo = (k: keyof typeof correo, etiqueta: string, props: { type?: string; placeholder?: string; className?: string; ayuda?: string; autoComplete?: string } = {}) => {
    const { className, ayuda, ...resto } = props;
    return (
      <Campo etiqueta={etiqueta} className={className} ayuda={ayuda}>
        <Entrada value={correo[k]} onChange={(e) => setCorreo({ ...correo, [k]: e.target.value })} {...resto} />
      </Campo>
    );
  };

  return (
    <form onSubmit={guardar} className="space-y-4">
      <Tarjeta titulo={<span className="flex items-center gap-2"><Mail className="size-4" /> Correo electrónico de envío (SMTP)</span>}>
        <Casilla checked={prueba} onChange={(e) => setPrueba(e.target.checked)} etiqueta="Modo de prueba: los correos quedan registrados, pero no le llegan a nadie" />
        <p className="mb-4 mt-1 text-xs text-stone-500">Úselo para revisar las reglas antes de partir. El botón “Probar correo” de abajo sí envía un correo real.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {campoCorreo('servidor', 'Servidor', { placeholder: 'smtp.gmail.com', ayuda: 'Gmail: smtp.gmail.com · Outlook: smtp.office365.com' })}
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Puerto"><EntradaEntero valor={correo.puerto} alCambiar={(v) => setCorreo({ ...correo, puerto: v })} /></Campo>
            <Campo etiqueta="Seguridad">
              <Selector value={correo.seguridad} onChange={(e) => setCorreo({ ...correo, seguridad: e.target.value as typeof correo.seguridad })}>
                {Object.entries(SEGURIDAD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Selector>
            </Campo>
          </div>
          {campoCorreo('usuario', 'Usuario', { autoComplete: 'off', placeholder: 'cobranza@empresa.cl' })}
          {campoCorreo('clave', 'Contraseña', {
            type: 'password', autoComplete: 'new-password', placeholder: c0.tiene_clave ? '•••••• (guardada; escriba para cambiarla)' : '',
            ayuda: 'En Gmail use una “contraseña de aplicación”, no la clave de la cuenta.',
          })}
          {campoCorreo('remitente', 'Remitente', { placeholder: 'Agua Fresca SpA <cobranza@empresa.cl>' })}
          {campoCorreo('responder_a', 'Responder a (opcional)', { type: 'email', placeholder: 'contacto@empresa.cl' })}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-stone-100 pt-3">
          <span className="mr-auto text-sm text-stone-500">{cambios.length ? `${plural(cambios.length, 'cambio')} sin guardar` : 'Sin cambios pendientes'}</span>
          <Boton type="submit" cargando={guardando} disabled={!cambios.length}>Revisar y guardar</Boton>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Probar el correo guardado">
        <div className="flex flex-wrap items-end gap-2">
          <Campo etiqueta="Enviar un correo de prueba a" className="min-w-56 flex-1">
            <Entrada type="email" value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="correo@ejemplo.cl" />
          </Campo>
          <Boton variante="secundario" icono={Mail} cargando={probando} disabled={!inicial.correo_listo} onClick={probar}>Probar correo</Boton>
        </div>
      </Tarjeta>
    </form>
  );
}

function EstadoCorreo({ c }: { c: Canales }) {
  return (
    <Tarjeta titulo={<span className="flex items-center gap-2"><Mail className="size-4" /> Correo electrónico de envío</span>}>
      <p className="text-sm text-stone-700">
        {c.correo_listo ? 'Configurado.' : 'Sin configurar.'} {c.modo_prueba ? 'Modo de prueba activo: los correos se registran pero no salen.' : 'Los correos salen de verdad.'}
      </p>
      <p className="mt-2 text-xs text-stone-500">El correo de envío lo configura el super administrador.</p>
    </Tarjeta>
  );
}

/** WhatsApp no se configura: cada persona lo envía desde su propio WhatsApp. */
function ComoFuncionaWhatsApp() {
  return (
    <Tarjeta titulo={<span className="flex items-center gap-2"><MessageCircle className="size-4" /> WhatsApp (a mano, sin costo)</span>}>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-stone-700">
        <li>En la carta emitida (Documentos), presione <strong>Abrir en WhatsApp</strong>: se abre la conversación con el celular del cliente y el texto de la carta ya escrito.</li>
        <li>Revise el mensaje y presione <strong>Enviar</strong> en WhatsApp. Queda anotado en la ficha del deudor.</li>
      </ol>
      <p className="mt-3 text-sm text-stone-700">Para que funcione, en el equipo desde donde se envía:</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-stone-700">
        <li><strong>Computador:</strong> tener abierta la sesión de <strong>WhatsApp Web</strong> (web.whatsapp.com) o la aplicación WhatsApp de escritorio, vinculada al celular de la empresa.</li>
        <li><strong>Celular:</strong> en Android se abre <strong>WhatsApp Business</strong> (si no está instalado, el WhatsApp normal); en iPhone, el WhatsApp que elija el celular.</li>
        <li>El celular del cliente debe estar en su ficha (por ejemplo +56 9 1234 5678).</li>
      </ul>
      <p className="mt-3 text-xs text-stone-500">
        El mensaje sale desde la cuenta de WhatsApp abierta en ese equipo. Conviene usar un número de la empresa (la aplicación gratuita WhatsApp Business sirve)
        y no el personal. No se usa la API pagada de WhatsApp, por eso no hay envíos programados por WhatsApp: esos salen por correo.
      </p>
    </Tarjeta>
  );
}

export function EnvioDeCartas() {
  const { puede } = useSesion();
  const programacion = useDatos<ProgramacionCobranza>('/cobranza/programacion');
  const canales = useDatos<Canales>('/config/canales');
  return (
    <div className="max-w-3xl space-y-4">
      <Carga consulta={programacion}>{(p) => <Programacion inicial={p} editable={puede('contabilidad')} alGuardar={programacion.recargar} />}</Carga>
      <Carga consulta={canales}>
        {(c) => (puede('empresa') && c.correo ? <CorreoFormulario inicial={c} alGuardar={canales.recargar} /> : <EstadoCorreo c={c} />)}
      </Carga>
      <ComoFuncionaWhatsApp />
    </div>
  );
}

// ---------- Cobranza → Envíos ----------

export function VistaEnvios() {
  const avisos = useAvisos();
  const contable = useSesion().puede('contabilidad');
  const plan = useDatos<EnvioPlaneado[]>('/cobranza/plan');
  const historial = useDatos<Envio[]>('/envios');
  const programacion = useDatos<ProgramacionCobranza>('/cobranza/programacion');
  const canales = useDatos<Canales>('/config/canales');
  const [enviando, setEnviando] = useState(false);
  const prueba = canales.datos?.modo_prueba ?? true;

  async function enviarAhora(n: number) {
    if (!(await avisos.confirmar({
      titulo: `¿Enviar ahora ${plural(n, 'carta')} de cobranza?`,
      mensaje: prueba
        ? 'El sistema está en modo de prueba: los envíos quedarán registrados, pero no les llegarán a los clientes.'
        : 'Se enviarán de verdad por correo y quedarán anotadas en la ficha de cada deudor.',
      confirmar: 'Enviar ahora',
    }))) return;
    setEnviando(true);
    try {
      const r = await api.post<{ detalle: string }>('/cobranza/plan/ejecutar');
      avisos.ok(r.detalle);
      plan.recargar();
      historial.recargar();
    } catch (err) {
      avisos.error(err);
    } finally {
      setEnviando(false);
    }
  }

  const p = programacion.datos;
  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-600">
        {p ? (p.modo === 'automatico'
          ? `Envío automático por correo activo: cada día${p.dias_habiles ? ' hábil' : ''} a las ${p.hora}.`
          : 'Envío manual: el sistema no envía nada solo.') : ''}
        {' '}<Link to="/configuracion" className="font-medium text-marca-700 hover:underline">Configurar</Link>
      </p>
      {prueba && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <FlaskConical className="mt-0.5 size-4 shrink-0" /> Modo de prueba activo: los correos se registran pero no salen.
        </p>
      )}
      <Carga consulta={plan}>
        {(items) => (
          <Tarjeta
            titulo="Cartas que corresponde enviar hoy"
            relleno={false}
            acciones={contable && items.length > 0 && <Boton chico icono={Send} cargando={enviando} onClick={() => enviarAhora(items.length)}>Enviar ahora</Boton>}
          >
            {items.length === 0 ? (
              <Vacio titulo="No hay cartas pendientes para hoy">Ningún deudor llegó a una etapa nueva de cobranza.</Vacio>
            ) : (
              <Tabla>
                <thead>
                  <tr>
                    <th className={th}>Deudor</th>
                    <th className={`${th} ${num}`}>Atraso</th>
                    <th className={`${th} ${num} hidden sm:table-cell`}>Monto atrasado</th>
                    <th className={th}>Carta</th>
                    <th className={`${th} hidden md:table-cell`}>Destino</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((x) => (
                    <tr key={`${x.venta_id}-${x.etapa}`}>
                      <td className={td}>
                        <Link to={`/clientes/${x.cliente_id}`} className="font-medium text-marca-700 hover:underline">{x.cliente}</Link>
                        <div className="text-xs text-stone-500">Parcela {x.parcela}</div>
                      </td>
                      <td className={`${td} ${num} whitespace-nowrap`}>{plural(x.dias_atraso, 'día')}</td>
                      <td className={`${td} ${num} hidden sm:table-cell`}>{pesos(x.atrasado)}</td>
                      <td className={td}>{x.plantilla}</td>
                      <td className={`${td} hidden text-xs md:table-cell`}>
                        {x.destinos.map((d) => <div key={d.canal}>{nombreCanal(d.canal)}: {d.destino ?? <span className="text-amber-700">sin dato</span>}</div>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            )}
          </Tarjeta>
        )}
      </Carga>
      <Carga consulta={historial}>
        {(envios) => (
          <Tarjeta
            titulo="Envíos realizados"
            relleno={false}
            acciones={envios.length > 0 && (
              <Boton chico variante="secundario" onClick={() => descargarCsv('envios-de-cartas.csv', ['Fecha', 'Deudor', 'Parcela', 'Carta', 'Canal', 'Destino', 'Estado', 'Detalle', 'Quién'],
                envios.map((e) => [fechaHoraRegistro(e.fecha), e.cliente, e.parcela, e.plantilla, nombreCanal(e.canal), e.destino, ESTADOS_ENVIO[e.estado].etiqueta, e.detalle, e.usuario ?? 'envío programado']))}
              >
                Excel
              </Boton>
            )}
          >
            {envios.length === 0 ? (
              <Vacio titulo="Aún no se han enviado cartas">Las cartas se envían desde cada carta emitida (Documentos) o desde esta pantalla.</Vacio>
            ) : (
              <Tabla>
                <thead>
                  <tr>
                    <th className={th}>Fecha</th>
                    <th className={th}>Deudor</th>
                    <th className={th}>Canal</th>
                    <th className={th}>Estado</th>
                    <th className={`${th} hidden md:table-cell`}>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {envios.map((e) => (
                    <tr key={e.id} className="align-top">
                      <td className={`${td} whitespace-nowrap tabular-nums`}>{fechaHoraRegistro(e.fecha)}</td>
                      <td className={td}>
                        {e.documento_id ? <Link to={`/documentos/${e.documento_id}`} className="font-medium text-marca-700 hover:underline">{e.cliente}</Link> : e.cliente}
                        <div className="text-xs text-stone-500">{e.plantilla}{e.parcela ? ` · parcela ${e.parcela}` : ''}</div>
                      </td>
                      <td className={td}>{nombreCanal(e.canal)}<div className="text-xs text-stone-500">{e.destino}</div></td>
                      <td className={td}><Insignia tono={ESTADOS_ENVIO[e.estado].tono}>{ESTADOS_ENVIO[e.estado].etiqueta}</Insignia></td>
                      <td className={`${td} hidden max-w-md text-xs text-stone-600 md:table-cell`}>{e.detalle}{e.usuario ? ` · ${e.usuario}` : e.automatico ? ' · envío programado' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            )}
          </Tarjeta>
        )}
      </Carga>
    </div>
  );
}
