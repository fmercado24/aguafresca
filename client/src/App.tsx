import type { ReactNode } from 'react';
import { Route, Routes } from 'react-router';
import { Lock } from 'lucide-react';
import { useSesion } from './contexto';
import type { Permiso } from './tipos';
import { Disposicion } from './Disposicion';
import { Cargando, EnlaceBoton, Vacio } from './ui';
import { Ingreso } from './paginas/Ingreso';
import { Panel } from './paginas/Panel';
import { Parcelas } from './paginas/Parcelas';
import { Clientes } from './paginas/Clientes';
import { FichaClientePagina } from './paginas/FichaCliente';
import { Ventas } from './paginas/Ventas';
import { VentaNueva } from './paginas/VentaNueva';
import { VentaDetallePagina } from './paginas/VentaDetalle';
import { EditorAmortizacion } from './paginas/EditorAmortizacion';
import { ReciboPagina } from './paginas/Recibo';
import { Cobranza } from './paginas/Cobranza';
import { Cotizaciones } from './paginas/Cotizaciones';
import { CotizacionFormulario } from './paginas/CotizacionFormulario';
import { CotizacionDetallePagina } from './paginas/CotizacionDetalle';
import { Visitas } from './paginas/Visitas';
import { Documentos } from './paginas/Documentos';
import { DocumentoNuevo } from './paginas/DocumentoNuevo';
import { DocumentoPagina } from './paginas/DocumentoPagina';
import { PlantillaEditor } from './paginas/PlantillaEditor';
import { Configuracion } from './paginas/Configuracion';

/** Pantallas para modificar datos: quien no tiene el permiso ve un aviso en vez del formulario. */
function ConPermiso({ permiso, children }: { permiso: Permiso; children: ReactNode }) {
  const { puede } = useSesion();
  if (puede(permiso)) return <>{children}</>;
  return (
    <Vacio icono={Lock} titulo="Su cuenta no puede realizar esta acción" accion={<EnlaceBoton variante="secundario" to="/">Volver al inicio</EnlaceBoton>}>
      Puede consultar toda la información, pero las ventas, los pagos y los clientes los registra el contador o el super administrador.
    </Vacio>
  );
}

export function App() {
  const { usuario, iniciando } = useSesion();

  if (iniciando) return <div className="flex min-h-dvh items-center justify-center"><Cargando /></div>;
  if (!usuario) return <Ingreso />;

  return (
    <Routes>
      <Route element={<Disposicion />}>
        <Route index element={<Panel />} />
        <Route path="parcelas" element={<Parcelas />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="clientes/:id" element={<FichaClientePagina />} />
        <Route path="ventas" element={<Ventas />} />
        <Route path="ventas/nueva" element={<ConPermiso permiso="operaciones"><VentaNueva /></ConPermiso>} />
        <Route path="ventas/:id" element={<VentaDetallePagina />} />
        <Route path="ventas/:id/tabla" element={<EditorAmortizacion />} />
        <Route path="pagos/:id" element={<ReciboPagina />} />
        <Route path="cobranza" element={<Cobranza />} />
        <Route path="cotizaciones" element={<Cotizaciones />} />
        <Route path="cotizaciones/nueva" element={<ConPermiso permiso="cotizaciones"><CotizacionFormulario /></ConPermiso>} />
        <Route path="cotizaciones/:id" element={<CotizacionDetallePagina />} />
        <Route path="cotizaciones/:id/editar" element={<ConPermiso permiso="cotizaciones"><CotizacionFormulario /></ConPermiso>} />
        <Route path="visitas" element={<Visitas />} />
        <Route path="documentos" element={<Documentos />} />
        <Route path="documentos/nuevo" element={<DocumentoNuevo />} />
        <Route path="documentos/:id" element={<DocumentoPagina />} />
        <Route path="plantillas/nueva" element={<PlantillaEditor />} />
        <Route path="plantillas/:id" element={<PlantillaEditor />} />
        <Route path="configuracion" element={<Configuracion />} />
        <Route
          path="*"
          element={<Vacio titulo="Página no encontrada" accion={<EnlaceBoton to="/" variante="secundario">Volver al inicio</EnlaceBoton>} />}
        />
      </Route>
    </Routes>
  );
}
