import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { FileDown, Pencil, Printer, Save, Trash2 } from 'lucide-react';
import { api, useDatos } from '../api';
import { useAvisos } from '../contexto';
import { EditorTexto } from '../componentes/EditorTexto';
import { Membrete } from '../componentes/Membrete';
import { EnvioCarta } from '../componentes/EnvioCarta';
import { descargar, fechaRegistro } from '../formato';
import type { Documento } from '../tipos';
import { Boton, Campo, Carga, Casilla, Encabezado, Entrada, nombreDeArchivo, useNombreArchivo } from '../ui';
import { InsigniaTipo } from './Documentos';

const escapar = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Genera un archivo que Microsoft Word y LibreOffice abren como documento editable. */
function descargarWord(titulo: string, contenido: string, archivo: string) {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${escapar(titulo)}</title>
<style>
  @page { size: 21.59cm 27.94cm; margin: 2.5cm; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 11.5pt; line-height: 1.5; }
  h1 { font-size: 14pt; } h2 { font-size: 12.5pt; }
  table { border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 9pt; }
  th, td { border: 1px solid #999; padding: 2pt 5pt; text-align: left; }
  th { background: #eeeeee; }
  .num { text-align: right; }
  .total td { font-weight: bold; }
  .firma { text-align: center; margin-top: 48pt; }
  img.firma-digital { height: 60pt; }
  .salto-pagina { page-break-before: always; }
</style></head>
<body>${contenido}</body></html>`;
  descargar(`${nombreDeArchivo(archivo) || 'documento'}.doc`, new Blob(['﻿', html], { type: 'application/msword' }));
}

export function DocumentoPagina() {
  const { id } = useParams();
  return <Vista key={id} id={Number(id)} />;
}

function Vista({ id }: { id: number }) {
  const avisos = useAvisos();
  const navegar = useNavigate();
  const consulta = useDatos<Documento>(`/documentos/${id}`);
  // Nombre del PDF y del Word: "Cobranza - <cliente>" en las cartas, "Promesa - <cliente>" en los contratos.
  const archivo = consulta.datos
    ? consulta.datos.cliente ? `${consulta.datos.tipo === 'carta_cobranza' ? 'Cobranza' : 'Promesa'} - ${consulta.datos.cliente}` : consulta.datos.titulo
    : null;
  useNombreArchivo(archivo);
  const [editando, setEditando] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [contenido, setContenido] = useState('');
  const [membrete, setMembrete] = useState<boolean | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    try {
      await api.put(`/documentos/${id}`, { titulo, contenido });
      avisos.ok('Documento actualizado');
      setEditando(false);
      consulta.recargar();
    } catch (err) {
      avisos.error(err);
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!(await avisos.confirmar({ titulo: '¿Eliminar este documento?', mensaje: 'Esta acción no se puede deshacer.', confirmar: 'Eliminar', peligro: true }))) return;
    try {
      await api.del(`/documentos/${id}`);
      avisos.ok('Documento eliminado');
      navegar('/documentos');
    } catch (err) {
      avisos.error(err);
    }
  }

  return (
    <Carga consulta={consulta}>
      {(d) => {
        // Las cartas llevan membrete por defecto; los contratos no.
        const conMembrete = membrete ?? d.tipo === 'carta_cobranza';
        return (
          <>
            <Encabezado
              volver={{ a: '/documentos', texto: 'Documentos' }}
              titulo={editando ? 'Editar documento' : d.titulo}
              descripcion={
                <span className="flex flex-wrap items-center gap-2">
                  <InsigniaTipo tipo={d.tipo} />
                  <span>Emitido el {fechaRegistro(d.creado_en)}</span>
                  {d.cliente_id && <Link to={`/clientes/${d.cliente_id}`} className="font-medium text-marca-700 hover:underline">{d.cliente}</Link>}
                  {d.venta_id && <Link to={`/ventas/${d.venta_id}`} className="font-medium text-marca-700 hover:underline">Ver venta</Link>}
                </span>
              }
            >
              {editando ? (
                <>
                  <Boton variante="secundario" onClick={() => setEditando(false)}>Cancelar</Boton>
                  <Boton icono={Save} cargando={guardando} disabled={!titulo.trim()} onClick={guardar}>Guardar cambios</Boton>
                </>
              ) : (
                <>
                  <Boton icono={Printer} onClick={() => window.print()}>Imprimir o guardar PDF</Boton>
                  <Boton variante="secundario" icono={FileDown} onClick={() => descargarWord(d.titulo, d.contenido, archivo ?? d.titulo)}>Word</Boton>
                  <Boton variante="secundario" icono={Pencil} onClick={() => { setTitulo(d.titulo); setContenido(d.contenido); setEditando(true); }}>Editar</Boton>
                  <Boton variante="fantasma" icono={Trash2} onClick={eliminar} aria-label="Eliminar documento" />
                </>
              )}
            </Encabezado>

            {editando ? (
              <div className="space-y-3">
                <Campo etiqueta="Título (no se imprime)">
                  <Entrada maxLength={250} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
                </Campo>
                <EditorTexto valorInicial={d.contenido} alCambiar={setContenido} />
              </div>
            ) : (
              <>
                {d.tipo === 'carta_cobranza' && d.venta_id && <EnvioCarta d={d} />}
                <div className="no-imprimir mx-auto mb-3 max-w-3xl">
                  <Casilla checked={conMembrete} onChange={(e) => setMembrete(e.target.checked)} etiqueta="Imprimir con el membrete de la empresa" />
                </div>
                <div className="hoja mx-auto max-w-3xl rounded-xl border border-stone-200 bg-white px-5 py-6 shadow-sm sm:px-14 sm:py-12">
                  {conMembrete && <Membrete />}
                  {/* El contenido fue limpiado por el servidor al guardarse (solo etiquetas de formato). */}
                  <div className="documento" dangerouslySetInnerHTML={{ __html: d.contenido }} />
                </div>
              </>
            )}
          </>
        );
      }}
    </Carga>
  );
}
