import type { ReactNode } from 'react';
import { useConfig } from '../contexto';

/**
 * Pie de firma de los documentos que emite la empresa (comprobantes de pago, cotizaciones, estados de cuenta):
 * la firma digital (si está cargada) y bajo ella solo "Soc. de Inv. e Inmob. Agua Fresca SpA", a pedido del cliente
 * (sin nombre, RUT ni cargo del representante). `extra` va aparte, debajo.
 */
export function PieFirma({ className = '', extra }: { className?: string; extra?: ReactNode }) {
  const { firma, leyenda_firma } = useConfig();
  return (
    <div className={`flex justify-end break-inside-avoid ${className}`}>
      <div className="w-72 text-center text-sm">
        <div className="flex h-20 items-end justify-center">
          {firma && <img src={`/api/config/firma?v=${firma.version}`} alt="Firma" className="max-h-20 max-w-64" />}
        </div>
        <div className="border-t border-stone-500 pt-1">
          <div>{leyenda_firma || 'Soc. de Inv. e Inmob. Agua Fresca SpA'}</div>
        </div>
        {extra && <div className="mt-2">{extra}</div>}
      </div>
    </div>
  );
}
