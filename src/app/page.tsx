import Link from "next/link";
import Logo from "@/components/Logo";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-12 bg-gradient-to-b from-brand-deep via-brand-dark to-brand px-6 py-16 text-center text-white">
      <div className="flex flex-col items-center gap-3">
        <Logo className="text-7xl drop-shadow-lg" />
        <p className="max-w-xs text-violet-200">Adiviná el tema y ordenálo por año en tu línea de tiempo.</p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        <Link
          href="/host"
          className="rounded-2xl bg-accent px-6 py-4 text-lg font-bold text-brand-deep shadow-lg transition hover:brightness-105 active:scale-[0.98]"
        >
          Soy el host
        </Link>
        <Link
          href="/join"
          className="rounded-2xl border-2 border-white/25 px-6 py-4 text-lg font-semibold text-white transition hover:bg-white/10 active:scale-[0.98]"
        >
          Unirme a una partida
        </Link>
      </div>

      <p className="text-xs text-violet-300/70">Juego musical multijugador · con Spotify</p>
    </main>
  );
}
