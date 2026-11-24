// Plantillas que se cargan al crear la base de datos. Son MODELOS REFERENCIALES:
// la empresa debe hacerlos revisar por su abogado y ajustarlos desde la pantalla
// Documentos → Plantillas antes de usarlos con clientes.

const encabezadoCarta = `
<p style="text-align:right">{{lugar_emision}}, {{fecha_hoy}}</p>
<p>Señor(a)<br><strong>{{cliente.nombre}}</strong><br>{{cliente.direccion}}, {{cliente.comuna}}<br><u>Presente</u></p>`;

// {{firma}}: firma digital y, bajo ella, solo "Soc. de Inv. e Inmob. Agua Fresca SpA" (el teléfono y el correo van en el membrete).
const firmaCarta = `
<p>Sin otro particular, le saluda atentamente,</p>
{{firma}}`;

/** Pie de firma de las versiones anteriores de las cartas (para actualizar las plantillas ya guardadas). */
export const FIRMA_CARTA_ANTERIOR = '<p><br /><br /><strong>{{empresa.representante}}</strong><br />{{empresa.razon_social}}<br />{{empresa.telefono}} · {{empresa.email}}</p>';
export const FIRMA_CARTA_NUEVA = '{{firma}}';

/** Encabezado de lugar y fecha de las cartas: siempre "Punta Arenas, <fecha>". */
export const FECHA_CARTA_NUEVA = '<p style="text-align:right">{{lugar_emision}}, {{fecha_hoy}}</p>';

const cartaRecordatorio = `${encabezadoCarta}
<p><strong>Ref.: Recordatorio de pago — Parcela N° {{parcela.numero}}, {{proyecto.nombre}}</strong></p>
<p>De nuestra consideración:</p>
<p style="text-align:justify">Junto con saludarle, le informamos que, según nuestros registros, a la fecha de esta carta se encuentran pendientes de pago <strong>{{deuda.cuotas_atrasadas}}</strong> cuota(s) correspondientes a la compra de la Parcela N° {{parcela.numero}} del proyecto {{proyecto.nombre}}, por un total de <strong>{{deuda.monto_atrasado}}</strong>, de acuerdo con el siguiente detalle:</p>
{{tabla_cuotas_atrasadas}}
<p style="text-align:justify">Entendemos que puede tratarse de una omisión involuntaria, por lo que le agradeceremos regularizar su situación a más tardar el <strong>{{fecha_limite_pago}}</strong>. El pago puede efectuarse mediante transferencia o depósito a la siguiente cuenta:</p>
<p>{{empresa.datos_bancarios}}</p>
<p style="text-align:justify">Si a la fecha de recepción de esta carta usted ya efectuó el pago, le rogamos no considerar este aviso y enviarnos el comprobante a {{empresa.email}}.</p>
${firmaCarta}`;

const cartaSegundoAviso = `${encabezadoCarta}
<p><strong>Ref.: Segundo aviso de cobranza — Parcela N° {{parcela.numero}}, {{proyecto.nombre}}</strong></p>
<p>De nuestra consideración:</p>
<p style="text-align:justify">Por medio de la presente reiteramos a usted que mantiene <strong>{{deuda.cuotas_atrasadas}}</strong> cuota(s) vencidas e impagas correspondientes a la compra de la Parcela N° {{parcela.numero}} del proyecto {{proyecto.nombre}}, la más antigua con <strong>{{deuda.dias_atraso}}</strong> días de atraso, según el siguiente detalle:</p>
{{tabla_cuotas_atrasadas}}
<p style="text-align:justify">El monto atrasado asciende a <strong>{{deuda.monto_atrasado}}</strong>, al que se agregan intereses por mora estimados a esta fecha en {{deuda.interes_mora}}, lo que da un total a regularizar de <strong>{{deuda.total}}</strong>.</p>
<p style="text-align:justify">Le solicitamos efectuar el pago a más tardar el <strong>{{fecha_limite_pago}}</strong>, o bien tomar contacto con nosotros dentro de ese plazo para convenir una solución. Datos para el pago:</p>
<p>{{empresa.datos_bancarios}}</p>
<p style="text-align:justify">Si ya efectuó el pago, le rogamos enviarnos el comprobante a {{empresa.email}} y no considerar este aviso.</p>
${firmaCarta}`;

const cartaUltimoAviso = `${encabezadoCarta}
<p><strong>Ref.: Último aviso de cobranza — Parcela N° {{parcela.numero}}, {{proyecto.nombre}}</strong></p>
<p>De nuestra consideración:</p>
<p style="text-align:justify">Pese a nuestras comunicaciones anteriores, a la fecha usted mantiene <strong>{{deuda.cuotas_atrasadas}}</strong> cuota(s) vencidas e impagas del contrato celebrado con {{empresa.razon_social}} por la Parcela N° {{parcela.numero}} del proyecto {{proyecto.nombre}}, con un atraso de hasta <strong>{{deuda.dias_atraso}}</strong> días:</p>
{{tabla_cuotas_atrasadas}}
<p style="text-align:justify">El total a regularizar, incluidos los intereses por mora estimados a esta fecha, asciende a <strong>{{deuda.total}}</strong>.</p>
<p style="text-align:justify">Le otorgamos un último plazo, hasta el <strong>{{fecha_limite_pago}}</strong>, para pagar lo adeudado o suscribir un acuerdo de pago. Vencido ese plazo sin que su situación se haya regularizado, la empresa podrá ejercer los derechos que le confieren el contrato y la ley, incluido el cobro judicial de lo adeudado.</p>
<p style="text-align:justify">Para pagar o convenir una solución puede comunicarse con nosotros al {{empresa.telefono}} o al correo {{empresa.email}}. Datos para el pago:</p>
<p>{{empresa.datos_bancarios}}</p>
${firmaCarta}`;

