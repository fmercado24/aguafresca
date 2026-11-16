// Carga en la base de datos los lotes del plano del topógrafo (server/datos/loteo.json):
// crea las parcelas que faltan (con precio por definir) y deja el plano como fondo del mapa.
// Uso:  node server/importar-loteo.js        (lo hace iniciar.sh la primera vez)
import { importarLoteo } from './lib/loteo.js';

const r = importarLoteo(null);
if (!r) {
  console.error('No se encontró el plano del loteo (server/datos/loteo.json).');
  process.exit(1);
}
console.log(`Plano del loteo: ${r.creadas} parcelas creadas y ${r.ubicadas} reubicadas en el mapa (${r.total} lotes en el plano).`);
