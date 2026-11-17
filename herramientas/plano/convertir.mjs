// Convierte el plano del loteo (AutoCAD .dwg + Google Earth .kmz) al archivo que usa el sistema:
// server/datos/loteo.json con el contorno, número, manzana, superficie y deslindes de cada lote,
// el dibujo de fondo (caminos, río, deslinde del fundo) y la georreferencia para Google Maps.
//
// Uso (solo cuando el topógrafo entrega un plano nuevo):
//   npm install --no-save @mlightcad/libredwg-web
//   node herramientas/plano/convertir.mjs "planos/archivo.dwg" "planos/archivo.kmz"
//
// El .kmz es opcional: sin él no hay enlace a Google Maps. Revise el resumen que se imprime al final.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { grafo, puentes, caras, dentro, distanciaASegmento } from './poligonizar.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [archivoDwg, archivoKmz] = process.argv.slice(2);
const SALIDA = process.env.SALIDA || path.join(RAIZ, 'server/datos/loteo.json');
if (!archivoDwg) {
  console.error('Uso: node herramientas/plano/convertir.mjs plano.dwg [plano.kmz]');
  process.exit(1);
}

// ---------- 1. Leer el DWG ----------

async function leerDwg(archivo) {
  let modulo, carpetaWasm;
  try {
    const url = process.env.LIBREDWG_DIR
      ? new URL(`file://${path.resolve(process.env.LIBREDWG_DIR)}/dist/libredwg-web.js`)
      : new URL(import.meta.resolve('@mlightcad/libredwg-web'));
    modulo = await import(url.href);
    carpetaWasm = path.join(path.dirname(fileURLToPath(url)), '../wasm/');
  } catch {
    console.error('Falta el lector de archivos DWG. Instálelo (no queda como dependencia del sistema) con:');
    console.error('  npm install --no-save @mlightcad/libredwg-web');
    process.exit(1);
  }
  const { Dwg_File_Type, LibreDwg } = modulo;
  const libredwg = await LibreDwg.create(carpetaWasm);
  const dwg = libredwg.dwg_read_data(fs.readFileSync(archivo), Dwg_File_Type.DWG);
  const db = libredwg.convert(dwg);
  libredwg.dwg_free(dwg);
  return db;
}

const db = await leerDwg(archivoDwg);
const modelo = db.tables.BLOCK_RECORD.entries.find((b) => b.name === '*Model_Space').entities;
const capas = Object.fromEntries(db.tables.LAYER.entries.map((l) => [l.name, l.colorIndex]));
const colorDe = (e) => (e.colorIndex === 256 ? capas[e.layer] ?? 7 : e.colorIndex);
const limpiar = (s) => String(s ?? '').replace(/\\P/g, ' ').replace(/\\[A-Za-z][^;]*;/g, '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
// En LibreDWG la polilínea cerrada se marca con el bit 512.
const puntosDe = (e) => {
  if (e.type === 'LINE') return [e.startPoint, e.endPoint];
  if (e.type === 'LWPOLYLINE') return [...e.vertices, ...(e.flag & 512 ? [e.vertices[0]] : [])];
  return null;
};
const largo = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);

// ---------- 2. Contornos de los lotes ----------
// Se usan todas las líneas del espacio modelo salvo el talud (amarillo), que cruza los lotes sin dividirlos,
// y el cerco y los tensores de la antena (gris), que están dentro de un lote.

const AMARILLO = 2, GRIS = 8;
const lineas = modelo.filter((e) => (e.type === 'LINE' || e.type === 'LWPOLYLINE') && e.isVisible !== false);
const segmentos = [];
for (const e of lineas) {
  if (colorDe(e) === AMARILLO || colorDe(e) === GRIS || e.layer === 'Unknown_Line_Type') continue;
  const pts = puntosDe(e);
  for (let i = 1; i < pts.length; i++) {
    const a = { x: pts[i - 1].x, y: pts[i - 1].y }, b = { x: pts[i].x, y: pts[i].y };
    if (Math.hypot(a.x - b.x, a.y - b.y) > 1e-4) segmentos.push([a, b]);
  }
}
let g = grafo(segmentos);
const uniones = puentes(g, { prolongar: 10, acercar: 3 });
g = grafo([...segmentos, ...uniones]);
const todasLasCaras = caras(g);
const caraEn = (p) => todasLasCaras.filter((c) => dentro(p, c.pts)).sort((a, b) => a.area - b.area)[0] ?? null;

