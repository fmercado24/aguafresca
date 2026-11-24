import { useState } from 'react';
import { FlaskConical, Mail, MessageCircle } from 'lucide-react';
import { api, useDatos } from '../api';
import { useAvisos, useSesion } from '../contexto';
import { fechaHoraRegistro } from '../formato';
import type { Canales, CanalEnvio, Documento, Envio, EstadoEnvio, ResultadoEnvio } from '../tipos';
import { Boton, Insignia, Modal, Tarjeta } from '../ui';
import { paraEsteEquipo } from '../whatsapp';

// Envío de una carta de cobranza ya emitida al deudor, por correo o WhatsApp, con confirmación,
// y el registro de los envíos anteriores de esa carta.

export const ESTADOS_ENVIO: Record<EstadoEnvio, { etiqueta: string; tono: 'verde' | 'azul' | 'gris' | 'rojo' | 'ambar' }> = {
  enviado: { etiqueta: 'Enviado', tono: 'verde' },
  manual: { etiqueta: 'Abierto en WhatsApp', tono: 'azul' },
  simulado: { etiqueta: 'Prueba (no salió)', tono: 'gris' },
  error: { etiqueta: 'Error', tono: 'rojo' },
  omitido: { etiqueta: 'Omitido', tono: 'ambar' },
};

export const nombreCanal = (c: CanalEnvio) => (c === 'correo' ? 'Correo' : 'WhatsApp');

/** Celular para WhatsApp, como lo normaliza el servidor (solo para mostrarlo antes de enviar). */
const celular = (t: string | null) => {
  const d = (t ?? '').replace(/\D/g, '');
  if (d.length === 9 && d.startsWith('9')) return `+56${d}`;
  if (d.length === 8) return `+569${d}`;
  return d.length >= 10 ? `+${d}` : '';
};

export function EnvioCarta({ d }: { d: Documento & { cliente_telefono?: string | null } }) {
  const avisos = useAvisos();
  const puedeEnviar = useSesion().puede('documentos');
  const canales = useDatos<Canales>('/config/canales');
  const envios = useDatos<Envio[]>(`/envios?documento_id=${d.id}`);
  const [enviando, setEnviando] = useState<CanalEnvio | null>(null);
  const [enlace, setEnlace] = useState<string | null>(null);

  const prueba = canales.datos?.modo_prueba ?? true;
  // WhatsApp es siempre a mano: se abre la conversación con el texto de la carta y la persona lo envía.
  const waManual = true;
  const destinos: Record<CanalEnvio, string> = { correo: d.cliente_email ?? '', whatsapp: celular(d.cliente_telefono ?? null) };

  async function enviar(canal: CanalEnvio) {
    const destino = destinos[canal];
    const manual = canal === 'whatsapp' && waManual;
    if (!(await avisos.confirmar({
      titulo: `¿Enviar esta carta por ${canal === 'correo' ? 'correo' : 'WhatsApp'}?`,
      mensaje: (
        <div className="space-y-2">
          <p>A <strong>{d.cliente}</strong>: {destino}.</p>
          {manual
            ? <p>Se abrirá WhatsApp con el texto de la carta para que usted lo envíe.</p>
            : prueba
              ? <p className="text-stone-600">El sistema está en <strong>modo de prueba</strong>: el envío quedará registrado, pero no le llegará al cliente.</p>
              : <p>El sistema lo enviará ahora y quedará anotado en la ficha del deudor.</p>}
        </div>
      ),
      confirmar: manual ? 'Abrir WhatsApp' : 'Enviar',
    }))) return;
    setEnviando(canal);
    try {
      const r = await api.post<ResultadoEnvio>(`/documentos/${d.id}/enviar`, { canal });
      if (r.estado === 'manual' && r.enlace) {
        // Si el navegador bloquea la ventana nueva, queda el botón para abrirla.
        // (Con 'noopener' window.open devuelve siempre null: por eso se corta el vínculo después.)
        const destino = paraEsteEquipo(r.enlace);
        const ventana = window.open(destino, '_blank');
        if (ventana) ventana.opener = null;
        else setEnlace(destino);
      } else if (r.estado === 'enviado') avisos.ok(`Carta enviada por ${nombreCanal(canal).toLowerCase()}`);
      else if (r.estado === 'simulado') avisos.ok('Envío registrado en modo de prueba (no salió)');
      else avisos.error(r.detalle);
      envios.recargar();
    } catch (err) {
      avisos.error(err);
    } finally {
      setEnviando(null);
    }
  }

  const fila = (canal: CanalEnvio, Ico: typeof Mail) => (
    <div className="flex flex-wrap items-center gap-2">
      <Ico className="size-4 text-stone-500" />
      <span className="min-w-40 flex-1 text-sm text-stone-700">
        {nombreCanal(canal)}: {destinos[canal] || <span className="text-stone-400">{canal === 'correo' ? 'el cliente no tiene correo registrado' : 'el cliente no tiene celular registrado'}</span>}
      </span>
      {puedeEnviar && (
        <Boton chico variante="secundario" icono={Ico} disabled={!destinos[canal]} cargando={enviando === canal} onClick={() => enviar(canal)}>
          {canal === 'whatsapp' && waManual ? 'Abrir en WhatsApp' : `Enviar por ${nombreCanal(canal).toLowerCase()}`}
        </Boton>
      )}
    </div>
  );

  return (
    <Tarjeta titulo="Enviar al deudor" className="no-imprimir mx-auto mb-4 max-w-3xl">
      {prueba && (
        <p className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <FlaskConical className="mt-0.5 size-4 shrink-0" />
          Modo de prueba: los correos se registran pero no salen. Se desactiva en Configuración → Envío de cartas. (WhatsApp no se ve afectado: siempre lo envía usted.)
        </p>
      )}
      <div className="space-y-2">
        {fila('correo', Mail)}
        {fila('whatsapp', MessageCircle)}
      </div>
      {(envios.datos?.length ?? 0) > 0 && (
        <ul className="mt-3 divide-y divide-stone-100 border-t border-stone-100 text-sm">
          {envios.datos!.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="tabular-nums text-stone-500">{fechaHoraRegistro(e.fecha)}</span>
              <span>{nombreCanal(e.canal)}</span>
              <Insignia tono={ESTADOS_ENVIO[e.estado].tono}>{ESTADOS_ENVIO[e.estado].etiqueta}</Insignia>
              <span className="w-full text-xs text-stone-500 sm:w-auto sm:flex-1">{e.detalle}{e.usuario ? ` · ${e.usuario}` : e.automatico ? ' · envío programado' : ''}</span>
            </li>
          ))}
        </ul>
      )}
      {enlace && (
        <Modal abierto alCerrar={() => setEnlace(null)} titulo="Abrir WhatsApp" ancho="sm" pie={<Boton variante="secundario" onClick={() => setEnlace(null)}>Cerrar</Boton>}>
          <a href={enlace} target="_blank" rel="noopener noreferrer" onClick={() => setEnlace(null)} className="inline-flex items-center gap-2 font-medium text-marca-700 hover:underline">
            <MessageCircle className="size-4" /> Abrir la conversación con el mensaje listo
          </a>
        </Modal>
      )}
    </Tarjeta>
  );
}
