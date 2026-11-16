import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { FileSignature, FileText, Info, Plus } from 'lucide-react';
import { useDatos } from '../api';
import { useSesion } from '../contexto';
import { fechaRegistro, plural } from '../formato';
import type { DocumentoResumen, PlantillaResumen, TipoDocumento } from '../tipos';
import { Carga, Encabezado, EnlaceBoton, Insignia, Pestanas, Selector, Tabla, Tarjeta, Vacio, td, th } from '../ui';

export const TIPOS_DOCUMENTO: Record<TipoDocumento, string> = {
  carta_cobranza: 'Carta de cobranza',
  promesa: 'Promesa de compraventa',
};

export function InsigniaTipo({ tipo }: { tipo: TipoDocumento }) {
  return tipo === 'promesa'
    ? <Insignia tono="azul" icono={FileSignature}>Promesa</Insignia>
    : <Insignia tono="ambar" icono={FileText}>Carta de cobranza</Insignia>;
}

export function Documentos() {
  const esAdmin = useSesion().puede('plantillas');
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const vista = params.get('vista') === 'plantillas' ? 'plantillas' : 'emitidos';
  const documentos = useDatos<DocumentoResumen[]>(vista === 'emitidos' ? '/documentos' : null);
  const plantillas = useDatos<PlantillaResumen[]>(vista === 'plantillas' ? '/plantillas' : null);
  const [tipo, setTipo] = useState<TipoDocumento | ''>('');

  return (
    <>
      <Encabezado titulo="Documentos" descripcion="Cartas de cobranza y promesas de compraventa confeccionadas a partir de plantillas.">
        {vista === 'emitidos'
          ? <EnlaceBoton to="/documentos/nuevo" icono={Plus}>Confeccionar documento</EnlaceBoton>
          : esAdmin && <EnlaceBoton to="/plantillas/nueva" icono={Plus}>Nueva plantilla</EnlaceBoton>}
      </Encabezado>

      <Pestanas
        activa={vista}
        alCambiar={(v) => setParams(v === 'plantillas' ? { vista: 'plantillas' } : {}, { replace: true })}
        opciones={[{ id: 'emitidos', etiqueta: 'Documentos emitidos' }, { id: 'plantillas', etiqueta: 'Plantillas' }]}
      />

      {vista === 'emitidos' && (
        <Carga consulta={documentos}>
          {(lista) => {
            const filtrados = lista.filter((d) => !tipo || d.tipo === tipo);
            return lista.length === 0 ? (
              <Tarjeta>
                <Vacio icono={FileText} titulo="Aún no se han emitido documentos" accion={<EnlaceBoton to="/documentos/nuevo" icono={Plus}>Confeccionar documento</EnlaceBoton>}>
                  Elija una venta y una plantilla: el sistema completa los datos del cliente, la parcela y la deuda, y usted revisa el texto antes de imprimirlo.
                </Vacio>
              </Tarjeta>
            ) : (
              <Tarjeta relleno={false}>
                <div className="flex flex-wrap items-center gap-2 border-b border-stone-100 p-3">
                  <Selector value={tipo} onChange={(e) => setTipo(e.target.value as TipoDocumento | '')} className="!w-auto" aria-label="Tipo de documento">
                    <option value="">Todos los tipos</option>
                    <option value="carta_cobranza">Cartas de cobranza</option>
                    <option value="promesa">Promesas de compraventa</option>
                  </Selector>
                  <span className="text-xs text-stone-500">{plural(filtrados.length, 'documento')}</span>
                </div>
                <Tabla>
                  <thead>
                    <tr>
                      <th className={th}>Documento</th>
                      <th className={`${th} hidden sm:table-cell`}>Tipo</th>
                      <th className={`${th} hidden md:table-cell`}>Emitido por</th>
                      <th className={th}>Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map((d) => (
                      <tr key={d.id} className="cursor-pointer hover:bg-stone-50" onClick={() => navegar(`/documentos/${d.id}`)}>
                        <td className={td}>
                          <Link to={`/documentos/${d.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-stone-900 hover:text-marca-700 hover:underline">{d.titulo}</Link>
                          <div className="mt-0.5 sm:hidden"><InsigniaTipo tipo={d.tipo} /></div>
                        </td>
                        <td className={`${td} hidden sm:table-cell`}><InsigniaTipo tipo={d.tipo} /></td>
                        <td className={`${td} hidden md:table-cell`}>{d.usuario ?? '—'}</td>
                        <td className={`${td} whitespace-nowrap`}>{fechaRegistro(d.creado_en)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Tabla>
              </Tarjeta>
            );
          }}
        </Carga>
      )}

      {vista === 'plantillas' && (
        <Carga consulta={plantillas}>
          {(lista) => (
            <div className="space-y-4">
              <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                <Info className="mt-0.5 size-4 shrink-0" />
                <span>
                  Las plantillas incluidas son <strong>modelos referenciales</strong>. Antes de usarlas con clientes, hágalas revisar por el abogado de la empresa
                  y ajuste su texto aquí{esAdmin ? '' : ' (las modifica el abogado o el super administrador)'}. Los textos entre corchetes [ ] deben completarse.
                </span>
              </p>
              {(Object.keys(TIPOS_DOCUMENTO) as TipoDocumento[]).map((t) => {
                const delTipo = lista.filter((p) => p.tipo === t);
                return (
                  <Tarjeta key={t} titulo={t === 'promesa' ? 'Promesas de compraventa' : 'Cartas de cobranza'} relleno={false}>
                    {delTipo.length === 0 ? <Vacio titulo="Sin plantillas de este tipo" /> : (
                      <ul className="divide-y divide-stone-100">
                        {delTipo.map((p) => (
                          <li key={p.id}>
                            <Link to={`/plantillas/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-stone-50">
                              <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-stone-900">
                                {t === 'promesa' ? <FileSignature className="size-4 shrink-0 text-stone-400" /> : <FileText className="size-4 shrink-0 text-stone-400" />}
                                <span className="truncate">{p.nombre}</span>
                              </span>
                              <span className="whitespace-nowrap text-xs text-stone-500">Actualizada el {fechaRegistro(p.actualizado_en)}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Tarjeta>
                );
              })}
            </div>
          )}
        </Carga>
      )}
    </>
  );
}
