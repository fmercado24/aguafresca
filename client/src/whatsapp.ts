// Enlaces para abrir una conversación de WhatsApp.
//
// El enlace normal (wa.me) lo abre la aplicación que el celular tenga como predeterminada, que suele ser el
// WhatsApp personal. En Android se apunta directo a WhatsApp Business, que es el de la empresa; si no está
// instalado, el navegador usa el enlace normal. En iPhone y en el computador se usa siempre el enlace normal.

const PAQUETE_BUSINESS = 'com.whatsapp.w4b';

const esAndroid = () => typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

/** Enlace a la conversación con ese número y, si se indica, con el mensaje ya escrito. Sin número, WhatsApp pide elegir el contacto. */
export function enlaceWhatsApp(telefono: string | null | undefined, texto?: string): string {
  const numero = (telefono ?? '').replace(/\D/g, '');
  return paraEsteEquipo(`https://wa.me/${numero}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`);
}

/** Adapta un enlace wa.me (por ejemplo, el que arma el servidor para enviar una carta) al equipo en uso. */
export function paraEsteEquipo(enlace: string): string {
  if (!esAndroid()) return enlace;
  let url: URL;
  try {
    url = new URL(enlace);
  } catch {
    return enlace;
  }
  if (url.hostname !== 'wa.me') return enlace;
  const numero = url.pathname.replace(/\D/g, '');
  const texto = url.searchParams.get('text');
  const datos = [numero && `phone=${numero}`, texto && `text=${encodeURIComponent(texto)}`].filter(Boolean).join('&');
  return `intent://send${datos ? `?${datos}` : ''}#Intent;scheme=whatsapp;package=${PAQUETE_BUSINESS};S.browser_fallback_url=${encodeURIComponent(enlace)};end`;
}
