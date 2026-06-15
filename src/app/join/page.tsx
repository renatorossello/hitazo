"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { playerStorageKey } from "@/lib/game/player";

export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [teamName, setTeamName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill del código si vino del QR (?code=...). Leemos de la URL en el cliente
  // para no forzar un Suspense boundary con useSearchParams.
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
      const data = await res.json();
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
      // Identidad del player en el celular (sin login).
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
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold">Unirse a Hitazo</h1>
      <form onSubmit={join} className="flex w-full max-w-xs flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Código de sala
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            autoCapitalize="characters"
            className="rounded-md border px-3 py-2 text-center font-mono text-2xl tracking-[0.3em]"
            placeholder="ABC123"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Nombre del equipo
          <input
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            maxLength={40}
            className="rounded-md border px-3 py-2"
            placeholder="Los Pibes"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading || !code || !teamName}
          className="rounded-full bg-black px-6 py-3 font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
