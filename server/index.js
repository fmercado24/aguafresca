import os from 'node:os';
import { config } from './config.js';
import { app } from './app.js';
import { revisarProgramacion } from './lib/envios.js';
import { recordatoriosDeVisitas } from './lib/avisos.js';
import { aplicarCorrecciones } from './lib/correcciones.js';

function noPudoIniciar(e) {
  if (e.code === 'EADDRINUSE') {
    console.error(`\nEl puerto ${config.puerto} ya está en uso: probablemente el sistema ya está abierto en otra ventana.`);
    console.error(`Abra http://localhost:${config.puerto} o inicie en otro puerto:  ./iniciar.sh --puerto ${config.puerto + 1}\n`);
  } else {
    console.error('No se pudo iniciar el servidor:', e);
  }
  process.exit(1);
}

// En Express 5 esta función se llama también si el servidor no logra iniciar (con el error como argumento).
// Correcciones de datos pendientes (se aplican una sola vez, después de una actualización).
try {
  for (const r of aplicarCorrecciones()) {
    console.log(`Corrección de datos — ${r.titulo}: ${r.corregidas.join(', ') || 'ninguna'}`);
    for (const o of r.omitidas) console.log(`  Sin corregir: ${o}`);
  }
} catch (e) {
  console.error('No se pudieron aplicar las correcciones de datos (se reintentará al reiniciar):', e);
}

const direccion = config.host ? [config.puerto, config.host] : [config.puerto];
app.listen(...direccion, (error) => {
  if (error) return noPudoIniciar(error);
  console.log('Agua Fresca · Fundo Entre Ríos — sistema de gestión');
  console.log(`  En este computador:  http://localhost:${config.puerto}`);
  const enTodas = !config.host || config.host === '0.0.0.0' || config.host === '::';
  for (const red of enTodas ? Object.values(os.networkInterfaces()).flat() : []) {
    if (red && red.family === 'IPv4' && !red.internal) {
      console.log(`  En la red local:     http://${red.address}:${config.puerto}`);
    }
  }
  if (process.stdout.isTTY) console.log('  Para detenerlo: Ctrl + C');

  // Envío programado de cartas de cobranza: se revisa cada 5 minutos si ya es la hora configurada.
  const revisar = () => revisarProgramacion()
    .then((r) => r && console.log(`Cartas de cobranza programadas: ${r.detalle}`))
    .catch((e) => console.error('Envío programado de cartas:', e.message));
  setTimeout(revisar, 20_000);
  setInterval(revisar, 5 * 60_000).unref();

  // Recordatorios de visitas (24 horas y una hora antes): se revisan cada minuto, para que los avisos push
  // lleguen aunque nadie esté usando el sistema.
  const recordar = () => { try { recordatoriosDeVisitas(); } catch (e) { console.error('Recordatorios de visitas:', e.message); } };
  setTimeout(recordar, 5_000);
  setInterval(recordar, 60_000).unref();
});