const comparecencia = `
<h1 style="text-align:center">CONTRATO DE PROMESA DE COMPRAVENTA</h1>
<p style="text-align:center"><strong>{{empresa.razon_social}}</strong><br>A<br><strong>{{cliente.nombre}}</strong></p>
<p style="text-align:justify">En {{lugar_emision}}, a {{fecha_hoy}}, entre <strong>{{empresa.razon_social}}</strong>, rol único tributario N° {{empresa.rut}}, representada por don(ña) <strong>{{representante.nombre}}</strong>, de nacionalidad {{representante.nacionalidad}}, {{representante.estado_civil}}, {{representante.profesion}}, cédula de identidad N° {{representante.rut}}, ambos domiciliados en {{empresa.direccion}}, {{empresa.ciudad}}, en adelante “la promitente vendedora”; y don(ña) <strong>{{cliente.nombre}}</strong>, de nacionalidad {{cliente.nacionalidad}}, {{cliente.estado_civil}}, {{cliente.profesion}}, cédula de identidad N° {{cliente.rut}}, domiciliado(a) en {{cliente.direccion}}, comuna de {{cliente.comuna}}, en adelante “el promitente comprador”; se ha convenido el siguiente contrato de promesa de compraventa:</p>
<p style="text-align:justify"><strong>PRIMERO: Antecedentes.</strong> La promitente vendedora es dueña del inmueble denominado {{proyecto.nombre}}, ubicado en {{proyecto.ubicacion}}, cuyo dominio se encuentra inscrito según el siguiente detalle: {{proyecto.inscripcion}}. Dicho inmueble fue subdividido conforme al plano de subdivisión [individualizar plano y su archivo en el Conservador de Bienes Raíces], resultando, entre otros, la <strong>Parcela N° {{parcela.numero}}</strong>, de una superficie aproximada de {{parcela.superficie}} metros cuadrados, rol de avalúo N° {{parcela.rol}}, cuyos deslindes particulares son: {{parcela.deslindes}}.</p>
<p style="text-align:justify"><strong>SEGUNDO: Promesa.</strong> Por el presente instrumento, la promitente vendedora promete vender, ceder y transferir al promitente comprador, quien promete comprar, aceptar y adquirir para sí, la Parcela N° {{parcela.numero}} individualizada en la cláusula anterior.</p>`;

const clausulasFinales = (n) => {
  const ord = ['', 'PRIMERO', 'SEGUNDO', 'TERCERO', 'CUARTO', 'QUINTO', 'SEXTO', 'SÉPTIMO', 'OCTAVO', 'NOVENO', 'DÉCIMO',
    'DÉCIMO PRIMERO', 'DÉCIMO SEGUNDO', 'DÉCIMO TERCERO', 'DÉCIMO CUARTO'];
  let i = n;
  const c = (titulo, texto) => `<p style="text-align:justify"><strong>${ord[i++]}: ${titulo}.</strong> ${texto}</p>`;
  return [
    c('Contrato prometido', 'La escritura pública de compraventa definitiva se otorgará dentro del plazo de [____] días contados desde el pago íntegro del precio, en la notaría que designe la promitente vendedora, la que citará al promitente comprador con a lo menos [____] días de anticipación mediante correo electrónico dirigido a {{cliente.email}}.'),
    c('Forma de la venta', 'La venta se hará como especie o cuerpo cierto, en el estado en que actualmente se encuentra el inmueble, que el promitente comprador declara conocer y aceptar, con todos sus usos, costumbres, derechos y servidumbres activas y pasivas, libre de hipotecas, gravámenes, prohibiciones y litigios, respondiendo la promitente vendedora del saneamiento conforme a la ley.'),
    c('Destino del predio', 'El promitente comprador declara conocer que la parcela proviene de la subdivisión de un predio rústico efectuada conforme al Decreto Ley N° 3.516 de 1980, por lo que queda sujeta a la prohibición de cambiar su destino en los términos que establecen los artículos 55 y 56 de la Ley General de Urbanismo y Construcciones, de lo que se dejará constancia en la escritura definitiva.'),
    c('Entrega material', 'La entrega material de la parcela se efectuará [al momento de suscribirse la escritura definitiva / con esta fecha], oportunidad desde la cual serán de cargo del promitente comprador las contribuciones, consumos y gastos comunes que correspondan al inmueble.'),
    c('Gastos', 'Los gastos notariales, impuestos y derechos de inscripción en el Conservador de Bienes Raíces que origine la compraventa definitiva serán de cargo de [el promitente comprador / ambas partes por mitades].'),
    c('Cláusula penal', 'Si cualquiera de las partes no concurriere a suscribir el contrato prometido en el plazo y condiciones pactados, estando la otra llana a cumplir, deberá pagar a título de cláusula penal una multa equivalente al [____] % del precio, sin perjuicio del derecho de la parte cumplidora para exigir el cumplimiento forzado o la resolución del contrato.'),
    c('Domicilio', 'Para todos los efectos legales derivados de este contrato, las partes fijan su domicilio en la ciudad de {{empresa.ciudad}} y se someten a la competencia de sus tribunales ordinarios de justicia.'),
    c('Ejemplares', 'El presente contrato se firma en dos ejemplares de igual tenor y fecha, quedando uno en poder de cada parte.'),
    `<p><br></p>
<div class="firmas">
<div class="firma">______________________________<br><strong>{{representante.nombre}}</strong><br>C.I. N° {{representante.rut}}<br>p.p. {{empresa.razon_social}}<br>Promitente vendedora</div>
<div class="firma">______________________________<br><strong>{{cliente.nombre}}</strong><br>C.I. N° {{cliente.rut}}<br>Promitente comprador</div>
</div>`,
  ].join('\n');
};