// ---------- 3. Número y superficie de cada lote ----------

function centroDeTexto(t) {
  const p = t.insertionPoint ?? t.startPoint, r = t.rotation ?? 0, s = limpiar(t.text);
  const w = t.extentsWidth || t.rectWidth || s.length * (t.textHeight ?? 1) * 0.6, h = t.extentsHeight || t.textHeight || 1;
  const ap = t.type === 'MTEXT' ? t.attachmentPoint || 1 : 7;
  const dx = [w / 2, 0, -w / 2][(ap - 1) % 3], dy = [-h / 2, 0, h / 2][Math.floor((ap - 1) / 3)];
  return { x: p.x + dx * Math.cos(r) - dy * Math.sin(r), y: p.y + dx * Math.sin(r) + dy * Math.cos(r) };
}
const textos = modelo
  .filter((e) => (e.type === 'MTEXT' || e.type === 'TEXT') && e.layer !== 'V-NODE-TEXT' && e.isVisible !== false)
  .map((t) => ({ s: limpiar(t.text), h: t.textHeight ?? 1, r: t.rotation ?? 0, c: centroDeTexto(t), color: colorDe(t) }));
const circulos = modelo.filter((e) => e.type === 'CIRCLE').map((e) => e.center);
const esNumeroDeLote = (t) => /^\d+$/.test(t.s) && t.h > 5 && t.h < 12;
const esSuperficie = (t) => /m2$/i.test(t.s);
const esMedida = (t) => /^\d+(\.\d+)?$/.test(t.s) && t.h < 5;
const valorSuperficie = (s) => Number(s.replace(/m2$/i, '').trim().replace(/\.(?=\d{3}\.)/g, ''));

const lotes = [];
const problemas = [];
for (const t of textos.filter(esNumeroDeLote)) {
  // El número va dentro de un círculo: su centro es el punto más confiable dentro del lote.
  const circulo = circulos.map((c) => ({ c, d: Math.hypot(c.x - t.c.x, c.y - t.c.y) })).sort((a, b) => a.d - b.d)[0];
  const punto = circulo && circulo.d < 8 ? { x: circulo.c.x, y: circulo.c.y } : t.c;
  const cara = caraEn(punto);
  if (!cara) { problemas.push(`El lote ${t.s} no tiene un contorno cerrado`); continue; }
  const otro = lotes.find((l) => l.cara === cara);
  if (otro) { problemas.push(`Los lotes ${otro.n} y ${t.s} quedaron dentro del mismo contorno`); continue; }
  lotes.push({ n: Number(t.s), cara, punto, superficies: [], alto: Math.round(t.h * 100) / 100 });
}
for (const t of textos.filter(esSuperficie)) {
  const l = lotes.find((x) => x.cara === caraEn(t.c));
  if (l) l.superficies.push(valorSuperficie(t.s));
}
for (const l of lotes) {
  const distintas = [...new Set(l.superficies)];
  if (distintas.length > 1) problemas.push(`Lote ${l.n}: tiene ${distintas.length} superficies anotadas (${distintas.join(' / ')}); se usa ${distintas[0]}`);
  l.declarada = distintas[0] ?? null;
}

// ---------- 4. Manzanas: cada numeración que parte en 1 ----------
// Se une cada lote n con el lote n+1 más cercano; las cadenas que quedan separadas por pocos metros
// (p. ej. una corrida de lotes que sigue en la manzana del lado) se vuelven a juntar después.

