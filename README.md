# Agua Fresca SpA · Fundo Entre Ríos — Sistema de gestión

Sistema web para administrar la venta de parcelas del proyecto Fundo Entre Ríos: créditos y cuotas,
cobranza, clientes, cotizaciones, contratos y visitas. Se usa desde el computador y desde el celular
(se puede instalar como aplicación).

## Qué hace

| Requerimiento | Dónde está en el sistema |
|---|---|
| 1. Control de ventas con crédito: cuotas pendientes, atrasadas, flujo futuro, tabla de amortización con interés | **Ventas** (tabla de amortización de cada venta, registro de pagos) y **Cobranza** (cuotas atrasadas, cuotas pendientes, flujo de ingresos, pagos recibidos) |
| 2. Mapa de parcelas disponibles con sus valores | **Parcelas** → Mapa (plano del topógrafo con cada parcela coloreada por estado, "¿En qué parcela estoy?" con el GPS del celular y archivo para Google Earth) y Lista de precios |
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
| `--preparar` | Deja todo listo (dependencias, compilación y, la primera vez, las cuentas) y termina sin iniciar; lo usa `iniciar-server.sh` |
| `--ayuda` | Muestra estas opciones |

**La base en uso (`data/aguafresca.db`) es la definitiva**, cargada desde el Excel del contador (ver *Datos cargados desde el
Excel del contador* más abajo): **no la borre**. Para probar con datos ficticios use otra carpeta, por ejemplo
`DATA_DIR=/tmp/prueba ./iniciar.sh --demo`.

Después de ingresar con la cuenta `admin`:

1. **Configuración → Empresa y proyecto**: razón social, RUT, representante legal, datos bancarios, ubicación e inscripción del fundo. Estos datos alimentan el membrete, las cartas y las promesas (lo que falte sale como una línea en blanco `____` para completar a mano).
2. **Configuración → Crédito y cobranza**: interés mensual habitual, pie, número de cuotas e interés por mora.
3. **Parcelas → Lista de precios → Cambios en bloque**: fije los precios de lista (por m² o un monto fijo) por manzana o para las parcelas filtradas. Ahí mismo se puede cambiar el nombre de una manzana y el prefijo de sus códigos.
4. **Documentos → Plantillas**: el administrador ajusta los textos, revisados por el abogado de la empresa (ver nota legal más abajo).

## Cuentas y permisos

El sistema tiene **exactamente tres cuentas**; no se crean ni se eliminan desde la aplicación. Se ingresa con el nombre de usuario.
`ldiaz` y `pmercado` son las cuentas de los **dueños**.

| Función | `admin` · Super administrador | `pmercado` · Administrador (dueño) | `ldiaz` · Usuario (dueño) |
|---|:-:|:-:|:-:|
| Ver toda la información: parcelas, clientes y deudores, ventas, cuotas, cobranza, flujo de ingresos, pagos | ✓ | ✓ | ✓ |
| Clientes (ficha completa) y gestiones de cobranza, ventas, registrar pagos, reservar parcelas | ✓ | ✓ | |
| Cotizaciones | ✓ | ✓ | ✓ |
| Informar al administrador una venta cerrada (para que la registre) | | | ✓ |
| Completar los datos esenciales de un cliente (identificación y domicilio) | ✓ | ✓ | ✓ |
| Agendar visitas | ✓ | ✓ | ✓ a su nombre (modifica solo las que agendó) |
| Confeccionar cartas y promesas · enviar cartas de cobranza por correo o WhatsApp | ✓ | ✓ | ✓ |
| Modificar las plantillas de documentos legales | ✓ | ✓ | |
| Precios de lista de las parcelas (de a una o en bloque) | ✓ | ✓ | |
| Tabla de amortización · datos contables (tasas, corregir o anular pagos, anular ventas) · envío programado de cartas | ✓ | ✓ | |
| Datos de la empresa y el proyecto · correo para enviar cartas · firma del representante | ✓ | ✓ | |
| Parcelas: crear, manzanas y códigos, editar el mapa, cargar el plano · Google Earth | ✓ | ✓ | |
| Cuentas: nombres, restablecer contraseñas, **bloquear o reactivar** y **cerrar sesiones** · eliminar clientes | ✓ | | |
| **Sistema**: estado de la instalación, **respaldos de la base desde la web**, correcciones automáticas aplicadas | ✓ | | |
| Registro de cambios | todos los cambios | los de los dueños y del sistema | los de los dueños y del sistema |
| Datos personales para los documentos legales (cada uno los suyos) | | ✓ | ✓ |
| Avisos de visitas en la campana | | ✓ | ✓ |

