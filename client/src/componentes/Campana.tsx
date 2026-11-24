import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Bell, BellRing, CalendarClock, CheckCheck, HandCoins, MailCheck, X } from 'lucide-react';
import { api } from '../api';
import { activarPush, estadoPush, motivoSinPush, type EstadoPush } from '../push';
import { fechaHoraRegistro } from '../formato';
import type { Aviso } from '../tipos';

// La campana de avisos: visitas agendadas, reprogramadas o canceladas, recordatorios de las visitas del día
// siguiente, ventas informadas por el usuario (y su registro) y resumen de las cartas de cobranza enviadas. Se actualiza sola cada minuto y al volver a la pestaña.
// Con los avisos push activados en el equipo, además llegan como aviso del sistema aunque el sistema esté cerrado.

const CADA = 60_000;
const CLAVE_ULTIMO = 'af:ultimo-aviso-del-sistema';

const soportaAvisosDelSistema = () => typeof window !== 'undefined' && 'Notification' in window;

async function avisoDelSistema(a: Aviso) {
  const opciones = { body: a.detalle, icon: '/logo-192.png', tag: `aviso-${a.id}`, data: { enlace: a.enlace || '/' } };
  try {
    // En el celular (app instalada) los avisos se muestran a través del service worker.
    const registro = await navigator.serviceWorker?.getRegistration();
    if (registro) await registro.showNotification(a.titulo, opciones);
    else new Notification(a.titulo, opciones);
  } catch {
    /* el navegador no lo permite: queda solo la campana */
  }
}

