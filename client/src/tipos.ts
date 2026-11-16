// Formas de los datos que entrega la API.

export type Rol = 'superadmin' | 'abogado' | 'contador';

/**
 * empresa: datos sensibles de la empresa · parcelas: precios y mapa · administracion: cuentas y registro de cambios
 * plantillas: plantillas legales · amortizacion: tabla de amortización · contabilidad: tasas, pagos, anulaciones
 */
export type Permiso = 'empresa' | 'parcelas' | 'administracion' | 'plantillas' | 'amortizacion' | 'contabilidad';

/** Cuenta con sesión iniciada. */
export interface Usuario {
  id: number;
  usuario: string;
  nombre: string;
  rol: Rol;
  perfil: string;
  permisos: Permiso[];
}

/** Elemento de la lista de cuentas (el nombre de usuario y el perfil solo los recibe el super administrador). */
export interface Cuenta {
  id: number;
  nombre: string;
  usuario?: string;
  rol?: Rol;
  perfil?: string;
}

export interface EntradaRegistro {
  id: number;
  fecha: string;
  accion: string;
  detalle: string;
  motivo: string;
  usuario: string | null;
  restaurable?: number;
  entidad?: string;
  entidad_id?: number | null;
  cuenta?: string | null;
}

export interface Plano {
  archivo: string;
  /** Tipo MIME de la imagen de fondo, o 'vectorial' para el plano del topógrafo. */
  tipo: string;
  ancho: number;
  alto: number;
  version: number;
  /** Solo en el plano del topógrafo: archivo de origen, escala y georreferencia (lienzo → lng/lat). */
  fuente?: string;
  metros_por_unidad?: number;
  georreferencia?: { lng: [number, number, number]; lat: [number, number, number] } | null;
}

export type ClaseFondo = 'deslinde' | 'rio' | 'talud' | 'ruta' | 'camino' | 'linea';

/** Dibujo vectorial del plano del topógrafo (caminos, río, deslinde del fundo, rótulos). */
export interface FondoPlano {
  capas: Partial<Record<ClaseFondo, string>>;
  etiquetas: { s: string; x: number; y: number; h: number; r: number; clase: ClaseFondo }[];
}

export interface ResumenLoteo {
  fuente: { dwg: string; kmz: string | null; convertido: string };
  lotes: number;
  sectores: { letra: string; nombre: string; lotes: number }[];
  superficie_total: number;
  nuevas: number;
  existentes: number;
  georreferenciado: boolean;
  plano_cargado: boolean;
  reemplaza_plano: boolean;
}

export interface Empresa {
  razon_social: string;
  rut: string;
  giro: string;
  direccion: string;
  ciudad: string;
  telefono: string;
  email: string;
  representante: string;
  rut_representante: string;
  datos_bancarios: string;
}

export interface Config {
  empresa: Empresa;
  proyecto: { nombre: string; ubicacion: string; inscripcion: string };
  credito: {
    tasa_mensual: number;
    tasa_mora_mensual: number;
    n_cuotas: number;
    pie_porcentaje: number;
    dias_validez_cotizacion: number;
    dias_plazo_carta: number;
  };
  plano: Plano | null;
  hoy: string;
  medios_pago: string[];
}

export type EstadoParcela = 'disponible' | 'reservada' | 'vendida' | 'bloqueada';
export type Punto = [number, number];

export interface Parcela {
  id: number;
  numero: string;
  sector: string;
  superficie_m2: number;
  precio: number;
  estado: EstadoParcela;
  rol_sii: string;
  deslindes: string;
  descripcion: string;
  poligono: Punto[] | null;
  venta_id: number | null;
  cliente_id: number | null;
  cliente: string | null;
}

export interface Cliente {
  id: number;
  rut: string;
  nombre: string;
  fecha_nacimiento: string | null;
  nacionalidad: string;
  estado_civil: string;
  profesion: string;
  direccion: string;
  comuna: string;
  ciudad: string;
  region: string;
  telefono: string;
  email: string;
  empleador: string;
  cargo: string;
  antiguedad_laboral: string;
  renta_mensual: number | null;
  antecedentes_comerciales: string;
  referencias: string;
  aval_nombre: string;
  aval_rut: string;
  aval_telefono: string;
  aval_direccion: string;
  observaciones: string;
  creado_en: string;
}

export interface ClienteResumen {
  id: number;
  rut: string;
  nombre: string;
  telefono: string;
  email: string;
  comuna: string;
  n_ventas: number;
  parcelas: string | null;
  saldo: number;
  atrasado: number;
  n_atrasadas: number;
}

export type EstadoCuota = 'pagada' | 'atrasada' | 'parcial' | 'pendiente';

