import { useId, useState, type FormEvent } from 'react';
import { api } from '../api';
import { useAvisos, useConfig } from '../contexto';
import { AreaTexto, Boton, Campo, Entrada, EntradaMonto, Modal, Selector } from '../ui';

export const TIPOS_GESTION: Record<string, string> = {
  llamada: 'Llamada telefónica',
  whatsapp: 'WhatsApp',
  email: 'Correo electrónico',
  carta: 'Carta de cobranza',
  visita: 'Visita',
  compromiso: 'Compromiso de pago',
  otro: 'Otra gestión',
};

/** Registra una gestión de cobranza en la bitácora del deudor. */
export function FormularioGestion({ clienteId, nombre, ventas, ventaId, alCerrar, alGuardar }: {
  clienteId: number;
  nombre: string;
  ventas?: { id: number; parcela: string }[];
  ventaId?: number;
  alCerrar: () => void;
  alGuardar: () => void;
}) {
  const avisos = useAvisos();
  const { hoy } = useConfig();
  const idForm = useId();
  const [d, setD] = useState({
    fecha: hoy, tipo: 'llamada', detalle: '', venta_id: ventaId ?? (ventas?.length === 1 ? ventas[0].id : null) as number | null,
    compromiso_fecha: '', compromiso_monto: null as number | null,
  });
  const [guardando, setGuardando] = useState(false);
  const esCompromiso = d.tipo === 'compromiso';

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      await api.post(`/clientes/${clienteId}/gestiones`, {
        ...d,
        compromiso_fecha: esCompromiso && d.compromiso_fecha ? d.compromiso_fecha : null,
        compromiso_monto: esCompromiso ? d.compromiso_monto : null,
      });
      avisos.ok('Gestión registrada');
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
      titulo={`Registrar gestión — ${nombre}`}
      pie={
        <>
          <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
          <Boton type="submit" form={idForm} cargando={guardando}>Guardar</Boton>
        </>
      }
    >
      <form id={idForm} onSubmit={guardar} className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Fecha">
          <Entrada type="date" required max={hoy} value={d.fecha} onChange={(e) => setD({ ...d, fecha: e.target.value })} />
        </Campo>
        <Campo etiqueta="Tipo de gestión">
          <Selector value={d.tipo} onChange={(e) => setD({ ...d, tipo: e.target.value })}>
            {Object.entries(TIPOS_GESTION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Selector>
        </Campo>
        {ventas && ventas.length > 1 && (
          <Campo etiqueta="Venta relacionada" className="col-span-2">
            <Selector value={d.venta_id ?? ''} onChange={(e) => setD({ ...d, venta_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Todas / no aplica</option>
              {ventas.map((v) => <option key={v.id} value={v.id}>Parcela {v.parcela}</option>)}
            </Selector>
          </Campo>
        )}
        <Campo etiqueta="Detalle" className="col-span-2">
          <AreaTexto required autoFocus rows={4} maxLength={3000} value={d.detalle} onChange={(e) => setD({ ...d, detalle: e.target.value })} placeholder="Qué se conversó, respuesta del cliente, próximos pasos…" />
        </Campo>
        {esCompromiso && (
          <>
            <Campo etiqueta="Fecha comprometida">
              <Entrada type="date" value={d.compromiso_fecha} onChange={(e) => setD({ ...d, compromiso_fecha: e.target.value })} />
            </Campo>
            <Campo etiqueta="Monto comprometido">
              <EntradaMonto valor={d.compromiso_monto} alCambiar={(v) => setD({ ...d, compromiso_monto: v })} />
            </Campo>
          </>
        )}
      </form>
    </Modal>
  );
}
