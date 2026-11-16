import { Router } from 'express';
import { db, insertar, actualizar } from '../db.js';
import { esFecha } from '../lib/fechas.js';
import { ErrorApp, leer, texto, entero, fechaHora, opcion, idDe } from '../lib/validar.js';

export const rutasVisitas = Router();

const ESTADOS = ['programada', 'confirmada', 'realizada', 'cancelada', 'no_asistio'];

const esquema = {
  inicio: fechaHora({ req: true }),
  duracion_min: entero({ min: 15, max: 600, def: 60 }),
  nombre: texto({ req: true, max: 160 }),
  telefono: texto({ max: 40 }),
  email: texto({ max: 160 }),
  cliente_id: entero({ min: 1 }),
  vendedor_id: entero({ min: 1 }),
  estado: opcion(ESTADOS),
  notas: texto({ max: 3000 }),
};

function leerVisita(cuerpo) {
  const d = leer(cuerpo, esquema);
  const ids = Array.isArray(cuerpo.parcela_ids) ? cuerpo.parcela_ids : [];
  if (ids.length > 50 || !ids.every((n) => Number.isInteger(n) && n > 0)) throw new ErrorApp('Parcelas de interés: valor inválido');
  d.parcela_ids = JSON.stringify([...new Set(ids)]);
  return d;
}

rutasVisitas.get('/visitas', (req, res) => {
  const desde = esFecha(req.query.desde) ? req.query.desde : '0000-01-01';
  const hasta = esFecha(req.query.hasta) ? req.query.hasta : '9999-12-31';
  const numeros = new Map(db.all('SELECT id, numero FROM parcelas').map((p) => [p.id, p.numero]));
  res.json(
    db.all(
      `SELECT vi.*, u.nombre AS vendedor
         FROM visitas vi LEFT JOIN usuarios u ON u.id = vi.vendedor_id
        WHERE substr(vi.inicio, 1, 10) BETWEEN ? AND ?
        ORDER BY vi.inicio, vi.id`,
      desde, hasta,
    ).map((v) => {
      const parcela_ids = JSON.parse(v.parcela_ids).filter((id) => numeros.has(id));
      return { ...v, parcela_ids, parcelas: parcela_ids.map((id) => numeros.get(id)) };
    }),
  );
});

rutasVisitas.post('/visitas', (req, res) => {
  res.status(201).json({ id: insertar('visitas', leerVisita(req.body)) });
});

rutasVisitas.put('/visitas/:id', (req, res) => {
  if (!actualizar('visitas', idDe(req.params.id), leerVisita(req.body))) throw new ErrorApp('La visita no existe', 404);
  res.json({ ok: true });
});

rutasVisitas.delete('/visitas/:id', (req, res) => {
  if (!db.run('DELETE FROM visitas WHERE id = ?', idDe(req.params.id)).changes) throw new ErrorApp('La visita no existe', 404);
  res.json({ ok: true });
});
