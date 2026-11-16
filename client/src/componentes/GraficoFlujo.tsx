import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { mesCorto, mesLargo, pesos, pesosCompacto, plural } from '../formato';
import type { MesFlujo } from '../tipos';

// Columnas apiladas de ingresos esperados por mes: capital (abajo) + interés (arriba).
// Un solo eje; marcas delgadas; rejilla tenue; leyenda siempre visible; detalle al pasar
// el cursor, al tocar o con las flechas del teclado. La tabla junto al gráfico entrega los mismos valores.

const ALTO = 250;
const MARGEN = { arriba: 10, derecha: 8, abajo: 26, izquierda: 56 };
const MAX_ANCHO_BARRA = 24;
const SEPARACION = 2;
const ANCHO_DETALLE = 208;

function escalaLimpia(maximo: number) {
  if (maximo <= 0) return { paso: 1, tope: 1 };
  const bruto = maximo / 4;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= bruto) ?? bruto;
  return { paso, tope: Math.ceil(maximo / paso) * paso };
}

/** Rectángulo con las esquinas superiores redondeadas (el extremo "de dato" de la columna). */
function columna(x: number, y: number, ancho: number, alto: number, redondeo: number) {
  const r = Math.max(0, Math.min(redondeo, ancho / 2, alto));
  return `M${x},${y + alto} V${y + r} Q${x},${y} ${x + r},${y} H${x + ancho - r} Q${x + ancho},${y} ${x + ancho},${y + r} V${y + alto} Z`;
}