El super administrador puede todo lo del administrador y, además, las cuentas y el sistema. Una cuenta **bloqueada** no puede
ingresar (al intentarlo con su contraseña se le avisa que está bloqueada) y se cierran sus sesiones abiertas; sus datos y lo
que registró se conservan. En **Configuración → Sistema** se descarga un respaldo de la base al momento (una copia completa,
aunque el sistema esté en uso) y los respaldos automáticos que se hacen antes de cada actualización.

El usuario (`ldiaz`) **no registra nada que tenga que ver con dinero**: ve las ventas, deudas, deudores e ingresos, pero los botones
para registrar ventas o pagos, reservar o cambiar precios no aparecen en su cuenta (y el servidor los rechaza igual). Sí cotiza,
y cuando cierra una venta la informa al administrador (ver abajo). Cuando un documento necesita datos del cliente que faltan
(RUT, estado civil, profesión, domicilio…), el sistema lo avisa y él mismo puede completarlos, sin acceso a la renta ni a los
antecedentes comerciales.

### Ventas que cierra el usuario

1. El usuario cotiza la parcela y, cuando el cliente acepta, en la cotización elige **Informar venta al administrador** (con notas
   opcionales). La parcela queda reservada, si así lo indica.
2. El administrador recibe el aviso en la campana y la venta aparece en **Ventas → Ventas informadas por registrar**. *Registrar
   venta* abre el formulario con todos los datos de la cotización; revisa el comprador y la forma de pago y la registra.
3. Al registrarla, el usuario recibe el aviso. Si el administrador la descarta (por ejemplo, el cliente desistió), indica el
   motivo, se libera la reserva y el usuario también se entera. Mientras espera, la cotización no se puede modificar.

Cada persona cambia su propia contraseña en **Configuración → Mi cuenta**.

### Datos personales de los dueños en los documentos

En **Configuración → Mi cuenta → Mis datos personales**, `ldiaz` y `pmercado` completan su nombre completo, RUT, nacionalidad,
estado civil, profesión, cargo, domicilio, teléfono y correo (con confirmación "antes → después"; en el registro de cambios queda
qué campos cambiaron, no los datos). Con eso los documentos se completan solos:

- **Representante legal**: en *Configuración → Empresa y proyecto* el super administrador elige si el representante es uno de los dueños.
  Si lo es, la comparecencia y la firma de la promesa toman sus datos (`{{representante.nombre}}`, `{{representante.rut}}`,
  `{{representante.nacionalidad}}`, `{{representante.estado_civil}}`, `{{representante.profesion}}`…) y se actualizan solas cuando él
  corrige los suyos. Si es otra persona, se escriben a mano el nombre y el RUT, como antes.
- **Variables de cada dueño** para usar en cualquier plantilla (*Insertar dato*): `{{ldiaz.nombre}}`, `{{ldiaz.rut}}`… y
  `{{pmercado.nombre}}`, `{{pmercado.rut}}`… (los nombres anteriores `{{abogado.…}}` y `{{contador.…}}` siguen funcionando). Un dato sin completar sale como línea en blanco `____`.

### Protección contra errores

- **Confirmación con "antes → después"**: todo cambio sensible (datos de la empresa, tasas, precios de parcelas, contraseñas, corrección de pagos, plantillas, tabla de amortización) muestra exactamente qué cambia y pide confirmar antes de guardar.
- **Motivo obligatorio** al modificar la tabla de amortización, corregir o anular un pago y anular una venta.
- **Deshacer**: cada cambio a una tabla de amortización queda en **Historial de cambios** de la venta con un botón *Deshacer este cambio*; cada versión de una plantilla queda en *Versiones anteriores*. Deshacer también se puede deshacer.
- **Registro de cambios** (Configuración): quién cambió qué, cuándo y por qué. El super administrador ve todo; los dueños, los cambios hechos por `ldiaz` y `pmercado`. Se filtra por persona y tipo, y se descarga a Excel.

### Formato de los datos

Cada campo acepta solo lo que corresponde y lo ordena al salir de él. Si algo no calza, se marca en rojo con el motivo y no se
guarda (el servidor vuelve a revisarlo, así que tampoco entra un dato mal escrito por otra vía).

