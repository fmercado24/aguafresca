import { useConfig } from '../contexto';
import { formatearRut } from '../formato';

/** Encabezado con los datos de la empresa para los documentos impresos. */
export function Membrete({ titulo, subtitulo }: { titulo?: string; subtitulo?: string }) {
  const { empresa, proyecto } = useConfig();
  const linea = (...partes: (string | false | null | undefined)[]) => {
    const texto = partes.filter(Boolean).join(' · ');
    return texto ? <div className="text-xs text-stone-600">{texto}</div> : null;
  };
  return (
    <div className="mb-6 flex items-start justify-between gap-6 border-b-2 border-stone-800 pb-3 font-sans">
      <div>
        <div className="text-lg font-semibold leading-tight text-stone-900">{empresa.razon_social}</div>
        {linea(empresa.giro, empresa.rut && `RUT ${formatearRut(empresa.rut)}`)}
        {linea([empresa.direccion, empresa.ciudad].filter(Boolean).join(', '))}
        {linea(empresa.telefono, empresa.email)}
      </div>
      <div className="text-right">
        <div className="text-sm font-semibold text-stone-900">{proyecto.nombre}</div>
        {titulo && <div className="mt-1 text-base font-semibold uppercase tracking-wide text-stone-900">{titulo}</div>}
        {subtitulo && <div className="text-xs text-stone-600">{subtitulo}</div>}
      </div>
    </div>
  );
}