const promesaCredito = `${comparecencia}
<p style="text-align:justify"><strong>TERCERO: Precio.</strong> El precio de la compraventa prometida es la suma de <strong>{{venta.precio}}</strong> ({{venta.precio_palabras}}), que el promitente comprador pagará de la siguiente forma: <strong>a)</strong> con {{venta.pie}} ({{venta.pie_palabras}}), que paga en este acto mediante transferencia electrónica, y que la promitente vendedora declara recibir a su entera satisfacción; y <strong>b)</strong> el saldo de {{venta.saldo}} ({{venta.saldo_palabras}}), en {{venta.n_cuotas}} ({{venta.n_cuotas_palabras}}) cuotas mensuales y sucesivas de {{venta.valor_cuota}} ({{venta.valor_cuota_palabras}}) cada una, que incluyen un interés de {{venta.tasa_mensual}} % mensual sobre el saldo insoluto, con vencimiento los días {{venta.dia_pago}} de cada mes, venciendo la primera el {{venta.fecha_primera_cuota}} y la última el {{venta.fecha_ultima_cuota}}, todo conforme a la tabla de desarrollo que se inserta al final de este instrumento y que forma parte integrante de él.</p>
<p style="text-align:justify"><strong>CUARTO: Lugar y forma de pago.</strong> Las cuotas se pagarán mediante transferencia electrónica o depósito en la cuenta de la promitente vendedora: {{empresa.datos_bancarios}}. El promitente comprador deberá enviar el comprobante respectivo al correo {{empresa.email}}.</p>
<p style="text-align:justify"><strong>QUINTO: Mora.</strong> El simple retardo en el pago de cualquiera de las cuotas hará devengar, desde el día siguiente al del vencimiento y hasta el pago efectivo, un interés penal de {{deuda.tasa_mora}} % mensual sobre el monto atrasado, el que en ningún caso podrá exceder el interés máximo convencional vigente. El no pago de [____] cuotas, consecutivas o no, facultará a la promitente vendedora para exigir el pago total del saldo adeudado como si fuere de plazo vencido, o para pedir la resolución de este contrato con indemnización de perjuicios.</p>
${clausulasFinales(6)}
<div class="salto-pagina"></div>
<h2 style="text-align:center">ANEXO: TABLA DE DESARROLLO DEL CRÉDITO</h2>
<p style="text-align:center">Parcela N° {{parcela.numero}} — {{cliente.nombre}}<br>Saldo de precio: {{venta.saldo}} · Tasa: {{venta.tasa_mensual}} % mensual · {{venta.n_cuotas}} cuotas</p>
{{tabla_amortizacion}}`;

const promesaContado = `${comparecencia}
<p style="text-align:justify"><strong>TERCERO: Precio.</strong> El precio de la compraventa prometida es la suma de <strong>{{venta.precio}}</strong> ({{venta.precio_palabras}}), que el promitente comprador paga [en este acto, al contado, mediante transferencia electrónica, y que la promitente vendedora declara recibir a su entera satisfacción / al momento de suscribirse la escritura definitiva].</p>
${clausulasFinales(4)}`;

export const PLANTILLAS_BASE = [
  { tipo: 'carta_cobranza', nombre: 'Primer aviso — recordatorio de pago', contenido: cartaRecordatorio },
  { tipo: 'carta_cobranza', nombre: 'Segundo aviso de cobranza', contenido: cartaSegundoAviso },
  { tipo: 'carta_cobranza', nombre: 'Último aviso de cobranza', contenido: cartaUltimoAviso },
  { tipo: 'promesa', nombre: 'Promesa de compraventa — venta a crédito', contenido: promesaCredito },
  { tipo: 'promesa', nombre: 'Promesa de compraventa — venta al contado', contenido: promesaContado },
];
