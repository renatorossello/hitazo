"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { playerStorageKey } from "@/lib/game/player";

export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [teamName, setTeamName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("code");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill client-only (?code del QR)
    if (fromUrl) setCode(fromUrl.toUpperCase());
  }, []);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/games/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: code, teamName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msgs: Record<string, string> = {
          game_not_found: "No existe una sala con ese código.",
          game_not_in_lobby: "Esa partida ya empezó.",
          missing_fields: "Completá el código y el nombre del equipo.",
          name_too_long: "El nombre es muy largo.",
        };
        setError(msgs[data.error] ?? "No se pudo unir. Probá de nuevo.");
        return;
      }
      localStorage.setItem(
        playerStorageKey(data.roomCode),
        JSON.stringify({ teamId: data.teamId, name: data.teamName, joinOrder: data.joinOrder })
      );
      router.push(`/play/${data.roomCode}`);
    } catch {
      setError("Error de red. Probá de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 bg-gradient-to-b from-brand-deep via-brand-dark to-brand px-6 py-12 text-white">
      <Logo className="text-5xl" />

      <form onSubmit={join} className="flex w-full max-w-xs flex-col gap-5">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-violet-200">
          Código de sala
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            autoCapitalize="characters"
            inputMode="text"
            className="rounded-2xl border-2 border-white/20 bg-white/10 px-4 py-4 text-center font-mono text-4xl font-bold tracking-[0.3em] text-white placeholder-white/30 outline-none focus:border-accent"
            placeholder="ABC123"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-violet-200">
          Nombre del equipo
          <input
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            maxLength={40}
            className="rounded-2xl border-2 border-white/20 bg-white/10 px-4 py-4 text-lg text-white placeholder-white/30 outline-none focus:border-accent"
            placeholder="Los Pibes"
          />
        </label>
        {error && <p className="rounded-xl bg-red-500/20 px-3 py-2 text-sm text-red-200">{error}</p>}
        <button
          type="submit"
          disabled={loading || !code || !teamName}
          className="rounded-2xl bg-accent px-6 py-4 text-lg font-bold text-brand-deep shadow-lg transition hover:brightness-105 active:scale-[0.98] disabled:opacity-40"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
