import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as EventoPuntero } from 'react';
import { LocateFixed, Map as IconoPlano, Maximize, Satellite, ZoomIn, ZoomOut } from 'lucide-react';
import { useDatos } from '../api';
import { numero, precioLista } from '../formato';
import type { ClaseFondo, EstadoParcela, FondoPlano, Parcela, Plano, Punto } from '../tipos';
import { ESTADOS_PARCELA } from '../ui';

// Mapa interactivo: el plano del loteo de fondo y, encima, el contorno de cada parcela
// coloreado según su estado. Se puede arrastrar, acercar con la rueda o con dos dedos, y tocar una parcela.
// Las coordenadas de los contornos viven en un lienzo lógico de 1000 de ancho.
// El fondo es una imagen subida a mano o el dibujo vectorial del plano del topógrafo.

const ANCHO = 1000;
const ZOOM_MAXIMO = 16;
const UMBRAL_ARRASTRE = 6;
/** Tamaño en pantalla (px) de los rótulos: más chicos no se leen y solo ensucian; más grandes estorban. */
const ROTULO_MINIMO = 6.5;
const NUMERO_MINIMO = 7.5;
const NUMERO_MAXIMO = 20;

export const COLOR_ESTADO: Record<EstadoParcela, string> = {
  disponible: 'var(--mapa-disponible)',
  reservada: 'var(--mapa-reservada)',
  vendida: 'var(--mapa-vendida)',
  bloqueada: 'var(--mapa-bloqueada)',
};

interface Vista { x: number; y: number; w: number; h: number }

export const altoLogico = (plano: Plano | null) => (plano ? Math.round((ANCHO * plano.alto) / plano.ancho) : 700);

export function centroide(pts: Punto[]): Punto {
  let area = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    const cruz = x1 * y2 - x2 * y1;
    area += cruz;
    cx += (x1 + x2) * cruz;
    cy += (y1 + y2) * cruz;
  }
  if (Math.abs(area) < 1e-6) {
    return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  }
  return [cx / (3 * area), cy / (3 * area)];
}

/** Latitud y longitud del centro de una parcela, si el plano está georreferenciado. */
export function coordenadas(p: Parcela, plano: Plano | null): [number, number] | null {
  const g = plano?.georreferencia;
  if (!g || !p.poligono || p.poligono.length < 3) return null;
  const [x, y] = centroide(p.poligono);
  return [g.lat[0] * x + g.lat[1] * y + g.lat[2], g.lng[0] * x + g.lng[1] * y + g.lng[2]];
}

/** Punto del plano que corresponde a una latitud y longitud (la georreferencia es una transformación afín). */
export function geoALienzo(plano: Plano | null, lat: number, lng: number): Punto | null {
  const g = plano?.georreferencia;
  if (!g) return null;
  const [a, b, c] = g.lng;
  const [d, e, f] = g.lat;
  const det = a * e - b * d;
  if (!det) return null;
  const u = lng - c, v = lat - f;
  return [(e * u - b * v) / det, (a * v - d * u) / det];
}