| Campo | Qué acepta | Cómo queda |
|---|---|---|
| RUT (cliente, aval, interesado, empresa, representante, dueños) | Números, puntos, guion y K; se revisa el dígito verificador | `12.345.678-5` |
| Celular (cliente, interesado, visita) | Solo números (y `+` al comienzo); 9 dígitos que empiezan con 9, con o sin +56 | `+56 9 1234 5678` |
| Teléfono (aval, empresa, dueños) | Celular o fijo: Santiago `2 2345 6789`, regiones `45 234 5678`; extranjero con `+` y código de país | `+56 2 2345 6789` |
| Correo electrónico | `nombre@dominio.cl` | en minúsculas |
| Fecha de nacimiento | No puede ser posterior a hoy | — |
| N° de cuotas, días, cuotas pagadas | Solo números enteros | — |
| Interés, pie, superficie | Números con coma decimal | `1,25` |
| Montos | Solo números; se muestran con puntos de miles | `$24.700.000` |
| Rol de avalúo (SII) | Números con guion | `1234-56` |

Los datos que ya estaban guardados con otro formato se siguen mostrando; al editarlos por primera vez habrá que dejarlos en el
formato correcto.

### Cuotas por monto

Al cotizar o vender, en **Calcular por** se elige *N° de cuotas* (se calcula el valor de la cuota) o *Monto de la cuota*: se indica
un monto cerrado, como $500.000 (solo múltiplos de $1.000; al salir del campo se redondea), y el sistema calcula cuántas cuotas
hacen falta. Todas las cuotas son de ese monto, **también la última**: lo que la última excede al saldo se cuenta como interés
(así lo cobra la empresa). Con *N° de cuotas* la cuota calculada se redondea hacia arriba a $1.000 y todas son iguales. Si la cuota
no alcanza a cubrir el interés del mes o el crédito pasaría de 360 cuotas, lo avisa.

El **pie habitual** que se propone al cotizar y vender es un monto en pesos (Configuración → Crédito y cobranza); si el precio
es menor, el pie propuesto es el precio.

### Aplazar cuotas

Cuando se acuerda con un cliente que no pague uno o más meses (repactación), en la venta → **Aplazar cuotas** (administrador o super
administrador) se elige desde qué cuota y cuántos meses. Esos meses la cuota queda en **$0**: se carga solo el interés del mes, que
**aumenta la deuda de capital**, y las cuotas siguientes se corren con su mismo monto; al final se agregan las que hagan falta.
Antes de guardar se ve cómo queda el crédito (cuotas, fecha de término, total a pagar), se exige un motivo y el cambio queda en
el historial de la venta, desde donde se puede deshacer. En el editor de la tabla está la misma herramienta. Las cuotas aplazadas
no cuentan como atrasadas ni como cuotas por pagar.

### Pie de firma y firma digital

