import { Router } from 'express';
import { db, insertar, actualizar } from '../db.js';
import { simular } from './ventas.js';
import { hoy } from '../lib/fechas.js';
import { rutValido, normalizarRut } from '../lib/rut.js';
import { ErrorApp, leer, texto, entero, decimal, fecha, opcion, idDe } from '../lib/validar.js';

export const rutasCotizaciones = Router();

const esquema = {
  parcela_id: entero({ req: true, min: 1 }),
  cliente_id: entero({ min: 1 }),
  contacto_nombre: texto({ max: 160 }),
  contacto_rut: texto({ max: 15 }),
  contacto_telefono: texto({ max: 40 }),
  contacto_email: texto({ max: 160 }),
  fecha: fecha({ req: true }),
  valida_hasta: fecha({ req: true }),
  precio_lista: entero({ req: true, min: 1 }),
  descuento: entero({ min: 0, def: 0 }),
  pie: entero({ min: 0, def: 0 }),
  n_cuotas: entero({ min: 0, max: 360, def: 0 }),
  tasa_mensual: decimal({ min: 0, max: 15, def: 0 }),
  fecha_primera_cuota: fecha(),
  observaciones: texto({ max: 3000 }),
};

function leerCotizacion(cuerpo) {
  const d = leer(cuerpo, esquema);
  if (!db.get('SELECT id FROM parcelas WHERE id = ?', d.parcela_id)) throw new ErrorApp('La parcela no existe', 404);
  if (d.descuento >= d.precio_lista) throw new ErrorApp('El descuento debe ser menor que el precio de lista');
  if (d.valida_hasta < d.fecha) throw new ErrorApp('La vigencia no puede terminar antes de la fecha de la cotización');

  if (d.cliente_id) {
    const cl = db.get('SELECT nombre, rut, telefono, email FROM clientes WHERE id = ?', d.cliente_id);
    if (!cl) throw new ErrorApp('El cliente no existe', 404);
    d.contacto_nombre ||= cl.nombre;
    d.contacto_rut ||= cl.rut;
    d.contacto_telefono ||= cl.telefono;
    d.contacto_email ||= cl.email;
  }
  if (!d.contacto_nombre) throw new ErrorApp('Indique el nombre del interesado o seleccione un cliente');
  if (d.contacto_rut) {
    if (!rutValido(d.contacto_rut)) throw new ErrorApp('RUT del interesado: no es válido (revise el dígito verificador)');
    d.contacto_rut = normalizarRut(d.contacto_rut);
  }

  d.precio = d.precio_lista - d.descuento;
  const s = simular(d);
  if (s.monto_financiado > 0 && s.n_cuotas === 0) throw new ErrorApp('Indique el número de cuotas, o un pie igual al precio para venta al contado');
  d.n_cuotas = s.n_cuotas;
  d.valor_cuota = s.valor_cuota;
  if (s.n_cuotas === 0) d.tasa_mensual = 0;
  return d;
}

rutasCotizaciones.get('/cotizaciones', (req, res) => {
  const fechaHoy = hoy();
  res.json(
    db.all(
      `SELECT q.id, q.fecha, q.valida_hasta, q.contacto_nombre, q.contacto_telefono, q.precio, q.pie, q.n_cuotas,
              q.valor_cuota, q.estado, q.cliente_id, p.id AS parcela_id, p.numero AS parcela, p.estado AS parcela_estado,
              u.nombre AS usuario, (SELECT v.id FROM ventas v WHERE v.cotizacion_id = q.id LIMIT 1) AS venta_id
         FROM cotizaciones q
         JOIN parcelas p ON p.id = q.parcela_id
         LEFT JOIN usuarios u ON u.id = q.usuario_id
        ORDER BY q.id DESC`,
    ).map((q) => ({ ...q, vencida: q.estado === 'vigente' && q.valida_hasta < fechaHoy })),
  );
});

rutasCotizaciones.get('/cotizaciones/:id', (req, res) => {
  const q = db.get(
    `SELECT q.*, u.nombre AS usuario, (SELECT v.id FROM ventas v WHERE v.cotizacion_id = q.id LIMIT 1) AS venta_id
       FROM cotizaciones q LEFT JOIN usuarios u ON u.id = q.usuario_id WHERE q.id = ?`,
    idDe(req.params.id),
  );
  if (!q) throw new ErrorApp('La cotización no existe', 404);
  res.json({
    cotizacion: { ...q, vencida: q.estado === 'vigente' && q.valida_hasta < hoy() },
    parcela: db.get('SELECT id, numero, sector, superficie_m2, precio, estado, rol_sii, descripcion FROM parcelas WHERE id = ?', q.parcela_id),
    simulacion: simular(q),
  });
});

rutasCotizaciones.post('/cotizaciones', (req, res) => {
  const id = insertar('cotizaciones', { ...leerCotizacion(req.body), usuario_id: req.usuario.id });
  res.status(201).json({ id });
});

rutasCotizaciones.put('/cotizaciones/:id', (req, res) => {
  const id = idDe(req.params.id);
  const actual = db.get('SELECT estado FROM cotizaciones WHERE id = ?', id);
  if (!actual) throw new ErrorApp('La cotización no existe', 404);
  if (actual.estado === 'aceptada') throw new ErrorApp('La cotización ya fue aceptada y dio origen a una venta; no se puede modificar', 409);
  actualizar('cotizaciones', id, leerCotizacion(req.body));
  res.json({ ok: true });
});

rutasCotizaciones.post('/cotizaciones/:id/estado', (req, res) => {
  const id = idDe(req.params.id);
  const { estado } = leer(req.body, { estado: opcion(['vigente', 'rechazada'], { req: true }) });
  const actual = db.get('SELECT estado FROM cotizaciones WHERE id = ?', id);
  if (!actual) throw new ErrorApp('La cotización no existe', 404);
  if (actual.estado === 'aceptada') throw new ErrorApp('La cotización ya fue aceptada', 409);
  actualizar('cotizaciones', id, { estado });
  res.json({ ok: true });
});

rutasCotizaciones.delete('/cotizaciones/:id', (req, res) => {
  if (!db.run('DELETE FROM cotizaciones WHERE id = ?', idDe(req.params.id)).changes) throw new ErrorApp('La cotización no existe', 404);
  res.json({ ok: true });
});
