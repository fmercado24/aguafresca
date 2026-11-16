import { Router } from 'express';
import { db } from '../db.js';
import { requiere } from '../auth.js';
import { leerConfiguracion, leerSeccion, guardarSeccion } from '../lib/configuracion.js';
import { registrar, diferencias, describirCambios } from '../lib/bitacora.js';
import { MEDIOS_PAGO } from '../lib/creditos.js';
import { hoy } from '../lib/fechas.js';
import { rutValido, normalizarRut, formatearRut } from '../lib/rut.js';
import { ErrorApp, leer, texto, entero, decimal } from '../lib/validar.js';

export const rutasConfiguracion = Router();

rutasConfiguracion.get('/config', (req, res) => {
  res.json({ ...leerConfiguracion(), hoy: hoy(), medios_pago: MEDIOS_PAGO });
});

function rutOpcional(valor, etiqueta) {
  if (!valor) return '';
  if (!rutValido(valor)) throw new ErrorApp(`${etiqueta}: no es válido (revise el dígito verificador)`);
  return normalizarRut(valor);
}

export const ETIQUETAS_EMPRESA = {
  razon_social: 'Razón social', rut: 'RUT de la empresa', giro: 'Giro', direccion: 'Dirección', ciudad: 'Ciudad',
  telefono: 'Teléfono', email: 'Correo electrónico', representante: 'Representante legal',
  rut_representante: 'RUT del representante', datos_bancarios: 'Datos para transferencia',
};
export const ETIQUETAS_PROYECTO = { nombre: 'Nombre del proyecto', ubicacion: 'Ubicación', inscripcion: 'Inscripción de dominio' };
export const ETIQUETAS_CREDITO = {
  tasa_mensual: 'Interés mensual del crédito (%)', tasa_mora_mensual: 'Interés por mora mensual (%)', n_cuotas: 'Número de cuotas habitual',
  pie_porcentaje: 'Pie habitual (%)', dias_validez_cotizacion: 'Vigencia de cotizaciones (días)', dias_plazo_carta: 'Plazo en cartas de cobranza (días)',
};

// Datos sensibles que aparecen en cotizaciones, cartas y promesas: solo el super administrador.
rutasConfiguracion.put('/config/empresa', requiere('empresa'), (req, res) => {
  const empresa = leer(req.body?.empresa, {
    razon_social: texto({ req: true, max: 160 }),
    rut: texto({ max: 15 }),
    giro: texto({ max: 160 }),
    direccion: texto({ max: 200 }),
    ciudad: texto({ max: 80 }),
    telefono: texto({ max: 60 }),
    email: texto({ max: 160 }),
    representante: texto({ max: 160 }),
    rut_representante: texto({ max: 15 }),
    datos_bancarios: texto({ max: 800 }),
  });
  empresa.rut = rutOpcional(empresa.rut, 'RUT de la empresa');
  empresa.rut_representante = rutOpcional(empresa.rut_representante, 'RUT del representante');
  const proyecto = leer(req.body?.proyecto, {
    nombre: texto({ req: true, max: 160 }),
    ubicacion: texto({ max: 300 }),
    inscripcion: texto({ max: 800 }),
  });

  const conRutLegible = (e) => ({ ...e, rut: formatearRut(e.rut), rut_representante: formatearRut(e.rut_representante) });
  const cambios = [
    ...diferencias(conRutLegible(leerSeccion('empresa')), conRutLegible(empresa), ETIQUETAS_EMPRESA),
    ...diferencias(leerSeccion('proyecto'), proyecto, ETIQUETAS_PROYECTO),
  ];
  if (!cambios.length) return res.json({ ok: true, cambios: 0 });
  db.tx(() => {
    guardarSeccion('empresa', empresa);
    guardarSeccion('proyecto', proyecto);
    registrar(req.usuario.id, { accion: 'config_empresa', entidad: 'config', detalle: describirCambios(cambios) });
  });
  res.json({ ok: true, cambios: cambios.length });
});

// Parámetros contables del crédito y la cobranza: contador y super administrador.
rutasConfiguracion.put('/config/credito', requiere('contabilidad'), (req, res) => {
  const credito = leer(req.body?.credito, {
    tasa_mensual: decimal({ min: 0, max: 15, def: 0 }),
    tasa_mora_mensual: decimal({ min: 0, max: 15, def: 0 }),
    n_cuotas: entero({ min: 1, max: 360, def: 36 }),
    pie_porcentaje: decimal({ min: 0, max: 100, def: 20 }),
    dias_validez_cotizacion: entero({ min: 1, max: 365, def: 15 }),
    dias_plazo_carta: entero({ min: 1, max: 90, def: 10 }),
  });
  const conComa = (c) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, String(v).replace('.', ',')]));
  const cambios = diferencias(conComa(leerSeccion('credito')), conComa(credito), ETIQUETAS_CREDITO);
  if (!cambios.length) return res.json({ ok: true, cambios: 0 });
  db.tx(() => {
    guardarSeccion('credito', credito);
    registrar(req.usuario.id, { accion: 'config_credito', entidad: 'config', detalle: describirCambios(cambios) });
  });
  res.json({ ok: true, cambios: cambios.length });
});

// ---------- Registro de cambios ----------

rutasConfiguracion.get('/bitacora', requiere('administracion'), (req, res) => {
  const limite = Math.min(500, Math.max(1, Number(req.query.limite) || 200));
  res.json(db.all(
    `SELECT b.id, b.fecha, b.accion, b.entidad, b.entidad_id, b.detalle, b.motivo, u.nombre AS usuario, u.usuario AS cuenta
       FROM bitacora b LEFT JOIN usuarios u ON u.id = b.usuario_id
      ORDER BY b.id DESC LIMIT ?`,
    limite,
  ));
});
