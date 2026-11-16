// Service worker mínimo: permite instalar el sistema como aplicación y acelera la carga.
// Los datos (/api) nunca se guardan en caché: siempre se consultan al servidor.
const CACHE = 'aguafresca-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Archivos con hash en el nombre: nunca cambian, se sirven desde la caché.
  if (url.pathname.startsWith('/assets/')) {
    evento.respondWith(
      caches.match(request).then((guardado) => guardado || fetch(request).then((respuesta) => {
        if (respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(CACHE).then((c) => c.put(request, copia));
        }
        return respuesta;
      })),
    );
    return;
  }

  // Navegación: primero la red (para recibir versiones nuevas); sin conexión, la última copia.
  if (request.mode === 'navigate') {
    evento.respondWith(
      fetch(request).then((respuesta) => {
        if (respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(CACHE).then((c) => c.put('/', copia));
        }
        return respuesta;
      }).catch(() => caches.match('/').then((guardado) => guardado || Response.error())),
    );
  }
});
