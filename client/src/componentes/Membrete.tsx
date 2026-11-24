import { useConfig } from '../contexto';
import { fechaLarga, formatearRut } from '../formato';
import type { Empresa } from '../tipos';

/** Logo del fundo que encabeza todos los documentos. */
export const LOGO_DOCUMENTOS = '/logo.png';

/** Líneas con los datos de la empresa bajo la razón social (giro y RUT, dirección, contacto), sin las vacías. */
export function lineasEmpresa(empresa: Empresa): string[] {
  const linea = (...partes: (string | false | null | undefined)[]) => partes.filter(Boolean).join(' · ');
  return [
    linea(empresa.giro, empresa.rut && `RUT ${formatearRut(empresa.rut)}`),
    linea([empresa.direccion, empresa.ciudad].filter(Boolean).join(', ')),
    linea(empresa.telefono, empresa.email),
  ].filter(Boolean);
}

/**
 * Encabezado de los documentos impresos: el logo del fundo, los datos de la empresa y, a la derecha, el tipo de
 * documento. Con `fecha` agrega debajo el lugar y la fecha: siempre "Punta Arenas, 24 de noviembre de 2026".
 */
export function Membrete({ titulo, subtitulo, fecha }: { titulo?: string; subtitulo?: string; fecha?: string }) {
  const { empresa, proyecto, lugar_emision } = useConfig();
  return (
    <>
    <div className={`${fecha ? 'mb-3' : 'mb-6'} flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-b-2 border-stone-800 pb-3 font-sans`}>
      <div className="flex min-w-0 items-start gap-4">
        <img src={LOGO_DOCUMENTOS} alt={proyecto.nombre || 'Fundo Entre Ríos'} className="h-14 w-auto shrink-0" />
        <div className="min-w-0">
          <div className="text-lg font-semibold leading-tight text-stone-900">{empresa.razon_social}</div>
          {lineasEmpresa(empresa).map((l) => <div key={l} className="text-xs text-stone-600">{l}</div>)}
        </div>
      </div>
      {(titulo || subtitulo) && (
        <div className="ml-auto text-right">
          {titulo && <div className="text-base font-semibold uppercase tracking-wide text-stone-900">{titulo}</div>}
          {subtitulo && <div className="text-xs text-stone-600">{subtitulo}</div>}
        </div>
      )}
    </div>
    {fecha && <p className="mb-6 text-right text-sm text-stone-900">{lugar_emision || 'Punta Arenas'}, {fechaLarga(fecha)}</p>}
    </>
  );
}