export interface Cuota {
  id: number;
  venta_id: number;
  numero: number;
  tipo: 'pie' | 'cuota';
  fecha_vencimiento: string;
  monto: number;
  interes: number;
  amortizacion: number;
  saldo_insoluto: number;
  pagado: number;
  fecha_pago: string | null;
  saldo: number;
  estado: EstadoCuota;
  dias_atraso: number;
  mora_estimada: number;
}

/** Cuota con los datos del cliente y la parcela (listados de cobranza). */
export interface CuotaConContexto extends Cuota {
  cliente_id: number;
  cliente: string;
  rut: string;
  telefono: string;
  email: string;
  parcela: string;
}

export interface Pago {
  id: number;
  venta_id: number;
  fecha: string;
  monto: number;
  mora: number;
  medio: string;
  comprobante: string;
  observacion: string;
  usuario: string | null;
  anulado: number;
  motivo_anulacion: string;
  imputado_a: string | null;
}

export interface Totales {
  total_a_pagar: number;
  pagado: number;
  saldo: number;
  capital_insoluto: number;
  intereses_totales: number;
  atrasado: number;
  n_atrasadas: number;
  mora_estimada: number;
  dias_atraso: number;
  cuotas_total: number;
  cuotas_pagadas: number;
  proxima: { numero: number; tipo: 'pie' | 'cuota'; fecha: string; saldo: number; estado: EstadoCuota } | null;
}

export type EstadoVenta = 'vigente' | 'pagada' | 'anulada';

export interface Venta {
  id: number;
  parcela_id: number;
  cliente_id: number;
  cotizacion_id: number | null;
  vendedor_id: number | null;
  vendedor: string | null;
  fecha: string;
  precio: number;
  pie: number;
  monto_financiado: number;
  tasa_mensual: number;
  n_cuotas: number;
  valor_cuota: number;
  fecha_primera_cuota: string | null;
  estado: EstadoVenta;
  motivo_anulacion: string;
  observaciones: string;
}

export interface VentaResumen {
  id: number;
  fecha: string;
  precio: number;
  pie: number;
  monto_financiado: number;
  n_cuotas: number;
  valor_cuota: number;
  tasa_mensual: number;
  estado: EstadoVenta;
  parcela_id: number;
  parcela: string;
  cliente_id: number;
  cliente: string;
  cliente_rut: string;
  pagado: number;
  saldo: number;
  atrasado: number;
  n_atrasadas: number;
  cuotas_pagadas: number;
  proximo_vencimiento: string | null;
}

export interface DocumentoResumen {
  id: number;
  tipo: TipoDocumento;
  titulo: string;
  venta_id: number | null;
  cliente_id: number | null;
  creado_en: string;
  cliente?: string | null;
  parcela?: string | null;
  usuario?: string | null;
}

export interface VentaDetalle {
  venta: Venta;
  parcela: Parcela;
  cliente: Cliente;
  cuotas: Cuota[];
  pagos: Pago[];
  totales: Totales;
  documentos: DocumentoResumen[];
}

export interface Gestion {
  id: number;
  cliente_id: number;
  venta_id: number | null;
  fecha: string;
  tipo: string;
  detalle: string;
  compromiso_fecha: string | null;
  compromiso_monto: number | null;
  usuario: string | null;
}

export interface FichaCliente {
  cliente: Cliente;
  resumen: { saldo: number; pagado: number; atrasado: number; n_atrasadas: number; mora_estimada: number; dias_atraso: number };
  ventas: (Venta & { parcela: string; cuotas: Cuota[]; pagos: Pago[]; totales: Totales })[];
  gestiones: Gestion[];
  documentos: DocumentoResumen[];
  cotizaciones: { id: number; fecha: string; valida_hasta: string; precio: number; estado: string; parcela: string }[];
  visitas: { id: number; inicio: string; estado: string; notas: string }[];
}

export interface FilaAmortizacion {
  numero: number;
  fecha: string | null;
  cuota: number;
  interes: number;
  amortizacion: number;
  saldo: number;
}

export interface Simulacion {
  precio: number;
  pie: number;
  monto_financiado: number;
  n_cuotas: number;
  tasa_mensual: number;
  tasa_anual: number;
  valor_cuota: number;
  total_intereses: number;
  total_credito: number;
  total_operacion: number;
  filas: FilaAmortizacion[];
}

export interface Deudor {
  venta_id: number;
  cliente_id: number;
  cliente: string;
  rut: string;
  telefono: string;
  email: string;
  parcela: string;
  n_cuotas: number;
  monto: number;
  mora_estimada: number;
  dias_atraso: number;
  desde: string;
  ultima_gestion: { fecha: string; tipo: string; detalle: string; compromiso_fecha: string | null; compromiso_monto: number | null } | null;
  cuotas: { id: number; numero: number; tipo: 'pie' | 'cuota'; fecha_vencimiento: string; monto: number; pagado: number; saldo: number; dias_atraso: number; mora_estimada: number }[];
}

