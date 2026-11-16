import express from 'express';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import './db.js';
import { autenticar, exigirCabecera, asegurarUsuarios } from './auth.js';
import { ErrorApp } from './lib/validar.js';
import { rutasAuth } from './rutas/auth.js';
import { rutasConfiguracion } from './rutas/configuracion.js';
import { rutasParcelas } from './rutas/parcelas.js';
import { rutasAvisos } from './rutas/avisos.js';
import { rutasEnvios } from './rutas/envios.js';
import { rutasPush } from './rutas/push.js';
import { rutasClientes } from './rutas/clientes.js';
import { rutasVentas } from './rutas/ventas.js';
import { rutasCobranza } from './rutas/cobranza.js';
import { rutasCotizaciones } from './rutas/cotizaciones.js';
import { rutasVisitas } from './rutas/visitas.js';
import { rutasDocumentos, asegurarPlantillasBase } from './rutas/documentos.js';

asegurarUsuarios();
asegurarPlantillasBase();

export const app = express();
app.disable('x-powered-by');
if (config.confiarProxy) app.set('trust proxy', Number(config.confiarProxy) || config.confiarProxy);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      // Los documentos confeccionados llevan estilos en línea (alineación, negritas).
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      // Sin esto el navegador forzaría HTTPS también al usar el sistema en la red local.
      upgradeInsecureRequests: null,
    },
  },
}));

// ---------- API ----------

const api = express.Router();
api.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
api.use(express.json({ limit: '2mb' }));
api.use(exigirCabecera);
api.use(rutasAuth);
api.use(autenticar);
api.use(rutasConfiguracion);
api.use(rutasParcelas);
api.use(rutasClientes);
api.use(rutasVentas);
api.use(rutasCobranza);
api.use(rutasCotizaciones);
api.use(rutasVisitas);
api.use(rutasDocumentos);
api.use(rutasAvisos);
api.use(rutasEnvios);
api.use(rutasPush);
api.use((req, res) => res.status(404).json({ error: 'Recurso no encontrado' }));

// Errores de la API: los esperados (ErrorApp) muestran su mensaje; el resto se registra y se oculta.
api.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof ErrorApp) return res.status(err.estado).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Solicitud mal formada' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'El contenido enviado es demasiado grande' });
  const unico = /UNIQUE constraint failed: (\w+)\.(\w+)/.exec(err.message || '');
  if (unico) {
    const que = { 'parcelas.numero': 'una parcela con ese número', 'clientes.rut': 'un cliente con ese RUT' }[`${unico[1]}.${unico[2]}`];
    return res.status(409).json({ error: `Ya existe ${que || 'un registro con ese valor'}` });
  }
  if (/FOREIGN KEY constraint failed/.test(err.message || '')) {
    return res.status(409).json({ error: 'No se puede completar la operación: hay registros asociados' });
  }
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({ error: 'Ocurrió un error interno. Intente nuevamente.' });
});

app.use('/api', api);

// ---------- Aplicación web (resultado de `npm run build`) ----------

const dirWeb = path.join(config.raiz, 'client', 'dist');
if (fs.existsSync(path.join(dirWeb, 'index.html'))) {
  app.use(express.static(dirWeb, {
    index: false,
    setHeaders(res, archivo) {
      // Los archivos de /assets llevan un hash en el nombre: se pueden guardar en caché indefinidamente.
      res.set('Cache-Control', archivo.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || path.extname(req.path)) return next();
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(dirWeb, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.type('text/plain; charset=utf-8').send('La aplicación web aún no está compilada. Ejecute "npm run build" (o "npm run dev" para desarrollo).');
  });
}
