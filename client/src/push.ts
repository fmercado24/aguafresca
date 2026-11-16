import { api } from './api';

// Avisos push en este equipo: el navegador (o la app instalada en el celular) recibe los avisos del sistema
// aunque no esté abierto. Requiere https (o localhost) y, en iPhone, que la app esté agregada a la pantalla de inicio.

export type EstadoPush = 'no_soportado' | 'requiere_app' | 'bloqueado' | 'activo' | 'inactivo';

const esIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const instaladaComoApp = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function soportaPush() {
  return typeof window !== 'undefined' && window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** Por qué no se pueden activar en este equipo (o null si se puede). */
export function motivoSinPush(): string | null {
  if (!window.isSecureContext) return 'Para recibir avisos el sistema debe abrirse con una dirección segura (https://…), o en este mismo computador con http://localhost.';
  if (esIOS() && !instaladaComoApp()) return 'En iPhone, primero agregue el sistema a la pantalla de inicio (Compartir → Agregar a inicio) y ábralo desde ese ícono.';
  if (!soportaPush()) return 'Este navegador no permite avisos. Use Chrome, Edge, Firefox o Safari actualizados.';
  return null;
}

async function suscripcionActual() {
  const registro = await navigator.serviceWorker.getRegistration();
  return registro ? registro.pushManager.getSubscription() : null;
}

export async function estadoPush(): Promise<EstadoPush> {
  if (esIOS() && !instaladaComoApp()) return 'requiere_app';
  if (!soportaPush()) return 'no_soportado';
  if (Notification.permission === 'denied') return 'bloqueado';
  return (await suscripcionActual()) ? 'activo' : 'inactivo';
}

const deBase64Url = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

/** Nombre del equipo para reconocerlo en la lista (por ejemplo "Chrome en Android"). */
function nombreEquipo() {
  const ua = navigator.userAgent;
  const navegador = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  const sistema = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  return `${navegador}${sistema ? ` en ${sistema}` : ''}${instaladaComoApp() ? ' (app)' : ''}`;
}

/** Pide permiso, suscribe este equipo y lo registra en el servidor. */
export async function activarPush(): Promise<EstadoPush> {
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') return permiso === 'denied' ? 'bloqueado' : 'inactivo';
  const registro = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
  await navigator.serviceWorker.ready;
  const { publica } = await api.get<{ publica: string }>('/push/clave');
  let sub = await registro.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: deBase64Url(publica) });
    } catch {
      throw new Error('El navegador no pudo activar los avisos (su servicio de avisos no respondió). Revise la conexión a internet e intente de nuevo, o use Chrome, Edge o Firefox.');
    }
  }
  await api.post('/push/suscripcion', { suscripcion: sub.toJSON(), equipo: nombreEquipo() });
  return 'activo';
}

export async function desactivarPush(): Promise<EstadoPush> {
  const sub = await suscripcionActual();
  if (sub) {
    await api.del('/push/suscripcion', { endpoint: sub.endpoint }).catch(() => undefined);
    await sub.unsubscribe();
  }
  return 'inactivo';
}

/** Al iniciar sesión: si este equipo ya tenía avisos activados, se vuelve a registrar con la cuenta actual. */
export async function renovarPush() {
  if (!soportaPush() || Notification.permission !== 'granted') return;
  const sub = await suscripcionActual();
  if (sub) await api.post('/push/suscripcion', { suscripcion: sub.toJSON(), equipo: nombreEquipo() }).catch(() => undefined);
}

/** Al cerrar sesión: el servidor deja de enviar avisos a este equipo (la suscripción del navegador se conserva). */
export async function olvidarPushEnServidor() {
  if (!soportaPush()) return;
  const sub = await suscripcionActual().catch(() => null);
  if (sub) await api.del('/push/suscripcion', { endpoint: sub.endpoint }).catch(() => undefined);
}
