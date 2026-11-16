# Agua Fresca SpA · Fundo Entre Ríos — Sistema de gestión

Sistema web para administrar la venta de parcelas del proyecto Fundo Entre Ríos: créditos y cuotas,
cobranza, clientes, cotizaciones, contratos y visitas. Se usa desde el computador y desde el celular
(se puede instalar como aplicación).

## Qué hace

| Requerimiento | Dónde está en el sistema |
|---|---|
| 1. Control de ventas con crédito: cuotas pendientes, atrasadas, flujo futuro, tabla de amortización con interés | **Ventas** (tabla de amortización de cada venta, registro de pagos) y **Cobranza** (cuotas atrasadas, cuotas pendientes, flujo de ingresos, pagos recibidos) |
| 2. Mapa de parcelas disponibles con sus valores | **Parcelas** → Mapa (plano del topógrafo con cada parcela coloreada por estado y enlace a Google Maps) y Lista de precios |
| 3. Cartas tipo de cobranza | **Documentos** → Confeccionar documento → Carta de cobranza (3 plantillas editables) |
| 4. Ficha de deudores con antecedentes | **Clientes** → ficha: datos personales, antecedentes laborales y comerciales, aval, compras, deuda, pagos, bitácora de cobranza |
| 5. Contratos tipo de promesa | **Documentos** → Promesa de compraventa (plantillas a crédito y al contado), exporta a PDF y Word |
| 6. Cotizaciones de venta | **Cotizaciones**: simula el crédito, imprime/PDF, envía resumen por WhatsApp y se convierte en venta |
| 7. Calendario de visitas | **Visitas**: calendario mensual y agenda del día |
| Uso por computador y app | Aplicación web adaptable; instalable en el celular (ver "Instalar como app") |

Todos los listados se pueden descargar a Excel (archivo CSV).

## Probarlo en este computador

Requiere **Node.js 22.13 o superior**. No necesita instalar un motor de base de datos: usa SQLite, que viene incluido en Node.

```bash
./iniciar.sh            # instala lo necesario, compila e inicia en http://localhost:3000
./iniciar.sh --demo     # igual, y la primera vez carga datos ficticios para recorrer el sistema
```

La **primera vez** el script pide una contraseña para cada una de las tres cuentas (mínimo 8 caracteres);
si presiona Enter se genera una al azar y se muestra al final, **una sola vez**. También carga los **185 lotes
del plano del topógrafo** (ver *Plano del loteo* más abajo), con precio por definir. Luego abra
`http://localhost:3000` en el navegador. Para detener el sistema: `Ctrl + C` en la ventana del script.

| Opción | Qué hace |
|---|---|
| `--demo` | En el primer inicio carga los lotes del plano con precios ficticios, 10 clientes ficticios y ventas en distintas situaciones de pago |
| `--puerto 8080` | Usa otro puerto (por ejemplo, si el 3000 está ocupado) |
| `--clave ldiaz` | Restablece la contraseña de una cuenta (`admin`, `ldiaz` o `pmercado`), por ejemplo si se olvidó |
| `--ayuda` | Muestra estas opciones |

Para volver a empezar en limpio, detenga el sistema y borre (o mueva) la carpeta `data/`.

Después de ingresar con la cuenta `admin`:

1. **Configuración → Empresa y proyecto**: razón social, RUT, representante legal, datos bancarios, ubicación e inscripción del fundo. Estos datos alimentan el membrete, las cartas y las promesas (lo que falte sale como una línea en blanco `____` para completar a mano).
2. **Configuración → Crédito y cobranza**: interés mensual habitual, pie, número de cuotas e interés por mora.
3. **Parcelas → Lista de precios → Cambios en bloque**: fije los precios de lista (por m² o un monto fijo) por sector o para las parcelas filtradas. Ahí mismo se puede cambiar el nombre de un sector y el prefijo de sus códigos.
4. **Documentos → Plantillas**: el abogado revisa y ajusta los textos (ver nota legal más abajo).

## Cuentas y permisos

El sistema tiene **exactamente tres cuentas**; no se crean ni se eliminan desde la aplicación. Se ingresa con el nombre de usuario.

| Función | `admin` · Super administrador | `ldiaz` · Abogado | `pmercado` · Contador |
|---|:-:|:-:|:-:|
| Funciones básicas: clientes y fichas, ventas, registrar pagos, cotizaciones, visitas, confeccionar cartas y promesas, reservar parcelas | ✓ | ✓ | ✓ |
| Datos sensibles de la empresa: RUT, representante legal, datos bancarios, inscripción del fundo | ✓ | | |
| Parcelas: crear, cambiar precios (también en bloque), editar el mapa, cargar el plano | ✓ | | |
| Cuentas: nombres y restablecer contraseñas · Registro de cambios · eliminar clientes | ✓ | | |
| Modificar las plantillas de documentos legales | ✓ | ✓ | |
| Modificar la tabla de amortización de una venta | ✓ | | ✓ |
| Datos contables: tasas de interés y mora, corregir o anular pagos, anular ventas | ✓ | | ✓ |

