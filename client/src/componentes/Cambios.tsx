import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';

// Antes de guardar un dato sensible se muestra exactamente qué cambia, para evitar errores de un clic.

export interface Cambio {
  etiqueta: string;
  antes: string;
  despues: string;
}

const vacio = (v: unknown) => v === null || v === undefined || v === '';

/** Compara dos objetos campo por campo; `formato` permite mostrar montos o porcentajes legibles. */
export function listarCambios<T extends object>(
  antes: T,
  despues: T,
  etiquetas: Partial<Record<keyof T, string>>,
  formato: Partial<Record<keyof T, (v: unknown) => string>> = {},
): Cambio[] {
  const cambios: Cambio[] = [];
  for (const [campo, etiqueta] of Object.entries(etiquetas) as [keyof T, string][]) {
    const a = antes[campo];
    const d = despues[campo];
    if ((vacio(a) && vacio(d)) || String(a ?? '').trim() === String(d ?? '').trim()) continue;
    const f = formato[campo] ?? ((v: unknown) => String(v ?? ''));
    cambios.push({ etiqueta, antes: vacio(a) ? '' : f(a), despues: vacio(d) ? '' : f(d) });
  }
  return cambios;
}

export function ListaCambios({ cambios, nota }: { cambios: Cambio[]; nota?: ReactNode }) {
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
        {cambios.map((c) => (
          <li key={c.etiqueta} className="px-3 py-2 text-sm">
            <div className="text-xs font-medium text-stone-500">{c.etiqueta}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="whitespace-pre-line break-words text-stone-500 line-through decoration-stone-400">{c.antes || '(vacío)'}</span>
              <ArrowRight className="size-3.5 shrink-0 text-stone-400" aria-label="cambia a" />
              <span className="whitespace-pre-line break-words font-medium text-stone-900">{c.despues || '(vacío)'}</span>
            </div>
          </li>
        ))}
      </ul>
      {nota && <p className="text-sm text-stone-600">{nota}</p>}
    </div>
  );
}

/** Nombre legible de cada tipo de entrada del registro de cambios. */
export const ACCIONES_REGISTRO: Record<string, string> = {
  config_empresa: 'Datos de la empresa',
  config_credito: 'Parámetros de crédito',
  amortizacion: 'Tabla de amortización modificada',
  amortizacion_restaurada: 'Tabla de amortización restaurada',
  pago_editado: 'Pago corregido',
  pago_anulado: 'Pago anulado',
  venta_anulada: 'Venta anulada',
  venta_eliminada: 'Venta eliminada',
  plantilla_creada: 'Plantilla creada',
  plantilla_editada: 'Plantilla modificada',
  plantilla_restaurada: 'Plantilla restaurada',
  plantilla_eliminada: 'Plantilla eliminada',
  parcela_editada: 'Parcela modificada',
  parcela_eliminada: 'Parcela eliminada',
  parcelas_masivo: 'Cambio en bloque de parcelas',
  loteo_cargado: 'Plano del loteo cargado',
  datos_importados: 'Datos cargados desde el Excel',
  datos_corregidos: 'Corrección automática de datos',
  google_earth: 'Plano en Google Earth',
  datos_personales: 'Datos personales actualizados',
  venta_informada: 'Venta informada al contador',
  venta_informada_descartada: 'Venta informada no registrada',
  cliente_completado: 'Datos del cliente completados',
  canales_envio: 'Correo de envío',
  cobranza_programacion: 'Envío programado de cartas',
  cobranza_enviada: 'Cartas de cobranza enviadas',
  cliente_eliminado: 'Cliente eliminado',
  usuario_editado: 'Cuenta modificada',
  clave_restablecida: 'Contraseña restablecida',
  clave_cambiada: 'Contraseña cambiada',
};
