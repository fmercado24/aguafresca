import { Router } from 'express';
import { db, insertar, actualizar } from '../db.js';
import { esFecha } from '../lib/fechas.js';
import { requiere, puede, PERFILES } from '../auth.js';
import { avisarVisita } from '../lib/avisos.js';
import { ErrorApp, leer, texto, entero, fechaHora, opcion, idDe, telefono, correo } from '../lib/validar.js';

export const rutasVisitas = Router();

const ESTADOS = ['programada', 'confirmada', 'realizada', 'cancelada', 'no_asistio'];

const esquema = {
  inicio: fechaHora({ req: true }),
  duracion_min: entero({ min: 15, max: 600, def: 60 }),
  nombre: texto({ req: true, max: 160 }),
  telefono: telefono({ movil: true }),
  email: correo(),
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
      `SELECT vi.*, u.nombre AS vendedor, uc.nombre AS creador_nombre, uc.rol AS creador_rol
         FROM visitas vi LEFT JOIN usuarios u ON u.id = vi.vendedor_id
         LEFT JOIN usuarios uc ON uc.id = vi.creado_por
        WHERE substr(vi.inicio, 1, 10) BETWEEN ? AND ?
        ORDER BY vi.inicio, vi.id`,
      desde, hasta,
    ).map(({ creador_nombre, creador_rol, ...v }) => {
      const parcela_ids = JSON.parse(v.parcela_ids).filter((id) => numeros.has(id));
      // "Agendada por Luis Díaz (Usuario)"
      const agendada_por = creador_nombre ? `${creador_nombre} (${PERFILES[creador_rol] ?? creador_rol})` : null;
      return { ...v, parcela_ids, parcelas: parcela_ids.map((id) => numeros.get(id)), agendada_por };
    }),
  );
});

// Quien no puede modificar todas las visitas (el usuario) agenda a su nombre y solo cambia las que agendó.
function visitaModificable(req, id) {
  const actual = db.get('SELECT * FROM visitas WHERE id = ?', id);
  if (!actual) throw new ErrorApp('La visita no existe', 404);
  if (!puede(req.usuario, 'visitas_todas') && actual.creado_por !== req.usuario.id) {
    throw new ErrorApp('Solo puede modificar las visitas que usted agendó', 403);
  }
  return actual;
}

rutasVisitas.post('/visitas', requiere('visitas'), (req, res) => {
  const d = leerVisita(req.body);
  d.creado_por = req.usuario.id;
  if (!puede(req.usuario, 'visitas_todas') || !d.vendedor_id) d.vendedor_id = req.usuario.id;
  const id = db.tx(() => {
    const nueva = insertar('visitas', d);
    avisarVisita({ ...d, id: nueva }, 'creada', req.usuario);
    return nueva;
  });
  res.status(201).json({ id });
});

rutasVisitas.put('/visitas/:id', requiere('visitas'), (req, res) => {
  const id = idDe(req.params.id);
  const actual = visitaModificable(req, id);
  const d = leerVisita(req.body);
  if (!puede(req.usuario, 'visitas_todas')) d.vendedor_id = req.usuario.id;
  db.tx(() => {
    actualizar('visitas', id, d);
    const nueva = { ...actual, ...d };
    if (d.estado === 'cancelada' && actual.estado !== 'cancelada') avisarVisita(nueva, 'cancelada', req.usuario);
    else if (d.inicio !== actual.inicio && d.estado !== 'cancelada') avisarVisita(nueva, 'reprogramada', req.usuario);
  });
  res.json({ ok: true });
});

rutasVisitas.delete('/visitas/:id', requiere('visitas'), (req, res) => {
  const id = idDe(req.params.id);
  const actual = visitaModificable(req, id);
  db.tx(() => {
    db.run('DELETE FROM visitas WHERE id = ?', id);
    if (['programada', 'confirmada'].includes(actual.estado)) avisarVisita(actual, 'eliminada', req.usuario);
  });
  res.json({ ok: true });
});
