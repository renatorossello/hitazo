import Link from "next/link";
import { isHostAuthenticated } from "@/lib/spotify/auth";
import Logo from "@/components/Logo";
import CreateGameButton from "@/components/CreateGameButton";

const ERRORS: Record<string, string> = {
  oauth_state: "Falló la validación de seguridad del login. Probá de nuevo.",
  token_exchange: "Spotify no devolvió el token. Revisá el Client ID/Secret y el Redirect URI.",
  access_denied: "Cancelaste el acceso en Spotify.",
};

export default async function HostPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; detail?: string }>;
}) {
  const { error, detail } = await searchParams;
  const connected = await isHostAuthenticated();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 bg-gradient-to-b from-brand-deep via-brand-dark to-brand px-6 py-16 text-center text-white">
      <div className="flex flex-col items-center gap-2">
        <Logo className="text-5xl" />
        <p className="text-sm uppercase tracking-widest text-violet-300">Host</p>
      </div>

      <p className="max-w-sm text-sm text-violet-200">
        Conectá tu Spotify <strong className="text-white">Premium</strong>. Sos el único que se loguea:
        los jugadores entran por código.
      </p>

      {error && (
        <div className="max-w-sm rounded-xl bg-red-500/20 px-4 py-2 text-sm text-red-200">
          <p>{ERRORS[error] ?? `Error: ${error}`}</p>
          {detail && <p className="mt-1 break-words font-mono text-[11px] text-red-300/80">{detail}</p>}
        </div>
      )}

      {connected ? (
        <div className="flex flex-col items-center gap-4">
          <p className="rounded-full bg-teal/20 px-4 py-1.5 text-sm font-medium text-teal">
            ● Spotify conectado
          </p>
          <CreateGameButton />
          <div className="mt-2 flex flex-col items-center gap-1.5 text-xs text-violet-300">
            <Link href="/board/test" className="underline">
              Probar audio
            </Link>
            <Link href="/admin" className="underline">
              Admin de mazos
            </Link>
            <a href="/api/auth/logout" className="underline">
              Cerrar sesión de Spotify
            </a>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-5">
          <a
            href="/api/auth/login"
            className="rounded-2xl bg-[#1DB954] px-8 py-4 text-lg font-bold text-white shadow-lg transition hover:brightness-105 active:scale-[0.98]"
          >
            Conectar con Spotify
          </a>

          <div className="flex w-full max-w-sm flex-col items-center gap-2 border-t border-white/10 pt-5">
            <p className="text-xs uppercase tracking-widest text-violet-300">o modo sin conexión</p>
            <p className="max-w-xs text-sm text-violet-200">
              ¿No podés conectar Spotify pero tenés <strong className="text-white">Premium</strong>? Creá una
              partida en <strong className="text-white">modo manual</strong>: el tema lo reproducís en tu propia
              app de Spotify (das vuelta el celu para no verlo).
            </p>
            <CreateGameButton
              mode="manual"
              label="Crear partida sin Spotify"
              className="rounded-2xl border-2 border-white/30 px-6 py-3 text-base font-bold text-white transition hover:bg-white/10 active:scale-[0.98] disabled:opacity-50"
            />
          </div>
        </div>
      )}
    </main>
  );
}