export function GraficoFlujo({ meses }: { meses: MesFlujo[] }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);
  const [activo, setActivo] = useState<number | null>(null);

  useEffect(() => {
    const el = contenedor.current;
    if (!el) return;
    const observador = new ResizeObserver(([entrada]) => setAncho(Math.floor(entrada.contentRect.width)));
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  const anchoGrafico = Math.max(0, ancho - MARGEN.izquierda - MARGEN.derecha);
  const altoGrafico = ALTO - MARGEN.arriba - MARGEN.abajo;
  const { paso, tope } = escalaLimpia(Math.max(0, ...meses.map((m) => m.total)));
  const banda = meses.length ? anchoGrafico / meses.length : 0;
  const anchoBarra = Math.max(1, Math.min(MAX_ANCHO_BARRA, banda - SEPARACION, banda * 0.7));
  const y = (valor: number) => MARGEN.arriba + altoGrafico - (valor / tope) * altoGrafico;
  const marcas = Array.from({ length: Math.round(tope / paso) + 1 }, (_, i) => i * paso);

  // Etiquetas del eje X: solo las que caben sin encimarse.
  const cadaCuantos = Math.max(1, Math.ceil(64 / Math.max(banda, 1)));

  function alTeclear(e: KeyboardEvent) {
    if (!meses.length) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const delta = e.key === 'ArrowRight' ? 1 : -1;
      setActivo((i) => Math.max(0, Math.min(meses.length - 1, (i ?? (delta > 0 ? -1 : meses.length)) + delta)));
    } else if (e.key === 'Escape') {
      setActivo(null);
    }
  }

  const mes = activo !== null ? meses[activo] : null;
  const centroActivo = activo !== null ? MARGEN.izquierda + banda * (activo + 0.5) : 0;
  // El recuadro de detalle va al lado de la columna activa, sin salirse nunca del gráfico.
  const alLado = centroActivo > ancho / 2 ? centroActivo - banda / 2 - 6 - ANCHO_DETALLE : centroActivo + banda / 2 + 6;
  const izquierdaDetalle = Math.max(0, Math.min(ancho - ANCHO_DETALLE, alLado));

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-600">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-xs" style={{ background: 'var(--viz-serie-1)' }} />Capital</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-xs" style={{ background: 'var(--viz-serie-2)' }} />Interés</span>
      </div>
      <div
        ref={contenedor}
        className="relative rounded-lg outline-offset-4 focus-visible:outline-2 focus-visible:outline-marca-500"
        style={{ height: ALTO }}
        tabIndex={0}
        role="group"
        aria-label="Gráfico de ingresos esperados por mes. Use las flechas izquierda y derecha para recorrer los meses."
        onKeyDown={alTeclear}
        onBlur={() => setActivo(null)}
        onPointerLeave={() => setActivo(null)}
      >
        {ancho > 0 && (
          <svg width={ancho} height={ALTO} className="block" aria-hidden="true">
            {marcas.map((v) => (
              <g key={v}>
                <line x1={MARGEN.izquierda} x2={ancho - MARGEN.derecha} y1={y(v)} y2={y(v)} stroke={v === 0 ? 'var(--viz-eje)' : 'var(--viz-rejilla)'} strokeWidth={1} shapeRendering="crispEdges" />
                <text x={MARGEN.izquierda - 8} y={y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--viz-tenue)" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {v === 0 ? '$0' : pesosCompacto(v)}
                </text>
              </g>
            ))}

            {meses.map((m, i) => {
              const x0 = MARGEN.izquierda + banda * i;
              const x = x0 + (banda - anchoBarra) / 2;
              const yCapital = y(m.capital);
              const altoCapital = y(0) - yCapital;
              const altoInteres = yCapital - y(m.total);
              const hayInteres = altoInteres > SEPARACION + 0.5;
              return (
                <g key={m.mes}>
                  {activo === i && <rect x={x0} y={MARGEN.arriba} width={banda} height={altoGrafico} fill="var(--viz-tinta)" opacity={0.05} />}
                  {altoCapital > 0 && <path d={columna(x, yCapital, anchoBarra, altoCapital, hayInteres ? 0 : 4)} fill="var(--viz-serie-1)" />}
                  {hayInteres && <path d={columna(x, y(m.total), anchoBarra, altoInteres - SEPARACION, 4)} fill="var(--viz-serie-2)" />}
                  {i % cadaCuantos === 0 && (
                    <text x={x0 + banda / 2} y={ALTO - 8} textAnchor="middle" fontSize={11} fill="var(--viz-tenue)">
                      {m.mes.endsWith('-01') || i === 0 ? mesCorto(m.mes) : mesCorto(m.mes).slice(0, 3)}
                    </text>
                  )}
                  {/* Zona sensible: toda la franja del mes, no solo la barra */}
                  <rect
                    x={x0} y={MARGEN.arriba} width={banda} height={altoGrafico + MARGEN.abajo} fill="transparent"
                    onPointerEnter={() => setActivo(i)} onPointerDown={() => setActivo(i)}
                  />
                </g>
              );
            })}
          </svg>
        )}

        {mes && (
          <div
            role="status"
            className="pointer-events-none absolute top-2 z-10 rounded-lg border border-stone-200 bg-white p-3 text-xs shadow-lg"
            style={{ left: izquierdaDetalle, width: Math.min(ANCHO_DETALLE, ancho) }}
          >
            <div className="text-stone-500">{mesLargo(mes.mes)}</div>
            <div className="mt-0.5 text-base font-semibold text-stone-900">{pesos(mes.total)}</div>
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-stone-500"><span className="h-0.5 w-3 rounded" style={{ background: 'var(--viz-serie-1)' }} />Capital</span>
                <span className="font-medium tabular-nums text-stone-900">{pesos(mes.capital)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-stone-500"><span className="h-0.5 w-3 rounded" style={{ background: 'var(--viz-serie-2)' }} />Interés</span>
                <span className="font-medium tabular-nums text-stone-900">{pesos(mes.interes)}</span>
              </div>
            </div>
            <div className="mt-2 border-t border-stone-100 pt-1.5 text-stone-500">{plural(mes.n, 'cuota')} por vencer</div>
          </div>
        )}
      </div>
    </div>
  );
}
