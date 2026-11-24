// Una base con los perfiles anteriores (abogado y contador) pasa a Usuario y Administrador sin perder nada:
// mismas cuentas, contraseñas, datos personales, sesiones y autoría de lo registrado.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MIGRACIONES } from '../migraciones.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aguafresca-perfiles-'));
const archivo = path.join(dir, 'base.db');
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const vieja = new DatabaseSync(archivo);
for (const m of MIGRACIONES.slice(0, 7)) vieja.exec(m);
vieja.exec(`
  DELETE FROM usuarios;
  INSERT INTO usuarios (id, usuario, nombre, password_hash, rol, datos_personales) VALUES
    (1, 'admin', 'Administrador', 'hash-admin', 'superadmin', '{}'),
    (2, 'ldiaz', 'Luis Díaz', 'hash-ldiaz', 'abogado', '{"rut":"15678901-1"}'),
    (3, 'pmercado', 'Patricio Mercado', 'hash-pmercado', 'contador', '{}');
  INSERT INTO sesiones (token_hash, usuario_id, expira_en) VALUES ('sesion-ldiaz', 2, 9999999999999);
  INSERT INTO parcelas (id, numero, precio) VALUES (1, 'A-1', 20000000);
  INSERT INTO clientes (id, nombre) VALUES (1, 'Cliente');
  INSERT INTO ventas (id, parcela_id, cliente_id, vendedor_id, fecha, precio, pie) VALUES (1, 1, 1, 3, '2026-01-10', 20000000, 20000000);
  INSERT INTO pagos (id, venta_id, fecha, monto, usuario_id) VALUES (1, 1, '2026-01-10', 20000000, 3);
  INSERT INTO bitacora (usuario_id, accion, detalle) VALUES (2, 'plantilla_editada', 'x');
  PRAGMA user_version = 7;
`);
vieja.close();

process.env.DB_PATH = archivo;
process.env.DATA_DIR = dir;
const { db } = await import('../db.js');

test('abogado pasa a usuario y contador a admin, con sus mismos datos', () => {
  assert.equal(db.get('PRAGMA user_version').user_version, MIGRACIONES.length);
  const cuentas = db.all('SELECT id, usuario, rol, password_hash, datos_personales FROM usuarios ORDER BY id');
  assert.deepEqual(cuentas.map((c) => [c.id, c.usuario, c.rol, c.password_hash]), [
    [1, 'admin', 'superadmin', 'hash-admin'], [2, 'ldiaz', 'usuario', 'hash-ldiaz'], [3, 'pmercado', 'admin', 'hash-pmercado'],
  ]);
  assert.equal(JSON.parse(cuentas[1].datos_personales).rut, '15678901-1');
  assert.equal(db.get('SELECT usuario_id FROM sesiones').usuario_id, 2, 'la sesión abierta sigue siendo de ldiaz');
  assert.deepEqual([db.get('SELECT vendedor_id FROM ventas').vendedor_id, db.get('SELECT usuario_id FROM pagos').usuario_id], [3, 3]);
  assert.equal(db.get('SELECT usuario_id FROM bitacora').usuario_id, 2);
  assert.equal(db.all('PRAGMA foreign_key_check').length, 0);
  assert.throws(() => db.run("UPDATE usuarios SET rol = 'abogado' WHERE id = 2"), /CHECK/, 'los perfiles anteriores ya no existen');
});
