// Esquema de la base de datos. Cada elemento es una migración; se aplican en orden y una sola
// vez (PRAGMA user_version). Para cambiar el esquema, AGREGAR una migración al final; no editar las existentes.

export const MIGRACIONES = [
  // 1 — Esquema inicial
  `
  CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    rol TEXT NOT NULL DEFAULT 'usuario' CHECK (rol IN ('admin', 'usuario')),
    activo INTEGER NOT NULL DEFAULT 1,
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE sesiones (
    token_hash TEXT PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    expira_en INTEGER NOT NULL,
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE configuracion (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );

  CREATE TABLE parcelas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT NOT NULL UNIQUE COLLATE NOCASE,
    sector TEXT NOT NULL DEFAULT '',
    superficie_m2 REAL NOT NULL DEFAULT 0,
    precio INTEGER NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'disponible'
      CHECK (estado IN ('disponible', 'reservada', 'vendida', 'bloqueada')),
    rol_sii TEXT NOT NULL DEFAULT '',
    deslindes TEXT NOT NULL DEFAULT '',
    descripcion TEXT NOT NULL DEFAULT '',
    poligono TEXT,
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rut TEXT NOT NULL DEFAULT '',
    nombre TEXT NOT NULL,
    fecha_nacimiento TEXT,
    nacionalidad TEXT NOT NULL DEFAULT '',
    estado_civil TEXT NOT NULL DEFAULT '',
    profesion TEXT NOT NULL DEFAULT '',
    direccion TEXT NOT NULL DEFAULT '',
    comuna TEXT NOT NULL DEFAULT '',
    ciudad TEXT NOT NULL DEFAULT '',
    region TEXT NOT NULL DEFAULT '',
    telefono TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    empleador TEXT NOT NULL DEFAULT '',
    cargo TEXT NOT NULL DEFAULT '',
    antiguedad_laboral TEXT NOT NULL DEFAULT '',
    renta_mensual INTEGER,
    antecedentes_comerciales TEXT NOT NULL DEFAULT '',
    referencias TEXT NOT NULL DEFAULT '',
    aval_nombre TEXT NOT NULL DEFAULT '',
    aval_rut TEXT NOT NULL DEFAULT '',
    aval_telefono TEXT NOT NULL DEFAULT '',
    aval_direccion TEXT NOT NULL DEFAULT '',
    observaciones TEXT NOT NULL DEFAULT '',
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX idx_clientes_rut ON clientes(rut) WHERE rut <> '';

  CREATE TABLE cotizaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL,
    valida_hasta TEXT NOT NULL,
    parcela_id INTEGER NOT NULL REFERENCES parcelas(id),
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
    contacto_nombre TEXT NOT NULL DEFAULT '',
    contacto_rut TEXT NOT NULL DEFAULT '',
    contacto_telefono TEXT NOT NULL DEFAULT '',
    contacto_email TEXT NOT NULL DEFAULT '',
    precio_lista INTEGER NOT NULL,
    descuento INTEGER NOT NULL DEFAULT 0,
    precio INTEGER NOT NULL,
    pie INTEGER NOT NULL DEFAULT 0,
    n_cuotas INTEGER NOT NULL DEFAULT 0,
    tasa_mensual REAL NOT NULL DEFAULT 0,
    valor_cuota INTEGER NOT NULL DEFAULT 0,
    fecha_primera_cuota TEXT,
    observaciones TEXT NOT NULL DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente', 'aceptada', 'rechazada')),
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE ventas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parcela_id INTEGER NOT NULL REFERENCES parcelas(id),
    cliente_id INTEGER NOT NULL REFERENCES clientes(id),
    cotizacion_id INTEGER REFERENCES cotizaciones(id) ON DELETE SET NULL,
    vendedor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    fecha TEXT NOT NULL,
    precio INTEGER NOT NULL,
    pie INTEGER NOT NULL DEFAULT 0,
    monto_financiado INTEGER NOT NULL DEFAULT 0,
    tasa_mensual REAL NOT NULL DEFAULT 0,
    n_cuotas INTEGER NOT NULL DEFAULT 0,
    valor_cuota INTEGER NOT NULL DEFAULT 0,
    fecha_primera_cuota TEXT,
    estado TEXT NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente', 'pagada', 'anulada')),
    motivo_anulacion TEXT NOT NULL DEFAULT '',
    observaciones TEXT NOT NULL DEFAULT '',
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_ventas_cliente ON ventas(cliente_id);
  CREATE INDEX idx_ventas_parcela ON ventas(parcela_id);

  -- Calendario de pagos de cada venta. numero = 0 es el pie (o el pago al contado).
  CREATE TABLE cuotas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venta_id INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    numero INTEGER NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'cuota' CHECK (tipo IN ('pie', 'cuota')),
    fecha_vencimiento TEXT NOT NULL,
    monto INTEGER NOT NULL,
    interes INTEGER NOT NULL DEFAULT 0,
    amortizacion INTEGER NOT NULL DEFAULT 0,
    saldo_insoluto INTEGER NOT NULL DEFAULT 0,
    pagado INTEGER NOT NULL DEFAULT 0,
    fecha_pago TEXT,
    UNIQUE (venta_id, numero)
  );
  CREATE INDEX idx_cuotas_vencimiento ON cuotas(fecha_vencimiento);

  CREATE TABLE pagos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venta_id INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    fecha TEXT NOT NULL,
    monto INTEGER NOT NULL,
    mora INTEGER NOT NULL DEFAULT 0,
    medio TEXT NOT NULL DEFAULT 'transferencia',
    comprobante TEXT NOT NULL DEFAULT '',
    observacion TEXT NOT NULL DEFAULT '',
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    anulado INTEGER NOT NULL DEFAULT 0,
    motivo_anulacion TEXT NOT NULL DEFAULT '',
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_pagos_venta ON pagos(venta_id);
  CREATE INDEX idx_pagos_fecha ON pagos(fecha);

  -- A qué cuotas se imputó cada pago (se recalcula completo ante cualquier cambio).
  CREATE TABLE pago_cuotas (
    pago_id INTEGER NOT NULL REFERENCES pagos(id) ON DELETE CASCADE,
    cuota_id INTEGER NOT NULL REFERENCES cuotas(id) ON DELETE CASCADE,
    monto INTEGER NOT NULL,
    PRIMARY KEY (pago_id, cuota_id)
  );

  CREATE TABLE visitas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inicio TEXT NOT NULL,
    duracion_min INTEGER NOT NULL DEFAULT 60,
    nombre TEXT NOT NULL,
    telefono TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
    parcela_ids TEXT NOT NULL DEFAULT '[]',
    vendedor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    estado TEXT NOT NULL DEFAULT 'programada'
      CHECK (estado IN ('programada', 'confirmada', 'realizada', 'cancelada', 'no_asistio')),
    notas TEXT NOT NULL DEFAULT '',
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_visitas_inicio ON visitas(inicio);

  CREATE TABLE plantillas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL CHECK (tipo IN ('carta_cobranza', 'promesa')),
    nombre TEXT NOT NULL,
    contenido TEXT NOT NULL DEFAULT '',
    creado_en TEXT NOT NULL DEFAULT (datetime('now')),
    actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Documentos emitidos (cartas y promesas ya confeccionadas para un cliente).
  CREATE TABLE documentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL CHECK (tipo IN ('carta_cobranza', 'promesa')),
    titulo TEXT NOT NULL,
    contenido TEXT NOT NULL DEFAULT '',
    plantilla_id INTEGER REFERENCES plantillas(id) ON DELETE SET NULL,
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE CASCADE,
    venta_id INTEGER REFERENCES ventas(id) ON DELETE CASCADE,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_documentos_cliente ON documentos(cliente_id);

  -- Bitácora de gestiones de cobranza por deudor.
  CREATE TABLE gestiones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    venta_id INTEGER REFERENCES ventas(id) ON DELETE SET NULL,
    fecha TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'llamada'
      CHECK (tipo IN ('llamada', 'whatsapp', 'email', 'carta', 'visita', 'compromiso', 'otro')),
    detalle TEXT NOT NULL DEFAULT '',
    compromiso_fecha TEXT,
    compromiso_monto INTEGER,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_gestiones_cliente ON gestiones(cliente_id);
  `,

  // 2 — Tres cuentas fijas (super administrador, abogado, contador) y registro de cambios.
  //     La cuenta de administrador más antigua pasa a ser el super administrador "admin" (conserva su
  //     contraseña); las demás cuentas dejan de existir y sus referencias quedan en blanco.
  `
  CREATE TABLE usuarios_nuevo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT NOT NULL UNIQUE COLLATE NOCASE,
    nombre TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    rol TEXT NOT NULL CHECK (rol IN ('superadmin', 'abogado', 'contador')),
    activo INTEGER NOT NULL DEFAULT 1,
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT INTO usuarios_nuevo (id, usuario, nombre, password_hash, rol, activo, creado_en)
    SELECT id, 'admin', nombre, password_hash, 'superadmin', 1, creado_en
      FROM usuarios WHERE rol = 'admin' ORDER BY id LIMIT 1;

  UPDATE cotizaciones SET usuario_id = NULL WHERE usuario_id NOT IN (SELECT id FROM usuarios_nuevo);
  UPDATE ventas SET vendedor_id = NULL WHERE vendedor_id NOT IN (SELECT id FROM usuarios_nuevo);
  UPDATE pagos SET usuario_id = NULL WHERE usuario_id NOT IN (SELECT id FROM usuarios_nuevo);
  UPDATE visitas SET vendedor_id = NULL WHERE vendedor_id NOT IN (SELECT id FROM usuarios_nuevo);
  UPDATE documentos SET usuario_id = NULL WHERE usuario_id NOT IN (SELECT id FROM usuarios_nuevo);
  UPDATE gestiones SET usuario_id = NULL WHERE usuario_id NOT IN (SELECT id FROM usuarios_nuevo);
  DELETE FROM sesiones WHERE usuario_id NOT IN (SELECT id FROM usuarios_nuevo);

  DROP TABLE usuarios;
  ALTER TABLE usuarios_nuevo RENAME TO usuarios;

  -- Quién cambió qué y cuándo. datos_anteriores guarda la versión previa para poder deshacer.
  CREATE TABLE bitacora (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL DEFAULT (datetime('now')),
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    accion TEXT NOT NULL,
    entidad TEXT NOT NULL DEFAULT '',
    entidad_id INTEGER,
    detalle TEXT NOT NULL DEFAULT '',
    motivo TEXT NOT NULL DEFAULT '',
    datos_anteriores TEXT
  );
  CREATE INDEX idx_bitacora_entidad ON bitacora(entidad, entidad_id);
  CREATE INDEX idx_bitacora_fecha ON bitacora(fecha);
  `,
];
