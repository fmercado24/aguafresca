import { Router } from 'express';
import { db } from '../db.js';
import { puede } from '../auth.js';
import { recordatoriosDeVisitas } from '../lib/avisos.js';

// La campana de avisos: cada cuenta ve los suyos.
export const rutasAvisos = Router();

rutasAvisos.get('/avisos', (req, res) => {
  if (puede(req.usuario, 'avisos_visitas')) recordatoriosDeVisitas();
  const avisos = db.all(
    `SELECT id, tipo, titulo, detalle, enlace, creada_en, leida_en FROM notificaciones
      WHERE usuario_id = ? ORDER BY id DESC LIMIT 40`,
    req.usuario.id,
  );
  const { n } = db.get('SELECT COUNT(*) AS n FROM notificaciones WHERE usuario_id = ? AND leida_en IS NULL', req.usuario.id);
  res.json({ no_leidos: n, avisos });
});

/** Marca como leídos los avisos indicados (o todos, si no se indican). */
rutasAvisos.post('/avisos/leidos', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((x) => Number.isInteger(x)) : null;
  if (ids && ids.length) {
    db.run(
      `UPDATE notificaciones SET leida_en = datetime('now') WHERE usuario_id = ? AND leida_en IS NULL AND id IN (${ids.map(() => '?').join(', ')})`,
      req.usuario.id, ...ids,
    );
  } else {
    db.run("UPDATE notificaciones SET leida_en = datetime('now') WHERE usuario_id = ? AND leida_en IS NULL", req.usuario.id);
  }
  res.json({ ok: true });
});