const cadenaDe = new Map();
const siguiente = new Map(), anterior = new Map();
const distancia = (a, b) => Math.hypot(a.punto.x - b.punto.x, a.punto.y - b.punto.y);
const maximo = Math.max(...lotes.map((l) => l.n));
for (let n = 1; n < maximo; n++) {
  const pares = [];
  for (const a of lotes.filter((l) => l.n === n)) for (const b of lotes.filter((l) => l.n === n + 1)) pares.push({ a, b, d: distancia(a, b) });
  pares.sort((x, y) => x.d - y.d);
  for (const { a, b, d } of pares) {
    if (d > 140 || siguiente.has(a) || anterior.has(b)) continue;
    siguiente.set(a, b); anterior.set(b, a);
  }
}
// Lotes que comparten un lado (misma arista del grafo).
const porArista = new Map();
for (const l of lotes) l.cara.ids.forEach((id, k) => {
  const otro = l.cara.ids[(k + 1) % l.cara.ids.length];
  const clave = id < otro ? `${id}-${otro}` : `${otro}-${id}`;
  if (!porArista.has(clave)) porArista.set(clave, []);
  porArista.get(clave).push(l);
});
const colindan = new Map(lotes.map((l) => [l, new Set()]));
for (const ls of porArista.values()) for (const a of ls) for (const b of ls) if (a !== b) colindan.get(a).add(b);
let cadenas = lotes.filter((l) => !anterior.has(l)).map((l) => { const c = [l]; while (siguiente.has(c.at(-1))) c.push(siguiente.get(c.at(-1))); return c; });
// Juntar cadenas: la que termina en n con la que parte en n+1 (y no en 1) más cercana. La segunda corrida
// suele empezar junto al comienzo de la primera (filas numeradas en el mismo sentido) o junto a su final.
let unidas = true;
while (unidas) {
  unidas = false;
  const pares = [];
  for (const a of cadenas) for (const b of cadenas) {
    if (a === b || b[0].n !== a.at(-1).n + 1 || b[0].n === 1) continue;
    // Solo corridas de la misma manzana: algún lote de una colinda con alguno de la otra.
    if (!a.some((x) => b.some((y) => colindan.get(x).has(y)))) continue;
    pares.push({ a, b, d: Math.min(distancia(a.at(-1), b[0]), distancia(a[0], b[0])) });
  }
  pares.sort((x, y) => x.d - y.d);
  if (pares.length) {
    const { a, b } = pares[0];
    cadenas = cadenas.filter((c) => c !== b);
    a.push(...b);
    unidas = true;
  }
}
for (const c of cadenas) {
  if (c[0].n !== 1) problemas.push(`Hay una numeración que parte en el lote ${c[0].n} (no en 1)`);
  const n = c.map((l) => l.n);
  if (new Set(n).size !== n.length) problemas.push(`Una numeración repite números: ${n.join(',')}`);
}
// Manzanas con letras. El plano solo trae números: las letras son las que usan los dueños y el contador
// (confirmadas con ellos), en el orden de poniente a oriente en que quedan las numeraciones según su centro.
// Si un plano nuevo trae otras manzanas, se usan letras correlativas de poniente a oriente y se avisa.
const LETRAS_DUENOS = [
  { lotes: 12, letra: 'B' }, // franja del extremo poniente
  { lotes: 28, letra: 'A' }, // al sur, junto al camino público
  { lotes: 9, letra: 'H' }, // al norte, entre la C y la G
  { lotes: 16, letra: 'C' },
  { lotes: 18, letra: 'G' }, // la del norte
  { lotes: 4, letra: 'D' }, // la de 4 lotes pegada a la G
  { lotes: 9, letra: 'E' }, // al sur-oriente, junto a la A
  { lotes: 4, letra: 'F' }, // la de 4 lotes siguiente hacia el oriente
  { lotes: 85, letra: 'I' }, // la grande del oriente, hacia el Río Colorado
];
const centroX = (c) => c.reduce((s, l) => s + l.punto.x, 0) / c.length;
cadenas.sort((a, b) => centroX(a) - centroX(b));
const calzan = cadenas.length === LETRAS_DUENOS.length && cadenas.every((c, i) => c.length === LETRAS_DUENOS[i].lotes);
if (!calzan) problemas.push('Las manzanas del plano no calzan con las conocidas: se nombraron A, B, C… de poniente a oriente. Revise las letras con los dueños y ajuste LETRAS_DUENOS.');
const sectores = cadenas.map((c, i) => {
  const letra = calzan ? LETRAS_DUENOS[i].letra : String.fromCharCode(65 + i);
  for (const l of c) { l.letra = letra; cadenaDe.set(l, i); }
  return { letra, nombre: `Manzana ${letra}`, lotes: c.length };
}).sort((a, b) => a.letra.localeCompare(b.letra));
const codigo = (l) => `${l.letra}-${l.n}`;