export function puntoDentro([x, y]: Punto, pts: Punto[]) {
  let dentro = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

function distanciaASegmento([px, py]: Punto, [ax, ay]: Punto, [bx, by]: Punto) {
  const dx = bx - ax, dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Parcela donde está un punto del plano o, si cae fuera de todas, la más cercana y a qué distancia (en unidades del plano). */
export function parcelaEnPunto(parcelas: Parcela[], punto: Punto): { parcela: Parcela; dentro: boolean; distancia: number } | null {
  let mejor: { parcela: Parcela; dentro: boolean; distancia: number } | null = null;
  for (const p of parcelas) {
    const pts = p.poligono;
    if (!pts || pts.length < 3) continue;
    if (puntoDentro(punto, pts)) return { parcela: p, dentro: true, distancia: 0 };
    const d = Math.min(...pts.map((q, i) => distanciaASegmento(punto, q, pts[(i + 1) % pts.length])));
    if (!mejor || d < mejor.distancia) mejor = { parcela: p, dentro: false, distancia: d };
  }
  return mejor;
}

export const enlaceGoogleMaps = ([lat, lng]: [number, number]) =>
  `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;

// Espacio disponible para el rótulo: el ancho y el alto del contorno medidos a través de su centro
// (en lotes largos y girados la caja que los encierra es mucho más ancha que el lote).
function cuerda(pts: Punto[], [cx, cy]: Punto, horizontal: boolean) {
  const [u, v] = horizontal ? [cx, cy] : [cy, cx];
  const cortes: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const [au, av] = horizontal ? a : [a[1], a[0]];
    const [bu, bv] = horizontal ? b : [b[1], b[0]];
    if ((av > v) !== (bv > v)) cortes.push(au + ((v - av) * (bu - au)) / (bv - av));
  }
  cortes.sort((a, b) => a - b);
  for (let i = 0; i + 1 < cortes.length; i += 2) if (cortes[i] <= u && u <= cortes[i + 1]) return cortes[i + 1] - cortes[i];
  return 0;
}

function tamanoEtiqueta(pts: Punto[], centro: Punto, texto: string) {
  const ancho = cuerda(pts, centro, true);
  const alto = cuerda(pts, centro, false);
  return Math.max(1.5, Math.min(26, alto * 0.45, ancho / (Math.max(2, texto.length) * 0.72)));
}

// ---------- Fondo vectorial ----------

const ESTILO_FONDO: Record<ClaseFondo, { color: string; grosor: number; trazos?: string }> = {
  linea: { color: '#cbc7bb', grosor: 0.75 },
  camino: { color: '#b4ab9b', grosor: 1 },
  ruta: { color: '#8e9a7a', grosor: 1.3 },
  talud: { color: '#b39462', grosor: 1, trazos: '2 3' },
  rio: { color: '#4b8cc0', grosor: 1.6 },
  deslinde: { color: '#8a4b3c', grosor: 1.4, trazos: '7 4' },
};
const COLOR_ROTULO: Record<ClaseFondo, string> = {
  linea: '#8a8679', camino: '#8a8274', ruta: '#6b7758', talud: '#8f7444', rio: '#2f6d9c', deslinde: '#8a4b3c',
};
const ORDEN_FONDO: ClaseFondo[] = ['linea', 'talud', 'camino', 'ruta', 'rio', 'deslinde'];

// Memorizado: al arrastrar o acercar el mapa no se vuelve a armar el dibujo (son miles de trazos).
const DibujoFondo = memo(function DibujoFondo({ fondo }: { fondo: FondoPlano }) {
  return (
    <g pointerEvents="none" strokeLinecap="round" strokeLinejoin="round" fill="none">
      {/* Terreno del fundo, levemente más verde que el entorno */}
      {fondo.capas.deslinde && <path d={fondo.capas.deslinde} fill="#e8ebda" stroke="none" />}
      {ORDEN_FONDO.map((c) => fondo.capas[c] && (
        <path key={c} d={fondo.capas[c]} stroke={ESTILO_FONDO[c].color} strokeWidth={ESTILO_FONDO[c].grosor} strokeDasharray={ESTILO_FONDO[c].trazos} vectorEffect="non-scaling-stroke" />
      ))}
    </g>
  );
});

function RotulosFondo({ fondo, pxPorUnidad }: { fondo: FondoPlano; pxPorUnidad: number }) {
  return (
    <g pointerEvents="none" textAnchor="middle" fontStyle="italic">
      {fondo.etiquetas.filter((t) => t.h * pxPorUnidad >= ROTULO_MINIMO).map((t, i) => (
        <text key={i} x={t.x} y={t.y} dy="0.35em" fontSize={t.h} fill={COLOR_ROTULO[t.clase]} transform={t.r ? `rotate(${t.r} ${t.x} ${t.y})` : undefined}>
          {t.s}
        </text>
      ))}
    </g>
  );
}

// ---------- Imagen satelital de fondo ----------
// Teselas de Esri World Imagery (proyección Web Mercator). Como el plano está georreferenciado con una transformación
// afín, cada tesela de 256 px se ubica en el lienzo con una matriz: en el tamaño de una tesela la curvatura es despreciable.

const TESELA = 256;
const ZOOM_SATELITE = { min: 10, max: 18 };
const urlTesela = (z: number, x: number, y: number) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
const lngTesela = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const latTesela = (y: number, z: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;
const teselaX = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z);
const teselaY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

interface Tesela { clave: string; url: string; matriz: string }

function teselasVisibles(plano: Plano, vista: Vista, anchoPx: number): Tesela[] {
  const g = plano.georreferencia;
  if (!g || !anchoPx || !plano.metros_por_unidad) return [];
  const aGeo = (x: number, y: number) => [g.lng[0] * x + g.lng[1] * y + g.lng[2], g.lat[0] * x + g.lat[1] * y + g.lat[2]];
  const esquinas = [[vista.x, vista.y], [vista.x + vista.w, vista.y], [vista.x, vista.y + vista.h], [vista.x + vista.w, vista.y + vista.h]].map(([x, y]) => aGeo(x, y));
  const lngs = esquinas.map((e) => e[0]), lats = esquinas.map((e) => e[1]);
  const latCentro = (Math.min(...lats) + Math.max(...lats)) / 2;
  // Zoom con el que un píxel de la imagen es del tamaño de un píxel de la pantalla (o más detallado).
  const metrosPorPx = (plano.metros_por_unidad * vista.w) / anchoPx;
  let z = Math.ceil(Math.log2((156543.03392 * Math.cos((latCentro * Math.PI) / 180)) / metrosPorPx));
  z = Math.min(ZOOM_SATELITE.max, Math.max(ZOOM_SATELITE.min, z));
  for (;; z--) {
    const x0 = teselaX(Math.min(...lngs), z), x1 = teselaX(Math.max(...lngs), z);
    const y0 = teselaY(Math.max(...lats), z), y1 = teselaY(Math.min(...lats), z);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 80 && z > ZOOM_SATELITE.min) continue;
    const teselas: Tesela[] = [];
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const p0 = geoALienzo(plano, latTesela(y, z), lngTesela(x, z));
        const px = geoALienzo(plano, latTesela(y, z), lngTesela(x + 1, z));
        const py = geoALienzo(plano, latTesela(y + 1, z), lngTesela(x, z));
        if (!p0 || !px || !py) continue;
        const m = [(px[0] - p0[0]) / TESELA, (px[1] - p0[1]) / TESELA, (py[0] - p0[0]) / TESELA, (py[1] - p0[1]) / TESELA, p0[0], p0[1]];
        teselas.push({ clave: `${z}/${x}/${y}`, url: urlTesela(z, x, y), matriz: `matrix(${m.join(' ')})` });
      }
    }
    return teselas;
  }
}

// ---------- Escala gráfica ----------

const LARGOS = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];

function Escala({ metrosPorPx }: { metrosPorPx: number }) {
  const largo = LARGOS.find((l) => l / metrosPorPx >= 60) ?? LARGOS.at(-1)!;
  const px = largo / metrosPorPx;
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 flex items-end gap-3 rounded-md bg-white/80 px-2 py-1 text-[11px] text-stone-700 shadow-sm backdrop-blur-sm">
      <div className="flex flex-col items-center leading-none" aria-label="Norte hacia arriba">
        <svg viewBox="0 0 12 14" className="size-3.5" aria-hidden><path d="M6 0 L11 13 L6 10 L1 13 Z" fill="currentColor" /></svg>
        <span className="font-semibold">N</span>
      </div>
      <div>
        <div className="tabular-nums">{largo >= 1000 ? `${largo / 1000} km` : `${largo} m`}</div>
        <div className="h-1.5 border-x-2 border-b-2 border-stone-700" style={{ width: px }} />
      </div>
    </div>
  );
}

export function MapaParcelas({
  parcelas, plano, seleccion, alSeleccionar, atenuar, trazo, alAgregarPunto, ubicacion, enfocar, alUbicarme, ubicando, satelite: pideSatelite, alCambiarSatelite,
}: {
  parcelas: Parcela[];
  plano: Plano | null;
  seleccion: number | null;
  alSeleccionar: (id: number | null) => void;
  /** Parcelas que se muestran desvanecidas (p. ej. al filtrar por estado). */
  atenuar?: (p: Parcela) => boolean;
  /** Modo dibujo: vértices del contorno que se está trazando. */
  trazo?: Punto[] | null;
  alAgregarPunto?: (p: Punto) => void;
  /** Posición de quien mira el mapa (GPS del celular) y su margen de error, en unidades del plano. */
  ubicacion?: { punto: Punto; radio: number } | null;
  /** Centra el mapa en un punto (cambia `clave` para volver a centrar). */
  enfocar?: { punto: Punto; clave: number } | null;
  /** Botón "Mi ubicación" (solo si el plano está georreferenciado). */
  alUbicarme?: () => void;
  ubicando?: boolean;
  /** Imagen satelital de fondo en vez del dibujo del plano (solo con el plano georreferenciado). */
  satelite?: boolean;
  alCambiarSatelite?: (satelite: boolean) => void;
}) {
  const ALTO = altoLogico(plano);
  const svg = useRef<SVGSVGElement>(null);
  const [vista, setVista] = useState<Vista>({ x: 0, y: 0, w: ANCHO, h: ALTO });
  const [anchoPx, setAnchoPx] = useState(0);
  const [sobre, setSobre] = useState<{ id: number; x: number; y: number; ancho: number } | null>(null);
  const punteros = useRef(new Map<number, { x: number; y: number }>());
  const gesto = useRef<{ movido: number; objetivo: number | null; distancia: number | null } | null>(null);
  const dibujando = !!alAgregarPunto;
  const satelite = !!pideSatelite && !!plano?.georreferencia;
  const vectorial = plano?.tipo === 'vectorial';
  const fondo = useDatos<FondoPlano>(vectorial ? `/mapa/plano?v=${plano!.version}` : null).datos;

  const acotar = useCallback((v: Vista): Vista => {
    const w = Math.min(ANCHO, Math.max(ANCHO / ZOOM_MAXIMO, v.w));
    const h = (w * ALTO) / ANCHO;
    return { w, h, x: Math.min(ANCHO - w, Math.max(0, v.x)), y: Math.min(ALTO - h, Math.max(0, v.y)) };
  }, [ALTO]);

  const acercar = useCallback((factor: number, centro?: Punto) => {
    setVista((v) => {
      const [cx, cy] = centro ?? [v.x + v.w / 2, v.y + v.h / 2];
      const w = Math.min(ANCHO, Math.max(ANCHO / ZOOM_MAXIMO, v.w / factor));
      const k = w / v.w;
      return acotar({ w, h: 0, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k });
    });
  }, [acotar]);

  useEffect(() => setVista({ x: 0, y: 0, w: ANCHO, h: ALTO }), [ALTO]);

  // Centrar en la ubicación: acerca lo suficiente para ver la parcela y sus vecinas.
  useEffect(() => {
    if (!enfocar) return;
    const w = Math.min(ANCHO, ANCHO / 5);
    setVista(acotar({ w, h: 0, x: enfocar.punto[0] - w / 2, y: enfocar.punto[1] - (w * ALTO) / ANCHO / 2 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enfocar?.clave]);

  // Ancho real en pantalla: para decidir qué rótulos se alcanzan a leer y para la escala gráfica.
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setAnchoPx(e.contentRect.width));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const aLienzo = (clienteX: number, clienteY: number): Punto => {
    const p = new DOMPoint(clienteX, clienteY).matrixTransform(svg.current!.getScreenCTM()!.inverse());
    return [p.x, p.y];
  };

  // La rueda del mouse acerca o aleja en torno al cursor (el listener debe ser no pasivo para frenar el scroll).
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const alRodar = (e: WheelEvent) => {
      e.preventDefault();
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(el.getScreenCTM()!.inverse());
      acercar(e.deltaY < 0 ? 1.25 : 0.8, [p.x, p.y]);
    };
    el.addEventListener('wheel', alRodar, { passive: false });
    return () => el.removeEventListener('wheel', alRodar);
  }, [acercar]);

  const parcelaBajo = (objetivo: EventTarget | null) => {
    const el = objetivo instanceof Element ? objetivo.closest('[data-parcela]') : null;
    return el ? Number(el.getAttribute('data-parcela')) : null;
  };

  function alBajar(e: EventoPuntero<SVGSVGElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (punteros.current.size === 1) gesto.current = { movido: 0, objetivo: parcelaBajo(e.target), distancia: null };
    else if (gesto.current) gesto.current = { ...gesto.current, movido: Infinity, distancia: null };
    setSobre(null);
  }

  function alMover(e: EventoPuntero<SVGSVGElement>) {
    const previo = punteros.current.get(e.pointerId);
    if (!previo) {
      // Mouse sin botón apretado: muestra el detalle de la parcela bajo el cursor.
      if (e.pointerType === 'mouse') {
        const id = parcelaBajo(e.target);
        const caja = e.currentTarget.getBoundingClientRect();
        setSobre(id === null ? null : { id, x: e.clientX - caja.left, y: e.clientY - caja.top, ancho: caja.width });
      }
      return;
    }
    const actual = { x: e.clientX, y: e.clientY };
    punteros.current.set(e.pointerId, actual);
    const g = gesto.current;
    if (!g) return;

    if (punteros.current.size === 1) {
      const dx = actual.x - previo.x;
      const dy = actual.y - previo.y;
      g.movido += Math.abs(dx) + Math.abs(dy);
      if (g.movido > UMBRAL_ARRASTRE) {
        const escala = 1 / svg.current!.getScreenCTM()!.a;
        setVista((v) => acotar({ ...v, x: v.x - dx * escala, y: v.y - dy * escala }));
      }
    } else if (punteros.current.size === 2) {
      const [a, b] = [...punteros.current.values()];
      const distancia = Math.hypot(a.x - b.x, a.y - b.y);
      if (g.distancia) acercar(distancia / g.distancia, aLienzo((a.x + b.x) / 2, (a.y + b.y) / 2));
      g.distancia = distancia;
    }
  }

  function alSoltar(e: EventoPuntero<SVGSVGElement>) {
    if (!punteros.current.delete(e.pointerId)) return;
    const g = gesto.current;
    if (punteros.current.size > 0) {
      if (g) g.distancia = null;
      return;
    }
    gesto.current = null;
    // Un toque sin arrastre: agrega un vértice (modo dibujo) o selecciona la parcela tocada.
    if (g && g.movido <= UMBRAL_ARRASTRE && e.type === 'pointerup') {
      if (alAgregarPunto) alAgregarPunto(aLienzo(e.clientX, e.clientY));
      else alSeleccionar(g.objetivo);
    }
  }

  const conContorno = useMemo(
    () => parcelas.filter((p) => p.poligono && p.poligono.length >= 3).map((p) => {
      const pts = p.poligono!;
      const centro = centroide(pts);
      return { p, pts, centro, puntos: pts.map((q) => q.join(',')).join(' '), letra: tamanoEtiqueta(pts, centro, p.numero) };
    }),
    [parcelas],
  );
  const parcelaSobre = sobre ? parcelas.find((p) => p.id === sobre.id) : null;
  const zoom = ANCHO / vista.w;
  const radioVertice = vista.w / 140;
  // Hasta medir la pantalla se muestran todos los rótulos.
  const pxPorUnidad = anchoPx ? anchoPx / vista.w : Infinity;
  const teselas = useMemo(() => (satelite && plano ? teselasVisibles(plano, vista, anchoPx) : []), [satelite, plano, vista, anchoPx]);

  return (
    <div className={`relative overflow-hidden rounded-xl border border-stone-200 ${satelite ? 'bg-[#2b3326]' : 'bg-[#f3f2ec]'}`}>
      <svg
        ref={svg}
        viewBox={`${vista.x} ${vista.y} ${vista.w} ${vista.h}`}
        className={`block max-h-[72dvh] w-full touch-none select-none ${dibujando ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
        style={{ aspectRatio: `${ANCHO} / ${ALTO}` }}
        role="img"
        aria-label="Mapa de parcelas del loteo"
        onPointerDown={alBajar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={alSoltar}
        onPointerLeave={() => setSobre(null)}
      >
        <defs>
          {/* Trama diagonal: segunda señal (además del color) para las parcelas no disponibles */}
          <pattern id="trama-bloqueada" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="7" height="7" fill="var(--mapa-bloqueada)" />
            <line x1="0" y1="0" x2="0" y2="7" stroke="#fff" strokeOpacity="0.55" strokeWidth="2.5" />
          </pattern>
        </defs>

        {satelite ? (
          <g pointerEvents="none">
            {/* Un poco más grandes que 256 px para que no se vean las uniones entre teselas */}
            {teselas.map((t) => <image key={t.clave} href={t.url} width={TESELA + 0.6} height={TESELA + 0.6} transform={t.matriz} preserveAspectRatio="none" />)}
          </g>
        ) : (
          <>
            {plano && !vectorial && <image href={`/api/mapa/plano?v=${plano.version}`} x={0} y={0} width={ANCHO} height={ALTO} preserveAspectRatio="none" />}
            {fondo && <DibujoFondo fondo={fondo} />}
          </>
        )}

        {conContorno.map(({ p, puntos, centro, letra }) => {
          const elegida = p.id === seleccion;
          const tenue = !elegida && atenuar?.(p);
          return (
            <g key={p.id} data-parcela={p.id} opacity={tenue ? 0.28 : 1} className={dibujando ? '' : 'cursor-pointer'}>
              <polygon
                points={puntos}
                fill={p.estado === 'bloqueada' ? 'url(#trama-bloqueada)' : COLOR_ESTADO[p.estado]}
                fillOpacity={satelite ? (elegida ? 0.6 : sobre?.id === p.id ? 0.5 : 0.32) : elegida ? 1 : sobre?.id === p.id ? 0.95 : 0.84}
                stroke={elegida ? '#0b0b0b' : '#ffffff'}
                strokeWidth={elegida ? 3 : 1.5}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              {letra * pxPorUnidad >= NUMERO_MINIMO && (
                <text
                  x={centro[0]} y={centro[1]} dy="0.35em" textAnchor="middle" pointerEvents="none"
                  fontSize={Math.min(letra, NUMERO_MAXIMO / pxPorUnidad)} fontWeight={600}
                  fill={p.estado === 'reservada' && !satelite ? '#0b0b0b' : '#ffffff'}
                  {...(satelite ? { stroke: '#000000', strokeOpacity: 0.75, strokeWidth: 2.5, paintOrder: 'stroke', vectorEffect: 'non-scaling-stroke' } : {})}
                >
                  {p.numero}
                </text>
              )}
            </g>
          );
        })}

        {fondo && !satelite && <RotulosFondo fondo={fondo} pxPorUnidad={pxPorUnidad} />}

        {/* El contorno elegido se vuelve a dibujar encima para que su borde no quede tapado por los vecinos */}
        {conContorno.filter(({ p }) => p.id === seleccion).map(({ p, puntos }) => (
          <polygon key={p.id} points={puntos} fill="none" stroke="#0b0b0b" strokeWidth={3} strokeLinejoin="round" vectorEffect="non-scaling-stroke" pointerEvents="none" />
        ))}

        {ubicacion && (
          <g pointerEvents="none">
            <circle cx={ubicacion.punto[0]} cy={ubicacion.punto[1]} r={ubicacion.radio} fill="#2563eb" fillOpacity={0.15} stroke="#2563eb" strokeOpacity={0.5} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <circle cx={ubicacion.punto[0]} cy={ubicacion.punto[1]} r={Math.min(8 / pxPorUnidad, 6)} fill="#2563eb" stroke="#ffffff" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
          </g>
        )}

        {trazo && trazo.length > 0 && (
          <g pointerEvents="none">
            <polygon points={trazo.map((q) => q.join(',')).join(' ')} fill="#146c88" fillOpacity={0.25} stroke="#146c88" strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {trazo.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={radioVertice} fill="#ffffff" stroke="#146c88" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
        )}
      </svg>

      <div className="no-imprimir absolute right-2 top-2 flex flex-col overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
        <button onClick={() => acercar(1.5)} disabled={zoom >= ZOOM_MAXIMO} aria-label="Acercar" title="Acercar" className="p-2 text-stone-700 hover:bg-stone-100 disabled:opacity-40"><ZoomIn className="size-4" /></button>
        <button onClick={() => acercar(1 / 1.5)} disabled={zoom <= 1} aria-label="Alejar" title="Alejar" className="border-t border-stone-200 p-2 text-stone-700 hover:bg-stone-100 disabled:opacity-40"><ZoomOut className="size-4" /></button>
        <button onClick={() => setVista({ x: 0, y: 0, w: ANCHO, h: ALTO })} disabled={zoom <= 1} aria-label="Ver todo el plano" title="Ver todo el plano" className="border-t border-stone-200 p-2 text-stone-700 hover:bg-stone-100 disabled:opacity-40"><Maximize className="size-4" /></button>
        {alCambiarSatelite && plano?.georreferencia && (
          <button
            onClick={() => alCambiarSatelite(!satelite)} aria-pressed={satelite}
            aria-label={satelite ? 'Ver el dibujo del plano' : 'Ver la imagen satelital'} title={satelite ? 'Ver el dibujo del plano' : 'Ver la imagen satelital'}
            className={`border-t border-stone-200 p-2 hover:bg-stone-100 ${satelite ? 'bg-marca-50 text-marca-700' : 'text-stone-700'}`}
          >
            {satelite ? <IconoPlano className="size-4" /> : <Satellite className="size-4" />}
          </button>
        )}
        {alUbicarme && (
          <button
            onClick={alUbicarme} aria-label="Mi ubicación" title="Mi ubicación: en qué parcela estoy" aria-pressed={!!ubicando}
            className={`border-t border-stone-200 p-2 hover:bg-stone-100 ${ubicando ? 'bg-blue-50 text-blue-700' : 'text-stone-700'}`}
          >
            <LocateFixed className="size-4" />
          </button>
        )}
      </div>

      {plano?.metros_por_unidad && anchoPx > 0 && <Escala metrosPorPx={(plano.metros_por_unidad * vista.w) / anchoPx} />}
      {satelite && (
        <div className="pointer-events-none absolute left-0 top-0 rounded-br bg-white/75 px-1.5 py-0.5 text-[10px] text-stone-700">
          Imagen satelital: Esri, Maxar, Earthstar Geographics
        </div>
      )}

      {parcelaSobre && !dibujando && (
        <div
          className="pointer-events-none absolute z-10 w-max max-w-56 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs shadow-lg"
          style={{ top: sobre!.y + 14, ...(sobre!.x > sobre!.ancho - 240 ? { right: sobre!.ancho - sobre!.x + 10 } : { left: sobre!.x + 14 }) }}
        >
          <div className="font-semibold text-stone-900">Parcela {parcelaSobre.numero}{parcelaSobre.sector ? ` · ${parcelaSobre.sector}` : ''}</div>
          <div className="text-stone-600">{ESTADOS_PARCELA[parcelaSobre.estado].etiqueta} · {numero(parcelaSobre.superficie_m2)} m²</div>
          <div className="mt-0.5 font-medium tabular-nums text-stone-900">{precioLista(parcelaSobre.precio)}</div>
        </div>
      )}
    </div>
  );
}