export interface Atrasadas {
  deudores: Deudor[];
  tramos: { tramo: string; monto: number; n: number }[];
  total: { monto: number; mora_estimada: number; n_cuotas: number; n_deudores: number };
  tasa_mora_mensual: number;
}

export interface MesFlujo {
  mes: string;
  n: number;
  capital: number;
  interes: number;
  total: number;
}

export interface Flujo {
  hoy: string;
  meses: MesFlujo[];
  atrasado: { monto: number; n: number };
}

export interface PagoRecibido {
  id: number;
  venta_id: number;
  fecha: string;
  monto: number;
  mora: number;
  medio: string;
  comprobante: string;
  observacion: string;
  anulado: number;
  cliente_id: number;
  cliente: string;
  parcela: string;
  imputado_a: string | null;
  capital: number;
  interes: number;
}

export type EstadoVisita = 'programada' | 'confirmada' | 'realizada' | 'cancelada' | 'no_asistio';

export interface Visita {
  id: number;
  inicio: string;
  duracion_min: number;
  nombre: string;
  telefono: string;
  email: string;
  cliente_id: number | null;
  parcela_ids: number[];
  parcelas: string[];
  vendedor_id: number | null;
  vendedor: string | null;
  estado: EstadoVisita;
  notas: string;
}

export interface Panel {
  hoy: string;
  parcelas: { total: number; disponible: number; reservada: number; vendida: number; bloqueada: number; valor_disponible: number };
  cartera: { por_cobrar: number; capital: number; n_creditos: number; atrasado: number; n_cuotas_atrasadas: number; n_deudores_morosos: number };
  mes: {
    recaudado: number;
    n_pagos: number;
    cuotas: { monto: number; pagado: number; n: number };
    ventas: { n: number; monto: number };
  };
  proximos_vencimientos: CuotaConContexto[];
  proximas_visitas: { id: number; inicio: string; nombre: string; telefono: string; estado: EstadoVisita; vendedor: string | null }[];
  flujo: MesFlujo[];
}

export type EstadoCotizacion = 'vigente' | 'aceptada' | 'rechazada';

export interface CotizacionResumen {
  id: number;
  fecha: string;
  valida_hasta: string;
  contacto_nombre: string;
  contacto_telefono: string;
  precio: number;
  pie: number;
  n_cuotas: number;
  valor_cuota: number;
  estado: EstadoCotizacion;
  vencida: boolean;
  cliente_id: number | null;
  parcela_id: number;
  parcela: string;
  parcela_estado: EstadoParcela;
  usuario: string | null;
  venta_id: number | null;
}

export interface Cotizacion {
  id: number;
  fecha: string;
  valida_hasta: string;
  parcela_id: number;
  cliente_id: number | null;
  contacto_nombre: string;
  contacto_rut: string;
  contacto_telefono: string;
  contacto_email: string;
  precio_lista: number;
  descuento: number;
  precio: number;
  pie: number;
  n_cuotas: number;
  tasa_mensual: number;
  valor_cuota: number;
  fecha_primera_cuota: string | null;
  observaciones: string;
  estado: EstadoCotizacion;
  vencida: boolean;
  usuario: string | null;
  venta_id: number | null;
}

export interface CotizacionDetalle {
  cotizacion: Cotizacion;
  parcela: Pick<Parcela, 'id' | 'numero' | 'sector' | 'superficie_m2' | 'precio' | 'estado' | 'rol_sii' | 'descripcion'>;
  simulacion: Simulacion;
}

export type TipoDocumento = 'carta_cobranza' | 'promesa';

export interface PlantillaResumen {
  id: number;
  tipo: TipoDocumento;
  nombre: string;
  actualizado_en: string;
}

export interface Plantilla extends PlantillaResumen {
  contenido: string;
}

export interface GrupoVariables {
  grupo: string;
  variables: { clave: string; descripcion: string }[];
}

export interface Documento {
  id: number;
  tipo: TipoDocumento;
  titulo: string;
  contenido: string;
  plantilla_id: number | null;
  cliente_id: number | null;
  venta_id: number | null;
  cliente: string | null;
  cliente_email: string | null;
  creado_en: string;
}

export interface Borrador {
  tipo: TipoDocumento;
  plantilla_id: number;
  venta_id: number;
  cliente_id: number;
  titulo: string;
  contenido: string;
}

export interface Recibo {
  pago: Pago;
  venta: { id: number; fecha: string; precio: number };
  cliente: { id: number; nombre: string; rut: string; direccion: string; comuna: string };
  parcela: { id: number; numero: string };
  imputaciones: { numero: number; tipo: 'pie' | 'cuota'; fecha_vencimiento: string; monto_cuota: number; monto: number }[];
  saldo_venta: number;
}