// ---------- 5. Lienzo: encuadre del fundo y escala ----------

const rojas = lineas.filter((e) => colorDe(e) === 1 && e.type === 'LWPOLYLINE');
const deslinde = rojas.filter((e) => e.flag & 512 || Math.hypot(e.vertices[0].x - e.vertices.at(-1).x, e.vertices[0].y - e.vertices.at(-1).y) < 0.01)
  .sort((a, b) => largo(puntosDe(b)) - largo(puntosDe(a)))[0];
const puntosEncuadre = [...(deslinde ? puntosDe(deslinde) : []), ...lotes.flatMap((l) => l.cara.pts)];
const margen = 25;
const X0 = Math.min(...puntosEncuadre.map((p) => p.x)) - margen, X1 = Math.max(...puntosEncuadre.map((p) => p.x)) + margen;
const Y0 = Math.min(...puntosEncuadre.map((p) => p.y)) - margen, Y1 = Math.max(...puntosEncuadre.map((p) => p.y)) + margen;
const ANCHO = 1000;
const escala = ANCHO / (X1 - X0); // unidades del lienzo por metro
const ALTO = Math.round((Y1 - Y0) * escala);
const red = (v) => Math.round(v * 10) / 10;
const aLienzo = (p) => [red((p.x - X0) * escala), red((Y1 - p.y) * escala)];

// ---------- 6. Georreferencia (desde el KMZ de Google Earth) ----------

function leerKml(archivo) {
  // Lector mínimo de ZIP: busca el primer .kml del directorio central.
  const zip = fs.readFileSync(archivo);
  let fin = zip.length - 22;
  while (fin >= 0 && zip.readUInt32LE(fin) !== 0x06054b50) fin--;
  if (fin < 0) throw new Error('El KMZ no es un archivo ZIP válido');
  let p = zip.readUInt32LE(fin + 16);
  const total = zip.readUInt16LE(fin + 10);
  for (let i = 0; i < total; i++) {
    const metodo = zip.readUInt16LE(p + 10), comprimido = zip.readUInt32LE(p + 20);
    const largoNombre = zip.readUInt16LE(p + 28), extra = zip.readUInt16LE(p + 30), comentario = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const nombre = zip.subarray(p + 46, p + 46 + largoNombre).toString('utf8');
    if (nombre.toLowerCase().endsWith('.kml')) {
      const inicio = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const datos = zip.subarray(inicio, inicio + comprimido);
      return (metodo === 8 ? zlib.inflateRawSync(datos) : datos).toString('utf8');
    }
    p += 46 + largoNombre + extra + comentario;
  }
  throw new Error('El KMZ no contiene un archivo .kml');
}

function resolver3(A, B) {
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
    const f = A[j][i] / A[i][i];
    for (let c = i; c < 3; c++) A[j][c] -= f * A[i][c];
    B[j] -= f * B[i];
  }
  const r = [0, 0, 0];
  for (let i = 2; i >= 0; i--) { let s = B[i]; for (let c = i + 1; c < 3; c++) s -= A[i][c] * r[c]; r[i] = s / A[i][i]; }
  return r;
}

