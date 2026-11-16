import { useEffect, useRef, type ComponentType, type ReactNode } from 'react';
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Heading1, Italic, List, ListOrdered, Pilcrow, Redo2, Underline, Undo2,
} from 'lucide-react';
import type { GrupoVariables } from '../tipos';

// Editor de texto con formato básico para cartas y contratos. Trabaja sobre HTML simple;
// el servidor limpia el contenido al guardar. No es controlado: fija el contenido inicial al montarse,
// por lo que para cargar otro documento hay que cambiarle la `key`.

function Herramienta({ icono: Ico, titulo, alUsar }: { icono: ComponentType<{ className?: string }>; titulo: string; alUsar: () => void }) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      // preventDefault en mousedown: el clic no le quita la selección al texto.
      onMouseDown={(e) => e.preventDefault()}
      onClick={alUsar}
      className="rounded-md p-1.5 text-stone-600 hover:bg-stone-200 hover:text-stone-900"
    >
      <Ico className="size-4" />
    </button>
  );
}

const Separador = () => <span className="mx-1 h-5 w-px bg-stone-300" />;

export function EditorTexto({ valorInicial, alCambiar, variables, soloLectura, pie }: {
  valorInicial: string;
  alCambiar?: (html: string) => void;
  /** Datos que se pueden insertar como {{variable}} (solo en plantillas). */
  variables?: GrupoVariables[];
  soloLectura?: boolean;
  pie?: ReactNode;
}) {
  const hoja = useRef<HTMLDivElement>(null);
  const seleccion = useRef<Range | null>(null);

  useEffect(() => {
    if (hoja.current) hoja.current.innerHTML = valorInicial;
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
    } catch { /* no disponible en este navegador: se usa el separador por defecto */ }
    // Solo al montar: después el contenido lo gobierna el propio editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const avisar = () => hoja.current && alCambiar?.(hoja.current.innerHTML);

  function recordarSeleccion() {
    const s = window.getSelection();
    if (s && s.rangeCount > 0 && hoja.current?.contains(s.anchorNode)) seleccion.current = s.getRangeAt(0).cloneRange();
  }

  function ejecutar(comando: string, valor?: string) {
    hoja.current?.focus();
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(comando, false, valor);
    avisar();
  }

  function insertar(texto: string) {
    const el = hoja.current;
    if (!el) return;
    el.focus();
    const s = window.getSelection();
    if (s && seleccion.current) {
      s.removeAllRanges();
      s.addRange(seleccion.current);
    }
    document.execCommand('insertText', false, texto);
    recordarSeleccion();
    avisar();
  }

  return (
    <div className="overflow-hidden rounded-xl border border-stone-300 bg-white shadow-xs">
      {!soloLectura && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-stone-200 bg-stone-50 px-2 py-1.5" role="toolbar" aria-label="Formato del texto">
          <Herramienta icono={Bold} titulo="Negrita" alUsar={() => ejecutar('bold')} />
          <Herramienta icono={Italic} titulo="Cursiva" alUsar={() => ejecutar('italic')} />
          <Herramienta icono={Underline} titulo="Subrayado" alUsar={() => ejecutar('underline')} />
          <Separador />
          <Herramienta icono={AlignLeft} titulo="Alinear a la izquierda" alUsar={() => ejecutar('justifyLeft')} />
          <Herramienta icono={AlignCenter} titulo="Centrar" alUsar={() => ejecutar('justifyCenter')} />
          <Herramienta icono={AlignRight} titulo="Alinear a la derecha" alUsar={() => ejecutar('justifyRight')} />
          <Herramienta icono={AlignJustify} titulo="Justificar" alUsar={() => ejecutar('justifyFull')} />
          <Separador />
          <Herramienta icono={Heading1} titulo="Título" alUsar={() => ejecutar('formatBlock', 'h1')} />
          <Herramienta icono={Pilcrow} titulo="Párrafo normal" alUsar={() => ejecutar('formatBlock', 'p')} />
          <Herramienta icono={List} titulo="Lista con viñetas" alUsar={() => ejecutar('insertUnorderedList')} />
          <Herramienta icono={ListOrdered} titulo="Lista numerada" alUsar={() => ejecutar('insertOrderedList')} />
          <Separador />
          <Herramienta icono={Undo2} titulo="Deshacer" alUsar={() => ejecutar('undo')} />
          <Herramienta icono={Redo2} titulo="Rehacer" alUsar={() => ejecutar('redo')} />
          {variables && variables.length > 0 && (
            <select
              value=""
              aria-label="Insertar dato"
              onChange={(e) => e.target.value && insertar(`{{${e.target.value}}}`)}
              className="ml-auto max-w-44 rounded-md border border-stone-300 bg-white px-2 py-1 text-xs font-medium text-stone-700"
            >
              <option value="">Insertar dato…</option>
              {variables.map((g) => (
                <optgroup key={g.grupo} label={g.grupo}>
                  {g.variables.map((v) => <option key={v.clave} value={v.clave}>{v.descripcion}</option>)}
                </optgroup>
              ))}
            </select>
          )}
        </div>
      )}
      <div
        ref={hoja}
        className="documento editor-texto min-h-[50dvh] px-5 py-6 sm:px-12 sm:py-10"
        contentEditable={!soloLectura}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Texto del documento"
        onInput={avisar}
        onBlur={recordarSeleccion}
        onKeyUp={recordarSeleccion}
        onMouseUp={recordarSeleccion}
        onPaste={(e) => {
          // Se pega solo el texto: lo copiado desde Word u otras páginas trae formato que ensucia el documento.
          e.preventDefault();
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
        }}
      />
      {pie}
    </div>
  );
}