export function Campana({ claro = false }: { claro?: boolean }) {
  const navegar = useNavigate();
  const [datos, setDatos] = useState<{ no_leidos: number; avisos: Aviso[] } | null>(null);
  const [abierta, setAbierta] = useState(false);
  const [push, setPush] = useState<EstadoPush | null>(null);
  const [activando, setActivando] = useState(false);
  const [errorPush, setErrorPush] = useState<string | null>(null);
  const primeraCarga = useRef(true);
  const pushActivo = useRef(false);

  useEffect(() => {
    estadoPush().then((e) => { setPush(e); pushActivo.current = e === 'activo'; }).catch(() => setPush('no_soportado'));
  }, []);

  const cargar = useCallback(async () => {
    try {
      const d = await api.get<{ no_leidos: number; avisos: Aviso[] }>('/avisos');
      setDatos(d);
      // Avisos del sistema solo para los nuevos (no los que ya estaban al abrir la aplicación).
      const ultimo = Number(localStorage.getItem(CLAVE_ULTIMO) || 0);
      const nuevos = d.avisos.filter((a) => !a.leida_en && a.id > ultimo);
      const mayor = Math.max(ultimo, ...d.avisos.map((a) => a.id));
      // Con push activo, el aviso del sistema ya lo muestra el service worker: aquí no se repite.
      if (!primeraCarga.current && !pushActivo.current && soportaAvisosDelSistema() && Notification.permission === 'granted') {
        for (const a of nuevos.slice(0, 3).reverse()) await avisoDelSistema(a);
      }
      localStorage.setItem(CLAVE_ULTIMO, String(mayor));
      primeraCarga.current = false;
    } catch {
      /* sin conexión: se reintenta en el próximo ciclo */
    }
  }, []);

  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, CADA);
    const alVolver = () => document.visibilityState === 'visible' && cargar();
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [cargar]);

  async function marcarLeidos(ids?: number[]) {
    try {
      await api.post('/avisos/leidos', ids ? { ids } : {});
      await cargar();
    } catch {
      /* se reintenta al abrir de nuevo */
    }
  }

  async function abrir(a: Aviso) {
    setAbierta(false);
    if (!a.leida_en) marcarLeidos([a.id]);
    if (a.enlace) navegar(a.enlace);
  }

  async function activarEnEsteEquipo() {
    setActivando(true);
    try {
      const e = await activarPush();
      setPush(e);
      pushActivo.current = e === 'activo';
    } catch (e) {
      setErrorPush(e instanceof Error ? e.message : 'No se pudieron activar los avisos');
    } finally {
      setActivando(false);
    }
  }

  const n = datos?.no_leidos ?? 0;
  const Icono = n > 0 ? BellRing : Bell;

  return (
    <>
      <button
        onClick={() => setAbierta(!abierta)}
        aria-label={n > 0 ? `Avisos: ${n} sin leer` : 'Avisos'}
        title="Avisos"
        className={`relative rounded-lg p-2 ${claro ? 'text-white hover:bg-white/10' : 'text-marca-100 hover:bg-white/10 hover:text-white'}`}
      >
        <Icono className="size-5" />
        {n > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-4.5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-4.5 text-white tabular-nums">
            {n > 99 ? '99+' : n}
          </span>
        )}
      </button>

      {abierta && (
        <div className="fixed inset-0 z-50" onClick={() => setAbierta(false)}>
          <div
            role="dialog" aria-label="Avisos"
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-2 top-16 flex max-h-[75dvh] flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl lg:inset-x-auto lg:left-62 lg:top-3 lg:w-96"
          >
            <div className="flex items-center justify-between gap-2 border-b border-stone-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-stone-900">Avisos</h2>
              <div className="flex items-center gap-1">
                {n > 0 && (
                  <button onClick={() => marcarLeidos()} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-marca-700 hover:bg-marca-50">
                    <CheckCheck className="size-3.5" /> Marcar todo como leído
                  </button>
                )}
                <button onClick={() => setAbierta(false)} aria-label="Cerrar avisos" className="rounded-md p-1 text-stone-500 hover:bg-stone-100"><X className="size-4" /></button>
              </div>
            </div>
            <ul className="flex-1 divide-y divide-stone-100 overflow-y-auto">
              {!datos?.avisos.length && <li className="px-4 py-8 text-center text-sm text-stone-500">No hay avisos.</li>}
              {datos?.avisos.map((a) => {
                const Ico = a.tipo === 'cobranza' ? MailCheck : a.tipo.startsWith('venta_') ? HandCoins : CalendarClock;
                return (
                  <li key={a.id}>
                    <button onClick={() => abrir(a)} className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-stone-50 ${a.leida_en ? '' : 'bg-marca-50/60'}`}>
                      <Ico className={`mt-0.5 size-4 shrink-0 ${a.leida_en ? 'text-stone-400' : 'text-marca-700'}`} />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm ${a.leida_en ? 'text-stone-700' : 'font-semibold text-stone-900'}`}>{a.titulo}</span>
                        {a.detalle && <span className="mt-0.5 block text-xs text-stone-600">{a.detalle}</span>}
                        <span className="mt-1 block text-[11px] text-stone-400">{fechaHoraRegistro(a.creada_en)}</span>
                      </span>
                      {!a.leida_en && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-marca-600" aria-label="sin leer" />}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-stone-100 px-4 py-3 text-xs text-stone-600">
              {push === 'activo' && <>Avisos activos en este equipo: llegan aunque el sistema esté cerrado.</>}
              {push === 'inactivo' && (
                <>
                  <button onClick={activarEnEsteEquipo} disabled={activando} className="font-medium text-marca-700 hover:underline disabled:opacity-50">
                    {activando ? 'Activando…' : 'Activar avisos en este equipo'}
                  </button>
                  {' '}para recibirlos aunque el sistema esté cerrado.
                </>
              )}
              {push === 'bloqueado' && <>Los avisos están bloqueados en este navegador: permítalos en los permisos del sitio (el candado junto a la dirección).</>}
              {(push === 'no_soportado' || push === 'requiere_app') && <>{motivoSinPush()}</>}
              {errorPush && <span className="mt-1 block text-red-700">{errorPush}</span>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
