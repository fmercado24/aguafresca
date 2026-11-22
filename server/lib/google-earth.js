// Parcelas en Google Earth. Google Earth no se puede abrir con un archivo indicado en un enlace: se importa una sola
// vez un "enlace de red" (un KML chico que apunta a este servidor) en un proyecto de Google Earth, y desde ahí el
// proyecto trae las parcelas al día cada vez que se abre. El botón "Google Earth" del sistema abre ese proyecto.
//
// Google Earth lee el KML sin iniciar sesión en el sistema, así que la dirección lleva una clave larga al azar
// (se puede renovar para anular la anterior) y el archivo público NO lleva nombres de compradores.
import crypto from 'node:crypto';
import { db } from '../db.js';
import { leerSeccion, guardarSeccion } from './configuracion.js';
import { pesos } from './finanzas.js';
import { ErrorApp } from './validar.js';

const COLOR_KML = { disponible: 'ff008300', reservada: 'ff00a1ed', vendida: 'ff818789', bloqueada: 'ff4e5152' }; // aabbggrr
const ETIQUETA_ESTADO = { disponible: 'Disponible', reservada: 'Reservada', vendida: 'Vendida', bloqueada: 'Bloqueada' };
const xml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const ordenNatural = (a, b) => a.numero.localeCompare(b.numero, 'es', { numeric: true });

const seccion = () => leerSeccion('google_earth') ?? {};

/** Clave de la dirección pública del KML (se crea la primera vez). */
export function claveEarth() {
  const g = seccion();
  if (g.clave) return g.clave;
  const clave = crypto.randomBytes(24).toString('hex');
  guardarSeccion('google_earth', { ...g, clave });
  return clave;
}

/** Anula la dirección anterior: los enlaces ya importados en Google Earth dejan de funcionar. */
export function renovarClaveEarth() {
  guardarSeccion('google_earth', { ...seccion(), clave: crypto.randomBytes(24).toString('hex') });
}

export function claveEarthValida(clave) {
  const actual = seccion().clave;
  if (!actual || typeof clave !== 'string' || clave.length !== actual.length) return false;
  return crypto.timingSafeEqual(Buffer.from(clave), Buffer.from(actual));
}

/** Vínculo del proyecto de Google Earth que tiene importado el enlace (lo abre el botón "Google Earth"). */
export const proyectoEarth = () => seccion().proyecto_url ?? '';

export function guardarProyectoEarth(url) {
  const limpio = String(url ?? '').trim();
  if (limpio && !/^https:\/\/earth\.google\.com\/\S+$/.test(limpio)) {
    throw new ErrorApp('Pegue el vínculo del proyecto tal como lo copia Google Earth (empieza con https://earth.google.com/)');
  }
  guardarSeccion('google_earth', { ...seccion(), proyecto_url: limpio });
}

const georreferencia = () => {
  const g = leerSeccion('plano')?.georreferencia;
  if (!g) throw new ErrorApp('El plano no está georreferenciado: no se puede ver en Google Earth', 404);
  return g;
};

/** Centro del loteo en latitud y longitud (para abrir Google Earth ahí). */
export function centroLoteo() {
  const g = georreferencia();
  const pts = db.all('SELECT poligono FROM parcelas WHERE poligono IS NOT NULL').flatMap((p) => JSON.parse(p.poligono));
  if (!pts.length) return null;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x = (Math.min(...xs) + Math.max(...xs)) / 2, y = (Math.min(...ys) + Math.max(...ys)) / 2;
  return { lat: g.lat[0] * x + g.lat[1] * y + g.lat[2], lng: g.lng[0] * x + g.lng[1] * y + g.lng[2] };
}

/**
 * KML con el contorno de cada parcela (código, estado, superficie y precio), en carpetas por manzana.
 * `conCompradores` agrega el nombre del comprador: solo en el archivo que se descarga con sesión iniciada.
 */
export function kmlParcelas({ conCompradores }) {
  const g = georreferencia();
  const aGeo = ([x, y]) => `${(g.lng[0] * x + g.lng[1] * y + g.lng[2]).toFixed(7)},${(g.lat[0] * x + g.lat[1] * y + g.lat[2]).toFixed(7)},0`;
  const parcelas = db.all(
    `SELECT p.numero, p.sector, p.superficie_m2, p.precio, p.estado, p.poligono, c.nombre AS cliente
       FROM parcelas p
       LEFT JOIN ventas v ON v.parcela_id = p.id AND v.estado <> 'anulada'
       LEFT JOIN clientes c ON c.id = v.cliente_id
      WHERE p.poligono IS NOT NULL`,
  ).sort(ordenNatural);
  const { nombre } = leerSeccion('proyecto');
  const porManzana = new Map();
  for (const p of parcelas) {
    const pts = JSON.parse(p.poligono);
    if (pts.length < 3) continue;
    const anillo = [...pts, pts[0]].map(aGeo).join(' ');
    const detalle = [
      ETIQUETA_ESTADO[p.estado],
      `${Math.round(p.superficie_m2).toLocaleString('es-CL')} m²`,
      p.estado === 'vendida' ? (conCompradores && p.cliente ? `Comprador: ${p.cliente}` : '') : p.precio > 0 ? `Precio: ${pesos(p.precio)}` : '',
    ].filter(Boolean).join(' · ');
    const marca = `<Placemark><name>${xml(p.numero)}</name><description>${xml(detalle)}</description><styleUrl>#${p.estado}</styleUrl>`
      + `<Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>${anillo}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`;
    const m = p.sector || 'Sin manzana';
    porManzana.set(m, [...(porManzana.get(m) ?? []), marca]);
  }
  const estilos = Object.entries(COLOR_KML).map(([e, color]) =>
    `<Style id="${e}"><LineStyle><color>ffffffff</color><width>1.5</width></LineStyle><PolyStyle><color>66${color.slice(2)}</color></PolyStyle>`
    + `<LabelStyle><scale>0.8</scale></LabelStyle></Style>`).join('');
  const carpetas = [...porManzana].map(([m, marcas]) => `<Folder><name>${xml(m)}</name>${marcas.join('')}</Folder>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(nombre || 'Parcelas')}</name>`
    + `<description>Parcelas del loteo al ${new Date().toISOString().slice(0, 10)}. Verde: disponible · Amarillo: reservada · Gris: vendida.</description>${estilos}${carpetas}</Document></kml>`;
}

/** KML chico que se importa una vez en Google Earth: apunta al KML público de este servidor y lo vuelve a leer. */
export function kmlEnlace(urlKml) {
  const { nombre } = leerSeccion('proyecto');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(nombre || 'Parcelas')} (al día desde el sistema)</name>`
    + `<NetworkLink><name>Parcelas ${xml(nombre || '')}</name><open>1</open><flyToView>1</flyToView>`
    + `<Link><href>${xml(urlKml)}</href><refreshMode>onInterval</refreshMode><refreshInterval>600</refreshInterval></Link>`
    + '</NetworkLink></Document></kml>';
}

/** Nombre de archivo sin tildes ni espacios: "parcelas-fundo-entre-rios". */
export const nombreArchivo = (prefijo) => {
  const { nombre } = leerSeccion('proyecto');
  return `${prefijo}-${(nombre || 'loteo').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')}`;
};
