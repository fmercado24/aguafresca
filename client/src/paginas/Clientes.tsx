import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { CircleCheck, Download, TriangleAlert, UserPlus, Users } from 'lucide-react';
import { useDatos } from '../api';
import { FormularioCliente } from '../componentes/FormularioCliente';
import { descargarCsv, formatearRut, pesos, plural } from '../formato';
import type { ClienteResumen } from '../tipos';
import { Boton, Buscador, Carga, Encabezado, Insignia, Tabla, Tarjeta, Vacio, num, td, th } from '../ui';

type Filtro = 'todos' | 'mora' | 'credito';

export function Situacion({ c }: { c: Pick<ClienteResumen, 'saldo' | 'atrasado' | 'n_atrasadas' | 'n_ventas'> }) {
  if (c.n_atrasadas > 0) return <Insignia tono="rojo" icono={TriangleAlert}>{plural(c.n_atrasadas, 'cuota atrasada', 'cuotas atrasadas')}</Insignia>;
  if (c.saldo > 0) return <Insignia tono="azul" icono={CircleCheck}>Al día</Insignia>;
  if (c.n_ventas > 0) return <Insignia tono="verde" icono={CircleCheck}>Sin deuda</Insignia>;
  return <Insignia>Sin compras</Insignia>;
}

export function Clientes() {
  const navegar = useNavigate();
  const consulta = useDatos<ClienteResumen[]>('/clientes');
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [creando, setCreando] = useState(false);

  const clientes = consulta.datos ?? [];
  const enMora = clientes.filter((c) => c.n_atrasadas > 0).length;

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const qRut = q.replace(/[^0-9k]/g, '');
    return clientes.filter((c) =>
      (filtro === 'todos' || (filtro === 'mora' ? c.n_atrasadas > 0 : c.saldo > 0)) &&
      (!q || c.nombre.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || (c.parcelas ?? '').split(', ').includes(q) ||
        (qRut.length >= 3 && c.rut.replace('-', '').toLowerCase().includes(qRut))));
  }, [clientes, busqueda, filtro]);

  const opcion = (id: Filtro, etiqueta: string) => (
    <button
      onClick={() => setFiltro(id)}
      aria-pressed={filtro === id}
      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${filtro === id ? 'border-stone-800 bg-stone-800 text-white' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'}`}
    >
      {etiqueta}
    </button>
  );

  return (
    <>
      <Encabezado titulo="Clientes" descripcion={consulta.datos ? `${plural(clientes.length, 'cliente')} · ${enMora} con cuotas atrasadas` : undefined}>
        <Boton icono={UserPlus} onClick={() => setCreando(true)}>Nuevo cliente</Boton>
      </Encabezado>

      <Carga consulta={consulta}>
        {() =>
          clientes.length === 0 ? (
            <Tarjeta>
              <Vacio icono={Users} titulo="Aún no hay clientes" accion={<Boton icono={UserPlus} onClick={() => setCreando(true)}>Crear el primer cliente</Boton>}>
                Registre a los compradores con sus antecedentes para llevar su ficha, sus cuotas y la cobranza.
              </Vacio>
            </Tarjeta>
          ) : (
            <Tarjeta relleno={false}>
              <div className="flex flex-wrap items-center gap-2 border-b border-stone-100 p-3">
                <Buscador valor={busqueda} alCambiar={setBusqueda} placeholder="Buscar por nombre, RUT o parcela" className="min-w-56 flex-1" />
                <div className="flex flex-wrap gap-1.5">
                  {opcion('todos', 'Todos')}
                  {opcion('credito', 'Con crédito vigente')}
                  {opcion('mora', 'Con atraso')}
                </div>
                <Boton
                  chico variante="secundario" icono={Download}
                  onClick={() => descargarCsv('clientes.csv', ['Nombre', 'RUT', 'Teléfono', 'Correo', 'Comuna', 'Parcelas', 'Saldo por pagar', 'Monto atrasado', 'Cuotas atrasadas'],
                    filtrados.map((c) => [c.nombre, formatearRut(c.rut), c.telefono, c.email, c.comuna, c.parcelas, c.saldo, c.atrasado, c.n_atrasadas]))}
                >
                  Excel
                </Boton>
              </div>
              {filtrados.length === 0 ? (
                <Vacio titulo="Ningún cliente coincide con la búsqueda" />
              ) : (
                <Tabla>
                  <thead>
                    <tr>
                      <th className={th}>Cliente</th>
                      <th className={`${th} hidden md:table-cell`}>Teléfono</th>
                      <th className={`${th} hidden sm:table-cell`}>Parcelas</th>
                      <th className={`${th} ${num} hidden sm:table-cell`}>Saldo por pagar</th>
                      <th className={`${th} ${num}`}>Atrasado</th>
                      <th className={th}>Situación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map((c) => (
                      <tr key={c.id} className="cursor-pointer hover:bg-stone-50" onClick={() => navegar(`/clientes/${c.id}`)}>
                        <td className={td}>
                          <Link to={`/clientes/${c.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-stone-900 hover:text-marca-700 hover:underline">{c.nombre}</Link>
                          <div className="text-xs text-stone-500">{c.rut ? formatearRut(c.rut) : 'Sin RUT'}</div>
                        </td>
                        <td className={`${td} hidden whitespace-nowrap md:table-cell`}>{c.telefono || '—'}</td>
                        <td className={`${td} hidden sm:table-cell`}>{c.parcelas || '—'}</td>
                        <td className={`${td} ${num} hidden sm:table-cell`}>{c.saldo > 0 ? pesos(c.saldo) : '—'}</td>
                        <td className={`${td} ${num} font-medium`}>{c.atrasado > 0 ? pesos(c.atrasado) : '—'}</td>
                        <td className={td}><Situacion c={c} /></td>
                      </tr>
                    ))}
                  </tbody>
                </Tabla>
              )}
            </Tarjeta>
          )
        }
      </Carga>

      {creando && <FormularioCliente alCerrar={() => setCreando(false)} alGuardar={(id) => navegar(`/clientes/${id}`)} />}
    </>
  );
}
