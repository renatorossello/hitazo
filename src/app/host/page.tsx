import Link from "next/link";
import { isHostAuthenticated } from "@/lib/spotify/auth";

const ERRORS: Record<string, string> = {
  oauth_state: "Falló la validación de seguridad del login. Probá de nuevo.",
  token_exchange: "Spotify no devolvió el token. Revisá el Client ID/Secret y el Redirect URI.",
  access_denied: "Cancelaste el acceso en Spotify.",
};

export default async function HostPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const connected = await isHostAuthenticated();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-bold">Hitazo — Host</h1>
      <p className="max-w-md text-sm text-gray-500">
        Conectá tu cuenta de Spotify <strong>Premium</strong>. Sos el único que se loguea:
        los jugadores entran por código, sin tocar Spotify.
      </p>

      {error && (
        <p className="max-w-md rounded-md bg-red-100 px-4 py-2 text-sm text-red-700">
          {ERRORS[error] ?? `Error: ${error}`}
        </p>
      )}

      {connected ? (
        <div className="flex flex-col items-center gap-3">
          <p className="rounded-md bg-green-100 px-4 py-2 text-sm text-green-700">
            Sesión de Spotify activa.
          </p>
          <Link
            href="/board"
            className="rounded-full bg-black px-6 py-3 font-semibold text-white hover:bg-gray-800"
          >
            Ir al board
          </Link>
          <a href="/api/auth/logout" className="text-xs text-gray-400 underline">
            Cerrar sesión de Spotify
          </a>
        </div>
      ) : (
        <a
          href="/api/auth/login"
          className="rounded-full bg-[#1DB954] px-6 py-3 font-semibold text-white hover:bg-[#1ed760]"
        >
          Conectar con Spotify
        </a>
      )}
    </main>
  );
}
