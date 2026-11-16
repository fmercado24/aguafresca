import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, X } from 'lucide-react';
import { api, EVENTO_SESION_VENCIDA, mensajeDe } from './api';
import type { Config, Permiso, Usuario } from './tipos';
import { Boton, Modal } from './ui';

// ---------- Sesión y configuración ----------

interface Sesion {
  usuario: Usuario | null;
  config: Config | null;
  /** ¿La cuenta actual tiene este permiso? (las funciones básicas las tienen todas) */
  puede: (permiso: Permiso) => boolean;
  iniciando: boolean;
  ingresar: (usuario: string, password: string) => Promise<void>;
  salir: () => Promise<void>;
  recargarConfig: () => Promise<void>;
}

const ContextoSesion = createContext<Sesion | null>(null);

export function useSesion(): Sesion {
  const s = useContext(ContextoSesion);
  if (!s) throw new Error('useSesion fuera de ProveedorSesion');
  return s;
}

/** Configuración ya cargada (dentro de la aplicación siempre existe). */
export function useConfig(): Config {
  const { config } = useSesion();
  if (!config) throw new Error('La configuración aún no está cargada');
  return config;
}

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [iniciando, setIniciando] = useState(true);

  const recargarConfig = useCallback(async () => setConfig(await api.get<Config>('/config')), []);

  useEffect(() => {
    (async () => {
      try {
        const u = await api.get<Usuario>('/auth/yo');
        await recargarConfig();
        setUsuario(u);
      } catch {
        setUsuario(null);
      } finally {
        setIniciando(false);
      }
    })();
    const vencida = () => setUsuario(null);
    window.addEventListener(EVENTO_SESION_VENCIDA, vencida);
    return () => window.removeEventListener(EVENTO_SESION_VENCIDA, vencida);
  }, [recargarConfig]);

  const valor = useMemo<Sesion>(
    () => ({
      usuario,
      config,
      iniciando,
      puede: (permiso) => !!usuario?.permisos.includes(permiso),
      async ingresar(nombreUsuario, password) {
        const u = await api.post<Usuario>('/auth/login', { usuario: nombreUsuario, password });
        await recargarConfig();
        setUsuario(u);
      },
      async salir() {
        await api.post('/auth/logout').catch(() => undefined);
        setUsuario(null);
      },
      recargarConfig,
    }),
    [usuario, config, iniciando, recargarConfig],
  );

  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>;
}

// ---------- Avisos breves (éxito / error) y confirmaciones ----------

interface Aviso {
  id: number;
  tipo: 'ok' | 'error';
  texto: string;
}

interface OpcionesConfirmar {
  titulo: string;
  mensaje?: ReactNode;
  confirmar?: string;
  peligro?: boolean;
}

interface Avisos {
  ok: (texto: string) => void;
  error: (e: unknown) => void;
  confirmar: (opciones: OpcionesConfirmar) => Promise<boolean>;
}

const ContextoAvisos = createContext<Avisos | null>(null);

export function useAvisos(): Avisos {
  const a = useContext(ContextoAvisos);
  if (!a) throw new Error('useAvisos fuera de ProveedorAvisos');
  return a;
}

export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [pregunta, setPregunta] = useState<(OpcionesConfirmar & { resolver: (v: boolean) => void }) | null>(null);
  const siguiente = useRef(1);

  const quitar = useCallback((id: number) => setAvisos((l) => l.filter((a) => a.id !== id)), []);
  const agregar = useCallback(
    (tipo: Aviso['tipo'], texto: string) => {
      const id = siguiente.current++;
      setAvisos((l) => [...l.slice(-3), { id, tipo, texto }]);
      setTimeout(() => quitar(id), tipo === 'ok' ? 3500 : 7000);
    },
    [quitar],
  );

  const valor = useMemo<Avisos>(
    () => ({
      ok: (texto) => agregar('ok', texto),
      error: (e) => agregar('error', typeof e === 'string' ? e : mensajeDe(e)),
      confirmar: (opciones) => new Promise<boolean>((resolver) => setPregunta({ ...opciones, resolver })),
    }),
    [agregar],
  );

  const responder = (v: boolean) => {
    pregunta?.resolver(v);
    setPregunta(null);
  };

  return (
    <ContextoAvisos.Provider value={valor}>
      {children}
      <div className="no-imprimir pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex flex-col items-center gap-2 px-4 lg:inset-x-auto lg:bottom-auto lg:right-4 lg:top-4 lg:items-end lg:px-0" aria-live="polite">
        {avisos.map((a) => (
          <div
            key={a.id}
            role={a.tipo === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex max-w-md items-start gap-2 rounded-xl px-4 py-3 text-sm text-white shadow-lg ${a.tipo === 'ok' ? 'bg-stone-800' : 'bg-red-700'}`}
          >
            {a.tipo === 'ok' ? <CircleCheck className="mt-0.5 size-4 shrink-0" /> : <CircleAlert className="mt-0.5 size-4 shrink-0" />}
            <span>{a.texto}</span>
            <button onClick={() => quitar(a.id)} className="-mr-1 ml-1 rounded p-0.5 opacity-70 hover:opacity-100" aria-label="Cerrar aviso">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
      <Modal
        abierto={!!pregunta}
        alCerrar={() => responder(false)}
        titulo={pregunta?.titulo ?? ''}
        ancho="sm"
        pie={
          <>
            <Boton variante="secundario" onClick={() => responder(false)}>Cancelar</Boton>
            <Boton variante={pregunta?.peligro ? 'peligro' : 'primario'} onClick={() => responder(true)} autoFocus>
              {pregunta?.confirmar ?? 'Aceptar'}
            </Boton>
          </>
        }
      >
        {pregunta?.mensaje && <div className="text-sm text-stone-600">{pregunta.mensaje}</div>}
      </Modal>
    </ContextoAvisos.Provider>
  );
}
