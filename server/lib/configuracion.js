import { db } from '../db.js';

// Parámetros generales del sistema, editables desde la pantalla Configuración.
export const VALORES_INICIALES = {
  empresa: {
    razon_social: 'Agua Fresca SpA',
    rut: '',
    giro: '',
    direccion: '',
    ciudad: '',
    telefono: '',
    email: '',
    representante: '',
    rut_representante: '',
    datos_bancarios: '',
  },
  proyecto: {
    nombre: 'Fundo Entre Ríos',
    ubicacion: '',
    inscripcion: '',
  },
  credito: {
    tasa_mensual: 1,
    tasa_mora_mensual: 0,
    n_cuotas: 36,
    pie_porcentaje: 20,
    dias_validez_cotizacion: 15,
    dias_plazo_carta: 10,
  },
};

export function leerSeccion(clave) {
  const fila = db.get('SELECT valor FROM configuracion WHERE clave = ?', clave);
  const guardado = fila ? JSON.parse(fila.valor) : null;
  const inicial = VALORES_INICIALES[clave];
  return inicial ? { ...inicial, ...guardado } : guardado;
}

export function guardarSeccion(clave, valor) {
  db.run(
    'INSERT INTO configuracion (clave, valor) VALUES (?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor',
    clave,
    JSON.stringify(valor),
  );
}

export function leerConfiguracion() {
  return {
    empresa: leerSeccion('empresa'),
    proyecto: leerSeccion('proyecto'),
    credito: leerSeccion('credito'),
    plano: leerSeccion('plano'),
  };
}
