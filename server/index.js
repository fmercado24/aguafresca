import os from 'node:os';
import { config } from './config.js';
import { app } from './app.js';

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
app.listen(config.puerto, (error) => {
  if (error) return noPudoIniciar(error);
  console.log('Agua Fresca · Fundo Entre Ríos — sistema de gestión');
  console.log(`  En este computador:  http://localhost:${config.puerto}`);
  for (const red of Object.values(os.networkInterfaces()).flat()) {
    if (red && red.family === 'IPv4' && !red.internal) {
      console.log(`  En la red local:     http://${red.address}:${config.puerto}`);
    }
  }
  console.log('  Para detenerlo: Ctrl + C');
});