Cada persona cambia su propia contraseña en **Configuración → Mi cuenta**.

### Protección contra errores

- **Confirmación con "antes → después"**: todo cambio sensible (datos de la empresa, tasas, precios de parcelas, contraseñas, corrección de pagos, plantillas, tabla de amortización) muestra exactamente qué cambia y pide confirmar antes de guardar.
- **Motivo obligatorio** al modificar la tabla de amortización, corregir o anular un pago y anular una venta.
- **Deshacer**: cada cambio a una tabla de amortización queda en **Historial de cambios** de la venta con un botón *Deshacer este cambio*; cada versión de una plantilla queda en *Versiones anteriores*. Deshacer también se puede deshacer.
- **Registro de cambios** (Configuración, solo super administrador): quién cambió qué, cuándo y por qué. Se puede descargar a Excel.

### Editor de la tabla de amortización

Desde una venta, **Editar tabla** (contador o super administrador):

- Cada cuota se edita a mano: vencimiento, interés y amortización. La cuota es siempre interés + amortización y el saldo insoluto se recalcula solo; las celdas cambiadas se marcan.
- **Recalcular desde una cuota**: renegociación del capital pendiente con otra tasa o número de cuotas (cuota fija).
- **Mover vencimientos**: postergar meses o cambiar el día de pago desde una cuota en adelante.
- Agregar o quitar cuotas, **cerrar el saldo en $0** en la última cuota, cambiar precio, pie y tasa.
- Antes de guardar se revisa un resumen (totales antes y después, cuotas modificadas, advertencias). No deja guardar una tabla por debajo de lo ya pagado ni cuotas en $0; un saldo final distinto de $0 exige aceptar la advertencia.
- Los pagos ya registrados se vuelven a imputar a la tabla nueva.

## Plano del loteo

Los planos que entregó el cliente están en `planos/` (AutoCAD `.dwg` y Google Earth `.kmz`). Se convirtieron a
`server/datos/loteo.json`, que el sistema carga como parcelas y como fondo del mapa:

- **185 lotes en 9 sectores**, cada uno con su numeración desde 1: A (12), B (28), C (9), D (16), E (18), F (4), G (9), H (4) e I (85).
  El código de cada parcela es *sector-número* (por ejemplo `B-12`). **Los nombres de los sectores son provisorios** (A a I, de
  poniente a oriente): si en la empresa se usan otros, cámbielos en *Cambios en bloque → Sector y código*.
- **Superficie**: la anotada por el topógrafo en el plano. En los lotes I-52, I-54, I-75, I-77 e I-84 el contorno dibujado difiere
  más de un 3 % de lo anotado; se usa lo anotado.
- **Deslindes**: se generaron desde el dibujo (orientación, largo según las cotas del plano y colindante: otro lote, camino interior,
  camino predial público, Río Colorado o límite del fundo). Son un **borrador**: el abogado debe revisarlos contra el plano
  archivado antes de usarlos en una promesa. Se editan en cada parcela.
- **Ubicación**: el plano está georreferenciado con el `.kmz` (error menor a 1 m); cada parcela y cada visita tienen enlace a Google Maps.
- **Precios**: el plano no los trae; las parcelas parten con *precio por definir*.

Volver a cargar el plano (**Mapa → Editar mapa → Actualizar desde el plano**) no duplica parcelas ni cambia precios, estados ni
deslindes ya escritos: solo crea las que falten y actualiza los contornos.

Si el topógrafo entrega un plano nuevo, se convierte con:

```bash
npm install --no-save @mlightcad/libredwg-web     # lector de DWG; no queda como dependencia del sistema
node herramientas/plano/convertir.mjs "planos/nuevo.dwg" "planos/nuevo.kmz"
```

El conversor reconstruye cada lote a partir de las líneas del dibujo (cierra las uniones que quedaron abiertas), lee el número
y la superficie de cada lote, separa los sectores por su numeración y avisa lo que conviene revisar.

### Cargar las ventas que ya existen

Al registrar una venta marque **"Es una venta anterior…"** e indique cuántas cuotas ya están pagadas: el sistema
genera el calendario desde la fecha original y deja esas cuotas como pagadas.

## Instalar como app en el celular

Abra la dirección del sistema en Chrome (Android) o Safari (iPhone) y elija **"Agregar a pantalla de inicio" / "Instalar aplicación"**.
Queda con su ícono y se abre a pantalla completa. Es la misma aplicación y los mismos datos que en el computador.

La instalación como app requiere que el sistema esté publicado con **HTTPS**. Dentro de la red local (por ejemplo
`http://192.168.1.20:3000`) funciona igual desde el navegador del celular, pero sin la opción de instalar.

## Publicarlo en internet

