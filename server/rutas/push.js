import { Router } from 'express';
import { clavesPush, guardarSuscripcion, quitarSuscripcion, suscripcionesDe, enviarPush } from '../lib/push.js';
import { leer, texto } from '../lib/validar.js';

// Avisos push: cada persona los activa en cada equipo (computador o celular) donde quiere recibirlos.
export const rutasPush = Router();

rutasPush.get('/push/clave', (req, res) => res.json({ publica: clavesPush().publica }));

rutasPush.get('/push/suscripciones', (req, res) => res.json(suscripcionesDe(req.usuario.id)));

rutasPush.post('/push/suscripcion', (req, res) => {
  const { equipo } = leer(req.body, { equipo: texto({ max: 120 }) });
  guardarSuscripcion(req.usuario.id, req.body?.suscripcion, equipo);
  res.status(201).json({ ok: true });
});

rutasPush.delete('/push/suscripcion', (req, res) => {
  res.json({ ok: true, quitadas: quitarSuscripcion(req.usuario.id, req.body?.endpoint) });
});

/** Aviso de prueba a los equipos de la persona, para confirmar que le llegan. */
rutasPush.post('/push/prueba', async (req, res) => {
  const enviados = await enviarPush(req.usuario.id, {
    titulo: 'Avisos activados',
    detalle: 'Así le llegarán los avisos de visitas y ventas, aunque no esté usando el sistema.',
    enlace: '/',
  });
  res.json({ enviados });
});