let georreferencia = null, errorGeo = null;
if (archivoKmz) {
  // Los círculos de los números de lote están en ambos archivos: se emparejan y se ajusta una transformación afín.
  const kml = leerKml(archivoKmz);
  const geo = [];
  for (const m of kml.matchAll(/<name>C[ií]rculo[^<]*<\/name>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/g)) {
    const pts = m[1].trim().split(/\s+/).map((t) => t.split(',').map(Number));
    geo.push([pts.reduce((s, q) => s + q[0], 0) / pts.length, pts.reduce((s, q) => s + q[1], 0) / pts.length]);
  }
  const lat0 = geo.reduce((s, q) => s + q[1], 0) / geo.length, lon0 = geo.reduce((s, q) => s + q[0], 0) / geo.length;
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111320, ky = 110574;
  const cx = circulos.reduce((s, c) => s + c.x, 0) / circulos.length, cy = circulos.reduce((s, c) => s + c.y, 0) / circulos.length;
  let pares = [];
  for (const c of circulos) {
    let mejor = null;
    for (const [lo, la] of geo) {
      const e = Math.hypot(c.x - cx - (lo - lon0) * kx, c.y - cy - (la - lat0) * ky);
      if (!mejor || e < mejor.e) mejor = { lo, la, e };
    }
    if (mejor && mejor.e < 30) pares.push([c.x, c.y, mejor.lo, mejor.la]);
  }
  const ajustar = (k) => {
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], B = [0, 0, 0];
    for (const q of pares) {
      const v = [...aLienzo({ x: q[0], y: q[1] }), 1];
      for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) A[i][j] += v[i] * v[j]; B[i] += v[i] * q[k]; }
    }
    return resolver3(A, B);
  };
  const errorDe = (q, lng, lat) => {
    const [x, y] = aLienzo({ x: q[0], y: q[1] });
    return Math.hypot((lng[0] * x + lng[1] * y + lng[2] - q[2]) * kx, (lat[0] * x + lat[1] * y + lat[2] - q[3]) * ky);
  };
  let lng, lat;
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    lng = ajustar(2); lat = ajustar(3);
    pares = pares.filter((q) => errorDe(q, lng, lat) < 2);
  }
  if (pares.length >= 10) {
    lng = ajustar(2); lat = ajustar(3);
    errorGeo = Math.max(...pares.map((q) => errorDe(q, lng, lat)));
    georreferencia = { lng, lat, puntos: pares.length };
  } else {
    problemas.push('No se pudo georreferenciar el plano con el KMZ (pocos puntos en común)');
  }
}

// ---------- 7. Deslindes de cada lote ----------
// Para cada lado del contorno: orientación (Norte, Sur, Oriente, Poniente), largo (se prefiere la cota
// anotada en el plano) y con qué colinda (otro lote, un camino, el río o el límite del fundo).

const claseDe = (e) => {
  const c = colorDe(e);
  if (e === deslinde) return 'deslinde';
  if (c === 1 && e.type === 'LWPOLYLINE' && e.vertices.length >= 20) return 'rio';
  if (c === 2) return 'talud';
  if (c === 3 || e.layer === 'Unknown_Line_Type') return 'ruta';
  if (c === 6) return 'camino';
  return 'linea';
};
const segmentosPorClase = {};
for (const e of lineas) {
  const pts = puntosDe(e);
  const clase = claseDe(e);
  for (let i = 1; i < pts.length; i++) (segmentosPorClase[clase] ||= []).push([pts[i - 1], pts[i]]);
}
const cercania = (p, clase) => Math.min(Infinity, ...(segmentosPorClase[clase] ?? []).map(([a, b]) => distanciaASegmento(p, a, b).d));
const aristaDe = new Map();
lotes.forEach((l) => l.cara.ids.forEach((id, k) => {
  const otro = l.cara.ids[(k + 1) % l.cara.ids.length];
  const clave = id < otro ? `${id}-${otro}` : `${otro}-${id}`;
  if (!aristaDe.has(clave)) aristaDe.set(clave, []);
  aristaDe.get(clave).push(l);
}));
const medidas = textos.filter(esMedida).map((t) => ({ ...t, v: Number(t.s) }));
const ORIENTACIONES = ['Oriente', 'Norte', 'Poniente', 'Sur'];
const metros = (v) => `${v.toFixed(2).replace('.', ',')} metros`;

