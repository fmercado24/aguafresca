import type { ReactNode } from 'react';
import { useConfig } from '../contexto';
import { formatearRut } from '../formato';

/**
 * Pie de firma de los documentos que emite la empresa (comprobantes de pago, cotizaciones, estados de cuenta):
 * la firma digital del representante legal (si está cargada), su nombre, cargo y RUT, y la razón social.
 */
export function PieFirma({ className = '', extra }: { className?: string; extra?: ReactNode }) {
  const { empresa, firma } = useConfig();
  return (
    <div className={`flex justify-end break-inside-avoid ${className}`}>
      <div className="w-72 text-center text-sm">
        <div className="flex h-20 items-end justify-center">
          {firma && <img src={`/api/config/firma?v=${firma.version}`} alt="Firma del representante legal" className="max-h-20 max-w-64" />}
        </div>
        <div className="border-t border-stone-500 pt-1">
          {empresa.representante && <div className="font-medium">{empresa.representante}</div>}
          <div>Representante legal</div>
          {empresa.rut_representante && <div>RUT {formatearRut(empresa.rut_representante)}</div>}
          <div>{empresa.razon_social}</div>
          {extra}
        </div>
      </div>
    </div>
  );
}
