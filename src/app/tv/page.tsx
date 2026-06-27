"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";

/**
 * /tv — entrada para la TELE. Pensada para tipear con el control remoto: ponés
 * la URL corta (…/tv) una vez y después solo el código de 6 letras de la sala.
 */
export default function TvEntryPage() {
  const router = useRouter();
  const [code, setCode] = useState("");

  function go(e: React.FormEvent) {
    e.preventDefault();
    if (code.length === 6) router.push(`/tv/${code.toUpperCase()}`);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 bg-gradient-to-br from-brand-deep via-brand-dark to-brand px-6 text-center text-white">
      <Logo className="text-6xl" />
      <div className="flex flex-col items-center gap-3">
        <p className="text-lg uppercase tracking-[0.3em] text-violet-300">Modo TV</p>
        <p className="max-w-md text-violet-200">Poné el código de la sala (lo ves en el celu del host) y dale Mostrar.</p>
      </div>

      <form onSubmit={go} className="flex w-full max-w-md flex-col items-center gap-5">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
          maxLength={6}
          autoFocus
          autoCapitalize="characters"
          placeholder="ABC123"
          className="w-full rounded-2xl border-2 border-white/20 bg-white/10 px-6 py-6 text-center font-mono text-6xl font-bold tracking-[0.3em] text-white placeholder-white/25 outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={code.length !== 6}
          className="rounded-2xl bg-accent px-10 py-4 text-xl font-bold text-brand-deep shadow-lg transition hover:brightness-105 active:scale-[0.98] disabled:opacity-40"
        >
          Mostrar en la tele
        </button>
      </form>
    </main>
  );
}
