// Componentes de interfaz compartidos por todas las pantallas.
import {
  useEffect, useState, type ButtonHTMLAttributes, type ComponentType, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Link, type LinkProps } from 'react-router';
import {
  ArrowLeft, BadgeCheck, Ban, CircleAlert, CircleCheck, CircleDashed, CircleX, Clock, Hourglass, LoaderCircle,
  Search, TriangleAlert, X,
} from 'lucide-react';
import { analizarTelefono, errorTelefono, formatearRut, miles, rutValido } from './formato';
import type { EstadoCotizacion, EstadoCuota, EstadoParcela, EstadoVenta, EstadoVisita } from './tipos';

type Icono = ComponentType<{ className?: string }>;

// ---------- Botones ----------

type Variante = 'primario' | 'secundario' | 'fantasma' | 'peligro';

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-marca-600 text-white shadow-xs hover:bg-marca-700 active:bg-marca-800',
  secundario: 'border border-stone-300 bg-white text-stone-800 shadow-xs hover:bg-stone-50 active:bg-stone-100',
  fantasma: 'text-stone-600 hover:bg-stone-200/70 active:bg-stone-200',
  peligro: 'bg-red-600 text-white shadow-xs hover:bg-red-700 active:bg-red-800',
};

const claseBoton = (variante: Variante, chico?: boolean) =>
  `inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors
   focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca-500
   disabled:cursor-not-allowed disabled:opacity-50 ${chico ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm'} ${VARIANTES[variante]}`;

interface PropsBoton extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  chico?: boolean;
  icono?: Icono;
  cargando?: boolean;
}

export function Boton({ variante = 'primario', chico, icono: Ico, cargando, children, className = '', disabled, type = 'button', ...props }: PropsBoton) {
  return (
    <button type={type} disabled={disabled || cargando} className={`${claseBoton(variante, chico)} ${className}`} {...props}>
      {cargando ? <LoaderCircle className="size-4 animate-spin" /> : Ico && <Ico className={chico ? 'size-3.5' : 'size-4'} />}
      {children}
    </button>
  );
}

export function EnlaceBoton({ variante = 'primario', chico, icono: Ico, children, className = '', ...props }: LinkProps & { variante?: Variante; chico?: boolean; icono?: Icono }) {
  return (
    <Link className={`${claseBoton(variante, chico)} ${className}`} {...props}>
      {Ico && <Ico className={chico ? 'size-3.5' : 'size-4'} />}
      {children}
    </Link>
  );
}

// ---------- Formularios ----------

// text-base en celular evita que iOS haga zoom al enfocar el campo.
export const claseEntrada =
  'block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 shadow-xs placeholder:text-stone-400 ' +
  'focus:border-marca-500 focus:outline-none focus:ring-2 focus:ring-marca-500/25 disabled:bg-stone-100 disabled:text-stone-500 sm:text-sm';

export function Campo({ etiqueta, ayuda, children, className = '' }: { etiqueta: string; ayuda?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-stone-600">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-1 block text-xs text-stone-500">{ayuda}</span>}
    </label>
  );
}

export function Entrada({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${claseEntrada} ${className}`} {...props} />;
}

export function Selector({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${claseEntrada} pr-8 ${className}`} {...props}>
      {children}
    </select>
  );
}

export function AreaTexto({ className = '', rows = 3, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} className={`${claseEntrada} ${className}`} {...props} />;
}

/** Campo de monto en pesos: muestra separador de miles mientras se escribe. */
export function EntradaMonto({ valor, alCambiar, className = '', ...props }: {
  valor: number | null;
  alCambiar: (n: number | null) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-stone-400">$</span>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className={`${claseEntrada} pl-7 tabular-nums ${className}`}
        value={valor === null ? '' : miles(valor)}
        onChange={(e) => {
          const digitos = e.target.value.replace(/\D/g, '').slice(0, 13);
          alCambiar(digitos === '' ? null : Number(digitos));
        }}
        {...props}
      />
    </div>
  );
}

