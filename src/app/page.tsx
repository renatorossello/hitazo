import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8 text-center">
      <div>
        <h1 className="text-4xl font-bold">Hitazo</h1>
        <p className="mt-2 text-sm text-gray-500">
          Adiviná el tema y ordenálo por año en tu línea de tiempo.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/host"
          className="rounded-full bg-black px-6 py-3 font-semibold text-white hover:bg-gray-800"
        >
          Soy el host
        </Link>
        <Link
          href="/join"
          className="rounded-full border px-6 py-3 font-semibold hover:bg-gray-100"
        >
          Unirme a una partida
        </Link>
      </div>

      <p className="text-xs text-gray-400">MVP en construcción · Fase 1: audio del host</p>
    </main>
  );
}
