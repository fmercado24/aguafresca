import { Router } from 'express';
import { db } from '../db.js';
import { requiere, puede, exigir, ROLES_DUENOS } from '../auth.js';
import { leerConfiguracion, leerSeccion, guardarSeccion } from '../lib/configuracion.js';
import { registrar, diferencias, describirCambios } from '../lib/bitacora.js';
import { MEDIOS_PAGO } from '../lib/creditos.js';
import { hoy } from '../lib/fechas.js';
import { formatearRut } from '../lib/rut.js';
import { pesos } from '../lib/finanzas.js';
import { ErrorApp, leer, texto, entero, decimal, opcion, rut, telefono, correo } from '../lib/validar.js';
import { CUENTAS_REPRESENTANTE, datosDeCuenta } from '../lib/datos-personales.js';
import { leerFirma, guardarFirma, quitarFirma } from '../lib/firma.js';

export const rutasConfiguracion = Router();

rutasConfiguracion.get('/config', (req, res) => {
  res.json({ ...leerConfiguracion(), hoy: hoy(), medios_pago: MEDIOS_PAGO });
});

export const ETIQUETAS_EMPRESA = {
  razon_social: 'Razón social', rut: 'RUT de la empresa', giro: 'Giro', direccion: 'Dirección', ciudad: 'Ciudad',
  telefono: 'Teléfono', email: 'Correo electrónico', representante: 'Representante legal',
  rut_representante: 'RUT del representante', representante_cuenta: 'Datos del representante', datos_bancarios: 'Datos para transferencia',
};
const origenRepresentante = (cuenta) => (cuenta ? `datos personales de ${cuenta}` : 'escritos a mano');
export const ETIQUETAS_PROYECTO = { nombre: 'Nombre del proyecto', ubicacion: 'Ubicación', inscripcion: 'Inscripción de dominio' };
export const ETIQUETAS_CREDITO = {
  tasa_mensual: 'Interés mensual del crédito (%)', tasa_mora_mensual: 'Interés por mora mensual (%)', n_cuotas: 'Número de cuotas habitual',
  pie_monto: 'Pie habitual', dias_validez_cotizacion: 'Vigencia de cotizaciones (días)', dias_plazo_carta: 'Plazo en cartas de cobranza (días)',
};

// Datos sensibles que aparecen en cotizaciones, cartas y promesas: solo el super administrador.
rutasConfiguracion.put('/config/empresa', requiere('empresa'), (req, res) => {
  const empresa = leer(req.body?.empresa, {
    razon_social: texto({ req: true, max: 160 }),
    rut: rut(),
    giro: texto({ max: 160 }),
    direccion: texto({ max: 200 }),
    ciudad: texto({ max: 80 }),
    telefono: telefono(),
    email: correo(),
    representante: texto({ max: 160 }),
    rut_representante: rut(),
    representante_cuenta: opcion(['', ...CUENTAS_REPRESENTANTE]),
    datos_bancarios: texto({ max: 800 }),
  });
  if (empresa.representante_cuenta) {
    // Representante designado entre los dueños: el nombre y el RUT vienen de sus datos personales.
    const d = datosDeCuenta(empresa.representante_cuenta);
    empresa.representante = d.nombre_completo;
    empresa.rut_representante = d.rut;
  }
  const proyecto = leer(req.body?.proyecto, {
    nombre: texto({ req: true, max: 160 }),
    ubicacion: texto({ max: 300 }),
    inscripcion: texto({ max: 800 }),
  });

  const conRutLegible = (e) => ({
    ...e, rut: formatearRut(e.rut), rut_representante: formatearRut(e.rut_representante), representante_cuenta: origenRepresentante(e.representante_cuenta),
  });
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

// Parámetros contables del crédito y la cobranza: administrador y super administrador.
rutasConfiguracion.put('/config/credito', requiere('contabilidad'), (req, res) => {
  const credito = leer(req.body?.credito, {
    tasa_mensual: decimal({ min: 0, max: 15, def: 0 }),
    tasa_mora_mensual: decimal({ min: 0, max: 15, def: 0 }),
    n_cuotas: entero({ min: 1, max: 360, def: 36 }),
    pie_monto: entero({ min: 0, max: 100_000_000_000, def: 0 }),
    dias_validez_cotizacion: entero({ min: 1, max: 365, def: 15 }),
    dias_plazo_carta: entero({ min: 1, max: 90, def: 10 }),
  });
  const legible = (c) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, k === 'pie_monto' ? pesos(v) : String(v).replace('.', ',')]));
  const cambios = diferencias(legible(leerSeccion('credito')), legible(credito), ETIQUETAS_CREDITO);
  if (!cambios.length) return res.json({ ok: true, cambios: 0 });
  db.tx(() => {
    guardarSeccion('credito', credito);
    registrar(req.usuario.id, { accion: 'config_credito', entidad: 'config', detalle: describirCambios(cambios) });
  });
  res.json({ ok: true, cambios: cambios.length });
});

// ---------- Firma del representante legal ----------

// La carga el super administrador o el dueño designado como representante legal.
function exigirFirma(usuario) {
  if (leerSeccion('empresa').representante_cuenta === usuario.usuario) return;
  exigir(usuario, 'empresa');
}

rutasConfiguracion.get('/config/firma', (req, res) => {
  const f = leerFirma();
  if (!f) throw new ErrorApp('No hay firma cargada', 404);
  res.set('Cache-Control', 'private, max-age=31536000, immutable');
  res.type(f.tipo).send(f.datos);
});

rutasConfiguracion.put('/config/firma', (req, res) => {
  exigirFirma(req.usuario);
  db.tx(() => {
    guardarFirma(req.body?.imagen);
    registrar(req.usuario.id, { accion: 'config_empresa', entidad: 'config', detalle: 'Firma del representante legal cargada' });
  });
  res.json({ ok: true });
});

rutasConfiguracion.delete('/config/firma', (req, res) => {
  exigirFirma(req.usuario);
  db.tx(() => {
    quitarFirma();
    registrar(req.usuario.id, { accion: 'config_empresa', entidad: 'config', detalle: 'Firma del representante legal quitada' });
  });
  res.json({ ok: true });
});

// ---------- Registro de cambios ----------

// El super administrador ve todo; los dueños, los cambios que hacen ellos mismos (ldiaz y pmercado)
// y los que hace el sistema (carga de datos y correcciones automáticas).
rutasConfiguracion.get('/bitacora', (req, res) => {
  const todo = puede(req.usuario, 'administracion');
  if (!todo) exigir(req.usuario, 'registro_duenos');
  const limite = Math.min(500, Math.max(1, Number(req.query.limite) || 200));
  res.json(db.all(
    `SELECT b.id, b.fecha, b.accion, b.entidad, b.entidad_id, b.detalle, b.motivo, u.nombre AS usuario, u.usuario AS cuenta
       FROM bitacora b LEFT JOIN usuarios u ON u.id = b.usuario_id
      ${todo ? '' : `WHERE b.usuario_id IS NULL OR u.rol IN (${ROLES_DUENOS.map(() => '?').join(', ')})`}
      ORDER BY b.id DESC LIMIT ?`,
    ...(todo ? [] : ROLES_DUENOS), limite,
  ));
});
