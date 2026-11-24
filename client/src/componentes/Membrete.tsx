import { useConfig } from '../contexto';
import { fechaLarga, formatearRut } from '../formato';

/**
 * Encabezado con los datos de la empresa para los documentos impresos. Con `fecha` agrega debajo
 * el lugar y la fecha del documento: siempre "Punta Arenas, 24 de noviembre de 2026".
 */
export function Membrete({ titulo, subtitulo, fecha }: { titulo?: string; subtitulo?: string; fecha?: string }) {
  const { empresa, proyecto, lugar_emision } = useConfig();
  const linea = (...partes: (string | false | null | undefined)[]) => {
    const texto = partes.filter(Boolean).join(' · ');
    return texto ? <div className="text-xs text-stone-600">{texto}</div> : null;
  };
  return (
    <>
    <div className={`${fecha ? 'mb-3' : 'mb-6'} flex items-start justify-between gap-6 border-b-2 border-stone-800 pb-3 font-sans`}>
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
    {fecha && <p className="mb-6 text-right text-sm text-stone-900">{lugar_emision || 'Punta Arenas'}, {fechaLarga(fecha)}</p>}
    </>
  );
}