const claseError = '!border-red-500 focus:!ring-red-500/25';

/** RUT: solo números, puntos, guion y K; al salir del campo se ordena (12.345.678-9) y se revisa el dígito verificador. */
export function EntradaRut({ valor, alCambiar, className = '', onBlur, ...props }: {
  valor: string;
  alCambiar: (v: string) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  const [tocado, setTocado] = useState(false);
  const malo = tocado && valor.trim() !== '' && !rutValido(valor);
  return (
    <>
      <input
        type="text" autoComplete="off" spellCheck={false} maxLength={12} placeholder="12.345.678-9"
        aria-invalid={malo || undefined}
        className={`${claseEntrada} ${malo ? claseError : ''} ${className}`}
        value={valor}
        onChange={(e) => alCambiar(e.target.value.replace(/[^0-9kK.-]/g, '').toUpperCase())}
        onBlur={(e) => { setTocado(true); if (rutValido(valor)) alCambiar(formatearRut(valor)); onBlur?.(e); }}
        {...props}
      />
      {malo && <span className="mt-1 block text-xs text-red-700">RUT inválido: revise el dígito verificador</span>}
    </>
  );
}

/** Teléfono: solo números, +, espacios; al salir del campo se ordena (+56 9 1234 5678). Con `movil`, exige celular. */
export function EntradaTelefono({ valor, alCambiar, movil = false, className = '', onBlur, ...props }: {
  valor: string;
  alCambiar: (v: string) => void;
  movil?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  const [tocado, setTocado] = useState(false);
  const error = tocado ? errorTelefono(valor, movil) : null;
  return (
    <>
      <input
        type="tel" inputMode="tel" autoComplete="tel" maxLength={18} placeholder="+56 9 1234 5678"
        aria-invalid={!!error || undefined}
        className={`${claseEntrada} ${error ? claseError : ''} ${className}`}
        value={valor}
        onChange={(e) => alCambiar(e.target.value.replace(/[^\d+\s]/g, '').replace(/(?!^)\+/g, ''))}
        onBlur={(e) => {
          setTocado(true);
          const t = analizarTelefono(valor);
          if (t && t.valor && !errorTelefono(valor, movil)) alCambiar(t.valor);
          onBlur?.(e);
        }}
        {...props}
      />
      {error && <span className="mt-1 block text-xs text-red-700">{error}</span>}
    </>
  );
}

/** Número entero: no admite letras ni signos (con `negativos`, el signo menos al comienzo). */
export function EntradaEntero({ valor, alCambiar, negativos = false, className = '', ...props }: {
  valor: string;
  alCambiar: (v: string) => void;
  negativos?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  return (
    <input
      type="text" inputMode="numeric" autoComplete="off"
      className={`${claseEntrada} tabular-nums ${className}`}
      value={valor}
      onChange={(e) => {
        const v = e.target.value;
        const signo = negativos && v.trim().startsWith('-') ? '-' : '';
        alCambiar(signo + v.replace(/\D/g, '').slice(0, 9));
      }}
      {...props}
    />
  );
}

/** Número con decimales: se escribe con coma (1,5) y se entrega con punto ("1.5"). Sin letras. */
export function EntradaDecimal({ valor, alCambiar, decimales = 2, className = '', ...props }: {
  valor: string;
  alCambiar: (v: string) => void;
  decimales?: number;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  return (
    <input
      type="text" inputMode="decimal" autoComplete="off"
      className={`${claseEntrada} tabular-nums ${className}`}
      value={valor.replace('.', ',')}
      onChange={(e) => {
        const limpio = e.target.value.replace(/\./g, ',').replace(/[^\d,]/g, '');
        const [entera, ...resto] = limpio.split(',');
        const dec = resto.join('').slice(0, decimales);
        alCambiar(resto.length ? `${entera.slice(0, 9)}.${dec}` : entera.slice(0, 9));
      }}
      {...props}
    />
  );
}

export function Casilla({ etiqueta, className = '', ...props }: { etiqueta: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`flex items-start gap-2 text-sm text-stone-700 ${className}`}>
      <input type="checkbox" className="mt-0.5 size-4 rounded border-stone-300 accent-marca-600" {...props} />
      <span>{etiqueta}</span>
    </label>
  );
}

export function Buscador({ valor, alCambiar, placeholder = 'Buscar…', className = '' }: { valor: string; alCambiar: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
      <input type="search" value={valor} onChange={(e) => alCambiar(e.target.value)} placeholder={placeholder} aria-label={placeholder} className={`${claseEntrada} pl-9`} />
    </div>
  );
}

// ---------- Contenedores ----------

const ANCHOS = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl' };

export function Modal({ abierto, alCerrar, titulo, children, pie, ancho = 'md' }: {
  abierto: boolean;
  alCerrar: () => void;
  titulo: string;
  children?: ReactNode;
  pie?: ReactNode;
  ancho?: keyof typeof ANCHOS;
}) {
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && alCerrar();
    document.addEventListener('keydown', alTeclear);
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', alTeclear);
      document.body.style.overflow = previo;
    };
  }, [abierto, alCerrar]);

  if (!abierto) return null;
  // Se dibuja directamente en <body> para no quedar anidado dentro de otro formulario, y se frena
  // la propagación para que un clic o un envío dentro del diálogo no active la pantalla de atrás.
  return createPortal(
    <div
      className="no-imprimir fixed inset-0 z-50 flex items-end justify-center bg-stone-900/50 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && alCerrar()}
      onClick={(e) => e.stopPropagation()}
      onSubmit={(e) => e.stopPropagation()}
    >
      <div role="dialog" aria-modal="true" aria-label={titulo} className={`flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl ${ANCHOS[ancho]}`}>
        <div className="flex items-center justify-between gap-4 border-b border-stone-200 px-5 py-3.5">
          <h2 className="text-base font-semibold text-stone-900">{titulo}</h2>
          <button onClick={alCerrar} aria-label="Cerrar" className="-mr-1.5 rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-800">
            <X className="size-5" />
          </button>
        </div>
        {children && <div className="overflow-y-auto px-5 py-4">{children}</div>}
        {pie && <div className="flex flex-wrap justify-end gap-2 border-t border-stone-200 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{pie}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Tarjeta({ titulo, acciones, children, className = '', relleno = true }: {
  titulo?: ReactNode;
  acciones?: ReactNode;
  children: ReactNode;
  className?: string;
  relleno?: boolean;
}) {
  return (
    <section className={`rounded-xl border border-stone-200 bg-white shadow-xs ${className}`}>
      {(titulo || acciones) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-stone-800">{titulo}</h2>
          {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
        </header>
      )}
      <div className={relleno ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

export function Encabezado({ titulo, descripcion, volver, children }: {
  titulo: ReactNode;
  descripcion?: ReactNode;
  volver?: { a: string; texto: string };
  children?: ReactNode;
}) {
  return (
    <div className="no-imprimir mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {volver && (
          <Link to={volver.a} className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-stone-800">
            <ArrowLeft className="size-3.5" />
            {volver.texto}
          </Link>
        )}
        <h1 className="text-xl font-semibold tracking-tight text-stone-900 sm:text-2xl">{titulo}</h1>
        {descripcion && <div className="mt-0.5 text-sm text-stone-500">{descripcion}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Pestanas<T extends string>({ opciones, activa, alCambiar }: {
  opciones: { id: T; etiqueta: string; cuenta?: number }[];
  activa: T;
  alCambiar: (id: T) => void;
}) {
  return (
    <div className="no-imprimir -mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div role="tablist" className="flex min-w-max gap-1 border-b border-stone-200">
        {opciones.map((o) => (
          <button
            key={o.id}
            role="tab"
            aria-selected={activa === o.id}
            onClick={() => alCambiar(o.id)}
            className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              activa === o.id ? 'border-marca-600 text-marca-700' : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            {o.etiqueta}
            {o.cuenta !== undefined && o.cuenta > 0 && (
              <span className={`rounded-full px-1.5 text-xs tabular-nums ${activa === o.id ? 'bg-marca-100 text-marca-800' : 'bg-stone-200 text-stone-600'}`}>{o.cuenta}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Cifra destacada (KPI). El valor va siempre en tinta normal; el estado se indica con ícono y texto. */
export function Dato({ etiqueta, valor, detalle }: { etiqueta: string; valor: ReactNode; detalle?: ReactNode }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
      <div className="text-xs font-medium text-stone-500">{etiqueta}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight text-stone-900 sm:text-2xl">{valor}</div>
      {detalle && <div className="mt-1 text-xs text-stone-500">{detalle}</div>}
    </div>
  );
}

export function Par({ etiqueta, children }: { etiqueta: string; children?: ReactNode }) {
  const vacio = children === null || children === undefined || children === '';
  return (
    <div className="min-w-0">
      <dt className="text-xs text-stone-500">{etiqueta}</dt>
      <dd className="mt-0.5 whitespace-pre-line break-words text-sm text-stone-900">{vacio ? '—' : children}</dd>
    </div>
  );
}

// ---------- Estados de carga ----------

export function Cargando() {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-stone-500" role="status">
      <LoaderCircle className="size-5 animate-spin" />
      Cargando…
    </div>
  );
}

export function ErrorCarga({ mensaje, reintentar }: { mensaje: string; reintentar?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-14 text-center" role="alert">
      <CircleAlert className="size-8 text-red-600" />
      <p className="max-w-sm text-sm text-stone-700">{mensaje}</p>
      {reintentar && <Boton variante="secundario" onClick={reintentar}>Reintentar</Boton>}
    </div>
  );
}

export function Vacio({ icono: Ico, titulo, children, accion }: { icono?: Icono; titulo: string; children?: ReactNode; accion?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      {Ico && <Ico className="size-9 text-stone-300" />}
      <p className="text-sm font-medium text-stone-700">{titulo}</p>
      {children && <p className="max-w-sm text-sm text-stone-500">{children}</p>}
      {accion && <div className="mt-2">{accion}</div>}
    </div>
  );
}

/** Muestra el resultado de useDatos: espera, error o contenido. Al recargar mantiene lo anterior atenuado. */
export function Carga<T>({ consulta, children }: {
  consulta: { datos: T | null; error: string | null; cargando: boolean; recargar: () => void };
  children: (datos: T) => ReactNode;
}) {
  if (consulta.datos === null) {
    return consulta.error ? <ErrorCarga mensaje={consulta.error} reintentar={consulta.recargar} /> : <Cargando />;
  }
  return <div className={`transition-opacity delay-150 ${consulta.cargando ? 'opacity-60' : ''}`}>{children(consulta.datos)}</div>;
}

// ---------- Tablas ----------

export const th = 'whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-stone-500';
export const td = 'px-3 py-2.5 text-sm text-stone-800';
export const num = 'text-right tabular-nums';

export function Tabla({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    // "relative": los textos solo para lectores de pantalla quedan contenidos y no ensanchan la página.
    <div className="relative overflow-x-auto">
      <table className={`w-full border-collapse [&_tbody_tr]:border-t [&_tbody_tr]:border-stone-100 [&_tfoot_tr]:border-t [&_tfoot_tr]:border-stone-200 ${className}`}>{children}</table>
    </div>
  );
}

// ---------- Insignias de estado (siempre ícono + texto, nunca solo color) ----------

const TONOS = {
  verde: 'bg-green-50 text-green-800 ring-green-600/25',
  ambar: 'bg-amber-50 text-amber-900 ring-amber-600/30',
  rojo: 'bg-red-50 text-red-800 ring-red-600/25',
  gris: 'bg-stone-100 text-stone-700 ring-stone-500/25',
  azul: 'bg-marca-50 text-marca-800 ring-marca-600/25',
};

export function Insignia({ tono = 'gris', icono: Ico, children }: { tono?: keyof typeof TONOS; icono?: Icono; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONOS[tono]}`}>
      {Ico && <Ico className="size-3" />}
      {children}
    </span>
  );
}

export const ESTADOS_PARCELA: Record<EstadoParcela, { etiqueta: string; tono: keyof typeof TONOS; icono: Icono }> = {
  disponible: { etiqueta: 'Disponible', tono: 'verde', icono: CircleCheck },
  reservada: { etiqueta: 'Reservada', tono: 'ambar', icono: Clock },
  vendida: { etiqueta: 'Vendida', tono: 'gris', icono: BadgeCheck },
  bloqueada: { etiqueta: 'No disponible', tono: 'gris', icono: Ban },
};

export function InsigniaParcela({ estado }: { estado: EstadoParcela }) {
  const e = ESTADOS_PARCELA[estado];
  return <Insignia tono={e.tono} icono={e.icono}>{e.etiqueta}</Insignia>;
}

export function InsigniaCuota({ estado, dias }: { estado: EstadoCuota; dias?: number }) {
  if (estado === 'pagada') return <Insignia tono="verde" icono={CircleCheck}>Pagada</Insignia>;
  if (estado === 'atrasada') return <Insignia tono="rojo" icono={TriangleAlert}>{dias ? `Atrasada · ${dias} d` : 'Atrasada'}</Insignia>;
  if (estado === 'parcial') return <Insignia tono="ambar" icono={CircleDashed}>Abono parcial</Insignia>;
  return <Insignia icono={Clock}>Por vencer</Insignia>;
}

export function InsigniaVenta({ estado, atrasadas = 0 }: { estado: EstadoVenta; atrasadas?: number }) {
  if (estado === 'anulada') return <Insignia icono={Ban}>Anulada</Insignia>;
  if (estado === 'pagada') return <Insignia tono="verde" icono={CircleCheck}>Pagada</Insignia>;
  if (atrasadas > 0) return <Insignia tono="rojo" icono={TriangleAlert}>{atrasadas === 1 ? '1 cuota atrasada' : `${atrasadas} cuotas atrasadas`}</Insignia>;
  return <Insignia tono="azul" icono={CircleCheck}>Al día</Insignia>;
}

export const ESTADOS_VISITA: Record<EstadoVisita, { etiqueta: string; tono: keyof typeof TONOS; icono: Icono }> = {
  programada: { etiqueta: 'Programada', tono: 'azul', icono: Clock },
  confirmada: { etiqueta: 'Confirmada', tono: 'verde', icono: CircleCheck },
  realizada: { etiqueta: 'Realizada', tono: 'gris', icono: BadgeCheck },
  cancelada: { etiqueta: 'Cancelada', tono: 'gris', icono: Ban },
  no_asistio: { etiqueta: 'No asistió', tono: 'ambar', icono: CircleX },
};

export function InsigniaVisita({ estado }: { estado: EstadoVisita }) {
  const e = ESTADOS_VISITA[estado];
  return <Insignia tono={e.tono} icono={e.icono}>{e.etiqueta}</Insignia>;
}

export function InsigniaCotizacion({ estado, vencida }: { estado: EstadoCotizacion; vencida?: boolean }) {
  if (estado === 'aceptada') return <Insignia tono="verde" icono={CircleCheck}>Aceptada</Insignia>;
  if (estado === 'rechazada') return <Insignia icono={Ban}>Rechazada</Insignia>;
  if (vencida) return <Insignia tono="ambar" icono={Hourglass}>Vencida</Insignia>;
  return <Insignia tono="azul" icono={Clock}>Vigente</Insignia>;
}
