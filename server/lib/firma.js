// Firma del representante legal (imagen escaneada o dibujada). Va en el pie de firma de los comprobantes
// de pago, las cotizaciones, el estado de cuenta y las cartas de cobranza. Se guarda como archivo en la
// carpeta de datos (se respalda junto con la base) y su referencia en la configuración ("firma").
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { leerSeccion, guardarSeccion, LEYENDA_FIRMA } from './configuracion.js';
import { ErrorApp } from './validar.js';

const TIPOS = { 'image/png': 'png', 'image/jpeg': 'jpg' };
export const MAX_BYTES_FIRMA = 300_000;

const ruta = (archivo) => path.join(config.dirDatos, path.basename(archivo));

/** { tipo, version, datos (Buffer) } o null si no hay firma cargada. */
export function leerFirma() {
  const f = leerSeccion('firma');
  if (!f?.archivo || !fs.existsSync(ruta(f.archivo))) return null;
  return { tipo: f.tipo, version: f.version, datos: fs.readFileSync(ruta(f.archivo)) };
}

/** Recibe la imagen como "data URL" (data:image/png;base64,…). */
export function guardarFirma(dataUrl) {
  const m = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl ?? ''));
  if (!m) throw new ErrorApp('La firma debe ser una imagen PNG o JPG');
  const datos = Buffer.from(m[2], 'base64');
  if (!datos.length) throw new ErrorApp('La imagen de la firma está vacía');
  if (datos.length > MAX_BYTES_FIRMA) throw new ErrorApp('La imagen de la firma es muy pesada: use una de menos de 300 KB');
  const anterior = leerSeccion('firma');
  const archivo = `firma-representante.${TIPOS[m[1]]}`;
  fs.mkdirSync(config.dirDatos, { recursive: true });
  fs.writeFileSync(ruta(archivo), datos);
  if (anterior?.archivo && anterior.archivo !== archivo) fs.rmSync(ruta(anterior.archivo), { force: true });
  guardarSeccion('firma', { archivo, tipo: m[1], version: Date.now() });
}

export function quitarFirma() {
  const f = leerSeccion('firma');
  if (f?.archivo) fs.rmSync(ruta(f.archivo), { force: true });
  guardarSeccion('firma', {});
}

const escapar = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * Pie de firma en HTML para las cartas: la firma (si está cargada) y bajo ella solo la leyenda de la empresa
 * ("Soc. de Inv. e Inmob. Agua Fresca SpA"). La imagen va dentro del documento (data URL) para que quede fija en la
 * carta emitida; al enviarla por correo se adjunta como imagen.
 */
export function bloqueFirmaHtml() {
  const f = leerFirma();
  const imagen = f ? `<img class="firma-digital" src="data:${f.tipo};base64,${f.datos.toString('base64')}" alt="Firma" />` : '<br /><br />';
  return `<div class="pie-firma">${imagen}<p>${escapar(LEYENDA_FIRMA)}</p></div>`;
}