function colindante(l, i, j) {
  const a = g.vertices[i], b = g.vertices[j];
  const clave = i < j ? `${i}-${j}` : `${j}-${i}`;
  const vecino = (aristaDe.get(clave) ?? []).find((x) => x !== l);
  if (vecino) return `Parcela ${codigo(vecino)}`;
  const medio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  // Recorrido antihorario: el exterior queda a la derecha.
  const fuera = { x: medio.x + ((b.y - a.y) / L) * 4, y: medio.y - ((b.x - a.x) / L) * 4 };
  const vecinoCercano = lotes.find((x) => x !== l && dentro(fuera, x.cara.pts));
  if (vecinoCercano) return `Parcela ${codigo(vecinoCercano)}`;
  const d = Object.fromEntries(['deslinde', 'rio', 'ruta', 'camino'].map((c) => [c, cercania(medio, c)]));
  if (d.deslinde < 1.5) return 'límite del fundo';
  // Al otro lado hay una franja angosta (ancho medio < 20 m) que no es lote: es un camino ("LOTE CAMINO").
  const franja = caraEn(fuera);
  if (franja && !lotes.some((x) => x.cara === franja)) {
    const perimetro = franja.pts.reduce((s, p, k) => { const q = franja.pts[(k + 1) % franja.pts.length]; return s + Math.hypot(q.x - p.x, q.y - p.y); }, 0);
    if ((2 * franja.area) / perimetro < 20) return d.ruta < 25 && d.ruta <= d.camino ? 'camino predial público' : 'camino interior';
  }
  if (d.ruta < 25 && d.ruta <= d.camino) return 'camino predial público';
  if (d.camino < 25) return 'camino interior';
  if (d.rio < 40) return 'Río Colorado';
  return 'resto del predio';
}

