import { useState, type FormEvent } from 'react';
import { CircleAlert } from 'lucide-react';
import { mensajeDe } from '../api';
import { useSesion } from '../contexto';
import { Boton, Campo, Entrada } from '../ui';

export function Ingreso() {
  const { ingresar } = useSesion();
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await ingresar(nombreUsuario.trim(), password);
    } catch (err) {
      setError(mensajeDe(err));
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-marca-800 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/logo.png" alt="Fundo Entre Ríos" className="mb-4 w-64 rounded-2xl bg-white px-3 py-2 shadow-lg" />
          <h1 className="text-xl font-semibold text-white">Gestión Fundo Entre Ríos</h1>
          <p className="text-sm text-marca-200">Agua Fresca SpA · Gestión de ventas y clientes</p>
        </div>
        <form onSubmit={enviar} className="space-y-4 rounded-2xl bg-white p-6 shadow-xl">
          <Campo etiqueta="Usuario">
            <Entrada
              type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              required autoFocus value={nombreUsuario} onChange={(e) => setNombreUsuario(e.target.value)}
            />
          </Campo>
          <Campo etiqueta="Contraseña">
            <Entrada type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Campo>
          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          )}
          <Boton type="submit" cargando={enviando} className="w-full">Ingresar</Boton>
        </form>
      </div>
    </div>
  );
}
