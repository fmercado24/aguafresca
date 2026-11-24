// Una base creada con la versión anterior (cuentas por correo, perfiles admin/usuario)
// se convierte a las tres cuentas fijas sin perder ventas ni pagos.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MIGRACIONES } from '../migraciones.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aguafresca-migracion-'));
const archivo = path.join(dir, 'antigua.db');
after(() => fs.rmSync(dir, { recursive: true, force: true }));

// Base con el esquema 1 y datos como los dejaba la versión anterior.
const vieja = new DatabaseSync(archivo);
vieja.exec('PRAGMA foreign_keys = ON');
vieja.exec(MIGRACIONES[0]);
vieja.exec(`
  INSERT INTO usuarios (id, nombre, email, password_hash, rol) VALUES
    (1, 'Administrador', 'admin@aguafresca.cl', 'hash-del-admin', 'admin'),
    (2, 'Vera Vendedora', 'vera@aguafresca.cl', 'hash-de-vera', 'usuario');
  INSERT INTO sesiones (token_hash, usuario_id, expira_en) VALUES ('sesion-admin', 1, 9999999999999), ('sesion-vera', 2, 9999999999999);
  INSERT INTO parcelas (id, numero, precio) VALUES (1, '1', 20000000);
  INSERT INTO clientes (id, nombre) VALUES (1, 'Cliente Antiguo');
  INSERT INTO ventas (id, parcela_id, cliente_id, vendedor_id, fecha, precio, pie) VALUES (1, 1, 1, 2, '2026-01-10', 20000000, 20000000);
  INSERT INTO cuotas (venta_id, numero, tipo, fecha_vencimiento, monto, amortizacion, pagado) VALUES (1, 0, 'pie', '2026-01-10', 20000000, 20000000, 20000000);
  INSERT INTO pagos (id, venta_id, fecha, monto, usuario_id) VALUES (1, 1, '2026-01-10', 20000000, 2);
  INSERT INTO gestiones (cliente_id, fecha, detalle, usuario_id) VALUES (1, '2026-01-11', 'Llamada', 1);
  PRAGMA user_version = 1;
`);
vieja.close();

process.env.DB_PATH = archivo;
process.env.DATA_DIR = dir;
process.env.CLAVE_LDIAZ = 'clave-abogado-1';
process.env.CLAVE_PMERCADO = 'clave-contador-1';
const { db } = await import('../db.js');
const { asegurarUsuarios } = await import('../auth.js');
asegurarUsuarios();

test('la migración deja exactamente las tres cuentas y conserva al administrador', () => {
  assert.equal(db.get('PRAGMA user_version').user_version, MIGRACIONES.length);
  const cuentas = db.all('SELECT id, usuario, rol, password_hash FROM usuarios ORDER BY id');
  assert.deepEqual(cuentas.map((c) => [c.usuario, c.rol]), [['admin', 'superadmin'], ['ldiaz', 'usuario'], ['pmercado', 'admin']]);
  assert.equal(cuentas[0].id, 1);
  assert.equal(cuentas[0].password_hash, 'hash-del-admin', 'el administrador conserva su contraseña');
  assert.deepEqual(db.all('SELECT token_hash FROM sesiones').map((s) => s.token_hash), ['sesion-admin'], 'la sesión del administrador sigue abierta');
});

test('las ventas, pagos y gestiones se conservan; las referencias a cuentas eliminadas quedan en blanco', () => {
  const v = db.get('SELECT * FROM ventas WHERE id = 1');
  assert.equal(v.precio, 20000000);
  assert.equal(v.vendedor_id, null);
  assert.equal(db.get('SELECT usuario_id FROM pagos WHERE id = 1').usuario_id, null);
  assert.equal(db.get('SELECT COUNT(*) AS n FROM pagos').n, 1);
  assert.equal(db.get('SELECT usuario_id FROM gestiones').usuario_id, 1, 'lo hecho por el administrador mantiene su autor');
  assert.equal(db.all('PRAGMA foreign_key_check').length, 0);
  assert.equal(db.get('PRAGMA foreign_keys').foreign_keys, 1, 'las claves foráneas vuelven a quedar activas');
  assert.equal(db.get("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'bitacora'").n, 1);
});
