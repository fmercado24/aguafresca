import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import {
  CalendarDays, Calculator, CircleDollarSign, FileText, HandCoins, LayoutDashboard, LogOut, Map as IconoMapa, Menu,
  Settings, Users, X,
} from 'lucide-react';
import { useConfig, useSesion } from './contexto';

const SECCIONES = [
  { a: '/', etiqueta: 'Inicio', icono: LayoutDashboard },
  { a: '/parcelas', etiqueta: 'Parcelas', icono: IconoMapa },
  { a: '/clientes', etiqueta: 'Clientes', icono: Users },
  { a: '/ventas', etiqueta: 'Ventas', icono: HandCoins },
  { a: '/cobranza', etiqueta: 'Cobranza', icono: CircleDollarSign },
  { a: '/cotizaciones', etiqueta: 'Cotizaciones', icono: Calculator },
  { a: '/visitas', etiqueta: 'Visitas', icono: CalendarDays },
  { a: '/documentos', etiqueta: 'Documentos', icono: FileText },
  { a: '/configuracion', etiqueta: 'Configuración', icono: Settings },
];

// En el celular, las cuatro secciones de uso más frecuente van en la barra inferior.
const BARRA_INFERIOR = ['/', '/parcelas', '/ventas', '/cobranza'];

function Marca() {
  const config = useConfig();
  return (
    <div className="flex items-center gap-2.5">
      <img src="/icono.svg" alt="" className="size-9 rounded-lg" />
      <div className="min-w-0 leading-tight">
        <div className="truncate text-sm font-semibold text-white">{config.proyecto.nombre}</div>
        <div className="truncate text-xs text-marca-200">{config.empresa.razon_social}</div>
      </div>
    </div>
  );
}

function Menu_({ alNavegar }: { alNavegar?: () => void }) {
  const { usuario, salir } = useSesion();
  return (
    <div className="flex h-full flex-col">
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3" aria-label="Secciones">
        {SECCIONES.map(({ a, etiqueta, icono: Ico }) => (
          <NavLink
            key={a}
            to={a}
            end={a === '/'}
            onClick={alNavegar}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? 'bg-white/15 text-white' : 'text-marca-100 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            <Ico className="size-[18px] shrink-0" />
            {etiqueta}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 px-3 py-3">
        <div className="flex items-center gap-2 px-2">
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-medium text-white">{usuario?.nombre}</div>
            <div className="truncate text-xs text-marca-200">{usuario?.perfil} · {usuario?.usuario}</div>
          </div>
          <button onClick={salir} title="Cerrar sesión" aria-label="Cerrar sesión" className="rounded-lg p-2 text-marca-100 hover:bg-white/10 hover:text-white">
            <LogOut className="size-[18px]" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function Disposicion() {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    setMenuAbierto(false);
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="min-h-dvh lg:pl-60">
      {/* Computador: barra lateral fija */}
      <aside className="no-imprimir fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-marca-800 lg:flex">
        <div className="px-4 py-4"><Marca /></div>
        <Menu_ />
      </aside>

      {/* Celular: barra superior */}
      <header className="no-imprimir sticky top-0 z-30 flex items-center justify-between bg-marca-800 px-4 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] lg:hidden">
        <Marca />
        <button onClick={() => setMenuAbierto(true)} aria-label="Abrir menú" className="rounded-lg p-2 text-white hover:bg-white/10">
          <Menu className="size-6" />
        </button>
      </header>

      {/* Celular: menú completo deslizable */}
      {menuAbierto && (
        <div className="no-imprimir fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-stone-900/50" onClick={() => setMenuAbierto(false)} />
          <div className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col bg-marca-800 pt-[env(safe-area-inset-top)] shadow-xl">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-semibold text-white">Menú</span>
              <button onClick={() => setMenuAbierto(false)} aria-label="Cerrar menú" className="rounded-lg p-2 text-white hover:bg-white/10">
                <X className="size-5" />
              </button>
            </div>
            <Menu_ alNavegar={() => setMenuAbierto(false)} />
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-7 print:max-w-none print:p-0">
        <Outlet />
      </main>

      {/* Celular: barra inferior */}
      <nav className="no-imprimir fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Accesos rápidos">
        {SECCIONES.filter((s) => BARRA_INFERIOR.includes(s.a)).map(({ a, etiqueta, icono: Ico }) => (
          <NavLink
            key={a}
            to={a}
            end={a === '/'}
            className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-marca-700' : 'text-stone-500'}`}
          >
            <Ico className="size-5" />
            {etiqueta}
          </NavLink>
        ))}
        <button onClick={() => setMenuAbierto(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-stone-500">
          <Menu className="size-5" />
          Más
        </button>
      </nav>
    </div>
  );
}
