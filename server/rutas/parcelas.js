import express, { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { db, insertar, actualizar } from '../db.js';
import { config } from '../config.js';
import { requiere, exigir } from '../auth.js';
import { registrar, diferencias, describirCambios } from '../lib/bitacora.js';
import { pesos } from '../lib/finanzas.js';
import { leerSeccion, guardarSeccion } from '../lib/configuracion.js';
import { resumenLoteo, importarLoteo } from '../lib/loteo.js';
import { ErrorApp, leer, texto, entero, decimal, opcion, idDe, rolSii } from '../lib/validar.js';

export const rutasParcelas = Router();

const ESTADOS = ['disponible', 'reservada', 'vendida', 'bloqueada'];

const esquema = {
  numero: texto({ req: true, max: 20 }),
  sector: texto({ max: 80 }),
  superficie_m2: decimal({ req: true, min: 0, max: 100_000_000 }),
  precio: entero({ req: true, min: 0 }),
  estado: opcion(ESTADOS),
  rol_sii: rolSii(),
  deslindes: texto({ max: 3000 }),
  descripcion: texto({ max: 3000 }),
};

const ordenNatural = (a, b) => a.numero.localeCompare(b.numero, 'es', { numeric: true });
const salida = (p) => ({ ...p, poligono: p.poligono ? JSON.parse(p.poligono) : null });

const ventaActiva = (parcelaId) =>
  db.get("SELECT id FROM ventas WHERE parcela_id = ? AND estado <> 'anulada'", parcelaId);

rutasParcelas.get('/parcelas', (req, res) => {
  const filas = db.all(
    `SELECT p.*, v.id AS venta_id, c.id AS cliente_id, c.nombre AS cliente
       FROM parcelas p
       LEFT JOIN ventas v ON v.parcela_id = p.id AND v.estado <> 'anulada'
       LEFT JOIN clientes c ON c.id = v.cliente_id`,
  );
  res.json(filas.sort(ordenNatural).map(salida));
});

rutasParcelas.post('/parcelas', requiere('parcelas'), (req, res) => {
  const id = insertar('parcelas', leer(req.body, esquema));
  res.status(201).json({ id });
});

rutasParcelas.put('/parcelas/:id', requiere('parcelas'), (req, res) => {
  const id = idDe(req.params.id);
  const d = leer(req.body, esquema);
  const actual = db.get('SELECT * FROM parcelas WHERE id = ?', id);
  if (!actual) throw new ErrorApp('La parcela no existe', 404);
  if (d.estado !== 'vendida' && ventaActiva(id)) {
    throw new ErrorApp('La parcela tiene una venta registrada: su estado es "vendida" mientras la venta no se anule', 409);
  }
  const cambios = diferencias(
    { ...actual, precio: pesos(actual.precio) }, { ...d, precio: pesos(d.precio) },
    { numero: 'Número', sector: 'Manzana', superficie_m2: 'Superficie m²', precio: 'Precio', estado: 'Estado', rol_sii: 'Rol SII', deslindes: 'Deslindes' },
  );
  db.tx(() => {
    actualizar('parcelas', id, d);
    if (cambios.length) registrar(req.usuario.id, { accion: 'parcela_editada', entidad: 'parcela', entidadId: id, detalle: `Parcela ${actual.numero}: ${describirCambios(cambios)}` });
  });
  res.json({ ok: true });
});

// Precio de lista: el super administrador y los dueños.
rutasParcelas.put('/parcelas/:id/precio', requiere('precios'), (req, res) => {
  const id = idDe(req.params.id);
  const { precio } = leer(req.body, { precio: entero({ req: true, min: 0, max: 100_000_000_000 }) });
  const actual = db.get('SELECT numero, precio FROM parcelas WHERE id = ?', id);
  if (!actual) throw new ErrorApp('La parcela no existe', 404);
  if (actual.precio === precio) return res.json({ ok: true, cambios: 0 });
  db.tx(() => {
    actualizar('parcelas', id, { precio });
    registrar(req.usuario.id, { accion: 'parcela_editada', entidad: 'parcela', entidadId: id, detalle: `Parcela ${actual.numero}: Precio: ${pesos(actual.precio)} → ${pesos(precio)}` });
  });
  res.json({ ok: true, cambios: 1 });
});

// Reservar o liberar una parcela: contador y super administrador.
rutasParcelas.post('/parcelas/:id/estado', requiere('operaciones'), (req, res) => {
  const id = idDe(req.params.id);
  const { estado } = leer(req.body, { estado: opcion(['disponible', 'reservada'], { req: true }) });
  const actual = db.get('SELECT estado FROM parcelas WHERE id = ?', id);
  if (!actual) throw new ErrorApp('La parcela no existe', 404);
  if (!['disponible', 'reservada'].includes(actual.estado)) {
    throw new ErrorApp('Solo se puede reservar o liberar una parcela disponible o reservada', 409);
  }
  actualizar('parcelas', id, { estado });
  res.json({ ok: true });
});

// ---------- Cambios en bloque (precios de lista y sectores) ----------

const nombreAccion = { precio: 'Precio de lista', precio_m2: 'Precio por m²', sector: 'Manzana' };

// Precios en bloque: super administrador y contador. Manzana y códigos: solo el super administrador.
rutasParcelas.post('/parcelas/masivo', (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 5000 || !ids.every((x) => Number.isInteger(x) && x > 0)) {
    throw new ErrorApp('Indique las parcelas a modificar');
  }
  const d = leer(req.body, {
    accion: opcion(Object.keys(nombreAccion), { req: true }),
    monto: entero({ min: 1, max: 100_000_000_000 }),
    sector: texto({ max: 80 }),
    prefijo: texto({ max: 10 }),
  });
  exigir(req.usuario, d.accion === 'sector' ? 'parcelas' : 'precios');
  const parcelas = db.all(`SELECT * FROM parcelas WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids);
  if (parcelas.length !== new Set(ids).size) throw new ErrorApp('Alguna de las parcelas ya no existe', 404);

  const cambios = [];
  let omitidas = 0;
  if (d.accion === 'precio' || d.accion === 'precio_m2') {
    if (!d.monto) throw new ErrorApp(d.accion === 'precio' ? 'Indique el precio de lista' : 'Indique el valor por m²');
    for (const p of parcelas) {
      // Las vendidas conservan su precio: la venta ya tiene el suyo.
      if (p.estado === 'vendida') { omitidas++; continue; }
      // Por m²: se redondea a miles de pesos.
      const precio = d.accion === 'precio' ? d.monto : Math.round((p.superficie_m2 * d.monto) / 1000) * 1000;
      if (precio !== p.precio) cambios.push({ p, valores: { precio }, texto: `${p.numero}: ${pesos(p.precio)} → ${pesos(precio)}` });
    }
  } else {
    if (!d.sector) throw new ErrorApp('Indique el nombre de la manzana');
    const prefijo = d.prefijo.replace(/-+$/, '');
    if (prefijo && !/^[\p{L}\p{N}]+$/u.test(prefijo)) throw new ErrorApp('El prefijo solo puede tener letras y números');
    for (const p of parcelas) {
      const valores = {};
      if (p.sector !== d.sector) valores.sector = d.sector;
      // Con prefijo, "A-12" pasa a "<prefijo>-12" (y "12" a "<prefijo>-12").
      if (prefijo) {
        const numero = `${prefijo}-${p.numero.includes('-') ? p.numero.slice(p.numero.lastIndexOf('-') + 1) : p.numero}`;
        if (numero !== p.numero) valores.numero = numero;
      }
      if (Object.keys(valores).length) cambios.push({ p, valores, texto: valores.numero ? `${p.numero} → ${valores.numero}` : p.numero });
    }
    const nuevos = cambios.filter((c) => c.valores.numero);
    const repetido = nuevos.find((c, i) => nuevos.findIndex((x) => x.valores.numero.toLowerCase() === c.valores.numero.toLowerCase()) !== i)
      ?? nuevos.find((c) => {
        const otra = db.get('SELECT id FROM parcelas WHERE numero = ?', c.valores.numero);
        return otra && !nuevos.some((x) => x.p.id === otra.id);
      });
    if (repetido) throw new ErrorApp(`Quedarían dos parcelas con el número ${repetido.valores.numero}: revise el prefijo`, 409);
  }
  if (!cambios.length) return res.json({ cambiadas: 0, omitidas });

  db.tx(() => {
    // Primero un número temporal, por si dos parcelas intercambian números dentro del mismo cambio.
    for (const c of cambios) if (c.valores.numero) actualizar('parcelas', c.p.id, { numero: `~${c.p.id}~${c.valores.numero}` });
    for (const c of cambios) actualizar('parcelas', c.p.id, c.valores);
    const muestra = cambios.slice(0, 40).map((c) => c.texto).join('; ');
    registrar(req.usuario.id, {
      accion: 'parcelas_masivo', entidad: 'parcela',
      detalle: `${nombreAccion[d.accion]}${d.accion === 'sector' ? ` "${d.sector}"` : d.accion === 'precio_m2' ? ` ${pesos(d.monto)}` : ''} en ${cambios.length} parcelas: ${muestra}${cambios.length > 40 ? '…' : ''}`,
      anterior: cambios.map((c) => ({ id: c.p.id, numero: c.p.numero, sector: c.p.sector, precio: c.p.precio })),
    });
  });
  res.json({ cambiadas: cambios.length, omitidas });
});

rutasParcelas.delete('/parcelas/:id', requiere('parcelas'), (req, res) => {
  const id = idDe(req.params.id);
  const usos = db.get(
    `SELECT (SELECT COUNT(*) FROM ventas WHERE parcela_id = ?) + (SELECT COUNT(*) FROM cotizaciones WHERE parcela_id = ?) AS n`,
    id, id,
  ).n;
  if (usos > 0) throw new ErrorApp('No se puede eliminar: la parcela tiene ventas o cotizaciones asociadas', 409);
  const actual = db.get('SELECT numero, precio FROM parcelas WHERE id = ?', id);
  if (!actual) throw new ErrorApp('La parcela no existe', 404);
  db.tx(() => {
    db.run('DELETE FROM parcelas WHERE id = ?', id);
    registrar(req.usuario.id, { accion: 'parcela_eliminada', entidad: 'parcela', entidadId: id, detalle: `Parcela ${actual.numero} (${pesos(actual.precio)})` });
  });
  res.json({ ok: true });
});

// ---------- Mapa: ubicación de cada parcela sobre el plano ----------

rutasParcelas.put('/parcelas/:id/poligono', requiere('parcelas'), (req, res) => {
  const id = idDe(req.params.id);
  let poligono = req.body?.poligono ?? null;
  if (poligono !== null) {
    const valido = Array.isArray(poligono) && poligono.length >= 3 && poligono.length <= 200 &&
      poligono.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => Number.isFinite(n) && n >= -500 && n <= 10000));
    if (!valido) throw new ErrorApp('El contorno de la parcela no es válido (mínimo 3 puntos)');
    poligono = JSON.stringify(poligono.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]));
  }
  if (!actualizar('parcelas', id, { poligono })) throw new ErrorApp('La parcela no existe', 404);
  res.json({ ok: true });
});

const TIPOS_PLANO = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

function pareceImagen(buf, tipo) {
  if (tipo === 'image/png') return buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  if (tipo === 'image/jpeg') return buf.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (tipo === 'image/webp') return buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP';
  return false;
}

function borrarPlanoActual() {
  const plano = leerSeccion('plano');
  if (plano?.archivo) fs.rmSync(path.join(config.dirDatos, path.basename(plano.archivo)), { force: true });
}

rutasParcelas.get('/mapa/plano', (req, res) => {
  const plano = leerSeccion('plano');
  if (!plano?.archivo) throw new ErrorApp('No hay plano cargado', 404);
  res.sendFile(path.basename(plano.archivo), {
    root: config.dirDatos,
    headers: {
      // El plano del topógrafo es un dibujo vectorial (JSON); los subidos a mano son imágenes.
      'Content-Type': plano.tipo === 'vectorial' ? 'application/json; charset=utf-8' : plano.tipo,
      'Cache-Control': 'private, max-age=31536000, immutable',
      // El plano se sirve solo como imagen: nunca debe poder ejecutar contenido activo.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
});

rutasParcelas.post(
  '/mapa/plano',
  requiere('parcelas'),
  express.raw({ type: Object.keys(TIPOS_PLANO), limit: '15mb' }),
  (req, res) => {
    const tipo = (req.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const ext = TIPOS_PLANO[tipo];
    if (!ext || !Buffer.isBuffer(req.body) || !pareceImagen(req.body, tipo)) {
      throw new ErrorApp('El plano debe ser una imagen PNG, JPG o WebP');
    }
    const ancho = Number(req.query.ancho);
    const alto = Number(req.query.alto);
    if (!(ancho > 0 && alto > 0 && ancho <= 30000 && alto <= 30000)) throw new ErrorApp('Dimensiones de imagen inválidas');
    borrarPlanoActual();
    const archivo = `plano.${ext}`;
    fs.writeFileSync(path.join(config.dirDatos, archivo), req.body);
    const plano = { archivo, tipo, ancho, alto, version: Date.now() };
    guardarSeccion('plano', plano);
    res.json(plano);
  },
);

// Plano del topógrafo (server/datos/loteo.json): resumen para confirmar y carga.
rutasParcelas.get('/mapa/loteo', requiere('parcelas'), (req, res) => {
  const resumen = resumenLoteo();
  if (!resumen) throw new ErrorApp('No hay un plano del loteo para cargar', 404);
  res.json(resumen);
});

rutasParcelas.post('/mapa/loteo', requiere('parcelas'), (req, res) => {
  const r = importarLoteo(req.usuario.id);
  if (!r) throw new ErrorApp('No hay un plano del loteo para cargar', 404);
  res.json(r);
});

rutasParcelas.delete('/mapa/plano', requiere('parcelas'), (req, res) => {
  borrarPlanoActual();
  db.run("DELETE FROM configuracion WHERE clave = 'plano'");
  res.json({ ok: true });
});
