import { db } from '../db.js';
import { representanteDe } from './datos-personales.js';

// Lugar que encabeza todos los documentos junto a la fecha ("Punta Arenas, 24 de noviembre de 2026"), a pedido del cliente.
export const LUGAR_EMISION = 'Punta Arenas';

// Única leyenda bajo la firma en los documentos (a pedido del cliente: sin nombre, RUT ni cargo del representante).
export const LEYENDA_FIRMA = 'Soc. de Inv. e Inmob. Agua Fresca SpA';

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
    // '' = el representante se escribe a mano; 'ldiaz' o 'pmercado' = se toma de sus datos personales.
    representante_cuenta: '',
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
    // Pie habitual en pesos (se propone al cotizar y al vender; si el precio es menor, el pie es el precio).
    pie_monto: 3_000_000,
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
  // El representante que ven las pantallas y los documentos es el efectivo (el del perfil del dueño designado).
  const empresa = leerSeccion('empresa');
  const rep = representanteDe(empresa);
  return {
    empresa: { ...empresa, representante: rep.nombre_completo, rut_representante: rep.rut },
    proyecto: leerSeccion('proyecto'),
    credito: leerSeccion('credito'),
    plano: leerSeccion('plano'),
    lugar_emision: LUGAR_EMISION,
    leyenda_firma: LEYENDA_FIRMA,
    // Solo si hay firma cargada: la versión sirve para que el navegador no muestre una imagen anterior.
    firma: leerSeccion('firma')?.archivo ? { version: leerSeccion('firma').version } : null,
  };
}