function deslindesDe(l) {
  const ids = l.cara.ids;
  const tramos = ids.map((i, k) => {
    const j = ids[(k + 1) % ids.length], a = g.vertices[i], b = g.vertices[j];
    return { a, b, largo: Math.hypot(b.x - a.x, b.y - a.y), angulo: Math.atan2(b.y - a.y, b.x - a.x), con: colindante(l, i, j) };
  }).filter((t) => t.largo > 0.05);
  // Lados: tramos seguidos casi alineados (menos de 8°).
  const lados = [];
  for (const t of tramos) {
    const ult = lados.at(-1);
    const giro = ult ? Math.abs(((t.angulo - ult.angulo + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) : Infinity;
    if (ult && giro < (8 * Math.PI) / 180) { ult.tramos.push(t); ult.b = t.b; } else lados.push({ a: t.a, b: t.b, angulo: t.angulo, tramos: [t] });
  }
  if (lados.length > 1) {
    const primero = lados[0], ult = lados.at(-1);
    const giro = Math.abs(((primero.angulo - ult.angulo + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    if (giro < (8 * Math.PI) / 180) { ult.tramos.push(...primero.tramos); ult.b = primero.b; lados.shift(); }
  }
  const lineasDeslinde = {};
  for (const lado of lados) {
    const largoLado = lado.tramos.reduce((s, t) => s + t.largo, 0);
    if (largoLado < 1.5) continue; // esquinas recortadas del dibujo
    // Normal exterior (a la derecha del recorrido antihorario) → orientación.
    const normal = Math.atan2(-(lado.b.x - lado.a.x), lado.b.y - lado.a.y);
    const orientacion = ORIENTACIONES[((Math.round(normal / (Math.PI / 2)) % 4) + 4) % 4];
    // Tramos seguidos con el mismo colindante se juntan.
    const partes = [];
    for (const t of lado.tramos) { const u = partes.at(-1); if (u && u.con === t.con) u.largo += t.largo; else partes.push({ con: t.con, largo: t.largo }); }
    // Un tramo de menos de 1,5 m es un descuadre del dibujo: se suma al tramo vecino más largo.
    for (let i = partes.length - 1; i >= 0 && partes.length > 1; i--) {
      if (partes[i].largo >= 1.5) continue;
      const vecino = [partes[i - 1], partes[i + 1]].filter(Boolean).sort((x, y) => y.largo - x.largo)[0];
      vecino.largo += partes[i].largo;
      partes.splice(i, 1);
      for (let k = partes.length - 1; k > 0; k--) if (partes[k].con === partes[k - 1].con) { partes[k - 1].largo += partes[k].largo; partes.splice(k, 1); }
    }
    // Cota anotada en el plano cerca del lado (se acepta si difiere menos de 1,5 % de lo dibujado).
    const cota = (largoParte, desde, hasta) => {
      const medio = { x: (desde.x + hasta.x) / 2, y: (desde.y + hasta.y) / 2 };
      const candidata = medidas
        .filter((m) => Math.abs(m.v - largoParte) / largoParte < 0.015 && distanciaASegmento(m.c, desde, hasta).d < 8)
        .sort((x, y) => Math.hypot(x.c.x - medio.x, x.c.y - medio.y) - Math.hypot(y.c.x - medio.x, y.c.y - medio.y))[0];
      return candidata ? candidata.v : Math.round(largoParte * 100) / 100;
    };
    const lista = (lineasDeslinde[orientacion] ||= []);
    if (partes.length === 1) lista.push({ largos: [cota(partes[0].largo, lado.a, lado.b)], con: partes[0].con });
    else for (const p of partes) lista.push({ largos: [Math.round(p.largo * 100) / 100], con: p.con });
  }
  // Lados seguidos de una misma orientación con el mismo colindante: "en tramos de 45,27 y 38,85 metros con …".
  const frase = (items) => {
    const juntos = [];
    for (const it of items) { const u = juntos.at(-1); if (u && u.con === it.con) u.largos.push(...it.largos); else juntos.push({ ...it, largos: [...it.largos] }); }
    return juntos.map(({ largos, con }) => largos.length === 1
      ? `en ${metros(largos[0])} con ${con}`
      : `en tramos de ${largos.slice(0, -1).map((v) => v.toFixed(2).replace('.', ',')).join(', ')} y ${metros(largos.at(-1))} con ${con}`).join(' y ');
  };
  return ['Norte', 'Sur', 'Oriente', 'Poniente']
    .filter((o) => lineasDeslinde[o])
    .map((o) => `${o}: ${frase(lineasDeslinde[o])}`)
    .join('; '); // sin punto final: la plantilla de la promesa pone la puntuación
}

// ---------- 8. Dibujo de fondo ----------

function recortar(a, b) {
  // Liang–Barsky contra el encuadre.
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - X0], [dx, X1 - a.x], [-dy, a.y - Y0], [dy, Y1 - a.y]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [{ x: a.x + t0 * dx, y: a.y + t0 * dy }, { x: a.x + t1 * dx, y: a.y + t1 * dy }];
}
const fondo = {};
const vistos = new Set();
for (const e of lineas) {
  const pts = puntosDe(e);
  if (e.type === 'LWPOLYLINE' && pts.length === 5 && largo(pts) > 4 * (X1 - X0)) continue; // marco de la lámina
  const clase = claseDe(e);
  let d = '', ultimo = null;
  for (let i = 1; i < pts.length; i++) {
    const s = recortar(pts[i - 1], pts[i]);
    if (!s) { ultimo = null; continue; }
    const [p, q] = s.map(aLienzo);
    if (!ultimo || ultimo[0] !== p[0] || ultimo[1] !== p[1]) d += `M${p[0]} ${p[1]}`;
    d += `L${q[0]} ${q[1]}`;
    ultimo = q;
  }
  if (!d || vistos.has(clase + d)) continue;
  vistos.add(clase + d);
  fondo[clase] = (fondo[clase] ?? '') + d;
}
const ETIQUETAS = [
  [/CAMINO PREDIAL|CAMINO INTERIOR/i, 'ruta'], [/LOTE\s+CAMINO/i, 'camino'], [/\bR[IÍ]O\b/i, 'rio'], [/TALUD/i, 'talud'], [/ANTENA|TENSORES/i, 'linea'],
];
const etiquetas = [];
for (const t of textos) {
  const tipo = ETIQUETAS.find(([re]) => re.test(t.s));
  if (!tipo || t.h > 40 || t.c.x < X0 || t.c.x > X1 || t.c.y < Y0 || t.c.y > Y1) continue;
  const [x, y] = aLienzo(t.c);
  const texto = t.s.replace(/\s+/g, ' ');
  if (etiquetas.some((o) => o.s === texto && Math.hypot(o.x - x, o.y - y) < 3)) continue;
  // Se escribe siempre de izquierda a derecha (girando media vuelta si viene al revés).
  let giro = -(t.r * 180) / Math.PI;
  giro = ((giro + 540) % 360) - 180;
  if (giro > 90) giro -= 180;
  if (giro < -90) giro += 180;
  etiquetas.push({ s: texto, x, y, h: red(t.h * escala), r: Math.round(giro * 10) / 10, clase: tipo[1] });
}

// ---------- 9. Resultado ----------

function simplificar(pts) {
  // Quita vértices intermedios alineados (los dejó la división de líneas).
  const salida = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[(i - 1 + pts.length) % pts.length], p = pts[i], b = pts[(i + 1) % pts.length];
    const cruz = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
    if (Math.abs(cruz) / Math.hypot(b.x - a.x, b.y - a.y) > 0.05) salida.push(p);
  }
  return salida;
}
const salida = {
  version: 1,
  fuente: { dwg: path.basename(archivoDwg), kmz: archivoKmz ? path.basename(archivoKmz) : null, convertido: new Date().toISOString().slice(0, 10) },
  ancho: ANCHO,
  alto: ALTO,
  metros_por_unidad: Math.round((1 / escala) * 1e6) / 1e6,
  georreferencia,
  sectores,
  fondo: { capas: fondo, etiquetas },
  lotes: lotes
    .sort((a, b) => a.letra.localeCompare(b.letra) || a.n - b.n)
    .map((l) => ({
      codigo: codigo(l),
      sector: `Manzana ${l.letra}`,
      numero: l.n,
      superficie_m2: l.declarada ?? Math.round(l.cara.area),
      superficie_anotada: l.declarada !== null,
      superficie_dibujo: Math.round(l.cara.area),
      poligono: simplificar(l.cara.pts).map(aLienzo),
      deslindes: deslindesDe(l),
    })),
};
for (const l of salida.lotes) {
  if (!l.superficie_anotada) problemas.push(`Lote ${l.codigo}: el plano no anota su superficie; se usa la del contorno dibujado (${l.superficie_m2} m²)`);
  const dif = Math.abs(l.superficie_m2 - l.superficie_dibujo) / l.superficie_m2;
  if (dif > 0.03) problemas.push(`Lote ${l.codigo}: el plano anota ${l.superficie_m2} m² y el contorno dibujado mide ${l.superficie_dibujo} m²`);
}
fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
fs.writeFileSync(SALIDA, JSON.stringify(salida));

console.log(`Listo: ${path.relative(RAIZ, SALIDA)} (${Math.round(fs.statSync(SALIDA).size / 1024)} KB)`);
console.log(`  ${salida.lotes.length} lotes en ${sectores.length} manzanas: ${sectores.map((s) => `${s.letra} (${s.lotes})`).join(', ')}`);
console.log(`  ${uniones.length} uniones completadas en el dibujo; lienzo ${ANCHO} × ${ALTO} (1 unidad = ${salida.metros_por_unidad.toFixed(3)} m)`);
console.log(georreferencia ? `  Georreferencia con ${georreferencia.puntos} puntos del KMZ (error máximo ${errorGeo.toFixed(2)} m)` : '  Sin georreferencia');
if (problemas.length) console.log(`\nRevisar:\n  - ${problemas.join('\n  - ')}`);
