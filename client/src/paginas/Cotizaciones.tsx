import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Calculator, Plus } from 'lucide-react';
import { useDatos } from '../api';
import { useSesion } from '../contexto';
import { fecha, pesos, plural } from '../formato';
import type { CotizacionResumen } from '../tipos';
import { Buscador, Carga, Encabezado, EnlaceBoton, InsigniaCotizacion, Tabla, Tarjeta, Vacio, num, td, th } from '../ui';

export function Cotizaciones() {
  const opera = useSesion().puede('cotizaciones');
  const navegar = useNavigate();
  const consulta = useDatos<CotizacionResumen[]>('/cotizaciones');
  const [busqueda, setBusqueda] = useState('');
  const cotizaciones = consulta.datos ?? [];

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return cotizaciones.filter((c) => !q || c.contacto_nombre.toLowerCase().includes(q) || c.parcela.toLowerCase() === q || String(c.id) === q);
  }, [cotizaciones, busqueda]);

  const vigentes = cotizaciones.filter((c) => c.estado === 'vigente' && !c.vencida).length;

  return (
    <>
      <Encabezado titulo="Cotizaciones" descripcion={consulta.datos ? `${plural(cotizaciones.length, 'cotización', 'cotizaciones')} · ${vigentes} vigentes` : undefined}>
        {opera && <EnlaceBoton to="/cotizaciones/nueva" icono={Plus}>Nueva cotización</EnlaceBoton>}
      </Encabezado>

      <Carga consulta={consulta}>
        {() =>
          cotizaciones.length === 0 ? (
            <Tarjeta>
              <Vacio icono={Calculator} titulo="Aún no hay cotizaciones" accion={opera && <EnlaceBoton to="/cotizaciones/nueva" icono={Plus}>Crear cotización</EnlaceBoton>}>
                Simule el crédito de una parcela y entregue al interesado una cotización impresa o en PDF.
              </Vacio>
            </Tarjeta>
          ) : (
            <Tarjeta relleno={false}>
              <div className="border-b border-stone-100 p-3">
                <Buscador valor={busqueda} alCambiar={setBusqueda} placeholder="Buscar por interesado, número o parcela" className="max-w-md" />
              </div>
              {filtradas.length === 0 ? <Vacio titulo="Ninguna cotización coincide con la búsqueda" /> : (
                <Tabla>
                  <thead>
                    <tr>
                      <th className={th}>N°</th>
                      <th className={th}>Interesado</th>
                      <th className={`${th} hidden sm:table-cell`}>Parcela</th>
                      <th className={`${th} ${num}`}>Precio</th>
                      <th className={`${th} hidden md:table-cell`}>Forma de pago</th>
                      <th className={`${th} hidden lg:table-cell`}>Válida hasta</th>
                      <th className={th}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtradas.map((c) => (
                      <tr key={c.id} className="cursor-pointer hover:bg-stone-50" onClick={() => navegar(`/cotizaciones/${c.id}`)}>
                        <td className={`${td} tabular-nums`}>{c.id}</td>
                        <td className={td}>
                          <Link to={`/cotizaciones/${c.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-stone-900 hover:text-marca-700 hover:underline">{c.contacto_nombre}</Link>
                          <div className="text-xs text-stone-500">{fecha(c.fecha)}<span className="sm:hidden"> · Parcela {c.parcela}</span></div>
                        </td>
                        <td className={`${td} hidden sm:table-cell`}>{c.parcela}</td>
                        <td className={`${td} ${num} font-medium`}>{pesos(c.precio)}</td>
                        <td className={`${td} hidden whitespace-nowrap md:table-cell`}>
                          {c.n_cuotas > 0 ? `Pie ${pesos(c.pie)} + ${c.n_cuotas} × ${pesos(c.valor_cuota)}` : 'Contado'}
                        </td>
                        <td className={`${td} hidden whitespace-nowrap lg:table-cell`}>{fecha(c.valida_hasta)}</td>
                        <td className={td}><InsigniaCotizacion estado={c.estado} vencida={c.vencida} /></td>
                      </tr>
                    ))}
                  </tbody>
                </Tabla>
              )}
            </Tarjeta>
          )
        }
      </Carga>
    </>
  );
}