Para usarlo desde cualquier lugar hay que alojarlo en un servidor (un VPS pequeño basta) detrás de HTTPS, por ejemplo con Caddy o Nginx como proxy:

```bash
npm install && npm run build
PORT=3000 DATA_DIR=/var/lib/aguafresca COOKIE_SECURE=true TRUST_PROXY=1 npm start
```

| Variable | Para qué sirve | Valor por defecto |
|---|---|---|
| `PORT` | Puerto del servidor | `3000` |
| `DATA_DIR` | Carpeta de la base de datos y el plano | `./data` |
| `CLAVE_ADMIN`, `CLAVE_LDIAZ`, `CLAVE_PMERCADO` | Contraseñas iniciales de las tres cuentas (solo el primer arranque) | al azar, se muestran en la consola |
| `COOKIE_SECURE` | `true` cuando se publica con HTTPS | — |
| `TRUST_PROXY` | `1` cuando hay un proxy (Caddy/Nginx) delante | — |
| `TZ_APP` | Zona horaria para "hoy" y los atrasos | `America/Santiago` |

## Respaldo

Toda la información está en la carpeta `data/` (`aguafresca.db` y el plano). **Respalde esa carpeta periódicamente**;
para restaurar, basta con volver a copiarla. Conviene hacerlo con el sistema detenido, o copiar también los archivos
`aguafresca.db-wal` y `aguafresca.db-shm` si existen.

## Cómo calcula

- **Cuotas**: cuota fija mensual (sistema francés) con interés sobre el saldo insoluto, en pesos sin decimales. La última cuota absorbe la diferencia de redondeo, de modo que el saldo termina exactamente en $0.
- **Vencimientos**: mismo día de cada mes que la primera cuota (si el mes no tiene ese día, el último día del mes).
- **Pagos**: se imputan a la cuota más antigua con saldo; admite abonos parciales y pagos que cubren varias cuotas. Al anular un pago, las cuotas vuelven a su estado anterior.
- **Atraso**: una cuota está atrasada desde el día siguiente a su vencimiento si tiene saldo.
- **Interés por mora**: es una *estimación informativa* — saldo de la cuota × tasa de mora mensual × días de atraso / 30. No se cobra automáticamente: al registrar un pago se anota aparte la mora efectivamente cobrada.
- **Flujo de ingresos**: suma por mes del saldo de las cuotas por vencer, separando capital e interés. Lo ya atrasado se muestra aparte.
- **Desglose contable de los pagos** (Cobranza → Pagos recibidos): dentro de cada cuota, lo pagado cubre primero el interés y luego el capital. La mora cobrada se informa aparte.

## Nota legal

Las plantillas de **promesa de compraventa** y de **cartas de cobranza** incluidas son modelos referenciales.
Deben ser revisadas y ajustadas por el abogado de la empresa antes de usarlas con clientes. Verifique también
que las tasas de interés y de mora no superen el interés máximo convencional vigente.

## Alcance de esta versión

- Montos en **pesos chilenos**. No maneja UF.
- Un pago mayor a la cuota se imputa a las cuotas siguientes; para un **prepago a capital** el contador ajusta la tabla con el editor (p. ej. *Recalcular desde una cuota*).
- Una venta tiene **un comprador**; un segundo comprador se agrega a mano en el texto del contrato.
- No envía correos ni mensajes automáticamente: las cartas se imprimen o exportan, y WhatsApp se abre con el texto listo para enviar.
- La "app" es la aplicación web instalable; no está publicada en Google Play ni App Store.

## Desarrollo

```bash
npm run dev    # servidor (puerto 3000) + aplicación web con recarga automática (puerto 5173)
npm test       # pruebas del cálculo financiero, la API, los permisos y la migración de la base
```

```
iniciar.sh         inicio local (instala, compila, pide contraseñas la primera vez)
server/            API (Node + Express) y base de datos SQLite
  auth.js          cuentas fijas y permisos de cada perfil
  migraciones.js   esquema de la base (se actualiza sola al iniciar)
  clave.js         restablecer una contraseña desde la consola
  lib/finanzas.js  amortización y montos en palabras
  lib/creditos.js  ventas, cuotas, imputación de pagos, edición de la tabla
  lib/bitacora.js  registro de cambios
  lib/plantillas.js  variables y confección de documentos
  lib/loteo.js     carga del plano del topógrafo (parcelas y fondo del mapa)
  importar-loteo.js  carga el plano desde la consola (lo usa iniciar.sh)
  datos/loteo.json plano del loteo convertido
  rutas/           un archivo por módulo
  test/            pruebas automáticas
client/            aplicación web (React + TypeScript + Tailwind)
  src/paginas/     una pantalla por archivo
  src/componentes/ mapa, gráfico, editor de texto, formularios compartidos
herramientas/plano/  conversor del plano (DWG + KMZ → server/datos/loteo.json)
planos/            planos originales entregados por el cliente
data/              base de datos y plano de fondo en uso (no se versiona)
```
