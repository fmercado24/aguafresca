import { useCallback, useEffect, useState } from 'react';

export class ErrorApi extends Error {
  estado: number;
  constructor(mensaje: string, estado: number) {
    super(mensaje);
    this.estado = estado;
  }
}

/** Se emite cuando el servidor responde 401 fuera del inicio de sesión: la sesión venció. */
export const EVENTO_SESION_VENCIDA = 'af:sesion-vencida';

async function pedir<T>(metodo: string, ruta: string, cuerpo?: unknown, cabeceras: Record<string, string> = {}): Promise<T> {
  let r: Response;
  try {
    const esBinario = cuerpo instanceof Blob;
    r = await fetch(`/api${ruta}`, {
      method: metodo,
      credentials: 'same-origin',
      headers: {
        'X-AF': '1',
        ...(cuerpo !== undefined && !esBinario ? { 'Content-Type': 'application/json' } : {}),
        ...cabeceras,
      },
      body: cuerpo === undefined ? undefined : esBinario ? cuerpo : JSON.stringify(cuerpo),
    });
  } catch {
    throw new ErrorApi('No hay conexión con el servidor. Revise su internet e intente de nuevo.', 0);
  }
  const datos = await r.json().catch(() => null);
  if (!r.ok) {
    if (r.status === 401 && !ruta.startsWith('/auth/')) window.dispatchEvent(new Event(EVENTO_SESION_VENCIDA));
    throw new ErrorApi(datos?.error || `El servidor respondió con un error (${r.status})`, r.status);
  }
  return datos as T;
}

export const api = {
  get: <T>(ruta: string) => pedir<T>('GET', ruta),
  post: <T = { id: number }>(ruta: string, cuerpo: unknown = {}) => pedir<T>('POST', ruta, cuerpo),
  put: <T = { ok: true }>(ruta: string, cuerpo: unknown = {}) => pedir<T>('PUT', ruta, cuerpo),
  del: <T = { ok: true }>(ruta: string, cuerpo?: unknown) => pedir<T>('DELETE', ruta, cuerpo),
  /** Sube un archivo como cuerpo binario. */
  subir: <T>(ruta: string, archivo: Blob) => pedir<T>('POST', ruta, archivo, { 'Content-Type': archivo.type }),
};

export const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : 'Ocurrió un error inesperado');

/**
 * Carga datos de la API. Al recargar conserva los datos anteriores en pantalla
 * (sin parpadeos) hasta que llegan los nuevos.
 */
export function useDatos<T>(ruta: string | null) {
  const [estado, setEstado] = useState<{ datos: T | null; error: string | null; cargando: boolean }>({
    datos: null,
    error: null,
    cargando: ruta !== null,
  });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (ruta === null) return;
    let vigente = true;
    setEstado((e) => ({ ...e, cargando: true, error: null }));
    api.get<T>(ruta).then(
      (datos) => vigente && setEstado({ datos, error: null, cargando: false }),
      (e) => vigente && setEstado((s) => ({ datos: s.datos, error: mensajeDe(e), cargando: false })),
    );
    return () => {
      vigente = false;
    };
  }, [ruta, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  return { ...estado, recargar };
}