Los comprobantes de pago, las cotizaciones, el estado de cuenta impreso y las cartas de cobranza llevan el pie de firma: la firma
digital y, bajo ella, solo la leyenda **"Soc. de Inv. e Inmob. Agua Fresca SpA"** (sin nombre, RUT ni cargo del representante). La firma se carga en **Configuración → Empresa y
proyecto → Firma digital** (o el dueño designado representante, en *Mi cuenta*): una foto o escaneo de la firma en papel blanco;
el sistema quita el fondo. En las cartas va con la variable `{{firma}}`; al enviarlas por correo la firma viaja como imagen adjunta.
Todos los documentos llevan en el encabezado el **logo del Fundo Entre Ríos** (`client/public/logo.png`) junto a los datos de la
empresa: cotizaciones, comprobantes, estado de cuenta, ficha del cliente, cartas y promesas. En cartas y promesas el membrete viene
marcado y se puede quitar con la casilla; va también en el Word (el logo y la firma se convierten a JPEG sobre blanco, porque
Word para Mac pinta de negro la transparencia) y en el correo de las cartas (como imagen adjunta).
Todos los documentos llevan arriba el lugar y la fecha: **"Punta Arenas, 24 de noviembre de 2026"** (en las cartas y promesas,
con la variable `{{lugar_emision}}`). Al guardarlos como PDF el navegador propone el nombre del archivo según el documento:
**"Cobranza - <cliente>"** (cartas, también al exportar a Word), **"Pago - <cliente>"** (comprobantes), "Cotización - …",
"Estado de cuenta - …", "Promesa - …" y "Ficha - …".
El comprobante de pago indica **cuántas cuotas quedan pendientes y de cuál a cuál** (por ejemplo "Quedan 56 cuotas pendientes:
de la N° 51 a la N° 106").

### Visitas y avisos

Cada visita dice **quién la agendó** (por ejemplo, "Luis Díaz (Abogado)") y quién la atiende. Los dueños reciben avisos en la
**campana** (arriba): cuando el otro agenda, reprograma, cancela o elimina una visita, y un recordatorio de las visitas de las
próximas 24 horas y otro **una hora antes**. Además, el administrador recibe las ventas que informa el usuario y el resumen del envío
programado de cartas, y el usuario se entera cuando su venta quedó registrada o fue rechazada. Tocar un aviso abre lo que
corresponde (el día de la visita, la venta…).

#### Avisos en el celular y el computador aunque el sistema esté cerrado

Cada dueño los activa **una vez en cada equipo** donde quiera recibirlos (celular, computador de la oficina, notebook):

1. Entrar con su cuenta y tocar la **campana** → *Activar avisos en este equipo* (o en **Configuración → Mi cuenta → Avisos en este equipo**).
2. Aceptar cuando el navegador pregunte si permite notificaciones.
3. Con *Enviar aviso de prueba* se comprueba que llegan.

Desde ese momento los avisos llegan como notificación del teléfono o del computador **aunque la app esté cerrada**. En Mi cuenta se
ve la lista de equipos activados y se puede desactivar cualquiera. Al cerrar sesión en un equipo, ese equipo deja de recibirlos.

Requisitos:

- **El sistema debe estar publicado con HTTPS** (ver [Publicarlo en internet](#publicarlo-en-internet)). Es una exigencia de los
  navegadores: sin HTTPS solo funciona en el mismo computador donde corre el sistema (`http://localhost:3000`); desde el celular por
  la red local (`http://192.168.…`) la opción aparece como no disponible y explica el motivo.
- **Android**: Chrome, Edge o Firefox. Conviene instalarlo como app (ver abajo), pero no es obligatorio.
- **iPhone/iPad**: iOS 16.4 o más nuevo, y **primero hay que agregar el sistema a la pantalla de inicio** (Safari → Compartir →
  *Agregar a inicio*) y activar los avisos abriéndolo desde ese ícono. En Safari normal Apple no lo permite.
- **Computador**: Chrome, Edge o Firefox. El navegador debe quedar funcionando en segundo plano (no hace falta tener el sistema
  abierto). En Windows, revisar que las notificaciones de Chrome/Edge no estén silenciadas en *Configuración → Sistema → Notificaciones*.
- **El servidor del sistema debe estar encendido y con internet**: es quien manda los avisos (a través del servicio de avisos de
  Google, Mozilla o Apple, según el navegador). Si el teléfono está apagado o sin señal, el aviso le llega al volver a conectarse
  (se guarda hasta 24 horas).
- Si se negó el permiso por error, la campana lo indica: hay que permitir las notificaciones de este sitio en la configuración del
  navegador (candado junto a la dirección) y volver a activar.

### Envío de cartas de cobranza por correo y WhatsApp

- **A mano**: en una carta emitida (Documentos), *Enviar por correo* o *Abrir en WhatsApp*. Con confirmación.
- **Programado, solo por correo** (Configuración → Envío de cartas; lo define el administrador): cada día, a la hora indicada (y si se
  quiere solo de lunes a viernes), el sistema envía por correo a cada deudor la carta de la etapa que corresponde a los días de
  atraso de su cuota impaga más antigua (por defecto: primer aviso a los 5 días, segundo a los 20, último a los 45). Cada etapa se
  envía una sola vez; si el deudor se pone al día y se vuelve a atrasar, el ciclo parte de nuevo. **El sistema debe estar
  encendido** a esa hora.
- **Cobranza → Envío de cartas** muestra qué saldría hoy, permite *Enviar ahora* y guarda el registro de cada envío (también en la
  ficha del deudor, y un aviso al administrador con el resumen).
- **Modo de prueba** (activo al comenzar): los correos se registran pero no salen. Se desactiva cuando el correo está probado.
- **Correo**: el super administrador configura el servidor SMTP de la cuenta de envío (por ejemplo Gmail con una *contraseña de
  aplicación*) y lo prueba con *Probar correo*. La contraseña no se vuelve a mostrar.

#### WhatsApp (a mano, sin costo)

WhatsApp no se configura en el sistema y no usa la API pagada de Meta: **cada carta se envía desde el WhatsApp de quien la manda**.

1. En la carta emitida, *Abrir en WhatsApp* abre la conversación con el celular del cliente y el texto de la carta ya escrito.
2. La persona revisa el mensaje y lo envía. Queda anotado en la ficha del deudor.

Para que funcione:

- En el **computador**: tener abierta la sesión de **WhatsApp Web** (web.whatsapp.com) o la aplicación de escritorio de WhatsApp,
  vinculada al celular (en el celular: WhatsApp → Dispositivos vinculados → Vincular un dispositivo, y escanear el código).
- En el **celular**: tener WhatsApp instalado. En **Android** todos los botones de WhatsApp del sistema (carta, cotización,
  ficha del cliente, visitas) abren **WhatsApp Business** (`client/src/whatsapp.ts` arma un enlace `intent://` al paquete
  `com.whatsapp.w4b`); si no está instalado, el navegador usa el enlace normal `wa.me`, que abre el WhatsApp que haya.
  En **iPhone** se usa siempre `wa.me`, y lo abre el WhatsApp que elija el celular.
- El cliente debe tener su **celular en la ficha** (por ejemplo `+56 9 1234 5678`; se acepta también sin `+56`).

El mensaje sale desde la cuenta abierta en ese equipo: conviene usar un número de la empresa (la aplicación gratuita
*WhatsApp Business* sirve) y no el personal. Como no hay API, **no hay envíos programados por WhatsApp**: esos salen por correo.

### Editor de la tabla de amortización

Desde una venta, **Editar tabla** (administrador o super administrador):

- Cada cuota se edita a mano: vencimiento, interés y amortización. La cuota es siempre interés + amortización y el saldo insoluto se recalcula solo; las celdas cambiadas se marcan.
- **Recalcular desde una cuota**: renegociación del capital pendiente con otra tasa o número de cuotas (cuota fija).
- **Aplazar cuotas**: meses en $0 en que se carga solo el interés (ver *Aplazar cuotas*).
- **Mover vencimientos**: postergar meses o cambiar el día de pago desde una cuota en adelante (sin cargar interés).
- Agregar o quitar cuotas, **cerrar el saldo en $0** o dejar la **última cuota completa**, cambiar precio, pie y tasa.
- Antes de guardar se revisa un resumen (totales antes y después, cuotas modificadas, advertencias). No deja guardar una tabla por debajo de lo ya pagado ni cuotas en $0; un saldo final distinto de $0 exige aceptar la advertencia.
- Los pagos ya registrados se vuelven a imputar a la tabla nueva.

## Plano del loteo

Los planos que entregó el cliente están en `planos/` (AutoCAD `.dwg` y Google Earth `.kmz`). Se convirtieron a
`server/datos/loteo.json`, que el sistema carga como parcelas y como fondo del mapa:

- **185 lotes en 9 manzanas**, cada una con su numeración desde 1: A (28), B (12), C (16), D (4), E (9), F (4), G (18), H (9) e I (85).
  El código de cada parcela es *manzana-número* (por ejemplo `B-12`): el número es el del plano y la letra es la que usan los
  dueños y el contador (el plano no trae letras; se confirmaron con ellos y están en `LETRAS_DUENOS` del conversor):
  A = los 28 lotes del sur, junto al camino público; B = la franja de 12 del extremo poniente; C = 16; en el bloque doble del
  norte, la fila de arriba es la **H** (H-1 a H-9) y la de abajo G-10 a G-18; la fila pegada a la C es G-1 a G-9 (corregido con los
  dueños el 21-11-2026); D = 4 pegados al bloque del norte; F = los 4 siguientes hacia el oriente; E = 9 al sur-oriente, junto a
  la A; I = los 85 del oriente, hacia el Río Colorado. Si se quisiera otro nombre, el super administrador lo cambia en
  *Cambios en bloque → Manzana y código*.
- **Superficie**: la anotada por el topógrafo en el plano. En los lotes I-52, I-54, I-75, I-77 e I-84 el contorno dibujado difiere
  más de un 3 % de lo anotado; se usa lo anotado.
- **Deslindes**: se generaron desde el dibujo (orientación, largo según las cotas del plano y colindante: otro lote, camino interior,
  camino predial público, Río Colorado o límite del fundo). Son un **borrador**: el abogado debe revisarlos contra el plano
  archivado antes de usarlos en una promesa. Se editan en cada parcela.
- **Ubicación**: el plano está georreferenciado con el `.kmz` (error menor a 1 m); cada parcela y cada visita tienen enlace a Google Maps.
- **En terreno**: en el celular, **Parcelas → ¿En qué parcela estoy?** usa el GPS y marca en el mapa dónde está uno y en qué
  parcela (o la más cercana y a cuántos metros). Requiere el sistema publicado con HTTPS.
- **Imagen satelital**: el botón de satélite del mapa cambia el dibujo del plano por la foto satelital (Esri World Imagery), con
  las parcelas encima; cada equipo recuerda la vista elegida. Antes de usarla comercialmente conviene revisar las condiciones de
  uso de Esri (o cambiarla por otro proveedor, como Google, que pide una clave de pago).
- **Google Earth**: no se puede abrir con un archivo indicado en un enlace, así que se configura una vez (administrador o super
  administrador, en el botón *Google Earth* del mapa): se descarga un *enlace de red* (KML chico), se importa en un proyecto de
  Google Earth y se pega en el sistema el vínculo de ese proyecto. Desde ahí el botón *Google Earth* abre el proyecto en una
  pestaña nueva, y el proyecto lee las parcelas al día desde `/earth/<clave>/parcelas.kml` (sin sesión: lo protege la clave larga
  de la dirección, que se puede renovar, y no lleva nombres de compradores). Con la dirección temporal de Cloudflare, al
  reiniciarse el servidor la dirección cambia y hay que volver a importar el enlace. También se puede descargar un archivo fijo
  con los datos del día.
- **Al tocar una parcela**: si está vendida se ven los datos del propietario (y se pueden editar ahí mismo) y su situación de
  pago; si no, se cambia su precio.
- **Precios**: el plano no los trae; las parcelas parten con *precio por definir*.

Volver a cargar el plano (**Mapa → Editar mapa → Actualizar desde el plano**) no duplica parcelas ni cambia precios, estados ni
deslindes ya escritos: solo crea las que falten y actualiza los contornos.

Si el topógrafo entrega un plano nuevo, se convierte con:

```bash
npm install --no-save @mlightcad/libredwg-web     # lector de DWG; no queda como dependencia del sistema
node herramientas/plano/convertir.mjs "planos/nuevo.dwg" "planos/nuevo.kmz"
```

El conversor reconstruye cada lote a partir de las líneas del dibujo (cierra las uniones que quedaron abiertas), lee el número
y la superficie de cada lote, separa las manzanas por su numeración y avisa lo que conviene revisar.

### Datos cargados desde el Excel del contador

La base definitiva se armó el 17-11-2026 desde **"VENTAS DE PARCELAS FUNDO ENTRE RIOS.xlsx"** (en `data/`): 89 ventas
(29 al contado y 60 a crédito), 87 clientes y la reserva de la B-1 (César Peralta). Cada venta a crédito tiene la tabla de cuotas
de la hoja de su parcela tal como la lleva el contador, y las cuotas marcadas PAGADO quedaron como pagos en su fecha. Los gastos,
retiros y arriendos del libro de caja no se cargaron (el sistema lleva ventas y cobranza, no contabilidad general).

Todo lo que se decidió en cada caso, y lo que falta revisar con el contador (compradores sin nombre, ventas que solo están en el
libro de caja, deudas antiguas), está en **`data/importacion/informe-carga.md`**. Ahí mismo están los programas que hicieron la
carga (`extraer.py` y `cargar.mjs`); viven en `data/` porque contienen datos personales y esa carpeta no se sube a GitHub. La
base de prueba anterior quedó en `data/respaldo-base-de-prueba-2026-11-17/`.

Desde ahora las correcciones se hacen **en el sistema** (ficha del cliente, *Editar tabla* de la venta, corregir pagos), no
volviendo a cargar el Excel: una nueva carga borraría lo registrado después.

**Correcciones automáticas** (`server/lib/correcciones.js`): cuando hay que corregir datos ya cargados, el servidor lo hace una
sola vez al arrancar después de una actualización, queda en el registro de cambios y se avisa al administrador. Así se aplicaron
(21-11-2026): los meses repactados de C-13, C-16, G-12 y G-15 como cuotas aplazadas (antes su interés se había sumado a las
cuotas siguientes); la **última cuota completa** en los créditos vigentes; la ubicación de las manzanas G y H en el mapa; y el pie
de firma en las cartas de cobranza. Cada tabla corregida se puede deshacer desde el historial de su venta.

### Cargar las ventas que ya existen

Al registrar una venta marque **"Es una venta anterior…"** e indique cuántas cuotas ya están pagadas: el sistema
genera el calendario desde la fecha original y deja esas cuotas como pagadas.

## Instalar como app en el celular

Abra la dirección del sistema en Chrome (Android) o Safari (iPhone) y elija **"Agregar a pantalla de inicio" / "Instalar aplicación"**.
Queda con el logo del fundo y bajo el ícono dice **"Gestión"** (el nombre completo, "Gestión Fundo Entre Ríos", aparece al
instalarla y en la lista de aplicaciones). Se abre a pantalla completa. Es la misma aplicación y los mismos datos que en el computador.

Los íconos se generan desde el logo y están en `client/public/` (`logo-*.png`; `insignia-96.png` es la silueta para la barra de
notificaciones de Android). En Android, la app ya instalada toma el ícono y el nombre nuevos sola en uno o dos días; en el iPhone
hay que quitarla de la pantalla de inicio y volver a agregarla.

La instalación como app requiere que el sistema esté publicado con **HTTPS**. Dentro de la red local (por ejemplo
`http://192.168.1.20:3000`) funciona igual desde el navegador del celular, pero sin la opción de instalar ni los avisos con la app
cerrada (ver [Avisos en el celular y el computador](#avisos-en-el-celular-y-el-computador-aunque-el-sistema-esté-cerrado)).

## Publicarlo en internet

Para usarlo desde cualquier lugar, el sistema se instala en un servidor con **Ubuntu Server** (un computador de la
oficina o un VPS pequeño, con 1 GB de memoria o más). Se publica con un **túnel de Cloudflare**, que da HTTPS sin abrir
puertos en el router ni en el firewall. El script `iniciar-server.sh` hace todo:

```bash
git clone https://github.com/fmercado24/aguafresca.git
cd aguafresca
./iniciar-server.sh
```

Ejecútelo con el usuario normal del servidor, **sin sudo**: el script pide la contraseña cuando la necesita.

**La primera vez**, el script:

1. Pregunta si tiene un **dominio propio** agregado a Cloudflare (el plan gratuito basta):
   - **Con dominio:** pide la dirección (por ejemplo `gestion.aguafresca.cl`) y muestra un enlace. Ese enlace se abre
     en cualquier navegador para autorizar el servidor en la cuenta de Cloudflare. El túnel y la dirección se crean solos.
   - **Sin dominio:** usa una dirección temporal gratuita (`https://….trycloudflare.com`) que **cambia cada vez que se
     reinicia el servidor**. La app instalada en los celulares y los avisos quedan ligados a la dirección, así que solo
     conviene para empezar. El dominio se agrega después con `./iniciar-server.sh --dominio`.
2. Instala Node.js y cloudflared, y compila la aplicación.
3. Pide la base de datos. Hay que copiar la definitiva desde el computador donde se cargó el Excel: el script muestra
   el comando `scp` exacto. Antes de copiarla, cierre el sistema en ese computador. También se puede empezar con una
   base nueva (solo los lotes del plano). **Desde ese momento los datos se ingresan solo en el servidor.**
4. Deja el sistema y el túnel como **servicios**: arrancan solos al encender el servidor y se reinician solos si fallan.
   El sistema queda escuchando solo dentro del servidor (`127.0.0.1`), así que desde fuera se llega únicamente por el túnel.

**Las veces siguientes**, el mismo `./iniciar-server.sh` **actualiza** el sistema. Descarga lo nuevo desde GitHub
(`git pull`), instala dependencias si cambiaron y compila. Luego detiene el sistema unos segundos, respalda la base en
`data/respaldos/` (se guardan los últimos 15) y lo inicia con la versión nueva. Si algo falla (no compila o no arranca),
**vuelve solo a la versión anterior** y deja la base como estaba.

| Opción | Qué hace |
|---|---|
| *(ninguna)* | La primera vez instala y publica el sistema; después lo actualiza desde GitHub |
| `--estado` | Muestra si el sistema y el túnel están funcionando, y la dirección (útil con la dirección temporal) |
| `--dominio` | Agrega un dominio propio o lo cambia |

La configuración queda en `/etc/aguafresca/`, y los datos en la carpeta `data/` del proyecto, igual que en el
computador. Para restablecer una contraseña en el servidor se usa el mismo `./iniciar.sh --clave ldiaz`. Para ver los
mensajes del sistema: `sudo journalctl -u aguafresca -n 50`.

Para usar otro servidor web (Caddy, Nginx) en vez del túnel, se configura con estas variables:

```bash
npm ci && npm run build
PORT=3000 DATA_DIR=/var/lib/aguafresca COOKIE_SECURE=true TRUST_PROXY=1 npm start
```

| Variable | Para qué sirve | Valor por defecto |
|---|---|---|
| `PORT` | Puerto del servidor | `3000` |
| `LISTEN_HOST` | Dirección donde escucha (`127.0.0.1` = solo dentro del servidor, detrás de un proxy o túnel) | todas |
| `DATA_DIR` | Carpeta de la base de datos y el plano | `./data` |
| `CLAVE_ADMIN`, `CLAVE_LDIAZ`, `CLAVE_PMERCADO` | Contraseñas iniciales de las tres cuentas (solo el primer arranque) | al azar, se muestran en la consola |
| `COOKIE_SECURE` | `true` cuando se publica con HTTPS | — |
| `TRUST_PROXY` | `1` cuando hay un proxy (Caddy/Nginx) delante | — |
| `TZ_APP` | Zona horaria para "hoy", los atrasos y la hora del envío programado | `America/Santiago` |

## Respaldo

Toda la información está en la carpeta `data/` (`aguafresca.db` y el plano). **Respalde esa carpeta periódicamente**;
para restaurar, basta con volver a copiarla. Conviene hacerlo con el sistema detenido, o copiar también los archivos
`aguafresca.db-wal` y `aguafresca.db-shm` si existen.

## Cómo calcula

- **Cuotas**: cuota fija mensual de monto cerrado (múltiplo de $1.000) con interés sobre el saldo insoluto, en pesos sin decimales. La última cuota también es completa: amortiza lo que queda y el resto es interés, de modo que el saldo termina exactamente en $0.
- **Cuota aplazada**: cuota de $0; el interés del mes se suma al capital (amortización negativa) y se paga con las cuotas siguientes.
- **Vencimientos**: mismo día de cada mes que la primera cuota (si el mes no tiene ese día, el último día del mes).
- **Pagos**: se imputan a la cuota más antigua con saldo; admite abonos parciales y pagos que cubren varias cuotas. Al anular un pago, las cuotas vuelven a su estado anterior.
- **Atraso**: una cuota está atrasada desde el día siguiente a su vencimiento si tiene saldo.
- **Interés por mora**: es una *estimación informativa* — saldo de la cuota × tasa de mora mensual × días de atraso / 30. No se cobra automáticamente: al registrar un pago se anota aparte la mora efectivamente cobrada.
- **Flujo de ingresos**: suma por mes del saldo de las cuotas por vencer, separando capital e interés. Lo ya atrasado se muestra aparte.
- **Recaudado del mes** (Inicio): pagos recibidos en el mes. No cuentan los pagos anulados, los de ventas anuladas (ingresadas por error) ni los de la carga inicial de ventas antiguas.
- **Listados**: parcelas, ventas y cobranza se pueden ordenar por parcela (manzana y número, de menor a mayor); el orden elegido se recuerda en cada equipo.
- **Desglose contable de los pagos** (Cobranza → Pagos recibidos): dentro de cada cuota, lo pagado cubre primero el interés y luego el capital. La mora cobrada se informa aparte.

## Nota legal

Las plantillas de **promesa de compraventa** y de **cartas de cobranza** incluidas son modelos referenciales.
Deben ser revisadas y ajustadas por el abogado de la empresa antes de usarlas con clientes. Verifique también
que las tasas de interés y de mora no superen el interés máximo convencional vigente.

## Alcance de esta versión

- Montos en **pesos chilenos**. No maneja UF.
- Un pago mayor a la cuota se imputa a las cuotas siguientes; para un **prepago a capital** el administrador ajusta la tabla con el editor (p. ej. *Recalcular desde una cuota*).
- Una venta tiene **un comprador**; un segundo comprador se agrega a mano en el texto del contrato.
- WhatsApp se envía a mano (sin la API pagada de Meta); los envíos programados de cartas salen solo por correo.
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
  lib/datos-personales.js  datos de los dueños y representante legal para los documentos
  lib/avisos.js    avisos de la campana (visitas)
  lib/canales.js   correo de envío (SMTP)
  lib/envios.js    envío de cartas a mano y programado
  rutas/           un archivo por módulo
  test/            pruebas automáticas
client/            aplicación web (React + TypeScript + Tailwind)
  src/paginas/     una pantalla por archivo
  src/componentes/ mapa, gráfico, editor de texto, formularios compartidos
herramientas/plano/  conversor del plano (DWG + KMZ → server/datos/loteo.json)
planos/            planos originales entregados por el cliente
data/              base de datos y plano de fondo en uso (no se versiona)
```
